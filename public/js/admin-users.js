/**
 * Admin User Management Controller
 * Student Information Portal
 */

// State Management
let currentPage = 1;
const pageSize = 10;
let searchQuery = '';
let selectedRole = '';
let selectedStatus = '';
let availableRoles = [];
let cachedUsers = [];
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

  // 4. Load Roles and Users
  await loadRoles();
  await loadUsers();
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
  const searchInput = document.getElementById('userSearchInput');
  const roleSelect = document.getElementById('roleFilterSelect');
  const statusSelect = document.getElementById('statusFilterSelect');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const openAddBtn = document.getElementById('openAddUserBtn');

  // Search with debounce
  let debounceTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        searchQuery = e.target.value.trim();
        currentPage = 1;
        loadUsers();
      }, 300);
    });
  }

  // Role filter
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      selectedRole = e.target.value;
      currentPage = 1;
      loadUsers();
    });
  }

  // Status filter
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      selectedStatus = e.target.value;
      currentPage = 1;
      loadUsers();
    });
  }

  // Pagination Previous
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadUsers();
      }
    });
  }

  // Pagination Next
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      currentPage++;
      loadUsers();
    });
  }

  // Open Add User Modal
  if (openAddBtn) {
    openAddBtn.addEventListener('click', () => {
      const form = document.getElementById('addUserForm');
      if (form) form.reset();
      hideModalAlert('addModalAlert');
      openModal('addUserModal');
    });
  }
}

/**
 * Load Roles from Backend
 */
async function loadRoles() {
  try {
    const res = await apiRequest('/users/roles');
    if (res.ok && res.data && res.data.success && res.data.data) {
      availableRoles = res.data.data.roles || [];
      populateRoleDropdowns(availableRoles);
    }
  } catch (err) {
    console.error('Error loading roles:', err);
  }
}

function populateRoleDropdowns(roles) {
  const addSelect = document.getElementById('addRoleSelect');
  const editSelect = document.getElementById('editRoleSelect');

  const optionsHtml = [
    '<option value="">Select Role</option>',
    ...roles.map(r => `<option value="${r.role_id}">${escapeHtml(r.role_name)}</option>`)
  ].join('');

  if (addSelect) addSelect.innerHTML = optionsHtml;
  if (editSelect) editSelect.innerHTML = optionsHtml;
}

/**
 * Load and Render Users
 */
async function loadUsers() {
  const tableBody = document.getElementById('usersTableBody');
  const emptyState = document.getElementById('usersTableEmpty');
  const paginationInfo = document.getElementById('paginationInfo');
  const pageIndicator = document.getElementById('pageIndicator');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  // Build query parameters
  const queryParams = new URLSearchParams();
  queryParams.append('page', String(currentPage));
  queryParams.append('limit', String(pageSize));
  if (searchQuery) queryParams.append('search', searchQuery);
  if (selectedRole) queryParams.append('role', selectedRole);
  if (selectedStatus !== '') queryParams.append('status', selectedStatus);

  try {
    const res = await apiRequest(`/users?${queryParams.toString()}`);

    if (res.ok && res.data && res.data.success && res.data.data) {
      const { users, pagination } = res.data.data;
      cachedUsers = users || [];

      // Render table rows
      if (cachedUsers.length === 0) {
        if (tableBody) tableBody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
      } else {
        if (emptyState) emptyState.classList.add('hidden');
        if (tableBody) {
          tableBody.innerHTML = cachedUsers.map(user => renderUserRow(user)).join('');
        }
      }

      // Update pagination
      const total = pagination.total;
      const totalPages = pagination.totalPages;
      const startCount = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
      const endCount = Math.min(total, currentPage * pageSize);

      if (paginationInfo) {
        paginationInfo.textContent = `Showing ${startCount} to ${endCount} of ${total} users`;
      }
      if (pageIndicator) {
        pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
      }
      if (prevBtn) prevBtn.disabled = currentPage <= 1;
      if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    } else {
      showToast(res.data?.message || 'Failed to load users', 'error');
    }
  } catch (err) {
    console.error('Error fetching users:', err);
    showToast('Network error while loading users', 'error');
  }
}

/**
 * Render single user table row HTML
 */
