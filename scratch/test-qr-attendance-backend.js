require('dotenv').config();
const http = require('http');
const app = require('../src/app');
const pool = require('../src/config/db');
const { generateToken } = require('../src/utils/token');

async function runTests() {
  console.log('================================================================');
  console.log('TESTING DYNAMIC QR ATTENDANCE BACKEND API FOUNDATION');
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

  try {
    // 2. Setup Test User Personas
    // Teacher 1 (Rohini, user_id = 175, teacher_id = 90, assigned course_id = 146, timetable_id = 98)
    const teacher1Token = generateToken({ user_id: 175, username: 'Rohini', role: 'TEACHER' });
    // Teacher 2 (Vikas, user_id = 176, teacher_id = 91)
    const teacher2Token = generateToken({ user_id: 176, username: 'Vikas', role: 'TEACHER' });
    // Student (Karan, user_id = 174, role: 'STUDENT')
    const studentToken = generateToken({ user_id: 174, username: 'Karan', role: 'STUDENT' });
    // Admin (admin, user_id = 1, role: 'ADMIN')
    const adminToken = generateToken({ user_id: 1, username: 'admin', role: 'ADMIN' });

    // Clean up any stale test sessions for teacher 90 or 91 before starting
    await pool.query('DELETE FROM attendance_sessions WHERE teacher_id IN (90, 91)');

    // -------------------------------------------------------------------------
    // TEST SUITE 1: AUTHENTICATION & ROLE ENFORCEMENT
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Authentication & Role Enforcement ---');
    
    // 1.1 Unauthenticated requests rejected
    const unauth1 = await request('POST', '/api/attendance/qr/start', { timetable_id: 98 });
    assert(unauth1.status === 401, 'POST /api/attendance/qr/start without token returns 401 Unauthorized');

    const unauth2 = await request('GET', '/api/attendance/qr/active');
    assert(unauth2.status === 401, 'GET /api/attendance/qr/active without token returns 401 Unauthorized');

    const unauth3 = await request('POST', '/api/attendance/qr/close/dummy-session');
    assert(unauth3.status === 401, 'POST /api/attendance/qr/close/:id without token returns 401 Unauthorized');

    // 1.2 Non-TEACHER roles rejected (403 Forbidden)
    const studentStart = await request('POST', '/api/attendance/qr/start', { timetable_id: 98 }, studentToken);
    assert(studentStart.status === 403, 'STUDENT calling POST /api/attendance/qr/start returns 403 Forbidden');

    const adminStart = await request('POST', '/api/attendance/qr/start', { timetable_id: 98 }, adminToken);
    assert(adminStart.status === 403, 'ADMIN calling POST /api/attendance/qr/start returns 403 Forbidden');

    const studentActive = await request('GET', '/api/attendance/qr/active', null, studentToken);
    assert(studentActive.status === 403, 'STUDENT calling GET /api/attendance/qr/active returns 403 Forbidden');

    const adminActive = await request('GET', '/api/attendance/qr/active', null, adminToken);
    assert(adminActive.status === 403, 'ADMIN calling GET /api/attendance/qr/active returns 403 Forbidden');

    // -------------------------------------------------------------------------
    // TEST SUITE 2: DURATION VALIDATION (SAFE DURATIONS ONLY)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Duration Validation ---');

    const invalidDur1 = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 98,
      duration: 7 // arbitrary 7 minutes not allowed
    }, teacher1Token);
    assert(invalidDur1.status === 400, 'Arbitrary duration (7 min) is rejected with 400 Bad Request');

    const invalidDur2 = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 98,
      duration_seconds: 45 // 45s not allowed
    }, teacher1Token);
    assert(invalidDur2.status === 400, 'Arbitrary duration (45 sec) is rejected with 400 Bad Request');

    const invalidDur3 = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 98,
      duration: -5
    }, teacher1Token);
    assert(invalidDur3.status === 400, 'Negative duration is rejected with 400 Bad Request');

    const invalidDur4 = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 98,
      duration: 'hacked'
    }, teacher1Token);
    assert(invalidDur4.status === 400, 'Non-numeric string duration is rejected with 400 Bad Request');

    // -------------------------------------------------------------------------
    // TEST SUITE 3: TIMETABLE LECTURE SESSION CREATION
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Timetable Lecture Session Creation ---');

    // 3.1 Unauthorized teacher attempting to start session for another teacher's timetable slot
    const unauthSlot = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 98, // belongs to Teacher 90 (Rohini)
      duration: 5
    }, teacher2Token); // Teacher 91 (Vikas)
    assert(unauthSlot.status === 403, 'Teacher 2 attempting to use Teacher 1 timetable slot returns 403 Forbidden');

    // 3.2 Non-existent timetable slot
    const notFoundSlot = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 999999,
      duration: 5
    }, teacher1Token);
    assert(notFoundSlot.status === 404, 'Non-existent timetable slot returns 404 Not Found');

    // 3.3 Teacher 1 successfully starts session from timetable slot (timetable_id = 98)
    const startRes1 = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 98,
      duration: 5,
      session_date: '2026-09-20'
    }, teacher1Token);

    assert(startRes1.status === 201, 'Teacher 1 successfully starts timetable session (Status 201)');
    const sess1 = startRes1.data && startRes1.data.data;
    assert(!!sess1, 'Response contains created session data object');
    assert(sess1 && sess1.timetable_id === 98, 'Created session has correct timetable_id = 98');
    assert(sess1 && sess1.course_id === 146, 'Created session has correct course_id = 146');
    assert(sess1 && sess1.teacher_id === 90, 'Created session has correct teacher_id = 90');
    assert(sess1 && sess1.is_active === 1, 'Created session has is_active = 1');
    assert(sess1 && sess1.duration_seconds === 300, 'Created session duration_seconds = 300');
    assert(sess1 && sess1.remaining_seconds > 0 && sess1.remaining_seconds <= 300, 'remaining_seconds is properly calculated server-side');
    assert(sess1 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sess1.session_uuid), 'session_uuid is a valid cryptographically secure UUID');

    // 3.4 Verify qr_secret is NEVER exposed in the API response
    assert(sess1 && sess1.qr_secret === undefined, 'qr_secret is NOT exposed in start endpoint response');

    // 3.5 Verify qr_secret IS persisted in database (64 hex characters)
    const [dbSess1] = await pool.query('SELECT qr_secret FROM attendance_sessions WHERE session_id = ?', [sess1.session_id]);
    assert(dbSess1.length === 1 && dbSess1[0].qr_secret && dbSess1[0].qr_secret.length === 64, 'qr_secret is securely stored in database (64 hex chars)');

    // 3.6 Verify Audit Log recorded QR_SESSION_STARTED
    const [auditLogs1] = await pool.query("SELECT * FROM audit_logs WHERE action = 'QR_SESSION_STARTED' AND entity_id = ? ORDER BY log_id DESC LIMIT 1", [sess1.session_uuid]);
    assert(auditLogs1.length === 1, "Audit log created with action 'QR_SESSION_STARTED'");

    // -------------------------------------------------------------------------
    // TEST SUITE 4: DUPLICATE / CONFLICTING ACTIVE SESSION PREVENTION
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Duplicate / Conflicting Active Session Prevention ---');

    const dupStart = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 98,
      duration: 10
    }, teacher1Token);
    assert(dupStart.status === 409, 'Starting second session while one is active returns 409 Conflict');

    // -------------------------------------------------------------------------
    // TEST SUITE 5: ACTIVE SESSION RETRIEVAL
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Active Session Retrieval ---');

    const activeRes1 = await request('GET', '/api/attendance/qr/active', null, teacher1Token);
    assert(activeRes1.status === 200, 'GET /api/attendance/qr/active returns 200 OK');
    assert(activeRes1.data && activeRes1.data.data && activeRes1.data.data.active === true, 'Response indicates active: true');
    const activeData = activeRes1.data.data.session;
    assert(activeData && activeData.session_id === sess1.session_id, 'Active session matches the created session_id');
    assert(activeData && activeData.remaining_seconds > 0, 'Active session includes remaining_seconds > 0');
    assert(activeData && activeData.qr_secret === undefined, 'qr_secret is NOT exposed in active session response');

    // Teacher 2 has no active session
    const activeRes2 = await request('GET', '/api/attendance/qr/active', null, teacher2Token);
    assert(activeRes2.status === 200, 'Teacher 2 GET /api/attendance/qr/active returns 200 OK');
    assert(activeRes2.data && activeRes2.data.data && activeRes2.data.data.active === false, 'Teacher 2 has active: false');

    // -------------------------------------------------------------------------
    // TEST SUITE 6: UNAUTHORIZED SESSION CLOSE / IDOR
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Unauthorized Session Close / IDOR ---');

    // Teacher 2 tries to close Teacher 1's session
    const idorClose = await request('POST', `/api/attendance/qr/close/${sess1.session_uuid}`, null, teacher2Token);
    assert(idorClose.status === 403, "Teacher 2 attempting to close Teacher 1's session returns 403 Forbidden");

    // Verify session remains active
    const [checkStillActive] = await pool.query('SELECT is_active FROM attendance_sessions WHERE session_id = ?', [sess1.session_id]);
    assert(checkStillActive[0].is_active === 1, 'Session remains active after unauthorized close attempt');

    // -------------------------------------------------------------------------
    // TEST SUITE 7: SESSION CLOSE BY AUTHORIZED TEACHER
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Session Close by Authorized Teacher ---');

    // Close using session_uuid
    const closeRes = await request('POST', `/api/attendance/qr/close/${sess1.session_uuid}`, null, teacher1Token);
    assert(closeRes.status === 200, 'Teacher 1 successfully closes session via UUID (Status 200)');
    assert(closeRes.data && closeRes.data.data && closeRes.data.data.is_active === 0, 'Response reflects is_active = 0');

    // Verify database state
    const [dbClosed] = await pool.query('SELECT is_active FROM attendance_sessions WHERE session_id = ?', [sess1.session_id]);
    assert(dbClosed[0].is_active === 0, 'Database reflects is_active = 0');

    // Verify audit log recorded QR_SESSION_ENDED
    const [auditLogsClosed] = await pool.query("SELECT * FROM audit_logs WHERE action = 'QR_SESSION_ENDED' AND entity_id = ? ORDER BY log_id DESC LIMIT 1", [sess1.session_uuid]);
    assert(auditLogsClosed.length === 1, "Audit log created with action 'QR_SESSION_ENDED'");

    // Verify GET /api/attendance/qr/active now returns active: false
    const activeAfterClose = await request('GET', '/api/attendance/qr/active', null, teacher1Token);
    assert(activeAfterClose.data && activeAfterClose.data.data && activeAfterClose.data.data.active === false, 'After close, GET active returns active: false');

    // Closing already closed session is safe
    const repeatClose = await request('POST', `/api/attendance/qr/close/${sess1.session_id}`, null, teacher1Token);
    assert(repeatClose.status === 200, 'Repeating close on already closed session returns 200 OK');

    // -------------------------------------------------------------------------
    // TEST SUITE 8: EXTRA / CUSTOM LECTURE SESSION CREATION
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Extra / Custom Lecture Session Creation ---');

    // 8.1 Missing course_id
    const missingCourse = await request('POST', '/api/attendance/qr/start', {
      session_date: '2026-09-20',
      start_time: '14:00',
      end_time: '15:00',
      duration: 5
    }, teacher1Token);
    assert(missingCourse.status === 400, 'Missing course_id returns 400 Bad Request');

    // 8.2 Course not assigned to this teacher (e.g. course 9999 or course assigned to another teacher)
    const unassignedCourse = await request('POST', '/api/attendance/qr/start', {
      course_id: 999999,
      session_date: '2026-09-20',
      start_time: '14:00',
      end_time: '15:00',
      duration: 5
    }, teacher1Token);
    assert(unassignedCourse.status === 403, 'Unassigned course returns 403 Forbidden');

    // 8.3 Invalid times: start_time >= end_time
    const invalidTime = await request('POST', '/api/attendance/qr/start', {
      course_id: 146,
      session_date: '2026-09-20',
      start_time: '15:00',
      end_time: '14:00',
      duration: 5
    }, teacher1Token);
    assert(invalidTime.status === 400, 'start_time >= end_time returns 400 Bad Request');

    // 8.4 Valid Extra Lecture (course_id = 146, duration = 30 seconds)
    const customStartRes = await request('POST', '/api/attendance/qr/start', {
      course_id: 146,
      session_date: '2026-09-20',
      start_time: '14:00:00',
      end_time: '15:00:00',
      lecture_type: 'Extra / Additional Lecture',
      room_no: 'Room 305',
      duration: 30 // 30 seconds
    }, teacher1Token);

    assert(customStartRes.status === 201, 'Extra lecture session created successfully (Status 201)');
    const customSess = customStartRes.data && customStartRes.data.data;
    assert(customSess && customSess.timetable_id === null, 'Extra lecture has timetable_id = null');
    assert(customSess && customSess.lecture_type === 'Extra / Additional Lecture', 'lecture_type matches requested Extra Lecture');
    assert(customSess && customSess.room_no === 'Room 305', 'room_no matches requested Room 305');
    assert(customSess && customSess.duration_seconds === 30, 'duration_seconds is 30 for 30-second duration');
    assert(customSess && customSess.qr_secret === undefined, 'qr_secret is NOT exposed in extra lecture response');

    // -------------------------------------------------------------------------
    // TEST SUITE 9: EXPIRED SESSION HANDLING
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Expired Session Handling ---');

    // Fast-forward session expiration to the past
    await pool.query('UPDATE attendance_sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 5 SECOND) WHERE session_id = ?', [customSess.session_id]);

    // GET /api/attendance/qr/active should detect expiration and return active: false
    const activeExpired = await request('GET', '/api/attendance/qr/active', null, teacher1Token);
    assert(activeExpired.status === 200, 'GET /api/attendance/qr/active on expired session returns 200 OK');
    assert(activeExpired.data && activeExpired.data.data && activeExpired.data.data.active === false, 'Expired session is NOT returned as active (active: false)');

    // Since old session is expired, teacher can now start a new session without 409 conflict
    const startAfterExpired = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 98,
      duration: 1
    }, teacher1Token);
    assert(startAfterExpired.status === 201, 'Teacher can start new session once previous session has expired');

    // Clean up second session
    const sessAfter = startAfterExpired.data && startAfterExpired.data.data;
    if (sessAfter && sessAfter.session_id) {
      await pool.query('DELETE FROM attendance_sessions WHERE session_id = ?', [sessAfter.session_id]);
    }

    // -------------------------------------------------------------------------
    // CLEAN UP TEST DATA
    // -------------------------------------------------------------------------
    await pool.query('DELETE FROM attendance_sessions WHERE session_id IN (?, ?)', [sess1.session_id, customSess.session_id]);
    await pool.query("DELETE FROM audit_logs WHERE action IN ('QR_SESSION_STARTED', 'QR_SESSION_ENDED') AND entity_id IN (?, ?)", [sess1.session_uuid, customSess.session_uuid]);
    console.log('\n[OK] Cleaned up test attendance_sessions and audit_logs rows');

  } finally {
    await new Promise(resolve => server.close(resolve));
    console.log('Test server closed.');
  }

  console.log('\n================================================================');
  console.log(`FINAL BACKEND TEST RESULTS: ${passes} PASSED, ${failures} FAILED`);
  console.log('================================================================');

  if (failures > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
