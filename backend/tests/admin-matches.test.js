/**
 * TossArena Day 11: Admin Match Management System Tests
 * Comprehensive automated test suite verifying:
 * - Admin authentication and role authorization enforcement
 * - Match listing, search, status filtering, date filtering, and pagination
 * - Summary statistics calculation from MySQL
 * - Match creation validation (distinct teams, future schedule, sanitized input)
 * - Match editing with prediction protection (team rename prevention with active predictions)
 * - Match status lifecycle transitions and prediction locking enforcement
 * - Safe match cancellation preserving historical predictions
 * - Audit log persistence in audit_logs table
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
    userId: user.id,
    sessionCookie,
    csrfToken: sessionCsrf
  };
}

async function cleanupTestData() {
  const [testUsers] = await pool.query("SELECT id FROM users WHERE email LIKE '%@test-day11.internal'");
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
  await pool.query("DELETE FROM predictions WHERE match_id IN (SELECT id FROM matches WHERE title LIKE '%[DAY11-TEST]%')");
  await pool.query("DELETE FROM audit_logs WHERE entity_type = 'match' AND entity_id IN (SELECT id FROM matches WHERE title LIKE '%[DAY11-TEST]%')");
  await pool.query("DELETE FROM matches WHERE title LIKE '%[DAY11-TEST]%'");
}

async function runTests() {
  console.log('\n======================================================');
  console.log('   TossArena Day 11: Admin Match Management Test Suite');
  console.log('======================================================\n');

  try {
    await cleanupTestData();

    // 1. Create a regular user and an admin user
    const regularUser = await createAuthenticatedSession('regular@test-day11.internal', 'user', 'Regular User');
    const adminUser = await createAuthenticatedSession('admin@test-day11.internal', 'admin', 'Admin Super');

    // -------------------------------------------------------------------------
    // TEST SECTION A: AUTHORIZATION CHECKS
    // -------------------------------------------------------------------------
    console.log('\n--- Section A: Authorization & Access Control ---');

    // A1: Unauthenticated request rejected with 401
    const unauthRes = await request('/api/admin/matches');
    record(
      'A1: Unauthenticated user rejected with 401 Unauthorized',
      unauthRes.status === 401 && unauthRes.body?.success === false,
      `Status: ${unauthRes.status}`
    );

    // A2: Authenticated non-admin rejected with 403 Forbidden
    const forbiddenRes = await request('/api/admin/matches', {
      headers: { 'Cookie': regularUser.sessionCookie }
    });
    record(
      'A2: Authenticated non-admin rejected with 403 Forbidden',
      forbiddenRes.status === 403 && forbiddenRes.body?.code === 'FORBIDDEN',
      `Status: ${forbiddenRes.status}, code: ${forbiddenRes.body?.code}`
    );

    // A3: Client role tampering in headers/body cannot grant admin access
    const tamperedRes = await request('/api/admin/matches', {
      headers: {
        'Cookie': regularUser.sessionCookie,
        'X-User-Role': 'admin'
      }
    });
    record(
      'A3: Client cannot elevate privileges by supplying custom headers',
      tamperedRes.status === 403,
      `Status: ${tamperedRes.status}`
    );

    // A4: Authenticated admin allowed access (200 OK)
    const adminAccessRes = await request('/api/admin/matches', {
      headers: { 'Cookie': adminUser.sessionCookie }
    });
    record(
      'A4: Authorized administrator receives 200 OK',
      adminAccessRes.status === 200 && adminAccessRes.body?.success === true,
      `Status: ${adminAccessRes.status}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION B: MATCH CREATION WORKFLOW
    // -------------------------------------------------------------------------
    console.log('\n--- Section B: Match Creation Workflow ---');

    // B1: Reject missing required fields
    const missingFieldsRes = await request('/api/admin/matches', {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        teamA: 'India'
        // Missing teamB, venue, scheduledAt
      })
    });
    record(
      'B1: Reject match creation when required fields are missing (400)',
      missingFieldsRes.status === 400 && missingFieldsRes.body?.code === 'VALIDATION_ERROR',
      `Status: ${missingFieldsRes.status}, message: ${missingFieldsRes.body?.message}`
    );

    // B2: Reject identical teams (India vs India)
    const identicalTeamsRes = await request('/api/admin/matches', {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        teamA: 'India',
        teamB: 'India',
        tournamentName: 'T20 World Cup [DAY11-TEST]',
        venue: 'Eden Gardens',
        scheduledAt: new Date(Date.now() + 86400000 * 2).toISOString()
      })
    });
    record(
      'B2: Reject match creation when teams are identical (400 IDENTICAL_TEAMS)',
      identicalTeamsRes.status === 400 && identicalTeamsRes.body?.code === 'IDENTICAL_TEAMS',
      `Status: ${identicalTeamsRes.status}, code: ${identicalTeamsRes.body?.code}`
    );

    // B3: Reject past scheduled date for creation
    const pastDateRes = await request('/api/admin/matches', {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        teamA: 'India',
        teamB: 'Australia',
        tournamentName: 'Test Championship [DAY11-TEST]',
        venue: 'Melbourne',
        scheduledAt: new Date(Date.now() - 86400000).toISOString()
      })
    });
    record(
      'B3: Reject match creation with past scheduled date (400 INVALID_SCHEDULE_DATE)',
      pastDateRes.status === 400 && pastDateRes.body?.code === 'INVALID_SCHEDULE_DATE',
      `Status: ${pastDateRes.status}, code: ${pastDateRes.body?.code}`
    );

    // B4: Reject invalid status value
    const invalidStatusRes = await request('/api/admin/matches', {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        teamA: 'India',
        teamB: 'Australia',
        tournamentName: 'Bilateral Series [DAY11-TEST]',
        venue: 'Wankhede Stadium',
        scheduledAt: new Date(Date.now() + 86400000 * 3).toISOString(),
        status: 'arbitrary_status'
      })
    });
    record(
      'B4: Reject match creation with unsupported status (400 INVALID_INITIAL_STATUS)',
      invalidStatusRes.status === 400 && invalidStatusRes.body?.code === 'INVALID_INITIAL_STATUS',
      `Status: ${invalidStatusRes.status}, code: ${invalidStatusRes.body?.code}`
    );

    // B5: Successful match creation with valid parameters
    const futureDate = new Date(Date.now() + 86400000 * 4).toISOString();
    const createSuccessRes = await request('/api/admin/matches', {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        teamA: 'India',
        teamB: 'Australia',
        tournamentName: 'ICC World Cup [DAY11-TEST]',
        venue: 'Narendra Modi Stadium, Ahmedabad',
        scheduledAt: futureDate,
        status: 'upcoming'
      })
    });

    const createdMatchId = createSuccessRes.body?.data?.id;
    record(
      'B5: Successfully create match fixture with valid parameters (201 Created)',
      createSuccessRes.status === 201 && createdMatchId && createSuccessRes.body?.data?.title === 'India vs Australia',
      `Status: ${createSuccessRes.status}, matchId: ${createdMatchId}`
    );

    // B6: Verify audit log entry was created for match_created
    const [auditEntries] = await pool.query(
      "SELECT * FROM audit_logs WHERE entity_type = 'match' AND entity_id = ? AND action = 'match_created'",
      [createdMatchId]
    );
    record(
      'B6: Audit log recorded for match_created with actor ID and metadata',
      auditEntries.length === 1 && auditEntries[0].actor_user_id === adminUser.userId,
      `Entries found: ${auditEntries.length}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION C: LISTING, SEARCH, FILTERS & METRICS
    // -------------------------------------------------------------------------
    console.log('\n--- Section C: Listing, Filters, Search & Summary Metrics ---');

    // Create a second match fixture in 'open' status
    const openMatchDate = new Date(Date.now() + 86400000 * 2).toISOString();
    const createOpenRes = await request('/api/admin/matches', {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        teamA: 'England',
        teamB: 'South Africa',
        tournamentName: 'Champions Trophy [DAY11-TEST]',
        venue: 'Lord\'s Cricket Ground',
        scheduledAt: openMatchDate,
        status: 'open'
      })
    });
    const openMatchId = createOpenRes.body?.data?.id;

    // C1: Search by team name returns only matching matches
    const searchRes = await request('/api/admin/matches?search=England', {
      headers: { 'Cookie': adminUser.sessionCookie }
    });
    const foundEngland = searchRes.body?.data?.some(m => (m.teamA || m.team_a) === 'England' || (m.teamB || m.team_b) === 'England');
    const foundOnlyMatching = searchRes.body?.data?.every(m =>
      (m.title && m.title.toLowerCase().includes('england')) ||
      ((m.teamA || m.team_a) && (m.teamA || m.team_a).toLowerCase().includes('england')) ||
      ((m.teamB || m.team_b) && (m.teamB || m.team_b).toLowerCase().includes('england'))
    );
    record(
      'C1: Parameterized search filters matches by team or title accurately',
      searchRes.status === 200 && foundEngland && foundOnlyMatching,
      `Total returned: ${searchRes.body?.pagination?.total}`
    );

    // C2: Filter by status returns matches matching that status
    const filterStatusRes = await request('/api/admin/matches?status=open', {
      headers: { 'Cookie': adminUser.sessionCookie }
    });
    const allOpen = filterStatusRes.body?.data?.every(m => m.status === 'open');
    record(
      'C2: Status filter strictly returns matches with status=open',
      filterStatusRes.status === 200 && allOpen && filterStatusRes.body?.data?.length > 0,
      `Returned count: ${filterStatusRes.body?.data?.length}`
    );

    // C3: Summary endpoint returns actual database counts
    const summaryRes = await request('/api/admin/matches/summary', {
      headers: { 'Cookie': adminUser.sessionCookie }
    });
    const summary = summaryRes.body?.data;
    record(
      'C3: GET /api/admin/matches/summary returns valid aggregate breakdown from MySQL',
      summaryRes.status === 200 &&
      summary &&
      typeof summary.total === 'number' &&
      typeof summary.open === 'number' &&
      typeof summary.upcoming === 'number',
      `Summary counts: total=${summary?.total}, open=${summary?.open}, upcoming=${summary?.upcoming}`
    );

    // C4: Single match details by ID includes predictions count
    const detailRes = await request(`/api/admin/matches/${openMatchId}`, {
      headers: { 'Cookie': adminUser.sessionCookie }
    });
    const predCount = detailRes.body?.data?.prediction_count ?? detailRes.body?.data?.predictionCount;
    record(
      'C4: GET /api/admin/matches/:id returns match details with prediction statistics',
      detailRes.status === 200 && detailRes.body?.data?.id === openMatchId && typeof predCount === 'number',
      `Match title: ${detailRes.body?.data?.title}, predictions: ${predCount}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION D: EDIT MATCH & PREDICTION INTEGRITY PROTECTION
    // -------------------------------------------------------------------------
    console.log('\n--- Section D: Match Editing & Prediction Protection ---');

    // D1: Edit venue and tournament of match without predictions succeeds
    const editVenueRes = await request(`/api/admin/matches/${createdMatchId}`, {
      method: 'PATCH',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        venue: 'Updated Stadium, Ahmedabad',
        tournamentName: 'ICC World Cup Final [DAY11-TEST]'
      })
    });
    record(
      'D1: Update venue and tournament of match without predictions (200 OK)',
      editVenueRes.status === 200 && editVenueRes.body?.data?.venue === 'Updated Stadium, Ahmedabad',
      `Status: ${editVenueRes.status}, Venue: ${editVenueRes.body?.data?.venue}`
    );

    // Now, let's submit a prediction on `openMatchId` from regularUser
    // First, verify user has credits or fund wallet simulation
    const [walletRows] = await pool.query('SELECT id, balance FROM wallets WHERE user_id = ?', [regularUser.userId]);
    if (walletRows.length === 0 || Number(walletRows[0].balance) < 100) {
      await pool.query('UPDATE wallets SET balance = balance + 1000 WHERE user_id = ?', [regularUser.userId]);
    }

    const predictionSubmitRes = await request('/api/predictions', {
      method: 'POST',
      headers: {
        'Cookie': regularUser.sessionCookie,
        'X-CSRF-Token': regularUser.csrfToken
      },
      body: JSON.stringify({
        matchId: openMatchId,
        predictedTeam: 'England',
        stakeCredits: 100
      })
    });
    record(
      'D2: Submit valid toss prediction on open match for prediction protection test',
      predictionSubmitRes.status === 201 && predictionSubmitRes.body?.success === true,
      `Status: ${predictionSubmitRes.status}, message: ${predictionSubmitRes.body?.message}`
    );

    // D3: Attempting to rename teamA or teamB on a match with active predictions MUST FAIL (409 Conflict)
    const dangerousRenameRes = await request(`/api/admin/matches/${openMatchId}`, {
      method: 'PATCH',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        teamA: 'New Zealand' // Renaming England to New Zealand would corrupt historical user prediction!
      })
    });
    record(
      'D3: Reject team rename on match with active predictions (409 Conflict)',
      dangerousRenameRes.status === 409 && dangerousRenameRes.body?.code === 'CANNOT_RENAME_TEAMS_WITH_EXISTING_PREDICTIONS',
      `Status: ${dangerousRenameRes.status}, code: ${dangerousRenameRes.body?.code}`
    );

    // D4: Non-team fields (venue, tournament) CAN still be safely edited even if predictions exist
    const safeEditWithPredictionsRes = await request(`/api/admin/matches/${openMatchId}`, {
      method: 'PATCH',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        venue: 'Lord\'s Cricket Ground (Renovated)'
      })
    });
    record(
      'D4: Permitted metadata (venue) update succeeds even when match has predictions',
      safeEditWithPredictionsRes.status === 200 && safeEditWithPredictionsRes.body?.data?.venue === 'Lord\'s Cricket Ground (Renovated)',
      `Status: ${safeEditWithPredictionsRes.status}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION E: STATUS LIFECYCLE CONTROLS & PREDICTION LOCKING
    // -------------------------------------------------------------------------
    console.log('\n--- Section E: Status Lifecycle & Prediction Locking ---');

    // E1: Transition status from 'upcoming' -> 'open'
    const statusToOpenRes = await request(`/api/admin/matches/${createdMatchId}/status`, {
      method: 'PATCH',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({ status: 'open' })
    });
    record(
      'E1: Transition match status from upcoming -> open (200 OK)',
      statusToOpenRes.status === 200 && statusToOpenRes.body?.data?.status === 'open',
      `Status: ${statusToOpenRes.body?.data?.status}`
    );

    // E2: Transition status from 'open' -> 'locked'
    const statusToLockedRes = await request(`/api/admin/matches/${openMatchId}/status`, {
      method: 'PATCH',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({ status: 'locked' })
    });
    record(
      'E2: Transition match status from open -> locked (200 OK)',
      statusToLockedRes.status === 200 && statusToLockedRes.body?.data?.status === 'locked',
      `Status: ${statusToLockedRes.body?.data?.status}`
    );

    // E3: Locked match rejects new prediction submissions through prediction engine
    const blockedPredictionRes = await request('/api/predictions', {
      method: 'POST',
      headers: {
        'Cookie': regularUser.sessionCookie,
        'X-CSRF-Token': regularUser.csrfToken
      },
      body: JSON.stringify({
        matchId: openMatchId,
        predictedTeam: 'South Africa',
        stakeCredits: 50
      })
    });
    record(
      'E3: Locked match rejects new predictions in prediction engine (400/409)',
      (blockedPredictionRes.status === 400 || blockedPredictionRes.status === 409),
      `Status: ${blockedPredictionRes.status}, message: ${blockedPredictionRes.body?.message}`
    );

    // E4: Transition status from 'locked' -> 'completed'
    const statusToCompletedRes = await request(`/api/admin/matches/${openMatchId}/status`, {
      method: 'PATCH',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({ status: 'completed' })
    });
    record(
      'E4: Transition match status from locked -> completed (200 OK)',
      statusToCompletedRes.status === 200 && statusToCompletedRes.body?.data?.status === 'completed',
      `Status: ${statusToCompletedRes.body?.data?.status}`
    );

    // E5: Completed is a terminal state - rejecting transition from completed -> open
    const invalidReopenRes = await request(`/api/admin/matches/${openMatchId}/status`, {
      method: 'PATCH',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({ status: 'open' })
    });
    record(
      'E5: Completed match is immutable - reject reopening to open (400/409)',
      (invalidReopenRes.status === 400 || invalidReopenRes.status === 409),
      `Status: ${invalidReopenRes.status}, code: ${invalidReopenRes.body?.code}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION F: CANCELLATION WORKFLOW
    // -------------------------------------------------------------------------
    console.log('\n--- Section F: Cancellation Workflow ---');

    // Create a match specifically for cancellation test
    const cancelTargetDate = new Date(Date.now() + 86400000 * 5).toISOString();
    const createCancelTargetRes = await request('/api/admin/matches', {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        teamA: 'Pakistan',
        teamB: 'Sri Lanka',
        tournamentName: 'Asia Cup [DAY11-TEST]',
        venue: 'Gaddafi Stadium, Lahore',
        scheduledAt: cancelTargetDate,
        status: 'open'
      })
    });
    const cancelMatchId = createCancelTargetRes.body?.data?.id;

    // Add a prediction to this match before cancellation
    await request('/api/predictions', {
      method: 'POST',
      headers: {
        'Cookie': regularUser.sessionCookie,
        'X-CSRF-Token': regularUser.csrfToken
      },
      body: JSON.stringify({
        matchId: cancelMatchId,
        predictedTeam: 'Pakistan',
        stakeCredits: 100
      })
    });

    // F1: Safely cancel match fixture with reason
    const cancelRes = await request(`/api/admin/matches/${cancelMatchId}/cancel`, {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        reason: 'Match cancelled due to persistent rain and adverse weather conditions.'
      })
    });
    record(
      'F1: Cancel match fixture successfully with audit reason (200 OK)',
      cancelRes.status === 200 && cancelRes.body?.data?.status === 'cancelled',
      `Status: ${cancelRes.status}, Match status: ${cancelRes.body?.data?.status}`
    );

    // F2: Verify historical predictions for the cancelled match are preserved
    const [preservedPredictions] = await pool.query(
      'SELECT id, predicted_toss_winner, status FROM predictions WHERE match_id = ?',
      [cancelMatchId]
    );
    record(
      'F2: Historical predictions are intact and preserved after match cancellation',
      preservedPredictions.length === 1 && preservedPredictions[0].predicted_toss_winner === 'Pakistan',
      `Preserved count: ${preservedPredictions.length}`
    );

    // F3: Reject cancellation on already cancelled match
    const duplicateCancelRes = await request(`/api/admin/matches/${cancelMatchId}/cancel`, {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({ reason: 'Duplicate attempt' })
    });
    record(
      'F3: Reject cancellation on already cancelled match (400 CANNOT_CANCEL_TERMINAL_MATCH)',
      duplicateCancelRes.status === 400 && duplicateCancelRes.body?.code === 'CANNOT_CANCEL_TERMINAL_MATCH',
      `Status: ${duplicateCancelRes.status}, code: ${duplicateCancelRes.body?.code}`
    );

    // F4: Audit log recorded for match_cancelled
    const [cancelAudits] = await pool.query(
      "SELECT * FROM audit_logs WHERE entity_type = 'match' AND entity_id = ? AND action = 'match_cancelled'",
      [cancelMatchId]
    );
    record(
      'F4: Audit log recorded for match_cancelled with cancellation reason',
      cancelAudits.length === 1 && cancelAudits[0].actor_user_id === adminUser.userId,
      `Audits found: ${cancelAudits.length}`
    );

  } catch (err) {
    console.error('Fatal error during test run:', err);
    failedTests++;
  } finally {
    // Teardown
    await cleanupTestData();
  }

  console.log('\n------------------------------------------------------');
  console.log(`TOTAL PASSED: ${passedTests}`);
  console.log(`TOTAL FAILED: ${failedTests}`);
  console.log('------------------------------------------------------\n');

  if (serverInstance) {
    serverInstance.close();
  }

  process.exit(failedTests > 0 ? 1 : 0);
}

// Start test server on random port and execute suite
serverInstance = app.listen(0, () => {
  const port = serverInstance.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  runTests();
});
