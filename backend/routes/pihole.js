const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { NodeSSH } = require('node-ssh');
const { buildConnectOptions } = require('../utils/sshSecurity');
const { REDACTED, isValidHost, isValidUsername, parsePort, parsePiholeAddress } = require('../utils/validate');
const { loadConfigOrEmpty, getInstance, isValidInstanceId } = require('../utils/configStore');
const PiHoleWebService = require('../services/PiHoleWebService');
const router = express.Router();

/**
 * Connect over SSH with a password and check that pihole-FTL is installed.
 * Returns { success, message } or { success: false, error }.
 */
async function testSshConnection({ host, username, password, port }, { dataDir, logger }) {
  if (!username || !password) {
    return { success: false, error: 'Username and password are required for SSH connection' };
  }

  if (!isValidHost(host)) {
    return { success: false, error: 'SSH connections need a hostname or IP address, not a URL' };
  }

  if (!isValidUsername(username)) {
    return { success: false, error: 'Invalid username' };
  }

  const ssh = new NodeSSH();

  try {
    logger.info('Testing SSH connection', { host, username, port });

    await ssh.connect(buildConnectOptions({
      dataDir,
      host,
      port,
      username,
      logger,
      auth: { password },
      readyTimeout: 10000
    }));

    // Pi-hole v6 installs the binary outside some users' default PATH, so
    // check the usual locations too.
    const result = await ssh.execCommand(
      'command -v pihole-FTL || ls /usr/bin/pihole-FTL /usr/local/bin/pihole-FTL 2>/dev/null'
    );

    if (result.code !== 0 || !result.stdout.trim()) {
      return { success: false, error: 'SSH works, but pihole-FTL was not found on that server' };
    }

    // Creating a Teleporter archive reads /etc/pihole/pihole.toml (0640
    // pihole:pihole). Catch a user who cannot read it now, not at 3 AM.
    const access = await ssh.execCommand(
      'test -r /etc/pihole/pihole.toml || sudo -n pihole-FTL -v >/dev/null 2>&1'
    );

    if (access.code !== 0) {
      return {
        success: false,
        error: 'SSH works, but this user cannot read Pi-hole\'s configuration. Connect as root, add the user to the "pihole" group, or allow it to run "sudo pihole-FTL" without a password.'
      };
    }

    return { success: true, message: 'SSH connection successful' };
  } catch (error) {
    logger.error('SSH connection test failed', { host, error: error.message });
    return { success: false, error: `SSH connection failed: ${error.message}` };
  } finally {
    try {
      ssh.dispose();
    } catch (e) {
      // Ignore disposal errors
    }
  }
}

/**
 * The settings screen only ever sees saved passwords as REDACTED. To let it
 * re-test a saved Pi-hole, swap the saved secret back in -- but only when the
 * request still points at the very same host, ports and user. Otherwise anyone
 * able to call this endpoint could have the stored password sent to a host of
 * their choosing.
 */
async function fillSavedSecrets(body, dataDir) {
  const wantsSaved = body.webPassword === REDACTED || body.password === REDACTED;
  if (!wantsSaved) return { body };

  if (typeof body.instanceId !== 'string' || !isValidInstanceId(body.instanceId)) {
    return { error: 'Enter the password again to test this connection' };
  }
  const saved = getInstance(await loadConfigOrEmpty(dataDir), body.instanceId);
  if (!saved) {
    return { error: 'Enter the password again to test this connection' };
  }

  const effective = (value) => {
    const address = parsePiholeAddress(value.host);
    if (!address) return null;
    return {
      hostname: address.hostname.toLowerCase(),
      webPort: Number(address.port || value.webPort || 80),
      port: Number(value.port || 22),
      username: value.username || ''
    };
  };
  const a = effective(body);
  const b = effective(saved);
  const same = a && b && a.hostname === b.hostname && a.webPort === b.webPort &&
    a.port === b.port && a.username === b.username;
  if (!same) {
    return { error: 'The address or user changed since it was saved; enter the password again to test it' };
  }

  return {
    body: {
      ...body,
      webPassword: body.webPassword === REDACTED ? saved.webPassword : body.webPassword,
      password: body.password === REDACTED ? saved.password : body.password
    }
  };
}

