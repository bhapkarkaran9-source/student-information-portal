const pool = require('../config/db');
const timetableModel = require('../models/timetable.model');
const courseModel = require('../models/course.model');
const teacherModel = require('../models/teacher.model');
const studentModel = require('../models/student.model');
const notificationModel = require('../models/notification.model');
const { successResponse, errorResponse } = require('../utils/response');
const { createAuditLog } = require('../services/audit.service');

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

/**
 * Helper to normalize time string to HH:MM:SS
 */
function normalizeTime(t) {
  if (!t || typeof t !== 'string') return null;
  const trimmed = t.trim();
  if (!TIME_REGEX.test(trimmed)) return null;
  const parts = trimmed.split(':');
  const h = parts[0].padStart(2, '0');
  const m = parts[1].padStart(2, '0');
  const s = parts[2] ? parts[2].padStart(2, '0') : '00';
  return `${h}:${m}:${s}`;
}

/**
 * Helper to normalize day string to Title Case (e.g. 'monday' -> 'Monday')
 */
function normalizeDay(d) {
  if (!d || typeof d !== 'string') return null;
  const trimmed = d.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/**
 * Get timetable list with search, filters, and pagination
 * GET /api/timetable
 */
const getTimetable = async (req, res) => {
  try {
    const {
      page,
      limit,
      search = '',
      day,
      day_of_week,
      course_id = '',
      teacher_id = '',
      department_id = '',
      academic_year = '',
      semester = '',
      class_name = '',
      division = '',
      room_no = '',
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

    // Accept both ?day= and ?day_of_week=
    let dayFilter = '';
    const rawDay = day_of_week || day;
    if (rawDay) {
      const norm = normalizeDay(rawDay);
      if (timetableModel.ALLOWED_DAYS.includes(norm)) {
        dayFilter = norm;
      } else {
        return successResponse(res, 200, 'Timetable retrieved successfully', {
          timetable: [],
          pagination: {
            page: safePage,
            limit: safeLimit,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false
          }
        });
      }
    }

    // Role-based scoping for TEACHER
    let effectiveTeacherId = teacher_id;
    if (req.user && req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile found for your account');
      }
      effectiveTeacherId = teacherProfile.teacher_id;

      // If course_id is specified, verify teacher is assigned to that course
      if (course_id) {
        const assignedCourses = await courseModel.getTeacherAssignedCourses(teacherProfile.teacher_id);
        const isAssigned = assignedCourses.some(c => Number(c.course_id) === Number(course_id));
        if (!isAssigned) {
          return errorResponse(res, 403, 'You are not authorized to access attendance for this course.');
        }
      }
    }

    // Role-based scoping for STUDENT
    let effectiveClassName = typeof class_name === 'string' ? class_name.trim() : '';
    let effectiveDivision = typeof division === 'string' ? division.trim() : '';
    let effectiveSemester = semester;
    if (req.user && req.user.role === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(req.user.user_id);
      if (studentProfile) {
        const fullStudent = await studentModel.findById(studentProfile.student_id);
        if (fullStudent) {
          if (!effectiveClassName) effectiveClassName = fullStudent.class_name || '';
          if (!effectiveDivision) effectiveDivision = fullStudent.division || '';
          if (!effectiveSemester) effectiveSemester = fullStudent.semester || '';
        }
      }
    }

    const result = await timetableModel.getTimetable({
      page: safePage,
      limit: safeLimit,
      search: typeof search === 'string' ? search.trim() : '',
      day_of_week: dayFilter,
      course_id,
      teacher_id: effectiveTeacherId,
      department_id,
      academic_year: typeof academic_year === 'string' ? academic_year.trim() : '',
      semester: effectiveSemester,
      class_name: effectiveClassName,
      division: effectiveDivision,
      room_no: typeof room_no === 'string' ? room_no.trim() : '',
      all: isAll
    });

    return successResponse(res, 200, 'Timetable retrieved successfully', result);
  } catch (error) {
    console.error('Error fetching timetable:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching timetable');
  }
};

/**
 * Get single timetable entry by ID
 * GET /api/timetable/:id
 */
const getTimetableById = async (req, res) => {
  try {
    const timetableId = parseInt(req.params.id, 10);
    if (isNaN(timetableId) || timetableId <= 0) {
      return errorResponse(res, 400, 'Invalid timetable ID');
    }

    const entry = await timetableModel.findById(timetableId);
    if (!entry) {
      return errorResponse(res, 404, 'Timetable entry not found');
    }

    return successResponse(res, 200, 'Timetable entry retrieved successfully', { timetable: entry });
  } catch (error) {
    console.error('Error fetching timetable entry:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching timetable entry');
  }
};

/**
 * Create a new timetable entry
 * POST /api/timetable
 */
const createTimetable = async (req, res) => {
  try {
    const {
      day,
      day_of_week,
      start_time,
      end_time,
      course_id,
      teacher_id,
      class_name,
      division,
      room_no,
      academic_year,
      semester
    } = req.body;

    // 1. Required fields check
    const rawDay = day_of_week || day;
    if (!rawDay || !start_time || !end_time || !course_id || !teacher_id || !class_name || !division || !room_no) {
      return errorResponse(res, 400, 'Day of week, start time, end time, course, teacher, class name, division, and room number are required');
    }

    // 2. Validate day of week
    const cleanDay = normalizeDay(rawDay);
    if (!cleanDay || !timetableModel.ALLOWED_DAYS.includes(cleanDay)) {
      return errorResponse(res, 400, `Day of week must be one of: ${timetableModel.ALLOWED_DAYS.join(', ')}`);
    }

    // 3. Validate and normalize times
    const cleanStart = normalizeTime(start_time);
    const cleanEnd = normalizeTime(end_time);

    if (!cleanStart) {
      return errorResponse(res, 400, 'Invalid start time format (use HH:MM or HH:MM:SS)');
    }

    if (!cleanEnd) {
      return errorResponse(res, 400, 'Invalid end time format (use HH:MM or HH:MM:SS)');
    }

    if (cleanStart >= cleanEnd) {
      return errorResponse(res, 400, 'End time must be later than start time');
    }

    // 4. Validate string lengths and semester before DB lookups
    const cleanClass = String(class_name).trim();
    const cleanDiv = String(division).trim();
    const cleanRoom = String(room_no).trim();

    if (!cleanClass || cleanClass.length > 50) {
      return errorResponse(res, 400, 'Class name cannot be blank or exceed 50 characters');
    }
    if (!cleanDiv || cleanDiv.length > 10) {
      return errorResponse(res, 400, 'Division cannot be blank or exceed 10 characters');
    }
    if (!cleanRoom || cleanRoom.length > 30) {
      return errorResponse(res, 400, 'Room number cannot be blank or exceed 30 characters');
    }

    if (academic_year && String(academic_year).trim().length > 20) {
      return errorResponse(res, 400, 'Academic year cannot exceed 20 characters');
    }

    let semNum = null;
    if (semester !== undefined && semester !== null && semester !== '') {
      semNum = parseInt(semester, 10);
      if (isNaN(semNum) || semNum < 1 || semNum > 12) {
        return errorResponse(res, 400, 'Semester must be an integer between 1 and 12');
      }
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

    // 6. Validate Teacher exists and is active
    const teacherId = parseInt(teacher_id, 10);
    if (isNaN(teacherId) || teacherId <= 0) {
      return errorResponse(res, 400, 'Invalid teacher ID');
    }

    const teacher = await teacherModel.findById(teacherId);
    if (!teacher) {
      return errorResponse(res, 404, 'Teacher not found');
    }

    if (!teacher.is_active) {
      return errorResponse(res, 400, 'Cannot assign an inactive teacher. Please activate the teacher user account first.');
    }

    // 7. Resolve default academic year and semester if not provided
    const cleanYear = (academic_year && String(academic_year).trim()) || course.academic_year || '2025-2026';
    if (semNum === null) {
      semNum = course.semester || 1;
    }

    // 8. Timetable conflict validation
    const conflictResult = await timetableModel.checkConflict({
      day_of_week: cleanDay,
      start_time: cleanStart,
      end_time: cleanEnd,
      teacher_id: teacherId,
      class_name: cleanClass,
      division: cleanDiv,
      room_no: cleanRoom,
      course_id: courseId
    });

    if (conflictResult.hasConflict) {
      return errorResponse(res, 409, conflictResult.message, {
        conflictType: conflictResult.type,
        conflict: conflictResult.conflictRecord
      });
    }

    // 9. Insert into timetable
    const newId = await timetableModel.createTimetable({
      day_of_week: cleanDay,
      start_time: cleanStart,
      end_time: cleanEnd,
      course_id: courseId,
      teacher_id: teacherId,
      class_name: cleanClass,
      division: cleanDiv,
      room_no: cleanRoom,
      academic_year: cleanYear,
      semester: semNum
    });

    const created = await timetableModel.findById(newId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'TIMETABLE_CREATED',
      entity: 'TIMETABLE',
      entityId: newId,
      description: `Created timetable slot for Course #${courseId} (${cleanDay} ${cleanStart}-${cleanEnd}) in Room ${cleanRoom}`,
      details: { timetable_id: newId, course_id: courseId, teacher_id: teacherId, day: cleanDay, room_no: cleanRoom },
      req
    });

    return successResponse(res, 201, 'Timetable entry created successfully', { timetable: created });

  } catch (error) {
    console.error('Error creating timetable entry:', error.message);
    return errorResponse(res, 500, 'An error occurred while creating timetable entry');
  }
};

/**
 * Update an existing timetable entry
 * PUT /api/timetable/:id
 */
const updateTimetable = async (req, res) => {
  try {
    const timetableId = parseInt(req.params.id, 10);
    if (isNaN(timetableId) || timetableId <= 0) {
      return errorResponse(res, 400, 'Invalid timetable ID');
    }

    const existing = await timetableModel.findById(timetableId);
    if (!existing) {
      return errorResponse(res, 404, 'Timetable entry not found');
    }

    const {
      day,
      day_of_week,
      start_time,
      end_time,
      course_id,
      teacher_id,
      class_name,
      division,
      room_no,
      academic_year,
      semester
    } = req.body;

    // 1. Required fields check
    const rawDay = day_of_week || day || existing.day_of_week;
    const cleanDay = normalizeDay(rawDay);
    if (!cleanDay || !timetableModel.ALLOWED_DAYS.includes(cleanDay)) {
      return errorResponse(res, 400, `Day of week must be one of: ${timetableModel.ALLOWED_DAYS.join(', ')}`);
    }

    // 2. Validate times
    const cleanStart = normalizeTime(start_time || existing.start_time.toString());
    const cleanEnd = normalizeTime(end_time || existing.end_time.toString());

    if (!cleanStart) {
      return errorResponse(res, 400, 'Invalid start time format (use HH:MM or HH:MM:SS)');
    }

    if (!cleanEnd) {
      return errorResponse(res, 400, 'Invalid end time format (use HH:MM or HH:MM:SS)');
    }

    if (cleanStart >= cleanEnd) {
      return errorResponse(res, 400, 'End time must be later than start time');
    }

    // 3. Validate strings and academic year/semester before DB lookups
    const cleanClass = class_name !== undefined ? String(class_name).trim() : existing.class_name;
    const cleanDiv = division !== undefined ? String(division).trim() : existing.division;
    const cleanRoom = room_no !== undefined ? String(room_no).trim() : existing.room_no;

    if (!cleanClass || cleanClass.length > 50) {
      return errorResponse(res, 400, 'Class name cannot be blank or exceed 50 characters');
    }
    if (!cleanDiv || cleanDiv.length > 10) {
      return errorResponse(res, 400, 'Division cannot be blank or exceed 10 characters');
    }
    if (!cleanRoom || cleanRoom.length > 30) {
      return errorResponse(res, 400, 'Room number cannot be blank or exceed 30 characters');
    }

    const cleanYear = (academic_year && String(academic_year).trim()) || existing.academic_year;
    if (cleanYear.length > 20) {
      return errorResponse(res, 400, 'Academic year cannot exceed 20 characters');
    }

    let semNum = existing.semester;
    if (semester !== undefined && semester !== null && semester !== '') {
      semNum = parseInt(semester, 10);
      if (isNaN(semNum) || semNum < 1 || semNum > 12) {
        return errorResponse(res, 400, 'Semester must be an integer between 1 and 12');
      }
    }

    // 4. Validate Course exists
    const courseId = course_id !== undefined ? parseInt(course_id, 10) : existing.course_id;
    if (isNaN(courseId) || courseId <= 0) {
      return errorResponse(res, 400, 'Invalid course ID');
    }

    const course = await courseModel.findById(courseId);
    if (!course) {
      return errorResponse(res, 404, 'Course not found');
    }

    // 5. Validate Teacher exists and is active
    const teacherId = teacher_id !== undefined ? parseInt(teacher_id, 10) : existing.teacher_id;
    if (isNaN(teacherId) || teacherId <= 0) {
      return errorResponse(res, 400, 'Invalid teacher ID');
    }

    const teacher = await teacherModel.findById(teacherId);
    if (!teacher) {
      return errorResponse(res, 404, 'Teacher not found');
    }

    if (!teacher.is_active) {
      return errorResponse(res, 400, 'Cannot assign an inactive teacher. Please activate the teacher user account first.');
    }

    // 6. Conflict check (excluding current timetableId)
    const conflictResult = await timetableModel.checkConflict({
      day_of_week: cleanDay,
      start_time: cleanStart,
      end_time: cleanEnd,
      teacher_id: teacherId,
      class_name: cleanClass,
      division: cleanDiv,
      room_no: cleanRoom,
      course_id: courseId,
      excludeId: timetableId
    });

    if (conflictResult.hasConflict) {
      return errorResponse(res, 409, conflictResult.message, {
        conflictType: conflictResult.type,
        conflict: conflictResult.conflictRecord
      });
    }

    // 7. Update database
    await timetableModel.updateTimetable(timetableId, {
      day_of_week: cleanDay,
      start_time: cleanStart,
      end_time: cleanEnd,
      course_id: courseId,
      teacher_id: teacherId,
      class_name: cleanClass,
      division: cleanDiv,
      room_no: cleanRoom,
      academic_year: cleanYear,
      semester: semNum
    });

    const updated = await timetableModel.findById(timetableId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'TIMETABLE_UPDATED',
      entity: 'TIMETABLE',
      entityId: timetableId,
      description: `Updated timetable slot #${timetableId} (${cleanDay} ${cleanStart}-${cleanEnd})`,
      details: { timetable_id: timetableId, course_id: courseId, teacher_id: teacherId, day: cleanDay },
      req
    });

    return successResponse(res, 200, 'Timetable entry updated successfully', { timetable: updated });

  } catch (error) {
    console.error('Error updating timetable entry:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating timetable entry');
  }
};

