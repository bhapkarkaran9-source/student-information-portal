require('dotenv').config();
const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running migration: Add student_qr_visible column to attendance_sessions table...');

  try {
    // Check if column already exists
    const [existingCols] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'attendance_sessions' 
        AND COLUMN_NAME = 'student_qr_visible'
    `);

    if (existingCols.length === 0) {
      console.log('Adding column student_qr_visible to attendance_sessions...');
      await pool.query(`
        ALTER TABLE attendance_sessions 
        ADD COLUMN student_qr_visible TINYINT(1) NOT NULL DEFAULT 0 
        AFTER is_active
      `);
      console.log('[OK] Added student_qr_visible column (TINYINT(1), DEFAULT 0).');
    } else {
      console.log('[INFO] Column student_qr_visible already exists in attendance_sessions.');
    }

    // Verify column schema
    const [cols] = await pool.query(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'attendance_sessions' 
        AND COLUMN_NAME = 'student_qr_visible'
    `);

    console.log('\nColumn details:', cols[0]);
    console.log('\nMigration finished successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
