const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const BASE_URL = 'http://localhost:5000';

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING ASSIGNMENT EVALUATION (MARKS + FEEDBACK) SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log([PASS] );
      passed++;
    } else {
      console.error([FAIL] );
      failed++;
    }
  }

  // Teacher Rohini (Teacher 90, User 175) -> Course 146
  // Teacher 93 (User 179) -> Course 147
  // Student Karan (Student 96, User 174) -> Course 146
  // Student 98 (User 180) -> Course 147
  const teacherRohiniToken = generateToken({ user_id: 175, role: 'TEACHER', username: 'Rohini' });
  const teacherOtherToken = generateToken({ user_id: 179, role: 'TEACHER', username: 'OtherTeacher' });
  const studentKaranToken = generateToken({ user_id: 174, role: 'STUDENT', username: 'Karan' });
  const studentOtherToken = generateToken({ user_id: 180, role: 'STUDENT', username: 'OtherStudent' });

  // Temp test file
  const tempDir = path.join(__dirname, 'test_eval_files');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const testFilePath = path.join(tempDir, 'eval_test.pdf');
  fs.writeFileSync(testFilePath, '%PDF-1.4 Eval Test Content');

  let testAssignmentId = null;
  let testSubmissionId = null;

  try {
    // -------------------------------------------------------------
    // SETUP: Create Assignment for Course 146 by Teacher Rohini
    // -------------------------------------------------------------
    console.log('--- SETUP: Creating Test Assignment by Teacher Rohini ---');
    const createAsgRes = await fetch(${BASE_URL}/api/assignments, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': Bearer 
      },
      body: JSON.stringify({
        course_id: 146,
        title: 'Eval Test Assignment Alpha',
        description: 'Testing evaluation marks and feedback features',
        due_date: new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 19).replace('T', ' '),
        max_marks: 50
      })
    });
    const createAsgData = await createAsgRes.json();
    assert(createAsgRes.status === 201, 'Assignment created with max_marks: 50');
    testAssignmentId = createAsgData.data?.assignment?.assignment_id;

    // -------------------------------------------------------------
    // SETUP: Student Karan submits solution
    // -------------------------------------------------------------
    console.log('\n--- SETUP: Student Karan Submits Solution ---');
    const fileBytes = fs.readFileSync(testFilePath);
    const boundary = '----WebKitFormBoundaryEvalTest' + Math.random().toString(16).slice(2);
    let multipartBody = --\r\n;
    multipartBody += Content-Disposition: form-data; name=file; filename=karan_eval_code.pdf\r\n;
    multipartBody += Content-Type: application/pdf\r\n\r\n;
    multipartBody = Buffer.concat([
      Buffer.from(multipartBody, 'utf8'),
      fileBytes,
      Buffer.from(\r\n--\r\nContent-Disposition: form-data; name=remarks\r\n\r\nMy solution for eval\r\n----\r\n, 'utf8')
    ]);

    const subRes = await fetch(${BASE_URL}/api/assignments//submit, {
      method: 'POST',
      headers: {
        'Content-Type': multipart/form-data; boundary=,
        'Authorization': Bearer 
      },
      body: multipartBody
    });
    const subData = await subRes.json();
    assert(subRes.status === 200, 'Student Karan submitted solution file successfully');
    testSubmissionId = subData.data?.submission?.submission_id;

    // -------------------------------------------------------------
    // TEST 1: Initial Roster State (Pending Evaluation)
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Initial Teacher Submissions Roster KPIs ---');
    const rosterRes1 = await fetch(${BASE_URL}/api/assignments//submissions, {
      headers: { 'Authorization': Bearer  }
    });
    const rosterData1 = await rosterRes1.json();
    assert(rosterRes1.status === 200, 'Teacher fetched submissions roster');
    assert(rosterData1.data?.kpis?.evaluated === 0, Evaluated count is 0 (Actual: ));
    assert(rosterData1.data?.kpis?.pending_evaluation === 1, Pending Evaluation count is 1 (Actual: ));

    const studentKaranRosterItem = rosterData1.data?.students?.find(s => s.student_id === 96);
    assert(studentKaranRosterItem?.evaluation_status === 'Pending Evaluation', 'Student Karan status is Pending Evaluation');
    assert(studentKaranRosterItem?.is_evaluated === false, 'Student Karan is_evaluated is false');

    // -------------------------------------------------------------
    // TEST 2: Authorization & IDOR on Evaluation Endpoint
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Teacher Authorization & IDOR Isolation ---');
    // Teacher 93 attempts to evaluate Teacher Rohini's assignment
    const unauthEvalRes = await fetch(${BASE_URL}/api/assignments//submissions//evaluate, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': Bearer 
      },
      body: JSON.stringify({ marks_obtained: 45, feedback: 'Unauthorized eval' })
    });
    assert(unauthEvalRes.status === 403, Teacher 93 blocked from evaluating Teacher Rohini's assignment (Status:  Expected: 403));

    // Teacher 93 attempts to view evaluation details
    const unauthGetEvalRes = await fetch(${BASE_URL}/api/assignments//submissions//evaluation, {
      headers: { 'Authorization': Bearer  }
    });
    assert(unauthGetEvalRes.status === 403, Teacher 93 blocked from viewing evaluation (Status:  Expected: 403));

    // Student Karan attempts to call teacher evaluate endpoint
    const studentEvalRes = await fetch(${BASE_URL}/api/assignments//submissions//evaluate, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': Bearer 
      },
      body: JSON.stringify({ marks_obtained: 50 })
    });
    assert(studentEvalRes.status === 403, Student Karan blocked from evaluating (Status:  Expected: 403));

    // -------------------------------------------------------------
    // TEST 3: Validation of Marks
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Marks Validation (Negative, Exceeding max_marks, Non-numeric) ---');
    // Marks > max_marks (max_marks is 50, trying 55)
    const exceedMarksRes = await fetch(${BASE_URL}/api/assignments//submissions//evaluate, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': Bearer 
      },
      body: JSON.stringify({ marks_obtained: 55, feedback: 'Exceeding marks' })
    });
    const exceedData = await exceedMarksRes.json();
    assert(exceedMarksRes.status === 400, Marks exceeding max_marks rejected with HTTP 400 (Status: ));
    assert(exceedData.message.includes('cannot exceed maximum marks'), Clear error message returned: ");

 // Marks < 0 (negative marks)
 const negMarksRes = await fetch(${BASE_URL}/api/assignments//submissions//evaluate, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': Bearer 
 },
 body: JSON.stringify({ marks_obtained: -5 })
 });
 assert(negMarksRes.status === 400, Negative marks rejected with HTTP 400 (Status: ));

 // Non-numeric marks
 const strMarksRes = await fetch(${BASE_URL}/api/assignments//submissions//evaluate, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': Bearer 
 },
 body: JSON.stringify({ marks_obtained: 'invalid_abc' })
 });
 assert(strMarksRes.status === 400, Non-numeric marks rejected with HTTP 400 (Status: ));

 // Missing marks
 const missingMarksRes = await fetch(${BASE_URL}/api/assignments//submissions//evaluate, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': Bearer 
 },
 body: JSON.stringify({ feedback: 'Missing marks' })
 });
 assert(missingMarksRes.status === 400, Missing marks rejected with HTTP 400 (Status: ));

 // -------------------------------------------------------------
 // TEST 4: Successful Evaluation by Teacher Rohini
 // -------------------------------------------------------------
 console.log('\n--- TEST 4: Teacher Rohini Evaluates Student Karan ---');
 const validEvalRes = await fetch(${BASE_URL}/api/assignments//submissions//evaluate, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': Bearer 
 },
 body: JSON.stringify({
 marks_obtained: 45.5,
 feedback: 'Great solution! Well structured code.'
 })
 });
 const validEvalData = await validEvalRes.json();
 assert(validEvalRes.status === 200, Evaluation saved successfully (Status: ));
 assert(validEvalData.data?.evaluation?.marks_obtained === 45.5, Marks recorded: );
 assert(validEvalData.data?.evaluation?.feedback === 'Great solution! Well structured code.', 'Feedback recorded correctly');

 // Verify DB record
 const [evalDbRows] = await pool.query('SELECT * FROM assignment_evaluations WHERE submission_id = ?', [testSubmissionId]);
 assert(evalDbRows.length === 1, DB has exactly 1 evaluation record for submission);
 assert(parseFloat(evalDbRows[0].marks_obtained) === 45.5, 'DB marks match 45.5');

 // -------------------------------------------------------------
 // TEST 5: Teacher Submissions Roster KPIs After Evaluation
 // -------------------------------------------------------------
 console.log('\n--- TEST 5: Teacher Submissions Roster KPIs After Evaluation ---');
 const rosterRes2 = await fetch(${BASE_URL}/api/assignments//submissions, {
 headers: { 'Authorization': Bearer }
 });
 const rosterData2 = await rosterRes2.json();
 assert(rosterData2.data?.kpis?.evaluated === 1, Evaluated KPI updated to 1 (Actual: ));
 assert(rosterData2.data?.kpis?.pending_evaluation === 0, Pending Evaluation KPI updated to 0 (Actual: ));
 const karanUpdatedRoster = rosterData2.data?.students?.find(s => s.student_id === 96);
 assert(karanUpdatedRoster?.evaluation_status === 'Evaluated', 'Student Karan status is now Evaluated');
 assert(karanUpdatedRoster?.marks_obtained === 45.5, Student Karan marks in roster: );
 assert(karanUpdatedRoster?.feedback === 'Great solution! Well structured code.', 'Feedback preview in roster verified');

 // -------------------------------------------------------------
 // TEST 6: Idempotent Evaluation Update (No Duplicates)
 // -------------------------------------------------------------
 console.log('\n--- TEST 6: Idempotent Evaluation Update ---');
 const updateEvalRes = await fetch(${BASE_URL}/api/assignments//submissions//evaluate, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Authorization': Bearer 
 },
 body: JSON.stringify({
 marks_obtained: 48,
 feedback: 'Updated feedback: outstanding explanation.'
 })
 });
 const updateEvalData = await updateEvalRes.json();
 assert(updateEvalRes.status === 200, Evaluation updated successfully (Status: ));
 assert(updateEvalData.data?.evaluation?.marks_obtained === 48, 'Updated marks: 48');

 const [evalDbRows2] = await pool.query('SELECT * FROM assignment_evaluations WHERE submission_id = ?', [testSubmissionId]);
 assert(evalDbRows2.length === 1, DB still has exactly 1 evaluation row (NO duplicate created));
 assert(parseFloat(evalDbRows2[0].marks_obtained) === 48, 'DB marks updated to 48');
 assert(evalDbRows2[0].feedback === 'Updated feedback: outstanding explanation.', 'DB feedback updated');

 // -------------------------------------------------------------
 // TEST 7: Student Karan Views Own Evaluation
 // -------------------------------------------------------------
 console.log('\n--- TEST 7: Student Views Own Evaluation ---');
 const studentEvalRes1 = await fetch(${BASE_URL}/api/assignments//my-evaluation, {
 headers: { 'Authorization': Bearer }
 });
 const studentEvalData1 = await studentEvalRes1.json();
 assert(studentEvalRes1.status === 200, 'Student Karan retrieved own evaluation (Status: 200)');
 assert(studentEvalData1.data?.evaluation?.is_evaluated === true, 'Student evaluation is_evaluated is true');
 assert(studentEvalData1.data?.evaluation?.marks_obtained === 48, Student sees marks: 48 / 50);
 assert(studentEvalData1.data?.evaluation?.feedback === 'Updated feedback: outstanding explanation.', 'Student sees teacher feedback');
 assert(Boolean(studentEvalData1.data?.evaluation?.evaluated_at), 'Student sees formatted evaluated_at timestamp');

 // Also verify getMySubmission includes evaluation
 const studentMySubRes = await fetch(${BASE_URL}/api/assignments//my-submission, {
 headers: { 'Authorization': Bearer }
 });
 const studentMySubData = await studentMySubRes.json();
 assert(studentMySubData.data?.submission?.is_evaluated === true, 'getMySubmission returns is_evaluated: true');
 assert(studentMySubData.data?.submission?.marks_obtained === 48, 'getMySubmission returns marks_obtained: 48');

 // -------------------------------------------------------------
 // TEST 8: Student IDOR Prevention (Student 98 vs Student Karan)
 // -------------------------------------------------------------
 console.log('\n--- TEST 8: Student IDOR Prevention ---');
 // Student 98 (Course 147) attempts to fetch my-evaluation for Course 146 assignment
 const studentOtherEvalRes = await fetch(${BASE_URL}/api/assignments//my-evaluation, {
 headers: { 'Authorization': Bearer }
 });
 assert(studentOtherEvalRes.status === 403, Unenrolled Student 98 blocked with HTTP 403 (Status: Expected: 403));

 // -------------------------------------------------------------
 // TEST 9: Notification Verification
 // -------------------------------------------------------------
 console.log('\n--- TEST 9: Notification Verification ---');
 const [notifRows] = await pool.query(
 SELECT * FROM notifications WHERE recipient_user_id = 174 AND title LIKE '%Assignment Evaluated%' ORDER BY notification_id DESC LIMIT 1
 );
 assert(notifRows.length > 0, 'Notification dispatched to Student Karan for evaluation');
 assert(notifRows[0]?.message.includes('48 / 50'), Notification contains marks info: );

 // -------------------------------------------------------------
 // TEST 10: Audit Log Verification
 // -------------------------------------------------------------
 console.log('\n--- TEST 10: Audit Log Verification ---');
 const [auditRows] = await pool.query(
 SELECT action, entity, details FROM audit_logs WHERE action IN ('ASSIGNMENT_EVALUATED', 'ASSIGNMENT_EVALUATION_UPDATED') ORDER BY log_id DESC LIMIT 2
 );
 assert(auditRows.some(a => a.action === 'ASSIGNMENT_EVALUATED'), 'Audit log recorded: ASSIGNMENT_EVALUATED');
 assert(auditRows.some(a => a.action === 'ASSIGNMENT_EVALUATION_UPDATED'), 'Audit log recorded: ASSIGNMENT_EVALUATION_UPDATED');

 } catch (err) {
 console.error('Fatal test error:', err);
 failed++;
 } finally {
 // -------------------------------------------------------------
 // CLEANUP
 // -------------------------------------------------------------
 console.log('\n--- CLEANING UP TEST ARTIFACTS ---');
 if (testAssignmentId) {
 const delRes = await fetch(${BASE_URL}/api/assignments/, {
 method: 'DELETE',
 headers: { 'Authorization': Bearer }
 });
 console.log(Cleaned up test assignment #: Status );
 }
 if (fs.existsSync(tempDir)) {
 try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
 }
 }

 console.log('\n====================================================');
 console.log(FINAL RESULTS: PASSED, FAILED);
 console.log('====================================================\n');
 process.exit(failed > 0 ? 1 : 0);
}

runTests();
