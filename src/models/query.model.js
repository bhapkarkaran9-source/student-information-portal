const pool = require('../config/db');

/**
 * Query Data Model
 * Tables: queries, query_replies
 * Database: student_portal_db
 */

/**
 * Check if teacher exists and is active
 * @param {number} userId - user_id of teacher
 */
const checkTeacherAvailable = async (userId) => {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) return { exists: false, isActive: false };

  const sql = `
    SELECT 
      u.user_id,
      u.is_active,
      u.email,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS full_name,
      t.teacher_id,
      t.designation,
      t.department_id,
      r.role_name
    FROM users u
    LEFT JOIN teachers t ON u.user_id = t.user_id
    LEFT JOIN roles r ON u.role_id = r.role_id
    WHERE u.user_id = ? AND r.role_name = 'TEACHER'
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [uid]);
  if (!rows || rows.length === 0) {
    return { exists: false, isActive: false };
  }
  return {
    exists: true,
    isActive: Boolean(rows[0].is_active),
    user_id: rows[0].user_id,
    teacher_id: rows[0].teacher_id,
    full_name: rows[0].full_name,
    email: rows[0].email,
    designation: rows[0].designation
  };
};

/**
 * Check if course exists
 * @param {number} courseId
 */
const checkCourseExists = async (courseId) => {
  if (!courseId) return true; // Optional course
  const cid = parseInt(courseId, 10);
  if (isNaN(cid) || cid <= 0) return false;

  const [rows] = await pool.query('SELECT course_id FROM courses WHERE course_id = ? LIMIT 1', [cid]);
  return rows.length > 0;
};

/**
 * Get active teachers list for dropdown selection
 */
const getActiveTeachers = async () => {
  const sql = `
    SELECT 
      u.user_id,
      t.teacher_id,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS full_name,
      u.email,
      t.employee_number,
      t.designation,
      d.department_name
    FROM teachers t
    INNER JOIN users u ON t.user_id = u.user_id
    LEFT JOIN departments d ON t.department_id = d.department_id
    WHERE u.is_active = 1
    ORDER BY u.first_name ASC, u.last_name ASC
  `;
  const [rows] = await pool.query(sql);
  return rows;
};

/**
 * Get relevant courses for dropdown (enrolled for student, or all courses)
 */
const getAvailableCourses = async (studentUserId = null) => {
  if (studentUserId) {
    const sql = `
      SELECT DISTINCT 
        c.course_id, 
        c.course_code, 
        c.course_name
      FROM courses c
      INNER JOIN enrollments e ON c.course_id = e.course_id
      INNER JOIN students s ON e.student_id = s.student_id
      WHERE s.user_id = ?
      ORDER BY c.course_code ASC
    `;
    const [rows] = await pool.query(sql, [parseInt(studentUserId, 10)]);
    if (rows && rows.length > 0) return rows;
  }

  // Fallback to all courses
  const sqlAll = `
    SELECT course_id, course_code, course_name
    FROM courses
    ORDER BY course_code ASC
  `;
  const [allRows] = await pool.query(sqlAll);
  return allRows;
};

/**
 * Format raw query row
 */
const formatQueryRow = (r) => {
  if (!r) return null;
  return {
    query_id: r.query_id,
    asked_by_user_id: r.asked_by_user_id,
    student_name: r.student_name || 'Unknown Student',
    student_username: r.student_username || null,
    student_email: r.student_email || null,
    student_prn: r.student_prn || null,
    student_id: r.student_id || null,

    assigned_to_user_id: r.assigned_to_user_id,
    teacher_name: r.teacher_name || 'Unknown Teacher',
    teacher_username: r.teacher_username || null,
    teacher_email: r.teacher_email || null,
    teacher_designation: r.teacher_designation || null,
    teacher_id: r.teacher_id || null,

    course_id: r.course_id || null,
    course_code: r.course_code || null,
    course_name: r.course_name || null,

    subject: r.subject,
    question: r.question,
    message: r.question, // Alias for convenience
    priority: r.priority || 'Medium',
    status: r.status || 'Open',
    response: r.response || null,
    reply_count: parseInt(r.reply_count, 10) || 0,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
};

/**
 * Get paginated list of queries with role-scoping and multi-criteria filters
 */
const getQueries = async ({
  role = 'ADMIN',
  userId = null,
  page = 1,
  limit = 10,
  search = '',
  status = '',
  priority = '',
  course_id = '',
  teacher_id = '',
  student_id = '',
  from_date = '',
  to_date = ''
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const whereConditions = [];
  const queryParams = [];

  // Strict Role Scoping
  if (role === 'STUDENT') {
    whereConditions.push('q.asked_by_user_id = ?');
    queryParams.push(parseInt(userId, 10));
  } else if (role === 'TEACHER') {
    whereConditions.push('q.assigned_to_user_id = ?');
    queryParams.push(parseInt(userId, 10));
  }

  // Filter: Search across subject, question, student name, student PRN, teacher name
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push(`(
      q.subject LIKE ? OR 
      q.question LIKE ? OR 
      su.username LIKE ? OR 
      CONCAT(su.first_name, ' ', su.last_name) LIKE ? OR 
      st.prn_number LIKE ? OR
      tu.username LIKE ? OR
      CONCAT(tu.first_name, ' ', tu.last_name) LIKE ?
    )`);
    queryParams.push(term, term, term, term, term, term, term);
  }

  // Filter: Status (Support grouped states like 'Open', 'In Progress', 'Resolved', 'Closed')
  if (status && status.trim()) {
    const stVal = status.trim();
    if (stVal === 'Open') {
      whereConditions.push("(q.status = 'Open' OR q.status = 'Pending')");
    } else if (stVal === 'Resolved') {
      whereConditions.push("(q.status = 'Resolved' OR q.status = 'Answered')");
    } else {
      whereConditions.push('q.status = ?');
      queryParams.push(stVal);
    }
  }

  // Filter: Priority
  if (priority && priority.trim()) {
    whereConditions.push('q.priority = ?');
    queryParams.push(priority.trim());
  }

  // Filter: Course
  if (course_id) {
    const cid = parseInt(course_id, 10);
    if (!isNaN(cid) && cid > 0) {
      whereConditions.push('q.course_id = ?');
      queryParams.push(cid);
    }
  }

  // Filter: Specific Teacher user_id or teacher_id (for Admin view)
  if (teacher_id) {
    const tid = parseInt(teacher_id, 10);
    if (!isNaN(tid) && tid > 0) {
      whereConditions.push('(q.assigned_to_user_id = ? OR tc.teacher_id = ?)');
      queryParams.push(tid, tid);
    }
  }

  // Filter: Specific Student user_id or student_id (for Admin/Teacher view)
  if (student_id) {
    const sid = parseInt(student_id, 10);
    if (!isNaN(sid) && sid > 0) {
      whereConditions.push('(q.asked_by_user_id = ? OR st.student_id = ?)');
      queryParams.push(sid, sid);
    }
  }

  // Filter: Date range
  if (from_date && from_date.trim()) {
    whereConditions.push('DATE(q.created_at) >= ?');
    queryParams.push(from_date.trim());
  }
  if (to_date && to_date.trim()) {
    whereConditions.push('DATE(q.created_at) <= ?');
    queryParams.push(to_date.trim());
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // Count total matching records
  const countSql = `
    SELECT COUNT(*) AS total
    FROM queries q
    INNER JOIN users su ON q.asked_by_user_id = su.user_id
    LEFT JOIN students st ON su.user_id = st.user_id
    INNER JOIN users tu ON q.assigned_to_user_id = tu.user_id
    LEFT JOIN teachers tc ON tu.user_id = tc.user_id
    LEFT JOIN courses c ON q.course_id = c.course_id
    ${whereClause}
  `;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = parseInt(countRows[0].total, 10) || 0;
  const totalPages = Math.ceil(total / limitNum) || 1;

  // Fetch paginated query records
  const dataSql = `
    SELECT 
      q.query_id,
      q.asked_by_user_id,
      q.assigned_to_user_id,
      q.course_id,
      q.subject,
      q.question,
      q.priority,
      q.response,
      q.status,
      q.created_at,
      q.updated_at,
      TRIM(CONCAT(su.first_name, ' ', su.last_name)) AS student_name,
      su.username AS student_username,
      su.email AS student_email,
      st.prn_number AS student_prn,
      st.student_id,
      TRIM(CONCAT(tu.first_name, ' ', tu.last_name)) AS teacher_name,
      tu.username AS teacher_username,
      tu.email AS teacher_email,
      tc.designation AS teacher_designation,
      tc.teacher_id,
      c.course_code,
      c.course_name,
      (SELECT COUNT(*) FROM query_replies qr WHERE qr.query_id = q.query_id) AS reply_count
    FROM queries q
    INNER JOIN users su ON q.asked_by_user_id = su.user_id
    LEFT JOIN students st ON su.user_id = st.user_id
    INNER JOIN users tu ON q.assigned_to_user_id = tu.user_id
    LEFT JOIN teachers tc ON tu.user_id = tc.user_id
    LEFT JOIN courses c ON q.course_id = c.course_id
    ${whereClause}
    ORDER BY q.updated_at DESC, q.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(dataSql, [...queryParams, limitNum, offset]);

  return {
    total,
    page: pageNum,
    limit: limitNum,
    totalPages,
    data: rows.map(formatQueryRow)
  };
};

