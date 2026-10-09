/**
 * API Router
 * Aggregates all TossArena API routes.
 */

const express = require('express');
const router = express.Router();
const healthController = require('../controllers/health.controller');

// Application health check endpoint (liveness)
router.get('/health', healthController.getHealthStatus);

// Database health check endpoint (readiness)
router.get('/health/db', healthController.getDbHealthStatus);

module.exports = router;
