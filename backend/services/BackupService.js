const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const { NodeSSH } = require('node-ssh');
const { buildConnectOptions } = require('../utils/sshSecurity');
const { isValidHost, parsePort, resolveWithin, parsePiholeAddress } = require('../utils/validate');
const { loadConfig, getInstances, getInstance, PRIMARY_ID } = require('../utils/configStore');
const AnalyticsService = require('./AnalyticsService');
const PiHoleWebService = require('./PiHoleWebService');
const CatalogService = require('./CatalogService');
const NotificationService = require('./NotificationService');
const StorageService = require('./StorageService');
const Archive = require('./ArchiveService');
const { selectForDeletion } = require('./RetentionService');

const SSH_KEY_PATH = path.join(process.env.HOME || '/root', '.ssh', 'id_rsa');

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
    this.analyticsService = new AnalyticsService(logger, dataDir);
    this.webService = new PiHoleWebService(logger);
    this.catalog = new CatalogService(dataDir, backupDir);
    this.notifier = new NotificationService(logger);
    // One backup or restore at a time: a scheduled run must not collide with
    // a manual restore that is restarting the same Pi-hole.
    this.busy = null;
  }

  async loadConfig() {
    return loadConfig(this.dataDir);
  }

  // Used to open encrypted backups even after encryption is switched off for
  // new ones, so older .enc files stay restorable.
  passphrase(config) {
    return config.encryption?.passphrase || '';
  }

  async exclusive(label, fn) {
    if (this.busy) {
      throw new Error(`Another operation is already running (${this.busy}); try again when it finishes`);
    }
    this.busy = label;
    try {
      return await fn();
    } finally {
      this.busy = null;
    }
  }

  /**
   * Back up every enabled Pi-hole, or only `instanceId`.
   *
   * Keeps the single-result shape older callers expect (success, filename,
   * size, jobId, error) and adds `results` with one entry per Pi-hole.
   */
  async runBackup({ instanceId } = {}) {
    let config;
    try {
      config = await this.loadConfig();
    } catch (error) {
      return { success: false, error: error.message, results: [] };
    }

    const targets = getInstances(config).filter((i) => (instanceId ? i.id === instanceId : i.enabled));
    if (targets.length === 0) {
      return {
        success: false,
        error: instanceId ? `No Pi-hole with id "${instanceId}"` : 'No Pi-hole is configured',
        results: []
      };
    }

    let results;
    try {
      results = await this.exclusive('backup', async () => {
        const out = [];
        for (const instance of targets) {
          out.push(await this.backupInstance(config, instance));
        }
        await this.applyRetention(config);
        return out;
      });
    } catch (error) {
      return { success: false, error: error.message, results: [] };
    }

    const failed = results.filter((r) => !r.success);
    const first = results.find((r) => r.success) || results[0];
    return {
      success: failed.length === 0,
      error: failed.length ? failed.map((r) => `${r.instanceName}: ${r.error}`).join(' — ') : undefined,
      filename: first?.filename,
      size: first?.size,
      jobId: first?.jobId,
      results
    };
  }

  /**
   * One Pi-hole: fetch, verify, optionally encrypt, record, copy off-site,
   * notify. Never throws; the outcome is in the returned object.
   */
  async backupInstance(config, instance, { note = '', pinned = false } = {}) {
    const jobId = `backup_${Date.now()}_${instance.id}`;
    const startTime = Date.now();
    const instanceName = instance.name || instance.host;
    const base = { jobId, instanceId: instance.id, instanceName };

    await this.logJob(jobId, 'running', `Backup started for ${instanceName}`, { instanceId: instance.id, instanceName });

    try {
      const raw = await this.performBackup(config, instance, jobId);
      const rawPath = resolveWithin(this.backupDir, raw.filename);
      if (!rawPath) throw new Error('Backup was written outside the backup directory');

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      let filename = `pi-hole_backup_${instance.id}_${stamp}.zip`;
      const zip = await fs.readFile(rawPath);
      await fs.remove(rawPath);

      const integrity = Archive.verifyZip(zip);
      if (!integrity.ok) {
        throw new Error(`Backup failed verification and was discarded: ${integrity.error}`);
      }

      let stored = zip;
      const passphrase = this.passphrase(config);
      if (config.encryption?.enabled) {
        if (!passphrase) throw new Error('Encryption is on but no passphrase is set');
        stored = Archive.encrypt(zip, passphrase);
        filename += Archive.ENCRYPTED_SUFFIX;
      }

      await fs.writeFile(path.join(this.backupDir, filename), stored);

      await this.catalog.upsert(filename, {
        instanceId: instance.id,
        instanceName,
        createdAt: new Date().toISOString(),
        method: raw.method,
        integrity,
        encrypted: Boolean(config.encryption?.enabled),
        pinned,
        note
      });

      let offsite = null;
      const storage = new StorageService(config.offsite, this.logger);
      if (storage.enabled) {
        try {
          const uploaded = await storage.upload(filename, stored);
          offsite = { status: 'uploaded', target: uploaded.target, at: new Date().toISOString() };
        } catch (error) {
          offsite = { status: 'failed', target: storage.describe(), error: error.message, at: new Date().toISOString() };
          await this.notifier.notify(config, 'warning', {
            title: 'Off-site copy failed',
            instance: instanceName,
            filename,
            error: error.message
          });
        }
        await this.catalog.upsert(filename, { offsite });
      }

      const duration = Date.now() - startTime;
      await this.logJob(jobId, 'success', `Backup completed successfully: ${filename}`, {
        instanceId: instance.id,
        instanceName,
        filename,
        size: stored.length,
        method: raw.method,
        duration
      });

      await this.notifier.notify(config, 'success', {
        instance: instanceName,
        filename,
        size: stored.length,
        offsite: offsite ? (offsite.status === 'uploaded' ? `copied to ${offsite.target}` : `failed: ${offsite.error}`) : undefined
      });

      if (config.analytics?.enabled) {
        await this.analyticsService.recordBackupSuccess({ size: stored.length, duration: duration / 1000 });
      }

      return { ...base, success: true, filename, size: stored.length, method: raw.method, integrity, offsite };
    } catch (error) {
      this.logger.error('Backup failed', { jobId, instance: instance.id, error: error.message });
      await this.logJob(jobId, 'error', `Backup failed: ${error.message}`, { instanceId: instance.id, instanceName });
      await this.notifier.notify(config, 'failure', { instance: instanceName, error: error.message });

      if (config.analytics?.enabled) {
        await this.analyticsService.recordBackupFailure({ duration: (Date.now() - startTime) / 1000 });
      }

      return { ...base, success: false, error: error.message };
    }
  }

  /**
   * Back up with a connection supplied by the caller rather than the saved
   * Pi-hole list (POST /api/backup with a connectionId).
   */
  async runBackupWithConnection(connection, customName = null, description = null) {
    let config;
    try {
      config = await this.loadConfig();
    } catch (error) {
      return { success: false, error: error.message };
    }

    const instance = { id: connection.id || PRIMARY_ID, name: customName || connection.name || connection.host, ...connection };
    const result = await this.exclusive('backup', () => this.backupInstance(config, instance, { note: description || '' }));
    return result;
  }

  // --- Retention -------------------------------------------------------------

  async applyRetention(config) {
    try {
      await this.catalog.prune();
      const backups = await this.catalog.list();
      const doomed = selectForDeletion(backups, config.backup);
      if (!doomed.length) return [];

      const storage = new StorageService(config.offsite, this.logger);
      for (const filename of doomed) {
        const filePath = resolveWithin(this.backupDir, filename);
        if (!filePath) continue;
        await fs.remove(filePath);
        await this.catalog.remove(filename);
        if (storage.enabled) {
          await storage.remove(filename).catch((error) =>
            this.logger.warn('Could not delete off-site copy', { filename, error: error.message })
          );
        }
      }

      this.logger.info('Retention applied', { removed: doomed.length });
      return doomed;
    } catch (error) {
      this.logger.error('Error applying retention', { error: error.message });
      return [];
    }
  }

  // --- Restore ---------------------------------------------------------------

  /**
   * Restore a stored backup to a Pi-hole.
   *
   * @param filename   backup to restore
   * @param instanceId target Pi-hole; defaults to the one the backup came from
   * @param parts      which parts to import (see PiHoleWebService.importSelection)
   * @param backupFirst take a pinned safety backup of the target before
   *                    overwriting it (default true)
   */
  async restore({ filename, instanceId, parts = {}, backupFirst = true }) {
    const config = await this.loadConfig();
    const filePath = resolveWithin(this.backupDir, filename);
    if (!filePath || !(await fs.pathExists(filePath))) {
      throw new Error('Backup file not found');
    }

    const meta = (await this.catalog.get(filename)) || {};
    const instance = getInstance(config, instanceId || meta.instanceId || PRIMARY_ID);
    if (!instance) throw new Error('Target Pi-hole not found');
    const instanceName = instance.name || instance.host;

    return this.exclusive('restore', async () => {
      const zip = await Archive.readZip(filePath, this.passphrase(config));
      const integrity = Archive.verifyZip(zip);
      if (!integrity.ok) {
        throw new Error(`This backup failed verification and will not be restored: ${integrity.error}`);
      }

      const jobId = `restore_${Date.now()}_${instance.id}`;
      await this.logJob(jobId, 'running', `Restoring ${filename} to ${instanceName}`, {
        type: 'restore', instanceId: instance.id, instanceName, filename
      });

      let safety = null;
      if (backupFirst) {
        safety = await this.backupInstance(config, instance, {
          pinned: true,
          note: `Before restoring ${filename}`
        });
        if (!safety.success) {
          const message = `Restore cancelled: the safety backup of the current state failed (${safety.error})`;
          await this.logJob(jobId, 'error', message, { type: 'restore', instanceId: instance.id, instanceName });
          throw new Error(message);
        }
      }

      try {
        const method = instance.connectionMethod || 'ssh';
        let outcome;
        if (method === 'ssh') {
          outcome = await this.restoreViaSSH(config, instance, zip);
        } else {
          outcome = await this.webService.restoreTeleporter(instance, zip, parts);
          outcome.method = 'web';
        }

        await this.logJob(jobId, 'success', `Restored ${filename} to ${instanceName}`, {
          type: 'restore', instanceId: instance.id, instanceName, filename, processed: outcome.processed
        });
        await this.notifier.notify(config, 'success', {
          title: 'Pi-hole restore completed',
          instance: instanceName,
          filename
        });

        return {
          success: true,
          instanceId: instance.id,
          instanceName,
          processed: outcome.processed,
          restarted: outcome.restarted,
          method: outcome.method,
          safetyBackup: safety?.filename || null
        };
      } catch (error) {
        await this.logJob(jobId, 'error', `Restore failed: ${error.message}`, {
          type: 'restore', instanceId: instance.id, instanceName, filename
        });
        await this.notifier.notify(config, 'failure', {
          title: 'Pi-hole restore failed',
          instance: instanceName,
          filename,
          error: error.message
        });
        throw error;
      }
    });
  }

  // --- Verification ----------------------------------------------------------

  async verify(filename) {
    const config = await this.loadConfig().catch(() => ({}));
    const filePath = resolveWithin(this.backupDir, filename);
    if (!filePath || !(await fs.pathExists(filePath))) throw new Error('Backup file not found');
    const integrity = await Archive.verifyFile(filePath, this.passphrase(config));
    await this.catalog.upsert(filename, { integrity });
    return integrity;
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
  /**
   * Open an SSH connection to a Pi-hole.
   *
   * The primary Pi-hole uses the deployed key when there is one. Pi-holes added
   * later use their stored password, or the same key when they have none.
   * Host-key verification and the algorithm policy always come from
   * buildConnectOptions.
   */
  async connectSSH(config, pihole) {
    const sshHost = parsePiholeAddress(pihole.host)?.hostname;
    if (!sshHost || !isValidHost(sshHost)) {
      throw new Error('Configured Pi-hole host is not a valid hostname or IP address');
    }

    const port = parsePort(pihole.port, 22);
    if (port === null) {
      throw new Error('Configured Pi-hole SSH port is out of range');
    }

    const isPrimary = !pihole.id || pihole.id === PRIMARY_ID;
    const keyPath = config.sshKeyPath || SSH_KEY_PATH;
    const useKey = isPrimary ? Boolean(config.sshKeyDeployed) : !pihole.password && (await fs.pathExists(keyPath));

    const auth = {};
    if (useKey) {
      try {
        auth.privateKey = await fs.readFile(keyPath, 'utf8');
      } catch (error) {
        this.logger.error('Failed to read SSH key, falling back to password', { keyPath, error: error.message });
        auth.password = pihole.password;
      }
    } else {
      auth.password = pihole.password;
    }

    const ssh = new NodeSSH();
    await ssh.connect(buildConnectOptions({
      dataDir: this.dataDir,
      host: sshHost,
      port,
      username: pihole.username,
      logger: this.logger,
      auth,
      readyTimeout: 30000
    }));
    return ssh;
  }

  async performSSHBackup(config, pihole, jobId) {
    const ssh = await this.connectSSH(config, pihole);

    try {
      this.logger.info('Connected to Pi-hole server via SSH', { host: pihole.host, jobId });

      const remoteBackupFile = await this.createRemoteTeleporter(ssh, jobId);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const localFilename = `incoming_${crypto.randomBytes(6).toString('hex')}_${timestamp}.zip`;
      const localPath = path.join(this.backupDir, localFilename);

      await ssh.getFile(localPath, remoteBackupFile);

      // Clean up the remote archive. The name was checked against a strict
      // basename pattern, and it is still read from stdin into a quoted
      // variable rather than interpolated, so the shell never parses it as
      // code. sudo covers an archive root created in sticky /tmp.
      await ssh.execCommand('f=$(cat); rm -f -- "$f" 2>/dev/null || sudo -n rm -f -- "$f"', { stdin: remoteBackupFile });

      const stats = await fs.stat(localPath);
      if (stats.size === 0) {
        throw new Error('Downloaded backup file is empty');
      }

      return { filename: localFilename, size: stats.size, method: 'ssh' };
    } finally {
      try {
        ssh.dispose();
      } catch (e) {
        // Ignore disposal errors
      }
    }
  }

  /**
   * Restore over SSH: upload the zip and import it with pihole-FTL. The CLI
   * imports the whole archive; selective restore needs the web API.
   */
  async restoreViaSSH(config, pihole, zip) {
    const ssh = await this.connectSSH(config, pihole);
    const remote = `/tmp/piholevault-restore-${crypto.randomBytes(8).toString('hex')}.zip`;
    const local = path.join(this.backupDir, `.restore-${crypto.randomBytes(6).toString('hex')}.zip`);

    try {
      await fs.writeFile(local, zip, { mode: 0o600 });
      await ssh.putFile(local, remote);

      let result = await ssh.execCommand(`pihole-FTL --teleporter ${remote}`, { cwd: '/tmp' });
      if (result.code !== 0) {
        result = await ssh.execCommand(`sudo -n pihole-FTL --teleporter ${remote}`, { cwd: '/tmp' });
      }
      await ssh.execCommand(`rm -f -- ${remote} 2>/dev/null || sudo -n rm -f -- ${remote}`);

      if (result.code !== 0) {
        const last = `${result.stderr || ''}\n${result.stdout || ''}`.trim().split('\n').filter(Boolean).slice(-1)[0];
        throw new Error(`pihole-FTL could not import the backup: ${last || `exit code ${result.code}`}`);
      }

      const restarted = await this.webService.waitForRestart(pihole).catch(() => false);
      return { processed: ['(entire archive)'], restarted, method: 'ssh' };
    } finally {
      await fs.remove(local).catch(() => {});
      try {
        ssh.dispose();
      } catch (e) {
        // Ignore disposal errors
      }
    }
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
