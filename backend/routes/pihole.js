const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { NodeSSH } = require('node-ssh');
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

  const ssh = new NodeSSH();
  
  try {
    req.app.locals.logger.info('Testing SSH connection', { host, username, port });
    
    await ssh.connect({
      host,
      username,
      password,
      port,
      readyTimeout: 10000,
    });

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
      await ssh.connect({
        host: config.pihole.host,
        username: config.pihole.username,
        password: config.pihole.password,
        port: config.pihole.port || 22,
        readyTimeout: 5000,
      });

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
