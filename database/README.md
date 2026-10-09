# TossArena — Database Architecture & Setup Guide

**Status:** Day 2 Completed (Foundational Schema & Connection Pool Active)  
**Database Engine:** MySQL 8.0+ / MariaDB 10.4+  
**Connection Driver:** `mysql2/promise` with Connection Pooling  
**Character Set & Collation:** `utf8mb4` / `utf8mb4_unicode_ci`  
**Timezone Policy:** All timestamps stored in UTC (`timezone: 'Z'`)

---

## 1. Prerequisites

Before setting up the TossArena database, ensure you have:
- **Node.js:** v18.0.0+ (Tested on v24.18.0 LTS)
- **npm:** v9.0.0+ (Tested on 11.16.0)
- **MySQL / MariaDB:** MySQL 8.0+ or MariaDB 10.4+ (e.g. standalone MySQL Server or XAMPP on port 3306)
- **MySQL Client:** `mysql` CLI or phpMyAdmin

---

## 2. Implemented Schema Architecture (`backend/sql/schema.sql`)

The database consists of 7 normalized, foundational tables using the **InnoDB** storage engine:

| Table Name | Primary Purpose | Key Constraints & Policies |
| :--- | :--- | :--- |
| **`users`** | Participant and administrator accounts | Unique `email`, role enum (`user`, `admin`), password hashes (never plaintext) |
| **`matches`** | Cricket fixtures, toss times & results | UTC dates, status lifecycle, `created_by` FK to `users.id` |
| **`wallets`** | User virtual demo-credit balance | Unique `user_id` FK (1:1), `balance >= 0` check constraint, defaults to 1,000 demo credits |
| **`predictions`** | User predictions on upcoming coin toss | Unique `(user_id, match_id)` prevents duplicate conflicting predictions per fixture |
| **`wallet_transactions`**| Double-entry auditable credit ledger | Positive amount constraint, balance before/after audit trail, immutable historical log |
| **`notifications`** | In-app user notifications | Composite lookup index `(user_id, is_read, created_at)` |
| **`audit_logs`** | Administrative & security event audit | Sanitized JSON metadata; credentials strictly excluded; actor FK |

---

## 3. Virtual-Credit Precision Policy

- **Unit Type:** Demo Credits only (`DECIMAL(12, 2)`).
- **Default Balance:** All new user accounts are initialized with **1,000.00 complimentary demo credits**.
- **Integrity Rule:** Floating-point data types (`FLOAT`, `DOUBLE`) are strictly forbidden. All monetary math uses fixed-precision `DECIMAL(12, 2)`.
- **Negative Balance Prevention:** Enforced at database level via `CHECK (balance >= 0)` constraint and validated at application layer.
- **Strict Demonstration Scope:** Demo credits have zero monetary value, cannot be deposited via real payment methods, and cannot be redeemed or cashed out.

---

## 4. Database Setup & Execution Instructions

### Step 1: Configure Environment Variables
Ensure `backend/.env` contains your local MySQL credentials:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=tossarena

DB_CONNECTION_LIMIT=10
DB_QUEUE_LIMIT=0
DB_CONNECT_TIMEOUT=10000
```

### Step 2: Create Database & Execute Schema
Run the schema script against your MySQL server:
```bash
# Using MySQL CLI directly:
mysql -u root -p < backend/sql/schema.sql

# Or on Windows using XAMPP MySQL CLI:
cmd /c "C:\xampp\mysql\bin\mysql.exe -u root < backend\sql\schema.sql"
```

### Step 3: (Optional) Apply Safe Development Seed Data
To populate demo matches for testing:
```bash
cmd /c "C:\xampp\mysql\bin\mysql.exe -u root < backend\sql\seed-dev.sql"
```

### Step 4: Run Database Connectivity Test
```bash
cd backend
npm run test:db
```
Expected output:
```
Testing TossArena MySQL database connectivity...
✔ Database connection successful!
  Database : tossarena
  Host     : localhost
  Status   : Connected and accepting queries
```

### Step 5: Verify Live DB Health Endpoint
With the backend server running (`npm run dev`), test:
```bash
curl http://localhost:5000/api/health/db
```
Response:
```json
{
  "success": true,
  "database": "connected",
  "name": "tossarena",
  "timestamp": "2026-10-09T07:51:03.024Z"
}
```

---

## 5. Troubleshooting Guide

### 1. `ECONNREFUSED` (Connection Refused on port 3306)
- **Cause:** The MySQL server process is not running, or it is listening on a different port.
- **Fix:** Start MySQL via XAMPP Control Panel or Windows Services (`net start MySQL`). Verify port 3306 is open via `Test-NetConnection 127.0.0.1 -Port 3306`.

### 2. `ER_ACCESS_DENIED_ERROR`
- **Cause:** Incorrect `DB_USER` or `DB_PASSWORD` in `backend/.env`.
- **Fix:** Verify user credentials in MySQL:
  ```sql
  ALTER USER 'root'@'localhost' IDENTIFIED BY 'new_password';
  FLUSH PRIVILEGES;
  ```
  Update `DB_PASSWORD` in `backend/.env` accordingly.

### 3. `ER_BAD_DB_ERROR` (Unknown database 'tossarena')
- **Cause:** The database was not created before connection.
- **Fix:** Execute `CREATE DATABASE tossarena CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;` or rerun `backend/sql/schema.sql`.

### 4. Foreign Key Constraint Errors (`ER_NO_REFERENCED_ROW_2`)
- **Cause:** Attempting to insert dependent records (e.g., `predictions`, `wallets`) before the parent entity (`users`, `matches`) exists.
- **Fix:** Follow insert order: `users` -> `wallets`, `matches` -> `predictions`. Never disable `FOREIGN_KEY_CHECKS` in production.

### 5. Character Set & Emoji Issues
- **Cause:** Client connection using `latin1` or `utf8` (3-byte) instead of full 4-byte UTF-8.
- **Fix:** The connection pool in `backend/config/db.js` explicitly enforces `charset: 'utf8mb4'`.
