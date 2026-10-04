const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const teacherModel = require('../models/teacher.model');
const userModel = require('../models/user.model');
const departmentModel = require('../models/department.model');
const { successResponse, errorResponse } = require('../utils/response');
const { createAuditLog } = require('../services/audit.service');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Get paginated list of teachers with search and filters
 * GET /api/teachers
 */
const getTeachers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', department_id = '', status = '' } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    const { teachers, total } = await teacherModel.getTeachers({
      page: parsedPage,
      limit: parsedLimit,
      search: typeof search === 'string' ? search : '',
      department_id,
      status
    });

    const totalPages = Math.ceil(total / parsedLimit) || 1;

    return successResponse(res, 200, 'Teachers retrieved successfully', {
      teachers,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching teachers:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching teachers');
  }
};

/**
 * Get single teacher details by ID
 * GET /api/teachers/:id
 */
const getTeacherById = async (req, res) => {
  try {
    const teacherId = parseInt(req.params.id, 10);
    if (isNaN(teacherId) || teacherId <= 0) {
      return errorResponse(res, 400, 'Invalid teacher ID');
    }

    const teacher = await teacherModel.findById(teacherId);
    if (!teacher) {
      return errorResponse(res, 404, 'Teacher not found');
    }

    return successResponse(res, 200, 'Teacher details retrieved successfully', { teacher });
  } catch (error) {
    console.error('Error fetching teacher details:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching teacher details');
  }
};

/**
 * Register a new teacher and create associated user account atomically
 * POST /api/teachers
 */
const createTeacher = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      username,
      email,
      phone,
      password,
      employee_number,
      department_id,
      designation,
      joining_date
    } = req.body;

    if (!username || !password) {
      return errorResponse(res, 400, 'Username and password are required');
    }

    const cleanUsername = String(username).trim();
    if (!cleanUsername) {
      return errorResponse(res, 400, 'Username cannot be blank');
    }

    if (typeof password !== 'string' || password.length < 6) {
      return errorResponse(res, 400, 'Password must be at least 6 characters long');
    }

    // Check username uniqueness
    const existingUser = await userModel.findByUsername(cleanUsername);
    if (existingUser) {
      return errorResponse(res, 409, 'Username is already taken');
    }

    // Find TEACHER role ID
    const [roles] = await pool.query("SELECT role_id FROM roles WHERE role_name = 'TEACHER'");
    if (roles.length === 0) {
      return errorResponse(res, 500, 'TEACHER role does not exist');
    }
    const teacherRoleId = roles[0].role_id;

    const isFullCreation = Boolean(first_name && last_name && email && employee_number && department_id && designation && joining_date);

    if (!isFullCreation) {
      // Simple Admin Teacher Creation (Username + Password only)
      const password_hash = await bcrypt.hash(password, 10);
      const newUserId = await userModel.createUser({
        role_id: teacherRoleId,
        username: cleanUsername,
        password_hash,
        email: null,
        first_name: null,
        last_name: null,
        phone: null,
        is_active: true,
        is_profile_complete: false
      });

      await createAuditLog({
        userId: req.user.user_id,
        action: 'TEACHER_ACCOUNT_CREATED',
        entity: 'users',
        entityId: newUserId,
        description: `Created teacher account shell for username: ${cleanUsername}`,
        details: { username: cleanUsername, is_profile_complete: false },
        req
      });

      return successResponse(res, 201, 'Teacher account created successfully', {
        user_id: newUserId,
        username: cleanUsername,
        role: 'TEACHER',
        is_profile_complete: false
      });
    }

    // Legacy / Full Creation Flow
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanFirstName = String(first_name).trim();
    const cleanLastName = String(last_name).trim();
    const cleanEmpNo = String(employee_number).trim();
    const cleanDesignation = String(designation).trim();
    const cleanPhone = phone ? String(phone).trim() : null;

    if (!cleanEmail || !cleanFirstName || !cleanLastName || !cleanEmpNo || !cleanDesignation) {
      return errorResponse(res, 400, 'Fields cannot be blank');
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return errorResponse(res, 400, 'Please provide a valid email address');
    }

    const parsedDeptId = parseInt(department_id, 10);
    if (isNaN(parsedDeptId)) {
      return errorResponse(res, 400, 'Invalid department ID');
    }
    const deptRecord = await departmentModel.findById(parsedDeptId);
    if (!deptRecord) {
      return errorResponse(res, 400, 'Selected department does not exist');
    }

    const parsedJoiningDate = new Date(joining_date);
    if (isNaN(parsedJoiningDate.getTime())) {
      return errorResponse(res, 400, 'Please provide a valid joining date');
    }

    const existingEmail = await userModel.findByEmail(cleanEmail);
    if (existingEmail) {
      return errorResponse(res, 409, 'Email address is already in use');
    }

    const existingEmpNo = await teacherModel.findByEmployeeNumber(cleanEmpNo);
    if (existingEmpNo) {
      return errorResponse(res, 409, 'Employee number is already assigned to another teacher');
    }

    const password_hash = await bcrypt.hash(password, 10);

    const newTeacherId = await teacherModel.createTeacherWithUser(
      {
        username: cleanUsername,
        email: cleanEmail,
        password_hash,
        first_name: cleanFirstName,
        last_name: cleanLastName,
        phone: cleanPhone,
        is_profile_complete: true
      },
      {
        employee_number: cleanEmpNo,
        department_id: parsedDeptId,
        designation: cleanDesignation,
        joining_date
      }
    );

    const created = await teacherModel.findById(newTeacherId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'TEACHER_CREATED',
      entity: 'TEACHER',
      entityId: newTeacherId,
      description: `Created teacher ${created.first_name} ${created.last_name} (Emp No: ${created.employee_number})`,
      details: { employee_number: created.employee_number, department_id: created.department_id },
      req
    });

    return successResponse(res, 201, 'Teacher registered successfully', { teacher: created });
  } catch (error) {
    console.error('Error creating teacher:', error.message);
    return errorResponse(res, 500, 'An error occurred while creating teacher');
  }
};

