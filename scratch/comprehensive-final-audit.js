require('dotenv').config();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');

const BASE_URL = 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_in_production';

async function request(method, pathUrl, token = null, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = {
    method,
    headers
  };
  if (body) options.body = typeof body === 'string' ? body : JSON.stringify(body);

  try {
    const res = await fetch(`${BASE_URL}${pathUrl}`, options);
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text().catch(() => null);
    }
    return { status: res.status, headers: res.headers, data };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

async function runComprehensiveAudit() {
  console.log('========================================================================');
  console.log('  STUDENT INFORMATION PORTAL — FINAL COMPREHENSIVE AUDIT');
  console.log('========================================================================\n');

  const auditResults = {};
  let totalAssertions = 0;
  let passedAssertions = 0;
  let failedAssertions = 0;

  function record(moduleName, condition, desc, failureDetails = null) {
    totalAssertions++;
    if (!auditResults[moduleName]) {
      auditResults[moduleName] = { passed: 0, failed: 0, issues: [] };
    }
    if (condition) {
      passedAssertions++;
      auditResults[moduleName].passed++;
      console.log(`  [PASS] [${moduleName}] ${desc}`);
    } else {
      failedAssertions++;
      auditResults[moduleName].failed++;
      auditResults[moduleName].issues.push({ desc, details: failureDetails });
      console.error(`  [FAIL] [${moduleName}] ${desc} ${failureDetails ? `(${JSON.stringify(failureDetails)})` : ''}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // 1. AUTHENTICATION & RBAC
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing Authentication & RBAC ---');
    const adminLogin = await request('POST', '/api/auth/login', null, { username: 'admin', password: 'Admin@123' });
    record('Authentication', adminLogin.status === 200, 'Admin login returns 200 OK');
    const adminToken = adminLogin.data?.data?.token;
    record('Authentication', !!adminToken, 'Admin receives valid JWT token');

    const karanLogin = await request('POST', '/api/auth/login', null, { username: 'Karan', password: 'Karan@123' });
    record('Authentication', karanLogin.status === 200, 'Student (Karan) login returns 200 OK');
    const studentToken = karanLogin.data?.data?.token;

    const rohiniLogin = await request('POST', '/api/auth/login', null, { username: 'Rohini', password: 'Rohini@123' });
    record('Authentication', rohiniLogin.status === 200, 'Teacher (Rohini) login returns 200 OK');
    const teacherToken = rohiniLogin.data?.data?.token;

    // Bad password
    const badLogin = await request('POST', '/api/auth/login', null, { username: 'admin', password: 'WrongPassword' });
    record('Authentication', badLogin.status === 401, 'Invalid password returns 401 Unauthorized');

    // No credentials leak
    const loginPayloadStr = JSON.stringify(adminLogin.data).toLowerCase();
    record('Authentication', !loginPayloadStr.includes('password_hash') && !loginPayloadStr.includes('admin@123'), 'Login response conceals password_hash and plaintext password');

    // RBAC: Student cannot access /api/users
    const studentAccessUsers = await request('GET', '/api/users', studentToken);
    record('Authentication', studentAccessUsers.status === 403, 'Student blocked from /api/users with 403 Forbidden');

    // RBAC: Teacher cannot access /api/users
    const teacherAccessUsers = await request('GET', '/api/users', teacherToken);
    record('Authentication', teacherAccessUsers.status === 403, 'Teacher blocked from /api/users with 403 Forbidden');

    // RBAC: Admin accesses /api/users
    const adminAccessUsers = await request('GET', '/api/users', adminToken);
    record('Authentication', adminAccessUsers.status === 200, 'Admin accesses /api/users with 200 OK');

    // -------------------------------------------------------------------------
    // 2. USER MANAGEMENT
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing User Management ---');
    record('User Management', adminAccessUsers.data?.data?.users?.length > 0, 'Users list returned for Admin');
    const [roles] = await pool.query('SELECT role_name FROM roles ORDER BY role_id');
    const roleNames = roles.map(r => r.role_name);
    record('User Management', roleNames.includes('ADMIN') && roleNames.includes('TEACHER') && roleNames.includes('STUDENT'), 'Core roles exist in DB (ADMIN, TEACHER, STUDENT)');

    // -------------------------------------------------------------------------
    // 3. STUDENT MANAGEMENT
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Student Management ---');
    const studentsRes = await request('GET', '/api/students', adminToken);
    record('Student Management', studentsRes.status === 200, 'Admin GET /api/students returns 200 OK');
    const studentList = studentsRes.data?.data?.students || [];
    record('Student Management', studentList.length > 0, 'Student roster retrieved');
    const hasPRN = studentList.every(s => !!s.prn_number);
    record('Student Management', hasPRN, 'All student records have valid PRN numbers');

    // -------------------------------------------------------------------------
    // 4. TEACHER MANAGEMENT
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Teacher Management ---');
    const teachersRes = await request('GET', '/api/teachers', adminToken);
    record('Teacher Management', teachersRes.status === 200, 'Admin GET /api/teachers returns 200 OK');
    const teacherList = teachersRes.data?.data?.teachers || [];
    record('Teacher Management', teacherList.length > 0, 'Teacher roster retrieved');

    // -------------------------------------------------------------------------
    // 5. DEPARTMENT & COURSE MANAGEMENT
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Department & Course Management ---');
    const deptsRes = await request('GET', '/api/departments', adminToken);
    record('Department', deptsRes.status === 200, 'GET /api/departments returns 200 OK');
    const coursesRes = await request('GET', '/api/courses', adminToken);
    record('Course', coursesRes.status === 200, 'GET /api/courses returns 200 OK');
    const [courses] = await pool.query('SELECT course_code, credits FROM courses');
    const uniqueCodes = new Set(courses.map(c => c.course_code));
    record('Course', uniqueCodes.size === courses.length, 'All course codes in database are unique');

    // -------------------------------------------------------------------------
    // 6. ENROLLMENT
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing Enrollment ---');
    const enrollmentsRes = await request('GET', '/api/enrollments', adminToken);
    record('Enrollment', enrollmentsRes.status === 200, 'GET /api/enrollments returns 200 OK');
    const [dupEnrollments] = await pool.query('SELECT student_id, course_id, COUNT(*) as c FROM enrollments GROUP BY student_id, course_id HAVING c > 1');
    record('Enrollment', dupEnrollments.length === 0, 'Zero duplicate active student-course enrollments exist');

    // -------------------------------------------------------------------------
    // 7. ATTENDANCE & 75% THRESHOLD
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testing Attendance Rules ---');
    const attendanceModel = require('../src/models/attendance.model');
    record('Attendance', attendanceModel.LOW_ATTENDANCE_THRESHOLD === 75.0, 'Low attendance threshold is strictly 75.0%');
    const [validAttStatuses] = await pool.query("SELECT DISTINCT status FROM attendance WHERE status NOT IN ('Present', 'Absent', 'Late', 'Excused')");
    record('Attendance', validAttStatuses.length === 0, 'All attendance records strictly match Present/Absent/Late/Excused');

    // -------------------------------------------------------------------------
    // 8. GRADES & SGPA CALCULATION
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Testing Grades & Scale ---');
    const gradeModel = require('../src/models/grade.model');
    const g95 = gradeModel.calculateGradeAndPoints(95);
    const g82 = gradeModel.calculateGradeAndPoints(82);
    const g74 = gradeModel.calculateGradeAndPoints(74);
    const g65 = gradeModel.calculateGradeAndPoints(65);
    const g55 = gradeModel.calculateGradeAndPoints(55);
    const g48 = gradeModel.calculateGradeAndPoints(48);
    const g42 = gradeModel.calculateGradeAndPoints(42);
    const g35 = gradeModel.calculateGradeAndPoints(35);

    const scaleCorrect = (
      g95.letter_grade === 'O' && g95.grade_point === 10 &&
      g82.letter_grade === 'A+' && g82.grade_point === 9 &&
      g74.letter_grade === 'A' && g74.grade_point === 8 &&
      g65.letter_grade === 'B+' && g65.grade_point === 7 &&
      g55.letter_grade === 'B' && g55.grade_point === 6 &&
      g48.letter_grade === 'C' && g48.grade_point === 5 &&
      g42.letter_grade === 'P' && g42.grade_point === 4 &&
      g35.letter_grade === 'F' && g35.grade_point === 0
    );
    record('Grades', scaleCorrect, 'Official grade scale (O, A+, A, B+, B, C, P, F) strictly verified');

    // -------------------------------------------------------------------------
    // 9. PERFORMANCE ANALYTICS
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Testing Performance Analytics ---');
    const perfRes = await request('GET', '/api/performance/overview', adminToken);
    record('Performance', perfRes.status === 200, 'GET /api/performance/overview returns 200 OK');

    // -------------------------------------------------------------------------
    // 10. TIMETABLE
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Testing Timetable Rules ---');
    const ttRes = await request('GET', '/api/timetable', adminToken);
    record('Timetable', ttRes.status === 200, 'GET /api/timetable returns 200 OK');
    const [ttDays] = await pool.query("SELECT DISTINCT day_of_week FROM timetable WHERE day_of_week NOT IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')");
    record('Timetable', ttDays.length === 0, 'Timetable days strictly restricted to Monday-Saturday');

    // -------------------------------------------------------------------------
    // 11. ASSIGNMENTS
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Testing Assignments ---');
    const asgRes = await request('GET', '/api/assignments', studentToken);
    record('Assignments', asgRes.status === 200, 'Student GET /api/assignments returns 200 OK');

    // -------------------------------------------------------------------------
    // 12. STUDY MATERIAL
    // -------------------------------------------------------------------------
    console.log('\n--- 12. Testing Study Material ---');
    const matRes = await request('GET', '/api/study-materials', studentToken);
    record('Study Material', matRes.status === 200, 'Student GET /api/study-materials returns 200 OK');

    // -------------------------------------------------------------------------
    // 13. NOTICE BOARD
    // -------------------------------------------------------------------------
    console.log('\n--- 13. Testing Notice Board ---');
    const noticesRes = await request('GET', '/api/notices', studentToken);
    record('Notice Board', noticesRes.status === 200, 'Student GET /api/notices returns 200 OK');

    // -------------------------------------------------------------------------
    // 14. NOTIFICATIONS
    // -------------------------------------------------------------------------
    console.log('\n--- 14. Testing Notifications ---');
    const notifsRes = await request('GET', '/api/notifications', studentToken);
    record('Notifications', notifsRes.status === 200, 'Student GET /api/notifications returns 200 OK');

    // -------------------------------------------------------------------------
    // 15. FEEDBACK
    // -------------------------------------------------------------------------
    console.log('\n--- 15. Testing Feedback ---');
    const feedbackRes = await request('GET', '/api/feedback/forms', studentToken);
    record('Feedback', feedbackRes.status === 200, 'Student GET /api/feedback/forms returns 200 OK');
    const teacherFbRes = await request('GET', '/api/teacher/feedback/forms', teacherToken);
    record('Feedback', teacherFbRes.status === 200, 'Teacher GET /api/teacher/feedback/forms returns 200 OK');

    // -------------------------------------------------------------------------
    // 16. ACADEMIC CALENDAR & EXAMS
    // -------------------------------------------------------------------------
    console.log('\n--- 16. Testing Academic Calendar & Exams ---');
    const calRes = await request('GET', '/api/academic-events', studentToken);
    record('Academic Calendar', calRes.status === 200, 'Student GET /api/academic-events returns 200 OK');
    const examRes = await request('GET', '/api/academic-events/exams', studentToken);
    record('Exam', examRes.status === 200, 'Student GET /api/academic-events/exams returns 200 OK');

    // -------------------------------------------------------------------------
    // 17. FACE AUTHENTICATION
    // -------------------------------------------------------------------------
    console.log('\n--- 17. Testing Face Authentication ---');
    const faceStatusRes = await request('GET', '/api/face-auth/status', studentToken);
    record('Face Authentication', faceStatusRes.status === 200, 'GET /api/face-auth/status returns 200 OK');
    record('Face Authentication', typeof faceStatusRes.data?.data?.is_registered === 'boolean', 'Status reports is_registered boolean');
    // Reject registration without liveness
    const unverifiedFace = await request('POST', '/api/face-auth/register', studentToken, { liveness_verified: false });
    record('Face Authentication', unverifiedFace.status === 400, 'Registration without liveness verification rejected with 400');

    // -------------------------------------------------------------------------
    // 18. EMAIL SYSTEM
    // -------------------------------------------------------------------------
    console.log('\n--- 18. Testing Email System Allowlist & Preferences ---');
    const notifEmailService = require('../src/services/notificationEmail.service');
    const expected12Types = [
      'NEW_ASSIGNMENT', 'ASSIGNMENT_DUE_SOON', 'ASSIGNMENT_OVERDUE', 'ASSIGNMENT_EVALUATED',
      'NEW_RESULT', 'LOW_ATTENDANCE', 'EXAM_REMINDER', 'EXAM_SCHEDULED',
      'TIMETABLE_REMINDER', 'NEW_NOTICE', 'NEW_FEEDBACK_FORM', 'ACADEMIC_EVENT_REMINDER'
    ];
    let allowlistAll12 = true;
    for (const t of expected12Types) {
      if (!notifEmailService.isEmailNotificationEnabled(t)) {
        allowlistAll12 = false;
        console.error(`Missing type in allowlist: ${t}`);
      }
    }
    record('Email', allowlistAll12, 'All 12 email notification types present in EMAIL_NOTIFICATION_ALLOWLIST');

    const emailPrefRes = await request('GET', '/api/email/preferences', studentToken);
    record('Email', emailPrefRes.status === 200, 'Student GET /api/email/preferences returns 200 OK');
    const prefData = emailPrefRes.data?.data;
    record('Email', prefData && prefData.email_enabled === true, 'Student master email_enabled is true by default');

    // -------------------------------------------------------------------------
    // 19. REPORTS
    // -------------------------------------------------------------------------
    console.log('\n--- 19. Testing Reports ---');
    const repFilterRes = await request('GET', '/api/reports/filters/options', adminToken);
    record('Reports', repFilterRes.status === 200, 'Admin GET /api/reports/filters/options returns 200 OK');

    // -------------------------------------------------------------------------
    // 20. AUDIT LOGS
    // -------------------------------------------------------------------------
    console.log('\n--- 20. Testing Audit Logs ---');
    const auditRes = await request('GET', '/api/audit-logs', adminToken);
    record('Audit Logs', auditRes.status === 200, 'Admin GET /api/audit-logs returns 200 OK');
    const postAudit = await request('POST', '/api/audit-logs', adminToken, {});
    record('Audit Logs', postAudit.status === 405, 'Direct POST /api/audit-logs disabled with 405 Method Not Allowed');

    // -------------------------------------------------------------------------
    // 21. BACKUP / RESTORE
    // -------------------------------------------------------------------------
    console.log('\n--- 21. Testing Backup & Restore ---');
    const backupListRes = await request('GET', '/api/backups', adminToken);
    record('Backup/Restore', backupListRes.status === 200, 'Admin GET /api/backups returns 200 OK');

    // -------------------------------------------------------------------------
    // 22. SECURITY & SECRETS ISOLATION
    // -------------------------------------------------------------------------
    console.log('\n--- 22. Testing Security & Secret Isolation ---');
    const adminEmailConfig = await request('GET', '/api/admin/email/config', adminToken);
    const configStr = JSON.stringify(adminEmailConfig.data || '').toLowerCase();
    record('Security', !configStr.includes('smtp_password') && !configStr.includes('admin@123'), 'Email config API conceals SMTP password');

    // Check SQL Injection resistance on query params
    const sqliTest = await request('GET', "/api/courses?department_id=1' OR '1'='1", adminToken);
    record('Security', sqliTest.status === 200 || sqliTest.status === 400, 'Parameterized queries prevent SQL injection errors');

    // -------------------------------------------------------------------------
    // 23. DATABASE INTEGRITY
    // -------------------------------------------------------------------------
    console.log('\n--- 23. Testing Database Integrity ---');
    const [tables] = await pool.query('SHOW TABLES');
    record('Database', tables.length === 33, `Database has exactly 33 tables (found: ${tables.length})`);

    const [orphanCheck] = await pool.query('SELECT COUNT(*) as c FROM students s LEFT JOIN users u ON s.user_id = u.user_id WHERE u.user_id IS NULL');
    record('Database', orphanCheck[0].c === 0, 'Zero orphan student records');

    // -------------------------------------------------------------------------
    // 24. API AUDIT
    // -------------------------------------------------------------------------
    console.log('\n--- 24. Testing API Consistency ---');
    const health = await request('GET', '/api/health');
    record('API', health.status === 200 && health.data?.status === 'OK', 'GET /api/health responds 200 with status OK');
    const badRoute = await request('GET', '/api/nonexistent-endpoint-xyz');
    record('API', badRoute.status === 404, 'Non-existent API endpoint returns 404 Not Found');

    // -------------------------------------------------------------------------
    // 25. FRONTEND AUDIT
    // -------------------------------------------------------------------------
    console.log('\n--- 25. Testing Frontend Pages ---');
    const indexRes = await request('GET', '/index.html');
    record('Frontend', indexRes.status === 200, '/index.html is accessible (200 OK)');
    const loginRes = await request('GET', '/login.html');
    record('Frontend', loginRes.status === 200, '/login.html is accessible (200 OK)');
    const studentDashRes = await request('GET', '/pages/student/dashboard.html');
    record('Frontend', studentDashRes.status === 200, '/pages/student/dashboard.html is accessible (200 OK)');
    const teacherDashRes = await request('GET', '/pages/teacher/dashboard.html');
    record('Frontend', teacherDashRes.status === 200, '/pages/teacher/dashboard.html is accessible (200 OK)');
    const adminDashRes = await request('GET', '/pages/admin/dashboard.html');
    record('Frontend', adminDashRes.status === 200, '/pages/admin/dashboard.html is accessible (200 OK)');

    // -------------------------------------------------------------------------
    // 26. BACKEND RUNTIME
    // -------------------------------------------------------------------------
    console.log('\n--- 26. Testing Backend Runtime ---');
    const dbTest = await request('GET', '/api/db-test');
    record('Backend Runtime', dbTest.status === 200 && dbTest.data?.status === 'OK', 'GET /api/db-test confirms database connectivity');

    console.log('\n========================================================================');
    console.log(`AUDIT SUMMARY: ${passedAssertions}/${totalAssertions} Passed (${failedAssertions} Failed)`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('Audit execution error:', err);
  } finally {
    await pool.end();
  }
}

runComprehensiveAudit();
