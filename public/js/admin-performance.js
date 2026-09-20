/**
 * Admin Performance Analytics Controller
 * Student Information Portal
 */

// Global Chart instances for safe destruction and re-rendering
let gradeDistChartInstance = null;
let coursePerfChartInstance = null;
let deptPerfChartInstance = null;
let attVsPerfChartInstance = null;
let semPerfChartInstance = null;

// Pagination and Filter state
let currentPage = 1;
const PAGE_LIMIT = 10;
let searchDebounceTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce strict ADMIN authorization
  const currentUser = await requireAuth('ADMIN');
  if (!currentUser) return;

  // 2. Initialize Header, Sidebar, and Profile
  initAdminHeader(currentUser);
  initMobileSidebar();
  initProfileDropdown();

  // 3. Load Departments into Filter dropdown
  await loadFilterDepartments();

  // 4. Load Analytics Data & Charts
  await loadAllAnalytics();

  // 5. Setup Filter and Action listeners
  setupEventListeners();
});

/**
 * Populate dynamic user details across top header and dropdown
 */
function initAdminHeader(user) {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const initial = (user.first_name ? user.first_name[0] : (user.username ? user.username[0] : 'A')).toUpperCase();

  const headerName = document.getElementById('headerAdminName');
  const headerAvatar = document.getElementById('headerAdminAvatar');
  const dropdownName = document.getElementById('dropdownAdminName');
  const dropdownEmail = document.getElementById('dropdownAdminEmail');

  if (headerName) headerName.textContent = fullName;
  if (headerAvatar) {
    if (typeof window.renderAvatarElement === 'function') {
      window.renderAvatarElement(headerAvatar, user.profile_photo_url, initial, fullName + ' avatar');
    } else {
      headerAvatar.textContent = initial;
    }
  }
  if (dropdownName) dropdownName.textContent = fullName;
  if (dropdownEmail) dropdownEmail.textContent = user.email || 'admin@portal.local';
}

/**
 * Mobile Sidebar Drawer and Backdrop Controls
 */
function initMobileSidebar() {
  const sidebar = document.getElementById('adminSidebar');
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  const closeBtn = document.getElementById('sidebarCloseBtn');
  const backdrop = document.getElementById('sidebarBackdrop');

  if (!sidebar) return;

  const openSidebar = () => {
    sidebar.classList.add('open');
    if (backdrop) backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  };

  const closeSidebar = () => {
    sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.add('hidden');
    document.body.style.overflow = '';
  };

  if (toggleBtn) toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);
}

/**
 * User Profile Dropdown Controls
 */
function initProfileDropdown() {
  if (window.UserMenu) return; // UserMenu manages profile dropdown globally
  const trigger = document.getElementById('profileDropdownTrigger');
  const menu = document.getElementById('profileDropdownMenu');
  const logoutBtn = document.getElementById('dropdownLogoutBtn');

  if (trigger && menu) {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
      trigger.setAttribute('aria-expanded', !isExpanded);
      menu.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!trigger.contains(e.target) && !menu.contains(e.target)) {
        trigger.setAttribute('aria-expanded', 'false');
        menu.classList.remove('show');
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logout();
    });
  }
}

/**
 * Fetch and populate department options in filter select
 */
