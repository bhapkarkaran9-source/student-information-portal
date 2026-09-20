const pool = require('../config/db');

/**
 * Official Grading Scale Mapping
 * Marks / %    Grade    Grade Point   Status
 * 90–100       O        10            Pass
 * 80–89.99     A+       9             Pass
 * 70–79.99     A        8             Pass
 * 60–69.99     B+       7             Pass
 * 50–59.99     B        6             Pass
 * 45–49.99     C        5             Pass
 * 40–44.99     P        4             Pass
 * Below 40     F        0             Fail
 * Pass Mark = 40.00%
 */
const calculateGradeAndPoints = (percentage) => {
  const pct = Math.round(Number(percentage) * 100) / 100;
  if (pct >= 90.0) return { letter_grade: 'O', grade_point: 10, status: 'Pass' };
  if (pct >= 80.0) return { letter_grade: 'A+', grade_point: 9, status: 'Pass' };
  if (pct >= 70.0) return { letter_grade: 'A', grade_point: 8, status: 'Pass' };
  if (pct >= 60.0) return { letter_grade: 'B+', grade_point: 7, status: 'Pass' };
  if (pct >= 50.0) return { letter_grade: 'B', grade_point: 6, status: 'Pass' };
  if (pct >= 45.0) return { letter_grade: 'C', grade_point: 5, status: 'Pass' };
  if (pct >= 40.0) return { letter_grade: 'P', grade_point: 4, status: 'Pass' };
  return { letter_grade: 'F', grade_point: 0, status: 'Fail' };
};

/**
 * Helper to normalize numeric values and computed properties in grade rows
 */
const formatGradeRow = (r) => {
  if (!r) return null;
  const percentage = r.percentage !== null && r.percentage !== undefined ? parseFloat(r.percentage) : 0.0;
  const gradePoint = r.grade_point !== null && r.grade_point !== undefined ? parseInt(r.grade_point, 10) : 0;
  const credits = r.credits !== null && r.credits !== undefined ? parseFloat(r.credits) : 0.0;

  let assessmentName = null;
  if (r.remarks) {
    const match = r.remarks.match(/^\[(.*?)\](?:\s*(.*))?$/);
    if (match) {
      assessmentName = match[1];
    }
  }

  return {
    ...r,
    internal_marks: parseFloat(r.internal_marks) || 0.0,
    external_marks: parseFloat(r.external_marks) || 0.0,
    practical_marks: parseFloat(r.practical_marks) || 0.0,
    total_marks: parseFloat(r.total_marks) || 0.0,
    max_marks: parseFloat(r.max_marks) || 100.0,
    percentage,
    grade_point: gradePoint,
    credits,
    status: percentage >= 40.0 ? 'Pass' : 'Fail',
    assessment_name: assessmentName
  };
};

/**
 * Fetch paginated, searchable, filtered list of grades
 */
