/**
 * TossArena Day 7: E2E Prediction Engine & Frontend Integration Tests
 * Validates full prediction workflow against live servers on port 5000 and 5500.
 */

const http = require('http');
const { pool } = require('../config/db');

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
  console.log('   TossArena Day 7: E2E Prediction Engine Verification');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition) {
    if (condition) {
      console.log(`• ${desc} ... ✔ PASSED`);
      passed++;
    } else {
      console.error(`• ${desc} ... ❌ FAILED`);
      failed++;
    }
  }

  const testEmail = `e2e-pred-${Date.now()}@test-e2e.internal`;

  try {
    // 1. Verify frontend files served
    const matchDetailsPage = await fetchHttp('http://localhost:5500/pages/match-details.html?id=1');
    assert('Frontend match-details.html is served (200 OK)', matchDetailsPage.status === 200);
    assert('match-details.html loads match-details.js', matchDetailsPage.rawBody.includes('match-details.js'));

    const dashboardPage = await fetchHttp('http://localhost:5500/user/dashboard.html');
    assert('Frontend dashboard.html is served (200 OK)', dashboardPage.status === 200);
    assert('dashboard.html contains sectionPredictions', dashboardPage.rawBody.includes('id="sectionPredictions"'));

    // 2. Obtain CSRF token
    const csrfRes = await fetchHttp('http://localhost:5000/api/auth/csrf');
    assert('GET /api/auth/csrf returns token', csrfRes.status === 200 && csrfRes.body.csrfToken);
    const sessionCookie = extractCookie(csrfRes.headers['set-cookie']);
    const csrfToken = csrfRes.body.csrfToken;

    // 3. Register user
    const regRes = await fetchHttp('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        fullName: 'E2E Predictor',
        email: testEmail,
        password: 'SecurePassword123!',
        confirmPassword: 'SecurePassword123!'
      })
    });
    assert('Registration succeeds (201 Created)', regRes.status === 201);

    // 4. Login user to get authenticated session
    const loginRes = await fetchHttp('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        email: testEmail,
        password: 'SecurePassword123!'
      })
    });
    assert('Login succeeds (200 OK)', loginRes.status === 200);
    const authCookie = extractCookie(loginRes.headers['set-cookie']) || sessionCookie;
    const authCsrf = loginRes.body.csrfToken;

    // 5. Query open match (Match 1: India vs Australia)
    const matchRes = await fetchHttp('http://localhost:5000/api/matches/1');
    assert('Match 1 exists and is open for predictions', matchRes.status === 200 && matchRes.body.data.status === 'open');

    // 6. Check user prediction before submission (should be false)
    const preCheck = await fetchHttp('http://localhost:5000/api/predictions/me/match/1', {
      headers: { 'Cookie': authCookie }
    });
    assert('Pre-check reports hasPredicted: false', preCheck.status === 200 && preCheck.body.hasPredicted === false);

    // 7. Submit valid toss prediction
    const submitRes = await fetchHttp('http://localhost:5000/api/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie,
        'X-CSRF-Token': authCsrf
      },
      body: JSON.stringify({
        matchId: 1,
        predictedTeam: 'India'
      })
    });
    assert('Prediction submission succeeds with 201 Created', submitRes.status === 201 && submitRes.body.success === true);
    assert('Persisted prediction indicates predictedTeam: India', submitRes.body.data.predictedTeam === 'India');

    // 8. Attempt duplicate submission (must be rejected with 409)
    const dupRes = await fetchHttp('http://localhost:5000/api/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': authCookie,
        'X-CSRF-Token': authCsrf
      },
      body: JSON.stringify({
        matchId: 1,
        predictedTeam: 'Australia'
      })
    });
    assert('Duplicate prediction submission is rejected with 409 Conflict', dupRes.status === 409);

    // 9. Check user prediction after submission (should be true)
    const postCheck = await fetchHttp('http://localhost:5000/api/predictions/me/match/1', {
      headers: { 'Cookie': authCookie }
    });
    assert('Post-check reports hasPredicted: true', postCheck.status === 200 && postCheck.body.hasPredicted === true);
    assert('Post-check returns predictedTeam: India', postCheck.body.data.predictedTeam === 'India');

    // 10. Query user prediction history
    const historyRes = await fetchHttp('http://localhost:5000/api/predictions/me', {
      headers: { 'Cookie': authCookie }
    });
    assert('GET /api/predictions/me returns prediction history (200 OK)', historyRes.status === 200);
    assert('History contains 1 record with match details', historyRes.body.data.length === 1 && historyRes.body.data[0].matchId === 1);

    // 11. Clean up test user & predictions
    const userId = loginRes.body.user.id;
    await pool.query('DELETE FROM predictions WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = ?)', [userId]);
    await pool.query('DELETE FROM wallets WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM notifications WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    assert('Test data cleanup completed successfully', true);

  } catch (err) {
    console.error('E2E Verification Error:', err);
    failed++;
  }

  console.log('\n======================================================');
  console.log(` E2E Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runE2E();
