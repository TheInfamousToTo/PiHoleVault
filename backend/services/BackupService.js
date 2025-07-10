const fs = require('fs-extra');
const path = require('path');
const { NodeSSH } = require('node-ssh');

class BackupService {
  constructor(dataDir, backupDir, logger) {
    this.dataDir = dataDir;
    this.backupDir = backupDir;
    this.logger = logger;
  }

  async runBackup() {
    const jobId = `backup_${Date.now()}`;
    
    try {
      this.logger.info('Starting backup process', { jobId });
      
      // Log job start
      await this.logJob(jobId, 'running', 'Backup started');
      
      // Load configuration
      const config = await this.loadConfig();
      
      if (!config.pihole) {
        throw new Error('Pi-hole configuration not found');
      }
      
      // Connect to Pi-hole server
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
        
        this.logger.info('Connected to Pi-hole server', { 
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
        
        this.logger.info('Pi-hole backup created', { 
          remoteFile: remoteBackupFile,
          jobId 
        });
        
        // Generate local filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const localFilename = `pi-hole_backup_${timestamp}.zip`;
        const localPath = path.join(this.backupDir, localFilename);
        
        // Download the backup file
        await ssh.getFile(localPath, remoteBackupFile);
        
        this.logger.info('Backup file downloaded', { 
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
        
        // Clean up old backups
        await this.cleanupOldBackups(config.backup?.maxBackups || 10);
        
        // Log successful completion
        await this.logJob(jobId, 'success', `Backup completed successfully: ${localFilename}`, {
          filename: localFilename,
          size: stats.size
        });
        
        this.logger.info('Backup process completed successfully', { 
          filename: localFilename,
          size: stats.size,
          jobId 
        });
        
        return {
          success: true,
          filename: localFilename,
          size: stats.size,
          jobId
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
      
    } catch (error) {
      this.logger.error('Backup process failed', { 
        error: error.message,
        jobId 
      });
      
      // Log failed job
      await this.logJob(jobId, 'error', `Backup failed: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        jobId
      };
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
