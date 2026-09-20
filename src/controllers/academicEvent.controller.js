const pool = require('../config/db');
const academicEventModel = require('../models/academicEvent.model');
const notificationModel = require('../models/notification.model');
const { successResponse, errorResponse } = require('../utils/response');
const { createAuditLog } = require('../services/audit.service');

const VALID_EVENT_TYPES = [
  'EXAM',
  'ASSIGNMENT',
  'LECTURE',
  'HOLIDAY',
  'COLLEGE_EVENT',
  'SEMINAR',
  'RESULT',
  'MEETING',
  'OTHER'
];

const VALID_AUDIENCES = ['ALL', 'STUDENTS', 'TEACHERS', 'DEPARTMENT', 'COURSE', 'CLASS'];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

/**
 * Normalizes time to HH:MM:00
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
 * Get all academic events (with filtering, pagination, and RBAC)
 * GET /api/academic-events
 */
const getEvents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      all = false,
      search = '',
      event_type = '',
      exam_type = '',
      department_id = '',
      course_id = '',
      teacher_id = '',
      class_name = '',
      target_audience = '',
      start_date = '',
      end_date = '',
      month = ''
    } = req.query;

    const isAll = all === 'true' || all === '1' || all === true;

    const data = await academicEventModel.getEvents({
      page,
      limit,
      all: isAll,
      search,
      event_type,
      exam_type,
      department_id,
      course_id,
      teacher_id,
      class_name,
      target_audience,
      start_date,
      end_date,
      month,
      role: req.user.role,
      user: req.user
    });

    return successResponse(res, 200, 'Academic events fetched successfully', data);
  } catch (err) {
    console.error('[AcademicEventController] getEvents error:', err);
    return errorResponse(res, 500, 'Failed to fetch academic events', err.message);
  }
};

/**
 * Get upcoming academic events
 * GET /api/academic-events/upcoming
 */
const getUpcomingEvents = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const events = await academicEventModel.getUpcomingEvents({
      limit,
      role: req.user.role,
      user: req.user
    });

    return successResponse(res, 200, 'Upcoming academic events fetched successfully', { events });
  } catch (err) {
    console.error('[AcademicEventController] getUpcomingEvents error:', err);
    return errorResponse(res, 500, 'Failed to fetch upcoming events', err.message);
  }
};

/**
 * Get today's academic events
 * GET /api/academic-events/today
 */
const getTodayEvents = async (req, res) => {
  try {
    const events = await academicEventModel.getTodayEvents({
      role: req.user.role,
      user: req.user
    });

    return successResponse(res, 200, "Today's academic events fetched successfully", { events });
  } catch (err) {
    console.error('[AcademicEventController] getTodayEvents error:', err);
    return errorResponse(res, 500, "Failed to fetch today's events", err.message);
  }
};

/**
 * Get exams specifically
 * GET /api/academic-events/exams
 */
const getExams = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      all = false,
      exam_type = '',
      search = '',
      start_date = '',
      end_date = ''
    } = req.query;

    const isAll = all === 'true' || all === '1' || all === true;

    const data = await academicEventModel.getExams({
      page,
      limit,
      all: isAll,
      exam_type,
      search,
      start_date,
      end_date,
      role: req.user.role,
      user: req.user
    });

    return successResponse(res, 200, 'Exams fetched successfully', data);
  } catch (err) {
    console.error('[AcademicEventController] getExams error:', err);
    return errorResponse(res, 500, 'Failed to fetch exams', err.message);
  }
};

/**
 * Get single academic event by ID
 * GET /api/academic-events/:id
 */
const getEventById = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId) || eventId <= 0) {
      return errorResponse(res, 400, 'Invalid event ID');
    }

    const event = await academicEventModel.getEventById(eventId, req.user.role, req.user);
    if (!event) {
      return errorResponse(res, 404, 'Academic event not found or access denied');
    }

    return successResponse(res, 200, 'Academic event fetched successfully', event);
  } catch (err) {
    console.error('[AcademicEventController] getEventById error:', err);
    return errorResponse(res, 500, 'Failed to fetch academic event', err.message);
  }
};

/**
 * Create a new academic event
 * POST /api/academic-events
 */
const createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      event_type,
      exam_type,
      start_date,
      end_date,
      start_time,
      end_time,
      location,
      room,
      course_id,
      department_id,
      teacher_id,
      class_name,
      division,
      semester,
      target_audience,
      instructions
    } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return errorResponse(res, 400, 'Title is required');
    }
    if (title.trim().length > 200) {
      return errorResponse(res, 400, 'Title cannot exceed 200 characters');
    }

    if (!event_type || !VALID_EVENT_TYPES.includes(event_type.toUpperCase())) {
      return errorResponse(res, 400, `Event type must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
    }

    if (!start_date || !DATE_REGEX.test(start_date.trim())) {
      return errorResponse(res, 400, 'Valid start date (YYYY-MM-DD) is required');
    }

    const finalEndDate = end_date && end_date.trim() ? end_date.trim() : start_date.trim();
    if (!DATE_REGEX.test(finalEndDate)) {
      return errorResponse(res, 400, 'Valid end date (YYYY-MM-DD) is required');
    }

    if (finalEndDate < start_date.trim()) {
      return errorResponse(res, 400, 'End date cannot be earlier than start date');
    }

    const normStartTime = start_time ? normalizeTime(start_time) : null;
    const normEndTime = end_time ? normalizeTime(end_time) : null;

    if (start_time && !normStartTime) {
      return errorResponse(res, 400, 'Invalid start time format (use HH:MM or HH:MM:SS)');
    }
    if (end_time && !normEndTime) {
      return errorResponse(res, 400, 'Invalid end time format (use HH:MM or HH:MM:SS)');
    }

    if (normStartTime && normEndTime && finalEndDate === start_date.trim() && normEndTime <= normStartTime) {
      return errorResponse(res, 400, 'End time must be after start time on the same date');
    }

    let finalAudience = target_audience ? target_audience.toUpperCase() : 'ALL';
    if (!VALID_AUDIENCES.includes(finalAudience)) {
      finalAudience = 'ALL';
    }

    // Role restrictions
    let finalTeacherId = teacher_id ? parseInt(teacher_id, 10) : null;
    let finalDepartmentId = department_id ? parseInt(department_id, 10) : null;

    if (req.user.role === 'TEACHER') {
      const teacher = await academicEventModel.getTeacherContext(req.user.user_id);
      if (!teacher) {
        return errorResponse(res, 403, 'Teacher profile not found');
      }
      finalTeacherId = teacher.teacher_id;
      finalDepartmentId = teacher.department_id;
    }

    const newEvent = await academicEventModel.createEvent({
      title: title.trim(),
      description: description ? description.trim() : null,
      event_type: event_type.toUpperCase(),
      exam_type: exam_type ? exam_type.trim() : null,
      start_date: start_date.trim(),
      end_date: finalEndDate,
      start_time: normStartTime,
      end_time: normEndTime,
      location: location ? location.trim() : null,
      room: room ? room.trim() : null,
      course_id: course_id ? parseInt(course_id, 10) : null,
      department_id: finalDepartmentId,
      teacher_id: finalTeacherId,
      class_name: class_name ? class_name.trim() : null,
      division: division ? division.trim() : null,
      semester: semester ? parseInt(semester, 10) : null,
      target_audience: finalAudience,
      instructions: instructions ? instructions.trim() : null,
      created_by_user_id: req.user.user_id
    });

    // Create audit log
    await createAuditLog({
      req,
      action: 'ACADEMIC_EVENT_CREATED',
      entity: 'ACADEMIC_EVENT',
      entityId: newEvent.event_id,
      description: `Created academic event "${newEvent.title}" (${newEvent.event_type})`,
      details: {
        event_id: newEvent.event_id,
        title: newEvent.title,
        event_type: newEvent.event_type,
        start_date: newEvent.start_date,
        target_audience: newEvent.target_audience
      }
    });

    // High-priority initial notification broadcast (Exams only: send EXAM_SCHEDULED immediately)
    try {
      const isExam = newEvent.event_type === 'EXAM';
      if (isExam) {
        const recipients = await academicEventModel.findRecipientsForEvent(newEvent);

        // Fetch course details if course_id exists for accurate course string
        let courseDisplay = 'Course';
        if (newEvent.course_id) {
          const [courseRows] = await pool.query('SELECT course_code, course_name FROM courses WHERE course_id = ?', [newEvent.course_id]);
          if (courseRows.length > 0) {
            courseDisplay = courseRows[0].course_code && courseRows[0].course_name
              ? `${courseRows[0].course_code} - ${courseRows[0].course_name}`
              : (courseRows[0].course_code || courseRows[0].course_name || 'Course');
          }
        }

        const months = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        let formattedDateStr = newEvent.start_date;
        if (typeof newEvent.start_date === 'string') {
          const [ey, em, ed] = newEvent.start_date.split('-');
          if (ey && em && ed) {
            formattedDateStr = `${parseInt(ed, 10)} ${months[parseInt(em, 10) - 1]} ${ey}`;
          }
        } else if (newEvent.start_date instanceof Date) {
          formattedDateStr = `${newEvent.start_date.getDate()} ${months[newEvent.start_date.getMonth()]} ${newEvent.start_date.getFullYear()}`;
        }

        const venue = newEvent.room || newEvent.location || 'Examination Hall';
        const formattedTimeStr = academicEventModel.formatEventTime
          ? academicEventModel.formatEventTime(newEvent.start_time, newEvent.end_time)
          : (newEvent.start_time ? (newEvent.end_time ? `${newEvent.start_time} - ${newEvent.end_time}` : newEvent.start_time) : 'Scheduled Time');

        for (const uid of recipients) {
          await notificationModel.createNotification({
            recipient_user_id: uid,
            title: `Exam Scheduled: ${newEvent.title}`,
            message: `Your examination "${newEvent.title}" for ${courseDisplay} is scheduled on ${formattedDateStr} at ${formattedTimeStr} in ${venue}.`,
            notification_type: 'EXAM_SCHEDULED',
            is_read: 0,
            metadata: {
              emailNotificationType: 'EXAM_SCHEDULED',
              eventId: newEvent.event_id,
              examId: newEvent.event_id,
              examName: newEvent.title,
              title: newEvent.title,
              course: courseDisplay,
              course_id: newEvent.course_id,
              date: formattedDateStr,
              examDate: formattedDateStr,
              time: formattedTimeStr,
              startTime: newEvent.start_time,
              endTime: newEvent.end_time,
              venue: venue,
              room: newEvent.room,
              location: newEvent.location,
              instructions: newEvent.instructions
            }
          }).catch(() => {});
        }
      }
    } catch (notifErr) {
      console.warn('[AcademicEventController] Initial notification broadcast non-fatal error:', notifErr.message);
    }

    return successResponse(res, 201, 'Academic event created successfully', newEvent);
  } catch (err) {
    console.error('[AcademicEventController] createEvent error:', err);
    return errorResponse(res, 500, 'Failed to create academic event', err.message);
  }
};

/**
 * Update an existing academic event
 * PUT /api/academic-events/:id
 */
const updateEvent = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId) || eventId <= 0) {
      return errorResponse(res, 400, 'Invalid event ID');
    }

    const existing = await academicEventModel.getEventById(eventId, 'ADMIN');
    if (!existing) {
      return errorResponse(res, 404, 'Academic event not found');
    }

    // RBAC check: Teacher can only update their own created events
    if (req.user.role === 'TEACHER' && existing.created_by_user_id !== req.user.user_id) {
      return errorResponse(res, 403, 'You do not have permission to modify this event');
    }

    const {
      title = existing.title,
      description = existing.description,
      event_type = existing.event_type,
      exam_type = existing.exam_type,
      start_date = existing.start_date,
      end_date = existing.end_date,
      start_time = existing.start_time,
      end_time = existing.end_time,
      location = existing.location,
      room = existing.room,
      course_id = existing.course_id,
      department_id = existing.department_id,
      teacher_id = existing.teacher_id,
      class_name = existing.class_name,
      division = existing.division,
      semester = existing.semester,
      target_audience = existing.target_audience,
      instructions = existing.instructions
    } = req.body;

    if (!title || !title.trim()) {
      return errorResponse(res, 400, 'Title cannot be empty');
    }
    if (!event_type || !VALID_EVENT_TYPES.includes(event_type.toUpperCase())) {
      return errorResponse(res, 400, `Event type must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
    }
    if (!start_date || !DATE_REGEX.test(start_date.trim())) {
      return errorResponse(res, 400, 'Valid start date (YYYY-MM-DD) is required');
    }

    const finalEndDate = end_date && end_date.trim() ? end_date.trim() : start_date.trim();
    if (!DATE_REGEX.test(finalEndDate)) {
      return errorResponse(res, 400, 'Valid end date (YYYY-MM-DD) is required');
    }
    if (finalEndDate < start_date.trim()) {
      return errorResponse(res, 400, 'End date cannot be earlier than start date');
    }

    const normStartTime = start_time ? normalizeTime(start_time) : null;
    const normEndTime = end_time ? normalizeTime(end_time) : null;

    if (normStartTime && normEndTime && finalEndDate === start_date.trim() && normEndTime <= normStartTime) {
      return errorResponse(res, 400, 'End time must be after start time on the same date');
    }

    let finalAudience = target_audience ? target_audience.toUpperCase() : existing.target_audience;
    if (!VALID_AUDIENCES.includes(finalAudience)) {
      finalAudience = 'ALL';
    }

    const updatedEvent = await academicEventModel.updateEvent(eventId, {
      title: title.trim(),
      description: description ? description.trim() : null,
      event_type: event_type.toUpperCase(),
      exam_type: exam_type ? exam_type.trim() : null,
      start_date: start_date.trim(),
      end_date: finalEndDate,
      start_time: normStartTime,
      end_time: normEndTime,
      location: location ? location.trim() : null,
      room: room ? room.trim() : null,
      course_id: course_id ? parseInt(course_id, 10) : null,
      department_id: department_id ? parseInt(department_id, 10) : null,
      teacher_id: teacher_id ? parseInt(teacher_id, 10) : null,
      class_name: class_name ? class_name.trim() : null,
      division: division ? division.trim() : null,
      semester: semester ? parseInt(semester, 10) : null,
      target_audience: finalAudience,
      instructions: instructions ? instructions.trim() : null
    });

    // Create audit log
    await createAuditLog({
      req,
      action: 'ACADEMIC_EVENT_UPDATED',
      entity: 'ACADEMIC_EVENT',
      entityId: eventId,
      description: `Updated academic event "${updatedEvent.title}" (${updatedEvent.event_type})`,
      details: {
        event_id: eventId,
        title: updatedEvent.title,
        event_type: updatedEvent.event_type
      }
    });

    return successResponse(res, 200, 'Academic event updated successfully', updatedEvent);
  } catch (err) {
    console.error('[AcademicEventController] updateEvent error:', err);
    return errorResponse(res, 500, 'Failed to update academic event', err.message);
  }
};

