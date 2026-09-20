const express = require('express');
const enrollmentController = require('../controllers/enrollment.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

// Read endpoints accessible by authenticated users
router.get('/', requireAuth, enrollmentController.getEnrollments);
router.get('/:id', requireAuth, enrollmentController.getEnrollmentById);

// Enforce ADMIN role authentication for enrollment mutations
router.post('/', requireAuth, requireRole('ADMIN'), enrollmentController.createEnrollment);
router.put('/:id', requireAuth, requireRole('ADMIN'), enrollmentController.updateEnrollment);
router.patch('/:id/status', requireAuth, requireRole('ADMIN'), enrollmentController.updateStatus);
router.delete('/:id', requireAuth, requireRole('ADMIN'), enrollmentController.deleteEnrollment);

module.exports = router;