function renderUserRow(user) {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const initial = (user.first_name ? user.first_name[0] : (user.username ? user.username[0] : 'U')).toUpperCase();

  let roleBadgeClass = 'badge-admin';
  if (user.role === 'TEACHER') roleBadgeClass = 'badge-teacher';
  else if (user.role === 'STUDENT') roleBadgeClass = 'badge-student';

  const isActive = Boolean(user.is_active);
  const statusClass = isActive ? 'status-active' : 'status-inactive';
  const statusLabel = isActive ? 'Active' : 'Inactive';
  const toggleTitle = isActive ? 'Deactivate user' : 'Activate user';

  const createdDisplay = typeof formatDate === 'function' ? formatDate(user.created_at) : (user.created_at || '—');

  return `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-cell-avatar">${initial}</div>
          <span class="user-cell-name">${escapeHtml(fullName)}</span>
        </div>
      </td>
      <td><code>${escapeHtml(user.username)}</code></td>
      <td>${escapeHtml(user.email)}</td>
      <td><span class="badge ${roleBadgeClass}">${escapeHtml(user.role)}</span></td>
      <td>${escapeHtml(user.phone || '—')}</td>
      <td>
        <span class="status-pill ${statusClass}">
          <span class="status-dot"></span>
          <span>${statusLabel}</span>
        </span>
      </td>
      <td>${escapeHtml(createdDisplay)}</td>
      <td>
        <div class="action-buttons-group" style="justify-content: flex-end;">
          <button type="button" class="btn-action btn-action-view" title="View details" onclick="viewUser(${user.user_id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-edit" title="Edit user" onclick="editUser(${user.user_id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-status" title="${toggleTitle}" onclick="promptToggleStatus(${user.user_id}, ${isActive}, '${escapeHtml(user.username)}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
              <line x1="12" y1="2" x2="12" y2="12"></line>
            </svg>
          </button>
          <button type="button" class="btn-action btn-action-delete" title="Delete user" onclick="promptDeleteUser(${user.user_id}, '${escapeHtml(user.username)}')">
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
 * View User Profile Modal
 */
window.viewUser = async function(userId) {
  let user = cachedUsers.find(u => u.user_id === userId);
  if (!user) {
    try {
      const res = await apiRequest(`/users/${userId}`);
      if (res.ok && res.data && res.data.data) {
        user = res.data.data.user;
      }
    } catch (e) {}
  }

  if (!user) {
    showToast('Unable to load user details', 'error');
    return;
  }

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const createdFormatted = typeof formatDateTime === 'function' ? formatDateTime(user.created_at) : user.created_at;

  document.getElementById('viewUserId').textContent = user.user_id;
  document.getElementById('viewFullName').textContent = fullName;
  document.getElementById('viewUsername').textContent = user.username;
  document.getElementById('viewEmail').textContent = user.email;
  document.getElementById('viewPhone').textContent = user.phone || '—';

  const roleBadge = document.getElementById('viewRoleBadge');
  if (roleBadge) {
    roleBadge.textContent = user.role;
    roleBadge.className = 'badge';
    if (user.role === 'ADMIN') roleBadge.classList.add('badge-admin');
    else if (user.role === 'TEACHER') roleBadge.classList.add('badge-teacher');
    else if (user.role === 'STUDENT') roleBadge.classList.add('badge-student');
  }

  const statusEl = document.getElementById('viewStatus');
  if (statusEl) {
    statusEl.textContent = user.is_active ? 'Active' : 'Inactive';
    statusEl.style.color = user.is_active ? '#047857' : '#b91c1c';
    statusEl.style.fontWeight = '600';
  }

  document.getElementById('viewCreated').textContent = createdFormatted;

  openModal('viewUserModal');
};

/**
 * Edit User Modal Trigger
 */
window.editUser = async function(userId) {
  let user = cachedUsers.find(u => u.user_id === userId);
  if (!user) {
    try {
      const res = await apiRequest(`/users/${userId}`);
      if (res.ok && res.data && res.data.data) {
        user = res.data.data.user;
      }
    } catch (e) {}
  }

  if (!user) {
    showToast('Unable to load user details', 'error');
    return;
  }

  hideModalAlert('editModalAlert');

  document.getElementById('editUserId').value = user.user_id;
  document.getElementById('editFirstName').value = user.first_name || '';
  document.getElementById('editLastName').value = user.last_name || '';
  document.getElementById('editUsername').value = user.username || '';
  document.getElementById('editEmail').value = user.email || '';
  document.getElementById('editPhone').value = user.phone || '';
  document.getElementById('editRoleSelect').value = String(user.role_id);
  document.getElementById('editStatusSelect').value = user.is_active ? '1' : '0';
  document.getElementById('editPassword').value = ''; // Never pre-fill password

  openModal('editUserModal');
};

/**
 * Prompt User Status Toggle
 */
window.promptToggleStatus = function(userId, currentStatus, username) {
  if (activeAdmin && activeAdmin.user_id === userId && currentStatus) {
    showToast('Cannot deactivate your own administrator account', 'error');
    return;
  }

  const actionText = currentStatus ? 'deactivate' : 'activate';
  const modalMsg = `Are you sure you want to <strong>${actionText}</strong> the user account <strong>${username}</strong>?`;

  document.getElementById('confirmModalTitle').textContent = `${currentStatus ? 'Deactivate' : 'Activate'} User`;
  document.getElementById('confirmModalMessage').innerHTML = modalMsg;

  const actionBtn = document.getElementById('confirmModalActionBtn');
  actionBtn.textContent = currentStatus ? 'Deactivate' : 'Activate';
  actionBtn.className = currentStatus ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';

  pendingConfirmAction = async () => {
    try {
      const res = await apiRequest(`/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !currentStatus })
      });

      if (res.ok && res.data && res.data.success) {
        closeModal('confirmModal');
        showToast(`User account ${actionText}d successfully`, 'success');
        await loadUsers();
      } else {
        showToast(res.data?.message || 'Failed to update user status', 'error');
      }
    } catch (err) {
      showToast('Network error while updating status', 'error');
    }
  };

  openModal('confirmModal');
};

