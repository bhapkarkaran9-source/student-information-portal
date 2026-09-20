/**
 * test-qr-teacher-frontend.js
 * Comprehensive integration & E2E verification for Dynamic QR Attendance - Teacher Frontend (Step 5)
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const db = require('../src/config/db');
const { generateToken } = require('../src/utils/token');

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(condition, testName, details = '') {
  if (condition) {
    passCount++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failCount++;
    const msg = `  [FAIL] ${testName}${details ? ` -> ${details}` : ''}`;
    console.error(msg);
    failures.push(msg);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log(' STEP 5: TEACHER FRONTEND UI & INTEGRATION VERIFICATION SUITE');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. STATIC DOM & ASSET VERIFICATIONS
  // ---------------------------------------------------------------------------
  console.log('--- 1. Static DOM & Asset Integrity Checks ---');

  const htmlPath = path.join(__dirname, '../public/pages/teacher/attendance.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const jsPath = path.join(__dirname, '../public/js/teacher-attendance.js');
  const jsContent = fs.readFileSync(jsPath, 'utf8');

  const qrcodeLibPath = path.join(__dirname, '../public/js/libs/qrcode.min.js');

  // Script tags in attendance.html
  assert(
    htmlContent.includes('<script src="/js/libs/qrcode.min.js"></script>'),
    'attendance.html includes qrcode.min.js script tag'
  );
  assert(
    htmlContent.indexOf('/js/libs/qrcode.min.js') < htmlContent.indexOf('/js/teacher-attendance.js'),
    'qrcode.min.js is included BEFORE teacher-attendance.js'
  );
  assert(
    fs.existsSync(qrcodeLibPath) && fs.statSync(qrcodeLibPath).size > 10000,
    'qrcode.min.js asset exists and is intact (>10KB)'
  );

  // Section & Panels
  assert(htmlContent.includes('id="qrAttendanceSection"'), 'Section #qrAttendanceSection exists in HTML');
  assert(htmlContent.includes('id="qrSetupPanel"'), 'Panel #qrSetupPanel exists');
  assert(htmlContent.includes('id="qrLivePanel"'), 'Panel #qrLivePanel exists');

  // Form Mode Selectors
  assert(htmlContent.includes('id="qrModeTimetable"'), 'Timetable radio button #qrModeTimetable exists');
  assert(htmlContent.includes('id="qrModeCustom"'), 'Custom radio button #qrModeCustom exists');
  assert(htmlContent.includes('id="qrTimetableModeContainer"'), 'Container #qrTimetableModeContainer exists');
  assert(htmlContent.includes('id="qrCustomModeContainer"'), 'Container #qrCustomModeContainer exists');

  // Timetable Mode Elements
  assert(htmlContent.includes('id="qrTimetableSelect"'), 'Dropdown #qrTimetableSelect exists');
  assert(htmlContent.includes('id="qrTimetableValiditySelect"'), 'Validity dropdown #qrTimetableValiditySelect exists');
  assert(htmlContent.includes('id="qrTimetableSlotPreview"'), 'Preview box #qrTimetableSlotPreview exists');

  // Custom Mode Elements
  assert(htmlContent.includes('id="qrCustomCourseSelect"'), 'Dropdown #qrCustomCourseSelect exists');
  assert(htmlContent.includes('id="qrCustomDate"'), 'Date input #qrCustomDate exists');
  assert(htmlContent.includes('id="qrCustomStartTime"'), 'Time input #qrCustomStartTime exists');
  assert(htmlContent.includes('id="qrCustomEndTime"'), 'Time input #qrCustomEndTime exists');
  assert(htmlContent.includes('id="qrCustomRoomNo"'), 'Room input #qrCustomRoomNo exists');
  assert(htmlContent.includes('id="qrCustomLectureType"'), 'Lecture type dropdown #qrCustomLectureType exists');
  assert(htmlContent.includes('id="qrCustomValiditySelect"'), 'Validity dropdown #qrCustomValiditySelect exists');

  // Action Buttons
  assert(htmlContent.includes('id="btnStartQRSession"'), 'Start button #btnStartQRSession exists');
  assert(htmlContent.includes('id="btnCloseQRSession"'), 'Close button #btnCloseQRSession exists');
  assert(htmlContent.includes('id="btnNewQRSession"'), 'New session button #btnNewQRSession exists');
  assert(htmlContent.includes('id="btnManualRefreshQR"'), 'Rotate token button #btnManualRefreshQR exists');

  // Live QR Display Elements
  assert(htmlContent.includes('id="qrLiveStatusBadge"'), 'Live status badge #qrLiveStatusBadge exists');
  assert(htmlContent.includes('id="qrCountdownText"'), 'Countdown text #qrCountdownText exists');
  assert(htmlContent.includes('id="qrCodeTarget"'), 'QR code mount target #qrCodeTarget exists');
  assert(htmlContent.includes('id="qrOverlay"'), 'Expiry/Closed overlay #qrOverlay exists');
  assert(htmlContent.includes('id="qrLiveCourseName"'), 'Course display #qrLiveCourseName exists');
  assert(htmlContent.includes('id="qrLiveFacultyName"'), 'Faculty display #qrLiveFacultyName exists');
  assert(htmlContent.includes('id="qrLiveLectureType"'), 'Lecture type display #qrLiveLectureType exists');
  assert(htmlContent.includes('id="qrLiveDate"'), 'Date display #qrLiveDate exists');
  assert(htmlContent.includes('id="qrLiveTime"'), 'Time display #qrLiveTime exists');
  assert(htmlContent.includes('id="qrLiveRoom"'), 'Room display #qrLiveRoom exists');

  // Validity Duration Options (30s, 1m, 2m, 5m, 10m, 15m)
  const requiredDurations = ['30 seconds', '1 minute', '2 minutes', '5 minutes', '10 minutes', '15 minutes'];
  for (const d of requiredDurations) {
    assert(
      htmlContent.includes(`value="${d}"`),
      `Validity dropdown includes required option "${d}"`
    );
  }

  // ---------------------------------------------------------------------------
  // 2. SECURITY & CLIENT LOGIC INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Security & Controller Logic Checks ---');

  // Ensure qr_secret is NEVER present or referenced in frontend HTML/JS
  assert(
    !htmlContent.includes('qr_secret'),
    'Security: attendance.html never references or exposes qr_secret'
  );
  assert(
    !jsContent.includes('qr_secret'),
    'Security: teacher-attendance.js never references, logs, or handles qr_secret'
  );

  // Controller function checks
  assert(jsContent.includes('function initQRAttendance'), 'teacher-attendance.js defines initQRAttendance');
  assert(jsContent.includes('function startLiveQRView'), 'teacher-attendance.js defines startLiveQRView');
  assert(jsContent.includes('function fetchAndRenderQRToken'), 'teacher-attendance.js defines fetchAndRenderQRToken');
  assert(jsContent.includes('function handleStartQRSession'), 'teacher-attendance.js defines handleStartQRSession');
  assert(jsContent.includes('function handleCloseQRSession'), 'teacher-attendance.js defines handleCloseQRSession');
  assert(jsContent.includes('function setQRStateExpired'), 'teacher-attendance.js defines setQRStateExpired');
  assert(jsContent.includes('function checkActiveQRSessionOnLoad'), 'teacher-attendance.js defines checkActiveQRSessionOnLoad');

  // Interval check (25 seconds auto-refresh)
  assert(
    jsContent.includes('25000'),
    'Token auto-refresh interval is configured to 25000 ms (~25 seconds)'
  );

  // ---------------------------------------------------------------------------
  // 3. API & INTEGRATION VERIFICATION WITH REAL DB & TEACHER
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Live API & Session Flow Verification ---');

  // Start test server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  async function api(method, route, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  }

  // Teacher 1 (Rohini, user_id = 175, teacher_id = 90, course_id = 146, timetable_id = 98)
  const teacherUser = { teacher_id: 90, user_id: 175, username: 'Rohini', role: 'TEACHER' };
  const teacherToken = generateToken({ user_id: teacherUser.user_id, username: teacherUser.username, role: teacherUser.role });
  const testSlot = { timetable_id: 98, course_id: 146, teacher_id: 90 };

  // Clean up any existing active session for this teacher
  await db.query(
    'UPDATE attendance_sessions SET is_active = 0 WHERE teacher_id = ? AND is_active = 1',
    [teacherUser.teacher_id]
  );

  // Test A: Cold Load -> No active session
  const coldRes = await api('GET', '/api/attendance/qr/active', null, teacherToken);
  assert(coldRes.status === 200, 'GET /api/attendance/qr/active returns 200 on cold load');
  assert(coldRes.body.data.active === false, 'Cold load confirms active: false');
  assert(coldRes.body.data.session === null, 'Cold load confirms session: null');

  // Test B: Start Session via Timetable mode (5 minutes)
  const startRes = await api('POST', '/api/attendance/qr/start', {
    timetable_id: testSlot.timetable_id,
    duration_minutes: '5 minutes',
    session_date: '2026-09-20',
    lecture_type: 'Regular Lecture'
  }, teacherToken);

  assert(startRes.status === 201, 'POST /api/attendance/qr/start returns 201 Created');
  assert(startRes.body.success === true, 'Response indicates success: true');
  const activeSession = startRes.body.data;
  assert(activeSession && activeSession.session_id > 0, 'Returns session_id > 0');
  assert(activeSession.timetable_id === testSlot.timetable_id, 'Timetable ID matches requested slot');
  assert(activeSession.is_active === 1, 'Session is marked is_active: 1');
  assert(activeSession.qr_secret === undefined, 'Security: qr_secret is NOT exposed in start response');

  // Test C: Active Session Recovery (Simulate Page Reload)
  const reloadRes = await api('GET', '/api/attendance/qr/active', null, teacherToken);
  assert(reloadRes.status === 200, 'GET /api/attendance/qr/active returns 200 on recovery');
  assert(reloadRes.body.data.active === true, 'Recovery confirms active: true');
  assert(
    reloadRes.body.data.session.session_id === activeSession.session_id,
    'Recovered session_id matches active session'
  );
  assert(
    reloadRes.body.data.session.remaining_seconds > 0,
    'Recovered session has remaining_seconds > 0'
  );
  assert(
    reloadRes.body.data.session.qr_secret === undefined,
    'Security: qr_secret is NOT exposed in active recovery response'
  );

  // Test D: Dynamic Token Generation for Active Session
  const tokenRes = await api('GET', `/api/attendance/qr/token/${activeSession.session_id}`, null, teacherToken);
  assert(tokenRes.status === 200, 'GET /api/attendance/qr/token/:sessionId returns 200');
  assert(Boolean(tokenRes.body.data.token), 'Response contains token string');
  assert(tokenRes.body.data.qr_secret === undefined, 'Security: qr_secret is NOT exposed in token response');

  // Verify token format
  const rawPayload = Buffer.from(tokenRes.body.data.token, 'base64url').toString('utf8');
  let parsedPayload = null;
  try {
    parsedPayload = JSON.parse(rawPayload);
  } catch (e) {}
  assert(
    parsedPayload && parsedPayload.sid === activeSession.session_uuid && parsedPayload.sig,
    'Token payload contains valid sid and HMAC signature'
  );

  // Test E: Conflict Detection (Starting 2nd session while 1st is active)
  const conflictRes = await api('POST', '/api/attendance/qr/start', {
    timetable_id: testSlot.timetable_id,
    duration_minutes: '10 minutes'
  }, teacherToken);
  assert(conflictRes.status === 409, 'Starting conflicting active session returns 409 Conflict');
  assert(conflictRes.body.success === false, 'Conflict response indicates success: false');

  // Test F: Close Active Session
  const closeRes = await api('POST', `/api/attendance/qr/close/${activeSession.session_id}`, null, teacherToken);
  assert(closeRes.status === 200, 'POST /api/attendance/qr/close/:sessionId returns 200');
  assert(closeRes.body.data.is_active === 0, 'Session is marked is_active: 0 after close');

  // Test G: Verify Token Request on Closed Session Fails with 410
  const closedTokenRes = await api('GET', `/api/attendance/qr/token/${activeSession.session_id}`, null, teacherToken);
  assert(closedTokenRes.status === 410, 'Requesting token for closed session returns 410 Gone');

  // Test H: Extra / Custom Lecture Mode
  const customStartRes = await api('POST', '/api/attendance/qr/start', {
    course_id: testSlot.course_id,
    session_date: '2026-09-21',
    start_time: '14:00',
    end_time: '15:00',
    room_no: 'Lab 3',
    lecture_type: 'Extra / Additional Lecture',
    duration_minutes: 0.5,
    duration_seconds: 30,
    duration: '30s'
  }, teacherToken);
  assert(customStartRes.status === 201, 'POST /api/attendance/qr/start (Custom Mode) returns 201');
  const customSession = customStartRes.body && customStartRes.body.data;
  assert(customSession.timetable_id === null, 'Custom session has timetable_id: null');
  assert(customSession.lecture_type === 'Extra / Additional Lecture', 'Custom session lecture_type is preserved');
  assert(customSession.room_no === 'Lab 3', 'Custom session room_no is preserved');

  // Close custom session
  await api('POST', `/api/attendance/qr/close/${customSession.session_id}`, null, teacherToken);

  // Test I: Verify Manual Attendance Still Operates Unbroken
  const manualCoursesRes = await api('GET', '/api/attendance/courses', null, teacherToken);
  assert(manualCoursesRes.status === 200, 'GET /api/attendance/courses works for manual attendance');

  const manualSummaryRes = await api('GET', '/api/attendance/summary', null, teacherToken);
  assert(manualSummaryRes.status === 200, 'GET /api/attendance/summary works for KPI counters');

  server.close();

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(` RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  if (failures.length > 0) {
    console.error('\nFailures encountered:');
    failures.forEach(f => console.error(f));
    process.exit(1);
  } else {
    console.log('\nAll Step 5 tests PASSED successfully!\n');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test run failed with error:', err);
  process.exit(1);
});
