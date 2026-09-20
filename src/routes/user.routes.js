const express = require('express');
const userController = require('../controllers/user.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

// Self-service profile routes (accessible by ANY authenticated role: ADMIN, TEACHER, STUDENT)
router.get('/me', requireAuth, userController.getMyProfile);
router.put('/me', requireAuth, userController.updateMyProfile);

// Enforce ADMIN role authentication across all administrative user management endpoints
router.use(requireAuth, requireRole('ADMIN'));

// List roles for selection dropdowns (defined before /:id parameter)
router.get('/roles', userController.getRoles);

// User CRUD & Status Endpoints
router.get('/', userController.getUsers);
router.get('/:id', userController.getUserById);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.patch('/:id/status', userController.updateStatus);
router.delete('/:id', userController.deleteUser);

module.exports = router;
