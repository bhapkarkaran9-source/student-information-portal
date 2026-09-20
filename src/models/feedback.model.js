const pool = require('../config/db');

/**
 * Model for Student Feedback Module
 * Handles forms, questions, responses, and analytics with strict parameterization.
 */

/**
 * Helper: Resolve student record by user_id
 */
const getStudentByUserId = async (userId) => {
  const sql = `
    SELECT 
      s.student_id,
      s.user_id,
      s.prn_number,
      s.department_id,
      s.semester,
      s.class_name,
      s.division,
      u.first_name,
      u.last_name,
      u.email
    FROM students s
    INNER JOIN users u ON s.user_id = u.user_id
    WHERE s.user_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [userId]);
  return rows[0] || null;
};

/**
 * Student API: Get all active, eligible feedback forms for authenticated student
 */
const getFormsForStudent = async (studentId) => {
  // First retrieve student attributes for scope filtering
  const [studentRows] = await pool.query(
    'SELECT department_id, semester FROM students WHERE student_id = ?',
    [studentId]
  );
  if (!studentRows[0]) return [];

  const { department_id, semester } = studentRows[0];

  const sql = `
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
      f.created_at,
      CASE 
        WHEN f.target_type = 'COURSE' THEN (SELECT CONCAT(course_code, ' - ', course_name) FROM courses WHERE course_id = f.target_id)
        WHEN f.target_type = 'TEACHER' THEN (SELECT CONCAT(u2.first_name, ' ', u2.last_name) FROM teachers t INNER JOIN users u2 ON t.user_id = u2.user_id WHERE t.teacher_id = f.target_id)
        WHEN f.target_type = 'EVENT' THEN (SELECT title FROM academic_events WHERE event_id = f.target_id)
        ELSE NULL
      END AS target_label,
      (SELECT COUNT(*) FROM feedback_questions q WHERE q.feedback_form_id = f.feedback_form_id) AS question_count,
      EXISTS (
        SELECT 1 
        FROM feedback_responses r 
        WHERE r.feedback_form_id = f.feedback_form_id AND r.student_id = ?
      ) AS has_submitted,
      (
        SELECT r.submitted_at 
        FROM feedback_responses r 
        WHERE r.feedback_form_id = f.feedback_form_id AND r.student_id = ?
        LIMIT 1
      ) AS submitted_at
    FROM feedback_forms f
    WHERE f.is_active = TRUE
      AND NOW() BETWEEN f.start_date AND f.end_date
      AND (
        (f.target_type = 'GENERAL' AND (f.semester IS NULL OR f.semester = ?))
        OR (f.target_type = 'COURSE' AND (f.target_id IS NULL OR f.target_id IN (
          SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'Enrolled'
        )))
        OR (f.target_type = 'TEACHER' AND (f.target_id IS NULL OR f.target_id IN (
          SELECT tt.teacher_id 
          FROM timetable tt 
          INNER JOIN enrollments e ON tt.course_id = e.course_id 
          WHERE e.student_id = ? AND e.status = 'Enrolled'
        )))
        OR (f.target_type = 'EVENT' AND (f.semester IS NULL OR f.semester = ?))
      )
    ORDER BY f.end_date ASC, f.created_at DESC
  `;

  const [rows] = await pool.query(sql, [
    studentId,
    studentId,
    semester,
    studentId,
    studentId,
    semester
  ]);

  return rows.map(r => ({
    ...r,
    has_submitted: Boolean(r.has_submitted)
  }));
};

/**
 * Student API: Get single eligible form with questions
 */
const getFormByIdForStudent = async (formId, studentId) => {
  const forms = await getFormsForStudent(studentId);
  const form = forms.find(f => f.feedback_form_id === parseInt(formId, 10));
  if (!form) return null;

  const [questions] = await pool.query(`
    SELECT 
      question_id,
      feedback_form_id,
      question_text,
      question_type,
      is_required,
      display_order
    FROM feedback_questions
    WHERE feedback_form_id = ?
    ORDER BY display_order ASC, question_id ASC
  `, [formId]);

  return {
    ...form,
    questions
  };
};

/**
 * Student API: Submit feedback atomically inside a MySQL transaction
 */
const submitFeedbackTransaction = async (formId, studentId, answers) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Verify form is active and currently within open date window
    const [formRows] = await connection.query(`
      SELECT feedback_form_id, is_active, start_date, end_date
      FROM feedback_forms
      WHERE feedback_form_id = ?
      FOR UPDATE
    `, [formId]);

    if (!formRows[0]) {
      throw { status: 404, message: 'Feedback form not found' };
    }

    const form = formRows[0];
    const now = new Date();
    if (!form.is_active || now < new Date(form.start_date) || now > new Date(form.end_date)) {
      throw { status: 400, message: 'This feedback form is currently not open for submissions' };
    }

    // 2. Check if student has already submitted (Prevent duplicate submission)
    const [existing] = await connection.query(`
      SELECT response_id 
      FROM feedback_responses 
      WHERE feedback_form_id = ? AND student_id = ?
      LIMIT 1
    `, [formId, studentId]);

    if (existing.length > 0) {
      throw { status: 409, message: 'You have already submitted feedback for this form' };
    }

    // 3. Insert response record
    const [respResult] = await connection.query(`
      INSERT INTO feedback_responses (feedback_form_id, student_id, submitted_at)
      VALUES (?, ?, NOW())
    `, [formId, studentId]);

    const responseId = respResult.insertId;

    // 4. Insert each answer record
    for (const ans of answers) {
      await connection.query(`
        INSERT INTO feedback_answers (response_id, question_id, answer_text, rating)
        VALUES (?, ?, ?, ?)
      `, [
        responseId,
        ans.question_id,
        ans.answer_text || null,
        ans.rating !== undefined && ans.rating !== null ? ans.rating : null
      ]);
    }

    await connection.commit();
    return { response_id: responseId };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      throw { status: 409, message: 'You have already submitted feedback for this form' };
    }
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Admin API: Get paginated and filtered feedback forms
 */
const getFormsForAdmin = async ({ page = 1, limit = 20, search = '', target_type = '', is_active = '', academic_year = '', semester = '' } = {}) => {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (parsedPage - 1) * parsedLimit;

  const whereConditions = [];
  const queryParams = [];

  if (search && search.trim()) {
    whereConditions.push('(f.title LIKE ? OR f.description LIKE ?)');
    const term = `%${search.trim()}%`;
    queryParams.push(term, term);
  }

  if (target_type) {
    whereConditions.push('f.target_type = ?');
    queryParams.push(target_type.toUpperCase());
  }

  if (is_active !== '' && is_active !== undefined && is_active !== null) {
    whereConditions.push('f.is_active = ?');
    queryParams.push(is_active === '1' || is_active === 'true' || is_active === 1 || is_active === true ? 1 : 0);
  }

  if (academic_year) {
    whereConditions.push('f.academic_year = ?');
    queryParams.push(academic_year);
  }

  if (semester) {
    whereConditions.push('f.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // Count total matching
  const countSql = `SELECT COUNT(*) as total FROM feedback_forms f ${whereSql}`;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = countRows[0] ? countRows[0].total : 0;

  // Fetch paginated data
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
      CONCAT(u.first_name, ' ', u.last_name) AS creator_name,
      CASE 
        WHEN f.target_type = 'COURSE' THEN (SELECT CONCAT(course_code, ' - ', course_name) FROM courses WHERE course_id = f.target_id)
        WHEN f.target_type = 'TEACHER' THEN (SELECT CONCAT(u2.first_name, ' ', u2.last_name) FROM teachers t INNER JOIN users u2 ON t.user_id = u2.user_id WHERE t.teacher_id = f.target_id)
        WHEN f.target_type = 'EVENT' THEN (SELECT title FROM academic_events WHERE event_id = f.target_id)
        ELSE NULL
      END AS target_label,
      (SELECT COUNT(*) FROM feedback_questions q WHERE q.feedback_form_id = f.feedback_form_id) AS question_count,
      (SELECT COUNT(*) FROM feedback_responses r WHERE r.feedback_form_id = f.feedback_form_id) AS response_count
    FROM feedback_forms f
    INNER JOIN users u ON f.created_by = u.user_id
    ${whereSql}
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(dataSql, [...queryParams, parsedLimit, offset]);

  return {
    forms: rows,
    pagination: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit) || 1
    }
  };
};

/**
 * Admin API: Get single form details with questions
 */
const getFormByIdForAdmin = async (formId) => {
  const sql = `
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
  const [rows] = await pool.query(sql, [formId]);
  if (!rows[0]) return null;

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
    ...rows[0],
    questions
  };
};

