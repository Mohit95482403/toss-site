/**
 * TossArena Wallet Controller
 * Handles HTTP endpoints for virtual demo-credit balance, immutable transaction ledger history,
 * package catalog retrieval, and one-time simulated funding claims.
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
      transactions: result.transactions,
      pagination: result.pagination
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/wallet/demo-packages
 * Retrieves server-defined virtual demo packages and current user's claim status
 */
async function getDemoPackages(req, res, next) {
  try {
    const userId = req.user?.id || req.session?.userId || null;
    const result = await walletService.getDemoPackages(userId);

    return res.status(200).json({
      success: true,
      data: result.packages,
      packages: result.packages,
      userClaim: result.userClaim
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/wallet/claim-status
 * Retrieves whether the authenticated user has already claimed their one-time virtual demo package
 */
async function getClaimStatus(req, res, next) {
  try {
    const userId = req.user.id;
    const result = await walletService.getUserClaimStatus(userId);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/wallet/claim-demo-credits
 * Submits a one-time simulated virtual credit funding claim for the selected package
 */
async function claimDemoCredits(req, res, next) {
  try {
    const userId = req.user.id;
    const { packageId, idempotencyKey } = req.body || {};

    if (!packageId || typeof packageId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Package identifier (packageId) is required.',
        code: 'INVALID_PACKAGE_ID'
      });
    }

    // Explicitly reject client-supplied balance modifications
    if (req.body.demoCredits !== undefined || req.body.balance !== undefined || req.body.amount !== undefined) {
      return res.status(400).json({
        success: false,
        message: 'Client cannot specify credit amounts. Amounts are determined strictly by server package configuration.',
        code: 'CLIENT_AMOUNT_REJECTED'
      });
    }

    const result = await walletService.claimDemoPackage({
      userId,
      packageId,
      idempotencyKey
    });

    const statusCode = result.isReplay ? 200 : 201;

    return res.status(statusCode).json({
      success: true,
      message: result.isReplay
        ? 'Demo credit package already claimed (idempotent replay).'
        : `Successfully added ${result.demoCredits.toLocaleString()} virtual demo credits to your wallet.`,
      data: result
    });
  } catch (error) {
    // If error carries conflict data
    if (error.code === 'PACKAGE_ALREADY_CLAIMED') {
      return res.status(409).json({
        success: false,
        message: error.message,
        code: error.code,
        data: error.data || null
      });
    }
    return next(error);
  }
}

module.exports = {
  getMyWallet,
  getMyTransactions,
  getDemoPackages,
  getClaimStatus,
  claimDemoCredits
};
