const pool = require('../config/db');

/**
 * ============================================================================
 * TEACHER FEEDBACK MODEL
 * Database: student_portal_db
 * Tables: feedback_forms, feedback_questions, feedback_responses, feedback_answers,
 *         teachers, timetable, courses, enrollments, students, users, departments
 * ============================================================================
 */

/**
 * 1. Resolve teacher profile from authenticated user_id
 */
const getTeacherProfileByUserId = async (userId) => {
  const sql = `
    SELECT 
      t.teacher_id,
      t.user_id,
      t.department_id,
      t.employee_number,
      t.designation,
      u.first_name,
      u.last_name,
      u.email,
      u.is_active
    FROM teachers t
    INNER JOIN users u ON t.user_id = u.user_id
    WHERE t.user_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [userId]);
  return rows[0] || null;
};

/**
 * 2. Get list of course IDs assigned to teacher via timetable
 */
const getTeacherAssignedCourseIds = async (teacherId) => {
  const sql = `
    SELECT DISTINCT course_id 
    FROM timetable 
    WHERE teacher_id = ? AND course_id IS NOT NULL
  `;
  const [rows] = await pool.query(sql, [teacherId]);
  return rows.map(r => r.course_id);
};

/**
 * 3. Validate Anti-Self-Evaluation Rules
 * Rule 2: A TEACHER must NOT create/manage feedback evaluating their own assigned course or themselves.
 */
const validateAntiSelfEvaluation = async (teacherId, targetType, targetId) => {
  const normType = targetType ? targetType.toUpperCase().trim() : '';

  if (normType === 'COURSE') {
    if (targetId === undefined || targetId === null || targetId === '') {
      return {
        valid: false,
        status: 400,
        message: 'A target course must be specified for COURSE feedback'
      };
    }
    const courseId = parseInt(targetId, 10);
    const assignedCourses = await getTeacherAssignedCourseIds(teacherId);
    if (assignedCourses.includes(courseId)) {
      return {
        valid: false,
        status: 400,
        message: 'Teachers are not permitted to create or manage feedback forms for their own assigned courses'
      };
    }
  } else if (normType === 'TEACHER') {
    if (targetId === undefined || targetId === null || targetId === '') {
      return {
        valid: false,
        status: 400,
        message: 'A target teacher must be specified for TEACHER feedback'
      };
    }
    const evalTeacherId = parseInt(targetId, 10);
    if (evalTeacherId === parseInt(teacherId, 10)) {
      return {
        valid: false,
        status: 400,
        message: 'Teachers are not permitted to create or manage feedback forms evaluating themselves'
      };
    }
  }

  return { valid: true };
};

/**
 * 4. Get paginated and filtered feedback forms created by the authenticated teacher
 * Rule 3: Strict Isolation - Teacher can view ONLY forms where created_by = userId.
 */
const getTeacherForms = async (userId, {
  page = 1,
  limit = 20,
  search = '',
  target_type = '',
  is_active = '',
  academic_year = '',
  semester = ''
} = {}) => {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (parsedPage - 1) * parsedLimit;

  const whereConditions = ['f.created_by = ?'];
  const queryParams = [userId];

  if (search && search.trim()) {
    whereConditions.push('(f.title LIKE ? OR f.description LIKE ?)');
    const term = `%${search.trim()}%`;
    queryParams.push(term, term);
  }

  if (target_type) {
    whereConditions.push('f.target_type = ?');
    queryParams.push(target_type.toUpperCase().trim());
  }

  if (is_active !== '' && is_active !== undefined && is_active !== null) {
    whereConditions.push('f.is_active = ?');
    queryParams.push(is_active === '1' || is_active === 'true' || is_active === 1 || is_active === true ? 1 : 0);
  }

  if (academic_year) {
    whereConditions.push('f.academic_year = ?');
    queryParams.push(academic_year.trim());
  }

  if (semester !== '' && semester !== undefined && semester !== null) {
    whereConditions.push('f.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  const whereSql = `WHERE ${whereConditions.join(' AND ')}`;

  // Total matching count
  const countSql = `SELECT COUNT(*) as total FROM feedback_forms f ${whereSql}`;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = countRows[0] ? countRows[0].total : 0;

  // Paginated forms list
  const dataSql = `
    SELECT 
      f.feedback_form_id,
      f.title,
      f.description,
      f.target_type,
      f.target_id,
      f.academic_year,
      f.semester,
      f.start_date,
      f.end_date,
      f.is_active,
      f.created_by,
      f.created_at,
      f.updated_at,
      CASE 
        WHEN f.target_type = 'COURSE' THEN (SELECT CONCAT(course_code, ' - ', course_name) FROM courses WHERE course_id = f.target_id)
        WHEN f.target_type = 'TEACHER' THEN (SELECT CONCAT(u2.first_name, ' ', u2.last_name) FROM teachers t INNER JOIN users u2 ON t.user_id = u2.user_id WHERE t.teacher_id = f.target_id)
        WHEN f.target_type = 'EVENT' THEN (SELECT title FROM academic_events WHERE event_id = f.target_id)
        ELSE NULL
      END AS target_label,
      (SELECT COUNT(*) FROM feedback_questions q WHERE q.feedback_form_id = f.feedback_form_id) AS question_count,
      (SELECT COUNT(*) FROM feedback_responses r WHERE r.feedback_form_id = f.feedback_form_id) AS response_count
    FROM feedback_forms f
    ${whereSql}
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(dataSql, [...queryParams, parsedLimit, offset]);

  return {
    forms: rows.map(r => ({
      ...r,
      is_active: Boolean(r.is_active)
    })),
    pagination: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit) || 1
    }
  };
};

