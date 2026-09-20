/**
 * Admin Student Management Controller
 * Student Information Portal
 */

// State Management
let currentPage = 1;
const pageSize = 10;
let searchQuery = '';
let selectedDept = '';
let selectedSem = '';
let selectedStatus = '';
let availableDepartments = [];
let cachedStudents = [];
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
  initPasswordToggles();
  initToolbarFilters();
  initFormSubmissions();

  // 4. Load Departments and Students
  await loadDepartments();
  await loadStudents();
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
 * Password Visibility Toggles
 */
function initPasswordToggles() {
  const toggleAdd = document.getElementById('toggleAddPassword');
  const inputAdd = document.getElementById('addPassword');
  if (toggleAdd && inputAdd) {
    toggleAdd.addEventListener('click', () => {
      inputAdd.type = inputAdd.type === 'password' ? 'text' : 'password';
    });
  }

  const toggleEdit = document.getElementById('toggleEditPassword');
  const inputEdit = document.getElementById('editPassword');
  if (toggleEdit && inputEdit) {
    toggleEdit.addEventListener('click', () => {
      inputEdit.type = inputEdit.type === 'password' ? 'text' : 'password';
    });
  }
}

/**
 * Toolbar Filters & Search
 */
function initToolbarFilters() {
  const searchInput = document.getElementById('studentSearchInput');
  const deptSelect = document.getElementById('deptFilterSelect');
  const semSelect = document.getElementById('semFilterSelect');
  const statusSelect = document.getElementById('statusFilterSelect');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const openAddBtn = document.getElementById('openAddStudentBtn');

  // Search with debounce
  let debounceTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        searchQuery = e.target.value.trim();
        currentPage = 1;
        loadStudents();
      }, 300);
    });
  }

  // Department filter
  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      selectedDept = e.target.value;
      currentPage = 1;
      loadStudents();
    });
  }

  // Semester filter
  if (semSelect) {
    semSelect.addEventListener('change', (e) => {
      selectedSem = e.target.value;
      currentPage = 1;
      loadStudents();
    });
  }

  // Status filter
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      selectedStatus = e.target.value;
      currentPage = 1;
      loadStudents();
    });
  }

  // Pagination Previous
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadStudents();
      }
    });
  }

  // Pagination Next
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentPage++;
      loadStudents();
    });
  }

  // Open Add Student Modal
  if (openAddBtn) {
    openAddBtn.addEventListener('click', () => {
      const form = document.getElementById('addStudentForm');
      if (form) form.reset();
      hideModalAlert('addModalAlert');
      
      // Set default admission date to today
      const addAdmissionDate = document.getElementById('addAdmissionDate');
      if (addAdmissionDate && !addAdmissionDate.value) {
        addAdmissionDate.value = new Date().toISOString().split('T')[0];
      }

      openModal('addStudentModal');
    });
  }
}

/**
 * Load Departments from Backend
 */
async function loadDepartments() {
  try {
    const res = await apiRequest('/departments');
    if (res.ok && res.data && res.data.success && res.data.data) {
      availableDepartments = res.data.data.departments || [];
      populateDepartmentDropdowns(availableDepartments);
    }
  } catch (err) {
    console.error('Error loading departments:', err);
  }
}

function populateDepartmentDropdowns(departments) {
  const filterSelect = document.getElementById('deptFilterSelect');
  const addSelect = document.getElementById('addDeptSelect');
  const editSelect = document.getElementById('editDeptSelect');

  // Filter dropdown
  if (filterSelect) {
    const filterOptions = [
      '<option value="">All Departments</option>',
      ...departments.map(d => `<option value="${d.department_id}">${escapeHtml(d.department_name)} (${escapeHtml(d.department_code)})</option>`)
    ].join('');
    filterSelect.innerHTML = filterOptions;
  }

  // Add / Edit dropdowns
  const modalPlaceholder = departments.length === 0
    ? '<option value="">No departments available (Register departments first)</option>'
    : '<option value="">Select Department</option>';

  const modalOptions = [
    modalPlaceholder,
    ...departments.map(d => `<option value="${d.department_id}">${escapeHtml(d.department_name)} (${escapeHtml(d.department_code)})</option>`)
  ].join('');

  if (addSelect) addSelect.innerHTML = modalOptions;
  if (editSelect) editSelect.innerHTML = modalOptions;
}