async function loadFilterDepartments() {
  try {
    const res = await apiRequest('/departments?limit=100');
    if (res.ok && res.data && res.data.success && Array.isArray(res.data.data.departments)) {
      const select = document.getElementById('filterDepartment');
      if (!select) return;
      res.data.data.departments.forEach(dept => {
        const opt = document.createElement('option');
        opt.value = dept.department_id;
        opt.textContent = `${dept.department_name} (${dept.department_code})`;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Failed to load departments for filter:', err);
  }
}

/**
 * Load all performance data: KPIs, 5 Charts, and Students Roster Table
 */
async function loadAllAnalytics() {
  await Promise.all([
    loadOverviewKPIs(),
    loadAtRiskCount(),
    renderGradeDistChart(),
    renderCoursePerfChart(),
    renderDeptPerfChart(),
    renderAttVsPerfChart(),
    renderSemPerfChart(),
    loadStudentsTable(currentPage)
  ]);
}

/**
 * 1. Overview KPIs
 */
async function loadOverviewKPIs() {
  try {
    const deptId = document.getElementById('filterDepartment')?.value || '';
    const sem = document.getElementById('filterSemester')?.value || '';
    let query = '';
    const params = [];
    if (deptId) params.push(`department_id=${encodeURIComponent(deptId)}`);
    if (sem) params.push(`semester=${encodeURIComponent(sem)}`);
    if (params.length > 0) query = `?${params.join('&')}`;

    const res = await apiRequest(`/performance/overview${query}`);
    if (res.ok && res.data && res.data.success) {
      const d = res.data.data;
      document.getElementById('statAverageMarks').textContent = `${d.average_percentage.toFixed(2)}%`;
      document.getElementById('statPassPercentage').textContent = `${d.pass_percentage.toFixed(2)}%`;
      document.getElementById('statPassRatio').textContent = `${d.passed_results} / ${d.total_results} evaluated passed`;
      document.getElementById('statAverageGP').textContent = d.average_grade_point.toFixed(2);
      document.getElementById('statOverallSGPA').textContent = d.overall_sgpa.toFixed(2);
      return;
    }
  } catch (err) {
    console.error('Failed to load overview KPIs:', err);
  }

  // Graceful zero-state fallback
  document.getElementById('statAverageMarks').textContent = '0.00%';
  document.getElementById('statPassPercentage').textContent = '0.00%';
  document.getElementById('statPassRatio').textContent = '0 / 0 evaluated passed';
  document.getElementById('statAverageGP').textContent = '0.00';
  document.getElementById('statOverallSGPA').textContent = '0.00';
}

/**
 * At-Risk Count KPI
 */
async function loadAtRiskCount() {
  try {
    const deptId = document.getElementById('filterDepartment')?.value || '';
    const sem = document.getElementById('filterSemester')?.value || '';
    let query = '';
    const params = [];
    if (deptId) params.push(`department_id=${encodeURIComponent(deptId)}`);
    if (sem) params.push(`semester=${encodeURIComponent(sem)}`);
    if (params.length > 0) query = `?${params.join('&')}`;

    const res = await apiRequest(`/performance/at-risk${query}`);
    if (res.ok && res.data && res.data.success && Array.isArray(res.data.data)) {
      const atRiskCount = res.data.data.length;
      document.getElementById('statAtRiskCount').textContent = atRiskCount;
      document.getElementById('statAtRiskSub').textContent = atRiskCount > 0
        ? `${atRiskCount} student(s) require intervention`
        : 'No students currently flagged';
      return;
    }
  } catch (err) {
    console.error('Failed to load at-risk count:', err);
  }

  document.getElementById('statAtRiskCount').textContent = '0';
  document.getElementById('statAtRiskSub').textContent = 'No students currently flagged';
}

/**
 * Chart 1: Grade Distribution
 */
async function renderGradeDistChart() {
  const canvas = document.getElementById('gradeDistCanvas');
  const empty = document.getElementById('gradeDistEmpty');
  if (!canvas) return;

  if (gradeDistChartInstance) {
    gradeDistChartInstance.destroy();
    gradeDistChartInstance = null;
  }

  try {
    const deptId = document.getElementById('filterDepartment')?.value || '';
    const sem = document.getElementById('filterSemester')?.value || '';
    let query = '';
    const params = [];
    if (deptId) params.push(`department_id=${encodeURIComponent(deptId)}`);
    if (sem) params.push(`semester=${encodeURIComponent(sem)}`);
    if (params.length > 0) query = `?${params.join('&')}`;

    const res = await apiRequest(`/performance/grade-distribution${query}`);
    if (res.ok && res.data && res.data.success && res.data.data) {
      const dist = res.data.data.distribution;
      const total = res.data.data.total_results || 0;

      if (total > 0 && window.Chart) {
        canvas.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');

        const labels = ['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F'];
        const counts = labels.map(l => dist[l]?.count || 0);

        gradeDistChartInstance = new Chart(canvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Results Count',
              data: counts,
              backgroundColor: [
                '#10b981', '#34d399', '#8b5cf6', '#60a5fa',
                '#f59e0b', '#fbbf24', '#f97316', '#ef4444'
              ],
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, ticks: { precision: 0 } }
            }
          }
        });
        return;
      }
    }
  } catch (err) {
    console.error('Failed to render grade dist chart:', err);
  }

  canvas.classList.add('hidden');
  if (empty) empty.classList.remove('hidden');
}

