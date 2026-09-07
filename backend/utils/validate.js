const net = require('net');
const path = require('path');

// Placeholder written in place of any secret that leaves the server.
// Clients echo this value back on save; the config routes treat it as
// "leave the stored value untouched" rather than as a literal new secret.
const REDACTED = '***REDACTED***';

// RFC 1123 host label rules: letters, digits and inner hyphens, 1-63 chars per
// label, 253 chars overall. Deliberately strict -- host values reach child
// processes and SSH connect options, so anything outside this set is rejected
// rather than escaped.
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.?$/;

/**
 * True when `value` is a bare hostname, IPv4 address or IPv6 address.
 * URLs, shell metacharacters, whitespace and empty strings are all rejected.
 */
function isValidHost(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const host = value.trim();

  if (!host || host.length > 253) {
    return false;
  }

  if (net.isIP(host)) {
    return true;
  }

  if (host.startsWith('[') && host.endsWith(']')) {
    return net.isIP(host.slice(1, -1)) === 6;
  }

  return HOSTNAME_PATTERN.test(host);
}

/**
 * Normalise a port into an integer, or return null when it is out of range.
 */
function parsePort(value, fallback = 22) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return port;
}

// Whitespace and C0/C7F control characters. SSH usernames reach the remote
// server rather than a shell, but keeping these out avoids log injection.
function hasControlOrSpace(value) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || /\s/.test(value[i])) {
      return true;
    }
  }
  return false;
}

function isValidUsername(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 64 &&
    !hasControlOrSpace(value);
}

// Either path separator. Checked explicitly because path.basename() only
// recognises the separator of the host platform, so a backslash would survive
// this check on Linux and still be treated as a separator elsewhere.
const PATH_SEPARATOR_PATTERN = /[\\/]/;

/**
 * Resolve `filename` inside `baseDir`, returning null when it escapes.
 *
 * Callers must treat null as "reject the request" and must not fall back to
 * path.join, which happily resolves traversal sequences.
 */
function resolveWithin(baseDir, filename) {
  if (typeof filename !== 'string' || !filename) {
    return null;
  }

  if (filename.indexOf(String.fromCharCode(0)) !== -1 || PATH_SEPARATOR_PATTERN.test(filename)) {
    return null;
  }

  if (filename === '.' || filename === '..') {
    return null;
  }

  const base = path.resolve(baseDir);
  const full = path.resolve(base, filename);
  const relative = path.relative(base, full);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return full;
}

/**
 * Filenames that are safe to interpolate into a Content-Disposition header.
 */
function isSafeDownloadName(filename) {
  return typeof filename === 'string' &&
    filename.length > 0 &&
    filename.length <= 255 &&
    /^[A-Za-z0-9._-]+$/.test(filename);
}

// Any object key matching this pattern holds a credential and is replaced with
// REDACTED before the value is serialised to a client or a log line.
const SECRET_KEY_PATTERN =
  /(pass|secret|token|webhook|apikey|api_key|credential|privatekey|private_key|csrf|^sid$|authorization)/i;

/**
 * Deep-copy `value`, replacing every credential-bearing field with REDACTED.
 * Cycles are collapsed to '[Circular]' so this is safe on arbitrary input.
 */
function redactSecrets(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry, seen));
  }

  const result = {};

  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      result[key] = entry === undefined || entry === null || entry === '' ? entry : REDACTED;
    } else {
      result[key] = redactSecrets(entry, seen);
    }
  }

  return result;
}

// Keys that must never be copied from request bodies into stored objects,
// because assigning them can reach Object.prototype.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Merge `incoming` over `base` while dropping prototype-polluting keys and
 * preserving any stored secret the client echoed back as REDACTED.
 */
function mergePreservingSecrets(base, incoming) {
  if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return incoming === REDACTED ? base : incoming;
  }

  const result = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {};

  for (const [key, value] of Object.entries(incoming)) {
    if (FORBIDDEN_KEYS.has(key)) {
      continue;
    }

    if (value === REDACTED) {
      // Client sent back the masked value: keep whatever is already stored.
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergePreservingSecrets(result[key], value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

module.exports = {
  REDACTED,
  isValidHost,
  isValidUsername,
  isSafeDownloadName,
  parsePort,
  resolveWithin,
  redactSecrets,
  mergePreservingSecrets
};
