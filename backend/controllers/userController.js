/**
 * TossArena User Profile Controller
 * Handles user profile retrieval and authorized self-service updates.
 * Strictly derives user identity from server-side session to prevent user impersonation.
 */

const { pool } = require('../config/db');
const { getUserById } = require('../services/authService');

/**
 * GET /api/users/me
 * Retrieves current user profile with virtual credit balance
 */
async function getProfile(req, res, next) {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.'
      });
    }

    return res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/users/me
 * Allows authenticated user to update permitted profile fields (fullName)
 * Prevents mass-assignment and rejects modifications to role, status, email, or id.
 */
async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { fullName } = req.body || {};

    // 1. Validate full name input
    if (fullName === undefined || fullName === null) {
      return res.status(400).json({
        success: false,
        message: 'No updatable fields provided.'
      });
    }

    const trimmedName = typeof fullName === 'string' ? fullName.trim() : '';

    if (!trimmedName || trimmedName.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be at least 2 characters long.'
      });
    }

    if (trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Full name cannot exceed 100 characters.'
      });
    }

    if (/<[^>]*>/g.test(trimmedName)) {
      return res.status(400).json({
        success: false,
        message: 'Full name cannot contain HTML or script markup.'
      });
    }

    // 2. Perform parameterized update in MySQL
    await pool.query(
      'UPDATE users SET full_name = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
      [trimmedName, userId]
    );

    // 3. Fetch fresh user object
    const updatedUser = await getUserById(userId);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: updatedUser
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile
};
