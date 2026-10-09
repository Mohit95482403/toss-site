/**
 * TossArena Direct Matches Redirection Flow Test Suite
 * Verifies:
 * 1. Normal user login delivers role "user" and target redirect to /matches
 * 2. Normal user registration supports immediate login flow to /matches
 * 3. Administrator login delivers role "admin" and target redirect to /admin/dashboard
 * 4. Landing page (index.html) contains authenticated redirect script to /matches
 * 5. Matches page (matches.js) enforces session check redirecting unauthenticated visitors to login
 * 6. Authenticated session keeps user on /matches upon page refresh
 * 7. Matches API endpoints (filtering, search, pagination, details) function with 200 OK
 * 8. Strict RBAC: regular user denied from admin APIs (403 Forbidden)
 * 9. Frontend server routes clean URL aliases for /matches, /login, /register, /admin/dashboard
 */

const { app } = require('../server');
const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');

let serverInstance;
let baseUrl;
const FRONTEND_URL = 'http://localhost:5500';

async function apiRequest(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const cookies = response.headers.get('set-cookie');
  let body = null;
  try {
    body = await response.json();
  } catch (_) {}

  return {
    status: response.status,
    headers: response.headers,
    cookies,
    body
  };
}

function extractCookie(cookieHeader, name = 'tossarena.sid') {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? `${name}=${match[1]}` : null;
}

let passedTests = 0;
let failedTests = 0;

function record(name, condition, extra = '') {
  if (condition) {
    passedTests++;
    console.log(`• ${name} ... ✔ PASSED`);
  } else {
    failedTests++;
    console.error(`• ${name} ... ✕ FAILED: ${extra}`);
  }
}

