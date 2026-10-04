const express = require('express');
const departmentController = require('../controllers/department.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

// Authenticated read access for department dropdowns and profile completion
router.use(requireAuth);
router.get('/', departmentController.getDepartments);
router.get('/:id', departmentController.getDepartmentById);

// Admin-only mutation endpoints
router.use(requireRole('ADMIN'));
router.post('/', departmentController.createDepartment);
router.put('/:id', departmentController.updateDepartment);
router.patch('/:id/status', departmentController.updateStatus);
router.delete('/:id', departmentController.deleteDepartment);

module.exports = router;
