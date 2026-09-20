const { errorResponse } = require('../utils/response');

/**
 * Role-Based Access Control Middleware
 * Supports one or multiple authorized roles.
 * 
 * Usage examples:
 *   requireRole('ADMIN')
 *   requireRole('ADMIN', 'TEACHER')
 *   requireRole('STUDENT')
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 401, 'Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return errorResponse(
        res,
        403,
        `Access forbidden: requires ${allowedRoles.join(' or ')} privileges`
      );
    }

    next();
  };
};

module.exports = {
  requireRole
};
