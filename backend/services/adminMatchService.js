/**
 * TossArena Admin Match Management Service (Day 11)
 * Authoritative business rules, input validation, status transitions,
 * prediction protection, and audit logging for administrative match controls.
 */

const { pool } = require('../config/db');
const { logAudit } = require('./auditService');

// Valid match statuses strictly governed by MySQL ENUM
const ALLOWED_STATUSES = ['upcoming', 'open', 'locked', 'completed', 'cancelled'];

// Valid lifecycle transitions allowed for matches
const ALLOWED_TRANSITIONS = {
  upcoming: ['open', 'cancelled'],
  open: ['locked', 'cancelled'],
  locked: ['completed', 'cancelled', 'open'], // 'open' only permitted if scheduled_at is still in the future
  completed: [], // Terminal state
  cancelled: []  // Terminal state
};

// Allowlist for sort parameters mapped to trusted SQL expressions
const SORT_ALLOWLIST = {
  date_asc: 'm.scheduled_at ASC, m.id DESC',
  date_desc: 'm.scheduled_at DESC, m.id DESC',
  teams_asc: 'm.team_a ASC, m.team_b ASC, m.id DESC',
  teams_desc: 'm.team_a DESC, m.team_b DESC, m.id DESC',
  status: 'm.status ASC, m.scheduled_at ASC, m.id DESC',
  id_desc: 'm.id DESC',
  id_asc: 'm.id ASC',
  predictions_desc: 'prediction_count DESC, m.id DESC'
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
 * Validates team names ensuring they are non-empty, reasonable length, and distinct
 * @param {string} teamA
 * @param {string} teamB
 */
function validateTeamNames(teamA, teamB) {
  if (!teamA || typeof teamA !== 'string' || teamA.trim().length < 2 || teamA.trim().length > 100) {
    const err = new Error('Team One name must be between 2 and 100 characters.');
    err.status = 400;
    err.code = 'INVALID_TEAM_A';
    throw err;
  }

  if (!teamB || typeof teamB !== 'string' || teamB.trim().length < 2 || teamB.trim().length > 100) {
    const err = new Error('Team Two name must be between 2 and 100 characters.');
    err.status = 400;
    err.code = 'INVALID_TEAM_B';
    throw err;
  }

  if (teamA.trim().toLowerCase() === teamB.trim().toLowerCase()) {
    const err = new Error('Team One and Team Two must be distinct teams.');
    err.status = 400;
    err.code = 'IDENTICAL_TEAMS';
    throw err;
  }
}

/**
 * Validates scheduled date string
 * @param {string} scheduledAt
 * @param {boolean} [requireFuture=true]
 * @returns {Date}
 */
function validateScheduledDate(scheduledAt, requireFuture = true) {
  if (!scheduledAt) {
    const err = new Error('Scheduled date and time is required.');
    err.status = 400;
    err.code = 'MISSING_SCHEDULED_AT';
    throw err;
  }

  const dateObj = new Date(scheduledAt);
  if (isNaN(dateObj.getTime())) {
    const err = new Error('Invalid scheduled date format. Must be a valid ISO date/time string.');
    err.status = 400;
    err.code = 'INVALID_DATE_FORMAT';
    throw err;
  }

  if (requireFuture && dateObj.getTime() <= Date.now()) {
    const err = new Error('Scheduled date and time must be set in the future.');
    err.status = 400;
    err.code = 'INVALID_SCHEDULE_DATE';
    throw err;
  }

  return dateObj;
}

/**
 * Retrieves paginated, filtered, searchable match fixtures for administration
 * Includes authoritative prediction count for each fixture.
 *
 * @param {object} options
 * @returns {Promise<{ matches: Array, pagination: object, summary: object }>}
 */
async function getAdminMatches(options = {}) {
  const {
    page: rawPage = 1,
    limit: rawLimit = 15,
    search = '',
    status = 'all',
    dateFilter = 'all',
    dateFrom = '',
    dateTo = '',
    sort = 'date_asc'
  } = options;

  // 1. Pagination bounds
  const page = Math.max(1, parseInt(rawPage, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(rawLimit, 10) || 15));
  const offset = (page - 1) * limit;

  // 2. Sort validation
  const sortExpression = SORT_ALLOWLIST[sort] || SORT_ALLOWLIST.date_asc;

  // 3. Query building
  const whereConditions = [];
  const queryParams = [];

  // Filter by status
  if (status && status !== 'all') {
    const normalizedStatus = String(status).toLowerCase().trim();
    if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
      const err = new Error(`Invalid status filter "${status}". Allowed: ${ALLOWED_STATUSES.join(', ')}`);
      err.status = 400;
      err.code = 'INVALID_STATUS_FILTER';
      throw err;
    }
    whereConditions.push('m.status = ?');
    queryParams.push(normalizedStatus);
  }

  // Filter by date presets
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

    if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
      const err = new Error('dateFrom cannot be later than dateTo.');
      err.status = 400;
      err.code = 'INVALID_DATE_RANGE';
      throw err;
    }
  }

  // Search across teams, title, tournament, venue, or match ID
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

  // 4. Total count query
  const countSql = `SELECT COUNT(*) AS total FROM matches m ${whereClause}`;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = parseInt(countRows[0]?.total || 0, 10);
  const totalPages = Math.ceil(total / limit) || 0;

  // 5. Paginated matches query with prediction counts
  const matchesSql = `
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
      m.created_by,
      m.created_at,
      m.updated_at,
      u.full_name AS created_by_name,
      COUNT(p.id) AS prediction_count
    FROM matches m
    LEFT JOIN users u ON u.id = m.created_by
    LEFT JOIN predictions p ON p.match_id = m.id
    ${whereClause}
    GROUP BY m.id
    ORDER BY ${sortExpression}
    LIMIT ? OFFSET ?
  `;

  const [matchesRows] = await pool.query(matchesSql, [...queryParams, limit, offset]);

  // Format matches cleanly
  const matches = matchesRows.map((row) => ({
    id: row.id,
    title: row.title,
    teamA: row.team_a,
    teamB: row.team_b,
    team_a: row.team_a,
    team_b: row.team_b,
    tournamentName: row.tournament_name || 'Cricket Match',
    tournament_name: row.tournament_name || 'Cricket Match',
    venue: row.venue || 'Neutral Ground',
    scheduledAt: row.scheduled_at,
    scheduled_at: row.scheduled_at,
    status: row.status,
    resultTossWinner: row.result_toss_winner,
    result_toss_winner: row.result_toss_winner,
    resultDecision: row.result_decision,
    result_decision: row.result_decision,
    predictionCount: parseInt(row.prediction_count || 0, 10),
    prediction_count: parseInt(row.prediction_count || 0, 10),
    createdBy: row.created_by ? { id: row.created_by, name: row.created_by_name } : null,
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at
  }));

  // 6. Summary metrics
  const summary = await getMatchSummaryStatistics();

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
 * Calculates authoritative platform match summary statistics
 * @returns {Promise<object>}
 */
