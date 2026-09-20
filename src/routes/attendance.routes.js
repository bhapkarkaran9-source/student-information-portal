const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

// All attendance management routes require authentication
router.use(requireAuth);

// Courses and breakdown routes (must precede /:id)
router.get('/courses', requireRole('ADMIN', 'TEACHER'), attendanceController.getAttendanceCourses);
router.get('/summary', requireRole('ADMIN', 'TEACHER'), attendanceController.getAttendanceSummary);
router.get('/my-attendance', requireRole('STUDENT'), attendanceController.getMyAttendance);
router.get('/department-faculty', requireRole('STUDENT'), attendanceController.getStudentDepartmentFaculty);
router.get('/faculty', requireRole('STUDENT'), attendanceController.getStudentDepartmentFaculty);
router.get('/student/:studentId', requireRole('ADMIN', 'TEACHER', 'STUDENT'), attendanceController.getStudentAttendance);
router.get('/course/:courseId', requireRole('ADMIN', 'TEACHER'), attendanceController.getCourseAttendance);

// Session routes (must precede /:id)
router.get('/sessions', requireRole('ADMIN', 'TEACHER'), attendanceController.getAttendanceSessions);
router.get('/sessions/:sessionId', requireRole('ADMIN', 'TEACHER'), attendanceController.getSessionDetails);
router.put('/sessions/:sessionId', requireRole('ADMIN', 'TEACHER'), attendanceController.updateSessionAttendance);
router.delete('/sessions/:sessionId', requireRole('ADMIN', 'TEACHER'), attendanceController.deleteSessionAttendance);

// Dynamic QR Attendance routes (must precede /:id)
router.post('/qr/start', requireRole('TEACHER'), attendanceController.startQRAttendanceSession);
router.get('/qr/active', requireRole('TEACHER'), attendanceController.getActiveQRSession);
router.get('/qr/active-session', requireRole('STUDENT'), attendanceController.getActiveQRSessionForStudent);
router.get('/qr/student/active', requireRole('STUDENT'), attendanceController.getActiveQRSessionForStudent);
router.get('/qr/token/:sessionId', requireRole('TEACHER'), attendanceController.getQRSessionToken);
router.post('/qr/visibility/:sessionId', requireRole('TEACHER'), attendanceController.toggleQRStudentVisibility);
router.patch('/qr/visibility/:sessionId', requireRole('TEACHER'), attendanceController.toggleQRStudentVisibility);
router.post('/qr/close/:sessionId', requireRole('TEACHER'), attendanceController.closeQRAttendanceSession);
router.post('/qr/scan', requireRole('STUDENT'), attendanceController.scanQRAttendance);

// Standard CRUD endpoints
router.get('/', requireRole('ADMIN', 'TEACHER'), attendanceController.getAttendance);
router.get('/:id', requireRole('ADMIN', 'TEACHER'), attendanceController.getAttendanceById);
router.post('/', requireRole('ADMIN', 'TEACHER'), attendanceController.createAttendance);
router.put('/:id', requireRole('ADMIN', 'TEACHER'), attendanceController.updateAttendance);
router.delete('/:id', requireRole('ADMIN'), attendanceController.deleteAttendance);

module.exports = router;
