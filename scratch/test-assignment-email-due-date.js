require('dotenv').config();
const assert = require('assert');
const pool = require('../src/config/db');
const emailTemplates = require('../src/services/emailTemplates');
const notificationEmailService = require('../src/services/notificationEmail.service');
const emailModel = require('../src/models/email.model');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function pass(desc) {
  totalTests++;
  passedTests++;
  console.log(`  ✓ PASS: ${desc}`);
}

function fail(desc, err) {
  totalTests++;
  failedTests++;
  console.error(`  ✗ FAIL: ${desc}`);
  if (err) console.error('    Error:', err.message || err);
}

function createMockTransporter() {
  const sentMails = [];
  return {
    sentMails,
    sendMail: async (mailOptions) => {
      const info = {
        messageId: `<mock-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local>`,
        response: '250 2.0.0 OK: message queued'
      };
      sentMails.push({ mailOptions, info });
      return info;
    }
  };
}

async function runTests() {
  console.log('========================================================================');
  console.log('  ASSIGNMENT EMAIL DUE DATE & TIME VERIFICATION TEST SUITE');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // SECTION 1: Unit Tests for formatDueDateTime
  // -------------------------------------------------------------------------
  console.log('--- Section 1: formatDueDateTime Formatting ---');

  try {
    const res = emailTemplates.formatDueDateTime('2026-09-20 10:00:00');
    assert.strictEqual(res.date, '20 September 2026', 'Expected date to be 20 September 2026');
    assert.strictEqual(res.time, '10:00 AM', 'Expected time to be 10:00 AM');
    assert.strictEqual(res.formatted, '20 September 2026, 10:00 AM', 'Expected formatted string to match');
    pass('Formats "2026-09-20 10:00:00" into "20 September 2026", "10:00 AM", "20 September 2026, 10:00 AM"');
  } catch (err) {
    fail('Formats "2026-09-20 10:00:00"', err);
  }

  try {
    const res = emailTemplates.formatDueDateTime('2026-11-15 14:30:00');
    assert.strictEqual(res.date, '15 November 2026');
    assert.strictEqual(res.time, '2:30 PM');
    assert.strictEqual(res.formatted, '15 November 2026, 2:30 PM');
    pass('Formats PM hour "2026-11-15 14:30:00" into "15 November 2026", "2:30 PM"');
  } catch (err) {
    fail('Formats PM hour "2026-11-15 14:30:00"', err);
  }

  try {
    const res = emailTemplates.formatDueDateTime('2026-10-05');
    assert.strictEqual(res.date, '5 October 2026');
    assert.strictEqual(res.time, '11:59 PM');
    assert.strictEqual(res.formatted, '5 October 2026, 11:59 PM');
    pass('Formats date-only string "2026-10-05" with default 11:59 PM time');
  } catch (err) {
    fail('Formats date-only string "2026-10-05"', err);
  }

  try {
    const res = emailTemplates.formatDueDateTime('2026-09-20', '10:00 AM');
    assert.strictEqual(res.date, '20 September 2026');
    assert.strictEqual(res.time, '10:00 AM');
    assert.strictEqual(res.formatted, '20 September 2026, 10:00 AM');
    pass('Accepts explicit time argument "10:00 AM" alongside date');
  } catch (err) {
    fail('Accepts explicit time argument', err);
  }

  try {
    const res = emailTemplates.formatDueDateTime('20 September 2026, 10:00 AM');
    assert.strictEqual(res.date, '20 September 2026');
    assert.strictEqual(res.time, '10:00 AM');
    assert.strictEqual(res.formatted, '20 September 2026, 10:00 AM');
    pass('Passes through pre-formatted "20 September 2026, 10:00 AM" string');
  } catch (err) {
    fail('Passes through pre-formatted string', err);
  }

  try {
    const nullRes = emailTemplates.formatDueDateTime(null);
    assert(nullRes.date, 'Should handle null date gracefully');
    assert(nullRes.time, 'Should handle null time gracefully');
    pass('Handles null/undefined date gracefully with fallback values');
  } catch (err) {
    fail('Handles null/undefined date', err);
  }

  // -------------------------------------------------------------------------
  // SECTION 2: NEW_ASSIGNMENT Template
  // -------------------------------------------------------------------------
  console.log('\n--- Section 2: NEW_ASSIGNMENT Template Verification ---');

  try {
    const rendered = emailTemplates.renderTemplate('NEW_ASSIGNMENT', {
      name: 'Karan Sharma',
      assignmentTitle: 'Algorithms Problem Set 3',
      course: 'CS301 - Data Structures & Algorithms',
      dueDate: '2026-09-20 10:00:00',
      teacher: 'Dr. Rohini Verma'
    });

    assert(rendered.subject.includes('Algorithms Problem Set 3'), 'Subject should contain assignment title');
    assert(rendered.html.includes('Algorithms Problem Set 3'), 'HTML should contain assignment title');
    assert(rendered.html.includes('CS301 - Data Structures &amp; Algorithms'), 'HTML should contain escaped course name');
    assert(rendered.html.includes('Due Date:</strong> 20 September 2026'), 'HTML should contain exact Due Date');
    assert(rendered.html.includes('Due Time:</strong> 10:00 AM'), 'HTML should contain exact Due Time');
    assert(rendered.html.includes('Deadline:</strong> 20 September 2026, 10:00 AM'), 'HTML should contain combined Deadline');
    assert(rendered.html.includes('Dr. Rohini Verma'), 'HTML should contain teacher name');

    // Plain text verification
    assert(rendered.text.includes('Assignment: Algorithms Problem Set 3'), 'Text should contain assignment title');
    assert(rendered.text.includes('Course: CS301 - Data Structures & Algorithms'), 'Text should contain course');
    assert(rendered.text.includes('Due Date: 20 September 2026'), 'Text should contain exact Due Date');
    assert(rendered.text.includes('Due Time: 10:00 AM'), 'Text should contain exact Due Time');
    assert(rendered.text.includes('Deadline: 20 September 2026, 10:00 AM'), 'Text should contain combined Deadline');
    assert(rendered.text.includes('Faculty: Dr. Rohini Verma'), 'Text should contain teacher name');

    pass('NEW_ASSIGNMENT renders assignment title, course, due date, due time, deadline in HTML and text');
  } catch (err) {
    fail('NEW_ASSIGNMENT render verification', err);
  }

  // -------------------------------------------------------------------------
  // SECTION 3: ASSIGNMENT_DUE_SOON Template
  // -------------------------------------------------------------------------
  console.log('\n--- Section 3: ASSIGNMENT_DUE_SOON Template Verification ---');

  try {
    const rendered = emailTemplates.renderTemplate('ASSIGNMENT_DUE_SOON', {
      name: 'Karan Sharma',
      assignmentTitle: 'Database Normalization Assignment',
      course: 'CS302 - Database Systems',
      dueDate: '2026-09-20 10:00:00',
      remainingTime: '2 days, 4 hours'
    });

    assert(rendered.subject.includes('Database Normalization Assignment'), 'Subject should contain title');
    assert(rendered.html.includes('Due Date:</strong> 20 September 2026'), 'HTML should contain exact Due Date');
    assert(rendered.html.includes('Due Time:</strong> 10:00 AM'), 'HTML should contain exact Due Time');
    assert(rendered.html.includes('Deadline:</strong> 20 September 2026, 10:00 AM'), 'HTML should contain Deadline');
    assert(rendered.html.includes('Remaining Time:</strong> 2 days, 4 hours'), 'HTML should contain Remaining Time');

    // Plain text verification
    assert(rendered.text.includes('Due Date: 20 September 2026'), 'Text should contain Due Date');
    assert(rendered.text.includes('Due Time: 10:00 AM'), 'Text should contain Due Time');
    assert(rendered.text.includes('Deadline: 20 September 2026, 10:00 AM'), 'Text should contain Deadline');
    assert(rendered.text.includes('Remaining Time: 2 days, 4 hours'), 'Text should contain Remaining Time');

    pass('ASSIGNMENT_DUE_SOON renders due date, due time, deadline, and remaining time in HTML and text');
  } catch (err) {
    fail('ASSIGNMENT_DUE_SOON render verification', err);
  }

  // -------------------------------------------------------------------------
  // SECTION 4: ASSIGNMENT_OVERDUE Template
  // -------------------------------------------------------------------------
  console.log('\n--- Section 4: ASSIGNMENT_OVERDUE Template Verification ---');

  try {
    const rendered = emailTemplates.renderTemplate('ASSIGNMENT_OVERDUE', {
      name: 'Karan Sharma',
      assignmentTitle: 'Operating Systems Lab 2',
      course: 'CS303 - Operating Systems',
      dueDate: '2026-09-18 10:00:00',
      overdueDuration: '1 day, 2 hours'
    });

    assert(rendered.subject.includes('Operating Systems Lab 2'), 'Subject should contain title');
    assert(rendered.html.includes('Original Due Date:</strong> 18 September 2026'), 'HTML should contain Original Due Date');
    assert(rendered.html.includes('Original Due Time:</strong> 10:00 AM'), 'HTML should contain Original Due Time');
    assert(rendered.html.includes('Was Due On:</strong> 18 September 2026, 10:00 AM'), 'HTML should contain Was Due On');
    assert(rendered.html.includes('Overdue By:</strong> 1 day, 2 hours'), 'HTML should contain Overdue By');

    // Plain text verification
    assert(rendered.text.includes('Original Due Date: 18 September 2026'), 'Text should contain Original Due Date');
    assert(rendered.text.includes('Original Due Time: 10:00 AM'), 'Text should contain Original Due Time');
    assert(rendered.text.includes('Was Due On: 18 September 2026, 10:00 AM'), 'Text should contain Was Due On');
    assert(rendered.text.includes('Overdue By: 1 day, 2 hours'), 'Text should contain Overdue By');

    pass('ASSIGNMENT_OVERDUE renders original due date, original due time, was due on, and overdue by in HTML and text');
  } catch (err) {
    fail('ASSIGNMENT_OVERDUE render verification', err);
  }

  // -------------------------------------------------------------------------
  // SECTION 5: XSS and HTML Escaping Safety
  // -------------------------------------------------------------------------
  console.log('\n--- Section 5: XSS and HTML Escaping Safety ---');

  try {
    const maliciousPayload = {
      name: '<script>alert("xss")</script>Student',
      assignmentTitle: '<img src=x onerror=alert(1)>Assignment',
      course: '<b>Malicious Course</b>',
      dueDate: '2026-09-20 10:00:00',
      remainingTime: '<svg onload=alert(2)>2 hours',
      overdueDuration: '<iframe src="evil.com">1 day'
    };

    const renderedNew = emailTemplates.renderTemplate('NEW_ASSIGNMENT', maliciousPayload);
    assert(!renderedNew.html.includes('<script>'), 'HTML should escape script in NEW_ASSIGNMENT');
    assert(renderedNew.html.includes('&lt;script&gt;'), 'HTML should contain entity-encoded script');
    assert(!renderedNew.html.includes('<img src=x'), 'HTML should escape img in NEW_ASSIGNMENT');

    const renderedDue = emailTemplates.renderTemplate('ASSIGNMENT_DUE_SOON', maliciousPayload);
    assert(!renderedDue.html.includes('<svg onload='), 'HTML should escape svg in ASSIGNMENT_DUE_SOON');

    const renderedOverdue = emailTemplates.renderTemplate('ASSIGNMENT_OVERDUE', maliciousPayload);
    assert(!renderedOverdue.html.includes('<iframe'), 'HTML should escape iframe in ASSIGNMENT_OVERDUE');

    pass('All assignment templates strictly escape HTML/XSS injection in all dynamic fields');
  } catch (err) {
    fail('XSS escaping safety verification', err);
  }

  // -------------------------------------------------------------------------
  // SECTION 6: Duration Computation Helpers
  // -------------------------------------------------------------------------
  console.log('\n--- Section 6: Remaining and Overdue Duration Helpers ---');

  try {
    const futureDate = new Date(Date.now() + (2 * 24 * 60 * 60 * 1000) + (3 * 60 * 60 * 1000));
    const rem = notificationEmailService.computeRemainingTime(futureDate);
    assert(rem && rem.includes('2 days'), `Expected "2 days" in remaining time, got: ${rem}`);
    pass(`computeRemainingTime correctly computes future deadline duration (${rem})`);
  } catch (err) {
    fail('computeRemainingTime future date', err);
  }

  try {
    const pastDate = new Date(Date.now() - (1 * 24 * 60 * 60 * 1000) - (2 * 60 * 60 * 1000));
    const ovr = notificationEmailService.computeOverdueDuration(pastDate);
    assert(ovr && ovr.includes('1 day'), `Expected "1 day" in overdue duration, got: ${ovr}`);
    pass(`computeOverdueDuration correctly computes past deadline duration (${ovr})`);
  } catch (err) {
    fail('computeOverdueDuration past date', err);
  }

  try {
    assert.strictEqual(notificationEmailService.computeRemainingTime(null), null);
    assert.strictEqual(notificationEmailService.computeOverdueDuration(null), null);
    pass('Duration helpers handle null/invalid inputs cleanly without throwing');
  } catch (err) {
    fail('Duration helpers null handling', err);
  }

  // -------------------------------------------------------------------------
  // SECTION 7: End-to-End notificationEmail.service Integration with Mock SMTP
  // -------------------------------------------------------------------------
  console.log('\n--- Section 7: End-to-End Notification Email Dispatch ---');

  let testUserId = null;
  try {
    // Look up a student user with active email
    const [students] = await pool.query(`
      SELECT u.user_id, u.email, u.username, TRIM(CONCAT(u.first_name, ' ', u.last_name)) as full_name
      FROM users u
      JOIN roles r ON u.role_id = r.role_id
      WHERE r.role_name = 'STUDENT' AND u.is_active = 1 AND u.email IS NOT NULL
      LIMIT 1
    `);

    if (!students || students.length === 0) {
      console.warn('  ⚠️ No active student user found in DB, skipping live dispatch tests');
    } else {
      testUserId = students[0].user_id;
      const studentEmail = students[0].email;
      console.log(`  Target student user: ID=${testUserId}, email=${studentEmail}`);

      // Ensure assignment_emails preference is enabled for this test
      await pool.query(`
        INSERT INTO user_email_preferences (user_id, assignment_emails)
        VALUES (?, 1)
        ON DUPLICATE KEY UPDATE assignment_emails = 1
      `, [testUserId]);

      // 7.1 Dispatch NEW_ASSIGNMENT
      const mockTransporter1 = createMockTransporter();
      const res1 = await notificationEmailService.sendNotificationEmail({
        userId: testUserId,
        notificationType: 'NEW_ASSIGNMENT',
        title: 'New Assignment: Lab 4 - Binary Trees',
        message: 'A new assignment has been uploaded to the portal.',
        metadata: {
          assignmentTitle: 'Lab 4 - Binary Trees',
          course: 'CS201 - Data Structures',
          dueDate: '2026-09-20 10:00:00',
          transporterOverride: mockTransporter1,
          eventId: `TEST_DUE_DATE_NEW_${Date.now()}`
        }
      });

      assert.strictEqual(res1.status, 'SENT', `Expected SENT status, got: ${res1.status}`);
      assert.strictEqual(mockTransporter1.sentMails.length, 1, 'Mock transporter should have 1 sent mail');
      const sent1 = mockTransporter1.sentMails[0].mailOptions;
      assert(sent1.html.includes('20 September 2026'), 'Dispatched HTML should contain 20 September 2026');
      assert(sent1.html.includes('10:00 AM'), 'Dispatched HTML should contain 10:00 AM');
      assert(sent1.text.includes('20 September 2026, 10:00 AM'), 'Dispatched text should contain formatted deadline');
      pass('End-to-end NEW_ASSIGNMENT dispatches email with exact Due Date and Due Time');

      // 7.2 Dispatch ASSIGNMENT_DUE_SOON
      const mockTransporter2 = createMockTransporter();
      const res2 = await notificationEmailService.sendNotificationEmail({
        userId: testUserId,
        notificationType: 'ASSIGNMENT_DUE_SOON',
        title: 'Reminder: Lab 4 Due Soon',
        message: 'Your assignment is due soon.',
        metadata: {
          assignmentTitle: 'Lab 4 - Binary Trees',
          course: 'CS201 - Data Structures',
          dueDate: '2026-09-20 10:00:00',
          remainingTime: '1 day, 6 hours',
          transporterOverride: mockTransporter2,
          eventId: `TEST_DUE_DATE_SOON_${Date.now()}`
        }
      });

      assert.strictEqual(res2.status, 'SENT');
      const sent2 = mockTransporter2.sentMails[0].mailOptions;
      assert(sent2.html.includes('Due Date:</strong> 20 September 2026'), 'HTML should contain Due Date');
      assert(sent2.html.includes('Due Time:</strong> 10:00 AM'), 'HTML should contain Due Time');
      assert(sent2.html.includes('Remaining Time:</strong> 1 day, 6 hours'), 'HTML should contain Remaining Time');
      pass('End-to-end ASSIGNMENT_DUE_SOON dispatches email with Due Date, Due Time, and Remaining Time');

      // 7.3 Dispatch ASSIGNMENT_OVERDUE
      const mockTransporter3 = createMockTransporter();
      const res3 = await notificationEmailService.sendNotificationEmail({
        userId: testUserId,
        notificationType: 'ASSIGNMENT_OVERDUE',
        title: 'Overdue: Lab 4 - Binary Trees',
        message: 'Your assignment deadline has passed.',
        metadata: {
          assignmentTitle: 'Lab 4 - Binary Trees',
          course: 'CS201 - Data Structures',
          dueDate: '2026-09-20 10:00:00',
          overdueDuration: '2 days, 1 hour',
          transporterOverride: mockTransporter3,
          eventId: `TEST_DUE_DATE_OVERDUE_${Date.now()}`
        }
      });

      assert.strictEqual(res3.status, 'SENT');
      const sent3 = mockTransporter3.sentMails[0].mailOptions;
      assert(sent3.html.includes('Original Due Date:</strong> 20 September 2026'), 'HTML should contain Original Due Date');
      assert(sent3.html.includes('Original Due Time:</strong> 10:00 AM'), 'HTML should contain Original Due Time');
      assert(sent3.html.includes('Was Due On:</strong> 20 September 2026, 10:00 AM'), 'HTML should contain Was Due On');
      assert(sent3.html.includes('Overdue By:</strong> 2 days, 1 hour'), 'HTML should contain Overdue By');
      pass('End-to-end ASSIGNMENT_OVERDUE dispatches email with Original Due Date/Time and Overdue By');

      // 7.4 Preference enforcement: student with assignment_emails = 0 should be SKIPPED
      await pool.query(`
        UPDATE user_email_preferences SET assignment_emails = 0 WHERE user_id = ?
      `, [testUserId]);

      const mockTransporter4 = createMockTransporter();
      const res4 = await notificationEmailService.sendNotificationEmail({
        userId: testUserId,
        notificationType: 'NEW_ASSIGNMENT',
        title: 'New Assignment Should Be Skipped',
        metadata: {
          assignmentTitle: 'Skipped Assignment',
          dueDate: '2026-09-20 10:00:00',
          transporterOverride: mockTransporter4,
          eventId: `TEST_DUE_DATE_SKIP_${Date.now()}`
        }
      });

      assert.strictEqual(res4.status, 'SKIPPED');
      assert.strictEqual(res4.skipped, true);
      assert.strictEqual(res4.reason, 'EMAIL_PREFERENCE_DISABLED');
      assert.strictEqual(mockTransporter4.sentMails.length, 0, 'No email sent when preference is disabled');
      pass('Respects student assignment_emails preference (SKIPPED with EMAIL_PREFERENCE_DISABLED)');

      // Restore preference to enabled
      await pool.query(`
        UPDATE user_email_preferences SET assignment_emails = 1 WHERE user_id = ?
      `, [testUserId]);
    }
  } catch (err) {
    fail('End-to-end notification email dispatch', err);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`  RESULTS: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Unhandled test suite error:', err);
    pool.end();
    process.exit(1);
  });
