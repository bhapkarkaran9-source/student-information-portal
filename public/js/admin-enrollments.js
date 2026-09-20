/**
 * Admin Enrollment Management Controller
 * Student Information Portal
 */

// State Management
let currentPage = 1;
const pageSize = 10;
let searchQuery = '';
let selectedStudent = '';
let selectedCourse = '';
let selectedDept = '';
let selectedYear = '';
let selectedSem = '';
let selectedStatus = '';

let availableStudents = [];
let availableCourses = [];
let availableDepartments = [];
let cachedEnrollments = [];
let activeAdmin = null;

let studentLoadStatus = 'idle';
let courseLoadStatus = 'idle';
let deptLoadStatus = 'idle';

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

  // 4. Load Reference Data and Enrollments
  await loadReferenceData();
  await loadEnrollments();
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

  const performLogout = () => {
    logout();
  };

  if (dropdownLogoutBtn) dropdownLogoutBtn.addEventListener('click', performLogout);
  if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', performLogout);
}

/**
 * Common modal open/close handlers
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
        closeModal(overlay.id);
      }
    });
  });

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(modal => {
        closeModal(modal.id);
      });
    }
  });

  // Confirm modal action button
  const confirmActionBtn = document.getElementById('confirmModalActionBtn');
  if (confirmActionBtn) {
    confirmActionBtn.addEventListener('click', async () => {
      if (typeof pendingConfirmAction === 'function') {
        const action = pendingConfirmAction;
        pendingConfirmAction = null;
        await action();
      }
    });
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

/**
 * Format Student Display Text: "PRN - First Name Last Name"
 * E.g. "B24IT1005 - Karan Bhapkar"
 */
function formatStudentDisplayName(s) {
  if (!s) return '';
  const prn = (s.prn_number || s.prn || s.enrollment_number || '').toString().trim();
  const fullName = `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.username || (s.student_id ? `Student #${s.student_id}` : '');
  return prn ? `${prn} - ${fullName}` : fullName;
}

/**
 * Format Course Display Text: "Course Code - Course Name"
 * E.g. "IT101 - DSML"
 */
function formatCourseDisplayName(c) {
  if (!c) return '';
  const code = (c.course_code || '').toString().trim();
  const name = (c.course_name || '').toString().trim();
  return code && name ? `${code} - ${name}` : (code || name);
}

/**
 * Load reference data: Students, Courses, and Departments
 */
async function loadReferenceData() {
  studentLoadStatus = 'loading';
  courseLoadStatus = 'loading';
  deptLoadStatus = 'loading';

  try {
    // 1. Load Students from live database
    const studentRes = await apiRequest('/students?limit=100');
    if (studentRes.ok && (studentRes.data?.success || studentRes.status === 200)) {
      const list = studentRes.data?.data?.students || studentRes.data?.students || (Array.isArray(studentRes.data?.data) ? studentRes.data.data : []);
      availableStudents = Array.isArray(list) ? list : [];
      // Sort students by PRN or Name ascending
      availableStudents.sort((a, b) => {
        const prnA = (a.prn_number || a.prn || a.enrollment_number || '').toString().trim().toLowerCase();
        const prnB = (b.prn_number || b.prn || b.enrollment_number || '').toString().trim().toLowerCase();
        if (prnA && prnB) return prnA.localeCompare(prnB);
        const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
        const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });
      studentLoadStatus = 'success';
    } else {
      availableStudents = [];
      studentLoadStatus = 'error';
      console.error('Failed to load students:', studentRes);
    }
  } catch (err) {
    availableStudents = [];
    studentLoadStatus = 'error';
    console.error('Error loading students:', err);
  }

  try {
    // 2. Load Courses from live database
    const courseRes = await apiRequest('/courses?all=true');
    if (courseRes.ok && (courseRes.data?.success || courseRes.status === 200)) {
      const list = courseRes.data?.data?.courses || courseRes.data?.courses || (Array.isArray(courseRes.data?.data) ? courseRes.data.data : []);
      availableCourses = Array.isArray(list) ? list : [];
      // Sort courses by course_code ascending
      availableCourses.sort((a, b) => {
        const codeA = (a.course_code || '').toString().trim().toLowerCase();
        const codeB = (b.course_code || '').toString().trim().toLowerCase();
        return codeA.localeCompare(codeB);
      });
      courseLoadStatus = 'success';
    } else {
      availableCourses = [];
      courseLoadStatus = 'error';
      console.error('Failed to load courses:', courseRes);
    }
  } catch (err) {
    availableCourses = [];
    courseLoadStatus = 'error';
    console.error('Error loading courses:', err);
  }

  try {
    // 3. Load Departments from live database
    const deptRes = await apiRequest('/departments?all=true');
    if (deptRes.ok && (deptRes.data?.success || deptRes.status === 200)) {
      const list = deptRes.data?.data?.departments || deptRes.data?.departments || (Array.isArray(deptRes.data?.data) ? deptRes.data.data : []);
      availableDepartments = Array.isArray(list) ? list : [];
      availableDepartments.sort((a, b) => (a.department_name || '').localeCompare(b.department_name || ''));
      deptLoadStatus = 'success';
    } else {
      availableDepartments = [];
      deptLoadStatus = 'error';
      console.error('Failed to load departments:', deptRes);
    }
  } catch (err) {
    availableDepartments = [];
    deptLoadStatus = 'error';
    console.error('Error loading departments:', err);
  }

  populateFilterDropdowns();
  populateAddModalDropdowns();
  populateEditModalDropdowns();
}

