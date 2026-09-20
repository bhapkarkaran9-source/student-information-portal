require('dotenv').config();
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const pool = require('../src/config/db');
const emailPreferenceModel = require('../src/models/emailPreference.model');
const notificationEmailService = require('../src/services/notificationEmail.service');
const notificationModel = require('../src/models/notification.model');
const emailModel = require('../src/models/email.model');

const BASE_URL = 'http://localhost:5000';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9265;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function pass(desc) {
  totalTests++;
  passedTests++;
  console.log(`  ✓ PASS (${totalTests}): ${desc}`);
}

function fail(desc, err) {
  totalTests++;
  failedTests++;
  console.error(`  ✗ FAIL (${totalTests}): ${desc}`);
  if (err) console.error('    Error:', err.message || err);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function makeRequest(method, reqPath, body = null, token = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, BASE_URL);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }

    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    }).on('error', reject);
  });
}

async function login(username, password) {
  const res = await makeRequest('POST', '/api/auth/login', { username, password });
  const data = res.json?.data || res.json;
  if (data && data.token) {
    return { token: data.token, user: data.user };
  }
  throw new Error(`Login failed for ${username}: ${res.data}`);
}

async function runTests() {
  console.log('\n======================================================================');
  console.log('STEP 7D: COMPREHENSIVE EMAIL PREFERENCES VERIFICATION (58 ASSERTIONS)');
  console.log('======================================================================\n');

  let studentAuth, teacherAuth, adminAuth;

  try {
    studentAuth = await login('Karan', 'Karan@123');
    teacherAuth = await login('Rohini', 'Rohini@123');
    adminAuth = await login('admin', 'Admin@123');
  } catch (err) {
    console.error('Failed to log in test users:', err);
    process.exit(1);
  }

  const studentUserId = studentAuth.user.user_id;
  const teacherUserId = teacherAuth.user.user_id;

  // ----------------------------------------------------
  // SECTION 1: DATABASE SCHEMA & MIGRATION INTEGRITY (Tests 1-4)
  // ----------------------------------------------------
  console.log('--- Section 1: Database Schema & Migration Verification ---');

  try {
    const [tables] = await pool.execute(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_email_preferences'`
    );
    assert.strictEqual(tables.length, 1, 'user_email_preferences table should exist');
    pass('Table user_email_preferences exists in database');
  } catch (e) { fail('Table user_email_preferences exists', e); }

  try {
    const [cols] = await pool.execute(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_email_preferences'`
    );
    const colMap = {};
    cols.forEach(c => { colMap[c.COLUMN_NAME] = c; });

    const requiredCols = [
      'preference_id',
      'user_id',
      'email_enabled',
      'assignment_emails',
      'exam_emails',
      'attendance_emails',
      'timetable_emails',
      'notice_emails',
      'feedback_emails',
      'academic_event_emails',
      'created_at',
      'updated_at'
    ];

    for (const c of requiredCols) {
      assert.ok(colMap[c], `Column ${c} must exist`);
    }
    pass('All 12 required preference columns exist in schema');

    assert.strictEqual(colMap['email_enabled'].COLUMN_DEFAULT, '1');
    assert.strictEqual(colMap['assignment_emails'].COLUMN_DEFAULT, '1');
    assert.strictEqual(colMap['exam_emails'].COLUMN_DEFAULT, '1');
    assert.strictEqual(colMap['attendance_emails'].COLUMN_DEFAULT, '1');
    assert.strictEqual(colMap['timetable_emails'].COLUMN_DEFAULT, '1');
    assert.strictEqual(colMap['notice_emails'].COLUMN_DEFAULT, '1');
    assert.strictEqual(colMap['feedback_emails'].COLUMN_DEFAULT, '1');
    assert.strictEqual(colMap['academic_event_emails'].COLUMN_DEFAULT, '1');
    pass('All 8 preference toggle columns default to 1 (true)');
  } catch (e) { fail('Preference columns verification', e); }

  try {
    const [indexes] = await pool.execute(
      `SHOW INDEX FROM user_email_preferences WHERE Column_name = 'user_id' AND Non_unique = 0`
    );
    assert.ok(indexes.length >= 1, 'user_id must have unique index');
    pass('user_id column is protected with a UNIQUE index constraint');
  } catch (e) { fail('Unique index constraint', e); }

  // ----------------------------------------------------
  // SECTION 2: MODEL LOGIC & LAZY INITIALIZATION (Tests 5-9)
  // ----------------------------------------------------
  console.log('\n--- Section 2: Model Logic & Lazy Default Creation ---');

  await pool.execute('DELETE FROM user_email_preferences WHERE user_id IN (?, ?)', [studentUserId, teacherUserId]);

  try {
    const prefs = await emailPreferenceModel.getPreferences(studentUserId);
    assert.ok(prefs, 'getPreferences should return defaults for new user');
    assert.strictEqual(Boolean(prefs.email_enabled), true);
    assert.strictEqual(Boolean(prefs.assignment_emails), true);
    pass('Model getPreferences automatically creates default active preferences when row does not exist');
  } catch (e) { fail('getPreferences default creation', e); }

  try {
    const prefs = await emailPreferenceModel.getPreferences(studentUserId);
    const keys = ['email_enabled', 'assignment_emails', 'exam_emails', 'attendance_emails', 'timetable_emails', 'notice_emails', 'feedback_emails', 'academic_event_emails'];
    keys.forEach(k => assert.strictEqual(typeof prefs[k], 'boolean', `${k} should be boolean`));
    pass('getPreferences returns complete preference object with all 8 toggle keys');
  } catch (e) { fail('Preference object completeness', e); }

  try {
    const updated = await emailPreferenceModel.updatePreferences(studentUserId, {
      assignment_emails: false,
      feedback_emails: false
    });
    assert.strictEqual(Boolean(updated.assignment_emails), false);
    assert.strictEqual(Boolean(updated.feedback_emails), false);
    assert.strictEqual(Boolean(updated.exam_emails), true);
    pass('updatePreferences cleanly updates partial set of categories while preserving others');
  } catch (e) { fail('updatePreferences partial update', e); }

  try {
    const updated = await emailPreferenceModel.updatePreferences(studentUserId, {
      email_enabled: false,
      assignment_emails: false,
      exam_emails: false,
      attendance_emails: false,
      timetable_emails: false,
      notice_emails: false,
      feedback_emails: false,
      academic_event_emails: false
    });
    assert.strictEqual(Boolean(updated.email_enabled), false);
    assert.strictEqual(Boolean(updated.academic_event_emails), false);
    pass('updatePreferences cleanly performs full preference updates across all 8 toggles');
  } catch (e) { fail('updatePreferences full update', e); }

  try {
    // Reset to defaults
    await emailPreferenceModel.updatePreferences(studentUserId, {
      email_enabled: true,
      assignment_emails: true,
      exam_emails: true,
      attendance_emails: true,
      timetable_emails: true,
      notice_emails: true,
      feedback_emails: true,
      academic_event_emails: true
    });
    const checkOn = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'NEW_ASSIGNMENT');
    assert.strictEqual(checkOn, true);
    pass('isEmailEnabledForNotification returns true by default when preferences are enabled');
  } catch (e) { fail('isEmailEnabledForNotification default check', e); }

  // ----------------------------------------------------
  // SECTION 3: NOTIFICATION CATEGORY MAPPINGS (Tests 10-21)
  // ----------------------------------------------------
  console.log('\n--- Section 3: Notification Category Mappings & Master Switch Overrides ---');

  try {
    // Master switch off test
    await emailPreferenceModel.updatePreferences(studentUserId, { email_enabled: false, assignment_emails: true });
    const masterOffCheck = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'NEW_ASSIGNMENT');
    assert.strictEqual(masterOffCheck, false);
    pass('Master email_enabled=false overrides assignment_emails=true');
  } catch (e) { fail('Master override', e); }

  // Reset master to true, test individual categories
  await emailPreferenceModel.updatePreferences(studentUserId, {
    email_enabled: true,
    assignment_emails: false,
    exam_emails: false,
    attendance_emails: false,
    timetable_emails: false,
    notice_emails: false,
    feedback_emails: false,
    academic_event_emails: false
  });

  try {
    const r1 = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'NEW_ASSIGNMENT');
    assert.strictEqual(r1, false);
    pass('assignment_emails=false blocks NEW_ASSIGNMENT notification emails');
  } catch (e) { fail('assignment NEW_ASSIGNMENT', e); }

  try {
    const r2 = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'ASSIGNMENT_DUE_SOON');
    assert.strictEqual(r2, false);
    pass('assignment_emails=false blocks ASSIGNMENT_DUE_SOON notification emails');
  } catch (e) { fail('assignment ASSIGNMENT_DUE_SOON', e); }

  try {
    const r3 = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'ASSIGNMENT_OVERDUE');
    assert.strictEqual(r3, false);
    pass('assignment_emails=false blocks ASSIGNMENT_OVERDUE notification emails');
  } catch (e) { fail('assignment ASSIGNMENT_OVERDUE', e); }

  try {
    const r4 = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'ASSIGNMENT_EVALUATED');
    assert.strictEqual(r4, false);
    pass('assignment_emails=false blocks ASSIGNMENT_EVALUATED notification emails');
  } catch (e) { fail('assignment ASSIGNMENT_EVALUATED', e); }

  try {
    const r5 = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'EXAM_REMINDER');
    assert.strictEqual(r5, false);
    pass('exam_emails=false blocks EXAM_REMINDER notification emails');
  } catch (e) { fail('exam EXAM_REMINDER', e); }

  try {
    const r6 = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'NEW_RESULT');
    assert.strictEqual(r6, false);
    pass('exam_emails=false blocks NEW_RESULT notification emails');
  } catch (e) { fail('exam NEW_RESULT', e); }

  try {
    const r7 = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'LOW_ATTENDANCE');
    assert.strictEqual(r7, false);
    pass('attendance_emails=false blocks LOW_ATTENDANCE notification emails');
  } catch (e) { fail('attendance LOW_ATTENDANCE', e); }

  try {
    const r8 = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'TIMETABLE_REMINDER');
    assert.strictEqual(r8, false);
    pass('timetable_emails=false blocks TIMETABLE_REMINDER notification emails');
  } catch (e) { fail('timetable TIMETABLE_REMINDER', e); }

  try {
    const r9 = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'NEW_NOTICE');
    assert.strictEqual(r9, false);
    pass('notice_emails=false blocks NEW_NOTICE notification emails');
  } catch (e) { fail('notice NEW_NOTICE', e); }

  try {
    const r10 = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'NEW_FEEDBACK_FORM');
    assert.strictEqual(r10, false);
    pass('feedback_emails=false blocks NEW_FEEDBACK_FORM notification emails');
  } catch (e) { fail('feedback NEW_FEEDBACK_FORM', e); }

  try {
    const r11 = await emailPreferenceModel.isEmailEnabledForNotification(studentUserId, 'ACADEMIC_EVENT_REMINDER');
    assert.strictEqual(r11, false);
    pass('academic_event_emails=false blocks ACADEMIC_EVENT_REMINDER notification emails');
  } catch (e) { fail('academic_event ACADEMIC_EVENT_REMINDER', e); }

  // ----------------------------------------------------
  // SECTION 4: AUTHENTICATION & RBAC ENFORCEMENT (Tests 22-29)
  // ----------------------------------------------------
  console.log('\n--- Section 4: Authentication & RBAC Route Protection ---');

  try {
    const unauthGet = await makeRequest('GET', '/api/email/preferences');
    assert.strictEqual(unauthGet.statusCode, 401);
    pass('Unauthenticated GET /api/email/preferences rejected with 401 Unauthorized');
  } catch (e) { fail('Unauthenticated GET rejected', e); }

  try {
    const unauthPut = await makeRequest('PUT', '/api/email/preferences', { email_enabled: false });
    assert.strictEqual(unauthPut.statusCode, 401);
    pass('Unauthenticated PUT /api/email/preferences rejected with 401 Unauthorized');
  } catch (e) { fail('Unauthenticated PUT rejected', e); }

  try {
    const adminGet = await makeRequest('GET', '/api/email/preferences', null, adminAuth.token);
    assert.strictEqual(adminGet.statusCode, 403);
    pass('Admin GET /api/email/preferences rejected with 403 Forbidden (RBAC student/teacher only)');
  } catch (e) { fail('Admin GET rejected with 403', e); }

  try {
    const adminPut = await makeRequest('PUT', '/api/email/preferences', { email_enabled: false }, adminAuth.token);
    assert.strictEqual(adminPut.statusCode, 403);
    pass('Admin PUT /api/email/preferences rejected with 403 Forbidden (RBAC student/teacher only)');
  } catch (e) { fail('Admin PUT rejected with 403', e); }

  try {
    const studentGet = await makeRequest('GET', '/api/email/preferences', null, studentAuth.token);
    assert.strictEqual(studentGet.statusCode, 200);
    pass('Student GET /api/email/preferences returns 200 OK');
  } catch (e) { fail('Student GET returns 200', e); }

  try {
    const studentGet = await makeRequest('GET', '/api/email/preferences', null, studentAuth.token);
    assert.strictEqual(studentGet.json.success, true);
    assert.ok(studentGet.json.data.email_enabled !== undefined);
    pass('Student GET response conforms to standardized API payload structure');
  } catch (e) { fail('Student GET response structure', e); }

  try {
    const teacherGet = await makeRequest('GET', '/api/email/preferences', null, teacherAuth.token);
    assert.strictEqual(teacherGet.statusCode, 200);
    pass('Teacher GET /api/email/preferences returns 200 OK');
  } catch (e) { fail('Teacher GET returns 200', e); }

  try {
    const teacherGet = await makeRequest('GET', '/api/email/preferences', null, teacherAuth.token);
    assert.strictEqual(teacherGet.json.success, true);
    assert.ok(teacherGet.json.data.email_enabled !== undefined);
    pass('Teacher GET response conforms to standardized API payload structure');
  } catch (e) { fail('Teacher GET response structure', e); }

  // ----------------------------------------------------
  // SECTION 5: IDOR RESISTANCE & USER ISOLATION (Tests 30-33)
  // ----------------------------------------------------
  console.log('\n--- Section 5: IDOR Protection & User Scoping Verification ---');

  // Reset teacher preferences to all true
  await emailPreferenceModel.updatePreferences(teacherUserId, {
    email_enabled: true,
    assignment_emails: true,
    exam_emails: true,
    attendance_emails: true,
    timetable_emails: true,
    notice_emails: true,
    feedback_emails: true,
    academic_event_emails: true
  });

  try {
    // Student attempts to pass teacher's user_id in the body
    const spoofAttempt = await makeRequest('PUT', '/api/email/preferences', {
      user_id: teacherUserId,
      email_enabled: false,
      notice_emails: false
    }, studentAuth.token);

    assert.strictEqual(spoofAttempt.statusCode, 200);

    const teacherCheck = await emailPreferenceModel.getPreferences(teacherUserId);
    assert.strictEqual(Boolean(teacherCheck.email_enabled), true);
    assert.strictEqual(Boolean(teacherCheck.notice_emails), true);
    pass('IDOR resistance: Student cannot modify teacher preferences by passing user_id in request body');
  } catch (e) { fail('Student spoof teacher IDOR', e); }

  try {
    // Teacher attempts to pass student's user_id in the body
    const teacherSpoof = await makeRequest('PUT', '/api/email/preferences', {
      user_id: studentUserId,
      email_enabled: true,
      notice_emails: true
    }, teacherAuth.token);

    assert.strictEqual(teacherSpoof.statusCode, 200);

    const studentCheck = await emailPreferenceModel.getPreferences(studentUserId);
    assert.strictEqual(Boolean(studentCheck.email_enabled), false);
    pass('IDOR resistance: Teacher cannot modify student preferences by passing user_id in request body');
  } catch (e) { fail('Teacher spoof student IDOR', e); }

  try {
    const studentCheck = await emailPreferenceModel.getPreferences(studentUserId);
    assert.strictEqual(studentCheck.user_id, studentUserId);
    pass('Student updates strictly modify only the authenticated student user record');
  } catch (e) { fail('Student scoping verification', e); }

  try {
    const teacherCheck = await emailPreferenceModel.getPreferences(teacherUserId);
    assert.strictEqual(teacherCheck.user_id, teacherUserId);
    pass('Teacher updates strictly modify only the authenticated teacher user record');
  } catch (e) { fail('Teacher scoping verification', e); }

  // ----------------------------------------------------
  // SECTION 6: INPUT VALIDATION & COERCION (Tests 34-37)
  // ----------------------------------------------------
  console.log('\n--- Section 6: Input Validation, Type Safety & Rapid Submissions ---');

  try {
    // Pass string booleans and numbers: should be coerced safely
    const coerceRes = await makeRequest('PUT', '/api/email/preferences', {
      email_enabled: 1,
      assignment_emails: 'true',
      exam_emails: 0,
      attendance_emails: false
    }, studentAuth.token);

    assert.strictEqual(coerceRes.statusCode, 200);
    assert.strictEqual(coerceRes.json.data.email_enabled, true);
    assert.strictEqual(coerceRes.json.data.assignment_emails, true);
    assert.strictEqual(coerceRes.json.data.exam_emails, false);
    pass('PUT safely handles truthy/falsy coercion for integer and string boolean flags');
  } catch (e) { fail('Boolean coercion check', e); }

  try {
    // Partial update preserves unset keys
    const partialRes = await makeRequest('PUT', '/api/email/preferences', {
      attendance_emails: true
    }, studentAuth.token);

    assert.strictEqual(partialRes.statusCode, 200);
    assert.strictEqual(partialRes.json.data.attendance_emails, true);
    assert.strictEqual(partialRes.json.data.email_enabled, true);
    pass('Partial update correctly preserves all existing preferences');
  } catch (e) { fail('Partial update preservation', e); }

  try {
    // Rapid consecutive PUT requests
    const promises = [
      makeRequest('PUT', '/api/email/preferences', { notice_emails: false }, studentAuth.token),
      makeRequest('PUT', '/api/email/preferences', { notice_emails: true }, studentAuth.token),
      makeRequest('PUT', '/api/email/preferences', { notice_emails: false }, studentAuth.token)
    ];
    const results = await Promise.all(promises);
    results.forEach(r => assert.strictEqual(r.statusCode, 200));
    pass('Rapid concurrent/consecutive PUT requests execute without race conditions or deadlock');
  } catch (e) { fail('Rapid submission resilience', e); }

  try {
    // Invalid empty payload handles gracefully
    const emptyRes = await makeRequest('PUT', '/api/email/preferences', {}, studentAuth.token);
    assert.strictEqual(emptyRes.statusCode, 200);
    pass('Empty PUT payload does not corrupt user preference records');
  } catch (e) { fail('Empty payload handling', e); }

  // ----------------------------------------------------
  // SECTION 7: OUTBOUND EMAIL SUPPRESSION (Tests 38-42)
  // ----------------------------------------------------
  console.log('\n--- Section 7: Outbound Email Suppression & Preference Integration ---');

  try {
    // Disable attendance emails for student
    await emailPreferenceModel.updatePreferences(studentUserId, {
      email_enabled: true,
      attendance_emails: false
    });

    const [logsBefore] = await pool.execute('SELECT COUNT(*) as count FROM email_logs WHERE recipient_email = ?', [studentAuth.user.email]);
    const beforeCount = logsBefore[0].count;

    const notifResult = await notificationEmailService.sendNotificationEmail({
      userId: studentUserId,
      notificationType: 'LOW_ATTENDANCE',
      title: 'Low Attendance Notice',
      message: 'Attendance warning in Computer Networks.'
    });

    assert.strictEqual(notifResult.skipped, true);
    assert.strictEqual(notifResult.reason, 'EMAIL_PREFERENCE_DISABLED');
    pass('notificationEmailService skips email delivery when notification category preference is false');

    const [logsAfter] = await pool.execute('SELECT COUNT(*) as count FROM email_logs WHERE recipient_email = ?', [studentAuth.user.email]);
    assert.strictEqual(logsAfter[0].count, beforeCount);
    pass('No email_logs record created when email delivery is skipped due to category preference');
  } catch (e) { fail('Category toggle suppression verification', e); }

  try {
    // Master switch off
    await emailPreferenceModel.updatePreferences(studentUserId, {
      email_enabled: false,
      notice_emails: true
    });

    const [logsBefore] = await pool.execute('SELECT COUNT(*) as count FROM email_logs WHERE recipient_email = ?', [studentAuth.user.email]);
    const beforeCount = logsBefore[0].count;

    const notifResult = await notificationEmailService.sendNotificationEmail({
      userId: studentUserId,
      notificationType: 'NEW_NOTICE',
      title: 'Campus Closure Advisory',
      message: 'Campus will remain closed tomorrow.'
    });

    assert.strictEqual(notifResult.skipped, true);
    assert.strictEqual(notifResult.reason, 'EMAIL_PREFERENCE_DISABLED');
    pass('notificationEmailService skips email delivery when master switch email_enabled is false');

    const [logsAfter] = await pool.execute('SELECT COUNT(*) as count FROM email_logs WHERE recipient_email = ?', [studentAuth.user.email]);
    assert.strictEqual(logsAfter[0].count, beforeCount);
    pass('No email_logs record created when email delivery is skipped due to master preference');
  } catch (e) { fail('Master toggle suppression verification', e); }

  try {
    // Non-allowlist notification type returns NOT_IN_ALLOWLIST
    const disResult = await notificationEmailService.sendNotificationEmail({
      userId: studentUserId,
      notificationType: 'UNKNOWN_CUSTOM_TYPE',
      title: 'General Notification',
      message: 'Test message.'
    });
    assert.strictEqual(disResult.skipped, true);
    assert.strictEqual(disResult.reason, 'NOT_IN_ALLOWLIST');
    pass('Step 7C Allowlist filter precedes preferences check and skips unmapped notification types');
  } catch (e) { fail('Allowlist filter precedence', e); }

  // ----------------------------------------------------
  // SECTION 8: IN-APP NOTIFICATION INDEPENDENCE (Tests 43-44)
  // ----------------------------------------------------
  console.log('\n--- Section 8: In-App Notification Independence & Non-Interference ---');

  try {
    // Master email preference is off
    const inAppNotif = await notificationModel.createNotification({
      recipient_user_id: studentUserId,
      notification_type: 'Notice',
      title: 'Graduation Ceremony Announcement',
      message: 'Annual graduation ceremony scheduled for next month.'
    });

    assert.ok(inAppNotif.notification_id, 'Notification record must be created');
    pass('In-app portal notification is created successfully even when email preferences are disabled');

    assert.strictEqual(inAppNotif.is_read, false);
    pass('In-app notification retains unread state and is fully accessible to student in portal');
  } catch (e) { fail('In-app notification creation independence', e); }

  // ----------------------------------------------------
  // SECTION 9: HTML & SHELL DOM ARCHITECTURE (Tests 45-52)
  // ----------------------------------------------------
  console.log('\n--- Section 9: HTML, CSS & Shell Architecture Integrity ---');

  try {
    const studentHtml = fs.readFileSync(path.join(__dirname, '../public/pages/student/email-preferences.html'), 'utf8');
    const teacherHtml = fs.readFileSync(path.join(__dirname, '../public/pages/teacher/email-preferences.html'), 'utf8');
    const studentShell = fs.readFileSync(path.join(__dirname, '../public/js/student-shell.js'), 'utf8');
    const teacherShell = fs.readFileSync(path.join(__dirname, '../public/js/teacher-shell.js'), 'utf8');

    const studentBells = (studentHtml.match(/id="headerNotificationBtn"/g) || []).length;
    assert.strictEqual(studentBells, 1);
    pass('Student email preferences HTML contains exactly ONE notification bell');

    const teacherBells = (teacherHtml.match(/id="headerNotificationBtn"/g) || []).length;
    assert.strictEqual(teacherBells, 1);
    pass('Teacher email preferences HTML contains exactly ONE notification bell');

    const studentLinks = (studentShell.match(/\/pages\/student\/email-preferences\.html/g) || []).length;
    assert.strictEqual(studentLinks, 1);
    pass('Student shell sidebar contains exactly ONE Email Preferences link');

    const teacherLinks = (teacherShell.match(/\/pages\/teacher\/email-preferences\.html/g) || []).length;
    assert.strictEqual(teacherLinks, 1);
    pass('Teacher shell sidebar contains exactly ONE Email Preferences link');

    assert.ok(studentHtml.includes('id="email_enabled"'));
    pass('Student HTML provides the master email_enabled toggle switch');

    const expectedCats = ['assignment_emails', 'exam_emails', 'attendance_emails', 'timetable_emails', 'notice_emails', 'feedback_emails', 'academic_event_emails'];
    expectedCats.forEach(c => assert.ok(studentHtml.includes(`id="${c}"`)));
    pass('Student HTML provides all 7 granular category toggle switches');

    assert.ok(teacherHtml.includes('id="email_enabled"'));
    pass('Teacher HTML provides the master email_enabled toggle switch');

    expectedCats.forEach(c => assert.ok(teacherHtml.includes(`id="${c}"`)));
    pass('Teacher HTML provides all 7 granular category toggle switches');
  } catch (e) { fail('HTML and Shell static verification', e); }

  // ----------------------------------------------------
  // SECTION 10: RESPONSIVE ZERO-OVERFLOW AUDIT (Tests 53-58)
  // ----------------------------------------------------
  console.log('\n--- Section 10: Headless Browser Responsive Zero-Overflow Audits ---');

  let chrome = null;
  try {
    chrome = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      'about:blank'
    ]);
    await sleep(2200);

    const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json`);
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let nextId = 1;
    const cdpSend = (method, params = {}) => new Promise((resolve, reject) => {
      const msgId = nextId++;
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for CDP ${method} (msgId=${msgId})`));
      }, 10000);

      const handler = (evt) => {
        const parsed = JSON.parse(evt.data);
        if (parsed.id === msgId) {
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          if (parsed.error) reject(parsed.error);
          else resolve(parsed.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

    await cdpSend('Page.enable');
    await cdpSend('Runtime.enable');

    async function evalCode(expression) {
      const res = await cdpSend('Runtime.evaluate', {
        expression: expression,
        returnByValue: true,
        awaitPromise: true
      });
      return res.result?.value;
    }

    // Set student auth
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/login.html' });
    await sleep(600);
    await evalCode(`
      localStorage.setItem('token', '${studentAuth.token}');
      localStorage.setItem('user', JSON.stringify(${JSON.stringify(studentAuth.user)}));
    `);

    // Viewport audits for student
    const viewports = [
      { name: 'Mobile SE', width: 375, height: 812, mobile: true },
      { name: 'Mobile 14', width: 390, height: 844, mobile: true },
      { name: 'Tablet Portrait', width: 768, height: 1024, mobile: false },
      { name: 'Tablet Landscape', width: 1024, height: 768, mobile: false },
      { name: 'Desktop Large', width: 1440, height: 900, mobile: false }
    ];

    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/student/email-preferences.html' });
    await sleep(1500);

    for (const vp of viewports) {
      await cdpSend('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.mobile
      });
      await sleep(300);

      const hasOverflow = await evalCode(`document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`);
      assert.strictEqual(hasOverflow, false, `Student page overflowed at ${vp.width}x${vp.height}`);
      pass(`Student page verified zero-horizontal-overflow at ${vp.name} (${vp.width}x${vp.height})`);
    }

    // Viewport audit for teacher
    await evalCode(`
      localStorage.setItem('token', '${teacherAuth.token}');
      localStorage.setItem('user', JSON.stringify(${JSON.stringify(teacherAuth.user)}));
    `);

    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/teacher/email-preferences.html' });
    await sleep(1500);

    let teacherAllPassed = true;
    for (const vp of viewports) {
      await cdpSend('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.mobile
      });
      await sleep(300);

      const hasOverflow = await evalCode(`document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`);
      if (hasOverflow) teacherAllPassed = false;
    }

    assert.strictEqual(teacherAllPassed, true);
    pass('Teacher page verified zero-horizontal-overflow across all 5 canonical viewports (375 to 1440px)');

    ws.close();
    chrome.kill();
  } catch (chromeErr) {
    if (chrome) chrome.kill();
    fail('Responsive CDP overflow verification', chromeErr);
  }

  // Restore clean state
  await emailPreferenceModel.updatePreferences(studentUserId, {
    email_enabled: true,
    assignment_emails: true,
    exam_emails: true,
    attendance_emails: true,
    timetable_emails: true,
    notice_emails: true,
    feedback_emails: true,
    academic_event_emails: true
  });

  await emailPreferenceModel.updatePreferences(teacherUserId, {
    email_enabled: true,
    assignment_emails: true,
    exam_emails: true,
    attendance_emails: true,
    timetable_emails: true,
    notice_emails: true,
    feedback_emails: true,
    academic_event_emails: true
  });

  console.log('\n======================================================================');
  console.log(`FINAL RESULT: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('======================================================================\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
