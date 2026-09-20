/**
 * Admin Queries & Communication Management Script
 * Handles viewing queries, thread discussions, KPI counters, filters, and status overrides
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

  // Toast Helper
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-message">${escapeHtml(message)}</span>
      </div>
      <button type="button" class="toast-close" aria-label="Close">&times;</button>
    `;

    container.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    });

    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
      }
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

  function formatDate(dStr) {
    if (!dStr) return '-';
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // ==========================================================================
  // 2. UI STATE & ELEMENTS
  // ==========================================================================
  let currentPage = 1;
  const limit = 10;
  let totalPages = 1;
  let currentActiveQueryId = null;
  let deleteTargetQueryId = null;

  const kpiTotalQueries = document.getElementById('kpiTotalQueries');
  const kpiOpenQueries = document.getElementById('kpiOpenQueries');
  const kpiInProgressQueries = document.getElementById('kpiInProgressQueries');
  const kpiResolvedQueries = document.getElementById('kpiResolvedQueries');
  const kpiHighPriorityQueries = document.getElementById('kpiHighPriorityQueries');

  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const priorityFilter = document.getElementById('priorityFilter');
  const courseFilter = document.getElementById('courseFilter');
  const btnApplyFilter = document.getElementById('btnApplyFilter');
  const btnResetFilter = document.getElementById('btnResetFilter');
  const btnRefresh = document.getElementById('btnRefresh');

  const queriesTableBody = document.getElementById('queriesTableBody');
  const pageStart = document.getElementById('pageStart');
  const pageEnd = document.getElementById('pageEnd');
  const totalRecords = document.getElementById('totalRecords');
  const pageIndicator = document.getElementById('pageIndicator');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');

  // Modals
  const viewQueryModal = document.getElementById('viewQueryModal');
  const deleteQueryModal = document.getElementById('deleteQueryModal');
  const btnConfirmDeleteQuery = document.getElementById('btnConfirmDeleteQuery');
  const deleteQueryDetails = document.getElementById('deleteQueryDetails');

  const viewModalTitle = document.getElementById('viewModalTitle');
  const viewModalMeta = document.getElementById('viewModalMeta');
  const viewPriorityBadge = document.getElementById('viewPriorityBadge');
  const viewStatusBadge = document.getElementById('viewStatusBadge');
  const viewCourseBadge = document.getElementById('viewCourseBadge');
  const viewCreatedTime = document.getElementById('viewCreatedTime');
  const viewSubjectText = document.getElementById('viewSubjectText');
  const viewStudentInfo = document.getElementById('viewStudentInfo');
  const viewTeacherInfo = document.getElementById('viewTeacherInfo');
  const viewQuestionText = document.getElementById('viewQuestionText');
  const repliesCount = document.getElementById('repliesCount');
  const repliesTimeline = document.getElementById('repliesTimeline');
  const modalStatusSelect = document.getElementById('modalStatusSelect');
  const btnUpdateModalStatus = document.getElementById('btnUpdateModalStatus');

  // ==========================================================================
  // 3. DATA FETCHING & RENDERING
  // ==========================================================================

  // Load KPI Statistics
  async function loadKPIStats() {
    try {
      const res = await apiFetch('/api/queries/stats');
      if (!res) return;
      const data = await res.json();
      if (data.success && data.data) {
        const s = data.data;
        if (kpiTotalQueries) kpiTotalQueries.textContent = s.total_queries ?? 0;
        if (kpiOpenQueries) kpiOpenQueries.textContent = s.open_queries ?? 0;
        if (kpiInProgressQueries) kpiInProgressQueries.textContent = s.in_progress_queries ?? 0;
        if (kpiResolvedQueries) kpiResolvedQueries.textContent = s.resolved_queries ?? 0;
        if (kpiHighPriorityQueries) kpiHighPriorityQueries.textContent = s.high_priority_queries ?? 0;
      }
    } catch (err) {
      console.error('Error loading KPI statistics:', err);
    }
  }

  // Load Courses for Filter Dropdown
  async function loadCourseOptions() {
    try {
      const res = await apiFetch('/api/queries/courses');
      if (!res) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        if (courseFilter) {
          courseFilter.innerHTML = '<option value="">All Courses</option>';
          data.data.forEach((c) => {
            const opt = document.createElement('option');
            opt.value = c.course_id;
            opt.textContent = `${c.course_code ? c.course_code + ' - ' : ''}${c.course_name}`;
            courseFilter.appendChild(opt);
          });
        }
      }
    } catch (err) {
      console.error('Error loading courses:', err);
    }
  }

  // Load Queries Table
  async function loadQueriesTable(page = 1) {
    currentPage = page;
    if (queriesTableBody) {
      queriesTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center py-5 text-muted">
            <div class="spinner-border text-primary mb-2" role="status"></div>
            <div>Loading queries...</div>
          </td>
        </tr>
      `;
    }

    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: limit
      });

      if (searchInput && searchInput.value.trim()) params.append('search', searchInput.value.trim());
      if (statusFilter && statusFilter.value) params.append('status', statusFilter.value);
      if (priorityFilter && priorityFilter.value) params.append('priority', priorityFilter.value);
      if (courseFilter && courseFilter.value) params.append('course_id', courseFilter.value);

      const res = await apiFetch(`/api/queries?${params.toString()}`);
      if (!res) return;
      const json = await res.json();

      if (!json.success || !json.data) {
        throw new Error(json.message || 'Failed to load queries');
      }

      const { data, total, totalPages: pages } = json.data;
      totalPages = pages || 1;

      // Update pagination indicators
      const start = total === 0 ? 0 : (currentPage - 1) * limit + 1;
      const end = Math.min(currentPage * limit, total);
      if (pageStart) pageStart.textContent = start;
      if (pageEnd) pageEnd.textContent = end;
      if (totalRecords) totalRecords.textContent = total;
      if (pageIndicator) pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;

      if (btnPrevPage) btnPrevPage.disabled = currentPage <= 1;
      if (btnNextPage) btnNextPage.disabled = currentPage >= totalPages;

      if (!data || data.length === 0) {
        const hasFilters = (searchInput && searchInput.value.trim()) || (statusFilter && statusFilter.value) || (priorityFilter && priorityFilter.value) || (courseFilter && courseFilter.value);
        queriesTableBody.innerHTML = `
          <tr>
            <td colspan="9" style="padding: 40px 16px;">
              <div class="erp-empty-state">
                <div class="erp-empty-icon">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>
                <div class="erp-empty-title">No queries found</div>
                <div class="erp-empty-desc">${hasFilters ? 'No queries match your filters. Try clearing or adjusting search options.' : 'No academic inquiries have been logged in the portal.'}</div>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      // Render query rows (9 standard columns)
      queriesTableBody.innerHTML = data.map((q) => {
        // Priority styling
        let prioClass = 'erp-badge-neutral';
        if (q.priority === 'High') prioClass = 'erp-badge-danger';
        else if (q.priority === 'Medium') prioClass = 'erp-badge-warning';

        // Status styling
        let statusClass = 'erp-badge-neutral';
        if (q.status === 'Open' || q.status === 'Pending') statusClass = 'erp-badge-warning';
        else if (q.status === 'In Progress') statusClass = 'erp-badge-info';
        else if (q.status === 'Resolved' || q.status === 'Answered') statusClass = 'erp-badge-success';
        else if (q.status === 'Closed') statusClass = 'erp-badge-neutral';

        const studentLabel = `<div style="font-weight:600; color:#0f172a;">${escapeHtml(q.student_name)}</div>` + (q.student_prn ? `<div style="font-size:11px; color:#64748b;">PRN: ${escapeHtml(q.student_prn)}</div>` : '');
        const teacherLabel = `<div style="font-weight:600; color:#0f172a;">${escapeHtml(q.teacher_name)}</div>` + (q.teacher_designation ? `<div style="font-size:11px; color:#64748b;">${escapeHtml(q.teacher_designation)}</div>` : '');
        const courseLabel = q.course_code ? `<span class="erp-badge erp-badge-neutral">${escapeHtml(q.course_code)}</span>` : (q.course_name ? escapeHtml(q.course_name) : '<span style="color:#94a3b8;">General</span>');

        return `
          <tr>
            <td><strong style="color: #0f766e;">#${q.query_id}</strong></td>
            <td>
              <div style="font-weight: 600; color: #1e293b;">${escapeHtml(q.subject)}</div>
              <div style="font-size: 11px; margin-top: 2px;">
                ${q.reply_count > 0 ? `<span class="erp-badge erp-badge-info" style="font-size:10px; padding:1px 6px;">${q.reply_count} ${q.reply_count === 1 ? 'reply' : 'replies'}</span>` : '<span style="color:#94a3b8;">No replies yet</span>'}
              </div>
            </td>
            <td>${courseLabel}</td>
            <td>${studentLabel}</td>
            <td>${teacherLabel}</td>
            <td><span class="erp-badge ${prioClass}">${escapeHtml(q.priority)}</span></td>
            <td><span class="erp-badge ${statusClass}">${escapeHtml(q.status)}</span></td>
            <td style="font-size: 12px; color: #64748b; white-space: nowrap;">${formatDate(q.updated_at || q.created_at)}</td>
            <td style="text-align: right; white-space: nowrap;">
              <div class="erp-action-btn-group" style="display: inline-flex; gap: 4px; justify-content: flex-end;">
                <button type="button" class="btn-row-action btn-view" data-id="${q.query_id}" title="View Conversation Thread">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                </button>
                <button type="button" class="btn-row-action btn-row-action-danger btn-delete" data-id="${q.query_id}" data-subject="${escapeHtml(q.subject)}" title="Delete Query">
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

      // Attach row action listeners
      queriesTableBody.querySelectorAll('.btn-view').forEach((btn) => {
        btn.addEventListener('click', () => openViewModal(btn.dataset.id));
      });

      queriesTableBody.querySelectorAll('.btn-delete').forEach((btn) => {
        btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, btn.dataset.subject));
      });

    } catch (err) {
      console.error('Error loading queries table:', err);
      queriesTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="padding: 30px; text-align: center; color: #ef4444;">
            Error loading queries: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  // ==========================================================================
  // 4. CONVERSATION MODAL & THREAD DETAILS
  // ==========================================================================
  async function openViewModal(queryId) {
    currentActiveQueryId = queryId;
    if (viewQueryModal) {
      viewQueryModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }

    if (viewModalTitle) viewModalTitle.textContent = `Query #${queryId}`;
    if (viewModalMeta) viewModalMeta.textContent = 'Loading details...';
    if (repliesTimeline) repliesTimeline.innerHTML = '<div style="color: #64748b; text-align: center; padding: 20px;">Loading discussion thread...</div>';

    try {
      const res = await apiFetch(`/api/queries/${queryId}`);
      if (!res) return;
      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.message || 'Failed to load query details');
      }

      const q = json.data;

      if (viewModalMeta) viewModalMeta.textContent = `Submitted on ${formatDate(q.created_at)}`;
      if (viewSubjectText) viewSubjectText.textContent = q.subject;
      if (viewQuestionText) viewQuestionText.textContent = q.question;

      if (viewStudentInfo) {
        viewStudentInfo.innerHTML = `${escapeHtml(q.student_name)} ${q.student_prn ? `(PRN: ${escapeHtml(q.student_prn)})` : ''} &bull; ${escapeHtml(q.student_email || '')}`;
      }
      if (viewTeacherInfo) {
        viewTeacherInfo.innerHTML = `${escapeHtml(q.teacher_name)} ${q.teacher_designation ? `(${escapeHtml(q.teacher_designation)})` : ''}`;
      }

      // Priority Badge
      let prioClass = 'erp-badge-neutral';
      if (q.priority === 'High') prioClass = 'erp-badge-danger';
      else if (q.priority === 'Medium') prioClass = 'erp-badge-warning';
      if (viewPriorityBadge) {
        viewPriorityBadge.className = `erp-badge ${prioClass}`;
        viewPriorityBadge.textContent = `${q.priority} Priority`;
      }

      // Status Badge
      let statusClass = 'erp-badge-neutral';
      if (q.status === 'Open' || q.status === 'Pending') statusClass = 'erp-badge-warning';
      else if (q.status === 'In Progress') statusClass = 'erp-badge-info';
      else if (q.status === 'Resolved' || q.status === 'Answered') statusClass = 'erp-badge-success';
      if (viewStatusBadge) {
        viewStatusBadge.className = `erp-badge ${statusClass}`;
        viewStatusBadge.textContent = q.status;
      }

      // Course Badge
      if (viewCourseBadge) {
        if (q.course_name) {
          viewCourseBadge.textContent = q.course_code ? `${q.course_code}: ${q.course_name}` : q.course_name;
          viewCourseBadge.style.display = 'inline-block';
        } else {
          viewCourseBadge.textContent = 'General Query';
          viewCourseBadge.style.display = 'inline-block';
        }
      }

      if (viewCreatedTime) viewCreatedTime.textContent = formatDate(q.created_at);

      // Status Selector
      if (modalStatusSelect) {
        modalStatusSelect.value = q.status;
      }

      // Render Replies
      const replies = q.replies || [];
      if (repliesCount) repliesCount.textContent = replies.length;

      if (replies.length === 0) {
        repliesTimeline.innerHTML = `
          <div style="color: #64748b; text-align: center; padding: 24px; font-size: 13px;">
            No responses recorded on this thread yet.
          </div>
        `;
      } else {
        repliesTimeline.innerHTML = replies.map((r) => {
          let bubbleClass = 'erp-chat-bubble-student';
          let roleBadgeClass = 'erp-badge-primary';
          if (r.sender_role === 'TEACHER') {
            bubbleClass = 'erp-chat-bubble-teacher';
            roleBadgeClass = 'erp-badge-success';
          } else if (r.sender_role === 'ADMIN') {
            bubbleClass = 'erp-chat-bubble-admin';
            roleBadgeClass = 'erp-badge-danger';
          }

          return `
            <div class="erp-chat-bubble ${bubbleClass}">
              <div class="erp-chat-header">
                <div>
                  <span class="erp-chat-author">${escapeHtml(r.sender_name || 'User')}</span>
                  <span class="erp-badge ${roleBadgeClass}" style="font-size: 10px; padding: 1px 6px; margin-left: 6px;">${escapeHtml(r.sender_role || 'User')}</span>
                </div>
                <span class="erp-chat-time">${formatDate(r.created_at)}</span>
              </div>
              <div class="erp-chat-message">${escapeHtml(r.message)}</div>
            </div>
          `;
        }).join('');
      }

    } catch (err) {
      console.error('Error fetching query detail:', err);
      showToast(err.message || 'Failed to fetch query details', 'error');
    }
  }

  // Update Status from Modal
  if (btnUpdateModalStatus) {
    btnUpdateModalStatus.addEventListener('click', async () => {
      if (!currentActiveQueryId) return;
      const newStatus = modalStatusSelect.value;
      if (!newStatus) return;

      btnUpdateModalStatus.disabled = true;
      btnUpdateModalStatus.textContent = 'Updating...';

      try {
        const res = await apiFetch(`/api/queries/${currentActiveQueryId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus })
        });
        if (!res) return;
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.message || 'Failed to update status');
        }

        showToast('Query status updated successfully', 'success');
        await openViewModal(currentActiveQueryId);
        loadQueriesTable(currentPage);
        loadKPIStats();
      } catch (err) {
        console.error('Error updating status:', err);
        showToast(err.message || 'Error updating status', 'error');
      } finally {
        btnUpdateModalStatus.disabled = false;
        btnUpdateModalStatus.textContent = 'Update Status';
      }
    });
  }

  // ==========================================================================
  // 5. DELETE MODAL
  // ==========================================================================
  function openDeleteModal(queryId, subject) {
    deleteTargetQueryId = queryId;
    if (deleteQueryDetails) {
      deleteQueryDetails.textContent = `Query #${queryId}: "${subject}"`;
    }
    if (deleteQueryModal) {
      deleteQueryModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  if (btnConfirmDeleteQuery) {
    btnConfirmDeleteQuery.addEventListener('click', async () => {
      if (!deleteTargetQueryId) return;

      btnConfirmDeleteQuery.disabled = true;
      btnConfirmDeleteQuery.textContent = 'Deleting...';

      try {
        const res = await apiFetch(`/api/queries/${deleteTargetQueryId}`, {
          method: 'DELETE'
        });
        if (!res) return;
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.message || 'Failed to delete query');
        }

        showToast('Query deleted successfully', 'success');
        if (deleteQueryModal) {
          deleteQueryModal.classList.add('hidden');
          document.body.style.overflow = '';
        }
        deleteTargetQueryId = null;

        loadQueriesTable(currentPage);
        loadKPIStats();
      } catch (err) {
        console.error('Error deleting query:', err);
        showToast(err.message || 'Error deleting query', 'error');
      } finally {
        btnConfirmDeleteQuery.disabled = false;
        btnConfirmDeleteQuery.textContent = 'Confirm Delete';
      }
    });
  }

  // ==========================================================================
  // 6. EVENT LISTENERS & FILTERING
  // ==========================================================================

  // Filter Apply
  if (btnApplyFilter) {
    btnApplyFilter.addEventListener('click', () => {
      loadQueriesTable(1);
    });
  }

  // Filter Reset
  if (btnResetFilter) {
    btnResetFilter.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (statusFilter) statusFilter.value = '';
      if (priorityFilter) priorityFilter.value = '';
      if (courseFilter) courseFilter.value = '';
      loadQueriesTable(1);
    });
  }

  // Refresh
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadKPIStats();
      loadQueriesTable(currentPage);
      showToast('Data refreshed', 'info');
    });
  }

  // Pagination
  if (btnPrevPage) {
    btnPrevPage.addEventListener('click', () => {
      if (currentPage > 1) loadQueriesTable(currentPage - 1);
    });
  }

  if (btnNextPage) {
    btnNextPage.addEventListener('click', () => {
      if (currentPage < totalPages) loadQueriesTable(currentPage + 1);
    });
  }

  // Modal dismiss buttons
  document.querySelectorAll('[data-dismiss="modal"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop, .erp-modal-overlay').forEach((m) => m.classList.add('hidden'));
      document.body.style.overflow = '';
    });
  });

  // Close modals on backdrop click
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop') || e.target.classList.contains('erp-modal-overlay')) {
      e.target.classList.add('hidden');
      document.body.style.overflow = '';
    }
  });

  // Logout
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/login.html');
    });
  }

  // Sidebar Toggle (Mobile)
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

  function closeSidebar() {
    if (adminSidebar) adminSidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
  }

  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

  // ==========================================================================
  // 7. INITIALIZATION
  // ==========================================================================
  loadKPIStats();
  loadCourseOptions();
  loadQueriesTable(1);

})();
