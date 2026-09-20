const crypto = require('crypto');
const pool = require('../config/db');
const attendanceModel = require('../models/attendance.model');
const studentModel = require('../models/student.model');
const courseModel = require('../models/course.model');
const teacherModel = require('../models/teacher.model');
const timetableModel = require('../models/timetable.model');
const notificationModel = require('../models/notification.model');
const { successResponse, errorResponse } = require('../utils/response');
const { createAuditLog } = require('../services/audit.service');

/**
 * Evaluates a student's attendance percentage for a course after attendance recording/updating.
 * If attendance is below the 75% threshold, triggers an in-app LOW_ATTENDANCE notification
 * which asynchronously dispatches email delivery via notificationEmail.service.js.
 * Fully failure-isolated: errors never interrupt attendance recording.
 *
 * @param {number} studentId
 * @param {number} courseId
 * @param {object} [options={}]
 * @returns {Promise<object|null>}
 */
const checkAndNotifyLowAttendance = async (studentId, courseId, options = {}) => {
  try {
    const sId = parseInt(studentId, 10);
    const cId = parseInt(courseId, 10);
    if (!sId || !cId) return null;

    const statsSql = `
      SELECT 
        s.student_id,
        s.user_id,
        u.is_active,
        TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS student_name,
        u.email,
        c.course_id,
        c.course_code,
        c.course_name,
        COUNT(a.attendance_id) AS total_lectures,
        SUM(CASE WHEN a.status IN ('Present', 'Late') THEN 1 ELSE 0 END) AS attended_lectures,
        ROUND((SUM(CASE WHEN a.status IN ('Present', 'Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(a.attendance_id), 0)) * 100, 2) AS attendance_percentage
      FROM students s
      INNER JOIN users u ON s.user_id = u.user_id
      INNER JOIN courses c ON c.course_id = ?
      LEFT JOIN attendance a ON a.student_id = s.student_id AND a.course_id = c.course_id
      WHERE s.student_id = ?
      GROUP BY s.student_id, s.user_id, u.is_active, student_name, u.email, c.course_id, c.course_code, c.course_name
      LIMIT 1
    `;
    const [rows] = await pool.query(statsSql, [cId, sId]);
    if (!rows || !rows[0]) return null;

    const row = rows[0];
    if (!row.is_active || !row.user_id) return null;

    const totalLectures = parseInt(row.total_lectures, 10) || 0;
    if (totalLectures === 0) return null;

    const pct = row.attendance_percentage !== null && row.attendance_percentage !== undefined 
      ? parseFloat(row.attendance_percentage) 
      : 0.0;

    const threshold = attendanceModel.LOW_ATTENDANCE_THRESHOLD || 75.0;

    if (pct < threshold) {
      const courseDisplay = row.course_code 
        ? `${row.course_code} - ${row.course_name || ''}`.trim() 
        : (row.course_name || 'Course');

      const dateStr = options.date || new Date().toISOString().slice(0, 10);
      const eventId = options.eventId || `low_att_${sId}_${cId}_${dateStr}`;

      const notif = await notificationModel.createNotification({
        recipient_user_id: row.user_id,
        title: `Attendance Warning: Low Attendance in ${row.course_code || 'Course'}`,
        message: `Your attendance in course "${courseDisplay}" is ${pct.toFixed(1)}%, which is below the mandatory ${threshold}% threshold. Please attend upcoming lectures to maintain examination eligibility.`,
        notification_type: 'LOW_ATTENDANCE',
        metadata: {
          notificationType: 'LOW_ATTENDANCE',
          studentId: sId,
          courseId: cId,
          course: courseDisplay,
          courseName: row.course_name,
          attendancePercentage: `${pct.toFixed(1)}%`,
          threshold: `${threshold}%`,
          eventId: eventId
        },
        eventId: eventId
      });

      return notif;
    }

    return null;
  } catch (notifErr) {
    console.warn('[AttendanceController] Failed to dispatch low attendance notification:', notifErr.message);
    return null;
  }
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

/**
 * Validate and clean date string YYYY-MM-DD
 * @param {string} d
 * @returns {string|null}
 */
function cleanDate(d) {
  if (!d || typeof d !== 'string') return null;
  const trimmed = d.trim();
  if (!DATE_REGEX.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;
  return trimmed;
}

/**
 * Validate and clean time string to standard 24-hour HH:MM:SS format
 * Accepts HH:MM or HH:MM:SS
 * @param {string} t
 * @returns {string|null}
 */
function cleanTime(t) {
  if (!t || typeof t !== 'string') return null;
  const trimmed = t.trim();
  const match = TIME_REGEX.exec(trimmed);
  if (!match) return null;
  const hours = match[1];
  const minutes = match[2];
  const seconds = match[4] || '00';
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Get paginated, searchable, filterable attendance records
 * GET /api/attendance
 */
const getAttendance = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      student_id = '',
      course_id = '',
      teacher_id = '',
      date = '',
      start_date = '',
      end_date = '',
      status = '',
      semester = ''
    } = req.query;

    let scopedTeacherId = teacher_id;
    if (req.user && req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile found for your account');
      }
      scopedTeacherId = teacherProfile.teacher_id;
      if (course_id) {
        const isAssigned = await attendanceModel.checkTeacherCourseAssignment(teacherProfile.teacher_id, course_id);
        if (!isAssigned) {
          return errorResponse(res, 403, 'You are not authorized to access attendance for this course.');
        }
      }
    }

    const data = await attendanceModel.getAttendance({
      page,
      limit,
      search,
      student_id,
      course_id,
      teacher_id: scopedTeacherId,
      date,
      start_date,
      end_date,
      status,
      semester
    });

    return successResponse(res, 200, 'Attendance records retrieved successfully', data);
  } catch (error) {
    console.error('Error fetching attendance list:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching attendance records');
  }
};

/**
 * Get single attendance record by ID
 * GET /api/attendance/:id
 */
const getAttendanceById = async (req, res) => {
  try {
    const attendanceId = parseInt(req.params.id, 10);
    if (isNaN(attendanceId) || attendanceId <= 0) {
      return errorResponse(res, 400, 'Invalid attendance ID');
    }

    const attendance = await attendanceModel.findById(attendanceId);
    if (!attendance) {
      return errorResponse(res, 404, 'Attendance record not found');
    }

    return successResponse(res, 200, 'Attendance record retrieved successfully', { attendance });
  } catch (error) {
    console.error('Error fetching attendance record:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching attendance details');
  }
};

/**
 * Create a new attendance record
 * POST /api/attendance
 */