/**
 * Populate filter dropdowns on the toolbar
 */
function populateFilterDropdowns() {
  const studentFilter = document.getElementById('studentFilterSelect');
  const courseFilter = document.getElementById('courseFilterSelect');
  const deptFilter = document.getElementById('deptFilterSelect');

  if (studentFilter) {
    const currentVal = studentFilter.value;
    studentFilter.innerHTML = '<option value="">All Students</option>';
    availableStudents.forEach(s => {
      studentFilter.innerHTML += `<option value="${s.student_id}">${escapeHtml(formatStudentDisplayName(s))}</option>`;
    });
    if (currentVal) studentFilter.value = currentVal;
  }

  if (courseFilter) {
    const currentVal = courseFilter.value;
    courseFilter.innerHTML = '<option value="">All Courses</option>';
    availableCourses.forEach(c => {
      courseFilter.innerHTML += `<option value="${c.course_id}">${escapeHtml(formatCourseDisplayName(c))}</option>`;
    });
    if (currentVal) courseFilter.value = currentVal;
  }

  if (deptFilter) {
    const currentVal = deptFilter.value;
    deptFilter.innerHTML = '<option value="">All Departments</option>';
    availableDepartments.forEach(d => {
      deptFilter.innerHTML += `<option value="${d.department_id}">${escapeHtml(d.department_name)} (${escapeHtml(d.department_code)})</option>`;
    });
    if (currentVal) deptFilter.value = currentVal;
  }
}

/**
 * Populate student and course options in the Add Enrollment modal
 */