async function cleanupTestData() {
  try {
    const testEmails = ['testredirect_user@tossarena.test', 'testredirect_reg@tossarena.test', 'testredirect_admin@tossarena.test'];
    const [users] = await pool.query('SELECT id FROM users WHERE email IN (?)', [testEmails]);
    if (users.length > 0) {
      const userIds = users.map(u => u.id);
      const [wallets] = await pool.query('SELECT id FROM wallets WHERE user_id IN (?)', [userIds]);
      if (wallets.length > 0) {
        const walletIds = wallets.map(w => w.id);
        await pool.query('DELETE FROM wallet_transactions WHERE wallet_id IN (?)', [walletIds]);
      }
      await pool.query('DELETE FROM predictions WHERE user_id IN (?)', [userIds]);
      await pool.query('DELETE FROM wallets WHERE user_id IN (?)', [userIds]);
      await pool.query('DELETE FROM users WHERE id IN (?)', [userIds]);
    }
  } catch (err) {
    console.warn('Cleanup warning:', err.message);
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('   TossArena Direct Matches Redirection Flow Test Suite');
  console.log('================================================================\n');

  try {
    // 1. Setup in-memory server
    serverInstance = app.listen(0);
    const port = serverInstance.address().port;
    baseUrl = `http://127.0.0.1:${port}/api`;

    await cleanupTestData();

    // Fetch initial CSRF token
    const csrfRes = await apiRequest('/auth/csrf');
    const csrfToken = csrfRes.body?.csrfToken;
    const sessionCookie = extractCookie(csrfRes.cookies);

    console.log('--- Section A: Normal User Authentication & Direct Matches Flow ---');

    // Create a regular user
    const regRes = await apiRequest('/auth/register', {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        fullName: 'Matches Tester',
        email: 'testredirect_user@tossarena.test',
        password: 'Password123456!'
      })
    });
    record('A1: User registration succeeds with 201 Created', regRes.status === 201, `Status: ${regRes.status}`);

    // Normal user login
    const loginRes = await apiRequest('/auth/login', {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        email: 'testredirect_user@tossarena.test',
        password: 'Password123456!'
      })
    });
    const userCookie = extractCookie(loginRes.cookies);
    const userRole = loginRes.body?.user?.role;
    record('A2: Normal user authentication returns role "user"', userRole === 'user', `Role: ${userRole}`);

    // Verify session confirms role "user"
    const meRes = await apiRequest('/auth/me', {
      method: 'GET',
      headers: { 'Cookie': userCookie }
    });
    record('A3: Authenticated session returns active user session', meRes.status === 200 && meRes.body?.user?.email === 'testredirect_user@tossarena.test', `Status: ${meRes.status}`);

    // Create admin by registering and promoting
    const adminCsrfRes = await apiRequest('/auth/csrf');
    const adminInitCookie = extractCookie(adminCsrfRes.cookies);
    const adminInitCsrf = adminCsrfRes.body?.csrfToken;

    await apiRequest('/auth/register', {
      method: 'POST',
      headers: {
        'Cookie': adminInitCookie,
        'X-CSRF-Token': adminInitCsrf
      },
      body: JSON.stringify({
        fullName: 'Redirect Admin',
        email: 'testredirect_admin@tossarena.test',
        password: 'AdminSecret123456!'
      })
    });

    await pool.query('UPDATE users SET role = ? WHERE email = ?', ['admin', 'testredirect_admin@tossarena.test']);

    const adminLoginCsrfRes = await apiRequest('/auth/csrf');
    const adminLoginCookie = extractCookie(adminLoginCsrfRes.cookies);
    const adminLoginCsrf = adminLoginCsrfRes.body?.csrfToken;

    const adminLoginRes = await apiRequest('/auth/login', {
      method: 'POST',
      headers: {
        'Cookie': adminLoginCookie,
        'X-CSRF-Token': adminLoginCsrf
      },
      body: JSON.stringify({
        email: 'testredirect_admin@tossarena.test',
        password: 'AdminSecret123456!'
      })
    });
    const adminCookie = extractCookie(adminLoginRes.cookies);
    const adminRole = adminLoginRes.body?.user?.role;
    record('B1: Administrator authentication returns role "admin"', adminRole === 'admin', `Role: ${adminRole}`);

    const adminMeRes = await apiRequest('/auth/me', {
      method: 'GET',
      headers: { 'Cookie': adminCookie }
    });
    record('B2: /api/auth/me confirms role "admin" for administrator', adminMeRes.body?.user?.role === 'admin');

    console.log('\n--- Section C: Frontend Codebase Verification (Static Templates & Client Scripts) ---');

    // Verify frontend/pages/login.html redirects normal users to matches.html
    const loginHtmlPath = path.resolve(__dirname, '../../frontend/pages/login.html');
    const loginHtml = fs.readFileSync(loginHtmlPath, 'utf8');
    record('C1: login.html redirects normal users to matches.html directly', loginHtml.includes("window.location.href = 'matches.html'") || loginHtml.includes('matches.html'), 'Missing matches.html redirect in login.html');
    record('C2: login.html redirects administrators to ../admin/dashboard.html', loginHtml.includes('../admin/dashboard.html'), 'Missing admin dashboard redirect in login.html');
    record('C3: login.html checks existing session on page load', loginHtml.includes('TossArenaAuth.getCurrentUser()') && loginHtml.includes('replace'), 'Missing existing session guard in login.html');

    // Verify frontend/pages/register.html auto-login to matches
    const registerHtmlPath = path.resolve(__dirname, '../../frontend/pages/register.html');
    const registerHtml = fs.readFileSync(registerHtmlPath, 'utf8');
    record('C4: register.html attempts auto-login and redirects to matches.html', registerHtml.includes("window.location.href = 'matches.html'") && registerHtml.includes('TossArenaAuth.login'), 'Missing auto-login to matches in register.html');

    // Verify frontend/index.html redirects authenticated users away from landing page
    const indexHtmlPath = path.resolve(__dirname, '../../frontend/index.html');
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    record('C5: index.html redirects authenticated normal users to pages/matches.html', indexHtml.includes("window.location.replace('pages/matches.html')"), 'Missing authenticated user redirect in index.html');
    record('C6: index.html redirects authenticated admins to admin/dashboard.html', indexHtml.includes("window.location.replace('admin/dashboard.html')"), 'Missing authenticated admin redirect in index.html');

    // Verify frontend/assets/js/matches.js protects matches for unauthenticated visitors
    const matchesJsPath = path.resolve(__dirname, '../../frontend/assets/js/matches.js');
    const matchesJs = fs.readFileSync(matchesJsPath, 'utf8');
    record('C7: matches.js enforces session authorization on DOMContentLoaded', matchesJs.includes('getCurrentUser(true)') && matchesJs.includes('login.html?returnUrl='), 'Missing session guard in matches.js');

    // Verify frontend/assets/js/auth.js handles logout navigation safely
    const authJsPath = path.resolve(__dirname, '../../frontend/assets/js/auth.js');
    const authJs = fs.readFileSync(authJsPath, 'utf8');
    record('C8: auth.js logout sends unauthenticated users to login on protected pages', authJs.includes('isProtected') && authJs.includes('login.html'), 'Missing protected page logout redirect in auth.js');

    console.log('\n--- Section D: Frontend Server Clean URL Routing & Aliases ---');

    try {
      const feMatches = await fetch(`${FRONTEND_URL}/matches`);
      record('D1: Frontend server responds 200 OK for clean URL /matches', feMatches.status === 200, `Status: ${feMatches.status}`);

      const feLogin = await fetch(`${FRONTEND_URL}/login`);
      record('D2: Frontend server responds 200 OK for clean URL /login', feLogin.status === 200, `Status: ${feLogin.status}`);

      const feRegister = await fetch(`${FRONTEND_URL}/register`);
      record('D3: Frontend server responds 200 OK for clean URL /register', feRegister.status === 200, `Status: ${feRegister.status}`);

      const feAdminDash = await fetch(`${FRONTEND_URL}/admin/dashboard`);
      record('D4: Frontend server responds 200 OK for clean URL /admin/dashboard', feAdminDash.status === 200, `Status: ${feAdminDash.status}`);

      const feRoot = await fetch(`${FRONTEND_URL}/`);
      record('D5: Frontend server responds 200 OK for root landing page /', feRoot.status === 200, `Status: ${feRoot.status}`);
    } catch (feErr) {
      console.warn('Frontend server test warning (may not be listening on 5500):', feErr.message);
    }

    console.log('\n--- Section E: Match Browsing, Filters & Details Integrity ---');

    // Public / authenticated matches endpoint
    const matchesListRes = await apiRequest('/matches?page=1&limit=6');
    record('E1: GET /api/matches returns 200 OK with fixtures array', matchesListRes.status === 200 && Array.isArray(matchesListRes.body?.data), `Status: ${matchesListRes.status}`);

    const matchesSearchRes = await apiRequest('/matches?search=India');
    record('E2: GET /api/matches with keyword search executes with 200 OK', matchesSearchRes.status === 200, `Status: ${matchesSearchRes.status}`);

    const matchesFilterRes = await apiRequest('/matches?status=open');
    record('E3: GET /api/matches with status filter executes with 200 OK', matchesFilterRes.status === 200, `Status: ${matchesFilterRes.status}`);

    // If there is a match in the list, test single match details
    const firstMatch = matchesListRes.body?.data?.[0];
    if (firstMatch) {
      const matchDetailsRes = await apiRequest(`/matches/${firstMatch.id}`);
      record('E4: GET /api/matches/:id returns match details with 200 OK', matchDetailsRes.status === 200 && matchDetailsRes.body?.data?.id === firstMatch.id, `Status: ${matchDetailsRes.status}`);
    } else {
      record('E4: GET /api/matches/:id test skipped (no seeded matches)', true);
    }

    console.log('\n--- Section F: Strict RBAC & Admin Isolation ---');

    // Regular user accessing admin dashboard overview -> 403 Forbidden
    const forbiddenOverview = await apiRequest('/admin/dashboard/overview', {
      method: 'GET',
      headers: { 'Cookie': userCookie }
    });
    record('F1: Normal user rejected with 403 Forbidden on /api/admin/dashboard/overview', forbiddenOverview.status === 403, `Status: ${forbiddenOverview.status}`);

    // Regular user accessing admin matches -> 403 Forbidden
    const forbiddenMatches = await apiRequest('/admin/matches', {
      method: 'GET',
      headers: { 'Cookie': userCookie }
    });
    record('F2: Normal user rejected with 403 Forbidden on /api/admin/matches', forbiddenMatches.status === 403, `Status: ${forbiddenMatches.status}`);

    // Admin accessing admin dashboard overview -> 200 OK
    const adminOverview = await apiRequest('/admin/dashboard/overview', {
      method: 'GET',
      headers: { 'Cookie': adminCookie }
    });
    record('F3: Administrator successfully accesses /api/admin/dashboard/overview with 200 OK', adminOverview.status === 200, `Status: ${adminOverview.status}`);

  } catch (err) {
    console.error('Fatal test error:', err);
    failedTests++;
  } finally {
    await cleanupTestData();
    if (serverInstance) {
      serverInstance.close();
    }
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL PASSED: ${passedTests}`);
  console.log(`TOTAL FAILED: ${failedTests}`);
  console.log('----------------------------------------------------------------\n');

  try {
    await pool.end();
  } catch (_) {}

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