/**
 * Delete a timetable entry
 * DELETE /api/timetable/:id
 */
const deleteTimetable = async (req, res) => {
  try {
    const timetableId = parseInt(req.params.id, 10);
    if (isNaN(timetableId) || timetableId <= 0) {
      return errorResponse(res, 400, 'Invalid timetable ID');
    }

    const existing = await timetableModel.findById(timetableId);
    if (!existing) {
      return errorResponse(res, 404, 'Timetable entry not found');
    }

    // Check real academic dependencies only. Reminder/audit/notification rows are not academic blockers.
    const depCheck = await timetableModel.checkTimetableDependencies(timetableId);
    if (depCheck.hasDependencies) {
      const dependencyText = depCheck.details?.dependencies
        ?.map((dep) => `${dep.table} (${dep.count})`)
        .join(', ') || 'unknown academic table';

      return errorResponse(res, 409, `Cannot delete timetable entry: dependent academic records exist in ${dependencyText}.`);
    }

    await timetableModel.deleteTimetable(timetableId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'TIMETABLE_DELETED',
      entity: 'TIMETABLE',
      entityId: timetableId,
      description: `Deleted timetable slot #${timetableId} (${existing.day_of_week} ${existing.start_time}-${existing.end_time})`,
      details: { timetable_id: timetableId, course_id: existing.course_id, teacher_id: existing.teacher_id },
      req
    });

    return successResponse(res, 200, 'Timetable entry deleted successfully');

  } catch (error) {
    console.error('Error deleting timetable entry:', error.message);
    return errorResponse(res, 500, 'An error occurred while deleting timetable entry');
  }
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getDayName(dateObj) {
  return DAYS_OF_WEEK[dateObj.getDay()];
}

