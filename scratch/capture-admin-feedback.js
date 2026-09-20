const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9247;
const ARTIFACT_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function postJson(url, data, token = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const parsed = new URL(url);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) };
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
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function captureAdminFeedbackScreenshots() {
  console.log('Capturing Admin Feedback screenshots...');

  // 1. Auth Admin
  const adminAuth = await postJson('http://localhost:5000/api/auth/login', { username: 'admin', password: 'Admin@123' });
  const adminToken = adminAuth.data?.token;
  const adminUser = adminAuth.data?.user;

  // 2. Launch Chrome
  const chromeProcess = spawn(CHROME_PATH, [
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

    async function evalCode(expression) {
      const res = await cdpSend('Runtime.evaluate', {
        expression: `(() => { return (${expression}); })()`,
        returnByValue: true,
        awaitPromise: true
      });
      return res.result?.value;
    }

    // Set token & navigate
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/login.html' });
    await sleep(600);
    await evalCode(`
      localStorage.setItem('token', '${adminToken}');
      localStorage.setItem('user', JSON.stringify(${JSON.stringify(adminUser)}));
    `);

    // Screenshot 1: Desktop Dashboard (1440x900)
    await cdpSend('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/admin/feedback.html' });
    await sleep(1500);

    const shot1 = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'admin_feedback_dashboard_desktop.png'), Buffer.from(shot1.data, 'base64'));
    console.log('Saved admin_feedback_dashboard_desktop.png');

    // Screenshot 2: Questions Modal
    await evalCode(`
      const btn = document.querySelector('#formsTableBody .action-questions');
      if (btn) btn.click();
    `);
    await sleep(800);
    const shot2 = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'admin_feedback_questions_modal.png'), Buffer.from(shot2.data, 'base64'));
    console.log('Saved admin_feedback_questions_modal.png');

    // Close questions modal
    await evalCode(`document.getElementById('btnCloseQuestionsModal').click();`);
    await sleep(400);

    // Screenshot 3: Analytics Modal
    await evalCode(`
      const btn = document.querySelector('#formsTableBody .action-analytics');
      if (btn) btn.click();
    `);
    await sleep(800);
    const shot3 = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'admin_feedback_analytics_modal.png'), Buffer.from(shot3.data, 'base64'));
    console.log('Saved admin_feedback_analytics_modal.png');

    // Close analytics modal
    await evalCode(`document.getElementById('btnCloseAnalyticsModal').click();`);
    await sleep(400);

    // Screenshot 4: Mobile Viewport (390x844)
    await cdpSend('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(800);
    const shot4 = await cdpSend('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'admin_feedback_mobile.png'), Buffer.from(shot4.data, 'base64'));
    console.log('Saved admin_feedback_mobile.png');

  } catch (err) {
    console.error('Screenshot capture error:', err);
  } finally {
    chromeProcess.kill();
  }
}

captureAdminFeedbackScreenshots();
