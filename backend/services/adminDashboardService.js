/**
 * TossArena Admin Dashboard & System Overview Service
 * Provides database-backed executive statistics, audit log queries, and administrative user controls.
 * Strictly protected by authentication and administrator role authorization.
 */

const { pool } = require('../config/db');
const { logAudit } = require('./auditService');

/**
 * Retrieves authoritative aggregate statistics for the executive Admin Dashboard.
 * All figures derived directly from MySQL database records.
 *
 * @returns {Promise<object>}
 */
async function getAdminDashboardOverview() {
  // 1. User statistics
  const [userRows] = await pool.query(`
    SELECT
      COUNT(*) AS total_users,
      SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admin_count,
      SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS normal_user_count,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_users,
      SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended_users,
      SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) AS banned_users,
      SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS new_users_7d
    FROM users
  `);

  // 2. Match statistics
  const [matchRows] = await pool.query(`
    SELECT
      COUNT(*) AS total_matches,
      SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END) AS upcoming_matches,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_matches,
      SUM(CASE WHEN status = 'locked' THEN 1 ELSE 0 END) AS locked_matches,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_matches,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_matches,
      SUM(CASE WHEN status != 'cancelled' AND result_toss_winner IS NULL THEN 1 ELSE 0 END) AS awaiting_results,
      SUM(CASE WHEN result_toss_winner IS NOT NULL THEN 1 ELSE 0 END) AS results_published
    FROM matches
  `);

  // 3. Prediction statistics
  const [predRows] = await pool.query(`
    SELECT
      COUNT(*) AS total_predictions,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_predictions,
      SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) AS correct_predictions,
      SUM(CASE WHEN status = 'incorrect' THEN 1 ELSE 0 END) AS incorrect_predictions,
      SUM(CASE WHEN status IN ('cancelled', 'void') THEN 1 ELSE 0 END) AS void_predictions
    FROM predictions
  `);

  // 4. Matches requiring immediate administrative attention (open or locked awaiting result)
  const [urgentMatches] = await pool.query(`
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
      COUNT(p.id) AS prediction_count
    FROM matches m
    LEFT JOIN predictions p ON p.match_id = m.id
    WHERE m.status IN ('open', 'locked')
    GROUP BY m.id
    ORDER BY m.scheduled_at ASC
    LIMIT 6
  `);

  // 5. Recent administrative audit logs
  const [recentAudits] = await pool.query(`
    SELECT
      a.id,
      a.actor_user_id,
      a.action,
      a.entity_type,
      a.entity_id,
      a.details_json,
      a.ip_address,
      a.created_at,
      u.full_name AS actor_name,
      u.email AS actor_email
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.actor_user_id
    ORDER BY a.created_at DESC
    LIMIT 10
  `);

  const u = userRows[0] || {};
  const m = matchRows[0] || {};
  const p = predRows[0] || {};

  const totalEvaluated = parseInt(p.correct_predictions || 0, 10) + parseInt(p.incorrect_predictions || 0, 10);
  const accuracyRate = totalEvaluated > 0
    ? ((parseInt(p.correct_predictions || 0, 10) / totalEvaluated) * 100).toFixed(1)
    : '0.0';

  return {
    users: {
      total: parseInt(u.total_users || 0, 10),
      admins: parseInt(u.admin_count || 0, 10),
      normalUsers: parseInt(u.normal_user_count || 0, 10),
      active: parseInt(u.active_users || 0, 10),
      suspended: parseInt(u.suspended_users || 0, 10),
      banned: parseInt(u.banned_users || 0, 10),
      newLast7Days: parseInt(u.new_users_7d || 0, 10)
    },
    matches: {
      total: parseInt(m.total_matches || 0, 10),
      upcoming: parseInt(m.upcoming_matches || 0, 10),
      open: parseInt(m.open_matches || 0, 10),
      locked: parseInt(m.locked_matches || 0, 10),
      completed: parseInt(m.completed_matches || 0, 10),
      cancelled: parseInt(m.cancelled_matches || 0, 10),
      awaitingResults: parseInt(m.awaiting_results || 0, 10),
      resultsPublished: parseInt(m.results_published || 0, 10)
    },
    predictions: {
      total: parseInt(p.total_predictions || 0, 10),
      pending: parseInt(p.pending_predictions || 0, 10),
      correct: parseInt(p.correct_predictions || 0, 10),
      incorrect: parseInt(p.incorrect_predictions || 0, 10),
      void: parseInt(p.void_predictions || 0, 10),
      accuracyRate: parseFloat(accuracyRate)
    },
    urgentMatches: urgentMatches.map(r => ({
      id: r.id,
      title: r.title,
      teamA: r.team_a,
      teamB: r.team_b,
      tournamentName: r.tournament_name || 'Cricket Match',
      venue: r.venue || 'Neutral Ground',
      scheduledAt: r.scheduled_at,
      status: r.status,
      predictionCount: parseInt(r.prediction_count || 0, 10)
    })),
    recentAuditLogs: recentAudits.map(r => {
      let parsedDetails = null;
      if (typeof r.details_json === 'object' && r.details_json !== null) {
        parsedDetails = r.details_json;
      } else if (typeof r.details_json === 'string') {
        try { parsedDetails = JSON.parse(r.details_json); } catch (_) {}
      }
      return {
        id: r.id,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        details: parsedDetails,
        actor: r.actor_user_id ? {
          id: r.actor_user_id,
          name: r.actor_name || 'Admin',
          email: r.actor_email || ''
        } : null,
        ipAddress: r.ip_address,
        createdAt: r.created_at
      };
    })
  };
}

