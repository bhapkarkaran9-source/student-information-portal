const pool = require('../config/db');

/**
 * Email Log Model
 * Table: email_logs
 * Database: student_portal_db
 * 
 * Strict parameterized SQL queries only.
 * Guarantees zero exposure of password hashes, salts, or biometric data.
 */

/**
 * Creates an initial email log entry in the database.
 * @param {object} params
 * @param {string} params.recipient_email
 * @param {number|null} [params.user_id]
 * @param {string} params.email_type
 * @param {string} params.subject
 * @param {'PENDING'|'SENT'|'FAILED'} [params.status='PENDING']
 * @param {string|null} [params.error_message=null]
 * @param {string|null} [params.event_key=null]
 * @returns {Promise<{ email_log_id: number }>}
 */
async function createEmailLog({
  recipient_email,
  user_id = null,
  email_type,
  subject,
  status = 'PENDING',
  error_message = null,
  event_key = null
}) {
  const query = `
    INSERT INTO email_logs (
      recipient_email,
      user_id,
      email_type,
      subject,
      status,
      error_message,
      event_key,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  const [result] = await pool.query(query, [
    String(recipient_email).trim().slice(0, 255),
    user_id || null,
    String(email_type).trim().slice(0, 100),
    String(subject).trim().slice(0, 255),
    status,
    error_message ? String(error_message).slice(0, 2000) : null,
    event_key ? String(event_key).trim().slice(0, 255) : null
  ]);

  return { email_log_id: result.insertId };
}

/**
 * Marks an email log entry as successfully SENT.
 * @param {number} email_log_id
 * @returns {Promise<boolean>}
 */
async function markEmailSent(email_log_id) {
  const query = `
    UPDATE email_logs
    SET status = 'SENT',
        sent_at = NOW(),
        error_message = NULL
    WHERE email_log_id = ?
  `;
  const [result] = await pool.query(query, [email_log_id]);
  return result.affectedRows > 0;
}

/**
 * Marks an email log entry as FAILED with a safe error message.
 * @param {number} email_log_id
 * @param {string} error_message
 * @returns {Promise<boolean>}
 */
async function markEmailFailed(email_log_id, error_message) {
  const query = `
    UPDATE email_logs
    SET status = 'FAILED',
        error_message = ?
    WHERE email_log_id = ?
  `;
  const [result] = await pool.query(query, [
    error_message ? String(error_message).slice(0, 2000) : 'Unknown transmission failure',
    email_log_id
  ]);
  return result.affectedRows > 0;
}

/**
 * Retrieves paginated email logs with optional filtering.
 * @param {object} params
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 * @param {string} [params.status]
 * @param {string} [params.email_type]
 * @param {string} [params.search]
 * @param {string} [params.start_date]
 * @param {string} [params.end_date]
 * @returns {Promise<{ logs: Array, pagination: object }>}
 */
async function getEmailLogs({
  page = 1,
  limit = 20,
  status = '',
  email_type = '',
  search = '',
  start_date = '',
  end_date = ''
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const whereConditions = [];
  const queryParams = [];

  if (status && ['PENDING', 'SENT', 'FAILED'].includes(status.toUpperCase())) {
    whereConditions.push('l.status = ?');
    queryParams.push(status.toUpperCase());
  }

  if (email_type && email_type.trim()) {
    whereConditions.push('l.email_type = ?');
    queryParams.push(email_type.trim());
  }

  if (search && search.trim()) {
    whereConditions.push('(l.recipient_email LIKE ? OR l.subject LIKE ?)');
    const searchTerm = `%${search.trim()}%`;
    queryParams.push(searchTerm, searchTerm);
  }

  if (start_date && start_date.trim()) {
    whereConditions.push('l.created_at >= ?');
    queryParams.push(start_date.trim());
  }

  if (end_date && end_date.trim()) {
    whereConditions.push('l.created_at <= ?');
    queryParams.push(end_date.trim());
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Total count query
  const countSql = `
    SELECT COUNT(*) AS total
    FROM email_logs l
    ${whereClause}
  `;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = countRows[0]?.total || 0;
  const totalPages = Math.ceil(total / limitNum) || 1;

  // 2. Data rows query
  const dataSql = `
    SELECT 
      l.email_log_id,
      l.recipient_email,
      l.user_id,
      l.email_type,
      l.subject,
      l.status,
      l.error_message,
      l.event_key,
      l.sent_at,
      l.created_at,
      u.username,
      u.email AS user_email
    FROM email_logs l
    LEFT JOIN users u ON l.user_id = u.user_id
    ${whereClause}
    ORDER BY l.created_at DESC, l.email_log_id DESC
    LIMIT ? OFFSET ?
  `;

  const [logs] = await pool.query(dataSql, [...queryParams, limitNum, offset]);

  return {
    logs,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    }
  };
}

/**
 * Retrieves a single email log record by ID.
 * @param {number} email_log_id
 * @returns {Promise<object|null>}
 */
async function getEmailLogById(email_log_id) {
  const query = `
    SELECT 
      l.email_log_id,
      l.recipient_email,
      l.user_id,
      l.email_type,
      l.subject,
      l.status,
      l.error_message,
      l.event_key,
      l.sent_at,
      l.created_at,
      u.username,
      u.email AS user_email
    FROM email_logs l
    LEFT JOIN users u ON l.user_id = u.user_id
    WHERE l.email_log_id = ?
  `;
  const [rows] = await pool.query(query, [email_log_id]);
  return rows[0] || null;
}

/**
 * Retrieves an email log record by event_key.
 * @param {string} event_key
 * @returns {Promise<object|null>}
 */
async function findByEventKey(event_key) {
  if (!event_key) return null;
  const query = `
    SELECT email_log_id, recipient_email, user_id, email_type, subject, status, error_message, event_key, sent_at, created_at
    FROM email_logs
    WHERE event_key = ?
    LIMIT 1
  `;
  const [rows] = await pool.query(query, [String(event_key).trim()]);
  return rows[0] || null;
}

/**
 * Aggregates email statistics (total, sent, pending, failed) directly from MySQL.
 * @returns {Promise<{ total: number, sent: number, pending: number, failed: number }>}
 */
async function getEmailStats() {
  const query = `
    SELECT 
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END), 0) AS sent,
      COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END), 0) AS failed
    FROM email_logs
  `;
  const [rows] = await pool.query(query);
  const r = rows[0] || {};
  return {
    total: parseInt(r.total, 10) || 0,
    sent: parseInt(r.sent, 10) || 0,
    pending: parseInt(r.pending, 10) || 0,
    failed: parseInt(r.failed, 10) || 0
  };
}

module.exports = {
  createEmailLog,
  markEmailSent,
  markEmailFailed,
  getEmailLogs,
  getEmailLogById,
  findByEventKey,
  getEmailStats
};

