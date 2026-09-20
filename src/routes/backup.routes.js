const express = require('express');
const backupController = require('../controllers/backup.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

// Disallow destructive/modification methods on backups (HTTP 405)
router.delete('/', backupController.methodNotAllowed);
router.delete('/:id', backupController.methodNotAllowed);
router.put('/', backupController.methodNotAllowed);
router.put('/:id', backupController.methodNotAllowed);
router.patch('/', backupController.methodNotAllowed);
router.patch('/:id', backupController.methodNotAllowed);

// Protect all backup management endpoints: strictly ADMIN only
router.use(requireAuth, requireRole('ADMIN'));

// Core backup endpoints
router.post('/', backupController.createBackup);
router.get('/', backupController.getBackups);
router.get('/:id', backupController.getBackupById);
router.get('/:id/download', backupController.downloadBackup);
router.post('/:id/validate', backupController.validateBackup);

// Two-step safe restore workflow endpoints
router.post('/:id/restore/prepare', backupController.prepareRestore);
router.post('/:id/restore/confirm', backupController.confirmRestore);

module.exports = router;
