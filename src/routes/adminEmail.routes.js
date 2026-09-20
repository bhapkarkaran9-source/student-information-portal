const express = require('express');
const router = express.Router();
const adminEmailController = require('../controllers/adminEmail.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

/**
 * All admin email routes require valid authentication and ADMIN role
 */
router.use(requireAuth);
router.use(requireRole('ADMIN'));

// System configuration and statistics
router.get('/config', adminEmailController.getEmailConfig);
router.get('/stats', adminEmailController.getEmailStats);

// GET /api/admin/email/logs
router.get('/logs', adminEmailController.getEmailLogs);
router.get('/logs/:id', adminEmailController.getEmailLogById);

// Fallback direct paths
router.get('/', adminEmailController.getEmailLogs);
router.get('/:id', adminEmailController.getEmailLogById);

module.exports = router;

