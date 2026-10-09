/**
 * Database Connectivity Verification Script
 * Validates pool creation, query execution, and database connectivity.
 */

const { testConnection, closePool } = require('../config/db');

async function runTest() {
  console.log('Testing TossArena MySQL database connectivity...');

  try {
    const result = await testConnection();
    console.log('✔ Database connection successful!');
    console.log(`  Database : ${result.database}`);
    console.log(`  Host     : ${result.host}`);
    console.log('  Status   : Connected and accepting queries');
    process.exitCode = 0;
  } catch (error) {
    console.error('❌ Database connection test failed!');
    console.error(`  Error Code   : ${error.code || 'UNKNOWN'}`);
    console.error(`  Error Message: ${error.message}`);
    process.exitCode = 1;
  } finally {
    try {
      await closePool();
    } catch (e) {
      // Ignore pool close error
    }
  }
}

runTest();
