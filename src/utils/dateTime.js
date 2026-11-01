/**
 * Date and Time Utility - Asia/Kolkata (IST, UTC+05:30)
 * Standardizes date/time storage, parsing, and formatting across the entire portal.
 */

const TIMEZONE_KOLKATA = 'Asia/Kolkata';

/**
 * Check if a value is a valid date string or Date object
 * @param {any} val
 * @returns {boolean}
 */
const isValidDate = (val) => {
  if (!val) return false;
  if (val instanceof Date) return !isNaN(val.getTime());
  const d = new Date(val);
  return !isNaN(d.getTime());
};

/**
 * Format a Date object into parts according to Asia/Kolkata timezone
 * @param {Date} dateObj
 * @returns {{ year: string, month: string, day: string, hour: string, minute: string, second: string }}
 */
const getKolkataParts = (dateObj) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE_KOLKATA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(dateObj);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = p.value;
    }
  }

  // Handle case where hour might be "24" in en-GB hour12:false edge case
  if (map.hour === '24') {
    map.hour = '00';
  }

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour || '00',
    minute: map.minute || '00',
    second: map.second || '00'
  };
};

/**
 * Convert user input (from datetime-local, date picker, ISO string, or Date)
 * into a MySQL DATETIME format string in Asia/Kolkata: "YYYY-MM-DD HH:mm:ss".
 *
 * CRITICAL RULE:
 * If the input is from an HTML `<input type="datetime-local">` (e.g. "2026-11-02T01:09"
 * or "2026-11-02 01:09"), it represents the user's intended local wall-clock time in IST.
 * We must preserve this exact date and time without subtracting UTC offsets!
 *
 * @param {string|Date|null|undefined} val
 * @returns {string|null} "YYYY-MM-DD HH:mm:ss"
 */
const toMySQLDateTime = (val) => {
  if (!val) return null;

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;

    // Pattern 1: Wall-clock datetime without timezone: "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD HH:mm" or "YYYY-MM-DDTHH:mm:ss"
    const wallClockMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (wallClockMatch) {
      const [, y, m, d, hh, mm, ss] = wallClockMatch;
      return `${y}-${m}-${d} ${hh}:${mm}:${ss || '00'}`;
    }

    // Pattern 2: Date only "YYYY-MM-DD"
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, y, m, d] = dateOnlyMatch;
      return `${y}-${m}-${d} 00:00:00`;
    }

    // Pattern 3: String with timezone (e.g. "2026-11-01T19:39:00.000Z" or "2026-11-02T01:09:00+05:30")
    const dObj = new Date(trimmed);
    if (isNaN(dObj.getTime())) return null;
    const kp = getKolkataParts(dObj);
    return `${kp.year}-${kp.month}-${kp.day} ${kp.hour}:${kp.minute}:${kp.second}`;
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const kp = getKolkataParts(val);
    return `${kp.year}-${kp.month}-${kp.day} ${kp.hour}:${kp.minute}:${kp.second}`;
  }

  return null;
};

/**
 * Format a database DATETIME / TIMESTAMP / Date into an ISO 8601 string
 * with explicit +05:30 offset for API responses: "YYYY-MM-DDTHH:mm:ss+05:30"
 *
 * @param {string|Date|null|undefined} val
 * @returns {string|null}
 */
const toISTIsoString = (val) => {
  if (!val) return null;

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;

    // If it's already a full ISO string with +05:30 offset, return it
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/.test(trimmed)) {
      return trimmed;
    }

    // If it's a MySQL DATETIME string like "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss"
    const wallClockMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (wallClockMatch) {
      const [, y, m, d, hh, mm, ss] = wallClockMatch;
      return `${y}-${m}-${d}T${hh}:${mm}:${ss || '00'}+05:30`;
    }

    // Date only "YYYY-MM-DD"
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, y, m, d] = dateOnlyMatch;
      return `${y}-${m}-${d}T00:00:00+05:30`;
    }

    // Parse as general date (e.g. UTC ISO string)
    const dObj = new Date(trimmed);
    if (isNaN(dObj.getTime())) return null;
    const kp = getKolkataParts(dObj);
    return `${kp.year}-${kp.month}-${kp.day}T${kp.hour}:${kp.minute}:${kp.second}+05:30`;
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const kp = getKolkataParts(val);
    return `${kp.year}-${kp.month}-${kp.day}T${kp.hour}:${kp.minute}:${kp.second}+05:30`;
  }

  return null;
};

/**
 * Convert any date value to "YYYY-MM-DD" in Asia/Kolkata
 * @param {string|Date|null|undefined} val
 * @returns {string|null}
 */
const toISTDateString = (val) => {
  if (!val) return null;
  if (typeof val === 'string') {
    const match = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[0];
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    const kp = getKolkataParts(d);
    return `${kp.year}-${kp.month}-${kp.day}`;
  }
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const kp = getKolkataParts(val);
    return `${kp.year}-${kp.month}-${kp.day}`;
  }
  return null;
};

/**
 * Human-readable format helper in Asia/Kolkata
 * @param {string|Date|null|undefined} val
 * @param {Intl.DateTimeFormatOptions} options
 * @returns {string}
 */
const formatKolkata = (val, options = {}) => {
  if (!val) return '';
  const isoStr = toISTIsoString(val);
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const defaultOpts = {
    timeZone: TIMEZONE_KOLKATA,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options
  };
  return new Intl.DateTimeFormat('en-US', defaultOpts).format(d);
};

module.exports = {
  TIMEZONE_KOLKATA,
  isValidDate,
  getKolkataParts,
  toMySQLDateTime,
  toISTIsoString,
  toISTDateString,
  formatKolkata
};
