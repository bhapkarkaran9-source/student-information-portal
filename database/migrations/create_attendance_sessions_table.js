require('dotenv').config();
const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running database migration for attendance_sessions in student_portal_db...');

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      session_id INT AUTO_INCREMENT PRIMARY KEY,
      session_uuid VARCHAR(36) NOT NULL UNIQUE,
      teacher_id INT NOT NULL,
      course_id INT NOT NULL,
      timetable_id INT NULL,
      session_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      lecture_type VARCHAR(50) NOT NULL DEFAULT 'Regular Lecture',
      room_no VARCHAR(50) NULL,
      duration_minutes INT NOT NULL DEFAULT 5,
      expires_at DATETIME NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      student_qr_visible TINYINT(1) NOT NULL DEFAULT 0,
      qr_secret VARCHAR(64) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_att_sess_teacher (teacher_id),
      INDEX idx_att_sess_course_date (course_id, session_date),
      INDEX idx_att_sess_timetable (timetable_id),
      INDEX idx_att_sess_active_expiry (is_active, expires_at),
      INDEX idx_att_sess_date_time (session_date, start_time),
      CONSTRAINT fk_att_sess_teacher FOREIGN KEY (teacher_id)
        REFERENCES teachers(teacher_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT fk_att_sess_course FOREIGN KEY (course_id)
        REFERENCES courses(course_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
      CONSTRAINT fk_att_sess_timetable FOREIGN KEY (timetable_id)
        REFERENCES timetable(timetable_id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await pool.query(createTableSql);
  console.log('[OK] Checked/created table: attendance_sessions');

  const [columns] = await pool.query('DESCRIBE attendance_sessions');
  console.log('\nColumns in attendance_sessions:');
  columns.forEach(c => {
    console.log(` - ${c.Field.padEnd(18)} : ${c.Type.padEnd(20)} | Null: ${c.Null.padEnd(3)} | Key: ${c.Key.padEnd(3)} | Default: ${c.Default}`);
  });

  const [indexes] = await pool.query('SHOW INDEX FROM attendance_sessions');
  console.log('\nIndexes in attendance_sessions:');
  const indexMap = {};
  indexes.forEach(idx => {
    if (!indexMap[idx.Key_name]) {
      indexMap[idx.Key_name] = [];
    }
    indexMap[idx.Key_name].push(idx.Column_name);
  });
  Object.entries(indexMap).forEach(([k, cols]) => {
    console.log(` - Index: ${k.padEnd(28)} on (${cols.join(', ')})`);
  });

  const [fks] = await pool.query(`
    SELECT 
      CONSTRAINT_NAME, 
      COLUMN_NAME, 
      REFERENCED_TABLE_NAME, 
      REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'attendance_sessions'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  console.log('\nForeign Keys in attendance_sessions:');
  fks.forEach(fk => {
    console.log(` - ${fk.CONSTRAINT_NAME.padEnd(24)} : ${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME})`);
  });

  console.log('\nMigration completed successfully!');
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
