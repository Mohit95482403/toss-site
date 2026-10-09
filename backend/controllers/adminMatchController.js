/**
 * TossArena Admin Match Controller (Day 11)
 * Express request handlers for administrator match management.
 */

const adminMatchService = require('../services/adminMatchService');

/**
 * GET /api/admin/matches
 * Returns paginated, searchable, filtered match fixtures for administrators
 */
async function getAdminMatches(req, res, next) {
  try {
    const {
      page,
      limit,
      search,
      status,
      dateFilter,
      dateFrom,
      dateTo,
      sort
    } = req.query;

    const result = await adminMatchService.getAdminMatches({
      page,
      limit,
      search,
      status,
      dateFilter,
      dateFrom,
      dateTo,
      sort
    });

    return res.status(200).json({
      success: true,
      data: result.matches,
      pagination: result.pagination,
      summary: result.summary
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/admin/matches/summary
 * Returns match breakdown metrics for admin dashboard cards
 */
async function getMatchSummary(req, res, next) {
  try {
    const summary = await adminMatchService.getMatchSummaryStatistics();
    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/admin/matches/:id
 * Retrieves full single match details with prediction breakdown
 */
async function getAdminMatchById(req, res, next) {
  try {
    const { id } = req.params;
    const match = await adminMatchService.getAdminMatchById(id);

    return res.status(200).json({
      success: true,
      data: match
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/admin/matches
 * Creates a new cricket match fixture
 */
async function createMatch(req, res, next) {
  try {
    const matchData = req.body;
    const adminUser = req.user;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const newMatch = await adminMatchService.createMatch(matchData, adminUser, ipAddress);

    return res.status(201).json({
      success: true,
      message: 'Match fixture created successfully.',
      data: newMatch
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/admin/matches/:id
 * Updates editable fields of an existing match
 */
async function updateMatch(req, res, next) {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const adminUser = req.user;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const updated = await adminMatchService.updateMatch(id, updateData, adminUser, ipAddress);

    return res.status(200).json({
      success: true,
      message: 'Match details updated successfully.',
      data: updated
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/admin/matches/:id/status
 * Updates match lifecycle status
 */
async function updateMatchStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const adminUser = req.user;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status field is required.',
        code: 'MISSING_STATUS'
      });
    }

    const updated = await adminMatchService.updateMatchStatus(id, status, adminUser, ipAddress);

    return res.status(200).json({
      success: true,
      message: `Match status updated to "${updated.status}".`,
      data: updated
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/admin/matches/:id/cancel
 * Safely cancels a match fixture
 */
async function cancelMatch(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminUser = req.user;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const cancelled = await adminMatchService.cancelMatch(id, reason, adminUser, ipAddress);

    return res.status(200).json({
      success: true,
      message: 'Match fixture has been cancelled successfully. Historical predictions have been preserved.',
      data: cancelled
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getAdminMatches,
  getMatchSummary,
  getAdminMatchById,
  createMatch,
  updateMatch,
  updateMatchStatus,
  cancelMatch
};
