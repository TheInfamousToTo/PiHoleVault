const crypto = require('crypto');

/**
 * Compare two secrets without leaking their contents through timing.
 *
 * The values are hashed first so that timingSafeEqual always sees equal-length
 * buffers -- it throws otherwise, and the length difference would itself be a
 * side channel.
 */
function safeEqual(a, b) {
  const digestA = crypto.createHash('sha256').update(String(a)).digest();
  const digestB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

/**
 * Pull a bearer token out of the request.
 *
 * Accepts `Authorization: Bearer <token>` or `X-Auth-Token: <token>`. A query
 * parameter is deliberately not accepted: it would end up in access logs and
 * browser history.
 */
function extractToken(req) {
  const header = req.get('authorization');

  if (header && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }

  const custom = req.get('x-auth-token');

  if (custom) {
    return custom.trim();
  }

  return null;
}

/**
 * Build the API authentication middleware.
 *
 * Authentication is opt-in: when AUTH_TOKEN is unset the middleware passes every
 * request through, preserving behaviour for existing deployments, and the server
 * logs a warning at startup. When AUTH_TOKEN is set, every route this middleware
 * guards requires it.
 */
function createAuthMiddleware(logger) {
  const token = process.env.AUTH_TOKEN;

  if (!token) {
    logger.warn(
      'AUTH_TOKEN is not set - the API is UNAUTHENTICATED. ' +
      'Anyone who can reach this port can read the configuration, download backups ' +
      'and open SSH connections. Set AUTH_TOKEN to require a bearer token, and do not ' +
      'expose this service to an untrusted network.'
    );

    const passthrough = (req, res, next) => next();
    passthrough.enabled = false;
    return passthrough;
  }

  if (token.length < 16) {
    logger.warn('AUTH_TOKEN is shorter than 16 characters and is easy to brute force', {
      length: token.length
    });
  }

  logger.info('API authentication enabled via AUTH_TOKEN');

  const middleware = (req, res, next) => {
    // Browsers send a credential-free preflight; rejecting it would surface as a
    // CORS error rather than a 401 and hide the real cause.
    if (req.method === 'OPTIONS') {
      return next();
    }

    const provided = extractToken(req);

    if (!provided) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        detail: 'Send the API token as "Authorization: Bearer <token>" or "X-Auth-Token: <token>".'
      });
    }

    if (!safeEqual(provided, token)) {
      logger.warn('Rejected API request with an invalid token', {
        ip: req.ip,
        method: req.method,
        path: req.path
      });
      return res.status(401).json({ success: false, error: 'Invalid API token' });
    }

    return next();
  };

  middleware.enabled = true;
  return middleware;
}

module.exports = { createAuthMiddleware, safeEqual, extractToken };
