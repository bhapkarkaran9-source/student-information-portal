const pool = require('../config/db');
const emailService = require('./email.service');
const emailTemplates = require('./emailTemplates');

/**
 * Central Allowlist of email-eligible notification types.
 * Any notification type outside this list will not trigger an outbound email.
 */
const EMAIL_NOTIFICATION_ALLOWLIST = new Set([
  'NEW_ASSIGNMENT',
  'ASSIGNMENT_DUE_SOON',
  'ASSIGNMENT_OVERDUE',
  'ASSIGNMENT_EVALUATED',
  'NEW_RESULT',
  'LOW_ATTENDANCE',
  'EXAM_REMINDER',
  'EXAM_SCHEDULED',
  'TIMETABLE_REMINDER',
  'NEW_NOTICE',
  'NEW_FEEDBACK_FORM',
  'ACADEMIC_EVENT_REMINDER'
]);

/**
 * Checks whether a notification type is allowed to trigger email notifications.
 * @param {string} type 
 * @returns {boolean}
 */
function isEmailNotificationEnabled(type) {
  if (!type || typeof type !== 'string') return false;
  return EMAIL_NOTIFICATION_ALLOWLIST.has(type.trim().toUpperCase());
}

/**
 * Resolves canonical email notification type from notification_type, title, or metadata.
 * Allows graceful mapping of in-app notification types/titles to email templates.
 * 
 * @param {string} notificationType 
 * @param {string} [title=''] 
 * @param {object} [metadata=null] 
 * @returns {string|null}
 */
function resolveEmailNotificationType(notificationType, title = '', metadata = null) {
  // 1. Explicit override in metadata takes first precedence
  if (metadata && metadata.emailNotificationType) {
    const candidate = String(metadata.emailNotificationType).trim().toUpperCase();
    if (EMAIL_NOTIFICATION_ALLOWLIST.has(candidate)) return candidate;
  }

  // 2. Direct match on notificationType
  if (notificationType && typeof notificationType === 'string') {
    const raw = notificationType.trim().toUpperCase();
    if (EMAIL_NOTIFICATION_ALLOWLIST.has(raw)) return raw;
  }

  // 3. Normalized string matching
  const t = String(title || '').toLowerCase();
  const typeStr = String(notificationType || '').toLowerCase();

  if (typeStr.includes('assignment') || t.includes('assignment')) {
    if (t.includes('overdue')) return 'ASSIGNMENT_OVERDUE';
    if (t.includes('due soon') || t.includes('deadline')) return 'ASSIGNMENT_DUE_SOON';
    if (t.includes('evaluated') || t.includes('evaluation')) return 'ASSIGNMENT_EVALUATED';
    if (t.includes('new assignment') || t.startsWith('new assignment:')) return 'NEW_ASSIGNMENT';
    if (typeStr === 'new_assignment') return 'NEW_ASSIGNMENT';
  }

  if (typeStr.includes('exam_scheduled') || (typeStr.includes('exam') && t.includes('scheduled'))) {
    return 'EXAM_SCHEDULED';
  }

  if (typeStr.includes('exam') || t.includes('exam')) {
    return 'EXAM_REMINDER';
  }

  if (typeStr.includes('timetable') || typeStr.includes('lecture') || t.includes('lecture') || t.includes('class reminder')) {
    return 'TIMETABLE_REMINDER';
  }

  if (typeStr.includes('attendance') || t.includes('attendance')) {
    return 'LOW_ATTENDANCE';
  }

  if (typeStr.includes('result') || typeStr.includes('grade') || t.includes('result') || t.includes('grade')) {
    return 'NEW_RESULT';
  }

  if (typeStr.includes('notice') || t.includes('notice')) {
    return 'NEW_NOTICE';
  }

  if (typeStr.includes('feedback') || t.includes('feedback')) {
    return 'NEW_FEEDBACK_FORM';
  }

  if (typeStr.includes('event') || typeStr.includes('calendar') || t.includes('event')) {
    return 'ACADEMIC_EVENT_REMINDER';
  }

  return null;
}

/**
 * Builds a deterministic event key for race-condition-safe deduplication.
 * Distinguishes user + notification type + specific event.
 * 
 * @param {number} userId 
 * @param {string} notificationType 
 * @param {string|number} eventId 
 * @returns {string}
 */
function buildEventKey(userId, notificationType, eventId) {
  const cleanUser = parseInt(userId, 10) || 0;
  const cleanType = String(notificationType || 'NOTIFICATION').trim().toUpperCase();
  const cleanEvent = String(eventId !== undefined && eventId !== null ? eventId : 'DEFAULT').trim();
  return `${cleanUser}:${cleanType}:${cleanEvent}`;
}

