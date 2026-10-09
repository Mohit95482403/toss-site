/**
 * TossArena Migration Runner Script
 * Safely executes forward-only migration SQL files.
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function run() {
  const migrationFile = process.argv[2] || path.join(__dirname, '../sql/migrations/003_wallet_package_claims.sql');
  console.log(`Applying migration: ${migrationFile}`);

  const content = fs.readFileSync(migrationFile, 'utf8');
  // Strip comments and split by semicolon
  const statements = content
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.toLowerCase().startsWith('use '));

  for (const sql of statements) {
    console.log(`Executing SQL: ${sql.substring(0, 60)}...`);
    await pool.query(sql);
  }

  console.log('Migration completed successfully.');
  await pool.end();
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
