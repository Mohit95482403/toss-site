/**
 * TossArena Dashboard Routes
 * Authenticated endpoints for user statistics, wallet state, and activity.
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/authenticate');

// All dashboard endpoints require active authenticated session
router.use(authenticate);

router.get('/summary', dashboardController.getSummary);
router.get('/activity', dashboardController.getActivity);

module.exports = router;
