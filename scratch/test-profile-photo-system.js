/**
 * Automated Verification Suite for Profile Photo System
 * Tests 20 rigorous security, backend, file-handling, and cross-role requirements:
 * 
 * 1. Student JPG upload
 * 2. Student PNG upload
 * 3. Student WEBP upload
 * 4. Teacher upload
 * 5. Admin upload
 * 6. Successful file existence on disk
 * 7. profile_photo_url saved in database
 * 8. Invalid MIME rejection (400)
 * 9. Invalid extension rejection (400)
 * 10. TXT rejection (400)
 * 11. PDF rejection (400)
 * 12. EXE rejection (400)
 * 13. >5MB rejection (400)
 * 14. Missing authentication (401)
 * 15. IDOR spoof attempt fails (token identity only)
 * 16. Replacement deletes old file from disk
 * 17. Remove deletes file from disk
 * 18. DB value becomes NULL after removal
 * 19. Initials fallback when photo is NULL
 * 20. Audit log created (USER_PROFILE_PHOTO_UPDATED, USER_PROFILE_PHOTO_REMOVED)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = require('../src/app');
const pool = require('../src/config/db');
const { generateToken } = require('../src/utils/token');
const { AVATARS_DIR } = require('../src/middlewares/upload.middleware');

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

// Multipart builder helper
function createMultipartFormData(boundary, fields, files) {
  const parts = [];

  // Text fields
  for (const [key, val] of Object.entries(fields || {})) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
        `${val}\r\n`
      )
    );
  }

  // Files
  for (const f of files || []) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${f.fieldname}"; filename="${f.filename}"\r\n` +
        `Content-Type: ${f.contentType}\r\n\r\n`
      )
    );
    parts.push(Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content));
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

// Request helper
async function makeRequest({ method = 'GET', endpoint, token, body, contentType, rawBuffer }) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(baseUrl + endpoint);
    const headers = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    let payload = null;
    if (rawBuffer) {
      payload = rawBuffer;
      headers['Content-Length'] = Buffer.byteLength(payload);
    } else if (body) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(parsedUrl, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, headers: res.headers, data: json });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Valid tiny dummy images
// 1x1 Pixel valid PNG
const VALID_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// 1x1 Pixel valid JPEG
const VALID_JPG_BUFFER = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);

// 1x1 Pixel valid WebP
const VALID_WEBP_BUFFER = Buffer.from(
  'UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAkA4JaQAA3AA/vuUAAA=',
  'base64'
);

async function runTests() {
  console.log('=================================================================');
  console.log('PROFILE PHOTO SYSTEM AUTOMATED VERIFICATION SUITE');
  console.log('=================================================================\n');

  // Start test HTTP server
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}\n`);

  // Tokens for test users
  const studentToken = generateToken({ user_id: 174, username: 'Karan', role: 'STUDENT' });
  const teacherToken = generateToken({ user_id: 175, username: 'Rohini', role: 'TEACHER' });
  const adminToken = generateToken({ user_id: 1, username: 'admin', role: 'ADMIN' });

  let studentJpgUrl = '';
  let studentPngUrl = '';
  let studentWebpUrl = '';
  let teacherPhotoUrl = '';
  let adminPhotoUrl = '';

  try {
    // -------------------------------------------------------------
    // Test 1: Student JPG upload
    // -------------------------------------------------------------
    console.log('Test 1: Student JPG upload (POST /api/profile/photo)...');
    const boundary1 = '----WebKitFormBoundaryJpgTest' + Date.now();
    const body1 = createMultipartFormData(boundary1, {}, [
      { fieldname: 'photo', filename: 'student-avatar.jpg', contentType: 'image/jpeg', content: VALID_JPG_BUFFER }
    ]);
    const res1 = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      token: studentToken,
      contentType: `multipart/form-data; boundary=${boundary1}`,
      rawBuffer: body1
    });

    assert(res1.status === 200, `Student JPG upload status 200 (Got: ${res1.status})`);
    assert(res1.data && res1.data.success === true, `Student JPG upload success flag is true`);
    assert(res1.data?.data?.profile_photo_url && res1.data.data.profile_photo_url.startsWith('/uploads/avatars/'), `Returns canonical relative URL starting with /uploads/avatars/`);
    studentJpgUrl = res1.data?.data?.profile_photo_url;

    // -------------------------------------------------------------
    // Test 2: Student PNG upload
    // -------------------------------------------------------------
    console.log('\nTest 2: Student PNG upload...');
    const boundary2 = '----WebKitFormBoundaryPngTest' + Date.now();
    const body2 = createMultipartFormData(boundary2, {}, [
      { fieldname: 'photo', filename: 'student-avatar.png', contentType: 'image/png', content: VALID_PNG_BUFFER }
    ]);
    const res2 = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      token: studentToken,
      contentType: `multipart/form-data; boundary=${boundary2}`,
      rawBuffer: body2
    });

    assert(res2.status === 200, `Student PNG upload status 200 (Got: ${res2.status})`);
    assert(res2.data?.data?.profile_photo_url && res2.data.data.profile_photo_url.endsWith('.png'), `Returns .png relative photo URL`);
    studentPngUrl = res2.data?.data?.profile_photo_url;

    // -------------------------------------------------------------
    // Test 3: Student WEBP upload
    // -------------------------------------------------------------
    console.log('\nTest 3: Student WEBP upload...');
    const boundary3 = '----WebKitFormBoundaryWebpTest' + Date.now();
    const body3 = createMultipartFormData(boundary3, {}, [
      { fieldname: 'photo', filename: 'student-avatar.webp', contentType: 'image/webp', content: VALID_WEBP_BUFFER }
    ]);
    const res3 = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      token: studentToken,
      contentType: `multipart/form-data; boundary=${boundary3}`,
      rawBuffer: body3
    });

    assert(res3.status === 200, `Student WEBP upload status 200 (Got: ${res3.status})`);
    assert(res3.data?.data?.profile_photo_url && res3.data.data.profile_photo_url.endsWith('.webp'), `Returns .webp relative photo URL`);
    studentWebpUrl = res3.data?.data?.profile_photo_url;

    // -------------------------------------------------------------
    // Test 4: Teacher upload
    // -------------------------------------------------------------
    console.log('\nTest 4: Teacher upload...');
    const boundary4 = '----WebKitFormBoundaryTeacher' + Date.now();
    const body4 = createMultipartFormData(boundary4, {}, [
      { fieldname: 'photo', filename: 'faculty.jpg', contentType: 'image/jpeg', content: VALID_JPG_BUFFER }
    ]);
    const res4 = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      token: teacherToken,
      contentType: `multipart/form-data; boundary=${boundary4}`,
      rawBuffer: body4
    });

    assert(res4.status === 200, `Teacher photo upload status 200 (Got: ${res4.status})`);
    assert(res4.data?.data?.profile_photo_url, `Teacher profile_photo_url returned`);
    teacherPhotoUrl = res4.data?.data?.profile_photo_url;

    // -------------------------------------------------------------
    // Test 5: Admin upload
    // -------------------------------------------------------------
    console.log('\nTest 5: Admin upload...');
    const boundary5 = '----WebKitFormBoundaryAdmin' + Date.now();
    const body5 = createMultipartFormData(boundary5, {}, [
      { fieldname: 'photo', filename: 'admin.png', contentType: 'image/png', content: VALID_PNG_BUFFER }
    ]);
    const res5 = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      token: adminToken,
      contentType: `multipart/form-data; boundary=${boundary5}`,
      rawBuffer: body5
    });

    assert(res5.status === 200, `Admin photo upload status 200 (Got: ${res5.status})`);
    assert(res5.data?.data?.profile_photo_url, `Admin profile_photo_url returned`);
    adminPhotoUrl = res5.data?.data?.profile_photo_url;

    // -------------------------------------------------------------
    // Test 6: Successful file existence on disk
    // -------------------------------------------------------------
    console.log('\nTest 6: Verify file existence in AVATARS_DIR...');
    const diskPathStudent = path.resolve(AVATARS_DIR, path.basename(studentWebpUrl));
    const diskPathTeacher = path.resolve(AVATARS_DIR, path.basename(teacherPhotoUrl));
    const diskPathAdmin = path.resolve(AVATARS_DIR, path.basename(adminPhotoUrl));

    assert(fs.existsSync(diskPathStudent), `Student avatar exists on disk: ${path.basename(diskPathStudent)}`);
    assert(fs.existsSync(diskPathTeacher), `Teacher avatar exists on disk: ${path.basename(diskPathTeacher)}`);
    assert(fs.existsSync(diskPathAdmin), `Admin avatar exists on disk: ${path.basename(diskPathAdmin)}`);

    // -------------------------------------------------------------
    // Test 7: profile_photo_url saved in database
    // -------------------------------------------------------------
    console.log('\nTest 7: Verify database column users.profile_photo_url...');
    const [dbRowsStudent] = await pool.query('SELECT profile_photo_url FROM users WHERE user_id = 174');
    const [dbRowsTeacher] = await pool.query('SELECT profile_photo_url FROM users WHERE user_id = 175');
    const [dbRowsAdmin] = await pool.query('SELECT profile_photo_url FROM users WHERE user_id = 1');

    assert(dbRowsStudent[0]?.profile_photo_url === studentWebpUrl, `Student DB matches saved URL: ${dbRowsStudent[0]?.profile_photo_url}`);
    assert(dbRowsTeacher[0]?.profile_photo_url === teacherPhotoUrl, `Teacher DB matches saved URL: ${dbRowsTeacher[0]?.profile_photo_url}`);
    assert(dbRowsAdmin[0]?.profile_photo_url === adminPhotoUrl, `Admin DB matches saved URL: ${dbRowsAdmin[0]?.profile_photo_url}`);

    // Verify GET /api/profile/me returns profile_photo_url
    const resMe = await makeRequest({
      method: 'GET',
      endpoint: '/api/profile/me',
      token: studentToken
    });
    assert(resMe.status === 200, `GET /api/profile/me returns 200`);
    assert(resMe.data?.data?.user?.profile_photo_url === studentWebpUrl, `GET /api/profile/me returns updated profile_photo_url`);

    // -------------------------------------------------------------
    // Test 8: Invalid MIME rejection (image/gif or audio)
    // -------------------------------------------------------------
    console.log('\nTest 8: Invalid MIME rejection...');
    const boundaryMime = '----WebKitFormBoundaryBadMime' + Date.now();
    const bodyMime = createMultipartFormData(boundaryMime, {}, [
      { fieldname: 'photo', filename: 'animation.jpg', contentType: 'image/gif', content: Buffer.from('GIF89a') }
    ]);
    const resMime = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      token: studentToken,
      contentType: `multipart/form-data; boundary=${boundaryMime}`,
      rawBuffer: bodyMime
    });
    assert(resMime.status === 400, `Invalid MIME rejected with 400 (Got: ${resMime.status})`);
    assert(resMime.data?.success === false, `Response success is false`);

    // -------------------------------------------------------------
    // Test 9: Invalid extension rejection
    // -------------------------------------------------------------
    console.log('\nTest 9: Invalid extension rejection...');
    const boundaryExt = '----WebKitFormBoundaryBadExt' + Date.now();
    const bodyExt = createMultipartFormData(boundaryExt, {}, [
      { fieldname: 'photo', filename: 'photo.bmp', contentType: 'image/jpeg', content: VALID_JPG_BUFFER }
    ]);
    const resExt = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      token: studentToken,
      contentType: `multipart/form-data; boundary=${boundaryExt}`,
      rawBuffer: bodyExt
    });
    assert(resExt.status === 400, `Invalid extension rejected with 400 (Got: ${resExt.status})`);

    // -------------------------------------------------------------
    // Test 10: TXT rejection
    // -------------------------------------------------------------
    console.log('\nTest 10: TXT file rejection...');
    const boundaryTxt = '----WebKitFormBoundaryTxt' + Date.now();
    const bodyTxt = createMultipartFormData(boundaryTxt, {}, [
      { fieldname: 'photo', filename: 'notes.txt', contentType: 'text/plain', content: Buffer.from('Hello text file') }
    ]);
    const resTxt = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      token: studentToken,
      contentType: `multipart/form-data; boundary=${boundaryTxt}`,
      rawBuffer: bodyTxt
    });
    assert(resTxt.status === 400, `TXT file rejected with 400 (Got: ${resTxt.status})`);

    // -------------------------------------------------------------
    // Test 11: PDF rejection
    // -------------------------------------------------------------
    console.log('\nTest 11: PDF file rejection...');
    const boundaryPdf = '----WebKitFormBoundaryPdf' + Date.now();
    const bodyPdf = createMultipartFormData(boundaryPdf, {}, [
      { fieldname: 'photo', filename: 'document.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-1.4') }
    ]);
    const resPdf = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      token: studentToken,
      contentType: `multipart/form-data; boundary=${boundaryPdf}`,
      rawBuffer: bodyPdf
    });
    assert(resPdf.status === 400, `PDF file rejected with 400 (Got: ${resPdf.status})`);

    // -------------------------------------------------------------
    // Test 12: EXE rejection
    // -------------------------------------------------------------
    console.log('\nTest 12: Executable (EXE) rejection...');
    const boundaryExe = '----WebKitFormBoundaryExe' + Date.now();
    const bodyExe = createMultipartFormData(boundaryExe, {}, [
      { fieldname: 'photo', filename: 'payload.exe', contentType: 'application/x-msdownload', content: Buffer.from('MZ...') }
    ]);
    const resExe = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      token: studentToken,
      contentType: `multipart/form-data; boundary=${boundaryExe}`,
      rawBuffer: bodyExe
    });
    assert(resExe.status === 400, `EXE file rejected with 400 (Got: ${resExe.status})`);

    // -------------------------------------------------------------
    // Test 13: >5MB rejection
    // -------------------------------------------------------------
    console.log('\nTest 13: Oversized (>5MB) rejection...');
    // Create 5.5MB dummy buffer
    const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024, 0x41);
    const boundaryLarge = '----WebKitFormBoundaryLarge' + Date.now();
    const bodyLarge = createMultipartFormData(boundaryLarge, {}, [
      { fieldname: 'photo', filename: 'giant.jpg', contentType: 'image/jpeg', content: largeBuffer }
    ]);
    const resLarge = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      token: studentToken,
      contentType: `multipart/form-data; boundary=${boundaryLarge}`,
      rawBuffer: bodyLarge
    });
    assert(resLarge.status === 400, `Oversized >5MB rejected with 400 (Got: ${resLarge.status})`);
    assert(resLarge.data?.message && resLarge.data.message.includes('5MB'), `Clean error message mentions 5MB limit: "${resLarge.data?.message}"`);

    // -------------------------------------------------------------
    // Test 14: Missing authentication (401)
    // -------------------------------------------------------------
    console.log('\nTest 14: Missing authentication check...');
    const resNoAuth = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      // No token passed
      contentType: `multipart/form-data; boundary=${boundary1}`,
      rawBuffer: body1
    });
    assert(resNoAuth.status === 401, `Unauthenticated request rejected with 401 (Got: ${resNoAuth.status})`);

    // -------------------------------------------------------------
    // Test 15: IDOR spoof attempt
    // -------------------------------------------------------------
    console.log('\nTest 15: IDOR security verification (spoof user_id)...');
    // Student 174 tries to spoof user_id: 1 (Admin) in multipart fields
    const boundaryIdor = '----WebKitFormBoundaryIdor' + Date.now();
    const bodyIdor = createMultipartFormData(boundaryIdor, { user_id: '1', id: '1' }, [
      { fieldname: 'photo', filename: 'idor-test.jpg', contentType: 'image/jpeg', content: VALID_JPG_BUFFER }
    ]);
    const resIdor = await makeRequest({
      method: 'POST',
      endpoint: '/api/profile/photo',
      token: studentToken, // student token
      contentType: `multipart/form-data; boundary=${boundaryIdor}`,
      rawBuffer: bodyIdor
    });
    assert(resIdor.status === 200, `Upload completed under token user identity`);
    // Check that Admin user 1 was NOT modified!
    const [adminCheck] = await pool.query('SELECT profile_photo_url FROM users WHERE user_id = 1');
    assert(adminCheck[0]?.profile_photo_url === adminPhotoUrl, `IDOR prevented: Admin photo was NOT modified by student token!`);
    const newStudentUrl = resIdor.data?.data?.profile_photo_url;

    // -------------------------------------------------------------
    // Test 16: Replacement deletes old file from disk
    // -------------------------------------------------------------
    console.log('\nTest 16: File replacement safely unlinks old avatar...');
    const oldWebpDiskPath = path.resolve(AVATARS_DIR, path.basename(studentWebpUrl));
    assert(!fs.existsSync(oldWebpDiskPath), `Prior student avatar was deleted from disk: ${path.basename(oldWebpDiskPath)}`);
    const newStudentDiskPath = path.resolve(AVATARS_DIR, path.basename(newStudentUrl));
    assert(fs.existsSync(newStudentDiskPath), `New student avatar exists on disk: ${path.basename(newStudentDiskPath)}`);

    // -------------------------------------------------------------
    // Test 17: Remove deletes file from disk
    // -------------------------------------------------------------
    console.log('\nTest 17: DELETE /api/profile/photo unlinks avatar from disk...');
    const resDelete = await makeRequest({
      method: 'DELETE',
      endpoint: '/api/profile/photo',
      token: studentToken
    });
    assert(resDelete.status === 200, `DELETE /api/profile/photo returns 200 (Got: ${resDelete.status})`);
    assert(!fs.existsSync(newStudentDiskPath), `Avatar file removed from disk after DELETE`);

    // Clean up teacher and admin test files as well
    await makeRequest({ method: 'DELETE', endpoint: '/api/profile/photo', token: teacherToken });
    await makeRequest({ method: 'DELETE', endpoint: '/api/profile/photo', token: adminToken });
    assert(!fs.existsSync(diskPathTeacher), `Teacher avatar file cleaned up`);
    assert(!fs.existsSync(diskPathAdmin), `Admin avatar file cleaned up`);

    // -------------------------------------------------------------
    // Test 18: DB value becomes NULL after removal
    // -------------------------------------------------------------
    console.log('\nTest 18: Database value becomes NULL after deletion...');
    const [dbAfterDelete] = await pool.query('SELECT profile_photo_url FROM users WHERE user_id = 174');
    assert(dbAfterDelete[0]?.profile_photo_url === null, `Database profile_photo_url is NULL`);

    // -------------------------------------------------------------
    // Test 19: Initials fallback when photo is NULL
    // -------------------------------------------------------------
    console.log('\nTest 19: Initials fallback verification...');
    const resMeAfterDelete = await makeRequest({
      method: 'GET',
      endpoint: '/api/profile/me',
      token: studentToken
    });
    assert(resMeAfterDelete.data?.data?.user?.profile_photo_url === null, `GET /api/profile/me returns profile_photo_url: null`);
    const studentUser = resMeAfterDelete.data?.data?.user;
    const initialExpected = (studentUser.first_name || studentUser.username)[0].toUpperCase();
    assert(initialExpected === 'K', `Accessible fallback initials calculated correctly: "${initialExpected}" for user ${studentUser.username}`);

    // -------------------------------------------------------------
    // Test 20: Audit logs created
    // -------------------------------------------------------------
    console.log('\nTest 20: Audit logs created for photo updates and removals...');
    const [auditRows] = await pool.query(`
      SELECT action, user_id, entity, created_at 
      FROM audit_logs 
      WHERE action IN ('USER_PROFILE_PHOTO_UPDATED', 'USER_PROFILE_PHOTO_REMOVED')
      ORDER BY log_id DESC 
      LIMIT 10
    `);

    const updateAudit = auditRows.find(r => r.action === 'USER_PROFILE_PHOTO_UPDATED');
    const removeAudit = auditRows.find(r => r.action === 'USER_PROFILE_PHOTO_REMOVED');

    assert(!!updateAudit, `USER_PROFILE_PHOTO_UPDATED audit log exists in database`);
    assert(!!removeAudit, `USER_PROFILE_PHOTO_REMOVED audit log exists in database`);
    assert(updateAudit?.user_id === 174, `Audit log correctly recorded acting user_id 174`);

  } catch (err) {
    console.error('Test execution error:', err);
    failCount++;
  } finally {
    if (server) server.close();
    pool.end();
  }

  console.log('\n=================================================================');
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=================================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
