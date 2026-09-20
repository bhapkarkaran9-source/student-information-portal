/**
 * Admin Shell Global Controller - Student Information Portal
 * Enforces unified Sidebar navigation, active item highlighting,
 * right-side Admin Profile header ([S] System Admin / ADMIN ▼),
 * standardized 7-item profile dropdown, and shared modals
 * (My Profile, Edit Profile, Change Password, Account Settings).
 */

(function () {
  'use strict';

  // Constants
  const ADMIN_DEFAULT_NAME = 'System Admin';
  const ADMIN_ROLE = 'ADMIN';
  const ADMIN_AVATAR = 'S';
  const ADMIN_DEFAULT_EMAIL = 'admin@portal.local';

  // Canonical Navigation Items (Exact 6 groups requested by user)
  const SIDEBAR_NAV_ITEMS = [
    {
      group: 'Overview',
      items: [
        {
          name: 'Dashboard',
          href: '/pages/admin/dashboard.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>'
        }
      ]
    },
    {
      group: 'User Management',
      items: [
        {
          name: 'Users',
          href: '/pages/admin/users.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>'
        },
        {
          name: 'Students',
          href: '/pages/admin/students.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
        },
        {
          name: 'Teachers',
          href: '/pages/admin/teachers.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>'
        }
      ]
    },
    {
      group: 'Academics',
      items: [
        {
          name: 'Departments',
          href: '/pages/admin/departments.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"></path></svg>'
        },
        {
          name: 'Courses',
          href: '/pages/admin/courses.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>'
        },
        {
          name: 'Enrollment',
          href: '/pages/admin/enrollments.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>'
        },
        {
          name: 'Timetable',
          href: '/pages/admin/timetable.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>'
        },
        {
          name: 'Academic Calendar',
          href: '/pages/admin/calendar.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><circle cx="8" cy="15" r="1"></circle><circle cx="12" cy="15" r="1"></circle><circle cx="16" cy="15" r="1"></circle></svg>'
        }
      ]
    },
    {
      group: 'Academic Operations',
      items: [
        {
          name: 'Attendance',
          href: '/pages/admin/attendance.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>'
        },
        {
          name: 'Grades',
          href: '/pages/admin/grades.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line></svg>'
        },
        {
          name: 'Assignments',
          href: '/pages/admin/assignments.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>'
        },
        {
          name: 'Study Material',
          href: '/pages/admin/study-material.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>'
        }
      ]
    },
    {
      group: 'Communication',
      items: [
        {
          name: 'Notices',
          href: '/pages/admin/notices.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>'
        },
        {
          name: 'Notifications',
          href: '/pages/admin/notifications.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>'
        },
        {
          name: 'Queries',
          href: '/pages/admin/queries.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>'
        },
        {
          name: 'Feedback',
          href: '/pages/admin/feedback.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>'
        },
        {
          name: 'Email Management',
          href: '/pages/admin/email-management.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>'
        }
      ]
    },
    {
      group: 'Reports',
      items: [
        {
          name: 'Reports',
          href: '/pages/admin/reports.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>'
        },
        {
          name: 'Audit Logs',
          href: '/pages/admin/audit-logs.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
        },
        {
          name: 'Backup & Restore',
          href: '/pages/admin/backups.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>'
        }
      ]
    }
  ];

  /**
   * Helper: Retrieve stored user from localStorage or sessionStorage
   */
  function getCurrentUser() {
    try {
      const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
      if (userStr) return JSON.parse(userStr);
    } catch (e) {
      console.warn('Error reading stored user:', e);
    }
    return {
      user_id: 1,
      username: 'admin',
      first_name: 'System',
      last_name: 'Admin',
      email: ADMIN_DEFAULT_EMAIL,
      role: ADMIN_ROLE
    };
  }

  /**
   * Helper: Save updated user back to storage
   */
  function updateStoredUser(updatedFields) {
    try {
      const current = getCurrentUser();
      const merged = Object.assign({}, current, updatedFields);
      localStorage.setItem('user', JSON.stringify(merged));
      sessionStorage.setItem('user', JSON.stringify(merged));
      return merged;
    } catch (e) {
      console.warn('Error saving updated user:', e);
    }
  }

  /**
   * Helper: Display Toast Notification
   */
  function showToast(message, type) {
    type = type || 'success';
    let container = document.getElementById('adminSharedToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'adminSharedToastContainer';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'admin-toast admin-toast-' + type;
    toast.innerHTML = '<span>' + message + '</span><button type="button" style="background:none;border:none;color:#64748b;cursor:pointer;padding:0;font-size:16px;">&times;</button>';

    const closeBtn = toast.querySelector('button');
    closeBtn.onclick = function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    };

    container.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }

  /**
   * 1. Render / Standardize Admin Sidebar
   */
  function renderAdminSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    if (!sidebar) return;

    let navHtml = '';
    SIDEBAR_NAV_ITEMS.forEach(function (group) {
      navHtml += '<div class="nav-group-title">' + group.group + '</div><ul class="nav-list">';
      group.items.forEach(function (item) {
        navHtml += '<li><a href="' + item.href + '" class="nav-link">' + item.icon + '<span>' + item.name + '</span></a></li>';
      });
      navHtml += '</ul>';
    });

    const user = getCurrentUser();
    const fullName = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || user.username || ADMIN_DEFAULT_NAME;
    const initial = (user.first_name ? user.first_name[0] : (user.username ? user.username[0] : ADMIN_AVATAR)).toUpperCase();
    const email = user.email || ADMIN_DEFAULT_EMAIL;
    const avatarHtml = user.profile_photo_url
      ? '<img src="' + escapeHtml(user.profile_photo_url) + '" alt="' + escapeHtml(fullName) + ' avatar" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" onerror="this.onerror=null;this.parentElement.textContent=\'' + initial + '\';">'
      : ADMIN_AVATAR;

    sidebar.innerHTML = 
      '<div class="sidebar-header">' +
        '<a href="/pages/admin/dashboard.html" class="sidebar-brand">' +
          '<div class="sidebar-logo" aria-hidden="true">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/>' +
              '<path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/>' +
            '</svg>' +
          '</div>' +
          '<div class="sidebar-title">' +
            '<span class="brand-main">Student Portal</span>' +
            '<span class="brand-sub">ADMINISTRATION</span>' +
          '</div>' +
        '</a>' +
        '<button type="button" id="sidebarCloseBtn" class="sidebar-close-btn" aria-label="Close menu">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<line x1="18" y1="6" x2="6" y2="18"></line>' +
            '<line x1="6" y1="6" x2="18" y2="18"></line>' +
          '</svg>' +
        '</button>' +
      '</div>' +
      '<nav class="sidebar-nav" id="sidebarNavContainer">' +
        navHtml +
      '</nav>' +
      '<div class="sidebar-footer">' +
        '<div class="sidebar-user">' +
          '<div class="sidebar-avatar" id="sidebarAdminAvatar">' + avatarHtml + '</div>' +
          '<div class="sidebar-user-info">' +
            '<span class="sidebar-user-name" id="sidebarAdminName">' + ADMIN_DEFAULT_NAME + '</span>' +
            '<span class="sidebar-user-role" id="sidebarAdminEmail">' + email + '</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn-sidebar-logout" id="sidebarLogoutBtn" title="Sign Out">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>' +
            '<polyline points="16 17 21 12 16 7"></polyline>' +
            '<line x1="21" y1="12" x2="9" y2="12"></line>' +
          '</svg>' +
        '</button>' +
      '</div>';
  }

  /**
   * 2. Highlight Current Active Sidebar Nav Link
   */
  function highlightActiveSidebarLink() {
    const currentPath = window.location.pathname.toLowerCase();
    const navLinks = document.querySelectorAll('#sidebarNavContainer .nav-link');

    navLinks.forEach(function (link) {
      link.classList.remove('active');
      const href = link.getAttribute('href');
      if (!href) return;
      const normalizedHref = href.toLowerCase();

      // Direct page filename match
      const linkFile = normalizedHref.split('/').pop().split('?')[0];
      const currentFile = currentPath.split('/').pop().split('?')[0];

      if (linkFile === currentFile && currentFile !== '') {
        link.classList.add('active');
      }
    });
  }

  /**
   * 3. Render / Standardize Right-Side Admin Profile Header & Dropdown
   */
  function renderHeaderProfile() {
    const user = getCurrentUser();
    const fullName = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || user.username || ADMIN_DEFAULT_NAME;
    const initial = (user.first_name ? user.first_name[0] : (user.username ? user.username[0] : ADMIN_AVATAR)).toUpperCase();
    const email = user.email || ADMIN_DEFAULT_EMAIL;

    const avatar = document.getElementById('headerAdminAvatar');
    if (avatar) {
      if (typeof window.renderAvatarElement === 'function') {
        window.renderAvatarElement(avatar, user.profile_photo_url, initial, fullName + ' avatar');
      } else if (user.profile_photo_url) {
        avatar.innerHTML = '<img src="' + escapeHtml(user.profile_photo_url) + '" alt="' + escapeHtml(fullName) + ' avatar" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" onerror="this.onerror=null;this.parentElement.textContent=\'' + initial + '\';">';
      } else {
        avatar.textContent = initial;
      }
    }

    const name = document.getElementById('headerAdminName');
    if (name) name.textContent = fullName;

    const badge = document.querySelector('.header-admin-badge');
    if (badge) badge.textContent = ADMIN_ROLE;

    const dropName = document.getElementById('dropdownAdminName');
    if (dropName) dropName.textContent = fullName;

    const dropEmail = document.getElementById('dropdownAdminEmail');
    if (dropEmail) dropEmail.textContent = email;

    // Populate legacy element IDs for backward compatibility
    const legacyTopbarName = document.getElementById('topbarAdminName') || document.getElementById('topbarUserName') || document.getElementById('topbarUsername');
    if (legacyTopbarName) legacyTopbarName.textContent = fullName;

    const legacyTopbarAvatar = document.getElementById('topbarAvatar');
    if (legacyTopbarAvatar) {
      if (typeof window.renderAvatarElement === 'function') {
        window.renderAvatarElement(legacyTopbarAvatar, user.profile_photo_url, initial, fullName + ' avatar');
      } else if (user.profile_photo_url) {
        legacyTopbarAvatar.innerHTML = '<img src="' + escapeHtml(user.profile_photo_url) + '" alt="' + escapeHtml(fullName) + ' avatar" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" onerror="this.onerror=null;this.parentElement.textContent=\'' + initial + '\';">';
      } else {
        legacyTopbarAvatar.textContent = initial;
      }
    }

    const legacyUsernameBadge = document.getElementById('adminUsernameBadge');
    if (legacyUsernameBadge) legacyUsernameBadge.textContent = fullName;
  }

  /**
   * 3b. Ensure Exactly ONE Notification Bell Exists in Top Header
   */
  function ensureNotificationBell() {
    const headerRight = document.querySelector('.admin-header .header-right, header .header-right');
    if (!headerRight) return;

    let bellBtn = document.getElementById('headerNotificationBtn') || document.getElementById('notificationBtn') || headerRight.querySelector('.header-notify-btn, .header-icon-btn[aria-label*="Notification" i]');
    
    if (!bellBtn) {
      bellBtn = document.createElement('button');
      bellBtn.type = 'button';
      bellBtn.id = 'headerNotificationBtn';
      bellBtn.className = 'header-notify-btn';
      bellBtn.setAttribute('aria-label', 'Notifications');
      bellBtn.title = 'Notifications';
      bellBtn.innerHTML = 
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>' +
          '<path d="M13.73 21a2 2 0 0 1-3.46 0"></path>' +
        '</svg>' +
        '<span id="headerNotificationDot" class="header-notify-badge hidden"></span>';
      
      const profileDropdown = headerRight.querySelector('.profile-dropdown-wrapper');
      if (profileDropdown) {
        headerRight.insertBefore(bellBtn, profileDropdown);
      } else {
        headerRight.prepend(bellBtn);
      }
    }

    if (bellBtn && !bellBtn.dataset.bound) {
      bellBtn.dataset.bound = 'true';
      bellBtn.onclick = function () {
        window.location.href = '/pages/admin/notifications.html';
      };
    }
  }

  /**
   * Global Sign Out Handler
   */
  function handleLogout(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (window.UserMenu && window.UserMenu.logoutUser) {
      window.UserMenu.logoutUser();
      return;
    }
    try {
      const token = localStorage.getItem('token');
      if (token) {
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          }
        }).catch(function () {});
      }
    } catch (err) {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.clear();
    window.location.replace('/login.html');
  }

  /**
   * 4. Wire up Dropdown Toggle, Dismissal on Outside Click, and Escape Key
   * Uses capturing phase on document to guarantee robust single-handler execution.
   */
  function initDropdownEvents() {
    if (window.UserMenu) return; // Managed globally by user-menu.js
    // Capturing phase listener: guarantees dropdown toggle & outside click without listener collisions
    document.addEventListener('click', function (e) {
      const trigger = document.getElementById('profileDropdownTrigger');
      const menu = document.getElementById('profileDropdownMenu');
      if (!trigger || !menu) return;

      if (trigger.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = menu.classList.toggle('show');
        trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      } else if (!menu.contains(e.target)) {
        menu.classList.remove('show');
        trigger.setAttribute('aria-expanded', 'false');
      }
    }, true);

    // Close menu on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        const trigger = document.getElementById('profileDropdownTrigger');
        const menu = document.getElementById('profileDropdownMenu');
        if (menu) menu.classList.remove('show');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        closeAllModals();
      }
    });

    // Wire Logout Buttons
    const dropdownLogout = document.getElementById('dropdownLogoutBtn');
    if (dropdownLogout) dropdownLogout.onclick = handleLogout;

    const sidebarLogout = document.getElementById('sidebarLogoutBtn');
    if (sidebarLogout) sidebarLogout.onclick = handleLogout;

    const legacyLogout = document.getElementById('btnLogout') || document.getElementById('logoutBtn');
    if (legacyLogout) legacyLogout.onclick = handleLogout;
  }

  /**
   * 5. Wire up Mobile Sidebar Drawer (Toggle, Close, Backdrop, Escape, Nav-links, Scroll-lock)
   */
  function initMobileSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    if (!sidebar) return;
    if (sidebar.dataset.drawerInitialized) return;
    sidebar.dataset.drawerInitialized = 'true';

    let backdrop = document.getElementById('sidebarBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'sidebarBackdrop';
      backdrop.className = 'sidebar-backdrop hidden';
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);
    }

    function openSidebar() {
      sidebar.classList.add('open');
      if (backdrop) backdrop.classList.remove('hidden');
      document.body.classList.add('sidebar-open');
      document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
      sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.add('hidden');
      document.body.classList.remove('sidebar-open');
      document.body.style.overflow = '';
    }

    function toggleSidebar() {
      if (sidebar.classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    }

    // Use capturing event listener to handle clicks and stop immediate propagation
    // to prevent conflicting double-toggle handlers from page-specific scripts
    document.addEventListener('click', function (e) {
      if (!e.target || typeof e.target.closest !== 'function') return;
      const toggleBtn = e.target.closest('#sidebarToggleBtn, #toggleSidebarBtn, #mobileSidebarToggle, .sidebar-toggle-btn, .mobile-sidebar-toggle');
      if (toggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toggleSidebar();
        return;
      }

      const closeBtn = e.target.closest('#sidebarCloseBtn, #closeSidebarBtn, .sidebar-close-btn');
      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeSidebar();
        return;
      }

      const clickedBackdrop = e.target.closest('#sidebarBackdrop, .sidebar-backdrop');
      if (clickedBackdrop) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeSidebar();
        return;
      }

      // Close mobile drawer when any navigation link inside sidebar is tapped
      const navLink = e.target.closest('.sidebar-nav .nav-link, .nav-link');
      if (navLink && sidebar.contains(navLink)) {
        if (window.innerWidth <= 1024) {
          closeSidebar();
        }
      }
    }, true);

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && sidebar.classList.contains('open')) {
        closeSidebar();
      }
    });

    // Handle screen resize
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024 && sidebar.classList.contains('open')) {
        closeSidebar();
      }
    });
  }

  function closeAllModals() {
    const overlays = document.querySelectorAll('#adminSharedModalsRoot .modal-overlay, #profileModal');
    overlays.forEach(function (m) {
      m.classList.add('hidden');
    });
  }

  /**
   * 6. Render and Wire Shared Modals (My Profile, Edit Profile, Change Password, Settings)
   */
  function renderSharedModals() {
    if (document.getElementById('adminSharedProfileModal')) return;

    const modalsHtml = 
      '<!-- 1. My Profile Modal -->' +
      '<div id="adminSharedProfileModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="sharedProfileModalTitle">' +
        '<div class="modal-card">' +
          '<div class="modal-header">' +
            '<h3 id="sharedProfileModalTitle" class="modal-title">Admin Account Profile</h3>' +
            '<button type="button" class="modal-close-btn" id="sharedProfileModalClose" aria-label="Close modal">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<line x1="18" y1="6" x2="6" y2="18"></line>' +
                '<line x1="6" y1="6" x2="18" y2="18"></line>' +
              '</svg>' +
            '</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<ul class="info-list">' +
              '<li class="info-item">' +
                '<span class="info-label">Full Name</span>' +
                '<span class="info-value" id="profileModalFullName">System Admin</span>' +
              '</li>' +
              '<li class="info-item">' +
                '<span class="info-label">Username</span>' +
                '<span class="info-value" id="profileModalUsername">admin</span>' +
              '</li>' +
              '<li class="info-item">' +
                '<span class="info-label">Email Address</span>' +
                '<span class="info-value" id="profileModalEmail">admin@portal.local</span>' +
              '</li>' +
              '<li class="info-item">' +
                '<span class="info-label">Phone</span>' +
                '<span class="info-value" id="profileModalPhone">Not Set</span>' +
              '</li>' +
              '<li class="info-item">' +
                '<span class="info-label">Assigned Role</span>' +
                '<span class="info-value"><span class="badge badge-admin" id="profileModalRole">ADMIN</span></span>' +
              '</li>' +
              '<li class="info-item">' +
                '<span class="info-label">Account Status</span>' +
                '<span class="info-value"><span class="badge" style="background-color:#dcfce7;color:#15803d;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">Active</span></span>' +
              '</li>' +
              '<li class="info-item">' +
                '<span class="info-label">User ID</span>' +
                '<span class="info-value" id="profileModalUserId">1</span>' +
              '</li>' +
            '</ul>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary btn-sm" id="sharedProfileBtnClose">Close</button>' +
            '<button type="button" class="btn btn-primary btn-sm" id="sharedProfileBtnEdit">Edit Profile</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- 2. Edit Profile Modal -->' +
      '<div id="adminSharedEditProfileModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="sharedEditProfileTitle">' +
        '<div class="modal-card">' +
          '<div class="modal-header">' +
            '<h3 id="sharedEditProfileTitle" class="modal-title">Edit Admin Profile</h3>' +
            '<button type="button" class="modal-close-btn" id="sharedEditProfileModalClose" aria-label="Close modal">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<line x1="18" y1="6" x2="6" y2="18"></line>' +
                '<line x1="6" y1="6" x2="18" y2="18"></line>' +
              '</svg>' +
            '</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div id="editProfileAlert" class="alert alert-danger hidden" style="margin-bottom:16px;padding:10px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;font-size:13px;color:#991b1b;"></div>' +
            '<form id="sharedEditProfileForm" onsubmit="return false;">' +
              '<div class="modal-form-group" style="margin-bottom:14px;">' +
                '<label for="editFirstName" style="display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:#334155;">First Name *</label>' +
                '<input type="text" id="editFirstName" class="form-input" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13.5px;box-sizing:border-box;" required />' +
              '</div>' +
              '<div class="modal-form-group" style="margin-bottom:14px;">' +
                '<label for="editLastName" style="display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:#334155;">Last Name *</label>' +
                '<input type="text" id="editLastName" class="form-input" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13.5px;box-sizing:border-box;" required />' +
              '</div>' +
              '<div class="modal-form-group" style="margin-bottom:14px;">' +
                '<label for="editEmail" style="display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:#334155;">Email Address *</label>' +
                '<input type="email" id="editEmail" class="form-input" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13.5px;box-sizing:border-box;" required />' +
              '</div>' +
              '<div class="modal-form-group" style="margin-bottom:14px;">' +
                '<label for="editPhone" style="display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:#334155;">Phone Number</label>' +
                '<input type="tel" id="editPhone" class="form-input" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13.5px;box-sizing:border-box;" placeholder="+1 (555) 000-0000" />' +
              '</div>' +
            '</form>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary btn-sm" id="sharedEditProfileCancelBtn">Cancel</button>' +
            '<button type="button" class="btn btn-primary btn-sm" id="sharedEditProfileSaveBtn">Save Changes</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- 3. Change Password Modal -->' +
      '<div id="adminSharedChangePasswordModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="sharedChangePasswordTitle">' +
        '<div class="modal-card">' +
          '<div class="modal-header">' +
            '<h3 id="sharedChangePasswordTitle" class="modal-title">Change Admin Password</h3>' +
            '<button type="button" class="modal-close-btn" id="sharedChangePassModalClose" aria-label="Close modal">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<line x1="18" y1="6" x2="6" y2="18"></line>' +
                '<line x1="6" y1="6" x2="18" y2="18"></line>' +
              '</svg>' +
            '</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div id="changePassAlert" class="alert alert-danger hidden" style="margin-bottom:16px;padding:10px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;font-size:13px;color:#991b1b;"></div>' +
            '<form id="sharedChangePasswordForm" onsubmit="return false;">' +
              '<div class="modal-form-group" style="margin-bottom:14px;">' +
                '<label for="passCurrent" style="display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:#334155;">Current Password *</label>' +
                '<input type="password" id="passCurrent" class="form-input" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13.5px;box-sizing:border-box;" required autocomplete="current-password" />' +
              '</div>' +
              '<div class="modal-form-group" style="margin-bottom:14px;">' +
                '<label for="passNew" style="display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:#334155;">New Password * (min 6 characters)</label>' +
                '<input type="password" id="passNew" class="form-input" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13.5px;box-sizing:border-box;" required minlength="6" autocomplete="new-password" />' +
              '</div>' +
              '<div class="modal-form-group" style="margin-bottom:14px;">' +
                '<label for="passConfirm" style="display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:#334155;">Confirm New Password *</label>' +
                '<input type="password" id="passConfirm" class="form-input" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13.5px;box-sizing:border-box;" required minlength="6" autocomplete="new-password" />' +
              '</div>' +
            '</form>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary btn-sm" id="sharedChangePassCancelBtn">Cancel</button>' +
            '<button type="button" class="btn btn-primary btn-sm" id="sharedChangePassSaveBtn">Update Password</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- 4. Account Settings Modal -->' +
      '<div id="adminSharedSettingsModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="sharedSettingsTitle">' +
        '<div class="modal-card">' +
          '<div class="modal-header">' +
            '<h3 id="sharedSettingsTitle" class="modal-title">Admin Account Settings</h3>' +
            '<button type="button" class="modal-close-btn" id="sharedSettingsModalClose" aria-label="Close modal">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<line x1="18" y1="6" x2="6" y2="18"></line>' +
                '<line x1="6" y1="6" x2="18" y2="18"></line>' +
              '</svg>' +
            '</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<form id="sharedSettingsForm" onsubmit="return false;">' +
              '<div class="modal-form-group" style="margin-bottom:16px;">' +
                '<label for="settingDensity" style="display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:#334155;">Table Display Density</label>' +
                '<select id="settingDensity" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13.5px;box-sizing:border-box;background:#fff;">' +
                  '<option value="comfortable">Comfortable (Default)</option>' +
                  '<option value="compact">Compact (Higher Data Density)</option>' +
                '</select>' +
              '</div>' +
              '<div class="modal-form-group" style="margin-bottom:16px;">' +
                '<label for="settingAlerts" style="display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:#334155;">Audit & Security Alerts</label>' +
                '<select id="settingAlerts" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13.5px;box-sizing:border-box;background:#fff;">' +
                  '<option value="all">All Events (Critical, Warning, Info)</option>' +
                  '<option value="critical">Critical Only (Failed Logins, Restores)</option>' +
                  '<option value="disabled">Muted</option>' +
                '</select>' +
              '</div>' +
              '<div class="modal-form-group" style="margin-bottom:16px;">' +
                '<label for="settingRefresh" style="display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:#334155;">Data Auto-Refresh Interval</label>' +
                '<select id="settingRefresh" style="width:100%;padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13.5px;box-sizing:border-box;background:#fff;">' +
                  '<option value="0">Manual Refresh Only</option>' +
                  '<option value="30">Every 30 seconds</option>' +
                  '<option value="60">Every 60 seconds</option>' +
                '</select>' +
              '</div>' +
            '</form>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary btn-sm" id="sharedSettingsCancelBtn">Close</button>' +
            '<button type="button" class="btn btn-primary btn-sm" id="sharedSettingsSaveBtn">Save Settings</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    const div = document.createElement('div');
    div.id = 'adminSharedModalsRoot';
    div.innerHTML = modalsHtml;
    document.body.appendChild(div);
  }

  /**
   * 7. Wire up Modal Events & Backend Operations
   */
  function initModalEvents() {
    if (window.UserMenu) return; // UserMenu manages modals globally
    renderSharedModals();

    const profileModal = document.getElementById('adminSharedProfileModal');
    const editModal = document.getElementById('adminSharedEditProfileModal');
    const passModal = document.getElementById('adminSharedChangePasswordModal');
    const settingsModal = document.getElementById('adminSharedSettingsModal');

    // Close buttons
    const closeBtns = [
      document.getElementById('sharedProfileModalClose'),
      document.getElementById('sharedProfileBtnClose'),
      document.getElementById('sharedEditProfileModalClose'),
      document.getElementById('sharedEditProfileCancelBtn'),
      document.getElementById('sharedChangePassModalClose'),
      document.getElementById('sharedChangePassCancelBtn'),
      document.getElementById('sharedSettingsModalClose'),
      document.getElementById('sharedSettingsCancelBtn')
    ];

    closeBtns.forEach(function (btn) {
      if (btn) btn.onclick = closeAllModals;
    });

    // Close on overlay backdrop click
    [profileModal, editModal, passModal, settingsModal].forEach(function (modal) {
      if (modal) {
        modal.onclick = function (e) {
          if (e.target === modal) closeAllModals();
        };
      }
    });

    // --- Action 1: Open My Profile ---
    function openMyProfile() {
      closeAllModals();
      const menu = document.getElementById('profileDropdownMenu');
      if (menu) menu.classList.remove('show');

      const user = getCurrentUser();
      const fullName = ((user.first_name || 'System') + ' ' + (user.last_name || 'Admin')).trim();

      const nameEl = document.getElementById('profileModalFullName');
      if (nameEl) nameEl.textContent = fullName;

      const userEl = document.getElementById('profileModalUsername');
      if (userEl) userEl.textContent = user.username || 'admin';

      const emailEl = document.getElementById('profileModalEmail');
      if (emailEl) emailEl.textContent = user.email || ADMIN_DEFAULT_EMAIL;

      const phoneEl = document.getElementById('profileModalPhone');
      if (phoneEl) phoneEl.textContent = user.phone || 'Not Set';

      const roleEl = document.getElementById('profileModalRole');
      if (roleEl) roleEl.textContent = user.role || ADMIN_ROLE;

      const idEl = document.getElementById('profileModalUserId');
      if (idEl) idEl.textContent = user.user_id || '1';

      if (profileModal) profileModal.classList.remove('hidden');

      // Refresh from /api/auth/me if online
      const token = localStorage.getItem('token');
      if (token) {
        fetch('/api/auth/me', {
          headers: { 'Authorization': 'Bearer ' + token }
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data && data.data && data.data.user) {
              const u = data.data.user;
              updateStoredUser(u);
              if (nameEl) nameEl.textContent = ((u.first_name || '') + ' ' + (u.last_name || '')).trim() || ADMIN_DEFAULT_NAME;
              if (userEl) userEl.textContent = u.username;
              if (emailEl) emailEl.textContent = u.email;
              if (phoneEl) phoneEl.textContent = u.phone || 'Not Set';
              if (roleEl) roleEl.textContent = u.role;
              if (idEl) idEl.textContent = u.user_id;
            }
          })
          .catch(function () {});
      }
    }

    const dropdownProfile = document.getElementById('dropdownMyProfile');
    if (dropdownProfile) dropdownProfile.onclick = openMyProfile;

    // --- Action 2: Open Edit Profile ---
    function openEditProfile() {
      closeAllModals();
      const menu = document.getElementById('profileDropdownMenu');
      if (menu) menu.classList.remove('show');

      const user = getCurrentUser();
      const fName = document.getElementById('editFirstName');
      const lName = document.getElementById('editLastName');
      const email = document.getElementById('editEmail');
      const phone = document.getElementById('editPhone');
      const alertBox = document.getElementById('editProfileAlert');

      if (alertBox) {
        alertBox.textContent = '';
        alertBox.classList.add('hidden');
      }

      if (fName) fName.value = user.first_name || 'System';
      if (lName) lName.value = user.last_name || 'Admin';
      if (email) email.value = user.email || ADMIN_DEFAULT_EMAIL;
      if (phone) phone.value = user.phone || '';

      if (editModal) editModal.classList.remove('hidden');
    }

    const dropdownEdit = document.getElementById('dropdownEditProfile');
    if (dropdownEdit) dropdownEdit.onclick = openEditProfile;

    const profileEditBtn = document.getElementById('sharedProfileBtnEdit');
    if (profileEditBtn) profileEditBtn.onclick = openEditProfile;

    // Save Edit Profile
    const saveEditBtn = document.getElementById('sharedEditProfileSaveBtn');
    if (saveEditBtn) {
      saveEditBtn.onclick = async function () {
        const fName = document.getElementById('editFirstName').value.trim();
        const lName = document.getElementById('editLastName').value.trim();
        const email = document.getElementById('editEmail').value.trim();
        const phone = document.getElementById('editPhone').value.trim();
        const alertBox = document.getElementById('editProfileAlert');

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
            alertBox.textContent = 'Please provide a valid email address.';
            alertBox.classList.remove('hidden');
          }
          return;
        }

        saveEditBtn.disabled = true;
        saveEditBtn.textContent = 'Saving...';

        try {
          const user = getCurrentUser();
          const token = localStorage.getItem('token');
          const res = await fetch('/api/users/' + user.user_id, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
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

          updateStoredUser({
            first_name: fName,
            last_name: lName,
            email: email,
            phone: phone || null
          });

          const dropEmail = document.getElementById('dropdownAdminEmail');
          if (dropEmail) dropEmail.textContent = email;
          const sideEmail = document.getElementById('sidebarAdminEmail');
          if (sideEmail) sideEmail.textContent = email;

          closeAllModals();
          showToast('Profile updated successfully!');
        } catch (err) {
          if (alertBox) {
            alertBox.textContent = err.message;
            alertBox.classList.remove('hidden');
          }
        } finally {
          saveEditBtn.disabled = false;
          saveEditBtn.textContent = 'Save Changes';
        }
      };
    }

    // --- Action 3: Open Change Password ---
    function openChangePassword() {
      closeAllModals();
      const menu = document.getElementById('profileDropdownMenu');
      if (menu) menu.classList.remove('show');

      const passCurrent = document.getElementById('passCurrent');
      const passNew = document.getElementById('passNew');
      const passConfirm = document.getElementById('passConfirm');
      const alertBox = document.getElementById('changePassAlert');

      if (alertBox) {
        alertBox.textContent = '';
        alertBox.classList.add('hidden');
      }

      if (passCurrent) passCurrent.value = '';
      if (passNew) passNew.value = '';
      if (passConfirm) passConfirm.value = '';

      if (passModal) passModal.classList.remove('hidden');
    }

    const dropdownChangePass = document.getElementById('dropdownChangePassword');
    if (dropdownChangePass) dropdownChangePass.onclick = openChangePassword;

    // Submit Change Password
    const savePassBtn = document.getElementById('sharedChangePassSaveBtn');
    if (savePassBtn) {
      savePassBtn.onclick = async function () {
        const cur = document.getElementById('passCurrent').value;
        const nxt = document.getElementById('passNew').value;
        const cfm = document.getElementById('passConfirm').value;
        const alertBox = document.getElementById('changePassAlert');

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

        savePassBtn.disabled = true;
        savePassBtn.textContent = 'Verifying...';

        try {
          const user = getCurrentUser();
          const token = localStorage.getItem('token');

          // 1. Verify current credentials
          const verifyRes = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: user.username,
              password: cur
            })
          });

          if (!verifyRes.ok) {
            throw new Error('Current password is incorrect.');
          }

          // 2. Update password via user management API
          savePassBtn.textContent = 'Updating...';
          const updateRes = await fetch('/api/users/' + user.user_id, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
              password: nxt
            })
          });

          const updateJson = await updateRes.json();
          if (!updateRes.ok) {
            throw new Error(updateJson.message || 'Failed to update password');
          }

          closeAllModals();
          showToast('Password updated successfully!');
        } catch (err) {
          if (alertBox) {
            alertBox.textContent = err.message;
            alertBox.classList.remove('hidden');
          }
        } finally {
          savePassBtn.disabled = false;
          savePassBtn.textContent = 'Update Password';
        }
      };
    }

    // --- Action 4: Open Account Settings ---
    function openAccountSettings() {
      closeAllModals();
      const menu = document.getElementById('profileDropdownMenu');
      if (menu) menu.classList.remove('show');

      let savedSettings = {};
      try {
        const raw = localStorage.getItem('portal_admin_settings');
        if (raw) savedSettings = JSON.parse(raw);
      } catch (e) {}

      const densityEl = document.getElementById('settingDensity');
      if (densityEl && savedSettings.density) densityEl.value = savedSettings.density;

      const alertsEl = document.getElementById('settingAlerts');
      if (alertsEl && savedSettings.alerts) alertsEl.value = savedSettings.alerts;

      const refreshEl = document.getElementById('settingRefresh');
      if (refreshEl && savedSettings.refresh) refreshEl.value = savedSettings.refresh;

      if (settingsModal) settingsModal.classList.remove('hidden');
    }

    const dropdownSettings = document.getElementById('dropdownAccountSettings');
    if (dropdownSettings) dropdownSettings.onclick = openAccountSettings;

    // Save Settings
    const saveSettingsBtn = document.getElementById('sharedSettingsSaveBtn');
    if (saveSettingsBtn) {
      saveSettingsBtn.onclick = function () {
        const density = document.getElementById('settingDensity').value;
        const alerts = document.getElementById('settingAlerts').value;
        const refresh = document.getElementById('settingRefresh').value;

        const settingsObj = { density: density, alerts: alerts, refresh: refresh, updated_at: new Date().toISOString() };
        localStorage.setItem('portal_admin_settings', JSON.stringify(settingsObj));

        closeAllModals();
        showToast('Account settings saved successfully!');
      };
    }
  }

  /**
   * 8. Execution Lifecycle
   */
  function initShell() {
    renderAdminSidebar();
    renderHeaderProfile();
    ensureNotificationBell();
    highlightActiveSidebarLink();
    initDropdownEvents();
    initMobileSidebar();
    initModalEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShell);
  } else {
    initShell();
  }

  window.addEventListener('load', function () {
    setTimeout(function () {
      highlightActiveSidebarLink();
    }, 100);
  });
})();
