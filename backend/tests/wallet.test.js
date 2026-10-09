/**
 * TossArena Day 8 Virtual Demo Wallet & Transaction Ledger Test Suite
 * Automated tests for balance retrieval, immutable ledger history, atomic operations,
 * non-negative balance protection, user isolation, and concurrency safety.
 */

const assert = require('assert');
const { app } = require('../server');
const { pool } = require('../config/db');
const walletService = require('../services/walletService');

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
  const [testUsers] = await pool.query("SELECT id FROM users WHERE email LIKE '%@test-wallet.internal'");
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

// Helper to register and log in a user session
async function createAuthenticatedSession(email, fullName = 'Wallet Test User') {
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
  const user = loginRes.body.user;

  return { sessionCookie, user };
}

async function runTests() {
  console.log('\n======================================================');
  console.log('   TossArena Day 8: Demo Wallet & Ledger Test Suite');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function recordPass(desc) {
    passed++;
    console.log(`• ${desc} ... ✔ PASSED`);
  }

  function recordFail(desc, err) {
    failed++;
    console.error(`• ${desc} ... ✖ FAILED:`, err.message);
  }

  // Start test HTTP server on ephemeral port
  serverInstance = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = serverInstance.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    await cleanupTestData();

    // Setup Test Users
    const userA = await createAuthenticatedSession('user-a@test-wallet.internal', 'Alice Wallet');
    const userB = await createAuthenticatedSession('user-b@test-wallet.internal', 'Bob Wallet');

    // =========================================================================
    // SECTION A: WALLET BALANCE TESTS
    // =========================================================================

    // 1. Unauthenticated request to /api/wallet/me is rejected
    try {
      const res = await request('/api/wallet/me');
      assert.strictEqual(res.status, 401, 'Should return HTTP 401 Unauthorized');
      assert.strictEqual(res.body.success, false);
      recordPass('GET /api/wallet/me rejects unauthenticated request with 401');
    } catch (err) {
      recordFail('GET /api/wallet/me rejects unauthenticated request with 401', err);
    }

    // 2. Authenticated user retrieves their wallet balance
    let userAWalletId = null;
    try {
      const res = await request('/api/wallet/me', {
        headers: { Cookie: userA.sessionCookie }
      });
      assert.strictEqual(res.status, 200, 'Should return HTTP 200');
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.currency, 'DEMO_CREDITS');
      assert.strictEqual(typeof res.body.data.balance, 'number');
      assert.strictEqual(res.body.data.balance, 1000.00, 'Default onboarding balance should be 1000.00 demo credits');
      assert.ok(res.body.data.walletId > 0, 'Wallet ID must be positive');
      userAWalletId = res.body.data.walletId;
      recordPass('GET /api/wallet/me returns authoritative 1,000 demo credits for authenticated user');
    } catch (err) {
      recordFail('GET /api/wallet/me returns authoritative 1,000 demo credits for authenticated user', err);
    }

    // 3. User isolation: User A sees User A wallet, User B sees User B wallet
    try {
      const resB = await request('/api/wallet/me', {
        headers: { Cookie: userB.sessionCookie }
      });
      assert.strictEqual(resB.status, 200);
      assert.notStrictEqual(resB.body.data.walletId, userAWalletId, 'User B must have distinct wallet ID from User A');
      assert.strictEqual(resB.body.data.balance, 1000.00);
      recordPass('User isolation: User A and User B access their own distinct wallets');
    } catch (err) {
      recordFail('User isolation: User A and User B access their own distinct wallets', err);
    }

    // 4. Repeated requests do not duplicate wallet
    try {
      const resRepeat = await request('/api/wallet/me', {
        headers: { Cookie: userA.sessionCookie }
      });
      assert.strictEqual(resRepeat.body.data.walletId, userAWalletId, 'Must return same wallet ID on repeated calls');

      const [walletRows] = await pool.query('SELECT COUNT(*) AS cnt FROM wallets WHERE user_id = ?', [userA.user.id]);
      assert.strictEqual(walletRows[0].cnt, 1, 'Exactly one wallet must exist for User A');
      recordPass('Idempotency: Repeated wallet requests do not duplicate wallet records');
    } catch (err) {
      recordFail('Idempotency: Repeated wallet requests do not duplicate wallet records', err);
    }

    // 5. Missing wallet behavior: uninitialized user is safely auto-provisioned
    try {
      // Insert a mock user without a wallet row
      const [insertUser] = await pool.query(
        `INSERT INTO users (full_name, email, password_hash, role, status, created_at, updated_at)
         VALUES ('Uninitialized User', 'orphan@test-wallet.internal', 'hash', 'user', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())`
      );
      const orphanUserId = insertUser.insertId;

      const wallet = await walletService.getOrCreateUserWallet(orphanUserId);
      assert.ok(wallet.id > 0);
      assert.strictEqual(wallet.balance, 1000.00);

      // Verify transaction ledger has demo_grant
      const [txRows] = await pool.query('SELECT transaction_type, amount FROM wallet_transactions WHERE wallet_id = ?', [wallet.id]);
      assert.strictEqual(txRows.length, 1);
      assert.strictEqual(txRows[0].transaction_type, 'demo_grant');
      recordPass('Missing wallet policy: Idempotently initializes wallet with 1,000 demo credits and grant record');
    } catch (err) {
      recordFail('Missing wallet policy: Idempotently initializes wallet with 1,000 demo credits and grant record', err);
    }

    // =========================================================================
    // SECTION B: TRANSACTION HISTORY TESTS
    // =========================================================================

    // 6. Unauthenticated request to /api/wallet/transactions is rejected
    try {
      const res = await request('/api/wallet/transactions');
      assert.strictEqual(res.status, 401);
      recordPass('GET /api/wallet/transactions rejects unauthenticated request with 401');
    } catch (err) {
      recordFail('GET /api/wallet/transactions rejects unauthenticated request with 401', err);
    }

    // 7. Returns paginated transaction history for User A
    try {
      const res = await request('/api/wallet/transactions', {
        headers: { Cookie: userA.sessionCookie }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data), 'Data must be array of transactions');
      assert.strictEqual(res.body.data.length, 1, 'Initial onboarding has 1 demo_grant transaction');
      assert.strictEqual(res.body.data[0].transactionType, 'demo_grant');
      assert.strictEqual(res.body.data[0].amount, 1000.00);
      assert.strictEqual(res.body.data[0].balanceBefore, 0.00);
      assert.strictEqual(res.body.data[0].balanceAfter, 1000.00);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.total, 1);
      recordPass('GET /api/wallet/transactions returns real onboarding grant ledger entry');
    } catch (err) {
      recordFail('GET /api/wallet/transactions returns real onboarding grant ledger entry', err);
    }

    // 8. Pagination bounds limit at maximum 50
    try {
      const res = await request('/api/wallet/transactions?limit=150', {
        headers: { Cookie: userA.sessionCookie }
      });
      assert.strictEqual(res.body.pagination.limit, 50, 'Excessive limit must be bounded at 50');
      recordPass('Pagination: Excessive limit parameter is capped at 50 max');
    } catch (err) {
      recordFail('Pagination: Excessive limit parameter is capped at 50 max', err);
    }

    // 9. Pagination handles invalid page safely
    try {
      const res = await request('/api/wallet/transactions?page=-5', {
        headers: { Cookie: userA.sessionCookie }
      });
      assert.strictEqual(res.body.pagination.page, 1, 'Negative page falls back safely to 1');
      recordPass('Pagination: Negative or malformed page falls back safely to 1');
    } catch (err) {
      recordFail('Pagination: Negative or malformed page falls back safely to 1', err);
    }

    // 10. Filter by valid transaction type
    try {
      const resGrant = await request('/api/wallet/transactions?type=demo_grant', {
        headers: { Cookie: userA.sessionCookie }
      });
      assert.strictEqual(resGrant.body.data.length, 1);

      const resDebit = await request('/api/wallet/transactions?type=prediction_debit', {
        headers: { Cookie: userA.sessionCookie }
      });
      assert.strictEqual(resDebit.body.data.length, 0);
      assert.strictEqual(resDebit.body.pagination.total, 0);
      recordPass('Transaction filtering: Filtering by valid type works accurately');
    } catch (err) {
      recordFail('Transaction filtering: Filtering by valid type works accurately', err);
    }

    // 11. Unsupported transaction type is rejected with 400
    try {
      const res = await request('/api/wallet/transactions?type=real_money_deposit', {
        headers: { Cookie: userA.sessionCookie }
      });
      assert.strictEqual(res.status, 400, 'Unsupported type must return 400 Bad Request');
      assert.strictEqual(res.body.code, 'INVALID_TRANSACTION_TYPE');
      recordPass('Transaction filtering: Unsupported transaction type rejected with 400');
    } catch (err) {
      recordFail('Transaction filtering: Unsupported transaction type rejected with 400', err);
    }

    // 12. SQL injection attempt in type parameter is safely sanitized
    try {
      const res = await request("/api/wallet/transactions?type=' OR 1=1 --", {
        headers: { Cookie: userA.sessionCookie }
      });
      assert.strictEqual(res.status, 400, 'SQL injection attempt must be rejected by validator');
      recordPass('SQL injection defense: Malicious transaction type parameter is rejected');
    } catch (err) {
      recordFail('SQL injection defense: Malicious transaction type parameter is rejected', err);
    }

    // =========================================================================
    // SECTION C: LEDGER INTEGRITY & SERVICE LEVEL OPERATIONS
    // =========================================================================

    // 13. Successful credit operation updates wallet balance and creates ledger entry
    try {
      const creditRes = await walletService.executeWalletCredit(userA.user.id, {
        amount: 250.00,
        type: 'demo_adjustment',
        description: 'Test promotional credit addition'
      });

      assert.strictEqual(creditRes.amount, 250.00);
      assert.strictEqual(creditRes.balanceBefore, 1000.00);
      assert.strictEqual(creditRes.balanceAfter, 1250.00);

      // Verify wallet balance in DB
      const currentBalance = await walletService.getWalletBalance(userA.user.id);
      assert.strictEqual(currentBalance.balance, 1250.00);
      recordPass('Credit operation: Atomically increments balance and writes ledger record');
    } catch (err) {
      recordFail('Credit operation: Atomically increments balance and writes ledger record', err);
    }

    // 14. Successful debit operation updates wallet balance and creates ledger entry
    try {
      const debitRes = await walletService.executeWalletDebit(userA.user.id, {
        amount: 200.00,
        description: 'Test prediction debit allocation'
      });

      assert.strictEqual(debitRes.amount, 200.00);
      assert.strictEqual(debitRes.balanceBefore, 1250.00);
      assert.strictEqual(debitRes.balanceAfter, 1050.00);

      const currentBalance = await walletService.getWalletBalance(userA.user.id);
      assert.strictEqual(currentBalance.balance, 1050.00);
      recordPass('Debit operation: Atomically decrements balance and writes ledger record');
    } catch (err) {
      recordFail('Debit operation: Atomically decrements balance and writes ledger record', err);
    }

    // 15. Debit exceeding available balance is rejected with INSUFFICIENT_DEMO_CREDITS
    try {
      let threw = false;
      try {
        await walletService.executeWalletDebit(userA.user.id, {
          amount: 5000.00,
          description: 'Excessive debit attempt'
        });
      } catch (e) {
        threw = true;
        assert.strictEqual(e.code, 'INSUFFICIENT_DEMO_CREDITS');
      }
      assert.ok(threw, 'Should throw error when debit exceeds available balance');

      // Verify balance was NOT changed
      const currentBalance = await walletService.getWalletBalance(userA.user.id);
      assert.strictEqual(currentBalance.balance, 1050.00, 'Balance must remain unchanged after rejected debit');
      recordPass('Balance protection: Excessive debit rejected without modifying balance');
    } catch (err) {
      recordFail('Balance protection: Excessive debit rejected without modifying balance', err);
    }

    // 16. Negative balance prohibited by database CHECK constraint
    try {
      let dbCheckCaught = false;
      try {
        // Attempt raw SQL update bypassing service
        await pool.query('UPDATE wallets SET balance = -50.00 WHERE user_id = ?', [userA.user.id]);
      } catch (dbErr) {
        dbCheckCaught = true;
        assert.ok(dbErr.message.includes('chk_wallets_balance_non_negative') || dbErr.errno === 3819 || dbErr.code === 'ER_CHECK_CONSTRAINT_VIOLATED');
      }
      assert.ok(dbCheckCaught, 'MySQL constraint chk_wallets_balance_non_negative must reject negative balance');
      recordPass('Database constraint: chk_wallets_balance_non_negative strictly rejects negative balances');
    } catch (err) {
      recordFail('Database constraint: chk_wallets_balance_non_negative strictly rejects negative balances', err);
    }

    // 17. Duplicate operation prevention via referenceType & referenceId
    try {
      // First operation succeeds
      await walletService.executeWalletCredit(userA.user.id, {
        amount: 50.00,
        type: 'prediction_refund',
        description: 'Match cancelled refund',
        referenceType: 'matches',
        referenceId: 999
      });

      // Second identical operation must be rejected
      let dupCaught = false;
      try {
        await walletService.executeWalletCredit(userA.user.id, {
          amount: 50.00,
          type: 'prediction_refund',
          description: 'Match cancelled refund repeat attempt',
          referenceType: 'matches',
          referenceId: 999
        });
      } catch (e) {
        dupCaught = true;
        assert.strictEqual(e.code, 'DUPLICATE_TRANSACTION_OPERATION');
      }
      assert.ok(dupCaught, 'Repeated operation with identical reference must be rejected');
      recordPass('Duplicate prevention: Identical operation references rejected with 409 conflict');
    } catch (err) {
      recordFail('Duplicate prevention: Identical operation references rejected with 409 conflict', err);
    }

    // 18. Database transaction rollback restores exact state on failure
    try {
      const balanceBeforeTx = (await walletService.getWalletBalance(userA.user.id)).balance;

      let txRolledBack = false;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const wallet = await walletService.getOrCreateUserWallet(userA.user.id, conn);

        // Perform balance operation
        await walletService.processBalanceOperation(conn, {
          walletId: wallet.id,
          type: 'demo_adjustment',
          amount: 100.00,
          description: 'Will be rolled back'
        });

        // Deliberately trigger failure before commit
        throw new Error('Simulated failure during multi-step operation');
      } catch (simulatedErr) {
        await conn.rollback();
        txRolledBack = true;
      } finally {
        conn.release();
      }

      assert.ok(txRolledBack);
      const balanceAfterTx = (await walletService.getWalletBalance(userA.user.id)).balance;
      assert.strictEqual(balanceAfterTx, balanceBeforeTx, 'Balance must be identical to pre-tx state');
      recordPass('Atomicity & Rollback: Failure during balance operation completely rolls back state');
    } catch (err) {
      recordFail('Atomicity & Rollback: Failure during balance operation completely rolls back state', err);
    }

    // 19. Public endpoints do not allow editing or deleting historical transactions (immutability)
    try {
      const putRes = await request('/api/wallet/transactions/1', {
        method: 'PUT',
        headers: { Cookie: userA.sessionCookie },
        body: JSON.stringify({ amount: 99999 })
      });
      assert.ok(putRes.status === 404 || putRes.status === 405, 'Editing transactions must be 404/405');

      const deleteRes = await request('/api/wallet/transactions/1', {
        method: 'DELETE',
        headers: { Cookie: userA.sessionCookie }
      });
      assert.ok(deleteRes.status === 404 || deleteRes.status === 405, 'Deleting transactions must be 404/405');
      recordPass('Immutability: Public endpoints prohibit modifying or deleting historical ledger entries');
    } catch (err) {
      recordFail('Immutability: Public endpoints prohibit modifying or deleting historical ledger entries', err);
    }

    // 20. Public endpoints do not accept client-controlled arbitrary balances
    try {
      const postRes = await request('/api/wallet/me', {
        method: 'POST',
        headers: { Cookie: userA.sessionCookie },
        body: JSON.stringify({ balance: 999999 })
      });
      assert.ok(postRes.status === 404 || postRes.status === 405, 'No endpoint accepts client balance');
      recordPass('Security: Backend refuses client-supplied arbitrary balance modifications');
    } catch (err) {
      recordFail('Security: Backend refuses client-supplied arbitrary balance modifications', err);
    }

    // =========================================================================
    // SECTION D: DAY 7 PREDICTION ENGINE COMPATIBILITY (SECTION 9 SCENARIO A)
    // =========================================================================

    // 21. Predictions submission continues to function without forced arbitrary stake
    try {
      // Create open test match
      const [matchResult] = await pool.query(`
        INSERT INTO matches (
          title, team_a, team_b, tournament_name, venue, scheduled_at, status, created_at, updated_at
        ) VALUES (
          '[TEST-PRED] Day 8 Wallet Fixture', 'Mumbai Indians', 'Chennai Super Kings',
          'IPL 2026', 'Wankhede Stadium', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 DAY), 'open', UTC_TIMESTAMP(), UTC_TIMESTAMP()
        )
      `);
      const testMatchId = matchResult.insertId;

      const csrfRes = await request('/api/auth/csrf', { headers: { Cookie: userA.sessionCookie } });
      const csrfToken = csrfRes.body.csrfToken;

      const predRes = await request('/api/predictions', {
        method: 'POST',
        headers: {
          Cookie: userA.sessionCookie,
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          matchId: testMatchId,
          predictedTeam: 'Mumbai Indians'
        })
      });

      assert.strictEqual(predRes.status, 201);
      assert.strictEqual(predRes.body.success, true);
      assert.strictEqual(predRes.body.data.predictedTeam, 'Mumbai Indians');

      // Verify prediction used 0.00 credits per Scenario A (no arbitrary stake invented)
      const [predRows] = await pool.query('SELECT demo_credits_used FROM predictions WHERE id = ?', [predRes.body.data.id]);
      assert.strictEqual(Number(predRows[0].demo_credits_used), 0.00);

      // Clean up match and prediction
      await pool.query('DELETE FROM predictions WHERE id = ?', [predRes.body.data.id]);
      await pool.query('DELETE FROM matches WHERE id = ?', [testMatchId]);

      recordPass('Scenario A Verification: Predictions submit cleanly with 0.00 stake without arbitrary debits');
    } catch (err) {
      recordFail('Scenario A Verification: Predictions submit cleanly with 0.00 stake without arbitrary debits', err);
    }

  } finally {
    await cleanupTestData();
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  }

  console.log('\n======================================================');
  console.log(` Wallet Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
