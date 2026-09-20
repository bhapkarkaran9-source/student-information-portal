const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetable.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

// All timetable management routes require authentication
router.use(requireAuth);

// Smart Timetable & Lecture Reminders endpoints
router.get('/today', timetableController.getTodayTimetable);
router.post('/reminders/check', timetableController.checkAndDispatchReminders);

// Read endpoints accessible by authenticated users (ADMIN, TEACHER, STUDENT)
router.get('/', timetableController.getTimetable);
router.get('/:id', timetableController.getTimetableById);

// Admin-only mutation endpoints
router.post('/', requireRole('ADMIN'), timetableController.createTimetable);
router.put('/:id', requireRole('ADMIN'), timetableController.updateTimetable);
router.delete('/:id', requireRole('ADMIN'), timetableController.deleteTimetable);

module.exports = router;
