/**
 * TossArena CSRF Protection Middleware
 * Session-bound cryptographically secure CSRF protection for cookie-based authentication.
 * Generates per-session tokens and verifies state-changing requests (POST, PUT, PATCH, DELETE).
 */

const crypto = require('crypto');
const { ALLOWED_ORIGINS, isProduction } = require('../config/env');

/**
 * Generates a cryptographically strong 32-byte hex token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Ensures req.session has a CSRF token; generates one if absent.
 * @param {import('express').Request} req
 * @returns {string} The active CSRF token for the session
 */
function getOrCreateCsrfToken(req) {
  if (!req.session) {
    throw new Error('CSRF middleware requires session middleware to be initialized first.');
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }

  return req.session.csrfToken;
}

/**
 * Regenerates the CSRF token upon session state changes (e.g., login, privilege escalation)
 * @param {import('express').Request} req
 * @returns {string} The new token
 */
function rotateCsrfToken(req) {
  if (req.session) {
    req.session.csrfToken = generateToken();
    return req.session.csrfToken;
  }
  return null;
}

/**
 * Verifies origin header against allowed origins for extra defense-in-depth
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isOriginAllowed(req) {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    // Non-browser or same-origin requests might not send origin
    return true;
  }

  return ALLOWED_ORIGINS.some((allowed) => {
    return origin === allowed || origin.startsWith(allowed + '/');
  });
}

/**
 * Middleware: Enforces CSRF token check on state-changing requests
 */
function verifyCsrf(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (safeMethods.includes(req.method)) {
    return next();
  }

  // 1. Defense-in-depth Origin check
  if (!isOriginAllowed(req)) {
    return res.status(403).json({
      success: false,
      message: 'Cross-origin request rejected by security policy.',
      code: 'FORBIDDEN_ORIGIN'
    });
  }

  // 2. Session verification
  if (!req.session) {
    return res.status(500).json({
      success: false,
      message: 'Server session configuration error.',
      code: 'SESSION_MISSING'
    });
  }

  // 3. Extract submitted token from headers or body
  const submittedToken =
    req.headers['x-csrf-token'] ||
    req.headers['x-xsrf-token'] ||
    (req.body && req.body._csrf);

  const sessionToken = req.session.csrfToken;

  if (!sessionToken || !submittedToken) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
      code: 'EBADCSRFTOKEN'
    });
  }

  // 4. Constant-time comparison to prevent timing attacks
  try {
    const tokenBuffer = Buffer.from(submittedToken, 'utf8');
    const sessionBuffer = Buffer.from(sessionToken, 'utf8');

    if (tokenBuffer.length !== sessionBuffer.length || !crypto.timingSafeEqual(tokenBuffer, sessionBuffer)) {
      return res.status(403).json({
        success: false,
        message: 'CSRF token mismatch. Please reload the page.',
        code: 'EBADCSRFTOKEN'
      });
    }
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid CSRF token format.',
      code: 'EBADCSRFTOKEN'
    });
  }

  next();
}

module.exports = {
  getOrCreateCsrfToken,
  rotateCsrfToken,
  verifyCsrf
};
