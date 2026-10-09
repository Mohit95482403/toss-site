/**
 * TossArena Match Controller
 * Provides secure, parameterized read-only fixture feeds, pagination,
 * search, filters, sorting, and single-match detail retrieval.
 */

const { pool } = require('../config/db');

// Allowed status values strictly matching database ENUM
const ALLOWED_STATUSES = ['open', 'upcoming', 'locked', 'completed', 'cancelled'];

// Allowlist for sort parameters mapped to trusted SQL column expressions
const SORT_ALLOWLIST = {
  date_asc: 'scheduled_at ASC',
  date_desc: 'scheduled_at DESC',
  teams_asc: 'team_a ASC, team_b ASC',
  teams_desc: 'team_a DESC, team_b DESC',
  status: 'status ASC, scheduled_at ASC'
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
 * GET /api/matches
 * Returns paginated, searchable, filtered cricket fixtures
 */
async function getMatches(req, res, next) {
  try {
    const { search, status, tournament, sort, page: rawPage, limit: rawLimit } = req.query;

    // 1. Validate & bound pagination
    const page = Math.max(1, parseInt(rawPage, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(rawLimit, 10) || 12));
    const offset = (page - 1) * limit;

    // 2. Validate sort option against allowlist
    const sortExpression = SORT_ALLOWLIST[sort] || SORT_ALLOWLIST.date_asc;

    // 3. Build parameterized WHERE conditions
    const whereConditions = [];
    const queryParams = [];

    // Filter by match status
    if (status && status !== 'all') {
      const normalizedStatus = String(status).toLowerCase().trim();
      if (ALLOWED_STATUSES.includes(normalizedStatus)) {
        whereConditions.push('status = ?');
        queryParams.push(normalizedStatus);
      }
    }

    // Filter by tournament
    if (tournament && typeof tournament === 'string') {
      const trimmedTourney = tournament.trim();
      if (trimmedTourney && trimmedTourney !== 'all') {
        whereConditions.push('tournament_name = ?');
        queryParams.push(trimmedTourney);
      }
    }

    // Search across title, teams, and tournament name
    if (search && typeof search === 'string') {
      const trimmedSearch = search.trim();
      if (trimmedSearch) {
        const escapedTerm = `%${escapeLikeString(trimmedSearch)}%`;
        whereConditions.push(
          '(title LIKE ? ESCAPE \'\\\\\' OR team_a LIKE ? ESCAPE \'\\\\\' OR team_b LIKE ? ESCAPE \'\\\\\' OR tournament_name LIKE ? ESCAPE \'\\\\\')'
        );
        queryParams.push(escapedTerm, escapedTerm, escapedTerm, escapedTerm);
      }
    }


    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 4. Query total count matching filter
    const countSql = `SELECT COUNT(*) AS total FROM matches ${whereClause}`;
    const [countRows] = await pool.query(countSql, queryParams);
    const total = parseInt(countRows[0]?.total || 0, 10);
    const totalPages = Math.ceil(total / limit) || 0;

    // 5. Query paginated results
    const selectSql = `
      SELECT id, title, team_a, team_b, tournament_name, venue, scheduled_at,
             status, result_toss_winner, result_decision, created_at
      FROM matches
      ${whereClause}
      ORDER BY ${sortExpression}
      LIMIT ? OFFSET ?
    `;

    const selectParams = [...queryParams, limit, offset];
    const [matches] = await pool.query(selectSql, selectParams);

    return res.status(200).json({
      success: true,
      data: matches,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/matches/tournaments
 * Retrieves distinct tournament names for dropdown filters
 */
async function getTournaments(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT tournament_name
       FROM matches
       WHERE tournament_name IS NOT NULL AND tournament_name != ''
       ORDER BY tournament_name ASC`
    );

    const tournaments = rows.map((r) => r.tournament_name);

    return res.status(200).json({
      success: true,
      data: tournaments
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/matches/:id
 * Retrieves a single match by database ID
 */
async function getMatchById(req, res, next) {
  try {
    const { id } = req.params;

    // Validate ID is positive integer
    if (!/^[1-9]\d*$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid match ID. ID must be a positive integer.'
      });
    }

    const matchId = parseInt(id, 10);

    const [rows] = await pool.query(
      `SELECT id, title, team_a, team_b, tournament_name, venue, scheduled_at,
              status, result_toss_winner, result_decision, created_at, updated_at
       FROM matches
       WHERE id = ?
       LIMIT 1`,
      [matchId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Match fixture not found.'
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getMatches,
  getTournaments,
  getMatchById
};
