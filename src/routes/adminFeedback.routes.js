const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedback.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

// All admin feedback endpoints require authentication and ADMIN role
router.use(requireAuth);
router.use(requireRole('ADMIN'));

// 1. Form management
router.get('/forms', feedbackController.getAdminForms);
router.post('/forms', feedbackController.createAdminForm);
router.get('/forms/:id', feedbackController.getAdminFormById);
router.put('/forms/:id', feedbackController.updateAdminForm);
router.delete('/forms/:id', feedbackController.deleteAdminForm);

// 2. Question management
router.post('/forms/:id/questions', feedbackController.addAdminQuestion);
router.put('/questions/:questionId', feedbackController.updateAdminQuestion);
router.put('/forms/:id/questions/:questionId', feedbackController.updateAdminQuestion);
router.delete('/questions/:questionId', feedbackController.deleteAdminQuestion);
router.delete('/forms/:id/questions/:questionId', feedbackController.deleteAdminQuestion);

// 3. Responses and Analytics
router.get('/forms/:id/responses', feedbackController.getAdminFormResponses);
router.get('/forms/:id/analytics', feedbackController.getAdminFormAnalytics);

module.exports = router;
