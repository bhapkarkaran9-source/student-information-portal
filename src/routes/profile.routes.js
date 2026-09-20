const express = require('express');
const userController = require('../controllers/user.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { uploadAvatarFile } = require('../middlewares/upload.middleware');

const router = express.Router();

// Canonical Profile Endpoints (Strictly: GET /me, POST /photo, DELETE /photo)
// Accessible by all authenticated roles: STUDENT, TEACHER, ADMIN
router.get('/me', requireAuth, userController.getMyProfile);
router.post('/photo', requireAuth, uploadAvatarFile, userController.uploadProfilePhoto);
router.delete('/photo', requireAuth, userController.removeProfilePhoto);

module.exports = router;