/**
 * Helper to convert ISO/DB date to YYYY-MM-DD for date inputs
 */
function toDateInputValue(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
}

/**
 * Load and Render Students
 */
async function loadStudents() {
  const tableBody = document.getElementById('studentsTableBody');
  const emptyState = document.getElementById('studentsTableEmpty');
  const paginationInfo = document.getElementById('paginationInfo');
  const pageIndicator = document.getElementById('pageIndicator');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  // Build query parameters
  const queryParams = new URLSearchParams();
  queryParams.append('page', String(currentPage));
  queryParams.append('limit', String(pageSize));
  if (searchQuery) queryParams.append('search', searchQuery);
  if (selectedDept) queryParams.append('department_id', selectedDept);
  if (selectedSem) queryParams.append('semester', selectedSem);
  if (selectedStatus !== '') queryParams.append('status', selectedStatus);

  try {
    const res = await apiRequest(`/students?${queryParams.toString()}`);

    if (res.ok && res.data && res.data.success && res.data.data) {
      const { students, pagination } = res.data.data;
      cachedStudents = students || [];

      // Render table rows
      if (cachedStudents.length === 0) {
        if (tableBody) tableBody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
      } else {
        if (emptyState) emptyState.classList.add('hidden');
        if (tableBody) {
          tableBody.innerHTML = cachedStudents.map(student => renderStudentRow(student)).join('');
        }
      }

      // Update pagination
      const total = pagination.total;
      const totalPages = pagination.totalPages;
      const startCount = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
      const endCount = Math.min(total, currentPage * pageSize);

      if (paginationInfo) {
        paginationInfo.textContent = `Showing ${startCount} to ${endCount} of ${total} students`;
      }
      if (pageIndicator) {
        pageIndicator.textContent = `Page ${currentPage} of ${totalPages || 1}`;
      }
      if (prevBtn) prevBtn.disabled = currentPage <= 1;
      if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    } else {
      showToast(res.data?.message || 'Failed to load students', 'error');
    }
  } catch (err) {
    console.error('Error fetching students:', err);
    showToast('Network error while loading students', 'error');
  }
}

/**
 * Render single student table row HTML
 */