function populateAddModalDropdowns() {
  const addStudentSelect = document.getElementById('addEnrollStudent');
  const addCourseSelect = document.getElementById('addEnrollCourse');
  const addStudentNotice = document.getElementById('addStudentNotice');
  const addCourseNotice = document.getElementById('addCourseNotice');
  const submitAddBtn = document.getElementById('submitAddEnrollmentBtn');

  // Filter for active students
  const activeStudents = availableStudents.filter(s => 
    s.user_status === 'ACTIVE' || s.user_status === 1 || s.is_active === 1 || s.user_status === undefined || s.is_active === undefined
  );

  let disableSubmit = false;

  // Student Select
  if (addStudentSelect) {
    if (studentLoadStatus === 'error') {
      addStudentSelect.innerHTML = '<option value="">-- Unable to load students --</option>';
      if (addStudentNotice) {
        addStudentNotice.textContent = 'Unable to load students. Please refresh and try again.';
        addStudentNotice.style.color = 'var(--danger-600)';
        addStudentNotice.style.fontWeight = '600';
      }
      disableSubmit = true;
    } else if (studentLoadStatus === 'loading') {
      addStudentSelect.innerHTML = '<option value="">Loading students...</option>';
    } else if (activeStudents.length === 0) {
      addStudentSelect.innerHTML = '<option value="">-- No students available --</option>';
      if (addStudentNotice) {
        addStudentNotice.textContent = 'No registered students found. Register student profiles first.';
        addStudentNotice.style.color = 'var(--danger-600)';
        addStudentNotice.style.fontWeight = '600';
      }
      disableSubmit = true;
    } else {
      addStudentSelect.innerHTML = '<option value="">Select Student</option>';
      if (addStudentNotice) {
        addStudentNotice.textContent = 'Only active registered student profiles can be enrolled.';
        addStudentNotice.style.color = 'var(--slate-500)';
        addStudentNotice.style.fontWeight = 'normal';
      }
      activeStudents.forEach(s => {
        addStudentSelect.innerHTML += `<option value="${s.student_id}">${escapeHtml(formatStudentDisplayName(s))}</option>`;
      });
    }
  }

  // Course Select
  if (addCourseSelect) {
    if (courseLoadStatus === 'error') {
      addCourseSelect.innerHTML = '<option value="">-- Unable to load courses --</option>';
      if (addCourseNotice) {
        addCourseNotice.textContent = 'Unable to load courses. Please refresh and try again.';
        addCourseNotice.style.color = 'var(--danger-600)';
        addCourseNotice.style.fontWeight = '600';
      }
      disableSubmit = true;
    } else if (courseLoadStatus === 'loading') {
      addCourseSelect.innerHTML = '<option value="">Loading courses...</option>';
    } else if (availableCourses.length === 0) {
      addCourseSelect.innerHTML = '<option value="">-- No courses available --</option>';
      if (addCourseNotice) {
        addCourseNotice.textContent = 'No academic courses found. Register courses first.';
        addCourseNotice.style.color = 'var(--danger-600)';
        addCourseNotice.style.fontWeight = '600';
      }
      disableSubmit = true;
    } else {
      addCourseSelect.innerHTML = '<option value="">Select Course</option>';
      if (addCourseNotice) {
        addCourseNotice.textContent = 'Select the academic course for enrollment.';
        addCourseNotice.style.color = 'var(--slate-500)';
        addCourseNotice.style.fontWeight = 'normal';
      }
      availableCourses.forEach(c => {
        addCourseSelect.innerHTML += `<option value="${c.course_id}">${escapeHtml(formatCourseDisplayName(c))}</option>`;
      });
    }
  }

  if (submitAddBtn) {
    submitAddBtn.disabled = disableSubmit;
  }

  // Auto-fill semester when a course is chosen
  if (addCourseSelect && !addCourseSelect.dataset.hasChangeListener) {
    addCourseSelect.dataset.hasChangeListener = 'true';
    addCourseSelect.addEventListener('change', (e) => {
      const selectedId = parseInt(e.target.value, 10);
      const course = availableCourses.find(c => c.course_id === selectedId);
      if (course) {
        const semSelect = document.getElementById('addEnrollSemester');
        if (semSelect && course.semester) {
          semSelect.value = String(course.semester);
        }
        const yearInput = document.getElementById('addEnrollYear');
        if (yearInput && course.academic_year) {
          yearInput.value = course.academic_year;
        }
      }
    });
  }
}

/**
 * Populate student and course options in the Edit Enrollment modal
 */
