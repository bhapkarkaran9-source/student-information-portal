const pool = require('../config/db');

/**
 * Academic Event Model
 * Table: academic_events
 * Reminder Logs: academic_event_reminder_logs
 */

/**
 * Helper to get student context
 * @param {number} userId 
 */
const getStudentContext = async (userId) => {
  const [rows] = await pool.query(
    'SELECT student_id, user_id, department_id, class_name, division, semester FROM students WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
};

/**
 * Helper to get teacher context
 * @param {number} userId 
 */
const getTeacherContext = async (userId) => {
  const [rows] = await pool.query(
    'SELECT teacher_id, user_id, department_id, designation FROM teachers WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
};

/**
 * Helper to get active enrolled course IDs for a student
 * @param {number} studentId 
 */
const getStudentEnrolledCourseIds = async (studentId) => {
  const [rows] = await pool.query(
    "SELECT course_id FROM enrollments WHERE student_id = ? AND status = 'Enrolled'",
    [studentId]
  );
  return rows.map(r => r.course_id);
};

/**
 * Helper to get course IDs taught by a teacher in timetable
 * @param {number} teacherId 
 */
const getTeacherAssignedCourseIds = async (teacherId) => {
  const [rows] = await pool.query(
    'SELECT DISTINCT course_id FROM timetable WHERE teacher_id = ?',
    [teacherId]
  );
  return rows.map(r => r.course_id);
};

/**
 * Format raw SQL event row
 */
const formatEventRow = (r) => {
  if (!r) return null;
  return {
    event_id: r.event_id,
    title: r.title,
    description: r.description || '',
    event_type: r.event_type,
    exam_type: r.exam_type || null,
    start_date: r.start_date_str || (r.start_date ? r.start_date.toISOString().split('T')[0] : null),
    end_date: r.end_date_str || (r.end_date ? r.end_date.toISOString().split('T')[0] : null),
    start_time: r.start_time ? r.start_time.toString().slice(0, 5) : null,
    end_time: r.end_time ? r.end_time.toString().slice(0, 5) : null,
    location: r.location || '',
    room: r.room || '',
    course_id: r.course_id || null,
    course_code: r.course_code || null,
    course_name: r.course_name || null,
    department_id: r.department_id || null,
    department_code: r.department_code || null,
    department_name: r.department_name || null,
    teacher_id: r.teacher_id || null,
    teacher_name: r.teacher_name || null,
    class_name: r.class_name || null,
    division: r.division || null,
    semester: r.semester !== null && r.semester !== undefined ? Number(r.semester) : null,
    target_audience: r.target_audience || 'ALL',
    instructions: r.instructions || '',
    created_by_user_id: r.created_by_user_id,
    creator_name: r.creator_name || null,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
};

/**
 * Base SELECT expression with joins
 */
const BASE_SELECT = `
  SELECT 
    e.event_id,
    e.title,
    e.description,
    e.event_type,
    e.exam_type,
    DATE_FORMAT(e.start_date, '%Y-%m-%d') AS start_date_str,
    DATE_FORMAT(e.end_date, '%Y-%m-%d') AS end_date_str,
    e.start_date,
    e.end_date,
    e.start_time,
    e.end_time,
    e.location,
    e.room,
    e.course_id,
    c.course_code,
    c.course_name,
    e.department_id,
    d.department_code,
    d.department_name,
    e.teacher_id,
    TRIM(CONCAT(tu.first_name, ' ', tu.last_name)) AS teacher_name,
    e.class_name,
    e.division,
    e.semester,
    e.target_audience,
    e.instructions,
    e.created_by_user_id,
    TRIM(CONCAT(cu.first_name, ' ', cu.last_name)) AS creator_name,
    e.created_at,
    e.updated_at
  FROM academic_events e
  LEFT JOIN courses c ON e.course_id = c.course_id
  LEFT JOIN departments d ON e.department_id = d.department_id
  LEFT JOIN teachers tch ON e.teacher_id = tch.teacher_id
  LEFT JOIN users tu ON tch.user_id = tu.user_id
  LEFT JOIN users cu ON e.created_by_user_id = cu.user_id
`;

/**
 * Build RBAC WHERE conditions for academic events
 */
const buildRbacWhereClause = async (role, user, baseConditions = [], baseParams = []) => {
  const conditions = [...baseConditions];
  const params = [...baseParams];

  if (!role || role === 'ADMIN') {
    return { conditions, params };
  }

  if (role === 'TEACHER') {
    const teacher = await getTeacherContext(user.user_id);
    if (!teacher) {
      conditions.push('1 = 0');
      return { conditions, params };
    }

    const assignedCourses = await getTeacherAssignedCourseIds(teacher.teacher_id);
    const teacherOrClauses = [
      "e.target_audience IN ('ALL', 'TEACHERS')",
      'e.teacher_id = ?',
      'e.department_id = ?'
    ];
    params.push(teacher.teacher_id, teacher.department_id);

    if (assignedCourses.length > 0) {
      teacherOrClauses.push(`e.course_id IN (${assignedCourses.map(() => '?').join(',')})`);
      params.push(...assignedCourses);
    }

    conditions.push(`(${teacherOrClauses.join(' OR ')})`);
    return { conditions, params };
  }

  if (role === 'STUDENT') {
    const student = await getStudentContext(user.user_id);
    if (!student) {
      conditions.push('1 = 0');
      return { conditions, params };
    }

    const enrolledCourses = await getStudentEnrolledCourseIds(student.student_id);

    // Students NEVER see events strictly targeted to teachers
    conditions.push("e.target_audience != 'TEACHERS'");

    const studentOrClauses = [
      // 1. General all-college events
      "(e.target_audience = 'ALL' AND e.department_id IS NULL AND e.class_name IS NULL AND e.course_id IS NULL)",
      // 2. General student events
      "(e.target_audience = 'STUDENTS' AND e.department_id IS NULL AND e.class_name IS NULL AND e.course_id IS NULL)",
      // 3. Department-targeted events
      "(e.department_id = ? AND (e.class_name IS NULL OR e.class_name = ?) AND (e.division IS NULL OR e.division = ?) AND (e.semester IS NULL OR e.semester = ?))",
      // 4. Class-targeted events
      "(e.class_name = ? AND (e.division IS NULL OR e.division = ?))"
    ];
    params.push(
      student.department_id, student.class_name, student.division, student.semester,
      student.class_name, student.division
    );

    // 5. Course enrolled events
    if (enrolledCourses.length > 0) {
      studentOrClauses.push(`e.course_id IN (${enrolledCourses.map(() => '?').join(',')})`);
      params.push(...enrolledCourses);
    }

    conditions.push(`(${studentOrClauses.join(' OR ')})`);
    return { conditions, params };
  }

  return { conditions, params };
};

/**
 * Get events with search, filters, pagination, and RBAC
 */
const getEvents = async ({
  page = 1,
  limit = 50,
  all = false,
  search = '',
  event_type = '',
  exam_type = '',
  department_id = '',
  course_id = '',
  teacher_id = '',
  class_name = '',
  target_audience = '',
  start_date = '',
  end_date = '',
  month = '', // YYYY-MM
  role = 'ADMIN',
  user = null
} = {}) => {
  const rawConditions = [];
  const rawParams = [];

  // Search filter
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    rawConditions.push(`(
      e.title LIKE ? OR 
      e.description LIKE ? OR 
      e.location LIKE ? OR 
      e.room LIKE ? OR 
      c.course_code LIKE ? OR 
      c.course_name LIKE ? OR 
      d.department_name LIKE ? OR 
      e.class_name LIKE ?
    )`);
    rawParams.push(term, term, term, term, term, term, term, term);
  }

  // Event type filter
  if (event_type && event_type.trim()) {
    rawConditions.push('e.event_type = ?');
    rawParams.push(event_type.trim());
  }

  // Exam type filter
  if (exam_type && exam_type.trim()) {
    rawConditions.push('e.exam_type = ?');
    rawParams.push(exam_type.trim());
  }

  // Department filter
  if (department_id !== '' && department_id !== undefined && department_id !== null) {
    rawConditions.push('e.department_id = ?');
    rawParams.push(parseInt(department_id, 10));
  }

  // Course filter
  if (course_id !== '' && course_id !== undefined && course_id !== null) {
    rawConditions.push('e.course_id = ?');
    rawParams.push(parseInt(course_id, 10));
  }

  // Teacher filter
  if (teacher_id !== '' && teacher_id !== undefined && teacher_id !== null) {
    rawConditions.push('e.teacher_id = ?');
    rawParams.push(parseInt(teacher_id, 10));
  }

  // Class name filter
  if (class_name && class_name.trim()) {
    rawConditions.push('e.class_name = ?');
    rawParams.push(class_name.trim());
  }

  // Target audience filter
  if (target_audience && target_audience.trim()) {
    rawConditions.push('e.target_audience = ?');
    rawParams.push(target_audience.trim());
  }

  // Month filter (e.g., '2026-09')
  if (month && /^\d{4}-\d{2}$/.test(month.trim())) {
    const [y, m] = month.trim().split('-');
    const mStart = `${y}-${m}-01`;
    // Month overlap: event starts on or before month end, and ends on or after month start
    rawConditions.push('e.start_date <= LAST_DAY(?) AND e.end_date >= ?');
    rawParams.push(mStart, mStart);
  } else {
    // Custom date range filter
    if (start_date && start_date.trim()) {
      rawConditions.push('e.end_date >= ?');
      rawParams.push(start_date.trim());
    }
    if (end_date && end_date.trim()) {
      rawConditions.push('e.start_date <= ?');
      rawParams.push(end_date.trim());
    }
  }

  // Apply RBAC filters
  const { conditions, params } = await buildRbacWhereClause(role, user, rawConditions, rawParams);
  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total matching
  const countSql = `
    SELECT COUNT(*) AS total
    FROM academic_events e
    LEFT JOIN courses c ON e.course_id = c.course_id
    LEFT JOIN departments d ON e.department_id = d.department_id
    LEFT JOIN teachers tch ON e.teacher_id = tch.teacher_id
    ${whereSql}
  `;
  const [countRows] = await pool.query(countSql, params);
  const total = countRows[0]?.total || 0;

  const orderSql = 'ORDER BY e.start_date ASC, e.start_time ASC, e.event_id ASC';

  if (all) {
    const [rows] = await pool.query(`${BASE_SELECT} ${whereSql} ${orderSql}`, params);
    return {
      events: rows.map(formatEventRow),
      pagination: {
        total,
        page: 1,
        limit: total,
        totalPages: 1
      }
    };
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (safePage - 1) * safeLimit;
  const totalPages = Math.ceil(total / safeLimit) || 1;

  const paginatedSql = `${BASE_SELECT} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`;
  const [rows] = await pool.query(paginatedSql, [...params, safeLimit, offset]);

  return {
    events: rows.map(formatEventRow),
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages
    }
  };
};

/**
 * Get upcoming events from today onwards
 */
const getUpcomingEvents = async ({ limit = 5, role = 'ADMIN', user = null } = {}) => {
  const rawConditions = ['e.end_date >= CURRENT_DATE()'];
  const rawParams = [];

  const { conditions, params } = await buildRbacWhereClause(role, user, rawConditions, rawParams);
  const whereSql = `WHERE ${conditions.join(' AND ')}`;

  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 5));
  const sql = `${BASE_SELECT} ${whereSql} ORDER BY e.start_date ASC, e.start_time ASC, e.event_id ASC LIMIT ?`;
  const [rows] = await pool.query(sql, [...params, safeLimit]);
  return rows.map(formatEventRow);
};

