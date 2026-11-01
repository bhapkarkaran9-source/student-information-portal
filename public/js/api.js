/**
 * Client API Client
 * Centralized fetch wrapper with automatic JWT Authorization header
 */

const API_BASE = '/api';

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const token = localStorage.getItem('token');

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(options.headers || {})
  };

  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const json = await response.json().catch(() => ({}));
    let data = json;
    if (json && typeof json === 'object' && json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
      data = { ...json.data, ...json, data: json.data };
    }
    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { message: error.message || 'Network communication error' }
    };
  }
}

// Convenience REST helpers for legacy module scripts
async function apiGet(endpoint) {
  const clean = endpoint.startsWith('/api') ? endpoint.substring(4) : endpoint;
  const res = await apiRequest(clean, { method: 'GET' });
  return res.data || {};
}

async function apiPost(endpoint, body) {
  const clean = endpoint.startsWith('/api') ? endpoint.substring(4) : endpoint;
  const res = await apiRequest(clean, { method: 'POST', body: JSON.stringify(body) });
  return res.data || {};
}

async function apiPut(endpoint, body) {
  const clean = endpoint.startsWith('/api') ? endpoint.substring(4) : endpoint;
  const res = await apiRequest(clean, { method: 'PUT', body: JSON.stringify(body) });
  return res.data || {};
}

async function apiDelete(endpoint) {
  const clean = endpoint.startsWith('/api') ? endpoint.substring(4) : endpoint;
  const res = await apiRequest(clean, { method: 'DELETE' });
  return res.data || {};
}

async function apiFetch(endpoint, options = {}) {
  const clean = endpoint.startsWith('/api') ? endpoint.substring(4) : endpoint;
  const method = (options.method || 'GET').toUpperCase();
  const res = await apiRequest(clean, { ...options, method });
  return res.data || {};
}

// Global API helper namespace
window.api = {
  get: apiGet,
  post: apiPost,
  put: apiPut,
  delete: apiDelete,
  fetch: apiFetch,
  request: apiRequest
};

// Global toast notification fallback
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer') || document.getElementById('adminSharedToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3500);
}

// Global resilient date/time formatting shims (Asia/Kolkata)
if (typeof window !== 'undefined') {
  if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = function (str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };
  }
  if (typeof window.parseDateSafe !== 'function') {
    window.parseDateSafe = function (input) {
      if (!input) return null;
      if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
      if (typeof input !== 'string') return null;
      const str = input.trim();
      if (!str) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [y, m, d] = str.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      }
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(str)) {
        return new Date(str.replace(' ', 'T') + '+05:30');
      }
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(str)) {
        return new Date(str + '+05:30');
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    };
  }
  if (typeof window.formatDate !== 'function') {
    window.formatDate = function (dateStr, options = {}) {
      const d = window.parseDateSafe(dateStr);
      if (!d) return '-';
      try {
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          ...options
        }).format(d);
      } catch (e) {
        return String(dateStr);
      }
    };
  }
  if (typeof window.formatDateTime !== 'function') {
    window.formatDateTime = function (dateStr, options = {}) {
      const d = window.parseDateSafe(dateStr);
      if (!d) return '-';
      try {
        const formatted = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          ...options
        }).format(d);
        return formatted.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
      } catch (e) {
        return String(dateStr);
      }
    };
  }
  if (typeof window.formatTime !== 'function') {
    window.formatTime = function (dateStr, options = {}) {
      const d = window.parseDateSafe(dateStr);
      if (!d) return '-';
      try {
        const formatted = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          ...options
        }).format(d);
        return formatted.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
      } catch (e) {
        return String(dateStr);
      }
    };
  }
  if (typeof window.formatDateTimeLocal !== 'function') {
    window.formatDateTimeLocal = function (dateStr) {
      const d = window.parseDateSafe(dateStr);
      if (!d) return '';
      try {
        const formatter = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata',
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
    };
  }
  if (typeof window.formatDateInput !== 'function') {
    window.formatDateInput = function (dateStr) {
      const d = window.parseDateSafe(dateStr);
      if (!d) return '';
      try {
        const formatter = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Kolkata',
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
    };
  }
}
