require('dotenv').config();
const assert = require('assert');
const nodemailer = require('nodemailer');
const pool = require('../src/config/db');

// Spy on nodemailer to capture real Gmail SMTP transmissions
let capturedMails = [];
const originalCreateTransport = nodemailer.createTransport;

nodemailer.createTransport = function (...args) {
  const transporter = originalCreateTransport.apply(this, args);
  const originalSendMail = transporter.sendMail.bind(transporter);
  transporter.sendMail = async function (mailOptions) {
    console.log('\n[REAL GMAIL SMTP] Connecting to smtp.gmail.com:587...');
    console.log(`[REAL GMAIL SMTP] Sending to: ${mailOptions.to}`);
    console.log(`[REAL GMAIL SMTP] Subject: ${mailOptions.subject}`);
    const result = await originalSendMail(mailOptions);
    capturedMails.push({
      options: mailOptions,
      result: result,
      timestamp: new Date()
    });
    console.log(`[REAL GMAIL SMTP] Response from Gmail: ${result.response || JSON.stringify(result)}`);
    console.log(`[REAL GMAIL SMTP] Message ID: ${result.messageId}`);
    return result;
  };
  return transporter;
};

const timetableController = require('../src/controllers/timetable.controller');
const emailTemplates = require('../src/services/emailTemplates');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMail(minCount = 1, timeoutMs = 12000) {
  const start = Date.now();
  while (capturedMails.length < minCount && (Date.now() - start) < timeoutMs) {
    await sleep(200);
  }
}

async function waitForEmailLog(eventKey, expectedStatus = 'SENT', timeoutMs = 8000) {
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    const [rows] = await pool.query('SELECT * FROM email_logs WHERE event_key = ?', [eventKey]);
    if (rows.length > 0 && rows[0].status === expectedStatus) {
      return rows[0];
    }
    await sleep(200);
  }
  const [fallback] = await pool.query('SELECT * FROM email_logs WHERE event_key = ?', [eventKey]);
  return fallback[0] || null;
}

const createMockResponse = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    this.payload = data;
    return this;
  }
});

