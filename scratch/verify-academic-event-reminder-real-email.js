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

async function runRealAcademicEventReminderVerification() {
  console.log('========================================================================');
  console.log('  REAL END-TO-END VERIFICATION: ACADEMIC_EVENT_REMINDER (GMAIL SMTP)');
  console.log('========================================================================\n');

  const TARGET_STUDENT_ID = 96;
  const TARGET_USER_ID = 174;

  let eventIdA = null;
  let eventIdB = null;

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

    // 0.2 Ensure academic_event_emails preference is enabled
    await pool.query(`
      INSERT INTO user_email_preferences (user_id, email_enabled, academic_event_emails)
      VALUES (?, 1, 1)
      ON DUPLICATE KEY UPDATE email_enabled = 1, academic_event_emails = 1
    `, [TARGET_USER_ID]);
    console.log('  ✓ user_email_preferences confirmed: email_enabled = 1, academic_event_emails = 1');

    // Determine Tomorrow's date (for 1-day reminder window: diffDays = 1)
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    console.log(`  ✓ Reference dates: today = ${now.toISOString().split('T')[0]}, tomorrow (event date) = ${tomorrowStr}`);

    // -----------------------------------------------------------------------
    // STEP 1: Verify Event Creation Does NOT Send Email Immediately
    // -----------------------------------------------------------------------
    console.log('\n--- Step 1: Verify Event Creation Does NOT Send Email Immediately ---');
    capturedMails = [];

    const eventTitleA = 'Technical Seminar';
    const eventDescA = 'Deep dive into Modern Cloud Systems and AI Architectures';
    const eventTimeA = '11:00:00';
    const eventVenueA = 'Seminar Hall';

    // Call academicEventController.createEvent via mock req/res
    let createdEventResponseData = null;
    const mockReq = {
      user: { user_id: 1, role: 'ADMIN' },
      body: {
        title: eventTitleA,
        description: eventDescA,
        event_type: 'SEMINAR',
        start_date: tomorrowStr,
        end_date: tomorrowStr,
        start_time: eventTimeA,
        end_time: '13:00:00',
        room: eventVenueA,
        location: 'Campus Main Auditorium Block',
        target_audience: 'STUDENTS',
        instructions: 'Please arrive 15 minutes before the session starts.'
      }
    };

    const mockRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      }
    };

    await academicEventController.createEvent(mockReq, mockRes);
    assert.strictEqual(mockRes.statusCode, 201, 'Event creation should succeed with 201');
    createdEventResponseData = mockRes.jsonData.data;
    eventIdA = createdEventResponseData.event_id;
    console.log(`  ✓ Event created successfully via controller: Event ID #${eventIdA} ("${eventTitleA}")`);

    // Wait 2 seconds to confirm NO background email dispatch occurred
    await sleep(2000);
    assert.strictEqual(capturedMails.length, 0, 'Zero emails should be sent immediately upon academic event creation');
    console.log('  ✓ Verified: 0 emails dispatched immediately upon creation (Exams only receive immediate broadcasts)');

    // -----------------------------------------------------------------------
    // STEP 2: Trigger 1-Day Reminder & Verify Real Gmail SMTP Delivery
    // -----------------------------------------------------------------------
    console.log('\n--- Step 2: Trigger 1-Day Reminder & Verify Real Gmail Delivery ---');
    capturedMails = [];

    // Trigger reminders for the tomorrow event targeting our test student
    console.log(`  Triggering reminder for event #${eventIdA} (date=${tomorrowStr}, targetUser=${TARGET_USER_ID})...`);
    const reminderResult = await academicEventModel.triggerReminders({
      event_id: eventIdA,
      user_id: TARGET_USER_ID
    });
    console.log('  triggerReminders result:', reminderResult);
    assert.strictEqual(reminderResult.success, true);
    assert(reminderResult.dispatchedCount >= 1, 'At least 1 reminder must be dispatched');

    // Wait for async Gmail SMTP transmission
    console.log('  Waiting for async email transmission via Gmail SMTP...');
    await waitForMail(1, 12000);
    assert(capturedMails.length >= 1, 'Email must be captured via Gmail SMTP');

    // 2.1 Verify in-app notification in DB
    const [notifRows] = await pool.query(`
      SELECT notification_id, recipient_user_id, title, message, notification_type, is_read, created_at
      FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'ACADEMIC_EVENT_REMINDER'
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID]);

    assert(notifRows.length > 0, 'In-app ACADEMIC_EVENT_REMINDER notification must exist');
    const notifA = notifRows[0];
    console.log(`  ✓ In-app Notification #${notifA.notification_id} created:`);
    console.log(`    Title:   ${notifA.title}`);
    console.log(`    Message: ${notifA.message}`);
    assert(notifA.title.includes(eventTitleA), 'Notification title must include event title');
    assert(notifA.message.includes(eventTitleA), 'Notification message must include event title');

    // 2.2 Verify email_logs in DB
    const expectedEventKeyA = `${TARGET_USER_ID}:ACADEMIC_EVENT_REMINDER:${eventIdA}_1_DAY`;
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
    assert.strictEqual(emailLogA.email_type, 'ACADEMIC_EVENT_REMINDER');

    // 2.3 Verify Real Gmail SMTP Transmission and Contents
    const sentMailA = capturedMails[0];
    console.log(`  ✓ Gmail SMTP confirmed delivery (MessageID: ${sentMailA.result.messageId})`);

    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const [ey, em, ed] = tomorrowStr.split('-');
    const expectedFormattedDate = `${parseInt(ed, 10)} ${months[parseInt(em, 10) - 1]} ${ey}`;

    // Subject
    assert(sentMailA.options.subject.includes(eventTitleA), 'Subject must include event title');
    assert(sentMailA.options.subject.includes('Tomorrow'), 'Subject must indicate tomorrow');

    // HTML Content
    assert(sentMailA.options.html.includes(emailTemplates.escapeHtml(eventTitleA)), 'HTML must include event title');
    assert(sentMailA.options.html.includes(expectedFormattedDate), 'HTML must include event date');
    assert(sentMailA.options.html.includes('11:00 AM'), 'HTML must include event time');
    assert(sentMailA.options.html.includes(eventVenueA), 'HTML must include venue');
    assert(sentMailA.options.html.includes(emailTemplates.escapeHtml(eventDescA)), 'HTML must include description');
    assert(sentMailA.options.html.includes('This is a reminder that your academic event is scheduled for tomorrow.'), 'HTML must include reminder message');

    // Plain Text Content
    assert(sentMailA.options.text.includes(eventTitleA), 'Text must include event title');
    assert(sentMailA.options.text.includes(expectedFormattedDate), 'Text must include event date');
    assert(sentMailA.options.text.includes('11:00 AM'), 'Text must include event time');
    assert(sentMailA.options.text.includes(eventVenueA), 'Text must include venue');
    assert(sentMailA.options.text.includes(eventDescA), 'Text must include description');
    assert(sentMailA.options.text.includes('This is a reminder that your academic event is scheduled for tomorrow.'), 'Text must include reminder message');

    console.log(`  ✓ Email contents verified:`);
    console.log(`    - Event title:       "${eventTitleA}"`);
    console.log(`    - Event date:        "${expectedFormattedDate}"`);
    console.log(`    - Event time:        "11:00 AM"`);
    console.log(`    - Venue:             "${eventVenueA}"`);
    console.log(`    - Description:       "${eventDescA}"`);
    console.log(`    - Reminder message:  "This is a reminder that your academic event is scheduled for tomorrow."`);

    // -----------------------------------------------------------------------
    // STEP 3: Duplicate Prevention Verification (Re-triggering Same Event)
    // -----------------------------------------------------------------------
    console.log('\n--- Step 3: Duplicate Prevention Verification (Same Event) ---');
    capturedMails = [];

    console.log('  Re-triggering reminder for the SAME event and student...');
    const dupResult = await academicEventModel.triggerReminders({
      event_id: eventIdA,
      user_id: TARGET_USER_ID
    });
    console.log('  Duplicate trigger result:', dupResult);
    assert.strictEqual(dupResult.dispatchedCount, 0, '0 reminders should be dispatched on re-trigger');

    await sleep(2000);
    assert.strictEqual(capturedMails.length, 0, 'Zero emails should be sent over SMTP on duplicate trigger');

    const [dupCheckA] = await pool.query('SELECT COUNT(*) AS c FROM email_logs WHERE event_key = ?', [expectedEventKeyA]);
    assert.strictEqual(dupCheckA[0].c, 1, `Exactly 1 log entry must exist for ${expectedEventKeyA}`);
    console.log(`  ✓ Duplicate prevention verified: Exactly 1 email_log record, 0 retransmissions`);

    // -----------------------------------------------------------------------
    // STEP 4: Email Preference Verification (academic_event_emails = OFF)
    // -----------------------------------------------------------------------
    console.log('\n--- Step 4: Email Preference Verification (academic_event_emails = OFF) ---');
    capturedMails = [];

    // Create Event B
    const eventTitleB = 'Annual Research Symposium';
    const eventDescB = 'Presentations of faculty and student research publications';
    const eventTimeB = '14:00:00';
    const eventVenueB = 'Auditorium Hall B';

    const mockReqB = {
      user: { user_id: 1, role: 'ADMIN' },
      body: {
        title: eventTitleB,
        description: eventDescB,
        event_type: 'COLLEGE_EVENT',
        start_date: tomorrowStr,
        end_date: tomorrowStr,
        start_time: eventTimeB,
        end_time: '17:00:00',
        room: eventVenueB,
        location: 'Main Campus',
        target_audience: 'STUDENTS'
      }
    };

    const mockResB = {
      status(code) { this.statusCode = code; return this; },
      json(data) { this.jsonData = data; return this; }
    };

    await academicEventController.createEvent(mockReqB, mockResB);
    assert.strictEqual(mockResB.statusCode, 201);
    eventIdB = mockResB.jsonData.data.event_id;
    console.log(`  ✓ Created Event B #${eventIdB}: "${eventTitleB}"`);

    // Set preference academic_event_emails = 0
    await pool.query(`
      UPDATE user_email_preferences 
      SET academic_event_emails = 0 
      WHERE user_id = ?
    `, [TARGET_USER_ID]);
    console.log(`  ✓ Temporarily set academic_event_emails = 0 for user #${TARGET_USER_ID}`);

    // Trigger reminder for Event B
    const prefTestResult = await academicEventModel.triggerReminders({
      event_id: eventIdB,
      user_id: TARGET_USER_ID
    });
    console.log('  triggerReminders for Event B result:', prefTestResult);
    assert.strictEqual(prefTestResult.success, true);
    assert(prefTestResult.dispatchedCount >= 1, 'In-app reminder should still be dispatched');

    await sleep(2500);

    // Verify 0 emails sent via SMTP
    assert.strictEqual(capturedMails.length, 0, 'Zero emails should be sent when academic_event_emails = OFF');

    // Verify in-app notification WAS created
    const [prefNotifs] = await pool.query(`
      SELECT notification_id, recipient_user_id, title, message, notification_type
      FROM notifications
      WHERE recipient_user_id = ? AND title LIKE ?
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID, `%${eventTitleB}%`]);
    assert(prefNotifs.length > 0, 'In-app notification must still be created when preference is OFF');
    console.log(`  ✓ In-app Notification #${prefNotifs[0].notification_id} created successfully despite preference = OFF`);

    // Verify no email_logs record with SENT status
    const expectedEventKeyB = `${TARGET_USER_ID}:ACADEMIC_EVENT_REMINDER:${eventIdB}_1_DAY`;
    const [prefLogs] = await pool.query('SELECT * FROM email_logs WHERE event_key = ?', [expectedEventKeyB]);
    assert.strictEqual(prefLogs.length, 0, 'No email_logs record should exist (skipped before log)');
    console.log('  ✓ Email delivery skipped cleanly due to EMAIL_PREFERENCE_DISABLED');

    // Restore preference to ON (1)
    await pool.query(`
      UPDATE user_email_preferences 
      SET academic_event_emails = 1 
      WHERE user_id = ?
    `, [TARGET_USER_ID]);
    console.log('  ✓ Restored academic_event_emails = 1');

    // -----------------------------------------------------------------------
    // STEP 5: Verify Business Rule - Normal Academic Events Do NOT Send 7-day, 3-day, or Same-day Reminders
    // -----------------------------------------------------------------------
    console.log('\n--- Step 5: Verify Normal Events Do NOT Dispatch 7-day, 3-day, or Same-day ---');
    capturedMails = [];

    // Test a normal event 7 days in the future
    const day7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const [event7Res] = await pool.query(`
      INSERT INTO academic_events (title, event_type, start_date, end_date, target_audience, created_by_user_id)
      VALUES ('Future 7-Day Workshop', 'SEMINAR', ?, ?, 'STUDENTS', 1)
    `, [day7, day7]);
    const event7Id = event7Res.insertId;

    const r7 = await academicEventModel.triggerReminders({ event_id: event7Id, user_id: TARGET_USER_ID });
    console.log('  triggerReminders for 7-day future normal event:', r7);
    assert.strictEqual(r7.dispatchedCount, 0, 'Normal academic event 7 days out must NOT dispatch reminders');
    await pool.query('DELETE FROM academic_events WHERE event_id = ?', [event7Id]);
    console.log('  ✓ Verified: 7-day reminder correctly ignored for normal academic events');

    // Test a normal event today (diffDays = 0)
    const todayStrRef = now.toISOString().split('T')[0];
    const [event0Res] = await pool.query(`
      INSERT INTO academic_events (title, event_type, start_date, end_date, target_audience, created_by_user_id)
      VALUES ('Today Seminar', 'SEMINAR', ?, ?, 'STUDENTS', 1)
    `, [todayStrRef, todayStrRef]);
    const event0Id = event0Res.insertId;

    const r0 = await academicEventModel.triggerReminders({ event_id: event0Id, user_id: TARGET_USER_ID });
    console.log('  triggerReminders for today normal event:', r0);
    assert.strictEqual(r0.dispatchedCount, 0, 'Normal academic event today must NOT dispatch reminders (1-day only)');
    await pool.query('DELETE FROM academic_events WHERE event_id = ?', [event0Id]);
    console.log('  ✓ Verified: today reminder correctly ignored for normal academic events');

    // -----------------------------------------------------------------------
    // STEP 6: Clean Up Test Artifacts
    // -----------------------------------------------------------------------
    console.log('\n--- Step 6: Test Data Cleanup ---');
    if (eventIdA) {
      await pool.query('DELETE FROM academic_event_reminder_logs WHERE event_id = ?', [eventIdA]);
      await pool.query('DELETE FROM academic_events WHERE event_id = ?', [eventIdA]);
    }
    if (eventIdB) {
      await pool.query('DELETE FROM academic_event_reminder_logs WHERE event_id = ?', [eventIdB]);
      await pool.query('DELETE FROM academic_events WHERE event_id = ?', [eventIdB]);
    }
    console.log('  ✓ Cleaned up test academic events and reminder logs');

    console.log('\n========================================================================');
    console.log('  ALL VERIFICATION TESTS PASSED SUCCESSFULLY! (PASS)');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ VERIFICATION TEST FAILED:', err);
    // Always restore preference if error occurred
    await pool.query(`
      UPDATE user_email_preferences 
      SET academic_event_emails = 1 
      WHERE user_id = ?
    `, [TARGET_USER_ID]).catch(() => {});
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runRealAcademicEventReminderVerification();
