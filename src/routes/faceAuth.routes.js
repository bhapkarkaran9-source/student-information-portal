const express = require('express');
const router = express.Router();
const faceAuthController = require('../controllers/faceAuth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { faceLoginRateLimiter } = require('../middlewares/rateLimit.middleware');

// Public Anonymous Biometric Login Route (Rate-limited, no user_id parameter)
router.post('/login', faceLoginRateLimiter, faceAuthController.loginWithFace);

// Authenticated Biometric Management Routes (Strictly require valid JWT session)
router.get('/status', requireAuth, faceAuthController.getStatus);
router.post('/register', requireAuth, faceAuthController.registerFace);
router.post('/verify-test', requireAuth, faceAuthController.verifyTestFace);
router.delete('/remove', requireAuth, faceAuthController.removeFace);

module.exports = router;