/**
 * Admin API: Create form
 */
const createForm = async (formData) => {
  const {
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
  } = formData;

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
 * Admin API: Update form
 */
const updateForm = async (formId, updateData) => {
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

  if (fields.length === 0) return false;

  values.push(formId);
  const sql = `UPDATE feedback_forms SET ${fields.join(', ')} WHERE feedback_form_id = ?`;
  const [result] = await pool.query(sql, values);
  return result.affectedRows > 0;
};

/**
 * Admin API: Delete form (Cascade delete)
 */
const deleteForm = async (formId) => {
  const [result] = await pool.query('DELETE FROM feedback_forms WHERE feedback_form_id = ?', [formId]);
  return result.affectedRows > 0;
};

/**
 * Questions Management
 */
const addQuestion = async ({ feedback_form_id, question_text, question_type, is_required = true, display_order = 0 }) => {
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
    feedback_form_id,
    question_text,
    question_type,
    is_required ? 1 : 0,
    parseInt(display_order, 10) || 0
  ]);
  return result.insertId;
};

const updateQuestion = async (questionId, { question_text, question_type, is_required, display_order }) => {
  const fields = [];
  const values = [];

  if (question_text !== undefined) {
    fields.push('question_text = ?');
    values.push(question_text);
  }
  if (question_type !== undefined) {
    fields.push('question_type = ?');
    values.push(question_type);
  }
  if (is_required !== undefined) {
    fields.push('is_required = ?');
    values.push(is_required ? 1 : 0);
  }
  if (display_order !== undefined) {
    fields.push('display_order = ?');
    values.push(parseInt(display_order, 10) || 0);
  }

  if (fields.length === 0) return false;

  values.push(questionId);
  const sql = `UPDATE feedback_questions SET ${fields.join(', ')} WHERE question_id = ?`;
  const [result] = await pool.query(sql, values);
  return result.affectedRows > 0;
};

