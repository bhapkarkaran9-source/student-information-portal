/**
 * Rate Limiting Middleware for Biometric Face Authentication
 * Student Information Portal
 * Sliding-window in-memory protection against repeated brute-force probes.
 * Does NOT lock user accounts. Does NOT impact password login.
 */

const { errorResponse } = require('../utils/response');

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 15; // Max 15 attempts per IP per minute
const ipLog = new Map();

// Periodic prune every 2 minutes to prevent memory accumulation
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of ipLog.entries()) {
    const valid = timestamps.filter(t => (now - t) < WINDOW_MS);
    if (valid.length === 0) {
      ipLog.delete(ip);
    } else {
      ipLog.set(ip, valid);
    }
  }
}, 2 * 60 * 1000).unref();

const faceLoginRateLimiter = (req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.ip || 'unknown_ip';
  const now = Date.now();

  const history = ipLog.get(ip) || [];
  const activeHistory = history.filter(t => (now - t) < WINDOW_MS);

  if (activeHistory.length >= MAX_ATTEMPTS) {
    return errorResponse(
      res,
      429,
      'Too many face login attempts. Please wait a moment and try again.'
    );
  }

  activeHistory.push(now);
  ipLog.set(ip, activeHistory);
  next();
};

module.exports = {
  faceLoginRateLimiter,
  _ipLog: ipLog
};
