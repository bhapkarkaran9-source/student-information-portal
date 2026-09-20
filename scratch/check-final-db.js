const pool = require('../src/config/db');

async function check() {
  const [tables] = await pool.query('SHOW TABLES FROM student_portal_db');
  console.log('=== student_portal_db ===');
  console.log(`Total tables: ${tables.length}`);
  for (const row of tables) {
    const tableName = Object.values(row)[0];
    const [cnt] = await pool.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
    console.log(`  ${tableName.padEnd(25)} -> ${cnt[0].count}`);
  }

  console.log('\n=== Legacy DB student_information_portal ===');
  const [legacyTables] = await pool.query('SHOW TABLES FROM student_information_portal');
  const [legacyUsers] = await pool.query('SELECT COUNT(*) as count FROM student_information_portal.users');
  console.log(`  Total tables: ${legacyTables.length}`);
  console.log(`  Users count:  ${legacyUsers[0].count}`);

  await pool.end();
}

check().catch(console.error);
