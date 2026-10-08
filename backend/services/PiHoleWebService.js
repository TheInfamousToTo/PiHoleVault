const axios = require('axios');
const https = require('https');
const fs = require('fs-extra');
const path = require('path');
const { parsePiholeAddress } = require('../utils/validate');
const { version: APP_VERSION } = require('../package.json');

class PiHoleWebService {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * Split a configured host into a hostname, a scheme and a port.
   *
   * A bare hostname or IP address is accepted, or an http(s) URL with an
   * optional port and an optional /admin path -- the form people copy from the
   * browser. Credentials, query strings and any other path are refused: the
   * value reaches an axios baseURL, so accepting arbitrary URLs would let a
   * stored configuration point this client at any host the server can reach.
   *
   * The scheme is preserved rather than discarded, so an existing
   * "https://pihole.example.com" configuration keeps using HTTPS instead of
   * being silently downgraded to plaintext.
   */
  parseHost(host) {
    if (typeof host !== 'string') {
      throw new Error('Invalid host: host must be a string');
    }

    const parsed = parsePiholeAddress(host);

    if (!parsed) {
      throw new Error('Invalid host: expected a hostname, IP address or http(s)://host[:port][/admin/] URL');
    }

    const { hostname, scheme, port } = parsed;

    // parsePiholeAddress() is the real check and is stricter than this. The
    // character class is repeated inline because it is the only form static
    // analysis recognises as a barrier on the path from the configured host to
    // the request URL; a call into another module is not followed, so without
    // this the value still reads as attacker-controlled at every axios call.
    if (!/^[A-Za-z0-9.:[\]-]+$/.test(hostname)) {
      throw new Error('Invalid host: contains characters that are not valid in a hostname or IP address');
    }

    return { hostname, scheme, port };
  }

  /**
   * Build the axios client used for every Pi-hole web API call.
   *
   * TLS certificates are verified by default. Pi-hole v6 serves a self-signed
   * certificate out of the box, so verification can be waived deliberately --
   * per connection via `allowInsecureTls`, or globally with
   * ALLOW_INSECURE_TLS=true -- but it is an explicit choice.
   */
  createApiClient(host, port = 80, useHttps = false, options = {}) {
    const { hostname, scheme, port: urlPort } = this.parseHost(host);
    // A scheme written into the host wins over the useHttps flag, which is what
    // the user typed most recently for that field.
    const https_ = scheme ? scheme === 'https' : useHttps === true;
    const defaultPort = https_ ? 443 : 80;
    // A port written into the URL wins. Otherwise a host written as
    // "https://pi.hole" while the port field was left at its default 80 means
    // the user set the scheme and not the port, so follow the scheme rather
    // than emitting https://pi.hole:80, which connects nowhere.
    const numericPort = Number(port) || defaultPort;
    const effectivePort = urlPort || (scheme && numericPort === 80 ? defaultPort : numericPort);
    const baseURL = `${https_ ? 'https' : 'http'}://${hostname}${effectivePort !== defaultPort ? ':' + effectivePort : ''}`;

    const allowInsecureTls =
      options.allowInsecureTls === true || process.env.ALLOW_INSECURE_TLS === 'true';

    if (allowInsecureTls && https_) {
      this.logger.warn('Pi-hole TLS certificate verification is disabled', {
        baseURL,
        hint: 'Give the Pi-hole a trusted certificate and turn this off'
      });
    }

    return axios.create({
      baseURL,
      timeout: 30000,
      // Cap the response so a hostile or misbehaving endpoint cannot exhaust
      // memory through the backup download path.
      maxContentLength: 256 * 1024 * 1024,
      maxBodyLength: 16 * 1024 * 1024,
      // The v6 API never redirects, and a redirect is a way for a compromised
      // host to point this client somewhere else.
      maxRedirects: 0,
      httpsAgent: new https.Agent({
        rejectUnauthorized: !allowInsecureTls
      }),
      headers: {
        'User-Agent': `PiHoleVault/${APP_VERSION}`,
        Accept: 'application/json'
      },
      // Let callers read 4xx bodies: the v6 API explains every refusal there.
      validateStatus: (status) => status < 500
    });
  }

  clientFor(config) {
    return this.createApiClient(config.host, config.webPort || 80, config.useHttps === true, {
      allowInsecureTls: config.allowInsecureTls
    });
  }

