# Backend Middleware Directory (`backend/middleware`)

## Responsibilities
- Intercepts requests before reaching controllers to perform cross-cutting concerns (authentication, authorization, validation, logging, error handling).

## Current & Planned Middleware
- `notFound.middleware.js`: Intercepts unmapped URLs and returns structured 404 JSON responses.
- `error.middleware.js`: Centralized error handler returning consistent error schemas and preventing sensitive stack leakage.
- `auth.middleware.js`: *(Planned Day 3)* Validates active user sessions for protected endpoints.
- `role.middleware.js`: *(Planned Future Phase)* Restricts admin routes to users with `admin` role.
