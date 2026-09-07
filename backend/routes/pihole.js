const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { NodeSSH } = require('node-ssh');
const { buildConnectOptions } = require('../utils/sshSecurity');
const { isValidHost, isValidUsername, parsePort } = require('../utils/validate');
const PiHoleWebService = require('../services/PiHoleWebService');
const router = express.Router();

// Test Pi-hole connection
router.post('/test-connection', async (req, res) => {
  const { 
    host, 
    username, 
    password, 
    port = 22,
    connectionMethod = 'ssh',
    webPort = 80,
    useHttps = false,
    webPassword
  } = req.body;
  
  if (!host) {
    return res.status(400).json({
      success: false,
      error: 'Host is required'
    });
  }

  // The web methods accept a full URL (users often paste "https://pi.hole/admin"),
  // so those are validated as URLs. The SSH path requires a bare hostname or IP.
  const looksLikeUrl = typeof host === 'string' && /^https?:\/\//i.test(host);

  if (looksLikeUrl) {
    let parsed;

    try {
      parsed = new URL(host);
    } catch (error) {
      return res.status(400).json({ success: false, error: 'Invalid Pi-hole URL' });
    }

    if (!isValidHost(parsed.hostname)) {
      return res.status(400).json({ success: false, error: 'Invalid host in Pi-hole URL' });
    }
  } else if (!isValidHost(host)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid host: expected a hostname, IP address or http(s) URL'
    });
  }

  const sshPort = parsePort(port, 22);

  if (sshPort === null) {
    return res.status(400).json({
      success: false,
      error: 'Invalid port: expected an integer between 1 and 65535'
    });
  }

  // Handle different connection methods
  if (connectionMethod === 'hybrid') {
    try {
      req.app.locals.logger.info('Testing hybrid connection', { host, connectionMethod });
      
      const webService = new PiHoleWebService(req.app.locals.logger);
      const result = await webService.testHybridConnection({
        host,
        username,
        password,
        port,
        webPort,
        useHttps,
        webPassword
      });

      if (result.success) {
        req.app.locals.logger.info('Hybrid connection test successful', { host });
        res.json({ 
          success: true, 
          message: result.message,
          method: 'hybrid',
          details: result.details
        });
      } else {
        res.json({ 
          success: false, 
          error: result.error,
          details: result.details
        });
      }
      
    } catch (error) {
      req.app.locals.logger.error('Hybrid connection test failed', { 
        host, 
        error: error.message 
      });
      
      res.json({ 
        success: false, 
        error: `Hybrid connection test failed: ${error.message}` 
      });
    }
    return;
  } else if (connectionMethod === 'web') {
    try {
      req.app.locals.logger.info('Testing web-only connection', { host, connectionMethod });
      
      const webService = new PiHoleWebService(req.app.locals.logger);
      const result = await webService.testWebConnection({
        host,
        webPort,
        useHttps
      });

      if (result.success) {
        // Also test authentication if password provided
        let authResult = null;
        if (webPassword) {
          authResult = await webService.authenticateWeb({
            host,
            webPort,
            useHttps,
            webPassword
          });
        }

        req.app.locals.logger.info('Web-only connection test successful', { host });
        res.json({ 
          success: true, 
          message: result.message + ' (SSH not required)',
          method: 'web-only',
          requiresAuth: result.requiresAuth,
          authResult: authResult,
          sshRequired: false
        });
      } else {
        res.json({ 
          success: false, 
          error: result.error 
        });
      }
      
    } catch (error) {
      req.app.locals.logger.error('Web-only connection test failed', { 
        host, 
        error: error.message 
      });
      
      res.json({ 
        success: false, 
        error: `Web-only connection test failed: ${error.message}` 
      });
    }
    return;
  }

  // Default SSH-only connection method
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required for SSH connection'
    });
  }

  if (looksLikeUrl) {
    return res.status(400).json({
      success: false,
      error: 'SSH connections need a hostname or IP address, not a URL'
    });
  }

  if (!isValidUsername(username)) {
    return res.status(400).json({ success: false, error: 'Invalid username' });
  }

  const ssh = new NodeSSH();
  
  try {
    req.app.locals.logger.info('Testing SSH connection', { host, username, port });
    
    await ssh.connect(buildConnectOptions({
      dataDir: req.app.locals.DATA_DIR,
      host,
      port: sshPort,
      username,
      logger: req.app.locals.logger,
      auth: { password },
      readyTimeout: 10000
    }));

    // Test if pihole-FTL command exists
    const result = await ssh.execCommand('which pihole-FTL');
    
    if (result.code !== 0) {
      await ssh.dispose();
      return res.json({ 
        success: false, 
        error: 'Pi-hole not found on the target server' 
      });
    }

    await ssh.dispose();
    
    req.app.locals.logger.info('SSH connection test successful', { host });
    res.json({ 
      success: true, 
      message: 'SSH connection successful',
      method: 'ssh'
    });
    
  } catch (error) {
    if (ssh) {
      try {
        await ssh.dispose();
      } catch (e) {
        // Ignore disposal errors
      }
    }
    
    req.app.locals.logger.error('SSH connection test failed', { 
      host, 
      error: error.message 
    });
    
    res.json({ 
      success: false, 
      error: `SSH connection failed: ${error.message}`,
      method: 'ssh'
    });
  }
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
