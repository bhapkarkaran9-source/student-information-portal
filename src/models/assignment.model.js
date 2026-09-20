const pool = require('../config/db');

/**
 * Assignment Data Model
 * Table: assignments, assignment_submissions
 * Database: student_portal_db
 */

/**
 * Helper to check if referenced course exists
 * @param {number} courseId
 * @returns {Promise<boolean>}
 */
const checkCourseExists = async (courseId) => {
  const cid = parseInt(courseId, 10);
  if (isNaN(cid) || cid <= 0) return false;
  const [rows] = await pool.query('SELECT course_id FROM courses WHERE course_id = ? LIMIT 1', [cid]);
  return rows.length > 0;
};

/**
 * Helper to check if referenced teacher exists and account is active
 * @param {number} teacherId
 * @returns {Promise<{ exists: boolean, isActive: boolean, teacherName: string|null, userId: number|null }>}
 */
const checkTeacherActive = async (teacherId) => {
  const tid = parseInt(teacherId, 10);
  if (isNaN(tid) || tid <= 0) return { exists: false, isActive: false, teacherName: null, userId: null };

  const sql = `
    SELECT 
      t.teacher_id, 
      u.user_id, 
      u.is_active,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name
    FROM teachers t
    INNER JOIN users u ON t.user_id = u.user_id
    WHERE t.teacher_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [tid]);
  if (!rows[0]) return { exists: false, isActive: false, teacherName: null, userId: null };

  return {
    exists: true,
    isActive: Boolean(rows[0].is_active),
    teacherName: rows[0].teacher_name,
    userId: rows[0].user_id
  };
};

/**
 * Verify teacher is assigned to course via timetable
 * @param {number} teacherId 
 * @param {number} courseId 
 * @returns {Promise<boolean>}
 */
const checkTeacherCourseAssignment = async (teacherId, courseId) => {
  const tid = parseInt(teacherId, 10);
  const cid = parseInt(courseId, 10);
  if (isNaN(tid) || isNaN(cid)) return false;

  const sql = 'SELECT 1 FROM timetable WHERE teacher_id = ? AND course_id = ? LIMIT 1';
  const [rows] = await pool.query(sql, [tid, cid]);
  return rows.length > 0;
};

/**
 * Verify student is actively enrolled in course
 * @param {number} studentId 
 * @param {number} courseId 
 * @returns {Promise<boolean>}
 */
const checkStudentEnrollment = async (studentId, courseId) => {
  const sid = parseInt(studentId, 10);
  const cid = parseInt(courseId, 10);
  if (isNaN(sid) || isNaN(cid)) return false;

  const sql = "SELECT 1 FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'Enrolled' LIMIT 1";
  const [rows] = await pool.query(sql, [sid, cid]);
  return rows.length > 0;
};

/**
 * Format raw SQL assignment row
 */
const formatAssignmentRow = (r) => {
  if (!r) return null;
  const dueDate = r.due_date ? new Date(r.due_date) : null;
  const now = new Date();
  const isOverdue = dueDate ? dueDate < now : false;

  // Base assignment status
  let derivedStatus = 'Active';
  if (isOverdue) {
    derivedStatus = 'Overdue';
  } else if (dueDate) {
    const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 3600 * 24);
    if (diffDays <= 7) {
      derivedStatus = 'Upcoming';
    }
  }

  // Student submission status resolution
  let studentSubmissionStatus = 'Not Submitted';
  if (r.submission_id) {
    const submittedAt = r.submission_submitted_at ? new Date(r.submission_submitted_at) : null;
    if (dueDate && submittedAt && submittedAt > dueDate) {
      studentSubmissionStatus = 'Late Submission';
    } else {
      studentSubmissionStatus = 'Submitted';
    }
  } else if (isOverdue) {
    studentSubmissionStatus = 'Overdue';
  } else {
    studentSubmissionStatus = 'Pending';
  }

  return {
    assignment_id: r.assignment_id,
    course_id: r.course_id,
    teacher_id: r.teacher_id,
    title: r.title,
    description: r.description || null,
    due_date: r.due_date ? r.due_date.toISOString().slice(0, 19).replace('T', ' ') : null,
    max_marks: parseFloat(r.max_marks) || 100.00,
    file_path: r.file_path || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    course_code: r.course_code || null,
    course_name: r.course_name || null,
    department_name: r.department_name || null,
    semester: r.semester || null,
    academic_year: r.academic_year || null,
    teacher_name: r.teacher_name || null,
    teacher_employee_number: r.employee_number || null,
    teacher_designation: r.designation || null,
    status: r.has_student_context ? studentSubmissionStatus : derivedStatus,
    assignment_status: derivedStatus,
    submission_status: studentSubmissionStatus,
    is_overdue: isOverdue,
    submission: r.submission_id ? {
      submission_id: r.submission_id,
      attempt_number: r.submission_attempt_number || 1,
      original_filename: r.submission_original_filename,
      file_path: r.submission_file_path,
      remarks: r.submission_remarks,
      submitted_at: r.submission_submitted_at,
      status: studentSubmissionStatus,
      is_evaluated: Boolean(r.evaluation_id),
      evaluation_status: Boolean(r.evaluation_id) ? 'Evaluated' : 'Pending Evaluation',
      marks_obtained: r.evaluation_marks_obtained !== null && r.evaluation_marks_obtained !== undefined ? parseFloat(r.evaluation_marks_obtained) : null,
      feedback: r.evaluation_feedback || null,
      evaluated_at: r.evaluation_evaluated_at ? new Date(r.evaluation_evaluated_at).toISOString().slice(0, 19).replace('T', ' ') : null
    } : null,
    evaluation: r.submission_id ? {
      is_evaluated: Boolean(r.evaluation_id),
      status: Boolean(r.evaluation_id) ? 'Evaluated' : 'Pending Evaluation',
      marks_obtained: r.evaluation_marks_obtained !== null && r.evaluation_marks_obtained !== undefined ? parseFloat(r.evaluation_marks_obtained) : null,
      max_marks: parseFloat(r.max_marks) || 100.00,
      feedback: r.evaluation_feedback || null,
      evaluated_at: r.evaluation_evaluated_at ? new Date(r.evaluation_evaluated_at).toISOString().slice(0, 19).replace('T', ' ') : null
    } : null
  };
};

/**
 * Get paginated list of assignments with multi-criteria filtering and role-based search
 */
const getAssignments = async ({
  page = 1,
  limit = 10,
  search = '',
  course_id = '',
  teacher_id = '',
  student_id = '',
  semester = '',
  academic_year = '',
  due_status = ''
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const whereConditions = [];
  const queryParams = [];

  // Search by title, description, course_code, course_name, or teacher_name
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push(`(
      a.title LIKE ? OR 
      a.description LIKE ? OR 
      c.course_code LIKE ? OR 
      c.course_name LIKE ? OR 
      u_t.first_name LIKE ? OR 
      u_t.last_name LIKE ? OR 
      CONCAT(u_t.first_name, ' ', u_t.last_name) LIKE ?
    )`);
    queryParams.push(term, term, term, term, term, term, term);
  }

  // Course filter
  if (course_id) {
    const cid = parseInt(course_id, 10);
    if (!isNaN(cid) && cid > 0) {
      whereConditions.push('a.course_id = ?');
      queryParams.push(cid);
    }
  }

  // Teacher filter (Teacher Assignment Ownership)
  if (teacher_id) {
    const tid = parseInt(teacher_id, 10);
    if (!isNaN(tid) && tid > 0) {
      whereConditions.push('a.teacher_id = ?');
      queryParams.push(tid);
    }
  }

  // Semester filter
  if (semester) {
    const sem = parseInt(semester, 10);
    if (!isNaN(sem) && sem >= 1 && sem <= 12) {
      whereConditions.push('c.semester = ?');
      queryParams.push(sem);
    }
  }

  // Academic year filter
  if (academic_year && academic_year.trim()) {
    whereConditions.push('c.academic_year = ?');
    queryParams.push(academic_year.trim());
  }

  // Due status filter
  if (due_status && due_status.trim()) {
    const ds = due_status.trim().toLowerCase();
    if (ds === 'overdue') {
      whereConditions.push('a.due_date < NOW()');
    } else if (ds === 'active') {
      whereConditions.push('a.due_date >= NOW()');
    } else if (ds === 'upcoming') {
      whereConditions.push('a.due_date >= NOW() AND a.due_date <= DATE_ADD(NOW(), INTERVAL 7 DAY)');
    }
  }

  // Student Visibility Filter: only courses where student is actively enrolled
  let studentJoinSql = '';
  let studentSelectSql = '';
  const hasStudentContext = Boolean(student_id && parseInt(student_id, 10) > 0);
  const safeStudentId = hasStudentContext ? parseInt(student_id, 10) : null;

  if (hasStudentContext) {
    studentJoinSql = `
      INNER JOIN enrollments e_stu ON a.course_id = e_stu.course_id AND e_stu.student_id = ? AND e_stu.status = 'Enrolled'
      LEFT JOIN assignment_submissions sub ON a.assignment_id = sub.assignment_id AND sub.student_id = ?
      LEFT JOIN assignment_evaluations ev ON sub.submission_id = ev.submission_id
    `;
    studentSelectSql = `
      sub.submission_id,
      sub.attempt_number AS submission_attempt_number,
      sub.original_filename AS submission_original_filename,
      sub.file_path AS submission_file_path,
      sub.remarks AS submission_remarks,
      sub.submitted_at AS submission_submitted_at,
      sub.status AS submission_raw_status,
      ev.evaluation_id,
      ev.marks_obtained AS evaluation_marks_obtained,
      ev.feedback AS evaluation_feedback,
      ev.evaluated_at AS evaluation_evaluated_at,
      1 AS has_student_context,
    `;
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // Query params for count: student join requires studentId twice if hasStudentContext
  const countParams = hasStudentContext ? [safeStudentId, safeStudentId, ...queryParams] : [...queryParams];

  // Count total records
  const countSql = `
    SELECT COUNT(DISTINCT a.assignment_id) AS total
    FROM assignments a
    INNER JOIN courses c ON a.course_id = c.course_id
    INNER JOIN teachers t ON a.teacher_id = t.teacher_id
    INNER JOIN users u_t ON t.user_id = u_t.user_id
    ${studentJoinSql}
    ${whereClause}
  `;
  const [countRows] = await pool.query(countSql, countParams);
  const total = parseInt(countRows[0]?.total, 10) || 0;
  const totalPages = Math.ceil(total / limitNum) || 1;

  // Data params
  const dataParams = hasStudentContext
    ? [safeStudentId, safeStudentId, ...queryParams, limitNum, offset]
    : [...queryParams, limitNum, offset];

  // Fetch paginated records
  const dataSql = `
    SELECT 
      a.assignment_id,
      a.course_id,
      a.teacher_id,
      a.title,
      a.description,
      a.due_date,
      a.max_marks,
      a.file_path,
      a.created_at,
      a.updated_at,
      c.course_code,
      c.course_name,
      c.semester,
      c.academic_year,
      d.department_name,
      t.employee_number,
      t.designation,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS teacher_name,
      ${studentSelectSql}
      ${hasStudentContext ? '' : '0 AS has_student_context,'}
      a.assignment_id
    FROM assignments a
    INNER JOIN courses c ON a.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers t ON a.teacher_id = t.teacher_id
    INNER JOIN users u_t ON t.user_id = u_t.user_id
    ${studentJoinSql}
    ${whereClause}
    ORDER BY a.due_date ASC, a.assignment_id DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(dataSql, dataParams);

  return {
    assignments: rows.map(formatAssignmentRow),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    }
  };
};

