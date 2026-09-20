const express = require('express');
const router = express.Router();
const emailPreferenceController = require('../controllers/emailPreference.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

/**
 * Routes for User Email Preferences
 * Base path: /api/email/preferences
 * 
 * Accessible to STUDENT and TEACHER roles for self-management only.
 */

router.use(requireAuth);
router.use(requireRole('STUDENT', 'TEACHER'));

router.get('/', emailPreferenceController.getEmailPreferences);
router.put('/', emailPreferenceController.updateEmailPreferences);

module.exports = router;
