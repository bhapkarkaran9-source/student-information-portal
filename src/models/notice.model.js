const pool = require('../config/db');

/**
 * Notice Data Model
 * Table: notices
 * Database: student_portal_db
 */

const ALLOWED_TARGET_ROLES = ['ALL', 'ADMIN', 'TEACHER', 'STUDENT'];

/**
 * Format raw SQL notice row and derive status safely
 */
const formatNoticeRow = (r) => {
  if (!r) return null;

  const now = new Date();
  const publishedAt = r.published_at ? new Date(r.published_at) : null;
  const expiresAt = r.expires_at ? new Date(r.expires_at) : null;

  let derivedStatus = 'Active';
  if (!r.is_active) {
    derivedStatus = 'Inactive';
  } else if (expiresAt && expiresAt < now) {
    derivedStatus = 'Expired';
  } else if (publishedAt && publishedAt > now) {
    derivedStatus = 'Upcoming';
  } else {
    derivedStatus = 'Active';
  }

  return {
    notice_id: r.notice_id,
    created_by: r.created_by,
    target_role: r.target_role,
    title: r.title,
    content: r.content,
    attachment_path: r.attachment_path || null,
    published_at: r.published_at ? r.published_at.toISOString().slice(0, 19).replace('T', ' ') : null,
    expires_at: r.expires_at ? r.expires_at.toISOString().slice(0, 19).replace('T', ' ') : null,
    is_active: Boolean(r.is_active),
    created_at: r.created_at,
    updated_at: r.updated_at,
    creator_name: r.creator_name || null,
    creator_username: r.creator_username || null,
    creator_role: r.creator_role || null,
    status: derivedStatus,
    is_expired: expiresAt ? expiresAt < now : false,
    is_upcoming: publishedAt ? publishedAt > now : false
  };
};

/**
 * Get paginated list of notices with multi-criteria filtering and search
 */
const getNotices = async ({
  page = 1,
  limit = 10,
  search = '',
  target_role = '',
  status = '',
  from_date = '',
  to_date = ''
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const whereConditions = [];
  const queryParams = [];

  // Search by title or content
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push('(n.title LIKE ? OR n.content LIKE ?)');
    queryParams.push(term, term);
  }

  // Target role filter
  if (target_role && target_role.trim()) {
    const roleUpper = target_role.trim().toUpperCase();
    if (ALLOWED_TARGET_ROLES.includes(roleUpper)) {
      whereConditions.push('n.target_role = ?');
      queryParams.push(roleUpper);
    }
  }

  // Status filter (Active, Upcoming, Expired, Inactive)
  if (status && status.trim()) {
    const s = status.trim().toLowerCase();
    if (s === 'active') {
      whereConditions.push('n.is_active = 1 AND n.published_at <= NOW() AND (n.expires_at IS NULL OR n.expires_at >= NOW())');
    } else if (s === 'upcoming') {
      whereConditions.push('n.is_active = 1 AND n.published_at > NOW()');
    } else if (s === 'expired') {
      whereConditions.push('n.is_active = 1 AND n.expires_at IS NOT NULL AND n.expires_at < NOW()');
    } else if (s === 'inactive') {
      whereConditions.push('n.is_active = 0');
    }
  }

  // Date range filters
  if (from_date && from_date.trim()) {
    whereConditions.push('n.published_at >= ?');
    queryParams.push(from_date.trim());
  }

  if (to_date && to_date.trim()) {
    whereConditions.push('n.published_at <= ?');
    queryParams.push(to_date.trim());
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // Count total records
  const countSql = `
    SELECT COUNT(*) AS total
    FROM notices n
    ${whereClause}
  `;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = parseInt(countRows[0].total, 10) || 0;
  const totalPages = Math.ceil(total / limitNum) || 1;

  // Fetch paginated records joined with creator info
  const dataSql = `
    SELECT 
      n.notice_id,
      n.created_by,
      n.target_role,
      n.title,
      n.content,
      n.attachment_path,
      n.published_at,
      n.expires_at,
      n.is_active,
      n.created_at,
      n.updated_at,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS creator_name,
      u.username AS creator_username,
      ro.role_name AS creator_role
    FROM notices n
    INNER JOIN users u ON n.created_by = u.user_id
    LEFT JOIN roles ro ON u.role_id = ro.role_id
    ${whereClause}
    ORDER BY n.published_at DESC, n.notice_id DESC
    LIMIT ? OFFSET ?
  `;
  const [rows] = await pool.query(dataSql, [...queryParams, limitNum, offset]);

  return {
    notices: rows.map(formatNoticeRow),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    }
  };
};

/**
 * Get single notice by ID
 */
