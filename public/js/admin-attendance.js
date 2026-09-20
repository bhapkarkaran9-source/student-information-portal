/**
 * Admin Attendance Management JavaScript
 * Premium College ERP UI & Real Database Integration
 * ZERO IMAGES - All real API data and inline SVGs
 */

(function () {
  'use strict';

  // 1. Enforce ADMIN authentication
  const currentUser = typeof requireAuth === 'function' ? requireAuth('ADMIN') : null;
  if (!currentUser && typeof requireAuth === 'function') return;

  // State
  let currentPage = 1;
  const limit = 10;
  let totalRecords = 0;
  let allStudents = [];
  let allCourses = [];
  let allTeachers = [];
  let allEnrollments = [];
  let searchTimeout = null;
  let pendingDeleteId = null;

  // DOM Elements - Toolbar & Search
  const searchInput = document.getElementById('attendanceSearchInput');
  const filterStudentSelect = document.getElementById('filterStudentSelect');
  const filterCourseSelect = document.getElementById('filterCourseSelect');
  const filterTeacherSelect = document.getElementById('filterTeacherSelect');
  const filterStatusSelect = document.getElementById('filterStatusSelect');
  const filterDateFromInput = document.getElementById('filterDateFromInput');
  const filterDateToInput = document.getElementById('filterDateToInput');
  const applyFiltersBtn = document.getElementById('applyFiltersBtn');
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const tableActiveFilterSummary = document.getElementById('tableActiveFilterSummary');
  const filterStatusIndicator = document.getElementById('filterStatusIndicator');

  // Table & Pagination
  const attendanceTable = document.getElementById('attendanceTable');
  const attendanceTableBody = document.getElementById('attendanceTableBody');
  const attendanceTableEmpty = document.getElementById('attendanceTableEmpty');
  const emptyRecordAttendanceBtn = document.getElementById('emptyRecordAttendanceBtn');
  const attendancePagination = document.getElementById('attendancePagination');
  const paginationInfo = document.getElementById('paginationInfo');
  const paginationCurrent = document.getElementById('paginationCurrent');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');

  // KPI elements
  const kpiTotalRecords = document.getElementById('kpiTotalRecords');
  const kpiPresentCount = document.getElementById('kpiPresentCount');
  const kpiPresentRatio = document.getElementById('kpiPresentRatio');
  const kpiAbsentCount = document.getElementById('kpiAbsentCount');
  const kpiAvgPercentage = document.getElementById('kpiAvgPercentage');
  const kpiLowAttendanceCount = document.getElementById('kpiLowAttendanceCount');
  const kpiLowAttendanceCard = document.getElementById('kpiLowAttendanceCard');

  // Overview elements
  const overviewCircleBar = document.getElementById('overviewCircleBar');
  const overviewCirclePercent = document.getElementById('overviewCirclePercent');
  const overviewPresentCount = document.getElementById('overviewPresentCount');
  const overviewPresentPct = document.getElementById('overviewPresentPct');
  const overviewPresentBar = document.getElementById('overviewPresentBar');
  const overviewAbsentCount = document.getElementById('overviewAbsentCount');
  const overviewAbsentPct = document.getElementById('overviewAbsentPct');
  const overviewAbsentBar = document.getElementById('overviewAbsentBar');
  const overviewLateCount = document.getElementById('overviewLateCount');
  const overviewLatePct = document.getElementById('overviewLatePct');
  const overviewLateBar = document.getElementById('overviewLateBar');
  const overviewExcusedCount = document.getElementById('overviewExcusedCount');
  const overviewExcusedPct = document.getElementById('overviewExcusedPct');
  const overviewExcusedBar = document.getElementById('overviewExcusedBar');

  // Quick action buttons
  const qaRecordAttendanceBtn = document.getElementById('qaRecordAttendanceBtn');
  const qaStudentAttendanceBtn = document.getElementById('qaStudentAttendanceBtn');
  const qaCourseAttendanceBtn = document.getElementById('qaCourseAttendanceBtn');
  const qaLowAttendanceBtn = document.getElementById('qaLowAttendanceBtn');

  // Low attendance section
  const lowAttendanceSection = document.getElementById('lowAttendanceSection');
  const lowAttendanceEmptyBox = document.getElementById('lowAttendanceEmptyBox');
  const lowAttendanceDefaulterBox = document.getElementById('lowAttendanceDefaulterBox');
  const lowAttendanceDefaulterBody = document.getElementById('lowAttendanceDefaulterBody');
  const lowAttendanceBadgeCount = document.getElementById('lowAttendanceBadgeCount');

  // Modals
  const addAttendanceModal = document.getElementById('addAttendanceModal');
  const addAttendanceForm = document.getElementById('addAttendanceForm');
  const addStudentId = document.getElementById('addStudentId');
  const addCourseId = document.getElementById('addCourseId');
  const addTeacherId = document.getElementById('addTeacherId');
  const addAttendanceDate = document.getElementById('addAttendanceDate');
  const addStatus = document.getElementById('addStatus');
  const addRemarks = document.getElementById('addRemarks');
  const addStudentHint = document.getElementById('addStudentHint');
  const addAttendanceError = document.getElementById('addAttendanceError');
  const openAddAttendanceBtn = document.getElementById('openAddAttendanceBtn');

  const editAttendanceModal = document.getElementById('editAttendanceModal');
  const editAttendanceForm = document.getElementById('editAttendanceForm');
  const editAttendanceId = document.getElementById('editAttendanceId');
  const editStudentId = document.getElementById('editStudentId');
  const editCourseId = document.getElementById('editCourseId');
  const editTeacherId = document.getElementById('editTeacherId');
  const editAttendanceDate = document.getElementById('editAttendanceDate');
  const editStatus = document.getElementById('editStatus');
  const editRemarks = document.getElementById('editRemarks');
  const editAttendanceError = document.getElementById('editAttendanceError');

  const viewAttendanceModal = document.getElementById('viewAttendanceModal');
  const studentAttendanceModal = document.getElementById('studentAttendanceModal');
  const courseAttendanceModal = document.getElementById('courseAttendanceModal');

  const confirmModal = document.getElementById('confirmModal');
  const confirmModalMessage = document.getElementById('confirmModalMessage');
  const confirmModalActionBtn = document.getElementById('confirmModalActionBtn');

  /**
   * Helper: Escape HTML string safely
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

  /**
   * Status Badges with Inline SVGs
   */
  function getStatusBadge(status) {
    switch (status) {
      case 'Present':
        return `
          <span class="att-status-badge att-status-present">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Present
          </span>
        `;
      case 'Absent':
        return `
          <span class="att-status-badge att-status-absent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            Absent
          </span>
        `;
      case 'Late':
        return `
          <span class="att-status-badge att-status-late">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Late
          </span>
        `;
      case 'Excused':
        return `
          <span class="att-status-badge att-status-excused">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            Excused
          </span>
        `;
      default:
        return `<span class="badge badge-secondary">${escapeHtml(status || 'Unknown')}</span>`;
    }
  }

  /**
   * Initialize Attendance Page
   */
  async function init() {
    setupModalListeners();
    setupEventListeners();

    // Load reference data (Students, Courses, Teachers, Enrollments)
    await loadReferenceData();

    // Load Summary & List
    await Promise.all([
      loadAttendanceSummary(),
      loadAttendance(1)
    ]);
  }

  /**
   * Setup Modal Triggers, Close Buttons, and Escape key
   */
  function setupModalListeners() {
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        closeModal(modalId);
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.add('hidden');
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(modal => {
          modal.classList.add('hidden');
        });
      }
    });
  }

  function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('hidden');
  }

  function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('hidden');
  }

  /**
   * Load reference data for dropdowns
   */
  async function loadReferenceData() {
    try {
      const [studentsRes, coursesRes, teachersRes, enrollmentsRes] = await Promise.all([
        apiGet('/api/students?limit=200'),
        apiGet('/api/courses?limit=200'),
        apiGet('/api/teachers?limit=200'),
        apiGet('/api/enrollments?limit=1000')
      ]);

      if (studentsRes.success && studentsRes.data) {
        allStudents = studentsRes.data.students || [];
        populateStudentDropdowns();
      }

      if (coursesRes.success && coursesRes.data) {
        allCourses = coursesRes.data.courses || [];
        populateCourseDropdowns();
      }

      if (teachersRes.success && teachersRes.data) {
        allTeachers = teachersRes.data.teachers || [];
        populateTeacherDropdowns();
      }

      if (enrollmentsRes.success && enrollmentsRes.data) {
        allEnrollments = enrollmentsRes.data.enrollments || [];
      }
    } catch (err) {
      console.error('Error loading reference data:', err.message);
    }
  }

  function populateStudentDropdowns() {
    filterStudentSelect.innerHTML = '<option value="">All Students</option>';
    addStudentId.innerHTML = '<option value="">Select Enrolled Student...</option>';
    editStudentId.innerHTML = '<option value="">Select Enrolled Student...</option>';

    allStudents.forEach(s => {
      const name = s.student_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student';
      const prn = s.enrollment_number || s.prn_number || 'No PRN';
      const text = `${name} (${prn})`;

      const optFilter = document.createElement('option');
      optFilter.value = s.student_id;
      optFilter.textContent = text;
      filterStudentSelect.appendChild(optFilter);

      const optAdd = document.createElement('option');
      optAdd.value = s.student_id;
      optAdd.textContent = text;
      addStudentId.appendChild(optAdd);

      const optEdit = document.createElement('option');
      optEdit.value = s.student_id;
      optEdit.textContent = text;
      editStudentId.appendChild(optEdit);
    });
  }

  function populateCourseDropdowns() {
    filterCourseSelect.innerHTML = '<option value="">All Courses</option>';
    editCourseId.innerHTML = '<option value="">Select Course...</option>';

    allCourses.forEach(c => {
      const text = `${c.course_code} - ${c.course_name}`;

      const optFilter = document.createElement('option');
      optFilter.value = c.course_id;
      optFilter.textContent = text;
      filterCourseSelect.appendChild(optFilter);

      const optEdit = document.createElement('option');
      optEdit.value = c.course_id;
      optEdit.textContent = text;
      editCourseId.appendChild(optEdit);
    });
  }

  function populateTeacherDropdowns() {
    filterTeacherSelect.innerHTML = '<option value="">All Teachers</option>';
    addTeacherId.innerHTML = '<option value="">Select Instructor...</option>';
    editTeacherId.innerHTML = '<option value="">Select Instructor...</option>';

    allTeachers.forEach(t => {
      const name = t.teacher_name || `${t.first_name || ''} ${t.last_name || ''}`.trim() || 'Instructor';
      const emp = t.employee_number || 'Emp';
      const text = `${name} (${emp})`;

      const optFilter = document.createElement('option');
      optFilter.value = t.teacher_id;
      optFilter.textContent = text;
      filterTeacherSelect.appendChild(optFilter);

      const optAdd = document.createElement('option');
      optAdd.value = t.teacher_id;
      optAdd.textContent = text;
      addTeacherId.appendChild(optAdd);

      const optEdit = document.createElement('option');
      optEdit.value = t.teacher_id;
      optEdit.textContent = text;
      editTeacherId.appendChild(optEdit);
    });
  }

  /**
   * Filter available courses when a student is selected in Add Modal
   */
  addStudentId.addEventListener('change', () => {
    const studentId = parseInt(addStudentId.value, 10);
    addCourseId.innerHTML = '<option value="">Select Course...</option>';

    if (!studentId) {
      addStudentHint.textContent = 'Choose a student to view their enrolled courses.';
      addStudentHint.style.color = '#64748b';
      return;
    }

    const studentEnrollments = allEnrollments.filter(e => e.student_id === studentId && e.status === 'Enrolled');

    if (studentEnrollments.length === 0) {
      addStudentHint.textContent = '⚠️ This student is not actively enrolled in any course. Register enrollment first.';
      addStudentHint.style.color = '#b45309';
      return;
    }

    addStudentHint.textContent = `✓ Found ${studentEnrollments.length} actively enrolled course(s) for this student.`;
    addStudentHint.style.color = '#15803d';

    studentEnrollments.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.course_id;
      opt.textContent = `${e.course_code} - ${e.course_name}`;
      addCourseId.appendChild(opt);
    });

    if (studentEnrollments.length === 1) {
      addCourseId.value = studentEnrollments[0].course_id;
    }
  });

  /**
   * Load Summary & Populate KPI cards, Overview circular gauge, and Low Attendance Watchlist
   */
  async function loadAttendanceSummary() {
    try {
      const res = await apiGet('/api/attendance/summary');
      if (res.success && res.data) {
        const { summary, lowAttendanceStudents = [] } = res.data;
        const total = summary.total_records || 0;
        const present = summary.present_count || 0;
        const absent = summary.absent_count || 0;
        const late = summary.late_count || 0;
        const excused = summary.excused_count || 0;
        const avgPct = summary.average_percentage !== null && summary.average_percentage !== undefined 
          ? summary.average_percentage 
          : 0.0;
        const lowCount = summary.low_attendance_count || 0;

        // 1. KPI Cards
        kpiTotalRecords.textContent = total;
        kpiPresentCount.textContent = present;
        kpiAbsentCount.textContent = absent;
        kpiAvgPercentage.textContent = avgPct.toFixed(2) + '%';
        kpiLowAttendanceCount.textContent = lowCount;

        if (total > 0) {
          const ratio = ((present / total) * 100).toFixed(1);
          kpiPresentRatio.textContent = `${ratio}% of recorded`;
        } else {
          kpiPresentRatio.textContent = '0% of recorded';
        }

        // 2. Overview Circular Indicator
        overviewCirclePercent.textContent = avgPct.toFixed(2) + '%';
        const circleCircumference = 2 * Math.PI * 50; // 314.16
        const strokeOffset = circleCircumference - (circleCircumference * (avgPct / 100));
        overviewCircleBar.style.strokeDashoffset = isNaN(strokeOffset) ? circleCircumference : strokeOffset;
        if (avgPct < 75 && total > 0) {
          overviewCircleBar.style.stroke = '#f59e0b'; // amber warning
        } else {
          overviewCircleBar.style.stroke = '#7c3aed'; // blue primary
        }

        // 3. Overview Progress Bars & Percentages
        overviewPresentCount.textContent = present;
        overviewAbsentCount.textContent = absent;
        overviewLateCount.textContent = late;
        overviewExcusedCount.textContent = excused;

        const presentPct = total > 0 ? ((present / total) * 100).toFixed(1) : '0.0';
        const absentPct = total > 0 ? ((absent / total) * 100).toFixed(1) : '0.0';
        const latePct = total > 0 ? ((late / total) * 100).toFixed(1) : '0.0';
        const excusedPct = total > 0 ? ((excused / total) * 100).toFixed(1) : '0.0';

        overviewPresentPct.textContent = `${presentPct}%`;
        overviewAbsentPct.textContent = `${absentPct}%`;
        overviewLatePct.textContent = `${latePct}%`;
        overviewExcusedPct.textContent = `${excusedPct}%`;

        overviewPresentBar.style.width = `${presentPct}%`;
        overviewAbsentBar.style.width = `${absentPct}%`;
        overviewLateBar.style.width = `${latePct}%`;
        overviewExcusedBar.style.width = `${excusedPct}%`;

        // 4. Low Attendance Alert Section
        renderLowAttendanceSection(lowAttendanceStudents);
      }
    } catch (err) {
      console.error('Error fetching attendance summary:', err.message);
    }
  }

  /**
   * Render Low Attendance Alert Section
   */
  function renderLowAttendanceSection(students) {
    if (!students || students.length === 0) {
      lowAttendanceEmptyBox.classList.remove('hidden');
      lowAttendanceDefaulterBox.classList.add('hidden');
      lowAttendanceBadgeCount.innerHTML = '';
      return;
    }

    lowAttendanceEmptyBox.classList.add('hidden');
    lowAttendanceDefaulterBox.classList.remove('hidden');
    lowAttendanceBadgeCount.innerHTML = `
      <span class="att-kpi-badge att-badge-amber" style="font-size: 12px; padding: 4px 10px;">
        ${students.length} Defaulter(s) Detected
      </span>
    `;

    lowAttendanceDefaulterBody.innerHTML = '';
    students.forEach(s => {
      const tr = document.createElement('tr');
      const pct = (s.attendance_percentage || 0).toFixed(2);

      tr.innerHTML = `
        <td>
          <div style="font-weight: 600; color: #0f172a;">${escapeHtml(s.student_name || 'Student')}</div>
          <small style="color: #64748b;">${escapeHtml(s.student_email || '')}</small>
        </td>
        <td>
          <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: 600; color: #334155;">
            ${escapeHtml(s.enrollment_number || '-')}
          </code>
        </td>
        <td>
          <span style="font-weight: 600; color: #7c3aed;">${escapeHtml(s.course_code)}</span>
          <div style="font-size: 12px; color: #64748b;">${escapeHtml(s.course_name)}</div>
        </td>
        <td>${s.total_lectures || 0}</td>
        <td style="color: #10b981; font-weight: 600;">${s.present_lectures || 0}</td>
        <td>
          <span style="font-weight: 800; color: #b45309; font-size: 13px;">${pct}%</span>
        </td>
        <td>
          <span class="att-status-badge att-status-late" style="font-size: 11px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            Defaulter (&lt; 75%)
          </span>
        </td>
        <td style="text-align: right;">
          <button type="button" class="btn btn-secondary btn-sm view-defaulter-profile-btn" data-student-id="${s.student_id}">
            View Profile
          </button>
        </td>
      `;

      lowAttendanceDefaulterBody.appendChild(tr);
    });

    document.querySelectorAll('.view-defaulter-profile-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sId = btn.getAttribute('data-student-id');
        openStudentAttendanceModal(sId);
      });
    });
  }

  /**
   * Load Paginated Attendance Table
   */
  async function loadAttendance(page = 1) {
    currentPage = page;
    const params = new URLSearchParams({
      page: currentPage,
      limit
    });

    const searchVal = searchInput.value.trim();
    if (searchVal) params.append('search', searchVal);

    if (filterStudentSelect.value) params.append('student_id', filterStudentSelect.value);
    if (filterCourseSelect.value) params.append('course_id', filterCourseSelect.value);
    if (filterTeacherSelect.value) params.append('teacher_id', filterTeacherSelect.value);
    if (filterStatusSelect.value) params.append('status', filterStatusSelect.value);
    if (filterDateFromInput.value) params.append('start_date', filterDateFromInput.value);
    if (filterDateToInput.value) params.append('end_date', filterDateToInput.value);

    // Show loading state
    attendanceTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px; color: #64748b;">
          <div style="display: inline-block; width: 22px; height: 22px; border: 2px solid #cbd5e1; border-top-color: #7c3aed; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 8px; vertical-align: middle;"></div>
          Loading attendance records...
        </td>
      </tr>
    `;
    attendanceTableEmpty.classList.add('hidden');

    // Update active filter label
    const filterParts = [];
    if (searchVal) filterParts.push(`"${searchVal}"`);
    if (filterStatusSelect.value) filterParts.push(filterStatusSelect.value);
    if (filterDateFromInput.value || filterDateToInput.value) {
      filterParts.push(`Date: ${filterDateFromInput.value || '...'} to ${filterDateToInput.value || '...'}`);
    }
    tableActiveFilterSummary.textContent = filterParts.length > 0 ? `Filtered by ${filterParts.join(', ')}` : 'All lectures';
    filterStatusIndicator.textContent = filterParts.length > 0 ? `Active filters (${filterParts.length})` : 'Showing all records';

    try {
      const res = await apiGet(`/api/attendance?${params.toString()}`);
      if (res.success && res.data) {
        renderTable(res.data.attendance || []);
        renderPagination(res.data.pagination);
      } else {
        renderTable([]);
      }
    } catch (err) {
      console.error('Error loading attendance:', err.message);
      renderTable([]);
      showToast(err.message || 'Unable to load attendance records', 'error');
    }
  }

  /**
   * Render Attendance Table Rows
   */
  function renderTable(records) {
    attendanceTableBody.innerHTML = '';

    if (!records || records.length === 0) {
      attendanceTable.classList.add('hidden');
      attendanceTableEmpty.classList.remove('hidden');
      attendancePagination.classList.add('hidden');
      return;
    }

    attendanceTable.classList.remove('hidden');
    attendanceTableEmpty.classList.add('hidden');
    attendancePagination.classList.remove('hidden');

    records.forEach(r => {
      const tr = document.createElement('tr');
      const initial = (r.student_name ? r.student_name[0] : 'S').toUpperCase();

      tr.innerHTML = `
        <td style="font-weight: 600; color: #0f172a; white-space: nowrap;">
          ${escapeHtml(r.attendance_date || '-')}
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background-color: #f5f3ff; color: #7c3aed; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0;" aria-hidden="true">
              ${initial}
            </div>
            <div>
              <button type="button" class="view-student-link" data-student-id="${r.student_id}" style="background: none; border: none; padding: 0; font-size: 13.5px; font-weight: 600; color: #0f172a; cursor: pointer; text-align: left;">
                ${escapeHtml(r.student_name || 'Student')}
              </button>
              <div style="font-size: 11.5px; color: #64748b;">${escapeHtml(r.department_name || '')}</div>
            </div>
          </div>
        </td>
        <td>
          <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: 600; color: #334155; font-size: 12px;">
            ${escapeHtml(r.enrollment_number || '-')}
          </code>
        </td>
        <td>
          <button type="button" class="view-course-link" data-course-id="${r.course_id}" style="background: none; border: none; padding: 0; cursor: pointer; text-align: left;">
            <span style="font-weight: 700; color: #7c3aed; margin-right: 4px;">${escapeHtml(r.course_code)}</span>
            <span style="color: #334155; font-size: 12.5px;">${escapeHtml(r.course_name)}</span>
          </button>
        </td>
        <td style="color: #475569; font-size: 13px;">
          ${escapeHtml(r.teacher_name || '-')}
        </td>
        <td>
          ${getStatusBadge(r.status)}
        </td>
        <td style="color: #64748b; font-size: 12.5px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(r.remarks || '—')}
        </td>
        <td style="text-align: right;">
          <div class="att-action-btn-group">
            <button type="button" class="att-action-btn att-action-btn-view view-attendance-btn" data-id="${r.attendance_id}" title="View Details" aria-label="View attendance details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <button type="button" class="att-action-btn att-action-btn-edit edit-attendance-btn" data-id="${r.attendance_id}" title="Edit Record" aria-label="Edit attendance record">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button type="button" class="att-action-btn att-action-btn-delete delete-attendance-btn" data-id="${r.attendance_id}" data-date="${r.attendance_date}" data-student="${r.student_name}" title="Delete Record" aria-label="Delete attendance record">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </td>
      `;

      attendanceTableBody.appendChild(tr);
    });

    // Wire row click listeners
    document.querySelectorAll('.view-attendance-btn').forEach(btn => {
      btn.addEventListener('click', () => openViewAttendanceModal(btn.getAttribute('data-id')));
    });

    document.querySelectorAll('.edit-attendance-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditAttendanceModal(btn.getAttribute('data-id')));
    });

    document.querySelectorAll('.delete-attendance-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const date = btn.getAttribute('data-date');
        const student = btn.getAttribute('data-student');
        openDeleteModal(id, student, date);
      });
    });

    document.querySelectorAll('.view-student-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const studentId = btn.getAttribute('data-student-id');
        openStudentAttendanceModal(studentId);
      });
    });

    document.querySelectorAll('.view-course-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const courseId = btn.getAttribute('data-course-id');
        openCourseAttendanceModal(courseId);
      });
    });
  }

  /**
   * Render Pagination Controls
   */
  function renderPagination(pagination) {
    if (!pagination) return;
    totalRecords = pagination.total || 0;
    const totalPages = pagination.totalPages || 1;

    const start = totalRecords > 0 ? (pagination.page - 1) * limit + 1 : 0;
    const end = Math.min(pagination.page * limit, totalRecords);

    paginationInfo.textContent = `Showing ${start}–${end} of ${totalRecords} records`;
    paginationCurrent.textContent = `Page ${pagination.page} of ${totalPages}`;

    prevPageBtn.disabled = pagination.page <= 1;
    nextPageBtn.disabled = pagination.page >= totalPages;
  }

  /**
   * Open Add Attendance Modal
   */
  function triggerAddModal() {
    addAttendanceForm.reset();
    addAttendanceError.classList.add('hidden');
    addAttendanceError.textContent = '';

    // Set default date to today YYYY-MM-DD
    const today = new Date().toISOString().slice(0, 10);
    addAttendanceDate.value = today;
    addStatus.value = 'Present';
    addStudentHint.textContent = 'Choose a student to view their enrolled courses.';
    addStudentHint.style.color = '#64748b';

    openModal('addAttendanceModal');
  }

  openAddAttendanceBtn.addEventListener('click', triggerAddModal);
  if (emptyRecordAttendanceBtn) {
    emptyRecordAttendanceBtn.addEventListener('click', triggerAddModal);
  }

  /**
   * Submit Add Attendance Form
   */
  addAttendanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    addAttendanceError.classList.add('hidden');
    addAttendanceError.textContent = '';

    const payload = {
      student_id: parseInt(addStudentId.value, 10),
      course_id: parseInt(addCourseId.value, 10),
      teacher_id: parseInt(addTeacherId.value, 10),
      attendance_date: addAttendanceDate.value,
      status: addStatus.value,
      remarks: addRemarks.value.trim() || null
    };

    if (!payload.student_id || !payload.course_id || !payload.teacher_id || !payload.attendance_date || !payload.status) {
      addAttendanceError.textContent = 'Please fill all required fields';
      addAttendanceError.classList.remove('hidden');
      return;
    }

    const submitBtn = document.getElementById('submitAddAttendanceBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
      const res = await apiPost('/api/attendance', payload);
      if (res.success) {
        showToast('Attendance recorded successfully', 'success');
        closeModal('addAttendanceModal');
        await Promise.all([
          loadAttendance(1),
          loadAttendanceSummary()
        ]);
      } else {
        // Clear message for duplicate or validation error
        let msg = res.message || 'Failed to record attendance';
        if (msg.toLowerCase().includes('already exists')) {
          msg = 'Attendance already exists for this student, course and date.';
        }
        addAttendanceError.textContent = msg;
        addAttendanceError.classList.remove('hidden');
      }
    } catch (err) {
      addAttendanceError.textContent = err.message || 'Error recording attendance';
      addAttendanceError.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Attendance';
    }
  });

  /**
   * Open Edit Attendance Modal
   */
  async function openEditAttendanceModal(id) {
    editAttendanceForm.reset();
    editAttendanceError.classList.add('hidden');
    editAttendanceError.textContent = '';

    try {
      const res = await apiGet(`/api/attendance/${id}`);
      if (!res.success || !res.data || !res.data.attendance) {
        showToast('Unable to load attendance details', 'error');
        return;
      }

      const a = res.data.attendance;
      editAttendanceId.value = a.attendance_id;
      editStudentId.value = a.student_id;
      editCourseId.value = a.course_id;
      editTeacherId.value = a.teacher_id;
      editAttendanceDate.value = a.attendance_date;
      editStatus.value = a.status;
      editRemarks.value = a.remarks || '';

      openModal('editAttendanceModal');
    } catch (err) {
      showToast(err.message || 'Error fetching attendance details', 'error');
    }
  }

  /**
   * Submit Edit Attendance Form
   */
  editAttendanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    editAttendanceError.classList.add('hidden');
    editAttendanceError.textContent = '';

    const id = editAttendanceId.value;
    const payload = {
      student_id: parseInt(editStudentId.value, 10),
      course_id: parseInt(editCourseId.value, 10),
      teacher_id: parseInt(editTeacherId.value, 10),
      attendance_date: editAttendanceDate.value,
      status: editStatus.value,
      remarks: editRemarks.value.trim() || null
    };

    if (!payload.student_id || !payload.course_id || !payload.teacher_id || !payload.attendance_date || !payload.status) {
      editAttendanceError.textContent = 'Please fill all required fields';
      editAttendanceError.classList.remove('hidden');
      return;
    }

    const submitBtn = document.getElementById('submitEditAttendanceBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';

    try {
      const res = await apiPut(`/api/attendance/${id}`, payload);
      if (res.success) {
        showToast('Attendance updated successfully', 'success');
        closeModal('editAttendanceModal');
        await Promise.all([
          loadAttendance(currentPage),
          loadAttendanceSummary()
        ]);
      } else {
        editAttendanceError.textContent = res.message || 'Failed to update attendance';
        editAttendanceError.classList.remove('hidden');
      }
    } catch (err) {
      editAttendanceError.textContent = err.message || 'Error updating attendance';
      editAttendanceError.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }
  });

  /**
   * Open View Attendance Details Modal (Two-column layout)
   */
  async function openViewAttendanceModal(id) {
    try {
      const res = await apiGet(`/api/attendance/${id}`);
      if (!res.success || !res.data || !res.data.attendance) {
        showToast('Unable to load attendance records', 'error');
        return;
      }

      const a = res.data.attendance;

      document.getElementById('viewAttendanceStatusBadge').innerHTML = getStatusBadge(a.status);
      document.getElementById('viewAttendanceDate').textContent = a.attendance_date || '-';

      document.getElementById('viewStudentName').textContent = a.student_name || 'Student';
      document.getElementById('viewStudentPRN').textContent = a.enrollment_number || a.prn_number || '-';
      document.getElementById('viewStudentEmail').textContent = a.student_email || '-';
      document.getElementById('viewStudentDept').textContent = a.department_name || '-';

      document.getElementById('viewCourseCode').textContent = a.course_code || '-';
      document.getElementById('viewCourseName').textContent = a.course_name || '-';
      document.getElementById('viewTeacherName').textContent = a.teacher_name || '-';
      document.getElementById('viewAttendanceRemarks').textContent = a.remarks || 'None';

      const pct = a.attendance_percentage !== null ? a.attendance_percentage : 0.0;
      const totalLectures = a.total_lectures || 0;
      const presentLectures = a.present_lectures || 0;

      document.getElementById('viewAttendancePctText').textContent = `${pct.toFixed(2)}% (${presentLectures} / ${totalLectures} Lectures)`;
      const bar = document.getElementById('viewAttendanceProgressBar');
      bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;

      if (a.is_low_attendance) {
        bar.style.backgroundColor = '#f59e0b';
      } else {
        bar.style.backgroundColor = '#10b981';
      }

      document.getElementById('viewCreatedAt').textContent = a.created_at ? new Date(a.created_at).toLocaleString() : '-';
      document.getElementById('viewUpdatedAt').textContent = a.updated_at ? new Date(a.updated_at).toLocaleString() : '-';

      openModal('viewAttendanceModal');
    } catch (err) {
      showToast(err.message || 'Error fetching record details', 'error');
    }
  }

  /**
   * Open Student-Wise Attendance Profile Modal
   */
  async function openStudentAttendanceModal(studentId) {
    if (!studentId) {
      if (allStudents.length > 0) {
        studentId = allStudents[0].student_id;
      } else {
        showToast('No registered students found', 'info');
        return;
      }
    }

    try {
      const res = await apiGet(`/api/attendance/student/${studentId}`);
      if (!res.success || !res.data) {
        showToast('Unable to load student attendance profile', 'error');
        return;
      }

      const { student, overallStats, courses = [] } = res.data;

      document.getElementById('studentModalName').textContent = student.student_name || 'Student';
      document.getElementById('studentModalMeta').textContent = `PRN: ${student.enrollment_number || '-'} | Dept: ${student.department_name || '-'} | Sem ${student.semester || 1}`;

      const pct = overallStats.overall_percentage || 0.0;
      const pctEl = document.getElementById('studentModalOverallPct');
      pctEl.textContent = `${pct.toFixed(2)}%`;
      pctEl.style.color = overallStats.is_low_attendance ? '#b45309' : '#10b981';

      document.getElementById('studentModalLecturesCount').textContent = `${overallStats.present_lectures || 0} / ${overallStats.total_lectures || 0} Present`;

      const tbody = document.getElementById('studentCoursesTableBody');
      tbody.innerHTML = '';

      if (courses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 20px;">No courses registered for this student.</td></tr>';
      } else {
        courses.forEach(c => {
          const tr = document.createElement('tr');
          const isLow = c.is_low_attendance;
          const statusBadge = isLow 
            ? '<span class="att-status-badge att-status-late">Defaulter (&lt; 75%)</span>'
            : '<span class="att-status-badge att-status-present">Good Standing</span>';

          tr.innerHTML = `
            <td>
              <strong style="color: #7c3aed;">${escapeHtml(c.course_code)}</strong>
              <div style="font-size: 12px; color: #334155;">${escapeHtml(c.course_name)}</div>
            </td>
            <td>${c.total_lectures || 0}</td>
            <td style="color: #10b981; font-weight: 600;">${c.present_lectures || 0}</td>
            <td style="color: #ef4444; font-weight: 600;">${c.absent_lectures || 0}</td>
            <td style="font-weight: 700; color: ${isLow ? '#b45309' : '#10b981'};">${(c.attendance_percentage || 0).toFixed(2)}%</td>
            <td>${statusBadge}</td>
          `;
          tbody.appendChild(tr);
        });
      }

      openModal('studentAttendanceModal');
    } catch (err) {
      showToast(err.message || 'Error loading student profile', 'error');
    }
  }

  /**
   * Open Course-Wise Attendance Summary Modal
   */
  async function openCourseAttendanceModal(courseId) {
    if (!courseId) {
      if (allCourses.length > 0) {
        courseId = allCourses[0].course_id;
      } else {
        showToast('No courses found', 'info');
        return;
      }
    }

    try {
      const res = await apiGet(`/api/attendance/course/${courseId}`);
      if (!res.success || !res.data) {
        showToast('Unable to load course attendance summary', 'error');
        return;
      }

      const { course, courseStats, students = [] } = res.data;

      document.getElementById('courseModalTitle').textContent = `${course.course_code} - ${course.course_name}`;
      document.getElementById('courseModalMeta').textContent = `Dept: ${course.department_name || '-'} | Semester: ${course.semester || '-'} | Enrolled: ${courseStats.total_enrolled_students || 0}`;
      document.getElementById('courseModalAvgPct').textContent = `${(courseStats.average_percentage || 0).toFixed(2)}%`;

      const tbody = document.getElementById('courseStudentsTableBody');
      tbody.innerHTML = '';

      if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 20px;">No enrolled students recorded for this course.</td></tr>';
      } else {
        students.forEach(s => {
          const tr = document.createElement('tr');
          const isLow = s.is_low_attendance;
          const alertBadge = isLow
            ? '<span class="att-status-badge att-status-late">Defaulter (&lt; 75%)</span>'
            : '<span class="att-status-badge att-status-present">OK</span>';

          tr.innerHTML = `
            <td><strong>${escapeHtml(s.student_name)}</strong></td>
            <td><code>${escapeHtml(s.enrollment_number || '-')}</code></td>
            <td>${s.total_lectures || 0}</td>
            <td style="color: #10b981; font-weight: 600;">${s.present_lectures || 0}</td>
            <td style="color: #ef4444; font-weight: 600;">${s.absent_lectures || 0}</td>
            <td style="font-weight: 700; color: ${isLow ? '#b45309' : '#10b981'};">${(s.attendance_percentage || 0).toFixed(2)}%</td>
            <td>${alertBadge}</td>
          `;
          tbody.appendChild(tr);
        });
      }

      openModal('courseAttendanceModal');
    } catch (err) {
      showToast(err.message || 'Error loading course attendance', 'error');
    }
  }

  /**
   * Open Delete Confirmation Modal
   */
  function openDeleteModal(id, studentName, date) {
    pendingDeleteId = id;
    confirmModalMessage.textContent = `Are you sure you want to delete the attendance log for ${studentName || 'Student'} on ${date}?`;
    openModal('confirmModal');
  }

  /**
   * Execute Deletion
   */
  confirmModalActionBtn.addEventListener('click', async () => {
    if (!pendingDeleteId) return;

    confirmModalActionBtn.disabled = true;
    confirmModalActionBtn.textContent = 'Deleting...';

    try {
      const res = await apiDelete(`/api/attendance/${pendingDeleteId}`);
      if (res.success) {
        showToast('Attendance deleted successfully', 'success');
        closeModal('confirmModal');
        await Promise.all([
          loadAttendance(currentPage),
          loadAttendanceSummary()
        ]);
      } else {
        showToast(res.message || 'Failed to delete record', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error deleting attendance record', 'error');
    } finally {
      confirmModalActionBtn.disabled = false;
      confirmModalActionBtn.textContent = 'Delete Record';
      pendingDeleteId = null;
    }
  });

  /**
   * Setup Toolbar, Quick Actions & Filter Events
   */
  function setupEventListeners() {
    // Search debouncing
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadAttendance(1);
      }, 300);
    });

    // Toolbar apply & clear
    applyFiltersBtn.addEventListener('click', () => loadAttendance(1));

    clearFiltersBtn.addEventListener('click', () => {
      searchInput.value = '';
      filterStudentSelect.value = '';
      filterCourseSelect.value = '';
      filterTeacherSelect.value = '';
      filterStatusSelect.value = '';
      filterDateFromInput.value = '';
      filterDateToInput.value = '';
      loadAttendance(1);
    });

    // Refresh
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      await Promise.all([
        loadAttendanceSummary(),
        loadAttendance(currentPage)
      ]);
      refreshBtn.disabled = false;
      showToast('Attendance data refreshed', 'info');
    });

    // Pagination
    prevPageBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        loadAttendance(currentPage - 1);
      }
    });

    nextPageBtn.addEventListener('click', () => {
      loadAttendance(currentPage + 1);
    });

    // KPI Low Attendance Card Click
    kpiLowAttendanceCard.addEventListener('click', () => {
      lowAttendanceSection.scrollIntoView({ behavior: 'smooth' });
      lowAttendanceSection.style.transition = 'outline 0.3s ease';
      lowAttendanceSection.style.outline = '2px solid #f59e0b';
      setTimeout(() => {
        lowAttendanceSection.style.outline = 'none';
      }, 1500);
    });

    // Quick Actions
    qaRecordAttendanceBtn.addEventListener('click', triggerAddModal);

    qaStudentAttendanceBtn.addEventListener('click', () => {
      if (allStudents.length > 0) {
        openStudentAttendanceModal(allStudents[0].student_id);
      } else {
        showToast('No students registered yet', 'info');
      }
    });

    qaCourseAttendanceBtn.addEventListener('click', () => {
      if (allCourses.length > 0) {
        openCourseAttendanceModal(allCourses[0].course_id);
      } else {
        showToast('No courses registered yet', 'info');
      }
    });

    qaLowAttendanceBtn.addEventListener('click', () => {
      lowAttendanceSection.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
