require('dotenv').config();
const pool = require('../src/config/db');

async function verify() {
  console.log('================================================================');
  console.log('VERIFYING ATTENDANCE_SESSIONS DATABASE FOUNDATION');
  console.log('================================================================');

  let passes = 0;
  let failures = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passes++;
    } else {
      console.error(`[FAIL] ${message}`);
      failures++;
    }
  }

  // 1. Verify Table Existence
  const [tables] = await pool.query("SHOW TABLES LIKE 'attendance_sessions'");
  assert(tables.length === 1, "Table 'attendance_sessions' exists in database");

  // 2. Verify Columns and Nullability
  const [columns] = await pool.query('DESCRIBE attendance_sessions');
  const colMap = {};
  columns.forEach(c => { colMap[c.Field] = c; });

  const requiredCols = [
    'session_id', 'session_uuid', 'teacher_id', 'course_id',
    'timetable_id', 'session_date', 'start_time', 'end_time',
    'lecture_type', 'room_no', 'duration_minutes', 'expires_at',
    'is_active', 'qr_secret', 'created_at', 'updated_at'
  ];

  requiredCols.forEach(col => {
    assert(!!colMap[col], `Column '${col}' exists in attendance_sessions`);
  });

  assert(colMap['timetable_id'] && colMap['timetable_id'].Null === 'YES', "Column 'timetable_id' is nullable (NULL allowed for extra/custom lectures)");
  assert(colMap['room_no'] && colMap['room_no'].Null === 'YES', "Column 'room_no' is nullable");
  assert(colMap['session_uuid'] && colMap['session_uuid'].Null === 'NO', "Column 'session_uuid' is NOT NULL");
  assert(colMap['session_uuid'] && (colMap['session_uuid'].Key === 'UNI' || colMap['session_uuid'].Key === 'PRI'), "Column 'session_uuid' has UNIQUE constraint");

  // 3. Verify Foreign Keys
  const [fks] = await pool.query(`
    SELECT 
      CONSTRAINT_NAME, 
      COLUMN_NAME, 
      REFERENCED_TABLE_NAME, 
      REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'attendance_sessions'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);

  const teacherFk = fks.find(f => f.COLUMN_NAME === 'teacher_id' && f.REFERENCED_TABLE_NAME === 'teachers');
  const courseFk = fks.find(f => f.COLUMN_NAME === 'course_id' && f.REFERENCED_TABLE_NAME === 'courses');
  const timetableFk = fks.find(f => f.COLUMN_NAME === 'timetable_id' && f.REFERENCED_TABLE_NAME === 'timetable');

  assert(!!teacherFk, "Foreign key exists: teacher_id -> teachers(teacher_id)");
  assert(!!courseFk, "Foreign key exists: course_id -> courses(course_id)");
  assert(!!timetableFk, "Foreign key exists: timetable_id -> timetable(timetable_id)");

  // 4. Verify Indexes
  const [indexes] = await pool.query('SHOW INDEX FROM attendance_sessions');
  const indexNames = new Set(indexes.map(i => i.Key_name));

  assert(indexNames.has('idx_att_sess_teacher'), "Index 'idx_att_sess_teacher' exists");
  assert(indexNames.has('idx_att_sess_course_date'), "Index 'idx_att_sess_course_date' exists");
  assert(indexNames.has('idx_att_sess_timetable'), "Index 'idx_att_sess_timetable' exists");
  assert(indexNames.has('idx_att_sess_active_expiry'), "Index 'idx_att_sess_active_expiry' exists");
  assert(indexNames.has('idx_att_sess_date_time'), "Index 'idx_att_sess_date_time' exists");

  // 5. Test inserting an Extra/Custom Lecture session with timetable_id = NULL
  const [teacherRow] = await pool.query('SELECT teacher_id FROM teachers LIMIT 1');
  const [courseRow] = await pool.query('SELECT course_id FROM courses LIMIT 1');
  const [timetableRow] = await pool.query('SELECT timetable_id FROM timetable LIMIT 1');

  const testTeacherId = teacherRow[0].teacher_id;
  const testCourseId = courseRow[0].course_id;
  const testTimetableId = timetableRow[0].timetable_id;

  const testUuid1 = 'test-custom-' + Date.now();
  const [insertCustomRes] = await pool.query(`
    INSERT INTO attendance_sessions (
      session_uuid, teacher_id, course_id, timetable_id,
      session_date, start_time, end_time, lecture_type,
      room_no, duration_minutes, expires_at, is_active, qr_secret
    ) VALUES (?, ?, ?, NULL, '2026-09-20', '10:00:00', '11:00:00', 'Extra / Additional Lecture', 'Lab 101', 10, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 1, 'secret123')
  `, [testUuid1, testTeacherId, testCourseId]);

  assert(insertCustomRes.affectedRows === 1, "Successfully inserted Extra/Custom lecture session with timetable_id = NULL");

  // 6. Test inserting a Timetable-linked session with timetable_id set
  const testUuid2 = 'test-timetable-' + Date.now();
  const [insertTimetableRes] = await pool.query(`
    INSERT INTO attendance_sessions (
      session_uuid, teacher_id, course_id, timetable_id,
      session_date, start_time, end_time, lecture_type,
      room_no, duration_minutes, expires_at, is_active, qr_secret
    ) VALUES (?, ?, ?, ?, '2026-09-20', '11:00:00', '12:00:00', 'Regular Lecture', 'Room 202', 5, DATE_ADD(NOW(), INTERVAL 5 MINUTE), 1, 'secret456')
  `, [testUuid2, testTeacherId, testCourseId, testTimetableId]);

  assert(insertTimetableRes.affectedRows === 1, "Successfully inserted Scheduled Timetable session with timetable_id");

  // 7. Verify Foreign Key enforcement (invalid teacher_id should fail)
  let fkBlocked = false;
  try {
    await pool.query(`
      INSERT INTO attendance_sessions (
        session_uuid, teacher_id, course_id, timetable_id,
        session_date, start_time, end_time, lecture_type,
        room_no, duration_minutes, expires_at, is_active, qr_secret
      ) VALUES ('test-invalid-fk', 999999, ?, NULL, '2026-09-20', '12:00:00', '13:00:00', 'Regular Lecture', NULL, 5, NOW(), 1, 'sec')
    `, [testCourseId]);
  } catch (err) {
    fkBlocked = true;
  }
  assert(fkBlocked, "Foreign key constraint correctly rejects invalid teacher_id (999999)");

  // 8. Clean up test rows from attendance_sessions
  await pool.query("DELETE FROM attendance_sessions WHERE session_uuid IN (?, ?)", [testUuid1, testUuid2]);
  console.log("[OK] Cleaned up temporary test session rows");

  // 9. Verify existing attendance and timetable data are intact
  const [attCount] = await pool.query('SELECT COUNT(*) AS count FROM attendance');
  assert(attCount[0].count === 14, `Existing attendance records preserved intact (count = ${attCount[0].count})`);

  const [ttCount] = await pool.query('SELECT COUNT(*) AS count FROM timetable');
  assert(ttCount[0].count > 0, `Existing timetable records preserved intact (count = ${ttCount[0].count})`);

  console.log('\n================================================================');
  console.log(`VERIFICATION SUMMARY: ${passes} PASSED, ${failures} FAILED`);
  console.log('================================================================');

  if (failures > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

verify().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
