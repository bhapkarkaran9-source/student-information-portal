/**
 * Teacher Notifications Controller - Student Information Portal
 * Connects to /api/notifications with filtering, mark-read, mark-all-read, and live badge updates.
 * 100% Zero Images | Pure CSS Gradients & SVGs | Accessible ERP Theme
 */

(function () {
  'use strict';

  let allNotifications = [];
  let currentFilter = 'all';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.padding = '12px 18px';
    toast.style.background = type === 'success' ? '#0f766e' : type === 'error' ? '#dc2626' : '#1e293b';
    toast.style.color = '#ffffff';
    toast.style.borderRadius = '6px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.marginBottom = '10px';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.justifyContent = 'space-between';
    toast.style.gap = '12px';
    toast.style.fontSize = '13.5px';

    toast.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <button type="button" style="background: none; border: none; color: #fff; font-size: 16px; cursor: pointer;">&times;</button>
    `;

    container.appendChild(toast);
    const closeBtn = toast.querySelector('button');
    closeBtn.addEventListener('click', () => toast.remove());
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
  }

  async function initNotifications() {
    if (typeof requireAuth === 'function') {
      const isAuthed = requireAuth('TEACHER');
      if (!isAuthed) return;
    }

    setupToolbar();
    await loadNotifications();
  }

  function setupToolbar() {
    const btnAll = document.getElementById('btnFilterAll');
    const btnUnread = document.getElementById('btnFilterUnread');
    const btnRefresh = document.getElementById('btnRefreshNotifs');
    const btnMarkAll = document.getElementById('btnMarkAllRead');

    if (btnAll) {
      btnAll.addEventListener('click', () => {
        currentFilter = 'all';
        btnAll.style.background = '#0d9488';
        btnAll.style.color = '#ffffff';
        if (btnUnread) {
          btnUnread.style.background = '#f1f5f9';
          btnUnread.style.color = '#334155';
        }
        renderNotifications();
      });
    }

    if (btnUnread) {
      btnUnread.addEventListener('click', () => {
        currentFilter = 'unread';
        btnUnread.style.background = '#0d9488';
        btnUnread.style.color = '#ffffff';
        if (btnAll) {
          btnAll.style.background = '#f1f5f9';
          btnAll.style.color = '#334155';
        }
        renderNotifications();
      });
    }

    if (btnRefresh) {
      btnRefresh.addEventListener('click', async () => {
        await loadNotifications();
        showToast('Notifications refreshed.', 'info');
      });
    }

    if (btnMarkAll) {
      btnMarkAll.addEventListener('click', async () => {
        try {
          const res = await apiFetch('/api/notifications/read-all', {
            method: 'PATCH'
          });
          if (res && res.success) {
            showToast('All notifications marked as read.', 'success');
            await loadNotifications();
            if (window.UserMenu && typeof window.UserMenu.updateUnreadNotificationCount === 'function') {
              window.UserMenu.updateUnreadNotificationCount();
            }
          }
        } catch (e) {
          showToast('Failed to mark all as read.', 'error');
        }
      });
    }
  }

  async function loadNotifications() {
    try {
      const res = await apiFetch('/api/notifications?limit=50');
      if (res && res.success && res.data) {
        allNotifications = Array.isArray(res.data) ? res.data : (res.data.notifications || []);
      } else {
        allNotifications = [];
      }

      updateKPIs(allNotifications);
      renderNotifications();
    } catch (err) {
      console.error('Failed to load notifications:', err);
      allNotifications = [];
      renderNotifications();
    }
  }

  function updateKPIs(notifs) {
    const unreadCount = notifs.filter(n => !n.is_read).length;
    const kpiU = document.getElementById('kpiUnreadCount');
    const kpiT = document.getElementById('kpiTotalCount');
    if (kpiU) kpiU.textContent = unreadCount;
    if (kpiT) kpiT.textContent = notifs.length;

    const badge = document.getElementById('headerNotificationDot');
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.classList.remove('hidden');
        badge.style.display = 'inline-flex';
      } else {
        badge.classList.add('hidden');
        badge.style.display = 'none';
      }
    }
  }

  function renderNotifications() {
    const list = document.getElementById('notificationsList');
    if (!list) return;

    const filtered = currentFilter === 'unread'
      ? allNotifications.filter(n => !n.is_read)
      : allNotifications;

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="card" style="padding: 48px 24px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
          <div style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #ccfbf1; display: flex; align-items: center; justify-content: center; color: #0d9488;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline>
            </svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: #0f172a;">No Notifications</h3>
          <p style="color: #64748b; max-width: 480px; margin: 0 auto; font-size: 14px;">
            ${currentFilter === 'unread' ? 'You have no unread alerts or notifications.' : 'You have no new alerts, student queries, or messages at this time.'}
          </p>
        </div>`;
      return;
    }

    list.innerHTML = '';
    filtered.forEach(n => {
      const item = document.createElement('div');
      item.className = 'card';
      item.style.padding = '16px';
      item.style.background = n.is_read ? '#ffffff' : '#f0fdfa';
      item.style.border = '1px solid ' + (n.is_read ? '#e2e8f0' : '#99f6e4');
      item.style.borderLeft = '4px solid ' + (n.is_read ? '#cbd5e1' : '#0d9488');
      item.style.borderRadius = '8px';
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.gap = '14px';

      const dateStr = n.created_at ? new Date(n.created_at).toLocaleString() : '';

      item.innerHTML = `
        <div style="flex: 1;">
          <div style="font-weight: 700; color: #0f172a; margin-bottom: 4px; font-size: 14.5px;">${escapeHtml(n.title)}</div>
          <div style="font-size: 13.5px; color: #475569; margin-bottom: 6px; line-height: 1.5;">${escapeHtml(n.message)}</div>
          <div style="font-size: 12px; color: #94a3b8;">${escapeHtml(dateStr)}</div>
        </div>
        <div>
          ${!n.is_read ? `<button type="button" class="btn-mark-read" data-id="${n.notification_id}" style="padding: 6px 12px; font-size: 12px; background: #0d9488; color: #ffffff; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; white-space: nowrap;">Mark Read</button>` : '<span style="font-size: 12px; color: #94a3b8;">Read</span>'}
        </div>
      `;

      list.appendChild(item);
    });

    list.querySelectorAll('.btn-mark-read').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.getAttribute('data-id');
        try {
          await apiFetch(`/api/notifications/${id}/read`, {
            method: 'PATCH',
            body: JSON.stringify({ is_read: true })
          });
          await loadNotifications();
          if (window.UserMenu && typeof window.UserMenu.updateUnreadNotificationCount === 'function') {
            window.UserMenu.updateUnreadNotificationCount();
          }
        } catch (e) {
          showToast('Could not mark notification as read.', 'error');
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', initNotifications);
})();
