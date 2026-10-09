/**
 * TossArena Day 7 Prediction Engine Test Suite
 * Automated tests for prediction submission, authentication, CSRF, validation,
 * match eligibility/locking, one-prediction uniqueness, user isolation, and history.
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

// Clean up test data safely
async function cleanupTestData() {
  // Delete test predictions
  await pool.query(`
    DELETE FROM predictions WHERE user_id IN (
      SELECT id FROM users WHERE email LIKE '%@test-predictions.internal'
    )
  `);

  // Delete test matches
  await pool.query(`DELETE FROM matches WHERE title LIKE '[TEST-PRED]%'`);

  // Delete test users (cascades wallets etc)
  const [testUsers] = await pool.query("SELECT id FROM users WHERE email LIKE '%@test-predictions.internal'");
  if (testUsers.length > 0) {
    const userIds = testUsers.map(u => u.id);
    const placeholders = userIds.map(() => '?').join(',');
    await pool.query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id IN (${placeholders}))`, userIds);
    await pool.query(`DELETE FROM wallets WHERE user_id IN (${placeholders})`, userIds);
    await pool.query(`DELETE FROM notifications WHERE user_id IN (${placeholders})`, userIds);
    await pool.query(`DELETE FROM audit_logs WHERE actor_user_id IN (${placeholders})`, userIds);
    await pool.query(`DELETE FROM users WHERE id IN (${placeholders})`, userIds);
  }
}

// Helper to register and log in a user session with CSRF token
async function createAuthenticatedSession(email, fullName = 'Test Predictor') {
  const password = 'StrongPassword123!';

  // 1. Get initial CSRF token
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

  // 3. Login to create authenticated session
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'Cookie': initialCookie,
      'X-CSRF-Token': initialCsrf
    },
    body: JSON.stringify({
      email,
      password
    })
  });

  const loggedInCookie = extractCookie(loginRes.cookies);
  const authCsrfToken = loginRes.body.csrfToken;

  return {
    userId: loginRes.body.user.id,
    cookie: loggedInCookie,
    csrfToken: authCsrfToken
  };
}

async function runTests() {
  console.log('\n======================================================');
  console.log('   TossArena Day 7: Prediction Engine Test Suite');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function record(desc, cond) {
    if (cond) {
      console.log(`• ${desc} ... ✔ PASSED`);
      passed++;
    } else {
      console.error(`• ${desc} ... ❌ FAILED`);
      failed++;
    }
  }

  // Start dedicated test server
  serverInstance = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = serverInstance.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    await cleanupTestData();

    // Setup Test Matches in various states
    const [openMatchRes] = await pool.query(`
      INSERT INTO matches (title, team_a, team_b, tournament_name, venue, scheduled_at, status)
      VALUES ('[TEST-PRED] India vs Pakistan', 'India', 'Pakistan', 'Asia Cup Demo', 'Dubai Stadium', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 DAY), 'open')
    `);
    const openMatchId = openMatchRes.insertId;

    const [lockedMatchRes] = await pool.query(`
      INSERT INTO matches (title, team_a, team_b, tournament_name, venue, scheduled_at, status)
      VALUES ('[TEST-PRED] Australia vs England', 'Australia', 'England', 'Ashes Demo', 'Sydney Ground', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY), 'locked')
    `);
    const lockedMatchId = lockedMatchRes.insertId;

    const [completedMatchRes] = await pool.query(`
      INSERT INTO matches (title, team_a, team_b, tournament_name, venue, scheduled_at, status, result_toss_winner, result_decision)
      VALUES ('[TEST-PRED] NZ vs SA', 'New Zealand', 'South Africa', 'Super Series', 'Eden Park', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY), 'completed', 'New Zealand', 'bat')
    `);
    const completedMatchId = completedMatchRes.insertId;

    const [cancelledMatchRes] = await pool.query(`
      INSERT INTO matches (title, team_a, team_b, tournament_name, venue, scheduled_at, status)
      VALUES ('[TEST-PRED] Sri Lanka vs WI', 'Sri Lanka', 'West Indies', 'T20 Cup', 'Colombo Ground', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 DAY), 'cancelled')
    `);
    const cancelledMatchId = cancelledMatchRes.insertId;

    const [upcomingMatchRes] = await pool.query(`
      INSERT INTO matches (title, team_a, team_b, tournament_name, venue, scheduled_at, status)
      VALUES ('[TEST-PRED] Bangladesh vs Ireland', 'Bangladesh', 'Ireland', 'Bilateral Series', 'Mirpur', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 4 DAY), 'upcoming')
    `);
    const upcomingMatchId = upcomingMatchRes.insertId;

    // Create two test user sessions
    const userA = await createAuthenticatedSession('user-a@test-predictions.internal', 'Predictor Alpha');
    const userB = await createAuthenticatedSession('user-b@test-predictions.internal', 'Predictor Beta');

    // ------------------------------------------------------------------------
    // SECTION A: Authentication & CSRF
    // ------------------------------------------------------------------------

    // 1. Unauthenticated prediction rejected with 401
    const unauthRes = await request('/api/predictions', {
      method: 'POST',
      body: JSON.stringify({ matchId: openMatchId, predictedTeam: 'India' })
    });
    record('POST /api/predictions rejects unauthenticated user with 401', unauthRes.status === 401);

    // 2. Missing CSRF token rejected with 403
    const noCsrfRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userA.cookie },
      body: JSON.stringify({ matchId: openMatchId, predictedTeam: 'India' })
    });
    record('POST /api/predictions without CSRF token is rejected with 403', noCsrfRes.status === 403);

    // 3. GET /api/predictions/me rejects unauthenticated user with 401
    const unauthHistory = await request('/api/predictions/me');
    record('GET /api/predictions/me rejects unauthenticated request with 401', unauthHistory.status === 401);

    // ------------------------------------------------------------------------
    // SECTION B: Input Validation
    // ------------------------------------------------------------------------

    // 4. Missing match ID rejected with 400
    const missingMatchRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userA.cookie, 'X-CSRF-Token': userA.csrfToken },
      body: JSON.stringify({ predictedTeam: 'India' })
    });
    record('POST /api/predictions rejects missing matchId with 400', missingMatchRes.status === 400);

    // 5. Malformed match ID rejected with 400
    const badMatchRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userA.cookie, 'X-CSRF-Token': userA.csrfToken },
      body: JSON.stringify({ matchId: 'abc-not-id', predictedTeam: 'India' })
    });
    record('POST /api/predictions rejects malformed matchId with 400', badMatchRes.status === 400);

    // 6. Missing predicted team rejected with 400
    const missingTeamRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userA.cookie, 'X-CSRF-Token': userA.csrfToken },
      body: JSON.stringify({ matchId: openMatchId })
    });
    record('POST /api/predictions rejects missing predictedTeam with 400', missingTeamRes.status === 400);

    // 7. Invalid team selection (not in match) rejected with 422
    const invalidTeamRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userA.cookie, 'X-CSRF-Token': userA.csrfToken },
      body: JSON.stringify({ matchId: openMatchId, predictedTeam: 'Zimbabwe' })
    });
    record('POST /api/predictions rejects team not in match with 422', invalidTeamRes.status === 422);

    // ------------------------------------------------------------------------
    // SECTION C: Match Eligibility & Locking
    // ------------------------------------------------------------------------

    // 8. Nonexistent match rejected with 404
    const notFoundRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userA.cookie, 'X-CSRF-Token': userA.csrfToken },
      body: JSON.stringify({ matchId: 999999, predictedTeam: 'India' })
    });
    record('POST /api/predictions rejects nonexistent match with 404', notFoundRes.status === 404);

    // 9. Locked match rejected with 409
    const lockedRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userA.cookie, 'X-CSRF-Token': userA.csrfToken },
      body: JSON.stringify({ matchId: lockedMatchId, predictedTeam: 'Australia' })
    });
    record('POST /api/predictions rejects locked match with 409', lockedRes.status === 409);

    // 10. Completed match rejected with 409
    const completedRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userA.cookie, 'X-CSRF-Token': userA.csrfToken },
      body: JSON.stringify({ matchId: completedMatchId, predictedTeam: 'New Zealand' })
    });
    record('POST /api/predictions rejects completed match with 409', completedRes.status === 409);

    // 11. Cancelled match rejected with 409
    const cancelledRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userA.cookie, 'X-CSRF-Token': userA.csrfToken },
      body: JSON.stringify({ matchId: cancelledMatchId, predictedTeam: 'Sri Lanka' })
    });
    record('POST /api/predictions rejects cancelled match with 409', cancelledRes.status === 409);

    // 12. Upcoming (not yet open) match rejected with 422
    const upcomingRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userA.cookie, 'X-CSRF-Token': userA.csrfToken },
      body: JSON.stringify({ matchId: upcomingMatchId, predictedTeam: 'Bangladesh' })
    });
    record('POST /api/predictions rejects upcoming match not open for predictions with 422', upcomingRes.status === 422);

    // ------------------------------------------------------------------------
    // SECTION D: Valid Prediction & Uniqueness Enforcement
    // ------------------------------------------------------------------------

    // 13. Valid prediction on open match succeeds with 201 Created
    const validPredRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userA.cookie, 'X-CSRF-Token': userA.csrfToken },
      body: JSON.stringify({ matchId: openMatchId, predictedTeam: 'India' })
    });
    record('POST /api/predictions succeeds for eligible open match with 201 Created', validPredRes.status === 201 && validPredRes.body.success === true);
    record('Response returns persisted prediction data with pending status', validPredRes.body.data.predictedTeam === 'India' && validPredRes.body.data.status === 'pending');

    // 14. Duplicate prediction by same user on same match is rejected with 409
    const dupPredRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userA.cookie, 'X-CSRF-Token': userA.csrfToken },
      body: JSON.stringify({ matchId: openMatchId, predictedTeam: 'Pakistan' })
    });
    record('Duplicate prediction submission is rejected with 409 Conflict', dupPredRes.status === 409);

    // 15. Client-supplied user ID cannot spoof ownership
    // User B tries to submit passing a body userId pointing to userA
    const spoofRes = await request('/api/predictions', {
      method: 'POST',
      headers: { 'Cookie': userB.cookie, 'X-CSRF-Token': userB.csrfToken },
      body: JSON.stringify({ matchId: openMatchId, predictedTeam: 'Pakistan', userId: userA.userId })
    });
    record('Client cannot spoof userId; prediction is assigned to authenticated session user (User B)', spoofRes.status === 201);

    // Verify in DB that User B owns the second prediction
    const [bRows] = await pool.query('SELECT user_id, predicted_toss_winner FROM predictions WHERE id = ?', [spoofRes.body.data.id]);
    record('Database confirms prediction ownership is bound to session user ID', bRows[0].user_id === userB.userId);

    // ------------------------------------------------------------------------
    // SECTION E: Status Query & History Isolation
    // ------------------------------------------------------------------------

    // 16. Check prediction for specific match: User A has predicted
    const matchCheckA = await request(`/api/predictions/me/match/${openMatchId}`, {
      headers: { 'Cookie': userA.cookie }
    });
    record('GET /api/predictions/me/match/:id returns hasPredicted: true for predicted match', matchCheckA.status === 200 && matchCheckA.body.hasPredicted === true);
    record('Correct predicted team is returned in match check', matchCheckA.body.data.predictedTeam === 'India');

    // 17. Check prediction for unpredicted match: hasPredicted: false
    const matchCheckUnpred = await request(`/api/predictions/me/match/${lockedMatchId}`, {
      headers: { 'Cookie': userA.cookie }
    });
    record('GET /api/predictions/me/match/:id returns hasPredicted: false when not predicted', matchCheckUnpred.status === 200 && matchCheckUnpred.body.hasPredicted === false);

    // 18. Retrieve prediction history for User A
    const historyA = await request('/api/predictions/me', {
      headers: { 'Cookie': userA.cookie }
    });
    record('GET /api/predictions/me returns prediction history array', historyA.status === 200 && Array.isArray(historyA.body.data));
    record('User A history contains exactly 1 prediction', historyA.body.data.length === 1 && historyA.body.data[0].predictedTeam === 'India');
    record('History includes joined match metadata (title, teams, venue, scheduledAt)', historyA.body.data[0].matchTitle && historyA.body.data[0].venue);

    // 19. User isolation: User B history does not contain User A records
    const historyB = await request('/api/predictions/me', {
      headers: { 'Cookie': userB.cookie }
    });
    record('User isolation: User B history only returns User B prediction', historyB.body.data.length === 1 && historyB.body.data[0].predictedTeam === 'Pakistan');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    await cleanupTestData();
    if (serverInstance) {
      await new Promise(r => serverInstance.close(r));
    }
  }

  console.log('\n======================================================');
  console.log(` Prediction Engine Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTests();
