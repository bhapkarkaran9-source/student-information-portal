/**
 * Admin Audit Logs & System Activity Script
 * Student Information Portal
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. AUTHENTICATION & SESSION GUARD
  // ==========================================================================
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');

  if (!token || !userStr) {
    window.location.replace('/login.html');
    return;
  }

  let currentUser = null;
  try {
    currentUser = JSON.parse(userStr);
  } catch (e) {
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('/login.html');
    return;
  }

  if (!currentUser || currentUser.role !== 'ADMIN') {
    window.location.replace('/login.html');
    return;
  }

  // Populate topbar profile
  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserRole = document.getElementById('topbarUserRole');
  const topbarAvatar = document.getElementById('topbarAvatar');
  if (topbarUserName) {
    topbarUserName.textContent = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.username;
  }
  if (topbarUserRole) {
    topbarUserRole.textContent = currentUser.role;
  }
  if (topbarAvatar) {
    const initial = (currentUser.first_name ? currentUser.first_name[0] : (currentUser.username ? currentUser.username[0] : 'A')).toUpperCase();
    const fullName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.username;
    if (typeof window.renderAvatarElement === 'function') {
      window.renderAvatarElement(topbarAvatar, currentUser.profile_photo_url, initial, fullName + ' avatar');
    } else {
      topbarAvatar.textContent = initial;
    }
  }

  // Logout handler
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
      } catch (e) {
        // Continue clearing session regardless
      }
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/login.html');
    });
  }

  // Sidebar toggle for mobile
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
  const adminSidebar = document.getElementById('adminSidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  if (sidebarToggleBtn && adminSidebar) {
    sidebarToggleBtn.addEventListener('click', () => {
      adminSidebar.classList.toggle('open');
      if (sidebarBackdrop) sidebarBackdrop.classList.toggle('hidden');
    });
  }
  if (sidebarCloseBtn && adminSidebar) {
    sidebarCloseBtn.addEventListener('click', () => {
      adminSidebar.classList.remove('open');
      if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
    });
  }
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', () => {
      if (adminSidebar) adminSidebar.classList.remove('open');
      sidebarBackdrop.classList.add('hidden');
    });
  }

  // ==========================================================================
  // 2. TOAST NOTIFICATIONS
  // ==========================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      padding: 12px 20px;
      margin-bottom: 8px;
      border-radius: 6px;
      color: #fff;
      font-size: 0.9rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: opacity 0.3s ease;
      background-color: ${type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#7c3aed')};
    `;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ==========================================================================
  // 3. UI STATE & ELEMENTS
  // ==========================================================================
  let currentPage = 1;
  let pageSize = 25;
  let totalRecords = 0;
  let totalPages = 1;
  let currentLogs = [];

  // Filter elements
  const filterSearch = document.getElementById('filterSearch');
  const filterAction = document.getElementById('filterAction');
  const filterEntity = document.getElementById('filterEntity');
  const filterDateFrom = document.getElementById('filterDateFrom');
  const filterDateTo = document.getElementById('filterDateTo');
  const btnApplyFilters = document.getElementById('btnApplyFilters');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnRefresh = document.getElementById('btnRefresh');

  // KPI elements
  const kpiTotalLogs = document.getElementById('kpiTotalLogs');
  const kpiTodayActivity = document.getElementById('kpiTodayActivity');
  const kpiLoginActivity = document.getElementById('kpiLoginActivity');
  const kpiDataChanges = document.getElementById('kpiDataChanges');

  // Table elements
  const auditLogsTbody = document.getElementById('auditLogsTbody');
  const tableRecordCount = document.getElementById('tableRecordCount');

  // Pagination elements
  const paginationStart = document.getElementById('paginationStart');
  const paginationEnd = document.getElementById('paginationEnd');
  const paginationTotal = document.getElementById('paginationTotal');
  const selectPageSize = document.getElementById('selectPageSize');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');
  const pageIndicator = document.getElementById('pageIndicator');

  // Modal elements
  const auditDetailModal = document.getElementById('auditDetailModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalCloseFooterBtn = document.getElementById('modalCloseFooterBtn');
  const modalAuditId = document.getElementById('modalAuditId');
  const modalTimestamp = document.getElementById('modalTimestamp');
  const modalUser = document.getElementById('modalUser');
  const modalAction = document.getElementById('modalAction');
  const modalEntity = document.getElementById('modalEntity');
  const modalEntityId = document.getElementById('modalEntityId');
  const modalDescription = document.getElementById('modalDescription');
  const modalIpAddress = document.getElementById('modalIpAddress');
  const modalUserAgent = document.getElementById('modalUserAgent');
  const modalRawDetails = document.getElementById('modalRawDetails');

  // ==========================================================================
  // 4. BADGE FORMATTER
  // ==========================================================================
  function getActionBadge(action) {
    const act = String(action || '').toUpperCase();
    let badgeClass = 'erp-badge-neutral';

    if (act === 'LOGIN_SUCCESS') {
      badgeClass = 'erp-badge-success';
    } else if (act === 'LOGIN_FAILED') {
      badgeClass = 'erp-badge-danger';
    } else if (act === 'LOGOUT') {
      badgeClass = 'erp-badge-neutral';
    } else if (act.includes('CREATE')) {
      badgeClass = 'erp-badge-primary';
    } else if (act.includes('UPDATE') || act.includes('ACTIVATE') || act.includes('REPLY')) {
      badgeClass = 'erp-badge-warning';
    } else if (act.includes('DELETE')) {
      badgeClass = 'erp-badge-danger';
    } else if (act.includes('RESOLV') || act.includes('CLOSE')) {
      badgeClass = 'erp-badge-success';
    } else if (act.includes('EXPORT')) {
      badgeClass = 'erp-badge-info';
    } else if (act.includes('NOTIFICATION')) {
      badgeClass = 'erp-badge-primary';
    }

    return `<span class="erp-badge ${badgeClass}" style="font-family: ui-monospace, monospace; font-size: 11px;">${escapeHtml(act)}</span>`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (e) {
      return dateStr;
    }
  }

  // ==========================================================================
  // 5. FETCH AUDIT LOGS
  // ==========================================================================
  async function fetchLogs() {
    try {
      auditLogsTbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center" style="padding: 30px;">
            <p class="text-muted">Loading audit entries...</p>
          </td>
        </tr>
      `;

      const params = new URLSearchParams();
      params.append('page', currentPage);
      params.append('limit', pageSize);

      if (filterSearch && filterSearch.value.trim()) {
        params.append('search', filterSearch.value.trim());
      }
      if (filterAction && filterAction.value.trim()) {
        params.append('action', filterAction.value.trim());
      }
      if (filterEntity && filterEntity.value.trim()) {
        params.append('entity', filterEntity.value.trim());
      }
      if (filterDateFrom && filterDateFrom.value.trim()) {
        params.append('date_from', filterDateFrom.value.trim());
      }
      if (filterDateTo && filterDateTo.value.trim()) {
        params.append('date_to', filterDateTo.value.trim());
      }

      const res = await fetch(`/api/audit-logs?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace('/login.html');
        return;
      }

      if (res.status === 403) {
        alert('Access Denied: Only administrators can view audit logs.');
        window.location.replace('/pages/admin/dashboard.html');
        return;
      }

      const json = await res.json();
      if (!json.success) {
        showToast(json.message || 'Failed to load audit logs', 'error');
        renderEmpty('Error loading audit records');
        return;
      }

      currentLogs = json.data || [];
      const pagination = json.pagination || { page: 1, limit: pageSize, totalRecords: 0, totalPages: 1 };
      const kpis = json.kpis || { totalLogs: 0, todayActivity: 0, loginActivity: 0, dataChanges: 0 };

      // Update KPIs
      if (kpiTotalLogs) kpiTotalLogs.textContent = kpis.totalLogs.toLocaleString();
      if (kpiTodayActivity) kpiTodayActivity.textContent = kpis.todayActivity.toLocaleString();
      if (kpiLoginActivity) kpiLoginActivity.textContent = kpis.loginActivity.toLocaleString();
      if (kpiDataChanges) kpiDataChanges.textContent = kpis.dataChanges.toLocaleString();

      // Update Pagination state
      totalRecords = pagination.totalRecords;
      totalPages = pagination.totalPages;
      currentPage = pagination.page;

      renderTable();
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      showToast('Network error while fetching audit logs', 'error');
      renderEmpty('Network error loading audit logs');
    }
  }

  // ==========================================================================
  // 6. RENDER TABLE & PAGINATION
  // ==========================================================================
  function renderTable() {
    if (!currentLogs || currentLogs.length === 0) {
      renderEmpty('No audit log entries found matching current criteria.');
      updatePaginationControls(0, 0, 0);
      return;
    }

    const startIdx = (currentPage - 1) * pageSize + 1;
    const endIdx = Math.min(currentPage * pageSize, totalRecords);
    updatePaginationControls(startIdx, endIdx, totalRecords);

    auditLogsTbody.innerHTML = currentLogs.map((log) => {
      const userDisplay = log.username ? (log.role_name ? `${escapeHtml(log.username)} <span class="text-muted" style="font-size:0.75rem;">(${escapeHtml(log.role_name)})</span>` : escapeHtml(log.username)) : 'System';
      const entityIdDisplay = log.entity_id ? `<span style="font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">#${escapeHtml(log.entity_id)}</span>` : '-';
      const ipDisplay = log.ip_address ? `<span style="font-family: monospace; font-size: 0.8rem;">${escapeHtml(log.ip_address)}</span>` : '<span class="text-muted">-</span>';
      const descDisplay = log.description ? escapeHtml(log.description) : '<span class="text-muted">-</span>';

      return `
        <tr>
          <td style="font-size: 0.85rem; color: #64748b; white-space: nowrap;">${formatDateTime(log.created_at)}</td>
          <td style="font-weight: 600; color: #0f172a;">${userDisplay}</td>
          <td>${getActionBadge(log.action)}</td>
          <td><span class="erp-badge erp-badge-neutral">${escapeHtml(log.entity || log.entity_type)}</span></td>
          <td>${entityIdDisplay}</td>
          <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #334155;" title="${escapeHtml(log.description || '')}">${descDisplay}</td>
          <td style="color: #64748b;">${ipDisplay}</td>
          <td style="text-align: center;">
            <button type="button" class="btn-row-action btn-view-log" data-id="${log.log_id || log.audit_id}" title="View Log Details">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach click listeners to View buttons
    document.querySelectorAll('.btn-view-log').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openDetailModal(id);
      });
    });
  }

  function renderEmpty(msg) {
    auditLogsTbody.innerHTML = `
      <tr>
        <td colspan="8" style="padding: 40px 16px;">
          <div class="erp-empty-state">
            <div class="erp-empty-icon">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <div class="erp-empty-title">No audit records found</div>
            <div class="erp-empty-desc">${escapeHtml(msg)}</div>
          </div>
        </td>
      </tr>
    `;
    if (tableRecordCount) tableRecordCount.textContent = 'Showing 0 records';
  }

  function updatePaginationControls(start, end, total) {
    if (paginationStart) paginationStart.textContent = start;
    if (paginationEnd) paginationEnd.textContent = end;
    if (paginationTotal) paginationTotal.textContent = total;
    if (tableRecordCount) tableRecordCount.textContent = `Showing ${total} record${total === 1 ? '' : 's'}`;
    if (pageIndicator) pageIndicator.textContent = `Page ${currentPage} of ${totalPages || 1}`;

    if (btnPrevPage) btnPrevPage.disabled = currentPage <= 1;
    if (btnNextPage) btnNextPage.disabled = currentPage >= totalPages || total === 0;
  }

  // ==========================================================================
  // 7. DETAIL MODAL HANDLER
  // ==========================================================================
  async function openDetailModal(logId) {
    const log = currentLogs.find((l) => String(l.log_id || l.audit_id) === String(logId));
    if (!log) {
      showToast('Log entry not found in active dataset', 'error');
      return;
    }

    if (modalAuditId) modalAuditId.textContent = `#${log.log_id || log.audit_id}`;
    if (modalTimestamp) modalTimestamp.textContent = formatDateTime(log.created_at);
    if (modalUser) {
      modalUser.textContent = log.user_id ? `${log.full_name || log.username} (${log.username}) - User ID #${log.user_id} [${log.role_name || 'N/A'}]` : 'System / Unauthenticated';
    }
    if (modalAction) modalAction.innerHTML = getActionBadge(log.action);
    if (modalEntity) modalEntity.textContent = log.entity || log.entity_type || '-';
    if (modalEntityId) modalEntityId.textContent = log.entity_id ? `#${log.entity_id}` : '-';
    if (modalDescription) modalDescription.textContent = log.description || '-';
    if (modalIpAddress) modalIpAddress.textContent = log.ip_address || '-';
    if (modalUserAgent) modalUserAgent.textContent = log.user_agent || '-';

    if (modalRawDetails) {
      if (log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0) {
        modalRawDetails.textContent = JSON.stringify(log.details, null, 2);
      } else {
        modalRawDetails.textContent = log.details ? String(log.details) : '(No additional metadata)';
      }
    }

    if (auditDetailModal) {
      auditDetailModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeDetailModal() {
    if (auditDetailModal) {
      auditDetailModal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeDetailModal);
  if (modalCloseFooterBtn) modalCloseFooterBtn.addEventListener('click', closeDetailModal);
  if (auditDetailModal) {
    auditDetailModal.addEventListener('click', (e) => {
      if (e.target === auditDetailModal) closeDetailModal();
    });
  }

  document.querySelectorAll('[data-dismiss="modal"]').forEach(btn => {
    btn.addEventListener('click', closeDetailModal);
  });

  // ==========================================================================
  // 8. EVENT LISTENERS
  // ==========================================================================
  if (btnApplyFilters) {
    btnApplyFilters.addEventListener('click', () => {
      currentPage = 1;
      fetchLogs();
    });
  }

  if (btnResetFilters) {
    btnResetFilters.addEventListener('click', () => {
      if (filterSearch) filterSearch.value = '';
      if (filterAction) filterAction.value = '';
      if (filterEntity) filterEntity.value = '';
      if (filterDateFrom) filterDateFrom.value = '';
      if (filterDateTo) filterDateTo.value = '';
      currentPage = 1;
      fetchLogs();
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      fetchLogs();
      showToast('Audit logs refreshed', 'info');
    });
  }

  if (selectPageSize) {
    selectPageSize.addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value, 10) || 25;
      currentPage = 1;
      fetchLogs();
    });
  }

  if (btnPrevPage) {
    btnPrevPage.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        fetchLogs();
      }
    });
  }

  if (btnNextPage) {
    btnNextPage.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        fetchLogs();
      }
    });
  }

  // Search on Enter key
  if (filterSearch) {
    filterSearch.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        currentPage = 1;
        fetchLogs();
      }
    });
  }

  // Initial fetch
  fetchLogs();

})();
