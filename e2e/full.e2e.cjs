// End-to-end test: drives the real UI in Chromium against a real Pi-hole,
// S3 and WebDAV storage and an ntfy server, and checks every outcome against
// the API and the services themselves, not just what the page says.
//
// In CI PiHoleVault runs as the Docker image inside the compose network, so it
// reaches the other services by name (E2E_TARGET=compose, the default). For a
// local run against `npm run dev` / `node server.js` use E2E_TARGET=local.
// See e2e/README.md.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TARGET = process.env.E2E_TARGET || 'compose';
const inCompose = TARGET === 'compose';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const PIHOLE_API = process.env.PIHOLE_API || 'http://localhost:8080';
const NTFY_API = process.env.NTFY_API || 'http://localhost:8091';
const PASSWORD = process.env.PIHOLE_PASSWORD || 'e2e-password';

// Addresses as PiHoleVault itself sees them.
const FOR_APP = inCompose
  ? { pihole: 'pihole', piholePort: 80, s3: 'http://s3:8333', webdav: 'http://webdav:8080', ntfy: 'http://ntfy' }
  : { pihole: 'localhost', piholePort: 8080, s3: 'http://localhost:8333', webdav: 'http://localhost:8090', ntfy: NTFY_API };

const OUT = path.join(__dirname, 'artifacts');
fs.mkdirSync(OUT, { recursive: true });

const TOPIC = `pv-e2e-${Date.now()}`;
const DOMAIN = `e2e-${Date.now()}.example`;

let page;
let step = 0;
const errors = [];

async function shot(name) {
  step += 1;
  await page.screenshot({ path: path.join(OUT, `${String(step).padStart(2, '0')}-${name}.png`), fullPage: false });
}

async function toast(pattern, timeout = 60000) {
  const el = page.locator('.Toastify__toast', { hasText: pattern }).first();
  try {
    await el.waitFor({ timeout });
  } catch (error) {
    const seen = (await page.locator('.Toastify__toast').allTextContents()).join(' || ');
    throw new Error(`Expected a toast matching ${pattern}; saw: ${seen || 'none'}`);
  }
  return el.textContent();
}

async function api(method, url, body) {
  const res = await page.request.fetch(`${APP_URL}${url}`, { method, data: body });
  return { status: res.status(), data: await res.json().catch(() => null), res };
}

