const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const net = require('net');
const { execFileSync } = require('child_process');
const { NodeSSH } = require('node-ssh');

const { buildConnectOptions } = require('../utils/sshSecurity');
const { isValidHost, isValidUsername, parsePort } = require('../utils/validate');

const router = express.Router();

const SSH_DIR = '/root/.ssh';
const PRIVATE_KEY_PATH = path.join(SSH_DIR, 'id_rsa');
const PUBLIC_KEY_PATH = path.join(SSH_DIR, 'id_rsa.pub');

/**
 * Validate the connection parameters every SSH route takes.
 *
 * `host` in particular reaches child processes and SSH connect options, so it is
 * checked against a strict hostname/IP grammar rather than escaped. Returns
 * either { error } or the normalised { host, username, password, port }.
 */
function parseConnectionParams(body, { requirePassword = true } = {}) {
  const { host, username, password } = body;

  if (!host || !username || (requirePassword && !password)) {
    return { error: 'Missing required connection parameters' };
  }

  if (!isValidHost(host)) {
    return { error: 'Invalid host: expected a hostname or IP address' };
  }

  if (!isValidUsername(username)) {
    return { error: 'Invalid username' };
  }

  const port = parsePort(body.port, 22);

  if (port === null) {
    return { error: 'Invalid port: expected an integer between 1 and 65535' };
  }

  return { host: host.trim(), username, password, port };
}

/**
 * Open a TCP connection to check reachability, replacing the previous
 * `ping` subprocess. No shell is involved and no external binary is required.
 */
function checkTcpReachable(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ success: true }));
    socket.once('timeout', () => finish({ success: false, error: 'Connection timed out' }));
    socket.once('error', (error) => finish({ success: false, error: error.message }));
    socket.connect(port, host);
  });
}

