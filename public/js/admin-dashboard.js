/**
 * Admin Dashboard Controller
 * Student Information Portal - College ERP Modern Redesign
 */

let performanceChartInstance = null;
let attendanceChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce strict ADMIN authorization
  const currentUser = await requireAuth('ADMIN');
  if (!currentUser) return; // requireAuth handles redirection if unauthorized

  // 2. Initialize UI components
  initAdminProfile(currentUser);
  initMobileSidebar();
  initProfileDropdown();

  // 3. Load Dashboard Data (with real database APIs and graceful empty-state handling)
  loadDashboardStats();
  initPerformanceChart();
  initAttendanceChart();
  loadLowAttendance();
  loadRecentActivities();
  loadUpcomingCalendarEvents();
});

/**
 * Populate dynamic user details across Header, Sidebar, Welcome banner and Dropdown
 */
function initAdminProfile(user) {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'System Admin';
  const initial = (user.first_name ? user.first_name[0] : (user.username ? user.username[0] : 'S')).toUpperCase();

  // Welcome Banner dynamic name and live date
  const welcomeName = document.getElementById('welcomeAdminName');
  if (welcomeName) welcomeName.textContent = fullName;

  const welcomeDate = document.getElementById('welcomeCurrentDate');
  if (welcomeDate) {
    const now = new Date();
    welcomeDate.textContent = now.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  // Header Elements
  const headerName = document.getElementById('headerAdminName');
  const headerAvatar = document.getElementById('headerAdminAvatar');
  if (headerName) headerName.textContent = fullName;
  if (headerAvatar) {
    if (typeof window.renderAvatarElement === 'function') {
      window.renderAvatarElement(headerAvatar, user.profile_photo_url, initial, fullName + ' avatar');
    } else if (user.profile_photo_url) {
      headerAvatar.innerHTML = `<img src="${user.profile_photo_url}" alt="${fullName}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" onerror="this.onerror=null;this.parentElement.textContent='${initial}'">`;
    } else {
      headerAvatar.textContent = initial;
    }
  }

  // Sidebar Elements
  const sidebarName = document.getElementById('sidebarAdminName');
  const sidebarAvatar = document.getElementById('sidebarAdminAvatar');
  const sidebarEmail = document.getElementById('sidebarAdminEmail');
  if (sidebarName) sidebarName.textContent = fullName;
  if (sidebarAvatar) {
    if (typeof window.renderAvatarElement === 'function') {
      window.renderAvatarElement(sidebarAvatar, user.profile_photo_url, initial, fullName + ' avatar');
    } else if (user.profile_photo_url) {
      sidebarAvatar.innerHTML = `<img src="${user.profile_photo_url}" alt="${fullName}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" onerror="this.onerror=null;this.parentElement.textContent='${initial}'">`;
    } else {
      sidebarAvatar.textContent = initial;
    }
  }
  if (sidebarEmail) sidebarEmail.textContent = user.email || 'admin@portal.local';

  // Dropdown Header Elements
  const dropdownName = document.getElementById('dropdownAdminName');
  const dropdownEmail = document.getElementById('dropdownAdminEmail');
  if (dropdownName) dropdownName.textContent = fullName;
  if (dropdownEmail) dropdownEmail.textContent = user.email || 'admin@portal.local';

  // Profile Modal / View Bindings
  const profileFullName = document.getElementById('modalProfileFullName');
  const profileUsername = document.getElementById('modalProfileUsername');
  const profileEmail = document.getElementById('modalProfileEmail');
  const profilePhone = document.getElementById('modalProfilePhone');
  const profileRole = document.getElementById('modalProfileRole');
  const profileCreated = document.getElementById('modalProfileCreated');

  if (profileFullName) profileFullName.textContent = fullName;
  if (profileUsername) profileUsername.textContent = user.username;
  if (profileEmail) profileEmail.textContent = user.email || 'N/A';
  if (profilePhone) profilePhone.textContent = user.phone || 'N/A';
  if (profileRole) profileRole.textContent = user.role;
  if (profileCreated && typeof formatDate === 'function') {
    profileCreated.textContent = formatDate(user.created_at);
  }
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

  function openSidebar() {
    sidebar.classList.add('open');
    if (backdrop) backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.add('hidden');
    document.body.style.overflow = '';
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar.classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeSidebar);
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeSidebar);
  }

  // Close when any sidebar navigation link is tapped on mobile
  sidebar.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        closeSidebar();
      }
    });
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebar();
    }
  });
}

