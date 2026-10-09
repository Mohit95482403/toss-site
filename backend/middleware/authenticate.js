/**
 * TossArena Authentication Middleware
 * Validates active session and populates req.user with authoritative database data.
 */

const { getUserById } = require('../services/authService');

/**
 * Ensures request has an active valid session and active account status
 */
async function authenticate(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please sign in to continue.',
      code: 'UNAUTHORIZED'
    });
  }

  try {
    const user = await getUserById(req.session.userId);

    if (!user) {
      // User no longer exists in database; invalidate session
      req.session.destroy(() => {});
      return res.status(401).json({
        success: false,
        message: 'Account no longer exists. Please sign in again.',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }

    if (user.status !== 'active') {
      // Invalidate session if suspended or banned
      req.session.destroy(() => {});
      return res.status(403).json({
        success: false,
        message: `Account is currently ${user.status}. Access denied.`,
        code: `ACCOUNT_${user.status.toUpperCase()}`
      });
    }

    // Attach authoritative database user to request
    req.user = user;
    next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Optional authentication: Populates req.user if session exists, but doesn't block unauthenticated
 */
async function optionalAuthenticate(req, res, next) {
  if (req.session && req.session.userId) {
    try {
      const user = await getUserById(req.session.userId);
      if (user && user.status === 'active') {
        req.user = user;
      }
    } catch (_) {
      // Silently proceed for optional auth
    }
  }
  next();
}

module.exports = {
  authenticate,
  optionalAuthenticate
};
