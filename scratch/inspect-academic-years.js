const pool = require('../src/config/db');

async function inspect() {
  try {
    const [cols] = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = DATABASE() 
        AND (column_name LIKE '%academic%' OR column_name LIKE '%year%')
    `);
    console.log('Columns matching academic or year:');
    console.table(cols);

    // Check distinct academic years in courses
    const [courses] = await pool.query('SELECT DISTINCT academic_year FROM courses');
    console.log('Courses distinct academic_year:', courses);

    // Check distinct academic years in enrollments if any
    try {
      const [enrollments] = await pool.query('SELECT DISTINCT academic_year FROM enrollments');
      console.log('Enrollments distinct academic_year:', enrollments);
    } catch (e) {
      console.log('Enrollments table has no academic_year column or error:', e.message);
    }

    // Check student 96 (Karan Bhapkar) accessible courses and academic years
    const [studentCourses] = await pool.query(`
      SELECT DISTINCT c.course_id, c.course_code, c.course_name, c.academic_year, c.semester
      FROM enrollments e
      JOIN courses c ON e.course_id = c.course_id
      WHERE e.student_id = 96
    `);
    console.log('Student 96 enrolled courses academic years:', studentCourses);

    // Check timetable academic years
    try {
      const [timetableYears] = await pool.query('SELECT DISTINCT academic_year FROM timetable');
      console.log('Timetable distinct academic_year:', timetableYears);
    } catch (e) {
      console.log('Timetable table error:', e.message);
    }

  } catch (err) {
    console.error('Error during inspect:', err);
  } finally {
    pool.end();
  }
}

inspect();