/**
 * Profile Dropdown Menu in Top Header
 */
function initProfileDropdown() {
  if (window.UserMenu) return; // UserMenu manages profile dropdown globally
  const triggerBtn = document.getElementById('profileDropdownTrigger');
  const dropdownMenu = document.getElementById('profileDropdownMenu');
  const dropdownLogoutBtn = document.getElementById('dropdownLogoutBtn');
  const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');

  if (!triggerBtn || !dropdownMenu) return;

  function toggleDropdown(e) {
    e.stopPropagation();
    const isOpen = dropdownMenu.classList.contains('show');
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  function openDropdown() {
    dropdownMenu.classList.add('show');
    triggerBtn.setAttribute('aria-expanded', 'true');
  }

  function closeDropdown() {
    dropdownMenu.classList.remove('show');
    triggerBtn.setAttribute('aria-expanded', 'false');
  }

  triggerBtn.addEventListener('click', toggleDropdown);

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdownMenu.contains(e.target) && !triggerBtn.contains(e.target)) {
      closeDropdown();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  // Attach logout handlers
  if (dropdownLogoutBtn) {
    dropdownLogoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

  if (sidebarLogoutBtn) {
    sidebarLogoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }
}

/**
 * Load 6 Dashboard Summary Cards
 * Fetches actual counts from real database API endpoints with zero fake data.
 */
async function loadDashboardStats() {
  try {
    const [studentsRes, teachersRes, coursesRes, deptsRes, enrollmentsRes, attSummaryRes] = await Promise.all([
      apiRequest('/students'),
      apiRequest('/teachers'),
      apiRequest('/courses'),
      apiRequest('/departments'),
      apiRequest('/enrollments'),
      apiRequest('/attendance/summary')
    ]);

    const totalStudents = studentsRes.data?.data?.pagination?.total ?? studentsRes.data?.data?.students?.length ?? 0;
    const totalTeachers = teachersRes.data?.data?.pagination?.total ?? teachersRes.data?.data?.teachers?.length ?? 0;
    const totalCourses = coursesRes.data?.data?.pagination?.total ?? coursesRes.data?.data?.courses?.length ?? 0;
    const totalDepartments = deptsRes.data?.data?.pagination?.total ?? deptsRes.data?.data?.departments?.length ?? 0;
    const totalEnrollments = enrollmentsRes.data?.data?.pagination?.total ?? enrollmentsRes.data?.data?.enrollments?.length ?? 0;

    updateCardValue('statTotalStudents', totalStudents);
    updateCardValue('statTotalTeachers', totalTeachers);
    updateCardValue('statTotalCourses', totalCourses);
    updateCardValue('statTotalDepartments', totalDepartments);
    updateCardValue('statTotalEnrollments', totalEnrollments);

    // Real overall attendance percentage calculation
    const summary = attSummaryRes.data?.data?.summary;
    if (attSummaryRes.ok && summary && summary.total_records > 0) {
      const avg = typeof summary.average_percentage === 'number' 
        ? Math.round(summary.average_percentage) 
        : parseFloat(summary.average_percentage || 0);
      updateCardValue('statOverallAttendance', `${avg}%`);
    } else {
      updateCardValue('statOverallAttendance', 'No data');
    }
  } catch (err) {
    updateCardValue('statTotalStudents', '0');
    updateCardValue('statTotalTeachers', '0');
    updateCardValue('statTotalCourses', '0');
    updateCardValue('statTotalDepartments', '0');
    updateCardValue('statOverallAttendance', 'No data');
    updateCardValue('statTotalEnrollments', '0');
  }
}

function updateCardValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = value;
}

/**
 * Chart 1: Student Performance Analytics
 * Shows real grade distribution via Chart.js with Purple/Plum/Amber palette,
 * or displays a polished empty state if no grades are recorded.
 */
async function initPerformanceChart() {
  const canvas = document.getElementById('performanceChartCanvas');
  const emptyState = document.getElementById('performanceChartEmpty');
  if (!canvas) return;

  try {
    const res = await apiRequest('/performance/grade-distribution');
    const data = res.data?.data;

    if (res.ok && data && data.total_results > 0 && data.distribution && typeof Chart !== 'undefined') {
      const labels = Object.keys(data.distribution);
      const counts = labels.map(k => data.distribution[k].count || 0);
      const hasAnyCounts = counts.some(c => c > 0);

      if (hasAnyCounts) {
        if (emptyState) emptyState.classList.add('hidden');
        canvas.classList.remove('hidden');

        if (performanceChartInstance) {
          performanceChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        performanceChartInstance = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Students Count',
              data: counts,
              backgroundColor: [
                '#7c3aed', // O (Deep Violet)
                '#8b5cf6', // A+ (Violet)
                '#a855f7', // A (Purple)
                '#c026d3', // B+ (Plum)
                '#d946ef', // B (Fuchsia)
                '#f59e0b', // C (Amber)
                '#ea580c', // P (Orange)
                '#e11d48'  // F (Rose)
              ],
              borderRadius: 6,
              borderSkipped: false,
              maxBarThickness: 38
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#191426',
                titleColor: '#ffffff',
                bodyColor: '#e9d5ff',
                padding: 10,
                cornerRadius: 8,
                callbacks: {
                  label: (ctx) => `Students: ${ctx.parsed.y}`
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: {
                  color: '#665e75',
                  font: { family: 'inherit', weight: 600, size: 12 }
                }
              },
              y: {
                beginAtZero: true,
                ticks: {
                  stepSize: 1,
                  color: '#988fa8',
                  font: { family: 'inherit', size: 11 }
                },
                grid: {
                  color: '#f2eff7'
                }
              }
            }
          }
        });
        window.performanceChartInstance = performanceChartInstance;
        return;
      }
    }
  } catch (err) {
    console.warn('Performance chart initialization error:', err);
  }

  // Fallback to elegant empty state
  if (canvas) canvas.classList.add('hidden');
  if (emptyState) emptyState.classList.remove('hidden');
}

