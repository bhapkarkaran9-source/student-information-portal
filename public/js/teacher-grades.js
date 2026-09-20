/**
 * Teacher Grades & Evaluation Controller - Student Information Portal
 * Supports Course Selection, Assessment Type, Interactive Student Mark Entry,
 * SGPA-grade calculation, submission to POST /api/grades, and Grade Log History.
 * 100% Zero Images | Pure CSS Gradients & SVGs | Accessible ERP Theme
 */

(function () {
  'use strict';

  let currentTeacher = null;
  let allCourses = [];
  let currentStudents = [];

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function calculateGrade(percentage) {
    if (percentage >= 90) return { grade: 'O', status: 'PASS' };
    if (percentage >= 80) return { grade: 'A+', status: 'PASS' };
    if (percentage >= 70) return { grade: 'A', status: 'PASS' };
    if (percentage >= 60) return { grade: 'B+', status: 'PASS' };
    if (percentage >= 50) return { grade: 'B', status: 'PASS' };
    if (percentage >= 45) return { grade: 'C', status: 'PASS' };
    if (percentage >= 40) return { grade: 'P', status: 'PASS' };
    return { grade: 'F', status: 'FAIL' };
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.padding = '12px 18px';
    toast.style.background = type === 'success' ? '#0f766e' : type === 'error' ? '#dc2626' : '#1e293b';
    toast.style.color = '#ffffff';
    toast.style.borderRadius = '6px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.marginBottom = '10px';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.justifyContent = 'space-between';
    toast.style.gap = '12px';
    toast.style.fontSize = '13.5px';

    toast.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <button type="button" style="background: none; border: none; color: #fff; font-size: 16px; cursor: pointer;">&times;</button>
    `;

    container.appendChild(toast);
    const closeBtn = toast.querySelector('button');
    closeBtn.addEventListener('click', () => toast.remove());
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
  }

  async function initGrades() {
    if (typeof requireAuth === 'function') {
      const isAuthed = requireAuth('TEACHER');
      if (!isAuthed) return;
    }

    await loadTeacherProfile();
    await loadCourses();

    const courseSelect = document.getElementById('gradesCourseSelect');
    if (courseSelect) {
      courseSelect.addEventListener('change', () => {
        loadStudentRoster();
      });
    }

    const assessNameSelect = document.getElementById('gradesAssessmentName');
    if (assessNameSelect) {
      assessNameSelect.addEventListener('change', handleAssessmentNameChange);
    }

    const assessTypeSelect = document.getElementById('gradesAssessmentType');
    if (assessTypeSelect) {
      assessTypeSelect.addEventListener('change', handleAssessmentTypeChange);
    }

    const saveBtn = document.getElementById('btnSaveGrades');
    if (saveBtn) {
      saveBtn.addEventListener('click', handleSaveGrades);
    }

    await loadGradesStats();
    await loadRecentGrades();
    await loadNotificationsCount();
  }

  async function loadTeacherProfile() {
    try {
      const res = await apiFetch('/api/users/me');
      if (res && res.success && res.data && res.data.user) {
        currentTeacher = res.data.user;
      }
    } catch (e) {
      console.warn('Could not load teacher profile:', e);
    }
  }

  async function loadCourses() {
    try {
      const res = await apiFetch('/api/courses?all=true');
      const select = document.getElementById('gradesCourseSelect');
      if (!select) return;

      if (res && res.success && res.data) {
        allCourses = Array.isArray(res.data) ? res.data : (res.data.courses || []);
      }

      select.innerHTML = '<option value="">-- Select Assigned Course --</option>';
      if (allCourses.length === 0) {
        select.innerHTML = '<option value="">No courses assigned</option>';
        renderEmptyRoster('No assigned courses available for grading.');
        return;
      }

      allCourses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.course_id;
        opt.textContent = `${c.course_code} - ${c.course_name}`;
        select.appendChild(opt);
      });

      const urlParams = new URLSearchParams(window.location.search);
      const preselectId = urlParams.get('course_id');
      if (preselectId && select.querySelector(`option[value="${preselectId}"]`)) {
        select.value = preselectId;
      } else if (allCourses.length > 0) {
        select.value = allCourses[0].course_id;
      }

      await loadStudentRoster();
    } catch (err) {
      console.error('Failed to load courses for grades:', err);
    }
  }

  async function loadStudentRoster() {
    const select = document.getElementById('gradesCourseSelect');
    const courseId = select ? select.value : '';

    if (!courseId) {
      renderEmptyRoster('Select an assigned course to evaluate students.');
      return;
    }

    try {
      const res = await apiFetch('/api/students?limit=100');
      if (res && res.success && res.data) {
        currentStudents = Array.isArray(res.data) ? res.data : (res.data.students || []);
      } else {
        currentStudents = [];
      }

      renderRoster(currentStudents);
    } catch (err) {
      console.error('Failed to load students for grading:', err);
      renderEmptyRoster('Could not load students for selected course.');
    }
  }

  function renderEmptyRoster(msg) {
    const container = document.getElementById('gradesRosterContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="teacher-empty-state" style="padding: 40px 20px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
        <div class="teacher-empty-icon" style="width: 48px; height: 48px; margin: 0 auto 12px; border-radius: 50%; background: #ccfbf1; display: flex; align-items: center; justify-content: center; color: #0d9488;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>
          </svg>
        </div>
        <h3 style="font-size: 16px; font-weight: 700; margin: 0 0 6px 0; color: #0f172a;">Roster Empty</h3>
        <p style="color: #64748b; max-width: 400px; margin: 0 auto; font-size: 13.5px;">${escapeHtml(msg)}</p>
      </div>`;

    const saveBtn = document.getElementById('btnSaveGrades');
    if (saveBtn) saveBtn.disabled = true;
  }

  function handleAssessmentNameChange() {
    const assessNameSelect = document.getElementById('gradesAssessmentName');
    const assessTypeSelect = document.getElementById('gradesAssessmentType');
    if (!assessNameSelect || !assessTypeSelect) return;

    const name = assessNameSelect.value.trim();
    const nameLower = name.toLowerCase();

    // Auto-mapping rules:
    // "End-Semester Final Examination" -> "Theory"
    // "Internal Test", "Mid-Term Examination", "Term Assignment / Project" -> "Theory"
    // "Practical Examination", "Practical / Lab Viva", or containing "practical" or "lab" -> "Practical"
    if (nameLower.includes('practical') || nameLower.includes('lab')) {
      assessTypeSelect.value = 'Practical';
    } else {
      assessTypeSelect.value = 'Theory';
    }

    if (currentStudents && currentStudents.length > 0) {
      renderRoster(currentStudents);
    }
  }

  function handleAssessmentTypeChange() {
    if (currentStudents && currentStudents.length > 0) {
      renderRoster(currentStudents);
    }
  }

  function renderRoster(students) {
    const container = document.getElementById('gradesRosterContainer');
    const saveBtn = document.getElementById('btnSaveGrades');
    if (!container) return;

    if (!students || students.length === 0) {
      renderEmptyRoster('No enrolled students found in this course.');
      return;
    }

    if (saveBtn) saveBtn.disabled = false;

    const assessTypeSelect = document.getElementById('gradesAssessmentType');
    const assessmentType = assessTypeSelect ? assessTypeSelect.value : 'Theory';

    let html = `
      <div style="overflow-x: auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left; color: #475569;">
              <th style="padding: 10px 14px;">PRN</th>
              <th style="padding: 10px 14px;">Student Name</th>`;

    if (assessmentType === 'Theory') {
      html += `
              <th style="padding: 10px 14px; width: 110px;">Internal (40)</th>
              <th style="padding: 10px 14px; width: 110px;">External (60)</th>
              <th style="padding: 10px 14px; width: 80px; text-align: center;">Total (100)</th>
              <th style="padding: 10px 14px; width: 80px; text-align: center;">Grade</th>
              <th style="padding: 10px 14px; width: 90px; text-align: center;">Status</th>
              <th style="padding: 10px 14px;">Remarks</th>
            </tr>
          </thead>
          <tbody>`;
    } else {
      // Practical
      html += `
              <th style="padding: 10px 14px; width: 150px;">Practical Marks (100)</th>
              <th style="padding: 10px 14px; width: 80px; text-align: center;">Total (100)</th>
              <th style="padding: 10px 14px; width: 80px; text-align: center;">Grade</th>
              <th style="padding: 10px 14px; width: 90px; text-align: center;">Status</th>
              <th style="padding: 10px 14px;">Remarks</th>
            </tr>
          </thead>
          <tbody>`;
    }

    students.forEach(s => {
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.username || 'Student';
      const studentId = s.student_id;

      if (assessmentType === 'Theory') {
        html += `
          <tr style="border-bottom: 1px solid #f1f5f9;" data-student-id="${studentId}">
            <td style="padding: 10px 14px; font-weight: 600; color: #0d9488;">${escapeHtml(s.prn_number || '-')}</td>
            <td style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${escapeHtml(name)}</td>
            <td style="padding: 10px 14px;">
              <input type="number" class="mark-input-internal" min="0" max="40" value="30" style="width: 80px; padding: 4px 8px; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </td>
            <td style="padding: 10px 14px;">
              <input type="number" class="mark-input-external" min="0" max="60" value="45" style="width: 80px; padding: 4px 8px; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </td>
            <td style="padding: 10px 14px; font-weight: 700; color: #0f172a; text-align: center;" class="cell-total-marks">75</td>
            <td style="padding: 10px 14px; font-weight: 700; color: #0f766e; text-align: center;" class="cell-grade-calc">A</td>
            <td style="padding: 10px 14px; text-align: center;" class="cell-status-calc">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #dcfce7; color: #15803d;">PASS</span>
            </td>
            <td style="padding: 10px 14px;">
              <input type="text" class="mark-remarks-input" placeholder="Feedback..." style="padding: 4px 8px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; width: 140px;">
            </td>
          </tr>`;
      } else {
        // Practical
        html += `
          <tr style="border-bottom: 1px solid #f1f5f9;" data-student-id="${studentId}">
            <td style="padding: 10px 14px; font-weight: 600; color: #0d9488;">${escapeHtml(s.prn_number || '-')}</td>
            <td style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${escapeHtml(name)}</td>
            <td style="padding: 10px 14px;">
              <input type="number" class="mark-input-practical" min="0" max="100" value="75" style="width: 100px; padding: 4px 8px; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </td>
            <td style="padding: 10px 14px; font-weight: 700; color: #0f172a; text-align: center;" class="cell-total-marks">75</td>
            <td style="padding: 10px 14px; font-weight: 700; color: #0f766e; text-align: center;" class="cell-grade-calc">A</td>
            <td style="padding: 10px 14px; text-align: center;" class="cell-status-calc">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #dcfce7; color: #15803d;">PASS</span>
            </td>
            <td style="padding: 10px 14px;">
              <input type="text" class="mark-remarks-input" placeholder="Feedback..." style="padding: 4px 8px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; width: 140px;">
            </td>
          </tr>`;
      }
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Attach real-time mark calculation listeners
    container.querySelectorAll('tr[data-student-id]').forEach(row => {
      const intInput = row.querySelector('.mark-input-internal');
      const extInput = row.querySelector('.mark-input-external');
      const pracInput = row.querySelector('.mark-input-practical');
      const totalCell = row.querySelector('.cell-total-marks');
      const gradeCell = row.querySelector('.cell-grade-calc');
      const statusCell = row.querySelector('.cell-status-calc');

      const updateRowCalc = () => {
        let total = 0;
        if (assessmentType === 'Theory') {
          const intVal = parseFloat(intInput ? intInput.value : 0) || 0;
          const extVal = parseFloat(extInput ? extInput.value : 0) || 0;
          total = Math.round((intVal + extVal) * 100) / 100;
        } else {
          const pracVal = parseFloat(pracInput ? pracInput.value : 0) || 0;
          total = Math.round(pracVal * 100) / 100;
        }
        totalCell.textContent = total;

        const { grade, status } = calculateGrade(total);
        gradeCell.textContent = grade;
        gradeCell.style.color = status === 'PASS' ? '#0f766e' : '#dc2626';

        statusCell.innerHTML = status === 'PASS'
          ? '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #dcfce7; color: #15803d;">PASS</span>'
          : '<span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #fee2e2; color: #991b1b;">FAIL</span>';
      };

      if (intInput) intInput.addEventListener('input', updateRowCalc);
      if (extInput) extInput.addEventListener('input', updateRowCalc);
      if (pracInput) pracInput.addEventListener('input', updateRowCalc);
    });
  }

  async function handleSaveGrades() {
    const courseSelect = document.getElementById('gradesCourseSelect');
    const courseId = courseSelect ? courseSelect.value : '';
    const assessNameSelect = document.getElementById('gradesAssessmentName');
    const assessmentName = assessNameSelect ? assessNameSelect.value.trim() : 'End-Semester Final Examination';
    const assessTypeSelect = document.getElementById('gradesAssessmentType');
    const assessmentType = assessTypeSelect ? assessTypeSelect.value : 'Theory';
    const examSessionInput = document.getElementById('gradesExamSession');
    const examSession = examSessionInput ? examSessionInput.value.trim() : '2025-2026';

    if (!courseId) {
      showToast('Please select an assigned course.', 'error');
      return;
    }

    if (!['Theory', 'Practical'].includes(assessmentType)) {
      showToast('Assessment type must be either Theory or Practical.', 'error');
      return;
    }

    const teacherId = currentTeacher?.teacher_id || 1;
    const rows = document.querySelectorAll('#gradesRosterContainer tr[data-student-id]');

    if (!rows || rows.length === 0) {
      showToast('No students to submit grades for.', 'error');
      return;
    }

    // Client-side validation before making requests
    for (const row of rows) {
      if (assessmentType === 'Theory') {
        const intVal = parseFloat(row.querySelector('.mark-input-internal')?.value) || 0;
        const extVal = parseFloat(row.querySelector('.mark-input-external')?.value) || 0;
        if (intVal < 0 || extVal < 0) {
          showToast('Marks cannot be negative.', 'error');
          return;
        }
        if (intVal > 40) {
          showToast(`Internal marks (${intVal}) cannot exceed 40.`, 'error');
          return;
        }
        if (extVal > 60) {
          showToast(`External marks (${extVal}) cannot exceed 60.`, 'error');
          return;
        }
        if (intVal + extVal > 100) {
          showToast(`Total marks (${intVal + extVal}) cannot exceed 100.`, 'error');
          return;
        }
      } else {
        const pracVal = parseFloat(row.querySelector('.mark-input-practical')?.value) || 0;
        if (pracVal < 0) {
          showToast('Marks cannot be negative.', 'error');
          return;
        }
        if (pracVal > 100) {
          showToast(`Practical marks (${pracVal}) cannot exceed 100.`, 'error');
          return;
        }
      }
    }

    const saveBtn = document.getElementById('btnSaveGrades');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    let successCount = 0;
    let failCount = 0;
    let lastErrorMessage = '';

    for (const row of rows) {
      const studentId = row.getAttribute('data-student-id');
      const remarks = row.querySelector('.mark-remarks-input')?.value?.trim() || '';

      let intVal = 0;
      let extVal = 0;
      let pracVal = 0;

      if (assessmentType === 'Theory') {
        intVal = parseFloat(row.querySelector('.mark-input-internal')?.value) || 0;
        extVal = parseFloat(row.querySelector('.mark-input-external')?.value) || 0;
        pracVal = 0;
      } else {
        intVal = 0;
        extVal = 0;
        pracVal = parseFloat(row.querySelector('.mark-input-practical')?.value) || 0;
      }

      try {
        const res = await apiFetch('/api/grades', {
          method: 'POST',
          body: JSON.stringify({
            student_id: parseInt(studentId, 10),
            course_id: parseInt(courseId, 10),
            teacher_id: parseInt(teacherId, 10),
            assessment_type: assessmentType,
            assessment_name: assessmentName,
            internal_marks: intVal,
            external_marks: extVal,
            practical_marks: pracVal,
            max_marks: 100,
            exam_session: examSession,
            remarks
          })
        });

        if (res && res.success) {
          successCount++;
        } else {
          failCount++;
          if (res && res.message) {
            lastErrorMessage = res.message;
          }
        }
      } catch (err) {
        failCount++;
        if (err && err.message) {
          lastErrorMessage = err.message;
        }
      }
    }

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Evaluations';
    }

    if (successCount > 0) {
      showToast(`Grades recorded successfully for ${successCount} student(s).`, 'success');
      await loadRecentGrades();
      await loadGradesStats();
    } else {
      showToast(lastErrorMessage || 'Failed to record grades. Please check assessment parameters.', 'error');
    }
  }

  async function loadRecentGrades() {
    const container = document.getElementById('gradesLogContainer');
    if (!container) return;

    try {
      const res = await apiFetch('/api/grades?limit=10');
      let grades = [];
      if (res && res.success && res.data) {
        grades = Array.isArray(res.data) ? res.data : (res.data.grades || []);
      }

      if (!grades || grades.length === 0) {
        container.innerHTML = `
          <div class="teacher-empty-state" style="padding: 32px 16px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
            <div style="font-size: 14px; color: #64748b;">No recent grade evaluation entries recorded.</div>
          </div>`;
        return;
      }

      let html = `
        <div style="overflow-x: auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left; color: #475569;">
                <th style="padding: 10px 14px;">Student</th>
                <th style="padding: 10px 14px;">Course</th>
                <th style="padding: 10px 14px;">Assessment</th>
                <th style="padding: 10px 14px; text-align: center;">Marks</th>
                <th style="padding: 10px 14px; text-align: center;">Grade</th>
                <th style="padding: 10px 14px; text-align: center;">Status</th>
                <th style="padding: 10px 14px;">Session</th>
              </tr>
            </thead>
            <tbody>`;

      grades.forEach(g => {
        const studentName = [g.first_name, g.last_name].filter(Boolean).join(' ') || g.student_name || 'Student';
        const totalMarks = g.total_marks !== undefined ? g.total_marks : (parseFloat(g.internal_marks || 0) + parseFloat(g.external_marks || 0) + parseFloat(g.practical_marks || 0));
        const assessmentDisplay = g.assessment_name ? `${g.assessment_name} (${g.assessment_type})` : (g.assessment_type || '-');

        html += `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${escapeHtml(studentName)}</td>
            <td style="padding: 10px 14px; color: #0d9488; font-weight: 600;">${escapeHtml(g.course_code || g.course_name || '-')}</td>
            <td style="padding: 10px 14px; color: #475569;">${escapeHtml(assessmentDisplay)}</td>
            <td style="padding: 10px 14px; text-align: center; font-weight: 600; color: #0f172a;">${escapeHtml(totalMarks)} / ${escapeHtml(g.max_marks || 100)}</td>
            <td style="padding: 10px 14px; text-align: center; font-weight: 700; color: #0d9488;">${escapeHtml(g.letter_grade || '-')}</td>
            <td style="padding: 10px 14px; text-align: center;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; ${g.result_status === 'PASS' || g.status === 'Pass' ? 'background: #dcfce7; color: #15803d;' : 'background: #fee2e2; color: #991b1b;'}">${escapeHtml(g.result_status || g.status || 'PASS')}</span>
            </td>
            <td style="padding: 10px 14px; color: #64748b;">${escapeHtml(g.exam_session || '-')}</td>
          </tr>`;
      });

      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (err) {
      console.error('Failed to load recent grades:', err);
    }
  }

  async function loadGradesStats() {
    try {
      const res = await apiFetch('/api/grades/stats');
      if (res && res.success && res.data && res.data.stats) {
        const stats = res.data.stats;
        const totalEl = document.getElementById('gradesKpiTotal');
        if (totalEl) totalEl.textContent = stats.total_grades || 0;

        const avgEl = document.getElementById('gradesKpiAvg');
        if (avgEl) avgEl.textContent = stats.average_score ? stats.average_score + '%' : '--';

        const passEl = document.getElementById('gradesKpiPassRate');
        if (passEl) passEl.textContent = stats.pass_rate !== undefined ? stats.pass_rate + '%' : '--';
      }
    } catch (e) {
      // Graceful fallback
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

  document.addEventListener('DOMContentLoaded', initGrades);
})();
