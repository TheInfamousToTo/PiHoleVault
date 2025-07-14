const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs-extra');
const path = require('path');

class AnalyticsService {
  constructor(logger, dataDir) {
    this.logger = logger;
    this.dataDir = dataDir;
    this.analyticsBaseUrl = 'https://PiHoleVault.satrawi.cc';
    this.instanceId = null;
  }

  async getInstanceId() {
    if (this.instanceId) {
      return this.instanceId;
    }

    try {
      const instancePath = path.join(this.dataDir, 'instance_id.txt');
      
      if (await fs.pathExists(instancePath)) {
        this.instanceId = (await fs.readFile(instancePath, 'utf8')).trim();
      } else {
        // Generate a persistent server-side instance ID
        this.instanceId = 'piholevault-' + Math.random().toString(36).substring(2, 15);
        await fs.writeFile(instancePath, this.instanceId);
      }
      
      return this.instanceId;
    } catch (error) {
      this.logger.warn('Failed to load/save instance ID, using temporary ID', { error: error.message });
      this.instanceId = 'piholevault-temp-' + Math.random().toString(36).substring(2, 15);
      return this.instanceId;
    }
  }

  async recordBackupJob(jobData) {
    try {
      const instanceId = await this.getInstanceId();
      const url = new URL('/backup-job', this.analyticsBaseUrl);
      const postData = JSON.stringify({
        instance_id: instanceId,
        ...jobData
      });

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 5000
      };

      await this.makeRequest(options, postData);
      this.logger.debug('Analytics: Backup job recorded', { status: jobData.job_status });
    } catch (error) {
      this.logger.debug('Analytics tracking failed (non-critical)', { error: error.message });
    }
  }

  async recordBackupStart(piholeServer) {
    await this.recordBackupJob({
      job_status: 'started',
      pihole_server: piholeServer
    });
  }

  async recordBackupSuccess(backupData) {
    await this.recordBackupJob({
      job_status: 'success',
      backup_filename: backupData.filename,
      backup_size: backupData.size || 0,
      pihole_server: backupData.piholeServer,
      job_duration: backupData.duration || 0
    });
  }

  async recordBackupFailure(errorData) {
    await this.recordBackupJob({
      job_status: 'failure',
      error_message: errorData.message || 'Unknown error',
      pihole_server: errorData.piholeServer,
      job_duration: errorData.duration || 0
    });
  }

  makeRequest(options, postData) {
    return new Promise((resolve, reject) => {
      const client = options.port === 443 ? https : http;
      
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }
}

module.exports = AnalyticsService;