/**
 * Get today's active events
 */
const getTodayEvents = async ({ role = 'ADMIN', user = null } = {}) => {
  const rawConditions = ['CURRENT_DATE() BETWEEN e.start_date AND e.end_date'];
  const rawParams = [];

  const { conditions, params } = await buildRbacWhereClause(role, user, rawConditions, rawParams);
  const whereSql = `WHERE ${conditions.join(' AND ')}`;

  const sql = `${BASE_SELECT} ${whereSql} ORDER BY e.start_time ASC, e.event_id ASC`;
  const [rows] = await pool.query(sql, params);
  return rows.map(formatEventRow);
};

/**
 * Get exams specifically
 */
const getExams = async ({
  page = 1,
  limit = 50,
  all = false,
  exam_type = '',
  search = '',
  start_date = '',
  end_date = '',
  role = 'ADMIN',
  user = null
} = {}) => {
  return getEvents({
    page,
    limit,
    all,
    event_type: 'EXAM',
    exam_type,
    search,
    start_date,
    end_date,
    role,
    user
  });
};

/**
 * Get single event by ID with RBAC check
 */
const getEventById = async (eventId, role = 'ADMIN', user = null) => {
  const rawConditions = ['e.event_id = ?'];
  const rawParams = [parseInt(eventId, 10)];

  const { conditions, params } = await buildRbacWhereClause(role, user, rawConditions, rawParams);
  const whereSql = `WHERE ${conditions.join(' AND ')}`;

  const sql = `${BASE_SELECT} ${whereSql} LIMIT 1`;
  const [rows] = await pool.query(sql, params);
  return rows.length > 0 ? formatEventRow(rows[0]) : null;
};

