const express = require('express');
const auditController = require('../controllers/audit.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

// Immutability enforcement: Block modification or deletion attempts
router.post('/', auditController.methodNotAllowed);
router.put('/', auditController.methodNotAllowed);
router.put('/:id', auditController.methodNotAllowed);
router.patch('/', auditController.methodNotAllowed);
router.patch('/:id', auditController.methodNotAllowed);
router.delete('/', auditController.methodNotAllowed);
router.delete('/:id', auditController.methodNotAllowed);

// Enforce authentication and ADMIN role on all audit log endpoints
router.use(requireAuth, requireRole('ADMIN'));

// Read-only queries
router.get('/', auditController.getAuditLogs);
router.get('/:id', auditController.getAuditLogById);

module.exports = router;
