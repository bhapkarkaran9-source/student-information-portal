const pool = require('../config/db');

// Reusable low attendance threshold configuration
const LOW_ATTENDANCE_THRESHOLD = 75.0;

// Allowed attendance statuses from MySQL enum
const ALLOWED_STATUSES = ['Present', 'Absent', 'Late', 'Excused'];

// Allowed lecture types
const ALLOWED_LECTURE_TYPES = [
  'Regular Lecture',
  'Extra / Additional Lecture',
  'Practical / Lab',
  'Makeup Lecture'
];

// Predefined period time mappings
const PREDEFINED_PERIODS = {
  'Lecture 1': { start_time: '09:00:00', end_time: '10:00:00' },
  'Lecture 2': { start_time: '10:00:00', end_time: '11:00:00' },
  'Lecture 3': { start_time: '11:15:00', end_time: '12:15:00' },
  'Lecture 4': { start_time: '12:15:00', end_time: '13:15:00' },
  'Practical / Lab': { start_time: '14:00:00', end_time: '16:00:00' },
  'Practical Lab': { start_time: '14:00:00', end_time: '16:00:00' }
};

/**
 * Format 24-hour time HH:MM:SS or HH:MM to 12-hour AM/PM string
 * e.g. "10:30:00" -> "10:30 AM", "14:00:00" -> "02:00 PM"
 * @param {string} timeStr
 * @returns {string}
 */
const formatTimeTo12Hour = (timeStr) => {
  if (!timeStr) return '';
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return String(timeStr);
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1].padStart(2, '0');
  if (isNaN(hours)) return String(timeStr);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');
  return `${strHours}:${minutes} ${ampm}`;
};

/**
 * Format time range into 12-hour AM/PM string
 * e.g. "10:30:00", "11:20:00" -> "10:30 AM - 11:20 AM"
 * @param {string} start
 * @param {string} end
 * @returns {string}
 */
const formatTimeRange = (start, end) => {
  if (!start && !end) return '-';
  if (start && !end) return formatTimeTo12Hour(start);
  if (!start && end) return formatTimeTo12Hour(end);
  return `${formatTimeTo12Hour(start)} - ${formatTimeTo12Hour(end)}`;
};

/**
 * Attendance Data Model
 * Table: attendance
 * Database: student_portal_db
 */

/**
 * Format a Date object to YYYY-MM-DD string
 * @param {Date|string} d
 * @returns {string}
 */
const formatDate = (d) => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get paginated list of attendance records with search and multi-criteria filters
 * @param {Object} options
 * @returns {Promise<{ attendance: Array, pagination: Object }>}
 */
