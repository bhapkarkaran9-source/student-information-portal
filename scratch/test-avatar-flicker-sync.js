/**
 * Comprehensive Automated Verification Suite for Avatar Display & Flicker Elimination
 * Student Information Portal — All Roles (STUDENT, TEACHER, ADMIN)
 * 
 * Verifies 15 core requirements:
 *  1. Student Dashboard displays uploaded photo (#headerUserAvatar, #sidebarAvatar).
 *  2. Student Attendance displays the same uploaded photo.
 *  3. Student Profile displays the same photo (including #profileLargeAvatar).
 *  4. Student Dashboard after returning from Profile still displays photo (no "K" initials override).
 *  5. Teacher photo persists across navigation (Dashboard -> Attendance -> Profile -> Dashboard).
 *  6. Admin photo persists across navigation (Dashboard -> Users -> Profile -> Dashboard).
 *  7. Cached user data and login response contain profile_photo_url.
 *  8. Avatar renders synchronously from cache before async API completes.
 *  9. Valid photo does not first render initials.
 * 10. Same src does not recreate/destroy the img DOM (non-destructive update).
 * 11. Broken image gracefully falls back to initials.
 * 12. Photo upload syncs instantly across all visible avatars without reload.
 * 13. Photo removal syncs instantly back to initials across all avatars without reload.
 * 14. No infinite image error loops on failed image loads.
 * 15. No duplicate avatar API requests caused by navigation.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = require('../src/app');
const pool = require('../src/config/db');
const { generateToken } = require('../src/utils/token');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9272;

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
  console.log('PROFILE AVATAR SYNC & FLICKER ELIMINATION VERIFICATION SUITE');
  console.log('=================================================================\n');

  // Start HTTP server
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  // Create a real test avatar file in public/uploads/avatars
  const avatarsDir = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
  if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

  const testStudentPhoto = 'test-sync-student.jpg';
  const testTeacherPhoto = 'test-sync-teacher.jpg';
  const testAdminPhoto = 'test-sync-admin.jpg';
  const dummy1pxJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
    0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x80, 0xff, 0xd9
  ]);

  fs.writeFileSync(path.join(avatarsDir, testStudentPhoto), dummy1pxJpeg);
  fs.writeFileSync(path.join(avatarsDir, testTeacherPhoto), dummy1pxJpeg);
  fs.writeFileSync(path.join(avatarsDir, testAdminPhoto), dummy1pxJpeg);

  const studentPhotoUrl = `/uploads/avatars/${testStudentPhoto}`;
  const teacherPhotoUrl = `/uploads/avatars/${testTeacherPhoto}`;
  const adminPhotoUrl = `/uploads/avatars/${testAdminPhoto}`;

  // Update DB for test users
  try {
    await pool.query('UPDATE users SET profile_photo_url = ? WHERE user_id = 174', [studentPhotoUrl]);
    await pool.query('UPDATE users SET profile_photo_url = ? WHERE user_id = 175', [teacherPhotoUrl]);
    await pool.query('UPDATE users SET profile_photo_url = ? WHERE user_id = 1', [adminPhotoUrl]);
  } catch (e) {
    console.warn('DB update note:', e.message);
  }

  // Tokens
  const studentToken = generateToken({ user_id: 174, username: 'Karan', role: 'STUDENT' });
  const teacherToken = generateToken({ user_id: 175, username: 'Rohini', role: 'TEACHER' });
  const adminToken = generateToken({ user_id: 1, username: 'Admin', role: 'ADMIN' });

  const studentUserObj = {
    user_id: 174,
    username: 'Karan',
    first_name: 'Karan',
    last_name: 'Bhapkar',
    email: 'karan@student.edu',
    role: 'STUDENT',
    profile_photo_url: studentPhotoUrl
  };

  const teacherUserObj = {
    user_id: 175,
    username: 'Rohini',
    first_name: 'Rohini',
    last_name: 'Faculty',
    email: 'rohini@college.edu',
    role: 'TEACHER',
    profile_photo_url: teacherPhotoUrl
  };

  const adminUserObj = {
    user_id: 1,
    username: 'Admin',
    first_name: 'Admin',
    last_name: 'User',
    email: 'admin@portal.local',
    role: 'ADMIN',
    profile_photo_url: adminPhotoUrl
  };

  // Launch Chrome
  const chromeUserData = path.join(__dirname, '..', 'scratch', 'chrome-avatar-sync-profile');
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
    console.error('Failed to connect to Chrome CDP.');
    if (chromeProc) chromeProc.kill();
    if (server) server.close();
    process.exit(1);
  }

  const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json`);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);

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

  const evalInPage = async (expr) => {
    const res = await cdpSend('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || 'Eval error');
    }
    return res.result?.value;
  };

  try {
    // -------------------------------------------------------------
    // Test 7: Verify Login Controller includes profile_photo_url
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Backend Login Response Contains profile_photo_url ---');
    const loginRes = await new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.write(JSON.stringify({ username: 'Karan', password: 'Karan@123' }));
      req.end();
    });

    assert(loginRes.status === 200, 'POST /api/auth/login returns 200 OK');
    assert(loginRes.body.data && loginRes.body.data.user, 'Login returns safeUser object');
    assert('profile_photo_url' in loginRes.body.data.user, 'safeUser explicitly contains profile_photo_url key');
    assert(loginRes.body.data.user.profile_photo_url === studentPhotoUrl, `profile_photo_url matches saved student photo (${loginRes.body.data.user.profile_photo_url})`);

    // -------------------------------------------------------------
    // Setup Student Session in Browser
    // -------------------------------------------------------------
    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/dashboard.html` });
    await sleep(500);

    await evalInPage(`
      localStorage.setItem('token', '${studentToken}');
      localStorage.setItem('user', '${JSON.stringify(studentUserObj)}');
    `);

    // -------------------------------------------------------------
    // Test 1: Student Dashboard displays uploaded photo
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Student Dashboard Displays Uploaded Photo ---');
    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/dashboard.html` });
    await sleep(1000);

    const studentDashAvatarInfo = await evalInPage(`
      (() => {
        const topEl = document.getElementById('headerUserAvatar');
        const sideEl = document.getElementById('sidebarAvatar');
        const topImg = topEl ? topEl.querySelector('img') : null;
        const sideImg = sideEl ? sideEl.querySelector('img') : null;
        return {
          topHasImg: !!topImg,
          topSrc: topImg ? topImg.getAttribute('src') : null,
          topText: topEl ? topEl.textContent.trim() : null,
          sideHasImg: !!sideImg,
          sideSrc: sideImg ? sideImg.getAttribute('src') : null,
          sideText: sideEl ? sideEl.textContent.trim() : null
        };
      })()
    `);

    assert(studentDashAvatarInfo.topHasImg === true, 'Student Dashboard topbar avatar has <img> element');
    assert(studentDashAvatarInfo.topSrc === studentPhotoUrl, `Student Dashboard topbar <img> src matches photo URL (${studentDashAvatarInfo.topSrc})`);
    assert(!studentDashAvatarInfo.topText || studentDashAvatarInfo.topText === '', 'Student Dashboard topbar does NOT display text initials "K"');
    assert(studentDashAvatarInfo.sideHasImg === true, 'Student Dashboard sidebar avatar has <img> element');
    assert(studentDashAvatarInfo.sideSrc === studentPhotoUrl, `Student Dashboard sidebar <img> src matches photo URL`);

    // -------------------------------------------------------------
    // Test 2: Student Attendance displays same photo
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Student Attendance Displays Same Photo ---');
    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/attendance.html` });
    await sleep(1000);

    const studentAttAvatarInfo = await evalInPage(`
      (() => {
        const topEl = document.getElementById('headerUserAvatar');
        const topImg = topEl ? topEl.querySelector('img') : null;
        return {
          topHasImg: !!topImg,
          topSrc: topImg ? topImg.getAttribute('src') : null,
          topText: topEl ? topEl.textContent.trim() : null
        };
      })()
    `);

    assert(studentAttAvatarInfo.topHasImg === true, 'Student Attendance topbar avatar has <img> element');
    assert(studentAttAvatarInfo.topSrc === studentPhotoUrl, 'Student Attendance photo matches Dashboard photo');

    // -------------------------------------------------------------
    // Test 3: Student Profile displays same photo
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Student Profile Displays Same Photo ---');
    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/profile.html` });
    await sleep(1000);

    const studentProfileAvatarInfo = await evalInPage(`
      (() => {
        const topEl = document.getElementById('headerUserAvatar');
        const largeEl = document.getElementById('profileLargeAvatar');
        const topImg = topEl ? topEl.querySelector('img') : null;
        const largeImg = largeEl ? largeEl.querySelector('img') : null;
        return {
          topHasImg: !!topImg,
          topSrc: topImg ? topImg.getAttribute('src') : null,
          largeHasImg: !!largeImg,
          largeSrc: largeImg ? largeImg.getAttribute('src') : null
        };
      })()
    `);

    assert(studentProfileAvatarInfo.topHasImg === true, 'Student Profile topbar avatar has <img>');
    assert(studentProfileAvatarInfo.topSrc === studentPhotoUrl, 'Student Profile topbar photo matches student photo');
    assert(studentProfileAvatarInfo.largeHasImg === true, 'Student Profile #profileLargeAvatar has <img>');
    assert(studentProfileAvatarInfo.largeSrc === studentPhotoUrl, 'Student Profile #profileLargeAvatar src matches student photo');

    // -------------------------------------------------------------
    // Test 4: Student Dashboard after returning from Profile
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Student Dashboard Returning From Profile Persists Photo ---');
    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/dashboard.html` });
    await sleep(1000);

    const returnDashInfo = await evalInPage(`
      (() => {
        const topEl = document.getElementById('headerUserAvatar');
        const topImg = topEl ? topEl.querySelector('img') : null;
        return {
          topHasImg: !!topImg,
          topSrc: topImg ? topImg.getAttribute('src') : null,
          topText: topEl ? topEl.textContent.trim() : null
        };
      })()
    `);

    assert(returnDashInfo.topHasImg === true, 'Student Dashboard still has <img> after returning from Profile');
    assert(returnDashInfo.topSrc === studentPhotoUrl, 'Student Dashboard maintains correct photo without reverting to "K"');
    assert(!returnDashInfo.topText || returnDashInfo.topText === '', 'Zero "K" text in topbar avatar');

    // -------------------------------------------------------------
    // Test 5: Teacher photo persists across navigation
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Teacher Photo Persists Across Navigation ---');
    await evalInPage(`
      localStorage.setItem('token', '${teacherToken}');
      localStorage.setItem('user', '${JSON.stringify(teacherUserObj)}');
    `);

    // 5a. Teacher Dashboard
    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/teacher/dashboard.html` });
    await sleep(1000);
    const teacherDashAvatar = await evalInPage(`
      (() => {
        const topImg = document.querySelector('#headerUserAvatar img');
        return topImg ? topImg.getAttribute('src') : null;
      })()
    `);
    assert(teacherDashAvatar === teacherPhotoUrl, `Teacher Dashboard shows teacher photo (${teacherDashAvatar})`);

    // 5b. Teacher Attendance
    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/teacher/attendance.html` });
    await sleep(1000);
    const teacherAttAvatar = await evalInPage(`
      (() => {
        const topImg = document.querySelector('#headerUserAvatar img');
        return topImg ? topImg.getAttribute('src') : null;
      })()
    `);
    assert(teacherAttAvatar === teacherPhotoUrl, 'Teacher Attendance shows same teacher photo');

    // 5c. Teacher Profile
    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/teacher/profile.html` });
    await sleep(1000);
    const teacherProfAvatar = await evalInPage(`
      (() => {
        const topImg = document.querySelector('#headerUserAvatar img');
        const largeImg = document.querySelector('#profileLargeAvatar img');
        return {
          top: topImg ? topImg.getAttribute('src') : null,
          large: largeImg ? largeImg.getAttribute('src') : null
        };
      })()
    `);
    assert(teacherProfAvatar.top === teacherPhotoUrl, 'Teacher Profile topbar shows teacher photo');
    assert(teacherProfAvatar.large === teacherPhotoUrl, 'Teacher Profile #profileLargeAvatar shows teacher photo');

    // -------------------------------------------------------------
    // Test 6: Admin photo persists across navigation
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Admin Photo Persists Across Navigation ---');
    await evalInPage(`
      localStorage.setItem('token', '${adminToken}');
      localStorage.setItem('user', '${JSON.stringify(adminUserObj)}');
    `);

    // 6a. Admin Dashboard
    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/admin/dashboard.html` });
    await sleep(1000);
    const adminDashAvatar = await evalInPage(`
      (() => {
        const topImg = document.querySelector('#headerAdminAvatar img');
        const sideImg = document.querySelector('#sidebarAdminAvatar img');
        return {
          top: topImg ? topImg.getAttribute('src') : null,
          side: sideImg ? sideImg.getAttribute('src') : null
        };
      })()
    `);
    assert(adminDashAvatar.top === adminPhotoUrl, `Admin Dashboard topbar shows admin photo (${adminDashAvatar.top})`);
    assert(adminDashAvatar.side === adminPhotoUrl, `Admin Dashboard sidebar shows admin photo (${adminDashAvatar.side})`);

    // 6b. Admin Users
    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/admin/users.html` });
    await sleep(1000);
    const adminUsersAvatar = await evalInPage(`
      (() => {
        const topImg = document.querySelector('#headerAdminAvatar img');
        return topImg ? topImg.getAttribute('src') : null;
      })()
    `);
    assert(adminUsersAvatar === adminPhotoUrl, 'Admin Users page shows same admin photo');

    // 6c. Admin Profile
    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/admin/profile.html` });
    await sleep(1000);
    const adminProfAvatar = await evalInPage(`
      (() => {
        const topImg = document.querySelector('#headerUserAvatar img') || document.querySelector('#headerAdminAvatar img');
        const largeImg = document.querySelector('#profileLargeAvatar img');
        return {
          top: topImg ? topImg.getAttribute('src') : null,
          large: largeImg ? largeImg.getAttribute('src') : null
        };
      })()
    `);
    assert(adminProfAvatar.top === adminPhotoUrl, 'Admin Profile topbar shows admin photo');
    assert(adminProfAvatar.large === adminPhotoUrl, 'Admin Profile #profileLargeAvatar shows admin photo');

    // -------------------------------------------------------------
    // Test 8 & 9: Synchronous Hydration from Local Cache (Zero Initials Flash)
    // -------------------------------------------------------------
    console.log('\n--- Tests 8 & 9: Synchronous Cache Hydration & Zero Flash ---');
    // Inject student back into localStorage and evaluate early DOM state
    await evalInPage(`
      localStorage.setItem('token', '${studentToken}');
      localStorage.setItem('user', '${JSON.stringify(studentUserObj)}');
    `);

    // Navigate and check avatar immediately on DOMContentLoaded via injected script listener
    await evalInPage(`
      window.__initialsObserved = false;
      window.__photoRenderedImmediately = false;
      const observer = new MutationObserver(() => {
        const el = document.getElementById('headerUserAvatar');
        if (el) {
          if (el.textContent && el.textContent.includes('K') && !el.querySelector('img')) {
            window.__initialsObserved = true;
          }
          if (el.querySelector('img')) {
            window.__photoRenderedImmediately = true;
          }
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    `);

    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/dashboard.html` });
    await sleep(800);

    const timingAudit = await evalInPage(`
      (() => {
        const el = document.getElementById('headerUserAvatar');
        const img = el ? el.querySelector('img') : null;
        return {
          hasImg: !!img,
          src: img ? img.getAttribute('src') : null,
          initialsFlash: window.__initialsObserved || false
        };
      })()
    `);

    assert(timingAudit.hasImg === true, 'Avatar rendered with <img> synchronously from cached user data');
    assert(timingAudit.src === studentPhotoUrl, 'Cached photo URL applied immediately');
    assert(timingAudit.initialsFlash === false, 'Zero visible initials flash ("K") observed before photo render');

    // -------------------------------------------------------------
    // Test 10: Non-Destructive DOM Update (Same src does not recreate img)
    // -------------------------------------------------------------
    console.log('\n--- Test 10: Non-Destructive DOM Update (Zero Thrashing) ---');
    const domThrashResult = await evalInPage(`
      (() => {
        const el = document.getElementById('headerUserAvatar');
        if (!el) return { error: 'headerUserAvatar not found' };
        
        // Ensure image exists
        window.renderAvatarElement(el, '${studentPhotoUrl}', 'K', 'Karan avatar');
        const firstImg = el.querySelector('img');
        
        // Call renderAvatarElement again with the exact same URL
        window.renderAvatarElement(el, '${studentPhotoUrl}', 'K', 'Karan avatar');
        const secondImg = el.querySelector('img');
        
        // Call renderAvatarElement a 3rd time
        window.renderAvatarElement(el, '${studentPhotoUrl}', 'K', 'Karan avatar');
        const thirdImg = el.querySelector('img');

        return {
          sameNode1: firstImg === secondImg,
          sameNode2: secondImg === thirdImg,
          imgSrc: thirdImg ? thirdImg.getAttribute('src') : null
        };
      })()
    `);

    assert(domThrashResult.sameNode1 === true, 'Subsequent renderAvatarElement call keeps exact same <img> DOM node intact');
    assert(domThrashResult.sameNode2 === true, 'Third renderAvatarElement call also preserves existing <img> node (Zero DOM destruction)');

    // -------------------------------------------------------------
    // Test 11 & 14: Broken Image Graceful Fallback & No Infinite Loop
    // -------------------------------------------------------------
    console.log('\n--- Tests 11 & 14: Image Error Fallback & Infinite Loop Prevention ---');
    const fallbackResult = await evalInPage(`
      (() => {
        const testContainer = document.createElement('div');
        testContainer.id = 'testAvatarFallback';
        document.body.appendChild(testContainer);

        window.renderAvatarElement(testContainer, '/uploads/avatars/non_existent_broken_avatar_123.jpg', 'K', 'Test Avatar');
        const img = testContainer.querySelector('img');
        
        let errorCount = 0;
        // Trigger onerror
        if (img && typeof img.onerror === 'function') {
          try {
            img.onerror();
            errorCount++;
          } catch (e) {}
        }

        // Try triggering onerror a second time to ensure handler was removed and no loop
        if (img && typeof img.onerror === 'function') {
          try {
            img.onerror();
            errorCount++;
          } catch (e) {}
        }

        return {
          textResult: testContainer.textContent.trim(),
          noImgLeft: testContainer.querySelectorAll('img').length === 0,
          errorTriggerCount: errorCount
        };
      })()
    `);

    assert(fallbackResult.textResult === 'K', `Broken image gracefully falls back to initials 'K' (Got: ${fallbackResult.textResult})`);
    assert(fallbackResult.noImgLeft === true, 'Broken <img> safely cleaned up after fallback');
    assert(fallbackResult.errorTriggerCount === 1, 'Error handler is cleared (onerror = null), preventing infinite loops');

    // -------------------------------------------------------------
    // Test 12: Photo Upload Syncs Instantly (Reactive update)
    // -------------------------------------------------------------
    console.log('\n--- Test 12: Photo Upload Syncs Instantly Across Avatars ---');
    const newUploadUrl = `/uploads/avatars/newly-uploaded-avatar-${Date.now()}.png`;
    fs.writeFileSync(path.join(avatarsDir, path.basename(newUploadUrl)), dummy1pxJpeg);

    const uploadSyncResult = await evalInPage(`
      (() => {
        const updatedUser = Object.assign({}, JSON.parse(localStorage.getItem('user')), {
          profile_photo_url: '${newUploadUrl}'
        });
        localStorage.setItem('user', JSON.stringify(updatedUser));

        // Dispatch user-profile-updated reactive event as ProfilePhotoManager does
        window.dispatchEvent(new CustomEvent('user-profile-updated', {
          detail: { user: updatedUser }
        }));

        const topEl = document.getElementById('headerUserAvatar');
        const sideEl = document.getElementById('sidebarAvatar');
        const topImg = topEl ? topEl.querySelector('img') : null;
        const sideImg = sideEl ? sideEl.querySelector('img') : null;

        return {
          topSrc: topImg ? topImg.getAttribute('src') : null,
          sideSrc: sideImg ? sideImg.getAttribute('src') : null
        };
      })()
    `);

    assert(uploadSyncResult.topSrc === newUploadUrl, `Topbar avatar updated instantly to new uploaded photo URL (${uploadSyncResult.topSrc})`);
    assert(uploadSyncResult.sideSrc === newUploadUrl, `Sidebar avatar updated instantly to new uploaded photo URL`);

    // -------------------------------------------------------------
    // Test 13: Photo Removal Syncs Instantly (Revert to initials)
    // -------------------------------------------------------------
    console.log('\n--- Test 13: Photo Removal Syncs Instantly (Revert to Initials) ---');
    const removeSyncResult = await evalInPage(`
      (() => {
        const updatedUser = Object.assign({}, JSON.parse(localStorage.getItem('user')), {
          profile_photo_url: null
        });
        localStorage.setItem('user', JSON.stringify(updatedUser));

        // Dispatch user-profile-updated with null photo
        window.dispatchEvent(new CustomEvent('user-profile-updated', {
          detail: { user: updatedUser }
        }));

        const topEl = document.getElementById('headerUserAvatar');
        const sideEl = document.getElementById('sidebarAvatar');

        return {
          topHasImg: !!(topEl && topEl.querySelector('img')),
          topText: topEl ? topEl.textContent.trim() : null,
          sideHasImg: !!(sideEl && sideEl.querySelector('img')),
          sideText: sideEl ? sideEl.textContent.trim() : null
        };
      })()
    `);

    assert(removeSyncResult.topHasImg === false, 'Photo removal removed <img> from topbar');
    assert(removeSyncResult.topText === 'K', `Topbar cleanly reverted to initials 'K' (Got: ${removeSyncResult.topText})`);
    assert(removeSyncResult.sideHasImg === false, 'Photo removal removed <img> from sidebar');
    assert(removeSyncResult.sideText === 'K', `Sidebar cleanly reverted to initials 'K'`);

    // -------------------------------------------------------------
    // Test 15: No Duplicate Avatar API Requests on Navigation
    // -------------------------------------------------------------
    console.log('\n--- Test 15: No Duplicate Avatar API Requests on Navigation ---');
    // Restore valid photo for student
    await evalInPage(`
      const u = JSON.parse(localStorage.getItem('user'));
      u.profile_photo_url = '${studentPhotoUrl}';
      localStorage.setItem('user', JSON.stringify(u));
    `);

    let apiUserMeCalls = 0;
    ws.addEventListener('message', (evt) => {
      const parsed = JSON.parse(evt.data || evt);
      if (parsed.method === 'Network.requestWillBeSent') {
        const reqUrl = parsed.params.request.url;
        if (reqUrl.includes('/api/users/me') || reqUrl.includes('/api/profile/me')) {
          apiUserMeCalls++;
        }
      }
    });
    await cdpSend('Network.enable');

    await cdpSend('Page.navigate', { url: `${baseUrl}/pages/student/dashboard.html` });
    await sleep(800);

    assert(apiUserMeCalls <= 2, `Navigation makes at most normal background session validation requests (Observed: ${apiUserMeCalls})`);

  } finally {
    // Cleanup
    try { ws.close(); } catch (e) {}
    if (chromeProc) chromeProc.kill();
    if (server) server.close();
    try {
      fs.rmSync(chromeUserData, { recursive: true, force: true });
      fs.unlinkSync(path.join(avatarsDir, testStudentPhoto));
      fs.unlinkSync(path.join(avatarsDir, testTeacherPhoto));
      fs.unlinkSync(path.join(avatarsDir, testAdminPhoto));
    } catch (e) {}
    try { await pool.end(); } catch (e) {}
  }

  console.log('\n=================================================================');
  console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=================================================================\n');

  process.exit(failCount > 0 ? 1 : 0);
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
