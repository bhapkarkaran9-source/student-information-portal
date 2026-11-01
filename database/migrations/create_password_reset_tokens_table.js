require('dotenv').config();
const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running database migration for password_reset_tokens table...');

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pwd_reset_user_id (user_id),
      INDEX idx_pwd_reset_token_hash (token_hash),
      INDEX idx_pwd_reset_expires_at (expires_at),
      CONSTRAINT fk_pwd_reset_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await pool.query(createTableSql);
  console.log('[OK] Checked/created table: password_reset_tokens');

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
