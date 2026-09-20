const pool = require('../config/db');

/**
 * User Email Preference Model
 * Table: user_email_preferences
 * Database: student_portal_db
 * 
 * Strict parameterized SQL queries only.
 */

const ALLOWED_PREFERENCE_FIELDS = [
  'email_enabled',
  'assignment_emails',
  'exam_emails',
  'attendance_emails',
  'timetable_emails',
  'notice_emails',
  'feedback_emails',
  'academic_event_emails'
];

const NOTIFICATION_TYPE_CATEGORY_MAP = {
  NEW_ASSIGNMENT: 'assignment_emails',
  ASSIGNMENT_DUE_SOON: 'assignment_emails',
  ASSIGNMENT_OVERDUE: 'assignment_emails',
  ASSIGNMENT_EVALUATED: 'assignment_emails',
  NEW_RESULT: 'exam_emails',
  LOW_ATTENDANCE: 'attendance_emails',
  EXAM_REMINDER: 'exam_emails',
  EXAM_SCHEDULED: 'exam_emails',
  TIMETABLE_REMINDER: 'timetable_emails',
  NEW_NOTICE: 'notice_emails',
  NEW_FEEDBACK_FORM: 'feedback_emails',
  ACADEMIC_EVENT_REMINDER: 'academic_event_emails'
};

const DEFAULT_PREFERENCES = {
  email_enabled: true,
  assignment_emails: true,
  exam_emails: true,
  attendance_emails: true,
  timetable_emails: true,
  notice_emails: true,
  feedback_emails: true,
  academic_event_emails: true
};

/**
 * Creates default preference record for a user if one does not exist.
 * @param {number} userId 
 * @returns {Promise<object>}
 */
async function createDefaultPreferences(userId) {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) return null;

  const query = `
    INSERT INTO user_email_preferences (
      user_id,
      email_enabled,
      assignment_emails,
      exam_emails,
      attendance_emails,
      timetable_emails,
      notice_emails,
      feedback_emails,
      academic_event_emails
    ) VALUES (?, 1, 1, 1, 1, 1, 1, 1, 1)
    ON DUPLICATE KEY UPDATE user_id = user_id
  `;

  await pool.query(query, [uid]);
  return { ...DEFAULT_PREFERENCES };
}

/**
 * Retrieves email preferences for a user.
 * If no record exists yet, lazily initializes defaults.
 * @param {number} userId 
 * @returns {Promise<object>}
 */
async function getPreferences(userId) {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) return null;

  const query = `
    SELECT 
      email_enabled,
      assignment_emails,
      exam_emails,
      attendance_emails,
      timetable_emails,
      notice_emails,
      feedback_emails,
      academic_event_emails
    FROM user_email_preferences
    WHERE user_id = ?
    LIMIT 1
  `;

  const [rows] = await pool.query(query, [uid]);
  if (!rows[0]) {
    await createDefaultPreferences(uid);
    return { user_id: uid, ...DEFAULT_PREFERENCES };
  }

  const r = rows[0];
  return {
    user_id: uid,
    email_enabled: Boolean(r.email_enabled),
    assignment_emails: Boolean(r.assignment_emails),
    exam_emails: Boolean(r.exam_emails),
    attendance_emails: Boolean(r.attendance_emails),
    timetable_emails: Boolean(r.timetable_emails),
    notice_emails: Boolean(r.notice_emails),
    feedback_emails: Boolean(r.feedback_emails),
    academic_event_emails: Boolean(r.academic_event_emails)
  };
}

/**
 * Updates email preferences for a user with strict field and boolean validation.
 * @param {number} userId 
 * @param {object} preferences 
 * @returns {Promise<object>}
 */
async function updatePreferences(userId, preferences) {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) {
    const err = new Error('Invalid user ID provided');
    err.status = 400;
    throw err;
  }

  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    const err = new Error('Preferences payload must be an object');
    err.status = 400;
    throw err;
  }

  // Ensure record exists in database
  await getPreferences(uid);

  const allowedKeys = new Set(ALLOWED_PREFERENCE_FIELDS);
  const setClauses = [];
  const params = [];

  for (const [key, val] of Object.entries(preferences)) {
    if (!allowedKeys.has(key)) {
      const err = new Error(`Unexpected field '${key}' in preference payload`);
      err.status = 400;
      throw err;
    }

    let boolVal;
    if (typeof val === 'boolean') {
      boolVal = val;
    } else if (val === 1 || val === '1' || String(val).toLowerCase() === 'true') {
      boolVal = true;
    } else if (val === 0 || val === '0' || String(val).toLowerCase() === 'false') {
      boolVal = false;
    } else {
      const err = new Error(`Field '${key}' must be a boolean value`);
      err.status = 400;
      throw err;
    }

    setClauses.push(`${key} = ?`);
    params.push(boolVal ? 1 : 0);
  }

  if (setClauses.length > 0) {
    params.push(uid);
    const updateSql = `UPDATE user_email_preferences SET ${setClauses.join(', ')} WHERE user_id = ?`;
    await pool.query(updateSql, params);
  }

  return await getPreferences(uid);
}

/**
 * Checks whether outbound email notification is enabled for a given user and notification type.
 * @param {number} userId 
 * @param {string} notificationType 
 * @returns {Promise<boolean>}
 */
async function isEmailEnabledForNotification(userId, notificationType) {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) return false;

  const prefs = await getPreferences(uid);
  if (!prefs || !prefs.email_enabled) {
    return false;
  }

  const normType = String(notificationType || '').trim().toUpperCase();
  const categoryField = NOTIFICATION_TYPE_CATEGORY_MAP[normType];

  if (!categoryField) {
    // If no specific category mapping exists, respect master switch
    return Boolean(prefs.email_enabled);
  }

  return Boolean(prefs[categoryField]);
}

module.exports = {
  getPreferences,
  createDefaultPreferences,
  updatePreferences,
  isEmailEnabledForNotification,
  ALLOWED_PREFERENCE_FIELDS,
  NOTIFICATION_TYPE_CATEGORY_MAP,
  DEFAULT_PREFERENCES
};