// Setup SSH key
router.post('/setup-key', async (req, res) => {
  const params = parseConnectionParams(req.body);

  if (params.error) {
    return res.status(400).json({ success: false, error: params.error });
  }

  const { host, username, password, port } = params;

  try {
    req.app.locals.logger.info('Setting up SSH key', { host, username });

    await fs.ensureDir(SSH_DIR);
    await fs.chmod(SSH_DIR, 0o700);

    // Generate SSH key pair if it doesn't exist
    if (!await fs.pathExists(PRIVATE_KEY_PATH)) {
      req.app.locals.logger.info('Generating SSH key pair');

      try {
        // execFileSync passes arguments as an array directly to the binary, so
        // no shell parses them. The comment is a fixed string rather than a
        // command substitution for the same reason.
        execFileSync('ssh-keygen', [
          '-t', 'rsa',
          '-b', '4096',
          '-f', PRIVATE_KEY_PATH,
          '-N', '',
          '-C', 'pihole-backup@piholevault'
        ], { stdio: 'pipe' });

        await fs.chmod(PRIVATE_KEY_PATH, 0o600);
        await fs.chmod(PUBLIC_KEY_PATH, 0o644);

        req.app.locals.logger.info('SSH key pair generated successfully');
      } catch (error) {
        req.app.locals.logger.error('Failed to generate SSH key', { error: error.message });
        return res.status(500).json({
          success: false,
          error: 'Failed to generate SSH key'
        });
      }
    }

    const publicKey = (await fs.readFile(PUBLIC_KEY_PATH, 'utf8')).trim();

    const ssh = new NodeSSH();

    try {
      req.app.locals.logger.info('Attempting SSH connection', { host, port, username });

      await ssh.connect(buildConnectOptions({
        dataDir: req.app.locals.DATA_DIR,
        host,
        port,
        username,
        logger: req.app.locals.logger,
        auth: { password },
        readyTimeout: 15000
      }));

      req.app.locals.logger.info('SSH connection successful');

      const createDirResult = await ssh.execCommand('mkdir -p ~/.ssh && chmod 700 ~/.ssh');

      if (createDirResult.code !== 0) {
        await ssh.dispose();
        req.app.locals.logger.error('Failed to create SSH directory', {
          stderr: createDirResult.stderr
        });
        return res.status(502).json({
          success: false,
          error: 'Failed to create SSH directory on the Pi-hole host'
        });
      }

      // Append the key over stdin rather than interpolating it into a remote
      // shell command. Nothing derived from the key is parsed as shell syntax.
      const appendResult = await ssh.execCommand(
        'cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys',
        { stdin: publicKey + '\n' }
      );

      if (appendResult.code !== 0) {
        await ssh.dispose();
        req.app.locals.logger.error('Failed to add SSH key', { stderr: appendResult.stderr });
        return res.status(502).json({
          success: false,
          error: 'Failed to add the SSH key to authorized_keys'
        });
      }

      req.app.locals.logger.info('SSH key added successfully');
      await ssh.dispose();

      // Verify that key-based authentication now works.
      req.app.locals.logger.info('Testing SSH key authentication');
      const testSSH = new NodeSSH();

      try {
        await testSSH.connect(buildConnectOptions({
          dataDir: req.app.locals.DATA_DIR,
          host,
          port,
          username,
          logger: req.app.locals.logger,
          auth: { privateKey: await fs.readFile(PRIVATE_KEY_PATH, 'utf8') },
          readyTimeout: 20000
        }));

        req.app.locals.logger.info('SSH key authentication test successful');
        await testSSH.dispose();

        const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');

        if (await fs.pathExists(configPath)) {
          const config = await fs.readJson(configPath);
          config.sshKeyDeployed = true;
          config.sshKeyPath = PRIVATE_KEY_PATH;
          config.updatedAt = new Date().toISOString();
          await fs.writeJson(configPath, config, { spaces: 2 });
        }

        req.app.locals.logger.info('SSH key deployed and tested successfully', { host });
        res.json({ success: true, message: 'SSH key deployed successfully' });

      } catch (keyTestError) {
        req.app.locals.logger.error('SSH key test failed', { host, error: keyTestError.message });
        res.status(502).json({
          success: false,
          error: `SSH key deployment failed: ${keyTestError.message}`
        });
      }

    } catch (error) {
      try {
        await ssh.dispose();
      } catch (disposeError) {
        // Ignore disposal errors
      }

      req.app.locals.logger.error('SSH connection failed during key deployment', {
        host,
        error: error.message
      });

      res.status(502).json({
        success: false,
        error: `SSH connection failed: ${error.message}`
      });
    }

  } catch (error) {
    req.app.locals.logger.error('Error setting up SSH key', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to set up SSH key' });
  }
});

// Debug SSH connectivity
router.post('/debug', async (req, res) => {
  const params = parseConnectionParams(req.body);

  if (params.error) {
    return res.status(400).json({ success: false, error: params.error });
  }

  const { host, username, password, port } = params;

  const debug = {
    timestamp: new Date().toISOString(),
    host,
    port,
    username,
    tests: {}
  };

  try {
    // Reachability. Previously this shelled out to `ping -c 1 -W 3 ${host}`,
    // which let any caller inject a command; a direct TCP connect answers the
    // same question without a subprocess.
    debug.tests.portConnectivity = await checkTcpReachable(host, port);

    const ssh = new NodeSSH();

    try {
      await ssh.connect(buildConnectOptions({
        dataDir: req.app.locals.DATA_DIR,
        host,
        port,
        username,
        logger: req.app.locals.logger,
        auth: { password },
        readyTimeout: 10000
      }));

      debug.tests.sshConnection = { success: true };

      const whoamiResult = await ssh.execCommand('whoami');
      debug.tests.whoami = {
        success: whoamiResult.code === 0,
        output: whoamiResult.stdout || whoamiResult.stderr
      };

      const sshDirResult = await ssh.execCommand('ls -la ~/.ssh || echo "NO_SSH_DIR"');
      debug.tests.sshDirectory = {
        success: true,
        output: sshDirResult.stdout || sshDirResult.stderr
      };

      await ssh.dispose();

    } catch (error) {
      debug.tests.sshConnection = { success: false, error: error.message };
    }

    // Local key material: report presence only, never contents. The public key
    // is available from GET /status for callers that actually need it.
    debug.tests.localSshKeys = {
      sshDirExists: await fs.pathExists(SSH_DIR),
      privateKeyExists: await fs.pathExists(PRIVATE_KEY_PATH),
      publicKeyExists: await fs.pathExists(PUBLIC_KEY_PATH)
    };

    res.json({ success: true, debug });

  } catch (error) {
    req.app.locals.logger.error('SSH debug failed', { host, error: error.message });
    debug.tests.generalError = { success: false, error: error.message };
    res.status(500).json({ success: false, debug });
  }
});

// Test SSH key authentication
router.post('/test-key', async (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');

    if (!await fs.pathExists(configPath)) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }

    const config = await fs.readJson(configPath);

    if (!config.pihole || !config.sshKeyDeployed) {
      return res.status(400).json({ success: false, error: 'SSH key not configured' });
    }

    if (!isValidHost(config.pihole.host)) {
      return res.status(400).json({ success: false, error: 'Stored Pi-hole host is invalid' });
    }

    const port = parsePort(config.pihole.port, 22);

    if (port === null) {
      return res.status(400).json({ success: false, error: 'Stored Pi-hole port is invalid' });
    }

    const ssh = new NodeSSH();

    try {
      await ssh.connect(buildConnectOptions({
        dataDir: req.app.locals.DATA_DIR,
        host: config.pihole.host,
        port,
        username: config.pihole.username,
        logger: req.app.locals.logger,
        auth: { privateKeyPath: config.sshKeyPath || PRIVATE_KEY_PATH },
        readyTimeout: 5000
      }));

      const result = await ssh.execCommand('echo "SSH key authentication successful"');
      await ssh.dispose();

      if (result.code === 0) {
        res.json({ success: true, message: 'SSH key authentication successful' });
      } else {
        res.status(502).json({ success: false, error: 'SSH key authentication failed' });
      }

    } catch (error) {
      try {
        await ssh.dispose();
      } catch (disposeError) {
        // Ignore disposal errors
      }

      res.status(502).json({
        success: false,
        error: `SSH key authentication failed: ${error.message}`
      });
    }

  } catch (error) {
    req.app.locals.logger.error('Error testing SSH key', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to test SSH key' });
  }
});