/**
 * Chart 2: Attendance Analytics
 * Shows real attendance status breakdown (Present, Absent, Late, Excused)
 * via Chart.js Doughnut chart using Purple/Plum/Amber/Rose colors,
 * or displays a polished empty state if no sessions are recorded.
 */
async function initAttendanceChart() {
  const canvas = document.getElementById('attendanceChartCanvas');
  const emptyState = document.getElementById('attendanceChartEmpty');
  if (!canvas) return;

  try {
    const res = await apiRequest('/attendance/summary');
    const summary = res.data?.data?.summary;

    if (res.ok && summary && summary.total_records > 0 && typeof Chart !== 'undefined') {
      const present = summary.present_count || 0;
      const absent = summary.absent_count || 0;
      const late = summary.late_count || 0;
      const excused = summary.excused_count || 0;

      if (present + absent + late + excused > 0) {
        if (emptyState) emptyState.classList.add('hidden');
        canvas.classList.remove('hidden');

        if (attendanceChartInstance) {
          attendanceChartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        attendanceChartInstance = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['Present', 'Absent', 'Late', 'Excused'],
            datasets: [{
              data: [present, absent, late, excused],
              backgroundColor: [
                '#7c3aed', // Present (Deep Violet)
                '#e11d48', // Absent (Rose)
                '#f59e0b', // Late (Amber)
                '#c026d3'  // Excused (Plum)
              ],
              borderWidth: 2,
              borderColor: '#ffffff',
              hoverOffset: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: '#191426',
                  font: { family: 'inherit', weight: 600, size: 12 },
                  padding: 16,
                  usePointStyle: true,
                  pointStyle: 'circle'
                }
              },
              tooltip: {
                backgroundColor: '#191426',
                titleColor: '#ffffff',
                bodyColor: '#e9d5ff',
                padding: 10,
                cornerRadius: 8,
                callbacks: {
                  label: (ctx) => {
                    const total = present + absent + late + excused;
                    const val = ctx.parsed;
                    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                    return ` ${ctx.label}: ${val} (${pct}%)`;
                  }
                }
              }
            }
          }
        });
        window.attendanceChartInstance = attendanceChartInstance;
        return;
      }
    }
  } catch (err) {
    console.warn('Attendance chart initialization error:', err);
  }

  // Fallback to elegant empty state
  if (canvas) canvas.classList.add('hidden');
  if (emptyState) emptyState.classList.remove('hidden');
}

