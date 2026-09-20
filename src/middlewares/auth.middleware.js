const { verifyToken } = require('../utils/token');
const { findById } = require('../models/user.model');
const { errorResponse } = require('../utils/response');

/**
 * Authentication Middleware: Validates Bearer JWT Token (Header or Query Param)
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return errorResponse(res, 401, 'Authentication token required');
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return errorResponse(res, 401, 'Token expired. Please log in again.');
      }
      return errorResponse(res, 401, 'Invalid authentication token');
    }

    if (!decoded || !decoded.user_id) {
      return errorResponse(res, 401, 'Invalid token payload');
    }

    const user = await findById(decoded.user_id);
    if (!user) {
      return errorResponse(res, 401, 'User account no longer exists');
    }

    if (!user.is_active) {
      return errorResponse(res, 403, 'User account has been deactivated');
    }

    // Attach safe user profile to request
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error.message);
    return errorResponse(res, 500, 'Authentication error');
  }
};

module.exports = {
  requireAuth
};
