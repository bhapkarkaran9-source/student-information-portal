const bcrypt = require('bcryptjs');
const studentModel = require('../models/student.model');
const userModel = require('../models/user.model');
const departmentModel = require('../models/department.model');
const teacherModel = require('../models/teacher.model');
const attendanceModel = require('../models/attendance.model');
const { successResponse, errorResponse } = require('../utils/response');
const { createAuditLog } = require('../services/audit.service');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_GENDERS = ['Male', 'Female', 'Other'];

/**
 * Get paginated list of students with filters and search
 * GET /api/students
 */
const getStudents = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', department_id = '', semester = '', status = '' } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    let scopedTeacherId = '';
    if (req.user && req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile found for your account');
      }
      scopedTeacherId = teacherProfile.teacher_id;
    }

    const { students, total } = await studentModel.getStudents({
      page: parsedPage,
      limit: parsedLimit,
      search: typeof search === 'string' ? search : '',
      department_id,
      semester,
      status,
      teacher_id: scopedTeacherId
    });

    const totalPages = Math.ceil(total / parsedLimit) || 1;

    return successResponse(res, 200, 'Students retrieved successfully', {
      students,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching students:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching students');
  }
};

/**
 * Get single student profile by ID
 * GET /api/students/:id
 */
const getStudentById = async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId) || studentId <= 0) {
      return errorResponse(res, 400, 'Invalid student ID');
    }

    if (req.user && req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile found for your account');
      }
      const isAllowed = await attendanceModel.isStudentInTeacherCourses(teacherProfile.teacher_id, studentId);
      if (!isAllowed) {
        return errorResponse(res, 403, 'Access denied: You can only view profiles for students enrolled in your assigned courses');
      }
    }

    const student = await studentModel.findById(studentId);
    if (!student) {
      return errorResponse(res, 404, 'Student not found');
    }

    return successResponse(res, 200, 'Student profile retrieved successfully', { student });
  } catch (error) {
    console.error('Error fetching student profile:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching student profile');
  }
};

/**
 * Create a new student and associated user account in an atomic transaction
 * POST /api/students
 */
const createStudent = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      username,
      email,
      phone,
      password,
      prn_number,
      department_id,
      admission_date,
      date_of_birth,
      gender,
      class_name,
      division,
      semester
    } = req.body;

    // 1. Required field validations
    if (
      !first_name ||
      !last_name ||
      !username ||
      !email ||
      !password ||
      !prn_number ||
      department_id === undefined ||
      !admission_date ||
      !class_name ||
      !division ||
      semester === undefined
    ) {
      return errorResponse(res, 400, 'All required student and user fields must be filled');
    }

    const cleanUsername = String(username).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanFirstName = String(first_name).trim();
    const cleanLastName = String(last_name).trim();
    const cleanPrn = String(prn_number).trim();
    const cleanClass = String(class_name).trim();
    const cleanDivision = String(division).trim();
    const cleanPhone = phone ? String(phone).trim() : null;

    if (!cleanUsername || !cleanEmail || !cleanFirstName || !cleanLastName || !cleanPrn || !cleanClass || !cleanDivision) {
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

    // 4. Semester validation
    const parsedSemester = parseInt(semester, 10);
    if (isNaN(parsedSemester) || parsedSemester < 1 || parsedSemester > 12) {
      return errorResponse(res, 400, 'Semester must be an integer between 1 and 12');
    }

    // 5. Gender validation
    if (gender && !VALID_GENDERS.includes(gender)) {
      return errorResponse(res, 400, `Gender must be one of: ${VALID_GENDERS.join(', ')}`);
    }

    // 6. Department existence
    const parsedDeptId = parseInt(department_id, 10);
    if (isNaN(parsedDeptId)) {
      return errorResponse(res, 400, 'Invalid department ID');
    }
    const deptRecord = await departmentModel.findById(parsedDeptId);
    if (!deptRecord) {
      return errorResponse(res, 400, 'Selected department does not exist');
    }

    // 7. Uniqueness checks
    const existingUser = await userModel.findByUsername(cleanUsername);
    if (existingUser) {
      return errorResponse(res, 409, 'Username is already taken');
    }

    const existingEmail = await userModel.findByEmail(cleanEmail);
    if (existingEmail) {
      return errorResponse(res, 409, 'Email address is already in use');
    }

    const existingPrn = await studentModel.findByPrn(cleanPrn);
    if (existingPrn) {
      return errorResponse(res, 409, 'PRN number is already assigned to another student');
    }

    // 8. Hash password securely
    const password_hash = await bcrypt.hash(password, 10);

    // 9. Atomic transaction creation
    const newStudentId = await studentModel.createStudentWithUser(
      {
        username: cleanUsername,
        email: cleanEmail,
        password_hash,
        first_name: cleanFirstName,
        last_name: cleanLastName,
        phone: cleanPhone
      },
      {
        prn_number: cleanPrn,
        department_id: parsedDeptId,
        admission_date,
        date_of_birth: date_of_birth || null,
        gender: gender || null,
        class_name: cleanClass,
        division: cleanDivision,
        semester: parsedSemester
      }
    );

    const createdStudent = await studentModel.findById(newStudentId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'STUDENT_CREATED',
      entity: 'STUDENT',
      entityId: newStudentId,
      description: `Created student ${createdStudent.first_name} ${createdStudent.last_name} (PRN: ${createdStudent.prn_number})`,
      details: { prn_number: createdStudent.prn_number, department_id: createdStudent.department_id },
      req
    });

    return successResponse(res, 201, 'Student created successfully', { student: createdStudent });
  } catch (error) {
    console.error('Error creating student:', error.message);
    return errorResponse(res, 500, 'An error occurred while creating student');
  }
};

