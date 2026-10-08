const path = require('path');
const initSqlJs = require('sql.js');
const { unpack } = require('./ArchiveService');

/**
 * Compare two Teleporter archives.
 *
 * Reads gravity.db with sql.js (SQLite compiled to WebAssembly, so there is no
 * native module to build per architecture) and pihole.toml as text, and
 * reports what was added, removed or changed between them: blocklists,
 * allow/deny domains, groups, clients and every setting.
 */

let sqlPromise = null;
function sql() {
  if (!sqlPromise) {
    const wasmDir = path.dirname(require.resolve('sql.js'));
    sqlPromise = initSqlJs({ locateFile: (file) => path.join(wasmDir, file) });
  }
  return sqlPromise;
}

const DOMAIN_TYPES = {
  0: 'Allow (exact)',
  1: 'Deny (exact)',
  2: 'Allow (regex)',
  3: 'Deny (regex)'
};

function rows(db, query) {
  try {
    const result = db.exec(query);
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
  } catch (error) {
    // A table missing from an older or newer schema is not an error worth
    // failing the whole comparison for.
    return [];
  }
}

async function readGravity(buffer) {
  const SQL = await sql();
  const db = new SQL.Database(new Uint8Array(buffer));
  try {
    return {
      adlists: rows(db, 'SELECT address, enabled, comment FROM adlist'),
      domains: rows(db, 'SELECT domain, type, enabled, comment FROM domainlist'),
      groups: rows(db, 'SELECT name, enabled, description FROM "group"'),
      clients: rows(db, 'SELECT ip, comment FROM client')
    };
  } finally {
    db.close();
  }
}

/**
 * Flatten pihole.toml into "section.key" => "value" pairs.
 *
 * Not a full TOML parser: Pi-hole writes one key = value per line under
 * [section] headers, with comments on their own lines, which is all this needs
 * to report a setting as changed.
 */
// Drop a trailing "  # comment". A plain search, not /\s+#.*$/, which
// backtracks polynomially on long runs of whitespace in the archive's text.
function stripComment(value) {
  const at = value.search(/\s#/);
  return (at === -1 ? value : value.slice(0, at)).trim();
}

function readToml(text) {
  const settings = new Map();
  let section = '';
  let pending = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();

    if (pending) {
      pending.value += ` ${line}`;
      if (/\]\s*(#.*)?$/.test(line)) {
        settings.set(pending.key, stripComment(pending.value));
        pending = null;
      }
      continue;
    }

    if (!line || line.startsWith('#')) continue;

    const header = line.match(/^\[([^\]]+)\]/);
    if (header) {
      section = header[1].trim();
      continue;
    }

    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (!kv) continue;

    const key = section ? `${section}.${kv[1]}` : kv[1];
    const value = kv[2].trim();

    // Multi-line arrays: keep reading until the closing bracket.
    if (value.startsWith('[') && !/\]\s*(#.*)?$/.test(value)) {
      pending = { key, value };
      continue;
    }

    settings.set(key, stripComment(value));
  }

  return settings;
}

// Settings whose values are secrets or churn on every export; they would
// either leak into the UI or bury the real changes.
const IGNORED_SETTINGS = [/pwhash$/i, /password/i, /totp_secret$/i, /app_pwhash$/i];

function diffSettings(before, after) {
  const changes = [];
  const keys = new Set([...before.keys(), ...after.keys()]);
  for (const key of [...keys].sort()) {
    if (IGNORED_SETTINGS.some((re) => re.test(key))) continue;
    const a = before.get(key);
    const b = after.get(key);
    if (a === b) continue;
    changes.push({
      key,
      before: a === undefined ? null : a,
      after: b === undefined ? null : b,
      change: a === undefined ? 'added' : b === undefined ? 'removed' : 'changed'
    });
  }
  return changes;
}

function diffList(before, after, keyFn, describe) {
  const beforeMap = new Map(before.map((r) => [keyFn(r), r]));
  const afterMap = new Map(after.map((r) => [keyFn(r), r]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [key, row] of afterMap) {
    if (!beforeMap.has(key)) added.push(describe(row));
    else {
      const old = beforeMap.get(key);
      const diffs = Object.keys(row).filter((f) => String(row[f] ?? '') !== String(old[f] ?? ''));
      if (diffs.length) {
        changed.push({ ...describe(row), fields: diffs.map((f) => ({ field: f, before: old[f], after: row[f] })) });
      }
    }
  }
  for (const [key, row] of beforeMap) {
    if (!afterMap.has(key)) removed.push(describe(row));
  }

  return { added, removed, changed };
}

/**
 * @param olderZip  Buffer of the older Teleporter zip
 * @param newerZip  Buffer of the newer one
 */
async function diffArchives(olderZip, newerZip) {
  const wanted = ['etc/pihole/pihole.toml', 'etc/pihole/gravity.db'];
  const a = unpack(olderZip, wanted).files;
  const b = unpack(newerZip, wanted).files;

  for (const [label, files] of [['older', a], ['newer', b]]) {
    for (const name of wanted) {
      if (!files[name]) throw new Error(`The ${label} backup has no ${name}`);
    }
  }

  const [ga, gb] = await Promise.all([
    readGravity(a['etc/pihole/gravity.db']),
    readGravity(b['etc/pihole/gravity.db'])
  ]);

  const settings = diffSettings(
    readToml(Buffer.from(a['etc/pihole/pihole.toml']).toString('utf8')),
    readToml(Buffer.from(b['etc/pihole/pihole.toml']).toString('utf8'))
  );

  const result = {
    adlists: diffList(ga.adlists, gb.adlists, (r) => r.address, (r) => ({
      label: r.address, enabled: r.enabled === 1, comment: r.comment || ''
    })),
    domains: diffList(ga.domains, gb.domains, (r) => `${r.type}|${r.domain}`, (r) => ({
      label: r.domain, kind: DOMAIN_TYPES[r.type] || `Type ${r.type}`, enabled: r.enabled === 1, comment: r.comment || ''
    })),
    groups: diffList(ga.groups, gb.groups, (r) => r.name, (r) => ({
      label: r.name, enabled: r.enabled === 1, comment: r.description || ''
    })),
    clients: diffList(ga.clients, gb.clients, (r) => r.ip, (r) => ({
      label: r.ip, comment: r.comment || ''
    })),
    settings
  };

  const count = (d) => d.added.length + d.removed.length + d.changed.length;
  result.summary = {
    adlists: count(result.adlists),
    domains: count(result.domains),
    groups: count(result.groups),
    clients: count(result.clients),
    settings: settings.length
  };
  result.summary.total = Object.values(result.summary).reduce((n, v) => n + v, 0);
  result.counts = {
    before: { adlists: ga.adlists.length, domains: ga.domains.length, groups: ga.groups.length, clients: ga.clients.length },
    after: { adlists: gb.adlists.length, domains: gb.domains.length, groups: gb.groups.length, clients: gb.clients.length }
  };

  return result;
}

module.exports = { diffArchives, readToml };
