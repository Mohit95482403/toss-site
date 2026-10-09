/**
 * TossArena Prediction Controller
 * HTTP request validation, parameter extraction, and standardized responses for toss predictions.
 * Supports Day 10 prediction history, prediction details, and performance statistics.
 */

const predictionService = require('../services/predictionService');

/**
 * POST /api/predictions
 * Submits a new toss prediction
 */
async function submitPrediction(req, res, next) {
  try {
    const { matchId, match_id, predictedTeam, predicted_team } = req.body || {};

    const resolvedMatchId = matchId !== undefined ? matchId : match_id;
    const resolvedPredictedTeam = predictedTeam !== undefined ? predictedTeam : predicted_team;

    if (resolvedMatchId === undefined || resolvedMatchId === null) {
      return res.status(400).json({
        success: false,
        message: 'Match ID is required.',
        code: 'MISSING_MATCH_ID'
      });
    }

    if (!resolvedPredictedTeam || typeof resolvedPredictedTeam !== 'string' || resolvedPredictedTeam.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Predicted team selection is required.',
        code: 'MISSING_PREDICTED_TEAM'
      });
    }

    // Never trust client-supplied user ID; use authoritative authenticated session user
    const userId = req.user.id;

    const savedPrediction = await predictionService.submitPrediction({
      userId,
      matchId: resolvedMatchId,
      predictedTeam: resolvedPredictedTeam
    });

    return res.status(201).json({
      success: true,
      message: 'Your toss prediction has been submitted successfully.',
      data: savedPrediction
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
        code: err.code || 'PREDICTION_ERROR'
      });
    }
    return next(err);
  }
}

/**
 * GET /api/predictions and GET /api/predictions/me
 * Retrieves current authenticated user's prediction history with filters, search, sort, and pagination
 */
async function getPredictionsHistory(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      page,
      limit,
      search,
      status,
      dateFrom,
      dateTo,
      datePreset,
      sort
    } = req.query;

    const result = await predictionService.getUserPredictions(userId, {
      page,
      limit,
      search,
      status,
      dateFrom,
      dateTo,
      datePreset,
      sort
    });

    return res.status(200).json({
      success: true,
      data: result.predictions,
      pagination: result.pagination,
      filters: result.filtersApplied
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
        code: err.code || 'PREDICTION_ERROR'
      });
    }
    return next(err);
  }
}

/**
 * GET /api/predictions/:id
 * Retrieves details for a single prediction with match and result verification
 */
async function getPredictionDetails(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const prediction = await predictionService.getPredictionById(userId, id);

    return res.status(200).json({
      success: true,
      data: prediction
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
        code: err.code || 'PREDICTION_ERROR'
      });
    }
    return next(err);
  }
}

/**
 * GET /api/predictions/statistics
 * Calculates authoritative statistics for the authenticated user
 */
async function getPredictionStatistics(req, res, next) {
  try {
    const userId = req.user.id;

    const stats = await predictionService.getUserPredictionStatistics(userId);

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
        code: err.code || 'STATISTICS_ERROR'
      });
    }
    return next(err);
  }
}

/**
 * GET /api/predictions/me/match/:matchId
 * Checks whether user has already predicted a specific match
 */
async function getMyPredictionForMatch(req, res, next) {
  try {
    const userId = req.user.id;
    const { matchId } = req.params;

    const result = await predictionService.getUserPredictionForMatch(userId, matchId);

    return res.status(200).json({
      success: true,
      hasPredicted: result.hasPredicted,
      data: result.prediction
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        message: err.message,
        code: err.code || 'PREDICTION_ERROR'
      });
    }
    return next(err);
  }
}

module.exports = {
  submitPrediction,
  getPredictionsHistory,
  getMyPredictions: getPredictionsHistory, // Compatible alias for Day 7 endpoint
  getPredictionDetails,
  getPredictionStatistics,
  getMyPredictionForMatch
};