function formatTimeTo12Hour(timeStr) {
  if (!timeStr) return '';
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return String(timeStr);
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1].padStart(2, '0');
  if (isNaN(hours)) return String(timeStr);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');
  return `${strHours}:${minutes} ${ampm}`;
}

function parseTimeOnDate(timeStr, baseDate) {
  const parts = String(timeStr).split(':');
  const d = new Date(baseDate);
  d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), parts[2] ? parseInt(parts[2], 10) : 0, 0);
  return d;
}

function computeLectureStatus(startTimeStr, endTimeStr, now) {
  const start = parseTimeOnDate(startTimeStr, now);
  const end = parseTimeOnDate(endTimeStr, now);
  const nowMs = now.getTime();
  const startMs = start.getTime();
  const endMs = end.getTime();

  const diffMinsStart = (startMs - nowMs) / 60000;

  let status = 'UPCOMING';
  let countdown_text = '';
  let starts_in_minutes = 0;

  if (nowMs >= endMs) {
    status = 'COMPLETED';
    countdown_text = 'Lecture completed';
    starts_in_minutes = 0;
  } else if (nowMs >= startMs) {
    status = 'NOW';
    countdown_text = 'Lecture is happening now';
    starts_in_minutes = 0;
  } else if (diffMinsStart <= 15) {
    status = 'STARTING SOON';
    const mins = Math.max(1, Math.round(diffMinsStart));
    countdown_text = `Starts in ${mins} minute${mins === 1 ? '' : 's'}`;
    starts_in_minutes = mins;
  } else {
    status = 'UPCOMING';
    const mins = Math.round(diffMinsStart);
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      countdown_text = remMins > 0 ? `Starts in ${hours} hr ${remMins} min` : `Starts in ${hours} hour${hours === 1 ? '' : 's'}`;
    } else {
      countdown_text = `Starts in ${mins} minute${mins === 1 ? '' : 's'}`;
    }
    starts_in_minutes = mins;
  }

  return { status, countdown_text, starts_in_minutes };
}

