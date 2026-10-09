/**
 * TossArena User Routes
 * Routes for self-service user profile management.
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/authenticate');
const { verifyCsrf } = require('../middleware/csrfProtection');

// All user profile routes require active authenticated session
router.use(authenticate);

router.get('/me', userController.getProfile);
router.patch('/me', verifyCsrf, userController.updateProfile);

module.exports = router;
