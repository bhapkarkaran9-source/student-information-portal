const pool = require('../config/db');

/**
 * Teacher Data Access Model
 * Database: student_portal_db
 * Tables: teachers, users, departments, roles
 */

/**
 * Get paginated list of teachers with search and filters
 * @param {Object} options
 * @param {number} options.page
 * @param {number} options.limit
 * @param {string} options.search
 * @param {string|number} options.department_id
 * @param {string} options.status
 * @returns {Promise<Object>} { teachers, pagination }
 */
const getTeachers = async ({ page = 1, limit = 10, search = '', department_id = '', status = '' }) => {
  const offset = (page - 1) * limit;
  const whereConditions = [];
  const queryParams = [];

  // Free-text search across employee_number, names, username, email, designation
  if (search && search.trim()) {
    const searchWildcard = `%${search.trim()}%`;
    whereConditions.push(`(
      t.employee_number LIKE ? OR
      u.first_name LIKE ? OR
      u.last_name LIKE ? OR
      u.username LIKE ? OR
      u.email LIKE ? OR
      t.designation LIKE ?
    )`);
    queryParams.push(
      searchWildcard,
      searchWildcard,
      searchWildcard,
      searchWildcard,
      searchWildcard,
      searchWildcard
    );
  }

  // Filter by department
  if (department_id !== '' && department_id !== undefined && department_id !== null) {
    whereConditions.push('t.department_id = ?');
    queryParams.push(parseInt(department_id, 10));
  }

  // Filter by user active status (1 or 0)
  if (status !== '' && status !== undefined && status !== null) {
    whereConditions.push('u.is_active = ?');
    queryParams.push(parseInt(status, 10));
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Count query for accurate pagination metadata
  const countSql = `
    SELECT COUNT(*) as total
    FROM teachers t
    INNER JOIN users u ON t.user_id = u.user_id
    LEFT JOIN departments d ON t.department_id = d.department_id
    ${whereClause}
  `;
  const [countResult] = await pool.query(countSql, queryParams);
  const total = countResult[0].total;
  const totalPages = Math.ceil(total / limit) || 1;

  // 2. Data query - strictly excluding password_hash
  const dataSql = `
    SELECT 
      t.teacher_id,
      t.user_id,
      t.employee_number,
      t.department_id,
      t.designation,
      t.joining_date,
      t.created_at,
      t.updated_at,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      u.phone,
      u.is_active,
      d.department_code,
      d.department_name
    FROM teachers t
    INNER JOIN users u ON t.user_id = u.user_id
    LEFT JOIN departments d ON t.department_id = d.department_id
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(dataSql, [...queryParams, limit, offset]);

  return {
    teachers: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages
    }
  };
};

/**
 * Find single teacher by teacher_id (joined with users and departments)
 * Strictly excludes password_hash
 * @param {number} teacherId
 * @returns {Promise<Object|null>}
 */
const findById = async (teacherId) => {
  const sql = `
    SELECT 
      t.teacher_id,
      t.user_id,
      t.employee_number,
      t.department_id,
      t.designation,
      t.joining_date,
      t.created_at,
      t.updated_at,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      u.phone,
      u.is_active,
      d.department_code,
      d.department_name
    FROM teachers t
    INNER JOIN users u ON t.user_id = u.user_id
    LEFT JOIN departments d ON t.department_id = d.department_id
    WHERE t.teacher_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [teacherId]);
  return rows[0] || null;
};

/**
 * Find teacher by user_id
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
const findByUserId = async (userId) => {
  const sql = `
    SELECT 
      t.teacher_id,
      t.user_id,
      t.employee_number,
      t.department_id,
      t.designation,
      t.joining_date
    FROM teachers t
    WHERE t.user_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [userId]);
  return rows[0] || null;
};

/**
 * Find teacher by employee_number
 * @param {string} employeeNumber
 * @returns {Promise<Object|null>}
 */