/**
 * Chart 2: Performance by Course
 */
async function renderCoursePerfChart() {
  const canvas = document.getElementById('coursePerfCanvas');
  const empty = document.getElementById('coursePerfEmpty');
  if (!canvas) return;

  if (coursePerfChartInstance) {
    coursePerfChartInstance.destroy();
    coursePerfChartInstance = null;
  }

  try {
    const res = await apiRequest('/courses?limit=10');
    if (res.ok && res.data && res.data.success && Array.isArray(res.data.data.courses) && res.data.data.courses.length > 0) {
      const courses = res.data.data.courses;
      const perfPromises = courses.map(c => apiRequest(`/performance/course/${c.course_id}`));
      const perfResults = await Promise.all(perfPromises);

      const validCourses = [];
      perfResults.forEach((r, idx) => {
        if (r.ok && r.data && r.data.success && r.data.data.statistics.total_results > 0) {
          validCourses.push({
            name: courses[idx].course_code,
            avg: r.data.data.statistics.average_percentage
          });
        }
      });

      if (validCourses.length > 0 && window.Chart) {
        canvas.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');

        coursePerfChartInstance = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: validCourses.map(c => c.name),
            datasets: [{
              label: 'Average %',
              data: validCourses.map(c => c.avg),
              backgroundColor: '#7c3aed',
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { beginAtZero: true, max: 100 }
            }
          }
        });
        return;
      }
    }
  } catch (err) {
    console.error('Failed to render course perf chart:', err);
  }

  canvas.classList.add('hidden');
  if (empty) empty.classList.remove('hidden');
}

/**
 * Chart 3: Performance by Department
 */
