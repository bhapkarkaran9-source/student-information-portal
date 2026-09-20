/**
 * Global User Menu & Profile Operations - Student Information Portal
 * Provides unified, accessible, and reactive profile header controls across all roles:
 * - Clickable User Profile Popover (My Profile, Edit Profile, Change Password, Notifications, Logout)
 * - Notification Bell with real database unread badge
 * - Live Current User Data Binding (Zero mock data)
 * - Shared Modals for Edit Profile, Change Password, and Logout Confirmation
 * - Full IDOR Protection and Session Security
 */

(function () {
  'use strict';

  // State
  let currentUser = null;
  let unreadCount = 0;

  // Helpers
  function getStoredToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }

  function getStoredUser() {
    try {
      const u = localStorage.getItem('user') || sessionStorage.getItem('user');
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  }

  function setStoredUser(user) {
    if (!user) return;
    currentUser = user;
    try {
      localStorage.setItem('user', JSON.stringify(user));
      sessionStorage.setItem('user', JSON.stringify(user));
    } catch (e) {}
  }

  function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getUserRole() {
    if (currentUser && currentUser.role) return currentUser.role.toUpperCase();
    const stored = getStoredUser();
    if (stored && stored.role) return stored.role.toUpperCase();
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/admin/')) return 'ADMIN';
    if (path.includes('/teacher/')) return 'TEACHER';
    if (path.includes('/student/')) return 'STUDENT';
    return 'STUDENT';
  }

  function getRoleSlug() {
    return getUserRole().toLowerCase();
  }

  function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer') || document.getElementById('adminSharedToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3500);
  }

  function renderAvatarElement(el, photoUrl, initial, altText = 'User avatar') {
    if (typeof window.renderAvatarElement === 'function') {
      return window.renderAvatarElement(el, photoUrl, initial, altText);
    }
    if (!el) return;
    const cleanUrl = (photoUrl && typeof photoUrl === 'string') ? photoUrl.trim() : '';
    const cleanInitial = (initial || 'U').toString().trim().toUpperCase() || 'U';

    if (cleanUrl) {
      const existingImg = el.querySelector('img');
      if (existingImg && (existingImg.getAttribute('src') === cleanUrl || existingImg.src.endsWith(cleanUrl))) {
        return;
      }
      if (existingImg) {
        existingImg.alt = altText;
        existingImg.onerror = function () {
          this.onerror = null;
          el.innerHTML = '';
          el.textContent = cleanInitial;
        };
        existingImg.src = cleanUrl;
        return;
      }
      const img = document.createElement('img');
      img.src = cleanUrl;
      img.alt = altText;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.borderRadius = 'inherit';
      img.style.display = 'block';
      img.onerror = function () {
        this.onerror = null;
        el.innerHTML = '';
        el.textContent = cleanInitial;
      };
      el.innerHTML = '';
      el.appendChild(img);
    } else {
      const existingImg = el.querySelector('img');
      if (existingImg || el.textContent !== cleanInitial) {
        el.innerHTML = '';
        el.textContent = cleanInitial;
      }
    }
  }

  // ==========================================================================
  // Core Controller Object
  // ==========================================================================
  const UserMenu = {
    /**
     * Initialize Global User Menu on the page
     */
    async initializeUserMenu() {
      // 1. Check Authentication Guard on authenticated pages
      const token = getStoredToken();
      const path = window.location.pathname;
      const isAuthPage = path.includes('/pages/admin/') || path.includes('/pages/teacher/') || path.includes('/pages/student/');

      if (isAuthPage && !token) {
        window.location.replace('/login.html');
        return;
      }

      // Early synchronous hydration from cached user to eliminate any flash/flicker
      const cached = getStoredUser();
      if (cached) {
        currentUser = cached;
        this.renderUserInfo(cached);
      }

      // 2. Inject CSS if needed for modals and dropdown
      this.injectStyles();

      // 3. Inject Shared Modals into document.body
      this.injectSharedModals();

      // 4. Standardize Header Profile Structure
      this.mountHeaderElements();

      // If we have cached user, ensure newly mounted elements get populated immediately
      if (cached) {
        this.renderUserInfo(cached);
      }

      // 5. Wire Dropdown Events (Click, Outside Click, Escape key)
      this.bindDropdownEvents();

      // 6. Wire Modals Events
      this.bindModalEvents();

      // 7. Listen for Reactive User Profile Updates (e.g. photo changes)
      window.addEventListener('user-profile-updated', (event) => {
        const updatedUser = (event.detail && event.detail.user) || getStoredUser();
        if (updatedUser) {
          setStoredUser(updatedUser);
          this.renderUserInfo(updatedUser);
        }
      });

      // 8. Load Current User Data from Backend
      await this.loadCurrentUser();

      // 9. Update Unread Notification Count
      await this.updateUnreadNotificationCount();
    },

    /**
     * Load current authenticated user data from backend API
     */
    async loadCurrentUser() {
      const token = getStoredToken();
      if (!token) return null;

      try {
        const res = await fetch('/api/users/me', {
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          }
        });

        if (res.status === 401 || res.status === 403) {
          // Token expired or invalid
          this.purgeSessionAndRedirect();
          return null;
        }

        const data = await res.json();
        if (data && data.data && data.data.user) {
          setStoredUser(data.data.user);
          this.renderUserInfo(data.data.user);
          return data.data.user;
        }
      } catch (err) {
        console.warn('Could not fetch fresh user profile from backend, using cached session:', err);
      }

      // Fallback to cached user
      const cached = getStoredUser();
      if (cached) {
        currentUser = cached;
        this.renderUserInfo(cached);
      }
      return currentUser;
    },

    /**
     * Render user info across header, dropdown, and sidebar elements
     */
    renderUserInfo(user) {
      if (!user) return;

      const fName = user.first_name || '';
      const lName = user.last_name || '';
      const fullName = (fName + ' ' + lName).trim() || user.username || 'User';
      const initial = (fName ? fName[0] : (user.username ? user.username[0] : 'U')).toUpperCase();
      const role = (user.role || getUserRole()).toUpperCase();
      const photoUrl = user.profile_photo_url || null;

      // 1. Header Profile Button Elements
      const avatarEls = document.querySelectorAll('#headerUserAvatar, #headerAdminAvatar, #headerTeacherAvatar, .header-avatar');
      avatarEls.forEach(el => {
        if (!el.id || el.id !== 'profileLargeAvatar') {
          renderAvatarElement(el, photoUrl, initial, fullName + ' avatar');
        }
      });

      const nameEls = document.querySelectorAll('#navUserName, #headerAdminName, #headerTeacherName, .header-profile-name');
      nameEls.forEach(el => el.textContent = fullName);

      const badgeEls = document.querySelectorAll('#userRoleBadge, .header-profile-badge, .header-admin-badge');
      badgeEls.forEach(el => el.textContent = role);

      const greetingEls = document.querySelectorAll('#headerGreetingName, #welcomeUserName');
      greetingEls.forEach(el => el.textContent = fName || fullName);

      // 2. Dropdown Header Elements
      const dropName = document.getElementById('dropdownUserName') || document.getElementById('dropdownAdminName');
      if (dropName) dropName.textContent = fullName;

      const dropUsername = document.getElementById('dropdownUserUsername');
      if (dropUsername) dropUsername.textContent = '@' + user.username;

      const dropRole = document.getElementById('dropdownUserRoleBadge');
      if (dropRole) dropRole.textContent = role;

      const dropEmail = document.getElementById('dropdownUserEmail') || document.getElementById('dropdownAdminEmail');
      if (dropEmail) dropEmail.textContent = user.email || '';

      // 3. Sidebar user elements
      const sideName = document.getElementById('sidebarUserName') || document.getElementById('sidebarAdminName');
      if (sideName) sideName.textContent = fullName;

      const sideAvatar = document.getElementById('sidebarAvatar') || document.getElementById('sidebarAdminAvatar');
      if (sideAvatar) renderAvatarElement(sideAvatar, photoUrl, initial, fullName + ' avatar');

      const sideRole = document.getElementById('sidebarAdminEmail');
      if (sideRole) sideRole.textContent = user.email || (role + ' Account');

      // 4. If current page is Profile page, populate profile fields
      this.populateProfilePageFields(user);
    },

    /**
     * Populate profile fields if on a profile page
     */
    populateProfilePageFields(user) {
      if (!user) return;
      const fullName = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || user.username;
      const initial = (user.first_name ? user.first_name[0] : (user.username ? user.username[0] : 'U')).toUpperCase();
      const photoUrl = user.profile_photo_url || null;

      const largeAvatar = document.getElementById('profileLargeAvatar');
      if (largeAvatar) renderAvatarElement(largeAvatar, photoUrl, initial, fullName + ' profile photo');

      const profFullName = document.getElementById('profFullName');
      if (profFullName) profFullName.textContent = fullName;

      const detFullName = document.getElementById('detFullName');
      if (detFullName) detFullName.textContent = fullName;

      const detUsername = document.getElementById('detUsername');
      if (detUsername) detUsername.textContent = user.username;

      const detEmail = document.getElementById('detEmail') || document.getElementById('profileEmail');
      if (detEmail) detEmail.textContent = user.email || 'Not Provided';

      const detPhone = document.getElementById('detPhone') || document.getElementById('profilePhone');
      if (detPhone) detPhone.textContent = user.phone || 'Not Provided';

      const detRole = document.getElementById('detRole') || document.getElementById('profileRole');
      if (detRole) detRole.textContent = user.role || getUserRole();

      const detStatus = document.getElementById('detStatus') || document.getElementById('profileStatus');
      if (detStatus) detStatus.textContent = user.is_active ? 'Active' : 'Inactive';

      const detDept = document.getElementById('detDept') || document.getElementById('profileDept');
      if (detDept) detDept.textContent = user.department_name || (user.role === 'ADMIN' ? 'System Administration' : 'Not Assigned');

      const detCreatedAt = document.getElementById('detCreatedAt') || document.getElementById('profileCreatedAt');
      if (detCreatedAt && user.created_at) {
        try {
          detCreatedAt.textContent = new Date(user.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        } catch (e) {
          detCreatedAt.textContent = user.created_at;
        }
      }
    },

    /**
     * Open User Menu Dropdown
     */
    openUserMenu() {
      const menu = document.getElementById('profileDropdownMenu');
      const trigger = document.getElementById('profileDropdownBtn') || document.getElementById('profileDropdownTrigger');
      if (menu) {
        menu.classList.add('show');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
      }
    },

    /**
     * Close User Menu Dropdown
     */
    closeUserMenu() {
      const menu = document.getElementById('profileDropdownMenu');
      const trigger = document.getElementById('profileDropdownBtn') || document.getElementById('profileDropdownTrigger');
      if (menu) {
        menu.classList.remove('show');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
    },

    /**
     * Open My Profile page
     */
    openProfile() {
      this.closeUserMenu();
      const role = getRoleSlug();
      window.location.href = `/pages/${role}/profile.html`;
    },

    /**
     * Open Edit Profile Modal
     */
    openEditProfile() {
      this.closeUserMenu();
      const user = currentUser || getStoredUser() || {};
      const modal = document.getElementById('userMenuEditProfileModal');
      if (!modal) return;

      const fNameInput = document.getElementById('userMenuEditFirstName');
      const lNameInput = document.getElementById('userMenuEditLastName');
      const emailInput = document.getElementById('userMenuEditEmail');
      const phoneInput = document.getElementById('userMenuEditPhone');
      const alertBox = document.getElementById('userMenuEditAlert');

      if (alertBox) {
        alertBox.textContent = '';
        alertBox.classList.add('hidden');
      }

      if (fNameInput) fNameInput.value = user.first_name || '';
      if (lNameInput) lNameInput.value = user.last_name || '';
      if (emailInput) emailInput.value = user.email || '';
      if (phoneInput) phoneInput.value = user.phone || '';

      modal.classList.remove('hidden');
      if (fNameInput) fNameInput.focus();
    },

    /**
     * Open Change Password Modal
     */
    openChangePassword() {
      this.closeUserMenu();
      const modal = document.getElementById('userMenuChangePasswordModal');
      if (!modal) return;

      const curInput = document.getElementById('userMenuPassCurrent');
      const newInput = document.getElementById('userMenuPassNew');
      const cfmInput = document.getElementById('userMenuPassConfirm');
      const alertBox = document.getElementById('userMenuPassAlert');

      if (alertBox) {
        alertBox.textContent = '';
        alertBox.classList.add('hidden');
      }

      if (curInput) curInput.value = '';
      if (newInput) newInput.value = '';
      if (cfmInput) cfmInput.value = '';

      modal.classList.remove('hidden');
      if (curInput) curInput.focus();
    },

    /**
     * Open Notifications page
     */
    openNotifications() {
      this.closeUserMenu();
      const role = getRoleSlug();
      window.location.href = `/pages/${role}/notifications.html`;
    },

    /**
     * Open Logout Confirmation Modal
     */
    logoutUser() {
      this.closeUserMenu();
      const modal = document.getElementById('userMenuLogoutModal');
      if (modal) {
        modal.classList.remove('hidden');
      } else {
        if (confirm('Are you sure you want to logout?')) {
          this.executeLogout();
        }
      }
    },

    /**
     * Perform Real Logout
     */
    async executeLogout() {
      const token = getStoredToken();
      try {
        if (token) {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json'
            }
          });
        }
      } catch (e) {}

      this.purgeSessionAndRedirect();
    },

    /**
     * Purge all tokens and cached state, preventing browser back button navigation
     */
    purgeSessionAndRedirect(message = null) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.clear();

      let target = '/login.html';
      if (message) {
        target += '?msg=' + encodeURIComponent(message);
      }
      window.location.replace(target);
    },

    /**
     * Update Unread Notification Count from Backend
     */
    async updateUnreadNotificationCount() {
      const token = getStoredToken();
      if (!token) return;

      try {
        const res = await fetch('/api/notifications/unread-count', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          const json = await res.json();
          unreadCount = (json.data && typeof json.data.count === 'number') ? json.data.count : 0;
          this.renderNotificationBadge(unreadCount);
        }
      } catch (err) {
        // Silently handle if unread-count not reachable
      }
    },

    renderNotificationBadge(count) {
      const badgeEls = document.querySelectorAll('#headerNotificationDot, .header-notify-badge, #notificationCountBadge');
      badgeEls.forEach(badge => {
        if (count > 0) {
          badge.textContent = count > 99 ? '99+' : String(count);
          badge.classList.remove('hidden');
          badge.style.display = 'inline-flex';
        } else {
          badge.textContent = '';
          badge.style.display = 'none';
          badge.classList.add('hidden');
        }
      });
    },

    /**
     * Mount standardized Header profile and notification elements
     */
    mountHeaderElements() {
      // Find header right container
      const headerRight = document.querySelector('.header-right') || document.querySelector('.navbar-right');
      if (!headerRight) return;

      // Ensure strictly ONE notification button exists in headerRight
      const existingBells = headerRight.querySelectorAll('#headerNotificationBtn, .header-notify-btn, .header-notification-btn, [aria-label="Notifications"]');
      let notifyBtn = document.getElementById('headerNotificationBtn');

      if (existingBells.length > 1) {
        existingBells.forEach((btn, idx) => {
          if (idx === 0) {
            notifyBtn = btn;
          } else {
            btn.remove();
          }
        });
      } else if (existingBells.length === 1) {
        notifyBtn = existingBells[0];
      }

      if (notifyBtn) {
        notifyBtn.id = 'headerNotificationBtn';
        if (!notifyBtn.classList.contains('header-notify-btn')) {
          notifyBtn.classList.add('header-notify-btn');
        }
      } else {
        notifyBtn = document.createElement('button');
        notifyBtn.type = 'button';
        notifyBtn.id = 'headerNotificationBtn';
        notifyBtn.className = 'header-notify-btn';
        notifyBtn.setAttribute('title', 'View notifications');
        notifyBtn.setAttribute('aria-label', 'Notifications');
        notifyBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <span id="headerNotificationDot" class="header-notify-badge hidden"></span>
        `;
        headerRight.insertBefore(notifyBtn, headerRight.firstChild);
      }

      notifyBtn.onclick = (e) => {
        e.preventDefault();
        this.openNotifications();
      };

      // Ensure Profile Dropdown wrapper exists
      let wrapper = document.getElementById('profileDropdownWrapper') || headerRight.querySelector('.profile-dropdown-wrapper');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'profile-dropdown-wrapper';
        wrapper.id = 'profileDropdownWrapper';
        headerRight.appendChild(wrapper);
      }

      const role = getUserRole();
      const initial = role[0];

      // Standardize Dropdown Trigger Button
      let trigger = document.getElementById('profileDropdownBtn') || document.getElementById('profileDropdownTrigger');
      if (!trigger) {
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.id = 'profileDropdownBtn';
        trigger.className = 'header-profile-btn';
        trigger.setAttribute('aria-haspopup', 'true');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-label', 'User profile menu');
        trigger.innerHTML = `
          <div class="header-avatar" id="headerUserAvatar">${initial}</div>
          <div class="header-profile-meta">
            <span class="header-profile-name" id="navUserName">${role}</span>
            <span class="header-profile-badge" id="userRoleBadge">${role}</span>
          </div>
          <svg class="dropdown-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        `;
        wrapper.appendChild(trigger);
      }

      // Standardize Dropdown Menu Popover
      let menu = document.getElementById('profileDropdownMenu');
      if (!menu) {
        menu = document.createElement('div');
        menu.className = 'profile-dropdown-menu';
        menu.id = 'profileDropdownMenu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'User menu');
        wrapper.appendChild(menu);
      }

      // Populate standardized 5-item menu content
      menu.innerHTML = `
        <div class="dropdown-user-header" style="padding: 10px 12px; border-bottom: 1px solid var(--slate-100, #f1f5f9); margin-bottom: 4px;">
          <div style="font-weight: 700; font-size: 13.5px; color: var(--slate-900, #0f172a);" id="dropdownUserName">User Account</div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 3px;">
            <span style="font-size: 11.5px; color: var(--slate-500, #64748b);" id="dropdownUserUsername">@user</span>
            <span class="badge" id="dropdownUserRoleBadge" style="font-size: 10.5px; padding: 1px 6px; font-weight: 700; border-radius: 4px; background: #e0e7ff; color: #3730a3;">${role}</span>
          </div>
        </div>
        <button type="button" class="dropdown-item" id="userMenuItemProfile" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span>My Profile</span>
        </button>
        <button type="button" class="dropdown-item" id="userMenuItemEditProfile" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          <span>Edit Profile</span>
        </button>
        <button type="button" class="dropdown-item" id="userMenuItemChangePassword" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>Change Password</span>
        </button>
        <button type="button" class="dropdown-item" id="userMenuItemNotifications" role="menuitem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
          <span>Notifications</span>
        </button>
        <div class="dropdown-divider" style="height: 1px; background-color: var(--slate-100, #f1f5f9); margin: 4px 0;"></div>
        <button type="button" class="dropdown-item dropdown-item-danger" id="userMenuItemLogout" role="menuitem" style="color: #dc2626;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #ef4444;">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span>Logout</span>
        </button>
      `;

      // Wire items & aliases
      const profileButtons = document.querySelectorAll('#userMenuItemProfile, #dropdownMyProfile, #btnMyProfile');
      profileButtons.forEach(b => b.onclick = (e) => { e.preventDefault(); this.openProfile(); });

      const editButtons = document.querySelectorAll('#userMenuItemEditProfile, #dropdownEditProfile, #btnEditProfile');
      editButtons.forEach(b => b.onclick = (e) => { e.preventDefault(); this.openEditProfile(); });

      const passButtons = document.querySelectorAll('#userMenuItemChangePassword, #dropdownChangePassword, #btnChangePassword');
      passButtons.forEach(b => b.onclick = (e) => { e.preventDefault(); this.openChangePassword(); });

      const notifButtons = document.querySelectorAll('#userMenuItemNotifications, #dropdownNotifications, #btnNavNotifications');
      notifButtons.forEach(b => b.onclick = (e) => { e.preventDefault(); this.openNotifications(); });

      const logoutButtons = document.querySelectorAll('#userMenuItemLogout, #dropdownLogoutBtn, #logoutBtn, #sidebarLogoutBtn, .btn-sidebar-logout');
      logoutButtons.forEach(b => b.onclick = (e) => { e.preventDefault(); this.logoutUser(); });
    },

    /**
     * Bind Dropdown click, outside click, and Escape key events
     */
    bindDropdownEvents() {
      if (this._dropdownBound) return;
      this._dropdownBound = true;

      document.addEventListener('click', (e) => {
        const trigger = document.getElementById('profileDropdownBtn') || document.getElementById('profileDropdownTrigger');
        const menu = document.getElementById('profileDropdownMenu');

        if (!trigger || !menu) return;

        if (trigger.contains(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          const isOpen = menu.classList.contains('show');
          if (isOpen) {
            this.closeUserMenu();
          } else {
            this.openUserMenu();
          }
        } else if (!menu.contains(e.target)) {
          this.closeUserMenu();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeUserMenu();
          this.closeAllModals();
        }
      });
    },

    /**
     * Inject Shared Modals (Edit Profile, Change Password, Logout Confirmation)
     */
    injectSharedModals() {
      if (document.getElementById('userMenuSharedModalsContainer')) return;

      const container = document.createElement('div');
      container.id = 'userMenuSharedModalsContainer';

      container.innerHTML = `
        <!-- 1. Edit Profile Modal -->
        <div id="userMenuEditProfileModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="userMenuEditTitle">
          <div class="modal-card" style="max-width: 480px; width: 90%;">
            <div class="modal-header">
              <h3 id="userMenuEditTitle" class="modal-title">Edit Profile Information</h3>
              <button type="button" class="modal-close-btn" id="userMenuEditCloseBtn" aria-label="Close modal">&times;</button>
            </div>
            <div class="modal-body">
              <div id="userMenuEditAlert" class="alert alert-danger hidden" style="margin-bottom: 14px; padding: 10px; background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 6px; font-size: 13px; color: #991b1b;"></div>
              <form id="userMenuEditForm" onsubmit="return false;">
                <div class="modal-form-group" style="margin-bottom: 12px;">
                  <label for="userMenuEditFirstName" style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:#334155;">First Name *</label>
                  <input type="text" id="userMenuEditFirstName" class="form-input" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:13.5px; box-sizing:border-box;" required />
                </div>
                <div class="modal-form-group" style="margin-bottom: 12px;">
                  <label for="userMenuEditLastName" style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:#334155;">Last Name *</label>
                  <input type="text" id="userMenuEditLastName" class="form-input" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:13.5px; box-sizing:border-box;" required />
                </div>
                <div class="modal-form-group" style="margin-bottom: 12px;">
                  <label for="userMenuEditEmail" style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:#334155;">Email Address *</label>
                  <input type="email" id="userMenuEditEmail" class="form-input" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:13.5px; box-sizing:border-box;" required />
                </div>
                <div class="modal-form-group" style="margin-bottom: 12px;">
                  <label for="userMenuEditPhone" style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:#334155;">Phone Number</label>
                  <input type="tel" id="userMenuEditPhone" class="form-input" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:13.5px; box-sizing:border-box;" placeholder="+91 9876543210" />
                </div>
              </form>
            </div>
            <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px; padding-top:12px; border-top:1px solid #e2e8f0;">
              <button type="button" class="btn btn-secondary btn-sm" id="userMenuEditCancelBtn">Cancel</button>
              <button type="button" class="btn btn-primary btn-sm" id="userMenuEditSaveBtn">Save Changes</button>
            </div>
          </div>
        </div>

        <!-- 2. Change Password Modal -->
        <div id="userMenuChangePasswordModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="userMenuPassTitle">
          <div class="modal-card" style="max-width: 480px; width: 90%;">
            <div class="modal-header">
              <h3 id="userMenuPassTitle" class="modal-title">Change Password</h3>
              <button type="button" class="modal-close-btn" id="userMenuPassCloseBtn" aria-label="Close modal">&times;</button>
            </div>
            <div class="modal-body">
              <div id="userMenuPassAlert" class="alert alert-danger hidden" style="margin-bottom: 14px; padding: 10px; background: #fef2f2; border-left: 4px solid #ef4444; border-radius: 6px; font-size: 13px; color: #991b1b;"></div>
              <form id="userMenuPassForm" onsubmit="return false;">
                <div class="modal-form-group" style="margin-bottom: 12px;">
                  <label for="userMenuPassCurrent" style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:#334155;">Current Password *</label>
                  <input type="password" id="userMenuPassCurrent" class="form-input" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:13.5px; box-sizing:border-box;" required autocomplete="current-password" />
                </div>
                <div class="modal-form-group" style="margin-bottom: 12px;">
                  <label for="userMenuPassNew" style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:#334155;">New Password * (min 6 characters)</label>
                  <input type="password" id="userMenuPassNew" class="form-input" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:13.5px; box-sizing:border-box;" required minlength="6" autocomplete="new-password" />
                </div>
                <div class="modal-form-group" style="margin-bottom: 12px;">
                  <label for="userMenuPassConfirm" style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:#334155;">Confirm New Password *</label>
                  <input type="password" id="userMenuPassConfirm" class="form-input" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:13.5px; box-sizing:border-box;" required minlength="6" autocomplete="new-password" />
                </div>
              </form>
            </div>
            <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px; padding-top:12px; border-top:1px solid #e2e8f0;">
              <button type="button" class="btn btn-secondary btn-sm" id="userMenuPassCancelBtn">Cancel</button>
              <button type="button" class="btn btn-primary btn-sm" id="userMenuPassSaveBtn">Update Password</button>
            </div>
          </div>
        </div>

        <!-- 3. Logout Confirmation Modal -->
        <div id="userMenuLogoutModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="userMenuLogoutTitle">
          <div class="modal-card" style="max-width: 400px; width: 90%;">
            <div class="modal-header">
              <h3 id="userMenuLogoutTitle" class="modal-title">Confirm Logout</h3>
              <button type="button" class="modal-close-btn" id="userMenuLogoutCloseBtn" aria-label="Close modal">&times;</button>
            </div>
            <div class="modal-body">
              <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.5;">Are you sure you want to logout? You will need to enter your credentials to access the portal again.</p>
            </div>
            <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:8px; padding-top:12px; border-top:1px solid #e2e8f0;">
              <button type="button" class="btn btn-secondary btn-sm" id="userMenuLogoutCancelBtn">Cancel</button>
              <button type="button" class="btn btn-danger btn-sm" id="userMenuLogoutConfirmBtn" style="background:#dc2626; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer;">Logout</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(container);
    },

    closeAllModals() {
      const overlays = document.querySelectorAll('#userMenuSharedModalsContainer .modal-overlay, #adminSharedModalsRoot .modal-overlay');
      overlays.forEach(m => m.classList.add('hidden'));
    },

    /**
     * Bind submit and cancel events on shared modals
     */
    bindModalEvents() {
      if (this._modalsBound) return;
      this._modalsBound = true;

      // Edit Profile Modal
      const editModal = document.getElementById('userMenuEditProfileModal');
      const editClose = document.getElementById('userMenuEditCloseBtn');
      const editCancel = document.getElementById('userMenuEditCancelBtn');
      const editSave = document.getElementById('userMenuEditSaveBtn');

      [editClose, editCancel].forEach(b => {
        if (b) b.onclick = () => editModal.classList.add('hidden');
      });

      if (editSave) {
        editSave.onclick = async () => {
          const fName = document.getElementById('userMenuEditFirstName').value.trim();
          const lName = document.getElementById('userMenuEditLastName').value.trim();
          const email = document.getElementById('userMenuEditEmail').value.trim();
          const phone = document.getElementById('userMenuEditPhone').value.trim();
          const alertBox = document.getElementById('userMenuEditAlert');

          if (!fName || !lName || !email) {
            if (alertBox) {
              alertBox.textContent = 'First name, last name, and email are required.';
              alertBox.classList.remove('hidden');
            }
            return;
          }

          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            if (alertBox) {
              alertBox.textContent = 'Please enter a valid email address.';
              alertBox.classList.remove('hidden');
            }
            return;
          }

          editSave.disabled = true;
          editSave.textContent = 'Saving...';

          try {
            const token = getStoredToken();
            const res = await fetch('/api/users/me', {
              method: 'PUT',
              headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                first_name: fName,
                last_name: lName,
                email: email,
                phone: phone || null
              })
            });

            const json = await res.json();
            if (!res.ok) {
              throw new Error(json.message || 'Failed to update profile');
            }

            if (json.data && json.data.user) {
              setStoredUser(json.data.user);
              this.renderUserInfo(json.data.user);
            }

            editModal.classList.add('hidden');
            showToast('Profile updated successfully!');
          } catch (err) {
            if (alertBox) {
              alertBox.textContent = err.message;
              alertBox.classList.remove('hidden');
            }
          } finally {
            editSave.disabled = false;
            editSave.textContent = 'Save Changes';
          }
        };
      }

      // Change Password Modal
      const passModal = document.getElementById('userMenuChangePasswordModal');
      const passClose = document.getElementById('userMenuPassCloseBtn');
      const passCancel = document.getElementById('userMenuPassCancelBtn');
      const passSave = document.getElementById('userMenuPassSaveBtn');

      [passClose, passCancel].forEach(b => {
        if (b) b.onclick = () => passModal.classList.add('hidden');
      });

      if (passSave) {
        passSave.onclick = async () => {
          const cur = document.getElementById('userMenuPassCurrent').value;
          const nxt = document.getElementById('userMenuPassNew').value;
          const cfm = document.getElementById('userMenuPassConfirm').value;
          const alertBox = document.getElementById('userMenuPassAlert');

          if (!cur || !nxt || !cfm) {
            if (alertBox) {
              alertBox.textContent = 'All password fields are required.';
              alertBox.classList.remove('hidden');
            }
            return;
          }

          if (nxt.length < 6) {
            if (alertBox) {
              alertBox.textContent = 'New password must be at least 6 characters long.';
              alertBox.classList.remove('hidden');
            }
            return;
          }

          if (nxt !== cfm) {
            if (alertBox) {
              alertBox.textContent = 'New password and confirmation do not match.';
              alertBox.classList.remove('hidden');
            }
            return;
          }

          if (nxt === cur) {
            if (alertBox) {
              alertBox.textContent = 'New password must be different from current password.';
              alertBox.classList.remove('hidden');
            }
            return;
          }

          passSave.disabled = true;
          passSave.textContent = 'Updating...';

          try {
            const token = getStoredToken();
            const res = await fetch('/api/auth/change-password', {
              method: 'PUT',
              headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                current_password: cur,
                new_password: nxt,
                confirm_password: cfm
              })
            });

            const json = await res.json();
            if (!res.ok) {
              throw new Error(json.message || 'Failed to update password');
            }

            passModal.classList.add('hidden');
            alert('Password changed successfully. Please login again.');
            this.purgeSessionAndRedirect('Password changed successfully. Please login again.');
          } catch (err) {
            if (alertBox) {
              alertBox.textContent = err.message;
              alertBox.classList.remove('hidden');
            }
          } finally {
            passSave.disabled = false;
            passSave.textContent = 'Update Password';
          }
        };
      }

      // Logout Modal
      const logoutModal = document.getElementById('userMenuLogoutModal');
      const logoutClose = document.getElementById('userMenuLogoutCloseBtn');
      const logoutCancel = document.getElementById('userMenuLogoutCancelBtn');
      const logoutConfirm = document.getElementById('userMenuLogoutConfirmBtn');

      [logoutClose, logoutCancel].forEach(b => {
        if (b) b.onclick = () => logoutModal.classList.add('hidden');
      });

      if (logoutConfirm) {
        logoutConfirm.onclick = () => this.executeLogout();
      }

      // Close modal on backdrop click
      [editModal, passModal, logoutModal].forEach(m => {
        if (m) {
          m.onclick = (e) => {
            if (e.target === m) m.classList.add('hidden');
          };
        }
      });
    },

    /**
     * Inject minimal styling ensuring dropdown and modal positioning across all viewports
     */
    injectStyles() {
      if (document.getElementById('userMenuInjectedStyles')) return;
      const style = document.createElement('style');
      style.id = 'userMenuInjectedStyles';
      style.textContent = `
        .profile-dropdown-wrapper {
          position: relative;
          display: inline-block;
        }
        .profile-dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 250px;
          max-width: calc(100vw - 32px);
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
          padding: 6px;
          display: none;
          z-index: 1050;
        }
        .profile-dropdown-menu.show {
          display: block;
        }
        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          font-size: 13px;
          color: #334155;
          text-decoration: none;
          border-radius: 6px;
          cursor: pointer;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          box-sizing: border-box;
          transition: background-color 0.15s ease;
        }
        .dropdown-item:hover {
          background-color: #f1f5f9;
          color: #0f172a;
        }
        .dropdown-item svg {
          width: 16px;
          height: 16px;
          color: #64748b;
          flex-shrink: 0;
        }
        .dropdown-item:hover svg {
          color: #0f172a;
        }
        .dropdown-item-danger {
          color: #dc2626 !important;
        }
        .dropdown-item-danger:hover {
          background-color: #fef2f2 !important;
          color: #b91c1c !important;
        }
        .dropdown-item-danger svg {
          color: #ef4444 !important;
        }
        .header-notify-badge {
          position: absolute;
          top: 0px;
          right: 2px;
          background-color: #ef4444;
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 10px;
          line-height: 1.2;
          min-width: 14px;
          text-align: center;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          padding: 16px;
        }
        .modal-overlay.hidden {
          display: none !important;
        }
        .modal-card {
          background: #ffffff;
          border-radius: 10px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
          padding: 20px;
          box-sizing: border-box;
          max-height: 90vh;
          overflow-y: auto;
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 16px;
        }
        .modal-title {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .modal-close-btn {
          background: none;
          border: none;
          font-size: 20px;
          color: #64748b;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        .modal-close-btn:hover {
          color: #0f172a;
        }
      `;
      document.head.appendChild(style);
    }
  };

  UserMenu.renderAvatarElement = renderAvatarElement;
  UserMenu.renderAllUserAvatars = (user) => (typeof window.renderAllUserAvatars === 'function' ? window.renderAllUserAvatars(user) : UserMenu.renderUserInfo(user));

  // Expose globally
  window.UserMenu = UserMenu;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UserMenu.initializeUserMenu());
  } else {
    UserMenu.initializeUserMenu();
  }
})();
