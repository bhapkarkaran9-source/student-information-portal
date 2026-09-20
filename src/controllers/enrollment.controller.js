const enrollmentModel = require('../models/enrollment.model');
const studentModel = require('../models/student.model');
const courseModel = require('../models/course.model');
const { successResponse, errorResponse } = require('../utils/response');
const { createAuditLog } = require('../services/audit.service');

const ALLOWED_STATUSES = ['Enrolled', 'Dropped', 'Completed'];

/**
 * Get enrollments list with search, filtering, and pagination
 * GET /api/enrollments
 */
const getEnrollments = async (req, res) => {
  try {
    const {
      page,
      limit,
      search = '',
      student_id = '',
      course_id = '',
      department_id = '',
      academic_year = '',
      semester = '',
      status = '',
      all
    } = req.query;

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

    let effectiveStudentId = student_id;
    if (req.user && req.user.role === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(req.user.user_id);
      if (!studentProfile) {
        return successResponse(res, 200, 'Enrollments retrieved successfully', {
          enrollments: [],
          total: 0,
          page: safePage,
          limit: safeLimit,
          totalPages: 0
        });
      }
      effectiveStudentId = studentProfile.student_id;
    }

    const result = await enrollmentModel.getEnrollments({
      page: safePage,
      limit: safeLimit,
      search: typeof search === 'string' ? search.trim() : '',
      student_id: effectiveStudentId,
      course_id,
      department_id,
      academic_year: typeof academic_year === 'string' ? academic_year.trim() : '',
      semester,
      status: typeof status === 'string' ? status.trim() : '',
      all: isAll
    });

    return successResponse(res, 200, 'Enrollments retrieved successfully', result);
  } catch (error) {
    console.error('Error fetching enrollments:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching enrollments');
  }
};

/**
 * Get single enrollment details by ID
 * GET /api/enrollments/:id
 */
const getEnrollmentById = async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.id, 10);
    if (isNaN(enrollmentId) || enrollmentId <= 0) {
      return errorResponse(res, 400, 'Invalid enrollment ID');
    }

    const enrollment = await enrollmentModel.findById(enrollmentId);
    if (!enrollment) {
      return errorResponse(res, 404, 'Enrollment not found');
    }

    return successResponse(res, 200, 'Enrollment retrieved successfully', { enrollment });
  } catch (error) {
    console.error('Error fetching enrollment:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching enrollment');
  }
};

/**
 * Create a new enrollment
 * POST /api/enrollments
 */
