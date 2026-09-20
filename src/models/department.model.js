const pool = require('../config/db');

/**
 * Department Data Access Model
 * Database: student_portal_db
 * Table: departments
 */

/**
 * Get all active departments for dropdown selection (backwards compatibility)
 * @returns {Promise<Array>}
 */
const getActiveDepartments = async () => {
  const sql = `
    SELECT 
      department_id, 
      department_code, 
      department_name, 
      description, 
      is_active
    FROM departments
    WHERE is_active = 1
    ORDER BY department_name ASC
  `;
  const [rows] = await pool.query(sql);
  return rows;
};

/**
 * Get paginated list of departments with search, status filter, and dependency counts
 * @param {Object} options
 * @param {number} options.page
 * @param {number} options.limit
 * @param {string} options.search
 * @param {string|number} options.status
 * @param {boolean} options.all
 * @returns {Promise<Object>} { departments, pagination }
 */
const getDepartments = async ({ page = 1, limit = 10, search = '', status = '', all = false }) => {
  const whereConditions = [];
  const queryParams = [];

  // Search by code, name, description
  if (search && search.trim()) {
    const searchWildcard = `%${search.trim()}%`;
    whereConditions.push('(d.department_code LIKE ? OR d.department_name LIKE ? OR d.description LIKE ?)');
    queryParams.push(searchWildcard, searchWildcard, searchWildcard);
  }

  // Filter by status (1 or 0)
  if (status !== '' && status !== undefined && status !== null) {
    whereConditions.push('d.is_active = ?');
    queryParams.push(parseInt(status, 10));
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Total count for pagination
  const countSql = `SELECT COUNT(*) as total FROM departments d ${whereClause}`;
  const [countResult] = await pool.query(countSql, queryParams);
  const total = countResult[0].total;

  if (all) {
    // Return all matching without pagination limit (e.g. for complete lists)
    const dataSql = `
      SELECT 
        d.department_id,
        d.department_code,
        d.department_name,
        d.description,
        d.is_active,
        d.created_at,
        d.updated_at,
        (SELECT COUNT(*) FROM students s WHERE s.department_id = d.department_id) as student_count,
        (SELECT COUNT(*) FROM teachers t WHERE t.department_id = d.department_id) as teacher_count,
        (SELECT COUNT(*) FROM courses c WHERE c.department_id = d.department_id) as course_count
      FROM departments d
      ${whereClause}
      ORDER BY d.department_name ASC
    `;
    const [rows] = await pool.query(dataSql, queryParams);
    return {
      departments: rows,
      pagination: { total, page: 1, limit: total || 10, totalPages: 1 }
    };
  }

  const offset = (page - 1) * limit;
  const totalPages = Math.ceil(total / limit) || 1;

  // 2. Data query with dependency sub-counts
  const dataSql = `
    SELECT 
      d.department_id,
      d.department_code,
      d.department_name,
      d.description,
      d.is_active,
      d.created_at,
      d.updated_at,
      (SELECT COUNT(*) FROM students s WHERE s.department_id = d.department_id) as student_count,
      (SELECT COUNT(*) FROM teachers t WHERE t.department_id = d.department_id) as teacher_count,
      (SELECT COUNT(*) FROM courses c WHERE c.department_id = d.department_id) as course_count
    FROM departments d
    ${whereClause}
    ORDER BY d.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(dataSql, [...queryParams, limit, offset]);

  return {
    departments: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages
    }
  };
};

/**
 * Find department by ID with dependency counts
 * @param {number} departmentId
 * @returns {Promise<Object|null>}
 */
const findById = async (departmentId) => {
  const sql = `
    SELECT 
      d.department_id, 
      d.department_code, 
      d.department_name, 
      d.description,
      d.is_active,
      d.created_at,
      d.updated_at,
      (SELECT COUNT(*) FROM students s WHERE s.department_id = d.department_id) as student_count,
      (SELECT COUNT(*) FROM teachers t WHERE t.department_id = d.department_id) as teacher_count,
      (SELECT COUNT(*) FROM courses c WHERE c.department_id = d.department_id) as course_count
    FROM departments d 
    WHERE d.department_id = ? 
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [departmentId]);
  return rows[0] || null;
};