/**
 * Get single assignment by ID, optionally with student submission context
 */
const getAssignmentById = async (id, studentId = null) => {
  const aid = parseInt(id, 10);
  if (isNaN(aid) || aid <= 0) return null;

  const hasStudentContext = Boolean(studentId && parseInt(studentId, 10) > 0);
  const safeStudentId = hasStudentContext ? parseInt(studentId, 10) : null;

  let subJoin = '';
  let subSelect = '0 AS has_student_context,';
  const params = [aid];

  if (hasStudentContext) {
    subJoin = `
      LEFT JOIN assignment_submissions sub ON a.assignment_id = sub.assignment_id AND sub.student_id = ?
      LEFT JOIN assignment_evaluations ev ON sub.submission_id = ev.submission_id
    `;
    subSelect = `
      sub.submission_id,
      sub.attempt_number AS submission_attempt_number,
      sub.original_filename AS submission_original_filename,
      sub.file_path AS submission_file_path,
      sub.remarks AS submission_remarks,
      sub.submitted_at AS submission_submitted_at,
      sub.status AS submission_raw_status,
      ev.evaluation_id,
      ev.marks_obtained AS evaluation_marks_obtained,
      ev.feedback AS evaluation_feedback,
      ev.evaluated_at AS evaluation_evaluated_at,
      1 AS has_student_context,
    `;
    params.unshift(safeStudentId);
  }

  const sql = `
    SELECT 
      a.assignment_id,
      a.course_id,
      a.teacher_id,
      a.title,
      a.description,
      a.due_date,
      a.max_marks,
      a.file_path,
      a.created_at,
      a.updated_at,
      c.course_code,
      c.course_name,
      c.semester,
      c.academic_year,
      d.department_name,
      t.employee_number,
      t.designation,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS teacher_name,
      ${subSelect}
      a.assignment_id
    FROM assignments a
    INNER JOIN courses c ON a.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers t ON a.teacher_id = t.teacher_id
    INNER JOIN users u_t ON t.user_id = u_t.user_id
    ${subJoin}
    WHERE a.assignment_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, params);
  if (!rows[0]) return null;
  return formatAssignmentRow(rows[0]);
};

/**
 * Get summary KPI statistics for assignments
 */
const getAssignmentStats = async (teacherId = null) => {
  let where = '';
  const params = [];
  if (teacherId) {
    where = 'WHERE teacher_id = ?';
    params.push(parseInt(teacherId, 10));
  }

  const sql = `
    SELECT 
      COUNT(*) AS total_assignments,
      SUM(CASE WHEN due_date >= NOW() THEN 1 ELSE 0 END) AS active_assignments,
      SUM(CASE WHEN due_date >= NOW() AND due_date <= DATE_ADD(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS upcoming_assignments,
      SUM(CASE WHEN due_date < NOW() THEN 1 ELSE 0 END) AS overdue_assignments
    FROM assignments
    ${where}
  `;
  const [rows] = await pool.query(sql, params);
  const r = rows[0] || {};
  return {
    total_assignments: parseInt(r.total_assignments, 10) || 0,
    active_assignments: parseInt(r.active_assignments, 10) || 0,
    upcoming_assignments: parseInt(r.upcoming_assignments, 10) || 0,
    overdue_assignments: parseInt(r.overdue_assignments, 10) || 0
  };
};

/**
 * Get all submissions for an assignment, showing all actively enrolled students with submission status and KPIs
 * @param {number} assignmentId
 */
const getAssignmentSubmissions = async (assignmentId) => {
  const aid = parseInt(assignmentId, 10);
  if (isNaN(aid) || aid <= 0) return null;

  const assignment = await getAssignmentById(aid);
  if (!assignment) return null;

  const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;

  const sql = `
    SELECT 
      s.student_id,
      s.prn_number,
      s.class_name,
      s.division,
      s.user_id,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS student_name,
      u.email AS student_email,
      sub.submission_id,
      sub.attempt_number,
      sub.original_filename,
      sub.file_path,
      sub.remarks,
      sub.submitted_at,
      sub.updated_at,
      sub.status AS raw_status,
      ev.evaluation_id,
      ev.marks_obtained,
      ev.feedback,
      ev.evaluated_at,
      ev.updated_at AS evaluation_updated_at,
      ev.evaluated_by_teacher_id
    FROM enrollments e
    INNER JOIN students s ON e.student_id = s.student_id
    INNER JOIN users u ON s.user_id = u.user_id
    LEFT JOIN assignment_submissions sub ON sub.assignment_id = ? AND sub.student_id = s.student_id
    LEFT JOIN assignment_evaluations ev ON sub.submission_id = ev.submission_id
    WHERE e.course_id = ? AND e.status = 'Enrolled'
    ORDER BY s.prn_number ASC
  `;
  const [rows] = await pool.query(sql, [aid, assignment.course_id]);

  let submittedCount = 0;
  let lateCount = 0;
  let notSubmittedCount = 0;
  let evaluatedCount = 0;
  let pendingEvaluationCount = 0;

  const students = rows.map((r) => {
    let status = 'Not Submitted';
    let isLate = false;
    let evaluationStatus = 'Not Submitted';
    const isEvaluated = Boolean(r.evaluation_id);

    if (r.submission_id) {
      const submittedAt = r.submitted_at ? new Date(r.submitted_at) : null;
      if (dueDate && submittedAt && submittedAt > dueDate) {
        status = 'Late Submission';
        isLate = true;
        lateCount++;
      } else {
        status = 'Submitted';
        submittedCount++;
      }

      if (isEvaluated) {
        evaluationStatus = 'Evaluated';
        evaluatedCount++;
      } else {
        evaluationStatus = 'Pending Evaluation';
        pendingEvaluationCount++;
      }
    } else {
      notSubmittedCount++;
    }

    return {
      student_id: r.student_id,
      prn_number: r.prn_number,
      class_name: r.class_name || '-',
      division: r.division || '-',
      student_name: r.student_name,
      student_email: r.student_email,
      submission_id: r.submission_id || null,
      status,
      is_late: isLate,
      is_submitted: Boolean(r.submission_id),
      submitted_at: r.submitted_at ? new Date(r.submitted_at).toISOString().slice(0, 19).replace('T', ' ') : null,
      updated_at: r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : null,
      original_filename: r.original_filename || null,
      attempt_number: r.submission_id ? (r.attempt_number || 1) : 0,
      // Evaluation details
      evaluation_id: r.evaluation_id || null,
      is_evaluated: isEvaluated,
      evaluation_status: evaluationStatus,
      marks_obtained: r.marks_obtained !== null && r.marks_obtained !== undefined ? parseFloat(r.marks_obtained) : null,
      feedback: r.feedback || null,
      evaluated_at: r.evaluated_at ? new Date(r.evaluated_at).toISOString().slice(0, 19).replace('T', ' ') : null,
      evaluation_updated_at: r.evaluation_updated_at ? new Date(r.evaluation_updated_at).toISOString().slice(0, 19).replace('T', ' ') : null,
      evaluated_by_teacher_id: r.evaluated_by_teacher_id || null,
      evaluation: isEvaluated ? {
        evaluation_id: r.evaluation_id,
        submission_id: r.submission_id,
        marks_obtained: r.marks_obtained !== null && r.marks_obtained !== undefined ? parseFloat(r.marks_obtained) : null,
        feedback: r.feedback || null,
        evaluated_at: r.evaluated_at ? new Date(r.evaluated_at).toISOString().slice(0, 19).replace('T', ' ') : null,
        evaluation_updated_at: r.evaluation_updated_at ? new Date(r.evaluation_updated_at).toISOString().slice(0, 19).replace('T', ' ') : null,
        evaluated_by_teacher_id: r.evaluated_by_teacher_id || null
      } : null
    };
  });

  return {
    assignment: {
      assignment_id: assignment.assignment_id,
      course_id: assignment.course_id,
      teacher_id: assignment.teacher_id,
      title: assignment.title,
      course_code: assignment.course_code,
      course_name: assignment.course_name,
      due_date: assignment.due_date,
      max_marks: assignment.max_marks,
      is_overdue: assignment.is_overdue
    },
    kpis: {
      total_students: students.length,
      submitted: submittedCount,
      not_submitted: notSubmittedCount,
      late_submitted: lateCount,
      evaluated: evaluatedCount,
      pending_evaluation: pendingEvaluationCount
    },
    students
  };
};

/**
 * Create or update student submission
 * Before replacing an existing submission:
 * - saves previous attempt into assignment_submission_history
 * - increments attempt_number
 * - updates current record in assignment_submissions
 * - resets current evaluation so new attempt is pending grading
 */
const createOrUpdateSubmission = async ({
  assignment_id,
  student_id,
  original_filename,
  file_path,
  remarks = null
}) => {
  const aid = parseInt(assignment_id, 10);
  const sid = parseInt(student_id, 10);

  // Retrieve assignment to check due date
  const assignment = await getAssignmentById(aid);
  if (!assignment) throw new Error('Assignment not found');

  const now = new Date();
  const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
  const status = (dueDate && now > dueDate) ? 'Late Submission' : 'Submitted';

  // Check if an existing submission already exists for this student & assignment
  const [existingRows] = await pool.query(
    `SELECT 
       sub.submission_id,
       sub.assignment_id,
       sub.student_id,
       sub.attempt_number,
       sub.original_filename,
       sub.file_path,
       sub.remarks,
       sub.submitted_at,
       sub.status,
       ev.evaluation_id,
       ev.marks_obtained,
       ev.feedback,
       ev.evaluated_at,
       ev.evaluated_by_teacher_id
     FROM assignment_submissions sub
     LEFT JOIN assignment_evaluations ev ON sub.submission_id = ev.submission_id
     WHERE sub.assignment_id = ? AND sub.student_id = ?
     LIMIT 1`,
    [aid, sid]
  );

  let attemptNumber = 1;

  if (existingRows.length > 0) {
    const prev = existingRows[0];
    const prevAttempt = prev.attempt_number || 1;
    attemptNumber = prevAttempt + 1;

    // 1. Archive previous attempt into assignment_submission_history
    const archiveSql = `
      INSERT INTO assignment_submission_history (
        submission_id,
        assignment_id,
        student_id,
        attempt_number,
        original_filename,
        file_path,
        file_size,
        remarks,
        submitted_at,
        submission_status,
        marks_obtained,
        feedback,
        evaluated_at,
        evaluated_by_teacher_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        original_filename = VALUES(original_filename),
        file_path = VALUES(file_path),
        file_size = VALUES(file_size),
        remarks = VALUES(remarks),
        submitted_at = VALUES(submitted_at),
        submission_status = VALUES(submission_status),
        marks_obtained = VALUES(marks_obtained),
        feedback = VALUES(feedback),
        evaluated_at = VALUES(evaluated_at),
        evaluated_by_teacher_id = VALUES(evaluated_by_teacher_id)
    `;

    await pool.query(archiveSql, [
      prev.submission_id,
      aid,
      sid,
      prevAttempt,
      prev.original_filename,
      prev.file_path,
      prev.file_size || null,
      prev.remarks || null,
      prev.submitted_at,
      prev.status || 'Submitted',
      prev.marks_obtained !== null && prev.marks_obtained !== undefined ? parseFloat(prev.marks_obtained) : null,
      prev.feedback || null,
      prev.evaluated_at || null,
      prev.evaluated_by_teacher_id || null
    ]);

    // 2. Update current submission record
    const updateSql = `
      UPDATE assignment_submissions
      SET 
        original_filename = ?,
        file_path = ?,
        remarks = ?,
        submitted_at = NOW(),
        updated_at = NOW(),
        status = ?,
        attempt_number = ?
      WHERE submission_id = ?
    `;

    await pool.query(updateSql, [
      original_filename.trim(),
      file_path.trim(),
      remarks && remarks.trim() ? remarks.trim() : null,
      status,
      attemptNumber,
      prev.submission_id
    ]);

    // 3. Delete current evaluation so new attempt is pending evaluation
    // (Previous attempt evaluation is safely preserved in assignment_submission_history)
    await pool.query('DELETE FROM assignment_evaluations WHERE submission_id = ?', [prev.submission_id]);
  } else {
    // First attempt
    const insertSql = `
      INSERT INTO assignment_submissions (
        assignment_id, student_id, original_filename, file_path, remarks, submitted_at, status, attempt_number
      )
      VALUES (?, ?, ?, ?, ?, NOW(), ?, 1)
    `;

    await pool.query(insertSql, [
      aid,
      sid,
      original_filename.trim(),
      file_path.trim(),
      remarks && remarks.trim() ? remarks.trim() : null,
      status
    ]);
  }

  return getStudentSubmission(aid, sid);
};

/**
 * Get student's submission for an assignment
 */
const getStudentSubmission = async (assignmentId, studentId) => {
  const aid = parseInt(assignmentId, 10);
  const sid = parseInt(studentId, 10);
  if (isNaN(aid) || isNaN(sid)) return null;

  const sql = `
    SELECT 
      sub.submission_id,
      sub.assignment_id,
      sub.student_id,
      sub.attempt_number,
      sub.original_filename,
      sub.file_path,
      sub.remarks,
      sub.submitted_at,
      sub.updated_at,
      sub.status,
      a.title AS assignment_title,
      a.due_date,
      a.max_marks,
      a.course_id,
      c.course_code,
      c.course_name,
      ev.evaluation_id,
      ev.marks_obtained,
      ev.feedback,
      ev.evaluated_at,
      ev.updated_at AS evaluation_updated_at
    FROM assignment_submissions sub
    INNER JOIN assignments a ON sub.assignment_id = a.assignment_id
    INNER JOIN courses c ON a.course_id = c.course_id
    LEFT JOIN assignment_evaluations ev ON sub.submission_id = ev.submission_id
    WHERE sub.assignment_id = ? AND sub.student_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [aid, sid]);
  if (!rows[0]) return null;
  const row = rows[0];
  const isEvaluated = Boolean(row.evaluation_id);
  return {
    ...row,
    attempt_number: row.attempt_number || 1,
    is_evaluated: isEvaluated,
    evaluation_status: isEvaluated ? 'Evaluated' : 'Pending Evaluation',
    marks_obtained: isEvaluated && row.marks_obtained !== null && row.marks_obtained !== undefined ? parseFloat(row.marks_obtained) : null,
    max_marks: parseFloat(row.max_marks) || 100,
    feedback: row.feedback || null,
    evaluated_at: row.evaluated_at ? new Date(row.evaluated_at).toISOString().slice(0, 19).replace('T', ' ') : null,
    evaluation_updated_at: row.evaluation_updated_at ? new Date(row.evaluation_updated_at).toISOString().slice(0, 19).replace('T', ' ') : null
  };
};

/**
 * Get submission by submission ID with relations for download authorization and evaluation
 */
const getSubmissionById = async (submissionId) => {
  const sid = parseInt(submissionId, 10);
  if (isNaN(sid) || sid <= 0) return null;

  const sql = `
    SELECT 
      sub.submission_id,
      sub.assignment_id,
      sub.student_id,
      sub.attempt_number,
      sub.original_filename,
      sub.file_path,
      sub.remarks,
      sub.submitted_at,
      sub.updated_at,
      sub.status,
      a.title AS assignment_title,
      a.teacher_id,
      a.course_id,
      a.max_marks,
      t.user_id AS teacher_user_id,
      s.user_id AS student_user_id,
      s.prn_number,
      TRIM(CONCAT(u_s.first_name, ' ', u_s.last_name)) AS student_name,
      c.course_code,
      c.course_name,
      ev.evaluation_id,
      ev.marks_obtained,
      ev.feedback,
      ev.evaluated_at,
      ev.updated_at AS evaluation_updated_at,
      ev.evaluated_by_teacher_id
    FROM assignment_submissions sub
    INNER JOIN assignments a ON sub.assignment_id = a.assignment_id
    INNER JOIN teachers t ON a.teacher_id = t.teacher_id
    INNER JOIN students s ON sub.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    INNER JOIN courses c ON a.course_id = c.course_id
    LEFT JOIN assignment_evaluations ev ON sub.submission_id = ev.submission_id
    WHERE sub.submission_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [sid]);
  if (!rows[0]) return null;
  const row = rows[0];
  const isEvaluated = Boolean(row.evaluation_id);
  return {
    ...row,
    attempt_number: row.attempt_number || 1,
    is_evaluated: isEvaluated,
    evaluation_status: isEvaluated ? 'Evaluated' : 'Pending Evaluation',
    marks_obtained: isEvaluated && row.marks_obtained !== null && row.marks_obtained !== undefined ? parseFloat(row.marks_obtained) : null,
    max_marks: parseFloat(row.max_marks) || 100,
    feedback: row.feedback || null,
    evaluated_at: row.evaluated_at ? new Date(row.evaluated_at).toISOString().slice(0, 19).replace('T', ' ') : null,
    evaluation_updated_at: row.evaluation_updated_at ? new Date(row.evaluation_updated_at).toISOString().slice(0, 19).replace('T', ' ') : null
  };
};

/**
 * Upsert assignment evaluation record (one evaluation per submission)
 */
const evaluateSubmission = async ({
  submission_id,
  assignment_id,
  student_id,
  teacher_id,
  marks_obtained,
  feedback = null
}) => {
  const subId = parseInt(submission_id, 10);
  const aid = parseInt(assignment_id, 10);
  const sid = parseInt(student_id, 10);
  const tid = parseInt(teacher_id, 10);
  const marks = parseFloat(marks_obtained);

  const sql = `
    INSERT INTO assignment_evaluations (
      submission_id,
      assignment_id,
      student_id,
      evaluated_by_teacher_id,
      marks_obtained,
      feedback,
      evaluated_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      evaluated_by_teacher_id = VALUES(evaluated_by_teacher_id),
      marks_obtained = VALUES(marks_obtained),
      feedback = VALUES(feedback),
      updated_at = NOW()
  `;

  await pool.query(sql, [subId, aid, sid, tid, marks, feedback && feedback.trim() ? feedback.trim() : null]);

  return getSubmissionEvaluation(subId);
};

/**
 * Get evaluation details for a submission
 */
const getSubmissionEvaluation = async (submissionId) => {
  const subId = parseInt(submissionId, 10);
  if (isNaN(subId) || subId <= 0) return null;

  const sql = `
    SELECT 
      ev.evaluation_id,
      ev.submission_id,
      ev.assignment_id,
      ev.student_id,
      ev.evaluated_by_teacher_id,
      ev.marks_obtained,
      ev.feedback,
      ev.evaluated_at,
      ev.updated_at,
      a.title AS assignment_title,
      a.max_marks,
      a.teacher_id,
      c.course_code,
      c.course_name,
      s.prn_number,
      TRIM(CONCAT(u_s.first_name, ' ', u_s.last_name)) AS student_name,
      sub.submitted_at,
      sub.status AS submission_status,
      sub.original_filename
    FROM assignment_evaluations ev
    INNER JOIN assignment_submissions sub ON ev.submission_id = sub.submission_id
    INNER JOIN assignments a ON ev.assignment_id = a.assignment_id
    INNER JOIN courses c ON a.course_id = c.course_id
    INNER JOIN students s ON ev.student_id = s.student_id
    INNER JOIN users u_s ON s.user_id = u_s.user_id
    WHERE ev.submission_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [subId]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    ...r,
    marks_obtained: parseFloat(r.marks_obtained),
    max_marks: parseFloat(r.max_marks) || 100,
    is_evaluated: true,
    evaluation_status: 'Evaluated',
    evaluated_at: r.evaluated_at ? new Date(r.evaluated_at).toISOString().slice(0, 19).replace('T', ' ') : null,
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : null
  };
};

/**
 * Get evaluation details for student's submission on an assignment
 */
const getStudentEvaluation = async (assignmentId, studentId) => {
  const aid = parseInt(assignmentId, 10);
  const sid = parseInt(studentId, 10);
  if (isNaN(aid) || isNaN(sid)) return null;

  const sql = `
    SELECT 
      ev.evaluation_id,
      ev.submission_id,
      ev.assignment_id,
      ev.student_id,
      ev.marks_obtained,
      ev.feedback,
      ev.evaluated_at,
      ev.updated_at,
      a.title AS assignment_title,
      a.max_marks,
      c.course_code,
      c.course_name,
      sub.submitted_at,
      sub.status AS submission_status,
      sub.original_filename
    FROM assignment_submissions sub
    INNER JOIN assignments a ON sub.assignment_id = a.assignment_id
    INNER JOIN courses c ON a.course_id = c.course_id
    LEFT JOIN assignment_evaluations ev ON sub.submission_id = ev.submission_id
    WHERE sub.assignment_id = ? AND sub.student_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [aid, sid]);
  if (!rows[0]) return null;
  const r = rows[0];
  const isEvaluated = Boolean(r.evaluation_id);
  return {
    evaluation_id: r.evaluation_id || null,
    submission_id: r.submission_id,
    assignment_id: r.assignment_id,
    student_id: r.student_id,
    assignment_title: r.assignment_title,
    course_code: r.course_code,
    course_name: r.course_name,
    max_marks: parseFloat(r.max_marks) || 100,
    submitted_at: r.submitted_at ? new Date(r.submitted_at).toISOString().slice(0, 19).replace('T', ' ') : null,
    submission_status: r.submission_status,
    original_filename: r.original_filename,
    is_evaluated: isEvaluated,
    evaluation_status: isEvaluated ? 'Evaluated' : 'Pending Evaluation',
    marks_obtained: isEvaluated && r.marks_obtained !== null ? parseFloat(r.marks_obtained) : null,
    feedback: r.feedback || null,
    evaluated_at: r.evaluated_at ? new Date(r.evaluated_at).toISOString().slice(0, 19).replace('T', ' ') : null,
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 19).replace('T', ' ') : null
  };
};

/**
 * Get all students actively enrolled in a course to send notification
 */
const getEnrolledStudentUserIds = async (courseId) => {
  const cid = parseInt(courseId, 10);
  if (isNaN(cid) || cid <= 0) return [];

  const sql = `
    SELECT DISTINCT s.user_id 
    FROM enrollments e
    INNER JOIN students s ON e.student_id = s.student_id
    WHERE e.course_id = ? AND e.status = 'Enrolled'
  `;
  const [rows] = await pool.query(sql, [cid]);
  return rows.map(r => r.user_id);
};

/**
 * Create a new assignment
 */
const createAssignment = async ({
  course_id,
  teacher_id,
  title,
  description = null,
  due_date,
  max_marks = 100.00,
  file_path = null
}) => {
  const sql = `
    INSERT INTO assignments (course_id, teacher_id, title, description, due_date, max_marks, file_path)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    parseInt(course_id, 10),
    parseInt(teacher_id, 10),
    title.trim(),
    description && description.trim() ? description.trim() : null,
    due_date,
    parseFloat(max_marks) || 100.00,
    file_path && file_path.trim() ? file_path.trim() : null
  ];
  const [result] = await pool.query(sql, params);
  return getAssignmentById(result.insertId);
};

/**
 * Update an existing assignment
 */
const updateAssignment = async (id, updateData) => {
  const aid = parseInt(id, 10);
  if (isNaN(aid) || aid <= 0) return null;

  const allowedFields = ['course_id', 'teacher_id', 'title', 'description', 'due_date', 'max_marks', 'file_path'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      if (field === 'course_id' || field === 'teacher_id') {
        params.push(parseInt(updateData[field], 10));
      } else if (field === 'max_marks') {
        params.push(parseFloat(updateData[field]));
      } else if (field === 'title' || field === 'description' || field === 'file_path') {
        params.push(updateData[field] && String(updateData[field]).trim() ? String(updateData[field]).trim() : null);
      } else {
        params.push(updateData[field]);
      }
    }
  }

  if (setClauses.length === 0) return getAssignmentById(aid);

  params.push(aid);
  const sql = `UPDATE assignments SET ${setClauses.join(', ')} WHERE assignment_id = ?`;
  await pool.query(sql, params);
  return getAssignmentById(aid);
};

