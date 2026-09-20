require('dotenv').config();
const http = require('http');
const app = require('../src/app');
const pool = require('../src/config/db');
const { generateToken } = require('../src/utils/token');

async function runDiagnosis() {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const headers = {};
      if (body) headers['Content-Type'] = 'application/json';
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request(url, { method, headers }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          let data = null;
          try { data = JSON.parse(raw); } catch (e) { data = raw; }
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  try {
    console.log('================================================================');
    console.log('COMPREHENSIVE DIAGNOSIS: MULTI-STUDENT SAME QR SCREENSHOT SCAN');
    console.log('================================================================\n');

    // -------------------------------------------------------------------------
    // 0. Historical Audit Logs for Session 65
    // -------------------------------------------------------------------------
    console.log('--- 0. Historical Audit Logs from User Test (Session 65) ---');
    const [auditRows] = await pool.query(`
      SELECT log_id, user_id, action, details, created_at 
      FROM audit_logs 
      WHERE log_id BETWEEN 240 AND 256 
      ORDER BY log_id ASC
    `);
    for (const r of auditRows) {
      console.log(`[Log #${r.log_id}] ${r.created_at.toISOString()} | User #${r.user_id} | ${r.action} | ${r.details}`);
    }

    // -------------------------------------------------------------------------
    // 1 & 5. Verify Karan & Saksham enrollment in Course 146
    // -------------------------------------------------------------------------
    console.log('\n--- 1 & 5. Verify Karan & Saksham Users & Enrollment ---');
    const [students] = await pool.query(`
      SELECT u.user_id, u.username, u.first_name, u.last_name, u.is_active, s.student_id, s.prn_number
      FROM users u
      JOIN students s ON u.user_id = s.user_id
      WHERE u.username IN ('Karan', 'Saksham')
    `);
    console.log('Students:', students);

    const karan = students.find(s => s.username === 'Karan');
    const saksham = students.find(s => s.username === 'Saksham');

    const [enrollments] = await pool.query(`
      SELECT e.enrollment_id, e.student_id, e.course_id, e.status, c.course_code, c.course_name
      FROM enrollments e
      JOIN courses c ON e.course_id = c.course_id
      WHERE e.student_id IN (?, ?) AND e.course_id = 146
    `, [karan.student_id, saksham.student_id]);
    console.log('Course 146 Enrollments:', enrollments);

    const teacher = { teacher_id: 90, user_id: 175, username: 'Rohini' };
    const teacherToken = generateToken({ user_id: teacher.user_id, username: teacher.username, role: 'TEACHER' });
    const karanToken = generateToken({ user_id: karan.user_id, username: karan.username, role: 'STUDENT' });
    const sakshamToken = generateToken({ user_id: saksham.user_id, username: saksham.username, role: 'STUDENT' });

    // Clean up test data
    const today = new Date().toISOString().split('T')[0];
    await pool.query('DELETE FROM attendance WHERE course_id = 146 AND attendance_date = ?', [today]);
    await pool.query('DELETE FROM attendance_sessions WHERE teacher_id = ?', [teacher.teacher_id]);

    // -------------------------------------------------------------------------
    // 2. Start Session & Generate ONE valid QR Token (Simulating Teacher Screen)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Start Active Session & Generate Single QR Token ---');
    const startRes = await request('POST', '/api/attendance/qr/start', {
      timetable_id: 98,
      duration: 10,
      session_date: today
    }, teacherToken);
    console.log('Session Start Status:', startRes.status);
    const sessionId = startRes.data.data.session_id;

    // Fetch token displayed on screen
    const tokenRes = await request('GET', `/api/attendance/qr/token/${sessionId}`, null, teacherToken);
    console.log('Teacher Token Generation Status:', tokenRes.status);
    const qrToken = tokenRes.data.data.token;
    const decodedPayload = JSON.parse(Buffer.from(qrToken, 'base64url').toString('utf8'));
    console.log('QR Token Payload (from teacher screen):', decodedPayload);

    // -------------------------------------------------------------------------
    // 3. Karan scans the token immediately (< 60s)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Karan POSTs Token to /api/attendance/qr/scan ---');
    const karanScanRes = await request('POST', '/api/attendance/qr/scan', { token: qrToken }, karanToken);
    console.log('Karan HTTP Status:', karanScanRes.status);
    console.log('Karan Response Body:', JSON.stringify(karanScanRes.data));

    // -------------------------------------------------------------------------
    // 4. Test A: Saksham scans the EXACT SAME token immediately (< 60s)
    // -------------------------------------------------------------------------
    console.log('\n--- 4A. Saksham POSTs EXACT SAME Token immediately (< 60s) ---');
    const sakshamScanResA = await request('POST', '/api/attendance/qr/scan', { token: qrToken }, sakshamToken);
    console.log('Saksham Immediate HTTP Status:', sakshamScanResA.status);
    console.log('Saksham Immediate Response Body:', JSON.stringify(sakshamScanResA.data));

    // -------------------------------------------------------------------------
    // 4. Test B: Saksham scans the EXACT SAME token after token drift expiry (> 60s)
    // -------------------------------------------------------------------------
    console.log('\n--- 4B. Saksham POSTs Token after 65 seconds drift (> 60s) ---');
    // Simulate screenshot taken 65 seconds ago
    const crypto = require('crypto');
    const [sessDb] = await pool.query('SELECT * FROM attendance_sessions WHERE session_id = ?', [sessionId]);
    const expiredTs = Date.now() - 65 * 1000;
    const expiredNonce = 'aabbccddeeff0011';
    const expiredMsg = `${sessDb[0].session_uuid}:${expiredTs}:${expiredNonce}`;
    const expiredSig = crypto.createHmac('sha256', sessDb[0].qr_secret).update(expiredMsg).digest('hex');
    const expiredToken = Buffer.from(JSON.stringify({
      sid: sessDb[0].session_uuid,
      ts: expiredTs,
      nonce: expiredNonce,
      sig: expiredSig
    })).toString('base64url');

    // Clean up Saksham's attendance from 4A to isolate 4B test
    await pool.query('DELETE FROM attendance WHERE student_id = ? AND course_id = 146 AND attendance_date = ?', [saksham.student_id, today]);

    const sakshamScanResB = await request('POST', '/api/attendance/qr/scan', { token: expiredToken }, sakshamToken);
    console.log('Saksham 65s Drift HTTP Status:', sakshamScanResB.status);
    console.log('Saksham 65s Drift Response Body:', JSON.stringify(sakshamScanResB.data));

    // -------------------------------------------------------------------------
    // 7. Check Duplicate Attendance Logic
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Check Duplicate Attendance Logic ---');
    // Re-mark Saksham attendance first
    const remarkSaksham = await request('POST', '/api/attendance/qr/scan', { token: qrToken }, sakshamToken);
    console.log('Saksham re-marked status:', remarkSaksham.status);
    // Now Saksham attempts duplicate scan
    const sakshamDupRes = await request('POST', '/api/attendance/qr/scan', { token: qrToken }, sakshamToken);
    console.log('Saksham Duplicate Scan HTTP Status:', sakshamDupRes.status);
    console.log('Saksham Duplicate Response Body:', JSON.stringify(sakshamDupRes.data));

    // -------------------------------------------------------------------------
    // 8. Check Database Unique Constraints
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Check Database Unique Constraints ---');
    const [tableInfo] = await pool.query('SHOW CREATE TABLE attendance');
    console.log('Attendance Table Constraints:');
    const lines = tableInfo[0]['Create Table'].split('\n').filter(l => l.includes('KEY') || l.includes('CONSTRAINT'));
    lines.forEach(l => console.log(' ', l.trim()));

    // -------------------------------------------------------------------------
    // 9. Check if Scan Endpoint Associates Token with Student
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Check if Token or Session is Tied to First Student ---');
    const [sessionRows] = await pool.query('SELECT * FROM attendance_sessions WHERE session_id = ?', [sessionId]);
    console.log('Session row after scans:', {
      session_id: sessionRows[0].session_id,
      session_uuid: sessionRows[0].session_uuid,
      course_id: sessionRows[0].course_id,
      is_active: sessionRows[0].is_active,
      student_qr_visible: sessionRows[0].student_qr_visible
    });

    const [attendanceRows] = await pool.query('SELECT attendance_id, student_id, course_id, status, remarks, created_at FROM attendance WHERE course_id = 146 AND attendance_date = ?', [today]);
    console.log('Attendance table rows created for course 146:', attendanceRows);

    // Clean up test data
    await pool.query('DELETE FROM attendance WHERE course_id = 146 AND attendance_date = ?', [today]);
    await pool.query('DELETE FROM attendance_sessions WHERE session_id = ?', [sessionId]);

  } catch (err) {
    console.error('Diagnosis error:', err);
  } finally {
    server.close();
    process.exit(0);
  }
}

runDiagnosis();
