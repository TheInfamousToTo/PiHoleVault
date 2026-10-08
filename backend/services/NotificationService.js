const axios = require('axios');
const nodemailer = require('nodemailer');
const { parseHttpUrl } = require('./StorageService');
const { trimEndChar } = require('../utils/text');

/**
 * Backup notifications over several channels.
 *
 * Channels live in config.notifications.channels; each has a `type`, its own
 * credentials and `notifyOnSuccess` / `notifyOnFailure` switches. The Discord
 * webhook configured before 2.1 (config.discord, or DISCORD_WEBHOOK_URL) is
 * presented as one more channel, so existing setups keep notifying with no
 * migration step.
 *
 * Credentials sit in fields whose names the config redaction already masks:
 * webhookUrl, token, botToken, appToken, password.
 */

const TYPES = ['discord', 'ntfy', 'gotify', 'telegram', 'webhook', 'email'];

const COLORS = { success: 0x34d399, failure: 0xf2706a, warning: 0xf5b451, test: 0x5b8cff };
const ICONS = { success: '✅', failure: '❌', warning: '⚠️', test: '🔔' };

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

/**
 * Turn a backup outcome into channel-neutral text.
 */
function buildMessage(event, details = {}) {
  const lines = [];
  if (details.instance) lines.push(`Pi-hole: ${details.instance}`);
  if (details.filename) lines.push(`File: ${details.filename}`);
  if (details.size) lines.push(`Size: ${formatBytes(details.size)}`);
  if (details.offsite) lines.push(`Off-site: ${details.offsite}`);
  if (details.error) lines.push(`Error: ${details.error}`);

  const titles = {
    success: 'Pi-hole backup completed',
    failure: 'Pi-hole backup failed',
    warning: 'Pi-hole backup needs attention',
    test: 'PiHoleVault test notification'
  };

  return {
    event,
    title: details.title || titles[event] || 'PiHoleVault',
    text: details.text || (event === 'test' ? 'Notifications from PiHoleVault are working.' : lines.join('\n')),
    fields: details
  };
}

/**
 * The channel list, with the legacy Discord settings folded in.
 */
function resolveChannels(config = {}) {
  const channels = Array.isArray(config.notifications?.channels)
    ? config.notifications.channels.filter((c) => c && TYPES.includes(c.type))
    : [];

  const legacyWebhook = process.env.DISCORD_WEBHOOK_URL || config.discord?.webhookUrl;
  if (legacyWebhook && !channels.some((c) => c.id === 'discord-legacy')) {
    channels.unshift({
      id: 'discord-legacy',
      type: 'discord',
      name: 'Discord',
      enabled: config.discord?.enabled !== false,
      webhookUrl: legacyWebhook,
      notifyOnSuccess: config.discord?.notifyOnSuccess !== false,
      notifyOnFailure: config.discord?.notifyOnFailure !== false
    });
  }

  return channels;
}

function wants(channel, event) {
  if (channel.enabled === false) return false;
  if (event === 'success') return channel.notifyOnSuccess !== false;
  if (event === 'failure' || event === 'warning') return channel.notifyOnFailure !== false;
  return true;
}

class NotificationService {
  constructor(logger = console) {
    this.logger = logger;
  }

