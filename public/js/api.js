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
