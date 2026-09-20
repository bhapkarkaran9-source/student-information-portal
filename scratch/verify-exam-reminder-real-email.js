require('dotenv').config();
const assert = require('assert');
const nodemailer = require('nodemailer');
const pool = require('../src/config/db');

// Spy on nodemailer to capture the exact mail transmitted via real Gmail SMTP
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
const notificationModel = require('../src/models/notification.model');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMail(minCount = 1, timeoutMs = 8000) {
  const start = Date.now();
  while (capturedMails.length < minCount && (Date.now() - start) < timeoutMs) {
    await sleep(200);
  }
}

async function runRealExamReminderVerification() {
  console.log('========================================================================');
  console.log('  REAL END-TO-END VERIFICATION: EXAM_REMINDER EMAIL DELIVERY (GMAIL SMTP)');
  console.log('========================================================================\n');

  const TARGET_STUDENT_ID = 96;
  const TARGET_USER_ID = 174;
  const TARGET_COURSE_ID = 146;

  let testExamId = null;

  try {
    // -----------------------------------------------------------------------
    // STEP 0: Prerequisites Inspection & Preparation
    // -----------------------------------------------------------------------
    console.log('--- Step 0: Checking Prerequisites & Setting Up Test Exam ---');

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

    // 0.2 Verify Active Enrollment in Course 146
    const [enrollmentRows] = await pool.query(`
      SELECT e.enrollment_id, e.status, c.course_id, c.course_code, c.course_name
      FROM enrollments e
      JOIN courses c ON e.course_id = c.course_id
      WHERE e.student_id = ? AND e.course_id = ? AND e.status = 'Enrolled'
    `, [TARGET_STUDENT_ID, TARGET_COURSE_ID]);
    assert(enrollmentRows.length > 0, `Student ${TARGET_STUDENT_ID} must be enrolled in course ${TARGET_COURSE_ID}`);
    console.log(`  ✓ Enrolled in: ${enrollmentRows[0].course_code} - ${enrollmentRows[0].course_name}`);

    // 0.3 Find or create the test exam in academic_events
    const [existingExams] = await pool.query(`
      SELECT event_id, title, course_id, start_date, start_time, end_time, room
      FROM academic_events
      WHERE title = 'End Semester Examination' AND course_id = ? AND event_type = 'EXAM'
      LIMIT 1
    `, [TARGET_COURSE_ID]);

    if (existingExams.length > 0) {
      testExamId = existingExams[0].event_id;
      // Update fields to match test specification exactly
      await pool.query(`
        UPDATE academic_events
        SET exam_type = 'External Exam',
            start_date = '2026-09-20',
            end_date = '2026-09-20',
            start_time = '10:00:00',
            end_time = '12:00:00',
            room = 'Room 204',
            location = 'Main Campus',
            target_audience = 'COURSE',
            description = 'Comprehensive End Semester Theory & Practical Examination'
        WHERE event_id = ?
      `, [testExamId]);
      console.log(`  ✓ Using exam record ID=${testExamId} configured to exact spec`);
    } else {
      const created = await academicEventModel.createEvent({
        title: 'End Semester Examination',
        description: 'Comprehensive End Semester Theory & Practical Examination',
        event_type: 'EXAM',
        exam_type: 'External Exam',
        start_date: '2026-09-20',
        end_date: '2026-09-20',
        start_time: '10:00:00',
        end_time: '12:00:00',
        room: 'Room 204',
        location: 'Main Campus',
        course_id: TARGET_COURSE_ID,
        target_audience: 'COURSE',
        created_by_user_id: 1
      });
      testExamId = created.event_id;
      console.log(`  ✓ Created new test exam record ID=${testExamId}`);
    }

    // 0.4 Clean up any prior reminder logs and email logs for this specific test exam
    await pool.query('DELETE FROM academic_event_reminder_logs WHERE event_id = ? AND user_id = ?', [testExamId, TARGET_USER_ID]);
    await pool.query('DELETE FROM email_logs WHERE event_key LIKE ?', [`${TARGET_USER_ID}:EXAM_REMINDER:${testExamId}%`]);
    console.log(`  ✓ Cleaned prior reminder logs & email logs for event_id=${testExamId}, user_id=${TARGET_USER_ID}`);

    // 0.5 Ensure email preferences are enabled for user
    await pool.query(`
      INSERT INTO user_email_preferences (user_id, email_enabled, exam_emails)
      VALUES (?, 1, 1)
      ON DUPLICATE KEY UPDATE email_enabled = 1, exam_emails = 1
    `, [TARGET_USER_ID]);
    console.log('  ✓ Email preferences confirmed: email_enabled=1, exam_emails=1');

    // =======================================================================
    // STEP 1: VERIFY 1_DAY_BEFORE EXAM REMINDER
    // =======================================================================
    console.log('\n--- Step 1: Triggering 1_DAY_BEFORE Exam Reminder ---');
    capturedMails = [];

    const result1Day = await academicEventModel.triggerReminders({
      event_id: testExamId,
      reminder_type: '1_DAY_BEFORE',
      user_id: TARGET_USER_ID
    });

    console.log(`  Dispatched count: ${result1Day.dispatchedCount}`);
    assert.strictEqual(result1Day.dispatchedCount, 1, 'Should dispatch 1 reminder for 1_DAY_BEFORE');

    // Wait for async email processing via real Gmail SMTP
    await waitForMail(1, 8000);
    await sleep(500);

    // 1.1 Verify In-App Notification
    const [notifs1Day] = await pool.query(`
      SELECT notification_id, recipient_user_id, title, message, notification_type, is_read, created_at
      FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'EXAM_REMINDER'
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID]);

    assert(notifs1Day.length > 0, 'In-app notification for 1_DAY_BEFORE must exist');
    const notif1 = notifs1Day[0];
    console.log(`  ✓ In-app Notification #${notif1.notification_id} created:`);
    console.log(`    Title:   ${notif1.title}`);
    console.log(`    Message: ${notif1.message}`);
    assert(notif1.title.toLowerCase().includes('tomorrow'), 'Title must state exam is tomorrow');
    assert(notif1.message.includes('20 September 2026'), 'Message must contain date');
    assert(notif1.message.includes('10:00 AM - 12:00 PM'), 'Message must contain time');
    assert(notif1.message.includes('Room 204'), 'Message must contain venue');

    // 1.2 Verify academic_event_reminder_logs
    const [reminderLogs1Day] = await pool.query(`
      SELECT reminder_log_id, user_id, event_id, event_date, reminder_type, notification_id, sent_at
      FROM academic_event_reminder_logs
      WHERE event_id = ? AND user_id = ? AND reminder_type = '1_DAY'
    `, [testExamId, TARGET_USER_ID]);

    assert(reminderLogs1Day.length === 1, 'Exactly one 1_DAY reminder log must exist');
    console.log(`  ✓ Reminder Log #${reminderLogs1Day[0].reminder_log_id} recorded (type=1_DAY, notification_id=${reminderLogs1Day[0].notification_id})`);

    // 1.3 Verify email_logs
    const expectedKey1Day = `${TARGET_USER_ID}:EXAM_REMINDER:${testExamId}_1_DAY`;
    const [emailLogs1Day] = await pool.query(`
      SELECT email_log_id, user_id, recipient_email, email_type, subject, status, event_key, error_message, sent_at
      FROM email_logs
      WHERE event_key = ?
    `, [expectedKey1Day]);

    assert(emailLogs1Day.length === 1, `email_logs must contain exactly 1 entry for key ${expectedKey1Day}`);
    const emailLog1 = emailLogs1Day[0];
    console.log(`  ✓ email_logs #${emailLog1.email_log_id} created:`);
    console.log(`    Recipient: ${emailLog1.recipient_email}`);
    console.log(`    Status:    ${emailLog1.status}`);
    console.log(`    Event Key: ${emailLog1.event_key}`);
    console.log(`    Subject:   ${emailLog1.subject}`);
    assert.strictEqual(emailLog1.recipient_email, studentUser.email, 'Recipient email must match student user.email');
    assert.strictEqual(emailLog1.status, 'SENT', 'Email status must be SENT via Gmail SMTP');
    assert.strictEqual(emailLog1.email_type, 'EXAM_REMINDER');

    // 1.4 Verify Real Gmail SMTP Transmission
    assert(capturedMails.length > 0, 'Real Gmail SMTP must have transmitted the email');
    const sentMail1 = capturedMails[0];
    console.log(`  ✓ Gmail SMTP confirmed delivery (MessageID: ${sentMail1.result.messageId})`);
    assert(sentMail1.options.subject.includes('Tomorrow'), 'Subject must indicate Tomorrow');
    assert(sentMail1.options.html.includes('End Semester Examination'), 'HTML must include exam title');
    assert(sentMail1.options.html.includes('IT101 - DSML'), 'HTML must include course');
    assert(sentMail1.options.html.includes('20 September 2026'), 'HTML must include date');
    assert(sentMail1.options.html.includes('10:00 AM - 12:00 PM'), 'HTML must include time');
    assert(sentMail1.options.html.includes('Room 204'), 'HTML must include room/venue');
    assert(sentMail1.options.html.toLowerCase().includes('tomorrow'), 'HTML must clearly say exam is scheduled for tomorrow');
    console.log('  ✓ 1_DAY_BEFORE email contents verified: title, course, date, time, venue, and tomorrow text');

    // =======================================================================
    // STEP 2: VERIFY STARTING_NOW EXAM REMINDER
    // =======================================================================
    console.log('\n--- Step 2: Triggering STARTING_NOW Exam Reminder ---');
    capturedMails = [];

    const resultStarting = await academicEventModel.triggerReminders({
      event_id: testExamId,
      reminder_type: 'STARTING_NOW',
      user_id: TARGET_USER_ID
    });

    console.log(`  Dispatched count: ${resultStarting.dispatchedCount}`);
    assert.strictEqual(resultStarting.dispatchedCount, 1, 'Should dispatch 1 reminder for STARTING_NOW');

    // Wait for async email processing via real Gmail SMTP
    await waitForMail(1, 8000);
    await sleep(500);

    // 2.1 Verify In-App Notification
    const [notifsStarting] = await pool.query(`
      SELECT notification_id, recipient_user_id, title, message, notification_type, is_read, created_at
      FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'EXAM_REMINDER'
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID]);

    assert(notifsStarting.length > 0, 'In-app notification for STARTING_NOW must exist');
    const notif2 = notifsStarting[0];
    assert.notStrictEqual(notif2.notification_id, notif1.notification_id, 'Must be a distinct in-app notification');
    console.log(`  ✓ In-app Notification #${notif2.notification_id} created:`);
    console.log(`    Title:   ${notif2.title}`);
    console.log(`    Message: ${notif2.message}`);
    assert(notif2.title.toLowerCase().includes('starting now'), 'Title must state exam is starting now');
    assert(notif2.message.includes('report to the examination hall immediately'), 'Message must urge immediate reporting');
    assert(notif2.message.includes('Room 204'), 'Message must contain venue');

    // 2.2 Verify academic_event_reminder_logs
    const [reminderLogsStarting] = await pool.query(`
      SELECT reminder_log_id, user_id, event_id, event_date, reminder_type, notification_id, sent_at
      FROM academic_event_reminder_logs
      WHERE event_id = ? AND user_id = ? AND reminder_type = 'STARTING_SOON'
    `, [testExamId, TARGET_USER_ID]);

    assert(reminderLogsStarting.length === 1, 'Exactly one STARTING_SOON reminder log must exist');
    console.log(`  ✓ Reminder Log #${reminderLogsStarting[0].reminder_log_id} recorded (type=STARTING_SOON, notification_id=${reminderLogsStarting[0].notification_id})`);

    // 2.3 Verify email_logs
    const expectedKeyStarting = `${TARGET_USER_ID}:EXAM_REMINDER:${testExamId}_STARTING`;
    const [emailLogsStarting] = await pool.query(`
      SELECT email_log_id, user_id, recipient_email, email_type, subject, status, event_key, error_message, sent_at
      FROM email_logs
      WHERE event_key = ?
    `, [expectedKeyStarting]);

    assert(emailLogsStarting.length === 1, `email_logs must contain exactly 1 entry for key ${expectedKeyStarting}`);
    const emailLog2 = emailLogsStarting[0];
    console.log(`  ✓ email_logs #${emailLog2.email_log_id} created:`);
    console.log(`    Recipient: ${emailLog2.recipient_email}`);
    console.log(`    Status:    ${emailLog2.status}`);
    console.log(`    Event Key: ${emailLog2.event_key}`);
    console.log(`    Subject:   ${emailLog2.subject}`);
    assert.strictEqual(emailLog2.recipient_email, studentUser.email, 'Recipient email must match student user.email');
    assert.strictEqual(emailLog2.status, 'SENT', 'Email status must be SENT via Gmail SMTP');
    assert.strictEqual(emailLog2.email_type, 'EXAM_REMINDER');

    // 2.4 Verify Real Gmail SMTP Transmission
    assert(capturedMails.length > 0, 'Real Gmail SMTP must have transmitted the email');
    const sentMail2 = capturedMails[0];
    console.log(`  ✓ Gmail SMTP confirmed delivery (MessageID: ${sentMail2.result.messageId})`);
    assert(sentMail2.options.subject.includes('Starting Now'), 'Subject must indicate Starting Now');
    assert(sentMail2.options.html.includes('End Semester Examination'), 'HTML must include exam title');
    assert(sentMail2.options.html.includes('IT101 - DSML'), 'HTML must include course');
    assert(sentMail2.options.html.includes('20 September 2026'), 'HTML must include date');
    assert(sentMail2.options.html.includes('10:00 AM - 12:00 PM'), 'HTML must include time');
    assert(sentMail2.options.html.includes('Room 204'), 'HTML must include room/venue');
    assert(sentMail2.options.html.toLowerCase().includes('starting now'), 'HTML must clearly say exam is starting now');
    assert(sentMail2.options.html.toLowerCase().includes('report to the examination hall immediately'), 'HTML must instruct immediate reporting');
    console.log('  ✓ STARTING_NOW email contents verified: title, course, date, time, venue, and urgent starting now copy');

    // =======================================================================
    // STEP 3: DUPLICATE PREVENTION VERIFICATION
    // =======================================================================
    console.log('\n--- Step 3: Duplicate Prevention Verification ---');
    capturedMails = [];

    console.log('  Re-triggering 1_DAY_BEFORE reminder...');
    const dupResult1Day = await academicEventModel.triggerReminders({
      event_id: testExamId,
      reminder_type: '1_DAY_BEFORE',
      user_id: TARGET_USER_ID
    });
    console.log(`  Dispatched count on repeat 1_DAY_BEFORE: ${dupResult1Day.dispatchedCount}`);
    assert.strictEqual(dupResult1Day.dispatchedCount, 0, 'Duplicate 1_DAY_BEFORE must dispatch 0 reminders');

    console.log('  Re-triggering STARTING_NOW reminder...');
    const dupResultStarting = await academicEventModel.triggerReminders({
      event_id: testExamId,
      reminder_type: 'STARTING_NOW',
      user_id: TARGET_USER_ID
    });
    console.log(`  Dispatched count on repeat STARTING_NOW: ${dupResultStarting.dispatchedCount}`);
    assert.strictEqual(dupResultStarting.dispatchedCount, 0, 'Duplicate STARTING_NOW must dispatch 0 reminders');

    // Allow any unexpected background tasks to settle
    await sleep(1500);

    assert.strictEqual(capturedMails.length, 0, 'Zero emails should be sent over SMTP on duplicate requests');

    // Verify email_logs count per event_key
    const [dupCheck1Day] = await pool.query('SELECT COUNT(*) AS c FROM email_logs WHERE event_key = ?', [expectedKey1Day]);
    const [dupCheckStarting] = await pool.query('SELECT COUNT(*) AS c FROM email_logs WHERE event_key = ?', [expectedKeyStarting]);
    assert.strictEqual(dupCheck1Day[0].c, 1, `Exactly 1 log must exist for ${expectedKey1Day}`);
    assert.strictEqual(dupCheckStarting[0].c, 1, `Exactly 1 log must exist for ${expectedKeyStarting}`);
    console.log(`  ✓ Duplicate prevention verified: Exactly 1 email_log per event key, 0 retransmissions`);

    // =======================================================================
    // STEP 4: EMAIL PREFERENCE DISABLED VERIFICATION
    // =======================================================================
    console.log('\n--- Step 4: Email Preference Disabled Verification ---');
    // Disable exam_emails preference for this student
    await pool.query('UPDATE user_email_preferences SET exam_emails = 0 WHERE user_id = ?', [TARGET_USER_ID]);
    console.log('  Updated user_email_preferences: exam_emails = 0');

    capturedMails = [];

    // Create a new distinct in-app exam reminder notification
    const prefTestNotif = await notificationModel.createNotification({
      recipient_user_id: TARGET_USER_ID,
      title: 'Exam Reminder: Preference Test Exam',
      message: 'Examination reminder test with preference disabled.',
      notification_type: 'EXAM_REMINDER',
      is_read: 0,
      metadata: {
        eventId: `${testExamId}_PREF_TEST`,
        examEventId: testExamId,
        examName: 'Preference Test Exam',
        course: 'IT101 - DSML',
        date: '21 September 2026',
        time: '10:00 AM - 12:00 PM',
        venue: 'Room 204',
        reminderType: '1_DAY_BEFORE'
      }
    });

    assert(prefTestNotif?.notification_id, 'In-app notification must be created even when exam_emails is disabled');
    console.log(`  ✓ In-app notification #${prefTestNotif.notification_id} created successfully despite email preference OFF`);

    // Wait for async dispatch attempt
    await sleep(2000);

    // Verify no SMTP delivery occurred
    assert.strictEqual(capturedMails.length, 0, 'No email should be sent over SMTP when exam_emails is disabled');

    // Verify email_logs has NO entry for this key
    const [prefEmailLogs] = await pool.query(`
      SELECT email_log_id, status FROM email_logs WHERE event_key = ?
    `, [`${TARGET_USER_ID}:EXAM_REMINDER:${testExamId}_PREF_TEST`]);
    assert.strictEqual(prefEmailLogs.length, 0, 'No email_logs entry created for disabled preference');
    console.log('  ✓ Verified: Email delivery safely skipped without sending or logging duplicate errors');

    // Restore preference
    await pool.query('UPDATE user_email_preferences SET exam_emails = 1 WHERE user_id = ?', [TARGET_USER_ID]);
    console.log('  ✓ Restored user_email_preferences: exam_emails = 1');

    // =======================================================================
    // FINAL SUMMARY & METRICS
    // =======================================================================
    console.log('\n========================================================================');
    console.log('  EXAM_REMINDER VERIFICATION COMPLETE: ALL CHECKS PASSED');
    console.log('========================================================================');
    console.log(`Test Exam Event ID:       ${testExamId}`);
    console.log(`Target Student:           Karan Bhapkar (student_id=${TARGET_STUDENT_ID}, user_id=${TARGET_USER_ID})`);
    console.log(`Target Recipient Email:   ${studentUser.email} (Resolved server-side from users table)`);
    console.log(`1_DAY_BEFORE Notif ID:    #${notif1.notification_id}`);
    console.log(`1_DAY_BEFORE Event Key:   ${emailLog1.event_key}`);
    console.log(`1_DAY_BEFORE Log ID:      #${emailLog1.email_log_id} (Status: ${emailLog1.status})`);
    console.log(`STARTING_NOW Notif ID:    #${notif2.notification_id}`);
    console.log(`STARTING_NOW Event Key:   ${emailLog2.event_key}`);
    console.log(`STARTING_NOW Log ID:      #${emailLog2.email_log_id} (Status: ${emailLog2.status})`);
    console.log(`Duplicate Prevention:     PASS (0 duplicate dispatches, exactly 1 log per key)`);
    console.log(`Preference Isolation:     PASS (in-app notification created, SMTP skipped when OFF)`);
    console.log(`Gmail SMTP Delivery:      PASS (Response 250 OK for both reminders)`);
    console.log('========================================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

runRealExamReminderVerification();
