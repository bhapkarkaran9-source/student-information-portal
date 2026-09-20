const pool = require('../config/db');

/**
 * Notification Data Model
 * Table: notifications
 * Database: student_portal_db
 */

/**
 * Helper to check if referenced user exists and is active
 * @param {number} userId
 */
const checkUserExistsAndActive = async (userId) => {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) {
    return { exists: false, isActive: false, username: null, fullName: null, roleName: null };
  }

  const sql = `
    SELECT 
      u.user_id, 
      u.username, 
      u.is_active,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS full_name,
      r.role_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.role_id
    WHERE u.user_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [uid]);
  if (!rows[0]) {
    return { exists: false, isActive: false, username: null, fullName: null, roleName: null };
  }

  return {
    exists: true,
    isActive: Boolean(rows[0].is_active),
    username: rows[0].username,
    fullName: rows[0].full_name,
    roleName: rows[0].role_name
  };
};

/**
 * Format raw SQL notification row
 */
const formatNotificationRow = (r) => {
  if (!r) return null;
  return {
    notification_id: r.notification_id,
    recipient_user_id: r.recipient_user_id,
    title: r.title,
    message: r.message,
    notification_type: r.notification_type || 'General',
    is_read: Boolean(r.is_read),
    created_at: r.created_at,
    recipient_username: r.recipient_username || null,
    recipient_name: r.recipient_name || null,
    recipient_email: r.recipient_email || null,
    recipient_role: r.recipient_role || null
  };
};

/**
 * Get paginated list of notifications with search and filtering
 */
const getNotifications = async ({
  page = 1,
  limit = 10,
  search = '',
  recipient_user_id = '',
  role = '',
  notification_type = '',
  is_read = ''
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const whereConditions = [];
  const queryParams = [];

  // Search by title, message, or recipient name/username
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push(`(
      n.title LIKE ? OR 
      n.message LIKE ? OR 
      u.username LIKE ? OR 
      CONCAT(u.first_name, ' ', u.last_name) LIKE ?
    )`);
    queryParams.push(term, term, term, term);
  }

  // Recipient user filter
  if (recipient_user_id) {
    const uid = parseInt(recipient_user_id, 10);
    if (!isNaN(uid) && uid > 0) {
      whereConditions.push('n.recipient_user_id = ?');
      queryParams.push(uid);
    }
  }

  // Recipient role filter
  if (role && role.trim()) {
    whereConditions.push('r.role_name = ?');
    queryParams.push(role.trim().toUpperCase());
  }

  // Notification type filter
  if (notification_type && notification_type.trim()) {
    whereConditions.push('n.notification_type = ?');
    queryParams.push(notification_type.trim());
  }

  // Read status filter
  if (is_read !== undefined && is_read !== '') {
    const readVal = is_read === '1' || is_read === 'true' || is_read === 1;
    whereConditions.push('n.is_read = ?');
    queryParams.push(readVal ? 1 : 0);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // Count total records
  const countSql = `
    SELECT COUNT(*) AS total
    FROM notifications n
    INNER JOIN users u ON n.recipient_user_id = u.user_id
    LEFT JOIN roles r ON u.role_id = r.role_id
    ${whereClause}
  `;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = parseInt(countRows[0].total, 10) || 0;
  const totalPages = Math.ceil(total / limitNum) || 1;

  // Fetch paginated records joined with user information
  const dataSql = `
    SELECT 
      n.notification_id,
      n.recipient_user_id,
      n.title,
      n.message,
      n.notification_type,
      n.is_read,
      n.created_at,
      u.username AS recipient_username,
      u.email AS recipient_email,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS recipient_name,
      r.role_name AS recipient_role
    FROM notifications n
    INNER JOIN users u ON n.recipient_user_id = u.user_id
    LEFT JOIN roles r ON u.role_id = r.role_id
    ${whereClause}
    ORDER BY n.notification_id DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(dataSql, [...queryParams, limitNum, offset]);

  return {
    notifications: rows.map(formatNotificationRow),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    }
  };
};

/**
 * Get single notification by ID
 */
