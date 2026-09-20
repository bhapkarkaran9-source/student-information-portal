/**
 * Teacher Students Roster Controller - Student Information Portal
 * Connects to /api/students and /api/attendance/summary with real-time search and filter.
 * 100% Zero Images | Pure CSS Gradients & SVGs | Accessible ERP Theme
 */

(function () {
  'use strict';

  let allStudents = [];

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function initStudents() {
    if (typeof requireAuth === 'function') {
      const isAuthed = requireAuth('TEACHER');
      if (!isAuthed) return;
    }

    const searchInput = document.getElementById('studentSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        filterStudents(e.target.value.trim().toLowerCase());
      });
    }

    await Promise.allSettled([
      loadStudents(),
      loadAttendanceSummary(),
      loadNotificationsCount()
    ]);
  }

  async function loadStudents() {
    try {
      const res = await apiFetch('/api/students?limit=100');
      if (res && res.success && res.data) {
        allStudents = Array.isArray(res.data) ? res.data : (res.data.students || []);
      } else {
        allStudents = [];
      }

      const totalEl = document.getElementById('statTotalStudents');
      if (totalEl) totalEl.textContent = allStudents.length;

      renderStudents(allStudents);
    } catch (err) {
      console.error('Failed to load students:', err);
      allStudents = [];
      renderStudents([]);
    }
  }

  async function loadAttendanceSummary() {
    try {
      const res = await apiFetch('/api/attendance/summary');
      if (res && res.success && res.data) {
        const lowList = res.data.lowAttendanceStudents || [];
        const lowEl = document.getElementById('statLowAttendance');
        if (lowEl) lowEl.textContent = lowList.length;

        const riskEl = document.getElementById('statAcademicRisk');
        if (riskEl) {
          riskEl.textContent = lowList.filter(s => {
            const pct = parseFloat(s.attendance_percentage !== undefined ? s.attendance_percentage : s.percentage);
            return !isNaN(pct) && pct < 60;
          }).length;
        }
      }
    } catch (err) {
      // Graceful fallback
    }
  }

  function filterStudents(query) {
    if (!query) {
      renderStudents(allStudents);
      return;
    }

    const filtered = allStudents.filter(s => {
      const prn = (s.prn_number || '').toLowerCase();
      const name = `${s.first_name || ''} ${s.last_name || ''} ${s.username || ''}`.toLowerCase();
      const cls = (s.class_name || '').toLowerCase();
      const div = (s.division || '').toLowerCase();
      const dept = (s.department_name || s.department || '').toLowerCase();
      const courses = (s.enrolled_courses || '').toLowerCase();
      return prn.includes(query) || name.includes(query) || cls.includes(query) || div.includes(query) || dept.includes(query) || courses.includes(query);
    });

    renderStudents(filtered, true);
  }

  function renderStudents(students, isFiltered = false) {
    const container = document.getElementById('studentsContainer');
    if (!container) return;

    if (!students || students.length === 0) {
      container.innerHTML = `
        <div id="emptyStudentsState" style="padding: 48px 24px; text-align: center;">
          <div style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; color: #64748b;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: #0f172a;">${isFiltered ? 'No Students Matched' : 'No Students Found'}</h3>
          <p style="color: #64748b; max-width: 460px; margin: 0 auto; font-size: 14px;">
            ${isFiltered ? 'No student records match your filter criteria.' : 'No student records are currently enrolled in your assigned courses.'}
          </p>
        </div>`;
      return;
    }

    let html = `
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left; color: #475569;">
              <th style="padding: 12px 16px;">PRN</th>
              <th style="padding: 12px 16px;">Student Name</th>
              <th style="padding: 12px 16px;">Department</th>
              <th style="padding: 12px 16px;">Class</th>
              <th style="padding: 12px 16px;">Division</th>
              <th style="padding: 12px 16px;">Enrolled Courses</th>
              <th style="padding: 12px 16px;">Attendance %</th>
              <th style="padding: 12px 16px;">Status</th>
              <th style="padding: 12px 16px; text-align: right;">Academic Actions</th>
            </tr>
          </thead>
          <tbody>`;

    students.forEach(s => {
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.username || '-';
      const statusBadge = s.is_active !== 0
        ? '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #dcfce7; color: #15803d;">Active</span>'
        : '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #fee2e2; color: #991b1b;">Inactive</span>';

      const courses = (s.enrolled_courses || '').split(',').map(c => c.trim()).filter(Boolean);
      const coursesHtml = courses.length
        ? courses.map(c => `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; margin: 2px 4px 2px 0;">${escapeHtml(c)}</span>`).join('')
        : '<span style="color: #94a3b8; font-size: 12px;">None</span>';

      let pctBadge = '<span style="color: #94a3b8; font-size: 12px;">N/A</span>';
      if (s.attendance_percentage !== null && s.attendance_percentage !== undefined) {
        const pct = parseFloat(s.attendance_percentage);
        let bg = '#dcfce7';
        let fg = '#15803d';
        if (pct < 60) {
          bg = '#fee2e2';
          fg = '#b91c1c';
        } else if (pct < 75) {
          bg = '#fef3c7';
          fg = '#b45309';
        }
        pctBadge = `<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11.5px; font-weight: 700; background: ${bg}; color: ${fg};">${pct.toFixed(1)}%</span>`;
      }

      html += `
        <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
          <td style="padding: 12px 16px; font-weight: 600; color: #0d9488;">${escapeHtml(s.prn_number || '-')}</td>
          <td style="padding: 12px 16px;">
            <div style="color: #0f172a; font-weight: 600;">${escapeHtml(name)}</div>
            ${s.email ? `<div style="font-size: 11px; color: #64748b;">${escapeHtml(s.email)}</div>` : ''}
          </td>
          <td style="padding: 12px 16px; color: #475569;">${escapeHtml(s.department_name || s.department || '-')}</td>
          <td style="padding: 12px 16px; color: #475569;">${escapeHtml(s.class_name || '-')}</td>
          <td style="padding: 12px 16px; color: #475569;">${escapeHtml(s.division ? 'Div ' + s.division : '-')}</td>
          <td style="padding: 12px 16px; max-width: 220px;">${coursesHtml}</td>
          <td style="padding: 12px 16px;">${pctBadge}</td>
          <td style="padding: 12px 16px;">${statusBadge}</td>
          <td style="padding: 12px 16px; text-align: right;">
            <div style="display: inline-flex; gap: 6px; justify-content: flex-end;">
              <a href="/pages/teacher/attendance.html" class="teacher-btn-outline" style="padding: 4px 10px; font-size: 12px; text-decoration: none; border-radius: 6px; border: 1px solid #cbd5e1; color: #0d9488; font-weight: 600; background: #ffffff;">Attendance</a>
              <a href="/pages/teacher/reports.html?student_id=${s.student_id}" class="teacher-btn-outline" style="padding: 4px 10px; font-size: 12px; text-decoration: none; border-radius: 6px; border: 1px solid #cbd5e1; color: #334155; font-weight: 600; background: #ffffff;">Reports</a>
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

  document.addEventListener('DOMContentLoaded', initStudents);
})();
