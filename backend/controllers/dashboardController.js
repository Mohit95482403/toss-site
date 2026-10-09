/**
 * TossArena Dashboard Controller
 * Aggregates user-specific statistics, wallet balance, and audit activity.
 * Strictly derives user identity from server-side authenticated session.
 */

const { pool } = require('../config/db');
const predictionService = require('../services/predictionService');

/**
 * GET /api/dashboard/summary
 * Retrieves summary statistics and account status for the authenticated user
 */
async function getSummary(req, res, next) {
  try {
    const userId = req.user.id;

    // 1. Fetch wallet balance
    const [walletRows] = await pool.query(
      'SELECT balance FROM wallets WHERE user_id = ? LIMIT 1',
      [userId]
    );

    const demoCreditBalance = walletRows.length > 0
      ? parseFloat(walletRows[0].balance)
      : null;

    // 2. Fetch predictions aggregates (using existing schema)
    const [predRows] = await pool.query(
      `SELECT
         COUNT(*) AS total_predictions,
         SUM(CASE WHEN status IN ('correct', 'incorrect') THEN 1 ELSE 0 END) AS completed_predictions
       FROM predictions
       WHERE user_id = ?`,
      [userId]
    );

    const predictionsMade = parseInt(predRows[0]?.total_predictions || 0, 10);
    const completedPredictions = parseInt(predRows[0]?.completed_predictions || 0, 10);

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: req.user.id,
          fullName: req.user.fullName,
          email: req.user.email,
          role: req.user.role,
          status: req.user.status,
          createdAt: req.user.createdAt,
          lastLoginAt: req.user.lastLoginAt
        },
        stats: {
          accountStatus: req.user.status === 'active' ? 'Active' : req.user.status,
          predictionsMade,
          completedPredictions,
          demoCreditBalance
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/dashboard/activity
 * Retrieves the recent activity timeline for the authenticated user
 */
async function getActivity(req, res, next) {
  try {
    const userId = req.user.id;

    // 1. Fetch recent transactions belonging to the user's wallet
    const [txRows] = await pool.query(
      `SELECT wt.id, wt.transaction_type, wt.amount, wt.balance_before, wt.balance_after,
              wt.description, wt.created_at
       FROM wallet_transactions wt
       JOIN wallets w ON wt.wallet_id = w.id
       WHERE w.user_id = ?
       ORDER BY wt.created_at DESC
       LIMIT 10`,
      [userId]
    );

    // 2. Fetch notifications belonging to the user
    const [notifRows] = await pool.query(
      `SELECT id, title, message, type, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    // 3. Map into unified activity items
    const activities = [];

    txRows.forEach((tx) => {
      let title = 'Demo Credit Transaction';
      let sign = '+';

      if (tx.transaction_type === 'demo_grant') {
        title = 'Demo Credits Granted';
        sign = '+';
      } else if (tx.transaction_type === 'prediction_debit') {
        title = 'Toss Prediction Stake';
        sign = '-';
      } else if (tx.transaction_type === 'prediction_refund') {
        title = 'Prediction Stake Refund';
        sign = '+';
      } else if (tx.transaction_type === 'demo_result_credit') {
        title = 'Prediction Reward Credit';
        sign = '+';
      }

      activities.push({
        id: `tx_${tx.id}`,
        category: 'wallet',
        type: tx.transaction_type,
        title,
        description: tx.description || 'Virtual demo credit ledger entry',
        amount: `${sign}${parseFloat(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} Credits`,
        createdAt: tx.created_at
      });
    });

    notifRows.forEach((n) => {
      activities.push({
        id: `notif_${n.id}`,
        category: 'notification',
        type: n.type,
        title: n.title,
        description: n.message,
        amount: null,
        createdAt: n.created_at
      });
    });

    // 4. Sort all activities by newest first
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.status(200).json({
      success: true,
      count: activities.length,
      data: {
        activities: activities.slice(0, 15)
      }
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/dashboard/statistics
 * Returns authoritative user prediction performance statistics
 */
async function getStatistics(req, res, next) {
  try {
    const stats = await predictionService.getUserPredictionStatistics(req.user.id);
    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getSummary,
  getActivity,
  getStatistics
};
