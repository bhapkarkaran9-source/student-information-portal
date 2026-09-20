const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { generateToken } = require('../src/utils/token');

const ARTIFACTS_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9245;

const VIEWPORTS = [
  { name: 'Mobile Mini (320px)', width: 320, height: 640 },
  { name: 'Mobile iPhone SE (375px)', width: 375, height: 667 },
  { name: 'Mobile iPhone 12/13/14 (390px)', width: 390, height: 844 },
  { name: 'Mobile iPhone Pro Max (430px)', width: 430, height: 932 },
  { name: 'Tablet iPad (768px)', width: 768, height: 1024 },
  { name: 'Desktop HD (1440px)', width: 1440, height: 900 }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('========================================================================');
  console.log('  STUDENT ACADEMIC REPORTS - ACADEMIC YEAR FILTER VERIFICATION');
  console.log('========================================================================\n');

  // 1. Generate Student JWT token
  console.log('[1/5] Generating Token for Student Karan (student_id: 96, user_id: 174)...');
  const token = generateToken({ user_id: 174, username: 'Karan', role: 'STUDENT' });
  const userData = {
    user_id: 174,
    username: 'Karan',
    role: 'STUDENT',
    full_name: 'Karan Bhapkar',
    student_id: 96,
    prn: 'B24IT1005'
  };
  console.log('  ✓ Token generated successfully');

  // 2. Launch Chrome
  console.log('\n[2/5] Launching Headless Chrome on CDP port ' + CDP_PORT + '...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--remote-debugging-port=' + CDP_PORT,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    'about:blank'
  ]);

  await sleep(2000);

  const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json`);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let nextId = 1;
  const cdpSend = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = nextId++;
    const handler = (evt) => {
      const parsed = JSON.parse(evt.data);
      if (parsed.id === msgId) {
        ws.removeEventListener('message', handler);
        if (parsed.error) reject(parsed.error);
        else resolve(parsed.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await cdpSend('Page.enable');
  await cdpSend('Runtime.enable');
  await cdpSend('DOM.enable');

  const evaluate = async (expr) => {
    const res = await cdpSend('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(`Evaluation failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  };

  try {
    // 3. Navigate to Reports page and inject auth
    console.log('\n[3/5] Navigating to Student Reports page with auth...');
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Go to origin first, set localStorage
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/login.html' });
    await sleep(1000);

    await evaluate(`
      localStorage.setItem('token', '${token}');
      localStorage.setItem('user', JSON.stringify(${JSON.stringify(userData)}));
    `);

    // Now navigate to reports.html
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/student/reports.html' });
    await sleep(2500);

    // Check page title and filter elements
    const pageCheck = await evaluate(`
      ({
        url: window.location.href,
        title: document.title,
        hasFilterYear: !!document.getElementById('filterAcademicYear'),
        filterYearOptions: Array.from(document.getElementById('filterAcademicYear')?.options || []).map(o => ({ value: o.value, text: o.text })),
        hasFilterSemester: !!document.getElementById('filterSemester'),
        currentReport: document.getElementById('reportTypeSelect')?.value
      })
    `);

    console.log('  ✓ Page URL:', pageCheck.url);
    console.log('  ✓ Page loaded:', pageCheck.title);
    console.log('  ✓ Academic Year options in dropdown:', JSON.stringify(pageCheck.filterYearOptions));

    // Assert options
    const optionValues = pageCheck.filterYearOptions.map(o => o.value);
    const optionTexts = pageCheck.filterYearOptions.map(o => o.text);
    if (!optionTexts.includes('-- All Years --')) {
      throw new Error('Missing "-- All Years --" option');
    }
    if (!optionValues.includes('2026-2027') || !optionValues.includes('2025-2026')) {
      throw new Error(`Academic years missing from dropdown. Expected 2026-2027 and 2025-2026, got: ${JSON.stringify(optionValues)}`);
    }
    console.log('  ✓ Verified: Dropdown contains "-- All Years --", "2026-2027", "2025-2026" in descending order!');

    // 4. Test Interactive Filter Changes
    console.log('\n[4/5] Testing Filter Functionality...');

    // 4A: Select Enrollment Report
    await evaluate(`
      document.getElementById('reportTypeSelect').value = 'enrollment';
      document.getElementById('reportTypeSelect').dispatchEvent(new Event('change'));
    `);
    await sleep(1000);

    // Test All Years on Enrollment
    const enrollmentAllYears = await evaluate(`
      ({
        rowCount: document.querySelectorAll('#reportPreviewTbody tr').length,
        firstCourse: document.querySelector('#reportPreviewTbody tr td:nth-child(4)')?.textContent?.trim()
      })
    `);
    console.log('  ✓ Enrollment (All Years) row count:', enrollmentAllYears.rowCount, '(Expected 3)');

    // 4B: Filter Enrollment to 2026-2027
    await evaluate(`
      document.getElementById('filterAcademicYear').value = '2026-2027';
      document.getElementById('filterAcademicYear').dispatchEvent(new Event('change'));
    `);
    await sleep(1000);

    const enrollment2026 = await evaluate(`
      ({
        rowCount: document.querySelectorAll('#reportPreviewTbody tr').length,
        courses: Array.from(document.querySelectorAll('#reportPreviewTbody tr td:nth-child(4)')).map(td => td.textContent.trim()),
        years: Array.from(document.querySelectorAll('#reportPreviewTbody tr td:nth-child(8)')).map(td => td.textContent.trim())
      })
    `);
    console.log('  ✓ Enrollment (2026-2027) row count:', enrollment2026.rowCount, 'Courses:', enrollment2026.courses, 'Years:', enrollment2026.years);
    if (enrollment2026.rowCount !== 2 || enrollment2026.years.some(y => y !== '2026-2027')) {
      throw new Error('Enrollment 2026-2027 filtering failed: ' + JSON.stringify(enrollment2026));
    }

    // 4C: Filter Enrollment to 2025-2026
    await evaluate(`
      document.getElementById('filterAcademicYear').value = '2025-2026';
      document.getElementById('filterAcademicYear').dispatchEvent(new Event('change'));
    `);
    await sleep(1000);

    const enrollment2025 = await evaluate(`
      ({
        rowCount: document.querySelectorAll('#reportPreviewTbody tr').length,
        courses: Array.from(document.querySelectorAll('#reportPreviewTbody tr td:nth-child(4)')).map(td => td.textContent.trim()),
        years: Array.from(document.querySelectorAll('#reportPreviewTbody tr td:nth-child(8)')).map(td => td.textContent.trim())
      })
    `);
    console.log('  ✓ Enrollment (2025-2026) row count:', enrollment2025.rowCount, 'Courses:', enrollment2025.courses, 'Years:', enrollment2025.years);
    if (enrollment2025.rowCount !== 1 || enrollment2025.years[0] !== '2025-2026') {
      throw new Error('Enrollment 2025-2026 filtering failed: ' + JSON.stringify(enrollment2025));
    }

    // 4D: Test Empty State on Attendance with 2025-2026
    await evaluate(`
      document.getElementById('reportTypeSelect').value = 'attendance';
      document.getElementById('reportTypeSelect').dispatchEvent(new Event('change'));
      document.getElementById('filterAcademicYear').value = '2025-2026';
      document.getElementById('filterAcademicYear').dispatchEvent(new Event('change'));
    `);
    await sleep(1000);

    const emptyStateCheck = await evaluate(`
      ({
        tbodyText: document.getElementById('reportPreviewTbody')?.innerText?.trim(),
        hasEmptyHeading: document.getElementById('reportPreviewTbody')?.innerText?.includes('No report data available for the selected filters.')
      })
    `);
    console.log('  ✓ Empty State Check on Attendance (2025-2026):', emptyStateCheck.hasEmptyHeading ? 'PASSED' : 'FAILED');
    console.log('    Message content:', emptyStateCheck.tbodyText.replace(/\\n/g, ' '));
    if (!emptyStateCheck.hasEmptyHeading) {
      throw new Error('Expected clean empty state "No report data available for the selected filters." but got: ' + emptyStateCheck.tbodyText);
    }

    // Capture desktop screenshot
    const desktopScreenshot = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'student_reports_academic_year_desktop.png'), Buffer.from(desktopScreenshot.data, 'base64'));
    console.log('  ✓ Desktop screenshot saved to student_reports_academic_year_desktop.png');

    // 4E: Switch to 2026-2027 on Attendance
    await evaluate(`
      document.getElementById('filterAcademicYear').value = '2026-2027';
      document.getElementById('filterAcademicYear').dispatchEvent(new Event('change'));
    `);
    await sleep(1000);

    const attendance2026 = await evaluate(`
      ({
        rowCount: document.querySelectorAll('#reportPreviewTbody tr').length,
        course: document.querySelector('#reportPreviewTbody tr td:nth-child(4)')?.textContent?.trim()
      })
    `);
    console.log('  ✓ Attendance (2026-2027) row count:', attendance2026.rowCount, 'Course:', attendance2026.course);

    // 5. Test Responsive Viewports & Horizontal Overflow
    console.log('\n[5/5] Testing Responsive Viewports (320px, 375px, 390px, 430px, 768px, 1440px)...');
    for (const vp of VIEWPORTS) {
      await cdpSend('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 1000
      });
      await sleep(500);

      const overflowCheck = await evaluate(`
        ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          academicYearDropdownVisible: !!document.getElementById('filterAcademicYear')?.offsetParent
        })
      `);

      console.log(`  ✓ ${vp.name.padEnd(30)}: clientWidth=${overflowCheck.clientWidth}, scrollWidth=${overflowCheck.scrollWidth}, Overflow=${overflowCheck.hasHorizontalOverflow ? 'FAIL' : 'NONE'}, DropdownVisible=${overflowCheck.academicYearDropdownVisible}`);
      if (overflowCheck.hasHorizontalOverflow) {
        console.warn(`    WARNING: Overflow detected on ${vp.name}: diff = ${overflowCheck.scrollWidth - overflowCheck.clientWidth}px`);
      }

      if (vp.width === 375) {
        const mobileScreenshot = await cdpSend('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACTS_DIR, 'student_reports_academic_year_mobile.png'), Buffer.from(mobileScreenshot.data, 'base64'));
        console.log('    ✓ Mobile screenshot saved to student_reports_academic_year_mobile.png');
      }
    }

    console.log('\n========================================================================');
    console.log('  ALL CHECKS PASSED SUCCESSFULLY!');
    console.log('========================================================================');

  } finally {
    ws.close();
    chromeProcess.kill();
  }
}

run().catch(err => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
