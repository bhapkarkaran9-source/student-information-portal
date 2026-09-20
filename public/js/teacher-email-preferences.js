/**
 * Faculty/Teacher Email Preferences Controller - Student Information Portal
 * Handles loading, toggling, and saving faculty email notification preferences.
 */

(function () {
  'use strict';

  let isSubmitting = false;

  // DOM Elements
  const masterToggle = document.getElementById('email_enabled');
  const masterToggleStatus = document.getElementById('masterToggleStatus');
  const catToggles = {
    assignment_emails: document.getElementById('assignment_emails'),
    exam_emails: document.getElementById('exam_emails'),
    attendance_emails: document.getElementById('attendance_emails'),
    timetable_emails: document.getElementById('timetable_emails'),
    notice_emails: document.getElementById('notice_emails'),
    feedback_emails: document.getElementById('feedback_emails'),
    academic_event_emails: document.getElementById('academic_event_emails')
  };
  const prefCards = document.querySelectorAll('.pref-item-card');
  const saveBtn = document.getElementById('savePreferencesBtn');
  const saveSpinner = document.getElementById('saveBtnSpinner');
  const saveBtnText = document.getElementById('saveBtnText');
  const statusBanner = document.getElementById('statusBanner');

  /**
   * Verify Faculty/Teacher Authentication
   */
  function checkAuth() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) {
      window.location.replace('/login.html');
      return false;
    }

    try {
      const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      if (user && user.role && user.role.toUpperCase() !== 'TEACHER') {
        window.location.replace('/login.html');
        return false;
      }
    } catch (e) {}

    return true;
  }

  function getAuthToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  }

  /**
   * Display floating toast notification
   */
  function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
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
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  /**
   * Display inline status banner
   */
  function showStatusBanner(message, type = 'info') {
    if (!statusBanner) return;
    statusBanner.className = `status-banner ${type}`;
    statusBanner.textContent = message;
    statusBanner.classList.remove('hidden');

    if (type === 'success') {
      setTimeout(() => {
        if (statusBanner && statusBanner.classList.contains('success')) {
          statusBanner.classList.add('hidden');
        }
      }, 6000);
    }
  }

  function clearStatusBanner() {
    if (!statusBanner) return;
    statusBanner.className = 'status-banner hidden';
    statusBanner.textContent = '';
  }

  /**
   * Sync UI state when master toggle changes
   */
  function syncMasterState(enabled) {
    if (masterToggleStatus) {
      masterToggleStatus.textContent = enabled ? 'Enabled' : 'Disabled';
      if (enabled) {
        masterToggleStatus.classList.remove('disabled');
      } else {
        masterToggleStatus.classList.add('disabled');
      }
    }

    prefCards.forEach(card => {
      if (enabled) {
        card.classList.remove('is-master-disabled');
      } else {
        card.classList.add('is-master-disabled');
      }
    });

    Object.values(catToggles).forEach(input => {
      if (input) {
        input.disabled = !enabled;
      }
    });
  }

  /**
   * Load user preferences from backend
   */
  async function loadPreferences() {
    const token = getAuthToken();
    try {
      const res = await fetch('/api/email/preferences', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (res.status === 401 || res.status === 403) {
        showToast('Session expired or access denied. Please log in again.', 'error');
        setTimeout(() => window.location.replace('/login.html'), 1500);
        return;
      }

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load preferences.');
      }

      const data = result.data;
      if (masterToggle) {
        masterToggle.checked = Boolean(data.email_enabled);
      }

      Object.entries(catToggles).forEach(([key, input]) => {
        if (input) {
          input.checked = Boolean(data[key]);
        }
      });

      syncMasterState(Boolean(data.email_enabled));
    } catch (err) {
      console.error('Error loading faculty email preferences:', err);
      showStatusBanner('Could not load current email preferences. Please refresh the page.', 'error');
      showToast('Error loading preferences.', 'error');
    }
  }

  /**
   * Save user preferences to backend
   */
  async function savePreferences() {
    if (isSubmitting) return;

    isSubmitting = true;
    clearStatusBanner();

    if (saveBtn) saveBtn.disabled = true;
    if (saveSpinner) saveSpinner.classList.remove('hidden');
    if (saveBtnText) saveBtnText.textContent = 'Saving...';

    const token = getAuthToken();
    const payload = {
      email_enabled: masterToggle ? masterToggle.checked : true,
      assignment_emails: catToggles.assignment_emails ? catToggles.assignment_emails.checked : true,
      exam_emails: catToggles.exam_emails ? catToggles.exam_emails.checked : true,
      attendance_emails: catToggles.attendance_emails ? catToggles.attendance_emails.checked : true,
      timetable_emails: catToggles.timetable_emails ? catToggles.timetable_emails.checked : true,
      notice_emails: catToggles.notice_emails ? catToggles.notice_emails.checked : true,
      feedback_emails: catToggles.feedback_emails ? catToggles.feedback_emails.checked : true,
      academic_event_emails: catToggles.academic_event_emails ? catToggles.academic_event_emails.checked : true
    };

    try {
      const res = await fetch('/api/email/preferences', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to update preferences.');
      }

      showStatusBanner('Preferences saved successfully.', 'success');
      showToast('Email preferences updated successfully!', 'success');
    } catch (err) {
      console.error('Error saving faculty email preferences:', err);
      const msg = err.message || 'An error occurred while saving preferences.';
      showStatusBanner(msg, 'error');
      showToast(msg, 'error');
    } finally {
      isSubmitting = false;
      if (saveBtn) saveBtn.disabled = false;
      if (saveSpinner) saveSpinner.classList.add('hidden');
      if (saveBtnText) saveBtnText.textContent = 'Save Preferences';
    }
  }

  // Event Listeners
  if (masterToggle) {
    masterToggle.addEventListener('change', () => {
      syncMasterState(masterToggle.checked);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', savePreferences);
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    if (checkAuth()) {
      loadPreferences();
    }
  });

})();
