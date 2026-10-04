const pool = require('../config/db');

const ALLOWED_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Get paginated, searchable, filterable list of timetable entries
 * @param {Object} options
 * @returns {Promise<{ timetable: Array, pagination: Object }>}
 */
const getTimetable = async ({
  page = 1,
  limit = 10,
  search = '',
  day_of_week = '',
  course_id = '',
  lecture_type = '',
  teacher_id = '',
  department_id = '',
  academic_year = '',
  semester = '',
  class_name = '',
  division = '',
  room_no = '',
  all = false
}) => {
  const whereConditions = [];
  const queryParams = [];

  // Search filter across course, teacher, room, class, division
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push(`(
      c.course_code LIKE ? OR 
      c.course_name LIKE ? OR 
      u.first_name LIKE ? OR 
      u.last_name LIKE ? OR 
      tch.employee_number LIKE ? OR
      t.room_no LIKE ? OR
      t.class_name LIKE ? OR
      t.division LIKE ? OR
      t.lecture_type LIKE ?
    )`);
    queryParams.push(term, term, term, term, term, term, term, term, term);
  }

  // Filter by day of week
  if (day_of_week && day_of_week.trim()) {
    whereConditions.push('t.day_of_week = ?');
    queryParams.push(day_of_week.trim());
  }

  // Filter by course
  if (course_id !== '' && course_id !== undefined && course_id !== null) {
    whereConditions.push('t.course_id = ?');
    queryParams.push(parseInt(course_id, 10));
  }

  // Filter by lecture_type
  if (lecture_type && lecture_type.trim()) {
    whereConditions.push('t.lecture_type = ?');
    queryParams.push(lecture_type.trim());
  }

  // Filter by teacher
  if (teacher_id !== '' && teacher_id !== undefined && teacher_id !== null) {
    whereConditions.push('t.teacher_id = ?');
    queryParams.push(parseInt(teacher_id, 10));
  }

  // Filter by department (course's or teacher's department)
  if (department_id !== '' && department_id !== undefined && department_id !== null) {
    whereConditions.push('(c.department_id = ? OR tch.department_id = ?)');
    queryParams.push(parseInt(department_id, 10), parseInt(department_id, 10));
  }

  // Filter by academic year
  if (academic_year && academic_year.trim()) {
    whereConditions.push('t.academic_year = ?');
    queryParams.push(academic_year.trim());
  }

  // Filter by semester
  if (semester !== '' && semester !== undefined && semester !== null) {
    whereConditions.push('t.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  // Filter by class name
  if (class_name && class_name.trim()) {
    whereConditions.push('t.class_name = ?');
    queryParams.push(class_name.trim());
  }

  // Filter by division (Smart division visibility: Theory ignores division!)
  if (division && division.trim()) {
    whereConditions.push('(t.lecture_type = "Theory" OR t.division = ?)');
    queryParams.push(division.trim());
  }

  // Filter by room
  if (room_no && room_no.trim()) {
    whereConditions.push('t.room_no = ?');
    queryParams.push(room_no.trim());
  }

  const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Total matching count
  const countSql = `
    SELECT COUNT(*) as total
    FROM timetable t
    INNER JOIN courses c ON t.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers tch ON t.teacher_id = tch.teacher_id
    INNER JOIN users u ON tch.user_id = u.user_id
    ${whereSql}
  `;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = countRows[0]?.total || 0;

  // Sorting order: Monday through Saturday, then start_time ASC
  const orderBySql = `
    ORDER BY FIELD(t.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday') ASC,
             t.start_time ASC,
             t.timetable_id ASC
  `;

  // Select expression
  const selectSql = `
    SELECT 
      t.timetable_id,
      t.day_of_week,
      t.start_time,
      t.end_time,
      t.course_id,
      t.lecture_type,
      t.teacher_id,
      t.class_name,
      t.division,
      t.room_no,
      t.academic_year,
      t.semester,
      t.created_at,
      t.updated_at,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      d.department_id,
      d.department_name,
      d.department_code,
      tch.employee_number AS teacher_employee_number,
      tch.designation AS teacher_designation,
      u.user_id AS teacher_user_id,
      u.first_name AS teacher_first_name,
      u.last_name AS teacher_last_name,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name,
      u.email AS teacher_email,
      u.is_active AS teacher_is_active
    FROM timetable t
    INNER JOIN courses c ON t.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers tch ON t.teacher_id = tch.teacher_id
    INNER JOIN users u ON tch.user_id = u.user_id
    ${whereSql}
    ${orderBySql}
  `;

  if (all) {
    const [allRows] = await pool.query(selectSql, queryParams);
    return {
      timetable: allRows,
      pagination: {
        total,
        page: 1,
        limit: total,
        totalPages: 1
      }
    };
  }

  // Paginated query
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const totalPages = Math.ceil(total / safeLimit) || 1;

  const paginatedSql = `${selectSql} LIMIT ? OFFSET ?`;
  const [rows] = await pool.query(paginatedSql, [...queryParams, safeLimit, offset]);

  return {
    timetable: rows,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages
    }
  };
};

