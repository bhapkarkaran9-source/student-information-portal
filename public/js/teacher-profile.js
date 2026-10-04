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

  function extractDepartments(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (res.departments && Array.isArray(res.departments)) return res.departments;
    if (res.data) {
      if (Array.isArray(res.data)) return res.data;
      if (res.data.departments && Array.isArray(res.data.departments)) return res.data.departments;
      if (res.data.data) {
        if (Array.isArray(res.data.data)) return res.data.data;
        if (res.data.data.departments && Array.isArray(res.data.data.departments)) return res.data.data.departments;
      }
    }
    if (res.results && Array.isArray(res.results)) return res.results;
    return [];
  }

  async function loadDepartmentsForTeacherCompletion(selectedDeptId = null) {
    const cpDeptSelect = document.getElementById('cpDeptSelect');
    if (!cpDeptSelect) return;
    cpDeptSelect.innerHTML = '<option value="">Loading departments...</option>';
    try {
      const res = await apiFetch('/api/departments?all=true');
      const depts = extractDepartments(res);
      const activeDepts = depts.filter(d => d.is_active === 1 || d.is_active === true || d.is_active === '1');
      if (activeDepts.length === 0) {
        cpDeptSelect.innerHTML = '<option value="">No departments available</option>';
        return;
      }
      let options = '<option value="">Select Department</option>';
      activeDepts.forEach(d => {
        const isSelected = selectedDeptId && String(d.department_id) === String(selectedDeptId) ? ' selected' : '';
        const codePart = d.department_code ? ` (${escapeHtml(d.department_code)})` : '';
        options += `<option value="${d.department_id}"${isSelected}>${escapeHtml(d.department_name)}${codePart}</option>`;
      });
      cpDeptSelect.innerHTML = options;
    } catch (e) {
      console.warn('Failed to load departments for teacher completion:', e);
      cpDeptSelect.innerHTML = '<option value="">No departments available</option>';
    }
  }

  async function loadProfileData() {
    try {
      const res = await apiFetch('/api/users/me');
      if (!res || !res.success || !res.data || !res.data.user) {
        return;
      }

      const u = res.data.user;

      // Handle incomplete profile state
      const isProfileComplete = u.is_profile_complete === true || u.is_profile_complete === 1 || u.is_profile_complete === '1';
      if (!isProfileComplete) {
        const compContainer = document.getElementById('profileCompletionContainer');
        const normContent = document.getElementById('normalProfileContent');
        if (compContainer) compContainer.classList.remove('hidden');
        if (normContent) normContent.classList.add('hidden');

        await loadDepartmentsForTeacherCompletion(u.department_id);

        // Default joining date to today
        const cpJoiningDate = document.getElementById('cpJoiningDate');
        if (cpJoiningDate && !cpJoiningDate.value) {
          cpJoiningDate.value = new Date().toISOString().split('T')[0];
        }

        // Form handler
        const form = document.getElementById('completeTeacherProfileForm');
        if (form && !form.dataset.bound) {
          form.dataset.bound = 'true';
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const alertBox = document.getElementById('cpAlert');
            if (alertBox) alertBox.classList.add('hidden');

            const first_name = document.getElementById('cpFirstName').value.trim();
            const last_name = document.getElementById('cpLastName').value.trim();
            const email = document.getElementById('cpEmail').value.trim();
            const phone = document.getElementById('cpPhone').value.trim() || null;
            const employee_number = document.getElementById('cpEmployeeNumber').value.trim();
            const department_id = document.getElementById('cpDeptSelect').value;
            const designation = document.getElementById('cpDesignation').value.trim();
            const joining_date = document.getElementById('cpJoiningDate').value;

            if (!first_name || !last_name || !email || !employee_number || !department_id || !designation || !joining_date) {
              if (alertBox) {
                alertBox.textContent = 'Please fill in all required fields (*).';
                alertBox.classList.remove('hidden');
              }
              return;
            }

            const btn = document.getElementById('btnSubmitCompleteTeacherProfile');
            if (btn) {
              btn.disabled = true;
              btn.textContent = 'Saving Profile...';
            }

            try {
              const resComp = await apiFetch('/api/teachers/complete-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  first_name,
                  last_name,
                  email,
                  phone,
                  employee_number,
                  department_id: parseInt(department_id, 10),
                  designation,
                  joining_date
                })
              });

              if (resComp && resComp.success && resComp.data && resComp.data.user) {
                const updatedUser = resComp.data.user;
                localStorage.setItem('user', JSON.stringify(updatedUser));
                if (typeof showToast === 'function') showToast('Profile completed successfully!', 'success');
                setTimeout(() => {
                  window.location.href = '/pages/teacher/dashboard.html';
                }, 800);
              } else {
                if (alertBox) {
                  alertBox.textContent = resComp?.message || 'Failed to complete profile.';
                  alertBox.classList.remove('hidden');
                }
              }
            } catch (err) {
              if (alertBox) {
                alertBox.textContent = 'Network communication error.';
                alertBox.classList.remove('hidden');
              }
            } finally {
              if (btn) {
                btn.disabled = false;
                btn.textContent = 'Complete & Save Profile';
              }
            }
          });
        }

        return; // Skip normal profile rendering when profile is incomplete
      }

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
