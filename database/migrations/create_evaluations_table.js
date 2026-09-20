const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running database migration for assignment_evaluations table in student_portal_db...');

  const createEvaluationsTableSql = `
    CREATE TABLE IF NOT EXISTS assignment_evaluations (
      evaluation_id INT AUTO_INCREMENT PRIMARY KEY,
      submission_id INT NOT NULL,
      assignment_id INT NOT NULL,
      student_id INT NOT NULL,
      evaluated_by_teacher_id INT NOT NULL,
      marks_obtained DECIMAL(5,2) NOT NULL,
      feedback TEXT NULL,
      evaluated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_eval_submission (submission_id),
      INDEX idx_eval_assignment (assignment_id),
      INDEX idx_eval_student (student_id),
      INDEX idx_eval_teacher (evaluated_by_teacher_id),
      CONSTRAINT fk_eval_submission FOREIGN KEY (submission_id) REFERENCES assignment_submissions(submission_id) ON DELETE CASCADE,
      CONSTRAINT fk_eval_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id) ON DELETE CASCADE,
      CONSTRAINT fk_eval_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
      CONSTRAINT fk_eval_teacher FOREIGN KEY (evaluated_by_teacher_id) REFERENCES teachers(teacher_id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await pool.query(createEvaluationsTableSql);
  console.log('Checked/created table: assignment_evaluations');

  const [columns] = await pool.query('DESCRIBE assignment_evaluations');
  console.log('Columns in assignment_evaluations:');
  columns.forEach(c => console.log(` - ${c.Field}: ${c.Type} (${c.Key})`));

  console.log('Migration completed successfully!');
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
