require('dotenv').config();
const assert = require('assert');
const nodemailer = require('nodemailer');
const pool = require('../src/config/db');

// Spy on nodemailer to capture the exact mail transmitted via real Gmail SMTP
let capturedMailOptions = null;
let capturedSendResult = null;
const originalCreateTransport = nodemailer.createTransport;

nodemailer.createTransport = function (...args) {
  const transporter = originalCreateTransport.apply(this, args);
  const originalSendMail = transporter.sendMail.bind(transporter);
  transporter.sendMail = async function (mailOptions) {
    capturedMailOptions = mailOptions;
    console.log('\n[REAL GMAIL SMTP] Connecting to smtp.gmail.com:587...');
    console.log(`[REAL GMAIL SMTP] Sending to: ${mailOptions.to}`);
    console.log(`[REAL GMAIL SMTP] Subject: ${mailOptions.subject}`);
    const result = await originalSendMail(mailOptions);
    capturedSendResult = result;
    console.log(`[REAL GMAIL SMTP] Response from Gmail: ${result.response || JSON.stringify(result)}`);
    console.log(`[REAL GMAIL SMTP] Message ID: ${result.messageId}`);
    return result;
  };
  return transporter;
};

const assignmentController = require('../src/controllers/assignment.controller');
const notificationEmailService = require('../src/services/notificationEmail.service');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runRealOverdueVerification() {
  console.log('========================================================================');
  console.log('  REAL END-TO-END VERIFICATION: ASSIGNMENT_OVERDUE EMAIL DELIVERY');
  console.log('========================================================================\n');

  const TARGET_STUDENT_ID = 96;
  const TARGET_USER_ID = 174;
  const TARGET_ASSIGNMENT_ID = 76;
  const TARGET_COURSE_ID = 146;

  try {
    // -----------------------------------------------------------------------
    // STEP 0: Prerequisites Inspection & Preparation
    // -----------------------------------------------------------------------
    console.log('--- Step 0: Checking Prerequisites ---');

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

    // 0.2 Verify Active Enrollment
    const [enrollmentRows] = await pool.query(`
      SELECT e.enrollment_id, e.status, c.course_id, c.course_code, c.course_name
      FROM enrollments e
      JOIN courses c ON e.course_id = c.course_id
      WHERE e.student_id = ? AND e.course_id = ? AND e.status = 'Enrolled'
    `, [TARGET_STUDENT_ID, TARGET_COURSE_ID]);
    assert(enrollmentRows.length > 0, `Student ${TARGET_STUDENT_ID} must be enrolled in course ${TARGET_COURSE_ID}`);
    console.log(`  ✓ Enrolled in: ${enrollmentRows[0].course_code} - ${enrollmentRows[0].course_name}`);

    // 0.3 Verify Assignment Exists
    const [assignmentRows] = await pool.query(`
      SELECT assignment_id, course_id, title, due_date
      FROM assignments
      WHERE assignment_id = ?
    `, [TARGET_ASSIGNMENT_ID]);
    assert(assignmentRows.length > 0, `Assignment ${TARGET_ASSIGNMENT_ID} must exist`);
    const assignment = assignmentRows[0];
    console.log(`  ✓ Assignment: ID=${assignment.assignment_id}, Title="${assignment.title}"`);

    // 0.4 Verify No Existing Submission
    const [subRows] = await pool.query(`
      SELECT submission_id FROM assignment_submissions
      WHERE assignment_id = ? AND student_id = ?
    `, [TARGET_ASSIGNMENT_ID, TARGET_STUDENT_ID]);
    assert.strictEqual(subRows.length, 0, 'Student must NOT have submitted the assignment');
    console.log('  ✓ No prior submission found for this student and assignment');

    // 0.5 Ensure assignment_emails preference is enabled
    await pool.query(`
      INSERT INTO user_email_preferences (user_id, email_enabled, assignment_emails)
      VALUES (?, 1, 1)
      ON DUPLICATE KEY UPDATE email_enabled = 1, assignment_emails = 1
    `, [TARGET_USER_ID]);
    console.log('  ✓ user_email_preferences.assignment_emails is enabled (1)');

    // 0.6 Configure assignment due date in the past (yesterday at 10:00:00)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
    const dd = String(yesterday.getDate()).padStart(2, '0');
    const targetPastDueDateStr = `${yyyy}-${mm}-${dd} 10:00:00`;

    await pool.query(`
      UPDATE assignments
      SET due_date = ?
      WHERE assignment_id = ?
    `, [targetPastDueDateStr, TARGET_ASSIGNMENT_ID]);
    console.log(`  ✓ Updated assignment due_date to: ${targetPastDueDateStr} (past deadline)`);

    // 0.7 Clean up any existing notifications or email logs for this specific test assignment
    const notifTitle = `Assignment Overdue: ${assignment.title}`;
    await pool.query(`
      DELETE FROM notifications 
      WHERE recipient_user_id = ? AND title = ?
    `, [TARGET_USER_ID, notifTitle]);

    const targetEventKey = `${TARGET_USER_ID}:ASSIGNMENT_OVERDUE:ASSIGNMENT_${TARGET_ASSIGNMENT_ID}_OVERDUE`;
    await pool.query(`
      DELETE FROM email_logs
      WHERE event_key = ? OR (user_id = ? AND email_type = 'ASSIGNMENT_OVERDUE' AND subject LIKE ?)
    `, [targetEventKey, TARGET_USER_ID, `%${assignment.title}%`]);
    console.log('  ✓ Cleaned up any prior notification or email_logs for this test assignment');

    // -----------------------------------------------------------------------
    // STEP 1 & 2: Trigger Due Reminders & Wait for Email Dispatch
    // -----------------------------------------------------------------------
    console.log('\n--- Step 1: Triggering checkAndDispatchDueReminders for Overdue Assignment ---');

    const mockReq = {
      user: { user_id: TARGET_USER_ID, role: 'STUDENT' },
      body: { assignment_id: TARGET_ASSIGNMENT_ID }
    };
    let jsonResponse = null;
    let statusCode = null;
    const mockRes = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            jsonResponse = data;
            return data;
          }
        };
      }
    };

    await assignmentController.checkDueReminders(mockReq, mockRes);
    console.log(`  Controller response (${statusCode}):`, jsonResponse);
    assert.strictEqual(statusCode, 200, 'checkDueReminders should return HTTP 200');
    assert(jsonResponse.success, 'Response success should be true');
    assert.strictEqual(jsonResponse.data.count, 1, 'Should have dispatched 1 overdue notification');

    // Wait for the async setImmediate in notificationModel and real Gmail SMTP delivery
    console.log('\n--- Step 2: Awaiting Asynchronous Gmail SMTP Delivery ---');
    console.log('  Waiting for email_logs status to become SENT (polling up to 20s)...');

    let emailLogRecord = null;
    const startTime = Date.now();
    while (Date.now() - startTime < 20000) {
      const [logs] = await pool.query(`
        SELECT * FROM email_logs
        WHERE event_key = ? OR (user_id = ? AND email_type = 'ASSIGNMENT_OVERDUE' AND subject LIKE ?)
        ORDER BY email_log_id DESC
        LIMIT 1
      `, [targetEventKey, TARGET_USER_ID, `%${assignment.title}%`]);

      if (logs.length > 0 && (logs[0].status === 'SENT' || logs[0].status === 'FAILED')) {
        emailLogRecord = logs[0];
        break;
      }
      await sleep(1000);
    }

    assert(emailLogRecord, 'An email_log record must be created');
    console.log('  Found email_log record:', {
      email_log_id: emailLogRecord.email_log_id,
      recipient_email: emailLogRecord.recipient_email,
      user_id: emailLogRecord.user_id,
      email_type: emailLogRecord.email_type,
      subject: emailLogRecord.subject,
      status: emailLogRecord.status,
      event_key: emailLogRecord.event_key,
      sent_at: emailLogRecord.sent_at,
      error_message: emailLogRecord.error_message
    });

    // -----------------------------------------------------------------------
    // STEP 3: Verification of Required Items
    // -----------------------------------------------------------------------
    console.log('\n--- Step 3: Verifying Requirements ---');

    // 1. In-app ASSIGNMENT_OVERDUE notification is created
    const [createdNotifs] = await pool.query(`
      SELECT * FROM notifications
      WHERE recipient_user_id = ? AND title = ?
    `, [TARGET_USER_ID, notifTitle]);
    assert.strictEqual(createdNotifs.length, 1, 'In-app overdue notification must exist');
    const inAppNotif = createdNotifs[0];
    console.log('  ✓ [VERIFIED 1] In-app notification created:');
    console.log(`    - ID: ${inAppNotif.notification_id}`);
    console.log(`    - Title: "${inAppNotif.title}"`);
    console.log(`    - Message: "${inAppNotif.message}"`);
    console.log(`    - Type: ${inAppNotif.notification_type}`);

    // 2. Recipient is resolved server-side from users.email
    assert.strictEqual(emailLogRecord.recipient_email, studentUser.email, 'Recipient email in email_logs must match users.email');
    console.log(`  ✓ [VERIFIED 2] Recipient resolved server-side from users.email: ${emailLogRecord.recipient_email}`);

    // 3. email_logs contains email_type = ASSIGNMENT_OVERDUE
    assert.strictEqual(emailLogRecord.email_type, 'ASSIGNMENT_OVERDUE', 'email_type must be ASSIGNMENT_OVERDUE');
    console.log(`  ✓ [VERIFIED 3] email_logs contains email_type: ${emailLogRecord.email_type}`);

    // 4. Status becomes SENT through the existing Gmail SMTP configuration
    assert.strictEqual(emailLogRecord.status, 'SENT', `Email status must be SENT, got: ${emailLogRecord.status} (error: ${emailLogRecord.error_message})`);
    assert(emailLogRecord.sent_at, 'sent_at timestamp must be populated');
    assert.strictEqual(emailLogRecord.error_message, null, 'error_message must be null');
    assert(capturedSendResult, 'Real Gmail SMTP sendResult must be captured');
    console.log(`  ✓ [VERIFIED 4] Status is SENT via Gmail SMTP (sent_at: ${emailLogRecord.sent_at.toISOString()})`);
    console.log(`    - Gmail SMTP Response: ${capturedSendResult.response}`);
    console.log(`    - Gmail Message-ID: ${capturedSendResult.messageId}`);

    // 5. Email contains: assignment title, course, original due date, original due time, deadline (was due on), overdue duration
    assert(capturedMailOptions, 'Captured mailOptions must exist');
    const mailHtml = capturedMailOptions.html;
    const mailText = capturedMailOptions.text;

    // Check assignment title
    assert(mailHtml.includes(assignment.title), 'Email HTML must contain assignment title');
    assert(mailText.includes(assignment.title), 'Email text must contain assignment title');
    console.log(`  ✓ [VERIFIED 5a] Email contains assignment title: "${assignment.title}"`);

    // Check course
    const courseCode = enrollmentRows[0].course_code;
    assert(mailHtml.includes(courseCode), 'Email HTML must contain course code');
    assert(mailText.includes(courseCode), 'Email text must contain course code');
    console.log(`  ✓ [VERIFIED 5b] Email contains course: "${courseCode}"`);

    // Check original due date, original due time, was due on (deadline), overdue duration
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const expectedMonth = months[yesterday.getMonth()];
    const expectedDay = yesterday.getDate();
    const expectedYear = yesterday.getFullYear();
    const expectedDateStr = `${expectedDay} ${expectedMonth} ${expectedYear}`;

    assert(mailHtml.includes(expectedDateStr), `Email HTML must contain original due date: ${expectedDateStr}`);
    assert(mailText.includes(expectedDateStr), `Email text must contain original due date: ${expectedDateStr}`);
    console.log(`  ✓ [VERIFIED 5c] Email contains original due date: "${expectedDateStr}"`);

    assert(mailHtml.includes('10:00 AM'), 'Email HTML must contain original due time: "10:00 AM"');
    assert(mailText.includes('10:00 AM'), 'Email text must contain original due time: "10:00 AM"');
    console.log('  ✓ [VERIFIED 5d] Email contains original due time: "10:00 AM"');

    const expectedDeadline = `${expectedDateStr}, 10:00 AM`;
    assert(mailHtml.includes(expectedDeadline), `Email HTML must contain deadline (was due on): ${expectedDeadline}`);
    assert(mailText.includes(expectedDeadline), `Email text must contain deadline (was due on): ${expectedDeadline}`);
    console.log(`  ✓ [VERIFIED 5e] Email contains deadline (Was Due On): "${expectedDeadline}"`);

    assert(mailHtml.includes('Overdue By:'), 'Email HTML must contain Overdue By header');
    assert(mailText.includes('Overdue By:'), 'Email text must contain Overdue By header');
    console.log('  ✓ [VERIFIED 5f] Email contains overdue duration calculation');

    // 6 & 7. Re-running the reminder does not create a duplicate email; exactly one email_log exists for event_key
    console.log('\n--- Step 4: Testing Duplicate Processing Prevention & event_key Integrity ---');

    // Reset spy captures
    capturedMailOptions = null;
    capturedSendResult = null;

    // Run checkDueReminders a second time
    let secondJsonResponse = null;
    let secondStatusCode = null;
    const mockRes2 = {
      status: (code) => {
        secondStatusCode = code;
        return {
          json: (data) => {
            secondJsonResponse = data;
            return data;
          }
        };
      }
    };

    await assignmentController.checkDueReminders(mockReq, mockRes2);
    console.log(`  Second check response (${secondStatusCode}):`, secondJsonResponse);
    assert.strictEqual(secondJsonResponse.data.count, 0, 'Second run must dispatch 0 reminders');

    // Verify in-app notifications count is still strictly 1
    const [afterNotifs] = await pool.query(`
      SELECT COUNT(*) AS count FROM notifications
      WHERE recipient_user_id = ? AND title = ?
    `, [TARGET_USER_ID, notifTitle]);
    assert.strictEqual(afterNotifs[0].count, 1, 'In-app notifications count must remain strictly 1');

    // Test direct call to sendNotificationEmail with the exact same eventKey
    const directDupRes = await notificationEmailService.sendNotificationEmail({
      userId: TARGET_USER_ID,
      notificationType: 'ASSIGNMENT_OVERDUE',
      title: notifTitle,
      message: inAppNotif.message,
      metadata: {
        eventId: `ASSIGNMENT_${TARGET_ASSIGNMENT_ID}_OVERDUE`
      }
    });
    console.log('  Direct duplicate sendNotificationEmail result:', directDupRes);
    assert(directDupRes.status === 'DUPLICATE' || directDupRes.status === 'SKIPPED', `Expected status DUPLICATE or SKIPPED, got: ${directDupRes.status}`);
    assert.strictEqual(directDupRes.duplicate, true, 'Direct duplicate call should flag duplicate: true');
    assert.strictEqual(capturedSendResult, null, 'No SMTP transmission should occur on duplicate');

    // 7. Verify event_key and confirm exactly one email_log exists for that event
    assert.strictEqual(emailLogRecord.event_key, targetEventKey, `event_key must match ${targetEventKey}`);
    console.log(`  ✓ [VERIFIED 7a] Verified event_key: ${emailLogRecord.event_key}`);

    const [afterEmailLogs] = await pool.query(`
      SELECT * FROM email_logs
      WHERE event_key = ?
    `, [targetEventKey]);
    assert.strictEqual(afterEmailLogs.length, 1, `Expected exactly 1 email_log record for event_key ${targetEventKey}, found: ${afterEmailLogs.length}`);
    console.log(`  ✓ [VERIFIED 7b] Confirmed exactly 1 email_log record exists for event_key: ${targetEventKey}`);

    // -----------------------------------------------------------------------
    // SUCCESS SUMMARY
    // -----------------------------------------------------------------------
    console.log('\n========================================================================');
    console.log('  ALL ASSIGNMENT_OVERDUE VERIFICATION REQUIREMENTS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');

    console.log('EXACT EMAIL_LOG RECORD:');
    console.log(JSON.stringify(emailLogRecord, null, 2));

  } catch (err) {
    console.error('\n❌ VERIFICATION FAILED:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runRealOverdueVerification();
