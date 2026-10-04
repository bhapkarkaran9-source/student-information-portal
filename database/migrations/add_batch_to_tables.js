require('dotenv').config();
const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running database migration for batch support in student_portal_db...');

  try {
    // 1. Add batch column to students table if not exists
    const [studCols] = await pool.query("SHOW COLUMNS FROM students LIKE 'batch'");
    if (studCols.length === 0) {
      await pool.query('ALTER TABLE students ADD COLUMN batch VARCHAR(50) NULL DEFAULT NULL AFTER division');
      console.log('[OK] Added batch column to students table');
    } else {
      console.log('[INFO] batch column already exists in students table');
    }

    // 2. Add batch column to timetable table if not exists
    const [ttCols] = await pool.query("SHOW COLUMNS FROM timetable LIKE 'batch'");
    if (ttCols.length === 0) {
      await pool.query('ALTER TABLE timetable ADD COLUMN batch VARCHAR(50) NULL DEFAULT NULL AFTER division');
      console.log('[OK] Added batch column to timetable table');
    } else {
      console.log('[INFO] batch column already exists in timetable table');
    }

    // 3. Add batch column to attendance_sessions table if not exists
    const [attSessCols] = await pool.query("SHOW COLUMNS FROM attendance_sessions LIKE 'batch'");
    if (attSessCols.length === 0) {
      await pool.query('ALTER TABLE attendance_sessions ADD COLUMN batch VARCHAR(50) NULL DEFAULT NULL AFTER timetable_id');
      console.log('[OK] Added batch column to attendance_sessions table');
    } else {
      console.log('[INFO] batch column already exists in attendance_sessions table');
    }

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();
