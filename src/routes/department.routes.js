const express = require('express');
const departmentController = require('../controllers/department.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

// Enforce ADMIN role authentication for departments endpoint
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', departmentController.getDepartments);
router.get('/:id', departmentController.getDepartmentById);
router.post('/', departmentController.createDepartment);
router.put('/:id', departmentController.updateDepartment);
router.patch('/:id/status', departmentController.updateStatus);
router.delete('/:id', departmentController.deleteDepartment);

module.exports = router;
