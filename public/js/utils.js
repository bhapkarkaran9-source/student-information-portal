/**
 * Frontend Utility Functions - Student Information Portal
 * Standardized for Asia/Kolkata (IST, UTC+05:30)
 */

const TIMEZONE_KOLKATA = 'Asia/Kolkata';

// Escape HTML to prevent XSS when inserting dynamic text
function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Safely parse date inputs (string, Date, timestamp) into a reliable Date object.
 * Prevents UTC off-by-one shifts on date-only strings and handles space-separated SQL datetimes.
 */
function parseDateSafe(input) {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input !== 'string') return null;
  const str = input.trim();
  if (!str) return null;

  // Handle "YYYY-MM-DD" date-only strings
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    // Parse at noon UTC to prevent date boundary shifts in any browser environment
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }

  // Handle MySQL DATETIME "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD HH:mm" without offset
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(str)) {
    return new Date(str.replace(' ', 'T') + '+05:30');
  }

  // Handle "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DDTHH:mm" without offset
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(str)) {
    return new Date(str + '+05:30');
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format date for display in Asia/Kolkata (IST)
 * Output default: "02 Nov 2026"
 * @param {string|Date} dateStr
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
function formatDate(dateStr, options = {}) {
  const d = parseDateSafe(dateStr);
  if (!d) return '-';
  try {
    const defaultOpts = {
      timeZone: TIMEZONE_KOLKATA,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...options
    };
    return new Intl.DateTimeFormat('en-GB', defaultOpts).format(d);
  } catch (e) {
    return String(dateStr);
  }
}

/**
 * Format date and time for display in Asia/Kolkata (IST)
 * Output default: "02 Nov 2026, 01:09 AM"
 * @param {string|Date} dateStr
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
function formatDateTime(dateStr, options = {}) {
  const d = parseDateSafe(dateStr);
  if (!d) return '-';
  try {
    const defaultOpts = {
      timeZone: TIMEZONE_KOLKATA,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...options
    };
    const formatted = new Intl.DateTimeFormat('en-GB', defaultOpts).format(d);
    // Standardize AM/PM casing
    return formatted.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
  } catch (e) {
    return String(dateStr);
  }
}

/**
 * Format time only for display in Asia/Kolkata (IST)
 * Output default: "01:09 AM"
 * @param {string|Date} timeStr
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
function formatTime(timeStr, options = {}) {
  if (!timeStr) return '-';
  // If time string is "HH:mm" or "HH:mm:ss"
  if (typeof timeStr === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(timeStr.trim())) {
    const [hh, mm] = timeStr.trim().split(':').map(Number);
    const period = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${period}`;
  }

  const d = parseDateSafe(timeStr);
  if (!d) return '-';
  try {
    const defaultOpts = {
      timeZone: TIMEZONE_KOLKATA,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...options
    };
    const formatted = new Intl.DateTimeFormat('en-GB', defaultOpts).format(d);
    return formatted.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
  } catch (e) {
    return String(timeStr);
  }
}

/**
 * Convert any date/datetime into "YYYY-MM-DDTHH:mm" for <input type="datetime-local">
 * Ensures edit forms populate the EXACT previously selected date and time without offset shift.
 * @param {string|Date} dateStr
 * @returns {string}
 */
function formatDateTimeLocal(dateStr) {
  const d = parseDateSafe(dateStr);
  if (!d) return '';
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE_KOLKATA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    const map = {};
    for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
    if (map.hour === '24') map.hour = '00';
    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
  } catch (e) {
    return '';
  }
}

/**
 * Convert any date/datetime into "YYYY-MM-DD" for <input type="date">
 * @param {string|Date} dateStr
 * @returns {string}
 */
function formatDateInput(dateStr) {
  const d = parseDateSafe(dateStr);
  if (!d) return '';
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE_KOLKATA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    const map = {};
    for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
    return `${map.year}-${map.month}-${map.day}`;
  } catch (e) {
    return '';
  }
}

// Explicitly assign to window in browser environments
if (typeof window !== 'undefined') {
  window.TIMEZONE_KOLKATA = TIMEZONE_KOLKATA;
  window.escapeHtml = escapeHtml;
  window.parseDateSafe = parseDateSafe;
  window.formatDate = formatDate;
  window.formatDateTime = formatDateTime;
  window.formatTime = formatTime;
  window.formatDateTimeLocal = formatDateTimeLocal;
  window.formatDateInput = formatDateInput;
}

// Export for Node/CommonJS environments if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TIMEZONE_KOLKATA,
    escapeHtml,
    parseDateSafe,
    formatDate,
    formatDateTime,
    formatTime,
    formatDateTimeLocal,
    formatDateInput
  };
}
