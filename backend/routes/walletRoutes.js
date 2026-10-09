/**
 * TossArena Wallet Routes
 * Authenticated endpoints for virtual demo-credit balance and transaction ledger.
 */

const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authenticate } = require('../middleware/authenticate');

// All wallet endpoints strictly require active authenticated user session
router.use(authenticate);

// GET /api/wallet/me - Retrieve current authoritative demo credit balance
router.get('/me', walletController.getMyWallet);

// GET /api/wallet/transactions - Retrieve paginated immutable ledger history
router.get('/transactions', walletController.getMyTransactions);

module.exports = router;