// Test Pi-hole connection
router.post('/test-connection', async (req, res) => {
  const filled = await fillSavedSecrets(req.body || {}, req.app.locals.DATA_DIR);
  if (filled.error) {
    return res.json({ success: false, error: filled.error });
  }

  const {
    host,
    username,
    password,
    port = 22,
    connectionMethod = 'ssh',
    webPort = 80,
    useHttps = false,
    allowInsecureTls = false,
    webPassword
  } = filled.body;

  if (!host) {
    return res.status(400).json({
      success: false,
      error: 'Host is required'
    });
  }

  // The web methods accept the admin page URL people copy from the browser
  // ("https://pi.hole/admin/"); the SSH path requires a bare hostname or IP.
  const address = parsePiholeAddress(host);

  if (!address) {
    return res.status(400).json({
      success: false,
      error: 'Invalid host: expected a hostname, IP address or http(s)://host[:port][/admin/] URL'
    });
  }

  const sshPort = parsePort(port, 22);

  if (sshPort === null) {
    return res.status(400).json({
      success: false,
      error: 'Invalid port: expected an integer between 1 and 65535'
    });
  }

  const logger = req.app.locals.logger;
  const context = { dataDir: req.app.locals.DATA_DIR, logger };
  const webConfig = {
    host,
    webPort,
    useHttps,
    allowInsecureTls: allowInsecureTls === true,
    webPassword
  };

  if (connectionMethod === 'web') {
    logger.info('Testing web connection', { host });
    const result = await new PiHoleWebService(logger).testWebConnection(webConfig);

    return res.json(result.success
      ? { success: true, message: result.message, method: 'web', version: result.version, sshRequired: false }
      : { success: false, error: result.error, method: 'web' });
  }

  if (connectionMethod === 'hybrid') {
    logger.info('Testing hybrid connection', { host });

    // Both halves are checked, so a backup that later falls back to SSH does
    // not fail on credentials nobody tested.
    const [web, ssh] = await Promise.all([
      new PiHoleWebService(logger).testWebConnection(webConfig),
      testSshConnection({ host: address.hostname, username, password, port: sshPort }, context)
    ]);

    if (web.success && ssh.success) {
      return res.json({ success: true, message: `${web.message}; SSH OK`, method: 'hybrid', version: web.version });
    }

    const problems = [];
    if (!web.success) problems.push(`Web API: ${web.error}`);
    if (!ssh.success) problems.push(`SSH: ${ssh.error}`);

    return res.json({ success: false, error: problems.join(' — '), method: 'hybrid', details: { web, ssh } });
  }

  if (address.scheme) {
    return res.status(400).json({
      success: false,
      error: 'SSH connections need a hostname or IP address, not a URL'
    });
  }

  const ssh = await testSshConnection({ host, username, password, port: sshPort }, context);

  if (!ssh.success && /required|Invalid username/.test(ssh.error)) {
    return res.status(400).json({ ...ssh, method: 'ssh' });
  }

  return res.json({ ...ssh, method: 'ssh' });
});

// Get Pi-hole status
router.get('/status', async (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');
    
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }
    
    const config = await fs.readJson(configPath);
    
    if (!config.pihole) {
      return res.status(400).json({ success: false, error: 'Pi-hole not configured' });
    }

    const ssh = new NodeSSH();
    
    try {
      if (!isValidHost(config.pihole.host)) {
        return res.status(400).json({ success: false, error: 'Stored Pi-hole host is invalid' });
      }

      const statusPort = parsePort(config.pihole.port, 22);

      if (statusPort === null) {
        return res.status(400).json({ success: false, error: 'Stored Pi-hole port is invalid' });
      }

      await ssh.connect(buildConnectOptions({
        dataDir: req.app.locals.DATA_DIR,
        host: config.pihole.host,
        port: statusPort,
        username: config.pihole.username,
        logger: req.app.locals.logger,
        auth: { password: config.pihole.password },
        readyTimeout: 5000
      }));

      // Get Pi-hole status
      const statusResult = await ssh.execCommand('pihole status');
      const versionResult = await ssh.execCommand('pihole version');
      
      await ssh.dispose();
      
      res.json({
        success: true,
        status: statusResult.stdout,
        version: versionResult.stdout,
        connected: true
      });
      
    } catch (error) {
      if (ssh) {
        try {
          await ssh.dispose();
        } catch (e) {
          // Ignore disposal errors
        }
      }
      
      res.json({
        success: false,
        connected: false,
        error: error.message
      });
    }
    
  } catch (error) {
    req.app.locals.logger.error('Error getting Pi-hole status', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
