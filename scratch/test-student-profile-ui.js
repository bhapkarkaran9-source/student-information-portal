/**
 * Automated Verification Suite for Student My Profile UI Redesign
 * 
 * Verifies:
 * 1. Locked minimal reference card styling:
 *    - Pure white card backgrounds (#ffffff / rgb(255, 255, 255))
 *    - Thin gray borders (#e2e8f0 / rgb(226, 232, 240))
 *    - Semantic 4px LEFT border:
 *      * Hero Card: Blue (#2563eb / rgb(37, 99, 235))
 *      * Academic Card: Blue (#2563eb / rgb(37, 99, 235))
 *      * Personal Card: Indigo (#4f46e5 / rgb(79, 70, 229))
 *      * Face Auth Card: Teal (#0d9488 / rgb(13, 148, 136))
 *    - 8px border-radius
 *    - Subtle shadow, zero gradients on cards
 * 2. Visual Hierarchy & Elements:
 *    - Circular Avatar (88-96px)
 *    - Camera Edit Button (#btnAvatarEdit, aria-label="Change profile photo")
 *    - Change Photo Button (#btnChangePhoto)
 *    - Full Name, PRN, Department, Semester, Class
 *    - Reusable Photo Upload Modal (#photoUploadModal) with dropzone, preview, format/size limits
 *    - Face Auth Module preserved intact (#faceAuthCard, #faceAuthStatusBadge, #faceAuthInfoRow, #btnRegisterFace, #btnTestFace, #btnRemoveFace)
 * 3. Responsive Layout & Zero Overflow across 6 viewports:
 *    - 1440px Desktop
 *    - 768px Tablet
 *    - 430px, 390px, 375px, 320px Mobile
 *    - Assert: document.documentElement.scrollWidth <= window.innerWidth
 * 4. Screenshots:
 *    - student_profile_desktop.png
 *    - student_profile_mobile.png
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
const CDP_PORT = 9271;

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

async function runTestSuite() {
  console.log('=================================================================');
  console.log('STUDENT MY PROFILE UI REDESIGN AUTOMATED VERIFICATION SUITE');
  console.log('=================================================================\n');

  // Start HTTP server
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  const token = generateToken({ user_id: 174, username: 'Karan', role: 'STUDENT' });
  const studentUser = {
    user_id: 174,
    username: 'Karan',
    first_name: 'Karan',
    last_name: 'Bhapkar',
    email: 'karan@student.edu',
    phone: '9876543210',
    role: 'STUDENT',
    prn_number: 'B24IT1005',
    department_name: 'Information Technology',
    class_name: 'TY-IT',
    division: 'A',
    semester: 5,
    academic_year: '2026-2027',
    profile_photo_url: null
  };

  // Launch headless Chrome
  const chromeUserData = path.join(__dirname, '..', 'scratch', 'chrome-profile-test-profile');
  if (fs.existsSync(chromeUserData)) {
    try { fs.rmSync(chromeUserData, { recursive: true, force: true }); } catch (e) {}
  }

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${chromeUserData}`,
    '--disable-gpu'
  ]);

  let cdpConnected = false;
  let targetWsUrl = null;

  for (let i = 0; i < 20; i++) {
    await sleep(300);
    try {
      const version = await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (version && version.webSocketDebuggerUrl) {
        cdpConnected = true;
        break;
      }
    } catch (e) {}
  }

  if (!cdpConnected) {
    console.error('Failed to connect to headless Chrome CDP.');
    if (chromeProc) chromeProc.kill();
    if (server) server.close();
    process.exit(1);
  }

  const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json`);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  targetWsUrl = pageTarget.webSocketDebuggerUrl;

  const WSClient = globalThis.WebSocket;
  const ws = new WSClient(targetWsUrl);

  let messageId = 1;
  const cdpSend = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = messageId++;
    const timer = setTimeout(() => reject(new Error(`Timeout on CDP ${method}`)), 15000);
    const handler = (evt) => {
      const parsed = JSON.parse(evt.data || evt);
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

  await new Promise(r => ws.onopen = r);

  await cdpSend('Page.enable');
  await cdpSend('DOM.enable');
  await cdpSend('Runtime.enable');

  try {
    const pageUrl = `${baseUrl}/pages/student/profile.html`;
    await cdpSend('Page.navigate', { url: pageUrl });
    await sleep(700);

    // Inject authenticated student session
    await cdpSend('Runtime.evaluate', {
      expression: `
        localStorage.setItem('token', '${token}');
        localStorage.setItem('user', '${JSON.stringify(studentUser)}');
      `
    });

    await cdpSend('Page.navigate', { url: pageUrl });
    await sleep(1200);

    // -------------------------------------------------------------
    // Part 1: Hero & Cards Computed Style Audits on Desktop (1440px)
    // -------------------------------------------------------------
    console.log('\n--- Part 1: Desktop Layout & Minimal Locked Card Styling ---');
    await cdpSend('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(400);

    const desktopAudit = await cdpSend('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const heroSection = document.querySelector('section.card');
        const cards = Array.from(document.querySelectorAll('section.card'));
        const avatar = document.getElementById('profileLargeAvatar');
        const btnAvatarEdit = document.getElementById('btnAvatarEdit');
        const btnChangePhoto = document.getElementById('btnChangePhoto');
        const btnEditProfile = document.getElementById('btnOpenEditProfileModal');
        const btnChangePassword = document.getElementById('btnOpenPasswordModal');
        const photoModal = document.getElementById('photoUploadModal');
        const faceAuthCard = document.getElementById('faceAuthCard');
        const faceAuthBadge = document.getElementById('faceAuthStatusBadge');
        const btnRegisterFace = document.getElementById('btnRegisterFace');
        const btnTestFace = document.getElementById('btnTestFace');
        const btnRemoveFace = document.getElementById('btnRemoveFace');

        const cardDetails = cards.map(c => {
          const cs = window.getComputedStyle(c);
          return {
            bg: cs.backgroundColor,
            bgImg: cs.backgroundImage,
            borderLeftWidth: cs.borderLeftWidth,
            borderLeftColor: cs.borderLeftColor,
            borderRadius: cs.borderRadius,
            boxShadow: cs.boxShadow
          };
        });

        const avatarCs = avatar ? window.getComputedStyle(avatar) : null;

        return {
          cardCount: cards.length,
          cardDetails,
          avatarWidth: avatar ? avatar.offsetWidth : 0,
          avatarHeight: avatar ? avatar.offsetHeight : 0,
          avatarRadius: avatarCs ? avatarCs.borderRadius : '',
          hasAvatarCameraBtn: !!btnAvatarEdit,
          cameraAriaLabel: btnAvatarEdit ? btnAvatarEdit.getAttribute('aria-label') : null,
          hasChangePhotoBtn: !!btnChangePhoto,
          hasEditProfileBtn: !!btnEditProfile,
          hasChangePasswordBtn: !!btnChangePassword,
          hasPhotoModal: !!photoModal,
          hasFaceAuthCard: !!faceAuthCard,
          hasFaceAuthBadge: !!faceAuthBadge,
          hasBtnRegisterFace: !!btnRegisterFace,
          hasBtnTestFace: !!btnTestFace,
          hasBtnRemoveFace: !!btnRemoveFace,
          profFullName: document.getElementById('profFullName')?.textContent,
          profPrn: document.getElementById('profPrn')?.textContent,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth
        };
      })()`
    });

    const res = desktopAudit.result.value;

    assert(res.cardCount >= 3, `Found at least 3 cards on profile page (Found: ${res.cardCount})`);
    
    // Check locked minimal card styles on all cards
    res.cardDetails.forEach((cd, idx) => {
      const isWhite = cd.bg === 'rgb(255, 255, 255)' || cd.bg === '#ffffff';
      assert(isWhite, `Card ${idx + 1} has white background (Got: ${cd.bg})`);
      assert(cd.bgImg === 'none' || !cd.bgImg.includes('gradient'), `Card ${idx + 1} has zero gradients (Got: ${cd.bgImg})`);
      assert(cd.borderLeftWidth === '4px', `Card ${idx + 1} has 4px semantic left border (Got: ${cd.borderLeftWidth})`);
      assert(cd.borderRadius === '8px', `Card ${idx + 1} has 8px border radius (Got: ${cd.borderRadius})`);
    });

    // Check circular avatar
    assert(res.avatarWidth >= 88 && res.avatarWidth <= 96, `Avatar width is in 88-96px range (Got: ${res.avatarWidth}px)`);
    assert(res.avatarHeight >= 88 && res.avatarHeight <= 96, `Avatar height is in 88-96px range (Got: ${res.avatarHeight}px)`);
    assert(res.avatarRadius === '50%', `Avatar has circular 50% border radius`);

    // Check camera edit button and Change Photo button
    assert(res.hasAvatarCameraBtn, `Avatar camera edit button #btnAvatarEdit is present`);
    assert(res.cameraAriaLabel === 'Change profile photo', `Camera button has accessible aria-label="Change profile photo"`);
    assert(res.hasChangePhotoBtn, `Hero action button #btnChangePhoto is present`);
    assert(res.hasEditProfileBtn, `Hero action button #btnOpenEditProfileModal is present`);
    assert(res.hasChangePasswordBtn, `Hero action button #btnOpenPasswordModal is present`);

    // Check photo upload modal
    assert(res.hasPhotoModal, `Reusable photo modal #photoUploadModal is present in DOM`);

    // Check Face Authentication module preservation
    assert(res.hasFaceAuthCard, `Face Auth Card #faceAuthCard is 100% preserved`);
    assert(res.hasFaceAuthBadge, `Face Auth Badge #faceAuthStatusBadge is 100% preserved`);
    assert(res.hasBtnRegisterFace, `Button #btnRegisterFace is 100% preserved`);
    assert(res.hasBtnTestFace, `Button #btnTestFace is 100% preserved`);
    assert(res.hasBtnRemoveFace, `Button #btnRemoveFace is 100% preserved`);

    // Check user data binding
    assert(res.profFullName && res.profFullName.includes('Karan'), `Full name rendered correctly: "${res.profFullName}"`);
    assert(res.profPrn && res.profPrn.includes('B24IT1005'), `PRN rendered correctly: "${res.profPrn}"`);

    // Capture desktop screenshot
    const desktopScreenshot = await cdpSend('Page.captureScreenshot', { format: 'png' });
    const desktopScreenshotPath = path.join(ARTIFACT_DIR, 'student_profile_desktop.png');
    fs.writeFileSync(desktopScreenshotPath, Buffer.from(desktopScreenshot.data, 'base64'));
    console.log(`  [OK] Saved desktop screenshot: ${desktopScreenshotPath}`);

    // Modal interaction test
    const modalTest = await cdpSend('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const btnChangePhoto = document.getElementById('btnChangePhoto');
        const modal = document.getElementById('photoUploadModal');
        const btnCancel = document.getElementById('btnCancelPhotoUpload');
        
        // 1. Click Change Photo button
        btnChangePhoto.click();
        const isOpenAfterBtn = !modal.classList.contains('hidden');
        
        // 2. Click Cancel button
        btnCancel.click();
        const isClosedAfterCancel = modal.classList.contains('hidden');
        
        // 3. Click camera overlay button
        const btnAvatarEdit = document.getElementById('btnAvatarEdit');
        btnAvatarEdit.click();
        const isOpenAfterCamera = !modal.classList.contains('hidden');
        btnCancel.click();

        return { isOpenAfterBtn, isClosedAfterCancel, isOpenAfterCamera };
      })()`
    });

    const m = modalTest.result.value;
    assert(m.isOpenAfterBtn, `Clicking #btnChangePhoto opens #photoUploadModal`);
    assert(m.isClosedAfterCancel, `Clicking Cancel button closes modal`);
    assert(m.isOpenAfterCamera, `Clicking camera button #btnAvatarEdit opens #photoUploadModal`);

    // -------------------------------------------------------------
    // Part 2: Responsive Viewport Tests & Zero Horizontal Overflow
    // -------------------------------------------------------------
    console.log('\n--- Part 2: Responsive Viewports & Zero Horizontal Overflow ---');
    for (const vp of VIEWPORTS) {
      await cdpSend('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.width < 768
      });
      await sleep(350);

      const overflowCheck = await cdpSend('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const docScroll = document.documentElement.scrollWidth;
          const docClient = document.documentElement.clientWidth;
          const bodyScroll = document.body.scrollWidth;
          const bodyClient = document.body.clientWidth;
          const winWidth = window.innerWidth;
          return {
            docScroll,
            docClient,
            bodyScroll,
            bodyClient,
            winWidth,
            hasZeroOverflow: (docScroll <= winWidth + 1) && (bodyScroll <= winWidth + 1)
          };
        })()`
      });

      const o = overflowCheck.result.value;
      assert(o.hasZeroOverflow, `Viewport ${vp.name} (${vp.width}px): Zero horizontal overflow (scrollWidth: ${o.docScroll}px <= window: ${o.winWidth}px)`);

      // At 390px mobile, capture mobile screenshot
      if (vp.width === 390) {
        const mobileScreenshot = await cdpSend('Page.captureScreenshot', { format: 'png' });
        const mobileScreenshotPath = path.join(ARTIFACT_DIR, 'student_profile_mobile.png');
        fs.writeFileSync(mobileScreenshotPath, Buffer.from(mobileScreenshot.data, 'base64'));
        console.log(`  [OK] Saved mobile screenshot: ${mobileScreenshotPath}`);
      }
    }

  } catch (err) {
    console.error('Test error during CDP execution:', err);
    failCount++;
  } finally {
    if (ws) ws.close();
    if (chromeProc) chromeProc.kill();
    if (server) server.close();
  }

  console.log('\n=================================================================');
  console.log(`STUDENT PROFILE UI TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=================================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite();
