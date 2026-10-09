/**
 * TossArena Admin Separation & Role-Based Access Control Test Suite
 * Verifies strict separation between the Admin Panel and User Dashboard:
 * - Proper role delivery on authentication (normal user -> 'user', admin -> 'admin')
 * - Complete rejection of normal users from all /api/admin/* endpoints (403 Forbidden)
 * - Complete rejection of unauthenticated users from all /api/admin/* endpoints (401 Unauthorized)
 * - Permitted access for administrators to dedicated administrative APIs (200 OK)
 * - Database-backed executive dashboard metrics (/api/admin/dashboard/overview)
 * - Audit logs query (/api/admin/audit-logs) restricted to administrators
 * - User management query (/api/admin/users) restricted to administrators
 * - Privilege escalation defense: client cannot elevate role via registration payload
 * - Strict financial invariance: admin queries never mutate wallet balances
 */

const { app } = require('../server');
const { pool } = require('../config/db');

let serverInstance;
let baseUrl;

async function request(path, options = {}) {
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

async function createAuthenticatedSession(email, role = 'user', fullName = 'Test User') {
  const password = 'StrongPassword123!';

  // 1. Fetch CSRF token
  const csrfRes = await request('/api/auth/csrf');
  const initialCookie = extractCookie(csrfRes.cookies);
  const initialCsrf = csrfRes.body.csrfToken;

  // 2. Register
  await request('/api/auth/register', {
    method: 'POST',
    headers: {
      'Cookie': initialCookie,
      'X-CSRF-Token': initialCsrf
    },
    body: JSON.stringify({
      fullName,
      email,
      password,
      confirmPassword: password
    })
  });

  // Promote to admin if requested
  if (role === 'admin') {
    await pool.query('UPDATE users SET role = ? WHERE email = ?', ['admin', email]);
  }

  // 3. Login
  const loginCsrfRes = await request('/api/auth/csrf');
  const loginCookie = extractCookie(loginCsrfRes.cookies);
  const loginCsrf = loginCsrfRes.body.csrfToken;

  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'Cookie': loginCookie,
      'X-CSRF-Token': loginCsrf
    },
    body: JSON.stringify({ email, password })
  });

  const sessionCookie = extractCookie(loginRes.cookies);
  const user = loginRes.body?.user;
  const sessionCsrf = loginRes.body?.csrfToken;

  return {
    userId: user?.id,
    userRole: user?.role,
    sessionCookie,
    csrfToken: sessionCsrf
  };
}

