const express = require('express');
const router = express.Router();
const academicEventController = require('../controllers/academicEvent.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

// All academic event routes require authentication
router.use(requireAuth);

// Read endpoints (Available to ADMIN, TEACHER, and STUDENT with server-side RBAC scoping)
router.get('/', academicEventController.getEvents);
router.get('/upcoming', academicEventController.getUpcomingEvents);
router.get('/today', academicEventController.getTodayEvents);
router.get('/exams', academicEventController.getExams);
router.get('/:id', academicEventController.getEventById);

// Trigger automatic reminders (ADMIN only)
router.post('/trigger-reminders', requireRole('ADMIN'), academicEventController.triggerReminders);

// Event management (ADMIN and TEACHER only)
router.post('/', requireRole('ADMIN', 'TEACHER'), academicEventController.createEvent);
router.put('/:id', requireRole('ADMIN', 'TEACHER'), academicEventController.updateEvent);
router.delete('/:id', requireRole('ADMIN', 'TEACHER'), academicEventController.deleteEvent);

module.exports = router;
