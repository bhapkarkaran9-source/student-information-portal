/**
 * Teacher Assignments Controller - Student Information Portal
 * Supports Viewing Assignments, Creating Assignments, Editing, Deleting,
 * and Comprehensive Submissions Management with Live File View & Download.
 * 100% Zero Images | Pure CSS Gradients & SVGs | Accessible ERP Theme
 */

(function () {
  'use strict';

  let currentTeacher = null;
  let allCourses = [];
  let allAssignments = [];
  let currentSubmissionsData = null;
  let currentSubFilter = 'all';
  let currentSubSearch = '';

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

  async function initAssignments() {
    if (typeof requireAuth === 'function') {
      const isAuthed = await requireAuth('TEACHER');
      if (!isAuthed) return;
    }

    await loadTeacherProfile();
    await loadCourses();
    await loadAssignments();

    // Modal triggers: Create Assignment
    const openCreateBtn = document.getElementById('btnOpenCreateAssignment');
    const createModal = document.getElementById('createAssignmentModal');
    const closeCreateBtn = document.getElementById('btnCloseAssignmentModal');
    const cancelCreateBtn = document.getElementById('btnCancelAssignmentModal');
    const createForm = document.getElementById('createAssignmentForm');

    if (openCreateBtn && createModal) {
      openCreateBtn.addEventListener('click', () => {
        createModal.style.display = 'flex';
      });
    }

    const hideCreateModal = () => {
      if (createModal) createModal.style.display = 'none';
      if (createForm) createForm.reset();
    };

    if (closeCreateBtn) closeCreateBtn.addEventListener('click', hideCreateModal);
    if (cancelCreateBtn) cancelCreateBtn.addEventListener('click', hideCreateModal);
    if (createForm) createForm.addEventListener('submit', handleCreateAssignment);

    // Modal triggers: Edit Assignment
    const editModal = document.getElementById('editAssignmentModal');
    const closeEditBtn = document.getElementById('btnCloseEditModal');
    const cancelEditBtn = document.getElementById('btnCancelEditModal');
    const editForm = document.getElementById('editAssignmentForm');

    const hideEditModal = () => {
      if (editModal) editModal.style.display = 'none';
      if (editForm) editForm.reset();
    };

    if (closeEditBtn) closeEditBtn.addEventListener('click', hideEditModal);
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', hideEditModal);
    if (editForm) editForm.addEventListener('submit', handleEditAssignment);

    // Modal triggers: Submissions Modal
    const subModal = document.getElementById('viewSubmissionsModal');
    const closeSubBtn = document.getElementById('btnCloseSubmissionsModal');
    const closeSubFooter = document.getElementById('btnCloseSubmissionsFooter');

    const hideSubModal = () => {
      if (subModal) subModal.style.display = 'none';
      currentSubmissionsData = null;
    };

    if (closeSubBtn) closeSubBtn.addEventListener('click', hideSubModal);
    if (closeSubFooter) closeSubFooter.addEventListener('click', hideSubModal);

    // Modal triggers: Evaluation Modal
    const evalModal = document.getElementById('evaluateSubmissionModal');
    const closeEvalBtn = document.getElementById('btnCloseEvalModal');
    const cancelEvalBtn = document.getElementById('btnCancelEvalModal');
    const evalForm = document.getElementById('evaluateSubmissionForm');

    const hideEvalModal = () => {
      if (evalModal) evalModal.style.display = 'none';
      if (evalForm) evalForm.reset();
      const errEl = document.getElementById('evalMarksError');
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    };

    if (closeEvalBtn) closeEvalBtn.addEventListener('click', hideEvalModal);
    if (cancelEvalBtn) cancelEvalBtn.addEventListener('click', hideEvalModal);
    if (evalForm) evalForm.addEventListener('submit', handleSaveEvaluation);

    // Modal triggers: History Modal
    const historyModal = document.getElementById('submissionHistoryModal');
    const closeHistoryBtn = document.getElementById('btnCloseHistoryModal');
    const closeHistoryFooter = document.getElementById('btnCloseHistoryFooter');

    const hideHistoryModal = () => {
      if (historyModal) historyModal.style.display = 'none';
      const container = document.getElementById('historyListContainer');
      if (container) container.innerHTML = '';
    };

    if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', hideHistoryModal);
    if (closeHistoryFooter) closeHistoryFooter.addEventListener('click', hideHistoryModal);

    // Submissions search & filters
    const subSearch = document.getElementById('subSearchInput');
    if (subSearch) {
      subSearch.addEventListener('input', (e) => {
        currentSubSearch = (e.target.value || '').toLowerCase().trim();
        renderSubmissionsRoster();
      });
    }

    document.querySelectorAll('.sub-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-filter-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = '#ffffff';
          b.style.color = '#475569';
        });
        btn.classList.add('active');
        btn.style.background = '#0d9488';
        btn.style.color = '#ffffff';

        currentSubFilter = btn.getAttribute('data-sub-filter');
        renderSubmissionsRoster();
      });
    });

    // Course filter
    const filterSelect = document.getElementById('assignmentCourseFilter');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) {
          renderAssignments(allAssignments);
        } else {
          renderAssignments(allAssignments.filter(a => String(a.course_id) === String(val)), true);
        }
      });
    }

    await loadNotificationsCount();
  }

  async function loadTeacherProfile() {
    try {
      const res = await apiFetch('/api/users/me');
      if (res && res.success && res.data && res.data.user) {
        currentTeacher = res.data.user;
      }
    } catch (e) {
      console.warn('Could not load teacher profile:', e);
    }
  }

  async function loadCourses() {
    try {
      // Backend automatically restricts /api/courses for TEACHER to assigned courses via timetable
      const res = await apiFetch('/api/courses?all=true');
      const filterSelect = document.getElementById('assignmentCourseFilter');
      const createSelect = document.getElementById('modalAssignCourse');
      const editSelect = document.getElementById('editAssignCourse');

      if (res && res.success && res.data) {
        allCourses = Array.isArray(res.data) ? res.data : (res.data.courses || []);
      } else {
        allCourses = [];
      }

      const buildOptions = (includeAll = false) => {
        let html = includeAll ? '<option value="">All Assigned Courses</option>' : '<option value="">-- Choose Assigned Course --</option>';
        allCourses.forEach(c => {
          html += `<option value="${c.course_id}">${escapeHtml(c.course_code)} - ${escapeHtml(c.course_name)}</option>`;
        });
        return html;
      };

      if (filterSelect) filterSelect.innerHTML = buildOptions(true);
      if (createSelect) createSelect.innerHTML = buildOptions(false);
      if (editSelect) editSelect.innerHTML = buildOptions(false);
    } catch (e) {
      console.error('Failed to load courses for assignments:', e);
    }
  }

  async function loadAssignments() {
    try {
      const res = await apiFetch('/api/assignments');
      if (res && res.success && res.data) {
        allAssignments = Array.isArray(res.data) ? res.data : (res.data.assignments || []);
      } else {
        allAssignments = [];
      }

      updateKPIs(allAssignments);
      renderAssignments(allAssignments);
    } catch (err) {
      console.error('Failed to load assignments:', err);
      allAssignments = [];
      renderAssignments([]);
    }
  }

  function updateKPIs(assignments) {
    const totalEl = document.getElementById('statTotalAssignments');
    if (totalEl) totalEl.textContent = assignments.length;

    const now = new Date();
    let activeCount = 0;
    let dueWeekCount = 0;

    assignments.forEach(a => {
      if (!a.due_date) {
        activeCount++;
      } else {
        const d = new Date(a.due_date);
        if (d >= now) {
          activeCount++;
          const diffDays = (d.getTime() - now.getTime()) / (1000 * 3600 * 24);
          if (diffDays <= 7) dueWeekCount++;
        }
      }
    });

    const activeEl = document.getElementById('statActiveAssignments');
    if (activeEl) activeEl.textContent = activeCount;

    const dueWeekEl = document.getElementById('statDueThisWeek');
    if (dueWeekEl) dueWeekEl.textContent = dueWeekCount;
  }

  function renderAssignments(assignments, isFiltered = false) {
    const container = document.getElementById('assignmentsContainer');
    if (!container) return;

    if (!assignments || assignments.length === 0) {
      container.innerHTML = `
        <div class="card" style="padding: 48px 24px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
          <div style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #ccfbf1; display: flex; align-items: center; justify-content: center; color: #0d9488;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: #0f172a;">${isFiltered ? 'No Assignments for Selected Course' : 'No Assignments Created'}</h3>
          <p style="color: #64748b; max-width: 480px; margin: 0 auto; font-size: 14px;">
            ${isFiltered ? 'No assignments match the selected course filter.' : 'You have not created any homework assignments or project deliverables yet.'}
          </p>
        </div>`;
      return;
    }

    let html = `
      <div style="overflow-x: auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left; color: #475569;">
              <th style="padding: 12px 16px;">Title &amp; Instructions</th>
              <th style="padding: 12px 16px;">Course</th>
              <th style="padding: 12px 16px;">Deadline</th>
              <th style="padding: 12px 16px;">Max Marks</th>
              <th style="padding: 12px 16px;">Status</th>
              <th style="padding: 12px 16px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>`;

    const now = new Date();
    assignments.forEach(a => {
      const isPast = a.due_date && new Date(a.due_date) < now;
      const statusBadge = isPast
        ? '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #fee2e2; color: #991b1b;">Closed</span>'
        : '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #dcfce7; color: #15803d;">Active</span>';

      const dueDateStr = a.due_date ? new Date(a.due_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No Deadline';

      html += `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 14px 16px; max-width: 320px;">
            <div style="font-weight: 600; color: #0f172a;">${escapeHtml(a.title)}</div>
            ${a.description ? `<div style="font-size: 12px; color: #64748b; margin-top: 2px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(a.description)}</div>` : ''}
          </td>
          <td style="padding: 14px 16px;">
            <span style="display: inline-block; padding: 2px 6px; background: #ccfbf1; color: #0f766e; border-radius: 4px; font-weight: 600; font-size: 12px;">${escapeHtml(a.course_code || 'COURSE')}</span>
            <div style="font-size: 12px; color: #475569; margin-top: 2px;">${escapeHtml(a.course_name || '')}</div>
          </td>
          <td style="padding: 14px 16px; color: #475569;">${escapeHtml(dueDateStr)}</td>
          <td style="padding: 14px 16px; color: #0f172a; font-weight: 600;">${escapeHtml(a.max_marks || '100')} pts</td>
          <td style="padding: 14px 16px;">${statusBadge}</td>
          <td style="padding: 14px 16px; text-align: right;">
            <div class="btn-action-group">
              <button type="button" class="btn-asg-action btn-view-sub" data-action="submissions" data-id="${a.assignment_id}" title="View Student Submissions">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                <span>Submissions</span>
              </button>
              <button type="button" class="btn-asg-action btn-edit-asg" data-action="edit" data-id="${a.assignment_id}" title="Edit Assignment">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                <span>Edit</span>
              </button>
              <button type="button" class="btn-asg-action btn-del-asg" data-action="delete" data-id="${a.assignment_id}" title="Delete Assignment">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                <span>Delete</span>
              </button>
            </div>
          </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Wire action buttons
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.getAttribute('data-action');
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const asg = allAssignments.find(x => x.assignment_id === id);

        if (action === 'submissions') {
          openSubmissionsModal(id);
        } else if (action === 'edit') {
          openEditModal(asg);
        } else if (action === 'delete') {
          handleDeleteAssignment(id, asg?.title);
        }
      });
    });
  }

  async function openSubmissionsModal(assignmentId) {
    const modal = document.getElementById('viewSubmissionsModal');
    const tbody = document.getElementById('subModalTableBody');
    const titleEl = document.getElementById('subModalTitle');
    const metaEl = document.getElementById('subModalMeta');

    if (!modal) return;
    modal.style.display = 'flex';

    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding: 24px; text-align: center; color: #64748b;">Loading student roster...</td></tr>';

    try {
      const res = await apiFetch(`/api/assignments/${assignmentId}/submissions`);
      if (res && res.success && res.data) {
        currentSubmissionsData = res.data;

        const asg = res.data.assignment;
        const kpis = res.data.kpis;

        if (titleEl) titleEl.textContent = `Submissions: ${asg.title}`;
        if (metaEl) {
          const dueStr = asg.due_date ? new Date(asg.due_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No Deadline';
          metaEl.textContent = `Course: ${asg.course_code} - ${asg.course_name} | Deadline: ${dueStr}`;
        }

        // Update KPIs
        const kTotal = document.getElementById('subKpiTotal');
        const kSub = document.getElementById('subKpiSubmitted');
        const kNot = document.getElementById('subKpiNotSubmitted');
        const kLate = document.getElementById('subKpiLate');
        const kEval = document.getElementById('subKpiEvaluated');
        const kPendingEval = document.getElementById('subKpiPendingEvaluation');

        if (kTotal) kTotal.textContent = kpis.total_students ?? 0;
        if (kSub) kSub.textContent = kpis.submitted ?? 0;
        if (kNot) kNot.textContent = kpis.not_submitted ?? 0;
        if (kLate) kLate.textContent = kpis.late_submitted ?? 0;
        if (kEval) kEval.textContent = kpis.evaluated ?? 0;
        if (kPendingEval) kPendingEval.textContent = kpis.pending_evaluation ?? 0;

        renderSubmissionsRoster();
      } else {
        showToast(res?.message || 'Failed to load submissions.', 'error');
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="padding: 24px; text-align: center; color: #dc2626;">${escapeHtml(res?.message || 'Error loading roster')}</td></tr>`;
      }
    } catch (err) {
      console.error('Error fetching submissions:', err);
      showToast('Error loading submissions.', 'error');
      if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="padding: 24px; text-align: center; color: #dc2626;">Error retrieving student submissions.</td></tr>';
    }
  }

  function renderSubmissionsRoster() {
    const tbody = document.getElementById('subModalTableBody');
    if (!tbody || !currentSubmissionsData) return;

    let list = currentSubmissionsData.students || [];

    // Filter by tab
    if (currentSubFilter === 'submitted') {
      list = list.filter(s => s.status === 'Submitted');
    } else if (currentSubFilter === 'not_submitted') {
      list = list.filter(s => s.status === 'Not Submitted');
    } else if (currentSubFilter === 'late') {
      list = list.filter(s => s.status === 'Late Submission');
    } else if (currentSubFilter === 'evaluated') {
      list = list.filter(s => s.status !== 'Not Submitted' && s.is_evaluated);
    } else if (currentSubFilter === 'pending_eval') {
      list = list.filter(s => s.status !== 'Not Submitted' && !s.is_evaluated);
    }

    // Filter by search
    if (currentSubSearch) {
      list = list.filter(s =>
        (s.student_name && s.student_name.toLowerCase().includes(currentSubSearch)) ||
        (s.prn_number && s.prn_number.toLowerCase().includes(currentSubSearch)) ||
        (s.student_email && s.student_email.toLowerCase().includes(currentSubSearch))
      );
    }

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="padding: 24px; text-align: center; color: #64748b;">No students match this filter.</td></tr>';
      return;
    }

    const token = localStorage.getItem('token');
    const aid = currentSubmissionsData.assignment.assignment_id;
    const maxMarks = currentSubmissionsData.assignment.max_marks || 100;

    tbody.innerHTML = list.map(s => {
      let badgeClass = 'badge-pending';
      if (s.status === 'Submitted') badgeClass = 'badge-submitted';
      if (s.status === 'Late Submission') badgeClass = 'badge-late';

      const submittedAtStr = s.submitted_at
        ? new Date(s.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '-';

      const filenameStr = s.original_filename ? escapeHtml(s.original_filename) : '-';

      let marksDisplay = '<span style="color: #94a3b8; font-size: 12px;">-</span>';
      let evalBadge = '<span style="color: #94a3b8; font-size: 12px;">-</span>';
      let feedbackPreview = '<span style="color: #94a3b8; font-size: 12px;">-</span>';
      let actionsHtml = '<span style="color: #94a3b8; font-size: 12px;">-</span>';

      if (s.submission_id) {
        const downloadUrl = `/api/assignments/${aid}/submissions/${s.submission_id}/download?token=${encodeURIComponent(token)}`;
        const viewUrl = `/api/assignments/${aid}/submissions/${s.submission_id}/view?token=${encodeURIComponent(token)}`;

        const isEvaluated = Boolean(s.is_evaluated || s.evaluation_id || (s.evaluation && s.evaluation.is_evaluated));
        const evalMarks = s.evaluation?.marks_obtained ?? s.marks_obtained;
        const evalFeedback = s.evaluation?.feedback ?? s.feedback;

        if (isEvaluated && evalMarks !== null && evalMarks !== undefined) {
          marksDisplay = `<strong style="color: #0f172a; font-size: 13.5px;">${evalMarks}</strong> <span style="font-size: 11px; color: #64748b;">/ ${maxMarks}</span>`;
          evalBadge = `<span class="badge-eval badge-eval-ok" title="Evaluated"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Evaluated</span>`;
          if (evalFeedback) {
            feedbackPreview = `<span title="${escapeHtml(evalFeedback)}" style="display: block; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #475569;">${escapeHtml(evalFeedback)}</span>`;
          } else {
            feedbackPreview = `<span style="color: #94a3b8; font-size: 11.5px; font-style: italic;">No feedback</span>`;
          }
        } else {
          marksDisplay = `<span style="color: #b45309; font-size: 12px; font-weight: 500;">Ungraded</span>`;
          evalBadge = `<span class="badge-eval badge-eval-pending" title="Awaiting evaluation">Pending</span>`;
          feedbackPreview = `<span style="color: #94a3b8; font-size: 12px;">-</span>`;
        }

        const evalBtnLabel = isEvaluated ? 'Re-evaluate' : 'Evaluate';
        const evalBtnTitle = isEvaluated ? 'Update marks and feedback' : 'Evaluate marks and feedback';

        actionsHtml = `
          <div class="btn-action-group">
            <a href="${viewUrl}" target="_blank" rel="noopener" class="btn-asg-action btn-doc-view" title="Preview Document">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              <span>View</span>
            </a>
            <a href="${downloadUrl}" class="btn-asg-action btn-doc-download" title="Download Document" download>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>Download</span>
            </a>
            <button type="button" class="btn-asg-action btn-eval-asg" data-sub-id="${s.submission_id}" title="${evalBtnTitle}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              <span>${evalBtnLabel}</span>
            </button>
            <button type="button" class="btn-asg-action btn-history-asg" data-sub-id="${s.submission_id}" data-student-name="${escapeHtml(s.student_name || 'Student')}" data-student-prn="${escapeHtml(s.prn_number || '-')}" title="View all submission attempts & history">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span>History</span>
            </button>
          </div>`;
      }

      return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 14px; font-weight: 600; color: #0d9488;">${escapeHtml(s.prn_number || '-')}</td>
          <td style="padding: 12px 14px;">
            <div style="font-weight: 600; color: #0f172a;">${escapeHtml(s.student_name || 'Student')}</div>
            <div style="font-size: 11.5px; color: #64748b;">${escapeHtml(s.student_email || '')}</div>
          </td>
          <td style="padding: 12px 14px;">
            <span class="badge-sub ${badgeClass}">${escapeHtml(s.status)}</span>
          </td>
          <td style="padding: 12px 14px; text-align: center;">
            ${s.submission_id ? `<span class="badge" style="background: #e0e7ff; color: #4338ca; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 9999px;">Attempt ${s.attempt_number || 1}</span>` : '<span style="color: #94a3b8; font-size: 12px;">-</span>'}
          </td>
          <td style="padding: 12px 14px; color: #475569; font-size: 12.5px;">${submittedAtStr}</td>
          <td style="padding: 12px 14px; color: #0f172a; font-size: 12.5px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${filenameStr}">
            ${filenameStr}
          </td>
          <td style="padding: 12px 14px; font-size: 13px;">${marksDisplay}</td>
          <td style="padding: 12px 14px;">${evalBadge}</td>
          <td style="padding: 12px 14px;">${feedbackPreview}</td>
          <td style="padding: 12px 14px; text-align: right;">${actionsHtml}</td>
        </tr>`;
    }).join('');

    // Wire Evaluate buttons
    tbody.querySelectorAll('.btn-eval-asg').forEach(btn => {
      btn.addEventListener('click', () => {
        const subId = parseInt(btn.getAttribute('data-sub-id'), 10);
        const student = (currentSubmissionsData.students || []).find(s => s.submission_id === subId);
        if (student) {
          openEvaluationModal(student);
        }
      });
    });

    // Wire History buttons
    tbody.querySelectorAll('.btn-history-asg').forEach(btn => {
      btn.addEventListener('click', () => {
        const subId = parseInt(btn.getAttribute('data-sub-id'), 10);
        const studentName = btn.getAttribute('data-student-name') || 'Student';
        const studentPrn = btn.getAttribute('data-student-prn') || '-';
        if (subId) {
          openHistoryModal(subId, studentName, studentPrn);
        }
      });
    });
  }

  async function openHistoryModal(subId, studentName, studentPrn) {
    if (!currentSubmissionsData || !subId) return;
    const modal = document.getElementById('submissionHistoryModal');
    const loading = document.getElementById('historyLoadingIndicator');
    const container = document.getElementById('historyListContainer');
    const titleEl = document.getElementById('historyModalTitle');
    const metaEl = document.getElementById('historyModalMeta');
    if (!modal || !container) return;

    const asg = currentSubmissionsData.assignment;
    const aid = asg.assignment_id;
    const token = localStorage.getItem('token');

    titleEl.textContent = `Submission History: ${asg.title}`;
    metaEl.textContent = `Student: ${studentName} | PRN: ${studentPrn} | Course: ${asg.course_code}`;

    container.innerHTML = '';
    loading.style.display = 'block';
    modal.style.display = 'flex';

    try {
      const res = await apiFetch(`/api/assignments/${aid}/submissions/${subId}/history`);
      loading.style.display = 'none';

      if (res && res.success && res.data && Array.isArray(res.data.history)) {
        const history = res.data.history;
        if (history.length === 0) {
          container.innerHTML = '<div style="text-align: center; color: #64748b; padding: 20px;">No historical attempts recorded.</div>';
          return;
        }

        container.innerHTML = history.map(att => {
          const isCurrent = Boolean(att.is_current);
          const downloadUrl = isCurrent
            ? `/api/assignments/${aid}/submissions/${subId}/download?token=${encodeURIComponent(token)}`
            : `/api/assignments/${aid}/submissions/${subId}/history/${att.history_id}/download?token=${encodeURIComponent(token)}`;
          const viewUrl = isCurrent
            ? `/api/assignments/${aid}/submissions/${subId}/view?token=${encodeURIComponent(token)}`
            : `/api/assignments/${aid}/submissions/${subId}/history/${att.history_id}/view?token=${encodeURIComponent(token)}`;

          const dateStr = att.submitted_at
            ? new Date(att.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '-';

          const statusBadge = att.status === 'Late Submission'
            ? '<span class="badge-sub badge-late">Late Submission</span>'
            : '<span class="badge-sub badge-submitted">Submitted</span>';

          let evalSection = '';
          if (att.is_evaluated && att.marks_obtained !== null && att.marks_obtained !== undefined) {
            evalSection = `
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 8px 12px; margin-top: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 12px; font-weight: 700; color: #15803d;">Marks: ${att.marks_obtained} / ${asg.max_marks || 100}</span>
                  <span style="font-size: 11px; color: #166534;">Evaluated</span>
                </div>
                ${att.feedback ? `<div style="font-size: 12px; color: #334155; margin-top: 4px; font-style: italic;">Feedback: ${escapeHtml(att.feedback)}</div>` : ''}
                ${att.evaluated_by_name ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">By: ${escapeHtml(att.evaluated_by_name)}</div>` : ''}
              </div>`;
          } else {
            evalSection = `
              <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 12px; margin-top: 8px; font-size: 12px; color: #b45309; font-weight: 500;">
                Pending Evaluation
              </div>`;
          }

          return `
            <div style="background: ${isCurrent ? '#f8fafc' : '#ffffff'}; border: 1px solid ${isCurrent ? '#0d9488' : '#e2e8f0'}; border-radius: 8px; padding: 14px 16px; position: relative;">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <strong style="color: #0f172a; font-size: 14px;">Attempt #${att.attempt_number}</strong>
                  ${isCurrent ? '<span class="badge" style="background: #ccfbf1; color: #0f766e; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 9999px;">CURRENT / LATEST</span>' : '<span class="badge" style="background: #f1f5f9; color: #64748b; font-size: 11px; padding: 2px 8px; border-radius: 9999px;">Archived Attempt</span>'}
                  ${statusBadge}
                </div>
                <div style="font-size: 12px; color: #64748b;">
                  Submitted: ${dateStr}
                </div>
              </div>
              <div style="font-size: 13px; color: #334155; margin-bottom: 6px;">
                <span style="color: #64748b; font-weight: 500;">File:</span> <strong>${escapeHtml(att.original_filename)}</strong>
              </div>
              ${att.remarks ? `<div style="font-size: 12px; color: #475569; margin-bottom: 6px; background: #f8fafc; padding: 6px 10px; border-radius: 4px;">Student Remarks: ${escapeHtml(att.remarks)}</div>` : ''}
              ${evalSection}
              <div style="margin-top: 10px; display: flex; justify-content: flex-end; gap: 6px;">
                <a href="${viewUrl}" target="_blank" rel="noopener" class="btn-asg-action btn-doc-view" title="Preview Document">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  <span>View File</span>
                </a>
                <a href="${downloadUrl}" class="btn-asg-action btn-doc-download" title="Download Document" download>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  <span>Download</span>
                </a>
              </div>
            </div>`;
        }).join('');
      } else {
        container.innerHTML = '<div style="text-align: center; color: #dc2626; padding: 20px;">Failed to load submission history.</div>';
      }
    } catch (err) {
      console.error('Error fetching submission history:', err);
      loading.style.display = 'none';
      container.innerHTML = '<div style="text-align: center; color: #dc2626; padding: 20px;">Error loading submission history.</div>';
    }
  }

  function openEvaluationModal(student) {
    if (!student || !currentSubmissionsData) return;
    const modal = document.getElementById('evaluateSubmissionModal');
    if (!modal) return;

    const asg = currentSubmissionsData.assignment;
    const maxMarks = asg.max_marks || 100;
    const isEvaluated = Boolean(student.is_evaluated || student.evaluation_id || (student.evaluation && student.evaluation.is_evaluated));

    document.getElementById('evalSubmissionId').value = student.submission_id;
    document.getElementById('evalAssignmentId').value = asg.assignment_id;
    document.getElementById('evalModalTitle').textContent = isEvaluated ? 'Update Evaluation' : 'Evaluate Submission';
    document.getElementById('evalModalMeta').textContent = `Course: ${asg.course_code} - ${asg.course_name} | Assignment: ${asg.title}`;

    document.getElementById('evalStudentName').textContent = student.student_name || 'Student';
    document.getElementById('evalStudentPrn').textContent = student.prn_number || '-';
    
    const submittedAtStr = student.submitted_at
      ? new Date(student.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '-';
    document.getElementById('evalSubmittedAt').textContent = submittedAtStr;

    const statusEl = document.getElementById('evalSubmissionStatus');
    if (statusEl) {
      statusEl.textContent = student.status || 'Submitted';
      statusEl.style.color = student.status === 'Late Submission' ? '#b45309' : '#15803d';
    }

    document.getElementById('evalMaxMarksHint').textContent = `(Maximum: ${maxMarks} marks)`;
    const marksInput = document.getElementById('evalMarksObtained');
    marksInput.max = maxMarks;
    const evalMarks = student.evaluation?.marks_obtained ?? student.marks_obtained;
    marksInput.value = (evalMarks !== null && evalMarks !== undefined) ? evalMarks : '';

    const feedbackInput = document.getElementById('evalFeedback');
    const evalFeedback = student.evaluation?.feedback ?? student.feedback;
    feedbackInput.value = evalFeedback || '';

    const saveText = document.getElementById('btnSaveEvalText');
    if (saveText) saveText.textContent = isEvaluated ? 'Update Evaluation' : 'Save Evaluation';

    const errEl = document.getElementById('evalMarksError');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

    modal.style.display = 'flex';
    marksInput.focus();
  }

  async function handleSaveEvaluation(e) {
    e.preventDefault();

    const submissionId = document.getElementById('evalSubmissionId').value;
    const assignmentId = document.getElementById('evalAssignmentId').value;
    const marksInput = document.getElementById('evalMarksObtained');
    const feedbackInput = document.getElementById('evalFeedback');
    const errEl = document.getElementById('evalMarksError');
    const saveBtn = document.getElementById('btnSaveEvaluation');
    const saveText = document.getElementById('btnSaveEvalText');

    if (!submissionId || !assignmentId) {
      showToast('Missing submission reference.', 'error');
      return;
    }

    const marksVal = marksInput.value.trim();
    if (marksVal === '') {
      if (errEl) {
        errEl.textContent = 'Marks obtained is required.';
        errEl.style.display = 'block';
      }
      marksInput.focus();
      return;
    }

    const marksObtained = parseFloat(marksVal);
    const maxMarks = currentSubmissionsData?.assignment?.max_marks || 100;

    if (isNaN(marksObtained)) {
      if (errEl) {
        errEl.textContent = 'Please enter a valid numeric value for marks.';
        errEl.style.display = 'block';
      }
      marksInput.focus();
      return;
    }

    if (marksObtained < 0) {
      if (errEl) {
        errEl.textContent = 'Marks obtained cannot be negative.';
        errEl.style.display = 'block';
      }
      marksInput.focus();
      return;
    }

    if (marksObtained > maxMarks) {
      if (errEl) {
        errEl.textContent = `Marks cannot exceed the assignment maximum (${maxMarks}).`;
        errEl.style.display = 'block';
      }
      marksInput.focus();
      return;
    }

    if (errEl) {
      errEl.textContent = '';
      errEl.style.display = 'none';
    }

    const feedback = feedbackInput.value.trim();

    // Disable button to prevent duplicate submissions
    if (saveBtn) saveBtn.disabled = true;
    const originalBtnText = saveText ? saveText.textContent : 'Save Evaluation';
    if (saveText) saveText.textContent = 'Saving...';

    try {
      const res = await apiFetch(`/api/assignments/${assignmentId}/submissions/${submissionId}/evaluate`, {
        method: 'POST',
        body: JSON.stringify({
          marks_obtained: marksObtained,
          feedback: feedback
        })
      });

      if (res && res.success) {
        showToast('Evaluation saved and student notified successfully!', 'success');
        const evalModal = document.getElementById('evaluateSubmissionModal');
        if (evalModal) evalModal.style.display = 'none';
        // Refresh the roster and KPIs
        await openSubmissionsModal(assignmentId);
      } else {
        const msg = res?.message || 'Failed to save evaluation.';
        if (errEl) {
          errEl.textContent = msg;
          errEl.style.display = 'block';
        }
        showToast(msg, 'error');
      }
    } catch (err) {
      console.error('Error saving evaluation:', err);
      showToast('Error saving evaluation.', 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (saveText) saveText.textContent = originalBtnText;
    }
  }

  function openEditModal(asg) {
    if (!asg) return;
    const modal = document.getElementById('editAssignmentModal');
    if (!modal) return;

    document.getElementById('editAssignId').value = asg.assignment_id;
    document.getElementById('editAssignCourse').value = asg.course_id;
    document.getElementById('editAssignTitle').value = asg.title || '';
    document.getElementById('editAssignMaxMarks').value = asg.max_marks || 100;
    document.getElementById('editAssignDesc').value = asg.description || '';

    if (asg.due_date) {
      const d = new Date(asg.due_date);
      // Format as YYYY-MM-DDTHH:mm
      const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      document.getElementById('editAssignDueDate').value = localIso;
    } else {
      document.getElementById('editAssignDueDate').value = '';
    }

    modal.style.display = 'flex';
  }

  async function handleCreateAssignment(e) {
    e.preventDefault();

    const courseSelect = document.getElementById('modalAssignCourse');
    const titleInput = document.getElementById('modalAssignTitle');
    const dueDateInput = document.getElementById('modalAssignDueDate');
    const maxMarksInput = document.getElementById('modalAssignMaxMarks');
    const descInput = document.getElementById('modalAssignDesc');

    const courseId = courseSelect?.value;
    const title = titleInput?.value?.trim();
    const dueDate = dueDateInput?.value;
    const maxMarks = parseInt(maxMarksInput?.value, 10) || 100;
    const desc = descInput?.value?.trim() || '';

    if (!courseId) {
      showToast('Please select an assigned course for the assignment.', 'error');
      return;
    }
    if (!title) {
      showToast('Please specify an assignment title.', 'error');
      return;
    }
    if (!dueDate) {
      showToast('Please specify a valid due date and time.', 'error');
      return;
    }

    try {
      const res = await apiFetch('/api/assignments', {
        method: 'POST',
        body: JSON.stringify({
          course_id: parseInt(courseId, 10),
          title,
          description: desc,
          due_date: dueDate,
          max_marks: maxMarks
        })
      });

      if (res && res.success) {
        showToast('Assignment published and enrolled students notified!', 'success');
        document.getElementById('createAssignmentModal').style.display = 'none';
        document.getElementById('createAssignmentForm').reset();
        await loadAssignments();
      } else {
        showToast(res?.message || 'Failed to create assignment.', 'error');
      }
    } catch (err) {
      console.error('Error creating assignment:', err);
      showToast('Error creating assignment.', 'error');
    }
  }

  async function handleEditAssignment(e) {
    e.preventDefault();

    const id = document.getElementById('editAssignId').value;
    const courseId = document.getElementById('editAssignCourse').value;
    const title = document.getElementById('editAssignTitle').value.trim();
    const dueDate = document.getElementById('editAssignDueDate').value;
    const maxMarks = parseInt(document.getElementById('editAssignMaxMarks').value, 10) || 100;
    const desc = document.getElementById('editAssignDesc').value.trim();

    if (!title) {
      showToast('Assignment title is required.', 'error');
      return;
    }
    if (!dueDate) {
      showToast('Due date is required.', 'error');
      return;
    }

    try {
      const res = await apiFetch(`/api/assignments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          course_id: parseInt(courseId, 10),
          title,
          description: desc,
          due_date: dueDate,
          max_marks: maxMarks
        })
      });

      if (res && res.success) {
        showToast('Assignment updated successfully!', 'success');
        document.getElementById('editAssignmentModal').style.display = 'none';
        await loadAssignments();
      } else {
        showToast(res?.message || 'Failed to update assignment.', 'error');
      }
    } catch (err) {
      console.error('Error updating assignment:', err);
      showToast('Error updating assignment.', 'error');
    }
  }

  async function handleDeleteAssignment(id, title) {
    if (!confirm(`Are you sure you want to permanently delete the assignment "${title || id}"? All student submissions will be removed.`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/assignments/${id}`, { method: 'DELETE' });
      if (res && res.success) {
        showToast('Assignment and submission files removed.', 'success');
        await loadAssignments();
      } else {
        showToast(res?.message || 'Failed to delete assignment.', 'error');
      }
    } catch (e) {
      showToast('Error deleting assignment.', 'error');
    }
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
      // Fallback
    }
  }

  document.addEventListener('DOMContentLoaded', initAssignments);
})();
