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

// Session and Authentication configuration
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_insecure_session_secret_replace_in_production_32chars!';
const SESSION_NAME = process.env.SESSION_NAME || 'tossarena.sid';
const SESSION_MAX_AGE_MS = parseInt(process.env.SESSION_MAX_AGE_MS, 10) || 86400000; // 24 hours
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
const CSRF_SECRET = process.env.CSRF_SECRET || 'dev_insecure_csrf_secret_replace_in_production_32chars!';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || (NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');
const TRUST_PROXY = process.env.TRUST_PROXY === 'true' ? 1 : (parseInt(process.env.TRUST_PROXY, 10) || false);

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

// In production, enforce non-default session secret
if (NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.includes('dev_insecure'))) {
  console.warn('WARNING: Running in production with a default or insecure SESSION_SECRET!');
}

module.exports = {
  NODE_ENV,
  PORT,
  ALLOWED_ORIGINS,
  isProduction: NODE_ENV === 'production',
  isDevelopment: NODE_ENV === 'development',
  session: {
    secret: SESSION_SECRET,
    name: SESSION_NAME,
    maxAgeMs: SESSION_MAX_AGE_MS,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SECURE ? 'none' : 'lax'
  },
  security: {
    bcryptRounds: BCRYPT_ROUNDS,
    csrfSecret: CSRF_SECRET,
    trustProxy: TRUST_PROXY
  },
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

