const express = require('express');
const router = express.Router();
const teacherFeedbackController = require('../controllers/teacherFeedback.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

/**
 * All teacher feedback endpoints require authentication and TEACHER role
 */
router.use(requireAuth);
router.use(requireRole('TEACHER'));

// 1. Form management
router.get('/forms', teacherFeedbackController.getTeacherForms);
router.get('/', teacherFeedbackController.getTeacherForms);
router.post('/forms', teacherFeedbackController.createTeacherForm);
router.post('/', teacherFeedbackController.createTeacherForm);

router.get('/forms/:id', teacherFeedbackController.getTeacherFormById);
router.get('/:id', teacherFeedbackController.getTeacherFormById);
router.put('/forms/:id', teacherFeedbackController.updateTeacherForm);
router.put('/:id', teacherFeedbackController.updateTeacherForm);
router.delete('/forms/:id', teacherFeedbackController.deleteTeacherForm);
router.delete('/:id', teacherFeedbackController.deleteTeacherForm);

// 2. Question management
router.post('/forms/:id/questions', teacherFeedbackController.addTeacherQuestion);
router.put('/questions/:questionId', teacherFeedbackController.updateTeacherQuestion);
router.put('/forms/:id/questions/:questionId', teacherFeedbackController.updateTeacherQuestion);
router.delete('/questions/:questionId', teacherFeedbackController.deleteTeacherQuestion);
router.delete('/forms/:id/questions/:questionId', teacherFeedbackController.deleteTeacherQuestion);

// 3. Student submission status (Roster of who submitted vs pending, NO answers exposed)
router.get('/forms/:id/submissions', teacherFeedbackController.getTeacherFormSubmissions);
router.get('/forms/:id/submission-status', teacherFeedbackController.getTeacherFormSubmissions);
router.get('/forms/:id/students', teacherFeedbackController.getTeacherFormSubmissions);

// 4. Aggregated analytics (Rating distribution, averages, MCQ stats, anonymous text feed)
router.get('/forms/:id/analytics', teacherFeedbackController.getTeacherFormAnalytics);

module.exports = router;