/**
 * Resolves user from the database strictly server-side using userId.
 * Never trusts arbitrary client-supplied recipient email addresses.
 * 
 * @param {number} userId 
 * @returns {Promise<{ exists: boolean, isActive: boolean, email: string|null, username: string|null, fullName: string|null }>}
 */
async function resolveUserById(userId) {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) {
    return { exists: false, isActive: false, email: null, username: null, fullName: null };
  }

  const query = `
    SELECT 
      u.user_id, 
      u.email, 
      u.username, 
      u.is_active, 
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS full_name
    FROM users u
    WHERE u.user_id = ?
    LIMIT 1
  `;

  const [rows] = await pool.query(query, [uid]);
  if (!rows[0]) {
    return { exists: false, isActive: false, email: null, username: null, fullName: null };
  }

  return {
    exists: true,
    isActive: Boolean(rows[0].is_active),
    email: rows[0].email ? String(rows[0].email).trim() : null,
    username: rows[0].username,
    fullName: rows[0].full_name || rows[0].username
  };
}

/**
 * Computes a human-readable remaining time until a given due date.
 *
 * @param {string|Date} dueDate - The assignment target deadline
 * @returns {string|null}
 */
function computeRemainingTime(dueDate) {
  if (!dueDate) return null;
  const target = new Date(dueDate);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return 'Due now';

  const totalMins = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMins / (24 * 60));
  const hours = Math.floor((totalMins % (24 * 60)) / 60);
  const mins = totalMins % 60;

  if (days > 1) {
    return hours > 0 ? `${days} days, ${hours} hours` : `${days} days`;
  }
  if (days === 1) {
    return hours > 0 ? `1 day, ${hours} hours` : '1 day';
  }
  if (hours > 1) {
    return mins > 0 ? `${hours} hours, ${mins} mins` : `${hours} hours`;
  }
  if (hours === 1) {
    return mins > 0 ? `1 hour, ${mins} mins` : '1 hour';
  }
  if (mins > 1) {
    return `${mins} minutes`;
  }
  return 'Less than 1 minute';
}

/**
 * Computes a human-readable duration indicating how overdue an assignment is.
 *
 * @param {string|Date} dueDate - The assignment original deadline
 * @returns {string|null}
 */
function computeOverdueDuration(dueDate) {
  if (!dueDate) return null;
  const target = new Date(dueDate);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();
  if (diffMs <= 0) return 'Just passed';

  const totalMins = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMins / (24 * 60));
  const hours = Math.floor((totalMins % (24 * 60)) / 60);
  const mins = totalMins % 60;

  if (days > 1) {
    return hours > 0 ? `${days} days, ${hours} hours` : `${days} days`;
  }
  if (days === 1) {
    return hours > 0 ? `1 day, ${hours} hours` : '1 day';
  }
  if (hours > 1) {
    return mins > 0 ? `${hours} hours, ${mins} mins` : `${hours} hours`;
  }
  if (hours === 1) {
    return mins > 0 ? `1 hour, ${mins} mins` : '1 hour';
  }
  if (mins > 1) {
    return `${mins} minutes`;
  }
  return 'Just now';
}

/**
 * Maps event notification metadata to template variables.
 * 
 * @param {string} type 
 * @param {string} title 
 * @param {string} message 
 * @param {object} metadata 
 * @param {object} user 
 * @returns {object}
 */
