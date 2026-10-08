const crypto = require('crypto');
const fs = require('fs-extra');
const { unzipSync } = require('fflate');

// Encrypted backups are a small header followed by AES-256-GCM ciphertext:
//
//   "PHVENC1\0" | salt (16) | iv (12) | auth tag (16) | ciphertext
//
// The key is derived from the passphrase with scrypt, so the passphrase itself
// is never stored next to the archive. GCM authenticates the whole file: a
// wrong passphrase and a tampered file fail the same way, before any byte of
// plaintext is used.
const MAGIC = Buffer.from('PHVENC1\0', 'binary');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// What a usable Pi-hole v6 Teleporter archive must contain.
const REQUIRED_ENTRIES = ['etc/pihole/pihole.toml', 'etc/pihole/gravity.db'];
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'binary');

const ENCRYPTED_SUFFIX = '.enc';

function isEncryptedBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > HEADER_LEN && buffer.subarray(0, MAGIC.length).equals(MAGIC);
}

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(String(passphrase), salt, 32, SCRYPT);
}

function encrypt(plaintext, passphrase) {
  if (!passphrase) {
    throw new Error('An encryption passphrase is required');
  }
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

function decrypt(buffer, passphrase) {
  if (!isEncryptedBuffer(buffer)) {
    throw new Error('Not a PiHoleVault encrypted archive');
  }
  if (!passphrase) {
    throw new Error('This backup is encrypted; set the encryption passphrase in Settings to open it');
  }
  let offset = MAGIC.length;
  const salt = buffer.subarray(offset, (offset += SALT_LEN));
  const iv = buffer.subarray(offset, (offset += IV_LEN));
  const tag = buffer.subarray(offset, (offset += TAG_LEN));
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(buffer.subarray(offset)), decipher.final()]);
  } catch (error) {
    throw new Error('Could not decrypt this backup: wrong passphrase, or the file is damaged');
  }
}

/**
 * Read a stored backup and return the plain zip, decrypting when needed.
 */
async function readZip(filePath, passphrase) {
  const buffer = await fs.readFile(filePath);
  return isEncryptedBuffer(buffer) ? decrypt(buffer, passphrase) : buffer;
}

/**
 * Unpack the entries of a zip held in memory. `names` limits which entries
 * are inflated; everything else is listed but skipped.
 */
function unpack(zipBuffer, names) {
  const wanted = names ? new Set(names) : null;
  const listed = [];
  const files = unzipSync(new Uint8Array(zipBuffer), {
    filter: (file) => {
      listed.push(file.name);
      return !wanted || wanted.has(file.name);
    }
  });
  return { listed, files };
}

/**
 * Check that a buffer is a complete, usable Teleporter archive.
 *
 * Inflating the two files that matter catches truncation and corruption;
 * checking their contents catches a zip that is valid but is not a Pi-hole
 * backup (an error page saved by mistake, an empty export).
 */
function verifyZip(zipBuffer) {
  const result = { ok: false, checkedAt: new Date().toISOString(), entries: 0, missing: [], error: null };

  try {
    const { listed, files } = unpack(zipBuffer, REQUIRED_ENTRIES);
    result.entries = listed.length;
    result.missing = REQUIRED_ENTRIES.filter((name) => !files[name]);

    if (result.missing.length) {
      result.error = `Missing ${result.missing.join(', ')}`;
      return result;
    }

    const toml = Buffer.from(files['etc/pihole/pihole.toml']).toString('utf8');
    if (!/^\s*\[[a-z]/m.test(toml)) {
      result.error = 'pihole.toml is empty or not a Pi-hole configuration';
      return result;
    }

    const gravity = Buffer.from(files['etc/pihole/gravity.db']);
    if (gravity.length < SQLITE_MAGIC.length || !gravity.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)) {
      result.error = 'gravity.db is not a SQLite database';
      return result;
    }

    result.ok = true;
  } catch (error) {
    result.error = `Archive is damaged: ${error.message}`;
  }

  return result;
}

async function verifyFile(filePath, passphrase) {
  try {
    return verifyZip(await readZip(filePath, passphrase));
  } catch (error) {
    return { ok: false, checkedAt: new Date().toISOString(), entries: 0, missing: [], error: error.message };
  }
}

module.exports = {
  ENCRYPTED_SUFFIX,
  REQUIRED_ENTRIES,
  isEncryptedBuffer,
  encrypt,
  decrypt,
  readZip,
  unpack,
  verifyZip,
  verifyFile
};
