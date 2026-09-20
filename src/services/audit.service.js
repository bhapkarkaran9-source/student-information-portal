const db = require('../config/db');

/**
 * Audit Logging Service
 * Provides non-blocking, fail-safe audit logging for critical system actions.
 * Guarantees zero leakage of passwords, tokens, authorization headers, or database secrets.
 */

// Blacklisted keys that must NEVER be stored in audit logs
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'old_password',
  'new_password',
  'confirm_password',
  'token',
  'jwt',
  'authorization',
  'db_password',
  'secret',
  'access_token',
  'refresh_token'
]);

/**
 * Deeply sanitizes an object or value to remove any sensitive attributes.
 * @param {*} data 
 * @returns {*} sanitized copy
 */
function sanitizeData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }
  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('token') || lowerKey.includes('secret')) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Extracts client IP address safely from an Express request object.
 * @param {object} req 
 * @returns {string|null}
 */
function extractIpAddress(req) {
  if (!req) return null;
  let ip = null;
  const forwarded = req.headers ? req.headers['x-forwarded-for'] : null;
  if (forwarded) {
    ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded[0];
  }
  if (!ip && req.ip) {
    ip = req.ip;
  }
  if (!ip && req.socket && req.socket.remoteAddress) {
    ip = req.socket.remoteAddress;
  }
  if (ip && typeof ip === 'string') {
    // Truncate to fit column VARCHAR(45)
    return ip.slice(0, 45);
  }
  return null;
}

/**
 * Extracts client user-agent string safely from an Express request object.
 * @param {object} req 
 * @returns {string|null}
 */
function extractUserAgent(req) {
  if (!req || !req.headers) return null;
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 500) : null;
}

/**
 * Records an audit log entry in student_portal_db.audit_logs.
 * Fail-safe: Never throws an error, ensuring business operations are never disrupted.
 * 
 * @param {object} params
 * @param {number|null} params.userId - Authenticated user's user_id (if available)
 * @param {string} params.action - Action name (e.g. 'LOGIN_SUCCESS', 'STUDENT_CREATED', 'REPORT_EXPORTED_CSV')
 * @param {string} params.entity - Entity type (e.g. 'AUTH', 'USER', 'STUDENT', 'REPORT')
 * @param {string|number|null} [params.entityId] - Target entity identifier
 * @param {string} [params.description] - Human-readable description
 * @param {object|string|null} [params.details] - Additional contextual details (will be sanitized)
 * @param {object|null} [params.metadata] - Extra metadata (will be sanitized)
 * @param {object|null} [params.req] - Express request object for IP & User-Agent capture
 * @returns {Promise<{success: boolean, logId?: number, error?: string}>}
 */
async function createAuditLog({
  userId = null,
  action,
  entity,
  entityId = null,
  description = '',
  details = null,
  metadata = null,
  req = null
}) {
  try {
    if (!action || !entity) {
      console.warn('[AuditService] Missing required action or entity for audit log');
      return { success: false, error: 'Action and entity are required' };
    }

    // Auto-detect userId and req if req is passed
    let effectiveUserId = userId;
    if (!effectiveUserId && req && req.user && req.user.user_id) {
      effectiveUserId = req.user.user_id;
    }

    const ipAddress = extractIpAddress(req);
    const userAgent = extractUserAgent(req);

    // Build structured details payload
    const structuredPayload = {
      description: typeof description === 'string' ? description : '',
      user_agent: userAgent,
      metadata: metadata ? sanitizeData(metadata) : undefined
    };

    if (details) {
      if (typeof details === 'object') {
        structuredPayload.details = sanitizeData(details);
      } else if (typeof details === 'string') {
        if (!structuredPayload.description) {
          structuredPayload.description = details;
        } else {
          structuredPayload.raw_details = details;
        }
      }
    }

    const detailsJson = JSON.stringify(structuredPayload);

    // Fit strictly into VARCHAR limits: action (50), entity (50), entity_id (50), ip_address (45)
    const safeAction = String(action).slice(0, 50);
    const safeEntity = String(entity).slice(0, 50);
    const safeEntityId = entityId !== null && entityId !== undefined ? String(entityId).slice(0, 50) : null;
    const safeIp = ipAddress ? String(ipAddress).slice(0, 45) : null;

    const [result] = await db.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, ip_address, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [effectiveUserId || null, safeAction, safeEntity, safeEntityId, safeIp, detailsJson]
    );

    return {
      success: true,
      logId: result.insertId
    };
  } catch (error) {
    // Fail-safe: NEVER throw or crash the main transaction
    console.error('[AuditService Error]: Failed to create audit log:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createAuditLog,
  sanitizeData,
  extractIpAddress,
  extractUserAgent
};
