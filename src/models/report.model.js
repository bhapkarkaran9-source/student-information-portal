const pool = require('../config/db');
const { formatTimeTo12Hour, formatTimeRange } = require('./attendance.model');

/**
 * Report Data Model
 * Dynamic academic reporting engine for Student Information Portal
 * Database: student_portal_db
 */

// Low attendance threshold configuration
const LOW_ATTENDANCE_THRESHOLD = 75.0;

// Grade Scale definitions
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
 * Helper to match academic year variants (e.g. '2025-2026' <-> '2025-26')
 */
const getAcademicYearVariants = (yearStr) => {
  if (!yearStr) return [];
  const trimmed = yearStr.trim();
  const variants = [trimmed];
  const matchLong = trimmed.match(/^(\d{4})-(\d{4})$/);
  if (matchLong) {
    variants.push(`${matchLong[1]}-${matchLong[2].slice(2)}`);
  }
  const matchShort = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (matchShort) {
    const prefix = matchShort[1].slice(0, 2);
    variants.push(`${matchShort[1]}-${prefix}${matchShort[2]}`);
  }
  return Array.from(new Set(variants));
};

/**
 * Helper: Resolve student_id from user_id
 */
const getStudentIdByUserId = async (userId) => {
  const [rows] = await pool.query('SELECT student_id FROM students WHERE user_id = ? LIMIT 1', [parseInt(userId, 10)]);
  return rows[0] ? rows[0].student_id : null;
};

/**
 * Helper: Resolve teacher_id from user_id
 */
const getTeacherIdByUserId = async (userId) => {
  const [rows] = await pool.query('SELECT teacher_id FROM teachers WHERE user_id = ? LIMIT 1', [parseInt(userId, 10)]);
  return rows[0] ? rows[0].teacher_id : null;
};

/**
 * Helper: Get list of course IDs assigned to teacher (via timetable, attendance, or grades)
 */
const getTeacherAssignedCourseIds = async (teacherId) => {
  const tid = parseInt(teacherId, 10);
  const sql = `
    SELECT DISTINCT course_id FROM timetable WHERE teacher_id = ?
    UNION
    SELECT DISTINCT course_id FROM attendance WHERE teacher_id = ?
    UNION
    SELECT DISTINCT course_id FROM grades WHERE teacher_id = ?
    UNION
    SELECT DISTINCT course_id FROM assignments WHERE teacher_id = ?
  `;
  const [rows] = await pool.query(sql, [tid, tid, tid, tid]);
  return rows.map((r) => r.course_id);
};

/**
 * Helper: Check if student is enrolled in any of teacher's assigned courses
 */
const isStudentInTeacherCourses = async (teacherId, studentId) => {
  const tid = parseInt(teacherId, 10);
  const sid = parseInt(studentId, 10);
  const courseIds = await getTeacherAssignedCourseIds(tid);
  if (courseIds.length === 0) return false;

  const placeholders = courseIds.map(() => '?').join(',');
  const sql = `
    SELECT enrollment_id FROM enrollments 
    WHERE student_id = ? AND course_id IN (${placeholders})
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [sid, ...courseIds]);
  return rows.length > 0;
};

// ============================================================================
// 1. STUDENT PROFILE REPORT
// ============================================================================
const getStudentProfileReport = async ({ studentId }) => {
  const sid = parseInt(studentId, 10);
  if (isNaN(sid) || sid <= 0) return null;

  const sql = `
    SELECT 
      s.student_id,
      s.prn_number,
      s.admission_date,
      s.date_of_birth,
      s.gender,
      s.class_name,
      s.division,
      s.semester,
      s.created_at,
      u.user_id,
      u.username,
      u.email,
      u.phone,
      u.first_name,
      u.last_name,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS full_name,
      u.is_active,
      d.department_id,
      d.department_code,
      d.department_name
    FROM students s
    INNER JOIN users u ON s.user_id = u.user_id
    LEFT JOIN departments d ON s.department_id = d.department_id
    WHERE s.student_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [sid]);
  if (!rows || rows.length === 0) return null;

  const student = rows[0];

  // Fetch active enrollments
  const enrollmentsSql = `
    SELECT 
      e.enrollment_id,
      e.course_id,
      e.academic_year,
      e.semester,
      e.status,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type
    FROM enrollments e
    INNER JOIN courses c ON e.course_id = c.course_id
    WHERE e.student_id = ?
    ORDER BY e.academic_year DESC, e.semester ASC, c.course_code ASC
  `;
  const [enrollments] = await pool.query(enrollmentsSql, [sid]);

  const totalCredits = enrollments.reduce((acc, curr) => acc + (parseFloat(curr.credits) || 0), 0);

  return {
    student: {
      student_id: student.student_id,
      user_id: student.user_id,
      prn_number: student.prn_number,
      full_name: student.full_name,
      email: student.email,
      phone: student.phone || '-',
      department_name: student.department_name || '-',
      department_code: student.department_code || '-',
      class_name: student.class_name,
      division: student.division,
      semester: student.semester,
      admission_date: student.admission_date ? String(student.admission_date).slice(0, 10) : '-',
      date_of_birth: student.date_of_birth ? String(student.date_of_birth).slice(0, 10) : '-',
      gender: student.gender || '-',
      is_active: Boolean(student.is_active)
    },
    enrollments: enrollments.map((e) => ({
      enrollment_id: e.enrollment_id,
      course_id: e.course_id,
      course_code: e.course_code,
      course_name: e.course_name,
      credits: parseFloat(e.credits) || 0,
      course_type: e.course_type,
      academic_year: e.academic_year,
      semester: e.semester,
      status: e.status
    })),
    summary: {
      total_courses_enrolled: enrollments.length,
      total_credits: Math.round(totalCredits * 10) / 10
    }
  };
};

