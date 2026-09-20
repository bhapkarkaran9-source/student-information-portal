const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'student_portal_db',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 1,
  queueLimit: 0
});

async function main() {
  const [timeRows] = await pool.query(`
    SELECT
      CURDATE() AS server_date,
      ADDTIME(CURTIME(), '00:05:00') AS start_time,
      ADDTIME(CURTIME(), '00:35:00') AS end_time,
      DAYNAME(CURDATE()) AS day_name
  `);

  const cur = timeRows[0];
  let lectureDate = cur.server_date;
  let startTime = cur.start_time;
  let endTime = cur.end_time;
  const dayName = cur.day_name;

  if (endTime < startTime) {
    lectureDate = new Date(`${cur.server_date}T00:00:00`).toISOString().slice(0, 10);
  }

  if (!(startTime < endTime)) {
    throw new Error(`START_BEFORE_END_VIOLATION: ${startTime} >= ${endTime}`);
  }

  const [[student]] = await pool.query(
    `SELECT s.student_id, s.user_id, s.department_id, s.class_name, s.division, s.semester
     FROM students s
     INNER JOIN users u ON u.user_id = s.user_id
     WHERE s.student_id = ? AND u.is_active = 1
     LIMIT 1`,
    [96]
  );

  if (!student) {
    throw new Error('STUDENT_NOT_FOUND');
  }

  const [courseRows] = await pool.query(
    `SELECT e.course_id
     FROM enrollments e
     WHERE e.student_id = ? AND e.status = 'Enrolled'
     ORDER BY e.course_id
     LIMIT 1`,
    [student.student_id]
  );

  if (!courseRows[0]) {
    throw new Error('NO_ENROLLED_COURSE');
  }

  const [teacherRows] = await pool.query(
    `SELECT t.teacher_id
     FROM teachers t
     INNER JOIN users u ON u.user_id = t.user_id
     WHERE t.department_id = ? AND u.is_active = 1
     ORDER BY t.teacher_id
     LIMIT 1`,
    [student.department_id]
  );

  if (!teacherRows[0]) {
    throw new Error('NO_ACTIVE_TEACHER');
  }

  const [result] = await pool.query(
    `INSERT INTO timetable (
      day_of_week,
      start_time,
      end_time,
      course_id,
      teacher_id,
      class_name,
      division,
      room_no,
      academic_year,
      semester
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dayName,
      startTime,
      endTime,
      courseRows[0].course_id,
      teacherRows[0].teacher_id,
      student.class_name,
      student.division,
      'TEMP-SCHED-TEST',
      '2026-2027',
      student.semester
    ]
  );

  console.log('TEMP TIMETABLE CREATED');
  console.log(`timetable_id=${result.insertId}`);
  console.log(`lecture_date=${lectureDate}`);
  console.log(`day=${dayName}`);
  console.log(`start=${startTime}`);
  console.log(`end=${endTime}`);

  await pool.end();
}

main().catch(async (error) => {
  const message = error && error.sqlMessage ? error.sqlMessage : (error && error.message ? error.message : String(error));
  console.error(message);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
