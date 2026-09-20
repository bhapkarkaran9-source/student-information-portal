/**
 * Admin Notice Board Management Script
 * Handles notice publication, scheduling, filtering, and modal state management
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

  if (currentUser.role !== 'ADMIN') {
    window.location.replace('/login.html');
    return;
  }

  // Update username badge
  const usernameBadge = document.getElementById('adminUsernameBadge');
  if (usernameBadge) {
    usernameBadge.textContent = currentUser.username || currentUser.first_name || 'Administrator';
  }

  // API Request Helper
  async function apiFetch(endpoint, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    const res = await fetch(endpoint, config);
    if (res.status === 401) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/login.html');
      return null;
    }
    return res;
  }

  // ==========================================================================
  // 2. UI STATE & ELEMENTS
  // ==========================================================================
  let currentPage = 1;
  const itemsPerPage = 10;
  let totalItems = 0;
  let totalPages = 1;
  let pendingDeleteId = null;

  // Filter Elements
  const filterSearch = document.getElementById('filterSearch');
  const filterTargetRole = document.getElementById('filterTargetRole');
  const filterStatus = document.getElementById('filterStatus');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnRefresh = document.getElementById('btnRefresh');

  // KPI Elements
  const kpiTotalNotices = document.getElementById('kpiTotalNotices');
  const kpiActiveNotices = document.getElementById('kpiActiveNotices');
  const kpiUpcomingNotices = document.getElementById('kpiUpcomingNotices');
  const kpiExpiredNotices = document.getElementById('kpiExpiredNotices');

  // Table & Pagination
  const noticesBody = document.getElementById('noticesBody');
  const paginationInfo = document.getElementById('paginationInfo');
  const paginationCurrentPage = document.getElementById('paginationCurrentPage');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');

  // Modals
  const noticeModal = document.getElementById('noticeModal');
  const noticeForm = document.getElementById('noticeForm');
  const modalNoticeTitle = document.getElementById('modalNoticeTitle');
  const noticeIdInput = document.getElementById('noticeId');
  const modalTitle = document.getElementById('modalTitle');
  const modalTargetRole = document.getElementById('modalTargetRole');
  const modalContent = document.getElementById('modalContent');
  const modalPublishedAt = document.getElementById('modalPublishedAt');
  const modalExpiresAt = document.getElementById('modalExpiresAt');
  const modalAttachmentPath = document.getElementById('modalAttachmentPath');
  const modalIsActive = document.getElementById('modalIsActive');
  const btnSaveNotice = document.getElementById('btnSaveNotice');

  const viewNoticeModal = document.getElementById('viewNoticeModal');
  const viewNoticeContent = document.getElementById('viewNoticeContent');

  const deleteNoticeModal = document.getElementById('deleteNoticeModal');
  const deleteNoticeDetails = document.getElementById('deleteNoticeDetails');
  const btnConfirmDeleteNotice = document.getElementById('btnConfirmDeleteNotice');

  // ==========================================================================
  // 3. TOAST NOTIFICATION SYSTEM
  // ==========================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
      <button type="button" class="toast-close" aria-label="Close">&times;</button>
    `;

    container.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 4500);
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

  // ==========================================================================
  // 4. MODAL HELPERS
  // ==========================================================================
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('hidden');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-dismiss="modal"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-backdrop') || btn.closest('.erp-modal-overlay');
      if (modal) closeModal(modal);
    });
  });

  document.querySelectorAll('.modal-backdrop, .erp-modal-overlay').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal(backdrop);
    });
  });

  // ==========================================================================
  // 5. DATA FETCHING: STATS & NOTICES
  // ==========================================================================
  async function loadStats() {
    try {
      const res = await apiFetch('/api/notices/stats');
      if (!res || !res.ok) return;
      const json = await res.json();
      const s = json.data && json.data.stats ? json.data.stats : {};

      kpiTotalNotices.textContent = s.total_notices || 0;
      kpiActiveNotices.textContent = s.active_notices || 0;
      kpiUpcomingNotices.textContent = s.upcoming_notices || 0;
      kpiExpiredNotices.textContent = s.expired_notices || 0;
    } catch (err) {
      console.error('Error fetching notice statistics:', err);
    }
  }

  async function loadNotices(page = 1) {
    currentPage = page;
    noticesBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">Loading notices...</td>
      </tr>
    `;

    const params = new URLSearchParams();
    params.set('page', currentPage);
    params.set('limit', itemsPerPage);

    if (filterSearch.value.trim()) params.set('search', filterSearch.value.trim());
    if (filterTargetRole.value) params.set('target_role', filterTargetRole.value);
    if (filterStatus.value) params.set('status', filterStatus.value);

    try {
      const res = await apiFetch(`/api/notices?${params.toString()}`);
      if (!res || !res.ok) {
        noticesBody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-4 text-danger">Failed to load notices. Please try again.</td>
          </tr>
        `;
        return;
      }

      const json = await res.json();
      const data = json.data || {};
      const notices = data.notices || [];
      const pagination = data.pagination || { total: 0, totalPages: 1 };

      totalItems = pagination.total;
      totalPages = pagination.totalPages;

      renderNoticesTable(notices);
      updatePaginationControls();
    } catch (err) {
      console.error('Error loading notices:', err);
      noticesBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-danger">An unexpected error occurred while loading notices.</td>
        </tr>
      `;
    }
  }

  function renderNoticesTable(notices) {
    if (!notices || notices.length === 0) {
      noticesBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="erp-empty-state">
              <div class="erp-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </div>
              <div class="erp-empty-title">No Notices Found</div>
              <div class="erp-empty-text">No circulars or announcements match the current search or audience filter.</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    notices.forEach((n) => {
      // Audience badge
      let audienceBadge = '<span class="erp-badge badge-role-all">Everyone (ALL)</span>';
      if (n.target_role === 'STUDENT') {
        audienceBadge = '<span class="erp-badge badge-role-student">Students</span>';
      } else if (n.target_role === 'TEACHER') {
        audienceBadge = '<span class="erp-badge badge-role-teacher">Faculty</span>';
      } else if (n.target_role === 'ADMIN') {
        audienceBadge = '<span class="erp-badge badge-role-admin">Admin</span>';
      }

      // Status badge
      let statusBadge = '<span class="erp-badge badge-active">Active</span>';
      if (n.status === 'Upcoming') {
        statusBadge = '<span class="erp-badge badge-upcoming">Upcoming</span>';
      } else if (n.status === 'Expired') {
        statusBadge = '<span class="erp-badge badge-expired">Expired</span>';
      } else if (n.status === 'Inactive') {
        statusBadge = '<span class="erp-badge badge-inactive">Inactive</span>';
      }

      // Dates format
      let formattedPub = '-';
      if (n.published_at) {
        formattedPub = new Date(n.published_at).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      let formattedExp = '<span style="color: #94a3b8; font-size: 11.5px;">Indefinite</span>';
      if (n.expires_at) {
        formattedExp = new Date(n.expires_at).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      // Safe Attachment
      let attachmentCell = '<span style="color: #94a3b8; font-size: 12px;">None</span>';
      if (n.attachment_path) {
        const isExternal = /^https?:\/\//i.test(n.attachment_path);
        attachmentCell = `
          <a href="${escapeHtml(n.attachment_path)}" target="_blank" rel="noopener noreferrer" style="color: #7c3aed; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; text-decoration: none;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            ${isExternal ? 'Open Link' : 'Attachment'}
          </a>
        `;
      }

      // Content preview snippet
      const previewText = n.content.length > 80 ? n.content.substring(0, 80) + '...' : n.content;

      rowsHtml += `
        <tr>
          <td>
            <div style="font-weight: 600; color: #0f172a; margin-bottom: 2px;">${escapeHtml(n.title)}</div>
            <div style="font-size: 12px; color: #64748b; line-height: 1.4;">${escapeHtml(previewText)}</div>
          </td>
          <td>
            ${audienceBadge}
          </td>
          <td>
            <div style="font-size: 12.5px; font-weight: 500; color: #334155;">${formattedPub}</div>
          </td>
          <td>
            <div style="font-size: 12.5px; color: #475569;">${formattedExp}</div>
          </td>
          <td>
            ${attachmentCell}
          </td>
          <td>
            ${statusBadge}
          </td>
          <td style="text-align: right;">
            <div class="erp-row-actions">
              <button type="button" class="btn-row-action btn-row-action-view btn-view-notice" data-id="${n.notice_id}" title="View Notice">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button type="button" class="btn-row-action btn-edit-notice" data-id="${n.notice_id}" title="Edit Notice">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button type="button" class="btn-row-action btn-row-action-delete btn-delete-notice" data-id="${n.notice_id}" data-title="${escapeHtml(n.title)}" title="Delete Notice">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    noticesBody.innerHTML = rowsHtml;
    attachRowEventListeners();
  }

  function updatePaginationControls() {
    const start = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, totalItems);
    paginationInfo.textContent = `Showing ${start} to ${end} of ${totalItems} notices`;
    paginationCurrentPage.textContent = `Page ${currentPage} of ${totalPages || 1}`;

    btnPrevPage.disabled = currentPage <= 1;
    btnNextPage.disabled = currentPage >= totalPages || totalPages === 0;
  }

  function attachRowEventListeners() {
    // View
    document.querySelectorAll('.btn-view-notice').forEach((btn) => {
      btn.addEventListener('click', () => handleViewNotice(btn.dataset.id));
    });

    // Edit
    document.querySelectorAll('.btn-edit-notice').forEach((btn) => {
      btn.addEventListener('click', () => handleEditNotice(btn.dataset.id));
    });

    // Delete
    document.querySelectorAll('.btn-delete-notice').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingDeleteId = btn.dataset.id;
        deleteNoticeDetails.innerHTML = `
          <strong>Headline:</strong> ${escapeHtml(btn.dataset.title)}
        `;
        openModal(deleteNoticeModal);
      });
    });
  }

  // ==========================================================================
  // 6. VIEW NOTICE DETAILS
  // ==========================================================================
  async function handleViewNotice(id) {
    try {
      const res = await apiFetch(`/api/notices/${id}`);
      if (!res || !res.ok) {
        showToast('Failed to fetch notice details', 'error');
        return;
      }
      const json = await res.json();
      const n = json.data && json.data.notice ? json.data.notice : null;
      if (!n) return;

      const pubDate = n.published_at ? new Date(n.published_at).toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'short'
      }) : 'Immediate';

      const expDate = n.expires_at ? new Date(n.expires_at).toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'short'
      }) : 'Indefinite';

      let attachmentDisplay = '<span class="text-muted">None attached</span>';
      if (n.attachment_path) {
        attachmentDisplay = `
          <a href="${escapeHtml(n.attachment_path)}" target="_blank" rel="noopener noreferrer" class="link-primary" style="word-break: break-all;">
            ${escapeHtml(n.attachment_path)}
          </a>
        `;
      }

      viewNoticeContent.innerHTML = `
        <div class="detail-row" style="margin-bottom: 12px;">
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Headline</div>
          <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${escapeHtml(n.title)}</div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Target Audience</div>
            <div style="font-weight: 600; color: #7c3aed;">${escapeHtml(n.target_role)}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Published By</div>
            <div style="font-weight: 600;">${escapeHtml(n.creator_name || n.creator_username || 'Administrator')}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Publish Date</div>
            <div style="font-weight: 500;">${pubDate}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Expiration Date</div>
            <div style="font-weight: 500;">${expDate}</div>
          </div>
        </div>

        <div class="detail-row" style="margin-bottom: 12px;">
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Attachment / Circular Link</div>
          <div>${attachmentDisplay}</div>
        </div>

        <div class="detail-row">
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Full Notice Content</div>
          <div style="margin-top: 4px; padding: 12px; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(n.content)}</div>
        </div>
      `;

      openModal(viewNoticeModal);
    } catch (err) {
      console.error('Error in handleViewNotice:', err);
      showToast('Error opening notice details', 'error');
    }
  }

  // ==========================================================================
  // 7. ADD & EDIT NOTICE
  // ==========================================================================
  function resetNoticeForm() {
    noticeForm.reset();
    noticeIdInput.value = '';
    modalNoticeTitle.textContent = 'Publish New Notice';
    modalTargetRole.value = 'ALL';
    modalIsActive.checked = true;
  }

  document.getElementById('btnAddNotice').addEventListener('click', () => {
    resetNoticeForm();
    // Default published_at to current local datetime
    const now = new Date();
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    modalPublishedAt.value = localIso;
    openModal(noticeModal);
  });

  async function handleEditNotice(id) {
    try {
      const res = await apiFetch(`/api/notices/${id}`);
      if (!res || !res.ok) {
        showToast('Failed to load notice data', 'error');
        return;
      }
      const json = await res.json();
      const n = json.data && json.data.notice ? json.data.notice : null;
      if (!n) return;

      resetNoticeForm();
      modalNoticeTitle.textContent = 'Edit Notice';
      noticeIdInput.value = n.notice_id;
      modalTitle.value = n.title;
      modalTargetRole.value = n.target_role;
      modalContent.value = n.content;
      modalAttachmentPath.value = n.attachment_path || '';
      modalIsActive.checked = Boolean(n.is_active);

      if (n.published_at) {
        const d = new Date(n.published_at);
        modalPublishedAt.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }

      if (n.expires_at) {
        const d = new Date(n.expires_at);
        modalExpiresAt.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }

      openModal(noticeModal);
    } catch (err) {
      console.error('Error in handleEditNotice:', err);
      showToast('Error loading notice for edit', 'error');
    }
  }

  noticeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = noticeIdInput.value.trim();
    const title = modalTitle.value.trim();
    const target_role = modalTargetRole.value;
    const content = modalContent.value.trim();
    const published_at = modalPublishedAt.value;
    const expires_at = modalExpiresAt.value;
    const attachment_path = modalAttachmentPath.value.trim();
    const is_active = modalIsActive.checked;

    if (!title || !content) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    // Check dates if both provided
    if (published_at && expires_at) {
      if (new Date(expires_at) < new Date(published_at)) {
        showToast('Expiry date cannot be earlier than publish date', 'error');
        return;
      }
    }

    const payload = {
      title,
      target_role,
      content,
      published_at: published_at || null,
      expires_at: expires_at || null,
      attachment_path: attachment_path || null,
      is_active
    };

    btnSaveNotice.disabled = true;
    btnSaveNotice.textContent = 'Saving...';

    try {
      const endpoint = id ? `/api/notices/${id}` : '/api/notices';
      const method = id ? 'PUT' : 'POST';

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.message || 'Operation failed', 'error');
        return;
      }

      showToast(id ? 'Notice updated successfully' : 'Notice published successfully', 'success');
      closeModal(noticeModal);
      await loadStats();
      await loadNotices(currentPage);
    } catch (err) {
      console.error('Error saving notice:', err);
      showToast('An error occurred while saving notice', 'error');
    } finally {
      btnSaveNotice.disabled = false;
      btnSaveNotice.textContent = 'Save Notice';
    }
  });

  // ==========================================================================
  // 8. DELETE NOTICE
  // ==========================================================================
  btnConfirmDeleteNotice.addEventListener('click', async () => {
    if (!pendingDeleteId) return;

    btnConfirmDeleteNotice.disabled = true;
    btnConfirmDeleteNotice.textContent = 'Deleting...';

    try {
      const res = await apiFetch(`/api/notices/${pendingDeleteId}`, {
        method: 'DELETE'
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.message || 'Failed to delete notice', 'error');
        return;
      }

      showToast('Notice deleted successfully', 'success');
      closeModal(deleteNoticeModal);
      pendingDeleteId = null;

      await loadStats();
      await loadNotices(1);
    } catch (err) {
      console.error('Error deleting notice:', err);
      showToast('An error occurred while deleting notice', 'error');
    } finally {
      btnConfirmDeleteNotice.disabled = false;
      btnConfirmDeleteNotice.textContent = 'Confirm Delete';
    }
  });

  // ==========================================================================
  // 9. FILTERS & PAGINATION EVENTS
  // ==========================================================================
  let debounceTimeout = null;
  filterSearch.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      loadNotices(1);
    }, 350);
  });

  filterTargetRole.addEventListener('change', () => loadNotices(1));
  filterStatus.addEventListener('change', () => loadNotices(1));

  btnResetFilters.addEventListener('click', () => {
    filterSearch.value = '';
    filterTargetRole.value = '';
    filterStatus.value = '';
    loadNotices(1);
  });

  btnRefresh.addEventListener('click', () => {
    loadStats();
    loadNotices(currentPage);
    showToast('Notice Board refreshed', 'info');
  });

  btnPrevPage.addEventListener('click', () => {
    if (currentPage > 1) {
      loadNotices(currentPage - 1);
    }
  });

  btnNextPage.addEventListener('click', () => {
    if (currentPage < totalPages) {
      loadNotices(currentPage + 1);
    }
  });

  // Sidebar toggle for responsive view
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const adminSidebar = document.getElementById('adminSidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

  if (sidebarToggleBtn && adminSidebar && sidebarBackdrop) {
    sidebarToggleBtn.addEventListener('click', () => {
      adminSidebar.classList.add('open');
      sidebarBackdrop.classList.remove('hidden');
    });

    const closeSidebar = () => {
      adminSidebar.classList.remove('open');
      sidebarBackdrop.classList.add('hidden');
    };

    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
    sidebarBackdrop.addEventListener('click', closeSidebar);
  }

  // Logout handler
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/login.html');
    });
  }

  // ==========================================================================
  // 10. INITIALIZATION
  // ==========================================================================
  async function init() {
    await loadStats();
    await loadNotices(1);
  }

  init();
})();
