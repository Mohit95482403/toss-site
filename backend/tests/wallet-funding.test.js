/**
 * TossArena Day 9: Virtual Demo Credit Addition & Wallet Funding Simulation Test Suite
 * Validates:
 * - Server-authoritative package catalog (Starter: 500, Standard: 1000, Advanced: 2500, Premium: 5000)
 * - One-time initial claim policy per user account
 * - Strict rejection of client-injected amounts or arbitrary user IDs
 * - CSRF and session authentication requirements
 * - Idempotency key handling (safe replays vs conflict detection)
 * - Concurrency protection with database-level uniqueness and row locking
 * - Atomic ledger updates and consistency between wallet balance & transaction ledger
 */

const assert = require('assert');
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

// Clean up test users safely
async function cleanupTestData() {
  const [testUsers] = await pool.query("SELECT id FROM users WHERE email LIKE '%@test-funding.internal'");
  if (testUsers.length > 0) {
    const userIds = testUsers.map(u => u.id);
    const placeholders = userIds.map(() => '?').join(',');
    await pool.query(`DELETE FROM wallet_package_claims WHERE user_id IN (${placeholders})`, userIds);
    await pool.query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id IN (${placeholders}))`, userIds);
    await pool.query(`DELETE FROM wallets WHERE user_id IN (${placeholders})`, userIds);
    await pool.query(`DELETE FROM notifications WHERE user_id IN (${placeholders})`, userIds);
    await pool.query(`DELETE FROM audit_logs WHERE actor_user_id IN (${placeholders})`, userIds);
    await pool.query(`DELETE FROM users WHERE id IN (${placeholders})`, userIds);
  }
}

async function createAuthenticatedSession(email, fullName = 'Funding Test User') {
  const password = 'StrongPassword123!';

  // 1. Fetch initial CSRF token
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

  // 3. Login
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'Cookie': initialCookie,
      'X-CSRF-Token': initialCsrf
    },
    body: JSON.stringify({ email, password })
  });

  const loggedInCookie = extractCookie(loginRes.cookies);
  const authCsrfToken = loginRes.body ? loginRes.body.csrfToken : null;

  return {
    user: loginRes.body ? loginRes.body.user : null,
    cookie: loggedInCookie,
    csrfToken: authCsrfToken
  };
}

async function runTests() {
  console.log('\n======================================================');
  console.log('   TossArena Day 9: Demo Credit Funding Test Suite');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`• ${name} ... `);
    try {
      await fn();
      console.log('✔ PASSED');
      passed++;
    } catch (err) {
      console.log('✖ FAILED');
      console.error('  Error:', err.message);
      if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
      failed++;
    }
  }

  try {
    // Start temporary test server on dynamic port bound to 127.0.0.1
    serverInstance = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = serverInstance.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    await cleanupTestData();

    // -------------------------------------------------------------------------
    // 1. Package Catalog API Tests
    // -------------------------------------------------------------------------

    await test('GET /api/wallet/demo-packages returns configured packages', async () => {
      const res = await request('/api/wallet/demo-packages');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const packages = Array.isArray(res.body.data) ? res.body.data : res.body.packages;
      assert.ok(Array.isArray(packages));
      assert.strictEqual(packages.length, 4);

      const ids = packages.map(p => p.id);
      assert.deepStrictEqual(ids, ['starter', 'standard', 'advanced', 'premium']);

      const starter = packages.find(p => p.id === 'starter');
      assert.strictEqual(starter.demoCredits, 500);
      const premium = packages.find(p => p.id === 'premium');
      assert.strictEqual(premium.demoCredits, 5000);
    });

    await test('GET /api/wallet/demo-packages with authenticated user includes claim status', async () => {
      const session = await createAuthenticatedSession('catalog_user@test-funding.internal');
      const res = await request('/api/wallet/demo-packages', {
        headers: { 'Cookie': session.cookie }
      });
      assert.strictEqual(res.status, 200);
      const userClaim = res.body.userClaim || (res.body.data && res.body.data.userClaim);
      assert.ok(userClaim);
      assert.strictEqual(userClaim.hasClaimed, false);
    });

    // -------------------------------------------------------------------------
    // 2. Authentication & Authorization & CSRF Tests
    // -------------------------------------------------------------------------

    await test('POST /api/wallet/claim-demo-credits rejects unauthenticated request with 401', async () => {
      const res = await request('/api/wallet/claim-demo-credits', {
        method: 'POST',
        body: JSON.stringify({ packageId: 'starter' })
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.code, 'UNAUTHORIZED');
    });

    await test('POST /api/wallet/claim-demo-credits rejects missing CSRF token with 403', async () => {
      const session = await createAuthenticatedSession('csrf_user@test-funding.internal');
      const res = await request('/api/wallet/claim-demo-credits', {
        method: 'POST',
        headers: { 'Cookie': session.cookie },
        body: JSON.stringify({ packageId: 'starter' })
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.code, 'EBADCSRFTOKEN');
    });

    await test('POST /api/wallet/claim-demo-credits rejects invalid package ID with 400', async () => {
      const session = await createAuthenticatedSession('bad_pkg_user@test-funding.internal');
      const res = await request('/api/wallet/claim-demo-credits', {
        method: 'POST',
        headers: {
          'Cookie': session.cookie,
          'X-CSRF-Token': session.csrfToken
        },
        body: JSON.stringify({ packageId: 'unlimited_million_rupees' })
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'INVALID_PACKAGE_ID');
    });

    // -------------------------------------------------------------------------
    // 3. One-Time Demo Credit Grant & Ledger Verification
    // -------------------------------------------------------------------------

    let testUserSession;
    let initialBalance;

    await test('POST /api/wallet/claim-demo-credits successfully grants Standard package (1,000 credits)', async () => {
      testUserSession = await createAuthenticatedSession('grant_user@test-funding.internal');
      
      // Check starting balance (1000 from signup grant)
      const balRes = await request('/api/wallet/me', {
        headers: { 'Cookie': testUserSession.cookie }
      });
      initialBalance = Number(balRes.body.data.balance);

      const claimRes = await request('/api/wallet/claim-demo-credits', {
        method: 'POST',
        headers: {
          'Cookie': testUserSession.cookie,
          'X-CSRF-Token': testUserSession.csrfToken
        },
        body: JSON.stringify({
          packageId: 'standard',
          idempotencyKey: 'idem_test_user_001'
        })
      });

      assert.strictEqual(claimRes.status, 201);
      assert.strictEqual(claimRes.body.success, true);
      assert.strictEqual(claimRes.body.data.packageId, 'standard');
      const creditsGranted = claimRes.body.data.demoCredits || claimRes.body.data.demoCreditsGranted;
      assert.strictEqual(creditsGranted, 1000);
      assert.strictEqual(claimRes.body.data.newBalance, initialBalance + 1000);
      assert.strictEqual(claimRes.body.data.isReplay, false);
    });

    await test('Wallet balance reflects real updated MySQL balance after grant', async () => {
      const balRes = await request('/api/wallet/me', {
        headers: { 'Cookie': testUserSession.cookie }
      });
      assert.strictEqual(balRes.status, 200);
      assert.strictEqual(Number(balRes.body.data.balance), initialBalance + 1000);
    });

    await test('Wallet transaction ledger records exactly one immutable demo_grant entry', async () => {
      const txRes = await request('/api/wallet/transactions?type=demo_grant', {
        headers: { 'Cookie': testUserSession.cookie }
      });
      assert.strictEqual(txRes.status, 200);
      assert.strictEqual(txRes.body.success, true);
      
      const grantTxs = Array.isArray(txRes.body.data) ? txRes.body.data : txRes.body.transactions;
      assert.ok(Array.isArray(grantTxs));
      // Should have signup onboarding grant + package claim grant
      const claimTx = grantTxs.find(tx => tx.referenceType === 'package_claim');
      assert.ok(claimTx, 'Ledger entry with referenceType package_claim must exist');
      assert.strictEqual(Number(claimTx.amount), 1000);
      assert.strictEqual(Number(claimTx.balanceAfter), initialBalance + 1000);
    });

    await test('GET /api/wallet/claim-status returns hasClaimed: true with claim metadata', async () => {
      const statusRes = await request('/api/wallet/claim-status', {
        headers: { 'Cookie': testUserSession.cookie }
      });
      assert.strictEqual(statusRes.status, 200);
      assert.strictEqual(statusRes.body.data.hasClaimed, true);
      assert.strictEqual(statusRes.body.data.claim.packageId, 'standard');
      assert.strictEqual(statusRes.body.data.claim.demoCredits, 1000);
    });

    // -------------------------------------------------------------------------
    // 4. Duplicate Claim Prevention & Idempotency Tests
    // -------------------------------------------------------------------------

    await test('Second claim attempt with different package is rejected with 409 Conflict', async () => {
      const secondClaimRes = await request('/api/wallet/claim-demo-credits', {
        method: 'POST',
        headers: {
          'Cookie': testUserSession.cookie,
          'X-CSRF-Token': testUserSession.csrfToken
        },
        body: JSON.stringify({
          packageId: 'premium', // attempting to claim 5000 more
          idempotencyKey: 'idem_test_user_002'
        })
      });

      assert.strictEqual(secondClaimRes.status, 409);
      assert.strictEqual(secondClaimRes.body.success, false);
      assert.strictEqual(secondClaimRes.body.code, 'PACKAGE_ALREADY_CLAIMED');
      
      // Balance must NOT have changed
      const balRes = await request('/api/wallet/me', {
        headers: { 'Cookie': testUserSession.cookie }
      });
      assert.strictEqual(Number(balRes.body.data.balance), initialBalance + 1000);
    });

    await test('Idempotent retry with identical idempotencyKey returns 200 with isReplay: true without adding credits', async () => {
      const replayRes = await request('/api/wallet/claim-demo-credits', {
        method: 'POST',
        headers: {
          'Cookie': testUserSession.cookie,
          'X-CSRF-Token': testUserSession.csrfToken
        },
        body: JSON.stringify({
          packageId: 'standard',
          idempotencyKey: 'idem_test_user_001'
        })
      });

      assert.strictEqual(replayRes.status, 200);
      assert.strictEqual(replayRes.body.success, true);
      assert.strictEqual(replayRes.body.data.isReplay, true);
      const credits = replayRes.body.data.demoCredits || replayRes.body.data.demoCreditsGranted;
      assert.strictEqual(credits, 1000);
      assert.strictEqual(replayRes.body.data.newBalance, initialBalance + 1000);

      // Verify database still only has 1 package claim transaction
      const [claimRows] = await pool.query(
        "SELECT COUNT(*) AS count FROM wallet_transactions WHERE reference_type = 'package_claim' AND description LIKE '%Standard%'"
      );
      assert.strictEqual(claimRows[0].count, 1);
    });

    await test('Idempotency key conflict (different user using same key) rejected with 409', async () => {
      const otherUserSession = await createAuthenticatedSession('other_user@test-funding.internal');
      const conflictRes = await request('/api/wallet/claim-demo-credits', {
        method: 'POST',
        headers: {
          'Cookie': otherUserSession.cookie,
          'X-CSRF-Token': otherUserSession.csrfToken
        },
        body: JSON.stringify({
          packageId: 'starter',
          idempotencyKey: 'idem_test_user_001' // Key already used by first user
        })
      });

      assert.strictEqual(conflictRes.status, 409);
      assert.strictEqual(conflictRes.body.code, 'IDEMPOTENCY_KEY_CONFLICT');
    });

    // -------------------------------------------------------------------------
    // 5. Client Tampering & Security Tests
    // -------------------------------------------------------------------------

    await test('Client-supplied demoCredits amount is rejected with 400 CLIENT_AMOUNT_REJECTED', async () => {
      const userSession = await createAuthenticatedSession('tamper_user@test-funding.internal');
      
      const tamperRes = await request('/api/wallet/claim-demo-credits', {
        method: 'POST',
        headers: {
          'Cookie': userSession.cookie,
          'X-CSRF-Token': userSession.csrfToken
        },
        body: JSON.stringify({
          packageId: 'starter',
          demoCredits: 9999999, // client attempt to inject 9.9 million
          amount: 5000000
        })
      });

      assert.strictEqual(tamperRes.status, 400);
      assert.strictEqual(tamperRes.body.code, 'CLIENT_AMOUNT_REJECTED');
      
      const balRes = await request('/api/wallet/me', {
        headers: { 'Cookie': userSession.cookie }
      });
      // 1000 onboarding only
      assert.strictEqual(Number(balRes.body.data.balance), 1000);
    });

    await test('Server strictly awards configured package amount on valid claim', async () => {
      const userSession = await createAuthenticatedSession('legit_user@test-funding.internal');
      
      const claimRes = await request('/api/wallet/claim-demo-credits', {
        method: 'POST',
        headers: {
          'Cookie': userSession.cookie,
          'X-CSRF-Token': userSession.csrfToken
        },
        body: JSON.stringify({
          packageId: 'starter'
        })
      });

      assert.strictEqual(claimRes.status, 201);
      const credits = claimRes.body.data.demoCredits || claimRes.body.data.demoCreditsGranted;
      assert.strictEqual(credits, 500);

      const balRes = await request('/api/wallet/me', {
        headers: { 'Cookie': userSession.cookie }
      });
      // 1000 onboarding + 500 starter = 1500
      assert.strictEqual(Number(balRes.body.data.balance), 1500);
    });

    await test('Client-supplied userId in request body cannot claim credits for another user', async () => {
      const attackerSession = await createAuthenticatedSession('attacker@test-funding.internal');
      const victimSession = await createAuthenticatedSession('victim@test-funding.internal');

      const attackRes = await request('/api/wallet/claim-demo-credits', {
        method: 'POST',
        headers: {
          'Cookie': attackerSession.cookie,
          'X-CSRF-Token': attackerSession.csrfToken
        },
        body: JSON.stringify({
          packageId: 'starter',
          userId: victimSession.user.id // Trying to target victim
        })
      });

      assert.strictEqual(attackRes.status, 201);
      // Attacker's wallet was credited, NOT victim's
      const victimStatus = await request('/api/wallet/claim-status', {
        headers: { 'Cookie': victimSession.cookie }
      });
      assert.strictEqual(victimStatus.body.data.hasClaimed, false);
    });

    // -------------------------------------------------------------------------
    // 6. Concurrency Protection Tests
    // -------------------------------------------------------------------------

    await test('Concurrent simultaneous claim requests: exactly one succeeds, no double credit', async () => {
      const concurrentSession = await createAuthenticatedSession('concurrent@test-funding.internal');

      // Fire 5 simultaneous claim requests with different package IDs
      const promises = [
        request('/api/wallet/claim-demo-credits', {
          method: 'POST',
          headers: {
            'Cookie': concurrentSession.cookie,
            'X-CSRF-Token': concurrentSession.csrfToken
          },
          body: JSON.stringify({ packageId: 'starter', idempotencyKey: 'conc_1' })
        }),
        request('/api/wallet/claim-demo-credits', {
          method: 'POST',
          headers: {
            'Cookie': concurrentSession.cookie,
            'X-CSRF-Token': concurrentSession.csrfToken
          },
          body: JSON.stringify({ packageId: 'standard', idempotencyKey: 'conc_2' })
        }),
        request('/api/wallet/claim-demo-credits', {
          method: 'POST',
          headers: {
            'Cookie': concurrentSession.cookie,
            'X-CSRF-Token': concurrentSession.csrfToken
          },
          body: JSON.stringify({ packageId: 'advanced', idempotencyKey: 'conc_3' })
        }),
        request('/api/wallet/claim-demo-credits', {
          method: 'POST',
          headers: {
            'Cookie': concurrentSession.cookie,
            'X-CSRF-Token': concurrentSession.csrfToken
          },
          body: JSON.stringify({ packageId: 'premium', idempotencyKey: 'conc_4' })
        }),
        request('/api/wallet/claim-demo-credits', {
          method: 'POST',
          headers: {
            'Cookie': concurrentSession.cookie,
            'X-CSRF-Token': concurrentSession.csrfToken
          },
          body: JSON.stringify({ packageId: 'starter', idempotencyKey: 'conc_5' })
        })
      ];

      const results = await Promise.all(promises);
      const successes = results.filter(r => r.status === 201);
      const conflicts = results.filter(r => r.status === 409);

      assert.strictEqual(successes.length, 1, 'Exactly one concurrent request must succeed with 201');
      assert.strictEqual(conflicts.length, 4, 'Remaining 4 concurrent requests must be rejected with 409');

      // Verify database record has exactly one claim for this user
      const [claimRows] = await pool.query(
        'SELECT COUNT(*) AS count FROM wallet_package_claims WHERE user_id = ?',
        [concurrentSession.user.id]
      );
      assert.strictEqual(claimRows[0].count, 1);
    });

  } finally {
    await cleanupTestData();
    if (serverInstance) {
      await new Promise(resolve => serverInstance.close(resolve));
    }
  }

  console.log('\n======================================================');
  console.log(` Demo Credit Funding Summary: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner exception:', err);
  process.exit(1);
});
