const pool = require('../../src/config/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('Running database migration for assignment_submissions and upload folders...');

  // 1. Create upload directories if not present
  const baseUploads = path.join(__dirname, '..', '..', 'uploads');
  const materialsDir = path.join(baseUploads, 'materials');
  const submissionsDir = path.join(baseUploads, 'submissions');

  if (!fs.existsSync(baseUploads)) fs.mkdirSync(baseUploads, { recursive: true });
  if (!fs.existsSync(materialsDir)) fs.mkdirSync(materialsDir, { recursive: true });
  if (!fs.existsSync(submissionsDir)) fs.mkdirSync(submissionsDir, { recursive: true });
  console.log('Upload directories verified at:', baseUploads);

  // 2. Create assignment_submissions table
  const createSubmissionsTableSql = `
    CREATE TABLE IF NOT EXISTS assignment_submissions (
      submission_id INT AUTO_INCREMENT PRIMARY KEY,
      assignment_id INT NOT NULL,
      student_id INT NOT NULL,
      original_filename VARCHAR(255) NOT NULL,
      file_path VARCHAR(255) NOT NULL,
      remarks TEXT NULL,
      submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      status ENUM('Submitted', 'Late Submission') NOT NULL DEFAULT 'Submitted',
      UNIQUE KEY uk_asg_student (assignment_id, student_id),
      CONSTRAINT fk_sub_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id) ON DELETE CASCADE,
      CONSTRAINT fk_sub_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await pool.query(createSubmissionsTableSql);
  console.log('Checked/created table: assignment_submissions');

  // 3. Check and add original_filename to study_materials if needed
  const [columns] = await pool.query("SHOW COLUMNS FROM study_materials LIKE 'original_filename'");
  if (columns.length === 0) {
    await pool.query('ALTER TABLE study_materials ADD COLUMN original_filename VARCHAR(255) NULL AFTER file_path');
    console.log('Added column original_filename to study_materials');
  } else {
    console.log('Column original_filename already exists in study_materials');
  }

  console.log('Migration completed successfully!');
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
