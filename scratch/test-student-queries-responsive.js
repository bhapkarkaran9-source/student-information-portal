const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { generateToken } = require('../src/utils/token');

const ARTIFACTS_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9260;

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
  console.log('  STUDENT QUERIES - FULL-WIDTH TABLE & RESPONSIVE UI VERIFICATION');
  console.log('========================================================================\n');

  // 1. Generate Student Token
  console.log('[1/5] Generating Student Token...');
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
  console.log('[2/5] Launching Headless Chrome on port ' + CDP_PORT + '...');
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
    console.log('\n[3/5] Verifying Full-Width Desktop Layout (1440px)...');
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await cdpSend('Page.navigate', { url: 'http://localhost:5000/login.html' });
    await sleep(1000);

    await evaluate(`
      localStorage.setItem('token', '${token}');
      localStorage.setItem('user', JSON.stringify(${JSON.stringify(userData)}));
    `);

    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/student/queries.html' });
    await sleep(2500);

    const desktopMetrics = await evaluate(`
      (() => {
        const main = document.querySelector('.dashboard-main');
        const card = document.querySelector('#queryListingCard');
        const table = document.querySelector('#studentQueriesTable');
        const filterCard = document.querySelector('#queryFilterCard');
        const headers = Array.from(document.querySelectorAll('#studentQueriesTable thead th')).map(th => th.textContent.trim());
        const rows = document.querySelectorAll('#studentQueriesTableBody tr').length;

        const mainRect = main.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const tableRect = table.getBoundingClientRect();
        const filterRect = filterCard.getBoundingClientRect();

        return {
          title: document.title,
          headers,
          headerCount: headers.length,
          rows,
          mainWidth: mainRect.width,
          cardWidth: cardRect.width,
          tableWidth: tableRect.width,
          filterWidth: filterRect.width,
          cardSpanPct: (cardRect.width / mainRect.width) * 100,
          tableSpanPct: (tableRect.width / cardRect.width) * 100,
          tableLeft: tableRect.left,
          tableRight: tableRect.right,
          cardLeft: cardRect.left,
          cardRight: cardRect.right,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
      })()
    `);

    console.log('  ✓ Page Title:', desktopMetrics.title);
    console.log('  ✓ Table Headers (8 columns):', desktopMetrics.headers);
    console.log('  ✓ Header count:', desktopMetrics.headerCount, '(Expected 8)');
    console.log(`  ✓ Main Width: ${desktopMetrics.mainWidth}px, Card Width: ${desktopMetrics.cardWidth}px, Table Width: ${desktopMetrics.tableWidth}px`);
    console.log(`  ✓ Card Span: ${desktopMetrics.cardSpanPct.toFixed(1)}% of content area`);
    console.log(`  ✓ Table Span: ${desktopMetrics.tableSpanPct.toFixed(1)}% of card area`);
    console.log(`  ✓ Horizontal Overflow: ${desktopMetrics.hasOverflow ? 'FAIL' : 'NONE'}`);

    if (desktopMetrics.headerCount !== 8) {
      throw new Error(`Expected exactly 8 columns, found ${desktopMetrics.headerCount}: ${desktopMetrics.headers}`);
    }
    if (desktopMetrics.tableSpanPct < 98) {
      throw new Error(`Table does not occupy full card width! Span is only ${desktopMetrics.tableSpanPct.toFixed(1)}%`);
    }

    const ssDesktop = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'student_queries_desktop_fullwidth.png'), Buffer.from(ssDesktop.data, 'base64'));
    console.log('  ✓ Screenshot saved: student_queries_desktop_fullwidth.png');

    // 4. Test Empty State
    console.log('\n[4/5] Testing Professional Empty State...');
    await evaluate(`
      const search = document.getElementById('searchInput');
      search.value = 'NON_EXISTENT_QUERY_SEARCH_XYZ_999';
      search.dispatchEvent(new Event('input'));
    `);
    await sleep(1000);

    const emptyMetrics = await evaluate(`
      (() => {
        const emptyState = document.getElementById('queryEmptyState');
        const emptyTitle = document.getElementById('emptyStateTitle')?.textContent?.trim();
        const emptyDesc = document.getElementById('emptyStateDesc')?.textContent?.trim();
        const emptyRect = emptyState?.getBoundingClientRect();
        const cardRect = document.getElementById('queryListingCard')?.getBoundingClientRect();

        return {
          visible: !emptyState?.classList.contains('hidden'),
          emptyTitle,
          emptyDesc,
          emptyWidth: emptyRect?.width,
          cardWidth: cardRect?.width,
          emptySpanPct: (emptyRect?.width / cardRect?.width) * 100
        };
      })()
    `);

    console.log('  ✓ Empty State Visible:', emptyMetrics.visible);
    console.log('  ✓ Empty State Title:', emptyMetrics.emptyTitle);
    console.log('  ✓ Empty State Desc:', emptyMetrics.emptyDesc);
    console.log(`  ✓ Empty State Width: ${emptyMetrics.emptyWidth}px (${emptyMetrics.emptySpanPct.toFixed(1)}% of card)`);

    const ssEmpty = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'student_queries_empty_state.png'), Buffer.from(ssEmpty.data, 'base64'));
    console.log('  ✓ Screenshot saved: student_queries_empty_state.png');

    // Reset search
    await evaluate(`
      const resetBtn = document.getElementById('btnResetFilters');
      resetBtn.click();
    `);
    await sleep(1000);

    // 5. Test Responsive Viewports & Mobile Cards
    console.log('\n[5/5] Testing All Responsive Viewports...');
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
          const tableWrapper = document.querySelector('.query-table-wrapper');
          const mobileContainer = document.querySelector('.query-mobile-cards-container');
          const mobileCards = document.querySelectorAll('.query-mobile-card');
          const tableCs = window.getComputedStyle(tableWrapper);
          const mobileCs = window.getComputedStyle(mobileContainer);

          return {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            isMobile,
            tableDisplay: tableCs.display,
            mobileDisplay: mobileCs.display,
            mobileCardsCount: mobileCards.length
          };
        })()
      `);

      const pass = !vpMetrics.hasOverflow;
      console.log(`  ✓ ${vp.name.padEnd(30)}: clientWidth=${vpMetrics.clientWidth}, scrollWidth=${vpMetrics.scrollWidth}, Overflow=${vpMetrics.hasOverflow ? 'FAIL' : 'NONE'}, MobileCards=${vpMetrics.isMobile ? (vpMetrics.mobileDisplay !== 'none' ? 'ACTIVE' : 'INACTIVE') : 'DESKTOP TABLE'}`);

      if (!pass) {
        throw new Error(`Horizontal overflow on ${vp.name}! scrollWidth=${vpMetrics.scrollWidth}, clientWidth=${vpMetrics.clientWidth}`);
      }

      if (vp.width === 375) {
        await evaluate(`document.getElementById('queryListingCard')?.scrollIntoView({ behavior: 'instant', block: 'start' });`);
        await sleep(400);
        const ssMobile = await cdpSend('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACTS_DIR, 'student_queries_mobile_cards.png'), Buffer.from(ssMobile.data, 'base64'));
        console.log('    ✓ Screenshot saved: student_queries_mobile_cards.png');
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
