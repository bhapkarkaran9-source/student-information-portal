/**
 * Admin Email Management Controller - Student Information Portal
 * Manages system email status, live KPI statistics, filterable/paginated logs,
 * and delivery detail modals with zero exposure of credentials or secrets.
 */

(function () {
  'use strict';

  // State
  const state = {
    page: 1,
    limit: 25,
    search: '',
    status: '',
    emailType: '',
    totalPages: 1,
    totalLogs: 0,
    isLoading: false
  };

  // DOM Elements Cache
  const elements = {
    // Config Status
    systemStatusBadge: document.getElementById('emailSystemStatusBadge'),
    disabledNoticeBanner: document.getElementById('disabledNoticeBanner'),
    metaSmtpHost: document.getElementById('metaSmtpHost'),
    metaSmtpPort: document.getElementById('metaSmtpPort'),
    metaFromAddress: document.getElementById('metaFromAddress'),
    metaSmtpAuth: document.getElementById('metaSmtpAuth'),

    // KPIs
    kpiTotal: document.getElementById('kpiTotalEmails'),
    kpiSent: document.getElementById('kpiSentEmails'),
    kpiPending: document.getElementById('kpiPendingEmails'),
    kpiFailed: document.getElementById('kpiFailedEmails'),

    // Filters & Search
    searchInput: document.getElementById('searchInput'),
    searchClearBtn: document.getElementById('searchClearBtn'),
    filterStatus: document.getElementById('filterStatus'),
    filterType: document.getElementById('filterType'),
    filterLimit: document.getElementById('filterLimit'),
    btnResetFilters: document.getElementById('btnResetFilters'),
    btnRefresh: document.getElementById('btnRefreshData'),

    // Table & States
    tableWrapper: document.getElementById('tableWrapper'),
    tableBody: document.getElementById('emailLogsTableBody'),
    loadingState: document.getElementById('tableLoadingState'),
    emptyState: document.getElementById('tableEmptyState'),
    errorState: document.getElementById('tableErrorState'),
    btnRetryLoad: document.getElementById('btnRetryLoad'),

    // Pagination
    paginationInfo: document.getElementById('paginationInfo'),
    paginationIndicator: document.getElementById('paginationPageIndicator'),
    btnPrevPage: document.getElementById('btnPrevPage'),
    btnNextPage: document.getElementById('btnNextPage'),

    // Detail Modal
    modal: document.getElementById('emailDetailModal'),
    modalCloseBtn: document.getElementById('detailModalCloseBtn'),
    modalCloseBtnFooter: document.getElementById('detailModalCloseBtnFooter'),
    modalEmailIdBadge: document.getElementById('modalEmailIdBadge'),
    modalStatusBadge: document.getElementById('modalStatusBadge'),
    modalEmailType: document.getElementById('modalEmailType'),
    modalRecipient: document.getElementById('modalRecipient'),
    modalSubject: document.getElementById('modalSubject'),
    modalAssociatedUser: document.getElementById('modalAssociatedUser'),
    modalLogId: document.getElementById('modalLogId'),
    modalCreatedAt: document.getElementById('modalCreatedAt'),
    modalSentAt: document.getElementById('modalSentAt'),
    modalFailureContainer: document.getElementById('modalFailureContainer'),
    modalErrorMessage: document.getElementById('modalErrorMessage')
  };

  let searchTimeout = null;
  let lastActiveElement = null;

  /**
   * Helper: Retrieve JWT Token
   */
  function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }

  /**
   * Helper: Authenticated API Fetch
   */
  async function apiFetch(endpoint, options = {}) {
    const token = getToken();
    if (!token) {
      window.location.href = '/pages/auth/login.html';
      throw new Error('Unauthenticated');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    };

    const response = await fetch(endpoint, { ...options, headers });

    if (response.status === 401) {
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      window.location.href = '/pages/auth/login.html';
      throw new Error('Session expired');
    }

    if (response.status === 403) {
      window.location.href = '/pages/auth/login.html';
      throw new Error('Forbidden');
    }

    const json = await response.json();
    return { status: response.status, data: json };
  }

  /**
   * Helper: Formats Technical Email Types into Human-Friendly Labels
   */
  function formatEmailType(type) {
    if (!type) return 'General';
    const normalized = String(type).toUpperCase();
    const map = {
      'PASSWORD_CHANGED': 'Password Changed',
      'NEW_ACCOUNT': 'New Account',
      'PASSWORD_RESET': 'Password Reset',
      'NOTIFICATION': 'Notification'
    };
    if (map[normalized]) return map[normalized];
    return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Helper: Format Date String
   */
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return String(dateStr);
    }
  }

  /**
   * Helper: Escape HTML string to prevent XSS
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Helper: Render Status Badge HTML
   */
  function renderStatusBadge(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'SENT') {
      return '<span class="badge-status badge-sent">Sent</span>';
    } else if (s === 'FAILED') {
      return '<span class="badge-status badge-failed">Failed</span>';
    }
    return '<span class="badge-status badge-pending">Pending</span>';
  }

  /**
   * 1. Load Safe Email Configuration
   */
  async function loadEmailConfig() {
    try {
      const res = await apiFetch('/api/admin/email/config');
      if (res.status === 200 && res.data && res.data.data) {
        const config = res.data.data;

        // System Enabled / Disabled Status
        if (config.enabled) {
          elements.systemStatusBadge.textContent = 'ENABLED';
          elements.systemStatusBadge.className = 'status-pill status-pill-enabled';
          elements.disabledNoticeBanner.classList.add('hidden');
        } else {
          elements.systemStatusBadge.textContent = 'DISABLED';
          elements.systemStatusBadge.className = 'status-pill status-pill-disabled';
          elements.disabledNoticeBanner.classList.remove('hidden');
        }

        elements.metaSmtpHost.textContent = config.host || 'smtp.mailtrap.io';
        elements.metaSmtpPort.textContent = String(config.port || 2525);
        elements.metaFromAddress.textContent = config.from || 'Student Portal <noreply@studentportal.local>';
        elements.metaSmtpAuth.textContent = config.hasAuth ? 'Configured' : 'Not Configured';
        elements.metaSmtpAuth.style.color = config.hasAuth ? '#16a34a' : '#64748b';
      }
    } catch (err) {
      console.warn('Failed to load email config:', err.message);
      elements.systemStatusBadge.textContent = 'UNKNOWN';
    }
  }

  /**
   * 2. Load Email Delivery Statistics
   */
  async function loadEmailStats() {
    try {
      const res = await apiFetch('/api/admin/email/stats');
      if (res.status === 200 && res.data && res.data.data) {
        const stats = res.data.data;
        elements.kpiTotal.textContent = (stats.total || 0).toLocaleString();
        elements.kpiSent.textContent = (stats.sent || 0).toLocaleString();
        elements.kpiPending.textContent = (stats.pending || 0).toLocaleString();
        elements.kpiFailed.textContent = (stats.failed || 0).toLocaleString();
      }
    } catch (err) {
      console.warn('Failed to load email stats:', err.message);
    }
  }

  /**
   * 3. Load Email Logs Table with Pagination and Filtering
   */
  async function loadEmailLogs() {
    if (state.isLoading) return;
    state.isLoading = true;

    // Show loading state
    elements.loadingState.classList.remove('hidden');
    elements.emptyState.classList.add('hidden');
    elements.errorState.classList.add('hidden');
    elements.tableWrapper.classList.add('hidden');

    const params = new URLSearchParams({
      page: state.page,
      limit: state.limit
    });

    if (state.search.trim()) params.set('search', state.search.trim());
    if (state.status) params.set('status', state.status);
    if (state.emailType) params.set('email_type', state.emailType);

    try {
      const res = await apiFetch(`/api/admin/email/logs?${params.toString()}`);
      elements.loadingState.classList.add('hidden');

      if (res.status === 200 && res.data && res.data.data) {
        const { logs, pagination } = res.data.data;
        state.totalLogs = pagination?.total || 0;
        state.totalPages = pagination?.totalPages || 1;

        if (!logs || logs.length === 0) {
          elements.emptyState.classList.remove('hidden');
          updatePaginationUI();
          return;
        }

        renderTableRows(logs);
        elements.tableWrapper.classList.remove('hidden');
        updatePaginationUI();
      } else {
        elements.errorState.classList.remove('hidden');
      }
    } catch (err) {
      elements.loadingState.classList.add('hidden');
      elements.errorState.classList.remove('hidden');
    } finally {
      state.isLoading = false;
    }
  }

  /**
   * Render Table Rows
   */
  function renderTableRows(logs) {
    elements.tableBody.innerHTML = '';

    logs.forEach(log => {
      const tr = document.createElement('tr');
      const safeId = escapeHtml(log.email_log_id);
      const safeRecipient = escapeHtml(log.recipient_email);
      const safeType = escapeHtml(formatEmailType(log.email_type));
      const safeSubject = escapeHtml(log.subject);
      const safeCreated = escapeHtml(formatDate(log.created_at));
      const safeSent = escapeHtml(formatDate(log.sent_at));
      const statusBadge = renderStatusBadge(log.status);

      tr.innerHTML = `
        <td class="font-mono" style="font-weight: 600; color: #475569;">#${safeId}</td>
        <td class="font-mono font-medium" style="color: #0f172a;">${safeRecipient}</td>
        <td><span class="type-pill">${safeType}</span></td>
        <td class="font-medium" style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${safeSubject}">${safeSubject}</td>
        <td>${statusBadge}</td>
        <td style="color: #64748b; font-size: 12px;">${safeCreated}</td>
        <td style="color: #64748b; font-size: 12px;">${safeSent}</td>
        <td style="text-align: center;">
          <button type="button" class="btn-table-action btn-view-log" data-id="${safeId}">View</button>
        </td>
      `;

      elements.tableBody.appendChild(tr);
    });

    // Attach click handlers to View buttons
    elements.tableBody.querySelectorAll('.btn-view-log').forEach(btn => {
      btn.addEventListener('click', () => {
        const logId = btn.getAttribute('data-id');
        openDetailModal(logId, btn);
      });
    });
  }

  /**
   * Update Pagination UI
   */
  function updatePaginationUI() {
    const total = state.totalLogs;
    const page = state.page;
    const limit = state.limit;

    if (total === 0) {
      elements.paginationInfo.textContent = 'Showing 0 to 0 of 0 logs';
      elements.paginationIndicator.textContent = 'Page 1 of 1';
      elements.btnPrevPage.disabled = true;
      elements.btnNextPage.disabled = true;
      return;
    }

    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    elements.paginationInfo.textContent = `Showing ${start.toLocaleString()} to ${end.toLocaleString()} of ${total.toLocaleString()} logs`;
    elements.paginationIndicator.textContent = `Page ${page} of ${state.totalPages}`;

    elements.btnPrevPage.disabled = page <= 1;
    elements.btnNextPage.disabled = page >= state.totalPages;
  }

  /**
   * 4. Open and Render Email Log Details Modal
   */
  async function openDetailModal(logId, triggerBtn = null) {
    if (!logId) return;
    lastActiveElement = triggerBtn || document.activeElement;

    // Reset modal content
    elements.modalEmailIdBadge.textContent = `Log ID #${logId}`;
    elements.modalLogId.textContent = `#${logId}`;
    elements.modalStatusBadge.innerHTML = 'Loading...';
    elements.modalEmailType.textContent = '—';
    elements.modalRecipient.textContent = '—';
    elements.modalSubject.textContent = '—';
    elements.modalAssociatedUser.textContent = '—';
    elements.modalCreatedAt.textContent = '—';
    elements.modalSentAt.textContent = '—';
    elements.modalFailureContainer.classList.add('hidden');
    elements.modalErrorMessage.textContent = '';

    elements.modal.classList.remove('hidden');
    elements.modalCloseBtn.focus();

    try {
      const res = await apiFetch(`/api/admin/email/logs/${logId}`);
      if (res.status === 200 && res.data && res.data.data) {
        const log = res.data.data;

        elements.modalStatusBadge.innerHTML = renderStatusBadge(log.status);
        elements.modalEmailType.textContent = formatEmailType(log.email_type);
        elements.modalRecipient.textContent = log.recipient_email || '—';
        elements.modalSubject.textContent = log.subject || '—';
        elements.modalCreatedAt.textContent = formatDate(log.created_at);
        elements.modalSentAt.textContent = log.sent_at ? formatDate(log.sent_at) : 'Not sent yet (Pending / Failed)';

        // Associated user
        if (log.user_id) {
          elements.modalAssociatedUser.textContent = `${log.username || 'User'} (ID: ${log.user_id})`;
        } else {
          elements.modalAssociatedUser.textContent = 'None (Direct Notification)';
        }

        // Show failure box if status is FAILED
        if (String(log.status).toUpperCase() === 'FAILED') {
          elements.modalFailureContainer.classList.remove('hidden');
          elements.modalErrorMessage.textContent = log.error_message || 'No additional diagnostic details recorded.';
        } else {
          elements.modalFailureContainer.classList.add('hidden');
        }
      } else {
        elements.modalStatusBadge.innerHTML = '<span class="badge-status badge-failed">Error</span>';
        elements.modalErrorMessage.textContent = 'Failed to load details for this email log entry.';
        elements.modalFailureContainer.classList.remove('hidden');
      }
    } catch (err) {
      elements.modalStatusBadge.innerHTML = '<span class="badge-status badge-failed">Error</span>';
      elements.modalErrorMessage.textContent = 'Network or authorization error while retrieving log details.';
      elements.modalFailureContainer.classList.remove('hidden');
    }
  }

  /**
   * Close Detail Modal
   */
  function closeDetailModal() {
    elements.modal.classList.add('hidden');
    if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
      lastActiveElement.focus();
    }
  }

  /**
   * 5. Event Listeners Setup
   */
  function setupEventListeners() {
    // Search input (Debounced 300ms)
    elements.searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val.length > 0) {
        elements.searchClearBtn.classList.remove('hidden');
      } else {
        elements.searchClearBtn.classList.add('hidden');
      }

      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        state.search = val;
        state.page = 1;
        loadEmailLogs();
      }, 300);
    });

    // Clear search
    elements.searchClearBtn.addEventListener('click', () => {
      elements.searchInput.value = '';
      elements.searchClearBtn.classList.add('hidden');
      state.search = '';
      state.page = 1;
      loadEmailLogs();
      elements.searchInput.focus();
    });

    // Status filter
    elements.filterStatus.addEventListener('change', (e) => {
      state.status = e.target.value;
      state.page = 1;
      loadEmailLogs();
    });

    // Type filter
    elements.filterType.addEventListener('change', (e) => {
      state.emailType = e.target.value;
      state.page = 1;
      loadEmailLogs();
    });

    // Limit filter
    elements.filterLimit.addEventListener('change', (e) => {
      state.limit = parseInt(e.target.value, 10) || 25;
      state.page = 1;
      loadEmailLogs();
    });

    // Reset filters
    elements.btnResetFilters.addEventListener('click', () => {
      elements.searchInput.value = '';
      elements.searchClearBtn.classList.add('hidden');
      elements.filterStatus.value = '';
      elements.filterType.value = '';
      elements.filterLimit.value = '25';

      state.search = '';
      state.status = '';
      state.emailType = '';
      state.limit = 25;
      state.page = 1;

      loadEmailLogs();
    });

    // Refresh button
    elements.btnRefresh.addEventListener('click', () => {
      loadEmailConfig();
      loadEmailStats();
      loadEmailLogs();
    });

    // Retry load button
    elements.btnRetryLoad.addEventListener('click', () => {
      loadEmailLogs();
    });

    // Pagination buttons
    elements.btnPrevPage.addEventListener('click', () => {
      if (state.page > 1) {
        state.page--;
        loadEmailLogs();
      }
    });

    elements.btnNextPage.addEventListener('click', () => {
      if (state.page < state.totalPages) {
        state.page++;
        loadEmailLogs();
      }
    });

    // Modal Close buttons
    elements.modalCloseBtn.addEventListener('click', closeDetailModal);
    elements.modalCloseBtnFooter.addEventListener('click', closeDetailModal);

    // Modal backdrop click
    elements.modal.addEventListener('click', (e) => {
      if (e.target === elements.modal) {
        closeDetailModal();
      }
    });

    // Keyboard accessibility: Escape key closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !elements.modal.classList.contains('hidden')) {
        closeDetailModal();
      }
    });
  }

  /**
   * Initialize Module
   */
  async function init() {
    setupEventListeners();
    await Promise.all([
      loadEmailConfig(),
      loadEmailStats(),
      loadEmailLogs()
    ]);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
