const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { normalizeConfig, syncPrimaryFromPihole, saveConfig } = require('../utils/configStore');
const {
  redactSecrets,
  mergePreservingSecrets,
  parsePiholeAddress,
  isValidUsername,
  parsePort
} = require('../utils/validate');

const router = express.Router();

const CONFIG_FILE = 'config.json';

/**
 * Reject connection values that the SSH and Pi-hole routes would refuse later,
 * and normalise the host.
 *
 * Those routes validate again before they use a value, so this is not the only
 * line of defence -- it exists so a bad host or port is refused at the point the
 * user submits it rather than silently stored and failing at backup time.
 * Only fields actually present are checked, so partial updates still work.
 *
 * A host given as the admin page URL ("https://pi.hole:8443/admin/") is split
 * into host, useHttps and webPort here, so everything downstream -- including
 * the SSH half of a hybrid backup -- sees a bare hostname.
 */
function validateConnectionFields(pihole) {
  if (!pihole || typeof pihole !== 'object') {
    return null;
  }

  if (pihole.host !== undefined) {
    const address = parsePiholeAddress(pihole.host);

    if (!address) {
      return 'Pi-hole host must be a hostname, IP address or http(s)://host[:port][/admin/] URL';
    }

    if (address.scheme && pihole.connectionMethod === 'ssh') {
      return 'The SSH method needs a hostname or IP address, not a URL';
    }

    pihole.host = address.hostname;

    if (address.scheme) {
      pihole.useHttps = address.scheme === 'https';
      pihole.webPort = address.port || (pihole.useHttps ? 443 : 80);
    }
  }

  if (pihole.username !== undefined && pihole.username !== '' && !isValidUsername(pihole.username)) {
    return 'Username must not contain whitespace or control characters';
  }

  if (pihole.port !== undefined && parsePort(pihole.port, 22) === null) {
    return 'Port must be an integer between 1 and 65535';
  }

  if (pihole.webPort !== undefined && parsePort(pihole.webPort, 80) === null) {
    return 'Web port must be an integer between 1 and 65535';
  }

  if (pihole.allowInsecureTls !== undefined) {
    pihole.allowInsecureTls = pihole.allowInsecureTls === true;
  }

  return null;
}

/**
 * Validate the incoming Pi-hole list, normalising each entry's host.
 */
function validateInstances(instances) {
  if (instances === undefined) return null;
  if (!Array.isArray(instances)) return 'instances must be a list';
  if (instances.length > 20) return 'At most 20 Pi-holes are supported';
  for (const [index, instance] of instances.entries()) {
    if (!instance || typeof instance !== 'object') return `Pi-hole ${index + 1} is not an object`;
    if (!instance.host) return `Pi-hole ${index + 1} has no host`;
    const invalid = validateConnectionFields(instance);
    if (invalid) return `${instance.name || instance.host}: ${invalid}`;
  }
  return null;
}

/**
 * Settings sections the UI may write, with light shape checks. Deeper
 * validation happens where each value is used (storage, notifications).
 */
function validateSections(body) {
  if (body.encryption?.enabled === true && body.encryption.passphrase !== undefined &&
      body.encryption.passphrase !== '***REDACTED***' && String(body.encryption.passphrase).length < 8) {
    return 'The encryption passphrase must be at least 8 characters';
  }
  if (body.offsite && body.offsite.type && !['s3', 'webdav'].includes(body.offsite.type)) {
    return 'Off-site storage type must be s3 or webdav';
  }
  if (body.notifications?.channels !== undefined && !Array.isArray(body.notifications.channels)) {
    return 'notifications.channels must be a list';
  }
  const mode = body.backup?.retention?.mode;
  if (mode !== undefined && !['count', 'gfs'].includes(mode)) {
    return 'Retention mode must be count or gfs';
  }
  return null;
}

