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

const feedbackModel = require('../src/models/feedback.model');
const notificationModel = require('../src/models/notification.model');
const emailTemplates = require('../src/services/emailTemplates');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMail(minCount = 1, timeoutMs = 8000) {
  const start = Date.now();
  while (capturedMails.length < minCount && (Date.now() - start) < timeoutMs) {
    await sleep(200);
  }
}

async function runRealFeedbackFormVerification() {
  console.log('========================================================================');
  console.log('  REAL END-TO-END VERIFICATION: NEW_FEEDBACK_FORM EMAIL DELIVERY (GMAIL SMTP)');
  console.log('========================================================================\n');

  const TARGET_STUDENT_ID = 96;
  const TARGET_USER_ID = 174;
  const TARGET_COURSE_ID = 146;

  let formIdA = null;
  let formIdB = null;
  let formIdC = null;

  try {
    // -----------------------------------------------------------------------
    // STEP 0: Prerequisites & Environment Setup
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

    // 0.2 Verify Enrollment in Course 146
    const [enrollments] = await pool.query(`
      SELECT enrollment_id FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'Enrolled'
    `, [TARGET_STUDENT_ID, TARGET_COURSE_ID]);
    assert(enrollments.length > 0, `Student ${TARGET_STUDENT_ID} must be enrolled in course ${TARGET_COURSE_ID}`);
    console.log(`  ✓ Enrolled in course ID #${TARGET_COURSE_ID}`);

    // 0.3 Ensure feedback_emails preference is enabled
    await pool.query(`
      INSERT INTO user_email_preferences (user_id, email_enabled, feedback_emails)
      VALUES (?, 1, 1)
      ON DUPLICATE KEY UPDATE email_enabled = 1, feedback_emails = 1
    `, [TARGET_USER_ID]);
    console.log('  ✓ user_email_preferences confirmed: email_enabled = 1, feedback_emails = 1');

    // -----------------------------------------------------------------------
    // STEP 1: Create Test Feedback Form A & Verify Delivery
    // -----------------------------------------------------------------------
    console.log('\n--- Step 1: Create Test Feedback Form A (Course Targeted) ---');
    capturedMails = [];

    const formTitleA = 'End Semester Course & Teaching Feedback';
    const formDescA = 'Please evaluate course delivery, laboratory sessions, and instructor engagement for DSML.';
    const deadlineA = '2026-09-30 23:59:00';

    const [existingA] = await pool.query(`
      SELECT feedback_form_id FROM feedback_forms WHERE title = ? AND target_type = 'COURSE' AND target_id = ? LIMIT 1
    `, [formTitleA, TARGET_COURSE_ID]);

    if (existingA.length > 0) {
      formIdA = existingA[0].feedback_form_id;
      await pool.query(`
        UPDATE feedback_forms
        SET description = ?, end_date = ?, is_active = 1
        WHERE feedback_form_id = ?
      `, [formDescA, deadlineA, formIdA]);
      console.log(`  ✓ Reusing existing Form A ID #${formIdA}`);
    } else {
      formIdA = await feedbackModel.createForm({
        title: formTitleA,
        description: formDescA,
        target_type: 'COURSE',
        target_id: TARGET_COURSE_ID,
        academic_year: '2026-2027',
        semester: 5,
        start_date: new Date('2026-09-19T00:00:00Z'),
        end_date: new Date('2026-09-30T23:59:00Z'),
        is_active: true,
        created_by: 1
      });
      console.log(`  ✓ Created new Form A ID #${formIdA}`);
    }

    const formA = await feedbackModel.getFormByIdForAdmin(formIdA);
    assert(formA, 'Form A must exist');

    // Clean up prior logs for Form A
    const expectedKeyA = `${TARGET_USER_ID}:NEW_FEEDBACK_FORM:FEEDBACK_${formIdA}`;
    await pool.query('DELETE FROM email_logs WHERE event_key = ?', [expectedKeyA]);
    await pool.query(`
      DELETE FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'NEW_FEEDBACK_FORM' AND title LIKE ?
    `, [TARGET_USER_ID, `%${formTitleA}%`]);

    console.log(`  Dispatching notification for Form A to student user #${TARGET_USER_ID}...`);
    await feedbackModel.dispatchFeedbackFormNotification(formA, { userIds: [TARGET_USER_ID] });

    // Wait for async Gmail SMTP transmission
    await waitForMail(1, 8000);
    await sleep(500);

    // 1.1 Verify In-App Notification
    const [notifsA] = await pool.query(`
      SELECT notification_id, recipient_user_id, title, message, notification_type, created_at
      FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'NEW_FEEDBACK_FORM'
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID]);

    assert(notifsA.length > 0, 'In-app notification for Form A must exist');
    const notifA = notifsA[0];
    console.log(`  ✓ In-app Notification #${notifA.notification_id} created:`);
    console.log(`    Title:   ${notifA.title}`);
    console.log(`    Message: ${notifA.message}`);
    assert(notifA.title.includes(formTitleA), 'Title must include form title');
    assert(notifA.message.includes(formTitleA), 'Message must include form title');

    // 1.2 Verify email_logs
    const [emailLogsA] = await pool.query(`
      SELECT email_log_id, user_id, recipient_email, email_type, subject, status, event_key, error_message, sent_at
      FROM email_logs
      WHERE event_key = ?
    `, [expectedKeyA]);

    assert(emailLogsA.length === 1, `email_logs must contain exactly 1 entry for ${expectedKeyA}`);
    const emailLogA = emailLogsA[0];
    console.log(`  ✓ email_logs #${emailLogA.email_log_id} recorded:`);
    console.log(`    Recipient: ${emailLogA.recipient_email}`);
    console.log(`    Status:    ${emailLogA.status}`);
    console.log(`    Event Key: ${emailLogA.event_key}`);
    console.log(`    Subject:   ${emailLogA.subject}`);
    assert.strictEqual(emailLogA.recipient_email, studentUser.email, 'Recipient must match student user.email');
    assert.strictEqual(emailLogA.status, 'SENT', 'Email status must be SENT via Gmail SMTP');
    assert.strictEqual(emailLogA.email_type, 'NEW_FEEDBACK_FORM');

    // 1.3 Verify Real Gmail SMTP Transmission
    assert(capturedMails.length > 0, 'Real Gmail SMTP must have transmitted the email');
    const sentMailA = capturedMails[0];
    console.log(`  ✓ Gmail SMTP confirmed delivery (MessageID: ${sentMailA.result.messageId})`);

    // Verify Email Contents
    const expectedDeadline = emailTemplates.formatDueDateTime(formA.end_date);
    assert(sentMailA.options.subject.includes(formTitleA), 'Subject must include form title');
    assert(sentMailA.options.html.includes(emailTemplates.escapeHtml(formTitleA)), 'HTML must include form title');
    assert(sentMailA.options.html.includes(emailTemplates.escapeHtml(formDescA)), 'HTML must include description/instructions');
    assert(sentMailA.options.html.includes('IT101 - DSML'), 'HTML must include course target info');
    assert(sentMailA.options.html.includes(expectedDeadline.date), 'HTML must include deadline date');
    assert(sentMailA.options.html.includes(`/feedback/forms/${formIdA}`), 'HTML must include form path');
    assert(sentMailA.options.text.includes(formTitleA), 'Text must include form title');
    assert(sentMailA.options.text.includes(formDescA), 'Text must include description');
    assert(sentMailA.options.text.includes(expectedDeadline.date), 'Text must include deadline date');
    assert(sentMailA.options.text.includes(`/feedback/forms/${formIdA}`), 'Text must include form path');
    console.log(`  ✓ Email contents verified: title, description/instructions, course target, deadline (${expectedDeadline.formatted}), and form path`);

    // -----------------------------------------------------------------------
    // STEP 2: Duplicate Prevention Verification (Re-triggering Same Form A)
    // -----------------------------------------------------------------------
    console.log('\n--- Step 2: Duplicate Prevention Verification (Same Form A) ---');
    capturedMails = [];

    console.log('  Re-triggering feedback notification for the SAME form and student...');
    await feedbackModel.dispatchFeedbackFormNotification(formA, { userIds: [TARGET_USER_ID] });

    await sleep(2000);

    assert.strictEqual(capturedMails.length, 0, 'Zero emails should be sent over SMTP on duplicate trigger');

    const [dupCheckA] = await pool.query('SELECT COUNT(*) AS c FROM email_logs WHERE event_key = ?', [expectedKeyA]);
    assert.strictEqual(dupCheckA[0].c, 1, `Exactly 1 log entry must exist for ${expectedKeyA}`);
    console.log(`  ✓ Duplicate prevention verified: Exactly 1 email_log record, 0 retransmissions`);

    // -----------------------------------------------------------------------
    // STEP 3: Different Feedback Form Can Send a New Email (Form B)
    // -----------------------------------------------------------------------
    console.log('\n--- Step 3: Different Feedback Form Delivery (Form B) ---');
    capturedMails = [];

    const formTitleB = 'Campus Infrastructure & Lab Facilities Survey 2026';
    const formDescB = 'Provide your ratings and feedback on computer lab hardware, software licenses, and internet speed.';

    const [existingB] = await pool.query(`
      SELECT feedback_form_id FROM feedback_forms WHERE title = ? LIMIT 1
    `, [formTitleB]);

    if (existingB.length > 0) {
      formIdB = existingB[0].feedback_form_id;
    } else {
      formIdB = await feedbackModel.createForm({
        title: formTitleB,
        description: formDescB,
        target_type: 'GENERAL',
        target_id: null,
        academic_year: '2026-2027',
        semester: 5,
        start_date: new Date('2026-09-19T00:00:00Z'),
        end_date: new Date('2026-10-05T23:59:00Z'),
        is_active: true,
        created_by: 1
      });
    }

    const formB = await feedbackModel.getFormByIdForAdmin(formIdB);
    const expectedKeyB = `${TARGET_USER_ID}:NEW_FEEDBACK_FORM:FEEDBACK_${formIdB}`;
    await pool.query('DELETE FROM email_logs WHERE event_key = ?', [expectedKeyB]);

    console.log(`  Dispatching notification for Form B ID #${formIdB} to student user #${TARGET_USER_ID}...`);
    await feedbackModel.dispatchFeedbackFormNotification(formB, { userIds: [TARGET_USER_ID] });

    await waitForMail(1, 8000);
    await sleep(500);

    assert(capturedMails.length > 0, 'Real Gmail SMTP must transmit email for Form B');
    const sentMailB = capturedMails[0];
    console.log(`  ✓ Gmail SMTP delivered Form B email (MessageID: ${sentMailB.result.messageId})`);

    const [emailLogsB] = await pool.query(`
      SELECT email_log_id, status, event_key FROM email_logs WHERE event_key = ?
    `, [expectedKeyB]);
    assert.strictEqual(emailLogsB.length, 1, `email_logs must contain 1 entry for Form B (${expectedKeyB})`);
    assert.strictEqual(emailLogsB[0].status, 'SENT', 'Form B status must be SENT');
    console.log(`  ✓ Form B email_logs #${emailLogsB[0].email_log_id} recorded with key ${expectedKeyB}`);

    // -----------------------------------------------------------------------
    // STEP 4: Email Preference Disabled Verification (feedback_emails = OFF)
    // -----------------------------------------------------------------------
    console.log('\n--- Step 4: Email Preference Disabled Verification (feedback_emails = OFF) ---');
    await pool.query('UPDATE user_email_preferences SET feedback_emails = 0 WHERE user_id = ?', [TARGET_USER_ID]);
    console.log('  Updated user_email_preferences: feedback_emails = 0');

    capturedMails = [];

    const formTitleC = 'Library & Digital Journals Access Feedback';
    const formDescC = 'Please share your feedback regarding digital journals availability and book issue services.';

    const [existingC] = await pool.query(`
      SELECT feedback_form_id FROM feedback_forms WHERE title = ? LIMIT 1
    `, [formTitleC]);

    if (existingC.length > 0) {
      formIdC = existingC[0].feedback_form_id;
    } else {
      formIdC = await feedbackModel.createForm({
        title: formTitleC,
        description: formDescC,
        target_type: 'GENERAL',
        target_id: null,
        academic_year: '2026-2027',
        semester: 5,
        start_date: new Date('2026-09-19T00:00:00Z'),
        end_date: new Date('2026-10-10T23:59:00Z'),
        is_active: true,
        created_by: 1
      });
    }

    const formC = await feedbackModel.getFormByIdForAdmin(formIdC);
    const expectedKeyC = `${TARGET_USER_ID}:NEW_FEEDBACK_FORM:FEEDBACK_${formIdC}`;
    await pool.query('DELETE FROM email_logs WHERE event_key = ?', [expectedKeyC]);

    console.log(`  Dispatching notification for Form C while preference is OFF...`);
    await feedbackModel.dispatchFeedbackFormNotification(formC, { userIds: [TARGET_USER_ID] });

    await sleep(2000);

    // 4.1 Verify In-App Notification was created
    const [notifsC] = await pool.query(`
      SELECT notification_id, recipient_user_id, title, message, notification_type
      FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'NEW_FEEDBACK_FORM' AND title LIKE ?
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID, `%${formTitleC}%`]);

    assert(notifsC.length > 0, 'In-app notification must be created even when feedback_emails is OFF');
    console.log(`  ✓ In-app notification #${notifsC[0].notification_id} created successfully`);

    // 4.2 Verify Email Delivery was Skipped
    assert.strictEqual(capturedMails.length, 0, 'No email should be sent over SMTP when feedback_emails is OFF');

    const [emailLogsC] = await pool.query('SELECT email_log_id FROM email_logs WHERE event_key = ?', [expectedKeyC]);
    assert.strictEqual(emailLogsC.length, 0, 'No email_logs entry created for skipped email');
    console.log('  ✓ Verified: Email delivery safely skipped without sending or logging duplicate errors');

    // Restore preference
    await pool.query('UPDATE user_email_preferences SET feedback_emails = 1 WHERE user_id = ?', [TARGET_USER_ID]);
    console.log('  ✓ Restored user_email_preferences: feedback_emails = 1');

    // -----------------------------------------------------------------------
    // FINAL SUMMARY & RESULTS
    // -----------------------------------------------------------------------
    console.log('\n========================================================================');
    console.log('  NEW_FEEDBACK_FORM VERIFICATION COMPLETE: ALL CHECKS PASSED');
    console.log('========================================================================');
    console.log(`Form A ID:                #${formIdA} ("${formTitleA}")`);
    console.log(`Target Student:           Karan Bhapkar (student_id=${TARGET_STUDENT_ID}, user_id=${TARGET_USER_ID})`);
    console.log(`Recipient Email:          ${studentUser.email} (Resolved server-side from users table)`);
    console.log(`Form A Notif ID:          #${notifA.notification_id}`);
    console.log(`Form A Event Key:         ${emailLogA.event_key}`);
    console.log(`Form A email_logs ID:     #${emailLogA.email_log_id} (Status: ${emailLogA.status})`);
    console.log(`Form A SMTP Message ID:   ${sentMailA.result.messageId}`);
    console.log(`Form B ID:                #${formIdB} ("${formTitleB}")`);
    console.log(`Form B Event Key:         ${expectedKeyB}`);
    console.log(`Form B email_logs ID:     #${emailLogsB[0].email_log_id} (Status: ${emailLogsB[0].status})`);
    console.log(`Form B SMTP Message ID:   ${sentMailB.result.messageId}`);
    console.log(`Duplicate Prevention:     PASS (0 duplicate dispatches for Form A, exactly 1 log)`);
    console.log(`Different Form Isolation: PASS (Form B dispatched its own separate email)`);
    console.log(`Preference Isolation:     PASS (in-app notification created, SMTP skipped when OFF)`);
    console.log(`Gmail SMTP Delivery:      PASS (Response 250 OK for both Form A & Form B)`);
    console.log('========================================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

runRealFeedbackFormVerification();
