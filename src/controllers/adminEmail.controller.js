const emailModel = require('../models/email.model');
const emailService = require('../services/email.service');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * Controller for Administrative Email Logs and System Auditing
 * Protected strictly under ADMIN role.
 * Zero exposure of SMTP credentials, secrets, or biometric vectors.
 */

/**
 * Retrieves safe email configuration metadata without secrets.
 * GET /api/admin/email/config
 */
async function getEmailConfig(req, res, next) {
  try {
    const config = emailService.getEmailConfig();
    return successResponse(res, 200, 'Email system configuration retrieved successfully', config);
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves aggregated email delivery statistics.
 * GET /api/admin/email/stats
 */
async function getEmailStats(req, res, next) {
  try {
    const stats = await emailModel.getEmailStats();
    return successResponse(res, 200, 'Email statistics retrieved successfully', stats);
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves paginated email logs with optional filtering.
 * GET /api/admin/email/logs
 */
async function getEmailLogs(req, res, next) {
  try {
    const { page, limit, status, email_type, search, start_date, end_date } = req.query;

    const result = await emailModel.getEmailLogs({
      page,
      limit,
      status,
      email_type,
      search,
      start_date,
      end_date
    });

    return successResponse(res, 200, 'Email logs retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves a single email log record by ID.
 * GET /api/admin/email/logs/:id
 */
async function getEmailLogById(req, res, next) {
  try {
    const logId = parseInt(req.params.id, 10);
    if (isNaN(logId) || logId <= 0) {
      return errorResponse(res, 400, 'Invalid email log identifier');
    }

    const log = await emailModel.getEmailLogById(logId);
    if (!log) {
      return errorResponse(res, 404, 'Email log entry not found');
    }

    return successResponse(res, 200, 'Email log entry retrieved successfully', log);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getEmailConfig,
  getEmailStats,
  getEmailLogs,
  getEmailLogById
};