const getAttendance = async ({
  page = 1,
  limit = 10,
  search = '',
  student_id = '',
  course_id = '',
  teacher_id = '',
  date = '',
  start_date = '',
  end_date = '',
  status = '',
  semester = ''
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const whereConditions = [];
  const queryParams = [];

  // Search by student name, enrollment_number, course_code, course_name, or teacher name
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push(`(
      u_s.first_name LIKE ? OR u_s.last_name LIKE ? OR 
      CONCAT(u_s.first_name, ' ', u_s.last_name) LIKE ? OR
      s.prn_number LIKE ? OR
      c.course_code LIKE ? OR c.course_name LIKE ? OR
      u_t.first_name LIKE ? OR u_t.last_name LIKE ? OR
      CONCAT(u_t.first_name, ' ', u_t.last_name) LIKE ?
    )`);
    queryParams.push(term, term, term, term, term, term, term, term, term);
  }

  // Filter by student_id
  if (student_id) {
    whereConditions.push('a.student_id = ?');
    queryParams.push(parseInt(student_id, 10));
  }

  // Filter by course_id
  if (course_id) {
    whereConditions.push('a.course_id = ?');
    queryParams.push(parseInt(course_id, 10));
  }

  // Filter by teacher_id
  if (teacher_id) {
    whereConditions.push('a.teacher_id = ?');
    queryParams.push(parseInt(teacher_id, 10));
  }

  // Filter by exact date
  if (date && date.trim()) {
    whereConditions.push('a.attendance_date = ?');
    queryParams.push(date.trim());
  }

  // Filter by date range
  if (start_date && start_date.trim()) {
    whereConditions.push('a.attendance_date >= ?');
    queryParams.push(start_date.trim());
  }
  if (end_date && end_date.trim()) {
    whereConditions.push('a.attendance_date <= ?');
    queryParams.push(end_date.trim());
  }

  // Filter by status
  if (status && status.trim()) {
    whereConditions.push('a.status = ?');
    queryParams.push(status.trim());
  }

  // Filter by course semester
  if (semester) {
    whereConditions.push('c.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Total matching count
  const countSql = `
    SELECT COUNT(*) AS total
    FROM attendance a
    INNER JOIN students s ON a.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    INNER JOIN courses c ON a.course_id = c.course_id
    INNER JOIN teachers t ON a.teacher_id = t.teacher_id
    INNER JOIN users u_t ON t.user_id = u_t.user_id
    ${whereClause}
  `;
  const [countResult] = await pool.query(countSql, queryParams);
  const total = countResult[0].total;

  // 2. Fetch attendance rows with joined details and per-student per-course statistics
  const dataSql = `
    SELECT 
      a.attendance_id,
      a.student_id,
      a.course_id,
      a.teacher_id,
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
      a.status,
      a.remarks,
      a.lecture_type,
      a.session_name,
      DATE_FORMAT(a.start_time, '%H:%i:%s') AS start_time,
      DATE_FORMAT(a.end_time, '%H:%i:%s') AS end_time,
      a.created_at,
      a.updated_at,
      s.prn_number AS enrollment_number,
      s.prn_number,
      s.class_name,
      s.division,
      s.semester AS student_semester,
      u_s.user_id AS student_user_id,
      u_s.first_name AS student_first_name,
      u_s.last_name AS student_last_name,
      TRIM(CONCAT(u_s.first_name, ' ', u_s.last_name)) AS student_name,
      u_s.email AS student_email,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      c.semester AS course_semester,
      d.department_id,
      d.department_name,
      d.department_code,
      t.employee_number AS teacher_employee_number,
      u_t.user_id AS teacher_user_id,
      u_t.first_name AS teacher_first_name,
      u_t.last_name AS teacher_last_name,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS teacher_name,
      stats.total_lectures,
      stats.present_lectures,
      stats.absent_lectures,
      stats.attendance_percentage,
      CASE 
        WHEN stats.total_lectures > 0 AND stats.attendance_percentage < ${LOW_ATTENDANCE_THRESHOLD} THEN 1 
        ELSE 0 
      END AS is_low_attendance
    FROM attendance a
    INNER JOIN students s ON a.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    INNER JOIN courses c ON a.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers t ON a.teacher_id = t.teacher_id
    INNER JOIN users u_t ON t.user_id = u_t.user_id
    LEFT JOIN (
      SELECT 
        student_id,
        course_id,
        COUNT(*) AS total_lectures,
        SUM(CASE WHEN status IN ('Present', 'Late') THEN 1 ELSE 0 END) AS present_lectures,
        SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent_lectures,
        ROUND((SUM(CASE WHEN status IN ('Present', 'Late') THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) AS attendance_percentage
      FROM attendance
      GROUP BY student_id, course_id
    ) stats ON a.student_id = stats.student_id AND a.course_id = stats.course_id
    ${whereClause}
    ORDER BY a.attendance_date DESC, a.start_time DESC, a.attendance_id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(dataSql, [...queryParams, limitNum, offset]);

  // Clean numeric percentage floats, integer counts and 12-hour formatted time strings
  const formattedRows = rows.map(r => ({
    ...r,
    lecture_type: r.lecture_type || 'Regular Lecture',
    session_name: r.session_name || 'Lecture 1',
    start_time_12h: formatTimeTo12Hour(r.start_time),
    end_time_12h: formatTimeTo12Hour(r.end_time),
    time_range: formatTimeRange(r.start_time, r.end_time),
    total_lectures: r.total_lectures !== null && r.total_lectures !== undefined ? parseInt(r.total_lectures, 10) : 0,
    present_lectures: r.present_lectures !== null && r.present_lectures !== undefined ? parseInt(r.present_lectures, 10) : 0,
    absent_lectures: r.absent_lectures !== null && r.absent_lectures !== undefined ? parseInt(r.absent_lectures, 10) : 0,
    attendance_percentage: r.attendance_percentage !== null ? parseFloat(r.attendance_percentage) : null,
    is_low_attendance: Boolean(r.is_low_attendance)
  }));

  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    attendance: formattedRows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages
    }
  };
};

/**
 * Find single attendance record by ID with joined metadata and course attendance stats
 * @param {number} attendanceId
 * @returns {Promise<Object|null>}
 */
const findById = async (attendanceId) => {
  const sql = `
    SELECT 
      a.attendance_id,
      a.student_id,
      a.course_id,
      a.teacher_id,
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
      a.status,
      a.remarks,
      a.lecture_type,
      a.session_name,
      DATE_FORMAT(a.start_time, '%H:%i:%s') AS start_time,
      DATE_FORMAT(a.end_time, '%H:%i:%s') AS end_time,
      a.created_at,
      a.updated_at,
      s.prn_number AS enrollment_number,
      s.prn_number,
      s.class_name,
      s.division,
      s.semester AS student_semester,
      u_s.user_id AS student_user_id,
      u_s.first_name AS student_first_name,
      u_s.last_name AS student_last_name,
      TRIM(CONCAT(u_s.first_name, ' ', u_s.last_name)) AS student_name,
      u_s.email AS student_email,
      u_s.phone AS student_phone,
      u_s.is_active AS student_is_active,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      c.semester AS course_semester,
      c.academic_year AS course_academic_year,
      d.department_id,
      d.department_name,
      d.department_code,
      t.employee_number AS teacher_employee_number,
      t.designation AS teacher_designation,
      u_t.user_id AS teacher_user_id,
      u_t.first_name AS teacher_first_name,
      u_t.last_name AS teacher_last_name,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS teacher_name,
      u_t.email AS teacher_email,
      stats.total_lectures,
      stats.present_lectures,
      stats.absent_lectures,
      stats.attendance_percentage,
      CASE 
        WHEN stats.total_lectures > 0 AND stats.attendance_percentage < ${LOW_ATTENDANCE_THRESHOLD} THEN 1 
        ELSE 0 
      END AS is_low_attendance
    FROM attendance a
    INNER JOIN students s ON a.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    INNER JOIN courses c ON a.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers t ON a.teacher_id = t.teacher_id
    INNER JOIN users u_t ON t.user_id = u_t.user_id
    LEFT JOIN (
      SELECT 
        student_id,
        course_id,
        COUNT(*) AS total_lectures,
        SUM(CASE WHEN status IN ('Present', 'Late') THEN 1 ELSE 0 END) AS present_lectures,
        SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent_lectures,
        ROUND((SUM(CASE WHEN status IN ('Present', 'Late') THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) AS attendance_percentage
      FROM attendance
      GROUP BY student_id, course_id
    ) stats ON a.student_id = stats.student_id AND a.course_id = stats.course_id
    WHERE a.attendance_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [attendanceId]);
  if (!rows[0]) return null;

  const r = rows[0];
  return {
    ...r,
    lecture_type: r.lecture_type || 'Regular Lecture',
    session_name: r.session_name || 'Lecture 1',
    start_time_12h: formatTimeTo12Hour(r.start_time),
    end_time_12h: formatTimeTo12Hour(r.end_time),
    time_range: formatTimeRange(r.start_time, r.end_time),
    total_lectures: r.total_lectures !== null && r.total_lectures !== undefined ? parseInt(r.total_lectures, 10) : 0,
    present_lectures: r.present_lectures !== null && r.present_lectures !== undefined ? parseInt(r.present_lectures, 10) : 0,
    absent_lectures: r.absent_lectures !== null && r.absent_lectures !== undefined ? parseInt(r.absent_lectures, 10) : 0,
    attendance_percentage: r.attendance_percentage !== null ? parseFloat(r.attendance_percentage) : null,
    is_low_attendance: Boolean(r.is_low_attendance)
  };
};

/**
 * Check if attendance record already exists for the given student, course, date, and optional start_time
 * Unique constraint: uk_attendance_student_course_date_time
 * @param {number} studentId
 * @param {number} courseId
 * @param {string} attendanceDate - YYYY-MM-DD
 * @param {string|null} startTime - HH:MM:SS or null
 * @param {number|null} excludeId - Optional attendance_id to exclude on update
 * @returns {Promise<Object|null>}
 */
const checkDuplicate = async (studentId, courseId, attendanceDate, startTime = null, excludeId = null) => {
  let sql = `
    SELECT attendance_id, student_id, course_id, attendance_date, status, lecture_type, session_name, start_time, end_time
    FROM attendance
    WHERE student_id = ? AND course_id = ? AND attendance_date = ?
  `;
  const params = [parseInt(studentId, 10), parseInt(courseId, 10), attendanceDate];

  if (startTime) {
    sql += ' AND start_time = ?';
    params.push(startTime);
  }

  if (excludeId) {
    sql += ' AND attendance_id != ?';
    params.push(parseInt(excludeId, 10));
  }

  sql += ' LIMIT 1';
  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
};

/**
 * Create a new attendance record
 * @param {Object} data
 * @returns {Promise<number>} insertId
 */
const createAttendance = async ({
  student_id,
  course_id,
  teacher_id,
  attendance_date,
  status = 'Present',
  remarks = null,
  lecture_type = 'Regular Lecture',
  session_name = 'Lecture 1',
  start_time = null,
  end_time = null
}) => {
  const sql = `
    INSERT INTO attendance (
      student_id,
      course_id,
      teacher_id,
      attendance_date,
      status,
      remarks,
      lecture_type,
      session_name,
      start_time,
      end_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    parseInt(student_id, 10),
    parseInt(course_id, 10),
    parseInt(teacher_id, 10),
    attendance_date,
    status,
    remarks ? String(remarks).trim() : null,
    lecture_type || 'Regular Lecture',
    session_name || 'Lecture 1',
    start_time || null,
    end_time || null
  ];

  const [result] = await pool.query(sql, params);
  return result.insertId;
};

/**
 * Update an existing attendance record
 * @param {number} attendanceId
 * @param {Object} data
 * @returns {Promise<boolean>}
 */
const updateAttendance = async (attendanceId, {
  student_id,
  course_id,
  teacher_id,
  attendance_date,
  status,
  remarks,
  lecture_type,
  session_name,
  start_time,
  end_time
}) => {
  const sql = `
    UPDATE attendance
    SET 
      student_id = ?,
      course_id = ?,
      teacher_id = ?,
      attendance_date = ?,
      status = ?,
      remarks = ?,
      lecture_type = IFNULL(?, lecture_type),
      session_name = IFNULL(?, session_name),
      start_time = IFNULL(?, start_time),
      end_time = IFNULL(?, end_time)
    WHERE attendance_id = ?
  `;
  const params = [
    parseInt(student_id, 10),
    parseInt(course_id, 10),
    parseInt(teacher_id, 10),
    attendance_date,
    status,
    remarks ? String(remarks).trim() : null,
    lecture_type || null,
    session_name || null,
    start_time || null,
    end_time || null,
    parseInt(attendanceId, 10)
  ];

  const [result] = await pool.query(sql, params);
  return result.affectedRows > 0;
};

/**
 * Delete an attendance record safely
 * @param {number} attendanceId
 * @returns {Promise<boolean>}
 */
const deleteAttendance = async (attendanceId) => {
  const sql = 'DELETE FROM attendance WHERE attendance_id = ?';
  const [result] = await pool.query(sql, [parseInt(attendanceId, 10)]);
  return result.affectedRows > 0;
};

/**
 * Get overall attendance summary analytics and low-attendance students list
 * @param {number|null} [teacherId=null]
 * @returns {Promise<{ summary: Object, lowAttendanceStudents: Array }>}
 */
const getAttendanceSummary = async (teacherId = null) => {
  const teacherFilter = teacherId ? 'WHERE a.teacher_id = ?' : '';
  const teacherParams = teacherId ? [parseInt(teacherId, 10)] : [];

  // 1. Overall counts
  const summarySql = `
    SELECT 
      COUNT(*) AS total_records,
      SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_count,
      SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
      SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS late_count,
      SUM(CASE WHEN a.status = 'Excused' THEN 1 ELSE 0 END) AS excused_count,
      ROUND((SUM(CASE WHEN a.status IN ('Present', 'Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100, 2) AS average_percentage
    FROM attendance a
    ${teacherFilter}
  `;
  const [summaryRows] = await pool.query(summarySql, teacherParams);
  const row = summaryRows[0] || {};
  const summary = {
    total_records: parseInt(row.total_records, 10) || 0,
    present_count: parseInt(row.present_count, 10) || 0,
    absent_count: parseInt(row.absent_count, 10) || 0,
    late_count: parseInt(row.late_count, 10) || 0,
    excused_count: parseInt(row.excused_count, 10) || 0,
    average_percentage: row.average_percentage !== null && row.average_percentage !== undefined ? parseFloat(row.average_percentage) : 0.0
  };

  // 2. Low-attendance student-course groupings (< 75%)
  const lowAttendanceSql = `
    SELECT 
      a.student_id,
      a.course_id,
      s.prn_number AS enrollment_number,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS student_name,
      u.email AS student_email,
      c.course_code,
      c.course_name,
      d.department_name,
      COUNT(*) AS total_lectures,
      SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_lectures,
      SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_lectures,
      ROUND((SUM(CASE WHEN a.status IN ('Present', 'Late') THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) AS attendance_percentage
    FROM attendance a
    INNER JOIN students s ON a.student_id = s.student_id
    INNER JOIN users u ON s.user_id = u.user_id
    INNER JOIN courses c ON a.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    ${teacherFilter}
    GROUP BY a.student_id, a.course_id, s.prn_number, student_name, u.email, c.course_code, c.course_name, d.department_name
    HAVING attendance_percentage < ${LOW_ATTENDANCE_THRESHOLD}
    ORDER BY attendance_percentage ASC, total_lectures DESC
  `;
  const [lowRows] = await pool.query(lowAttendanceSql, teacherParams);

  const lowAttendanceStudents = lowRows.map(r => ({
    ...r,
    total_lectures: parseInt(r.total_lectures, 10) || 0,
    present_lectures: parseInt(r.present_lectures, 10) || 0,
    absent_lectures: parseInt(r.absent_lectures, 10) || 0,
    attendance_percentage: parseFloat(r.attendance_percentage) || 0.0,
    threshold: LOW_ATTENDANCE_THRESHOLD
  }));

  summary.low_attendance_count = lowAttendanceStudents.length;

  return {
    summary,
    lowAttendanceStudents
  };
};

/**
 * Get comprehensive student-wise attendance details including all enrolled courses and lecture session logs
 * @param {number} studentId
 * @returns {Promise<Object|null>}
 */
const getStudentAttendance = async (studentId) => {
  // 1. Fetch student info
  const studentSql = `
    SELECT 
      s.student_id,
      s.prn_number AS enrollment_number,
      s.prn_number,
      s.class_name,
      s.division,
      s.semester,
      u.user_id,
      u.first_name,
      u.last_name,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS student_name,
      u.email,
      u.phone,
      u.is_active,
      d.department_id,
      d.department_name,
      d.department_code
    FROM students s
    INNER JOIN users u ON s.user_id = u.user_id
    LEFT JOIN departments d ON s.department_id = d.department_id
    WHERE s.student_id = ?
    LIMIT 1
  `;
  const [studentRows] = await pool.query(studentSql, [parseInt(studentId, 10)]);
  if (!studentRows[0]) return null;
  const student = studentRows[0];

  // 2. Overall attendance stats across all courses (Present + Late) / Total * 100
  const overallSql = `
    SELECT 
      COUNT(*) AS total_lectures,
      SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present_lectures,
      SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent_lectures,
      SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) AS late_lectures,
      SUM(CASE WHEN status = 'Excused' THEN 1 ELSE 0 END) AS excused_lectures,
      ROUND((SUM(CASE WHEN status IN ('Present', 'Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100, 2) AS overall_percentage
    FROM attendance
    WHERE student_id = ?
  `;
  const [overallRows] = await pool.query(overallSql, [parseInt(studentId, 10)]);
  const oRow = overallRows[0] || {};
  const overallStats = {
    total_lectures: parseInt(oRow.total_lectures, 10) || 0,
    present_lectures: parseInt(oRow.present_lectures, 10) || 0,
    absent_lectures: parseInt(oRow.absent_lectures, 10) || 0,
    late_lectures: parseInt(oRow.late_lectures, 10) || 0,
    excused_lectures: parseInt(oRow.excused_lectures, 10) || 0,
    overall_percentage: oRow.overall_percentage !== null && oRow.overall_percentage !== undefined ? parseFloat(oRow.overall_percentage) : 0.0
  };
  overallStats.is_low_attendance = overallStats.total_lectures > 0 && overallStats.overall_percentage < LOW_ATTENDANCE_THRESHOLD;

  // 3. Course-by-course breakdown for enrolled courses
  const coursesSql = `
    SELECT 
      c.course_id,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      c.semester AS course_semester,
      e.academic_year AS enrollment_year,
      e.status AS enrollment_status,
      COUNT(a.attendance_id) AS total_lectures,
      SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_lectures,
      SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_lectures,
      SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS late_lectures,
      SUM(CASE WHEN a.status = 'Excused' THEN 1 ELSE 0 END) AS excused_lectures,
      ROUND((SUM(CASE WHEN a.status IN ('Present', 'Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(a.attendance_id), 0)) * 100, 2) AS attendance_percentage
    FROM enrollments e
    INNER JOIN courses c ON e.course_id = c.course_id
    LEFT JOIN attendance a ON a.student_id = e.student_id AND a.course_id = e.course_id
    WHERE e.student_id = ?
    GROUP BY c.course_id, c.course_code, c.course_name, c.credits, c.course_type, c.semester, e.academic_year, e.status
    ORDER BY c.course_name ASC
  `;
  const [courseRows] = await pool.query(coursesSql, [parseInt(studentId, 10)]);

  const coursesBreakdown = courseRows.map(c => {
    const pct = c.attendance_percentage !== null ? parseFloat(c.attendance_percentage) : 0.0;
    return {
      ...c,
      total_lectures: parseInt(c.total_lectures, 10) || 0,
      present_lectures: parseInt(c.present_lectures, 10) || 0,
      absent_lectures: parseInt(c.absent_lectures, 10) || 0,
      late_lectures: parseInt(c.late_lectures, 10) || 0,
      excused_lectures: parseInt(c.excused_lectures, 10) || 0,
      attendance_percentage: pct,
      is_low_attendance: c.total_lectures > 0 && pct < LOW_ATTENDANCE_THRESHOLD
    };
  });

  // 4. Detailed attendance logs with lecture type and 12-hr formatted time
  const logsSql = `
    SELECT 
      a.attendance_id,
      a.course_id,
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
      a.status,
      a.remarks,
      a.lecture_type,
      a.session_name,
      DATE_FORMAT(a.start_time, '%H:%i:%s') AS start_time,
      DATE_FORMAT(a.end_time, '%H:%i:%s') AS end_time,
      c.course_code,
      c.course_name,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name
    FROM attendance a
    INNER JOIN courses c ON a.course_id = c.course_id
    INNER JOIN teachers t ON a.teacher_id = t.teacher_id
    INNER JOIN users u ON t.user_id = u.user_id
    WHERE a.student_id = ?
    ORDER BY a.attendance_date DESC, a.start_time DESC, a.attendance_id DESC
    LIMIT 100
  `;
  const [rawLogs] = await pool.query(logsSql, [parseInt(studentId, 10)]);

  const logs = rawLogs.map(l => ({
    ...l,
    lecture_type: l.lecture_type || 'Regular Lecture',
    session_name: l.session_name || 'Lecture 1',
    start_time_12h: formatTimeTo12Hour(l.start_time),
    end_time_12h: formatTimeTo12Hour(l.end_time),
    time_range: formatTimeRange(l.start_time, l.end_time)
  }));

  // 5. Active faculty belonging to the student's department (authoritative relationship)
  let departmentFaculty = [];
  if (student.department_id) {
    const facultySql = `
      SELECT 
        t.teacher_id,
        t.department_id,
        t.designation,
        TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name,
        u.first_name,
        u.last_name,
        u.email
      FROM teachers t
      INNER JOIN users u ON t.user_id = u.user_id
      WHERE t.department_id = ? AND u.is_active = 1
      ORDER BY teacher_name ASC
    `;
    const [facRows] = await pool.query(facultySql, [student.department_id]);
    departmentFaculty = facRows;
  }

  return {
    student,
    overallStats,
    courses: coursesBreakdown,
    departmentFaculty,
    faculty: departmentFaculty,
    recentLogs: logs,
    threshold: LOW_ATTENDANCE_THRESHOLD
  };
};

/**
 * Get comprehensive course-wise attendance details including student-by-student breakdown
 * @param {number} courseId
 * @returns {Promise<Object|null>}
 */
const getCourseAttendance = async (courseId) => {
  // 1. Fetch course info
  const courseSql = `
    SELECT 
      c.course_id,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      c.semester,
      c.academic_year,
      d.department_id,
      d.department_name,
      d.department_code
    FROM courses c
    INNER JOIN departments d ON c.department_id = d.department_id
    WHERE c.course_id = ?
    LIMIT 1
  `;
  const [courseRows] = await pool.query(courseSql, [parseInt(courseId, 10)]);
  if (!courseRows[0]) return null;
  const course = courseRows[0];

  // 2. Overall attendance metrics for this course
  const overallSql = `
    SELECT 
      COUNT(*) AS total_records,
      SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present_count,
      SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
      ROUND((SUM(CASE WHEN status IN ('Present', 'Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100, 2) AS average_percentage
    FROM attendance
    WHERE course_id = ?
  `;
  const [overallRows] = await pool.query(overallSql, [parseInt(courseId, 10)]);
  const cRow = overallRows[0] || {};
  const courseStats = {
    total_records: parseInt(cRow.total_records, 10) || 0,
    present_count: parseInt(cRow.present_count, 10) || 0,
    absent_count: parseInt(cRow.absent_count, 10) || 0,
    average_percentage: cRow.average_percentage !== null && cRow.average_percentage !== undefined ? parseFloat(cRow.average_percentage) : 0.0
  };

  // 3. Total enrolled students
  const [enrolledCount] = await pool.query(
    'SELECT COUNT(*) AS total_enrolled FROM enrollments WHERE course_id = ? AND status = "Enrolled"',
    [parseInt(courseId, 10)]
  );
  courseStats.total_enrolled_students = parseInt(enrolledCount[0]?.total_enrolled, 10) || 0;

  // 4. Student-by-student attendance breakdown for this course
  const studentsSql = `
    SELECT 
      s.student_id,
      s.prn_number AS enrollment_number,
      s.prn_number,
      s.class_name,
      s.division,
      s.semester,
      d.department_name,
      d.department_code,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS student_name,
      u.email AS student_email,
      COUNT(a.attendance_id) AS total_lectures,
      SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_lectures,
      SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_lectures,
      ROUND((SUM(CASE WHEN a.status IN ('Present', 'Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(a.attendance_id), 0)) * 100, 2) AS attendance_percentage
    FROM enrollments e
    INNER JOIN students s ON e.student_id = s.student_id
    INNER JOIN users u ON s.user_id = u.user_id
    LEFT JOIN departments d ON s.department_id = d.department_id
    LEFT JOIN attendance a ON a.student_id = e.student_id AND a.course_id = e.course_id
    WHERE e.course_id = ? AND e.status = 'Enrolled'
    GROUP BY s.student_id, s.prn_number, s.class_name, s.division, s.semester, d.department_name, d.department_code, student_name, u.email
    ORDER BY student_name ASC
  `;
  const [studentRows] = await pool.query(studentsSql, [parseInt(courseId, 10)]);

  const studentBreakdown = studentRows.map(s => {
    const pct = s.attendance_percentage !== null ? parseFloat(s.attendance_percentage) : 0.0;
    return {
      ...s,
      total_lectures: parseInt(s.total_lectures, 10) || 0,
      present_lectures: parseInt(s.present_lectures, 10) || 0,
      absent_lectures: parseInt(s.absent_lectures, 10) || 0,
      attendance_percentage: pct,
      is_low_attendance: s.total_lectures > 0 && pct < LOW_ATTENDANCE_THRESHOLD
    };
  });

  const lowAttendanceStudents = studentBreakdown.filter(s => s.is_low_attendance);

  return {
    course,
    courseStats,
    students: studentBreakdown,
    lowAttendanceStudents,
    threshold: LOW_ATTENDANCE_THRESHOLD
  };
};

/**
 * Check if a student is actively enrolled in a course
 * @param {number} studentId
 * @param {number} courseId
 * @returns {Promise<Object|null>}
 */
const checkStudentEnrollment = async (studentId, courseId) => {
  const sql = `
    SELECT enrollment_id, student_id, course_id, status, academic_year, semester
    FROM enrollments
    WHERE student_id = ? AND course_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [parseInt(studentId, 10), parseInt(courseId, 10)]);
  return rows[0] || null;
};

/**
 * Check if a teacher is assigned or authorized to teach a course
 * Authoritative check via timetable records (teacher_id + course_id)
 * Department match alone is NOT sufficient.
 * @param {number} teacherId
 * @param {number} courseId
 * @returns {Promise<boolean>}
 */
const checkTeacherCourseAssignment = async (teacherId, courseId) => {
  const tid = parseInt(teacherId, 10);
  const cid = parseInt(courseId, 10);
  if (isNaN(tid) || isNaN(cid) || tid <= 0 || cid <= 0) return false;

  // Authoritative check: timetable assignment
  const [tt] = await pool.query(
    'SELECT timetable_id FROM timetable WHERE teacher_id = ? AND course_id = ? LIMIT 1',
    [tid, cid]
  );
  return tt.length > 0;
};

/**
 * Check if a student is enrolled in a course taught by the teacher
 * Authoritative check via timetable + enrollments
 * Department match alone is NOT sufficient.
 * @param {number} teacherId
 * @param {number} studentId
 * @param {number} [courseId]
 * @returns {Promise<boolean>}
 */
const isStudentInTeacherCourses = async (teacherId, studentId, courseId = null) => {
  const tid = parseInt(teacherId, 10);
  const sid = parseInt(studentId, 10);
  if (isNaN(tid) || isNaN(sid) || tid <= 0 || sid <= 0) return false;

  if (courseId) {
    const cid = parseInt(courseId, 10);
    const sql = `
      SELECT e.enrollment_id 
      FROM enrollments e
      INNER JOIN timetable tt ON e.course_id = tt.course_id
      WHERE tt.teacher_id = ? AND e.course_id = ? AND e.student_id = ? AND e.status = 'Enrolled'
      LIMIT 1
    `;
    const [rows] = await pool.query(sql, [tid, cid, sid]);
    return rows.length > 0;
  }

  const sql = `
    SELECT e.enrollment_id 
    FROM enrollments e
    INNER JOIN timetable tt ON e.course_id = tt.course_id
    WHERE tt.teacher_id = ? AND e.student_id = ? AND e.status = 'Enrolled'
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [tid, sid]);
  return rows.length > 0;
};

/**
 * Encode session composite keys into a URL-safe Base64 identifier
 * @param {number} courseId
 * @param {string} date
 * @param {string} startTime
 * @param {number|null} [teacherId=null]
 * @returns {string}
 */
const encodeSessionId = (courseId, date, startTime, teacherId = null) => {
  const d = formatDate(date) || String(date).slice(0, 10);
  const s = String(startTime || '').trim();
  const payload = { c: parseInt(courseId, 10), d, s };
  if (teacherId) payload.t = parseInt(teacherId, 10);
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
};

/**
 * Decode URL-safe Base64 identifier into session composite keys
 * @param {string} sessionId
 * @returns {{ course_id: number, attendance_date: string, start_time: string, teacher_id: number|null }|null}
 */
const decodeSessionId = (sessionId) => {
  if (!sessionId || typeof sessionId !== 'string') return null;
  try {
    const json = Buffer.from(sessionId, 'base64url').toString('utf8');
    const obj = JSON.parse(json);
    if (!obj || !obj.c || !obj.d || !obj.s) return null;
    return {
      course_id: parseInt(obj.c, 10),
      attendance_date: String(obj.d),
      start_time: String(obj.s),
      teacher_id: obj.t ? parseInt(obj.t, 10) : null
    };
  } catch (err) {
    return null;
  }
};

/**
 * Get paginated, filterable attendance sessions grouped by lecture
 * @param {Object} options
 * @returns {Promise<{ sessions: Array, pagination: Object }>}
 */
const getAttendanceSessions = async ({
  page = 1,
  limit = 10,
  search = '',
  teacher_id = '',
  course_id = '',
  date = '',
  start_date = '',
  end_date = '',
  lecture_type = ''
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const whereConditions = [];
  const queryParams = [];

  if (teacher_id) {
    whereConditions.push('a.teacher_id = ?');
    queryParams.push(parseInt(teacher_id, 10));
  }

  if (course_id) {
    whereConditions.push('a.course_id = ?');
    queryParams.push(parseInt(course_id, 10));
  }

  if (date && date.trim()) {
    whereConditions.push('a.attendance_date = ?');
    queryParams.push(date.trim());
  }

  if (start_date && start_date.trim()) {
    whereConditions.push('a.attendance_date >= ?');
    queryParams.push(start_date.trim());
  }

  if (end_date && end_date.trim()) {
    whereConditions.push('a.attendance_date <= ?');
    queryParams.push(end_date.trim());
  }

  if (lecture_type && lecture_type.trim()) {
    whereConditions.push('a.lecture_type = ?');
    queryParams.push(lecture_type.trim());
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push(`(
      c.course_code LIKE ? OR
      c.course_name LIKE ? OR
      a.remarks LIKE ? OR
      a.lecture_type LIKE ? OR
      u_t.first_name LIKE ? OR
      u_t.last_name LIKE ? OR
      CONCAT(u_t.first_name, ' ', u_t.last_name) LIKE ?
    )`);
    queryParams.push(term, term, term, term, term, term, term);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Total session groups count
  const countSql = `
    SELECT COUNT(*) AS total FROM (
      SELECT a.course_id, a.attendance_date, a.start_time, a.teacher_id
      FROM attendance a
      INNER JOIN courses c ON a.course_id = c.course_id
      INNER JOIN teachers t ON a.teacher_id = t.teacher_id
      INNER JOIN users u_t ON t.user_id = u_t.user_id
      ${whereClause}
      GROUP BY a.course_id, a.attendance_date, a.start_time, a.teacher_id
    ) AS session_groups
  `;
  const [countResult] = await pool.query(countSql, queryParams);
  const total = countResult[0] ? countResult[0].total : 0;

  // 2. Fetch grouped session details
  const sessionSql = `
    SELECT 
      a.course_id,
      a.teacher_id,
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
      DATE_FORMAT(a.start_time, '%H:%i:%s') AS start_time,
      DATE_FORMAT(a.end_time, '%H:%i:%s') AS end_time,
      COALESCE(a.lecture_type, 'Regular Lecture') AS lecture_type,
      COALESCE(a.session_name, 'Admin Timetable Time') AS session_name,
      c.course_code,
      c.course_name,
      c.semester AS course_semester,
      d.department_name,
      d.department_code,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS teacher_name,
      COUNT(a.attendance_id) AS total_students,
      SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_count,
      SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
      SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS late_count,
      SUM(CASE WHEN a.status = 'Excused' THEN 1 ELSE 0 END) AS excused_count,
      ROUND((SUM(CASE WHEN a.status IN ('Present', 'Late') THEN 1 ELSE 0 END) / COUNT(a.attendance_id)) * 100, 2) AS attendance_percentage,
      (
        SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(a2.remarks), '') SEPARATOR '; ')
        FROM attendance a2
        WHERE a2.course_id = a.course_id 
          AND a2.attendance_date = a.attendance_date 
          AND a2.start_time = a.start_time
          AND a2.teacher_id = a.teacher_id
      ) AS remarks_summary,
      (
        SELECT tt.room_no
        FROM timetable tt
        WHERE tt.course_id = a.course_id AND tt.teacher_id = a.teacher_id AND tt.start_time = a.start_time
        LIMIT 1
      ) AS room_no,
      (
        SELECT tt.division
        FROM timetable tt
        WHERE tt.course_id = a.course_id AND tt.teacher_id = a.teacher_id AND tt.start_time = a.start_time
        LIMIT 1
      ) AS division,
      (
        SELECT tt.class_name
        FROM timetable tt
        WHERE tt.course_id = a.course_id AND tt.teacher_id = a.teacher_id AND tt.start_time = a.start_time
        LIMIT 1
      ) AS class_name
    FROM attendance a
    INNER JOIN courses c ON a.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers t ON a.teacher_id = t.teacher_id
    INNER JOIN users u_t ON t.user_id = u_t.user_id
    ${whereClause}
    GROUP BY 
      a.course_id, 
      a.teacher_id, 
      a.attendance_date, 
      a.start_time, 
      a.end_time, 
      a.lecture_type, 
      a.session_name, 
      c.course_code, 
      c.course_name, 
      c.semester, 
      d.department_name, 
      d.department_code, 
      teacher_name
    ORDER BY a.attendance_date DESC, a.start_time DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(sessionSql, [...queryParams, limitNum, offset]);

  const sessions = rows.map(r => ({
    ...r,
    session_id: encodeSessionId(r.course_id, r.attendance_date, r.start_time, r.teacher_id),
    total_students: parseInt(r.total_students, 10) || 0,
    present_count: parseInt(r.present_count, 10) || 0,
    absent_count: parseInt(r.absent_count, 10) || 0,
    late_count: parseInt(r.late_count, 10) || 0,
    excused_count: parseInt(r.excused_count, 10) || 0,
    attendance_percentage: r.attendance_percentage !== null ? parseFloat(r.attendance_percentage) : 0.0,
    start_time_12h: formatTimeTo12Hour(r.start_time),
    end_time_12h: formatTimeTo12Hour(r.end_time),
    time_range: formatTimeRange(r.start_time, r.end_time),
    room_no: r.room_no || '-',
    division: r.division || '-',
    class_name: r.class_name || '-'
  }));

  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    sessions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages
    }
  };
};

/**
 * Get single session overview and full student roster
 * @param {number} courseId
 * @param {string} date
 * @param {string} startTime
 * @param {number|null} [teacherId=null]
 * @returns {Promise<Object|null>}
 */
const getSessionDetails = async (courseId, date, startTime, teacherId = null) => {
  const whereConditions = [
    'a.course_id = ?',
    'a.attendance_date = ?',
    'a.start_time = ?'
  ];
  const params = [parseInt(courseId, 10), date, startTime];

  if (teacherId) {
    whereConditions.push('a.teacher_id = ?');
    params.push(parseInt(teacherId, 10));
  }

  // Session header info
  const headerSql = `
    SELECT 
      a.course_id,
      a.teacher_id,
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
      DATE_FORMAT(a.start_time, '%H:%i:%s') AS start_time,
      DATE_FORMAT(a.end_time, '%H:%i:%s') AS end_time,
      COALESCE(a.lecture_type, 'Regular Lecture') AS lecture_type,
      COALESCE(a.session_name, 'Admin Timetable Time') AS session_name,
      c.course_code,
      c.course_name,
      c.semester AS course_semester,
      d.department_name,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS teacher_name,
      COUNT(a.attendance_id) AS total_students,
      SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_count,
      SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
      SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS late_count,
      SUM(CASE WHEN a.status = 'Excused' THEN 1 ELSE 0 END) AS excused_count,
      ROUND((SUM(CASE WHEN a.status IN ('Present', 'Late') THEN 1 ELSE 0 END) / COUNT(a.attendance_id)) * 100, 2) AS attendance_percentage,
      (
        SELECT tt.room_no
        FROM timetable tt
        WHERE tt.course_id = a.course_id AND tt.teacher_id = a.teacher_id AND tt.start_time = a.start_time
        LIMIT 1
      ) AS room_no,
      (
        SELECT tt.division
        FROM timetable tt
        WHERE tt.course_id = a.course_id AND tt.teacher_id = a.teacher_id AND tt.start_time = a.start_time
        LIMIT 1
      ) AS division,
      (
        SELECT tt.class_name
        FROM timetable tt
        WHERE tt.course_id = a.course_id AND tt.teacher_id = a.teacher_id AND tt.start_time = a.start_time
        LIMIT 1
      ) AS class_name
    FROM attendance a
    INNER JOIN courses c ON a.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers t ON a.teacher_id = t.teacher_id
    INNER JOIN users u_t ON t.user_id = u_t.user_id
    WHERE ${whereConditions.join(' AND ')}
    GROUP BY 
      a.course_id, 
      a.teacher_id, 
      a.attendance_date, 
      a.start_time, 
      a.end_time, 
      a.lecture_type, 
      a.session_name, 
      c.course_code, 
      c.course_name, 
      c.semester, 
      d.department_name, 
      teacher_name
    LIMIT 1
  `;

  const [headerRows] = await pool.query(headerSql, params);
  if (!headerRows[0]) return null;

  const header = headerRows[0];
  header.session_id = encodeSessionId(header.course_id, header.attendance_date, header.start_time, header.teacher_id);
  header.start_time_12h = formatTimeTo12Hour(header.start_time);
  header.end_time_12h = formatTimeTo12Hour(header.end_time);
  header.time_range = formatTimeRange(header.start_time, header.end_time);
  header.total_students = parseInt(header.total_students, 10) || 0;
  header.present_count = parseInt(header.present_count, 10) || 0;
  header.absent_count = parseInt(header.absent_count, 10) || 0;
  header.late_count = parseInt(header.late_count, 10) || 0;
  header.excused_count = parseInt(header.excused_count, 10) || 0;
  header.attendance_percentage = header.attendance_percentage !== null ? parseFloat(header.attendance_percentage) : 0.0;
  header.room_no = header.room_no || '-';
  header.division = header.division || '-';
  header.class_name = header.class_name || '-';

  // Student roster for session
  const rosterSql = `
    SELECT 
      a.attendance_id,
      a.student_id,
      a.status,
      a.remarks,
      s.prn_number,
      s.class_name,
      s.division,
      u_s.first_name,
      u_s.last_name,
      TRIM(CONCAT(u_s.first_name, ' ', u_s.last_name)) AS student_name,
      u_s.email AS student_email
    FROM attendance a
    INNER JOIN students s ON a.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY s.prn_number ASC, student_name ASC
  `;

  const [roster] = await pool.query(rosterSql, params);

  return {
    session: header,
    roster
  };
};

/**
 * Update attendance session records and metadata
 * @param {number} courseId
 * @param {string} date
 * @param {string} startTime
 * @param {number|null} teacherId
 * @param {Object} updates
 * @returns {Promise<boolean>}
 */
const updateSessionAttendance = async (courseId, date, startTime, teacherId, updates) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { lecture_type, session_name, start_time: newStart, end_time: newEnd, records } = updates;

    const sessionUpdates = [];
    const sessionParams = [];

    if (lecture_type) {
      sessionUpdates.push('lecture_type = ?');
      sessionParams.push(lecture_type);
    }
    if (session_name) {
      sessionUpdates.push('session_name = ?');
      sessionParams.push(session_name);
    }
    if (newStart) {
      sessionUpdates.push('start_time = ?');
      sessionParams.push(newStart);
    }
    if (newEnd) {
      sessionUpdates.push('end_time = ?');
      sessionParams.push(newEnd);
    }

    // If metadata changed, update across all records in the session
    if (sessionUpdates.length > 0) {
      const metaSql = `
        UPDATE attendance 
        SET ${sessionUpdates.join(', ')}, updated_at = NOW()
        WHERE course_id = ? AND attendance_date = ? AND start_time = ? ${teacherId ? 'AND teacher_id = ?' : ''}
      `;
      const metaParams = [...sessionParams, courseId, date, startTime];
      if (teacherId) metaParams.push(teacherId);
      await connection.query(metaSql, metaParams);
    }

    // Update individual student records
    if (Array.isArray(records) && records.length > 0) {
      for (const rec of records) {
        const studentId = parseInt(rec.student_id, 10);
        const cleanStatus = rec.status ? String(rec.status).trim() : null;
        const normalizedStatus = cleanStatus ? (cleanStatus.charAt(0).toUpperCase() + cleanStatus.slice(1).toLowerCase()) : null;
        const remarks = rec.remarks !== undefined ? rec.remarks : null;

        const effectiveStart = newStart || startTime;

        if (normalizedStatus && ALLOWED_STATUSES.includes(normalizedStatus)) {
          const updateRowSql = `
            UPDATE attendance 
            SET status = ?, remarks = ?, updated_at = NOW()
            WHERE student_id = ? AND course_id = ? AND attendance_date = ? AND start_time = ? ${teacherId ? 'AND teacher_id = ?' : ''}
          `;
          const rowParams = [normalizedStatus, remarks, studentId, courseId, date, effectiveStart];
          if (teacherId) rowParams.push(teacherId);
          await connection.query(updateRowSql, rowParams);
        }
      }
    }

    await connection.commit();
    return true;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
};

/**
 * Delete attendance session records
 * @param {number} courseId
 * @param {string} date
 * @param {string} startTime
 * @param {number|null} [teacherId=null]
 * @returns {Promise<boolean>}
 */
const deleteSessionAttendance = async (courseId, date, startTime, teacherId = null) => {
  const whereConditions = [
    'course_id = ?',
    'attendance_date = ?',
    'start_time = ?'
  ];
  const params = [parseInt(courseId, 10), date, startTime];

  if (teacherId) {
    whereConditions.push('teacher_id = ?');
    params.push(parseInt(teacherId, 10));
  }

  const sql = `DELETE FROM attendance WHERE ${whereConditions.join(' AND ')}`;
  const [result] = await pool.query(sql, params);
  return result.affectedRows > 0;
};

/**
 * Normalize batch string for robust comparison
 * e.g. "Batch A" -> "a", "A" -> "a", "batch-a" -> "a", "Division A" -> "a"
 * @param {string} b
 * @returns {string}
 */
const normalizeBatch = (b) => {
  if (!b) return '';
  const str = String(b).trim().toLowerCase();
  return str.replace(/^(batch|division)[\s_-]*/i, '').replace(/[\s_-]+/g, '');
};

/**
 * Check if student batch matches session batch
 * If sessionBatch is null/empty/all, it matches all batches
 * @param {string} studentBatch
 * @param {string} sessionBatch
 * @returns {boolean}
 */
const isBatchMatching = (studentBatch, sessionBatch) => {
  if (!sessionBatch || !String(sessionBatch).trim() || String(sessionBatch).trim().toLowerCase() === 'all') {
    return true;
  }
  if (!studentBatch || !String(studentBatch).trim()) {
    return false;
  }
  const sNorm = normalizeBatch(studentBatch);
  const sessNorm = normalizeBatch(sessionBatch);
  return sNorm === sessNorm;
};

/**
 * Create a new QR attendance session in attendance_sessions table
 * @param {Object} sessionData
 * @returns {Promise<Object>}
 */
const createQRSession = async ({
  session_uuid,
  teacher_id,
  course_id,
  timetable_id = null,
  batch = null,
  session_date,
  start_time,
  end_time,
  lecture_type = 'Regular Lecture',
  room_no = null,
  duration_minutes = 5,
  expires_at,
  is_active = 1,
  student_qr_visible = 0,
  qr_secret
}) => {
  const cleanBatch = batch && String(batch).trim() ? String(batch).trim() : null;
  const sql = `
    INSERT INTO attendance_sessions (
      session_uuid, teacher_id, course_id, timetable_id, batch,
      session_date, start_time, end_time, lecture_type,
      room_no, duration_minutes, expires_at, is_active, student_qr_visible, qr_secret
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    session_uuid,
    parseInt(teacher_id, 10),
    parseInt(course_id, 10),
    timetable_id ? parseInt(timetable_id, 10) : null,
    cleanBatch,
    session_date,
    start_time,
    end_time,
    lecture_type,
    room_no || null,
    parseInt(duration_minutes, 10) || 5,
    expires_at,
    is_active ? 1 : 0,
    student_qr_visible ? 1 : 0,
    qr_secret
  ];
  const [result] = await pool.query(sql, params);
  return {
    session_id: result.insertId,
    session_uuid,
    teacher_id: parseInt(teacher_id, 10),
    course_id: parseInt(course_id, 10),
    timetable_id: timetable_id ? parseInt(timetable_id, 10) : null,
    batch: cleanBatch,
    session_date,
    start_time,
    end_time,
    lecture_type,
    room_no: room_no || null,
    duration_minutes: parseInt(duration_minutes, 10) || 5,
    expires_at,
    is_active: 1,
    student_qr_visible: student_qr_visible ? 1 : 0
  };
};

/**
 * Expire past QR sessions where expires_at <= NOW() and is_active = 1
 * @param {number|null} [teacherId=null]
 * @returns {Promise<number>}
 */
const expirePastQRSessions = async (teacherId = null) => {
  const where = ['is_active = 1', 'expires_at <= NOW()'];
  const params = [];
  if (teacherId) {
    where.push('teacher_id = ?');
    params.push(parseInt(teacherId, 10));
  }
  const sql = `UPDATE attendance_sessions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE ${where.join(' AND ')}`;
  const [result] = await pool.query(sql, params);
  return result.affectedRows;
};

/**
 * Find active QR session for a teacher (and optionally specific course)
 * Excludes expired sessions (expires_at > NOW()) and performs lazy expiration
 * @param {number} teacherId
 * @param {number|null} [courseId=null]
 * @returns {Promise<Object|null>}
 */
const findActiveQRSessionByTeacher = async (teacherId, courseId = null) => {
  const tid = parseInt(teacherId, 10);
  if (isNaN(tid) || tid <= 0) return null;

  // Lazily deactivate past expired sessions for this teacher
  await expirePastQRSessions(tid);

  const where = ['s.teacher_id = ?', 's.is_active = 1', 's.expires_at > NOW()'];
  const params = [tid];

  if (courseId) {
    where.push('s.course_id = ?');
    params.push(parseInt(courseId, 10));
  }

  const sql = `
    SELECT 
      s.session_id,
      s.session_uuid,
      s.teacher_id,
      s.course_id,
      s.timetable_id,
      s.batch,
      DATE_FORMAT(s.session_date, '%Y-%m-%d') AS session_date,
      DATE_FORMAT(s.start_time, '%H:%i:%s') AS start_time,
      DATE_FORMAT(s.end_time, '%H:%i:%s') AS end_time,
      s.lecture_type,
      s.room_no,
      s.duration_minutes,
      s.expires_at,
      s.is_active,
      s.student_qr_visible,
      s.created_at,
      s.updated_at,
      c.course_code,
      c.course_name,
      c.semester,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name
    FROM attendance_sessions s
    INNER JOIN courses c ON s.course_id = c.course_id
    INNER JOIN teachers t ON s.teacher_id = t.teacher_id
    INNER JOIN users u ON t.user_id = u.user_id
    WHERE ${where.join(' AND ')}
    ORDER BY s.session_id DESC
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
};

/**
 * Find active QR session for an enrolled student matching their specific batch
 * Checks if the student is actively enrolled in the course
 * Excludes expired sessions (expires_at > NOW()) and performs lazy expiration
 * Never exposes qr_secret
 * @param {number} studentId
 * @returns {Promise<Object|null>}
 */
const findActiveQRSessionForStudent = async (studentId) => {
  const sid = parseInt(studentId, 10);
  if (isNaN(sid) || sid <= 0) return null;

  // Lazily deactivate past expired sessions
  await expirePastQRSessions();

  // Retrieve student record to get batch and division
  const [studRows] = await pool.query(
    'SELECT student_id, batch, division FROM students WHERE student_id = ? LIMIT 1',
    [sid]
  );
  if (!studRows || studRows.length === 0) return null;

  const studentRecord = studRows[0];
  const studentBatch = studentRecord.batch || studentRecord.division;

  const sql = `
    SELECT 
      s.session_id,
      s.session_uuid,
      s.teacher_id,
      s.course_id,
      s.timetable_id,
      s.batch,
      DATE_FORMAT(s.session_date, '%Y-%m-%d') AS session_date,
      DATE_FORMAT(s.start_time, '%H:%i:%s') AS start_time,
      DATE_FORMAT(s.end_time, '%H:%i:%s') AS end_time,
      s.lecture_type,
      s.room_no,
      s.duration_minutes,
      s.expires_at,
      s.is_active,
      s.student_qr_visible,
      s.created_at,
      s.updated_at,
      c.course_code,
      c.course_name,
      c.semester,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name
    FROM attendance_sessions s
    INNER JOIN enrollments e ON s.course_id = e.course_id
    INNER JOIN courses c ON s.course_id = c.course_id
    INNER JOIN teachers t ON s.teacher_id = t.teacher_id
    INNER JOIN users u ON t.user_id = u.user_id
    WHERE e.student_id = ?
      AND e.status = 'Enrolled'
      AND s.is_active = 1
      AND s.expires_at > NOW()
    ORDER BY s.session_id DESC
  `;
  const [rows] = await pool.query(sql, [sid]);

  // Return the first active session matching the student's batch
  for (const session of rows) {
    if (isBatchMatching(studentBatch, session.batch)) {
      return session;
    }
  }

  return null;
};

/**
 * Find QR session by session_id or session_uuid (never exposes qr_secret)
 * @param {string|number} sessionIdOrUuid
 * @returns {Promise<Object|null>}
 */
const findQRSessionById = async (sessionIdOrUuid) => {
  if (!sessionIdOrUuid) return null;
  const isNumeric = !isNaN(sessionIdOrUuid) && String(sessionIdOrUuid).trim() !== '';

  const where = isNumeric ? 's.session_id = ?' : 's.session_uuid = ?';
  const param = isNumeric ? parseInt(sessionIdOrUuid, 10) : String(sessionIdOrUuid).trim();

  const sql = `
    SELECT 
      s.session_id,
      s.session_uuid,
      s.teacher_id,
      s.course_id,
      s.timetable_id,
      s.batch,
      DATE_FORMAT(s.session_date, '%Y-%m-%d') AS session_date,
      DATE_FORMAT(s.start_time, '%H:%i:%s') AS start_time,
      DATE_FORMAT(s.end_time, '%H:%i:%s') AS end_time,
      s.lecture_type,
      s.room_no,
      s.duration_minutes,
      s.expires_at,
      s.is_active,
      s.student_qr_visible,
      s.created_at,
      s.updated_at,
      c.course_code,
      c.course_name,
      c.semester,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name
    FROM attendance_sessions s
    INNER JOIN courses c ON s.course_id = c.course_id
    INNER JOIN teachers t ON s.teacher_id = t.teacher_id
    INNER JOIN users u ON t.user_id = u.user_id
    WHERE ${where}
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [param]);
  return rows[0] || null;
};

/**
 * Find internal QR session data including qr_secret
 * STRICTLY FOR INTERNAL SERVER-SIDE CRYPTOGRAPHIC OPERATIONS ONLY
 * NEVER RETURN THIS OBJECT DIRECTLY IN API RESPONSES
 * @param {string|number} sessionIdOrUuid
 * @returns {Promise<Object|null>}
 */
const findQRSessionInternal = async (sessionIdOrUuid) => {
  if (!sessionIdOrUuid) return null;
  const isNumeric = !isNaN(sessionIdOrUuid) && String(sessionIdOrUuid).trim() !== '';

  const where = isNumeric ? 's.session_id = ?' : 's.session_uuid = ?';
  const param = isNumeric ? parseInt(sessionIdOrUuid, 10) : String(sessionIdOrUuid).trim();

  const sql = `
    SELECT 
      s.session_id,
      s.session_uuid,
      s.teacher_id,
      s.course_id,
      s.timetable_id,
      s.batch,
      DATE_FORMAT(s.session_date, '%Y-%m-%d') AS session_date,
      DATE_FORMAT(s.start_time, '%H:%i:%s') AS start_time,
      DATE_FORMAT(s.end_time, '%H:%i:%s') AS end_time,
      s.lecture_type,
      s.room_no,
      s.duration_minutes,
      s.expires_at,
      s.is_active,
      s.student_qr_visible,
      s.qr_secret,
      s.created_at,
      s.updated_at,
      c.course_code,
      c.course_name,
      c.semester,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name
    FROM attendance_sessions s
    INNER JOIN courses c ON s.course_id = c.course_id
    INNER JOIN teachers t ON s.teacher_id = t.teacher_id
    INNER JOIN users u ON t.user_id = u.user_id
    WHERE ${where}
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [param]);
  return rows[0] || null;
};

/**
 * Close a QR attendance session safely
 * @param {string|number} sessionIdOrUuid
 * @param {number|null} [teacherId=null]
 * @returns {Promise<boolean>}
 */
const closeQRSession = async (sessionIdOrUuid, teacherId = null) => {
  if (!sessionIdOrUuid) return false;
  const isNumeric = !isNaN(sessionIdOrUuid) && String(sessionIdOrUuid).trim() !== '';

  const where = [isNumeric ? 'session_id = ?' : 'session_uuid = ?'];
  const params = [isNumeric ? parseInt(sessionIdOrUuid, 10) : String(sessionIdOrUuid).trim()];

  if (teacherId) {
    where.push('teacher_id = ?');
    params.push(parseInt(teacherId, 10));
  }

  const sql = `
    UPDATE attendance_sessions 
    SET is_active = 0, updated_at = CURRENT_TIMESTAMP 
    WHERE ${where.join(' AND ')}
  `;
  const [result] = await pool.query(sql, params);
  return result.affectedRows > 0;
};

/**
 * Update student QR visibility for an active session
 * Strictly scoped to teacher_id to prevent IDOR
 * @param {string|number} sessionId
 * @param {number} teacherId
 * @param {boolean|number} isVisible
 * @returns {Promise<boolean>}
 */
const updateQRStudentVisibility = async (sessionId, teacherId, isVisible) => {
  if (!sessionId || !teacherId) return false;
  const isNumeric = !isNaN(sessionId) && String(sessionId).trim() !== '';
  const where = isNumeric ? 'session_id = ?' : 'session_uuid = ?';
  const param = isNumeric ? parseInt(sessionId, 10) : String(sessionId).trim();
  const tid = parseInt(teacherId, 10);

  const sql = `
    UPDATE attendance_sessions 
    SET student_qr_visible = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE ${where} AND teacher_id = ? AND is_active = 1
  `;
  const [result] = await pool.query(sql, [isVisible ? 1 : 0, param, tid]);
  return result.affectedRows > 0;
};

module.exports = {
  LOW_ATTENDANCE_THRESHOLD,
  ALLOWED_STATUSES,
  ALLOWED_LECTURE_TYPES,
  PREDEFINED_PERIODS,
  formatTimeTo12Hour,
  formatTimeRange,
  formatDate,
  encodeSessionId,
  decodeSessionId,
  getAttendance,
  findById,
  checkDuplicate,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceSessions,
  getSessionDetails,
  updateSessionAttendance,
  deleteSessionAttendance,
  getAttendanceSummary,
  getStudentAttendance,
  getCourseAttendance,
  checkStudentEnrollment,
  checkTeacherCourseAssignment,
  isStudentInTeacherCourses,
  createQRSession,
  expirePastQRSessions,
  findActiveQRSessionByTeacher,
  findActiveQRSessionForStudent,
  findQRSessionById,
  findQRSessionInternal,
  closeQRSession,
  updateQRStudentVisibility,
  normalizeBatch,
  isBatchMatching
};


