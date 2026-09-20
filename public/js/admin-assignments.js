/**
 * Admin Assignments Management Script
 * Handles CRUD operations, filtering, statistics, and modal state management
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
  let coursesList = [];
  let teachersList = [];
  let pendingDeleteId = null;

  // Filter Elements
  const filterSearch = document.getElementById('filterSearch');
  const filterCourse = document.getElementById('filterCourse');
  const filterTeacher = document.getElementById('filterTeacher');
  const filterSemester = document.getElementById('filterSemester');
  const filterDueStatus = document.getElementById('filterDueStatus');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnRefresh = document.getElementById('btnRefresh');

  // KPI Elements
  const kpiTotalAssignments = document.getElementById('kpiTotalAssignments');
  const kpiActiveAssignments = document.getElementById('kpiActiveAssignments');
  const kpiUpcomingAssignments = document.getElementById('kpiUpcomingAssignments');
  const kpiOverdueAssignments = document.getElementById('kpiOverdueAssignments');

  // Table & Pagination
  const assignmentsBody = document.getElementById('assignmentsBody');
  const paginationInfo = document.getElementById('paginationInfo');
  const paginationCurrentPage = document.getElementById('paginationCurrentPage');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');

  // Modals
  const assignmentModal = document.getElementById('assignmentModal');
  const assignmentForm = document.getElementById('assignmentForm');
  const modalAssignmentTitle = document.getElementById('modalAssignmentTitle');
  const assignmentIdInput = document.getElementById('assignmentId');
  const modalCourse = document.getElementById('modalCourse');
  const modalTeacher = document.getElementById('modalTeacher');
  const modalTitle = document.getElementById('modalTitle');
  const modalDueDate = document.getElementById('modalDueDate');
  const modalMaxMarks = document.getElementById('modalMaxMarks');
  const modalFilePath = document.getElementById('modalFilePath');
  const modalDescription = document.getElementById('modalDescription');
  const btnSaveAssignment = document.getElementById('btnSaveAssignment');

  const viewAssignmentModal = document.getElementById('viewAssignmentModal');
  const viewAssignmentContent = document.getElementById('viewAssignmentContent');

  const deleteAssignmentModal = document.getElementById('deleteAssignmentModal');
  const deleteAssignmentDetails = document.getElementById('deleteAssignmentDetails');
  const btnConfirmDeleteAssignment = document.getElementById('btnConfirmDeleteAssignment');

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

  // Generic close handlers for modals
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
  // 5. DATA FETCHING: LOOKUPS, STATS, & LIST
  // ==========================================================================
  async function loadLookups() {
    try {
      // 1. Fetch Courses
      const resCourses = await apiFetch('/api/courses?limit=100');
      if (resCourses && resCourses.ok) {
        const json = await resCourses.json();
        coursesList = json.data && json.data.courses ? json.data.courses : [];
        
        let courseOpts = '<option value="">All Courses</option>';
        let modalCourseOpts = '<option value="">Select Course</option>';
        coursesList.forEach((c) => {
          const opt = `<option value="${c.course_id}">${escapeHtml(c.course_code)} - ${escapeHtml(c.course_name)} (Sem ${c.semester})</option>`;
          courseOpts += opt;
          modalCourseOpts += opt;
        });
        filterCourse.innerHTML = courseOpts;
        modalCourse.innerHTML = modalCourseOpts;
      }

      // 2. Fetch Teachers
      const resTeachers = await apiFetch('/api/teachers?limit=100');
      if (resTeachers && resTeachers.ok) {
        const json = await resTeachers.json();
        teachersList = json.data && json.data.teachers ? json.data.teachers : [];
        
        let teacherOpts = '<option value="">All Teachers</option>';
        let modalTeacherOpts = '<option value="">Select Active Teacher</option>';
        teachersList.forEach((t) => {
          // Check if teacher user is active
          const isTeacherActive = t.is_active !== undefined ? Boolean(t.is_active) : true;
          const statusSuffix = isTeacherActive ? '' : ' (Inactive)';
          const opt = `<option value="${t.teacher_id}" ${!isTeacherActive ? 'disabled' : ''}>${escapeHtml(t.first_name)} ${escapeHtml(t.last_name)} (${escapeHtml(t.designation || 'Faculty')})${statusSuffix}</option>`;
          teacherOpts += opt;
          if (isTeacherActive) {
            modalTeacherOpts += opt;
          }
        });
        filterTeacher.innerHTML = teacherOpts;
        modalTeacher.innerHTML = modalTeacherOpts;
      }
    } catch (err) {
      console.error('Error loading lookup filters:', err);
    }
  }

  async function loadStats() {
    try {
      const res = await apiFetch('/api/assignments/stats');
      if (!res || !res.ok) return;
      const json = await res.json();
      const s = json.data && json.data.stats ? json.data.stats : {};

      kpiTotalAssignments.textContent = s.total_assignments || 0;
      kpiActiveAssignments.textContent = s.active_assignments || 0;
      kpiUpcomingAssignments.textContent = s.upcoming_assignments || 0;
      kpiOverdueAssignments.textContent = s.overdue_assignments || 0;
    } catch (err) {
      console.error('Error fetching assignment statistics:', err);
    }
  }

  async function loadAssignments(page = 1) {
    currentPage = page;
    assignmentsBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">Loading assignments...</td>
      </tr>
    `;

    const params = new URLSearchParams();
    params.set('page', currentPage);
    params.set('limit', itemsPerPage);

    if (filterSearch.value.trim()) params.set('search', filterSearch.value.trim());
    if (filterCourse.value) params.set('course_id', filterCourse.value);
    if (filterTeacher.value) params.set('teacher_id', filterTeacher.value);
    if (filterSemester.value) params.set('semester', filterSemester.value);
    if (filterDueStatus.value) params.set('due_status', filterDueStatus.value);

    try {
      const res = await apiFetch(`/api/assignments?${params.toString()}`);
      if (!res || !res.ok) {
        assignmentsBody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-4 text-danger">Failed to load assignments. Please try again.</td>
          </tr>
        `;
        return;
      }

      const json = await res.json();
      const data = json.data || {};
      const assignments = data.assignments || [];
      const pagination = data.pagination || { total: 0, totalPages: 1 };

      totalItems = pagination.total;
      totalPages = pagination.totalPages;

      renderAssignmentsTable(assignments);
      updatePaginationControls();
    } catch (err) {
      console.error('Error loading assignments:', err);
      assignmentsBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-4 text-danger">An unexpected error occurred while loading assignments.</td>
        </tr>
      `;
    }
  }

  function renderAssignmentsTable(assignments) {
    if (!assignments || assignments.length === 0) {
      assignmentsBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="erp-empty-state">
              <div class="erp-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
              </div>
              <div class="erp-empty-title">No Assignments Found</div>
              <div class="erp-empty-text">No assignments match the selected filters or search parameters.</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    assignments.forEach((a) => {
      // Due status badge
      let statusBadge = '<span class="erp-badge badge-active">Active</span>';
      if (a.status === 'Overdue') {
        statusBadge = '<span class="erp-badge badge-overdue">Overdue</span>';
      } else if (a.status === 'Upcoming') {
        statusBadge = '<span class="erp-badge badge-upcoming">Upcoming</span>';
      }

      // Format Date
      let formattedDate = 'Not set';
      if (a.due_date) {
        const d = new Date(a.due_date);
        formattedDate = d.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      // Safe Attachment Link
      let attachmentCell = '<span style="color: #94a3b8; font-size: 12px;">No resource</span>';
      if (a.file_path) {
        const isExternal = /^https?:\/\//i.test(a.file_path);
        attachmentCell = `
          <a href="${escapeHtml(a.file_path)}" target="_blank" rel="noopener noreferrer" style="color: #7c3aed; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; text-decoration: none;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            ${isExternal ? 'Open Link' : 'View File'}
          </a>
        `;
      }

      rowsHtml += `
        <tr>
          <td>
            <div style="font-weight: 600; color: #0f172a;">${escapeHtml(a.title)}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
              <span style="font-weight: 600; color: #7c3aed;">${escapeHtml(a.course_code || '')}</span> - ${escapeHtml(a.course_name || 'Course')} 
              <span style="color: #94a3b8;">(Sem ${a.semester || '-'})</span>
            </div>
          </td>
          <td>
            <div style="font-weight: 600; color: #1e293b;">${escapeHtml(a.teacher_name || 'Faculty Member')}</div>
            <div style="font-size: 11.5px; color: #64748b;">${escapeHtml(a.teacher_designation || '')}</div>
          </td>
          <td>
            <div style="font-size: 12.5px; font-weight: 500; color: #334155;">${formattedDate}</div>
          </td>
          <td>
            <span style="font-weight: 700; color: #0f172a;">${a.max_marks} pts</span>
          </td>
          <td>
            ${attachmentCell}
          </td>
          <td>
            ${statusBadge}
          </td>
          <td style="text-align: right;">
            <div class="erp-row-actions">
              <button type="button" class="btn-row-action btn-row-action-view btn-view-assignment" data-id="${a.assignment_id}" title="View Details">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button type="button" class="btn-row-action btn-edit-assignment" data-id="${a.assignment_id}" title="Edit Assignment">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button type="button" class="btn-row-action btn-row-action-delete btn-delete-assignment" data-id="${a.assignment_id}" data-title="${escapeHtml(a.title)}" data-course="${escapeHtml(a.course_name || '')}" title="Delete Assignment">
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

    assignmentsBody.innerHTML = rowsHtml;
    attachRowEventListeners();
  }

  function updatePaginationControls() {
    const start = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, totalItems);
    paginationInfo.textContent = `Showing ${start} to ${end} of ${totalItems} assignments`;
    paginationCurrentPage.textContent = `Page ${currentPage} of ${totalPages || 1}`;

    btnPrevPage.disabled = currentPage <= 1;
    btnNextPage.disabled = currentPage >= totalPages || totalPages === 0;
  }

  function attachRowEventListeners() {
    // View
    document.querySelectorAll('.btn-view-assignment').forEach((btn) => {
      btn.addEventListener('click', () => handleViewAssignment(btn.dataset.id));
    });

    // Edit
    document.querySelectorAll('.btn-edit-assignment').forEach((btn) => {
      btn.addEventListener('click', () => handleEditAssignment(btn.dataset.id));
    });

    // Delete
    document.querySelectorAll('.btn-delete-assignment').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingDeleteId = btn.dataset.id;
        deleteAssignmentDetails.innerHTML = `
          <strong>${escapeHtml(btn.dataset.title)}</strong><br>
          Course: ${escapeHtml(btn.dataset.course)}
        `;
        openModal(deleteAssignmentModal);
      });
    });
  }

  // ==========================================================================
  // 6. VIEW ASSIGNMENT DETAILS
  // ==========================================================================
  async function handleViewAssignment(id) {
    try {
      const res = await apiFetch(`/api/assignments/${id}`);
      if (!res || !res.ok) {
        showToast('Failed to fetch assignment details', 'error');
        return;
      }
      const json = await res.json();
      const a = json.data && json.data.assignment ? json.data.assignment : null;
      if (!a) return;

      let formattedDate = 'Not set';
      if (a.due_date) {
        formattedDate = new Date(a.due_date).toLocaleString('en-US', {
          dateStyle: 'full',
          timeStyle: 'short'
        });
      }

      let resourceDisplay = '<span class="text-muted">None attached</span>';
      if (a.file_path) {
        resourceDisplay = `
          <a href="${escapeHtml(a.file_path)}" target="_blank" rel="noopener noreferrer" class="link-primary" style="word-break: break-all;">
            ${escapeHtml(a.file_path)}
          </a>
        `;
      }

      viewAssignmentContent.innerHTML = `
        <div class="detail-row" style="margin-bottom: 12px;">
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Title</div>
          <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${escapeHtml(a.title)}</div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Course</div>
            <div style="font-weight: 600;">${escapeHtml(a.course_code)} - ${escapeHtml(a.course_name)}</div>
            <div style="font-size: 12px; color: #64748b;">Semester ${a.semester || '-'} (${escapeHtml(a.academic_year || '-')})</div>
          </div>
          <div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Assigning Faculty</div>
            <div style="font-weight: 600;">${escapeHtml(a.teacher_name)}</div>
            <div style="font-size: 12px; color: #64748b;">${escapeHtml(a.teacher_designation || '')}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Submission Due Date</div>
            <div style="font-weight: 600;">${formattedDate}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Maximum Marks</div>
            <div style="font-weight: 600; color: #7c3aed;">${a.max_marks} Points</div>
          </div>
        </div>

        <div class="detail-row" style="margin-bottom: 12px;">
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Resource URL / File Reference</div>
          <div>${resourceDisplay}</div>
        </div>

        <div class="detail-row">
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Description / Guidelines</div>
          <div style="margin-top: 4px; padding: 10px; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 13px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(a.description || 'No additional instructions provided.')}</div>
        </div>
      `;

      openModal(viewAssignmentModal);
    } catch (err) {
      console.error('Error in handleViewAssignment:', err);
      showToast('Error opening assignment details', 'error');
    }
  }

  // ==========================================================================
  // 7. ADD & EDIT ASSIGNMENT
  // ==========================================================================
  function resetAssignmentForm() {
    assignmentForm.reset();
    assignmentIdInput.value = '';
    modalAssignmentTitle.textContent = 'Create New Assignment';
    modalMaxMarks.value = '100';
  }

  document.getElementById('btnAddAssignment').addEventListener('click', () => {
    resetAssignmentForm();
    // Default due date to 7 days from now formatted for datetime-local
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    modalDueDate.value = future.toISOString().slice(0, 16);
    openModal(assignmentModal);
  });

  async function handleEditAssignment(id) {
    try {
      const res = await apiFetch(`/api/assignments/${id}`);
      if (!res || !res.ok) {
        showToast('Failed to load assignment data', 'error');
        return;
      }
      const json = await res.json();
      const a = json.data && json.data.assignment ? json.data.assignment : null;
      if (!a) return;

      resetAssignmentForm();
      modalAssignmentTitle.textContent = 'Edit Assignment';
      assignmentIdInput.value = a.assignment_id;
      modalCourse.value = a.course_id;
      modalTeacher.value = a.teacher_id;
      modalTitle.value = a.title;
      modalMaxMarks.value = a.max_marks;
      modalFilePath.value = a.file_path || '';
      modalDescription.value = a.description || '';

      if (a.due_date) {
        const d = new Date(a.due_date);
        // adjust to local ISO string for datetime-local
        const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        modalDueDate.value = localIso;
      }

      openModal(assignmentModal);
    } catch (err) {
      console.error('Error in handleEditAssignment:', err);
      showToast('Error loading assignment for edit', 'error');
    }
  }

  assignmentForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = assignmentIdInput.value.trim();
    const course_id = modalCourse.value;
    const teacher_id = modalTeacher.value;
    const title = modalTitle.value.trim();
    const due_date = modalDueDate.value;
    const max_marks = modalMaxMarks.value;
    const file_path = modalFilePath.value.trim();
    const description = modalDescription.value.trim();

    if (!course_id || !teacher_id || !title || !due_date || !max_marks) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    const payload = {
      course_id: parseInt(course_id, 10),
      teacher_id: parseInt(teacher_id, 10),
      title,
      due_date,
      max_marks: parseFloat(max_marks),
      file_path: file_path || null,
      description: description || null
    };

    btnSaveAssignment.disabled = true;
    btnSaveAssignment.textContent = 'Saving...';

    try {
      const endpoint = id ? `/api/assignments/${id}` : '/api/assignments';
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

      showToast(id ? 'Assignment updated successfully' : 'Assignment created successfully', 'success');
      closeModal(assignmentModal);
      await loadStats();
      await loadAssignments(currentPage);
    } catch (err) {
      console.error('Error saving assignment:', err);
      showToast('An error occurred while saving assignment', 'error');
    } finally {
      btnSaveAssignment.disabled = false;
      btnSaveAssignment.textContent = 'Save Assignment';
    }
  });

  // ==========================================================================
  // 8. DELETE ASSIGNMENT
  // ==========================================================================
  btnConfirmDeleteAssignment.addEventListener('click', async () => {
    if (!pendingDeleteId) return;

    btnConfirmDeleteAssignment.disabled = true;
    btnConfirmDeleteAssignment.textContent = 'Deleting...';

    try {
      const res = await apiFetch(`/api/assignments/${pendingDeleteId}`, {
        method: 'DELETE'
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.message || 'Failed to delete assignment', 'error');
        return;
      }

      showToast('Assignment deleted successfully', 'success');
      closeModal(deleteAssignmentModal);
      pendingDeleteId = null;

      await loadStats();
      await loadAssignments(1);
    } catch (err) {
      console.error('Error deleting assignment:', err);
      showToast('An error occurred while deleting assignment', 'error');
    } finally {
      btnConfirmDeleteAssignment.disabled = false;
      btnConfirmDeleteAssignment.textContent = 'Confirm Delete';
    }
  });

  // ==========================================================================
  // 9. FILTERS & PAGINATION EVENTS
  // ==========================================================================
  let debounceTimeout = null;
  filterSearch.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      loadAssignments(1);
    }, 350);
  });

  filterCourse.addEventListener('change', () => loadAssignments(1));
  filterTeacher.addEventListener('change', () => loadAssignments(1));
  filterSemester.addEventListener('change', () => loadAssignments(1));
  filterDueStatus.addEventListener('change', () => loadAssignments(1));

  btnResetFilters.addEventListener('click', () => {
    filterSearch.value = '';
    filterCourse.value = '';
    filterTeacher.value = '';
    filterSemester.value = '';
    filterDueStatus.value = '';
    loadAssignments(1);
  });

  btnRefresh.addEventListener('click', () => {
    loadStats();
    loadAssignments(currentPage);
    showToast('Assignment data refreshed', 'info');
  });

  btnPrevPage.addEventListener('click', () => {
    if (currentPage > 1) {
      loadAssignments(currentPage - 1);
    }
  });

  btnNextPage.addEventListener('click', () => {
    if (currentPage < totalPages) {
      loadAssignments(currentPage + 1);
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
    await loadLookups();
    await loadStats();
    await loadAssignments(1);
  }

  init();
})();