const createAttendance = async (req, res) => {
  try {
    const {
      student_id,
      course_id,
      teacher_id,
      attendance_date,
      date,
      status,
      remarks,
      lecture_type,
      session_name,
      session,
      start_time,
      end_time
    } = req.body;

    // 1. Required fields
    const rawDate = attendance_date || date;
    if (!student_id || !course_id || !rawDate || !status) {
      return errorResponse(res, 400, 'Student, course, attendance date, and status are required');
    }

    // 2. Validate date format (YYYY-MM-DD)
    const validDate = cleanDate(rawDate);
    if (!validDate) {
      return errorResponse(res, 400, 'Invalid attendance date format (expected YYYY-MM-DD)');
    }

    // 3. Validate status
    const cleanStatus = String(status).trim();
    const normalizedStatus = cleanStatus.charAt(0).toUpperCase() + cleanStatus.slice(1).toLowerCase();
    if (!attendanceModel.ALLOWED_STATUSES.includes(normalizedStatus)) {
      return errorResponse(res, 400, `Status must be one of: ${attendanceModel.ALLOWED_STATUSES.join(', ')}`);
    }

    // 4. Validate Student exists and is active
    const studentId = parseInt(student_id, 10);
    if (isNaN(studentId) || studentId <= 0) {
      return errorResponse(res, 400, 'Invalid student ID');
    }
    const student = await studentModel.findById(studentId);
    if (!student) {
      return errorResponse(res, 404, 'Student not found');
    }
    if (!student.is_active) {
      return errorResponse(res, 400, 'Cannot record attendance for an inactive student account');
    }

    // 5. Validate Course exists
    const courseId = parseInt(course_id, 10);
    if (isNaN(courseId) || courseId <= 0) {
      return errorResponse(res, 400, 'Invalid course ID');
    }
    const course = await courseModel.findById(courseId);
    if (!course) {
      return errorResponse(res, 404, 'Course not found');
    }

    // 6. Validate & Authorize Teacher (RBAC / IDOR)
    let resolvedTeacherId;
    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile associated with your account');
      }
      resolvedTeacherId = teacherProfile.teacher_id;

      // Check if teacher is assigned to this course
      const isAssigned = await attendanceModel.checkTeacherCourseAssignment(resolvedTeacherId, courseId);
      if (!isAssigned) {
        return errorResponse(res, 403, 'You are not authorized to access attendance for this course.');
      }
    } else {
      // ADMIN role
      const rawTeacherId = teacher_id || req.body.teacherId;
      if (!rawTeacherId) {
        return errorResponse(res, 400, 'Teacher ID is required');
      }
      const tid = parseInt(rawTeacherId, 10);
      if (isNaN(tid) || tid <= 0) {
        return errorResponse(res, 400, 'Invalid teacher ID');
      }
      const teacher = await teacherModel.findById(tid);
      if (!teacher) {
        return errorResponse(res, 404, 'Teacher not found');
      }
      if (!teacher.is_active) {
        return errorResponse(res, 400, 'Cannot record attendance for an inactive teacher account');
      }
      resolvedTeacherId = tid;
    }

    // 7. Verify student enrollment in the course
    const enrollment = await attendanceModel.checkStudentEnrollment(studentId, courseId);
    if (!enrollment || enrollment.status !== 'Enrolled') {
      return errorResponse(res, 400, 'Student is not actively enrolled in this course. Please verify enrollment before recording attendance.');
    }

    // If teacher: verify student is enrolled under teacher's course roster
    if (req.user.role === 'TEACHER') {
      const isInRoster = await attendanceModel.isStudentInTeacherCourses(resolvedTeacherId, studentId, courseId);
      if (!isInRoster) {
        return errorResponse(res, 403, 'Access denied: Student is not enrolled in your assigned instruction roster');
      }
    }

    // 8. Validate Lecture Type
    const cleanLectureType = lecture_type ? String(lecture_type).trim() : 'Regular Lecture';
    if (!attendanceModel.ALLOWED_LECTURE_TYPES.includes(cleanLectureType)) {
      return errorResponse(res, 400, `Lecture type must be one of: ${attendanceModel.ALLOWED_LECTURE_TYPES.join(', ')}`);
    }

    // 9. Validate Session and Times (Admin Timetable Time vs Custom Time)
    const selectedSession = String(session || session_name || 'Admin Timetable Time').trim();
    let resolvedSessionName;
    let resolvedStartTime;
    let resolvedEndTime;

    if (selectedSession === 'Admin Timetable Time' || selectedSession === 'Custom Time' || (start_time && end_time)) {
      if (!start_time || !end_time) {
        return errorResponse(res, 400, 'Both Start Time and End Time are required');
      }

      const cleanStart = cleanTime(start_time);
      const cleanEnd = cleanTime(end_time);
      if (!cleanStart || !cleanEnd) {
        return errorResponse(res, 400, 'Invalid time format. Please provide valid start and end times (e.g. 10:30)');
      }

      if (cleanStart >= cleanEnd) {
        return errorResponse(res, 400, 'Start time must be before end time and duration must be greater than zero');
      }

      resolvedSessionName = (selectedSession === 'Admin Timetable Time') ? 'Admin Timetable Time' : 'Custom Time';
      resolvedStartTime = cleanStart;
      resolvedEndTime = cleanEnd;
    } else {
      const period = attendanceModel.PREDEFINED_PERIODS[selectedSession] || attendanceModel.PREDEFINED_PERIODS['Lecture 1'];
      resolvedSessionName = selectedSession in attendanceModel.PREDEFINED_PERIODS ? selectedSession : 'Admin Timetable Time';
      resolvedStartTime = period.start_time;
      resolvedEndTime = period.end_time;
    }

    // 10. Prevent duplicate attendance on same date and time/session for student & course
    const duplicate = await attendanceModel.checkDuplicate(studentId, courseId, validDate, resolvedStartTime);
    if (duplicate) {
      const timeStr = attendanceModel.formatTimeTo12Hour(resolvedStartTime);
      return errorResponse(res, 409, `Attendance for this student in course ${course.course_code} on ${validDate} at ${timeStr || resolvedStartTime} already exists.`);
    }

    // 11. Insert attendance record
    const insertId = await attendanceModel.createAttendance({
      student_id: studentId,
      course_id: courseId,
      teacher_id: resolvedTeacherId,
      attendance_date: validDate,
      status: normalizedStatus,
      remarks: remarks || null,
      lecture_type: cleanLectureType,
      session_name: resolvedSessionName,
      start_time: resolvedStartTime,
      end_time: resolvedEndTime
    });

    const created = await attendanceModel.findById(insertId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'ATTENDANCE_CREATED',
      entity: 'ATTENDANCE',
      entityId: insertId,
      description: `Marked attendance for Student #${studentId} in Course #${courseId} on ${validDate} (${cleanLectureType}, ${resolvedStartTime}-${resolvedEndTime}): ${normalizedStatus}`,
      details: {
        attendance_id: insertId,
        student_id: studentId,
        course_id: courseId,
        date: validDate,
        status: normalizedStatus,
        lecture_type: cleanLectureType,
        session_name: resolvedSessionName,
        start_time: resolvedStartTime,
        end_time: resolvedEndTime
      },
      req
    });

    // Evaluate attendance and dispatch low-attendance warning if below threshold
    await checkAndNotifyLowAttendance(studentId, courseId, { date: validDate });

    return successResponse(res, 201, 'Attendance recorded successfully', { attendance: created });

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return errorResponse(res, 409, 'Attendance for this session already exists.');
    }
    console.error('Error creating attendance record:', error.message);
    return errorResponse(res, 500, 'An error occurred while creating attendance record');
  }
};

/**
 * Update an existing attendance record
 * PUT /api/attendance/:id
 */