function populateEditModalDropdowns() {
  const editStudentSelect = document.getElementById('editEnrollStudent');
  const editCourseSelect = document.getElementById('editEnrollCourse');

  if (editStudentSelect) {
    const currentVal = editStudentSelect.value;
    editStudentSelect.innerHTML = '<option value="">Select Student</option>';
    availableStudents.forEach(s => {
      editStudentSelect.innerHTML += `<option value="${s.student_id}">${escapeHtml(formatStudentDisplayName(s))}</option>`;
    });
    if (currentVal) editStudentSelect.value = currentVal;
  }

  if (editCourseSelect) {
    const currentVal = editCourseSelect.value;
    editCourseSelect.innerHTML = '<option value="">Select Course</option>';
    availableCourses.forEach(c => {
      editCourseSelect.innerHTML += `<option value="${c.course_id}">${escapeHtml(formatCourseDisplayName(c))}</option>`;
    });
    if (currentVal) editCourseSelect.value = currentVal;
  }
}

/**
 * Toolbar Filters & Search
 */
function initToolbarFilters() {
  const searchInput = document.getElementById('enrollmentSearchInput');
  const studentSelect = document.getElementById('studentFilterSelect');
  const courseSelect = document.getElementById('courseFilterSelect');
  const deptSelect = document.getElementById('deptFilterSelect');
  const yearSelect = document.getElementById('yearFilterSelect');
  const semSelect = document.getElementById('semFilterSelect');
  const statusSelect = document.getElementById('statusFilterSelect');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const openAddBtn = document.getElementById('openAddEnrollmentBtn');

  // Search with debounce
  let debounceTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        searchQuery = e.target.value.trim();
        currentPage = 1;
        loadEnrollments();
      }, 300);
    });
  }

  // Student filter
  if (studentSelect) {
    studentSelect.addEventListener('change', (e) => {
      selectedStudent = e.target.value;
      currentPage = 1;
      loadEnrollments();
    });
  }

  // Course filter
  if (courseSelect) {
    courseSelect.addEventListener('change', (e) => {
      selectedCourse = e.target.value;
      currentPage = 1;
      loadEnrollments();
    });
  }

  // Department filter
  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      selectedDept = e.target.value;
      currentPage = 1;
      loadEnrollments();
    });
  }

  // Academic Year filter
  if (yearSelect) {
    yearSelect.addEventListener('change', (e) => {
      selectedYear = e.target.value;
      currentPage = 1;
      loadEnrollments();
    });
  }

  // Semester filter
  if (semSelect) {
    semSelect.addEventListener('change', (e) => {
      selectedSem = e.target.value;
      currentPage = 1;
      loadEnrollments();
    });
  }

  // Status filter
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      selectedStatus = e.target.value;
      currentPage = 1;
      loadEnrollments();
    });
  }

  // Refresh
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadReferenceData();
      loadEnrollments();
    });
  }

  // Open Add Modal
  if (openAddBtn) {
    openAddBtn.addEventListener('click', () => {
      const form = document.getElementById('addEnrollmentForm');
      if (form) form.reset();
      hideModalAlert('addModalAlert');

      // Set default enrolled on date to today
      const dateInput = document.getElementById('addEnrollDate');
      if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
      }

      const yearInput = document.getElementById('addEnrollYear');
      if (yearInput && !yearInput.value) {
        yearInput.value = '2025-2026';
      }

      populateAddModalDropdowns();
      openModal('addEnrollmentModal');
    });
  }

  // Pagination controls
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadEnrollments();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentPage++;
      loadEnrollments();
    });
  }
}

/**
 * Fetch and render enrollments from backend
 */