/**
 * Safely delete an assignment and return submission files for disk cleanup
 */
const deleteAssignment = async (id) => {
  const aid = parseInt(id, 10);
  if (isNaN(aid) || aid <= 0) return { success: false, filesToDelete: [] };

  // Fetch all submission file paths for disk cleanup
  const [submissionRows] = await pool.query(
    'SELECT file_path FROM assignment_submissions WHERE assignment_id = ?',
    [aid]
  );
  const [historyRows] = await pool.query(
    'SELECT file_path FROM assignment_submission_history WHERE assignment_id = ?',
    [aid]
  );
  const filesToDelete = [
    ...submissionRows.map(r => r.file_path),
    ...historyRows.map(r => r.file_path)
  ].filter(Boolean);

  // Fetch assignment file_path
  const [asgRows] = await pool.query(
    'SELECT file_path FROM assignments WHERE assignment_id = ?',
    [aid]
  );
  if (asgRows[0]?.file_path) {
    filesToDelete.push(asgRows[0].file_path);
  }

  const [result] = await pool.query('DELETE FROM assignments WHERE assignment_id = ?', [aid]);
  return {
    success: result.affectedRows > 0,
    filesToDelete
  };
};

/**
 * Retrieve submission history attempts (from assignment_submission_history and current submission)
 */