const createEnrollment = async (req, res) => {
  try {
    const {
      student_id,
      course_id,
      academic_year,
      semester,
      enrollment_date,
      status
    } = req.body;

    // 1. Validate required IDs
    if (!student_id || !course_id) {
      return errorResponse(res, 400, 'Student ID and Course ID are required');
    }

    const studentId = parseInt(student_id, 10);
    const courseId = parseInt(course_id, 10);

    if (isNaN(studentId) || studentId <= 0) {
      return errorResponse(res, 400, 'Invalid student ID');
    }

    if (isNaN(courseId) || courseId <= 0) {
      return errorResponse(res, 400, 'Invalid course ID');
    }

    // 2. Validate student exists and is active
    const student = await studentModel.findById(studentId);
    if (!student) {
      return errorResponse(res, 404, 'Student not found');
    }

    if (!student.is_active) {
      return errorResponse(res, 400, 'Cannot enroll an inactive student. Please activate the student user account first.');
    }

    // 3. Validate course exists
    const course = await courseModel.findById(courseId);
    if (!course) {
      return errorResponse(res, 404, 'Course not found');
    }

    // 4. Academic year handling (use provided or fallback to course's academic year)
    let cleanYear = course.academic_year || '2025-2026';
    if (academic_year && String(academic_year).trim()) {
      cleanYear = String(academic_year).trim();
      if (cleanYear.length > 20) {
        return errorResponse(res, 400, 'Academic year cannot exceed 20 characters');
      }
    }

    // 5. Semester handling (1 to 12)
    let semNum = course.semester || student.semester || 1;
    if (semester !== undefined && semester !== null && semester !== '') {
      semNum = parseInt(semester, 10);
      if (isNaN(semNum) || semNum < 1 || semNum > 12) {
        return errorResponse(res, 400, 'Semester must be an integer between 1 and 12');
      }
    }

    // 6. Status validation
    let cleanStatus = 'Enrolled';
    if (status && String(status).trim()) {
      const raw = String(status).trim();
      const normalized = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      if (!ALLOWED_STATUSES.includes(normalized)) {
        return errorResponse(res, 400, `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
      }
      cleanStatus = normalized;
    }

    // 7. Enrollment Date validation
    let safeDate = null;
    if (enrollment_date && String(enrollment_date).trim()) {
      const dateStr = String(enrollment_date).trim();
      if (isNaN(Date.parse(dateStr))) {
        return errorResponse(res, 400, 'Please provide a valid enrollment date (YYYY-MM-DD)');
      }
      safeDate = dateStr;
    }

    // 8. Prevent duplicate enrollment based on live unique constraint uk_enrollment_student_course_year
    const duplicate = await enrollmentModel.findDuplicate(studentId, courseId, cleanYear);
    if (duplicate) {
      return errorResponse(res, 409, `Student is already enrolled in course "${course.course_code}" for academic year ${cleanYear}`);
    }

    // 9. Create enrollment
    const newEnrollmentId = await enrollmentModel.createEnrollment({
      student_id: studentId,
      course_id: courseId,
      academic_year: cleanYear,
      semester: semNum,
      enrollment_date: safeDate,
      status: cleanStatus
    });

    const created = await enrollmentModel.findById(newEnrollmentId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'ENROLLMENT_CREATED',
      entity: 'ENROLLMENT',
      entityId: newEnrollmentId,
      description: `Enrolled student #${studentId} in course #${courseId} (${cleanYear})`,
      details: { student_id: studentId, course_id: courseId, academic_year: cleanYear, status: cleanStatus },
      req
    });

    return successResponse(res, 201, 'Student enrolled successfully', { enrollment: created });
  } catch (error) {
    console.error('Error creating enrollment:', error.message);
    return errorResponse(res, 500, 'An error occurred while creating enrollment');
  }
};

/**
 * Update enrollment details
 * PUT /api/enrollments/:id
 */
const updateEnrollment = async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.id, 10);
    if (isNaN(enrollmentId) || enrollmentId <= 0) {
      return errorResponse(res, 400, 'Invalid enrollment ID');
    }

    const existing = await enrollmentModel.findById(enrollmentId);
    if (!existing) {
      return errorResponse(res, 404, 'Enrollment not found');
    }

    const {
      student_id,
      course_id,
      academic_year,
      semester,
      enrollment_date,
      status
    } = req.body;

    const updateFields = {};

    let targetStudentId = existing.student_id;
    let targetCourseId = existing.course_id;
    let targetYear = existing.academic_year;

    if (student_id !== undefined) {
      const sId = parseInt(student_id, 10);
      if (isNaN(sId) || sId <= 0) return errorResponse(res, 400, 'Invalid student ID');
      const student = await studentModel.findById(sId);
      if (!student) return errorResponse(res, 404, 'Student not found');
      if (!student.is_active) {
        return errorResponse(res, 400, 'Cannot assign an inactive student. Please activate the student account first.');
      }
      updateFields.student_id = sId;
      targetStudentId = sId;
    }

    if (course_id !== undefined) {
      const cId = parseInt(course_id, 10);
      if (isNaN(cId) || cId <= 0) return errorResponse(res, 400, 'Invalid course ID');
      const course = await courseModel.findById(cId);
      if (!course) return errorResponse(res, 404, 'Course not found');
      updateFields.course_id = cId;
      targetCourseId = cId;
    }

    if (academic_year !== undefined) {
      const cleanYear = String(academic_year).trim();
      if (!cleanYear) return errorResponse(res, 400, 'Academic year cannot be empty');
      if (cleanYear.length > 20) return errorResponse(res, 400, 'Academic year cannot exceed 20 characters');
      updateFields.academic_year = cleanYear;
      targetYear = cleanYear;
    }

    if (semester !== undefined) {
      const semNum = parseInt(semester, 10);
      if (isNaN(semNum) || semNum < 1 || semNum > 12) {
        return errorResponse(res, 400, 'Semester must be between 1 and 12');
      }
      updateFields.semester = semNum;
    }

    if (enrollment_date !== undefined) {
      const dateStr = String(enrollment_date).trim();
      if (isNaN(Date.parse(dateStr))) {
        return errorResponse(res, 400, 'Please provide a valid enrollment date');
      }
      updateFields.enrollment_date = dateStr;
    }

    if (status !== undefined) {
      const raw = String(status).trim();
      const normalized = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      if (!ALLOWED_STATUSES.includes(normalized)) {
        return errorResponse(res, 400, `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
      }
      updateFields.status = normalized;
    }

    // Check for duplicate combination if student, course, or academic_year changed
    if (
      targetStudentId !== existing.student_id ||
      targetCourseId !== existing.course_id ||
      targetYear !== existing.academic_year
    ) {
      const duplicate = await enrollmentModel.findDuplicate(targetStudentId, targetCourseId, targetYear, enrollmentId);
      if (duplicate) {
        return errorResponse(res, 409, `Student is already enrolled in this course for academic year ${targetYear}`);
      }
    }

    await enrollmentModel.updateEnrollment(enrollmentId, updateFields);

    const updated = await enrollmentModel.findById(enrollmentId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'ENROLLMENT_UPDATED',
      entity: 'ENROLLMENT',
      entityId: enrollmentId,
      description: `Updated enrollment #${enrollmentId} (Student #${updated.student_id}, Course #${updated.course_id})`,
      details: { enrollment_id: enrollmentId, status: updated.status },
      req
    });

    return successResponse(res, 200, 'Enrollment updated successfully', { enrollment: updated });
  } catch (error) {
    console.error('Error updating enrollment:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating enrollment');
  }
};

