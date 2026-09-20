require('dotenv').config();
const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running database migration for Student Feedback tables...');

  // 1. feedback_forms
  const createFeedbackFormsSql = `
    CREATE TABLE IF NOT EXISTS feedback_forms (
      feedback_form_id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      target_type VARCHAR(50) NOT NULL,
      target_id INT NULL,
      academic_year VARCHAR(20) NULL,
      semester INT NULL,
      start_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_by INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_feedback_forms_target (target_type, target_id),
      INDEX idx_feedback_forms_dates (start_date, end_date),
      INDEX idx_feedback_forms_active (is_active),
      INDEX idx_feedback_forms_created_by (created_by),
      CONSTRAINT chk_feedback_target_type CHECK (target_type IN ('COURSE', 'TEACHER', 'GENERAL', 'EVENT')),
      CONSTRAINT chk_feedback_form_dates CHECK (start_date < end_date),
      CONSTRAINT fk_feedback_forms_creator FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await pool.query(createFeedbackFormsSql);
  console.log('[OK] Checked/created table: feedback_forms');

  // 2. feedback_questions
  const createFeedbackQuestionsSql = `
    CREATE TABLE IF NOT EXISTS feedback_questions (
      question_id INT AUTO_INCREMENT PRIMARY KEY,
      feedback_form_id INT NOT NULL,
      question_text TEXT NOT NULL,
      question_type VARCHAR(30) NOT NULL,
      is_required BOOLEAN DEFAULT TRUE,
      display_order INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_feedback_questions_form_order (feedback_form_id, display_order),
      CONSTRAINT chk_feedback_question_type CHECK (question_type IN ('RATING', 'TEXT', 'MULTIPLE_CHOICE')),
      CONSTRAINT fk_feedback_questions_form FOREIGN KEY (feedback_form_id) REFERENCES feedback_forms(feedback_form_id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await pool.query(createFeedbackQuestionsSql);
  console.log('[OK] Checked/created table: feedback_questions');

  // 3. feedback_responses
  const createFeedbackResponsesSql = `
    CREATE TABLE IF NOT EXISTS feedback_responses (
      response_id INT AUTO_INCREMENT PRIMARY KEY,
      feedback_form_id INT NOT NULL,
      student_id INT NOT NULL,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_feedback_form_student (feedback_form_id, student_id),
      INDEX idx_feedback_responses_form (feedback_form_id),
      INDEX idx_feedback_responses_student (student_id),
      CONSTRAINT fk_feedback_responses_form FOREIGN KEY (feedback_form_id) REFERENCES feedback_forms(feedback_form_id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_feedback_responses_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await pool.query(createFeedbackResponsesSql);
  console.log('[OK] Checked/created table: feedback_responses');

  // 4. feedback_answers
  const createFeedbackAnswersSql = `
    CREATE TABLE IF NOT EXISTS feedback_answers (
      answer_id INT AUTO_INCREMENT PRIMARY KEY,
      response_id INT NOT NULL,
      question_id INT NOT NULL,
      answer_text TEXT NULL,
      rating DECIMAL(3,2) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_feedback_response_question (response_id, question_id),
      INDEX idx_feedback_answers_response (response_id),
      INDEX idx_feedback_answers_question (question_id),
      CONSTRAINT chk_feedback_answer_rating CHECK (rating IS NULL OR (rating >= 1.00 AND rating <= 5.00)),
      CONSTRAINT fk_feedback_answers_response FOREIGN KEY (response_id) REFERENCES feedback_responses(response_id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_feedback_answers_question FOREIGN KEY (question_id) REFERENCES feedback_questions(question_id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await pool.query(createFeedbackAnswersSql);
  console.log('[OK] Checked/created table: feedback_answers');

  console.log('All 4 feedback tables migrated successfully!');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