const getSubmissionHistory = async (assignmentId, studentId) => {
  const aid = parseInt(assignmentId, 10);
  const sid = parseInt(studentId, 10);
  if (isNaN(aid) || isNaN(sid)) return [];

  // 1. Fetch archived history attempts
  const historySql = `
    SELECT 
      h.history_id,
      h.submission_id,
      h.assignment_id,
      h.student_id,
      h.attempt_number,
      h.original_filename,
      h.file_path,
      h.file_size,
      h.remarks,
      h.submitted_at,
      h.submission_status AS status,
      h.marks_obtained,
      h.feedback,
      h.evaluated_at,
      h.evaluated_by_teacher_id,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS evaluated_by_name
    FROM assignment_submission_history h
    LEFT JOIN teachers t ON h.evaluated_by_teacher_id = t.teacher_id
    LEFT JOIN users u_t ON t.user_id = u_t.user_id
    WHERE h.assignment_id = ? AND h.student_id = ?
    ORDER BY h.attempt_number ASC
  `;
  const [historyRows] = await pool.query(historySql, [aid, sid]);

  // 2. Fetch current submission
  const currentSql = `
    SELECT 
      sub.submission_id,
      sub.assignment_id,
      sub.student_id,
      sub.attempt_number,
      sub.original_filename,
      sub.file_path,
      sub.remarks,
      sub.submitted_at,
      sub.status,
      ev.evaluation_id,
      ev.marks_obtained,
      ev.feedback,
      ev.evaluated_at,
      ev.evaluated_by_teacher_id,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS evaluated_by_name
    FROM assignment_submissions sub
    LEFT JOIN assignment_evaluations ev ON sub.submission_id = ev.submission_id
    LEFT JOIN teachers t ON ev.evaluated_by_teacher_id = t.teacher_id
    LEFT JOIN users u_t ON t.user_id = u_t.user_id
    WHERE sub.assignment_id = ? AND sub.student_id = ?
    LIMIT 1
  `;
  const [currentRows] = await pool.query(currentSql, [aid, sid]);

  const results = [];

  // Format archived attempts
  for (const h of historyRows) {
    const isEvaluated = h.marks_obtained !== null && h.marks_obtained !== undefined;
    results.push({
      history_id: h.history_id,
      submission_id: h.submission_id,
      assignment_id: h.assignment_id,
      student_id: h.student_id,
      attempt_number: h.attempt_number,
      original_filename: h.original_filename,
      file_path: h.file_path,
      file_size: h.file_size || null,
      remarks: h.remarks || null,
      submitted_at: h.submitted_at ? new Date(h.submitted_at).toISOString().slice(0, 19).replace('T', ' ') : null,
      status: h.status || 'Submitted',
      is_evaluated: isEvaluated,
      evaluation_status: isEvaluated ? 'Evaluated' : 'Pending Evaluation',
      marks_obtained: isEvaluated ? parseFloat(h.marks_obtained) : null,
      feedback: h.feedback || null,
      evaluated_at: h.evaluated_at ? new Date(h.evaluated_at).toISOString().slice(0, 19).replace('T', ' ') : null,
      evaluated_by_teacher_id: h.evaluated_by_teacher_id || null,
      evaluated_by_name: h.evaluated_by_name || null,
      is_current: false
    });
  }

  // Format current attempt
  if (currentRows.length > 0) {
    const c = currentRows[0];
    const isEvaluated = Boolean(c.evaluation_id);
    results.push({
      history_id: null,
      submission_id: c.submission_id,
      assignment_id: c.assignment_id,
      student_id: c.student_id,
      attempt_number: c.attempt_number || 1,
      original_filename: c.original_filename,
      file_path: c.file_path,
      file_size: c.file_size || null,
      remarks: c.remarks || null,
      submitted_at: c.submitted_at ? new Date(c.submitted_at).toISOString().slice(0, 19).replace('T', ' ') : null,
      status: c.status || 'Submitted',
      is_evaluated: isEvaluated,
      evaluation_status: isEvaluated ? 'Evaluated' : 'Pending Evaluation',
      marks_obtained: isEvaluated && c.marks_obtained !== null && c.marks_obtained !== undefined ? parseFloat(c.marks_obtained) : null,
      feedback: c.feedback || null,
      evaluated_at: c.evaluated_at ? new Date(c.evaluated_at).toISOString().slice(0, 19).replace('T', ' ') : null,
      evaluated_by_teacher_id: c.evaluated_by_teacher_id || null,
      evaluated_by_name: c.evaluated_by_name || null,
      is_current: true
    });
  }

  // Sort by attempt_number ASC
  results.sort((a, b) => a.attempt_number - b.attempt_number);

  return results;
};

