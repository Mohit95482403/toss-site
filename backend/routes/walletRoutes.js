/**
 * TossArena Wallet Routes
 * Endpoints for virtual demo-credit balance, transaction ledger, package catalogue,
 * and one-time funding simulation.
 */

const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticate, optionalAuthenticate } = require('../middleware/authenticate');
const { verifyCsrf } = require('../middleware/csrfProtection');

// GET /api/wallet/demo-packages - Catalogue of server-defined virtual packages (accessible with or without session)
router.get('/demo-packages', optionalAuthenticate, walletController.getDemoPackages);

// All subsequent wallet endpoints strictly require active authenticated session
router.use(authenticate);

// GET /api/wallet/me - Retrieve current authoritative demo credit balance
router.get('/me', walletController.getMyWallet);

// GET /api/wallet/transactions - Retrieve paginated immutable ledger history
router.get('/transactions', walletController.getMyTransactions);

// GET /api/wallet/claim-status - Check if user has claimed their one-time virtual package
router.get('/claim-status', walletController.getClaimStatus);

// POST /api/wallet/claim-demo-credits - Claim one-time virtual demo credit package (CSRF-protected)
router.post('/claim-demo-credits', verifyCsrf, walletController.claimDemoCredits);

module.exports = router;
