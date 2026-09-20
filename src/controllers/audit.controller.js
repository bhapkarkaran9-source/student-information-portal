const Audit = require('../models/audit.model');

/**
 * Audit Log Controller
 * Protected by ADMIN RBAC.
 * Read-only access; audit logs are strictly append-only and immutable.
 */

/**
 * Validate positive integer ID
 */
const isValidId = (id) => {
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0 && String(parsed) === String(id).trim();
};

/**
 * GET /api/audit-logs
 * List paginated audit logs with search and multi-criteria filters.
 */
const getAuditLogs = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 25,
      action = '',
      entity = '',
      entity_type = '',
      user_id = '',
      date_from = '',
      date_to = '',
      search = ''
    } = req.query;

    // Validate page
    const pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid page parameter. Must be a positive integer.'
      });
    }

    // Validate limit (Max 100)
    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid limit parameter. Must be a positive integer.'
      });
    }
    const safeLimit = Math.min(100, limitNum);

    // Validate date range if provided
    if (date_from && isNaN(Date.parse(date_from))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date_from format. Use YYYY-MM-DD.'
      });
    }
    if (date_to && isNaN(Date.parse(date_to))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date_to format. Use YYYY-MM-DD.'
      });
    }
    if (date_from && date_to && new Date(date_from) > new Date(date_to)) {
      return res.status(400).json({
        success: false,
        message: 'date_from cannot be later than date_to.'
      });
    }

    // Retrieve paginated logs and stats
    const [result, kpis] = await Promise.all([
      Audit.findAll({
        page: pageNum,
        limit: safeLimit,
        action,
        entity,
        entity_type,
        user_id,
        date_from,
        date_to,
        search
      }),
      Audit.getStats()
    ]);

    return res.status(200).json({
      success: true,
      data: result.logs,
      pagination: result.pagination,
      stats: kpis,
      kpis: kpis
    });
  } catch (error) {
    console.error('[AuditController] Error fetching audit logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching audit logs.'
    });
  }
};

/**
 * GET /api/audit-logs/:id
 * Retrieve full details for a single audit log entry.
 */
const getAuditLogById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid audit log ID format.'
      });
    }

    const log = await Audit.findById(id);
    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Audit log entry not found.'
      });
    }

    return res.status(200).json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('[AuditController] Error fetching audit log details:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching audit log details.'
    });
  }
};

/**
 * Rejection handler for attempted modifications of immutable audit logs.
 * Returns 405 Method Not Allowed.
 */
const methodNotAllowed = (req, res) => {
  return res.status(405).json({
    success: false,
    message: 'Audit logs are immutable security records. Modification and deletion are strictly prohibited.'
  });
};

module.exports = {
  getAuditLogs,
  getAuditLogById,
  methodNotAllowed
};