/**
 * 5. Get single feedback form details for teacher
 * Rule 3 & 4: Full info of own form, strictly verify created_by = userId.
 */
const getTeacherFormById = async (formId, userId) => {
  const checkSql = `
    SELECT 
      f.feedback_form_id,
      f.title,
      f.description,
      f.target_type,
      f.target_id,
      f.academic_year,
      f.semester,
      f.start_date,
      f.end_date,
      f.is_active,
      f.created_by,
      f.created_at,
      f.updated_at,
      CONCAT(u.first_name, ' ', u.last_name) AS creator_name,
      CASE 
        WHEN f.target_type = 'COURSE' THEN (SELECT CONCAT(course_code, ' - ', course_name) FROM courses WHERE course_id = f.target_id)
        WHEN f.target_type = 'TEACHER' THEN (SELECT CONCAT(u2.first_name, ' ', u2.last_name) FROM teachers t INNER JOIN users u2 ON t.user_id = u2.user_id WHERE t.teacher_id = f.target_id)
        WHEN f.target_type = 'EVENT' THEN (SELECT title FROM academic_events WHERE event_id = f.target_id)
        ELSE NULL
      END AS target_label,
      (SELECT COUNT(*) FROM feedback_responses r WHERE r.feedback_form_id = f.feedback_form_id) AS response_count
    FROM feedback_forms f
    INNER JOIN users u ON f.created_by = u.user_id
    WHERE f.feedback_form_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(checkSql, [formId]);
  if (!rows[0]) {
    return { notFound: true };
  }

  const form = rows[0];
  if (form.created_by !== userId) {
    return { forbidden: true };
  }

  // Fetch questions
  const [questions] = await pool.query(`
    SELECT 
      question_id,
      feedback_form_id,
      question_text,
      question_type,
      is_required,
      display_order,
      created_at
    FROM feedback_questions
    WHERE feedback_form_id = ?
    ORDER BY display_order ASC, question_id ASC
  `, [formId]);

  return {
    form: {
      ...form,
      is_active: Boolean(form.is_active),
      questions: questions.map(q => ({
        ...q,
        is_required: Boolean(q.is_required)
      }))
    }
  };
};

/**
 * 6. Create feedback form by teacher
 */
const createTeacherForm = async ({
  title,
  description,
  target_type,
  target_id,
  academic_year,
  semester,
  start_date,
  end_date,
  is_active = true,
  created_by
}) => {
  const sql = `
    INSERT INTO feedback_forms (
      title,
      description,
      target_type,
      target_id,
      academic_year,
      semester,
      start_date,
      end_date,
      is_active,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const [result] = await pool.query(sql, [
    title,
    description || null,
    target_type,
    target_id || null,
    academic_year || null,
    semester ? parseInt(semester, 10) : null,
    start_date,
    end_date,
    is_active ? 1 : 0,
    created_by
  ]);

  return result.insertId;
};

/**
 * 7. Update feedback form by teacher
 */
const updateTeacherForm = async (formId, userId, updateData) => {
  // Check ownership
  const [checkRows] = await pool.query(
    'SELECT feedback_form_id, created_by FROM feedback_forms WHERE feedback_form_id = ?',
    [formId]
  );
  if (!checkRows[0]) return { notFound: true };
  if (checkRows[0].created_by !== userId) return { forbidden: true };

  const fields = [];
  const values = [];

  const allowedFields = [
    'title',
    'description',
    'target_type',
    'target_id',
    'academic_year',
    'semester',
    'start_date',
    'end_date',
    'is_active'
  ];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      fields.push(`${field} = ?`);
      if (field === 'is_active') {
        values.push(updateData[field] ? 1 : 0);
      } else if (field === 'semester' || field === 'target_id') {
        values.push(updateData[field] !== null ? parseInt(updateData[field], 10) : null);
      } else {
        values.push(updateData[field]);
      }
    }
  }

  if (fields.length === 0) return { updated: false };

  values.push(formId);
  const sql = `UPDATE feedback_forms SET ${fields.join(', ')} WHERE feedback_form_id = ?`;
  await pool.query(sql, values);
  return { updated: true };
};

