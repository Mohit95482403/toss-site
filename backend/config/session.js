/**
 * TossArena Session Configuration
 * Configures express-session backed by MySQL using express-mysql-session.
 * Reuses the existing MySQL connection pool to avoid redundant connections.
 */

const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { pool } = require('./db');
const { session: sessionConfig, isProduction } = require('./env');

// Configure MySQL session store options
const storeOptions = {
  clearExpired: true,
  checkExpirationInterval: 900000, // 15 minutes
  expiration: sessionConfig.maxAgeMs,
  createDatabaseTable: true,
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  }
};

// Instantiate the MySQL session store using the existing connection pool
const sessionStore = new MySQLStore(storeOptions, pool);

sessionStore.onReady().then(() => {
  // Store initialized successfully
}).catch((err) => {
  console.error('Failed to initialize MySQL session store:', err.message);
});

// Create the express-session middleware
const sessionMiddleware = session({
  name: sessionConfig.name,
  secret: sessionConfig.secret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset cookie maxAge on every response
  proxy: isProduction, // Trust the reverse proxy in production
  cookie: {
    httpOnly: true,
    secure: sessionConfig.secure,
    sameSite: sessionConfig.sameSite,
    maxAge: sessionConfig.maxAgeMs,
    path: '/'
  }
});

module.exports = {
  sessionMiddleware,
  sessionStore
};
