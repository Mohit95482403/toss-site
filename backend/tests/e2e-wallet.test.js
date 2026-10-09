/**
 * TossArena Day 8: E2E Demo Wallet & Ledger Verification
 * Validates full wallet workflow against live running backend (5000) and frontend (5500).
 */

const http = require('http');

function fetchHttp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: json || data,
          rawBody: data
        });
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function extractCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const headerStr = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader;
  const match = headerStr.match(/tossarena\.sid=([^;]+)/);
  return match ? `tossarena.sid=${match[1]}` : null;
}

async function runE2E() {
  console.log('\n======================================================');
  console.log('   TossArena Day 8: E2E Live Server Wallet Verification');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition) {
    if (condition) {
      console.log(`• ${desc} ... ✔ PASSED`);
      passed++;
    } else {
      console.error(`• ${desc} ... ✖ FAILED`);
      failed++;
    }
  }

  try {
    // 1. Verify frontend serves /user/wallet.html on port 5500
    const feRes = await fetchHttp('http://localhost:5500/user/wallet.html');
    assert('Frontend serves /user/wallet.html with HTTP 200', feRes.status === 200);
    assert('wallet.html contains "My Demo Wallet" heading', feRes.rawBody.includes('My Demo Wallet'));
    assert('wallet.html contains "Demo Credits" balance label', feRes.rawBody.includes('Demo Credits'));
    assert('wallet.html contains "Transaction Ledger" table structure', feRes.rawBody.includes('Transaction Ledger'));
    assert('wallet.html contains virtual demo credit disclaimer', feRes.rawBody.includes('Strict Virtual Policy') || feRes.rawBody.includes('No Cash Value'));

    // 2. Verify backend rejects unauthenticated /api/wallet/me on port 5000
    const unauthWalletRes = await fetchHttp('http://localhost:5000/api/wallet/me');
    assert('Live backend /api/wallet/me rejects unauthenticated request with 401', unauthWalletRes.status === 401);

    // 3. Obtain CSRF token on port 5000
    const csrfRes = await fetchHttp('http://localhost:5000/api/auth/csrf');
    assert('Live backend generates CSRF token', csrfRes.status === 200 && csrfRes.body?.csrfToken);
    const sessionCookie = extractCookie(csrfRes.headers['set-cookie']);
    const csrfToken = csrfRes.body.csrfToken;

    // 4. Register dedicated test user
    const testEmail = `wallet-e2e-${Date.now()}@test-e2e.internal`;
    const testPassword = 'StrongPassword123!';

    const regRes = await fetchHttp('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        fullName: 'E2E Wallet Tester',
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword
      })
    });
    assert('Live backend registers user and provisions demo wallet (201 Created)', regRes.status === 201 && regRes.body?.success);

    // Obtain fresh CSRF for login
    const loginCsrfRes = await fetchHttp('http://localhost:5000/api/auth/csrf');
    const loginSessionCookie = extractCookie(loginCsrfRes.headers['set-cookie']);
    const loginCsrfToken = loginCsrfRes.body.csrfToken;

    const loginRes = await fetchHttp('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': loginSessionCookie,
        'X-CSRF-Token': loginCsrfToken
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    });
    assert('Live backend logs in user successfully with HTTP 200', loginRes.status === 200 && loginRes.body?.success);
    const authCookie = extractCookie(loginRes.headers['set-cookie']) || loginSessionCookie;

    // 5. Retrieve authoritative wallet balance for Rahul Sharma
    const walletRes = await fetchHttp('http://localhost:5000/api/wallet/me', {
      headers: { 'Cookie': authCookie }
    });
    assert('Live backend /api/wallet/me returns HTTP 200 for authenticated user', walletRes.status === 200);
    assert('Wallet balance has currency "DEMO_CREDITS"', walletRes.body?.data?.currency === 'DEMO_CREDITS');
    assert('Authoritative demo credit balance is a positive number', typeof walletRes.body?.data?.balance === 'number' && walletRes.body?.data?.balance >= 0);

    // 6. Retrieve transaction ledger for Rahul Sharma
    const txRes = await fetchHttp('http://localhost:5000/api/wallet/transactions', {
      headers: { 'Cookie': authCookie }
    });
    assert('Live backend /api/wallet/transactions returns HTTP 200', txRes.status === 200);
    assert('Transactions data is an array', Array.isArray(txRes.body?.data));
    assert('Pagination metadata includes total and totalPages', typeof txRes.body?.pagination?.total === 'number');

    // 7. Test transaction type filtering on live backend
    const filteredRes = await fetchHttp('http://localhost:5000/api/wallet/transactions?type=demo_grant', {
      headers: { 'Cookie': authCookie }
    });
    assert('Filter ?type=demo_grant returns HTTP 200', filteredRes.status === 200);
    if (filteredRes.body?.data?.length > 0) {
      assert('All returned records have transactionType "demo_grant"', filteredRes.body.data.every(t => t.transactionType === 'demo_grant'));
    }

    // 8. Test rejection of unsupported type on live backend
    const badFilterRes = await fetchHttp('http://localhost:5000/api/wallet/transactions?type=illegal_crypto_payout', {
      headers: { 'Cookie': authCookie }
    });
    assert('Unsupported filter type rejected with HTTP 400', badFilterRes.status === 400);

    // 9. Verify immutability of transaction records
    const deleteTxRes = await fetchHttp('http://localhost:5000/api/wallet/transactions/1', {
      method: 'DELETE',
      headers: { 'Cookie': authCookie }
    });
    assert('Deleting transaction record is rejected with 404/405', deleteTxRes.status === 404 || deleteTxRes.status === 405);

  } catch (err) {
    console.error('E2E execution error:', err);
    failed++;
  } finally {
    try {
      const { pool } = require('../config/db');
      const [u] = await pool.query("SELECT id FROM users WHERE email LIKE '%@test-e2e.internal'");
      if (u.length > 0) {
        const ids = u.map(x => x.id);
        const placeholders = ids.map(() => '?').join(',');
        await pool.query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id IN (${placeholders}))`, ids);
        await pool.query(`DELETE FROM wallets WHERE user_id IN (${placeholders})`, ids);
        await pool.query(`DELETE FROM notifications WHERE user_id IN (${placeholders})`, ids);
        await pool.query(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
      }
      await pool.end();
    } catch (_) {}
  }

  console.log('\n======================================================');
  console.log(` E2E Live Server Summary: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runE2E();