const updateAttendance = async (req, res) => {
  try {
    const attendanceId = parseInt(req.params.id, 10);
    if (isNaN(attendanceId) || attendanceId <= 0) {
      return errorResponse(res, 400, 'Invalid attendance ID');
    }

    const existing = await attendanceModel.findById(attendanceId);
    if (!existing) {
      return errorResponse(res, 404, 'Attendance record not found');
    }

    const {
      student_id,
      course_id,
      teacher_id,
      attendance_date,
      date,
      status,
      remarks
    } = req.body;

    // Resolve date
    const rawDate = attendance_date || date || existing.attendance_date;
    const validDate = cleanDate(rawDate);
    if (!validDate) {
      return errorResponse(res, 400, 'Invalid attendance date format (expected YYYY-MM-DD)');
    }

    // Resolve status
    let normalizedStatus = existing.status;
    if (status !== undefined && status !== null) {
      const cleanStatus = String(status).trim();
      normalizedStatus = cleanStatus.charAt(0).toUpperCase() + cleanStatus.slice(1).toLowerCase();
      if (!attendanceModel.ALLOWED_STATUSES.includes(normalizedStatus)) {
        return errorResponse(res, 400, `Status must be one of: ${attendanceModel.ALLOWED_STATUSES.join(', ')}`);
      }
    }

    // Resolve student
    const studentId = student_id !== undefined ? parseInt(student_id, 10) : existing.student_id;
    if (isNaN(studentId) || studentId <= 0) {
      return errorResponse(res, 400, 'Invalid student ID');
    }
    const student = await studentModel.findById(studentId);
    if (!student) {
      return errorResponse(res, 404, 'Student not found');
    }
    if (!student.is_active) {
      return errorResponse(res, 400, 'Cannot assign an inactive student account');
    }

    // Resolve course
    const courseId = course_id !== undefined ? parseInt(course_id, 10) : existing.course_id;
    if (isNaN(courseId) || courseId <= 0) {
      return errorResponse(res, 400, 'Invalid course ID');
    }
    const course = await courseModel.findById(courseId);
    if (!course) {
      return errorResponse(res, 404, 'Course not found');
    }

    // Verify teacher assignment and ownership for TEACHER role
    if (req.user && req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile associated with your user account');
      }
      if (existing.teacher_id !== teacherProfile.teacher_id) {
        return errorResponse(res, 403, 'You are not authorized to access attendance for this course.');
      }
      const isAssigned = await attendanceModel.checkTeacherCourseAssignment(teacherProfile.teacher_id, courseId);
      if (!isAssigned) {
        return errorResponse(res, 403, 'You are not authorized to access attendance for this course.');
      }
    }

    // Resolve teacher
    const teacherId = teacher_id !== undefined ? parseInt(teacher_id, 10) : existing.teacher_id;
    if (isNaN(teacherId) || teacherId <= 0) {
      return errorResponse(res, 400, 'Invalid teacher ID');
    }
    const teacher = await teacherModel.findById(teacherId);
    if (!teacher) {
      return errorResponse(res, 404, 'Teacher not found');
    }
    if (!teacher.is_active) {
      return errorResponse(res, 400, 'Cannot assign an inactive teacher account');
    }

    // Verify enrollment
    const enrollment = await attendanceModel.checkStudentEnrollment(studentId, courseId);
    if (!enrollment || enrollment.status !== 'Enrolled') {
      return errorResponse(res, 400, 'Student is not actively enrolled in this course.');
    }

    // Prevent duplicate on update (excluding current attendanceId)
    const duplicate = await attendanceModel.checkDuplicate(studentId, courseId, validDate, attendanceId);
    if (duplicate) {
      return errorResponse(res, 409, `Attendance for this student in course ${course.course_code} on ${validDate} already exists.`);
    }

    // Perform update
    await attendanceModel.updateAttendance(attendanceId, {
      student_id: studentId,
      course_id: courseId,
      teacher_id: teacherId,
      attendance_date: validDate,
      status: normalizedStatus,
      remarks: remarks !== undefined ? remarks : existing.remarks
    });

    const updated = await attendanceModel.findById(attendanceId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'ATTENDANCE_UPDATED',
      entity: 'ATTENDANCE',
      entityId: attendanceId,
      description: `Updated attendance record #${attendanceId} to ${normalizedStatus} (${validDate})`,
      details: { attendance_id: attendanceId, student_id: studentId, course_id: courseId, status: normalizedStatus },
      req
    });

    // Evaluate attendance and dispatch low-attendance warning if below threshold
    await checkAndNotifyLowAttendance(studentId, courseId, { date: validDate });

    return successResponse(res, 200, 'Attendance updated successfully', { attendance: updated });

  } catch (error) {
    console.error('Error updating attendance record:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating attendance record');
  }
};

/**
 * Delete an attendance record
 * DELETE /api/attendance/:id
 */
const deleteAttendance = async (req, res) => {
  try {
    const attendanceId = parseInt(req.params.id, 10);
    if (isNaN(attendanceId) || attendanceId <= 0) {
      return errorResponse(res, 400, 'Invalid attendance ID');
    }

    const existing = await attendanceModel.findById(attendanceId);
    if (!existing) {
      return errorResponse(res, 404, 'Attendance record not found');
    }

    await attendanceModel.deleteAttendance(attendanceId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'ATTENDANCE_DELETED',
      entity: 'ATTENDANCE',
      entityId: attendanceId,
      description: `Deleted attendance record #${attendanceId} (Student #${existing.student_id}, Course #${existing.course_id}, ${existing.attendance_date})`,
      details: { attendance_id: attendanceId, student_id: existing.student_id, course_id: existing.course_id },
      req
    });

    return successResponse(res, 200, 'Attendance record deleted successfully');
  } catch (error) {
    console.error('Error deleting attendance record:', error.message);
    return errorResponse(res, 500, 'An error occurred while deleting attendance record');
  }
};

/**
 * Get attendance summary statistics and low attendance list
 * GET /api/attendance/summary
 */
const getAttendanceSummary = async (req, res) => {
  try {
    let teacherId = null;
    if (req.user && req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (teacherProfile) {
        teacherId = teacherProfile.teacher_id;
      }
    }

    const data = await attendanceModel.getAttendanceSummary(teacherId);
    return successResponse(res, 200, 'Attendance summary retrieved successfully', data);
  } catch (error) {
    console.error('Error fetching attendance summary:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching attendance summary');
  }
};

/**
 * Get comprehensive student-wise attendance details
 * GET /api/attendance/student/:studentId
 */
const getStudentAttendance = async (req, res) => {
  try {
    let studentId;
    const rawParam = String(req.params.studentId || '').trim();

    // 1. Enforce Role-Based Scoping & IDOR Prevention
    if (req.user.role === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(req.user.user_id);
      if (!studentProfile) {
        return errorResponse(res, 404, 'No student profile found for your account');
      }

      if (rawParam === 'me' || rawParam === 'my' || !rawParam) {
        studentId = studentProfile.student_id;
      } else {
        const parsed = parseInt(rawParam, 10);
        if (isNaN(parsed) || parsed !== studentProfile.student_id) {
          return errorResponse(res, 403, 'Access denied: You can only view your own attendance records');
        }
        studentId = studentProfile.student_id;
      }
    } else if (req.user.role === 'TEACHER') {
      const parsed = parseInt(rawParam, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return errorResponse(res, 400, 'Invalid student ID');
      }
      studentId = parsed;

      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile found for your account');
      }

      const isAllowed = await attendanceModel.isStudentInTeacherCourses(teacherProfile.teacher_id, studentId);
      if (!isAllowed) {
        return errorResponse(res, 403, 'Access denied: You can only view attendance for students enrolled in your assigned courses');
      }
    } else {
      // ADMIN
      const parsed = parseInt(rawParam, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return errorResponse(res, 400, 'Invalid student ID');
      }
      studentId = parsed;
    }

    const data = await attendanceModel.getStudentAttendance(studentId);
    if (!data) {
      return errorResponse(res, 404, 'Student not found');
    }

    return successResponse(res, 200, 'Student attendance details retrieved successfully', data);
  } catch (error) {
    console.error('Error fetching student attendance details:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching student attendance details');
  }
};

