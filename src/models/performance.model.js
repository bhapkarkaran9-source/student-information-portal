const pool = require('../config/db');

// Reusable threshold configuration from Step 16
const LOW_ATTENDANCE_THRESHOLD = 75.0;

// Official Grade Scale from Step 17
const GRADE_SCALE = [
  { grade: 'O', min: 90.0, gp: 10 },
  { grade: 'A+', min: 80.0, gp: 9 },
  { grade: 'A', min: 70.0, gp: 8 },
  { grade: 'B+', min: 60.0, gp: 7 },
  { grade: 'B', min: 50.0, gp: 6 },
  { grade: 'C', min: 45.0, gp: 5 },
  { grade: 'P', min: 40.0, gp: 4 },
  { grade: 'F', min: 0.0, gp: 0 }
];

const ALL_LETTER_GRADES = ['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F'];

/**
 * Compute Grade and Points from percentage
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
 * Build empty grade distribution object
 */
const createEmptyDistribution = () => {
  const dist = {};
  ALL_LETTER_GRADES.forEach(g => {
    dist[g] = { count: 0, percentage: 0.0 };
  });
  return dist;
};

/**
 * 1. Overall Academic Analytics
 * GET /api/performance/overview
 */
const getOverviewStats = async (filters = {}) => {
  const { academic_year, semester, department_id } = filters;
  const whereConditions = [];
  const queryParams = [];

  if (academic_year && academic_year.trim()) {
    whereConditions.push('c.academic_year = ?');
    queryParams.push(academic_year.trim());
  }

  if (semester) {
    const sem = parseInt(semester, 10);
    if (!isNaN(sem) && sem >= 1 && sem <= 12) {
      whereConditions.push('c.semester = ?');
      queryParams.push(sem);
    }
  }

  if (department_id) {
    const deptId = parseInt(department_id, 10);
    if (!isNaN(deptId) && deptId > 0) {
      whereConditions.push('(c.department_id = ? OR s.department_id = ?)');
      queryParams.push(deptId, deptId);
    }
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      COUNT(DISTINCT g.student_id) AS total_students_evaluated,
      COUNT(g.grade_id) AS total_results,
      SUM(CASE WHEN g.percentage >= 40.0 THEN 1 ELSE 0 END) AS passed_results,
      SUM(CASE WHEN g.percentage < 40.0 THEN 1 ELSE 0 END) AS failed_results,
      ROUND(AVG(g.total_marks), 2) AS average_marks,
      ROUND(AVG(g.percentage), 2) AS average_percentage,
      ROUND(AVG(g.grade_point), 2) AS average_grade_point,
      SUM(c.credits * g.grade_point) AS total_weighted_gp,
      SUM(c.credits) AS total_credits
    FROM grades g
    INNER JOIN courses c ON g.course_id = c.course_id
    INNER JOIN students s ON g.student_id = s.student_id
    ${whereClause}
  `;

  const [rows] = await pool.query(sql, queryParams);
  const r = rows[0] || {};

  const totalResults = parseInt(r.total_results, 10) || 0;
  const passedResults = parseInt(r.passed_results, 10) || 0;
  const failedResults = parseInt(r.failed_results, 10) || 0;
  const totalStudentsEvaluated = parseInt(r.total_students_evaluated, 10) || 0;
  const averageMarks = r.average_marks !== null ? parseFloat(r.average_marks) : 0.0;
  const averagePercentage = r.average_percentage !== null ? parseFloat(r.average_percentage) : 0.0;
  const averageGradePoint = r.average_grade_point !== null ? parseFloat(r.average_grade_point) : 0.0;
  const passPercentage = totalResults > 0 ? Math.round((passedResults / totalResults) * 10000) / 100 : 0.0;

  const totalWeightedGp = parseFloat(r.total_weighted_gp) || 0.0;
  const totalCredits = parseFloat(r.total_credits) || 0.0;
  const overallSgpa = totalCredits > 0 ? Math.round((totalWeightedGp / totalCredits) * 100) / 100 : 0.0;

  return {
    total_students_evaluated: totalStudentsEvaluated,
    total_results: totalResults,
    passed_results: passedResults,
    failed_results: failedResults,
    pass_percentage: passPercentage,
    average_marks: averageMarks,
    average_percentage: averagePercentage,
    average_grade_point: averageGradePoint,
    overall_sgpa: overallSgpa
  };
};

/**
 * 2. Student Academic Summary + Course Breakdown
 * GET /api/performance/student/:studentId
 */
const getStudentPerformance = async (studentId) => {
  const sid = parseInt(studentId, 10);
  if (isNaN(sid) || sid <= 0) return null;

  // 1. Fetch student info
  const studentSql = `
    SELECT 
      s.student_id,
      s.prn_number,
      s.class_name,
      s.division,
      s.semester,
      s.admission_date,
      u.user_id,
      u.first_name,
      u.last_name,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS student_name,
      u.email,
      u.phone,
      d.department_id,
      d.department_name,
      d.department_code
    FROM students s
    INNER JOIN users u ON s.user_id = u.user_id
    LEFT JOIN departments d ON s.department_id = d.department_id
    WHERE s.student_id = ?
    LIMIT 1
  `;
  const [studentRows] = await pool.query(studentSql, [sid]);
  if (!studentRows[0]) return null;
  const student = studentRows[0];

  // 2. Fetch grades with course metadata
  const gradesSql = `
    SELECT 
      g.grade_id,
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
      c.course_code,
      c.course_name,
      c.credits,
      c.course_type,
      c.semester AS course_semester,
      c.academic_year AS course_academic_year,
      d.department_name
    FROM grades g
    INNER JOIN courses c ON g.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    WHERE g.student_id = ?
    ORDER BY c.semester ASC, c.course_code ASC, g.assessment_type ASC
  `;
  const [gradeRows] = await pool.query(gradesSql, [sid]);

  // 3. Fetch attendance stats
  const attendanceOverallSql = `
    SELECT 
      COUNT(*) AS total_lectures,
      SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present_lectures,
      SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) AS absent_lectures,
      SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) AS late_lectures,
      SUM(CASE WHEN status = 'Excused' THEN 1 ELSE 0 END) AS excused_lectures,
      ROUND((SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100, 2) AS overall_percentage
    FROM attendance
    WHERE student_id = ?
  `;
  const [attOverallRows] = await pool.query(attendanceOverallSql, [sid]);
  const attOverall = attOverallRows[0] || {};
  const totalLectures = parseInt(attOverall.total_lectures, 10) || 0;
  const presentLectures = parseInt(attOverall.present_lectures, 10) || 0;
  const overallAttendancePct = attOverall.overall_percentage !== null && attOverall.overall_percentage !== undefined
    ? parseFloat(attOverall.overall_percentage)
    : (totalLectures > 0 ? Math.round((presentLectures / totalLectures) * 10000) / 100 : 0.0);

  // Per-course attendance
  const courseAttSql = `
    SELECT 
      course_id,
      COUNT(*) AS total_lectures,
      SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present_lectures,
      ROUND((SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100, 2) AS attendance_percentage
    FROM attendance
    WHERE student_id = ?
    GROUP BY course_id
  `;
  const [courseAttRows] = await pool.query(courseAttSql, [sid]);
  const courseAttMap = new Map();
  courseAttRows.forEach(a => {
    courseAttMap.set(a.course_id, {
      total_lectures: parseInt(a.total_lectures, 10) || 0,
      present_lectures: parseInt(a.present_lectures, 10) || 0,
      attendance_percentage: a.attendance_percentage !== null ? parseFloat(a.attendance_percentage) : 0.0
    });
  });

  // 4. Calculate SGPA and academic summary
  const courseMap = new Map();
  let sumPercentage = 0.0;
  let sumGp = 0;

  const formattedGrades = gradeRows.map(g => {
    const pct = parseFloat(g.percentage) || 0.0;
    const gp = parseInt(g.grade_point, 10) || 0;
    const credits = parseFloat(g.credits) || 0.0;
    sumPercentage += pct;
    sumGp += gp;

    if (!courseMap.has(g.course_id)) {
      courseMap.set(g.course_id, {
        course_id: g.course_id,
        course_code: g.course_code,
        course_name: g.course_name,
        credits,
        grades: [],
        is_passed: true
      });
    }
    const cEntry = courseMap.get(g.course_id);
    cEntry.grades.push(g);
    if (g.letter_grade === 'F' || pct < 40.0) {
      cEntry.is_passed = false;
    }

    const cAtt = courseAttMap.get(g.course_id) || { total_lectures: 0, present_lectures: 0, attendance_percentage: null };

    return {
      grade_id: g.grade_id,
      course_id: g.course_id,
      course_code: g.course_code,
      course_name: g.course_name,
      credits,
      course_type: g.course_type,
      semester: g.course_semester,
      academic_year: g.course_academic_year,
      assessment_type: g.assessment_type,
      internal_marks: parseFloat(g.internal_marks) || 0.0,
      external_marks: parseFloat(g.external_marks) || 0.0,
      practical_marks: parseFloat(g.practical_marks) || 0.0,
      total_marks: parseFloat(g.total_marks) || 0.0,
      max_marks: parseFloat(g.max_marks) || 100.0,
      percentage: pct,
      letter_grade: g.letter_grade,
      grade_point: gp,
      status: pct >= 40.0 ? 'Pass' : 'Fail',
      exam_session: g.exam_session,
      remarks: g.remarks,
      course_attendance_percentage: cAtt.attendance_percentage
    };
  });

  let totalCredits = 0.0;
  let totalWeightedGp = 0.0;
  let passedCourses = 0;
  let failedCourses = 0;

  courseMap.forEach(c => {
    totalCredits += c.credits;
    if (c.is_passed) {
      passedCourses++;
    } else {
      failedCourses++;
    }
    const avgGp = c.grades.reduce((s, x) => s + (parseInt(x.grade_point, 10) || 0), 0) / c.grades.length;
    totalWeightedGp += c.credits * avgGp;
  });

  const totalResults = formattedGrades.length;
  const avgPercentage = totalResults > 0 ? Math.round((sumPercentage / totalResults) * 100) / 100 : 0.0;
  const avgGradePoint = totalResults > 0 ? Math.round((sumGp / totalResults) * 100) / 100 : 0.0;
  const sgpa = totalCredits > 0 ? Math.round((totalWeightedGp / totalCredits) * 100) / 100 : 0.0;

  // Rule-based risk assessment
  let riskStatus = 'Good';
  const riskReasons = [];

  if (totalResults > 0) {
    if (failedCourses > 0) {
      riskReasons.push(`Failed in ${failedCourses} course(s)`);
    }
    if (avgPercentage < 50.0) {
      riskReasons.push(`Average percentage below 50% (${avgPercentage}%)`);
    }
  }

  if (totalLectures > 0 && overallAttendancePct < LOW_ATTENDANCE_THRESHOLD) {
    riskReasons.push(`Low attendance below 75% (${overallAttendancePct}%)`);
  }

  if (failedCourses > 0 || (totalResults > 0 && avgPercentage < 40.0) || (avgPercentage < 50.0 && totalLectures > 0 && overallAttendancePct < LOW_ATTENDANCE_THRESHOLD)) {
    riskStatus = 'At Risk';
  } else if ((totalResults > 0 && avgPercentage < 50.0) || (totalLectures > 0 && overallAttendancePct < LOW_ATTENDANCE_THRESHOLD)) {
    riskStatus = 'Needs Attention';
  }

  return {
    student_information: {
      student_id: student.student_id,
      prn_number: student.prn_number,
      student_name: student.student_name,
      first_name: student.first_name,
      last_name: student.last_name,
      email: student.email,
      phone: student.phone,
      department_id: student.department_id,
      department_name: student.department_name,
      department_code: student.department_code,
      class_name: student.class_name,
      division: student.division,
      semester: student.semester,
      admission_date: student.admission_date
    },
    academic_summary: {
      total_courses: courseMap.size,
      total_results: totalResults,
      total_credits: totalCredits,
      average_percentage: avgPercentage,
      average_grade_point: avgGradePoint,
      sgpa,
      passed_courses: passedCourses,
      failed_courses: failedCourses,
      risk_status: riskStatus,
      risk_reasons: riskReasons
    },
    attendance_summary: {
      total_lectures: totalLectures,
      present_lectures: presentLectures,
      absent_lectures: parseInt(attOverall.absent_lectures, 10) || 0,
      late_lectures: parseInt(attOverall.late_lectures, 10) || 0,
      excused_lectures: parseInt(attOverall.excused_lectures, 10) || 0,
      attendance_percentage: overallAttendancePct,
      is_low_attendance: totalLectures > 0 && overallAttendancePct < LOW_ATTENDANCE_THRESHOLD
    },
    courses: formattedGrades
  };
};

/**
 * 3. Course-Level Analytics
 * GET /api/performance/course/:courseId
 */
const getCoursePerformance = async (courseId, filters = {}) => {
  const cid = parseInt(courseId, 10);
  if (isNaN(cid) || cid <= 0) return null;

  // 1. Fetch course details
  const courseSql = `
    SELECT 
      c.course_id,
      c.course_code,
      c.course_name,
      c.department_id,
      c.credits,
      c.course_type,
      c.academic_year,
      c.semester,
      d.department_name,
      d.department_code
    FROM courses c
    LEFT JOIN departments d ON c.department_id = d.department_id
    WHERE c.course_id = ?
    LIMIT 1
  `;
  const [courseRows] = await pool.query(courseSql, [cid]);
  if (!courseRows[0]) return null;
  const course = courseRows[0];

  // 2. Fetch grades for this course
  const conditions = ['g.course_id = ?'];
  const params = [cid];

  if (filters.academic_year && filters.academic_year.trim()) {
    conditions.push('c.academic_year = ?');
    params.push(filters.academic_year.trim());
  }
  if (filters.semester) {
    const sem = parseInt(filters.semester, 10);
    if (!isNaN(sem) && sem >= 1 && sem <= 12) {
      conditions.push('c.semester = ?');
      params.push(sem);
    }
  }

  const gradesSql = `
    SELECT 
      g.grade_id,
      g.student_id,
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
      s.prn_number,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS student_name,
      s.semester AS student_semester
    FROM grades g
    INNER JOIN students s ON g.student_id = s.student_id
    INNER JOIN users u ON s.user_id = u.user_id
    INNER JOIN courses c ON g.course_id = c.course_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY g.percentage DESC, s.prn_number ASC
  `;
  const [gradeRows] = await pool.query(gradesSql, params);

  const totalResults = gradeRows.length;
  const studentSet = new Set(gradeRows.map(r => r.student_id));
  const evaluatedCount = studentSet.size;

  let sumMarks = 0.0;
  let sumPercentage = 0.0;
  let sumGradePoints = 0;
  let passedCount = 0;
  let failedCount = 0;

  const distribution = createEmptyDistribution();

  const roster = gradeRows.map(g => {
    const totalMarks = parseFloat(g.total_marks) || 0.0;
    const maxMarks = parseFloat(g.max_marks) || 100.0;
    const pct = parseFloat(g.percentage) || 0.0;
    const gp = parseInt(g.grade_point, 10) || 0;
    const isPass = pct >= 40.0;

    sumMarks += totalMarks;
    sumPercentage += pct;
    sumGradePoints += gp;

    if (isPass) {
      passedCount++;
    } else {
      failedCount++;
    }

    if (distribution[g.letter_grade]) {
      distribution[g.letter_grade].count++;
    }

    return {
      grade_id: g.grade_id,
      student_id: g.student_id,
      student_name: g.student_name,
      prn_number: g.prn_number,
      student_semester: g.student_semester,
      assessment_type: g.assessment_type,
      total_marks: totalMarks,
      max_marks: maxMarks,
      percentage: pct,
      letter_grade: g.letter_grade,
      grade_point: gp,
      status: isPass ? 'Pass' : 'Fail',
      exam_session: g.exam_session
    };
  });

  ALL_LETTER_GRADES.forEach(lg => {
    distribution[lg].percentage = totalResults > 0
      ? Math.round((distribution[lg].count / totalResults) * 10000) / 100
      : 0.0;
  });

  const avgMarks = totalResults > 0 ? Math.round((sumMarks / totalResults) * 100) / 100 : 0.0;
  const avgPercentage = totalResults > 0 ? Math.round((sumPercentage / totalResults) * 100) / 100 : 0.0;
  const avgGradePoint = totalResults > 0 ? Math.round((sumGradePoints / totalResults) * 100) / 100 : 0.0;
  const passPercentage = totalResults > 0 ? Math.round((passedCount / totalResults) * 10000) / 100 : 0.0;

  return {
    course: {
      course_id: course.course_id,
      course_code: course.course_code,
      course_name: course.course_name,
      department_id: course.department_id,
      department_name: course.department_name,
      department_code: course.department_code,
      credits: parseFloat(course.credits) || 0.0,
      course_type: course.course_type,
      academic_year: course.academic_year,
      semester: course.semester
    },
    statistics: {
      total_students_evaluated: evaluatedCount,
      total_results: totalResults,
      average_marks: avgMarks,
      average_percentage: avgPercentage,
      average_grade_point: avgGradePoint,
      passed_count: passedCount,
      failed_count: failedCount,
      pass_percentage: passPercentage
    },
    grade_distribution: distribution,
    students: roster
  };
};

/**
 * 4. Department-Level Analytics
 * GET /api/performance/department/:departmentId
 */
const getDepartmentPerformance = async (departmentId) => {
  const did = parseInt(departmentId, 10);
  if (isNaN(did) || did <= 0) return null;

  // 1. Fetch department details
  const deptSql = `
    SELECT department_id, department_code, department_name, is_active
    FROM departments
    WHERE department_id = ?
    LIMIT 1
  `;
  const [deptRows] = await pool.query(deptSql, [did]);
  if (!deptRows[0]) return null;
  const dept = deptRows[0];

  // 2. Count total students registered under this department
  const [studCountRows] = await pool.query(
    'SELECT COUNT(*) AS total_students FROM students WHERE department_id = ?',
    [did]
  );
  const totalStudents = parseInt(studCountRows[0].total_students, 10) || 0;

  // 3. Fetch all grades belonging to students in this department
  const gradesSql = `
    SELECT 
      g.grade_id,
      g.student_id,
      g.total_marks,
      g.max_marks,
      g.percentage,
      g.letter_grade,
      g.grade_point
    FROM grades g
    INNER JOIN students s ON g.student_id = s.student_id
    WHERE s.department_id = ?
  `;
  const [gradeRows] = await pool.query(gradesSql, [did]);

  const totalResults = gradeRows.length;
  const studentSet = new Set(gradeRows.map(r => r.student_id));
  const studentsWithResults = studentSet.size;

  let sumMarks = 0.0;
  let sumPercentage = 0.0;
  let passedCount = 0;
  let failedCount = 0;

  const distribution = createEmptyDistribution();

  gradeRows.forEach(g => {
    const marks = parseFloat(g.total_marks) || 0.0;
    const pct = parseFloat(g.percentage) || 0.0;
    sumMarks += marks;
    sumPercentage += pct;

    if (pct >= 40.0) {
      passedCount++;
    } else {
      failedCount++;
    }

    if (distribution[g.letter_grade]) {
      distribution[g.letter_grade].count++;
    }
  });

  ALL_LETTER_GRADES.forEach(lg => {
    distribution[lg].percentage = totalResults > 0
      ? Math.round((distribution[lg].count / totalResults) * 10000) / 100
      : 0.0;
  });

  const avgMarks = totalResults > 0 ? Math.round((sumMarks / totalResults) * 100) / 100 : 0.0;
  const avgPercentage = totalResults > 0 ? Math.round((sumPercentage / totalResults) * 100) / 100 : 0.0;
  const passPercentage = totalResults > 0 ? Math.round((passedCount / totalResults) * 10000) / 100 : 0.0;

  return {
    department: {
      department_id: dept.department_id,
      department_code: dept.department_code,
      department_name: dept.department_name,
      is_active: dept.is_active
    },
    statistics: {
      total_students: totalStudents,
      students_with_results: studentsWithResults,
      total_results: totalResults,
      average_marks: avgMarks,
      average_percentage: avgPercentage,
      pass_percentage: passPercentage,
      passed_count: passedCount,
      failed_count: failedCount
    },
    grade_distribution: distribution
  };
};

/**
 * 5. Semester-Level Performance
 * GET /api/performance/semester
 */
const getSemesterPerformance = async (filters = {}) => {
  const { academic_year, semester, department_id } = filters;
  const conditions = [];
  const params = [];

  if (academic_year && academic_year.trim()) {
    conditions.push('c.academic_year = ?');
    params.push(academic_year.trim());
  }

  if (semester) {
    const sem = parseInt(semester, 10);
    if (!isNaN(sem) && sem >= 1 && sem <= 12) {
      conditions.push('c.semester = ?');
      params.push(sem);
    }
  }

  if (department_id) {
    const did = parseInt(department_id, 10);
    if (!isNaN(did) && did > 0) {
      conditions.push('(c.department_id = ? OR s.department_id = ?)');
      params.push(did, did);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      g.grade_id,
      g.student_id,
      g.percentage,
      g.grade_point,
      g.letter_grade,
      c.semester AS course_semester,
      c.academic_year AS course_academic_year
    FROM grades g
    INNER JOIN courses c ON g.course_id = c.course_id
    INNER JOIN students s ON g.student_id = s.student_id
    ${whereClause}
  `;
  const [rows] = await pool.query(sql, params);

  const totalResults = rows.length;
  const studentSet = new Set(rows.map(r => r.student_id));
  const totalStudentsEvaluated = studentSet.size;

  let sumPercentage = 0.0;
  let sumGradePoint = 0;
  let passedCount = 0;
  let failedCount = 0;

  const distribution = createEmptyDistribution();

  rows.forEach(r => {
    const pct = parseFloat(r.percentage) || 0.0;
    const gp = parseInt(r.grade_point, 10) || 0;
    sumPercentage += pct;
    sumGradePoint += gp;

    if (pct >= 40.0) {
      passedCount++;
    } else {
      failedCount++;
    }

    if (distribution[r.letter_grade]) {
      distribution[r.letter_grade].count++;
    }
  });

  ALL_LETTER_GRADES.forEach(lg => {
    distribution[lg].percentage = totalResults > 0
      ? Math.round((distribution[lg].count / totalResults) * 10000) / 100
      : 0.0;
  });

  const avgPercentage = totalResults > 0 ? Math.round((sumPercentage / totalResults) * 100) / 100 : 0.0;
  const avgGradePoint = totalResults > 0 ? Math.round((sumGradePoint / totalResults) * 100) / 100 : 0.0;
  const passPercentage = totalResults > 0 ? Math.round((passedCount / totalResults) * 10000) / 100 : 0.0;

  return {
    filters_applied: {
      academic_year: academic_year || null,
      semester: semester ? parseInt(semester, 10) : null,
      department_id: department_id ? parseInt(department_id, 10) : null
    },
    statistics: {
      total_students_evaluated: totalStudentsEvaluated,
      total_results: totalResults,
      average_percentage: avgPercentage,
      average_grade_point: avgGradePoint,
      pass_percentage: passPercentage,
      passed_count: passedCount,
      failed_count: failedCount
    },
    grade_distribution: distribution
  };
};

/**
 * Helper to fetch aggregated metrics for all students (supporting at-risk and top performers)
 */
const getAllStudentsAggregates = async (filters = {}) => {
  const { department_id, semester } = filters;
  const conditions = [];
  const params = [];

  if (department_id) {
    const did = parseInt(department_id, 10);
    if (!isNaN(did) && did > 0) {
      conditions.push('s.department_id = ?');
      params.push(did);
    }
  }

  if (semester) {
    const sem = parseInt(semester, 10);
    if (!isNaN(sem) && sem >= 1 && sem <= 12) {
      conditions.push('s.semester = ?');
      params.push(sem);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 1. Get all students matching base filters
  const studentsSql = `
    SELECT 
      s.student_id,
      s.prn_number,
      s.semester,
      s.department_id,
      d.department_name,
      d.department_code,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS student_name,
      u.email
    FROM students s
    INNER JOIN users u ON s.user_id = u.user_id
    LEFT JOIN departments d ON s.department_id = d.department_id
    ${whereClause}
    ORDER BY s.student_id ASC
  `;
  const [students] = await pool.query(studentsSql, params);
  if (students.length === 0) return [];

  const studentIds = students.map(s => s.student_id);

  // 2. Fetch all grades for these students
  const gradesSql = `
    SELECT 
      g.student_id,
      g.course_id,
      g.percentage,
      g.letter_grade,
      g.grade_point,
      c.credits
    FROM grades g
    INNER JOIN courses c ON g.course_id = c.course_id
    WHERE g.student_id IN (?)
  `;
  const [gradeRows] = await pool.query(gradesSql, [studentIds]);

  // 3. Fetch attendance aggregates for these students
  const attSql = `
    SELECT 
      student_id,
      COUNT(*) AS total_lectures,
      SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present_lectures,
      ROUND((SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100, 2) AS attendance_percentage
    FROM attendance
    WHERE student_id IN (?)
    GROUP BY student_id
  `;
  const [attRows] = await pool.query(attSql, [studentIds]);

  const attMap = new Map();
  attRows.forEach(a => {
    const totalLectures = parseInt(a.total_lectures, 10) || 0;
    const presentLectures = parseInt(a.present_lectures, 10) || 0;
    const pct = a.attendance_percentage !== null
      ? parseFloat(a.attendance_percentage)
      : (totalLectures > 0 ? Math.round((presentLectures / totalLectures) * 10000) / 100 : 0.0);

    attMap.set(a.student_id, {
      total_lectures: totalLectures,
      present_lectures: presentLectures,
      attendance_percentage: pct,
      is_low_attendance: totalLectures > 0 && pct < LOW_ATTENDANCE_THRESHOLD
    });
  });

  // Group grades per student
  const studentGradesMap = new Map();
  gradeRows.forEach(g => {
    if (!studentGradesMap.has(g.student_id)) {
      studentGradesMap.set(g.student_id, []);
    }
    studentGradesMap.get(g.student_id).push(g);
  });

  // Build aggregated records for each student
  return students.map(s => {
    const sGrades = studentGradesMap.get(s.student_id) || [];
    const sAtt = attMap.get(s.student_id) || {
      total_lectures: 0,
      present_lectures: 0,
      attendance_percentage: null,
      is_low_attendance: false
    };

    // Calculate course-level and overall SGPA
    const courseMap = new Map();
    let sumPercentage = 0.0;
    let sumGradePoints = 0;

    sGrades.forEach(g => {
      const pct = parseFloat(g.percentage) || 0.0;
      const gp = parseInt(g.grade_point, 10) || 0;
      const credits = parseFloat(g.credits) || 0.0;
      sumPercentage += pct;
      sumGradePoints += gp;

      if (!courseMap.has(g.course_id)) {
        courseMap.set(g.course_id, {
          credits,
          grades: [],
          is_passed: true
        });
      }
      const cEntry = courseMap.get(g.course_id);
      cEntry.grades.push(g);
      if (g.letter_grade === 'F' || pct < 40.0) {
        cEntry.is_passed = false;
      }
    });

    let totalCredits = 0.0;
    let totalWeightedGp = 0.0;
    let passedCourses = 0;
    let failedCourses = 0;

    courseMap.forEach(c => {
      totalCredits += c.credits;
      if (c.is_passed) {
        passedCourses++;
      } else {
        failedCourses++;
      }
      const avgGp = c.grades.reduce((sum, item) => sum + (parseInt(item.grade_point, 10) || 0), 0) / c.grades.length;
      totalWeightedGp += c.credits * avgGp;
    });

    const totalResults = sGrades.length;
    const avgPercentage = totalResults > 0 ? Math.round((sumPercentage / totalResults) * 100) / 100 : 0.0;
    const avgGradePoint = totalResults > 0 ? Math.round((sumGradePoints / totalResults) * 100) / 100 : 0.0;
    const sgpa = totalCredits > 0 ? Math.round((totalWeightedGp / totalCredits) * 100) / 100 : 0.0;

    // Rule-based classification
    let riskStatus = 'Good';
    const reasons = [];

    if (totalResults > 0) {
      if (failedCourses > 0) {
        reasons.push(`Failed in ${failedCourses} course(s)`);
      }
      if (avgPercentage < 50.0) {
        reasons.push(`Average marks below 50% (${avgPercentage}%)`);
      }
    }

    if (sAtt.total_lectures > 0 && sAtt.attendance_percentage < LOW_ATTENDANCE_THRESHOLD) {
      reasons.push(`Low attendance below 75% (${sAtt.attendance_percentage}%)`);
    }

    if (failedCourses > 0 || (totalResults > 0 && avgPercentage < 40.0) || (avgPercentage < 50.0 && sAtt.total_lectures > 0 && sAtt.attendance_percentage < LOW_ATTENDANCE_THRESHOLD)) {
      riskStatus = 'At Risk';
    } else if ((totalResults > 0 && avgPercentage < 50.0) || (sAtt.total_lectures > 0 && sAtt.attendance_percentage < LOW_ATTENDANCE_THRESHOLD)) {
      riskStatus = 'Needs Attention';
    }

    return {
      student_id: s.student_id,
      student_name: s.student_name,
      prn_number: s.prn_number,
      department_id: s.department_id,
      department_name: s.department_name,
      department_code: s.department_code,
      semester: s.semester,
      total_courses: courseMap.size,
      total_results: totalResults,
      total_credits: totalCredits,
      average_percentage: avgPercentage,
      average_grade_point: avgGradePoint,
      sgpa,
      passed_courses: passedCourses,
      failed_courses: failedCourses,
      attendance_percentage: sAtt.attendance_percentage,
      total_lectures: sAtt.total_lectures,
      present_lectures: sAtt.present_lectures,
      is_low_attendance: sAtt.is_low_attendance,
      risk_status: riskStatus,
      reasons
    };
  });
};

/**
 * 6. Low-Performance / At-Risk Detection
 * GET /api/performance/at-risk
 */
const getAtRiskStudents = async (filters = {}) => {
  const { department_id, semester, risk_level } = filters;
  const allAggregates = await getAllStudentsAggregates({ department_id, semester });

  // Filter students who are 'At Risk' or 'Needs Attention'
  let atRiskList = allAggregates.filter(s => s.risk_status === 'At Risk' || s.risk_status === 'Needs Attention');

  if (risk_level) {
    const level = risk_level.trim().toLowerCase();
    if (level === 'at risk' || level === 'at-risk') {
      atRiskList = atRiskList.filter(s => s.risk_status === 'At Risk');
    } else if (level === 'needs attention' || level === 'needs-attention') {
      atRiskList = atRiskList.filter(s => s.risk_status === 'Needs Attention');
    }
  }

  // Sort by risk severity: 'At Risk' first, then lowest percentage, then lowest attendance
  atRiskList.sort((a, b) => {
    if (a.risk_status !== b.risk_status) {
      return a.risk_status === 'At Risk' ? -1 : 1;
    }
    if (a.failed_courses !== b.failed_courses) {
      return b.failed_courses - a.failed_courses;
    }
    return a.average_percentage - b.average_percentage;
  });

  return atRiskList.map(s => ({
    student_id: s.student_id,
    student_name: s.student_name,
    prn_number: s.prn_number,
    department_id: s.department_id,
    department_name: s.department_name,
    department_code: s.department_code,
    semester: s.semester,
    average_marks: s.average_percentage,
    average_percentage: s.average_percentage,
    sgpa: s.sgpa,
    failed_courses: s.failed_courses,
    attendance_percentage: s.attendance_percentage,
    risk_status: s.risk_status,
    reason: s.reasons.join('; ') || 'Flagged by rule-based criteria',
    reasons: s.reasons
  }));
};

/**
 * 7. Top Performers Ranking
 * GET /api/performance/top-performers
 */
const getTopPerformers = async (filters = {}) => {
  const { limit = 10, department_id, semester } = filters;
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

  const allAggregates = await getAllStudentsAggregates({ department_id, semester });

  // Only rank students who have valid academic results
  const evaluatedStudents = allAggregates.filter(s => s.total_results > 0);

  // Sort by SGPA DESC, then average_percentage DESC, then total_credits DESC
  evaluatedStudents.sort((a, b) => {
    if (b.sgpa !== a.sgpa) {
      return b.sgpa - a.sgpa;
    }
    if (b.average_percentage !== a.average_percentage) {
      return b.average_percentage - a.average_percentage;
    }
    return b.total_credits - a.total_credits;
  });

  const sliced = evaluatedStudents.slice(0, limitNum);

  return sliced.map((s, index) => ({
    rank: index + 1,
    student_id: s.student_id,
    student_name: s.student_name,
    prn_number: s.prn_number,
    department_id: s.department_id,
    department_name: s.department_name,
    department_code: s.department_code,
    semester: s.semester,
    sgpa: s.sgpa,
    average_percentage: s.average_percentage,
    total_credits: s.total_credits,
    passed_courses: s.passed_courses
  }));
};

/**
 * 8. Grade Distribution
 * GET /api/performance/grade-distribution
 */
const getGradeDistribution = async (filters = {}) => {
  const { department_id, course_id, semester, academic_year } = filters;
  const conditions = [];
  const params = [];

  if (department_id) {
    const did = parseInt(department_id, 10);
    if (!isNaN(did) && did > 0) {
      conditions.push('(c.department_id = ? OR s.department_id = ?)');
      params.push(did, did);
    }
  }

  if (course_id) {
    const cid = parseInt(course_id, 10);
    if (!isNaN(cid) && cid > 0) {
      conditions.push('g.course_id = ?');
      params.push(cid);
    }
  }

  if (semester) {
    const sem = parseInt(semester, 10);
    if (!isNaN(sem) && sem >= 1 && sem <= 12) {
      conditions.push('c.semester = ?');
      params.push(sem);
    }
  }

  if (academic_year && academic_year.trim()) {
    conditions.push('c.academic_year = ?');
    params.push(academic_year.trim());
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      g.letter_grade,
      COUNT(*) AS grade_count
    FROM grades g
    INNER JOIN courses c ON g.course_id = c.course_id
    INNER JOIN students s ON g.student_id = s.student_id
    ${whereClause}
    GROUP BY g.letter_grade
  `;
  const [rows] = await pool.query(sql, params);

  const distribution = createEmptyDistribution();
  let total = 0;

  rows.forEach(r => {
    const count = parseInt(r.grade_count, 10) || 0;
    if (distribution[r.letter_grade]) {
      distribution[r.letter_grade].count = count;
      total += count;
    }
  });

  ALL_LETTER_GRADES.forEach(lg => {
    distribution[lg].percentage = total > 0
      ? Math.round((distribution[lg].count / total) * 10000) / 100
      : 0.0;
  });

  return {
    total_results: total,
    distribution
  };
};

/**
 * 9. Attendance vs Performance Correlation
 * GET /api/performance/attendance-vs-performance
 */
const getAttendanceVsPerformance = async (filters = {}) => {
  const { department_id, course_id, semester } = filters;

  const conditions = [];
  const params = [];

  if (department_id) {
    const did = parseInt(department_id, 10);
    if (!isNaN(did) && did > 0) {
      conditions.push('s.department_id = ?');
      params.push(did);
    }
  }

  if (semester) {
    const sem = parseInt(semester, 10);
    if (!isNaN(sem) && sem >= 1 && sem <= 12) {
      conditions.push('s.semester = ?');
      params.push(sem);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get matching students
  const studSql = `
    SELECT 
      s.student_id,
      s.prn_number,
      s.semester,
      s.department_id,
      d.department_name,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS student_name
    FROM students s
    INNER JOIN users u ON s.user_id = u.user_id
    LEFT JOIN departments d ON s.department_id = d.department_id
    ${whereClause}
    ORDER BY s.student_id ASC
  `;
  const [students] = await pool.query(studSql, params);
  if (students.length === 0) return [];

  const studentIds = students.map(s => s.student_id);

  // Fetch grades grouped per student and per course
  let gradeSql = `
    SELECT 
      g.student_id,
      g.course_id,
      c.course_code,
      c.course_name,
      ROUND(AVG(g.total_marks), 2) AS average_marks,
      ROUND(AVG(g.percentage), 2) AS average_percentage,
      ROUND(AVG(g.grade_point), 2) AS average_grade_point,
      MIN(g.letter_grade) AS letter_grade
    FROM grades g
    INNER JOIN courses c ON g.course_id = c.course_id
    WHERE g.student_id IN (?)
  `;
  const gradeParams = [studentIds];

  if (course_id) {
    const cid = parseInt(course_id, 10);
    if (!isNaN(cid) && cid > 0) {
      gradeSql += ' AND g.course_id = ?';
      gradeParams.push(cid);
    }
  }

  gradeSql += ' GROUP BY g.student_id, g.course_id, c.course_code, c.course_name';
  const [gradeRows] = await pool.query(gradeSql, gradeParams);

  // Fetch attendance per student and per course
  let attSql = `
    SELECT 
      a.student_id,
      a.course_id,
      c.course_code,
      c.course_name,
      COUNT(*) AS total_lectures,
      SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_lectures,
      ROUND((SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100, 2) AS attendance_percentage
    FROM attendance a
    INNER JOIN courses c ON a.course_id = c.course_id
    WHERE a.student_id IN (?)
  `;
  const attParams = [studentIds];

  if (course_id) {
    const cid = parseInt(course_id, 10);
    if (!isNaN(cid) && cid > 0) {
      attSql += ' AND a.course_id = ?';
      attParams.push(cid);
    }
  }

  attSql += ' GROUP BY a.student_id, a.course_id, c.course_code, c.course_name';
  const [attRows] = await pool.query(attSql, attParams);

  // Student lookup map
  const studentMap = new Map();
  students.forEach(s => studentMap.set(s.student_id, s));

  // Merge keys: student_id + '_' + course_id
  const pairMap = new Map();

  gradeRows.forEach(g => {
    const key = `${g.student_id}_${g.course_id}`;
    pairMap.set(key, {
      student_id: g.student_id,
      course_id: g.course_id,
      course_code: g.course_code,
      course_name: g.course_name,
      average_marks: parseFloat(g.average_marks) || 0.0,
      percentage: parseFloat(g.average_percentage) || 0.0,
      grade_point: parseFloat(g.average_grade_point) || 0.0,
      letter_grade: g.letter_grade,
      has_grades: true,
      attendance_percentage: null,
      total_lectures: 0,
      present_lectures: 0,
      has_attendance: false
    });
  });

  attRows.forEach(a => {
    const key = `${a.student_id}_${a.course_id}`;
    const attPct = a.attendance_percentage !== null ? parseFloat(a.attendance_percentage) : 0.0;
    if (pairMap.has(key)) {
      const existing = pairMap.get(key);
      existing.attendance_percentage = attPct;
      existing.total_lectures = parseInt(a.total_lectures, 10) || 0;
      existing.present_lectures = parseInt(a.present_lectures, 10) || 0;
      existing.has_attendance = true;
    } else {
      pairMap.set(key, {
        student_id: a.student_id,
        course_id: a.course_id,
        course_code: a.course_code,
        course_name: a.course_name,
        average_marks: null,
        percentage: null,
        grade_point: null,
        letter_grade: null,
        has_grades: false,
        attendance_percentage: attPct,
        total_lectures: parseInt(a.total_lectures, 10) || 0,
        present_lectures: parseInt(a.present_lectures, 10) || 0,
        has_attendance: true
      });
    }
  });

  const results = [];
  pairMap.forEach(item => {
    const s = studentMap.get(item.student_id);
    if (s) {
      results.push({
        ...item,
        student_name: s.student_name,
        prn_number: s.prn_number,
        department_name: s.department_name,
        semester: s.semester
      });
    }
  });

  return results;
};

/**
 * 10. Paginated Student Performance List for ERP Table
 * GET /api/performance/students
 */
const getStudentsPerformanceList = async ({
  page = 1,
  limit = 10,
  search = '',
  department_id = '',
  semester = '',
  risk_status = ''
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

  // Get all aggregates matching filters
  let list = await getAllStudentsAggregates({ department_id, semester });

  // Apply text search
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(s =>
      s.student_name.toLowerCase().includes(q) ||
      s.prn_number.toLowerCase().includes(q) ||
      (s.department_name && s.department_name.toLowerCase().includes(q))
    );
  }

  // Apply risk status filter
  if (risk_status && risk_status.trim()) {
    const rs = risk_status.trim().toLowerCase();
    list = list.filter(s => s.risk_status.toLowerCase() === rs);
  }

  // Sort: students with grades by SGPA DESC, then percentage DESC; then students without grades
  list.sort((a, b) => {
    if (b.sgpa !== a.sgpa) return b.sgpa - a.sgpa;
    if (b.average_percentage !== a.average_percentage) return b.average_percentage - a.average_percentage;
    return a.student_name.localeCompare(b.student_name);
  });

  // Assign overall rank (for students with grades)
  let currentRank = 1;
  list.forEach(s => {
    if (s.total_results > 0) {
      s.rank = currentRank++;
    } else {
      s.rank = '-';
    }
  });

  const total = list.length;
  const totalPages = Math.ceil(total / limitNum) || 1;
  const offset = (pageNum - 1) * limitNum;
  const paginatedItems = list.slice(offset, offset + limitNum);

  return {
    students: paginatedItems,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    }
  };
};

module.exports = {
  LOW_ATTENDANCE_THRESHOLD,
  ALL_LETTER_GRADES,
  calculateGradeAndPoints,
  createEmptyDistribution,
  getOverviewStats,
  getStudentPerformance,
  getCoursePerformance,
  getDepartmentPerformance,
  getSemesterPerformance,
  getAtRiskStudents,
  getTopPerformers,
  getGradeDistribution,
  getAttendanceVsPerformance,
  getStudentsPerformanceList
};
