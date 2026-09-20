/**
 * Admin Course Management Controller
 * Student Information Portal
 */

// State Management
let currentPage = 1;
const pageSize = 10;
let searchQuery = '';
let selectedDept = '';
let selectedType = '';
let selectedStatus = '';
let availableDepartments = [];
let cachedCourses = [];
let activeAdmin = null;

// Modal Action Callback
let pendingConfirmAction = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Strict ADMIN authorization check
  activeAdmin = await requireAuth('ADMIN');
  if (!activeAdmin) return;

  // 2. Initialize Top Header and Sidebar profiles
  initAdminHeaderAndSidebar(activeAdmin);

  // 3. Initialize UI event bindings
  initSidebarAndDropdown();
  initModalCloseHandlers();
  initToolbarFilters();
  initFormSubmissions();

  // 4. Load Departments and Courses
  await loadDepartments();
  await loadCourses();
});

/**
 * Populate Top Header and Sidebar with authenticated user data
 */
function initAdminHeaderAndSidebar(user) {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const initial = (user.first_name ? user.first_name[0] : (user.username ? user.username[0] : 'A')).toUpperCase();

  const headerName = document.getElementById('headerAdminName');
  const headerAvatar = document.getElementById('headerAdminAvatar');
  const sidebarName = document.getElementById('sidebarAdminName');
  const sidebarAvatar = document.getElementById('sidebarAdminAvatar');
  const sidebarEmail = document.getElementById('sidebarAdminEmail');
  const dropdownName = document.getElementById('dropdownAdminName');
  const dropdownEmail = document.getElementById('dropdownAdminEmail');

  if (headerName) headerName.textContent = fullName;
  if (headerAvatar) {
    if (typeof window.renderAvatarElement === 'function') {
      window.renderAvatarElement(headerAvatar, user.profile_photo_url, initial, fullName + ' avatar');
    } else {
      headerAvatar.textContent = initial;
    }
  }
  if (sidebarName) sidebarName.textContent = fullName;
  if (sidebarAvatar) {
    if (typeof window.renderAvatarElement === 'function') {
      window.renderAvatarElement(sidebarAvatar, user.profile_photo_url, initial, fullName + ' avatar');
    } else {
      sidebarAvatar.textContent = initial;
    }
  }
  if (sidebarEmail) sidebarEmail.textContent = user.email || 'admin@portal.local';
  if (dropdownName) dropdownName.textContent = fullName;
  if (dropdownEmail) dropdownEmail.textContent = user.email || 'admin@portal.local';
}

/**
 * Mobile drawer and Profile dropdown interactions
 */
function initSidebarAndDropdown() {
  const sidebar = document.getElementById('adminSidebar');
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  const closeBtn = document.getElementById('sidebarCloseBtn');
  const backdrop = document.getElementById('sidebarBackdrop');

  function openSidebar() {
    if (sidebar) sidebar.classList.add('open');
    if (backdrop) backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.add('hidden');
    document.body.style.overflow = '';
  }

  if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  // Header Dropdown Menu
  const triggerBtn = document.getElementById('profileDropdownTrigger');
  const dropdownMenu = document.getElementById('profileDropdownMenu');
  const dropdownLogoutBtn = document.getElementById('dropdownLogoutBtn');
  const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');

  if (!window.UserMenu && triggerBtn && dropdownMenu) {
    triggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!dropdownMenu.contains(e.target) && !triggerBtn.contains(e.target)) {
        dropdownMenu.classList.remove('show');
      }
    });
  }

  if (dropdownLogoutBtn) dropdownLogoutBtn.addEventListener('click', logout);
  if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', logout);
}

/**
 * Modal Dismiss Controls
 */
function initModalCloseHandlers() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });

  // Close modals on clicking overlay backdrop
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
      }
    });
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    }
  });
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

/**
 * Load active departments for dropdowns
 */
