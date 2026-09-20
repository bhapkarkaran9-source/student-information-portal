/**
 * Admin Timetable Management Controller
 * Student Information Portal
 */

// State Management
let currentPage = 1;
const pageSize = 10;
let searchQuery = '';
let selectedDay = '';
let selectedDept = '';
let selectedCourse = '';
let selectedTeacher = '';
let selectedYear = '';
let selectedSem = '';
let selectedClass = '';

let availableCourses = [];
let availableTeachers = [];
let availableDepartments = [];
let cachedTimetable = [];
let todayLectures = [];
let activeAdmin = null;

let courseLoadStatus = 'idle';
let teacherLoadStatus = 'idle';
let deptLoadStatus = 'idle';

// Modal Action Callback
let pendingConfirmAction = null;

// Timer interval for clock and lecture reminders
let clockIntervalId = null;

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

  // 4. Start local clock ticker
  startLocalClock();

  // 5. Load Reference Data, Timetable, and Today's Schedule
  await loadReferenceData();
  await loadTimetable();
  await loadTodayAndNextLecture();
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
    if (clockIntervalId) clearInterval(clockIntervalId);
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
 * Real-time local clock and lecture reminder foundation ticker
 */
function startLocalClock() {
  const updateTicker = () => {
    const clockEl = document.getElementById('localClockTicker');
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    }
    // Update reminder logic periodically
    updateNextLectureReminder(now);
  };

  updateTicker();
  clockIntervalId = setInterval(updateTicker, 1000);
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
 * Format Teacher Display Text: "Employee ID - First Name Last Name" or "First Name Last Name"
 * E.g. "EMP-IT-101 - Rohini Rankhamb"
 */
function formatTeacherDisplayName(t) {
  if (!t) return '';
  const empId = (t.employee_number || t.employee_id || '').toString().trim();
  const name = `${t.first_name || ''} ${t.last_name || ''}`.trim() || t.username || (t.teacher_id ? `Teacher #${t.teacher_id}` : '');
  return empId ? `${empId} - ${name}` : name;
}

/**
 * Load reference data: Courses, Teachers, and Departments
 */
