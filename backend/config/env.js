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

// Database configuration
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT, 10) || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
const DB_NAME = process.env.DB_NAME || 'tossarena';
const DB_CONNECTION_LIMIT = parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10;
const DB_QUEUE_LIMIT = parseInt(process.env.DB_QUEUE_LIMIT, 10) || 0;
const DB_CONNECT_TIMEOUT = parseInt(process.env.DB_CONNECT_TIMEOUT, 10) || 10000;

/**
 * Validates essential database configuration without exposing secrets
 */
function validateDbConfig() {
  const missing = [];
  if (!DB_HOST) missing.push('DB_HOST');
  if (!DB_USER) missing.push('DB_USER');
  if (!DB_NAME) missing.push('DB_NAME');

  if (missing.length > 0) {
    throw new Error(`Missing required database configuration: ${missing.join(', ')}`);
  }
}

module.exports = {
  NODE_ENV,
  PORT,
  ALLOWED_ORIGINS,
  isProduction: NODE_ENV === 'production',
  isDevelopment: NODE_ENV === 'development',
  db: {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    name: DB_NAME,
    connectionLimit: DB_CONNECTION_LIMIT,
    queueLimit: DB_QUEUE_LIMIT,
    connectTimeout: DB_CONNECT_TIMEOUT
  },
  validateDbConfig
};
