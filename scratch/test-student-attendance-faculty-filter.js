/**
 * Comprehensive Verification Suite for Student Attendance Faculty Filter
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const pool = require('../src/config/db');
const { generateToken } = require('../src/utils/token');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9276;

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('=================================================================');
  console.log('STUDENT ATTENDANCE FACULTY FILTER VERIFICATION SUITE');
  console.log('=================================================================\n');

  // Start HTTP server
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  // Query an Information Technology student (department_id = 119)
  const [itStudents] = await pool.query(`
    SELECT s.student_id, s.department_id, s.semester, s.user_id, u.username, u.email, u.first_name, u.last_name, r.role_name as role, d.department_name
    FROM students s
    JOIN users u ON s.user_id = u.user_id
    JOIN roles r ON u.role_id = r.role_id
    JOIN departments d ON s.department_id = d.department_id
    WHERE d.department_name = 'Information Technology'
    LIMIT 1
  `);

  // Query a Computer Science student (department_id = 120)
  const [csStudents] = await pool.query(`
    SELECT s.student_id, s.department_id, s.semester, s.user_id, u.username, u.email, u.first_name, u.last_name, r.role_name as role, d.department_name
    FROM students s
    JOIN users u ON s.user_id = u.user_id
    JOIN roles r ON u.role_id = r.role_id
    JOIN departments d ON s.department_id = d.department_id
    WHERE d.department_name = 'Computer Science'
    LIMIT 1
  `);

  if (!itStudents.length || !csStudents.length) {
    throw new Error('Both IT and CS students are required for verification');
  }

  const itStudent = itStudents[0];
  const csStudent = csStudents[0];

  const itToken = generateToken({
    user_id: itStudent.user_id,
    username: itStudent.username,
    email: itStudent.email,
    role: itStudent.role
  });

  const csToken = generateToken({
    user_id: csStudent.user_id,
    username: csStudent.username,
    email: csStudent.email,
    role: csStudent.role
  });

  console.log(`IT Student: ${itStudent.first_name} ${itStudent.last_name} (${itStudent.department_name})`);
  console.log(`CS Student: ${csStudent.first_name} ${csStudent.last_name} (${csStudent.department_name})\n`);

  // -------------------------------------------------------------------------
  // 1. Backend API Security & Scoping Verification
  // -------------------------------------------------------------------------
  console.log('--- 1. Backend API Security & Department Scoping ---');

  // Test GET /api/attendance/department-faculty for IT student
  const itFacRes = await fetch(`${baseUrl}/api/attendance/department-faculty`, {
    headers: { 'Authorization': `Bearer ${itToken}` }
  });
  const itFacJson = await itFacRes.json();
  assert(itFacRes.ok && itFacJson.success, 'GET /api/attendance/department-faculty succeeds for IT student');
  const itFacultyNames = (itFacJson.data.faculty || []).map(f => f.teacher_name);
  console.log('  IT Department Faculty returned by API:', itFacultyNames);

  assert(itFacultyNames.includes('Rohini Rankhamb'), 'IT faculty includes Rohini Rankhamb');
  assert(itFacultyNames.includes('Vikas Kadam'), 'IT faculty includes Vikas Kadam');
  assert(itFacultyNames.includes('Sneha Vanjari'), 'IT faculty includes Sneha Vanjari');
  assert(itFacultyNames.includes('Vanita Gadekar'), 'IT faculty includes Vanita Gadekar');
  assert(!itFacultyNames.includes('Sarthak Sawant'), 'SECURITY: IT student cannot see CS faculty Sarthak Sawant');

  // Test GET /api/attendance/department-faculty for CS student
  const csFacRes = await fetch(`${baseUrl}/api/attendance/department-faculty`, {
    headers: { 'Authorization': `Bearer ${csToken}` }
  });
  const csFacJson = await csFacRes.json();
  assert(csFacRes.ok && csFacJson.success, 'GET /api/attendance/department-faculty succeeds for CS student');
  const csFacultyNames = (csFacJson.data.faculty || []).map(f => f.teacher_name);
  console.log('  CS Department Faculty returned by API:', csFacultyNames);

  assert(csFacultyNames.includes('Sarthak Sawant'), 'CS faculty includes Sarthak Sawant');
  assert(!csFacultyNames.includes('Rohini Rankhamb'), 'SECURITY: CS student cannot see IT faculty Rohini Rankhamb');
  assert(!csFacultyNames.includes('Vikas Kadam'), 'SECURITY: CS student cannot see IT faculty Vikas Kadam');

  // Test GET /api/attendance/student/me includes departmentFaculty
  const meRes = await fetch(`${baseUrl}/api/attendance/student/me`, {
    headers: { 'Authorization': `Bearer ${itToken}` }
  });
  const meJson = await meRes.json();
  assert(meRes.ok && meJson.success, 'GET /api/attendance/student/me succeeds');
  assert(Array.isArray(meJson.data.departmentFaculty), 'Response contains departmentFaculty array');
  assert(meJson.data.departmentFaculty.length >= 4, `departmentFaculty contains ${meJson.data.departmentFaculty.length} teachers`);

  // -------------------------------------------------------------------------
  // 2. Headless Chrome CDP Verification (Real Browser UI)
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Headless Chrome Browser UI Verification ---');

  const userDataDir = path.join(__dirname, 'chrome-attendance-fac-test');
  if (fs.existsSync(userDataDir)) {
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  }

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu'
  ]);

  let cdpConnected = false;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    try {
      const version = await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (version && version.webSocketDebuggerUrl) {
        cdpConnected = true;
        break;
      }
    } catch (e) {}
  }

  if (!cdpConnected) {
    throw new Error('Failed to connect to Chrome CDP');
  }

  const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json`);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);

  let messageId = 1;
  const cdpSend = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = messageId++;
    const timer = setTimeout(() => reject(new Error(`Timeout on CDP ${method}`)), 15000);
    const handler = (evt) => {
      const parsed = JSON.parse(evt.data || evt);
      if (parsed.id === msgId) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        if (parsed.error) reject(parsed.error);
        else resolve(parsed.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await new Promise(r => ws.onopen = r);
  await cdpSend('Page.enable');
  await cdpSend('DOM.enable');
  await cdpSend('Runtime.enable');

  const evalInPage = async (expr) => {
    const res = await cdpSend('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || 'Eval error');
    }
    return res.result?.value;
  };

  // Pre-seed localStorage with IT student auth
  await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/attendance.html` });
  await sleep(1000);

  await evalInPage(`
    localStorage.setItem('token', '${itToken}');
    localStorage.setItem('user', JSON.stringify({
      user_id: ${itStudent.user_id},
      username: '${itStudent.username}',
      email: '${itStudent.email}',
      first_name: '${itStudent.first_name}',
      last_name: '${itStudent.last_name}',
      role: 'STUDENT',
      department_name: '${itStudent.department_name}'
    }));
  `);

  // Reload page
  await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/attendance.html` });
  await sleep(1500);

  console.log('\n--- 3. Dropdown Options in IT Student Attendance Page ---');
  const dropdownOptions = await evalInPage(`
    Array.from(document.querySelectorAll('#filterLogFaculty option')).map(o => ({
      value: o.value,
      text: o.textContent.trim()
    }))
  `);

  assert(Array.isArray(dropdownOptions), 'Faculty select options loaded in DOM');
  const optionTexts = dropdownOptions.map(o => o.text);
  console.log('  Rendered Faculty Dropdown Options:', optionTexts);

  assert(optionTexts[0] === 'All Faculty', 'First option is "All Faculty"');
  assert(optionTexts.includes('Rohini Rankhamb'), 'Faculty dropdown contains Rohini Rankhamb');
  assert(optionTexts.includes('Sneha Vanjari'), 'Faculty dropdown contains Sneha Vanjari');
  assert(optionTexts.includes('Vanita Gadekar'), 'Faculty dropdown contains Vanita Gadekar');
  assert(optionTexts.includes('Vikas Kadam'), 'Faculty dropdown contains Vikas Kadam');
  assert(!optionTexts.includes('Sarthak Sawant'), 'Faculty dropdown does NOT contain unrelated CS teacher Sarthak Sawant');

  // Check alphabetical sorting
  const teachersOnly = optionTexts.slice(1);
  const sortedCopy = [...teachersOnly].sort((a, b) => a.localeCompare(b));
  const isSorted = teachersOnly.every((t, i) => t === sortedCopy[i]);
  assert(isSorted, `Faculty options are sorted alphabetically: ${teachersOnly.join(' -> ')}`);

  // Check no duplicates
  const uniqueCount = new Set(optionTexts).size;
  assert(uniqueCount === optionTexts.length, 'Zero duplicate faculty names in dropdown');

  console.log('\n--- 4. Interactive Faculty Filtering & Empty State Handling ---');
  // Initial total logs
  const initialLogCount = await evalInPage(`document.querySelectorAll('#attendanceLogsTbody tr').length`);
  assert(initialLogCount > 0, `Initial load renders attendance session logs (${initialLogCount} logs)`);

  // Select faculty with records: "Rohini Rankhamb"
  await evalInPage(`{
    const sel = document.getElementById('filterLogFaculty');
    sel.value = 'Rohini Rankhamb';
    sel.dispatchEvent(new Event('change'));
  }`);
  await sleep(300);

  const rohiniFilteredCount = await evalInPage(`document.querySelectorAll('#attendanceLogsTbody tr').length`);
  assert(rohiniFilteredCount > 0, `Filtering by "Rohini Rankhamb" displays matching logs (${rohiniFilteredCount})`);

  // Select faculty with ZERO records: "Vikas Kadam"
  await evalInPage(`{
    const sel = document.getElementById('filterLogFaculty');
    sel.value = 'Vikas Kadam';
    sel.dispatchEvent(new Event('change'));
  }`);
  await sleep(300);

  const emptyText = await evalInPage(`document.querySelector('#attendanceLogsTbody td')?.textContent.trim()`);
  assert(emptyText.includes('No attendance records found for the selected filters'), `Shows expected empty state: "${emptyText}"`);

  // Verify faculty dropdown does NOT shrink or remove Vikas Kadam!
  const optionsAfterEmptyFilter = await evalInPage(`
    Array.from(document.querySelectorAll('#filterLogFaculty option')).map(o => o.textContent.trim())
  `);
  assert(optionsAfterEmptyFilter.length === dropdownOptions.length, `Faculty dropdown options count unchanged (${optionsAfterEmptyFilter.length})`);
  assert(optionsAfterEmptyFilter.includes('Vikas Kadam'), 'Vikas Kadam remains in dropdown after producing empty records');
  assert(optionsAfterEmptyFilter.includes('Rohini Rankhamb'), 'Rohini Rankhamb remains in dropdown');

  console.log('\n--- 5. Independent Multi-Filter Verification (Options Do NOT Shrink) ---');
  // Select Semester filter
  await evalInPage(`{
    const sem = document.getElementById('filterLogSemester');
    if (sem) {
      sem.value = '5';
      sem.dispatchEvent(new Event('change'));
    }
  }`);
  await sleep(200);

  let opts = await evalInPage(`Array.from(document.querySelectorAll('#filterLogFaculty option')).length`);
  assert(opts === dropdownOptions.length, `Faculty options do NOT shrink when Semester is selected (${opts} options)`);

  // Select Course filter
  await evalInPage(`{
    const crs = document.getElementById('filterLogCourse');
    if (crs && crs.options.length > 1) {
      crs.selectedIndex = 1;
      crs.dispatchEvent(new Event('change'));
    }
  }`);
  await sleep(200);

  opts = await evalInPage(`Array.from(document.querySelectorAll('#filterLogFaculty option')).length`);
  assert(opts === dropdownOptions.length, `Faculty options do NOT shrink when Course is selected (${opts} options)`);

  // Select Date filter
  await evalInPage(`{
    const dt = document.getElementById('filterLogDate');
    if (dt) {
      dt.value = '2026-09-15';
      dt.dispatchEvent(new Event('input'));
    }
  }`);
  await sleep(200);

  opts = await evalInPage(`Array.from(document.querySelectorAll('#filterLogFaculty option')).length`);
  assert(opts === dropdownOptions.length, `Faculty options do NOT shrink when Date is selected (${opts} options)`);

  // Revert / Clear filters
  await evalInPage(`{
    document.getElementById('btnClearLogFilters')?.click();
  }`);
  await sleep(300);

  const restoredLogCount = await evalInPage(`document.querySelectorAll('#attendanceLogsTbody tr').length`);
  assert(restoredLogCount === initialLogCount, `Clearing filters restores all initial logs (${restoredLogCount} records)`);

  const restoredFacultyVal = await evalInPage(`document.getElementById('filterLogFaculty').value`);
  assert(restoredFacultyVal === '', 'Filter dropdown reverted to "All Faculty"');

  // Close Chrome
  ws.close();
  chromeProc.kill();
  if (fs.existsSync(userDataDir)) {
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  }

  // Close server and pool
  server.close();
  await pool.end();

  console.log('\n=================================================================');
  console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal error during test run:', err);
  if (server) server.close();
  pool.end();
  process.exit(1);
});
