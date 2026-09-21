const pool = require('../config/db');
const Notification = require('../models/notification.model');
const { createAuditLog } = require('../services/audit.service');

/**
 * Validate positive integer ID
 */
const isValidId = (id) => {
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0 && String(parsed) === String(id).trim();
};

/**
 * GET /api/notifications
 * Fetch paginated list of notifications with search and filters
 */
const getNotifications = async (req, res) => {
  try {
    const {
      page,
      limit,
      search,
      recipient_user_id,
      role,
      notification_type,
      is_read
    } = req.query;

    // Non-admin users are strictly restricted to their own notifications
    const effectiveRecipientId = (req.user && req.user.role !== 'ADMIN')
      ? req.user.user_id
      : recipient_user_id;

    const result = await Notification.getNotifications({
      page,
      limit,
      search,
      recipient_user_id: effectiveRecipientId,
      role: (req.user && req.user.role !== 'ADMIN') ? undefined : role,
      notification_type,
      is_read
    });

    return res.status(200).json({
      success: true,
      message: 'Notifications fetched successfully',
      data: result
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching notifications'
    });
  }
};

/**
 * GET /api/notifications/stats
 * Dashboard KPI statistics for notifications
 */
const getNotificationStats = async (req, res) => {
  try {
    const stats = await Notification.getNotificationStats();
    return res.status(200).json({
      success: true,
      message: 'Notification statistics fetched successfully',
      data: { stats }
    });
  } catch (err) {
    console.error('Error fetching notification statistics:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching notification statistics'
    });
  }
};

/**
 * GET /api/notifications/:id
 * Fetch single notification by ID
 */
const getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID provided'
      });
    }

    const notification = await Notification.getNotificationById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification retrieved successfully',
      data: { notification }
    });
  } catch (err) {
    console.error('Error retrieving notification:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving notification details'
    });
  }
};

/**
 * POST /api/notifications
 * Create a new notification for a single recipient user
 */
const createNotification = async (req, res) => {
  try {
    const {
      recipient_user_id,
      title,
      message,
      notification_type,
      is_read
    } = req.body;

    // Validate recipient user
    if (!recipient_user_id || !isValidId(recipient_user_id)) {
      return res.status(400).json({
        success: false,
        message: 'A valid recipient_user_id is required'
      });
    }

    const userCheck = await Notification.checkUserExistsAndActive(recipient_user_id);
    if (!userCheck.exists) {
      return res.status(400).json({
        success: false,
        message: `Recipient user ID ${recipient_user_id} does not exist`
      });
    }

    if (!userCheck.isActive) {
      return res.status(400).json({
        success: false,
        message: `Cannot send notification: User ${userCheck.username} (${userCheck.fullName}) is inactive`
      });
    }

    // Validate title
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Notification title is required'
      });
    }

    if (title.trim().length > 150) {
      return res.status(400).json({
        success: false,
        message: 'Notification title cannot exceed 150 characters'
      });
    }

    // Validate message
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Notification message is required'
      });
    }

    // Notification type
    const finalType = notification_type && String(notification_type).trim()
      ? String(notification_type).trim().slice(0, 50)
      : 'General';

    const newNotification = await Notification.createNotification({
      recipient_user_id: parseInt(recipient_user_id, 10),
      title: title.trim(),
      message: message.trim(),
      notification_type: finalType,
      is_read: is_read ? 1 : 0
    });

    await createAuditLog({
      userId: req.user.user_id,
      action: 'NOTIFICATION_SENT',
      entity: 'NOTIFICATION',
      entityId: newNotification.notification_id,
      description: `Sent notification "${newNotification.title}" to User #${recipient_user_id}`,
      details: { notification_id: newNotification.notification_id, recipient_user_id, title: newNotification.title },
      req
    });

    return res.status(201).json({
      success: true,
      message: 'Notification created successfully',
      data: { notification: newNotification }
    });
  } catch (err) {
    console.error('Error creating notification:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating notification'
    });
  }
};

/**
 * POST /api/notifications/broadcast
 * Send a notification to all active users matching a role (or ALL)
 */
