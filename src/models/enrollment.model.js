const pool = require('../config/db');

/**
 * Get paginated, searchable, filterable list of enrollments
 * @param {Object} options
 * @returns {Promise<{ enrollments: Array, pagination: Object }>}
 */
const getEnrollments = async ({
  page = 1,
  limit = 10,
  search = '',
  student_id = '',
  course_id = '',
  department_id = '',
  academic_year = '',
  semester = '',
  status = '',
  all = false
}) => {
  const whereConditions = [];
  const queryParams = [];

  // Search filter: PRN, student name, username, course code, course name
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push(`(
      s.prn_number LIKE ? OR 
      u.first_name LIKE ? OR 
      u.last_name LIKE ? OR 
      u.username LIKE ? OR 
      c.course_code LIKE ? OR 
      c.course_name LIKE ?
    )`);
    queryParams.push(term, term, term, term, term, term);
  }

  // Filter by student
  if (student_id !== '' && student_id !== undefined && student_id !== null) {
    whereConditions.push('e.student_id = ?');
    queryParams.push(parseInt(student_id, 10));
  }

  // Filter by course
  if (course_id !== '' && course_id !== undefined && course_id !== null) {
    whereConditions.push('e.course_id = ?');
    queryParams.push(parseInt(course_id, 10));
  }

  // Filter by department (course's or student's department)
  if (department_id !== '' && department_id !== undefined && department_id !== null) {
    whereConditions.push('(c.department_id = ? OR s.department_id = ?)');
    queryParams.push(parseInt(department_id, 10), parseInt(department_id, 10));
  }

  // Filter by academic year
  if (academic_year && academic_year.trim()) {
    whereConditions.push('e.academic_year = ?');
    queryParams.push(academic_year.trim());
  }

  // Filter by semester
  if (semester !== '' && semester !== undefined && semester !== null) {
    whereConditions.push('e.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  // Filter by status ('Enrolled', 'Dropped', 'Completed')
  if (status && status.trim()) {
    whereConditions.push('e.status = ?');
    queryParams.push(status.trim());
  }

  const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Total matching count
  const countSql = `
    SELECT COUNT(*) as total
    FROM enrollments e
    INNER JOIN students s ON e.student_id = s.student_id
    INNER JOIN users u ON s.user_id = u.user_id
    INNER JOIN courses c ON e.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    ${whereSql}
  `;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = countRows[0].total;

  // If caller requested all records
  if (all) {
    const allSql = `
      SELECT 
        e.enrollment_id,
        e.student_id,
        e.course_id,
        e.academic_year,
        e.semester,
        e.enrollment_date,
        e.status,
        e.created_at,
        e.updated_at,
        s.prn_number,
        s.prn_number AS enrollment_number,
        s.class_name,
        s.division,
        u.user_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email,
        u.is_active AS student_is_active,
        c.course_code,
        c.course_name,
        c.credits,
        c.course_type,
        d.department_id,
        d.department_name,
        d.department_code
      FROM enrollments e
      INNER JOIN students s ON e.student_id = s.student_id
      INNER JOIN users u ON s.user_id = u.user_id
      INNER JOIN courses c ON e.course_id = c.course_id
      INNER JOIN departments d ON c.department_id = d.department_id
      ${whereSql}
      ORDER BY e.enrollment_id DESC
    `;
    const [allRows] = await pool.query(allSql, queryParams);
    return {
      enrollments: allRows,
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

  const dataSql = `
    SELECT 
      e.enrollment_id,
      e.student_id,
      e.course_id,
      e.academic_year,
      e.semester,
      e.enrollment_date,
      e.status,
      e.created_at,
      e.updated_at,
      s.prn_number,
      s.prn_number AS enrollment_number,
      s.class_name,
      s.division,
      u.user_id,
      u.first_name,
      u.last_name,
      u.username,
      u.email,
      u.is_active AS student_is_active,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      d.department_id,
      d.department_name,
      d.department_code
    FROM enrollments e
    INNER JOIN students s ON e.student_id = s.student_id
    INNER JOIN users u ON s.user_id = u.user_id
    INNER JOIN courses c ON e.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    ${whereSql}
    ORDER BY e.enrollment_id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(dataSql, [...queryParams, safeLimit, offset]);

  return {
    enrollments: rows,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages
    }
  };
};

/**
 * Find single enrollment by ID with full student, course, department, and academic record details
 * @param {number} enrollmentId
 * @returns {Promise<Object|null>}
 */
const findById = async (enrollmentId) => {
  const sql = `
    SELECT 
      e.enrollment_id,
      e.student_id,
      e.course_id,
      e.academic_year,
      e.semester,
      e.enrollment_date,
      e.status,
      e.created_at,
      e.updated_at,
      s.prn_number,
      s.prn_number AS enrollment_number,
      s.class_name,
      s.division,
      s.admission_date,
      u.user_id,
      u.first_name,
      u.last_name,
      u.username,
      u.email,
      u.phone,
      u.is_active AS student_is_active,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      c.academic_year AS course_academic_year,
      c.semester AS course_semester,
      d.department_id,
      d.department_name,
      d.department_code,
      (SELECT COUNT(*) FROM attendance a WHERE a.student_id = e.student_id AND a.course_id = e.course_id) AS attendance_count,
      (SELECT COUNT(*) FROM grades g WHERE g.student_id = e.student_id AND g.course_id = e.course_id) AS grades_count
    FROM enrollments e
    INNER JOIN students s ON e.student_id = s.student_id
    INNER JOIN users u ON s.user_id = u.user_id
    INNER JOIN courses c ON e.course_id = c.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    WHERE e.enrollment_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [enrollmentId]);
  return rows[0] || null;
};

/**
 * Check if an enrollment already exists for student, course, and academic year
 * Matches unique constraint uk_enrollment_student_course_year (student_id, course_id, academic_year)
 * @param {number} studentId
 * @param {number} courseId
 * @param {string} academicYear
 * @param {number|null} excludeEnrollmentId
 * @returns {Promise<Object|null>}
 */
const findDuplicate = async (studentId, courseId, academicYear, excludeEnrollmentId = null) => {
  let sql = `
    SELECT enrollment_id, student_id, course_id, academic_year, semester, status 
    FROM enrollments 
    WHERE student_id = ? AND course_id = ? AND academic_year = ?
  `;
  const params = [studentId, courseId, academicYear.trim()];

  if (excludeEnrollmentId) {
    sql += ' AND enrollment_id != ?';
    params.push(excludeEnrollmentId);
  }

  sql += ' LIMIT 1';
  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
};

/**
 * Create a new enrollment record
 * @param {Object} data
 * @returns {Promise<number>} inserted enrollment_id
 */
const createEnrollment = async ({
  student_id,
  course_id,
  academic_year,
  semester,
  enrollment_date,
  status = 'Enrolled'
}) => {
  const sql = `
    INSERT INTO enrollments (
      student_id,
      course_id,
      academic_year,
      semester,
      enrollment_date,
      status
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;

  const safeDate = enrollment_date && String(enrollment_date).trim() 
    ? String(enrollment_date).trim() 
    : new Date().toISOString().split('T')[0];

  const [result] = await pool.query(sql, [
    student_id,
    course_id,
    academic_year.trim(),
    parseInt(semester, 10),
    safeDate,
    status
  ]);

  return result.insertId;
};

/**
 * Update enrollment fields
 * @param {number} enrollmentId
 * @param {Object} fields
 * @returns {Promise<boolean>}
 */
const updateEnrollment = async (enrollmentId, fields) => {
  const allowedKeys = [
    'student_id',
    'course_id',
    'academic_year',
    'semester',
    'enrollment_date',
    'status'
  ];

  const setClauses = [];
  const queryParams = [];

  for (const [key, val] of Object.entries(fields)) {
    if (allowedKeys.includes(key)) {
      setClauses.push(`${key} = ?`);
      if (key === 'student_id' || key === 'course_id' || key === 'semester') {
        queryParams.push(parseInt(val, 10));
      } else {
        queryParams.push(typeof val === 'string' ? val.trim() : val);
      }
    }
  }

  if (setClauses.length === 0) return false;

  queryParams.push(enrollmentId);
  const sql = `UPDATE enrollments SET ${setClauses.join(', ')} WHERE enrollment_id = ?`;
  const [result] = await pool.query(sql, queryParams);
  return result.affectedRows > 0;
};

/**
 * Update only enrollment status
 * @param {number} enrollmentId
 * @param {string} status
 * @returns {Promise<boolean>}
 */
const updateStatus = async (enrollmentId, status) => {
  const sql = 'UPDATE enrollments SET status = ? WHERE enrollment_id = ?';
  const [result] = await pool.query(sql, [status, enrollmentId]);
  return result.affectedRows > 0;
};

/**
 * Inspect dependencies for safe deletion
 * Checks attendance and grades records for this (student_id, course_id)
 * Also checks any foreign keys pointing to enrollments
 * @param {number} enrollmentId
 * @returns {Promise<{ hasDependencies: boolean, details: Object }>}
 */
const checkEnrollmentDependencies = async (enrollmentId) => {
  const enrollment = await findById(enrollmentId);
  if (!enrollment) {
    return { hasDependencies: false, details: {} };
  }

  // 1. Check linked attendance records for this student and course
  const [attRows] = await pool.query(
    'SELECT COUNT(*) as count FROM attendance WHERE student_id = ? AND course_id = ?',
    [enrollment.student_id, enrollment.course_id]
  );
  const attendanceCount = attRows[0]?.count || 0;

  // 2. Check linked grades records for this student and course
  const [gradeRows] = await pool.query(
    'SELECT COUNT(*) as count FROM grades WHERE student_id = ? AND course_id = ?',
    [enrollment.student_id, enrollment.course_id]
  );
  const gradesCount = gradeRows[0]?.count || 0;

  // 3. Check any foreign keys in database schema referencing enrollments
  const [fkRows] = await pool.query(`
    SELECT COUNT(*) as count 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE CONSTRAINT_SCHEMA = 'student_portal_db' 
      AND REFERENCED_TABLE_NAME = 'enrollments'
  `);
  const fkCount = fkRows[0]?.count || 0;

  const total = attendanceCount + gradesCount + fkCount;

  return {
    hasDependencies: total > 0,
    totalDependencies: total,
    details: {
      attendance: attendanceCount,
      grades: gradesCount,
      foreignKeys: fkCount
    }
  };
};

/**
 * Delete enrollment by ID
 * @param {number} enrollmentId
 * @returns {Promise<boolean>}
 */
const deleteEnrollment = async (enrollmentId) => {
  const sql = 'DELETE FROM enrollments WHERE enrollment_id = ?';
  const [result] = await pool.query(sql, [enrollmentId]);
  return result.affectedRows > 0;
};

module.exports = {
  getEnrollments,
  findById,
  findDuplicate,
  createEnrollment,
  updateEnrollment,
  updateStatus,
  checkEnrollmentDependencies,
  deleteEnrollment
};
