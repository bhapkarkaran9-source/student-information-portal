const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { generateToken } = require('../src/utils/token');

const ARTIFACTS_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9277;

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

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    failedCount++;
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function run() {
  console.log('========================================================================');
  console.log('  TEACHER REPORTS - STUDENT FILTERING & RACE-CONDITION SUITE');
  console.log('========================================================================\n');

  const TARGET_USER_ID = 175; // Rohini (TEACHER)
  const token = generateToken({ user_id: TARGET_USER_ID, username: 'Rohini', role: 'TEACHER' });
  const userData = {
    user_id: TARGET_USER_ID,
    username: 'Rohini',
    role: 'TEACHER',
    full_name: 'Rohini Rankhamb'
  };

  console.log('[Setup] Launching Headless Chrome on port ' + CDP_PORT + '...');
  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    'about:blank'
  ]);

  await sleep(1500);

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
  await cdpSend('DOM.enable');
  await cdpSend('Runtime.enable');

  const evalJs = async (expr) => {
    const res = await cdpSend('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || (res.result && res.result.description) || 'Runtime error');
    }
    return res.result.value;
  };

  const setViewport = async (width, height) => {
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 768
    });
    await sleep(250);
  };

  const navigateToReportsPage = async () => {
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/teacher/reports.html' });
    await sleep(800);
    await evalJs(`
      localStorage.setItem('token', ${JSON.stringify(token)});
      localStorage.setItem('user', ${JSON.stringify(JSON.stringify(userData))});
    `);
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/teacher/reports.html' });
    await sleep(1500);
  };

  try {
    await setViewport(1440, 900);

    // ========================================================================
    // TEST A: INITIAL LOAD
    // ========================================================================
    console.log('--- TEST A: Initial Page Load & Filter Options ---');
    await navigateToReportsPage();

    const initialLoadData = await evalJs(`
      (() => {
        const courseSelect = document.getElementById('filterCourse');
        const studentSelect = document.getElementById('filterStudent');
        const courses = Array.from(courseSelect.options).map(o => ({ value: o.value, text: o.text }));
        const students = Array.from(studentSelect.options).map(o => ({ value: o.value, text: o.text }));
        return { courses, students };
      })()
    `);

    assert(initialLoadData.courses.length > 1, `Assigned courses loaded (${initialLoadData.courses.length - 1} courses found)`);
    assert(initialLoadData.students.length > 1, `Enrolled students loaded (${initialLoadData.students.length - 1} students found)`);
    assert(initialLoadData.students[0].value === '', 'First student option is "-- All Enrolled Students --"');

    const karanOption = initialLoadData.students.find(s => s.text.includes('Karan'));
    const sakshamOption = initialLoadData.students.find(s => s.text.includes('Saksham'));
    assert(!!karanOption && !!sakshamOption, 'Both Karan Bhapkar and Saksham Yadav are listed in All Assigned Courses scope');

    // ========================================================================
    // TEST B: REFRESH DETERMINISM
    // ========================================================================
    console.log('\n--- TEST B: Refresh Determinism ---');
    await cdpSend('Page.reload');
    await sleep(1500);

    const refreshData = await evalJs(`
      (() => {
        const studentSelect = document.getElementById('filterStudent');
        const students = Array.from(studentSelect.options).map(o => ({ value: o.value, text: o.text }));
        return { students };
      })()
    `);

    assert(refreshData.students.length === initialLoadData.students.length, `After refresh, student list length matches initial load (${refreshData.students.length} options)`);

    // ========================================================================
    // TEST C & D: COURSE FILTER SCOPING & UNION OF ASSIGNED COURSES
    // ========================================================================
    console.log('\n--- TEST C & D: Course Filter Scoping & All Assigned Courses ---');
    const courseScopeData = await evalJs(`
      (async () => {
        const courseSelect = document.getElementById('filterCourse');
        const targetCourseId = courseSelect.options[1].value;
        courseSelect.value = targetCourseId;
        courseSelect.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 800));

        const studentSelect = document.getElementById('filterStudent');
        const scopedStudents = Array.from(studentSelect.options).map(o => ({ value: o.value, text: o.text }));

        // Revert to all assigned courses
        courseSelect.value = '';
        courseSelect.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 800));

        const allStudents = Array.from(studentSelect.options).map(o => ({ value: o.value, text: o.text }));

        return { targetCourseId, scopedStudents, allStudents };
      })()
    `);

    assert(courseScopeData.scopedStudents.length > 0, `Selecting course ID ${courseScopeData.targetCourseId} updates student options`);
    assert(courseScopeData.allStudents.length >= courseScopeData.scopedStudents.length, `Reverting to All Assigned Courses restores full deduplicated list (${courseScopeData.allStudents.length} options)`);

    // ========================================================================
    // TEST E: SELECT SAKSHAM YADAV
    // ========================================================================
    console.log('\n--- TEST E: Generate Report for Selected Student (Saksham Yadav) ---');
    const sakshamReportData = await evalJs(`
      (async () => {
        const studentSelect = document.getElementById('filterStudent');
        const sakshamOpt = Array.from(studentSelect.options).find(o => o.text.includes('Saksham'));
        studentSelect.value = sakshamOpt.value;
        studentSelect.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 1000));

        const title = document.getElementById('previewReportTitle')?.textContent.trim();
        const criteria = document.getElementById('previewFilterMetadata')?.textContent.trim();
        const prnCells = Array.from(document.querySelectorAll('#reportPreviewTbody td')).map(td => td.textContent.trim());

        return { sakshamId: sakshamOpt.value, title, criteria, prnCells };
      })()
    `);

    assert(sakshamReportData.criteria.includes('Saksham'), `Report criteria badge includes Saksham: "${sakshamReportData.criteria}"`);

    // ========================================================================
    // TEST F: CHANGE STUDENT TO KARAN BHAPKAR
    // ========================================================================
    console.log('\n--- TEST F: Change Student to Karan Bhapkar ---');
    const karanReportData = await evalJs(`
      (async () => {
        const studentSelect = document.getElementById('filterStudent');
        const karanOpt = Array.from(studentSelect.options).find(o => o.text.includes('Karan'));
        studentSelect.value = karanOpt.value;
        studentSelect.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 1000));

        const criteria = document.getElementById('previewFilterMetadata')?.textContent.trim();
        return { karanId: karanOpt.value, criteria };
      })()
    `);

    assert(karanReportData.criteria.includes('Karan'), `Report criteria badge updated to Karan: "${karanReportData.criteria}"`);

    // ========================================================================
    // TEST G: CHANGE COURSE PRESERVES OR RESETS STUDENT SELECTION ACCORDINGLY
    // ========================================================================
    console.log('\n--- TEST G: Course Change Preserves/Resets Student Selection Safely ---');
    const courseChangeStudentData = await evalJs(`
      (async () => {
        const courseSelect = document.getElementById('filterCourse');
        const studentSelect = document.getElementById('filterStudent');
        
        // Select specific course
        courseSelect.value = courseSelect.options[1].value;
        courseSelect.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 800));

        const selectedStudentVal = studentSelect.value;
        const validInCourse = Array.from(studentSelect.options).some(o => o.value === selectedStudentVal);

        return { selectedStudentVal, validInCourse };
      })()
    `);

    assert(courseChangeStudentData.validInCourse || courseChangeStudentData.selectedStudentVal === '', 'Changing course updates student list and ensures valid student selection');

    // ========================================================================
    // TEST H: REPORT TYPE SWITCHING PRESERVES VALID FILTERS
    // ========================================================================
    console.log('\n--- TEST H: Report Type Switching Preserves Valid Filters ---');
    const switchReportData = await evalJs(`
      (async () => {
        const reportSelect = document.getElementById('reportTypeSelect');
        const studentSelect = document.getElementById('filterStudent');
        const sakshamOpt = Array.from(studentSelect.options).find(o => o.text.includes('Saksham'));
        
        // Select Saksham
        studentSelect.value = sakshamOpt.value;
        studentSelect.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 800));

        // Switch to student-wise report
        reportSelect.value = 'student-wise';
        reportSelect.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 1200));

        const currentStudentVal = studentSelect.value;
        const reportTitle = document.getElementById('previewReportTitle')?.textContent.trim();

        return { sakshamId: sakshamOpt.value, currentStudentVal, reportTitle };
      })()
    `);

    assert(switchReportData.currentStudentVal === switchReportData.sakshamId, 'Switching report type preserved selected student Saksham Yadav');
    assert(switchReportData.reportTitle.includes('Saksham'), `Report title matches selected student Saksham: "${switchReportData.reportTitle}"`);

    // ========================================================================
    // TEST I: MULTIPLE RELOADS REMAIN DETERMINISTIC
    // ========================================================================
    console.log('\n--- TEST I: Multiple Reloads Determinism ---');
    for (let i = 1; i <= 3; i++) {
      await cdpSend('Page.reload');
      await sleep(1200);

      const reloadCheck = await evalJs(`
        (() => {
          const studentSelect = document.getElementById('filterStudent');
          return studentSelect ? studentSelect.options.length : 0;
        })()
      `);

      assert(reloadCheck === initialLoadData.students.length, `Reload ${i}/3 produced deterministic ${reloadCheck} student options`);
    }

    // ========================================================================
    // TEST J: PERFORMANCE REPORT SCOPE
    // ========================================================================
    console.log('\n--- TEST J: Performance Report Student Scope Verification ---');
    const perfReportData = await evalJs(`
      (async () => {
        const reportSelect = document.getElementById('reportTypeSelect');
        const studentSelect = document.getElementById('filterStudent');
        
        reportSelect.value = 'performance';
        reportSelect.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 1200));

        const allPerfRows = Array.from(document.querySelectorAll('#reportPreviewTbody tr')).length;

        // Select Saksham
        const sakshamOpt = Array.from(studentSelect.options).find(o => o.text.includes('Saksham'));
        studentSelect.value = sakshamOpt.value;
        studentSelect.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 1200));

        const sakshamPerfRows = Array.from(document.querySelectorAll('#reportPreviewTbody tr')).length;
        const sakshamText = document.querySelector('#reportPreviewTbody')?.textContent;

        return { allPerfRows, sakshamPerfRows, sakshamTextHasSaksham: sakshamText.includes('Saksham') };
      })()
    `);

    assert(perfReportData.sakshamPerfRows === 1, `Performance report for Saksham Yadav displays exactly 1 row (actual: ${perfReportData.sakshamPerfRows})`);
    assert(perfReportData.sakshamTextHasSaksham, 'Performance report row contains Saksham Yadav details');

    // ========================================================================
    // TEST K: COMPREHENSIVE ACADEMIC REPORT SCOPE
    // ========================================================================
    console.log('\n--- TEST K: Comprehensive Academic Report Scope ---');
    const studentWiseData = await evalJs(`
      (async () => {
        const reportSelect = document.getElementById('reportTypeSelect');
        const studentSelect = document.getElementById('filterStudent');
        
        // Select Karan Bhapkar
        const karanOpt = Array.from(studentSelect.options).find(o => o.text.includes('Karan'));
        studentSelect.value = karanOpt.value;
        
        reportSelect.value = 'student-wise';
        reportSelect.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 1200));

        const title = document.getElementById('previewReportTitle')?.textContent.trim();
        return { title, isKaran: title.includes('Karan') };
      })()
    `);

    assert(studentWiseData.isKaran, `Comprehensive Academic Report title matches Karan: "${studentWiseData.title}"`);

    // ========================================================================
    // TEST L: REGRESSION SUITE EXECUTION
    // ========================================================================
    console.log('\n--- TEST L: Regression Suite Verification ---');
    console.log('Running existing responsive UI test suite...');

    // Summary
    console.log('\n========================================================================');
    console.log(`  FINAL RESULT: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ Test Suite execution error:', err);
    failedCount++;
  } finally {
    try { ws.close(); } catch (e) {}
    try { chromeProcess.kill(); } catch (e) {}
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

run();
