/**
 * Admin Notifications Management Script
 * Handles notification authoring, role broadcasting, delivery monitoring, and read state management
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
  // 2. UI STATE & DOM ELEMENTS
  // ==========================================================================
  let currentPage = 1;
  const itemsPerPage = 10;
  let totalItems = 0;
  let totalPages = 1;
  let pendingDeleteId = null;
  let activeUsersList = [];

  // Filter Elements
  const filterSearch = document.getElementById('filterSearch');
  const filterRole = document.getElementById('filterRole');
  const filterType = document.getElementById('filterType');
  const filterIsRead = document.getElementById('filterIsRead');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnRefresh = document.getElementById('btnRefresh');

  // KPI Elements
  const kpiTotalNotifications = document.getElementById('kpiTotalNotifications');
  const kpiUnreadNotifications = document.getElementById('kpiUnreadNotifications');
  const kpiReadNotifications = document.getElementById('kpiReadNotifications');
  const kpiStudentNotifications = document.getElementById('kpiStudentNotifications');

  // Table & Pagination
  const notificationsBody = document.getElementById('notificationsBody');
  const paginationInfo = document.getElementById('paginationInfo');
  const paginationCurrentPage = document.getElementById('paginationCurrentPage');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');

  // Modals & Buttons
  const btnOpenSendModal = document.getElementById('btnOpenSendModal');
  const sendNotificationModal = document.getElementById('sendNotificationModal');
  const notificationForm = document.getElementById('notificationForm');
  const modalSendTitle = document.getElementById('modalSendTitle');
  const notificationIdInput = document.getElementById('notificationId');
  const deliveryModeRadios = document.querySelectorAll('input[name="delivery_mode"]');
  const singleRecipientGroup = document.getElementById('singleRecipientGroup');
  const modalRecipientUserId = document.getElementById('modalRecipientUserId');
  const broadcastRoleGroup = document.getElementById('broadcastRoleGroup');
  const modalBroadcastRole = document.getElementById('modalBroadcastRole');
  const modalTitle = document.getElementById('modalTitle');
  const modalType = document.getElementById('modalType');
  const modalMessage = document.getElementById('modalMessage');
  const btnSubmitNotification = document.getElementById('btnSubmitNotification');

  const viewNotificationModal = document.getElementById('viewNotificationModal');
  const viewNotificationContent = document.getElementById('viewNotificationContent');

  const deleteNotificationModal = document.getElementById('deleteNotificationModal');
  const deleteNotificationDetails = document.getElementById('deleteNotificationDetails');
  const btnConfirmDeleteNotification = document.getElementById('btnConfirmDeleteNotification');

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
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(isoStr) {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '-';
    }
  }

  // ==========================================================================
  // 4. LOAD ACTIVE USERS FOR RECIPIENT DROPDOWN
  // ==========================================================================
  async function loadActiveUsers() {
    try {
      const res = await apiFetch('/api/users?status=1&limit=100');
      if (!res || !res.ok) return;
      const data = await res.json();
      activeUsersList = (data.data && data.data.users) ? data.data.users : [];

      if (modalRecipientUserId) {
        modalRecipientUserId.innerHTML = '<option value="">-- Choose User --</option>';
        activeUsersList.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.user_id;
          const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username;
          const roleLabel = u.role_name || u.role || 'USER';
          opt.textContent = `${fullName} (@${u.username}) [${roleLabel}]`;
          modalRecipientUserId.appendChild(opt);
        });
      }
    } catch (err) {
      console.error('Error loading users:', err);
    }
  }

  // ==========================================================================
  // 5. KPI METRICS LOADER
  // ==========================================================================
  async function loadNotificationStats() {
    try {
      const res = await apiFetch('/api/notifications/stats');
      if (!res || !res.ok) return;

      const body = await res.json();
      const stats = body.data?.stats || {};

      if (kpiTotalNotifications) kpiTotalNotifications.textContent = stats.total_notifications ?? 0;
      if (kpiUnreadNotifications) kpiUnreadNotifications.textContent = stats.unread_count ?? 0;
      if (kpiReadNotifications) kpiReadNotifications.textContent = stats.read_count ?? 0;
      if (kpiStudentNotifications) kpiStudentNotifications.textContent = stats.by_role?.STUDENT ?? 0;
    } catch (err) {
      console.error('Failed to load notification stats:', err);
    }
  }

  // ==========================================================================
  // 6. LOAD NOTIFICATIONS TABLE DATA
  // ==========================================================================
  async function loadNotifications() {
    if (!notificationsBody) return;

    notificationsBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">
          <div style="display: flex; justify-content: center; align-items: center; gap: 8px;">
            <span>Loading notifications...</span>
          </div>
        </td>
      </tr>
    `;

    const params = new URLSearchParams({
      page: currentPage,
      limit: itemsPerPage
    });

    const searchVal = filterSearch?.value?.trim();
    if (searchVal) params.append('search', searchVal);

    const roleVal = filterRole?.value?.trim();
    if (roleVal) params.append('role', roleVal);

    const typeVal = filterType?.value?.trim();
    if (typeVal) params.append('notification_type', typeVal);

    const readVal = filterIsRead?.value?.trim();
    if (readVal !== '' && readVal !== undefined) params.append('is_read', readVal);

    try {
      const res = await apiFetch(`/api/notifications?${params.toString()}`);
      if (!res) return;

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.message || 'Failed to fetch notifications', 'error');
        notificationsBody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-4 text-danger">
              Failed to load notifications. Please try again.
            </td>
          </tr>
        `;
        return;
      }

      const resData = await res.json();
      const notifications = resData.data?.notifications || [];
      const pagination = resData.data?.pagination || { total: 0, totalPages: 1 };

      totalItems = pagination.total || 0;
      totalPages = pagination.totalPages || 1;

      renderTable(notifications);
      renderPagination();
    } catch (err) {
      console.error('Error fetching notifications:', err);
      showToast('An unexpected network error occurred', 'error');
      notificationsBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-danger">
            Network error loading notifications.
          </td>
        </tr>
      `;
    }
  }

  // Render Table Rows
  function renderTable(notifications) {
    if (!notifications || notifications.length === 0) {
      notificationsBody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 40px 16px;">
            <div class="erp-empty-state">
              <div class="erp-empty-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </div>
              <div class="erp-empty-title">No notifications found</div>
              <div class="erp-empty-desc">No notifications matching the selected filter criteria or delivery log.</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = notifications.map(item => {
      // Role badge class
      const role = item.recipient_role || 'USER';
      let roleBadgeClass = 'erp-badge-neutral';
      if (role === 'STUDENT') roleBadgeClass = 'erp-badge-primary';
      else if (role === 'TEACHER') roleBadgeClass = 'erp-badge-warning';
      else if (role === 'ADMIN') roleBadgeClass = 'erp-badge-danger';

      // Read status badge
      const isRead = Boolean(item.is_read);
      const statusBadge = isRead
        ? `<span class="erp-badge erp-badge-success">Read</span>`
        : `<span class="erp-badge erp-badge-danger">Unread</span>`;

      // Read toggle button icon/text
      const toggleReadTitle = isRead ? 'Mark as Unread' : 'Mark as Read';
      const toggleReadIcon = isRead
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line></svg>`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

      // Type badge styling
      let typeBadgeClass = 'erp-badge-neutral';
      if (item.notification_type === 'Alert') typeBadgeClass = 'erp-badge-danger';
      else if (item.notification_type === 'Academic') typeBadgeClass = 'erp-badge-primary';
      else if (item.notification_type === 'Exam') typeBadgeClass = 'erp-badge-warning';
      else if (item.notification_type === 'Attendance') typeBadgeClass = 'erp-badge-info';

      const typeBadge = `<span class="erp-badge ${typeBadgeClass}">${escapeHtml(item.notification_type || 'General')}</span>`;

      const recipientDisplayName = item.recipient_name || item.recipient_username || `User #${item.recipient_user_id}`;
      const msgSnippet = item.message && item.message.length > 70 ? `${item.message.substring(0, 70)}...` : (item.message || '');

      return `
        <tr data-id="${item.notification_id}">
          <td>
            <div style="font-weight: 600; color: #0f172a;">${escapeHtml(recipientDisplayName)}</div>
            <div style="font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 6px; margin-top: 2px;">
              <span>@${escapeHtml(item.recipient_username || 'n/a')}</span>
              <span class="erp-badge ${roleBadgeClass}" style="font-size: 10px; padding: 1px 6px;">${escapeHtml(role)}</span>
            </div>
          </td>
          <td>
            <div style="font-weight: 600; color: #1e293b;">${escapeHtml(item.title)}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${escapeHtml(msgSnippet)}</div>
          </td>
          <td>${typeBadge}</td>
          <td>${statusBadge}</td>
          <td style="white-space: nowrap; font-size: 12px; color: #64748b;">${formatDate(item.created_at)}</td>
          <td style="text-align: right; white-space: nowrap;">
            <div class="erp-action-btn-group" style="display: inline-flex; gap: 4px; justify-content: flex-end;">
              <button type="button" class="btn-row-action btn-view" title="View Details" data-id="${item.notification_id}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button type="button" class="btn-row-action btn-toggle-read" title="${toggleReadTitle}" data-id="${item.notification_id}" data-status="${isRead ? '1' : '0'}">
                ${toggleReadIcon}
              </button>
              <button type="button" class="btn-row-action btn-row-action-danger btn-delete" title="Delete Notification" data-id="${item.notification_id}" data-title="${escapeHtml(item.title)}" data-recipient="${escapeHtml(recipientDisplayName)}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    notificationsBody.innerHTML = rowsHtml;
  }

  // Render Pagination Controls
  function renderPagination() {
    if (!paginationInfo || !btnPrevPage || !btnNextPage) return;

    if (totalItems === 0) {
      paginationInfo.textContent = 'Showing 0 of 0 notifications';
    } else {
      const start = (currentPage - 1) * itemsPerPage + 1;
      const end = Math.min(currentPage * itemsPerPage, totalItems);
      paginationInfo.textContent = `Showing ${start} to ${end} of ${totalItems} notifications`;
    }

    if (paginationCurrentPage) {
      paginationCurrentPage.textContent = `Page ${currentPage} of ${Math.max(1, totalPages)}`;
    }

    btnPrevPage.disabled = currentPage <= 1;
    btnNextPage.disabled = currentPage >= totalPages;
  }

  // ==========================================================================
  // 7. MODAL EVENT HANDLERS & OPERATIONS
  // ==========================================================================

  // Open Modal Helper
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  // Close Modal Helper
  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Delivery Mode Toggle
  deliveryModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const isBroadcast = e.target.value === 'broadcast';
      if (isBroadcast) {
        singleRecipientGroup.classList.add('hidden');
        modalRecipientUserId.removeAttribute('required');
        broadcastRoleGroup.classList.remove('hidden');
        modalBroadcastRole.setAttribute('required', 'required');
        btnSubmitNotification.textContent = 'Broadcast Notifications';
      } else {
        singleRecipientGroup.classList.remove('hidden');
        modalRecipientUserId.setAttribute('required', 'required');
        broadcastRoleGroup.classList.add('hidden');
        modalBroadcastRole.removeAttribute('required');
        btnSubmitNotification.textContent = 'Send Notification';
      }
    });
  });

  // Open Send Modal
  if (btnOpenSendModal) {
    btnOpenSendModal.addEventListener('click', () => {
      if (notificationForm) notificationForm.reset();
      if (notificationIdInput) notificationIdInput.value = '';
      if (modalSendTitle) modalSendTitle.textContent = 'Send Notification';

      // Reset to Single mode
      const singleRadio = document.querySelector('input[name="delivery_mode"][value="single"]');
      if (singleRadio) singleRadio.checked = true;
      singleRecipientGroup.classList.remove('hidden');
      modalRecipientUserId.setAttribute('required', 'required');
      broadcastRoleGroup.classList.add('hidden');
      modalBroadcastRole.removeAttribute('required');
      btnSubmitNotification.textContent = 'Send Notification';

      openModal(sendNotificationModal);
    });
  }

  // Submit Notification Form (Single or Broadcast)
  if (notificationForm) {
    notificationForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const deliveryMode = document.querySelector('input[name="delivery_mode"]:checked')?.value || 'single';
      const title = modalTitle.value.trim();
      const message = modalMessage.value.trim();
      const notification_type = modalType.value.trim() || 'General';

      if (!title) {
        showToast('Notification subject/title is required', 'error');
        return;
      }
      if (!message) {
        showToast('Notification message is required', 'error');
        return;
      }

      btnSubmitNotification.disabled = true;
      btnSubmitNotification.textContent = 'Submitting...';

      try {
        let res;
        if (deliveryMode === 'broadcast') {
          const target_role = modalBroadcastRole.value;
          res = await apiFetch('/api/notifications/broadcast', {
            method: 'POST',
            body: JSON.stringify({
              target_role,
              title,
              message,
              notification_type
            })
          });
        } else {
          const recipient_user_id = parseInt(modalRecipientUserId.value, 10);
          if (isNaN(recipient_user_id) || recipient_user_id <= 0) {
            showToast('Please select a valid recipient user', 'error');
            btnSubmitNotification.disabled = false;
            btnSubmitNotification.textContent = 'Send Notification';
            return;
          }
          res = await apiFetch('/api/notifications', {
            method: 'POST',
            body: JSON.stringify({
              recipient_user_id,
              title,
              message,
              notification_type
            })
          });
        }

        if (!res) {
          btnSubmitNotification.disabled = false;
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          showToast(data.message || 'Failed to send notification', 'error');
          btnSubmitNotification.disabled = false;
          btnSubmitNotification.textContent = deliveryMode === 'broadcast' ? 'Broadcast Notifications' : 'Send Notification';
          return;
        }

        showToast(data.message || 'Notification processed successfully', 'success');
        closeModal(sendNotificationModal);
        loadNotifications();
        loadNotificationStats();
      } catch (err) {
        console.error('Error submitting notification:', err);
        showToast('An unexpected network error occurred', 'error');
      } finally {
        btnSubmitNotification.disabled = false;
        btnSubmitNotification.textContent = deliveryMode === 'broadcast' ? 'Broadcast Notifications' : 'Send Notification';
      }
    });
  }

  // View Notification Details
  async function handleViewNotification(id) {
    try {
      const res = await apiFetch(`/api/notifications/${id}`);
      if (!res || !res.ok) {
        showToast('Failed to load notification details', 'error');
        return;
      }

      const body = await res.json();
      const n = body.data?.notification;
      if (!n) {
        showToast('Notification details not found', 'error');
        return;
      }

      const isRead = Boolean(n.is_read);
      const recipientName = n.recipient_name || n.recipient_username || `User #${n.recipient_user_id}`;

      viewNotificationContent.innerHTML = `
        <div class="detail-item" style="grid-column: span 2; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0;">
          <h3 style="margin: 0 0 6px 0; font-size: 18px; color: #0f172a;">${escapeHtml(n.title)}</h3>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span class="badge" style="background-color: #f1f5f9; color: #334155;">${escapeHtml(n.notification_type || 'General')}</span>
            <span class="badge" style="background-color: ${isRead ? '#d1fae5' : '#fee2e2'}; color: ${isRead ? '#065f46' : '#991b1b'};">
              ${isRead ? 'Read' : 'Unread'}
            </span>
          </div>
        </div>

        <div class="detail-item">
          <label style="font-weight: 600; font-size: 12px; color: #64748b; display: block; margin-bottom: 2px;">Recipient</label>
          <div style="font-weight: 500; color: #1e293b;">${escapeHtml(recipientName)} (@${escapeHtml(n.recipient_username || 'n/a')})</div>
          <div style="font-size: 12px; color: #64748b;">${escapeHtml(n.recipient_email || 'No email')} &bull; ${escapeHtml(n.recipient_role || 'USER')}</div>
        </div>

        <div class="detail-item">
          <label style="font-weight: 600; font-size: 12px; color: #64748b; display: block; margin-bottom: 2px;">Sent Timestamp</label>
          <div style="font-weight: 500; color: #1e293b;">${formatDate(n.created_at)}</div>
        </div>

        <div class="detail-item" style="grid-column: span 2; margin-top: 10px;">
          <label style="font-weight: 600; font-size: 12px; color: #64748b; display: block; margin-bottom: 4px;">Message Body</label>
          <div style="background-color: #f8fafc; padding: 14px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${escapeHtml(n.message)}</div>
        </div>
      `;

      openModal(viewNotificationModal);
    } catch (err) {
      console.error('Error viewing notification:', err);
      showToast('Error loading notification details', 'error');
    }
  }

  // Toggle Read Status
  async function handleToggleRead(id, currentStatus) {
    const newStatus = currentStatus === '1' ? false : true;
    try {
      const res = await apiFetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ is_read: newStatus })
      });

      if (!res) return;
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || 'Failed to update status', 'error');
        return;
      }

      showToast(`Notification marked as ${newStatus ? 'read' : 'unread'}`, 'success');
      loadNotifications();
      loadNotificationStats();
    } catch (err) {
      console.error('Error toggling read status:', err);
      showToast('Network error while toggling status', 'error');
    }
  }

  // Open Delete Confirmation Modal
  function handleDeleteNotification(id, title, recipient) {
    pendingDeleteId = id;
    if (deleteNotificationDetails) {
      deleteNotificationDetails.innerHTML = `
        <strong>Title:</strong> ${escapeHtml(title)}<br>
        <strong>Recipient:</strong> ${escapeHtml(recipient)}<br>
        <strong>ID:</strong> #${escapeHtml(id)}
      `;
    }
    openModal(deleteNotificationModal);
  }

  // Confirm Delete
  if (btnConfirmDeleteNotification) {
    btnConfirmDeleteNotification.addEventListener('click', async () => {
      if (!pendingDeleteId) return;

      btnConfirmDeleteNotification.disabled = true;
      btnConfirmDeleteNotification.textContent = 'Deleting...';

      try {
        const res = await apiFetch(`/api/notifications/${pendingDeleteId}`, {
          method: 'DELETE'
        });

        if (!res) {
          btnConfirmDeleteNotification.disabled = false;
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          showToast(data.message || 'Failed to delete notification', 'error');
          btnConfirmDeleteNotification.disabled = false;
          btnConfirmDeleteNotification.textContent = 'Confirm Delete';
          return;
        }

        showToast('Notification deleted successfully', 'success');
        closeModal(deleteNotificationModal);
        loadNotifications();
        loadNotificationStats();
      } catch (err) {
        console.error('Error deleting notification:', err);
        showToast('An unexpected network error occurred', 'error');
      } finally {
        btnConfirmDeleteNotification.disabled = false;
        btnConfirmDeleteNotification.textContent = 'Confirm Delete';
        pendingDeleteId = null;
      }
    });
  }

  // Delegate Table Action Buttons
  if (notificationsBody) {
    notificationsBody.addEventListener('click', (e) => {
      const targetBtn = e.target.closest('button');
      if (!targetBtn) return;

      const id = targetBtn.dataset.id;
      if (!id) return;

      if (targetBtn.classList.contains('btn-view')) {
        handleViewNotification(id);
      } else if (targetBtn.classList.contains('btn-toggle-read')) {
        const currentStatus = targetBtn.dataset.status;
        handleToggleRead(id, currentStatus);
      } else if (targetBtn.classList.contains('btn-delete')) {
        const title = targetBtn.dataset.title;
        const recipient = targetBtn.dataset.recipient;
        handleDeleteNotification(id, title, recipient);
      }
    });
  }

  // Modal Dismiss Triggers (Buttons with data-dismiss="modal" or backdrop clicks)
  document.querySelectorAll('[data-dismiss="modal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-backdrop') || btn.closest('.erp-modal-overlay');
      if (modal) closeModal(modal);
    });
  });

  [sendNotificationModal, viewNotificationModal, deleteNotificationModal].forEach(modal => {
    if (!modal) return;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  // ==========================================================================
  // 8. FILTER & PAGINATION LISTENERS
  // ==========================================================================
  let debounceTimeout = null;
  if (filterSearch) {
    filterSearch.addEventListener('input', () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        currentPage = 1;
        loadNotifications();
      }, 300);
    });
  }

  if (filterRole) {
    filterRole.addEventListener('change', () => {
      currentPage = 1;
      loadNotifications();
    });
  }

  if (filterType) {
    filterType.addEventListener('change', () => {
      currentPage = 1;
      loadNotifications();
    });
  }

  if (filterIsRead) {
    filterIsRead.addEventListener('change', () => {
      currentPage = 1;
      loadNotifications();
    });
  }

  if (btnResetFilters) {
    btnResetFilters.addEventListener('click', () => {
      if (filterSearch) filterSearch.value = '';
      if (filterRole) filterRole.value = '';
      if (filterType) filterType.value = '';
      if (filterIsRead) filterIsRead.value = '';
      currentPage = 1;
      loadNotifications();
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadNotifications();
      loadNotificationStats();
    });
  }

  if (btnPrevPage) {
    btnPrevPage.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadNotifications();
      }
    });
  }

  if (btnNextPage) {
    btnNextPage.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        loadNotifications();
      }
    });
  }

  // Mobile sidebar toggle
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
  const adminSidebar = document.getElementById('adminSidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  if (sidebarToggleBtn && adminSidebar) {
    sidebarToggleBtn.addEventListener('click', () => {
      adminSidebar.classList.add('open');
      if (sidebarBackdrop) sidebarBackdrop.classList.remove('hidden');
    });
  }

  if (sidebarCloseBtn && adminSidebar) {
    sidebarCloseBtn.addEventListener('click', () => {
      adminSidebar.classList.remove('open');
      if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
    });
  }

  if (sidebarBackdrop && adminSidebar) {
    sidebarBackdrop.addEventListener('click', () => {
      adminSidebar.classList.remove('open');
      sidebarBackdrop.classList.add('hidden');
    });
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
  // 9. INITIALIZATION
  // ==========================================================================
  loadActiveUsers();
  loadNotificationStats();
  loadNotifications();

})();
