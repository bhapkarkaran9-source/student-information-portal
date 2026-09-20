/**
 * Teacher Shell Global Controller - Student Information Portal
 * Enforces unified Fixed Sidebar, automatic active link highlighting,
 * sticky header with faculty avatar, 6-item profile dropdown popover,
 * mobile drawer toggle, and shared modals across all teacher pages.
 */

(function () {
  'use strict';

  const TEACHER_ROLE = 'TEACHER';
  const TEACHER_DEFAULT_NAME = 'Faculty Teacher';
  const TEACHER_DEFAULT_EMAIL = 'teacher@studentportal.local';

  // Canonical Teacher Navigation Items (14 Standalone Modules)
  const TEACHER_NAV_GROUPS = [
    {
      group: 'Faculty Workspace',
      items: [
        {
          name: 'Dashboard',
          href: '/pages/teacher/dashboard.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>'
        },
        {
          name: 'My Profile',
          href: '/pages/teacher/profile.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
        },
        {
          name: 'My Courses',
          href: '/pages/teacher/courses.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>'
        },
        {
          name: 'My Students',
          href: '/pages/teacher/students.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>'
        }
      ]
    },
    {
      group: 'Instruction & Academics',
      items: [
        {
          name: 'Attendance',
          href: '/pages/teacher/attendance.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>'
        },
        {
          name: 'Grades',
          href: '/pages/teacher/grades.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>'
        },
        {
          name: 'Timetable',
          href: '/pages/teacher/timetable.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>'
        },
        {
          name: 'Academic Calendar',
          href: '/pages/teacher/calendar.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><circle cx="8" cy="15" r="1"></circle><circle cx="12" cy="15" r="1"></circle><circle cx="16" cy="15" r="1"></circle></svg>'
        },
        {
          name: 'Assignments',
          href: '/pages/teacher/assignments.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>'
        },
        {
          name: 'Study Material',
          href: '/pages/teacher/study-material.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>'
        }
      ]
    },
    {
      group: 'Communication & Analytics',
      items: [
        {
          name: 'Notices',
          href: '/pages/teacher/notices.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>'
        },
        {
          name: 'Notifications',
          href: '/pages/teacher/notifications.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"></path></svg>'
        },
        {
          name: 'Queries',
          href: '/pages/teacher/queries.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>'
        },
        {
          name: 'Reports',
          href: '/pages/teacher/reports.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>'
        },
        {
          name: 'Performance',
          href: '/pages/teacher/performance.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>'
        },
        {
          name: 'Feedback',
          href: '/pages/teacher/feedback.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>'
        },
        {
          name: 'Email Preferences',
          href: '/pages/teacher/email-preferences.html',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>'
        }
      ]
    }
  ];

  function getStoredTeacher() {
    try {
      const u = localStorage.getItem('user') || sessionStorage.getItem('user');
      if (u) return JSON.parse(u);
    } catch (e) {}
    return {
      username: 'teacher',
      first_name: 'Faculty',
      last_name: 'Teacher',
      email: TEACHER_DEFAULT_EMAIL,
      role: TEACHER_ROLE
    };
  }

  function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /**
   * 1. Render / Standardize Teacher Sidebar
   */
  function renderTeacherSidebar() {
    let sidebar = document.getElementById('teacherSidebar');
    if (!sidebar) {
      sidebar = document.createElement('aside');
      sidebar.id = 'teacherSidebar';
      sidebar.className = 'teacher-sidebar';
      sidebar.setAttribute('aria-label', 'Faculty Navigation');
      document.body.insertBefore(sidebar, document.body.firstChild);
    }

    let navHtml = '';
    TEACHER_NAV_GROUPS.forEach(g => {
      navHtml += '<div class="nav-group-title">' + g.group + '</div><ul class="nav-list">';
      g.items.forEach(item => {
        navHtml += '<li><a href="' + item.href + '" class="nav-link">' + item.icon + '<span>' + item.name + '</span></a></li>';
      });
      navHtml += '</ul>';
    });

    const user = getStoredTeacher();
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || TEACHER_DEFAULT_NAME;
    const initial = (user.first_name ? user.first_name[0] : (user.username ? user.username[0] : 'T')).toUpperCase();
    const avatarHtml = user.profile_photo_url
      ? '<img src="' + escapeHtml(user.profile_photo_url) + '" alt="' + escapeHtml(fullName) + ' avatar" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" onerror="this.onerror=null;this.parentElement.textContent=\'' + initial + '\';">'
      : initial;

    sidebar.innerHTML = 
      '<div class="sidebar-header">' +
        '<a href="/pages/teacher/dashboard.html" class="sidebar-brand">' +
          '<div class="sidebar-logo" aria-hidden="true" style="background: linear-gradient(135deg, #0d9488, #059669);">' +
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>' +
              '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>' +
            '</svg>' +
          '</div>' +
          '<div class="sidebar-title">' +
            '<span class="brand-main">Student Portal</span>' +
            '<span class="brand-sub">FACULTY</span>' +
          '</div>' +
        '</a>' +
        '<button type="button" id="closeSidebarBtn" class="sidebar-close-btn" aria-label="Close menu">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<line x1="18" y1="6" x2="6" y2="18"></line>' +
            '<line x1="6" y1="6" x2="18" y2="18"></line>' +
          '</svg>' +
        '</button>' +
      '</div>' +
      '<nav class="sidebar-nav" id="teacherSidebarNav">' +
        navHtml +
      '</nav>' +
      '<div class="sidebar-footer">' +
        '<div class="sidebar-user">' +
          '<div class="sidebar-avatar" id="sidebarAvatar" style="background: linear-gradient(135deg, #0d9488, #059669);">' + avatarHtml + '</div>' +
          '<div class="sidebar-user-info">' +
            '<span class="sidebar-user-name" id="sidebarUserName">' + escapeHtml(fullName) + '</span>' +
            '<span class="sidebar-user-role">TEACHER</span>' +
          '</div>' +
        '</div>' +
        '<button type="button" id="sidebarLogoutBtn" class="btn-sidebar-logout" title="Sign Out" aria-label="Sign Out">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>' +
            '<polyline points="16 17 21 12 16 7"></polyline>' +
            '<line x1="21" y1="12" x2="9" y2="12"></line>' +
          '</svg>' +
        '</button>' +
      '</div>';

    let backdrop = document.getElementById('sidebarBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'sidebarBackdrop';
      backdrop.className = 'sidebar-backdrop hidden';
      document.body.insertBefore(backdrop, sidebar);
    }
  }

  /**
   * 2. Highlight Active Sidebar Link dynamically
   */
  function highlightActiveTeacherLink() {
    const currentPath = window.location.pathname.toLowerCase();
    const currentSearch = window.location.search.toLowerCase();

    const navLinks = document.querySelectorAll('#teacherSidebar .nav-link');
    let matchedLink = null;

    navLinks.forEach(link => {
      link.classList.remove('active');
      const href = (link.getAttribute('href') || '').toLowerCase();

      if (href.includes('?') && currentSearch) {
        const linkQuery = href.split('?')[1];
        if (currentSearch.includes(linkQuery)) {
          matchedLink = link;
        }
      } else if (!matchedLink && !href.includes('?') && !href.includes('#')) {
        const linkPath = href.split('/').pop();
        const curFile = currentPath.split('/').pop();
        if (linkPath === curFile) {
          matchedLink = link;
        }
      }
    });

    if (!matchedLink && currentPath.includes('reports.html')) {
      navLinks.forEach(l => {
        if (l.getAttribute('href') === '/pages/teacher/reports.html') matchedLink = l;
      });
    }

    if (!matchedLink && currentPath.includes('dashboard.html')) {
      navLinks.forEach(l => {
        if (l.getAttribute('href') === '/pages/teacher/dashboard.html') matchedLink = l;
      });
    }

    if (matchedLink) {
      matchedLink.classList.add('active');
    }
  }

  /**
   * 3. Render / Standardize Teacher Header
   */
  function renderTeacherHeader() {
    let header = document.getElementById('teacherHeader');
    if (!header) {
      header = document.querySelector('.portal-navbar');
    }
    if (!header) return;

    header.className = 'teacher-header';
    header.id = 'teacherHeader';

    const user = getStoredTeacher();
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || TEACHER_DEFAULT_NAME;
    const initial = (user.first_name ? user.first_name[0] : (user.username ? user.username[0] : 'T')).toUpperCase();
    const pageTitle = document.title.split('-')[0].trim() || 'Faculty Portal';
    const headerAvatarHtml = user.profile_photo_url
      ? '<img src="' + escapeHtml(user.profile_photo_url) + '" alt="' + escapeHtml(fullName) + ' avatar" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" onerror="this.onerror=null;this.parentElement.textContent=\'' + initial + '\';">'
      : initial;

    header.innerHTML = 
      '<div class="header-left">' +
        '<button type="button" id="toggleSidebarBtn" class="sidebar-toggle-btn" aria-label="Open menu">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<line x1="3" y1="12" x2="21" y2="12"></line>' +
            '<line x1="3" y1="6" x2="21" y2="6"></line>' +
            '<line x1="3" y1="18" x2="21" y2="18"></line>' +
          '</svg>' +
        '</button>' +
        '<div class="header-heading-group">' +
          '<h1 class="header-title">' + escapeHtml(pageTitle) + '</h1>' +
          '<div class="header-breadcrumb">' +
            '<a href="/pages/teacher/dashboard.html">Home</a>' +
            '<span>/</span>' +
            '<span>' + (pageTitle.toLowerCase().includes('dashboard') ? 'Dashboard' : escapeHtml(pageTitle)) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="header-right">' +
        '<button type="button" id="headerNotificationBtn" class="header-notify-btn" title="View notifications" aria-label="Notifications">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>' +
            '<path d="M13.73 21a2 2 0 0 1-3.46 0"></path>' +
          '</svg>' +
          '<span id="headerNotificationDot" class="header-notify-badge" style="display:none;"></span>' +
        '</button>' +
        '<div class="profile-dropdown-wrapper" id="profileDropdownWrapper">' +
          '<button type="button" id="profileDropdownBtn" class="header-profile-btn" aria-haspopup="true" aria-expanded="false" aria-label="User profile menu">' +
            '<div class="header-avatar" id="headerUserAvatar" style="background: linear-gradient(135deg, #0d9488, #059669);">' + headerAvatarHtml + '</div>' +
            '<div class="header-profile-meta">' +
              '<span class="header-profile-name" id="navUserName">' + escapeHtml(fullName) + '</span>' +
              '<span class="header-profile-badge" id="userRoleBadge" style="background-color: #ccfbf1; color: #0f766e;">TEACHER</span>' +
            '</div>' +
            '<svg class="dropdown-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              '<polyline points="6 9 12 15 18 9"></polyline>' +
            '</svg>' +
          '</button>' +
          '<div class="profile-dropdown-menu" id="profileDropdownMenu" role="menu">' +
            '<div class="dropdown-user-header">' +
              '<div class="dropdown-user-name" id="dropdownUserName">' + escapeHtml(fullName) + '</div>' +
              '<div class="dropdown-user-email" id="dropdownUserEmail">' + escapeHtml(user.email || TEACHER_DEFAULT_EMAIL) + '</div>' +
            '</div>' +
            '<button type="button" class="dropdown-item" id="btnMyProfile" role="menuitem">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' +
              '<span>My Profile</span>' +
            '</button>' +
            '<button type="button" class="dropdown-item" id="btnEditProfile" role="menuitem">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
              '<span>Edit Profile</span>' +
            '</button>' +
            '<button type="button" class="dropdown-item" id="btnChangePassword" role="menuitem">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
              '<span>Change Password</span>' +
            '</button>' +
            '<button type="button" class="dropdown-item" id="btnAccountSettings" role="menuitem">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>' +
              '<span>Account Settings</span>' +
            '</button>' +
            '<div class="dropdown-divider"></div>' +
            '<button type="button" class="dropdown-item dropdown-item-danger" id="logoutBtn" role="menuitem">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>' +
              '<span>Sign Out</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function closeAllModals() {
    if (window.UserMenu && window.UserMenu.closeAllModals) {
      window.UserMenu.closeAllModals();
      return;
    }
    const overlays = document.querySelectorAll('.modal-overlay, #profileModal');
    overlays.forEach(m => m.classList.add('hidden'));
  }

  /**
   * 4. Dropdown Menu Events (Click, Outside Click, Escape key)
   */
  function initDropdownEvents() {
    if (window.UserMenu) return; // UserMenu manages profile dropdown, outside click, and Escape key
    const dropdownBtn = document.getElementById('profileDropdownBtn');
    const dropdownMenu = document.getElementById('profileDropdownMenu');

    if (!dropdownBtn || !dropdownMenu) return;

    function closeMenu() {
      dropdownMenu.classList.remove('show');
      dropdownBtn.setAttribute('aria-expanded', 'false');
    }

    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdownMenu.classList.contains('show');
      if (isOpen) {
        closeMenu();
      } else {
        dropdownMenu.classList.add('show');
        dropdownBtn.setAttribute('aria-expanded', 'true');
      }
    });

    document.addEventListener('click', (e) => {
      if (!dropdownMenu.contains(e.target) && !dropdownBtn.contains(e.target)) {
        closeMenu();
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        closeMenu();
        closeAllModals();
      }
    });

    const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
    if (sidebarLogoutBtn) {
      sidebarLogoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof logout === 'function') logout();
        else window.location.replace('/login.html');
      });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof logout === 'function') logout();
        else window.location.replace('/login.html');
      });
    }
  }

  /**
   * 5. Mobile Drawer Toggle (Toggle, Close, Backdrop, Escape, Nav-links, Scroll-lock)
   */
  function initMobileDrawer() {
    const sidebar = document.getElementById('teacherSidebar');
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

    function openDrawer() {
      sidebar.classList.add('open');
      if (backdrop) backdrop.classList.remove('hidden');
      document.body.classList.add('sidebar-open');
      document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
      sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.add('hidden');
      document.body.classList.remove('sidebar-open');
      document.body.style.overflow = '';
    }

    function toggleDrawer() {
      if (sidebar.classList.contains('open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    }

    // Use capturing event listener to handle clicks and stop immediate propagation
    document.addEventListener('click', function (e) {
      const toggleBtn = e.target.closest('#toggleSidebarBtn, #sidebarToggleBtn, .sidebar-toggle-btn');
      if (toggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toggleDrawer();
        return;
      }

      const closeBtn = e.target.closest('#closeSidebarBtn, #sidebarCloseBtn, .sidebar-close-btn');
      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeDrawer();
        return;
      }

      const clickedBackdrop = e.target.closest('#sidebarBackdrop, .sidebar-backdrop');
      if (clickedBackdrop) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeDrawer();
        return;
      }

      // Close mobile drawer when any navigation link inside sidebar is tapped
      const navLink = e.target.closest('.sidebar-nav .nav-link, .nav-link');
      if (navLink && sidebar.contains(navLink)) {
        if (window.innerWidth <= 1024) {
          closeDrawer();
        }
      }
    }, true);

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && sidebar.classList.contains('open')) {
        closeDrawer();
      }
    });

    // Close on screen resize > 1024px
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1024 && sidebar.classList.contains('open')) {
        closeDrawer();
      }
    });
  }

  /**
   * 6. Shared Modals Injection & Events
   */
  function initModals() {
    const user = getStoredTeacher();

    if (!document.getElementById('myProfileModal')) {
      const modalsContainer = document.createElement('div');
      modalsContainer.innerHTML = 
        '<div id="myProfileModal" class="modal-overlay hidden" role="dialog" aria-modal="true">' +
          '<div class="modal-card">' +
            '<div class="modal-header">' +
              '<h3 class="modal-title">Faculty Profile</h3>' +
              '<button type="button" class="modal-close-btn" data-close-modal="myProfileModal">&times;</button>' +
            '</div>' +
            '<div class="modal-body">' +
              '<div style="text-align: center; margin-bottom: 20px;">' +
                '<div class="header-avatar" id="modalAvatar" style="width: 64px; height: 64px; font-size: 24px; margin: 0 auto 10px; background: linear-gradient(135deg, #0d9488, #059669);">' + (user.first_name ? user.first_name[0] : 'T').toUpperCase() + '</div>' +
                '<h4 style="margin: 0; font-size: 16px; font-weight: 700;" id="modalProfileName">' + escapeHtml(user.first_name || user.username) + '</h4>' +
                '<span class="badge badge-teacher" style="margin-top: 4px;">FACULTY</span>' +
              '</div>' +
              '<ul class="profile-summary-list">' +
                '<li class="profile-summary-item">' +
                  '<span class="profile-summary-lbl">Username</span>' +
                  '<span class="profile-summary-val" id="modalProfileUsername">' + escapeHtml(user.username) + '</span>' +
                '</li>' +
                '<li class="profile-summary-item">' +
                  '<span class="profile-summary-lbl">Email</span>' +
                  '<span class="profile-summary-val" id="modalProfileEmail">' + escapeHtml(user.email || 'N/A') + '</span>' +
                '</li>' +
                '<li class="profile-summary-item">' +
                  '<span class="profile-summary-lbl">Designation</span>' +
                  '<span class="profile-summary-val">Assistant Professor</span>' +
                '</li>' +
                '<li class="profile-summary-item">' +
                  '<span class="profile-summary-lbl">Status</span>' +
                  '<span class="profile-summary-val"><span class="badge badge-success">Active Faculty</span></span>' +
                '</li>' +
              '</ul>' +
            '</div>' +
            '<div class="modal-footer">' +
              '<button type="button" class="btn btn-secondary" data-close-modal="myProfileModal">Close</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modalsContainer);
    }

    const btnMyProfile = document.getElementById('btnMyProfile');
    if (btnMyProfile) {
      btnMyProfile.addEventListener('click', () => openModal('myProfileModal'));
    }

    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        closeModal(btn.getAttribute('data-close-modal'));
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });
  }

  function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('hidden');
  }

  function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('hidden');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
  }

  function initTeacherShell() {
    document.body.classList.add('teacher-portal-body');

    const main = document.querySelector('.dashboard-main, main');
    if (main && !main.parentElement.classList.contains('teacher-main-wrapper')) {
      const header = document.querySelector('header');
      const wrapper = document.createElement('div');
      wrapper.className = 'teacher-main-wrapper';

      if (header) {
        header.parentNode.insertBefore(wrapper, header);
        wrapper.appendChild(header);
      } else if (main) {
        main.parentNode.insertBefore(wrapper, main);
      }
      wrapper.appendChild(main);
    }

    renderTeacherSidebar();
    renderTeacherHeader();
    highlightActiveTeacherLink();
    initDropdownEvents();
    initMobileDrawer();
    initModals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTeacherShell);
  } else {
    initTeacherShell();
  }

  window.addEventListener('load', () => {
    setTimeout(highlightActiveTeacherLink, 50);
  });
})();