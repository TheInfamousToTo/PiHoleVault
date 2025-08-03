const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');
const { NodeSSH } = require('node-ssh');

/**
 * DebugService - Comprehensive debugging and logging service
 * Provides detailed logging, system information collection, and troubleshooting tools
 */
class DebugService {
  constructor(dataDir, logger) {
    this.dataDir = dataDir;
    this.logger = logger;
    this.debugDir = path.join(dataDir, 'debug');
    this.logRetentionDays = 30; // Keep debug logs for 30 days
    
    // Ensure debug directory exists
    fs.ensureDirSync(this.debugDir);
    
    // Create debug-specific logger with more detailed formatting
    this.debugLogger = winston.createLogger({
      level: process.env.DEBUG_LEVEL || 'debug',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
          const stackStr = stack ? `\nStack: ${stack}` : '';
          return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}${stackStr}`;
        })
      ),
      transports: [
        new winston.transports.File({
          filename: path.join(this.debugDir, 'debug.log'),
          level: 'debug',
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 10,
          tailable: true
        }),
        new winston.transports.File({
          filename: path.join(this.debugDir, 'error-debug.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          tailable: true
        })
      ]
    });

    // Add console transport if debug mode is enabled
    if (process.env.DEBUG_MODE === 'true') {
      this.debugLogger.add(new winston.transports.Console({
        level: 'debug',
        format: winston.format.combine(
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            let log = `🔍 DEBUG [${timestamp}] ${level}: ${message}`;
            if (Object.keys(meta).length > 0) {
              log += ` | ${JSON.stringify(meta)}`;
            }
            return log;
          })
        )
      }));
    }

    // Also add console transport for Docker logs (errors and warnings always visible)
    if (process.env.DOCKER_ENV === 'true') {
      this.debugLogger.add(new winston.transports.Console({
        level: 'warn', // Only show warnings and errors in Docker logs unless debug mode
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            let log = `🔍 PiHoleVault-Debug [${timestamp}] ${level.toUpperCase()}: ${message}`;
            if (Object.keys(meta).length > 0) {
              log += ` | Details: ${JSON.stringify(meta)}`;
            }
            return log;
          })
        )
      }));
    }

    this.debugLogger.info('DebugService initialized', {
      debugDir: this.debugDir,
      debugLevel: process.env.DEBUG_LEVEL || 'debug',
      debugMode: process.env.DEBUG_MODE === 'true'
    });
  }

  /**
   * Log debug information with context
   */
  debug(message, context = {}) {
    this.debugLogger.debug(message, {
      ...context,
      timestamp: new Date().toISOString(),
      processId: process.pid,
      memory: process.memoryUsage()
    });
  }

  /**
   * Log error with full context and stack trace
   */
  error(message, error, context = {}) {
    this.debugLogger.error(message, {
      ...context,
      error: {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        code: error?.code
      },
      timestamp: new Date().toISOString(),
      processId: process.pid
    });
  }

  /**
   * Log warning with context
   */
  warn(message, context = {}) {
    this.debugLogger.warn(message, {
      ...context,
      timestamp: new Date().toISOString(),
      processId: process.pid
    });
  }

  /**
   * Log info with context
   */
  info(message, context = {}) {
    this.debugLogger.info(message, {
      ...context,
      timestamp: new Date().toISOString(),
      processId: process.pid
    });
  }

  /**
   * Collect comprehensive system information for debugging
   */
  async collectSystemInfo() {
    try {
      const systemInfo = {
        timestamp: new Date().toISOString(),
        node: {
          version: process.version,
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
          env: {
            NODE_ENV: process.env.NODE_ENV,
            DEBUG_MODE: process.env.DEBUG_MODE,
            DEBUG_LEVEL: process.env.DEBUG_LEVEL,
            DATA_DIR: process.env.DATA_DIR,
            BACKUP_DIR: process.env.BACKUP_DIR
          }
        },
        system: {
          loadavg: require('os').loadavg(),
          totalmem: require('os').totalmem(),
          freemem: require('os').freemem(),
          cpus: require('os').cpus().length,
          hostname: require('os').hostname(),
          platform: require('os').platform(),
          release: require('os').release(),
          arch: require('os').arch()
        },
        directories: await this.getDirectoryInfo(),
        config: await this.getConfigInfo(),
        logs: await this.getRecentLogInfo()
      };

      const infoFile = path.join(this.debugDir, `system-info-${Date.now()}.json`);
      await fs.writeJson(infoFile, systemInfo, { spaces: 2 });
      
      this.debug('System information collected', { infoFile });
      return systemInfo;
    } catch (error) {
      this.error('Failed to collect system information', error);
      throw error;
    }
  }

  /**
   * Get directory information for debugging
   */
  async getDirectoryInfo() {
    const dirs = [this.dataDir, path.dirname(this.dataDir), '/app/backups', '/var/log'];
    const dirInfo = {};

    for (const dir of dirs) {
      try {
        if (await fs.pathExists(dir)) {
          const stat = await fs.stat(dir);
          const files = await fs.readdir(dir);
          dirInfo[dir] = {
            exists: true,
            size: stat.size,
            mode: stat.mode,
            uid: stat.uid,
            gid: stat.gid,
            fileCount: files.length,
            files: files.slice(0, 20) // First 20 files
          };
        } else {
          dirInfo[dir] = { exists: false };
        }
      } catch (error) {
        dirInfo[dir] = { error: error.message };
      }
    }

    return dirInfo;
  }

  /**
   * Get configuration information (sanitized)
   */
  async getConfigInfo() {
    try {
      const configFile = path.join(this.dataDir, 'config.json');
      if (await fs.pathExists(configFile)) {
        const config = await fs.readJson(configFile);
        // Sanitize sensitive information
        const sanitized = JSON.parse(JSON.stringify(config));
        if (sanitized.pihole?.password) sanitized.pihole.password = '***REDACTED***';
        if (sanitized.discord?.webhookUrl) sanitized.discord.webhookUrl = '***REDACTED***';
        return sanitized;
      }
      return { error: 'Config file not found' };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Get recent log information
   */
  async getRecentLogInfo() {
    const logInfo = {};
    const logFiles = [
      path.join(this.dataDir, 'combined.log'),
      path.join(this.dataDir, 'error.log'),
      '/var/log/supervisor/supervisord.log',
      '/var/log/supervisor/backend.err.log',
      '/var/log/supervisor/backend.out.log',
      '/var/log/supervisor/nginx.err.log',
      '/var/log/supervisor/nginx.out.log'
    ];

    for (const logFile of logFiles) {
      try {
        if (await fs.pathExists(logFile)) {
          const stat = await fs.stat(logFile);
          logInfo[logFile] = {
            exists: true,
            size: stat.size,
            mtime: stat.mtime,
            recentLines: await this.getRecentLogLines(logFile, 50)
          };
        } else {
          logInfo[logFile] = { exists: false };
        }
      } catch (error) {
        logInfo[logFile] = { error: error.message };
      }
    }

    return logInfo;
  }

  /**
   * Get recent lines from a log file
   */
  async getRecentLogLines(logFile, lineCount = 50) {
    try {
      const content = await fs.readFile(logFile, 'utf8');
      const lines = content.split('\n');
      return lines.slice(-lineCount).filter(line => line.trim());
    } catch (error) {
      return [`Error reading log: ${error.message}`];
    }
  }

  /**
   * Test SSH connectivity with detailed debugging
   */
  async testSSHConnection(config) {
    const testId = `ssh_test_${Date.now()}`;
    this.debug('Starting SSH connectivity test', { testId, host: config.host });

    const ssh = new NodeSSH();
    const testResult = {
      testId,
      host: config.host,
      port: config.port || 22,
      username: config.username,
      timestamp: new Date().toISOString(),
      steps: [],
      success: false,
      error: null
    };

    try {
      // Step 1: DNS Resolution
      testResult.steps.push({ step: 'dns_resolution', status: 'attempting' });
      const dns = require('dns').promises;
      try {
        const resolved = await dns.lookup(config.host);
        testResult.steps[0].status = 'success';
        testResult.steps[0].result = resolved;
        this.debug('DNS resolution successful', { testId, resolved });
      } catch (error) {
        testResult.steps[0].status = 'failed';
        testResult.steps[0].error = error.message;
        this.error('DNS resolution failed', error, { testId });
      }

      // Step 2: TCP Connection
      testResult.steps.push({ step: 'tcp_connection', status: 'attempting' });
      const net = require('net');
      const tcpTest = await new Promise((resolve, reject) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error('TCP connection timeout'));
        }, 10000);

        socket.connect(config.port || 22, config.host, () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve({ connected: true });
        });

        socket.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      testResult.steps[1].status = 'success';
      testResult.steps[1].result = tcpTest;
      this.debug('TCP connection successful', { testId });

      // Step 3: SSH Authentication
      testResult.steps.push({ step: 'ssh_auth', status: 'attempting' });
      
      const connectOptions = {
        host: config.host,
        username: config.username,
        port: config.port || 22,
        readyTimeout: 30000,
        algorithms: {
          kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1', 'ecdh-sha2-nistp256'],
          cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
          serverHostKey: ['ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256'],
          hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1']
        }
      };

      if (config.sshKeyPath && await fs.pathExists(config.sshKeyPath)) {
        connectOptions.privateKey = await fs.readFile(config.sshKeyPath, 'utf8');
        testResult.authMethod = 'key';
      } else if (config.password) {
        connectOptions.password = config.password;
        testResult.authMethod = 'password';
      } else {
        throw new Error('No authentication method available');
      }

      await ssh.connect(connectOptions);
      testResult.steps[2].status = 'success';
      this.debug('SSH authentication successful', { testId });

      // Step 4: Command execution test
      testResult.steps.push({ step: 'command_test', status: 'attempting' });
      const result = await ssh.execCommand('echo "SSH test successful" && pwd && whoami');
      testResult.steps[3].status = 'success';
      testResult.steps[3].result = {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code
      };
      this.debug('SSH command test successful', { testId, result });

      testResult.success = true;
      this.debug('SSH connectivity test completed successfully', { testId });

    } catch (error) {
      testResult.success = false;
      testResult.error = {
        message: error.message,
        stack: error.stack,
        code: error.code
      };
      this.error('SSH connectivity test failed', error, { testId });
    } finally {
      try {
        ssh.dispose();
      } catch (error) {
        this.debug('Error disposing SSH connection', { error: error.message });
      }
    }

    // Save test result
    const testFile = path.join(this.debugDir, `ssh-test-${testId}.json`);
    await fs.writeJson(testFile, testResult, { spaces: 2 });

    return testResult;
  }

  /**
   * Generate comprehensive debug report
   */
  async generateDebugReport() {
    const reportId = `debug_report_${Date.now()}`;
    this.debug('Generating debug report', { reportId });

    try {
      const report = {
        reportId,
        timestamp: new Date().toISOString(),
        systemInfo: await this.collectSystemInfo(),
        healthCheck: await this.performHealthCheck(),
        logAnalysis: await this.analyzeRecentLogs()
      };

      const reportFile = path.join(this.debugDir, `debug-report-${reportId}.json`);
      await fs.writeJson(reportFile, report, { spaces: 2 });

      this.debug('Debug report generated', { reportId, reportFile });
      return { reportId, reportFile, report };
    } catch (error) {
      this.error('Failed to generate debug report', error, { reportId });
      throw error;
    }
  }

  /**
   * Perform health check on all components
   */
  async performHealthCheck() {
    const checks = {
      timestamp: new Date().toISOString(),
      directories: {},
      services: {},
      config: {},
      connectivity: {}
    };

    // Directory checks
    const requiredDirs = [this.dataDir, '/app/backups'];
    for (const dir of requiredDirs) {
      try {
        await fs.access(dir, fs.constants.R_OK | fs.constants.W_OK);
        checks.directories[dir] = { status: 'ok', writable: true };
      } catch (error) {
        checks.directories[dir] = { status: 'error', error: error.message };
      }
    }

    // Config check
    try {
      const configFile = path.join(this.dataDir, 'config.json');
      if (await fs.pathExists(configFile)) {
        const config = await fs.readJson(configFile);
        checks.config = {
          status: 'ok',
          hasPihole: !!config.pihole,
          hasSchedule: !!config.schedule,
          hasDiscord: !!config.discord?.webhookUrl
        };
      } else {
        checks.config = { status: 'missing', error: 'Config file not found' };
      }
    } catch (error) {
      checks.config = { status: 'error', error: error.message };
    }

    return checks;
  }

  /**
   * Analyze recent logs for errors and patterns
   */
  async analyzeRecentLogs() {
    const analysis = {
      timestamp: new Date().toISOString(),
      errorPatterns: [],
      warningPatterns: [],
      recentErrors: [],
      logStats: {}
    };

    try {
      const errorLogFile = path.join(this.dataDir, 'error.log');
      if (await fs.pathExists(errorLogFile)) {
        const content = await fs.readFile(errorLogFile, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        analysis.logStats.errorLogLines = lines.length;
        analysis.recentErrors = lines.slice(-20); // Last 20 errors

        // Count error patterns
        const errorCounts = {};
        lines.forEach(line => {
          if (line.includes('SSH')) errorCounts.ssh = (errorCounts.ssh || 0) + 1;
          if (line.includes('ECONNREFUSED')) errorCounts.connection = (errorCounts.connection || 0) + 1;
          if (line.includes('timeout')) errorCounts.timeout = (errorCounts.timeout || 0) + 1;
          if (line.includes('permission')) errorCounts.permission = (errorCounts.permission || 0) + 1;
        });

        analysis.errorPatterns = Object.entries(errorCounts)
          .map(([pattern, count]) => ({ pattern, count }))
          .sort((a, b) => b.count - a.count);
      }
    } catch (error) {
      analysis.error = error.message;
    }

    return analysis;
  }

  /**
   * Clean old debug files
   */
  async cleanupOldDebugFiles() {
    try {
      const files = await fs.readdir(this.debugDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.logRetentionDays);

      let cleanedCount = 0;
      for (const file of files) {
        const filePath = path.join(this.debugDir, file);
        const stat = await fs.stat(filePath);
        
        if (stat.mtime < cutoffDate) {
          await fs.remove(filePath);
          cleanedCount++;
        }
      }

      this.debug('Debug file cleanup completed', { 
        cleanedCount, 
        retentionDays: this.logRetentionDays 
      });
      
      return cleanedCount;
    } catch (error) {
      this.error('Failed to cleanup old debug files', error);
      return 0;
    }
  }

  /**
   * Get debug files list
   */
  async getDebugFiles() {
    try {
      const files = await fs.readdir(this.debugDir);
      const fileInfo = [];

      for (const file of files) {
        const filePath = path.join(this.debugDir, file);
        const stat = await fs.stat(filePath);
        
        fileInfo.push({
          name: file,
          path: filePath,
          size: stat.size,
          mtime: stat.mtime,
          type: path.extname(file)
        });
      }

      return fileInfo.sort((a, b) => b.mtime - a.mtime);
    } catch (error) {
      this.error('Failed to get debug files list', error);
      return [];
    }
  }
}

module.exports = DebugService;