/**
 * Prompt User Safe Deletion
 */
window.promptDeleteUser = function(userId, username) {
  if (activeAdmin && activeAdmin.user_id === userId) {
    showToast('Cannot delete your own administrator account', 'error');
    return;
  }

  const modalMsg = `Are you sure you want to permanently delete user <strong>${username}</strong>?<br><br><small class="text-muted">Note: If this user is associated with academic records (courses, attendance, grades, etc.), deletion will be safely blocked.</small>`;

  document.getElementById('confirmModalTitle').textContent = 'Delete User';
  document.getElementById('confirmModalMessage').innerHTML = modalMsg;

  const actionBtn = document.getElementById('confirmModalActionBtn');
  actionBtn.textContent = 'Delete User';
  actionBtn.className = 'btn btn-danger btn-sm';

  pendingConfirmAction = async () => {
    try {
      const res = await apiRequest(`/users/${userId}`, {
        method: 'DELETE'
      });

      if (res.ok && res.data && res.data.success) {
        closeModal('confirmModal');
        showToast('User deleted successfully', 'success');
        await loadUsers();
      } else {
        closeModal('confirmModal');
        showToast(res.data?.message || 'Failed to delete user', 'error');
      }
    } catch (err) {
      closeModal('confirmModal');
      showToast('Network error while deleting user', 'error');
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

  // Add User Form
  const addForm = document.getElementById('addUserForm');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const firstName = document.getElementById('addFirstName').value.trim();
      const lastName = document.getElementById('addLastName').value.trim();
      const username = document.getElementById('addUsername').value.trim();
      const email = document.getElementById('addEmail').value.trim();
      const roleId = document.getElementById('addRoleSelect').value;
      const phone = document.getElementById('addPhone').value.trim();
      const password = document.getElementById('addPassword').value;
      const isActive = document.getElementById('addStatusSelect').value === '1';

      if (!firstName || !lastName || !username || !email || !roleId || !password) {
        showModalAlert('addModalAlert', 'Please fill in all required fields.');
        return;
      }

      if (password.length < 6) {
        showModalAlert('addModalAlert', 'Password must be at least 6 characters long.');
        return;
      }

      const saveBtn = document.getElementById('saveAddUserBtn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Creating...';
      }

      try {
        const res = await apiRequest('/users', {
          method: 'POST',
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            username,
            email,
            password,
            role_id: parseInt(roleId, 10),
            phone: phone || null,
            is_active: isActive
          })
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('addUserModal');
          showToast('User created successfully', 'success');
          await loadUsers();
        } else {
          showModalAlert('addModalAlert', res.data?.message || 'Failed to create user');
        }
      } catch (err) {
        showModalAlert('addModalAlert', 'Network communication error');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Create User';
        }
      }
    });
  }

  // Edit User Form
  const editForm = document.getElementById('editUserForm');
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const userId = document.getElementById('editUserId').value;
      const firstName = document.getElementById('editFirstName').value.trim();
      const lastName = document.getElementById('editLastName').value.trim();
      const username = document.getElementById('editUsername').value.trim();
      const email = document.getElementById('editEmail').value.trim();
      const roleId = document.getElementById('editRoleSelect').value;
      const phone = document.getElementById('editPhone').value.trim();
      const password = document.getElementById('editPassword').value;
      const isActive = document.getElementById('editStatusSelect').value === '1';

      if (!firstName || !lastName || !username || !email || !roleId) {
        showModalAlert('editModalAlert', 'Please fill in all required fields.');
        return;
      }

      if (password && password.length < 6) {
        showModalAlert('editModalAlert', 'New password must be at least 6 characters long.');
        return;
      }

      const saveBtn = document.getElementById('saveEditUserBtn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      const updatePayload = {
        first_name: firstName,
        last_name: lastName,
        username,
        email,
        role_id: parseInt(roleId, 10),
        phone: phone || null,
        is_active: isActive
      };

      if (password) {
        updatePayload.password = password;
      }

      try {
        const res = await apiRequest(`/users/${userId}`, {
          method: 'PUT',
          body: JSON.stringify(updatePayload)
        });

        if (res.ok && res.data && res.data.success) {
          closeModal('editUserModal');
          showToast('User updated successfully', 'success');
          await loadUsers();
        } else {
          showModalAlert('editModalAlert', res.data?.message || 'Failed to update user');
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
