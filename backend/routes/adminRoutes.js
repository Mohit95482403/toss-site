/**
 * TossArena Admin Routes (Day 11)
 * Express router for administrative match management, status controls, and audit views.
 * Strictly protected by authentication and role-based authorization ('admin').
 */

const express = require('express');
const router = express.Router();
const adminMatchController = require('../controllers/adminMatchController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { verifyCsrf } = require('../middleware/csrfProtection');

// Enforce authentication and administrator authorization across all /api/admin routes
router.use(authenticate);
router.use(authorize('admin'));

// GET /api/admin/matches/summary - Match metrics for dashboard cards
router.get('/matches/summary', adminMatchController.getMatchSummary);

// GET /api/admin/matches - Paginated, searchable, filtered match fixtures list
router.get('/matches', adminMatchController.getAdminMatches);

// GET /api/admin/matches/:id - Single match detail with prediction breakdown
router.get('/matches/:id', adminMatchController.getAdminMatchById);

// POST /api/admin/matches - Create new cricket match fixture (CSRF protected)
router.post('/matches', verifyCsrf, adminMatchController.createMatch);

// PATCH /api/admin/matches/:id - Update editable match fields (CSRF protected)
router.patch('/matches/:id', verifyCsrf, adminMatchController.updateMatch);

// PATCH /api/admin/matches/:id/status - Update match status lifecycle (CSRF protected)
router.patch('/matches/:id/status', verifyCsrf, adminMatchController.updateMatchStatus);

// POST /api/admin/matches/:id/cancel - Safely cancel match fixture (CSRF protected)
router.post('/matches/:id/cancel', verifyCsrf, adminMatchController.cancelMatch);

module.exports = router;