/**
 * Get Today's Timetable for authenticated student, teacher, or admin
 * GET /api/timetable/today
 */
const getTodayTimetable = async (req, res) => {
  try {
    const userRole = req.user ? req.user.role : null;
    const userId = req.user ? req.user.user_id : null;

    if (!userRole || !userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    // Determine target date and reference time
    const targetDate = req.query.date ? new Date(req.query.date) : new Date();
    const dayName = getDayName(targetDate);
    const dateStr = targetDate.toISOString().slice(0, 10);
    const refTime = req.query.ref_time || req.query.time || null;
    const now = refTime ? parseTimeOnDate(refTime, targetDate) : new Date();

    let lectures = [];

    if (userRole === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(userId);
      if (!studentProfile) {
        return errorResponse(res, 403, 'No student academic profile found for your account');
      }

      const fullStudent = await studentModel.findById(studentProfile.student_id);
      if (!fullStudent) {
        return errorResponse(res, 403, 'Student academic profile details not found');
      }

      lectures = await timetableModel.getTodayLecturesForStudent({
        department_id: fullStudent.department_id,
        class_name: fullStudent.class_name,
        division: fullStudent.division,
        semester: fullStudent.semester,
        day_of_week: dayName,
        student_id: fullStudent.student_id
      });
    } else if (userRole === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(userId);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'No faculty profile found for your account');
      }

      lectures = await timetableModel.getTodayLecturesForTeacher({
        teacher_id: teacherProfile.teacher_id,
        day_of_week: dayName
      });
    } else if (userRole === 'ADMIN') {
      const allRes = await timetableModel.getTimetable({
        day_of_week: dayName,
        all: true
      });
      lectures = allRes.timetable || [];
    }

    // Enrich lectures with status, countdown, and attendance status
    const enrichedLectures = [];
    for (const slot of lectures) {
      const statusInfo = computeLectureStatus(slot.start_time, slot.end_time, now);
      const isAttendanceRecorded = await timetableModel.checkLectureAttendanceRecorded({
        course_id: slot.course_id,
        teacher_id: slot.teacher_id,
        date: dateStr,
        start_time: slot.start_time
      });

      let studentAttendance = null;
      if (userRole === 'STUDENT') {
        const studentProfile = await studentModel.findByUserId(userId);
        if (studentProfile) {
          studentAttendance = await timetableModel.checkStudentAttendanceForLecture({
            student_id: studentProfile.student_id,
            course_id: slot.course_id,
            date: dateStr,
            start_time: slot.start_time
          });
        }
      }

      enrichedLectures.push({
        timetable_id: slot.timetable_id,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        start_time_12: formatTimeTo12Hour(slot.start_time),
        end_time_12: formatTimeTo12Hour(slot.end_time),
        time_range: `${formatTimeTo12Hour(slot.start_time)} - ${formatTimeTo12Hour(slot.end_time)}`,
        course_id: slot.course_id,
        course_name: slot.course_name,
        course_code: slot.course_code,
        credits: slot.credits,
        course_type: slot.course_type,
        room_no: slot.room_no,
        teacher_id: slot.teacher_id,
        teacher_name: slot.teacher_name,
        teacher_email: slot.teacher_email,
        class_name: slot.class_name,
        division: slot.division,
        semester: slot.semester,
        academic_year: slot.academic_year,
        department_name: slot.department_name,
        status: statusInfo.status,
        countdown_text: statusInfo.countdown_text,
        starts_in_minutes: statusInfo.starts_in_minutes,
        is_attendance_recorded: isAttendanceRecorded,
        student_attendance_status: studentAttendance ? studentAttendance.status : null,
        attendance_label: isAttendanceRecorded ? 'Attendance Recorded' : (userRole === 'TEACHER' ? 'Mark Attendance' : 'Not Recorded')
      });
    }

    // Determine next lecture:
    // 1. Current happening lecture (NOW)
    // 2. Or the earliest upcoming/starting soon lecture
    let nextLecture = enrichedLectures.find(l => l.status === 'NOW') || null;
    if (!nextLecture) {
      nextLecture = enrichedLectures.find(l => l.status === 'STARTING SOON' || l.status === 'UPCOMING') || null;
    }

    const summary = {
      total: enrichedLectures.length,
      completed: enrichedLectures.filter(l => l.status === 'COMPLETED').length,
      now: enrichedLectures.filter(l => l.status === 'NOW').length,
      starting_soon: enrichedLectures.filter(l => l.status === 'STARTING SOON').length,
      upcoming: enrichedLectures.filter(l => l.status === 'UPCOMING').length,
      attendance_recorded: enrichedLectures.filter(l => l.is_attendance_recorded).length
    };

    return successResponse(res, 200, "Today's timetable retrieved successfully", {
      day: dayName,
      date: dateStr,
      current_time: now.toTimeString().slice(0, 8),
      current_time_12: formatTimeTo12Hour(now.toTimeString().slice(0, 8)),
      lectures: enrichedLectures,
      next_lecture: nextLecture,
      summary
    });
  } catch (error) {
    console.error("Error fetching today's timetable:", error);
    return errorResponse(res, 500, "An error occurred while fetching today's timetable");
  }
};

