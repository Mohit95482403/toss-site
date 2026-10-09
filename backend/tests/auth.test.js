/**
 * TossArena Day 4 Authentication & Security Test Suite
 * Automated tests for registration, login, sessions, CSRF, RBAC, and regression checks.
 */

const assert = require('assert');
const http = require('http');
const { app } = require('../server');
const { pool } = require('../config/db');

// Run tests on a dedicated dynamic port
let serverInstance;
let baseUrl;

// Test utilities
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
  } catch (_) {
    // response might not be json
  }

  return {
    status: response.status,
    headers: response.headers,
    cookies,
    body
  };
}

// Extract cookie value from Set-Cookie header
function extractCookie(cookieHeader, name = 'tossarena.sid') {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? `${name}=${match[1]}` : null;
}

// Clean up test users created during test execution safely respecting foreign keys
async function cleanupTestUsers() {
  const [testUsers] = await pool.query("SELECT id FROM users WHERE email LIKE '%@test-tossarena.internal'");
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
  console.log('   TossArena Day 4: Authentication Automated Tests');
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

  // Start test server
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
    // 1. CSRF Bootstrap Tests
    // ----------------------------------------------------
    let csrfToken = null;
    let initialSessionCookie = null;

    await test('GET /api/auth/csrf generates session and CSRF token', async () => {
      const res = await request('/api/auth/csrf', { method: 'GET' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(typeof res.body.csrfToken === 'string' && res.body.csrfToken.length >= 32);
      csrfToken = res.body.csrfToken;
      initialSessionCookie = extractCookie(res.cookies);
      assert.ok(initialSessionCookie, 'Session cookie must be set');
    });

    await test('POST without CSRF token is rejected with 403 Forbidden', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        headers: { Cookie: initialSessionCookie },
        body: JSON.stringify({
          fullName: 'CSRF Attack',
          email: 'csrf-victim@test-tossarena.internal',
          password: 'Password123456!'
        })
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'EBADCSRFTOKEN');
    });

    await test('POST with invalid CSRF token is rejected with 403 Forbidden', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        headers: {
          Cookie: initialSessionCookie,
          'x-csrf-token': 'invalid_token_12345678901234567890'
        },
        body: JSON.stringify({
          fullName: 'Bad Token User',
          email: 'bad-token@test-tossarena.internal',
          password: 'Password123456!'
        })
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'EBADCSRFTOKEN');
    });

    // ----------------------------------------------------
    // 2. Registration Validation Tests
    // ----------------------------------------------------
    await test('Reject registration with password < 12 characters', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        headers: { Cookie: initialSessionCookie, 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          fullName: 'Short Password',
          email: 'shortpass@test-tossarena.internal',
          password: 'Short123'
        })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('12 characters'));
    });

    await test('Reject registration with mismatched confirmPassword', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        headers: { Cookie: initialSessionCookie, 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          fullName: 'Mismatch User',
          email: 'mismatch@test-tossarena.internal',
          password: 'ValidPassword123!',
          confirmPassword: 'DifferentPassword123!'
        })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('do not match'));
    });

    await test('Reject registration with invalid email format', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        headers: { Cookie: initialSessionCookie, 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          fullName: 'Bad Email',
          email: 'not-an-email',
          password: 'ValidPassword123!'
        })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    await test('Reject registration containing HTML/script in fullName', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        headers: { Cookie: initialSessionCookie, 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          fullName: '<script>alert(1)</script>',
          email: 'xss@test-tossarena.internal',
          password: 'ValidPassword123!'
        })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    // ----------------------------------------------------
    // 3. Successful Registration Tests
    // ----------------------------------------------------
    const validTestUser = {
      fullName: 'Rahul Sharma',
      email: 'rahul.sharma@test-tossarena.internal',
      password: 'SecureCricketPass2026!'
    };

    await test('Valid registration succeeds and provisions demo wallet', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        headers: { Cookie: initialSessionCookie, 'x-csrf-token': csrfToken },
        body: JSON.stringify(validTestUser)
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.user);
      assert.strictEqual(res.body.user.email, validTestUser.email.toLowerCase());
      assert.strictEqual(res.body.user.role, 'user', 'Role must default to regular user');
      assert.strictEqual(res.body.user.demoBalance, 1000, 'Must grant 1,000 demo credits');
      assert.strictEqual(res.body.user.password, undefined, 'Password must never be returned');
      assert.strictEqual(res.body.user.password_hash, undefined, 'Password hash must never be returned');
    });

    await test('Verify password is never stored in plaintext in MySQL', async () => {
      const [rows] = await pool.query('SELECT password_hash FROM users WHERE email = ?', [validTestUser.email]);
      assert.strictEqual(rows.length, 1);
      assert.ok(rows[0].password_hash.startsWith('$2'), 'Must be a valid bcrypt hash');
      assert.notStrictEqual(rows[0].password_hash, validTestUser.password);
    });

    await test('Duplicate email registration is rejected with 409 Conflict', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        headers: { Cookie: initialSessionCookie, 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          fullName: 'Duplicate Rahul',
          email: validTestUser.email.toUpperCase(), // Case-insensitive duplicate check
          password: 'AnotherPassword123!'
        })
      });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'EMAIL_IN_USE');
    });

    await test('Public registration request cannot assign admin role (privilege escalation defense)', async () => {
      const res = await request('/api/auth/register', {
        method: 'POST',
        headers: { Cookie: initialSessionCookie, 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          fullName: 'Hacker Attempting Admin',
          email: 'hacker-admin@test-tossarena.internal',
          password: 'SecurePassword123!',
          role: 'admin' // Attempted exploit
        })
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.user.role, 'user', 'Server must ignore client-sent role');

      // Verify in database directly
      const [dbUser] = await pool.query('SELECT role FROM users WHERE email = ?', ['hacker-admin@test-tossarena.internal']);
      assert.strictEqual(dbUser[0].role, 'user');
    });

    // ----------------------------------------------------
    // 4. Login Tests
    // ----------------------------------------------------
    let loggedInCookie = null;
    let postLoginCsrf = null;

    await test('Login with incorrect password fails with 401 and generic message', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        headers: { Cookie: initialSessionCookie, 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          email: validTestUser.email,
          password: 'WrongPassword999!'
        })
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Invalid email address or password.');
    });

    await test('Login with non-existent email fails with 401 generic message', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        headers: { Cookie: initialSessionCookie, 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          email: 'nonexistent@test-tossarena.internal',
          password: 'SomePassword123!'
        })
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Invalid email address or password.');
    });

    await test('Valid login succeeds, regenerates session, and updates last_login_at', async () => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        headers: { Cookie: initialSessionCookie, 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          email: validTestUser.email,
          password: validTestUser.password
        })
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.user);
      assert.strictEqual(res.body.user.email, validTestUser.email);
      assert.strictEqual(res.body.user.demoBalance, 1000);
      assert.strictEqual(res.body.user.password_hash, undefined);

      loggedInCookie = extractCookie(res.cookies);
      assert.ok(loggedInCookie, 'Login response must provide authenticated session cookie');
      assert.notStrictEqual(loggedInCookie, initialSessionCookie, 'Session ID must be regenerated on login');

      postLoginCsrf = res.body.csrfToken;
      assert.ok(postLoginCsrf, 'Login must provide fresh rotated CSRF token');

      // Check last_login_at in database
      const [u] = await pool.query('SELECT last_login_at FROM users WHERE email = ?', [validTestUser.email]);
      assert.ok(u[0].last_login_at !== null, 'last_login_at must be populated');
    });

    // ----------------------------------------------------
    // 5. Account Status Tests (Suspended & Banned)
    // ----------------------------------------------------
    await test('Suspended user is denied login with 403 Forbidden', async () => {
      // Create suspended user
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('SuspendedPass123!', 10);
      await pool.query(
        "INSERT INTO users (full_name, email, password_hash, role, status) VALUES ('Suspended User', 'suspended@test-tossarena.internal', ?, 'user', 'suspended')",
        [hash]
      );

      const res = await request('/api/auth/login', {
        method: 'POST',
        headers: { Cookie: loggedInCookie, 'x-csrf-token': postLoginCsrf },
        body: JSON.stringify({
          email: 'suspended@test-tossarena.internal',
          password: 'SuspendedPass123!'
        })
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'ACCOUNT_SUSPENDED');
    });

    await test('Banned user is denied login with 403 Forbidden', async () => {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('BannedPass12345!', 10);
      await pool.query(
        "INSERT INTO users (full_name, email, password_hash, role, status) VALUES ('Banned User', 'banned@test-tossarena.internal', ?, 'user', 'banned')",
        [hash]
      );

      const res = await request('/api/auth/login', {
        method: 'POST',
        headers: { Cookie: loggedInCookie, 'x-csrf-token': postLoginCsrf },
        body: JSON.stringify({
          email: 'banned@test-tossarena.internal',
          password: 'BannedPass12345!'
        })
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'ACCOUNT_BANNED');
    });

    // ----------------------------------------------------
    // 6. Current User Session Tests (/api/auth/me)
    // ----------------------------------------------------
    await test('GET /api/auth/me returns current user profile when authenticated', async () => {
      const res = await request('/api/auth/me', {
        method: 'GET',
        headers: { Cookie: loggedInCookie }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user.email, validTestUser.email);
      assert.strictEqual(res.body.user.role, 'user');
      assert.strictEqual(res.body.user.demoBalance, 1000);
      assert.strictEqual(res.body.user.password_hash, undefined);
    });

    await test('GET /api/auth/me returns 401 Unauthorized without session cookie', async () => {
      const res = await request('/api/auth/me', { method: 'GET' });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    });

    // ----------------------------------------------------
    // 7. Role-Based Authorization Tests (RBAC)
    // ----------------------------------------------------
    await test('Regular user cannot access admin-only route (/api/auth/admin-check)', async () => {
      const res = await request('/api/auth/admin-check', {
        method: 'GET',
        headers: { Cookie: loggedInCookie }
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'FORBIDDEN');
    });

    await test('Admin user can access admin-only route', async () => {
      // Create admin user fixture
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('AdminSecret2026!', 10);
      const [adminResult] = await pool.query(
        "INSERT INTO users (full_name, email, password_hash, role, status) VALUES ('Test Administrator', 'admin@test-tossarena.internal', ?, 'admin', 'active')",
        [hash]
      );

      // Log in as admin
      const loginRes = await request('/api/auth/login', {
        method: 'POST',
        headers: { Cookie: loggedInCookie, 'x-csrf-token': postLoginCsrf },
        body: JSON.stringify({
          email: 'admin@test-tossarena.internal',
          password: 'AdminSecret2026!'
        })
      });
      assert.strictEqual(loginRes.status, 200);
      const adminCookie = extractCookie(loginRes.cookies);
      const adminCsrf = loginRes.body.csrfToken;

      // Access admin endpoint
      const adminCheckRes = await request('/api/auth/admin-check', {
        method: 'GET',
        headers: { Cookie: adminCookie }
      });
      assert.strictEqual(adminCheckRes.status, 200);
      assert.strictEqual(adminCheckRes.body.success, true);
      assert.strictEqual(adminCheckRes.body.user.role, 'admin');

      // ----------------------------------------------------
      // 8. Logout Tests
      // ----------------------------------------------------
      const logoutRes = await request('/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: adminCookie, 'x-csrf-token': adminCsrf }
      });
      assert.strictEqual(logoutRes.status, 200);
      assert.strictEqual(logoutRes.body.success, true);

      // Subsequent /me call with old cookie must now be rejected
      const meAfterLogout = await request('/api/auth/me', {
        method: 'GET',
        headers: { Cookie: adminCookie }
      });
      assert.strictEqual(meAfterLogout.status, 401, 'Logged out session must not access protected endpoints');
    });

    // ----------------------------------------------------
    // 9. Regression Tests (Days 1–3 functionality)
    // ----------------------------------------------------
    await test('GET / returns root API status (Day 1)', async () => {
      const res = await request('/', { method: 'GET' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

    await test('GET /api/health returns operational status (Day 1)', async () => {
      const res = await request('/api/health', { method: 'GET' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    });

    await test('GET /api/health/db returns database connectivity (Day 2)', async () => {
      const res = await request('/api/health/db', { method: 'GET' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.database, 'connected');
    });


  } finally {
    await cleanupTestUsers();
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  }

  console.log('\n======================================================');
  console.log(` Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run test suite
runTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
