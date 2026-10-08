// Unit tests: pure logic, no network, no Pi-hole. Run with `npm test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { zipSync } = require('fflate');

const { parsePiholeAddress, mergePreservingSecrets, redactSecrets, REDACTED } = require('../utils/validate');
const { normalizeConfig, syncPrimaryFromPihole, makeInstanceId } = require('../utils/configStore');
const { selectForDeletion, weekKey } = require('../services/RetentionService');
const Archive = require('../services/ArchiveService');
const { readToml } = require('../services/DiffService');
const BackupService = require('../services/BackupService');
const PiHoleWebService = require('../services/PiHoleWebService');
const NotificationService = require('../services/NotificationService');

const SQLITE = Buffer.concat([Buffer.from('SQLite format 3\0', 'binary'), Buffer.alloc(100)]);
function teleporterZip(files = {}) {
  return Buffer.from(zipSync({
    'etc/pihole/pihole.toml': new TextEncoder().encode('[dns]\n  blockTTL = 2\n'),
    'etc/pihole/gravity.db': new Uint8Array(SQLITE),
    ...files
  }));
}

test('parsePiholeAddress accepts hosts and admin URLs, refuses anything else', () => {
  assert.deepEqual(parsePiholeAddress('192.168.1.2'), { hostname: '192.168.1.2', scheme: null, port: null });
  assert.deepEqual(parsePiholeAddress('https://pi.hole:8443/admin/'), { hostname: 'pi.hole', scheme: 'https', port: 8443 });
  for (const bad of ['https://u:p@pi.hole/', 'https://pi.hole/admin/api.php', 'ftp://pi.hole', 'pi.hole;rm', 'http://x/?a=1', '']) {
    assert.equal(parsePiholeAddress(bad), null, bad);
  }
});

test('secrets survive a redact-and-save round trip, including inside lists', () => {
  const stored = normalizeConfig({
    instances: [
      { id: 'primary', host: 'a', webPassword: 'one' },
      { id: 'b', host: 'b', webPassword: 'two' }
    ],
    offsite: { s3: { secretAccessKey: 'shh' } },
    encryption: { passphrase: 'correct horse' }
  });
  const fromUi = redactSecrets(stored);
  assert.equal(fromUi.instances[1].webPassword, REDACTED);
  fromUi.instances[1].name = 'renamed';
  fromUi.instances.push({ name: 'New', host: 'c', webPassword: 'three' });

  const merged = normalizeConfig(mergePreservingSecrets(stored, fromUi));
  assert.deepEqual(merged.instances.map((i) => i.webPassword), ['one', 'two', 'three']);
  assert.equal(merged.instances[1].name, 'renamed');
  assert.equal(merged.offsite.s3.secretAccessKey, 'shh');
  assert.equal(merged.encryption.passphrase, 'correct horse');
});

test('merge drops prototype-polluting keys', () => {
  mergePreservingSecrets({}, JSON.parse('{"__proto__":{"polluted":1},"instances":[{"id":"x","__proto__":{"p2":1}}]}'));
  assert.equal({}.polluted, undefined);
  assert.equal({}.p2, undefined);
});

test('a legacy single-Pi-hole config becomes the primary instance', () => {
  const config = normalizeConfig({ pihole: { host: '10.0.0.2', webPassword: 'x' } });
  assert.equal(config.instances.length, 1);
  assert.equal(config.instances[0].id, 'primary');
  assert.equal(config.analytics.enabled, false, 'analytics must default to off');
});

test('wizard saves that only send `pihole` update the primary instance', () => {
  const existing = normalizeConfig({ pihole: { host: 'old' } });
  const incoming = { pihole: { host: 'new' } };
  const merged = normalizeConfig(syncPrimaryFromPihole(mergePreservingSecrets(existing, incoming), incoming));
  assert.equal(merged.instances[0].host, 'new');
});

test('instance ids are unique and safe', () => {
  assert.equal(makeInstanceId('Living Room Pi-hole!', []), 'living-room-pi-hole');
  assert.equal(makeInstanceId('x', [{ id: 'x' }, { id: 'x-2' }]), 'x-3');
  assert.equal(makeInstanceId('primary', []), 'primary-2');
});

test('count retention keeps the newest N per Pi-hole, and pinned backups always', () => {
  const day = (n) => new Date(Date.UTC(2026, 9, n, 3)).toISOString();
  const backups = [
    ...[1, 2, 3, 4, 5].map((d) => ({ filename: `a${d}`, instanceId: 'primary', timestamp: day(d) })),
    { filename: 'b1', instanceId: 'b', timestamp: day(1) },
    { filename: 'pinned', instanceId: 'primary', timestamp: day(1), pinned: true }
  ];
  const doomed = selectForDeletion(backups, { maxBackups: 2 });
  assert.deepEqual(doomed.sort(), ['a1', 'a2', 'a3']);
});

