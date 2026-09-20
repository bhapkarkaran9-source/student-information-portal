const { spawn } = require('child_process');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9247;

const VIEWPORTS = [
  { name: 'Mobile Small (375x812)', width: 375, height: 812, isMobile: true },
  { name: 'Mobile Standard (390x844)', width: 390, height: 844, isMobile: true },
  { name: 'Tablet Portrait (768x1024)', width: 768, height: 1024, isMobile: true },
  { name: 'Tablet Landscape (1024x768)', width: 1024, height: 768, isMobile: false },
  { name: 'Desktop (1440x900)', width: 1440, height: 900, isMobile: false }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function postJson(url, data, token = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const parsed = new URL(url);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getJson(url, token = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTeacherFeedbackUITest() {
  console.log('========================================================================');
  console.log('  STUDENT FEEDBACK MODULE — STEP 5B: TEACHER FRONTEND VERIFICATION SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message, details = null) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
      return true;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      if (details) console.error('         Details:', details);
      failed++;
      return false;
    }
  }

  let chromeProcess = null;
  let seededFormId = null;

  try {
    // ------------------------------------------------------------------------
    // 1. Authenticate Test Users
    // ------------------------------------------------------------------------
    console.log('[1/9] Authenticating Test Users...');
    const teacher1Auth = await postJson('http://localhost:5000/api/auth/login', {
      username: 'Rohini',
      password: 'Rohini@123'
    });
    const teacher1Token = teacher1Auth.data?.data?.token;
    const teacher1User = teacher1Auth.data?.data?.user;
    assert(Boolean(teacher1Token && teacher1User?.role === 'TEACHER'), 'Teacher 1 (Rohini) authenticated successfully');

    const teacher2Auth = await postJson('http://localhost:5000/api/auth/login', {
      username: 'Vikas',
      password: 'Vikas@123'
    });
    const teacher2Token = teacher2Auth.data?.data?.token;
    const teacher2User = teacher2Auth.data?.data?.user;
    assert(Boolean(teacher2Token && teacher2User?.role === 'TEACHER'), 'Teacher 2 (Vikas) authenticated successfully');

    const studentAuth = await postJson('http://localhost:5000/api/auth/login', {
      username: 'Karan',
      password: 'Karan@123'
    });
    const studentToken = studentAuth.data?.data?.token;
    assert(Boolean(studentToken), 'Student (Karan) authenticated successfully');

    // ------------------------------------------------------------------------
    // 2. Launch Chrome & Connect via CDP
    // ------------------------------------------------------------------------
    console.log(`\n[2/9] Launching Headless Chrome on CDP port ${CDP_PORT}...`);
    chromeProcess = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      'about:blank'
    ]);

    await sleep(2200);

    const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json`);
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
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

    const consoleErrors = [];
    ws.addEventListener('message', evt => {
      const parsed = JSON.parse(evt.data);
      if (parsed.method === 'Runtime.consoleAPICalled' && parsed.params.type === 'error') {
        const text = parsed.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
        if (!text.includes('favicon.ico')) consoleErrors.push(text);
      }
    });

    // Helper: Evaluate JS expression on page
    const evaluate = async (expr) => {
      const res = await cdpSend('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description || 'Evaluation error');
      }
      return res.result?.value;
    };

    // ------------------------------------------------------------------------
    // 3. Inject Teacher 1 Session and Navigate to Feedback Page
    // ------------------------------------------------------------------------
    console.log('\n[3/9] Loading Teacher Feedback Page with Authenticated Session...');
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/teacher/dashboard.html' });
    await sleep(1500);

    // Inject localStorage auth tokens
    await evaluate(`
      localStorage.setItem('token', ${JSON.stringify(teacher1Token)});
      localStorage.setItem('user', ${JSON.stringify(JSON.stringify(teacher1User))});
    `);

    // Navigate to feedback page
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/teacher/feedback.html' });
    await sleep(2000);

    const docTitle = await evaluate('document.title');
    assert(docTitle.includes('Feedback') || docTitle.includes('Faculty'), `Document title verified: "${docTitle}"`);

    // ------------------------------------------------------------------------
    // 4. Verify Teacher Sidebar Navigation & Shell Header
    // ------------------------------------------------------------------------
    console.log('\n[4/9] Verifying Sidebar Navigation & Header...');
    const feedbackNavCount = await evaluate(`
      document.querySelectorAll('#teacherSidebar a.nav-link[href="/pages/teacher/feedback.html"]').length
    `);
    assert(feedbackNavCount === 1, `Exactly ONE Feedback navigation item in Teacher sidebar (Found: ${feedbackNavCount})`);

    const isActive = await evaluate(`
      document.querySelector('#teacherSidebar a.nav-link[href="/pages/teacher/feedback.html"]').classList.contains('active')
    `);
    assert(isActive === true, 'Feedback sidebar navigation link has .active class');

    const notificationBellCount = await evaluate(`
      document.querySelectorAll('#headerNotificationBtn').length
    `);
    assert(notificationBellCount === 1, `Exactly ONE notification bell exists in top header (Found: ${notificationBellCount})`);

    const profileDropdownExists = await evaluate(`
      Boolean(document.getElementById('profileDropdownBtn') && document.getElementById('profileDropdownMenu'))
    `);
    assert(profileDropdownExists === true, 'Faculty profile dropdown trigger and menu exist in header');

    // ------------------------------------------------------------------------
    // 5. Verify KPI Summary Cards and Privacy Notice
    // ------------------------------------------------------------------------
    console.log('\n[5/9] Verifying KPI Cards and Privacy Notice...');
    const privacyNotice = await evaluate(`
      document.querySelector('.tf-privacy-text')?.textContent || ''
    `);
    assert(
      privacyNotice.includes('Student identities are protected') &&
      privacyNotice.includes('Individual student answers are not shown'),
      'Privacy notice correctly displayed: "Student identities are protected. Individual student answers are not shown."'
    );

    const kpiData = await evaluate(`({
      myForms: document.getElementById('kpiMyForms')?.textContent,
      activeForms: document.getElementById('kpiActiveForms')?.textContent,
      totalResponses: document.getElementById('kpiTotalResponses')?.textContent,
      pendingResponses: document.getElementById('kpiPendingResponses')?.textContent
    })`);
    assert(kpiData.myForms !== undefined && kpiData.myForms !== '', `KPI My Feedback Forms: ${kpiData.myForms}`);
    assert(kpiData.activeForms !== undefined && kpiData.activeForms !== '', `KPI Active Forms: ${kpiData.activeForms}`);
    assert(kpiData.totalResponses !== undefined && kpiData.totalResponses !== '', `KPI Total Responses: ${kpiData.totalResponses}`);

    // ------------------------------------------------------------------------
    // 6. Test Form Creation Modal & Anti-Self-Evaluation Filtering
    // ------------------------------------------------------------------------
    console.log('\n[6/9] Testing Form Creation & Anti-Self-Evaluation Filtering...');
    // Open create modal
    await evaluate(`document.getElementById('btnOpenCreateFormModal').click();`);
    await sleep(500);

    const modalVisible = await evaluate(`
      !document.getElementById('formModal').classList.contains('hidden')
    `);
    assert(modalVisible === true, 'Create Feedback Form modal opened');

    // Select Target Type = COURSE
    await evaluate(`
      const sel = document.getElementById('formTargetTypeSelect');
      sel.value = 'COURSE';
      sel.dispatchEvent(new Event('change'));
    `);
    await sleep(500);

    // Verify Course Dropdown does NOT contain Rohini's assigned course (146: IT101)
    const courseOptions = await evaluate(`
      Array.from(document.getElementById('formTargetIdSelect').options).map(o => ({ value: o.value, text: o.text }))
    `);
    const containsOwnCourse = courseOptions.some(o => o.value === '146' || o.text.includes('IT101'));
    assert(!containsOwnCourse, 'Anti-Self-Evaluation: Course dropdown strictly EXCLUDES teacher\'s assigned course (IT101 - 146)');
    
    const containsOtherCourse = courseOptions.some(o => o.value === '147' || o.value === '148');
    assert(containsOtherCourse, 'Course dropdown includes other eligible institution courses');

    // Client-side date validation test (start >= end)
    await evaluate(`
      document.getElementById('formTargetTypeSelect').value = 'GENERAL';
      document.getElementById('formTargetTypeSelect').dispatchEvent(new Event('change'));
      document.getElementById('formTitleInput').value = 'Test Invalid Dates Survey';
      document.getElementById('formStartDateInput').value = '2026-10-10T10:00';
      document.getElementById('formEndDateInput').value = '2026-10-09T10:00';
      document.getElementById('btnSaveForm').click();
    `);
    await sleep(400);

    const dateAlertText = await evaluate(`document.getElementById('formModalAlertText')?.textContent || ''`);
    assert(dateAlertText.includes('earlier than end date'), 'Date validation caught start_date >= end_date error');

    // Create a valid form
    const nowIso = new Date();
    const futureIso = new Date(nowIso.getTime() + 14 * 86400000);
    const formTitle = `CDP Teacher Feedback ${Date.now()}`;

    await evaluate(`
      document.getElementById('formTitleInput').value = ${JSON.stringify(formTitle)};
      document.getElementById('formDescriptionInput').value = 'Automated CDP verified teacher feedback survey';
      document.getElementById('formTargetTypeSelect').value = 'GENERAL';
      document.getElementById('formTargetTypeSelect').dispatchEvent(new Event('change'));
      document.getElementById('formSemesterSelect').value = '5';
      document.getElementById('formStartDateInput').value = ${JSON.stringify(nowIso.toISOString().slice(0, 16))};
      document.getElementById('formEndDateInput').value = ${JSON.stringify(futureIso.toISOString().slice(0, 16))};
      document.getElementById('btnSaveForm').click();
    `);
    await sleep(1500);

    const modalClosed = await evaluate(`document.getElementById('formModal').classList.contains('hidden')`);
    assert(modalClosed === true, 'Create form modal closed after successful creation');

    const formInTable = await evaluate(`
      Array.from(document.querySelectorAll('#formsTableBody tr')).some(r => r.textContent.includes(${JSON.stringify(formTitle)}))
    `);
    assert(formInTable === true, `Newly created form "${formTitle}" rendered in teacher's feedback table`);

    // Resolve created form ID from table
    seededFormId = await evaluate(`
      (() => {
        const row = Array.from(document.querySelectorAll('#formsTableBody tr')).find(r => r.textContent.includes(${JSON.stringify(formTitle)}));
        if (!row) return null;
        const btn = row.querySelector('[data-action="questions"]');
        return btn ? parseInt(btn.getAttribute('data-id'), 10) : null;
      })()
    `);
    assert(Boolean(seededFormId), `Resolved created feedback form ID (#${seededFormId})`);

    // ------------------------------------------------------------------------
    // 7. Test Question Management (Add, Edit, Delete Questions)
    // ------------------------------------------------------------------------
    console.log('\n[7/9] Testing Question Management on Teacher Survey...');
    await evaluate(`
      document.querySelector('#form-row-${seededFormId} [data-action="questions"]')?.click();
    `);
    await sleep(800);

    const questionsModalOpen = await evaluate(`!document.getElementById('questionsModal').classList.contains('hidden')`);
    assert(questionsModalOpen === true, 'Question management modal opened');

    // Add Question 1: RATING
    await evaluate(`
      document.getElementById('qTextInput').value = 'Laboratory practical facilities and software access';
      document.getElementById('qTypeSelect').value = 'RATING';
      document.getElementById('qOrderInput').value = '1';
      document.getElementById('qRequiredCheckbox').checked = true;
      document.getElementById('btnSaveQuestion').click();
    `);
    await sleep(800);

    const q1Added = await evaluate(`
      document.querySelectorAll('#questionsListContainer .tf-question-card').length === 1
    `);
    assert(q1Added === true, 'Added Question 1 (RATING); questions count: 1');

    // Add Question 2: MULTIPLE_CHOICE
    await evaluate(`
      document.getElementById('qTextInput').value = 'Preferred laboratory session timing';
      document.getElementById('qTypeSelect').value = 'MULTIPLE_CHOICE';
      document.getElementById('qOrderInput').value = '2';
      document.getElementById('qRequiredCheckbox').checked = false;
      document.getElementById('btnSaveQuestion').click();
    `);
    await sleep(800);

    const q2Added = await evaluate(`
      document.querySelectorAll('#questionsListContainer .tf-question-card').length === 2
    `);
    assert(q2Added === true, 'Added Question 2 (MULTIPLE_CHOICE); questions count: 2');

    // Add Question 3: TEXT
    await evaluate(`
      document.getElementById('qTextInput').value = 'Suggestions for curriculum improvement';
      document.getElementById('qTypeSelect').value = 'TEXT';
      document.getElementById('qOrderInput').value = '3';
      document.getElementById('qRequiredCheckbox').checked = false;
      document.getElementById('btnSaveQuestion').click();
    `);
    await sleep(800);

    const q3Added = await evaluate(`
      document.querySelectorAll('#questionsListContainer .tf-question-card').length === 3
    `);
    assert(q3Added === true, 'Added Question 3 (TEXT); questions count: 3');

    // Edit Question 1
    await evaluate(`
      const firstQ = document.querySelector('#questionsListContainer .tf-question-card');
      firstQ.querySelector('[data-edit-q]').click();
    `);
    await sleep(300);

    await evaluate(`
      document.getElementById('qTextInput').value = 'Laboratory practical facilities and software access (Updated)';
      document.getElementById('btnSaveQuestion').click();
    `);
    await sleep(800);

    const q1Updated = await evaluate(`
      document.querySelector('#questionsListContainer .tf-question-card').textContent.includes('(Updated)')
    `);
    assert(q1Updated === true, 'Question 1 successfully updated with edited text');

    // Close Questions modal
    await evaluate(`document.querySelector('[data-close-modal="questionsModal"]').click();`);
    await sleep(500);

    // ------------------------------------------------------------------------
    // 8. Test Student Submission, Submission Roster & Aggregated Analytics
    // ------------------------------------------------------------------------
    console.log('\n[8/9] Testing Student Submission Tracking & Aggregated Analytics...');
    // Fetch question IDs from form
    const formDetails = await getJson(`http://localhost:5000/api/feedback/forms/${seededFormId}`, studentToken);
    const questions = formDetails.data?.questions || [];
    const qRating = questions.find(q => q.question_type === 'RATING');
    const qMcq = questions.find(q => q.question_type === 'MULTIPLE_CHOICE');
    const qText = questions.find(q => q.question_type === 'TEXT');

    // Student (Karan) submits answers
    const studentSubmit = await postJson(`http://localhost:5000/api/feedback/forms/${seededFormId}/submit`, {
      answers: [
        { question_id: qRating.question_id, rating: 5.0 },
        { question_id: qMcq.question_id, answer_text: 'Morning Slot (8:00 AM)' },
        { question_id: qText.question_id, answer_text: 'Excellent lab equipment and helpful demonstrator.' }
      ]
    }, studentToken);
    assert(studentSubmit.status === 201, 'Student submitted answers successfully (status 201)');

    // Refresh teacher forms list
    await evaluate('document.getElementById("btnResetFilters").click();');
    await sleep(1000);

    // Open Student Submission Status Modal (Requirement G)
    await evaluate(`
      document.querySelector('#form-row-${seededFormId} [data-action="submissions"]')?.click();
    `);
    await sleep(1000);

    const subModalOpen = await evaluate(`!document.getElementById('submissionsModal').classList.contains('hidden')`);
    assert(subModalOpen === true, 'Student submission status modal opened');

    const subStats = await evaluate(`({
      total: document.getElementById('subTotalStudents')?.textContent,
      submitted: document.getElementById('subSubmittedCount')?.textContent,
      pending: document.getElementById('subPendingCount')?.textContent
    })`);
    assert(parseInt(subStats.total, 10) >= 1, `Submissions roster Total Students: ${subStats.total}`);
    assert(parseInt(subStats.submitted, 10) >= 1, `Submissions roster Submitted count: ${subStats.submitted}`);

    // Check Karan is in roster with Submitted status
    const karanRow = await evaluate(`
      Array.from(document.querySelectorAll('#submissionsTableBody tr')).find(r => r.textContent.includes('Karan') || r.textContent.includes('B24IT1005'))?.textContent || ''
    `);
    assert(karanRow.includes('Submitted ✓'), 'Student Karan shows status "Submitted ✓"');

    // Test Submissions Filters: Submitted tab
    await evaluate(`document.getElementById('tabSubSubmitted').click();`);
    await sleep(300);
    const onlySubmitted = await evaluate(`
      Array.from(document.querySelectorAll('#submissionsTableBody tr')).every(r => r.textContent.includes('Submitted ✓'))
    `);
    assert(onlySubmitted === true, 'Filter tab "Submitted" renders only submitted student rows');

    // Test Submissions Filters: Pending tab
    await evaluate(`document.getElementById('tabSubPending').click();`);
    await sleep(300);
    const onlyPending = await evaluate(`
      Array.from(document.querySelectorAll('#submissionsTableBody tr')).every(r => r.textContent.includes('Pending'))
    `);
    assert(onlyPending === true, 'Filter tab "Pending" renders only pending student rows');

    // Reset to All
    await evaluate(`document.getElementById('tabSubAll').click();`);
    await sleep(300);

    // CRITICAL PRIVACY AUDIT: Ensure ZERO individual answers are displayed in the submissions roster!
    const rosterHtml = await evaluate(`document.getElementById('submissionsModal').innerHTML`);
    assert(!rosterHtml.includes('Excellent lab equipment'), 'PRIVACY AUDIT: Submissions modal contains ZERO answer text');
    assert(!rosterHtml.includes('Morning Slot'), 'PRIVACY AUDIT: Submissions modal contains ZERO MCQ answer selections');
    assert(!rosterHtml.includes('5.0 / 5.0'), 'PRIVACY AUDIT: Submissions modal contains ZERO individual ratings');

    // Close submissions modal
    await evaluate(`document.querySelector('[data-close-modal="submissionsModal"]').click();`);
    await sleep(500);

    // Open Analytics Modal (Requirement H)
    await evaluate(`
      document.querySelector('#form-row-${seededFormId} [data-action="analytics"]')?.click();
    `);
    await sleep(1000);

    const analyticsModalOpen = await evaluate(`!document.getElementById('analyticsModal').classList.contains('hidden')`);
    assert(analyticsModalOpen === true, 'Survey analytics modal opened');

    const analyticsMetrics = await evaluate(`({
      total: document.getElementById('analyticsTotalResponses')?.textContent,
      overallAvg: document.getElementById('analyticsOverallAverage')?.textContent
    })`);
    assert(parseInt(analyticsMetrics.total, 10) >= 1, `Analytics Total Responses metric: ${analyticsMetrics.total}`);
    assert(analyticsMetrics.overallAvg.includes('5'), `Analytics Overall Average rating: ${analyticsMetrics.overallAvg}`);

    // Verify Star Rating Distribution
    const ratingBarsRendered = await evaluate(`
      document.querySelectorAll('#analyticsRatingsContainer .tf-star-dist-row').length === 5
    `);
    assert(ratingBarsRendered === true, 'Rating distribution rendered 5 star-tier frequency bars (5★ to 1★)');

    // Verify Multiple Choice aggregated options
    const mcqRendered = await evaluate(`
      document.getElementById('analyticsMcqContainer').textContent.includes('Morning Slot (8:00 AM)')
    `);
    assert(mcqRendered === true, 'MCQ aggregated results render option frequency counts');

    // Verify Anonymous Text Feedback feed
    const textRemark = await evaluate(`
      document.getElementById('analyticsTextContainer').textContent
    `);
    assert(textRemark.includes('Excellent lab equipment'), 'Anonymous student remark rendered in qualitative feedback feed');

    // CRITICAL PRIVACY AUDIT: Verify no student name/PRN beside text answer
    const textFeedContainerHtml = await evaluate(`document.getElementById('analyticsTextContainer').innerHTML`);
    assert(!textFeedContainerHtml.includes('Karan'), 'PRIVACY AUDIT: Qualitative text feed contains NO student name');
    assert(!textFeedContainerHtml.includes('B24IT1005'), 'PRIVACY AUDIT: Qualitative text feed contains NO student PRN');
    assert(!textFeedContainerHtml.includes('student_id'), 'PRIVACY AUDIT: Qualitative text feed contains NO student ID');

    // Close analytics modal
    await evaluate(`document.querySelector('[data-close-modal="analyticsModal"]').click();`);
    await sleep(500);

    // ------------------------------------------------------------------------
    // 9. Teacher Isolation, Deletion & Multi-Viewport Verification
    // ------------------------------------------------------------------------
    console.log('\n[9/9] Testing Teacher Isolation, Form Deletion & Multi-Viewport Layout...');
    // Teacher 2 (Vikas) Isolation Test
    await evaluate(`
      localStorage.setItem('token', ${JSON.stringify(teacher2Token)});
      localStorage.setItem('user', ${JSON.stringify(JSON.stringify(teacher2User))});
    `);
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/teacher/feedback.html' });
    await sleep(1500);

    const formVisibleToTeacher2 = await evaluate(`
      Array.from(document.querySelectorAll('#formsTableBody tr')).some(r => r.textContent.includes(${JSON.stringify(formTitle)}))
    `);
    assert(!formVisibleToTeacher2, 'STRICT ISOLATION: Teacher 2 (Vikas) CANNOT see Teacher 1 (Rohini)\'s feedback forms');

    // Switch back to Teacher 1 to test delete
    await evaluate(`
      localStorage.setItem('token', ${JSON.stringify(teacher1Token)});
      localStorage.setItem('user', ${JSON.stringify(JSON.stringify(teacher1User))});
    `);
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/teacher/feedback.html' });
    await sleep(1500);

    // Delete form
    await evaluate(`
      document.querySelector('#form-row-${seededFormId} [data-action="delete"]')?.click();
    `);
    await sleep(400);

    const deleteModalOpen = await evaluate(`!document.getElementById('deleteModal').classList.contains('hidden')`);
    assert(deleteModalOpen === true, 'Delete confirmation modal opened with cascade deletion warning');

    await evaluate(`document.getElementById('btnConfirmDelete').click();`);
    await sleep(1200);

    const formGone = await evaluate(`
      !document.getElementById('form-row-${seededFormId}')
    `);
    assert(formGone === true, 'Feedback survey successfully deleted and removed from dashboard table');

    // Multi-Viewport Responsive Checks
    for (const vp of VIEWPORTS) {
      await cdpSend('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.isMobile
      });
      await sleep(350);

      const overflow = await evaluate(`
        document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth
      `);
      assert(!overflow, `Viewport ${vp.name}: Zero horizontal overflow (scrollWidth <= innerWidth)`);
    }

    // Console errors audit
    assert(consoleErrors.length === 0, `Browser console errors: ${consoleErrors.length}`, consoleErrors);

    console.log('\n========================================================================');
    console.log(`  VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
    console.log('========================================================================\n');

    if (failed > 0) process.exit(1);
    else process.exit(0);

  } catch (err) {
    console.error('Fatal test execution error:', err);
    process.exit(1);
  } finally {
    if (chromeProcess) {
      try { chromeProcess.kill(); } catch (e) {}
    }
  }
}

runTeacherFeedbackUITest();
