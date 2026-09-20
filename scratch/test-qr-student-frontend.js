/**
 * Focused Step 6 Verification Suite:
 * STUDENT FRONTEND QR SCANNER UI & INTEGRATION
 * 
 * Verifies:
 * 1. Static DOM & Asset Integrity in student attendance.html
 * 2. Security & Controller Logic in student-attendance.js
 * 3. Active Session Endpoint & Role-Based Access Control
 * 4. Live Active Session Discovery (Enrolled vs Unenrolled)
 * 5. Full QR Scan & Attendance Confirmation
 * 6. Duplicate, Expired, Closed, and Invalid QR Rejection
 * 7. Teacher/Admin Access Scoping & Manual Attendance Preservation
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = require('../src/app');
const pool = require('../src/config/db');
const jwt = require('jsonwebtoken');

let server;
let baseUrl;
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failCount++;
  }
}

function request(method, routePath, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(routePath, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log(' STEP 6: STUDENT FRONTEND QR SCANNER & INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  // Start temporary server
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`Test server running at ${baseUrl}\n`);
      resolve();
    });
  });

  const createdSessionIds = [];
  const createdSessionUuids = [];
  const createdAttendanceIds = [];

  try {
    // -------------------------------------------------------------------------
    // 1. Static DOM & Asset Integrity Checks
    // -------------------------------------------------------------------------
    console.log('--- 1. Static DOM & Asset Integrity Checks ---');
    const htmlPath = path.join(__dirname, '..', 'public', 'pages', 'student', 'attendance.html');
    assert(fs.existsSync(htmlPath), 'student attendance.html file exists');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Vendor library inclusion
    const jsqrScriptMatch = html.match(/<script\s+src="\/js\/libs\/jsqr\.min\.js"><\/script>/);
    assert(!!jsqrScriptMatch, 'attendance.html includes jsqr.min.js script tag');

    const jsqrIndex = html.indexOf('/js/libs/jsqr.min.js');
    const studentJsIndex = html.indexOf('/js/student-attendance.js');
    assert(jsqrIndex !== -1 && studentJsIndex !== -1 && jsqrIndex < studentJsIndex, 'jsqr.min.js is included BEFORE student-attendance.js');

    const jsqrFilePath = path.join(__dirname, '..', 'public', 'js', 'libs', 'jsqr.min.js');
    assert(fs.existsSync(jsqrFilePath), 'jsqr.min.js asset exists on disk');
    const jsqrStat = fs.statSync(jsqrFilePath);
    assert(jsqrStat.size > 50000, `jsqr.min.js is intact (${Math.round(jsqrStat.size / 1024)} KB)`);

    // Student QR section elements
    assert(html.includes('id="studentQrAttendanceSection"'), 'Section #studentQrAttendanceSection exists in HTML');
    assert(html.includes('Mark Attendance'), 'Section contains "Mark Attendance" title');
    assert(html.includes('id="studentQrSessionBadge"'), 'Element #studentQrSessionBadge exists');
    assert(html.includes('id="studentQrBody"'), 'Container #studentQrBody exists');
    assert(html.includes('id="btnRefreshActiveQRSession"'), 'Button #btnRefreshActiveQRSession exists');

    // Camera scanner modal elements
    assert(html.includes('id="qrScannerModal"'), 'Modal #qrScannerModal exists in HTML');
    assert(html.includes('class="qr-modal-backdrop hidden"'), 'Modal starts with classes "qr-modal-backdrop hidden"');
    assert(html.includes('id="qrViewfinderWrapper"'), 'Container #qrViewfinderWrapper exists');
    assert(html.includes('id="qrScannerVideo"'), 'Video #qrScannerVideo exists');
    assert(html.includes('id="qrScannerCanvas"'), 'Canvas #qrScannerCanvas exists');
    assert(html.includes('id="qrReticleOverlay"'), 'Reticle #qrReticleOverlay exists');
    assert(html.includes('id="scannerLaser"'), 'Animated scanning laser #scannerLaser exists');
    assert(html.includes('id="qrScannerFeedback"'), 'Feedback container #qrScannerFeedback exists');
    assert(html.includes('id="qrScannerErrorAlert"'), 'Error container #qrScannerErrorAlert exists');
    assert(html.includes('id="btnCloseQrScanner"'), 'Close button #btnCloseQrScanner exists');
    assert(html.includes('id="btnCloseQrScannerX"'), 'Close button #btnCloseQrScannerX exists');

    // -------------------------------------------------------------------------
    // 2. Security & Controller Logic Checks
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Security & Controller Logic Checks ---');
    const jsPath = path.join(__dirname, '..', 'public', 'js', 'student-attendance.js');
    assert(fs.existsSync(jsPath), 'student-attendance.js exists');
    const js = fs.readFileSync(jsPath, 'utf8');

    // Security constraints
    assert(!html.includes('qr_secret'), 'Security: attendance.html never references or exposes qr_secret');
    assert(!js.includes('qr_secret'), 'Security: student-attendance.js never references, logs, or handles qr_secret');
    assert(!js.includes('createHmac'), 'Security: student-attendance.js never performs client-side HMAC generation');

    // Verify student identity constraint: student_id is never sent in body
    assert(!js.includes('student_id:'), 'Security: student-attendance.js never sends student_id in scan request body');

    // Controller functions
    assert(js.includes('function loadStudentActiveQRSession'), 'student-attendance.js defines loadStudentActiveQRSession');
    assert(js.includes('function renderActiveSessionState'), 'student-attendance.js defines renderActiveSessionState');
    assert(js.includes('function renderNoActiveSessionState'), 'student-attendance.js defines renderNoActiveSessionState');
    assert(js.includes('function openQrScannerModal'), 'student-attendance.js defines openQrScannerModal');
    assert(js.includes('function closeQrScannerModal'), 'student-attendance.js defines closeQrScannerModal');
    assert(js.includes('function scanVideoFrame'), 'student-attendance.js defines scanVideoFrame');
    assert(js.includes('function handleDetectedQRToken'), 'student-attendance.js defines handleDetectedQRToken');
    assert(js.includes('formatSecondsToMMSS'), 'student-attendance.js defines formatSecondsToMMSS helper');
    assert(js.includes('beforeunload'), 'Lifecycle: beforeunload event stops camera stream');
    assert(js.includes('pagehide'), 'Lifecycle: pagehide event stops camera stream');
    assert(js.includes('track.stop()'), 'Camera tracks are explicitly stopped via track.stop()');

    // -------------------------------------------------------------------------
    // 3. Setup Test User Accounts & Tokens
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Setup Test Users & Tokens ---');
    const { generateToken } = require('../src/utils/token');

    // Teacher 1: Rohini (user_id = 175, teacher_id = 90, course_id = 146)
    const teacher1 = { teacher_id: 90, user_id: 175, username: 'Rohini' };
    const [c1Rows] = await pool.query(`SELECT course_id, course_code, course_name FROM courses WHERE course_id = 146`);
    const course1 = c1Rows[0];
    // Enrolled Student 1: Karan (user_id = 174, student_id = 96, enrolled in course 146)
    const enrolledStudent = { student_id: 96, user_id: 174, username: 'Karan', first_name: 'Karan' };
    // Unenrolled Student: Suraj (user_id = 180, student_id = 98, NOT enrolled in course 146)
    const unenrolledStudent = { student_id: 98, user_id: 180, username: 'Suraj' };
    // Admin: admin (user_id = 1)
    const adminUser = { user_id: 1, username: 'admin' };

    const teacherToken = generateToken({ user_id: teacher1.user_id, username: teacher1.username, role: 'TEACHER' });
    const enrolledStudentToken = generateToken({ user_id: enrolledStudent.user_id, username: enrolledStudent.username, role: 'STUDENT' });
    const unenrolledStudentToken = generateToken({ user_id: unenrolledStudent.user_id, username: unenrolledStudent.username, role: 'STUDENT' });
    const adminToken = generateToken({ user_id: adminUser.user_id, username: adminUser.username, role: 'ADMIN' });

    assert(!!teacherToken, `Teacher 1 authenticated (teacher_id: ${teacher1.teacher_id}, course: ${course1.course_code})`);
    assert(!!enrolledStudentToken, `Enrolled student authenticated (student_id: ${enrolledStudent.student_id}, name: ${enrolledStudent.first_name})`);
    assert(!!unenrolledStudentToken, `Unenrolled student authenticated (student_id: ${unenrolledStudent.student_id})`);

    // Clean up any stale active sessions for this teacher
    await pool.query(`UPDATE attendance_sessions SET is_active = 0 WHERE teacher_id = ?`, [teacher1.teacher_id]);
    // Clean up test attendance for today if any exists
    await pool.query(`DELETE FROM attendance WHERE student_id = ? AND course_id = 146 AND attendance_date = CURDATE()`, [enrolledStudent.student_id]);

    // -------------------------------------------------------------------------
    // 4. Student Active Session Endpoint & RBAC Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Active Session Endpoint & RBAC Verification ---');
    const unauthActive = await request('GET', '/api/attendance/qr/active-session');
    assert(unauthActive.status === 401, 'GET /api/attendance/qr/active-session without token returns 401 Unauthorized');

    const teacherActiveAttempt = await request('GET', '/api/attendance/qr/active-session', null, teacherToken);
    assert(teacherActiveAttempt.status === 403, 'TEACHER calling GET /api/attendance/qr/active-session returns 403 Forbidden');

    const adminActiveAttempt = await request('GET', '/api/attendance/qr/active-session', null, adminToken);
    assert(adminActiveAttempt.status === 403, 'ADMIN calling GET /api/attendance/qr/active-session returns 403 Forbidden');

    const studentColdActive = await request('GET', '/api/attendance/qr/active-session', null, enrolledStudentToken);
    assert(studentColdActive.status === 200, 'STUDENT calling GET /api/attendance/qr/active-session returns 200 OK');
    assert(studentColdActive.body && studentColdActive.body.data && studentColdActive.body.data.active === false, 'When no session is active, returns active: false');
    assert(studentColdActive.body.data.session === null, 'When no session is active, session is null ("No active attendance session")');

    // Alias endpoint /qr/student/active
    const aliasColdActive = await request('GET', '/api/attendance/qr/student/active', null, enrolledStudentToken);
    assert(aliasColdActive.status === 200, 'Alias GET /api/attendance/qr/student/active returns 200 OK');
    assert(aliasColdActive.body.data.active === false, 'Alias returns active: false');

    // Existing teacher endpoint check: student must still be rejected from teacher's /qr/active
    const studentCallingTeacherActive = await request('GET', '/api/attendance/qr/active', null, enrolledStudentToken);
    assert(studentCallingTeacherActive.status === 403, 'Security: STUDENT calling teacher endpoint GET /api/attendance/qr/active returns 403 Forbidden');

    // -------------------------------------------------------------------------
    // 5. Live Active Session Discovery (Enrolled vs Unenrolled Student)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Live Active Session Discovery ---');
    const todayStr = new Date().toISOString().slice(0, 10);
    const startRes = await request('POST', '/api/attendance/qr/start', {
      course_id: course1.course_id,
      session_date: todayStr,
      start_time: '10:00:00',
      end_time: '11:00:00',
      room_no: 'Room 402',
      lecture_type: 'Regular Lecture',
      duration_minutes: 5
    }, teacherToken);

    assert(startRes.status === 201, 'Teacher 1 started active QR attendance session (Status 201)');
    const createdSessionId = startRes.body.data.session_id;
    createdSessionIds.push(createdSessionId);
    createdSessionUuids.push(startRes.body.data.session_uuid);

    // Enrolled student queries active session
    const enrolledSessionRes = await request('GET', '/api/attendance/qr/active-session', null, enrolledStudentToken);
    assert(enrolledSessionRes.status === 200, 'Enrolled student queries active session (Status 200)');
    assert(enrolledSessionRes.body.data.active === true, 'Enrolled student sees active: true');

    const sData = enrolledSessionRes.body.data.session;
    assert(sData.course_id === course1.course_id, `Active session course_id matches (${sData.course_id})`);
    assert(sData.course_code === course1.course_code, `Active session course_code matches (${sData.course_code})`);
    assert(sData.teacher_name && sData.teacher_name.length > 0, `Active session includes teacher_name (${sData.teacher_name})`);
    assert(sData.session_date === todayStr, `Active session lecture date matches (${sData.session_date})`);
    assert(sData.start_time.startsWith('10:00'), `Active session start time matches (${sData.start_time})`);
    assert(sData.end_time.startsWith('11:00'), `Active session end time matches (${sData.end_time})`);
    assert(sData.room_no === 'Room 402', `Active session room number matches (${sData.room_no})`);
    assert(sData.remaining_seconds > 0, `Active session remaining_seconds is positive (${sData.remaining_seconds}s)`);
    assert(sData.already_marked === false, 'Session indicates attendance not yet marked (already_marked: false)');
    assert(!sData.qr_secret, 'Security: qr_secret is NOT exposed to student');

    // Unenrolled student queries active session
    const unenrolledSessionRes = await request('GET', '/api/attendance/qr/active-session', null, unenrolledStudentToken);
    assert(unenrolledSessionRes.status === 200, 'Unenrolled student queries active session (Status 200)');
    assert(unenrolledSessionRes.body.data.active === false, 'Unenrolled student sees active: false ("No active attendance session")');
    assert(unenrolledSessionRes.body.data.session === null, 'Unenrolled student session is null');

    // -------------------------------------------------------------------------
    // 6. QR Token Generation & Scanning Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 6. QR Token Extraction & Attendance Submission ---');
    const tokenRes = await request('GET', `/api/attendance/qr/token/${createdSessionId}`, null, teacherToken);
    assert(tokenRes.status === 200, 'Teacher generated live signed QR token (Status 200)');
    const liveToken = tokenRes.body.data.token;
    assert(typeof liveToken === 'string' && liveToken.length > 20, 'Live token is valid signed string');

    // 6A. Spoofing test: student attempts to send student_id in body
    const spoofAttempt = await request('POST', '/api/attendance/qr/scan', {
      token: liveToken,
      student_id: 99999 // Malicious spoof attempt
    }, enrolledStudentToken);

    assert(spoofAttempt.status === 201, 'Enrolled student scan succeeds (Status 201)');
    const attResult = spoofAttempt.body.data;
    createdAttendanceIds.push(attResult.attendance_id);

    // Verify student_id was resolved strictly from authenticated token, NOT spoofed 99999
    assert(attResult.student_id === enrolledStudent.student_id, `Security: Attendance recorded strictly for authenticated student (${attResult.student_id}), ignoring spoofed body ID`);
    assert(attResult.status === 'Present', 'Attendance status is Present');
    assert(attResult.remarks === 'Marked via Dynamic QR', 'Remarks set to "Marked via Dynamic QR"');

    // Verify in database
    const [attRows] = await pool.query(`SELECT * FROM attendance WHERE attendance_id = ?`, [attResult.attendance_id]);
    assert(attRows.length === 1, 'Attendance record verified in attendance table');
    assert(attRows[0].student_id === enrolledStudent.student_id, 'Database record student_id matches authenticated student');
    assert(attRows[0].status === 'Present', 'Database record status is Present');

    // 6B. State transition: Re-query active session now returns already_marked: true
    const activeAfterScan = await request('GET', '/api/attendance/qr/active-session', null, enrolledStudentToken);
    assert(activeAfterScan.status === 200, 'Student re-checks active session after marking attendance');
    assert(activeAfterScan.body.data.active === true, 'Session remains active');
    assert(activeAfterScan.body.data.session.already_marked === true, 'Session now indicates already_marked: true ("Attendance Marked Successfully: PRESENT")');
    assert(activeAfterScan.body.data.session.marked_status === 'Present', 'Status confirmed as Present');

    // -------------------------------------------------------------------------
    // 7. Error Handling & Edge Cases
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Error Handling & Edge Cases ---');

    // 7A. Duplicate attendance scan
    const dupScan = await request('POST', '/api/attendance/qr/scan', { token: liveToken }, enrolledStudentToken);
    assert(dupScan.status === 409, 'Duplicate scan by same student returns 409 Conflict ("Attendance already marked")');

    // 7B. Malformed QR token
    const malformedScan = await request('POST', '/api/attendance/qr/scan', { token: 'bad_token_format' }, enrolledStudentToken);
    assert(malformedScan.status === 400, 'Malformed QR token returns 400 Bad Request ("Invalid QR code")');

    // 7C. Forged signature QR token
    const fakeToken = Buffer.from(JSON.stringify({
      sid: startRes.body.data.session_uuid,
      ts: Date.now(),
      nonce: '1234567812345678',
      sig: '0000000000000000000000000000000000000000000000000000000000000000'
    })).toString('base64url');
    const forgedScan = await request('POST', '/api/attendance/qr/scan', { token: fakeToken }, enrolledStudentToken);
    assert(forgedScan.status === 400, 'Forged signature returns 400 Bad Request ("Invalid QR code signature")');

    // 7D. Expired token (past drift window)
    const oldTimestamp = Date.now() - 120000; // 2 minutes old
    const expiredDriftToken = Buffer.from(JSON.stringify({
      sid: startRes.body.data.session_uuid,
      ts: oldTimestamp,
      nonce: '1234567812345678',
      sig: 'abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    })).toString('base64url');
    const driftScan = await request('POST', '/api/attendance/qr/scan', { token: expiredDriftToken }, enrolledStudentToken);
    assert(driftScan.status === 410, 'Expired token drift returns 410 Gone ("QR code has expired")');

    // 7E. Unenrolled student scan attempt
    // Start session 2 for another course/date to test unenrolled student
    // 7E. Unenrolled student scan attempt
    // Suraj (student_id = 98) is NOT enrolled in course 146
    const unenrolledScan = await request('POST', '/api/attendance/qr/scan', { token: liveToken }, unenrolledStudentToken);
    assert(unenrolledScan.status === 403, 'Unenrolled student scan returns 403 Forbidden ("Not enrolled in course")');

    // 7F. Closed session scan attempt
    // Teacher closes session
    const closeRes = await request('POST', `/api/attendance/qr/close/${createdSessionId}`, null, teacherToken);
    assert(closeRes.status === 200, 'Teacher successfully closes attendance session');

    const closedScan = await request('POST', '/api/attendance/qr/scan', { token: liveToken }, enrolledStudentToken);
    assert(closedScan.status === 410, 'Scanning token for closed session returns 410 Gone ("Attendance session closed")');

    // -------------------------------------------------------------------------
    // 8. Manual Attendance & Overview Regression Checks
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Manual Attendance & Overview Regression ---');
    const myAttRes = await request('GET', '/api/attendance/my-attendance', null, enrolledStudentToken);
    assert(myAttRes.status === 200, 'GET /api/attendance/my-attendance works for student (Status 200)');
    assert(myAttRes.body && myAttRes.body.data, 'Student attendance data structure intact');

    const meAttRes = await request('GET', '/api/attendance/student/me', null, enrolledStudentToken);
    assert(meAttRes.status === 200, 'GET /api/attendance/student/me works for student (Status 200)');

    const coursesRes = await request('GET', '/api/attendance/courses', null, teacherToken);
    assert(coursesRes.status === 200, 'GET /api/attendance/courses works for teacher (Status 200)');

    const sessionsRes = await request('GET', '/api/attendance/sessions', null, teacherToken);
    assert(sessionsRes.status === 200, 'GET /api/attendance/sessions works for teacher (Status 200)');

  } catch (err) {
    console.error('Unexpected test error:', err);
    failCount++;
  } finally {
    // Cleanup created attendance records
    if (createdAttendanceIds.length > 0) {
      await pool.query(`DELETE FROM attendance WHERE attendance_id IN (?)`, [createdAttendanceIds]);
      const attStrs = createdAttendanceIds.map(String);
      await pool.query(`DELETE FROM audit_logs WHERE action = 'ATTENDANCE_MARKED_QR' AND entity_id IN (?)`, [attStrs]);
    }
    // Cleanup created session records
    if (createdSessionIds.length > 0) {
      await pool.query(`DELETE FROM attendance_sessions WHERE session_id IN (?)`, [createdSessionIds]);
    }
    if (createdSessionUuids.length > 0) {
      await pool.query(`DELETE FROM audit_logs WHERE action IN ('QR_SESSION_STARTED', 'QR_SESSION_ENDED') AND entity_id IN (?)`, [createdSessionUuids]);
    }

    console.log('\n[OK] Cleaned up temporary test rows');
    server.close();
  }

  console.log('\n================================================================');
  console.log(` RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

run();