async function renderDeptPerfChart() {
  const canvas = document.getElementById('deptPerfCanvas');
  const empty = document.getElementById('deptPerfEmpty');
  if (!canvas) return;

  if (deptPerfChartInstance) {
    deptPerfChartInstance.destroy();
    deptPerfChartInstance = null;
  }

  try {
    const res = await apiRequest('/departments?limit=10');
    if (res.ok && res.data && res.data.success && Array.isArray(res.data.data.departments) && res.data.data.departments.length > 0) {
      const depts = res.data.data.departments;
      const perfPromises = depts.map(d => apiRequest(`/performance/department/${d.department_id}`));
      const perfResults = await Promise.all(perfPromises);

      const validDepts = [];
      perfResults.forEach((r, idx) => {
        if (r.ok && r.data && r.data.success && r.data.data.statistics.total_results > 0) {
          validDepts.push({
            name: depts[idx].department_code,
            passPct: r.data.data.statistics.pass_percentage,
            avgMarks: r.data.data.statistics.average_percentage
          });
        }
      });

      if (validDepts.length > 0 && window.Chart) {
        canvas.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');

        deptPerfChartInstance = new Chart(canvas, {
          type: 'bar',
          data: {
            labels: validDepts.map(d => d.name),
            datasets: [
              {
                label: 'Pass %',
                data: validDepts.map(d => d.passPct),
                backgroundColor: '#10b981',
                borderRadius: 4
              },
              {
                label: 'Average %',
                data: validDepts.map(d => d.avgMarks),
                backgroundColor: '#8b5cf6',
                borderRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { beginAtZero: true, max: 100 }
            }
          }
        });
        return;
      }
    }
  } catch (err) {
    console.error('Failed to render dept perf chart:', err);
  }

  canvas.classList.add('hidden');
  if (empty) empty.classList.remove('hidden');
}

/**
 * Chart 4: Attendance vs Performance
 */
async function renderAttVsPerfChart() {
  const canvas = document.getElementById('attVsPerfCanvas');
  const empty = document.getElementById('attVsPerfEmpty');
  if (!canvas) return;

  if (attVsPerfChartInstance) {
    attVsPerfChartInstance.destroy();
    attVsPerfChartInstance = null;
  }

  try {
    const res = await apiRequest('/performance/attendance-vs-performance');
    if (res.ok && res.data && res.data.success && Array.isArray(res.data.data)) {
      const paired = res.data.data.filter(item => item.attendance_percentage !== null && item.percentage !== null);

      if (paired.length > 0 && window.Chart) {
        canvas.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');

        attVsPerfChartInstance = new Chart(canvas, {
          type: 'scatter',
          data: {
            datasets: [{
              label: 'Student (Attendance % vs Marks %)',
              data: paired.map(p => ({ x: p.attendance_percentage, y: p.percentage })),
              backgroundColor: '#8b5cf6',
              pointRadius: 5
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { title: { display: true, text: 'Attendance %' }, min: 0, max: 100 },
              y: { title: { display: true, text: 'Marks %' }, min: 0, max: 100 }
            }
          }
        });
        return;
      }
    }
  } catch (err) {
    console.error('Failed to render attendance vs performance chart:', err);
  }

  canvas.classList.add('hidden');
  if (empty) empty.classList.remove('hidden');
}

/**
 * Chart 5: Semester Performance Trend
 */
async function renderSemPerfChart() {
  const canvas = document.getElementById('semPerfCanvas');
  const empty = document.getElementById('semPerfEmpty');
  if (!canvas) return;

  if (semPerfChartInstance) {
    semPerfChartInstance.destroy();
    semPerfChartInstance = null;
  }

  try {
    const semNumbers = [1, 2, 3, 4, 5, 6, 7, 8];
    const semPromises = semNumbers.map(sem => apiRequest(`/performance/semester?semester=${sem}`));
    const semResults = await Promise.all(semPromises);

    const validSemesters = [];
    semResults.forEach((r, idx) => {
      if (r.ok && r.data && r.data.success && r.data.data.statistics.total_results > 0) {
        validSemesters.push({
          sem: `Sem ${semNumbers[idx]}`,
          avg: r.data.data.statistics.average_percentage,
          passPct: r.data.data.statistics.pass_percentage
        });
      }
    });

    if (validSemesters.length > 0 && window.Chart) {
      canvas.classList.remove('hidden');
      if (empty) empty.classList.add('hidden');

      semPerfChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
          labels: validSemesters.map(s => s.sem),
          datasets: [
            {
              label: 'Average %',
              data: validSemesters.map(s => s.avg),
              borderColor: '#7c3aed',
              backgroundColor: 'rgba(37, 99, 235, 0.1)',
              tension: 0.3,
              fill: true
            },
            {
              label: 'Pass %',
              data: validSemesters.map(s => s.passPct),
              borderColor: '#10b981',
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, max: 100 }
          }
        }
      });
      return;
    }
  } catch (err) {
    console.error('Failed to render semester perf chart:', err);
  }

  canvas.classList.add('hidden');
  if (empty) empty.classList.remove('hidden');
}

/**
 * 2. Load Paginated Students Table
 */
