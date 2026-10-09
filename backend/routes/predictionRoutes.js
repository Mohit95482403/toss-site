/**
 * TossArena Prediction Routes
 * Endpoints for submitting predictions, checking prediction status, and retrieving prediction history.
 */

const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/predictionController');
const { authenticate } = require('../middleware/authenticate');
const { verifyCsrf } = require('../middleware/csrfProtection');

// All prediction operations require authentication
router.use(authenticate);

// Submit prediction (state-changing request requires CSRF verification)
router.post('/', verifyCsrf, predictionController.submitPrediction);

// Retrieve user prediction history
router.get('/me', predictionController.getMyPredictions);

// Check prediction for a specific match
router.get('/me/match/:matchId', predictionController.getMyPredictionForMatch);

module.exports = router;
