/**
 * TossArena Day 10: Prediction History, Prediction Details & User Statistics Tests
 * Comprehensive automated test suite verifying:
 * - Prediction history retrieval with search, filtering, sorting, and pagination
 * - Single prediction details endpoint with strict ownership authorization
 * - Authoritative user performance statistics calculation (accuracy %, distribution)
 * - Error handling, edge cases, SQL parameterization, and user isolation
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

async function createAuthenticatedSession(email, fullName = 'Day 10 Predictor') {
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

  return {
    userId: user.id,
    sessionCookie
  };
}

async function cleanupTestData() {
  const [testUsers] = await pool.query("SELECT id FROM users WHERE email LIKE '%@test-day10.internal'");
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
  await pool.query("DELETE FROM matches WHERE title LIKE '%[DAY10-TEST]%'");
}

async function runTests() {
  console.log('\n======================================================');
  console.log('   TossArena Day 10: Prediction History & Statistics Suite');
  console.log('======================================================\n');

  try {
    // 0. Clean any preexisting test fixtures
    await cleanupTestData();

    // 1. Create test fixtures (matches with different statuses and official toss results)
    const [openMatchRes] = await pool.query(
      `INSERT INTO matches (title, team_a, team_b, tournament_name, venue, scheduled_at, status, result_toss_winner, result_decision)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 DAY), ?, ?, ?)`,
      ['[DAY10-TEST] India vs Pakistan', 'India', 'Pakistan', 'Asia Cup', 'Dubai Stadium', 'open', null, null]
    );
    const openMatchId = openMatchRes.insertId;

    const [completedMatch1Res] = await pool.query(
      `INSERT INTO matches (title, team_a, team_b, tournament_name, venue, scheduled_at, status, result_toss_winner, result_decision)
       VALUES (?, ?, ?, ?, ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY), ?, ?, ?)`,
      ['[DAY10-TEST] Australia vs England', 'Australia', 'England', 'Ashes Series', "Lord's Ground", 'completed', 'Australia', 'bat']
    );
    const completedMatch1Id = completedMatch1Res.insertId;

    const [completedMatch2Res] = await pool.query(
      `INSERT INTO matches (title, team_a, team_b, tournament_name, venue, scheduled_at, status, result_toss_winner, result_decision)
       VALUES (?, ?, ?, ?, ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY), ?, ?, ?)`,
      ['[DAY10-TEST] South Africa vs New Zealand', 'South Africa', 'New Zealand', 'World Cup', 'Eden Park', 'completed', 'New Zealand', 'bowl']
    );
    const completedMatch2Id = completedMatch2Res.insertId;

    const [cancelledMatchRes] = await pool.query(
      `INSERT INTO matches (title, team_a, team_b, tournament_name, venue, scheduled_at, status, result_toss_winner, result_decision)
       VALUES (?, ?, ?, ?, ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 DAY), ?, ?, ?)`,
      ['[DAY10-TEST] Sri Lanka vs Bangladesh', 'Sri Lanka', 'Bangladesh', 'T20 Trophy', 'Colombo Oval', 'cancelled', null, null]
    );
    const cancelledMatchId = cancelledMatchRes.insertId;

    // 2. Provision two isolated test users
    const userA = await createAuthenticatedSession('user-a@test-day10.internal', 'Alice Analyst');
    const userB = await createAuthenticatedSession('user-b@test-day10.internal', 'Bob Better');

    // ------------------------------------------------------------------------
    // SECTION A: AUTHORIZATION & HISTORY RETRIEVAL
    // ------------------------------------------------------------------------

    // 1. Unauthenticated requests to /api/predictions and /api/predictions/statistics rejected with 401
    const unauthHistory = await request('/api/predictions');
    record('GET /api/predictions rejects unauthenticated request with 401', unauthHistory.status === 401);

    const unauthStats = await request('/api/predictions/statistics');
    record('GET /api/predictions/statistics rejects unauthenticated request with 401', unauthStats.status === 401);

    const unauthDetails = await request('/api/predictions/1');
    record('GET /api/predictions/:id rejects unauthenticated request with 401', unauthDetails.status === 401);

    // 2. User with no predictions returns valid empty history and empty stats
    const emptyHistoryRes = await request('/api/predictions', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Empty prediction history returns 200 with empty array and total 0',
      emptyHistoryRes.status === 200 &&
      Array.isArray(emptyHistoryRes.body.data) &&
      emptyHistoryRes.body.data.length === 0 &&
      emptyHistoryRes.body.pagination.total === 0
    );

    const emptyStatsRes = await request('/api/predictions/statistics', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Empty statistics handles zero predictions gracefully without error',
      emptyStatsRes.status === 200 &&
      emptyStatsRes.body.data.totalPredictions === 0 &&
      emptyStatsRes.body.data.accuracyPercentage === 0 &&
      emptyStatsRes.body.data.hasFinalizedOutcomes === false
    );

    // ------------------------------------------------------------------------
    // SECTION B: INSERT TEST PREDICTIONS FOR USER A & USER B
    // ------------------------------------------------------------------------

    // User A Prediction 1: Open match -> should be 'pending'
    const [p1] = await pool.query(
      `INSERT INTO predictions (user_id, match_id, predicted_toss_winner, demo_credits_used, status, created_at)
       VALUES (?, ?, 'India', 0.00, 'pending', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR))`,
      [userA.userId, openMatchId]
    );
    const pred1Id = p1.insertId;

    // User A Prediction 2: Australia vs England -> Picked 'Australia' (actual toss winner 'Australia') -> should be 'correct'
    const [p2] = await pool.query(
      `INSERT INTO predictions (user_id, match_id, predicted_toss_winner, demo_credits_used, status, created_at)
       VALUES (?, ?, 'Australia', 0.00, 'pending', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 25 HOUR))`,
      [userA.userId, completedMatch1Id]
    );
    const pred2Id = p2.insertId;

    // User A Prediction 3: South Africa vs New Zealand -> Picked 'South Africa' (actual toss winner 'New Zealand') -> should be 'incorrect'
    const [p3] = await pool.query(
      `INSERT INTO predictions (user_id, match_id, predicted_toss_winner, demo_credits_used, status, created_at)
       VALUES (?, ?, 'South Africa', 0.00, 'pending', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 50 HOUR))`,
      [userA.userId, completedMatch2Id]
    );
    const pred3Id = p3.insertId;

    // User A Prediction 4: Cancelled match -> should be 'void'
    const [p4] = await pool.query(
      `INSERT INTO predictions (user_id, match_id, predicted_toss_winner, demo_credits_used, status, created_at)
       VALUES (?, ?, 'Sri Lanka', 0.00, 'pending', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 75 HOUR))`,
      [userA.userId, cancelledMatchId]
    );
    const pred4Id = p4.insertId;

    // User B Prediction: Distinct prediction belonging to User B
    const [pb] = await pool.query(
      `INSERT INTO predictions (user_id, match_id, predicted_toss_winner, demo_credits_used, status, created_at)
       VALUES (?, ?, 'Pakistan', 0.00, 'pending', UTC_TIMESTAMP())`,
      [userB.userId, openMatchId]
    );
    const predBId = pb.insertId;

    // ------------------------------------------------------------------------
    // SECTION C: USER ISOLATION & HISTORY RETRIEVAL
    // ------------------------------------------------------------------------

    const userAHistoryRes = await request('/api/predictions', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('User A prediction history returns exactly User A predictions (4 records)',
      userAHistoryRes.status === 200 &&
      userAHistoryRes.body.data.length === 4 &&
      userAHistoryRes.body.pagination.total === 4
    );

    const userBHistoryRes = await request('/api/predictions', {
      headers: { Cookie: userB.sessionCookie }
    });
    record('User B history returns strictly User B records (1 record, isolation verified)',
      userBHistoryRes.status === 200 &&
      userBHistoryRes.body.data.length === 1 &&
      userBHistoryRes.body.data[0].id === predBId
    );

    // ------------------------------------------------------------------------
    // SECTION D: SEARCH, STATUS, DATE & SORT FILTERS
    // ------------------------------------------------------------------------

    // Search by team name "India"
    const searchRes = await request('/api/predictions?search=India', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Search by team name returns only matching predictions',
      searchRes.status === 200 &&
      searchRes.body.data.length === 1 &&
      searchRes.body.data[0].teamA === 'India'
    );

    // Search by tournament name "Ashes"
    const tourneySearchRes = await request('/api/predictions?search=Ashes', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Search by tournament name returns matching predictions',
      tourneySearchRes.status === 200 &&
      tourneySearchRes.body.data.length === 1 &&
      tourneySearchRes.body.data[0].tournamentName === 'Ashes Series'
    );

    // Status filter: pending
    const statusPendingRes = await request('/api/predictions?status=pending', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Filter status=pending returns only pending unresolved predictions',
      statusPendingRes.status === 200 &&
      statusPendingRes.body.data.length === 1 &&
      statusPendingRes.body.data[0].id === pred1Id &&
      statusPendingRes.body.data[0].status === 'pending'
    );

    // Status filter: correct
    const statusCorrectRes = await request('/api/predictions?status=correct', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Filter status=correct returns only verified correct predictions',
      statusCorrectRes.status === 200 &&
      statusCorrectRes.body.data.length === 1 &&
      statusCorrectRes.body.data[0].id === pred2Id &&
      statusCorrectRes.body.data[0].status === 'correct'
    );

    // Status filter: incorrect
    const statusIncorrectRes = await request('/api/predictions?status=incorrect', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Filter status=incorrect returns only verified incorrect predictions',
      statusIncorrectRes.status === 200 &&
      statusIncorrectRes.body.data.length === 1 &&
      statusIncorrectRes.body.data[0].id === pred3Id &&
      statusIncorrectRes.body.data[0].status === 'incorrect'
    );

    // Status filter: void
    const statusVoidRes = await request('/api/predictions?status=void', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Filter status=void returns voided / cancelled fixture predictions',
      statusVoidRes.status === 200 &&
      statusVoidRes.body.data.length === 1 &&
      statusVoidRes.body.data[0].id === pred4Id &&
      statusVoidRes.body.data[0].status === 'void'
    );

    // Invalid status filter rejected
    const invalidStatusRes = await request('/api/predictions?status=fabricated_win', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Invalid status filter is rejected with 400 Bad Request', invalidStatusRes.status === 400);

    // Date preset filter: last7days
    const presetRes = await request('/api/predictions?datePreset=last7days', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Valid datePreset=last7days returns predictions from the past week',
      presetRes.status === 200 && presetRes.body.data.length === 4
    );

    // Invalid date preset rejected
    const badPresetRes = await request('/api/predictions?datePreset=last1000years', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Invalid datePreset is rejected with 400 Bad Request', badPresetRes.status === 400);

    // Inverted date range rejected (dateFrom > dateTo)
    const badRangeRes = await request('/api/predictions?dateFrom=2026-12-01&dateTo=2026-01-01', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Inverted date range (dateFrom > dateTo) is rejected with 400', badRangeRes.status === 400);

    // Sort allowlist: oldest first
    const sortOldestRes = await request('/api/predictions?sort=oldest', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Sort oldest returns chronological order (p4 earliest -> p1 newest)',
      sortOldestRes.status === 200 &&
      sortOldestRes.body.data[0].id === pred4Id &&
      sortOldestRes.body.data[3].id === pred1Id
    );

    // Invalid sort rejected
    const badSortRes = await request('/api/predictions?sort=arbitrary_column_injection', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Invalid sort parameter is rejected with 400 Bad Request', badSortRes.status === 400);

    // Pagination: limit bounds results and calculates totalPages
    const pageRes = await request('/api/predictions?page=1&limit=2', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Pagination limit=2 returns exactly 2 records with totalPages=2',
      pageRes.status === 200 &&
      pageRes.body.data.length === 2 &&
      pageRes.body.pagination.total === 4 &&
      pageRes.body.pagination.totalPages === 2
    );

    // Pagination: second page
    const page2Res = await request('/api/predictions?page=2&limit=2', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('Pagination page=2 returns remaining 2 records',
      page2Res.status === 200 &&
      page2Res.body.data.length === 2 &&
      page2Res.body.pagination.page === 2
    );

    // ------------------------------------------------------------------------
    // SECTION E: PREDICTION DETAILS & IDOR DEFENSE
    // ------------------------------------------------------------------------

    // User A can access their own prediction details
    const detailsRes = await request(`/api/predictions/${pred2Id}`, {
      headers: { Cookie: userA.sessionCookie }
    });
    record('GET /api/predictions/:id retrieves full details for owner',
      detailsRes.status === 200 &&
      detailsRes.body.data.id === pred2Id &&
      detailsRes.body.data.predictedTeam === 'Australia' &&
      detailsRes.body.data.status === 'correct' &&
      detailsRes.body.data.match.resultTossWinner === 'Australia'
    );

    // Nonexistent prediction returns 404
    const notFoundDetails = await request('/api/predictions/999999', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('GET /api/predictions/:id returns 404 for nonexistent prediction', notFoundDetails.status === 404);

    // Invalid prediction ID rejected with 400
    const malformedDetails = await request('/api/predictions/invalid-id', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('GET /api/predictions/:id rejects non-numeric ID with 400', malformedDetails.status === 400);

    // IDOR Defense: User A CANNOT retrieve User B's prediction
    const idorRes = await request(`/api/predictions/${predBId}`, {
      headers: { Cookie: userA.sessionCookie }
    });
    record('IDOR defense: User A accessing User B prediction returns 404 without data leak',
      idorRes.status === 404 && idorRes.body.success === false
    );

    // ------------------------------------------------------------------------
    // SECTION F: STATISTICS & ACCURACY CALCULATION
    // ------------------------------------------------------------------------

    const statsRes = await request('/api/predictions/statistics', {
      headers: { Cookie: userA.sessionCookie }
    });
    const s = statsRes.body.data || {};

    record('Statistics accurately calculates total predictions (4)', s.totalPredictions === 4);
    record('Statistics accurately counts pending predictions (1)', s.pendingPredictions === 1);
    record('Statistics accurately counts correct predictions (1)', s.correctPredictions === 1);
    record('Statistics accurately counts incorrect predictions (1)', s.incorrectPredictions === 1);
    record('Statistics accurately counts voided predictions (1)', s.voidedPredictions === 1);
    record('Statistics counts finalized non-void predictions (2: 1 correct + 1 incorrect)', s.finalizedPredictions === 2);

    // Accuracy: Correct / (Correct + Incorrect) * 100 = 1 / (1 + 1) * 100 = 50.0%
    record('Accuracy excludes pending & void: 1 correct out of 2 finalized = 50.0%',
      s.accuracyPercentage === 50.0 && s.hasFinalizedOutcomes === true
    );

    // Verify /api/dashboard/statistics alias works identically
    const dashStatsRes = await request('/api/dashboard/statistics', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('GET /api/dashboard/statistics returns identical authoritative statistics',
      dashStatsRes.status === 200 && dashStatsRes.body.data.totalPredictions === 4
    );

    // Day 7 backwards compatibility route /api/predictions/me
    const meRes = await request('/api/predictions/me', {
      headers: { Cookie: userA.sessionCookie }
    });
    record('GET /api/predictions/me backward compatibility preserved',
      meRes.status === 200 && Array.isArray(meRes.body.data) && meRes.body.data.length === 4
    );

  } catch (err) {
    console.error('Test execution exception:', err);
    failedTests++;
  } finally {
    // Cleanup test records
    await cleanupTestData();

    console.log('\n======================================================');
    console.log(` Prediction History Test Summary: ${passedTests} Passed, ${failedTests} Failed`);
    console.log('======================================================\n');

    if (serverInstance) serverInstance.close();
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

// Start dedicated test server on ephemeral port
new Promise((resolve) => {
  serverInstance = app.listen(0, '127.0.0.1', () => resolve(serverInstance));
}).then(() => {
  const port = serverInstance.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  runTests();
});
