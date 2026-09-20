const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = require('../src/config/db');
const { generateToken } = require('../src/utils/token');

const ARTIFACTS_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9268;

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
  console.log('  STUDENT TIMETABLE - DYNAMIC DAY-SPECIFIC DAILY TIMING & KPIS');
  console.log('========================================================================\n');

  // Student credentials
  const TARGET_USER_ID = 174;
  const TARGET_STUDENT_ID = 96;
  const token = generateToken({ user_id: TARGET_USER_ID, username: 'Karan', role: 'STUDENT' });
  const userData = {
    user_id: TARGET_USER_ID,
    username: 'Karan',
    role: 'STUDENT',
    full_name: 'Karan Bhapkar',
    student_id: TARGET_STUDENT_ID,
    prn: 'B24IT1005'
  };

  // Backup existing timetable records for student class
  const [origTimetable] = await pool.query(
    "SELECT * FROM timetable WHERE class_name = 'TY-IT' AND division = '1' AND semester = 5"
  );
  console.log(`[Setup] Backed up ${origTimetable.length} original timetable records for TY-IT Div 1 Sem 5.`);

  // Launch Chrome
  console.log('[Setup] Launching Headless Chrome on CDP port ' + CDP_PORT + '...');
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
  await cdpSend('Runtime.enable');
  await cdpSend('DOM.enable');

  const evaluate = async (expr) => {
    const res = await cdpSend('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(`Evaluation failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  };

  const getKPIValues = async () => {
    return await evaluate(`
      (() => ({
        dailyTiming: document.getElementById('kpiDailyTiming')?.textContent?.trim(),
        timingTrend: document.getElementById('kpiTimingTrend')?.textContent?.trim(),
        weeklyHours: document.getElementById('kpiWeeklyHours')?.textContent?.trim(),
        hoursTrend: document.getElementById('kpiHoursTrend')?.textContent?.trim(),
        totalSubjects: document.getElementById('kpiTotalSubjects')?.textContent?.trim(),
        primaryHall: document.getElementById('kpiPrimaryHall')?.textContent?.trim(),
        hallTrend: document.getElementById('kpiHallTrend')?.textContent?.trim()
      }))()
    `);
  };

  try {
    // -------------------------------------------------------------------------
    // Set viewport & Auth
    // -------------------------------------------------------------------------
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await cdpSend('Page.navigate', { url: 'http://localhost:5000/login.html' });
    await sleep(800);
    await evaluate(`
      localStorage.setItem('token', '${token}');
      localStorage.setItem('user', JSON.stringify(${JSON.stringify(userData)}));
    `);

    // -------------------------------------------------------------------------
    // TEST 1: Monday Schedule (09:00-10:00, 10:15-11:15, 12:00-13:00)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Monday Schedule (09:00-10:00, 10:15-11:15, 12:00-13:00) ---');
    await pool.query("DELETE FROM timetable WHERE class_name = 'TY-IT' AND division = '1' AND semester = 5");
    await pool.query(`
      INSERT INTO timetable (course_id, teacher_id, class_name, division, room_no, academic_year, semester, day_of_week, start_time, end_time)
      VALUES 
        (152, 94, 'TY-IT', '1', 'AC202', '2026-2027', 5, 'Monday', '09:00:00', '10:00:00'),
        (146, 90, 'TY-IT', '1', 'AC102', '2026-2027', 5, 'Monday', '10:15:00', '11:15:00'),
        (146, 90, 'TY-IT', '1', 'AC102', '2026-2027', 5, 'Monday', '12:00:00', '13:00:00')
    `);

    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/student/timetable.html' });
    await sleep(2000);

    // Switch to Week view, click Monday
    await evaluate(`
      document.getElementById('tabBtnWeek')?.click();
      document.querySelector('.day-tab[data-day="Monday"]')?.click();
    `);
    await sleep(500);

    let kpis = await getKPIValues();
    console.log('  KPI Results on Monday:', kpis);

    if (kpis.dailyTiming !== '09:00 AM - 01:00 PM') {
      throw new Error(`Expected Daily Timing '09:00 AM - 01:00 PM', got '${kpis.dailyTiming}'`);
    }
    console.log('  ✓ [PASS] Daily Timing correctly shows MIN(start) to MAX(end) on Monday: 09:00 AM - 01:00 PM');

    if (kpis.weeklyHours !== '3 Hrs') {
      throw new Error(`Expected Weekly Hours '3 Hrs', got '${kpis.weeklyHours}'`);
    }
    console.log('  ✓ [PASS] Weekly Hours correctly sums session durations: 3 Hrs');

    if (!kpis.hoursTrend.includes('3 Scheduled Session')) {
      throw new Error(`Expected '3 Scheduled Sessions', got '${kpis.hoursTrend}'`);
    }
    console.log('  ✓ [PASS] Scheduled Sessions count: 3 Scheduled Sessions');

    if (kpis.totalSubjects !== '2 Courses') {
      throw new Error(`Expected Total Subjects '2 Courses', got '${kpis.totalSubjects}'`);
    }
    console.log('  ✓ [PASS] Total Subjects count unique courses: 2 Courses');

    if (kpis.primaryHall !== 'AC102') {
      throw new Error(`Expected Primary Hall 'AC102', got '${kpis.primaryHall}'`);
    }
    console.log('  ✓ [PASS] Primary Hall shows mode classroom: AC102 (2 of 3 sessions)');

    // -------------------------------------------------------------------------
    // TEST 2: Day-Specific Dynamic Behavior across Monday & Tuesday
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Day-Specific Dynamic Behavior across Monday & Tuesday ---');
    // Monday: 09:00-10:00, 10:15-11:15 (min=09:00, max=11:15)
    // Tuesday: 13:00-14:00 (min=13:00, max=14:00 -> 01:00 PM - 02:00 PM)
    await pool.query("DELETE FROM timetable WHERE class_name = 'TY-IT' AND division = '1' AND semester = 5");
    await pool.query(`
      INSERT INTO timetable (course_id, teacher_id, class_name, division, room_no, academic_year, semester, day_of_week, start_time, end_time)
      VALUES 
        (152, 94, 'TY-IT', '1', 'AC202', '2026-2027', 5, 'Monday', '09:00:00', '10:00:00'),
        (146, 90, 'TY-IT', '1', 'AC202', '2026-2027', 5, 'Monday', '10:15:00', '11:15:00'),
        (146, 90, 'TY-IT', '1', 'AC305', '2026-2027', 5, 'Tuesday', '13:00:00', '14:00:00')
    `);

    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/student/timetable.html' });
    await sleep(2000);

    // Switch to Week view, click Monday
    await evaluate(`
      document.getElementById('tabBtnWeek')?.click();
      document.querySelector('.day-tab[data-day="Monday"]')?.click();
    `);
    await sleep(400);

    kpis = await getKPIValues();
    console.log('  KPI Results on Monday tab:', kpis);
    if (kpis.dailyTiming !== '09:00 AM - 11:15 AM') {
      throw new Error(`Expected Monday Daily Timing '09:00 AM - 11:15 AM', got '${kpis.dailyTiming}'`);
    }
    console.log('  ✓ [PASS] Monday Daily Timing: 09:00 AM - 11:15 AM');

    // Click Tuesday day tab
    await evaluate(`
      document.querySelector('.day-tab[data-day="Tuesday"]')?.click();
    `);
    await sleep(400);

    kpis = await getKPIValues();
    console.log('  KPI Results on Tuesday tab:', kpis);
    if (kpis.dailyTiming !== '01:00 PM - 02:00 PM') {
      throw new Error(`Expected Tuesday Daily Timing '01:00 PM - 02:00 PM', got '${kpis.dailyTiming}'`);
    }
    console.log('  ✓ [PASS] Tuesday Daily Timing dynamically updated: 01:00 PM - 02:00 PM (from 13:00:00 - 14:00:00)');

    if (kpis.weeklyHours !== '3 Hrs') {
      throw new Error(`Expected Weekly Hours '3 Hrs', got '${kpis.weeklyHours}'`);
    }
    console.log('  ✓ [PASS] Weekly Hours remains weekly sum: 3 Hrs');

    // -------------------------------------------------------------------------
    // TEST 3: Strict 24-Hour Time Handling (Database literal 01:00:00 -> 01:00 AM)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Strict 24-Hour Time (Database literal 01:00:00 -> 01:00 AM) ---');
    await pool.query("DELETE FROM timetable WHERE class_name = 'TY-IT' AND division = '1' AND semester = 5 AND day_of_week = 'Tuesday'");
    await pool.query(`
      INSERT INTO timetable (course_id, teacher_id, class_name, division, room_no, academic_year, semester, day_of_week, start_time, end_time)
      VALUES (146, 90, 'TY-IT', '1', 'AC305', '2026-2027', 5, 'Tuesday', '01:00:00', '02:00:00')
    `);

    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/student/timetable.html' });
    await sleep(2000);
    await evaluate(`
      document.getElementById('tabBtnWeek')?.click();
      document.querySelector('.day-tab[data-day="Tuesday"]')?.click();
    `);
    await sleep(400);

    kpis = await getKPIValues();
    console.log('  KPI Results for literal 01:00:00:', kpis);
    if (kpis.dailyTiming !== '01:00 AM - 02:00 AM') {
      throw new Error(`Expected '01:00 AM - 02:00 AM', got '${kpis.dailyTiming}'`);
    }
    console.log('  ✓ [PASS] Strict 24-hour display without AM/PM guessing: 01:00 AM - 02:00 AM');

    // -------------------------------------------------------------------------
    // TEST 4: Day with No Scheduled Hours (Wednesday)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Day with No Scheduled Hours (Wednesday) ---');
    await evaluate(`
      document.querySelector('.day-tab[data-day="Wednesday"]')?.click();
    `);
    await sleep(400);

    kpis = await getKPIValues();
    console.log('  KPI Results on Wednesday (empty day):', kpis);
    if (kpis.dailyTiming !== 'No scheduled hours') {
      throw new Error(`Expected 'No scheduled hours', got '${kpis.dailyTiming}'`);
    }
    console.log('  ✓ [PASS] Day with no sessions shows "No scheduled hours"');
    if (kpis.weeklyHours !== '3 Hrs') {
      throw new Error(`Expected Weekly Hours to remain '3 Hrs', got '${kpis.weeklyHours}'`);
    }
    console.log('  ✓ [PASS] Weekly Hours still shows actual weekly total: 3 Hrs');

    // -------------------------------------------------------------------------
    // TEST 5: Entire Weekly Timetable Empty (0 sessions)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Entire Weekly Timetable Empty (0 sessions) ---');
    await pool.query("DELETE FROM timetable WHERE class_name = 'TY-IT' AND division = '1' AND semester = 5");

    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/student/timetable.html' });
    await sleep(2000);

    kpis = await getKPIValues();
    console.log('  KPI Results when 0 sessions exist:', kpis);

    if (kpis.dailyTiming !== 'No scheduled hours') {
      throw new Error(`Expected 'No scheduled hours', got '${kpis.dailyTiming}'`);
    }
    if (kpis.dailyTiming.includes('09:00 - 14:00') || kpis.dailyTiming.includes('09:00')) {
      throw new Error('FAILED: Hardcoded 09:00 - 14:00 was displayed!');
    }
    console.log('  ✓ [PASS] Daily Timing is "No scheduled hours" (strictly NO hardcoded 09:00 - 14:00)');

    if (kpis.weeklyHours !== '0 Hrs') {
      throw new Error(`Expected Weekly Hours '0 Hrs', got '${kpis.weeklyHours}'`);
    }
    console.log('  ✓ [PASS] Weekly Hours: 0 Hrs');

    if (!kpis.hoursTrend.includes('0 Scheduled Session')) {
      throw new Error(`Expected '0 Scheduled Sessions', got '${kpis.hoursTrend}'`);
    }
    console.log('  ✓ [PASS] Scheduled Sessions: 0 Scheduled Sessions');

    if (kpis.totalSubjects !== '0 Courses') {
      throw new Error(`Expected Total Subjects '0 Courses', got '${kpis.totalSubjects}'`);
    }
    console.log('  ✓ [PASS] Total Subjects: 0 Courses');

    if (kpis.primaryHall !== 'Not Assigned') {
      throw new Error(`Expected Primary Hall 'Not Assigned', got '${kpis.primaryHall}'`);
    }
    if (kpis.primaryHall.includes('AC 301')) {
      throw new Error('FAILED: Hardcoded AC 301 was displayed!');
    }
    console.log('  ✓ [PASS] Primary Hall is "Not Assigned" (strictly NO hardcoded AC 301)');

    // -------------------------------------------------------------------------
    // Restore Original Timetable
    // -------------------------------------------------------------------------
    console.log('\n[Teardown] Restoring original timetable records...');
    await pool.query("DELETE FROM timetable WHERE class_name = 'TY-IT' AND division = '1' AND semester = 5");
    for (const row of origTimetable) {
      await pool.query(`
        INSERT INTO timetable (timetable_id, course_id, teacher_id, class_name, division, room_no, academic_year, semester, day_of_week, start_time, end_time, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row.timetable_id, row.course_id, row.teacher_id, row.class_name, row.division,
        row.room_no, row.academic_year, row.semester, row.day_of_week, row.start_time,
        row.end_time, row.created_at, row.updated_at
      ]);
    }
    console.log(`[Teardown] Successfully restored ${origTimetable.length} original records.`);

    // Capture Screenshot of restored timetable
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/student/timetable.html' });
    await sleep(2000);
    const ss = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'student_timetable_dynamic_timing.png'), Buffer.from(ss.data, 'base64'));
    console.log('  ✓ Screenshot saved: student_timetable_dynamic_timing.png');

    console.log('\n========================================================================');
    console.log('  ALL TESTS PASSED SUCCESSFULLY! (0 ERRORS)');
    console.log('  1. "Daily Timing" is day-specific and dynamically computed');
    console.log('  2. Updates dynamically upon switching day tabs (Monday..Saturday)');
    console.log('  3. Strict 24-hour time handling without AM/PM guessing');
    console.log('  4. "No scheduled hours" correctly displayed for days without classes');
    console.log('  5. Weekly Hours sums actual session durations across week');
    console.log('  6. Scheduled Sessions counts weekly timetable slots');
    console.log('  7. Total Subjects counts unique courses');
    console.log('  8. Primary Hall uses mode room, and falls back to "Not Assigned"');
    console.log('  9. Strictly ZERO hardcoded 09:00 - 14:00 or AC 301 remains');
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n❌ TEST RUN FAILED:', err);
    // Attempt teardown restore even on error
    try {
      await pool.query("DELETE FROM timetable WHERE class_name = 'TY-IT' AND division = '1' AND semester = 5");
      for (const row of origTimetable) {
        await pool.query(`
          INSERT INTO timetable (timetable_id, course_id, teacher_id, class_name, division, room_no, academic_year, semester, day_of_week, start_time, end_time, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          row.timetable_id, row.course_id, row.teacher_id, row.class_name, row.division,
          row.room_no, row.academic_year, row.semester, row.day_of_week, row.start_time,
          row.end_time, row.created_at, row.updated_at
        ]);
      }
      console.log('[Teardown] Restored original timetable records after error.');
    } catch(e){}
    process.exit(1);
  } finally {
    try { ws.close(); } catch(e){}
    try { chromeProcess.kill(); } catch(e){}
    await pool.end();
  }
}

run();
