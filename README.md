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
- [x] **Day 5 Upcoming Matches Preview (`GET /api/matches`):** Real database match fixture feed with tournament name, teams, scheduled dates, and status badges.
- [x] **Day 5 Self-Service Profile Management (`frontend/user/profile.html` & `PATCH /api/users/me`):** Displays read-only email, role, status, registration date, and allows updating display name with server-side validation, CSRF verification, and mass-assignment protection.
- [x] **Day 5 Session Security & Logout:** Secure authenticated route guards, user isolation defense (User A cannot access or update User B's records), and session destruction upon logout.
- [x] **Day 5 Automated Test Suite (`npm run test:dashboard`):** 13 automated tests covering summary statistics, activity feeds, user isolation, profile updates, mass assignment defense, and logout session invalidation with 100% pass rate.



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

## 11. Git Usage Basics

```bash
# Inspect repository state
git status

# Stage files
git add .

# Create a commit
git commit -m "feat: complete day 1 project initialization and backend foundation"
```

*Note: `.env` and `node_modules` are automatically ignored to protect secrets and avoid committing build artifacts.*

---

## 12. Planned 20-Day Development Roadmap

| Day | Milestone Focus |
| :---: | :--- |
| **Day 1** | **Project Initialization, Folder Structure & Backend Foundation (Completed)** |
| **Day 2** | **MySQL Database Architecture, Schemas, Connection Pool (`mysql2`) & Migrations (Completed)** |
| **Day 3** | **Premium Public Website, Landing Page, Navigation & API Integration (Completed)** |
| **Day 4** | Authentication Foundation — Registration, Login, Password Hashing, Sessions, Validation, and Role-Aware Access |
| **Day 5** | Cricket Match Model, Fixtures API & Admin Match Creation |
| **Day 6** | Coin Toss Prediction Model, Multi-Market Validation & Odds Service |
| **Day 7** | Virtual Credit Wallet Model, Ledger Schema & 1,000 Signup Bonus Credit Distribution |
| **Day 8** | Simulated Wallet Top-Up & Withdrawal Simulation Workflows (Zero Real Money) |
| **Day 9** | User Dashboard UI: Wallet Balance, Transaction Ledger & Auditing |
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

## 13. License & Disclaimer

This project is licensed under the ISC License. Strictly for demonstration and simulation purposes.
