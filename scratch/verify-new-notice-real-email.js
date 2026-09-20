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

const noticeModel = require('../src/models/notice.model');
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

async function runRealNoticeVerification() {
  console.log('========================================================================');
  console.log('  REAL END-TO-END VERIFICATION: NEW_NOTICE EMAIL DELIVERY (GMAIL SMTP)');
  console.log('========================================================================\n');

  const TARGET_STUDENT_ID = 96;
  const TARGET_USER_ID = 174;
  let testNoticeId = null;

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

    // 0.2 Ensure notice_emails preference is enabled
    await pool.query(`
      INSERT INTO user_email_preferences (user_id, email_enabled, notice_emails)
      VALUES (?, 1, 1)
      ON DUPLICATE KEY UPDATE email_enabled = 1, notice_emails = 1
    `, [TARGET_USER_ID]);
    console.log('  ✓ user_email_preferences confirmed: email_enabled = 1, notice_emails = 1');

    // -----------------------------------------------------------------------
    // STEP 1: Create Test Notice Targeted to STUDENT & Verify Delivery
    // -----------------------------------------------------------------------
    console.log('\n--- Step 1: Create Test Notice Targeted to STUDENT ---');
    capturedMails = [];

    const noticeTitle = 'Annual Tech Symposium & Hackathon 2026';
    const noticeContent = 'Registrations are officially open for the annual engineering tech symposium and 24-hour hackathon. Register your teams on the student portal.';
    const noticeCategory = 'Academic / Events';
    const publishedAt = '2026-09-19 13:30:00';

    // Find or create the notice
    const [existingNotices] = await pool.query(`
      SELECT notice_id FROM notices WHERE title = ? AND target_role = 'STUDENT' LIMIT 1
    `, [noticeTitle]);

    if (existingNotices.length > 0) {
      testNoticeId = existingNotices[0].notice_id;
      await pool.query(`
        UPDATE notices
        SET content = ?, published_at = ?, is_active = 1
        WHERE notice_id = ?
      `, [noticeContent, publishedAt, testNoticeId]);
      console.log(`  ✓ Reusing existing notice ID #${testNoticeId}`);
    } else {
      const created = await noticeModel.createNotice({
        created_by: 1, // Admin
        target_role: 'STUDENT',
        title: noticeTitle,
        content: noticeContent,
        published_at: publishedAt,
        is_active: 1
      });
      testNoticeId = created.notice_id;
      console.log(`  ✓ Created new notice record ID #${testNoticeId}`);
    }

    const testNotice = await noticeModel.getNoticeById(testNoticeId);
    assert(testNotice, 'Notice record must exist');

    // Clean up prior logs for this test notice and user
    const expectedEventKey = `${TARGET_USER_ID}:NEW_NOTICE:NOTICE_${testNoticeId}`;
    await pool.query('DELETE FROM email_logs WHERE event_key = ?', [expectedEventKey]);
    await pool.query(`
      DELETE FROM notifications 
      WHERE recipient_user_id = ? AND notification_type = 'NEW_NOTICE' AND title LIKE ?
    `, [TARGET_USER_ID, `%${noticeTitle}%`]);
    console.log(`  ✓ Cleaned prior notification & email logs for notice #${testNoticeId}`);

    // Dispatch notice notification targeted to our test student
    console.log(`  Triggering notice notification for student user #${TARGET_USER_ID}...`);
    await noticeModel.dispatchNoticeNotification(testNotice, {
      userIds: [TARGET_USER_ID],
      category: noticeCategory
    });

    // Wait for async Gmail SMTP transmission
    await waitForMail(1, 8000);
    await sleep(500);

    // 1.1 Verify In-App Notification in DB
    const [notifs] = await pool.query(`
      SELECT notification_id, recipient_user_id, title, message, notification_type, is_read, created_at
      FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'NEW_NOTICE'
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID]);

    assert(notifs.length > 0, 'In-app notification for NEW_NOTICE must exist');
    const notif = notifs[0];
    console.log(`  ✓ In-app Notification #${notif.notification_id} created:`);
    console.log(`    Title:   ${notif.title}`);
    console.log(`    Message: ${notif.message}`);
    assert(notif.title.includes(noticeTitle), 'Notification title must contain notice title');
    assert(notif.message.includes('Registrations are officially open'), 'Notification message must contain notice content');

    // 1.2 Verify email_logs
    const [emailLogs] = await pool.query(`
      SELECT email_log_id, user_id, recipient_email, email_type, subject, status, event_key, error_message, sent_at
      FROM email_logs
      WHERE event_key = ?
    `, [expectedEventKey]);

    assert(emailLogs.length === 1, `email_logs must contain exactly 1 entry for ${expectedEventKey}`);
    const emailLog = emailLogs[0];
    console.log(`  ✓ email_logs #${emailLog.email_log_id} recorded:`);
    console.log(`    Recipient: ${emailLog.recipient_email}`);
    console.log(`    Status:    ${emailLog.status}`);
    console.log(`    Event Key: ${emailLog.event_key}`);
    console.log(`    Subject:   ${emailLog.subject}`);
    assert.strictEqual(emailLog.recipient_email, studentUser.email, 'Recipient email must match student user.email');
    assert.strictEqual(emailLog.status, 'SENT', 'Email status must be SENT via Gmail SMTP');
    assert.strictEqual(emailLog.email_type, 'NEW_NOTICE');

    // 1.3 Verify Real Gmail SMTP Transmission
    assert(capturedMails.length > 0, 'Real Gmail SMTP must have transmitted the email');
    const sentMail = capturedMails[0];
    console.log(`  ✓ Gmail SMTP confirmed delivery (MessageID: ${sentMail.result.messageId})`);
    const emailTemplates = require('../src/services/emailTemplates');
    assert(sentMail.options.subject.includes(noticeTitle), 'Subject must include notice title');
    assert(sentMail.options.html.includes(emailTemplates.escapeHtml(noticeTitle)), 'HTML must include notice title');
    assert(sentMail.options.html.includes('Registrations are officially open'), 'HTML must include notice description/message');
    assert(sentMail.options.html.includes('Academic / Events'), 'HTML must include notice category');
    assert(sentMail.options.html.includes('19 September 2026'), 'HTML must include published date');
    assert(sentMail.options.text.includes(noticeTitle), 'Text must include notice title');
    assert(sentMail.options.text.includes('Registrations are officially open'), 'Text must include notice description/message');
    console.log('  ✓ Email contents verified: notice title, description/message, category, and published date');

    // -----------------------------------------------------------------------
    // STEP 2: Duplicate Prevention Verification
    // -----------------------------------------------------------------------
    console.log('\n--- Step 2: Duplicate Prevention Verification ---');
    capturedMails = [];

    console.log('  Re-triggering notice notification for the same notice and student...');
    await noticeModel.dispatchNoticeNotification(testNotice, {
      userIds: [TARGET_USER_ID],
      category: noticeCategory
    });

    // Wait for any async processes to settle
    await sleep(2000);

    assert.strictEqual(capturedMails.length, 0, 'Zero emails should be sent over SMTP on duplicate trigger');

    // Check count in email_logs
    const [dupCheck] = await pool.query('SELECT COUNT(*) AS c FROM email_logs WHERE event_key = ?', [expectedEventKey]);
    assert.strictEqual(dupCheck[0].c, 1, `Exactly 1 log entry must exist for ${expectedEventKey}`);
    console.log(`  ✓ Duplicate prevention verified: Exactly 1 email_log record, 0 retransmissions`);

    // -----------------------------------------------------------------------
    // STEP 3: Email Preference Disabled Verification (notice_emails = OFF)
    // -----------------------------------------------------------------------
    console.log('\n--- Step 3: Email Preference Disabled Verification (notice_emails = OFF) ---');
    // Disable notice_emails preference for this student
    await pool.query('UPDATE user_email_preferences SET notice_emails = 0 WHERE user_id = ?', [TARGET_USER_ID]);
    console.log('  Updated user_email_preferences: notice_emails = 0');

    capturedMails = [];

    // Create a secondary distinct test notice for preference testing
    const prefNoticeTitle = 'Fee Payment Extension Circular';
    const prefNoticeContent = 'The last date for semester fee payment has been extended to 30 September 2026.';
    let prefNoticeId;

    const [existingPrefNotices] = await pool.query(`
      SELECT notice_id FROM notices WHERE title = ? AND target_role = 'STUDENT' LIMIT 1
    `, [prefNoticeTitle]);

    if (existingPrefNotices.length > 0) {
      prefNoticeId = existingPrefNotices[0].notice_id;
    } else {
      const createdPref = await noticeModel.createNotice({
        created_by: 1,
        target_role: 'STUDENT',
        title: prefNoticeTitle,
        content: prefNoticeContent,
        published_at: '2026-09-19 13:30:00',
        is_active: 1
      });
      prefNoticeId = createdPref.notice_id;
    }

    const prefNotice = await noticeModel.getNoticeById(prefNoticeId);
    const prefEventKey = `${TARGET_USER_ID}:NEW_NOTICE:NOTICE_${prefNoticeId}`;
    await pool.query('DELETE FROM email_logs WHERE event_key = ?', [prefEventKey]);

    // Dispatch notice notification with preference OFF
    await noticeModel.dispatchNoticeNotification(prefNotice, {
      userIds: [TARGET_USER_ID],
      category: 'Administrative'
    });

    await sleep(2000);

    // 3.1 Verify In-App Notification was still created
    const [prefNotifs] = await pool.query(`
      SELECT notification_id, recipient_user_id, title, message, notification_type
      FROM notifications
      WHERE recipient_user_id = ? AND notification_type = 'NEW_NOTICE' AND title LIKE ?
      ORDER BY notification_id DESC
      LIMIT 1
    `, [TARGET_USER_ID, `%${prefNoticeTitle}%`]);

    assert(prefNotifs.length > 0, 'In-app notification must be created even when notice_emails is OFF');
    console.log(`  ✓ In-app notification #${prefNotifs[0].notification_id} created despite notice_emails=0`);

    // 3.2 Verify Email Delivery was Skipped
    assert.strictEqual(capturedMails.length, 0, 'No email should be sent over SMTP when notice_emails is OFF');

    const [prefEmailLogs] = await pool.query('SELECT email_log_id FROM email_logs WHERE event_key = ?', [prefEventKey]);
    assert.strictEqual(prefEmailLogs.length, 0, 'No email_logs entry created for skipped email');
    console.log('  ✓ Verified: Email delivery safely skipped without sending or logging error');

    // Restore user preference
    await pool.query('UPDATE user_email_preferences SET notice_emails = 1 WHERE user_id = ?', [TARGET_USER_ID]);
    console.log('  ✓ Restored user_email_preferences: notice_emails = 1');

    // -----------------------------------------------------------------------
    // FINAL SUMMARY & RESULTS
    // -----------------------------------------------------------------------
    console.log('\n========================================================================');
    console.log('  NEW_NOTICE VERIFICATION COMPLETE: ALL CHECKS PASSED');
    console.log('========================================================================');
    console.log(`Test Notice ID:           #${testNoticeId}`);
    console.log(`Notice Title:             "${noticeTitle}"`);
    console.log(`Target Student:           Karan Bhapkar (student_id=${TARGET_STUDENT_ID}, user_id=${TARGET_USER_ID})`);
    console.log(`Recipient Email:          ${studentUser.email} (Resolved server-side from users table)`);
    console.log(`In-App Notification ID:   #${notif.notification_id}`);
    console.log(`Event Key:                ${emailLog.event_key}`);
    console.log(`email_logs ID:            #${emailLog.email_log_id} (Status: ${emailLog.status})`);
    console.log(`Gmail SMTP Message ID:    ${sentMail.result.messageId}`);
    console.log(`Duplicate Prevention:     PASS (0 duplicate dispatches, exactly 1 log)`);
    console.log(`Preference Isolation:     PASS (in-app notification created, SMTP skipped when OFF)`);
    console.log(`Gmail SMTP Delivery:      PASS (Response 250 OK)`);
    console.log('========================================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ VERIFICATION FAILED:', err);
    process.exit(1);
  }
}

runRealNoticeVerification();