/**
 * Quick status update for enrollment
 * PATCH /api/enrollments/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.id, 10);
    if (isNaN(enrollmentId) || enrollmentId <= 0) {
      return errorResponse(res, 400, 'Invalid enrollment ID');
    }

    const existing = await enrollmentModel.findById(enrollmentId);
    if (!existing) {
      return errorResponse(res, 404, 'Enrollment not found');
    }

    const { status } = req.body;
    if (!status || !String(status).trim()) {
      return errorResponse(res, 400, 'Status is required');
    }

    const raw = String(status).trim();
    const normalized = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();

    if (!ALLOWED_STATUSES.includes(normalized)) {
      return errorResponse(res, 400, `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    }

    await enrollmentModel.updateStatus(enrollmentId, normalized);

    const updated = await enrollmentModel.findById(enrollmentId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'ENROLLMENT_UPDATED',
      entity: 'ENROLLMENT',
      entityId: enrollmentId,
      description: `Updated enrollment #${enrollmentId} status to ${normalized}`,
      details: { enrollment_id: enrollmentId, status: normalized },
      req
    });

    return successResponse(res, 200, 'Enrollment status updated successfully', { enrollment: updated });
  } catch (error) {
    console.error('Error updating enrollment status:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating status');
  }
};

/**
 * Safe enrollment deletion with dependency verification
 * DELETE /api/enrollments/:id
 */
const deleteEnrollment = async (req, res) => {
  try {
    const enrollmentId = parseInt(req.params.id, 10);
    if (isNaN(enrollmentId) || enrollmentId <= 0) {
      return errorResponse(res, 400, 'Invalid enrollment ID');
    }

    const existing = await enrollmentModel.findById(enrollmentId);
    if (!existing) {
      return errorResponse(res, 404, 'Enrollment not found');
    }

    // Inspect dependencies (attendance, grades, foreign keys)
    const { hasDependencies, details } = await enrollmentModel.checkEnrollmentDependencies(enrollmentId);

    if (hasDependencies) {
      const depSummary = [];
      if (details.attendance > 0) depSummary.push(`${details.attendance} attendance record(s)`);
      if (details.grades > 0) depSummary.push(`${details.grades} grade record(s)`);
      if (details.foreignKeys > 0) depSummary.push(`${details.foreignKeys} related database record(s)`);

      return errorResponse(
        res,
        409,
        `Enrollment cannot be deleted because related academic records exist (${depSummary.join(', ')}). Update enrollment status to Dropped or Completed instead.`
      );
    }

    await enrollmentModel.deleteEnrollment(enrollmentId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'ENROLLMENT_DELETED',
      entity: 'ENROLLMENT',
      entityId: enrollmentId,
      description: `Deleted enrollment #${enrollmentId} (Student #${existing.student_id}, Course #${existing.course_id})`,
      details: { enrollment_id: enrollmentId, student_id: existing.student_id, course_id: existing.course_id },
      req
    });

    return successResponse(res, 200, 'Enrollment deleted successfully');
  } catch (error) {
    console.error('Error deleting enrollment:', error.message);
    return errorResponse(res, 500, 'An error occurred while deleting enrollment');
  }
};

module.exports = {
  getEnrollments,
  getEnrollmentById,
  createEnrollment,
  updateEnrollment,
  updateStatus,
  deleteEnrollment
};
