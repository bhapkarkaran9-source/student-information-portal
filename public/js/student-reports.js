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
  const reportPreviewMobileCards = document.getElementById('reportPreviewMobileCards');
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

    if (key === 'attendance_percentage' || key === 'percentage') {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        if (key === 'attendance_percentage' || row.hasOwnProperty('total_lectures') || row.hasOwnProperty('present_count')) {
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
          <td colspan="12" class="text-center py-5">
            <p class="mt-2 text-muted" style="margin: 30px 0; color: #64748b; font-size: 14px;">Loading your academic report from live records...</p>
          </td>
        </tr>
      `;
    }
    if (reportPreviewMobileCards) {
      reportPreviewMobileCards.innerHTML = `
        <div style="text-align:center; padding: 32px 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
          <p style="color:#64748b; font-size:13.5px; margin:0;">Loading your academic report from live records...</p>
        </div>
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
            <td colspan="12" class="text-center py-5 text-danger" style="text-align:center; padding: 40px 16px;">
              <p style="font-size: 14px; margin: 0; color: #b91c1c; font-weight: 600;">${escapeHtml(err.message || 'Error generating report. Please check filters or retry.')}</p>
            </td>
          </tr>
        `;
      }
      if (reportPreviewMobileCards) {
        reportPreviewMobileCards.innerHTML = `
          <div style="text-align:center; padding: 32px 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b;">
            <p style="font-size: 14px; margin: 0; font-weight: 600;">${escapeHtml(err.message || 'Error generating report. Please check filters or retry.')}</p>
          </div>
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
      const colors = ['kpi-blue', 'kpi-indigo', 'kpi-emerald', 'kpi-amber', 'kpi-rose'];
      previewSummaryGrid.innerHTML = Object.entries(data.summary).map(([key, val], idx) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        let accent = colors[idx % colors.length];
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('defaulter') || lowerKey.includes('risk') || lowerKey.includes('dropped') || lowerKey.includes('fail')) {
          accent = 'kpi-rose';
        } else if (lowerKey.includes('pass') || lowerKey.includes('good') || lowerKey.includes('attendance') || lowerKey.includes('credit') || lowerKey.includes('enrolled')) {
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

    // Dynamic Columns
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
              <div style="font-weight:600; font-size:14px; color:#475569;">No report data available for the selected filters.</div>
              <div style="font-size:13px; color:#64748b; margin-top:4px;">Try adjusting your academic year, semester, or course filters.</div>
            </td>
          </tr>
        `;
      }
      if (reportPreviewMobileCards) {
        reportPreviewMobileCards.innerHTML = `
          <div style="text-align:center; padding: 36px 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="font-weight:600; font-size:14px; color:#475569;">No report data available for the selected filters.</div>
            <div style="font-size:13px; color:#64748b; margin-top:4px;">Try adjusting your academic year, semester, or course filters.</div>
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
        const title = row.course_name || row.day_of_week || (row.semester ? `Semester ${row.semester}` : `Record #${idx + 1}`);
        let badge = '';
        if (row.course_code) {
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
