const bcrypt = require('bcryptjs');
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

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const safePage = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
    const safeLimit = isNaN(limitNum) || limitNum < 1 || limitNum > 100 ? 10 : limitNum;

    const result = await teacherModel.getTeachers({
      page: safePage,
      limit: safeLimit,
      search: typeof search === 'string' ? search.trim() : '',
      department_id,
      status
    });

    return successResponse(res, 200, 'Teachers retrieved successfully', result);
  } catch (error) {
    console.error('Error fetching teachers:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching teachers');
  }
};

/**
 * Get single teacher profile by teacher ID
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

    return successResponse(res, 200, 'Teacher retrieved successfully', { teacher });
  } catch (error) {
    console.error('Error fetching teacher:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching teacher');
  }
};

/**
 * Register a new teacher and create linked user account
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

    // 1. Required field validations
    if (
      !first_name ||
      !last_name ||
      !username ||
      !email ||
      !password ||
      !employee_number ||
      department_id === undefined ||
      !designation ||
      !joining_date
    ) {
      return errorResponse(res, 400, 'All required teacher and user fields must be filled');
    }

    const cleanUsername = String(username).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanFirstName = String(first_name).trim();
    const cleanLastName = String(last_name).trim();
    const cleanEmpNo = String(employee_number).trim();
    const cleanDesignation = String(designation).trim();
    const cleanPhone = phone ? String(phone).trim() : null;

    if (!cleanUsername || !cleanEmail || !cleanFirstName || !cleanLastName || !cleanEmpNo || !cleanDesignation) {
      return errorResponse(res, 400, 'Fields cannot be blank');
    }

    // 2. Email format validation
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return errorResponse(res, 400, 'Please provide a valid email address');
    }

    // 3. Password length
    if (typeof password !== 'string' || password.length < 6) {
      return errorResponse(res, 400, 'Password must be at least 6 characters long');
    }

    // 4. Department existence validation
    const parsedDeptId = parseInt(department_id, 10);
    if (isNaN(parsedDeptId)) {
      return errorResponse(res, 400, 'Invalid department ID');
    }
    const deptRecord = await departmentModel.findById(parsedDeptId);
    if (!deptRecord) {
      return errorResponse(res, 400, 'Selected department does not exist');
    }

    // 5. Joining date validation
    const parsedJoiningDate = new Date(joining_date);
    if (isNaN(parsedJoiningDate.getTime())) {
      return errorResponse(res, 400, 'Please provide a valid joining date');
    }

    // 6. Uniqueness checks
    const existingUser = await userModel.findByUsername(cleanUsername);
    if (existingUser) {
      return errorResponse(res, 409, 'Username is already taken');
    }

    const existingEmail = await userModel.findByEmail(cleanEmail);
    if (existingEmail) {
      return errorResponse(res, 409, 'Email address is already in use');
    }

    const existingEmpNo = await teacherModel.findByEmployeeNumber(cleanEmpNo);
    if (existingEmpNo) {
      return errorResponse(res, 409, 'Employee number is already assigned to another teacher');
    }

    // 7. Hash password securely
    const password_hash = await bcrypt.hash(password, 10);

    // 8. Atomic transaction creation
    const newTeacherId = await teacherModel.createTeacherWithUser(
      {
        username: cleanUsername,
        email: cleanEmail,
        password_hash,
        first_name: cleanFirstName,
        last_name: cleanLastName,
        phone: cleanPhone
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
  updateTeacher,
  updateStatus,
  deleteTeacher
};
