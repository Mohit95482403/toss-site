/**
 * TossArena Admin Routes (Day 11)
 * Express router for administrative match management, status controls, and audit views.
 * Strictly protected by authentication and role-based authorization ('admin').
 */

const express = require('express');
const router = express.Router();
const adminMatchController = require('../controllers/adminMatchController');
const adminResultController = require('../controllers/adminResultController');
const adminDashboardController = require('../controllers/adminDashboardController');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { verifyCsrf } = require('../middleware/csrfProtection');

// Enforce authentication and administrator authorization across all /api/admin routes
router.use(authenticate);
router.use(authorize('admin'));

// ----------------------------------------------------------------------------
// EXECUTIVE ADMIN DASHBOARD & AUDIT ENDPOINTS
// ----------------------------------------------------------------------------

// GET /api/admin/dashboard/overview - Executive summary metrics across users, matches, results, and audits
router.get('/dashboard/overview', adminDashboardController.getDashboardOverview);

// GET /api/admin/audit-logs - Paginated system audit logs
router.get('/audit-logs', adminDashboardController.getAuditLogs);

// GET /api/admin/users - Paginated user management records
router.get('/users', adminDashboardController.getAdminUsers);

// ----------------------------------------------------------------------------
// MATCH MANAGEMENT ENDPOINTS (Day 11)
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// VERIFIED TOSS RESULT MANAGEMENT ENDPOINTS (Day 12)
// ----------------------------------------------------------------------------

// GET /api/admin/results/overview - Summary metrics for result management cards
router.get('/results/overview', adminResultController.getResultOverview);

// GET /api/admin/results - Paginated, searchable, filtered matches for result management
router.get('/results', adminResultController.getAdminResults);

// GET /api/admin/results/:matchId - Detailed toss result info and eligibility for a match
router.get('/results/:matchId', adminResultController.getMatchResultDetails);

// POST /api/admin/results/:matchId/preview - Preview proposed result & potential prediction outcomes
router.post('/results/:matchId/preview', verifyCsrf, adminResultController.previewTossResult);

// POST /api/admin/results/:matchId/publish - Publish verified result & evaluate predictions (Transactional)
router.post('/results/:matchId/publish', verifyCsrf, adminResultController.publishTossResult);

// POST /api/admin/results/:matchId/correct - Explicit admin correction workflow with reason & re-evaluation
router.post('/results/:matchId/correct', verifyCsrf, adminResultController.correctTossResult);

module.exports = router;

