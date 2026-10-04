const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const userModel = require('../models/user.model');
const { successResponse, errorResponse } = require('../utils/response');
const { createAuditLog } = require('../services/audit.service');
const { AVATARS_DIR } = require('../middlewares/upload.middleware');
const pool = require('../config/db');

// Standard email validation pattern
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Get paginated, searchable list of users
 * GET /api/users
 */
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = '', status = '' } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    const { users, total } = await userModel.getUsers({
      page: parsedPage,
      limit: parsedLimit,
      search: typeof search === 'string' ? search : '',
      role: typeof role === 'string' ? role : '',
      status
    });

    const totalPages = Math.ceil(total / parsedLimit) || 1;

    return successResponse(res, 200, 'Users retrieved successfully', {
      users,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching users');
  }
};

/**
 * Get single safe user profile
 * GET /api/users/:id
 */
const getUserById = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return errorResponse(res, 400, 'Invalid user ID provided');
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    return successResponse(res, 200, 'User profile retrieved successfully', { user });
  } catch (error) {
    console.error('Error fetching user profile:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching user profile');
  }
};

/**
 * Create a new user
 * POST /api/users
 */
const createUser = async (req, res) => {
  try {
    const { username, email, password, role_id, first_name, last_name, phone, is_active } = req.body;

    // 1. Required field validation
    if (!username || !email || !password || role_id === undefined || !first_name || !last_name) {
      return errorResponse(res, 400, 'First name, last name, username, email, password, and role are required');
    }

    const cleanUsername = String(username).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanFirstName = String(first_name).trim();
    const cleanLastName = String(last_name).trim();
    const cleanPhone = phone ? String(phone).trim() : null;

    if (!cleanUsername || !cleanEmail || !cleanFirstName || !cleanLastName) {
      return errorResponse(res, 400, 'Fields cannot be blank');
    }

    // 2. Email format validation
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return errorResponse(res, 400, 'Please provide a valid email address');
    }

    // 3. Password length validation
    if (typeof password !== 'string' || password.length < 6) {
      return errorResponse(res, 400, 'Password must be at least 6 characters long');
    }

    // 4. Role validation
    const parsedRoleId = parseInt(role_id, 10);
    if (isNaN(parsedRoleId)) {
      return errorResponse(res, 400, 'Invalid role ID');
    }
    const roleRecord = await userModel.findRoleById(parsedRoleId);
    if (!roleRecord) {
      return errorResponse(res, 400, 'Selected role does not exist');
    }

    // 5. Check username uniqueness
    const existingUsername = await userModel.findByUsername(cleanUsername);
    if (existingUsername) {
      return errorResponse(res, 409, 'Username is already taken');
    }

    // 6. Check email uniqueness
    const existingEmail = await userModel.findByEmail(cleanEmail);
    if (existingEmail) {
      return errorResponse(res, 409, 'Email address is already in use');
    }

    // 7. Hash password securely
    const password_hash = await bcrypt.hash(password, 10);

    // 8. Create user record
    const newUserId = await userModel.createUser({
      role_id: parsedRoleId,
      username: cleanUsername,
      email: cleanEmail,
      password_hash,
      first_name: cleanFirstName,
      last_name: cleanLastName,
      phone: cleanPhone,
      is_active: is_active !== undefined ? Boolean(is_active) : true
    });

    // 9. Fetch safe user profile to return
    const createdUser = await userModel.findById(newUserId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'USER_CREATED',
      entity: 'USER',
      entityId: newUserId,
      description: `Created user ${cleanUsername} (${cleanFirstName} ${cleanLastName}) with role ID ${parsedRoleId}`,
      details: { username: cleanUsername, email: cleanEmail, role_id: parsedRoleId },
      req
    });

    return successResponse(res, 201, 'User created successfully', { user: createdUser });
  } catch (error) {
    console.error('Error creating user:', error.message);
    return errorResponse(res, 500, 'An error occurred while creating the user');
  }
};

/**
 * Update safe user fields
 * PUT /api/users/:id
 */
const updateUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return errorResponse(res, 400, 'Invalid user ID');
    }

    const existingUser = await userModel.findById(userId);
    if (!existingUser) {
      return errorResponse(res, 404, 'User not found');
    }

    const { username, email, first_name, last_name, phone, role_id, is_active, password } = req.body;
    const updateFields = {};

    // First Name
    if (first_name !== undefined) {
      const cleanFirst = String(first_name).trim();
      if (!cleanFirst) return errorResponse(res, 400, 'First name cannot be empty');
      updateFields.first_name = cleanFirst;
    }

    // Last Name
    if (last_name !== undefined) {
      const cleanLast = String(last_name).trim();
      if (!cleanLast) return errorResponse(res, 400, 'Last name cannot be empty');
      updateFields.last_name = cleanLast;
    }

    // Username
    if (username !== undefined) {
      const cleanUsername = String(username).trim();
      if (!cleanUsername) return errorResponse(res, 400, 'Username cannot be empty');
      if (cleanUsername !== existingUser.username) {
        const usernameConflict = await userModel.findByUsername(cleanUsername);
        if (usernameConflict && usernameConflict.user_id !== userId) {
          return errorResponse(res, 409, 'Username is already in use by another account');
        }
      }
      updateFields.username = cleanUsername;
    }

    // Email
    if (email !== undefined) {
      const cleanEmail = String(email).trim().toLowerCase();
      if (!cleanEmail) return errorResponse(res, 400, 'Email cannot be empty');
      if (!EMAIL_REGEX.test(cleanEmail)) {
        return errorResponse(res, 400, 'Please provide a valid email address');
      }
      if (cleanEmail !== existingUser.email) {
        const emailConflict = await userModel.findByEmail(cleanEmail);
        if (emailConflict && emailConflict.user_id !== userId) {
          return errorResponse(res, 409, 'Email is already in use by another account');
        }
      }
      updateFields.email = cleanEmail;
    }

    // Phone
    if (phone !== undefined) {
      updateFields.phone = phone ? String(phone).trim() : null;
    }

    // Role
    if (role_id !== undefined) {
      const parsedRoleId = parseInt(role_id, 10);
      if (isNaN(parsedRoleId)) return errorResponse(res, 400, 'Invalid role ID');
      const roleRecord = await userModel.findRoleById(parsedRoleId);
      if (!roleRecord) return errorResponse(res, 400, 'Selected role does not exist');
      updateFields.role_id = parsedRoleId;
    }

    // Active status
    if (is_active !== undefined) {
      const activeBool = Boolean(is_active);
      // Prevent current admin from deactivating self
      if (req.user.user_id === userId && !activeBool) {
        return errorResponse(res, 400, 'Cannot deactivate your own administrator account');
      }
      updateFields.is_active = activeBool;
    }

    // Optional Password change
    if (password !== undefined && password !== null && String(password).trim() !== '') {
      if (typeof password !== 'string' || password.length < 6) {
        return errorResponse(res, 400, 'New password must be at least 6 characters long');
      }
      updateFields.password_hash = await bcrypt.hash(password, 10);
    }

    await userModel.updateUser(userId, updateFields);

    const updatedUser = await userModel.findById(userId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'USER_UPDATED',
      entity: 'USER',
      entityId: userId,
      description: `Updated user ${existingUser.username} (ID: ${userId})`,
      details: { updated_fields: Object.keys(updateFields) },
      req
    });

    return successResponse(res, 200, 'User updated successfully', { user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating the user');
  }
};

/**
 * Activate or Deactivate user
 * PATCH /api/users/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return errorResponse(res, 400, 'Invalid user ID');
    }

    const existingUser = await userModel.findById(userId);
    if (!existingUser) {
      return errorResponse(res, 404, 'User not found');
    }

    const { is_active } = req.body;
    if (is_active === undefined || is_active === null) {
      return errorResponse(res, 400, 'is_active field is required');
    }

    const activeBool = Boolean(is_active);

    // Prevent current admin from deactivating self
    if (req.user.user_id === userId && !activeBool) {
      return errorResponse(res, 400, 'Cannot deactivate your own administrator account');
    }

    await userModel.updateUserStatus(userId, activeBool);

    await createAuditLog({
      userId: req.user.user_id,
      action: activeBool ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entity: 'USER',
      entityId: userId,
      description: `${activeBool ? 'Activated' : 'Deactivated'} user ${existingUser.username} (ID: ${userId})`,
      details: { username: existingUser.username, is_active: activeBool },
      req
    });

    return successResponse(
      res,
      200,
      `User account ${activeBool ? 'activated' : 'deactivated'} successfully`,
      { user_id: userId, is_active: activeBool }
    );
  } catch (error) {
    console.error('Error updating user status:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating status');
  }
};

/**
 * Safe user deletion with dependency checking
 * DELETE /api/users/:id
 */
const deleteUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId) || userId <= 0) {
      return errorResponse(res, 400, 'Invalid user ID');
    }

    // Prevent self-deletion of active administrator
    if (req.user.user_id === userId) {
      return errorResponse(res, 400, 'Cannot delete your own administrator account');
    }

    const existingUser = await userModel.findById(userId);
    if (!existingUser) {
      return errorResponse(res, 404, 'User not found');
    }

    // Verify foreign key dependencies
    const { hasDependencies } = await userModel.checkUserDependencies(userId);
    if (hasDependencies) {
      return errorResponse(
        res,
        409,
        'Cannot delete user with associated academic records. Please deactivate the account instead.'
      );
    }

    await userModel.deleteUser(userId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'USER_DELETED',
      entity: 'USER',
      entityId: userId,
      description: `Deleted user ${existingUser.username} (ID: ${userId})`,
      details: { username: existingUser.username },
      req
    });

    return successResponse(res, 200, 'User deleted successfully', { user_id: userId });
  } catch (error) {
    console.error('Error deleting user:', error.message);
    return errorResponse(res, 500, 'An error occurred while deleting user');
  }
};

/**
 * Get all available roles for dropdowns
 * GET /api/users/roles
 */
const getRoles = async (req, res) => {
  try {
    const roles = await userModel.getAllRoles();
    return successResponse(res, 200, 'Roles retrieved successfully', { roles });
  } catch (error) {
    console.error('Error fetching roles:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching roles');
  }
};

/**
 * Helper to fetch complete sanitized user profile across roles and departments
 */
