const express = require('express');
const performanceController = require('../controllers/performance.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

// Strict RBAC: All performance routes require authenticated ADMIN
router.use(requireAuth);
router.use(requireRole('ADMIN'));

// Analytics & KPI endpoints
router.get('/overview', performanceController.getOverview);
router.get('/at-risk', performanceController.getAtRisk);
router.get('/top-performers', performanceController.getTopPerformers);
router.get('/attendance-vs-performance', performanceController.getAttendanceVsPerformance);
router.get('/grade-distribution', performanceController.getGradeDistribution);
router.get('/semester', performanceController.getSemesterPerformance);
router.get('/students', performanceController.getStudents);

// Entity-specific performance breakdowns
router.get('/student/:studentId', performanceController.getStudentPerformance);
router.get('/course/:courseId', performanceController.getCoursePerformance);
router.get('/department/:departmentId', performanceController.getDepartmentPerformance);

module.exports = router;
