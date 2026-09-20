/**
 * STEP 21: STUDENT–TEACHER QUERIES / COMMUNICATION MODULE - AUTOMATED VERIFICATION SUITE
 */

const pool = require('k:/project/Student Information Portal/src/config/db');

const BASE_URL = 'http://localhost:5000';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    testsFailed++;
  }
}

async function runTestSuite() {
  console.log('\n================================================================');
  console.log(' STEP 21: STUDENT–TEACHER QUERIES & COMMUNICATION MODULE TESTS ');
  console.log('================================================================\n');

  let adminToken = '';
  let teacherToken = '';
  let studentToken = '';

  let adminUserId = null;
  let teacherUserId = null;
  let studentUserId = null;

  // Extra user for IDOR testing
  let student2Token = '';
  let student2UserId = null;
  let teacher2Token = '';
  let teacher2UserId = null;

  let testDeptId = null;
  let testCourseId = null;
  let testStudentProfileId = null;
  let testTeacherProfileId = null;
  let testStudent2ProfileId = null;
  let testTeacher2ProfileId = null;

  let query1Id = null;
  let query2Id = null;
  let query3Id = null;

  try {
    // ------------------------------------------------------------------------
    // 1. STATIC ASSETS & NAVIGATION INTEGRATION
    // ------------------------------------------------------------------------
    console.log('--- 1. STATIC ASSETS & NAVIGATION INTEGRATION ---');

    // Admin queries HTML & JS
    const adminHtmlRes = await fetch(`${BASE_URL}/pages/admin/queries.html`);
    assert(adminHtmlRes.status === 200, 'GET /pages/admin/queries.html returns 200 OK');
    const adminHtmlText = await adminHtmlRes.text();
    assert(adminHtmlText.includes('Student–Teacher Queries Management'), 'queries.html contains page title');
    assert(adminHtmlText.includes('id="kpiTotalQueries"'), 'queries.html contains Total KPI');
    assert(adminHtmlText.includes('id="kpiOpenQueries"'), 'queries.html contains Open KPI');
    assert(adminHtmlText.includes('id="kpiInProgressQueries"'), 'queries.html contains In Progress KPI');
    assert(adminHtmlText.includes('id="kpiResolvedQueries"'), 'queries.html contains Resolved KPI');
    assert(adminHtmlText.includes('id="kpiHighPriorityQueries"'), 'queries.html contains High Priority KPI');
    assert(adminHtmlText.includes('id="queriesTable"'), 'queries.html contains queries table');
    assert(adminHtmlText.includes('id="viewQueryModal"'), 'queries.html contains conversation thread modal');
    assert(adminHtmlText.includes('id="deleteQueryModal"'), 'queries.html contains delete modal');

    const adminJsRes = await fetch(`${BASE_URL}/js/admin-queries.js`);
    assert(adminJsRes.status === 200, 'GET /js/admin-queries.js returns 200 OK');

    // Student queries HTML & JS
    const studentHtmlRes = await fetch(`${BASE_URL}/pages/student/queries.html`);
    assert(studentHtmlRes.status === 200, 'GET /pages/student/queries.html returns 200 OK');
    const studentHtmlText = await studentHtmlRes.text();
    assert(studentHtmlText.includes('Academic Queries & Support'), 'student/queries.html contains page title');
    assert(studentHtmlText.includes('id="newQueryModal"'), 'student/queries.html contains Ask Teacher modal');
    assert(studentHtmlText.includes('id="threadModal"'), 'student/queries.html contains conversation modal');
    assert(studentHtmlText.includes('id="studentQueriesTable"'), 'student/queries.html contains student queries table');

    const studentJsRes = await fetch(`${BASE_URL}/js/student-queries.js`);
    assert(studentJsRes.status === 200, 'GET /js/student-queries.js returns 200 OK');

    // Teacher queries HTML & JS
    const teacherHtmlRes = await fetch(`${BASE_URL}/pages/teacher/queries.html`);
    assert(teacherHtmlRes.status === 200, 'GET /pages/teacher/queries.html returns 200 OK');
    const teacherHtmlText = await teacherHtmlRes.text();
    assert(teacherHtmlText.includes('Assigned Student Queries'), 'teacher/queries.html contains page title');
    assert(teacherHtmlText.includes('id="teacherQueriesTable"'), 'teacher/queries.html contains teacher queries table');
    assert(teacherHtmlText.includes('id="teacherThreadModal"'), 'teacher/queries.html contains reply/view modal');

    const teacherJsRes = await fetch(`${BASE_URL}/js/teacher-queries.js`);
    assert(teacherJsRes.status === 200, 'GET /js/teacher-queries.js returns 200 OK');

    // Verify all 15 Admin HTML pages link to queries.html and have NO obsolete #queries
    const adminPages = [
      'dashboard.html',
      'users.html',
      'students.html',
      'teachers.html',
      'departments.html',
      'courses.html',
      'enrollments.html',
      'timetable.html',
      'attendance.html',
      'grades.html',
      'performance.html',
      'assignments.html',
      'study-material.html',
      'notices.html',
      'notifications.html'
    ];

    for (const page of adminPages) {
      const pRes = await fetch(`${BASE_URL}/pages/admin/${page}`);
      assert(pRes.status === 200, `Admin page ${page} is accessible (200 OK)`);
      const pText = await pRes.text();
      assert(
        pText.includes('/pages/admin/queries.html'),
        `${page} contains link to /pages/admin/queries.html`
      );
      assert(
        !pText.includes('href="#queries"'),
        `${page} does NOT contain obsolete href="#queries"`
      );
    }

    // Verify Student & Teacher dashboard module links
    const studentDashRes = await fetch(`${BASE_URL}/pages/student/dashboard.html`);
    const studentDashText = await studentDashRes.text();
    assert(
      studentDashText.includes('/pages/student/queries.html'),
      'student/dashboard.html links to /pages/student/queries.html'
    );

    const teacherDashRes = await fetch(`${BASE_URL}/pages/teacher/dashboard.html`);
    const teacherDashText = await teacherDashRes.text();
    assert(
      teacherDashText.includes('/pages/teacher/queries.html'),
      'teacher/dashboard.html links to /pages/teacher/queries.html'
    );

    // ------------------------------------------------------------------------
    // 2. AUTHENTICATION & TOKENS
    // ------------------------------------------------------------------------
    console.log('\n--- 2. AUTHENTICATION & TOKENS ---');

    // Admin login
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin@123' })
    });
    const adminLoginData = await adminLoginRes.json();
    adminToken = adminLoginData.data?.token;
    adminUserId = adminLoginData.data?.user?.user_id || adminLoginData.data?.user?.id;
    assert(adminToken && adminUserId, 'Admin logged in successfully and obtained token');

    // Teacher login
    const teacherLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'teacher', password: 'Teacher@123' })
    });
    const teacherLoginData = await teacherLoginRes.json();
    teacherToken = teacherLoginData.data?.token;
    teacherUserId = teacherLoginData.data?.user?.user_id || teacherLoginData.data?.user?.id;
    assert(teacherToken && teacherUserId, 'Teacher logged in successfully and obtained token');

    // Student login
    const studentLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student', password: 'Student@123' })
    });
    const studentLoginData = await studentLoginRes.json();
    studentToken = studentLoginData.data?.token;
    studentUserId = studentLoginData.data?.user?.user_id || studentLoginData.data?.user?.id;
    assert(studentToken && studentUserId, 'Student logged in successfully and obtained token');

    // Create temporary Student 2 and Teacher 2 for IDOR testing
    const bcrypt = require('bcryptjs');
    const hashedPass = await bcrypt.hash('TestPass@123', 10);

    const [sRole] = await pool.query("SELECT role_id FROM roles WHERE role_name = 'STUDENT'");
    const [tRole] = await pool.query("SELECT role_id FROM roles WHERE role_name = 'TEACHER'");
    const studentRoleId = sRole[0].role_id;
    const teacherRoleId = tRole[0].role_id;

    // Insert student2 user
    const [s2UserRes] = await pool.query(
      `INSERT INTO users (role_id, username, email, password_hash, first_name, last_name, is_active)
       VALUES (?, 'student2_test', 'student2@test.com', ?, 'StudentTwo', 'Tester', 1)`,
      [studentRoleId, hashedPass]
    );
    student2UserId = s2UserRes.insertId;

    // Insert teacher2 user
    const [t2UserRes] = await pool.query(
      `INSERT INTO users (role_id, username, email, password_hash, first_name, last_name, is_active)
       VALUES (?, 'teacher2_test', 'teacher2@test.com', ?, 'TeacherTwo', 'Tester', 1)`,
      [teacherRoleId, hashedPass]
    );
    teacher2UserId = t2UserRes.insertId;

    // Login student2
    const s2LoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student2_test', password: 'TestPass@123' })
    });
    const s2LoginData = await s2LoginRes.json();
    student2Token = s2LoginData.data?.token;

    // Login teacher2
    const t2LoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'teacher2_test', password: 'TestPass@123' })
    });
    const t2LoginData = await t2LoginRes.json();
    teacher2Token = t2LoginData.data?.token;

    assert(student2Token && teacher2Token, 'Secondary test users created and logged in');

    // Create supporting department, course, teacher profiles, student profiles
    const [deptRes] = await pool.query(
      "INSERT INTO departments (department_code, department_name) VALUES ('TEST_CS', 'Computer Science Test')"
    );
    testDeptId = deptRes.insertId;

    const [courseRes] = await pool.query(
      "INSERT INTO courses (department_id, course_code, course_name, credits, course_type, academic_year, semester) VALUES (?, 'CS201', 'Data Structures', 4, 'Theory', '2026-2027', 1)",
      [testDeptId]
    );
    testCourseId = courseRes.insertId;

    const [tProf1] = await pool.query(
      "INSERT INTO teachers (user_id, department_id, employee_number, designation, joining_date) VALUES (?, ?, 'T001', 'Assistant Professor', '2024-01-15')",
      [teacherUserId, testDeptId]
    );
    testTeacherProfileId = tProf1.insertId;

    const [tProf2] = await pool.query(
      "INSERT INTO teachers (user_id, department_id, employee_number, designation, joining_date) VALUES (?, ?, 'T002', 'Associate Professor', '2023-07-10')",
      [teacher2UserId, testDeptId]
    );
    testTeacher2ProfileId = tProf2.insertId;

    const [sProf1] = await pool.query(
      "INSERT INTO students (user_id, department_id, prn_number, admission_date, class_name, division, semester) VALUES (?, ?, 'PRN1001', '2024-08-01', 'FYCS', 'A', 1) ON DUPLICATE KEY UPDATE student_id = LAST_INSERT_ID(student_id)",
      [studentUserId, testDeptId]
    );
    testStudentProfileId = sProf1.insertId;

    const [sProf2] = await pool.query(
      "INSERT INTO students (user_id, department_id, prn_number, admission_date, class_name, division, semester) VALUES (?, ?, 'PRN1002', '2024-08-01', 'FYCS', 'B', 1)",
      [student2UserId, testDeptId]
    );
    testStudent2ProfileId = sProf2.insertId;

    // ------------------------------------------------------------------------
    // 3. RBAC & UNAUTHENTICATED GATES
    // ------------------------------------------------------------------------
    console.log('\n--- 3. RBAC & UNAUTHENTICATED GATES ---');

    const unauthRes = await fetch(`${BASE_URL}/api/queries`);
    assert(unauthRes.status === 401, 'GET /api/queries without token returns 401 Unauthorized');

    const unauthStatsRes = await fetch(`${BASE_URL}/api/queries/stats`);
    assert(unauthStatsRes.status === 401, 'GET /api/queries/stats without token returns 401 Unauthorized');

    const unauthPostRes = await fetch(`${BASE_URL}/api/queries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'Test' })
    });
    assert(unauthPostRes.status === 401, 'POST /api/queries without token returns 401 Unauthorized');

    // Teachers cannot initiate queries
    const teacherCreateRes = await fetch(`${BASE_URL}/api/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        assigned_to_user_id: teacher2UserId,
        subject: 'Teacher Query Attempt',
        question: 'Should be blocked'
      })
    });
    assert(teacherCreateRes.status === 403, 'POST /api/queries with TEACHER token returns 403 Forbidden');

    // Only Admin can DELETE queries
    const studentDeleteRes = await fetch(`${BASE_URL}/api/queries/999`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(studentDeleteRes.status === 403, 'DELETE /api/queries/:id with STUDENT token returns 403 Forbidden');

    const teacherDeleteRes = await fetch(`${BASE_URL}/api/queries/999`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    assert(teacherDeleteRes.status === 403, 'DELETE /api/queries/:id with TEACHER token returns 403 Forbidden');

    // ------------------------------------------------------------------------
    // 4. DROPDOWN HELPERS
    // ------------------------------------------------------------------------
    console.log('\n--- 4. DROPDOWN HELPERS ---');

    const teachersListRes = await fetch(`${BASE_URL}/api/queries/teachers`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(teachersListRes.status === 200, 'GET /api/queries/teachers returns 200 OK for student');
    const teachersListJson = await teachersListRes.json();
    assert(
      teachersListJson.success && Array.isArray(teachersListJson.data) && teachersListJson.data.length >= 2,
      'Active teachers list returned with at least 2 teachers'
    );

    const coursesListRes = await fetch(`${BASE_URL}/api/queries/courses`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(coursesListRes.status === 200, 'GET /api/queries/courses returns 200 OK for student');
    const coursesListJson = await coursesListRes.json();
    assert(
      coursesListJson.success && Array.isArray(coursesListJson.data),
      'Available courses list returned'
    );

    // ------------------------------------------------------------------------
    // 5. INPUT VALIDATION
    // ------------------------------------------------------------------------
    console.log('\n--- 5. INPUT VALIDATION ---');

    // Missing subject
    const valSubRes = await fetch(`${BASE_URL}/api/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        assigned_to_user_id: teacherUserId,
        question: 'Missing subject'
      })
    });
    assert(valSubRes.status === 400, 'POST /api/queries missing subject returns 400');

    // Subject too long (> 200 chars)
    const longSubject = 'A'.repeat(201);
    const valLongSubRes = await fetch(`${BASE_URL}/api/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        assigned_to_user_id: teacherUserId,
        subject: longSubject,
        question: 'Subject too long'
      })
    });
    assert(valLongSubRes.status === 400, 'POST /api/queries subject > 200 chars returns 400');

    // Missing question
    const valMsgRes = await fetch(`${BASE_URL}/api/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        assigned_to_user_id: teacherUserId,
        subject: 'Valid Subject'
      })
    });
    assert(valMsgRes.status === 400, 'POST /api/queries missing question returns 400');

    // Invalid / Non-existent teacher
    const valTeachRes = await fetch(`${BASE_URL}/api/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        assigned_to_user_id: 999999,
        subject: 'Valid Subject',
        question: 'Valid message'
      })
    });
    assert(valTeachRes.status === 400, 'POST /api/queries invalid teacher returns 400');

    // Invalid course ID
    const valCourseRes = await fetch(`${BASE_URL}/api/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        assigned_to_user_id: teacherUserId,
        course_id: 999999,
        subject: 'Valid Subject',
        question: 'Valid message'
      })
    });
    assert(valCourseRes.status === 400, 'POST /api/queries invalid course_id returns 400');

    // ------------------------------------------------------------------------
    // 6. QUERY CREATION & AUTOMATED NOTIFICATIONS
    // ------------------------------------------------------------------------
    console.log('\n--- 6. QUERY CREATION & AUTOMATED NOTIFICATIONS ---');

    // Student 1 creates Query 1 assigned to Teacher 1 (High priority)
    const createQ1Res = await fetch(`${BASE_URL}/api/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        assigned_to_user_id: teacherUserId,
        course_id: testCourseId,
        priority: 'High',
        subject: 'Data Structures Tree Traversal Doubts',
        question: 'Can you please explain post-order traversal using an iterative stack?'
      })
    });
    assert(createQ1Res.status === 201, 'Student 1 successfully creates Query 1 (201 Created)');
    const createQ1Json = await createQ1Res.json();
    query1Id = createQ1Json.data?.query_id;
    assert(query1Id, `Query 1 created with ID #${query1Id}`);
    assert(createQ1Json.data?.status === 'Open', 'Initial query status is Open');
    assert(createQ1Json.data?.priority === 'High', 'Priority recorded as High');

    // Verify notification was created for Teacher 1
    const [notifRows1] = await pool.query(
      'SELECT * FROM notifications WHERE recipient_user_id = ? ORDER BY notification_id DESC LIMIT 1',
      [teacherUserId]
    );
    assert(
      notifRows1.length > 0 && notifRows1[0].title.includes('New Student Query'),
      'Automated notification generated for assigned teacher'
    );

    // Student 1 creates Query 2 assigned to Teacher 1 (Medium priority, no course)
    const createQ2Res = await fetch(`${BASE_URL}/api/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        assigned_to_user_id: teacherUserId,
        priority: 'Medium',
        subject: 'General Question Regarding Office Hours',
        question: 'When are you available in your office for project guidance?'
      })
    });
    assert(createQ2Res.status === 201, 'Student 1 successfully creates Query 2 (201 Created)');
    const createQ2Json = await createQ2Res.json();
    query2Id = createQ2Json.data?.query_id;
    assert(query2Id, `Query 2 created with ID #${query2Id}`);

    // Student 2 creates Query 3 assigned to Teacher 2 (Low priority)
    const createQ3Res = await fetch(`${BASE_URL}/api/queries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${student2Token}`
      },
      body: JSON.stringify({
        assigned_to_user_id: teacher2UserId,
        priority: 'Low',
        subject: 'Reference Book Recommendations',
        question: 'Which reference book is best for algorithm design?'
      })
    });
    assert(createQ3Res.status === 201, 'Student 2 successfully creates Query 3 (201 Created)');
    const createQ3Json = await createQ3Res.json();
    query3Id = createQ3Json.data?.query_id;
    assert(query3Id, `Query 3 created with ID #${query3Id}`);

    // ------------------------------------------------------------------------
    // 7. ROLE SCOPING & IDOR ENFORCEMENT
    // ------------------------------------------------------------------------
    console.log('\n--- 7. ROLE SCOPING & IDOR ENFORCEMENT ---');

    // Student 1 list queries -> must only see Query 1 & Query 2 (not Query 3)
    const s1ListRes = await fetch(`${BASE_URL}/api/queries`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const s1ListJson = await s1ListRes.json();
    const s1Ids = (s1ListJson.data?.data || []).map((x) => x.query_id);
    assert(
      s1Ids.includes(query1Id) && s1Ids.includes(query2Id) && !s1Ids.includes(query3Id),
      'Student 1 only sees their own queries (Query 1 & 2), not Query 3'
    );

    // Student 1 attempts to access Query 3 directly -> 403 Forbidden!
    const s1Q3DetailRes = await fetch(`${BASE_URL}/api/queries/${query3Id}`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    assert(s1Q3DetailRes.status === 403, 'Student 1 accessing Query 3 returns 403 Forbidden (IDOR Prevention)');

    // Teacher 1 list queries -> must only see Query 1 & Query 2 (not Query 3)
    const t1ListRes = await fetch(`${BASE_URL}/api/queries`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const t1ListJson = await t1ListRes.json();
    const t1Ids = (t1ListJson.data?.data || []).map((x) => x.query_id);
    assert(
      t1Ids.includes(query1Id) && t1Ids.includes(query2Id) && !t1Ids.includes(query3Id),
      'Teacher 1 only sees queries assigned to them (Query 1 & 2), not Query 3'
    );

    // Teacher 1 attempts to access Query 3 directly -> 403 Forbidden!
    const t1Q3DetailRes = await fetch(`${BASE_URL}/api/queries/${query3Id}`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    assert(t1Q3DetailRes.status === 403, 'Teacher 1 accessing Query 3 returns 403 Forbidden (IDOR Prevention)');

    // Admin list queries -> sees all queries (Query 1, 2, 3)
    const adminListRes = await fetch(`${BASE_URL}/api/queries`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminListJson = await adminListRes.json();
    const adminIds = (adminListJson.data?.data || []).map((x) => x.query_id);
    assert(
      adminIds.includes(query1Id) && adminIds.includes(query2Id) && adminIds.includes(query3Id),
      'Admin can monitor all platform queries (Query 1, 2, 3)'
    );

    // Admin can view details of any query
    const adminQ3Res = await fetch(`${BASE_URL}/api/queries/${query3Id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminQ3Res.status === 200, 'Admin can view details of Query 3 (200 OK)');

    // ------------------------------------------------------------------------
    // 8. MULTI-TURN CONVERSATION REPLIES & STATUS UPDATES
    // ------------------------------------------------------------------------
    console.log('\n--- 8. MULTI-TURN CONVERSATION REPLIES ---');

    // Teacher 1 replies to Query 1
    const tReplyRes = await fetch(`${BASE_URL}/api/queries/${query1Id}/replies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        message: 'Here is how you do it: Push root to stack, use a prev pointer to track visited nodes.'
      })
    });
    assert(tReplyRes.status === 201, 'Teacher 1 replies to Query 1 (201 Created)');

    // Check that Query 1 transitioned to 'In Progress'
    const q1AfterReply = await fetch(`${BASE_URL}/api/queries/${query1Id}`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const q1AfterReplyJson = await q1AfterReply.json();
    assert(
      q1AfterReplyJson.data?.status === 'In Progress',
      'Query status automatically transitioned to In Progress upon teacher reply'
    );
    assert(
      q1AfterReplyJson.data?.replies?.length === 1,
      'Query 1 has 1 reply in thread'
    );

    // Verify student was notified of teacher reply
    const [notifRowsStudent] = await pool.query(
      'SELECT * FROM notifications WHERE recipient_user_id = ? ORDER BY notification_id DESC LIMIT 1',
      [studentUserId]
    );
    assert(
      notifRowsStudent.length > 0 && notifRowsStudent[0].title.includes('Reply on Query'),
      'Student received notification of faculty reply'
    );

    // Student 1 sends follow-up reply
    const sReplyRes = await fetch(`${BASE_URL}/api/queries/${query1Id}/replies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        message: 'Thank you Professor! That makes complete sense now.'
      })
    });
    assert(sReplyRes.status === 201, 'Student 1 posts follow-up reply (201 Created)');

    // Verify chronological order of thread
    const q1ThreadRes = await fetch(`${BASE_URL}/api/queries/${query1Id}`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const q1ThreadJson = await q1ThreadRes.json();
    const threadReplies = q1ThreadJson.data?.replies || [];
    assert(threadReplies.length === 2, 'Query 1 now contains 2 chronological replies');
    assert(threadReplies[0].sender_role === 'TEACHER', 'First reply is from TEACHER');
    assert(threadReplies[1].sender_role === 'STUDENT', 'Second reply is from STUDENT');

    // Teacher 2 attempting to reply to Query 1 -> 403 Forbidden
    const t2ReplyQ1Res = await fetch(`${BASE_URL}/api/queries/${query1Id}/replies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacher2Token}`
      },
      body: JSON.stringify({ message: 'Unauthorized reply' })
    });
    assert(t2ReplyQ1Res.status === 403, 'Unassigned teacher replying to Query 1 returns 403 Forbidden');

    // ------------------------------------------------------------------------
    // 9. STATUS MANAGEMENT & RESOLUTION WORKFLOW
    // ------------------------------------------------------------------------
    console.log('\n--- 9. STATUS MANAGEMENT & RESOLUTION WORKFLOW ---');

    // Teacher 1 marks Query 1 as Resolved
    const resolveQ1Res = await fetch(`${BASE_URL}/api/queries/${query1Id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({ status: 'Resolved' })
    });
    assert(resolveQ1Res.status === 200, 'Teacher marks Query 1 as Resolved (200 OK)');
    const resolveQ1Json = await resolveQ1Res.json();
    assert(resolveQ1Json.data?.status === 'Resolved', 'Query 1 status confirmed as Resolved');

    // Student 1 closes Query 1
    const closeQ1Res = await fetch(`${BASE_URL}/api/queries/${query1Id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ status: 'Closed' })
    });
    assert(closeQ1Res.status === 200, 'Student closes Query 1 (200 OK)');

    // Attempt to reply to Closed Query -> 400 Bad Request
    const replyClosedRes = await fetch(`${BASE_URL}/api/queries/${query1Id}/replies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ message: 'Should fail because query is closed' })
    });
    assert(replyClosedRes.status === 400, 'Replying to Closed query rejected with 400 Bad Request');

    // Student reopens Query 1
    const reopenQ1Res = await fetch(`${BASE_URL}/api/queries/${query1Id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`
      },
      body: JSON.stringify({ status: 'Open' })
    });
    assert(reopenQ1Res.status === 200, 'Student reopens Query 1 (200 OK)');

    // ------------------------------------------------------------------------
    // 10. KPI COUNTERS & ADVANCED FILTERS
    // ------------------------------------------------------------------------
    console.log('\n--- 10. KPI COUNTERS & ADVANCED FILTERS ---');

    // Admin Stats
    const adminStatsRes = await fetch(`${BASE_URL}/api/queries/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminStatsJson = await adminStatsRes.json();
    assert(
      adminStatsJson.success && adminStatsJson.data?.total_queries >= 3,
      'Admin KPI stats report total queries correctly'
    );

    // Student Stats
    const studentStatsRes = await fetch(`${BASE_URL}/api/queries/stats`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const studentStatsJson = await studentStatsRes.json();
    assert(
      studentStatsJson.success && studentStatsJson.data?.total_queries === 2,
      'Student 1 KPI stats scoped only to their 2 queries'
    );

    // Search filter
    const searchRes = await fetch(`${BASE_URL}/api/queries?search=Tree+Traversal`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchJson = await searchRes.json();
    assert(
      searchJson.data?.data?.length === 1 && searchJson.data.data[0].query_id === query1Id,
      'Search query matches specific subject "Tree Traversal"'
    );

    // Priority filter
    const prioRes = await fetch(`${BASE_URL}/api/queries?priority=High`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const prioJson = await prioRes.json();
    assert(
      prioJson.data?.data?.every((q) => q.priority === 'High'),
      'Priority filter correctly returns only High priority queries'
    );

    // Status filter
    const stRes = await fetch(`${BASE_URL}/api/queries?status=Open`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const stJson = await stRes.json();
    assert(
      stJson.data?.data?.every((q) => q.status === 'Open' || q.status === 'Pending'),
      'Status filter correctly returns only Open queries'
    );

    // ------------------------------------------------------------------------
    // 11. ADMINISTRATIVE DELETION
    // ------------------------------------------------------------------------
    console.log('\n--- 11. ADMINISTRATIVE DELETION ---');

    const delRes = await fetch(`${BASE_URL}/api/queries/${query2Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(delRes.status === 200, 'Admin successfully deletes Query 2 (200 OK)');

    const getDelRes = await fetch(`${BASE_URL}/api/queries/${query2Id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(getDelRes.status === 404, 'Deleted Query 2 returns 404 Not Found');

  } catch (err) {
    console.error('Unexpected error during test execution:', err);
    testsFailed++;
  } finally {
    // ------------------------------------------------------------------------
    // 12. CLEANUP & ZERO-RESIDUE DATABASE AUDIT
    // ------------------------------------------------------------------------
    console.log('\n--- 12. CLEANUP & ZERO-RESIDUE DATABASE AUDIT ---');

    try {
      // Delete all test queries (foreign keys cascade to query_replies)
      await pool.query('DELETE FROM query_replies');
      await pool.query('DELETE FROM queries');
      await pool.query('DELETE FROM notifications');
      await pool.query('DELETE FROM audit_logs');

      // Delete student/teacher profiles
      if (testStudentProfileId) await pool.query('DELETE FROM students WHERE student_id = ?', [testStudentProfileId]);
      if (testStudent2ProfileId) await pool.query('DELETE FROM students WHERE student_id = ?', [testStudent2ProfileId]);
      if (testTeacherProfileId) await pool.query('DELETE FROM teachers WHERE teacher_id = ?', [testTeacherProfileId]);
      if (testTeacher2ProfileId) await pool.query('DELETE FROM teachers WHERE teacher_id = ?', [testTeacher2ProfileId]);

      // Delete course and department
      if (testCourseId) await pool.query('DELETE FROM courses WHERE course_id = ?', [testCourseId]);
      if (testDeptId) await pool.query('DELETE FROM departments WHERE department_id = ?', [testDeptId]);

      // Delete extra test users (student2, teacher2)
      if (student2UserId) await pool.query('DELETE FROM users WHERE user_id = ?', [student2UserId]);
      if (teacher2UserId) await pool.query('DELETE FROM users WHERE user_id = ?', [teacher2UserId]);

      // Audit all table counts
      const tables = [
        'users', 'students', 'teachers', 'departments', 'courses', 'enrollments',
        'timetable', 'attendance', 'grades', 'assignments', 'study_materials',
        'notices', 'notifications', 'queries', 'query_replies'
      ];

      const counts = {};
      for (const t of tables) {
        const [r] = await pool.query(`SELECT COUNT(*) AS c FROM ${t}`);
        counts[t] = r[0].c;
      }

      console.log('Post-cleanup table counts:', counts);

      assert(counts.users === 3, `Users table has exactly 3 base users (found ${counts.users})`);
      assert(counts.queries === 0, `Queries table has 0 test residue (found ${counts.queries})`);
      assert(counts.query_replies === 0, `Query replies table has 0 test residue (found ${counts.query_replies})`);
      assert(counts.notifications === 0, `Notifications table has 0 test residue (found ${counts.notifications})`);
      assert(counts.notices === 0, `Notices table has 0 test residue (found ${counts.notices})`);
      assert(counts.students === 0, `Students table has 0 test residue (found ${counts.students})`);
      assert(counts.teachers === 0, `Teachers table has 0 test residue (found ${counts.teachers})`);
      assert(counts.courses === 0, `Courses table has 0 test residue (found ${counts.courses})`);
      assert(counts.departments === 0, `Departments table has 0 test residue (found ${counts.departments})`);

      // Verify legacy database student_information_portal exists and was untouched
      const [legacyDbCheck] = await pool.query("SHOW DATABASES LIKE 'student_information_portal'");
      assert(legacyDbCheck.length === 1, "Legacy database 'student_information_portal' exists and is untouched");

    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr);
      testsFailed++;
    }

    console.log('\n================================================================');
    console.log(` RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('================================================================\n');

    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

runTestSuite();