function renderStudentRow(student) {
  const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.username;
  const initial = (student.first_name ? student.first_name[0] : (student.username ? student.username[0] : 'S')).toUpperCase();

  const isActive = Boolean(student.is_active);
  const statusClass = isActive ? 'status-active' : 'status-inactive';
  const statusLabel = isActive ? 'Active' : 'Inactive';
  const toggleTitle = isActive ? 'Deactivate account' : 'Activate account';

  const classDiv = `${escapeHtml(student.class_name)} - ${escapeHtml(student.division)}`;
  const deptDisplay = student.department_name ? `${escapeHtml(student.department_name)}` : (student.department_code || '—');

  return `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-cell-avatar" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">${initial}</div>
          <div>
            <span class="user-cell-name">${escapeHtml(fullName)}</span>
            <div style="font-size: 11px; color: var(--slate-500); font-family: monospace;">@${escapeHtml(student.username)}</div>
          </div>
        </div>
      </td>
      <td><code style="font-weight: 600; color: var(--primary-700);">${escapeHtml(student.prn_number)}</code></td>
      <td><span class="badge" style="background: #f1f5f9; color: var(--slate-700);">${deptDisplay}</span></td>
      <td>${classDiv}</td>
      <td><span class="badge" style="background: #e0f2fe; color: #0369a1; font-weight: 600;">Sem ${student.semester}</span></td>
      <td>${escapeHtml(student.email)}</td>
      <td>
        <span class="status-pill ${statusClass}">
          <span class="status-dot"></span>
          <span>${statusLabel}</span>
        </span>
      </td>
      <td>
        <div class="action-buttons-group" style="justify-content: flex-end;">
          <button type="button" class="btn-action btn-action-view" title="View details" onclick="viewStudent(${student.student_id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-edit" title="Edit student" onclick="editStudent(${student.student_id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-status" title="${toggleTitle}" onclick="promptToggleStatus(${student.student_id}, ${isActive}, '${escapeHtml(student.prn_number)}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
              <line x1="12" y1="2" x2="12" y2="12"></line>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-delete" title="Delete student" onclick="promptDeleteStudent(${student.student_id}, '${escapeHtml(student.prn_number)}')">
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
 * View Student Profile Modal
 */
window.viewStudent = async function(studentId) {
  let student = cachedStudents.find(s => s.student_id === studentId);
  if (!student) {
    try {
      const res = await apiRequest(`/students/${studentId}`);
      if (res.ok && res.data && res.data.data) {
        student = res.data.data.student;
      }
    } catch (e) {}
  }

  if (!student) {
    showToast('Unable to load student details', 'error');
    return;
  }

  const fullName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.username;
  const initial = (student.first_name ? student.first_name[0] : (student.username ? student.username[0] : 'S')).toUpperCase();
  const createdFormatted = typeof formatDateTime === 'function' ? formatDateTime(student.created_at) : student.created_at;
  const admissionFormatted = typeof formatDate === 'function' ? formatDate(student.admission_date) : student.admission_date;
  const dobFormatted = student.date_of_birth ? (typeof formatDate === 'function' ? formatDate(student.date_of_birth) : student.date_of_birth) : 'Not specified';

  const avatarEl = document.getElementById('viewStudentAvatar');
  if (avatarEl) avatarEl.textContent = initial;

  document.getElementById('viewStudentFullName').textContent = fullName;
  document.getElementById('viewStudentPrn').textContent = student.prn_number;

  const statusEl = document.getElementById('viewStudentStatus');
  if (statusEl) {
    statusEl.textContent = student.is_active ? 'Active' : 'Inactive';
    statusEl.className = `status-pill ${student.is_active ? 'status-active' : 'status-inactive'}`;
  }

  document.getElementById('viewStudentDept').textContent = student.department_name ? `${student.department_name} (${student.department_code})` : (student.department_code || '—');
  document.getElementById('viewStudentClassDiv').textContent = `${student.class_name} - Division ${student.division}`;
  document.getElementById('viewStudentSemester').textContent = `Semester ${student.semester}`;
  document.getElementById('viewStudentAdmission').textContent = admissionFormatted;
  document.getElementById('viewStudentDob').textContent = dobFormatted;
  document.getElementById('viewStudentGender').textContent = student.gender || 'Not specified';

  document.getElementById('viewStudentUsername').textContent = student.username;
  document.getElementById('viewStudentEmail').textContent = student.email;
  document.getElementById('viewStudentPhone').textContent = student.phone || '—';
  document.getElementById('viewStudentCreated').textContent = createdFormatted;

  openModal('viewStudentModal');
};

/**
 * Edit Student Modal Trigger
 */
window.editStudent = async function(studentId) {
  let student = cachedStudents.find(s => s.student_id === studentId);
  if (!student) {
    try {
      const res = await apiRequest(`/students/${studentId}`);
      if (res.ok && res.data && res.data.data) {
        student = res.data.data.student;
      }
    } catch (e) {}
  }

  if (!student) {
    showToast('Unable to load student profile', 'error');
    return;
  }

  hideModalAlert('editModalAlert');

  document.getElementById('editStudentId').value = student.student_id;
  document.getElementById('editFirstName').value = student.first_name || '';
  document.getElementById('editLastName').value = student.last_name || '';
  document.getElementById('editUsername').value = student.username || '';
  document.getElementById('editEmail').value = student.email || '';
  document.getElementById('editPhone').value = student.phone || '';
  document.getElementById('editPassword').value = ''; // Never pre-fill password

  document.getElementById('editPrn').value = student.prn_number || '';
  document.getElementById('editDeptSelect').value = String(student.department_id);
  document.getElementById('editAdmissionDate').value = toDateInputValue(student.admission_date);
  document.getElementById('editDob').value = toDateInputValue(student.date_of_birth);
  document.getElementById('editGenderSelect').value = student.gender || '';
  document.getElementById('editSemesterSelect').value = String(student.semester || '1');
  document.getElementById('editClassName').value = student.class_name || '';
  document.getElementById('editDivision').value = student.division || '';

  openModal('editStudentModal');
};

/**
 * Prompt Student Status Toggle
 */
window.promptToggleStatus = function(studentId, currentStatus, prnNumber) {
  const actionText = currentStatus ? 'deactivate' : 'activate';
  const modalMsg = `Are you sure you want to <strong>${actionText}</strong> the user account for student <strong>${prnNumber}</strong>?`;

  document.getElementById('confirmModalTitle').textContent = `${currentStatus ? 'Deactivate' : 'Activate'} Student`;
  document.getElementById('confirmModalMessage').innerHTML = modalMsg;

  const actionBtn = document.getElementById('confirmModalActionBtn');
  actionBtn.textContent = currentStatus ? 'Deactivate' : 'Activate';
  actionBtn.className = currentStatus ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';

  pendingConfirmAction = async () => {
    try {
      const res = await apiRequest(`/students/${studentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !currentStatus })
      });

      if (res.ok && res.data && res.data.success) {
        closeModal('confirmModal');
        showToast(`Student account ${actionText}d successfully`, 'success');
        await loadStudents();
      } else {
        showToast(res.data?.message || 'Failed to update student status', 'error');
      }
    } catch (err) {
      showToast('Network error while updating status', 'error');
    }
  };

  openModal('confirmModal');
};

