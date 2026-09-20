/**
 * Test Suite: Teacher Student QR Visibility Control & "Scan from Image"
 * 
 * Verifies:
 * 1. Static DOM & Asset Integrity (teacher toggle, student image scanner, qrcode.min.js)
 * 2. Teacher Toggle Endpoint Authentication & IDOR Authorization
 * 3. Default Visibility is OFF on New Session Creation
 * 4. Toggle ON / OFF State Transitions & Database Persistence
 * 5. Active Session Endpoint Visibility Behavior (Student View: ON vs OFF)
 * 6. "Scan from Image" Workflow & Token Submission to POST /api/attendance/qr/scan
 * 7. Token Tamper, Duplicate, Expired & Non-Enrolled Rejections
 * 8. Teacher OFF Behavior (Session Remains Active, Teacher QR Continues Working)
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const pool = require('../src/config/db');
const { generateToken } = require('../src/utils/token');

async function runVisibilityAndImageScanTests() {
  console.log('================================================================');
  console.log('TEST SUITE: TEACHER QR VISIBILITY TOGGLE & "SCAN FROM IMAGE"');
  console.log('================================================================\n');

  let passes = 0;
  let failures = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passes++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failures++;
    }
  }

  // 1. Start test HTTP server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test server running at ${baseUrl}\n`);

  async function request(method, routePath, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${routePath}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  const testDate = '2026-09-21';
  let createdSessionId = null;
  let createdSessionUuid = null;
  let createdAttendanceId = null;
  let createdAttendanceId2 = null;

  try {
    // -------------------------------------------------------------------------
    // 1. Static UI & DOM Checks
    // -------------------------------------------------------------------------
    console.log('--- 1. Static DOM & Asset Verification ---');
    const teacherHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'pages', 'teacher', 'attendance.html'), 'utf8');
    const studentHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'pages', 'student', 'attendance.html'), 'utf8');
    const teacherJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'teacher-attendance.js'), 'utf8');
    const studentJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'student-attendance.js'), 'utf8');

    // Teacher DOM & JS
    assert(teacherHtml.includes('id="qrStudentVisibilityBox"'), 'Teacher HTML includes #qrStudentVisibilityBox');
    assert(teacherHtml.includes('id="btnToggleStudentVisibility"'), 'Teacher HTML includes #btnToggleStudentVisibility');
    assert(teacherHtml.includes('id="qrStudentVisibilityLabel"'), 'Teacher HTML includes #qrStudentVisibilityLabel');
    assert(teacherHtml.includes('Show QR to Students:'), 'Teacher HTML contains label "Show QR to Students:"');
    assert(teacherHtml.includes('Hidden from Students'), 'Teacher HTML starts with default "Hidden from Students"');
    assert(teacherJs.includes('handleToggleStudentQRVisibility'), 'Teacher JS implements handleToggleStudentQRVisibility');
    assert(teacherJs.includes('updateStudentVisibilityUI'), 'Teacher JS implements updateStudentVisibilityUI');
    assert(teacherJs.includes('/attendance/qr/visibility/'), 'Teacher JS calls /attendance/qr/visibility/ endpoint');

    // Student DOM & JS
    assert(studentHtml.includes('id="qrImageFileInput"'), 'Student HTML includes hidden #qrImageFileInput');
    assert(studentHtml.includes('/js/libs/qrcode.min.js'), 'Student HTML imports /js/libs/qrcode.min.js');
    assert(studentHtml.includes('btn-scan-image'), 'Student HTML includes .btn-scan-image styling');
    assert(studentJs.includes('handleImageFileSelected'), 'Student JS implements handleImageFileSelected');
    assert(studentJs.includes('Scan with Camera'), 'Student JS renders "Scan with Camera" button');
    assert(studentJs.includes('Scan from Image'), 'Student JS renders "Scan from Image" button');
    assert(studentJs.includes('QR available'), 'Student JS renders "QR available" status badge');
    assert(studentJs.includes('QR not available'), 'Student JS renders "QR not available" status badge');
    assert(studentJs.includes('btn-scan-disabled'), 'Student JS applies disabled styles when session is expired');
    assert(!studentJs.includes('${!isQrVisible ? \'btn-scan-disabled\' : \'\'}'), 'Student JS does NOT disable scan buttons when student_qr_visible is false');
    assert(studentJs.includes('window.jsQR'), 'Student JS utilizes local window.jsQR for image decoding');
    assert(studentJs.includes('finally {\n      isProcessingScanSubmission = false;\n    }') || (studentJs.includes('finally {') && studentJs.includes('isProcessingScanSubmission = false')), 'Student JS always resets isProcessingScanSubmission in finally block');
    assert(studentJs.includes("currentAuthToken = localStorage.getItem('token')") || studentJs.includes("localStorage.getItem('token') || sessionStorage.getItem('token')"), 'Student JS retrieves fresh authentication token for scan request');

    // -------------------------------------------------------------------------
    // 2. Setup Test User Tokens
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Setup Test User Personas ---');
    // Teacher 1: Rohini (user_id = 175, teacher_id = 90, timetable_id = 98, course_id = 146)
    const teacher1Token = generateToken({ user_id: 175, username: 'Rohini', role: 'TEACHER' });
    // Teacher 2: Vikas (user_id = 176, teacher_id = 91)
    const teacher2Token = generateToken({ user_id: 176, username: 'Vikas', role: 'TEACHER' });
    // Enrolled Student 1: Karan (user_id = 174, student_id = 96, enrolled in course 146)
    const studentToken = generateToken({ user_id: 174, username: 'Karan', role: 'STUDENT' });
    // Enrolled Student 2: Saksham (user_id = 178, student_id = 97, enrolled in course 146)
    const student2Token = generateToken({ user_id: 178, username: 'Saksham', role: 'STUDENT' });
    // Unenrolled Student: Suraj (user_id = 180, student_id = 98)
    const unenrolledToken = generateToken({ user_id: 180, username: 'Suraj', role: 'STUDENT' });
    // Admin: admin (user_id = 1, role = 'ADMIN')
    const adminToken = generateToken({ user_id: 1, username: 'admin', role: 'ADMIN' });

    // Clean up test sessions
    await pool.query("DELETE FROM attendance WHERE course_id = 146 AND attendance_date = ?", [testDate]);
    await pool.query('DELETE FROM attendance_sessions WHERE teacher_id IN (90, 91)');

    // -------------------------------------------------------------------------
    // 3. Start Session & Verify Default Visibility = OFF
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Session Creation & Default Visibility = OFF ---');
    const startRes = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 98,
      duration: 5,
      session_date: testDate
    }, teacher1Token);

    assert(startRes.status === 201, 'Teacher 1 started active attendance session (Status 201)');
    const sess = startRes.data && startRes.data.data;
    createdSessionId = sess && sess.session_id;
    createdSessionUuid = sess && sess.session_uuid;

    // Check database default
    const [dbRows] = await pool.query('SELECT student_qr_visible, is_active FROM attendance_sessions WHERE session_id = ?', [createdSessionId]);
    assert(dbRows.length === 1, 'Session found in attendance_sessions table');
    assert(dbRows[0].student_qr_visible === 0, 'Database student_qr_visible defaults to 0 (OFF) for safety');
    assert(dbRows[0].is_active === 1, 'Session is_active is 1');

    // Check teacher active session endpoint returns student_qr_visible
    const teacherActiveRes = await request('GET', '/api/attendance/qr/active', null, teacher1Token);
    assert(teacherActiveRes.status === 200, 'Teacher GET /qr/active returns 200');
    assert(teacherActiveRes.data.data.session.student_qr_visible === 0, 'Teacher active session reports student_qr_visible = 0');

    // -------------------------------------------------------------------------
    // 4. Student View & Scanning When Visibility is OFF
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Student Active Session View & Scanning When Visibility is OFF ---');
    const studentOffRes = await request('GET', '/api/attendance/qr/active-session', null, studentToken);
    assert(studentOffRes.status === 200, 'Student GET /qr/active-session returns 200');
    assert(studentOffRes.data.data.active === true, 'Student sees active: true');
    assert(studentOffRes.data.data.session.student_qr_visible === false, 'Student receives student_qr_visible: false');
    assert(studentOffRes.data.data.session.qr_token === null, 'Student receives qr_token: null (QR token is hidden on student portal)');
    assert(studentOffRes.data.data.session.qr_secret === undefined, 'Security: qr_secret is NEVER exposed to student');

    // 4.1 Teacher obtains the active projected QR token
    const teacherTokenRes = await request('GET', `/api/attendance/qr/token/${createdSessionId}`, null, teacher1Token);
    assert(teacherTokenRes.status === 200, 'Teacher obtains active projected QR token');
    const teacherProjectedToken = teacherTokenRes.data.data.token;

    // 4.2 Student 1 (Karan) scans teacher's screen QR (or screenshot via Scan from Image) while visibility is OFF
    const scanOffRes = await request('POST', '/api/attendance/qr/scan', {
      token: teacherProjectedToken
    }, studentToken);
    assert(scanOffRes.status === 201, 'Student successfully marked attendance by scanning teacher QR while visibility is OFF (Status 201)');
    const attData1 = scanOffRes.data && scanOffRes.data.data;
    createdAttendanceId = attData1 && attData1.attendance_id;
    assert(attData1 && attData1.status === 'Present', 'Attendance status is Present');
    assert(attData1 && attData1.student_id === 96, 'Attendance student_id is 96 (resolved strictly from JWT)');

    // Verify in database
    const [attDb1] = await pool.query('SELECT * FROM attendance WHERE attendance_id = ?', [createdAttendanceId]);
    assert(attDb1.length === 1, 'Attendance record verified in attendance table');
    assert(attDb1[0].status === 'Present', 'DB record status is Present');
    assert(attDb1[0].student_id === 96, 'DB record student_id is 96');

    // 4.3 Duplicate scan by Karan rejected
    const dupScan1 = await request('POST', '/api/attendance/qr/scan', { token: teacherProjectedToken }, studentToken);
    assert(dupScan1.status === 409, 'Duplicate scan by Karan is rejected with 409 Conflict');

    // 4.4 Exact scenario: Saksham uses the SAME screenshot of the SAME teacher QR
    console.log('\n--- 4.4 Shared Screenshot Scenario: Saksham scans SAME Teacher QR Screenshot ---');
    const scanSakshamRes = await request('POST', '/api/attendance/qr/scan', {
      token: teacherProjectedToken
    }, student2Token);
    assert(scanSakshamRes.status === 201, 'Saksham successfully marked attendance using SAME screenshot token (Status 201)');
    const attData2 = scanSakshamRes.data && scanSakshamRes.data.data;
    createdAttendanceId2 = attData2 && attData2.attendance_id;
    assert(attData2 && attData2.status === 'Present', 'Saksham attendance status is Present');
    assert(attData2 && attData2.student_id === 97, 'Saksham attendance student_id is 97 (resolved strictly from JWT)');

    // Verify in database for Saksham
    const [attDb2] = await pool.query('SELECT * FROM attendance WHERE attendance_id = ?', [createdAttendanceId2]);
    assert(attDb2.length === 1, 'Saksham attendance record verified in attendance table');
    assert(attDb2[0].status === 'Present', 'DB record status is Present for Saksham');
    assert(attDb2[0].student_id === 97, 'DB record student_id is 97 for Saksham');

    // 4.5 Saksham scans same screenshot again -> rejected with 409 Conflict
    const dupScanSaksham = await request('POST', '/api/attendance/qr/scan', { token: teacherProjectedToken }, student2Token);
    assert(dupScanSaksham.status === 409, 'Duplicate scan by Saksham is rejected with 409 Conflict');

    // 4.6 Karan scans again -> still 409 Conflict
    const dupScanKaran2 = await request('POST', '/api/attendance/qr/scan', { token: teacherProjectedToken }, studentToken);
    assert(dupScanKaran2.status === 409, 'Subsequent scan by Karan is rejected with 409 Conflict');

    // 4.7 Unenrolled student scans the same teacher screenshot -> 403 Forbidden
    const unenrolledScan = await request('POST', '/api/attendance/qr/scan', { token: teacherProjectedToken }, unenrolledToken);
    assert(unenrolledScan.status === 403, 'Unenrolled student scanning teacher QR is rejected with 403 Forbidden');

    // -------------------------------------------------------------------------
    // 5. Visibility Toggle Authorization & Security
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Visibility Toggle Endpoint Authorization & Security ---');

    // 5.1 Unauthenticated
    const unauthToggle = await request('POST', `/api/attendance/qr/visibility/${createdSessionId}`, { visible: true });
    assert(unauthToggle.status === 401, 'Unauthenticated toggle returns 401 Unauthorized');

    // 5.2 Student cannot toggle
    const studentToggle = await request('POST', `/api/attendance/qr/visibility/${createdSessionId}`, { visible: true }, studentToken);
    assert(studentToggle.status === 403, 'Student toggle returns 403 Forbidden');

    // 5.3 Admin cannot toggle
    const adminToggle = await request('POST', `/api/attendance/qr/visibility/${createdSessionId}`, { visible: true }, adminToken);
    assert(adminToggle.status === 403, 'Admin toggle returns 403 Forbidden');

    // 5.4 Non-owner teacher cannot toggle (IDOR check)
    const teacher2Toggle = await request('POST', `/api/attendance/qr/visibility/${createdSessionId}`, { visible: true }, teacher2Token);
    assert(teacher2Toggle.status === 403, 'Non-owner teacher toggle returns 403 Forbidden (IDOR protected)');

    // 5.5 Owner Teacher toggles visibility to ON
    const teacher1ToggleON = await request('POST', `/api/attendance/qr/visibility/${createdSessionId}`, { visible: true }, teacher1Token);
    assert(teacher1ToggleON.status === 200, 'Owner teacher sets visibility to ON (Status 200)');
    assert(teacher1ToggleON.data.data.student_qr_visible === 1, 'Response confirms student_qr_visible: 1');
    assert(teacher1ToggleON.data.data.is_visible === true, 'Response confirms is_visible: true');

    // Verify in database
    const [dbRowsAfterOn] = await pool.query('SELECT student_qr_visible, is_active FROM attendance_sessions WHERE session_id = ?', [createdSessionId]);
    assert(dbRowsAfterOn[0].student_qr_visible === 1, 'Database student_qr_visible is now 1');
    assert(dbRowsAfterOn[0].is_active === 1, 'Session remains active (toggle does NOT close or expire session)');

    // -------------------------------------------------------------------------
    // 6. Student View When Visibility is ON & QR Code Provided
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Student Active Session View When Visibility is ON ---');
    const studentOnRes = await request('GET', '/api/attendance/qr/active-session', null, student2Token);
    assert(studentOnRes.status === 200, 'Student 2 GET /qr/active-session returns 200');
    assert(studentOnRes.data.data.active === true, 'Student sees active: true');
    assert(studentOnRes.data.data.session.student_qr_visible === true, 'Student receives student_qr_visible: true');
    const studentQRToken = studentOnRes.data.data.session.qr_token;
    assert(typeof studentQRToken === 'string' && studentQRToken.length > 20, 'Student receives live dynamic qr_token string');
    assert(studentOnRes.data.data.session.qr_token_payload && studentOnRes.data.data.session.qr_token_payload.sid === createdSessionUuid, 'Token payload sid matches session_uuid');
    assert(studentOnRes.data.data.session.qr_secret === undefined, 'Security: qr_secret is NEVER exposed to student');

    // -------------------------------------------------------------------------
    // 7. Dynamic Token Security & Rejection Assertions
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Dynamic Token Security & Rejection Assertions ---');

    // 7.1 Duplicate scan of live student token (since Saksham is already marked)
    const dupScan2 = await request('POST', '/api/attendance/qr/scan', { token: studentQRToken }, student2Token);
    assert(dupScan2.status === 409, 'Scanning live student token when already marked is rejected with 409 Conflict');


    // 7.2 Expired token rejected
    const expiredPayload = {
      sid: createdSessionUuid,
      ts: Date.now() - 90 * 1000,
      nonce: '1122334455667788',
      sig: 'fake_sig'
    };
    const expiredScan = await request('POST', '/api/attendance/qr/scan', expiredPayload, studentToken);
    assert(expiredScan.status === 410, 'Expired token is rejected with 410 Gone');

    // 7.3 Tampered signature rejected
    const tamperedPayload = {
      sid: createdSessionUuid,
      ts: Date.now(),
      nonce: '1122334455667788',
      sig: 'a'.repeat(64)
    };
    const tamperedScan = await request('POST', '/api/attendance/qr/scan', tamperedPayload, studentToken);
    assert(tamperedScan.status === 400, 'Tampered token is rejected with 400 Bad Request');

    // -------------------------------------------------------------------------
    // 8. Teacher Toggles Visibility to OFF Again
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Teacher Switches Visibility to OFF (Student Hide Behavior) ---');
    const toggleOffRes = await request('POST', `/api/attendance/qr/visibility/${createdSessionId}`, { visible: false }, teacher1Token);
    assert(toggleOffRes.status === 200, 'Teacher toggled visibility back to OFF (Status 200)');
    assert(toggleOffRes.data.data.student_qr_visible === 0, 'student_qr_visible is 0');
    assert(toggleOffRes.data.data.is_visible === false, 'is_visible is false');

    // Check student view again
    const studentOffAgain = await request('GET', '/api/attendance/qr/active-session', null, studentToken);
    assert(studentOffAgain.status === 200, 'Student active session query returns 200');
    assert(studentOffAgain.data.data.session.student_qr_visible === false, 'Student receives student_qr_visible: false');
    assert(studentOffAgain.data.data.session.qr_token === null, 'Student receives qr_token: null (QR disappeared)');

    // Teacher's own QR continues working normally
    const teacherOwnTokenRes = await request('GET', `/api/attendance/qr/token/${createdSessionId}`, null, teacher1Token);
    assert(teacherOwnTokenRes.status === 200, 'Teacher token endpoint continues generating tokens normally when OFF (Status 200)');
    assert(!!teacherOwnTokenRes.data.data.token, 'Teacher receives valid signed token');

    // -------------------------------------------------------------------------
    // 9. Teacher Closes Session
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Teacher Closes Session & Subsequent Toggle Rejection ---');
    const closeRes = await request('POST', `/api/attendance/qr/close/${createdSessionId}`, null, teacher1Token);
    assert(closeRes.status === 200, 'Teacher closed session successfully (Status 200)');

    // Toggling a closed session is rejected with 410 Gone
    const closedToggle = await request('POST', `/api/attendance/qr/visibility/${createdSessionId}`, { visible: true }, teacher1Token);
    assert(closedToggle.status === 410, 'Attempting to toggle a closed session returns 410 Gone');

    // Clean up test data
    if (createdAttendanceId) {
      await pool.query('DELETE FROM attendance WHERE attendance_id = ?', [createdAttendanceId]);
    }
    if (createdAttendanceId2) {
      await pool.query('DELETE FROM attendance WHERE attendance_id = ?', [createdAttendanceId2]);
    }
    if (createdSessionId) {
      await pool.query('DELETE FROM attendance_sessions WHERE session_id = ?', [createdSessionId]);
    }

  } catch (err) {
    console.error('Test execution error:', err);
    failures++;
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passes} PASSED, ${failures} FAILED`);
  console.log('================================================================\n');

  if (failures > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runVisibilityAndImageScanTests();
