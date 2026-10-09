/**
 * TossArena Prediction Service
 * Core business rules, validation, concurrency control, and database operations for toss predictions.
 * Includes complete Day 10 prediction history, details verification, and user statistics calculations.
 */

const { pool } = require('../config/db');

/**
 * Submits a new toss prediction for an authenticated user
 *
 * @param {object} params
 * @param {number} params.userId - Authenticated user ID (derived from session)
 * @param {number} params.matchId - Match database ID
 * @param {string} params.predictedTeam - Selected team name
 * @returns {Promise<{ id: number, matchId: number, matchTitle: string, predictedTeam: string, status: string, createdAt: string }>}
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
 * Helper: Evaluates true outcome of a prediction based on real match records
 *
 * @param {object} p - Joined prediction and match record
 * @returns {'pending'|'correct'|'incorrect'|'void'}
 */
function evaluatePredictionOutcome(p) {
  const storedStatus = (p.prediction_status || p.status || 'pending').toLowerCase();

  // If already marked as final status in MySQL, trust that status
  if (['correct', 'incorrect', 'cancelled', 'void'].includes(storedStatus)) {
    return storedStatus === 'cancelled' ? 'void' : storedStatus;
  }

  const matchStatus = (p.match_status || '').toLowerCase();

  // If match was cancelled, outcome is void
  if (matchStatus === 'cancelled') {
    return 'void';
  }

  // A prediction outcome is finalized only when match has concluded AND has official toss result
  if (matchStatus === 'completed' && p.result_toss_winner) {
    const userPick = (p.predicted_toss_winner || '').trim().toLowerCase();
    const actualWinner = (p.result_toss_winner || '').trim().toLowerCase();

    if (userPick === actualWinner) {
      return 'correct';
    }
    return 'incorrect';
  }

  // Unresolved: match has not completed, or official toss result is not yet available
  return 'pending';
}

/**
 * Allowed sorting options for prediction history
 */
const ALLOWED_SORTS = {
  newest: 'ORDER BY p.created_at DESC, p.id DESC',
  oldest: 'ORDER BY p.created_at ASC, p.id ASC',
  match_date_asc: 'ORDER BY m.scheduled_at ASC, p.id ASC',
  match_date_desc: 'ORDER BY m.scheduled_at DESC, p.id DESC',
  match_date: 'ORDER BY m.scheduled_at ASC, p.id ASC'
};

/**
 * Validates a date string (YYYY-MM-DD or ISO 8601)
 *
 * @param {string} dateStr
 * @returns {Date|null}
 */
function parseValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  // Check format: YYYY-MM-DD or full ISO
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(trimmed)) {
    return null;
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Retrieves paginated, filtered, searchable prediction history for the authenticated user
 *
 * @param {number} userId - Authenticated user ID
 * @param {object} options
 * @param {number|string} [options.page=1] - 1-indexed page
 * @param {number|string} [options.limit=10] - Items per page (max 50)
 * @param {string} [options.search] - Search across teams, match title, tournament
 * @param {string} [options.status] - Filter: 'all', 'pending', 'correct', 'incorrect', 'void'
 * @param {string} [options.dateFrom] - Earliest prediction submission date
 * @param {string} [options.dateTo] - Latest prediction submission date
 * @param {string} [options.datePreset] - 'all', 'last7days', 'last30days'
 * @param {string} [options.sort='newest'] - Sort option from allowlist
 * @returns {Promise<{ predictions: Array, pagination: object, filtersApplied: object }>}
 */
async function getUserPredictions(userId, {
  page = 1,
  limit = 10,
  search = '',
  status = 'all',
  dateFrom = '',
  dateTo = '',
  datePreset = 'all',
  sort = 'newest'
} = {}) {
  if (!userId || !Number.isInteger(userId) || userId <= 0) {
    const err = new Error('Invalid authenticated user identity.');
    err.status = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  // 1. Validate pagination parameters
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (parsedPage - 1) * parsedLimit;

  // 2. Validate sort allowlist
  const normalizedSort = (sort || 'newest').trim().toLowerCase();
  if (!ALLOWED_SORTS[normalizedSort]) {
    const err = new Error(`Invalid sort option "${sort}". Allowed sorts: ${Object.keys(ALLOWED_SORTS).join(', ')}.`);
    err.status = 400;
    err.code = 'INVALID_SORT_OPTION';
    throw err;
  }
  const sortClause = ALLOWED_SORTS[normalizedSort];

  // 3. Build parameterized WHERE clauses
  const whereConditions = ['p.user_id = ?'];
  const queryParams = [userId];

  // A. Search query (teams, match title, tournament, venue)
  const cleanSearch = (search || '').trim();
  if (cleanSearch.length > 0) {
    const searchTerm = `%${cleanSearch}%`;
    whereConditions.push(`(
      m.title LIKE ? OR
      m.team_a LIKE ? OR
      m.team_b LIKE ? OR
      m.tournament_name LIKE ? OR
      m.venue LIKE ?
    )`);
    queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  // B. Status filter (pending, correct, incorrect, void/cancelled)
  const cleanStatus = (status || 'all').trim().toLowerCase();
  const validStatuses = ['all', 'pending', 'correct', 'incorrect', 'void', 'cancelled'];
  if (!validStatuses.includes(cleanStatus)) {
    const err = new Error(`Invalid status filter "${status}". Allowed values: all, pending, correct, incorrect, void.`);
    err.status = 400;
    err.code = 'INVALID_STATUS_FILTER';
    throw err;
  }

  if (cleanStatus === 'pending') {
    // Unresolved predictions: not marked final, and match has no official concluded toss result
    whereConditions.push(`(
      p.status = 'pending' AND
      m.status != 'cancelled' AND
      (m.status != 'completed' OR m.result_toss_winner IS NULL)
    )`);
  } else if (cleanStatus === 'correct') {
    whereConditions.push(`(
      p.status = 'correct' OR
      (p.status = 'pending' AND m.status = 'completed' AND m.result_toss_winner IS NOT NULL AND LOWER(TRIM(p.predicted_toss_winner)) = LOWER(TRIM(m.result_toss_winner)))
    )`);
  } else if (cleanStatus === 'incorrect') {
    whereConditions.push(`(
      p.status = 'incorrect' OR
      (p.status = 'pending' AND m.status = 'completed' AND m.result_toss_winner IS NOT NULL AND LOWER(TRIM(p.predicted_toss_winner)) != LOWER(TRIM(m.result_toss_winner)))
    )`);
  } else if (cleanStatus === 'void' || cleanStatus === 'cancelled') {
    whereConditions.push(`(
      p.status IN ('void', 'cancelled') OR
      m.status = 'cancelled'
    )`);
  }

  // C. Date preset filter
  const cleanPreset = (datePreset || 'all').trim().toLowerCase();
  if (cleanPreset === 'last7days') {
    whereConditions.push('p.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)');
  } else if (cleanPreset === 'last30days') {
    whereConditions.push('p.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)');
  } else if (cleanPreset !== 'all' && cleanPreset !== '') {
    const err = new Error(`Invalid date preset "${datePreset}". Allowed values: all, last7days, last30days.`);
    err.status = 400;
    err.code = 'INVALID_DATE_PRESET';
    throw err;
  }

  // D. Custom date range filter (dateFrom, dateTo against prediction submission timestamp p.created_at)
  let parsedDateFrom = null;
  let parsedDateTo = null;

  if (dateFrom && String(dateFrom).trim().length > 0) {
    parsedDateFrom = parseValidDate(dateFrom);
    if (!parsedDateFrom) {
      const err = new Error('Invalid dateFrom parameter. Must be valid YYYY-MM-DD or ISO format.');
      err.status = 400;
      err.code = 'INVALID_DATE_FROM';
      throw err;
    }
    // Set to beginning of the day in UTC if only date supplied
    whereConditions.push('p.created_at >= ?');
    const fromStr = dateFrom.includes('T') ? parsedDateFrom.toISOString() : `${dateFrom.trim()} 00:00:00`;
    queryParams.push(fromStr);
  }

  if (dateTo && String(dateTo).trim().length > 0) {
    parsedDateTo = parseValidDate(dateTo);
    if (!parsedDateTo) {
      const err = new Error('Invalid dateTo parameter. Must be valid YYYY-MM-DD or ISO format.');
      err.status = 400;
      err.code = 'INVALID_DATE_TO';
      throw err;
    }
    // Set to end of the day in UTC if only date supplied
    whereConditions.push('p.created_at <= ?');
    const toStr = dateTo.includes('T') ? parsedDateTo.toISOString() : `${dateTo.trim()} 23:59:59`;
    queryParams.push(toStr);
  }

  if (parsedDateFrom && parsedDateTo && parsedDateFrom > parsedDateTo) {
    const err = new Error('Invalid date range: dateFrom cannot be after dateTo.');
    err.status = 400;
    err.code = 'INVALID_DATE_RANGE';
    throw err;
  }

  const whereSql = whereConditions.join(' AND ');

  // 4. Query total count matching the active filters
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM predictions p
     JOIN matches m ON p.match_id = m.id
     WHERE ${whereSql}`,
    queryParams
  );

  const total = parseInt(countRows[0]?.total || 0, 10);
  const totalPages = Math.ceil(total / parsedLimit);

  // 5. Query paginated records
  const paginatedParams = [...queryParams, parsedLimit, offset];
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
     WHERE ${whereSql}
     ${sortClause}
     LIMIT ? OFFSET ?`,
    paginatedParams
  );

  // 6. Map and evaluate authoritative outcomes
  const predictions = rows.map((r) => {
    const outcome = evaluatePredictionOutcome(r);
    return {
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
      creditsUsed: parseFloat(r.demo_credits_used || 0),
      status: outcome,
      storedStatus: r.prediction_status,
      resultTossWinner: r.result_toss_winner,
      resultDecision: r.result_decision,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  });

  return {
    predictions,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages
    },
    filtersApplied: {
      search: cleanSearch,
      status: cleanStatus,
      datePreset: cleanPreset,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      sort: normalizedSort
    }
  };
}

/**
 * Retrieves a single prediction by ID for the authenticated user
 * Enforces strict backend authorization and ownership check.
 *
 * @param {number} userId - Authenticated user ID (from session)
 * @param {number|string} predictionId - Prediction ID
 * @returns {Promise<object>} Complete prediction and associated match details
 */
async function getPredictionById(userId, predictionId) {
  if (!userId || !Number.isInteger(userId) || userId <= 0) {
    const err = new Error('Invalid authenticated user identity.');
    err.status = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const parsedId = parseInt(predictionId, 10);
  if (isNaN(parsedId) || parsedId <= 0 || !/^[1-9]\d*$/.test(String(predictionId).trim())) {
    const err = new Error('Invalid prediction ID. Must be a positive integer.');
    err.status = 400;
    err.code = 'INVALID_PREDICTION_ID';
    throw err;
  }

  // 1. Fetch prediction scoped to user ID (prevent IDOR & enumeration)
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
     WHERE p.id = ? AND p.user_id = ?`,
    [parsedId, userId]
  );

  if (rows.length === 0) {
    // Return standard 404 without leaking whether record belongs to another user
    const err = new Error('Prediction not found.');
    err.status = 404;
    err.code = 'PREDICTION_NOT_FOUND';
    throw err;
  }

  const r = rows[0];
  const outcome = evaluatePredictionOutcome(r);

  // 2. Fetch linked wallet transaction if supported by real records
  let linkedTransaction = null;
  const [txRows] = await pool.query(
    `SELECT
       wt.id,
       wt.transaction_type,
       wt.amount,
       wt.balance_after,
       wt.description,
       wt.created_at
     FROM wallet_transactions wt
     JOIN wallets w ON wt.wallet_id = w.id
     WHERE w.user_id = ? AND wt.reference_type = 'predictions' AND wt.reference_id = ?
     LIMIT 1`,
    [userId, parsedId]
  );

  if (txRows.length > 0) {
    const tx = txRows[0];
    linkedTransaction = {
      id: tx.id,
      type: tx.transaction_type,
      amount: parseFloat(tx.amount),
      balanceAfter: parseFloat(tx.balance_after),
      description: tx.description,
      createdAt: tx.created_at
    };
  }

  return {
    id: r.id,
    matchId: r.match_id,
    predictedTeam: r.predicted_toss_winner,
    status: outcome,
    storedStatus: r.prediction_status,
    creditsUsed: parseFloat(r.demo_credits_used || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    match: {
      id: r.match_id,
      title: r.match_title,
      teamA: r.team_a,
      teamB: r.team_b,
      tournamentName: r.tournament_name,
      venue: r.venue,
      scheduledAt: r.scheduled_at,
      status: r.match_status,
      resultTossWinner: r.result_toss_winner,
      resultDecision: r.result_decision
    },
    transaction: linkedTransaction
  };
}

/**
 * Calculates authoritative prediction statistics for the authenticated user
 * All metrics derived strictly from actual MySQL records.
 *
 * @param {number} userId - Authenticated user ID
 * @returns {Promise<object>} Comprehensive user performance statistics
 */
async function getUserPredictionStatistics(userId) {
  if (!userId || !Number.isInteger(userId) || userId <= 0) {
    const err = new Error('Invalid authenticated user identity.');
    err.status = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  // Fetch all user predictions joined with match outcome information
  const [rows] = await pool.query(
    `SELECT
       p.id,
       p.status AS prediction_status,
       p.predicted_toss_winner,
       p.created_at,
       m.tournament_name,
       m.status AS match_status,
       m.result_toss_winner
     FROM predictions p
     JOIN matches m ON p.match_id = m.id
     WHERE p.user_id = ?`,
    [userId]
  );

  let total = rows.length;
  let pendingCount = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let voidCount = 0;

  let last7DaysCount = 0;
  let last30DaysCount = 0;

  const nowMs = Date.now();
  const sevenDaysAgoMs = nowMs - (7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoMs = nowMs - (30 * 24 * 60 * 60 * 1000);

  const byTournament = {};

  rows.forEach((r) => {
    const outcome = evaluatePredictionOutcome(r);

    if (outcome === 'pending') {
      pendingCount++;
    } else if (outcome === 'correct') {
      correctCount++;
    } else if (outcome === 'incorrect') {
      incorrectCount++;
    } else if (outcome === 'void') {
      voidCount++;
    }

    const createdMs = new Date(r.created_at).getTime();
    if (createdMs >= sevenDaysAgoMs) {
      last7DaysCount++;
    }
    if (createdMs >= thirtyDaysAgoMs) {
      last30DaysCount++;
    }

    const tournament = r.tournament_name || 'Other Competitions';
    byTournament[tournament] = (byTournament[tournament] || 0) + 1;
  });

  // Calculate Accuracy strictly from finalized, non-void outcomes:
  // Accuracy (%) = Correct / (Correct + Incorrect) * 100
  const finalizedCount = correctCount + incorrectCount;
  const accuracyPercentage = finalizedCount > 0
    ? Number(((correctCount / finalizedCount) * 100).toFixed(1))
    : 0.0;

  return {
    totalPredictions: total,
    pendingPredictions: pendingCount,
    correctPredictions: correctCount,
    incorrectPredictions: incorrectCount,
    voidedPredictions: voidCount,
    finalizedPredictions: finalizedCount,
    accuracyPercentage,
    hasFinalizedOutcomes: finalizedCount > 0,
    timeframes: {
      last7Days: last7DaysCount,
      last30Days: last30DaysCount
    },
    byStatus: {
      pending: pendingCount,
      correct: correctCount,
      incorrect: incorrectCount,
      void: voidCount
    },
    byTournament
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
  getPredictionById,
  getUserPredictionStatistics,
  getUserPredictionForMatch,
  evaluatePredictionOutcome
};