const broadcastNotification = async (req, res) => {
  try {
    const {
      target_role,
      title,
      message,
      notification_type
    } = req.body;

    const validRoles = ['ALL', 'STUDENT', 'TEACHER', 'ADMIN'];
    const roleUpper = target_role ? String(target_role).trim().toUpperCase() : 'ALL';
    if (!validRoles.includes(roleUpper)) {
      return res.status(400).json({
        success: false,
        message: `Invalid target_role for broadcast. Allowed: ${validRoles.join(', ')}`
      });
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Notification title is required'
      });
    }

    if (title.trim().length > 150) {
      return res.status(400).json({
        success: false,
        message: 'Notification title cannot exceed 150 characters'
      });
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Notification message is required'
      });
    }

    const finalType = notification_type && String(notification_type).trim()
      ? String(notification_type).trim().slice(0, 50)
      : 'General';

    const result = await Notification.broadcastNotification({
      target_role: roleUpper,
      title: title.trim(),
      message: message.trim(),
      notification_type: finalType
    });

    await createAuditLog({
      userId: req.user.user_id,
      action: 'NOTIFICATION_SENT',
      entity: 'NOTIFICATION',
      description: `Broadcast notification "${title.trim()}" to role ${roleUpper} (${result.insertedCount} users)`,
      details: { target_role: roleUpper, inserted_count: result.insertedCount, title: title.trim() },
      req
    });

    return res.status(201).json({
      success: true,
      message: `Broadcast sent successfully to ${result.insertedCount} user(s)`,
      data: result
    });
  } catch (err) {
    console.error('Error broadcasting notification:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while broadcasting notification'
    });
  }
};

/**
 * PUT /api/notifications/:id
 * Update an existing notification
 */
const updateNotification = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID provided'
      });
    }

    const existing = await Notification.getNotificationById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    const {
      recipient_user_id,
      title,
      message,
      notification_type,
      is_read
    } = req.body;

    const updatePayload = {};

    if (recipient_user_id !== undefined) {
      if (!isValidId(recipient_user_id)) {
        return res.status(400).json({
          success: false,
          message: 'A valid recipient_user_id is required'
        });
      }
      const userCheck = await Notification.checkUserExistsAndActive(recipient_user_id);
      if (!userCheck.exists) {
        return res.status(400).json({
          success: false,
          message: `Recipient user ID ${recipient_user_id} does not exist`
        });
      }
      updatePayload.recipient_user_id = parseInt(recipient_user_id, 10);
    }

    if (title !== undefined) {
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Notification title cannot be empty'
        });
      }
      if (title.trim().length > 150) {
        return res.status(400).json({
          success: false,
          message: 'Notification title cannot exceed 150 characters'
        });
      }
      updatePayload.title = title.trim();
    }

    if (message !== undefined) {
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Notification message cannot be empty'
        });
      }
      updatePayload.message = message.trim();
    }

    if (notification_type !== undefined) {
      updatePayload.notification_type = notification_type && String(notification_type).trim()
        ? String(notification_type).trim().slice(0, 50)
        : 'General';
    }

    if (is_read !== undefined) {
      updatePayload.is_read = is_read ? 1 : 0;
    }

    const updated = await Notification.updateNotification(id, updatePayload);

    return res.status(200).json({
      success: true,
      message: 'Notification updated successfully',
      data: { notification: updated }
    });
  } catch (err) {
    console.error('Error updating notification:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating notification'
    });
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read or unread
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID provided'
      });
    }

    const existing = await Notification.getNotificationById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // IDOR Protection: Non-admin users can only modify their own notifications
    if (req.user && req.user.role !== 'ADMIN' && existing.recipient_user_id !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You cannot modify notifications belonging to another user'
      });
    }

    const { is_read } = req.body;
    const readVal = is_read !== undefined ? Boolean(is_read) : true;

    const updated = await Notification.markAsRead(id, readVal);

    return res.status(200).json({
      success: true,
      message: `Notification marked as ${readVal ? 'read' : 'unread'}`,
      data: { notification: updated }
    });
  } catch (err) {
    console.error('Error updating notification read state:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating notification read state'
    });
  }
};

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications for currently authenticated user
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const count = await Notification.getUnreadCount(userId);
    return res.status(200).json({
      success: true,
      data: { count, unread_count: count }
    });
  } catch (err) {
    console.error('Error fetching unread notification count:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching unread notification count'
    });
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all unread notifications for currently authenticated user as read
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const count = await Notification.markAllAsRead(userId);
    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: { updatedCount: count }
    });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while marking all notifications as read'
    });
  }
};

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID provided'
      });
    }

    const existing = await Notification.getNotificationById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    const deleted = await Notification.deleteNotification(id);
    if (!deleted) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete notification'
      });
    }

    await createAuditLog({
      userId: req.user.user_id,
      action: 'NOTIFICATION_DELETED',
      entity: 'NOTIFICATION',
      entityId: id,
      description: `Deleted notification "${existing.title}" (#${id})`,
      details: { notification_id: id, recipient_user_id: existing.recipient_user_id },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting notification:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting notification'
    });
  }
};

module.exports = {
  getNotifications,
  getNotificationStats,
  getNotificationById,
  getUnreadCount,
  createNotification,
  broadcastNotification,
  updateNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification
};
