require('dotenv').config();
const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running migration: create_user_face_credentials_table...');

  // 1. Add must_change_password column to users table if not already present
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM users LIKE 'must_change_password'");
    if (cols.length === 0) {
      await pool.query("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE AFTER is_active");
      console.log('[OK] Added column must_change_password to users table');
    } else {
      console.log('[INFO] Column must_change_password already exists in users table');
    }
  } catch (err) {
    console.error('Error checking/adding must_change_password column:', err.message);
  }

  // 2. Create user_face_credentials table
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS user_face_credentials (
      face_credential_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      face_embedding TEXT NOT NULL,
      liveness_score DECIMAL(5, 4) NULL,
      liveness_method VARCHAR(50) DEFAULT 'EYE_BLINK_AND_HEAD_POSE',
      registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE KEY uk_user_face_user (user_id),
      INDEX idx_face_active (is_active),
      CONSTRAINT fk_user_face_user FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  try {
    await pool.query(createTableSql);
    console.log('[OK] Checked/created table: user_face_credentials');
  } catch (err) {
    console.error('Error creating user_face_credentials table:', err.message);
    throw err;
  }

  console.log('Migration completed successfully.');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
