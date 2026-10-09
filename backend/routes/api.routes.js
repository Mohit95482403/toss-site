/**
 * API Router
 * Aggregates all TossArena API routes.
 */

const express = require('express');
const router = express.Router();
const healthController = require('../controllers/health.controller');
const authRoutes = require('./authRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const userRoutes = require('./userRoutes');
const matchRoutes = require('./matchRoutes');

// Application health check endpoint (liveness)
router.get('/health', healthController.getHealthStatus);

// Database health check endpoint (readiness)
router.get('/health/db', healthController.getDbHealthStatus);

// Authentication & Session endpoints (Day 4)
router.use('/auth', authRoutes);

// User Dashboard endpoints (Day 5)
router.use('/dashboard', dashboardRoutes);

// User Profile self-service endpoints (Day 5)
router.use('/users', userRoutes);

// Match Fixtures feed endpoints
router.use('/matches', matchRoutes);

// Toss Predictions endpoints (Day 7)
const predictionRoutes = require('./predictionRoutes');
router.use('/predictions', predictionRoutes);

// Virtual Demo Wallet & Transaction Ledger endpoints (Day 8)
const walletRoutes = require('./walletRoutes');
router.use('/wallet', walletRoutes);

module.exports = router;


