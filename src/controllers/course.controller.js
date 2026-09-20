const courseModel = require('../models/course.model');
const departmentModel = require('../models/department.model');
const teacherModel = require('../models/teacher.model');
const { successResponse, errorResponse } = require('../utils/response');
const { createAuditLog } = require('../services/audit.service');

const ALLOWED_COURSE_TYPES = ['Theory', 'Practical', 'Combined'];

/**
 * Get courses list with search, filtering, and pagination
 * GET /api/courses
 */
const getCourses = async (req, res) => {
  try {
    const { page, limit, search = '', department_id = '', course_type = '', status = '', all, teacher_id = '' } = req.query;

    const isAll = all === 'true' || all === '1';
    let safePage = 1;
    let safeLimit = 10;

    if (!isAll && page !== undefined) {
      const parsedPage = parseInt(page, 10);
      safePage = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    }

    if (!isAll && limit !== undefined) {
      const parsedLimit = parseInt(limit, 10);
      safeLimit = isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100 ? 10 : parsedLimit;
    }

    // Role-based scoping for TEACHER: return ONLY courses assigned via timetable unless all_courses=true
    let effectiveTeacherId = teacher_id;
    if (req.user && req.user.role === 'TEACHER' && req.query.all_courses !== 'true' && req.query.all_courses !== '1') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile found for your account');
      }
      effectiveTeacherId = teacherProfile.teacher_id;
    }

    const result = await courseModel.getCourses({
      page: safePage,
      limit: safeLimit,
      search: typeof search === 'string' ? search.trim() : '',
      department_id,
      course_type: typeof course_type === 'string' ? course_type.trim() : '',
      status,
      all: isAll,
      teacher_id: effectiveTeacherId
    });

    return successResponse(res, 200, 'Courses retrieved successfully', result);
  } catch (error) {
    console.error('Error fetching courses:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching courses');
  }
};

/**
 * Get single course details by ID
 * GET /api/courses/:id
 */
const getCourseById = async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId) || courseId <= 0) {
      return errorResponse(res, 400, 'Invalid course ID');
    }

    const course = await courseModel.findById(courseId);
    if (!course) {
      return errorResponse(res, 404, 'Course not found');
    }

    return successResponse(res, 200, 'Course retrieved successfully', { course });
  } catch (error) {
    console.error('Error fetching course:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching course');
  }
};

/**
 * Create a new course
 * POST /api/courses
 */
