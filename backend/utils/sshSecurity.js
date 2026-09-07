const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');

// Algorithms offered to the remote SSH server.
//
// ssh-dss (DSA, 1024-bit) and hmac-sha1 were previously offered and are removed:
// OpenSSH disabled DSA host keys in 7.0 and SHA-1 signatures in 8.8, so anything
// still requiring them is unpatched. Set SSH_ALLOW_LEGACY_ALGORITHMS=true to put
// them back for genuinely ancient hardware.
const MODERN_ALGORITHMS = {
  serverHostKey: [
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'rsa-sha2-512',
    'rsa-sha2-256'
  ],
  cipher: [
    'chacha20-poly1305@openssh.com',
    'aes256-gcm@openssh.com',
    'aes128-gcm@openssh.com',
    'aes256-ctr',
    'aes192-ctr',
    'aes128-ctr'
  ],
  hmac: [
    'hmac-sha2-256-etm@openssh.com',
    'hmac-sha2-512-etm@openssh.com',
    'hmac-sha2-256',
    'hmac-sha2-512'
  ],
  compress: ['none']
};

const LEGACY_ALGORITHMS = {
  serverHostKey: MODERN_ALGORITHMS.serverHostKey.concat(['ssh-rsa', 'ssh-dss']),
  cipher: MODERN_ALGORITHMS.cipher,
  hmac: MODERN_ALGORITHMS.hmac.concat(['hmac-sha1']),
  compress: ['none']
};

function allowLegacyAlgorithms() {
  return process.env.SSH_ALLOW_LEGACY_ALGORITHMS === 'true';
}

function getAlgorithms() {
  return allowLegacyAlgorithms() ? LEGACY_ALGORITHMS : MODERN_ALGORITHMS;
}

/**
 * Host key policy, from SSH_HOST_KEY_POLICY:
 *
 *   tofu     (default) trust on first use -- the first key seen for a host is
 *            pinned, and any later change is refused.
 *   strict   only connect to hosts already pinned in known_hosts.json.
 *   insecure accept any key. Restores the pre-hardening behaviour and is only
 *            appropriate on a network you fully control.
 */
function getHostKeyPolicy() {
  const policy = (process.env.SSH_HOST_KEY_POLICY || 'tofu').toLowerCase();
  return ['tofu', 'strict', 'insecure'].includes(policy) ? policy : 'tofu';
}

function fingerprint(keyBuffer) {
  return 'SHA256:' + crypto.createHash('sha256').update(keyBuffer).digest('base64').replace(/=+$/, '');
}

function knownHostsPath(dataDir) {
  return path.join(dataDir, 'known_hosts.json');
}

function readKnownHosts(dataDir) {
  try {
    const file = knownHostsPath(dataDir);
    if (!fs.existsSync(file)) {
      return {};
    }
    const parsed = fs.readJsonSync(file);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeKnownHosts(dataDir, entries) {
  const file = knownHostsPath(dataDir);
  fs.writeJsonSync(file, entries, { spaces: 2 });
  try {
    fs.chmodSync(file, 0o600);
  } catch (error) {
    // chmod is a no-op on some filesystems (notably bind mounts on Windows
    // hosts); the pin itself is what matters, so this is not fatal.
  }
}

/**
 * Build a synchronous ssh2 hostVerifier for one host:port.
 *
 * Returns false to abort the handshake, which node-ssh surfaces as a connection
 * error. The rejection reason is logged because the callback itself cannot
 * carry a message.
 */
function createHostVerifier({ dataDir, host, port, logger }) {
  const policy = getHostKeyPolicy();
  const key = `${host}:${port}`;

  return (hostKey) => {
    const seen = fingerprint(hostKey);

    if (policy === 'insecure') {
      logger.warn('SSH host key not verified (SSH_HOST_KEY_POLICY=insecure)', {
        host,
        port,
        fingerprint: seen
      });
      return true;
    }

    const knownHosts = readKnownHosts(dataDir);
    const pinned = knownHosts[key];

    if (pinned && pinned.fingerprint === seen) {
      return true;
    }

    if (pinned) {
      logger.error('SSH host key mismatch -- refusing to connect', {
        host,
        port,
        expected: pinned.fingerprint,
        received: seen,
        hint: 'If the Pi-hole was rebuilt, remove its entry from data/known_hosts.json'
      });
      return false;
    }

    if (policy === 'strict') {
      logger.error('SSH host key not pinned and SSH_HOST_KEY_POLICY=strict', {
        host,
        port,
        fingerprint: seen
      });
      return false;
    }

    // tofu: pin the key the first time this host is seen.
    try {
      knownHosts[key] = { fingerprint: seen, pinnedAt: new Date().toISOString() };
      writeKnownHosts(dataDir, knownHosts);
      logger.info('SSH host key pinned on first use', { host, port, fingerprint: seen });
      return true;
    } catch (error) {
      logger.error('Failed to pin SSH host key', { host, port, error: error.message });
      return false;
    }
  };
}

/**
 * Assemble node-ssh connect options with host-key verification and a modern
 * algorithm set applied. `auth` supplies exactly one of password/privateKey.
 *
 * Every SSH connection in the app must go through this helper so that no call
 * site can silently opt out of host verification.
 */
function buildConnectOptions({ dataDir, host, port, username, logger, auth = {}, readyTimeout = 15000 }) {
  const options = {
    host,
    port,
    username,
    readyTimeout,
    algorithms: getAlgorithms(),
    hostVerifier: createHostVerifier({ dataDir, host, port, logger })
  };

  if (auth.privateKey) {
    options.privateKey = auth.privateKey;
  } else if (auth.privateKeyPath) {
    options.privateKeyPath = auth.privateKeyPath;
  }

  if (auth.password) {
    options.password = auth.password;
    options.tryKeyboard = true;
    options.onKeyboardInteractive = (name, instructions, lang, prompts, finish) => {
      if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
        finish([auth.password]);
      } else {
        finish([]);
      }
    };
  }

  return options;
}

module.exports = {
  buildConnectOptions,
  createHostVerifier,
  getAlgorithms,
  getHostKeyPolicy,
  fingerprint,
  knownHostsPath
};