const deleteQuestion = async (questionId) => {
  const [result] = await pool.query('DELETE FROM feedback_questions WHERE question_id = ?', [questionId]);
  return result.affectedRows > 0;
};

const getQuestionById = async (questionId) => {
  const [rows] = await pool.query('SELECT * FROM feedback_questions WHERE question_id = ?', [questionId]);
  return rows[0] || null;
};

/**
 * Admin API: Get aggregated responses for a form
 */
const getFormResponsesForAdmin = async (formId, { page = 1, limit = 50 } = {}) => {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (parsedPage - 1) * parsedLimit;

  // 1. Get total response count
  const [countRows] = await pool.query(
    'SELECT COUNT(*) as total FROM feedback_responses WHERE feedback_form_id = ?',
    [formId]
  );
  const total = countRows[0] ? countRows[0].total : 0;

  // 2. Fetch responses with sanitized student data
  const respSql = `
    SELECT 
      r.response_id,
      r.feedback_form_id,
      r.student_id,
      r.submitted_at,
      s.prn_number,
      s.class_name,
      s.division,
      s.semester,
      CONCAT(u.first_name, ' ', u.last_name) AS student_name,
      d.department_name
    FROM feedback_responses r
    INNER JOIN students s ON r.student_id = s.student_id
    INNER JOIN users u ON s.user_id = u.user_id
    INNER JOIN departments d ON s.department_id = d.department_id
    WHERE r.feedback_form_id = ?
    ORDER BY r.submitted_at DESC
    LIMIT ? OFFSET ?
  `;

  const [responses] = await pool.query(respSql, [formId, parsedLimit, offset]);

  if (responses.length === 0) {
    return {
      responses: [],
      pagination: { total, page: parsedPage, limit: parsedLimit, totalPages: 1 }
    };
  }

  // 3. Fetch answers for these response IDs
  const responseIds = responses.map(r => r.response_id);
  const [answers] = await pool.query(`
    SELECT 
      a.answer_id,
      a.response_id,
      a.question_id,
      a.answer_text,
      a.rating,
      q.question_text,
      q.question_type
    FROM feedback_answers a
    INNER JOIN feedback_questions q ON a.question_id = q.question_id
    WHERE a.response_id IN (?)
    ORDER BY q.display_order ASC, q.question_id ASC
  `, [responseIds]);

  const answersByRespId = {};
  answers.forEach(a => {
    if (!answersByRespId[a.response_id]) answersByRespId[a.response_id] = [];
    answersByRespId[a.response_id].push({
      answer_id: a.answer_id,
      question_id: a.question_id,
      question_text: a.question_text,
      question_type: a.question_type,
      rating: a.rating !== null ? parseFloat(a.rating) : null,
      answer_text: a.answer_text
    });
  });

  const enrichedResponses = responses.map(r => ({
    ...r,
    answers: answersByRespId[r.response_id] || []
  }));

  return {
    responses: enrichedResponses,
    pagination: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages: Math.ceil(total / parsedLimit) || 1
    }
  };
};

