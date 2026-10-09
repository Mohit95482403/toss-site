/**
 * TossArena Match Controller
 * Provides read-only fixture feeds for public pages and user dashboard previews.
 */

const { pool } = require('../config/db');

/**
 * GET /api/matches
 * Returns cricket matches, optionally filtered by status (e.g., 'open', 'upcoming')
 */
async function getMatches(req, res, next) {
  try {
    const { status, limit } = req.query;
    const maxLimit = Math.min(parseInt(limit, 10) || 20, 50);

    let query = `
      SELECT id, title, team_a, team_b, tournament_name, venue, scheduled_at,
             status, result_toss_winner, result_decision, created_at
      FROM matches
    `;
    const params = [];

    if (status && ['open', 'upcoming', 'locked', 'completed', 'cancelled'].includes(status)) {
      query += ` WHERE status = ?`;
      params.push(status);
    }

    query += ` ORDER BY scheduled_at ASC LIMIT ?`;
    params.push(maxLimit);

    const [matches] = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      count: matches.length,
      data: matches
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/matches/:id
 * Retrieves a single match by ID
 */
async function getMatchById(req, res, next) {
  try {
    const matchId = parseInt(req.params.id, 10);
    if (!matchId || matchId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid match ID.'
      });
    }

    const [rows] = await pool.query(
      `SELECT id, title, team_a, team_b, tournament_name, venue, scheduled_at,
              status, result_toss_winner, result_decision, created_at
       FROM matches WHERE id = ? LIMIT 1`,
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
  getMatchById
};
