require('dotenv').config();
const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running database migration for email event deduplication...');

  // 1. Check if event_key column already exists in email_logs
  const [cols] = await pool.query(`
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'email_logs' 
      AND COLUMN_NAME = 'event_key'
  `);

  if (cols.length === 0) {
    console.log('Adding event_key column to email_logs table...');
    await pool.query(`
      ALTER TABLE email_logs 
      ADD COLUMN event_key VARCHAR(255) NULL AFTER error_message
    `);
    console.log('[OK] Added event_key column');
  } else {
    console.log('[SKIP] Column event_key already exists');
  }

  // 2. Check if uk_email_logs_event_key index exists
  const [indexes] = await pool.query(`
    SELECT INDEX_NAME 
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'email_logs' 
      AND INDEX_NAME = 'uk_email_logs_event_key'
  `);

  if (indexes.length === 0) {
    console.log('Adding UNIQUE index uk_email_logs_event_key on email_logs(event_key)...');
    await pool.query(`
      ALTER TABLE email_logs 
      ADD UNIQUE INDEX uk_email_logs_event_key (event_key)
    `);
    console.log('[OK] Added UNIQUE index uk_email_logs_event_key');
  } else {
    console.log('[SKIP] Index uk_email_logs_event_key already exists');
  }

  console.log('[SUCCESS] Email event deduplication migration completed.');

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
