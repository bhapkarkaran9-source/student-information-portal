const pool = require('../src/config/db');

async function migrate() {
  console.log('--- Migrating backup_history in student_portal_db ---');

  // 1. Check if checksum column exists
  const [cols] = await pool.query("SHOW COLUMNS FROM backup_history LIKE 'checksum'");
  if (cols.length === 0) {
    console.log('Adding checksum column...');
    await pool.query("ALTER TABLE backup_history ADD COLUMN checksum VARCHAR(128) NULL AFTER file_size_bytes");
    console.log('Checksum column added successfully.');
  } else {
    console.log('Checksum column already exists.');
  }

  // 2. Modify backup_type to VARCHAR(50)
  console.log('Modifying backup_type to VARCHAR(50)...');
  await pool.query("ALTER TABLE backup_history MODIFY COLUMN backup_type VARCHAR(50) NOT NULL DEFAULT 'FULL_DATABASE'");

  // 3. Modify status to VARCHAR(30)
  console.log('Modifying status to VARCHAR(30)...');
  await pool.query("ALTER TABLE backup_history MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS'");

  // 4. Check index on backup_type
  const [indexes] = await pool.query("SHOW INDEX FROM backup_history WHERE Key_name = 'idx_backup_type'");
  if (indexes.length === 0) {
    console.log('Adding index on backup_type...');
    await pool.query("ALTER TABLE backup_history ADD INDEX idx_backup_type (backup_type)");
    console.log('Index idx_backup_type added.');
  } else {
    console.log('Index idx_backup_type already exists.');
  }

  const [desc] = await pool.query("DESCRIBE backup_history");
  console.log('Final backup_history schema:', desc);

  await pool.end();
  console.log('Migration complete.');
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