/**
 * Update student profile and user details in an atomic transaction
 * PUT /api/students/:id
 */
const updateStudent = async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId) || studentId <= 0) {
      return errorResponse(res, 400, 'Invalid student ID');
    }

    const existing = await studentModel.findById(studentId);
    if (!existing) {
      return errorResponse(res, 404, 'Student not found');
    }

    const {
      first_name,
      last_name,
      username,
      email,
      phone,
      password,
      prn_number,
      department_id,
      admission_date,
      date_of_birth,
      gender,
      class_name,
      division,
      semester
    } = req.body;

    const userFields = {};
    const studentFields = {};

    // User details
    if (first_name !== undefined) userFields.first_name = String(first_name).trim();
    if (last_name !== undefined) userFields.last_name = String(last_name).trim();
    if (phone !== undefined) userFields.phone = phone ? String(phone).trim() : null;

    if (username !== undefined) {
      const cleanUsername = String(username).trim();
      if (!cleanUsername) return errorResponse(res, 400, 'Username cannot be blank');
      if (cleanUsername !== existing.username) {
        const conflict = await userModel.findByUsername(cleanUsername);
        if (conflict && conflict.user_id !== existing.user_id) {
          return errorResponse(res, 409, 'Username is already taken');
        }
      }
      userFields.username = cleanUsername;
    }

    if (email !== undefined) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (!cleanEmail) return errorResponse(res, 400, 'Email cannot be blank');
      if (!EMAIL_REGEX.test(cleanEmail)) {
        return errorResponse(res, 400, 'Invalid email address format');
      }
      if (cleanEmail !== existing.email) {
        const conflict = await userModel.findByEmail(cleanEmail);
        if (conflict && conflict.user_id !== existing.user_id) {
          return errorResponse(res, 409, 'Email address is already in use');
        }
      }
      userFields.email = cleanEmail;
    }

    if (password !== undefined && password !== null && String(password).trim() !== '') {
      if (typeof password !== 'string' || password.length < 6) {
        return errorResponse(res, 400, 'New password must be at least 6 characters long');
      }
      userFields.password_hash = await bcrypt.hash(password, 10);
    }

    // Student details
    if (prn_number !== undefined) {
      const cleanPrn = String(prn_number).trim();
      if (!cleanPrn) return errorResponse(res, 400, 'PRN number cannot be blank');
      if (cleanPrn !== existing.prn_number) {
        const prnConflict = await studentModel.findByPrn(cleanPrn);
        if (prnConflict && prnConflict.student_id !== studentId) {
          return errorResponse(res, 409, 'PRN number is already assigned to another student');
        }
      }
      studentFields.prn_number = cleanPrn;
    }

    if (department_id !== undefined) {
      const parsedDeptId = parseInt(department_id, 10);
      if (isNaN(parsedDeptId)) return errorResponse(res, 400, 'Invalid department ID');
      const deptRecord = await departmentModel.findById(parsedDeptId);
      if (!deptRecord) return errorResponse(res, 400, 'Selected department does not exist');
      studentFields.department_id = parsedDeptId;
    }

    if (admission_date !== undefined) studentFields.admission_date = admission_date;
    if (date_of_birth !== undefined) studentFields.date_of_birth = date_of_birth || null;

    if (gender !== undefined) {
      if (gender && !VALID_GENDERS.includes(gender)) {
        return errorResponse(res, 400, `Gender must be one of: ${VALID_GENDERS.join(', ')}`);
      }
      studentFields.gender = gender || null;
    }

    if (class_name !== undefined) studentFields.class_name = String(class_name).trim();
    if (division !== undefined) studentFields.division = String(division).trim();

    if (semester !== undefined) {
      const parsedSem = parseInt(semester, 10);
      if (isNaN(parsedSem) || parsedSem < 1 || parsedSem > 12) {
        return errorResponse(res, 400, 'Semester must be between 1 and 12');
      }
      studentFields.semester = parsedSem;
    }

    await studentModel.updateStudentWithUser(studentId, existing.user_id, userFields, studentFields);

    const updated = await studentModel.findById(studentId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'STUDENT_UPDATED',
      entity: 'STUDENT',
      entityId: studentId,
      description: `Updated student ${updated.first_name} ${updated.last_name} (PRN: ${updated.prn_number})`,
      details: { student_id: studentId, prn_number: updated.prn_number },
      req
    });

    return successResponse(res, 200, 'Student updated successfully', { student: updated });
  } catch (error) {
    console.error('Error updating student:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating student');
  }
};