async function loadReferenceData() {
  courseLoadStatus = 'loading';
  teacherLoadStatus = 'loading';
  deptLoadStatus = 'loading';

  try {
    // 1. Courses from live database
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
    // 2. Teachers from live database
    const teacherRes = await apiRequest('/teachers?limit=100');
    if (teacherRes.ok && (teacherRes.data?.success || teacherRes.status === 200)) {
      const list = teacherRes.data?.data?.teachers || teacherRes.data?.teachers || (Array.isArray(teacherRes.data?.data) ? teacherRes.data.data : []);
      availableTeachers = Array.isArray(list) ? list : [];
      // Sort teachers by employee_number or name ascending
      availableTeachers.sort((a, b) => {
        const empA = (a.employee_number || a.employee_id || '').toString().trim().toLowerCase();
        const empB = (b.employee_number || b.employee_id || '').toString().trim().toLowerCase();
        if (empA && empB) return empA.localeCompare(empB);
        const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
        const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });
      teacherLoadStatus = 'success';
    } else {
      availableTeachers = [];
      teacherLoadStatus = 'error';
      console.error('Failed to load teachers:', teacherRes);
    }
  } catch (err) {
    availableTeachers = [];
    teacherLoadStatus = 'error';
    console.error('Error loading teachers:', err);
  }

  try {
    // 3. Departments from live database
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
  const deptFilter = document.getElementById('deptFilterSelect');
  const courseFilter = document.getElementById('courseFilterSelect');
  const teacherFilter = document.getElementById('teacherFilterSelect');

  if (deptFilter) {
    const cur = deptFilter.value;
    deptFilter.innerHTML = '<option value="">All Departments</option>';
    availableDepartments.forEach(d => {
      deptFilter.innerHTML += `<option value="${d.department_id}">${escapeHtml(d.department_name)} (${escapeHtml(d.department_code)})</option>`;
    });
    if (cur) deptFilter.value = cur;
  }

  if (courseFilter) {
    const cur = courseFilter.value;
    courseFilter.innerHTML = '<option value="">All Courses</option>';
    availableCourses.forEach(c => {
      courseFilter.innerHTML += `<option value="${c.course_id}">${escapeHtml(formatCourseDisplayName(c))}</option>`;
    });
    if (cur) courseFilter.value = cur;
  }

  if (teacherFilter) {
    const cur = teacherFilter.value;
    teacherFilter.innerHTML = '<option value="">All Teachers</option>';
    availableTeachers.forEach(t => {
      teacherFilter.innerHTML += `<option value="${t.teacher_id}">${escapeHtml(formatTeacherDisplayName(t))}</option>`;
    });
    if (cur) teacherFilter.value = cur;
  }
}

/**
 * Populate course and teacher options in the Add Timetable modal
 */
function populateAddModalDropdowns() {
  const addCourseSelect = document.getElementById('addCourseSelect');
  const addTeacherSelect = document.getElementById('addTeacherSelect');
  const addCourseNotice = document.getElementById('addCourseNotice');
  const addTeacherNotice = document.getElementById('addTeacherNotice');
  const submitAddBtn = document.getElementById('submitAddTimetableBtn');

  // Filter active teachers
  const activeTeachers = availableTeachers.filter(t => 
    t.is_active === 1 || t.is_active === true || t.is_active === undefined || t.status === 'ACTIVE' || t.status === 1
  );

  let disableSubmit = false;

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
        addCourseNotice.textContent = 'No courses available. Register courses first.';
        addCourseNotice.style.color = 'var(--danger-600)';
        addCourseNotice.style.fontWeight = '600';
      }
      disableSubmit = true;
    } else {
      addCourseSelect.innerHTML = '<option value="">Select Course</option>';
      if (addCourseNotice) {
        addCourseNotice.textContent = 'Select the academic course for this lecture.';
        addCourseNotice.style.color = 'var(--slate-500)';
        addCourseNotice.style.fontWeight = 'normal';
      }
      availableCourses.forEach(c => {
        addCourseSelect.innerHTML += `<option value="${c.course_id}">${escapeHtml(formatCourseDisplayName(c))}</option>`;
      });
    }
  }

  // Teacher Select
  if (addTeacherSelect) {
    if (teacherLoadStatus === 'error') {
      addTeacherSelect.innerHTML = '<option value="">-- Unable to load teachers --</option>';
      if (addTeacherNotice) {
        addTeacherNotice.textContent = 'Unable to load teachers. Please refresh and try again.';
        addTeacherNotice.style.color = 'var(--danger-600)';
        addTeacherNotice.style.fontWeight = '600';
      }
      disableSubmit = true;
    } else if (teacherLoadStatus === 'loading') {
      addTeacherSelect.innerHTML = '<option value="">Loading teachers...</option>';
    } else if (activeTeachers.length === 0) {
      addTeacherSelect.innerHTML = '<option value="">-- No teachers available --</option>';
      if (addTeacherNotice) {
        addTeacherNotice.textContent = 'No teachers available. Register teachers first.';
        addTeacherNotice.style.color = 'var(--danger-600)';
        addTeacherNotice.style.fontWeight = '600';
      }
      disableSubmit = true;
    } else {
      addTeacherSelect.innerHTML = '<option value="">Select Teacher</option>';
      if (addTeacherNotice) {
        addTeacherNotice.textContent = 'Only active teacher accounts can be assigned.';
        addTeacherNotice.style.color = 'var(--slate-500)';
        addTeacherNotice.style.fontWeight = 'normal';
      }
      activeTeachers.forEach(t => {
        addTeacherSelect.innerHTML += `<option value="${t.teacher_id}">${escapeHtml(formatTeacherDisplayName(t))}</option>`;
      });
    }
  }

  if (submitAddBtn) {
    submitAddBtn.disabled = disableSubmit;
  }

  // Auto-fill semester and academic year when course is chosen
  if (addCourseSelect && !addCourseSelect.dataset.hasChangeListener) {
    addCourseSelect.dataset.hasChangeListener = 'true';
    addCourseSelect.addEventListener('change', (e) => {
      const selectedId = parseInt(e.target.value, 10);
      const course = availableCourses.find(c => c.course_id === selectedId);
      if (course) {
        const semSelect = document.getElementById('addSemester');
        if (semSelect && course.semester) {
          semSelect.value = String(course.semester);
        }
        const yearInput = document.getElementById('addAcademicYear');
        if (yearInput && course.academic_year) {
          yearInput.value = course.academic_year;
        }
      }
    });
  }
}