// ============================================================================
// 2. ATTENDANCE REPORT
// ============================================================================
const getAttendanceReport = async (filters = {}) => {
  const {
    student_id,
    course_id,
    department_id,
    semester,
    academic_year,
    start_date,
    end_date,
    allowedCourseIds
  } = filters;

  const whereConditions = [];
  const queryParams = [];

  if (student_id) {
    whereConditions.push('a.student_id = ?');
    queryParams.push(parseInt(student_id, 10));
  }

  if (course_id) {
    whereConditions.push('a.course_id = ?');
    queryParams.push(parseInt(course_id, 10));
  } else if (allowedCourseIds && allowedCourseIds.length > 0) {
    const placeholders = allowedCourseIds.map(() => '?').join(',');
    whereConditions.push(`a.course_id IN (${placeholders})`);
    queryParams.push(...allowedCourseIds);
  }

  if (department_id) {
    whereConditions.push('s.department_id = ?');
    queryParams.push(parseInt(department_id, 10));
  }

  if (semester) {
    whereConditions.push('c.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  if (academic_year && academic_year.trim()) {
    const ayVariants = getAcademicYearVariants(academic_year);
    const ayPlaceholders = ayVariants.map(() => '?').join(',');
    whereConditions.push(`c.academic_year IN (${ayPlaceholders})`);
    queryParams.push(...ayVariants);
  }

  if (start_date && start_date.trim()) {
    whereConditions.push('a.attendance_date >= ?');
    queryParams.push(start_date.trim());
  }

  if (end_date && end_date.trim()) {
    whereConditions.push('a.attendance_date <= ?');
    queryParams.push(end_date.trim());
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      a.student_id,
      a.course_id,
      s.prn_number,
      TRIM(CONCAT(u_s.first_name, ' ', u_s.last_name)) AS student_name,
      s.class_name,
      s.division,
      c.course_code,
      c.course_name,
      c.semester AS course_semester,
      c.academic_year AS course_academic_year,
      d.department_name,
      COUNT(*) AS total_lectures,
      SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_count,
      SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
      SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS late_count,
      SUM(CASE WHEN a.status = 'Excused' THEN 1 ELSE 0 END) AS excused_count
    FROM attendance a
    INNER JOIN students s ON a.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    INNER JOIN courses c ON a.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    ${whereClause}
    GROUP BY a.student_id, a.course_id
    ORDER BY c.course_code ASC, s.prn_number ASC
  `;

  const [rows] = await pool.query(sql, queryParams);

  let overallTotal = 0;
  let overallPresent = 0;
  let overallAbsent = 0;
  let overallLate = 0;
  let overallExcused = 0;
  let defaultersCount = 0;

  const items = rows.map((r) => {
    const total = parseInt(r.total_lectures, 10) || 0;
    const present = parseInt(r.present_count, 10) || 0;
    const absent = parseInt(r.absent_count, 10) || 0;
    const late = parseInt(r.late_count, 10) || 0;
    const excused = parseInt(r.excused_count, 10) || 0;
    // Standard academic attendance formula: (Present + Late) / Total * 100
    const percentage = total > 0 ? Math.round(((present + late) / total) * 100 * 100) / 100 : 0.0;
    const isDefaulter = percentage < LOW_ATTENDANCE_THRESHOLD;

    overallTotal += total;
    overallPresent += present;
    overallAbsent += absent;
    overallLate += late;
    overallExcused += excused;
    if (isDefaulter) defaultersCount++;

    return {
      student_id: r.student_id,
      prn_number: r.prn_number,
      student_name: r.student_name,
      class_name: r.class_name,
      division: r.division,
      course_id: r.course_id,
      course_code: r.course_code,
      course_name: r.course_name,
      course_semester: r.course_semester,
      course_academic_year: r.course_academic_year,
      department_name: r.department_name || '-',
      total_lectures: total,
      present_count: present,
      absent_count: absent,
      late_count: late,
      excused_count: excused,
      percentage,
      is_defaulter: isDefaulter,
      status: isDefaulter ? 'Defaulter (<75%)' : 'Good'
    };
  });

  const overallPercentage = overallTotal > 0 ? Math.round(((overallPresent + overallLate) / overallTotal) * 100 * 100) / 100 : 0.0;

  return {
    items,
    summary: {
      total_student_courses: items.length,
      overall_total_lectures: overallTotal,
      overall_present: overallPresent,
      overall_absent: overallAbsent,
      overall_late: overallLate,
      overall_excused: overallExcused,
      overall_percentage: overallPercentage,
      defaulters_count: defaultersCount,
      low_attendance_threshold: LOW_ATTENDANCE_THRESHOLD
    }
  };
};

/**
 * Detailed Lecture Sessions Attendance Report with Custom Lecture Time & Type
 */
const getAttendanceSessionReport = async (filters = {}) => {
  const {
    student_id,
    course_id,
    department_id,
    semester,
    academic_year,
    start_date,
    end_date,
    allowedCourseIds
  } = filters;

  const whereConditions = [];
  const queryParams = [];

  if (student_id) {
    whereConditions.push('a.student_id = ?');
    queryParams.push(parseInt(student_id, 10));
  }

  if (course_id) {
    whereConditions.push('a.course_id = ?');
    queryParams.push(parseInt(course_id, 10));
  } else if (allowedCourseIds && allowedCourseIds.length > 0) {
    const placeholders = allowedCourseIds.map(() => '?').join(',');
    whereConditions.push(`a.course_id IN (${placeholders})`);
    queryParams.push(...allowedCourseIds);
  }

  if (department_id) {
    whereConditions.push('s.department_id = ?');
    queryParams.push(parseInt(department_id, 10));
  }

  if (semester) {
    whereConditions.push('c.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  if (academic_year && academic_year.trim()) {
    const ayVariants = getAcademicYearVariants(academic_year);
    const ayPlaceholders = ayVariants.map(() => '?').join(',');
    whereConditions.push(`c.academic_year IN (${ayPlaceholders})`);
    queryParams.push(...ayVariants);
  }

  if (start_date && start_date.trim()) {
    whereConditions.push('a.attendance_date >= ?');
    queryParams.push(start_date.trim());
  }

  if (end_date && end_date.trim()) {
    whereConditions.push('a.attendance_date <= ?');
    queryParams.push(end_date.trim());
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      a.attendance_id,
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
      a.student_id,
      s.prn_number,
      TRIM(CONCAT(u_s.first_name, ' ', u_s.last_name)) AS student_name,
      s.class_name,
      s.division,
      a.course_id,
      c.course_code,
      c.course_name,
      d.department_name,
      a.lecture_type,
      a.session_name,
      DATE_FORMAT(a.start_time, '%H:%i:%s') AS start_time,
      DATE_FORMAT(a.end_time, '%H:%i:%s') AS end_time,
      a.status,
      a.remarks
    FROM attendance a
    INNER JOIN students s ON a.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    INNER JOIN courses c ON a.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    ${whereClause}
    ORDER BY a.attendance_date DESC, a.start_time DESC, a.attendance_id DESC
  `;

  const [rows] = await pool.query(sql, queryParams);

  const items = rows.map(r => ({
    ...r,
    lecture_type: r.lecture_type || 'Regular Lecture',
    session_name: r.session_name || 'Lecture 1',
    start_time_12h: formatTimeTo12Hour(r.start_time),
    end_time_12h: formatTimeTo12Hour(r.end_time),
    time_slot: formatTimeRange(r.start_time, r.end_time)
  }));

  return {
    items,
    summary: {
      total_sessions: items.length,
      present_count: items.filter(i => i.status === 'Present').length,
      absent_count: items.filter(i => i.status === 'Absent').length,
      late_count: items.filter(i => i.status === 'Late').length,
      excused_count: items.filter(i => i.status === 'Excused').length
    }
  };
};

// ============================================================================
// 3. GRADE / RESULT REPORT
// ============================================================================
const getGradeReport = async (filters = {}) => {
  const {
    student_id,
    course_id,
    department_id,
    semester,
    academic_year,
    exam_session,
    allowedCourseIds
  } = filters;

  const whereConditions = [];
  const queryParams = [];

  if (student_id) {
    whereConditions.push('g.student_id = ?');
    queryParams.push(parseInt(student_id, 10));
  }

  if (course_id) {
    whereConditions.push('g.course_id = ?');
    queryParams.push(parseInt(course_id, 10));
  } else if (allowedCourseIds && allowedCourseIds.length > 0) {
    const placeholders = allowedCourseIds.map(() => '?').join(',');
    whereConditions.push(`g.course_id IN (${placeholders})`);
    queryParams.push(...allowedCourseIds);
  }

  if (department_id) {
    whereConditions.push('c.department_id = ?');
    queryParams.push(parseInt(department_id, 10));
  }

  if (semester) {
    whereConditions.push('c.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  if (academic_year && academic_year.trim()) {
    const ayVariants = getAcademicYearVariants(academic_year);
    const ayPlaceholders = ayVariants.map(() => '?').join(',');
    whereConditions.push(`c.academic_year IN (${ayPlaceholders})`);
    queryParams.push(...ayVariants);
  }

  if (exam_session && exam_session.trim()) {
    whereConditions.push('g.exam_session = ?');
    queryParams.push(exam_session.trim());
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      g.grade_id,
      g.student_id,
      g.course_id,
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
      TRIM(CONCAT(u_s.first_name, ' ', u_s.last_name)) AS student_name,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      c.semester AS course_semester,
      c.academic_year AS course_academic_year,
      d.department_name
    FROM grades g
    INNER JOIN students s ON g.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    INNER JOIN courses c ON g.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    ${whereClause}
    ORDER BY s.prn_number ASC, c.course_code ASC, g.assessment_type ASC
  `;

  const [rows] = await pool.query(sql, queryParams);

  let totalRecords = rows.length;
  let passedCount = 0;
  let failedCount = 0;
  let totalMarksSum = 0;
  let maxMarksSum = 0;

  // SGPA tracking per student
  const studentCourseMap = new Map();

  const items = rows.map((r) => {
    const pct = parseFloat(r.percentage) || 0.0;
    const isPass = pct >= 40.0 && r.letter_grade !== 'F';
    if (isPass) passedCount++;
    else failedCount++;

    totalMarksSum += parseFloat(r.total_marks) || 0.0;
    maxMarksSum += parseFloat(r.max_marks) || 100.0;

    // Track for SGPA computation
    if (!studentCourseMap.has(r.student_id)) {
      studentCourseMap.set(r.student_id, new Map());
    }
    const coursesForStudent = studentCourseMap.get(r.student_id);
    if (!coursesForStudent.has(r.course_id)) {
      coursesForStudent.set(r.course_id, {
        credits: parseFloat(r.credits) || 0.0,
        grade_points: [],
        has_failed: false
      });
    }
    const cData = coursesForStudent.get(r.course_id);
    cData.grade_points.push(parseInt(r.grade_point, 10) || 0);
    if (!isPass) cData.has_failed = true;

    return {
      grade_id: r.grade_id,
      student_id: r.student_id,
      prn_number: r.prn_number,
      student_name: r.student_name,
      course_id: r.course_id,
      course_code: r.course_code,
      course_name: r.course_name,
      course_type: r.course_type,
      credits: parseFloat(r.credits) || 0.0,
      semester: r.course_semester,
      academic_year: r.course_academic_year,
      department_name: r.department_name || '-',
      assessment_type: r.assessment_type,
      internal_marks: parseFloat(r.internal_marks) || 0.0,
      external_marks: parseFloat(r.external_marks) || 0.0,
      practical_marks: parseFloat(r.practical_marks) || 0.0,
      total_marks: parseFloat(r.total_marks) || 0.0,
      max_marks: parseFloat(r.max_marks) || 100.0,
      percentage: pct,
      letter_grade: r.letter_grade,
      grade_point: parseInt(r.grade_point, 10) || 0,
      exam_session: r.exam_session,
      status: isPass ? 'Pass' : 'Fail',
      remarks: r.remarks || '-'
    };
  });

  // Calculate SGPA per student if filtered to a single student or overall
  let overallSgpaSum = 0;
  let studentsWithSgpa = 0;

  studentCourseMap.forEach((courses) => {
    let totalCredits = 0.0;
    let totalWeightedPoints = 0.0;

    courses.forEach((c) => {
      totalCredits += c.credits;
      const avgGp = c.grade_points.reduce((acc, v) => acc + v, 0) / c.grade_points.length;
      totalWeightedPoints += c.credits * avgGp;
    });

    if (totalCredits > 0) {
      const studentSgpa = Math.round((totalWeightedPoints / totalCredits) * 100) / 100;
      overallSgpaSum += studentSgpa;
      studentsWithSgpa++;
    }
  });

  const averageSgpa = studentsWithSgpa > 0 ? Math.round((overallSgpaSum / studentsWithSgpa) * 100) / 100 : 0.0;
  const overallPercentage = maxMarksSum > 0 ? Math.round((totalMarksSum / maxMarksSum) * 100 * 100) / 100 : 0.0;
  const passRate = totalRecords > 0 ? Math.round((passedCount / totalRecords) * 100 * 100) / 100 : 0.0;

  return {
    items,
    summary: {
      total_results: totalRecords,
      passed_count: passedCount,
      failed_count: failedCount,
      pass_rate: passRate,
      average_percentage: overallPercentage,
      average_sgpa: averageSgpa
    }
  };
};

// ============================================================================
// 4. PERFORMANCE REPORT
// ============================================================================
const getPerformanceReport = async (filters = {}) => {
  const { student_id, course_id, department_id, semester, academic_year, allowedCourseIds } = filters;

  const whereConditions = [];
  const queryParams = [];

  if (student_id) {
    whereConditions.push('s.student_id = ?');
    queryParams.push(parseInt(student_id, 10));
  } else if (course_id) {
    const cid = parseInt(course_id, 10);
    whereConditions.push('s.student_id IN (SELECT DISTINCT student_id FROM enrollments WHERE course_id = ?)');
    queryParams.push(cid);
  } else if (allowedCourseIds && allowedCourseIds.length > 0) {
    const placeholders = allowedCourseIds.map(() => '?').join(',');
    whereConditions.push(`s.student_id IN (SELECT DISTINCT student_id FROM enrollments WHERE course_id IN (${placeholders}))`);
    queryParams.push(...allowedCourseIds);
  }

  if (department_id) {
    whereConditions.push('s.department_id = ?');
    queryParams.push(parseInt(department_id, 10));
  }

  if (semester) {
    whereConditions.push('s.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const studentsSql = `
    SELECT 
      s.student_id,
      s.prn_number,
      s.class_name,
      s.division,
      s.semester,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS student_name,
      u.email,
      d.department_name
    FROM students s
    INNER JOIN users u ON s.user_id = u.user_id
    LEFT JOIN departments d ON s.department_id = d.department_id
    ${whereClause}
    ORDER BY s.prn_number ASC
  `;
  const [students] = await pool.query(studentsSql, queryParams);

  let totalEvaluated = 0;
  let goodCount = 0;
  let attentionCount = 0;
  let atRiskCount = 0;

  const items = [];

  for (const s of students) {
    // 1. Get attendance for student
    const attFilter = { student_id: s.student_id };
    if (academic_year) attFilter.academic_year = academic_year;
    if (semester) attFilter.semester = semester;
    if (course_id) attFilter.course_id = course_id;
    else if (allowedCourseIds) attFilter.allowedCourseIds = allowedCourseIds;
    const attRes = await getAttendanceReport(attFilter);

    // 2. Get grades for student
    const gradeFilter = { student_id: s.student_id };
    if (academic_year) gradeFilter.academic_year = academic_year;
    if (semester) gradeFilter.semester = semester;
    if (course_id) gradeFilter.course_id = course_id;
    else if (allowedCourseIds) gradeFilter.allowedCourseIds = allowedCourseIds;
    const gradeRes = await getGradeReport(gradeFilter);

    const attPct = attRes.summary.overall_percentage;
    const gradePct = gradeRes.summary.average_percentage;
    const sgpa = gradeRes.summary.average_sgpa;
    const failedCourses = gradeRes.summary.failed_count;
    const totalCourses = gradeRes.summary.total_results;

    // Deterministic Risk Categorization (from Step 18)
    let riskLevel = 'Good';
    let riskReason = 'Satisfactory performance';
    let overallStatus = 'Good';

    if (totalCourses > 0 || attRes.summary.overall_total_lectures > 0) {
      totalEvaluated++;
      if (failedCourses >= 2 || (attPct < 50.0 && attRes.summary.overall_total_lectures > 0) || (gradePct < 40.0 && totalCourses > 0)) {
        riskLevel = 'At Risk';
        riskReason = failedCourses >= 2 ? `${failedCourses} courses failed` : (attPct < 50.0 ? 'Critical attendance shortage (<50%)' : 'Failing average percentage');
        overallStatus = 'At Risk';
        atRiskCount++;
      } else if (failedCourses === 1 || (attPct < 75.0 && attRes.summary.overall_total_lectures > 0) || (gradePct < 50.0 && totalCourses > 0)) {
        riskLevel = 'Needs Attention';
        riskReason = failedCourses === 1 ? '1 course failed' : (attPct < 75.0 ? 'Low attendance (<75%)' : 'Borderline academic average');
        overallStatus = 'Average';
        attentionCount++;
      } else {
        goodCount++;
        overallStatus = gradePct >= 75.0 ? 'Excellent' : 'Good';
      }
    }

    items.push({
      student_id: s.student_id,
      prn_number: s.prn_number,
      student_name: s.student_name,
      class_name: s.class_name,
      division: s.division,
      semester: s.semester,
      department_name: s.department_name || '-',
      attendance_percentage: attPct,
      average_marks: gradePct,
      sgpa,
      courses_evaluated: totalCourses,
      failed_courses: failedCourses,
      risk_level: riskLevel,
      risk_reason: riskReason,
      overall_status: overallStatus
    });
  }

  return {
    items,
    summary: {
      total_students: items.length,
      evaluated_students: totalEvaluated,
      good_standing_count: goodCount,
      needs_attention_count: attentionCount,
      at_risk_count: atRiskCount
    }
  };
};

// ============================================================================
// 5. COURSE-WISE REPORT
// ============================================================================
const getCourseWiseReport = async (filters = {}) => {
  const { course_id, academic_year, semester, allowedCourseIds } = filters;

  const whereConditions = [];
  const queryParams = [];

  if (course_id) {
    whereConditions.push('c.course_id = ?');
    queryParams.push(parseInt(course_id, 10));
  } else if (allowedCourseIds && allowedCourseIds.length > 0) {
    const placeholders = allowedCourseIds.map(() => '?').join(',');
    whereConditions.push(`c.course_id IN (${placeholders})`);
    queryParams.push(...allowedCourseIds);
  }

  if (academic_year && academic_year.trim()) {
    const ayVariants = getAcademicYearVariants(academic_year);
    const ayPlaceholders = ayVariants.map(() => '?').join(',');
    whereConditions.push(`c.academic_year IN (${ayPlaceholders})`);
    queryParams.push(...ayVariants);
  }

  if (semester) {
    whereConditions.push('c.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const coursesSql = `
    SELECT 
      c.course_id,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      c.semester,
      c.academic_year,
      d.department_name
    FROM courses c
    LEFT JOIN departments d ON c.department_id = d.department_id
    ${whereClause}
    ORDER BY c.course_code ASC
  `;
  const [courses] = await pool.query(coursesSql, queryParams);

  const items = [];

  for (const c of courses) {
    // 1. Enrolled students count
    const [enrollmentRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ? AND status = 'Enrolled'",
      [c.course_id]
    );
    const enrolledCount = parseInt(enrollmentRows[0].total, 10) || 0;

    // 2. Attendance stats for course
    const attRes = await getAttendanceReport({ course_id: c.course_id });
    const totalLectures = attRes.summary.overall_total_lectures;
    const avgAttendance = attRes.summary.overall_percentage;
    const defaultersCount = attRes.summary.defaulters_count;

    // 3. Grades stats for course
    const gradeRes = await getGradeReport({ course_id: c.course_id });
    const evaluatedStudents = gradeRes.summary.total_results;
    const passedCount = gradeRes.summary.passed_count;
    const failedCount = gradeRes.summary.failed_count;
    const passRate = gradeRes.summary.pass_rate;
    const avgMarks = gradeRes.summary.average_percentage;

    items.push({
      course_id: c.course_id,
      course_code: c.course_code,
      course_name: c.course_name,
      credits: parseFloat(c.credits) || 0,
      course_type: c.course_type,
      semester: c.semester,
      academic_year: c.academic_year,
      department_name: c.department_name || '-',
      enrolled_students: enrolledCount,
      total_lectures: totalLectures,
      average_attendance: avgAttendance,
      defaulters_count: defaultersCount,
      evaluated_students: evaluatedStudents,
      passed_count: passedCount,
      failed_count: failedCount,
      pass_rate: passRate,
      average_marks: avgMarks
    });
  }

  return {
    items,
    summary: {
      total_courses: items.length
    }
  };
};

// ============================================================================
// 6. STUDENT-WISE CONSOLIDATED ACADEMIC REPORT (360 DEGREE)
// ============================================================================
const getStudentWiseAcademicReport = async ({ studentId, semester, academicYear }) => {
  const profileRes = await getStudentProfileReport({ studentId });
  if (!profileRes) return null;

  const attRes = await getAttendanceReport({
    student_id: studentId,
    semester,
    academic_year: academicYear
  });

  const gradeRes = await getGradeReport({
    student_id: studentId,
    semester,
    academic_year: academicYear
  });

  // Calculate SGPA for requested semester if grades exist
  const sgpa = gradeRes.summary.average_sgpa;
  const isCgpaAvailable = false; // As requested, only multi-semester historical data should calculate CGPA

  return {
    student: profileRes.student,
    enrollments: profileRes.enrollments,
    attendance: {
      items: attRes.items,
      summary: attRes.summary
    },
    grades: {
      items: gradeRes.items,
      summary: gradeRes.summary
    },
    academic_evaluation: {
      sgpa: sgpa > 0 ? sgpa : 'N/A',
      cgpa_status: 'CGPA unavailable — insufficient semester data.',
      total_credits_enrolled: profileRes.summary.total_credits,
      overall_attendance_percentage: attRes.summary.overall_percentage,
      overall_grade_average: gradeRes.summary.average_percentage,
      pass_rate: gradeRes.summary.pass_rate,
      standing: gradeRes.summary.failed_count === 0 && attRes.summary.overall_percentage >= 75.0 ? 'Good Standing' : 'Needs Attention'
    }
  };
};

// ============================================================================
// 7. ENROLLMENT REPORT
// ============================================================================
const getEnrollmentReport = async (filters = {}) => {
  const { department_id, course_id, student_id, academic_year, semester, status, allowedCourseIds } = filters;

  const whereConditions = [];
  const queryParams = [];

  if (student_id) {
    whereConditions.push('e.student_id = ?');
    queryParams.push(parseInt(student_id, 10));
  }

  if (course_id) {
    whereConditions.push('e.course_id = ?');
    queryParams.push(parseInt(course_id, 10));
  } else if (allowedCourseIds && allowedCourseIds.length > 0) {
    const placeholders = allowedCourseIds.map(() => '?').join(',');
    whereConditions.push(`e.course_id IN (${placeholders})`);
    queryParams.push(...allowedCourseIds);
  }

  if (department_id) {
    whereConditions.push('c.department_id = ?');
    queryParams.push(parseInt(department_id, 10));
  }

  if (semester) {
    whereConditions.push('e.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  if (academic_year && academic_year.trim()) {
    const ayVariants = getAcademicYearVariants(academic_year);
    const ayPlaceholders = ayVariants.map(() => '?').join(',');
    whereConditions.push(`(e.academic_year IN (${ayPlaceholders}) OR c.academic_year IN (${ayPlaceholders}))`);
    queryParams.push(...ayVariants, ...ayVariants);
  }

  if (status && status.trim()) {
    whereConditions.push('e.status = ?');
    queryParams.push(status.trim());
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      e.enrollment_id,
      e.student_id,
      e.course_id,
      e.academic_year,
      e.semester,
      e.enrollment_date,
      e.status,
      s.prn_number,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS student_name,
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      d.department_name
    FROM enrollments e
    INNER JOIN students s ON e.student_id = s.student_id
    INNER JOIN users u ON s.user_id = u.user_id
    INNER JOIN courses c ON e.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    ${whereClause}
    ORDER BY e.academic_year DESC, e.semester ASC, c.course_code ASC, s.prn_number ASC
  `;

  const [rows] = await pool.query(sql, queryParams);

  const items = rows.map((r) => ({
    enrollment_id: r.enrollment_id,
    student_id: r.student_id,
    prn_number: r.prn_number,
    student_name: r.student_name,
    course_id: r.course_id,
    course_code: r.course_code,
    course_name: r.course_name,
    credits: parseFloat(r.credits) || 0,
    course_type: r.course_type,
    department_name: r.department_name || '-',
    academic_year: r.academic_year,
    semester: r.semester,
    enrollment_date: r.enrollment_date ? String(r.enrollment_date).slice(0, 10) : '-',
    status: r.status
  }));

  return {
    items,
    summary: {
      total_enrollments: items.length,
      active_enrolled: items.filter((x) => x.status === 'Enrolled').length,
      completed: items.filter((x) => x.status === 'Completed').length,
      dropped: items.filter((x) => x.status === 'Dropped').length
    }
  };
};

// ============================================================================
// 8. TIMETABLE REPORT
// ============================================================================
const getTimetableReport = async (filters = {}) => {
  const { class_name, division, teacher_id, course_id, day_of_week, semester, academic_year, allowedCourseIds, student_id } = filters;

  const whereConditions = [];
  const queryParams = [];

  if (student_id) {
    whereConditions.push('t.course_id IN (SELECT course_id FROM enrollments WHERE student_id = ?)');
    queryParams.push(parseInt(student_id, 10));
  }

  if (class_name && class_name.trim()) {
    whereConditions.push('t.class_name = ?');
    queryParams.push(class_name.trim());
  }

  if (division && division.trim()) {
    whereConditions.push('t.division = ?');
    queryParams.push(division.trim());
  }

  if (teacher_id) {
    whereConditions.push('t.teacher_id = ?');
    queryParams.push(parseInt(teacher_id, 10));
  }

  if (course_id) {
    whereConditions.push('t.course_id = ?');
    queryParams.push(parseInt(course_id, 10));
  } else if (allowedCourseIds && allowedCourseIds.length > 0) {
    const placeholders = allowedCourseIds.map(() => '?').join(',');
    whereConditions.push(`t.course_id IN (${placeholders})`);
    queryParams.push(...allowedCourseIds);
  }

  if (day_of_week && day_of_week.trim()) {
    whereConditions.push('t.day_of_week = ?');
    queryParams.push(day_of_week.trim());
  }

  if (semester) {
    whereConditions.push('t.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  if (academic_year && academic_year.trim()) {
    const ayVariants = getAcademicYearVariants(academic_year);
    const ayPlaceholders = ayVariants.map(() => '?').join(',');
    whereConditions.push(`(t.academic_year IN (${ayPlaceholders}) OR c.academic_year IN (${ayPlaceholders}))`);
    queryParams.push(...ayVariants, ...ayVariants);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      t.timetable_id,
      t.day_of_week,
      t.start_time,
      t.end_time,
      t.class_name,
      t.division,
      t.room_no,
      t.academic_year,
      t.semester,
      c.course_id,
      c.course_code,
      c.course_name,
      c.course_type,
      d.department_name,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name,
      tc.employee_number,
      tc.designation
    FROM timetable t
    INNER JOIN courses c ON t.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers tc ON t.teacher_id = tc.teacher_id
    INNER JOIN users u ON tc.user_id = u.user_id
    ${whereClause}
    ORDER BY 
      FIELD(t.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'),
      t.start_time ASC
  `;

  const [rows] = await pool.query(sql, queryParams);

  const items = rows.map((r) => ({
    timetable_id: r.timetable_id,
    day_of_week: r.day_of_week,
    start_time: r.start_time ? String(r.start_time).slice(0, 5) : '',
    end_time: r.end_time ? String(r.end_time).slice(0, 5) : '',
    course_id: r.course_id,
    course_code: r.course_code,
    course_name: r.course_name,
    course_type: r.course_type,
    department_name: r.department_name || '-',
    teacher_name: r.teacher_name,
    teacher_designation: r.designation,
    class_name: r.class_name,
    division: r.division,
    room_no: r.room_no,
    academic_year: r.academic_year,
    semester: r.semester
  }));

  return {
    items,
    summary: {
      total_slots: items.length
    }
  };
};

// ============================================================================
// FILTER OPTIONS DROPDOWN HELPER
// ============================================================================
const getReportFilterOptions = async ({ role, userId, courseId }) => {
  // Departments
  const [departments] = await pool.query('SELECT department_id, department_code, department_name FROM departments ORDER BY department_name ASC');

  // Academic years (role-scoped, querying courses, enrollments, and timetable)
  let academicYears = [];
  if (role === 'STUDENT') {
    const studentId = await getStudentIdByUserId(userId);
    if (studentId) {
      const [ayRows] = await pool.query(`
        SELECT DISTINCT academic_year FROM (
          SELECT e.academic_year FROM enrollments e WHERE e.student_id = ? AND e.academic_year IS NOT NULL AND TRIM(e.academic_year) != ''
          UNION
          SELECT c.academic_year FROM enrollments e JOIN courses c ON e.course_id = c.course_id WHERE e.student_id = ? AND c.academic_year IS NOT NULL AND TRIM(c.academic_year) != ''
          UNION
          SELECT tt.academic_year FROM enrollments e JOIN timetable tt ON e.course_id = tt.course_id WHERE e.student_id = ? AND tt.academic_year IS NOT NULL AND TRIM(tt.academic_year) != ''
        ) AS student_academic_years
        ORDER BY academic_year DESC
      `, [studentId, studentId, studentId]);
      academicYears = ayRows;
    }
  } else if (role === 'TEACHER') {
    const teacherId = await getTeacherIdByUserId(userId);
    const assignedIds = teacherId ? await getTeacherAssignedCourseIds(teacherId) : [];
    if (assignedIds.length > 0) {
      const placeholders = assignedIds.map(() => '?').join(',');
      const [ayRows] = await pool.query(`
        SELECT DISTINCT academic_year FROM (
          SELECT academic_year FROM courses WHERE course_id IN (${placeholders}) AND academic_year IS NOT NULL AND TRIM(academic_year) != ''
          UNION
          SELECT academic_year FROM timetable WHERE course_id IN (${placeholders}) AND academic_year IS NOT NULL AND TRIM(academic_year) != ''
          UNION
          SELECT academic_year FROM enrollments WHERE course_id IN (${placeholders}) AND academic_year IS NOT NULL AND TRIM(academic_year) != ''
        ) AS teacher_academic_years
        ORDER BY academic_year DESC
      `, [...assignedIds, ...assignedIds, ...assignedIds]);
      academicYears = ayRows;
    }
  } else {
    const [ayRows] = await pool.query(`
      SELECT DISTINCT academic_year FROM (
        SELECT academic_year FROM courses WHERE academic_year IS NOT NULL AND TRIM(academic_year) != ''
        UNION
        SELECT academic_year FROM enrollments WHERE academic_year IS NOT NULL AND TRIM(academic_year) != ''
        UNION
        SELECT academic_year FROM timetable WHERE academic_year IS NOT NULL AND TRIM(academic_year) != ''
      ) AS all_academic_years
      ORDER BY academic_year DESC
    `);
    academicYears = ayRows;
  }

  // Courses (Scoped if teacher)
  let courses = [];
  if (role === 'TEACHER') {
    const teacherId = await getTeacherIdByUserId(userId);
    const assignedIds = teacherId ? await getTeacherAssignedCourseIds(teacherId) : [];
    if (assignedIds.length > 0) {
      const placeholders = assignedIds.map(() => '?').join(',');
      const [cRows] = await pool.query(`SELECT course_id, course_code, course_name, semester, academic_year FROM courses WHERE course_id IN (${placeholders}) ORDER BY course_code ASC`, assignedIds);
      courses = cRows;
    }
  } else if (role === 'STUDENT') {
    const studentId = await getStudentIdByUserId(userId);
    if (studentId) {
      const [cRows] = await pool.query(`
        SELECT DISTINCT c.course_id, c.course_code, c.course_name, c.semester, c.academic_year
        FROM enrollments e
        INNER JOIN courses c ON e.course_id = c.course_id
        WHERE e.student_id = ?
        ORDER BY c.course_code ASC
      `, [studentId]);
      courses = cRows;
    }
  } else {
    const [cRows] = await pool.query('SELECT course_id, course_code, course_name, semester, academic_year FROM courses ORDER BY course_code ASC');
    courses = cRows;
  }

  // Students list (for Admin, or Teacher's enrolled students)
  let students = [];
  if (role === 'ADMIN') {
    let sql = `
      SELECT s.student_id, s.prn_number, TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS full_name
      FROM students s
      INNER JOIN users u ON s.user_id = u.user_id
    `;
    const params = [];
    if (courseId) {
      sql += ` INNER JOIN enrollments e ON s.student_id = e.student_id WHERE e.course_id = ? `;
      params.push(parseInt(courseId, 10));
    }
    sql += ` ORDER BY u.first_name ASC, u.last_name ASC `;
    const [sRows] = await pool.query(sql, params);
    students = sRows;
  } else if (role === 'TEACHER') {
    const teacherId = await getTeacherIdByUserId(userId);
    const assignedIds = teacherId ? await getTeacherAssignedCourseIds(teacherId) : [];
    if (assignedIds.length > 0) {
      let targetCourseIds = assignedIds;
      if (courseId) {
        const cid = parseInt(courseId, 10);
        if (assignedIds.includes(cid)) {
          targetCourseIds = [cid];
        }
      }
      const placeholders = targetCourseIds.map(() => '?').join(',');
      const [sRows] = await pool.query(`
        SELECT DISTINCT s.student_id, s.prn_number, TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS full_name, u.first_name, u.last_name
        FROM enrollments e
        INNER JOIN students s ON e.student_id = s.student_id
        INNER JOIN users u ON s.user_id = u.user_id
        WHERE e.course_id IN (${placeholders})
        ORDER BY u.first_name ASC, u.last_name ASC
      `, targetCourseIds);
      students = sRows;
    }
  }

  const yearList = academicYears.map((r) => r.academic_year).filter(Boolean);

  return {
    departments,
    academic_years: yearList,
    academicYears: yearList,
    courses,
    students
  };
};

module.exports = {
  calculateGradeAndPoints,
  getStudentIdByUserId,
  getTeacherIdByUserId,
  getTeacherAssignedCourseIds,
  isStudentInTeacherCourses,
  getStudentProfileReport,
  getAttendanceReport,
  getAttendanceSessionReport,
  getGradeReport,
  getPerformanceReport,
  getCourseWiseReport,
  getStudentWiseAcademicReport,
  getEnrollmentReport,
  getTimetableReport,
  getReportFilterOptions
};