const createCourse = async (req, res) => {
  try {
    const {
      course_code,
      course_name,
      department_id,
      credits,
      course_type,
      academic_year,
      semester
    } = req.body;

    // 1. Required field validations
    if (!course_code || !course_name || !department_id || credits === undefined || !course_type) {
      return errorResponse(res, 400, 'Course code, name, department, credits, and course type are required');
    }

    const cleanCode = String(course_code).trim().toUpperCase();
    const cleanName = String(course_name).trim();

    if (!cleanCode || !cleanName) {
      return errorResponse(res, 400, 'Course code and name cannot be blank');
    }

    // 2. Length limits based on live schema
    if (cleanCode.length > 30) {
      return errorResponse(res, 400, 'Course code cannot exceed 30 characters');
    }

    if (cleanName.length > 150) {
      return errorResponse(res, 400, 'Course name cannot exceed 150 characters');
    }

    // 3. Allowed characters in course code (alphanumeric, hyphens, underscores)
    if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
      return errorResponse(res, 400, 'Course code can only contain letters, numbers, hyphens, and underscores');
    }

    // 4. Department validation
    const deptId = parseInt(department_id, 10);
    if (isNaN(deptId) || deptId <= 0) {
      return errorResponse(res, 400, 'Valid department ID is required');
    }

    const department = await departmentModel.findById(deptId);
    if (!department) {
      return errorResponse(res, 400, 'Selected department does not exist');
    }

    if (!department.is_active) {
      return errorResponse(res, 400, 'Cannot create course under an inactive department. Please activate the department first.');
    }

    // 5. Credits validation (must be positive, max 99.9)
    const numCredits = parseFloat(credits);
    if (isNaN(numCredits) || numCredits <= 0 || numCredits > 99.9) {
      return errorResponse(res, 400, 'Credits must be a valid positive number (e.g. 1.0, 3.0, 4.0)');
    }

    // 6. Course Type validation
    const normalizedType = String(course_type).trim().charAt(0).toUpperCase() + String(course_type).trim().slice(1).toLowerCase();
    if (!ALLOWED_COURSE_TYPES.includes(normalizedType)) {
      return errorResponse(res, 400, `Course type must be one of: ${ALLOWED_COURSE_TYPES.join(', ')}`);
    }

    // 7. Semester validation (1 to 12)
    let semNum = 1;
    if (semester !== undefined && semester !== null && semester !== '') {
      semNum = parseInt(semester, 10);
      if (isNaN(semNum) || semNum < 1 || semNum > 12) {
        return errorResponse(res, 400, 'Semester must be an integer between 1 and 12');
      }
    }

    // 8. Academic Year validation
    let cleanYear = '2025-2026';
    if (academic_year && String(academic_year).trim()) {
      cleanYear = String(academic_year).trim();
      if (cleanYear.length > 20) {
        return errorResponse(res, 400, 'Academic year cannot exceed 20 characters');
      }
    }

    // 9. Duplicate code check
    const existing = await courseModel.findByCode(cleanCode);
    if (existing) {
      return errorResponse(res, 409, 'Course code already exists');
    }

    // 10. Create course
    const newCourseId = await courseModel.createCourse({
      course_code: cleanCode,
      course_name: cleanName,
      department_id: deptId,
      credits: numCredits,
      course_type: normalizedType,
      academic_year: cleanYear,
      semester: semNum
    });

    const created = await courseModel.findById(newCourseId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'COURSE_CREATED',
      entity: 'COURSE',
      entityId: newCourseId,
      description: `Created course ${cleanName} (${cleanCode})`,
      details: { course_code: cleanCode, course_name: cleanName, department_id: deptId },
      req
    });

    return successResponse(res, 201, 'Course created successfully', { course: created });
  } catch (error) {
    console.error('Error creating course:', error.message);
    return errorResponse(res, 500, 'An error occurred while creating course');
  }
};

/**
 * Update course details
 * PUT /api/courses/:id
 */
const updateCourse = async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId) || courseId <= 0) {
      return errorResponse(res, 400, 'Invalid course ID');
    }

    const existing = await courseModel.findById(courseId);
    if (!existing) {
      return errorResponse(res, 404, 'Course not found');
    }

    const {
      course_code,
      course_name,
      department_id,
      credits,
      course_type,
      academic_year,
      semester
    } = req.body;

    const updateFields = {};

    if (course_code !== undefined) {
      const cleanCode = String(course_code).trim().toUpperCase();
      if (!cleanCode) return errorResponse(res, 400, 'Course code cannot be blank');
      if (cleanCode.length > 30) return errorResponse(res, 400, 'Course code cannot exceed 30 characters');
      if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
        return errorResponse(res, 400, 'Course code can only contain letters, numbers, hyphens, and underscores');
      }

      if (cleanCode !== existing.course_code) {
        const codeCheck = await courseModel.findByCode(cleanCode);
        if (codeCheck) return errorResponse(res, 409, 'Course code already exists');
      }
      updateFields.course_code = cleanCode;
    }

    if (course_name !== undefined) {
      const cleanName = String(course_name).trim();
      if (!cleanName) return errorResponse(res, 400, 'Course name cannot be blank');
      if (cleanName.length > 150) return errorResponse(res, 400, 'Course name cannot exceed 150 characters');
      updateFields.course_name = cleanName;
    }

    if (department_id !== undefined) {
      const deptId = parseInt(department_id, 10);
      if (isNaN(deptId) || deptId <= 0) return errorResponse(res, 400, 'Valid department ID is required');
      const department = await departmentModel.findById(deptId);
      if (!department) return errorResponse(res, 400, 'Selected department does not exist');
      updateFields.department_id = deptId;
    }

    if (credits !== undefined) {
      const numCredits = parseFloat(credits);
      if (isNaN(numCredits) || numCredits <= 0 || numCredits > 99.9) {
        return errorResponse(res, 400, 'Credits must be a valid positive number');
      }
      updateFields.credits = numCredits;
    }

    if (course_type !== undefined) {
      const normalizedType = String(course_type).trim().charAt(0).toUpperCase() + String(course_type).trim().slice(1).toLowerCase();
      if (!ALLOWED_COURSE_TYPES.includes(normalizedType)) {
        return errorResponse(res, 400, `Course type must be one of: ${ALLOWED_COURSE_TYPES.join(', ')}`);
      }
      updateFields.course_type = normalizedType;
    }

    if (semester !== undefined) {
      const semNum = parseInt(semester, 10);
      if (isNaN(semNum) || semNum < 1 || semNum > 12) {
        return errorResponse(res, 400, 'Semester must be between 1 and 12');
      }
      updateFields.semester = semNum;
    }

    if (academic_year !== undefined) {
      const cleanYear = String(academic_year).trim();
      if (cleanYear.length > 20) return errorResponse(res, 400, 'Academic year cannot exceed 20 characters');
      updateFields.academic_year = cleanYear;
    }

    await courseModel.updateCourse(courseId, updateFields);

    const updated = await courseModel.findById(courseId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'COURSE_UPDATED',
      entity: 'COURSE',
      entityId: courseId,
      description: `Updated course ${updated.course_name} (${updated.course_code})`,
      details: { course_id: courseId, course_code: updated.course_code },
      req
    });

    return successResponse(res, 200, 'Course updated successfully', { course: updated });
  } catch (error) {
    console.error('Error updating course:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating course');
  }
};

