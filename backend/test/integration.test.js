// Integration tests against a real Pi-hole v6.
//
//   PIHOLE_HOST=localhost PIHOLE_PORT=8080 PIHOLE_PASSWORD=... npm run test:integration
//
// CI starts pihole/pihole:latest as a service container (see
// .github/workflows/test.yml). Without PIHOLE_HOST every test is skipped, so
// `npm test` stays usable on a laptop with no Pi-hole.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const HOST = process.env.PIHOLE_HOST;
const PORT = Number(process.env.PIHOLE_PORT || 80);
const PASSWORD = process.env.PIHOLE_PASSWORD || '';
const skip = HOST ? false : 'PIHOLE_HOST not set';

// Isolated data and backup directories, set before the app is loaded.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'piholevault-it-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.BACKUP_DIR = path.join(tmp, 'backups');
process.env.LOG_LEVEL = 'error';

let base;
let server;
let hook;
const notifications = [];

async function api(method, url, body, { raw = false } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  if (raw) return res;
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    data = text;
  }
  return { status: res.status, data };
}

// Talk to Pi-hole directly to change its state between backups.
const PiHoleWebService = require('../services/PiHoleWebService');
const pihole = new PiHoleWebService({ info() {}, warn() {}, error() {}, debug() {} });
const conn = { host: HOST, webPort: PORT, webPassword: PASSWORD };
const domainCount = () => pihole.withSession(conn, async (c) => (await c.get('/api/domains')).data.domains.length);

test.before(async () => {
  if (skip) return;
  const app = require('../server');
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  hook = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      notifications.push(JSON.parse(body));
      res.end('ok');
    });
  });
  hook.listen(0);
  await new Promise((resolve) => hook.once('listening', resolve));
});

