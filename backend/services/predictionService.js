/**
 * TossArena Prediction Service
 * Core business rules, validation, concurrency control, and database operations for toss predictions.
 */

const { pool } = require('../config/db');

/**
 * Submits a new toss prediction for an authenticated user
 *
 * @param {object} params
 * @param {number} params.userId - Authenticated user ID (derived from session)
 * @param {number} params.matchId - Match database ID
 * @param {string} params.predictedTeam - Selected team name
 * @returns {Promise<{ id: number, matchId: number, predictedTeam: string, status: string, createdAt: string }>}
 */
async function submitPrediction({ userId, matchId, predictedTeam }) {
  // 1. Validate user ID
  if (!userId || !Number.isInteger(userId) || userId <= 0) {
    const err = new Error('Invalid authenticated user identity.');
    err.status = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  // 2. Validate match ID
  const parsedMatchId = parseInt(matchId, 10);
  if (isNaN(parsedMatchId) || parsedMatchId <= 0 || !/^[1-9]\d*$/.test(String(matchId).trim())) {
    const err = new Error('Invalid match ID. Must be a positive integer.');
    err.status = 400;
    err.code = 'INVALID_MATCH_ID';
    throw err;
  }

  // 3. Validate predicted team string
  if (!predictedTeam || typeof predictedTeam !== 'string' || predictedTeam.trim().length === 0) {
    const err = new Error('Predicted team is required.');
    err.status = 400;
    err.code = 'MISSING_PREDICTED_TEAM';
    throw err;
  }

  const cleanPredictedTeam = predictedTeam.trim();

  // 4. Retrieve match fixture from MySQL
  const [matchRows] = await pool.query(
    'SELECT id, title, team_a, team_b, tournament_name, venue, scheduled_at, status FROM matches WHERE id = ?',
    [parsedMatchId]
  );

  if (matchRows.length === 0) {
    const err = new Error('Match fixture not found.');
    err.status = 404;
    err.code = 'MATCH_NOT_FOUND';
    throw err;
  }

  const match = matchRows[0];

  // 5. Validate match status eligibility
  const matchStatus = (match.status || '').toLowerCase();

  if (matchStatus === 'locked') {
    const err = new Error('Prediction submissions are locked for this match.');
    err.status = 409;
    err.code = 'MATCH_LOCKED';
    throw err;
  }

  if (matchStatus === 'completed') {
    const err = new Error('Match has already concluded. Prediction submissions are closed.');
    err.status = 409;
    err.code = 'MATCH_COMPLETED';
    throw err;
  }

  if (matchStatus === 'cancelled') {
    const err = new Error('Match fixture has been cancelled. Predictions cannot be accepted.');
    err.status = 409;
    err.code = 'MATCH_CANCELLED';
    throw err;
  }

  if (matchStatus !== 'open') {
    const err = new Error(`Prediction window is currently ${matchStatus} for this match.`);
    err.status = 422;
    err.code = 'MATCH_NOT_OPEN';
    throw err;
  }

  // 6. Validate cutoff time (server authoritative time in UTC)
  if (match.scheduled_at) {
    const scheduledTime = new Date(match.scheduled_at).getTime();
    const now = Date.now();
    if (scheduledTime <= now) {
      const err = new Error('Prediction cutoff time has passed for this match.');
      err.status = 409;
      err.code = 'CUTOFF_PASSED';
      throw err;
    }
  }

  // 7. Validate team selection against match competitors
  const teamALower = (match.team_a || '').trim().toLowerCase();
  const teamBLower = (match.team_b || '').trim().toLowerCase();
  const predictedLower = cleanPredictedTeam.toLowerCase();

  let canonicalTeam = null;
  if (predictedLower === teamALower) {
    canonicalTeam = match.team_a;
  } else if (predictedLower === teamBLower) {
    canonicalTeam = match.team_b;
  } else {
    const err = new Error(`Invalid team selection. Predicted team must be either "${match.team_a}" or "${match.team_b}".`);
    err.status = 422;
    err.code = 'INVALID_TEAM_SELECTION';
    throw err;
  }

  // 8. Pre-check for existing prediction by this user for this match
  const [existingRows] = await pool.query(
    'SELECT id, predicted_toss_winner, status, created_at FROM predictions WHERE user_id = ? AND match_id = ?',
    [userId, parsedMatchId]
  );

  if (existingRows.length > 0) {
    const err = new Error('You have already submitted a prediction for this match.');
    err.status = 409;
    err.code = 'DUPLICATE_PREDICTION';
    throw err;
  }

  // 9. Persist prediction with atomic duplicate handling via unique constraint
  try {
    const [result] = await pool.query(
      `INSERT INTO predictions (
         user_id,
         match_id,
         predicted_toss_winner,
         demo_credits_used,
         status,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, 0.00, 'pending', UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [userId, parsedMatchId, canonicalTeam]
    );

    return {
      id: result.insertId,
      matchId: parsedMatchId,
      matchTitle: match.title,
      predictedTeam: canonicalTeam,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
  } catch (dbError) {
    // Handle duplicate key error (race condition defense)
    if (dbError.code === 'ER_DUP_ENTRY' || dbError.errno === 1062) {
      const err = new Error('You have already submitted a prediction for this match.');
      err.status = 409;
      err.code = 'DUPLICATE_PREDICTION';
      throw err;
    }
    throw dbError;
  }
}

/**
 * Retrieves prediction history for the authenticated user
 *
 * @param {number} userId - Authenticated user ID
 * @param {object} options - Pagination options
 * @param {number} options.page - 1-indexed page
 * @param {number} options.limit - Items per page
 * @returns {Promise<{ predictions: Array, pagination: object }>}
 */
async function getUserPredictions(userId, { page = 1, limit = 20 } = {}) {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (parsedPage - 1) * parsedLimit;

  // 1. Total count
  const [countRows] = await pool.query(
    'SELECT COUNT(*) AS total FROM predictions WHERE user_id = ?',
    [userId]
  );
  const total = parseInt(countRows[0]?.total || 0, 10);
  const totalPages = Math.ceil(total / parsedLimit);

  // 2. Fetch paginated records joined with match details
  const [rows] = await pool.query(
    `SELECT
       p.id,
       p.user_id,
       p.match_id,
       p.predicted_toss_winner,
       p.demo_credits_used,
       p.status AS prediction_status,
       p.created_at,
       p.updated_at,
       m.title AS match_title,
       m.team_a,
       m.team_b,
       m.tournament_name,
       m.venue,
       m.scheduled_at,
       m.status AS match_status,
       m.result_toss_winner,
       m.result_decision
     FROM predictions p
     JOIN matches m ON p.match_id = m.id
     WHERE p.user_id = ?
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, parsedLimit, offset]
  );

  return {
    predictions: rows.map(r => ({
      id: r.id,
      matchId: r.match_id,
      matchTitle: r.match_title,
      teamA: r.team_a,
      teamB: r.team_b,
      tournamentName: r.tournament_name,
      venue: r.venue,
      scheduledAt: r.scheduled_at,
      matchStatus: r.match_status,
      predictedTeam: r.predicted_toss_winner,
      demoCreditsUsed: parseFloat(r.demo_credits_used || 0),
      predictionStatus: r.prediction_status,
      resultTossWinner: r.result_toss_winner,
      resultDecision: r.result_decision,
      createdAt: r.created_at
    })),
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages
    }
  };
}