async function loadDepartments() {
  const filterSelect = document.getElementById('deptFilterSelect');
  const addDeptSelect = document.getElementById('addCourseDept');
  const editDeptSelect = document.getElementById('editCourseDept');
  const noticeEl = document.getElementById('addDeptNotice');
  const submitAddBtn = document.getElementById('submitAddCourseBtn');

  try {
    const res = await apiRequest('/departments?all=true');
    if (res.ok && res.data && res.data.data && Array.isArray(res.data.data.departments)) {
      availableDepartments = res.data.data.departments;
    } else {
      availableDepartments = [];
    }

    // Populate Filter select
    if (filterSelect) {
      filterSelect.innerHTML = '<option value="">All Departments</option>';
      availableDepartments.forEach(dept => {
        filterSelect.innerHTML += `
          <option value="${dept.department_id}">${escapeHtml(dept.department_name)} (${escapeHtml(dept.department_code)})</option>
        `;
      });
    }

    // Populate Add select
    if (addDeptSelect) {
      addDeptSelect.innerHTML = '<option value="">Select Department</option>';
      const activeDepts = availableDepartments.filter(d => Boolean(d.is_active));

      if (activeDepts.length === 0) {
        if (noticeEl) {
          noticeEl.textContent = 'No active departments available. Register an active department first.';
          noticeEl.style.color = 'var(--danger-600)';
          noticeEl.style.fontWeight = '600';
        }
        if (submitAddBtn) {
          submitAddBtn.disabled = true;
        }
      } else {
        if (noticeEl) {
          noticeEl.textContent = 'Courses can only be created under active academic departments.';
          noticeEl.style.color = 'var(--slate-500)';
          noticeEl.style.fontWeight = 'normal';
        }
        if (submitAddBtn) {
          submitAddBtn.disabled = false;
        }

        activeDepts.forEach(dept => {
          addDeptSelect.innerHTML += `
            <option value="${dept.department_id}">${escapeHtml(dept.department_name)} (${escapeHtml(dept.department_code)})</option>
          `;
        });
      }
    }

    // Populate Edit select
    if (editDeptSelect) {
      editDeptSelect.innerHTML = '<option value="">Select Department</option>';
      availableDepartments.forEach(dept => {
        editDeptSelect.innerHTML += `
          <option value="${dept.department_id}">${escapeHtml(dept.department_name)} (${escapeHtml(dept.department_code)})</option>
        `;
      });
    }

  } catch (err) {
    console.error('Error loading departments:', err);
  }
}

/**
 * Toolbar Filters & Search
 */
function initToolbarFilters() {
  const searchInput = document.getElementById('courseSearchInput');
  const deptSelect = document.getElementById('deptFilterSelect');
  const typeSelect = document.getElementById('typeFilterSelect');
  const statusSelect = document.getElementById('statusFilterSelect');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const openAddBtn = document.getElementById('openAddCourseBtn');

  // Search with debounce
  let debounceTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        searchQuery = e.target.value.trim();
        currentPage = 1;
        loadCourses();
      }, 300);
    });
  }

  // Department filter
  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      selectedDept = e.target.value;
      currentPage = 1;
      loadCourses();
    });
  }

  // Course Type filter
  if (typeSelect) {
    typeSelect.addEventListener('change', (e) => {
      selectedType = e.target.value;
      currentPage = 1;
      loadCourses();
    });
  }

  // Status filter
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      selectedStatus = e.target.value;
      currentPage = 1;
      loadCourses();
    });
  }

  // Pagination Previous
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadCourses();
      }
    });
  }

  // Pagination Next
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentPage++;
      loadCourses();
    });
  }

  // Open Add Course Modal
  if (openAddBtn) {
    openAddBtn.addEventListener('click', async () => {
      await loadDepartments(); // Refresh departments list dynamically
      const form = document.getElementById('addCourseForm');
      if (form) form.reset();
      hideModalAlert('addModalAlert');

      const yrInput = document.getElementById('addCourseAcademicYear');
      if (yrInput && !yrInput.value) yrInput.value = '2025-2026';

      openModal('addCourseModal');
      setTimeout(() => {
        const codeInput = document.getElementById('addCourseCode');
        if (codeInput) codeInput.focus();
      }, 50);
    });
  }
}

/**
 * Load Courses from Backend API
 */
