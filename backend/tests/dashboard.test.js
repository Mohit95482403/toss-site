/**
 * TossArena Day 5 User Dashboard & Profile Management Automated Tests
 * Tests dashboard summary, activity timeline, user isolation, profile updates, and RBAC.
 */

const assert = require('assert');
const http = require('http');
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

async function cleanupTestUsers() {
  const [testUsers] = await pool.query("SELECT id FROM users WHERE email LIKE '%@dash-test.internal'");
  if (testUsers.length === 0) return;

  const userIds = testUsers.map((u) => u.id);
  const placeholders = userIds.map(() => '?').join(',');

  await pool.query(
    `DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id IN (${placeholders}))`,
    userIds
  );
  await pool.query(
    `DELETE FROM notifications WHERE user_id IN (${placeholders})`,
    userIds
  );
  await pool.query(
    `DELETE FROM wallets WHERE user_id IN (${placeholders})`,
    userIds
  );
  await pool.query(
    `DELETE FROM users WHERE id IN (${placeholders})`,
    userIds
  );
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('   TossArena Day 5: User Dashboard & Profile Tests');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`• ${name} ... `);
      await fn();
      console.log('✔ PASSED');
      passed++;
    } catch (err) {
      console.log(`✖ FAILED: ${err.message}`);
      if (err.stack) {
        console.error('  ' + err.stack.split('\n').slice(1, 3).join('\n  '));
      }
      failed++;
    }
  }

  await new Promise((resolve) => {
    serverInstance = app.listen(0, () => {
      const port = serverInstance.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    await cleanupTestUsers();

    // ----------------------------------------------------
    // Setup Test Users: User A and User B
    // ----------------------------------------------------
    const userAData = {
      fullName: 'Vikram Patel',
      email: 'vikram@dash-test.internal',
      password: 'VikramPassword2026!'
    };
    const userBData = {
      fullName: 'Ananya Roy',
      email: 'ananya@dash-test.internal',
      password: 'AnanyaPassword2026!'
    };

    // Get CSRF token
    const csrfRes = await request('/api/auth/csrf');
    const initCookie = extractCookie(csrfRes.cookies);
    const csrfToken = csrfRes.body.csrfToken;

    // Register User A
    const regARes = await request('/api/auth/register', {
      method: 'POST',
      headers: { Cookie: initCookie, 'x-csrf-token': csrfToken },
      body: JSON.stringify(userAData)
    });
    assert.strictEqual(regARes.status, 201);

    // Register User B
    const regBRes = await request('/api/auth/register', {
      method: 'POST',
      headers: { Cookie: initCookie, 'x-csrf-token': csrfToken },
      body: JSON.stringify(userBData)
    });
    assert.strictEqual(regBRes.status, 201);

    // Log in User A
    const loginARes = await request('/api/auth/login', {
      method: 'POST',
      headers: { Cookie: initCookie, 'x-csrf-token': csrfToken },
      body: JSON.stringify({ email: userAData.email, password: userAData.password })
    });
    assert.strictEqual(loginARes.status, 200);
    const userACookie = extractCookie(loginARes.cookies);
    const userACsrf = loginARes.body.csrfToken;

    // Log in User B with a separate session
    const csrfB = await request('/api/auth/csrf');
    const initBCookie = extractCookie(csrfB.cookies);
    const csrfBToken = csrfB.body.csrfToken;

    const loginBRes = await request('/api/auth/login', {
      method: 'POST',
      headers: { Cookie: initBCookie, 'x-csrf-token': csrfBToken },
      body: JSON.stringify({ email: userBData.email, password: userBData.password })
    });
    assert.strictEqual(loginBRes.status, 200);
    const userBCookie = extractCookie(loginBRes.cookies);
    const userBCsrf = loginBRes.body.csrfToken;


    // ----------------------------------------------------
    // 1. Unauthenticated Access Protection
    // ----------------------------------------------------
    await test('GET /api/dashboard/summary rejects unauthenticated requests with 401', async () => {
      const res = await request('/api/dashboard/summary');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    });

    await test('GET /api/dashboard/activity rejects unauthenticated requests with 401', async () => {
      const res = await request('/api/dashboard/activity');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    });

    await test('PATCH /api/users/me rejects unauthenticated requests with 401', async () => {
      const res = await request('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: 'Unauthenticated Hacker' })
      });
      assert.strictEqual(res.status, 401);
    });

    // ----------------------------------------------------
    // 2. Dashboard Summary & Statistics
    // ----------------------------------------------------
    await test('GET /api/dashboard/summary returns real database data for User A', async () => {
      const res = await request('/api/dashboard/summary', {
        headers: { Cookie: userACookie }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.user.email, userAData.email);
      assert.strictEqual(res.body.data.user.fullName, userAData.fullName);
      assert.strictEqual(res.body.data.stats.accountStatus, 'Active');
      assert.strictEqual(res.body.data.stats.demoCreditBalance, 1000);
      assert.strictEqual(res.body.data.stats.predictionsMade, 0);
      assert.strictEqual(res.body.data.stats.completedPredictions, 0);
    });

    // ----------------------------------------------------
    // 3. User Isolation Tests
    // ----------------------------------------------------
    await test('User isolation: User A sees User A data, User B sees User B data', async () => {
      const resA = await request('/api/dashboard/summary', { headers: { Cookie: userACookie } });
      const resB = await request('/api/dashboard/summary', { headers: { Cookie: userBCookie } });

      assert.strictEqual(resA.body.data.user.email, userAData.email);
      assert.strictEqual(resB.body.data.user.email, userBData.email);
      assert.notStrictEqual(resA.body.data.user.id, resB.body.data.user.id);
    });

    // ----------------------------------------------------
    // 4. Activity Feed Tests
    // ----------------------------------------------------
    await test('GET /api/dashboard/activity returns real database activities', async () => {
      const res = await request('/api/dashboard/activity', {
        headers: { Cookie: userACookie }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.activities));
      assert.ok(res.body.data.activities.length >= 1, 'Should contain onboarding grant or notification');

      const grantActivity = res.body.data.activities.find((a) => a.type === 'demo_grant');
      assert.ok(grantActivity, 'Must include onboarding demo grant');
      assert.ok(grantActivity.amount.includes('1,000.00 Credits'));
    });

    // ----------------------------------------------------
    // 5. Match Fixtures Endpoint Tests
    // ----------------------------------------------------
    await test('GET /api/matches returns upcoming fixtures for dashboard preview', async () => {
      const res = await request('/api/matches');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 3, 'Must return the seeded matches');
      assert.ok(res.body.data[0].team_a);
      assert.ok(res.body.data[0].team_b);
    });

    // ----------------------------------------------------
    // 6. Profile Management & Mass Assignment Defense
    // ----------------------------------------------------
    await test('PATCH /api/users/me without CSRF token is rejected with 403', async () => {
      const res = await request('/api/users/me', {
        method: 'PATCH',
        headers: { Cookie: userACookie },
        body: JSON.stringify({ fullName: 'Vikram Updated' })
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'EBADCSRFTOKEN');
    });

    await test('PATCH /api/users/me rejects invalid or too short names', async () => {
      const res = await request('/api/users/me', {
        method: 'PATCH',
        headers: { Cookie: userACookie, 'x-csrf-token': userACsrf },
        body: JSON.stringify({ fullName: 'V' })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('2 characters'));
    });

    await test('PATCH /api/users/me rejects HTML/XSS injection in name', async () => {
      const res = await request('/api/users/me', {
        method: 'PATCH',
        headers: { Cookie: userACookie, 'x-csrf-token': userACsrf },
        body: JSON.stringify({ fullName: '<script>alert("hack")</script>' })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    await test('PATCH /api/users/me successfully updates full name', async () => {
      const updatedName = 'Vikram S. Patel';
      const res = await request('/api/users/me', {
        method: 'PATCH',
        headers: { Cookie: userACookie, 'x-csrf-token': userACsrf },
        body: JSON.stringify({ fullName: updatedName })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user.fullName, updatedName);

      // Verify in dashboard summary that updated name appears
      const sumRes = await request('/api/dashboard/summary', {
        headers: { Cookie: userACookie }
      });
      assert.strictEqual(sumRes.body.data.user.fullName, updatedName);
    });

    await test('Mass assignment defense: User cannot change role, status, or email', async () => {
      const res = await request('/api/users/me', {
        method: 'PATCH',
        headers: { Cookie: userACookie, 'x-csrf-token': userACsrf },
        body: JSON.stringify({
          fullName: 'Vikram S. Patel',
          role: 'admin',
          status: 'suspended',
          email: 'hacker@victim.com',
          id: 99999
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.role, 'user', 'Role must remain user');
      assert.strictEqual(res.body.user.status, 'active', 'Status must remain active');
      assert.strictEqual(res.body.user.email, userAData.email, 'Email must remain unchanged');

      // Verify directly in database
      const [rows] = await pool.query('SELECT role, status, email FROM users WHERE email = ?', [userAData.email]);
      assert.strictEqual(rows[0].role, 'user');
      assert.strictEqual(rows[0].status, 'active');
      assert.strictEqual(rows[0].email, userAData.email);
    });

    // ----------------------------------------------------
    // 7. Logout Invalidation for Dashboard
    // ----------------------------------------------------
    await test('Logout invalidates session; dashboard endpoints return 401', async () => {
      const logoutRes = await request('/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: userACookie, 'x-csrf-token': userACsrf }
      });
      assert.strictEqual(logoutRes.status, 200);

      const sumRes = await request('/api/dashboard/summary', {
        headers: { Cookie: userACookie }
      });
      assert.strictEqual(sumRes.status, 401);

      const actRes = await request('/api/dashboard/activity', {
        headers: { Cookie: userACookie }
      });
      assert.strictEqual(actRes.status, 401);
    });

  } finally {
    await cleanupTestUsers();
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  }

  console.log('\n======================================================');
  console.log(` Dashboard Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
