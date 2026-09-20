const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9246;

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

function deleteReq(url, token = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'DELETE',
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
    req.end();
  });
}

async function runAdminFeedbackUITest() {
  console.log('========================================================================');
  console.log('  STUDENT FEEDBACK MODULE — STEP 4: ADMIN FRONTEND VERIFICATION SUITE');
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
  let createdFormId = null;

  try {
    // ------------------------------------------------------------------------
    // 1. Authenticate Admin and Student
    // ------------------------------------------------------------------------
    console.log('[1/8] Authenticating Test Users...');
    const adminAuth = await postJson('http://localhost:5000/api/auth/login', {
      username: 'admin',
      password: 'Admin@123'
    });
    const adminToken = adminAuth.data?.data?.token;
    const adminUser = adminAuth.data?.data?.user;
    assert(Boolean(adminToken && adminUser?.role === 'ADMIN'), 'Admin authenticated successfully with ADMIN role');

    const studentAuth = await postJson('http://localhost:5000/api/auth/login', {
      username: 'Karan',
      password: 'Karan@123'
    });
    const studentToken = studentAuth.data?.data?.token;
    assert(Boolean(studentToken), 'Student authenticated successfully (Karan)');

    // ------------------------------------------------------------------------
    // 2. Prepare Base Test Feedback Form via Admin API
    // ------------------------------------------------------------------------
    console.log('\n[2/8] Seeding Active Test Form with Questions...');
    const now = new Date();
    const startDate = new Date(now.getTime() - 3600000);
    const endDate = new Date(now.getTime() + 14 * 86400000);

    const formRes = await postJson('http://localhost:5000/api/admin/feedback/forms', {
      title: 'Admin Verification Initial Form',
      description: 'Pre-seeded form for admin dashboard UI validation',
      target_type: 'GENERAL',
      academic_year: '2025-2026',
      semester: 5,
      start_date: startDate.toISOString().slice(0, 19).replace('T', ' '),
      end_date: endDate.toISOString().slice(0, 19).replace('T', ' '),
      is_active: true
    }, adminToken);

    createdFormId = formRes.data?.data?.feedback_form_id;
    assert(Boolean(createdFormId), `Created test form #${createdFormId}`);

    // Add Q1 (RATING)
    const q1Res = await postJson(`http://localhost:5000/api/admin/feedback/forms/${createdFormId}/questions`, {
      question_text: 'Quality of campus academic infrastructure and labs',
      question_type: 'RATING',
      is_required: true,
      display_order: 1
    }, adminToken);
    assert(Boolean(q1Res.data?.data?.question_id), 'Added Question 1 (RATING)');

    // ------------------------------------------------------------------------
    // 3. Launch Chrome & Connect via CDP
    // ------------------------------------------------------------------------
    console.log(`\n[3/8] Launching Headless Chrome on CDP port ${CDP_PORT}...`);
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
        const msg = parsed.params.args.map(a => a.value || a.description || '').join(' ');
        consoleErrors.push(msg);
      }
      if (parsed.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(parsed.params.exceptionDetails.text + ' ' + (parsed.params.exceptionDetails.exception?.description || ''));
      }
    });

    async function evalCode(expression) {
      const trimmed = expression.trim();
      const needsReturn = !trimmed.includes('return ') && !trimmed.includes(';') && !trimmed.includes('\n');
      const body = needsReturn ? `return (${trimmed});` : trimmed;
      const wrapped = `(() => {
        try {
          ${body}
        } catch (e) {
          return { __evalError: e.message || String(e) };
        }
      })()`;

      const res = await cdpSend('Runtime.evaluate', {
        expression: wrapped,
        returnByValue: true,
        awaitPromise: true
      });

      if (res.result?.value?.__evalError) {
        throw new Error(res.result.value.__evalError);
      }
      return res.result?.value;
    }

    // ------------------------------------------------------------------------
    // 4. Inject Admin Session & Navigate to Admin Feedback Page
    // ------------------------------------------------------------------------
    console.log('\n[4/8] Navigating to Admin Feedback Page & Injecting Auth Session...');
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/login.html' });
    await sleep(800);

    await evalCode(`
      localStorage.setItem('token', '${adminToken}');
      localStorage.setItem('user', JSON.stringify(${JSON.stringify(adminUser)}));
    `);

    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/admin/feedback.html' });
    await sleep(1500);

    const pageTitle = await evalCode('document.title');
    assert(pageTitle.includes('Feedback Management'), `Document title: "${pageTitle}"`);

    // Verify exactly ONE Feedback link in Sidebar and active state
    const feedbackNavInfo = await evalCode(`
      const links = Array.from(document.querySelectorAll('.admin-sidebar a[href*="feedback.html"]'));
      return {
        count: links.length,
        hasActive: links.some(l => l.classList.contains('active')),
        text: links[0]?.textContent?.trim()
      };
    `);
    assert(feedbackNavInfo.count === 1, `Exactly ONE Feedback navigation item in Admin sidebar (Found: ${feedbackNavInfo.count})`);
    assert(feedbackNavInfo.hasActive, 'Feedback sidebar navigation link has .active class');
    assert(feedbackNavInfo.text?.includes('Feedback'), `Feedback navigation text is "${feedbackNavInfo.text}"`);

    // Verify exactly ONE Notification Bell
    const bellCount = await evalCode(`
      document.querySelectorAll('#headerNotificationBtn').length
    `);
    assert(bellCount === 1, `Exactly ONE notification bell exists in the top header (Found: ${bellCount})`);

    // Verify Profile Dropdown
    const profileExists = await evalCode(`
      Boolean(document.getElementById('profileDropdownTrigger') && document.getElementById('profileDropdownMenu'))
    `);
    assert(profileExists, 'Admin profile dropdown trigger and menu exist in header');

    // ------------------------------------------------------------------------
    // 5. Verify Dashboard Data Loading & KPIs
    // ------------------------------------------------------------------------
    console.log('\n[5/8] Verifying Feedback Forms Dashboard Data & KPIs...');
    await sleep(600);

    const kpiData = await evalCode(`
      return {
        totalForms: parseInt(document.getElementById('kpiTotalForms')?.textContent, 10),
        activeForms: parseInt(document.getElementById('kpiActiveForms')?.textContent, 10),
        tableRowCount: document.querySelectorAll('#formsTableBody tr').length
      };
    `);
    assert(kpiData.totalForms >= 1, `KPI Total Forms is ${kpiData.totalForms} (>= 1)`);
    assert(kpiData.activeForms >= 1, `KPI Active Forms is ${kpiData.activeForms} (>= 1)`);
    assert(kpiData.tableRowCount >= 1, `Feedback forms table rendered ${kpiData.tableRowCount} row(s)`);

    // ------------------------------------------------------------------------
    // 6. Test Search and Filtering Controls
    // ------------------------------------------------------------------------
    console.log('\n[6/8] Testing Search and Filter Controls...');
    // A) Search filter
    await evalCode(`
      const searchInput = document.getElementById('filterSearch');
      searchInput.value = 'Admin Verification Initial';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    `);
    await sleep(600);

    const searchCount = await evalCode(`document.querySelectorAll('#formsTableBody tr').length`);
    assert(searchCount >= 1, `Search filtering returns matching row(s) (Found: ${searchCount})`);

    // B) Target Type filter
    await evalCode(`
      const typeSelect = document.getElementById('filterTargetType');
      typeSelect.value = 'EVENT';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await sleep(500);

    const eventCount = await evalCode(`document.querySelectorAll('#formsTableBody tr').length`);
    console.log(`     (Filter Target Type EVENT returned ${eventCount} items)`);

    // C) Reset Filters
    await evalCode(`
      document.getElementById('btnResetFilters').click();
    `);
    await sleep(600);
    const resetCount = await evalCode(`document.querySelectorAll('#formsTableBody tr').length`);
    assert(resetCount >= 1, `Reset filters restores full forms list (Count: ${resetCount})`);

    // ------------------------------------------------------------------------
    // 7. Full Form Lifecycle (Create, Edit, Questions, Responses, Analytics, Delete)
    // ------------------------------------------------------------------------
    console.log('\n[7/8] Testing Full Admin Operations (Create, Edit, Questions, Responses, Analytics, Delete)...');

    // 7A. CREATE FEEDBACK FORM
    await evalCode(`document.getElementById('btnOpenCreateModal').click();`);
    await sleep(300);

    const isCreateModalOpen = await evalCode(`!document.getElementById('formModal').classList.contains('hidden')`);
    assert(isCreateModalOpen, 'Create Feedback Form modal opened');

    // Test validation error: start_date > end_date
    await evalCode(`
      document.getElementById('formTitleInput').value = 'Test Validation Form';
      document.getElementById('formStartDateInput').value = '2026-10-10T12:00';
      document.getElementById('formEndDateInput').value = '2026-10-05T12:00';
      document.getElementById('feedbackFormElement').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await sleep(200);
    const valAlertShown = await evalCode(`!document.getElementById('formModalAlert').classList.contains('hidden')`);
    assert(valAlertShown, 'Client validation caught invalid date range (start_date >= end_date)');

    const runUid = Date.now();
    const testFormTitle = `CDP Test Survey ${runUid}`;
    const testFormTitleUpdated = `CDP Test Survey ${runUid} (Updated)`;

    // Create valid form
    await evalCode(`
      document.getElementById('formTitleInput').value = '${testFormTitle}';
      document.getElementById('formDescInput').value = 'Detailed feedback collection for academic review.';
      document.getElementById('formTargetTypeSelect').value = 'GENERAL';
      document.getElementById('formTargetIdInput').value = '';
      document.getElementById('formAcademicYearInput').value = '2025-2026';
      document.getElementById('formSemesterSelect').value = '5';
      document.getElementById('formStartDateInput').value = '2026-09-01T09:00';
      document.getElementById('formEndDateInput').value = '2026-12-31T23:59';
      document.getElementById('formIsActiveCheck').checked = true;
      document.getElementById('feedbackFormElement').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await sleep(1000);

    const formModalClosed = await evalCode(`document.getElementById('formModal').classList.contains('hidden')`);
    assert(formModalClosed, 'Form modal closed after successful creation');

    // Verify newly created form is listed
    const foundNewForm = await evalCode(`
      Array.from(document.querySelectorAll('#formsTableBody tr')).some(tr => tr.textContent.includes('${testFormTitle}'))
    `);
    assert(foundNewForm, `Newly created form "${testFormTitle}" appears in dashboard table`);

    // Find the created form ID from DOM
    const cdpFormId = await evalCode(`
      const row = Array.from(document.querySelectorAll('#formsTableBody tr')).find(tr => tr.textContent.includes('${testFormTitle}'));
      const editBtn = row?.querySelector('.action-edit');
      return editBtn ? parseInt(editBtn.getAttribute('data-id'), 10) : null;
    `);
    assert(Boolean(cdpFormId), `Resolved created form ID from table actions (#${cdpFormId})`);

    // 7B. EDIT FEEDBACK FORM
    await evalCode(`
      const row = Array.from(document.querySelectorAll('#formsTableBody tr')).find(tr => tr.textContent.includes('${testFormTitle}'));
      row.querySelector('.action-edit').click();
    `);
    await sleep(500);

    const editPrefillCorrect = await evalCode(`
      document.getElementById('formTitleInput').value === '${testFormTitle}'
    `);
    assert(editPrefillCorrect, 'Edit modal opened and correctly prefilled form title');

    // Update title
    await evalCode(`
      document.getElementById('formTitleInput').value = '${testFormTitleUpdated}';
      document.getElementById('feedbackFormElement').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    `);
    await sleep(1000);

    const foundUpdatedForm = await evalCode(`
      Array.from(document.querySelectorAll('#formsTableBody tr')).some(tr => tr.textContent.includes('${testFormTitleUpdated}'))
    `);
    assert(foundUpdatedForm, `Form table reflects updated title "${testFormTitleUpdated}"`);

    // 7C. QUESTION MANAGEMENT
    await evalCode(`
      const row = Array.from(document.querySelectorAll('#formsTableBody tr')).find(tr => tr.textContent.includes('${testFormTitleUpdated}'));
      row.querySelector('.action-questions').click();
    `);
    await sleep(600);

    const isQuestionsModalOpen = await evalCode(`!document.getElementById('questionsModal').classList.contains('hidden')`);
    assert(isQuestionsModalOpen, 'Questions management modal opened');

    // Open Add Question Box
    await evalCode(`document.getElementById('btnToggleAddQuestion').click();`);
    await sleep(200);
    const isQFormBoxOpen = await evalCode(`!document.getElementById('questionFormBox').classList.contains('hidden')`);
    assert(isQFormBoxOpen, 'Add Question form box opened');

    // Check Multiple Choice Information Notice
    await evalCode(`
      const typeSel = document.getElementById('questionTypeSelect');
      typeSel.value = 'MULTIPLE_CHOICE';
      typeSel.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await sleep(200);
    const mcNoticeVisible = await evalCode(`!document.getElementById('questionMCNotice').classList.contains('hidden')`);
    assert(mcNoticeVisible, 'Selecting MULTIPLE_CHOICE renders informative schema limitation notice');

    // Add Question 1: RATING
    await evalCode(`
      document.getElementById('questionTextInput').value = 'How effectively did the course cover required learning objectives?';
      document.getElementById('questionTypeSelect').value = 'RATING';
      document.getElementById('questionTypeSelect').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('questionOrderInput').value = '1';
      document.getElementById('questionRequiredCheck').checked = true;
      document.getElementById('btnSaveQuestion').click();
    `);
    await sleep(800);

    const qCount1 = await evalCode(`document.querySelectorAll('#questionsListContainer .question-card-item').length`);
    assert(qCount1 >= 1, `Added Question 1 (RATING); current questions count: ${qCount1}`);

    // Add Question 2: TEXT
    await evalCode(`
      document.getElementById('btnToggleAddQuestion').click();
    `);
    await sleep(200);
    await evalCode(`
      document.getElementById('questionTextInput').value = 'Provide suggestions for syllabus improvement';
      document.getElementById('questionTypeSelect').value = 'TEXT';
      document.getElementById('questionTypeSelect').dispatchEvent(new Event('change', { bubbles: true }));
      document.getElementById('questionOrderInput').value = '2';
      document.getElementById('questionRequiredCheck').checked = false;
      document.getElementById('btnSaveQuestion').click();
    `);
    await sleep(800);

    const qCount2 = await evalCode(`document.querySelectorAll('#questionsListContainer .question-card-item').length`);
    assert(qCount2 >= 2, `Added Question 2 (TEXT); current questions count: ${qCount2}`);

    // Edit Question 1
    await evalCode(`
      const firstEditBtn = document.querySelector('#questionsListContainer .btn-edit-question');
      firstEditBtn.click();
    `);
    await sleep(300);
    await evalCode(`
      document.getElementById('questionTextInput').value = 'How effectively did the course cover required learning objectives? (Revised)';
      document.getElementById('btnSaveQuestion').click();
    `);
    await sleep(800);

    const qTextUpdated = await evalCode(`
      document.getElementById('questionsListContainer').textContent.includes('(Revised)')
    `);
    assert(qTextUpdated, 'Question 1 successfully updated with text "(Revised)"');

    // Close questions modal
    await evalCode(`document.getElementById('btnCloseQuestionsModal').click();`);
    await sleep(300);

    // 7D. RESPONSES VIEW & CREDENTIAL LEAK CHECK
    await evalCode(`
      const row = Array.from(document.querySelectorAll('#formsTableBody tr')).find(tr => tr.textContent.includes('${testFormTitleUpdated}'));
      row.querySelector('.action-responses').click();
    `);
    await sleep(600);

    const isRespModalOpen = await evalCode(`!document.getElementById('responsesModal').classList.contains('hidden')`);
    assert(isRespModalOpen, 'Responses view modal opened');

    // Verify safe student metadata / Credential Leak Check
    const leakAudit = await evalCode(`
      const modalText = document.getElementById('responsesModal').innerHTML.toLowerCase();
      return {
        hasPasswordHash: modalText.includes('password_hash'),
        hasJwt: modalText.includes('jwt') && modalText.includes('bearer'),
        hasSalt: modalText.includes('password_salt'),
        hasBiometric: modalText.includes('biometric_template') || modalText.includes('descriptor')
      };
    `);
    assert(!leakAudit.hasPasswordHash, 'Responses View: Zero password_hash leak');
    assert(!leakAudit.hasJwt, 'Responses View: Zero JWT/Authorization token leak');
    assert(!leakAudit.hasSalt, 'Responses View: Zero password_salt leak');
    assert(!leakAudit.hasBiometric, 'Responses View: Zero biometric template leak');

    // Close responses modal
    await evalCode(`document.getElementById('btnCloseResponsesModal').click();`);
    await sleep(300);

    // 7E. ANALYTICS VIEW
    // First, test with 0 responses (empty state)
    await evalCode(`
      const row = Array.from(document.querySelectorAll('#formsTableBody tr')).find(tr => tr.textContent.includes('${testFormTitleUpdated}'));
      row.querySelector('.action-analytics').click();
    `);
    await sleep(600);

    const isAnalyticsOpen = await evalCode(`!document.getElementById('analyticsModal').classList.contains('hidden')`);
    assert(isAnalyticsOpen, 'Analytics view modal opened');

    const emptyStateVisible = await evalCode(`!document.getElementById('analyticsEmptyState').classList.contains('hidden')`);
    assert(emptyStateVisible, 'Empty analytics state correctly displayed for form with 0 responses: "No responses available yet."');

    // Close analytics modal
    await evalCode(`document.getElementById('btnCloseAnalyticsModal').click();`);
    await sleep(300);

    // Now submit a real student response via API to verify full analytics rendering
    const questionsForCdpForm = await getJson(`http://localhost:5000/api/feedback/forms/${cdpFormId}`, studentToken);
    const qList = questionsForCdpForm.data?.data?.questions || questionsForCdpForm.data?.questions || questionsForCdpForm.data?.form?.questions || [];
    const ratingQ = qList.find(q => q.question_type === 'RATING');
    const textQ = qList.find(q => q.question_type === 'TEXT');

    if (ratingQ) {
      const subRes = await postJson(`http://localhost:5000/api/feedback/forms/${cdpFormId}/submit`, {
        answers: [
          { question_id: ratingQ.question_id, rating: 5, answer_text: null },
          ...(textQ ? [{ question_id: textQ.question_id, rating: null, answer_text: 'Excellent course practicals.' }] : [])
        ]
      }, studentToken);
      console.log(`     (Submitted live student feedback for analytics verification: status ${subRes.status})`);
    }

    // Refresh forms and re-open analytics
    await evalCode(`
      if (window.adminFeedback && window.adminFeedback.loadForms) {
        window.adminFeedback.loadForms();
      } else {
        document.getElementById('btnResetFilters').click();
      }
    `);
    await sleep(800);

    await evalCode(`
      const row = Array.from(document.querySelectorAll('#formsTableBody tr')).find(tr => tr.textContent.includes('${testFormTitleUpdated}'));
      row.querySelector('.action-analytics').click();
    `);
    await sleep(800);

    const analyticsLoaded = await evalCode(`
      const content = document.getElementById('analyticsContentContainer');
      const totalResp = document.getElementById('analyticsTotalResponses')?.textContent;
      const overallAvg = document.getElementById('analyticsOverallAvg')?.textContent;
      return {
        isContentVisible: !content.classList.contains('hidden'),
        totalResp: parseInt(totalResp, 10),
        overallAvg
      };
    `);
    assert(analyticsLoaded.isContentVisible, 'Analytics content container displayed after live submission');
    assert(analyticsLoaded.totalResp >= 1, `Analytics Total Responses metric: ${analyticsLoaded.totalResp}`);
    assert(analyticsLoaded.overallAvg?.includes('5'), `Analytics Overall Average metric: ${analyticsLoaded.overallAvg}`);

    // Close analytics modal
    await evalCode(`document.getElementById('btnCloseAnalyticsModal').click();`);
    await sleep(300);

    // 7F. DELETE FEEDBACK FORM
    await evalCode(`
      const row = Array.from(document.querySelectorAll('#formsTableBody tr')).find(tr => tr.textContent.includes('${testFormTitleUpdated}'));
      row.querySelector('.action-delete').click();
    `);
    await sleep(400);

    const isDeleteModalOpen = await evalCode(`!document.getElementById('deleteModal').classList.contains('hidden')`);
    assert(isDeleteModalOpen, 'Delete confirmation modal opened with cascade warning');

    // Confirm deletion
    await evalCode(`document.getElementById('btnConfirmDelete').click();`);
    await sleep(1000);

    const deleteModalClosed = await evalCode(`document.getElementById('deleteModal').classList.contains('hidden')`);
    assert(deleteModalClosed, 'Delete confirmation modal closed after deletion');

    const formDeleted = await evalCode(`
      !Array.from(document.querySelectorAll('#formsTableBody tr')).some(tr => tr.textContent.includes('${testFormTitleUpdated}'))
    `);
    assert(formDeleted, 'Deleted feedback form is completely removed from dashboard table');

    // ------------------------------------------------------------------------
    // 8. Multi-Viewport Responsive Verification (Zero Horizontal Overflow)
    // ------------------------------------------------------------------------
    console.log('\n[8/8] Multi-Viewport Responsive Layout Verification...');
    for (const vp of VIEWPORTS) {
      await cdpSend('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.isMobile
      });
      await sleep(400);

      const overflowCheck = await evalCode(`
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          hasOverflow: document.documentElement.scrollWidth > window.innerWidth
        };
      `);

      assert(
        !overflowCheck.hasOverflow,
        `Viewport ${vp.name}: Zero horizontal overflow (scrollWidth: ${overflowCheck.scrollWidth}, innerWidth: ${overflowCheck.innerWidth})`,
        overflowCheck
      );
    }

    // Check Console Errors
    assert(consoleErrors.length === 0, `Browser console errors: ${consoleErrors.length}`, consoleErrors);

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    // Cleanup seeded form
    if (createdFormId) {
      try {
        const adminAuth = await postJson('http://localhost:5000/api/auth/login', { username: 'admin', password: 'Admin@123' });
        await deleteReq(`http://localhost:5000/api/admin/feedback/forms/${createdFormId}`, adminAuth.data?.data?.token);
      } catch (e) {}
    }

    if (chromeProcess) {
      chromeProcess.kill();
    }

    console.log('\n========================================================================');
    console.log(`  VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
    console.log('========================================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runAdminFeedbackUITest();
