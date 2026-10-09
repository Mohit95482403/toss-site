/**
 * TossArena Role-Based Authorization Middleware
 * Enforces role restrictions based on authoritative req.user data.
 * Never trusts client-supplied roles.
 */

/**
 * Higher-order middleware to restrict routes to specified roles
 * @param  {...string} allowedRoles - E.g. 'admin', 'user'
 * @returns {import('express').RequestHandler}
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required prior to authorization check.',
        code: 'UNAUTHORIZED'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have required permissions to perform this action.',
        code: 'FORBIDDEN'
      });
    }

    next();
  };
}

module.exports = {
  authorize
};
