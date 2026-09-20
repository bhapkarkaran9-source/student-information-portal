const pool = require('../src/config/db');

async function verify() {
  // 1. queries schema
  const [qTable] = await pool.query('SHOW CREATE TABLE queries');
  console.log('====================================================');
  console.log('1. SHOW CREATE TABLE queries');
  console.log('====================================================');
  console.log(qTable[0]['Create Table']);
  console.log('\n');

  // 2. query_replies schema
  const [qrTable] = await pool.query('SHOW CREATE TABLE query_replies');
  console.log('====================================================');
  console.log('2. SHOW CREATE TABLE query_replies');
  console.log('====================================================');
  console.log(qrTable[0]['Create Table']);
  console.log('\n');

  // 3. priority & status column definitions
  const [qCols] = await pool.query("SHOW COLUMNS FROM queries WHERE Field IN ('priority', 'status')");
  console.log('====================================================');
  console.log('3. COLUMNS IN queries (priority & status)');
  console.log('====================================================');
  console.table(qCols);
  console.log('\n');

  // 4. Foreign Keys
  const [fks] = await pool.query(`
    SELECT 
      TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'student_portal_db' 
      AND TABLE_NAME IN ('queries', 'query_replies')
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, CONSTRAINT_NAME
  `);
  console.log('====================================================');
  console.log('4. FOREIGN KEYS (queries & query_replies)');
  console.log('====================================================');
  console.table(fks);
  console.log('\n');

  // 5. Indexes
  const [indexes] = await pool.query(`
    SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'student_portal_db'
      AND TABLE_NAME IN ('queries', 'query_replies')
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
  `);
  console.log('====================================================');
  console.log('5. INDEXES (queries & query_replies)');
  console.log('====================================================');
  console.table(indexes);
  console.log('\n');

  // 6. Notifications Table & Integration verification
  const [notifTable] = await pool.query('SHOW CREATE TABLE notifications');
  console.log('====================================================');
  console.log('6. NOTIFICATIONS TABLE & INTEGRATION');
  console.log('====================================================');
  console.log(notifTable[0]['Create Table']);
  console.log('\n');

  // 7. Live row counts in student_portal_db
  const tables = [
    'users', 'students', 'teachers', 'departments', 'courses', 'enrollments',
    'timetable', 'attendance', 'grades', 'assignments', 'study_materials',
    'notices', 'notifications', 'queries', 'query_replies'
  ];
  const counts = [];
  for (const t of tables) {
    const [cnt] = await pool.query(`SELECT COUNT(*) AS c FROM ${t}`);
    counts.push({ table: t, count: cnt[0].c });
  }
  console.log('====================================================');
  console.log('7. ROW COUNTS (student_portal_db)');
  console.log('====================================================');
  console.table(counts);
  console.log('\n');

  // 8. Legacy DB check
  const [legacyDbs] = await pool.query("SHOW DATABASES LIKE 'student_information_portal'");
  console.log('====================================================');
  console.log('8. LEGACY DATABASE (student_information_portal)');
  console.log('====================================================');
  console.log('Database exists:', legacyDbs.length > 0);
  if (legacyDbs.length > 0) {
    const [legacyTables] = await pool.query("SHOW TABLES FROM student_information_portal");
    console.log('Legacy DB Table Count:', legacyTables.length);
    console.log('Legacy Tables:', legacyTables.map(r => Object.values(r)[0]));
  }
}

verify().finally(() => process.exit(0));
