const express = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

// Public route: User login
router.post('/login', authController.login);

// Protected route: Current authenticated user profile
router.get('/me', requireAuth, authController.getMe);

// Protected route: Change password for authenticated user
router.put('/change-password', requireAuth, authController.changePassword);

// Protected route: User logout
router.post('/logout', requireAuth, authController.logout);

module.exports = router;
