/**
 * TossArena Audit Service
 * Centralized audit logging utility for administrative and security-critical events.
 * Writes immutable records to the `audit_logs` table.
 */

const { pool } = require('../config/db');

/**
 * Records an administrative or security event into the audit log.
 * Never logs credentials, session tokens, or sensitive user secrets.
 *
 * @param {object} params
 * @param {number|null} [params.actorUserId] - ID of administrator performing the action
 * @param {string} params.action - Event action identifier (e.g. 'match_created', 'match_updated')
 * @param {string} [params.entityType] - Type of entity acted upon (e.g. 'match', 'user')
 * @param {number|null} [params.entityId] - Database ID of entity
 * @param {object|null} [params.details] - Sanitized event metadata (JSON-serializable)
 * @param {string|null} [params.ipAddress] - Request IP address
 * @returns {Promise<number|null>} Inserted audit log ID
 */
async function logAudit({ actorUserId = null, action, entityType = null, entityId = null, details = null, ipAddress = null }) {
  if (!action || typeof action !== 'string') {
    return null;
  }

  try {
    let sanitizedDetails = null;
    if (details && typeof details === 'object') {
      // Create a shallow copy and sanitize sensitive keys
      const safe = { ...details };
      const SENSITIVE_KEYS = ['password', 'passwordHash', 'token', 'csrfToken', 'secret', 'cookie'];
      for (const k of Object.keys(safe)) {
        if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
          delete safe[k];
        }
      }
      sanitizedDetails = JSON.stringify(safe);
    }

    const [result] = await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details_json, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [actorUserId || null, action.trim(), entityType || null, entityId || null, sanitizedDetails, ipAddress || null]
    );

    return result.insertId || null;
  } catch (err) {
    // Non-blocking: log error to console, do not fail primary transaction unless strict
    console.error(`[Audit Log Failure] Action "${action}" failed to record:`, err.message);
    return null;
  }
}

module.exports = {
  logAudit
};
