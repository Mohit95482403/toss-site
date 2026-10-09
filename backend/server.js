/**
 * TossArena Backend Server
 * Main application entry point for the TossArena API.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { PORT, NODE_ENV, ALLOWED_ORIGINS, security } = require('./config/env');
const { closePool } = require('./config/db');
const { sessionMiddleware } = require('./config/session');
const apiRoutes = require('./routes/api.routes');
const healthController = require('./controllers/health.controller');
const notFoundHandler = require('./middleware/notFound.middleware');
const errorHandler = require('./middleware/error.middleware');

const app = express();

// Trust proxy configuration (only trusted hops, not arbitrary client headers)
if (security.trustProxy) {
  app.set('trust proxy', security.trustProxy);
}

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-CSRF-Token', 'X-XSRF-Token']
};
app.use(cors(corsOptions));

// 3. Body parsers & Cookie parser
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// 4. Server-Side MySQL Sessions
app.use(sessionMiddleware);

// 5. Root information endpoint
app.get('/', healthController.getRootStatus);

// 6. Mount API routes
app.use('/api', apiRoutes);


// 6. 404 Handler for undefined routes
app.use(notFoundHandler);

// 7. Centralized Error Handler
app.use(errorHandler);

// 8. Start HTTP Server (only when invoked directly, not when required by tests)
let server = null;

if (require.main === module) {
  server = app.listen(PORT, () => {
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
    if (server) {
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
    }

    // Force exit if close takes too long
    setTimeout(() => {
      console.error('Graceful shutdown timeout exceeded. Forcing shutdown.');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
}

module.exports = { app, server };

