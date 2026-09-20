const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { generateToken } = require('../src/utils/token');

const ARTIFACTS_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9250;

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
  const token = generateToken({ user_id: 174, username: 'Karan', role: 'STUDENT' });
  const userData = {
    user_id: 174,
    username: 'Karan',
    role: 'STUDENT',
    full_name: 'Karan Bhapkar',
    student_id: 96,
    prn: 'B24IT1005'
  };

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

  await cdpSend('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  await cdpSend('Page.navigate', { url: 'http://localhost:5000/login.html' });
  await sleep(1000);

  await cdpSend('Runtime.evaluate', {
    expression: `
      localStorage.setItem('token', '${token}');
      localStorage.setItem('user', JSON.stringify(${JSON.stringify(userData)}));
    `
  });

  await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/student/queries.html' });
  await sleep(2500);

  // Capture screenshot of current queries page
  const ss = await cdpSend('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'student_queries_initial_desktop.png'), Buffer.from(ss.data, 'base64'));

  const diag = await cdpSend('Runtime.evaluate', {
    expression: `(() => {
      const selectors = [
        'body',
        '.student-main-wrapper',
        '.dashboard-main',
        '.kpi-grid',
        '.page-header-row',
        '.table-responsive',
        '#studentQueriesTable',
        '#studentQueriesTableBody',
        '#studentQueriesTableBody tr'
      ];
      const results = {};
      selectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (!el) {
          results[sel] = 'NOT FOUND';
          return;
        }
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        results[sel] = {
          width: cs.width,
          maxWidth: cs.maxWidth,
          display: cs.display,
          boxWidth: rect.width,
          boxLeft: rect.left,
          boxRight: rect.right,
          flex: cs.flex,
          gridTemplateColumns: cs.gridTemplateColumns,
          classes: el.className
        };
      });

      // Also find all containers wrapping the table
      let cur = document.querySelector('#studentQueriesTable');
      const ancestry = [];
      while (cur && cur !== document.body) {
        const cs = window.getComputedStyle(cur);
        const rect = cur.getBoundingClientRect();
        ancestry.push({
          tag: cur.tagName,
          id: cur.id,
          class: cur.className,
          width: cs.width,
          maxWidth: cs.maxWidth,
          boxWidth: rect.width,
          boxLeft: rect.left,
          boxRight: rect.right
        });
        cur = cur.parentElement;
      }
      return { results, ancestry };
    })()`,
    returnByValue: true
  });

  console.log('DIAGNOSTICS RESULTS:');
  console.log(JSON.stringify(diag.result.value, null, 2));

  ws.close();
  chromeProcess.kill();
}

run().catch(console.error);
