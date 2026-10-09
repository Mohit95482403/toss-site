# Backend Services Directory (`backend/services`)

## Responsibilities
- Houses business logic, transactional operations, and domain rules.
- Interacts with database abstraction layers (repositories / SQL queries).
- Completely decoupled from HTTP request/response objects to enable testability.

## Planned Services
- `auth.service.js`: User registration, bcrypt password hashing, and authentication verification.
- `match.service.js`: Match scheduling, team metadata, and toss status tracking.
- `prediction.service.js`: Validating virtual credit balances, recording predictions prior to toss lock time, and odds calculation.
- `wallet.service.js`: Virtual demo balance management, simulated credit top-ups, and ledger auditing.
- `settlement.service.js`: Automated virtual credit distribution when official toss results are recorded by administrators.