const getGrades = async ({
  page = 1,
  limit = 10,
  search = '',
  student_id = '',
  course_id = '',
  department_id = '',
  semester = '',
  exam_session = '',
  assessment_type = '',
  result_status = ''
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const whereConditions = [];
  const queryParams = [];

  // Search by student name, PRN, course code, or course name
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push(`(
      u_s.first_name LIKE ? OR u_s.last_name LIKE ? OR
      CONCAT(u_s.first_name, ' ', u_s.last_name) LIKE ? OR
      s.prn_number LIKE ? OR
      c.course_code LIKE ? OR c.course_name LIKE ?
    )`);
    queryParams.push(term, term, term, term, term, term);
  }

  // Filter by student_id
  if (student_id) {
    whereConditions.push('g.student_id = ?');
    queryParams.push(parseInt(student_id, 10));
  }

  // Filter by course_id
  if (course_id) {
    whereConditions.push('g.course_id = ?');
    queryParams.push(parseInt(course_id, 10));
  }

  // Filter by department_id
  if (department_id) {
    whereConditions.push('(c.department_id = ? OR s.department_id = ?)');
    queryParams.push(parseInt(department_id, 10), parseInt(department_id, 10));
  }

  // Filter by semester
  if (semester) {
    whereConditions.push('c.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  // Filter by exam_session
  if (exam_session && exam_session.trim()) {
    whereConditions.push('g.exam_session = ?');
    queryParams.push(exam_session.trim());
  }

  // Filter by assessment_type (Theory / Practical)
  if (assessment_type && assessment_type.trim()) {
    whereConditions.push('g.assessment_type = ?');
    queryParams.push(assessment_type.trim());
  }

  // Filter by result_status (Pass / Fail)
  if (result_status && result_status.trim()) {
    const statusUpper = result_status.trim().toUpperCase();
    if (statusUpper === 'PASS') {
      whereConditions.push('g.percentage >= 40.00');
    } else if (statusUpper === 'FAIL') {
      whereConditions.push('g.percentage < 40.00');
    }
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Total count query
  const countSql = `
    SELECT COUNT(*) AS total
    FROM grades g
    INNER JOIN students s ON g.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    INNER JOIN courses c ON g.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    ${whereClause}
  `;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = countRows[0]?.total || 0;

  // 2. Data rows query
  const dataSql = `
    SELECT 
      g.grade_id,
      g.student_id,
      g.course_id,
      g.teacher_id,
      g.assessment_type,
      g.internal_marks,
      g.external_marks,
      g.practical_marks,
      g.total_marks,
      g.max_marks,
      g.percentage,
      g.letter_grade,
      g.grade_point,
      g.exam_session,
      g.remarks,
      g.created_at,
      g.updated_at,
      s.prn_number,
      s.prn_number AS enrollment_number,
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
      c.academic_year AS course_academic_year,
      d.department_id,
      d.department_name,
      d.department_code,
      t.employee_number AS teacher_employee_number,
      u_t.user_id AS teacher_user_id,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS teacher_name
    FROM grades g
    INNER JOIN students s ON g.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    INNER JOIN courses c ON g.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    LEFT JOIN teachers t ON g.teacher_id = t.teacher_id
    LEFT JOIN users u_t ON t.user_id = u_t.user_id
    ${whereClause}
    ORDER BY g.grade_id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(dataSql, [...queryParams, limitNum, offset]);
  const formattedRows = rows.map(formatGradeRow);
  const totalPages = Math.ceil(total / limitNum) || 1;

  return {
    grades: formattedRows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages
    }
  };
};

/**
 * Find single grade record by ID with joined details
 */
const findById = async (gradeId) => {
  const sql = `
    SELECT 
      g.grade_id,
      g.student_id,
      g.course_id,
      g.teacher_id,
      g.assessment_type,
      g.internal_marks,
      g.external_marks,
      g.practical_marks,
      g.total_marks,
      g.max_marks,
      g.percentage,
      g.letter_grade,
      g.grade_point,
      g.exam_session,
      g.remarks,
      g.created_at,
      g.updated_at,
      s.prn_number,
      s.prn_number AS enrollment_number,
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
      u_t.user_id AS teacher_user_id,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS teacher_name
    FROM grades g
    INNER JOIN students s ON g.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    INNER JOIN courses c ON g.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    LEFT JOIN teachers t ON g.teacher_id = t.teacher_id
    LEFT JOIN users u_t ON t.user_id = u_t.user_id
    WHERE g.grade_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [parseInt(gradeId, 10)]);
  if (!rows[0]) return null;
  return formatGradeRow(rows[0]);
};

/**
 * Check duplicate grade record
 * Unique constraint: uk_grades_student_course_session_type (student_id, course_id, exam_session, assessment_type)
 */
const checkDuplicate = async (studentId, courseId, examSession, assessmentType, excludeId = null) => {
  let sql = `
    SELECT grade_id, student_id, course_id, exam_session, assessment_type, letter_grade, total_marks
    FROM grades
    WHERE student_id = ? AND course_id = ? AND exam_session = ? AND assessment_type = ?
  `;
  const params = [parseInt(studentId, 10), parseInt(courseId, 10), examSession.trim(), assessmentType.trim()];

  if (excludeId) {
    sql += ' AND grade_id != ?';
    params.push(parseInt(excludeId, 10));
  }
  sql += ' LIMIT 1';

  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
};

/**
 * Verify active student enrollment for the course
 */
const checkStudentEnrollment = async (studentId, courseId) => {
  const sql = `
    SELECT enrollment_id, student_id, course_id, academic_year, semester, status
    FROM enrollments
    WHERE student_id = ? AND course_id = ? AND status = 'Enrolled'
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [parseInt(studentId, 10), parseInt(courseId, 10)]);
  return rows[0] || null;
};

/**
 * Create grade record with backend-authoritative calculation
 */
const createGrade = async ({
  student_id,
  course_id,
  teacher_id = null,
  assessment_type,
  internal_marks = 0.0,
  external_marks = 0.0,
  practical_marks = 0.0,
  max_marks = 100.0,
  exam_session,
  remarks = null
}) => {
  const maxMarksNum = parseFloat(max_marks) || 100.0;
  let intMarks = 0.0;
  let extMarks = 0.0;
  let pracMarks = 0.0;
  let totalMarks = 0.0;

  if (assessment_type === 'Theory') {
    intMarks = parseFloat(internal_marks) || 0.0;
    extMarks = parseFloat(external_marks) || 0.0;
    pracMarks = 0.0; // strict separation constraint
    totalMarks = intMarks + extMarks;
  } else if (assessment_type === 'Practical') {
    intMarks = 0.0; // strict separation constraint
    extMarks = 0.0; // strict separation constraint
    pracMarks = parseFloat(practical_marks) || 0.0;
    totalMarks = pracMarks;
  }

  // Calculate percentage, letter grade, grade point
  const percentage = Math.round(((totalMarks / maxMarksNum) * 100) * 100) / 100;
  const { letter_grade, grade_point } = calculateGradeAndPoints(percentage);

  const insertSql = `
    INSERT INTO grades (
      student_id,
      course_id,
      teacher_id,
      assessment_type,
      internal_marks,
      external_marks,
      practical_marks,
      total_marks,
      max_marks,
      percentage,
      letter_grade,
      grade_point,
      exam_session,
      remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await pool.query(insertSql, [
    parseInt(student_id, 10),
    parseInt(course_id, 10),
    teacher_id ? parseInt(teacher_id, 10) : null,
    assessment_type,
    intMarks,
    extMarks,
    pracMarks,
    totalMarks,
    maxMarksNum,
    percentage,
    letter_grade,
    grade_point,
    exam_session.trim(),
    remarks ? remarks.trim() : null
  ]);

  return findById(result.insertId);
};

/**
 * Update grade record with recalculations
 */
const updateGrade = async (gradeId, {
  teacher_id,
  assessment_type,
  internal_marks,
  external_marks,
  practical_marks,
  max_marks,
  exam_session,
  remarks
}) => {
  const current = await findById(gradeId);
  if (!current) return null;

  const finalType = assessment_type !== undefined ? assessment_type : current.assessment_type;
  const maxMarksNum = max_marks !== undefined ? parseFloat(max_marks) : current.max_marks;
  const finalSession = exam_session !== undefined ? exam_session.trim() : current.exam_session;
  const finalTeacherId = teacher_id !== undefined ? (teacher_id ? parseInt(teacher_id, 10) : null) : current.teacher_id;
  const finalRemarks = remarks !== undefined ? (remarks ? remarks.trim() : null) : current.remarks;

  let intMarks = 0.0;
  let extMarks = 0.0;
  let pracMarks = 0.0;
  let totalMarks = 0.0;

  if (finalType === 'Theory') {
    intMarks = internal_marks !== undefined ? parseFloat(internal_marks) : current.internal_marks;
    extMarks = external_marks !== undefined ? parseFloat(external_marks) : current.external_marks;
    pracMarks = 0.0;
    totalMarks = intMarks + extMarks;
  } else if (finalType === 'Practical') {
    intMarks = 0.0;
    extMarks = 0.0;
    pracMarks = practical_marks !== undefined ? parseFloat(practical_marks) : current.practical_marks;
    totalMarks = pracMarks;
  }

  const percentage = Math.round(((totalMarks / maxMarksNum) * 100) * 100) / 100;
  const { letter_grade, grade_point } = calculateGradeAndPoints(percentage);

  const updateSql = `
    UPDATE grades SET
      teacher_id = ?,
      assessment_type = ?,
      internal_marks = ?,
      external_marks = ?,
      practical_marks = ?,
      total_marks = ?,
      max_marks = ?,
      percentage = ?,
      letter_grade = ?,
      grade_point = ?,
      exam_session = ?,
      remarks = ?
    WHERE grade_id = ?
  `;

  await pool.query(updateSql, [
    finalTeacherId,
    finalType,
    intMarks,
    extMarks,
    pracMarks,
    totalMarks,
    maxMarksNum,
    percentage,
    letter_grade,
    grade_point,
    finalSession,
    finalRemarks,
    parseInt(gradeId, 10)
  ]);

  return findById(gradeId);
};

/**
 * Safely delete a grade record
 */
const deleteGrade = async (gradeId) => {
  const [result] = await pool.query('DELETE FROM grades WHERE grade_id = ?', [parseInt(gradeId, 10)]);
  return result.affectedRows > 0;
};

/**
 * Get student's grades with course details and SGPA foundation
 * SGPA = SUM(Credit * Grade Point) / SUM(Credit)
 */
const getStudentGrades = async (studentId, semester = '', examSession = '') => {
  // 1. Fetch student info
  const studentSql = `
    SELECT 
      s.student_id,
      s.prn_number,
      s.prn_number AS enrollment_number,
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

  // 2. Fetch grades for student with optional semester/session filter
  const conditions = ['g.student_id = ?'];
  const params = [parseInt(studentId, 10)];

  if (semester) {
    conditions.push('c.semester = ?');
    params.push(parseInt(semester, 10));
  }
  if (examSession && examSession.trim()) {
    conditions.push('g.exam_session = ?');
    params.push(examSession.trim());
  }

  const gradesSql = `
    SELECT 
      g.grade_id,
      g.student_id,
      g.course_id,
      g.teacher_id,
      g.assessment_type,
      g.internal_marks,
      g.external_marks,
      g.practical_marks,
      g.total_marks,
      g.max_marks,
      g.percentage,
      g.letter_grade,
      g.grade_point,
      g.exam_session,
      g.remarks,
      g.created_at,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      c.semester AS course_semester,
      c.academic_year AS course_academic_year,
      d.department_name,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS teacher_name
    FROM grades g
    INNER JOIN courses c ON g.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    LEFT JOIN teachers t ON g.teacher_id = t.teacher_id
    LEFT JOIN users u_t ON t.user_id = u_t.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.semester ASC, c.course_code ASC, g.assessment_type ASC
  `;
  const [gradeRows] = await pool.query(gradesSql, params);
  const grades = gradeRows.map(formatGradeRow);

  // 3. Compute SGPA Foundation and aggregated metrics
  // Group by course_id to handle courses with Theory and Practical evaluations properly
  let totalCredits = 0.0;
  let totalWeightedGradePoints = 0.0;
  let passedCoursesCount = 0;
  let failedCoursesCount = 0;

  const courseMap = new Map();

  grades.forEach(g => {
    if (!courseMap.has(g.course_id)) {
      courseMap.set(g.course_id, {
        course_id: g.course_id,
        course_code: g.course_code,
        course_name: g.course_name,
        credits: g.credits,
        grades: [],
        is_passed: true
      });
    }
    const cEntry = courseMap.get(g.course_id);
    cEntry.grades.push(g);
    if (g.letter_grade === 'F') {
      cEntry.is_passed = false;
    }
  });

  courseMap.forEach(cEntry => {
    totalCredits += cEntry.credits;
    if (cEntry.is_passed) {
      passedCoursesCount++;
    } else {
      failedCoursesCount++;
    }

    const avgGp = cEntry.grades.reduce((sum, item) => sum + item.grade_point, 0) / cEntry.grades.length;
    totalWeightedGradePoints += cEntry.credits * avgGp;
  });

  const sgpa = totalCredits > 0 ? Math.round((totalWeightedGradePoints / totalCredits) * 100) / 100 : 0.0;

  return {
    student,
    grades,
    metrics: {
      total_records: grades.length,
      total_courses: courseMap.size,
      total_credits: Math.round(totalCredits * 10) / 10,
      passed_courses: passedCoursesCount,
      failed_courses: failedCoursesCount,
      sgpa
    }
  };
};

/**
 * Get comprehensive student academic summary across all results
 */
const getStudentSummary = async (studentId) => {
  const studentData = await getStudentGrades(studentId);
  if (!studentData) return null;

  const { student, grades, metrics } = studentData;

  const totalPercentage = grades.reduce((sum, g) => sum + g.percentage, 0);
  const averagePercentage = grades.length > 0 ? Math.round((totalPercentage / grades.length) * 100) / 100 : 0.0;

  return {
    student,
    summary: {
      ...metrics,
      average_percentage: averagePercentage,
      overall_status: metrics.failed_courses === 0 && metrics.total_courses > 0 ? 'Passed' : (metrics.failed_courses > 0 ? 'Failed' : 'Pending')
    },
    grades
  };
};

/**
 * Get course-wise results and class statistics
 */
const getCourseGrades = async (courseId, examSession = '') => {
  // 1. Fetch course details
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
    LEFT JOIN departments d ON c.department_id = d.department_id
    WHERE c.course_id = ?
    LIMIT 1
  `;
  const [courseRows] = await pool.query(courseSql, [parseInt(courseId, 10)]);
  if (!courseRows[0]) return null;

  const course = {
    ...courseRows[0],
    credits: parseFloat(courseRows[0].credits)
  };

  // 2. Fetch all grades for this course
  const conditions = ['g.course_id = ?'];
  const params = [parseInt(courseId, 10)];

  if (examSession && examSession.trim()) {
    conditions.push('g.exam_session = ?');
    params.push(examSession.trim());
  }

  const gradesSql = `
    SELECT 
      g.grade_id,
      g.student_id,
      g.course_id,
      g.teacher_id,
      g.assessment_type,
      g.internal_marks,
      g.external_marks,
      g.practical_marks,
      g.total_marks,
      g.max_marks,
      g.percentage,
      g.letter_grade,
      g.grade_point,
      g.exam_session,
      g.remarks,
      g.created_at,
      s.prn_number,
      s.class_name,
      s.division,
      TRIM(CONCAT(u_s.first_name, ' ', u_s.last_name)) AS student_name,
      u_s.email AS student_email
    FROM grades g
    INNER JOIN students s ON g.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY g.assessment_type ASC, student_name ASC
  `;
  const [gradeRows] = await pool.query(gradesSql, params);
  const students = gradeRows.map(formatGradeRow);

  // 3. Compute course statistics
  const totalResults = students.length;
  const passedCount = students.filter(s => s.status === 'Pass').length;
  const failedCount = students.filter(s => s.status === 'Fail').length;
  const passRate = totalResults > 0 ? Math.round((passedCount / totalResults) * 100 * 100) / 100 : 0.0;
  const totalMarksSum = students.reduce((sum, s) => sum + s.percentage, 0);
  const avgPercentage = totalResults > 0 ? Math.round((totalMarksSum / totalResults) * 100) / 100 : 0.0;

  return {
    course,
    stats: {
      total_results: totalResults,
      passed_count: passedCount,
      failed_count: failedCount,
      pass_rate: passRate,
      average_percentage: avgPercentage
    },
    students
  };
};

/**
 * Get dashboard KPI statistics for Grades
 */
const getGradeStats = async () => {
  const statsSql = `
    SELECT 
      COUNT(*) AS total_results,
      SUM(CASE WHEN percentage >= 40.00 THEN 1 ELSE 0 END) AS passed_count,
      SUM(CASE WHEN percentage < 40.00 THEN 1 ELSE 0 END) AS failed_count,
      ROUND(AVG(percentage), 2) AS average_marks,
      COUNT(DISTINCT student_id) AS total_students_evaluated,
      COUNT(DISTINCT course_id) AS total_courses_evaluated
    FROM grades
  `;
  const [rows] = await pool.query(statsSql);
  const row = rows[0] || {};

  const totalResults = parseInt(row.total_results, 10) || 0;
  const passedCount = parseInt(row.passed_count, 10) || 0;
  const failedCount = parseInt(row.failed_count, 10) || 0;
  const passRate = totalResults > 0 ? Math.round((passedCount / totalResults) * 100 * 100) / 100 : 0.0;

  return {
    total_results: totalResults,
    passed_count: passedCount,
    failed_count: failedCount,
    pass_rate: passRate,
    average_marks: row.average_marks !== null && row.average_marks !== undefined ? parseFloat(row.average_marks) : 0.0,
    total_students_evaluated: parseInt(row.total_students_evaluated, 10) || 0,
    total_courses_evaluated: parseInt(row.total_courses_evaluated, 10) || 0
  };
};

module.exports = {
  calculateGradeAndPoints,
  formatGradeRow,
  getGrades,
  findById,
  checkDuplicate,
  checkStudentEnrollment,
  createGrade,
  updateGrade,
  deleteGrade,
  getStudentGrades,
  getStudentSummary,
  getCourseGrades,
  getGradeStats
};