const getNoticeById = async (id) => {
  const nid = parseInt(id, 10);
  if (isNaN(nid) || nid <= 0) return null;

  const sql = `
    SELECT 
      n.notice_id,
      n.created_by,
      n.target_role,
      n.title,
      n.content,
      n.attachment_path,
      n.published_at,
      n.expires_at,
      n.is_active,
      n.created_at,
      n.updated_at,
      TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS creator_name,
      u.username AS creator_username,
      ro.role_name AS creator_role
    FROM notices n
    INNER JOIN users u ON n.created_by = u.user_id
    LEFT JOIN roles ro ON u.role_id = ro.role_id
    WHERE n.notice_id = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [nid]);
  if (!rows[0]) return null;
  return formatNoticeRow(rows[0]);
};

/**
 * Get KPI statistics for notices
 */
const getNoticeStats = async () => {
  const sql = `
    SELECT 
      COUNT(*) AS total_notices,
      SUM(CASE WHEN is_active = 1 AND published_at <= NOW() AND (expires_at IS NULL OR expires_at >= NOW()) THEN 1 ELSE 0 END) AS active_notices,
      SUM(CASE WHEN is_active = 1 AND published_at > NOW() THEN 1 ELSE 0 END) AS upcoming_notices,
      SUM(CASE WHEN is_active = 1 AND expires_at IS NOT NULL AND expires_at < NOW() THEN 1 ELSE 0 END) AS expired_notices,
      SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive_notices,
      SUM(CASE WHEN target_role = 'ALL' THEN 1 ELSE 0 END) AS role_all_count,
      SUM(CASE WHEN target_role = 'STUDENT' THEN 1 ELSE 0 END) AS role_student_count,
      SUM(CASE WHEN target_role = 'TEACHER' THEN 1 ELSE 0 END) AS role_teacher_count,
      SUM(CASE WHEN target_role = 'ADMIN' THEN 1 ELSE 0 END) AS role_admin_count
    FROM notices
  `;
  const [rows] = await pool.query(sql);
  const r = rows[0] || {};
  return {
    total_notices: parseInt(r.total_notices, 10) || 0,
    active_notices: parseInt(r.active_notices, 10) || 0,
    upcoming_notices: parseInt(r.upcoming_notices, 10) || 0,
    expired_notices: parseInt(r.expired_notices, 10) || 0,
    inactive_notices: parseInt(r.inactive_notices, 10) || 0,
    by_target_role: {
      ALL: parseInt(r.role_all_count, 10) || 0,
      STUDENT: parseInt(r.role_student_count, 10) || 0,
      TEACHER: parseInt(r.role_teacher_count, 10) || 0,
      ADMIN: parseInt(r.role_admin_count, 10) || 0
    }
  };
};

/**
 * Create a new notice
 */
const createNotice = async ({
  created_by,
  target_role = 'ALL',
  title,
  content,
  attachment_path = null,
  published_at = null,
  expires_at = null,
  is_active = 1
}) => {
  const sql = `
    INSERT INTO notices (
      created_by, target_role, title, content, attachment_path, published_at, expires_at, is_active
    ) VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?)
  `;
  const params = [
    parseInt(created_by, 10),
    target_role,
    title.trim(),
    content.trim(),
    attachment_path && attachment_path.trim() ? attachment_path.trim() : null,
    published_at || null,
    expires_at || null,
    is_active ? 1 : 0
  ];
  const [result] = await pool.query(sql, params);
  return getNoticeById(result.insertId);
};

/**
 * Update an existing notice
 */
const updateNotice = async (id, updateData) => {
  const nid = parseInt(id, 10);
  if (isNaN(nid) || nid <= 0) return null;

  const allowedFields = ['target_role', 'title', 'content', 'attachment_path', 'published_at', 'expires_at', 'is_active'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      if (field === 'is_active') {
        params.push(updateData[field] ? 1 : 0);
      } else if (field === 'title' || field === 'content' || field === 'attachment_path') {
        params.push(updateData[field] && String(updateData[field]).trim() ? String(updateData[field]).trim() : null);
      } else {
        params.push(updateData[field]);
      }
    }
  }

  if (setClauses.length === 0) return getNoticeById(nid);

  params.push(nid);
  const sql = `UPDATE notices SET ${setClauses.join(', ')} WHERE notice_id = ?`;
  await pool.query(sql, params);
  return getNoticeById(nid);
};

/**
 * Delete a notice
 */
const deleteNotice = async (id) => {
  const nid = parseInt(id, 10);
  if (isNaN(nid) || nid <= 0) return false;

  const [result] = await pool.query('DELETE FROM notices WHERE notice_id = ?', [nid]);
  return result.affectedRows > 0;
};

/**
 * Dispatch in-app and failure-isolated email notification for a notice
 */
const dispatchNoticeNotification = async (notice, { userIds = null, category = null } = {}) => {
  if (!notice) return null;
  const Notification = require('./notification.model');
  const noticeCategory = category || notice.category || notice.target_role || 'General';
  return Notification.broadcastNotification({
    target_role: notice.target_role || 'ALL',
    title: `New Notice: ${notice.title}`,
    message: notice.content,
    notification_type: 'NEW_NOTICE',
    metadata: {
      emailNotificationType: 'NEW_NOTICE',
      notice_id: notice.notice_id,
      noticeId: notice.notice_id,
      eventId: `NOTICE_${notice.notice_id}`,
      title: notice.title,
      noticeTitle: notice.title,
      content: notice.content,
      description: notice.content,
      summary: notice.content,
      published_at: notice.published_at,
      publishedDate: notice.published_at,
      category: noticeCategory,
      noticeCategory: noticeCategory,
      target_role: notice.target_role
    },
    eventId: `NOTICE_${notice.notice_id}`,
    userIds: userIds
  });
};

module.exports = {
  ALLOWED_TARGET_ROLES,
  getNotices,
  getNoticeById,
  getNoticeStats,
  createNotice,
  updateNotice,
  deleteNotice,
  dispatchNoticeNotification
};
