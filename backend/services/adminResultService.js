/**
 * TossArena Admin Toss Result Management Service (Day 12)
 * Handles review of matches awaiting toss results, validation, previewing,
 * transactional publishing, prediction outcome updates, and explicit corrections.
 * Strictly virtual demo credits - no financial settlements or automated rewards in Day 12.
 */

const { pool } = require('../config/db');
const { logAudit } = require('./auditService');

// Valid toss decision values
const VALID_TOSS_DECISIONS = ['bat', 'bowl'];

// Allowlisted sorting options for result management
const RESULT_SORT_ALLOWLIST = {
  date_asc: 'm.scheduled_at ASC',
  date_desc: 'm.scheduled_at DESC',
  predictions_desc: 'prediction_count DESC, m.scheduled_at DESC',
  published_desc: 'm.result_published_at DESC, m.scheduled_at DESC',
  id_desc: 'm.id DESC'
};

/**
 * Escapes characters with special meaning in SQL LIKE patterns (% and _)
 * @param {string} str
 * @returns {string}
 */
function escapeLikeString(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/([%_\\])/g, '\\$1');
}

/**
 * Validates match ID
 * @param {number|string} matchId
 * @returns {number}
 */
function validateMatchId(matchId) {
  const parsed = parseInt(matchId, 10);
  if (isNaN(parsed) || parsed <= 0) {
    const err = new Error('Invalid match ID. Must be a positive integer.');
    err.status = 400;
    err.code = 'INVALID_MATCH_ID';
    throw err;
  }
  return parsed;
}

/**
 * Validates that tossWinner matches either teamA or teamB and returns canonical team name
 * @param {string} submittedWinner
 * @param {string} teamA
 * @param {string} teamB
 * @returns {string}
 */
function validateTossWinner(submittedWinner, teamA, teamB) {
  if (!submittedWinner || typeof submittedWinner !== 'string' || submittedWinner.trim().length === 0) {
    const err = new Error('Toss winner team selection is required.');
    err.status = 400;
    err.code = 'MISSING_TOSS_WINNER';
    throw err;
  }

  const cleanSubmitted = submittedWinner.trim().toLowerCase();
  const cleanTeamA = (teamA || '').trim().toLowerCase();
  const cleanTeamB = (teamB || '').trim().toLowerCase();

  if (cleanSubmitted === cleanTeamA) {
    return teamA.trim();
  }
  if (cleanSubmitted === cleanTeamB) {
    return teamB.trim();
  }

  const err = new Error(`Invalid toss winner "${submittedWinner}". Must be one of the participating teams: "${teamA}" or "${teamB}".`);
  err.status = 400;
  err.code = 'INVALID_TOSS_WINNER';
  throw err;
}

/**
 * Validates toss decision
 * @param {string} submittedDecision
 * @returns {'bat'|'bowl'}
 */
function validateTossDecision(submittedDecision) {
  if (!submittedDecision || typeof submittedDecision !== 'string' || submittedDecision.trim().length === 0) {
    const err = new Error('Toss decision selection is required (must be "bat" or "bowl").');
    err.status = 400;
    err.code = 'MISSING_TOSS_DECISION';
    throw err;
  }

  const cleanDecision = submittedDecision.trim().toLowerCase();
  if (!VALID_TOSS_DECISIONS.includes(cleanDecision)) {
    const err = new Error(`Invalid toss decision "${submittedDecision}". Allowed decisions: ${VALID_TOSS_DECISIONS.join(', ')}.`);
    err.status = 400;
    err.code = 'INVALID_TOSS_DECISION';
    throw err;
  }

  return cleanDecision;
}

/**
 * Retrieves aggregate summary metrics for result management
 * @returns {Promise<object>}
 */