// Get configuration status
router.get('/status', (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, CONFIG_FILE);
    const exists = fs.existsSync(configPath);
    
    if (exists) {
      const config = fs.readJsonSync(configPath);
      res.json({ 
        configured: !!(config.pihole && config.pihole.host),
        hasSSHKey: !!(config.sshKeyDeployed)
      });
    } else {
      res.json({ configured: false, hasSSHKey: false });
    }
  } catch (error) {
    req.app.locals.logger.error('Error checking config status', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get full configuration
router.get('/', (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, CONFIG_FILE);
    
    if (fs.existsSync(configPath)) {
      try {
        const config = fs.readJsonSync(configPath);

        // Redact every credential-bearing field, not just pihole.password.
        // webPassword, discord.webhookUrl and connections[].password were all
        // previously served in cleartext to any caller.
        // `runtime` is read-only information for the UI, never stored.
        res.json({
          ...redactSecrets(normalizeConfig(config)),
          runtime: { backupDir: req.app.locals.BACKUP_DIR }
        });
      } catch (readError) {
        req.app.locals.logger.error('Error reading config file', { error: readError.message });
        
        // Return an empty configuration instead of failing
        res.json({
          pihole: { host: '', username: '', port: 22 },
          backup: { destinationPath: '/app/backups', maxBackups: 10 },
          schedule: { enabled: false, cronExpression: '0 3 * * *', timezone: 'UTC' },
          message: 'Using default configuration due to file access error'
        });
      }
    } else {
      // Create a default configuration if none exists
      const defaultConfig = {
        pihole: { host: '', username: '', port: 22 },
        backup: { destinationPath: '/app/backups', maxBackups: 10 },
        schedule: { enabled: false, cronExpression: '0 3 * * *', timezone: 'UTC' },
        message: 'Default configuration'
      };
      
      try {
        fs.writeJsonSync(configPath, defaultConfig, { spaces: 2 });
        req.app.locals.logger.info('Created default configuration file');
      } catch (writeError) {
        req.app.locals.logger.error('Failed to create default config', { error: writeError.message });
      }
      
      res.json(defaultConfig);
    }
  } catch (error) {
    req.app.locals.logger.error('Error handling config request', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save configuration
router.post('/save', async (req, res) => {
  try {
    const config = { ...(req.body || {}) };
    delete config.runtime;
    const configPath = path.join(req.app.locals.DATA_DIR, CONFIG_FILE);
    
    // Validate required fields based on connection method
    if (!config.pihole || !config.pihole.host) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required Pi-hole host configuration' 
      });
    }

    const invalid = validateConnectionFields(config.pihole);

    if (invalid) {
      return res.status(400).json({ success: false, error: invalid });
    }

    // For SSH and hybrid methods, username is required
    if ((config.pihole.connectionMethod === 'ssh' || config.pihole.connectionMethod === 'hybrid') && !config.pihole.username) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username is required for SSH and hybrid connection methods' 
      });
    }

    // No web password check: a Pi-hole with no password set is reachable
    // without one, and the connection test already proved the login works.

    // Merge over what is already stored rather than replacing it. A plain
    // overwrite dropped sshKeyDeployed, sshKeyPath, discord and connections on
    // every save; mergePreservingSecrets also restores any secret the client
    // echoed back as the redaction placeholder and drops prototype-polluting keys.
    let existingConfig = {};

    if (await fs.pathExists(configPath)) {
      try {
        existingConfig = await fs.readJson(configPath);
      } catch (readError) {
        req.app.locals.logger.warn('Existing config unreadable, writing a fresh one', {
          error: readError.message
        });
      }
    }

    const sectionError = validateSections(config) || validateInstances(config.instances);
    if (sectionError) {
      return res.status(400).json({ success: false, error: sectionError });
    }

    const merged = syncPrimaryFromPihole(
      mergePreservingSecrets(normalizeConfig(existingConfig), config),
      config
    );

    merged.createdAt = existingConfig.createdAt || new Date().toISOString();
    merged.updatedAt = new Date().toISOString();

    await saveConfig(req.app.locals.DATA_DIR, merged);
    
    // Reinitialize scheduled jobs with new config
    if (req.app.locals.scheduleService) {
      await req.app.locals.scheduleService.initializeScheduledJobs();
    }
    
    req.app.locals.logger.info('Configuration saved successfully');
    res.json({ success: true });
  } catch (error) {
    req.app.locals.logger.error('Error saving config', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update configuration
router.put('/', async (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, CONFIG_FILE);
    
    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }

    const body = { ...(req.body || {}) };
    delete body.runtime;
    const invalid = validateConnectionFields(body.pihole) || validateInstances(body.instances) || validateSections(body);

    if (invalid) {
      return res.status(400).json({ success: false, error: invalid });
    }

    const existingConfig = normalizeConfig(await fs.readJson(configPath));
    const updatedConfig = syncPrimaryFromPihole(mergePreservingSecrets(existingConfig, body), body);
    updatedConfig.updatedAt = new Date().toISOString();

    await saveConfig(req.app.locals.DATA_DIR, updatedConfig);
    
    // Reinitialize scheduled jobs with new config
    if (req.app.locals.scheduleService) {
      await req.app.locals.scheduleService.initializeScheduledJobs();
    }
    
    req.app.locals.logger.info('Configuration updated successfully');
    res.json({ success: true });
  } catch (error) {
    req.app.locals.logger.error('Error updating config', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