/**
 * Get current authenticated student's attendance details
 * GET /api/attendance/my-attendance
 */
const getMyAttendance = async (req, res) => {
  req.params.studentId = 'me';
  return getStudentAttendance(req, res);
};

/**
 * Get active faculty members in the authenticated student's department
 * GET /api/attendance/department-faculty
 * GET /api/attendance/faculty
 */
const getStudentDepartmentFaculty = async (req, res) => {
  try {
    const studentProfile = await studentModel.findByUserId(req.user.user_id);
    if (!studentProfile || !studentProfile.department_id) {
      return successResponse(res, 200, 'Department faculty retrieved successfully', { faculty: [] });
    }

    const facultySql = `
      SELECT 
        t.teacher_id,
        t.department_id,
        t.designation,
        TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS teacher_name,
        u.first_name,
        u.last_name,
        u.email
      FROM teachers t
      INNER JOIN users u ON t.user_id = u.user_id
      WHERE t.department_id = ? AND u.is_active = 1
      ORDER BY teacher_name ASC
    `;
    const [faculty] = await pool.query(facultySql, [studentProfile.department_id]);
    return successResponse(res, 200, 'Department faculty retrieved successfully', { faculty });
  } catch (error) {
    console.error('Error fetching department faculty:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching department faculty');
  }
};

/**
 * Get comprehensive course-wise attendance details
 * GET /api/attendance/course/:courseId
 */
const getCourseAttendance = async (req, res) => {
  try {
    const courseId = parseInt(req.params.courseId, 10);
    if (isNaN(courseId) || courseId <= 0) {
      return errorResponse(res, 400, 'Invalid course ID');
    }

    if (req.user && req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile associated with your account');
      }
      const isAssigned = await attendanceModel.checkTeacherCourseAssignment(teacherProfile.teacher_id, courseId);
      if (!isAssigned) {
        return errorResponse(res, 403, 'You are not authorized to access attendance for this course.');
      }
    }

    const data = await attendanceModel.getCourseAttendance(courseId);
    if (!data) {
      return errorResponse(res, 404, 'Course not found');
    }

    return successResponse(res, 200, 'Course attendance details retrieved successfully', data);
  } catch (error) {
    console.error('Error fetching course attendance details:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching course attendance details');
  }
};

/**
 * Get courses assigned to the current user (TEACHER) or all courses (ADMIN)
 * GET /api/attendance/courses
 */
const getAttendanceCourses = async (req, res) => {
  try {
    if (req.user && req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile associated with your account');
      }
      const courses = await courseModel.getTeacherAssignedCourses(teacherProfile.teacher_id);
      return successResponse(res, 200, 'Assigned courses retrieved successfully', {
        courses,
        total: courses.length
      });
    }

    // ADMIN role
    const result = await courseModel.getCourses({ all: true });
    return successResponse(res, 200, 'Courses retrieved successfully', result);
  } catch (error) {
    console.error('Error fetching attendance courses:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching courses');
  }
};

/**
 * Get paginated grouped attendance sessions
 * GET /api/attendance/sessions
 */
const getAttendanceSessions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      course_id = '',
      teacher_id = '',
      date = '',
      start_date = '',
      end_date = '',
      lecture_type = ''
    } = req.query;

    let scopedTeacherId = teacher_id;
    if (req.user && req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile found for your account');
      }
      scopedTeacherId = teacherProfile.teacher_id;
      if (course_id) {
        const isAssigned = await attendanceModel.checkTeacherCourseAssignment(teacherProfile.teacher_id, course_id);
        if (!isAssigned) {
          return errorResponse(res, 403, 'You are not authorized to access attendance for this course.');
        }
      }
    }

    const data = await attendanceModel.getAttendanceSessions({
      page,
      limit,
      search,
      teacher_id: scopedTeacherId,
      course_id,
      date,
      start_date,
      end_date,
      lecture_type
    });

    return successResponse(res, 200, 'Attendance sessions retrieved successfully', data);
  } catch (error) {
    console.error('Error fetching attendance sessions:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching attendance sessions');
  }
};

/**
 * Get single session details and full student roster
 * GET /api/attendance/sessions/:sessionId
 */
const getSessionDetails = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const decoded = attendanceModel.decodeSessionId(sessionId);
    if (!decoded) {
      return errorResponse(res, 400, 'Invalid session identifier');
    }

    let scopedTeacherId = null;
    if (req.user && req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile found for your account');
      }
      const isAssigned = await attendanceModel.checkTeacherCourseAssignment(teacherProfile.teacher_id, decoded.course_id);
      if (!isAssigned) {
        return errorResponse(res, 403, 'You are not authorized to access attendance for this course.');
      }
      scopedTeacherId = teacherProfile.teacher_id;
    }

    const data = await attendanceModel.getSessionDetails(decoded.course_id, decoded.attendance_date, decoded.start_time, scopedTeacherId);
    if (!data || !data.session) {
      return errorResponse(res, 404, 'Attendance session not found');
    }

    return successResponse(res, 200, 'Attendance session details retrieved successfully', data);
  } catch (error) {
    console.error('Error fetching session details:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching session details');
  }
};

/**
 * Update session attendance records and metadata
 * PUT /api/attendance/sessions/:sessionId
 */
const updateSessionAttendance = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const decoded = attendanceModel.decodeSessionId(sessionId);
    if (!decoded) {
      return errorResponse(res, 400, 'Invalid session identifier');
    }

    let scopedTeacherId = null;
    if (req.user && req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile found for your account');
      }
      const isAssigned = await attendanceModel.checkTeacherCourseAssignment(teacherProfile.teacher_id, decoded.course_id);
      if (!isAssigned) {
        return errorResponse(res, 403, 'You are not authorized to access attendance for this course.');
      }
      scopedTeacherId = teacherProfile.teacher_id;
    }

    const { lecture_type, session_name, start_time, end_time, records } = req.body;

    let cleanStart = null;
    let cleanEnd = null;
    if (start_time || end_time) {
      if (!start_time || !end_time) {
        return errorResponse(res, 400, 'Both start time and end time are required when modifying time');
      }
      cleanStart = cleanTime(start_time);
      cleanEnd = cleanTime(end_time);
      if (!cleanStart || !cleanEnd) {
        return errorResponse(res, 400, 'Invalid time format (expected HH:MM)');
      }
      if (cleanStart >= cleanEnd) {
        return errorResponse(res, 400, 'Start time must be before end time');
      }
    }

    if (lecture_type && !attendanceModel.ALLOWED_LECTURE_TYPES.includes(String(lecture_type).trim())) {
      return errorResponse(res, 400, `Lecture type must be one of: ${attendanceModel.ALLOWED_LECTURE_TYPES.join(', ')}`);
    }

    await attendanceModel.updateSessionAttendance(decoded.course_id, decoded.attendance_date, decoded.start_time, scopedTeacherId, {
      lecture_type: lecture_type ? String(lecture_type).trim() : undefined,
      session_name: session_name ? String(session_name).trim() : undefined,
      start_time: cleanStart || undefined,
      end_time: cleanEnd || undefined,
      records: Array.isArray(records) ? records : []
    });

    await createAuditLog({
      userId: req.user.user_id,
      action: 'ATTENDANCE_UPDATED',
      entity: 'ATTENDANCE',
      entityId: sessionId,
      description: `Updated attendance session for Course #${decoded.course_id} on ${decoded.attendance_date} (${cleanStart || decoded.start_time})`,
      details: {
        course_id: decoded.course_id,
        date: decoded.attendance_date,
        start_time: cleanStart || decoded.start_time,
        updated_records_count: Array.isArray(records) ? records.length : 0
      },
      req
    });

    const updated = await attendanceModel.getSessionDetails(decoded.course_id, decoded.attendance_date, cleanStart || decoded.start_time, scopedTeacherId);

    // Evaluate attendance for updated students and dispatch low-attendance warning if below threshold
    if (Array.isArray(records) && records.length > 0) {
      const uniqueStudentIds = [...new Set(records.map(r => parseInt(r.student_id, 10)).filter(id => !isNaN(id) && id > 0))];
      for (const sId of uniqueStudentIds) {
        await checkAndNotifyLowAttendance(sId, decoded.course_id, { date: decoded.attendance_date });
      }
    }

    return successResponse(res, 200, 'Attendance session updated successfully', updated);
  } catch (error) {
    console.error('Error updating session attendance:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating attendance session');
  }
};