/**
 * Retrieves paginated audit logs for compliance monitoring.
 *
 * @param {object} options
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20]
 * @param {string} [options.action='']
 * @param {string} [options.entityType='']
 * @returns {Promise<object>}
 */
async function getAuditLogs({ page = 1, limit = 20, action = '', entityType = '' } = {}) {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (parsedPage - 1) * parsedLimit;

  const whereConditions = [];
  const queryParams = [];

  if (action && action.trim()) {
    whereConditions.push('a.action = ?');
    queryParams.push(action.trim());
  }

  if (entityType && entityType.trim()) {
    whereConditions.push('a.entity_type = ?');
    queryParams.push(entityType.trim());
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM audit_logs a ${whereClause}`,
    queryParams
  );
  const total = parseInt(countRows[0]?.total || 0, 10);
  const totalPages = Math.ceil(total / parsedLimit);

  const [rows] = await pool.query(
    `SELECT
       a.id,
       a.actor_user_id,
       a.action,
       a.entity_type,
       a.entity_id,
       a.details_json,
       a.ip_address,
       a.created_at,
       u.full_name AS actor_name,
       u.email AS actor_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ${whereClause}
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, parsedLimit, offset]
  );

  const logs = rows.map(r => {
    let parsedDetails = null;
    if (typeof r.details_json === 'object' && r.details_json !== null) {
      parsedDetails = r.details_json;
    } else if (typeof r.details_json === 'string') {
      try { parsedDetails = JSON.parse(r.details_json); } catch (_) {}
    }
    return {
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      details: parsedDetails,
      actor: r.actor_user_id ? {
        id: r.actor_user_id,
        name: r.actor_name || 'Admin',
        email: r.actor_email || ''
      } : null,
      ipAddress: r.ip_address,
      createdAt: r.created_at
    };
  });

  return {
    logs,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages
    }
  };
}

/**
 * Retrieves paginated user listing for administrative monitoring.
 *
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getAdminUsers({ page = 1, limit = 20, search = '', role = 'all', status = 'all' } = {}) {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (parsedPage - 1) * parsedLimit;

  const whereConditions = [];
  const queryParams = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.id = ?)');
    const idVal = /^[1-9]\d*$/.test(search.trim()) ? parseInt(search.trim(), 10) : 0;
    queryParams.push(term, term, idVal);
  }

  if (role && role !== 'all') {
    whereConditions.push('u.role = ?');
    queryParams.push(role.trim());
  }

  if (status && status !== 'all') {
    whereConditions.push('u.status = ?');
    queryParams.push(status.trim());
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM users u ${whereClause}`,
    queryParams
  );
  const total = parseInt(countRows[0]?.total || 0, 10);
  const totalPages = Math.ceil(total / parsedLimit);

  const [rows] = await pool.query(
    `SELECT
       u.id,
       u.full_name,
       u.email,
       u.role,
       u.status,
       u.created_at,
       u.last_login_at,
       w.balance AS wallet_balance,
       COUNT(p.id) AS prediction_count
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     LEFT JOIN predictions p ON p.user_id = u.id
     ${whereClause}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, parsedLimit, offset]
  );

  const users = rows.map(r => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    role: r.role,
    status: r.status,
    walletBalance: parseFloat(r.wallet_balance || 0),
    predictionCount: parseInt(r.prediction_count || 0, 10),
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at
  }));

  return {
    users,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages
    }
  };
}

module.exports = {
  getAdminDashboardOverview,
  getAuditLogs,
  getAdminUsers
};
