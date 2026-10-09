/**
 * TossArena Authentication Rate Limiting
 * Protects against brute-force attacks and credential stuffing.
 */

const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for user login attempts
 * 10 requests per 15 minutes per IP address
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login attempts per window
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: {
    success: false,
    message: 'Too many login attempts from this IP address. Please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

/**
 * Rate limiter for user registration attempts
 * 10 registrations per 1 hour per IP address
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many accounts created from this IP address. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

module.exports = {
  loginLimiter,
  registerLimiter
};
