/**
 * API Router
 * Aggregates all TossArena API routes.
 */

const express = require('express');
const router = express.Router();
const healthController = require('../controllers/health.controller');
const authRoutes = require('./authRoutes');

// Application health check endpoint (liveness)
router.get('/health', healthController.getHealthStatus);

// Database health check endpoint (readiness)
router.get('/health/db', healthController.getDbHealthStatus);

// Authentication & Session endpoints (Day 4)
router.use('/auth', authRoutes);

module.exports = router;