const getNotificationById = async (id) => {
  const nid = parseInt(id, 10);
  if (isNaN(nid) || nid <= 0) return null;

  const sql = `
    SELECT 
      n.notification_id,
      n.recipient_user_id,
      n.title,
      n.message,
      n.notification_type,
      n.is_read,
      n.created_at,
      u.username AS recipient_username,
      u.email AS recipient_email,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS recipient_name,
      r.role_name AS recipient_role
    FROM notifications n
    INNER JOIN users u ON n.recipient_user_id = u.user_id
    LEFT JOIN roles r ON u.role_id = r.role_id
    WHERE n.notification_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [nid]);
  if (!rows[0]) return null;
  return formatNotificationRow(rows[0]);
};

/**
 * Get summary KPI statistics for notifications
 */
const getNotificationStats = async () => {
  const sql = `
    SELECT 
      COUNT(*) AS total_notifications,
      SUM(CASE WHEN n.is_read = 0 THEN 1 ELSE 0 END) AS unread_count,
      SUM(CASE WHEN n.is_read = 1 THEN 1 ELSE 0 END) AS read_count,
      SUM(CASE WHEN r.role_name = 'STUDENT' THEN 1 ELSE 0 END) AS student_notifications,
      SUM(CASE WHEN r.role_name = 'TEACHER' THEN 1 ELSE 0 END) AS teacher_notifications,
      SUM(CASE WHEN r.role_name = 'ADMIN' THEN 1 ELSE 0 END) AS admin_notifications
    FROM notifications n
    INNER JOIN users u ON n.recipient_user_id = u.user_id
    LEFT JOIN roles r ON u.role_id = r.role_id
  `;
  const [rows] = await pool.query(sql);
  const r = rows[0] || {};
  return {
    total_notifications: parseInt(r.total_notifications, 10) || 0,
    unread_count: parseInt(r.unread_count, 10) || 0,
    read_count: parseInt(r.read_count, 10) || 0,
    by_role: {
      STUDENT: parseInt(r.student_notifications, 10) || 0,
      TEACHER: parseInt(r.teacher_notifications, 10) || 0,
      ADMIN: parseInt(r.admin_notifications, 10) || 0
    }
  };
};

/**
 * Create a new notification for a single recipient
 */
const createNotification = async ({
  recipient_user_id,
  title,
  message,
  notification_type = 'General',
  is_read = 0,
  metadata = null,
  eventId = null
}) => {
  const sql = `
    INSERT INTO notifications (recipient_user_id, title, message, notification_type, is_read)
    VALUES (?, ?, ?, ?, ?)
  `;
  const params = [
    parseInt(recipient_user_id, 10),
    title.trim(),
    message.trim(),
    notification_type && notification_type.trim() ? notification_type.trim() : 'General',
    is_read ? 1 : 0
  ];
  const [result] = await pool.query(sql, params);
  const newNotif = await getNotificationById(result.insertId);

  try {
    const { sendNotificationEmail, resolveEmailNotificationType, isEmailNotificationEnabled } = require('../services/notificationEmail.service');
    const emailType = resolveEmailNotificationType(notification_type, title, metadata);
    if (emailType && isEmailNotificationEnabled(emailType)) {
      await sendNotificationEmail({
        userId: recipient_user_id,
        notificationType: emailType,
        title,
        message,
        metadata: {
          ...metadata,
          eventId: eventId || metadata?.eventId || newNotif?.notification_id
        }
      });
    }
  } catch (emailErr) {
    console.warn('[NotificationModel] Email dispatch error:', emailErr.message);
  }

  return newNotif;
};

/**
 * Broadcast notification to all active users of a given role (or ALL)
 */
const broadcastNotification = async ({
  target_role,
  title,
  message,
  notification_type = 'General',
  metadata = null,
  eventId = null,
  userIds = null,
  recipient_user_ids = null
}) => {
  const roleUpper = target_role ? String(target_role).trim().toUpperCase() : 'ALL';
  
  let userSql = `
    SELECT u.user_id 
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.role_id
    WHERE u.is_active = 1
  `;
  const userParams = [];

  if (roleUpper !== 'ALL') {
    userSql += ' AND r.role_name = ?';
    userParams.push(roleUpper);
  }

  const targetIds = userIds || recipient_user_ids;
  if (Array.isArray(targetIds) && targetIds.length > 0) {
    userSql += ' AND u.user_id IN (?)';
    userParams.push(targetIds);
  }

  const [activeUsers] = await pool.query(userSql, userParams);
  if (activeUsers.length === 0) {
    return { insertedCount: 0, recipientCount: 0 };
  }

  const values = activeUsers.map((u) => [
    u.user_id,
    title.trim(),
    message.trim(),
    notification_type && notification_type.trim() ? notification_type.trim() : 'General',
    0
  ]);

  const insertSql = `
    INSERT INTO notifications (recipient_user_id, title, message, notification_type, is_read)
    VALUES ?
  `;
  const [result] = await pool.query(insertSql, [values]);

  try {
    const { sendNotificationEmail, resolveEmailNotificationType, isEmailNotificationEnabled } = require('../services/notificationEmail.service');
    const emailType = resolveEmailNotificationType(notification_type, title, metadata);
    if (emailType && isEmailNotificationEnabled(emailType)) {
      for (const u of activeUsers) {
        try {
          await sendNotificationEmail({
            userId: u.user_id,
            notificationType: emailType,
            title,
            message,
            metadata: {
              ...metadata,
              eventId: eventId || metadata?.eventId || `broadcast_${result.insertId || Date.now()}`
            }
          });
        } catch (emailErr) {
          console.warn('[NotificationModel] Broadcast email dispatch error:', emailErr.message);
        }
      }
    }
  } catch (emailErr) {
    console.warn('[NotificationModel] Broadcast email dispatch error:', emailErr.message);
  }

  return {
    insertedCount: result.affectedRows,
    recipientCount: activeUsers.length
  };
};

/**
 * Update an existing notification
 */
const updateNotification = async (id, updateData) => {
  const nid = parseInt(id, 10);
  if (isNaN(nid) || nid <= 0) return null;

  const allowedFields = ['recipient_user_id', 'title', 'message', 'notification_type', 'is_read'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      if (field === 'recipient_user_id') {
        params.push(parseInt(updateData[field], 10));
      } else if (field === 'is_read') {
        params.push(updateData[field] ? 1 : 0);
      } else if (field === 'title' || field === 'message' || field === 'notification_type') {
        params.push(updateData[field] && String(updateData[field]).trim() ? String(updateData[field]).trim() : null);
      } else {
        params.push(updateData[field]);
      }
    }
  }

  if (setClauses.length === 0) return getNotificationById(nid);

  params.push(nid);
  const sql = `UPDATE notifications SET ${setClauses.join(', ')} WHERE notification_id = ?`;
  await pool.query(sql, params);
  return getNotificationById(nid);
};

/**
 * Toggle or set notification read state
 */
const markAsRead = async (id, isRead = true) => {
  const nid = parseInt(id, 10);
  if (isNaN(nid) || nid <= 0) return null;

  const sql = 'UPDATE notifications SET is_read = ? WHERE notification_id = ?';
  await pool.query(sql, [isRead ? 1 : 0, nid]);
  return getNotificationById(nid);
};

/**
 * Get count of unread notifications for a specific user
 */
const getUnreadCount = async (userId) => {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) return 0;

  const sql = 'SELECT COUNT(*) AS unread_count FROM notifications WHERE recipient_user_id = ? AND is_read = 0';
  const [rows] = await pool.query(sql, [uid]);
  return parseInt(rows[0]?.unread_count, 10) || 0;
};

/**
 * Mark all unread notifications for a user as read
 */
const markAllAsRead = async (userId) => {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) return 0;

  const sql = 'UPDATE notifications SET is_read = 1 WHERE recipient_user_id = ? AND is_read = 0';
  const [result] = await pool.query(sql, [uid]);
  return result.affectedRows;
};

/**
 * Delete a notification
 */
const deleteNotification = async (id) => {
  const nid = parseInt(id, 10);
  if (isNaN(nid) || nid <= 0) return false;

  const [result] = await pool.query('DELETE FROM notifications WHERE notification_id = ?', [nid]);
  return result.affectedRows > 0;
};

module.exports = {
  checkUserExistsAndActive,
  getNotifications,
  getNotificationById,
  getNotificationStats,
  getUnreadCount,
  createNotification,
  broadcastNotification,
  updateNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification
};