/**
 * Delete session attendance records
 * DELETE /api/attendance/sessions/:sessionId
 */
const deleteSessionAttendance = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const decoded = attendanceModel.decodeSessionId(sessionId);
    if (!decoded) {
      return errorResponse(res, 400, 'Invalid session identifier');
    }

    let scopedTeacherId = null;
    if (req.user && req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile found for your account');
      }
      const isAssigned = await attendanceModel.checkTeacherCourseAssignment(teacherProfile.teacher_id, decoded.course_id);
      if (!isAssigned) {
        return errorResponse(res, 403, 'You are not authorized to access attendance for this course.');
      }
      scopedTeacherId = teacherProfile.teacher_id;
    }

    const deleted = await attendanceModel.deleteSessionAttendance(decoded.course_id, decoded.attendance_date, decoded.start_time, scopedTeacherId);
    if (!deleted) {
      return errorResponse(res, 404, 'Attendance session not found or already deleted');
    }

    await createAuditLog({
      userId: req.user.user_id,
      action: 'ATTENDANCE_DELETED',
      entity: 'ATTENDANCE',
      entityId: sessionId,
      description: `Deleted attendance session for Course #${decoded.course_id} on ${decoded.attendance_date} (${decoded.start_time})`,
      details: {
        course_id: decoded.course_id,
        date: decoded.attendance_date,
        start_time: decoded.start_time
      },
      req
    });

    return successResponse(res, 200, 'Attendance session deleted successfully');
  } catch (error) {
    console.error('Error deleting session attendance:', error.message);
    return errorResponse(res, 500, 'An error occurred while deleting attendance session');
  }
};

/**
 * Safe configured QR durations
 * Allowed: 30 seconds, 1 minute, 2 minutes, 5 minutes, 10 minutes, 15 minutes
 */
const ALLOWED_QR_DURATIONS = [
  { seconds: 30, minutes: 1, label: '30 seconds', match: ['30', '30s', '0.5', '0.5m'] },
  { seconds: 60, minutes: 1, label: '1 minute', match: ['60', '60s', '1', '1m'] },
  { seconds: 120, minutes: 2, label: '2 minutes', match: ['120', '120s', '2', '2m'] },
  { seconds: 300, minutes: 5, label: '5 minutes', match: ['300', '300s', '5', '5m'] },
  { seconds: 600, minutes: 10, label: '10 minutes', match: ['600', '600s', '10', '10m'] },
  { seconds: 900, minutes: 15, label: '15 minutes', match: ['900', '900s', '15', '15m'] }
];

/**
 * Validate QR duration against strictly allowed durations
 * @param {*} inputDuration
 * @param {*} inputSeconds
 * @param {*} inputMinutes
 * @returns {Object|null}
 */
function validateQRDuration(inputDuration, inputSeconds, inputMinutes) {
  if (inputSeconds !== undefined && inputSeconds !== null && inputSeconds !== '') {
    const sec = parseInt(inputSeconds, 10);
    const found = ALLOWED_QR_DURATIONS.find(d => d.seconds === sec);
    if (found) return found;
    return null;
  }

  if (inputMinutes !== undefined && inputMinutes !== null && inputMinutes !== '') {
    const min = parseFloat(inputMinutes);
    if (min === 0.5) return ALLOWED_QR_DURATIONS[0];
    const found = ALLOWED_QR_DURATIONS.find(d => d.minutes === min && d.seconds !== 30);
    if (found) return found;
    return null;
  }

  if (inputDuration !== undefined && inputDuration !== null && inputDuration !== '') {
    const str = String(inputDuration).trim().toLowerCase();
    const found = ALLOWED_QR_DURATIONS.find(d => d.match.includes(str) || String(d.seconds) === str || String(d.minutes) === str);
    if (found) return found;
    return null;
  }

  // Default duration if omitted: 5 minutes (300 seconds)
  return ALLOWED_QR_DURATIONS.find(d => d.seconds === 300);
}

/**
 * Start a Dynamic QR Attendance session
 * POST /api/attendance/qr/start
 */
