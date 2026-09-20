const express = require('express');
const gradeController = require('../controllers/grade.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

router.use(requireAuth);

// Analytics & Specific Entity Breakdowns
router.get('/stats', requireRole('ADMIN', 'TEACHER'), gradeController.getGradeStats);
router.get('/student/:studentId/summary', requireRole('ADMIN', 'TEACHER', 'STUDENT'), gradeController.getStudentSummary);
router.get('/student/:studentId', requireRole('ADMIN', 'TEACHER', 'STUDENT'), gradeController.getStudentGrades);
router.get('/course/:courseId', requireRole('ADMIN', 'TEACHER'), gradeController.getCourseGrades);

// Core CRUD Endpoints
router.get('/', requireRole('ADMIN', 'TEACHER'), gradeController.getGrades);
router.get('/:id', requireRole('ADMIN', 'TEACHER'), gradeController.getGradeById);
router.post('/', requireRole('ADMIN', 'TEACHER'), gradeController.createGrade);
router.put('/:id', requireRole('ADMIN', 'TEACHER'), gradeController.updateGrade);
router.delete('/:id', requireRole('ADMIN'), gradeController.deleteGrade);

module.exports = router;
