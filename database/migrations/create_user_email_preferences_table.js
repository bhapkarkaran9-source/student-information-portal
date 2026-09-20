require('dotenv').config();
const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running database migration for user_email_preferences table...');

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS user_email_preferences (
      preference_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      assignment_emails BOOLEAN NOT NULL DEFAULT TRUE,
      exam_emails BOOLEAN NOT NULL DEFAULT TRUE,
      attendance_emails BOOLEAN NOT NULL DEFAULT TRUE,
      timetable_emails BOOLEAN NOT NULL DEFAULT TRUE,
      notice_emails BOOLEAN NOT NULL DEFAULT TRUE,
      feedback_emails BOOLEAN NOT NULL DEFAULT TRUE,
      academic_event_emails BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_user_email_preferences_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await pool.query(createTableSql);
  console.log('[OK] Checked/created table: user_email_preferences');

  if (require.main === module) {
    process.exit(0);
  }
}

if (require.main === module) {
  runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = runMigration;
