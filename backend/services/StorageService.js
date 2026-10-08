const axios = require('axios');
const aws4 = require('aws4');
const { trimChar, trimEndChar } = require('../utils/text');

/**
 * Off-site copies of backups.
 *
 * Two targets cover nearly every homelab:
 *   s3     -- any S3-compatible store: AWS S3, Backblaze B2, MinIO, Wasabi,
 *             Cloudflare R2, Garage. Requests are signed with SigV4 (aws4),
 *             which keeps the multi-megabyte AWS SDK out of the image.
 *   webdav -- Nextcloud, ownCloud, Synology, rclone serve, Apache mod_dav.
 *
 * SMB/NFS shares need no code: mount them into the container as the backup
 * directory or as a second volume.
 *
 * Every request goes to a URL taken from the saved configuration, never from
 * the API request that triggers it.
 */

function parseHttpUrl(value, label) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch (error) {
    throw new Error(`${label} is not a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must start with http:// or https://`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not contain credentials; use the username and password fields`);
  }
  return url;
}

function joinKey(...parts) {
  return parts
    .filter(Boolean)
    .map((p) => trimChar(p, '/'))
    .filter(Boolean)
    .join('/');
}

function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

class StorageService {
  constructor(offsite, logger = console) {
    this.config = offsite || {};
    this.logger = logger;
  }

  get enabled() {
    return this.config.enabled === true && (this.config.type === 's3' || this.config.type === 'webdav');
  }

  describe() {
    if (this.config.type === 's3') {
      const s3 = this.config.s3 || {};
      return `s3://${s3.bucket || '?'}/${joinKey(s3.prefix)}`;
    }
    if (this.config.type === 'webdav') {
      return joinKey(this.config.webdav?.url, this.config.webdav?.path);
    }
    return 'none';
  }

  // --- S3 -----------------------------------------------------------------

  s3Request(method, key, body) {
    const s3 = this.config.s3 || {};
    if (!s3.bucket || !s3.accessKeyId || !s3.secretAccessKey) {
      throw new Error('S3 needs a bucket, an access key ID and a secret access key');
    }

    const region = s3.region || 'us-east-1';
    const endpoint = s3.endpoint
      ? parseHttpUrl(s3.endpoint, 'S3 endpoint')
      : new URL(`https://s3.${region}.amazonaws.com`);
    const pathStyle = s3.forcePathStyle !== false;
    const objectKey = encodeKey(joinKey(s3.prefix, key));

    const host = pathStyle ? endpoint.host : `${s3.bucket}.${endpoint.host}`;
    const basePath = trimEndChar(endpoint.pathname, '/');
    const requestPath = pathStyle
      ? `${basePath}/${encodeURIComponent(s3.bucket)}/${objectKey}`
      : `${basePath}/${objectKey}`;

    const signed = aws4.sign(
      {
        host,
        path: requestPath,
        method,
        service: 's3',
        region,
        headers: body ? { 'Content-Type': 'application/octet-stream' } : {},
        body
      },
      { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey }
    );

    return axios({
      method,
      url: `${endpoint.protocol}//${host}${requestPath}`,
      headers: signed.headers,
      data: body,
      maxBodyLength: Infinity,
      maxContentLength: 16 * 1024 * 1024,
      maxRedirects: 0,
      timeout: 120000,
      validateStatus: () => true
    });
  }

  // --- WebDAV -------------------------------------------------------------

  webdavRequest(method, key, body, extraHeaders = {}) {
    const dav = this.config.webdav || {};
    const base = parseHttpUrl(dav.url, 'WebDAV URL');
    const path = joinKey(base.pathname, dav.path, key);
    const auth = dav.username ? { username: dav.username, password: dav.password || '' } : undefined;

    return axios({
      method,
      url: `${base.protocol}//${base.host}/${encodeKey(path)}`,
      auth,
      headers: extraHeaders,
      data: body,
      maxBodyLength: Infinity,
      maxContentLength: 16 * 1024 * 1024,
      maxRedirects: 0,
      timeout: 120000,
      validateStatus: () => true
    });
  }

  async webdavEnsureDir() {
    const dav = this.config.webdav || {};
    const segments = joinKey(dav.path).split('/').filter(Boolean);
    let current = '';
    for (const segment of segments) {
      current = joinKey(current, segment);
      const res = await this.webdavDir('MKCOL', current);
      // 201 created, 405 already exists; anything else is a real problem.
      if (![201, 405, 301].includes(res.status)) {
        throw new Error(`WebDAV could not create folder "${current}": ${this.explain(res)}`);
      }
    }
  }

  webdavDir(method, relPath) {
    const dav = this.config.webdav || {};
    const base = parseHttpUrl(dav.url, 'WebDAV URL');
    const path = joinKey(base.pathname, relPath);
    const auth = dav.username ? { username: dav.username, password: dav.password || '' } : undefined;
    return axios({
      method,
      url: `${base.protocol}//${base.host}/${encodeKey(path)}/`,
      auth,
      maxRedirects: 0,
      timeout: 30000,
      validateStatus: () => true
    });
  }

  // --- Public API ----------------------------------------------------------

  async upload(filename, buffer) {
    if (!this.enabled) throw new Error('Off-site storage is not enabled');

    let res;
    if (this.config.type === 's3') {
      res = await this.s3Request('PUT', filename, buffer);
    } else {
      await this.webdavEnsureDir();
      res = await this.webdavRequest('PUT', filename, buffer, { 'Content-Type': 'application/octet-stream' });
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(this.explain(res));
    }
    return { target: this.describe(), key: filename };
  }

  async remove(filename) {
    if (!this.enabled) return;
    const res = this.config.type === 's3'
      ? await this.s3Request('DELETE', filename)
      : await this.webdavRequest('DELETE', filename);
    if (res.status >= 300 && res.status !== 404) {
      throw new Error(this.explain(res));
    }
  }

  /**
   * Write, read back and delete a small probe object.
   */
  async test() {
    const probe = `.piholevault-probe-${Date.now()}`;
    const body = Buffer.from('PiHoleVault storage test\n');
    await this.upload(probe, body);

    const res = this.config.type === 's3'
      ? await this.s3Request('GET', probe)
      : await this.webdavRequest('GET', probe);
    if (res.status !== 200) {
      throw new Error(`Upload worked but reading it back failed: ${this.explain(res)}`);
    }

    await this.remove(probe);
    return { success: true, message: `Wrote, read back and deleted a test file at ${this.describe()}` };
  }

  explain(res) {
    const body = typeof res.data === 'string' ? res.data : Buffer.isBuffer(res.data) ? res.data.toString('utf8') : '';
    const code = (body.match(/<Code>([^<]+)<\/Code>/) || [])[1];
    if (res.status === 401 || res.status === 403) {
      return `Access denied (HTTP ${res.status}${code ? `, ${code}` : ''}): check the credentials and bucket/folder permissions`;
    }
    if (res.status === 404) {
      return `Not found (HTTP 404${code ? `, ${code}` : ''}): check the bucket name or WebDAV path`;
    }
    return `HTTP ${res.status}${code ? ` (${code})` : ''}`;
  }
}

StorageService.parseHttpUrl = parseHttpUrl;

module.exports = StorageService;
