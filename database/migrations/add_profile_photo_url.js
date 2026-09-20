require('dotenv').config();
const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running migration: Add profile_photo_url to users table...');

  try {
    // Check if column already exists
    const [existingCols] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'profile_photo_url'
    `);

    if (existingCols.length === 0) {
      console.log('Adding column profile_photo_url to users table...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN profile_photo_url VARCHAR(500) NULL AFTER phone;
      `);
      console.log('[OK] Added profile_photo_url column (VARCHAR(500), NULL, AFTER phone).');
    } else {
      console.log('[INFO] Column profile_photo_url already exists in users table.');
    }

    // Verify column schema
    const [cols] = await pool.query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'profile_photo_url'
    `);

    console.log('\nVerified column details:', cols[0]);
    console.log('\nMigration finished successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

runMigration();