async function getResultOverviewStatistics() {
  const [counts] = await pool.query(`
    SELECT
      COUNT(*) AS total_matches,
      SUM(CASE WHEN status != 'cancelled' AND result_toss_winner IS NULL THEN 1 ELSE 0 END) AS awaiting_results,
      SUM(CASE WHEN result_toss_winner IS NOT NULL THEN 1 ELSE 0 END) AS results_published,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_matches
    FROM matches
  `);

  const [predictionStats] = await pool.query(`
    SELECT
      COUNT(*) AS total_predictions,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_predictions,
      SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) AS correct_predictions,
      SUM(CASE WHEN status = 'incorrect' THEN 1 ELSE 0 END) AS incorrect_predictions,
      SUM(CASE WHEN status IN ('cancelled', 'void') THEN 1 ELSE 0 END) AS void_predictions
    FROM predictions
  `);

  const [awaitingWithPreds] = await pool.query(`
    SELECT COUNT(DISTINCT m.id) AS matches_with_pending_predictions
    FROM matches m
    INNER JOIN predictions p ON p.match_id = m.id AND p.status = 'pending'
    WHERE m.status != 'cancelled' AND m.result_toss_winner IS NULL
  `);

  const c = counts[0] || {};
  const p = predictionStats[0] || {};
  const aw = awaitingWithPreds[0] || {};

  return {
    totalMatches: parseInt(c.total_matches || 0, 10),
    awaitingResults: parseInt(c.awaiting_results || 0, 10),
    resultsPublished: parseInt(c.results_published || 0, 10),
    cancelledMatches: parseInt(c.cancelled_matches || 0, 10),
    matchesWithPendingPredictions: parseInt(aw.matches_with_pending_predictions || 0, 10),
    totalPredictions: parseInt(p.total_predictions || 0, 10),
    pendingPredictions: parseInt(p.pending_predictions || 0, 10),
    correctPredictions: parseInt(p.correct_predictions || 0, 10),
    incorrectPredictions: parseInt(p.incorrect_predictions || 0, 10),
    voidPredictions: parseInt(p.void_predictions || 0, 10)
  };
}

/**
 * Retrieves paginated, filtered, searchable match records for result management
 *
 * @param {object} options
 * @returns {Promise<{ matches: Array, pagination: object, summary: object }>}
 */
