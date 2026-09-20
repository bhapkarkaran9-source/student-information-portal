const pool = require('../src/config/db');

(async () => {
  try {
    console.log('=== SHOW TABLES in student_portal_db ===');
    const [tables] = await pool.query('SHOW TABLES');
    console.log(tables);

    for (const t of ['notices', 'notifications', 'notice_board', 'announcements']) {
      try {
        const [create] = await pool.query(`SHOW CREATE TABLE ${t}`);
        console.log(`\n=== SHOW CREATE TABLE ${t} ===\n`, create[0]['Create Table']);
        const [desc] = await pool.query(`DESCRIBE ${t}`);
        console.log(`\n=== DESCRIBE ${t} ===\n`, desc);
        const [count] = await pool.query(`SELECT COUNT(*) as c FROM ${t}`);
        console.log(`\n=== COUNT(*) FROM ${t} ===:`, count[0].c);
      } catch (err) {
        console.log(`Table ${t} does not exist or error:`, err.message);
      }
    }

    // Also check any FK references to notices or notifications
    const [fks] = await pool.query(`
      SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = 'student_portal_db' 
        AND REFERENCED_TABLE_NAME IN ('notices', 'notifications')
    `);
    console.log('\n=== FKs REFERENCING notices or notifications ===\n', fks);

    process.exit(0);
  } catch (err) {
    console.error('Inspection error:', err);
    process.exit(1);
  }
})();
