/**
 * Step 7A: Email Notification Backend Foundation Verification Suite
 * Tests database schema, indexes, FKs, service flows, template escaping,
 * credentials isolation, RBAC access on /api/admin/email/logs, and regression safety.
 */

require('dotenv').config();
const db = require('../src/config/db');
const emailModel = require('../src/models/email.model');
const emailService = require('../src/services/email.service');
const emailTemplates = require('../src/services/emailTemplates');

const BASE_URL = 'http://localhost:5000';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }
  return { status: response.status, headers: response.headers, data };
}

async function runTests() {
  console.log('========================================================================');
  console.log('  EMAIL BACKEND FOUNDATION — STEP 7A: VERIFICATION SUITE');
  console.log('========================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // 1. Database Schema, Columns, Indexes, and Constraints
    // -------------------------------------------------------------------------
    console.log('[1/7] Verifying Database Schema, Columns, Indexes & Constraints...');

    const [columns] = await db.query('DESCRIBE email_logs');
    const colMap = {};
    columns.forEach(c => { colMap[c.Field] = c; });

    assert(Boolean(colMap['email_log_id']), 'Column email_log_id exists');
    assert(colMap['email_log_id']?.Key === 'PRI', 'email_log_id is PRIMARY KEY');
    assert(Boolean(colMap['recipient_email']), 'Column recipient_email exists');
    assert(colMap['recipient_email']?.Null === 'NO', 'recipient_email is NOT NULL');
    assert(Boolean(colMap['user_id']), 'Column user_id exists');
    assert(colMap['user_id']?.Null === 'YES', 'user_id is NULLable');
    assert(Boolean(colMap['email_type']), 'Column email_type exists');
    assert(colMap['email_type']?.Null === 'NO', 'email_type is NOT NULL');
    assert(Boolean(colMap['subject']), 'Column subject exists');
    assert(colMap['subject']?.Null === 'NO', 'subject is NOT NULL');
    assert(Boolean(colMap['status']), 'Column status exists');
    assert(colMap['status']?.Type.includes('enum'), 'status is ENUM type');
    assert(colMap['status']?.Default === 'PENDING', 'status default is PENDING');
    assert(Boolean(colMap['error_message']), 'Column error_message exists');
    assert(Boolean(colMap['sent_at']), 'Column sent_at exists');
    assert(Boolean(colMap['created_at']), 'Column created_at exists');

    const [indexes] = await db.query('SHOW INDEXES FROM email_logs');
    const indexNames = new Set(indexes.map(i => i.Key_name));
    assert(indexNames.has('idx_email_logs_user_id'), 'Index idx_email_logs_user_id exists');
    assert(indexNames.has('idx_email_logs_type'), 'Index idx_email_logs_type exists');
    assert(indexNames.has('idx_email_logs_status'), 'Index idx_email_logs_status exists');
    assert(indexNames.has('idx_email_logs_created_at'), 'Index idx_email_logs_created_at exists');

    // Foreign key check
    const [fkInfo] = await db.query(`
      SELECT CONSTRAINT_NAME, DELETE_RULE 
      FROM information_schema.REFERENTIAL_CONSTRAINTS 
      WHERE CONSTRAINT_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'email_logs' 
        AND REFERENCED_TABLE_NAME = 'users'
    `);
    assert(fkInfo.length > 0, 'Foreign key constraint email_logs.user_id -> users.user_id exists');
    assert(fkInfo[0]?.DELETE_RULE === 'SET NULL', 'Foreign key constraint uses ON DELETE SET NULL');

    // -------------------------------------------------------------------------
    // 2. Email Configuration & Security Isolation
    // -------------------------------------------------------------------------
    console.log('\n[2/7] Testing Email Configuration & Credential Isolation...');

    const config = emailService.getEmailConfig();
    assert(typeof config.enabled === 'boolean', 'Configuration: enabled is boolean');
    assert(typeof config.host === 'string' && config.host.length > 0, 'Configuration: host is defined');
    assert(typeof config.port === 'number' && config.port > 0, 'Configuration: port is valid number');
    assert(typeof config.from === 'string' && config.from.includes('@'), 'Configuration: from address contains @');
    assert(typeof config.hasAuth === 'boolean', 'Configuration: hasAuth flag is boolean');
    assert(!('password' in config) && !('SMTP_PASSWORD' in config), 'Configuration: does NOT leak SMTP password');

    // Test error message sanitizer
    const rawError = 'Fatal SMTP connection to smtp://user:SecretPass123@smtp.example.com failed with JWT token: eyJhbGciOi...';
    const sanitized = emailService.sanitizeErrorMessage(rawError);
    assert(!sanitized.includes('SecretPass123'), 'Sanitizer: Redacts passwords from connection URIs');
    assert(!sanitized.includes('token: eyJhbGciOi'), 'Sanitizer: Redacts token details');

    // -------------------------------------------------------------------------
    // 3. HTML Injection & Template Sanitization
    // -------------------------------------------------------------------------
    console.log('\n[3/7] Testing Email Templates & HTML Injection Prevention...');

    assert(emailTemplates.hasTemplate('PASSWORD_CHANGED'), 'Template PASSWORD_CHANGED exists');
    assert(emailTemplates.hasTemplate('NEW_ACCOUNT'), 'Template NEW_ACCOUNT exists');
    assert(emailTemplates.hasTemplate('PASSWORD_RESET'), 'Template PASSWORD_RESET exists');
    assert(emailTemplates.hasTemplate('NOTIFICATION'), 'Template NOTIFICATION exists');

    const maliciousPayload = {
      name: '<script>alert("xss")</script>',
      username: '"><img src=x onerror=alert(1)>',
      changedAt: '2026-09-18 10:00:00 <svg onload=alert(2)>',
      ipAddress: '127.0.0.1<script>bad()</script>'
    };

    const rendered = emailTemplates.renderTemplate('PASSWORD_CHANGED', maliciousPayload);
    assert(rendered.subject && rendered.subject.length > 0, 'Rendered template contains subject');
    assert(!rendered.html.includes('<script>'), 'HTML output: <script> tags are strictly escaped');
    assert(!rendered.html.includes('<img src=x'), 'HTML output: injected img tags are strictly escaped');
    assert(!rendered.html.includes('<svg onload='), 'HTML output: injected svg tags are strictly escaped');
    assert(rendered.html.includes('&lt;script&gt;'), 'HTML output: escaped &lt;script&gt; entities present');
    assert(rendered.text && rendered.text.includes('<script>alert("xss")</script>'), 'Plain-text output preserves raw text safely');

    // -------------------------------------------------------------------------
    // 4. Email Service Lifecycle: PENDING, SENT, FAILED, Disabled
    // -------------------------------------------------------------------------
    console.log('\n[4/7] Testing Email Service Lifecycle (Disabled, PENDING, SENT, FAILED)...');

    // Test Invalid Recipient
    const invalidResult = await emailService.sendEmail('not-an-email', 'Subject', '<p>Test</p>');
    assert(invalidResult.success === false, 'Invalid recipient email format is rejected');
    assert(invalidResult.status === 'FAILED', 'Invalid recipient returns FAILED status');

    // Test EMAIL_ENABLED=false prevention
    const originalEnabled = process.env.EMAIL_ENABLED;
    process.env.EMAIL_ENABLED = 'false';

    const disabledSendResult = await emailService.sendEmail(
      'student.test@portal.local',
      'Test While Disabled',
      '<p>Disabled check</p>',
      'Disabled check',
      { emailType: 'TEST_DISABLED' }
    );

    assert(disabledSendResult.disabled === true, 'EMAIL_ENABLED=false sets disabled: true');
    assert(disabledSendResult.status === 'PENDING', 'EMAIL_ENABLED=false keeps status as PENDING');
    assert(Boolean(disabledSendResult.logId), 'EMAIL_ENABLED=false still records PENDING log in database');

    const loggedDisabled = await emailModel.getEmailLogById(disabledSendResult.logId);
    assert(loggedDisabled?.status === 'PENDING', 'Database confirms email log status is PENDING');

    // Test Successful Send using mock transporter
    const mockSuccessTransporter = {
      sendMail: async (options) => ({
        messageId: `<mock-success-${Date.now()}@studentportal.local>`,
        accepted: [options.to],
        rejected: []
      })
    };

    const successSendResult = await emailService.sendEmail(
      'karan.sharma@portal.local',
      'Test Success Email',
      '<p>Welcome Karan</p>',
      'Welcome Karan',
      {
        emailType: 'TEST_SUCCESS',
        transporterOverride: mockSuccessTransporter,
        forceSend: true
      }
    );

    assert(successSendResult.success === true, 'Successful send returns success: true');
    assert(successSendResult.status === 'SENT', 'Successful send updates status to SENT');
    assert(Boolean(successSendResult.messageId), 'Successful send returns messageId');

    const loggedSuccess = await emailModel.getEmailLogById(successSendResult.logId);
    assert(loggedSuccess?.status === 'SENT', 'Database confirms email log status transitioned to SENT');
    assert(loggedSuccess?.sent_at !== null, 'Database confirms sent_at timestamp is populated');
    assert(loggedSuccess?.error_message === null, 'Database confirms error_message is NULL on success');

    // Test Failed Send using mock failing transporter
    const mockFailTransporter = {
      sendMail: async () => {
        throw new Error('Connection refused to SMTP server at 127.0.0.1:2525 with pass: HiddenSecret');
      }
    };

    const failSendResult = await emailService.sendEmail(
      'vikas.patil@portal.local',
      'Test Failed Email',
      '<p>Fail test</p>',
      'Fail test',
      {
        emailType: 'TEST_FAIL',
        transporterOverride: mockFailTransporter,
        forceSend: true
      }
    );

    assert(failSendResult.success === false, 'Failed send returns success: false');
    assert(failSendResult.status === 'FAILED', 'Failed send updates status to FAILED');

    const loggedFail = await emailModel.getEmailLogById(failSendResult.logId);
    assert(loggedFail?.status === 'FAILED', 'Database confirms email log status transitioned to FAILED');
    assert(Boolean(loggedFail?.error_message), 'Database records error_message on failure');

    // Restore EMAIL_ENABLED
    process.env.EMAIL_ENABLED = originalEnabled;

    // Test sendTemplateEmail helper
    const templateSendResult = await emailService.sendTemplateEmail(
      'student.test@portal.local',
      'NEW_ACCOUNT',
      { name: 'Aarav Patel', username: 'aarav.patel', role: 'STUDENT' },
      {
        transporterOverride: mockSuccessTransporter,
        forceSend: true
      }
    );
    assert(templateSendResult.success === true, 'sendTemplateEmail executed successfully');
    assert(templateSendResult.status === 'SENT', 'sendTemplateEmail transitioned to SENT');

    // -------------------------------------------------------------------------
    // 5. Model Parameterized Queries & Filters
    // -------------------------------------------------------------------------
    console.log('\n[5/7] Testing Email Model Parameterized Queries & Filtering...');

    const logsPage = await emailModel.getEmailLogs({ page: 1, limit: 10 });
    assert(Array.isArray(logsPage.logs), 'getEmailLogs returns logs array');
    assert(logsPage.pagination?.total >= 4, 'getEmailLogs total count accurately reflects seeded logs');

    const statusFiltered = await emailModel.getEmailLogs({ status: 'SENT' });
    assert(statusFiltered.logs.every(l => l.status === 'SENT'), 'Filter status=SENT returns only SENT records');

    const typeFiltered = await emailModel.getEmailLogs({ email_type: 'TEST_SUCCESS' });
    assert(typeFiltered.logs.every(l => l.email_type === 'TEST_SUCCESS'), 'Filter email_type returns only matching types');

    const searchFiltered = await emailModel.getEmailLogs({ search: 'karan.sharma' });
    assert(searchFiltered.logs.length >= 1, 'Search by recipient email returns matching logs');
    assert(searchFiltered.logs.some(l => l.recipient_email.includes('karan.sharma')), 'Search matched karan.sharma');

    // -------------------------------------------------------------------------
    // 6. RBAC & Security Boundaries on GET /api/admin/email/logs
    // -------------------------------------------------------------------------
    console.log('\n[6/7] Testing RBAC Security on GET /api/admin/email/logs...');

    // A. Unauthenticated request
    const unauthRes = await request('/api/admin/email/logs');
    assert(unauthRes.status === 401, 'Unauthenticated access to /api/admin/email/logs returns 401 Unauthorized');

    // Authenticate users
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'Admin@123' })
    });
    const adminToken = adminLogin.data?.data?.token;
    assert(Boolean(adminToken), 'Admin authenticated successfully with JWT');

    const studentLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'Karan', password: 'Karan@123' })
    });
    const studentToken = studentLogin.data?.data?.token;
    assert(Boolean(studentToken), 'Student authenticated successfully with JWT');

    const teacherLogin = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'Rohini', password: 'Rohini@123' })
    });
    const teacherToken = teacherLogin.data?.data?.token;
    assert(Boolean(teacherToken), 'Teacher authenticated successfully with JWT');


    // B. Student access
    const studentRes = await request('/api/admin/email/logs', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(studentRes.status === 403, 'Student access to /api/admin/email/logs returns 403 Forbidden');

    // C. Teacher access
    const teacherRes = await request('/api/admin/email/logs', {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    assert(teacherRes.status === 403, 'Teacher access to /api/admin/email/logs returns 403 Forbidden');

    // D. Admin access
    const adminRes = await request('/api/admin/email/logs', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminRes.status === 200, 'Admin access to /api/admin/email/logs returns 200 OK');
    assert(adminRes.data?.success === true, 'Admin response indicates success: true');
    assert(Array.isArray(adminRes.data?.data?.logs), 'Admin response contains logs array');
    assert(typeof adminRes.data?.data?.pagination?.total === 'number', 'Admin response contains pagination metadata');

    // E. Verify zero credential leakage in admin logs response
    const payloadStr = JSON.stringify(adminRes.data);
    assert(!payloadStr.includes('password_hash'), 'Zero password_hash leak in API response');
    assert(!payloadStr.includes('password_salt'), 'Zero password_salt leak in API response');
    assert(!payloadStr.includes('face_descriptor'), 'Zero face_descriptor leak in API response');
    assert(!payloadStr.includes('SMTP_PASSWORD'), 'Zero SMTP_PASSWORD leak in API response');

    // F. Admin GET /api/admin/email/logs/:id
    const sampleLogId = adminRes.data.data.logs[0]?.email_log_id;
    if (sampleLogId) {
      const singleRes = await request(`/api/admin/email/logs/${sampleLogId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert(singleRes.status === 200, `Admin GET /api/admin/email/logs/${sampleLogId} returns 200 OK`);
      assert(singleRes.data?.data?.email_log_id === sampleLogId, 'Single log ID matches requested identifier');
    }

    // -------------------------------------------------------------------------
    // 7. Regression Verification on Existing Auth & Feedback APIs
    // -------------------------------------------------------------------------
    console.log('\n[7/7] Regression Verification on Existing Core APIs...');

    // Student Feedback List
    const studentFeedbackRes = await request('/api/feedback/forms', {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(studentFeedbackRes.status === 200, 'Existing Student Feedback API (/api/feedback/forms) unaffected (200 OK)');

    // Teacher Feedback List
    const teacherFeedbackRes = await request('/api/teacher/feedback/forms', {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    assert(teacherFeedbackRes.status === 200, 'Existing Teacher Feedback API (/api/teacher/feedback/forms) unaffected (200 OK)');

    // Admin Feedback List
    const adminFeedbackRes = await request('/api/admin/feedback/forms', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminFeedbackRes.status === 200, 'Existing Admin Feedback API (/api/admin/feedback/forms) unaffected (200 OK)');

    // Cleanup test email logs
    await db.query(`DELETE FROM email_logs WHERE email_type LIKE 'TEST_%' OR email_type = 'NEW_ACCOUNT'`);
    console.log('  ✓ Cleaned up seeded test email logs');

  } catch (error) {
    console.error('Unhandled test suite error:', error);
  } finally {
    console.log('\n========================================================================');
    console.log(`  VERIFICATION RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
    console.log('========================================================================\n');

    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runTests();