test.after(() => {
  server?.close();
  hook?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('connection test reports the Pi-hole version and rejects a wrong password', { skip }, async () => {
  const ok = await api('POST', '/api/pihole/test-connection', {
    host: `http://${HOST}:${PORT}/admin/`, connectionMethod: 'web', webPassword: PASSWORD
  });
  assert.equal(ok.data.success, true, JSON.stringify(ok.data));
  assert.match(ok.data.message, /FTL v6/);

  const bad = await api('POST', '/api/pihole/test-connection', {
    host: HOST, webPort: PORT, connectionMethod: 'web', webPassword: 'definitely-wrong'
  });
  assert.equal(bad.data.success, false);
  assert.match(bad.data.error, /rejected the password/);
});

test('save two Pi-holes with encryption and a webhook channel', { skip }, async () => {
  const res = await api('POST', '/api/config/save', {
    pihole: { host: `http://${HOST}:${PORT}/admin/`, connectionMethod: 'web', webPassword: PASSWORD },
    instances: [
      { id: 'primary', name: 'Primary', host: `http://${HOST}:${PORT}/admin/`, connectionMethod: 'web', webPassword: PASSWORD },
      { name: 'Second', host: HOST, webPort: PORT, connectionMethod: 'web', webPassword: PASSWORD }
    ],
    backup: { destinationPath: process.env.BACKUP_DIR, maxBackups: 3 },
    schedule: { enabled: false, cronExpression: '0 3 * * *', timezone: 'GMT+0' },
    encryption: { enabled: true, passphrase: 'integration-pass' },
    notifications: {
      channels: [{ id: 'hook', type: 'webhook', name: 'Test hook', webhookUrl: `http://127.0.0.1:${hook.address().port}/` }]
    }
  });
  assert.equal(res.data.success, true, JSON.stringify(res.data));

  const config = await api('GET', '/api/config');
  assert.equal(config.data.instances.length, 2);
  assert.equal(config.data.instances[1].id, 'second');
  assert.equal(config.data.instances[0].host, HOST, 'admin URL is normalised to a host on save');
  assert.equal(config.data.instances[0].webPassword, '***REDACTED***');
  assert.equal(config.data.encryption.passphrase, '***REDACTED***');
  assert.equal(config.data.analytics.enabled, false, 'analytics is off unless opted in');
});

test('a saved password is reused for the same Pi-hole only', { skip }, async () => {
  const same = await api('POST', '/api/pihole/test-connection', {
    instanceId: 'second', host: HOST, webPort: PORT, connectionMethod: 'web', webPassword: '***REDACTED***'
  });
  assert.equal(same.data.success, true, JSON.stringify(same.data));

  const elsewhere = await api('POST', '/api/pihole/test-connection', {
    instanceId: 'second', host: '203.0.113.9', webPort: PORT, connectionMethod: 'web', webPassword: '***REDACTED***'
  });
  assert.equal(elsewhere.data.success, false);
  assert.match(elsewhere.data.error, /enter the password again/);
});

test('back up every Pi-hole: verified, encrypted, catalogued, notified', { skip }, async () => {
  const run = await api('POST', '/api/backup/run', {});
  assert.equal(run.data.success, true, JSON.stringify(run.data));
  assert.equal(run.data.results.length, 2);

  const list = (await api('GET', '/api/backups')).data;
  assert.equal(list.length, 2);
  for (const b of list) {
    assert.match(b.filename, /^pi-hole_backup_(primary|second)_.*\.zip\.enc$/);
    assert.equal(b.encrypted, true);
    assert.equal(b.integrity.ok, true);
  }
  assert.deepEqual(new Set(list.map((b) => b.instanceId)), new Set(['primary', 'second']));
  assert.ok(notifications.filter((n) => n.event === 'success').length >= 2);
});

test('download returns a plain Teleporter zip, or the encrypted file with ?raw=1', { skip }, async () => {
  const [latest] = (await api('GET', '/api/backups')).data;
  const plain = Buffer.from(await (await api('GET', `/api/backups/${latest.filename}/download`, null, { raw: true })).arrayBuffer());
  assert.equal(plain.readUInt32LE(0), 0x04034b50, 'PK zip header');
  const raw = Buffer.from(await (await api('GET', `/api/backups/${latest.filename}/download?raw=1`, null, { raw: true })).arrayBuffer());
  assert.equal(raw.subarray(0, 7).toString(), 'PHVENC1');
});

test('diff, then selective restore with an automatic safety backup', { skip }, async () => {
  const before = (await api('GET', '/api/backups')).data.find((b) => b.instanceId === 'primary');
  const domainsBefore = await domainCount();

  await pihole.withSession(conn, (c) => c.post('/api/domains/deny/exact', { domain: 'it-test.example', groups: [0], enabled: true }));
  const run = await api('POST', '/api/backup/run', { instanceId: 'primary' });
  assert.equal(run.data.success, true);
  const after = (await api('GET', '/api/backups')).data.find((b) => b.instanceId === 'primary');

  const diff = await api('GET', `/api/backups/diff?from=${before.filename}&to=${after.filename}`);
  assert.equal(diff.data.success, true, JSON.stringify(diff.data));
  assert.deepEqual(diff.data.domains.added.map((d) => d.label), ['it-test.example']);

  const restore = await api('POST', `/api/backups/${before.filename}/restore`, {
    parts: { settings: false, dhcpLeases: false, groups: false, adlists: false, domains: true, clients: false }
  });
  assert.equal(restore.data.success, true, JSON.stringify(restore.data));
  assert.ok(restore.data.safetyBackup, 'a safety backup was taken first');
  assert.equal(await domainCount(), domainsBefore, 'the added domain is gone again');

  const safety = (await api('GET', '/api/backups')).data.find((b) => b.filename === restore.data.safetyBackup);
  assert.equal(safety.pinned, true);
  assert.match(safety.note, /Before restoring/);
});

test('retention keeps the newest per Pi-hole plus pinned backups', { skip }, async () => {
  for (let i = 0; i < 4; i += 1) {
    const run = await api('POST', '/api/backup/run', { instanceId: 'primary' });
    assert.equal(run.data.success, true);
  }
  const primary = (await api('GET', '/api/backups')).data.filter((b) => b.instanceId === 'primary');
  const unpinned = primary.filter((b) => !b.pinned);
  assert.equal(unpinned.length, 3, 'maxBackups = 3');
  assert.ok(primary.some((b) => b.pinned), 'the pinned safety backup survived');
});

test('no API session leak: 20 backups in a row', { skip, timeout: 180000 }, async () => {
  for (let i = 0; i < 20; i += 1) {
    const run = await api('POST', '/api/backup/run', { instanceId: 'second' });
    assert.equal(run.data.success, true, `backup ${i + 1}: ${JSON.stringify(run.data)}`);
  }
});

test('pin, note, verify and delete', { skip }, async () => {
  const [latest] = (await api('GET', '/api/backups')).data;
  const pin = await api('PATCH', `/api/backups/${latest.filename}`, { pinned: true, note: 'keep me' });
  assert.equal(pin.data.entry.pinned, true);

  const verify = await api('POST', `/api/backups/${latest.filename}/verify`);
  assert.equal(verify.data.integrity.ok, true);

  const del = await api('DELETE', `/api/backups/${latest.filename}`);
  assert.equal(del.data.success, true);
  const traversal = await api('DELETE', '/api/backups/..%2Fdata%2Fconfig.json');
  assert.ok(traversal.status === 400 || traversal.status === 404);
});