/**
 * Prompt Student Safe Deletion
 */
window.promptDeleteStudent = function(studentId, prnNumber) {
  const modalMsg = `Are you sure you want to permanently delete student profile <strong>${prnNumber}</strong>?<br><br><small class="text-muted">Note: If this student has related attendance, grades, enrollments, or performance records, deletion will be blocked safely to preserve academic integrity.</small>`;

  document.getElementById('confirmModalTitle').textContent = 'Delete Student';
  document.getElementById('confirmModalMessage').innerHTML = modalMsg;

  const actionBtn = document.getElementById('confirmModalActionBtn');
  actionBtn.textContent = 'Delete Student';
  actionBtn.className = 'btn btn-danger btn-sm';

  pendingConfirmAction = async () => {
    try {
      const res = await apiRequest(`/students/${studentId}`, {
        method: 'DELETE'
      });

      if (res.ok && res.data && res.data.success) {
        closeModal('confirmModal');
        showToast('Student profile deleted successfully', 'success');
        await loadStudents();
      } else {
        closeModal('confirmModal');
        showToast(res.data?.message || 'Failed to delete student', 'error');
      }
    } catch (err) {
      closeModal('confirmModal');
      showToast('Network error while deleting student', 'error');
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

  // Add Student Form
  const addForm = document.getElementById('addStudentForm');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const firstName = document.getElementById('addFirstName').value.trim();
      const lastName = document.getElementById('addLastName').value.trim();
      const username = document.getElementById('addUsername').value.trim();
      const email = document.getElementById('addEmail').value.trim();
      const phone = document.getElementById('addPhone').value.trim();
      const password = document.getElementById('addPassword').value;

      const prnNumber = document.getElementById('addPrn').value.trim();
      const departmentId = document.getElementById('addDeptSelect').value;
      const admissionDate = document.getElementById('addAdmissionDate').value;
      const dob = document.getElementById('addDob').value;
      const gender = document.getElementById('addGenderSelect').value;
      const semester = document.getElementById('addSemesterSelect').value;
      const className = document.getElementById('addClassName').value.trim();
      const division = document.getElementById('addDivision').value.trim();

      if (!firstName || !lastName || !username || !email || !password || !prnNumber || !departmentId || !admissionDate || !semester || !className || !division) {
        showModalAlert('addModalAlert', 'Please fill in all required fields.');
        return;
      }

      if (password.length < 6) {
        showModalAlert('addModalAlert', 'Password must be at least 6 characters long.');
        return;
      }

      const saveBtn = document.getElementById('saveAddStudentBtn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Creating...';
      }

      try {
        const payload = {
          first_name: firstName,
          last_name: lastName,
          username,
          email,
          password,
          phone: phone || null,
          prn_number: prnNumber,
          department_id: parseInt(departmentId, 10),
          admission_date: admissionDate,
          date_of_birth: dob || null,
          gender: gender || null,
          semester: parseInt(semester, 10),
          class_name: className,
          division
        };

        const res = await apiRequest('/students', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('addStudentModal');
          showToast('Student registered successfully', 'success');
          await loadStudents();
        } else {
          showModalAlert('addModalAlert', res.data?.message || 'Failed to create student');
        }
      } catch (err) {
        showModalAlert('addModalAlert', 'Network communication error');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Create Student';
        }
      }
    });
  }

  // Edit Student Form
  const editForm = document.getElementById('editStudentForm');
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const studentId = document.getElementById('editStudentId').value;
      const firstName = document.getElementById('editFirstName').value.trim();
      const lastName = document.getElementById('editLastName').value.trim();
      const username = document.getElementById('editUsername').value.trim();
      const email = document.getElementById('editEmail').value.trim();
      const phone = document.getElementById('editPhone').value.trim();
      const password = document.getElementById('editPassword').value;

      const prnNumber = document.getElementById('editPrn').value.trim();
      const departmentId = document.getElementById('editDeptSelect').value;
      const admissionDate = document.getElementById('editAdmissionDate').value;
      const dob = document.getElementById('editDob').value;
      const gender = document.getElementById('editGenderSelect').value;
      const semester = document.getElementById('editSemesterSelect').value;
      const className = document.getElementById('editClassName').value.trim();
      const division = document.getElementById('editDivision').value.trim();

      if (!firstName || !lastName || !username || !email || !prnNumber || !departmentId || !admissionDate || !semester || !className || !division) {
        showModalAlert('editModalAlert', 'Please fill in all required fields.');
        return;
      }

      if (password && password.length < 6) {
        showModalAlert('editModalAlert', 'New password must be at least 6 characters long.');
        return;
      }

      const saveBtn = document.getElementById('saveEditStudentBtn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      const updatePayload = {
        first_name: firstName,
        last_name: lastName,
        username,
        email,
        phone: phone || null,
        prn_number: prnNumber,
        department_id: parseInt(departmentId, 10),
        admission_date: admissionDate,
        date_of_birth: dob || null,
        gender: gender || null,
        semester: parseInt(semester, 10),
        class_name: className,
        division
      };

      if (password) {
        updatePayload.password = password;
      }

      try {
        const res = await apiRequest(`/students/${studentId}`, {
          method: 'PUT',
          body: JSON.stringify(updatePayload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('editStudentModal');
          showToast('Student profile updated successfully', 'success');
          await loadStudents();
        } else {
          showModalAlert('editModalAlert', res.data?.message || 'Failed to update student');
        }
      } catch (err) {
        showModalAlert('editModalAlert', 'Network communication error');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      }
    });
  }
}

/**
 * Modal Alert Helpers
 */
function showModalAlert(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
}

function hideModalAlert(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

/**
 * Toast Notifications
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3500);
}
