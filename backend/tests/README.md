# Backend Tests Directory (`backend/tests`)

## Responsibilities
- Houses automated tests for routes, controllers, middleware, and services.
- Uses native Node.js test utilities to keep dependencies minimal.

## Day 1 Test
- `health.test.js`: Verifies that the API server boots, responds with HTTP 200 on `/api/health`, and returns HTTP 404 on unknown routes.
