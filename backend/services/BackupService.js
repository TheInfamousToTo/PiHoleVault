const fs = require('fs-extra');
const path = require('path');
const { NodeSSH } = require('node-ssh');
const DiscordService = require('./DiscordService');
const AnalyticsService = require('./AnalyticsService');
const PiHoleWebService = require('./PiHoleWebService');

class BackupService {
  constructor(dataDir, backupDir, logger) {
    this.dataDir = dataDir;
    this.backupDir = backupDir;
    this.logger = logger;
    this.discordService = new DiscordService(logger);
    this.analyticsService = new AnalyticsService(logger, dataDir);
    this.webService = new PiHoleWebService(logger);
  }

  async runBackup() {
    const jobId = `backup_${Date.now()}`;
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting backup process', { jobId });
      
      // Log job start
      await this.logJob(jobId, 'running', 'Backup started');
      
      // Load configuration
      const config = await this.loadConfig();
      
      if (!config.pihole) {
        throw new Error('Pi-hole configuration not found');
      }

      // Record backup start for analytics - DISABLED TO PREVENT DOUBLE COUNTING
      // await this.analyticsService.recordBackupStart(config.pihole.host);
      
      // Determine backup method based on configuration
      const connectionMethod = config.pihole.connectionMethod || 'ssh';
      
      let backupResult;
      if (connectionMethod === 'hybrid') {
        this.logger.info('Using hybrid backup method', { jobId });
        backupResult = await this.performHybridBackup(config, jobId);
      } else if (connectionMethod === 'web') {
        this.logger.info('Using web-only backup method', { jobId });
        backupResult = await this.performWebOnlyBackup(config, jobId);
        
        // Debug: Check what we got from web backup
        this.logger.info('Web backup result', {
          jobId,
          hasResult: !!backupResult,
          hasFilename: !!(backupResult && backupResult.filename),
          hasSize: !!(backupResult && backupResult.size),
          size: backupResult ? backupResult.size : 'undefined'
        });
      } else {
        this.logger.info('Using SSH-only backup method', { jobId });
        backupResult = await this.performSSHBackup(config, jobId);
      }

      // Clean up old backups
      await this.cleanupOldBackups(config.backup?.maxBackups || 10);
      
      // Log successful completion
      await this.logJob(jobId, 'success', `Backup completed successfully: ${backupResult.filename}`, {
        filename: backupResult.filename,
        size: backupResult.size,
        method: backupResult.method || connectionMethod
      });
      
      this.logger.info('Backup process completed successfully', { 
        filename: backupResult.filename,
        size: backupResult.size,
        method: backupResult.method || connectionMethod,
        jobId 
      });

      // Record backup success for analytics - RE-ENABLED (SINGLE CALL APPROACH)
      const duration = (Date.now() - startTime) / 1000; // seconds
      await this.analyticsService.recordBackupSuccess({
        filename: backupResult.filename,
        size: backupResult.size,
        piholeServer: config.pihole.host,
        duration: duration
      });

      // Send Discord notification for successful backup
      const discordConfig = this.getDiscordConfig(config);
      if (discordConfig && discordConfig.enabled && discordConfig.notifyOnSuccess) {
        try {
          await this.discordService.sendBackupSuccess(discordConfig.webhookUrl, {
            filename: backupResult.filename,
            size: backupResult.size,
            jobId,
            pihole: config.pihole
          });
          this.logger.info('Discord notification sent for successful backup', { jobId });
        } catch (discordError) {
          this.logger.error('Failed to send Discord notification for successful backup', { 
            error: discordError.message,
            jobId 
          });
        }
      }
      
      return {
        success: true,
        filename: backupResult.filename,
        size: backupResult.size,
        method: backupResult.method || connectionMethod,
        jobId
      };
      
    } catch (error) {
      this.logger.error('Backup process failed', { 
        error: error.message,
        jobId 
      });
      
      // Log failed job
      await this.logJob(jobId, 'error', `Backup failed: ${error.message}`);

      // Record backup failure for analytics - RE-ENABLED (SINGLE CALL APPROACH)
      try {
        const config = await this.loadConfig();
        const duration = (Date.now() - startTime) / 1000; // seconds
        await this.analyticsService.recordBackupFailure({
          message: error.message,
          piholeServer: config?.pihole?.host || 'unknown',
          duration: duration
        });
      } catch (analyticsError) {
        this.logger.debug('Failed to record backup failure for analytics', { 
          error: analyticsError.message 
        });
      }

      // Send Discord notification for backup failure
      try {
        const config = await this.loadConfig();
        const discordConfig = this.getDiscordConfig(config);
        if (discordConfig && discordConfig.enabled && discordConfig.notifyOnFailure) {
          await this.discordService.sendBackupFailure(discordConfig.webhookUrl, {
            error: error.message,
            jobId,
            pihole: config.pihole
          });
          this.logger.info('Discord notification sent for backup failure', { jobId });
        }
      } catch (discordError) {
        this.logger.error('Failed to send Discord notification for backup failure', { 
          error: discordError.message,
          jobId 
        });
      }
      
      return {
        success: false,
        error: error.message,
        jobId
      };
    }
  }

  /**
   * Run backup with a specific connection (instead of using config)
   */
  async runBackupWithConnection(connection, customName = null, description = null) {
    const jobId = `backup_${Date.now()}`;
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting backup with custom connection', { 
        jobId, 
        host: connection.host?.substring(0, 50) // Truncate for logging
      });
      
      // Log job start
      await this.logJob(jobId, 'running', 'Backup started with custom connection');
      
      // Determine backup method based on connection
      const connectionMethod = connection.connectionMethod || 'ssh';
      
      let backupResult;
      if (connectionMethod === 'web') {
        this.logger.info('Using web-only backup method', { jobId });
        const webResult = await this.webService.performWebOnlyBackup(connection);
        
        // Debug logging to see what we got back
        this.logger.info('Web service returned', {
          success: webResult.success,
          hasData: !!webResult.data,
          dataType: typeof webResult.data,
          dataLength: webResult.data ? (typeof webResult.data === 'string' ? webResult.data.length : JSON.stringify(webResult.data).length) : 0,
          error: webResult.error
        });
        
        if (!webResult.success) {
          throw new Error(webResult.error || 'Web backup failed');
        }
        // Extract data from web service response
        backupResult = {
          data: webResult.data,
          method: 'web-only',
          format: webResult.format || 'tar'
        };
      } else {
        throw new Error(`Connection method '${connectionMethod}' not supported yet`);
      }

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseName = customName || 'pi-hole_backup';
      const filename = `${baseName}_${timestamp}.zip`;
      const filePath = path.join(this.backupDir, filename);

      // Write the backup data to file
      if (backupResult.data) {
        if (typeof backupResult.data === 'string') {
          await fs.writeFile(filePath, backupResult.data);
        } else {
          await fs.writeFile(filePath, JSON.stringify(backupResult.data, null, 2));
        }

        const stats = await fs.stat(filePath);
        const size = stats.size;

        const duration = Date.now() - startTime;

        // Update job to completed
        await this.logJob(jobId, 'completed', 'Backup completed successfully', {
          filename,
          size,
          duration,
          method: backupResult.method || connectionMethod,
          description
        });

        // Update analytics
        await this.analyticsService.recordBackupSuccess(connection.host, size, duration);

        this.logger.info('Backup completed successfully with custom connection', {
          jobId,
          filename,
          size,
          duration,
          method: backupResult.method || connectionMethod
        });

        return {
          success: true,
          filename,
          size,
          duration,
          jobId,
          method: backupResult.method || connectionMethod
        };
      } else {
        throw new Error('No backup data received');
      }

    } catch (error) {
      this.logger.error('Backup failed with custom connection', { 
        jobId, 
        error: error.message, 
        stack: error.stack 
      });

      // Update job to failed
      await this.logJob(jobId, 'failed', error.message);

      // Update analytics
      await this.analyticsService.recordBackupFailure(connection.host, error.message);

      return {
        success: false,
        error: error.message,
        jobId
      };
    }
  }

  /**
   * Perform backup using web-only method (no SSH required)
   */
  async performWebOnlyBackup(config, jobId) {
    try {
      this.logger.info('Calling webService.performWebOnlyBackup', {
        jobId,
        host: config.pihole.host
      });
      
      const result = await this.webService.performWebOnlyBackup(config.pihole, this.backupDir);
      
      this.logger.info('webService.performWebOnlyBackup returned', {
        jobId,
        hasResult: !!result,
        success: result ? result.success : 'undefined',
        hasFilename: !!(result && result.filename),
        hasSize: !!(result && result.size),
        size: result ? result.size : 'undefined',
        error: result ? result.error : 'no error'
      });
      
      // Check if the web service succeeded
      if (!result || !result.success) {
        throw new Error(result ? result.error : 'Web service returned no result');
      }
      
      return {
        filename: result.filename,
        size: result.size,
        method: 'web-only'
      };
    } catch (error) {
      this.logger.error('performWebOnlyBackup threw error', { jobId, error: error.message });
      throw error;
    }
  }

  /**
   * Perform backup using hybrid method (Web API + SSH)
   */
  async performHybridBackup(config, jobId) {
    try {
      const result = await this.webService.performHybridBackup(config.pihole, this.backupDir);
      return {
        filename: result.filename,
        size: result.size,
        method: 'hybrid'
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Perform backup using SSH-only method (legacy)
   */
  async performSSHBackup(config, jobId) {
    const ssh = new NodeSSH();
    
    try {
      const connectOptions = {
        host: config.pihole.host,
        username: config.pihole.username,
        port: config.pihole.port || 22,
        readyTimeout: 30000,
      };
      
      // Use SSH key if available, otherwise use password
      if (config.sshKeyDeployed && config.sshKeyPath) {
        try {
          connectOptions.privateKey = await fs.readFile(config.sshKeyPath, 'utf8');
        } catch (error) {
          this.logger.error('Failed to read SSH key, falling back to password', {
            keyPath: config.sshKeyPath,
            error: error.message
          });
          connectOptions.password = config.pihole.password;
        }
      } else {
        connectOptions.password = config.pihole.password;
      }
      
      // Add keyboard-interactive fallback for better compatibility
      connectOptions.tryKeyboard = true;
      connectOptions.onKeyboardInteractive = (name, instructions, instructionsLang, prompts, finish) => {
        if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
          finish([config.pihole.password]);
        }
      };
      
      // Disable strict host key checking
      connectOptions.algorithms = {
        serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519'],
        hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm', 'aes256-gcm']
      };
      
      await ssh.connect(connectOptions);
      
      this.logger.info('Connected to Pi-hole server via SSH', { 
        host: config.pihole.host,
        jobId 
      });
      
      // Run Pi-hole Teleporter backup
      const backupResult = await ssh.execCommand('pihole-FTL --teleporter');
      
      if (backupResult.code !== 0) {
        throw new Error(`Pi-hole backup failed: ${backupResult.stderr}`);
      }
      
      const remoteBackupFile = backupResult.stdout.trim();
      
      if (!remoteBackupFile) {
        throw new Error('No backup file generated');
      }
      
      this.logger.info('Pi-hole backup created via SSH', { 
        remoteFile: remoteBackupFile,
        jobId 
      });
      
      // Generate local filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const localFilename = `pi-hole_backup_${timestamp}.zip`;
      const localPath = path.join(this.backupDir, localFilename);
      
      // Download the backup file
      await ssh.getFile(localPath, remoteBackupFile);
      
      this.logger.info('Backup file downloaded via SSH', { 
        localPath,
        jobId 
      });
      
      // Clean up remote backup file
      await ssh.execCommand(`rm -f "${remoteBackupFile}"`);
      
      // Verify local file exists and has content
      const stats = await fs.stat(localPath);
      if (stats.size === 0) {
        throw new Error('Downloaded backup file is empty');
      }
      
      await ssh.dispose();
      
      return {
        filename: localFilename,
        size: stats.size,
        method: 'ssh'
      };
      
    } catch (sshError) {
      if (ssh) {
        try {
          await ssh.dispose();
        } catch (e) {
          // Ignore disposal errors
        }
      }
      throw sshError;
    }
  }

  async cleanupOldBackups(maxBackups) {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(file => file.endsWith('.zip') && file.includes('pi-hole'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          stats: null
        }));
      
      // Get file stats
      for (const file of backupFiles) {
        file.stats = await fs.stat(file.path);
      }
      
      // Sort by modification time (newest first)
      backupFiles.sort((a, b) => b.stats.mtime - a.stats.mtime);
      
      // Remove old backups
      if (backupFiles.length > maxBackups) {
        const filesToDelete = backupFiles.slice(maxBackups);
        
        for (const file of filesToDelete) {
          await fs.remove(file.path);
          this.logger.info('Old backup file removed', { filename: file.name });
        }
        
        this.logger.info('Cleanup completed', { 
          kept: maxBackups,
          removed: filesToDelete.length 
        });
      }
      
    } catch (error) {
      this.logger.error('Error during backup cleanup', { error: error.message });
    }
  }

  async loadConfig() {
    const configPath = path.join(this.dataDir, 'config.json');
    
    if (!await fs.pathExists(configPath)) {
      throw new Error('Configuration file not found');
    }
    
    return await fs.readJson(configPath);
  }

  getDiscordConfig(config) {
    // Check environment variable first, then fall back to config file
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL || config.discord?.webhookUrl;
    
    if (!webhookUrl) {
      return null;
    }

    return {
      enabled: config.discord?.enabled !== false, // Default to true if webhook URL is provided
      webhookUrl: webhookUrl,
      notifyOnSuccess: config.discord?.notifyOnSuccess !== false, // Default to true
      notifyOnFailure: config.discord?.notifyOnFailure !== false, // Default to true
    };
  }

  async logJob(jobId, status, message, extra = {}) {
    try {
      const jobsPath = path.join(this.dataDir, 'jobs.json');
      
      let jobs = [];
      if (await fs.pathExists(jobsPath)) {
        jobs = await fs.readJson(jobsPath);
      }
      
      // Check if job with this ID already exists
      const existingJobIndex = jobs.findIndex(job => job.id === jobId);
      
      const job = {
        id: jobId,
        timestamp: new Date().toISOString(),
        status,
        message,
        ...extra
      };
      
      if (existingJobIndex !== -1) {
        // Update existing job entry instead of creating a new one
        jobs[existingJobIndex] = job;
        this.logger.info(`Updated existing job ${jobId} status to ${status}`);
      } else {
        // Add new job entry
        jobs.push(job);
        this.logger.info(`Created new job ${jobId} with status ${status}`);
      }
      
      // Keep only last 100 jobs
      if (jobs.length > 100) {
        jobs = jobs.slice(-100);
      }
      
      await fs.writeJson(jobsPath, jobs, { spaces: 2 });
      
    } catch (error) {
      this.logger.error('Error logging job', { error: error.message });
    }
  }
}

module.exports = BackupService;
