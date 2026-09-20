/**
 * Admin Department Management Controller
 * Student Information Portal
 */

// State Management
let currentPage = 1;
const pageSize = 10;
let searchQuery = '';
let selectedStatus = '';
let cachedDepartments = [];
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

  // 4. Load Departments
  await loadDepartments();
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
 * Toolbar Filters & Search
 */
function initToolbarFilters() {
  const searchInput = document.getElementById('deptSearchInput');
  const statusSelect = document.getElementById('statusFilterSelect');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const openAddBtn = document.getElementById('openAddDeptBtn');

  // Search with debounce
  let debounceTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        searchQuery = e.target.value.trim();
        currentPage = 1;
        loadDepartments();
      }, 300);
    });
  }

  // Status filter
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      selectedStatus = e.target.value;
      currentPage = 1;
      loadDepartments();
    });
  }

  // Pagination Previous
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadDepartments();
      }
    });
  }

  // Pagination Next
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentPage++;
      loadDepartments();
    });
  }

  // Open Add Department Modal
  if (openAddBtn) {
    openAddBtn.addEventListener('click', () => {
      const form = document.getElementById('addDeptForm');
      if (form) form.reset();
      hideModalAlert('addModalAlert');
      const statusInput = document.getElementById('addDeptStatus');
      if (statusInput) statusInput.value = '1';
      openModal('addDeptModal');
      setTimeout(() => {
        const codeInput = document.getElementById('addDeptCode');
        if (codeInput) codeInput.focus();
      }, 50);
    });
  }
}

/**
 * Load Departments from Backend API
 */
