const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { generateToken } = require('../src/utils/token');

const ARTIFACTS_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9268;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    }).on('error', reject);
  });
}

async function inspect() {
  const token = generateToken({ user_id: 174, username: 'Karan', role: 'STUDENT' });
  const userData = { user_id: 174, username: 'Karan', role: 'STUDENT', full_name: 'Karan Bhapkar', student_id: 96, prn: 'B24IT1005' };

  const chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    'about:blank'
  ]);
  await sleep(1500);

  const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json`);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let nextId = 1;
  const cdp = (method, params = {}) => new Promise((res, rej) => {
    const id = nextId++;
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) rej(msg.error); else res(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await cdp('Page.enable');
  await cdp('Runtime.enable');

  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: 'http://localhost:5000/login.html' });
  await sleep(800);

  await cdp('Runtime.evaluate', {
    expression: `
      localStorage.setItem('token', '${token}');
      localStorage.setItem('user', JSON.stringify(${JSON.stringify(userData)}));
    `
  });

  await cdp('Page.navigate', { url: 'http://localhost:5000/pages/student/assignments.html' });
  await sleep(3500);

  const metrics = await cdp('Runtime.evaluate', {
    expression: `(() => {
      const main = document.querySelector('.dashboard-main');
      const card = document.querySelector('section.card') || document.querySelector('.card');
      const table = document.querySelector('table.data-table');
      const mainRect = main ? main.getBoundingClientRect() : null;
      const cardRect = card ? card.getBoundingClientRect() : null;
      const tableRect = table ? table.getBoundingClientRect() : null;
      const ths = Array.from(document.querySelectorAll('table th')).map(th => th.textContent.trim());
      return {
        url: window.location.href,
        title: document.title,
        mainWidth: mainRect?.width,
        cardWidth: cardRect?.width,
        tableWidth: tableRect?.width,
        cardSpanPct: (mainRect && cardRect) ? (cardRect.width / mainRect.width) * 100 : null,
        tableSpanPct: (cardRect && tableRect) ? (tableRect.width / cardRect.width) * 100 : null,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        headers: ths
      };
    })()`,
    returnByValue: true
  });

  console.log('Initial metrics:', metrics.result.value);

  const ss = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'student_assignments_initial_desktop.png'), Buffer.from(ss.data, 'base64'));
  console.log('Saved student_assignments_initial_desktop.png');

  try { ws.close(); } catch (_) {}
  try { chromeProcess.kill(); } catch (_) {}
  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
