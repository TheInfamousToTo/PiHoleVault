const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const router = express.Router();

const CONFIG_FILE = 'config.json';

// Get configuration status
router.get('/status', (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, CONFIG_FILE);
    const exists = fs.existsSync(configPath);
    
    if (exists) {
      const config = fs.readJsonSync(configPath);
      res.json({ 
        configured: !!(config.pihole && config.pihole.host),
        hasSSHKey: !!(config.sshKeyDeployed)
      });
    } else {
      res.json({ configured: false, hasSSHKey: false });
    }
  } catch (error) {
    req.app.locals.logger.error('Error checking config status', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get full configuration
router.get('/', (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, CONFIG_FILE);
    
    if (fs.existsSync(configPath)) {
      try {
        const config = fs.readJsonSync(configPath);
        // Remove sensitive data
        if (config.pihole && config.pihole.password) {
          config.pihole.password = '***';
        }
        res.json(config);
      } catch (readError) {
        req.app.locals.logger.error('Error reading config file', { error: readError.message });
        
        // Return an empty configuration instead of failing
        res.json({
          pihole: { host: '', username: '', port: 22 },
          backup: { destinationPath: '/app/backups', maxBackups: 10 },
          schedule: { enabled: false, cronExpression: '0 3 * * *', timezone: 'UTC' },
          message: 'Using default configuration due to file access error'
        });
      }
    } else {
      // Create a default configuration if none exists
      const defaultConfig = {
        pihole: { host: '', username: '', port: 22 },
        backup: { destinationPath: '/app/backups', maxBackups: 10 },
        schedule: { enabled: false, cronExpression: '0 3 * * *', timezone: 'UTC' },
        message: 'Default configuration'
      };
      
      try {
        fs.writeJsonSync(configPath, defaultConfig, { spaces: 2 });
        req.app.locals.logger.info('Created default configuration file');
      } catch (writeError) {
        req.app.locals.logger.error('Failed to create default config', { error: writeError.message });
      }
      
      res.json(defaultConfig);
    }
  } catch (error) {
    req.app.locals.logger.error('Error handling config request', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save configuration
router.post('/save', async (req, res) => {
  try {
    const config = req.body;
    const configPath = path.join(req.app.locals.DATA_DIR, CONFIG_FILE);
    
    // Validate required fields based on connection method
    if (!config.pihole || !config.pihole.host) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required Pi-hole host configuration' 
      });
    }

    // For SSH and hybrid methods, username is required
    if ((config.pihole.connectionMethod === 'ssh' || config.pihole.connectionMethod === 'hybrid') && !config.pihole.username) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username is required for SSH and hybrid connection methods' 
      });
    }

    // For web and hybrid methods, web password is required
    if ((config.pihole.connectionMethod === 'web' || config.pihole.connectionMethod === 'hybrid') && !config.pihole.webPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Web password is required for web-only and hybrid connection methods' 
      });
    }

    // Add metadata
    config.createdAt = new Date().toISOString();
    config.updatedAt = new Date().toISOString();
    
    await fs.writeJson(configPath, config, { spaces: 2 });
    
    // Reinitialize scheduled jobs with new config
    if (req.app.locals.scheduleService) {
      await req.app.locals.scheduleService.initializeScheduledJobs();
    }
    
    req.app.locals.logger.info('Configuration saved successfully');
    res.json({ success: true });
  } catch (error) {
    req.app.locals.logger.error('Error saving config', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update configuration
router.put('/', async (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, CONFIG_FILE);
    
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }
    
    const existingConfig = await fs.readJson(configPath);
    const updatedConfig = { ...existingConfig, ...req.body };
    updatedConfig.updatedAt = new Date().toISOString();
    
    await fs.writeJson(configPath, updatedConfig, { spaces: 2 });
    
    // Reinitialize scheduled jobs with new config
    if (req.app.locals.scheduleService) {
      await req.app.locals.scheduleService.initializeScheduledJobs();
    }
    
    req.app.locals.logger.info('Configuration updated successfully');
    res.json({ success: true });
  } catch (error) {
    req.app.locals.logger.error('Error updating config', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