async function getAdminResults(options = {}) {
  const {
    page: rawPage = 1,
    limit: rawLimit = 15,
    search = '',
    resultStatus = 'all',
    matchStatus = 'all',
    dateFilter = 'all',
    dateFrom = '',
    dateTo = '',
    sort = 'date_asc'
  } = options;

  const page = Math.max(1, parseInt(rawPage, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(rawLimit, 10) || 15));
  const offset = (page - 1) * limit;

  const sortExpression = RESULT_SORT_ALLOWLIST[sort] || RESULT_SORT_ALLOWLIST.date_asc;

  const whereConditions = [];
  const queryParams = [];

  // Filter by result publication status
  if (resultStatus && resultStatus !== 'all') {
    const cleanResStatus = String(resultStatus).toLowerCase().trim();
    if (cleanResStatus === 'awaiting') {
      whereConditions.push("m.status != 'cancelled' AND m.result_toss_winner IS NULL");
    } else if (cleanResStatus === 'published') {
      whereConditions.push('m.result_toss_winner IS NOT NULL');
    } else if (cleanResStatus === 'cancelled') {
      whereConditions.push("m.status = 'cancelled'");
    }
  }

  // Filter by match lifecycle status
  if (matchStatus && matchStatus !== 'all') {
    const cleanMatchStatus = String(matchStatus).toLowerCase().trim();
    whereConditions.push('m.status = ?');
    queryParams.push(cleanMatchStatus);
  }

  // Date filters
  if (dateFilter === 'upcoming') {
    whereConditions.push('m.scheduled_at > NOW()');
  } else if (dateFilter === 'past') {
    whereConditions.push('m.scheduled_at <= NOW()');
  } else if (dateFilter === 'custom' || (dateFrom && dateTo)) {
    if (dateFrom) {
      const fromDate = new Date(`${dateFrom}T00:00:00Z`);
      if (isNaN(fromDate.getTime())) {
        const err = new Error('Invalid dateFrom parameter. Format must be YYYY-MM-DD.');
        err.status = 400;
        err.code = 'INVALID_DATE_FROM';
        throw err;
      }
      whereConditions.push('m.scheduled_at >= ?');
      queryParams.push(fromDate.toISOString().slice(0, 19).replace('T', ' '));
    }
    if (dateTo) {
      const toDate = new Date(`${dateTo}T23:59:59Z`);
      if (isNaN(toDate.getTime())) {
        const err = new Error('Invalid dateTo parameter. Format must be YYYY-MM-DD.');
        err.status = 400;
        err.code = 'INVALID_DATE_TO';
        throw err;
      }
      whereConditions.push('m.scheduled_at <= ?');
      queryParams.push(toDate.toISOString().slice(0, 19).replace('T', ' '));
    }
  }

  // Search across teams, title, venue, tournament, or match ID
  if (search && typeof search === 'string') {
    const trimmed = search.trim();
    if (trimmed) {
      const escaped = `%${escapeLikeString(trimmed)}%`;
      const isNum = /^[1-9]\d*$/.test(trimmed);

      if (isNum) {
        whereConditions.push('(m.id = ? OR m.title LIKE ? ESCAPE \'\\\\\' OR m.team_a LIKE ? ESCAPE \'\\\\\' OR m.team_b LIKE ? ESCAPE \'\\\\\' OR m.tournament_name LIKE ? ESCAPE \'\\\\\' OR m.venue LIKE ? ESCAPE \'\\\\\')');
        queryParams.push(parseInt(trimmed, 10), escaped, escaped, escaped, escaped, escaped);
      } else {
        whereConditions.push('(m.title LIKE ? ESCAPE \'\\\\\' OR m.team_a LIKE ? ESCAPE \'\\\\\' OR m.team_b LIKE ? ESCAPE \'\\\\\' OR m.tournament_name LIKE ? ESCAPE \'\\\\\' OR m.venue LIKE ? ESCAPE \'\\\\\')');
        queryParams.push(escaped, escaped, escaped, escaped, escaped);
      }
    }
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Total count query
  const countSql = `SELECT COUNT(*) AS total FROM matches m ${whereClause}`;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = parseInt(countRows[0]?.total || 0, 10);
  const totalPages = Math.ceil(total / limit) || 0;

  // 2. Paginated matches query with prediction counts and publisher join
  const selectSql = `
    SELECT
      m.id,
      m.title,
      m.team_a,
      m.team_b,
      m.tournament_name,
      m.venue,
      m.scheduled_at,
      m.status,
      m.result_toss_winner,
      m.result_decision,
      m.result_published_at,
      m.result_published_by,
      m.result_source_note,
      m.created_at,
      m.updated_at,
      u.full_name AS published_by_name,
      u.email AS published_by_email,
      COUNT(p.id) AS prediction_count,
      SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END) AS pending_predictions_count,
      SUM(CASE WHEN p.status = 'correct' THEN 1 ELSE 0 END) AS correct_predictions_count,
      SUM(CASE WHEN p.status = 'incorrect' THEN 1 ELSE 0 END) AS incorrect_predictions_count
    FROM matches m
    LEFT JOIN users u ON u.id = m.result_published_by
    LEFT JOIN predictions p ON p.match_id = m.id
    ${whereClause}
    GROUP BY m.id
    ORDER BY ${sortExpression}
    LIMIT ? OFFSET ?
  `;

  const [matchesRows] = await pool.query(selectSql, [...queryParams, limit, offset]);

  const matches = matchesRows.map((r) => {
    const isCancelled = r.status === 'cancelled';
    const isPublished = r.result_toss_winner !== null;

    return {
      id: r.id,
      title: r.title,
      teamA: r.team_a,
      teamB: r.team_b,
      team_a: r.team_a,
      team_b: r.team_b,
      tournamentName: r.tournament_name || 'Cricket Series',
      tournament_name: r.tournament_name || 'Cricket Series',
      venue: r.venue || 'Neutral Ground',
      scheduledAt: r.scheduled_at,
      scheduled_at: r.scheduled_at,
      status: r.status,
      resultTossWinner: r.result_toss_winner,
      result_toss_winner: r.result_toss_winner,
      resultDecision: r.result_decision,
      result_decision: r.result_decision,
      resultPublishedAt: r.result_published_at,
      result_published_at: r.result_published_at,
      resultPublishedBy: r.result_published_by ? {
        id: r.result_published_by,
        name: r.published_by_name,
        email: r.published_by_email
      } : null,
      resultSourceNote: r.result_source_note || null,
      result_source_note: r.result_source_note || null,
      predictionCount: parseInt(r.prediction_count || 0, 10),
      prediction_count: parseInt(r.prediction_count || 0, 10),
      pendingPredictionsCount: parseInt(r.pending_predictions_count || 0, 10),
      correctPredictionsCount: parseInt(r.correct_predictions_count || 0, 10),
      incorrectPredictionsCount: parseInt(r.incorrect_predictions_count || 0, 10),
      isPublished,
      canPublish: !isCancelled && !isPublished,
      canCorrect: !isCancelled && isPublished,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  });

  const summary = await getResultOverviewStatistics();

  return {
    matches,
    pagination: {
      page,
      limit,
      total,
      totalPages
    },
    summary
  };
}

/**
 * Retrieves detailed toss result information for a single match fixture
 * @param {number|string} matchId
 * @returns {Promise<object>}
 */
async function getMatchResultDetails(matchId) {
  const parsedId = validateMatchId(matchId);

  const [matchRows] = await pool.query(`
    SELECT
      m.id,
      m.title,
      m.team_a,
      m.team_b,
      m.tournament_name,
      m.venue,
      m.scheduled_at,
      m.status,
      m.result_toss_winner,
      m.result_decision,
      m.result_published_at,
      m.result_published_by,
      m.result_source_note,
      m.created_at,
      m.updated_at,
      u.full_name AS published_by_name,
      u.email AS published_by_email,
      COUNT(p.id) AS prediction_count
    FROM matches m
    LEFT JOIN users u ON u.id = m.result_published_by
    LEFT JOIN predictions p ON p.match_id = m.id
    WHERE m.id = ?
    GROUP BY m.id
    LIMIT 1
  `, [parsedId]);

  if (matchRows.length === 0) {
    const err = new Error('Match fixture not found.');
    err.status = 404;
    err.code = 'MATCH_NOT_FOUND';
    throw err;
  }

  const m = matchRows[0];
  const isCancelled = m.status === 'cancelled';
  const isPublished = m.result_toss_winner !== null;

  // Retrieve breakdown of user predictions by team and status
  const [pickBreakdownRows] = await pool.query(`
    SELECT
      predicted_toss_winner AS team,
      COUNT(*) AS total_picks,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_picks,
      SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) AS correct_picks,
      SUM(CASE WHEN status = 'incorrect' THEN 1 ELSE 0 END) AS incorrect_picks
    FROM predictions
    WHERE match_id = ?
    GROUP BY predicted_toss_winner
  `, [parsedId]);

  const totalPredictions = parseInt(m.prediction_count || 0, 10);

  const pickBreakdown = pickBreakdownRows.map((r) => {
    const totalPicks = parseInt(r.total_picks || 0, 10);
    const percentage = totalPredictions > 0 ? Math.round((totalPicks / totalPredictions) * 100) : 0;
    return {
      team: r.team,
      totalPicks,
      percentage,
      pendingPicks: parseInt(r.pending_picks || 0, 10),
      correctPicks: parseInt(r.correct_picks || 0, 10),
      incorrectPicks: parseInt(r.incorrect_picks || 0, 10)
    };
  });

  return {
    id: m.id,
    title: m.title,
    teamA: m.team_a,
    teamB: m.team_b,
    team_a: m.team_a,
    team_b: m.team_b,
    tournamentName: m.tournament_name || 'Cricket Series',
    tournament_name: m.tournament_name || 'Cricket Series',
    venue: m.venue || 'Neutral Ground',
    scheduledAt: m.scheduled_at,
    scheduled_at: m.scheduled_at,
    status: m.status,
    resultTossWinner: m.result_toss_winner,
    result_toss_winner: m.result_toss_winner,
    resultDecision: m.result_decision,
    result_decision: m.result_decision,
    resultPublishedAt: m.result_published_at,
    result_published_at: m.result_published_at,
    resultPublishedBy: m.result_published_by ? {
      id: m.result_published_by,
      name: m.published_by_name,
      email: m.published_by_email
    } : null,
    resultSourceNote: m.result_source_note || null,
    result_source_note: m.result_source_note || null,
    isPublished,
    canPublish: !isCancelled && !isPublished,
    canCorrect: !isCancelled && isPublished,
    eligibilityReason: isCancelled
      ? 'Match was cancelled. Cancelled matches cannot declare toss outcomes.'
      : isPublished
        ? 'Result is already published. Use explicit result correction to modify.'
        : 'Match is eligible for official toss result publication.',
    totalPredictions,
    pickBreakdown,
    createdAt: m.created_at,
    updatedAt: m.updated_at
  };
}

/**
 * Validates proposed toss result without mutating database state.
 * Returns preview calculations and outcome breakdown.
 *
 * @param {number|string} matchId
 * @param {object} payload - { tossWinner, tossDecision }
 * @returns {Promise<object>}
 */
async function previewTossResult(matchId, payload = {}) {
  const parsedId = validateMatchId(matchId);
  const { tossWinner, tossDecision } = payload;

  const [matchRows] = await pool.query(
    'SELECT id, title, team_a, team_b, status, result_toss_winner, result_decision FROM matches WHERE id = ?',
    [parsedId]
  );

  if (matchRows.length === 0) {
    const err = new Error('Match fixture not found.');
    err.status = 404;
    err.code = 'MATCH_NOT_FOUND';
    throw err;
  }

  const match = matchRows[0];

  if (match.status === 'cancelled') {
    const err = new Error('Cannot publish a toss result for a cancelled match fixture.');
    err.status = 400;
    err.code = 'CANNOT_PUBLISH_CANCELLED_MATCH';
    throw err;
  }

  const canonicalWinner = validateTossWinner(tossWinner, match.team_a, match.team_b);
  const canonicalDecision = validateTossDecision(tossDecision);

  // Calculate prediction outcomes on eligible pending predictions
  const [predictionRows] = await pool.query(
    'SELECT id, predicted_toss_winner, status FROM predictions WHERE match_id = ?',
    [parsedId]
  );

  const totalEligible = predictionRows.length;
  let wouldBeCorrect = 0;
  let wouldBeIncorrect = 0;

  predictionRows.forEach((p) => {
    if ((p.predicted_toss_winner || '').trim().toLowerCase() === canonicalWinner.toLowerCase()) {
      wouldBeCorrect++;
    } else {
      wouldBeIncorrect++;
    }
  });

  const warnings = [];
  if (match.result_toss_winner !== null) {
    warnings.push('This match already has a published toss result. Publishing again will require explicit result correction.');
  }

  return {
    matchId: match.id,
    matchTitle: match.title,
    proposedWinner: canonicalWinner,
    proposedDecision: canonicalDecision,
    isAlreadyPublished: match.result_toss_winner !== null,
    currentResult: match.result_toss_winner ? {
      winner: match.result_toss_winner,
      decision: match.result_decision
    } : null,
    evaluationPreview: {
      totalPredictions: totalEligible,
      willMarkCorrect: wouldBeCorrect,
      willMarkIncorrect: wouldBeIncorrect
    },
    hypotheticalOutcome: {
      totalPredictions: totalEligible,
      willMarkCorrect: wouldBeCorrect,
      willMarkIncorrect: wouldBeIncorrect
    },
    warnings
  };
}

/**
 * Atomically publishes official toss result and evaluates all predictions for that match.
 * Executed within an isolated MySQL transaction with row-level locking (FOR UPDATE).
 *
 * @param {number|string} matchId
 * @param {object} payload - { tossWinner, tossDecision, sourceNote }
 * @param {object} adminUser - Authenticated administrator user record
 * @param {string} [ipAddress]
 * @returns {Promise<object>}
 */
async function publishTossResult(matchId, payload = {}, adminUser, ipAddress = null) {
  const parsedId = validateMatchId(matchId);
  const { tossWinner, tossDecision, sourceNote = '' } = payload;

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock the match row to prevent concurrent publication race conditions
    const [matchRows] = await connection.query(
      `SELECT id, title, team_a, team_b, status, result_toss_winner, result_decision, result_published_at
       FROM matches
       WHERE id = ?
       FOR UPDATE`,
      [parsedId]
    );

    if (matchRows.length === 0) {
      const err = new Error('Match fixture not found.');
      err.status = 404;
      err.code = 'MATCH_NOT_FOUND';
      throw err;
    }

    const match = matchRows[0];

    // 2. Cancellation check
    if (match.status === 'cancelled') {
      const err = new Error('Cannot publish toss results for a cancelled match.');
      err.status = 400;
      err.code = 'CANNOT_PUBLISH_CANCELLED_MATCH';
      throw err;
    }

    // 3. Validate toss winner against participating teams
    const canonicalWinner = validateTossWinner(tossWinner, match.team_a, match.team_b);
    const canonicalDecision = validateTossDecision(tossDecision);

    // 4. Duplicate publication check
    if (match.result_toss_winner !== null) {
      // If exactly identical result is already published, handle idempotently
      if (
        match.result_toss_winner.toLowerCase() === canonicalWinner.toLowerCase() &&
        match.result_decision === canonicalDecision
      ) {
        await connection.commit();
        return {
          id: match.id,
          matchId: match.id,
          title: match.title,
          resultTossWinner: match.result_toss_winner,
          resultDecision: match.result_decision,
          resultPublishedAt: match.result_published_at,
          isReplay: true,
          alreadyPublished: true,
          message: 'Toss result has already been published with these identical values.'
        };
      }

      // If conflicting result, strictly prohibit silent overwrite
      const err = new Error(
        `A conflicting toss result is already published for this match (${match.result_toss_winner}, ${match.result_decision}). Use the explicit Result Correction workflow to alter published outcomes.`
      );
      err.status = 409;
      err.code = 'RESULT_ALREADY_PUBLISHED';
      throw err;
    }

    // 5. Update match record with published result and transition status to completed
    const cleanNote = sourceNote && typeof sourceNote === 'string' ? sourceNote.trim().slice(0, 255) : null;

    await connection.query(
      `UPDATE matches
       SET result_toss_winner = ?,
           result_decision = ?,
           result_published_at = NOW(),
           result_published_by = ?,
           result_source_note = ?,
           status = CASE WHEN status != 'completed' THEN 'completed' ELSE status END,
           updated_at = NOW()
       WHERE id = ?`,
      [canonicalWinner, canonicalDecision, adminUser.id, cleanNote, parsedId]
    );

    // 6. Evaluate all eligible predictions for this match
    // Correct predictions: predicted team strictly matches official toss winner
    await connection.query(
      `UPDATE predictions
       SET status = 'correct',
           updated_at = NOW()
       WHERE match_id = ?
         AND predicted_toss_winner = ?
         AND status != 'cancelled'
         AND status != 'void'`,
      [parsedId, canonicalWinner]
    );

    // Incorrect predictions: predicted team does not match official toss winner
    await connection.query(
      `UPDATE predictions
       SET status = 'incorrect',
           updated_at = NOW()
       WHERE match_id = ?
         AND predicted_toss_winner != ?
         AND status != 'cancelled'
         AND status != 'void'`,
      [parsedId, canonicalWinner]
    );

    // 7. Aggregate outcome counts for the response & audit log
    const [evalCounts] = await connection.query(
      `SELECT
         COUNT(*) AS total_evaluated,
         SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) AS correct_count,
         SUM(CASE WHEN status = 'incorrect' THEN 1 ELSE 0 END) AS incorrect_count
       FROM predictions
       WHERE match_id = ?`,
      [parsedId]
    );

    const totalEvaluated = parseInt(evalCounts[0]?.total_evaluated || 0, 10);
    const correctCount = parseInt(evalCounts[0]?.correct_count || 0, 10);
    const incorrectCount = parseInt(evalCounts[0]?.incorrect_count || 0, 10);

    // 8. Commit MySQL transaction
    await connection.commit();

    // 9. Record immutable audit log
    await logAudit({
      actorUserId: adminUser.id,
      action: 'toss_result_published',
      entityType: 'match',
      entityId: parsedId,
      details: {
        matchTitle: match.title,
        resultTossWinner: canonicalWinner,
        resultDecision: canonicalDecision,
        sourceNote: cleanNote,
        totalPredictionsEvaluated: totalEvaluated,
        correctCount,
        incorrectCount
      },
      ipAddress
    });

    return {
      matchId: parsedId,
      matchTitle: match.title,
      resultTossWinner: canonicalWinner,
      resultDecision: canonicalDecision,
      status: 'completed',
      predictionsEvaluated: {
        total: totalEvaluated,
        correct: correctCount,
        incorrect: incorrectCount
      },
      evaluation: {
        evaluatedCount: totalEvaluated,
        correctCount,
        incorrectCount
      },
      alreadyPublished: false,
      message: `Verified toss result published successfully. ${totalEvaluated} predictions evaluated (${correctCount} correct, ${incorrectCount} incorrect).`
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Explicit admin-only workflow to correct an already-published toss result.
 * Requires mandatory correction reason, updates audit logs, and re-evaluates prediction statuses safely.
 *
 * @param {number|string} matchId
 * @param {object} payload - { tossWinner, tossDecision, reason, sourceNote }
 * @param {object} adminUser
 * @param {string} [ipAddress]
 * @returns {Promise<object>}
 */
async function correctTossResult(matchId, payload = {}, adminUser, ipAddress = null) {
  const parsedId = validateMatchId(matchId);
  const { tossWinner, tossDecision, reason, correctionReason, sourceNote = '' } = payload;
  const effectiveReason = reason || correctionReason;

  if (!effectiveReason || typeof effectiveReason !== 'string' || effectiveReason.trim().length < 5) {
    const err = new Error('A detailed correction reason (at least 5 characters) is mandatory to correct a published result.');
    err.status = 400;
    err.code = 'MISSING_CORRECTION_REASON';
    throw err;
  }

  const cleanReason = effectiveReason.trim();

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock match row
    const [matchRows] = await connection.query(
      `SELECT id, title, team_a, team_b, status, result_toss_winner, result_decision, result_published_at
       FROM matches
       WHERE id = ?
       FOR UPDATE`,
      [parsedId]
    );

    if (matchRows.length === 0) {
      const err = new Error('Match fixture not found.');
      err.status = 404;
      err.code = 'MATCH_NOT_FOUND';
      throw err;
    }

    const match = matchRows[0];

    if (match.status === 'cancelled') {
      const err = new Error('Cannot correct results for a cancelled match.');
      err.status = 400;
      err.code = 'CANNOT_CORRECT_CANCELLED_MATCH';
      throw err;
    }

    if (match.result_toss_winner === null) {
      const err = new Error('No toss result has been published yet for this match. Use normal publish workflow.');
      err.status = 400;
      err.code = 'RESULT_NOT_YET_PUBLISHED';
      throw err;
    }

    const canonicalWinner = validateTossWinner(tossWinner, match.team_a, match.team_b);
    const canonicalDecision = validateTossDecision(tossDecision);

    const previousWinner = match.result_toss_winner;
    const previousDecision = match.result_decision;

    // 2. Update match with corrected values
    const cleanNote = sourceNote && typeof sourceNote === 'string'
      ? `${sourceNote.trim().slice(0, 200)} (Corrected: ${cleanReason.slice(0, 50)})`
      : `Corrected: ${cleanReason.slice(0, 250)}`;

    await connection.query(
      `UPDATE matches
       SET result_toss_winner = ?,
           result_decision = ?,
           result_published_at = NOW(),
           result_published_by = ?,
           result_source_note = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [canonicalWinner, canonicalDecision, adminUser.id, cleanNote, parsedId]
    );

    // 3. Re-evaluate all predictions for this fixture to the new winner
    await connection.query(
      `UPDATE predictions
       SET status = 'correct',
           updated_at = NOW()
       WHERE match_id = ?
         AND predicted_toss_winner = ?
         AND status != 'cancelled'
         AND status != 'void'`,
      [parsedId, canonicalWinner]
    );

    await connection.query(
      `UPDATE predictions
       SET status = 'incorrect',
           updated_at = NOW()
       WHERE match_id = ?
         AND predicted_toss_winner != ?
         AND status != 'cancelled'
         AND status != 'void'`,
      [parsedId, canonicalWinner]
    );

    // 4. Query new counts
    const [evalCounts] = await connection.query(
      `SELECT
         COUNT(*) AS total_evaluated,
         SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) AS correct_count,
         SUM(CASE WHEN status = 'incorrect' THEN 1 ELSE 0 END) AS incorrect_count
       FROM predictions
       WHERE match_id = ?`,
      [parsedId]
    );

    const totalEvaluated = parseInt(evalCounts[0]?.total_evaluated || 0, 10);
    const correctCount = parseInt(evalCounts[0]?.correct_count || 0, 10);
    const incorrectCount = parseInt(evalCounts[0]?.incorrect_count || 0, 10);

    await connection.commit();

    // 5. Audit log
    await logAudit({
      actorUserId: adminUser.id,
      action: 'toss_result_corrected',
      entityType: 'match',
      entityId: parsedId,
      details: {
        matchTitle: match.title,
        previousWinner,
        previousDecision,
        newWinner: canonicalWinner,
        newDecision: canonicalDecision,
        previous: {
          tossWinner: previousWinner,
          tossDecision: previousDecision
        },
        updated: {
          tossWinner: canonicalWinner,
          tossDecision: canonicalDecision
        },
        reason: cleanReason,
        totalReEvaluated: totalEvaluated,
        correctCount,
        incorrectCount
      },
      ipAddress
    });

    return {
      matchId: parsedId,
      matchTitle: match.title,
      previousResult: { winner: previousWinner, decision: previousDecision },
      correctedResult: { winner: canonicalWinner, decision: canonicalDecision },
      reason: cleanReason,
      predictionsEvaluated: {
        total: totalEvaluated,
        correct: correctCount,
        incorrect: incorrectCount
      },
      message: `Toss result corrected successfully. ${totalEvaluated} predictions re-evaluated.`
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Public-facing query for published match toss results.
 * Never leaks unverified or draft results to ordinary users.
 *
 * @param {number|string} matchId
 * @returns {Promise<object>}
 */
async function getPublicMatchResult(matchId) {
  const parsedId = validateMatchId(matchId);

  const [rows] = await pool.query(
    `SELECT id, title, team_a, team_b, status, result_toss_winner, result_decision, result_published_at
     FROM matches
     WHERE id = ?
     LIMIT 1`,
    [parsedId]
  );

  if (rows.length === 0) {
    const err = new Error('Match fixture not found.');
    err.status = 404;
    err.code = 'MATCH_NOT_FOUND';
    throw err;
  }

  const match = rows[0];

  if (!match.result_toss_winner) {
    return {
      matchId: match.id,
      matchTitle: match.title,
      isPublished: false,
      status: match.status,
      tossWinner: null,
      tossDecision: null,
      publishedAt: null,
      message: 'Official toss result is pending declaration by match officials.'
    };
  }

  return {
    matchId: match.id,
    matchTitle: match.title,
    isPublished: true,
    status: match.status,
    tossWinner: match.result_toss_winner,
    tossDecision: match.result_decision,
    publishedAt: match.result_published_at,
    note: 'Admin-verified toss result'
  };
}

module.exports = {
  VALID_TOSS_DECISIONS,
  getResultOverviewStatistics,
  getAdminResults,
  getMatchResultDetails,
  previewTossResult,
  publishTossResult,
  correctTossResult,
  getPublicMatchResult
};
