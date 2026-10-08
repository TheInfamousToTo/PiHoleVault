/**
 * Decide which backups to keep.
 *
 * Two modes:
 *   count -- keep the newest `keepLast` (the pre-2.1 behaviour, `maxBackups`).
 *   gfs   -- grandfather-father-son: the newest `keepLast`, plus the newest
 *            backup of each of the last `daily` days, `weekly` ISO weeks and
 *            `monthly` months that have one.
 *
 * Pinned backups are always kept and never count towards any quota. Each
 * Pi-hole is evaluated separately, so a busy instance cannot push a quiet
 * one's only backups out.
 *
 * Pure: takes the backup list, returns the filenames to delete.
 */

function normalizeRules(backupConfig = {}) {
  const r = backupConfig.retention || {};
  const int = (value, fallback) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  };
  return {
    mode: r.mode === 'gfs' ? 'gfs' : 'count',
    keepLast: Math.max(1, int(r.keepLast, int(backupConfig.maxBackups, 10))),
    daily: int(r.daily, 7),
    weekly: int(r.weekly, 4),
    monthly: int(r.monthly, 6)
  };
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

// ISO-8601 week, e.g. "2026-W41"; weeks start on Monday.
function weekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function keepNewestPerBucket(sorted, keyFn, buckets, keep) {
  const seen = new Set();
  for (const backup of sorted) {
    if (seen.size >= buckets) break;
    const key = keyFn(new Date(backup.timestamp));
    if (!seen.has(key)) {
      seen.add(key);
      keep.add(backup.filename);
    }
  }
}

function selectForInstance(backups, rules) {
  const sorted = [...backups].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const candidates = sorted.filter((b) => !b.pinned);
  const keep = new Set(sorted.filter((b) => b.pinned).map((b) => b.filename));

  candidates.slice(0, rules.keepLast).forEach((b) => keep.add(b.filename));

  if (rules.mode === 'gfs') {
    keepNewestPerBucket(candidates, dayKey, rules.daily, keep);
    keepNewestPerBucket(candidates, weekKey, rules.weekly, keep);
    keepNewestPerBucket(candidates, monthKey, rules.monthly, keep);
  }

  return sorted.filter((b) => !keep.has(b.filename)).map((b) => b.filename);
}

/**
 * @param backups list from CatalogService#list
 * @param backupConfig config.backup
 * @returns {string[]} filenames to delete
 */
function selectForDeletion(backups, backupConfig) {
  const rules = normalizeRules(backupConfig);
  const byInstance = new Map();
  for (const backup of backups) {
    const id = backup.instanceId || 'primary';
    if (!byInstance.has(id)) byInstance.set(id, []);
    byInstance.get(id).push(backup);
  }
  return [...byInstance.values()].flatMap((list) => selectForInstance(list, rules));
}

module.exports = { normalizeRules, selectForDeletion, weekKey };