test('GFS retention keeps one per day, week and month', () => {
  // Daily backups for 90 days.
  const backups = Array.from({ length: 90 }, (_, i) => ({
    filename: `f${i}`,
    instanceId: 'primary',
    timestamp: new Date(Date.UTC(2026, 9, 7) - i * 86400000).toISOString()
  }));
  const rules = { retention: { mode: 'gfs', keepLast: 3, daily: 7, weekly: 4, monthly: 3 } };
  const kept = backups.length - selectForDeletion(backups, rules).length;
  // 7 days cover keepLast; weeks add up to 3 more; months up to 2 more.
  assert.ok(kept >= 7 && kept <= 12, `kept ${kept}`);
  assert.ok(!selectForDeletion(backups, rules).includes('f0'), 'newest is kept');
  assert.equal(weekKey(new Date('2026-01-01T00:00:00Z')), '2026-W01');
});

test('integrity check accepts a Teleporter zip and rejects broken ones', () => {
  assert.equal(Archive.verifyZip(teleporterZip()).ok, true);
  assert.match(Archive.verifyZip(Buffer.from('<html>')).error, /damaged/);
  const noGravity = Buffer.from(zipSync({ 'etc/pihole/pihole.toml': new TextEncoder().encode('[dns]\n') }));
  assert.match(Archive.verifyZip(noGravity).error, /gravity\.db/);
  const fakeDb = teleporterZip({ 'etc/pihole/gravity.db': new TextEncoder().encode('not sqlite') });
  assert.match(Archive.verifyZip(fakeDb).error, /SQLite/);
});

test('encryption round-trips, and rejects a wrong passphrase or tampering', () => {
  const zip = teleporterZip();
  const enc = Archive.encrypt(zip, 'correct horse');
  assert.ok(Archive.isEncryptedBuffer(enc));
  assert.ok(Archive.decrypt(enc, 'correct horse').equals(zip));
  assert.throws(() => Archive.decrypt(enc, 'wrong'), /wrong passphrase/);
  const tampered = Buffer.from(enc);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => Archive.decrypt(tampered, 'correct horse'), /wrong passphrase|damaged/);
  assert.throws(() => Archive.decrypt(enc, ''), /passphrase/);
});

test('pihole.toml is flattened into section.key settings', () => {
  const s = readToml('[dns]\n  # comment\n  blockTTL = 2 ### note\n  upstreams = [\n    "1.1.1.1",\n    "9.9.9.9"\n  ]\n[webserver.api]\n  pwhash = "x"\n');
  assert.equal(s.get('dns.blockTTL'), '2');
  assert.match(s.get('dns.upstreams'), /1\.1\.1\.1.*9\.9\.9\.9/);
  assert.equal(s.get('webserver.api.pwhash'), '"x"');
});

test('teleporter filename is taken from the last line and must be a plain basename', () => {
  const out = '2 FTLCONF environment variables found\n   [✓] FTLCONF_x is used\npi-hole_x_teleporter_2026.zip\n';
  assert.equal(BackupService.parseTeleporterOutput(out), 'pi-hole_x_teleporter_2026.zip');
  assert.equal(BackupService.parseTeleporterOutput('$(reboot).zip\n../etc/x.zip\n'), null);
});

test('restore selection maps checkboxes to Teleporter import flags', () => {
  const sel = PiHoleWebService.importSelection({ settings: false, domains: true, adlists: false });
  assert.equal(sel.config, false);
  assert.equal(sel.gravity.domainlist, true);
  assert.equal(sel.gravity.domainlist_by_group, true);
  assert.equal(sel.gravity.adlist, false);
  assert.equal(sel.gravity.adlist_by_group, false);
  assert.equal(PiHoleWebService.importSelection().gravity.client, true, 'everything by default');
});

test('legacy Discord settings appear as a notification channel', () => {
  const channels = NotificationService.resolveChannels({ discord: { webhookUrl: 'https://discord.com/api/webhooks/1/x', notifyOnSuccess: false } });
  assert.equal(channels[0].type, 'discord');
  assert.equal(channels[0].notifyOnSuccess, false);
  const message = NotificationService.buildMessage('failure', { instance: 'Pi', error: 'boom' });
  assert.match(message.text, /Pi-hole: Pi/);
  assert.match(message.text, /Error: boom/);
});

test('legacy Discord settings migrate into the channel list once, keeping the URL across a save', () => {
  const stored = normalizeConfig({ discord: { enabled: true, webhookUrl: 'https://discord.com/api/webhooks/1/x' } });
  assert.equal(stored.discord, undefined);
  assert.equal(stored.notifications.channels[0].id, 'discord-legacy');

  // The UI sends the redacted channel back with a new one appended.
  const fromUi = redactSecrets(stored);
  fromUi.notifications.channels.push({ id: 'n1', type: 'ntfy', topic: 'pv' });
  const saved = normalizeConfig(mergePreservingSecrets(stored, fromUi));
  assert.equal(saved.notifications.channels.length, 2);
  assert.equal(saved.notifications.channels[0].webhookUrl, 'https://discord.com/api/webhooks/1/x');
});