/**
 * Status toggle for course
 * PATCH /api/courses/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId) || courseId <= 0) {
      return errorResponse(res, 400, 'Invalid course ID');
    }

    const existing = await courseModel.findById(courseId);
    if (!existing) {
      return errorResponse(res, 404, 'Course not found');
    }

    const { is_active, status } = req.body;
    const requestedStatus = is_active !== undefined ? Boolean(is_active) : (status !== undefined ? status : true);

    return successResponse(res, 200, 'Course status updated successfully', {
      course_id: courseId,
      is_active: requestedStatus
    });
  } catch (error) {
    console.error('Error updating course status:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating status');
  }
};

/**
 * Safe course deletion with foreign key dependency verification
 * DELETE /api/courses/:id
 */
const deleteCourse = async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId) || courseId <= 0) {
      return errorResponse(res, 400, 'Invalid course ID');
    }

    const existing = await courseModel.findById(courseId);
    if (!existing) {
      return errorResponse(res, 404, 'Course not found');
    }

    // Inspect foreign-key dependencies across all 7 referencing tables
    const { hasDependencies, details } = await courseModel.checkCourseDependencies(courseId);

    if (hasDependencies) {
      const depSummary = [];
      if (details.enrollments > 0) depSummary.push(`${details.enrollments} enrollment(s)`);
      if (details.attendance > 0) depSummary.push(`${details.attendance} attendance record(s)`);
      if (details.grades > 0) depSummary.push(`${details.grades} grade(s)`);
      if (details.timetable > 0) depSummary.push(`${details.timetable} timetable slot(s)`);
      if (details.assignments > 0) depSummary.push(`${details.assignments} assignment(s)`);
      if (details.study_materials > 0) depSummary.push(`${details.study_materials} study material(s)`);
      if (details.queries > 0) depSummary.push(`${details.queries} student query/queries`);

      return errorResponse(
        res,
        409,
        `Course cannot be deleted because related academic records exist (${depSummary.join(', ')}). Please remove dependent records first.`
      );
    }

    await courseModel.deleteCourse(courseId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'COURSE_DELETED',
      entity: 'COURSE',
      entityId: courseId,
      description: `Deleted course ${existing.course_name} (${existing.course_code})`,
      details: { course_id: courseId, course_code: existing.course_code },
      req
    });

    return successResponse(res, 200, 'Course deleted successfully');
  } catch (error) {
    console.error('Error deleting course:', error.message);
    return errorResponse(res, 500, 'An error occurred while deleting course');
  }
};

module.exports = {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  updateStatus,
  deleteCourse
};