/**
 * Populate course and teacher options in the Edit Timetable modal
 */
function populateEditModalDropdowns() {
  const editCourseSelect = document.getElementById('editCourseSelect');
  const editTeacherSelect = document.getElementById('editTeacherSelect');

  if (editCourseSelect) {
    const cur = editCourseSelect.value;
    editCourseSelect.innerHTML = '<option value="">Select Course</option>';
    availableCourses.forEach(c => {
      editCourseSelect.innerHTML += `<option value="${c.course_id}">${escapeHtml(formatCourseDisplayName(c))}</option>`;
    });
    if (cur) editCourseSelect.value = cur;
  }

  if (editTeacherSelect) {
    const cur = editTeacherSelect.value;
    editTeacherSelect.innerHTML = '<option value="">Select Teacher</option>';
    availableTeachers.forEach(t => {
      editTeacherSelect.innerHTML += `<option value="${t.teacher_id}">${escapeHtml(formatTeacherDisplayName(t))}</option>`;
    });
    if (cur) editTeacherSelect.value = cur;
  }
}

/**
 * Toolbar Filters & Search bindings
 */
function initToolbarFilters() {
  const searchInput = document.getElementById('timetableSearchInput');
  const daySelect = document.getElementById('dayFilterSelect');
  const deptSelect = document.getElementById('deptFilterSelect');
  const courseSelect = document.getElementById('courseFilterSelect');
  const teacherSelect = document.getElementById('teacherFilterSelect');
  const yearSelect = document.getElementById('yearFilterSelect');
  const semSelect = document.getElementById('semFilterSelect');
  const classInput = document.getElementById('classFilterInput');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const openAddBtn = document.getElementById('openAddTimetableBtn');

  // Search with debounce
  let debounceTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        searchQuery = e.target.value.trim();
        currentPage = 1;
        loadTimetable();
      }, 300);
    });
  }

  // Day filter
  if (daySelect) {
    daySelect.addEventListener('change', (e) => {
      selectedDay = e.target.value;
      currentPage = 1;
      loadTimetable();
    });
  }

  // Dept filter
  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      selectedDept = e.target.value;
      currentPage = 1;
      loadTimetable();
    });
  }

  // Course filter
  if (courseSelect) {
    courseSelect.addEventListener('change', (e) => {
      selectedCourse = e.target.value;
      currentPage = 1;
      loadTimetable();
    });
  }

  // Teacher filter
  if (teacherSelect) {
    teacherSelect.addEventListener('change', (e) => {
      selectedTeacher = e.target.value;
      currentPage = 1;
      loadTimetable();
    });
  }

  // Academic Year filter
  if (yearSelect) {
    yearSelect.addEventListener('change', (e) => {
      selectedYear = e.target.value;
      currentPage = 1;
      loadTimetable();
    });
  }

  // Semester filter
  if (semSelect) {
    semSelect.addEventListener('change', (e) => {
      selectedSem = e.target.value;
      currentPage = 1;
      loadTimetable();
    });
  }

  // Class input filter with debounce
  if (classInput) {
    classInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        selectedClass = e.target.value.trim();
        currentPage = 1;
        loadTimetable();
      }, 300);
    });
  }

  // Refresh
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadReferenceData();
      loadTimetable();
      loadTodayAndNextLecture();
    });
  }

  // Open Add Modal
  if (openAddBtn) {
    openAddBtn.addEventListener('click', () => {
      const form = document.getElementById('addTimetableForm');
      if (form) form.reset();
      hideModalAlert('addModalAlert');

      // Default academic year
      const yearInput = document.getElementById('addAcademicYear');
      if (yearInput && !yearInput.value) {
        yearInput.value = '2025-2026';
      }

      // Default start/end time
      const startInput = document.getElementById('addStartTime');
      const endInput = document.getElementById('addEndTime');
      if (startInput && !startInput.value) startInput.value = '09:00';
      if (endInput && !endInput.value) endInput.value = '10:00';

      populateAddModalDropdowns();
      openModal('addTimetableModal');
    });
  }

  // Pagination controls
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadTimetable();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentPage++;
      loadTimetable();
    });
  }
}

/**
 * Fetch and render timetable list from backend
 */