async function loadEnrollments() {
  const tableBody = document.getElementById('enrollmentsTableBody');
  const emptyState = document.getElementById('enrollmentsTableEmpty');
  const paginationInfo = document.getElementById('paginationInfo');
  const pageIndicator = document.getElementById('pageIndicator');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 36px; color: var(--slate-500);">
          <div style="display: inline-flex; align-items: center; gap: 8px;">
            <svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="2" x2="12" y2="6"></line>
              <line x1="12" y1="18" x2="12" y2="22"></line>
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
              <line x1="2" y1="12" x2="6" y2="12"></line>
              <line x1="18" y1="12" x2="22" y2="12"></line>
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
            </svg>
            <span>Loading enrollments...</span>
          </div>
        </td>
      </tr>
    `;
  }

  try {
    const params = new URLSearchParams();
    params.set('page', currentPage);
    params.set('limit', pageSize);

    if (searchQuery) params.set('search', searchQuery);
    if (selectedStudent) params.set('student_id', selectedStudent);
    if (selectedCourse) params.set('course_id', selectedCourse);
    if (selectedDept) params.set('department_id', selectedDept);
    if (selectedYear) params.set('academic_year', selectedYear);
    if (selectedSem) params.set('semester', selectedSem);
    if (selectedStatus) params.set('status', selectedStatus);

    const res = await apiRequest(`/enrollments?${params.toString()}`);

    if (!res.ok || !res.data || !res.data.success) {
      if (tableBody) tableBody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (paginationInfo) paginationInfo.textContent = 'Showing 0 to 0 of 0 enrollments';
      return;
    }

    const payload = res.data && res.data.data ? res.data.data : (res.data || {});
    const enrollments = payload.enrollments || [];
    const pagination = payload.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };
    cachedEnrollments = enrollments;

    if (!enrollments || enrollments.length === 0) {
      if (tableBody) tableBody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (paginationInfo) paginationInfo.textContent = 'Showing 0 to 0 of 0 enrollments';
      if (pageIndicator) pageIndicator.textContent = `Page ${pagination.page || 1} of ${pagination.totalPages || 1}`;
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Render Table Rows
    tableBody.innerHTML = enrollments.map(e => {
      const studentName = `${e.first_name || ''} ${e.last_name || ''}`.trim() || e.enrollment_number || `Student #${e.student_id}`;
      const studentInitial = (e.first_name ? e.first_name[0] : 'S').toUpperCase();
      const prn = e.enrollment_number || '-';
      const courseCode = e.course_code || '-';
      const courseName = e.course_name || '-';
      const dept = e.department_name ? `${e.department_name} (${e.department_code})` : (e.department_code || '-');
      const enrolledDate = formatDate(e.enrollment_date);

      // Status pill badge
      let statusBadge = '';
      if (e.status === 'Enrolled') {
        statusBadge = '<span class="status-pill status-active">Enrolled</span>';
      } else if (e.status === 'Completed') {
        statusBadge = '<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:600;">Completed</span>';
      } else if (e.status === 'Dropped') {
        statusBadge = '<span class="status-pill status-inactive">Dropped</span>';
      } else {
        statusBadge = `<span class="status-pill">${escapeHtml(e.status)}</span>`;
      }

      return `
        <tr>
          <td>
            <div class="user-cell">
              <div class="user-cell-avatar" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">
                ${escapeHtml(studentInitial)}
              </div>
              <div class="user-cell-info">
                <span class="user-cell-name">${escapeHtml(studentName)}</span>
                <span class="user-cell-email" style="font-family: monospace;">PRN: ${escapeHtml(prn)}</span>
              </div>
            </div>
          </td>
          <td><span style="font-family: monospace; font-weight: 600; color: var(--slate-700);">${escapeHtml(prn)}</span></td>
          <td><span class="badge badge-info" style="font-family: monospace; font-weight: 700;">${escapeHtml(courseCode)}</span></td>
          <td style="font-weight: 500; color: var(--slate-800); max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(courseName)}">${escapeHtml(courseName)}</td>
          <td><span style="font-size: 12px; color: var(--slate-600);">${escapeHtml(dept)}</span></td>
          <td><span style="font-size: 13px; font-weight: 500;">${escapeHtml(e.academic_year)}</span></td>
          <td><span class="badge" style="background: #f1f5f9; color: var(--slate-700); font-weight: 600;">Sem ${e.semester}</span></td>
          <td><span style="font-size: 12px; color: var(--slate-600);">${enrolledDate}</span></td>
          <td>${statusBadge}</td>
          <td style="text-align: right; padding-right: 20px;">
            <div class="actions-cell" style="justify-content: flex-end;">
              <button 
                type="button" 
                class="action-btn action-view" 
                title="View Details"
                onclick="openViewModal(${e.enrollment_id})"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button 
                type="button" 
                class="action-btn action-edit" 
                title="Edit Enrollment"
                onclick="openEditModal(${e.enrollment_id})"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button 
                type="button" 
                class="action-btn action-toggle" 
                title="Change Status"
                onclick="openStatusModal(${e.enrollment_id})"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                </svg>
              </button>
              <button 
                type="button" 
                class="action-btn action-delete" 
                title="Delete Enrollment"
                onclick="openDeleteModal(${e.enrollment_id})"
              >
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

    // Pagination info
    const startRecord = (pagination.page - 1) * pagination.limit + 1;
    const endRecord = Math.min(pagination.page * pagination.limit, pagination.total);
    if (paginationInfo) {
      paginationInfo.textContent = `Showing ${startRecord} to ${endRecord} of ${pagination.total} enrollments`;
    }
    if (pageIndicator) {
      pageIndicator.textContent = `Page ${pagination.page} of ${pagination.totalPages || 1}`;
    }

    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= pagination.totalPages;

  } catch (err) {
    console.error('Error loading enrollments:', err);
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 24px; color: var(--danger-600);">
            Failed to load enrollments. Please try again.
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Open View Enrollment Modal
 */
async function openViewModal(enrollmentId) {
  try {
    const res = await apiRequest(`/enrollments/${enrollmentId}`);
    const e = res.data?.data?.enrollment || res.data?.enrollment;
    if (!res.ok || !e) {
      showToast('Failed to load enrollment details', 'error');
      return;
    }

    const studentName = `${e.first_name || ''} ${e.last_name || ''}`.trim() || e.enrollment_number;
    const prn = e.enrollment_number || '-';

    document.getElementById('viewStudentName').textContent = studentName;
    document.getElementById('viewStudentPRN').textContent = `PRN: ${prn}`;

    const statusBadge = document.getElementById('viewEnrollStatus');
    if (statusBadge) {
      statusBadge.textContent = e.status;
      if (e.status === 'Enrolled') {
        statusBadge.className = 'status-pill status-active';
      } else if (e.status === 'Completed') {
        statusBadge.className = 'badge';
        statusBadge.style = 'background: #e0f2fe; color: #0369a1; font-weight: 600;';
      } else {
        statusBadge.className = 'status-pill status-inactive';
      }
    }

    document.getElementById('viewEnrollIdVal').textContent = `#${e.enrollment_id}`;
    document.getElementById('viewStudentVal').textContent = `${studentName} (ID: ${e.student_id})`;
    document.getElementById('viewPRNVal').textContent = prn;
    document.getElementById('viewDeptVal').textContent = e.department_name ? `${e.department_name} (${e.department_code})` : (e.department_code || '-');
    document.getElementById('viewCourseCodeVal').textContent = e.course_code || '-';
    document.getElementById('viewCourseNameVal').textContent = e.course_name || '-';
    document.getElementById('viewCourseTypeVal').textContent = e.course_type || '-';
    document.getElementById('viewCreditsVal').textContent = e.credits !== null && e.credits !== undefined ? `${parseFloat(e.credits).toFixed(1)} Credits` : '-';
    document.getElementById('viewAcademicYearVal').textContent = e.academic_year || '-';
    document.getElementById('viewSemesterVal').textContent = `Semester ${e.semester}`;
    document.getElementById('viewEnrolledOnVal').textContent = formatDate(e.enrollment_date);
    document.getElementById('viewCreatedVal').textContent = formatDateTime(e.created_at);
    document.getElementById('viewUpdatedVal').textContent = formatDateTime(e.updated_at);

    // Linked academic records counters
    document.getElementById('viewAttendanceCount').textContent = e.attendance_count !== undefined ? e.attendance_count : '0';
    document.getElementById('viewGradesCount').textContent = e.grades_count !== undefined ? e.grades_count : '0';

    openModal('viewEnrollmentModal');
  } catch (err) {
    console.error('Error viewing enrollment:', err);
    showToast('Failed to load enrollment details', 'error');
  }
}