/**
 * Admin API: Calculate rating analytics and summary metrics
 */
const getFormAnalyticsForAdmin = async (formId) => {
  const form = await getFormByIdForAdmin(formId);
  if (!form) return null;

  // 1. Total responses count
  const [respCountRows] = await pool.query(
    'SELECT COUNT(*) as total FROM feedback_responses WHERE feedback_form_id = ?',
    [formId]
  );
  const totalResponses = respCountRows[0] ? respCountRows[0].total : 0;

  // 2. Fetch rating questions metrics
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
    LEFT JOIN feedback_answers a ON q.question_id = a.question_id
    WHERE q.feedback_form_id = ? AND q.question_type = 'RATING'
    GROUP BY q.question_id, q.question_text
    ORDER BY q.display_order ASC, q.question_id ASC
  `, [formId]);

  // Overall average
  const [overallAvgRow] = await pool.query(`
    SELECT ROUND(AVG(a.rating), 2) as overall_average
    FROM feedback_answers a
    INNER JOIN feedback_questions q ON a.question_id = q.question_id
    WHERE q.feedback_form_id = ? AND q.question_type = 'RATING'
  `, [formId]);

  // 3. Text questions summary
  const [textMetrics] = await pool.query(`
    SELECT 
      q.question_id,
      q.question_text,
      COUNT(a.answer_id) as total_text_answers
    FROM feedback_questions q
    LEFT JOIN feedback_answers a ON q.question_id = a.question_id AND a.answer_text IS NOT NULL AND TRIM(a.answer_text) != ''
    WHERE q.feedback_form_id = ? AND q.question_type = 'TEXT'
    GROUP BY q.question_id, q.question_text
    ORDER BY q.display_order ASC, q.question_id ASC
  `, [formId]);

  return {
    form_id: form.feedback_form_id,
    title: form.title,
    target_type: form.target_type,
    target_label: form.target_label,
    is_active: Boolean(form.is_active),
    total_responses: totalResponses,
    total_questions: form.questions ? form.questions.length : 0,
    overall_average_rating: overallAvgRow[0]?.overall_average !== null ? parseFloat(overallAvgRow[0]?.overall_average) : null,
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
    text_analytics: textMetrics.map(t => ({
      question_id: t.question_id,
      question_text: t.question_text,
      total_text_answers: t.total_text_answers
    }))
  };
};

/**
 * Find active student user IDs eligible for a given feedback form
 */
const getEligibleStudentUserIdsForForm = async (form) => {
  if (!form) return [];
  const targetType = (form.target_type || 'GENERAL').toUpperCase();
  const targetId = form.target_id ? parseInt(form.target_id, 10) : null;
  const semester = form.semester ? parseInt(form.semester, 10) : null;

  let sql = `
    SELECT DISTINCT u.user_id
    FROM students s
    JOIN users u ON s.user_id = u.user_id
    WHERE u.is_active = 1
  `;
  const params = [];

  if (targetType === 'GENERAL') {
    if (semester !== null) {
      sql += ' AND s.semester = ?';
      params.push(semester);
    }
  } else if (targetType === 'COURSE') {
    if (targetId !== null) {
      sql += ` AND s.student_id IN (
        SELECT student_id FROM enrollments WHERE course_id = ? AND status = 'Enrolled'
      )`;
      params.push(targetId);
    }
  } else if (targetType === 'TEACHER') {
    if (targetId !== null) {
      sql += ` AND s.student_id IN (
        SELECT e.student_id FROM enrollments e
        JOIN timetable tt ON e.course_id = tt.course_id
        WHERE tt.teacher_id = ? AND e.status = 'Enrolled'
      )`;
      params.push(targetId);
    }
  } else if (targetType === 'EVENT') {
    if (semester !== null) {
      sql += ' AND s.semester = ?';
      params.push(semester);
    }
  }

  const [rows] = await pool.query(sql, params);
  return rows.map(r => r.user_id);
};

/**
 * Dispatch in-app NEW_FEEDBACK_FORM notifications and asynchronous email delivery
 * to all eligible students for a feedback form.
 * 
 * @param {object} form - The feedback form object
 * @param {object} [options={}]
 * @param {number[]} [options.userIds=null] - Optional user IDs filter
 * @returns {Promise<{ notifiedCount: number, recipientUserIds: number[] }>}
 */
const dispatchFeedbackFormNotification = async (form, { userIds = null } = {}) => {
  if (!form || !form.feedback_form_id) return { notifiedCount: 0, recipientUserIds: [] };

  let recipientUserIds = await getEligibleStudentUserIdsForForm(form);
  if (Array.isArray(userIds) && userIds.length > 0) {
    recipientUserIds = recipientUserIds.filter(id => userIds.includes(id));
  }

  if (recipientUserIds.length === 0) {
    return { notifiedCount: 0, recipientUserIds: [] };
  }

  const notificationModel = require('./notification.model');
  const emailTemplates = require('../services/emailTemplates');

  const dt = form.end_date ? emailTemplates.formatDueDateTime(form.end_date) : null;
  const deadlineStr = dt ? dt.formatted : 'Active Period';

  let targetLabel = form.target_label || null;
  if (!targetLabel) {
    if (form.target_type === 'COURSE') {
      const [c] = await pool.query('SELECT CONCAT(course_code, " - ", course_name) AS label FROM courses WHERE course_id = ?', [form.target_id]);
      if (c[0]) targetLabel = `Course: ${c[0].label}`;
    } else if (form.target_type === 'TEACHER') {
      const [t] = await pool.query('SELECT CONCAT(u.first_name, " ", u.last_name) AS label FROM teachers te JOIN users u ON te.user_id = u.user_id WHERE te.teacher_id = ?', [form.target_id]);
      if (t[0]) targetLabel = `Teacher: ${t[0].label}`;
    } else if (form.target_type === 'GENERAL') {
      targetLabel = form.semester ? `General (Semester ${form.semester})` : 'Institutional General';
    }
  }

  const formPath = `/feedback/forms/${form.feedback_form_id}`;
  const notifTitle = `Feedback Request: ${form.title}`;
  const notifMessage = `A new feedback evaluation form "${form.title}" is available. Please submit your feedback before ${deadlineStr}.`;

  const eventId = `FEEDBACK_${form.feedback_form_id}`;

  let notifiedCount = 0;
  for (const uid of recipientUserIds) {
    try {
      await notificationModel.createNotification({
        recipient_user_id: uid,
        title: notifTitle,
        message: notifMessage,
        notification_type: 'NEW_FEEDBACK_FORM',
        is_read: 0,
        metadata: {
          emailNotificationType: 'NEW_FEEDBACK_FORM',
          formId: form.feedback_form_id,
          feedback_form_id: form.feedback_form_id,
          feedback_id: form.feedback_form_id,
          eventId: eventId,
          feedbackTitle: form.title,
          title: form.title,
          description: form.description || 'Please complete this evaluation form on your portal.',
          instructions: form.description || 'Please complete this evaluation form on your portal.',
          targetInfo: targetLabel,
          target_type: form.target_type,
          targetType: form.target_type,
          deadline: deadlineStr,
          submissionDeadline: deadlineStr,
          endDate: form.end_date,
          formPath: formPath,
          formUrl: formPath
        },
        eventId: eventId
      });
      notifiedCount++;
    } catch (err) {
      console.warn(`[FeedbackModel] Error notifying user ${uid} for form ${form.feedback_form_id}:`, err.message);
    }
  }

  return { notifiedCount, recipientUserIds };
};

module.exports = {
  getStudentByUserId,
  getFormsForStudent,
  getFormByIdForStudent,
  submitFeedbackTransaction,
  getFormsForAdmin,
  getFormByIdForAdmin,
  createForm,
  updateForm,
  deleteForm,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  getQuestionById,
  getFormResponsesForAdmin,
  getFormAnalyticsForAdmin,
  getEligibleStudentUserIdsForForm,
  dispatchFeedbackFormNotification
};
