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

module.exports = {
  VALID_TRANSACTION_TYPES,
  DEFAULT_INITIAL_CREDITS,
  roundCredits,
  getOrCreateUserWallet,
  getWalletBalance,
  getUserTransactions,
  processBalanceOperation,
  executeWalletDebit,
  executeWalletCredit
};
