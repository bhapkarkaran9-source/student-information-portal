const pool = require('../config/db');

/**
 * Study Material Data Model
 * Table: study_materials
 * Database: student_portal_db
 */

const ALLOWED_MATERIAL_TYPES = [
  'Notes',
  'Syllabus',
  'Question Paper',
  'Presentation',
  'Reference Link',
  'Other'
];

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
 * @returns {Promise<{ exists: boolean, isActive: boolean, teacherName: string|null }>}
 */
const checkTeacherActive = async (teacherId) => {
  const tid = parseInt(teacherId, 10);
  if (isNaN(tid) || tid <= 0) return { exists: false, isActive: false, teacherName: null };

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
  if (!rows[0]) return { exists: false, isActive: false, teacherName: null };

  return {
    exists: true,
    isActive: Boolean(rows[0].is_active),
    teacherName: rows[0].teacher_name
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
 * Format raw SQL study material row
 */
const formatMaterialRow = (r) => {
  if (!r) return null;
  return {
    material_id: r.material_id,
    course_id: r.course_id,
    teacher_id: r.teacher_id,
    title: r.title,
    material_type: r.material_type,
    file_path: r.file_path,
    original_filename: r.original_filename || null,
    description: r.description || null,
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
    teacher_user_id: r.teacher_user_id || null
  };
};

/**
 * Get paginated list of study materials with multi-criteria filtering and role-based search
 */
const getStudyMaterials = async ({
  page = 1,
  limit = 10,
  search = '',
  course_id = '',
  teacher_id = '',
  student_id = '',
  material_type = '',
  semester = '',
  academic_year = ''
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
      sm.title LIKE ? OR 
      sm.description LIKE ? OR 
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
      whereConditions.push('sm.course_id = ?');
      queryParams.push(cid);
    }
  }

  // Teacher filter (Teacher Study Material Ownership)
  if (teacher_id) {
    const tid = parseInt(teacher_id, 10);
    if (!isNaN(tid) && tid > 0) {
      whereConditions.push('sm.teacher_id = ?');
      queryParams.push(tid);
    }
  }

  // Material type filter
  if (material_type && material_type.trim()) {
    const matchedType = ALLOWED_MATERIAL_TYPES.find(
      (t) => t.toLowerCase() === material_type.trim().toLowerCase()
    );
    if (matchedType) {
      whereConditions.push('sm.material_type = ?');
      queryParams.push(matchedType);
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

  // Student Visibility Filter: only courses where student is actively enrolled
  let studentJoinSql = '';
  const hasStudentContext = Boolean(student_id && parseInt(student_id, 10) > 0);
  const safeStudentId = hasStudentContext ? parseInt(student_id, 10) : null;

  if (hasStudentContext) {
    studentJoinSql = `
      INNER JOIN enrollments e_stu ON sm.course_id = e_stu.course_id AND e_stu.student_id = ? AND e_stu.status = 'Enrolled'
    `;
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  const countParams = hasStudentContext ? [safeStudentId, ...queryParams] : [...queryParams];

  // Count total records
  const countSql = `
    SELECT COUNT(DISTINCT sm.material_id) AS total
    FROM study_materials sm
    INNER JOIN courses c ON sm.course_id = c.course_id
    INNER JOIN teachers t ON sm.teacher_id = t.teacher_id
    INNER JOIN users u_t ON t.user_id = u_t.user_id
    ${studentJoinSql}
    ${whereClause}
  `;
  const [countRows] = await pool.query(countSql, countParams);
  const total = parseInt(countRows[0]?.total, 10) || 0;
  const totalPages = Math.ceil(total / limitNum) || 1;

  const dataParams = hasStudentContext
    ? [safeStudentId, ...queryParams, limitNum, offset]
    : [...queryParams, limitNum, offset];

  // Fetch paginated records
  const dataSql = `
    SELECT 
      sm.material_id,
      sm.course_id,
      sm.teacher_id,
      sm.title,
      sm.material_type,
      sm.file_path,
      sm.original_filename,
      sm.description,
      sm.created_at,
      sm.updated_at,
      c.course_code,
      c.course_name,
      c.semester,
      c.academic_year,
      d.department_name,
      t.employee_number,
      t.designation,
      u_t.user_id AS teacher_user_id,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS teacher_name
    FROM study_materials sm
    INNER JOIN courses c ON sm.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers t ON sm.teacher_id = t.teacher_id
    INNER JOIN users u_t ON t.user_id = u_t.user_id
    ${studentJoinSql}
    ${whereClause}
    ORDER BY sm.material_id DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(dataSql, dataParams);

  return {
    materials: rows.map(formatMaterialRow),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    }
  };
};

/**
 * Get single study material by ID
 */
const getStudyMaterialById = async (id) => {
  const mid = parseInt(id, 10);
  if (isNaN(mid) || mid <= 0) return null;

  const sql = `
    SELECT 
      sm.material_id,
      sm.course_id,
      sm.teacher_id,
      sm.title,
      sm.material_type,
      sm.file_path,
      sm.original_filename,
      sm.description,
      sm.created_at,
      sm.updated_at,
      c.course_code,
      c.course_name,
      c.semester,
      c.academic_year,
      d.department_name,
      t.employee_number,
      t.designation,
      u_t.user_id AS teacher_user_id,
      TRIM(CONCAT(u_t.first_name, ' ', u_t.last_name)) AS teacher_name
    FROM study_materials sm
    INNER JOIN courses c ON sm.course_id = c.course_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    INNER JOIN teachers t ON sm.teacher_id = t.teacher_id
    INNER JOIN users u_t ON t.user_id = u_t.user_id
    WHERE sm.material_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [mid]);
  if (!rows[0]) return null;
  return formatMaterialRow(rows[0]);
};

/**
 * Get summary KPI statistics for study materials
 */
const getStudyMaterialStats = async (teacherId = null) => {
  let where = '';
  const params = [];
  if (teacherId) {
    where = 'WHERE teacher_id = ?';
    params.push(parseInt(teacherId, 10));
  }

  const sql = `
    SELECT 
      COUNT(*) AS total_materials,
      COUNT(DISTINCT course_id) AS covered_courses,
      COUNT(DISTINCT teacher_id) AS contributing_teachers,
      SUM(CASE WHEN material_type = 'Notes' THEN 1 ELSE 0 END) AS notes_count,
      SUM(CASE WHEN material_type = 'Syllabus' THEN 1 ELSE 0 END) AS syllabus_count,
      SUM(CASE WHEN material_type = 'Question Paper' THEN 1 ELSE 0 END) AS question_paper_count,
      SUM(CASE WHEN material_type = 'Presentation' THEN 1 ELSE 0 END) AS presentation_count,
      SUM(CASE WHEN material_type = 'Reference Link' THEN 1 ELSE 0 END) AS reference_link_count,
      SUM(CASE WHEN material_type = 'Other' THEN 1 ELSE 0 END) AS other_count
    FROM study_materials
    ${where}
  `;
  const [rows] = await pool.query(sql, params);
  const r = rows[0] || {};
  return {
    total_materials: parseInt(r.total_materials, 10) || 0,
    covered_courses: parseInt(r.covered_courses, 10) || 0,
    contributing_teachers: parseInt(r.contributing_teachers, 10) || 0,
    by_type: {
      Notes: parseInt(r.notes_count, 10) || 0,
      Syllabus: parseInt(r.syllabus_count, 10) || 0,
      'Question Paper': parseInt(r.question_paper_count, 10) || 0,
      Presentation: parseInt(r.presentation_count, 10) || 0,
      'Reference Link': parseInt(r.reference_link_count, 10) || 0,
      Other: parseInt(r.other_count, 10) || 0
    }
  };
};

/**
 * Create a new study material
 */
const createStudyMaterial = async ({
  course_id,
  teacher_id,
  title,
  material_type = 'Notes',
  file_path,
  original_filename = null,
  description = null
}) => {
  const sql = `
    INSERT INTO study_materials (course_id, teacher_id, title, material_type, file_path, original_filename, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    parseInt(course_id, 10),
    parseInt(teacher_id, 10),
    title.trim(),
    material_type,
    file_path.trim(),
    original_filename ? original_filename.trim() : null,
    description && description.trim() ? description.trim() : null
  ];
  const [result] = await pool.query(sql, params);
  return getStudyMaterialById(result.insertId);
};

/**
 * Update an existing study material
 */
const updateStudyMaterial = async (id, updateData) => {
  const mid = parseInt(id, 10);
  if (isNaN(mid) || mid <= 0) return null;

  const allowedFields = ['course_id', 'teacher_id', 'title', 'material_type', 'file_path', 'original_filename', 'description'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      if (field === 'course_id' || field === 'teacher_id') {
        params.push(parseInt(updateData[field], 10));
      } else if (field === 'title' || field === 'material_type' || field === 'file_path' || field === 'original_filename' || field === 'description') {
        params.push(updateData[field] && String(updateData[field]).trim() ? String(updateData[field]).trim() : null);
      } else {
        params.push(updateData[field]);
      }
    }
  }

  if (setClauses.length === 0) return getStudyMaterialById(mid);

  params.push(mid);
  const sql = `UPDATE study_materials SET ${setClauses.join(', ')} WHERE material_id = ?`;
  await pool.query(sql, params);
  return getStudyMaterialById(mid);
};

/**
 * Safely delete a study material and return file path for disk cleanup
 */
const deleteStudyMaterial = async (id) => {
  const mid = parseInt(id, 10);
  if (isNaN(mid) || mid <= 0) return { success: false, filePath: null };

  const existing = await getStudyMaterialById(mid);
  if (!existing) return { success: false, filePath: null };

  const [result] = await pool.query('DELETE FROM study_materials WHERE material_id = ?', [mid]);
  return {
    success: result.affectedRows > 0,
    filePath: existing.file_path
  };
};

module.exports = {
  ALLOWED_MATERIAL_TYPES,
  checkCourseExists,
  checkTeacherActive,
  checkTeacherCourseAssignment,
  checkStudentEnrollment,
  getStudyMaterials,
  getStudyMaterialById,
  getStudyMaterialStats,
  createStudyMaterial,
  updateStudyMaterial,
  deleteStudyMaterial
};
