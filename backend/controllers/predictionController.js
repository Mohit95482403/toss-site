/**
 * TossArena Prediction Controller
 * HTTP request validation, parameter extraction, and standardized responses for toss predictions.
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
 * GET /api/predictions/me
 * Retrieves current authenticated user's prediction history
 */
async function getMyPredictions(req, res, next) {
  try {
    const userId = req.user.id;
    const { page, limit } = req.query;

    const result = await predictionService.getUserPredictions(userId, { page, limit });

    return res.status(200).json({
      success: true,
      data: result.predictions,
      pagination: result.pagination
    });
  } catch (err) {
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
  getMyPredictions,
  getMyPredictionForMatch
};
