const fs = require('fs-extra');
const path = require('path');
const { NodeSSH } = require('node-ssh');
const { buildConnectOptions } = require('../utils/sshSecurity');
const { isValidHost, parsePort, resolveWithin, parsePiholeAddress } = require('../utils/validate');
const DiscordService = require('./DiscordService');
const AnalyticsService = require('./AnalyticsService');
const PiHoleWebService = require('./PiHoleWebService');

class BackupService {
  /**
   * Reduce a caller-supplied backup name to a safe filename component.
   * Anything outside [A-Za-z0-9._-] is dropped, and an empty result falls back
   * to the default name.
   */
  static sanitiseBaseName(name) {
    if (typeof name !== 'string') {
      return 'pi-hole_backup';
    }

    const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '').replace(/^[.]+/, '').slice(0, 64);

    return cleaned || 'pi-hole_backup';
  }

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
      
      const connectionMethod = config.pihole.connectionMethod || 'ssh';
      const backupResult = await this.performBackup(config, config.pihole, jobId);

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
      
      const connectionMethod = connection.connectionMethod || 'ssh';
      const config = await this.loadConfig();
      const backupResult = await this.performBackup(config, connection, jobId);

      // customName arrives from the request body. Interpolating it straight into
      // a path let a caller write the downloaded backup anywhere the process
      // could reach (for example "../../root/.ssh/authorized_keys"), so it is
      // reduced to a safe basename and the result is confined to backupDir.
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseName = BackupService.sanitiseBaseName(customName);
      const filename = `${baseName}_${timestamp}.zip`;
      const filePath = resolveWithin(this.backupDir, filename);
      const sourcePath = resolveWithin(this.backupDir, backupResult.filename);

      if (!filePath || !sourcePath) {
        throw new Error('Refusing to write a backup outside the backup directory');
      }

      await fs.move(sourcePath, filePath);

      const size = (await fs.stat(filePath)).size;
      const duration = Date.now() - startTime;

      await this.logJob(jobId, 'completed', 'Backup completed successfully', {
        filename,
        size,
        duration,
        method: backupResult.method || connectionMethod,
        description
      });

      await this.analyticsService.recordBackupSuccess({
        filename,
        size,
        piholeServer: connection.host,
        duration: duration / 1000
      });

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

    } catch (error) {
      this.logger.error('Backup failed with custom connection', { 
        jobId, 
        error: error.message, 
        stack: error.stack 
      });

      // Update job to failed
      await this.logJob(jobId, 'failed', error.message);

      // Update analytics
      await this.analyticsService.recordBackupFailure({
        message: error.message,
        piholeServer: connection.host,
        duration: (Date.now() - startTime) / 1000
      });

      return {
        success: false,
        error: error.message,
        jobId
      };
    }
  }

  /**
   * Run a backup against `pihole` with whichever method it is configured for.
   * `config` supplies the deployed SSH key, which lives at the top level.
   */
  async performBackup(config, pihole, jobId) {
    const method = pihole.connectionMethod || 'ssh';
    this.logger.info('Running backup', { jobId, method });

    if (method === 'web') {
      return this.performWebOnlyBackup(pihole, jobId);
    }
    if (method === 'hybrid') {
      return this.performHybridBackup(config, pihole, jobId);
    }
    return this.performSSHBackup(config, pihole, jobId);
  }

  /**
   * Perform backup through the Pi-hole v6 web API (no SSH required).
   */
  async performWebOnlyBackup(pihole, jobId) {
    const result = await this.webService.performWebOnlyBackup(pihole, this.backupDir);

    if (!result || !result.success) {
      throw new Error(result ? result.error : 'Web backup returned no result');
    }

    return { filename: result.filename, size: result.size, method: 'web' };
  }

  /**
   * Hybrid: the web API first, because it needs no root on the Pi-hole and is
   * what Pi-hole v6 is built around; SSH if the API is unavailable (Pi-hole
   * restarting, out of API sessions, password changed).
   */
  async performHybridBackup(config, pihole, jobId) {
    try {
      return { ...(await this.performWebOnlyBackup(pihole, jobId)), method: 'hybrid (web)' };
    } catch (webError) {
      this.logger.warn('Hybrid backup: web API failed, falling back to SSH', {
        jobId,
        error: webError.message
      });

      try {
        return { ...(await this.performSSHBackup(config, pihole, jobId)), method: 'hybrid (ssh)' };
      } catch (sshError) {
        throw new Error(`Web API: ${webError.message} — SSH: ${sshError.message}`);
      }
    }
  }

  /**
   * Pick the archive name out of `pihole-FTL --teleporter` output.
   *
   * FTL prints log lines before the filename (in Docker, one per FTLCONF
   * variable), so the last line naming a zip is the archive. Only a plain
   * basename is accepted: the value is later used as a remote path.
   */
  static parseTeleporterOutput(stdout) {
    const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (/^[A-Za-z0-9._-]+\.zip$/.test(lines[i])) {
        return lines[i];
      }
    }

    return null;
  }

  /**
   * Create a Teleporter archive on the Pi-hole and return its remote filename.
   *
   * pihole-FTL needs to read /etc/pihole/pihole.toml, which is 0640
   * pihole:pihole, so a non-root SSH user fails. Retry through `sudo -n`
   * (never prompts) before giving up with an explanation.
   */
  async createRemoteTeleporter(ssh, jobId) {
    const attempts = ['pihole-FTL --teleporter', 'sudo -n pihole-FTL --teleporter'];
    const failures = [];

    for (const command of attempts) {
      const result = await ssh.execCommand(command, { cwd: '/tmp' });
      const filename = result.code === 0 ? BackupService.parseTeleporterOutput(result.stdout) : null;

      if (filename) {
        this.logger.info('Teleporter archive created over SSH', { jobId, command, filename });
        return `/tmp/${filename}`;
      }

      const output = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
      failures.push(output.split('\n').filter(Boolean).slice(-1)[0] || `exit code ${result.code}`);
    }

    const permission = failures.some((f) => /permission denied|heap ZIP|sudo/i.test(f));

    throw new Error(
      permission
        ? 'The SSH user cannot read Pi-hole\'s configuration. Connect as root, add the user to the "pihole" group, or allow it to run "sudo pihole-FTL" without a password.'
        : `pihole-FTL --teleporter failed: ${failures.join(' / ')}`
    );
  }

  /**
   * Perform backup using SSH-only method (legacy)
   */
  async performSSHBackup(config, pihole, jobId) {
    const ssh = new NodeSSH();
    
    try {
      // Configs saved before 2.0.0 may hold the admin page URL; SSH needs the
      // bare hostname inside it.
      const sshHost = parsePiholeAddress(pihole.host)?.hostname;

      if (!sshHost || !isValidHost(sshHost)) {
        throw new Error('Configured Pi-hole host is not a valid hostname or IP address');
      }

      const port = parsePort(pihole.port, 22);

      if (port === null) {
        throw new Error('Configured Pi-hole SSH port is out of range');
      }

      // Prefer the deployed key; fall back to the stored password. Host key
      // verification and the algorithm policy come from buildConnectOptions so
      // that no connection can silently opt out of them.
      const auth = {};

      if (config.sshKeyDeployed && config.sshKeyPath) {
        try {
          auth.privateKey = await fs.readFile(config.sshKeyPath, 'utf8');
        } catch (error) {
          this.logger.error('Failed to read SSH key, falling back to password', {
            keyPath: config.sshKeyPath,
            error: error.message
          });
          auth.password = pihole.password;
        }
      } else {
        auth.password = pihole.password;
      }

      const connectOptions = buildConnectOptions({
        dataDir: this.dataDir,
        host: sshHost,
        port,
        username: pihole.username,
        logger: this.logger,
        auth,
        readyTimeout: 30000
      });

      await ssh.connect(connectOptions);
      
      this.logger.info('Connected to Pi-hole server via SSH', { 
        host: pihole.host,
        jobId 
      });
      
      const remoteBackupFile = await this.createRemoteTeleporter(ssh, jobId);

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
      
      // Clean up the remote archive. The name was checked against a strict
      // basename pattern, and it is still read from stdin into a quoted
      // variable rather than interpolated, so the shell never parses it as
      // code. sudo covers an archive root created in sticky /tmp.
      await ssh.execCommand('f=$(cat); rm -f -- "$f" 2>/dev/null || sudo -n rm -f -- "$f"', { stdin: remoteBackupFile });
      
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
