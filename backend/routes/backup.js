const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { resolveWithin, isSafeDownloadName } = require('../utils/validate');
const { isValidInstanceId } = require('../utils/configStore');
const Archive = require('../services/ArchiveService');
const CatalogService = require('../services/CatalogService');
const StorageService = require('../services/StorageService');
const { diffArchives } = require('../services/DiffService');

const router = express.Router();

// Create a new backup with specific connection parameters
router.post('/', async (req, res) => {
  try {
    const { connectionId, name, description } = req.body;
    
    if (!connectionId) {
      return res.status(400).json({
        success: false,
        error: 'connectionId is required'
      });
    }

    // Load configuration to get connection details
    const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');
    let config;
    
    try {
      config = await fs.readJson(configPath);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load configuration'
      });
    }

    // Find the connection by ID
    let connection;
    if (config.pihole && (config.pihole.connectionId === connectionId || connectionId === 'pihole-web')) {
      connection = config.pihole;
      connection.connectionId = connectionId; // Ensure it has an ID
    } else if (config.connections && config.connections[connectionId]) {
      connection = config.connections[connectionId];
    }

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: `Connection '${connectionId}' not found`
      });
    }

    // Use the backup service to perform the backup with specific connection
    const backupService = req.app.locals.backupService;
    const result = await backupService.runBackupWithConnection(connection, name, description);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Backup completed successfully',
        filename: result.filename,
        size: result.size || 0,
        jobId: result.jobId
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    req.app.locals.logger.error('Error creating backup', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Run backup now: every enabled Pi-hole, or only body.instanceId.
router.post('/run', async (req, res) => {
  try {
    const instanceId = req.body && typeof req.body.instanceId === 'string' ? req.body.instanceId : undefined;
    if (instanceId !== undefined && !isValidInstanceId(instanceId)) {
      return res.status(400).json({ success: false, error: 'Invalid instance id' });
    }

    const result = await req.app.locals.backupService.runBackup({ instanceId });

    if (result.success) {
      res.json({
        success: true,
        message: 'Backup completed successfully',
        filename: result.filename,
        size: result.size || 0,
        jobId: result.jobId,
        results: result.results
      });
    } else {
      res.status(500).json({ success: false, error: result.error, results: result.results });
    }
  } catch (error) {
    req.app.locals.logger.error('Error running backup', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Compare two backups: GET /api/backups/diff?from=<older>&to=<newer>
router.get('/diff', async (req, res) => {
  try {
    const { from, to } = req.query;
    const service = req.app.locals.backupService;
    const config = await service.loadConfig().catch(() => ({}));
    const zips = [];

    for (const name of [from, to]) {
      const filePath = typeof name === 'string' && isSafeDownloadName(name) ? resolveWithin(req.app.locals.BACKUP_DIR, name) : null;
      if (!filePath || !(await fs.pathExists(filePath))) {
        return res.status(400).json({ success: false, error: 'Both backups must exist' });
      }
      zips.push(await Archive.readZip(filePath, service.passphrase(config)));
    }

    const diff = await diffArchives(zips[0], zips[1]);
    res.json({ success: true, from, to, ...diff });
  } catch (error) {
    req.app.locals.logger.error('Error comparing backups', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// List backups with their catalog metadata, newest first.
router.get('/', async (req, res) => {
  try {
    const backups = await req.app.locals.backupService.catalog.list();
    res.json(backups);
  } catch (error) {
    req.app.locals.logger.error('Error listing backups', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Resolve and confine a backup filename from the URL BEFORE touching the
 * filesystem, so a caller cannot probe for arbitrary files via status codes.
 */
async function backupPath(req, res) {
  const { filename } = req.params;
  const filePath = resolveWithin(req.app.locals.BACKUP_DIR, filename);

  if (!filePath || !isSafeDownloadName(filename) || !CatalogService.BACKUP_FILE_PATTERN.test(filename)) {
    res.status(400).json({ success: false, error: 'Invalid filename' });
    return null;
  }
  if (!(await fs.pathExists(filePath))) {
    res.status(404).json({ success: false, error: 'Backup file not found' });
    return null;
  }
  return filePath;
}

// Download. Encrypted backups are decrypted to a plain Teleporter zip (ready
// for Pi-hole's own Teleporter page) unless ?raw=1 asks for the .enc file.
router.get('/:filename/download', async (req, res) => {
  try {
    const filePath = await backupPath(req, res);
    if (!filePath) return;
    const { filename } = req.params;
    const service = req.app.locals.backupService;

    if (filename.endsWith(Archive.ENCRYPTED_SUFFIX) && req.query.raw !== '1') {
      const config = await service.loadConfig().catch(() => ({}));
      const zip = await Archive.readZip(filePath, service.passphrase(config));
      const plainName = filename.slice(0, -Archive.ENCRYPTED_SUFFIX.length);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${plainName}"`);
      return res.send(zip);
    }

    res.download(filePath, filename, (error) => {
      if (error) {
        req.app.locals.logger.error('Error downloading backup', { filename, error: error.message });
        if (!res.headersSent) res.status(500).json({ success: false, error: 'Download failed' });
      }
    });
  } catch (error) {
    req.app.locals.logger.error('Error downloading backup', { error: error.message });
    if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
  }
});

// Restore to a Pi-hole.
router.post('/:filename/restore', async (req, res) => {
  try {
    const filePath = await backupPath(req, res);
    if (!filePath) return;
    const { instanceId, parts, backupFirst } = req.body || {};
    if (instanceId !== undefined && !isValidInstanceId(instanceId)) {
      return res.status(400).json({ success: false, error: 'Invalid instance id' });
    }
    const allowed = ['settings', 'dhcpLeases', 'groups', 'adlists', 'domains', 'clients'];
    const selection = {};
    for (const key of allowed) {
      if (parts && typeof parts[key] === 'boolean') selection[key] = parts[key];
    }
    if (parts && Object.keys(selection).length && !Object.values(selection).some(Boolean)) {
      return res.status(400).json({ success: false, error: 'Select at least one part to restore' });
    }

    const result = await req.app.locals.backupService.restore({
      filename: req.params.filename,
      instanceId,
      parts: selection,
      backupFirst: backupFirst !== false
    });
    res.json(result);
  } catch (error) {
    req.app.locals.logger.error('Restore failed', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Re-run the integrity check.
router.post('/:filename/verify', async (req, res) => {
  try {
    const filePath = await backupPath(req, res);
    if (!filePath) return;
    const integrity = await req.app.locals.backupService.verify(req.params.filename);
    res.json({ success: true, integrity });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Pin / unpin, and edit the note.
router.patch('/:filename', async (req, res) => {
  try {
    const filePath = await backupPath(req, res);
    if (!filePath) return;
    const patch = {};
    if (typeof req.body?.pinned === 'boolean') patch.pinned = req.body.pinned;
    if (typeof req.body?.note === 'string') patch.note = req.body.note.slice(0, 200);
    if (!Object.keys(patch).length) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }
    const entry = await req.app.locals.backupService.catalog.upsert(req.params.filename, patch);
    res.json({ success: true, entry });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a backup, its catalog entry and its off-site copy.
router.delete('/:filename', async (req, res) => {
  try {
    const filePath = await backupPath(req, res);
    if (!filePath) return;
    const { filename } = req.params;
    const service = req.app.locals.backupService;

    await fs.remove(filePath);
    await service.catalog.remove(filename);

    const config = await service.loadConfig().catch(() => ({}));
    const storage = new StorageService(config.offsite, req.app.locals.logger);
    let offsiteError = null;
    if (storage.enabled) {
      await storage.remove(filename).catch((error) => {
        offsiteError = error.message;
      });
    }

    req.app.locals.logger.info('Backup file deleted', { filename });
    res.json({
      success: true,
      message: offsiteError ? `Deleted locally; the off-site copy could not be removed (${offsiteError})` : 'Backup deleted successfully'
    });
  } catch (error) {
    req.app.locals.logger.error('Error deleting backup', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Backup statistics.
router.get('/stats', async (req, res) => {
  try {
    const backups = await req.app.locals.backupService.catalog.list();
    const totalSize = backups.reduce((n, b) => n + b.size, 0);
    res.json({
      totalFiles: backups.length,
      totalSize,
      oldestBackup: backups.length ? backups[backups.length - 1].timestamp : null,
      newestBackup: backups.length ? backups[0].timestamp : null,
      averageSize: backups.length ? totalSize / backups.length : 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
