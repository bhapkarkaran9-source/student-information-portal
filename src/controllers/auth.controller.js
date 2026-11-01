const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { findByUsernameWithPassword } = require('../models/user.model');
const passwordResetModel = require('../models/passwordReset.model');
const { sendTemplateEmail, isSmtpConfigured } = require('../services/email.service');
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
      must_change_password: Boolean(user.must_change_password),
      is_profile_complete: Boolean(user.is_profile_complete)
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

/**
 * Forgot Password Request Controller
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res) => {
  try {
    const rawIdentifier = req.body.email_or_username || req.body.identifier || req.body.username || req.body.email;

    if (!rawIdentifier || typeof rawIdentifier !== 'string' || !rawIdentifier.trim()) {
      return errorResponse(res, 400, 'Please provide your registered email address or username');
    }

    const identifier = rawIdentifier.trim();

    // Verify SMTP configuration before proceeding
    if (!isSmtpConfigured()) {
      return errorResponse(
        res,
        503,
        'Email service is not configured on the server. Please configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in the environment (.env) to enable password reset emails.',
        { code: 'SMTP_NOT_CONFIGURED' }
      );
    }

    const genericSuccessMsg = 'If an account with that email or username exists, a password reset link has been sent to your registered email address.';

    // Lookup user by email OR username (case-insensitive)
    const [rows] = await pool.query(
      `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.is_active, r.role_name AS role
       FROM users u
       INNER JOIN roles r ON u.role_id = r.role_id
       WHERE LOWER(u.email) = LOWER(?) OR LOWER(u.username) = LOWER(?)
       LIMIT 1`,
      [identifier, identifier]
    );

    const user = rows[0] || null;

    // Prevent account enumeration: do not disclose if user exists or is inactive
    if (!user || !user.is_active || !user.email) {
      await createAuditLog({
        userId: user ? user.user_id : null,
        action: 'PASSWORD_RESET_REQUESTED',
        entity: 'users',
        entityId: user ? user.user_id : null,
        description: user ? `Password reset requested for ineligible account: ${user.username}` : `Password reset requested for non-existent identifier: ${identifier}`,
        details: { identifier },
        req
      });
      return successResponse(res, 200, genericSuccessMsg);
    }

    // Invalidate existing unused tokens for this user
    await passwordResetModel.invalidateUserTokens(user.user_id);

    // Generate cryptographically secure random token (32 bytes = 64 hex characters)
    const plainToken = crypto.randomBytes(32).toString('hex');

    // Store only SHA-256 hash in database
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

    // Token expires in 30 minutes
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await passwordResetModel.createResetToken({
      userId: user.user_id,
      tokenHash,
      expiresAt
    });

    // Build absolute password reset URL
    const frontendBase = (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim()) || `${req.protocol}://${req.get('host')}`;
    const resetLink = `${frontendBase.replace(/\/+$/, '')}/reset-password.html?token=${plainToken}`;

    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username;

    // Send email using standardized template
    const emailResult = await sendTemplateEmail(
      user.email,
      'PASSWORD_RESET',
      {
        name: fullName,
        username: user.username,
        resetLink,
        expiresIn: '30 minutes'
      },
      {
        userId: user.user_id,
        forceSend: true
      }
    );

    if (!emailResult.success && !emailResult.sent) {
      console.error('[ForgotPassword] Email transmission failed:', emailResult.error);
      return errorResponse(
        res,
        500,
        `Failed to send password reset email: ${emailResult.error || 'SMTP connection failed'}`
      );
    }

    // Audit log (token is never stored in audit logs or API responses)
    await createAuditLog({
      userId: user.user_id,
      action: 'PASSWORD_RESET_LINK_SENT',
      entity: 'users',
      entityId: user.user_id,
      description: `Password reset link sent to registered email for user: ${user.username}`,
      details: { username: user.username, role: user.role },
      req
    });

    return successResponse(res, 200, genericSuccessMsg);
  } catch (error) {
    console.error('Forgot password error:', error.message);
    return errorResponse(res, 500, 'An error occurred while processing password reset request');
  }
};

/**
 * Verify Password Reset Token Controller
 * GET /api/auth/verify-reset-token
 */
