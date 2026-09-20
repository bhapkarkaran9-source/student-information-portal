const pool = require('../src/config/db');
const jwt = require('jsonwebtoken');

async function testLate() {
  const token = jwt.sign({ user_id: 174, role: 'STUDENT', username: 'Karan' }, process.env.JWT_SECRET || 'change_this_secret');
  const pastDue = new Date(Date.now() - 3600000).toISOString().slice(0, 19).replace('T', ' ');

  const [res] = await pool.query(
    'INSERT INTO assignments (course_id, teacher_id, title, due_date, max_marks) VALUES (?, ?, ?, ?, ?)',
    [146, 90, 'Past Due Test', pastDue, 100]
  );
  const asgId = res.insertId;

  const form = new FormData();
  form.append('file', new Blob(['test solution'], { type: 'text/plain' }), 'solution.txt');
  const submitRes = await fetch(`http://localhost:5000/api/assignments/${asgId}/submit`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form
  });
  const subJson = await submitRes.json();
  console.log('Submission status:', subJson.data?.submission?.status);

  // Clean up
  await pool.query('DELETE FROM assignments WHERE assignment_id = ?', [asgId]);

  if (subJson.data?.submission?.status === 'Late Submission') {
    console.log('LATE SUBMISSION LOGIC VERIFIED: PASSED');
    process.exit(0);
  } else {
    console.error('LATE SUBMISSION LOGIC FAILED');
    process.exit(1);
  }
}

testLate().catch(e => {
  console.error(e);
  process.exit(1);
});