async function loadDepartments() {
  const tbody = document.getElementById('departmentsTableBody');
  const emptyState = document.getElementById('departmentsTableEmpty');
  const paginationInfo = document.getElementById('paginationInfo');
  const pageIndicator = document.getElementById('pageIndicator');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 40px; color: var(--slate-500);">
          <div style="display: inline-flex; align-items: center; gap: 8px;">
            <svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
              <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
            </svg>
            <span>Loading departments...</span>
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
    if (selectedStatus !== '') queryParams.append('status', selectedStatus);

    const res = await apiRequest(`/departments?${queryParams.toString()}`);

    if (!res.ok || !res.data || !res.data.success) {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 32px; color: var(--danger-600);">
              ${escapeHtml(res.data?.message || 'Failed to load departments. Please refresh.')}
            </td>
          </tr>
        `;
      }
      return;
    }

    const { departments, pagination } = res.data.data;
    cachedDepartments = departments || [];

    if (!departments || departments.length === 0) {
      if (tbody) tbody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (paginationInfo) paginationInfo.textContent = 'Showing 0 to 0 of 0 departments';
      if (pageIndicator) pageIndicator.textContent = 'Page 1 of 1';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // Render Table Rows
    let rowsHtml = '';
    departments.forEach(dept => {
      rowsHtml += renderDepartmentRow(dept);
    });
    if (tbody) tbody.innerHTML = rowsHtml;

    // Update Pagination UI
    const total = pagination.total || departments.length;
    const totalPages = pagination.totalPages || 1;
    const startIdx = (pagination.page - 1) * pagination.limit + 1;
    const endIdx = Math.min(pagination.page * pagination.limit, total);

    if (paginationInfo) {
      paginationInfo.textContent = `Showing ${startIdx} to ${endIdx} of ${total} department${total === 1 ? '' : 's'}`;
    }
    if (pageIndicator) {
      pageIndicator.textContent = `Page ${pagination.page} of ${totalPages}`;
    }
    if (prevBtn) prevBtn.disabled = pagination.page <= 1;
    if (nextBtn) nextBtn.disabled = pagination.page >= totalPages;

  } catch (error) {
    console.error('Error loading departments:', error);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 32px; color: var(--danger-600);">
            Failed to connect to the server. Please check your connection.
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Render single department row
 */
function renderDepartmentRow(dept) {
  const isActive = Boolean(dept.is_active);
  const statusClass = isActive ? 'status-active' : 'status-inactive';
  const statusLabel = isActive ? 'Active' : 'Inactive';
  const toggleTitle = isActive ? 'Deactivate Department' : 'Activate Department';

  const studentBadgeClass = (dept.student_count > 0) ? 'badge-primary' : 'badge-neutral';
  const teacherBadgeClass = (dept.teacher_count > 0) ? 'badge-primary' : 'badge-neutral';
  const courseBadgeClass = (dept.course_count > 0) ? 'badge-primary' : 'badge-neutral';

  const descPreview = dept.description 
    ? (dept.description.length > 50 ? `${escapeHtml(dept.description.substring(0, 50))}...` : escapeHtml(dept.description))
    : '<span style="color: var(--slate-400); font-style: italic;">No description</span>';

  return `
    <tr>
      <td>
        <span class="badge" style="background: #e0f2fe; color: #0369a1; font-family: monospace; font-weight: 700; font-size: 13px;">
          ${escapeHtml(dept.department_code)}
        </span>
      </td>
      <td>
        <div style="font-weight: 600; color: var(--slate-900); font-size: 14px;">
          ${escapeHtml(dept.department_name)}
        </div>
      </td>
      <td style="max-width: 260px; color: var(--slate-600); font-size: 13px;">
        ${descPreview}
      </td>
      <td>
        <span class="badge ${studentBadgeClass}" style="font-weight: 600;">
          ${dept.student_count || 0}
        </span>
      </td>
      <td>
        <span class="badge ${teacherBadgeClass}" style="font-weight: 600;">
          ${dept.teacher_count || 0}
        </span>
      </td>
      <td>
        <span class="badge ${courseBadgeClass}" style="font-weight: 600;">
          ${dept.course_count || 0}
        </span>
      </td>
      <td>
        <span class="status-pill ${statusClass}">${statusLabel}</span>
      </td>
      <td>
        <div class="action-buttons-group" style="justify-content: flex-end;">
          <button type="button" class="btn-action btn-action-view" title="View details" onclick="viewDepartment(${dept.department_id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-edit" title="Edit department" onclick="editDepartment(${dept.department_id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-status" title="${toggleTitle}" onclick="promptToggleStatus(${dept.department_id}, ${isActive}, '${escapeHtml(dept.department_code)}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
              <line x1="12" y1="2" x2="12" y2="12"></line>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-delete" title="Delete department" onclick="promptDeleteDepartment(${dept.department_id}, '${escapeHtml(dept.department_code)}', ${dept.student_count || 0}, ${dept.teacher_count || 0}, ${dept.course_count || 0})">
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
 * View Department Details Modal
 */
window.viewDepartment = async function(departmentId) {
  let dept = cachedDepartments.find(d => d.department_id === departmentId);
  if (!dept) {
    try {
      const res = await apiRequest(`/departments/${departmentId}`);
      if (res.ok && res.data && res.data.data) {
        dept = res.data.data.department;
      }
    } catch (e) {}
  }

  if (!dept) {
    showToast('Unable to load department details', 'error');
    return;
  }

  const createdFormatted = typeof formatDateTime === 'function' ? formatDateTime(dept.created_at) : dept.created_at;
  const updatedFormatted = typeof formatDateTime === 'function' ? formatDateTime(dept.updated_at) : dept.updated_at;

  document.getElementById('viewDeptName').textContent = dept.department_name;
  document.getElementById('viewDeptCode').textContent = dept.department_code;

  const statusEl = document.getElementById('viewDeptStatus');
  if (statusEl) {
    statusEl.textContent = dept.is_active ? 'Active' : 'Inactive';
    statusEl.className = `status-pill ${dept.is_active ? 'status-active' : 'status-inactive'}`;
  }

  document.getElementById('viewDeptCodeVal').textContent = dept.department_code;
  document.getElementById('viewDeptNameVal').textContent = dept.department_name;
  document.getElementById('viewDeptDescVal').textContent = dept.description || 'No description provided.';
  document.getElementById('viewDeptCreatedVal').textContent = createdFormatted;
  document.getElementById('viewDeptUpdatedVal').textContent = updatedFormatted;

  document.getElementById('viewDeptStudentsCount').textContent = dept.student_count || 0;
  document.getElementById('viewDeptTeachersCount').textContent = dept.teacher_count || 0;
  document.getElementById('viewDeptCoursesCount').textContent = dept.course_count || 0;

  openModal('viewDeptModal');
};

/**
 * Edit Department Modal Trigger
 */
window.editDepartment = async function(departmentId) {
  let dept = cachedDepartments.find(d => d.department_id === departmentId);
  if (!dept) {
    try {
      const res = await apiRequest(`/departments/${departmentId}`);
      if (res.ok && res.data && res.data.data) {
        dept = res.data.data.department;
      }
    } catch (e) {}
  }

  if (!dept) {
    showToast('Unable to load department details', 'error');
    return;
  }

  hideModalAlert('editModalAlert');

  document.getElementById('editDeptId').value = dept.department_id;
  document.getElementById('editDeptCode').value = dept.department_code;
  document.getElementById('editDeptName').value = dept.department_name;
  document.getElementById('editDeptDesc').value = dept.description || '';
  document.getElementById('editDeptStatus').value = dept.is_active ? '1' : '0';

  openModal('editDeptModal');
};

/**
 * Prompt Department Status Toggle
 */
window.promptToggleStatus = function(departmentId, currentStatus, departmentCode) {
  const actionText = currentStatus ? 'deactivate' : 'activate';
  const modalMsg = `Are you sure you want to <strong>${actionText}</strong> the department <strong>${escapeHtml(departmentCode)}</strong>?`;

  document.getElementById('confirmModalTitle').textContent = `${currentStatus ? 'Deactivate' : 'Activate'} Department`;
  document.getElementById('confirmModalMessage').innerHTML = modalMsg;

  const actionBtn = document.getElementById('confirmModalActionBtn');
  actionBtn.textContent = currentStatus ? 'Deactivate' : 'Activate';
  actionBtn.className = currentStatus ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';

  pendingConfirmAction = async () => {
    try {
      const res = await apiRequest(`/departments/${departmentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !currentStatus })
      });

      if (res.ok && res.data && res.data.success) {
        closeModal('confirmModal');
        showToast(`Department ${actionText}d successfully`, 'success');
        await loadDepartments();
      } else {
        showToast(res.data?.message || 'Failed to update department status', 'error');
      }
    } catch (err) {
      showToast('Network error while updating status', 'error');
    }
  };

  openModal('confirmModal');
};

/**
 * Prompt Department Safe Deletion
 */
window.promptDeleteDepartment = function(departmentId, departmentCode, studentsCount, teachersCount, coursesCount) {
  const hasDependencies = (studentsCount > 0 || teachersCount > 0 || coursesCount > 0);
  let modalMsg = '';

  if (hasDependencies) {
    modalMsg = `
      <div style="margin-bottom: 10px; color: var(--danger-600); font-weight: 600;">
        Warning: Related records detected!
      </div>
      Department <strong>${escapeHtml(departmentCode)}</strong> currently has:
      <ul style="margin: 8px 0 12px 20px; font-size: 13px; color: var(--slate-700);">
        <li>${studentsCount} student profile(s)</li>
        <li>${teachersCount} teacher profile(s)</li>
        <li>${coursesCount} course(s)</li>
      </ul>
      <p style="font-size: 13px; color: var(--slate-600); margin: 0;">
        Deleting this department will be blocked to preserve data integrity. You can <strong>Deactivate</strong> this department instead.
      </p>
    `;
  } else {
    modalMsg = `Are you sure you want to permanently delete department <strong>${escapeHtml(departmentCode)}</strong>?<br><br><small style="color: var(--slate-500);">This action cannot be undone.</small>`;
  }

  document.getElementById('confirmModalTitle').textContent = 'Delete Department';
  document.getElementById('confirmModalMessage').innerHTML = modalMsg;

  const actionBtn = document.getElementById('confirmModalActionBtn');
  actionBtn.textContent = 'Delete Department';
  actionBtn.className = 'btn btn-danger btn-sm';

  pendingConfirmAction = async () => {
    try {
      const res = await apiRequest(`/departments/${departmentId}`, {
        method: 'DELETE'
      });

      if (res.ok && res.data && res.data.success) {
        closeModal('confirmModal');
        showToast('Department deleted successfully', 'success');
        await loadDepartments();
      } else {
        closeModal('confirmModal');
        showToast(res.data?.message || 'Failed to delete department', 'error');
      }
    } catch (err) {
      closeModal('confirmModal');
      showToast('Network error while deleting department', 'error');
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

  // Add Department Form
  const addForm = document.getElementById('addDeptForm');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const codeInput = document.getElementById('addDeptCode');
      const nameInput = document.getElementById('addDeptName');
      const descInput = document.getElementById('addDeptDesc');
      const statusInput = document.getElementById('addDeptStatus');

      const department_code = codeInput ? codeInput.value.trim().toUpperCase() : '';
      const department_name = nameInput ? nameInput.value.trim() : '';
      const description = descInput ? descInput.value.trim() : '';
      const is_active = statusInput ? statusInput.value === '1' : true;

      if (!department_code || !department_name) {
        showModalAlert('addModalAlert', 'Department code and name are required.');
        return;
      }

      if (department_code.length > 20) {
        showModalAlert('addModalAlert', 'Department code cannot exceed 20 characters.');
        return;
      }

      if (department_name.length > 100) {
        showModalAlert('addModalAlert', 'Department name cannot exceed 100 characters.');
        return;
      }

      if (!/^[A-Z0-9_-]+$/.test(department_code)) {
        showModalAlert('addModalAlert', 'Department code can only contain letters, numbers, hyphens, and underscores.');
        return;
      }

      const submitBtn = document.getElementById('submitAddDeptBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
      }

      try {
        const payload = {
          department_code,
          department_name,
          description: description || null,
          is_active
        };

        const res = await apiRequest('/departments', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('addDeptModal');
          showToast('Department created successfully', 'success');
          await loadDepartments();
        } else {
          showModalAlert('addModalAlert', res.data?.message || 'Failed to create department.');
        }
      } catch (err) {
        showModalAlert('addModalAlert', 'A network error occurred. Please try again.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Department';
        }
      }
    });
  }

  // Edit Department Form
  const editForm = document.getElementById('editDeptForm');
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const deptId = document.getElementById('editDeptId').value;
      const codeInput = document.getElementById('editDeptCode');
      const nameInput = document.getElementById('editDeptName');
      const descInput = document.getElementById('editDeptDesc');
      const statusInput = document.getElementById('editDeptStatus');

      const department_code = codeInput ? codeInput.value.trim().toUpperCase() : '';
      const department_name = nameInput ? nameInput.value.trim() : '';
      const description = descInput ? descInput.value.trim() : '';
      const is_active = statusInput ? statusInput.value === '1' : true;

      if (!department_code || !department_name) {
        showModalAlert('editModalAlert', 'Department code and name are required.');
        return;
      }

      if (department_code.length > 20) {
        showModalAlert('editModalAlert', 'Department code cannot exceed 20 characters.');
        return;
      }

      if (department_name.length > 100) {
        showModalAlert('editModalAlert', 'Department name cannot exceed 100 characters.');
        return;
      }

      if (!/^[A-Z0-9_-]+$/.test(department_code)) {
        showModalAlert('editModalAlert', 'Department code can only contain letters, numbers, hyphens, and underscores.');
        return;
      }

      const submitBtn = document.getElementById('submitEditDeptBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
      }

      try {
        const payload = {
          department_code,
          department_name,
          description: description || null,
          is_active
        };

        const res = await apiRequest(`/departments/${deptId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('editDeptModal');
          showToast('Department updated successfully', 'success');
          await loadDepartments();
        } else {
          showModalAlert('editModalAlert', res.data?.message || 'Failed to update department.');
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