const fetchFullUserProfile = async (userId) => {
  const sql = `
    SELECT 
      u.user_id,
      u.role_id,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      u.phone,
      u.profile_photo_url,
      u.is_active,
      u.must_change_password,
      u.is_profile_complete,
      u.created_at,
      u.updated_at,
      r.role_name AS role,
      s.student_id,
      s.prn_number,
      s.class_name,
      s.division,
      s.semester,
      COALESCE(s.department_id, t.department_id) AS department_id,
      COALESCE(sd.department_name, td.department_name, CASE WHEN r.role_name = 'ADMIN' THEN 'System Administration' ELSE 'Not Assigned' END) AS department_name,
      COALESCE(sd.department_code, td.department_code, CASE WHEN r.role_name = 'ADMIN' THEN 'ADMIN' ELSE NULL END) AS department_code,
      t.teacher_id,
      t.employee_number,
      t.designation
    FROM users u
    INNER JOIN roles r ON u.role_id = r.role_id
    LEFT JOIN students s ON s.user_id = u.user_id
    LEFT JOIN departments sd ON s.department_id = sd.department_id
    LEFT JOIN teachers t ON t.user_id = u.user_id
    LEFT JOIN departments td ON t.department_id = td.department_id
    WHERE u.user_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [userId]);
  if (!rows[0]) return null;
  return {
    ...rows[0],
    must_change_password: Boolean(rows[0].must_change_password),
    is_profile_complete: Boolean(rows[0].is_profile_complete)
  };
};

/**
 * Get currently authenticated user profile
 * GET /api/users/me
 */
const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const user = await fetchFullUserProfile(userId);
    if (!user) {
      return errorResponse(res, 404, 'User account not found');
    }
    return successResponse(res, 200, 'Authenticated user profile retrieved successfully', { user });
  } catch (error) {
    console.error('Error fetching my profile:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching user profile');
  }
};

/**
 * Update currently authenticated user profile
 * PUT /api/users/me
 */
const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { first_name, last_name, email, phone } = req.body;

    if (!first_name || !last_name || !email) {
      return errorResponse(res, 400, 'First name, last name, and email are required');
    }

    const cleanFirstName = String(first_name).trim();
    const cleanLastName = String(last_name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = phone ? String(phone).trim() : null;

    if (!cleanFirstName || !cleanLastName || !cleanEmail) {
      return errorResponse(res, 400, 'First name, last name, and email cannot be blank');
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return errorResponse(res, 400, 'Please provide a valid email address');
    }

    // Check email uniqueness among other users
    const [existing] = await pool.query(
      'SELECT user_id FROM users WHERE email = ? AND user_id != ? LIMIT 1',
      [cleanEmail, userId]
    );
    if (existing && existing.length > 0) {
      return errorResponse(res, 409, 'Email address is already in use by another account');
    }

    // Update user record (username, role_id, is_active cannot be self-modified)
    await pool.query(
      'UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, updated_at = NOW() WHERE user_id = ?',
      [cleanFirstName, cleanLastName, cleanEmail, cleanPhone, userId]
    );

    // Audit log
    await createAuditLog({
      userId,
      action: 'PROFILE_UPDATED',
      entity: 'users',
      entityId: userId,
      description: `User ${req.user.username} updated their profile information`,
      details: {
        first_name: cleanFirstName,
        last_name: cleanLastName,
        email: cleanEmail,
        phone: cleanPhone
      },
      req
    });

    const updatedUser = await fetchFullUserProfile(userId);

    return successResponse(res, 200, 'Profile updated successfully', { user: updatedUser });
  } catch (error) {
    console.error('Error updating my profile:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating profile');
  }
};

/**
 * Safely delete an existing avatar file from disk if it is located inside AVATARS_DIR
 * @param {string|null} photoUrl
 */
const safelyDeleteAvatarFile = (photoUrl) => {
  if (!photoUrl || typeof photoUrl !== 'string') return;
  try {
    // Only handle local avatar paths
    if (photoUrl.startsWith('/uploads/avatars/')) {
      const filename = path.basename(photoUrl);
      const filePath = path.resolve(AVATARS_DIR, filename);
      // Ensure path traversal protection: filePath must reside strictly inside AVATARS_DIR
      if (filePath.startsWith(AVATARS_DIR) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (err) {
    console.warn('Could not unlink old avatar file:', err.message);
  }
};

/**
 * Upload and update profile photo for authenticated user
 * POST /api/profile/photo
 */
const uploadProfilePhoto = async (req, res) => {
  try {
    // Identity MUST come strictly from authenticated JWT (IDOR protection)
    const userId = req.user && req.user.user_id;
    if (!userId) {
      return errorResponse(res, 401, 'Unauthorized');
    }

    if (!req.file) {
      return errorResponse(res, 400, 'No image file uploaded. Allowed formats: JPG, JPEG, PNG, WEBP (Max 5MB).');
    }

    // 1. Fetch current profile to check for prior local avatar
    const currentUser = await userModel.findById(userId);
    if (!currentUser) {
      // Clean up uploaded file if user record not found
      if (req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return errorResponse(res, 404, 'User account not found');
    }

    // 2. Safely delete old local avatar file
    if (currentUser.profile_photo_url) {
      safelyDeleteAvatarFile(currentUser.profile_photo_url);
    }

    // 3. Construct clean relative URL
    const relativeUrl = `/uploads/avatars/${req.file.filename}`;

    // 4. Update database
    await userModel.updateProfilePhoto(userId, relativeUrl);

    // 5. Create audit log
    await createAuditLog({
      userId,
      action: 'USER_PROFILE_PHOTO_UPDATED',
      entity: 'USER',
      entityId: userId,
      description: `User ${req.user.username || userId} updated profile photo`,
      details: { profile_photo_url: relativeUrl },
      req
    });

    return successResponse(res, 200, 'Profile photo updated successfully', {
      profile_photo_url: relativeUrl
    });
  } catch (error) {
    console.error('Error uploading profile photo:', error.message);
    return errorResponse(res, 500, 'An error occurred while uploading profile photo');
  }
};

/**
 * Remove profile photo for authenticated user and revert to initials
 * DELETE /api/profile/photo
 */
const removeProfilePhoto = async (req, res) => {
  try {
    const userId = req.user && req.user.user_id;
    if (!userId) {
      return errorResponse(res, 401, 'Unauthorized');
    }

    const currentUser = await userModel.findById(userId);
    if (!currentUser) {
      return errorResponse(res, 404, 'User account not found');
    }

    // Safely delete local avatar file if exists
    if (currentUser.profile_photo_url) {
      safelyDeleteAvatarFile(currentUser.profile_photo_url);
    }

    // Reset database column to NULL
    await userModel.updateProfilePhoto(userId, null);

    // Create audit log
    await createAuditLog({
      userId,
      action: 'USER_PROFILE_PHOTO_REMOVED',
      entity: 'USER',
      entityId: userId,
      description: `User ${req.user.username || userId} removed profile photo`,
      details: {},
      req
    });

    return successResponse(res, 200, 'Profile photo removed successfully', {
      profile_photo_url: null
    });
  } catch (error) {
    console.error('Error removing profile photo:', error.message);
    return errorResponse(res, 500, 'An error occurred while removing profile photo');
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateStatus,
  deleteUser,
  getRoles,
  getMyProfile,
  updateMyProfile,
  uploadProfilePhoto,
  removeProfilePhoto
};
