const pool = require('../config/db');

/**
 * Format raw database row to safe API output with dual property aliases.
 */
const formatBackupRow = (r) => {
  if (!r) return null;

  return {
    backup_id: r.backup_id,
    id: r.backup_id,
    created_by: r.initiated_by_user_id,
    initiated_by_user_id: r.initiated_by_user_id,
    creator_username: r.username || (r.initiated_by_user_id ? `User #${r.initiated_by_user_id}` : 'System / Auto'),
    creator_name: r.creator_name && r.creator_name.trim() ? r.creator_name.trim() : (r.username || 'System'),
    file_name: r.backup_name,
    backup_name: r.backup_name,
    file_path: r.backup_path,
    backup_path: r.backup_path,
    backup_type: r.backup_type,
    status: r.status,
    created_at: r.started_at,
    started_at: r.started_at,
    completed_at: r.completed_at || null,
    file_size: r.file_size_bytes !== null ? Number(r.file_size_bytes) : null,
    file_size_bytes: r.file_size_bytes !== null ? Number(r.file_size_bytes) : null,
    checksum: r.checksum || null,
    error_message: r.error_message || null
  };
};

/**
 * Create initial backup record in backup_history (status: IN_PROGRESS)
 */
const create = async ({
  userId = null,
  backupName,
  backupPath,
  backupType = 'FULL_DATABASE',
  status = 'IN_PROGRESS'
}) => {
  const sql = `
    INSERT INTO backup_history (
      initiated_by_user_id,
      backup_name,
      backup_path,
      backup_type,
      status,
      started_at
    ) VALUES (?, ?, ?, ?, ?, NOW())
  `;

  const [result] = await pool.query(sql, [
    userId || null,
    backupName,
    backupPath,
    backupType,
    status
  ]);

  return result.insertId;
};

/**
 * Update backup record upon completion or failure
 */
const updateStatus = async (backupId, {
  status,
  fileSizeBytes = null,
  checksum = null,
  completedAt = new Date(),
  errorMessage = null
}) => {
  const sql = `
    UPDATE backup_history
    SET 
      status = ?,
      file_size_bytes = COALESCE(?, file_size_bytes),
      checksum = COALESCE(?, checksum),
      completed_at = ?,
      error_message = ?
    WHERE backup_id = ?
  `;

  await pool.query(sql, [
    status,
    fileSizeBytes,
    checksum,
    completedAt ? new Date(completedAt) : null,
    errorMessage ? String(errorMessage).slice(0, 1000) : null,
    backupId
  ]);

  return findById(backupId);
};

/**
 * Find single backup by ID with creator join
 */
const findById = async (backupId) => {
  const parsedId = parseInt(backupId, 10);
  if (isNaN(parsedId) || parsedId <= 0) return null;

  const sql = `
    SELECT 
      b.*,
      u.username,
      CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS creator_name
    FROM backup_history b
    LEFT JOIN users u ON b.initiated_by_user_id = u.user_id
    WHERE b.backup_id = ?
  `;

  const [rows] = await pool.query(sql, [parsedId]);
  if (!rows || rows.length === 0) return null;

  return formatBackupRow(rows[0]);
};

/**
 * Retrieve paginated backup history with multi-criteria filters
 */
const findAll = async ({
  page = 1,
  limit = 25,
  status = '',
  backupType = '',
  dateFrom = '',
  dateTo = '',
  search = ''
} = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
  const offset = (pageNum - 1) * limitNum;

  const whereConditions = [];
  const queryParams = [];

  // Filter by status
  if (status && status.trim()) {
    const s = status.trim().toUpperCase();
    if (s === 'COMPLETED' || s === 'COMPLETED') {
      whereConditions.push("(b.status = 'Completed' OR b.status = 'COMPLETED')");
    } else if (s === 'FAILED') {
      whereConditions.push("(b.status = 'Failed' OR b.status = 'FAILED')");
    } else if (s === 'IN_PROGRESS' || s === 'IN PROGRESS') {
      whereConditions.push("(b.status = 'In Progress' OR b.status = 'IN_PROGRESS')");
    } else {
      whereConditions.push("b.status = ?");
      queryParams.push(status.trim());
    }
  }

  // Filter by backup_type
  if (backupType && backupType.trim()) {
    whereConditions.push("b.backup_type = ?");
    queryParams.push(backupType.trim());
  }

  // Filter by date range
  if (dateFrom && dateFrom.trim()) {
    whereConditions.push("DATE(b.started_at) >= ?");
    queryParams.push(dateFrom.trim());
  }
  if (dateTo && dateTo.trim()) {
    whereConditions.push("DATE(b.started_at) <= ?");
    queryParams.push(dateTo.trim());
  }

  // Keyword search
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereConditions.push(`(
      b.backup_name LIKE ? OR
      b.status LIKE ? OR
      b.backup_type LIKE ? OR
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
    FROM backup_history b
    LEFT JOIN users u ON b.initiated_by_user_id = u.user_id
    ${whereClause}
  `;
  const [countRows] = await pool.query(countSql, queryParams);
  const total = parseInt(countRows[0].total, 10) || 0;
  const totalPages = Math.ceil(total / limitNum) || (total === 0 ? 1 : 1);

  // 2. Data rows query
  const dataSql = `
    SELECT 
      b.*,
      u.username,
      CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS creator_name
    FROM backup_history b
    LEFT JOIN users u ON b.initiated_by_user_id = u.user_id
    ${whereClause}
    ORDER BY b.backup_id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(dataSql, [...queryParams, limitNum, offset]);
  const backups = rows.map(formatBackupRow);

  return {
    backups,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages
    }
  };
};

/**
 * Compute dynamic KPIs for dashboard cards
 */
const getStats = async () => {
  const sql = `
    SELECT
      COUNT(*) AS total_backups,
      SUM(CASE WHEN status IN ('Completed', 'COMPLETED') THEN 1 ELSE 0 END) AS successful_backups,
      SUM(CASE WHEN status IN ('Failed', 'FAILED') THEN 1 ELSE 0 END) AS failed_backups,
      MAX(CASE WHEN status IN ('Completed', 'COMPLETED') THEN started_at ELSE NULL END) AS latest_backup_time
    FROM backup_history
  `;

  const [rows] = await pool.query(sql);
  const r = rows[0] || {};

  return {
    total_backups: parseInt(r.total_backups, 10) || 0,
    successful_backups: parseInt(r.successful_backups, 10) || 0,
    completed_backups: parseInt(r.successful_backups, 10) || 0,
    failed_backups: parseInt(r.failed_backups, 10) || 0,
    latest_backup: r.latest_backup_time || null,
    latest_backup_time: r.latest_backup_time || null
  };
};

module.exports = {
  create,
  updateStatus,
  findById,
  findAll,
  getStats,
  formatBackupRow
};
