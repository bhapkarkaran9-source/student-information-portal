const http = require('http');

async function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function login(username, password) {
  const res = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username, password });
  if (res.status !== 200 || !res.body.data || !res.body.data.token) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.token;
}

async function runTests() {
  console.log('--- 1. Testing Logins ---');
  const adminToken = await login('admin', 'Admin@123');
  console.log('[PASS] Admin login');
  const teacherToken = await login('Rohini', 'Rohini@123');
  console.log('[PASS] Rohini (Teacher) login');
  const karanToken = await login('Karan', 'Karan@123');
  console.log('[PASS] Karan (IT Student) login');
  const surajToken = await login('Suraj', 'Suraj@123');
  console.log('[PASS] Suraj (CS Student) login');

  console.log('\n--- 2. Cleaning existing test events ---');
  const existingRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events?all=true',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  if (existingRes.body.data && existingRes.body.data.events) {
    for (const ev of existingRes.body.data.events) {
      await request({
        hostname: 'localhost',
        port: 5000,
        path: `/api/academic-events/${ev.event_id}`,
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
    }
    console.log(`[CLEANED] Removed ${existingRes.body.data.events.length} old events`);
  }

  console.log('\n--- 3. Creating Test Events via Admin ---');
  // Event 1: All-college holiday
  const ev1 = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    title: 'National Gandhi Jayanti Holiday',
    description: 'College closed on account of Gandhi Jayanti',
    event_type: 'HOLIDAY',
    start_date: '2026-10-02',
    end_date: '2026-10-02',
    target_audience: 'ALL'
  });
  console.log('[CREATED] Event 1 (Holiday - ALL):', ev1.status, ev1.body.data?.event_id);

  // Event 2: IT Department Seminar
  const ev2 = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    title: 'Cloud & AI Architecture Seminar',
    description: 'Hands-on seminar for IT Department students and faculty',
    event_type: 'SEMINAR',
    start_date: '2026-09-25',
    end_date: '2026-09-25',
    start_time: '11:00:00',
    end_time: '13:00:00',
    location: 'Auditorium 2',
    department_id: 119,
    target_audience: 'DEPARTMENT'
  });
  console.log('[CREATED] Event 2 (Seminar - IT Dept):', ev2.status, ev2.body.data?.event_id);

  // Event 3: IT101 Course Exam (TY-IT)
  const ev3 = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    title: 'DSML Mid-Semester Internal Exam',
    description: 'Midterm theory and practical test for Data Science & Machine Learning',
    event_type: 'EXAM',
    exam_type: 'Internal Test',
    start_date: '2026-09-28',
    end_date: '2026-09-28',
    start_time: '10:00:00',
    end_time: '12:00:00',
    course_id: 146,
    department_id: 119,
    class_name: 'TY-IT',
    division: '1',
    semester: 5,
    room: 'Lab 301',
    instructions: 'Carry college ID card and scientific calculator. No mobile phones permitted.',
    target_audience: 'CLASS'
  });
  console.log('[CREATED] Event 3 (Exam - IT101 / TY-IT):', ev3.status, ev3.body.data?.event_id);

  // Event 4: Teachers Only Meeting
  const ev4 = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    title: 'Semester Curriculum Committee Meeting',
    description: 'Faculty meeting to review syllabus completion and question papers',
    event_type: 'MEETING',
    start_date: '2026-09-22',
    end_date: '2026-09-22',
    start_time: '15:00:00',
    end_time: '16:30:00',
    department_id: 119,
    location: 'Conference Room B',
    target_audience: 'TEACHERS'
  });
  console.log('[CREATED] Event 4 (Meeting - TEACHERS):', ev4.status, ev4.body.data?.event_id);

  console.log('\n--- 4. Verifying RBAC and Visibility ---');
  // Admin query
  const adminEventsRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events?all=true',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const adminEvents = adminEventsRes.body.data.events;
  console.log(`Admin sees ${adminEvents.length} events:`, adminEvents.map(e => `${e.title} [${e.event_type}]`));

  // Teacher query (Rohini - IT)
  const teacherEventsRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events?all=true',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${teacherToken}` }
  });
  const teacherEvents = teacherEventsRes.body.data.events;
  console.log(`Rohini sees ${teacherEvents.length} events:`, teacherEvents.map(e => `${e.title} [${e.event_type}]`));

  // Karan query (Student - IT, TY-IT, enrolled in IT101)
  const karanEventsRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events?all=true',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${karanToken}` }
  });
  const karanEvents = karanEventsRes.body.data.events;
  console.log(`Karan sees ${karanEvents.length} events:`, karanEvents.map(e => `${e.title} [${e.event_type}]`));

  // Suraj query (Student - CS, TY-CS)
  const surajEventsRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events?all=true',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${surajToken}` }
  });
  const surajEvents = surajEventsRes.body.data.events;
  console.log(`Suraj sees ${surajEvents.length} events:`, surajEvents.map(e => `${e.title} [${e.event_type}]`));

  // Validations
  if (adminEvents.length !== 4) throw new Error(`Expected Admin to see 4 events, got ${adminEvents.length}`);
  if (teacherEvents.length !== 4) throw new Error(`Expected Rohini to see 4 events, got ${teacherEvents.length}`);
  if (karanEvents.length !== 3) throw new Error(`Expected Karan to see 3 events (no Teacher meeting), got ${karanEvents.length}`);
  const karanHasTeacherMeeting = karanEvents.some(e => e.target_audience === 'TEACHERS');
  if (karanHasTeacherMeeting) throw new Error('IDOR LEAK: Karan should NOT see Teacher meeting!');

  if (surajEvents.length !== 1) throw new Error(`Expected Suraj to see 1 event (Holiday only), got ${surajEvents.length}`);
  console.log('[PASS] Strict RBAC & IDOR prevention verified!');

  console.log('\n--- 5. Testing Dedicated Endpoints ---');
  // Upcoming
  const upRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events/upcoming?limit=3',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${karanToken}` }
  });
  console.log('[PASS] Upcoming events for Karan:', upRes.body.data.events.length);

  // Exams
  const examRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events/exams',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${karanToken}` }
  });
  console.log('[PASS] Exams endpoint for Karan:', examRes.body.data.events.length, examRes.body.data.events[0]?.title);

  console.log('\n--- 6. Testing Reminders & Deduplication ---');
  const rem1 = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events/trigger-reminders',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('[PASS] Reminder Trigger Run 1:', rem1.body.data);

  const rem2 = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/academic-events/trigger-reminders',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  console.log('[PASS] Reminder Trigger Run 2 (Idempotency):', rem2.body.data);
  if (rem2.body.data.dispatchedCount !== 0) {
    throw new Error('Deduplication failed: Run 2 should dispatch 0 new notifications!');
  }

  console.log('\n=== ALL ACADEMIC CALENDAR BACKEND TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