const startQRAttendanceSession = async (req, res) => {
  try {
    // 1. Resolve teacher profile server-side
    const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
    if (!teacherProfile || !teacherProfile.teacher_id) {
      return errorResponse(res, 403, 'No faculty profile found for your account');
    }
    const teacherId = teacherProfile.teacher_id;

    // 2. Validate duration
    const {
      timetable_id,
      course_id,
      session_date,
      start_time,
      end_time,
      room_no,
      lecture_type,
      duration,
      duration_seconds,
      duration_minutes
    } = req.body;

    const validatedDuration = validateQRDuration(duration, duration_seconds, duration_minutes);
    if (!validatedDuration) {
      return errorResponse(res, 400, 'Invalid duration. Allowed durations are 30 seconds, 1, 2, 5, 10, or 15 minutes.');
    }

    // 3. Prevent duplicate / conflicting active session for this teacher
    const activeExisting = await attendanceModel.findActiveQRSessionByTeacher(teacherId);
    if (activeExisting) {
      return errorResponse(res, 409, 'An active QR attendance session already exists. Please close the current session before starting a new one.', {
        active_session: activeExisting
      });
    }

    let finalCourseId = null;
    let finalTimetableId = null;
    let finalSessionDate = null;
    let finalStartTime = null;
    let finalEndTime = null;
    let finalLectureType = 'Regular Lecture';
    let finalRoomNo = null;

    // Case A: Starting from an existing Timetable lecture slot
    if (timetable_id) {
      const slotId = parseInt(timetable_id, 10);
      if (isNaN(slotId) || slotId <= 0) {
        return errorResponse(res, 400, 'Invalid timetable identifier');
      }

      const slot = await timetableModel.findById(slotId);
      if (!slot) {
        return errorResponse(res, 404, 'Timetable lecture slot not found');
      }

      // Authorization / ownership check: must belong to authenticated teacher
      if (slot.teacher_id !== teacherId) {
        return errorResponse(res, 403, 'You are not authorized to start attendance for this timetable lecture');
      }

      finalCourseId = slot.course_id;
      finalTimetableId = slot.timetable_id;
      finalStartTime = cleanTime(slot.start_time);
      finalEndTime = cleanTime(slot.end_time);
      finalRoomNo = (room_no && String(room_no).trim()) || slot.room_no || null;
      finalLectureType = (lecture_type && attendanceModel.ALLOWED_LECTURE_TYPES.includes(String(lecture_type).trim()))
        ? String(lecture_type).trim()
        : 'Regular Lecture';

      const dateClean = cleanDate(session_date);
      finalSessionDate = dateClean || new Date().toISOString().slice(0, 10);
    } 
    // Case B: Extra / Custom lecture (timetable_id = NULL)
    else {
      if (!course_id) {
        return errorResponse(res, 400, 'Course ID is required for extra/custom lecture');
      }
      const cId = parseInt(course_id, 10);
      if (isNaN(cId) || cId <= 0) {
        return errorResponse(res, 400, 'Invalid course identifier');
      }

      // Verify teacher is assigned to teach this course
      const isAssigned = await attendanceModel.checkTeacherCourseAssignment(teacherId, cId);
      if (!isAssigned) {
        return errorResponse(res, 403, 'You are not authorized to start attendance for this course');
      }

      finalCourseId = cId;
      finalTimetableId = null;

      const dateClean = cleanDate(session_date);
      if (!dateClean) {
        return errorResponse(res, 400, 'A valid session date (YYYY-MM-DD) is required');
      }
      finalSessionDate = dateClean;

      const cleanStart = cleanTime(start_time);
      const cleanEnd = cleanTime(end_time);
      if (!cleanStart || !cleanEnd) {
        return errorResponse(res, 400, 'Valid start time and end time (HH:MM or HH:MM:SS) are required');
      }
      if (cleanStart >= cleanEnd) {
        return errorResponse(res, 400, 'Start time must be before end time');
      }

      finalStartTime = cleanStart;
      finalEndTime = cleanEnd;
      finalRoomNo = (room_no && String(room_no).trim()) || null;
      finalLectureType = (lecture_type && attendanceModel.ALLOWED_LECTURE_TYPES.includes(String(lecture_type).trim()))
        ? String(lecture_type).trim()
        : 'Extra / Additional Lecture';
    }

    // 4. Generate cryptographically secure UUID and QR secret
    const sessionUuid = crypto.randomUUID();
    const qrSecret = crypto.randomBytes(32).toString('hex');

    // 5. Calculate server-side expiration timestamp
    const expiresAt = new Date(Date.now() + validatedDuration.seconds * 1000);

    // 6. Create session in database
    const createdSession = await attendanceModel.createQRSession({
      session_uuid: sessionUuid,
      teacher_id: teacherId,
      course_id: finalCourseId,
      timetable_id: finalTimetableId,
      session_date: finalSessionDate,
      start_time: finalStartTime,
      end_time: finalEndTime,
      lecture_type: finalLectureType,
      room_no: finalRoomNo,
      duration_minutes: validatedDuration.minutes,
      expires_at: expiresAt,
      is_active: 1,
      qr_secret: qrSecret
    });

    // 7. Audit Log
    await createAuditLog({
      userId: req.user.user_id,
      action: 'QR_SESSION_STARTED',
      entity: 'ATTENDANCE_SESSION',
      entityId: sessionUuid,
      description: `Started QR attendance session #${createdSession.session_id} (${sessionUuid}) for Course #${finalCourseId} with validity ${validatedDuration.label}`,
      details: {
        session_id: createdSession.session_id,
        session_uuid: sessionUuid,
        course_id: finalCourseId,
        timetable_id: finalTimetableId,
        session_date: finalSessionDate,
        start_time: finalStartTime,
        end_time: finalEndTime,
        duration_seconds: validatedDuration.seconds,
        expires_at: expiresAt
      },
      req
    });

    // 8. Fetch complete session representation (never exposes qr_secret)
    const fullSession = await attendanceModel.findQRSessionById(createdSession.session_id);
    const remainingSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));

    return successResponse(res, 201, 'QR attendance session started successfully', {
      ...fullSession,
      duration_seconds: validatedDuration.seconds,
      remaining_seconds: remainingSeconds
    });
  } catch (error) {
    console.error('Error starting QR attendance session:', error);
    return errorResponse(res, 500, 'An error occurred while starting QR attendance session');
  }
};

/**
 * Get active QR attendance session for authenticated teacher
 * GET /api/attendance/qr/active
 */
const getActiveQRSession = async (req, res) => {
  try {
    const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
    if (!teacherProfile || !teacherProfile.teacher_id) {
      return errorResponse(res, 403, 'No faculty profile found for your account');
    }
    const teacherId = teacherProfile.teacher_id;

    const courseId = req.query.course_id ? parseInt(req.query.course_id, 10) : null;
    const session = await attendanceModel.findActiveQRSessionByTeacher(teacherId, courseId);

    if (!session) {
      return successResponse(res, 200, 'No active QR attendance session found', {
        active: false,
        session: null
      });
    }

    const remainingSeconds = Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000));
    if (remainingSeconds <= 0) {
      // Lazily close expired session
      await attendanceModel.closeQRSession(session.session_id, teacherId);
      return successResponse(res, 200, 'No active QR attendance session found', {
        active: false,
        session: null
      });
    }

    return successResponse(res, 200, 'Active QR attendance session retrieved successfully', {
      active: true,
      session: {
        ...session,
        student_qr_visible: session.student_qr_visible ? 1 : 0,
        remaining_seconds: remainingSeconds
      }
    });
  } catch (error) {
    console.error('Error fetching active QR attendance session:', error);
    return errorResponse(res, 500, 'An error occurred while fetching active QR attendance session');
  }
};

/**
 * Get active QR attendance session for authenticated student
 * GET /api/attendance/qr/active-session
 * GET /api/attendance/qr/student/active
 * Strictly STUDENT role, student_id resolved server-side from user_id
 */
const getActiveQRSessionForStudent = async (req, res) => {
  try {
    const studentProfile = await studentModel.findByUserId(req.user.user_id);
    if (!studentProfile || !studentProfile.student_id) {
      return errorResponse(res, 403, 'No active student profile found for your account');
    }
    const studentId = studentProfile.student_id;

    const session = await attendanceModel.findActiveQRSessionForStudent(studentId);
    if (!session) {
      return successResponse(res, 200, 'No active QR attendance session found', {
        active: false,
        session: null
      });
    }

    const remainingSeconds = Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000));
    if (remainingSeconds <= 0) {
      return successResponse(res, 200, 'No active QR attendance session found', {
        active: false,
        session: null
      });
    }

    // Check if student has already marked attendance for this session
    const existingAttendance = await attendanceModel.checkDuplicate(
      studentId,
      session.course_id,
      session.session_date,
      session.start_time
    );

    const isVisible = !!session.student_qr_visible;
    let qrToken = null;
    let tokenPayload = null;

    if (isVisible) {
      const sessionInternal = await attendanceModel.findQRSessionInternal(session.session_id);
      if (sessionInternal && sessionInternal.qr_secret) {
        const now = Date.now();
        const ts = now;
        const nonce = crypto.randomBytes(8).toString('hex');
        const message = `${session.session_uuid}:${ts}:${nonce}`;
        const sig = crypto.createHmac('sha256', sessionInternal.qr_secret).update(message).digest('hex');

        tokenPayload = {
          sid: session.session_uuid,
          ts,
          nonce,
          sig
        };
        qrToken = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
      }
    }

    return successResponse(res, 200, 'Active QR attendance session retrieved successfully', {
      active: true,
      session: {
        session_id: session.session_id,
        session_uuid: session.session_uuid,
        course_id: session.course_id,
        course_code: session.course_code,
        course_name: session.course_name,
        teacher_name: session.teacher_name,
        session_date: session.session_date,
        start_time: session.start_time,
        end_time: session.end_time,
        lecture_type: session.lecture_type,
        room_no: session.room_no,
        expires_at: session.expires_at,
        remaining_seconds: remainingSeconds,
        already_marked: !!existingAttendance,
        marked_status: existingAttendance ? existingAttendance.status : null,
        attendance_id: existingAttendance ? existingAttendance.attendance_id : null,
        student_qr_visible: isVisible,
        qr_available: isVisible,
        qr_token: qrToken,
        qr_token_payload: tokenPayload
      }
    });
  } catch (error) {
    console.error('Error fetching student active QR session:', error);
    return errorResponse(res, 500, 'An error occurred while fetching active QR session');
  }
};