/**
 * Find single timetable entry by ID with complete relations
 * @param {number} timetableId
 * @returns {Promise<Object|null>}
 */
const findById = async (timetableId) => {
  const sql = `
    SELECT 
      t.timetable_id,
      t.day_of_week,
      t.start_time,
      t.end_time,
      t.course_id,
      t.lecture_type,
      t.teacher_id,
      t.class_name,
      t.division,
      t.batch,
      t.room_no,
      t.academic_year,
      t.semester,
      t.created_at,
      t.updated_at,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      d.department_id,
      d.department_name,
      d.department_code,
      tch.employee_number AS teacher_employee_number,
      tch.designation AS teacher_designation,
      u.user_id AS teacher_user_id,
      u.first_name AS teacher_first_name,
      u.last_name AS teacher_last_name,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name,
      u.email AS teacher_email,
      u.is_active AS teacher_is_active
    FROM timetable t
    INNER JOIN courses c ON t.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers tch ON t.teacher_id = tch.teacher_id
    INNER JOIN users u ON tch.user_id = u.user_id
    WHERE t.timetable_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [timetableId]);
  return rows[0] || null;
};

/**
 * Comprehensive timetable conflict validation
 * Overlap formula: existing_start < new_end AND existing_end > new_start on the same day_of_week
 * @param {Object} params
 * @returns {Promise<{ hasConflict: boolean, type: string|null, message: string|null, conflictRecord: Object|null }>}
 */
const checkConflict = async ({
  day_of_week,
  start_time,
  end_time,
  teacher_id,
  class_name,
  division = '',
  room_no,
  course_id,
  lecture_type = 'Theory',
  excludeId = null
}) => {
  const excludeClause = excludeId ? 'AND t.timetable_id != ?' : '';
  const excludeParam = excludeId ? [parseInt(excludeId, 10)] : [];

  // A. Teacher conflict check
  const teacherSql = `
    SELECT t.*, c.course_code, c.course_name, TRIM(CONCAT(u.first_name, ' ', u.last_name)) as teacher_name
    FROM timetable t
    INNER JOIN courses c ON t.course_id = c.course_id
    INNER JOIN teachers tch ON t.teacher_id = tch.teacher_id
    INNER JOIN users u ON tch.user_id = u.user_id
    WHERE t.day_of_week = ? 
      AND t.teacher_id = ? 
      AND t.start_time < ? 
      AND t.end_time > ?
      ${excludeClause}
    LIMIT 1
  `;
  const [teacherConflicts] = await pool.query(teacherSql, [
    day_of_week,
    parseInt(teacher_id, 10),
    end_time,
    start_time,
    ...excludeParam
  ]);

  if (teacherConflicts.length > 0) {
    const existing = teacherConflicts[0];
    return {
      hasConflict: true,
      type: 'TEACHER_CONFLICT',
      message: `Teacher already has another lecture at this time (${existing.start_time.toString().slice(0, 5)} - ${existing.end_time.toString().slice(0, 5)} on ${day_of_week}): ${existing.teacher_name || 'Assigned teacher'} (${existing.course_code}).`,
      conflictRecord: existing
    };
  }

  // B. Class & Division conflict check
  let classSql = '';
  let classParams = [];
  const cleanDiv = (division || '').trim();
  if (lecture_type === 'Theory') {
    classSql = `
      SELECT t.*, c.course_code, c.course_name
      FROM timetable t
      INNER JOIN courses c ON t.course_id = c.course_id
      WHERE t.day_of_week = ? 
        AND t.class_name = ? 
        AND t.start_time < ? 
        AND t.end_time > ?
        ${excludeClause}
      LIMIT 1
    `;
    classParams = [day_of_week, class_name.trim(), end_time, start_time, ...excludeParam];
  } else {
    classSql = `
      SELECT t.*, c.course_code, c.course_name
      FROM timetable t
      INNER JOIN courses c ON t.course_id = c.course_id
      WHERE t.day_of_week = ? 
        AND t.class_name = ? 
        AND (t.lecture_type = 'Theory' OR t.division = ?) 
        AND t.start_time < ? 
        AND t.end_time > ?
        ${excludeClause}
      LIMIT 1
    `;
    classParams = [day_of_week, class_name.trim(), cleanDiv, end_time, start_time, ...excludeParam];
  }

  const [classConflicts] = await pool.query(classSql, classParams);

  if (classConflicts.length > 0) {
    const existing = classConflicts[0];
    return {
      hasConflict: true,
      type: 'CLASS_CONFLICT',
      message: `Class/division already has another lecture at this time (${existing.start_time.toString().slice(0, 5)} - ${existing.end_time.toString().slice(0, 5)} on ${day_of_week}): ${class_name} ${cleanDiv ? 'Div ' + cleanDiv : ''} (${existing.course_code}).`,
      conflictRecord: existing
    };
  }

  // C. Room conflict check
  if (room_no && room_no.trim()) {
    const roomSql = `
      SELECT t.*, c.course_code, c.course_name
      FROM timetable t
      INNER JOIN courses c ON t.course_id = c.course_id
      WHERE t.day_of_week = ? 
        AND t.room_no = ? 
        AND t.start_time < ? 
        AND t.end_time > ?
        ${excludeClause}
      LIMIT 1
    `;
    const [roomConflicts] = await pool.query(roomSql, [
      day_of_week,
      room_no.trim(),
      end_time,
      start_time,
      ...excludeParam
    ]);

    if (roomConflicts.length > 0) {
      const existing = roomConflicts[0];
      return {
        hasConflict: true,
        type: 'ROOM_CONFLICT',
        message: `Room is already occupied at this time (${existing.start_time.toString().slice(0, 5)} - ${existing.end_time.toString().slice(0, 5)} on ${day_of_week}): Room ${room_no} (${existing.course_code}).`,
        conflictRecord: existing
      };
    }
  }

  // D. Course & Class/Division duplicate conflict check
  if (course_id) {
    let courseClassSql = '';
    let courseClassParams = [];
    if (lecture_type === 'Theory') {
      courseClassSql = `
        SELECT t.*, c.course_code, c.course_name
        FROM timetable t
        INNER JOIN courses c ON t.course_id = c.course_id
        WHERE t.day_of_week = ?
          AND t.course_id = ?
          AND t.class_name = ?
          AND t.lecture_type = 'Theory'
          AND t.start_time < ?
          AND t.end_time > ?
          ${excludeClause}
        LIMIT 1
      `;
      courseClassParams = [day_of_week, parseInt(course_id, 10), class_name.trim(), end_time, start_time, ...excludeParam];
    } else {
      courseClassSql = `
        SELECT t.*, c.course_code, c.course_name
        FROM timetable t
        INNER JOIN courses c ON t.course_id = c.course_id
        WHERE t.day_of_week = ?
          AND t.course_id = ?
          AND t.class_name = ?
          AND t.division = ?
          AND t.start_time < ?
          AND t.end_time > ?
          ${excludeClause}
        LIMIT 1
      `;
      courseClassParams = [day_of_week, parseInt(course_id, 10), class_name.trim(), cleanDiv, end_time, start_time, ...excludeParam];
    }

    const [courseClassConflicts] = await pool.query(courseClassSql, courseClassParams);

    if (courseClassConflicts.length > 0) {
      const existing = courseClassConflicts[0];
      return {
        hasConflict: true,
        type: 'COURSE_CLASS_CONFLICT',
        message: `Course ${existing.course_code} is already scheduled for class ${class_name}${cleanDiv ? '-' + cleanDiv : ''} at this time on ${day_of_week}.`,
        conflictRecord: existing
      };
    }
  }

  return {
    hasConflict: false,
    type: null,
    message: null,
    conflictRecord: null
  };
};

/**
 * Create a new timetable entry
 * @param {Object} data
 * @returns {Promise<number>} inserted timetable_id
 */
const createTimetable = async ({
  day_of_week,
  start_time,
  end_time,
  course_id,
  lecture_type = 'Theory',
  teacher_id,
  class_name,
  division = '',
  room_no,
  academic_year,
  semester
}) => {
  const cleanType = (lecture_type === 'Practical') ? 'Practical' : 'Theory';
  const cleanDiv = (division || '').trim();
  const sql = `
    INSERT INTO timetable (
      day_of_week,
      start_time,
      end_time,
      course_id,
      lecture_type,
      teacher_id,
      class_name,
      division,
      room_no,
      academic_year,
      semester
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await pool.query(sql, [
    day_of_week,
    start_time,
    end_time,
    course_id,
    cleanType,
    teacher_id,
    class_name.trim(),
    cleanDiv,
    room_no.trim(),
    academic_year.trim(),
    semester
  ]);

  return result.insertId;
};

/**
 * Update an existing timetable entry
 * @param {number} timetableId
 * @param {Object} data
 * @returns {Promise<boolean>}
 */
const updateTimetable = async (timetableId, {
  day_of_week,
  start_time,
  end_time,
  course_id,
  lecture_type = 'Theory',
  teacher_id,
  class_name,
  division = '',
  room_no,
  academic_year,
  semester
}) => {
  const cleanType = (lecture_type === 'Practical') ? 'Practical' : 'Theory';
  const cleanDiv = (division || '').trim();
  const sql = `
    UPDATE timetable SET
      day_of_week = ?,
      start_time = ?,
      end_time = ?,
      course_id = ?,
      lecture_type = ?,
      teacher_id = ?,
      class_name = ?,
      division = ?,
      room_no = ?,
      academic_year = ?,
      semester = ?
    WHERE timetable_id = ?
  `;

  const [result] = await pool.query(sql, [
    day_of_week,
    start_time,
    end_time,
    course_id,
    cleanType,
    teacher_id,
    class_name.trim(),
    cleanDiv,
    room_no.trim(),
    academic_year.trim(),
    semester,
    timetableId
  ]);

  return result.affectedRows > 0;
};

/**
 * Check dependencies before deleting a timetable record.
 * Only real academic records with a direct foreign key to timetable are treated as blockers.
 * Reminder logs and other non-academic metadata are ignored.
 * @param {number} timetableId
 * @returns {Promise<{ hasDependencies: boolean, totalDependencies: number, details: Object }>}
 */
const checkTimetableDependencies = async (timetableId) => {
  const ignoredTables = new Set(['timetable_reminder_logs']);

  const [fkRows] = await pool.query(`
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME = 'timetable'
      AND REFERENCED_COLUMN_NAME = 'timetable_id'
      AND TABLE_NAME NOT IN ('timetable_reminder_logs')
    ORDER BY TABLE_NAME, COLUMN_NAME
  `);

  const dependencyDetails = [];
  for (const fk of fkRows) {
    const tableName = fk.TABLE_NAME;
    const columnName = fk.COLUMN_NAME;

    const [countRows] = await pool.query(`
      SELECT COUNT(*) AS count
      FROM \`${tableName}\`
      WHERE \`${columnName}\` = ?
    `, [timetableId]);

    const count = Number(countRows[0]?.count || 0);
    if (count > 0) {
      dependencyDetails.push({
        table: tableName,
        column: columnName,
        count
      });
    }
  }

  return {
    hasDependencies: dependencyDetails.length > 0,
    totalDependencies: dependencyDetails.length,
    details: {
      dependencies: dependencyDetails,
      ignoredTables: [...ignoredTables]
    }
  };
};

/**
 * Delete a timetable entry
 * @param {number} timetableId
 * @returns {Promise<boolean>}
 */
const deleteTimetable = async (timetableId) => {
  const sql = 'DELETE FROM timetable WHERE timetable_id = ?';
  const [result] = await pool.query(sql, [timetableId]);
  return result.affectedRows > 0;
};

/**
 * Get today's lectures strictly applicable to a student's department, class, division, and semester
 * @param {Object} params
 * @returns {Promise<Array>}
 */
const getTodayLecturesForStudent = async ({
  department_id,
  class_name,
  division,
  semester,
  day_of_week,
  student_id = null
}) => {
  const whereConditions = ['t.day_of_week = ?'];
  const params = [day_of_week];

  if (department_id) {
    whereConditions.push('(c.department_id = ? OR tch.department_id = ? OR t.class_name = ?)');
    params.push(parseInt(department_id, 10), parseInt(department_id, 10), class_name || '');
  }

  if (class_name && class_name.trim()) {
    whereConditions.push('t.class_name = ?');
    params.push(class_name.trim());
  }

  if (semester !== '' && semester !== undefined && semester !== null) {
    whereConditions.push('t.semester = ?');
    params.push(parseInt(semester, 10));
  }

  if (division && division.trim()) {
    whereConditions.push('(t.lecture_type = "Theory" OR t.division = ?)');
    params.push(division.trim());
  }

  const sql = `
    SELECT 
      t.timetable_id,
      t.day_of_week,
      DATE_FORMAT(t.start_time, '%H:%i:%s') AS start_time,
      DATE_FORMAT(t.end_time, '%H:%i:%s') AS end_time,
      t.course_id,
      t.lecture_type,
      t.teacher_id,
      t.class_name,
      t.division,
      t.room_no,
      t.academic_year,
      t.semester,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      d.department_id,
      d.department_name,
      d.department_code,
      tch.employee_number AS teacher_employee_number,
      u.user_id AS teacher_user_id,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name,
      u.email AS teacher_email
    FROM timetable t
    INNER JOIN courses c ON t.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers tch ON t.teacher_id = tch.teacher_id
    INNER JOIN users u ON tch.user_id = u.user_id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY t.start_time ASC, t.timetable_id ASC
  `;

  const [rows] = await pool.query(sql, params);
  return rows;
};

/**
 * Get today's lectures strictly assigned to a specific teacher
 * Zero department-wide fallback
 * @param {Object} params
 * @returns {Promise<Array>}
 */
const getTodayLecturesForTeacher = async ({ teacher_id, day_of_week }) => {
  const sql = `
    SELECT 
      t.timetable_id,
      t.day_of_week,
      DATE_FORMAT(t.start_time, '%H:%i:%s') AS start_time,
      DATE_FORMAT(t.end_time, '%H:%i:%s') AS end_time,
      t.course_id,
      t.lecture_type,
      t.teacher_id,
      t.class_name,
      t.division,
      t.room_no,
      t.academic_year,
      t.semester,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      d.department_id,
      d.department_name,
      d.department_code,
      tch.employee_number AS teacher_employee_number,
      u.user_id AS teacher_user_id,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name,
      u.email AS teacher_email
    FROM timetable t
    INNER JOIN courses c ON t.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers tch ON t.teacher_id = tch.teacher_id
    INNER JOIN users u ON tch.user_id = u.user_id
    WHERE t.day_of_week = ?
      AND t.teacher_id = ?
    ORDER BY t.start_time ASC, t.timetable_id ASC
  `;

  const [rows] = await pool.query(sql, [day_of_week, parseInt(teacher_id, 10)]);
  return rows;
};

/**
 * Check if attendance has been recorded for a given course and lecture slot on a date
 * @param {Object} params
 * @returns {Promise<boolean>}
 */
const checkLectureAttendanceRecorded = async ({ course_id, teacher_id, date, start_time }) => {
  const whereConditions = ['a.course_id = ?', 'a.attendance_date = ?'];
  const params = [parseInt(course_id, 10), date];

  if (teacher_id) {
    whereConditions.push('a.teacher_id = ?');
    params.push(parseInt(teacher_id, 10));
  }

  if (start_time) {
    whereConditions.push('(a.start_time IS NULL OR TIME(a.start_time) = TIME(?))');
    params.push(start_time);
  }

  const sql = `
    SELECT COUNT(*) AS total_count
    FROM attendance a
    WHERE ${whereConditions.join(' AND ')}
  `;

  const [rows] = await pool.query(sql, params);
  return (rows[0]?.total_count || 0) > 0;
};

/**
 * Check if a student's attendance has been marked for this lecture
 * @param {Object} params
 * @returns {Promise<Object|null>}
 */
const checkStudentAttendanceForLecture = async ({ student_id, course_id, date, start_time }) => {
  const whereConditions = ['a.student_id = ?', 'a.course_id = ?', 'a.attendance_date = ?'];
  const params = [parseInt(student_id, 10), parseInt(course_id, 10), date];

  if (start_time) {
    whereConditions.push('(a.start_time IS NULL OR TIME(a.start_time) = TIME(?))');
    params.push(start_time);
  }

  const sql = `
    SELECT a.attendance_id, a.status, a.remarks
    FROM attendance a
    WHERE ${whereConditions.join(' AND ')}
    LIMIT 1
  `;

  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
};

/**
 * Log that a reminder notification was dispatched, enforcing database-level unique constraint
 * @param {Object} params
 * @returns {Promise<boolean>}
 */
const logReminderSent = async ({ user_id, timetable_id, lecture_date, reminder_type, notification_id = null }) => {
  try {
    const sql = `
      INSERT INTO timetable_reminder_logs (user_id, timetable_id, lecture_date, reminder_type, notification_id)
      VALUES (?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(sql, [
      parseInt(user_id, 10),
      parseInt(timetable_id, 10),
      lecture_date,
      reminder_type,
      notification_id ? parseInt(notification_id, 10) : null
    ]);
    return result.affectedRows > 0;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return false; // Already sent, idempotent duplicate suppressed
    }
    throw err;
  }
};

/**
 * Check if reminder has already been logged
 * @param {Object} params
 * @returns {Promise<boolean>}
 */
const isReminderLogged = async ({ user_id, timetable_id, lecture_date, reminder_type }) => {
  const sql = `
    SELECT reminder_log_id 
    FROM timetable_reminder_logs
    WHERE user_id = ? AND timetable_id = ? AND lecture_date = ? AND reminder_type = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [
    parseInt(user_id, 10),
    parseInt(timetable_id, 10),
    lecture_date,
    reminder_type
  ]);
  return rows.length > 0;
};

/**
 * Find all applicable active students for a timetable entry
 * Scoped to department, class, division (if Practical), semester, and active enrollment
 * @param {number} timetableId
 * @returns {Promise<Array>}
 */
const findStudentsForTimetableEntry = async (timetableId) => {
  const entry = await findById(timetableId);
  if (!entry) return [];

  let divClause = '';
  if (entry.lecture_type === 'Practical') {
    divClause = 'AND s.division = t.division';
  }

  const sql = `
    SELECT DISTINCT s.student_id, s.user_id, u.email, u.first_name, u.last_name, u.username
    FROM timetable t
    INNER JOIN courses c ON t.course_id = c.course_id
    INNER JOIN students s ON s.department_id = c.department_id 
      AND s.class_name = t.class_name 
      AND s.semester = t.semester
      ${divClause}
    INNER JOIN users u ON s.user_id = u.user_id
    INNER JOIN enrollments e ON e.student_id = s.student_id AND e.course_id = t.course_id
    WHERE t.timetable_id = ?
      AND u.is_active = 1
      AND e.status = 'Enrolled'
  `;
  const [rows] = await pool.query(sql, [parseInt(timetableId, 10)]);
  return rows;
};

module.exports = {
  ALLOWED_DAYS,
  getTimetable,
  findById,
  checkConflict,
  createTimetable,
  updateTimetable,
  checkTimetableDependencies,
  deleteTimetable,
  getTodayLecturesForStudent,
  getTodayLecturesForTeacher,
  checkLectureAttendanceRecorded,
  checkStudentAttendanceForLecture,
  logReminderSent,
  isReminderLogged,
  findStudentsForTimetableEntry
};
