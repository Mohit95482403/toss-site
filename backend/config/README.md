# Backend Configuration Directory (`backend/config`)

## Responsibilities
- Centralizes application and environment configuration.
- Validates environment variables loaded from `.env`.
- Exports validated constants for ports, database connectivity (Day 2), sessions, and external services.

## Files
- `env.js`: Environment variable parsing and CORS origin handling.
- `database.js`: *(Planned Day 2)* MySQL connection pool setup using `mysql2/promise`.
