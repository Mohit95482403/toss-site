# TossArena — System Architecture & Technical Specifications

**Document Version:** 1.0.0 (Day 1: Project Initialization & Backend Foundation)  
**Platform Classification:** Virtual-Credit Sports Demonstration Platform  
**Compliance Mandate:** 100% Virtual Demo Credits Only. No real currency transactions, cashouts, or monetary redemptions.

---

## 1. Architectural Overview

TossArena is built as a modular client-server web application with a clear separation of concerns between presentation, application logic, and data persistence.

```
+-------------------------------------------------------------------------+
|                              CLIENT TIER                                |
|  - HTML5 / Vanilla CSS3 Design System / Vanilla JavaScript ES6+         |
|  - Public Landing, Matches, User Dashboard, Admin Portal                |
|  - Non-sensitive Config & Dynamic Status Ping                           |
+-------------------------------------------------------------------------+
                                    |
                           HTTPS / REST (JSON)
                                    |
+-------------------------------------------------------------------------+
|                             API GATEWAY                                 |
|  - Express.js HTTP Server (Port 5000)                                   |
|  - Helmet HTTP Security Headers                                         |
|  - Conservative CORS Origin Filtering                                   |
|  - Centralized Error Handling & 404 Interceptors                        |
+-------------------------------------------------------------------------+
       |                           |                          |
+---------------+          +-----------------+        +-------------------+
|  CONTROLLERS  |  ----->  |    SERVICES     | -----> |  DATABASE LAYER   |
| Health        |          | Auth (Day 3)    |        | (Day 2 MySQL)     |
| Auth (Day 3)  |          | Matches (Day 4) |        | Users, Wallets,   |
| Matches (Day 4)|         | Ledger (Day 7)  |        | Matches, Ledger,  |
| Ledger (Day 7)|          | Settlement (13) |        | Predictions       |
+---------------+          +-----------------+        +-------------------+
```

---

## 2. Tier Responsibilities

### 2.1 Frontend Tier (`frontend/`)
- **Technology:** HTML5, Vanilla CSS3 (Custom Properties / Design Tokens), Vanilla JavaScript (Modular ES6+).
- **Core Responsibilities:**
  - Render high-performance, mobile-first responsive interfaces.
  - Present fixtures, countdown timers, virtual balance indicators, and prediction forms.
  - Form validation and dynamic feedback without full page reloads.
  - Read non-sensitive endpoints via `assets/js/config.js`.
- **Security Boundaries:**
  - **Zero Secrets Policy:** No API keys, database credentials, or private hashes exist in client code.
  - State is strictly driven by backend API responses and session cookies.

### 2.2 Backend Application Tier (`backend/`)
- **Technology:** Node.js LTS (v24.18.0), Express.js.
- **Core Responsibilities:**
  - Centralized HTTP routing and request validation.
  - Business logic execution inside isolated service modules (`backend/services/`).
  - Session verification and role-based access control.
  - Data sanitization and transactional consistency.
  - Centralized exception logging and standardized JSON responses.

### 2.3 Database Tier (`database/` & `backend/sql/`)
- **Technology:** MySQL 8.0+ via `mysql2/promise` connection pooling (Planned Day 2).
- **Core Responsibilities:**
  - ACID-compliant storage of users, credentials, matches, and prediction records.
  - Enforce foreign key constraints and transactional integrity on virtual wallet balance changes.

---

## 3. Communication Protocol & API Conventions

All client-backend interactions follow RESTful conventions over HTTP/HTTPS:

