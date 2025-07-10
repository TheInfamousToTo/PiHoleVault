const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const router = express.Router();

// Run backup now
router.post('/run', async (req, res) => {
  try {
    const result = await req.app.locals.backupService.runBackup();
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Backup completed successfully',
        filename: result.filename 
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