/**
 * Check and dispatch automated lecture reminders for today's lectures
 * POST /api/timetable/reminders/check
 */
const checkAndDispatchReminders = async (req, res) => {
  try {
    const userRole = req.user ? req.user.role : null;
    const userId = req.user ? req.user.user_id : null;

    if (!userRole || !userId) {
      return errorResponse(res, 401, 'Authentication required');
    }

    const rawDateInput = req.body?.date ?? req.query.date ?? null;
    let targetDate = new Date();

    if (rawDateInput !== null && rawDateInput !== undefined && rawDateInput !== '') {
      const parsedDate = new Date(rawDateInput);
      if (Number.isNaN(parsedDate.getTime())) {
        return errorResponse(res, 400, 'Invalid date provided for reminder check');
      }
      targetDate = parsedDate;
    }

    const dayName = getDayName(targetDate);
    const dateStr = targetDate.toISOString().slice(0, 10);
    const refTime = req.body?.ref_time || req.query.ref_time || null;
    const now = refTime ? parseTimeOnDate(refTime, targetDate) : new Date();

    let remindersDispatched = 0;
    const dispatchedDetails = [];

    if (userRole === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(userId);
      if (!studentProfile) {
        return errorResponse(res, 403, 'Student profile not found');
      }

      const fullStudent = await studentModel.findById(studentProfile.student_id);
      if (!fullStudent) {
        return errorResponse(res, 403, 'Student details not found');
      }

      const lectures = await timetableModel.getTodayLecturesForStudent({
        department_id: fullStudent.department_id,
        class_name: fullStudent.class_name,
        division: fullStudent.division,
        semester: fullStudent.semester,
        day_of_week: dayName,
        student_id: fullStudent.student_id
      });

      for (const slot of lectures) {
        const start = parseTimeOnDate(slot.start_time, now);
        const end = parseTimeOnDate(slot.end_time, now);
        const nowMs = now.getTime();
        const startMs = start.getTime();
        const endMs = end.getTime();
        const diffMinsStart = (startMs - nowMs) / 60000;
        const time12 = formatTimeTo12Hour(slot.start_time);

        let reminderType = null;
        let title = '';
        let message = '';
        let auditAction = '';

        if (nowMs >= startMs && nowMs < endMs) {
          reminderType = 'STARTED';
          title = `Lecture Started: ${slot.course_name}`;
          message = `Your lecture for ${slot.course_code} - ${slot.course_name} has started in Room ${slot.room_no || 'TBA'}.`;
          auditAction = 'TIMETABLE_LECTURE_STARTED';
        } else if (diffMinsStart <= 5 && diffMinsStart > 0) {
          reminderType = '5_MINUTES';
          title = `Lecture Reminder: ${slot.course_name} starts in 5 minutes`;
          message = `Your lecture for ${slot.course_code} - ${slot.course_name} begins in 5 minutes at ${time12} in Room ${slot.room_no || 'TBA'}.`;
          auditAction = 'TIMETABLE_REMINDER_SENT';
        } else if (diffMinsStart <= 15 && diffMinsStart > 5) {
          reminderType = '15_MINUTES';
          title = `Lecture Reminder: ${slot.course_name} starts in 15 minutes`;
          message = `Your lecture for ${slot.course_code} - ${slot.course_name} begins in 15 minutes at ${time12} in Room ${slot.room_no || 'TBA'}.`;
          auditAction = 'TIMETABLE_REMINDER_SENT';
        }

        if (reminderType) {
          const alreadyLogged = await timetableModel.isReminderLogged({
            user_id: userId,
            timetable_id: slot.timetable_id,
            lecture_date: dateStr,
            reminder_type: reminderType
          });

          if (!alreadyLogged) {
            const [dupNotif] = await pool.query(
              'SELECT notification_id FROM notifications WHERE recipient_user_id = ? AND title = ? AND notification_type = \'TIMETABLE_REMINDER\' AND DATE(created_at) = ? LIMIT 1',
              [userId, title, dateStr]
            );

            if (dupNotif.length === 0) {
              const notif = await notificationModel.createNotification({
                recipient_user_id: userId,
                title,
                message,
                notification_type: 'TIMETABLE_REMINDER',
                metadata: {
                  eventId: `${slot.timetable_id}_${dateStr}_${reminderType}`,
                  timetableId: slot.timetable_id,
                  course: (slot.course_code && slot.course_name) ? `${slot.course_code} - ${slot.course_name}` : (slot.course_name || slot.course_code),
                  courseCode: slot.course_code,
                  courseName: slot.course_name,
                  teacher: slot.teacher_name,
                  teacherName: slot.teacher_name,
                  date: dateStr,
                  lectureDate: dateStr,
                  startTime: slot.start_time,
                  endTime: slot.end_time,
                  time: `${formatTimeTo12Hour(slot.start_time)}${slot.end_time ? ` - ${formatTimeTo12Hour(slot.end_time)}` : ''}`,
                  room: slot.room_no || slot.room_number || slot.room || 'TBA',
                  location: slot.room_no || slot.room_number || slot.room || 'TBA',
                  reminderType: reminderType,
                  reminderMessage: message,
                  message: message
                }
              });

              await timetableModel.logReminderSent({
                user_id: userId,
                timetable_id: slot.timetable_id,
                lecture_date: dateStr,
                reminder_type: reminderType,
                notification_id: notif?.notification_id || null
              });

              await createAuditLog({
                userId,
                action: auditAction,
                entity: 'TIMETABLE',
                entityId: slot.timetable_id,
                description: `Sent ${reminderType} lecture reminder for ${slot.course_code} (${slot.course_name})`,
                details: {
                  timetable_id: slot.timetable_id,
                  reminder_type: reminderType,
                  course_id: slot.course_id,
                  room_no: slot.room_no,
                  lecture_date: dateStr
                },
                req
              });

              remindersDispatched++;
              dispatchedDetails.push({
                timetable_id: slot.timetable_id,
                course_code: slot.course_code,
                reminder_type: reminderType,
                title
              });
            }
          }
        }
      }
    } else if (userRole === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(userId);
      if (!teacherProfile) {
        return errorResponse(res, 403, 'Teacher profile not found');
      }

      const lectures = await timetableModel.getTodayLecturesForTeacher({
        teacher_id: teacherProfile.teacher_id,
        day_of_week: dayName
      });

      for (const slot of lectures) {
        const start = parseTimeOnDate(slot.start_time, now);
        const end = parseTimeOnDate(slot.end_time, now);
        const nowMs = now.getTime();
        const startMs = start.getTime();
        const endMs = end.getTime();
        const diffMinsStart = (startMs - nowMs) / 60000;
        const time12 = formatTimeTo12Hour(slot.start_time);

        let reminderType = null;
        let title = '';
        let message = '';
        let auditAction = '';

        if (nowMs >= startMs && nowMs < endMs) {
          reminderType = 'STARTED';
          title = `Lecture Started: ${slot.course_name}`;
          message = `Your lecture for ${slot.course_code} - ${slot.course_name} (${slot.class_name} Div ${slot.division}) has started in Room ${slot.room_no || 'TBA'}.`;
          auditAction = 'TIMETABLE_LECTURE_STARTED';
        } else if (diffMinsStart <= 5 && diffMinsStart > 0) {
          reminderType = '5_MINUTES';
          title = `Lecture Reminder: ${slot.course_name} starts in 5 minutes`;
          message = `Your class for ${slot.course_code} - ${slot.course_name} (${slot.class_name} Div ${slot.division}) starts in 5 minutes at ${time12} in Room ${slot.room_no || 'TBA'}.`;
          auditAction = 'TIMETABLE_REMINDER_SENT';
        } else if (diffMinsStart <= 15 && diffMinsStart > 5) {
          reminderType = '15_MINUTES';
          title = `Lecture Reminder: ${slot.course_name} starts in 15 minutes`;
          message = `Your class for ${slot.course_code} - ${slot.course_name} (${slot.class_name} Div ${slot.division}) starts in 15 minutes at ${time12} in Room ${slot.room_no || 'TBA'}.`;
          auditAction = 'TIMETABLE_REMINDER_SENT';
        }

        if (reminderType) {
          const alreadyLogged = await timetableModel.isReminderLogged({
            user_id: userId,
            timetable_id: slot.timetable_id,
            lecture_date: dateStr,
            reminder_type: reminderType
          });

          if (!alreadyLogged) {
            const [dupNotif] = await pool.query(
              'SELECT notification_id FROM notifications WHERE recipient_user_id = ? AND title = ? AND notification_type = \'TIMETABLE_REMINDER\' AND DATE(created_at) = ? LIMIT 1',
              [userId, title, dateStr]
            );

            if (dupNotif.length === 0) {
              const notif = await notificationModel.createNotification({
                recipient_user_id: userId,
                title,
                message,
                notification_type: 'TIMETABLE_REMINDER',
                metadata: {
                  eventId: `${slot.timetable_id}_${dateStr}_${reminderType}`,
                  timetableId: slot.timetable_id,
                  course: (slot.course_code && slot.course_name) ? `${slot.course_code} - ${slot.course_name}` : (slot.course_name || slot.course_code),
                  courseCode: slot.course_code,
                  courseName: slot.course_name,
                  teacher: slot.teacher_name,
                  teacherName: slot.teacher_name,
                  date: dateStr,
                  lectureDate: dateStr,
                  startTime: slot.start_time,
                  endTime: slot.end_time,
                  time: `${formatTimeTo12Hour(slot.start_time)}${slot.end_time ? ` - ${formatTimeTo12Hour(slot.end_time)}` : ''}`,
                  room: slot.room_no || slot.room_number || slot.room || 'TBA',
                  location: slot.room_no || slot.room_number || slot.room || 'TBA',
                  reminderType: reminderType,
                  reminderMessage: message,
                  message: message
                }
              });

              await timetableModel.logReminderSent({
                user_id: userId,
                timetable_id: slot.timetable_id,
                lecture_date: dateStr,
                reminder_type: reminderType,
                notification_id: notif?.notification_id || null
              });

              await createAuditLog({
                userId,
                action: auditAction,
                entity: 'TIMETABLE',
                entityId: slot.timetable_id,
                description: `Faculty reminder sent: ${reminderType} for ${slot.course_code}`,
                details: { timetable_id: slot.timetable_id, reminder_type: reminderType, lecture_date: dateStr },
                req
              });

              remindersDispatched++;
              dispatchedDetails.push({
                timetable_id: slot.timetable_id,
                course_code: slot.course_code,
                reminder_type: reminderType,
                title
              });
            }
          }
        }
      }
    }

    return successResponse(res, 200, 'Timetable reminders checked', {
      reminders_dispatched: remindersDispatched,
      details: dispatchedDetails
    });
  } catch (error) {
    console.error('Error checking timetable reminders:', error);
    return errorResponse(res, 500, 'An error occurred while checking timetable reminders');
  }
};

module.exports = {
  getTimetable,
  getTimetableById,
  getTodayTimetable,
  checkAndDispatchReminders,
  createTimetable,
  updateTimetable,
  deleteTimetable,
  computeLectureStatus,
  formatTimeTo12Hour,
  getDayName
};
