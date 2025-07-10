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

// Import services
const BackupService = require('./services/BackupService');
const ScheduleService = require('./services/ScheduleService');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || './data';
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';

// Ensure directories exist
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(BACKUP_DIR);

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(DATA_DIR, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(DATA_DIR, 'combined.log') }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { 
    ip: req.ip, 
    userAgent: req.get('User-Agent') 
  });
  next();
});

// Make logger and directories available to routes
app.locals.logger = logger;
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error', { error: error.message, stack: error.stack });
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
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
  logger.info(`Server running on port ${PORT}`);
  
  // Initialize scheduled jobs
  scheduleService.initializeScheduledJobs()
    .then(() => {
      logger.info('Scheduled jobs initialized');
    })
    .catch((error) => {
      logger.error('Failed to initialize scheduled jobs', { error: error.message });
    });
});

module.exports = app;
