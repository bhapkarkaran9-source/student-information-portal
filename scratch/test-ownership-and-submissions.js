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
  console.log('STARTING END-TO-END OWNERSHIP & SUBMISSION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Setup Test Users
  // Teacher Rohini (Teacher 90, User 175) -> Assigned Course 146
  // Teacher 93 (User 179) -> Assigned Course 147
  // Student Karan (Student 96, User 174) -> Enrolled Course 146 & 148
  // Student 98 (User 180) -> Enrolled Course 147

  const teacherRohiniToken = generateToken({ user_id: 175, role: 'TEACHER', username: 'Rohini' });
  const teacherOtherToken = generateToken({ user_id: 179, role: 'TEACHER', username: 'OtherTeacher' });
  const studentKaranToken = generateToken({ user_id: 174, role: 'STUDENT', username: 'Karan' });
  const studentOtherToken = generateToken({ user_id: 180, role: 'STUDENT', username: 'OtherStudent' });

  // Temp test files
  const tempDir = path.join(__dirname, 'test_files');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const testPdfPath = path.join(tempDir, 'test_sample.pdf');
  fs.writeFileSync(testPdfPath, '%PDF-1.4 Mock PDF Content For Test Purposes');

  let createdAssignmentId = null;
  let createdMaterialId = null;
  let createdSubmissionId = null;

  try {
    // -------------------------------------------------------------
    // TEST 1: TEACHER COURSE AUTHORIZATION ON ASSIGNMENT CREATION
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Teacher Course Authorization on Assignment Creation ---');
    
    // Attempt to create assignment for Course 147 (unassigned to Teacher Rohini)
    const unauthAsgRes = await fetch(`${BASE_URL}/api/assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherRohiniToken}`
      },
      body: JSON.stringify({
        course_id: 147,
        title: 'Unauthorized Assignment',
        due_date: new Date(Date.now() + 86400000).toISOString(),
        max_marks: 100
      })
    });
    assert(unauthAsgRes.status === 403, `Teacher Rohini cannot create assignment for Course 147 (Status: ${unauthAsgRes.status} Expected: 403)`);

    // Create assignment for Course 146 (Assigned to Teacher Rohini)
    const validAsgRes = await fetch(`${BASE_URL}/api/assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherRohiniToken}`
      },
      body: JSON.stringify({
        course_id: 146,
        title: 'Automated E2E Test Assignment',
        description: 'Verifying teacher ownership and student submissions pipeline',
        due_date: new Date(Date.now() + 86400000).toISOString(),
        max_marks: 100
      })
    });
    const validAsgData = await validAsgRes.json();
    assert(validAsgRes.status === 201 && validAsgData.success, `Teacher Rohini successfully created assignment for Course 146 (Status: ${validAsgRes.status})`);
    createdAssignmentId = validAsgData.data?.assignment?.assignment_id;
    console.log(`Created Assignment ID: ${createdAssignmentId}`);

    // -------------------------------------------------------------
    // TEST 2: TEACHER IDOR & OWNERSHIP ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Teacher IDOR & Ownership Isolation ---');

    // Teacher 93 tries to view Teacher Rohini's assignment
    const teacher93Get = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}`, {
      headers: { 'Authorization': `Bearer ${teacherOtherToken}` }
    });
    assert(teacher93Get.status === 403, `Teacher 93 blocked from viewing Teacher Rohini's assignment (Status: ${teacher93Get.status} Expected: 403)`);

    // Teacher 93 tries to update Teacher Rohini's assignment
    const teacher93Put = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${teacherOtherToken}`
      },
      body: JSON.stringify({ title: 'Hacked Title' })
    });
    assert(teacher93Put.status === 403, `Teacher 93 blocked from editing Teacher Rohini's assignment (Status: ${teacher93Put.status} Expected: 403)`);

    // Teacher 93 tries to view submissions for Teacher Rohini's assignment
    const teacher93Sub = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}/submissions`, {
      headers: { 'Authorization': `Bearer ${teacherOtherToken}` }
    });
    assert(teacher93Sub.status === 403, `Teacher 93 blocked from viewing submissions of Teacher Rohini's assignment (Status: ${teacher93Sub.status} Expected: 403)`);

    // Teacher 93 tries to delete Teacher Rohini's assignment
    const teacher93Del = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${teacherOtherToken}` }
    });
    assert(teacher93Del.status === 403, `Teacher 93 blocked from deleting Teacher Rohini's assignment (Status: ${teacher93Del.status} Expected: 403)`);

    // -------------------------------------------------------------
    // TEST 3: TEACHER STUDY MATERIAL REAL MULTIPART UPLOAD & OWNERSHIP
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Teacher Study Material Real File Upload & Ownership ---');

    // Attempt to upload material for Course 147 (unassigned)
    const unauthForm = new FormData();
    unauthForm.append('course_id', '147');
    unauthForm.append('title', 'Unassigned Material');
    unauthForm.append('material_type', 'Notes');
    unauthForm.append('file', new Blob([fs.readFileSync(testPdfPath)], { type: 'application/pdf' }), 'test.pdf');

    const unauthMatRes = await fetch(`${BASE_URL}/api/study-materials`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${teacherRohiniToken}` },
      body: unauthForm
    });
    assert(unauthMatRes.status === 403, `Teacher Rohini blocked from uploading material for unassigned Course 147 (Status: ${unauthMatRes.status} Expected: 403)`);

    // Valid upload for Course 146
    const validMatForm = new FormData();
    validMatForm.append('course_id', '146');
    validMatForm.append('title', 'Automated E2E Lecture Notes');
    validMatForm.append('material_type', 'Notes');
    validMatForm.append('description', 'Verified lecture notes for Course 146');
    validMatForm.append('file', new Blob([fs.readFileSync(testPdfPath)], { type: 'application/pdf' }), 'lecture_notes.pdf');

    const validMatRes = await fetch(`${BASE_URL}/api/study-materials`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${teacherRohiniToken}` },
      body: validMatForm
    });
    const validMatData = await validMatRes.json();
    assert(validMatRes.status === 201 && validMatData.success, `Teacher Rohini uploaded real study material PDF for Course 146 (Status: ${validMatRes.status})`);
    createdMaterialId = validMatData.data?.material?.material_id;
    console.log(`Created Study Material ID: ${createdMaterialId}`);

    // Teacher 93 tries to view or delete Teacher Rohini's material
    const teacher93MatGet = await fetch(`${BASE_URL}/api/study-materials/${createdMaterialId}`, {
      headers: { 'Authorization': `Bearer ${teacherOtherToken}` }
    });
    assert(teacher93MatGet.status === 403, `Teacher 93 blocked from viewing Teacher Rohini's material (Status: ${teacher93MatGet.status} Expected: 403)`);

    const teacher93MatDel = await fetch(`${BASE_URL}/api/study-materials/${createdMaterialId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${teacherOtherToken}` }
    });
    assert(teacher93MatDel.status === 403, `Teacher 93 blocked from deleting Teacher Rohini's material (Status: ${teacher93MatDel.status} Expected: 403)`);

    // -------------------------------------------------------------
    // TEST 4: STUDENT VISIBILITY SCOPING (ENROLLED COURSES ONLY)
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Student Visibility Scoping ---');

    // Student Karan (Enrolled in 146) gets assignments
    const karanAsgRes = await fetch(`${BASE_URL}/api/assignments`, {
      headers: { 'Authorization': `Bearer ${studentKaranToken}` }
    });
    const karanAsgData = await karanAsgRes.json();
    const karanHasAsg = karanAsgData.data?.assignments?.some(a => a.assignment_id === createdAssignmentId);
    assert(karanHasAsg, 'Student Karan sees Course 146 assignment in assignments schedule');

    // Student 98 (Enrolled in Course 147 ONLY) gets assignments
    const student98AsgRes = await fetch(`${BASE_URL}/api/assignments`, {
      headers: { 'Authorization': `Bearer ${studentOtherToken}` }
    });
    const student98AsgData = await student98AsgRes.json();
    const student98HasAsg = student98AsgData.data?.assignments?.some(a => a.assignment_id === createdAssignmentId);
    assert(!student98HasAsg, 'Student 98 (Course 147) does NOT see Course 146 assignment');

    // Student 98 tries direct access to Course 146 assignment
    const student98DirectAsg = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}`, {
      headers: { 'Authorization': `Bearer ${studentOtherToken}` }
    });
    assert(student98DirectAsg.status === 403, `Student 98 direct access to Course 146 assignment returns 403 (Status: ${student98DirectAsg.status})`);

    // Student 98 tries direct download of Course 146 study material
    const student98DirectMat = await fetch(`${BASE_URL}/api/study-materials/${createdMaterialId}/download`, {
      headers: { 'Authorization': `Bearer ${studentOtherToken}` }
    });
    assert(student98DirectMat.status === 403, `Student 98 direct download of Course 146 study material returns 403 (Status: ${student98DirectMat.status})`);

    // Student Karan downloads Course 146 study material -> Success
    const karanMatDown = await fetch(`${BASE_URL}/api/study-materials/${createdMaterialId}/download`, {
      headers: { 'Authorization': `Bearer ${studentKaranToken}` }
    });
    assert(karanMatDown.status === 200, `Student Karan successfully downloads Course 146 study material (Status: ${karanMatDown.status})`);

    // -------------------------------------------------------------
    // TEST 5: STUDENT ASSIGNMENT SUBMISSION & IDOR PREVENTION
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Student Assignment Submission & IDOR Prevention ---');

    // Student 98 attempts to submit solution for Course 146 assignment
    const unauthSubForm = new FormData();
    unauthSubForm.append('file', new Blob([fs.readFileSync(testPdfPath)], { type: 'application/pdf' }), 'unauth_sub.pdf');
    const student98Submit = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}/submit`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentOtherToken}` },
      body: unauthSubForm
    });
    assert(student98Submit.status === 403, `Student 98 blocked from submitting to un-enrolled assignment (Status: ${student98Submit.status} Expected: 403)`);

    // Student Karan submits valid solution file
    const karanSubForm = new FormData();
    karanSubForm.append('remarks', 'Solution for Unit 3 exercise by Karan');
    karanSubForm.append('file', new Blob([fs.readFileSync(testPdfPath)], { type: 'application/pdf' }), 'karan_solution.pdf');
    const karanSubmit = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}/submit`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentKaranToken}` },
      body: karanSubForm
    });
    const karanSubData = await karanSubmit.json();
    assert(karanSubmit.status === 200 && karanSubData.success, `Student Karan submitted solution file successfully (Status: ${karanSubmit.status})`);
    createdSubmissionId = karanSubData.data?.submission?.submission_id;
    console.log(`Created Submission ID: ${createdSubmissionId}`);

    // Verify submission record on disk
    const storedPath = path.resolve(__dirname, '..', karanSubData.data?.submission?.file_path);
    assert(fs.existsSync(storedPath), `Submission file securely saved on server at: ${storedPath}`);

    // Student 98 attempts to download Student Karan's submission
    const student98DownSub = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}/submissions/${createdSubmissionId}/download`, {
      headers: { 'Authorization': `Bearer ${studentOtherToken}` }
    });
    assert(student98DownSub.status === 403, `Student 98 blocked from downloading Student Karan's submission document (Status: ${student98DownSub.status} Expected: 403)`);

    // Teacher 93 attempts to download Student Karan's submission
    const teacher93DownSub = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}/submissions/${createdSubmissionId}/download`, {
      headers: { 'Authorization': `Bearer ${teacherOtherToken}` }
    });
    assert(teacher93DownSub.status === 403, `Teacher 93 blocked from downloading Student Karan's submission document (Status: ${teacher93DownSub.status} Expected: 403)`);

    // -------------------------------------------------------------
    // TEST 6: TEACHER VIEW SUBMISSIONS & ROSTER METRICS
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Teacher View Submissions & Roster Metrics ---');

    const teacherSubRoster = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}/submissions`, {
      headers: { 'Authorization': `Bearer ${teacherRohiniToken}` }
    });
    const rosterData = await teacherSubRoster.json();
    assert(teacherSubRoster.status === 200 && rosterData.success, `Teacher Rohini fetched submissions roster successfully (Status: ${teacherSubRoster.status})`);

    const kpis = rosterData.data?.kpis;
    assert(kpis?.total_students === 2, `Total enrolled students is 2 (Karan + Student 97) (Actual: ${kpis?.total_students})`);
    assert(kpis?.submitted === 1, `Submitted count is 1 (Actual: ${kpis?.submitted})`);
    assert(kpis?.not_submitted === 1, `Not submitted count is 1 (Actual: ${kpis?.not_submitted})`);

    const karanRosterEntry = rosterData.data?.students?.find(s => s.prn_number === 'B24IT1005');
    assert(karanRosterEntry && karanRosterEntry.status === 'Submitted', `Student Karan status is 'Submitted' with original filename "${karanRosterEntry?.original_filename}"`);

    // Teacher Rohini downloads Student Karan's submission document -> Success
    const teacherDownDoc = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}/submissions/${createdSubmissionId}/download`, {
      headers: { 'Authorization': `Bearer ${teacherRohiniToken}` }
    });
    assert(teacherDownDoc.status === 200, `Teacher Rohini successfully downloaded student submission document (Status: ${teacherDownDoc.status})`);

    // Teacher Rohini previews Student Karan's submission document -> Success
    const teacherViewDoc = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}/submissions/${createdSubmissionId}/view`, {
      headers: { 'Authorization': `Bearer ${teacherRohiniToken}` }
    });
    assert(teacherViewDoc.status === 200, `Teacher Rohini successfully previews student submission document (Status: ${teacherViewDoc.status})`);

    // -------------------------------------------------------------
    // TEST 7: NOTIFICATIONS & AUDIT LOGGING VERIFICATION
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Notifications & Audit Logging Verification ---');

    // Check notifications for Student Karan (User 174)
    const [karanNotifs] = await pool.query(
      "SELECT * FROM notifications WHERE recipient_user_id = 174 AND notification_type = 'Assignment' ORDER BY notification_id DESC LIMIT 1"
    );
    assert(karanNotifs.length > 0 && karanNotifs[0].title.includes('Automated E2E Test Assignment'), `Notification dispatched to Student Karan for new assignment: "${karanNotifs[0]?.title}"`);

    // Check notifications for Teacher Rohini (User 175)
    const [teacherNotifs] = await pool.query(
      "SELECT * FROM notifications WHERE recipient_user_id = 175 AND notification_type = 'Submission' ORDER BY notification_id DESC LIMIT 1"
    );
    assert(teacherNotifs.length > 0 && teacherNotifs[0].title.includes('Assignment Submission'), `Notification dispatched to Teacher Rohini on student submission: "${teacherNotifs[0]?.title}"`);

    // Check audit logs
    const [auditLogs] = await pool.query(
      "SELECT action, entity, details FROM audit_logs WHERE action IN ('ASSIGNMENT_CREATED', 'ASSIGNMENT_SUBMITTED', 'STUDY_MATERIAL_CREATED') ORDER BY log_id DESC LIMIT 5"
    );
    const hasAsgAudit = auditLogs.some(l => l.action === 'ASSIGNMENT_CREATED');
    const hasSubAudit = auditLogs.some(l => l.action === 'ASSIGNMENT_SUBMITTED');
    const hasMatAudit = auditLogs.some(l => l.action === 'STUDY_MATERIAL_CREATED');
    assert(hasAsgAudit, 'Audit log recorded: ASSIGNMENT_CREATED');
    assert(hasSubAudit, 'Audit log recorded: ASSIGNMENT_SUBMITTED');
    assert(hasMatAudit, 'Audit log recorded: STUDY_MATERIAL_CREATED');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    // -------------------------------------------------------------
    // CLEANUP TEST ARTIFACTS (Leave database clean & pristine)
    // -------------------------------------------------------------
    console.log('\n--- CLEANING UP TEST ARTIFACTS ---');
    if (createdAssignmentId) {
      const delRes = await fetch(`${BASE_URL}/api/assignments/${createdAssignmentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${teacherRohiniToken}` }
      });
      console.log(`Cleaned up test assignment #${createdAssignmentId}: Status ${delRes.status}`);
    }

    if (createdMaterialId) {
      const delMatRes = await fetch(`${BASE_URL}/api/study-materials/${createdMaterialId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${teacherRohiniToken}` }
      });
      console.log(`Cleaned up test material #${createdMaterialId}: Status ${delMatRes.status}`);
    }

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}

    console.log('\n====================================================');
    console.log(`FINAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