/**
 * Create a new academic event
 */
const createEvent = async ({
  title,
  description = null,
  event_type,
  exam_type = null,
  start_date,
  end_date,
  start_time = null,
  end_time = null,
  location = null,
  room = null,
  course_id = null,
  department_id = null,
  teacher_id = null,
  class_name = null,
  division = null,
  semester = null,
  target_audience = 'ALL',
  instructions = null,
  created_by_user_id
}) => {
  const sql = `
    INSERT INTO academic_events (
      title, description, event_type, exam_type, start_date, end_date,
      start_time, end_time, location, room, course_id, department_id,
      teacher_id, class_name, division, semester, target_audience,
      instructions, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    title.trim(),
    description ? description.trim() : null,
    event_type,
    exam_type ? exam_type.trim() : null,
    start_date,
    end_date || start_date,
    start_time || null,
    end_time || null,
    location ? location.trim() : null,
    room ? room.trim() : null,
    course_id ? parseInt(course_id, 10) : null,
    department_id ? parseInt(department_id, 10) : null,
    teacher_id ? parseInt(teacher_id, 10) : null,
    class_name ? class_name.trim() : null,
    division ? division.trim() : null,
    semester !== null && semester !== undefined && semester !== '' ? parseInt(semester, 10) : null,
    target_audience || 'ALL',
    instructions ? instructions.trim() : null,
    parseInt(created_by_user_id, 10)
  ];

  const [result] = await pool.query(sql, params);
  return getEventById(result.insertId, 'ADMIN');
};

/**
 * Update an existing academic event
 */
const updateEvent = async (eventId, {
  title,
  description,
  event_type,
  exam_type,
  start_date,
  end_date,
  start_time,
  end_time,
  location,
  room,
  course_id,
  department_id,
  teacher_id,
  class_name,
  division,
  semester,
  target_audience,
  instructions
}) => {
  const sql = `
    UPDATE academic_events SET
      title = ?,
      description = ?,
      event_type = ?,
      exam_type = ?,
      start_date = ?,
      end_date = ?,
      start_time = ?,
      end_time = ?,
      location = ?,
      room = ?,
      course_id = ?,
      department_id = ?,
      teacher_id = ?,
      class_name = ?,
      division = ?,
      semester = ?,
      target_audience = ?,
      instructions = ?
    WHERE event_id = ?
  `;

  const params = [
    title.trim(),
    description ? description.trim() : null,
    event_type,
    exam_type ? exam_type.trim() : null,
    start_date,
    end_date || start_date,
    start_time || null,
    end_time || null,
    location ? location.trim() : null,
    room ? room.trim() : null,
    course_id ? parseInt(course_id, 10) : null,
    department_id ? parseInt(department_id, 10) : null,
    teacher_id ? parseInt(teacher_id, 10) : null,
    class_name ? class_name.trim() : null,
    division ? division.trim() : null,
    semester !== null && semester !== undefined && semester !== '' ? parseInt(semester, 10) : null,
    target_audience || 'ALL',
    instructions ? instructions.trim() : null,
    parseInt(eventId, 10)
  ];

  const [result] = await pool.query(sql, params);
  if (result.affectedRows === 0) return null;
  return getEventById(eventId, 'ADMIN');
};

/**
 * Delete an academic event
 */
const deleteEvent = async (eventId) => {
  const sql = 'DELETE FROM academic_events WHERE event_id = ?';
  const [result] = await pool.query(sql, [parseInt(eventId, 10)]);
  return result.affectedRows > 0;
};

/**
 * Find all target recipient user IDs for an academic event
 */
const findRecipientsForEvent = async (event) => {
  const { target_audience, department_id, course_id, class_name, division, semester } = event;

  // If specific course is set, recipients are active enrolled students + assigned teacher
  if (course_id) {
    const [enrolled] = await pool.query(`
      SELECT s.user_id 
      FROM enrollments e
      JOIN students s ON e.student_id = s.student_id
      JOIN users u ON s.user_id = u.user_id
      WHERE e.course_id = ? AND e.status = 'Enrolled' AND u.is_active = 1
    `, [course_id]);

    const [teachers] = await pool.query(`
      SELECT tch.user_id
      FROM timetable t
      JOIN teachers tch ON t.teacher_id = tch.teacher_id
      JOIN users u ON tch.user_id = u.user_id
      WHERE t.course_id = ? AND u.is_active = 1
    `, [course_id]);

    const userIds = new Set([
      ...enrolled.map(r => r.user_id),
      ...teachers.map(r => r.user_id)
    ]);
    return Array.from(userIds);
  }

  // If targeted to CLASS
  if (target_audience === 'CLASS' || class_name) {
    const params = [class_name];
    let divClause = '';
    if (division) {
      divClause = 'AND s.division = ?';
      params.push(division);
    }
    const [students] = await pool.query(`
      SELECT s.user_id 
      FROM students s
      JOIN users u ON s.user_id = u.user_id
      WHERE s.class_name = ? ${divClause} AND u.is_active = 1
    `, params);
    return students.map(r => r.user_id);
  }

  // If targeted to DEPARTMENT
  if (target_audience === 'DEPARTMENT' && department_id) {
    const [students] = await pool.query(`
      SELECT s.user_id FROM students s JOIN users u ON s.user_id = u.user_id
      WHERE s.department_id = ? AND u.is_active = 1
    `, [department_id]);

    const [teachers] = await pool.query(`
      SELECT t.user_id FROM teachers t JOIN users u ON t.user_id = u.user_id
      WHERE t.department_id = ? AND u.is_active = 1
    `, [department_id]);

    return Array.from(new Set([...students.map(r => r.user_id), ...teachers.map(r => r.user_id)]));
  }

  // If targeted to TEACHERS
  if (target_audience === 'TEACHERS') {
    let deptClause = '';
    const params = [];
    if (department_id) {
      deptClause = 'AND t.department_id = ?';
      params.push(department_id);
    }
    const [teachers] = await pool.query(`
      SELECT t.user_id FROM teachers t JOIN users u ON t.user_id = u.user_id
      WHERE u.is_active = 1 ${deptClause}
    `, params);
    return teachers.map(r => r.user_id);
  }

  // If targeted to STUDENTS
  if (target_audience === 'STUDENTS') {
    let deptClause = '';
    const params = [];
    if (department_id) {
      deptClause = 'AND s.department_id = ?';
      params.push(department_id);
    }
    const [students] = await pool.query(`
      SELECT s.user_id FROM students s JOIN users u ON s.user_id = u.user_id
      WHERE u.is_active = 1 ${deptClause}
    `, params);
    return students.map(r => r.user_id);
  }

  // Default: ALL active users
  const [allUsers] = await pool.query('SELECT user_id FROM users WHERE is_active = 1');
  return allUsers.map(r => r.user_id);
};

/**
 * Log reminder sent with atomic deduplication
 */
const logReminderSent = async ({ user_id, event_id, event_date, reminder_type, notification_id = null }) => {
  try {
    const sql = `
      INSERT INTO academic_event_reminder_logs (user_id, event_id, event_date, reminder_type, notification_id)
      VALUES (?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(sql, [
      user_id,
      event_id,
      event_date,
      reminder_type,
      notification_id
    ]);
    return result.affectedRows > 0;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return false; // Idempotent duplicate prevented
    }
    throw err;
  }
};

