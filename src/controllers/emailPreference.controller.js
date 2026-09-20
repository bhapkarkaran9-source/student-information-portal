const emailPreferenceModel = require('../models/emailPreference.model');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * GET /api/email/preferences
 * Returns the authenticated user's email preferences.
 */
async function getEmailPreferences(req, res, next) {
  try {
    const userId = req.user.user_id;
    const preferences = await emailPreferenceModel.getPreferences(userId);
    return successResponse(res, 200, 'Email preferences retrieved successfully', preferences);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/email/preferences
 * Updates the authenticated user's email preferences.
 */
async function updateEmailPreferences(req, res, next) {
  try {
    const userId = req.user.user_id;
    const payload = req.body;

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return errorResponse(res, 400, 'Invalid request body: expected an object');
    }

    // Ignore client-supplied user_id or userId to prevent spoofing
    const sanitizedPayload = { ...payload };
    delete sanitizedPayload.user_id;
    delete sanitizedPayload.userId;

    const updated = await emailPreferenceModel.updatePreferences(userId, sanitizedPayload);
    return successResponse(res, 200, 'Email preferences updated successfully', updated);
  } catch (error) {
    if (error.status === 400) {
      return errorResponse(res, 400, error.message);
    }
    next(error);
  }
}

module.exports = {
  getEmailPreferences,
  updateEmailPreferences
};
