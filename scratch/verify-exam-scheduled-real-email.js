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

const academicEventModel = require('../src/models/academicEvent.model');
const academicEventController = require('../src/controllers/academicEvent.controller');
const notificationModel = require('../src/models/notification.model');
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

async function runRealExamScheduledVerification() {
  console.log('========================================================================');
  console.log('  REAL END-TO-END VERIFICATION: EXAM_SCHEDULED IMMEDIATE EMAIL (GMAIL SMTP)');
  console.log('========================================================================\n');

  const TARGET_STUDENT_ID = 96;
  const TARGET_USER_ID = 174;
  const TARGET_COURSE_ID = 146;

  let examIdA = null;
  let examIdB = null;

  try {
    // -----------------------------------------------------------------------
    // STEP 0: Prerequisites & Environment Setup
    // -----------------------------------------------------------------------
    console.log('--- Step 0: Checking Prerequisites & Student Setup ---');

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

    // 0.3 Ensure exam_emails preference is enabled
    await pool.query(`
      INSERT INTO user_email_preferences (user_id, email_enabled, exam_emails)
      VALUES (?, 1, 1)
      ON DUPLICATE KEY UPDATE email_enabled = 1, exam_emails = 1
    `, [TARGET_USER_ID]);
    console.log('  ✓ user_email_preferences confirmed: email_enabled = 1, exam_emails = 1');

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // -----------------------------------------------------------------------
    // STEP 1: Exam Creation & Immediate EXAM_SCHEDULED Email Delivery
    // -----------------------------------------------------------------------
    console.log('\n--- Step 1: Exam Creation & Immediate EXAM_SCHEDULED Delivery ---');
    capturedMails = [];

    const examTitleA = 'End Semester Examination';
    const examDateA = tomorrowStr;
    const examStartTimeA = '10:00:00';
    const examEndTimeA = '12:00:00';
    const examVenueA = 'Room 204';
    const examInstructionsA = 'Please arrive 15 minutes before the exam starts with your student ID.';

    const mockReqA = {
      user: { user_id: 1, role: 'ADMIN' },
      body: {
        title: examTitleA,
        description: 'End Semester Comprehensive Theory Exam for DSML',
        event_type: 'EXAM',
        exam_type: 'External Exam',
        start_date: examDateA,
        end_date: examDateA,
        start_time: examStartTimeA,
        end_time: examEndTimeA,
        room: examVenueA,
        location: 'Examination Complex',
        course_id: TARGET_COURSE_ID,
        target_audience: 'COURSE',
        instructions: examInstructionsA
      }
    };

    const mockResA = {
      status(code) { this.statusCode = code; return this; },
      json(data) { this.jsonData = data; return this; }
    };

    console.log('  Creating exam via academicEventController.createEvent...');
    await academicEventController.createEvent(mockReqA, mockResA);
    assert.strictEqual(mockResA.statusCode, 201, 'Exam creation should succeed with 201');
    examIdA = mockResA.jsonData.data.event_id;
    console.log(`  ✓ Exam created successfully: Exam ID #${examIdA} ("${examTitleA}")`);

    // Wait for async Gmail SMTP transmission
    console.log('  Waiting for async email transmission via Gmail SMTP...');
    await waitForMail(1, 12000);
    assert(capturedMails.length >= 1, 'Immediate email must be captured via Gmail SMTP upon exam creation');

    // 1.1 Verify in-app notification in DB
    const [notifRows] = await pool.query(`
      SELECT notification_id, recipient_user_id, title, message, notification_type, created_at
      FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'EXAM_SCHEDULED'
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID]);

    assert(notifRows.length > 0, 'In-app EXAM_SCHEDULED notification must exist');
    const notifA = notifRows[0];
    console.log(`  ✓ In-app Notification #${notifA.notification_id} created:`);
    console.log(`    Title:   ${notifA.title}`);
    console.log(`    Message: ${notifA.message}`);
    assert(notifA.title.includes(examTitleA), 'Notification title must include exam title');
    assert(notifA.message.includes(examTitleA), 'Notification message must include exam title');
    assert(notifA.message.includes('IT101 - DSML'), 'Notification message must include course');

    // 1.2 Verify email_logs in DB
    const expectedEventKeyA = `${TARGET_USER_ID}:EXAM_SCHEDULED:${examIdA}`;
    const [emailLogRows] = await pool.query(`
      SELECT email_log_id, user_id, recipient_email, email_type, subject, status, event_key, error_message, sent_at
      FROM email_logs
      WHERE event_key = ?
    `, [expectedEventKeyA]);

    assert(emailLogRows.length === 1, `email_logs must contain exactly 1 entry for ${expectedEventKeyA}`);
    const emailLogA = emailLogRows[0];
    console.log(`  ✓ email_logs #${emailLogA.email_log_id} recorded:`);
    console.log(`    Recipient: ${emailLogA.recipient_email}`);
    console.log(`    Status:    ${emailLogA.status}`);
    console.log(`    Event Key: ${emailLogA.event_key}`);
    console.log(`    Subject:   ${emailLogA.subject}`);
    assert.strictEqual(emailLogA.recipient_email, studentUser.email, 'Recipient must match student user.email');
    assert.strictEqual(emailLogA.status, 'SENT', 'Email status must be SENT via Gmail SMTP');
    assert.strictEqual(emailLogA.email_type, 'EXAM_SCHEDULED');

    // 1.3 Verify Real Gmail SMTP Transmission and Contents
    const sentMailA = capturedMails.find(m => m.options.to === studentUser.email);
    assert(sentMailA, 'Email to student must be captured via Gmail SMTP');
    console.log(`  ✓ Gmail SMTP confirmed delivery (MessageID: ${sentMailA.result.messageId})`);

    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const [ey, em, ed] = examDateA.split('-');
    const expectedFormattedDate = `${parseInt(ed, 10)} ${months[parseInt(em, 10) - 1]} ${ey}`;

    // Subject check
    assert(sentMailA.options.subject.includes(examTitleA), 'Subject must include exam title');
    assert(sentMailA.options.subject.includes('Exam Scheduled'), 'Subject must indicate Exam Scheduled');

    // HTML checks
    assert(sentMailA.options.html.includes(emailTemplates.escapeHtml(examTitleA)), 'HTML must include exam title');
    assert(sentMailA.options.html.includes('IT101 - DSML'), 'HTML must include course name/code');
    assert(sentMailA.options.html.includes(expectedFormattedDate), 'HTML must include exam date');
    assert(sentMailA.options.html.includes('10:00 AM - 12:00 PM'), 'HTML must include time range');
    assert(sentMailA.options.html.includes(examVenueA), 'HTML must include venue');
    assert(sentMailA.options.html.includes('Examination Scheduled') || sentMailA.options.html.includes('New Examination Scheduled'), 'HTML must include scheduled heading');
    assert(sentMailA.options.html.includes(emailTemplates.escapeHtml(examInstructionsA)), 'HTML must include instructions');

    // Plain text checks
    assert(sentMailA.options.text.includes(examTitleA), 'Text must include exam title');
    assert(sentMailA.options.text.includes('IT101 - DSML'), 'Text must include course');
    assert(sentMailA.options.text.includes(expectedFormattedDate), 'Text must include exam date');
    assert(sentMailA.options.text.includes('10:00 AM - 12:00 PM'), 'Text must include time range');
    assert(sentMailA.options.text.includes(examVenueA), 'Text must include venue');
    assert(sentMailA.options.text.includes(examInstructionsA), 'Text must include instructions');

    console.log(`  ✓ Immediate Exam email contents verified:`);
    console.log(`    - Exam name:     "${examTitleA}"`);
    console.log(`    - Course:        "IT101 - DSML"`);
    console.log(`    - Exam date:     "${expectedFormattedDate}"`);
    console.log(`    - Start/end time: "10:00 AM - 12:00 PM"`);
    console.log(`    - Venue:         "${examVenueA}"`);
    console.log(`    - Instructions:  "${examInstructionsA}"`);

    // -----------------------------------------------------------------------
    // STEP 2: Duplicate Prevention Verification (Re-triggering Creation)
    // -----------------------------------------------------------------------
    console.log('\n--- Step 2: Duplicate Prevention Verification ---');
    capturedMails = [];

    console.log('  Attempting duplicate notification dispatch for same exam and student...');
    const { sendNotificationEmail } = require('../src/services/notificationEmail.service');
    const dupSendResult = await sendNotificationEmail({
      userId: TARGET_USER_ID,
      notificationType: 'EXAM_SCHEDULED',
      title: `Exam Scheduled: ${examTitleA}`,
      message: `Your examination "${examTitleA}" is scheduled.`,
      metadata: {
        emailNotificationType: 'EXAM_SCHEDULED',
        eventId: examIdA,
        examId: examIdA,
        examName: examTitleA,
        course: 'IT101 - DSML',
        date: expectedFormattedDate,
        time: '10:00 AM - 12:00 PM',
        venue: examVenueA
      }
    });

    console.log('  Duplicate send result:', dupSendResult);
    assert.strictEqual(dupSendResult.duplicate, true, 'Result should indicate duplicate');
    assert.strictEqual(capturedMails.length, 0, 'Zero emails should be sent over SMTP on duplicate trigger');

    const [dupCheck] = await pool.query('SELECT COUNT(*) AS c FROM email_logs WHERE event_key = ?', [expectedEventKeyA]);
    assert.strictEqual(dupCheck[0].c, 1, `Exactly 1 log entry must exist for ${expectedEventKeyA}`);
    console.log(`  ✓ Duplicate prevention verified: Exactly 1 email_log record, 0 retransmissions`);

    // -----------------------------------------------------------------------
    // STEP 3: Email Preference Disabled Verification (exam_emails = OFF)
    // -----------------------------------------------------------------------
    console.log('\n--- Step 3: Email Preference Disabled Verification (exam_emails = OFF) ---');
    capturedMails = [];

    // Create Exam B
    const examTitleB = 'Midterm Lab Practical Exam';
    const mockReqB = {
      user: { user_id: 1, role: 'ADMIN' },
      body: {
        title: examTitleB,
        description: 'Hands-on practical evaluation in Lab 3',
        event_type: 'EXAM',
        exam_type: 'Practical Exam',
        start_date: tomorrowStr,
        end_date: tomorrowStr,
        start_time: '14:00:00',
        end_time: '16:00:00',
        room: 'Lab 3',
        location: 'Computer Science Department',
        course_id: TARGET_COURSE_ID,
        target_audience: 'COURSE'
      }
    };

    const mockResB = {
      status(code) { this.statusCode = code; return this; },
      json(data) { this.jsonData = data; return this; }
    };

    // Temporarily set exam_emails = 0
    await pool.query(`
      UPDATE user_email_preferences 
      SET exam_emails = 0 
      WHERE user_id = ?
    `, [TARGET_USER_ID]);
    console.log(`  ✓ Temporarily set exam_emails = 0 for user #${TARGET_USER_ID}`);

    await academicEventController.createEvent(mockReqB, mockResB);
    assert.strictEqual(mockResB.statusCode, 201);
    examIdB = mockResB.jsonData.data.event_id;
    console.log(`  ✓ Created Exam B #${examIdB}: "${examTitleB}"`);

    await sleep(2500);

    // Verify 0 emails sent via SMTP to target student
    const studentMailsB = capturedMails.filter(m => m.options.to === studentUser.email);
    assert.strictEqual(studentMailsB.length, 0, 'Zero emails should be sent to target student when exam_emails = OFF');

    // Verify in-app notification WAS created
    const [prefNotifs] = await pool.query(`
      SELECT notification_id, recipient_user_id, title, message, notification_type
      FROM notifications
      WHERE recipient_user_id = ? AND title LIKE ?
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID, `%${examTitleB}%`]);
    assert(prefNotifs.length > 0, 'In-app notification must still be created when preference is OFF');
    console.log(`  ✓ In-app Notification #${prefNotifs[0].notification_id} created successfully despite preference = OFF`);

    // Verify no email_logs record with SENT status
    const expectedEventKeyB = `${TARGET_USER_ID}:EXAM_SCHEDULED:${examIdB}`;
    const [prefLogs] = await pool.query('SELECT * FROM email_logs WHERE event_key = ?', [expectedEventKeyB]);
    assert.strictEqual(prefLogs.length, 0, 'No email_logs record should exist (skipped before log)');
    console.log('  ✓ Email delivery skipped cleanly due to EMAIL_PREFERENCE_DISABLED');

    // Restore preference to ON (1)
    await pool.query(`
      UPDATE user_email_preferences 
      SET exam_emails = 1 
      WHERE user_id = ?
    `, [TARGET_USER_ID]);
    console.log('  ✓ Restored exam_emails = 1');

    // -----------------------------------------------------------------------
    // STEP 4: Verify Complete 3-Email Lifecycle for Exam A
    // -----------------------------------------------------------------------
    console.log('\n--- Step 4: Verify Complete 3-Email Lifecycle for Exam A ---');
    console.log('  1. EXAM_SCHEDULED: already delivered in Step 1');
    console.log('  2. 1_DAY_BEFORE: triggering now...');
    capturedMails = [];

    const r1Day = await academicEventModel.triggerReminders({
      event_id: examIdA,
      reminder_type: '1_DAY_BEFORE',
      user_id: TARGET_USER_ID
    });
    console.log('  triggerReminders (1_DAY_BEFORE) result:', r1Day);
    assert.strictEqual(r1Day.success, true);
    assert(r1Day.dispatchedCount >= 1);

    await waitForMail(1, 12000);
    assert(capturedMails.length >= 1, '1_DAY_BEFORE email must be captured via Gmail SMTP');
    console.log(`  ✓ 1_DAY_BEFORE email sent via Gmail SMTP (Subject: "${capturedMails[0].options.subject}")`);

    console.log('  3. STARTING_NOW: triggering now...');
    capturedMails = [];

    const rStarting = await academicEventModel.triggerReminders({
      event_id: examIdA,
      reminder_type: 'STARTING_NOW',
      user_id: TARGET_USER_ID
    });
    console.log('  triggerReminders (STARTING_NOW) result:', rStarting);
    assert.strictEqual(rStarting.success, true);
    assert(rStarting.dispatchedCount >= 1);

    await waitForMail(1, 12000);
    assert(capturedMails.length >= 1, 'STARTING_NOW email must be captured via Gmail SMTP');
    console.log(`  ✓ STARTING_NOW email sent via Gmail SMTP (Subject: "${capturedMails[0].options.subject}")`);

    // Verify all 3 distinct email logs for Exam A
    const keyScheduled = `${TARGET_USER_ID}:EXAM_SCHEDULED:${examIdA}`;
    const key1Day = `${TARGET_USER_ID}:EXAM_REMINDER:${examIdA}_1_DAY`;
    const keyStarting = `${TARGET_USER_ID}:EXAM_REMINDER:${examIdA}_STARTING`;

    await waitForEmailLog(keyScheduled, 'SENT', 8000);
    await waitForEmailLog(key1Day, 'SENT', 8000);
    await waitForEmailLog(keyStarting, 'SENT', 8000);

    const [allLogsA] = await pool.query(`
      SELECT email_log_id, email_type, event_key, status, subject, sent_at
      FROM email_logs
      WHERE event_key IN (?, ?, ?)
      ORDER BY email_log_id ASC
    `, [keyScheduled, key1Day, keyStarting]);

    console.log('\n  Exam A Lifecycle Records in email_logs:');
    allLogsA.forEach((l, idx) => {
      console.log(`    ${idx + 1}. [${l.email_type}] logId=#${l.email_log_id}, key=${l.event_key}, status=${l.status}`);
    });

    assert.strictEqual(allLogsA.length, 3, 'Exactly 3 distinct email logs must exist for Exam A');
    assert.strictEqual(allLogsA[0].email_type, 'EXAM_SCHEDULED');
    assert.strictEqual(allLogsA[0].status, 'SENT');
    assert.strictEqual(allLogsA[1].email_type, 'EXAM_REMINDER');
    assert.strictEqual(allLogsA[1].status, 'SENT');
    assert.strictEqual(allLogsA[2].email_type, 'EXAM_REMINDER');
    assert.strictEqual(allLogsA[2].status, 'SENT');
    console.log('  ✓ Verified: Total exactly 3 emails delivered for the exam (Creation, 1-Day, Starting Now)');

    // -----------------------------------------------------------------------
    // STEP 5: Clean Up Test Artifacts
    // -----------------------------------------------------------------------
    console.log('\n--- Step 5: Test Data Cleanup ---');
    if (examIdA) {
      await pool.query('DELETE FROM academic_event_reminder_logs WHERE event_id = ?', [examIdA]);
      await pool.query('DELETE FROM academic_events WHERE event_id = ?', [examIdA]);
    }
    if (examIdB) {
      await pool.query('DELETE FROM academic_event_reminder_logs WHERE event_id = ?', [examIdB]);
      await pool.query('DELETE FROM academic_events WHERE event_id = ?', [examIdB]);
    }
    console.log('  ✓ Cleaned up test exam records');

    console.log('\n========================================================================');
    console.log('  ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! (PASS)');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ VERIFICATION TEST FAILED:', err);
    await pool.query(`
      UPDATE user_email_preferences 
      SET exam_emails = 1 
      WHERE user_id = ?
    `, [TARGET_USER_ID]).catch(() => {});
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runRealExamScheduledVerification();
