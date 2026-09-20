const pool = require('../config/db');

/**
 * Get paginated, searchable, filterable list of courses
 * @param {Object} options
 * @returns {Promise<{ courses: Array, pagination: Object }>}
 */
const getCourses = async ({
  page = 1,
  limit = 10,
  search = '',
  department_id = '',
  course_type = '',
  status = '',
  all = false,
  teacher_id = ''
}) => {
  const whereConditions = [];
  const queryParams = [];

  // Search filter: course code, course name, department code, department name
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push(`(
      c.course_code LIKE ? OR 
      c.course_name LIKE ? OR 
      d.department_code LIKE ? OR 
      d.department_name LIKE ?
    )`);
    queryParams.push(term, term, term, term);
  }

  // Filter by department
  if (department_id !== '' && department_id !== undefined && department_id !== null) {
    whereConditions.push('c.department_id = ?');
    queryParams.push(parseInt(department_id, 10));
  }

  // Filter by assigned teacher via timetable
  if (teacher_id !== '' && teacher_id !== undefined && teacher_id !== null) {
    whereConditions.push(`c.course_id IN (
      SELECT DISTINCT tt.course_id FROM timetable tt WHERE tt.teacher_id = ?
    )`);
    queryParams.push(parseInt(teacher_id, 10));
  }

  // Filter by course type ('Theory', 'Practical', 'Combined')
  if (course_type && course_type.trim()) {
    whereConditions.push('c.course_type = ?');
    queryParams.push(course_type.trim());
  }

  // Filter by department active status if status provided
  if (status !== '' && status !== undefined && status !== null) {
    const isActive = (status === '1' || status === 'true' || status === 1 || status === true) ? 1 : 0;
    whereConditions.push('d.is_active = ?');
    queryParams.push(isActive);
  }

  const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Total matching count
  const countSql = `
    SELECT COUNT(*) as total
    FROM courses c
    INNER JOIN departments d ON c.department_id = d.department_id
    ${whereSql}
  `;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = countRows[0].total;

  // If caller requested all records (e.g. for dropdowns)
  if (all) {
    const allSql = `
      SELECT 
        c.course_id,
        c.course_code,
        c.course_name,
        c.department_id,
        c.credits,
        c.course_type,
        c.academic_year,
        c.semester,
        c.created_at,
        c.updated_at,
        d.department_code,
        d.department_name,
        d.is_active AS department_is_active
      FROM courses c
      INNER JOIN departments d ON c.department_id = d.department_id
      ${whereSql}
      ORDER BY c.course_code ASC
    `;
    const [allRows] = await pool.query(allSql, queryParams);
    return {
      courses: allRows,
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
      c.course_id,
      c.course_code,
      c.course_name,
      c.department_id,
      c.credits,
      c.course_type,
      c.academic_year,
      c.semester,
      c.created_at,
      c.updated_at,
      d.department_code,
      d.department_name,
      d.is_active AS department_is_active,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.course_id) AS enrollment_count
    FROM courses c
    INNER JOIN departments d ON c.department_id = d.department_id
    ${whereSql}
    ORDER BY c.course_id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(dataSql, [...queryParams, safeLimit, offset]);

  return {
    courses: rows,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages
    }
  };
};

/**
 * Find single course by ID with detailed department and dependency counts
 * @param {number} courseId
 * @returns {Promise<Object|null>}
 */
const findById = async (courseId) => {
  const sql = `
    SELECT 
      c.course_id,
      c.course_code,
      c.course_name,
      c.department_id,
      c.credits,
      c.course_type,
      c.academic_year,
      c.semester,
      c.created_at,
      c.updated_at,
      d.department_code,
      d.department_name,
      d.is_active AS department_is_active,
      (SELECT COUNT(*) FROM enrollments WHERE course_id = c.course_id) AS enrollment_count,
      (SELECT COUNT(*) FROM attendance WHERE course_id = c.course_id) AS attendance_count,
      (SELECT COUNT(*) FROM grades WHERE course_id = c.course_id) AS grade_count,
      (SELECT COUNT(*) FROM timetable WHERE course_id = c.course_id) AS timetable_count,
      (SELECT COUNT(*) FROM assignments WHERE course_id = c.course_id) AS assignment_count,
      (SELECT COUNT(*) FROM study_materials WHERE course_id = c.course_id) AS material_count,
      (SELECT COUNT(*) FROM queries WHERE course_id = c.course_id) AS query_count
    FROM courses c
    INNER JOIN departments d ON c.department_id = d.department_id
    WHERE c.course_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [courseId]);
  return rows[0] || null;
};

/**
 * Find single course by code
 * @param {string} courseCode
 * @returns {Promise<Object|null>}
 */
const findByCode = async (courseCode) => {
  const sql = `
    SELECT course_id, course_code, course_name, department_id, credits, course_type, academic_year, semester
    FROM courses 
    WHERE course_code = ? 
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [courseCode.trim().toUpperCase()]);
  return rows[0] || null;
};

/**
 * Create a new course record
 * @param {Object} courseData
 * @returns {Promise<number>} inserted course_id
 */
