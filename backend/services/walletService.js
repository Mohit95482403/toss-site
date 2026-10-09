/**
 * TossArena Wallet Service
 * Authoritative virtual demo-credit balance management and immutable transaction ledger operations.
 * Strictly 100% virtual credits — no real-money betting, cash deposits, or cash withdrawals.
 */

const { pool } = require('../config/db');

// Supported immutable ledger transaction types matching MySQL ENUM definition
const VALID_TRANSACTION_TYPES = Object.freeze([
  'demo_grant',
  'prediction_debit',
  'prediction_refund',
  'demo_adjustment',
  'demo_result_credit'
]);

// Default onboarding virtual credit grant if wallet is uninitialized
const DEFAULT_INITIAL_CREDITS = 1000.00;

/**
 * Rounds a number to exactly two decimal places to prevent floating point inaccuracies
 * @param {number|string} val
 * @returns {number}
 */
function roundCredits(val) {
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return 0.00;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Idempotently retrieves or creates the user's virtual demo wallet
 * Ensures concurrency-safe wallet provisioning with one-wallet-per-user enforcement.
 *
 * @param {number} userId - Authenticated user identifier
 * @param {object} [existingConnection] - Optional active MySQL connection within an outer transaction
 * @returns {Promise<{ id: number, userId: number, balance: number, createdAt: string, updatedAt: string }>}
 */
async function getOrCreateUserWallet(userId, existingConnection = null) {
  if (!userId || !Number.isInteger(userId) || userId <= 0) {
    const err = new Error('Invalid user ID provided for wallet lookup.');
    err.status = 400;
    err.code = 'INVALID_USER_ID';
    throw err;
  }

  const conn = existingConnection || await pool.getConnection();
  const shouldManageTx = !existingConnection;

  try {
    if (shouldManageTx) {
      await conn.beginTransaction();
    }

    // 1. Check if wallet already exists
    const [rows] = await conn.query(
      'SELECT id, user_id, balance, created_at, updated_at FROM wallets WHERE user_id = ? LIMIT 1 FOR UPDATE',
      [userId]
    );

    if (rows.length > 0) {
      if (shouldManageTx) {
        await conn.commit();
      }
      return {
        id: rows[0].id,
        userId: rows[0].user_id,
        balance: roundCredits(rows[0].balance),
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at
      };
    }

    // 2. Initialize wallet idempotently if not yet present
    const initialBalance = DEFAULT_INITIAL_CREDITS;
    const [walletResult] = await conn.query(
      `INSERT INTO wallets (user_id, balance, created_at, updated_at)
       VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [userId, initialBalance]
    );

    const walletId = walletResult.insertId;

    // 3. Record initial demo onboarding grant in transaction ledger
    await conn.query(
      `INSERT INTO wallet_transactions (
         wallet_id,
         transaction_type,
         amount,
         balance_before,
         balance_after,
         description,
         created_at
       ) VALUES (?, 'demo_grant', ?, 0.00, ?, 'Welcome onboarding demo credit allocation (strictly virtual)', UTC_TIMESTAMP())`,
      [walletId, initialBalance, initialBalance]
    );

    if (shouldManageTx) {
      await conn.commit();
    }

    return {
      id: walletId,
      userId,
      balance: initialBalance,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    if (shouldManageTx) {
      await conn.rollback();
    }
    // Handle duplicate key error gracefully if another concurrent request provisioned it
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      const [retryRows] = await pool.query(
        'SELECT id, user_id, balance, created_at, updated_at FROM wallets WHERE user_id = ? LIMIT 1',
        [userId]
      );
      if (retryRows.length > 0) {
        return {
          id: retryRows[0].id,
          userId: retryRows[0].user_id,
          balance: roundCredits(retryRows[0].balance),
          createdAt: retryRows[0].created_at,
          updatedAt: retryRows[0].updated_at
        };
      }
    }
    throw error;
  } finally {
    if (shouldManageTx) {
      conn.release();
    }
  }
}

/**
 * Retrieves the current authoritative virtual demo credit balance for an authenticated user
 *
 * @param {number} userId - Authenticated user identifier
 * @returns {Promise<{ walletId: number, balance: number, currency: string, updatedAt: string }>}
 */
async function getWalletBalance(userId) {
  const wallet = await getOrCreateUserWallet(userId);
  return {
    walletId: wallet.id,
    balance: wallet.balance,
    currency: 'DEMO_CREDITS',
    updatedAt: wallet.updatedAt
  };
}

/**
 * Retrieves paginated transaction history from the immutable ledger for the user's wallet
 *
 * @param {number} userId - Authenticated user identifier
 * @param {object} options
 * @param {number} [options.page=1] - 1-indexed page number
 * @param {number} [options.limit=10] - Number of records per page (max 50)
 * @param {string} [options.type] - Optional transaction type filter
 * @param {string} [options.sort='newest'] - Sort direction ('newest' or 'oldest')
 * @returns {Promise<{ transactions: Array, pagination: object }>}
 */
async function getUserTransactions(userId, { page = 1, limit = 10, type = null, sort = 'newest' } = {}) {
  // Ensure user wallet is initialized
  const wallet = await getOrCreateUserWallet(userId);

  // Validate pagination parameters
  let parsedPage = parseInt(page, 10);
  if (isNaN(parsedPage) || parsedPage < 1) {
    parsedPage = 1;
  }

  let parsedLimit = parseInt(limit, 10);
  if (isNaN(parsedLimit) || parsedLimit < 1) {
    parsedLimit = 10;
  }
  // Enforce server-side upper bound
  if (parsedLimit > 50) {
    parsedLimit = 50;
  }

  const offset = (parsedPage - 1) * parsedLimit;

  // Build query filters
  const conditions = ['wt.wallet_id = ?'];
  const params = [wallet.id];

  if (type) {
    const cleanType = String(type).trim().toLowerCase();
    if (!VALID_TRANSACTION_TYPES.includes(cleanType)) {
      const err = new Error(
        `Invalid transaction type "${type}". Allowed types: ${VALID_TRANSACTION_TYPES.join(', ')}`
      );
      err.status = 400;
      err.code = 'INVALID_TRANSACTION_TYPE';
      throw err;
    }
    conditions.push('wt.transaction_type = ?');
    params.push(cleanType);
  }

  // Determine sort order using allowlist
  let orderClause = 'wt.created_at DESC, wt.id DESC';
  if (sort === 'oldest') {
    orderClause = 'wt.created_at ASC, wt.id ASC';
  }

  const whereSql = conditions.join(' AND ');

  // 1. Total count query
  const countSql = `SELECT COUNT(*) AS total FROM wallet_transactions wt WHERE ${whereSql}`;
  const [countRows] = await pool.query(countSql, params);
  const total = parseInt(countRows[0]?.total || 0, 10);
  const totalPages = total > 0 ? Math.ceil(total / parsedLimit) : 0;

  // 2. Data records query
  const dataSql = `
    SELECT
      wt.id,
      wt.transaction_type,
      wt.amount,
      wt.balance_before,
      wt.balance_after,
      wt.reference_type,
      wt.reference_id,
      wt.description,
      wt.created_at
    FROM wallet_transactions wt
    WHERE ${whereSql}
    ORDER BY ${orderClause}
    LIMIT ? OFFSET ?
  `;

  const [dataRows] = await pool.query(dataSql, [...params, parsedLimit, offset]);

  const transactions = dataRows.map((row) => ({
    id: row.id,
    transactionType: row.transaction_type,
    amount: roundCredits(row.amount),
    balanceBefore: roundCredits(row.balance_before),
    balanceAfter: roundCredits(row.balance_after),
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    description: row.description,
    createdAt: row.created_at
  }));

  return {
    transactions,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages
    }
  };
}

/**
 * Core atomic operation processor for all balance changes.
 * Must be executed within an active MySQL transaction on the provided connection.
 * Row-level locks the wallet record, checks constraints, updates balance, and inserts ledger record.
 *
 * @param {object} connection - Active MySQL connection inside transaction
 * @param {object} params
 * @param {number} params.walletId - Target wallet ID
 * @param {string} params.type - Transaction type (must be in VALID_TRANSACTION_TYPES)
 * @param {number} params.amount - Positive amount of demo credits
 * @param {string} [params.description] - Human-readable audit narrative
 * @param {string} [params.referenceType] - Source entity (e.g. 'predictions', 'admin_action')
 * @param {number} [params.referenceId] - Source entity ID
 * @returns {Promise<{ transactionId: number, walletId: number, type: string, amount: number, balanceBefore: number, balanceAfter: number, description: string, createdAt: string }>}
 */
async function processBalanceOperation(connection, {
  walletId,
  type,
  amount,
  description = null,
  referenceType = null,
  referenceId = null
}) {
  if (!connection || typeof connection.query !== 'function') {
    throw new Error('An active database connection is required to process balance operations.');
  }

  // 1. Validate transaction type
  if (!VALID_TRANSACTION_TYPES.includes(type)) {
    const err = new Error(`Unsupported transaction type: ${type}`);
    err.status = 400;
    err.code = 'INVALID_TRANSACTION_TYPE';
    throw err;
  }

  // 2. Validate positive amount
  const parsedAmount = roundCredits(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    const err = new Error('Transaction amount must be a positive number of demo credits.');
    err.status = 400;
    err.code = 'INVALID_AMOUNT';
    throw err;
  }

  // 3. Duplicate operation prevention if reference is provided
  if (referenceType && referenceId) {
    const [existingTx] = await connection.query(
      `SELECT id FROM wallet_transactions
       WHERE wallet_id = ? AND reference_type = ? AND reference_id = ? AND transaction_type = ?
       LIMIT 1`,
      [walletId, referenceType, referenceId, type]
    );

    if (existingTx.length > 0) {
      const err = new Error(`Transaction already processed for ${referenceType} #${referenceId}.`);
      err.status = 409;
      err.code = 'DUPLICATE_TRANSACTION_OPERATION';
      throw err;
    }
  }

  // 4. Lock and read authoritative current balance
  const [walletRows] = await connection.query(
    'SELECT id, balance FROM wallets WHERE id = ? FOR UPDATE',
    [walletId]
  );

  if (walletRows.length === 0) {
    const err = new Error('Wallet record not found.');
    err.status = 404;
    err.code = 'WALLET_NOT_FOUND';
    throw err;
  }

  const balanceBefore = roundCredits(walletRows[0].balance);
  let balanceAfter;

  // 5. Determine credit vs debit operation
  const isDebit = (type === 'prediction_debit');

  if (isDebit) {
    if (balanceBefore < parsedAmount) {
      const err = new Error(
        `Insufficient virtual demo credits. Required: ${parsedAmount.toFixed(2)}, Available: ${balanceBefore.toFixed(2)}.`
      );
      err.status = 422;
      err.code = 'INSUFFICIENT_DEMO_CREDITS';
      throw err;
    }
    balanceAfter = roundCredits(balanceBefore - parsedAmount);
  } else {
    balanceAfter = roundCredits(balanceBefore + parsedAmount);
  }

  // 6. Enforce non-negative constraint before update
  if (balanceAfter < 0) {
    const err = new Error('Operation rejected: resulting demo credit balance cannot be negative.');
    err.status = 422;
    err.code = 'NEGATIVE_BALANCE_PROHIBITED';
    throw err;
  }

  // 7. Update wallet authoritative balance
  await connection.query(
    'UPDATE wallets SET balance = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
    [balanceAfter, walletId]
  );

  // 8. Insert immutable transaction ledger record
  const [txResult] = await connection.query(
    `INSERT INTO wallet_transactions (
       wallet_id,
       transaction_type,
       amount,
       balance_before,
       balance_after,
       reference_type,
       reference_id,
       description,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [
      walletId,
      type,
      parsedAmount,
      balanceBefore,
      balanceAfter,
      referenceType || null,
      referenceId || null,
      description || null
    ]
  );

  return {
    transactionId: txResult.insertId,
    walletId,
    type,
    amount: parsedAmount,
    balanceBefore,
    balanceAfter,
    description,
    referenceType,
    referenceId,
    createdAt: new Date().toISOString()
  };
}

/**
 * Safely executes a balance operation with fully managed MySQL connection and rollback lifecycle
 *
 * @param {number} userId - Authenticated user identifier
 * @param {object} params
 * @param {string} params.type - Transaction type
 * @param {number} params.amount - Positive amount
 * @param {string} [params.description]
 * @param {string} [params.referenceType]
 * @param {number} [params.referenceId]
 * @returns {Promise<object>} Resulting transaction details
 */
async function executeManagedBalanceOperation(userId, {
  type,
  amount,
  description,
  referenceType,
  referenceId
}) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const wallet = await getOrCreateUserWallet(userId, conn);

    const result = await processBalanceOperation(conn, {
      walletId: wallet.id,
      type,
      amount,
      description,
      referenceType,
      referenceId
    });

    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Safely debits virtual demo credits from a user's wallet
 *
 * @param {number} userId
 * @param {object} params
 * @returns {Promise<object>}
 */
async function executeWalletDebit(userId, { amount, description, referenceType, referenceId }) {
  return executeManagedBalanceOperation(userId, {
    type: 'prediction_debit',
    amount,
    description: description || 'Virtual demo credits stake deduction',
    referenceType,
    referenceId
  });
}

/**
 * Safely credits virtual demo credits to a user's wallet (e.g. refund, adjustment, test grant)
 *
 * @param {number} userId
 * @param {object} params
 * @returns {Promise<object>}
 */
async function executeWalletCredit(userId, {
  amount,
  type = 'demo_adjustment',
  description,
  referenceType,
  referenceId
}) {
  return executeManagedBalanceOperation(userId, {
    type,
    amount,
    description: description || 'Virtual demo credit addition',
    referenceType,
    referenceId
  });
}

// ============================================================================
// DAY 9: PREDEFINED DEMO CREDIT PACKAGES & CLAIM LOGIC
// ============================================================================

const DEMO_PACKAGES = Object.freeze({
  starter: {
    id: 'starter',
    name: 'Starter',
    demoCredits: 500.00,
    description: '500 Virtual Demo Credits for casual testing and match previews.'
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    demoCredits: 1000.00,
    description: '1,000 Virtual Demo Credits for match coin-toss forecasting.'
  },
  advanced: {
    id: 'advanced',
    name: 'Advanced',
    demoCredits: 2500.00,
    description: '2,500 Virtual Demo Credits for seasoned cricket strategists.'
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    demoCredits: 5000.00,
    description: '5,000 Virtual Demo Credits for high-volume simulated participation.'
  }
});

/**
 * Retrieves the available server-defined virtual demo packages
 * @param {number} [userId] - Optional authenticated user ID to attach claim status
 * @returns {Promise<{ packages: Array, userClaim: object|null }>}
 */
async function getDemoPackages(userId = null) {
  const packagesList = Object.values(DEMO_PACKAGES).map((p) => ({
    id: p.id,
    name: p.name,
    demoCredits: p.demoCredits,
    description: p.description
  }));

  let userClaim = null;
  if (userId) {
    userClaim = await getUserClaimStatus(userId);
  }

  return {
    packages: packagesList,
    userClaim
  };
}

/**
 * Checks whether an authenticated user has already claimed their one-time virtual package
 * @param {number} userId
 * @returns {Promise<{ hasClaimed: boolean, claim: object|null }>}
 */
async function getUserClaimStatus(userId) {
  if (!userId) return { hasClaimed: false, claim: null };

  const [rows] = await pool.query(
    `SELECT package_id, demo_credits, idempotency_key, transaction_id, claimed_at
     FROM wallet_package_claims
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  if (rows.length === 0) {
    return { hasClaimed: false, claim: null };
  }

  const r = rows[0];
  const pkgConfig = DEMO_PACKAGES[r.package_id];

  return {
    hasClaimed: true,
    claim: {
      packageId: r.package_id,
      packageName: pkgConfig ? pkgConfig.name : r.package_id,
      demoCredits: roundCredits(r.demo_credits),
      claimedAt: r.claimed_at,
      transactionId: r.transaction_id
    }
  };
}

/**
 * Executes one-time demo-credit package claim with database-level uniqueness,
 * row-level locking, and idempotency protection.
 *
 * @param {object} params
 * @param {number} params.userId - Authenticated user identifier
 * @param {string} params.packageId - Server-validated package ID ('starter', 'standard', etc.)
 * @param {string} [params.idempotencyKey] - Client-supplied or generated unique operation key
 * @returns {Promise<object>}
 */
async function claimDemoPackage({ userId, packageId, idempotencyKey = null }) {
  if (!userId || !Number.isInteger(userId) || userId <= 0) {
    const err = new Error('Invalid authenticated user identity.');
    err.status = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  // 1. Validate packageId against server allowlist
  if (!packageId || typeof packageId !== 'string') {
    const err = new Error('Package identifier is required.');
    err.status = 400;
    err.code = 'INVALID_PACKAGE_ID';
    throw err;
  }

  const cleanPackageId = packageId.trim().toLowerCase();
  const selectedPackage = DEMO_PACKAGES[cleanPackageId];
  if (!selectedPackage) {
    const err = new Error(
      `Unknown demo package "${packageId}". Allowed packages: ${Object.keys(DEMO_PACKAGES).join(', ')}.`
    );
    err.status = 400;
    err.code = 'INVALID_PACKAGE_ID';
    throw err;
  }

  // 2. Validate / normalize idempotency key
  const finalIdempotencyKey = idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim().length >= 8
    ? idempotencyKey.trim().substring(0, 128)
    : `claim-${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // 3. Verify user status
  const [userRows] = await pool.query('SELECT status FROM users WHERE id = ?', [userId]);
  if (userRows.length === 0 || userRows[0].status !== 'active') {
    const err = new Error('Your account is not eligible for virtual credit allocations.');
    err.status = 403;
    err.code = 'ACCOUNT_NOT_ELIGIBLE';
    throw err;
  }

  // 4. Begin transaction with row-level locking
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Retrieve and serialize on user's wallet with exclusive row-level lock
    const wallet = await getOrCreateUserWallet(userId, conn);
    const [walletLock] = await conn.query(
      'SELECT id, balance FROM wallets WHERE id = ? FOR UPDATE',
      [wallet.id]
    );

    // 2. Check if user already claimed within serialized transaction
    const [existingClaims] = await conn.query(
      `SELECT id, package_id, demo_credits, idempotency_key, transaction_id, claimed_at
       FROM wallet_package_claims
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    if (existingClaims.length > 0) {
      const claim = existingClaims[0];
      // Check if this is an idempotent retry with the exact same key
      if (idempotencyKey && claim.idempotency_key === idempotencyKey.trim()) {
        await conn.commit();
        const pkg = DEMO_PACKAGES[claim.package_id];
        return {
          isReplay: true,
          packageId: claim.package_id,
          packageName: pkg ? pkg.name : claim.package_id,
          demoCredits: roundCredits(claim.demo_credits),
          demoCreditsGranted: roundCredits(claim.demo_credits),
          balanceBefore: roundCredits(walletLock[0].balance),
          newBalance: roundCredits(walletLock[0].balance),
          transactionId: claim.transaction_id,
          claimedAt: claim.claimed_at
        };
      }

      await conn.rollback();
      const err = new Error('You have already claimed your one-time virtual demo credit package.');
      err.status = 409;
      err.code = 'PACKAGE_ALREADY_CLAIMED';
      err.data = {
        claimedPackageId: claim.package_id,
        demoCredits: roundCredits(claim.demo_credits),
        claimedAt: claim.claimed_at
      };
      throw err;
    }

    // 3. Check if idempotency key was previously consumed (conflict defense)
    const [keyConflict] = await conn.query(
      'SELECT id, user_id FROM wallet_package_claims WHERE idempotency_key = ? LIMIT 1',
      [finalIdempotencyKey]
    );
    if (keyConflict.length > 0) {
      await conn.rollback();
      const err = new Error('Idempotency key has already been used for another operation.');
      err.status = 409;
      err.code = 'IDEMPOTENCY_KEY_CONFLICT';
      throw err;
    }
    const balanceBefore = roundCredits(walletLock[0].balance);
    const grantAmount = selectedPackage.demoCredits;
    const balanceAfter = roundCredits(balanceBefore + grantAmount);

    // Update wallet balance
    await conn.query(
      'UPDATE wallets SET balance = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
      [balanceAfter, wallet.id]
    );

    // Insert transaction into ledger
    const [txResult] = await conn.query(
      `INSERT INTO wallet_transactions (
         wallet_id,
         transaction_type,
         amount,
         balance_before,
         balance_after,
         reference_type,
         reference_id,
         description,
         created_at
       ) VALUES (?, 'demo_grant', ?, ?, ?, 'package_claim', NULL, ?, UTC_TIMESTAMP())`,
      [
        wallet.id,
        grantAmount,
        balanceBefore,
        balanceAfter,
        `Claimed ${selectedPackage.name} Package (${grantAmount.toLocaleString()} virtual demo credits)`
      ]
    );
    const transactionId = txResult.insertId;

    // Insert claim record into wallet_package_claims (unique constraint defense)
    const [claimResult] = await conn.query(
      `INSERT INTO wallet_package_claims (
         user_id,
         wallet_id,
         package_id,
         demo_credits,
         transaction_id,
         idempotency_key,
         claimed_at
       ) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [
        userId,
        wallet.id,
        cleanPackageId,
        grantAmount,
        transactionId,
        finalIdempotencyKey
      ]
    );
    const claimId = claimResult.insertId;

    // Cross-reference transaction to claim
    await conn.query(
      'UPDATE wallet_transactions SET reference_id = ? WHERE id = ?',
      [claimId, transactionId]
    );

    // Record welcome in-app notification
    await conn.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, 'Demo Credits Added', ?, 'wallet_grant', 0, UTC_TIMESTAMP())`,
      [
        userId,
        `Successfully funded your wallet with ${grantAmount.toLocaleString()} virtual demo credits (${selectedPackage.name} Package). 100% demo simulation.`
      ]
    );

    await conn.commit();

    return {
      isReplay: false,
      packageId: cleanPackageId,
      packageName: selectedPackage.name,
      demoCredits: grantAmount,
      demoCreditsGranted: grantAmount,
      balanceBefore,
      newBalance: balanceAfter,
      transactionId,
      claimedAt: new Date().toISOString()
    };
  } catch (error) {
    await conn.rollback();
    if (
      error.code === 'ER_DUP_ENTRY' ||
      error.errno === 1062 ||
      error.code === 'ER_LOCK_DEADLOCK' ||
      error.errno === 1213
    ) {
      const err = new Error('You have already claimed your one-time virtual demo credit package.');
      err.status = 409;
      err.code = 'PACKAGE_ALREADY_CLAIMED';
      throw err;
    }
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  VALID_TRANSACTION_TYPES,
  DEFAULT_INITIAL_CREDITS,
  DEMO_PACKAGES,
  roundCredits,
  getOrCreateUserWallet,
  getWalletBalance,
  getUserTransactions,
  processBalanceOperation,
  executeWalletDebit,
  executeWalletCredit,
  getDemoPackages,
  getUserClaimStatus,
  claimDemoPackage
};

