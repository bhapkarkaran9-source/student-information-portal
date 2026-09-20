const pool = require('../config/db');

/**
 * Find user by username including password_hash and role
 * (Strictly for internal authentication verification during login)
 * @param {string} username
 * @returns {Promise<Object|null>}
 */
const findByUsernameWithPassword = async (username) => {
  const sql = `
    SELECT 
      u.user_id,
      u.role_id,
      u.username,
      u.email,
      u.password_hash,
      u.first_name,
      u.last_name,
      u.phone,
      u.profile_photo_url,
      u.is_active,
      u.must_change_password,
      r.role_name AS role
    FROM users u
    INNER JOIN roles r ON u.role_id = r.role_id
    WHERE u.username = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [username]);
  return rows[0] || null;
};

/**
 * Find sanitized user profile by user_id (Never returns password_hash)
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
const findById = async (userId) => {
  const sql = `
    SELECT 
      u.user_id,
      u.role_id,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      u.phone,
      u.profile_photo_url,
      u.is_active,
      u.must_change_password,
      u.created_at,
      u.updated_at,
      r.role_name AS role
    FROM users u
    INNER JOIN roles r ON u.role_id = r.role_id
    WHERE u.user_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [userId]);
  return rows[0] || null;
};

/**
 * Find sanitized user profile by username (Never returns password_hash)
 * @param {string} username
 * @returns {Promise<Object|null>}
 */
const findByUsername = async (username) => {
  const sql = `
    SELECT 
      u.user_id,
      u.role_id,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      u.phone,
      u.profile_photo_url,
      u.is_active,
      u.created_at,
      u.updated_at,
      r.role_name AS role
    FROM users u
    INNER JOIN roles r ON u.role_id = r.role_id
    WHERE u.username = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [username]);
  return rows[0] || null;
};

/**
 * Find user by email (Safe lookup)
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
const findByEmail = async (email) => {
  const sql = `
    SELECT 
      u.user_id,
      u.role_id,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      u.phone,
      u.profile_photo_url,
      u.is_active,
      u.created_at,
      u.updated_at,
      r.role_name AS role
    FROM users u
    INNER JOIN roles r ON u.role_id = r.role_id
    WHERE u.email = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [email]);
  return rows[0] || null;
};

/**
 * Get paginated, searchable, filterable list of users (Never returns password_hash)
 * @param {Object} options
 * @param {number} [options.page=1]
 * @param {number} [options.limit=10]
 * @param {string} [options.search='']
 * @param {string} [options.role='']
 * @param {string|number|boolean} [options.status='']
 * @returns {Promise<{ users: Array, total: number }>}
 */
const getUsers = async ({ page = 1, limit = 10, search = '', role = '', status = '' }) => {
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
  const take = Math.max(1, parseInt(limit, 10));

  const whereConditions = [];
  const queryParams = [];

  // Search by username, email, first_name, or last_name
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push('(u.username LIKE ? OR u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)');
    queryParams.push(term, term, term, term);
  }

  // Filter by role name (ADMIN, TEACHER, STUDENT)
  if (role && role.trim()) {
    whereConditions.push('r.role_name = ?');
    queryParams.push(role.trim().toUpperCase());
  }

  // Filter by status (active: 1 / inactive: 0)
  if (status !== '' && status !== undefined && status !== null) {
    const isActive = (status === '1' || status === 'true' || status === 1 || status === true) ? 1 : 0;
    whereConditions.push('u.is_active = ?');
    queryParams.push(isActive);
  }

  const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Total matching count
  const countSql = `
    SELECT COUNT(*) as total
    FROM users u
    INNER JOIN roles r ON u.role_id = r.role_id
    ${whereSql}
  `;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = countRows[0] ? countRows[0].total : 0;

  // 2. Fetch paginated users (safe fields only)
  const dataSql = `
    SELECT 
      u.user_id,
      u.role_id,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      u.phone,
      u.profile_photo_url,
      u.is_active,
      u.created_at,
      u.updated_at,
      r.role_name AS role
    FROM users u
    INNER JOIN roles r ON u.role_id = r.role_id
    ${whereSql}
    ORDER BY u.user_id ASC
    LIMIT ? OFFSET ?
  `;
  const [users] = await pool.query(dataSql, [...queryParams, take, offset]);

  return { users, total };
};

/**
 * Create a new user
 * @param {Object} userData
 * @returns {Promise<number>} Inserted user_id
 */