/**
 * Get replies for a specific query
 * @param {number} queryId
 */
const getRepliesByQueryId = async (queryId) => {
  const sql = `
    SELECT 
      qr.reply_id,
      qr.query_id,
      qr.sender_user_id,
      qr.message,
      qr.created_at,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS sender_name,
      u.username AS sender_username,
      u.email AS sender_email,
      r.role_name AS sender_role
    FROM query_replies qr
    INNER JOIN users u ON qr.sender_user_id = u.user_id
    LEFT JOIN roles r ON u.role_id = r.role_id
    WHERE qr.query_id = ?
    ORDER BY qr.created_at ASC, qr.reply_id ASC
  `;
  const [rows] = await pool.query(sql, [parseInt(queryId, 10)]);
  return rows.map((r) => ({
    reply_id: r.reply_id,
    query_id: r.query_id,
    sender_user_id: r.sender_user_id,
    sender_name: r.sender_name || 'Unknown User',
    sender_username: r.sender_username || null,
    sender_email: r.sender_email || null,
    sender_role: r.sender_role || null,
    message: r.message,
    created_at: r.created_at
  }));
};

/**
 * Get single query by ID with full details and replies
 * @param {number} queryId
 */
const getQueryById = async (queryId) => {
  const qid = parseInt(queryId, 10);
  if (isNaN(qid) || qid <= 0) return null;

  const sql = `
    SELECT 
      q.query_id,
      q.asked_by_user_id,
      q.assigned_to_user_id,
      q.course_id,
      q.subject,
      q.question,
      q.priority,
      q.response,
      q.status,
      q.created_at,
      q.updated_at,
      TRIM(CONCAT(su.first_name, ' ', su.last_name)) AS student_name,
      su.username AS student_username,
      su.email AS student_email,
      st.prn_number AS student_prn,
      st.student_id,
      TRIM(CONCAT(tu.first_name, ' ', tu.last_name)) AS teacher_name,
      tu.username AS teacher_username,
      tu.email AS teacher_email,
      tc.designation AS teacher_designation,
      tc.teacher_id,
      c.course_code,
      c.course_name,
      (SELECT COUNT(*) FROM query_replies qr WHERE qr.query_id = q.query_id) AS reply_count
    FROM queries q
    INNER JOIN users su ON q.asked_by_user_id = su.user_id
    LEFT JOIN students st ON su.user_id = st.user_id
    INNER JOIN users tu ON q.assigned_to_user_id = tu.user_id
    LEFT JOIN teachers tc ON tu.user_id = tc.user_id
    LEFT JOIN courses c ON q.course_id = c.course_id
    WHERE q.query_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [qid]);
  if (!rows || rows.length === 0) return null;

  const queryObj = formatQueryRow(rows[0]);
  queryObj.replies = await getRepliesByQueryId(qid);
  return queryObj;
};

/**
 * Get aggregated KPI statistics for queries
 */
const getQueryStats = async ({ role = 'ADMIN', userId = null }) => {
  const whereConditions = [];
  const queryParams = [];

  if (role === 'STUDENT') {
    whereConditions.push('q.asked_by_user_id = ?');
    queryParams.push(parseInt(userId, 10));
  } else if (role === 'TEACHER') {
    whereConditions.push('q.assigned_to_user_id = ?');
    queryParams.push(parseInt(userId, 10));
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      COUNT(*) AS total_queries,
      SUM(CASE WHEN q.status IN ('Open', 'Pending') THEN 1 ELSE 0 END) AS open_queries,
      SUM(CASE WHEN q.status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress_queries,
      SUM(CASE WHEN q.status IN ('Resolved', 'Answered') THEN 1 ELSE 0 END) AS resolved_queries,
      SUM(CASE WHEN q.status = 'Closed' THEN 1 ELSE 0 END) AS closed_queries,
      SUM(CASE WHEN q.priority = 'High' THEN 1 ELSE 0 END) AS high_priority_queries
    FROM queries q
    ${whereClause}
  `;
  const [rows] = await pool.query(sql, queryParams);
  const r = rows[0] || {};
  return {
    total_queries: parseInt(r.total_queries, 10) || 0,
    open_queries: parseInt(r.open_queries, 10) || 0,
    in_progress_queries: parseInt(r.in_progress_queries, 10) || 0,
    resolved_queries: parseInt(r.resolved_queries, 10) || 0,
    closed_queries: parseInt(r.closed_queries, 10) || 0,
    high_priority_queries: parseInt(r.high_priority_queries, 10) || 0
  };
};

