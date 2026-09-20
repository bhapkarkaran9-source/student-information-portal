const express = require('express');
const studyMaterialController = require('../controllers/studyMaterial.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const { uploadMaterialFile } = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(requireAuth);

// Analytics / Stats
router.get('/stats', requireRole('ADMIN', 'TEACHER'), studyMaterialController.getStudyMaterialStats);

// Core CRUD Endpoints
router.get('/', requireRole('ADMIN', 'TEACHER', 'STUDENT'), studyMaterialController.getStudyMaterials);
router.get('/:id', requireRole('ADMIN', 'TEACHER', 'STUDENT'), studyMaterialController.getStudyMaterialById);
router.post('/', requireRole('ADMIN', 'TEACHER'), uploadMaterialFile, studyMaterialController.createStudyMaterial);
router.put('/:id', requireRole('ADMIN', 'TEACHER'), uploadMaterialFile, studyMaterialController.updateStudyMaterial);
router.delete('/:id', requireRole('ADMIN', 'TEACHER'), studyMaterialController.deleteStudyMaterial);

// Secure Download & View Endpoints
router.get('/:id/download', requireRole('ADMIN', 'TEACHER', 'STUDENT'), studyMaterialController.downloadStudyMaterial);
router.get('/:id/view', requireRole('ADMIN', 'TEACHER', 'STUDENT'), studyMaterialController.viewStudyMaterial);

module.exports = router;
