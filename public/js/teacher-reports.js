/**
 * Faculty Reports & Export Script
 * Student Information Portal
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

  // DOM Elements
  const navUserName = document.getElementById('navUserName');
  const logoutBtn = document.getElementById('logoutBtn');
  const reportTypeSelect = document.getElementById('reportTypeSelect');
  const btnGenerateReport = document.getElementById('btnGenerateReport');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnPrintReport = document.getElementById('btnPrintReport');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnExportExcel = document.getElementById('btnExportExcel');

  // Filters
  const fieldCourse = document.getElementById('fieldCourse');
  const fieldSemester = document.getElementById('fieldSemester');
  const fieldAcademicYear = document.getElementById('fieldAcademicYear');
  const fieldStartDate = document.getElementById('fieldStartDate');
  const fieldEndDate = document.getElementById('fieldEndDate');
  const fieldDayOfWeek = document.getElementById('fieldDayOfWeek');

  const filterCourse = document.getElementById('filterCourse');
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
  const previewSummaryGrid = document.getElementById('previewSummaryGrid');
  const reportPreviewThead = document.getElementById('reportPreviewThead');
  const reportPreviewTbody = document.getElementById('reportPreviewTbody');
  const toastContainer = document.getElementById('toastContainer');

  if (navUserName) {
    navUserName.textContent = currentUser.full_name || currentUser.username || 'Faculty';
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login.html';
    });
  }

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
      background-color: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      transition: opacity 0.3s ease;
    `;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Filter visibility
  const visibilityMap = {
    'student-profile': ['fieldCourse'],
    'attendance': ['fieldCourse', 'fieldAcademicYear', 'fieldSemester', 'fieldStartDate', 'fieldEndDate'],
    'grades': ['fieldCourse', 'fieldAcademicYear', 'fieldSemester'],
    'performance': ['fieldCourse', 'fieldAcademicYear', 'fieldSemester'],
    'course-wise': ['fieldCourse', 'fieldAcademicYear', 'fieldSemester'],
    'student-wise': ['fieldCourse', 'fieldAcademicYear', 'fieldSemester'],
    'enrollment': ['fieldCourse', 'fieldAcademicYear', 'fieldSemester'],
    'timetable': ['fieldCourse', 'fieldDayOfWeek', 'fieldSemester', 'fieldAcademicYear']
  };

  const allFields = [fieldCourse, fieldSemester, fieldAcademicYear, fieldStartDate, fieldEndDate, fieldDayOfWeek];

  function updateVisibleFilters() {
    const type = reportTypeSelect.value;
    const visible = visibilityMap[type] || [];
    allFields.forEach(f => {
      if (!f) return;
      f.style.display = visible.includes(f.id) ? '' : 'none';
    });
  }

  async function loadFilterOptions() {
    try {
      const res = await fetch('/api/reports/filters/options', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Could not load filters');
      const data = await res.json();
      if (!data.success) return;

      const opts = data.data;
      if (filterCourse && opts.courses) {
        filterCourse.innerHTML = '<option value="">-- All Assigned Courses --</option>' +
          opts.courses.map(c => `<option value="${c.course_id}">${c.course_code} - ${c.course_name}</option>`).join('');
      }
      const years = opts.academicYears || opts.academic_years || [];
      if (filterAcademicYear && years.length > 0) {
        filterAcademicYear.innerHTML = '<option value="">-- All Years --</option>' +
          years.map(y => `<option value="${y}">${y}</option>`).join('');
      }
    } catch (e) {
      console.error('Failed to load filter options', e);
    }
  }

  function buildQueryParams() {
    const params = new URLSearchParams();
    if (filterCourse && filterCourse.value) params.append('course_id', filterCourse.value);
    if (filterSemester && filterSemester.value) params.append('semester', filterSemester.value);
    if (filterAcademicYear && filterAcademicYear.value) params.append('academic_year', filterAcademicYear.value);
    if (filterStartDate && filterStartDate.value) params.append('start_date', filterStartDate.value);
    if (filterEndDate && filterEndDate.value) params.append('end_date', filterEndDate.value);
    if (filterDayOfWeek && filterDayOfWeek.value) params.append('day_of_week', filterDayOfWeek.value);
    return params;
  }

  async function generateReport() {
    const reportType = reportTypeSelect.value;
    const params = buildQueryParams();

    reportPreviewTbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-5">
          <p class="mt-2 text-muted">Loading faculty report from live records...</p>
        </td>
      </tr>
    `;
    previewSummaryGrid.innerHTML = '';

    try {
      const res = await fetch(`/api/reports/${reportType}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Server returned ${res.status}`);
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Report generation failed');

      renderReportPreview(data);
      showToast('Faculty report generated successfully', 'success');
    } catch (err) {
      if (err.message && err.message.includes('No faculty record')) {
        reportPreviewTbody.innerHTML = `
          <tr>
            <td colspan="10" class="text-center py-5">
              <p style="font-size: 15px; font-weight: 600; color: #475569; margin-bottom: 4px;">No Faculty Records Found</p>
              <p style="font-size: 13px; color: #64748b; margin: 0;">No assigned faculty profile is linked to this account yet. Please contact the administrator to assign departmental teaching courses.</p>
            </td>
          </tr>
        `;
      } else {
        console.warn('Report notice:', err.message);
        reportPreviewTbody.innerHTML = `
          <tr>
            <td colspan="10" class="text-center py-4 text-muted">
              <p style="font-size: 13px; color: #64748b; margin: 0;">${typeof escapeHtml === 'function' ? escapeHtml(err.message) : err.message}</p>
            </td>
          </tr>
        `;
      }
    }
  }

  function renderReportPreview(data) {
    previewReportTitle.textContent = data.title || 'Course Report';
    previewTimestamp.textContent = new Date(data.generated_at).toLocaleString();
    previewGeneratedBy.textContent = `${data.generated_by.name} (${data.generated_by.role})`;

    const filterParts = [];
    if (data.filters) {
      for (const [k, v] of Object.entries(data.filters)) {
        if (v) filterParts.push(`${k}: ${v}`);
      }
    }
    previewFilterMetadata.textContent = filterParts.length > 0 ? `Criteria: ${filterParts.join(' | ')}` : 'Criteria: All Assigned Courses';

    if (data.summary && Object.keys(data.summary).length > 0) {
      previewSummaryGrid.innerHTML = Object.entries(data.summary).map(([key, val]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        return `
          <div class="kpi-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px;">
            <div style="font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase;">${label}</div>
            <div style="font-size:22px; font-weight:700; color:#1e293b; margin-top:4px;">${val !== null && val !== undefined ? val : '0'}</div>
          </div>
        `;
      }).join('');
    } else {
      previewSummaryGrid.innerHTML = '';
    }

    const headers = data.columns || [];
    reportPreviewThead.innerHTML = `
      <tr>
        ${headers.map(h => `<th style="background:#f1f5f9; color:#1e293b; font-weight:600; padding:10px 12px; border-bottom:2px solid #cbd5e1;">${h.header}</th>`).join('')}
      </tr>
    `;

    const records = data.data || [];
    if (records.length === 0) {
      reportPreviewTbody.innerHTML = `
        <tr>
          <td colspan="${headers.length || 1}" class="text-center py-5 text-muted">
            <em>No records found matching your selected criteria.</em>
          </td>
        </tr>
      `;
      return;
    }

    reportPreviewTbody.innerHTML = records.map((row) => {
      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          ${headers.map(h => {
            let val = row[h.key];
            if (val === null || val === undefined) val = '-';
            if (h.key === 'attendance_percentage') {
              const num = parseFloat(val);
              const isDefaulter = !isNaN(num) && num < 75;
              const color = isDefaulter ? '#ef4444' : '#10b981';
              return `<td style="padding:8px 12px; font-weight:600; color:${color};">${val}%</td>`;
            }
            if (h.key === 'grade') {
              const isFail = val === 'F';
              const color = isFail ? '#ef4444' : '#1e293b';
              return `<td style="padding:8px 12px; font-weight:700; color:${color};">${val}</td>`;
            }
            return `<td style="padding:8px 12px; color:#334155;">${val}</td>`;
          }).join('')}
        </tr>
      `;
    }).join('');
  }

  async function downloadExport(format) {
    const reportType = reportTypeSelect.value;
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

  function resetFilters() {
    if (filterCourse) filterCourse.value = '';
    if (filterSemester) filterSemester.value = '';
    if (filterAcademicYear) filterAcademicYear.value = '';
    if (filterStartDate) filterStartDate.value = '';
    if (filterEndDate) filterEndDate.value = '';
    if (filterDayOfWeek) filterDayOfWeek.value = '';
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

  reportTypeSelect.addEventListener('change', () => {
    syncCategoryCards(reportTypeSelect.value);
    updateVisibleFilters();
  });
  btnGenerateReport.addEventListener('click', generateReport);
  btnResetFilters.addEventListener('click', resetFilters);
  btnExportCsv.addEventListener('click', () => downloadExport('csv'));
  btnExportExcel.addEventListener('click', () => downloadExport('excel'));
  btnPrintReport.addEventListener('click', () => window.print());

  syncCategoryCards(reportTypeSelect.value);
  updateVisibleFilters();
  loadFilterOptions().then(() => {
    generateReport();
  });

})();