const verifyResetToken = async (req, res) => {
  try {
    const rawToken = req.query.token;

    if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
      return errorResponse(res, 400, 'Reset token is required');
    }

    const token = rawToken.trim();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const tokenRecord = await passwordResetModel.findTokenByHash(tokenHash);

    if (!tokenRecord) {
      return errorResponse(res, 400, 'Invalid or unrecognized password reset token');
    }

    if (tokenRecord.used_at) {
      return errorResponse(res, 400, 'This password reset link has already been used. Please request a new one.');
    }

    const now = new Date();
    const expiry = new Date(tokenRecord.expires_at);

    if (expiry < now) {
      return errorResponse(res, 400, 'This password reset link has expired. Please request a new one.');
    }

    if (!tokenRecord.is_active) {
      return errorResponse(res, 403, 'Account is deactivated. Please contact an administrator.');
    }

    return successResponse(res, 200, 'Password reset token is valid', {
      username: tokenRecord.username
    });
  } catch (error) {
    console.error('Verify reset token error:', error.message);
    return errorResponse(res, 500, 'An error occurred while verifying reset token');
  }
};

/**
 * Reset Password Controller
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res) => {
  try {
    const { token, new_password, confirm_password } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return errorResponse(res, 400, 'Reset token is required');
    }

    if (!new_password || !confirm_password) {
      return errorResponse(res, 400, 'New password and confirm password are required');
    }

    if (typeof new_password !== 'string' || typeof confirm_password !== 'string') {
      return errorResponse(res, 400, 'Invalid request payload');
    }

    // Minimum 8 characters policy
    if (new_password.length < 8) {
      return errorResponse(res, 400, 'Password must be at least 8 characters long');
    }

    if (new_password !== confirm_password) {
      return errorResponse(res, 400, 'New password and confirm password do not match');
    }

    const cleanToken = token.trim();
    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

    const tokenRecord = await passwordResetModel.findTokenByHash(tokenHash);

    if (!tokenRecord) {
      return errorResponse(res, 400, 'Invalid or unrecognized password reset token');
    }

    if (tokenRecord.used_at) {
      return errorResponse(res, 400, 'This password reset link has already been used. Please request a new one.');
    }

    const now = new Date();
    const expiry = new Date(tokenRecord.expires_at);

    if (expiry < now) {
      return errorResponse(res, 400, 'This password reset link has expired. Please request a new one.');
    }

    if (!tokenRecord.is_active) {
      return errorResponse(res, 403, 'Account is deactivated. Please contact an administrator.');
    }

    // Hash new password securely using bcrypt (10 rounds)
    const newPasswordHash = await bcrypt.hash(new_password, 10);

    // Update user password and clear must_change_password
    await pool.query(
      'UPDATE users SET password_hash = ?, must_change_password = FALSE, updated_at = NOW() WHERE user_id = ?',
      [newPasswordHash, tokenRecord.user_id]
    );

    // Mark current reset token as used immediately
    await passwordResetModel.markTokenUsed(tokenRecord.id);

    // Invalidate any other pending tokens for this user
    await passwordResetModel.invalidateUserTokens(tokenRecord.user_id);

    // Audit log (token is never included in log)
    await createAuditLog({
      userId: tokenRecord.user_id,
      action: 'PASSWORD_RESET_SUCCESSFUL',
      entity: 'users',
      entityId: tokenRecord.user_id,
      description: `User ${tokenRecord.username} reset their password successfully via reset token`,
      details: { username: tokenRecord.username, role: tokenRecord.role },
      req
    });

    // Send confirmation email asynchronously (fire-and-forget, non-fatal if SMTP fails)
    if (tokenRecord.email) {
      const fullName = [tokenRecord.first_name, tokenRecord.last_name].filter(Boolean).join(' ') || tokenRecord.username;
      sendTemplateEmail(
        tokenRecord.email,
        'PASSWORD_CHANGED',
        {
          name: fullName,
          changeDate: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        },
        { userId: tokenRecord.user_id }
      ).catch(err => console.warn('[ResetPassword] Non-fatal notification email error:', err.message));
    }

    return successResponse(res, 200, 'Password has been reset successfully. You can now sign in with your new password.');
  } catch (error) {
    console.error('Reset password error:', error.message);
    return errorResponse(res, 500, 'An error occurred while resetting password');
  }
};

module.exports = {
  login,
  getMe,
  logout,
  changePassword,
  forgotPassword,
  verifyResetToken,
  resetPassword
};
