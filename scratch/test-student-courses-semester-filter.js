/**
 * Verification test for Student My Courses / Enrollment Semester Filter
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const app = require('../src/app');
const pool = require('../src/config/db');
const { generateToken } = require('../src/utils/token');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9274;

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
  console.log('STUDENT MY COURSES / ENROLLMENT SEMESTER FILTER TEST');
  console.log('=================================================================\n');

  // Start HTTP server on random free port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  // Query a 5th semester student from database
  const [students] = await pool.query(`
    SELECT s.student_id, s.semester, s.user_id, u.username, u.email, u.first_name, u.last_name, r.role_name as role
    FROM students s
    JOIN users u ON s.user_id = u.user_id
    JOIN roles r ON u.role_id = r.role_id
    WHERE s.semester = 5
    LIMIT 1
  `);

  if (!students || students.length === 0) {
    throw new Error('No semester 5 student found in database for testing');
  }

  const student = students[0];
  const token = generateToken({
    user_id: student.user_id,
    username: student.username,
    email: student.email,
    role: student.role
  });

  console.log(`Testing with student: ${student.first_name} ${student.last_name} (Semester ${student.semester})\n`);

  // Launch headless Chrome
  const userDataDir = path.join(__dirname, 'chrome-courses-sem-test');
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
    console.error('Failed to connect to Chrome CDP.');
    if (chromeProc) chromeProc.kill();
    if (server) server.close();
    process.exit(1);
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

  // Pre-seed localStorage with authenticated student credentials
  await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/courses.html` });
  await sleep(1000);

  await evalInPage(`
    localStorage.setItem('token', '${token}');
    localStorage.setItem('user', JSON.stringify({
      user_id: ${student.user_id},
      username: '${student.username}',
      email: '${student.email}',
      first_name: '${student.first_name}',
      last_name: '${student.last_name}',
      role: 'STUDENT',
      semester: ${student.semester}
    }));
  `);

  // Reload page so requireAuth and student shell pick up credentials
  await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/courses.html` });
  await sleep(1500);

  console.log('--- Test 1: Dropdown Options Verification ---');
  const options = await evalInPage(`
    Array.from(document.querySelectorAll('#semesterFilter option')).map(o => ({
      value: o.value,
      text: o.textContent.trim(),
      selected: o.selected
    }))
  `);

  assert(Array.isArray(options), 'Found #semesterFilter options in DOM');
  assert(options.length === 9, `Expected exactly 9 options in #semesterFilter, got ${options.length}`);

  const expectedLabels = [
    'All Semesters',
    'Semester I',
    'Semester II',
    'Semester III',
    'Semester IV',
    'Semester V',
    'Semester VI',
    'Semester VII',
    'Semester VIII'
  ];

  const actualLabels = options.map(o => o.text);
  expectedLabels.forEach((label, idx) => {
    assert(actualLabels[idx] === label, `Option ${idx + 1} is "${label}" (got: "${actualLabels[idx]}")`);
  });

  console.log('\n--- Test 2: Fixed Options Are NOT Limited By Student Semester ---');
  assert(actualLabels.includes('Semester I'), 'Dropdown contains Semester I for a 5th-semester student');
  assert(actualLabels.includes('Semester II'), 'Dropdown contains Semester II for a 5th-semester student');
  assert(actualLabels.includes('Semester III'), 'Dropdown contains Semester III for a 5th-semester student');
  assert(actualLabels.includes('Semester IV'), 'Dropdown contains Semester IV for a 5th-semester student');
  assert(actualLabels.includes('Semester V'), 'Dropdown contains Semester V for a 5th-semester student');
  assert(actualLabels.includes('Semester VI'), 'Dropdown contains Semester VI for a 5th-semester student');
  assert(actualLabels.includes('Semester VII'), 'Dropdown contains Semester VII for a 5th-semester student');
  assert(actualLabels.includes('Semester VIII'), 'Dropdown contains Semester VIII for a 5th-semester student');

  console.log('\n--- Test 3: Default Selection & Initial Course Loading ---');
  const initialValue = await evalInPage(`document.getElementById('semesterFilter').value`);
  assert(initialValue === 'all', `Default filter selection is "all" (got: "${initialValue}")`);

  const initialCount = await evalInPage(`document.querySelectorAll('.course-card').length`);
  const visibleCountBadge = await evalInPage(`document.getElementById('visibleCourseCount').textContent.trim()`);
  assert(initialCount > 0, `Initial load renders all enrolled courses (count: ${initialCount})`);
  assert(visibleCountBadge === String(initialCount), `visibleCourseCount matches rendered count (${visibleCountBadge})`);

  console.log('\n--- Test 4: Filter By Semester V (Current Student Semester) ---');
  await evalInPage(`{
    const sel = document.getElementById('semesterFilter');
    sel.value = '5';
    sel.dispatchEvent(new Event('change'));
  }`);
  await sleep(300);

  const sem5Count = await evalInPage(`document.querySelectorAll('.course-card').length`);
  const sem5Badge = await evalInPage(`document.getElementById('visibleCourseCount').textContent.trim()`);
  assert(sem5Count === initialCount, `Selecting Semester V retains the student's 5th-semester courses (${sem5Count})`);
  assert(sem5Badge === String(sem5Count), `visibleCourseCount badge updated correctly for Semester V (${sem5Badge})`);

  console.log('\n--- Test 5: Filter By Semester I (Empty State) ---');
  await evalInPage(`{
    const sel = document.getElementById('semesterFilter');
    sel.value = '1';
    sel.dispatchEvent(new Event('change'));
  }`);
  await sleep(300);

  const sem1Count = await evalInPage(`document.querySelectorAll('.course-card').length`);
  const sem1Badge = await evalInPage(`document.getElementById('visibleCourseCount').textContent.trim()`);
  const emptyStateHeader = await evalInPage(`document.querySelector('.empty-state-card h3')?.textContent.trim()`);
  assert(sem1Count === 0, `Selecting Semester I filters out 5th-semester courses (count: 0)`);
  assert(sem1Badge === '0', `visibleCourseCount badge shows 0 (got: ${sem1Badge})`);
  assert(emptyStateHeader === 'No Enrolled Courses Found', `Empty state message displayed ("${emptyStateHeader}")`);

  console.log('\n--- Test 6: Reverting To "All Semesters" Restores All Courses ---');
  await evalInPage(`{
    const sel = document.getElementById('semesterFilter');
    sel.value = 'all';
    sel.dispatchEvent(new Event('change'));
  }`);
  await sleep(300);

  const restoredCount = await evalInPage(`document.querySelectorAll('.course-card').length`);
  const restoredBadge = await evalInPage(`document.getElementById('visibleCourseCount').textContent.trim()`);
  assert(restoredCount === initialCount, `Reverting to All Semesters restores courses (${restoredCount})`);
  assert(restoredBadge === String(restoredCount), `visibleCourseCount badge restored (${restoredBadge})`);

  console.log('\n--- Test 7: Combined Search & Semester Filter ---');
  const firstCourseCode = await evalInPage(`document.querySelector('.course-card .badge')?.textContent.trim()`);
  await evalInPage(`{
    const search = document.getElementById('courseSearch');
    search.value = '${firstCourseCode}';
    search.dispatchEvent(new Event('input'));
  }`);
  await sleep(300);

  const searchFilteredCount = await evalInPage(`document.querySelectorAll('.course-card').length`);
  assert(searchFilteredCount >= 1, `Course code search filtered successfully (${searchFilteredCount} matches)`);

  // Clear search
  await evalInPage(`{
    const search = document.getElementById('courseSearch');
    search.value = '';
    search.dispatchEvent(new Event('input'));
  }`);
  await sleep(300);

  console.log('\n--- Test 8: Current-Semester KPI Card Information Intact ---');
  const kpiTerm = await evalInPage(`document.getElementById('kpiAcademicTerm')?.textContent.trim()`);
  const kpiYear = await evalInPage(`document.getElementById('kpiTermYear')?.textContent.trim()`);
  assert(Boolean(kpiTerm), `Academic Term KPI card is present and populated (${kpiTerm})`);
  assert(Boolean(kpiYear), `Academic Year KPI card is present and populated (${kpiYear})`);

  // Cleanup Chrome
  ws.close();
  chromeProc.kill();
  if (fs.existsSync(userDataDir)) {
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  }

  // Close HTTP server and DB pool
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

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  if (server) server.close();
  pool.end();
  process.exit(1);
});