/**
 * 8. Delete feedback form by teacher (Cascade delete)
 */
const deleteTeacherForm = async (formId, userId) => {
  const [checkRows] = await pool.query(
    'SELECT feedback_form_id, created_by FROM feedback_forms WHERE feedback_form_id = ?',
    [formId]
  );
  if (!checkRows[0]) return { notFound: true };
  if (checkRows[0].created_by !== userId) return { forbidden: true };

  await pool.query('DELETE FROM feedback_forms WHERE feedback_form_id = ?', [formId]);
  return { deleted: true };
};

/**
 * 9. Question management for teacher's own forms
 */
const addTeacherQuestion = async (formId, userId, { question_text, question_type, is_required = true, display_order = 0 }) => {
  const [formRows] = await pool.query(
    'SELECT feedback_form_id, created_by FROM feedback_forms WHERE feedback_form_id = ?',
    [formId]
  );
  if (!formRows[0]) return { notFound: true };
  if (formRows[0].created_by !== userId) return { forbidden: true };

  const sql = `
    INSERT INTO feedback_questions (
      feedback_form_id,
      question_text,
      question_type,
      is_required,
      display_order
    ) VALUES (?, ?, ?, ?, ?)
  `;
  const [result] = await pool.query(sql, [
    formId,
    question_text,
    question_type,
    is_required ? 1 : 0,
    parseInt(display_order, 10) || 0
  ]);

  const [qRows] = await pool.query('SELECT * FROM feedback_questions WHERE question_id = ?', [result.insertId]);
  return { question: qRows[0] };
};

const updateTeacherQuestion = async (questionId, userId, updateData) => {
  const [qRows] = await pool.query(`
    SELECT q.question_id, q.feedback_form_id, f.created_by
    FROM feedback_questions q
    INNER JOIN feedback_forms f ON q.feedback_form_id = f.feedback_form_id
    WHERE q.question_id = ?
  `, [questionId]);

  if (!qRows[0]) return { notFound: true };
  if (qRows[0].created_by !== userId) return { forbidden: true };

  const fields = [];
  const values = [];

  if (updateData.question_text !== undefined) {
    fields.push('question_text = ?');
    values.push(updateData.question_text);
  }
  if (updateData.question_type !== undefined) {
    fields.push('question_type = ?');
    values.push(updateData.question_type);
  }
  if (updateData.is_required !== undefined) {
    fields.push('is_required = ?');
    values.push(updateData.is_required ? 1 : 0);
  }
  if (updateData.display_order !== undefined) {
    fields.push('display_order = ?');
    values.push(parseInt(updateData.display_order, 10) || 0);
  }

  if (fields.length === 0) return { updated: false };

  values.push(questionId);
  await pool.query(`UPDATE feedback_questions SET ${fields.join(', ')} WHERE question_id = ?`, values);

  const [updatedRows] = await pool.query('SELECT * FROM feedback_questions WHERE question_id = ?', [questionId]);
  return { question: updatedRows[0] };
};

