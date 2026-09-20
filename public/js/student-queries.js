/**
 * Student Queries Client Script
 * Handles query submission to teachers, conversation threads, and replies
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

  if (currentUser.role !== 'STUDENT') {
    window.location.replace('/login.html');
    return;
  }

  // Update username badge
  const navUserName = document.getElementById('navUserName');
  if (navUserName) {
    navUserName.textContent = currentUser.full_name || currentUser.first_name || currentUser.username || 'Student';
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
  let activeQueryStatus = null;

  const kpiTotalQueries = document.getElementById('kpiTotalQueries');
  const kpiOpenQueries = document.getElementById('kpiOpenQueries');
  const kpiInProgressQueries = document.getElementById('kpiInProgressQueries');
  const kpiResolvedQueries = document.getElementById('kpiResolvedQueries');

  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const priorityFilter = document.getElementById('priorityFilter');
  const courseFilter = document.getElementById('courseFilter');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnRefresh = document.getElementById('btnRefresh');

  const errorContainer = document.getElementById('errorContainer');
  const errorMessage = document.getElementById('errorMessage');
  const btnRetryQueries = document.getElementById('btnRetryQueries');

  const studentQueriesTableBody = document.getElementById('studentQueriesTableBody');
  const queryMobileCardsContainer = document.getElementById('queryMobileCardsContainer');
  const queryTableWrapper = document.querySelector('.query-table-wrapper');
  const queryEmptyState = document.getElementById('queryEmptyState');
  const emptyStateTitle = document.getElementById('emptyStateTitle');
  const emptyStateDesc = document.getElementById('emptyStateDesc');

  const btnOpenNewQuery = document.getElementById('btnOpenNewQuery');
  const newQueryModal = document.getElementById('newQueryModal');
  const newQueryForm = document.getElementById('newQueryForm');
  const teacherSelect = document.getElementById('teacherSelect');
  const courseSelect = document.getElementById('courseSelect');
  const prioritySelect = document.getElementById('prioritySelect');
  const subjectInput = document.getElementById('subjectInput');
  const messageInput = document.getElementById('messageInput');
  const btnSubmitQuery = document.getElementById('btnSubmitQuery');

  const threadModal = document.getElementById('threadModal');
  const threadModalTitle = document.getElementById('threadModalTitle');
  const threadModalMeta = document.getElementById('threadModalMeta');
  const threadPriorityBadge = document.getElementById('threadPriorityBadge');
  const threadStatusBadge = document.getElementById('threadStatusBadge');
  const threadCourseBadge = document.getElementById('threadCourseBadge');
  const threadCreatedTime = document.getElementById('threadCreatedTime');
  const threadSubjectText = document.getElementById('threadSubjectText');
  const threadTeacherInfo = document.getElementById('threadTeacherInfo');
  const threadQuestionText = document.getElementById('threadQuestionText');
  const threadRepliesContainer = document.getElementById('threadRepliesContainer');
  const replySection = document.getElementById('replySection');
  const replyInput = document.getElementById('replyInput');
  const btnSendReply = document.getElementById('btnSendReply');
  const btnToggleCloseStatus = document.getElementById('btnToggleCloseStatus');

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
      }
    } catch (err) {
      console.error('Error loading KPIs:', err);
    }
  }

  // 4. Load Dropdowns
  async function loadDropdowns() {
    try {
      // Teachers
      const tRes = await apiFetch('/api/queries/teachers');
      if (tRes) {
        const tJson = await tRes.json();
        if (tJson.success && Array.isArray(tJson.data) && teacherSelect) {
          teacherSelect.innerHTML = '<option value="">-- Choose Teacher --</option>';
          tJson.data.forEach((t) => {
            const opt = document.createElement('option');
            opt.value = t.user_id;
            opt.textContent = `${t.full_name}${t.designation ? ` (${t.designation})` : ''}${t.department_name ? ` - ${t.department_name}` : ''}`;
            teacherSelect.appendChild(opt);
          });
        }
      }

      // Courses
      const cRes = await apiFetch('/api/queries/courses');
      if (cRes) {
        const cJson = await cRes.json();
        if (cJson.success && Array.isArray(cJson.data)) {
          if (courseSelect) {
            courseSelect.innerHTML = '<option value="">-- General / No Specific Course --</option>';
            cJson.data.forEach((c) => {
              const opt = document.createElement('option');
              opt.value = c.course_id;
              opt.textContent = `${c.course_code ? c.course_code + ': ' : ''}${c.course_name}`;
              courseSelect.appendChild(opt);
            });
          }
          if (courseFilter) {
            courseFilter.innerHTML = '<option value="">All Courses</option>';
            cJson.data.forEach((c) => {
              const opt = document.createElement('option');
              opt.value = c.course_id;
              opt.textContent = `${c.course_code ? c.course_code + ' - ' : ''}${c.course_name}`;
              courseFilter.appendChild(opt);
            });
          }
        }
      }
    } catch (err) {
      console.error('Error loading dropdown options:', err);
    }
  }

  // Helper for priority badge HTML
  function getPriorityBadgeHtml(prio) {
    const p = String(prio || 'Medium').trim();
    if (p === 'High') {
      return '<span style="display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;">High</span>';
    }
    if (p === 'Medium') {
      return '<span style="display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #fef3c7; color: #b45309; border: 1px solid #fde68a;">Medium</span>';
    }
    return '<span style="display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">Low</span>';
  }

  // Helper for status badge HTML
  function getStatusBadgeHtml(status) {
    const s = String(status || 'Open').trim();
    if (s === 'Open') {
      return '<span style="display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #fef3c7; color: #b45309; border: 1px solid #fde68a;">Open</span>';
    }
    if (s === 'Pending') {
      return '<span style="display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #fffbeb; color: #d97706; border: 1px solid #fde68a;">Pending</span>';
    }
    if (s === 'In Progress') {
      return '<span style="display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;">In Progress</span>';
    }
    if (s === 'Resolved' || s === 'Answered') {
      return '<span style="display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;">Resolved</span>';
    }
    return '<span style="display: inline-block; padding: 3px 10px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;">Closed</span>';
  }

  // 5. Load Queries Table
  async function loadStudentQueries() {
    if (errorContainer) errorContainer.classList.add('hidden');
    if (queryEmptyState) queryEmptyState.classList.add('hidden');
    if (queryTableWrapper) queryTableWrapper.style.display = '';
    if (queryMobileCardsContainer) queryMobileCardsContainer.style.display = '';

    if (studentQueriesTableBody) {
      studentQueriesTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-4 text-muted">
            Loading your queries...
          </td>
        </tr>
      `;
    }
    if (queryMobileCardsContainer) {
      queryMobileCardsContainer.innerHTML = `
        <div class="text-center py-4 text-muted">
          Loading your queries...
        </div>
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
        const titleText = hasFilters ? 'No matching queries' : 'No queries found';
        const descText = hasFilters 
          ? 'No student queries match your selected filters. Try clearing or adjusting search criteria.' 
          : 'You currently have no student-faculty queries. Click "Ask a Teacher" above to send your first question.';

        if (queryEmptyState) {
          queryEmptyState.classList.remove('hidden');
          if (emptyStateTitle) emptyStateTitle.textContent = titleText;
          if (emptyStateDesc) emptyStateDesc.textContent = descText;
        }

        if (queryTableWrapper) queryTableWrapper.style.display = 'none';
        if (queryMobileCardsContainer) queryMobileCardsContainer.style.display = 'none';
        return;
      }

      if (queryEmptyState) queryEmptyState.classList.add('hidden');
      if (queryTableWrapper) queryTableWrapper.style.display = '';
      if (queryMobileCardsContainer) queryMobileCardsContainer.style.display = '';

      // 1. Render Desktop 8-Column Table
      studentQueriesTableBody.innerHTML = list.map((q) => {
        const studentName = q.student_name || currentUser.full_name || currentUser.username || 'You';
        const studentInit = (studentName[0] || 'S').toUpperCase();

        const teacherName = q.teacher_name || 'Assigned Faculty';
        const teacherInit = (teacherName[0] || 'T').toUpperCase();

        const courseDisplay = q.course_code 
          ? `<span class="query-course-badge">${escapeHtml(q.course_code)}</span>`
          : '<span class="text-muted" style="font-size: 11.5px;">General</span>';

        return `
          <tr>
            <td class="col-query-id">
              <span class="query-id-tag">#${q.query_id}</span>
            </td>
            <td class="col-subject">
              <div class="query-subject-title">${escapeHtml(q.subject)}</div>
              <div class="query-subject-meta">
                ${courseDisplay}
                <span class="query-reply-indicator ${q.reply_count > 0 ? 'has-replies' : 'no-replies'}">
                  ${q.reply_count > 0 ? `${q.reply_count} ${q.reply_count === 1 ? 'reply' : 'replies'}` : 'Awaiting faculty reply'}
                </span>
              </div>
            </td>
            <td class="col-asked-by">
              <div class="user-cell-meta">
                <div class="user-cell-avatar student-av">${escapeHtml(studentInit)}</div>
                <div>
                  <div class="user-cell-name">${escapeHtml(studentName)}</div>
                  ${q.student_prn ? `<div class="user-cell-sub">PRN: ${escapeHtml(q.student_prn)}</div>` : ''}
                </div>
              </div>
            </td>
            <td class="col-faculty">
              <div class="user-cell-meta">
                <div class="user-cell-avatar teacher-av">${escapeHtml(teacherInit)}</div>
                <div>
                  <div class="user-cell-name">${escapeHtml(teacherName)}</div>
                  ${q.teacher_designation ? `<div class="user-cell-sub">${escapeHtml(q.teacher_designation)}</div>` : ''}
                </div>
              </div>
            </td>
            <td class="col-priority">${getPriorityBadgeHtml(q.priority)}</td>
            <td class="col-status">${getStatusBadgeHtml(q.status)}</td>
            <td class="col-updated">${formatDate(q.updated_at || q.created_at)}</td>
            <td class="col-action">
              <button type="button" class="btn btn-sm btn-primary btn-open-thread" data-id="${q.query_id}">
                View
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // 2. Render Mobile Responsive Cards
      if (queryMobileCardsContainer) {
        queryMobileCardsContainer.innerHTML = list.map((q) => {
          const studentName = q.student_name || currentUser.full_name || currentUser.username || 'You';
          const teacherName = q.teacher_name || 'Assigned Faculty';
          const courseDisplay = q.course_code 
            ? `<span class="query-course-badge">${escapeHtml(q.course_code)}</span>`
            : '<span class="text-muted" style="font-size: 11.5px;">General</span>';

          return `
            <div class="query-mobile-card">
              <div class="query-mobile-card-top">
                <span class="query-id-tag">#${q.query_id}</span>
                <div class="query-mobile-badges">
                  ${getPriorityBadgeHtml(q.priority)}
                  ${getStatusBadgeHtml(q.status)}
                </div>
              </div>

              <div class="query-mobile-subject-box">
                <div class="query-mobile-label">SUBJECT / COURSE</div>
                <div class="query-mobile-subject-text">${escapeHtml(q.subject)}</div>
                <div class="query-subject-meta">
                  ${courseDisplay}
                  <span class="query-reply-indicator ${q.reply_count > 0 ? 'has-replies' : 'no-replies'}">
                    ${q.reply_count > 0 ? `${q.reply_count} ${q.reply_count === 1 ? 'reply' : 'replies'}` : 'Awaiting faculty reply'}
                  </span>
                </div>
              </div>

              <div class="query-mobile-grid">
                <div class="query-mobile-field">
                  <span class="query-mobile-label">ASKED BY</span>
                  <div class="query-mobile-val">${escapeHtml(studentName)}</div>
                  ${q.student_prn ? `<div class="query-mobile-meta">PRN: ${escapeHtml(q.student_prn)}</div>` : ''}
                </div>
                <div class="query-mobile-field">
                  <span class="query-mobile-label">ASSIGNED FACULTY</span>
                  <div class="query-mobile-val">${escapeHtml(teacherName)}</div>
                  ${q.teacher_designation ? `<div class="query-mobile-meta">${escapeHtml(q.teacher_designation)}</div>` : ''}
                </div>
                <div class="query-mobile-field" style="grid-column: span 2;">
                  <span class="query-mobile-label">LAST UPDATED</span>
                  <div class="query-mobile-meta">${formatDate(q.updated_at || q.created_at)}</div>
                </div>
              </div>

              <div class="query-mobile-card-footer">
                <button type="button" class="btn btn-sm btn-primary btn-open-thread" data-id="${q.query_id}">
                  View Discussion
                </button>
              </div>
            </div>
          `;
        }).join('');
      }

      // Bind click handlers to all buttons (both desktop and mobile)
      document.querySelectorAll('.btn-open-thread').forEach((btn) => {
        btn.addEventListener('click', () => openThreadModal(btn.dataset.id));
      });

    } catch (err) {
      console.error('Error loading queries:', err);
      if (errorContainer) {
        errorContainer.classList.remove('hidden');
        if (errorMessage) errorMessage.textContent = err.message || 'Failed to fetch query records.';
      }
      studentQueriesTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center py-4 text-danger">
            ${escapeHtml(err.message || 'Unable to load queries.')}
          </td>
        </tr>
      `;
    }
  }

  // 6. Thread Discussion Modal
  async function openThreadModal(queryId) {
    activeQueryId = queryId;
    if (threadModal) threadModal.classList.remove('hidden');

    if (threadModalTitle) threadModalTitle.textContent = `Query #${queryId}`;
    if (threadModalMeta) threadModalMeta.textContent = 'Loading discussion...';
    if (threadRepliesContainer) threadRepliesContainer.innerHTML = '<div class="text-center py-3 text-muted">Loading messages...</div>';

    try {
      const res = await apiFetch(`/api/queries/${queryId}`);
      if (!res) return;
      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.message || 'Failed to load discussion');
      }

      const q = json.data;
      activeQueryStatus = q.status;

      if (threadModalMeta) threadModalMeta.textContent = `Submitted on ${formatDate(q.created_at)}`;
      if (threadSubjectText) threadSubjectText.textContent = q.subject;
      if (threadQuestionText) threadQuestionText.textContent = q.question;
      if (threadTeacherInfo) threadTeacherInfo.textContent = `${q.teacher_name} (${q.teacher_designation || 'Faculty'})`;
      if (threadCreatedTime) threadCreatedTime.textContent = formatDate(q.created_at);

      // Badges
      let prioBadge = 'badge-secondary';
      if (q.priority === 'High') prioBadge = 'badge-danger';
      else if (q.priority === 'Medium') prioBadge = 'badge-warning';
      if (threadPriorityBadge) {
        threadPriorityBadge.className = `badge ${prioBadge}`;
        threadPriorityBadge.textContent = `${q.priority} Priority`;
      }

      let statusBadge = 'badge-secondary';
      if (q.status === 'Open' || q.status === 'Pending') statusBadge = 'badge-warning';
      else if (q.status === 'In Progress') statusBadge = 'badge-info';
      else if (q.status === 'Resolved' || q.status === 'Answered') statusBadge = 'badge-success';
      if (threadStatusBadge) {
        threadStatusBadge.className = `badge ${statusBadge}`;
        threadStatusBadge.textContent = q.status;
      }

      if (threadCourseBadge) {
        if (q.course_name) {
          threadCourseBadge.textContent = q.course_code ? `${q.course_code}: ${q.course_name}` : q.course_name;
          threadCourseBadge.style.display = 'inline-block';
        } else {
          threadCourseBadge.textContent = 'General Query';
          threadCourseBadge.style.display = 'inline-block';
        }
      }

      // Close / Reopen button
      if (btnToggleCloseStatus) {
        if (q.status === 'Closed') {
          btnToggleCloseStatus.textContent = 'Reopen Query';
          btnToggleCloseStatus.className = 'btn btn-sm btn-outline-success';
        } else {
          btnToggleCloseStatus.textContent = 'Close Query';
          btnToggleCloseStatus.className = 'btn btn-sm btn-outline-secondary';
        }
      }

      // Reply form state
      if (replyInput && btnSendReply) {
        if (q.status === 'Closed') {
          replyInput.disabled = true;
          replyInput.placeholder = 'This query is closed. Click "Reopen Query" to post another message.';
          btnSendReply.disabled = true;
        } else {
          replyInput.disabled = false;
          replyInput.placeholder = 'Type your reply to the teacher here...';
          btnSendReply.disabled = false;
        }
      }

      // Render replies in modern chat bubble layout
      const replies = q.replies || [];
      if (replies.length === 0) {
        threadRepliesContainer.innerHTML = `
          <div style="text-align: center; padding: 28px 16px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 13.5px;">
            No faculty replies yet. You will be notified as soon as your teacher responds!
          </div>
        `;
      } else {
        threadRepliesContainer.innerHTML = replies.map((r) => {
          const isOwn = r.sender_user_id === currentUser.user_id;
          const senderName = r.sender_name || (isOwn ? 'You' : 'Teacher');
          const senderInit = (senderName[0] || (isOwn ? 'S' : 'T')).toUpperCase();

          if (isOwn) {
            return `
              <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; justify-content: flex-end;">
                <div style="max-width: 82%; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px 8px 2px 8px; padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                  <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 5px;">
                    <span style="font-size: 11px; color: #94a3b8;">${formatDate(r.created_at)}</span>
                    <div style="font-size: 12.5px; font-weight: 700; color: #0f172a;">
                      <span style="font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: #dbeafe; color: #1d4ed8; margin-right: 4px;">You</span>
                      ${escapeHtml(r.sender_name)}
                    </div>
                  </div>
                  <div style="font-size: 13.5px; color: #1e293b; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(r.message)}</div>
                </div>
                <div style="width: 34px; height: 34px; border-radius: 50%; background: #2563eb; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0;">${escapeHtml(senderInit)}</div>
              </div>
            `;
          } else {
            return `
              <div style="display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start;">
                <div style="width: 34px; height: 34px; border-radius: 50%; background: #0d9488; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0;">${escapeHtml(senderInit)}</div>
                <div style="max-width: 82%; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px 8px 8px 2px; padding: 12px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
                  <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 5px;">
                    <div style="font-size: 12.5px; font-weight: 700; color: #0f172a;">
                      ${escapeHtml(r.sender_name)}
                      <span style="font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: #dcfce7; color: #15803d; margin-left: 4px;">${escapeHtml(r.sender_role || 'Faculty')}</span>
                    </div>
                    <span style="font-size: 11px; color: #94a3b8;">${formatDate(r.created_at)}</span>
                  </div>
                  <div style="font-size: 13.5px; color: #1e293b; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(r.message)}</div>
                </div>
              </div>
            `;
          }
        }).join('');
      }

    } catch (err) {
      console.error('Error fetching thread:', err);
      showToast(err.message || 'Error fetching discussion', 'error');
    }
  }

  // Send Reply
  if (btnSendReply) {
    btnSendReply.addEventListener('click', async () => {
      if (!activeQueryId) return;
      const msg = replyInput.value.trim();
      if (!msg) {
        showToast('Please enter a reply message', 'warning');
        return;
      }

      btnSendReply.disabled = true;
      btnSendReply.textContent = 'Sending...';

      try {
        const res = await apiFetch(`/api/queries/${activeQueryId}/replies`, {
          method: 'POST',
          body: JSON.stringify({ message: msg })
        });
        if (!res) return;
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.message || 'Failed to send reply');
        }

        showToast('Reply sent successfully', 'success');
        replyInput.value = '';
        await openThreadModal(activeQueryId);
        loadStudentQueries();
      } catch (err) {
        console.error('Error posting reply:', err);
        showToast(err.message || 'Error sending reply', 'error');
      } finally {
        btnSendReply.disabled = false;
        btnSendReply.textContent = 'Send Reply';
      }
    });
  }

  // Toggle Close / Reopen
  if (btnToggleCloseStatus) {
    btnToggleCloseStatus.addEventListener('click', async () => {
      if (!activeQueryId) return;
      const targetStatus = activeQueryStatus === 'Closed' ? 'Open' : 'Closed';

      try {
        const res = await apiFetch(`/api/queries/${activeQueryId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: targetStatus })
        });
        if (!res) return;
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.message || 'Failed to update status');
        }

        showToast(`Query marked as ${targetStatus}`, 'success');
        await openThreadModal(activeQueryId);
        loadStudentQueries();
        loadKPIs();
      } catch (err) {
        console.error('Error updating status:', err);
        showToast(err.message || 'Error updating status', 'error');
      }
    });
  }

  // 7. Submit New Query
  if (btnOpenNewQuery) {
    btnOpenNewQuery.addEventListener('click', () => {
      if (newQueryForm) newQueryForm.reset();
      if (newQueryModal) newQueryModal.classList.remove('hidden');
    });
  }

  if (newQueryForm) {
    newQueryForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const teacherId = teacherSelect.value;
      const courseId = courseSelect.value || null;
      const priority = prioritySelect.value || 'Medium';
      const subject = subjectInput.value.trim();
      const message = messageInput.value.trim();

      if (!teacherId) {
        showToast('Please select a teacher', 'warning');
        return;
      }
      if (!subject) {
        showToast('Please enter a subject', 'warning');
        return;
      }
      if (!message) {
        showToast('Please enter your question details', 'warning');
        return;
      }

      btnSubmitQuery.disabled = true;
      btnSubmitQuery.textContent = 'Submitting...';

      try {
        const res = await apiFetch('/api/queries', {
          method: 'POST',
          body: JSON.stringify({
            assigned_to_user_id: teacherId,
            course_id: courseId,
            priority,
            subject,
            question: message
          })
        });
        if (!res) return;
        const json = await res.json();

        if (!json.success) {
          throw new Error(json.message || 'Failed to submit query');
        }

        showToast('Query submitted to faculty successfully!', 'success');
        if (newQueryModal) newQueryModal.classList.add('hidden');
        newQueryForm.reset();

        loadKPIs();
        loadStudentQueries();
      } catch (err) {
        console.error('Error creating query:', err);
        showToast(err.message || 'Failed to submit query', 'error');
      } finally {
        btnSubmitQuery.disabled = false;
        btnSubmitQuery.textContent = 'Submit Query';
      }
    });
  }

  // Refresh & Filters
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadKPIs();
      loadStudentQueries();
      showToast('Data refreshed', 'info');
    });
  }

  if (btnResetFilters) {
    btnResetFilters.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (statusFilter) statusFilter.value = '';
      if (priorityFilter) priorityFilter.value = '';
      if (courseFilter) courseFilter.value = '';
      loadStudentQueries();
      showToast('Filters reset', 'info');
    });
  }

  if (btnRetryQueries) {
    btnRetryQueries.addEventListener('click', () => {
      loadKPIs();
      loadDropdowns();
      loadStudentQueries();
    });
  }

  if (searchInput) {
    let timeout = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(loadStudentQueries, 300);
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', loadStudentQueries);
  }

  if (priorityFilter) {
    priorityFilter.addEventListener('change', loadStudentQueries);
  }

  if (courseFilter) {
    courseFilter.addEventListener('change', loadStudentQueries);
  }

  // Dismiss Modals
  document.querySelectorAll('[data-dismiss="modal"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop').forEach((m) => m.classList.add('hidden'));
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.add('hidden');
    }
  });

  // Initial loads
  loadKPIs();
  loadDropdowns();
  loadStudentQueries();

})();