const createCourse = async ({
  course_code,
  course_name,
  department_id,
  credits,
  course_type,
  academic_year,
  semester
}) => {
  const sql = `
    INSERT INTO courses (
      course_code,
      course_name,
      department_id,
      credits,
      course_type,
      academic_year,
      semester
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await pool.query(sql, [
    course_code.trim().toUpperCase(),
    course_name.trim(),
    department_id,
    parseFloat(credits),
    course_type,
    academic_year ? academic_year.trim() : '2025-2026',
    parseInt(semester, 10) || 1
  ]);

  return result.insertId;
};

/**
 * Update course fields
 * @param {number} courseId
 * @param {Object} fields
 * @returns {Promise<boolean>}
 */
const updateCourse = async (courseId, fields) => {
  const allowedKeys = [
    'course_code',
    'course_name',
    'department_id',
    'credits',
    'course_type',
    'academic_year',
    'semester'
  ];

  const setClauses = [];
  const queryParams = [];

  for (const [key, val] of Object.entries(fields)) {
    if (allowedKeys.includes(key)) {
      setClauses.push(`${key} = ?`);
      if (key === 'course_code') {
        queryParams.push(String(val).trim().toUpperCase());
      } else if (key === 'credits') {
        queryParams.push(parseFloat(val));
      } else if (key === 'department_id' || key === 'semester') {
        queryParams.push(parseInt(val, 10));
      } else {
        queryParams.push(typeof val === 'string' ? val.trim() : val);
      }
    }
  }

  if (setClauses.length === 0) return false;

  queryParams.push(courseId);
  const sql = `UPDATE courses SET ${setClauses.join(', ')} WHERE course_id = ?`;
  const [result] = await pool.query(sql, queryParams);
  return result.affectedRows > 0;
};

/**
 * Inspect live foreign-key dependencies across all 7 referencing tables
 * @param {number} courseId
 * @returns {Promise<{ hasDependencies: boolean, details: Object }>}
 */
const checkCourseDependencies = async (courseId) => {
  const sql = `
    SELECT 
      (SELECT COUNT(*) FROM enrollments WHERE course_id = ?) AS enrollments_count,
      (SELECT COUNT(*) FROM attendance WHERE course_id = ?) AS attendance_count,
      (SELECT COUNT(*) FROM grades WHERE course_id = ?) AS grades_count,
      (SELECT COUNT(*) FROM timetable WHERE course_id = ?) AS timetable_count,
      (SELECT COUNT(*) FROM assignments WHERE course_id = ?) AS assignments_count,
      (SELECT COUNT(*) FROM study_materials WHERE course_id = ?) AS study_materials_count,
      (SELECT COUNT(*) FROM queries WHERE course_id = ?) AS queries_count
  `;

  const [rows] = await pool.query(sql, [courseId, courseId, courseId, courseId, courseId, courseId, courseId]);
  const counts = rows[0] || {};

  const total = (
    parseInt(counts.enrollments_count || 0, 10) +
    parseInt(counts.attendance_count || 0, 10) +
    parseInt(counts.grades_count || 0, 10) +
    parseInt(counts.timetable_count || 0, 10) +
    parseInt(counts.assignments_count || 0, 10) +
    parseInt(counts.study_materials_count || 0, 10) +
    parseInt(counts.queries_count || 0, 10)
  );

  return {
    hasDependencies: total > 0,
    totalDependencies: total,
    details: {
      enrollments: parseInt(counts.enrollments_count || 0, 10),
      attendance: parseInt(counts.attendance_count || 0, 10),
      grades: parseInt(counts.grades_count || 0, 10),
      timetable: parseInt(counts.timetable_count || 0, 10),
      assignments: parseInt(counts.assignments_count || 0, 10),
      study_materials: parseInt(counts.study_materials_count || 0, 10),
      queries: parseInt(counts.queries_count || 0, 10)
    }
  };
};

/**
 * Safe delete course by ID
 * @param {number} courseId
 * @returns {Promise<boolean>}
 */
const deleteCourse = async (courseId) => {
  const sql = 'DELETE FROM courses WHERE course_id = ?';
  const [result] = await pool.query(sql, [courseId]);
  return result.affectedRows > 0;
};

/**
 * Get distinct courses assigned to a teacher via the timetable
 * @param {number} teacherId
 * @returns {Promise<Array>}
 */
const getTeacherAssignedCourses = async (teacherId) => {
  const tid = parseInt(teacherId, 10);
  if (isNaN(tid) || tid <= 0) return [];

  const sql = `
    SELECT DISTINCT 
      c.course_id,
      c.course_code,
      c.course_name,
      c.department_id,
      c.credits,
      c.course_type,
      c.academic_year,
      c.semester,
      c.created_at,
      c.updated_at,
      d.department_code,
      d.department_name,
      d.is_active AS department_is_active
    FROM courses c
    INNER JOIN timetable tt ON c.course_id = tt.course_id
    INNER JOIN departments d ON c.department_id = d.department_id
    WHERE tt.teacher_id = ?
    ORDER BY c.course_code ASC
  `;
  const [rows] = await pool.query(sql, [tid]);
  return rows;
};

module.exports = {
  getCourses,
  findById,
  findByCode,
  createCourse,
  updateCourse,
  checkCourseDependencies,
  deleteCourse,
  getTeacherAssignedCourses
};
