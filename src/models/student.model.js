const pool = require('../config/db');

/**
 * Get paginated, searchable, filterable list of students
 * @param {Object} options
 * @returns {Promise<{ students: Array, total: number }>}
 */
const getStudents = async ({ page = 1, limit = 10, search = '', department_id = '', semester = '', status = '', teacher_id = '' }) => {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (parsedPage - 1) * parsedLimit;

  const whereConditions = [];
  const queryParams = [];

  // Search by PRN, student name, username, email, department
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push(`(
      s.prn_number LIKE ? OR 
      u.first_name LIKE ? OR 
      u.last_name LIKE ? OR 
      u.username LIKE ? OR 
      u.email LIKE ? OR 
      d.department_name LIKE ? OR 
      d.department_code LIKE ?
    )`);
    queryParams.push(term, term, term, term, term, term, term);
  }

  // Filter by department
  if (department_id !== '' && department_id !== undefined && department_id !== null) {
    whereConditions.push('s.department_id = ?');
    queryParams.push(parseInt(department_id, 10));
  }

  // Filter by semester (1-12)
  if (semester !== '' && semester !== undefined && semester !== null) {
    whereConditions.push('s.semester = ?');
    queryParams.push(parseInt(semester, 10));
  }

  // Filter by user active status
  if (status !== '' && status !== undefined && status !== null) {
    const isActive = (status === '1' || status === 'true' || status === 1 || status === true) ? 1 : 0;
    whereConditions.push('u.is_active = ?');
    queryParams.push(isActive);
  }

  // Authoritative Faculty Filter: strictly students enrolled in teacher's assigned courses
  let safeTeacherId = null;
  if (teacher_id !== '' && teacher_id !== undefined && teacher_id !== null) {
    safeTeacherId = parseInt(teacher_id, 10);
    whereConditions.push(`s.student_id IN (
      SELECT DISTINCT e.student_id 
      FROM enrollments e 
      INNER JOIN timetable tt ON e.course_id = tt.course_id 
      WHERE tt.teacher_id = ? AND e.status = 'Enrolled'
    )`);
    queryParams.push(safeTeacherId);
  }

  const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Total matching count
  const countSql = `
    SELECT COUNT(*) as total
    FROM students s
    INNER JOIN users u ON s.user_id = u.user_id
    INNER JOIN departments d ON s.department_id = d.department_id
    ${whereSql}
  `;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = countRows[0] ? countRows[0].total : 0;

  // 2. Fetch paginated data (Strictly excludes password_hash)
  const teacherCourseSubquery = safeTeacherId
    ? `(
        SELECT GROUP_CONCAT(DISTINCT c.course_code ORDER BY c.course_code SEPARATOR ', ')
        FROM enrollments e2
        INNER JOIN courses c ON e2.course_id = c.course_id
        INNER JOIN timetable tt2 ON c.course_id = tt2.course_id
        WHERE e2.student_id = s.student_id AND tt2.teacher_id = ${safeTeacherId} AND e2.status = 'Enrolled'
      )`
    : `(
        SELECT GROUP_CONCAT(DISTINCT c.course_code ORDER BY c.course_code SEPARATOR ', ')
        FROM enrollments e2
        INNER JOIN courses c ON e2.course_id = c.course_id
        WHERE e2.student_id = s.student_id AND e2.status = 'Enrolled'
      )`;

  const teacherAttSubquery = safeTeacherId
    ? `(
        SELECT ROUND((SUM(CASE WHEN a.status IN ('Present', 'Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(a.attendance_id), 0)) * 100, 2)
        FROM attendance a
        WHERE a.student_id = s.student_id AND a.teacher_id = ${safeTeacherId}
      )`
    : `(
        SELECT ROUND((SUM(CASE WHEN a.status IN ('Present', 'Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(a.attendance_id), 0)) * 100, 2)
        FROM attendance a
        WHERE a.student_id = s.student_id
      )`;

  const dataSql = `
    SELECT 
      s.student_id,
      s.user_id,
      s.prn_number,
      s.department_id,
      s.admission_date,
      s.date_of_birth,
      s.gender,
      s.class_name,
      s.division,
      s.semester,
      s.created_at AS student_created_at,
      s.updated_at AS student_updated_at,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      u.phone,
      u.is_active,
      d.department_code,
      d.department_name,
      ${teacherCourseSubquery} AS enrolled_courses,
      ${teacherAttSubquery} AS attendance_percentage
    FROM students s
    INNER JOIN users u ON s.user_id = u.user_id
    INNER JOIN departments d ON s.department_id = d.department_id
    ${whereSql}
    ORDER BY s.student_id DESC
    LIMIT ? OFFSET ?
  `;
  const [students] = await pool.query(dataSql, [...queryParams, parsedLimit, offset]);

  return { students, total };
};

