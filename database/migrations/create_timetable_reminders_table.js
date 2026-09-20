require('dotenv').config();
const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running database migration for timetable_reminder_logs in student_portal_db...');

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS timetable_reminder_logs (
      reminder_log_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      timetable_id INT NOT NULL,
      lecture_date DATE NOT NULL,
      reminder_type ENUM('15_MINUTES', '5_MINUTES', 'STARTED') NOT NULL,
      notification_id INT NULL,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_timetable_date_type (user_id, timetable_id, lecture_date, reminder_type),
      INDEX idx_rem_user (user_id),
      INDEX idx_rem_timetable (timetable_id),
      INDEX idx_rem_date (lecture_date),
      CONSTRAINT fk_rem_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      CONSTRAINT fk_rem_timetable FOREIGN KEY (timetable_id) REFERENCES timetable(timetable_id) ON DELETE CASCADE,
      CONSTRAINT fk_rem_notification FOREIGN KEY (notification_id) REFERENCES notifications(notification_id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await pool.query(createTableSql);
  console.log('[OK] Checked/created table: timetable_reminder_logs');

  const [columns] = await pool.query('DESCRIBE timetable_reminder_logs');
  console.log('Columns in timetable_reminder_logs:');
  columns.forEach(c => console.log(` - ${c.Field}: ${c.Type} (${c.Key})`));

  console.log('Migration completed successfully!');
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