/**
 * Checks whether the authenticated user has already predicted a specific match
 *
 * @param {number} userId - Authenticated user ID
 * @param {number} matchId - Match database ID
 * @returns {Promise<{ hasPredicted: boolean, prediction: object|null }>}
 */
async function getUserPredictionForMatch(userId, matchId) {
  const parsedMatchId = parseInt(matchId, 10);
  if (isNaN(parsedMatchId) || parsedMatchId <= 0 || !/^[1-9]\d*$/.test(String(matchId).trim())) {
    const err = new Error('Invalid match ID. Must be a positive integer.');
    err.status = 400;
    err.code = 'INVALID_MATCH_ID';
    throw err;
  }

  const [rows] = await pool.query(
    `SELECT
       p.id,
       p.match_id,
       p.predicted_toss_winner,
       p.demo_credits_used,
       p.status,
       p.created_at
     FROM predictions p
     WHERE p.user_id = ? AND p.match_id = ?`,
    [userId, parsedMatchId]
  );

  if (rows.length === 0) {
    return {
      hasPredicted: false,
      prediction: null
    };
  }

  const p = rows[0];
  return {
    hasPredicted: true,
    prediction: {
      id: p.id,
      matchId: p.match_id,
      predictedTeam: p.predicted_toss_winner,
      demoCreditsUsed: parseFloat(p.demo_credits_used || 0),
      status: p.status,
      createdAt: p.created_at
    }
  };
}

module.exports = {
  submitPrediction,
  getUserPredictions,
  getUserPredictionForMatch
};