function prepareTemplateVariables(type, title, message, meta = {}, user = {}) {
  const userName = user.fullName || user.username || 'User';

  const baseVars = {
    name: userName,
    username: user.username,
    title: title || 'Institutional Notification',
    message: message || ''
  };

  switch (type) {
    case 'NEW_ASSIGNMENT': {
      const dt = emailTemplates.formatDueDateTime(meta.dueDate || meta.due_date || meta.deadline, meta.dueTime || meta.due_time);
      return {
        ...baseVars,
        assignmentTitle: meta.assignmentTitle || meta.title || title,
        course: meta.course || meta.courseName || meta.course_code || 'Enrolled Course',
        dueDate: dt.date,
        dueTime: dt.time,
        dueDateTime: dt.formatted,
        deadline: dt.formatted,
        dueFormattedDate: dt.date,
        dueFormattedTime: dt.time,
        teacher: meta.teacher || meta.teacherName || meta.teacher_name || null
      };
    }

    case 'ASSIGNMENT_DUE_SOON': {
      const dt = emailTemplates.formatDueDateTime(meta.deadline || meta.dueDate || meta.due_date, meta.dueTime || meta.due_time);
      let rem = meta.remainingTime || meta.remaining || null;
      if (!rem && (meta.deadline || meta.dueDate || meta.due_date)) {
        rem = computeRemainingTime(meta.deadline || meta.dueDate || meta.due_date);
      }
      return {
        ...baseVars,
        assignmentTitle: meta.assignmentTitle || meta.title || title,
        course: meta.course || meta.courseName || meta.course_code || 'Course',
        dueDate: dt.date,
        dueTime: dt.time,
        dueDateTime: dt.formatted,
        deadline: dt.formatted,
        dueFormattedDate: dt.date,
        dueFormattedTime: dt.time,
        remainingTime: rem
      };
    }

    case 'ASSIGNMENT_OVERDUE': {
      const dt = emailTemplates.formatDueDateTime(meta.dueDate || meta.due_date || meta.deadline, meta.dueTime || meta.due_time);
      let ovr = meta.overdueDuration || meta.overdue || null;
      if (!ovr && (meta.dueDate || meta.due_date || meta.deadline)) {
        ovr = computeOverdueDuration(meta.dueDate || meta.due_date || meta.deadline);
      }
      return {
        ...baseVars,
        assignmentTitle: meta.assignmentTitle || meta.title || title,
        course: meta.course || meta.courseName || meta.course_code || 'Course',
        dueDate: dt.date,
        dueTime: dt.time,
        dueDateTime: dt.formatted,
        deadline: dt.formatted,
        dueFormattedDate: dt.date,
        dueFormattedTime: dt.time,
        overdueDuration: ovr
      };
    }

    case 'ASSIGNMENT_EVALUATED':
      return {
        ...baseVars,
        assignmentTitle: meta.assignmentTitle || meta.title || title,
        marks: meta.marks !== undefined ? meta.marks : (meta.marksObtained !== undefined ? `${meta.marksObtained} / ${meta.maxMarks || 100}` : 'Available in portal'),
        feedback: meta.feedback || null
      };

    case 'NEW_RESULT':
      return {
        ...baseVars,
        course: meta.course || meta.courseName || title,
        grade: meta.grade || meta.marks || 'Available in portal'
      };

    case 'LOW_ATTENDANCE':
      return {
        ...baseVars,
        course: meta.course || meta.courseName || 'Course',
        attendancePercentage: meta.attendancePercentage || meta.percentage || 'Below threshold',
        threshold: meta.threshold || '75%'
      };

    case 'EXAM_REMINDER': {
      const reminderType = meta.reminderType || meta.reminder_type || null;
      let reminderText = meta.reminderText || null;
      if (!reminderText && reminderType) {
        const typeUpper = String(reminderType).toUpperCase();
        if (typeUpper.includes('1_DAY') || typeUpper.includes('TOMORROW')) {
          reminderText = 'This is a reminder that your examination is scheduled for tomorrow.';
        } else if (typeUpper.includes('STARTING')) {
          reminderText = 'This is an urgent reminder that your examination is starting now. Please report to the examination hall immediately.';
        }
      }
      return {
        ...baseVars,
        examName: meta.examName || meta.title || title,
        course: meta.course || meta.courseName || meta.course_code || null,
        date: meta.date || meta.examDate || meta.start_date || 'Scheduled Date',
        time: meta.time || meta.examTime || meta.start_time || 'Scheduled Time',
        venue: meta.venue || meta.room || meta.location || 'Examination Hall',
        reminderType: reminderType,
        reminderText: reminderText
      };
    }

    case 'EXAM_SCHEDULED':
      return {
        ...baseVars,
        examName: meta.examName || meta.title || title,
        title: meta.examName || meta.title || title,
        course: meta.course || meta.courseName || meta.course_code || 'Course',
        courseCode: meta.courseCode || meta.course_code || null,
        courseName: meta.courseName || null,
        date: meta.date || meta.examDate || meta.start_date || 'Scheduled Date',
        examDate: meta.date || meta.examDate || meta.start_date || 'Scheduled Date',
        time: meta.time || meta.examTime || meta.start_time || 'Scheduled Time',
        startTime: meta.startTime || meta.time || null,
        endTime: meta.endTime || null,
        venue: meta.venue || meta.room || meta.location || 'Examination Hall',
        room: meta.room || null,
        location: meta.location || null,
        instructions: meta.instructions || null
      };

    case 'TIMETABLE_REMINDER': {
      const courseStr = meta.course || (meta.courseCode && meta.courseName ? `${meta.courseCode} - ${meta.courseName}` : (meta.courseName || meta.courseCode || title));
      const lectureDateRaw = meta.lectureDate || meta.date || meta.startDate || 'Scheduled Date';
      const formattedDate = emailTemplates.formatDueDateTime ? emailTemplates.formatDueDateTime(lectureDateRaw).date : lectureDateRaw;
      const startTimeStr = meta.startTime || meta.time || meta.start_time || 'Scheduled Time';
      const endTimeStr = meta.endTime || meta.end_time || null;
      const formattedTime = meta.time || (endTimeStr ? `${startTimeStr} - ${endTimeStr}` : startTimeStr);
      const reminderMsg = meta.reminderMessage || meta.message || message || 'You have an upcoming lecture scheduled according to your timetable.';

      return {
        ...baseVars,
        course: courseStr,
        courseCode: meta.courseCode || meta.course_code || null,
        courseName: meta.courseName || meta.course_name || null,
        teacher: meta.teacher || meta.teacherName || meta.instructor || 'Faculty Instructor',
        teacherName: meta.teacher || meta.teacherName || meta.instructor || 'Faculty Instructor',
        date: formattedDate,
        lectureDate: formattedDate,
        time: formattedTime,
        startTime: startTimeStr,
        endTime: endTimeStr,
        room: meta.room || meta.location || 'Assigned Classroom',
        location: meta.location || meta.room || 'Assigned Classroom',
        reminderType: meta.reminderType || null,
        reminderMessage: reminderMsg,
        message: reminderMsg
      };
    }

    case 'NEW_NOTICE': {
      const pubDate = meta.publishedDate || meta.published_at || meta.publishedAt || meta.date || meta.created_at || meta.createdAt || new Date();
      const dt = emailTemplates.formatDueDateTime(pubDate);
      const category = meta.category || meta.noticeCategory || (meta.target_role && meta.target_role !== 'ALL' ? meta.target_role : null) || null;
      const description = meta.description || meta.content || meta.summary || meta.message || message || 'A new notice has been published on the bulletin board.';
      return {
        ...baseVars,
        noticeTitle: meta.noticeTitle || meta.title || title,
        title: meta.noticeTitle || meta.title || title,
        description: description,
        summary: description,
        publishedDate: dt.date,
        publishedDateTime: dt.formatted,
        publishedAt: dt.formatted,
        category: category,
        noticeCategory: category
      };
    }

    case 'NEW_FEEDBACK_FORM': {
      const deadlineVal = meta.deadline || meta.endDate || meta.end_date || meta.submissionDeadline || null;
      const dt = deadlineVal ? emailTemplates.formatDueDateTime(deadlineVal) : null;
      const formattedDeadline = dt ? dt.formatted : (deadlineVal ? String(deadlineVal) : 'Active Period');

      let targetInfo = meta.targetInfo || meta.targetLabel || null;
      if (!targetInfo) {
        if (meta.course || meta.courseName || meta.course_code) {
          targetInfo = `Course: ${meta.course || meta.courseName || meta.course_code}`;
        } else if (meta.teacher || meta.teacherName) {
          targetInfo = `Teacher: ${meta.teacher || meta.teacherName}`;
        } else if (meta.target_type || meta.targetType) {
          targetInfo = `Target: ${(meta.target_type || meta.targetType).toUpperCase()}`;
        }
      }

      const formId = meta.formId || meta.feedback_form_id || meta.feedbackFormId || meta.id || null;
      const formPath = meta.formPath || meta.formUrl || (formId ? `/feedback/forms/${formId}` : '/feedback/forms');
      const description = meta.description || meta.instructions || meta.content || meta.summary || meta.message || message || 'Please take a moment to provide your valuable feedback.';

      return {
        ...baseVars,
        feedbackTitle: meta.feedbackTitle || meta.title || title,
        title: meta.feedbackTitle || meta.title || title,
        description: description,
        instructions: description,
        deadline: formattedDeadline,
        submissionDeadline: formattedDeadline,
        targetInfo: targetInfo,
        targetType: meta.target_type || meta.targetType || null,
        course: meta.course || meta.courseName || null,
        teacher: meta.teacher || meta.teacherName || null,
        formId: formId,
        formPath: formPath,
        formUrl: formPath
      };
    }

    case 'ACADEMIC_EVENT_REMINDER':
      return {
        ...baseVars,
        eventTitle: meta.eventTitle || meta.title || title,
        title: meta.eventTitle || meta.title || title,
        date: meta.date || meta.startDate || meta.start_date || 'Scheduled Date',
        time: meta.time || meta.startTime || meta.start_time || null,
        location: meta.location || meta.room || meta.venue || null,
        venue: meta.venue || meta.location || meta.room || null,
        description: meta.description || null,
        reminderMessage: meta.reminderMessage || meta.reminderText || 'This is a reminder that your academic event is scheduled for tomorrow.',
        reminderText: meta.reminderMessage || meta.reminderText || 'This is a reminder that your academic event is scheduled for tomorrow.'
      };

    default:
      return baseVars;
  }
}