async function getMatchSummaryStatistics() {
  const [summaryRows] = await pool.query(`
    SELECT
      COUNT(*) AS total_matches,
      SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END) AS upcoming_matches,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_matches,
      SUM(CASE WHEN status = 'locked' THEN 1 ELSE 0 END) AS locked_matches,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_matches,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_matches
    FROM matches
  `);

  const [predTotalRows] = await pool.query(`
    SELECT COUNT(*) AS total_predictions FROM predictions
  `);

  const s = summaryRows[0] || {};
  return {
    total: parseInt(s.total_matches || 0, 10),
    totalMatches: parseInt(s.total_matches || 0, 10),
    upcoming: parseInt(s.upcoming_matches || 0, 10),
    upcomingMatches: parseInt(s.upcoming_matches || 0, 10),
    open: parseInt(s.open_matches || 0, 10),
    openMatches: parseInt(s.open_matches || 0, 10),
    locked: parseInt(s.locked_matches || 0, 10),
    lockedMatches: parseInt(s.locked_matches || 0, 10),
    completed: parseInt(s.completed_matches || 0, 10),
    completedMatches: parseInt(s.completed_matches || 0, 10),
    cancelled: parseInt(s.cancelled_matches || 0, 10),
    cancelledMatches: parseInt(s.cancelled_matches || 0, 10),
    totalPredictions: parseInt(predTotalRows[0]?.total_predictions || 0, 10)
  };
}

