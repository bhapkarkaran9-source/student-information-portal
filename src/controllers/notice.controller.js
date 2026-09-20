const pool = require('../config/db');
const Notice = require('../models/notice.model');
const { createAuditLog } = require('../services/audit.service');

/**
 * Validate positive integer ID
 */
const isValidId = (id) => {
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0 && String(parsed) === String(id).trim();
};

/**
 * Validate safe file path or URL
 * Prevents dangerous protocols, directory traversal, and executable extensions
 */
const isSafeFilePathOrUrl = (pathStr) => {
  if (!pathStr || typeof pathStr !== 'string') return true;
  const trimmed = pathStr.trim();
  if (!trimmed) return true;

  // Disallow dangerous URI schemes
  if (/^(javascript|data|file|vbscript):/i.test(trimmed)) {
    return false;
  }

  // Disallow directory traversal
  if (trimmed.includes('..') || trimmed.includes('\\')) {
    return false;
  }

  // Disallow dangerous file extensions
  const cleanPath = trimmed.split(/[?#]/)[0];
  const dangerousExts = /\.(exe|bat|cmd|sh|vbs|msi|ps1|com|scr|pif|reg)$/i;
  if (dangerousExts.test(cleanPath)) {
    return false;
  }

  return true;
};

/**
 * Helper to validate datetime
 */
const isValidDateTime = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
};

/**
 * Helper to convert to MySQL DATETIME format (YYYY-MM-DD HH:mm:ss)
 */
const toMySQLDateTime = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

/**
 * GET /api/notices
 * Fetch paginated list of notices with search and filters
 */
const getNotices = async (req, res) => {
  try {
    const {
      page,
      limit,
      search,
      target_role,
      status,
      from_date,
      to_date
    } = req.query;

    const result = await Notice.getNotices({
      page,
      limit,
      search,
      target_role,
      status,
      from_date,
      to_date
    });

    return res.status(200).json({
      success: true,
      message: 'Notices fetched successfully',
      data: result
    });
  } catch (err) {
    console.error('Error fetching notices:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching notices'
    });
  }
};

/**
 * GET /api/notices/stats
 * Dashboard KPI statistics for notice board
 */
const getNoticeStats = async (req, res) => {
  try {
    const stats = await Notice.getNoticeStats();
    return res.status(200).json({
      success: true,
      message: 'Notice statistics fetched successfully',
      data: { stats }
    });
  } catch (err) {
    console.error('Error fetching notice statistics:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching notice statistics'
    });
  }
};

/**
 * GET /api/notices/:id
 * Fetch single notice by ID
 */
const getNoticeById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notice ID provided'
      });
    }

    const notice = await Notice.getNoticeById(id);
    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notice retrieved successfully',
      data: { notice }
    });
  } catch (err) {
    console.error('Error retrieving notice:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving notice details'
    });
  }
};

/**
 * POST /api/notices
 * Create a new notice
 */
const createNotice = async (req, res) => {
  try {
    const {
      target_role,
      title,
      content,
      attachment_path,
      published_at,
      expires_at,
      is_active
    } = req.body;

    // Validate title
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Notice title is required'
      });
    }

    if (title.trim().length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Notice title cannot exceed 200 characters'
      });
    }

    // Validate content
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Notice content is required'
      });
    }

    // Validate target_role
    let finalTargetRole = 'ALL';
    if (target_role) {
      const roleUpper = String(target_role).trim().toUpperCase();
      if (!Notice.ALLOWED_TARGET_ROLES.includes(roleUpper)) {
        return res.status(400).json({
          success: false,
          message: `Invalid target_role. Allowed roles: ${Notice.ALLOWED_TARGET_ROLES.join(', ')}`
        });
      }
      finalTargetRole = roleUpper;
    }

    // Validate dates
    let mysqlPublishedAt = null;
    if (published_at) {
      if (!isValidDateTime(published_at)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid published_at datetime format'
        });
      }
      mysqlPublishedAt = toMySQLDateTime(published_at);
    }

    let mysqlExpiresAt = null;
    if (expires_at) {
      if (!isValidDateTime(expires_at)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid expires_at datetime format'
        });
      }
      mysqlExpiresAt = toMySQLDateTime(expires_at);

      // Check that expires_at is not before published_at
      const effectivePub = mysqlPublishedAt ? new Date(mysqlPublishedAt) : new Date();
      const expDate = new Date(mysqlExpiresAt);
      if (expDate < effectivePub) {
        return res.status(400).json({
          success: false,
          message: 'Notice expiry date cannot be earlier than the publish date'
        });
      }
    }

    // Validate attachment path
    if (attachment_path && !isSafeFilePathOrUrl(attachment_path)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or unsafe attachment_path provided. Disallowed protocols or file types detected.'
      });
    }

    const createdBy = req.user?.user_id || req.user?.userId;
    if (!createdBy) {
      return res.status(401).json({
        success: false,
        message: 'Authenticated user ID is required to create a notice'
      });
    }

    const newNotice = await Notice.createNotice({
      created_by: createdBy,
      target_role: finalTargetRole,
      title: title.trim(),
      content: content.trim(),
      attachment_path: attachment_path ? String(attachment_path).trim() : null,
      published_at: mysqlPublishedAt,
      expires_at: mysqlExpiresAt,
      is_active: is_active !== undefined ? Boolean(is_active) : true
    });

    await createAuditLog({
      userId: req.user.user_id,
      action: 'NOTICE_CREATED',
      entity: 'NOTICE',
      entityId: newNotice.notice_id,
      description: `Created notice "${newNotice.title}" for ${finalTargetRole}`,
      details: { notice_id: newNotice.notice_id, title: newNotice.title, target_role: finalTargetRole },
      req
    });

    // Asynchronously dispatch in-app notification & failure-isolated email broadcast
    if (newNotice.is_active) {
      setImmediate(async () => {
        try {
          await Notice.dispatchNoticeNotification(newNotice, {
            category: req.body.category || req.body.notice_category
          });
        } catch (notifErr) {
          console.warn('[NoticeController] Error broadcasting notice notification:', notifErr.message);
        }
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Notice created successfully',
      data: { notice: newNotice }
    });
  } catch (err) {
    console.error('Error creating notice:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating notice'
    });
  }
};

