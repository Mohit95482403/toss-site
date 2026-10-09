/**
 * TossArena Prediction Routes
 * Endpoints for submitting predictions, checking prediction status, retrieving prediction history,
 * inspecting prediction details, and viewing user performance statistics.
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

// Retrieve user prediction statistics (must precede :id to prevent param collision)
router.get('/statistics', predictionController.getPredictionStatistics);

// Retrieve user prediction history (standard endpoint with search, filters, pagination)
router.get('/', predictionController.getPredictionsHistory);

// Day 7 backwards compatibility route
router.get('/me', predictionController.getMyPredictions);

// Check prediction for a specific match
router.get('/me/match/:matchId', predictionController.getMyPredictionForMatch);

// Retrieve single prediction details with ownership verification
router.get('/:id', predictionController.getPredictionDetails);

module.exports = router;