/**
 * Retrieves single match fixture details by ID for administrative inspection
 * @param {number} matchId
 * @returns {Promise<object>}
 */
async function getAdminMatchById(matchId) {
  const parsedId = parseInt(matchId, 10);
  if (isNaN(parsedId) || parsedId <= 0) {
    const err = new Error('Invalid match ID. Must be a positive integer.');
    err.status = 400;
    err.code = 'INVALID_MATCH_ID';
    throw err;
  }

  const [rows] = await pool.query(`
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
      m.created_by,
      m.created_at,
      m.updated_at,
      u.full_name AS created_by_name,
      u.email AS created_by_email,
      COUNT(p.id) AS prediction_count
    FROM matches m
    LEFT JOIN users u ON u.id = m.created_by
    LEFT JOIN predictions p ON p.match_id = m.id
    WHERE m.id = ?
    GROUP BY m.id
    LIMIT 1
  `, [parsedId]);

  if (rows.length === 0) {
    const err = new Error('Match fixture not found.');
    err.status = 404;
    err.code = 'MATCH_NOT_FOUND';
    throw err;
  }

  const row = rows[0];

  // Retrieve pick breakdown
  const [pickBreakdown] = await pool.query(`
    SELECT predicted_toss_winner AS team, COUNT(*) AS count
    FROM predictions
    WHERE match_id = ?
    GROUP BY predicted_toss_winner
  `, [parsedId]);

  return {
    id: row.id,
    title: row.title,
    teamA: row.team_a,
    teamB: row.team_b,
    team_a: row.team_a,
    team_b: row.team_b,
    tournamentName: row.tournament_name,
    tournament_name: row.tournament_name,
    venue: row.venue,
    scheduledAt: row.scheduled_at,
    scheduled_at: row.scheduled_at,
    status: row.status,
    resultTossWinner: row.result_toss_winner,
    result_toss_winner: row.result_toss_winner,
    resultDecision: row.result_decision,
    result_decision: row.result_decision,
    predictionCount: parseInt(row.prediction_count || 0, 10),
    prediction_count: parseInt(row.prediction_count || 0, 10),
    pickBreakdown: pickBreakdown.map(p => ({ team: p.team, count: parseInt(p.count, 10) })),
    createdBy: row.created_by ? { id: row.created_by, name: row.created_by_name, email: row.created_by_email } : null,
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at
  };
}

/**
 * Creates a new cricket match fixture
 *
 * @param {object} matchData
 * @param {object} adminUser - Authenticated administrator
 * @param {string} [ipAddress]
 * @returns {Promise<object>}
 */