/**
 * Find department by department_code
 * @param {string} departmentCode
 * @returns {Promise<Object|null>}
 */
const findByCode = async (departmentCode) => {
  const sql = `
    SELECT 
      department_id, 
      department_code, 
      department_name, 
      is_active 
    FROM departments 
    WHERE department_code = ? 
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [departmentCode]);
  return rows[0] || null;
};

/**
 * Create a new department
 * @param {Object} departmentData
 * @param {string} departmentData.department_code
 * @param {string} departmentData.department_name
 * @param {string|null} departmentData.description
 * @param {boolean} departmentData.is_active
 * @returns {Promise<number>} Inserted department_id
 */
const createDepartment = async ({ department_code, department_name, description = null, is_active = true }) => {
  const sql = `
    INSERT INTO departments (
      department_code,
      department_name,
      description,
      is_active
    ) VALUES (?, ?, ?, ?)
  `;
  const [result] = await pool.query(sql, [
    department_code.trim().toUpperCase(),
    department_name.trim(),
    description ? description.trim() : null,
    is_active ? 1 : 0
  ]);
  return result.insertId;
};

/**
 * Update an existing department
 * @param {number} departmentId
 * @param {Object} updateFields
 * @returns {Promise<boolean>}
 */
const updateDepartment = async (departmentId, updateFields = {}) => {
  const allowed = ['department_code', 'department_name', 'description', 'is_active'];
  const keys = Object.keys(updateFields).filter(k => allowed.includes(k));
  if (keys.length === 0) return false;

  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => {
    if (k === 'department_code') return String(updateFields[k]).trim().toUpperCase();
    if (k === 'department_name') return String(updateFields[k]).trim();
    if (k === 'description') return updateFields[k] ? String(updateFields[k]).trim() : null;
    if (k === 'is_active') return updateFields[k] ? 1 : 0;
    return updateFields[k];
  });
  values.push(departmentId);

  const [result] = await pool.query(`UPDATE departments SET ${setClause} WHERE department_id = ?`, values);
  return result.affectedRows > 0;
};

/**
 * Update department active status
 * @param {number} departmentId
 * @param {boolean} isActive
 * @returns {Promise<boolean>}
 */
const updateDepartmentStatus = async (departmentId, isActive) => {
  const sql = 'UPDATE departments SET is_active = ? WHERE department_id = ?';
  const [result] = await pool.query(sql, [isActive ? 1 : 0, departmentId]);
  return result.affectedRows > 0;
};

/**
 * Check all foreign-key dependencies before deleting a department
 * Inspects: students, teachers, courses
 * @param {number} departmentId
 * @returns {Promise<Object>} { hasDependencies, details: { students, teachers, courses } }
 */
const checkDepartmentDependencies = async (departmentId) => {
  const [studentRows] = await pool.query('SELECT COUNT(*) as count FROM students WHERE department_id = ?', [departmentId]);
  const [teacherRows] = await pool.query('SELECT COUNT(*) as count FROM teachers WHERE department_id = ?', [departmentId]);
  const [courseRows] = await pool.query('SELECT COUNT(*) as count FROM courses WHERE department_id = ?', [departmentId]);

  const details = {
    students: studentRows[0].count,
    teachers: teacherRows[0].count,
    courses: courseRows[0].count
  };

  const totalDependencies = details.students + details.teachers + details.courses;

  return {
    hasDependencies: totalDependencies > 0,
    details
  };
};

/**
 * Delete a department record safely
 * Only called after dependency check confirms zero related records
 * @param {number} departmentId
 * @returns {Promise<boolean>}
 */
const deleteDepartment = async (departmentId) => {
  const [result] = await pool.query('DELETE FROM departments WHERE department_id = ?', [departmentId]);
  return result.affectedRows > 0;
};

module.exports = {
  getActiveDepartments,
  getDepartments,
  findById,
  findByCode,
  createDepartment,
  updateDepartment,
  updateDepartmentStatus,
  checkDepartmentDependencies,
  deleteDepartment
};
