const express = require('express');
const courseController = require('../controllers/course.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

// Course read endpoints accessible by authenticated users (ADMIN, TEACHER, STUDENT)
router.get('/', requireAuth, courseController.getCourses);
router.get('/:id', requireAuth, courseController.getCourseById);

// Enforce ADMIN role authentication for course mutations
router.post('/', requireAuth, requireRole('ADMIN'), courseController.createCourse);
router.put('/:id', requireAuth, requireRole('ADMIN'), courseController.updateCourse);
router.patch('/:id/status', requireAuth, requireRole('ADMIN'), courseController.updateStatus);
router.delete('/:id', requireAuth, requireRole('ADMIN'), courseController.deleteCourse);

module.exports = router;
