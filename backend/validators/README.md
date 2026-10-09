# Backend Validators Directory (`backend/validators`)

## Responsibilities
- Validates request payloads (body, query, parameters) to ensure data sanitization and schema conformance before reaching controllers.
- Prevents invalid or malicious inputs from propagating to service and database layers.

## Planned Validators
- `auth.validator.js`: Email syntax, password length/complexity, and username constraints.
- `prediction.validator.js`: Valid prediction choices (heads/tails, team selection) and valid virtual credit amounts.
- `match.validator.js`: Admin match creation payload validation (dates, team names, venue).
