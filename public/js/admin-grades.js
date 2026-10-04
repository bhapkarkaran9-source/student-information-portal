/**
 * Admin Grades / Results Management
 * Premium College ERP UI & Functionality
 * Handles real API interaction, live marks preview calculation, sticky ERP tables,
 * student grade cards, course performance reports, and CRUD operations.
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. AUTHENTICATION GUARD & API HELPER
  // ==========================================================================
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

  if (currentUser.role !== 'ADMIN') {
    window.location.replace('/login.html');
    return;
  }

  // Update header/sidebar admin info
  const headerAdminName = document.getElementById('headerAdminName');
  if (headerAdminName) {
    headerAdminName.textContent = currentUser.first_name 
      ? `${currentUser.first_name} ${currentUser.last_name || ''}`.trim() 
      : currentUser.username || 'System Admin';
  }

  const headerAdminAvatar = document.getElementById('headerAdminAvatar');
  const sidebarAdminAvatar = document.getElementById('sidebarAdminAvatar');
  const initial = (currentUser.first_name || currentUser.username || 'A')[0].toUpperCase();
  const fullName = currentUser.first_name ? `${currentUser.first_name} ${currentUser.last_name || ''}`.trim() : currentUser.username || 'System Admin';
  if (headerAdminAvatar) {
    if (typeof window.renderAvatarElement === 'function') {
      window.renderAvatarElement(headerAdminAvatar, currentUser.profile_photo_url, initial, fullName + ' avatar');
    } else {
      headerAdminAvatar.textContent = initial;
    }
  }
  if (sidebarAdminAvatar) {
    if (typeof window.renderAvatarElement === 'function') {
      window.renderAvatarElement(sidebarAdminAvatar, currentUser.profile_photo_url, initial, fullName + ' avatar');
    } else {
      sidebarAdminAvatar.textContent = initial;
    }
  }

  // API Request Helper
  async function apiFetch(endpoint, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    try {
      const res = await fetch(endpoint, config);
      if (res.status === 401) {
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace('/login.html');
        return null;
      }
      return res;
    } catch (err) {
      console.error('API Fetch Error:', err);
      return null;
    }
  }

  // Toast Notification Helper
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content" style="flex: 1;">${message}</div>
      <button type="button" class="toast-close" aria-label="Close">&times;</button>
    `;

    container.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.transition = 'opacity 300ms ease, transform 300ms ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
      }
    }, 4500);
  }

  // ==========================================================================
  // 2. STATE MANAGEMENT & REFERENCE DATA
  // ==========================================================================
  let currentPage = 1;
  const pageLimit = 10;
  let totalGrades = 0;
  let currentLoadedGrades = [];
  let searchDebounceTimeout = null;

  let allStudents = [];
  let allCourses = [];
  let allTeachers = [];
  let allDepartments = [];

  let currentDeleteGradeId = null;

  // Official Scale Badges
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

  // Client-side Grading Calculator for live modal preview
  function calculateGradeClient(percentage) {
    const pct = Math.round(Number(percentage) * 100) / 100;
    if (pct >= 90.0) return { letter_grade: 'O', grade_point: 10, status: 'Pass' };
    if (pct >= 80.0) return { letter_grade: 'A+', grade_point: 9, status: 'Pass' };
    if (pct >= 70.0) return { letter_grade: 'A', grade_point: 8, status: 'Pass' };
    if (pct >= 60.0) return { letter_grade: 'B+', grade_point: 7, status: 'Pass' };
    if (pct >= 50.0) return { letter_grade: 'B', grade_point: 6, status: 'Pass' };
    if (pct >= 45.0) return { letter_grade: 'C', grade_point: 5, status: 'Pass' };
    if (pct >= 40.0) return { letter_grade: 'P', grade_point: 4, status: 'Pass' };
    return { letter_grade: 'F', grade_point: 0, status: 'Fail' };
  }

  // ==========================================================================
  // 3. LOAD REFERENCE DATA
  // ==========================================================================
  async function loadReferenceData() {
    try {
      // 1. Departments
      const deptRes = await apiFetch('/api/departments?limit=100');
      if (deptRes && deptRes.ok) {
        const data = await deptRes.json();
        allDepartments = data.data?.departments || [];
        const filterDept = document.getElementById('filterDepartment');
        if (filterDept) {
          allDepartments.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.department_id;
            opt.textContent = `${d.department_code || d.department_name} - ${d.department_name}`;
            filterDept.appendChild(opt);
          });
        }
      }

      // 2. Courses
      const courseRes = await apiFetch('/api/courses?limit=100');
      if (courseRes && courseRes.ok) {
        const data = await courseRes.json();
        allCourses = data.data?.courses || [];
        
        const filterCourse = document.getElementById('filterCourse');
        const addCourse = document.getElementById('addCourseId');
        const reportCourse = document.getElementById('reportCourseSelect');

        allCourses.forEach(c => {
          if (filterCourse) {
            const opt = document.createElement('option');
            opt.value = c.course_id;
            opt.textContent = `${c.course_code} - ${c.course_name}`;
            filterCourse.appendChild(opt);
          }
          if (addCourse) {
            const opt = document.createElement('option');
            opt.value = c.course_id;
            opt.textContent = `${c.course_code} - ${c.course_name} (${c.credits} Credits, ${c.course_type})`;
            addCourse.appendChild(opt);
          }
          if (reportCourse) {
            const opt = document.createElement('option');
            opt.value = c.course_id;
            opt.textContent = `${c.course_code} - ${c.course_name}`;
            reportCourse.appendChild(opt);
          }
        });
      }

      // 3. Students
      const studentRes = await apiFetch('/api/students?limit=100');
      if (studentRes && studentRes.ok) {
        const data = await studentRes.json();
        allStudents = data.data?.students || [];

        const addStudent = document.getElementById('addStudentId');
        const reportStudent = document.getElementById('reportStudentSelect');

        allStudents.forEach(s => {
          const studentName = s.student_name || `${s.first_name || ''} ${s.last_name || ''}`.trim();
          const prn = s.prn_number || s.enrollment_number || 'N/A';
          if (addStudent) {
            const opt = document.createElement('option');
            opt.value = s.student_id;
            opt.textContent = `${studentName} (PRN: ${prn})`;
            addStudent.appendChild(opt);
          }
          if (reportStudent) {
            const opt = document.createElement('option');
            opt.value = s.student_id;
            opt.textContent = `${studentName} (PRN: ${prn})`;
            reportStudent.appendChild(opt);
          }
        });
      }

      // 4. Teachers
      const teacherRes = await apiFetch('/api/teachers?limit=100');
      if (teacherRes && teacherRes.ok) {
        const data = await teacherRes.json();
        allTeachers = data.data?.teachers || [];

        const addTeacher = document.getElementById('addTeacherId');
        const editTeacher = document.getElementById('editTeacherId');

        allTeachers.forEach(t => {
          const tName = t.teacher_name || `${t.first_name || ''} ${t.last_name || ''}`.trim();
          const emp = t.employee_number || 'N/A';
          if (addTeacher) {
            const opt = document.createElement('option');
            opt.value = t.teacher_id;
            opt.textContent = `${tName} (${emp})`;
            addTeacher.appendChild(opt);
          }
          if (editTeacher) {
            const opt = document.createElement('option');
            opt.value = t.teacher_id;
            opt.textContent = `${tName} (${emp})`;
            editTeacher.appendChild(opt);
          }
        });
      }
    } catch (err) {
      console.error('Error loading reference dropdowns:', err);
    }
  }

  // Helper to dynamically filter courses for a selected student in Add Modal
  async function filterCoursesForStudent(studentId) {
    const addCourseSelect = document.getElementById('addCourseId');
    if (!addCourseSelect) return;

    if (!studentId) {
      // Reset to all courses
      addCourseSelect.innerHTML = '<option value="">Select Course</option>';
      allCourses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.course_id;
        opt.textContent = `${c.course_code} - ${c.course_name} (${c.credits} Credits, ${c.course_type})`;
        addCourseSelect.appendChild(opt);
      });
      return;
    }

    try {
      const res = await apiFetch(`/api/enrollments?student_id=${studentId}&status=Enrolled&all=true`);
      if (res && res.ok) {
        const data = await res.json();
        const enrollments = data.data?.enrollments || [];
        if (enrollments.length > 0) {
          addCourseSelect.innerHTML = '<option value="">Select Enrolled Course</option>';
          const enrolledCourseIds = new Set(enrollments.map(e => e.course_id));
          
          enrollments.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.course_id;
            opt.textContent = `★ ${e.course_code} - ${e.course_name} (${e.credits} Credits)`;
            addCourseSelect.appendChild(opt);
          });

          // Also include remaining courses under secondary group
          const otherCourses = allCourses.filter(c => !enrolledCourseIds.has(c.course_id));
          if (otherCourses.length > 0) {
            const optGroup = document.createElement('optgroup');
            optGroup.label = 'Other Available Courses';
            otherCourses.forEach(c => {
              const opt = document.createElement('option');
              opt.value = c.course_id;
              opt.textContent = `${c.course_code} - ${c.course_name}`;
              optGroup.appendChild(opt);
            });
            addCourseSelect.appendChild(optGroup);
          }
          return;
        }
      }
    } catch (err) {
      console.error('Error fetching student enrollments:', err);
    }

    // Fallback if no specific enrollments returned
    addCourseSelect.innerHTML = '<option value="">Select Course</option>';
    allCourses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.course_id;
      opt.textContent = `${c.course_code} - ${c.course_name} (${c.credits} Credits, ${c.course_type})`;
      addCourseSelect.appendChild(opt);
    });
  }

  // ==========================================================================
  // 4. LOAD KPI STATS & ACADEMIC PERFORMANCE OVERVIEW
  // ==========================================================================
  async function loadGradeStats() {
    try {
      const res = await apiFetch('/api/grades/stats');
      if (!res || !res.ok) return;

      const data = await res.json();
      const stats = data.data?.stats || {};

      const totalResults = stats.total_results || 0;
      const passedCount = stats.passed_count || 0;
      const failedCount = stats.failed_count || 0;
      const passRate = stats.pass_rate !== undefined ? parseFloat(stats.pass_rate) : 0.0;
      const averageMarks = stats.average_marks !== undefined ? parseFloat(stats.average_marks) : 0.0;

      // Update 4 KPI Cards
      document.getElementById('kpiTotalResults').textContent = totalResults;
      document.getElementById('kpiPassedCount').textContent = passedCount;
      document.getElementById('kpiFailedCount').textContent = failedCount;
      document.getElementById('kpiAverageMarks').textContent = `${averageMarks.toFixed(1)}%`;

      const kpiPassRate = document.getElementById('kpiPassRate');
      if (kpiPassRate) {
        kpiPassRate.textContent = `${passRate.toFixed(1)}% Pass Rate`;
      }

      // Update Academic Performance Overview: Circular Progress Gauge
      const circleEl = document.getElementById('overviewCircleProgress');
      const avgMarksText = document.getElementById('overviewAvgMarksText');
      if (circleEl && avgMarksText) {
        avgMarksText.textContent = `${averageMarks.toFixed(1)}%`;
        const radius = 58;
        const circumference = 2 * Math.PI * radius; // ~364.42
        const clampedPct = Math.min(100, Math.max(0, averageMarks));
        const offset = circumference - (clampedPct / 100) * circumference;
        circleEl.style.strokeDashoffset = offset;
      }

      // Update Academic Performance Overview: 6-Metric Stat Grid
      document.getElementById('overviewPassed').textContent = passedCount;
      document.getElementById('overviewFailed').textContent = failedCount;
      document.getElementById('overviewPassRate').textContent = `${passRate.toFixed(1)}%`;

      // Update Highest Grade, Average GP, SGPA
      const highestGradeEl = document.getElementById('overviewHighestGrade');
      const avgGpEl = document.getElementById('overviewAverageGp');
      const sgpaEl = document.getElementById('overviewSgpa');

      if (totalResults === 0) {
        if (highestGradeEl) highestGradeEl.textContent = '--';
        if (avgGpEl) avgGpEl.textContent = '--';
        if (sgpaEl) sgpaEl.textContent = '--';
        document.getElementById('insightAverageGp').textContent = '--';
      } else {
        // Derive Highest Grade and Average GP from currently loaded records if available
        if (currentLoadedGrades && currentLoadedGrades.length > 0) {
          const gradeOrder = ['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F'];
          let bestGrade = 'F';
          let sumGp = 0;
          currentLoadedGrades.forEach(g => {
            sumGp += (g.grade_point || 0);
            if (gradeOrder.indexOf(g.letter_grade) !== -1 && gradeOrder.indexOf(g.letter_grade) < gradeOrder.indexOf(bestGrade)) {
              bestGrade = g.letter_grade;
            }
          });
          const avgGp = (sumGp / currentLoadedGrades.length).toFixed(1);

          if (highestGradeEl) highestGradeEl.textContent = bestGrade;
          if (avgGpEl) avgGpEl.textContent = avgGp;
          document.getElementById('insightAverageGp').textContent = avgGp;
        }

        // Fetch overall student SGPA if any evaluations exist
        try {
          if (allStudents.length > 0) {
            const firstStudentId = allStudents[0].student_id;
            const summaryRes = await apiFetch(`/api/grades/student/${firstStudentId}`);
            if (summaryRes && summaryRes.ok) {
              const summaryData = await summaryRes.json();
              const sgpa = summaryData.data?.metrics?.sgpa;
              if (sgpaEl) {
                sgpaEl.textContent = (sgpa !== undefined && sgpa !== null) ? Number(sgpa).toFixed(2) : '--';
              }
            }
          }
        } catch (e) {
          if (sgpaEl) sgpaEl.textContent = '--';
        }
      }

      // Update Result Insights card
      document.getElementById('insightPassRate').textContent = `${passRate.toFixed(1)}%`;
      document.getElementById('insightAverageMarks').textContent = `${averageMarks.toFixed(1)}%`;
      document.getElementById('insightBacklogCount').textContent = failedCount;

    } catch (err) {
      console.error('Error fetching grade stats:', err);
    }
  }

  // ==========================================================================
  // 5. LOAD & RENDER GRADES TABLE
  // ==========================================================================
  async function loadGrades() {
    const tableBody = document.getElementById('gradesTableBody');
    const emptyState = document.getElementById('gradesEmptyState');
    const tableEl = document.getElementById('gradesTable');
    if (!tableBody) return;

    tableBody.innerHTML = `
      <tr>
        <td colspan="13" class="text-center py-4">
          <div class="loading-state">
            <div class="spinner"></div>
            <p style="margin-top: 8px; color: #64748b;">Loading examination results...</p>
          </div>
        </td>
      </tr>
    `;

    try {
      const search = document.getElementById('filterSearch')?.value.trim() || '';
      const department_id = document.getElementById('filterDepartment')?.value || '';
      const course_id = document.getElementById('filterCourse')?.value || '';
      const semester = document.getElementById('filterSemester')?.value || '';
      const assessment_type = document.getElementById('filterType')?.value || '';
      const result_status = document.getElementById('filterStatus')?.value || '';

      const query = new URLSearchParams({
        page: currentPage,
        limit: pageLimit,
        search,
        department_id,
        course_id,
        semester,
        assessment_type,
        result_status
      });

      const res = await apiFetch(`/api/grades?${query.toString()}`);
      if (!res || !res.ok) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="13" class="text-center py-4" style="color: #ef4444;">
              Failed to load examination records. Please refresh the page.
            </td>
          </tr>
        `;
        return;
      }

      const resData = await res.json();
      const grades = resData.data?.grades || [];
      const pagination = resData.data?.pagination || {};
      totalGrades = pagination.total || 0;
      currentLoadedGrades = grades;

      const tableCount = document.getElementById('gradesTableCount');
      if (tableCount) {
        tableCount.textContent = `Examination Results (${totalGrades})`;
      }

      if (grades.length === 0) {
        tableBody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        renderPagination({ page: 1, limit: pageLimit, total: 0, totalPages: 0 });
      } else {
        if (emptyState) emptyState.classList.add('hidden');
        renderGradesTable(grades);
        renderPagination(pagination);
      }

      loadGradeStats();
    } catch (err) {
      console.error('Error loading grades:', err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="13" class="text-center py-4" style="color: #ef4444;">
            An unexpected error occurred while loading grades.
          </td>
        </tr>
      `;
    }
  }

  function renderGradesTable(grades) {
    const tableBody = document.getElementById('gradesTableBody');
    const mobileContainer = document.getElementById('gradesMobileCards');
    if (!tableBody) return;

    let tableHtml = '';
    let mobileHtml = '';

    grades.forEach(g => {
      const studentName = g.student_name || `${g.student_first_name || ''} ${g.student_last_name || ''}`.trim() || 'Student';
      const prn = g.prn_number || g.enrollment_number || '-';
      const initials = studentName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'ST';
      
      const courseCode = g.course_code || '-';
      const courseName = g.course_name || '-';
      const credits = g.credits !== null && g.credits !== undefined ? parseFloat(g.credits).toFixed(1) : '-';

      const typeBadge = g.assessment_type === 'Theory'
        ? `<span class="badge-type-theory"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg> Theory</span>`
        : `<span class="badge-type-practical"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2v7.31L4.89 17.5A2 2 0 0 0 6.64 20.5h10.72a2 2 0 0 0 1.75-3l-5.11-8.19V2"></path><path d="M8.5 2h7"></path><path d="M7 16h10"></path></svg> Practical</span>`;

      const intMarks = g.assessment_type === 'Theory' ? g.internal_marks.toFixed(1) : '-';
      const extMarks = g.assessment_type === 'Theory' ? g.external_marks.toFixed(1) : '-';
      const pracMarks = g.assessment_type === 'Practical' ? g.practical_marks.toFixed(1) : '-';
      const totalDisplay = `${g.total_marks.toFixed(1)} / ${g.max_marks.toFixed(0)}`;
      const gradeBadge = getGradeBadge(g.letter_grade);
      const statusBadge = getStatusBadge(g.status);

      // Desktop table row
      tableHtml += `
        <tr>
          <td>
            <div class="grades-student-cell">
              <div class="grades-avatar">${initials}</div>
              <div>
                <div class="grades-student-name">${studentName}</div>
                <div class="grades-student-prn-sub">PRN: ${prn}</div>
              </div>
            </div>
          </td>
          <td><code>${prn}</code></td>
          <td>
            <div class="grades-course-code">${courseCode}</div>
            <div class="grades-course-name">${courseName}</div>
          </td>
          <td><strong>${credits}</strong></td>
          <td>${typeBadge}</td>
          <td>${intMarks}</td>
          <td>${extMarks}</td>
          <td>${pracMarks}</td>
          <td><strong>${totalDisplay}</strong></td>
          <td>${gradeBadge}</td>
          <td><strong>${g.grade_point}</strong></td>
          <td>${statusBadge}</td>
          <td>
            <div class="grades-action-group">
              <button type="button" class="btn-row-action btn-view-grade" data-id="${g.grade_id}" title="View Grade Card" aria-label="View Result">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button type="button" class="btn-row-action btn-edit-grade" data-id="${g.grade_id}" title="Edit Result" aria-label="Edit Result">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button type="button" class="btn-row-action btn-row-action-delete btn-delete-grade" data-id="${g.grade_id}" data-name="${studentName} - ${courseCode}" title="Delete Result" aria-label="Delete Result">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;

      // Mobile Card HTML
      mobileHtml += `
        <div class="grades-mobile-card">
          <div class="grades-mobile-card-header">
            <div class="grades-mobile-student-name">${studentName}</div>
            <div class="grades-mobile-prn">PRN: ${prn}</div>
          </div>
          <div class="grades-mobile-course">
            <div class="grades-mobile-course-code">${courseCode}</div>
            <div class="grades-mobile-course-name">${courseName}</div>
          </div>
          <div class="grades-mobile-badges">
            ${typeBadge}
            ${gradeBadge}
            ${statusBadge}
          </div>
          <div class="grades-mobile-grid">
            ${g.assessment_type === 'Theory' ? `
              <div class="grades-mobile-grid-item">
                <span class="grades-mobile-grid-label">Internal</span>
                <span class="grades-mobile-grid-val">${intMarks}</span>
              </div>
              <div class="grades-mobile-grid-item">
                <span class="grades-mobile-grid-label">External</span>
                <span class="grades-mobile-grid-val">${extMarks}</span>
              </div>
            ` : `
              <div class="grades-mobile-grid-item">
                <span class="grades-mobile-grid-label">Practical</span>
                <span class="grades-mobile-grid-val">${pracMarks}</span>
              </div>
              <div class="grades-mobile-grid-item">
                <span class="grades-mobile-grid-label">Total / Max</span>
                <span class="grades-mobile-grid-val">${totalDisplay}</span>
              </div>
            `}
            <div class="grades-mobile-grid-item">
              <span class="grades-mobile-grid-label">Credits</span>
              <span class="grades-mobile-grid-val">${credits}</span>
            </div>
            <div class="grades-mobile-grid-item">
              <span class="grades-mobile-grid-label">Grade Point</span>
              <span class="grades-mobile-grid-val">${g.grade_point}</span>
            </div>
          </div>
          <div class="grades-mobile-actions">
            <button type="button" class="btn-mobile-action btn-view-grade" data-id="${g.grade_id}" aria-label="View Result">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span>View</span>
            </button>
            <button type="button" class="btn-mobile-action btn-edit-grade" data-id="${g.grade_id}" aria-label="Edit Result">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span>Edit</span>
            </button>
            <button type="button" class="btn-mobile-action btn-mobile-action-danger btn-delete-grade" data-id="${g.grade_id}" data-name="${studentName} - ${courseCode}" aria-label="Delete Result">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete</span>
            </button>
          </div>
        </div>
      `;
    });

    tableBody.innerHTML = tableHtml;
    if (mobileContainer) mobileContainer.innerHTML = mobileHtml;

    // Attach Row / Mobile Action Handlers to entire table card scope
    const tableCard = document.querySelector('.grades-table-card');
    if (tableCard) {
      tableCard.querySelectorAll('.btn-view-grade').forEach(b => {
        b.onclick = () => openViewGradeModal(b.dataset.id);
      });
      tableCard.querySelectorAll('.btn-edit-grade').forEach(b => {
        b.onclick = () => openEditGradeModal(b.dataset.id);
      });
      tableCard.querySelectorAll('.btn-delete-grade').forEach(b => {
        b.onclick = () => openDeleteGradeModal(b.dataset.id, b.dataset.name);
      });
    }
  }

  function renderPagination(pagination) {
    const tableInfo = document.getElementById('tableInfo');
    const container = document.getElementById('pagination');
    if (!container || !tableInfo) return;

    const { page = 1, limit = 10, total = 0, totalPages = 1 } = pagination;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    tableInfo.textContent = `Showing ${start} to ${end} of ${total} results`;

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    html += `<button type="button" class="grades-btn-page ${page === 1 ? 'disabled' : ''}" data-page="${page - 1}" aria-label="Previous page">&laquo; Prev</button>`;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
        html += `<button type="button" class="grades-btn-page ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
      } else if (i === page - 3 || i === page + 3) {
        html += `<span style="padding: 0 4px; color: #94a3b8;">...</span>`;
      }
    }

    html += `<button type="button" class="grades-btn-page ${page === totalPages ? 'disabled' : ''}" data-page="${page + 1}" aria-label="Next page">Next &raquo;</button>`;
    container.innerHTML = html;

    container.querySelectorAll('.grades-btn-page:not(.disabled)').forEach(b => {
      b.addEventListener('click', () => {
        currentPage = parseInt(b.dataset.page, 10);
        loadGrades();
      });
    });
  }

  // ==========================================================================
  // 6. LIVE MARKS PREVIEW LOGIC
  // ==========================================================================
  function updateAddMarksPreview() {
    const type = document.getElementById('addAssessmentType').value;
    const maxMarks = parseFloat(document.getElementById('addMaxMarks').value) || 100.0;
    const intMarks = parseFloat(document.getElementById('addInternalMarks').value) || 0.0;
    const extMarks = parseFloat(document.getElementById('addExternalMarks').value) || 0.0;
    const pracMarks = parseFloat(document.getElementById('addPracticalMarks').value) || 0.0;

    let total = 0.0;
    if (type === 'Theory') {
      total = intMarks + extMarks;
    } else {
      total = pracMarks;
    }

    const pct = maxMarks > 0 ? (total / maxMarks) * 100 : 0.0;
    const { letter_grade, grade_point, status } = calculateGradeClient(pct);

    document.getElementById('previewTotalMarks').textContent = total.toFixed(2);
    document.getElementById('previewPercentage').textContent = `${pct.toFixed(2)}%`;
    
    const gradeBadge = document.getElementById('previewGrade');
    gradeBadge.textContent = letter_grade;
    gradeBadge.className = `badge-grade badge-grade-${letter_grade.toLowerCase().replace('+', '-plus')}`;

    document.getElementById('previewGradePoint').textContent = grade_point;

    const statusBadge = document.getElementById('previewStatusBadge');
    statusBadge.innerHTML = status === 'Pass' 
      ? `<span class="badge-status-pass">✓ Pass</span>`
      : `<span class="badge-status-fail">⚠ Backlog</span>`;
  }

  function updateEditMarksPreview() {
    const type = document.getElementById('editAssessmentType').value;
    const maxMarks = parseFloat(document.getElementById('editMaxMarks').value) || 100.0;
    const intMarks = parseFloat(document.getElementById('editInternalMarks').value) || 0.0;
    const extMarks = parseFloat(document.getElementById('editExternalMarks').value) || 0.0;
    const pracMarks = parseFloat(document.getElementById('editPracticalMarks').value) || 0.0;

    let total = 0.0;
    if (type === 'Theory') {
      total = intMarks + extMarks;
    } else {
      total = pracMarks;
    }

    const pct = maxMarks > 0 ? (total / maxMarks) * 100 : 0.0;
    const { letter_grade, grade_point, status } = calculateGradeClient(pct);

    document.getElementById('editPreviewTotalMarks').textContent = total.toFixed(2);
    document.getElementById('editPreviewPercentage').textContent = `${pct.toFixed(2)}%`;

    const gradeBadge = document.getElementById('editPreviewGrade');
    gradeBadge.textContent = letter_grade;
    gradeBadge.className = `badge-grade badge-grade-${letter_grade.toLowerCase().replace('+', '-plus')}`;

    document.getElementById('editPreviewGradePoint').textContent = grade_point;

    const statusBadge = document.getElementById('editPreviewStatusBadge');
    statusBadge.innerHTML = status === 'Pass' 
      ? `<span class="badge-status-pass">✓ Pass</span>`
      : `<span class="badge-status-fail">⚠ Backlog</span>`;
  }

  // ==========================================================================
  // 7. MODAL CONTROLLERS (ADD, EDIT, VIEW, DELETE, REPORTS)
  // ==========================================================================
  function showModal(id) {
    // Close any other open modals first (ensure only 1 modal open at a time)
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.classList.add('hidden');
    });

    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  function hideModal(id) {
    if (id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    } else {
      document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.classList.add('hidden');
      });
    }

    // Restore body scroll if no modals are open
    const openModals = document.querySelectorAll('.modal-backdrop:not(.hidden)');
    if (openModals.length === 0) {
      document.body.style.overflow = '';
    }
  }

  // Dismiss buttons
  document.querySelectorAll('[data-dismiss="modal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-backdrop');
      if (modal) hideModal(modal.id);
    });
  });

  // Close active modal on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        hideModal(backdrop.id);
      }
    });
  });

  // Close active modal on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.modal-backdrop:not(.hidden)');
      if (activeModal) {
        hideModal(activeModal.id);
      }
    }
  });

  // ADD RESULT MODAL OPEN
  const btnAddGrade = document.getElementById('btnAddGrade');
  const btnEmptyAddGrade = document.getElementById('btnEmptyAddGrade');
  
  function openAddResultModal() {
    const form = document.getElementById('addGradeForm');
    if (form) form.reset();

    const errBox = document.getElementById('addFormError');
    if (errBox) errBox.classList.add('hidden');

    document.getElementById('addAssessmentType').value = 'Theory';
    document.getElementById('addTheoryInputsRow').classList.remove('hidden');
    document.getElementById('addPracticalInputsRow').classList.add('hidden');
    document.getElementById('addMaxMarks').value = 100;
    document.getElementById('addInternalMarks').value = 0;
    document.getElementById('addExternalMarks').value = 0;
    document.getElementById('addPracticalMarks').value = 0;
    document.getElementById('addExamSession').value = 'Winter 2026';

    filterCoursesForStudent(document.getElementById('addStudentId').value);
    updateAddMarksPreview();
    showModal('addGradeModal');
  }

  if (btnAddGrade) btnAddGrade.addEventListener('click', openAddResultModal);
  if (btnEmptyAddGrade) btnEmptyAddGrade.addEventListener('click', openAddResultModal);

  // Dynamic enrolled course filtering on student selection
  const addStudentSelect = document.getElementById('addStudentId');
  if (addStudentSelect) {
    addStudentSelect.addEventListener('change', () => {
      filterCoursesForStudent(addStudentSelect.value);
    });
  }

  // Switch Assessment Type in Add Modal
  const addCourseSelect = document.getElementById('addCourseId');
  if (addCourseSelect) {
    addCourseSelect.addEventListener('change', () => {
      const courseId = parseInt(addCourseSelect.value, 10);
      const selCourse = allCourses.find(c => c.course_id === courseId);
      if (selCourse && selCourse.course_type) {
        if (selCourse.course_type === 'Practical') {
          document.getElementById('addAssessmentType').value = 'Practical';
          document.getElementById('addTheoryInputsRow').classList.add('hidden');
          document.getElementById('addPracticalInputsRow').classList.remove('hidden');
          document.getElementById('addInternalMarks').value = 0;
          document.getElementById('addExternalMarks').value = 0;
        } else {
          document.getElementById('addAssessmentType').value = 'Theory';
          document.getElementById('addTheoryInputsRow').classList.remove('hidden');
          document.getElementById('addPracticalInputsRow').classList.add('hidden');
          document.getElementById('addPracticalMarks').value = 0;
        }
        updateAddMarksPreview();
      }
    });
  }

  const addTypeSelect = document.getElementById('addAssessmentType');
  if (addTypeSelect) {
    addTypeSelect.addEventListener('change', () => {
      if (addTypeSelect.value === 'Theory') {
        document.getElementById('addTheoryInputsRow').classList.remove('hidden');
        document.getElementById('addPracticalInputsRow').classList.add('hidden');
        document.getElementById('addPracticalMarks').value = 0;
      } else {
        document.getElementById('addTheoryInputsRow').classList.add('hidden');
        document.getElementById('addPracticalInputsRow').classList.remove('hidden');
        document.getElementById('addInternalMarks').value = 0;
        document.getElementById('addExternalMarks').value = 0;
      }
      updateAddMarksPreview();
    });
  }

  document.querySelectorAll('#addGradeModal .marks-calc-input, #addMaxMarks').forEach(inp => {
    inp.addEventListener('input', updateAddMarksPreview);
  });

  // SUBMIT ADD RESULT
  const addGradeForm = document.getElementById('addGradeForm');
  if (addGradeForm) {
    addGradeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('addFormError');
      if (errBox) errBox.classList.add('hidden');

      const student_id = document.getElementById('addStudentId').value;
      const course_id = document.getElementById('addCourseId').value;
      const assessment_type = document.getElementById('addAssessmentType').value;
      const exam_session = document.getElementById('addExamSession').value.trim();
      const max_marks = parseFloat(document.getElementById('addMaxMarks').value) || 100;
      const internal_marks = parseFloat(document.getElementById('addInternalMarks').value) || 0;
      const external_marks = parseFloat(document.getElementById('external_marks' in addGradeForm ? 'addExternalMarks' : 'addExternalMarks').value) || 0;
      const practical_marks = parseFloat(document.getElementById('addPracticalMarks').value) || 0;
      const teacher_id = document.getElementById('addTeacherId').value || null;
      const remarks = document.getElementById('addRemarks').value.trim() || null;

      // Validation
      if (!student_id || !course_id || !assessment_type || !exam_session) {
        if (errBox) {
          errBox.textContent = 'Please select a Student, Course, Assessment Type, and Exam Session.';
          errBox.classList.remove('hidden');
        }
        showToast('Please fill in all required fields.', 'error');
        return;
      }

      if (internal_marks < 0 || external_marks < 0 || practical_marks < 0) {
        if (errBox) {
          errBox.textContent = 'Marks cannot be negative.';
          errBox.classList.remove('hidden');
        }
        return;
      }

      let totalCalc = assessment_type === 'Theory' ? (internal_marks + external_marks) : practical_marks;
      if (totalCalc > max_marks) {
        if (errBox) {
          errBox.textContent = `Total marks (${totalCalc}) cannot exceed maximum marks (${max_marks}).`;
          errBox.classList.remove('hidden');
        }
        return;
      }

      const submitBtn = document.getElementById('btnSubmitAddGrade');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      try {
        const res = await apiFetch('/api/grades', {
          method: 'POST',
          body: JSON.stringify({
            student_id: parseInt(student_id, 10),
            course_id: parseInt(course_id, 10),
            teacher_id: teacher_id ? parseInt(teacher_id, 10) : null,
            assessment_type,
            internal_marks: assessment_type === 'Theory' ? internal_marks : 0,
            external_marks: assessment_type === 'Theory' ? external_marks : 0,
            practical_marks: assessment_type === 'Practical' ? practical_marks : 0,
            max_marks,
            exam_session,
            remarks
          })
        });

        if (!res) {
          showToast('Network error while saving result.', 'error');
          return;
        }

        const data = await res.json();
        if (res.status === 409) {
          const duplicateMsg = 'Result already exists for this student, course, exam session and assessment type.';
          if (errBox) {
            errBox.textContent = duplicateMsg;
            errBox.classList.remove('hidden');
          }
          showToast(duplicateMsg, 'error');
          return;
        }

        if (res.ok && data.success) {
          showToast('Examination result recorded successfully!', 'success');
          hideModal('addGradeModal');
          loadGrades();
        } else {
          const msg = data.message || 'Failed to save result.';
          if (errBox) {
            errBox.textContent = msg;
            errBox.classList.remove('hidden');
          }
          showToast(msg, 'error');
        }
      } catch (err) {
        console.error('Error recording grade:', err);
        showToast('An unexpected error occurred.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Result';
      }
    });
  }

  // EDIT RESULT MODAL
  async function openEditGradeModal(gradeId) {
    const errBox = document.getElementById('editFormError');
    if (errBox) errBox.classList.add('hidden');

    try {
      const res = await apiFetch(`/api/grades/${gradeId}`);
      if (!res || !res.ok) {
        showToast('Failed to fetch result details.', 'error');
        return;
      }

      const data = await res.json();
      const g = data.data?.grade;
      if (!g) return;

      document.getElementById('editGradeId').value = g.grade_id;
      document.getElementById('editStudentDisplay').value = `${g.student_name} (PRN: ${g.prn_number || g.enrollment_number || '-'})`;
      document.getElementById('editCourseDisplay').value = `${g.course_code} - ${g.course_name} (${g.credits} Credits)`;
      document.getElementById('editAssessmentType').value = g.assessment_type;
      document.getElementById('editExamSession').value = g.exam_session || '';
      document.getElementById('editMaxMarks').value = g.max_marks || 100;
      document.getElementById('editInternalMarks').value = g.internal_marks || 0;
      document.getElementById('editExternalMarks').value = g.external_marks || 0;
      document.getElementById('editPracticalMarks').value = g.practical_marks || 0;
      document.getElementById('editTeacherId').value = g.teacher_id || '';
      document.getElementById('editRemarks').value = g.remarks || '';

      if (g.assessment_type === 'Theory') {
        document.getElementById('editTheoryInputsRow').classList.remove('hidden');
        document.getElementById('editPracticalInputsRow').classList.add('hidden');
      } else {
        document.getElementById('editTheoryInputsRow').classList.add('hidden');
        document.getElementById('editPracticalInputsRow').classList.remove('hidden');
      }

      updateEditMarksPreview();
      showModal('editGradeModal');
    } catch (err) {
      console.error('Error opening edit grade modal:', err);
      showToast('Error opening edit modal.', 'error');
    }
  }

  const editTypeSelect = document.getElementById('editAssessmentType');
  if (editTypeSelect) {
    editTypeSelect.addEventListener('change', () => {
      if (editTypeSelect.value === 'Theory') {
        document.getElementById('editTheoryInputsRow').classList.remove('hidden');
        document.getElementById('editPracticalInputsRow').classList.add('hidden');
        document.getElementById('editPracticalMarks').value = 0;
      } else {
        document.getElementById('editTheoryInputsRow').classList.add('hidden');
        document.getElementById('editPracticalInputsRow').classList.remove('hidden');
        document.getElementById('editInternalMarks').value = 0;
        document.getElementById('editExternalMarks').value = 0;
      }
      updateEditMarksPreview();
    });
  }

  document.querySelectorAll('#editGradeModal .marks-calc-input, #editMaxMarks').forEach(inp => {
    inp.addEventListener('input', updateEditMarksPreview);
  });

  // SUBMIT EDIT RESULT
  const editGradeForm = document.getElementById('editGradeForm');
  if (editGradeForm) {
    editGradeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = document.getElementById('editFormError');
      if (errBox) errBox.classList.add('hidden');

      const id = document.getElementById('editGradeId').value;
      const assessment_type = document.getElementById('editAssessmentType').value;
      const exam_session = document.getElementById('editExamSession').value.trim();
      const max_marks = parseFloat(document.getElementById('editMaxMarks').value) || 100;
      const internal_marks = parseFloat(document.getElementById('editInternalMarks').value) || 0;
      const external_marks = parseFloat(document.getElementById('editExternalMarks').value) || 0;
      const practical_marks = parseFloat(document.getElementById('editPracticalMarks').value) || 0;
      const teacher_id = document.getElementById('editTeacherId').value || null;
      const remarks = document.getElementById('editRemarks').value.trim() || null;

      let totalCalc = assessment_type === 'Theory' ? (internal_marks + external_marks) : practical_marks;
      if (totalCalc > max_marks) {
        if (errBox) {
          errBox.textContent = `Total marks (${totalCalc}) cannot exceed maximum marks (${max_marks}).`;
          errBox.classList.remove('hidden');
        }
        return;
      }

      const submitBtn = document.getElementById('btnSubmitEditGrade');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Updating...';

      try {
        const res = await apiFetch(`/api/grades/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            teacher_id: teacher_id ? parseInt(teacher_id, 10) : null,
            assessment_type,
            internal_marks: assessment_type === 'Theory' ? internal_marks : 0,
            external_marks: assessment_type === 'Theory' ? external_marks : 0,
            practical_marks: assessment_type === 'Practical' ? practical_marks : 0,
            max_marks,
            exam_session,
            remarks
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          showToast('Result updated successfully.', 'success');
          hideModal('editGradeModal');
          loadGrades();
        } else {
          const msg = data.message || 'Failed to update result.';
          if (errBox) {
            errBox.textContent = msg;
            errBox.classList.remove('hidden');
          }
          showToast(msg, 'error');
        }
      } catch (err) {
        console.error('Error updating grade:', err);
        showToast('Network error while updating result.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Result';
      }
    });
  }

  // VIEW RESULT MODAL
  async function openViewGradeModal(gradeId) {
    try {
      const res = await apiFetch(`/api/grades/${gradeId}`);
      if (!res || !res.ok) {
        showToast('Failed to fetch result details.', 'error');
        return;
      }

      const data = await res.json();
      const g = data.data?.grade;
      if (!g) return;

      const initials = (g.student_name || 'ST').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      document.getElementById('viewAvatarText').textContent = initials;
      document.getElementById('viewStudentName').textContent = g.student_name;
      document.getElementById('viewStudentPrn').textContent = `PRN: ${g.prn_number || g.enrollment_number || '-'}`;
      document.getElementById('viewStudentClassSem').textContent = `Class: ${g.class_name || '-'} | Div: ${g.division || '-'} | Sem ${g.student_semester || '-'}`;

      document.getElementById('viewCourseCode').textContent = g.course_code;
      document.getElementById('viewCourseName').textContent = g.course_name;
      document.getElementById('viewCourseCredits').textContent = `${parseFloat(g.credits).toFixed(1)} Credits`;
      document.getElementById('viewDepartment').textContent = g.department_name || '-';
      document.getElementById('viewAssessmentType').textContent = g.assessment_type;
      document.getElementById('viewExamSession').textContent = g.exam_session;
      document.getElementById('viewEvaluator').textContent = g.teacher_name ? `${g.teacher_name} (${g.teacher_employee_number || ''})` : 'Unassigned';

      if (g.assessment_type === 'Theory') {
        document.getElementById('viewInternalRow').classList.remove('hidden');
        document.getElementById('viewExternalRow').classList.remove('hidden');
        document.getElementById('viewPracticalRow').classList.add('hidden');
        document.getElementById('viewInternalMarks').textContent = g.internal_marks.toFixed(1);
        document.getElementById('viewExternalMarks').textContent = g.external_marks.toFixed(1);
      } else {
        document.getElementById('viewInternalRow').classList.add('hidden');
        document.getElementById('viewExternalRow').classList.add('hidden');
        document.getElementById('viewPracticalRow').classList.remove('hidden');
        document.getElementById('viewPracticalMarks').textContent = g.practical_marks.toFixed(1);
      }

      document.getElementById('viewTotalMarks').textContent = g.total_marks.toFixed(1);
      document.getElementById('viewMaxMarks').textContent = g.max_marks.toFixed(1);
      document.getElementById('viewPercentage').textContent = `${g.percentage.toFixed(2)}%`;

      const gradeBadge = document.getElementById('viewLetterGrade');
      gradeBadge.textContent = g.letter_grade;
      gradeBadge.className = `badge-grade badge-grade-${g.letter_grade.toLowerCase().replace('+', '-plus')}`;

      document.getElementById('viewGradePoint').textContent = g.grade_point;

      const statusBadge = document.getElementById('viewStatusBadge');
      statusBadge.innerHTML = g.status === 'Pass' 
        ? `<span class="badge-status-pass">✓ Pass</span>`
        : `<span class="badge-status-fail">⚠ Backlog</span>`;

      document.getElementById('viewRemarks').textContent = g.remarks || 'None recorded';

      showModal('viewGradeModal');
    } catch (err) {
      console.error('Error opening view modal:', err);
      showToast('Error displaying result details.', 'error');
    }
  }

  // STUDENT GRADE CARD & SGPA REPORT
  const btnStudentReport = document.getElementById('btnStudentReport');
  if (btnStudentReport) {
    btnStudentReport.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('reportStudentSelect').value = '';
      document.getElementById('reportSemesterSelect').value = '';
      document.getElementById('studentSummaryBanner').classList.add('hidden');
      document.getElementById('studentTranscriptBody').innerHTML = `
        <tr><td colspan="13" class="text-center py-3 text-muted">Please select a student above.</td></tr>
      `;
      showModal('studentReportModal');
    });
  }

  async function loadStudentReport() {
    const studentId = document.getElementById('reportStudentSelect').value;
    const semester = document.getElementById('reportSemesterSelect').value;
    const tbody = document.getElementById('studentTranscriptBody');
    const banner = document.getElementById('studentSummaryBanner');

    if (!studentId) {
      banner.classList.add('hidden');
      tbody.innerHTML = `<tr><td colspan="13" class="text-center py-3 text-muted">Please select a student above.</td></tr>`;
      return;
    }

    tbody.innerHTML = `<tr><td colspan="13" class="text-center py-3"><div class="spinner"></div> Loading transcript...</td></tr>`;

    try {
      const query = semester ? `?semester=${semester}` : '';
      const res = await apiFetch(`/api/grades/student/${studentId}${query}`);
      if (!res || !res.ok) {
        tbody.innerHTML = `<tr><td colspan="13" class="text-center py-3 text-danger">Failed to load student transcript.</td></tr>`;
        return;
      }

      const data = await res.json();
      const grades = data.data?.grades || [];
      const metrics = data.data?.metrics || {};

      banner.classList.remove('hidden');
      document.getElementById('reportTotalCourses').textContent = metrics.total_courses || 0;
      document.getElementById('reportTotalCredits').textContent = (metrics.total_credits || 0.0).toFixed(1);
      document.getElementById('reportPassFail').textContent = `${metrics.passed_courses || 0} Pass / ${metrics.failed_courses || 0} Backlog`;
      document.getElementById('reportSgpa').textContent = (metrics.sgpa !== undefined && metrics.sgpa !== null) 
        ? Number(metrics.sgpa).toFixed(2) 
        : '0.00';

      if (grades.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" class="text-center py-3 text-muted">No examination results found for this student.</td></tr>`;
        return;
      }

      tbody.innerHTML = grades.map(g => {
        const credits = parseFloat(g.credits) || 0.0;
        const weightedPoints = (credits * g.grade_point).toFixed(1);
        const intMarks = g.assessment_type === 'Theory' ? g.internal_marks.toFixed(1) : '-';
        const extMarks = g.assessment_type === 'Theory' ? g.external_marks.toFixed(1) : '-';
        const pracMarks = g.assessment_type === 'Practical' ? g.practical_marks.toFixed(1) : '-';

        return `
          <tr>
            <td><strong>${g.course_code}</strong></td>
            <td>${g.course_name}</td>
            <td><strong>${credits.toFixed(1)}</strong></td>
            <td><span class="badge" style="font-size: 11px;">${g.assessment_type}</span></td>
            <td>${intMarks}</td>
            <td>${extMarks}</td>
            <td>${pracMarks}</td>
            <td><strong>${g.total_marks.toFixed(1)} / ${g.max_marks.toFixed(0)}</strong></td>
            <td>${g.percentage.toFixed(1)}%</td>
            <td>${getGradeBadge(g.letter_grade)}</td>
            <td><strong>${g.grade_point}</strong></td>
            <td><code>${weightedPoints}</code></td>
            <td>${getStatusBadge(g.status)}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Error loading student transcript:', err);
      tbody.innerHTML = `<tr><td colspan="13" class="text-center py-3 text-danger">Error loading transcript.</td></tr>`;
    }
  }

  document.getElementById('reportStudentSelect')?.addEventListener('change', loadStudentReport);
  document.getElementById('reportSemesterSelect')?.addEventListener('change', loadStudentReport);

  // COURSE PERFORMANCE REPORT
  const btnCourseReport = document.getElementById('btnCourseReport');
  if (btnCourseReport && btnCourseReport.tagName === 'BUTTON') {
    btnCourseReport.addEventListener('click', () => {
      document.getElementById('reportCourseSelect').value = '';
      document.getElementById('reportCourseSession').value = '';
      document.getElementById('courseSummaryBanner').classList.add('hidden');
      document.getElementById('courseStudentsBody').innerHTML = `
        <tr><td colspan="9" class="text-center py-3 text-muted">Please select a course above.</td></tr>
      `;
      showModal('courseReportModal');
    });
  }

  async function loadCourseReport() {
    const courseId = document.getElementById('reportCourseSelect').value;
    const session = document.getElementById('reportCourseSession').value;
    const tbody = document.getElementById('courseStudentsBody');
    const banner = document.getElementById('courseSummaryBanner');

    if (!courseId) {
      banner.classList.add('hidden');
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-3 text-muted">Please select a course above.</td></tr>`;
      return;
    }

    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-3"><div class="spinner"></div> Loading course results...</td></tr>`;

    try {
      const query = session ? `?exam_session=${encodeURIComponent(session.trim())}` : '';
      const res = await apiFetch(`/api/grades/course/${courseId}${query}`);
      if (!res || !res.ok) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-3 text-danger">Failed to load course results.</td></tr>`;
        return;
      }

      const data = await res.json();
      const stats = data.data?.stats || {};
      const students = data.data?.students || [];

      banner.classList.remove('hidden');
      document.getElementById('courseTotalEvaluated').textContent = stats.total_results || 0;
      document.getElementById('coursePassedCount').textContent = stats.passed_count || 0;
      document.getElementById('coursePassRate').textContent = `${(stats.pass_rate || 0.0).toFixed(1)}% Pass Rate`;
      document.getElementById('courseFailedCount').textContent = stats.failed_count || 0;
      document.getElementById('courseAveragePercentage').textContent = `${(stats.average_percentage || 0.0).toFixed(1)}%`;

      if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-3 text-muted">No students evaluated for this course yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = students.map(s => `
        <tr>
          <td><strong>${s.student_name}</strong><br><small class="text-muted">${s.student_email || ''}</small></td>
          <td><code>${s.prn_number || '-'}</code></td>
          <td>${s.class_name || '-'}${s.division ? ' (' + s.division + ')' : ''}</td>
          <td><span class="badge" style="font-size: 11px;">${s.assessment_type}</span></td>
          <td><strong>${s.total_marks.toFixed(1)} / ${s.max_marks.toFixed(0)}</strong></td>
          <td>${s.percentage.toFixed(1)}%</td>
          <td>${getGradeBadge(s.letter_grade)}</td>
          <td><strong>${s.grade_point}</strong></td>
          <td>${getStatusBadge(s.status)}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Error loading course performance report:', err);
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-3 text-danger">Error loading report.</td></tr>`;
    }
  }

  document.getElementById('reportCourseSelect')?.addEventListener('change', loadCourseReport);
  document.getElementById('reportCourseSession')?.addEventListener('input', () => {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(loadCourseReport, 400);
  });

  // DELETE RESULT MODAL
  function openDeleteGradeModal(gradeId, name) {
    currentDeleteGradeId = gradeId;
    const details = document.getElementById('deleteGradeDetails');
    if (details) {
      details.innerHTML = `<strong>Result:</strong> ${name || 'ID #' + gradeId}`;
    }
    showModal('deleteGradeModal');
  }

  const btnConfirmDeleteGrade = document.getElementById('btnConfirmDeleteGrade');
  if (btnConfirmDeleteGrade) {
    btnConfirmDeleteGrade.addEventListener('click', async () => {
      if (!currentDeleteGradeId) return;

      btnConfirmDeleteGrade.disabled = true;
      btnConfirmDeleteGrade.textContent = 'Deleting...';

      try {
        const res = await apiFetch(`/api/grades/${currentDeleteGradeId}`, {
          method: 'DELETE'
        });

        const data = await res.json();
        if (res.ok && data.success) {
          showToast('Examination result deleted successfully.', 'success');
          hideModal('deleteGradeModal');
          loadGrades();
        } else {
          showToast(data.message || 'Failed to delete result.', 'error');
        }
      } catch (err) {
        console.error('Error deleting grade:', err);
        showToast('Network error while deleting result.', 'error');
      } finally {
        btnConfirmDeleteGrade.disabled = false;
        btnConfirmDeleteGrade.textContent = 'Delete Result';
        currentDeleteGradeId = null;
      }
    });
  }

  // ==========================================================================
  // 8. EXPORT CSV & PRINT FUNCTIONALITY
  // ==========================================================================
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnExportCsvHeader = document.getElementById('btnExportCsvHeader');

  function triggerCsvExport() {
    if (!currentLoadedGrades || currentLoadedGrades.length === 0) {
      showToast('No grade records available to export.', 'info');
      return;
    }

    const headers = ['Student Name', 'PRN', 'Course Code', 'Course Name', 'Credits', 'Type', 'Internal', 'External', 'Practical', 'Total Marks', 'Max Marks', 'Percentage', 'Grade', 'Grade Point', 'Status', 'Exam Session'];
    const rows = currentLoadedGrades.map(g => [
      `"${g.student_name || ''}"`,
      `"${g.prn_number || ''}"`,
      `"${g.course_code || ''}"`,
      `"${g.course_name || ''}"`,
      g.credits,
      g.assessment_type,
      g.internal_marks,
      g.external_marks,
      g.practical_marks,
      g.total_marks,
      g.max_marks,
      g.percentage,
      g.letter_grade,
      g.grade_point,
      g.status,
      `"${g.exam_session || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `grades_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV export downloaded successfully.', 'success');
  }

  if (btnExportCsv) btnExportCsv.addEventListener('click', triggerCsvExport);
  if (btnExportCsvHeader) btnExportCsvHeader.addEventListener('click', triggerCsvExport);

  const btnPrintTable = document.getElementById('btnPrintTable');
  const btnPrintTableHeader = document.getElementById('btnPrintTableHeader');

  if (btnPrintTable) btnPrintTable.addEventListener('click', () => window.print());
  if (btnPrintTableHeader) btnPrintTableHeader.addEventListener('click', () => window.print());

  // ==========================================================================
  // 9. FILTER LISTENERS & CLEAR
  // ==========================================================================
  const filterSearch = document.getElementById('filterSearch');
  if (filterSearch) {
    filterSearch.addEventListener('input', () => {
      clearTimeout(searchDebounceTimeout);
      searchDebounceTimeout = setTimeout(() => {
        currentPage = 1;
        loadGrades();
      }, 350);
    });
  }

  const btnApplyFilters = document.getElementById('btnApplyFilters');
  if (btnApplyFilters) {
    btnApplyFilters.addEventListener('click', () => {
      currentPage = 1;
      loadGrades();
    });
  }

  ['filterDepartment', 'filterCourse', 'filterSemester', 'filterType', 'filterStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        currentPage = 1;
        loadGrades();
      });
    }
  });

  const btnClearFilters = document.getElementById('btnClearFilters');
  if (btnClearFilters) {
    btnClearFilters.addEventListener('click', () => {
      document.getElementById('filterSearch').value = '';
      document.getElementById('filterDepartment').value = '';
      document.getElementById('filterCourse').value = '';
      document.getElementById('filterSemester').value = '';
      document.getElementById('filterType').value = '';
      document.getElementById('filterStatus').value = '';
      currentPage = 1;
      loadGrades();
    });
  }

  // ==========================================================================
  // 10. MOBILE SIDEBAR TOGGLE
  // ==========================================================================
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
  const adminSidebar = document.getElementById('adminSidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  function openSidebar() {
    if (adminSidebar) adminSidebar.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('hidden');
  }

  function closeSidebar() {
    if (adminSidebar) adminSidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
  }

  if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', openSidebar);
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

  // ==========================================================================
  // 11. INITIALIZATION
  // ==========================================================================
  loadReferenceData();
  loadGrades();

})();
