const express = require('express');
const queryController = require('../controllers/query.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

// All query routes require authentication
router.use(requireAuth);

// Analytics / Stats (role-scoped)
router.get('/stats', queryController.getQueryStats);

// Dropdown Helpers
router.get('/teachers', queryController.getActiveTeachers);
router.get('/courses', queryController.getAvailableCourses);

// Queries List & Detail
router.get('/', queryController.getQueries);
router.get('/:id', queryController.getQueryById);

// Create Query (Students & Admins)
router.post('/', queryController.createQuery);

// Reply to Query
router.post('/:id/replies', queryController.addReply);

// Update Status (Closed/Resolved/In Progress)
router.patch('/:id/status', queryController.updateQueryStatus);

// Delete Query (Strictly Admin only)
router.delete('/:id', requireRole('ADMIN'), queryController.deleteQuery);

module.exports = router;