/**
 * Find complete safe student profile by student_id
 * @param {number} studentId
 * @returns {Promise<Object|null>}
 */
const findById = async (studentId) => {
  const sql = `
    SELECT 
      s.student_id,
      s.user_id,
      s.prn_number,
      s.department_id,
      s.admission_date,
      s.date_of_birth,
      s.gender,
      s.class_name,
      s.division,
      s.semester,
      s.created_at AS student_created_at,
      s.updated_at AS student_updated_at,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      u.phone,
      u.is_active,
      u.created_at AS user_created_at,
      d.department_code,
      d.department_name
    FROM students s
    INNER JOIN users u ON s.user_id = u.user_id
    INNER JOIN departments d ON s.department_id = d.department_id
    WHERE s.student_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [studentId]);
  return rows[0] || null;
};

/**
 * Find student by PRN number
 * @param {string} prn
 * @returns {Promise<Object|null>}
 */
const findByPrn = async (prn) => {
  const sql = 'SELECT student_id, user_id, prn_number FROM students WHERE prn_number = ? LIMIT 1';
  const [rows] = await pool.query(sql, [prn.trim()]);
  return rows[0] || null;
};

/**
 * Find student by linked user_id
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
const findByUserId = async (userId) => {
  const sql = `
    SELECT 
      student_id, 
      user_id, 
      prn_number, 
      department_id, 
      admission_date, 
      date_of_birth, 
      gender, 
      class_name, 
      division, 
      semester 
    FROM students 
    WHERE user_id = ? 
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [userId]);
  return rows[0] || null;
};

/**
 * Create user and student in an atomic MySQL transaction
 * @param {Object} userData
 * @param {Object} studentData
 * @returns {Promise<number>} Created student_id
 */
