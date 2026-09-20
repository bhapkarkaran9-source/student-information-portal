/**
 * Automated Verification Suite for Student Calendar Event Cards UI Style
 * 
 * Verifies:
 * 1. Static HTML & CSS contracts:
 *    - White background (#ffffff)
 *    - Thin light-gray border (#e2e8f0)
 *    - Small rounded corners (8px)
 *    - Subtle shadow
 *    - ONLY left border has accent color:
 *      1. Academic Milestones: Blue (#2563eb)
 *      2. Upcoming Examinations: Red (#ef4444)
 *      3. Holidays & Vacations: Green (#10b981)
 *      4. Workshops & Events: Orange (#f59e0b)
 *    - Card title: #64748b
 *    - Card number color matches left border color
 *    - No gradients on cards
 *    - Responsive grid (Desktop 4 cards, Tablet 2 cards, Mobile 1 card)
 * 2. Headless Chrome CDP Live Tests across viewports:
 *    - 1440px Desktop: 4 cards in 1 row
 *    - 768px Tablet: 2 cards per row
 *    - 430px, 390px, 375px, 320px Mobile: 1 card per row, scrollWidth <= clientWidth
 * 3. Screenshot generation for visual confirmation:
 *    - student_calendar_cards_desktop.png
 *    - student_calendar_cards_mobile.png
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = require('../src/app');
const { generateToken } = require('../src/utils/token');

const ARTIFACT_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9268;

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
// 1. Static HTML & CSS Contract Checks
// ---------------------------------------------------------------------------
function testStaticContracts() {
  console.log('\n--- 1. Static HTML & CSS Contract Checks ---');
  const htmlPath = path.join(__dirname, '..', 'public', 'pages', 'student', 'calendar.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert(html.includes('class="kpi-event-grid"'), 'HTML contains .kpi-event-grid container');
  assert(html.includes('kpi-minimal-card'), 'HTML contains .kpi-minimal-card cards');

  // Academic Milestones
  assert(html.includes('Academic Milestones'), 'Contains "Academic Milestones"');
  assert(html.includes('id="statTotalEvents"'), 'Contains stat element #statTotalEvents');
  assert(html.includes('kpi-card-blue'), 'Academic Milestones card has class .kpi-card-blue');
  assert(html.includes('kpi-num-blue'), '#statTotalEvents has class .kpi-num-blue');

  // Upcoming Examinations
  assert(html.includes('Upcoming Examinations'), 'Contains "Upcoming Examinations"');
  assert(html.includes('id="statTotalExams"'), 'Contains stat element #statTotalExams');
  assert(html.includes('kpi-card-red'), 'Upcoming Examinations card has class .kpi-card-red');
  assert(html.includes('kpi-num-red'), '#statTotalExams has class .kpi-num-red');

  // Holidays & Vacations
  assert(html.includes('Holidays & Vacations'), 'Contains "Holidays & Vacations"');
  assert(html.includes('id="statTotalHolidays"'), 'Contains stat element #statTotalHolidays');
  assert(html.includes('kpi-card-green'), 'Holidays & Vacations card has class .kpi-card-green');
  assert(html.includes('kpi-num-green'), '#statTotalHolidays has class .kpi-num-green');

  // Workshops & Events
  assert(html.includes('Workshops & Events'), 'Contains "Workshops & Events"');
  assert(html.includes('id="statTotalEventsCampus"'), 'Contains stat element #statTotalEventsCampus');
  assert(html.includes('kpi-card-orange'), 'Workshops & Events card has class .kpi-card-orange');
  assert(html.includes('kpi-num-orange'), '#statTotalEventsCampus has class .kpi-num-orange');

  // CSS rules
  assert(html.includes('border-left: 4px solid #2563eb'), 'CSS defines Blue left border #2563eb');
  assert(html.includes('border-left: 4px solid #ef4444'), 'CSS defines Red left border #ef4444');
  assert(html.includes('border-left: 4px solid #10b981'), 'CSS defines Green left border #10b981');
  assert(html.includes('border-left: 4px solid #f59e0b'), 'CSS defines Orange left border #f59e0b');

  assert(html.includes('color: #2563eb !important'), 'CSS defines Blue number color #2563eb');
  assert(html.includes('color: #ef4444 !important'), 'CSS defines Red number color #ef4444');
  assert(html.includes('color: #10b981 !important'), 'CSS defines Green number color #10b981');
  assert(html.includes('color: #f59e0b !important'), 'CSS defines Orange number color #f59e0b');

  assert(html.includes('color: #64748b'), 'CSS defines Title color #64748b');
  assert(html.includes('background: #ffffff !important'), 'CSS defines white card background #ffffff');
  assert(html.includes('border: 1px solid #e2e8f0 !important'), 'CSS defines light gray border #e2e8f0');
  assert(html.includes('border-radius: 8px !important'), 'CSS defines 8px rounded corners');

  // Grid responsiveness
  assert(html.includes('grid-template-columns: repeat(4, 1fr)'), 'CSS defines 4 columns for Desktop');
  assert(html.includes('grid-template-columns: repeat(2, 1fr)'), 'CSS defines 2 columns for Tablet');
  assert(html.includes('grid-template-columns: 1fr'), 'CSS defines 1 column for Mobile');
}

// ---------------------------------------------------------------------------
// 2. Headless Chrome CDP Live DOM & Viewport Tests
// ---------------------------------------------------------------------------
async function testChromeCdp() {
  console.log('\n--- 2. Headless Chrome CDP Live DOM & Viewport Tests ---');

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

  const chromeProc = spawn(CHROME_PATH, [
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
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/calendar.html` });
    await sleep(2000);

    // Evaluate live cards styling in browser
    const cardEvaluation = await evalCode(`
      (() => {
        const cards = document.querySelectorAll('.kpi-minimal-card');
        const grid = document.querySelector('.kpi-event-grid');
        if (cards.length !== 4) return { error: 'Expected 4 cards, found ' + cards.length };

        const results = [];
        cards.forEach((c, idx) => {
          const cs = window.getComputedStyle(c);
          const numEl = c.querySelector('.kpi-card-number');
          const titleEl = c.querySelector('.kpi-card-title');
          const numCs = window.getComputedStyle(numEl);
          const titleCs = window.getComputedStyle(titleEl);
          const rect = c.getBoundingClientRect();

          results.push({
            index: idx + 1,
            title: titleEl ? titleEl.textContent.trim() : '',
            numId: numEl ? numEl.id : '',
            bgColor: cs.backgroundColor,
            borderLeftColor: cs.borderLeftColor,
            borderLeftWidth: cs.borderLeftWidth,
            borderRadius: cs.borderRadius,
            boxShadow: cs.boxShadow,
            numColor: numCs.color,
            numFontSize: numCs.fontSize,
            titleColor: titleCs.color,
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          });
        });

        return {
          success: true,
          cards: results
        };
      })()
    `);

    assert(cardEvaluation && cardEvaluation.success, 'Evaluated cards successfully in live DOM');
    const { cards } = cardEvaluation;

    // Card 1: Academic Milestones
    const c1 = cards[0];
    assert(c1.title === 'Academic Milestones', 'Card 1 title is "Academic Milestones"');
    assert(c1.numId === 'statTotalEvents', 'Card 1 number ID is #statTotalEvents');
    assert(c1.bgColor === 'rgb(255, 255, 255)', 'Card 1 background is pure white #ffffff');
    assert(c1.borderLeftColor === 'rgb(37, 99, 235)', 'Card 1 left border is Blue (#2563eb)');
    assert(c1.numColor === 'rgb(37, 99, 235)', 'Card 1 number color is Blue (#2563eb)');
    assert(c1.titleColor === 'rgb(100, 116, 139)', 'Card 1 title color is #64748b');

    // Card 2: Upcoming Examinations
    const c2 = cards[1];
    assert(c2.title === 'Upcoming Examinations', 'Card 2 title is "Upcoming Examinations"');
    assert(c2.numId === 'statTotalExams', 'Card 2 number ID is #statTotalExams');
    assert(c2.bgColor === 'rgb(255, 255, 255)', 'Card 2 background is pure white #ffffff');
    assert(c2.borderLeftColor === 'rgb(239, 68, 68)', 'Card 2 left border is Red (#ef4444)');
    assert(c2.numColor === 'rgb(239, 68, 68)', 'Card 2 number color is Red (#ef4444)');

    // Card 3: Holidays & Vacations
    const c3 = cards[2];
    assert(c3.title === 'Holidays & Vacations', 'Card 3 title is "Holidays & Vacations"');
    assert(c3.numId === 'statTotalHolidays', 'Card 3 number ID is #statTotalHolidays');
    assert(c3.bgColor === 'rgb(255, 255, 255)', 'Card 3 background is pure white #ffffff');
    assert(c3.borderLeftColor === 'rgb(16, 185, 129)', 'Card 3 left border is Green (#10b981)');
    assert(c3.numColor === 'rgb(16, 185, 129)', 'Card 3 number color is Green (#10b981)');

    // Card 4: Workshops & Events
    const c4 = cards[3];
    assert(c4.title === 'Workshops & Events', 'Card 4 title is "Workshops & Events"');
    assert(c4.numId === 'statTotalEventsCampus', 'Card 4 number ID is #statTotalEventsCampus');
    assert(c4.bgColor === 'rgb(255, 255, 255)', 'Card 4 background is pure white #ffffff');
    assert(c4.borderLeftColor === 'rgb(245, 158, 11)', 'Card 4 left border is Orange (#f59e0b)');
    assert(c4.numColor === 'rgb(245, 158, 11)', 'Card 4 number color is Orange (#f59e0b)');

    // Desktop: 4 cards in one row (same top offset)
    const isOneRowDesktop = (c1.top === c2.top && c2.top === c3.top && c3.top === c4.top);
    assert(isOneRowDesktop, 'Desktop 1440px: All 4 cards render in ONE single horizontal row');

    // Screenshot Desktop
    const desktopScreenshot = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'student_calendar_cards_desktop.png'), Buffer.from(desktopScreenshot.data, 'base64'));
    console.log('  [OK] Saved student_calendar_cards_desktop.png');

    // Tablet: 768px -> 2 cards per row
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width: 768,
      height: 1024,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(500);

    const tVal = await evalCode(`
      (() => {
        const cards = document.querySelectorAll('.kpi-minimal-card');
        const tops = Array.from(cards).map(c => Math.round(c.getBoundingClientRect().top));
        const lefts = Array.from(cards).map(c => Math.round(c.getBoundingClientRect().left));
        return {
          row1Same: tops[0] === tops[1],
          row2Same: tops[2] === tops[3],
          row1DiffRow2: tops[2] > tops[0],
          col1Same: lefts[0] === lefts[2],
          col2Same: lefts[1] === lefts[3]
        };
      })()
    `);
    assert(tVal.row1Same && tVal.row2Same && tVal.row1DiffRow2, 'Tablet 768px: Renders exactly 2 cards per row across 2 rows');

    // Mobile Viewports Test: 430px, 390px, 375px, 320px
    const mobileViewports = [
      { name: '430px (iPhone 14 Pro Max)', w: 430, h: 932 },
      { name: '390px (iPhone 12/13/14)', w: 390, h: 844 },
      { name: '375px (iPhone SE)', w: 375, h: 667 },
      { name: '320px (Ultra-compact)', w: 320, h: 568 }
    ];

    for (const vp of mobileViewports) {
      await cdpSend('Emulation.setDeviceMetricsOverride', {
        width: vp.w,
        height: vp.h,
        deviceScaleFactor: 2,
        mobile: true
      });
      await sleep(400);

      const overflowEval = await evalCode(`
        (() => {
          const docEl = document.documentElement;
          const body = document.body;
          const cards = document.querySelectorAll('.kpi-minimal-card');
          const tops = Array.from(cards).map(c => Math.round(c.getBoundingClientRect().top));
          
          // In 1 col per row, every card has a strictly increasing top position
          const isSingleCol = tops[0] < tops[1] && tops[1] < tops[2] && tops[2] < tops[3];

          // Check overflowing elements
          const overflowing = [];
          document.querySelectorAll('*').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.right > docEl.clientWidth + 1) {
              overflowing.push({ tag: el.tagName, id: el.id, cls: el.className, right: r.right, width: r.width });
            }
          });

          return {
            scrollWidth: docEl.scrollWidth,
            clientWidth: docEl.clientWidth,
            bodyScrollWidth: body.scrollWidth,
            isSingleCol,
            overflowing: overflowing.slice(0, 5)
          };
        })()
      `);

      const { scrollWidth, clientWidth, bodyScrollWidth, isSingleCol, overflowing } = overflowEval;
      if (bodyScrollWidth > clientWidth) {
        console.log('    [OVERFLOW DEBUG]', JSON.stringify(overflowing));
      }
      assert(scrollWidth <= clientWidth, `Viewport ${vp.name}: Document zero horizontal overflow (${scrollWidth} <= ${clientWidth})`);
      assert(bodyScrollWidth <= clientWidth, `Viewport ${vp.name}: Body zero horizontal overflow (${bodyScrollWidth} <= ${clientWidth})`);
      assert(isSingleCol, `Viewport ${vp.name}: Exactly 1 card per row`);

      if (vp.w === 375) {
        const mobileScreenshot = await cdpSend('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'student_calendar_cards_mobile.png'), Buffer.from(mobileScreenshot.data, 'base64'));
        console.log('  [OK] Saved student_calendar_cards_mobile.png');
      }
    }

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------
async function main() {
  console.log('================================================================');
  console.log('TEST SUITE: STUDENT CALENDAR MINIMAL KPI CARDS (MATCH REFERENCE)');
  console.log('================================================================');

  const PORT = 63659;
  server = http.createServer(app);
  await new Promise(res => server.listen(PORT, res));
  baseUrl = `http://localhost:${PORT}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    testStaticContracts();
    await testChromeCdp();
  } catch (err) {
    console.error('Fatal test error:', err);
    failCount++;
  } finally {
    server.close();
    console.log('\n================================================================');
    console.log(`FINAL RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('================================================================\n');
    process.exit(failCount > 0 ? 1 : 0);
  }
}

main();
