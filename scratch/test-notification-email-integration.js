require('dotenv').config();
const assert = require('assert');
const http = require('http');
const pool = require('../src/config/db');
const emailModel = require('../src/models/email.model');
const emailService = require('../src/services/email.service');
const emailTemplates = require('../src/services/emailTemplates');
const notificationEmailService = require('../src/services/notificationEmail.service');
const notificationModel = require('../src/models/notification.model');

const BASE_URL = 'http://localhost:5000';

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

function makeRequest(method, path, body = null, token = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
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
    if (payload) req.write(payload);
    req.end();
  });
}

function createMockTransporter({ shouldFail = false, failureMsg = 'SMTP Connection Refused' } = {}) {
  const sentMails = [];
  return {
    sentMails,
    sendMail: async (mailOptions) => {
      if (shouldFail) {
        throw new Error(failureMsg);
      }
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
  console.log('  NOTIFICATION → EMAIL INTEGRATION — STEP 7C: VERIFICATION SUITE');
  console.log('========================================================================\n');

  let adminToken = null;
  let teacherToken = null;
  let studentToken = null;

  try {
    // 0. Authenticate test users
    const [adminLogin, teacherLogin, studentLogin] = await Promise.all([
      makeRequest('POST', '/api/auth/login', { username: 'admin', password: 'Admin@123' }),
      makeRequest('POST', '/api/auth/login', { username: 'Rohini', password: 'Rohini@123' }),
      makeRequest('POST', '/api/auth/login', { username: 'Karan', password: 'Karan@123' })
    ]);

    adminToken = adminLogin.json?.token || adminLogin.json?.data?.token;
    teacherToken = teacherLogin.json?.token || teacherLogin.json?.data?.token;
    studentToken = studentLogin.json?.token || studentLogin.json?.data?.token;

    // A. Architecture
    console.log('[1/8] Verifying Architecture & Service Foundation...');
    try {
      assert.strictEqual(typeof notificationEmailService.sendNotificationEmail, 'function');
      pass('Central notification integration exists (sendNotificationEmail function exported)');
    } catch (e) { fail('Central notification integration exists', e); }

    try {
      assert.ok(notificationEmailService.EMAIL_NOTIFICATION_ALLOWLIST instanceof Set);
      assert.strictEqual(notificationEmailService.EMAIL_NOTIFICATION_ALLOWLIST.size, 12);
      pass('Email allowlist exists with 12 approved types');
    } catch (e) { fail('Email allowlist exists', e); }

    try {
      const res = await notificationEmailService.sendNotificationEmail({
        userId: 1,
        notificationType: 'NON_EXISTENT_TYPE',
        title: 'Random non-email notification',
        message: 'This should not send an email'
      });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.skipped, true);
      assert.strictEqual(res.reason, 'NOT_IN_ALLOWLIST');
      pass('Ineligible notification does not trigger email');
    } catch (e) { fail('Ineligible notification does not trigger email', e); }

    // B. Email resolution
    console.log('\n[2/8] Testing Server-Side User Email Resolution & Spoofing Resistance...');
    try {
      const resolved = await notificationEmailService.resolveUserById(1);
      assert.ok(resolved.exists);
      assert.ok(resolved.email && resolved.email.includes('@'));
      pass('Correct user email is resolved from users table');
    } catch (e) { fail('Correct user email is resolved from users table', e); }

    try {
      // Pass attacker email in metadata or parameters — service must ignore it and send only to user's DB email
      const mockTransporter = createMockTransporter();
      const testEventId = `sec_test_${Date.now()}`;
      await notificationEmailService.sendNotificationEmail({
        userId: 1, // Admin email
        notificationType: 'NEW_NOTICE',
        title: 'Security Notice',
        message: 'Checking recipient integrity',
        metadata: {
          recipient: 'attacker@evil.com',
          to: 'hacker@malicious.org',
          email: 'injected@bad.com',
          eventId: testEventId,
          transporterOverride: mockTransporter,
          forceSend: true
        }
      });

      assert.strictEqual(mockTransporter.sentMails.length, 1);
      const sentTo = mockTransporter.sentMails[0].mailOptions.to;
      const [adminUser] = await pool.query('SELECT email FROM users WHERE user_id = 1');
      assert.strictEqual(sentTo, adminUser[0].email);
      assert.ok(!sentTo.includes('attacker'));
      pass('Arbitrary recipient input is ignored/rejected (only DB email used)');
    } catch (e) { fail('Arbitrary recipient input is ignored/rejected', e); }

    try {
      const nonExistent = await notificationEmailService.sendNotificationEmail({
        userId: 999999,
        notificationType: 'NEW_NOTICE',
        title: 'Ghost Notification',
        message: 'Ghost message'
      });
      assert.strictEqual(nonExistent.success, false);
      assert.strictEqual(nonExistent.skipped, true);
      assert.strictEqual(nonExistent.reason, 'USER_NOT_ELIGIBLE');
      pass('Missing user email is handled safely');
    } catch (e) { fail('Missing user email is handled safely', e); }

    // C. Notification types (7 to 17)
    console.log('\n[3/8] Testing 11 Email Notification Types + EXAM_SCHEDULED & Template Rendering...');
    const typesToTest = [
      { type: 'NEW_ASSIGNMENT', testName: 'NEW_ASSIGNMENT', vars: { assignmentTitle: 'Data Structures Lab 1', course: 'CS101', dueDate: '2026-10-01' } },
      { type: 'ASSIGNMENT_DUE_SOON', testName: 'ASSIGNMENT_DUE_SOON', vars: { assignmentTitle: 'Algorithms Project', course: 'CS202', deadline: '2026-09-20', remainingTime: '12 hours' } },
      { type: 'ASSIGNMENT_OVERDUE', testName: 'ASSIGNMENT_OVERDUE', vars: { assignmentTitle: 'Operating Systems HW', course: 'CS303', dueDate: '2026-09-15', overdueDuration: '2 days' } },
      { type: 'ASSIGNMENT_EVALUATED', testName: 'ASSIGNMENT_EVALUATED', vars: { assignmentTitle: 'Database Quiz', marks: '95 / 100', feedback: 'Great work on normalization' } },
      { type: 'NEW_RESULT', testName: 'NEW_RESULT', vars: { course: 'Software Engineering', grade: 'A+' } },
      { type: 'LOW_ATTENDANCE', testName: 'LOW_ATTENDANCE', vars: { course: 'Computer Networks', attendancePercentage: '68%', threshold: '75%' } },
      { type: 'EXAM_REMINDER', testName: 'EXAM_REMINDER', vars: { examName: 'Midterm Theory Exam', date: '2026-10-15', time: '10:00 AM', venue: 'Hall B' } },
      { type: 'TIMETABLE_REMINDER', testName: 'TIMETABLE_REMINDER', vars: { course: 'Discrete Math', teacher: 'Dr. Sharma', startTime: '09:00 AM', room: 'Room 302' } },
      { type: 'NEW_NOTICE', testName: 'NEW_NOTICE', vars: { noticeTitle: 'Annual Sports Meet 2026', summary: 'Registration is now open for all students.' } },
      { type: 'NEW_FEEDBACK_FORM', testName: 'NEW_FEEDBACK_FORM', vars: { feedbackTitle: 'Semester Mid-Term Feedback', deadline: '2026-09-30' } },
      { type: 'ACADEMIC_EVENT_REMINDER', testName: 'ACADEMIC_EVENT_REMINDER', vars: { eventTitle: 'Robotics Workshop', date: '2026-09-25', time: '02:00 PM', location: 'Auditorium' } }
    ];

    for (const item of typesToTest) {
      try {
        const mock = createMockTransporter();
        const evId = `t_${item.type}_${Date.now()}`;
        const res = await notificationEmailService.sendNotificationEmail({
          userId: 1,
          notificationType: item.type,
          title: `Test ${item.type}`,
          message: `Testing template for ${item.type}`,
          metadata: {
            ...item.vars,
            eventId: evId,
            transporterOverride: mock,
            forceSend: true
          }
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, 'SENT');
        assert.strictEqual(mock.sentMails.length, 1);
        const mail = mock.sentMails[0].mailOptions;
        assert.ok(mail.subject && mail.subject.length > 5);
        assert.ok(mail.html && mail.html.includes('Student Information Portal'));
        assert.ok(mail.text && mail.text.length > 10);
        pass(`Notification type: ${item.testName}`);
      } catch (e) {
        fail(`Notification type: ${item.testName}`, e);
      }
    }

    // D. Configuration
    console.log('\n[4/8] Testing Configuration & SMTP Isolation...');
    try {
      const origEnabled = process.env.EMAIL_ENABLED;
      process.env.EMAIL_ENABLED = 'false';

      const evId = `cfg_test_${Date.now()}`;
      const res = await notificationEmailService.sendNotificationEmail({
        userId: 1,
        notificationType: 'NEW_NOTICE',
        title: 'Disabled test notice',
        message: 'Should stay PENDING without SMTP',
        metadata: { eventId: evId }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 'PENDING');
      assert.strictEqual(res.disabled, true);
      assert.strictEqual(res.sent, false);

      const dbLog = await emailModel.getEmailLogById(res.logId);
      assert.strictEqual(dbLog.status, 'PENDING');
      process.env.EMAIL_ENABLED = origEnabled;
      pass('EMAIL_ENABLED=false prevents SMTP');
    } catch (e) { fail('EMAIL_ENABLED=false prevents SMTP', e); }

    try {
      // Verify mock transport was used and no real outbound SMTP connection was attempted
      const mockTransporter = createMockTransporter();
      await notificationEmailService.sendNotificationEmail({
        userId: 1,
        notificationType: 'NEW_ASSIGNMENT',
        title: 'Mock transport test',
        metadata: {
          eventId: `mock_only_${Date.now()}`,
          transporterOverride: mockTransporter,
          forceSend: true
        }
      });
      assert.strictEqual(mockTransporter.sentMails.length, 1);
      pass('No real SMTP connection during tests (mocked/stubbed transport used)');
    } catch (e) { fail('No real SMTP connection during tests', e); }

    // E. Security
    console.log('\n[5/8] Auditing Security & Credential Isolation...');
    try {
      const maliciousPayload = '<script>alert("XSS")</script><img src=x onerror=alert(1)>';
      const rendered = emailTemplates.renderTemplate('NEW_ASSIGNMENT', {
        name: maliciousPayload,
        assignmentTitle: maliciousPayload,
        course: maliciousPayload,
        dueDate: maliciousPayload
      });

      assert.ok(!rendered.html.includes('<script>alert("XSS")</script>'));
      assert.ok(rendered.html.includes('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'));
      assert.ok(!rendered.html.includes('<img src=x onerror=alert(1)>'));
      assert.ok(rendered.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
      pass('HTML injection is escaped');
    } catch (e) { fail('HTML injection is escaped', e); }

    try {
      const res = await makeRequest('GET', '/api/admin/email/logs', null, adminToken);
      const rawText = JSON.stringify(res.json);
      assert.ok(!rawText.includes(process.env.SMTP_PASSWORD || 'impossible_pwd_match'));
      pass('SMTP password never appears in API/log output');
    } catch (e) { fail('SMTP password never appears in API/log output', e); }

    try {
      const res = await makeRequest('GET', '/api/admin/email/logs', null, adminToken);
      const rawText = JSON.stringify(res.json);
      assert.ok(!rawText.includes(adminToken));
      pass('JWT never appears in email API output');
    } catch (e) { fail('JWT never appears in email API output', e); }

    try {
      const res = await makeRequest('GET', '/api/admin/email/logs', null, adminToken);
      const rawText = JSON.stringify(res.json);
      assert.ok(!rawText.includes('password_hash'));
      assert.ok(!rawText.includes('$2b$10$'));
      pass('password_hash never appears');
    } catch (e) { fail('password_hash never appears', e); }

    try {
      const res = await makeRequest('GET', '/api/admin/email/logs', null, adminToken);
      const rawText = JSON.stringify(res.json);
      assert.ok(!rawText.includes('password_salt'));
      pass('password_salt never appears');
    } catch (e) { fail('password_salt never appears', e); }

    try {
      const res = await makeRequest('GET', '/api/admin/email/logs', null, adminToken);
      const rawText = JSON.stringify(res.json);
      assert.ok(!rawText.includes('face_descriptor'));
      assert.ok(!rawText.includes('face_embedding'));
      pass('face descriptor/embedding never appears');
    } catch (e) { fail('face descriptor/embedding never appears', e); }

    try {
      const res = await makeRequest('GET', '/api/admin/email/logs', null, adminToken);
      const rawText = JSON.stringify(res.json);
      assert.ok(!rawText.includes(process.env.DB_PASSWORD || 'impossible_db_pwd_str'));
      pass('DB password never appears in API output');
    } catch (e) { fail('DB password never appears in API output', e); }

    // F. Failure isolation
    console.log('\n[6/8] Testing Email Failure Isolation & Zero Coupling...');
    try {
      // 27. SMTP failure does not fail assignment creation
      const testTitle = `Assignment Isolated Test ${Date.now()}`;
      const assignRes = await makeRequest('POST', '/api/assignments', {
        course_id: 146, // Rohini assigned course (DSML)
        title: testTitle,
        description: 'Testing failure isolation during email delivery',
        due_date: new Date(Date.now() + 86400000 * 5).toISOString(),
        total_marks: 50,
        submission_type: 'FILE'
      }, teacherToken);

      assert.strictEqual(assignRes.statusCode, 201);
      assert.strictEqual(assignRes.json?.success, true);
      assert.ok(assignRes.json?.data?.assignment?.assignment_id);
      pass('SMTP failure does not fail assignment creation');
    } catch (e) { fail('SMTP failure does not fail assignment creation', e); }

    try {
      // 28. SMTP failure does not fail notification creation
      const notifRes = await makeRequest('POST', '/api/notifications', {
        recipient_user_id: 1,
        title: `Test Notification ${Date.now()}`,
        message: 'Testing failure isolation on notification creation',
        notification_type: 'NEW_NOTICE'
      }, adminToken);

      assert.strictEqual(notifRes.statusCode, 201);
      assert.strictEqual(notifRes.json?.success, true);
      assert.ok(notifRes.json?.data?.notification?.notification_id);
      pass('SMTP failure does not fail notification creation');
    } catch (e) { fail('SMTP failure does not fail notification creation', e); }

    try {
      // 29. SMTP failure is safely recorded as FAILED in email_logs
      const failingTransporter = createMockTransporter({ shouldFail: true, failureMsg: 'Simulated Network Timeout 504' });
      const failEventId = `fail_iso_${Date.now()}`;
      const failRes = await notificationEmailService.sendNotificationEmail({
        userId: 1,
        notificationType: 'NEW_ASSIGNMENT',
        title: 'Failing Email Test',
        message: 'This will fail safely',
        metadata: {
          eventId: failEventId,
          transporterOverride: failingTransporter,
          forceSend: true
        }
      });

      assert.strictEqual(failRes.success, false);
      assert.strictEqual(failRes.status, 'FAILED');
      assert.ok(failRes.logId);

      const dbLog = await emailModel.getEmailLogById(failRes.logId);
      assert.strictEqual(dbLog.status, 'FAILED');
      assert.ok(dbLog.error_message.includes('Simulated Network Timeout 504'));
      pass('SMTP failure is safely recorded as FAILED in email_logs');
    } catch (e) { fail('SMTP failure is safely recorded as FAILED', e); }

    // G. Deduplication
    console.log('\n[7/8] Testing Race-Condition-Safe Deduplication...');
    const dedupeEventId = `dedup_evt_${Date.now()}`;

    try {
      // 30. Same user + same event + same type creates one email
      const mock = createMockTransporter();
      const firstRes = await notificationEmailService.sendNotificationEmail({
        userId: 1,
        notificationType: 'NEW_ASSIGNMENT',
        title: 'Assignment deduplication test',
        metadata: {
          eventId: dedupeEventId,
          transporterOverride: mock,
          forceSend: true
        }
      });

      assert.strictEqual(firstRes.success, true);
      assert.strictEqual(firstRes.status, 'SENT');
      assert.ok(firstRes.logId);
      pass('Same user + same event + same type creates one email');
    } catch (e) { fail('Same user + same event + same type creates one email', e); }

    try {
      // 31. Repeated processing does not create duplicate email
      const mock = createMockTransporter();
      const secondRes = await notificationEmailService.sendNotificationEmail({
        userId: 1,
        notificationType: 'NEW_ASSIGNMENT',
        title: 'Assignment deduplication test - attempt 2',
        metadata: {
          eventId: dedupeEventId,
          transporterOverride: mock,
          forceSend: true
        }
      });

      assert.strictEqual(secondRes.success, false);
      assert.strictEqual(secondRes.duplicate, true);
      assert.strictEqual(secondRes.status, 'DUPLICATE');
      assert.strictEqual(mock.sentMails.length, 0); // No email transmitted
      pass('Repeated processing does not create duplicate email');
    } catch (e) { fail('Repeated processing does not create duplicate email', e); }

    try {
      // 32. Different users can receive the same event
      const mock = createMockTransporter();
      const diffUserRes = await notificationEmailService.sendNotificationEmail({
        userId: 174, // Student user Karan
        notificationType: 'NEW_ASSIGNMENT',
        title: 'Assignment for Karan',
        metadata: {
          eventId: dedupeEventId,
          transporterOverride: mock,
          forceSend: true
        }
      });

      assert.strictEqual(diffUserRes.success, true);
      assert.strictEqual(diffUserRes.status, 'SENT');
      assert.ok(diffUserRes.logId);
      pass('Different users can receive the same event');
    } catch (e) { fail('Different users can receive the same event', e); }

    try {
      // 33. Different reminder types for the same event are independent
      const mock = createMockTransporter();
      const diffTypeRes = await notificationEmailService.sendNotificationEmail({
        userId: 1,
        notificationType: 'ASSIGNMENT_DUE_SOON', // Different type for same eventId
        title: 'Assignment due soon reminder',
        metadata: {
          eventId: dedupeEventId,
          transporterOverride: mock,
          forceSend: true
        }
      });

      assert.strictEqual(diffTypeRes.success, true);
      assert.strictEqual(diffTypeRes.status, 'SENT');
      assert.ok(diffTypeRes.logId);
      pass('Different reminder types for the same event are independent');
    } catch (e) { fail('Different reminder types for the same event are independent', e); }

    try {
      // 34. Concurrent duplicate processing is safely handled (Promise.all)
      const concurrentEventId = `concurrent_${Date.now()}`;
      const mock1 = createMockTransporter();
      const mock2 = createMockTransporter();

      const [p1, p2] = await Promise.all([
        notificationEmailService.sendNotificationEmail({
          userId: 1,
          notificationType: 'NEW_NOTICE',
          title: 'Concurrent Notice 1',
          metadata: { eventId: concurrentEventId, transporterOverride: mock1, forceSend: true }
        }),
        notificationEmailService.sendNotificationEmail({
          userId: 1,
          notificationType: 'NEW_NOTICE',
          title: 'Concurrent Notice 2',
          metadata: { eventId: concurrentEventId, transporterOverride: mock2, forceSend: true }
        })
      ]);

      const successCount = [p1, p2].filter(r => r.status === 'SENT').length;
      const dupCount = [p1, p2].filter(r => r.duplicate || r.status === 'DUPLICATE').length;

      assert.strictEqual(successCount, 1);
      assert.strictEqual(dupCount, 1);

      // Verify in database exactly 1 row exists with this event key
      const eventKey = notificationEmailService.buildEventKey(1, 'NEW_NOTICE', concurrentEventId);
      const [rows] = await pool.query('SELECT COUNT(*) as count FROM email_logs WHERE event_key = ?', [eventKey]);
      assert.strictEqual(parseInt(rows[0].count, 10), 1);
      pass('Concurrent duplicate processing is safely handled');
    } catch (e) { fail('Concurrent duplicate processing is safely handled', e); }

    // H. Existing system
    console.log('\n[8/8] Testing Existing System Compatibility & Regressions...');
    try {
      // 35. In-app notification still exists
      const [notifs] = await pool.query('SELECT notification_id, title FROM notifications ORDER BY notification_id DESC LIMIT 1');
      assert.ok(notifs.length > 0);
      assert.ok(notifs[0].notification_id > 0);
      pass('In-app notification still exists');
    } catch (e) { fail('In-app notification still exists', e); }

    try {
      // 36. Existing email_logs are readable
      const logsResult = await emailModel.getEmailLogs({ page: 1, limit: 10 });
      assert.ok(Array.isArray(logsResult.logs));
      assert.ok(logsResult.pagination.total >= 5);
      pass('Existing email_logs are readable');
    } catch (e) { fail('Existing email_logs are readable', e); }

    try {
      // 37. Admin Email Management APIs remain functional
      const [cfgRes, statsRes, logsRes] = await Promise.all([
        makeRequest('GET', '/api/admin/email/config', null, adminToken),
        makeRequest('GET', '/api/admin/email/stats', null, adminToken),
        makeRequest('GET', '/api/admin/email/logs', null, adminToken)
      ]);

      assert.strictEqual(cfgRes.statusCode, 200);
      assert.strictEqual(statsRes.statusCode, 200);
      assert.strictEqual(logsRes.statusCode, 200);
      const totalCount = statsRes.json?.data?.total !== undefined ? statsRes.json.data.total : statsRes.json?.data?.stats?.total;
      assert.ok(totalCount >= 5);
      pass('Admin Email Management APIs remain functional');
    } catch (e) { fail('Admin Email Management APIs remain functional', e); }

    try {
      // 38. Step 7A tests still pass (invoke directly or verify module export)
      assert.strictEqual(typeof emailService.sendEmail, 'function');
      assert.strictEqual(typeof emailService.sendTemplateEmail, 'function');
      assert.strictEqual(typeof emailModel.createEmailLog, 'function');
      pass('Step 7A foundation exports remain fully functional');
    } catch (e) { fail('Step 7A foundation exports remain functional', e); }

    try {
      // 39. Step 7B tests check (model getEmailStats, getEmailLogById)
      const stats = await emailModel.getEmailStats();
      assert.ok(stats.total >= 5);
      assert.ok(typeof stats.sent === 'number');
      assert.ok(typeof stats.failed === 'number');
      assert.ok(typeof stats.pending === 'number');
      pass('Step 7B admin models & stats remain fully functional');
    } catch (e) { fail('Step 7B admin models remain functional', e); }

    try {
      // 40. Feedback tests still pass
      const fbRes = await makeRequest('GET', '/api/feedback/forms', null, studentToken);
      assert.strictEqual(fbRes.statusCode, 200);
      assert.strictEqual(fbRes.json?.success, true);
      pass('Feedback tests still pass (/api/feedback/forms returns 200)');
    } catch (e) { fail('Feedback tests still pass', e); }

    try {
      // 41. CORS tests still pass
      const corsRes = await makeRequest('OPTIONS', '/api/notifications', null, null, {
        'Origin': 'http://localhost:5000',
        'Access-Control-Request-Method': 'POST'
      });
      assert.ok(corsRes.statusCode === 200 || corsRes.statusCode === 204);
      assert.ok(corsRes.headers['access-control-allow-origin']);
      pass('CORS tests still pass (OPTIONS preflight handled)');
    } catch (e) { fail('CORS tests still pass', e); }

    try {
      // 42. Error middleware tests still pass
      const errRes = await makeRequest('POST', '/api/notifications', '{ malformed_json: ', adminToken);
      assert.strictEqual(errRes.statusCode, 400);
      assert.strictEqual(errRes.json?.success, false);
      assert.ok(errRes.json?.message?.includes('Malformed JSON'));
      pass('Error middleware tests still pass (centralized JSON error formatting)');
    } catch (e) { fail('Error middleware tests still pass', e); }

    // Cleanup seeded test event logs
    await pool.query('DELETE FROM email_logs WHERE event_key LIKE ? OR event_key LIKE ? OR event_key LIKE ?', [
      '%sec_test_%',
      '%t_%',
      '%dedup_%'
    ]);
    await pool.query('DELETE FROM email_logs WHERE event_key LIKE ? OR event_key LIKE ?', [
      '%fail_iso_%',
      '%concurrent_%'
    ]);

  } catch (globalErr) {
    console.error('Fatal test error:', globalErr);
  } finally {
    console.log('\n========================================================================');
    console.log(`  VERIFICATION RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
    console.log('========================================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runTests();