/**
 * Safely close / deactivate a QR attendance session
 * POST /api/attendance/qr/close/:sessionId
 */
const closeQRAttendanceSession = async (req, res) => {
  try {
    const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
    if (!teacherProfile || !teacherProfile.teacher_id) {
      return errorResponse(res, 403, 'No faculty profile found for your account');
    }
    const teacherId = teacherProfile.teacher_id;

    const { sessionId } = req.params;
    if (!sessionId) {
      return errorResponse(res, 400, 'Session identifier is required');
    }

    const session = await attendanceModel.findQRSessionById(sessionId);
    if (!session) {
      return errorResponse(res, 404, 'Attendance session not found');
    }

    // IDOR / Ownership check
    if (session.teacher_id !== teacherId) {
      return errorResponse(res, 403, 'You are not authorized to close this attendance session');
    }

    if (session.is_active === 0) {
      return successResponse(res, 200, 'Attendance session is already closed', {
        ...session,
        is_active: 0,
        remaining_seconds: 0
      });
    }

    await attendanceModel.closeQRSession(session.session_id, teacherId);

    // Audit Log
    await createAuditLog({
      userId: req.user.user_id,
      action: 'QR_SESSION_ENDED',
      entity: 'ATTENDANCE_SESSION',
      entityId: session.session_uuid,
      description: `Closed QR attendance session #${session.session_id} (${session.session_uuid}) for Course #${session.course_id}`,
      details: {
        session_id: session.session_id,
        session_uuid: session.session_uuid,
        course_id: session.course_id,
        timetable_id: session.timetable_id
      },
      req
    });

    const updated = await attendanceModel.findQRSessionById(session.session_id);

    return successResponse(res, 200, 'Attendance session closed successfully', {
      ...updated,
      is_active: 0,
      remaining_seconds: 0
    });
  } catch (error) {
    console.error('Error closing QR attendance session:', error);
    return errorResponse(res, 500, 'An error occurred while closing QR attendance session');
  }
};

/**
 * Toggle student QR visibility for an active session
 * POST /api/attendance/qr/visibility/:sessionId
 * Strictly TEACHER role, teacher must own the session
 */
const toggleQRStudentVisibility = async (req, res) => {
  try {
    const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
    if (!teacherProfile || !teacherProfile.teacher_id) {
      return errorResponse(res, 403, 'No faculty profile found for your account');
    }
    const teacherId = teacherProfile.teacher_id;

    const { sessionId } = req.params;
    if (!sessionId) {
      return errorResponse(res, 400, 'Session identifier is required');
    }

    const session = await attendanceModel.findQRSessionById(sessionId);
    if (!session) {
      return errorResponse(res, 404, 'Attendance session not found');
    }

    // Ownership / IDOR check
    if (session.teacher_id !== teacherId) {
      return errorResponse(res, 403, 'You are not authorized to modify this attendance session');
    }

    // Lifecycle checks
    if (session.is_active === 0) {
      return errorResponse(res, 410, 'Attendance session has been closed');
    }

    const now = Date.now();
    const expiryTime = new Date(session.expires_at).getTime();
    if (expiryTime <= now) {
      await attendanceModel.closeQRSession(session.session_id, teacherId);
      return errorResponse(res, 410, 'Attendance session has expired');
    }

    // Determine target visibility
    let targetVisibility;
    if (req.body && req.body.visible !== undefined) {
      targetVisibility = req.body.visible === true || req.body.visible === 1 || req.body.visible === 'true' || req.body.visible === '1';
    } else if (req.body && req.body.student_qr_visible !== undefined) {
      targetVisibility = req.body.student_qr_visible === 1 || req.body.student_qr_visible === true || req.body.student_qr_visible === '1';
    } else {
      targetVisibility = !session.student_qr_visible;
    }

    await attendanceModel.updateQRStudentVisibility(session.session_id, teacherId, targetVisibility);

    // Audit Log
    await createAuditLog({
      userId: req.user.user_id,
      action: 'QR_STUDENT_VISIBILITY_UPDATED',
      entity: 'ATTENDANCE_SESSION',
      entityId: session.session_uuid,
      description: `Teacher set student QR visibility to ${targetVisibility ? 'ON' : 'OFF'} for Session #${session.session_id} (${session.session_uuid})`,
      details: {
        session_id: session.session_id,
        session_uuid: session.session_uuid,
        course_id: session.course_id,
        student_qr_visible: targetVisibility ? 1 : 0
      },
      req
    });

    const updated = await attendanceModel.findQRSessionById(session.session_id);

    return successResponse(res, 200, `Student QR visibility set to ${targetVisibility ? 'Visible' : 'Hidden'}`, {
      session_id: updated.session_id,
      session_uuid: updated.session_uuid,
      student_qr_visible: updated.student_qr_visible ? 1 : 0,
      is_visible: !!updated.student_qr_visible
    });
  } catch (error) {
    console.error('Error updating QR student visibility:', error);
    return errorResponse(res, 500, 'An error occurred while updating student QR visibility');
  }
};

const QR_TOKEN_DRIFT_SECONDS = 60; // 60 seconds rolling window drift

/**
 * Generate a dynamic signed QR token for the active session
 * GET /api/attendance/qr/token/:sessionId
 * Strictly TEACHER role, teacher must own the session
 */
const getQRSessionToken = async (req, res) => {
  try {
    const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
    if (!teacherProfile || !teacherProfile.teacher_id) {
      return errorResponse(res, 403, 'No faculty profile found for your account');
    }
    const teacherId = teacherProfile.teacher_id;

    const { sessionId } = req.params;
    if (!sessionId) {
      return errorResponse(res, 400, 'Session identifier is required');
    }

    const session = await attendanceModel.findQRSessionInternal(sessionId);
    if (!session) {
      return errorResponse(res, 404, 'Attendance session not found');
    }

    // Ownership / IDOR check
    if (session.teacher_id !== teacherId) {
      return errorResponse(res, 403, 'You are not authorized to access this attendance session');
    }

    // Lifecycle checks
    if (session.is_active === 0) {
      return errorResponse(res, 410, 'Attendance session has been closed');
    }

    const now = Date.now();
    const expiryTime = new Date(session.expires_at).getTime();
    if (expiryTime <= now) {
      await attendanceModel.closeQRSession(session.session_id, teacherId);
      return errorResponse(res, 410, 'Attendance session has expired');
    }

    // Generate short-lived signed QR token
    const ts = now;
    const nonce = crypto.randomBytes(8).toString('hex');
    const message = `${session.session_uuid}:${ts}:${nonce}`;
    const sig = crypto.createHmac('sha256', session.qr_secret).update(message).digest('hex');

    const payload = {
      sid: session.session_uuid,
      ts,
      nonce,
      sig
    };

    const token = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const remainingSessionSeconds = Math.max(0, Math.floor((expiryTime - now) / 1000));

    // NEVER expose qr_secret in response!
    return successResponse(res, 200, 'Dynamic QR token generated successfully', {
      token,
      payload,
      expires_in_seconds: QR_TOKEN_DRIFT_SECONDS,
      remaining_session_seconds: remainingSessionSeconds,
      session_uuid: session.session_uuid,
      course_id: session.course_id,
      course_code: session.course_code,
      course_name: session.course_name
    });
  } catch (error) {
    console.error('Error generating QR session token:', error);
    return errorResponse(res, 500, 'An error occurred while generating QR session token');
  }
};