/**
 * Delete an academic event
 * DELETE /api/academic-events/:id
 */
const deleteEvent = async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (isNaN(eventId) || eventId <= 0) {
      return errorResponse(res, 400, 'Invalid event ID');
    }

    const existing = await academicEventModel.getEventById(eventId, 'ADMIN');
    if (!existing) {
      return errorResponse(res, 404, 'Academic event not found');
    }

    // RBAC check: Teacher can only delete their own created events
    if (req.user.role === 'TEACHER' && existing.created_by_user_id !== req.user.user_id) {
      return errorResponse(res, 403, 'You do not have permission to delete this event');
    }

    await academicEventModel.deleteEvent(eventId);

    // Create audit log
    await createAuditLog({
      req,
      action: 'ACADEMIC_EVENT_DELETED',
      entity: 'ACADEMIC_EVENT',
      entityId: eventId,
      description: `Deleted academic event "${existing.title}" (${existing.event_type})`
    });

    return successResponse(res, 200, 'Academic event deleted successfully');
  } catch (err) {
    console.error('[AcademicEventController] deleteEvent error:', err);
    return errorResponse(res, 500, 'Failed to delete academic event', err.message);
  }
};

/**
 * Trigger automatic reminders
 * POST /api/academic-events/trigger-reminders
 */
const triggerReminders = async (req, res) => {
  try {
    const { event_id, reminder_type, user_id } = req.body || {};
    const result = await academicEventModel.triggerReminders({
      event_id: event_id ? Number(event_id) : undefined,
      reminder_type,
      user_id: user_id ? Number(user_id) : undefined
    });

    await createAuditLog({
      req,
      action: 'ACADEMIC_REMINDERS_TRIGGERED',
      entity: 'ACADEMIC_EVENT',
      description: `Triggered academic reminders: ${result.dispatchedCount} dispatched out of ${result.checkedCount} checks`,
      details: result
    });

    return successResponse(res, 200, 'Academic event reminders evaluated successfully', result);
  } catch (err) {
    console.error('[AcademicEventController] triggerReminders error:', err);
    return errorResponse(res, 500, 'Failed to trigger reminders', err.message);
  }
};

module.exports = {
  getEvents,
  getUpcomingEvents,
  getTodayEvents,
  getExams,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  triggerReminders
};
