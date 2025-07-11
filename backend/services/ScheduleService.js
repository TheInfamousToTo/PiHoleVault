const fs = require('fs-extra');
const path = require('path');
const cron = require('node-cron');

class ScheduleService {
  constructor(backupService, dataDir, logger) {
    this.backupService = backupService;
    this.dataDir = dataDir;
    this.logger = logger;
    this.scheduledTasks = new Map();
  }

  async initializeScheduledJobs() {
    try {
      this.logger.info('Initializing scheduled jobs');
      
      // Clear existing scheduled tasks
      this.clearAllTasks();
      
      // Load configuration
      const config = await this.loadConfig();
      
      if (!config.schedule || !config.schedule.enabled) {
        this.logger.info('Scheduled backups are disabled');
        return;
      }
      
      if (!config.schedule.cronExpression) {
        this.logger.warn('No cron expression configured');
        return;
      }
      
      // Validate cron expression
      if (!cron.validate(config.schedule.cronExpression)) {
        this.logger.error('Invalid cron expression', { 
          expression: config.schedule.cronExpression 
        });
        return;
      }
      
      // Convert GMT offset to timezone format
      const timezone = this.convertGMTOffsetToTimezone(config.schedule.timezone);
      
      // Schedule the backup task
      const task = cron.schedule(
        config.schedule.cronExpression,
        async () => {
          this.logger.info('Running scheduled backup');
          try {
            const result = await this.backupService.runBackup();
            if (result.success) {
              this.logger.info('Scheduled backup completed successfully', {
                filename: result.filename
              });
            } else {
              this.logger.error('Scheduled backup failed', {
                error: result.error
              });
            }
          } catch (error) {
            this.logger.error('Error during scheduled backup', {
              error: error.message
            });
          }
        },
        {
          scheduled: true,
          timezone: timezone
        }
      );
      
      this.scheduledTasks.set('backup', task);
      
      this.logger.info('Scheduled backup task created', {
        expression: config.schedule.cronExpression,
        timezone: config.schedule.timezone,
        convertedTimezone: timezone
      });
      
    } catch (error) {
      this.logger.error('Error initializing scheduled jobs', {
        error: error.message
      });
    }
  }

  clearAllTasks() {
    this.scheduledTasks.forEach((task, name) => {
      task.stop();
      task.destroy();
      this.logger.info('Stopped scheduled task', { name });
    });
    this.scheduledTasks.clear();
  }

  async loadConfig() {
    const configPath = path.join(this.dataDir, 'config.json');
    
    if (!await fs.pathExists(configPath)) {
      throw new Error('Configuration file not found');
    }
    
    return await fs.readJson(configPath);
  }

  getScheduledTasks() {
    const tasks = [];
    this.scheduledTasks.forEach((task, name) => {
      tasks.push({
        name,
        running: task.running,
        scheduled: task.scheduled
      });
    });
    return tasks;
  }

  async stopScheduledBackups() {
    try {
      const task = this.scheduledTasks.get('backup');
      if (task) {
        task.stop();
        this.logger.info('Scheduled backups stopped');
      }
    } catch (error) {
      this.logger.error('Error stopping scheduled backups', {
        error: error.message
      });
    }
  }

  async startScheduledBackups() {
    try {
      const task = this.scheduledTasks.get('backup');
      if (task) {
        task.start();
        this.logger.info('Scheduled backups started');
      } else {
        await this.initializeScheduledJobs();
      }
    } catch (error) {
      this.logger.error('Error starting scheduled backups', {
        error: error.message
      });
    }
  }

  // Convert GMT offset format (e.g., "GMT+3") to timezone name (e.g., "Etc/GMT-3")
  // Note: Etc/GMT offsets are inverted in POSIX timezone naming
  convertGMTOffsetToTimezone(gmtOffset) {
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
}

module.exports = ScheduleService;
