/**
 * TossArena Admin Toss Result Controller (Day 12)
 * Request handlers for administrative toss result management, previewing,
 * transactional publication, outcome evaluation, and explicit corrections.
 */

const adminResultService = require('../services/adminResultService');

/**
 * GET /api/admin/results
 * Returns paginated, searchable, filtered match results for administration
 */
async function getAdminResults(req, res, next) {
  try {
    const {
      page,
      limit,
      search,
      resultStatus,
      matchStatus,
      dateFilter,
      dateFrom,
      dateTo,
      sort
    } = req.query;

    const data = await adminResultService.getAdminResults({
      page,
      limit,
      search,
      resultStatus,
      matchStatus,
      dateFilter,
      dateFrom,
      dateTo,
      sort
    });

    return res.status(200).json({
      success: true,
      data: {
        matches: data.matches,
        pagination: data.pagination,
        summary: data.summary
      },
      matches: data.matches,
      pagination: data.pagination,
      summary: data.summary
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/admin/results/overview
 * Returns aggregate metrics for result management cards
 */
async function getResultOverview(req, res, next) {
  try {
    const summary = await adminResultService.getResultOverviewStatistics();
    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/admin/results/:matchId
 * Returns detailed toss result information, breakdown, and eligibility for a single match
 */
async function getMatchResultDetails(req, res, next) {
  try {
    const { matchId } = req.params;
    const match = await adminResultService.getMatchResultDetails(matchId);

    return res.status(200).json({
      success: true,
      data: match
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/admin/results/:matchId/preview
 * Previews proposed toss result and calculates potential prediction outcomes without modifying database
 */
async function previewTossResult(req, res, next) {
  try {
    const { matchId } = req.params;
    const { tossWinner, tossDecision } = req.body || {};

    const preview = await adminResultService.previewTossResult(matchId, {
      tossWinner,
      tossDecision
    });

    return res.status(200).json({
      success: true,
      data: preview
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/admin/results/:matchId/publish
 * Atomically publishes verified toss result and evaluates predictions
 */
async function publishTossResult(req, res, next) {
  try {
    const { matchId } = req.params;
    const { tossWinner, tossDecision, sourceNote } = req.body || {};
    const adminUser = req.user;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const result = await adminResultService.publishTossResult(
      matchId,
      { tossWinner, tossDecision, sourceNote },
      adminUser,
      ipAddress
    );

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/admin/results/:matchId/correct
 * Explicit admin workflow to correct an already published result
 */
async function correctTossResult(req, res, next) {
  try {
    const { matchId } = req.params;
    const { tossWinner, tossDecision, reason, correctionReason, sourceNote } = req.body || {};
    const effectiveReason = reason || correctionReason;
    const adminUser = req.user;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const result = await adminResultService.correctTossResult(
      matchId,
      { tossWinner, tossDecision, reason: effectiveReason, sourceNote },
      adminUser,
      ipAddress
    );

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/matches/:matchId/result
 * Public-facing query for published match toss results
 */
async function getPublicMatchResult(req, res, next) {
  try {
    const { matchId, id } = req.params;
    const resolvedId = matchId || id;

    const result = await adminResultService.getPublicMatchResult(resolvedId);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getAdminResults,
  getResultOverview,
  getMatchResultDetails,
  previewTossResult,
  publishTossResult,
  correctTossResult,
  getPublicMatchResult
};
