const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const cronParser = require('cron-parser');
const router = express.Router();

// Convert GMT offset format (e.g., "GMT+3") to timezone name (e.g., "Etc/GMT-3")
// Note: Etc/GMT offsets are inverted in POSIX timezone naming
function convertGMTOffsetToTimezone(gmtOffset) {
  if (!gmtOffset || !gmtOffset.startsWith('GMT')) {
    return 'UTC'; // Default to UTC if invalid format
  }
  
  // Extract the offset part (e.g., "+3" from "GMT+3")
  const offsetStr = gmtOffset.substring(3);
  
  if (offsetStr === '+0' || offsetStr === '-0' || offsetStr === '0') {
    return 'UTC';
  }
  
  // Parse the offset number
  const offset = parseInt(offsetStr);
  if (isNaN(offset)) {
    return 'UTC';
  }
  
  // Convert to POSIX timezone format (Etc/GMT zones are inverted)
  // GMT+3 becomes Etc/GMT-3 in POSIX notation
  const posixOffset = -offset;
  const sign = posixOffset >= 0 ? '+' : '-';
  const absOffset = Math.abs(posixOffset);
  
  return `Etc/GMT${sign}${absOffset}`;
}

// Validate cron expression
router.post('/validate', (req, res) => {
  try {
    const { cronExpression, timezone } = req.body;
    
    if (!cronExpression) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cron expression is required' 
      });
    }
    
    try {
      // Convert GMT offset to timezone if provided
      const convertedTimezone = timezone ? convertGMTOffsetToTimezone(timezone) : 'UTC';
      
      const interval = cronParser.parseExpression(cronExpression, {
        tz: convertedTimezone
      });
      const nextRuns = [];
      
      // Get next 5 scheduled runs
      for (let i = 0; i < 5; i++) {
        nextRuns.push(interval.next().toString());
      }
      
      res.json({ 
        valid: true, 
        nextRuns,
        message: 'Cron expression is valid',
        timezone: timezone || 'UTC',
        convertedTimezone: convertedTimezone
      });
      
    } catch (error) {
      res.json({ 
        valid: false, 
        error: `Invalid cron expression: ${error.message}` 
      });
    }
    
  } catch (error) {
    req.app.locals.logger.error('Error validating schedule', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get next scheduled runs
router.get('/next-runs', async (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');
    
    if (!await fs.pathExists(configPath)) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }
    
    const config = await fs.readJson(configPath);
    
    if (!config.schedule || !config.schedule.cronExpression) {
      return res.status(400).json({ 
        success: false, 
        error: 'Schedule not configured' 
      });
    }
    
    try {
      // Convert GMT offset to timezone if provided
      const convertedTimezone = config.schedule.timezone ? 
        convertGMTOffsetToTimezone(config.schedule.timezone) : 'UTC';
        
      const interval = cronParser.parseExpression(config.schedule.cronExpression, {
        tz: convertedTimezone
      });
      const nextRuns = [];
      
      // Get next 10 scheduled runs
      for (let i = 0; i < 10; i++) {
        nextRuns.push({
          timestamp: interval.next().toString(),
          date: interval.prev().toDate()
        });
      }
      
      res.json({ 
        success: true, 
        nextRuns,
        cronExpression: config.schedule.cronExpression,
        timezone: config.schedule.timezone,
        convertedTimezone: convertedTimezone
      });
      
    } catch (error) {
      res.status(400).json({ 
        success: false, 
        error: `Invalid cron expression: ${error.message}` 
      });
    }
    
  } catch (error) {
    req.app.locals.logger.error('Error getting next runs', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Enable/disable scheduled backups
router.post('/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');
    
    if (!await fs.pathExists(configPath)) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }
    
    const config = await fs.readJson(configPath);
    
    if (!config.schedule) {
      config.schedule = {};
    }
    
    config.schedule.enabled = enabled;
    config.updatedAt = new Date().toISOString();
    
    await fs.writeJson(configPath, config, { spaces: 2 });
    
    // Reinitialize scheduled jobs
    if (req.app.locals.scheduleService) {
      await req.app.locals.scheduleService.initializeScheduledJobs();
    }
    
    req.app.locals.logger.info(`Scheduled backups ${enabled ? 'enabled' : 'disabled'}`);
    res.json({ 
      success: true, 
      message: `Scheduled backups ${enabled ? 'enabled' : 'disabled'}` 
    });
    
  } catch (error) {
    req.app.locals.logger.error('Error toggling schedule', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
