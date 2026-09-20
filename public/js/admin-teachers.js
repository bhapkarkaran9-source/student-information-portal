/**
 * Admin Teacher Management Controller
 * Student Information Portal
 */

// State Management
let currentPage = 1;
const pageSize = 10;
let searchQuery = '';
let selectedDept = '';
let selectedStatus = '';
let availableDepartments = [];
let cachedTeachers = [];
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

  // 4. Load Departments and Teachers
  await loadDepartments();
  await loadTeachers();
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
  const searchInput = document.getElementById('teacherSearchInput');
  const deptSelect = document.getElementById('deptFilterSelect');
  const statusSelect = document.getElementById('statusFilterSelect');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const openAddBtn = document.getElementById('openAddTeacherBtn');

  // Search with debounce
  let debounceTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        searchQuery = e.target.value.trim();
        currentPage = 1;
        loadTeachers();
      }, 300);
    });
  }

  // Department filter
  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      selectedDept = e.target.value;
      currentPage = 1;
      loadTeachers();
    });
  }

  // Status filter
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      selectedStatus = e.target.value;
      currentPage = 1;
      loadTeachers();
    });
  }

  // Pagination Previous
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadTeachers();
      }
    });
  }

  // Pagination Next
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentPage++;
      loadTeachers();
    });
  }

  // Open Add Teacher Modal
  if (openAddBtn) {
    openAddBtn.addEventListener('click', () => {
      const form = document.getElementById('addTeacherForm');
      if (form) form.reset();
      hideModalAlert('addModalAlert');

      // Set default joining date to today
      const addJoiningDate = document.getElementById('addJoiningDate');
      if (addJoiningDate && !addJoiningDate.value) {
        addJoiningDate.value = new Date().toISOString().split('T')[0];
      }

      openModal('addTeacherModal');
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
    ? '<option value="">No departments available. Register departments first.</option>'
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
 * Load and Render Teachers
 */
async function loadTeachers() {
  const tableBody = document.getElementById('teachersTableBody');
  const emptyState = document.getElementById('teachersTableEmpty');
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
  if (selectedStatus !== '') queryParams.append('status', selectedStatus);

  try {
    const res = await apiRequest(`/teachers?${queryParams.toString()}`);

    if (res.ok && res.data && res.data.success && res.data.data) {
      const { teachers, pagination } = res.data.data;
      cachedTeachers = teachers || [];

      // Render table rows
      if (cachedTeachers.length === 0) {
        if (tableBody) tableBody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
      } else {
        if (emptyState) emptyState.classList.add('hidden');
        if (tableBody) {
          tableBody.innerHTML = cachedTeachers.map(teacher => renderTeacherRow(teacher)).join('');
        }
      }

      // Update pagination
      const total = pagination.total;
      const totalPages = pagination.totalPages;
      const startCount = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
      const endCount = Math.min(total, currentPage * pageSize);

      if (paginationInfo) {
        paginationInfo.textContent = `Showing ${startCount} to ${endCount} of ${total} teachers`;
      }
      if (pageIndicator) {
        pageIndicator.textContent = `Page ${currentPage} of ${totalPages || 1}`;
      }
      if (prevBtn) prevBtn.disabled = currentPage <= 1;
      if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    } else {
      showToast(res.data?.message || 'Failed to load teachers', 'error');
    }
  } catch (err) {
    console.error('Error fetching teachers:', err);
    showToast('Network error while loading teachers', 'error');
  }
}

/**
 * Render single teacher table row HTML
 */
function renderTeacherRow(teacher) {
  const fullName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || teacher.username;
  const initial = (teacher.first_name ? teacher.first_name[0] : (teacher.username ? teacher.username[0] : 'T')).toUpperCase();

  const isActive = Boolean(teacher.is_active);
  const statusClass = isActive ? 'status-active' : 'status-inactive';
  const statusLabel = isActive ? 'Active' : 'Inactive';
  const toggleTitle = isActive ? 'Deactivate account' : 'Activate account';

  const deptDisplay = teacher.department_name ? `${escapeHtml(teacher.department_name)}` : (teacher.department_code || '—');

  return `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-cell-avatar" style="background: linear-gradient(135deg, #059669 0%, #047857 100%);">${initial}</div>
          <div>
            <span class="user-cell-name">${escapeHtml(fullName)}</span>
            <div style="font-size: 11px; color: var(--slate-500); font-family: monospace;">@${escapeHtml(teacher.username)}</div>
          </div>
        </div>
      </td>
      <td><code style="font-weight: 600; color: #047857;">${escapeHtml(teacher.employee_number)}</code></td>
      <td><span class="badge" style="background: #f1f5f9; color: var(--slate-700);">${deptDisplay}</span></td>
      <td><span class="badge" style="background: #ecfdf5; color: #047857; font-weight: 600;">${escapeHtml(teacher.designation)}</span></td>
      <td>${escapeHtml(teacher.email)}</td>
      <td>${escapeHtml(teacher.phone || '—')}</td>
      <td>
        <span class="status-pill ${statusClass}">
          <span class="status-dot"></span>
          <span>${statusLabel}</span>
        </span>
      </td>
      <td>
        <div class="action-buttons-group" style="justify-content: flex-end;">
          <button type="button" class="btn-action btn-action-view" title="View details" onclick="viewTeacher(${teacher.teacher_id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-edit" title="Edit teacher" onclick="editTeacher(${teacher.teacher_id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-status" title="${toggleTitle}" onclick="promptToggleStatus(${teacher.teacher_id}, ${isActive}, '${escapeHtml(teacher.employee_number)}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
              <line x1="12" y1="2" x2="12" y2="12"></line>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-delete" title="Delete teacher" onclick="promptDeleteTeacher(${teacher.teacher_id}, '${escapeHtml(teacher.employee_number)}')">
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
 * View Teacher Profile Modal
 */
window.viewTeacher = async function(teacherId) {
  let teacher = cachedTeachers.find(t => t.teacher_id === teacherId);
  if (!teacher) {
    try {
      const res = await apiRequest(`/teachers/${teacherId}`);
      if (res.ok && res.data && res.data.data) {
        teacher = res.data.data.teacher;
      }
    } catch (e) {}
  }

  if (!teacher) {
    showToast('Unable to load teacher details', 'error');
    return;
  }

  const fullName = `${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || teacher.username;
  const initial = (teacher.first_name ? teacher.first_name[0] : (teacher.username ? teacher.username[0] : 'T')).toUpperCase();
  const createdFormatted = typeof formatDateTime === 'function' ? formatDateTime(teacher.created_at) : teacher.created_at;
  const joiningFormatted = typeof formatDate === 'function' ? formatDate(teacher.joining_date) : teacher.joining_date;

  const avatarEl = document.getElementById('viewTeacherAvatar');
  if (avatarEl) avatarEl.textContent = initial;

  document.getElementById('viewTeacherFullName').textContent = fullName;
  document.getElementById('viewTeacherEmpNo').textContent = teacher.employee_number;

  const statusEl = document.getElementById('viewTeacherStatus');
  if (statusEl) {
    statusEl.textContent = teacher.is_active ? 'Active' : 'Inactive';
    statusEl.className = `status-pill ${teacher.is_active ? 'status-active' : 'status-inactive'}`;
  }

  document.getElementById('viewTeacherDept').textContent = teacher.department_name ? `${teacher.department_name} (${teacher.department_code})` : (teacher.department_code || '—');
  document.getElementById('viewTeacherDesignation').textContent = teacher.designation || 'Not specified';
  document.getElementById('viewTeacherJoining').textContent = joiningFormatted;

  document.getElementById('viewTeacherUsername').textContent = teacher.username;
  document.getElementById('viewTeacherEmail').textContent = teacher.email;
  document.getElementById('viewTeacherPhone').textContent = teacher.phone || '—';
  document.getElementById('viewTeacherCreated').textContent = createdFormatted;

  openModal('viewTeacherModal');
};

/**
 * Edit Teacher Modal Trigger
 */
window.editTeacher = async function(teacherId) {
  let teacher = cachedTeachers.find(t => t.teacher_id === teacherId);
  if (!teacher) {
    try {
      const res = await apiRequest(`/teachers/${teacherId}`);
      if (res.ok && res.data && res.data.data) {
        teacher = res.data.data.teacher;
      }
    } catch (e) {}
  }

  if (!teacher) {
    showToast('Unable to load teacher profile', 'error');
    return;
  }

  hideModalAlert('editModalAlert');

  document.getElementById('editTeacherId').value = teacher.teacher_id;
  document.getElementById('editFirstName').value = teacher.first_name || '';
  document.getElementById('editLastName').value = teacher.last_name || '';
  document.getElementById('editUsername').value = teacher.username || '';
  document.getElementById('editEmail').value = teacher.email || '';
  document.getElementById('editPhone').value = teacher.phone || '';
  document.getElementById('editPassword').value = ''; // Never pre-fill password

  document.getElementById('editEmployeeNumber').value = teacher.employee_number || '';
  document.getElementById('editDeptSelect').value = String(teacher.department_id);
  document.getElementById('editDesignation').value = teacher.designation || '';
  document.getElementById('editJoiningDate').value = toDateInputValue(teacher.joining_date);

  openModal('editTeacherModal');
};

/**
 * Prompt Teacher Status Toggle
 */
window.promptToggleStatus = function(teacherId, currentStatus, employeeNumber) {
  const actionText = currentStatus ? 'deactivate' : 'activate';
  const modalMsg = `Are you sure you want to <strong>${actionText}</strong> the account for teacher <strong>${employeeNumber}</strong>?`;

  document.getElementById('confirmModalTitle').textContent = `${currentStatus ? 'Deactivate' : 'Activate'} Teacher`;
  document.getElementById('confirmModalMessage').innerHTML = modalMsg;

  const actionBtn = document.getElementById('confirmModalActionBtn');
  actionBtn.textContent = currentStatus ? 'Deactivate' : 'Activate';
  actionBtn.className = currentStatus ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';

  pendingConfirmAction = async () => {
    try {
      const res = await apiRequest(`/teachers/${teacherId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !currentStatus })
      });

      if (res.ok && res.data && res.data.success) {
        closeModal('confirmModal');
        showToast(`Teacher account ${actionText}d successfully`, 'success');
        await loadTeachers();
      } else {
        showToast(res.data?.message || 'Failed to update teacher status', 'error');
      }
    } catch (err) {
      showToast('Network error while updating status', 'error');
    }
  };

  openModal('confirmModal');
};

/**
 * Prompt Teacher Safe Deletion
 */
window.promptDeleteTeacher = function(teacherId, employeeNumber) {
  const modalMsg = `Are you sure you want to permanently delete teacher profile <strong>${employeeNumber}</strong>?<br><br><small class="text-muted">Note: If this teacher has related academic records (courses, attendance, grades, assignments, study materials, timetable), deletion will be safely blocked.</small>`;

  document.getElementById('confirmModalTitle').textContent = 'Delete Teacher';
  document.getElementById('confirmModalMessage').innerHTML = modalMsg;

  const actionBtn = document.getElementById('confirmModalActionBtn');
  actionBtn.textContent = 'Delete Teacher';
  actionBtn.className = 'btn btn-danger btn-sm';

  pendingConfirmAction = async () => {
    try {
      const res = await apiRequest(`/teachers/${teacherId}`, {
        method: 'DELETE'
      });

      if (res.ok && res.data && res.data.success) {
        closeModal('confirmModal');
        showToast('Teacher profile deleted successfully', 'success');
        await loadTeachers();
      } else {
        closeModal('confirmModal');
        showToast(res.data?.message || 'Failed to delete teacher', 'error');
      }
    } catch (err) {
      closeModal('confirmModal');
      showToast('Network error while deleting teacher', 'error');
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

  // Add Teacher Form
  const addForm = document.getElementById('addTeacherForm');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const firstName = document.getElementById('addFirstName').value.trim();
      const lastName = document.getElementById('addLastName').value.trim();
      const username = document.getElementById('addUsername').value.trim();
      const email = document.getElementById('addEmail').value.trim();
      const phone = document.getElementById('addPhone').value.trim();
      const password = document.getElementById('addPassword').value;

      const employeeNumber = document.getElementById('addEmployeeNumber').value.trim();
      const departmentId = document.getElementById('addDeptSelect').value;
      const designation = document.getElementById('addDesignation').value.trim();
      const joiningDate = document.getElementById('addJoiningDate').value;

      if (!departmentId) {
        showModalAlert('addModalAlert', 'Please select a valid department. Note: Academic departments must be registered before teachers can be added.');
        return;
      }

      if (!firstName || !lastName || !username || !email || !password || !employeeNumber || !designation || !joiningDate) {
        showModalAlert('addModalAlert', 'Please fill in all required fields.');
        return;
      }

      if (password.length < 6) {
        showModalAlert('addModalAlert', 'Password must be at least 6 characters long.');
        return;
      }

      const saveBtn = document.getElementById('saveAddTeacherBtn');
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
          employee_number: employeeNumber,
          department_id: parseInt(departmentId, 10),
          designation,
          joining_date: joiningDate
        };

        const res = await apiRequest('/teachers', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('addTeacherModal');
          showToast('Teacher registered successfully', 'success');
          await loadTeachers();
        } else {
          showModalAlert('addModalAlert', res.data?.message || 'Failed to create teacher');
        }
      } catch (err) {
        showModalAlert('addModalAlert', 'Network communication error');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Create Teacher';
        }
      }
    });
  }

  // Edit Teacher Form
  const editForm = document.getElementById('editTeacherForm');
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const teacherId = document.getElementById('editTeacherId').value;
      const firstName = document.getElementById('editFirstName').value.trim();
      const lastName = document.getElementById('editLastName').value.trim();
      const username = document.getElementById('editUsername').value.trim();
      const email = document.getElementById('editEmail').value.trim();
      const phone = document.getElementById('editPhone').value.trim();
      const password = document.getElementById('editPassword').value;

      const employeeNumber = document.getElementById('editEmployeeNumber').value.trim();
      const departmentId = document.getElementById('editDeptSelect').value;
      const designation = document.getElementById('editDesignation').value.trim();
      const joiningDate = document.getElementById('editJoiningDate').value;

      if (!departmentId) {
        showModalAlert('editModalAlert', 'Please select a valid department.');
        return;
      }

      if (!firstName || !lastName || !username || !email || !employeeNumber || !designation || !joiningDate) {
        showModalAlert('editModalAlert', 'Please fill in all required fields.');
        return;
      }

      if (password && password.length < 6) {
        showModalAlert('editModalAlert', 'New password must be at least 6 characters long.');
        return;
      }

      const saveBtn = document.getElementById('saveEditTeacherBtn');
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
        employee_number: employeeNumber,
        department_id: parseInt(departmentId, 10),
        designation,
        joining_date: joiningDate
      };

      if (password) {
        updatePayload.password = password;
      }

      try {
        const res = await apiRequest(`/teachers/${teacherId}`, {
          method: 'PUT',
          body: JSON.stringify(updatePayload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('editTeacherModal');
          showToast('Teacher profile updated successfully', 'success');
          await loadTeachers();
        } else {
          showModalAlert('editModalAlert', res.data?.message || 'Failed to update teacher');
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