async function loadTimetable() {
  const tableBody = document.getElementById('timetableTableBody');
  const emptyState = document.getElementById('timetableTableEmpty');
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
            <span>Loading timetable...</span>
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
    if (selectedDay) params.set('day_of_week', selectedDay);
    if (selectedCourse) params.set('course_id', selectedCourse);
    if (selectedTeacher) params.set('teacher_id', selectedTeacher);
    if (selectedDept) params.set('department_id', selectedDept);
    if (selectedYear) params.set('academic_year', selectedYear);
    if (selectedSem) params.set('semester', selectedSem);
    if (selectedClass) params.set('class_name', selectedClass);

    const res = await apiRequest(`/timetable?${params.toString()}`);

    if (!res.ok || !res.data || !res.data.success) {
      if (tableBody) tableBody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (paginationInfo) paginationInfo.textContent = 'Showing 0 to 0 of 0 entries';
      return;
    }

    const payload = res.data && res.data.data ? res.data.data : (res.data || {});
    const timetable = payload.timetable || [];
    const pagination = payload.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };
    cachedTimetable = timetable;

    if (!timetable || timetable.length === 0) {
      if (tableBody) tableBody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (paginationInfo) paginationInfo.textContent = 'Showing 0 to 0 of 0 entries';
      if (pageIndicator) pageIndicator.textContent = `Page ${pagination.page || 1} of ${pagination.totalPages || 1}`;
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Render Table Rows
    tableBody.innerHTML = timetable.map(t => {
      const timeSlot = `${formatTime(t.start_time)} - ${formatTime(t.end_time)}`;
      const dayBadge = getDayBadgeHtml(t.day_of_week);
      const courseCode = t.course_code || '-';
      const courseName = t.course_name || '-';
      const teacherName = t.teacher_name || `Teacher #${t.teacher_id}`;
      const empNo = t.teacher_employee_number || '-';
      const dept = t.department_name ? `${t.department_name} (${t.department_code})` : (t.department_code || '-');
      const classDiv = `${t.class_name} - ${t.division}`;
      const room = t.room_no || '-';

      return `
        <tr>
          <td>${dayBadge}</td>
          <td><span style="font-family: monospace; font-weight: 700; color: var(--slate-800);">${timeSlot}</span></td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span class="badge badge-info" style="align-self: flex-start; font-family: monospace; font-weight: 700;">${escapeHtml(courseCode)}</span>
              <span style="font-weight: 600; color: var(--slate-900); font-size: 13px;">${escapeHtml(courseName)}</span>
            </div>
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-weight: 600; color: var(--slate-800);">${escapeHtml(teacherName)}</span>
              <span style="font-size: 11px; color: var(--slate-500); font-family: monospace;">EMP: ${escapeHtml(empNo)}</span>
            </div>
          </td>
          <td><span style="font-size: 12px; color: var(--slate-600);">${escapeHtml(dept)}</span></td>
          <td><span class="badge" style="background: #f1f5f9; color: var(--slate-700); font-weight: 600;">${escapeHtml(classDiv)}</span></td>
          <td><span class="badge" style="background: #ecfdf5; color: #065f46; font-weight: 600;">${escapeHtml(room)}</span></td>
          <td><span style="font-size: 12px; color: var(--slate-600);">${escapeHtml(t.academic_year)}</span></td>
          <td><span class="badge" style="background: #f8fafc; color: var(--slate-700); border: 1px solid var(--slate-200);">Sem ${t.semester}</span></td>
          <td style="text-align: right; padding-right: 20px;">
            <div class="actions-cell" style="justify-content: flex-end;">
              <button 
                type="button" 
                class="action-btn action-view" 
                title="View Details"
                onclick="openViewModal(${t.timetable_id})"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button 
                type="button" 
                class="action-btn action-edit" 
                title="Edit Timetable Entry"
                onclick="openEditModal(${t.timetable_id})"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button 
                type="button" 
                class="action-btn action-delete" 
                title="Delete Timetable Entry"
                onclick="openDeleteModal(${t.timetable_id})"
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
      paginationInfo.textContent = `Showing ${startRecord} to ${endRecord} of ${pagination.total} entries`;
    }
    if (pageIndicator) {
      pageIndicator.textContent = `Page ${pagination.page} of ${pagination.totalPages || 1}`;
    }

    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= pagination.totalPages;

  } catch (err) {
    console.error('Error loading timetable:', err);
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 24px; color: var(--danger-600);">
            Failed to load timetable. Please try again.
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Today's Timetable and Next Lecture calculation
 */
async function loadTodayAndNextLecture() {
  const now = new Date();
  const dayIndex = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDay = days[dayIndex];

  const todayDayEl = document.getElementById('todayDayName');
  if (todayDayEl) {
    todayDayEl.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  const listContainer = document.getElementById('todayLecturesList');
  const countBadge = document.getElementById('todayLectureCountBadge');

  if (currentDay === 'Sunday') {
    if (listContainer) {
      listContainer.innerHTML = `
        <p style="font-size: 13px; color: var(--slate-500); text-align: center; margin: auto; padding: 24px 0;">
          Sunday — Campus is closed. No lectures scheduled today.
        </p>
      `;
    }
    if (countBadge) countBadge.textContent = '0 Lectures';
    todayLectures = [];
    updateNextLectureReminder(now);
    return;
  }

  try {
    const res = await apiRequest(`/timetable?day_of_week=${currentDay}&all=true`);
    const list = res.data?.data?.timetable || res.data?.timetable || (Array.isArray(res.data?.data) ? res.data.data : []);
    todayLectures = Array.isArray(list) ? list : [];

    if (countBadge) {
      countBadge.textContent = `${todayLectures.length} Lecture${todayLectures.length === 1 ? '' : 's'}`;
    }

    if (!todayLectures || todayLectures.length === 0) {
      if (listContainer) {
        listContainer.innerHTML = `
          <p style="font-size: 13px; color: var(--slate-500); text-align: center; margin: auto; padding: 24px 0;">
            No lectures scheduled for today.
          </p>
        `;
      }
    } else {
      if (listContainer) {
        listContainer.innerHTML = todayLectures.map(l => {
          const timeSlot = `${formatTime(l.start_time)} - ${formatTime(l.end_time)}`;
          return `
            <div style="display: flex; align-items: center; justify-content: space-between; background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: 8px; padding: 10px 14px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span class="badge" style="background: #e0f2fe; color: #0369a1; font-family: monospace; font-weight: 700;">
                  ${timeSlot}
                </span>
                <div>
                  <div style="font-weight: 700; color: var(--slate-900); font-size: 13px;">${escapeHtml(l.course_name)} (${escapeHtml(l.course_code)})</div>
                  <div style="font-size: 11px; color: var(--slate-500);">${escapeHtml(l.teacher_name)} &bull; ${escapeHtml(l.class_name)}-${escapeHtml(l.division)}</div>
                </div>
              </div>
              <span class="badge" style="background: #ecfdf5; color: #065f46; font-weight: 600;">${escapeHtml(l.room_no)}</span>
            </div>
          `;
        }).join('');
      }
    }

    updateNextLectureReminder(now);

  } catch (err) {
    console.error('Error loading today timetable:', err);
  }
}

/**
 * Real-time calculation of the Next Lecture and Lecture Reminder Foundation
 */
function updateNextLectureReminder(nowDate) {
  const noNextMsg = document.getElementById('noNextLectureMsg');
  const detailsBox = document.getElementById('nextLectureDetails');
  const statusBadge = document.getElementById('nextLectureStatusBadge');
  const reminderBanner = document.getElementById('lectureReminderBanner');
  const reminderText = document.getElementById('lectureReminderText');

  if (!todayLectures || todayLectures.length === 0) {
    if (noNextMsg) noNextMsg.classList.remove('hidden');
    if (detailsBox) detailsBox.classList.add('hidden');
    if (reminderBanner) reminderBanner.classList.add('hidden');
    if (statusBadge) {
      statusBadge.textContent = 'None Today';
      statusBadge.style = 'background: var(--slate-100); color: var(--slate-600);';
    }
    return;
  }

  // Current time in seconds from midnight
  const nowSeconds = nowDate.getHours() * 3600 + nowDate.getMinutes() * 60 + nowDate.getSeconds();

  // Find the next upcoming or current lecture
  let activeLecture = null;
  let nextUpcoming = null;

  for (const l of todayLectures) {
    const startSec = parseTimeToSeconds(l.start_time);
    const endSec = parseTimeToSeconds(l.end_time);

    // If lecture is currently active
    if (nowSeconds >= startSec && nowSeconds < endSec) {
      activeLecture = l;
      break;
    }

    // If lecture is upcoming later today
    if (nowSeconds < startSec) {
      if (!nextUpcoming || startSec < parseTimeToSeconds(nextUpcoming.start_time)) {
        nextUpcoming = l;
      }
    }
  }

  const targetLecture = activeLecture || nextUpcoming;

  if (!targetLecture) {
    if (noNextMsg) noNextMsg.classList.remove('hidden');
    if (detailsBox) detailsBox.classList.add('hidden');
    if (reminderBanner) reminderBanner.classList.add('hidden');
    if (statusBadge) {
      statusBadge.textContent = 'Completed Today';
      statusBadge.style = 'background: var(--slate-100); color: var(--slate-600);';
    }
    return;
  }

  // Populate details
  if (noNextMsg) noNextMsg.classList.add('hidden');
  if (detailsBox) detailsBox.classList.remove('hidden');

  document.getElementById('nextCourseTitle').textContent = `${targetLecture.course_name} (${targetLecture.course_code})`;
  document.getElementById('nextTimeRange').textContent = `${formatTime(targetLecture.start_time)} - ${formatTime(targetLecture.end_time)}`;
  document.getElementById('nextTeacherName').textContent = targetLecture.teacher_name || '-';
  document.getElementById('nextClassDiv').textContent = `${targetLecture.class_name} - ${targetLecture.division}`;
  document.getElementById('nextRoomNo').textContent = targetLecture.room_no || '-';

  const startSec = parseTimeToSeconds(targetLecture.start_time);
  const endSec = parseTimeToSeconds(targetLecture.end_time);

  if (nowSeconds >= startSec && nowSeconds < endSec) {
    // Lecture In Progress
    const elapsedMin = Math.floor((nowSeconds - startSec) / 60);
    if (statusBadge) {
      statusBadge.textContent = 'In Progress';
      statusBadge.style = 'background: #dcfce7; color: #15803d; font-weight: 700;';
    }
    if (reminderBanner) {
      reminderBanner.classList.remove('hidden');
      reminderBanner.className = 'alert alert-info';
      reminderBanner.style.background = '#dbeafe';
      reminderBanner.style.color = '#1e40af';
      if (reminderText) {
        reminderText.textContent = `Lecture is in progress now (started ${elapsedMin} min ago). Room: ${targetLecture.room_no}.`;
      }
    }
  } else {
    // Upcoming Lecture
    const diffSec = startSec - nowSeconds;
    const diffMin = Math.ceil(diffSec / 60);

    if (statusBadge) {
      statusBadge.textContent = `Starts in ${diffMin} min`;
      statusBadge.style = 'background: #fef3c7; color: #b45309; font-weight: 700;';
    }

    if (diffMin <= 10) {
      // 10-minute lecture reminder foundation trigger
      if (reminderBanner) {
        reminderBanner.classList.remove('hidden');
        reminderBanner.className = 'alert alert-warning';
        reminderBanner.style.background = '#fef3c7';
        reminderBanner.style.color = '#92400e';
        if (reminderText) {
          reminderText.textContent = `Reminder: Lecture starts in ${diffMin} minute${diffMin === 1 ? '' : 's'} in ${targetLecture.room_no}!`;
        }
      }
    } else {
      if (reminderBanner) reminderBanner.classList.add('hidden');
    }
  }
}

/**
 * Open View Timetable Modal
 */
async function openViewModal(timetableId) {
  try {
    const res = await apiRequest(`/timetable/${timetableId}`);
    const t = res.data?.data?.timetable || res.data?.timetable;
    if (!res.ok || !t) {
      showToast('Failed to load timetable details', 'error');
      return;
    }

    document.getElementById('viewCourseName').textContent = t.course_name || '-';
    document.getElementById('viewCourseCode').textContent = t.course_code || '-';
    document.getElementById('viewDayBadge').textContent = t.day_of_week;
    document.getElementById('viewTimeRange').textContent = `${formatTime(t.start_time)} - ${formatTime(t.end_time)}`;

    document.getElementById('viewTimetableIdVal').textContent = `#${t.timetable_id}`;
    document.getElementById('viewTeacherVal').textContent = t.teacher_name || '-';
    document.getElementById('viewEmpNoVal').textContent = t.teacher_employee_number || '-';
    document.getElementById('viewDeptVal').textContent = t.department_name ? `${t.department_name} (${t.department_code})` : (t.department_code || '-');
    document.getElementById('viewClassDivVal').textContent = `${t.class_name} - ${t.division}`;
    document.getElementById('viewRoomVal').textContent = t.room_no || '-';
    document.getElementById('viewYearVal').textContent = t.academic_year || '-';
    document.getElementById('viewSemesterVal').textContent = `Semester ${t.semester}`;
    document.getElementById('viewCreditsVal').textContent = t.credits !== null && t.credits !== undefined ? `${parseFloat(t.credits).toFixed(1)} Credits (${t.course_type || 'Theory'})` : '-';
    document.getElementById('viewCreatedVal').textContent = formatDateTime(t.created_at);

    openModal('viewTimetableModal');
  } catch (err) {
    console.error('Error viewing timetable:', err);
    showToast('Failed to load timetable details', 'error');
  }
}

/**
 * Open Edit Timetable Modal
 */
async function openEditModal(timetableId) {
  try {
    const res = await apiRequest(`/timetable/${timetableId}`);
    const t = res.data?.data?.timetable || res.data?.timetable;
    if (!res.ok || !t) {
      showToast('Failed to load timetable entry for editing', 'error');
      return;
    }

    populateEditModalDropdowns();
    document.getElementById('editTimetableId').value = t.timetable_id;
    document.getElementById('editDaySelect').value = t.day_of_week;
    document.getElementById('editStartTime').value = t.start_time.toString().slice(0, 5);
    document.getElementById('editEndTime').value = t.end_time.toString().slice(0, 5);
    document.getElementById('editCourseSelect').value = t.course_id;
    document.getElementById('editTeacherSelect').value = t.teacher_id;
    document.getElementById('editClassName').value = t.class_name;
    document.getElementById('editDivision').value = t.division;
    document.getElementById('editRoomNo').value = t.room_no;
    document.getElementById('editAcademicYear').value = t.academic_year;
    document.getElementById('editSemester').value = t.semester;

    hideModalAlert('editModalAlert');
    openModal('editTimetableModal');
  } catch (err) {
    console.error('Error loading timetable entry for edit:', err);
    showToast('Failed to load timetable data', 'error');
  }
}

/**
 * Open Delete Confirmation Modal
 */
function openDeleteModal(timetableId) {
  const entry = cachedTimetable.find(t => t.timetable_id === timetableId);
  if (!entry) return;

  const courseTitle = `${entry.course_code} - ${entry.course_name}`;
  const dayTime = `${entry.day_of_week} (${formatTime(entry.start_time)} - ${formatTime(entry.end_time)})`;

  const confirmMsg = document.getElementById('confirmModalMessage');
  if (confirmMsg) {
    confirmMsg.innerHTML = `
      Are you sure you want to delete the scheduled lecture for <strong>${escapeHtml(courseTitle)}</strong> on <strong>${escapeHtml(dayTime)}</strong> in <strong>${escapeHtml(entry.room_no)}</strong>?<br><br>
      <span style="font-size: 12px; color: var(--slate-500);">
        This action will permanently remove this lecture from the institutional timetable schedule.
      </span>
    `;
  }

  pendingConfirmAction = async () => {
    try {
      const res = await apiRequest(`/timetable/${timetableId}`, { method: 'DELETE' });

      if (res.ok && res.data && res.data.success) {
        closeModal('confirmModal');
        showToast('Timetable entry deleted successfully', 'success');
        await loadTimetable();
        await loadTodayAndNextLecture();
      } else {
        closeModal('confirmModal');
        showToast(res.data?.message || 'Cannot delete timetable entry.', 'error');
      }
    } catch (err) {
      closeModal('confirmModal');
      showToast('A network error occurred while deleting timetable entry.', 'error');
    }
  };

  openModal('confirmModal');
}

/**
 * Setup Add & Edit Form Submissions
 */
function initFormSubmissions() {
  // 1. Add Timetable Form
  const addForm = document.getElementById('addTimetableForm');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideModalAlert('addModalAlert');

      const dayOfWeek = document.getElementById('addDaySelect').value;
      const startTime = document.getElementById('addStartTime').value;
      const endTime = document.getElementById('addEndTime').value;
      const courseId = document.getElementById('addCourseSelect').value;
      const teacherId = document.getElementById('addTeacherSelect').value;
      const className = document.getElementById('addClassName').value.trim();
      const division = document.getElementById('addDivision').value.trim();
      const roomNo = document.getElementById('addRoomNo').value.trim();
      const academicYear = document.getElementById('addAcademicYear').value.trim();
      const semester = parseInt(document.getElementById('addSemester').value, 10);

      if (!dayOfWeek || !startTime || !endTime || !courseId || !teacherId || !className || !division || !roomNo) {
        showModalAlert('addModalAlert', 'All fields marked with an asterisk are required.');
        return;
      }

      if (startTime >= endTime) {
        showModalAlert('addModalAlert', 'End time must be later than start time.');
        return;
      }

      const submitBtn = document.getElementById('submitAddTimetableBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      try {
        const payload = {
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          course_id: parseInt(courseId, 10),
          teacher_id: parseInt(teacherId, 10),
          class_name: className,
          division,
          room_no: roomNo,
          academic_year: academicYear,
          semester
        };

        const res = await apiRequest('/timetable', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('addTimetableModal');
          showToast('Timetable entry created successfully', 'success');
          await loadTimetable();
          await loadTodayAndNextLecture();
        } else {
          showModalAlert('addModalAlert', res.data?.message || 'Failed to create timetable entry.');
        }
      } catch (err) {
        showModalAlert('addModalAlert', 'A network error occurred. Please try again.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Lecture';
        }
      }
    });
  }

  // 2. Edit Timetable Form
  const editForm = document.getElementById('editTimetableForm');
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideModalAlert('editModalAlert');

      const timetableId = document.getElementById('editTimetableId').value;
      const dayOfWeek = document.getElementById('editDaySelect').value;
      const startTime = document.getElementById('editStartTime').value;
      const endTime = document.getElementById('editEndTime').value;
      const courseId = document.getElementById('editCourseSelect').value;
      const teacherId = document.getElementById('editTeacherSelect').value;
      const className = document.getElementById('editClassName').value.trim();
      const division = document.getElementById('editDivision').value.trim();
      const roomNo = document.getElementById('editRoomNo').value.trim();
      const academicYear = document.getElementById('editAcademicYear').value.trim();
      const semester = parseInt(document.getElementById('editSemester').value, 10);

      if (!dayOfWeek || !startTime || !endTime || !courseId || !teacherId || !className || !division || !roomNo) {
        showModalAlert('editModalAlert', 'All fields marked with an asterisk are required.');
        return;
      }

      if (startTime >= endTime) {
        showModalAlert('editModalAlert', 'End time must be later than start time.');
        return;
      }

      const submitBtn = document.getElementById('submitEditTimetableBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      try {
        const payload = {
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          course_id: parseInt(courseId, 10),
          teacher_id: parseInt(teacherId, 10),
          class_name: className,
          division,
          room_no: roomNo,
          academic_year: academicYear,
          semester
        };

        const res = await apiRequest(`/timetable/${timetableId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('editTimetableModal');
          showToast('Timetable entry updated successfully', 'success');
          await loadTimetable();
          await loadTodayAndNextLecture();
        } else {
          showModalAlert('editModalAlert', res.data?.message || 'Failed to update timetable entry.');
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

/**
 * Format TIME string HH:MM:SS to HH:MM
 */
function formatTime(timeVal) {
  if (!timeVal) return '-';
  const str = String(timeVal);
  return str.slice(0, 5);
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

/**
 * Parse HH:MM or HH:MM:SS to seconds from midnight
 */
function parseTimeToSeconds(timeVal) {
  if (!timeVal) return 0;
  const parts = String(timeVal).split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2], 10) || 0;
  return h * 3600 + m * 60 + s;
}

/**
 * Day of week badge HTML
 */
function getDayBadgeHtml(day) {
  const colors = {
    Monday: 'background: #e0f2fe; color: #0369a1;',
    Tuesday: 'background: #ede9fe; color: #6d28d9;',
    Wednesday: 'background: #ccfbf1; color: #0f766e;',
    Thursday: 'background: #ffedd5; color: #c2410c;',
    Friday: 'background: #fae8ff; color: #a21caf;',
    Saturday: 'background: #f1f5f9; color: #475569;'
  };
  const style = colors[day] || 'background: #f1f5f9; color: var(--slate-700);';
  return `<span class="badge" style="${style} font-weight: 700;">${escapeHtml(day)}</span>`;
}