// Pi-hole's own API, to change and inspect its state directly.
async function pihole(method, url, body) {
  const auth = await fetch(`${PIHOLE_API}/api/auth`, { method: 'POST', body: JSON.stringify({ password: PASSWORD }) });
  const { session } = await auth.json();
  try {
    const res = await fetch(`${PIHOLE_API}${url}`, {
      method,
      headers: { 'X-FTL-SID': session.sid, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    return res.status === 204 ? null : res.json();
  } finally {
    await fetch(`${PIHOLE_API}/api/auth`, { method: 'DELETE', headers: { 'X-FTL-SID': session.sid } });
  }
}

const deniedDomains = async () => (await pihole('GET', '/api/domains/deny/exact')).domains.map((d) => d.domain);

async function ntfyMessages() {
  const res = await fetch(`${NTFY_API}/${TOPIC}/json?poll=1&since=all`);
  const text = await res.text();
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((m) => m.event === 'message');
}

async function settingsTab(name) {
  await page.getByRole('tab', { name }).click();
  // Tabs cross-fade; wait until the old panel has left before touching inputs.
  await page.waitForTimeout(600);
}

const dialog = () => page.getByRole('dialog');

// Click "Run backup now" and wait for that run to finish. Waiting for its
// toast is not enough: the previous run's identical toast can still be on
// screen and would match at once, while this run is still writing files.
async function runBackup(expectedToast) {
  const done = page.waitForResponse((r) => r.url().endsWith('/api/backup/run') && r.request().method() === 'POST', { timeout: 300000 });
  await page.getByRole('button', { name: /Run backup now/ }).click();
  const res = await done;
  assert.equal(res.status(), 200, `backup run failed: ${await res.text()}`);
  await toast(expectedToast);
  // Let the list refresh land before the next step reads it.
  await page.waitForLoadState('networkidle');
}

async function main() {
  const browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

  const steps = [
    ['health check through nginx', async () => {
      const health = await api('GET', '/health');
      assert.equal(health.status, 200);
      assert.equal(health.data.status, 'ok');
    }],

    ['setup wizard connects to the real Pi-hole', async () => {
      await page.goto(APP_URL);
      await page.getByLabel('Pi-hole URL or Hostname').fill(`http://${FOR_APP.pihole}:${FOR_APP.piholePort}/admin/`);
      await page.getByLabel('Web Password').fill(PASSWORD);
      await page.getByRole('button', { name: /Test & continue/ }).click();
      await toast(/Connected to Pi-hole \(FTL v6/);
      await page.getByRole('button', { name: /^Continue/ }).click();
      await page.getByRole('button', { name: /^Continue/ }).click();
      await page.getByText('Share anonymous usage statistics').waitFor();
      await shot('wizard-privacy');
      assert.equal(await page.getByLabel('Share anonymous usage statistics').isChecked(), false, 'analytics must default to off');
      await page.getByRole('button', { name: /^Continue/ }).click();
      await page.getByRole('button', { name: /Finish setup/ }).click();
      await page.getByText('No restore points yet').waitFor({ timeout: 30000 });
      const config = (await api('GET', '/api/config')).data;
      assert.equal(config.analytics.enabled, false);
      assert.equal(config.instances[0].webPassword, '***REDACTED***');
    }],

    ['first backup', async () => {
      await runBackup(/Backup completed/);
      const list = (await api('GET', '/api/backups')).data;
      assert.equal(list.length, 1);
      assert.equal(list[0].integrity.ok, true);
    }],

    ['settings: add a second Pi-hole and re-test the saved one', async () => {
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('menuitem', { name: 'Pi-holes' }).click();
      await dialog().waitFor();
      await page.getByRole('button', { name: /Add a Pi-hole/ }).click();
      await page.getByLabel('Name').nth(1).fill('Lab');
      await page.getByLabel('Host or admin URL').nth(1).fill(FOR_APP.pihole);
      await page.getByLabel('Web port').nth(1).fill(String(FOR_APP.piholePort));
      await page.getByLabel('Web / app password').nth(1).fill(PASSWORD);
      // The primary's password is only known to the server ("saved").
      await page.getByRole('button', { name: /^Test$/ }).first().click();
      await toast(/Connected to Pi-hole/);
      await shot('settings-piholes');
    }],

    ['settings: encryption and GFS retention', async () => {
      await settingsTab(/Encryption/);
      await page.getByLabel('Encrypt new backups').check();
      await page.getByLabel('Passphrase', { exact: true }).fill('e2e-passphrase');
      await page.getByLabel('Repeat passphrase').fill('e2e-passphrase');
      await settingsTab(/Schedule/);
      await page.getByRole('button', { name: /Daily \/ weekly \/ monthly/ }).click();
    }],

    ['settings: WebDAV save-and-test', async () => {
      await settingsTab(/Off-site/);
      await page.getByLabel('Copy backups off-site').check();
      await page.getByRole('button', { name: 'WebDAV' }).click();
      await page.getByLabel('Server URL').fill(FOR_APP.webdav);
      await page.getByLabel('Folder').fill('pihole/e2e');
      await page.getByLabel('Username').fill('davuser');
      await page.getByLabel('Password / app password').fill('davpass');
      await page.getByRole('button', { name: /Save and test/ }).click();
      await toast(/Wrote, read back and deleted a test file/);
    }],

    ['settings: S3 save-and-test', async () => {
      await page.getByRole('button', { name: 'S3-compatible' }).click();
      await page.getByLabel('Endpoint').fill(FOR_APP.s3);
      await page.getByLabel('Bucket').fill('pihole-backups');
      await page.getByLabel('Prefix (folder)').fill('e2e');
      await page.getByLabel('Access key ID').fill('e2ekey');
      await page.getByLabel('Secret access key').fill('e2esecret123');
      await page.getByRole('button', { name: /Save and test/ }).click();
      await toast(/Wrote, read back and deleted a test file at s3:\/\/pihole-backups\/e2e/);
      await shot('settings-offsite');
    }],

    ['settings: ntfy channel save-and-test reaches ntfy', async () => {
      await settingsTab(/Notifications/);
      await page.getByRole('button', { name: /Add channel/ }).click();
      await page.getByLabel('Server').fill(FOR_APP.ntfy);
      await page.getByLabel('Topic').fill(TOPIC);
      await page.getByRole('button', { name: /Save and test/ }).click();
      await toast(/Test notification sent via ntfy/);
      const messages = await ntfyMessages();
      assert.ok(messages.some((m) => m.title === 'PiHoleVault test notification'), 'ntfy received the test message');
      await settingsTab(/Privacy/);
      await shot('settings-privacy');
      await dialog().getByRole('button', { name: /^Close$/ }).last().click();
      await dialog().waitFor({ state: 'detached' });

      const config = (await api('GET', '/api/config')).data;
      assert.equal(config.instances.length, 2);
      assert.equal(config.encryption.enabled, true);
      assert.equal(config.encryption.passphrase, '***REDACTED***');
      assert.equal(config.backup.retention.mode, 'gfs');
      assert.equal(config.offsite.type, 's3');
    }],

    ['backup of both Pi-holes: encrypted, verified, copied off-site, notified', async () => {
      await runBackup(/Backed up 2 Pi-holes/);
      const fresh = (await api('GET', '/api/backups')).data.filter((b) => b.encrypted);
      assert.equal(fresh.length, 2);
      for (const b of fresh) {
        assert.match(b.filename, /\.zip\.enc$/);
        assert.equal(b.integrity.ok, true);
        assert.equal(b.offsite?.status, 'uploaded', JSON.stringify(b.offsite));
      }
      const messages = await ntfyMessages();
      assert.ok(messages.filter((m) => m.title === 'Pi-hole backup completed').length >= 2, 'ntfy received both backups');
    }],

    ['download is a plain Teleporter zip', async () => {
      const [latest] = (await api('GET', '/api/backups')).data;
      const res = await page.request.get(`${APP_URL}/api/backups/${latest.filename}/download`);
      const body = await res.body();
      assert.equal(body.readUInt32LE(0), 0x04034b50, 'PK header');
    }],

    ['diff shows a domain added on Pi-hole', async () => {
      await pihole('POST', '/api/domains/deny/exact', { domain: DOMAIN, groups: [0], enabled: true });
      await runBackup(/Backed up 2 Pi-holes/);
      await page.mouse.move(5, 5);
      await shot('dashboard');

      const latestPrimary = (await api('GET', '/api/backups')).data.find((b) => b.instanceId === 'primary');
      await page.locator('li', { hasText: latestPrimary.filename }).getByRole('button', { name: 'Compare' }).click();
      await dialog().getByText(DOMAIN).waitFor({ timeout: 30000 });
      await shot('diff');
      await dialog().getByRole('button', { name: /^Close$/ }).click();
      await dialog().waitFor({ state: 'detached' });
    }],

    ['selective restore removes the domain and leaves a pinned safety backup', async () => {
      assert.ok((await deniedDomains()).includes(DOMAIN));
      const before = (await api('GET', '/api/backups')).data
        .filter((b) => b.instanceId === 'primary' && b.encrypted)
        .at(-1); // oldest encrypted primary backup: taken before the domain existed
      await page.locator('li', { hasText: before.filename }).getByRole('button', { name: 'Restore', exact: true }).click();
      await dialog().getByRole('button', { name: /Select none/ }).click();
      await dialog().getByLabel(/Allow and deny lists/).check();
      await shot('restore');
      await dialog().getByRole('button', { name: /^Restore$/ }).click();
      await dialog().getByRole('button', { name: 'Done' }).waitFor({ timeout: 180000 });
      await shot('restored');
      await dialog().getByRole('button', { name: 'Done' }).click();

      assert.ok(!(await deniedDomains()).includes(DOMAIN), 'domain removed by the restore');
      const safety = (await api('GET', '/api/backups')).data.find((b) => /Before restoring/.test(b.note));
      assert.ok(safety, 'safety backup exists');
      assert.equal(safety.pinned, true);
      const messages = await ntfyMessages();
      assert.ok(messages.some((m) => m.title === 'Pi-hole restore completed'), 'ntfy received the restore');
    }],

    ['pin, verify and delete from the dashboard', async () => {
      const target = (await api('GET', '/api/backups')).data.find((b) => !b.pinned && b.encrypted);
      const row = page.locator('li', { hasText: target.filename });
      await row.getByRole('button', { name: 'Pin', exact: true }).click();
      await toast(/Pinned/);
      await row.getByRole('button', { name: 'Verify backup' }).click();
      await toast(/Backup verified/);
      assert.equal((await api('GET', '/api/backups')).data.find((b) => b.filename === target.filename).pinned, true);

      await row.getByRole('button', { name: 'Delete' }).click();
      await dialog().getByText('This backup is pinned').waitFor();
      await dialog().getByRole('button', { name: /^Delete$/ }).click();
      await toast(/Backup deleted/);
      assert.ok(!(await api('GET', '/api/backups')).data.some((b) => b.filename === target.filename));
    }],

    ['reload and phone layout', async () => {
      await page.reload();
      await page.getByText('Restore points').first().waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      await shot('mobile');
    }]
  ];

  let failed = null;
  for (const [name, fn] of steps) {
    const started = Date.now();
    try {
      await fn();
      console.log(`ok - ${name} (${Date.now() - started} ms)`);
    } catch (error) {
      console.log(`not ok - ${name}\n  ${error.stack || error.message}`);
      await shot(`FAILED-${name.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
      failed = error;
      break;
    }
  }

  await browser.close();

  if (!failed && errors.length) {
    console.log(`not ok - browser reported errors:\n  ${errors.join('\n  ')}`);
    failed = new Error('browser errors');
  }
  if (failed) process.exit(1);
  console.log(`\nAll ${steps.length} end-to-end steps passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