/**
 * Low Attendance Students Section (< 75%)
 * Consumes real low-attendance records from /api/attendance/summary,
 * or displays an attractive empty state if no student is below threshold.
 */
async function loadLowAttendance() {
  const tableBody = document.getElementById('lowAttendanceTableBody');
  const emptyState = document.getElementById('lowAttendanceEmpty');
  const tableResponsive = tableBody ? tableBody.closest('.table-responsive') : null;

  try {
    const res = await apiRequest('/attendance/summary');
    const lowStudents = res.data?.data?.lowAttendanceStudents;

    if (res.ok && Array.isArray(lowStudents) && lowStudents.length > 0) {
      if (emptyState) emptyState.classList.add('hidden');
      if (tableResponsive) tableResponsive.classList.remove('hidden');

      if (tableBody) {
        tableBody.innerHTML = lowStudents.map(stu => {
          const studentName = stu.student_name || 'Student';
          const initial = (studentName[0] || 'S').toUpperCase();
          const prn = stu.prn_number || stu.enrollment_number || '-';
          const courseCode = stu.course_code || '';
          const courseName = stu.course_name || '';
          const dept = stu.department_name || 'Academics';
          const pct = typeof stu.attendance_percentage === 'number' 
            ? stu.attendance_percentage.toFixed(1) 
            : parseFloat(stu.attendance_percentage || 0).toFixed(1);

          return `
            <tr>
              <td>
                <div class="student-cell">
                  <div class="student-mini-avatar">${escapeHtml(initial)}</div>
                  <div class="student-meta">
                    <span class="student-name">${escapeHtml(studentName)}</span>
                    <span class="student-email">${escapeHtml(stu.student_email || '')}</span>
                  </div>
                </div>
              </td>
              <td>
                <span class="prn-pill">${escapeHtml(prn)}</span>
              </td>
              <td>
                <span style="font-weight:600; color:var(--adm-text-main); font-size:12.5px;">${escapeHtml(courseCode ? courseCode + ' - ' + courseName : dept)}</span>
                <span style="font-size:11px; color:var(--adm-text-muted); display:block;">${escapeHtml(dept)}</span>
              </td>
              <td>
                <span class="attendance-pct-badge">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  </svg>
                  ${pct}%
                </span>
              </td>
              <td>
                <span class="status-chip-alert">At Risk (&lt; 75%)</span>
              </td>
            </tr>
          `;
        }).join('');
      }
      return;
    }
  } catch (err) {
    console.warn('Error loading low attendance records:', err);
  }

  // Fallback: No low attendance students
  if (tableBody) tableBody.innerHTML = '';
  if (tableResponsive) tableResponsive.classList.add('hidden');
  if (emptyState) emptyState.classList.remove('hidden');
}

/**
 * Recent Activities Section
 * Consumes real audit activity from /api/audit-logs?limit=6.
 */
