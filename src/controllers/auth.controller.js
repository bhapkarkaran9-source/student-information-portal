const bcrypt = require('bcryptjs');
const { findByUsernameWithPassword } = require('../models/user.model');
const { generateToken } = require('../utils/token');
const { successResponse, errorResponse } = require('../utils/response');
const { createAuditLog } = require('../services/audit.service');
const pool = require('../config/db');

/**
 * User Login Controller
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate request input
    if (!username || !password) {
      return errorResponse(res, 400, 'Username and password are required');
    }

    if (typeof username !== 'string' || typeof password !== 'string') {
      return errorResponse(res, 400, 'Invalid request payload');
    }

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      return errorResponse(res, 400, 'Username cannot be blank');
    }

    // Lookup user by username
    const user = await findByUsernameWithPassword(cleanUsername);

    // Generic error message to prevent account enumeration
    const genericAuthError = 'Invalid username or password';

    if (!user) {
      await createAuditLog({
        userId: null,
        action: 'LOGIN_FAILED',
        entity: 'users',
        description: `Failed login attempt for non-existent username: ${cleanUsername}`,
        details: { attempted_username: cleanUsername, reason: 'USER_NOT_FOUND' },
        req
      });
      return errorResponse(res, 401, genericAuthError);
    }

    // Check account active status
    if (!user.is_active) {
      await createAuditLog({
        userId: user.user_id,
        action: 'LOGIN_FAILED',
        entity: 'users',
        entityId: user.user_id,
        description: `Failed login attempt for deactivated account: ${user.username}`,
        details: { username: user.username, reason: 'ACCOUNT_DEACTIVATED' },
        req
      });
      return errorResponse(res, 403, 'Account is deactivated. Please contact an administrator.');
    }

    // Verify password hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await createAuditLog({
        userId: user.user_id,
        action: 'LOGIN_FAILED',
        entity: 'users',
        entityId: user.user_id,
        description: `Failed login attempt with invalid password for user: ${user.username}`,
        details: { username: user.username, reason: 'INVALID_CREDENTIALS' },
        req
      });
      return errorResponse(res, 401, genericAuthError);
    }

    // Generate JWT token with safe claims
    const tokenPayload = {
      user_id: user.user_id,
      username: user.username,
      role: user.role
    };
    const token = generateToken(tokenPayload);

    // Safe user profile response (explicitly excludes password_hash)
    const safeUser = {
      user_id: user.user_id,
      role_id: user.role_id,
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      profile_photo_url: user.profile_photo_url || null,
      role: user.role,
      must_change_password: Boolean(user.must_change_password)
    };

    // Log successful authentication event
    await createAuditLog({
      userId: user.user_id,
      action: 'LOGIN_SUCCESS',
      entity: 'users',
      entityId: user.user_id,
      description: `User ${user.username} logged in successfully`,
      details: { username: user.username, role: user.role },
      req
    });

    return successResponse(res, 200, 'Login successful', {
      token,
      user: safeUser
    });
  } catch (error) {
    console.error('Authentication login error:', error.message);
    return errorResponse(res, 500, 'An error occurred during authentication');
  }
};

/**
 * Current Authenticated User Profile Controller
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  try {
    // req.user is set by requireAuth and does not contain password_hash
    return successResponse(res, 200, 'Authenticated user profile', {
      user: req.user
    });
  } catch (error) {
    console.error('Fetch authenticated user error:', error.message);
    return errorResponse(res, 500, 'An error occurred fetching user profile');
  }
};

/**
 * User Logout Controller
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  try {
    if (req.user && req.user.user_id) {
      await createAuditLog({
        userId: req.user.user_id,
        action: 'LOGOUT',
        entity: 'users',
        entityId: req.user.user_id,
        description: `User ${req.user.username} logged out`,
        details: { username: req.user.username, role: req.user.role },
        req
      });
    }
    return successResponse(res, 200, 'Logout successful');
  } catch (error) {
    console.error('Logout error:', error.message);
    return errorResponse(res, 500, 'An error occurred during logout');
  }
};

/**
 * Change Password Controller
 * PUT /api/auth/change-password
 */
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;

    // 1. Validate required fields
    if (!current_password || !new_password || !confirm_password) {
      return errorResponse(res, 400, 'Current password, new password, and confirmation are required');
    }

    if (
      typeof current_password !== 'string' ||
      typeof new_password !== 'string' ||
      typeof confirm_password !== 'string'
    ) {
      return errorResponse(res, 400, 'Invalid request payload');
    }

    // 2. Validate new password length (minimum 6 characters)
    if (new_password.length < 6) {
      return errorResponse(res, 400, 'New password must be at least 6 characters long');
    }

    // 3. Confirm password matches new password
    if (new_password !== confirm_password) {
      return errorResponse(res, 400, 'New password and confirmation password do not match');
    }

    // 4. Check that new password is not identical to current password
    if (new_password === current_password) {
      return errorResponse(res, 400, 'New password must be different from current password');
    }

    // 5. Fetch current user with password_hash
    const [users] = await pool.query(
      'SELECT user_id, username, password_hash, role_id FROM users WHERE user_id = ? LIMIT 1',
      [req.user.user_id]
    );

    if (!users || users.length === 0) {
      return errorResponse(res, 404, 'User account not found');
    }

    const user = users[0];

    // 6. Verify current password
    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      await createAuditLog({
        userId: req.user.user_id,
        action: 'PASSWORD_CHANGE_FAILED',
        entity: 'users',
        entityId: req.user.user_id,
        description: `Failed password change attempt: incorrect current password for user ${user.username}`,
        details: { username: user.username, reason: 'INVALID_CURRENT_PASSWORD' },
        req
      });
      return errorResponse(res, 400, 'Current password is incorrect');
    }

    // 7. Hash new password securely
    const newHash = await bcrypt.hash(new_password, 10);

    // 8. Update password_hash in database and clear must_change_password flag
    await pool.query('UPDATE users SET password_hash = ?, must_change_password = FALSE, updated_at = NOW() WHERE user_id = ?', [
      newHash,
      req.user.user_id
    ]);

    // 9. Audit log the password change (passwords are automatically sanitized by audit service)
    await createAuditLog({
      userId: req.user.user_id,
      action: 'PASSWORD_CHANGED',
      entity: 'users',
      entityId: req.user.user_id,
      description: `User ${user.username} changed their password successfully`,
      details: { username: user.username },
      req
    });

    return successResponse(res, 200, 'Password changed successfully. Please login again.');
  } catch (error) {
    console.error('Change password error:', error.message);
    return errorResponse(res, 500, 'An error occurred while changing password');
  }
};

module.exports = {
  login,
  getMe,
  logout,
  changePassword
};
