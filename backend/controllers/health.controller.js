/**
 * Health Controller
 * Provides non-sensitive system status and health verification endpoints.
 */

const { NODE_ENV } = require('../config/env');

/**
 * Health check endpoint handler
 * GET /api/health
 */
const getHealthStatus = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'TossArena API is running',
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
};

/**
 * Root development landing endpoint handler
 * GET /
 */
const getRootStatus = (req, res) => {
  res.status(200).json({
    success: true,
    service: 'TossArena API',
    version: '1.0.0',
    status: 'online',
    description: 'Virtual-credit cricket toss prediction platform API',
    documentation: '/api/health'
  });
};

module.exports = {
  getHealthStatus,
  getRootStatus
};
