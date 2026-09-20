/**
 * Teacher Profile Controller - Student Information Portal
 * Connects /api/users/me to real faculty profile details.
 * 100% Zero Images | Pure CSS Gradients & SVGs | Accessible ERP Theme
 */

(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function initProfile() {
    if (typeof requireAuth === 'function') {
      const isAuthed = requireAuth('TEACHER');
      if (!isAuthed) return;
    }

    // Wire action buttons
    const editBtn = document.getElementById('btnTeacherEditProfile');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        if (window.UserMenu && typeof window.UserMenu.openEditProfile === 'function') {
          window.UserMenu.openEditProfile();
        }
      });
    }

    const passBtn = document.getElementById('btnTeacherChangePassword');
    if (passBtn) {
      passBtn.addEventListener('click', () => {
        if (window.UserMenu && typeof window.UserMenu.openChangePassword === 'function') {
          window.UserMenu.openChangePassword();
        }
      });
    }

    await loadProfileData();
    await loadNotificationsCount();
  }

  async function loadProfileData() {
    try {
      const res = await apiFetch('/api/users/me');
      if (!res || !res.success || !res.data || !res.data.user) {
        return;
      }

      const u = res.data.user;
      const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Faculty Member';
      const initial = (u.first_name || u.username || 'T').charAt(0).toUpperCase();

      const largeAvatar = document.getElementById('profileLargeAvatar');
      if (largeAvatar) {
        if (typeof window.renderAvatarElement === 'function') {
          window.renderAvatarElement(largeAvatar, u.profile_photo_url, initial, fullName + ' profile photo');
        } else if (u.profile_photo_url) {
          largeAvatar.innerHTML = `<img src="${u.profile_photo_url}" alt="${fullName}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" onerror="this.onerror=null;this.parentElement.textContent='${initial}'">`;
        } else {
          largeAvatar.textContent = initial;
        }
      }

      const profFullName = document.getElementById('profFullName');
      if (profFullName) profFullName.textContent = fullName;

      const profRole = document.getElementById('profRole');
      if (profRole) profRole.textContent = u.role || 'TEACHER';

      const profDept = document.getElementById('profDepartment');
      if (profDept) profDept.textContent = u.department_name || 'Department Faculty';

      const detUsername = document.getElementById('detUsername');
      if (detUsername) detUsername.textContent = u.username || '-';

      const detFullName = document.getElementById('detFullName');
      if (detFullName) detFullName.textContent = fullName;

      const detDesignation = document.getElementById('detDesignation');
      if (detDesignation) detDesignation.textContent = u.designation || 'Faculty Member';

      const detDept = document.getElementById('detDept');
      if (detDept) detDept.textContent = u.department_name || '-';

      const detStatus = document.getElementById('detStatus');
      if (detStatus) {
        detStatus.textContent = u.is_active ? 'Active' : 'Inactive';
        detStatus.style.color = u.is_active ? '#0f766e' : '#dc2626';
      }

      const detEmail = document.getElementById('detEmail');
      if (detEmail) detEmail.textContent = u.email || '-';

      const detPhone = document.getElementById('detPhone');
      if (detPhone) detPhone.textContent = u.phone || 'Not Provided';

      const detCreatedAt = document.getElementById('detCreatedAt');
      if (detCreatedAt) {
        detCreatedAt.textContent = u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }) : '-';
      }

      const badge = document.getElementById('profileStatusBadge');
      if (badge) {
        badge.textContent = u.is_active ? 'Active Faculty' : 'Inactive Account';
        badge.style.background = u.is_active ? '#ccfbf1' : '#fee2e2';
        badge.style.color = u.is_active ? '#0f766e' : '#991b1b';
      }
    } catch (err) {
      console.error('Failed to load profile details:', err);
    }
  }

  async function loadNotificationsCount() {
    try {
      const res = await apiFetch('/api/notifications/unread-count');
      const badge = document.getElementById('headerNotificationDot');
      if (badge && res && res.success && res.data && res.data.unread_count > 0) {
        badge.textContent = res.data.unread_count;
        badge.classList.remove('hidden');
        badge.style.display = 'inline-flex';
      }
    } catch (err) {
      // Graceful fallback
    }
  }

  document.addEventListener('DOMContentLoaded', initProfile);
})();
