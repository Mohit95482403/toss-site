# Backend SQL Directory (`backend/sql`)

## Responsibilities
- Houses raw SQL schema definitions, table DDLs, and development seed scripts.
- Enforces strict InnoDB, `utf8mb4`, snake_case naming, foreign key constraints, and UTC timezone policies.

## Files
- `schema.sql`: Complete DDL establishing the 7 foundational tables: `users`, `matches`, `wallets`, `predictions`, `wallet_transactions`, `notifications`, and `audit_logs`.
- `seed-dev.sql`: Safe development demo records with sample cricket fixtures explicitly marked as `[DEMO]`. Contains zero real matches, default admins, or passwords.
