const pool = require('../../src/config/db');

async function migrate() {
  console.log('Running database migration: Add lecture_type to timetable table...');
  try {
    const [columns] = await pool.query('SHOW COLUMNS FROM timetable LIKE "lecture_type"');
    if (columns.length === 0) {
      console.log('Adding lecture_type column to timetable table...');
      await pool.query(`
        ALTER TABLE timetable
        ADD COLUMN lecture_type ENUM('Theory', 'Practical') NOT NULL DEFAULT 'Theory'
        AFTER course_id
      `);
      console.log('[OK] Successfully added lecture_type column to timetable table.');
    } else {
      console.log('[OK] Column lecture_type already exists on timetable table.');
    }

    // Safely verify column info
    const [verify] = await pool.query('SHOW COLUMNS FROM timetable LIKE "lecture_type"');
    console.log('Column Status:', verify[0]);
    process.exit(0);
  } catch (err) {
    console.error('Migration Failed:', err);
    process.exit(1);
  }
}

migrate();
