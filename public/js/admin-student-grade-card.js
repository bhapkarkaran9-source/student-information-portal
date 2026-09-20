/**
 * Student Grade Card - Admin Controller
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
  let allStudents = [];
  let currentStudentData = null;
  let currentGrades = [];
  let currentMetrics = null;

  // DOM ELEMENTS
  const selectStudent = document.getElementById('selectStudent');
  const selectSemester = document.getElementById('selectSemester');
  const selectAcademicYear = document.getElementById('selectAcademicYear');
  const btnResetFilter = document.getElementById('btnResetFilter');
  const btnPrintGradeCard = document.getElementById('btnPrintGradeCard');
  const btnExportCsv = document.getElementById('btnExportCsv');

  const studentInfoCard = document.getElementById('studentInfoCard');
  const studentAvatar = document.getElementById('studentAvatar');
  const studentName = document.getElementById('studentName');
  const studentPrn = document.getElementById('studentPrn');
  const studentDepartment = document.getElementById('studentDepartment');
  const studentAcademicYear = document.getElementById('studentAcademicYear');
  const studentSemester = document.getElementById('studentSemester');
  const studentClassDivision = document.getElementById('studentClassDivision');
  const studentEmail = document.getElementById('studentEmail');
  const studentOverallStatus = document.getElementById('studentOverallStatus');

  const kpiSgpa = document.getElementById('kpiSgpa');
  const kpiTotalCredits = document.getElementById('kpiTotalCredits');
  const kpiTotalCourses = document.getElementById('kpiTotalCourses');
  const kpiPassedCourses = document.getElementById('kpiPassedCourses');
  const kpiFailedCourses = document.getElementById('kpiFailedCourses');

  const gradeCardTableBody = document.getElementById('gradeCardTableBody');
  const resultsCountBadge = document.getElementById('resultsCountBadge');

  const sgpaSummaryCard = document.getElementById('sgpaSummaryCard');
  const summarySgpa = document.getElementById('summarySgpa');
  const summaryTotalCredits = document.getElementById('summaryTotalCredits');
  const summaryCreditPoints = document.getElementById('summaryCreditPoints');
  const summaryResultStatus = document.getElementById('summaryResultStatus');

  // INITIAL SETUP & LOAD
  document.addEventListener('DOMContentLoaded', async () => {
    initHeaderAndSidebar();
    await loadStudentsList();

    // Check for query parameters (?student_id=XX&semester=YY)
    const urlParams = new URLSearchParams(window.location.search);
    const preselectedStudentId = urlParams.get('student_id');
    const preselectedSemester = urlParams.get('semester');

    if (preselectedSemester && selectSemester) {
      selectSemester.value = preselectedSemester;
    }

    if (preselectedStudentId && selectStudent) {
      selectStudent.value = preselectedStudentId;
      await loadStudentGradeCard();
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

  // 2. LOAD REGISTERED STUDENTS
  async function loadStudentsList() {
    try {
      const res = await apiFetch('/api/students?limit=100');
      if (res && res.ok) {
        const data = await res.json();
        allStudents = data.data?.students || [];

        selectStudent.innerHTML = `<option value="">-- Choose a Registered Student --</option>`;
        allStudents.forEach(s => {
          const name = `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student';
          const prn = s.prn_number || s.prn || 'No PRN';
          const dept = s.department_code ? ` (${s.department_code})` : '';
          const opt = document.createElement('option');
          opt.value = s.student_id;
          opt.textContent = `${prn} — ${name}${dept}`;
          selectStudent.appendChild(opt);
        });
      }
    } catch (err) {
      console.error('Error fetching students:', err);
      showToast('Error loading student roster.', 'error');
    }
  }

  // 3. LOAD STUDENT GRADE CARD
  async function loadStudentGradeCard() {
    const studentId = selectStudent.value;
    const semester = selectSemester.value;

    if (!studentId) {
      resetGradeCardView();
      return;
    }

    // Loading State
    gradeCardTableBody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center py-4">
          <div class="spinner"></div>
          <p style="margin-top: 8px; color: #64748b; font-size: 13.5px;">Loading examination records and computing SGPA...</p>
        </td>
      </tr>
    `;

    try {
      const queryParams = new URLSearchParams();
      if (semester) queryParams.append('semester', semester);

      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      const res = await apiFetch(`/api/grades/student/${studentId}${queryString}`);

      if (!res || !res.ok) {
        renderNoRecordsState();
        return;
      }

      const responseData = await res.json();
      currentStudentData = responseData.data?.student || null;
      currentGrades = responseData.data?.grades || [];
      currentMetrics = responseData.data?.metrics || {};

      // Optional Academic Year Filter (Client-side if selected)
      const selectedYear = selectAcademicYear.value;
      let filteredGrades = currentGrades;
      if (selectedYear) {
        filteredGrades = filteredGrades.filter(g => (g.course_academic_year || g.academic_year) === selectedYear);
      }

      if (filteredGrades.length === 0) {
        renderNoRecordsState();
        renderStudentProfile(currentStudentData);
        return;
      }

      renderStudentProfile(currentStudentData);
      renderKpis(currentMetrics, filteredGrades);
      renderTable(filteredGrades);
      renderSgpaSummary(currentMetrics, filteredGrades);

      btnPrintGradeCard.disabled = false;
      btnExportCsv.disabled = false;
    } catch (err) {
      console.error('Error loading grade card:', err);
      showToast('Failed to load grade card results.', 'error');
      renderNoRecordsState();
    }
  }

  // 4. RENDER STUDENT PROFILE
  function renderStudentProfile(student) {
    if (!student) {
      studentInfoCard.classList.add('hidden');
      return;
    }

    studentInfoCard.classList.remove('hidden');

    const fullName = student.student_name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student';
    studentAvatar.textContent = getInitials(fullName);
    studentName.textContent = fullName;
    studentPrn.textContent = student.prn_number || student.prn || 'PRN Not Assigned';
    studentDepartment.textContent = student.department_name || student.department_code || 'General';
    studentAcademicYear.textContent = student.academic_year || '2024-2025';
    studentSemester.textContent = student.semester ? `Semester ${student.semester}` : 'Semester 1';
    
    const className = student.class_name || 'BE';
    const division = student.division ? ` (Div ${student.division})` : '';
    studentClassDivision.textContent = `${className}${division}`;
    studentEmail.textContent = student.email || student.student_email || '--';
    studentOverallStatus.innerHTML = `<span class="badge-status-pass" style="font-size: 12px;">Active Student</span>`;
  }

  // 5. RENDER KPIS
  function renderKpis(metrics, grades) {
    if (!metrics || grades.length === 0) {
      kpiSgpa.textContent = '--';
      kpiTotalCredits.textContent = '--';
      kpiTotalCourses.textContent = '--';
      kpiPassedCourses.textContent = '--';
      kpiFailedCourses.textContent = '--';
      return;
    }

    const sgpaVal = (metrics.sgpa !== undefined && metrics.sgpa !== null) 
      ? Number(metrics.sgpa).toFixed(2) 
      : '0.00';

    kpiSgpa.textContent = sgpaVal;
    kpiTotalCredits.textContent = (metrics.total_credits !== undefined) ? Number(metrics.total_credits).toFixed(1) : '0.0';
    kpiTotalCourses.textContent = metrics.total_courses || grades.length;
    kpiPassedCourses.textContent = metrics.passed_courses !== undefined ? metrics.passed_courses : grades.filter(g => g.status === 'Pass').length;
    kpiFailedCourses.textContent = metrics.failed_courses !== undefined ? metrics.failed_courses : grades.filter(g => g.status === 'Fail').length;
  }

  // 6. RENDER TABLE
  function renderTable(grades) {
    resultsCountBadge.textContent = `${grades.length} Records`;

    if (grades.length === 0) {
      renderNoRecordsState();
      return;
    }

    gradeCardTableBody.innerHTML = grades.map(g => {
      const credits = parseFloat(g.credits) || 0.0;
      const intMarks = g.assessment_type === 'Theory' ? Number(g.internal_marks || 0).toFixed(1) : '-';
      const extMarks = g.assessment_type === 'Theory' ? Number(g.external_marks || 0).toFixed(1) : '-';
      const pracMarks = g.assessment_type === 'Practical' ? Number(g.practical_marks || 0).toFixed(1) : '-';
      const totalMarks = Number(g.total_marks || 0).toFixed(1);
      const maxMarks = Number(g.max_marks || 100).toFixed(0);

      const typeBadge = g.assessment_type === 'Theory'
        ? `<span class="badge" style="background-color: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe; font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 4px;">Theory</span>`
        : `<span class="badge" style="background-color: #fdf4ff; color: #9333ea; border: 1px solid #f0abfc; font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 4px;">Practical</span>`;

      return `
        <tr>
          <td><strong>${escapeHtml(g.course_code)}</strong></td>
          <td>${escapeHtml(g.course_name)}</td>
          <td><strong>${credits.toFixed(1)}</strong></td>
          <td>${typeBadge}</td>
          <td>${intMarks}</td>
          <td>${extMarks}</td>
          <td>${pracMarks}</td>
          <td><strong>${totalMarks} / ${maxMarks}</strong></td>
          <td>${getGradeBadge(g.letter_grade)}</td>
          <td><strong>${g.grade_point}</strong></td>
          <td>${getStatusBadge(g.status)}</td>
        </tr>
      `;
    }).join('');
  }

  // 7. RENDER SGPA SUMMARY CARD
  function renderSgpaSummary(metrics, grades) {
    if (!metrics || grades.length === 0) {
      sgpaSummaryCard.classList.add('hidden');
      return;
    }

    sgpaSummaryCard.classList.remove('hidden');

    const sgpaVal = (metrics.sgpa !== undefined && metrics.sgpa !== null) 
      ? Number(metrics.sgpa).toFixed(2) 
      : '0.00';

    // Calculate total credit points
    let totalCreditPoints = 0.0;
    grades.forEach(g => {
      const cr = parseFloat(g.credits) || 0.0;
      totalCreditPoints += cr * (Number(g.grade_point) || 0);
    });

    summarySgpa.textContent = sgpaVal;
    summaryTotalCredits.textContent = Number(metrics.total_credits || 0).toFixed(1);
    summaryCreditPoints.textContent = totalCreditPoints.toFixed(1);

    const hasBacklog = (metrics.failed_courses || 0) > 0 || grades.some(g => g.status === 'Fail');
    summaryResultStatus.innerHTML = hasBacklog
      ? `<span style="color: #f87171;">⚠ Backlog (${metrics.failed_courses || 1})</span>`
      : `<span style="color: #34d399;">✓ Semester Passed</span>`;
  }

  // 8. EMPTY STATES
  function resetGradeCardView() {
    studentInfoCard.classList.add('hidden');
    sgpaSummaryCard.classList.add('hidden');

    kpiSgpa.textContent = '--';
    kpiTotalCredits.textContent = '--';
    kpiTotalCourses.textContent = '--';
    kpiPassedCourses.textContent = '--';
    kpiFailedCourses.textContent = '--';

    resultsCountBadge.textContent = '0 Records';

    gradeCardTableBody.innerHTML = `
      <tr>
        <td colspan="11">
          <div class="erp-empty-state">
            <div class="erp-empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <h3 class="erp-empty-title">Select a Student</h3>
            <p class="erp-empty-desc">Choose a registered student from the dropdown above to view their academic grade card and semester transcript.</p>
          </div>
        </td>
      </tr>
    `;

    btnPrintGradeCard.disabled = true;
    btnExportCsv.disabled = true;
  }

  function renderNoRecordsState() {
    resultsCountBadge.textContent = '0 Records';
    sgpaSummaryCard.classList.add('hidden');

    kpiSgpa.textContent = '--';
    kpiTotalCredits.textContent = '--';
    kpiTotalCourses.textContent = '--';
    kpiPassedCourses.textContent = '--';
    kpiFailedCourses.textContent = '--';

    gradeCardTableBody.innerHTML = `
      <tr>
        <td colspan="11">
          <div class="erp-empty-state">
            <div class="erp-empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
            </div>
            <h3 class="erp-empty-title">No Grade Records Found</h3>
            <p class="erp-empty-desc">Grade results will appear here once examination results are recorded.</p>
          </div>
        </td>
      </tr>
    `;

    btnPrintGradeCard.disabled = true;
    btnExportCsv.disabled = true;
  }

  // 9. EVENT LISTENERS
  selectStudent?.addEventListener('change', loadStudentGradeCard);
  selectSemester?.addEventListener('change', loadStudentGradeCard);
  selectAcademicYear?.addEventListener('change', loadStudentGradeCard);

  btnResetFilter?.addEventListener('click', () => {
    selectStudent.value = '';
    selectSemester.value = '';
    selectAcademicYear.value = '';
    resetGradeCardView();
  });

  // Print Grade Card
  btnPrintGradeCard?.addEventListener('click', () => {
    if (!currentStudentData) {
      showToast('Select a student first to print grade card.', 'info');
      return;
    }
    window.print();
  });

  // Export CSV
  btnExportCsv?.addEventListener('click', () => {
    if (!currentGrades || currentGrades.length === 0) {
      showToast('No grades data available to export.', 'info');
      return;
    }

    const prn = currentStudentData?.prn_number || 'student';
    const studentTitle = currentStudentData?.student_name || 'Student';

    const headers = ['Course Code', 'Course Name', 'Credits', 'Assessment Type', 'Internal Marks', 'External Marks', 'Practical Marks', 'Total Marks', 'Max Marks', 'Percentage', 'Letter Grade', 'Grade Point', 'Status'];
    const rows = currentGrades.map(g => [
      `"${g.course_code}"`,
      `"${g.course_name}"`,
      parseFloat(g.credits || 0).toFixed(1),
      `"${g.assessment_type}"`,
      g.assessment_type === 'Theory' ? Number(g.internal_marks || 0).toFixed(1) : '-',
      g.assessment_type === 'Theory' ? Number(g.external_marks || 0).toFixed(1) : '-',
      g.assessment_type === 'Practical' ? Number(g.practical_marks || 0).toFixed(1) : '-',
      Number(g.total_marks || 0).toFixed(1),
      Number(g.max_marks || 100).toFixed(0),
      Number(g.percentage || 0).toFixed(2),
      `"${g.letter_grade}"`,
      g.grade_point,
      `"${g.status}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Grade_Card_${prn}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Grade card exported successfully.', 'success');
  });

})();