async function loadStudentsTable(page = 1) {
  const loading = document.getElementById('tableLoading');
  const empty = document.getElementById('tableEmpty');
  const tbody = document.getElementById('studentsTableBody');

  if (loading) loading.classList.remove('hidden');
  if (empty) empty.classList.add('hidden');
  if (tbody) tbody.innerHTML = '';

  try {
    const search = document.getElementById('filterSearch')?.value || '';
    const deptId = document.getElementById('filterDepartment')?.value || '';
    const sem = document.getElementById('filterSemester')?.value || '';
    const riskStatus = document.getElementById('filterRiskStatus')?.value || '';

    const params = [`page=${page}`, `limit=${PAGE_LIMIT}`];
    if (search.trim()) params.push(`search=${encodeURIComponent(search.trim())}`);
    if (deptId) params.push(`department_id=${encodeURIComponent(deptId)}`);
    if (sem) params.push(`semester=${encodeURIComponent(sem)}`);
    if (riskStatus) params.push(`risk_status=${encodeURIComponent(riskStatus)}`);

    const res = await apiRequest(`/performance/students?${params.join('&')}`);

    if (loading) loading.classList.add('hidden');

    if (res.ok && res.data && res.data.success && res.data.data) {
      const { students, pagination } = res.data.data;
      currentPage = pagination.page;

      if (!students || students.length === 0) {
        if (empty) empty.classList.remove('hidden');
        renderPaginationControls(0, 1, 1);
        return;
      }

      renderStudentsTableRows(students);
      renderPaginationControls(pagination.total, pagination.page, pagination.totalPages);
      return;
    }
  } catch (err) {
    console.error('Failed to load students table:', err);
    if (loading) loading.classList.add('hidden');
  }

  if (empty) empty.classList.remove('hidden');
  renderPaginationControls(0, 1, 1);
}

/**
 * Render Student Table Rows
 */
function renderStudentsTableRows(students) {
  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;

  tbody.innerHTML = students.map(s => {
    // Risk badge styling
    let riskBadgeClass = 'badge-good';
    let riskBadgeStyle = 'background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0;';
    if (s.risk_status === 'At Risk') {
      riskBadgeClass = 'badge-danger';
      riskBadgeStyle = 'background: #fff1f2; color: #9f1239; border: 1px solid #fecdd3;';
    } else if (s.risk_status === 'Needs Attention') {
      riskBadgeClass = 'badge-warning';
      riskBadgeStyle = 'background: #fffbeb; color: #92400e; border: 1px solid #fde68a;';
    }

    const attText = s.attendance_percentage !== null ? `${s.attendance_percentage.toFixed(1)}%` : 'No records';
    const attStyle = s.is_low_attendance ? 'color: #dc2626; font-weight: 600;' : 'color: #334155;';

    const sgpaText = s.total_results > 0 ? s.sgpa.toFixed(2) : '-';
    const avgPctText = s.total_results > 0 ? `${s.average_percentage.toFixed(1)}%` : '-';
    const failedText = s.failed_courses > 0 ? `<span style="color: #dc2626; font-weight: 600;">${s.failed_courses}</span>` : '0';

    return `
      <tr style="border-bottom: 1px solid #f1f5f9; font-size: 0.9rem;">
        <td style="padding: 12px 10px; font-weight: 600; color: #64748b;">${s.rank !== '-' ? '#' + s.rank : '-'}</td>
        <td style="padding: 12px 10px;">
          <div style="font-weight: 600; color: #1e293b;">${escapeHtml(s.student_name)}</div>
          <div style="font-size: 0.75rem; color: #64748b;">${escapeHtml(s.email || '')}</div>
        </td>
        <td style="padding: 12px 10px; font-family: monospace; font-size: 0.85rem; color: #475569;">${escapeHtml(s.prn_number)}</td>
        <td style="padding: 12px 10px; color: #334155;">${escapeHtml(s.department_name || '-')}</td>
        <td style="padding: 12px 10px; color: #334155;">Sem ${s.semester}</td>
        <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">${avgPctText}</td>
        <td style="padding: 12px 10px; font-weight: 600; color: #4338ca;">${sgpaText}</td>
        <td style="padding: 12px 10px;">${failedText}</td>
        <td style="padding: 12px 10px; ${attStyle}">${attText}</td>
        <td style="padding: 12px 10px;">
          <span class="badge ${riskBadgeClass}" style="${riskBadgeStyle} font-size: 0.75rem; padding: 3px 8px; border-radius: 9999px;">
            ${s.risk_status}
          </span>
        </td>
        <td style="padding: 12px 10px; text-align: right;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="openStudentModal(${s.student_id})" style="font-size: 0.75rem; padding: 4px 8px;">
            View Details
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Render Pagination Controls
 */
function renderPaginationControls(total, page, totalPages) {
  const info = document.getElementById('paginationInfo');
  const controls = document.getElementById('paginationControls');

  if (info) {
    if (total === 0) {
      info.textContent = 'Showing 0 to 0 of 0 students';
    } else {
      const start = (page - 1) * PAGE_LIMIT + 1;
      const end = Math.min(page * PAGE_LIMIT, total);
      info.textContent = `Showing ${start} to ${end} of ${total} students`;
    }
  }

  if (controls) {
    if (totalPages <= 1) {
      controls.innerHTML = '';
      return;
    }

    let btns = '';
    btns += `<button type="button" class="btn btn-secondary btn-sm" ${page === 1 ? 'disabled' : ''} onclick="loadStudentsTable(${page - 1})">Prev</button>`;

    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
        btns += `<button type="button" class="btn ${p === page ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="loadStudentsTable(${p})">${p}</button>`;
      } else if (p === page - 2 || p === page + 2) {
        btns += `<span style="padding: 4px 6px; color: #64748b;">...</span>`;
      }
    }

    btns += `<button type="button" class="btn btn-secondary btn-sm" ${page === totalPages ? 'disabled' : ''} onclick="loadStudentsTable(${page + 1})">Next</button>`;
    controls.innerHTML = btns;
  }
}

