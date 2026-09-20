require('dotenv').config();
const pool = require('../../src/config/db');

async function runMigration() {
  console.log('Running database migration for academic_events and academic_event_reminder_logs...');

  const createEventsTableSql = `
    CREATE TABLE IF NOT EXISTS academic_events (
      event_id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT NULL,
      event_type ENUM('EXAM', 'ASSIGNMENT', 'LECTURE', 'HOLIDAY', 'COLLEGE_EVENT', 'SEMINAR', 'RESULT', 'MEETING', 'OTHER') NOT NULL,
      exam_type ENUM('Internal Test', 'Practical Exam', 'External Exam', 'Viva', 'Unit Test', 'Other') NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      start_time TIME NULL,
      end_time TIME NULL,
      location VARCHAR(100) NULL,
      room VARCHAR(50) NULL,
      course_id INT NULL,
      department_id INT NULL,
      teacher_id INT NULL,
      class_name VARCHAR(50) NULL,
      division VARCHAR(10) NULL,
      semester INT NULL,
      target_audience ENUM('ALL', 'STUDENTS', 'TEACHERS', 'DEPARTMENT', 'COURSE', 'CLASS') DEFAULT 'ALL',
      instructions TEXT NULL,
      created_by_user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_event_dates (start_date, end_date),
      INDEX idx_event_type (event_type),
      INDEX idx_event_dept (department_id),
      INDEX idx_event_course (course_id),
      INDEX idx_event_teacher (teacher_id),
      INDEX idx_event_class (class_name, division, semester),
      CONSTRAINT fk_event_course FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE SET NULL,
      CONSTRAINT fk_event_dept FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE SET NULL,
      CONSTRAINT fk_event_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE SET NULL,
      CONSTRAINT fk_event_creator FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await pool.query(createEventsTableSql);
  console.log('[OK] Checked/created table: academic_events');

  const createReminderLogsTableSql = `
    CREATE TABLE IF NOT EXISTS academic_event_reminder_logs (
      reminder_log_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      event_id INT NOT NULL,
      event_date DATE NOT NULL,
      reminder_type ENUM('7_DAYS', '3_DAYS', '1_DAY', 'TODAY', 'STARTING_SOON') NOT NULL,
      notification_id INT NULL,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_event_date_type (user_id, event_id, event_date, reminder_type),
      INDEX idx_aerem_user (user_id),
      INDEX idx_aerem_event (event_id),
      INDEX idx_aerem_date (event_date),
      CONSTRAINT fk_aerem_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      CONSTRAINT fk_aerem_event FOREIGN KEY (event_id) REFERENCES academic_events(event_id) ON DELETE CASCADE,
      CONSTRAINT fk_aerem_notification FOREIGN KEY (notification_id) REFERENCES notifications(notification_id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await pool.query(createReminderLogsTableSql);
  console.log('[OK] Checked/created table: academic_event_reminder_logs');

  console.log('Migration completed successfully!');
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