| Concept | Standard |
| :--- | :--- |
| **Data Format** | JSON (`application/json`) |
| **Response Format** | Standardized envelope: `{ success: boolean, message: string, data?: object, timestamp?: string }` |
| **Status Codes** | `200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `500 Internal Error` |
| **CORS Policy** | Origin-whitelisted with explicit credentials support (`corsOptions` in `server.js`). Wildcards are forbidden when credentials are enabled. |

---

## 4. Security & Authentication Architecture (Planned Day 3)

### 4.1 Credential Protection
- Passwords hashed using `bcrypt` with work factor 12.
- Plaintext passwords never logged or returned in responses.

### 4.2 Session Management
- Cookie-based session authentication using `express-session` with HTTP-Only, SameSite, and Secure flags.
- Role-based authorization middleware enforcing permission boundaries:
  - **Public:** Landing page, match listings, how-to-play, health endpoint.
  - **User Role:** Place toss predictions, view personal demo wallet, view personal prediction history, execute simulated credit top-ups.
  - **Admin Role:** Create matches, set toss lock times, declare official coin toss results, view system-wide prediction ledgers.

---

## 5. Virtual-Credit Ledger Architecture (Planned Day 7–9)

To ensure zero financial ambiguity and prevent exploitation, all virtual credit movements follow double-entry ledger bookkeeping principles:

```
[ User Wallet Balance ]
        |
        +---(+) Signup Bonus (1,000 demo credits)
        +---(+) Simulated Demo Deposit (user requested top-up)
        +---(-) Prediction Stake (deducted upon placing prediction)
        +---(+) Prediction Payout (credited upon winning toss result)
        +---(-) Simulated Demo Withdrawal (virtual deduction only)
```

1. **Immutable Transaction History:** Every wallet balance change records a corresponding row in the `transactions` table with `user_id`, `type`, `amount`, `balance_after`, and `description`.
2. **Atomic Transactions:** Virtual stakes and payout distributions run within database transactions (`START TRANSACTION` ... `COMMIT`). If an error occurs, the transaction is rolled back (`ROLLBACK`).

---

## 6. Prediction Settlement Workflow (Planned Day 13–15)

```
[ Admin Declares Toss ]
          |
          v
[ Set Match Status: "settled" ]
          |
          v
[ Fetch All Pending Predictions for Match ]
          |
          +---> For each prediction:
                  - Compare prediction with official toss result
                  - If WIN:
                      Calculate: payout = credits_staked * odds_multiplier
                      Credit user wallet balance
                      Record 'prediction_win' in transactions table
                      Update prediction status: 'won'
                  - If LOSS:
                      Update prediction status: 'lost'
          |
          v
[ Commit Transaction & Notify Users via WebSocket ]
```

---

## 7. Simulated Deposit & Withdrawal Workflows

TossArena includes simulated banking workflows for educational UI demonstration:
- **Simulated Deposit:** A user inputs a test credit amount (e.g. 500 demo credits). No card details, bank APIs, or external payment gateways are invoked. A simulated transaction records the demo credit addition.
- **Simulated Withdrawal:** A user inputs a test withdrawal amount from their virtual credit balance. The application verifies sufficient virtual balance, decrements the demo balance, and logs a simulated completion receipt. No fiat currency or digital asset is transferred.

---

## 8. Implementation Status: Day 1 vs. Planned Phases

| Component / Subsystem | Day 1 Status | Planned Phase |
| :--- | :--- | :--- |
| **Workspace & Git Repository** | **Implemented** | Ongoing |
| **Folder Structure (Frontend & Backend)** | **Implemented** | Ongoing |
| **Node.js Express API Server** | **Implemented** | Refined in Days 2–20 |
| **Security Headers (Helmet) & CORS** | **Implemented** | Ongoing |
| **Centralized Error & 404 Handlers** | **Implemented** | Ongoing |
| **Automated Health Check Endpoint (`/api/health`)** | **Implemented** | Ongoing |
| **Frontend Design Tokens & Responsive CSS** | **Implemented** | Enhanced in Days 4–15 |
| **Frontend Development Landing Page (`index.html`)** | **Implemented** | Enhanced in Days 4–15 |
| **Client-to-Backend Health Ping Integration** | **Implemented** | Ongoing |
| **MySQL Database Connection & Tables** | *Documented / Staged* | **Day 2** |
| **User Registration, Login & Sessions (bcrypt)** | *Documented / Staged* | **Day 3** |
| **Match Management & Fixtures API** | *Documented / Staged* | **Days 4–6** |
| **Virtual Credit Wallet & Simulated Ledger** | *Documented / Staged* | **Days 7–9** |
| **Toss Prediction Engine & Countdown Clocks** | *Documented / Staged* | **Days 10–12** |
| **Admin Management & Result Settlement** | *Documented / Staged* | **Days 13–15** |
| **Real-time WebSockets & Dashboard Polish** | *Documented / Staged* | **Days 16–20** |
