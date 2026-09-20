require('dotenv').config();
const http = require('http');
const app = require('../src/app');
const pool = require('../src/config/db');
const { generateToken } = require('../src/utils/token');

async function runStep4Tests() {
  console.log('================================================================');
  console.log('TESTING STEP 4: DYNAMIC QR TOKEN GENERATION & SECURE SCANNING');
  console.log('================================================================');

  let passes = 0;
  let failures = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passes++;
    } else {
      console.error(`[FAIL] ${message}`);
      failures++;
    }
  }

  // 1. Start test HTTP server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  async function request(method, path, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  const testDate = '2026-09-20';
  let createdSessionId = null;
  let createdSessionUuid = null;
  let createdAttendanceId = null;

  try {
    // 2. Setup Test User Tokens
    // Teacher 1: Rohini (user_id = 175, teacher_id = 90, timetable_id = 98, course_id = 146)
    const teacher1Token = generateToken({ user_id: 175, username: 'Rohini', role: 'TEACHER' });
    // Teacher 2: Vikas (user_id = 176, teacher_id = 91)
    const teacher2Token = generateToken({ user_id: 176, username: 'Vikas', role: 'TEACHER' });
    // Enrolled Student 1: Karan (user_id = 174, student_id = 96, enrolled in course 146)
    const karanToken = generateToken({ user_id: 174, username: 'Karan', role: 'STUDENT' });
    // Enrolled Student 2: Saksham (user_id = 178, student_id = 97, enrolled in course 146)
    const sakshamToken = generateToken({ user_id: 178, username: 'Saksham', role: 'STUDENT' });
    // Unenrolled Student: Suraj (user_id = 180, student_id = 98, NOT enrolled in course 146)
    const surajToken = generateToken({ user_id: 180, username: 'Suraj', role: 'STUDENT' });
    // Admin: admin (user_id = 1, role = 'ADMIN')
    const adminToken = generateToken({ user_id: 1, username: 'admin', role: 'ADMIN' });

    // Clean up any test attendance or sessions for this slot before starting
    await pool.query("DELETE FROM attendance WHERE course_id = 146 AND attendance_date = ? AND start_time = '00:02:00'", [testDate]);
    await pool.query('DELETE FROM attendance_sessions WHERE teacher_id = 90');

    // -------------------------------------------------------------------------
    // STEP 4.1: START AN ACTIVE SESSION
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Start Active Session for Testing ---');
    const startRes = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 98,
      duration: 5,
      session_date: testDate
    }, teacher1Token);

    assert(startRes.status === 201, 'Teacher 1 started attendance session (Status 201)');
    const sess = startRes.data && startRes.data.data;
    createdSessionId = sess && sess.session_id;
    createdSessionUuid = sess && sess.session_uuid;

    // -------------------------------------------------------------------------
    // STEP 4.2: TEACHER TOKEN ENDPOINT (GET /api/attendance/qr/token/:sessionId)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Teacher Token Generation & Authorization ---');

    // 2.1 Unauthenticated request rejected
    const unauthTok = await request('GET', `/api/attendance/qr/token/${createdSessionUuid}`);
    assert(unauthTok.status === 401, 'GET /qr/token/:sessionId without token returns 401 Unauthorized');

    // 2.2 Student cannot access teacher token endpoint
    const studentTok = await request('GET', `/api/attendance/qr/token/${createdSessionUuid}`, null, karanToken);
    assert(studentTok.status === 403, 'STUDENT calling GET /qr/token/:sessionId returns 403 Forbidden');

    // 2.3 Admin cannot access teacher token endpoint
    const adminTok = await request('GET', `/api/attendance/qr/token/${createdSessionUuid}`, null, adminToken);
    assert(adminTok.status === 403, 'ADMIN calling GET /qr/token/:sessionId returns 403 Forbidden');

    // 2.4 Another teacher (Teacher 2) cannot get token for Teacher 1's session (IDOR protection)
    const teacher2Tok = await request('GET', `/api/attendance/qr/token/${createdSessionUuid}`, null, teacher2Token);
    assert(teacher2Tok.status === 403, 'Teacher 2 calling GET /qr/token for Teacher 1 session returns 403 Forbidden');

    // 2.5 Teacher 1 successfully generates dynamic QR token
    const teacher1Tok = await request('GET', `/api/attendance/qr/token/${createdSessionUuid}`, null, teacher1Token);
    assert(teacher1Tok.status === 200, 'Teacher 1 successfully generated QR token (Status 200)');
    const tokenData = teacher1Tok.data && teacher1Tok.data.data;
    assert(!!tokenData && !!tokenData.token, 'Response contains dynamic Base64URL token string');
    assert(!!tokenData && !!tokenData.payload, 'Response contains token payload object');
    assert(tokenData && tokenData.payload.sid === createdSessionUuid, 'Token payload sid matches session_uuid');
    assert(tokenData && typeof tokenData.payload.ts === 'number', 'Token payload contains numeric timestamp ts');
    assert(tokenData && typeof tokenData.payload.nonce === 'string' && tokenData.payload.nonce.length === 16, 'Token payload contains 16-hex char nonce');
    assert(tokenData && typeof tokenData.payload.sig === 'string' && tokenData.payload.sig.length === 64, 'Token payload contains 64-hex char HMAC-SHA256 sig');
    assert(tokenData && tokenData.expires_in_seconds === 60, 'expires_in_seconds indicates 60-second rolling window');

    // 2.6 Verify qr_secret is NEVER exposed in the response
    assert(tokenData && tokenData.qr_secret === undefined, 'qr_secret is NOT exposed in QR token response');
    assert(tokenData && tokenData.payload.qr_secret === undefined, 'qr_secret is NOT exposed in payload object');

    // -------------------------------------------------------------------------
    // STEP 4.3: STUDENT QR SCANNING - AUTHENTICATION & ACCESS ENFORCEMENT
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Student Scan Authentication & Role Enforcement ---');

    // 3.1 Unauthenticated scan
    const unauthScan = await request('POST', '/api/attendance/qr/scan', { token: tokenData.token });
    assert(unauthScan.status === 401, 'Unauthenticated scan returns 401 Unauthorized');

    // 3.2 Teacher scan rejected (STUDENT role required)
    const teacherScan = await request('POST', '/api/attendance/qr/scan', { token: tokenData.token }, teacher1Token);
    assert(teacherScan.status === 403, 'TEACHER attempting to scan returns 403 Forbidden');

    // 3.3 Admin scan rejected (STUDENT role required)
    const adminScan = await request('POST', '/api/attendance/qr/scan', { token: tokenData.token }, adminToken);
    assert(adminScan.status === 403, 'ADMIN attempting to scan returns 403 Forbidden');

    // -------------------------------------------------------------------------
    // STEP 4.4: STUDENT QR SCANNING - TOKEN VALIDATION & TAMPER PROOFING
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Token Validation, Tamper Proofing & Drift Window ---');

    // 4.1 Missing payload
    const emptyScan = await request('POST', '/api/attendance/qr/scan', {}, karanToken);
    assert(emptyScan.status === 400, 'Empty scan body returns 400 Bad Request');

    // 4.2 Malformed token string
    const malformedScan = await request('POST', '/api/attendance/qr/scan', { token: 'invalid_base64_json' }, karanToken);
    assert(malformedScan.status === 400, 'Malformed token string returns 400 Bad Request');

    // 4.3 Invalid session_uuid (404)
    const invalidSidPayload = {
      sid: '00000000-0000-0000-0000-000000000000',
      ts: Date.now(),
      nonce: '1234567812345678',
      sig: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    };
    const notFoundScan = await request('POST', '/api/attendance/qr/scan', invalidSidPayload, karanToken);
    assert(notFoundScan.status === 404, 'Non-existent session_uuid returns 404 Not Found');

    // 4.4 Tampered signature (HMAC verification failure)
    const tamperedPayload = {
      sid: tokenData.payload.sid,
      ts: tokenData.payload.ts,
      nonce: tokenData.payload.nonce,
      sig: 'a'.repeat(64) // fake forged signature
    };
    const tamperedScan = await request('POST', '/api/attendance/qr/scan', tamperedPayload, karanToken);
    assert(tamperedScan.status === 400, 'Forged HMAC signature is rejected with 400 Bad Request');

    // 4.5 Expired rolling token (timestamp drift > 60 seconds)
    const expiredTokenPayload = {
      sid: tokenData.payload.sid,
      ts: Date.now() - 90 * 1000, // 90 seconds in past
      nonce: '1234567812345678',
      sig: tokenData.payload.sig
    };
    const expiredTokenScan = await request('POST', '/api/attendance/qr/scan', expiredTokenPayload, karanToken);
    assert(expiredTokenScan.status === 410, 'Token timestamp older than drift window is rejected with 410 Gone');

    // -------------------------------------------------------------------------
    // STEP 4.5: ENROLLMENT VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Course Enrollment Verification ---');

    // Suraj (user_id = 180, student_id = 98) is NOT enrolled in course 146
    const unenrolledScan = await request('POST', '/api/attendance/qr/scan', { token: tokenData.token }, surajToken);
    assert(unenrolledScan.status === 403, 'Unenrolled student scan is rejected with 403 Forbidden');

    // -------------------------------------------------------------------------
    // STEP 4.6: SUCCESSFUL SCAN BY ENROLLED STUDENT & SPOOFING PROTECTION
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Successful Scan by Enrolled Student & Spoofing Protection ---');

    // Attempt student_id spoofing: Karan sends student_id: 98 in body
    const spoofScan = await request('POST', '/api/attendance/qr/scan', {
      token: tokenData.token,
      student_id: 98 // attempt to mark attendance for Suraj
    }, karanToken);

    assert(spoofScan.status === 201, 'Enrolled student Karan successfully marked attendance (Status 201)');
    const scanResult = spoofScan.data && spoofScan.data.data;
    assert(!!scanResult && !!scanResult.attendance_id, 'Response contains created attendance_id');
    createdAttendanceId = scanResult && scanResult.attendance_id;

    // Verify student_id spoofing was completely ignored (student_id = 96, Karan's real ID)
    assert(scanResult && scanResult.student_id === 96, 'attendance record created strictly for authenticated student (ID: 96, not spoofed 98)');
    assert(scanResult && scanResult.status === 'Present', "attendance status is 'Present'");
    assert(scanResult && scanResult.remarks === 'Marked via Dynamic QR', "remarks is 'Marked via Dynamic QR'");
    assert(scanResult && scanResult.course_id === 146, 'attendance course_id matches session course 146');

    // Verify row in attendance table
    const [attRow] = await pool.query('SELECT * FROM attendance WHERE attendance_id = ?', [createdAttendanceId]);
    assert(attRow.length === 1, 'Attendance record verified in attendance table');
    assert(attRow[0].student_id === 96, 'Database student_id = 96 (Karan)');
    assert(attRow[0].course_id === 146, 'Database course_id = 146');
    assert(attRow[0].teacher_id === 90, 'Database teacher_id = 90');
    assert(attRow[0].status === 'Present', "Database status = 'Present'");
    assert(attRow[0].remarks === 'Marked via Dynamic QR', "Database remarks = 'Marked via Dynamic QR'");

    // Verify Audit Log
    const [scanAudit] = await pool.query("SELECT * FROM audit_logs WHERE action = 'ATTENDANCE_MARKED_QR' AND entity_id = ? ORDER BY log_id DESC LIMIT 1", [createdAttendanceId]);
    assert(scanAudit.length === 1, "Audit log created with action 'ATTENDANCE_MARKED_QR'");
    assert(scanAudit[0].user_id === 174, "Audit log user_id = 174 (Karan)");

    // -------------------------------------------------------------------------
    // STEP 4.7: DUPLICATE SCAN PREVENTION
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Duplicate Scan Prevention ---');

    // Karan scans again with the same or fresh token
    const freshTokenRes = await request('GET', `/api/attendance/qr/token/${createdSessionUuid}`, null, teacher1Token);
    const freshToken = freshTokenRes.data.data.token;

    const dupScan = await request('POST', '/api/attendance/qr/scan', { token: freshToken }, karanToken);
    assert(dupScan.status === 409, 'Duplicate scan by Karan returns 409 Conflict');

    // Second enrolled student (Saksham, student_id = 97) CAN scan and receive attendance
    const sakshamScan = await request('POST', '/api/attendance/qr/scan', { token: freshToken }, sakshamToken);
    assert(sakshamScan.status === 201, 'Second enrolled student Saksham successfully scans (Status 201)');
    const sakshamAttId = sakshamScan.data && sakshamScan.data.data && sakshamScan.data.data.attendance_id;

    // -------------------------------------------------------------------------
    // STEP 4.8: CLOSED SESSION REJECTION
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Closed Session Rejection ---');

    // Teacher 1 closes session
    await request('POST', `/api/attendance/qr/close/${createdSessionUuid}`, null, teacher1Token);

    // Attempting to generate token for closed session returns 410 Gone
    const closedTok = await request('GET', `/api/attendance/qr/token/${createdSessionUuid}`, null, teacher1Token);
    assert(closedTok.status === 410, 'Requesting token for closed session returns 410 Gone');

    // Student scanning token for closed session returns 410 Gone
    const closedScan = await request('POST', '/api/attendance/qr/scan', { token: freshToken }, sakshamToken);
    assert(closedScan.status === 410, 'Scanning token for closed session returns 410 Gone');

    // -------------------------------------------------------------------------
    // STEP 4.9: EXPIRED SESSION REJECTION
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Expired Session Rejection ---');

    // Start a 30s session
    const sess2Res = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 98,
      duration: 30,
      session_date: '2026-09-21'
    }, teacher1Token);
    assert(sess2Res.status === 201, 'Started test session 2 with 30s duration');
    const sess2 = sess2Res.data.data;

    // Get a valid token while active
    const sess2TokRes = await request('GET', `/api/attendance/qr/token/${sess2.session_uuid}`, null, teacher1Token);
    const sess2Token = sess2TokRes.data.data.token;

    // Fast-forward session expiration in database to the past
    await pool.query('UPDATE attendance_sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 5 SECOND) WHERE session_id = ?', [sess2.session_id]);

    // Token endpoint now returns 410 Gone
    const expTok = await request('GET', `/api/attendance/qr/token/${sess2.session_uuid}`, null, teacher1Token);
    assert(expTok.status === 410, 'Requesting token for expired session returns 410 Gone');

    // Student scan on expired session returns 410 Gone
    const expScan = await request('POST', '/api/attendance/qr/scan', { token: sess2Token }, sakshamToken);
    assert(expScan.status === 410, 'Scanning token for expired session returns 410 Gone');

    // Clean up session 2
    await pool.query('DELETE FROM attendance_sessions WHERE session_id = ?', [sess2.session_id]);

    // -------------------------------------------------------------------------
    // STEP 4.10: EXISTING MANUAL ATTENDANCE REGRESSION
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Existing Manual Attendance Regression ---');

    // 10.1 Teacher can fetch assigned courses
    const coursesRes = await request('GET', '/api/attendance/courses', null, teacher1Token);
    assert(coursesRes.status === 200, 'GET /api/attendance/courses works properly (Status 200)');

    // 10.2 Teacher can fetch sessions
    const sessionsRes = await request('GET', '/api/attendance/sessions', null, teacher1Token);
    assert(sessionsRes.status === 200, 'GET /api/attendance/sessions works properly (Status 200)');

    // 10.3 Student can fetch their attendance
    const myAttRes = await request('GET', '/api/attendance/my-attendance', null, karanToken);
    assert(myAttRes.status === 200, 'GET /api/attendance/my-attendance works properly (Status 200)');

    // -------------------------------------------------------------------------
    // CLEAN UP TEST DATA
    // -------------------------------------------------------------------------
    if (createdAttendanceId) {
      await pool.query('DELETE FROM attendance WHERE attendance_id = ?', [createdAttendanceId]);
    }
    if (sakshamAttId) {
      await pool.query('DELETE FROM attendance WHERE attendance_id = ?', [sakshamAttId]);
    }
    if (createdSessionId) {
      await pool.query('DELETE FROM attendance_sessions WHERE session_id = ?', [createdSessionId]);
    }
    await pool.query("DELETE FROM audit_logs WHERE action = 'ATTENDANCE_MARKED_QR' AND entity_id IN (?, ?)", [createdAttendanceId, sakshamAttId]);
    console.log('\n[OK] Cleaned up temporary test rows from attendance, attendance_sessions, and audit_logs');

  } finally {
    await new Promise(resolve => server.close(resolve));
    console.log('Test server closed.');
  }

  console.log('\n================================================================');
  console.log(`FINAL STEP 4 TEST RESULTS: ${passes} PASSED, ${failures} FAILED`);
  console.log('================================================================');

  if (failures > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStep4Tests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