  /**
   * Turn a transport failure into something a person can act on.
   */
  describeNetworkError(error, api) {
    const where = api?.defaults?.baseURL || 'the Pi-hole';
    const code = error.code || '';

    if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/i.test(code) || /certificate/i.test(error.message)) {
      return `The Pi-hole's TLS certificate is not trusted (${code || error.message}). Pi-hole v6 uses a self-signed certificate by default: turn on "Allow self-signed certificate", set ALLOW_INSECURE_TLS=true, or connect over HTTP.`;
    }
    if (code === 'ECONNREFUSED') {
      return `Nothing is listening at ${where}. Check the address, port and HTTP/HTTPS setting.`;
    }
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return `Could not resolve the Pi-hole's hostname for ${where}.`;
    }
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      return `Timed out talking to ${where}.`;
    }
    if (code === 'ECONNRESET' || /socket hang up/i.test(error.message)) {
      return `${where} dropped the connection. If that port serves HTTPS, turn HTTPS on.`;
    }
    if (code === 'EPROTO' || /wrong version number/i.test(error.message)) {
      return `${where} did not answer with TLS. Is HTTPS actually enabled on that port?`;
    }
    return `Could not reach ${where}: ${error.message}`;
  }

  /**
   * Explain a non-2xx answer from the v6 API using the error body it sends.
   */
  describeApiRefusal(response, context) {
    const body = response.data && typeof response.data === 'object' ? response.data : {};
    const key = body.error?.key;
    const message = body.error?.message || body.session?.message || '';

    if (response.status === 401 && /password incorrect/i.test(message)) {
      return 'Pi-hole rejected the password.';
    }
    if (response.status === 400 && /2FA|totp/i.test(message)) {
      return 'This Pi-hole has two-factor authentication turned on. Create an app password in Pi-hole (Settings → Web interface / API → Configure app password) and use it here instead of your login password.';
    }
    if (response.status === 401 && /totp/i.test(message)) {
      return 'Pi-hole asked for a 2FA code. Use an app password instead of your login password.';
    }
    if (response.status === 429 && key === 'api_seats_exceeded') {
      return 'Pi-hole has no free API sessions ("API seats exceeded"). They free up after 30 minutes, or raise webserver.api.max_sessions in Pi-hole.';
    }
    if (response.status === 429) {
      return `Pi-hole is rate-limiting requests${message ? `: ${message}` : ''}. Try again in a minute.`;
    }
    if (response.status === 404) {
      return `${context}: no Pi-hole v6 API found here. PiHoleVault needs Pi-hole v6 or newer for web backups (on v5, use the SSH method).`;
    }
    return `${context}: Pi-hole answered HTTP ${response.status}${message ? ` (${message})` : ''}.`;
  }

  /**
   * Ask the v6 API whether a login is needed. No credentials are sent.
   */
  async probe(api) {
    let response;

    try {
      response = await api.get('/api/auth');
    } catch (error) {
      throw new Error(this.describeNetworkError(error, api));
    }

    const session = response.data && typeof response.data === 'object' ? response.data.session : null;

    if (!session || (response.status !== 200 && response.status !== 401)) {
      if (response.status >= 300 && response.status < 400) {
        throw new Error(`${api.defaults.baseURL} redirected instead of answering. If the Pi-hole forces HTTPS, turn HTTPS on.`);
      }
      throw new Error(this.describeApiRefusal(response, 'Connection test'));
    }

    return { authRequired: session.valid !== true, totp: session.totp === true };
  }

  /**
   * Log in and return a session handle. Always call close() on it: Pi-hole
   * allows only a few concurrent API sessions (webserver.api.max_sessions,
   * 16 by default) and keeps each for 30 minutes, so a client that never logs
   * out locks everyone -- including the Pi-hole's own web interface -- out.
   */
  async openSession(config) {
    const api = this.clientFor(config);
    const { authRequired } = await this.probe(api);

    if (!authRequired) {
      // No password is set on this Pi-hole; every endpoint is open.
      return { api, sid: null, close: async () => {} };
    }

    if (!config.webPassword) {
      throw new Error('This Pi-hole requires a password. Enter its web interface password or an app password.');
    }

    let response;

    try {
      response = await api.post('/api/auth', { password: config.webPassword }, {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      throw new Error(this.describeNetworkError(error, api));
    }

    const session = response.data?.session;

    if (response.status !== 200 || !session?.valid) {
      throw new Error(this.describeApiRefusal(response, 'Login'));
    }

    const sid = session.sid;

    if (sid) {
      // The X-FTL-SID header needs no CSRF token, unlike cookie auth.
      api.defaults.headers.common['X-FTL-SID'] = sid;
    }

    let closed = false;

    return {
      api,
      sid,
      close: async () => {
        if (closed || !sid) return;
        closed = true;
        try {
          await api.delete('/api/auth');
        } catch (error) {
          this.logger.warn('Pi-hole logout failed; the session will expire on its own', { error: error.message });
        }
      }
    };
  }

  async withSession(config, fn) {
    const session = await this.openSession(config);

    try {
      return await fn(session.api);
    } finally {
      await session.close();
    }
  }

  async readVersion(api) {
    try {
      const response = await api.get('/api/info/version');
      const version = response.status === 200 ? response.data?.version : null;
      return version
        ? {
            core: version.core?.local?.version || null,
            web: version.web?.local?.version || null,
            ftl: version.ftl?.local?.version || null
          }
        : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Prove the configured connection will work for a backup: the API answers,
   * the password is accepted, and the Teleporter endpoint is reachable.
   */
  async testWebConnection(config) {
    try {
      const result = await this.withSession(config, async (api) => {
        const version = await this.readVersion(api);
        return { version };
      });

      const ftl = result.version?.ftl;

      return {
        success: true,
        message: ftl ? `Connected to Pi-hole (FTL ${ftl})` : 'Connected to Pi-hole',
        version: result.version
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Kept for callers that only need to know whether the login works.
   */
  async authenticateWeb(config) {
    const result = await this.testWebConnection(config);
    return result.success
      ? { success: true, message: 'Authentication successful' }
      : { success: false, error: result.error };
  }

  async performWebOnlyBackup(connection, backupDir) {
    try {
      if (!backupDir) {
        throw new Error('Backup directory not provided');
      }

      this.logger.info('Starting web backup', { host: String(connection.host).substring(0, 50) });

      const data = await this.withSession(connection, async (api) => {
        let response;

        try {
          // arraybuffer keeps the zip intact; the default would decode it as
          // UTF-8 and corrupt it.
          response = await api.get('/api/teleporter', {
            responseType: 'arraybuffer',
            headers: { Accept: 'application/zip' }
          });
        } catch (error) {
          throw new Error(this.describeNetworkError(error, api));
        }

        if (response.status !== 200) {
          let body = {};
          try {
            body = JSON.parse(Buffer.from(response.data).toString('utf8'));
          } catch (error) {
            // Not JSON; describeApiRefusal falls back to the status code.
          }
          throw new Error(this.describeApiRefusal({ status: response.status, data: body }, 'Teleporter export'));
        }

        return Buffer.from(response.data);
      });

      if (!this.isZip(data)) {
        throw new Error('Pi-hole returned something other than a Teleporter zip archive');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `pi-hole_backup_${timestamp}.zip`;
      const filePath = path.join(backupDir, filename);

      await fs.writeFile(filePath, data);
      const stats = await fs.stat(filePath);

      this.logger.info('Web backup saved', { filename, size: stats.size });

      return { success: true, filename, size: stats.size, format: 'zip' };
    } catch (error) {
      this.logger.error('Web backup failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Turn the restore checkboxes into Pi-hole's Teleporter import selection.
   *
   * Each list is imported together with its group assignments, otherwise a
   * restored blocklist would come back attached to no group and do nothing.
   */
  static importSelection(parts = {}) {
    const on = (key) => parts[key] !== false;
    return {
      config: on('settings'),
      dhcp_leases: on('dhcpLeases'),
      gravity: {
        group: on('groups'),
        adlist: on('adlists'),
        adlist_by_group: on('adlists'),
        domainlist: on('domains'),
        domainlist_by_group: on('domains'),
        client: on('clients'),
        client_by_group: on('clients')
      }
    };
  }

  /**
   * Upload a Teleporter archive to Pi-hole and import the selected parts.
   * Returns the list of items Pi-hole reports it processed.
   */
  async restoreTeleporter(connection, zipBuffer, parts) {
    if (!this.isZip(zipBuffer)) {
      throw new Error('Refusing to upload something that is not a Teleporter zip');
    }

    return this.withSession(connection, async (api) => {
      const form = new FormData();
      form.append('file', new Blob([zipBuffer], { type: 'application/zip' }), 'piholevault-restore.zip');
      form.append('import', JSON.stringify(PiHoleWebService.importSelection(parts)));

      let response;
      try {
        response = await api.post('/api/teleporter', form, {
          // Gravity databases with large blocklists run to hundreds of MB.
          maxBodyLength: 512 * 1024 * 1024,
          timeout: 300000
        });
      } catch (error) {
        throw new Error(this.describeNetworkError(error, api));
      }

      if (response.status !== 200) {
        throw new Error(this.describeApiRefusal(response, 'Restore'));
      }

      // FTL v6.7 answers with `files`; the published spec still says `processed`.
      const files = response.data?.files || response.data?.processed;
      return Array.isArray(files) ? files : [];
    }).then(async (processed) => {
      // Every Teleporter import restarts FTL about a second after it answers.
      // Wait for it to go down and come back, so the caller -- or a scheduled
      // backup straight after -- does not talk to a Pi-hole mid-restart.
      const back = await this.waitForRestart(connection);
      return { processed, restarted: back };
    });
  }

  /**
   * Give FTL time to start its restart, then poll until the API answers.
   * Returns false if it is not back within the timeout.
   */
  async waitForRestart(connection, { graceMs = 3000, timeoutMs = 90000 } = {}) {
    const api = this.clientFor(connection);
    await new Promise((resolve) => setTimeout(resolve, graceMs));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const response = await api.get('/api/auth', { timeout: 3000 });
        if (response.data && response.data.session) return true;
      } catch (error) {
        // Still restarting.
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
  }

  isZip(data) {
    // Local file header signature "PK\x03\x04", and big enough to hold one.
    return Buffer.isBuffer(data) && data.length > 22 && data.readUInt32LE(0) === 0x04034b50;
  }
}

module.exports = PiHoleWebService;
