const express = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const studentRoutes = require('./student.routes');
const teacherRoutes = require('./teacher.routes');
const departmentRoutes = require('./department.routes');
const courseRoutes = require('./course.routes');
const enrollmentRoutes = require('./enrollment.routes');
const timetableRoutes = require('./timetable.routes');
const attendanceRoutes = require('./attendance.routes');

const router = express.Router();

// Mount authentication routes under /auth
router.use('/auth', authRoutes);

// Mount user management routes under /users (Protected ADMIN only)
router.use('/users', userRoutes);

// Mount student management routes under /students (Protected ADMIN only)
router.use('/students', studentRoutes);

// Mount teacher management routes under /teachers (Protected ADMIN only)
router.use('/teachers', teacherRoutes);

// Mount department routes under /departments (Protected ADMIN only)
router.use('/departments', departmentRoutes);

// Mount course routes under /courses (Protected ADMIN only)
router.use('/courses', courseRoutes);

// Mount enrollment routes under /enrollments (Protected ADMIN only)
router.use('/enrollments', enrollmentRoutes);

// Mount timetable routes under /timetable (Protected ADMIN only)
router.use('/timetable', timetableRoutes);

// Mount attendance routes under /attendance (Protected ADMIN only)
router.use('/attendance', attendanceRoutes);

// Mount grades routes under /grades (Protected ADMIN only)
const gradeRoutes = require('./grade.routes');
router.use('/grades', gradeRoutes);

// Mount performance routes under /performance (Protected ADMIN only)
const performanceRoutes = require('./performance.routes');
router.use('/performance', performanceRoutes);

// Mount assignments routes under /assignments (Protected ADMIN only)
const assignmentRoutes = require('./assignment.routes');
router.use('/assignments', assignmentRoutes);

// Mount study materials routes under /study-materials (Protected ADMIN only)
const studyMaterialRoutes = require('./studyMaterial.routes');
router.use('/study-materials', studyMaterialRoutes);

// Mount notices routes under /notices (Protected ADMIN only)
const noticeRoutes = require('./notice.routes');
router.use('/notices', noticeRoutes);

// Mount notifications routes under /notifications (Protected ADMIN only)
const notificationRoutes = require('./notification.routes');
router.use('/notifications', notificationRoutes);

// Mount queries routes under /queries (RBAC: Student, Teacher, Admin)
const queryRoutes = require('./query.routes');
router.use('/queries', queryRoutes);

// Mount reports & export routes under /reports (RBAC: Student, Teacher, Admin)
const reportRoutes = require('./report.routes');
router.use('/reports', reportRoutes);

// Mount audit logs routes under /audit-logs (Protected ADMIN only)
const auditRoutes = require('./audit.routes');
router.use('/audit-logs', auditRoutes);

// Mount backup & restore routes under /backups and /backup (Protected ADMIN only)
const backupRoutes = require('./backup.routes');
router.use('/backups', backupRoutes);
router.use('/backup', backupRoutes);

// Mount academic events and calendar routes under /academic-events
const academicEventRoutes = require('./academicEvent.routes');
router.use('/academic-events', academicEventRoutes);

// Mount face authentication routes under /face-auth
const faceAuthRoutes = require('./faceAuth.routes');
router.use('/face-auth', faceAuthRoutes);

// Mount student feedback routes under /feedback (RBAC: STUDENT)
const feedbackRoutes = require('./feedback.routes');
router.use('/feedback', feedbackRoutes);

// Mount admin feedback management routes under /admin/feedback (RBAC: ADMIN)
const adminFeedbackRoutes = require('./adminFeedback.routes');
router.use('/admin/feedback', adminFeedbackRoutes);

// Mount teacher feedback management routes under /teacher/feedback (RBAC: TEACHER)
const teacherFeedbackRoutes = require('./teacherFeedback.routes');
router.use('/teacher/feedback', teacherFeedbackRoutes);

// Mount admin email management routes under /admin/email (RBAC: ADMIN)
const adminEmailRoutes = require('./adminEmail.routes');
router.use('/admin/email', adminEmailRoutes);

// Mount user email preferences routes under /email/preferences (RBAC: STUDENT, TEACHER)
const emailPreferenceRoutes = require('./emailPreference.routes');
router.use('/email/preferences', emailPreferenceRoutes);

// Mount canonical profile routes under /profile (RBAC: All Authenticated Roles)
const profileRoutes = require('./profile.routes');
router.use('/profile', profileRoutes);

module.exports = router;



