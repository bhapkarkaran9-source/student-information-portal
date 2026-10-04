const express = require('express');
const teacherController = require('../controllers/teacher.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

// Teacher self-service profile completion route (accessible by TEACHER)
router.use(requireAuth);
router.post('/complete-profile', requireRole('TEACHER'), teacherController.completeTeacherProfile);

// Strict Admin-only access enforcement on all other Teacher Management routes
router.use(requireRole('ADMIN'));

// GET /api/teachers - List teachers with search, department/status filters, pagination
router.get('/', teacherController.getTeachers);

// GET /api/teachers/:id - Get single teacher profile with user and department details
router.get('/:id', teacherController.getTeacherById);

// POST /api/teachers - Register new teacher (creates users + teachers atomically)
router.post('/', teacherController.createTeacher);

// PUT /api/teachers/:id - Update teacher profile and user details
router.put('/:id', teacherController.updateTeacher);

// PATCH /api/teachers/:id/status - Activate / Deactivate teacher account
router.patch('/:id/status', teacherController.updateStatus);

// DELETE /api/teachers/:id - Safely delete teacher profile and user (checks dependencies)
router.delete('/:id', teacherController.deleteTeacher);

module.exports = router;
