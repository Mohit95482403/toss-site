# Backend Routes Directory (`backend/routes`)

## Responsibilities
- Maps incoming HTTP endpoint paths and HTTP verbs (GET, POST, PUT, DELETE) to appropriate controller methods.
- Attaches route-specific authentication, role authorization, and validation middleware.
- Does not contain business logic or direct database queries.

## Files
- `api.routes.js`: Root API router that mounts domain-specific route groups.
- `auth.routes.js`: *(Planned Day 3)* User registration, login, logout, and session check endpoints.
- `match.routes.js`: *(Planned Future Phase)* Cricket match listing and detail endpoints.
- `prediction.routes.js`: *(Planned Future Phase)* Virtual-credit toss prediction placement and history.
- `wallet.routes.js`: *(Planned Future Phase)* Virtual credit balance, demo refill, and simulated transaction logs.
- `admin.routes.js`: *(Planned Future Phase)* Match management and toss settlement endpoints.
