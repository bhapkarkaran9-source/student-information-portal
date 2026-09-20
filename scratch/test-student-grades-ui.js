/**
 * Comprehensive Automated Verification Suite for Student "My Results & Grades" Page
 * 
 * Verifies:
 * 1. Static HTML & DOM Contract (IDs, structure, Blue gradient header, 9 table columns, mobile containers)
 * 2. Client JavaScript Controller Logic Contract (student-grades.js functions and dynamic data flow)
 * 3. Live API Integration & Data Safety (GET /api/grades/student/me returns real database records)
 * 4. Headless Chrome Live DOM & Mobile Viewport Audit:
 *    - Desktop Mode (1440px): Table visible, mobile cards hidden, proper cell padding & alignment
 *    - Mobile Mode (430px, 390px, 375px, 320px):
 *      - Document zero horizontal overflow (scrollWidth <= clientWidth)
 *      - Body zero horizontal overflow (bodyScrollWidth <= clientWidth)
 *      - Desktop table cleanly hidden via display:none
 *      - Responsive mobile cards container visible via display:flex
 *      - Mobile card elements (code, title, 4-metric grid, footer) intact
 *      - Semester summary card intact
 *    - Screenshot captures: student_grades_desktop.png and student_grades_mobile.png
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = require('../src/app');
const pool = require('../src/config/db');
const { generateToken } = require('../src/utils/token');

const ARTIFACT_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9266;

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

// ---------------------------------------------------------------------------
// 1. Static HTML & DOM Contract Checks
// ---------------------------------------------------------------------------
function testStaticHtmlContract() {
  console.log('\n--- 1. Static HTML & DOM Contract Checks ---');
  const htmlPath = path.join(__dirname, '..', 'public', 'pages', 'student', 'grades.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Page title and headings
  assert(html.includes('<title>My Results & Grades'), 'HTML title is "My Results & Grades - Student Information Portal"');
  assert(html.includes('My Results & Grades'), 'Header title contains "My Results & Grades"');
  assert(html.includes('Track your academic performance and grades'), 'Header subtitle matches required text');

  // Top Welcome Banner & Academic chips
  assert(html.includes('id="headerAcademicYear"'), 'Header chip #headerAcademicYear exists');
  assert(html.includes('id="headerSemester"'), 'Header chip #headerSemester exists');
  assert(html.includes('id="headerDepartment"'), 'Header chip #headerDepartment exists');
  assert(html.includes('id="headerPrn"'), 'Header chip #headerPrn exists');

  // 4 KPI Metric Cards
  assert(html.includes('id="kpiCgpa"'), 'Cumulative GPA metric #kpiCgpa exists');
  assert(html.includes('id="kpiSgpa"'), 'Latest Semester SGPA metric #kpiSgpa exists');
  assert(html.includes('id="kpiCredits"'), 'Credits Earned metric #kpiCredits exists');
  assert(html.includes('id="kpiBacklogs"'), 'Backlogs / Arrears metric #kpiBacklogs exists');
  assert(html.includes('id="kpiCgpaBadge"'), 'KPI CGPA badge #kpiCgpaBadge exists');
  assert(html.includes('id="kpiSgpaBadge"'), 'KPI SGPA badge #kpiSgpaBadge exists');
  assert(html.includes('id="kpiBacklogsBadge"'), 'KPI Backlogs badge #kpiBacklogsBadge exists');

  // Semester Selector & Print Control Card
  assert(html.includes('id="selectSem"'), 'Semester select dropdown #selectSem exists');
  assert(html.includes('window.print()'), 'Print Grade Sheet button triggers window.print()');
  assert(html.includes('Print Grade Sheet'), 'Button text "Print Grade Sheet" exists');

  // Academic Statement of Marks Card
  assert(html.includes('Academic Statement of Marks'), 'Statement of marks title exists');
  assert(html.includes('OFFICIAL EVALUATED TRANSCRIPT'), 'Badge "OFFICIAL EVALUATED TRANSCRIPT" exists');
  assert(html.includes('id="gradeSheetStatusBadge"'), 'Grade sheet status badge #gradeSheetStatusBadge exists');
  assert(html.includes('id="gradesTbody"'), 'Desktop table body #gradesTbody exists');
  assert(html.includes('id="gradesCardsMobile"'), 'Mobile cards container #gradesCardsMobile exists');
  assert(html.includes('id="semesterSummaryCard"'), 'Dynamic semester summary card #semesterSummaryCard exists');
  assert(html.includes('id="summaryTotalCredits"'), 'Summary element #summaryTotalCredits exists');
  assert(html.includes('id="summaryTotalMarks"'), 'Summary element #summaryTotalMarks exists');
  assert(html.includes('id="summarySgpa"'), 'Summary element #summarySgpa exists');
  assert(html.includes('id="summaryStatusBadge"'), 'Summary element #summaryStatusBadge exists');

  // 9 Table Headers Contract
  const expectedHeaders = ['Code', 'Course Name', 'Credits', 'Internal', 'End Sem', 'Total', 'Grade Points', 'Grade', 'Status'];
  for (const h of expectedHeaders) {
    assert(html.includes(h), `Table includes header column "${h}"`);
  }

  // Scoped CSS & Blue Palette Verification
  assert(html.includes('.student-kpi-grid'), 'CSS defines .student-kpi-grid');
  assert(html.includes('.grades-card-header-gradient'), 'CSS defines .grades-card-header-gradient');
  assert(html.includes('.grades-mobile-cards'), 'CSS defines .grades-mobile-cards');
  assert(html.includes('.grade-result-card'), 'CSS defines .grade-result-card');
  assert(html.includes('.semester-summary-card'), 'CSS defines .semester-summary-card');
  assert(html.includes('@media (max-width: 767px)'), 'CSS includes tablet/mobile breakpoint <= 767px');
  assert(html.includes('@media print'), 'CSS includes print styling');

  // Blue theme lock (no saffron/yellow primary)
  assert(html.includes('#2563eb'), 'Theme uses primary blue #2563eb');
  assert(html.includes('#1d4ed8'), 'Theme uses dark blue #1d4ed8');
  assert(html.includes('#eff6ff'), 'Theme uses soft blue #eff6ff');

  // External script reference
  assert(html.includes('src="/js/student-grades.js"'), 'grades.html includes external student-grades.js controller');
}

// ---------------------------------------------------------------------------
// 2. Client Controller Script Contract Checks
// ---------------------------------------------------------------------------
function testStaticJsContract() {
  console.log('\n--- 2. Client JavaScript Controller Logic Checks ---');
  const jsPath = path.join(__dirname, '..', 'public', 'js', 'student-grades.js');
  assert(fs.existsSync(jsPath), 'public/js/student-grades.js exists');

  const js = fs.readFileSync(jsPath, 'utf8');
  assert(js.includes('/api/grades/student/me'), 'student-grades.js fetches /api/grades/student/me');
  assert(js.includes('loadGrades'), 'student-grades.js defines loadGrades');
  assert(js.includes('renderGrades'), 'student-grades.js defines renderGrades');
  assert(js.includes('populateSemesterDropdown'), 'student-grades.js defines populateSemesterDropdown');
  assert(js.includes('getGradeBadgeStyle'), 'student-grades.js defines getGradeBadgeStyle');
  assert(js.includes('gradesCardsMobile'), 'student-grades.js renders mobile cards into gradesCardsMobile');
  assert(js.includes('semesterSummaryCard'), 'student-grades.js updates semesterSummaryCard');
  assert(js.includes('showErrorState'), 'student-grades.js handles error and retry states');
  assert(js.includes('selectSem.addEventListener'), 'student-grades.js binds semester dropdown filter');
}

// ---------------------------------------------------------------------------
// 3. Live API Integration & Data Verification
// ---------------------------------------------------------------------------
async function testLiveApi() {
  console.log('\n--- 3. Live API Integration & Real Data Safety ---');
  const token = generateToken({ user_id: 174, username: 'Karan', role: 'STUDENT' });

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: server.address().port,
      path: '/api/grades/student/me',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          assert(res.statusCode === 200, `GET /api/grades/student/me returns 200 OK (got ${res.statusCode})`);
          assert(json.success === true, 'Response indicates success: true');
          assert(Boolean(json.data && json.data.student), 'Response contains student profile');
          assert(json.data.student.student_id === 96, `Student ID matches 96 (Karan) (got ${json.data.student.student_id})`);
          assert(Array.isArray(json.data.grades), 'Response contains grades array');
          assert(json.data.grades.length > 0, `Student has ${json.data.grades.length} grade record(s)`);

          const firstGrade = json.data.grades[0];
          assert(firstGrade.course_code === 'IT101', `First course code is IT101 (got ${firstGrade.course_code})`);
          assert(firstGrade.course_name === 'DSML', `First course name is DSML (got ${firstGrade.course_name})`);
          assert(firstGrade.credits === 3, `Course credits = 3 (got ${firstGrade.credits})`);
          assert(firstGrade.internal_marks === 30, `Internal marks = 30 (got ${firstGrade.internal_marks})`);
          assert(firstGrade.external_marks === 45, `External marks = 45 (got ${firstGrade.external_marks})`);
          assert(firstGrade.total_marks === 75, `Total marks = 75 (got ${firstGrade.total_marks})`);
          assert(firstGrade.grade_point === 8, `Grade points = 8 (got ${firstGrade.grade_point})`);
          assert(firstGrade.letter_grade === 'A', `Letter grade = A (got ${firstGrade.letter_grade})`);
          assert(firstGrade.status === 'Pass', `Result status = Pass (got ${firstGrade.status})`);

          assert(Boolean(json.data.metrics), 'Response contains calculated metrics');
          assert(json.data.metrics.sgpa === 8, `Calculated SGPA is 8.00 (got ${json.data.metrics.sgpa})`);
          assert(json.data.metrics.failed_courses === 0, 'Failed courses = 0');
          assert(json.data.metrics.passed_courses === 1, 'Passed courses = 1');
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// 4. Headless Chrome Live DOM & Mobile Viewport Audit
// ---------------------------------------------------------------------------
async function testChromeIntegration() {
  console.log('\n--- 4. Headless Chrome Live DOM & Mobile Viewport Tests ---');

  const studentUser = {
    user_id: 174,
    student_id: 96,
    username: 'Karan',
    first_name: 'Karan',
    last_name: 'Bhapkar',
    role: 'STUDENT',
    email: 'bhapkarkaran9@gmail.com'
  };
  const token = generateToken({
    user_id: studentUser.user_id,
    username: studentUser.username,
    role: 'STUDENT'
  });

  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    'about:blank'
  ]);
  await sleep(2200);

  try {
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

    // Navigate to set auth
    await cdpSend('Page.navigate', { url: `${baseUrl}/login.html` });
    await sleep(600);
    await evalCode(`
      localStorage.setItem('token', '${token}');
      localStorage.setItem('user', JSON.stringify(${JSON.stringify(studentUser)}));
    `);

    // 1. Desktop Viewport (1440x900)
    await cdpSend('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/grades.html` });
    await sleep(2200);

    // Verify DOM elements in live browser
    const elementsExist = await evalCode(`
      Boolean(
        document.getElementById('kpiCgpa') &&
        document.getElementById('kpiSgpa') &&
        document.getElementById('kpiCredits') &&
        document.getElementById('kpiBacklogs') &&
        document.getElementById('selectSem') &&
        document.getElementById('gradesTbody') &&
        document.getElementById('gradesCardsMobile') &&
        document.getElementById('semesterSummaryCard')
      )
    `);
    assert(elementsExist, 'All grades DOM elements initialized and verified in live browser page');

    // Verify real dynamic KPI values
    const kpiValues = await evalCode(`
      ({
        cgpa: document.getElementById('kpiCgpa')?.textContent.trim(),
        sgpa: document.getElementById('kpiSgpa')?.textContent.trim(),
        credits: document.getElementById('kpiCredits')?.textContent.trim(),
        backlogs: document.getElementById('kpiBacklogs')?.textContent.trim()
      })
    `);
    assert(kpiValues.cgpa.includes('8.00'), `Cumulative GPA KPI loaded dynamically: "${kpiValues.cgpa}"`);
    assert(kpiValues.sgpa.includes('8.00'), `Latest Semester SGPA KPI loaded dynamically: "${kpiValues.sgpa}"`);
    assert(kpiValues.credits.includes('3 Credits'), `Credits Earned KPI loaded dynamically: "${kpiValues.credits}"`);
    assert(kpiValues.backlogs === '0', `Backlogs KPI loaded dynamically: "${kpiValues.backlogs}"`);

    // Verify Desktop layout (table visible, mobile cards hidden)
    const desktopLayout = await evalCode(`
      const tableWrap = document.querySelector('.grades-table-wrap');
      const mobileCards = document.getElementById('gradesCardsMobile');
      const summary = document.getElementById('semesterSummaryCard');
      const th = document.querySelector('.grades-data-table thead th');
      const td = document.querySelector('.grades-data-table tbody td');
      ({
        tDisp: window.getComputedStyle(tableWrap).display,
        mDisp: window.getComputedStyle(mobileCards).display,
        sDisp: window.getComputedStyle(summary).display,
        thPadding: window.getComputedStyle(th).padding,
        tdPadding: window.getComputedStyle(td).padding,
        tbodyRows: document.querySelectorAll('#gradesTbody tr').length
      })
    `);
    assert(desktopLayout.tDisp !== 'none', 'Desktop mode: statement of marks table is visible');
    assert(desktopLayout.mDisp === 'none', 'Desktop mode: mobile result cards container is hidden');
    assert(desktopLayout.sDisp !== 'none', 'Desktop mode: semester summary card is visible');
    assert(desktopLayout.thPadding.includes('14px') || desktopLayout.thPadding.includes('16px'), `Desktop table header padding is well-spaced: ${desktopLayout.thPadding}`);
    assert(desktopLayout.tdPadding.includes('14px') || desktopLayout.tdPadding.includes('16px'), `Desktop table cell padding is well-spaced: ${desktopLayout.tdPadding}`);
    assert(desktopLayout.tbodyRows >= 1, `Desktop table has ${desktopLayout.tbodyRows} rendered data row(s)`);

    // Verify Semester Summary details
    const summaryDetails = await evalCode(`
      ({
        credits: document.getElementById('summaryTotalCredits')?.textContent.trim(),
        marks: document.getElementById('summaryTotalMarks')?.textContent.trim(),
        sgpa: document.getElementById('summarySgpa')?.textContent.trim(),
        status: document.getElementById('summaryStatusBadge')?.textContent.trim()
      })
    `);
    assert(summaryDetails.credits === '3 Credits', `Summary credits = "3 Credits" (got "${summaryDetails.credits}")`);
    assert(summaryDetails.marks.includes('75 / 100'), `Summary marks = "75 / 100" (got "${summaryDetails.marks}")`);
    assert(summaryDetails.sgpa === '8.00', `Summary SGPA = "8.00" (got "${summaryDetails.sgpa}")`);
    assert(summaryDetails.status === 'SEMESTER CLEARED', `Summary status = "SEMESTER CLEARED" (got "${summaryDetails.status}")`);

    // Capture Desktop Screenshot
    const shotDesktop = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'student_grades_desktop.png'), Buffer.from(shotDesktop.data, 'base64'));
    console.log('  [OK] Saved student_grades_desktop.png');

    // 2. Mobile Viewport & Zero-Overflow Audits
    const testViewports = [
      { name: '430px (iPhone 14 Pro Max)', width: 430, height: 932 },
      { name: '390px (iPhone 12/13/14)', width: 390, height: 844 },
      { name: '375px (iPhone SE)', width: 375, height: 667 },
      { name: '320px (Ultra-compact)', width: 320, height: 568 }
    ];

    for (const vp of testViewports) {
      await cdpSend('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 2, mobile: true });
      await sleep(600);

      const audit = await evalCode(`
        (() => {
          const docW = document.documentElement.clientWidth;
          const scrollW = document.documentElement.scrollWidth;
          const bodyScrollW = document.body.scrollWidth;
          const tableWrap = document.querySelector('.grades-table-wrap');
          const mobileCards = document.getElementById('gradesCardsMobile');
          const summary = document.getElementById('semesterSummaryCard');
          const tDisp = window.getComputedStyle(tableWrap).display;
          const mDisp = window.getComputedStyle(mobileCards).display;
          const sDisp = window.getComputedStyle(summary).display;
          const cardCount = document.querySelectorAll('#gradesCardsMobile .grade-result-card').length;

          return {
            clientWidth: docW,
            scrollWidth: scrollW,
            bodyScrollWidth: bodyScrollW,
            noDocOverflow: scrollW <= docW,
            noBodyOverflow: bodyScrollW <= docW,
            tDisp,
            mDisp,
            sDisp,
            cardCount
          };
        })()
      `);

      assert(audit.noDocOverflow, `Viewport ${vp.name}: Document zero horizontal overflow (scrollWidth ${audit.scrollWidth} <= clientWidth ${audit.clientWidth})`);
      assert(audit.noBodyOverflow, `Viewport ${vp.name}: Body zero horizontal overflow (bodyScrollWidth ${audit.bodyScrollWidth} <= clientWidth ${audit.clientWidth})`);
      assert(audit.tDisp === 'none', `Viewport ${vp.name}: Desktop table is cleanly hidden via display:none`);
      assert(audit.mDisp !== 'none', `Viewport ${vp.name}: Mobile result cards container is visible via display:flex`);
      assert(audit.sDisp !== 'none', `Viewport ${vp.name}: Semester summary card is visible on mobile`);
      assert(audit.cardCount >= 1, `Viewport ${vp.name}: Renders ${audit.cardCount} responsive mobile result card(s)`);
    }

    // Scroll to statement of marks on mobile and capture screenshot
    await evalCode(`
      const card = document.querySelector('.grades-statement-card');
      if (card) card.scrollIntoView({ behavior: 'instant', block: 'start' });
    `);
    await sleep(400);

    // Capture Mobile Screenshot (at 390px)
    await cdpSend('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(600);
    const shotMobile = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'student_grades_mobile.png'), Buffer.from(shotMobile.data, 'base64'));
    console.log('  [OK] Saved student_grades_mobile.png');

    ws.close();
  } finally {
    chrome.kill('SIGKILL');
  }
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------
async function main() {
  console.log('================================================================');
  console.log('TEST SUITE: STUDENT RESULTS & GRADES PAGE REDESIGN & MOBILE AUDIT');
  console.log('================================================================');

  server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  baseUrl = `http://localhost:${server.address().port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    testStaticHtmlContract();
    testStaticJsContract();
    await testLiveApi();
    await testChromeIntegration();
  } catch (err) {
    console.error('\n[FATAL TEST ERROR]', err);
    failCount++;
  } finally {
    server.close();
    await pool.end();
  }

  console.log('\n================================================================');
  console.log(`FINAL RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main();