async function runRealTimetableReminderVerification() {
  console.log('========================================================================');
  console.log('  REAL END-TO-END VERIFICATION: TIMETABLE_REMINDER (GMAIL SMTP)');
  console.log('========================================================================\n');

  const TARGET_STUDENT_ID = 96;
  const TARGET_USER_ID = 174;
  const TARGET_COURSE_ID = 146;
  const TARGET_TEACHER_ID = 90;

  let testTimetableIdA = null;
  let testTimetableIdB = null;

  try {
    // -----------------------------------------------------------------------
    // STEP 0: Prerequisites & Environment Setup
    // -----------------------------------------------------------------------
    console.log('--- Step 0: Checking Prerequisites & Setting Up Test Timetable ---');

    // 0.1 Verify Student & User in Database
    const [userRows] = await pool.query(`
      SELECT u.user_id, u.email, u.username, u.is_active,
             TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS full_name
      FROM users u
      WHERE u.user_id = ?
    `, [TARGET_USER_ID]);
    assert(userRows.length > 0, `User ${TARGET_USER_ID} must exist`);
    const studentUser = userRows[0];
    assert.strictEqual(studentUser.is_active, 1, 'Student user must be active');
    assert(studentUser.email, 'Student must have an email address');
    console.log(`  ✓ Student user: ${studentUser.full_name} (${studentUser.username}), email=${studentUser.email}`);

    // 0.2 Verify Enrollment in Course 146
    const [enrollments] = await pool.query(`
      SELECT enrollment_id FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'Enrolled'
    `, [TARGET_STUDENT_ID, TARGET_COURSE_ID]);
    assert(enrollments.length > 0, `Student ${TARGET_STUDENT_ID} must be enrolled in course ${TARGET_COURSE_ID}`);
    console.log(`  ✓ Enrolled in course ID #${TARGET_COURSE_ID} (IT101 - DSML)`);

    // 0.3 Ensure timetable_emails preference is enabled
    await pool.query(`
      INSERT INTO user_email_preferences (user_id, email_enabled, timetable_emails)
      VALUES (?, 1, 1)
      ON DUPLICATE KEY UPDATE email_enabled = 1, timetable_emails = 1
    `, [TARGET_USER_ID]);
    console.log('  ✓ user_email_preferences confirmed: email_enabled = 1, timetable_emails = 1');

    // 0.4 Setup Test Timetable Lecture A for Monday ('2026-09-21')
    const testDateStr = '2026-09-21'; // Monday
    const testDayOfWeek = 'Monday';
    const testStartTimeA = '10:00:00';
    const testEndTimeA = '11:00:00';
    const testRoomA = 'Room 302';

    // Delete any previous timetable slots with exact same room/day/time or teacher/day/time
    await pool.query(`
      DELETE FROM timetable 
      WHERE (day_of_week = ? AND start_time = ? AND (room_no = ? OR teacher_id = ?))
         OR (class_name = 'TY-IT' AND division = '1' AND day_of_week = ? AND start_time = ?)
    `, [testDayOfWeek, testStartTimeA, testRoomA, TARGET_TEACHER_ID, testDayOfWeek, testStartTimeA]);

    const [insertResultA] = await pool.query(`
      INSERT INTO timetable (course_id, teacher_id, class_name, division, room_no, academic_year, semester, day_of_week, start_time, end_time)
      VALUES (?, ?, 'TY-IT', '1', ?, '2026-2027', 5, ?, ?, ?)
    `, [TARGET_COURSE_ID, TARGET_TEACHER_ID, testRoomA, testDayOfWeek, testStartTimeA, testEndTimeA]);

    testTimetableIdA = insertResultA.insertId;
    console.log(`  ✓ Created test lecture entry A: timetable_id=#${testTimetableIdA}`);
    console.log(`    Course: IT101 - DSML, Day: ${testDayOfWeek}, Time: ${testStartTimeA} - ${testEndTimeA}, Room: ${testRoomA}`);

    // Clean any prior reminder logs or email logs for this testTimetableIdA
    await pool.query('DELETE FROM timetable_reminder_logs WHERE timetable_id = ?', [testTimetableIdA]);
    await pool.query('DELETE FROM email_logs WHERE event_key LIKE ?', [`%TIMETABLE_REMINDER:${testTimetableIdA}_%`]);

    const expectedDateFormatted = emailTemplates.formatDueDateTime ? emailTemplates.formatDueDateTime(testDateStr).date : testDateStr;

    // -----------------------------------------------------------------------
    // STEP 1: 15_MINUTES Reminder Verification
    // -----------------------------------------------------------------------
    console.log('\n--- Step 1: 15_MINUTES Reminder Verification ---');
    capturedMails = [];

    // Simulate 10 minutes before 10:00:00 (i.e. 09:50:00 -> within (5, 15] window)
    const req15 = {
      user: { user_id: TARGET_USER_ID, role: 'STUDENT' },
      body: {
        date: testDateStr,
        ref_time: '09:50:00'
      },
      query: {}
    };
    const res15 = createMockResponse();

    console.log('  Triggering checkAndDispatchReminders for 15_MINUTES (ref_time: 09:50:00)...');
    await timetableController.checkAndDispatchReminders(req15, res15);
    assert.strictEqual(res15.statusCode, 200);
    assert.strictEqual(res15.payload?.data?.reminders_dispatched, 1, 'Should dispatch 1 reminder');

    await waitForMail(1, 12000);
    assert(capturedMails.length >= 1, '15_MINUTES email must be captured via Gmail SMTP');
    const mail15 = capturedMails.find(m => m.options.to === studentUser.email);
    assert(mail15, 'Email must be sent to student');

    const expectedKey15 = `${TARGET_USER_ID}:TIMETABLE_REMINDER:${testTimetableIdA}_${testDateStr}_15_MINUTES`;
    const log15 = await waitForEmailLog(expectedKey15, 'SENT', 8000);
    assert(log15, `email_logs must contain ${expectedKey15}`);
    assert.strictEqual(log15.status, 'SENT', 'Log status must be SENT');
    assert.strictEqual(log15.recipient_email, studentUser.email, 'Recipient must match student email');
    assert.strictEqual(log15.email_type, 'TIMETABLE_REMINDER');

    // In-app notification check
    const [notifRows15] = await pool.query(`
      SELECT notification_id, title, message, notification_type
      FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'TIMETABLE_REMINDER' AND DATE(created_at) = CURRENT_DATE()
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID]);
    assert(notifRows15.length > 0);
    const notif15 = notifRows15[0];
    console.log(`  ✓ In-app Notification #${notif15.notification_id}: "${notif15.title}"`);
    console.log(`  ✓ email_logs #${log15.email_log_id}: status=${log15.status}, event_key=${log15.event_key}`);
    console.log(`  ✓ Gmail SMTP response: ${mail15.result.response || JSON.stringify(mail15.result)}`);
    console.log(`  ✓ Message ID: ${mail15.result.messageId}`);

    // Verify Email Content for 15_MINUTES
    assert(mail15.options.subject.includes('15 minutes'), 'Subject must mention 15 minutes');
    assert(mail15.options.html.includes('DSML') || mail15.options.html.includes('IT101'), 'HTML must include course');
    assert(mail15.options.html.includes(expectedDateFormatted), 'HTML must include lecture date');
    assert(mail15.options.html.includes('10:00 AM') || mail15.options.html.includes('10:00:00'), 'HTML must include time');
    assert(mail15.options.html.includes('Rohini Rankhamb'), 'HTML must include teacher name');
    assert(mail15.options.html.includes(testRoomA), 'HTML must include room');
    assert(mail15.options.html.includes('begins in 15 minutes') || mail15.options.html.includes('15 Minutes'), 'HTML must include reminder message');
    console.log('  ✓ 15_MINUTES email content verified (course, date, time, teacher, room, reminder message)');

    // 1.4 Duplicate trigger test for 15_MINUTES
    console.log('  Testing duplicate trigger for 15_MINUTES...');
    capturedMails = [];
    const res15Dup = createMockResponse();
    await timetableController.checkAndDispatchReminders(req15, res15Dup);
    assert.strictEqual(res15Dup.payload?.data?.reminders_dispatched, 0, 'Duplicate check should dispatch 0 reminders');
    await sleep(2000);
    const dupMails15 = capturedMails.filter(m => m.options.to === studentUser.email);
    assert.strictEqual(dupMails15.length, 0, 'Zero duplicate emails should be sent over SMTP');
    const [dupCheck15] = await pool.query('SELECT COUNT(*) AS c FROM email_logs WHERE event_key = ?', [expectedKey15]);
    assert.strictEqual(dupCheck15[0].c, 1, `Exactly 1 email log must exist for ${expectedKey15}`);
    console.log('  ✓ 15_MINUTES duplicate protection verified: 0 retransmissions, exactly 1 log record');

    // -----------------------------------------------------------------------
    // STEP 2: 5_MINUTES Reminder Verification
    // -----------------------------------------------------------------------
    console.log('\n--- Step 2: 5_MINUTES Reminder Verification ---');
    capturedMails = [];

    // Simulate 3 minutes before 10:00:00 (i.e. 09:57:00 -> within (0, 5] window)
    const req5 = {
      user: { user_id: TARGET_USER_ID, role: 'STUDENT' },
      body: {
        date: testDateStr,
        ref_time: '09:57:00'
      },
      query: {}
    };
    const res5 = createMockResponse();

    console.log('  Triggering checkAndDispatchReminders for 5_MINUTES (ref_time: 09:57:00)...');
    await timetableController.checkAndDispatchReminders(req5, res5);
    assert.strictEqual(res5.statusCode, 200);
    assert.strictEqual(res5.payload?.data?.reminders_dispatched, 1, 'Should dispatch 1 reminder');

    await waitForMail(1, 12000);
    assert(capturedMails.length >= 1, '5_MINUTES email must be captured via Gmail SMTP');
    const mail5 = capturedMails.find(m => m.options.to === studentUser.email);
    assert(mail5, 'Email must be sent to student');

    const expectedKey5 = `${TARGET_USER_ID}:TIMETABLE_REMINDER:${testTimetableIdA}_${testDateStr}_5_MINUTES`;
    const log5 = await waitForEmailLog(expectedKey5, 'SENT', 8000);
    assert(log5, `email_logs must contain ${expectedKey5}`);
    assert.strictEqual(log5.status, 'SENT', 'Log status must be SENT');
    assert.strictEqual(log5.recipient_email, studentUser.email, 'Recipient must match student email');
    assert.strictEqual(log5.email_type, 'TIMETABLE_REMINDER');

    // In-app notification check
    const [notifRows5] = await pool.query(`
      SELECT notification_id, title, message, notification_type
      FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'TIMETABLE_REMINDER' AND DATE(created_at) = CURRENT_DATE()
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID]);
    assert(notifRows5.length > 0);
    const notif5 = notifRows5[0];
    console.log(`  ✓ In-app Notification #${notif5.notification_id}: "${notif5.title}"`);
    console.log(`  ✓ email_logs #${log5.email_log_id}: status=${log5.status}, event_key=${log5.event_key}`);
    console.log(`  ✓ Gmail SMTP response: ${mail5.result.response || JSON.stringify(mail5.result)}`);
    console.log(`  ✓ Message ID: ${mail5.result.messageId}`);

    // Verify Email Content for 5_MINUTES
    assert(mail5.options.subject.includes('5 minutes'), 'Subject must mention 5 minutes');
    assert(mail5.options.html.includes('DSML') || mail5.options.html.includes('IT101'), 'HTML must include course');
    assert(mail5.options.html.includes(expectedDateFormatted), 'HTML must include lecture date');
    assert(mail5.options.html.includes('10:00 AM') || mail5.options.html.includes('10:00:00'), 'HTML must include time');
    assert(mail5.options.html.includes('Rohini Rankhamb'), 'HTML must include teacher name');
    assert(mail5.options.html.includes(testRoomA), 'HTML must include room');
    assert(mail5.options.html.includes('begins in 5 minutes') || mail5.options.html.includes('5 Minutes'), 'HTML must include reminder message');
    console.log('  ✓ 5_MINUTES email content verified (course, date, time, teacher, room, reminder message)');

    // 2.4 Duplicate trigger test for 5_MINUTES
    console.log('  Testing duplicate trigger for 5_MINUTES...');
    capturedMails = [];
    const res5Dup = createMockResponse();
    await timetableController.checkAndDispatchReminders(req5, res5Dup);
    assert.strictEqual(res5Dup.payload?.data?.reminders_dispatched, 0, 'Duplicate check should dispatch 0 reminders');
    await sleep(2000);
    const dupMails5 = capturedMails.filter(m => m.options.to === studentUser.email);
    assert.strictEqual(dupMails5.length, 0, 'Zero duplicate emails should be sent over SMTP');
    const [dupCheck5] = await pool.query('SELECT COUNT(*) AS c FROM email_logs WHERE event_key = ?', [expectedKey5]);
    assert.strictEqual(dupCheck5[0].c, 1, `Exactly 1 email log must exist for ${expectedKey5}`);
    console.log('  ✓ 5_MINUTES duplicate protection verified: 0 retransmissions, exactly 1 log record');

    // -----------------------------------------------------------------------
    // STEP 3: STARTED Reminder Verification
    // -----------------------------------------------------------------------
    console.log('\n--- Step 3: STARTED Reminder Verification ---');
    capturedMails = [];

    // Simulate 5 minutes after start (i.e. 10:05:00 -> within [start, end) window)
    const reqStarted = {
      user: { user_id: TARGET_USER_ID, role: 'STUDENT' },
      body: {
        date: testDateStr,
        ref_time: '10:05:00'
      },
      query: {}
    };
    const resStarted = createMockResponse();

    console.log('  Triggering checkAndDispatchReminders for STARTED (ref_time: 10:05:00)...');
    await timetableController.checkAndDispatchReminders(reqStarted, resStarted);
    assert.strictEqual(resStarted.statusCode, 200);
    assert.strictEqual(resStarted.payload?.data?.reminders_dispatched, 1, 'Should dispatch 1 reminder');

    await waitForMail(1, 12000);
    assert(capturedMails.length >= 1, 'STARTED email must be captured via Gmail SMTP');
    const mailStarted = capturedMails.find(m => m.options.to === studentUser.email);
    assert(mailStarted, 'Email must be sent to student');

    const expectedKeyStarted = `${TARGET_USER_ID}:TIMETABLE_REMINDER:${testTimetableIdA}_${testDateStr}_STARTED`;
    const logStarted = await waitForEmailLog(expectedKeyStarted, 'SENT', 8000);
    assert(logStarted, `email_logs must contain ${expectedKeyStarted}`);
    assert.strictEqual(logStarted.status, 'SENT', 'Log status must be SENT');
    assert.strictEqual(logStarted.recipient_email, studentUser.email, 'Recipient must match student email');
    assert.strictEqual(logStarted.email_type, 'TIMETABLE_REMINDER');

    // In-app notification check
    const [notifRowsStarted] = await pool.query(`
      SELECT notification_id, title, message, notification_type
      FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'TIMETABLE_REMINDER' AND DATE(created_at) = CURRENT_DATE()
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID]);
    assert(notifRowsStarted.length > 0);
    const notifStarted = notifRowsStarted[0];
    console.log(`  ✓ In-app Notification #${notifStarted.notification_id}: "${notifStarted.title}"`);
    console.log(`  ✓ email_logs #${logStarted.email_log_id}: status=${logStarted.status}, event_key=${logStarted.event_key}`);
    console.log(`  ✓ Gmail SMTP response: ${mailStarted.result.response || JSON.stringify(mailStarted.result)}`);
    console.log(`  ✓ Message ID: ${mailStarted.result.messageId}`);

    // Verify Email Content for STARTED
    assert(mailStarted.options.subject.includes('Started'), 'Subject must mention Started');
    assert(mailStarted.options.html.includes('DSML') || mailStarted.options.html.includes('IT101'), 'HTML must include course');
    assert(mailStarted.options.html.includes(expectedDateFormatted), 'HTML must include lecture date');
    assert(mailStarted.options.html.includes('10:00 AM') || mailStarted.options.html.includes('10:00:00'), 'HTML must include time');
    assert(mailStarted.options.html.includes('Rohini Rankhamb'), 'HTML must include teacher name');
    assert(mailStarted.options.html.includes(testRoomA), 'HTML must include room');
    assert(mailStarted.options.html.includes('has started') || mailStarted.options.html.includes('Started'), 'HTML must include reminder message');
    console.log('  ✓ STARTED email content verified (course, date, time, teacher, room, reminder message)');

    // 3.4 Duplicate trigger test for STARTED
    console.log('  Testing duplicate trigger for STARTED...');
    capturedMails = [];
    const resStartedDup = createMockResponse();
    await timetableController.checkAndDispatchReminders(reqStarted, resStartedDup);
    assert.strictEqual(resStartedDup.payload?.data?.reminders_dispatched, 0, 'Duplicate check should dispatch 0 reminders');
    await sleep(2000);
    const dupMailsStarted = capturedMails.filter(m => m.options.to === studentUser.email);
    assert.strictEqual(dupMailsStarted.length, 0, 'Zero duplicate emails should be sent over SMTP');
    const [dupCheckStarted] = await pool.query('SELECT COUNT(*) AS c FROM email_logs WHERE event_key = ?', [expectedKeyStarted]);
    assert.strictEqual(dupCheckStarted[0].c, 1, `Exactly 1 email log must exist for ${expectedKeyStarted}`);
    console.log('  ✓ STARTED duplicate protection verified: 0 retransmissions, exactly 1 log record');

    // -----------------------------------------------------------------------
    // STEP 4: Email Preference Disabled Verification (timetable_emails = 0)
    // -----------------------------------------------------------------------
    console.log('\n--- Step 4: Email Preference Disabled Verification (timetable_emails = 0) ---');
    capturedMails = [];

    // Setup Test Lecture B at 14:00:00
    const testStartTimeB = '14:00:00';
    const testEndTimeB = '15:00:00';
    const testRoomB = 'Room 304';

    await pool.query(`
      DELETE FROM timetable 
      WHERE (day_of_week = ? AND start_time = ? AND (room_no = ? OR teacher_id = ?))
         OR (class_name = 'TY-IT' AND division = '1' AND day_of_week = ? AND start_time = ?)
    `, [testDayOfWeek, testStartTimeB, testRoomB, TARGET_TEACHER_ID, testDayOfWeek, testStartTimeB]);

    const [insertResultB] = await pool.query(`
      INSERT INTO timetable (course_id, teacher_id, class_name, division, room_no, academic_year, semester, day_of_week, start_time, end_time)
      VALUES (?, ?, 'TY-IT', '1', ?, '2026-2027', 5, ?, ?, ?)
    `, [TARGET_COURSE_ID, TARGET_TEACHER_ID, testRoomB, testDayOfWeek, testStartTimeB, testEndTimeB]);
    testTimetableIdB = insertResultB.insertId;
    console.log(`  ✓ Created test lecture entry B: timetable_id=#${testTimetableIdB}`);

    // Temporarily set timetable_emails = 0
    await pool.query(`
      UPDATE user_email_preferences 
      SET timetable_emails = 0 
      WHERE user_id = ?
    `, [TARGET_USER_ID]);
    console.log(`  ✓ Temporarily set timetable_emails = 0 for user #${TARGET_USER_ID}`);

    // Trigger 15_MINUTES reminder for Lecture B (ref_time: 13:50:00)
    const reqPrefOff = {
      user: { user_id: TARGET_USER_ID, role: 'STUDENT' },
      body: {
        date: testDateStr,
        ref_time: '13:50:00'
      },
      query: {}
    };
    const resPrefOff = createMockResponse();

    await timetableController.checkAndDispatchReminders(reqPrefOff, resPrefOff);
    assert.strictEqual(resPrefOff.statusCode, 200);
    assert.strictEqual(resPrefOff.payload?.data?.reminders_dispatched, 1, 'In-app reminder should still be dispatched');

    await sleep(2500);

    // Verify 0 emails sent via SMTP to target student
    const studentMailsB = capturedMails.filter(m => m.options.to === studentUser.email);
    assert.strictEqual(studentMailsB.length, 0, 'Zero emails should be sent to student when timetable_emails = OFF');

    // Verify in-app notification WAS created
    const [prefNotifs] = await pool.query(`
      SELECT notification_id, recipient_user_id, title, message, notification_type
      FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'TIMETABLE_REMINDER' AND message LIKE ? AND DATE(created_at) = CURRENT_DATE()
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID, `%${testRoomB}%`]);
    assert(prefNotifs.length > 0, 'In-app notification must still be created when preference is OFF');
    console.log(`  ✓ In-app Notification #${prefNotifs[0].notification_id} created successfully despite preference = OFF`);

    // Verify no email_logs record with SENT status
    const expectedKeyB = `${TARGET_USER_ID}:TIMETABLE_REMINDER:${testTimetableIdB}_${testDateStr}_15_MINUTES`;
    const [prefLogs] = await pool.query('SELECT * FROM email_logs WHERE event_key = ?', [expectedKeyB]);
    assert.strictEqual(prefLogs.length, 0, 'No email_logs record should exist (skipped before log)');
    console.log('  ✓ Email delivery skipped cleanly due to EMAIL_PREFERENCE_DISABLED');

    // Restore preference to ON (1)
    await pool.query(`
      UPDATE user_email_preferences 
      SET timetable_emails = 1 
      WHERE user_id = ?
    `, [TARGET_USER_ID]);
    console.log('  ✓ Restored timetable_emails = 1');

    // -----------------------------------------------------------------------
    // STEP 5: Security / Secret Leakage Audit
    // -----------------------------------------------------------------------
    console.log('\n--- Step 5: Security & Credentials Leakage Audit ---');
    const [recentEmailLogs] = await pool.query(`
      SELECT subject, error_message, event_key
      FROM email_logs
      WHERE user_id = ? AND email_type = 'TIMETABLE_REMINDER'
      ORDER BY email_log_id DESC
      LIMIT 10
    `, [TARGET_USER_ID]);

    const secretPatterns = [/jwt/i, /bearer\s+[a-zA-Z0-9_\-\.]+/i, /password/i, /app_password/i, /smtp_pass/i];
    for (const log of recentEmailLogs) {
      const combined = `${log.subject || ''} ${log.error_message || ''} ${log.event_key || ''}`;
      for (const pat of secretPatterns) {
        assert(!pat.test(combined), `Sensitive pattern ${pat} found in log record!`);
      }
    }
    console.log('  ✓ Verified: No JWTs, passwords, or SMTP secrets leaked in email logs or event keys');

    // -----------------------------------------------------------------------
    // STEP 6: Summary of All 3 Reminders for Lecture A
    // -----------------------------------------------------------------------
    console.log('\n--- Step 6: Complete Lecture A Reminder Lifecycle Summary ---');
    const [allLogsA] = await pool.query(`
      SELECT email_log_id, email_type, event_key, status, subject, sent_at
      FROM email_logs
      WHERE event_key IN (?, ?, ?)
      ORDER BY email_log_id ASC
    `, [expectedKey15, expectedKey5, expectedKeyStarted]);

    allLogsA.forEach((l, idx) => {
      console.log(`    ${idx + 1}. [${l.event_key}] logId=#${l.email_log_id}, status=${l.status}`);
    });
    assert.strictEqual(allLogsA.length, 3, 'Exactly 3 distinct email logs must exist for Lecture A');
    assert.strictEqual(allLogsA[0].status, 'SENT');
    assert.strictEqual(allLogsA[1].status, 'SENT');
    assert.strictEqual(allLogsA[2].status, 'SENT');

    // -----------------------------------------------------------------------
    // STEP 7: Test Data Cleanup
    // -----------------------------------------------------------------------
    console.log('\n--- Step 7: Test Data Cleanup ---');
    if (testTimetableIdA) {
      await pool.query('DELETE FROM timetable_reminder_logs WHERE timetable_id = ?', [testTimetableIdA]);
      await pool.query('DELETE FROM timetable WHERE timetable_id = ?', [testTimetableIdA]);
    }
    if (testTimetableIdB) {
      await pool.query('DELETE FROM timetable_reminder_logs WHERE timetable_id = ?', [testTimetableIdB]);
      await pool.query('DELETE FROM timetable WHERE timetable_id = ?', [testTimetableIdB]);
    }
    console.log('  ✓ Cleaned up test timetable records');

    console.log('\n========================================================================');
    console.log('  ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! (PASS)');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ VERIFICATION TEST FAILED:', err);
    await pool.query(`
      UPDATE user_email_preferences 
      SET timetable_emails = 1 
      WHERE user_id = ?
    `, [TARGET_USER_ID]).catch(() => {});
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runRealTimetableReminderVerification();