// Test SSH connection with password (for initial setup)
router.post('/test', async (req, res) => {
  const params = parseConnectionParams(req.body);

  if (params.error) {
    return res.status(400).json({ success: false, error: params.error });
  }

  const { host, username, password, port } = params;
  const ssh = new NodeSSH();

  try {
    req.app.locals.logger.info('Testing SSH connection', { host, username, port });

    await ssh.connect(buildConnectOptions({
      dataDir: req.app.locals.DATA_DIR,
      host,
      port,
      username,
      logger: req.app.locals.logger,
      auth: { password },
      readyTimeout: 10000
    }));

    const result = await ssh.execCommand('which pihole-FTL');

    if (result.code !== 0) {
      await ssh.dispose();
      return res.json({
        success: false,
        error: 'Pi-hole not found on the target server. Please ensure Pi-hole is installed.'
      });
    }

    const teleporterTest = await ssh.execCommand('pihole-FTL --help | grep -i teleporter');

    if (teleporterTest.code !== 0) {
      await ssh.dispose();
      return res.json({
        success: false,
        error: 'Pi-hole teleporter command not available. Please update Pi-hole to a newer version.'
      });
    }

    await ssh.dispose();

    req.app.locals.logger.info('SSH connection test successful', { host });
    res.json({ success: true, message: 'Connection successful! Pi-hole found and ready for backup.' });

  } catch (error) {
    try {
      await ssh.dispose();
    } catch (disposeError) {
      // Ignore disposal errors
    }

    req.app.locals.logger.error('SSH connection test failed', { host, error: error.message });

    let errorMessage = error.message;

    // Provide better error messages for common issues
    if (error.level === 'client-authentication') {
      errorMessage = 'Authentication failed. Please check your username and password.';
    } else if (error.level === 'client-timeout') {
      errorMessage = 'Connection timeout. Please check the server address and port.';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Server not found. Please check the hostname/IP address.';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused. Please check if SSH service is running on the server.';
    } else if (error.code === 'EHOSTUNREACH') {
      errorMessage = 'Host unreachable. Please check the network connection.';
    } else if (/host key/i.test(errorMessage)) {
      errorMessage =
        'The server presented an unexpected SSH host key. If the Pi-hole was rebuilt, ' +
        'remove its entry from data/known_hosts.json and try again.';
    }

    res.json({ success: false, error: `Connection failed: ${errorMessage}` });
  }
});

// Get SSH key status
router.get('/status', async (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');

    let config = {};

    if (await fs.pathExists(configPath)) {
      config = await fs.readJson(configPath);
    }

    const keyPairExists =
      await fs.pathExists(PRIVATE_KEY_PATH) && await fs.pathExists(PUBLIC_KEY_PATH);

    const status = {
      keyPairExists,
      keyDeployed: !!config.sshKeyDeployed,
      keyPath: PRIVATE_KEY_PATH
    };

    if (keyPairExists) {
      // The public half is not a secret; it is what the user copies onto the
      // Pi-hole host. The private key is never served.
      status.publicKey = await fs.readFile(PUBLIC_KEY_PATH, 'utf8');
    }

    res.json(status);

  } catch (error) {
    req.app.locals.logger.error('Error getting SSH status', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to read SSH status' });
  }
});

module.exports = router;