const createUser = async ({ role_id, username, email, password_hash, first_name, last_name, phone = null, is_active = true }) => {
  const sql = `
    INSERT INTO users (
      role_id,
      username,
      email,
      password_hash,
      first_name,
      last_name,
      phone,
      is_active,
      must_change_password
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const [result] = await pool.query(sql, [
    role_id,
    username.trim(),
    email.trim().toLowerCase(),
    password_hash,
    first_name.trim(),
    last_name.trim(),
    phone ? phone.trim() : null,
    is_active ? 1 : 0,
    must_change_password !== undefined ? (must_change_password ? 1 : 0) : 1
  ]);
  return result.insertId;
};

/**
 * Update an existing user's safe fields
 * @param {number} userId
 * @param {Object} fields
 * @returns {Promise<boolean>}
 */
const updateUser = async (userId, fields = {}) => {
  const allowedFields = ['role_id', 'username', 'email', 'first_name', 'last_name', 'phone', 'is_active', 'password_hash', 'must_change_password'];
  const updates = [];
  const params = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowedFields.includes(key) && value !== undefined) {
      updates.push(`${key} = ?`);
      if (key === 'username') params.push(value.trim());
      else if (key === 'email') params.push(value.trim().toLowerCase());
      else if (key === 'first_name' || key === 'last_name') params.push(value.trim());
      else if (key === 'phone') params.push(value ? value.trim() : null);
      else if (key === 'is_active') params.push(value ? 1 : 0);
      else params.push(value);
    }
  }

  if (updates.length === 0) return false;

  const sql = `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`;
  params.push(userId);

  const [result] = await pool.query(sql, params);
  return result.affectedRows > 0;
};

/**
 * Update user active status
 * @param {number} userId
 * @param {boolean} isActive
 * @returns {Promise<boolean>}
 */
const updateUserStatus = async (userId, isActive) => {
  const sql = `UPDATE users SET is_active = ? WHERE user_id = ?`;
  const [result] = await pool.query(sql, [isActive ? 1 : 0, userId]);
  return result.affectedRows > 0;
};

/**
 * Check foreign key references before deleting a user
 * @param {number} userId
 * @returns {Promise<{ hasDependencies: boolean, details: Object }>}
 */
const checkUserDependencies = async (userId) => {
  // Check references in students, teachers, notices, queries, reports
  const [students] = await pool.query('SELECT COUNT(*) as count FROM students WHERE user_id = ?', [userId]);
  const [teachers] = await pool.query('SELECT COUNT(*) as count FROM teachers WHERE user_id = ?', [userId]);
  const [notices] = await pool.query('SELECT COUNT(*) as count FROM notices WHERE created_by = ?', [userId]);
  const [queries] = await pool.query('SELECT COUNT(*) as count FROM queries WHERE asked_by_user_id = ? OR assigned_to_user_id = ?', [userId, userId]);
  const [reports] = await pool.query('SELECT COUNT(*) as count FROM reports WHERE generated_by_user_id = ?', [userId]);

  const studentCount = students[0]?.count || 0;
  const teacherCount = teachers[0]?.count || 0;
  const noticeCount = notices[0]?.count || 0;
  const queryCount = queries[0]?.count || 0;
  const reportCount = reports[0]?.count || 0;

  const total = studentCount + teacherCount + noticeCount + queryCount + reportCount;

  return {
    hasDependencies: total > 0,
    details: {
      studentCount,
      teacherCount,
      noticeCount,
      queryCount,
      reportCount
    }
  };
};

/**
 * Safely delete a user record
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
const deleteUser = async (userId) => {
  const sql = 'DELETE FROM users WHERE user_id = ?';
  const [result] = await pool.query(sql, [userId]);
  return result.affectedRows > 0;
};

/**
 * Get all available roles
 * @returns {Promise<Array>}
 */
const getAllRoles = async () => {
  const sql = 'SELECT role_id, role_name, description FROM roles ORDER BY role_id ASC';
  const [rows] = await pool.query(sql);
  return rows;
};

/**
 * Find role by role_id
 * @param {number} roleId
 * @returns {Promise<Object|null>}
 */
const findRoleById = async (roleId) => {
  const sql = 'SELECT role_id, role_name, description FROM roles WHERE role_id = ? LIMIT 1';
  const [rows] = await pool.query(sql, [roleId]);
  return rows[0] || null;
};

/**
 * Update user's profile photo URL and timestamp
 * @param {number} userId
 * @param {string|null} photoUrl
 * @returns {Promise<Object|null>} Updated sanitized user object
 */
const updateProfilePhoto = async (userId, photoUrl) => {
  const sql = `
    UPDATE users 
    SET profile_photo_url = ?, updated_at = NOW() 
    WHERE user_id = ?
  `;
  await pool.query(sql, [photoUrl, userId]);
  return findById(userId);
};

module.exports = {
  findByUsernameWithPassword,
  findById,
  findByUsername,
  findByEmail,
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  checkUserDependencies,
  deleteUser,
  getAllRoles,
  findRoleById,
  updateProfilePhoto
};