/**
 * Sends an email for an in-app notification event.
 * Fully failure-isolated: never throws an unhandled exception to caller.
 * 
 * @param {object} params
 * @param {number} params.userId - Target user ID (resolved server-side)
 * @param {string} params.notificationType - Event notification type
 * @param {string} params.title - Notification title
 * @param {string} [params.message=''] - Notification message body
 * @param {object} [params.metadata={}] - Event metadata (eventId, dates, courses, etc.)
 * @returns {Promise<{ success: boolean, skipped?: boolean, status: string, error?: string, logId?: number, duplicate?: boolean }>}
 */
async function sendNotificationEmail({
  userId,
  user_id,
  notificationType,
  type,
  title,
  message = '',
  metadata = {}
}) {
  const targetUserId = userId !== undefined ? userId : user_id;
  const targetType = notificationType || type;

  try {
    // 1. Resolve canonical email notification type
    const canonicalType = resolveEmailNotificationType(targetType, title, metadata);

    // 2. Check allowlist eligibility
    if (!canonicalType || !isEmailNotificationEnabled(canonicalType)) {
      return {
        success: false,
        skipped: true,
        status: 'SKIPPED',
        reason: 'NOT_IN_ALLOWLIST',
        message: `Notification type '${targetType}' is not eligible for email delivery`
      };
    }

    // 3. Resolve user email strictly from database
    const user = await resolveUserById(targetUserId);
    if (!user.exists || !user.isActive || !user.email) {
      return {
        success: false,
        skipped: true,
        status: 'SKIPPED',
        reason: 'USER_NOT_ELIGIBLE',
        message: 'Recipient user does not exist, is inactive, or has no valid email address'
      };
    }

    // 4. Validate email format
    if (!emailService.isValidEmail(user.email)) {
      return {
        success: false,
        skipped: true,
        status: 'SKIPPED',
        reason: 'INVALID_EMAIL_FORMAT',
        message: 'Recipient email format is invalid'
      };
    }

    // 4.5. Check User Email Notification Preferences (Step 7D)
    const emailPreferenceModel = require('../models/emailPreference.model');
    const isPreferenceEnabled = await emailPreferenceModel.isEmailEnabledForNotification(targetUserId, canonicalType);
    if (!isPreferenceEnabled && !metadata?.ignorePreferences) {
      return {
        success: false,
        skipped: true,
        status: 'SKIPPED',
        reason: 'EMAIL_PREFERENCE_DISABLED',
        message: `Email delivery skipped: user preference disabled for ${canonicalType}`
      };
    }

    // 5. Build event key for race-condition-safe deduplication
    const eventId = metadata?.eventId || metadata?.assignment_id || metadata?.event_id || metadata?.timetable_id || metadata?.feedback_id || metadata?.notice_id || metadata?.notificationId || 'default';
    const eventKey = buildEventKey(targetUserId, canonicalType, eventId);

    // 6. Prepare template variables and render template
    const templateVars = prepareTemplateVariables(canonicalType, title, message, metadata, user);

    let rendered;
    try {
      rendered = emailTemplates.renderTemplate(canonicalType, templateVars);
    } catch (tmplErr) {
      return {
        success: false,
        status: 'FAILED',
        error: `Template rendering failed: ${emailService.sanitizeErrorMessage(tmplErr)}`
      };
    }

    // 7. Call existing email.service.js with eventKey and options
    const emailResult = await emailService.sendEmail(
      user.email,
      rendered.subject,
      rendered.html,
      rendered.text,
      {
        userId: user.exists ? parseInt(targetUserId, 10) : null,
        emailType: canonicalType,
        eventKey: eventKey,
        transporterOverride: metadata?.transporterOverride || null,
        forceSend: Boolean(metadata?.forceSend)
      }
    );

    return emailResult;
  } catch (outerErr) {
    // 8. Zero failure coupling: return safe failure object without throwing
    console.warn('[NotificationEmailService] sendNotificationEmail caught unexpected error:', outerErr.message);
    return {
      success: false,
      status: 'FAILED',
      error: emailService.sanitizeErrorMessage(outerErr)
    };
  }
}

module.exports = {
  sendNotificationEmail,
  isEmailNotificationEnabled,
  resolveEmailNotificationType,
  buildEventKey,
  resolveUserById,
  computeRemainingTime,
  computeOverdueDuration,
  EMAIL_NOTIFICATION_ALLOWLIST
};
