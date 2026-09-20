const express = require('express');
const studentController = require('../controllers/student.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

router.use(requireAuth);

// Read endpoints accessible by ADMIN and TEACHER
router.get('/', requireRole('ADMIN', 'TEACHER'), studentController.getStudents);
router.get('/:id', requireRole('ADMIN', 'TEACHER'), studentController.getStudentById);

// Admin-only mutations
router.post('/', requireRole('ADMIN'), studentController.createStudent);
router.put('/:id', requireRole('ADMIN'), studentController.updateStudent);
router.patch('/:id/status', requireRole('ADMIN'), studentController.updateStatus);
router.delete('/:id', requireRole('ADMIN'), studentController.deleteStudent);

module.exports = router;
