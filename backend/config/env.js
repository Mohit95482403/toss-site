/**
 * TossArena Server Configuration
 * Loads environment variables and provides validated configurations with safe defaults.
 */

const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file if available
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = parseInt(process.env.PORT, 10) || 5000;

// Parse allowed frontend origins for CORS
const rawFrontendUrls = process.env.FRONTEND_URL || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000';
const ALLOWED_ORIGINS = rawFrontendUrls
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

module.exports = {
  NODE_ENV,
  PORT,
  ALLOWED_ORIGINS,
  isProduction: NODE_ENV === 'production',
  isDevelopment: NODE_ENV === 'development'
};
