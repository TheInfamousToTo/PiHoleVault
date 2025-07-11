const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const DiscordService = require('../services/DiscordService');

// Helper function to get Discord configuration prioritizing environment variables
function getDiscordConfig(config = {}) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || config.discord?.webhookUrl;
  
  if (!webhookUrl) {
    return {
      enabled: false,
      webhookConfigured: false,
      notifyOnSuccess: true,
      notifyOnFailure: true
    };
  }

  return {
    enabled: config.discord?.enabled !== false, // Default to true if webhook URL is provided
    webhookUrl: webhookUrl,
    webhookConfigured: true,
    notifyOnSuccess: config.discord?.notifyOnSuccess !== false,
    notifyOnFailure: config.discord?.notifyOnFailure !== false
  };
}

// Test Discord webhook
router.post('/test', async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    
    if (!webhookUrl) {
      return res.status(400).json({ success: false, error: 'Webhook URL is required' });
    }

    const discordService = new DiscordService(req.app.locals.logger);
    const result = await discordService.testWebhook(webhookUrl);
    
    if (result.success) {
      req.app.locals.logger.info('Discord webhook test successful');
      res.json({ success: true, message: 'Discord webhook test successful' });
    } else {
      req.app.locals.logger.error('Discord webhook test failed', { error: result.error });
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    req.app.locals.logger.error('Error testing Discord webhook', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Discord configuration
router.get('/config', async (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');
    
    let config = {};
    if (await fs.pathExists(configPath)) {
      config = await fs.readJson(configPath);
    }
    
    const discordConfig = getDiscordConfig(config);
    
    // Don't expose the full webhook URL for security, just indicate if it's set
    res.json({
      success: true,
      config: {
        enabled: discordConfig.enabled,
        webhookConfigured: discordConfig.webhookConfigured,
        notifyOnSuccess: discordConfig.notifyOnSuccess,
        notifyOnFailure: discordConfig.notifyOnFailure,
        usingEnvironmentVariable: !!process.env.DISCORD_WEBHOOK_URL
      }
    });
  } catch (error) {
    req.app.locals.logger.error('Error getting Discord config', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Discord configuration
router.post('/config', async (req, res) => {
  try {
    const { enabled, webhookUrl, notifyOnSuccess, notifyOnFailure } = req.body;
    const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');
    
    let config = {};
    if (await fs.pathExists(configPath)) {
      config = await fs.readJson(configPath);
    }
    
    // Update Discord configuration
    config.discord = {
      enabled: !!enabled,
      webhookUrl: webhookUrl || config.discord?.webhookUrl || '',
      notifyOnSuccess: notifyOnSuccess !== false,
      notifyOnFailure: notifyOnFailure !== false
    };
    
    // Validate webhook URL if enabling Discord notifications
    if (config.discord.enabled && !config.discord.webhookUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'Webhook URL is required when enabling Discord notifications' 
      });
    }
    
    // Test webhook if provided and enabled
    if (config.discord.enabled && config.discord.webhookUrl) {
      const discordService = new DiscordService(req.app.locals.logger);
      const testResult = await discordService.testWebhook(config.discord.webhookUrl);
      
      if (!testResult.success) {
        return res.status(400).json({ 
          success: false, 
          error: `Webhook test failed: ${testResult.error}` 
        });
      }
    }
    
    await fs.writeJson(configPath, config, { spaces: 2 });
    
    req.app.locals.logger.info('Discord configuration updated', { 
      enabled: config.discord.enabled,
      notifyOnSuccess: config.discord.notifyOnSuccess,
      notifyOnFailure: config.discord.notifyOnFailure
    });
    
    res.json({ success: true, message: 'Discord configuration updated successfully' });
  } catch (error) {
    req.app.locals.logger.error('Error updating Discord config', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send test notification
router.post('/test-notification', async (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');
    
    let config = {};
    if (await fs.pathExists(configPath)) {
      config = await fs.readJson(configPath);
    }
    
    const discordConfig = getDiscordConfig(config);
    
    if (!discordConfig.enabled || !discordConfig.webhookUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'Discord notifications not configured or enabled' 
      });
    }
    
    const discordService = new DiscordService(req.app.locals.logger);
    const result = await discordService.testWebhook(discordConfig.webhookUrl);
    
    if (result.success) {
      res.json({ success: true, message: 'Test notification sent successfully' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    req.app.locals.logger.error('Error sending test notification', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
