const express = require('express');
const fs = require('fs-extra');
const path = require('path');
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

// Run backup now
router.post('/run', async (req, res) => {
  try {
    const result = await req.app.locals.backupService.runBackup();
    
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
    req.app.locals.logger.error('Error running backup', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get backup files
router.get('/', async (req, res) => {
  try {
    const backupDir = req.app.locals.BACKUP_DIR;
    const files = await fs.readdir(backupDir);
    
    const backups = [];
    
    for (const file of files) {
      if (file.endsWith('.zip')) {
        const filePath = path.join(backupDir, file);
        const stats = await fs.stat(filePath);
        
        backups.push({
          filename: file,
          size: stats.size,
          timestamp: stats.mtime,
          path: filePath
        });
      }
    }
    
    // Sort by timestamp (newest first)
    backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(backups);
  } catch (error) {
    req.app.locals.logger.error('Error listing backups', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download backup file
router.get('/:filename/download', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(req.app.locals.BACKUP_DIR, filename);
    
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({ success: false, error: 'Backup file not found' });
    }
    
    // Security check: ensure filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }
    
    res.download(filePath, filename, (error) => {
      if (error) {
        req.app.locals.logger.error('Error downloading backup', { 
          filename, 
          error: error.message 
        });
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Download failed' });
        }
      }
    });
    
  } catch (error) {
    req.app.locals.logger.error('Error downloading backup', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete backup file
router.delete('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(req.app.locals.BACKUP_DIR, filename);
    
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({ success: false, error: 'Backup file not found' });
    }
    
    // Security check: ensure filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ success: false, error: 'Invalid filename' });
    }
    
    await fs.remove(filePath);
    
    req.app.locals.logger.info('Backup file deleted', { filename });
    res.json({ success: true, message: 'Backup deleted successfully' });
    
  } catch (error) {
    req.app.locals.logger.error('Error deleting backup', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get backup statistics
router.get('/stats', async (req, res) => {
  try {
    const backupDir = req.app.locals.BACKUP_DIR;
    const files = await fs.readdir(backupDir);
    
    let totalSize = 0;
    let totalFiles = 0;
    let oldestBackup = null;
    let newestBackup = null;
    
    for (const file of files) {
      if (file.endsWith('.zip')) {
        const filePath = path.join(backupDir, file);
        const stats = await fs.stat(filePath);
        
        totalSize += stats.size;
        totalFiles++;
        
        if (!oldestBackup || stats.mtime < oldestBackup) {
          oldestBackup = stats.mtime;
        }
        
        if (!newestBackup || stats.mtime > newestBackup) {
          newestBackup = stats.mtime;
        }
      }
    }
    
    res.json({
      totalFiles,
      totalSize,
      oldestBackup,
      newestBackup,
      averageSize: totalFiles > 0 ? totalSize / totalFiles : 0
    });
    
  } catch (error) {
    req.app.locals.logger.error('Error getting backup stats', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