/**
 * Scan Dynamic QR code to mark student attendance
 * POST /api/attendance/qr/scan
 * Strictly STUDENT role, student_id resolved server-side from user_id
 */
const scanQRAttendance = async (req, res) => {
  try {
    // 1. Authenticated user role check & student_id resolution
    const studentProfile = await studentModel.findByUserId(req.user.user_id);
    if (!studentProfile || !studentProfile.student_id) {
      return errorResponse(res, 403, 'No active student profile found for your account');
    }
    const studentId = studentProfile.student_id;

    // 2. Parse token from request body (accepts { token } or { sid, ts, nonce, sig })
    let sid, ts, nonce, sig;
    if (req.body.token && typeof req.body.token === 'string') {
      try {
        const jsonStr = Buffer.from(req.body.token, 'base64url').toString('utf8');
        const parsed = JSON.parse(jsonStr);
        sid = parsed.sid;
        ts = parsed.ts;
        nonce = parsed.nonce;
        sig = parsed.sig;
      } catch (e) {
        return errorResponse(res, 400, 'Malformed QR token format');
      }
    } else if (req.body.sid && req.body.ts && req.body.nonce && req.body.sig) {
      sid = req.body.sid;
      ts = req.body.ts;
      nonce = req.body.nonce;
      sig = req.body.sig;
    } else {
      return errorResponse(res, 400, 'Missing or malformed QR token payload');
    }

    if (!sid || !ts || !nonce || !sig) {
      return errorResponse(res, 400, 'Malformed QR token payload: missing required fields');
    }

    // 3. Validate token timestamp format
    const now = Date.now();
    const tokenTs = parseInt(ts, 10);
    if (isNaN(tokenTs)) {
      return errorResponse(res, 400, 'Invalid token timestamp');
    }

    // 4. Session existence lookup
    const session = await attendanceModel.findQRSessionInternal(sid);
    if (!session) {
      return errorResponse(res, 404, 'Attendance session not found');
    }

    // 5. Session lifecycle validation (must be active and unexpired)
    if (session.is_active === 0) {
      return errorResponse(res, 410, 'Attendance session has been closed');
    }

    const sessionExpiry = new Date(session.expires_at).getTime();
    if (sessionExpiry <= now) {
      await attendanceModel.closeQRSession(session.session_id);
      return errorResponse(res, 410, 'Attendance session has expired');
    }

    // 6. Token lifecycle validation within the active session
    // Token is valid while the attendance session itself is active and unexpired.
    // Reject tokens that postdate session expiration, predate session creation (with clock skew allowance), or are far in future
    const sessionCreatedAt = new Date(session.created_at).getTime();
    if (tokenTs > sessionExpiry) {
      return errorResponse(res, 410, 'Attendance session has expired');
    }
    if (tokenTs < sessionCreatedAt - 60 * 1000) {
      return errorResponse(res, 410, 'QR code has expired. Please scan the current live QR code on the screen.');
    }
    if (tokenTs > now + 60 * 1000) {
      return errorResponse(res, 400, 'Invalid token timestamp');
    }

    // 7. Cryptographic signature verification (timing-safe)
    const expectedMessage = `${session.session_uuid}:${ts}:${nonce}`;
    const expectedSig = crypto.createHmac('sha256', session.qr_secret).update(expectedMessage).digest('hex');

    const sigStr = String(sig).trim();
    if (sigStr.length !== expectedSig.length) {
      return errorResponse(res, 400, 'Invalid QR code signature');
    }

    const sigBuf = Buffer.from(sigStr, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
      return errorResponse(res, 400, 'Invalid QR code signature');
    }

    // 7. Student active enrollment verification
    const enrollment = await attendanceModel.checkStudentEnrollment(studentId, session.course_id);
    if (!enrollment || enrollment.status !== 'Enrolled') {
      return errorResponse(res, 403, 'You are not actively enrolled in this course');
    }

    // 8. Duplicate attendance verification
    const existingAttendance = await attendanceModel.checkDuplicate(
      studentId,
      session.course_id,
      session.session_date,
      session.start_time
    );
    if (existingAttendance) {
      return errorResponse(res, 409, 'Attendance has already been recorded for this lecture');
    }

    // 9. Insert attendance record into existing attendance table
    let insertId;
    try {
      insertId = await attendanceModel.createAttendance({
        student_id: studentId,
        course_id: session.course_id,
        teacher_id: session.teacher_id,
        attendance_date: session.session_date,
        status: 'Present',
        remarks: 'Marked via Dynamic QR',
        lecture_type: session.lecture_type || 'Regular Lecture',
        session_name: session.lecture_type || 'Regular Lecture',
        start_time: session.start_time,
        end_time: session.end_time
      });
    } catch (dbErr) {
      if (dbErr.code === 'ER_DUP_ENTRY') {
        return errorResponse(res, 409, 'Attendance has already been recorded for this lecture');
      }
      throw dbErr;
    }

    // 10. Audit Log
    await createAuditLog({
      userId: req.user.user_id,
      action: 'ATTENDANCE_MARKED_QR',
      entity: 'ATTENDANCE',
      entityId: insertId,
      description: `Student #${studentId} marked attendance as Present via Dynamic QR for Course #${session.course_id} on ${session.session_date}`,
      details: {
        attendance_id: insertId,
        student_id: studentId,
        course_id: session.course_id,
        session_id: session.session_id,
        session_uuid: session.session_uuid,
        session_date: session.session_date,
        start_time: session.start_time,
        end_time: session.end_time
      },
      req
    });

    // 11. Evaluate low-attendance warning asynchronously (failure-isolated)
    checkAndNotifyLowAttendance(studentId, session.course_id).catch(() => {});

    return successResponse(res, 201, 'Attendance marked successfully as Present', {
      attendance_id: insertId,
      status: 'Present',
      student_id: studentId,
      course_id: session.course_id,
      course_code: session.course_code,
      course_name: session.course_name,
      session_date: session.session_date,
      start_time: session.start_time,
      end_time: session.end_time,
      lecture_type: session.lecture_type,
      remarks: 'Marked via Dynamic QR'
    });
  } catch (error) {
    console.error('Error scanning QR attendance:', error);
    return errorResponse(res, 500, 'An error occurred while scanning QR attendance');
  }
};

module.exports = {
  getAttendance,
  getAttendanceById,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceSessions,
  getSessionDetails,
  updateSessionAttendance,
  deleteSessionAttendance,
  getAttendanceSummary,
  getStudentAttendance,
  getMyAttendance,
  getStudentDepartmentFaculty,
  getCourseAttendance,
  getAttendanceCourses,
  checkAndNotifyLowAttendance,
  startQRAttendanceSession,
  getActiveQRSession,
  getActiveQRSessionForStudent,
  closeQRAttendanceSession,
  getQRSessionToken,
  scanQRAttendance,
  toggleQRStudentVisibility
};