const deleteTeacherQuestion = async (questionId, userId) => {
  const [qRows] = await pool.query(`
    SELECT q.question_id, q.feedback_form_id, f.created_by
    FROM feedback_questions q
    INNER JOIN feedback_forms f ON q.feedback_form_id = f.feedback_form_id
    WHERE q.question_id = ?
  `, [questionId]);

  if (!qRows[0]) return { notFound: true };
  if (qRows[0].created_by !== userId) return { forbidden: true };

  await pool.query('DELETE FROM feedback_questions WHERE question_id = ?', [questionId]);
  return { deleted: true };
};

/**
 * 10. Student Submission Status Roster for Teacher
 * Rules 5 & 6:
 * - See which students submitted and which have not submitted.
 * - Teacher must NOT see individual answers of any student.
 * - Under NO circumstance does this query return ratings, answer_text, or response_id.
 */
const getTeacherFormSubmissions = async (formId, userId, {
  status = 'all',
  search = '',
  page = 1,
  limit = 50
} = {}) => {
  const [formRows] = await pool.query(
    'SELECT feedback_form_id, title, target_type, target_id, semester, created_by FROM feedback_forms WHERE feedback_form_id = ?',
    [formId]
  );
  if (!formRows[0]) return { notFound: true };
  if (formRows[0].created_by !== userId) return { forbidden: true };

  const form = formRows[0];

  let rosterSql = '';
  let rosterParams = [];

  if (form.target_type === 'COURSE') {
    rosterSql = `
      SELECT DISTINCT
        s.student_id,
        CONCAT(u.first_name, ' ', u.last_name) AS student_name,
        s.prn_number,
        d.department_name,
        s.class_name,
        s.division,
        s.semester,
        CASE WHEN r.response_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_submitted,
        r.submitted_at
      FROM students s
      INNER JOIN users u ON s.user_id = u.user_id
      INNER JOIN departments d ON s.department_id = d.department_id
      LEFT JOIN feedback_responses r ON r.feedback_form_id = ? AND r.student_id = s.student_id
      WHERE (
        s.student_id IN (
          SELECT e.student_id 
          FROM enrollments e 
          WHERE e.course_id = ? AND e.status = 'Enrolled'
        )
        OR r.response_id IS NOT NULL
      )
    `;
    rosterParams = [formId, form.target_id];
  } else if (form.target_type === 'TEACHER') {
    rosterSql = `
      SELECT DISTINCT
        s.student_id,
        CONCAT(u.first_name, ' ', u.last_name) AS student_name,
        s.prn_number,
        d.department_name,
        s.class_name,
        s.division,
        s.semester,
        CASE WHEN r.response_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_submitted,
        r.submitted_at
      FROM students s
      INNER JOIN users u ON s.user_id = u.user_id
      INNER JOIN departments d ON s.department_id = d.department_id
      LEFT JOIN feedback_responses r ON r.feedback_form_id = ? AND r.student_id = s.student_id
      WHERE (
        s.student_id IN (
          SELECT e.student_id 
          FROM enrollments e 
          INNER JOIN timetable tt ON e.course_id = tt.course_id 
          WHERE tt.teacher_id = ? AND e.status = 'Enrolled'
        )
        OR r.response_id IS NOT NULL
      )
    `;
    rosterParams = [formId, form.target_id];
  } else {
    // GENERAL or EVENT
    rosterSql = `
      SELECT DISTINCT
        s.student_id,
        CONCAT(u.first_name, ' ', u.last_name) AS student_name,
        s.prn_number,
        d.department_name,
        s.class_name,
        s.division,
        s.semester,
        CASE WHEN r.response_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_submitted,
        r.submitted_at
      FROM students s
      INNER JOIN users u ON s.user_id = u.user_id
      INNER JOIN departments d ON s.department_id = d.department_id
      LEFT JOIN feedback_responses r ON r.feedback_form_id = ? AND r.student_id = s.student_id
      WHERE (
        (u.is_active = 1 AND (? IS NULL OR s.semester = ?))
        OR r.response_id IS NOT NULL
      )
    `;
    rosterParams = [formId, form.semester || null, form.semester || null];
  }

  const [allStudents] = await pool.query(rosterSql, rosterParams);

  const totalEligible = allStudents.length;
  const submittedCount = allStudents.filter(s => Boolean(s.has_submitted)).length;
  const pendingCount = totalEligible - submittedCount;

  let filtered = allStudents.map(s => ({
    student_id: s.student_id,
    student_name: s.student_name,
    prn_number: s.prn_number,
    department_name: s.department_name,
    class_name: s.class_name,
    division: s.division,
    semester: s.semester,
    has_submitted: Boolean(s.has_submitted),
    submitted_at: s.submitted_at
  }));

  if (status === 'submitted') {
    filtered = filtered.filter(s => s.has_submitted);
  } else if (status === 'pending') {
    filtered = filtered.filter(s => !s.has_submitted);
  }

  if (search && search.trim()) {
    const sTerm = search.trim().toLowerCase();
    filtered = filtered.filter(s => 
      (s.student_name && s.student_name.toLowerCase().includes(sTerm)) ||
      (s.prn_number && s.prn_number.toLowerCase().includes(sTerm)) ||
      (s.department_name && s.department_name.toLowerCase().includes(sTerm))
    );
  }

  filtered.sort((a, b) => {
    if (a.has_submitted && !b.has_submitted) return -1;
    if (!a.has_submitted && b.has_submitted) return 1;
    if (a.has_submitted && b.has_submitted) {
      return new Date(b.submitted_at) - new Date(a.submitted_at);
    }
    return (a.prn_number || '').localeCompare(b.prn_number || '');
  });

  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (parsedPage - 1) * parsedLimit;
  const paginatedStudents = filtered.slice(offset, offset + parsedLimit);

  return {
    form_id: form.feedback_form_id,
    title: form.title,
    target_type: form.target_type,
    summary: {
      total_students: totalEligible,
      submitted_count: submittedCount,
      pending_count: pendingCount,
      submission_rate: totalEligible > 0 ? `${((submittedCount / totalEligible) * 100).toFixed(1)}%` : '0%'
    },
    students: paginatedStudents,
    pagination: {
      total: filtered.length,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(filtered.length / parsedLimit) || 1
    }
  };
};