/**
 * Open Edit Enrollment Modal
 */
async function openEditModal(enrollmentId) {
  try {
    const res = await apiRequest(`/enrollments/${enrollmentId}`);
    const e = res.data?.data?.enrollment || res.data?.enrollment;
    if (!res.ok || !e) {
      showToast('Failed to load enrollment for editing', 'error');
      return;
    }

    populateEditModalDropdowns();
    document.getElementById('editEnrollmentId').value = e.enrollment_id;
    document.getElementById('editEnrollStudent').value = e.student_id;
    document.getElementById('editEnrollCourse').value = e.course_id;
    document.getElementById('editEnrollYear').value = e.academic_year;
    document.getElementById('editEnrollSemester').value = e.semester;

    // Convert date to YYYY-MM-DD for input[type="date"]
    let dateStr = '';
    if (e.enrollment_date) {
      const d = new Date(e.enrollment_date);
      dateStr = d.toISOString().split('T')[0];
    }
    document.getElementById('editEnrollDate').value = dateStr;
    document.getElementById('editEnrollStatus').value = e.status;

    hideModalAlert('editModalAlert');
    openModal('editEnrollmentModal');
  } catch (err) {
    console.error('Error loading enrollment for edit:', err);
    showToast('Failed to load enrollment data', 'error');
  }
}