const findByEmployeeNumber = async (employeeNumber) => {
  const sql = `
    SELECT 
      t.teacher_id,
      t.user_id,
      t.employee_number,
      t.department_id,
      t.designation,
      t.joining_date
    FROM teachers t
    WHERE t.employee_number = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [employeeNumber]);
  return rows[0] || null;
};

/**
 * Create user and teacher in an atomic MySQL transaction
 * Dynamically queries roles table for role_name = 'TEACHER'
 * @param {Object} userData { username, email, password_hash, first_name, last_name, phone }
 * @param {Object} teacherData { employee_number, department_id, designation, joining_date }
 * @returns {Promise<number>} Created teacher_id
 */
const createTeacherWithUser = async (userData, teacherData) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Dynamically query role_id for role_name = 'TEACHER'
    const [roleRows] = await connection.query(
      "SELECT role_id FROM roles WHERE role_name = 'TEACHER' LIMIT 1"
    );
    if (!roleRows || roleRows.length === 0) {
      throw new Error("Role 'TEACHER' not found in roles table");
    }
    const teacherRoleId = roleRows[0].role_id;

    // 2. Insert into users table
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
      teacherRoleId,
      userData.username.trim(),
      userData.email.trim().toLowerCase(),
      userData.password_hash,
      userData.first_name.trim(),
      userData.last_name.trim(),
      userData.phone ? userData.phone.trim() : null
    ]);

    const newUserId = userResult.insertId;

    // 3. Insert into teachers table
    const teacherSql = `
      INSERT INTO teachers (
        user_id,
        employee_number,
        department_id,
        designation,
        joining_date
      ) VALUES (?, ?, ?, ?, ?)
    `;
    const [teacherResult] = await connection.query(teacherSql, [
      newUserId,
      teacherData.employee_number.trim(),
      teacherData.department_id,
      teacherData.designation.trim(),
      teacherData.joining_date
    ]);

    await connection.commit();
    return teacherResult.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Update user and teacher details in an atomic MySQL transaction
 * @param {number} teacherId
 * @param {number} userId
 * @param {Object} userFields
 * @param {Object} teacherFields
 * @returns {Promise<boolean>}
 */
const updateTeacherWithUser = async (teacherId, userId, userFields = {}, teacherFields = {}) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Update user fields if any provided
    const userKeys = Object.keys(userFields);
    if (userKeys.length > 0) {
      const allowedUserFields = ['username', 'email', 'first_name', 'last_name', 'phone', 'password_hash'];
      const validUserUpdates = userKeys.filter(k => allowedUserFields.includes(k));
      if (validUserUpdates.length > 0) {
        const setClause = validUserUpdates.map(k => `${k} = ?`).join(', ');
        const values = validUserUpdates.map(k => userFields[k]);
        values.push(userId);
        await connection.query(`UPDATE users SET ${setClause} WHERE user_id = ?`, values);
      }
    }

    // 2. Update teacher fields if any provided
    const teacherKeys = Object.keys(teacherFields);
    if (teacherKeys.length > 0) {
      const allowedTeacherFields = ['employee_number', 'department_id', 'designation', 'joining_date'];
      const validTeacherUpdates = teacherKeys.filter(k => allowedTeacherFields.includes(k));
      if (validTeacherUpdates.length > 0) {
        const setClause = validTeacherUpdates.map(k => `${k} = ?`).join(', ');
        const values = validTeacherUpdates.map(k => teacherFields[k]);
        values.push(teacherId);
        await connection.query(`UPDATE teachers SET ${setClause} WHERE teacher_id = ?`, values);
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
 * Update teacher active status via linked user record
 * @param {number} teacherId
 * @param {boolean} isActive
 * @returns {Promise<boolean>}
 */
const updateTeacherStatus = async (teacherId, isActive) => {
  const sql = `
    UPDATE users u
    INNER JOIN teachers t ON u.user_id = t.user_id
    SET u.is_active = ?
    WHERE t.teacher_id = ?
  `;
  const [result] = await pool.query(sql, [isActive ? 1 : 0, teacherId]);
  return result.affectedRows > 0;
};

/**
 * Check foreign-key dependencies before deletion
 * Verifies references in: assignments, attendance, grades, study_materials, timetable, notices, queries
 * @param {number} teacherId
 * @param {number} userId
 * @returns {Promise<Object>} { hasDependencies, details }
 */
const checkTeacherDependencies = async (teacherId, userId) => {
  const [assignments] = await pool.query('SELECT COUNT(*) as count FROM assignments WHERE teacher_id = ?', [teacherId]);
  const [attendance] = await pool.query('SELECT COUNT(*) as count FROM attendance WHERE teacher_id = ?', [teacherId]);
  const [grades] = await pool.query('SELECT COUNT(*) as count FROM grades WHERE teacher_id = ?', [teacherId]);
  const [studyMaterials] = await pool.query('SELECT COUNT(*) as count FROM study_materials WHERE teacher_id = ?', [teacherId]);
  const [timetable] = await pool.query('SELECT COUNT(*) as count FROM timetable WHERE teacher_id = ?', [teacherId]);

  let noticeCount = 0;
  let queryCount = 0;
  if (userId) {
    const [notices] = await pool.query('SELECT COUNT(*) as count FROM notices WHERE created_by = ?', [userId]);
    noticeCount = notices[0].count;

    const [queries] = await pool.query(
      'SELECT COUNT(*) as count FROM queries WHERE assigned_to_user_id = ? OR asked_by_user_id = ?',
      [userId, userId]
    );
    queryCount = queries[0].count;
  }

  const details = {
    assignments: assignments[0].count,
    attendance: attendance[0].count,
    grades: grades[0].count,
    study_materials: studyMaterials[0].count,
    timetable: timetable[0].count,
    notices: noticeCount,
    queries: queryCount
  };

  const totalDependencies = Object.values(details).reduce((sum, val) => sum + val, 0);

  return {
    hasDependencies: totalDependencies > 0,
    details
  };
};

/**
 * Atomically delete teacher and linked user records
 * Only called after dependency check confirms zero related records
 * @param {number} teacherId
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
const deleteTeacherWithUser = async (teacherId, userId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Delete teacher profile first
    await connection.query('DELETE FROM teachers WHERE teacher_id = ?', [teacherId]);

    // Delete user account
    if (userId) {
      await connection.query('DELETE FROM users WHERE user_id = ?', [userId]);
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

module.exports = {
  getTeachers,
  findById,
  findByUserId,
  findByEmployeeNumber,
  createTeacherWithUser,
  updateTeacherWithUser,
  updateTeacherStatus,
  checkTeacherDependencies,
  deleteTeacherWithUser
};
