const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedback.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

// All feedback endpoints require authentication and STUDENT role
router.use(requireAuth);
router.use(requireRole('STUDENT'));

// 1. GET /api/feedback/forms - List active, eligible forms for authenticated student
router.get('/forms', feedbackController.getStudentForms);
router.get('/', feedbackController.getStudentForms);

// 2. GET /api/feedback/forms/:id - Get form details and questions for authenticated student
router.get('/forms/:id', feedbackController.getStudentFormById);
router.get('/:id', feedbackController.getStudentFormById);

// 3. POST /api/feedback/forms/:id/submit - Submit answers for authenticated student
router.post('/forms/:id/submit', feedbackController.submitStudentFeedback);
router.post('/:id/submit', feedbackController.submitStudentFeedback);

module.exports = router;
