const nodemailer = require('nodemailer');
const emailModel = require('../models/email.model');
const { renderTemplate, hasTemplate } = require('./emailTemplates');

/**
 * Standard Email Regex for strict recipient validation
 */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Sensitive substrings to redact from any outgoing error message
 */
const SENSITIVE_PATTERNS = [
  /:\/\/[^:]+:[^@]+@/g, // URL credentials e.g. smtp://user:pass@host
  /password\s*[:=]\s*[^\s]+/gi,
  /auth\s*[:=]\s*[^\s]+/gi,
  /token\s*[:=]\s*[^\s]+/gi,
  /jwt\s*[:=]\s*[^\s]+/gi
];

/**
 * Strips secrets, passwords, and sensitive connection strings from error text.
 * @param {Error|string} error 
 * @returns {string} Safe, sanitized error string
 */
function sanitizeErrorMessage(error) {
  if (!error) return 'Unknown email error';
  let message = typeof error === 'string' ? error : (error.message || String(error));

  // Redact known environment secrets if defined
  if (process.env.SMTP_PASSWORD && process.env.SMTP_PASSWORD.trim()) {
    message = message.split(process.env.SMTP_PASSWORD).join('[REDACTED]');
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) {
    message = message.split(process.env.JWT_SECRET).join('[REDACTED]');
  }

  // Redact credential patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    message = message.replace(pattern, '[REDACTED]');
  }

  return message.slice(0, 1000);
}

/**
 * Retrieves safe email configuration metadata without exposing credentials.
 * @returns {object}
 */
function getEmailConfig() {
  return {
    enabled: String(process.env.EMAIL_ENABLED).toLowerCase() === 'true',
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT, 10) || 2525,
    from: process.env.EMAIL_FROM || 'Student Portal <noreply@studentportal.local>',
    hasAuth: Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD)
  };
}

/**
 * Creates a standard Nodemailer transporter from environment variables.
 * @returns {import('nodemailer').Transporter}
 */
function createDefaultTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.mailtrap.io';
  const port = parseInt(process.env.SMTP_PORT, 10) || 2525;
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASSWORD || '';

  const config = {
    host,
    port,
    secure: port === 465,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000
  };

  if (user && pass) {
    config.auth = { user, pass };
  }

  return nodemailer.createTransport(config);
}

/**
 * Validates a recipient email address.
 * @param {string} email 
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Sends a raw HTML/text email and manages database logging lifecycle:
 * Request -> PENDING log -> SMTP send -> SENT / FAILED.
 * 
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} html - HTML email body
 * @param {string} [text] - Plain text email body fallback
 * @param {object} [options={}] - Additional options (userId, emailType, transporterOverride, forceSend)
 * @returns {Promise<{ success: boolean, logId?: number, status: string, error?: string, messageId?: string }>}
 */
async function sendEmail(to, subject, html, text = '', options = {}) {
  const recipient = String(to || '').trim();

  // 1. Recipient Validation
  if (!isValidEmail(recipient)) {
    return {
      success: false,
      status: 'FAILED',
      error: 'Invalid recipient email address format'
    };
  }

  const emailType = options.emailType || 'GENERAL';
  const userId = options.userId || null;
  const safeSubject = String(subject || 'Notification').trim().slice(0, 255);
  const fromAddress = options.from || process.env.EMAIL_FROM || 'Student Portal <noreply@studentportal.local>';

  // 2. Create initial PENDING database log
  let logId = null;
  const eventKey = options.eventKey || options.event_key || null;
  try {
    const logRecord = await emailModel.createEmailLog({
      recipient_email: recipient,
      user_id: userId,
      email_type: emailType,
      subject: safeSubject,
      status: 'PENDING',
      error_message: null,
      event_key: eventKey
    });
    logId = logRecord.email_log_id;
  } catch (logErr) {
    if (logErr.code === 'ER_DUP_ENTRY' || (logErr.message && logErr.message.includes('uk_email_logs_event_key'))) {
      return {
        success: false,
        duplicate: true,
        status: 'DUPLICATE',
        message: `Duplicate email prevented by event deduplication: ${eventKey || 'duplicate'}`
      };
    }
    // Fail-safe: if log creation fails, abort safely
    return {
      success: false,
      status: 'FAILED',
      error: `Failed to initialize email log: ${sanitizeErrorMessage(logErr)}`
    };
  }

  // 3. Respect EMAIL_ENABLED flag
  const isEnabled = String(process.env.EMAIL_ENABLED).toLowerCase() === 'true';
  if (!isEnabled && !options.forceSend) {
    // Outbound transmission is disabled. Log remains recorded as PENDING.
    return {
      success: false,
      sent: false,
      disabled: true,
      logId,
      status: 'PENDING',
      message: 'Email sending disabled (EMAIL_ENABLED is false). Log saved as PENDING.'
    };
  }

  // 4. Outbound transmission via Nodemailer
  const transporter = options.transporterOverride || createDefaultTransporter();

  try {
    const mailOptions = {
      from: fromAddress,
      to: recipient,
      subject: safeSubject,
      html: html,
      text: text || html.replace(/<[^>]+>/g, ' ').trim()
    };

    const info = await transporter.sendMail(mailOptions);

    // 5. On success: update status to SENT
    await emailModel.markEmailSent(logId);

    return {
      success: true,
      sent: true,
      logId,
      status: 'SENT',
      messageId: info.messageId || null
    };
  } catch (sendErr) {
    // 6. On failure: sanitize error and update status to FAILED
    const safeError = sanitizeErrorMessage(sendErr);
    await emailModel.markEmailFailed(logId, safeError);

    return {
      success: false,
      sent: false,
      logId,
      status: 'FAILED',
      error: safeError
    };
  }
}

/**
 * Sends an email using a standardized pre-configured template with variable escaping.
 * 
 * @param {string} to - Recipient email address
 * @param {string} templateName - Template identifier ('PASSWORD_CHANGED', 'NEW_ACCOUNT', etc.)
 * @param {object} variables - Template dynamic variables (automatically HTML-escaped)
 * @param {object} [options={}] - Additional options (userId, transporterOverride, forceSend)
 * @returns {Promise<{ success: boolean, logId?: number, status: string, error?: string }>}
 */
async function sendTemplateEmail(to, templateName, variables = {}, options = {}) {
  const templateKey = String(templateName || '').toUpperCase();

  if (!hasTemplate(templateKey)) {
    return {
      success: false,
      status: 'FAILED',
      error: `Invalid email template: '${templateName}'`
    };
  }

  try {
    const rendered = renderTemplate(templateKey, variables);
    return await sendEmail(to, rendered.subject, rendered.html, rendered.text, {
      ...options,
      emailType: templateKey
    });
  } catch (err) {
    return {
      success: false,
      status: 'FAILED',
      error: sanitizeErrorMessage(err)
    };
  }
}

module.exports = {
  sendEmail,
  sendTemplateEmail,
  isValidEmail,
  getEmailConfig,
  sanitizeErrorMessage,
  createDefaultTransporter
};