/**
 * Activate / Deactivate student account
 * PATCH /api/students/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId) || studentId <= 0) {
      return errorResponse(res, 400, 'Invalid student ID');
    }

    const existing = await studentModel.findById(studentId);
    if (!existing) {
      return errorResponse(res, 404, 'Student not found');
    }

    const { is_active } = req.body;
    if (is_active === undefined || is_active === null) {
      return errorResponse(res, 400, 'is_active field is required');
    }

    const activeBool = Boolean(is_active);
    await studentModel.updateStudentStatus(studentId, activeBool);

    await createAuditLog({
      userId: req.user.user_id,
      action: activeBool ? 'STUDENT_ACTIVATED' : 'STUDENT_DEACTIVATED',
      entity: 'STUDENT',
      entityId: studentId,
      description: `${activeBool ? 'Activated' : 'Deactivated'} student account ${existing.first_name} ${existing.last_name} (PRN: ${existing.prn_number})`,
      details: { student_id: studentId, is_active: activeBool },
      req
    });

    return successResponse(
      res,
      200,
      `Student account ${activeBool ? 'activated' : 'deactivated'} successfully`,
      { student_id: studentId, is_active: activeBool }
    );
  } catch (error) {
    console.error('Error updating student status:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating student status');
  }
};

/**
 * Safe student deletion with atomic user cleanup and dependency checking
 * DELETE /api/students/:id
 */
const deleteStudent = async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId) || studentId <= 0) {
      return errorResponse(res, 400, 'Invalid student ID');
    }

    const existing = await studentModel.findById(studentId);
    if (!existing) {
      return errorResponse(res, 404, 'Student not found');
    }

    // Check academic record dependencies
    const { hasDependencies, details } = await studentModel.checkStudentDependencies(studentId);
    if (hasDependencies) {
      return errorResponse(
        res,
        409,
        'Cannot delete student with associated academic records (enrollments, attendance, grades, or performance). Please deactivate the student account instead.'
      );
    }

    // Safe deletion in atomic transaction
    await studentModel.deleteStudentWithUser(studentId, existing.user_id);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'STUDENT_DELETED',
      entity: 'STUDENT',
      entityId: studentId,
      description: `Deleted student ${existing.first_name} ${existing.last_name} (PRN: ${existing.prn_number})`,
      details: { student_id: studentId, user_id: existing.user_id },
      req
    });

    return successResponse(res, 200, 'Student deleted successfully', { student_id: studentId });
  } catch (error) {
    console.error('Error deleting student:', error.message);
    return errorResponse(res, 500, 'An error occurred while deleting student');
  }
};

module.exports = {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  updateStatus,
  deleteStudent
};