async function loadCourses() {
  const tbody = document.getElementById('coursesTableBody');
  const emptyState = document.getElementById('coursesTableEmpty');
  const paginationInfo = document.getElementById('paginationInfo');
  const pageIndicator = document.getElementById('pageIndicator');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 40px; color: var(--slate-500);">
          <div style="display: inline-flex; align-items: center; gap: 8px;">
            <svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
              <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
            </svg>
            <span>Loading courses...</span>
          </div>
        </td>
      </tr>
    `;
  }

  try {
    const queryParams = new URLSearchParams();
    queryParams.append('page', currentPage);
    queryParams.append('limit', pageSize);
    if (searchQuery) queryParams.append('search', searchQuery);
    if (selectedDept !== '') queryParams.append('department_id', selectedDept);
    if (selectedType !== '') queryParams.append('course_type', selectedType);
    if (selectedStatus !== '') queryParams.append('status', selectedStatus);

    const res = await apiRequest(`/courses?${queryParams.toString()}`);

    if (!res.ok || !res.data || !res.data.success) {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align: center; padding: 32px; color: var(--danger-600);">
              ${escapeHtml(res.data?.message || 'Failed to load courses. Please refresh.')}
            </td>
          </tr>
        `;
      }
      return;
    }

    const { courses, pagination } = res.data.data;
    cachedCourses = courses || [];

    if (!courses || courses.length === 0) {
      if (tbody) tbody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (paginationInfo) paginationInfo.textContent = 'Showing 0 to 0 of 0 courses';
      if (pageIndicator) pageIndicator.textContent = 'Page 1 of 1';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Render Table Rows
    let rowsHtml = '';
    courses.forEach(course => {
      rowsHtml += renderCourseRow(course);
    });
    if (tbody) tbody.innerHTML = rowsHtml;

    // Update Pagination UI
    const total = pagination.total || courses.length;
    const totalPages = pagination.totalPages || 1;
    const startIdx = (pagination.page - 1) * pagination.limit + 1;
    const endIdx = Math.min(pagination.page * pagination.limit, total);

    if (paginationInfo) {
      paginationInfo.textContent = `Showing ${startIdx} to ${endIdx} of ${total} course${total === 1 ? '' : 's'}`;
    }
    if (pageIndicator) {
      pageIndicator.textContent = `Page ${pagination.page} of ${totalPages}`;
    }
    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= totalPages;

  } catch (error) {
    console.error('Error loading courses:', error);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 32px; color: var(--danger-600);">
            Failed to connect to the server. Please check your connection.
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Render single course row
 */
function renderCourseRow(course) {
  let typeBadgeStyle = 'background: #e0f2fe; color: #0369a1;';
  if (course.course_type === 'Practical') {
    typeBadgeStyle = 'background: #f3e8ff; color: #7e22ce;';
  } else if (course.course_type === 'Combined') {
    typeBadgeStyle = 'background: #dcfce7; color: #15803d;';
  }

  const deptName = course.department_name ? `${course.department_name} (${course.department_code})` : (course.department_code || '—');

  return `
    <tr>
      <td>
        <span class="badge" style="background: #f5f3ff; color: #7c3aed; font-family: monospace; font-weight: 700; font-size: 13px;">
          ${escapeHtml(course.course_code)}
        </span>
      </td>
      <td>
        <div style="font-weight: 600; color: var(--slate-900); font-size: 14px;">
          ${escapeHtml(course.course_name)}
        </div>
      </td>
      <td style="font-size: 13px; color: var(--slate-700);">
        ${escapeHtml(deptName)}
      </td>
      <td>
        <span class="badge badge-neutral" style="font-weight: 700;">
          ${parseFloat(course.credits).toFixed(1)}
        </span>
      </td>
      <td>
        <span class="badge" style="${typeBadgeStyle} font-weight: 600;">
          ${escapeHtml(course.course_type)}
        </span>
      </td>
      <td style="font-size: 13px; color: var(--slate-700);">
        Sem ${course.semester}
      </td>
      <td style="font-size: 13px; color: var(--slate-500); font-family: monospace;">
        ${escapeHtml(course.academic_year)}
      </td>
      <td>
        <span class="status-pill status-active">Active</span>
      </td>
      <td>
        <div class="action-buttons-group" style="justify-content: flex-end;">
          <button type="button" class="btn-action btn-action-view" title="View details" onclick="viewCourse(${course.course_id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-edit" title="Edit course" onclick="editCourse(${course.course_id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-status" title="Toggle Status" onclick="promptToggleStatus(${course.course_id}, true, '${escapeHtml(course.course_code)}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
              <line x1="12" y1="2" x2="12" y2="12"></line>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-delete" title="Delete course" onclick="promptDeleteCourse(${course.course_id}, '${escapeHtml(course.course_code)}', ${course.enrollment_count || 0})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `;
}

/**
 * View Course Details Modal
 */
window.viewCourse = async function(courseId) {
  let course = cachedCourses.find(c => c.course_id === courseId);
  if (!course || course.enrollment_count === undefined) {
    try {
      const res = await apiRequest(`/courses/${courseId}`);
      if (res.ok && res.data && res.data.data) {
        course = res.data.data.course;
      }
    } catch (e) {}
  }

  if (!course) {
    showToast('Unable to load course details', 'error');
    return;
  }

  const createdFormatted = typeof formatDateTime === 'function' ? formatDateTime(course.created_at) : course.created_at;
  const updatedFormatted = typeof formatDateTime === 'function' ? formatDateTime(course.updated_at) : course.updated_at;

  document.getElementById('viewCourseName').textContent = course.course_name;
  document.getElementById('viewCourseCode').textContent = course.course_code;

  const typeBadge = document.getElementById('viewCourseTypeBadge');
  if (typeBadge) {
    typeBadge.textContent = course.course_type;
    typeBadge.className = 'badge badge-primary';
  }

  document.getElementById('viewCourseIdVal').textContent = course.course_id;
  document.getElementById('viewCourseCodeVal').textContent = course.course_code;
  document.getElementById('viewCourseNameVal').textContent = course.course_name;
  document.getElementById('viewCourseDeptVal').textContent = course.department_name ? `${course.department_name} (${course.department_code})` : (course.department_code || '—');
  document.getElementById('viewCourseCreditsVal').textContent = parseFloat(course.credits).toFixed(1);
  document.getElementById('viewCourseTypeVal').textContent = course.course_type;
  document.getElementById('viewCourseSemesterVal').textContent = `Semester ${course.semester}`;
  document.getElementById('viewCourseYearVal').textContent = course.academic_year;
  document.getElementById('viewCourseCreatedVal').textContent = createdFormatted;
  document.getElementById('viewCourseUpdatedVal').textContent = updatedFormatted;

  // Counters
  document.getElementById('viewCourseEnrollments').textContent = course.enrollment_count || 0;
  document.getElementById('viewCourseAttendance').textContent = course.attendance_count || 0;
  document.getElementById('viewCourseGrades').textContent = course.grade_count || 0;
  document.getElementById('viewCourseTimetable').textContent = course.timetable_count || 0;
  document.getElementById('viewCourseAssignments').textContent = course.assignment_count || 0;
  document.getElementById('viewCourseMaterials').textContent = course.material_count || 0;
  document.getElementById('viewCourseQueries').textContent = course.query_count || 0;

  openModal('viewCourseModal');
};

/**
 * Edit Course Modal Trigger
 */
window.editCourse = async function(courseId) {
  let course = cachedCourses.find(c => c.course_id === courseId);
  if (!course) {
    try {
      const res = await apiRequest(`/courses/${courseId}`);
      if (res.ok && res.data && res.data.data) {
        course = res.data.data.course;
      }
    } catch (e) {}
  }

  if (!course) {
    showToast('Unable to load course details', 'error');
    return;
  }

  await loadDepartments();
  hideModalAlert('editModalAlert');

  document.getElementById('editCourseId').value = course.course_id;
  document.getElementById('editCourseDept').value = String(course.department_id);
  document.getElementById('editCourseCode').value = course.course_code;
  document.getElementById('editCourseName').value = course.course_name;
  document.getElementById('editCourseCredits').value = parseFloat(course.credits);
  document.getElementById('editCourseType').value = course.course_type;
  document.getElementById('editCourseSemester').value = String(course.semester);
  document.getElementById('editCourseAcademicYear').value = course.academic_year;

  openModal('editCourseModal');
};

/**
 * Prompt Course Status Toggle
 */
window.promptToggleStatus = function(courseId, currentStatus, courseCode) {
  const actionText = currentStatus ? 'deactivate' : 'activate';
  const modalMsg = `Are you sure you want to <strong>${actionText}</strong> course <strong>${escapeHtml(courseCode)}</strong>?`;

  document.getElementById('confirmModalTitle').textContent = `${currentStatus ? 'Deactivate' : 'Activate'} Course`;
  document.getElementById('confirmModalMessage').innerHTML = modalMsg;

  const actionBtn = document.getElementById('confirmModalActionBtn');
  actionBtn.textContent = currentStatus ? 'Deactivate' : 'Activate';
  actionBtn.className = currentStatus ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';

  pendingConfirmAction = async () => {
    try {
      const res = await apiRequest(`/courses/${courseId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !currentStatus })
      });

      if (res.ok && res.data && res.data.success) {
        closeModal('confirmModal');
        showToast(`Course ${actionText}d successfully`, 'success');
        await loadCourses();
      } else {
        showToast(res.data?.message || 'Failed to update course status', 'error');
      }
    } catch (err) {
      showToast('Network error while updating status', 'error');
    }
  };

  openModal('confirmModal');
};

/**
 * Prompt Course Safe Deletion
 */
window.promptDeleteCourse = function(courseId, courseCode, enrollmentCount) {
  let modalMsg = '';
  if (enrollmentCount > 0) {
    modalMsg = `
      <div style="margin-bottom: 10px; color: var(--danger-600); font-weight: 600;">
        Warning: Related academic records detected!
      </div>
      Course <strong>${escapeHtml(courseCode)}</strong> currently has <strong>${enrollmentCount}</strong> active enrollment(s).
      <p style="font-size: 13px; color: var(--slate-600); margin: 8px 0 0 0;">
        Deleting this course will be blocked to preserve student academic records and integrity.
      </p>
    `;
  } else {
    modalMsg = `Are you sure you want to permanently delete course <strong>${escapeHtml(courseCode)}</strong>?<br><br><small style="color: var(--slate-500);">Note: Deletion will be safely blocked if this course has linked attendance, grades, timetable, assignments, or study materials.</small>`;
  }

  document.getElementById('confirmModalTitle').textContent = 'Delete Course';
  document.getElementById('confirmModalMessage').innerHTML = modalMsg;

  const actionBtn = document.getElementById('confirmModalActionBtn');
  actionBtn.textContent = 'Delete Course';
  actionBtn.className = 'btn btn-danger btn-sm';

  pendingConfirmAction = async () => {
    try {
      const res = await apiRequest(`/courses/${courseId}`, {
        method: 'DELETE'
      });

      if (res.ok && res.data && res.data.success) {
        closeModal('confirmModal');
        showToast('Course deleted successfully', 'success');
        await loadCourses();
      } else {
        closeModal('confirmModal');
        showToast(res.data?.message || 'Failed to delete course', 'error');
      }
    } catch (err) {
      closeModal('confirmModal');
      showToast('Network error while deleting course', 'error');
    }
  };

  openModal('confirmModal');
};

/**
 * Form Submission Listeners
 */
function initFormSubmissions() {
  // Confirm action button in modal
  const confirmBtn = document.getElementById('confirmModalActionBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (typeof pendingConfirmAction === 'function') {
        pendingConfirmAction();
      }
    });
  }

  // Add Course Form
  const addForm = document.getElementById('addCourseForm');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const deptId = document.getElementById('addCourseDept').value;
      const codeInput = document.getElementById('addCourseCode');
      const nameInput = document.getElementById('addCourseName');
      const creditsInput = document.getElementById('addCourseCredits');
      const typeInput = document.getElementById('addCourseType');
      const semInput = document.getElementById('addCourseSemester');
      const yrInput = document.getElementById('addCourseAcademicYear');

      if (!deptId) {
        showModalAlert('addModalAlert', 'Please select an academic department.');
        return;
      }

      const course_code = codeInput ? codeInput.value.trim().toUpperCase() : '';
      const course_name = nameInput ? nameInput.value.trim() : '';
      const credits = creditsInput ? parseFloat(creditsInput.value) : 0;
      const course_type = typeInput ? typeInput.value : 'Theory';
      const semester = semInput ? parseInt(semInput.value, 10) : 1;
      const academic_year = yrInput ? yrInput.value.trim() : '2025-2026';

      if (!course_code || !course_name) {
        showModalAlert('addModalAlert', 'Course code and course name are required.');
        return;
      }

      if (course_code.length > 30) {
        showModalAlert('addModalAlert', 'Course code cannot exceed 30 characters.');
        return;
      }

      if (course_name.length > 150) {
        showModalAlert('addModalAlert', 'Course name cannot exceed 150 characters.');
        return;
      }

      if (!/^[A-Z0-9_-]+$/.test(course_code)) {
        showModalAlert('addModalAlert', 'Course code can only contain letters, numbers, hyphens, and underscores.');
        return;
      }

      if (isNaN(credits) || credits <= 0) {
        showModalAlert('addModalAlert', 'Please enter a valid positive credit value (e.g. 3.0, 4.0).');
        return;
      }

      const submitBtn = document.getElementById('submitAddCourseBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
      }

      try {
        const payload = {
          course_code,
          course_name,
          department_id: parseInt(deptId, 10),
          credits,
          course_type,
          semester,
          academic_year
        };

        const res = await apiRequest('/courses', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('addCourseModal');
          showToast('Course created successfully', 'success');
          await loadCourses();
        } else {
          showModalAlert('addModalAlert', res.data?.message || 'Failed to create course.');
        }
      } catch (err) {
        showModalAlert('addModalAlert', 'A network error occurred. Please try again.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Course';
        }
      }
    });
  }

  // Edit Course Form
  const editForm = document.getElementById('editCourseForm');
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const courseId = document.getElementById('editCourseId').value;
      const deptId = document.getElementById('editCourseDept').value;
      const codeInput = document.getElementById('editCourseCode');
      const nameInput = document.getElementById('editCourseName');
      const creditsInput = document.getElementById('editCourseCredits');
      const typeInput = document.getElementById('editCourseType');
      const semInput = document.getElementById('editCourseSemester');
      const yrInput = document.getElementById('editCourseAcademicYear');

      if (!deptId) {
        showModalAlert('editModalAlert', 'Please select an academic department.');
        return;
      }

      const course_code = codeInput ? codeInput.value.trim().toUpperCase() : '';
      const course_name = nameInput ? nameInput.value.trim() : '';
      const credits = creditsInput ? parseFloat(creditsInput.value) : 0;
      const course_type = typeInput ? typeInput.value : 'Theory';
      const semester = semInput ? parseInt(semInput.value, 10) : 1;
      const academic_year = yrInput ? yrInput.value.trim() : '2025-2026';

      if (!course_code || !course_name) {
        showModalAlert('editModalAlert', 'Course code and course name are required.');
        return;
      }

      if (course_code.length > 30) {
        showModalAlert('editModalAlert', 'Course code cannot exceed 30 characters.');
        return;
      }

      if (course_name.length > 150) {
        showModalAlert('editModalAlert', 'Course name cannot exceed 150 characters.');
        return;
      }

      if (!/^[A-Z0-9_-]+$/.test(course_code)) {
        showModalAlert('editModalAlert', 'Course code can only contain letters, numbers, hyphens, and underscores.');
        return;
      }

      if (isNaN(credits) || credits <= 0) {
        showModalAlert('editModalAlert', 'Please enter a valid positive credit value (e.g. 3.0, 4.0).');
        return;
      }

      const submitBtn = document.getElementById('submitEditCourseBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      try {
        const payload = {
          course_code,
          course_name,
          department_id: parseInt(deptId, 10),
          credits,
          course_type,
          semester,
          academic_year
        };

        const res = await apiRequest(`/courses/${courseId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('editCourseModal');
          showToast('Course updated successfully', 'success');
          await loadCourses();
        } else {
          showModalAlert('editModalAlert', res.data?.message || 'Failed to update course.');
        }
      } catch (err) {
        showModalAlert('editModalAlert', 'A network error occurred. Please try again.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Changes';
        }
      }
    });
  }
}

/**
 * Modal Alert Helpers
 */
function showModalAlert(alertId, message) {
  const alertEl = document.getElementById(alertId);
  if (alertEl) {
    alertEl.textContent = message;
    alertEl.classList.remove('hidden');
  }
}

function hideModalAlert(alertId) {
  const alertEl = document.getElementById(alertId);
  if (alertEl) {
    alertEl.textContent = '';
    alertEl.classList.add('hidden');
  }
}

/**
 * Floating Toast Notification
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  } else if (type === 'error') {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  } else {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }

  toast.innerHTML = `
    <span class="toast-icon">${iconSvg}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 300);
  }, 4000);
}

/**
 * Basic HTML escaping utility
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
