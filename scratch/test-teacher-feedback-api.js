const http = require('http');

const BASE_URL = 'http://localhost:5000';

// Helper: Make HTTP requests
function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: {
        'Accept': 'application/json',
        ...headers
      }
    };

    let reqBody = null;
    if (body !== null) {
      reqBody = typeof body === 'string' ? body : JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(reqBody);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = { raw: data };
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

// Helper: Login and obtain token
async function login(username, password) {
  const res = await request('POST', '/api/auth/login', {}, { username, password });
  const token = res.data?.data?.token || res.data?.token;
  if (res.status !== 200 || !token) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(res.data)}`);
  }
  return token;
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('STARTING STEP 5A: TEACHER FEEDBACK BACKEND API TEST SUITE');
  console.log('===============================================================');

  try {
    // 1. Authenticate users
    console.log('\n--- 1. Authenticating test users ---');
    const teacherToken1 = await login('Rohini', 'Rohini@123'); // teacher_id: 90, user_id: 175
    const teacherToken2 = await login('Vikas', 'Vikas@123');   // teacher_id: 91, user_id: 176
    const studentToken = await login('Karan', 'Karan@123');    // student_id: 96, user_id: 174
    const adminToken = await login('admin', 'Admin@123');      // user_id: 1

    assert(Boolean(teacherToken1), 'Teacher 1 (Rohini) logged in successfully');
    assert(Boolean(teacherToken2), 'Teacher 2 (Vikas) logged in successfully');
    assert(Boolean(studentToken), 'Student (Karan) logged in successfully');
    assert(Boolean(adminToken), 'Admin logged in successfully');

    // 2. RBAC & Access Control Tests
    console.log('\n--- 2. RBAC & Role Restrictions ---');
    // Unauthenticated
    const unauthRes = await request('GET', '/api/teacher/feedback/forms');
    assert(unauthRes.status === 401, 'Unauthenticated request returns 401 Unauthorized');

    // Student role forbidden
    const studentAccessRes = await request('GET', '/api/teacher/feedback/forms', {
      'Authorization': `Bearer ${studentToken}`
    });
    assert(studentAccessRes.status === 403, 'Student access to teacher feedback returns 403 Forbidden');

    // Teacher role allowed
    const teacherAccessRes = await request('GET', '/api/teacher/feedback/forms', {
      'Authorization': `Bearer ${teacherToken1}`
    });
    assert(teacherAccessRes.status === 200, 'Teacher access returns 200 OK');
    assert(teacherAccessRes.data.success === true, 'Teacher response indicates success');

    // 3. Anti-Self-Evaluation Rule Tests (Rule 2)
    console.log('\n--- 3. Anti-Self-Evaluation Validation ---');
    // Rohini (teacher_id: 90) teaches course 146 in timetable.
    const now = new Date();
    const startDate = new Date(now.getTime() - 3600 * 1000).toISOString();
    const endDate = new Date(now.getTime() + 7 * 86400 * 1000).toISOString();

    // A) Creating feedback for own course 146 -> MUST BE REJECTED
    const ownCourseRes = await request('POST', '/api/teacher/feedback/forms', {
      'Authorization': `Bearer ${teacherToken1}`
    }, {
      title: 'Feedback on DSML by Rohini (Own Course)',
      target_type: 'COURSE',
      target_id: 146, // Rohini's own course
      start_date: startDate,
      end_date: endDate
    });
    assert(ownCourseRes.status === 400, 'Teacher creating feedback for own course is rejected with 400 Bad Request');
    assert(ownCourseRes.data.message.includes('not permitted'), 'Rejection message cites anti-self-evaluation rule');

    // B) Creating feedback evaluating self (target_type: TEACHER, target_id: 90) -> MUST BE REJECTED
    const selfEvalRes = await request('POST', '/api/teacher/feedback/forms', {
      'Authorization': `Bearer ${teacherToken1}`
    }, {
      title: 'Feedback on Rohini by Rohini (Self Evaluation)',
      target_type: 'TEACHER',
      target_id: 90, // Rohini's own teacher_id
      start_date: startDate,
      end_date: endDate
    });
    assert(selfEvalRes.status === 400, 'Teacher creating feedback evaluating themselves is rejected with 400 Bad Request');
    assert(selfEvalRes.data.message.includes('not permitted') || selfEvalRes.data.message.includes('themselves'), 'Rejection message cites self-evaluation prohibition');

    // C) Creating COURSE feedback without target_id -> REJECTED
    const noTargetCourseRes = await request('POST', '/api/teacher/feedback/forms', {
      'Authorization': `Bearer ${teacherToken1}`
    }, {
      title: 'Feedback without course target',
      target_type: 'COURSE',
      start_date: startDate,
      end_date: endDate
    });
    assert(noTargetCourseRes.status === 400, 'COURSE feedback without target_id is rejected with 400');

    // D) Invalid date range (start_date >= end_date) -> REJECTED
    const badDateRes = await request('POST', '/api/teacher/feedback/forms', {
      'Authorization': `Bearer ${teacherToken1}`
    }, {
      title: 'Bad Date Form',
      target_type: 'GENERAL',
      start_date: endDate,
      end_date: startDate
    });
    assert(badDateRes.status === 400, 'Form with start_date >= end_date is rejected with 400');

    // E) Allowed Form Creation: Rohini creates feedback for course 147 (DSA, taught by Sarthak) or GENERAL
    const createSuccessRes = await request('POST', '/api/teacher/feedback/forms', {
      'Authorization': `Bearer ${teacherToken1}`
    }, {
      title: 'Mid-Sem Departmental Feedback by Rohini',
      description: 'Comprehensive review of lab facilities and teaching methodology',
      target_type: 'GENERAL',
      semester: 5,
      start_date: startDate,
      end_date: endDate,
      is_active: true
    });
    assert(createSuccessRes.status === 201, 'Teacher successfully creates allowed feedback form with 201 Created');
    assert(Boolean(createSuccessRes.data.data?.feedback_form_id), 'Response contains new feedback_form_id');

    const createdFormId = createSuccessRes.data.data?.feedback_form_id;

    // 4. Question Management Tests
    console.log('\n--- 4. Question Management on Teacher Form ---');
    // Add Rating Question
    const addQ1Res = await request('POST', `/api/teacher/feedback/forms/${createdFormId}/questions`, {
      'Authorization': `Bearer ${teacherToken1}`
    }, {
      question_text: 'How satisfied are you with the lab equipment and resources?',
      question_type: 'RATING',
      is_required: true,
      display_order: 1
    });
    assert(addQ1Res.status === 201, 'Teacher added RATING question successfully');
    const q1Id = addQ1Res.data.data?.question_id;

    // Add MCQ Question
    const addQ2Res = await request('POST', `/api/teacher/feedback/forms/${createdFormId}/questions`, {
      'Authorization': `Bearer ${teacherToken1}`
    }, {
      question_text: 'Which area needs the most improvement?',
      question_type: 'MULTIPLE_CHOICE',
      is_required: false,
      display_order: 2
    });
    assert(addQ2Res.status === 201, 'Teacher added MULTIPLE_CHOICE question successfully');
    const q2Id = addQ2Res.data.data?.question_id;

    // Add Text Question
    const addQ3Res = await request('POST', `/api/teacher/feedback/forms/${createdFormId}/questions`, {
      'Authorization': `Bearer ${teacherToken1}`
    }, {
      question_text: 'What constructive suggestions do you have for the department?',
      question_type: 'TEXT',
      is_required: false,
      display_order: 3
    });
    assert(addQ3Res.status === 201, 'Teacher added TEXT question successfully');
    const q3Id = addQ3Res.data.data?.question_id;

    // Add a temporary question to test delete question
    const addQTempRes = await request('POST', `/api/teacher/feedback/forms/${createdFormId}/questions`, {
      'Authorization': `Bearer ${teacherToken1}`
    }, {
      question_text: 'Temporary question to delete',
      question_type: 'TEXT',
      is_required: false,
      display_order: 99
    });
    const qTempId = addQTempRes.data.data?.question_id;

    // Update question
    const updateQRes = await request('PUT', `/api/teacher/feedback/questions/${q1Id}`, {
      'Authorization': `Bearer ${teacherToken1}`
    }, {
      question_text: 'How satisfied are you with the department lab resources and setup?',
      display_order: 1
    });
    assert(updateQRes.status === 200, 'Teacher updated question successfully');
    assert(updateQRes.data.data?.question_text.includes('setup'), 'Updated question text persisted');

    // Delete question
    const delQRes = await request('DELETE', `/api/teacher/feedback/questions/${qTempId}`, {
      'Authorization': `Bearer ${teacherToken1}`
    });
    assert(delQRes.status === 200, 'Teacher deleted question successfully');

    // 5. Strict Isolation Tests (Rule 3)
    console.log('\n--- 5. Strict Teacher Isolation & Anti-IDOR Enforcement ---');
    // Teacher 2 (Vikas) attempts to view Teacher 1's form -> FORBIDDEN (403)
    const vikasViewRes = await request('GET', `/api/teacher/feedback/forms/${createdFormId}`, {
      'Authorization': `Bearer ${teacherToken2}`
    });
    assert(vikasViewRes.status === 403, 'Teacher 2 cannot view Teacher 1 form (403 Forbidden)');

    // Teacher 2 attempts to list forms -> Rohini\'s form NOT visible to Vikas
    const vikasListRes = await request('GET', '/api/teacher/feedback/forms', {
      'Authorization': `Bearer ${teacherToken2}`
    });
    const vikasFormIds = (vikasListRes.data.data?.forms || []).map(f => f.feedback_form_id);
    assert(!vikasFormIds.includes(createdFormId), 'Teacher 2 forms list strictly isolates and excludes Teacher 1 forms');

    // Teacher 2 attempts to update Teacher 1's form -> FORBIDDEN (403)
    const vikasUpdateRes = await request('PUT', `/api/teacher/feedback/forms/${createdFormId}`, {
      'Authorization': `Bearer ${teacherToken2}`
    }, {
      title: 'Hacked by Vikas'
    });
    assert(vikasUpdateRes.status === 403, 'Teacher 2 cannot update Teacher 1 form (403 Forbidden)');

    // Teacher 2 attempts to delete Teacher 1's form -> FORBIDDEN (403)
    const vikasDeleteRes = await request('DELETE', `/api/teacher/feedback/forms/${createdFormId}`, {
      'Authorization': `Bearer ${teacherToken2}`
    });
    assert(vikasDeleteRes.status === 403, 'Teacher 2 cannot delete Teacher 1 form (403 Forbidden)');

    // Teacher 2 attempts to add question to Teacher 1's form -> FORBIDDEN (403)
    const vikasAddQRes = await request('POST', `/api/teacher/feedback/forms/${createdFormId}/questions`, {
      'Authorization': `Bearer ${teacherToken2}`
    }, {
      question_text: 'Unauthorized question',
      question_type: 'RATING'
    });
    assert(vikasAddQRes.status === 403, 'Teacher 2 cannot add question to Teacher 1 form (403 Forbidden)');

    // Teacher 2 attempts to update question on Teacher 1's form -> FORBIDDEN (403)
    const vikasUpdateQRes = await request('PUT', `/api/teacher/feedback/questions/${q1Id}`, {
      'Authorization': `Bearer ${teacherToken2}`
    }, {
      question_text: 'Unauthorized change'
    });
    assert(vikasUpdateQRes.status === 403, 'Teacher 2 cannot update question on Teacher 1 form (403 Forbidden)');

    // Teacher 2 attempts to delete question on Teacher 1's form -> FORBIDDEN (403)
    const vikasDelQRes = await request('DELETE', `/api/teacher/feedback/questions/${q1Id}`, {
      'Authorization': `Bearer ${teacherToken2}`
    });
    assert(vikasDelQRes.status === 403, 'Teacher 2 cannot delete question on Teacher 1 form (403 Forbidden)');

    // Teacher 2 attempts to view submissions or analytics -> FORBIDDEN (403)
    const vikasSubmissionsRes = await request('GET', `/api/teacher/feedback/forms/${createdFormId}/submissions`, {
      'Authorization': `Bearer ${teacherToken2}`
    });
    assert(vikasSubmissionsRes.status === 403, 'Teacher 2 cannot view submissions of Teacher 1 form (403 Forbidden)');

    const vikasAnalyticsRes = await request('GET', `/api/teacher/feedback/forms/${createdFormId}/analytics`, {
      'Authorization': `Bearer ${teacherToken2}`
    });
    assert(vikasAnalyticsRes.status === 403, 'Teacher 2 cannot view analytics of Teacher 1 form (403 Forbidden)');

    // 6. Form Information & Question Retrieval for Creator (Rule 4)
    console.log('\n--- 6. Teacher Viewing Own Form & Questions ---');
    const getOwnFormRes = await request('GET', `/api/teacher/feedback/forms/${createdFormId}`, {
      'Authorization': `Bearer ${teacherToken1}`
    });
    assert(getOwnFormRes.status === 200, 'Teacher can view own form (200 OK)');
    assert(getOwnFormRes.data.data?.feedback_form_id === createdFormId, 'Returned form matches createdFormId');
    assert(getOwnFormRes.data.data?.questions.length === 3, 'Questions list contains exactly the 3 added questions');
    assert(getOwnFormRes.data.data?.title === 'Mid-Sem Departmental Feedback by Rohini', 'Form title matches');
    assert(getOwnFormRes.data.data?.is_active === true, 'Form is_active is true');

    // 7. Student Submissions & Submission Tracking (Rule 5)
    console.log('\n--- 7. Student Feedback Submission & Submission Tracking ---');
    // Check submissions before any student submits
    const preSubmissionsRes = await request('GET', `/api/teacher/feedback/forms/${createdFormId}/submissions`, {
      'Authorization': `Bearer ${teacherToken1}`
    });
    assert(preSubmissionsRes.status === 200, 'Teacher can view submissions roster (200 OK)');
    const initialStudents = preSubmissionsRes.data.data?.students || [];
    assert(initialStudents.length > 0, `Roster returned ${initialStudents.length} eligible students`);
    const karanInitial = initialStudents.find(s => s.prn_number === 'B24IT1005' || s.student_id === 96);
    assert(Boolean(karanInitial), 'Student Karan (B24IT1005) is in eligible roster');
    assert(karanInitial?.has_submitted === false, 'Karan initially has_submitted = false');
    assert(karanInitial?.submitted_at === null, 'Karan initially submitted_at = null');

    // Student (Karan) submits answers via student API
    const submitFeedbackRes = await request('POST', `/api/feedback/forms/${createdFormId}/submit`, {
      'Authorization': `Bearer ${studentToken}`
    }, {
      answers: [
        { question_id: q1Id, rating: 4.5 },
        { question_id: q2Id, answer_text: 'Lab computers and software licensing' },
        { question_id: q3Id, answer_text: 'Please organize more hands-on workshop sessions.' }
      ]
    });
    assert(submitFeedbackRes.status === 201, 'Student successfully submitted feedback answers (201 Created)');

    // Teacher checks submissions again
    const postSubmissionsRes = await request('GET', `/api/teacher/feedback/forms/${createdFormId}/submissions`, {
      'Authorization': `Bearer ${teacherToken1}`
    });
    assert(postSubmissionsRes.status === 200, 'Teacher retrieved updated submissions roster');
    const updatedStudents = postSubmissionsRes.data.data?.students || [];
    const karanUpdated = updatedStudents.find(s => s.prn_number === 'B24IT1005' || s.student_id === 96);
    assert(karanUpdated?.has_submitted === true, 'Karan now has_submitted = true');
    assert(Boolean(karanUpdated?.submitted_at), 'Karan submitted_at timestamp is populated');
    assert(postSubmissionsRes.data.data?.summary?.submitted_count >= 1, 'Summary submitted_count incremented');

    // Test status filtering: status=submitted vs status=pending
    const submittedFilterRes = await request('GET', `/api/teacher/feedback/forms/${createdFormId}/submissions?status=submitted`, {
      'Authorization': `Bearer ${teacherToken1}`
    });
    assert(submittedFilterRes.data.data?.students.every(s => s.has_submitted === true), 'Filter status=submitted returns only submitted students');

    const pendingFilterRes = await request('GET', `/api/teacher/feedback/forms/${createdFormId}/submissions?status=pending`, {
      'Authorization': `Bearer ${teacherToken1}`
    });
    assert(pendingFilterRes.data.data?.students.every(s => s.has_submitted === false), 'Filter status=pending returns only pending students');

    // 8. Strict Privacy & Anonymity Audit (Rules 6 & 7)
    console.log('\n--- 8. Strict Privacy & Student Anonymity Audit ---');
    // A) Inspect submission roster payload: must NOT contain answers, rating, or answer_text
    const stringifiedRoster = JSON.stringify(postSubmissionsRes.data.data?.students);
    assert(!stringifiedRoster.includes('answer_text'), 'Submissions roster contains ZERO answer_text fields');
    assert(!stringifiedRoster.includes('rating'), 'Submissions roster contains ZERO rating fields');
    assert(!stringifiedRoster.includes('response_id'), 'Submissions roster contains ZERO response_id fields');
    assert(!stringifiedRoster.includes('workshop sessions'), 'Submissions roster does NOT leak student remarks');

    // B) Check Analytics: Must provide aggregated metrics only
    const analyticsRes = await request('GET', `/api/teacher/feedback/forms/${createdFormId}/analytics`, {
      'Authorization': `Bearer ${teacherToken1}`
    });
    assert(analyticsRes.status === 200, 'Teacher analytics retrieved successfully');
    const analyticsData = analyticsRes.data.data;
    assert(analyticsData.total_responses >= 1, 'Analytics shows total_responses >= 1');
    assert(analyticsData.overall_average_rating !== null, 'Overall average rating is calculated');
    assert(Array.isArray(analyticsData.rating_analytics), 'Rating analytics is an array');

    // Check rating distribution
    const q1Analytics = analyticsData.rating_analytics.find(q => q.question_id === q1Id);
    assert(Boolean(q1Analytics), 'Q1 rating metrics present in analytics');
    assert(q1Analytics?.average_rating > 0, 'Q1 average rating is positive number');
    assert(q1Analytics?.distribution && typeof q1Analytics.distribution === 'object', 'Q1 distribution object present');

    // Check MCQ analytics
    const q2Analytics = analyticsData.multiple_choice_analytics.find(q => q.question_id === q2Id);
    assert(Boolean(q2Analytics), 'Q2 MCQ analytics present');
    assert(q2Analytics?.options_distribution['Lab computers and software licensing'] >= 1, 'Q2 options distribution aggregated student choice');

    // Check Text feedback feed (ANONYMOUS LIST)
    const q3Analytics = analyticsData.text_analytics.find(q => q.question_id === q3Id);
    assert(Boolean(q3Analytics), 'Q3 text analytics present');
    assert(Array.isArray(q3Analytics?.feedback_feed), 'Q3 feedback_feed is an array of strings');
    assert(q3Analytics?.feedback_feed.includes('Please organize more hands-on workshop sessions.'), 'Q3 contains student comment in anonymous feed');

    // Privacy verification on Analytics payload
    const stringifiedAnalytics = JSON.stringify(analyticsData);
    assert(!stringifiedAnalytics.includes('Karan'), 'Analytics payload does NOT contain student name Karan');
    assert(!stringifiedAnalytics.includes('B24IT1005'), 'Analytics payload does NOT contain student PRN');
    assert(!stringifiedAnalytics.includes('student_id'), 'Analytics payload does NOT contain student_id');

    // 9. Update & Delete Form Lifecycle
    console.log('\n--- 9. Form Update & Deletion Lifecycle ---');
    // Update title
    const updateFormRes = await request('PUT', `/api/teacher/feedback/forms/${createdFormId}`, {
      'Authorization': `Bearer ${teacherToken1}`
    }, {
      title: 'Updated Mid-Sem Departmental Feedback by Rohini'
    });
    assert(updateFormRes.status === 200, 'Teacher updated form successfully');
    assert(updateFormRes.data.data?.title.includes('Updated'), 'Updated title confirmed in response');

    // Attempting to update form to teacher's own course -> REJECTED (400)
    const updateToOwnCourseRes = await request('PUT', `/api/teacher/feedback/forms/${createdFormId}`, {
      'Authorization': `Bearer ${teacherToken1}`
    }, {
      target_type: 'COURSE',
      target_id: 146 // Own course
    });
    assert(updateToOwnCourseRes.status === 400, 'Updating form to own course is rejected with 400');

    // Delete form
    const deleteFormRes = await request('DELETE', `/api/teacher/feedback/forms/${createdFormId}`, {
      'Authorization': `Bearer ${teacherToken1}`
    });
    assert(deleteFormRes.status === 200, 'Teacher deleted form successfully');

    // Confirm form is gone
    const verifyDelRes = await request('GET', `/api/teacher/feedback/forms/${createdFormId}`, {
      'Authorization': `Bearer ${teacherToken1}`
    });
    assert(verifyDelRes.status === 404, 'Form retrieval after deletion returns 404 Not Found');

    console.log('\n===============================================================');
    console.log(`TEST SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Unexpected test failure:', err);
    process.exit(1);
  }
}

runTests();