async function createMatch(matchData, adminUser, ipAddress = null) {
  const { teamA, teamB, tournamentName, venue, scheduledAt, title, status = 'upcoming' } = matchData;

  // 0. Check mandatory fields
  if (!teamA || !teamB || !venue || !scheduledAt) {
    const err = new Error('teamA, teamB, venue, and scheduledAt are mandatory required fields.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // 1. Validate team names
  validateTeamNames(teamA, teamB);

  // 2. Validate metadata lengths
  if (!tournamentName || typeof tournamentName !== 'string' || tournamentName.trim().length < 2 || tournamentName.trim().length > 150) {
    const err = new Error('Tournament name must be between 2 and 150 characters.');
    err.status = 400;
    err.code = 'INVALID_TOURNAMENT_NAME';
    throw err;
  }

  if (!venue || typeof venue !== 'string' || venue.trim().length < 2 || venue.trim().length > 150) {
    const err = new Error('Venue must be between 2 and 150 characters.');
    err.status = 400;
    err.code = 'INVALID_VENUE';
    throw err;
  }

  // 3. Validate scheduled date
  const dateObj = validateScheduledDate(scheduledAt, true);

  // 4. Validate initial status (matches can be created as 'upcoming' or directly 'open')
  const cleanStatus = String(status || 'upcoming').toLowerCase().trim();
  if (!['upcoming', 'open'].includes(cleanStatus)) {
    const err = new Error('Initial match status on creation must be either "upcoming" or "open".');
    err.status = 400;
    err.code = 'INVALID_INITIAL_STATUS';
    throw err;
  }

  // 5. Generate formatted title if omitted
  const cleanTeamA = teamA.trim();
  const cleanTeamB = teamB.trim();
  const cleanTitle = (title && typeof title === 'string' && title.trim())
    ? title.trim().slice(0, 200)
    : `${cleanTeamA} vs ${cleanTeamB}`;

  const cleanTournament = tournamentName.trim();
  const cleanVenue = venue.trim();
  const formattedDate = dateObj.toISOString().slice(0, 19).replace('T', ' ');

  // 6. Insert into MySQL
  const [result] = await pool.query(`
    INSERT INTO matches (title, team_a, team_b, tournament_name, venue, scheduled_at, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `, [cleanTitle, cleanTeamA, cleanTeamB, cleanTournament, cleanVenue, formattedDate, cleanStatus, adminUser.id]);

  const newMatchId = result.insertId;

  // 7. Record immutable audit log
  await logAudit({
    actorUserId: adminUser.id,
    action: 'match_created',
    entityType: 'match',
    entityId: newMatchId,
    details: {
      title: cleanTitle,
      teamA: cleanTeamA,
      teamB: cleanTeamB,
      tournamentName: cleanTournament,
      venue: cleanVenue,
      scheduledAt: formattedDate,
      status: cleanStatus
    },
    ipAddress
  });

  return getAdminMatchById(newMatchId);
}

/**
 * Updates editable fields of an existing match
 * CRITICAL RULE: Rejects team name modifications if user predictions already exist.
 *
 * @param {number} matchId
 * @param {object} updateData
 * @param {object} adminUser
 * @param {string} [ipAddress]
 * @returns {Promise<object>}
 */
async function updateMatch(matchId, updateData, adminUser, ipAddress = null) {
  const existing = await getAdminMatchById(matchId);

  // Terminal matches cannot be edited
  if (['completed', 'cancelled'].includes(existing.status)) {
    const err = new Error(`Cannot modify match details for a match in terminal state "${existing.status}".`);
    err.status = 409;
    err.code = 'MATCH_TERMINAL_STATE';
    throw err;
  }

  const { teamA, teamB, tournamentName, venue, scheduledAt, title } = updateData;
  const updates = [];
  const params = [];
  const auditChanges = {};

  // Check dependent predictions protection
  const hasPredictions = existing.predictionCount > 0;

  // Team One
  if (teamA !== undefined) {
    if (!teamA || typeof teamA !== 'string' || teamA.trim().length < 2 || teamA.trim().length > 100) {
      const err = new Error('Team One name must be between 2 and 100 characters.');
      err.status = 400;
      err.code = 'INVALID_TEAM_A';
      throw err;
    }
    const cleanTeamA = teamA.trim();
    if (cleanTeamA !== existing.teamA) {
      if (hasPredictions) {
        const err = new Error('Cannot rename teams for a match with existing user predictions. Preserving prediction integrity.');
        err.status = 409;
        err.code = 'CANNOT_RENAME_TEAMS_WITH_EXISTING_PREDICTIONS';
        throw err;
      }
      updates.push('team_a = ?');
      params.push(cleanTeamA);
      auditChanges.teamA = { from: existing.teamA, to: cleanTeamA };
    }
  }

  // Team Two
  if (teamB !== undefined) {
    if (!teamB || typeof teamB !== 'string' || teamB.trim().length < 2 || teamB.trim().length > 100) {
      const err = new Error('Team Two name must be between 2 and 100 characters.');
      err.status = 400;
      err.code = 'INVALID_TEAM_B';
      throw err;
    }
    const cleanTeamB = teamB.trim();
    if (cleanTeamB !== existing.teamB) {
      if (hasPredictions) {
        const err = new Error('Cannot rename teams for a match with existing user predictions. Preserving prediction integrity.');
        err.status = 409;
        err.code = 'CANNOT_RENAME_TEAMS_WITH_EXISTING_PREDICTIONS';
        throw err;
      }
      updates.push('team_b = ?');
      params.push(cleanTeamB);
      auditChanges.teamB = { from: existing.teamB, to: cleanTeamB };
    }
  }

  // Ensure updated teams are distinct
  const finalTeamA = (teamA !== undefined ? teamA.trim() : existing.teamA).toLowerCase();
  const finalTeamB = (teamB !== undefined ? teamB.trim() : existing.teamB).toLowerCase();
  if (finalTeamA === finalTeamB) {
    const err = new Error('Team One and Team Two must be distinct teams.');
    err.status = 400;
    err.code = 'IDENTICAL_TEAMS';
    throw err;
  }

  // Tournament
  if (tournamentName !== undefined) {
    if (!tournamentName || typeof tournamentName !== 'string' || tournamentName.trim().length < 2 || tournamentName.trim().length > 150) {
      const err = new Error('Tournament name must be between 2 and 150 characters.');
      err.status = 400;
      err.code = 'INVALID_TOURNAMENT_NAME';
      throw err;
    }
    const cleanTourn = tournamentName.trim();
    if (cleanTourn !== existing.tournamentName) {
      updates.push('tournament_name = ?');
      params.push(cleanTourn);
      auditChanges.tournamentName = { from: existing.tournamentName, to: cleanTourn };
    }
  }

  // Venue
  if (venue !== undefined) {
    if (!venue || typeof venue !== 'string' || venue.trim().length < 2 || venue.trim().length > 150) {
      const err = new Error('Venue must be between 2 and 150 characters.');
      err.status = 400;
      err.code = 'INVALID_VENUE';
      throw err;
    }
    const cleanVenue = venue.trim();
    if (cleanVenue !== existing.venue) {
      updates.push('venue = ?');
      params.push(cleanVenue);
      auditChanges.venue = { from: existing.venue, to: cleanVenue };
    }
  }

  // Scheduled date
  if (scheduledAt !== undefined) {
    const dateObj = validateScheduledDate(scheduledAt, false);
    const formatted = dateObj.toISOString().slice(0, 19).replace('T', ' ');
    const existingDateFormatted = new Date(existing.scheduledAt).toISOString().slice(0, 19).replace('T', ' ');
    if (formatted !== existingDateFormatted) {
      updates.push('scheduled_at = ?');
      params.push(formatted);
      auditChanges.scheduledAt = { from: existingDateFormatted, to: formatted };
    }
  }

  // Title
  if (title !== undefined) {
    const cleanTitle = title && typeof title === 'string' ? title.trim().slice(0, 200) : `${existing.teamA} vs ${existing.teamB}`;
    if (cleanTitle !== existing.title) {
      updates.push('title = ?');
      params.push(cleanTitle);
      auditChanges.title = { from: existing.title, to: cleanTitle };
    }
  }

  if (updates.length === 0) {
    return existing; // No fields changed
  }

  updates.push('updated_at = NOW()');
  params.push(matchId);

  await pool.query(`
    UPDATE matches
    SET ${updates.join(', ')}
    WHERE id = ?
  `, params);

  // Record audit log
  await logAudit({
    actorUserId: adminUser.id,
    action: 'match_updated',
    entityType: 'match',
    entityId: matchId,
    details: auditChanges,
    ipAddress
  });

  return getAdminMatchById(matchId);
}

/**
 * Updates match status enforcing lifecycle transition rules
 *
 * @param {number} matchId
 * @param {string} targetStatus
 * @param {object} adminUser
 * @param {string} [ipAddress]
 * @returns {Promise<object>}
 */
async function updateMatchStatus(matchId, targetStatus, adminUser, ipAddress = null) {
  const existing = await getAdminMatchById(matchId);
  const currentStatus = (existing.status || '').toLowerCase();
  const normalizedTarget = String(targetStatus || '').toLowerCase().trim();

  // 1. Validate target status is a recognized ENUM value
  if (!ALLOWED_STATUSES.includes(normalizedTarget)) {
    const err = new Error(`Invalid target status "${targetStatus}". Allowed statuses: ${ALLOWED_STATUSES.join(', ')}`);
    err.status = 400;
    err.code = 'INVALID_STATUS';
    throw err;
  }

  // 2. No-op if target status is already current
  if (currentStatus === normalizedTarget) {
    return existing;
  }

  // 3. Terminal state check
  if (['completed', 'cancelled'].includes(currentStatus)) {
    const err = new Error(`Match is already in a terminal state "${currentStatus}" and cannot transition to "${normalizedTarget}".`);
    err.status = 409;
    err.code = 'TERMINAL_STATE_IMMUTABLE';
    throw err;
  }

  // 4. Allowed transition check
  const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];
  if (!allowedNext.includes(normalizedTarget)) {
    const err = new Error(`Invalid status transition from "${currentStatus}" to "${normalizedTarget}". Permitted transitions: ${allowedNext.join(', ') || 'none'}`);
    err.status = 400;
    err.code = 'INVALID_STATUS_TRANSITION';
    throw err;
  }

  // 5. Special check for reopening predictions (locked -> open)
  if (currentStatus === 'locked' && normalizedTarget === 'open') {
    const scheduledTime = new Date(existing.scheduledAt).getTime();
    if (scheduledTime <= Date.now()) {
      const err = new Error('Cannot reopen predictions because the match scheduled cutoff time has already passed.');
      err.status = 409;
      err.code = 'CANNOT_REOPEN_PAST_CUTOFF';
      throw err;
    }
  }

  // 6. Update status in MySQL
  await pool.query(
    'UPDATE matches SET status = ?, updated_at = NOW() WHERE id = ?',
    [normalizedTarget, matchId]
  );

  // 7. Record audit log
  await logAudit({
    actorUserId: adminUser.id,
    action: 'match_status_changed',
    entityType: 'match',
    entityId: matchId,
    details: {
      previousStatus: currentStatus,
      newStatus: normalizedTarget
    },
    ipAddress
  });

  return getAdminMatchById(matchId);
}

/**
 * Safely cancels a match fixture
 * Preserves all user prediction records and transaction ledger history.
 *
 * @param {number} matchId
 * @param {string} [reason]
 * @param {object} adminUser
 * @param {string} [ipAddress]
 * @returns {Promise<object>}
 */
async function cancelMatch(matchId, reason = '', adminUser, ipAddress = null) {
  const existing = await getAdminMatchById(matchId);

  if (existing.status === 'cancelled') {
    const err = new Error('Cannot cancel a match that is already cancelled.');
    err.status = 400;
    err.code = 'CANNOT_CANCEL_TERMINAL_MATCH';
    throw err;
  }

  if (existing.status === 'completed') {
    const err = new Error('Cannot cancel a completed match.');
    err.status = 400;
    err.code = 'CANNOT_CANCEL_TERMINAL_MATCH';
    throw err;
  }

  // Update status to 'cancelled'
  await pool.query(
    'UPDATE matches SET status = "cancelled", updated_at = NOW() WHERE id = ?',
    [matchId]
  );

  // Record audit log with cancellation reason
  await logAudit({
    actorUserId: adminUser.id,
    action: 'match_cancelled',
    entityType: 'match',
    entityId: matchId,
    details: {
      previousStatus: existing.status,
      predictionCount: existing.predictionCount,
      reason: reason ? String(reason).trim().slice(0, 255) : 'Administrative cancellation'
    },
    ipAddress
  });

  return getAdminMatchById(matchId);
}

module.exports = {
  ALLOWED_STATUSES,
  ALLOWED_TRANSITIONS,
  getAdminMatches,
  getAdminMatchById,
  createMatch,
  updateMatch,
  updateMatchStatus,
  cancelMatch,
  getMatchSummaryStatistics
};
