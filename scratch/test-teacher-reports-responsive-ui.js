const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { generateToken } = require('../src/utils/token');

const ARTIFACTS_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9276;

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
  console.log('  TEACHER REPORTS - RESPONSIVE UI & ALL 8 REPORT TYPES TEST SUITE');
  console.log('========================================================================\n');

  const TARGET_USER_ID = 175;
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

  const captureScreenshot = async (filename) => {
    const shot = await cdpSend('Page.captureScreenshot', { format: 'png' });
    const fullPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(fullPath, Buffer.from(shot.data, 'base64'));
    console.log(`  📸 Screenshot saved: ${filename}`);
  };

  try {
    // Navigate and inject auth
    console.log('\n[Setup] Authenticating faculty and loading teacher reports page...');
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/teacher/reports.html' });
    await sleep(1000);

    await evalJs(`
      localStorage.setItem('token', ${JSON.stringify(token)});
      localStorage.setItem('user', ${JSON.stringify(JSON.stringify(userData))});
    `);

    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/teacher/reports.html' });
    await sleep(2000);

    // ========================================================================
    // TEST 1: DESKTOP PAGE HEADER & ACTION CONTROLS (1440px)
    // ========================================================================
    console.log('\n--- TEST 1: Page Header, Action Buttons, & CSS Theme Link (1440px) ---');
    await setViewport(1440, 900);

    const headerData = await evalJs(`
      (() => {
        const title = document.querySelector('.reports-page-title')?.textContent.trim();
        const subtitle = document.querySelector('.reports-page-subtitle')?.textContent.trim();
        const btnPrint = document.getElementById('btnPrintReport');
        const btnCsv = document.getElementById('btnExportCsv');
        const btnExcel = document.getElementById('btnExportExcel');
        const cssLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
          .some(l => l.href.includes('teacher-reports.css'));

        return {
          title,
          subtitle,
          hasPrint: !!btnPrint,
          hasCsv: !!btnCsv,
          hasExcel: !!btnExcel,
          cssLink
        };
      })()
    `);

    assert(headerData.cssLink, 'Linked teacher-reports.css stylesheet present');
    assert(headerData.title === 'Faculty Academic Reports', `Page header title: "${headerData.title}"`);
    assert(headerData.hasPrint && headerData.hasCsv && headerData.hasExcel, 'All export action buttons (Print, CSV, Excel) present');

    // ========================================================================
    // TEST 2: REPORT CATEGORY CARDS GRID (8 CARDS)
    // ========================================================================
    console.log('\n--- TEST 2: 8 Report Category Cards in 4-Column Grid ---');
    const categoryData = await evalJs(`
      (() => {
        const grid = document.getElementById('reportCategoryCards');
        const cards = Array.from(grid.querySelectorAll('.erp-report-card'));
        const reports = cards.map(c => c.dataset.report);
        const gridCols = window.getComputedStyle(grid).gridTemplateColumns.split(' ').length;
        const activeCard = grid.querySelector('.erp-report-card.active')?.dataset.report;

        return {
          cardCount: cards.length,
          reports,
          gridCols,
          activeCard
        };
      })()
    `);

    assert(categoryData.cardCount === 8, `Found 8 report category cards (actual: ${categoryData.cardCount})`);
    assert(categoryData.gridCols === 4, `Category cards displayed in 4 columns on desktop (actual: ${categoryData.gridCols})`);
    const expectedReports = ['student-profile', 'attendance', 'grades', 'performance', 'course-wise', 'student-wise', 'enrollment', 'timetable'];
    const allReportsPresent = expectedReports.every(r => categoryData.reports.includes(r));
    assert(allReportsPresent, `All 8 report types present: ${categoryData.reports.join(', ')}`);

    // ========================================================================
    // TEST 3: ALL 8 REPORT TYPES GENERATION & LIVE DATA PREVIEW
    // ========================================================================
    console.log('\n--- TEST 3: Generating and Verifying All 8 Report Types with Live Data ---');

    for (const reportType of expectedReports) {
      console.log(`\n  Checking Report Type: [${reportType}]...`);

      // Click corresponding category card
      await evalJs(`
        (() => {
          const card = document.querySelector('.erp-report-card[data-report="${reportType}"]');
          if (card) card.click();
        })()
      `);
      await sleep(1500);

      const previewData = await evalJs(`
        (() => {
          const selectVal = document.getElementById('reportTypeSelect')?.value;
          const activeCard = document.querySelector('.erp-report-card.active')?.dataset.report;
          const title = document.getElementById('previewReportTitle')?.textContent.trim();
          const bioVisible = !document.getElementById('previewTeacherBioBox')?.classList.contains('hidden');
          const kpiGrid = document.getElementById('previewSummaryGrid');
          const kpis = Array.from(kpiGrid.querySelectorAll('.report-kpi-card'));
          const kpiDisplay = window.getComputedStyle(kpiGrid).display;
          const ths = Array.from(document.querySelectorAll('#reportPreviewThead th')).map(t => t.textContent.trim());
          const trs = Array.from(document.querySelectorAll('#reportPreviewTbody tr'));
          const mobileCards = Array.from(document.querySelectorAll('#reportPreviewMobileCards .report-mobile-card'));
          const badges = Array.from(document.querySelectorAll('#reportPreviewTbody .report-badge'));

          return {
            selectVal,
            activeCard,
            title,
            bioVisible,
            kpiCount: kpis.length,
            kpiDisplay,
            headerCount: ths.length,
            headers: ths,
            rowCount: trs.length,
            mobileCardCount: mobileCards.length,
            badgeCount: badges.length
          };
        })()
      `);

      assert(previewData.selectVal === reportType, `[${reportType}] Dropdown synchronized to "${reportType}"`);
      assert(previewData.activeCard === reportType, `[${reportType}] Category card highlighted active`);
      assert(previewData.title.length > 0, `[${reportType}] Report header title rendered: "${previewData.title}"`);
      assert(previewData.bioVisible, `[${reportType}] Faculty bio box visible`);
      assert(previewData.kpiDisplay === 'grid', `[${reportType}] KPI cards rendered in responsive grid layout (display: ${previewData.kpiDisplay})`);
      assert(previewData.headerCount > 0, `[${reportType}] Dynamic table headers rendered (${previewData.headerCount} columns: ${previewData.headers.slice(0, 4).join(', ')}...)`);
      assert(previewData.rowCount > 0, `[${reportType}] Table rows rendered (${previewData.rowCount} rows)`);

      if (reportType === 'attendance') {
        await captureScreenshot('teacher_reports_desktop_fullwidth.png');
      } else if (reportType === 'course-wise') {
        await captureScreenshot('teacher_reports_course_wise_desktop.png');
      }
    }

    // ========================================================================
    // TEST 4: DUAL VIEW SWITCH (DESKTOP TABLE vs MOBILE CARDS)
    // ========================================================================
    console.log('\n--- TEST 4: Dual View Switch (Desktop Table vs Mobile Vertical Cards) ---');
    
    // Switch to attendance report
    await evalJs(`
      (() => {
        const card = document.querySelector('.erp-report-card[data-report="attendance"]');
        if (card) card.click();
      })()
    `);
    await sleep(800);

    // Desktop view (1440px)
    await setViewport(1440, 900);
    const desktopViewCheck = await evalJs(`
      (() => {
        const tableWrapper = document.getElementById('reportPreviewTableWrapper');
        const mobileCards = document.getElementById('reportPreviewMobileCards');
        const twDisplay = window.getComputedStyle(tableWrapper).display;
        const mcDisplay = window.getComputedStyle(mobileCards).display;
        return { twDisplay, mcDisplay };
      })()
    `);
    assert(desktopViewCheck.twDisplay !== 'none', `Desktop (>768px): Table wrapper is displayed (display: ${desktopViewCheck.twDisplay})`);
    assert(desktopViewCheck.mcDisplay === 'none', `Desktop (>768px): Mobile cards container is hidden (display: ${desktopViewCheck.mcDisplay})`);

    await evalJs(`document.getElementById('reportPrintArea')?.scrollIntoView();`);
    await sleep(400);
    await captureScreenshot('teacher_reports_preview_desktop.png');

    // Mobile view (375px)
    await setViewport(375, 750);
    const mobileViewCheck = await evalJs(`
      (() => {
        const tableWrapper = document.getElementById('reportPreviewTableWrapper');
        const mobileCards = document.getElementById('reportPreviewMobileCards');
        const twDisplay = window.getComputedStyle(tableWrapper).display;
        const mcDisplay = window.getComputedStyle(mobileCards).display;
        const mobileCardItems = mobileCards.querySelectorAll('.report-mobile-card').length;
        return { twDisplay, mcDisplay, mobileCardItems };
      })()
    `);
    assert(mobileViewCheck.twDisplay === 'none', `Mobile (<=768px): Desktop table is hidden (display: ${mobileViewCheck.twDisplay})`);
    assert(mobileViewCheck.mcDisplay === 'flex', `Mobile (<=768px): Mobile cards container is visible (display: ${mobileViewCheck.mcDisplay})`);
    assert(mobileViewCheck.mobileCardItems > 0, `Mobile (<=768px): Rendered ${mobileViewCheck.mobileCardItems} mobile vertical cards`);

    await evalJs(`document.getElementById('reportPreviewMobileCards')?.scrollIntoView();`);
    await sleep(400);
    await captureScreenshot('teacher_reports_mobile_cards.png');

    // ========================================================================
    // TEST 5: DYNAMIC FILTER VISIBILITY & RESET
    // ========================================================================
    console.log('\n--- TEST 5: Dynamic Filter Visibility & Reset Action ---');
    await setViewport(1440, 900);

    // Switch to student-profile -> irrelevant filters hidden
    await evalJs(`
      (() => {
        const card = document.querySelector('.erp-report-card[data-report="student-profile"]');
        if (card) card.click();
      })()
    `);
    await sleep(500);

    const profileFilterCheck = await evalJs(`
      (() => {
        const fSem = document.getElementById('fieldSemester')?.style.display;
        const fCourse = document.getElementById('fieldCourse')?.style.display;
        const fDates = document.getElementById('fieldStartDate')?.style.display;
        return { fSem, fCourse, fDates };
      })()
    `);
    assert(profileFilterCheck.fSem === 'none' && profileFilterCheck.fDates === 'none', 'student-profile hides semester and date range filters');
    assert(profileFilterCheck.fCourse !== 'none', 'student-profile retains assigned course filter');

    // Switch to timetable -> Day of week should be visible
    await evalJs(`
      (() => {
        const card = document.querySelector('.erp-report-card[data-report="timetable"]');
        if (card) card.click();
      })()
    `);
    await sleep(500);

    const timetableFilterCheck = await evalJs(`
      (() => {
        const fDay = document.getElementById('fieldDayOfWeek')?.style.display;
        return { fDay };
      })()
    `);
    assert(timetableFilterCheck.fDay !== 'none', 'timetable shows Day of Week filter input');

    // Test Reset Filters
    await evalJs(`
      (() => {
        const course = document.getElementById('filterCourse');
        if (course && course.options.length > 1) course.value = course.options[1].value;
        document.getElementById('btnResetFilters')?.click();
      })()
    `);
    await sleep(600);

    const resetCheck = await evalJs(`
      (() => {
        return document.getElementById('filterCourse')?.value;
      })()
    `);
    assert(resetCheck === '', 'Reset Filters clears filter values and refreshes preview');

    // ========================================================================
    // TEST 6: ZERO PAGE-LEVEL HORIZONTAL OVERFLOW (7 VIEWPORTS)
    // ========================================================================
    console.log('\n--- TEST 6: Zero Page-Level Horizontal Overflow Across 7 Viewports ---');
    const testViewports = [
      { name: '320px (Mobile Mini)', width: 320, height: 640 },
      { name: '375px (iPhone SE)', width: 375, height: 667 },
      { name: '390px (iPhone 12/13/14)', width: 390, height: 844 },
      { name: '430px (iPhone Pro Max)', width: 430, height: 932 },
      { name: '768px (Tablet Portrait)', width: 768, height: 1024 },
      { name: '1024px (Tablet Landscape)', width: 1024, height: 768 },
      { name: '1440px (Desktop Full HD)', width: 1440, height: 900 }
    ];

    for (const vp of testViewports) {
      await setViewport(vp.width, vp.height);
      await sleep(150);

      const overflow = await evalJs(`
        (() => {
          const scrollW = document.documentElement.scrollWidth;
          const innerW = window.innerWidth;
          return {
            scrollW,
            innerW,
            hasOverflow: scrollW > innerW
          };
        })()
      `);

      assert(!overflow.hasOverflow, `Zero horizontal overflow at ${vp.name} (${overflow.scrollW}px <= ${overflow.innerW}px)`);
    }

    // ========================================================================
    // TEST 7: PRINT STYLESHEET INTEGRITY
    // ========================================================================
    console.log('\n--- TEST 7: Print Stylesheet Validation ---');
    const printCheck = await evalJs(`
      (() => {
        const styleSheets = Array.from(document.styleSheets);
        let hasPrintMedia = false;
        let hidesNavbar = false;
        let hidesFilters = false;

        for (const sheet of styleSheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const r of rules) {
              if (r.type === CSSRule.MEDIA_RULE && r.media && r.media.mediaText.includes('print')) {
                hasPrintMedia = true;
                const innerRules = Array.from(r.cssRules || []).map(ir => ir.cssText);
                if (innerRules.some(t => t.includes('portal-navbar') || t.includes('no-print'))) hidesNavbar = true;
                if (innerRules.some(t => t.includes('filter-card') || t.includes('no-print'))) hidesFilters = true;
              }
            }
          } catch (e) {}
        }

        return { hasPrintMedia, hidesNavbar, hidesFilters };
      })()
    `);

    assert(printCheck.hasPrintMedia, '@media print rules defined in stylesheets');
    assert(printCheck.hidesNavbar && printCheck.hidesFilters, 'Print styles hide navbar, headers, filter card, and export action buttons');

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
