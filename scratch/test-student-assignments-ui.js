const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { generateToken } = require('../src/utils/token');

const ARTIFACTS_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9283;

const VIEWPORTS = [
  { name: 'Mobile Mini (320px)', width: 320, height: 640 },
  { name: 'Mobile iPhone SE (375px)', width: 375, height: 667 },
  { name: 'Mobile iPhone 12/13/14 (390px)', width: 390, height: 844 },
  { name: 'Mobile iPhone Pro Max (430px)', width: 430, height: 932 },
  { name: 'Tablet iPad (768px)', width: 768, height: 1024 },
  { name: 'Tablet Landscape (1024px)', width: 1024, height: 768 },
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
  console.log('  STUDENT ASSIGNMENTS - FULL-WIDTH & RESPONSIVE UI VERIFICATION');
  console.log('========================================================================\n');

  // 1. Generate Student Token
  console.log('[1/6] Generating Student Token for Karan Bhapkar (Student ID: 96, User ID: 174)...');
  const token = generateToken({ user_id: 174, username: 'Karan', role: 'STUDENT' });
  const userData = {
    user_id: 174,
    username: 'Karan',
    role: 'STUDENT',
    full_name: 'Karan Bhapkar',
    student_id: 96,
    prn: 'B24IT1005'
  };

  // 2. Launch Chrome
  console.log('[2/6] Launching Headless Chrome on CDP port ' + CDP_PORT + '...');
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

  try {
    // 3. Desktop Verification (1440px)
    console.log('\n[3/6] Verifying Full-Width Desktop Layout (1440px)...');
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

    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/student/assignments.html' });
    await sleep(2500);

    const desktopMetrics = await evaluate(`
      (() => {
        const main = document.querySelector('.dashboard-main');
        const section = document.getElementById('assignmentScheduleSection');
        const table = document.getElementById('assignmentTable');
        const headers = Array.from(document.querySelectorAll('#assignmentTable thead th')).map(th => th.textContent.trim());
        const rows = document.querySelectorAll('#assignmentsTbody tr').length;
        const thElements = Array.from(document.querySelectorAll('#assignmentTable thead th'));
        const thPadding = thElements.length > 0 ? window.getComputedStyle(thElements[0]).padding : null;
        const thBg = thElements.length > 0 ? window.getComputedStyle(thElements[0]).backgroundColor : null;

        const mainRect = main.getBoundingClientRect();
        const sectionRect = section.getBoundingClientRect();
        const tableRect = table.getBoundingClientRect();

        const tabs = Array.from(document.querySelectorAll('.asg-tab-btn')).map(b => ({
          filter: b.getAttribute('data-filter'),
          text: b.textContent.replace(/\\s+/g, ' ').trim(),
          active: b.classList.contains('active')
        }));

        const statusBadges = Array.from(document.querySelectorAll('.badge-asg')).map(b => ({
          text: b.textContent.trim(),
          className: b.className
        }));

        const firstRowCells = Array.from(document.querySelectorAll('#assignmentsTbody tr:first-child td')).map(td => td.textContent.replace(/\\s+/g, ' ').trim());

        const wrapper = document.getElementById('assignmentTableWrapper');
        const colWidths = Array.from(document.querySelectorAll('#assignmentTable thead th')).map(th => ({
          text: th.textContent.trim(),
          width: th.getBoundingClientRect().width
        }));

        return {
          title: document.title,
          headers,
          headerCount: headers.length,
          rows,
          mainWidth: mainRect.width,
          sectionWidth: sectionRect.width,
          tableWidth: tableRect.width,
          wrapperScrollWidth: wrapper ? wrapper.scrollWidth : 0,
          wrapperClientWidth: wrapper ? wrapper.clientWidth : 0,
          hasTableScroll: wrapper ? wrapper.scrollWidth > wrapper.clientWidth : false,
          colWidths,
          sectionSpanPct: (sectionRect.width / mainRect.width) * 100,
          tableSpanPct: (tableRect.width / sectionRect.width) * 100,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          thPadding,
          thBg,
          tabs,
          statusBadges,
          firstRowCells
        };
      })()
    `);

    console.log('  ✓ Page Title:', desktopMetrics.title);
    console.log('  ✓ Table Headers (7 columns):', desktopMetrics.headers);
    console.log('  ✓ Header Count:', desktopMetrics.headerCount, '(Expected 7)');
    console.log(`  ✓ Main Width: ${desktopMetrics.mainWidth}px, Section Width: ${desktopMetrics.sectionWidth}px, Table Width: ${desktopMetrics.tableWidth}px`);
    console.log(`  ✓ Wrapper Client: ${desktopMetrics.wrapperClientWidth}px, Wrapper Scroll: ${desktopMetrics.wrapperScrollWidth}px, Table Scrollbar: ${desktopMetrics.hasTableScroll ? 'YES (OVERFLOW)' : 'NONE'}`);
    console.log('  ✓ Column Widths:', desktopMetrics.colWidths);
    console.log(`  ✓ Section Span: ${desktopMetrics.sectionSpanPct.toFixed(1)}% of content area`);
    console.log(`  ✓ Table Span: ${desktopMetrics.tableSpanPct.toFixed(1)}% of section width`);
    console.log(`  ✓ Header Padding: ${desktopMetrics.thPadding}, Background: ${desktopMetrics.thBg}`);
    console.log('  ✓ Status Tabs:', desktopMetrics.tabs);
    console.log('  ✓ First Row Content:', desktopMetrics.firstRowCells);
    console.log(`  ✓ Horizontal Overflow: ${desktopMetrics.hasOverflow ? 'FAIL' : 'NONE'}`);

    if (desktopMetrics.headerCount !== 7) {
      throw new Error(`Expected exactly 7 columns, got ${desktopMetrics.headerCount}`);
    }
    if (desktopMetrics.tableSpanPct < 98) {
      throw new Error(`Table does not span full section width! Span: ${desktopMetrics.tableSpanPct.toFixed(1)}%`);
    }

    const ssDesktop = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'student_assignments_desktop_fullwidth.png'), Buffer.from(ssDesktop.data, 'base64'));
    console.log('  ✓ Screenshot saved: student_assignments_desktop_fullwidth.png');

    // 4. Test Tab Filtering & Empty States
    console.log('\n[4/6] Testing Tabs & Dynamic Empty States...');

    // Test Pending tab (0 items -> empty state)
    console.log('  Testing Pending Tab...');
    await evaluate(`document.getElementById('btnFilterPending').click();`);
    await sleep(400);

    const pendingState = await evaluate(`
      (() => {
        const empty = document.getElementById('assignmentEmptyState');
        const title = document.getElementById('emptyStateTitle')?.textContent?.trim();
        const desc = document.getElementById('emptyStateDesc')?.textContent?.trim();
        const tableWrapper = document.getElementById('assignmentTableWrapper');
        return {
          emptyVisible: empty && !empty.classList.contains('hidden') && window.getComputedStyle(empty).display !== 'none',
          title,
          desc,
          tableHidden: tableWrapper && window.getComputedStyle(tableWrapper).display === 'none'
        };
      })()
    `);

    console.log('  ✓ Pending Empty Visible:', pendingState.emptyVisible);
    console.log('  ✓ Pending Empty Title:', pendingState.title);
    console.log('  ✓ Pending Empty Desc:', pendingState.desc);
    console.log('  ✓ Table Hidden on Empty:', pendingState.tableHidden);

    if (!pendingState.emptyVisible || pendingState.title !== 'No pending assignments') {
      throw new Error('Pending tab empty state failed to render correctly');
    }

    const ssPendingEmpty = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'student_assignments_empty_state.png'), Buffer.from(ssPendingEmpty.data, 'base64'));
    console.log('  ✓ Screenshot saved: student_assignments_empty_state.png');

    // Test Evaluated tab (1 evaluated assignment -> table visible)
    console.log('  Testing Evaluated Tab...');
    await evaluate(`document.getElementById('btnFilterEvaluated').click();`);
    await sleep(400);

    const evalTabState = await evaluate(`
      (() => {
        const empty = document.getElementById('assignmentEmptyState');
        const rows = document.querySelectorAll('#assignmentsTbody tr').length;
        const tableWrapper = document.getElementById('assignmentTableWrapper');
        return {
          emptyHidden: empty && (empty.classList.contains('hidden') || window.getComputedStyle(empty).display === 'none'),
          rows,
          tableVisible: tableWrapper && window.getComputedStyle(tableWrapper).display !== 'none'
        };
      })()
    `);

    console.log('  ✓ Evaluated Tab Rows:', evalTabState.rows);
    console.log('  ✓ Evaluated Table Visible:', evalTabState.tableVisible);
    console.log('  ✓ Empty State Hidden:', evalTabState.emptyHidden);

    if (evalTabState.rows !== 1 || !evalTabState.tableVisible) {
      throw new Error('Evaluated tab failed to display the 1 evaluated assignment');
    }

    // Reset back to All tab
    await evaluate(`document.getElementById('btnFilterAll').click();`);
    await sleep(400);

    // 5. Test Action Modal Triggering
    console.log('\n[5/6] Testing Action Button & Modal Opening...');
    await evaluate(`
      const btn = document.querySelector('.btn-open-submit');
      if (btn) btn.click();
    `);
    await sleep(600);

    const modalState = await evaluate(`
      (() => {
        const modal = document.getElementById('submitModal');
        const title = document.getElementById('asgModalTitle')?.textContent?.trim();
        const evalContainer = document.getElementById('evalDetailsContainer');
        const marks = document.getElementById('evalCardMarks')?.textContent?.trim();
        return {
          modalVisible: modal && !modal.classList.contains('hidden'),
          title,
          evalVisible: evalContainer && window.getComputedStyle(evalContainer).display !== 'none',
          marks
        };
      })()
    `);

    console.log('  ✓ Modal Visible:', modalState.modalVisible);
    console.log('  ✓ Modal Title:', modalState.title);
    console.log('  ✓ Evaluation Details Visible:', modalState.evalVisible);
    console.log('  ✓ Marks Rendered in Modal:', modalState.marks);

    if (!modalState.modalVisible) {
      throw new Error('Submission/Evaluation modal failed to open upon action click');
    }

    // Close modal
    await evaluate(`
      const closeBtn = document.querySelector('[data-close-modal="submitModal"]');
      if (closeBtn) closeBtn.click();
    `);
    await sleep(400);

    // 6. Test Responsive Viewports & Mobile Cards
    console.log('\n[6/6] Testing All Responsive Viewports...');
    for (const vp of VIEWPORTS) {
      await cdpSend('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 1000
      });
      await sleep(600);

      const vpMetrics = await evaluate(`
        (() => {
          const isMobile = window.innerWidth <= 768;
          const tableWrapper = document.getElementById('assignmentTableWrapper');
          const mobileContainer = document.getElementById('assignmentMobileCardsContainer');
          const mobileCards = document.querySelectorAll('.assignment-mobile-card');
          const tableCs = tableWrapper ? window.getComputedStyle(tableWrapper) : null;
          const mobileCs = mobileContainer ? window.getComputedStyle(mobileContainer) : null;

          return {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            isMobile,
            tableDisplay: tableCs?.display,
            mobileDisplay: mobileCs?.display,
            mobileCardsCount: mobileCards.length
          };
        })()
      `);

      const pass = !vpMetrics.hasOverflow;
      console.log(`  ✓ ${vp.name.padEnd(30)}: clientWidth=${vpMetrics.clientWidth}, scrollWidth=${vpMetrics.scrollWidth}, Overflow=${vpMetrics.hasOverflow ? 'FAIL' : 'NONE'}, MobileCards=${vpMetrics.isMobile ? (vpMetrics.mobileDisplay !== 'none' ? 'ACTIVE' : 'INACTIVE') : 'DESKTOP TABLE'}`);

      if (!pass) {
        throw new Error(`Horizontal overflow detected on ${vp.name}! scrollWidth=${vpMetrics.scrollWidth}, clientWidth=${vpMetrics.clientWidth}`);
      }

      if (vp.width === 375) {
        await evaluate(`document.getElementById('assignmentScheduleSection')?.scrollIntoView({ behavior: 'instant', block: 'start' });`);
        await sleep(400);
        const ssMobile = await cdpSend('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACTS_DIR, 'student_assignments_mobile_cards.png'), Buffer.from(ssMobile.data, 'base64'));
        console.log('    ✓ Screenshot saved: student_assignments_mobile_cards.png');
      }
    }

    console.log('\n========================================================================');
    console.log('  ALL CHECKS PASSED SUCCESSFULLY!');
    console.log('========================================================================');

  } finally {
    try { ws.close(); } catch (_) {}
    try { chromeProcess.kill(); } catch (_) {}
  }
}

run().catch(err => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