async function loadRecentActivities() {
  const listContainer = document.getElementById('recentActivitiesList');
  const emptyState = document.getElementById('recentActivitiesEmpty');

  try {
    const res = await apiRequest('/audit-logs?limit=6');
    const logs = res.data?.data;

    if (res.ok && Array.isArray(logs) && logs.length > 0) {
      if (emptyState) emptyState.classList.add('hidden');
      if (listContainer) {
        listContainer.classList.remove('hidden');
        listContainer.innerHTML = logs.map(act => {
          const actionText = formatActionName(act.action || act.details || 'System Activity');
          const actor = act.username || 'admin';
          const desc = act.description || act.details || `Performed ${actionText.toLowerCase()}`;
          const timeFormatted = formatRelativeTime(act.created_at);
          const iconSvg = getActivityIcon(act.action);

          return `
            <div class="activity-item">
              <div class="activity-icon-badge">
                ${iconSvg}
              </div>
              <div class="activity-details">
                <div class="activity-header-row">
                  <span class="activity-title-text">${escapeHtml(actionText)}</span>
                  <span class="activity-actor-pill">${escapeHtml(actor)}</span>
                </div>
                <p class="activity-desc-text">${escapeHtml(desc)}</p>
                <span class="activity-time-stamp">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 14 14"></polyline>
                  </svg>
                  ${escapeHtml(timeFormatted)}
                </span>
              </div>
            </div>
          `;
        }).join('');
      }
      return;
    }
  } catch (err) {
    console.warn('Error loading recent activities:', err);
  }

  if (listContainer) {
    listContainer.innerHTML = '';
    listContainer.classList.add('hidden');
  }
  if (emptyState) emptyState.classList.remove('hidden');
}

/**
 * Helper to get modern SVG icon for activity types
 */
function getActivityIcon(action) {
  const a = String(action || '').toUpperCase();
  if (a.includes('LOGIN') || a.includes('AUTH')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>`;
  }
  if (a.includes('ATTENDANCE')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;
  }
  if (a.includes('TIMETABLE')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line></svg>`;
  }
  if (a.includes('STUDENT') || a.includes('USER') || a.includes('TEACHER')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
  }
  if (a.includes('COURSE') || a.includes('GRADE') || a.includes('ASSIGNMENT')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>`;
}

/**
 * Format raw audit action strings into clean readable titles
 */
function formatActionName(raw) {
  if (!raw) return 'System Action';
  return String(raw)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
}

/**
 * Format timestamp into relative or human-readable format
 */
function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Just now';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadUpcomingCalendarEvents() {
  const container = document.getElementById('upcomingEventsList');
  const emptyState = document.getElementById('upcomingEventsEmpty');
  if (!container) return;

  try {
    const res = await api.get('/academic-events/upcoming?limit=6');
    const events = (res && res.data && res.data.events) ? res.data.events : [];
    if (events.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      container.innerHTML = '';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    let html = '';
    events.forEach(e => {
      const isExam = e.event_type === 'EXAM';
      const isHoliday = e.event_type === 'HOLIDAY';
      const isSeminar = e.event_type === 'SEMINAR';
      const isMeeting = e.event_type === 'MEETING';

      let bg = '#f5f3ff';
      let fg = '#7c3aed';
      if (isExam) { bg = '#fff1f2'; fg = '#be123c'; }
      else if (isHoliday) { bg = '#f0fdf4'; fg = '#15803d'; }
      else if (isMeeting) { bg = '#fdf4ff'; fg = '#a21caf'; }

      const timeStr = e.start_time ? ` • ${e.start_time.slice(0, 5)}` : '';

      html += `
        <div style="background: #ffffff; border: 1px solid var(--admin-border); border-radius: var(--admin-radius-sm); padding: 14px; border-left: 4px solid ${fg};">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <span style="font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: ${bg}; color: ${fg};">
              ${e.event_type}${e.exam_type ? ` - ${e.exam_type}` : ''}
            </span>
            <span style="font-size: 11px; color: var(--admin-muted); font-weight: 500;">${e.target_audience}</span>
          </div>
          <div style="font-size: 13.5px; font-weight: 700; color: var(--admin-text); line-height: 1.3; margin-bottom: 4px;">
            ${escapeHtml(e.title)}
          </div>
          <div style="font-size: 12px; color: var(--admin-muted);">
            📅 ${e.start_date}${timeStr}
          </div>
          ${e.room || e.location ? `<div style="font-size: 11.5px; color: var(--admin-muted); margin-top: 2px;">📍 ${escapeHtml(e.room || e.location)}</div>` : ''}
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (err) {
    console.warn('Failed to load upcoming calendar events:', err);
    if (emptyState) emptyState.classList.remove('hidden');
  }
}

