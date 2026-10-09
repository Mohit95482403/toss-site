const { pool } = require('../config/db');

async function main() {
  await pool.query("UPDATE users SET role = 'admin' WHERE email = 'mohit@gmail.com'");
  const [rows] = await pool.query("SELECT id, full_name, email, role FROM users WHERE role = 'admin'");
  console.log('Admins in TossArena:', rows);
  await pool.end();
}

main().catch(console.error);