/**
 * Complete teacher profile upon first login
 * POST /api/teachers/complete-profile
 */
const completeTeacherProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const {
      first_name,
      last_name,
      email,
      phone,
      date_of_birth,
      gender,
      employee_number,
      department_id,
      designation,
      joining_date
    } = req.body;

    if (!first_name || !last_name || !email || !employee_number || department_id === undefined || !designation || !joining_date) {
      return errorResponse(res, 400, 'First name, last name, email, employee ID, department, designation, and joining date are required');
    }

    const cleanFirstName = String(first_name).trim();
    const cleanLastName = String(last_name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanEmpNo = String(employee_number).trim();
    const cleanDesignation = String(designation).trim();
    const cleanPhone = phone ? String(phone).trim() : null;

    if (!cleanFirstName || !cleanLastName || !cleanEmail || !cleanEmpNo || !cleanDesignation) {
      return errorResponse(res, 400, 'Fields cannot be blank');
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return errorResponse(res, 400, 'Please provide a valid email address');
    }

    const parsedDeptId = parseInt(department_id, 10);
    if (isNaN(parsedDeptId)) {
      return errorResponse(res, 400, 'Invalid department ID');
    }
    const deptRecord = await departmentModel.findById(parsedDeptId);
    if (!deptRecord) {
      return errorResponse(res, 400, 'Selected department does not exist');
    }

    // Check email uniqueness (excluding current user)
    const existingEmail = await userModel.findByEmail(cleanEmail);
    if (existingEmail && existingEmail.user_id !== userId) {
      return errorResponse(res, 409, 'Email address is already in use by another account');
    }

    // Check Employee Number uniqueness (excluding current teacher)
    const existingTeacher = await teacherModel.findByEmployeeNumber(cleanEmpNo);
    if (existingTeacher && existingTeacher.user_id !== userId) {
      return errorResponse(res, 409, 'Employee number is already assigned to another teacher');
    }

    // Update user record
    await userModel.updateUser(userId, {
      first_name: cleanFirstName,
      last_name: cleanLastName,
      email: cleanEmail,
      phone: cleanPhone,
      is_profile_complete: true
    });

    // Check if teacher record exists
    const teacherProfile = await teacherModel.findByUserId(userId);
    let teacherId;
    if (teacherProfile) {
      teacherId = teacherProfile.teacher_id;
      await teacherModel.updateTeacher(teacherId, {
        employee_number: cleanEmpNo,
        department_id: parsedDeptId,
        designation: cleanDesignation,
        joining_date
      });
    } else {
      const [insertRes] = await pool.query(
        `INSERT INTO teachers (user_id, employee_number, department_id, designation, joining_date)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, cleanEmpNo, parsedDeptId, cleanDesignation, joining_date]
      );
      teacherId = insertRes.insertId;
    }

    const updatedUser = await userModel.findById(userId);
    const updatedTeacher = await teacherModel.findById(teacherId);

    await createAuditLog({
      userId,
      action: 'TEACHER_PROFILE_COMPLETED',
      entity: 'TEACHER',
      entityId: teacherId,
      description: `Teacher ${cleanFirstName} ${cleanLastName} completed profile setup (Employee ID: ${cleanEmpNo})`,
      details: { employee_number: cleanEmpNo, department_id: parsedDeptId },
      req
    });

    return successResponse(res, 200, 'Profile completed successfully', {
      user: updatedUser,
      teacher: updatedTeacher
    });
  } catch (error) {
    console.error('Error completing teacher profile:', error.message);
    return errorResponse(res, 500, 'An error occurred while completing teacher profile');
  }
};

/**
 * Update teacher profile and linked user account
 * PUT /api/teachers/:id
 */
const updateTeacher = async (req, res) => {
  try {
    const teacherId = parseInt(req.params.id, 10);
    if (isNaN(teacherId) || teacherId <= 0) {
      return errorResponse(res, 400, 'Invalid teacher ID');
    }

    const existing = await teacherModel.findById(teacherId);
    if (!existing) {
      return errorResponse(res, 404, 'Teacher not found');
    }

    const {
      first_name,
      last_name,
      username,
      email,
      phone,
      password,
      employee_number,
      department_id,
      designation,
      joining_date
    } = req.body;

    const userFields = {};
    const teacherFields = {};

    // 1. User fields validation and assignment
    if (first_name !== undefined) {
      const cleanFirst = String(first_name).trim();
      if (!cleanFirst) return errorResponse(res, 400, 'First name cannot be empty');
      userFields.first_name = cleanFirst;
    }

    if (last_name !== undefined) {
      const cleanLast = String(last_name).trim();
      if (!cleanLast) return errorResponse(res, 400, 'Last name cannot be empty');
      userFields.last_name = cleanLast;
    }

    if (username !== undefined) {
      const cleanUsername = String(username).trim();
      if (!cleanUsername) return errorResponse(res, 400, 'Username cannot be empty');
      if (cleanUsername !== existing.username) {
        const usernameCheck = await userModel.findByUsername(cleanUsername);
        if (usernameCheck) return errorResponse(res, 409, 'Username is already taken');
      }
      userFields.username = cleanUsername;
    }

    if (email !== undefined) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (!EMAIL_REGEX.test(cleanEmail)) return errorResponse(res, 400, 'Please provide a valid email address');
      if (cleanEmail !== existing.email) {
        const emailCheck = await userModel.findByEmail(cleanEmail);
        if (emailCheck) return errorResponse(res, 409, 'Email address is already in use');
      }
      userFields.email = cleanEmail;
    }

    if (phone !== undefined) {
      userFields.phone = phone ? String(phone).trim() : null;
    }

    if (password !== undefined && password !== null && String(password).trim() !== '') {
      if (String(password).length < 6) {
        return errorResponse(res, 400, 'New password must be at least 6 characters long');
      }
      userFields.password_hash = await bcrypt.hash(String(password), 10);
    }

    // 2. Teacher fields validation and assignment
    if (employee_number !== undefined) {
      const cleanEmpNo = String(employee_number).trim();
      if (!cleanEmpNo) return errorResponse(res, 400, 'Employee number cannot be empty');
      if (cleanEmpNo !== existing.employee_number) {
        const empNoCheck = await teacherModel.findByEmployeeNumber(cleanEmpNo);
        if (empNoCheck) return errorResponse(res, 409, 'Employee number is already assigned to another teacher');
      }
      teacherFields.employee_number = cleanEmpNo;
    }

    if (department_id !== undefined) {
      const parsedDeptId = parseInt(department_id, 10);
      if (isNaN(parsedDeptId)) return errorResponse(res, 400, 'Invalid department ID');
      const deptRecord = await departmentModel.findById(parsedDeptId);
      if (!deptRecord) return errorResponse(res, 400, 'Selected department does not exist');
      teacherFields.department_id = parsedDeptId;
    }

    if (designation !== undefined) {
      const cleanDesig = String(designation).trim();
      if (!cleanDesig) return errorResponse(res, 400, 'Designation cannot be empty');
      teacherFields.designation = cleanDesig;
    }

    if (joining_date !== undefined) {
      const parsedDate = new Date(joining_date);
      if (isNaN(parsedDate.getTime())) return errorResponse(res, 400, 'Please provide a valid joining date');
      teacherFields.joining_date = joining_date;
    }

    await teacherModel.updateTeacherWithUser(teacherId, existing.user_id, userFields, teacherFields);

    const updated = await teacherModel.findById(teacherId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'TEACHER_UPDATED',
      entity: 'TEACHER',
      entityId: teacherId,
      description: `Updated teacher ${updated.first_name} ${updated.last_name} (Emp No: ${updated.employee_number})`,
      details: { teacher_id: teacherId, employee_number: updated.employee_number },
      req
    });

    return successResponse(res, 200, 'Teacher profile updated successfully', { teacher: updated });
  } catch (error) {
    console.error('Error updating teacher:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating teacher');
  }
};

/**
 * Activate / Deactivate teacher account
 * PATCH /api/teachers/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const teacherId = parseInt(req.params.id, 10);
    if (isNaN(teacherId) || teacherId <= 0) {
      return errorResponse(res, 400, 'Invalid teacher ID');
    }

    const existing = await teacherModel.findById(teacherId);
    if (!existing) {
      return errorResponse(res, 404, 'Teacher not found');
    }

    const { is_active } = req.body;
    if (is_active === undefined || is_active === null) {
      return errorResponse(res, 400, 'is_active field is required');
    }

    const activeBool = Boolean(is_active);
    await teacherModel.updateTeacherStatus(teacherId, activeBool);

    await createAuditLog({
      userId: req.user.user_id,
      action: activeBool ? 'TEACHER_ACTIVATED' : 'TEACHER_DEACTIVATED',
      entity: 'TEACHER',
      entityId: teacherId,
      description: `${activeBool ? 'Activated' : 'Deactivated'} teacher account ${existing.first_name} ${existing.last_name} (Emp No: ${existing.employee_number})`,
      details: { teacher_id: teacherId, is_active: activeBool },
      req
    });

    return successResponse(
      res,
      200,
      `Teacher account ${activeBool ? 'activated' : 'deactivated'} successfully`,
      { teacher_id: teacherId, is_active: activeBool }
    );
  } catch (error) {
    console.error('Error updating teacher status:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating status');
  }
};

/**
 * Safe teacher deletion with foreign key dependency verification
 * DELETE /api/teachers/:id
 */
const deleteTeacher = async (req, res) => {
  try {
    const teacherId = parseInt(req.params.id, 10);
    if (isNaN(teacherId) || teacherId <= 0) {
      return errorResponse(res, 400, 'Invalid teacher ID');
    }

    const existing = await teacherModel.findById(teacherId);
    if (!existing) {
      return errorResponse(res, 404, 'Teacher not found');
    }

    // Check foreign-key dependencies in academic tables
    const { hasDependencies } = await teacherModel.checkTeacherDependencies(teacherId, existing.user_id);

    if (hasDependencies) {
      return errorResponse(
        res,
        409,
        'Teacher cannot be deleted because related records exist. Deactivate the account instead.'
      );
    }

    await teacherModel.deleteTeacherWithUser(teacherId, existing.user_id);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'TEACHER_DELETED',
      entity: 'TEACHER',
      entityId: teacherId,
      description: `Deleted teacher ${existing.first_name} ${existing.last_name} (Emp No: ${existing.employee_number})`,
      details: { teacher_id: teacherId, user_id: existing.user_id },
      req
    });

    return successResponse(res, 200, 'Teacher deleted successfully');
  } catch (error) {
    console.error('Error deleting teacher:', error.message);
    return errorResponse(res, 500, 'An error occurred while deleting teacher');
  }
};

module.exports = {
  getTeachers,
  getTeacherById,
  createTeacher,
  completeTeacherProfile,
  updateTeacher,
  updateStatus,
  deleteTeacher
};
