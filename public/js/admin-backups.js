/**
 * Admin Backup & Restore Management Frontend Script
 * Modernized for Student Information Portal ERP System
 * ZERO-IMAGE Policy | Live Database API Binding
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Auth Guard: Admin Only
  const token = localStorage.getItem('token');
  const userJson = localStorage.getItem('user');

  if (!token || !userJson) {
    window.location.href = '/login.html';
    return;
  }

  let currentUser;
  try {
    currentUser = JSON.parse(userJson);
    if (currentUser.role !== 'ADMIN') {
      window.location.href = '/login.html';
      return;
    }
  } catch (e) {
    localStorage.clear();
    window.location.href = '/login.html';
    return;
  }

  // Populate Topbar User Info if elements exist
  const topbarUsername = document.getElementById('topbarUsername');
  const topbarAvatar = document.getElementById('topbarAvatar');
  if (topbarUsername) topbarUsername.textContent = currentUser.username || 'Admin';
  if (topbarAvatar) {
    const initial = (currentUser.first_name || currentUser.username || 'A')[0].toUpperCase();
    const fullName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.username || 'Admin';
    if (typeof window.renderAvatarElement === 'function') {
      window.renderAvatarElement(topbarAvatar, currentUser.profile_photo_url, initial, fullName + ' avatar');
    } else {
      topbarAvatar.textContent = initial;
    }
  }

  // Mobile Sidebar Toggle
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
  const adminSidebar = document.getElementById('adminSidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  function toggleSidebar() {
    if (!adminSidebar) return;
    const isOpen = adminSidebar.classList.contains('open');
    if (isOpen) {
      adminSidebar.classList.remove('open');
      if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
    } else {
      adminSidebar.classList.add('open');
      if (sidebarBackdrop) sidebarBackdrop.classList.remove('hidden');
    }
  }

  if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', toggleSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', toggleSidebar);

  // Toast Notification Utility (Non-blocking, zero alert() calls)
  const toastContainer = document.getElementById('toastContainer');
  function showToast(type, message) {
    if (!toastContainer) {
      console.warn(`[Toast ${type}]: ${message}`);
      return;
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'success'}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Modal Dismiss Helpers
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
      }
    });
  });

  // Close modals on overlay backdrop click
  document.querySelectorAll('.erp-modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
        document.body.style.overflow = '';
      }
    });
  });

  // Escape key to dismiss modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.erp-modal-overlay:not(.hidden)').forEach(modal => {
        modal.classList.add('hidden');
      });
      document.body.style.overflow = '';
    }
  });

  // State
  let currentPage = 1;
  const pageSize = 15;
  let currentBackups = [];
  let restoreSessionState = {
    backupId: null,
    token: null,
    fileName: null
  };

  // DOM Elements
  const backupsTableBody = document.getElementById('backupsTableBody');
  const paginationInfo = document.getElementById('paginationInfo');
  const pageIndicator = document.getElementById('pageIndicator');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');
  const btnCreateBackup = document.getElementById('btnCreateBackup');
  const createBackupBtnText = document.getElementById('createBackupBtnText');
  const btnRefresh = document.getElementById('btnRefresh');
  const btnClearFilters = document.getElementById('btnClearFilters');

  const filterSearch = document.getElementById('filterSearch');
  const filterStatus = document.getElementById('filterStatus');
  const filterType = document.getElementById('filterType');
  const filterDateFrom = document.getElementById('filterDateFrom');
  const filterDateTo = document.getElementById('filterDateTo');

  // Format File Size
  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Format Date Time
  function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // Render Status Badge using unified ERP Badges
  function renderStatusBadge(status) {
    const s = String(status || '').toUpperCase();
    if (s === 'COMPLETED') {
      return `<span class="erp-badge badge-backup-success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><polyline points="20 6 9 17 4 12"></polyline></svg> Completed</span>`;
    } else if (s === 'FAILED') {
      return `<span class="erp-badge badge-backup-failed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> Failed</span>`;
    } else if (s === 'IN_PROGRESS' || s === 'IN PROGRESS') {
      return `<span class="erp-badge badge-backup-progress"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line></svg> In Progress</span>`;
    }
    return `<span class="erp-badge badge-inactive">${status || 'Unknown'}</span>`;
  }

  // Fetch Backups with current filters
  async function loadBackups(page = 1) {
    currentPage = page;
    if (backupsTableBody) {
      backupsTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 2.5rem; color: #64748b;">
            Loading backup history...
          </td>
        </tr>
      `;
    }

    const params = new URLSearchParams({
      page: currentPage,
      limit: pageSize
    });

    if (filterSearch && filterSearch.value.trim()) params.set('search', filterSearch.value.trim());
    if (filterStatus && filterStatus.value) params.set('status', filterStatus.value);
    if (filterType && filterType.value) params.set('backup_type', filterType.value);
    if (filterDateFrom && filterDateFrom.value) params.set('date_from', filterDateFrom.value);
    if (filterDateTo && filterDateTo.value) params.set('date_to', filterDateTo.value);

    try {
      const response = await fetch(`/api/backups?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          showToast('error', 'Session expired. Please log in again.');
          window.location.href = '/login.html';
          return;
        }
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const resJson = await response.json();
      currentBackups = Array.isArray(resJson.data) ? resJson.data : (resJson.data?.backups || resJson.backups || []);
      const pagination = resJson.pagination || { total: 0, page: 1, totalPages: 1 };
      const stats = resJson.stats || resJson.kpis || {};

      // Update KPI Cards
      const kpiTotal = document.getElementById('kpiTotalBackups');
      const kpiSuccess = document.getElementById('kpiSuccessfulBackups');
      const kpiFailed = document.getElementById('kpiFailedBackups');
      const kpiLatest = document.getElementById('kpiLatestBackup');

      if (kpiTotal) kpiTotal.textContent = stats.total_backups || 0;
      if (kpiSuccess) kpiSuccess.textContent = stats.successful_backups || 0;
      if (kpiFailed) kpiFailed.textContent = stats.failed_backups || 0;
      
      const latestTime = stats.latest_backup;
      if (kpiLatest) kpiLatest.textContent = latestTime ? formatDateTime(latestTime) : 'None';

      renderTable(currentBackups);
      renderPagination(pagination);
    } catch (err) {
      console.error('Error loading backups:', err);
      if (backupsTableBody) {
        backupsTableBody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align: center; padding: 2.5rem; color: #b91c1c;">
              Failed to load backups: ${err.message}
            </td>
          </tr>
        `;
      }
      showToast('error', `Failed to load backup history: ${err.message}`);
    }
  }

  // Render Table Rows with ERP row actions
  function renderTable(backups) {
    if (!backupsTableBody) return;

    if (!backups || backups.length === 0) {
      backupsTableBody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="erp-empty-state">
              <div class="erp-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </div>
              <h3 class="erp-empty-title">No Backups Found</h3>
              <p class="erp-empty-text">No database backup snapshots match your current filter criteria. Click below to create an instant snapshot.</p>
              <button type="button" class="btn-erp btn-erp-primary" onclick="document.getElementById('btnCreateBackup').click()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>Create Database Backup</span>
              </button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    backupsTableBody.innerHTML = backups.map(b => {
      const isCompleted = String(b.status || '').toUpperCase() === 'COMPLETED';
      const checksumAbbr = b.checksum ? `${b.checksum.slice(0, 10)}...` : '-';

      return `
        <tr>
          <td style="font-weight: 700; color: #0f172a;">#${b.backup_id}</td>
          <td>
            <div style="font-weight: 600; color: #1e293b;">${formatDateTime(b.created_at || b.started_at)}</div>
          </td>
          <td>
            <div style="font-weight: 600; color: #0f172a;">${b.creator_username || 'System'}</div>
            ${b.creator_name ? `<div style="font-size: 11.5px; color: #64748b;">${b.creator_name}</div>` : ''}
          </td>
          <td><span class="erp-badge badge-priority-medium">${b.backup_type || 'FULL'}</span></td>
          <td style="max-width: 210px;">
            <span style="font-family: monospace; font-size: 12px; font-weight: 600; color: #334155; display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${b.file_name || b.backup_name}">
              ${b.file_name || b.backup_name}
            </span>
          </td>
          <td style="font-weight: 600; color: #475569;">${formatBytes(b.file_size || b.file_size_bytes)}</td>
          <td>${renderStatusBadge(b.status)}</td>
          <td>
            ${b.checksum ? `<code class="erp-checksum-code" title="${b.checksum}">${checksumAbbr}</code>` : '<span style="color:#94a3b8;">-</span>'}
          </td>
          <td style="text-align: right;">
            <div class="erp-row-actions" style="justify-content: flex-end;">
              <button type="button" class="btn-row-action btn-row-action-view" onclick="window.viewBackupDetails(${b.backup_id})" title="View Details">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button type="button" class="btn-row-action" onclick="window.validateBackupItem(${b.backup_id})" title="Validate SHA-256 Checksum">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </button>
              <button type="button" class="btn-row-action" ${!isCompleted ? 'disabled style="opacity: 0.35; cursor: not-allowed;"' : ''} onclick="window.downloadBackupItem(${b.backup_id})" title="Download Backup">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </button>
              <button type="button" class="btn-row-action btn-row-action-delete" ${!isCompleted ? 'disabled style="opacity: 0.35; cursor: not-allowed;"' : ''} onclick="window.openRestoreModal(${b.backup_id}, '${b.file_name || b.backup_name}')" title="Safe Restore">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Render Pagination
  function renderPagination(p) {
    if (!paginationInfo || !pageIndicator || !btnPrevPage || !btnNextPage) return;

    const total = p.total || 0;
    const page = p.page || 1;
    const totalPages = p.totalPages || 1;

    const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);

    paginationInfo.textContent = `Showing ${start} to ${end} of ${total} backups`;
    pageIndicator.textContent = `Page ${page} of ${totalPages}`;

    btnPrevPage.disabled = page <= 1;
    btnNextPage.disabled = page >= totalPages;
  }

  // Pagination Event Handlers
  if (btnPrevPage) {
    btnPrevPage.addEventListener('click', () => {
      if (currentPage > 1) loadBackups(currentPage - 1);
    });
  }

  if (btnNextPage) {
    btnNextPage.addEventListener('click', () => {
      loadBackups(currentPage + 1);
    });
  }

  // Filter Trigger Handlers
  let searchDebounce;
  if (filterSearch) {
    filterSearch.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => loadBackups(1), 300);
    });
  }

  if (filterStatus) filterStatus.addEventListener('change', () => loadBackups(1));
  if (filterType) filterType.addEventListener('change', () => loadBackups(1));
  if (filterDateFrom) filterDateFrom.addEventListener('change', () => loadBackups(1));
  if (filterDateTo) filterDateTo.addEventListener('change', () => loadBackups(1));

  if (btnClearFilters) {
    btnClearFilters.addEventListener('click', () => {
      if (filterSearch) filterSearch.value = '';
      if (filterStatus) filterStatus.value = '';
      if (filterType) filterType.value = '';
      if (filterDateFrom) filterDateFrom.value = '';
      if (filterDateTo) filterDateTo.value = '';
      loadBackups(1);
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => loadBackups(currentPage));
  }

  // Create Backup Trigger
  if (btnCreateBackup) {
    btnCreateBackup.addEventListener('click', async () => {
      if (btnCreateBackup.disabled) return;

      btnCreateBackup.disabled = true;
      if (createBackupBtnText) createBackupBtnText.textContent = 'Generating Snapshot...';

      try {
        const res = await fetch('/api/backups', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || `HTTP ${res.status}`);
        }

        showToast('success', 'Database backup created and verified successfully!');
        loadBackups(1);
      } catch (err) {
        console.error('Backup creation error:', err);
        showToast('error', `Backup failed: ${err.message}`);
      } finally {
        btnCreateBackup.disabled = false;
        if (createBackupBtnText) createBackupBtnText.textContent = 'Create Backup';
      }
    });
  }

  // View Backup Details
  window.viewBackupDetails = function(backupId) {
    const backup = currentBackups.find(b => Number(b.backup_id) === Number(backupId));
    if (!backup) return;

    const detailId = document.getElementById('detailId');
    const detailFileName = document.getElementById('detailFileName');
    const detailFilePath = document.getElementById('detailFilePath');
    const detailType = document.getElementById('detailType');
    const detailStatus = document.getElementById('detailStatus');
    const detailCreatedBy = document.getElementById('detailCreatedBy');
    const detailStartedAt = document.getElementById('detailStartedAt');
    const detailCompletedAt = document.getElementById('detailCompletedAt');
    const detailFileSize = document.getElementById('detailFileSize');
    const detailChecksum = document.getElementById('detailChecksum');

    if (detailId) detailId.textContent = `#${backup.backup_id}`;
    if (detailFileName) detailFileName.textContent = backup.file_name || backup.backup_name || '-';
    if (detailFilePath) detailFilePath.textContent = backup.file_path || backup.backup_path || '-';
    if (detailType) detailType.textContent = backup.backup_type || 'FULL_DATABASE';
    if (detailStatus) detailStatus.innerHTML = renderStatusBadge(backup.status);
    if (detailCreatedBy) detailCreatedBy.textContent = `${backup.creator_username || 'System'} ${backup.creator_name ? `(${backup.creator_name})` : ''}`;
    if (detailStartedAt) detailStartedAt.textContent = formatDateTime(backup.created_at || backup.started_at);
    if (detailCompletedAt) detailCompletedAt.textContent = formatDateTime(backup.completed_at);
    if (detailFileSize) detailFileSize.textContent = formatBytes(backup.file_size || backup.file_size_bytes);
    if (detailChecksum) detailChecksum.textContent = backup.checksum || 'Not computed';

    const errorRow = document.getElementById('detailErrorRow');
    const errorMsg = document.getElementById('detailErrorMessage');
    if (errorRow && errorMsg) {
      if (backup.error_message) {
        errorRow.style.display = 'block';
        errorMsg.textContent = backup.error_message;
      } else {
        errorRow.style.display = 'none';
      }
    }

    const modal = document.getElementById('viewModal');
    if (modal) {
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  };

  // Validate Backup File
  window.validateBackupItem = async function(backupId) {
    showToast('warning', `Validating integrity of backup #${backupId}...`);

    try {
      const res = await fetch(`/api/backups/${backupId}/validate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const resJson = await res.json();
      const val = resJson.data || {};
      const isValid = resJson.success && val.valid;

      const resultBox = document.getElementById('validationResultBox');
      if (resultBox) {
        if (isValid) {
          resultBox.innerHTML = `
            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 14px; color: #065f46;">
              <div style="font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Validation Passed
              </div>
              <div style="font-size: 12.5px; margin-top: 4px;">${resJson.message || 'File integrity and SHA-256 checksum successfully verified against server registry.'}</div>
              <div style="margin-top: 8px; font-family: monospace; font-size: 11.5px; word-break: break-all; background: #ffffff; padding: 6px 10px; border-radius: 4px; border: 1px solid #bbf7d0;">
                SHA-256: ${val.checksum || '-'}
              </div>
            </div>
          `;
          const vFile = document.getElementById('valItemFile');
          const vSize = document.getElementById('valItemSize');
          const vCheck = document.getElementById('valItemChecksum');
          const vHead = document.getElementById('valItemHeader');

          if (vFile) vFile.innerHTML = `<span>✅</span> File verified on disk`;
          if (vSize) vSize.innerHTML = `<span>✅</span> Size: ${formatBytes(val.fileSize)}`;
          if (vCheck) vCheck.innerHTML = `<span>✅</span> SHA-256 checksum matched`;
          if (vHead) vHead.innerHTML = `<span>✅</span> Valid MySQL dump header confirmed`;
        } else {
          resultBox.innerHTML = `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; color: #991b1b;">
              <div style="font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                Validation Failed
              </div>
              <div style="font-size: 12.5px; margin-top: 4px;">${resJson.message || 'File verification failed'}</div>
            </div>
          `;
          const vFile = document.getElementById('valItemFile');
          const vSize = document.getElementById('valItemSize');
          const vCheck = document.getElementById('valItemChecksum');
          const vHead = document.getElementById('valItemHeader');

          if (vFile) vFile.innerHTML = `<span>❌</span> File verification issue detected`;
          if (vSize) vSize.innerHTML = `<span>❌</span> Verification failed`;
          if (vCheck) vCheck.innerHTML = `<span>❌</span> Checksum verification error`;
          if (vHead) vHead.innerHTML = `<span>❌</span> Invalid format or missing file`;
        }
      }

      const modal = document.getElementById('validationModal');
      if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      }
    } catch (err) {
      showToast('error', `Validation failed to complete: ${err.message}`);
    }
  };

  // Download Backup File
  window.downloadBackupItem = async function(backupId) {
    showToast('warning', `Preparing download for backup #${backupId}...`);

    try {
      const res = await fetch(`/api/backups/${backupId}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `HTTP ${res.status}`);
      }

      let fileName = `backup_${backupId}.sql`;
      const disposition = res.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const m = disposition.match(/filename="?([^"]+)"?/);
        if (m && m[1]) fileName = m[1];
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      showToast('success', `Download started: ${fileName}`);
    } catch (err) {
      console.error('Download error:', err);
      showToast('error', `Download failed: ${err.message}`);
    }
  };

  // Restore Modal & Two-Step Workflow
  const restoreModal = document.getElementById('restoreModal');
  const restoreTargetId = document.getElementById('restoreTargetId');
  const restoreTargetFile = document.getElementById('restoreTargetFile');
  const restoreStep1 = document.getElementById('restoreStep1');
  const restoreStep2 = document.getElementById('restoreStep2');
  const btnPrepareRestore = document.getElementById('btnPrepareRestore');
  const restoreConfirmInput = document.getElementById('restoreConfirmInput');
  const btnConfirmRestore = document.getElementById('btnConfirmRestore');

  window.openRestoreModal = function(backupId, fileName) {
    restoreSessionState = {
      backupId,
      fileName,
      token: null
    };

    if (restoreTargetId) restoreTargetId.textContent = `#${backupId}`;
    if (restoreTargetFile) restoreTargetFile.textContent = fileName || '-';

    // Reset workflow steps
    if (restoreStep1) restoreStep1.style.display = 'block';
    if (restoreStep2) restoreStep2.style.display = 'none';
    if (restoreConfirmInput) restoreConfirmInput.value = '';
    if (btnConfirmRestore) btnConfirmRestore.disabled = true;
    if (btnPrepareRestore) {
      btnPrepareRestore.disabled = false;
      btnPrepareRestore.textContent = 'Prepare Restore Session';
    }

    if (restoreModal) {
      restoreModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  };

  // Step 1: Prepare Restore
  if (btnPrepareRestore) {
    btnPrepareRestore.addEventListener('click', async () => {
      if (!restoreSessionState.backupId) return;

      btnPrepareRestore.disabled = true;
      btnPrepareRestore.textContent = 'Validating & Preparing Session...';

      try {
        const res = await fetch(`/api/backups/${restoreSessionState.backupId}/restore/prepare`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const resJson = await res.json();
        if (!res.ok) {
          throw new Error(resJson.message || `HTTP ${res.status}`);
        }

        restoreSessionState.token = resJson.data.confirmation_token;
        showToast('success', 'Restore session authorized. Explicit confirmation required.');

        if (restoreStep1) restoreStep1.style.display = 'none';
        if (restoreStep2) restoreStep2.style.display = 'block';
        if (restoreConfirmInput) restoreConfirmInput.focus();
      } catch (err) {
        console.error('Prepare restore error:', err);
        showToast('error', `Restore preparation failed: ${err.message}`);
        btnPrepareRestore.disabled = false;
        btnPrepareRestore.textContent = 'Prepare Restore Session';
      }
    });
  }

  // Enable Confirm button only when user types RESTORE
  if (restoreConfirmInput && btnConfirmRestore) {
    restoreConfirmInput.addEventListener('input', () => {
      const val = restoreConfirmInput.value.trim();
      btnConfirmRestore.disabled = (val !== 'RESTORE');
    });
  }

  // Step 2: Confirm & Execute Restore
  if (btnConfirmRestore) {
    btnConfirmRestore.addEventListener('click', async () => {
      if (!restoreSessionState.backupId || !restoreSessionState.token) {
        showToast('error', 'Restore session invalid. Please restart the restore process.');
        return;
      }

      btnConfirmRestore.disabled = true;
      btnConfirmRestore.textContent = 'Creating Safety Snapshot & Restoring...';

      try {
        const res = await fetch(`/api/backups/${restoreSessionState.backupId}/restore/confirm`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            token: restoreSessionState.token,
            target_database: 'student_portal_db'
          })
        });

        const resJson = await res.json();
        if (!res.ok) {
          throw new Error(resJson.message || `HTTP ${res.status}`);
        }

        showToast('success', 'Database restored successfully to student_portal_db!');
        if (restoreModal) {
          restoreModal.classList.add('hidden');
          document.body.style.overflow = '';
        }
        loadBackups(1);
      } catch (err) {
        console.error('Confirm restore error:', err);
        showToast('error', `Restore failed: ${err.message}`);
      } finally {
        btnConfirmRestore.disabled = false;
        btnConfirmRestore.textContent = 'Confirm & Execute Restore Now';
      }
    });
  }

  // Initial Load
  loadBackups(1);
});
