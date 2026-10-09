/**
 * Health Controller
 * Provides non-sensitive system status and health verification endpoints.
 */

const { NODE_ENV } = require('../config/env');
const { testConnection } = require('../config/db');

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
 * Database health check endpoint handler
 * GET /api/health/db
 */
const getDbHealthStatus = async (req, res) => {
  try {
    const result = await testConnection();
    return res.status(200).json({
      success: true,
      database: 'connected',
      name: result.database,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Log server-side diagnostic without exposing credentials or internal details
    console.error('[Database Health Check Diagnostic]:', error.message || error);
    return res.status(503).json({
      success: false,
      database: 'unavailable',
      message: 'Database connection is unavailable',
      timestamp: new Date().toISOString()
    });
  }
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
  getDbHealthStatus,
  getRootStatus
};
