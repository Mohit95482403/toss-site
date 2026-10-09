/**
 * Not Found Middleware
 * Intercepts requests that do not match any defined route.
 */

const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl} - Route not found`
  });
};

module.exports = notFoundHandler;
