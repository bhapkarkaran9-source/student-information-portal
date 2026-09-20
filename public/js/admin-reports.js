/**
 * Admin Reports & Export Center Script
 * Student Information Portal
 */

(function () {
  'use strict';

  // Auth token & user
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

  if (!currentUser || currentUser.role !== 'ADMIN') {
    window.location.replace('/login.html');
    return;
  }

  // DOM Elements
  const reportTypeSelect = document.getElementById('reportTypeSelect');
  const btnGenerateReport = document.getElementById('btnGenerateReport');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnPrintReport = document.getElementById('btnPrintReport');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnExportExcel = document.getElementById('btnExportExcel');

  // Filter input elements
  const filterStudent = document.getElementById('filterStudent');
  const filterCourse = document.getElementById('filterCourse');
  const filterDepartment = document.getElementById('filterDepartment');
  const filterSemester = document.getElementById('filterSemester');
  const filterAcademicYear = document.getElementById('filterAcademicYear');
  const filterStartDate = document.getElementById('filterStartDate');
  const filterEndDate = document.getElementById('filterEndDate');
  const filterStatus = document.getElementById('filterStatus');
  const filterDayOfWeek = document.getElementById('filterDayOfWeek');

  // Filter container fields
  const fieldStudent = document.getElementById('fieldStudent');
  const fieldCourse = document.getElementById('fieldCourse');
  const fieldDepartment = document.getElementById('fieldDepartment');
  const fieldSemester = document.getElementById('fieldSemester');
  const fieldAcademicYear = document.getElementById('fieldAcademicYear');
  const fieldStartDate = document.getElementById('fieldStartDate');
  const fieldEndDate = document.getElementById('fieldEndDate');
  const fieldStatus = document.getElementById('fieldStatus');
  const fieldDayOfWeek = document.getElementById('fieldDayOfWeek');

  // Preview elements
  const previewReportTitle = document.getElementById('previewReportTitle');
  const previewFilterMetadata = document.getElementById('previewFilterMetadata');
  const previewTimestamp = document.getElementById('previewTimestamp');
  const previewGeneratedBy = document.getElementById('previewGeneratedBy');
  const previewStudentBioBox = document.getElementById('previewStudentBioBox');
  const bioName = document.getElementById('bioName');
  const bioPrn = document.getElementById('bioPrn');
  const bioDept = document.getElementById('bioDept');
  const bioClass = document.getElementById('bioClass');
  const bioSemester = document.getElementById('bioSemester');
  const bioEmail = document.getElementById('bioEmail');
  const previewSummaryGrid = document.getElementById('previewSummaryGrid');
  const reportPreviewThead = document.getElementById('reportPreviewThead');
  const reportPreviewTbody = document.getElementById('reportPreviewTbody');

  // Sidebar elements
  const adminSidebar = document.getElementById('adminSidebar');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const btnLogout = document.getElementById('btnLogout');
  const adminUsernameBadge = document.getElementById('adminUsernameBadge');
  const toastContainer = document.getElementById('toastContainer');

  if (adminUsernameBadge && currentUser) {
    adminUsernameBadge.textContent = currentUser.full_name || currentUser.username || 'Administrator';
  }

  // Sidebar toggle
  if (sidebarToggleBtn && adminSidebar) {
    sidebarToggleBtn.addEventListener('click', () => {
      adminSidebar.classList.toggle('open');
      if (sidebarBackdrop) sidebarBackdrop.classList.toggle('hidden');
    });
  }
  if (sidebarCloseBtn && adminSidebar) {
    sidebarCloseBtn.addEventListener('click', () => {
      adminSidebar.classList.remove('open');
      if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
    });
  }
  if (sidebarBackdrop && adminSidebar) {
    sidebarBackdrop.addEventListener('click', () => {
      adminSidebar.classList.remove('open');
      sidebarBackdrop.classList.add('hidden');
    });
  }

  // Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login.html';
    });
  }

  // Toast Notification Utility
  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      min-width: 250px;
      margin-bottom: 8px;
      padding: 12px 16px;
      border-radius: 6px;
      color: #fff;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      background-color: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#7c3aed'};
      transition: opacity 0.3s ease;
    `;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
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

  // Filter visibility map
  const filterVisibilityMap = {
    'attendance': ['fieldStudent', 'fieldCourse', 'fieldAcademicYear', 'fieldSemester', 'fieldStartDate', 'fieldEndDate'],
    'grades': ['fieldStudent', 'fieldCourse', 'fieldAcademicYear', 'fieldSemester'],
    'performance': ['fieldStudent', 'fieldDepartment', 'fieldAcademicYear', 'fieldSemester'],
    'course-wise': ['fieldCourse', 'fieldAcademicYear', 'fieldSemester'],
    'student-profile': ['fieldStudent'],
    'student-wise': ['fieldStudent', 'fieldAcademicYear', 'fieldSemester'],
    'enrollment': ['fieldStudent', 'fieldCourse', 'fieldDepartment', 'fieldAcademicYear', 'fieldSemester', 'fieldStatus'],
    'timetable': ['fieldCourse', 'fieldDayOfWeek', 'fieldSemester', 'fieldAcademicYear']
  };

  const allFilterFields = [
    fieldStudent, fieldCourse, fieldDepartment, fieldSemester,
    fieldAcademicYear, fieldStartDate, fieldEndDate, fieldStatus, fieldDayOfWeek
  ];

  function updateVisibleFilters() {
    const reportType = reportTypeSelect.value;
    const visibleIds = filterVisibilityMap[reportType] || [];

    allFilterFields.forEach(field => {
      if (!field) return;
      if (visibleIds.includes(field.id)) {
        field.style.display = '';
      } else {
        field.style.display = 'none';
      }
    });
  }

  // Load filter options from API
  async function loadFilterOptions() {
    try {
      const res = await fetch('/api/reports/filters/options', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch filter options');
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Error loading filters');

      const options = data.data;

      // Populate Students
      if (filterStudent && options.students) {
        filterStudent.innerHTML = '<option value="">-- All Students --</option>' +
          options.students.map(s => `<option value="${s.student_id}">${s.full_name} (${s.prn || 'ID: ' + s.student_id})</option>`).join('');
      }

      // Populate Courses
      if (filterCourse && options.courses) {
        filterCourse.innerHTML = '<option value="">-- All Courses --</option>' +
          options.courses.map(c => `<option value="${c.course_id}">${c.course_code} - ${c.course_name}</option>`).join('');
      }

      // Populate Departments
      if (filterDepartment && options.departments) {
        filterDepartment.innerHTML = '<option value="">-- All Departments --</option>' +
          options.departments.map(d => `<option value="${d.department_id}">${d.department_name} (${d.department_code})</option>`).join('');
      }

      // Populate Academic Years
      const years = options.academicYears || options.academic_years || [];
      if (filterAcademicYear && years.length > 0) {
        filterAcademicYear.innerHTML = '<option value="">-- All Years --</option>' +
          years.map(y => `<option value="${y}">${y}</option>`).join('');
      }
    } catch (err) {
      console.error('Filter options error:', err);
      showToast('Could not load dynamic filter dropdowns: ' + err.message, 'error');
    }
  }

  // Build Query Params string
  function buildQueryParams() {
    const params = new URLSearchParams();

    if (filterStudent && filterStudent.value) params.append('student_id', filterStudent.value);
    if (filterCourse && filterCourse.value) params.append('course_id', filterCourse.value);
    if (filterDepartment && filterDepartment.value) params.append('department_id', filterDepartment.value);
    if (filterSemester && filterSemester.value) params.append('semester', filterSemester.value);
    if (filterAcademicYear && filterAcademicYear.value) params.append('academic_year', filterAcademicYear.value);
    if (filterStartDate && filterStartDate.value) params.append('start_date', filterStartDate.value);
    if (filterEndDate && filterEndDate.value) params.append('end_date', filterEndDate.value);
    if (filterStatus && filterStatus.value) params.append('status', filterStatus.value);
    if (filterDayOfWeek && filterDayOfWeek.value) params.append('day_of_week', filterDayOfWeek.value);

    return params;
  }

  // Generate and render live report
  async function generateReport() {
    const reportType = reportTypeSelect.value;
    const params = buildQueryParams();

    // Validation for reports requiring a student
    if ((reportType === 'student-profile' || reportType === 'student-wise') && !params.get('student_id')) {
      showToast('Please select a student to generate this report.', 'error');
      if (filterStudent) filterStudent.focus();
      return;
    }

    reportPreviewTbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5">
          <p class="mt-2 text-muted">Generating report data from live database...</p>
        </td>
      </tr>
    `;
    previewSummaryGrid.innerHTML = '';
    previewStudentBioBox.classList.add('hidden');

    try {
      const url = `/api/reports/${reportType}?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Server returned ${res.status}`);
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Report generation failed');

      renderReportPreview(data);
      showToast('Report generated successfully', 'success');
    } catch (err) {
      console.error('Report generation error:', err);
      reportPreviewTbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-4 text-danger">
            <strong>Failed to generate report:</strong> ${err.message}
          </td>
        </tr>
      `;
      showToast(err.message, 'error');
    }
  }

  // Render preview
  function renderReportPreview(data) {
    // Header metadata
    previewReportTitle.textContent = data.title || 'Academic Report';
    previewTimestamp.textContent = new Date(data.generated_at).toLocaleString();
    previewGeneratedBy.textContent = `${data.generated_by.name} (${data.generated_by.role})`;

    // Filter metadata string
    const filterParts = [];
    if (data.filters) {
      for (const [k, v] of Object.entries(data.filters)) {
        if (v) filterParts.push(`${k}: ${v}`);
      }
    }
    previewFilterMetadata.textContent = filterParts.length > 0 ? `Criteria: ${filterParts.join(' | ')}` : 'Criteria: All Records';

    // Student Bio Box
    if (data.student_profile) {
      const p = data.student_profile;
      bioName.textContent = p.full_name || '-';
      bioPrn.textContent = p.prn || '-';
      bioDept.textContent = p.department_name || '-';
      bioClass.textContent = `${p.current_year || ''} - Div ${p.division || ''}`;
      bioSemester.textContent = p.current_semester ? `Semester ${p.current_semester}` : '-';
      bioEmail.textContent = p.email || '-';
      previewStudentBioBox.classList.remove('hidden');
    } else {
      previewStudentBioBox.classList.add('hidden');
    }

    // Summary Metric Cards
    if (data.summary && Object.keys(data.summary).length > 0) {
      previewSummaryGrid.innerHTML = Object.entries(data.summary).map(([key, val]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        return `
          <div class="erp-kpi-card" style="padding: 14px 18px; margin-bottom: 16px;">
            <div class="erp-kpi-top" style="margin-bottom: 6px;">
              <span class="erp-kpi-label">${escapeHtml(label)}</span>
            </div>
            <div class="erp-kpi-value" style="font-size: 22px; margin-bottom: 0;">${val !== null && val !== undefined ? escapeHtml(String(val)) : '0'}</div>
          </div>
        `;
      }).join('');
    } else {
      previewSummaryGrid.innerHTML = '';
    }

    // Table Headers
    const headers = data.columns || [];
    reportPreviewThead.innerHTML = `
      <tr>
        ${headers.map(h => `<th>${escapeHtml(h.header)}</th>`).join('')}
      </tr>
    `;

    // Table Body
    const records = data.data || [];
    if (records.length === 0) {
      reportPreviewTbody.innerHTML = `
        <tr>
          <td colspan="${headers.length || 1}" style="padding: 40px 16px;">
            <div class="erp-empty-state">
              <div class="erp-empty-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </div>
              <div class="erp-empty-title">No records found</div>
              <div class="erp-empty-desc">No academic data matches the specified filter criteria.</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    reportPreviewTbody.innerHTML = records.map((row) => {
      return `
        <tr>
          ${headers.map(h => {
            let val = row[h.key];
            if (val === null || val === undefined) val = '-';
            
            // Format badges or highlights if helpful
            if (h.key === 'attendance_percentage') {
              const num = parseFloat(val);
              const isDefaulter = !isNaN(num) && num < 75;
              const badgeClass = isDefaulter ? 'erp-badge-danger' : 'erp-badge-success';
              return `<td><span class="erp-badge ${badgeClass}">${val}%</span></td>`;
            }
            if (h.key === 'grade') {
              const isFail = val === 'F';
              const badgeClass = isFail ? 'erp-badge-danger' : 'erp-badge-primary';
              return `<td><span class="erp-badge ${badgeClass}">${escapeHtml(val)}</span></td>`;
            }
            if (h.key === 'standing') {
              const isGood = val === 'Good Standing';
              const badgeClass = isGood ? 'erp-badge-success' : 'erp-badge-danger';
              return `<td><span class="erp-badge ${badgeClass}">${escapeHtml(val)}</span></td>`;
            }

            return `<td style="color:#334155;">${escapeHtml(val)}</td>`;
          }).join('')}
        </tr>
      `;
    }).join('');
  }

  // Export File Utility (CSV or Excel)
  async function downloadExport(format) {
    const reportType = reportTypeSelect.value;
    const params = buildQueryParams();

    // Validation for reports requiring a student
    if ((reportType === 'student-profile' || reportType === 'student-wise') && !params.get('student_id')) {
      showToast('Please select a student before exporting this report.', 'error');
      return;
    }

    const endpoint = format === 'excel' ? 'excel' : 'csv';
    const url = `/api/reports/${reportType}/${endpoint}?${params.toString()}`;

    showToast(`Preparing ${format.toUpperCase()} export...`, 'info');

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Export failed with status ${res.status}`);
      }

      // Extract filename from Content-Disposition header if present
      let filename = `${reportType}_report_${Date.now()}.${format === 'excel' ? 'xlsx' : 'csv'}`;
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

      showToast(`${format.toUpperCase()} export downloaded successfully!`, 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Export failed: ' + err.message, 'error');
    }
  }

  // Reset Filters
  function resetFilters() {
    filterStudent.value = '';
    filterCourse.value = '';
    filterDepartment.value = '';
    filterSemester.value = '';
    filterAcademicYear.value = '';
    filterStartDate.value = '';
    filterEndDate.value = '';
    filterStatus.value = '';
    filterDayOfWeek.value = '';
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
      reportTypeSelect.value = selected;
      syncCategoryCards(selected);
      updateVisibleFilters();
      generateReport();
      if (e.target.closest('.btn-report-view')) {
        const previewEl = document.getElementById('reportPrintArea');
        if (previewEl) previewEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Event Listeners
  reportTypeSelect.addEventListener('change', () => {
    syncCategoryCards(reportTypeSelect.value);
    updateVisibleFilters();
  });

  btnGenerateReport.addEventListener('click', generateReport);
  btnResetFilters.addEventListener('click', resetFilters);

  btnExportCsv.addEventListener('click', () => downloadExport('csv'));
  btnExportExcel.addEventListener('click', () => downloadExport('excel'));

  btnPrintReport.addEventListener('click', () => {
    window.print();
  });

  // Init
  syncCategoryCards(reportTypeSelect.value);

  // Init
  updateVisibleFilters();
  loadFilterOptions().then(() => {
    // Automatically generate the default attendance report
    generateReport();
  });

})();
