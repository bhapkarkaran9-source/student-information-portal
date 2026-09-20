/**
 * Student Reports & Export Script
 * Handles report generation, live data preview, student bio, KPI summaries, and CSV/Excel exports
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

  if (!currentUser || currentUser.role !== 'STUDENT') {
    alert('Access Denied: Student account required.');
    window.location.href = '/login.html';
    return;
  }

  // DOM Elements
  const navUserName = document.getElementById('navUserName');
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
  const fieldSemester = document.getElementById('fieldSemester');
  const fieldAcademicYear = document.getElementById('fieldAcademicYear');
  const fieldCourse = document.getElementById('fieldCourse');
  const fieldStartDate = document.getElementById('fieldStartDate');
  const fieldEndDate = document.getElementById('fieldEndDate');
  const fieldDayOfWeek = document.getElementById('fieldDayOfWeek');

  const filterSemester = document.getElementById('filterSemester');
  const filterAcademicYear = document.getElementById('filterAcademicYear');
  const filterCourse = document.getElementById('filterCourse');
  const filterStartDate = document.getElementById('filterStartDate');
  const filterEndDate = document.getElementById('filterEndDate');
  const filterDayOfWeek = document.getElementById('filterDayOfWeek');

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
  const toastContainer = document.getElementById('toastContainer');

  if (navUserName) {
    navUserName.textContent = currentUser.full_name || currentUser.first_name || currentUser.username || 'Student';
  }

  // Cached profile
  let cachedStudentProfile = null;

  async function fetchStudentProfile() {
    try {
      const res = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          cachedStudentProfile = json.data.user || json.data;
        }
      }
    } catch (e) {
      console.warn('Could not fetch user profile:', e);
    }
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
    'attendance': ['fieldSemester', 'fieldAcademicYear', 'fieldCourse', 'fieldStartDate', 'fieldEndDate'],
    'grades': ['fieldSemester', 'fieldAcademicYear', 'fieldCourse'],
    'performance': ['fieldSemester', 'fieldAcademicYear'],
    'student-wise': ['fieldSemester', 'fieldAcademicYear'],
    'student-profile': [],
    'enrollment': ['fieldSemester', 'fieldAcademicYear', 'fieldCourse'],
    'timetable': ['fieldSemester', 'fieldAcademicYear', 'fieldDayOfWeek']
  };

  const allFields = [fieldSemester, fieldAcademicYear, fieldCourse, fieldStartDate, fieldEndDate, fieldDayOfWeek];

  function updateVisibleFilters() {
    const type = reportTypeSelect ? reportTypeSelect.value : 'attendance';
    const visible = visibilityMap[type] || [];
    allFields.forEach(f => {
      if (!f) return;
      f.style.display = visible.includes(f.id) ? '' : 'none';
    });
  }

  let cachedAcademicYears = [];

  function populateAcademicYearOptions(years) {
    if (!filterAcademicYear) return;
    const currentVal = filterAcademicYear.value;
    const uniqueYears = Array.from(new Set(years || [])).filter(Boolean);
    uniqueYears.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

    filterAcademicYear.innerHTML = '<option value="">-- All Years --</option>' +
      uniqueYears.map(y => `<option value="${y}">${y}</option>`).join('');

    if (currentVal && uniqueYears.includes(currentVal)) {
      filterAcademicYear.value = currentVal;
    }
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
        filterCourse.innerHTML = '<option value="">-- All Courses --</option>' +
          opts.courses.map(c => `<option value="${c.course_id}">${c.course_code} - ${c.course_name}</option>`).join('');
      }
      const years = opts.academicYears || opts.academic_years || [];
      cachedAcademicYears = years;
      populateAcademicYearOptions(years);
    } catch (e) {
      console.error('Failed to load filter options', e);
    }
  }

  function buildQueryParams() {
    const params = new URLSearchParams();
    if (filterSemester && filterSemester.value) params.append('semester', filterSemester.value);
    if (filterAcademicYear && filterAcademicYear.value) params.append('academic_year', filterAcademicYear.value);
    if (filterCourse && filterCourse.value) params.append('course_id', filterCourse.value);
    if (filterStartDate && filterStartDate.value) params.append('start_date', filterStartDate.value);
    if (filterEndDate && filterEndDate.value) params.append('end_date', filterEndDate.value);
    if (filterDayOfWeek && filterDayOfWeek.value) params.append('day_of_week', filterDayOfWeek.value);
    return params;
  }

  async function generateReport() {
    if (errorContainer) errorContainer.classList.add('hidden');

    const reportType = reportTypeSelect ? reportTypeSelect.value : 'attendance';
    const params = buildQueryParams();

    if (reportPreviewTbody) {
      reportPreviewTbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-5">
            <p class="mt-2 text-muted">Loading your academic report from live records...</p>
          </td>
        </tr>
      `;
    }
    if (previewSummaryGrid) previewSummaryGrid.innerHTML = '';
    if (previewStudentBioBox) previewStudentBioBox.classList.add('hidden');

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
      showToast('Report updated successfully', 'success');
    } catch (err) {
      console.error('Report error:', err);
      if (errorContainer) {
        errorContainer.classList.remove('hidden');
        if (errorMessage) errorMessage.textContent = err.message || 'Failed to compile report.';
      }
      if (reportPreviewTbody) {
        reportPreviewTbody.innerHTML = `
          <tr>
            <td colspan="10" class="text-center py-5 text-danger">
              <p style="font-size: 14px; margin: 0;">${err.message || 'Error generating report. Please check filters or retry.'}</p>
            </td>
          </tr>
        `;
      }
    }
  }

  function renderReportPreview(data) {
    if (previewReportTitle) previewReportTitle.textContent = data.title || 'Academic Report';
    if (previewTimestamp) previewTimestamp.textContent = new Date(data.generated_at).toLocaleString();
    if (previewGeneratedBy) previewGeneratedBy.textContent = `${data.generated_by?.name || currentUser.full_name || 'Student'} (${data.generated_by?.role || 'STUDENT'})`;

    const filterParts = [];
    if (data.filters) {
      for (const [k, v] of Object.entries(data.filters)) {
        if (v && k !== 'student_id') filterParts.push(`${k.replace(/_/g, ' ')}: ${v}`);
      }
    }
    if (previewFilterMetadata) {
      previewFilterMetadata.textContent = filterParts.length > 0 ? `Criteria: ${filterParts.join(' | ')}` : 'Criteria: All Enrolled Records';
    }

    // Populate Student Bio Card
    const profile = data.student_profile || cachedStudentProfile || currentUser;
    if (profile && previewStudentBioBox) {
      const pName = profile.full_name || profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || currentUser.full_name || currentUser.username || '-';
      const pPrn = profile.prn || profile.student_prn || profile.prn_number || currentUser.prn || '-';
      const pDept = profile.department_name || profile.department || 'Information Technology';
      const pClass = profile.current_year ? `${profile.current_year} - Div ${profile.division || '1'}` : (profile.class_name || 'TY-IT (Div 1)');
      const pSem = profile.current_semester ? `Semester ${profile.current_semester}` : (profile.semester ? `Semester ${profile.semester}` : 'Semester 5');
      const pEmail = profile.email || currentUser.email || '-';

      if (bioName) bioName.textContent = pName;
      if (bioPrn) bioPrn.textContent = pPrn;
      if (bioDept) bioDept.textContent = pDept;
      if (bioClass) bioClass.textContent = pClass;
      if (bioSemester) bioSemester.textContent = pSem;
      if (bioEmail) bioEmail.textContent = pEmail;
      previewStudentBioBox.classList.remove('hidden');
    } else if (previewStudentBioBox) {
      previewStudentBioBox.classList.add('hidden');
    }

    // Summary KPIs
    if (data.summary && Object.keys(data.summary).length > 0 && previewSummaryGrid) {
      previewSummaryGrid.innerHTML = Object.entries(data.summary).map(([key, val]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        return `
          <div class="kpi-card" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px;">
            <div style="font-size:11.5px; font-weight:600; color:#64748b; text-transform:uppercase;">${label}</div>
            <div style="font-size:22px; font-weight:700; color:#1e293b; margin-top:4px;">${val !== null && val !== undefined ? val : '0'}</div>
          </div>
        `;
      }).join('');
    } else if (previewSummaryGrid) {
      previewSummaryGrid.innerHTML = '';
    }

    // Dynamic Columns
    const headers = data.columns || [];
    if (reportPreviewThead) {
      reportPreviewThead.innerHTML = `
        <tr>
          ${headers.map(h => `<th style="background:#f8fafc; color:#1e293b; font-weight:600; padding:10px 12px; border-bottom:2px solid #cbd5e1; font-size:13px;">${h.header}</th>`).join('')}
        </tr>
      `;
    }

    const records = data.data || [];
    if (records.length === 0) {
      if (reportPreviewTbody) {
        reportPreviewTbody.innerHTML = `
          <tr>
            <td colspan="${headers.length || 1}" class="text-center py-5 text-muted" style="text-align:center; padding: 40px 16px;">
              <div style="font-weight:600; font-size:14px; color:#475569;">No report data available for the selected filters.</div>
              <div style="font-size:13px; color:#64748b; margin-top:4px;">Try adjusting your academic year, semester, or course filters.</div>
            </td>
          </tr>
        `;
      }
      return;
    }

    if (reportPreviewTbody) {
      reportPreviewTbody.innerHTML = records.map((row) => {
        return `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            ${headers.map(h => {
              let val = row[h.key];
              if (val === null || val === undefined) val = '-';
              if (h.key === 'attendance_percentage') {
                const num = parseFloat(val);
                const isDefaulter = !isNaN(num) && num < 75;
                const color = isDefaulter ? '#ef4444' : '#10b981';
                return `<td style="padding:10px 12px; font-weight:600; color:${color}; font-size:13px;">${val}%</td>`;
              }
              if (h.key === 'grade') {
                const isFail = val === 'F';
                const color = isFail ? '#ef4444' : '#1e293b';
                return `<td style="padding:10px 12px; font-weight:700; color:${color}; font-size:13px;">${val}</td>`;
              }
              if (h.key === 'standing') {
                const isGood = val === 'Good Standing';
                return `<td style="padding:10px 12px;"><span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:11.5px; font-weight:600; background:${isGood ? '#ecfdf5' : '#fef2f2'}; color:${isGood ? '#065f46' : '#991b1b'};">${val}</span></td>`;
              }
              return `<td style="padding:10px 12px; color:#334155; font-size:13px;">${val}</td>`;
            }).join('')}
          </tr>
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

      let filename = `my_${reportType}_report_${Date.now()}.${format === 'excel' ? 'xlsx' : 'csv'}`;
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
    if (filterSemester) filterSemester.value = '';
    if (filterAcademicYear) filterAcademicYear.value = '';
    if (filterCourse) filterCourse.value = '';
    if (filterStartDate) filterStartDate.value = '';
    if (filterEndDate) filterEndDate.value = '';
    if (filterDayOfWeek) filterDayOfWeek.value = '';
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
      generateReport();
      if (e.target.closest('.btn-report-view')) {
        const previewEl = document.getElementById('reportPrintArea');
        if (previewEl) previewEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  if (reportTypeSelect) {
    reportTypeSelect.addEventListener('change', () => {
      syncCategoryCards(reportTypeSelect.value);
      updateVisibleFilters();
      generateReport();
    });
  }

  if (btnGenerateReport) btnGenerateReport.addEventListener('click', generateReport);
  if (btnResetFilters) btnResetFilters.addEventListener('click', resetFilters);
  if (btnRetryReport) btnRetryReport.addEventListener('click', generateReport);
  if (btnExportCsv) btnExportCsv.addEventListener('click', () => downloadExport('csv'));
  if (btnExportExcel) btnExportExcel.addEventListener('click', () => downloadExport('excel'));
  if (btnPrintReport) btnPrintReport.addEventListener('click', () => window.print());

  [filterSemester, filterAcademicYear, filterCourse, filterDayOfWeek].forEach(el => {
    if (el) el.addEventListener('change', generateReport);
  });
  [filterStartDate, filterEndDate].forEach(el => {
    if (el) el.addEventListener('change', generateReport);
  });

  // Init
  if (reportTypeSelect) syncCategoryCards(reportTypeSelect.value);
  updateVisibleFilters();

  fetchStudentProfile().then(() => {
    loadFilterOptions().then(() => {
      generateReport();
    });
  });

})();
