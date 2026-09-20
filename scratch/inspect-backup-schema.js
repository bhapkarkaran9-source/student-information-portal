const pool = require('../src/config/db');

async function inspect() {
  const [tables] = await pool.query("SHOW TABLES LIKE 'backup_history'");
  if (tables.length > 0) {
    console.log('backup_history exists!');
    const [createTable] = await pool.query('SHOW CREATE TABLE backup_history');
    console.log(createTable[0]['Create Table']);
    const [cols] = await pool.query('DESCRIBE backup_history');
    console.log('Columns:', cols);
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM backup_history');
    console.log('Row count:', rows[0].count);
  } else {
    console.log('backup_history does NOT exist.');
  }
  await pool.end();
}

inspect().catch(console.error);
