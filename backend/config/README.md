# Backend Configuration Directory (`backend/config`)

## Responsibilities
- Centralizes application and environment configuration.
- Validates environment variables loaded from `.env` without exposing secrets in logs.
- Exports validated constants for ports, database connectivity, sessions, and security headers.

## Files
- `env.js`: Environment variable validation and CORS origin whitelist resolver.
- `db.js`: Single shared MySQL connection pool configured with `mysql2/promise`, connection/queue limits, and ping test utilities.
