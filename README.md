# TossArena — Cricket Toss Prediction Platform (Demo Credits Only)

[![Node.js Version](https://img.shields.io/badge/Node.js-v24.18.0-339933?logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21.2-000000?logo=express)](https://expressjs.com/)
[![Architecture](https://img.shields.io/badge/Architecture-REST%20%2B%20Vanilla%20Web-blue)](docs/PROJECT_ARCHITECTURE.md)
[![Compliance](https://img.shields.io/badge/Scope-100%25%20Virtual%20Demo%20Credits-10b981)]()

---

## 1. Project Overview

**TossArena** is a full-stack cricket coin-toss forecasting web application. The platform provides a sleek, sports-inspired user interface where cricket fans can study pitch conditions, analyze team captain strategies, and place predictions on upcoming match coin tosses using **exclusively virtual demo credits**.

> ⚠️ **MANDATORY SCOPE NOTICE & COMPLIANCE:**  
> TossArena is **strictly a demonstration and entertainment platform**. All credits, wallet balances, deposits, and payouts are 100% simulated virtual tokens. The platform does **not** support real-money wagering, actual payment gateways, cash deposits, or conversion of demo credits into real-world monetary value.

---

## 2. Project Objectives

- **Premium Public Website:** Sports-themed dark navy interface with emerald/gold accents and smooth micro-interactions.
- **User Authentication:** Registration and session-based authentication with demo credit allotment upon onboarding.
- **Cricket Match Exploration:** Browse upcoming international and league fixtures with toss countdown timers.
- **Virtual Coin Toss Predictions:** Dual prediction market covering both Toss Winner and Toss Decision (Bat / Bowl).
- **Virtual Credit Wallet:** Simulated wallet balance, demo credit top-ups, and an immutable audit-trail transaction ledger.
- **Admin Management Portal:** Fixture scheduling, toss cutoff enforcement, official coin toss result declaration, and automated balance settlement.
- **Responsive Architecture:** Seamless layouts optimized for mobile, tablet, and desktop screens.

---

## 3. Technology Stack

- **Frontend:** HTML5, Vanilla CSS3 (Custom Properties & Design Tokens), Vanilla JavaScript (ES6+ modular code).
- **Backend:** Node.js (v24.18.0 LTS), Express.js.
- **Security:** Helmet HTTP security headers, conservative CORS origin filtering.
- **Configuration:** Dotenv environment management.
- **Database (Planned Day 2):** MySQL 8.0+ with `mysql2` connection pooling.
- **Testing:** Native Node.js test runner (`backend/tests/health.test.js`).

---

## 4. Current Implementation Status (Day 1)

Day 1 establishes the production-grade foundation for the entire 20-day roadmap:
- [x] Initialized Git repository and root `.gitignore` protecting secrets.
- [x] Full architectural folder structure established with clear separation of frontend and backend.
- [x] Node.js Express API server with Helmet, CORS, JSON parsing, and graceful shutdown.
- [x] Health check endpoint (`GET /api/health`) and structured 404 handler.
- [x] Shared frontend CSS design system (`variables.css`, `style.css`, `responsive.css`).
- [x] Development landing page (`frontend/index.html`) featuring live backend API status ping.
- [x] Centralized frontend configuration bridge (`frontend/assets/js/config.js`).
- [x] Complete technical architecture documentation in `docs/PROJECT_ARCHITECTURE.md`.
- [x] Automated test suite verifying health endpoints passing 100%.
- [x] **Day 2 MySQL Foundation:** Created 7 foundational tables in `backend/sql/schema.sql` (InnoDB, utf8mb4, UTC policy).
- [x] **Day 2 Connection Pool:** Implemented single shared pool via `mysql2/promise` in `backend/config/db.js`.
- [x] **Day 2 Database Test Script:** Created `backend/scripts/test-db.js` (`npm run test:db`).
- [x] **Day 2 Readiness Endpoint:** Implemented `GET /api/health/db` reporting live MySQL status without leaking secrets.
- [x] **Day 2 Demo Seed Script:** Created `backend/sql/seed-dev.sql` with safe idempotent fixtures.
- [x] **Day 3 Premium Homepage (`frontend/index.html`):** Hero with atmospheric lighting, 4 experience highlights, featured matches dynamic feed, 3-step how-it-works, 6-feature grid, responsible demo policy, and dynamic footer.
- [x] **Day 3 Match Explorer (`frontend/pages/matches.html`):** Debounced keyword search, status filter chips, responsive cards, loading skeletons, and graceful empty/error states via `matches.js`.
- [x] **Day 3 Rules & FAQ (`frontend/pages/how-to-play.html`):** 4-step explanation guide and accessible interactive FAQ accordion.
- [x] **Day 3 Responsive Navigation & Drawer:** Slide-in drawer with backdrop, Escape-key closing, link auto-closing, and support for viewports from 360px to 1920px.
- [x] **Day 4 User Registration (`POST /api/auth/register`):** Full name, email normalization, bcrypt password hashing (12 rounds), password length policy (>=12 chars), duplicate email defense, and automatic 1,000 virtual demo credits onboarding grant.
- [x] **Day 4 User Login (`POST /api/auth/login`):** Parameterized queries, timing-safe verification, account status checks (`active`, `suspended`, `banned`), session ID regeneration against fixation attacks, and `last_login_at` timestamp tracking.
- [x] **Day 4 MySQL Session Persistence:** Server-side sessions via `express-mysql-session` sharing the connection pool, stored in non-destructive `sessions` table.
- [x] **Day 4 Session Destruction & Logout (`POST /api/auth/logout`):** Destroys server-side session in MySQL and clears HTTP-Only cookie.
- [x] **Day 4 Current User Endpoint (`GET /api/auth/me`):** Authenticated user profile and demo credit balance.
- [x] **Day 4 CSRF & Origin Security:** Session-bound cryptographic CSRF protection (`GET /api/auth/csrf`), timing-safe verification on state-changing requests, and strict origin validation.
- [x] **Day 4 Rate Limiting:** Brute-force and spam protection on `/api/auth/login` (10/15min) and `/api/auth/register` (10/1hr).
- [x] **Day 4 Role-Based Access Control (RBAC):** Server-authoritative `authenticate` and `authorize('admin')` middleware; public registration cannot grant admin roles.
- [x] **Day 4 Automated Test Suite (`npm run test:auth`):** 23 automated tests verifying all security rules, edge cases, RBAC, and regressions with 100% pass rate.
- [x] **Day 5 User Dashboard Layout (`frontend/user/dashboard.html`):** Premium sports-tech dashboard with sticky collapsible sidebar, top navigation bar, welcome hero banner, dynamic greeting, and accessible mobile drawer.
- [x] **Day 5 Account Summary Cards:** 4 real database-backed summary cards displaying verified Account Status, Predictions Made count, Completed Predictions count, and Demo Credit Balance (`1,000.00 Credits` virtual credits, no fake currency).
- [x] **Day 5 Live Activity Stream (`GET /api/dashboard/activity`):** Real database activity timeline integrating virtual credit grants, prediction stakes, and notifications with localized date/time formatting.
- [x] **Day 7 Toss Prediction Engine:** Strict match eligibility validation (only `open` matches, rejecting `locked`, `completed`, or `cancelled` fixtures), server-authoritative UTC cutoff enforcement, canonical team validation, duplicate prediction defense, atomic persistence, and user history (`GET /api/predictions/me`).
- [x] **Day 8 Virtual Demo Wallet (`GET /api/wallet/me`):** Authoritative demo credit balance retrieval derived strictly from session user identity, idempotent wallet provisioning with 1,000 initial virtual credits, and `chk_wallets_balance_non_negative` check constraint enforcement.
- [x] **Day 8 Immutable Transaction Ledger (`GET /api/wallet/transactions`):** Complete double-entry audit trail recording every balance modification with `balance_before`, `balance_after`, `amount`, `transaction_type`, `reference_type`, and `reference_id`. Supports bounded server-side pagination (max 50), type filtering allowlist, and date ordering.
- [x] **Day 8 Atomic Balance Engine (`backend/services/walletService.js`):** Row-level locking (`SELECT ... FOR UPDATE`), atomic balance operations, negative-balance rejection (`INSUFFICIENT_DEMO_CREDITS`), duplicate reference detection, and automated database rollback lifecycle.
- [x] **Day 8 User Dashboard & Dedicated Wallet UI (`frontend/user/wallet.html` & `frontend/user/dashboard.html`):** Dynamic balance cards, transaction ledger table with responsive overflow, type filtering, pagination controls, friendly empty states, error retry handling, and virtual credit disclaimers.
- [x] **Day 8 Prediction Integration Audit (Scenario A):** Maintained existing Day 7 prediction behavior (`demo_credits_used = 0.00`) without inventing arbitrary stakes, with the wallet engine ready for future approved stake policies.
- [x] **Day 8 Automated Test Suites (`npm run test:wallet` & `npm run test:e2e:wallet`):** 21 unit/integration tests and 19 live E2E server tests with 100% pass rate (104 total tests passing across all suites).
- [x] **Day 9 Virtual Demo Credit Addition & Wallet Funding Simulation:**
  - **Server-Authoritative Package Catalog:** Starter (500), Standard (1,000), Advanced (2,500), and Premium (5,000) virtual demo credits configured strictly on backend; client cannot inject custom amounts.
  - **One-Time Grant Policy (Section 6 Option B):** Database-enforced uniqueness via `wallet_package_claims` table with `uq_claims_user_id` constraint, strictly preventing duplicate allocations across sessions and devices.
  - **Atomic Balance & Ledger Persistence:** Row-level locking (`SELECT ... FOR UPDATE`), single transactional commit updating wallet balance, writing immutable `demo_grant` entry with `reference_type = 'package_claim'`, logging in-app notification, and registering the claim.
  - **Idempotency Protection:** Enforced by unique constraint `uq_claims_idempotency`; safe retries replay previous grant metadata (`isReplay: true`) with HTTP 200 without double crediting; cross-user key reuse is rejected with HTTP 409 Conflict.
  - **CSRF & Authentication Security:** Session-based identity validation, account status checks (`active` only), and strict CSRF token verification on state-changing endpoints.
  - **UI Integration:** Dynamic package selection grid, confirmation modal with real-time balance calculations, one-time claim badge, and "Already Claimed" view on both `frontend/user/wallet.html` and `frontend/user/dashboard.html`.
  - **Automated Test Coverage:** 16 comprehensive unit/integration tests (`npm run test:funding`) and 10 live E2E integration tests (`npm run test:e2e:funding`), bringing total test suite to 120/120 passing (100% pass rate).

---

## 5. Project Folder Structure

```
TossArena/
│
├── frontend/                     # Client presentation tier
│   ├── index.html                # Development landing page with live status bridge
│   │
│   ├── pages/                    # Public content & authentication pages
│   │   ├── login.html            # User login stub (Planned Day 3)
│   │   ├── register.html         # User registration stub (Planned Day 3)
│   │   ├── matches.html          # Cricket match fixtures stub (Planned Day 4)
│   │   └── how-to-play.html      # Rules and how-to-play guide
│   │
│   ├── user/                     # Authenticated user zone
│   │   └── dashboard.html        # User wallet & prediction dashboard stub (Planned Day 7)
│   │
│   ├── admin/                    # Administrative management zone
│   │   └── login.html            # Admin login portal stub (Planned Day 12)
│   │
│   ├── assets/                   # Static resources
│   │   ├── css/
│   │   │   ├── variables.css     # CSS Custom Properties & Design Tokens
│   │   │   ├── style.css         # Main stylesheet & utility classes
│   │   │   └── responsive.css    # Media queries & responsive breakpoints
│   │   ├── js/
│   │   │   ├── config.js         # API base URL & client constants
│   │   │   └── main.js           # Navigation & live API health ping logic
│   │   ├── images/               # Image assets directory
│   │   └── icons/                # Icon assets directory
│   │
│   └── components/               # Reusable UI component modules
│
├── backend/                      # Node.js API application tier
│   ├── package.json              # Backend dependencies and scripts
│   ├── server.js                 # Express server entry point & shutdown handlers
│   ├── .env.example              # Environment variables template
│   ├── .gitignore                # Backend-specific ignore rules
│   │
│   ├── config/                   # Configuration loaders (env.js)
│   ├── routes/                   # API endpoint routers (api.routes.js)
│   ├── controllers/              # Controller handlers (health.controller.js)
│   ├── services/                 # Domain logic & business rules
│   ├── middleware/               # 404 handler & centralized error handler
│   ├── validators/               # Input validation schemas
│   ├── utils/                    # Helper utilities
│   ├── sql/                      # SQL schema DDL and seed scripts
│   └── tests/                    # Automated verification tests (health.test.js)
│
├── database/                     # Database architecture & data dictionary
│   └── README.md
│
├── docs/                         # Technical documentation
│   └── PROJECT_ARCHITECTURE.md
│
├── .gitignore                    # Root repository ignore rules
└── README.md                     # Root project documentation
```

---

## 6. Prerequisites

Ensure you have the following installed on your machine:
- **Node.js:** v18.0.0 or higher (v24.18.0 LTS recommended).
- **npm:** v9.0.0 or higher.
- Modern Web Browser: Chrome, Firefox, Edge, or Safari.

---

## 7. Installation & Quick Start

### Step 1: Clone or Navigate to the Workspace
```bash
cd TossArena
```

### Step 2: Install Backend Dependencies
```bash
cd backend
npm install
```

### Step 3: Configure Environment Variables
Copy `.env.example` to create your local `.env`:
```bash
# On Windows PowerShell:
Copy-Item .env.example .env

# On Linux/macOS:
cp .env.example .env
```
*(The default `.env` is pre-configured for local development on port 5000).*

---

## 8. Backend Startup Instructions

### Development Mode (with automatic file watch):
```bash
cd backend
npm run dev
```

### Production Mode:
```bash
cd backend
npm start
```

Upon startup, the console displays:
```
=========================================
 TossArena API Server
 Environment : development
 Port        : 5000
 Health Check: http://localhost:5000/api/health
=========================================
```

---

## 9. Frontend Startup Instructions

Because TossArena utilizes pure HTML5, CSS3, and Vanilla JavaScript, no build step or bundler is required.

### Option A: Using Any Local Static HTTP Server (Recommended)
You can serve the `frontend/` folder using Python or `npx serve`:
```bash
# Using Python 3:
cd frontend
python -m http.server 5500

# OR using npx serve:
npx -y serve frontend -p 5500
```
Then navigate to: `http://localhost:5500`

### Option B: Direct File Inspection
Open `frontend/index.html` directly in your browser. The page will load and attempt to connect to the backend running at `http://localhost:5000/api/health`.

---

## 10. API Health-Check Verification

### Running Automated Test Suite:
```bash
cd backend
npm test
```

### Running Database Connectivity Test:
```bash
cd backend
npm run test:db
```

### Manual Verification via Curl or Browser:
Execute a GET request to the API health endpoint:
```bash
curl http://localhost:5000/api/health
```

Expected HTTP 200 response:
```json
{
  "success": true,
  "message": "TossArena API is running",
  "environment": "development",
  "timestamp": "2026-10-09T07:35:00.000Z"
}
```

Execute a GET request to the Database health endpoint:
```bash
curl http://localhost:5000/api/health/db
```

Expected HTTP 200 response:
```json
{
  "success": true,
  "database": "connected",
  "name": "tossarena",
  "timestamp": "2026-10-09T07:51:03.024Z"
}
```

Verify 404 handling on unknown endpoints:
```bash
curl http://localhost:5000/api/not-a-real-route
```
Expected HTTP 404 response:
```json
{
  "success": false,
  "message": "Cannot GET /api/not-a-real-route - Route not found"
}
```

---

## 11. Day 6: Match Discovery, Search, Filters, Pagination & Details API

The platform provides public, secure, read-only cricket match discovery endpoints powered by MySQL.

### 11.1 List Matches
**`GET /api/matches`**

Supports optional query parameters:
- `search` (string): Keyword search across `team_a`, `team_b`, `tournament_name`, and `title`. Special SQL characters (`%`, `_`) are safely escaped.
- `status` (string): Filter by valid match statuses (`open`, `upcoming`, `locked`, `completed`, `cancelled`).
- `tournament` (string): Filter by tournament name.
- `sort` (string): Allowlisted sort order (`date_asc`, `date_desc`, `teams_asc`, `teams_desc`, `status`). Defaults to `date_asc`.
- `page` (number): 1-indexed page number (default `1`).
- `limit` (number): Number of records per page (default `12`, capped at max `50`).

Example request:
```bash
curl "http://localhost:5000/api/matches?search=India&status=upcoming&page=1&limit=12&sort=date_asc"
```

Example response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "[DEMO] India vs Australia - Champions Trophy Simulation",
      "team_a": "India",
      "team_b": "Australia",
      "tournament_name": "Demo International Series",
      "venue": "Melbourne Cricket Ground",
      "scheduled_at": "2026-10-15T14:00:00.000Z",
      "status": "upcoming",
      "result_toss_winner": null,
      "result_decision": null,
      "created_at": "2026-10-09T07:51:00.000Z",
      "updated_at": "2026-10-09T07:51:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 12,
    "total": 1,
    "totalPages": 1
  }
}
```

### 11.2 Get Tournaments
**`GET /api/matches/tournaments`**

Returns a distinct list of tournament names from scheduled database records.

Example response:
```json
{
  "success": true,
  "data": [
    "Demo International Series",
    "T20 Global League Demo"
  ]
}
```

### 11.3 Match Details
**`GET /api/matches/:id`**

Retrieves a single fixture by database ID. Validates ID strictly as a positive integer. Rejects malformed IDs with 400 Bad Request and missing fixtures with 404 Not Found.

Example request:
```bash
curl http://localhost:5000/api/matches/1
```

Example response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "[DEMO] India vs Australia - Champions Trophy Simulation",
    "team_a": "India",
    "team_b": "Australia",
    "tournament_name": "Demo International Series",
    "venue": "Melbourne Cricket Ground",
    "scheduled_at": "2026-10-15T14:00:00.000Z",
    "status": "upcoming",
    "result_toss_winner": null,
    "result_decision": null,
    "created_at": "2026-10-09T07:51:00.000Z",
    "updated_at": "2026-10-09T07:51:00.000Z"
  }
}
```

### 11.4 Empty Database State Handling
When the database contains 0 fixtures matching a query:
- Returns HTTP 200 with `"data": []` and `"pagination": { "page": 1, "limit": 12, "total": 0, "totalPages": 0 }`.
- Frontend displays an informative empty state ("No Matches Found. Try changing your search or filters.") with a "Clear Filters" action. No simulated or fake placeholder matches are generated.

### 11.5 Running Match Automated Tests
```bash
# Run match suite
npm run test:matches

# Run all test suites
npm test
```

---

## 12. Day 7: Toss Prediction Engine, Submission & Match Locking

Authenticated users can forecast coin toss winners for eligible scheduled fixtures using virtual demo credits exclusively.

### 12.1 Submit Toss Prediction
**`POST /api/predictions`**

* **Authentication:** Required (`authenticate` session cookie).
* **CSRF Protection:** Required (`X-CSRF-Token` header).
* **Payload:**
  ```json
  {
    "matchId": 1,
    "predictedTeam": "India"
  }
  ```
* **Validation & Business Rules:**
  - `matchId` validated as positive integer; rejects malformed with 400.
  - `predictedTeam` validated to match either `team_a` or `team_b` for the fixture; rejects invalid with 422.
  - Match status must be `open`; rejects `locked`, `completed`, `cancelled` fixtures with 409, and `upcoming` fixtures with 422.
  - Server-authoritative cutoff time check: rejects if scheduled time has passed with 409.
  - One prediction per user per match enforced both at service layer and via MySQL unique constraint `(user_id, match_id)`.
  - Rejects duplicate submission with 409 Conflict.
  - Ownership derived strictly from server session; client cannot spoof `userId`.
* **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Your toss prediction has been submitted successfully.",
    "data": {
      "id": 1,
      "matchId": 1,
      "matchTitle": "[DEMO] India vs Australia - Champions Trophy Simulation",
      "predictedTeam": "India",
      "status": "pending",
      "createdAt": "2026-10-09T09:40:00.000Z"
    }
  }
  ```

### 12.2 Retrieve User Prediction History
**`GET /api/predictions/me`**

* **Authentication:** Required.
* **Query Parameters:** `page` (default 1), `limit` (default 20, max 50).
* **Behavior:** Returns the authenticated user's prediction history joined with match scheduling, venue, and status details. Complete isolation between users.

### 12.3 Check User Prediction for Specific Match
**`GET /api/predictions/me/match/:matchId`**

* **Authentication:** Required.
* **Response:**
  ```json
  {
    "success": true,
    "hasPredicted": true,
    "data": {
      "id": 1,
      "matchId": 1,
      "predictedTeam": "India",
      "status": "pending",
      "createdAt": "2026-10-09T09:40:00.000Z"
    }
  }
  ```

### 12.4 Running Prediction Automated Tests
```bash
# Run prediction suite
npm run test:predictions

# Run end-to-end integration test
node tests/e2e-predictions.test.js
```

---

## 13. Git Usage Basics

```bash
# Inspect repository state
git status

# Stage files
git add .

# Create a commit
git commit -m "feat: complete day 7 toss prediction engine, submission, and validation"
```

*Note: `.env` and `node_modules` are automatically ignored to protect secrets and avoid committing build artifacts.*

---

---

## 13. Day 9: Virtual Demo Credit Addition & Wallet Funding Simulation

### 13.1 Strict Virtual Demo Credit Guardrail
TossArena is exclusively a cricket coin-toss forecasting simulation platform. All wallet balances, ledger entries, and credit additions operate 100% on virtual demo tokens.
- **Strictly No Real Money:** No fiat currency, credit/debit card processing, UPI, net banking, or payment gateways (Razorpay, Stripe, etc.).
- **Strictly Non-Redeemable:** Demo credits hold zero monetary value and cannot be withdrawn, transferred to third parties, or exchanged for cash.
- **Mandatory User Notice:** Prominently rendered across wallet interfaces:  
  *"Demo credits are for platform testing and entertainment only. They have no monetary value and cannot be withdrawn, transferred, or exchanged for cash."*

### 13.2 Server-Authoritative Package Catalog
Credit amounts are defined strictly on the server in `backend/services/walletService.js`. The client submits only a `packageId`:
| Package ID | Display Name | Virtual Demo Credits | Purpose |
| :--- | :--- | :---: | :--- |
| `starter` | Starter Package | **500** | Casual testing and match previews |
| `standard` | Standard Package | **1,000** | Standard match toss forecasting |
| `advanced` | Advanced Package | **2,500** | Seasoned cricket forecasting |
| `premium` | Premium Package | **5,000** | High-volume simulated participation |

*Any client attempt to inject custom amounts (`demoCredits`, `amount`, `balance`) is rejected with HTTP 400 (`CLIENT_AMOUNT_REJECTED`).*

### 13.3 One-Time Initial Claim Policy & Concurrency Defense
Per Section 6 Option B of the project specifications, demo credit packages are implemented as a **one-time initial claim**:
1. **Database Constraint:** `wallet_package_claims` table contains a unique key on `user_id` (`uq_claims_user_id`). The MySQL storage engine guarantees that no user can hold more than one claim record.
2. **Row-Level Serialization:** The transaction serializes on the user's existing wallet record (`SELECT id, balance FROM wallets WHERE id = ? FOR UPDATE`). This eliminates InnoDB gap-lock deadlocks during concurrent bursts.
3. **Double Claim Defense:** Subsequent requests return HTTP 409 Conflict (`PACKAGE_ALREADY_CLAIMED`) with the metadata of the previously claimed package.
4. **Idempotency Protection:** Enforced by unique key `uq_claims_idempotency`. Retrying with the same key returns HTTP 200 with `{ isReplay: true }` without incrementing balance or generating duplicate ledger rows. Reusing an idempotency key across different users is rejected with HTTP 409 Conflict (`IDEMPOTENCY_KEY_CONFLICT`).

### 13.4 API Endpoints
- `GET /api/wallet/demo-packages`
  - **Auth:** Optional session authentication.
  - **Returns:** List of configured demo packages and current user's claim status (`hasClaimed: boolean`).
- `GET /api/wallet/claim-status`
  - **Auth:** Required (`authenticate`).
  - **Returns:** `{ hasClaimed: true/false, claim: { packageId, demoCredits, claimedAt } }`.
- `POST /api/wallet/claim-demo-credits`
  - **Auth:** Required (`authenticate`, `verifyCsrf`).
  - **Payload:** `{ "packageId": "starter", "idempotencyKey": "string (optional)" }`.
  - **Returns:** HTTP 201 Created on initial success; HTTP 200 on idempotent replay; HTTP 409 on second claim attempt.

### 13.5 Running Day 9 Automated Tests
```bash
# Run unit & integration test suite (16 tests)
npm run test:funding

# Run live E2E integration test against port 5000 & 5500 (10 tests)
npm run test:e2e:funding

# Run full project regression suite (120 tests across Days 1–9)
npm test
```

---

## 14. 20-Day Development Roadmap

| Day | Milestone Focus |
| :---: | :--- |
| **Day 1** | **Project Initialization, Folder Structure & Backend Foundation (Completed)** |
| **Day 2** | **MySQL Database Architecture, Schemas, Connection Pool (`mysql2`) & Migrations (Completed)** |
| **Day 3** | **Premium Public Website, Landing Page, Navigation & API Integration (Completed)** |
| **Day 4** | **Authentication, Password Hashing, Sessions, RBAC & CSRF Protection (Completed)** |
| **Day 5** | **User Dashboard, Profile Management, Wallet Preview & Session Hydration (Completed)** |
| **Day 6** | **Match Browsing, Match Details, Search, Filters, Pagination & Backend Integration (Completed)** |
| **Day 7** | **Toss Prediction Engine: Market Rules, Cutoff Times & Submission (Completed)** |
| **Day 8** | **Virtual Demo Credit Wallet System, Ledger Audit Trails & Balance Management (Completed)** |
| **Day 9** | **Virtual Demo Credit Addition, Wallet Funding Simulation & Transaction History (Completed)** |
| **Day 10** | Prediction Placement Frontend Interface & Real-Time Balance Validation |
| **Day 11** | User Active Predictions & Historical Prediction Log Views |
| **Day 12** | Admin Portal Authentication, Role Verification & Admin Layout |
| **Day 13** | Admin Match Management & Official Toss Result Recording Interface |
| **Day 14** | Automated Virtual Credit Settlement Engine & Balance Payouts |
| **Day 15** | Admin Analytics Dashboard: Prediction Volume & Win/Loss Ratios |
| **Day 16** | Real-Time Notification Foundation (Socket.IO integration) |
| **Day 17** | Interactive Chart.js Visualizations for User & Admin Dashboards |
| **Day 18** | Comprehensive Responsive UI Audit (Mobile, Tablet, Desktop) & Micro-Animations |
| **Day 19** | End-to-End Integration Testing, Security Hardening & Edge Case Handling |
| **Day 20** | Production Deployment Preparation, Environment Verification & Final Polish |

---

## 15. License & Disclaimer

This project is licensed under the ISC License. Strictly for demonstration and simulation purposes with 100% virtual demo credits. Real currency betting, payments, and cash redemptions are strictly prohibited.

