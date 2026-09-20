/**
 * Global Express Error Handling Middleware
 * 
 * Intercepts uncaught exceptions and unhandled asynchronous rejections
 * across the Express 5 application, ensuring client responses are
 * strictly sanitised JSON with zero leakage of internals, stack traces,
 * database errors, filesystem paths, or sensitive credentials.
 *
 * Signature: (err, req, res, next)
 */

const errorHandler = (err, req, res, next) => {
  // If headers were already sent to the client, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Safe server-side logging without leaking request payload or sensitive headers
  const method = req.method || 'UNKNOWN';
  const url = req.originalUrl || req.url || 'unknown';
  console.error(`[Unhandled Error] ${method} ${url}:`, err && err.message ? err.message : err);
  if (err && err.stack) {
    console.error(err.stack);
  }

  // Handle Body-Parser / JSON syntax errors (e.g. malformed JSON payloads)
  if (err instanceof SyntaxError && (err.status === 400 || err.statusCode === 400) && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON in request body'
    });
  }

  // Handle Multer upload errors if unhandled by route upload middleware
  if (err && err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File size exceeds maximum allowed limit'
      : (err.message || 'File upload error');
    return res.status(400).json({
      success: false,
      message
    });
  }

  // Determine safe HTTP status code
  const rawStatus = err.status || err.statusCode;
  const statusCode = (typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus < 600)
    ? rawStatus
    : 500;

  // 4xx Client Errors: provide clean client message if safe, without internal details
  if (statusCode >= 400 && statusCode < 500) {
    const isSafeMessage = typeof err.message === 'string' &&
      !err.message.includes('SQL') &&
      !/\n\s*at\s+/.test(err.message) &&
      !err.message.includes('/') &&
      !err.message.includes('\\');

    return res.status(statusCode).json({
      success: false,
      message: isSafeMessage ? err.message : 'Bad Request'
    });
  }

  // 5xx Server / Internal Errors: strictly uniform sanitised response
  return res.status(500).json({
    success: false,
    message: 'Internal Server Error'
  });
};

module.exports = {
  errorHandler
};
