/**
 * TossArena Authentication Routes
 * Exposes registration, login, logout, session verification, and CSRF endpoints.
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { verifyCsrf } = require('../middleware/csrfProtection');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');

// 1. CSRF Token Bootstrap Endpoint
router.get('/csrf', authController.getCsrfToken);

// 2. User Registration Endpoint
router.post('/register', registerLimiter, verifyCsrf, authController.register);

// 3. User Login Endpoint
router.post('/login', loginLimiter, verifyCsrf, authController.login);

// 4. User Logout Endpoint
router.post('/logout', verifyCsrf, authController.logout);

// 5. Authenticated Current User Endpoint
router.get('/me', authenticate, authController.getCurrentUser);

// 6. Role-Based Verification Endpoint (Admin Only)
router.get('/admin-check', authenticate, authorize('admin'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Administrator authorization confirmed.',
    user: req.user
  });
});

module.exports = router;
