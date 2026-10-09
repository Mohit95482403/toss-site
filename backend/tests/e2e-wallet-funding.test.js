/**
 * TossArena Day 9: Live E2E Integration Test for Demo Credit Funding Simulation
 * Tests against live backend (port 5000) and live frontend (port 5500)
 */

const assert = require('assert');

const BACKEND_URL = process.env.TEST_BACKEND_URL || 'http://localhost:5000';
const FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:5500';

function extractCookie(cookieHeader, name = 'tossarena.sid') {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? `${name}=${match[1]}` : null;
}

async function request(baseUrl, path, options = {}) {
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
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch (_) {}
  } else {
    try {
      body = await response.text();
    } catch (_) {}
  }

  return {
    status: response.status,
    headers: response.headers,
    cookies,
    body
  };
}

async function runE2ETests() {
  console.log('\n======================================================');
  console.log('   TossArena Day 9: E2E Live Integration Test Suite');
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
      failed++;
    }
  }

  // 1. Verify servers are alive
  await test('Live Backend API server is healthy (port 5000)', async () => {
    const res = await request(BACKEND_URL, '/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  await test('Live Frontend server serves wallet.html with Day 9 packages container (port 5500)', async () => {
    const res = await request(FRONTEND_URL, '/user/wallet.html');
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.body === 'string');
    assert.ok(res.body.includes('id="sectionClaimPackages"'));
    assert.ok(res.body.includes('id="packagesContainer"'));
    assert.ok(res.body.includes('id="claimConfirmModal"'));
  });

  await test('Live Frontend server serves dashboard.html with Day 9 package claim section (port 5500)', async () => {
    const res = await request(FRONTEND_URL, '/user/dashboard.html');
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.body === 'string');
    assert.ok(res.body.includes('id="sectionClaimPackages"'));
    assert.ok(res.body.includes('id="claimConfirmModal"'));
  });

  // 2. Test live package catalog
  await test('Live API returns 4 server-authoritative demo packages', async () => {
    const res = await request(BACKEND_URL, '/api/wallet/demo-packages');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    const pkgs = Array.isArray(res.body.data) ? res.body.data : res.body.packages;
    assert.strictEqual(pkgs.length, 4);
  });

  // 3. Complete user workflow E2E
  const testEmail = `e2e_funder_${Date.now()}@test-e2e.internal`;
  let sessionCookie;
  let sessionCsrf;

  await test('Register and log in a new user session against live backend', async () => {
    const csrfRes = await request(BACKEND_URL, '/api/auth/csrf');
    const initCookie = extractCookie(csrfRes.cookies);
    const initCsrf = csrfRes.body.csrfToken;

    const regRes = await request(BACKEND_URL, '/api/auth/register', {
      method: 'POST',
      headers: {
        'Cookie': initCookie,
        'X-CSRF-Token': initCsrf
      },
      body: JSON.stringify({
        fullName: 'E2E Funding Tester',
        email: testEmail,
        password: 'Password123!',
        confirmPassword: 'Password123!'
      })
    });
    assert.strictEqual(regRes.status, 201);

    const loginRes = await request(BACKEND_URL, '/api/auth/login', {
      method: 'POST',
      headers: {
        'Cookie': initCookie,
        'X-CSRF-Token': initCsrf
      },
      body: JSON.stringify({
        email: testEmail,
        password: 'Password123!'
      })
    });
    assert.strictEqual(loginRes.status, 200);
    sessionCookie = extractCookie(loginRes.cookies);
    sessionCsrf = loginRes.body.csrfToken;
    assert.ok(sessionCookie);
    assert.ok(sessionCsrf);
  });

  await test('Check initial onboarding balance is 1,000 demo credits', async () => {
    const balRes = await request(BACKEND_URL, '/api/wallet/me', {
      headers: { 'Cookie': sessionCookie }
    });
    assert.strictEqual(balRes.status, 200);
    assert.strictEqual(Number(balRes.body.data.balance), 1000);
  });

  await test('Submit live claim for Premium Package (5,000 credits)', async () => {
    const claimRes = await request(BACKEND_URL, '/api/wallet/claim-demo-credits', {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        'X-CSRF-Token': sessionCsrf
      },
      body: JSON.stringify({
        packageId: 'premium',
        idempotencyKey: `e2e_key_${Date.now()}`
      })
    });

    assert.strictEqual(claimRes.status, 201);
    assert.strictEqual(claimRes.body.data.packageId, 'premium');
    const credits = claimRes.body.data.demoCredits || claimRes.body.data.demoCreditsGranted;
    assert.strictEqual(credits, 5000);
    assert.strictEqual(claimRes.body.data.newBalance, 6000);
  });

  await test('Live wallet balance now authoritative 6,000 demo credits', async () => {
    const balRes = await request(BACKEND_URL, '/api/wallet/me', {
      headers: { 'Cookie': sessionCookie }
    });
    assert.strictEqual(balRes.status, 200);
    assert.strictEqual(Number(balRes.body.data.balance), 6000);
  });

  await test('Live transaction ledger reflects the 5,000 credit package_claim entry', async () => {
    const txRes = await request(BACKEND_URL, '/api/wallet/transactions', {
      headers: { 'Cookie': sessionCookie }
    });
    assert.strictEqual(txRes.status, 200);
    const txs = Array.isArray(txRes.body.data) ? txRes.body.data : txRes.body.transactions;
    const claimTx = txs.find(t => t.referenceType === 'package_claim');
    assert.ok(claimTx);
    assert.strictEqual(Number(claimTx.amount), 5000);
    assert.strictEqual(Number(claimTx.balanceAfter), 6000);
  });

  await test('Subsequent claim attempt is rejected with 409 Conflict', async () => {
    const repeatRes = await request(BACKEND_URL, '/api/wallet/claim-demo-credits', {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        'X-CSRF-Token': sessionCsrf
      },
      body: JSON.stringify({
        packageId: 'starter'
      })
    });
    assert.strictEqual(repeatRes.status, 409);
    assert.strictEqual(repeatRes.body.code, 'PACKAGE_ALREADY_CLAIMED');
  });

  console.log('\n======================================================');
  console.log(` E2E Live Integration Summary: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

runE2ETests().catch((err) => {
  console.error('Fatal E2E runner error:', err);
  process.exit(1);
});
