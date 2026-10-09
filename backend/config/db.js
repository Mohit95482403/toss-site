/**
 * TossArena Database Connection Pool
 * Manages reusable connections to MySQL using mysql2 Promise API.
 */

const mysql = require('mysql2/promise');
const { db, validateDbConfig } = require('./env');

// Validate environment configuration before instantiating pool
validateDbConfig();

// Create a single shared MySQL connection pool
const pool = mysql.createPool({
  host: db.host,
  port: db.port,
  user: db.user,
  password: db.password,
  database: db.name,
  waitForConnections: true,
  connectionLimit: db.connectionLimit,
  queueLimit: db.queueLimit,
  connectTimeout: db.connectTimeout,
  charset: 'utf8mb4',
  timezone: 'Z' // Enforce UTC representation
});

/**
 * Tests database connectivity using the connection pool
 * @returns {Promise<{ connected: boolean, database: string, host: string }>}
 */
async function testConnection() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query('SELECT DATABASE() AS current_db, 1 AS is_alive');
    const currentDb = rows[0]?.current_db || db.name;
    return {
      connected: true,
      database: currentDb,
      host: db.host
    };
  } finally {
    connection.release();
  }
}

/**
 * Shuts down the connection pool gracefully
 */
async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  testConnection,
  closePool
};