const createStudentWithUser = async (userData, studentData) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Dynamically query role_id for role_name = 'STUDENT'
    const [roleRows] = await connection.query(
      "SELECT role_id FROM roles WHERE role_name = 'STUDENT' LIMIT 1"
    );
    if (!roleRows || roleRows.length === 0) {
      throw new Error("Role 'STUDENT' not found in roles table");
    }
    const studentRoleId = roleRows[0].role_id;

    // 2. Insert into users using the dynamic studentRoleId
    const userSql = `
      INSERT INTO users (
        role_id,
        username,
        email,
        password_hash,
        first_name,
        last_name,
        phone,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `;
    const [userResult] = await connection.query(userSql, [
      studentRoleId,
      userData.username.trim(),
      userData.email.trim().toLowerCase(),
      userData.password_hash,
      userData.first_name.trim(),
      userData.last_name.trim(),
      userData.phone ? userData.phone.trim() : null
    ]);

    const newUserId = userResult.insertId;

    // 2. Insert into students
    const studentSql = `
      INSERT INTO students (
        user_id,
        prn_number,
        department_id,
        admission_date,
        date_of_birth,
        gender,
        class_name,
        division,
        semester
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [studentResult] = await connection.query(studentSql, [
      newUserId,
      studentData.prn_number.trim(),
      studentData.department_id,
      studentData.admission_date,
      studentData.date_of_birth || null,
      studentData.gender || null,
      studentData.class_name.trim(),
      studentData.division.trim(),
      studentData.semester
    ]);

    await connection.commit();
    return studentResult.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Update user and student in an atomic MySQL transaction
 * @param {number} studentId
 * @param {number} userId
 * @param {Object} userFields
 * @param {Object} studentFields
 * @returns {Promise<boolean>}
 */
const updateStudentWithUser = async (studentId, userId, userFields = {}, studentFields = {}) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Update user fields if provided
    if (Object.keys(userFields).length > 0) {
      const allowedUserFields = ['username', 'email', 'first_name', 'last_name', 'phone', 'password_hash'];
      const userUpdates = [];
      const userParams = [];

      for (const [key, val] of Object.entries(userFields)) {
        if (allowedUserFields.includes(key) && val !== undefined) {
          userUpdates.push(`${key} = ?`);
          userParams.push(val);
        }
      }

      if (userUpdates.length > 0) {
        const userSql = `UPDATE users SET ${userUpdates.join(', ')} WHERE user_id = ?`;
        userParams.push(userId);
        await connection.query(userSql, userParams);
      }
    }

    // 2. Update student fields if provided
    if (Object.keys(studentFields).length > 0) {
      const allowedStudentFields = [
        'prn_number',
        'department_id',
        'admission_date',
        'date_of_birth',
        'gender',
        'class_name',
        'division',
        'semester'
      ];
      const studentUpdates = [];
      const studentParams = [];

      for (const [key, val] of Object.entries(studentFields)) {
        if (allowedStudentFields.includes(key) && val !== undefined) {
          studentUpdates.push(`${key} = ?`);
          studentParams.push(val);
        }
      }

      if (studentUpdates.length > 0) {
        const studentSql = `UPDATE students SET ${studentUpdates.join(', ')} WHERE student_id = ?`;
        studentParams.push(studentId);
        await connection.query(studentSql, studentParams);
      }
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Update student active status on the associated user account
 * @param {number} studentId
 * @param {boolean} isActive
 * @returns {Promise<boolean>}
 */
const updateStudentStatus = async (studentId, isActive) => {
  const sql = `
    UPDATE users u
    INNER JOIN students s ON u.user_id = s.user_id
    SET u.is_active = ?
    WHERE s.student_id = ?
  `;
  const [result] = await pool.query(sql, [isActive ? 1 : 0, studentId]);
  return result.affectedRows > 0;
};

/**
 * Check foreign-key dependencies before deleting student
 * @param {number} studentId
 * @returns {Promise<{ hasDependencies: boolean, details: Object }>}
 */
const checkStudentDependencies = async (studentId) => {
  const [enrollments] = await pool.query('SELECT COUNT(*) as count FROM enrollments WHERE student_id = ?', [studentId]);
  const [attendance] = await pool.query('SELECT COUNT(*) as count FROM attendance WHERE student_id = ?', [studentId]);
  const [grades] = await pool.query('SELECT COUNT(*) as count FROM grades WHERE student_id = ?', [studentId]);
  const [performance] = await pool.query('SELECT COUNT(*) as count FROM performance_records WHERE student_id = ?', [studentId]);

  const enrollmentCount = enrollments[0]?.count || 0;
  const attendanceCount = attendance[0]?.count || 0;
  const gradeCount = grades[0]?.count || 0;
  const performanceCount = performance[0]?.count || 0;

  const total = enrollmentCount + attendanceCount + gradeCount + performanceCount;

  return {
    hasDependencies: total > 0,
    details: {
      enrollmentCount,
      attendanceCount,
      gradeCount,
      performanceCount
    }
  };
};

/**
 * Safely delete student and associated user account in an atomic transaction
 * @param {number} studentId
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
const deleteStudentWithUser = async (studentId, userId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Delete student record first
    await connection.query('DELETE FROM students WHERE student_id = ?', [studentId]);
    // Delete associated user record
    await connection.query('DELETE FROM users WHERE user_id = ?', [userId]);

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  getStudents,
  findById,
  findByPrn,
  findByUserId,
  createStudentWithUser,
  updateStudentWithUser,
  updateStudentStatus,
  checkStudentDependencies,
  deleteStudentWithUser
};
