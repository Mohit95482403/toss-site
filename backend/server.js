/**
 * TossArena Backend Server
 * Main application entry point for the TossArena API.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { PORT, NODE_ENV, ALLOWED_ORIGINS } = require('./config/env');
const { closePool } = require('./config/db');
const apiRoutes = require('./routes/api.routes');
const healthController = require('./controllers/health.controller');
const notFoundHandler = require('./middleware/notFound.middleware');
const errorHandler = require('./middleware/error.middleware');

const app = express();

// 1. Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled for flexible API responses, can be tightened per frontend needs
    crossOriginEmbedderPolicy: false
  })
);

// 2. Conservative CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (such as mobile apps, curl, or Postman)
    if (!origin) {
      return callback(null, true);
    }

    const isAllowed = ALLOWED_ORIGINS.some((allowedOrigin) => {
      return origin === allowedOrigin || origin.startsWith(allowedOrigin);
    });

    if (isAllowed || NODE_ENV === 'development') {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} is not allowed by TossArena CORS policy.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};
app.use(cors(corsOptions));

// 3. Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 4. Root information endpoint
app.get('/', healthController.getRootStatus);

// 5. Mount API routes
app.use('/api', apiRoutes);

// 6. 404 Handler for undefined routes
app.use(notFoundHandler);

// 7. Centralized Error Handler
app.use(errorHandler);

// 8. Start HTTP Server
const server = app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(` TossArena API Server`);
  console.log(` Environment : ${NODE_ENV}`);
  console.log(` Port        : ${PORT}`);
  console.log(` Health Check: http://localhost:${PORT}/api/health`);
  console.log(` DB Health   : http://localhost:${PORT}/api/health/db`);
  console.log(`=========================================`);
});

// 9. Graceful Shutdown Handlers
const handleGracefulShutdown = (signal) => {
  console.log(`\nReceived ${signal}. Shutting down TossArena API gracefully...`);
  server.close(async () => {
    console.log('HTTP server closed successfully.');
    try {
      await closePool();
      console.log('Database pool closed successfully.');
    } catch (dbErr) {
      console.error('Error closing database pool:', dbErr.message);
    }
    process.exit(0);
  });

  // Force exit if close takes too long
  setTimeout(() => {
    console.error('Graceful shutdown timeout exceeded. Forcing shutdown.');
    process.exit(1);
  }, 5000);
};

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

module.exports = { app, server };
