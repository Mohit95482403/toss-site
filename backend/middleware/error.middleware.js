/**
 * Centralized Error-Handling Middleware
 * Catches unhandled errors and returns consistent, safe JSON responses.
 */

const { isProduction } = require('../config/env');

// Centralized Express error handler (must have 4 arguments)
const errorHandler = (err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  
  // Log server-side for diagnostics without leaking to client
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message || err);

  const response = {
    success: false,
    message: err.message || 'An unexpected internal server error occurred'
  };

  if (err.code) {
    response.code = err.code;
  }

  // Only attach sanitized error details in development if explicitly desired, never in production
  if (!isProduction && err.details) {
    response.details = err.details;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
