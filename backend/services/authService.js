/**
 * TossArena Authentication Service
 * Core business logic for registration, credential verification, and user state.
 */

const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { security } = require('../config/env');

/**
 * Registers a new regular user account and provisions initial demo wallet
 * @param {{ fullName: string, email: string, password: string }} data
 * @returns {Promise<{ user: object }>}
 */
async function registerUser({ fullName, email, password }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Check if email already registered
    const [existing] = await connection.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existing.length > 0) {
      const err = new Error('An account with this email address already exists.');
      err.code = 'EMAIL_IN_USE';
      err.statusCode = 409;
      throw err;
    }

    // 2. Hash password securely
    const saltRounds = security.bcryptRounds || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 3. Insert user record - Force role to 'user' and status to 'active'
    const [userResult] = await connection.query(
      `INSERT INTO users (full_name, email, password_hash, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'user', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [fullName, email, passwordHash]
    );

    const userId = userResult.insertId;

    // 4. Provision virtual demo wallet with 1,000 initial virtual credits
    const initialCredits = 1000.00;
    const [walletResult] = await connection.query(
      `INSERT INTO wallets (user_id, balance, created_at, updated_at)
       VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [userId, initialCredits]
    );

    const walletId = walletResult.insertId;

    // 5. Record initial demo onboarding grant transaction
    await connection.query(
      `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, balance_before, balance_after, description, created_at)
       VALUES (?, 'demo_grant', ?, 0.00, ?, 'Welcome onboarding demo credit allocation (strictly virtual)', UTC_TIMESTAMP())`,
      [walletId, initialCredits, initialCredits]
    );

    // 6. Record welcome notification
    await connection.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, 'Welcome to TossArena!', 'Your account has been granted 1,000 virtual demo credits to participate in toss predictions.', 'wallet_grant', 0, UTC_TIMESTAMP())`,
      [userId]
    );

    await connection.commit();

    return {
      user: {
        id: userId,
        fullName,
        email,
        role: 'user',
        status: 'active',
        demoBalance: initialCredits
      }
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Verifies credentials and checks account status
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<{ success: boolean, reason?: string, message?: string, user?: object }>}
 */
async function authenticateUser({ email, password }) {
  // 1. Fetch user by email
  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, u.role, u.status, w.balance AS demo_balance
     FROM users u
     LEFT JOIN wallets w ON u.id = w.user_id
     WHERE u.email = ?
     LIMIT 1`,
    [email]
  );

  if (rows.length === 0) {
    return {
      success: false,
      reason: 'INVALID_CREDENTIALS',
      message: 'Invalid email address or password.'
    };
  }

  const user = rows[0];

  // 2. Verify password against hash
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return {
      success: false,
      reason: 'INVALID_CREDENTIALS',
      message: 'Invalid email address or password.'
    };
  }

  // 3. Verify account status
  if (user.status === 'suspended') {
    return {
      success: false,
      reason: 'ACCOUNT_SUSPENDED',
      message: 'Your account is suspended. Please contact platform support.'
    };
  }

  if (user.status === 'banned') {
    return {
      success: false,
      reason: 'ACCOUNT_BANNED',
      message: 'Your account has been permanently disabled.'
    };
  }

  if (user.status !== 'active') {
    return {
      success: false,
      reason: 'ACCOUNT_INACTIVE',
      message: 'Account is not in an active state.'
    };
  }

  // 4. Update last login timestamp
  try {
    await pool.query(
      'UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?',
      [user.id]
    );
  } catch (err) {
    // Non-fatal if timestamp update fails
    console.error('Failed to update last_login_at:', err.message);
  }

  return {
    success: true,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      status: user.status,
      demoBalance: user.demo_balance !== null ? parseFloat(user.demo_balance) : 0.00
    }
  };
}

/**
 * Retrieves safe profile information for a user by ID
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
async function getUserById(userId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at, u.last_login_at, w.balance AS demo_balance
     FROM users u
     LEFT JOIN wallets w ON u.id = w.user_id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );

  if (rows.length === 0) return null;

  const u = rows[0];
  return {
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    role: u.role,
    status: u.status,
    demoBalance: u.demo_balance !== null ? parseFloat(u.demo_balance) : 0.00,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at
  };
}

module.exports = {
  registerUser,
  authenticateUser,
  getUserById
};
