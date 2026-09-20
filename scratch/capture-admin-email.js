const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

const ARTIFACT_DIR = 'C:\\Users\\bhapk\\.gemini\\antigravity\\brain\\4e72f8f3-79c8-46f3-87b2-a6fd90e0fa2a';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9250;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function captureScreenshots() {
  const [res1] = await db.query("INSERT INTO email_logs (recipient_email, email_type, subject, status, sent_at) VALUES ('karan.student@portal.local', 'PASSWORD_RESET', 'Password Reset Request', 'SENT', NOW())");
  const [res2] = await db.query("INSERT INTO email_logs (recipient_email, email_type, subject, status, created_at) VALUES ('new.admission@portal.local', 'NEW_ACCOUNT', 'Welcome to Student Information Portal', 'PENDING', NOW())");
  const [res3] = await db.query("INSERT INTO email_logs (recipient_email, email_type, subject, status, error_message, created_at) VALUES ('failed.mail@portal.local', 'NOTIFICATION', 'Emergency Maintenance Alert', 'FAILED', 'Connection timeout to SMTP gateway at 127.0.0.1:2525', NOW())");

  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@123' })
  });
  const { data } = await loginRes.json();
  const token = data.token;
  const user = data.user;

  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    'about:blank'
  ]);
  await sleep(2200);

  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const msgId = id++;
    const handler = (e) => {
      const parsed = JSON.parse(e.data);
      if (parsed.id === msgId) {
        ws.removeEventListener('message', handler);
        if (parsed.error) rej(parsed.error);
        else res(parsed.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  await send('Page.navigate', { url: 'http://localhost:5000/pages/auth/login.html' });
  await sleep(1000);
  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('token', '${token}'); localStorage.setItem('user', JSON.stringify(${JSON.stringify(user)}));`
  });

  // 1. Desktop Viewport
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:5000/pages/admin/email-management.html' });
  await sleep(2500);

  const shotDesktop = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'admin_email_management_desktop.png'), Buffer.from(shotDesktop.data, 'base64'));
  console.log('[OK] Saved admin_email_management_desktop.png');

  // 2. Open Modal and capture
  await send('Runtime.evaluate', {
    expression: `document.querySelector('button.btn-view-log[data-id="${res3.insertId}"]')?.click()`
  });
  await sleep(1000);
  const shotModal = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'admin_email_management_modal.png'), Buffer.from(shotModal.data, 'base64'));
  console.log('[OK] Saved admin_email_management_modal.png');

  // Close modal
  await send('Runtime.evaluate', { expression: `document.getElementById('detailModalCloseBtn')?.click()` });
  await sleep(500);

  // 3. Mobile Viewport
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await sleep(1000);
  const shotMobile = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'admin_email_management_mobile.png'), Buffer.from(shotMobile.data, 'base64'));
  console.log('[OK] Saved admin_email_management_mobile.png');

  // Cleanup
  chrome.kill();
  await db.query('DELETE FROM email_logs WHERE email_log_id IN (?, ?, ?)', [res1.insertId, res2.insertId, res3.insertId]);
  process.exit(0);
}

captureScreenshots().catch(e => { console.error(e); process.exit(1); });
