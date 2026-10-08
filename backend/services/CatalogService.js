const fs = require('fs-extra');
const path = require('path');
const { PRIMARY_ID } = require('../utils/configStore');

const CATALOG_FILE = 'catalog.json';

// Backup files on disk: plain Teleporter zips and their encrypted form.
const BACKUP_FILE_PATTERN = /^[A-Za-z0-9._-]+\.zip(\.enc)?$/;
const INCOMING_PREFIX = 'incoming_';

/**
 * Metadata about each stored backup, kept beside the files in data/catalog.json.
 *
 * The backup directory stays the source of truth for which backups exist; the
 * catalog only adds what a file cannot say about itself: which Pi-hole it came
 * from, whether it passed verification, whether it is pinned, its note and its
 * off-site copy. A file with no catalog entry (any backup made before 2.1)
 * still lists, attributed to the primary Pi-hole.
 */
class CatalogService {
  constructor(dataDir, backupDir) {
    this.file = path.join(dataDir, CATALOG_FILE);
    this.backupDir = backupDir;
    // Every write goes through this chain so two backups finishing together
    // cannot interleave a read-modify-write and lose an entry.
    this.queue = Promise.resolve();
  }

  async read() {
    try {
      const data = await fs.readJson(this.file);
      return data && typeof data.entries === 'object' ? data : { entries: {} };
    } catch (error) {
      return { entries: {} };
    }
  }

  mutate(fn) {
    const run = this.queue.then(async () => {
      const data = await this.read();
      const result = await fn(data.entries);
      await fs.writeJson(this.file, data, { spaces: 2 });
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async get(filename) {
    return (await this.read()).entries[filename] || null;
  }

  upsert(filename, patch) {
    return this.mutate((entries) => {
      entries[filename] = { ...(entries[filename] || {}), ...patch };
      return entries[filename];
    });
  }

  remove(filename) {
    return this.mutate((entries) => {
      delete entries[filename];
    });
  }

  /**
   * Every backup on disk, newest first, with its catalog metadata.
   */
  async list() {
    const [names, data] = await Promise.all([
      fs.readdir(this.backupDir).catch(() => []),
      this.read()
    ]);

    const backups = [];

    for (const filename of names) {
      // incoming_* are downloads still being verified and encrypted.
      if (!BACKUP_FILE_PATTERN.test(filename) || filename.startsWith(INCOMING_PREFIX)) continue;
      const stats = await fs.stat(path.join(this.backupDir, filename)).catch(() => null);
      if (!stats || !stats.isFile()) continue;

      const meta = data.entries[filename] || {};
      backups.push({
        filename,
        size: stats.size,
        timestamp: meta.createdAt || stats.mtime.toISOString(),
        instanceId: meta.instanceId || PRIMARY_ID,
        method: meta.method || null,
        encrypted: filename.endsWith('.enc'),
        integrity: meta.integrity || null,
        pinned: meta.pinned === true,
        note: meta.note || '',
        offsite: meta.offsite || null
      });
    }

    backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return backups;
  }

  /**
   * Drop catalog entries whose file no longer exists.
   */
  async prune() {
    const names = new Set(await fs.readdir(this.backupDir).catch(() => []));
    return this.mutate((entries) => {
      for (const filename of Object.keys(entries)) {
        if (!names.has(filename)) delete entries[filename];
      }
    });
  }
}

CatalogService.BACKUP_FILE_PATTERN = BACKUP_FILE_PATTERN;
CatalogService.INCOMING_PREFIX = INCOMING_PREFIX;

module.exports = CatalogService;