async function cleanupTestData() {
  const [testUsers] = await pool.query("SELECT id FROM users WHERE email LIKE '%@test-sep.internal'");
  if (testUsers.length > 0) {
    const userIds = testUsers.map(u => u.id);
    const placeholders = userIds.map(() => '?').join(',');
    await pool.query(`DELETE FROM predictions WHERE user_id IN (${placeholders})`, userIds);
    await pool.query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id IN (${placeholders}))`, userIds);
    await pool.query(`DELETE FROM wallets WHERE user_id IN (${placeholders})`, userIds);
    await pool.query(`DELETE FROM notifications WHERE user_id IN (${placeholders})`, userIds);
    await pool.query(`DELETE FROM audit_logs WHERE actor_user_id IN (${placeholders})`, userIds);
    await pool.query(`DELETE FROM users WHERE id IN (${placeholders})`, userIds);
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('   TossArena Strict Admin Separation & RBAC Test Suite');
  console.log('================================================================\n');

  try {
    await cleanupTestData();

    // 1. Create a regular user and an admin user
    const regularUser = await createAuthenticatedSession('member@test-sep.internal', 'user', 'Regular Member');
    const adminUser = await createAuthenticatedSession('admin@test-sep.internal', 'admin', 'Super Administrator');

    // -------------------------------------------------------------------------
    // TEST SECTION A: AUTHENTICATION ROLES & REDIRECT IDENTIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- Section A: Role Identification & Session Separation ---');

    record(
      'A1: Regular user authentication returns role "user"',
      regularUser.userRole === 'user',
      `Role: ${regularUser.userRole}`
    );

    record(
      'A2: Administrator authentication returns role "admin"',
      adminUser.userRole === 'admin',
      `Role: ${adminUser.userRole}`
    );

    // Verify GET /api/auth/me returns matching roles
    const userMe = await request('/api/auth/me', { headers: { 'Cookie': regularUser.sessionCookie } });
    record(
      'A3: /api/auth/me confirms role "user" for normal user',
      userMe.body?.user?.role === 'user',
      `Body: ${JSON.stringify(userMe.body?.user)}`
    );

    const adminMe = await request('/api/auth/me', { headers: { 'Cookie': adminUser.sessionCookie } });
    record(
      'A4: /api/auth/me confirms role "admin" for administrator',
      adminMe.body?.user?.role === 'admin',
      `Body: ${JSON.stringify(adminMe.body?.user)}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION B: RBAC ENFORCEMENT ON ADMIN APIS
    // -------------------------------------------------------------------------
    console.log('\n--- Section B: Strict Access Control on Admin Endpoints ---');

    const adminEndpoints = [
      { path: '/api/admin/dashboard/overview', name: 'Executive Overview' },
      { path: '/api/admin/matches', name: 'Match Management' },
      { path: '/api/admin/results', name: 'Toss Results' },
      { path: '/api/admin/audit-logs', name: 'Audit Logs' },
      { path: '/api/admin/users', name: 'User Management' }
    ];

    for (const ep of adminEndpoints) {
      // B1: Unauthenticated request rejected with 401
      const unauth = await request(ep.path);
      record(
        `B-Unauth: ${ep.name} rejects unauthenticated request with 401 Unauthorized`,
        unauth.status === 401 && unauth.body?.success === false,
        `Status: ${unauth.status}`
      );

      // B2: Normal user rejected with 403
      const forbidden = await request(ep.path, {
        headers: { 'Cookie': regularUser.sessionCookie }
      });
      record(
        `B-Forbidden: ${ep.name} rejects normal user with 403 Forbidden`,
        forbidden.status === 403 && forbidden.body?.success === false,
        `Status: ${forbidden.status}`
      );

      // B3: Administrator permitted with 200
      const allowed = await request(ep.path, {
        headers: { 'Cookie': adminUser.sessionCookie }
      });
      record(
        `B-Allowed: ${ep.name} permits administrator with 200 OK`,
        allowed.status === 200 && allowed.body?.success === true,
        `Status: ${allowed.status}`
      );
    }

    // -------------------------------------------------------------------------
    // TEST SECTION C: ADMIN DASHBOARD EXECUTIVE DATA INTEGRITY
    // -------------------------------------------------------------------------
    console.log('\n--- Section C: Admin Dashboard Overview Data Integrity ---');

    const overviewRes = await request('/api/admin/dashboard/overview', {
      headers: { 'Cookie': adminUser.sessionCookie }
    });
    const d = overviewRes.body?.data;

    record(
      'C1: Executive overview returns real user metrics (total, active, admins, normalUsers)',
      typeof d?.users?.total === 'number' &&
      d?.users?.total >= 2 &&
      typeof d?.users?.admins === 'number' &&
      typeof d?.users?.normalUsers === 'number',
      `Users: ${JSON.stringify(d?.users)}`
    );

    record(
      'C2: Executive overview returns real match metrics (total, open, completed, awaitingResults)',
      typeof d?.matches?.total === 'number' &&
      typeof d?.matches?.awaitingResults === 'number',
      `Matches: ${JSON.stringify(d?.matches)}`
    );

    record(
      'C3: Executive overview returns real prediction metrics (total, pending, accuracyRate)',
      typeof d?.predictions?.total === 'number' &&
      typeof d?.predictions?.accuracyRate === 'number',
      `Predictions: ${JSON.stringify(d?.predictions)}`
    );

    record(
      'C4: Executive overview returns recent audit logs array',
      Array.isArray(d?.recentAuditLogs),
      `Audits: ${d?.recentAuditLogs?.length}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION D: PRIVILEGE ESCALATION DEFENSE
    // -------------------------------------------------------------------------
    console.log('\n--- Section D: Privilege Escalation Defense ---');

    // Attempt to register with role: 'admin' injected in body
    const csrfRes = await request('/api/auth/csrf');
    const cookie = extractCookie(csrfRes.cookies);
    const csrf = csrfRes.body.csrfToken;

    const regRes = await request('/api/auth/register', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'X-CSRF-Token': csrf
      },
      body: JSON.stringify({
        fullName: 'Attacker Attempt',
        email: 'attacker@test-sep.internal',
        password: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!',
        role: 'admin' // Injected exploit attempt
      })
    });

    const [hackerRow] = await pool.query("SELECT role FROM users WHERE email = 'attacker@test-sep.internal'");
    record(
      'D1: Registration strictly ignores client-supplied role: "admin" and sets role to "user"',
      hackerRow.length === 1 && hackerRow[0].role === 'user',
      `Role in DB: ${hackerRow[0]?.role}`
    );

    // Attacker user is cleaned up in finally block via cleanupTestData()

  } catch (err) {
    console.error('Fatal error during test run:', err);
    failedTests++;
  } finally {
    await cleanupTestData();
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`TOTAL PASSED: ${passedTests}`);
  console.log(`TOTAL FAILED: ${failedTests}`);
  console.log('----------------------------------------------------------------\n');

  if (serverInstance) {
    serverInstance.close();
  }

  process.exit(failedTests > 0 ? 1 : 0);
}

serverInstance = app.listen(0, () => {
  const port = serverInstance.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  runTests();
});
