require('dotenv').config();
const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running database migration for email_logs table...');

  const createEmailLogsSql = `
    CREATE TABLE IF NOT EXISTS email_logs (
      email_log_id INT AUTO_INCREMENT PRIMARY KEY,
      recipient_email VARCHAR(255) NOT NULL,
      user_id INT NULL,
      email_type VARCHAR(100) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      status ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
      error_message TEXT NULL,
      sent_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email_logs_user_id (user_id),
      INDEX idx_email_logs_type (email_type),
      INDEX idx_email_logs_status (status),
      INDEX idx_email_logs_created_at (created_at),
      CONSTRAINT fk_email_logs_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await pool.query(createEmailLogsSql);
  console.log('[OK] Checked/created table: email_logs');

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
