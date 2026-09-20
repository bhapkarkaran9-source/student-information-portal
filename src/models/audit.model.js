const pool = require('../config/db');

/**
 * Audit Log Model
 * Table: audit_logs
 * Database: student_portal_db
 */

/**
 * Parses JSON details safely and formats an audit record for client consumption.
 * @param {object} r - Raw database row
 * @returns {object|null}
 */
const formatAuditRow = (r) => {
  if (!r) return null;

  let parsedDetails = {};
  let description = '';
  let userAgent = null;

  if (r.details) {
    try {
      parsedDetails = JSON.parse(r.details);
      description = parsedDetails.description || '';
      userAgent = parsedDetails.user_agent || null;
    } catch (e) {
      description = String(r.details);
      parsedDetails = { raw: r.details };
    }
  }

  return {
    audit_id: r.log_id,
    log_id: r.log_id,
    user_id: r.user_id,
    username: r.username || (r.user_id ? `User #${r.user_id}` : 'System / Anonymous'),
    full_name: r.full_name && r.full_name.trim() ? r.full_name.trim() : (r.username || 'System'),
    role_name: r.role_name || null,
    action: r.action,
    entity: r.entity,
    entity_type: r.entity,
    entity_id: r.entity_id,
    ip_address: r.ip_address || null,
    description: description,
    user_agent: userAgent,
    details: parsedDetails,
    created_at: r.created_at
  };
};

/**
 * Retrieve paginated audit logs with multi-field filtering and search.
 */
const findAll = async ({
  page = 1,
  limit = 25,
  action = '',
  entity = '',
  entity_type = '',
  user_id = '',
  date_from = '',
  date_to = '',
  search = ''
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
  const offset = (pageNum - 1) * limitNum;

  const whereConditions = [];
  const queryParams = [];

  // Filter by action
  if (action && action.trim()) {
    whereConditions.push('a.action = ?');
    queryParams.push(action.trim().toUpperCase());
  }

  // Filter by entity (support both entity and entity_type, plural and singular)
  let targetEntity = (entity || entity_type || '').trim().toUpperCase();
  if (targetEntity) {
    const pluralToSingular = {
      'USERS': 'USER',
      'DEPARTMENTS': 'DEPARTMENT',
      'COURSES': 'COURSE',
      'STUDENTS': 'STUDENT',
      'TEACHERS': 'TEACHER',
      'ASSIGNMENTS': 'ASSIGNMENT',
      'NOTICES': 'NOTICE',
      'NOTIFICATIONS': 'NOTIFICATION',
      'QUERIES': 'QUERY',
      'REPORTS': 'REPORT',
      'GRADES': 'GRADE',
      'TIMETABLES': 'TIMETABLE',
      'ATTENDANCES': 'ATTENDANCE'
    };
    const singular = pluralToSingular[targetEntity] || targetEntity;
    whereConditions.push('(a.entity = ? OR a.entity = ? OR a.entity = ? OR a.entity = ?)');
    queryParams.push(singular, singular.toLowerCase(), targetEntity, targetEntity.toLowerCase());
  }

  // Filter by actor user_id
  if (user_id && !isNaN(parseInt(user_id, 10))) {
    whereConditions.push('a.user_id = ?');
    queryParams.push(parseInt(user_id, 10));
  }

  // Date range filters
  if (date_from && date_from.trim()) {
    whereConditions.push('DATE(a.created_at) >= ?');
    queryParams.push(date_from.trim());
  }
  if (date_to && date_to.trim()) {
    whereConditions.push('DATE(a.created_at) <= ?');
    queryParams.push(date_to.trim());
  }

  // Multi-field search
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push(`(
      a.action LIKE ? OR 
      a.entity LIKE ? OR 
      a.details LIKE ? OR 
      u.username LIKE ? OR 
      u.first_name LIKE ? OR 
      u.last_name LIKE ?
    )`);
    queryParams.push(term, term, term, term, term, term);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // 1. Total records count
  const countSql = `
    SELECT COUNT(*) AS total
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.user_id
    ${whereClause}
  `;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = parseInt(countRows[0].total, 10) || 0;
  const totalPages = Math.ceil(total / limitNum) || (total === 0 ? 1 : 1);

  // 2. Paginated data query
  const dataSql = `
    SELECT 
      a.log_id,
      a.user_id,
      a.action,
      a.entity,
      a.entity_id,
      a.ip_address,
      a.details,
      a.created_at,
      u.username,
      u.first_name,
      u.last_name,
      TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS full_name,
      r.role_name
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.user_id
    LEFT JOIN roles r ON u.role_id = r.role_id
    ${whereClause}
    ORDER BY a.created_at DESC, a.log_id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(dataSql, [...queryParams, limitNum, offset]);

  return {
    logs: rows.map(formatAuditRow),
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalRecords: total,
      totalPages: totalPages
    }
  };
};

/**
 * Retrieve a single audit log entry by ID.
 * @param {number|string} logId 
 * @returns {Promise<object|null>}
 */
const findById = async (logId) => {
  const idNum = parseInt(logId, 10);
  if (isNaN(idNum)) return null;

  const sql = `
    SELECT 
      a.log_id,
      a.user_id,
      a.action,
      a.entity,
      a.entity_id,
      a.ip_address,
      a.details,
      a.created_at,
      u.username,
      u.first_name,
      u.last_name,
      TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS full_name,
      r.role_name
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.user_id
    LEFT JOIN roles r ON u.role_id = r.role_id
    WHERE a.log_id = ?
    LIMIT 1
  `;

  const [rows] = await pool.query(sql, [idNum]);
  if (!rows || rows.length === 0) return null;
  return formatAuditRow(rows[0]);
};

/**
 * Retrieve dynamically aggregated KPI metrics for the Audit Dashboard.
 * Returns 0 for all metrics on an empty database.
 */
const getStats = async () => {
  const sql = `
    SELECT 
      COUNT(*) AS total_logs,
      COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS today_activity,
      COALESCE(SUM(CASE WHEN action IN ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT') THEN 1 ELSE 0 END), 0) AS login_activity,
      COALESCE(SUM(CASE WHEN action LIKE '%CREATED%' OR action LIKE '%UPDATED%' OR action LIKE '%DELETED%' THEN 1 ELSE 0 END), 0) AS data_changes
    FROM audit_logs
  `;

  const [rows] = await pool.query(sql);
  const row = rows[0] || {};

  return {
    totalLogs: parseInt(row.total_logs, 10) || 0,
    todayActivity: parseInt(row.today_activity, 10) || 0,
    loginActivity: parseInt(row.login_activity, 10) || 0,
    dataChanges: parseInt(row.data_changes, 10) || 0
  };
};

module.exports = {
  findAll,
  findById,
  getStats,
  formatAuditRow
};
