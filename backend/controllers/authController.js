/**
 * TossArena Authentication Controller
 * Handles HTTP requests for registration, login, logout, current session, and CSRF bootstrap.
 */

const authService = require('../services/authService');
const { validateRegistration, validateLogin } = require('../validators/authValidators');
const { getOrCreateCsrfToken, rotateCsrfToken } = require('../middleware/csrfProtection');
const { session: sessionConfig } = require('../config/env');

/**
 * GET /api/auth/csrf
 * Generates and returns a session-bound CSRF token
 */
async function getCsrfToken(req, res) {
  try {
    const csrfToken = getOrCreateCsrfToken(req);
    return res.status(200).json({
      success: true,
      csrfToken
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to initialize security token.',
      error: err.message
    });
  }
}

/**
 * POST /api/auth/register
 * Handles user account creation with validation and initial wallet grant
 */
async function register(req, res, next) {
  try {
    // 1. Validate payload
    const { isValid, errors, sanitized } = validateRegistration(req.body);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors[0] || 'Please check your registration input.',
        errors
      });
    }

    // 2. Perform registration in service layer
    const result = await authService.registerUser(sanitized);

    // 3. Return created user
    return res.status(201).json({
      success: true,
      message: 'Account created successfully with 1,000 virtual demo credits! Please sign in.',
      user: result.user
    });
  } catch (error) {
    if (error.code === 'EMAIL_IN_USE' || error.statusCode === 409) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
        code: 'EMAIL_IN_USE'
      });
    }
    return next(error);
  }
}

/**
 * POST /api/auth/login
 * Validates credentials, regenerates session, and stores authenticated state
 */
async function login(req, res, next) {
  try {
    // 1. Validate payload
    const { isValid, errors, sanitized } = validateLogin(req.body);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors[0] || 'Please provide your email and password.',
        errors
      });
    }

    // 2. Verify credentials and account standing
    const authResult = await authService.authenticateUser(sanitized);
    if (!authResult.success) {
      const statusCode = authResult.reason === 'ACCOUNT_SUSPENDED' || authResult.reason === 'ACCOUNT_BANNED' ? 403 : 401;
      return res.status(statusCode).json({
        success: false,
        message: authResult.message,
        code: authResult.reason
      });
    }

    const { user } = authResult;

    // 3. Regenerate session ID to prevent session fixation attacks
    req.session.regenerate((err) => {
      if (err) {
        return next(err);
      }

      // 4. Attach minimal authenticated metadata
      req.session.userId = user.id;
      req.session.userRole = user.role;

      // Rotate CSRF token upon privilege boundary change
      const newCsrf = rotateCsrfToken(req);

      // Save regenerated session to MySQL store
      req.session.save((saveErr) => {
        if (saveErr) {
          return next(saveErr);
        }

        return res.status(200).json({
          success: true,
          message: 'Login successful.',
          user,
          csrfToken: newCsrf
        });
      });
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/auth/logout
 * Destroys server-side session and clears HTTP-only cookie
 */
async function logout(req, res, next) {
  if (!req.session) {
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.'
    });
  }

  req.session.destroy((err) => {
    if (err) {
      return next(err);
    }

    res.clearCookie(sessionConfig.name, {
      path: '/',
      httpOnly: true,
      secure: sessionConfig.secure,
      sameSite: sessionConfig.sameSite
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.'
    });
  });
}

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile and virtual balance
 */
async function getCurrentUser(req, res) {
  // `req.user` is already populated and verified by `authenticate` middleware
  return res.status(200).json({
    success: true,
    user: req.user
  });
}

module.exports = {
  getCsrfToken,
  register,
  login,
  logout,
  getCurrentUser
};