/**
 * 11. Aggregated Analytics for Teacher
 * Rules 6 & 7:
 * - Only aggregated/overall answers.
 * - Question-wise rating distribution (1 to 5 stars) and average rating.
 * - Multiple choice results aggregation.
 * - Anonymous combined text feed (list of strings without student identity).
 */
const getTeacherFormAnalytics = async (formId, userId) => {
  const [formRows] = await pool.query(`
    SELECT 
      f.feedback_form_id,
      f.title,
      f.description,
      f.target_type,
      f.target_id,
      f.start_date,
      f.end_date,
      f.is_active,
      f.created_by,
      CASE 
        WHEN f.target_type = 'COURSE' THEN (SELECT CONCAT(course_code, ' - ', course_name) FROM courses WHERE course_id = f.target_id)
        WHEN f.target_type = 'TEACHER' THEN (SELECT CONCAT(u2.first_name, ' ', u2.last_name) FROM teachers t INNER JOIN users u2 ON t.user_id = u2.user_id WHERE t.teacher_id = f.target_id)
        WHEN f.target_type = 'EVENT' THEN (SELECT title FROM academic_events WHERE event_id = f.target_id)
        ELSE NULL
      END AS target_label
    FROM feedback_forms f
    WHERE f.feedback_form_id = ?
    LIMIT 1
  `, [formId]);

  if (!formRows[0]) return { notFound: true };
  if (formRows[0].created_by !== userId) return { forbidden: true };

  const form = formRows[0];

  // 1. Total response count
  const [respCountRows] = await pool.query(
    'SELECT COUNT(*) as total FROM feedback_responses WHERE feedback_form_id = ?',
    [formId]
  );
  const totalResponses = respCountRows[0] ? respCountRows[0].total : 0;

  // 2. Rating questions metrics
  const [ratingMetrics] = await pool.query(`
    SELECT 
      q.question_id,
      q.question_text,
      COUNT(a.answer_id) as total_ratings,
      ROUND(AVG(a.rating), 2) as average_rating,
      SUM(CASE WHEN ROUND(a.rating) = 1 THEN 1 ELSE 0 END) as count_1_star,
      SUM(CASE WHEN ROUND(a.rating) = 2 THEN 1 ELSE 0 END) as count_2_star,
      SUM(CASE WHEN ROUND(a.rating) = 3 THEN 1 ELSE 0 END) as count_3_star,
      SUM(CASE WHEN ROUND(a.rating) = 4 THEN 1 ELSE 0 END) as count_4_star,
      SUM(CASE WHEN ROUND(a.rating) = 5 THEN 1 ELSE 0 END) as count_5_star
    FROM feedback_questions q
    LEFT JOIN feedback_answers a ON q.question_id = a.question_id AND a.rating IS NOT NULL
    WHERE q.feedback_form_id = ? AND q.question_type = 'RATING'
    GROUP BY q.question_id, q.question_text
    ORDER BY q.display_order ASC, q.question_id ASC
  `, [formId]);

  // Overall average rating
  const [overallAvgRow] = await pool.query(`
    SELECT ROUND(AVG(a.rating), 2) as overall_average
    FROM feedback_answers a
    INNER JOIN feedback_questions q ON a.question_id = q.question_id
    WHERE q.feedback_form_id = ? AND q.question_type = 'RATING' AND a.rating IS NOT NULL
  `, [formId]);

  // 3. Multiple Choice questions aggregated results
  const [mcqQuestions] = await pool.query(`
    SELECT question_id, question_text 
    FROM feedback_questions 
    WHERE feedback_form_id = ? AND question_type = 'MULTIPLE_CHOICE'
    ORDER BY display_order ASC, question_id ASC
  `, [formId]);

  const mcqAnalytics = [];
  for (const mcq of mcqQuestions) {
    const [optRows] = await pool.query(`
      SELECT answer_text, COUNT(*) as count
      FROM feedback_answers
      WHERE question_id = ? AND answer_text IS NOT NULL AND TRIM(answer_text) != ''
      GROUP BY answer_text
      ORDER BY count DESC, answer_text ASC
    `, [mcq.question_id]);

    const optionsDistribution = {};
    let totalMcqAnswers = 0;
    optRows.forEach(o => {
      optionsDistribution[o.answer_text] = parseInt(o.count, 10);
      totalMcqAnswers += parseInt(o.count, 10);
    });

    mcqAnalytics.push({
      question_id: mcq.question_id,
      question_text: mcq.question_text,
      total_answers: totalMcqAnswers,
      options_distribution: optionsDistribution
    });
  }

  // 4. Text questions anonymous feedback feed (NEVER include student IDs, names, or response IDs)
  const [textQuestions] = await pool.query(`
    SELECT question_id, question_text 
    FROM feedback_questions 
    WHERE feedback_form_id = ? AND question_type = 'TEXT'
    ORDER BY display_order ASC, question_id ASC
  `, [formId]);

  const textAnalytics = [];
  for (const tq of textQuestions) {
    const [textRows] = await pool.query(`
      SELECT answer_text 
      FROM feedback_answers 
      WHERE question_id = ? AND answer_text IS NOT NULL AND TRIM(answer_text) != ''
      ORDER BY answer_text ASC
    `, [tq.question_id]);

    textAnalytics.push({
      question_id: tq.question_id,
      question_text: tq.question_text,
      total_text_answers: textRows.length,
      feedback_feed: textRows.map(r => r.answer_text)
    });
  }

  return {
    form_id: form.feedback_form_id,
    title: form.title,
    description: form.description,
    target_type: form.target_type,
    target_label: form.target_label,
    is_active: Boolean(form.is_active),
    total_responses: totalResponses,
    overall_average_rating: overallAvgRow[0]?.overall_average !== null && overallAvgRow[0]?.overall_average !== undefined
      ? parseFloat(overallAvgRow[0].overall_average)
      : null,
    rating_analytics: ratingMetrics.map(r => ({
      question_id: r.question_id,
      question_text: r.question_text,
      total_ratings: r.total_ratings,
      average_rating: r.average_rating !== null ? parseFloat(r.average_rating) : null,
      distribution: {
        1: parseInt(r.count_1_star || 0, 10),
        2: parseInt(r.count_2_star || 0, 10),
        3: parseInt(r.count_3_star || 0, 10),
        4: parseInt(r.count_4_star || 0, 10),
        5: parseInt(r.count_5_star || 0, 10)
      }
    })),
    multiple_choice_analytics: mcqAnalytics,
    text_analytics: textAnalytics
  };
};

module.exports = {
  getTeacherProfileByUserId,
  getTeacherAssignedCourseIds,
  validateAntiSelfEvaluation,
  getTeacherForms,
  getTeacherFormById,
  createTeacherForm,
  updateTeacherForm,
  deleteTeacherForm,
  addTeacherQuestion,
  updateTeacherQuestion,
  deleteTeacherQuestion,
  getTeacherFormSubmissions,
  getTeacherFormAnalytics
};
