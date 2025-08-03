const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const DebugService = require('../services/DebugService');

// Debug routes
router.use((req, res, next) => {
  // Initialize debug service if not already done
  if (!req.app.locals.debugService) {
    req.app.locals.debugService = new DebugService(
      req.app.locals.DATA_DIR,
      req.app.locals.logger
    );
  }
  next();
});

/**
 * GET /api/debug/status
 * Get debug status and basic information
 */
router.get('/status', async (req, res) => {
  try {
    const debugService = req.app.locals.debugService;
    
    const status = {
      debugMode: process.env.DEBUG_MODE === 'true',
      debugLevel: process.env.DEBUG_LEVEL || 'info',
      debugDir: debugService.debugDir,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid
    };

    debugService.debug('Debug status requested', { ip: req.ip });
    res.json({ success: true, data: status });
  } catch (error) {
    req.app.locals.logger.error('Failed to get debug status', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/debug/system-info
 * Collect comprehensive system information
 */
router.get('/system-info', async (req, res) => {
  try {
    const debugService = req.app.locals.debugService;
    
    debugService.debug('System info collection requested', { ip: req.ip });
    const systemInfo = await debugService.collectSystemInfo();
    
    res.json({ success: true, data: systemInfo });
  } catch (error) {
    req.app.locals.debugService.error('Failed to collect system info', error, { ip: req.ip });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/debug/health-check
 * Perform comprehensive health check
 */
router.get('/health-check', async (req, res) => {
  try {
    const debugService = req.app.locals.debugService;
    
    debugService.debug('Health check requested', { ip: req.ip });
    const healthCheck = await debugService.performHealthCheck();
    
    res.json({ success: true, data: healthCheck });
  } catch (error) {
    req.app.locals.debugService.error('Failed to perform health check', error, { ip: req.ip });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/debug/test-ssh
 * Test SSH connectivity with detailed debugging
 */
router.post('/test-ssh', async (req, res) => {
  try {
    const debugService = req.app.locals.debugService;
    const { host, username, port, password, sshKeyPath } = req.body;
    
    if (!host || !username) {
      return res.status(400).json({ 
        success: false, 
        error: 'Host and username are required' 
      });
    }

    const config = {
      host,
      username,
      port: port || 22,
      password,
      sshKeyPath
    };

    debugService.debug('SSH test requested', { 
      ip: req.ip, 
      host, 
      username, 
      port: port || 22 
    });

    const testResult = await debugService.testSSHConnection(config);
    
    res.json({ success: true, data: testResult });
  } catch (error) {
    req.app.locals.debugService.error('SSH test failed', error, { ip: req.ip });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/debug/logs
 * Get recent log entries with filtering
 */
router.get('/logs', async (req, res) => {
  try {
    const debugService = req.app.locals.debugService;
    const { 
      type = 'all', 
      lines = 100, 
      level = 'all',
      since
    } = req.query;

    debugService.debug('Log retrieval requested', { 
      ip: req.ip, 
      type, 
      lines: Number(lines), 
      level 
    });

    let logFiles = [];
    const dataDir = req.app.locals.DATA_DIR;

    switch (type) {
      case 'error':
        logFiles = [path.join(dataDir, 'error.log')];
        break;
      case 'combined':
        logFiles = [path.join(dataDir, 'combined.log')];
        break;
      case 'debug':
        logFiles = [path.join(debugService.debugDir, 'debug.log')];
        break;
      case 'supervisor':
        logFiles = [
          '/var/log/supervisor/supervisord.log',
          '/var/log/supervisor/backend.err.log',
          '/var/log/supervisor/backend.out.log',
          '/var/log/supervisor/nginx.err.log',
          '/var/log/supervisor/nginx.out.log'
        ];
        break;
      default:
        logFiles = [
          path.join(dataDir, 'combined.log'),
          path.join(dataDir, 'error.log'),
          path.join(debugService.debugDir, 'debug.log')
        ];
    }

    const logs = {};
    const maxLines = Math.min(Number(lines), 1000); // Cap at 1000 lines

    for (const logFile of logFiles) {
      try {
        if (await fs.pathExists(logFile)) {
          const logLines = await debugService.getRecentLogLines(logFile, maxLines);
          
          // Filter by level if specified
          if (level !== 'all') {
            const filteredLines = logLines.filter(line => 
              line.toLowerCase().includes(level.toLowerCase())
            );
            logs[path.basename(logFile)] = filteredLines;
          } else {
            logs[path.basename(logFile)] = logLines;
          }
        }
      } catch (error) {
        logs[path.basename(logFile)] = [`Error reading log: ${error.message}`];
      }
    }

    res.json({ success: true, data: logs });
  } catch (error) {
    req.app.locals.debugService.error('Failed to retrieve logs', error, { ip: req.ip });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/debug/log-analysis
 * Analyze logs for patterns and issues
 */
router.get('/log-analysis', async (req, res) => {
  try {
    const debugService = req.app.locals.debugService;
    
    debugService.debug('Log analysis requested', { ip: req.ip });
    const analysis = await debugService.analyzeRecentLogs();
    
    res.json({ success: true, data: analysis });
  } catch (error) {
    req.app.locals.debugService.error('Failed to analyze logs', error, { ip: req.ip });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/debug/report
 * Generate comprehensive debug report
 */
router.post('/report', async (req, res) => {
  try {
    const debugService = req.app.locals.debugService;
    
    debugService.debug('Debug report generation requested', { ip: req.ip });
    const report = await debugService.generateDebugReport();
    
    res.json({ success: true, data: report });
  } catch (error) {
    req.app.locals.debugService.error('Failed to generate debug report', error, { ip: req.ip });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/debug/files
 * List debug files available for download
 */
router.get('/files', async (req, res) => {
  try {
    const debugService = req.app.locals.debugService;
    
    debugService.debug('Debug files list requested', { ip: req.ip });
    const files = await debugService.getDebugFiles();
    
    res.json({ success: true, data: files });
  } catch (error) {
    req.app.locals.debugService.error('Failed to list debug files', error, { ip: req.ip });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/debug/files/:filename
 * Download a specific debug file
 */
router.get('/files/:filename', async (req, res) => {
  try {
    const debugService = req.app.locals.debugService;
    const filename = req.params.filename;
    
    // Security check - ensure filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid filename' 
      });
    }

    const filePath = path.join(debugService.debugDir, filename);
    
    if (!(await fs.pathExists(filePath))) {
      return res.status(404).json({ 
        success: false, 
        error: 'File not found' 
      });
    }

    debugService.debug('Debug file download requested', { 
      ip: req.ip, 
      filename,
      filePath 
    });

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      debugService.error('Error streaming debug file', error, { filename });
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to stream file' });
      }
    });

  } catch (error) {
    req.app.locals.debugService.error('Failed to download debug file', error, { 
      ip: req.ip, 
      filename: req.params.filename 
    });
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

/**
 * POST /api/debug/cleanup
 * Clean up old debug files
 */
router.post('/cleanup', async (req, res) => {
  try {
    const debugService = req.app.locals.debugService;
    
    debugService.debug('Debug cleanup requested', { ip: req.ip });
    const cleanedCount = await debugService.cleanupOldDebugFiles();
    
    res.json({ 
      success: true, 
      data: { 
        cleanedFiles: cleanedCount,
        message: `Cleaned up ${cleanedCount} old debug files`
      }
    });
  } catch (error) {
    req.app.locals.debugService.error('Failed to cleanup debug files', error, { ip: req.ip });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/debug/environment
 * Get environment variables and configuration
 */
router.get('/environment', async (req, res) => {
  try {
    const debugService = req.app.locals.debugService;
    
    debugService.debug('Environment info requested', { ip: req.ip });
    
    // Sanitize environment variables (remove sensitive data)
    const env = { ...process.env };
    Object.keys(env).forEach(key => {
      if (key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('key') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('webhook')) {
        env[key] = '***REDACTED***';
      }
    });

    const environment = {
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
        argv: process.argv,
        execPath: process.execPath,
        cwd: process.cwd()
      },
      environment: env,
      config: {
        dataDir: req.app.locals.DATA_DIR,
        backupDir: req.app.locals.BACKUP_DIR
      }
    };
    
    res.json({ success: true, data: environment });
  } catch (error) {
    req.app.locals.debugService.error('Failed to get environment info', error, { ip: req.ip });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
