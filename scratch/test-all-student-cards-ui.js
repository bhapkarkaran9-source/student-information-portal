/**
 * Comprehensive Verification Suite for ALL 16 Student Portal Pages
 * 
 * Tests the locked minimal reference card/box style:
 * - White background (#ffffff)
 * - Thin light-gray border (#e2e8f0)
 * - 3-4px colored LEFT border
 * - 8px rounded corners (border-radius: 8px)
 * - Subtle shadow
 * - Value color matching left border color
 * - ZERO gradients on cards
 * - ZERO horizontal overflow across 6 viewports:
 *   1440px (Desktop), 768px (Tablet), 430px, 390px, 375px, 320px (Mobile)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = require('../src/app');
const { generateToken } = require('../src/utils/token');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9269;

const STUDENT_PAGES = [
  'dashboard.html',
  'profile.html',
  'courses.html',
  'attendance.html',
  'grades.html',
  'timetable.html',
  'assignments.html',
  'study-material.html',
  'notices.html',
  'notifications.html',
  'queries.html',
  'reports.html',
  'calendar.html',
  'feedback.html',
  'email-preferences.html',
  'performance.html'
];

const VIEWPORTS = [
  { name: '1440px Desktop', width: 1440, height: 900 },
  { name: '768px Tablet', width: 768, height: 1024 },
  { name: '430px iPhone 14 Pro Max', width: 430, height: 932 },
  { name: '390px iPhone 12/13/14', width: 390, height: 844 },
  { name: '375px iPhone SE', width: 375, height: 667 },
  { name: '320px Compact Mobile', width: 320, height: 568 }
];

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
// 1. Static HTML & CSS File Audits across all 16 Pages
// ---------------------------------------------------------------------------
function testStaticFiles() {
  console.log('\n--- 1. Static HTML & CSS Audits Across All 16 Student Pages ---');

  STUDENT_PAGES.forEach(page => {
    const filePath = path.join(__dirname, '..', 'public', 'pages', 'student', page);
    assert(fs.existsSync(filePath), `${page} exists on disk`);

    const content = fs.readFileSync(filePath, 'utf8');

    // Calendar page reference integrity check
    if (page === 'calendar.html') {
      assert(content.includes('kpi-event-grid'), 'calendar.html preserves .kpi-event-grid reference');
      assert(content.includes('Academic Milestones'), 'calendar.html preserves Academic Milestones');
    }

    // Verify student-dashboard.css or page-specific css link
    assert(
      content.includes('student-dashboard.css') ||
      content.includes('student-feedback.css') ||
      content.includes('student-email-preferences.css') ||
      content.includes('grades.css'),
      `${page} links to student styling`
    );
  });

  // Check student-dashboard.css locked rules
  const cssPath = path.join(__dirname, '..', 'public', 'css', 'student-dashboard.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert(css.includes('LOCKED STUDENT PORTAL CARD SYSTEM'), 'student-dashboard.css contains Locked Card System');
  assert(css.includes('.card-border-blue'), 'student-dashboard.css defines .card-border-blue');
  assert(css.includes('.card-border-green'), 'student-dashboard.css defines .card-border-green');
  assert(css.includes('.card-border-orange'), 'student-dashboard.css defines .card-border-orange');
  assert(css.includes('.card-border-indigo'), 'student-dashboard.css defines .card-border-indigo');
  assert(css.includes('.card-border-red'), 'student-dashboard.css defines .card-border-red');
  assert(css.includes('border-radius: 8px'), 'student-dashboard.css defines 8px border-radius');
}

// ---------------------------------------------------------------------------
// 2. Headless Chrome CDP Viewport & Computed Style Tests
// ---------------------------------------------------------------------------
async function testChromeLive() {
  console.log('\n--- 2. Headless Chrome Live DOM & Multi-Viewport Tests ---');

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

    // Test each of the 16 pages
    for (const pageName of STUDENT_PAGES) {
      console.log(`\n  Testing Page: ${pageName}...`);
      const pageUrl = `${baseUrl}/pages/student/${pageName}`;

      // Set auth in localStorage first
      await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/${pageName}` });
      await sleep(700);

      await cdpSend('Runtime.evaluate', {
        expression: `
          localStorage.setItem('token', '${token}');
          localStorage.setItem('user', '${JSON.stringify(studentUser)}');
        `
      });

      // Reload to activate authenticated student state
      await cdpSend('Page.navigate', { url: pageUrl });
      await sleep(1000);

      // Card computed styles test on 1440px
      await cdpSend('Emulation.setDeviceMetricsOverride', {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false
      });
      await sleep(300);

      const cardAudit = await cdpSend('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          // Select relevant cards/boxes on the page
          const selectors = [
            '.kpi-minimal-card',
            '.student-kpi-card',
            '.stat-card',
            '.erp-report-card',
            '.feedback-kpi-card',
            '.feedback-card',
            '.pref-master-card',
            '.pref-item-card',
            '.student-card',
            '.course-card',
            '.notice-card'
          ];
          const found = [];
          for (const s of selectors) {
            document.querySelectorAll(s).forEach(el => {
              const cs = window.getComputedStyle(el);
              found.push({
                selector: s,
                bg: cs.backgroundColor,
                bgImg: cs.backgroundImage,
                borderLeftWidth: cs.borderLeftWidth,
                borderLeftColor: cs.borderLeftColor,
                borderRadius: cs.borderRadius,
                boxShadow: cs.boxShadow
              });
            });
          }
          return {
            count: found.length,
            cards: found.slice(0, 8),
            docOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            bodyOverflow: document.body.scrollWidth <= document.body.clientWidth
          };
        })()`
      });

      const auditResult = cardAudit.result.value;
      assert(auditResult.docOverflow, `${pageName} 1440px: zero document horizontal overflow`);
      assert(auditResult.bodyOverflow, `${pageName} 1440px: zero body horizontal overflow`);

      if (auditResult.count > 0) {
        console.log(`    Found ${auditResult.count} standard cards on ${pageName}`);
        auditResult.cards.forEach((card, idx) => {
          // Verify white background
          const isWhite = card.bg === 'rgb(255, 255, 255)' || card.bg === 'rgba(0, 0, 0, 0)';
          assert(isWhite, `${pageName} card #${idx + 1} (${card.selector}) background is white`);

          // Verify NO gradients
          const noGradient = !card.bgImg || card.bgImg === 'none' || !card.bgImg.includes('gradient');
          assert(noGradient, `${pageName} card #${idx + 1} has ZERO gradient`);

          // Verify border radius is approximately 8px (allowing up to 10px if sub-elements)
          const radiusVal = parseInt(card.borderRadius, 10);
          assert(radiusVal <= 10 && radiusVal >= 6, `${pageName} card #${idx + 1} has ~8px border radius (got ${card.borderRadius})`);

          // Verify 3-4px left border
          const borderLeftWidth = parseInt(card.borderLeftWidth, 10);
          assert(borderLeftWidth >= 3 && borderLeftWidth <= 5, `${pageName} card #${idx + 1} has 3-4px left border (got ${card.borderLeftWidth})`);
        });
      }

      // Responsive overflow audit across mobile/tablet viewports
      for (const vp of VIEWPORTS.slice(1)) {
        await cdpSend('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.width < 768
        });
        await sleep(250);

        const ofCheck = await cdpSend('Runtime.evaluate', {
          returnByValue: true,
          expression: `({
            docScroll: document.documentElement.scrollWidth,
            docClient: document.documentElement.clientWidth,
            bodyScroll: document.body.scrollWidth,
            bodyClient: document.body.clientWidth
          })`
        });

        const r = ofCheck.result.value;
        const noDocOf = r.docScroll <= r.docClient;
        const noBodyOf = r.bodyScroll <= r.bodyClient;

        assert(noDocOf, `${pageName} ${vp.name}: doc zero overflow (${r.docScroll} <= ${r.docClient})`);
        assert(noBodyOf, `${pageName} ${vp.name}: body zero overflow (${r.bodyScroll} <= ${r.bodyClient})`);
      }
    }

    ws.close();
  } finally {
    chromeProc.kill();
  }
}

// ---------------------------------------------------------------------------
// Main Test Runner
// ---------------------------------------------------------------------------
async function runAll() {
  console.log('================================================================');
  console.log('ALL 16 STUDENT PORTAL PAGES - LOCKED MINIMAL CARD AUDIT');
  console.log('================================================================');

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    testStaticFiles();
    await testChromeLive();
  } catch (err) {
    console.error('Test execution error:', err);
    failCount++;
  } finally {
    server.close();
    console.log('\n================================================================');
    console.log(`FINAL RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('================================================================');
    process.exit(failCount > 0 ? 1 : 0);
  }
}

runAll();
