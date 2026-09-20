/**
 * Student Grades & Results Controller - Student Information Portal
 * Handles student transcript viewing, semester filtering, KPI metrics,
 * and responsive dual-view rendering (desktop table vs. mobile cards).
 */

(function () {
  'use strict';

  // 1. Session & Auth Guard
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');

  if (!token || !userStr) {
    window.location.replace('/login.html');
    return;
  }

  let currentUser = null;
  try {
    currentUser = JSON.parse(userStr);
  } catch (e) {
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('/login.html');
    return;
  }

  if (!currentUser || currentUser.role !== 'STUDENT') {
    window.location.replace('/login.html');
    return;
  }

  // DOM Elements
  const kpiCgpa = document.getElementById('kpiCgpa');
  const kpiCgpaBadge = document.getElementById('kpiCgpaBadge');
  const kpiCgpaTrend = document.getElementById('kpiCgpaTrend');

  const kpiSgpa = document.getElementById('kpiSgpa');
  const kpiSgpaBadge = document.getElementById('kpiSgpaBadge');
  const kpiSgpaTrend = document.getElementById('kpiSgpaTrend');

  const kpiCredits = document.getElementById('kpiCredits');
  const kpiCreditsSupport = document.getElementById('kpiCreditsSupport');
  const kpiCreditsTrend = document.getElementById('kpiCreditsTrend');

  const kpiBacklogs = document.getElementById('kpiBacklogs');
  const kpiBacklogsBadge = document.getElementById('kpiBacklogsBadge');
  const kpiBacklogsTrend = document.getElementById('kpiBacklogsTrend');
  const kpiBacklogsIconBadge = document.getElementById('kpiBacklogsIconBadge');

  const selectSem = document.getElementById('selectSem');
  const gradeSheetStatusBadge = document.getElementById('gradeSheetStatusBadge');

  const gradesTbody = document.getElementById('gradesTbody');
  const gradesTfoot = document.getElementById('gradesTfoot');
  const gradesCardsMobile = document.getElementById('gradesCardsMobile');

  // Semester Summary elements
  const semesterSummaryCard = document.getElementById('semesterSummaryCard');
  const summaryTotalCredits = document.getElementById('summaryTotalCredits');
  const summaryTotalMarks = document.getElementById('summaryTotalMarks');
  const summarySgpa = document.getElementById('summarySgpa');
  const summaryStatusBadge = document.getElementById('summaryStatusBadge');

  // Top header chips
  const headerAcademicYear = document.getElementById('headerAcademicYear');
  const headerSemester = document.getElementById('headerSemester');
  const headerDepartment = document.getElementById('headerDepartment');
  const headerPrn = document.getElementById('headerPrn');

  // State cache
  let allGrades = [];
  let overallMetrics = {};
  let studentInfo = null;

  // Fixed Semesters (Semesters I through VIII)
  const FIXED_SEMESTERS = [
    { value: '1', label: 'Semester I' },
    { value: '2', label: 'Semester II' },
    { value: '3', label: 'Semester III' },
    { value: '4', label: 'Semester IV' },
    { value: '5', label: 'Semester V' },
    { value: '6', label: 'Semester VI' },
    { value: '7', label: 'Semester VII' },
    { value: '8', label: 'Semester VIII' }
  ];

  const SEMESTER_ROMAN_MAP = {
    '1': 'I', '2': 'II', '3': 'III', '4': 'IV',
    '5': 'V', '6': 'VI', '7': 'VII', '8': 'VIII',
    'I': '1', 'II': '2', 'III': '3', 'IV': '4',
    'V': '5', 'VI': '6', 'VII': '7', 'VIII': '8'
  };

  const SEMESTER_LABEL_MAP = {
    '1': 'Semester I',
    '2': 'Semester II',
    '3': 'Semester III',
    '4': 'Semester IV',
    '5': 'Semester V',
    '6': 'Semester VI',
    '7': 'Semester VII',
    '8': 'Semester VIII',
    'I': 'Semester I',
    'II': 'Semester II',
    'III': 'Semester III',
    'IV': 'Semester IV',
    'V': 'Semester V',
    'VI': 'Semester VI',
    'VII': 'Semester VII',
    'VIII': 'Semester VIII'
  };

  function normalizeSemester(val) {
    if (!val) return '';
    const clean = String(val).replace(/Semester/i, '').replace(/Term/i, '').trim();
    const num = parseInt(clean, 10);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      return String(num);
    }
    if (SEMESTER_ROMAN_MAP[clean]) {
      return SEMESTER_ROMAN_MAP[clean];
    }
    return clean;
  }

  function matchesSemester(recordSem, filterSem) {
    if (!filterSem || filterSem === 'all') return true;
    const normRecord = normalizeSemester(recordSem);
    const normFilter = normalizeSemester(filterSem);
    return normRecord === normFilter;
  }

  function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function getGradeBadgeStyle(letterGrade) {
    const lg = String(letterGrade || '').trim().toUpperCase();
    if (['O', 'A+', 'A'].includes(lg)) {
      return 'background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;';
    } else if (['B+', 'B'].includes(lg)) {
      return 'background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;';
    } else if (['C', 'P'].includes(lg)) {
      return 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;';
    } else if (lg === 'F') {
      return 'background: #fee2e2; color: #dc2626; border: 1px solid #fecaca;';
    }
    return 'background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;';
  }

  function renderGrades(grades, selectedSem) {
    if (!gradesTbody) return;

    if (!grades || grades.length === 0) {
      const activeSem = selectedSem !== undefined ? selectedSem : (selectSem ? selectSem.value : 'all');
      const normSem = normalizeSemester(activeSem);
      const semLabel = activeSem && activeSem !== 'all'
        ? (SEMESTER_LABEL_MAP[normSem] || SEMESTER_LABEL_MAP[activeSem] || `Semester ${activeSem}`)
        : '';
      const emptyMsg = semLabel
        ? `No results available for ${semLabel}.`
        : 'No examination grades or statements of marks available for this selection.';
      const emptySubMsg = semLabel
        ? 'Select another semester or check back after evaluations are published.'
        : 'Select another semester or check back after evaluations are published.';

      // Empty desktop state
      gradesTbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 48px 16px; color: var(--stu-text-muted, #64748b);">
            <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">${escapeHtml(emptyMsg)}</div>
            <span style="font-size: 12.5px; color: #94a3b8;">${escapeHtml(emptySubMsg)}</span>
            ${semLabel ? `<div style="margin-top: 12px;"><button type="button" class="btn btn-outline-primary btn-sm btn-reset-sem-filter" style="cursor: pointer; padding: 5px 14px; border-radius: 6px; font-size: 12.5px; font-weight: 600;">Show All Semesters</button></div>` : ''}
          </td>
        </tr>`;

      // Empty mobile state
      if (gradesCardsMobile) {
        gradesCardsMobile.innerHTML = `
          <div style="text-align: center; padding: 36px 16px; color: #64748b; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 12px;">
            <p style="margin: 0 0 6px 0; font-size: 13.5px; font-weight: 500;">${escapeHtml(emptyMsg)}</p>
            <span style="font-size: 12px; color: #94a3b8;">${escapeHtml(emptySubMsg)}</span>
            ${semLabel ? `<div style="margin-top: 12px;"><button type="button" class="btn btn-outline-primary btn-sm btn-reset-sem-filter" style="cursor: pointer; padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 600;">Show All Semesters</button></div>` : ''}
          </div>`;
      }

      // Attach reset event listener to dynamically created buttons
      document.querySelectorAll('.btn-reset-sem-filter').forEach(btn => {
        btn.addEventListener('click', () => {
          if (selectSem) {
            selectSem.value = 'all';
            selectSem.dispatchEvent(new Event('change'));
          }
        });
      });

      if (gradesTfoot) gradesTfoot.style.display = 'none';
      if (semesterSummaryCard) semesterSummaryCard.style.display = 'none';

      if (gradeSheetStatusBadge) {
        gradeSheetStatusBadge.textContent = 'NO GRADES PUBLISHED';
        gradeSheetStatusBadge.style.background = 'rgba(255, 255, 255, 0.15)';
        gradeSheetStatusBadge.style.color = '#ffffff';
      }
      return;
    }

    if (gradeSheetStatusBadge) {
      gradeSheetStatusBadge.textContent = 'OFFICIAL EVALUATED TRANSCRIPT';
      gradeSheetStatusBadge.style.background = 'rgba(255, 255, 255, 0.2)';
      gradeSheetStatusBadge.style.color = '#ffffff';
    }

    let totalCredits = 0;
    let totalMarks = 0;
    let maxMarksTotal = 0;
    let hasFail = false;

    // 1. Render Desktop Table Rows
    gradesTbody.innerHTML = grades.map(g => {
      const cred = parseFloat(g.credits || 0);
      totalCredits += cred;
      totalMarks += parseFloat(g.total_marks || 0);
      maxMarksTotal += parseFloat(g.max_marks || 100);

      const isPass = (g.status || '').toLowerCase() === 'pass' || (g.grade_point !== null && g.grade_point !== undefined && g.grade_point >= 4);
      if (!isPass) hasFail = true;

      const badgeStyle = isPass
        ? 'background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;'
        : 'background: #fee2e2; color: #dc2626; border: 1px solid #fecaca;';
      const statusText = isPass ? 'PASS' : 'FAIL';
      const gradeBadgeStyle = getGradeBadgeStyle(g.letter_grade);

      return `
        <tr>
          <td style="font-weight: 700; color: #1d4ed8; letter-spacing: 0.3px;">${escapeHtml(g.course_code || '-')}</td>
          <td style="font-weight: 600; color: #0f172a;">${escapeHtml(g.course_name || '-')}</td>
          <td class="text-center" style="font-weight: 600; color: #334155;">${cred}</td>
          <td class="text-center" style="color: #475569;">${g.internal_marks ?? '-'}</td>
          <td class="text-center" style="color: #475569;">${g.external_marks ?? '-'}</td>
          <td class="text-center" style="font-weight: 700; color: #0f172a;">${g.total_marks ?? '-'}</td>
          <td class="text-center" style="font-weight: 700; color: #1e293b;">${g.grade_point ?? '-'}</td>
          <td class="text-center">
            <span class="badge" style="display: inline-block; padding: 3px 9px; border-radius: 6px; font-weight: 700; font-size: 11.5px; ${gradeBadgeStyle}">
              ${escapeHtml(g.letter_grade || '-')}
            </span>
          </td>
          <td class="text-center">
            <span class="badge" style="display: inline-block; padding: 3px 10px; border-radius: 9999px; font-weight: 700; font-size: 11.5px; letter-spacing: 0.4px; ${badgeStyle}">
              ${statusText}
            </span>
          </td>
        </tr>`;
    }).join('');

    // 2. Render Mobile Responsive Cards View
    if (gradesCardsMobile) {
      gradesCardsMobile.innerHTML = grades.map(g => {
        const cred = parseFloat(g.credits || 0);
        const isPass = (g.status || '').toLowerCase() === 'pass' || (g.grade_point !== null && g.grade_point !== undefined && g.grade_point >= 4);
        const badgeStyle = isPass
          ? 'background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;'
          : 'background: #fee2e2; color: #dc2626; border: 1px solid #fecaca;';
        const statusText = isPass ? 'PASS' : 'FAIL';
        const gradeBadgeStyle = getGradeBadgeStyle(g.letter_grade);

        return `
          <div class="grade-result-card">
            <div class="grade-card-top">
              <div>
                <span class="grade-card-code">${escapeHtml(g.course_code || '-')}</span>
                <h4 class="grade-card-course-name">${escapeHtml(g.course_name || '-')}</h4>
              </div>
              <span class="badge" style="padding: 3px 10px; border-radius: 9999px; font-weight: 700; font-size: 11.5px; letter-spacing: 0.4px; ${badgeStyle}">
                ${statusText}
              </span>
            </div>

            <div class="grade-card-metrics-grid">
              <div class="grade-metric-item">
                <span class="grade-metric-label">Credits</span>
                <span class="grade-metric-val">${cred}</span>
              </div>
              <div class="grade-metric-item">
                <span class="grade-metric-label">Internal</span>
                <span class="grade-metric-val">${g.internal_marks ?? '-'}</span>
              </div>
              <div class="grade-metric-item">
                <span class="grade-metric-label">End Sem</span>
                <span class="grade-metric-val">${g.external_marks ?? '-'}</span>
              </div>
              <div class="grade-metric-item">
                <span class="grade-metric-label">Total</span>
                <span class="grade-metric-val font-bold" style="color: #0f172a;">${g.total_marks ?? '-'}</span>
              </div>
            </div>

            <div class="grade-card-footer">
              <div class="grade-footer-stat">
                <span class="grade-footer-label">Grade Points</span>
                <span class="grade-footer-val">${g.grade_point ?? '-'}</span>
              </div>
              <div class="grade-footer-stat">
                <span class="grade-footer-label">Grade</span>
                <span class="badge" style="padding: 3px 9px; border-radius: 6px; font-weight: 700; font-size: 12px; ${gradeBadgeStyle}">
                  ${escapeHtml(g.letter_grade || '-')}
                </span>
              </div>
            </div>
          </div>`;
      }).join('');
    }

    // 3. Render Semester Summary
    const sgpaVal = overallMetrics.sgpa !== undefined && overallMetrics.sgpa !== null
      ? Number(overallMetrics.sgpa).toFixed(2)
      : (grades.length > 0 ? (grades.reduce((sum, item) => sum + (item.grade_point || 0), 0) / grades.length).toFixed(2) : '--');

    if (semesterSummaryCard) {
      semesterSummaryCard.style.display = 'flex';
      if (summaryTotalCredits) summaryTotalCredits.textContent = `${totalCredits} Credits`;
      if (summaryTotalMarks) summaryTotalMarks.innerHTML = `Total Marks: <strong>${totalMarks} / ${maxMarksTotal}</strong>`;
      if (summarySgpa) summarySgpa.textContent = sgpaVal;
      if (summaryStatusBadge) {
        summaryStatusBadge.className = hasFail ? 'badge badge-danger summary-status-badge' : 'badge badge-success summary-status-badge';
        summaryStatusBadge.textContent = hasFail ? 'ARREARS PENDING' : 'SEMESTER CLEARED';
      }
    }

    // Also update legacy footer if present
    if (gradesTfoot) {
      gradesTfoot.style.display = '';
      const footCred = document.getElementById('footerTotalCredits');
      if (footCred) footCred.textContent = `${totalCredits} Credits`;

      const footMarks = document.getElementById('footerTotalMarks');
      if (footMarks) footMarks.textContent = `Total Marks: ${totalMarks} / ${maxMarksTotal}`;

      const footSgpa = document.getElementById('footerSgpa');
      if (footSgpa) footSgpa.textContent = `SGPA: ${sgpaVal}`;

      const footBadge = document.getElementById('footerStatusBadge');
      if (footBadge) {
        footBadge.className = hasFail ? 'badge badge-danger' : 'badge badge-success';
        footBadge.textContent = hasFail ? 'Arrears Pending' : 'Semester Cleared';
      }
    }
  }

  function populateSemesterDropdown() {
    if (!selectSem) return;
    const currentVal = selectSem.value;

    let html = '<option value="all">All Semesters</option>';
    FIXED_SEMESTERS.forEach(s => {
      html += `<option value="${s.value}">${s.label}</option>`;
    });

    selectSem.innerHTML = html;

    // Retain previous user selection if valid, otherwise default to 'all'
    if (currentVal && (currentVal === 'all' || FIXED_SEMESTERS.some(s => s.value === currentVal))) {
      selectSem.value = currentVal;
    } else {
      selectSem.value = 'all';
    }
  }

  async function loadGrades() {
    try {
      const res = await fetch('/api/grades/student/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        showErrorState();
        return;
      }

      const json = await res.json();
      if (json && json.success && json.data) {
        allGrades = json.data.grades || [];
        overallMetrics = json.data.metrics || {};
        studentInfo = json.data.student || {};

        // Top Header Chips
        if (studentInfo) {
          if (headerAcademicYear && allGrades[0]?.course_academic_year) {
            headerAcademicYear.textContent = `Academic Year: ${allGrades[0].course_academic_year}`;
          }
          if (headerSemester && studentInfo.semester) {
            headerSemester.textContent = `Semester: Term ${studentInfo.semester}`;
          }
          if (headerDepartment && (studentInfo.department_name || studentInfo.department_code)) {
            headerDepartment.textContent = `Dept: ${studentInfo.department_name || studentInfo.department_code}`;
          }
          if (headerPrn && (studentInfo.prn_number || studentInfo.enrollment_number)) {
            headerPrn.textContent = `PRN: ${studentInfo.prn_number || studentInfo.enrollment_number}`;
          }
        }

        // 1. Cumulative GPA (CGPA)
        const sgpaFormatted = overallMetrics.sgpa !== undefined && overallMetrics.sgpa !== null
          ? Number(overallMetrics.sgpa).toFixed(2)
          : '--';

        if (kpiCgpa) {
          kpiCgpa.innerHTML = `${sgpaFormatted} <span style="font-size: 15px; font-weight: 500; color: #64748b;">/ 10.0</span>`;
        }
        if (kpiCgpaBadge) {
          const isGood = (overallMetrics.failed_courses || 0) === 0 && (overallMetrics.passed_courses || 0) > 0;
          kpiCgpaBadge.className = isGood ? 'badge badge-success' : 'badge badge-secondary';
          kpiCgpaBadge.textContent = isGood ? 'Good Standing' : 'Evaluated';
        }
        if (kpiCgpaTrend) {
          kpiCgpaTrend.textContent = (overallMetrics.failed_courses || 0) === 0 ? 'Good Standing' : 'Evaluated';
        }

        // 2. Latest Semester (SGPA)
        if (kpiSgpa) {
          kpiSgpa.innerHTML = `${sgpaFormatted} <span style="font-size: 15px; font-weight: 500; color: #64748b;">/ 10.0</span>`;
        }
        if (kpiSgpaBadge) {
          const semNum = studentInfo?.semester || allGrades[0]?.course_semester || 5;
          kpiSgpaBadge.textContent = `Semester ${semNum}`;
        }
        if (kpiSgpaTrend) {
          kpiSgpaTrend.textContent = `Semester ${studentInfo?.semester || 5} Exam`;
        }

        // 3. Credits Earned
        if (kpiCredits) {
          kpiCredits.innerHTML = `${overallMetrics.total_credits || 0} <span style="font-size: 15px; font-weight: 500; color: #64748b;">Credits</span>`;
        }
        if (kpiCreditsSupport) {
          kpiCreditsSupport.innerHTML = `<span style="color: #475569; font-weight: 500;">${overallMetrics.passed_courses || 0} Course(s) Completed</span>`;
        }
        if (kpiCreditsTrend) {
          kpiCreditsTrend.textContent = `${overallMetrics.passed_courses || 0} Course(s) Completed`;
        }

        // 4. Backlogs / Arrears
        const backlogsCount = overallMetrics.failed_courses || 0;
        if (kpiBacklogs) {
          kpiBacklogs.textContent = backlogsCount;
        }
        if (kpiBacklogsBadge) {
          if (backlogsCount === 0) {
            kpiBacklogsBadge.className = 'badge badge-success';
            kpiBacklogsBadge.textContent = 'No Backlogs';
            if (kpiBacklogsIconBadge) {
              kpiBacklogsIconBadge.className = 'kpi-icon-badge kpi-badge-emerald';
            }
          } else {
            kpiBacklogsBadge.className = 'badge badge-danger';
            kpiBacklogsBadge.textContent = `${backlogsCount} Active Arrear${backlogsCount === 1 ? '' : 's'}`;
            if (kpiBacklogsIconBadge) {
              kpiBacklogsIconBadge.className = 'kpi-icon-badge kpi-badge-amber';
            }
          }
        }
        if (kpiBacklogsTrend) {
          kpiBacklogsTrend.textContent = backlogsCount === 0 ? 'No arrears' : 'Action Required';
        }

        // Populate semester dropdown options with fixed 8 semesters
        populateSemesterDropdown();

        // Filter and render initial view
        const initialSem = selectSem ? selectSem.value : 'all';
        if (initialSem === 'all') {
          renderGrades(allGrades, 'all');
        } else {
          const filtered = allGrades.filter(g => matchesSemester(g.course_semester, initialSem));
          renderGrades(filtered, initialSem);
        }
      } else {
        showErrorState();
      }
    } catch (err) {
      console.error('Failed to load grades:', err);
      showErrorState();
    }
  }

  function showErrorState() {
    if (gradesTbody) {
      gradesTbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 48px 16px;">
            <div style="color: #b91c1c; font-weight: 700; margin-bottom: 8px;">Unable to load statement of marks</div>
            <p style="color: #64748b; font-size: 13px; margin: 0 0 14px 0;">Please check your connection and try again.</p>
            <button type="button" class="btn btn-primary btn-sm" id="btnRetryGrades">Retry</button>
          </td>
        </tr>`;
      document.getElementById('btnRetryGrades')?.addEventListener('click', loadGrades);
    }
    if (gradesCardsMobile) {
      gradesCardsMobile.innerHTML = `
        <div style="text-align: center; padding: 36px 16px; color: #b91c1c; background: #ffffff; border: 1px dashed #fca5a5; border-radius: 12px;">
          <p style="margin: 0 0 10px 0; font-size: 13.5px; font-weight: 600;">Unable to load statement of marks</p>
          <button type="button" class="btn btn-primary btn-sm" id="btnRetryMobileGrades">Retry</button>
        </div>`;
      document.getElementById('btnRetryMobileGrades')?.addEventListener('click', loadGrades);
    }
  }

  // Event Listeners
  if (selectSem) {
    selectSem.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'all') {
        renderGrades(allGrades, 'all');
      } else {
        const filtered = allGrades.filter(g => matchesSemester(g.course_semester, val));
        renderGrades(filtered, val);
      }
    });
  }

  // Initial fetch
  loadGrades();
})();
