/**
 * Teacher Assigned Courses Controller - Student Information Portal
 * Real backend connection to /api/courses with graceful baseline zero-state handling.
 * 100% Zero Images | Pure CSS Gradients & SVGs | Accessible ERP Theme
 */

(function () {
  'use strict';

  let allCourses = [];

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function initCourses() {
    if (typeof requireAuth === 'function') {
      const isAuthed = requireAuth('TEACHER');
      if (!isAuthed) return;
    }

    const searchInput = document.getElementById('courseSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        filterCourses(e.target.value.trim().toLowerCase());
      });
    }

    await loadCourses();
    await loadNotificationsCount();
  }

  async function loadCourses() {
    try {
      const res = await apiFetch('/api/courses?all=true');
      if (res && res.success && res.data) {
        allCourses = Array.isArray(res.data) ? res.data : (res.data.courses || []);
      } else {
        allCourses = [];
      }

      updateKPIs(allCourses);
      renderCourses(allCourses);
    } catch (err) {
      console.error('Failed to load courses:', err);
      allCourses = [];
      updateKPIs([]);
      renderCourses([]);
    }
  }

  function updateKPIs(courses) {
    const totalEl = document.getElementById('statTotalCourses');
    if (totalEl) totalEl.textContent = courses.length;

    let totalCredits = 0;
    let labCount = 0;

    courses.forEach(c => {
      totalCredits += parseInt(c.credits, 10) || 0;
      if (c.course_type === 'Practical' || c.course_type === 'Combined') {
        labCount++;
      }
    });

    const creditsEl = document.getElementById('statTotalCredits');
    if (creditsEl) creditsEl.textContent = totalCredits;

    const labsEl = document.getElementById('statLabCourses');
    if (labsEl) labsEl.textContent = labCount;
  }

  function filterCourses(query) {
    if (!query) {
      renderCourses(allCourses);
      return;
    }

    const filtered = allCourses.filter(c => {
      const code = (c.course_code || '').toLowerCase();
      const name = (c.course_name || '').toLowerCase();
      const dept = (c.department_name || c.department_code || '').toLowerCase();
      return code.includes(query) || name.includes(query) || dept.includes(query);
    });

    renderCourses(filtered, true);
  }

  function renderCourses(courses, isFiltered = false) {
    const container = document.getElementById('coursesContainer');
    if (!container) return;

    if (!courses || courses.length === 0) {
      container.innerHTML = `
        <div class="teacher-empty-state" style="padding: 48px 24px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
          <div class="teacher-empty-icon" style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #ccfbf1; display: flex; align-items: center; justify-content: center; color: #0d9488;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: #0f172a;">${isFiltered ? 'No Matching Courses Found' : 'No Assigned Courses Found'}</h3>
          <p style="color: #64748b; max-width: 480px; margin: 0 auto; font-size: 14px;">
            ${isFiltered ? 'No courses match your search criteria. Try a different course title or code.' : 'There are no active courses or subjects currently assigned to your instruction load for this semester.'}
          </p>
        </div>`;
      return;
    }

    let html = `
      <div class="teacher-table-responsive" style="overflow-x: auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
        <table class="teacher-table" style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left; color: #475569;">
              <th style="padding: 12px 16px;">Course Code</th>
              <th style="padding: 12px 16px;">Course Title</th>
              <th style="padding: 12px 16px;">Department</th>
              <th style="padding: 12px 16px;">Credits</th>
              <th style="padding: 12px 16px;">Type</th>
              <th style="padding: 12px 16px;">Semester</th>
              <th style="padding: 12px 16px; text-align: right;">Academic Actions</th>
            </tr>
          </thead>
          <tbody>`;

    courses.forEach(c => {
      const typeBadge = c.course_type === 'Practical'
        ? '<span class="teacher-meta-chip" style="color: #0369a1; background: #e0f2fe; border: none; padding: 2px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 600;">Practical</span>'
        : c.course_type === 'Combined'
        ? '<span class="teacher-meta-chip" style="color: #7c2d12; background: #ffedd5; border: none; padding: 2px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 600;">Combined</span>'
        : '<span class="teacher-meta-chip" style="color: #0f766e; background: #ccfbf1; border: none; padding: 2px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 600;">Theory</span>';

      html += `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 14px 16px; font-weight: 700; color: #0d9488;">${escapeHtml(c.course_code)}</td>
          <td style="padding: 14px 16px; font-weight: 600; color: #0f172a;">${escapeHtml(c.course_name)}</td>
          <td style="padding: 14px 16px; color: #475569;">${escapeHtml(c.department_name || c.department_code || '-')}</td>
          <td style="padding: 14px 16px; color: #475569;">${escapeHtml(c.credits || '3')}</td>
          <td style="padding: 14px 16px;">${typeBadge}</td>
          <td style="padding: 14px 16px; color: #475569;">Sem ${escapeHtml(c.semester || '-')}</td>
          <td style="padding: 14px 16px; text-align: right;">
            <div style="display: inline-flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
              <a href="/pages/teacher/attendance.html?course_id=${c.course_id}" class="teacher-btn-outline" style="padding: 4px 10px; font-size: 12px; text-decoration: none; border-radius: 4px; border: 1px solid #cbd5e1; color: #334155; font-weight: 600;">Attendance</a>
              <a href="/pages/teacher/grades.html?course_id=${c.course_id}" class="teacher-btn-outline" style="padding: 4px 10px; font-size: 12px; text-decoration: none; border-radius: 4px; border: 1px solid #cbd5e1; color: #334155; font-weight: 600;">Grades</a>
              <a href="/pages/teacher/assignments.html?course_id=${c.course_id}" class="teacher-btn-outline" style="padding: 4px 10px; font-size: 12px; text-decoration: none; border-radius: 4px; border: 1px solid #cbd5e1; color: #334155; font-weight: 600;">Assignments</a>
              <a href="/pages/teacher/study-material.html?course_id=${c.course_id}" class="teacher-btn-outline" style="padding: 4px 10px; font-size: 12px; text-decoration: none; border-radius: 4px; border: 1px solid #cbd5e1; color: #334155; font-weight: 600;">Materials</a>
            </div>
          </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
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

  document.addEventListener('DOMContentLoaded', initCourses);
})();