/**
 * Open Quick Status Change Modal
 */
function openStatusModal(enrollmentId) {
  const enrollment = cachedEnrollments.find(e => e.enrollment_id === enrollmentId);
  if (!enrollment) return;

  const promptEl = document.getElementById('statusModalPrompt');
  const studentName = `${enrollment.first_name || ''} ${enrollment.last_name || ''}`.trim() || enrollment.enrollment_number;
  
  if (promptEl) {
    promptEl.innerHTML = `Change status for <strong>${escapeHtml(studentName)}</strong> in course <strong>${escapeHtml(enrollment.course_code)}</strong>:`;
  }

  document.getElementById('statusEnrollmentId').value = enrollmentId;
  document.getElementById('changeStatusSelect').value = enrollment.status;

  openModal('statusModal');
}

/**
 * Open Delete Confirmation Modal
 */
function openDeleteModal(enrollmentId) {
  const enrollment = cachedEnrollments.find(e => e.enrollment_id === enrollmentId);
  if (!enrollment) return;

  const studentName = `${enrollment.first_name || ''} ${enrollment.last_name || ''}`.trim() || enrollment.enrollment_number;
  const courseCode = enrollment.course_code;

  const confirmMsg = document.getElementById('confirmModalMessage');
  if (confirmMsg) {
    confirmMsg.innerHTML = `
      Are you sure you want to delete the enrollment of <strong>${escapeHtml(studentName)}</strong> in <strong>${escapeHtml(courseCode)}</strong> (${escapeHtml(enrollment.academic_year)}, Sem ${enrollment.semester})?<br><br>
      <span style="font-size: 12px; color: var(--slate-500);">
        Note: If this student has active attendance sessions or grade marks in this course, deletion will be blocked to maintain academic integrity.
      </span>
    `;
  }

  pendingConfirmAction = async () => {
    try {
      const res = await apiRequest(`/enrollments/${enrollmentId}`, { method: 'DELETE' });

      if (res.ok && res.data && res.data.success) {
        closeModal('confirmModal');
        showToast('Enrollment deleted successfully', 'success');
        await loadEnrollments();
      } else {
        closeModal('confirmModal');
        const errorMsg = res.data?.message || 'Cannot delete enrollment.';
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      closeModal('confirmModal');
      showToast('A network error occurred while deleting enrollment.', 'error');
    }
  };

  openModal('confirmModal');
}

/**
 * Setup Add, Edit, and Status Form Submissions
 */
function initFormSubmissions() {
  // 1. Add Enrollment Form
  const addForm = document.getElementById('addEnrollmentForm');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideModalAlert('addModalAlert');

      const studentId = document.getElementById('addEnrollStudent').value;
      const courseId = document.getElementById('addEnrollCourse').value;
      const academicYear = document.getElementById('addEnrollYear').value.trim();
      const semester = parseInt(document.getElementById('addEnrollSemester').value, 10);
      const enrollmentDate = document.getElementById('addEnrollDate').value;
      const status = document.getElementById('addEnrollStatus').value;

      if (!studentId) {
        showModalAlert('addModalAlert', 'Please select a student.');
        return;
      }

      if (!courseId) {
        showModalAlert('addModalAlert', 'Please select a course.');
        return;
      }

      if (!academicYear) {
        showModalAlert('addModalAlert', 'Academic year is required (e.g. 2025-2026).');
        return;
      }

      if (isNaN(semester) || semester < 1 || semester > 12) {
        showModalAlert('addModalAlert', 'Semester must be between 1 and 12.');
        return;
      }

      if (!enrollmentDate) {
        showModalAlert('addModalAlert', 'Enrollment date is required.');
        return;
      }

      const submitBtn = document.getElementById('submitAddEnrollmentBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enrolling...';
      }

      try {
        const payload = {
          student_id: parseInt(studentId, 10),
          course_id: parseInt(courseId, 10),
          academic_year: academicYear,
          semester,
          enrollment_date: enrollmentDate,
          status
        };

        const res = await apiRequest('/enrollments', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('addEnrollmentModal');
          showToast('Student enrolled successfully', 'success');
          await loadEnrollments();
        } else {
          showModalAlert('addModalAlert', res.data?.message || 'Failed to create enrollment.');
        }
      } catch (err) {
        showModalAlert('addModalAlert', 'A network error occurred. Please try again.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Enroll Student';
        }
      }
    });
  }

  // 2. Edit Enrollment Form
  const editForm = document.getElementById('editEnrollmentForm');
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideModalAlert('editModalAlert');

      const enrollmentId = document.getElementById('editEnrollmentId').value;
      const studentId = document.getElementById('editEnrollStudent').value;
      const courseId = document.getElementById('editEnrollCourse').value;
      const academicYear = document.getElementById('editEnrollYear').value.trim();
      const semester = parseInt(document.getElementById('editEnrollSemester').value, 10);
      const enrollmentDate = document.getElementById('editEnrollDate').value;
      const status = document.getElementById('editEnrollStatus').value;

      if (!studentId || !courseId) {
        showModalAlert('editModalAlert', 'Student and course are required.');
        return;
      }

      if (!academicYear) {
        showModalAlert('editModalAlert', 'Academic year is required.');
        return;
      }

      if (isNaN(semester) || semester < 1 || semester > 12) {
        showModalAlert('editModalAlert', 'Semester must be between 1 and 12.');
        return;
      }

      const submitBtn = document.getElementById('submitEditEnrollmentBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      try {
        const payload = {
          student_id: parseInt(studentId, 10),
          course_id: parseInt(courseId, 10),
          academic_year: academicYear,
          semester,
          enrollment_date: enrollmentDate,
          status
        };

        const res = await apiRequest(`/enrollments/${enrollmentId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('editEnrollmentModal');
          showToast('Enrollment updated successfully', 'success');
          await loadEnrollments();
        } else {
          showModalAlert('editModalAlert', res.data?.message || 'Failed to update enrollment.');
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

  // 3. Quick Status Form
  const statusForm = document.getElementById('statusForm');
  if (statusForm) {
    statusForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const enrollmentId = document.getElementById('statusEnrollmentId').value;
      const status = document.getElementById('changeStatusSelect').value;

      const submitBtn = document.getElementById('submitStatusBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';
      }

      try {
        const res = await apiRequest(`/enrollments/${enrollmentId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status })
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('statusModal');
          showToast(`Status updated to ${status}`, 'success');
          await loadEnrollments();
        } else {
          showToast(res.data?.message || 'Failed to update status', 'error');
        }
      } catch (err) {
        showToast('A network error occurred while updating status.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Update Status';
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

/**
 * Format Date YYYY-MM-DD to locale string
 */
function formatDate(dateVal) {
  if (!dateVal) return '-';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format DateTime to locale string
 */
function formatDateTime(dateVal) {
  if (!dateVal) return '-';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