/**
 * Create a new query
 */
const createQuery = async ({
  asked_by_user_id,
  assigned_to_user_id,
  course_id = null,
  subject,
  question,
  priority = 'Medium'
}) => {
  const sql = `
    INSERT INTO queries (
      asked_by_user_id,
      assigned_to_user_id,
      course_id,
      subject,
      question,
      priority,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, 'Open')
  `;
  const params = [
    parseInt(asked_by_user_id, 10),
    parseInt(assigned_to_user_id, 10),
    course_id ? parseInt(course_id, 10) : null,
    subject.trim(),
    question.trim(),
    priority || 'Medium'
  ];
  const [result] = await pool.query(sql, params);
  return getQueryById(result.insertId);
};

/**
 * Add reply to an existing query
 */
const addReply = async ({ query_id, sender_user_id, message, isTeacher = false }) => {
  const qid = parseInt(query_id, 10);
  const uid = parseInt(sender_user_id, 10);
  const cleanMsg = message.trim();

  // Insert into query_replies
  const insertSql = `
    INSERT INTO query_replies (query_id, sender_user_id, message)
    VALUES (?, ?, ?)
  `;
  const [replyResult] = await pool.query(insertSql, [qid, uid, cleanMsg]);

  // Update query: touch updated_at, set response if teacher, transition status if Open/Pending
  if (isTeacher) {
    const updateSql = `
      UPDATE queries 
      SET 
        response = ?,
        status = CASE WHEN status IN ('Open', 'Pending') THEN 'In Progress' ELSE status END,
        updated_at = CURRENT_TIMESTAMP
      WHERE query_id = ?
    `;
    await pool.query(updateSql, [cleanMsg, qid]);
  } else {
    const updateSql = `
      UPDATE queries 
      SET updated_at = CURRENT_TIMESTAMP
      WHERE query_id = ?
    `;
    await pool.query(updateSql, [qid]);
  }

  return {
    reply_id: replyResult.insertId,
    query_id: qid,
    sender_user_id: uid,
    message: cleanMsg,
    created_at: new Date()
  };
};

/**
 * Update query status
 */
const updateQueryStatus = async (queryId, newStatus) => {
  const qid = parseInt(queryId, 10);
  const sql = `
    UPDATE queries 
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE query_id = ?
  `;
  await pool.query(sql, [newStatus, qid]);
  return getQueryById(qid);
};

/**
 * Delete query (will cascade to query_replies)
 */
const deleteQuery = async (queryId) => {
  const qid = parseInt(queryId, 10);
  const [result] = await pool.query('DELETE FROM queries WHERE query_id = ?', [qid]);
  return result.affectedRows > 0;
};

module.exports = {
  checkTeacherAvailable,
  checkCourseExists,
  getActiveTeachers,
  getAvailableCourses,
  getQueries,
  getQueryById,
  getRepliesByQueryId,
  getQueryStats,
  createQuery,
  addReply,
  updateQueryStatus,
  deleteQuery
};