/**
 * Get history document record by historyId with relation checks
 */
const getHistoryDocumentById = async (historyId) => {
  const hid = parseInt(historyId, 10);
  if (isNaN(hid) || hid <= 0) return null;

  const sql = `
    SELECT 
      h.*,
      a.title AS assignment_title,
      a.course_id,
      a.teacher_id,
      s.user_id AS student_user_id
    FROM assignment_submission_history h
    INNER JOIN assignments a ON h.assignment_id = a.assignment_id
    INNER JOIN students s ON h.student_id = s.student_id
    WHERE h.history_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [hid]);
  return rows[0] || null;
};

/**
 * Find candidate assignments where enrolled students haven't submitted
 * and calculate due status (due soon within 3 days or overdue)
 */
const findPendingDueReminders = async ({ student_id = null, assignment_id = null } = {}) => {
  const params = [];
  let filterSql = '';

  if (student_id) {
    filterSql += ' AND s.student_id = ?';
    params.push(parseInt(student_id, 10));
  }
  if (assignment_id) {
    filterSql += ' AND a.assignment_id = ?';
    params.push(parseInt(assignment_id, 10));
  }

  const sql = `
    SELECT 
      a.assignment_id,
      a.title,
      a.description,
      a.due_date,
      a.course_id,
      c.course_code,
      c.course_name,
      s.student_id,
      s.user_id AS student_user_id,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS student_name
    FROM assignments a
    INNER JOIN courses c ON a.course_id = c.course_id
    INNER JOIN enrollments e ON a.course_id = e.course_id AND e.status = 'Enrolled'
    INNER JOIN students s ON e.student_id = s.student_id
    INNER JOIN users u ON s.user_id = u.user_id AND u.is_active = 1
    LEFT JOIN assignment_submissions sub ON a.assignment_id = sub.assignment_id AND s.student_id = sub.student_id
    WHERE sub.submission_id IS NULL
      AND a.due_date IS NOT NULL
      ${filterSql}
  `;

  const [rows] = await pool.query(sql, params);
  const now = new Date();
  const candidates = [];

  for (const row of rows) {
    const dueDate = new Date(row.due_date);
    const diffMs = dueDate.getTime() - now.getTime();
    const isOverdue = diffMs < 0;
    // Due within 3 days: diffMs >= 0 and diffMs <= 3 * 24 * 60 * 60 * 1000
    const isDueSoon = diffMs >= 0 && diffMs <= 3 * 24 * 60 * 60 * 1000;

    if (isOverdue || isDueSoon) {
      candidates.push({
        ...row,
        diffMs,
        isOverdue,
        isDueSoon,
        notification_title: isOverdue 
          ? `Assignment Overdue: ${row.title}`
          : `Assignment Due Soon: ${row.title}`
      });
    }
  }

  return candidates;
};

module.exports = {
  checkCourseExists,
  checkTeacherActive,
  checkTeacherCourseAssignment,
  checkStudentEnrollment,
  getAssignments,
  getAssignmentById,
  getAssignmentStats,
  getAssignmentSubmissions,
  createOrUpdateSubmission,
  getStudentSubmission,
  getSubmissionById,
  getEnrolledStudentUserIds,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  evaluateSubmission,
  getSubmissionEvaluation,
  getStudentEvaluation,
  getSubmissionHistory,
  getHistoryDocumentById,
  findPendingDueReminders
};