/**
 * Format a time string into 12-hour AM/PM format (or range)
 */
function formatEventTime(startTime, endTime) {
  if (!startTime) return 'Scheduled Time';
  const fmt = (tStr) => {
    if (!tStr) return '';
    const parts = tStr.toString().split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${m} ${ampm}`;
  };
  const startFmt = fmt(startTime);
  if (endTime) {
    const endFmt = fmt(endTime);
    return `${startFmt} - ${endFmt}`;
  }
  return startFmt;
}

/**
 * Trigger automatic reminders for upcoming events or specific exam/calendar event
 * Supports 7_DAYS, 3_DAYS, 1_DAY / 1_DAY_BEFORE, TODAY, STARTING_SOON / STARTING_NOW
 * 
 * @param {object} [options={}]
 * @param {number} [options.event_id] - Optional single event ID to evaluate
 * @param {string} [options.reminder_type] - Optional specific reminder type ('1_DAY_BEFORE', 'STARTING_NOW', etc.)
 * @param {number} [options.user_id] - Optional single recipient user ID filter
 * @returns {Promise<{ success: boolean, checkedCount: number, dispatchedCount: number }>}
 */
const triggerReminders = async ({ event_id = null, reminder_type = null, user_id = null } = {}) => {
  let whereSql = 'WHERE e.start_date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)';
  const queryParams = [];

  if (event_id) {
    whereSql = 'WHERE e.event_id = ?';
    queryParams.push(parseInt(event_id, 10));
  }

  // Query events matching criteria
  const sql = `
    SELECT 
      e.*,
      DATE_FORMAT(e.start_date, '%Y-%m-%d') AS start_date_str,
      c.course_code,
      c.course_name
    FROM academic_events e
    LEFT JOIN courses c ON e.course_id = c.course_id
    ${whereSql}
  `;
  const [events] = await pool.query(sql, queryParams);

  let checkedCount = 0;
  let dispatchedCount = 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  for (const event of events) {
    const isExam = event.event_type === 'EXAM';
    const eventDateStr = event.start_date_str;
    const eventDate = new Date(eventDateStr);
    const todayDate = new Date(todayStr);
    const diffDays = Math.round((eventDate - todayDate) / (1000 * 60 * 60 * 24));

    let remindersToDispatch = [];

    if (isExam) {
      if (reminder_type) {
        const rtUpper = String(reminder_type).trim().toUpperCase();
        if (rtUpper === '1_DAY_BEFORE' || rtUpper === '1_DAY') {
          remindersToDispatch.push('1_DAY_BEFORE');
        } else if (rtUpper === 'STARTING_NOW' || rtUpper === 'STARTING_SOON') {
          remindersToDispatch.push('STARTING_NOW');
        } else {
          remindersToDispatch.push(rtUpper);
        }
      } else {
        if (diffDays === 7) {
          remindersToDispatch.push('7_DAYS');
        } else if (diffDays === 3) {
          remindersToDispatch.push('3_DAYS');
        } else if (diffDays === 1) {
          remindersToDispatch.push('1_DAY_BEFORE');
        } else if (diffDays === 0) {
          remindersToDispatch.push('TODAY');

          // Check if starting soon (within 2 hours)
          if (event.start_time) {
            const [h, m] = event.start_time.toString().split(':');
            const eventStartTime = new Date();
            eventStartTime.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
            const diffMinutes = (eventStartTime.getTime() - now.getTime()) / (1000 * 60);
            if (diffMinutes > 0 && diffMinutes <= 120) {
              remindersToDispatch.push('STARTING_NOW');
            }
          }
        }
      }
    } else {
      // Normal Academic Events: send ONLY ONE reminder 1 day before the event
      if (reminder_type) {
        const rtUpper = String(reminder_type).trim().toUpperCase();
        if (rtUpper === '1_DAY_BEFORE' || rtUpper === '1_DAY') {
          remindersToDispatch.push('1_DAY');
        }
      } else if (diffDays === 1) {
        remindersToDispatch.push('1_DAY');
      }
    }

    if (remindersToDispatch.length === 0) continue;

    let recipientUserIds = await findRecipientsForEvent(event);
    if (user_id) {
      recipientUserIds = recipientUserIds.filter(id => id === parseInt(user_id, 10));
    }

    checkedCount += recipientUserIds.length * remindersToDispatch.length;

    for (const reminderType of remindersToDispatch) {
      const is1Day = (reminderType === '1_DAY_BEFORE' || reminderType === '1_DAY');
      const isStarting = (reminderType === 'STARTING_NOW' || reminderType === 'STARTING_SOON');
      const dbReminderType = is1Day ? '1_DAY' : (isStarting ? 'STARTING_SOON' : reminderType);

      for (const userId of recipientUserIds) {
        // Attempt atomic reservation in log
        try {
          const insertLogSql = `
            INSERT INTO academic_event_reminder_logs (user_id, event_id, event_date, reminder_type)
            VALUES (?, ?, ?, ?)
          `;
          const [logRes] = await pool.query(insertLogSql, [userId, event.event_id, eventDateStr, dbReminderType]);
          const logId = logRes.insertId;

          const courseDisplay = event.course_name 
            ? `${event.course_code} - ${event.course_name}`
            : (event.course_code || 'Course');
          const venue = event.room || event.location || (isExam ? 'Examination Hall' : 'Campus Venue');
          const formattedTimeStr = formatEventTime(event.start_time, event.end_time);

          const [ey, em, ed] = eventDateStr.split('-');
          const formattedDateStr = `${parseInt(ed, 10)} ${months[parseInt(em, 10) - 1]} ${ey}`;

          let notifTitle;
          let notifMessage;

          if (isExam) {
            if (isStarting) {
              notifTitle = `Urgent: Exam Starting Now - ${event.title}`;
              notifMessage = `Your examination "${event.title}" for ${courseDisplay} is starting now at ${formattedTimeStr} in ${venue}. Please report to the examination hall immediately.`;
            } else if (is1Day) {
              notifTitle = `Exam Reminder: Tomorrow - ${event.title}`;
              notifMessage = `Your examination "${event.title}" for ${courseDisplay} is scheduled for tomorrow (${formattedDateStr}) at ${formattedTimeStr} in ${venue}. Please be on time with your student ID.`;
            } else {
              notifTitle = `Exam Reminder: ${event.title}`;
              notifMessage = `Reminder: Examination "${event.title}" for ${courseDisplay} on ${formattedDateStr} at ${formattedTimeStr} in ${venue}.`;
            }
          } else {
            notifTitle = `Reminder: Tomorrow - ${event.title}`;
            notifMessage = `${event.title} (${event.event_type}) on ${formattedDateStr}`;
            if (event.start_time) notifMessage += ` at ${formattedTimeStr}`;
            if (venue) notifMessage += ` in ${venue}`;
            if (event.instructions) notifMessage += `\nInstructions: ${event.instructions}`;
          }

          const notificationModel = require('./notification.model');
          const createdNotif = await notificationModel.createNotification({
            recipient_user_id: userId,
            title: notifTitle,
            message: notifMessage,
            notification_type: isExam ? 'EXAM_REMINDER' : 'ACADEMIC_EVENT_REMINDER',
            is_read: 0,
            metadata: {
              emailNotificationType: isExam ? 'EXAM_REMINDER' : 'ACADEMIC_EVENT_REMINDER',
              eventId: isExam
                ? (is1Day ? `${event.event_id}_1_DAY` : `${event.event_id}_STARTING`)
                : `${event.event_id}_1_DAY`,
              examEventId: event.event_id,
              academicEventId: event.event_id,
              examName: event.title,
              eventTitle: event.title,
              title: event.title,
              description: event.description || null,
              course: courseDisplay,
              courseCode: event.course_code,
              courseName: event.course_name,
              date: formattedDateStr,
              time: formattedTimeStr,
              venue: venue,
              room: event.room,
              location: event.location,
              reminderType: isExam ? (is1Day ? '1_DAY_BEFORE' : 'STARTING_NOW') : '1_DAY',
              reminderMessage: isExam 
                ? null 
                : 'This is a reminder that your academic event is scheduled for tomorrow.',
              reminderText: isExam 
                ? (isStarting 
                    ? 'This is an urgent reminder that your examination is starting now. Please report to the examination hall immediately.'
                    : 'This is a reminder that your examination is scheduled for tomorrow.')
                : 'This is a reminder that your academic event is scheduled for tomorrow.'
            }
          });

          // Link notification_id back to reminder log
          if (createdNotif?.notification_id) {
            await pool.query('UPDATE academic_event_reminder_logs SET notification_id = ? WHERE reminder_log_id = ?', [
              createdNotif.notification_id,
              logId
            ]);
          }

          dispatchedCount++;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            // Already logged/sent, skip cleanly
            continue;
          }
          console.error('[AcademicEvent] Error sending reminder:', err.message);
        }
      }
    }
  }

  return {
    success: true,
    checkedCount,
    dispatchedCount
  };
};

/**
 * Triggers an exam reminder specifically for an exam event and reminder type.
 * Supports reminderType = '1_DAY_BEFORE' | 'STARTING_NOW'.
 */
const triggerExamReminder = async ({ eventId, event_id, reminderType, reminder_type, userId = null, user_id = null } = {}) => {
  const targetEventId = eventId || event_id;
  const targetReminderType = reminderType || reminder_type;
  return triggerReminders({
    event_id: targetEventId,
    reminder_type: targetReminderType,
    user_id: userId || user_id
  });
};

module.exports = {
  getEvents,
  getUpcomingEvents,
  getTodayEvents,
  getExams,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  findRecipientsForEvent,
  logReminderSent,
  triggerReminders,
  triggerExamReminder,
  getStudentContext,
  getTeacherContext,
  formatEventTime
};
