/**
 * Course Report - Admin Controller
 * Student Information Portal - College ERP UI
 * ZERO IMAGES - Real Database Data Only
 */

(function () {
  'use strict';

  // 1. AUTHENTICATION & API HELPER
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');

  if (!token || !userStr) {
    window.location.replace('/login.html');
    return;
  }

  let user = null;
  try {
    user = JSON.parse(userStr);
  } catch (e) {
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace('/login.html');
    return;
  }

  const userRole = (user.role || user.role_name || '').toUpperCase();
  if (userRole !== 'ADMIN') {
    window.location.replace('/login.html');
    return;
  }

  async function apiFetch(url, options = {}) {
    const defaultHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...(options.headers || {})
        }
      });

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/pages/auth/login.html';
        return null;
      }

      return response;
    } catch (err) {
      console.error('API Fetch Error:', err);
      showToast('Network error occurred. Please check connection.', 'error');
      return null;
    }
  }

  // TOAST NOTIFICATIONS
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <button type="button" class="toast-close" aria-label="Close">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.transition = 'opacity 300ms ease, transform 300ms ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
      }
    }, 4500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getInitials(name) {
    if (!name) return 'S';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return (parts[0][0] || 'S').toUpperCase();
  }

  function getGradeBadge(letterGrade) {
    switch (letterGrade) {
      case 'O':
        return `<span class="badge-grade badge-grade-o">O</span>`;
      case 'A+':
        return `<span class="badge-grade badge-grade-a-plus">A+</span>`;
      case 'A':
        return `<span class="badge-grade badge-grade-a">A</span>`;
      case 'B+':
        return `<span class="badge-grade badge-grade-b-plus">B+</span>`;
      case 'B':
        return `<span class="badge-grade badge-grade-b">B</span>`;
      case 'C':
        return `<span class="badge-grade badge-grade-c">C</span>`;
      case 'P':
        return `<span class="badge-grade badge-grade-p">P</span>`;
      case 'F':
      default:
        return `<span class="badge-grade badge-grade-f">F</span>`;
    }
  }

  function getStatusBadge(status) {
    if (status === 'Pass') {
      return `<span class="badge-status-pass"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Pass</span>`;
    }
    return `<span class="badge-status-fail"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Backlog</span>`;
  }

  // STATE MANAGEMENT
  let allDepartments = [];
  let allCourses = [];
  let currentCourse = null;
  let currentCourseStats = null;
  let currentStudents = [];
  let filteredStudents = [];

  // DOM ELEMENTS
  const selectDepartment = document.getElementById('selectDepartment');
  const selectCourse = document.getElementById('selectCourse');
  const selectSemester = document.getElementById('selectSemester');
  const selectAcademicYear = document.getElementById('selectAcademicYear');

  const btnGenerateReport = document.getElementById('btnGenerateReport');
  const btnResetCourseReport = document.getElementById('btnResetCourseReport');
  const btnExportCourseCsv = document.getElementById('btnExportCourseCsv');

  const kpiTotalStudents = document.getElementById('kpiTotalStudents');
  const kpiResultsRecorded = document.getElementById('kpiResultsRecorded');
  const kpiPassed = document.getElementById('kpiPassed');
  const kpiFailed = document.getElementById('kpiFailed');
  const kpiPassRate = document.getElementById('kpiPassRate');
  const kpiAverageMarks = document.getElementById('kpiAverageMarks');

  const performanceOverviewCard = document.getElementById('performanceOverviewCard');
  const selectedCourseBadge = document.getElementById('selectedCourseBadge');
  const overviewAvgMarks = document.getElementById('overviewAvgMarks');
  const overviewPassRate = document.getElementById('overviewPassRate');
  const overviewHighestMarks = document.getElementById('overviewHighestMarks');
  const overviewLowestMarks = document.getElementById('overviewLowestMarks');
  const overviewHighestGrade = document.getElementById('overviewHighestGrade');
  const overviewAvgGp = document.getElementById('overviewAvgGp');

  const searchCourseResultsInput = document.getElementById('searchCourseResultsInput');
  const courseReportTableBody = document.getElementById('courseReportTableBody');
  const courseTableCountBadge = document.getElementById('courseTableCountBadge');

  // INITIAL SETUP & LOAD
  document.addEventListener('DOMContentLoaded', async () => {
    initHeaderAndSidebar();
    await loadReferenceData();

    // Check for query parameters (?course_id=XX)
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedCourseId = urlParams.get('course_id');
    const preselectedSemester = urlParams.get('semester');

    if (preselectedSemester && selectSemester) {
      selectSemester.value = preselectedSemester;
    }

    if (preselectedCourseId && selectCourse) {
      selectCourse.value = preselectedCourseId;
      await generateCourseReport();
    }
  });

  // HEADER & SIDEBAR LOGIC
  function initHeaderAndSidebar() {
    const adminName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'System Admin';
    const initials = getInitials(adminName);

    const headerAdminAvatar = document.getElementById('headerAdminAvatar');
    const headerAdminName = document.getElementById('headerAdminName');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const sidebarUserName = document.getElementById('sidebarUserName');
    const dropdownAdminName = document.getElementById('dropdownAdminName');
    const dropdownAdminEmail = document.getElementById('dropdownAdminEmail');

    if (headerAdminAvatar) {
      if (typeof window.renderAvatarElement === 'function') {
        window.renderAvatarElement(headerAdminAvatar, user.profile_photo_url, initials, adminName + ' avatar');
      } else {
        headerAdminAvatar.textContent = initials;
      }
    }
    if (headerAdminName) headerAdminName.textContent = adminName;
    if (sidebarAvatar) {
      if (typeof window.renderAvatarElement === 'function') {
        window.renderAvatarElement(sidebarAvatar, user.profile_photo_url, initials, adminName + ' avatar');
      } else {
        sidebarAvatar.textContent = initials;
      }
    }
    if (sidebarUserName) sidebarUserName.textContent = adminName;
    if (dropdownAdminName) dropdownAdminName.textContent = adminName;
    if (dropdownAdminEmail) dropdownAdminEmail.textContent = user.email || 'admin@portal.local';

    // Profile Dropdown Toggle
    const profileDropdownToggle = document.getElementById('profileDropdownToggle');
    const profileDropdownMenu = document.getElementById('profileDropdownMenu');

    if (profileDropdownToggle && profileDropdownMenu) {
      profileDropdownToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanded = profileDropdownToggle.getAttribute('aria-expanded') === 'true';
        profileDropdownToggle.setAttribute('aria-expanded', !expanded);
        profileDropdownMenu.classList.toggle('show');
      });

      document.addEventListener('click', (e) => {
        if (!profileDropdownToggle.contains(e.target) && !profileDropdownMenu.contains(e.target)) {
          profileDropdownToggle.setAttribute('aria-expanded', 'false');
          profileDropdownMenu.classList.remove('show');
        }
      });
    }

    // Logout
    const logoutHandler = () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/pages/auth/login.html';
    };

    document.getElementById('sidebarLogoutBtn')?.addEventListener('click', logoutHandler);
    document.getElementById('dropdownLogoutBtn')?.addEventListener('click', logoutHandler);

    // Mobile Sidebar Toggle
    const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
    const adminSidebar = document.getElementById('adminSidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

    if (mobileSidebarToggle && adminSidebar && sidebarBackdrop) {
      mobileSidebarToggle.addEventListener('click', () => {
        adminSidebar.classList.add('open');
        sidebarBackdrop.classList.remove('hidden');
      });

      const closeSidebar = () => {
        adminSidebar.classList.remove('open');
        sidebarBackdrop.classList.add('hidden');
      };

      sidebarCloseBtn?.addEventListener('click', closeSidebar);
      sidebarBackdrop.addEventListener('click', closeSidebar);
    }
  }

  // 2. LOAD DEPARTMENTS AND COURSES
  async function loadReferenceData() {
    try {
      // 1. Departments
      const deptRes = await apiFetch('/api/departments?limit=100');
      if (deptRes && deptRes.ok) {
        const deptData = await deptRes.json();
        allDepartments = deptData.data?.departments || [];

        selectDepartment.innerHTML = `<option value="">All Departments</option>`;
        allDepartments.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.department_id;
          opt.textContent = `${d.department_name} (${d.department_code})`;
          selectDepartment.appendChild(opt);
        });
      }

      // 2. Courses
      const courseRes = await apiFetch('/api/courses?limit=100');
      if (courseRes && courseRes.ok) {
        const courseData = await courseRes.json();
        allCourses = courseData.data?.courses || [];
        populateCoursesDropdown(allCourses);
      }
    } catch (err) {
      console.error('Error loading course report references:', err);
      showToast('Error loading course catalogue.', 'error');
    }
  }

  function populateCoursesDropdown(courses) {
    selectCourse.innerHTML = `<option value="">-- Select a Course --</option>`;
    courses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.course_id;
      const credits = c.credits ? ` (${parseFloat(c.credits).toFixed(1)} Credits)` : '';
      opt.textContent = `${c.course_code} - ${c.course_name}${credits}`;
      selectCourse.appendChild(opt);
    });
  }

  // Filter courses by department selection
  selectDepartment?.addEventListener('change', () => {
    const deptId = selectDepartment.value;
    if (!deptId) {
      populateCoursesDropdown(allCourses);
    } else {
      const filtered = allCourses.filter(c => String(c.department_id) === String(deptId));
      populateCoursesDropdown(filtered);
    }
  });

  // 3. GENERATE COURSE REPORT
  async function generateCourseReport() {
    const courseId = selectCourse.value;
    if (!courseId) {
      showToast('Please select a course to generate report.', 'info');
      return;
    }

    // Loading State
    courseReportTableBody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center py-4">
          <div class="spinner"></div>
          <p style="margin-top: 8px; color: #64748b; font-size: 13.5px;">Compiling course results and class statistics...</p>
        </td>
      </tr>
    `;

    try {
      const res = await apiFetch(`/api/grades/course/${courseId}`);
      if (!res || !res.ok) {
        renderNoResultsState();
        return;
      }

      const responseData = await res.json();
      currentCourse = responseData.data?.course || null;
      currentCourseStats = responseData.data?.stats || {};
      const rawStudents = responseData.data?.students || [];

      // Sort students by percentage descending to compute ranks accurately
      currentStudents = [...rawStudents].sort((a, b) => {
        const pctDiff = Number(b.percentage || 0) - Number(a.percentage || 0);
        if (pctDiff !== 0) return pctDiff;
        return Number(b.total_marks || 0) - Number(a.total_marks || 0);
      });

      // Filter by semester / academic year if selected
      const selectedSem = selectSemester.value;
      const selectedYear = selectAcademicYear.value;

      filteredStudents = currentStudents.filter(s => {
        let match = true;
        if (selectedSem && s.semester && String(s.semester) !== String(selectedSem)) match = false;
        if (selectedYear && (s.academic_year || s.course_academic_year) && (s.academic_year || s.course_academic_year) !== selectedYear) match = false;
        return match;
      });

      if (filteredStudents.length === 0) {
        renderNoResultsState();
        return;
      }

      renderKpis(currentCourseStats, filteredStudents);
      renderPerformanceOverview(currentCourse, currentCourseStats, filteredStudents);
      renderTable(filteredStudents);

      btnExportCourseCsv.disabled = false;
    } catch (err) {
      console.error('Error generating course report:', err);
      showToast('Failed to generate course report.', 'error');
      renderNoResultsState();
    }
  }

  // 4. RENDER KPIS
  function renderKpis(stats, students) {
    const totalResults = students.length;
    const passed = students.filter(s => s.status === 'Pass').length;
    const failed = students.filter(s => s.status === 'Fail').length;
    const passRate = totalResults > 0 ? (passed / totalResults * 100).toFixed(1) + '%' : '0.0%';

    const totalPctSum = students.reduce((sum, s) => sum + Number(s.percentage || 0), 0);
    const avgMarks = totalResults > 0 ? (totalPctSum / totalResults).toFixed(1) + '%' : '0.0%';

    // Unique students count
    const uniqueStudents = new Set(students.map(s => s.student_id)).size;

    kpiTotalStudents.textContent = uniqueStudents || totalResults;
    kpiResultsRecorded.textContent = totalResults;
    kpiPassed.textContent = passed;
    kpiFailed.textContent = failed;
    kpiPassRate.textContent = passRate;
    kpiAverageMarks.textContent = avgMarks;
  }

  // 5. RENDER PERFORMANCE OVERVIEW
  function renderPerformanceOverview(course, stats, students) {
    performanceOverviewCard.classList.remove('hidden');

    if (course) {
      selectedCourseBadge.textContent = `${course.course_code} - ${course.course_name}`;
    }

    const totalResults = students.length;
    const passed = students.filter(s => s.status === 'Pass').length;
    const passRate = totalResults > 0 ? (passed / totalResults * 100).toFixed(1) + '%' : '0.0%';

    const marksList = students.map(s => Number(s.total_marks || 0));
    const highestMarks = marksList.length > 0 ? Math.max(...marksList).toFixed(1) : '--';
    const lowestMarks = marksList.length > 0 ? Math.min(...marksList).toFixed(1) : '--';

    // Highest Grade
    const gradeHierarchy = ['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F'];
    const highestGrade = gradeHierarchy.find(g => students.some(s => s.letter_grade === g)) || '--';

    // Average GP
    const totalGp = students.reduce((sum, s) => sum + (Number(s.grade_point) || 0), 0);
    const avgGp = totalResults > 0 ? (totalGp / totalResults).toFixed(2) : '--';

    const totalPctSum = students.reduce((sum, s) => sum + Number(s.percentage || 0), 0);
    const avgMarks = totalResults > 0 ? (totalPctSum / totalResults).toFixed(1) + '%' : '0.0%';

    overviewAvgMarks.textContent = avgMarks;
    overviewPassRate.textContent = passRate;
    overviewHighestMarks.textContent = highestMarks;
    overviewLowestMarks.textContent = lowestMarks;
    overviewHighestGrade.textContent = highestGrade;
    overviewAvgGp.textContent = avgGp;
  }

  // 6. RENDER TABLE WITH RANKS
  function renderTable(students) {
    courseTableCountBadge.textContent = `${students.length} Students`;

    if (students.length === 0) {
      courseReportTableBody.innerHTML = `
        <tr>
          <td colspan="12" class="text-center py-4 text-muted">
            No matching students found for search query.
          </td>
        </tr>
      `;
      return;
    }

    courseReportTableBody.innerHTML = students.map((s, index) => {
      const rank = index + 1;
      let rankBadge = `<span class="rank-badge rank-other">${rank}</span>`;
      if (rank === 1) rankBadge = `<span class="rank-badge rank-1" title="Top Rank">1</span>`;
      else if (rank === 2) rankBadge = `<span class="rank-badge rank-2" title="Rank 2">2</span>`;
      else if (rank === 3) rankBadge = `<span class="rank-badge rank-3" title="Rank 3">3</span>`;

      const studentName = s.student_name || 'Student';
      const initials = getInitials(studentName);
      const prn = s.prn_number || 'No PRN';

      const intMarks = s.assessment_type === 'Theory' ? Number(s.internal_marks || 0).toFixed(1) : '-';
      const extMarks = s.assessment_type === 'Theory' ? Number(s.external_marks || 0).toFixed(1) : '-';
      const pracMarks = s.assessment_type === 'Practical' ? Number(s.practical_marks || 0).toFixed(1) : '-';
      const totalMarks = Number(s.total_marks || 0).toFixed(1);
      const percentage = Number(s.percentage || 0).toFixed(1) + '%';

      const typeBadge = s.assessment_type === 'Theory'
        ? `<span class="badge" style="background-color: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe; font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 4px;">Theory</span>`
        : `<span class="badge" style="background-color: #fdf4ff; color: #9333ea; border: 1px solid #f0abfc; font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 4px;">Practical</span>`;

      return `
        <tr>
          <td>${rankBadge}</td>
          <td>
            <div class="student-cell">
              <div class="student-cell-avatar">${initials}</div>
              <div class="student-cell-meta">
                <span class="student-cell-name">${escapeHtml(studentName)}</span>
                <span class="student-cell-email">${escapeHtml(s.student_email || '')}</span>
              </div>
            </div>
          </td>
          <td><strong>${escapeHtml(prn)}</strong></td>
          <td>${typeBadge}</td>
          <td>${intMarks}</td>
          <td>${extMarks}</td>
          <td>${pracMarks}</td>
          <td><strong>${totalMarks}</strong></td>
          <td>${percentage}</td>
          <td>${getGradeBadge(s.letter_grade)}</td>
          <td><strong>${s.grade_point}</strong></td>
          <td>${getStatusBadge(s.status)}</td>
        </tr>
      `;
    }).join('');
  }

  // 7. REAL-TIME SEARCH FILTER
  searchCourseResultsInput?.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (!query) {
      renderTable(filteredStudents);
      return;
    }

    const matched = filteredStudents.filter(s => {
      const name = (s.student_name || '').toLowerCase();
      const prn = (s.prn_number || '').toLowerCase();
      return name.includes(query) || prn.includes(query);
    });

    renderTable(matched);
  });

  // 8. EMPTY STATES
  function resetCourseReportView() {
    selectDepartment.value = '';
    populateCoursesDropdown(allCourses);
    selectCourse.value = '';
    selectSemester.value = '';
    selectAcademicYear.value = '';
    if (searchCourseResultsInput) searchCourseResultsInput.value = '';

    performanceOverviewCard.classList.add('hidden');

    kpiTotalStudents.textContent = '--';
    kpiResultsRecorded.textContent = '--';
    kpiPassed.textContent = '--';
    kpiFailed.textContent = '--';
    kpiPassRate.textContent = '--';
    kpiAverageMarks.textContent = '--';

    courseTableCountBadge.textContent = '0 Students';

    courseReportTableBody.innerHTML = `
      <tr>
        <td colspan="12">
          <div class="erp-empty-state">
            <div class="erp-empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </div>
            <h3 class="erp-empty-title">Select a course to generate the report.</h3>
            <p class="erp-empty-desc">Choose a course and academic filters above, then click Generate Report to evaluate class results.</p>
          </div>
        </td>
      </tr>
    `;

    btnExportCourseCsv.disabled = true;
  }

  function renderNoResultsState() {
    performanceOverviewCard.classList.add('hidden');
    courseTableCountBadge.textContent = '0 Students';

    kpiTotalStudents.textContent = '0';
    kpiResultsRecorded.textContent = '0';
    kpiPassed.textContent = '0';
    kpiFailed.textContent = '0';
    kpiPassRate.textContent = '0.0%';
    kpiAverageMarks.textContent = '0.0%';

    courseReportTableBody.innerHTML = `
      <tr>
        <td colspan="12">
          <div class="erp-empty-state">
            <div class="erp-empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
            </div>
            <h3 class="erp-empty-title">No Results Available</h3>
            <p class="erp-empty-desc">No student results recorded for this course.</p>
          </div>
        </td>
      </tr>
    `;

    btnExportCourseCsv.disabled = true;
  }

  // 9. EVENT LISTENERS
  btnGenerateReport?.addEventListener('click', generateCourseReport);
  btnResetCourseReport?.addEventListener('click', resetCourseReportView);

  // Export CSV
  btnExportCourseCsv?.addEventListener('click', () => {
    if (!filteredStudents || filteredStudents.length === 0) {
      showToast('No course results available to export.', 'info');
      return;
    }

    const courseCode = currentCourse?.course_code || 'course';

    const headers = ['Rank', 'Student Name', 'PRN', 'Email', 'Assessment Type', 'Internal Marks', 'External Marks', 'Practical Marks', 'Total Marks', 'Max Marks', 'Percentage', 'Letter Grade', 'Grade Point', 'Status'];
    const rows = filteredStudents.map((s, index) => [
      index + 1,
      `"${s.student_name || ''}"`,
      `"${s.prn_number || ''}"`,
      `"${s.student_email || ''}"`,
      `"${s.assessment_type}"`,
      s.assessment_type === 'Theory' ? Number(s.internal_marks || 0).toFixed(1) : '-',
      s.assessment_type === 'Theory' ? Number(s.external_marks || 0).toFixed(1) : '-',
      s.assessment_type === 'Practical' ? Number(s.practical_marks || 0).toFixed(1) : '-',
      Number(s.total_marks || 0).toFixed(1),
      Number(s.max_marks || 100).toFixed(0),
      Number(s.percentage || 0).toFixed(2),
      `"${s.letter_grade}"`,
      s.grade_point,
      `"${s.status}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Course_Report_${courseCode}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Course report exported successfully.', 'success');
  });

})();
