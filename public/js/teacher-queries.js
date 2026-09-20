/**
 * Teacher Queries Client Script
 * Handles reviewing student questions, posting replies, and managing query resolution statuses
 */

(function () {
  'use strict';

  // 1. Session & Auth Guard
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

  if (currentUser.role !== 'TEACHER') {
    window.location.replace('/login.html');
    return;
  }

  // Update username badge
  const navUserName = document.getElementById('navUserName');
  if (navUserName) {
    navUserName.textContent = currentUser.first_name || currentUser.username || 'Faculty Member';
  }

  // API helper
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
    }, 4000);
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

  // 2. State & DOM References
  let activeQueryId = null;

  const kpiTotalQueries = document.getElementById('kpiTotalQueries');
  const kpiOpenQueries = document.getElementById('kpiOpenQueries');
  const kpiInProgressQueries = document.getElementById('kpiInProgressQueries');
  const kpiResolvedQueries = document.getElementById('kpiResolvedQueries');
  const kpiHighPriorityQueries = document.getElementById('kpiHighPriorityQueries');

  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const priorityFilter = document.getElementById('priorityFilter');
  const courseFilter = document.getElementById('courseFilter');
  const btnRefresh = document.getElementById('btnRefresh');
  const btnResetFilters = document.getElementById('btnResetFilters');

  const teacherQueriesTableBody = document.getElementById('teacherQueriesTableBody');
  const teacherThreadModal = document.getElementById('teacherThreadModal');
  const tModalTitle = document.getElementById('tModalTitle');
  const tModalMeta = document.getElementById('tModalMeta');
  const tPriorityBadge = document.getElementById('tPriorityBadge');
  const tStatusBadge = document.getElementById('tStatusBadge');
  const tCourseBadge = document.getElementById('tCourseBadge');
  const tCreatedTime = document.getElementById('tCreatedTime');
  const tSubjectText = document.getElementById('tSubjectText');
  const tStudentInfo = document.getElementById('tStudentInfo');
  const tQuestionText = document.getElementById('tQuestionText');
  const tRepliesContainer = document.getElementById('tRepliesContainer');
  const tReplyInput = document.getElementById('tReplyInput');
  const tStatusSelect = document.getElementById('tStatusSelect');
  const btnQuickResolve = document.getElementById('btnQuickResolve');
  const btnTeacherSendReply = document.getElementById('btnTeacherSendReply');

  // 3. Load KPIs
  async function loadKPIs() {
    try {
      const res = await apiFetch('/api/queries/stats');
      if (!res) return;
      const json = await res.json();
      if (json.success && json.data) {
        const s = json.data;
        if (kpiTotalQueries) kpiTotalQueries.textContent = s.total_queries ?? 0;
        if (kpiOpenQueries) kpiOpenQueries.textContent = (s.open_queries ?? 0) + (s.pending_queries ?? 0);
        if (kpiInProgressQueries) kpiInProgressQueries.textContent = s.in_progress_queries ?? 0;
        if (kpiResolvedQueries) kpiResolvedQueries.textContent = (s.resolved_queries ?? 0) + (s.closed_queries ?? 0);
        if (kpiHighPriorityQueries) kpiHighPriorityQueries.textContent = s.high_priority_queries ?? 0;
      }
    } catch (err) {
      console.error('Error loading KPIs:', err);
    }
  }

  // Load teacher assigned courses for course filter
  async function loadAssignedCourses() {
    if (!courseFilter) return;
    try {
      const res = await apiFetch('/api/courses?all=true');
      if (!res) return;
      const json = await res.json();
      if (json.success && json.data) {
        const courses = Array.isArray(json.data) ? json.data : (json.data.courses || []);
        courseFilter.innerHTML = '<option value="">All Courses</option>';
        courses.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.course_id;
          opt.textContent = `${c.course_code} - ${c.course_name}`;
          courseFilter.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Could not load course filter:', err);
    }
  }

  // Helper for priority badge HTML
  function getPriorityBadgeHtml(prio) {
    const p = String(prio || 'Medium').trim();
    if (p === 'High') {
      return '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;">High</span>';
    }
    if (p === 'Medium') {
      return '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #fef3c7; color: #b45309; border: 1px solid #fde68a;">Medium</span>';
    }
    return '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">Low</span>';
  }

  // Helper for status badge HTML
  function getStatusBadgeHtml(status) {
    const s = String(status || 'Open').trim();
    if (s === 'Open') {
      return '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #fef3c7; color: #b45309; border: 1px solid #fde68a;">Open</span>';
    }
    if (s === 'Pending') {
      return '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #fffbeb; color: #d97706; border: 1px solid #fde68a;">Pending</span>';
    }
    if (s === 'In Progress') {
      return '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;">In Progress</span>';
    }
    if (s === 'Resolved' || s === 'Answered') {
      return '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;">Resolved</span>';
    }
    return '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">Closed</span>';
  }

  // 4. Load Assigned Queries Table
  async function loadTeacherQueries() {
    if (teacherQueriesTableBody) {
      teacherQueriesTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center py-4 text-muted">
            Loading assigned queries...
          </td>
        </tr>
      `;
    }

    try {
      const params = new URLSearchParams({
        page: 1,
        limit: 50
      });

      if (searchInput && searchInput.value.trim()) params.append('search', searchInput.value.trim());
      if (statusFilter && statusFilter.value) params.append('status', statusFilter.value);
      if (priorityFilter && priorityFilter.value) params.append('priority', priorityFilter.value);
      if (courseFilter && courseFilter.value) params.append('course_id', courseFilter.value);

      const res = await apiFetch(`/api/queries?${params.toString()}`);
      if (!res) return;
      const json = await res.json();

      if (!json.success || !json.data) {
        throw new Error(json.message || 'Failed to fetch queries');
      }

      const list = json.data.data || [];
      if (list.length === 0) {
        const hasFilters = (searchInput && searchInput.value.trim()) || (statusFilter && statusFilter.value) || (priorityFilter && priorityFilter.value) || (courseFilter && courseFilter.value);
        teacherQueriesTableBody.innerHTML = `
          <tr>
            <td colspan="9" class="text-center py-5" style="text-align: center; padding: 48px 20px;">
              <div class="query-empty-box">
                <div class="query-empty-icon">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>
                <div class="query-empty-title">${hasFilters ? 'No Matching Queries' : 'No Queries Submitted'}</div>
                <div class="query-empty-sub">${hasFilters ? 'No queries match your current filter selection. Try clearing filters or changing the search term.' : 'Students enrolled in your courses haven\'t submitted any doubts or inquiries yet.'}</div>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      teacherQueriesTableBody.innerHTML = list.map((q) => {
        const studentName = escapeHtml(q.student_name || 'Student');
        const studentInitial = (studentName.charAt(0) || 'S').toUpperCase();
        const studentDisplay = `
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="query-user-avatar">${studentInitial}</div>
            <div>
              <div style="font-weight: 600; color: #0f172a; font-size: 13.5px;">${studentName}</div>
              ${q.student_prn ? `<div style="font-size: 11.5px; color: #64748b;">PRN: ${escapeHtml(q.student_prn)}</div>` : ''}
            </div>
          </div>
        `;
        const courseDisplay = q.course_code 
          ? `<span style="display: inline-block; padding: 3px 8px; background: #f0fdfa; color: #0d9488; border: 1px solid #ccfbf1; border-radius: 6px; font-weight: 600; font-size: 12px;">${escapeHtml(q.course_code)}</span>`
          : '<span class="text-muted" style="font-size: 12px;">General Query</span>';
        
        const teacherDisplay = escapeHtml(q.teacher_name || currentUser.full_name || 'Faculty Member');

        return `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="font-weight: 700; color: #0d9488;">#${q.query_id}</td>
            <td>
              <div style="font-weight: 600; color: #0f172a; font-size: 13.5px; line-height: 1.3;">${escapeHtml(q.subject)}</div>
              <div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">
                ${q.reply_count > 0 ? `<span style="color: #0284c7; font-weight: 600;">${q.reply_count} ${q.reply_count === 1 ? 'reply' : 'replies'}</span>` : '<span style="color: #d97706; font-weight: 500;">Awaiting reply</span>'}
              </div>
            </td>
            <td>${courseDisplay}</td>
            <td>${studentDisplay}</td>
            <td style="font-size: 13px; color: #334155;">${teacherDisplay}</td>
            <td>${getPriorityBadgeHtml(q.priority)}</td>
            <td>${getStatusBadgeHtml(q.status)}</td>
            <td style="font-size: 12px; color: #64748b;">${formatDate(q.updated_at || q.created_at)}</td>
            <td style="text-align: right;">
              <button type="button" class="btn btn-sm btn-primary btn-open-thread" data-id="${q.query_id}" style="padding: 6px 14px; font-size: 12.5px; font-weight: 600; background: #0d9488; color: #fff; border: none; border-radius: 6px; cursor: pointer; transition: background 0.15s ease;">
                View / Reply
              </button>
            </td>
          </tr>
        `;
      }).join('');

      teacherQueriesTableBody.querySelectorAll('.btn-open-thread').forEach((btn) => {
        btn.addEventListener('click', () => openThreadModal(btn.dataset.id));
      });

    } catch (err) {
      console.error('Error loading teacher queries:', err);
      teacherQueriesTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center py-5">
            <div class="query-error-box">
              <div class="query-error-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <div class="query-empty-title">Unable to load queries</div>
              <div class="query-empty-sub" style="margin-bottom: 14px;">${escapeHtml(err.message || 'An error occurred while communicating with the server.')}</div>
              <button type="button" id="btnRetryQueries" class="btn btn-secondary btn-sm" style="font-weight: 600; padding: 6px 16px;">
                Retry
              </button>
            </div>
          </td>
        </tr>
      `;
      const retryBtn = document.getElementById('btnRetryQueries');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => loadTeacherQueries());
      }
    }
  }

  // 5. Open Discussion Modal
  async function openThreadModal(queryId) {
    activeQueryId = queryId;
    if (teacherThreadModal) teacherThreadModal.classList.remove('hidden');

    if (tModalTitle) tModalTitle.textContent = `Query #${queryId}`;
    if (tModalMeta) tModalMeta.textContent = 'Loading details...';
    if (tRepliesContainer) tRepliesContainer.innerHTML = '<div class="text-center py-3 text-muted">Loading messages...</div>';

    try {
      const res = await apiFetch(`/api/queries/${queryId}`);
      if (!res) return;
      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.message || 'Failed to load query details');
      }

      const q = json.data;

      if (tModalMeta) tModalMeta.textContent = `Submitted on ${formatDate(q.created_at)}`;
      if (tSubjectText) tSubjectText.textContent = q.subject;
      if (tQuestionText) tQuestionText.textContent = q.question;
      if (tStudentInfo) tStudentInfo.innerHTML = `${escapeHtml(q.student_name)} ${q.student_prn ? `(PRN: ${escapeHtml(q.student_prn)})` : ''} &bull; ${escapeHtml(q.student_email || '')}`;
      if (tCreatedTime) tCreatedTime.textContent = formatDate(q.created_at);

      // Priority Badge
      let prioBadge = 'badge-secondary';
      if (q.priority === 'High') prioBadge = 'badge-danger';
      else if (q.priority === 'Medium') prioBadge = 'badge-warning';
      if (tPriorityBadge) {
        tPriorityBadge.className = `badge ${prioBadge}`;
        tPriorityBadge.textContent = `${q.priority} Priority`;
      }

      // Status Badge
      let statusBadge = 'badge-secondary';
      if (q.status === 'Open' || q.status === 'Pending') statusBadge = 'badge-warning';
      else if (q.status === 'In Progress') statusBadge = 'badge-info';
      else if (q.status === 'Resolved' || q.status === 'Answered') statusBadge = 'badge-success';
      if (tStatusBadge) {
        tStatusBadge.className = `badge ${statusBadge}`;
        tStatusBadge.textContent = q.status;
      }

      // Course Badge
      if (tCourseBadge) {
        if (q.course_name) {
          tCourseBadge.textContent = q.course_code ? `${q.course_code}: ${q.course_name}` : q.course_name;
          tCourseBadge.style.display = 'inline-block';
        } else {
          tCourseBadge.textContent = 'General Query';
          tCourseBadge.style.display = 'inline-block';
        }
      }

      // Sync status select
      if (tStatusSelect) {
        tStatusSelect.value = q.status === 'Open' || q.status === 'Pending' ? 'In Progress' : q.status;
      }

      // Render replies
      // Render replies in chat-thread bubble layout
      const replies = q.replies || [];
      if (replies.length === 0) {
        tRepliesContainer.innerHTML = `
          <div style="text-align: center; padding: 28px 16px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 13.5px;">
            No responses yet. Submit your initial reply below to assist this student.
          </div>
        `;
      } else {
        tRepliesContainer.innerHTML = replies.map((r) => {
          const isFaculty = r.sender_user_id === currentUser.user_id || (r.sender_role && (r.sender_role === 'TEACHER' || r.sender_role === 'ADMIN'));
          if (isFaculty) {
            return `
              <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; justify-content: flex-end;">
                <div style="max-width: 82%; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px 8px 2px 8px; padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                  <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 5px;">
                    <span style="font-size: 11px; color: #94a3b8;">${formatDate(r.created_at)}</span>
                    <div style="font-size: 12.5px; font-weight: 700; color: #0f172a;">
                      <span style="font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: #dcfce7; color: #15803d; margin-right: 4px;">Faculty</span>
                      ${escapeHtml(r.sender_name)}
                    </div>
                  </div>
                  <div style="font-size: 13.5px; color: #1e293b; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(r.message)}</div>
                </div>
                <div style="width: 34px; height: 34px; border-radius: 50%; background: #0d9488; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0;">T</div>
              </div>
            `;
          } else {
            return `
              <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start;">
                <div style="width: 34px; height: 34px; border-radius: 50%; background: #e0f2fe; color: #0369a1; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0;">S</div>
                <div style="max-width: 82%; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px 8px 8px 2px; padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                  <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 5px;">
                    <div style="font-size: 12.5px; font-weight: 700; color: #0f172a;">
                      ${escapeHtml(r.sender_name)}
                      <span style="font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: #e0f2fe; color: #0369a1; margin-left: 4px;">Student</span>
                    </div>
                    <span style="font-size: 11px; color: #94a3b8;">${formatDate(r.created_at)}</span>
                  </div>
                  <div style="font-size: 13.5px; color: #334155; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(r.message)}</div>
                </div>
              </div>
            `;
          }
        }).join('');
      }

    } catch (err) {
      console.error('Error loading thread:', err);
      showToast(err.message || 'Error loading thread', 'error');
    }
  }

  // 6. Post Reply & Update Status
  if (btnTeacherSendReply) {
    btnTeacherSendReply.addEventListener('click', async () => {
      if (!activeQueryId) return;
      const msg = tReplyInput.value.trim();
      const targetStatus = tStatusSelect.value;

      if (!msg) {
        showToast('Please type a response message', 'warning');
        return;
      }

      btnTeacherSendReply.disabled = true;
      btnTeacherSendReply.textContent = 'Posting...';

      try {
        // Send reply
        const res = await apiFetch(`/api/queries/${activeQueryId}/replies`, {
          method: 'POST',
          body: JSON.stringify({ message: msg })
        });
        if (!res) return;
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.message || 'Failed to post reply');
        }

        // If specific target status chosen and differs, update status
        if (targetStatus) {
          await apiFetch(`/api/queries/${activeQueryId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: targetStatus })
          });
        }

        showToast('Reply posted successfully!', 'success');
        tReplyInput.value = '';
        await openThreadModal(activeQueryId);
        loadTeacherQueries();
        loadKPIs();
      } catch (err) {
        console.error('Error posting reply:', err);
        showToast(err.message || 'Error posting reply', 'error');
      } finally {
        btnTeacherSendReply.disabled = false;
        btnTeacherSendReply.textContent = 'Send Reply';
      }
    });
  }

  // Quick Mark Resolved
  if (btnQuickResolve) {
    btnQuickResolve.addEventListener('click', async () => {
      if (!activeQueryId) return;

      btnQuickResolve.disabled = true;
      try {
        const res = await apiFetch(`/api/queries/${activeQueryId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'Resolved' })
        });
        if (!res) return;
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.message || 'Failed to update status');
        }

        showToast('Query marked as Resolved', 'success');
        await openThreadModal(activeQueryId);
        loadTeacherQueries();
        loadKPIs();
      } catch (err) {
        console.error('Error resolving query:', err);
        showToast(err.message || 'Error resolving query', 'error');
      } finally {
        btnQuickResolve.disabled = false;
      }
    });
  }

  // Refresh & Filters
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadKPIs();
      loadTeacherQueries();
      showToast('Data refreshed', 'info');
    });
  }

  if (searchInput) {
    let timeout = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(loadTeacherQueries, 300);
    });
  }

  if (statusFilter) statusFilter.addEventListener('change', loadTeacherQueries);
  if (priorityFilter) priorityFilter.addEventListener('change', loadTeacherQueries);
  if (courseFilter) courseFilter.addEventListener('change', loadTeacherQueries);

  if (btnResetFilters) {
    btnResetFilters.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (statusFilter) statusFilter.value = '';
      if (priorityFilter) priorityFilter.value = '';
      if (courseFilter) courseFilter.value = '';
      loadTeacherQueries();
      showToast('Filters cleared', 'info');
    });
  }

  // Modals dismiss
  document.querySelectorAll('[data-dismiss="modal"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop, .custom-modal-backdrop').forEach((m) => m.classList.add('hidden'));
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop') || e.target.classList.contains('custom-modal-backdrop')) {
      e.target.classList.add('hidden');
    }
  });

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/login.html');
    });
  }

  // Initial load
  loadKPIs();
  loadAssignedCourses();
  loadTeacherQueries();

})();
