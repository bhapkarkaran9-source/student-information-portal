const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9248;

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

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const parsed = new URL(url);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) };

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

async function capture() {
  console.log('Logging in student & teacher for screenshot capture...');
  const studentRes = await postJson('http://localhost:5000/api/auth/login', { username: 'Karan', password: 'Karan@123' });
  const studentToken = studentRes.data?.token;
  const studentUser = studentRes.data?.user;

  const teacherRes = await postJson('http://localhost:5000/api/auth/login', { username: 'Rohini', password: 'Rohini@123' });
  const teacherToken = teacherRes.data?.token;
  const teacherUser = teacherRes.data?.user;

  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    'about:blank'
  ]);
  await sleep(2200);

  const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json`);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let nextId = 1;
  const cdpSend = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = nextId++;
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for CDP ${method} (msgId=${msgId})`));
    }, 15000);

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

  async function evalCode(expression) {
    const res = await cdpSend('Runtime.evaluate', {
      expression: expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result?.value;
  }

  // --- 1. STUDENT SCREENSHOTS ---
  console.log('Capturing Student Email Preferences...');
  await cdpSend('Page.navigate', { url: 'http://localhost:5000/login.html' });
  await sleep(800);
  await evalCode(`
    localStorage.setItem('token', '${studentToken}');
    localStorage.setItem('user', JSON.stringify(${JSON.stringify(studentUser)}));
  `);

  // Student Desktop
  await cdpSend('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/student/email-preferences.html' });
  await sleep(1800);
  const shotStuDesktop = await cdpSend('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'student_email_preferences_desktop.png'), Buffer.from(shotStuDesktop.data, 'base64'));
  console.log('[OK] Saved student_email_preferences_desktop.png');

  // Student Mobile
  await cdpSend('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await sleep(1000);
  const shotStuMobile = await cdpSend('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'student_email_preferences_mobile.png'), Buffer.from(shotStuMobile.data, 'base64'));
  console.log('[OK] Saved student_email_preferences_mobile.png');

  // --- 2. TEACHER SCREENSHOTS ---
  console.log('Capturing Teacher Email Preferences...');
  await evalCode(`
    localStorage.setItem('token', '${teacherToken}');
    localStorage.setItem('user', JSON.stringify(${JSON.stringify(teacherUser)}));
  `);

  // Teacher Desktop
  await cdpSend('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdpSend('Page.navigate', { url: 'http://localhost:5000/pages/teacher/email-preferences.html' });
  await sleep(1800);
  const shotTeachDesktop = await cdpSend('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'teacher_email_preferences_desktop.png'), Buffer.from(shotTeachDesktop.data, 'base64'));
  console.log('[OK] Saved teacher_email_preferences_desktop.png');

  // Teacher Mobile
  await cdpSend('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await sleep(1000);
  const shotTeachMobile = await cdpSend('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'teacher_email_preferences_mobile.png'), Buffer.from(shotTeachMobile.data, 'base64'));
  console.log('[OK] Saved teacher_email_preferences_mobile.png');

  ws.close();
  chrome.kill();
  console.log('All screenshots captured successfully!');
  process.exit(0);
}

capture().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
