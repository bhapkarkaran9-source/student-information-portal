/**
 * Automated Verification Suite for Student Results / Grades Semester Dropdown
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = require('../src/app');
const pool = require('../src/config/db');
const { generateToken } = require('../src/utils/token');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9278;

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
  console.log('STUDENT GRADES SEMESTER DROPDOWN VERIFICATION SUITE');
  console.log('=================================================================\n');

  // Start HTTP server
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  // Query student 96 (Karan Bhapkar, Semester 5)
  const [students] = await pool.query(`
    SELECT s.student_id, s.department_id, s.semester, s.user_id, u.username, u.email, u.first_name, u.last_name, r.role_name as role, d.department_name
    FROM students s
    JOIN users u ON s.user_id = u.user_id
    JOIN roles r ON u.role_id = r.role_id
    JOIN departments d ON s.department_id = d.department_id
    WHERE s.student_id = 96
    LIMIT 1
  `);

  if (!students.length) {
    throw new Error('Student 96 required for verification');
  }

  const student = students[0];
  console.log(`Testing with student: ${student.first_name} ${student.last_name} (Current Semester: ${student.semester})\n`);

  const token = generateToken({
    user_id: student.user_id,
    username: student.username,
    email: student.email,
    role: student.role
  });

  // Launch Headless Chrome
  const userDataDir = path.join(__dirname, 'chrome-grades-sem-test');
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
    throw new Error('Could not connect to Chrome DevTools Protocol');
  }

  const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json`);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let nextId = 1;
  const cdpSend = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = nextId++;
    const timer = setTimeout(() => reject(new Error(`CDP timeout on ${method}`)), 15000);
    const handler = (evt) => {
      const parsed = JSON.parse(evt.data);
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

  await cdpSend('Page.enable');
  await cdpSend('DOM.enable');
  await cdpSend('Runtime.enable');

  async function evalCode(expr) {
    const res = await cdpSend('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }

  // Setup authentication
  await cdpSend('Page.navigate', { url: `${baseUrl}/login.html` });
  await sleep(600);
  await evalCode(`
    localStorage.setItem('token', '${token}');
    localStorage.setItem('user', JSON.stringify(${JSON.stringify(student)}));
  `);

  // Navigate to Grades page
  await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/grades.html` });
  await sleep(1500);

  // -------------------------------------------------------------------------
  // 1. Verify Exact Dropdown Options
  // -------------------------------------------------------------------------
  console.log('--- 1. Verify Exact Semester Dropdown Options ---');

  const options = await evalCode(`
    Array.from(document.querySelectorAll('#selectSem option')).map(o => ({
      value: o.value,
      text: o.textContent.trim()
    }))
  `);

  console.log('  Loaded dropdown options:', options.map(o => o.text));

  const expectedOptions = [
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

  assert(options.length === 9, `Dropdown contains exactly 9 options (got ${options.length})`);
  const actualOptionTexts = options.map(o => o.text);
  assert(JSON.stringify(actualOptionTexts) === JSON.stringify(expectedOptions), 'Dropdown contains exact expected labels in order');

  // Verify no "(Current)" tag in the options
  const hasCurrentTag = actualOptionTexts.some(t => t.includes('(Current)'));
  assert(!hasCurrentTag, 'Dropdown options do NOT contain "(Current)" tag');

  // Verify student's current semester (5) did NOT restrict options
  assert(actualOptionTexts.includes('Semester I'), 'Semester I is present despite student being in Semester 5');
  assert(actualOptionTexts.includes('Semester VIII'), 'Semester VIII is present despite student being in Semester 5');

  // Verify initial selection defaults to "all" (All Semesters)
  const initialValue = await evalCode(`document.getElementById('selectSem').value`);
  assert(initialValue === 'all', `Default selection is "all" (got "${initialValue}")`);

  // -------------------------------------------------------------------------
  // 2. Test Semester Selections & Filter Behavior
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Test Semester Selections 1 through 8 ---');

  async function selectSemester(val) {
    await evalCode(`(() => {
      const sel = document.getElementById('selectSem');
      sel.value = '${val}';
      sel.dispatchEvent(new Event('change'));
    })()`);
    await sleep(300);
  }

  async function getTableState() {
    return await evalCode(`(() => {
      return {
        rowCount: document.querySelectorAll('#gradesTbody tr').length,
        tbodyText: document.getElementById('gradesTbody').innerText.trim(),
        summaryDisp: window.getComputedStyle(document.getElementById('semesterSummaryCard')).display,
        optionsCount: document.querySelectorAll('#selectSem option').length,
        selectedValue: document.getElementById('selectSem').value
      };
    })()`);
  }

  // 1. Semester I selection
  await selectSemester('1');
  let state = await getTableState();
  assert(state.tbodyText.includes('No results available for Semester I.'), '1. Semester I selection: shows "No results available for Semester I."');
  assert(state.summaryDisp === 'none', '1. Semester I: summary card hidden for empty result');
  assert(state.optionsCount === 9, '1. Semester I: dropdown options count unchanged (9)');

  // 2. Semester II selection
  await selectSemester('2');
  state = await getTableState();
  assert(state.tbodyText.includes('No results available for Semester II.'), '2. Semester II selection: shows "No results available for Semester II."');
  assert(state.optionsCount === 9, '2. Semester II: dropdown options count unchanged (9)');

  // 3. Semester III selection
  await selectSemester('3');
  state = await getTableState();
  assert(state.tbodyText.includes('No results available for Semester III.'), '3. Semester III selection: shows "No results available for Semester III."');
  assert(state.optionsCount === 9, '3. Semester III: dropdown options count unchanged (9)');

  // 4. Semester IV selection
  await selectSemester('4');
  state = await getTableState();
  assert(state.tbodyText.includes('No results available for Semester IV.'), '4. Semester IV selection: shows "No results available for Semester IV."');
  assert(state.optionsCount === 9, '4. Semester IV: dropdown options count unchanged (9)');

  // 5. Semester V selection (Student has real results in Semester 5)
  await selectSemester('5');
  state = await getTableState();
  assert(state.tbodyText.includes('IT101'), '5. Semester V selection: shows course code IT101');
  assert(state.tbodyText.includes('DSML'), '5. Semester V selection: shows course name DSML');
  assert(state.tbodyText.includes('PASS'), '5. Semester V selection: shows PASS status');
  assert(state.summaryDisp !== 'none', '5. Semester V: summary card is visible');
  assert(state.optionsCount === 9, '5. Semester V: dropdown options count unchanged (9)');

  // 6. Semester VI selection
  await selectSemester('6');
  state = await getTableState();
  assert(state.tbodyText.includes('No results available for Semester VI.'), '6. Semester VI selection: shows "No results available for Semester VI."');
  assert(state.optionsCount === 9, '6. Semester VI: dropdown options count unchanged (9)');

  // 7. Semester VII selection
  await selectSemester('7');
  state = await getTableState();
  assert(state.tbodyText.includes('No results available for Semester VII.'), '7. Semester VII selection: shows "No results available for Semester VII."');
  assert(state.optionsCount === 9, '7. Semester VII: dropdown options count unchanged (9)');

  // 8. Semester VIII selection
  await selectSemester('8');
  state = await getTableState();
  assert(state.tbodyText.includes('No results available for Semester VIII.'), '8. Semester VIII selection: shows "No results available for Semester VIII."');
  assert(state.optionsCount === 9, '8. Semester VIII: dropdown options count unchanged (9)');

  // 9. All Semesters selection
  console.log('\n--- 3. Test All Semesters & Zero-Data Behavior ---');
  await selectSemester('all');
  state = await getTableState();
  assert(state.tbodyText.includes('IT101'), '9. All Semesters: shows IT101 grade record');
  assert(state.summaryDisp !== 'none', '9. All Semesters: summary card is visible');
  assert(state.optionsCount === 9, '9. All Semesters: dropdown options count unchanged (9)');

  // 10. Semester with no result data retains selection & options
  await selectSemester('3');
  state = await getTableState();
  assert(state.selectedValue === '3', '10. Semester with no result data (Semester III) remains selected');
  assert(state.optionsCount === 9, '10. Semester with no result data does NOT remove any options from dropdown');
  const optionValues = await evalCode(`Array.from(document.querySelectorAll('#selectSem option')).map(o => o.value)`);
  assert(optionValues.includes('3'), '10. Semester III option remains present in DOM');

  // 11. Clear/reset filter
  console.log('\n--- 4. Test Clear / Reset Filter ---');
  // Click the "Show All Semesters" button rendered in the empty state
  const resetBtnExists = await evalCode(`Boolean(document.querySelector('.btn-reset-sem-filter'))`);
  assert(resetBtnExists, '11. Empty state contains "Show All Semesters" reset button');

  await evalCode(`(() => {
    document.querySelector('.btn-reset-sem-filter')?.click();
  })()`);
  await sleep(300);
  state = await getTableState();
  assert(state.selectedValue === 'all', '11. Reset button sets dropdown value back to "all"');
  assert(state.tbodyText.includes('IT101'), '11. Reset button restores all grades records (IT101 visible)');
  assert(state.summaryDisp !== 'none', '11. Reset button restores semester summary card');

  // -------------------------------------------------------------------------
  // 5. Mobile Cards Viewport Verification
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Mobile Cards Viewport Verification (375px) ---');
  await cdpSend('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await sleep(300);

  // All Semesters mobile card
  const mobileHasCard = await evalCode(`Boolean(document.querySelector('.grade-result-card'))`);
  assert(mobileHasCard, 'Mobile mode: displays .grade-result-card for All Semesters');

  // Switch to empty semester in mobile
  await selectSemester('2');
  const mobileEmptyState = await evalCode(`document.getElementById('gradesCardsMobile').innerText.trim()`);
  assert(mobileEmptyState.includes('No results available for Semester II.'), 'Mobile mode: displays "No results available for Semester II."');

  // Reset in mobile
  await evalCode(`(() => {
    document.querySelector('#gradesCardsMobile .btn-reset-sem-filter')?.click();
  })()`);
  await sleep(300);
  const mobileRestored = await evalCode(`Boolean(document.querySelector('.grade-result-card'))`);
  assert(mobileRestored, 'Mobile mode: reset button restores grade card');

  // Close chrome and server
  try { ws.close(); } catch (e) {}
  try { chromeProc.kill(); } catch (e) {}
  server.close();

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
  console.error('Test execution failed:', err);
  if (server) server.close();
  process.exit(1);
});
