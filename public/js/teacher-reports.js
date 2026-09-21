/**
 * Faculty Reports & Export Script
 * Handles report generation, live data preview, faculty info, KPI summaries, responsive mobile cards, and CSV/Excel exports.
 * Features deterministic filter state management, race-condition protection, and course-scoped student loading.
 */

(function () {
  'use strict';

  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');

  if (!token || !userStr) {
    window.location.href = '/login.html';
    return;
  }

  let currentUser = null;
  try {
    currentUser = JSON.parse(userStr);
  } catch (e) {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login.html';
    return;
  }

  if (!currentUser || currentUser.role !== 'TEACHER') {
    alert('Access Denied: Faculty account required.');
    window.location.href = '/login.html';
    return;
  }

  // Request & initialization state to prevent race conditions
  let filterOptionsReqId = 0;
  let reportReqId = 0;
  let isInitializing = true;

  // DOM Elements
  const navUserName = document.getElementById('navUserName');
  const logoutBtn = document.getElementById('logoutBtn');
  const reportTypeSelect = document.getElementById('reportTypeSelect');
  const btnGenerateReport = document.getElementById('btnGenerateReport');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnPrintReport = document.getElementById('btnPrintReport');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnExportExcel = document.getElementById('btnExportExcel');

  // Error container elements
  const errorContainer = document.getElementById('errorContainer');
  const errorMessage = document.getElementById('errorMessage');
  const btnRetryReport = document.getElementById('btnRetryReport');

  // Filters
  const fieldCourse = document.getElementById('fieldCourse');
  const fieldStudent = document.getElementById('fieldStudent');
  const fieldSemester = document.getElementById('fieldSemester');
  const fieldAcademicYear = document.getElementById('fieldAcademicYear');
  const fieldStartDate = document.getElementById('fieldStartDate');
  const fieldEndDate = document.getElementById('fieldEndDate');
  const fieldDayOfWeek = document.getElementById('fieldDayOfWeek');

  const filterCourse = document.getElementById('filterCourse');
  const filterStudent = document.getElementById('filterStudent');
  const filterSemester = document.getElementById('filterSemester');
  const filterAcademicYear = document.getElementById('filterAcademicYear');
  const filterStartDate = document.getElementById('filterStartDate');
  const filterEndDate = document.getElementById('filterEndDate');
  const filterDayOfWeek = document.getElementById('filterDayOfWeek');

  // Preview elements
  const previewReportTitle = document.getElementById('previewReportTitle');
  const previewFilterMetadata = document.getElementById('previewFilterMetadata');
  const previewTimestamp = document.getElementById('previewTimestamp');
  const previewGeneratedBy = document.getElementById('previewGeneratedBy');
  const previewTeacherBioBox = document.getElementById('previewTeacherBioBox');
  const bioTeacherName = document.getElementById('bioTeacherName');
  const bioTeacherId = document.getElementById('bioTeacherId');
  const bioTeacherDept = document.getElementById('bioTeacherDept');
  const bioTeacherDesignation = document.getElementById('bioTeacherDesignation');
  const bioTeacherEmail = document.getElementById('bioTeacherEmail');
  const bioTeacherRole = document.getElementById('bioTeacherRole');

  const previewSummaryGrid = document.getElementById('previewSummaryGrid');
  const reportPreviewThead = document.getElementById('reportPreviewThead');
  const reportPreviewTbody = document.getElementById('reportPreviewTbody');
  const reportPreviewMobileCards = document.getElementById('reportPreviewMobileCards');
  const toastContainer = document.getElementById('toastContainer');

  if (navUserName) {
    navUserName.textContent = currentUser.full_name || currentUser.first_name || currentUser.username || 'Faculty';
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login.html';
    });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatCellValue(key, val, row = {}) {
    if (val === null || val === undefined || val === '') return '-';

    if (key === 'attendance_percentage' || key === 'percentage' || key === 'average_attendance' || key === 'pass_rate') {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        if (key === 'attendance_percentage' || key === 'average_attendance' || row.hasOwnProperty('total_lectures') || row.hasOwnProperty('present_count')) {
          const isDefaulter = num < 75;
          return `<span class="report-badge ${isDefaulter ? 'badge-danger' : 'badge-success'}">${num.toFixed(1)}%</span>`;
        }
        const isPass = num >= 40;
        return `<span class="report-badge ${isPass ? 'badge-success' : 'badge-danger'}">${num.toFixed(1)}%</span>`;
      }
      return escapeHtml(val);
    }

    if (key === 'letter_grade' || key === 'grade') {
      const gradeStr = String(val).trim().toUpperCase();
      if (gradeStr === 'F') {
        return `<span class="report-badge badge-danger">${escapeHtml(val)}</span>`;
      }
      if (['O', 'A+', 'A'].includes(gradeStr)) {
        return `<span class="report-badge badge-success">${escapeHtml(val)}</span>`;
      }
      return `<span class="report-badge badge-grade">${escapeHtml(val)}</span>`;
    }

    if (key === 'status' || key === 'overall_status' || key === 'standing' || key === 'risk_level') {
      const s = String(val).trim().toUpperCase();
      if (['ENROLLED', 'COMPLETED', 'PASS', 'PASSED', 'ACTIVE', 'GOOD STANDING', 'LOW', 'LOW RISK', 'NORMAL'].includes(s)) {
        return `<span class="report-badge badge-success">${escapeHtml(val)}</span>`;
      }
      if (['DROPPED', 'FAIL', 'FAILED', 'HIGH', 'HIGH RISK', 'AT RISK', 'CRITICAL', 'DEFAULTER'].includes(s)) {
        return `<span class="report-badge badge-danger">${escapeHtml(val)}</span>`;
      }
      if (['PENDING', 'NEEDS ATTENTION', 'MEDIUM', 'MODERATE'].includes(s)) {
        return `<span class="report-badge badge-warning">${escapeHtml(val)}</span>`;
      }
      return `<span class="report-badge badge-neutral">${escapeHtml(val)}</span>`;
    }

    if (key === 'course_type') {
      const t = String(val).toLowerCase();
      if (t.includes('theory')) return `<span class="report-badge badge-theory">${escapeHtml(val)}</span>`;
      if (t.includes('practical')) return `<span class="report-badge badge-practical">${escapeHtml(val)}</span>`;
      return `<span class="report-badge badge-neutral">${escapeHtml(val)}</span>`;
    }

    if (key === 'course_code') {
      return `<span style="font-weight: 700; color: #1d4ed8;">${escapeHtml(val)}</span>`;
    }

    return escapeHtml(val);
  }

  function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container no-print';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const bg = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#2563eb';
    toast.style.backgroundColor = bg;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Filter visibility map
  const visibilityMap = {
    'student-profile': ['fieldCourse', 'fieldStudent'],
    'attendance': ['fieldCourse', 'fieldStudent', 'fieldAcademicYear', 'fieldSemester', 'fieldStartDate', 'fieldEndDate'],
    'grades': ['fieldCourse', 'fieldStudent', 'fieldAcademicYear', 'fieldSemester'],
    'performance': ['fieldCourse', 'fieldStudent', 'fieldAcademicYear', 'fieldSemester'],
    'course-wise': ['fieldCourse', 'fieldAcademicYear', 'fieldSemester'],
    'student-wise': ['fieldCourse', 'fieldStudent', 'fieldAcademicYear', 'fieldSemester'],
    'enrollment': ['fieldCourse', 'fieldStudent', 'fieldAcademicYear', 'fieldSemester'],
    'timetable': ['fieldCourse', 'fieldDayOfWeek', 'fieldSemester', 'fieldAcademicYear']
  };

  const allFields = [fieldCourse, fieldStudent, fieldSemester, fieldAcademicYear, fieldStartDate, fieldEndDate, fieldDayOfWeek];

  function updateVisibleFilters() {
    const type = reportTypeSelect ? reportTypeSelect.value : 'attendance';
    const visible = visibilityMap[type] || [];
    allFields.forEach(f => {
      if (!f) return;
      f.style.display = visible.includes(f.id) ? '' : 'none';
    });
  }

  /**
   * Load filter options (assigned courses, course-scoped enrolled students, academic years)
   * Prevents race conditions using filterOptionsReqId.
   */
  async function loadFilterOptions(targetCourseId = '') {
    const reqId = ++filterOptionsReqId;
    try {
      const url = '/api/reports/filters/options' + (targetCourseId ? `?course_id=${encodeURIComponent(targetCourseId)}` : '');
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (reqId !== filterOptionsReqId) return; // Stale request, ignore

      if (!res.ok) throw new Error('Could not load filters');
      const data = await res.json();
      if (reqId !== filterOptionsReqId) return;
      if (!data.success) return;

      const opts = data.data;

      // 1. Assigned Courses (only populate if empty or initial load)
      if (filterCourse && opts.courses && (filterCourse.options.length <= 1 || targetCourseId === '')) {
        const curCourseVal = filterCourse.value;
        filterCourse.innerHTML = '<option value="">-- All Assigned Courses --</option>' +
          opts.courses.map(c => `<option value="${c.course_id}">${escapeHtml(c.course_code)} - ${escapeHtml(c.course_name)}</option>`).join('');
        if (curCourseVal && Array.from(filterCourse.options).some(o => o.value === curCourseVal)) {
          filterCourse.value = curCourseVal;
        }
      }

      // 2. Enrolled Students (Course-scoped)
      if (filterStudent && opts.students) {
        const previousStudentId = filterStudent.value;
        filterStudent.innerHTML = '<option value="">-- All Enrolled Students --</option>' +
          opts.students.map(s => `<option value="${s.student_id}">${escapeHtml(s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim())} (${escapeHtml(s.prn_number || s.prn || '')})</option>`).join('');

        // Preserve previous student selection if still valid in the new course scope
        if (previousStudentId && Array.from(filterStudent.options).some(o => o.value === previousStudentId)) {
          filterStudent.value = previousStudentId;
        } else {
          filterStudent.value = '';
        }
      }

      // 3. Academic Years
      const years = opts.academicYears || opts.academic_years || [];
      if (filterAcademicYear && years.length > 0) {
        const curYearVal = filterAcademicYear.value;
        filterAcademicYear.innerHTML = '<option value="">-- All Years --</option>' +
          years.map(y => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join('');
        if (curYearVal && Array.from(filterAcademicYear.options).some(o => o.value === curYearVal)) {
          filterAcademicYear.value = curYearVal;
        }
      }
    } catch (e) {
      console.error('Failed to load filter options', e);
    }
  }

  function buildQueryParams() {
    const params = new URLSearchParams();
    if (filterCourse && filterCourse.value) params.append('course_id', filterCourse.value);
    if (filterStudent && filterStudent.value) params.append('student_id', filterStudent.value);
    if (filterSemester && filterSemester.value) params.append('semester', filterSemester.value);
    if (filterAcademicYear && filterAcademicYear.value) params.append('academic_year', filterAcademicYear.value);
    if (filterStartDate && filterStartDate.value) params.append('start_date', filterStartDate.value);
    if (filterEndDate && filterEndDate.value) params.append('end_date', filterEndDate.value);
    if (filterDayOfWeek && filterDayOfWeek.value) params.append('day_of_week', filterDayOfWeek.value);
    return params;
  }

  async function generateReport() {
    if (isInitializing) return; // Prevent generating before filters are loaded
    if (errorContainer) errorContainer.classList.add('hidden');

    const reqId = ++reportReqId;
    const reportType = reportTypeSelect ? reportTypeSelect.value : 'attendance';

    // Auto-default student selection if single-student report type requires one
    if ((reportType === 'student-profile' || reportType === 'student-wise') && filterStudent && (!filterStudent.value || filterStudent.value === '')) {
      if (filterStudent.options.length > 1) {
        filterStudent.value = filterStudent.options[1].value;
      }
    }

    const params = buildQueryParams();

    if (reportPreviewTbody) {
      reportPreviewTbody.innerHTML = `
        <tr>
          <td colspan="12" class="text-center py-5">
            <p class="mt-2 text-muted" style="margin: 30px 0; color: #64748b; font-size: 14px;">Loading faculty report from live records...</p>
          </td>
        </tr>
      `;
    }
    if (reportPreviewMobileCards) {
      reportPreviewMobileCards.innerHTML = `
        <div style="text-align:center; padding: 32px 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
          <p style="color:#64748b; font-size:13.5px; margin:0;">Loading faculty report from live records...</p>
        </div>
      `;
    }
    if (previewSummaryGrid) previewSummaryGrid.innerHTML = '';
    if (previewTeacherBioBox) previewTeacherBioBox.classList.add('hidden');

    try {
      const res = await fetch(`/api/reports/${reportType}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (reqId !== reportReqId) return; // Stale report response, ignore

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Server returned ${res.status}`);
      }
      const data = await res.json();
      if (reqId !== reportReqId) return;

      if (!data.success) throw new Error(data.message || 'Report generation failed');

      renderReportPreview(data);
      showToast('Faculty report generated successfully', 'success');
    } catch (err) {
      if (reqId !== reportReqId) return;
      console.error('Report error:', err);
      if (errorContainer) {
        errorContainer.classList.remove('hidden');
        if (errorMessage) errorMessage.textContent = err.message || 'Failed to compile faculty report.';
      }
      const errText = err.message && err.message.includes('No faculty record')
        ? 'No assigned faculty profile is linked to this account yet. Please contact the administrator to assign departmental teaching courses.'
        : (err.message || 'Error generating report. Please check filters or retry.');

      if (reportPreviewTbody) {
        reportPreviewTbody.innerHTML = `
          <tr>
            <td colspan="12" class="text-center py-5" style="text-align:center; padding: 40px 16px;">
              <p style="font-size: 14px; margin: 0 0 4px 0; color: #b91c1c; font-weight: 600;">Report Notice</p>
              <p style="font-size: 13px; color: #64748b; margin: 0;">${escapeHtml(errText)}</p>
            </td>
          </tr>
        `;
      }
      if (reportPreviewMobileCards) {
        reportPreviewMobileCards.innerHTML = `
          <div style="text-align:center; padding: 32px 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b;">
            <p style="font-size: 14px; margin: 0 0 4px 0; font-weight: 600;">Report Notice</p>
            <p style="font-size: 13px; color: #7f1d1d; margin: 0;">${escapeHtml(errText)}</p>
          </div>
        `;
      }
    }
  }

  function renderReportPreview(data) {
    if (previewReportTitle) previewReportTitle.textContent = data.title || 'Course Report';
    if (previewTimestamp) previewTimestamp.textContent = new Date(data.generated_at).toLocaleString();
    if (previewGeneratedBy) previewGeneratedBy.textContent = `${data.generated_by?.name || currentUser.full_name || 'Faculty'} (${data.generated_by?.role || 'TEACHER'})`;

    // Build human-readable criteria string
    const criteriaParts = [];
    if (filterCourse && filterCourse.value && filterCourse.options.length > 0) {
      const selectedCourseText = filterCourse.options[filterCourse.selectedIndex]?.text;
      if (selectedCourseText && !selectedCourseText.startsWith('--')) {
        criteriaParts.push(`Course: ${selectedCourseText}`);
      }
    }
    if (filterStudent && filterStudent.value && filterStudent.options.length > 0) {
      const selectedStudentText = filterStudent.options[filterStudent.selectedIndex]?.text;
      if (selectedStudentText && !selectedStudentText.startsWith('--')) {
        criteriaParts.push(`Student: ${selectedStudentText}`);
      }
    }
    if (filterSemester && filterSemester.value) {
      criteriaParts.push(`Semester ${filterSemester.value}`);
    }
    if (filterAcademicYear && filterAcademicYear.value) {
      criteriaParts.push(`Year: ${filterAcademicYear.value}`);
    }
    if (filterStartDate && filterStartDate.value) {
      criteriaParts.push(`From: ${filterStartDate.value}`);
    }
    if (filterEndDate && filterEndDate.value) {
      criteriaParts.push(`To: ${filterEndDate.value}`);
    }
    if (filterDayOfWeek && filterDayOfWeek.value) {
      criteriaParts.push(`Day: ${filterDayOfWeek.value}`);
    }

    if (previewFilterMetadata) {
      previewFilterMetadata.textContent = criteriaParts.length > 0 ? `Criteria: ${criteriaParts.join(' | ')}` : 'Criteria: All Assigned Courses';
    }

    // Faculty profile bio box
    const profile = data.teacher_profile || currentUser;
    if (profile && previewTeacherBioBox) {
      const tName = profile.full_name || profile.name || currentUser.full_name || currentUser.username || 'Faculty';
      const tId = profile.teacher_id || profile.username || currentUser.username || '-';
      const tDept = profile.department_name || profile.department || 'Academic Department';
      const tDesig = profile.designation || 'Assistant Professor';
      const tEmail = profile.email || currentUser.email || '-';

      if (bioTeacherName) bioTeacherName.textContent = tName;
      if (bioTeacherId) bioTeacherId.textContent = tId;
      if (bioTeacherDept) bioTeacherDept.textContent = tDept;
      if (bioTeacherDesignation) bioTeacherDesignation.textContent = tDesig;
      if (bioTeacherEmail) bioTeacherEmail.textContent = tEmail;
      if (bioTeacherRole) bioTeacherRole.textContent = 'TEACHER';
      previewTeacherBioBox.classList.remove('hidden');
    } else if (previewTeacherBioBox) {
      previewTeacherBioBox.classList.add('hidden');
    }

    // Summary KPIs Grid
    if (data.summary && Object.keys(data.summary).length > 0 && previewSummaryGrid) {
      const colors = ['kpi-blue', 'kpi-indigo', 'kpi-emerald', 'kpi-amber', 'kpi-rose'];
      previewSummaryGrid.innerHTML = Object.entries(data.summary).map(([key, val], idx) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        let accent = colors[idx % colors.length];
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('defaulter') || lowerKey.includes('risk') || lowerKey.includes('failed') || lowerKey.includes('absent')) {
          accent = 'kpi-rose';
        } else if (lowerKey.includes('pass') || lowerKey.includes('good') || lowerKey.includes('attendance') || lowerKey.includes('evaluated') || lowerKey.includes('total_students')) {
          accent = 'kpi-emerald';
        }
        return `
          <div class="report-kpi-card ${accent}">
            <div class="report-kpi-label">${escapeHtml(label)}</div>
            <div class="report-kpi-value">${val !== null && val !== undefined ? escapeHtml(val) : '0'}</div>
          </div>
        `;
      }).join('');
    } else if (previewSummaryGrid) {
      previewSummaryGrid.innerHTML = '';
    }

    // Dynamic Headers & Columns
    const headers = data.columns || [];
    if (reportPreviewThead) {
      reportPreviewThead.innerHTML = `
        <tr>
          ${headers.map(h => `<th>${escapeHtml(h.header)}</th>`).join('')}
        </tr>
      `;
    }

    const records = data.data || [];
    if (records.length === 0) {
      if (reportPreviewTbody) {
        reportPreviewTbody.innerHTML = `
          <tr>
            <td colspan="${headers.length || 1}" class="text-center py-5 text-muted" style="text-align:center; padding: 40px 16px;">
              <div style="font-weight:600; font-size:14px; color:#475569;">No report data available for the selected criteria.</div>
              <div style="font-size:13px; color:#64748b; margin-top:4px;">Try selecting a different course, student, semester, or date range.</div>
            </td>
          </tr>
        `;
      }
      if (reportPreviewMobileCards) {
        reportPreviewMobileCards.innerHTML = `
          <div style="text-align:center; padding: 36px 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="font-weight:600; font-size:14px; color:#475569;">No report data available for the selected criteria.</div>
            <div style="font-size:13px; color:#64748b; margin-top:4px;">Try selecting a different course, student, semester, or date range.</div>
          </div>
        `;
      }
      return;
    }

    // Desktop Table View
    if (reportPreviewTbody) {
      reportPreviewTbody.innerHTML = records.map((row) => {
        return `
          <tr>
            ${headers.map(h => {
              const formatted = formatCellValue(h.key, row[h.key], row);
              return `<td>${formatted}</td>`;
            }).join('')}
          </tr>
        `;
      }).join('');
    }

    // Mobile Cards View (<= 768px)
    if (reportPreviewMobileCards) {
      reportPreviewMobileCards.innerHTML = records.map((row, idx) => {
        const title = row.student_name || row.course_name || row.day_of_week || (row.prn_number ? `PRN: ${row.prn_number}` : `Record #${idx + 1}`);
        let badge = '';
        if (row.prn_number && row.student_name) {
          badge = `<span class="report-badge badge-primary">${escapeHtml(row.prn_number)}</span>`;
        } else if (row.course_code) {
          badge = `<span class="report-badge badge-primary">${escapeHtml(row.course_code)}</span>`;
        } else if (row.status) {
          badge = formatCellValue('status', row.status, row);
        } else if (row.percentage !== undefined) {
          badge = formatCellValue('percentage', row.percentage, row);
        }

        const bodyItems = headers.map(h => {
          const formatted = formatCellValue(h.key, row[h.key], row);
          return `
            <div class="mobile-data-row">
              <div class="mobile-data-label">${escapeHtml(h.header)}</div>
              <div class="mobile-data-val">${formatted}</div>
            </div>
          `;
        }).join('');

        return `
          <div class="report-mobile-card">
            <div class="report-mobile-card-header">
              <span class="report-mobile-card-title">${escapeHtml(title)}</span>
              ${badge}
            </div>
            <div class="report-mobile-card-body">
              ${bodyItems}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  async function downloadExport(format) {
    const reportType = reportTypeSelect ? reportTypeSelect.value : 'attendance';
    const params = buildQueryParams();
    const endpoint = format === 'excel' ? 'excel' : 'csv';
    const url = `/api/reports/${reportType}/${endpoint}?${params.toString()}`;

    showToast(`Preparing ${format.toUpperCase()} export...`, 'info');

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Export failed: status ${res.status}`);
      }

      let filename = `faculty_${reportType}_report_${Date.now()}.${format === 'excel' ? 'xlsx' : 'csv'}`;
      const disposition = res.headers.get('Content-Disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);

      showToast(`Export downloaded: ${filename}`, 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Export failed: ' + err.message, 'error');
    }
  }

  async function resetFilters() {
    if (filterCourse) filterCourse.value = '';
    if (filterStudent) filterStudent.value = '';
    if (filterSemester) filterSemester.value = '';
    if (filterAcademicYear) filterAcademicYear.value = '';
    if (filterStartDate) filterStartDate.value = '';
    if (filterEndDate) filterEndDate.value = '';
    if (filterDayOfWeek) filterDayOfWeek.value = '';
    await loadFilterOptions('');
    generateReport();
    showToast('Filters reset', 'info');
  }

  // Synchronize Report Category Cards
  const reportCategoryCards = document.querySelectorAll('#reportCategoryCards .erp-report-card');
  function syncCategoryCards(selectedType) {
    reportCategoryCards.forEach(card => {
      if (card.dataset.report === selectedType) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  reportCategoryCards.forEach(card => {
    card.addEventListener('click', (e) => {
      const selected = card.dataset.report;
      if (!selected) return;
      if (reportTypeSelect) reportTypeSelect.value = selected;
      syncCategoryCards(selected);
      updateVisibleFilters();
      if ((selected === 'student-profile' || selected === 'student-wise') && filterStudent && (!filterStudent.value || filterStudent.value === '')) {
        if (filterStudent.options.length > 1) {
          filterStudent.value = filterStudent.options[1].value;
        }
      }
      generateReport();
      if (e.target.closest('.btn-report-view')) {
        const previewEl = document.getElementById('reportPrintArea');
        if (previewEl) previewEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  if (reportTypeSelect) {
    reportTypeSelect.addEventListener('change', () => {
      const selected = reportTypeSelect.value;
      syncCategoryCards(selected);
      updateVisibleFilters();
      if ((selected === 'student-profile' || selected === 'student-wise') && filterStudent && (!filterStudent.value || filterStudent.value === '')) {
        if (filterStudent.options.length > 1) {
          filterStudent.value = filterStudent.options[1].value;
        }
      }
      generateReport();
    });
  }

  // Assigned course change listener: Reload enrolled student options for selected course scope
  if (filterCourse) {
    filterCourse.addEventListener('change', async () => {
      await loadFilterOptions(filterCourse.value);
      generateReport();
    });
  }

  if (filterStudent) {
    filterStudent.addEventListener('change', () => {
      generateReport();
    });
  }

  if (btnGenerateReport) btnGenerateReport.addEventListener('click', generateReport);
  if (btnResetFilters) btnResetFilters.addEventListener('click', resetFilters);
  if (btnRetryReport) btnRetryReport.addEventListener('click', generateReport);
  if (btnExportCsv) btnExportCsv.addEventListener('click', () => downloadExport('csv'));
  if (btnExportExcel) btnExportExcel.addEventListener('click', () => downloadExport('excel'));
  if (btnPrintReport) btnPrintReport.addEventListener('click', () => window.print());

  [filterSemester, filterAcademicYear, filterDayOfWeek].forEach(el => {
    if (el) el.addEventListener('change', generateReport);
  });
  [filterStartDate, filterEndDate].forEach(el => {
    if (el) el.addEventListener('change', generateReport);
  });

  // Initialization sequence: Load filters first, then generate initial report deterministically
  if (reportTypeSelect) syncCategoryCards(reportTypeSelect.value);
  updateVisibleFilters();

  (async function initializePage() {
    await loadFilterOptions(filterCourse ? filterCourse.value : '');
    isInitializing = false;
    await generateReport();
  })();

})();