/**
 * PUT /api/notices/:id
 * Update an existing notice
 */
const updateNotice = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notice ID provided'
      });
    }

    const existing = await Notice.getNoticeById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    const {
      target_role,
      title,
      content,
      attachment_path,
      published_at,
      expires_at,
      is_active
    } = req.body;

    const updatePayload = {};

    if (title !== undefined) {
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Notice title cannot be empty'
        });
      }
      if (title.trim().length > 200) {
        return res.status(400).json({
          success: false,
          message: 'Notice title cannot exceed 200 characters'
        });
      }
      updatePayload.title = title.trim();
    }

    if (content !== undefined) {
      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Notice content cannot be empty'
        });
      }
      updatePayload.content = content.trim();
    }

    if (target_role !== undefined) {
      const roleUpper = String(target_role).trim().toUpperCase();
      if (!Notice.ALLOWED_TARGET_ROLES.includes(roleUpper)) {
        return res.status(400).json({
          success: false,
          message: `Invalid target_role. Allowed roles: ${Notice.ALLOWED_TARGET_ROLES.join(', ')}`
        });
      }
      updatePayload.target_role = roleUpper;
    }

    if (published_at !== undefined) {
      if (published_at && !isValidDateTime(published_at)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid published_at datetime format'
        });
      }
      updatePayload.published_at = published_at ? toMySQLDateTime(published_at) : null;
    }

    if (expires_at !== undefined) {
      if (expires_at && !isValidDateTime(expires_at)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid expires_at datetime format'
        });
      }
      updatePayload.expires_at = expires_at ? toMySQLDateTime(expires_at) : null;
    }

    // Verify expiry date is not before publish date
    const checkPub = updatePayload.published_at !== undefined ? updatePayload.published_at : existing.published_at;
    const checkExp = updatePayload.expires_at !== undefined ? updatePayload.expires_at : existing.expires_at;
    if (checkPub && checkExp) {
      if (new Date(checkExp) < new Date(checkPub)) {
        return res.status(400).json({
          success: false,
          message: 'Notice expiry date cannot be earlier than the publish date'
        });
      }
    }

    if (attachment_path !== undefined) {
      if (attachment_path && !isSafeFilePathOrUrl(attachment_path)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or unsafe attachment_path provided'
        });
      }
      updatePayload.attachment_path = attachment_path && String(attachment_path).trim() ? String(attachment_path).trim() : null;
    }

    if (is_active !== undefined) {
      updatePayload.is_active = Boolean(is_active);
    }

    const updated = await Notice.updateNotice(id, updatePayload);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'NOTICE_UPDATED',
      entity: 'NOTICE',
      entityId: id,
      description: `Updated notice "${updated.title}" (#${id})`,
      details: { notice_id: id, title: updated.title, target_role: updated.target_role },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Notice updated successfully',
      data: { notice: updated }
    });
  } catch (err) {
    console.error('Error updating notice:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating notice'
    });
  }
};

/**
 * DELETE /api/notices/:id
 * Delete a notice
 */
const deleteNotice = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notice ID provided'
      });
    }

    const existing = await Notice.getNoticeById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    const deleted = await Notice.deleteNotice(id);
    if (!deleted) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete notice'
      });
    }

    await createAuditLog({
      userId: req.user.user_id,
      action: 'NOTICE_DELETED',
      entity: 'NOTICE',
      entityId: id,
      description: `Deleted notice "${existing.title}" (#${id})`,
      details: { notice_id: id, title: existing.title },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Notice deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting notice:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting notice'
    });
  }
};

module.exports = {
  getNotices,
  getNoticeStats,
  getNoticeById,
  createNotice,
  updateNotice,
  deleteNotice
};
