const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const { URL } = require('url');

class DiscordService {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Send a Discord notification via webhook
   * @param {string} webhookUrl - Discord webhook URL
   * @param {Object} payload - Message payload
   */
  async sendNotification(webhookUrl, payload) {
    try {
      if (!webhookUrl) {
        this.logger.warn('Discord webhook URL not configured, skipping notification');
        return { success: false, error: 'Webhook URL not configured' };
      }

      const url = new URL(webhookUrl);
      const data = JSON.stringify(payload);

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      };

      return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let responseData = '';
          
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              this.logger.info('Discord notification sent successfully');
              resolve({ success: true });
            } else {
              const error = `Discord webhook failed: ${res.statusCode} ${res.statusMessage}`;
              this.logger.error(error);
              resolve({ success: false, error });
            }
          });
        });

        req.on('error', (error) => {
          this.logger.error('Failed to send Discord notification', { error: error.message });
          resolve({ success: false, error: error.message });
        });

        req.write(data);
        req.end();
      });
    } catch (error) {
      this.logger.error('Failed to send Discord notification', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a rich embed for successful backup notification
   * @param {Object} backupData - Backup result data
   */
  createSuccessEmbed(backupData) {
    const { filename, size, jobId, pihole } = backupData;
    const timestamp = new Date().toISOString();
    const fileSizeMB = (size / (1024 * 1024)).toFixed(2);

    return {
      username: 'PiHoleVault',
      avatar_url: 'https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/logo.png',
      embeds: [
        {
          title: '✅ Pi-hole Backup Successful',
          description: 'Your Pi-hole configuration has been successfully backed up!',
          color: 0x00ff00, // Green color
          fields: [
            {
              name: '📁 Backup File',
              value: `\`${filename}\``,
              inline: true
            },
            {
              name: '📊 File Size',
              value: `${fileSizeMB} MB`,
              inline: true
            },
            {
              name: '🔗 Pi-hole Server',
              value: `${pihole?.host || 'Unknown'}:${pihole?.port || 22}`,
              inline: true
            },
            {
              name: '🆔 Job ID',
              value: `\`${jobId}\``,
              inline: false
            }
          ],
          thumbnail: {
            url: 'https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/logo.png'
          },
          footer: {
            text: 'PiHoleVault - Pi-hole Backup Manager',
            icon_url: 'https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/favicon.ico'
          },
          timestamp: timestamp
        }
      ]
    };
  }

  /**
   * Create a rich embed for failed backup notification
   * @param {Object} errorData - Error data
   */
  createErrorEmbed(errorData) {
    const { error, jobId, pihole } = errorData;
    const timestamp = new Date().toISOString();

    return {
      username: 'PiHoleVault',
      avatar_url: 'https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/logo.png',
      embeds: [
        {
          title: '❌ Pi-hole Backup Failed',
          description: 'There was an error during the backup process.',
          color: 0xff0000, // Red color
          fields: [
            {
              name: '❗ Error Details',
              value: `\`\`\`${error}\`\`\``,
              inline: false
            },
            {
              name: '🔗 Pi-hole Server',
              value: `${pihole?.host || 'Unknown'}:${pihole?.port || 22}`,
              inline: true
            },
            {
              name: '🆔 Job ID',
              value: `\`${jobId}\``,
              inline: true
            }
          ],
          thumbnail: {
            url: 'https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/logo.png'
          },
          footer: {
            text: 'PiHoleVault - Pi-hole Backup Manager',
            icon_url: 'https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/favicon.ico'
          },
          timestamp: timestamp
        }
      ]
    };
  }

  /**
   * Send backup success notification
   * @param {string} webhookUrl - Discord webhook URL
   * @param {Object} backupData - Backup result data
   */
  async sendBackupSuccess(webhookUrl, backupData) {
    const embed = this.createSuccessEmbed(backupData);
    return await this.sendNotification(webhookUrl, embed);
  }

  /**
   * Send backup failure notification
   * @param {string} webhookUrl - Discord webhook URL
   * @param {Object} errorData - Error data
   */
  async sendBackupFailure(webhookUrl, errorData) {
    const embed = this.createErrorEmbed(errorData);
    return await this.sendNotification(webhookUrl, embed);
  }

  /**
   * Test Discord webhook connection
   * @param {string} webhookUrl - Discord webhook URL
   */
  async testWebhook(webhookUrl) {
    const testPayload = {
      username: 'PiHoleVault',
      avatar_url: 'https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/logo.png',
      embeds: [
        {
          title: '🧪 Discord Integration Test',
          description: 'This is a test message to verify your Discord webhook is working correctly.',
          color: 0x0099ff, // Blue color
          fields: [
            {
              name: '✅ Status',
              value: 'Discord notifications are configured and working!',
              inline: false
            }
          ],
          thumbnail: {
            url: 'https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/logo.png'
          },
          footer: {
            text: 'PiHoleVault - Pi-hole Backup Manager',
            icon_url: 'https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/favicon.ico'
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    return await this.sendNotification(webhookUrl, testPayload);
  }
}

module.exports = DiscordService;
