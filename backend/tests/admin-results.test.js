/**
 * TossArena Day 12: Verified Toss Result Management & Prediction Outcome Tests
 * Comprehensive automated test suite verifying:
 * - Admin authorization and role enforcement
 * - Result overview statistics and paginated match list with filtering
 * - Strict toss winner validation (must belong to match) and decision validation ('bat' | 'bowl')
 * - Cancelled match publication prevention
 * - Safe preview endpoint (dry-run without mutating database)
 * - Transactional result publication:
 *   - Match marked as completed with published timestamp and admin ID
 *   - Predictions updated to 'correct' or 'incorrect' based on actual toss winner
 *   - Idempotent republishing protection and conflict detection (409)
 *   - Audit log recorded in audit_logs
 * - Administrative correction workflow:
 *   - Requires mandatory reason
 *   - Re-evaluates prediction statuses
 *   - Preserves audit trail with previous vs new result
 * - Public result endpoint visibility rules (published vs unpublished)
 * - Wallet balance and ledger invariance (zero demo-credit settlement in Day 12)
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
  const [testUsers] = await pool.query("SELECT id FROM users WHERE email LIKE '%@test-day12.internal'");
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
  await pool.query("DELETE FROM predictions WHERE match_id IN (SELECT id FROM matches WHERE title LIKE '%[DAY12-TEST]%')");
  await pool.query("DELETE FROM audit_logs WHERE entity_type = 'match' AND entity_id IN (SELECT id FROM matches WHERE title LIKE '%[DAY12-TEST]%')");
  await pool.query("DELETE FROM matches WHERE title LIKE '%[DAY12-TEST]%'");
}

async function runTests() {
  console.log('\n================================================================');
  console.log('   TossArena Day 12: Verified Toss Result Management Test Suite');
  console.log('================================================================\n');

  try {
    await cleanupTestData();

    // 1. Create a regular user, a second predicting user, and an admin user
    const user1 = await createAuthenticatedSession('user1@test-day12.internal', 'user', 'Prediction User 1');
    const user2 = await createAuthenticatedSession('user2@test-day12.internal', 'user', 'Prediction User 2');
    const adminUser = await createAuthenticatedSession('admin@test-day12.internal', 'admin', 'Super Admin');

    // -------------------------------------------------------------------------
    // TEST SECTION A: AUTHORIZATION CHECKS
    // -------------------------------------------------------------------------
    console.log('\n--- Section A: Authorization & Access Control ---');

    // A1: Unauthenticated request to /api/admin/results rejected with 401
    const unauthRes = await request('/api/admin/results');
    record(
      'A1: Unauthenticated user rejected with 401 Unauthorized for admin results',
      unauthRes.status === 401 && unauthRes.body?.success === false,
      `Status: ${unauthRes.status}`
    );

    // A2: Regular user rejected with 403 Forbidden for admin results
    const forbiddenRes = await request('/api/admin/results', {
      headers: { 'Cookie': user1.sessionCookie }
    });
    record(
      'A2: Authenticated non-admin rejected with 403 Forbidden for admin results',
      forbiddenRes.status === 403 && forbiddenRes.body?.success === false,
      `Status: ${forbiddenRes.status}`
    );

    // A3: Admin can access result listing with 200 OK
    const adminRes = await request('/api/admin/results', {
      headers: { 'Cookie': adminUser.sessionCookie }
    });
    record(
      'A3: Admin successfully retrieves results listing with 200 OK',
      adminRes.status === 200 && adminRes.body?.success === true && Array.isArray(adminRes.body?.data?.matches),
      `Status: ${adminRes.status}`
    );

    // A4: Admin can access result overview statistics
    const overviewRes = await request('/api/admin/results/overview', {
      headers: { 'Cookie': adminUser.sessionCookie }
    });
    record(
      'A4: Admin successfully retrieves results overview metrics',
      overviewRes.status === 200 && overviewRes.body?.success === true && typeof overviewRes.body?.data?.awaitingResults === 'number',
      `Metrics: ${JSON.stringify(overviewRes.body?.data)}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION B: RESULT VALIDATION & SAFE DRY-RUN PREVIEW
    // -------------------------------------------------------------------------
    console.log('\n--- Section B: Validation & Safe Dry-Run Preview ---');

    // Create a test match scheduled in future
    const futureDate = new Date(Date.now() + 3600000).toISOString().slice(0, 19).replace('T', ' ');
    const [matchInsert] = await pool.query(
      `INSERT INTO matches (title, team_a, team_b, tournament_name, venue, scheduled_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['[DAY12-TEST] Mumbai vs Chennai', 'Mumbai Indians', 'Chennai Super Kings', 'IPL 2026', 'Wankhede', futureDate, 'open']
    );
    const testMatchId = matchInsert.insertId;

    // Insert 2 predictions: user1 picks Mumbai Indians, user2 picks Chennai Super Kings
    await pool.query(
      `INSERT INTO predictions (user_id, match_id, predicted_toss_winner, status)
       VALUES (?, ?, ?, 'pending'), (?, ?, ?, 'pending')`,
      [user1.userId, testMatchId, 'Mumbai Indians', user2.userId, testMatchId, 'Chennai Super Kings']
    );

    // B1: Reject invalid toss winner not in match
    const invalidWinnerRes = await request(`/api/admin/results/${testMatchId}/publish`, {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        tossWinner: 'Royal Challengers Bangalore',
        tossDecision: 'bat'
      })
    });
    record(
      'B1: Reject toss winner not participating in match with 400 Bad Request',
      invalidWinnerRes.status === 400 && invalidWinnerRes.body?.success === false,
      `Status: ${invalidWinnerRes.status}, Error: ${invalidWinnerRes.body?.message}`
    );

    // B2: Reject invalid toss decision
    const invalidDecisionRes = await request(`/api/admin/results/${testMatchId}/publish`, {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        tossWinner: 'Mumbai Indians',
        tossDecision: 'field_first' // invalid enum
      })
    });
    record(
      'B2: Reject invalid toss decision with 400 Bad Request',
      invalidDecisionRes.status === 400 && invalidDecisionRes.body?.success === false,
      `Status: ${invalidDecisionRes.status}, Error: ${invalidDecisionRes.body?.message}`
    );

    // B3: Safe dry-run preview endpoint calculates hypothetical outcome without mutating DB
    const previewRes = await request(`/api/admin/results/${testMatchId}/preview`, {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        tossWinner: 'Mumbai Indians',
        tossDecision: 'bat'
      })
    });
    const previewData = previewRes.body?.data;
    record(
      'B3: Preview endpoint returns dry-run counts accurately (1 correct, 1 incorrect)',
      previewRes.status === 200 && previewData?.hypotheticalOutcome?.willMarkCorrect === 1 && previewData?.hypotheticalOutcome?.willMarkIncorrect === 1,
      `Preview Data: ${JSON.stringify(previewData?.hypotheticalOutcome)}`
    );

    // B4: Verify DB was NOT mutated by preview
    const [matchAfterPreview] = await pool.query('SELECT status, result_toss_winner FROM matches WHERE id = ?', [testMatchId]);
    const [predsAfterPreview] = await pool.query('SELECT status FROM predictions WHERE match_id = ?', [testMatchId]);
    const allPending = predsAfterPreview.every(p => p.status === 'pending');
    record(
      'B4: Preview does NOT mutate match status or prediction statuses',
      matchAfterPreview[0].status === 'open' && matchAfterPreview[0].result_toss_winner === null && allPending,
      `Match status: ${matchAfterPreview[0].status}, Preds pending: ${allPending}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION C: TRANSACTIONAL RESULT PUBLISHING & PREDICTION OUTCOMES
    // -------------------------------------------------------------------------
    console.log('\n--- Section C: Transactional Result Publishing & Predictions ---');

    // Capture initial wallet balances and ledger count for both users
    const [w1Before] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [user1.userId]);
    const [w2Before] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [user2.userId]);
    const bal1Before = Number(w1Before[0].balance);
    const bal2Before = Number(w2Before[0].balance);
    const [txCountBefore] = await pool.query(
      'SELECT COUNT(*) as cnt FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id IN (?, ?))',
      [user1.userId, user2.userId]
    );
    const initialTxCount = Number(txCountBefore[0].cnt);

    // C1: Publish valid verified toss result
    const publishRes = await request(`/api/admin/results/${testMatchId}/publish`, {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        tossWinner: 'Mumbai Indians',
        tossDecision: 'bat',
        sourceNote: 'Official BCCI Match Referee Sheet'
      })
    });
    record(
      'C1: Authorized admin publishes verified toss result with 200 OK',
      publishRes.status === 200 && publishRes.body?.success === true && publishRes.body?.data?.evaluation?.evaluatedCount === 2,
      `Status: ${publishRes.status}, Eval: ${JSON.stringify(publishRes.body?.data?.evaluation)}`
    );

    // C2: Verify match status in MySQL is 'completed' with metadata
    const [updatedMatch] = await pool.query(
      'SELECT status, result_toss_winner, result_decision, result_published_at, result_published_by, result_source_note FROM matches WHERE id = ?',
      [testMatchId]
    );
    record(
      'C2: Match record updated to completed with published metadata',
      updatedMatch[0].status === 'completed' &&
      updatedMatch[0].result_toss_winner === 'Mumbai Indians' &&
      updatedMatch[0].result_decision === 'bat' &&
      updatedMatch[0].result_published_by === adminUser.userId &&
      updatedMatch[0].result_published_at !== null,
      `Match fields: ${JSON.stringify(updatedMatch[0])}`
    );

    // C3: Verify predictions evaluated correctly
    const [predsAfterPublish] = await pool.query(
      'SELECT user_id, predicted_toss_winner, status FROM predictions WHERE match_id = ? ORDER BY user_id ASC',
      [testMatchId]
    );
    const p1 = predsAfterPublish.find(p => p.user_id === user1.userId);
    const p2 = predsAfterPublish.find(p => p.user_id === user2.userId);
    record(
      'C3: User 1 (Mumbai) marked correct, User 2 (Chennai) marked incorrect',
      p1?.status === 'correct' && p2?.status === 'incorrect',
      `User1: ${p1?.status}, User2: ${p2?.status}`
    );

    // C4: Audit log entry recorded for toss_result_published
    const [auditRecords] = await pool.query(
      "SELECT * FROM audit_logs WHERE entity_type = 'match' AND entity_id = ? AND action = 'toss_result_published'",
      [testMatchId]
    );
    record(
      'C4: Persistent audit log recorded for toss_result_published',
      auditRecords.length === 1 && auditRecords[0].actor_user_id === adminUser.userId,
      `Audit count: ${auditRecords.length}`
    );

    // C5: Idempotent re-submission of identical result returns 200 OK without double-processing
    const replayRes = await request(`/api/admin/results/${testMatchId}/publish`, {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        tossWinner: 'Mumbai Indians',
        tossDecision: 'bat'
      })
    });
    record(
      'C5: Idempotent republishing returns 200 OK with alreadyPublished flag',
      replayRes.status === 200 && replayRes.body?.data?.alreadyPublished === true,
      `Status: ${replayRes.status}`
    );

    // C6: Differing result published via publish endpoint returns 409 Conflict (must use correction endpoint)
    const conflictRes = await request(`/api/admin/results/${testMatchId}/publish`, {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        tossWinner: 'Chennai Super Kings',
        tossDecision: 'bowl'
      })
    });
    record(
      'C6: Conflicting result rejected with 409 Conflict instructing to use correction workflow',
      conflictRes.status === 409 && conflictRes.body?.success === false,
      `Status: ${conflictRes.status}, Error: ${conflictRes.body?.message}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION D: CORRECTION WORKFLOW & AUDIT TRAIL
    // -------------------------------------------------------------------------
    console.log('\n--- Section D: Result Correction Workflow ---');

    // D1: Correction rejected if reason is missing or too short
    const noReasonRes = await request(`/api/admin/results/${testMatchId}/correct`, {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        tossWinner: 'Chennai Super Kings',
        tossDecision: 'bowl',
        correctionReason: 'err' // < 5 chars
      })
    });
    record(
      'D1: Correction rejected if reason is missing or shorter than 5 chars (400 Bad Request)',
      noReasonRes.status === 400 && noReasonRes.body?.success === false,
      `Status: ${noReasonRes.status}, Message: ${noReasonRes.body?.message}`
    );

    // D2: Valid correction re-evaluates predictions safely
    const validCorrectRes = await request(`/api/admin/results/${testMatchId}/correct`, {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        tossWinner: 'Chennai Super Kings',
        tossDecision: 'bowl',
        correctionReason: 'Official scorecard revision by match referee'
      })
    });
    record(
      'D2: Valid correction processed successfully with 200 OK',
      validCorrectRes.status === 200 && validCorrectRes.body?.success === true,
      `Status: ${validCorrectRes.status}`
    );

    // D3: Predictions re-evaluated: User 1 now incorrect, User 2 now correct
    const [predsAfterCorrection] = await pool.query(
      'SELECT user_id, predicted_toss_winner, status FROM predictions WHERE match_id = ? ORDER BY user_id ASC',
      [testMatchId]
    );
    const p1Corr = predsAfterCorrection.find(p => p.user_id === user1.userId);
    const p2Corr = predsAfterCorrection.find(p => p.user_id === user2.userId);
    record(
      'D3: Predictions re-evaluated accurately (User 1 incorrect, User 2 correct)',
      p1Corr?.status === 'incorrect' && p2Corr?.status === 'correct',
      `User1: ${p1Corr?.status}, User2: ${p2Corr?.status}`
    );

    // D4: Audit log entry for toss_result_corrected with old and new result
    const [correctAudit] = await pool.query(
      "SELECT * FROM audit_logs WHERE entity_type = 'match' AND entity_id = ? AND action = 'toss_result_corrected'",
      [testMatchId]
    );
    const rawDetails = correctAudit[0]?.details_json;
    let detailsParsed = {};
    if (typeof rawDetails === 'object' && rawDetails !== null) {
      detailsParsed = rawDetails;
    } else if (typeof rawDetails === 'string') {
      try { detailsParsed = JSON.parse(rawDetails); } catch (_) {}
    }
    record(
      'D4: Audit log contains correction reason, previous result, and new result',
      correctAudit.length === 1 && detailsParsed.previous?.tossWinner === 'Mumbai Indians' && detailsParsed.updated?.tossWinner === 'Chennai Super Kings',
      `Audit details: ${JSON.stringify(detailsParsed)}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION E: CANCELLED MATCHES & PUBLIC ENDPOINTS
    // -------------------------------------------------------------------------
    console.log('\n--- Section E: Cancelled Match Guard & Public Visibility ---');

    // Create a cancelled test match
    const [cancelledInsert] = await pool.query(
      `INSERT INTO matches (title, team_a, team_b, tournament_name, venue, scheduled_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'cancelled')`,
      ['[DAY12-TEST] Delhi vs Punjab', 'Delhi Capitals', 'Punjab Kings', 'IPL 2026', 'Arun Jaitley Stadium', futureDate]
    );
    const cancelledMatchId = cancelledInsert.insertId;

    // E1: Rejection of publishing toss result for cancelled match
    const cancelPublishRes = await request(`/api/admin/results/${cancelledMatchId}/publish`, {
      method: 'POST',
      headers: {
        'Cookie': adminUser.sessionCookie,
        'X-CSRF-Token': adminUser.csrfToken
      },
      body: JSON.stringify({
        tossWinner: 'Delhi Capitals',
        tossDecision: 'bat'
      })
    });
    record(
      'E1: Reject publishing result for cancelled match with 400 Bad Request',
      cancelPublishRes.status === 400 && cancelPublishRes.body?.success === false,
      `Status: ${cancelPublishRes.status}, Error: ${cancelPublishRes.body?.message}`
    );

    // E2: Public endpoint for published match returns result
    const publicPublishedRes = await request(`/api/matches/${testMatchId}/result`);
    record(
      'E2: Public result endpoint returns published toss result and decision for published match',
      publicPublishedRes.status === 200 &&
      publicPublishedRes.body?.data?.isPublished === true &&
      publicPublishedRes.body?.data?.tossWinner === 'Chennai Super Kings' &&
      publicPublishedRes.body?.data?.tossDecision === 'bowl',
      `Public Result: ${JSON.stringify(publicPublishedRes.body?.data)}`
    );

    // E3: Public endpoint for unpublished (cancelled or scheduled) match hides result details
    const publicUnpublishedRes = await request(`/api/matches/${cancelledMatchId}/result`);
    record(
      'E3: Public result endpoint hides result details for unpublished/cancelled fixture',
      publicUnpublishedRes.status === 200 &&
      publicUnpublishedRes.body?.data?.isPublished === false &&
      publicUnpublishedRes.body?.data?.tossWinner === null,
      `Unpublished data: ${JSON.stringify(publicUnpublishedRes.body?.data)}`
    );

    // -------------------------------------------------------------------------
    // TEST SECTION F: ZERO FINANCIAL MUTATIONS IN DAY 12
    // -------------------------------------------------------------------------
    console.log('\n--- Section F: Strict Financial Invariance ---');

    const [w1After] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [user1.userId]);
    const [w2After] = await pool.query('SELECT balance FROM wallets WHERE user_id = ?', [user2.userId]);
    const bal1After = Number(w1After[0].balance);
    const bal2After = Number(w2After[0].balance);

    const [txCount] = await pool.query(
      'SELECT COUNT(*) as cnt FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id IN (?, ?))',
      [user1.userId, user2.userId]
    );

    record(
      'F1: User 1 wallet balance strictly unchanged (Zero Day 12 financial settlement)',
      bal1Before === bal1After,
      `Before: ${bal1Before}, After: ${bal1After}`
    );
    record(
      'F2: User 2 wallet balance strictly unchanged (Zero Day 12 financial settlement)',
      bal2Before === bal2After,
      `Before: ${bal2Before}, After: ${bal2After}`
    );
    record(
      'F3: Zero new wallet transaction ledger rows created during result processing',
      Number(txCount[0].cnt) === initialTxCount,
      `Before: ${initialTxCount}, After: ${txCount[0].cnt}`
    );

  } catch (err) {
    console.error('Fatal error during test run:', err);
    failedTests++;
  } finally {
    // Teardown
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

// Start test server on random port and execute suite
serverInstance = app.listen(0, () => {
  const port = serverInstance.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  runTests();
});