/**
 * 3. Student Performance Detail Modal
 */
window.openStudentModal = async function(studentId) {
  const modal = document.getElementById('studentDetailModal');
  if (!modal) return;

  try {
    const res = await apiRequest(`/performance/student/${studentId}`);
    if (res.ok && res.data && res.data.success && res.data.data) {
      const d = res.data.data;
      const info = d.student_information;
      const sum = d.academic_summary;
      const att = d.attendance_summary;

      document.getElementById('modalStudentName').textContent = info.student_name;
      document.getElementById('modalStudentPRN').textContent = info.prn_number;
      document.getElementById('modalStudentDept').textContent = info.department_name ? `${info.department_name} (${info.department_code})` : '-';
      document.getElementById('modalStudentClass').textContent = `Sem ${info.semester} - ${info.class_name || 'N/A'} (Div ${info.division || 'N/A'})`;

      document.getElementById('modalAvgPct').textContent = `${sum.average_percentage.toFixed(2)}%`;
      document.getElementById('modalSGPA').textContent = sum.sgpa.toFixed(2);
      document.getElementById('modalPassed').textContent = sum.passed_courses;
      document.getElementById('modalFailed').textContent = sum.failed_courses;
      document.getElementById('modalCredits').textContent = sum.total_credits.toFixed(1);
      document.getElementById('modalAttendance').textContent = `${att.attendance_percentage.toFixed(1)}%`;

      // Risk standing banner
      const banner = document.getElementById('modalRiskBanner');
      const badge = document.getElementById('modalRiskBadge');
      const text = document.getElementById('modalRiskText');

      badge.textContent = sum.risk_status;
      if (sum.risk_status === 'At Risk') {
        banner.style.background = '#fff1f2';
        banner.style.border = '1px solid #fecdd3';
        badge.style.background = '#e11d48';
        badge.style.color = '#ffffff';
        text.textContent = sum.risk_reasons.join('; ') || 'At risk of academic failure or attendance debarment.';
      } else if (sum.risk_status === 'Needs Attention') {
        banner.style.background = '#fffbeb';
        banner.style.border = '1px solid #fde68a';
        badge.style.background = '#f59e0b';
        badge.style.color = '#ffffff';
        text.textContent = sum.risk_reasons.join('; ') || 'Requires monitoring to prevent falling at-risk.';
      } else {
        banner.style.background = '#f0fdf4';
        banner.style.border = '1px solid #bbf7d0';
        badge.style.background = '#10b981';
        badge.style.color = '#ffffff';
        text.textContent = 'All academic and attendance criteria met.';
      }

      // Populate courses table
      const tbody = document.getElementById('modalCoursesTableBody');
      if (tbody) {
        if (!d.courses || d.courses.length === 0) {
          tbody.innerHTML = `<tr><td colspan="9" style="padding: 24px; text-align: center; color: #64748b;">No evaluated courses recorded yet.</td></tr>`;
        } else {
          tbody.innerHTML = d.courses.map(c => {
            const isPass = c.status === 'Pass';
            const statusBadge = isPass
              ? '<span style="background: #ecfdf5; color: #065f46; padding: 2px 6px; border-radius: 4px; font-weight: 600;">Pass</span>'
              : '<span style="background: #fff1f2; color: #9f1239; padding: 2px 6px; border-radius: 4px; font-weight: 600;">Fail</span>';

            const attText = c.course_attendance_percentage !== null ? `${c.course_attendance_percentage.toFixed(1)}%` : '-';

            return `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px;">
                  <div style="font-weight: 600; color: #1e293b;">${escapeHtml(c.course_name)}</div>
                  <div style="font-size: 0.75rem; color: #64748b;">${escapeHtml(c.course_code)}</div>
                </td>
                <td style="padding: 10px; color: #475569;">${escapeHtml(c.assessment_type || c.course_type)}</td>
                <td style="padding: 10px; color: #475569;">${c.credits.toFixed(1)}</td>
                <td style="padding: 10px; color: #1e293b;">${c.total_marks.toFixed(1)} / ${c.max_marks.toFixed(0)}</td>
                <td style="padding: 10px; font-weight: 600; color: #1e293b;">${c.percentage.toFixed(1)}%</td>
                <td style="padding: 10px; font-weight: 700; color: ${isPass ? '#059669' : '#dc2626'};">${escapeHtml(c.letter_grade)}</td>
                <td style="padding: 10px; font-weight: 600; color: #4338ca;">${c.grade_point}</td>
                <td style="padding: 10px; color: #475569;">${attText}</td>
                <td style="padding: 10px;">${statusBadge}</td>
              </tr>
            `;
          }).join('');
        }
      }

      modal.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Failed to open student detail modal:', err);
    if (window.showToast) showToast('Failed to load student performance details', 'error');
  }
};

window.closeStudentModal = function() {
  const modal = document.getElementById('studentDetailModal');
  if (modal) modal.classList.add('hidden');
};

/**
 * 4. Course Performance Detail Modal
 */
window.openCourseModal = async function(courseId) {
  const modal = document.getElementById('courseDetailModal');
  if (!modal) return;

  try {
    const res = await apiRequest(`/performance/course/${courseId}`);
    if (res.ok && res.data && res.data.success && res.data.data) {
      const d = res.data.data;
      const c = d.course;
      const s = d.statistics;
      const dist = d.grade_distribution;

      document.getElementById('modalCourseTitle').textContent = `${c.course_name} (${c.course_code})`;
      document.getElementById('modalCourseDept').textContent = c.department_name ? `${c.department_name} (${c.department_code})` : '-';
      document.getElementById('modalCourseCredits').textContent = `${c.credits.toFixed(1)} Credits / ${c.course_type}`;
      document.getElementById('modalCourseSemester').textContent = `Sem ${c.semester} (${c.academic_year})`;

      document.getElementById('modalCourseEvaluated').textContent = s.total_students_evaluated;
      document.getElementById('modalCoursePassPct').textContent = `${s.pass_percentage.toFixed(1)}%`;
      document.getElementById('modalCourseAvgMarks').textContent = s.average_marks.toFixed(1);
      document.getElementById('modalCourseAvgGP').textContent = s.average_grade_point.toFixed(2);

      // Grade distribution pills
      const distContainer = document.getElementById('modalCourseGradeDist');
      if (distContainer) {
        distContainer.innerHTML = ['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F'].map(g => {
          const count = dist[g]?.count || 0;
          const pct = dist[g]?.percentage || 0;
          return `
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; font-size: 0.8rem; text-align: center; min-width: 60px;">
              <span style="font-weight: 700; color: #1e293b;">${g}</span>
              <div style="font-size: 0.85rem; font-weight: 600; color: #7c3aed;">${count}</div>
              <div style="font-size: 0.7rem; color: #64748b;">${pct.toFixed(0)}%</div>
            </div>
          `;
        }).join('');
      }

      // Student roster body
      const tbody = document.getElementById('modalCourseStudentsBody');
      if (tbody) {
        if (!d.students || d.students.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" style="padding: 20px; text-align: center; color: #64748b;">No students evaluated for this course yet.</td></tr>`;
        } else {
          tbody.innerHTML = d.students.map(item => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px; font-weight: 600; color: #1e293b;">${escapeHtml(item.student_name)}</td>
              <td style="padding: 10px; font-family: monospace; color: #475569;">${escapeHtml(item.prn_number)}</td>
              <td style="padding: 10px; color: #1e293b;">${item.total_marks.toFixed(1)} / ${item.max_marks.toFixed(0)}</td>
              <td style="padding: 10px; font-weight: 600; color: #1e293b;">${item.percentage.toFixed(1)}%</td>
              <td style="padding: 10px; font-weight: 700; color: ${item.status === 'Pass' ? '#059669' : '#dc2626'};">${escapeHtml(item.letter_grade)}</td>
              <td style="padding: 10px; font-weight: 600; color: #4338ca;">${item.grade_point}</td>
              <td style="padding: 10px;">
                <span style="background: ${item.status === 'Pass' ? '#ecfdf5' : '#fff1f2'}; color: ${item.status === 'Pass' ? '#065f46' : '#9f1239'}; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                  ${item.status}
                </span>
              </td>
            </tr>
          `).join('');
        }
      }

      modal.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Failed to open course modal:', err);
    if (window.showToast) showToast('Failed to load course performance details', 'error');
  }
};

window.closeCourseModal = function() {
  const modal = document.getElementById('courseDetailModal');
  if (modal) modal.classList.add('hidden');
};

/**
 * Event Listeners Setup
 */
function setupEventListeners() {
  // Search input debounced
  const searchInput = document.getElementById('filterSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        currentPage = 1;
        loadStudentsTable(1);
      }, 300);
    });
  }

  // Filter dropdown listeners
  const filterDept = document.getElementById('filterDepartment');
  const filterSem = document.getElementById('filterSemester');
  const filterRisk = document.getElementById('filterRiskStatus');

  if (filterDept) {
    filterDept.addEventListener('change', () => {
      currentPage = 1;
      loadAllAnalytics();
    });
  }

  if (filterSem) {
    filterSem.addEventListener('change', () => {
      currentPage = 1;
      loadAllAnalytics();
    });
  }

  if (filterRisk) {
    filterRisk.addEventListener('change', () => {
      currentPage = 1;
      loadStudentsTable(1);
    });
  }

  // Reset Filters Button
  const resetBtn = document.getElementById('resetFiltersBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (filterDept) filterDept.value = '';
      if (filterSem) filterSem.value = '';
      if (filterRisk) filterRisk.value = '';
      currentPage = 1;
      loadAllAnalytics();
    });
  }

  // Refresh Analytics Button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      await loadAllAnalytics();
      if (window.showToast) showToast('Performance analytics refreshed', 'success');
    });
  }
}

/**
 * Safe HTML escaping
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