  async sendTo(channel, message) {
    const post = (url, data, headers = {}) =>
      axios.post(url, data, { headers, timeout: 15000, maxRedirects: 0 });

    switch (channel.type) {
      case 'discord': {
        const url = parseHttpUrl(channel.webhookUrl, 'Discord webhook URL');
        if (!/(^|\.)discord(app)?\.com$/.test(url.hostname)) {
          throw new Error('Discord webhook URL must be on discord.com');
        }
        return post(url.toString(), {
          username: 'PiHoleVault',
          embeds: [{
            title: `${ICONS[message.event] || ''} ${message.title}`.trim(),
            description: message.text,
            color: COLORS[message.event] || COLORS.test,
            timestamp: new Date().toISOString(),
            footer: { text: 'PiHoleVault' }
          }]
        });
      }

      case 'ntfy': {
        const server = parseHttpUrl(channel.server || 'https://ntfy.sh', 'ntfy server');
        if (!channel.topic || !/^[A-Za-z0-9_-]{1,64}$/.test(channel.topic)) {
          throw new Error('ntfy needs a topic made of letters, digits, - and _');
        }
        const headers = {
          Title: message.title,
          Priority: message.event === 'failure' ? 'high' : 'default',
          Tags: message.event === 'failure' ? 'x' : message.event === 'success' ? 'white_check_mark' : 'bell'
        };
        if (channel.token) headers.Authorization = `Bearer ${channel.token}`;
        else if (channel.username) {
          headers.Authorization = `Basic ${Buffer.from(`${channel.username}:${channel.password || ''}`).toString('base64')}`;
        }
        const base = trimEndChar(server.toString(), '/');
        return post(`${base}/${channel.topic}`, message.text, headers);
      }

      case 'gotify': {
        const server = parseHttpUrl(channel.server, 'Gotify server');
        if (!channel.appToken) throw new Error('Gotify needs an application token');
        const base = trimEndChar(server.toString(), '/');
        return post(
          `${base}/message`,
          { title: message.title, message: message.text, priority: message.event === 'failure' ? 8 : 4 },
          { 'X-Gotify-Key': channel.appToken }
        );
      }

      case 'telegram': {
        if (!channel.botToken || !/^\d+:[A-Za-z0-9_-]+$/.test(channel.botToken)) {
          throw new Error('Telegram needs a bot token from @BotFather (123456:ABC...)');
        }
        if (!channel.chatId || !/^-?\d+$|^@[A-Za-z0-9_]{5,}$/.test(String(channel.chatId))) {
          throw new Error('Telegram needs a numeric chat ID or an @channel name');
        }
        return post(`https://api.telegram.org/bot${channel.botToken}/sendMessage`, {
          chat_id: channel.chatId,
          text: `${ICONS[message.event] || ''} ${message.title}\n\n${message.text}`.trim(),
          disable_web_page_preview: true
        });
      }

      case 'webhook': {
        const url = parseHttpUrl(channel.webhookUrl, 'Webhook URL');
        return post(url.toString(), {
          source: 'piholevault',
          event: message.event,
          title: message.title,
          message: message.text,
          details: message.fields,
          timestamp: new Date().toISOString()
        });
      }

      case 'email': {
        if (!channel.host || !channel.to) throw new Error('Email needs an SMTP host and a recipient');
        const transport = nodemailer.createTransport({
          host: channel.host,
          port: Number(channel.port) || 587,
          secure: channel.secure === true,
          auth: channel.username ? { user: channel.username, pass: channel.password || '' } : undefined,
          connectionTimeout: 15000
        });
        return transport.sendMail({
          from: channel.from || channel.username || 'piholevault@localhost',
          to: channel.to,
          subject: `${ICONS[message.event] || ''} ${message.title}`.trim(),
          text: message.text
        });
      }

      default:
        throw new Error(`Unknown channel type: ${channel.type}`);
    }
  }

  /**
   * Notify every channel that wants this event. Never throws: a broken
   * notification must not turn a good backup into a failed one.
   */
  async notify(config, event, details) {
    const message = buildMessage(event, details);
    const targets = resolveChannels(config).filter((channel) => wants(channel, event));

    const results = await Promise.all(targets.map(async (channel) => {
      try {
        await this.sendTo(channel, message);
        return { id: channel.id, type: channel.type, ok: true };
      } catch (error) {
        const reason = error.response ? `HTTP ${error.response.status}` : error.message;
        this.logger.warn('Notification failed', { channel: channel.id, type: channel.type, error: reason });
        return { id: channel.id, type: channel.type, ok: false, error: reason };
      }
    }));

    return results;
  }

  async test(config, channelId) {
    const channel = resolveChannels(config).find((c) => c.id === channelId);
    if (!channel) throw new Error('No saved channel with that id; save the channel first, then test it');
    try {
      await this.sendTo(channel, buildMessage('test'));
      return { success: true, message: `Test notification sent via ${channel.name || channel.type}` };
    } catch (error) {
      const reason = error.response ? `HTTP ${error.response.status}` : error.message;
      return { success: false, error: reason };
    }
  }
}

NotificationService.TYPES = TYPES;
NotificationService.resolveChannels = resolveChannels;
NotificationService.buildMessage = buildMessage;

module.exports = NotificationService;
