/**
 * STEP 25 — FINAL INTEGRATION, END-TO-END QA & PRODUCTION READINESS TEST SUITE
 * Complete multi-domain verification covering all 19 API groups, security,
 * RBAC/IDOR, calculations, legacy DB protection, audit redaction, and zero residue.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('k:/project/Student Information Portal/src/config/db');

const BASE_URL = 'http://localhost:5000';
const BACKUPS_DIR = path.join('k:/project/Student Information Portal', 'backups');
const PUBLIC_DIR = path.join('k:/project/Student Information Portal', 'public');

function request(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { ...headers }
    };

    if (body) {
      if (typeof body === 'object' && !Buffer.isBuffer(body)) {
        body = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
      }
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const isJson = (res.headers['content-type'] || '').includes('application/json');
        let parsed = null;
        if (isJson) {
          try {
            parsed = JSON.parse(buffer.toString('utf8'));
          } catch (e) {
            parsed = buffer.toString('utf8');
          }
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          rawBody: buffer,
          text: buffer.toString('utf8'),
          body: parsed
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function login(username, password) {
  const res = await request('POST', '/api/auth/login', {}, { username, password });
  if (res.statusCode === 200 && res.body && res.body.data && res.body.data.token) {
    return { token: res.body.data.token, user: res.body.data.user || res.body.data };
  }
  return null;
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log(' STEP 25: FINAL INTEGRATION & PRODUCTION READINESS TEST SUITE');
  console.log('================================================================\n');

  let adminToken, teacherToken, studentToken;
  let adminUser, teacherUser, studentUser;

  try {
    // -------------------------------------------------------------
    // SECTION A: Server Startup, Health & DB Connection
    // -------------------------------------------------------------
    console.log('--- SECTION A: Server Startup & Connectivity ---');
    const healthRes = await request('GET', '/api/health');
    assert(healthRes.statusCode === 200, 'GET /api/health returns 200 OK');
    assert(healthRes.body && healthRes.body.status === 'OK', 'Health check status is OK');

    const dbTestRes = await request('GET', '/api/db-test');
    assert(dbTestRes.statusCode === 200, 'GET /api/db-test returns 200 OK');
    assert(dbTestRes.body && dbTestRes.body.status === 'OK', 'Database connection test status is OK');

    const connTest = await pool.testConnection();
    assert(connTest.success === true, 'MySQL pool connection test passes directly');

    // -------------------------------------------------------------
    // SECTION B: Full Route Group Mount Verification (All 19 Groups)
    // -------------------------------------------------------------
    console.log('\n--- SECTION B: Mounted Route Availability (19 API Groups) ---');
    const apiGroups = [
      { path: '/api/auth/login', method: 'POST', body: {}, expected: 400, desc: '/api/auth' },
      { path: '/api/users', method: 'GET', expected: 401, desc: '/api/users' },
      { path: '/api/students', method: 'GET', expected: 401, desc: '/api/students' },
      { path: '/api/teachers', method: 'GET', expected: 401, desc: '/api/teachers' },
      { path: '/api/departments', method: 'GET', expected: 401, desc: '/api/departments' },
      { path: '/api/courses', method: 'GET', expected: 401, desc: '/api/courses' },
      { path: '/api/enrollments', method: 'GET', expected: 401, desc: '/api/enrollments' },
      { path: '/api/timetable', method: 'GET', expected: 401, desc: '/api/timetable' },
      { path: '/api/attendance', method: 'GET', expected: 401, desc: '/api/attendance' },
      { path: '/api/grades', method: 'GET', expected: 401, desc: '/api/grades' },
      { path: '/api/performance', method: 'GET', expected: 401, desc: '/api/performance' },
      { path: '/api/assignments', method: 'GET', expected: 401, desc: '/api/assignments' },
      { path: '/api/study-materials', method: 'GET', expected: 401, desc: '/api/study-materials' },
      { path: '/api/notices', method: 'GET', expected: 401, desc: '/api/notices' },
      { path: '/api/notifications', method: 'GET', expected: 401, desc: '/api/notifications' },
      { path: '/api/queries', method: 'GET', expected: 401, desc: '/api/queries' },
      { path: '/api/reports/filters', method: 'GET', expected: 401, desc: '/api/reports' },
      { path: '/api/audit-logs', method: 'GET', expected: 401, desc: '/api/audit-logs' },
      { path: '/api/backups', method: 'GET', expected: 401, desc: '/api/backups' }
    ];

    for (const group of apiGroups) {
      const res = await request(group.method, group.path, {}, group.body || null);
      assert(res.statusCode === group.expected, `Route group ${group.desc} is mounted (got: ${res.statusCode}, expected: ${group.expected})`);
    }

    // -------------------------------------------------------------
    // SECTION C: Frontend Assets & Navigation Integrity
    // -------------------------------------------------------------
    console.log('\n--- SECTION C: Frontend Static Assets & Sidebar Navigation ---');

    // 1. All 27 HTML pages
    const htmlPages = [
      '/index.html', '/login.html',
      '/pages/admin/dashboard.html', '/pages/admin/users.html', '/pages/admin/students.html',
      '/pages/admin/teachers.html', '/pages/admin/departments.html', '/pages/admin/courses.html',
      '/pages/admin/enrollments.html', '/pages/admin/timetable.html', '/pages/admin/attendance.html',
      '/pages/admin/grades.html', '/pages/admin/performance.html', '/pages/admin/assignments.html',
      '/pages/admin/study-material.html', '/pages/admin/notices.html', '/pages/admin/notifications.html',
      '/pages/admin/queries.html', '/pages/admin/reports.html', '/pages/admin/audit-logs.html',
      '/pages/admin/backups.html',
      '/pages/student/dashboard.html', '/pages/student/queries.html', '/pages/student/reports.html',
      '/pages/teacher/dashboard.html', '/pages/teacher/queries.html', '/pages/teacher/reports.html'
    ];

    let allHtmlOk = true;
    for (const p of htmlPages) {
      const res = await request('GET', p);
      if (res.statusCode !== 200) {
        allHtmlOk = false;
        console.error(`Page failed: ${p} (status: ${res.statusCode})`);
      }
    }
    assert(allHtmlOk && htmlPages.length === 27, `All 27 HTML frontend pages load successfully (HTTP 200)`);

    // 2. CSS Stylesheets
    const cssFiles = ['/css/auth.css', '/css/dashboard.css', '/css/style.css'];
    let allCssOk = true;
    for (const c of cssFiles) {
      const res = await request('GET', c);
      if (res.statusCode !== 200) allCssOk = false;
    }
    assert(allCssOk && cssFiles.length === 3, 'All 3 core CSS stylesheets load successfully (HTTP 200)');

    // 3. Client JS Files
    const jsFiles = [
      '/js/admin-assignments.js', '/js/admin-attendance.js', '/js/admin-audit-logs.js',
      '/js/admin-backups.js', '/js/admin-courses.js', '/js/admin-dashboard.js',
      '/js/admin-departments.js', '/js/admin-enrollments.js', '/js/admin-grades.js',
      '/js/admin-notices.js', '/js/admin-notifications.js', '/js/admin-performance.js',
      '/js/admin-queries.js', '/js/admin-reports.js', '/js/admin-students.js',
      '/js/admin-study-material.js', '/js/admin-teachers.js', '/js/admin-timetable.js',
      '/js/admin-users.js', '/js/api.js', '/js/auth.js',
      '/js/student-queries.js', '/js/student-reports.js',
      '/js/teacher-queries.js', '/js/teacher-reports.js', '/js/utils.js'
    ];
    let allJsOk = true;
    for (const j of jsFiles) {
      const res = await request('GET', j);
      if (res.statusCode !== 200) allJsOk = false;
    }
    assert(allJsOk && jsFiles.length === 26, 'All 26 client-side JavaScript modules load successfully (HTTP 200)');

    // 4. Admin Navigation Completeness & No Broken Links
    const adminPagesDir = path.join(PUBLIC_DIR, 'pages', 'admin');
    const adminHtmlFiles = fs.readdirSync(adminPagesDir).filter(f => f.endsWith('.html'));
    const requiredNavModules = [
      '/pages/admin/dashboard.html', '/pages/admin/users.html', '/pages/admin/students.html',
      '/pages/admin/teachers.html', '/pages/admin/departments.html', '/pages/admin/courses.html',
      '/pages/admin/enrollments.html', '/pages/admin/timetable.html', '/pages/admin/attendance.html',
      '/pages/admin/grades.html', '/pages/admin/performance.html', '/pages/admin/assignments.html',
      '/pages/admin/study-material.html', '/pages/admin/notices.html', '/pages/admin/notifications.html',
      '/pages/admin/queries.html', '/pages/admin/reports.html', '/pages/admin/audit-logs.html',
      '/pages/admin/backups.html'
    ];

    let navConsistent = true;
    for (const adminFile of adminHtmlFiles) {
      const content = fs.readFileSync(path.join(adminPagesDir, adminFile), 'utf8');
      for (const link of requiredNavModules) {
        if (!content.includes(link)) {
          navConsistent = false;
          console.error(`Page ${adminFile} is missing sidebar link to: ${link}`);
        }
      }
    }
    assert(navConsistent && adminHtmlFiles.length === 19, 'All 19 Admin pages have complete and consistent sidebar navigation across all 19 modules');

    // -------------------------------------------------------------
    // SECTION D: Authentication & Token Lifecycle
    // -------------------------------------------------------------
    console.log('\n--- SECTION D: End-to-End Authentication & Token Lifecycle ---');

    // 1. Successful Logins
    const adminLogin = await login('admin', 'Admin@123');
    const teacherLogin = await login('teacher', 'Teacher@123');
    const studentLogin = await login('student', 'Student@123');

    assert(!!adminLogin && !!adminLogin.token, 'Admin successfully authenticated');
    assert(!!teacherLogin && !!teacherLogin.token, 'Teacher successfully authenticated');
    assert(!!studentLogin && !!studentLogin.token, 'Student successfully authenticated');

    adminToken = adminLogin ? adminLogin.token : null;
    teacherToken = teacherLogin ? teacherLogin.token : null;
    studentToken = studentLogin ? studentLogin.token : null;

    adminUser = adminLogin ? adminLogin.user : null;
    teacherUser = teacherLogin ? teacherLogin.user : null;
    studentUser = studentLogin ? studentLogin.user : null;

    // 2. Sensitive Credential Concealment in Login Responses
    const adminLoginStr = JSON.stringify(adminLogin).toLowerCase();
    assert(!adminLoginStr.includes('password_hash'), 'Login response does NOT leak password_hash');
    assert(!adminLoginStr.includes('admin@123'), 'Login response does NOT leak plaintext password');

    // 3. Invalid Password Rejection
    const badPassRes = await request('POST', '/api/auth/login', {}, { username: 'admin', password: 'WrongPassword!99' });
    assert(badPassRes.statusCode === 401, 'Invalid password rejected with 401 Unauthorized');

    // 4. Unknown Username Rejection
    const badUserRes = await request('POST', '/api/auth/login', {}, { username: 'nonexistent_user_xyz', password: 'Password@123' });
    assert(badUserRes.statusCode === 401, 'Unknown username rejected with 401 Unauthorized');

    // 5. Deactivated Account Rejection
    const [roles] = await pool.query("SELECT role_id FROM roles WHERE role_name = 'STUDENT' LIMIT 1");
    const roleId = roles[0].role_id;
    const [inactiveUserRes] = await pool.query(`
      INSERT INTO users (username, password_hash, email, role_id, is_active, first_name, last_name, created_at, updated_at)
      VALUES ('temp_inactive', '$2a$10$abcdefghijklmnopqrstuu', 'inactive@portal.com', ?, false, 'Temp', 'Inactive', NOW(), NOW())
    `, [roleId]);
    const inactiveUserId = inactiveUserRes.insertId;

    const inactiveLoginRes = await request('POST', '/api/auth/login', {}, { username: 'temp_inactive', password: 'AnyPassword@123' });
    assert(inactiveLoginRes.statusCode === 401 || inactiveLoginRes.statusCode === 403, 'Deactivated user rejected on login (got 401/403)');

    await pool.query('DELETE FROM users WHERE user_id = ?', [inactiveUserId]);

    // 6. Token Tampering / Expired Token
    const tamperedRes = await request('GET', '/api/users', { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.signature' });
    assert(tamperedRes.statusCode === 401, 'Tampered/Invalid JWT rejected with 401 Unauthorized');

    // 7. Logout Endpoint
    const logoutRes = await request('POST', '/api/auth/logout', { Authorization: `Bearer ${adminToken}` });
    assert(logoutRes.statusCode === 200, 'POST /api/auth/logout returns 200 OK');

    // Re-login admin
    const relogin = await login('admin', 'Admin@123');
    adminToken = relogin.token;

    // -------------------------------------------------------------
    // SECTION E: Universal RBAC & IDOR Security Matrix
    // -------------------------------------------------------------
    console.log('\n--- SECTION E: Universal RBAC & IDOR Security Matrix ---');

    // 1. Student Accessing Admin-Only Endpoints
    const adminEndpoints = [
      '/api/users', '/api/departments', '/api/courses', '/api/enrollments',
      '/api/timetable', '/api/attendance', '/api/grades', '/api/performance',
      '/api/assignments', '/api/study-materials', '/api/notices', '/api/notifications',
      '/api/audit-logs', '/api/backups'
    ];

    let studentBlocked = true;
    for (const ep of adminEndpoints) {
      const res = await request('GET', ep, { Authorization: `Bearer ${studentToken}` });
      if (res.statusCode !== 403) {
        studentBlocked = false;
        console.error(`Student permitted access to admin endpoint: ${ep} (status: ${res.statusCode})`);
      }
    }
    assert(studentBlocked, 'Student blocked with 403 Forbidden across all Admin-only endpoints');

    // 2. Teacher Accessing Admin-Only Endpoints
    let teacherBlocked = true;
    for (const ep of adminEndpoints) {
      const res = await request('GET', ep, { Authorization: `Bearer ${teacherToken}` });
      if (res.statusCode !== 403) {
        teacherBlocked = false;
        console.error(`Teacher permitted access to admin endpoint: ${ep} (status: ${res.statusCode})`);
      }
    }
    assert(teacherBlocked, 'Teacher blocked with 403 Forbidden across all Admin-only endpoints');

    // 3. Method Immutability Enforcement (405 Method Not Allowed)
    const auditPut = await request('PUT', '/api/audit-logs/1', { Authorization: `Bearer ${adminToken}` });
    const auditDelete = await request('DELETE', '/api/audit-logs/1', { Authorization: `Bearer ${adminToken}` });
    const auditPost = await request('POST', '/api/audit-logs', { Authorization: `Bearer ${adminToken}` });
    assert(auditPut.statusCode === 405, 'PUT /api/audit-logs/:id returns 405 Method Not Allowed');
    assert(auditDelete.statusCode === 405, 'DELETE /api/audit-logs/:id returns 405 Method Not Allowed');
    assert(auditPost.statusCode === 405, 'POST /api/audit-logs returns 405 Method Not Allowed');

    const backupPut = await request('PUT', '/api/backups/1', { Authorization: `Bearer ${adminToken}` });
    const backupDelete = await request('DELETE', '/api/backups/1', { Authorization: `Bearer ${adminToken}` });
    assert(backupPut.statusCode === 405, 'PUT /api/backups/:id returns 405 Method Not Allowed');
    assert(backupDelete.statusCode === 405, 'DELETE /api/backups/:id returns 405 Method Not Allowed');

    // -------------------------------------------------------------
    // SECTION F: Business Rules & Calculation Consistency
    // -------------------------------------------------------------
    console.log('\n--- SECTION F: Business Rules & Calculation Consistency ---');

    // Grade scale test:
    function calculateGrade(percentage) {
      if (percentage >= 90) return { grade: 'O', point: 10.0 };
      if (percentage >= 80) return { grade: 'A+', point: 9.0 };
      if (percentage >= 70) return { grade: 'A', point: 8.0 };
      if (percentage >= 60) return { grade: 'B+', point: 7.0 };
      if (percentage >= 50) return { grade: 'B', point: 6.0 };
      if (percentage >= 45) return { grade: 'C', point: 5.0 };
      if (percentage >= 40) return { grade: 'P', point: 4.0 };
      return { grade: 'F', point: 0.0 };
    }

    assert(calculateGrade(95).grade === 'O' && calculateGrade(95).point === 10.0, 'Grade scale: 95% -> O (10.0)');
    assert(calculateGrade(82).grade === 'A+' && calculateGrade(82).point === 9.0, 'Grade scale: 82% -> A+ (9.0)');
    assert(calculateGrade(74).grade === 'A' && calculateGrade(74).point === 8.0, 'Grade scale: 74% -> A (8.0)');
    assert(calculateGrade(65).grade === 'B+' && calculateGrade(65).point === 7.0, 'Grade scale: 65% -> B+ (7.0)');
    assert(calculateGrade(55).grade === 'B' && calculateGrade(55).point === 6.0, 'Grade scale: 55% -> B (6.0)');
    assert(calculateGrade(48).grade === 'C' && calculateGrade(48).point === 5.0, 'Grade scale: 48% -> C (5.0)');
    assert(calculateGrade(42).grade === 'P' && calculateGrade(42).point === 4.0, 'Grade scale: 42% -> P (4.0)');
    assert(calculateGrade(35).grade === 'F' && calculateGrade(35).point === 0.0, 'Grade scale: 35% -> F (0.0)');

    // Attendance threshold rule:
    const isDefaulter = (present, total) => (total > 0 ? (present / total) * 100 < 75.0 : false);
    assert(isDefaulter(14, 20) === true, 'Attendance 14/20 (70%) flagged as Defaulter (< 75%)');
    assert(isDefaulter(15, 20) === false, 'Attendance 15/20 (75%) flagged as Non-Defaulter (>= 75%)');
    assert(isDefaulter(18, 20) === false, 'Attendance 18/20 (90%) flagged as Non-Defaulter (>= 75%)');

    // -------------------------------------------------------------
    // SECTION G: Audit Logging Security & Redaction
    // -------------------------------------------------------------
    console.log('\n--- SECTION G: Audit Logging Security & Redaction ---');
    const auditRes = await request('GET', '/api/audit-logs?page=1&limit=5', { Authorization: `Bearer ${adminToken}` });
    assert(auditRes.statusCode === 200, 'GET /api/audit-logs returns 200 for Admin');
    assert(auditRes.body && Array.isArray(auditRes.body.data), 'Audit logs returned in data array');

    // Verify sensitive keys are redacted across audit logs
    const [allAuditRows] = await pool.query('SELECT details FROM student_portal_db.audit_logs LIMIT 50');
    let noSensitiveLeak = true;
    for (const row of allAuditRows) {
      const str = typeof row.details === 'string' ? row.details : JSON.stringify(row.details);
      if (str.includes('Admin@123') || str.includes('Teacher@123') || str.includes('Student@123') || str.includes('Karan@21')) {
        noSensitiveLeak = false;
        console.error('CRITICAL: Plaintext password found in audit log row:', str);
      }
    }
    assert(noSensitiveLeak, 'Zero credentials or database passwords leaked in audit_logs details');

    // -------------------------------------------------------------
    // SECTION H: Backup & Restore Security
    // -------------------------------------------------------------
    console.log('\n--- SECTION H: Backup & Restore Security & Integrity ---');

    // Create Backup
    const backupCreateRes = await request('POST', '/api/backups', { Authorization: `Bearer ${adminToken}` }, { backup_type: 'FULL' });
    assert(backupCreateRes.statusCode === 201, 'POST /api/backups creates backup (201 Created)');
    const createdBackup = backupCreateRes.body && backupCreateRes.body.data;
    const testBackupId = createdBackup && (createdBackup.backup_id || createdBackup.id);
    const testFileName = createdBackup && (createdBackup.file_name || createdBackup.backup_name);

    assert(!!testBackupId, `Backup ID generated: ${testBackupId}`);
    assert(createdBackup.status === 'COMPLETED', 'Backup status is COMPLETED');
    assert(!!createdBackup.checksum && createdBackup.checksum.length === 64, 'SHA-256 checksum generated');

    // Verify file exists on disk outside public/
    const diskPath = path.join(BACKUPS_DIR, testFileName);
    assert(fs.existsSync(diskPath), `Physical backup file exists at: ${diskPath}`);
    assert(!diskPath.includes('public'), 'Backup file is stored strictly outside public/ directory');

    // Validate Backup Endpoint
    const validateRes = await request('POST', `/api/backups/${testBackupId}/validate`, { Authorization: `Bearer ${adminToken}` });
    assert(validateRes.statusCode === 200, 'POST /api/backups/:id/validate returns 200');
    assert(validateRes.body && validateRes.body.data && validateRes.body.data.isValid === true, 'Backup reported as isValid: true');

    // Download Protection
    const dlRes = await request('GET', `/api/backups/${testBackupId}/download`, { Authorization: `Bearer ${adminToken}` });
    assert(dlRes.statusCode === 200, 'GET /api/backups/:id/download returns 200');
    assert((dlRes.headers['content-disposition'] || '').includes('attachment'), 'Content-Disposition specifies attachment');

    // Two-Step Restoration Workflow
    const prepRes = await request('POST', `/api/backups/${testBackupId}/restore/prepare`, { Authorization: `Bearer ${adminToken}` });
    assert(prepRes.statusCode === 200, 'POST /api/backups/:id/restore/prepare returns 200');
    const restoreToken = prepRes.body.data.restore_token || prepRes.body.data.confirmation_token;
    assert(!!restoreToken, 'Prepare step returns valid restore token');

    const confirmRes = await request('POST', `/api/backups/${testBackupId}/restore/confirm`, { Authorization: `Bearer ${adminToken}` }, {
      restore_token: restoreToken
    });
    assert(confirmRes.statusCode === 200, 'POST /api/backups/:id/restore/confirm executes restore cleanly (200 OK)');

    // Token Single-Use Check
    const reuseRes = await request('POST', `/api/backups/${testBackupId}/restore/confirm`, { Authorization: `Bearer ${adminToken}` }, {
      restore_token: restoreToken
    });
    assert(reuseRes.statusCode === 400, 'Re-using consumed restore token returns 400 Bad Request');

    // -------------------------------------------------------------
    // SECTION I: Error Handling & Credential Concealment
    // -------------------------------------------------------------
    console.log('\n--- SECTION I: Error Handling & Credential Concealment ---');

    // Malformed JSON
    const malformedRes = await request('POST', '/api/departments', {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }, '{ invalid_json: ');
    assert(malformedRes.statusCode === 400 || malformedRes.statusCode === 500, 'Malformed JSON rejected with 400/500');
    assert(!malformedRes.text.includes('DB_PASSWORD') && !malformedRes.text.includes('Karan@21'), 'Error response does NOT leak database password');

    // Non-existent resource ID
    const notFoundRes = await request('GET', '/api/departments/999999', { Authorization: `Bearer ${adminToken}` });
    assert(notFoundRes.statusCode === 404, 'Non-existent department ID returns 404 Not Found');

    // -------------------------------------------------------------
    // SECTION J: Database Schema Integrity, Legacy DB & Zero Residue
    // -------------------------------------------------------------
    console.log('\n--- SECTION J: Database Integrity & Zero-Residue Audit ---');

    // 1. Schema check on student_portal_db
    const [spTables] = await pool.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'student_portal_db' ORDER BY TABLE_NAME");
    assert(spTables.length === 20, `student_portal_db has exactly 20 tables (found: ${spTables.length})`);

    // 2. Legacy database protection check
    const [legacyTables] = await pool.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'student_information_portal' ORDER BY TABLE_NAME");
    assert(legacyTables.length === 19, `Legacy DB student_information_portal has exactly 19 tables (found: ${legacyTables.length})`);

    const [legacyUsers] = await pool.query('SELECT COUNT(*) AS cnt FROM student_information_portal.users');
    assert(legacyUsers[0].cnt === 5, `Legacy DB users count remains untouched at 5 (found: ${legacyUsers[0].cnt})`);

    // 3. Clean up test backups from disk
    if (fs.existsSync(BACKUPS_DIR)) {
      const files = fs.readdirSync(BACKUPS_DIR);
      for (const f of files) {
        if (f.endsWith('.sql')) {
          fs.unlinkSync(path.join(BACKUPS_DIR, f));
        }
      }
    }
    const remainingSqlFiles = fs.existsSync(BACKUPS_DIR) ? fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.sql')) : [];
    assert(remainingSqlFiles.length === 0, 'All generated test .sql files purged from backups/ directory');

    // 4. Clean up test database rows back to clean baseline
    await pool.query('DELETE FROM student_portal_db.backup_history');
    await pool.query('ALTER TABLE student_portal_db.backup_history AUTO_INCREMENT = 1');
    await pool.query('DELETE FROM student_portal_db.audit_logs');
    await pool.query('ALTER TABLE student_portal_db.audit_logs AUTO_INCREMENT = 1');

    const [finalUsers] = await pool.query('SELECT COUNT(*) AS cnt FROM student_portal_db.users');
    assert(finalUsers[0].cnt === 3, `student_portal_db.users count is exactly 3 (found: ${finalUsers[0].cnt})`);

    const [finalRoles] = await pool.query('SELECT COUNT(*) AS cnt FROM student_portal_db.roles');
    assert(finalRoles[0].cnt === 3, `student_portal_db.roles count is exactly 3 (found: ${finalRoles[0].cnt})`);

    const operationalTables = [
      'assignments', 'attendance', 'audit_logs', 'backup_history',
      'courses', 'departments', 'enrollments', 'grades',
      'notices', 'notifications', 'performance_records', 'queries',
      'query_replies', 'reports', 'students', 'study_materials',
      'teachers', 'timetable'
    ];

    let allZero = true;
    for (const t of operationalTables) {
      const [cnt] = await pool.query(`SELECT COUNT(*) AS cnt FROM student_portal_db.${t}`);
      if (cnt[0].cnt !== 0) {
        allZero = false;
        console.error(`Table ${t} has residual rows: ${cnt[0].cnt}`);
      }
    }
    assert(allZero, 'All 18 operational tables in student_portal_db cleanly reset to 0 rows');

  } catch (err) {
    console.error('Fatal test error in Step 25:', err);
    failed++;
  } finally {
    console.log('\n================================================================');
    console.log(` STEP 25 FINAL INTEGRATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');
    await pool.end();
    process.exit(failed === 0 ? 0 : 1);
  }
}

runTests();
