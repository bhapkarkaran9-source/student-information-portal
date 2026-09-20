/**
 * Teacher Notice Board Controller - Student Information Portal
 * Supports Viewing Campus Notices, Priority Filtering, and Announcement Bulletins.
 * 100% Zero Images | Pure CSS Gradients & SVGs | Accessible ERP Theme
 */

(function () {
  'use strict';

  let allNotices = [];
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

  async function initNotices() {
    if (typeof requireAuth === 'function') {
      const isAuthed = requireAuth('TEACHER');
      if (!isAuthed) return;
    }

    setupFilters();
    await loadNotices();
    await loadNotificationsCount();
  }

  function setupFilters() {
    const filterBtns = document.querySelectorAll('.notice-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => {
          b.classList.remove('active');
          b.style.background = '#f1f5f9';
          b.style.color = '#334155';
        });

        btn.classList.add('active');
        btn.style.background = '#0d9488';
        btn.style.color = '#ffffff';

        currentFilter = btn.getAttribute('data-filter') || 'all';
        applyFilter();
      });
    });

    const searchInput = document.getElementById('noticeSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        applyFilter();
      });
    }
  }

  async function loadNotices() {
    try {
      const res = await apiFetch('/api/notices?limit=50');
      if (res && res.success && res.data) {
        allNotices = Array.isArray(res.data) ? res.data : (res.data.notices || []);
      } else {
        allNotices = [];
      }

      updateKPIs(allNotices);
      applyFilter();
    } catch (err) {
      console.error('Failed to load notices:', err);
      allNotices = [];
      applyFilter();
    }
  }

  function updateKPIs(notices) {
    const totalEl = document.getElementById('statTotalNotices');
    if (totalEl) totalEl.textContent = notices.length;

    let highCount = 0;
    let academicCount = 0;

    notices.forEach(n => {
      if ((n.priority || '').toUpperCase() === 'HIGH') highCount++;
      if ((n.category || '').toLowerCase() === 'academic' || (n.target_role || '').toUpperCase() === 'TEACHER') academicCount++;
    });

    const highEl = document.getElementById('statHighPriorityNotices');
    if (highEl) highEl.textContent = highCount;

    const academicEl = document.getElementById('statFacultyNotices');
    if (academicEl) academicEl.textContent = academicCount;
  }

  function applyFilter() {
    const searchInput = document.getElementById('noticeSearchInput');
    const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

    let filtered = allNotices;

    if (currentFilter === 'high') {
      filtered = filtered.filter(n => (n.priority || '').toUpperCase() === 'HIGH');
    } else if (currentFilter === 'faculty') {
      filtered = filtered.filter(n => (n.target_role || '').toUpperCase() === 'TEACHER' || (n.target_role || '').toUpperCase() === 'ALL');
    } else if (currentFilter === 'student') {
      filtered = filtered.filter(n => (n.target_role || '').toUpperCase() === 'STUDENT');
    }

    if (query) {
      filtered = filtered.filter(n => {
        const title = (n.title || '').toLowerCase();
        const content = (n.content || n.message || '').toLowerCase();
        return title.includes(query) || content.includes(query);
      });
    }

    renderNotices(filtered, !!query || currentFilter !== 'all');
  }

  function renderNotices(notices, isFiltered = false) {
    const container = document.getElementById('noticesContainer');
    if (!container) return;

    if (!notices || notices.length === 0) {
      container.innerHTML = `
        <div class="teacher-empty-state" style="padding: 48px 24px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
          <div class="teacher-empty-icon" style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #ccfbf1; display: flex; align-items: center; justify-content: center; color: #0d9488;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: #0f172a;">${isFiltered ? 'No Matching Notices' : 'No Active Notices'}</h3>
          <p style="color: #64748b; max-width: 480px; margin: 0 auto; font-size: 14px;">
            ${isFiltered ? 'No circulars match the selected category or search keywords.' : 'There are no active faculty circulars or bulletins posted at this time.'}
          </p>
        </div>`;
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 14px;">';

    notices.forEach(n => {
      const isHigh = (n.priority || '').toUpperCase() === 'HIGH';
      const priorityBadge = isHigh
        ? '<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: #fee2e2; color: #991b1b;">URGENT</span>'
        : '<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #f1f5f9; color: #475569;">NORMAL</span>';

      const dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const targetStr = n.target_role || 'ALL';

      html += `
        <article class="card" style="background: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid ${isHigh ? '#dc2626' : '#0d9488'}; border-radius: 8px; padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #0f172a;">${escapeHtml(n.title)}</h3>
              ${priorityBadge}
            </div>
            <div style="font-size: 12.5px; color: #64748b;">${escapeHtml(dateStr)}</div>
          </div>
          <div style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 12px;">
            ${escapeHtml(n.content || n.message || '')}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 10px; font-size: 12px; color: #64748b;">
            <span>Target Audience: <strong style="color: #0f172a;">${escapeHtml(targetStr)}</strong></span>
            ${n.file_path ? `<a href="${escapeHtml(n.file_path)}" target="_blank" rel="noopener" style="color: #0d9488; font-weight: 600; text-decoration: none;">Download Circular PDF</a>` : ''}
          </div>
        </article>`;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  async function loadNotificationsCount() {
    try {
      const res = await apiFetch('/api/notifications/unread-count');
      const badge = document.getElementById('headerNotificationDot');
      if (badge && res && res.success && res.data && res.data.unread_count > 0) {
        badge.textContent = res.data.unread_count;
        badge.classList.remove('hidden');
        badge.style.display = 'inline-flex';
      }
    } catch (err) {
      // Graceful fallback
    }
  }

  document.addEventListener('DOMContentLoaded', initNotices);
})();
