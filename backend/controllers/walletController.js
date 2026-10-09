/**
 * TossArena Wallet Controller
 * Handles HTTP endpoints for virtual demo-credit balance and immutable transaction ledger history.
 * Strictly derives user identity from server-side authenticated session.
 */

const walletService = require('../services/walletService');

/**
 * GET /api/wallet/me
 * Retrieves the current authoritative virtual demo credit balance for the authenticated user
 */
async function getMyWallet(req, res, next) {
  try {
    const userId = req.user.id;
    const walletData = await walletService.getWalletBalance(userId);

    return res.status(200).json({
      success: true,
      data: {
        walletId: walletData.walletId,
        balance: walletData.balance,
        currency: walletData.currency,
        updatedAt: walletData.updatedAt
      }
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/wallet/transactions
 * Retrieves paginated transaction history from the immutable ledger for the authenticated user
 */
async function getMyTransactions(req, res, next) {
  try {
    const userId = req.user.id;
    const { page, limit, type, sort } = req.query;

    const result = await walletService.getUserTransactions(userId, {
      page,
      limit,
      type,
      sort
    });

    return res.status(200).json({
      success: true,
      data: result.transactions,
      pagination: result.pagination
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getMyWallet,
  getMyTransactions
};
