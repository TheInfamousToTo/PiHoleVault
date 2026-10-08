const fs = require('fs-extra');
const path = require('path');
const { trimChar } = require('./text');

const CONFIG_FILE = 'config.json';
const PRIMARY_ID = 'primary';

// Ids end up in backup filenames and URLs, so keep them to a safe alphabet.
const INSTANCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * Bring a stored configuration up to the current shape.
 *
 * Until 2.1 a configuration described exactly one Pi-hole in `pihole`. It now
 * holds a list in `instances`. `pihole` is kept as a mirror of the first
 * instance so the setup wizard, the SSH key routes and anything else written
 * against the single-instance shape keep working unchanged.
 *
 * Runs on every load and every save; it is idempotent.
 */
function normalizeConfig(config) {
  const next = config && typeof config === 'object' ? { ...config } : {};

  let instances = Array.isArray(next.instances) ? next.instances.filter((i) => i && typeof i === 'object') : [];

  if (instances.length === 0 && next.pihole && next.pihole.host) {
    instances = [{ id: PRIMARY_ID, name: next.pihole.name || next.pihole.host, enabled: true, ...next.pihole }];
  }

  const seen = [];
  instances = instances.map((instance, index) => {
    let id = index === 0 ? PRIMARY_ID : instance.id;
    if (index > 0 && (!isValidInstanceId(id) || id === PRIMARY_ID || seen.some((s) => s.id === id))) {
      id = makeInstanceId(instance.name || instance.host, seen);
    }
    const normalized = {
      ...instance,
      id,
      name: instance.name || instance.host || `Pi-hole ${index + 1}`,
      enabled: instance.enabled !== false
    };
    seen.push(normalized);
    return normalized;
  });

  next.instances = instances;

  if (instances.length > 0) {
    const { id, enabled, ...primary } = instances[0];
    next.pihole = primary;
  }

  next.analytics = { enabled: next.analytics?.enabled === true };

  // Before 2.1 the only notification target was one Discord webhook in
  // config.discord, and the setup wizard still collects one there. Stored
  // configs never keep the section (it is folded in here), so when it is
  // present it is the newer input and replaces the channel it became.
  if (next.discord && typeof next.discord === 'object') {
    if (next.discord.webhookUrl) {
      const channels = Array.isArray(next.notifications?.channels)
        ? next.notifications.channels.filter((c) => !(c && c.id === 'discord-legacy'))
        : [];
      channels.unshift({
        id: 'discord-legacy',
        type: 'discord',
        name: 'Discord',
        enabled: next.discord.enabled !== false,
        webhookUrl: next.discord.webhookUrl,
        notifyOnSuccess: next.discord.notifyOnSuccess !== false,
        notifyOnFailure: next.discord.notifyOnFailure !== false
      });
      next.notifications = { ...(next.notifications || {}), channels };
    }
    delete next.discord;
  }

  return next;
}

/**
 * Apply an incoming single-instance `pihole` edit to the instance list.
 *
 * The wizard and older clients only send `pihole`; without this, a save that
 * changed `pihole` would be overwritten by the stale `instances[0]` on the
 * next normalisation.
 */
function syncPrimaryFromPihole(config, incoming) {
  if (incoming && incoming.pihole && !incoming.instances && Array.isArray(config.instances) && config.instances.length) {
    config.instances = [{ ...config.instances[0], ...config.pihole, id: PRIMARY_ID }, ...config.instances.slice(1)];
  }
  return config;
}

function getInstances(config) {
  return normalizeConfig(config).instances;
}

function getInstance(config, id) {
  return getInstances(config).find((instance) => instance.id === (id || PRIMARY_ID)) || null;
}

function isValidInstanceId(id) {
  return typeof id === 'string' && INSTANCE_ID_PATTERN.test(id);
}

/**
 * Derive a new, unused instance id from a display name.
 */
function makeInstanceId(name, existing) {
  const taken = new Set(existing.map((instance) => instance.id));
  const slug = String(name || 'pihole')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  const base = trimChar(slug, '-').slice(0, 24) || 'pihole';
  let id = base === PRIMARY_ID ? `${base}-2` : base;
  for (let n = 2; taken.has(id); n += 1) {
    id = `${base}-${n}`;
  }
  return id;
}

async function loadConfig(dataDir) {
  const configPath = path.join(dataDir, CONFIG_FILE);

  if (!(await fs.pathExists(configPath))) {
    throw new Error('Configuration file not found');
  }

  return normalizeConfig(await fs.readJson(configPath));
}

async function loadConfigOrEmpty(dataDir) {
  try {
    return await loadConfig(dataDir);
  } catch (error) {
    return normalizeConfig({});
  }
}

async function saveConfig(dataDir, config) {
  const normalized = normalizeConfig(config);
  await fs.writeJson(path.join(dataDir, CONFIG_FILE), normalized, { spaces: 2 });
  return normalized;
}

module.exports = {
  PRIMARY_ID,
  normalizeConfig,
  syncPrimaryFromPihole,
  getInstances,
  getInstance,
  isValidInstanceId,
  makeInstanceId,
  loadConfig,
  loadConfigOrEmpty,
  saveConfig
};
