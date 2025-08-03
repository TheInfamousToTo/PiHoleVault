const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');
const cron = require('node-cron');

// Import route modules
const configRoutes = require('./routes/config');
const piholeRoutes = require('./routes/pihole');
const backupRoutes = require('./routes/backup');
const sshRoutes = require('./routes/ssh');
const scheduleRoutes = require('./routes/schedule');
const jobRoutes = require('./routes/jobs');
const discordRoutes = require('./routes/discord');
const debugRoutes = require('./routes/debug');

// Import services
const BackupService = require('./services/BackupService');
const ScheduleService = require('./services/ScheduleService');
const DebugService = require('./services/DebugService');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || './data';
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';

// Ensure directories exist
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(BACKUP_DIR);

// Configure logger with enhanced Docker-friendly output
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join(DATA_DIR, 'error.log'), 
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({ 
      filename: path.join(DATA_DIR, 'combined.log'),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      tailable: true
    }),
    // Enhanced console output for Docker logs
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let log = `[${timestamp}] ${level}: ${message}`;
          
          // Add metadata if present
          if (Object.keys(meta).length > 0) {
            log += ` | ${JSON.stringify(meta)}`;
          }
          
          return log;
        })
      ),
      level: process.env.DEBUG_MODE === 'true' ? 'debug' : 'info'
    })
  ]
});

// Add a special transport for Docker logs when running in container
if (process.env.NODE_ENV === 'production' || process.env.DOCKER_ENV === 'true') {
  // Add stdout transport for better Docker log visibility
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `🐳 PiHoleVault [${timestamp}] ${level.toUpperCase()}: ${message}`;
        
        // Add metadata for important logs
        if (Object.keys(meta).length > 0 && (level === 'error' || level === 'warn' || process.env.DEBUG_MODE === 'true')) {
          log += ` | Details: ${JSON.stringify(meta)}`;
        }
        
        return log;
      })
    ),
    level: process.env.DEBUG_MODE === 'true' ? 'debug' : 'info',
    silent: false
  }));
}

// Initialize debug service
const debugService = new DebugService(DATA_DIR, logger);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging with enhanced debug information
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Enhanced logging for debug mode
  const logData = { 
    ip: req.ip, 
    userAgent: req.get('User-Agent'),
    method: req.method,
    path: req.path,
    query: req.query
  };

  // Add body for POST/PUT requests in debug mode
  if (process.env.DEBUG_MODE === 'true' && 
      ['POST', 'PUT', 'PATCH'].includes(req.method) && 
      req.path !== '/api/ssh/test' && // Don't log sensitive SSH test data
      req.path !== '/api/config') {   // Don't log config data
    logData.body = req.body;
  }

  logger.info(`${req.method} ${req.path}`, logData);
  
  // Add response time logging
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.path} completed`, {
      ...logData,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
    
    if (process.env.DEBUG_MODE === 'true') {
      debugService.debug('Request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip
      });
    }
  });
  
  next();
});

// Make logger, debug service and directories available to routes
app.locals.logger = logger;
app.locals.debugService = debugService;
app.locals.DATA_DIR = DATA_DIR;
app.locals.BACKUP_DIR = BACKUP_DIR;

// Routes
app.use('/api/config', configRoutes);
app.use('/api/pihole', piholeRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/backups', backupRoutes);  // Add alias for backups endpoint
app.use('/api/ssh', sshRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/discord', discordRoutes);
app.use('/api/debug', debugRoutes);

// Health check endpoint with enhanced debug information
app.get('/health', (req, res) => {
  const healthData = { 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('./package.json').version,
    environment: process.env.NODE_ENV || 'development',
    debugMode: process.env.DEBUG_MODE === 'true',
    memory: process.memoryUsage(),
    pid: process.pid
  };

  // Add debug information if debug mode is enabled
  if (process.env.DEBUG_MODE === 'true') {
    healthData.debug = {
      dataDir: DATA_DIR,
      backupDir: BACKUP_DIR,
      logLevel: process.env.LOG_LEVEL || 'info',
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  res.json(healthData);
});

// Error handling middleware with enhanced debugging
app.use((error, req, res, next) => {
  const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const errorData = {
    errorId,
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  };

  logger.error('Unhandled error', errorData);
  
  // Enhanced debug logging
  if (process.env.DEBUG_MODE === 'true') {
    debugService.error('Unhandled application error', error, {
      errorId,
      path: req.path,
      method: req.method,
      ip: req.ip,
      query: req.query,
      body: req.body
    });
  }

  // Return error ID for debugging in production
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    errorId: process.env.DEBUG_MODE === 'true' ? errorId : undefined,
    details: process.env.DEBUG_MODE === 'true' ? error.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Route not found' 
  });
});

// Initialize services
const backupService = new BackupService(DATA_DIR, BACKUP_DIR, logger);
const scheduleService = new ScheduleService(backupService, DATA_DIR, logger);

// Make services available to routes
app.locals.backupService = backupService;
app.locals.scheduleService = scheduleService;

// Start the server
app.listen(PORT, () => {
  logger.info(`PiHoleVault server starting`, {
    port: PORT,
    nodeVersion: process.version,
    platform: process.platform,
    environment: process.env.NODE_ENV || 'development',
    debugMode: process.env.DEBUG_MODE === 'true',
    logLevel: process.env.LOG_LEVEL || 'info',
    dataDir: DATA_DIR,
    backupDir: BACKUP_DIR,
    pid: process.pid
  });
  
  // Debug mode startup information
  if (process.env.DEBUG_MODE === 'true') {
    debugService.info('Server started in debug mode', {
      port: PORT,
      routes: [
        '/api/config', '/api/pihole', '/api/backup', '/api/ssh',
        '/api/schedule', '/api/jobs', '/api/discord', '/api/debug'
      ],
      debugEndpoints: [
        '/api/debug/status', '/api/debug/system-info', '/api/debug/health-check',
        '/api/debug/test-ssh', '/api/debug/logs', '/api/debug/report'
      ]
    });
  }
  
  // Initialize scheduled jobs
  scheduleService.initializeScheduledJobs()
    .then(() => {
      logger.info('Scheduled jobs initialized successfully');
      if (process.env.DEBUG_MODE === 'true') {
        debugService.debug('Scheduled jobs initialization completed');
      }
    })
    .catch((error) => {
      logger.error('Failed to initialize scheduled jobs', { error: error.message, stack: error.stack });
      debugService.error('Failed to initialize scheduled jobs', error);
    });

  // Clean up old debug files on startup
  if (process.env.DEBUG_MODE === 'true') {
    setTimeout(async () => {
      try {
        const cleanedCount = await debugService.cleanupOldDebugFiles();
        debugService.debug('Startup debug cleanup completed', { cleanedCount });
      } catch (error) {
        debugService.error('Failed to cleanup debug files on startup', error);
      }
    }, 5000); // Wait 5 seconds after startup
  }
});

module.exports = app;
