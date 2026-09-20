const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running database migration for assignment_submission_history in student_portal_db...');

  // 1. Ensure attempt_number column exists in assignment_submissions
  const [subCols] = await pool.query('DESCRIBE assignment_submissions');
  const hasAttemptNumber = subCols.some(c => c.Field === 'attempt_number');

  if (!hasAttemptNumber) {
    console.log('Adding attempt_number column to assignment_submissions...');
    await pool.query('ALTER TABLE assignment_submissions ADD COLUMN attempt_number INT NOT NULL DEFAULT 1');
    console.log('[OK] Added attempt_number column to assignment_submissions');
  } else {
    console.log('[OK] attempt_number column already exists in assignment_submissions');
  }

  // 2. Create assignment_submission_history table
  const createHistoryTableSql = `
    CREATE TABLE IF NOT EXISTS assignment_submission_history (
      history_id INT AUTO_INCREMENT PRIMARY KEY,
      submission_id INT NOT NULL,
      assignment_id INT NOT NULL,
      student_id INT NOT NULL,
      attempt_number INT NOT NULL,
      original_filename VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_size INT NULL,
      remarks TEXT NULL,
      submitted_at DATETIME NOT NULL,
      submission_status ENUM('Submitted', 'Late Submission') NOT NULL,
      marks_obtained DECIMAL(5,2) NULL,
      feedback TEXT NULL,
      evaluated_at DATETIME NULL,
      evaluated_by_teacher_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_hist_submission (submission_id),
      INDEX idx_hist_assignment (assignment_id),
      INDEX idx_hist_student (student_id),
      UNIQUE KEY uk_hist_asg_student_attempt (assignment_id, student_id, attempt_number),
      CONSTRAINT fk_hist_submission FOREIGN KEY (submission_id) REFERENCES assignment_submissions(submission_id) ON DELETE CASCADE,
      CONSTRAINT fk_hist_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id) ON DELETE CASCADE,
      CONSTRAINT fk_hist_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
      CONSTRAINT fk_hist_teacher FOREIGN KEY (evaluated_by_teacher_id) REFERENCES teachers(teacher_id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await pool.query(createHistoryTableSql);
  console.log('[OK] Checked/created table: assignment_submission_history');

  const [columns] = await pool.query('DESCRIBE assignment_submission_history');
  console.log('Columns in assignment_submission_history:');
  columns.forEach(c => console.log(` - ${c.Field}: ${c.Type} (${c.Key})`));

  console.log('Migration completed successfully!');
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
