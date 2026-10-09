/**
 * API Router
 * Aggregates all TossArena API routes.
 */

const express = require('express');
const router = express.Router();
const healthController = require('../controllers/health.controller');

// Health check endpoint
router.get('/health', healthController.getHealthStatus);

module.exports = router;
