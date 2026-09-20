/**
 * Student Attendance Controller - Student Information Portal
 * Handles student attendance overview, course-wise attendance metrics,
 * and daily lecture tracking logs.
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
  const kpiOverallAttendance = document.getElementById('kpiOverallAttendance');
  const kpiTotalLectures = document.getElementById('kpiTotalLectures');
  const kpiAttendedLectures = document.getElementById('kpiAttendedLectures');
  const kpiMissedLectures = document.getElementById('kpiMissedLectures');
  const attendanceGaugeCircle = document.getElementById('attendanceGaugeCircle');
  const gaugePct = document.getElementById('gaugePct');
  const attendanceStatusBadge = document.getElementById('attendanceStatusBadge');

  const statPresent = document.getElementById('statPresent');
  const statAbsent = document.getElementById('statAbsent');
  const statLate = document.getElementById('statLate');
  const statTotal = document.getElementById('statTotal');

  const courseAttendanceTbody = document.getElementById('courseAttendanceTbody');
  const courseAttendanceCardsMobile = document.getElementById('courseAttendanceCardsMobile');
  const attendanceLogsTbody = document.getElementById('attendanceLogsTbody');
  const attendanceLogsCardsMobile = document.getElementById('attendanceLogsCardsMobile');

  const filterSemester = document.getElementById('filterSemester');
  const btnRefreshAttendance = document.getElementById('btnRefreshAttendance');

  // Filter toolbar DOM elements
  const filterLogSemester = document.getElementById('filterLogSemester');
  const filterLogCourse = document.getElementById('filterLogCourse');
  const filterLogLectureType = document.getElementById('filterLogLectureType');
  const filterLogStatus = document.getElementById('filterLogStatus');
  const filterLogFaculty = document.getElementById('filterLogFaculty');
  const filterLogDate = document.getElementById('filterLogDate');
  const btnApplyLogFilters = document.getElementById('btnApplyLogFilters');
  const btnClearLogFilters = document.getElementById('btnClearLogFilters');
  const filterResultsCount = document.getElementById('filterResultsCount');
  const activeFilterSummary = document.getElementById('activeFilterSummary');

  let cachedAttendanceData = null;

  function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatTimeTo12Hour(timeStr) {
    if (!timeStr) return '';
    const parts = String(timeStr).split(':');
    if (parts.length < 2) return timeStr;
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    if (isNaN(hours)) return timeStr;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = hours < 10 ? '0' + hours : String(hours);
    return `${strHours}:${minutes} ${ampm}`;
  }

  function formatTimeRange(start, end) {
    if (!start && !end) return '';
    const s = formatTimeTo12Hour(start);
    const e = formatTimeTo12Hour(end);
    if (s && e) return `${s} - ${e}`;
    return s || e;
  }

  const SEMESTER_ROMAN_MAP = {
    '1': ['1', 'i', 'sem 1', 'semester 1', 'semester i', 'term 1', 'term i'],
    '2': ['2', 'ii', 'sem 2', 'semester 2', 'semester ii', 'term 2', 'term ii'],
    '3': ['3', 'iii', 'sem 3', 'semester 3', 'semester iii', 'term 3', 'term iii'],
    '4': ['4', 'iv', 'sem 4', 'semester 4', 'semester iv', 'term 4', 'term iv'],
    '5': ['5', 'v', 'sem 5', 'semester 5', 'semester v', 'term 5', 'term v'],
    '6': ['6', 'vi', 'sem 6', 'semester 6', 'semester vi', 'term 6', 'term vi'],
    '7': ['7', 'vii', 'sem 7', 'semester 7', 'semester vii', 'term 7', 'term vii'],
    '8': ['8', 'viii', 'sem 8', 'semester 8', 'semester viii', 'term 8', 'term viii']
  };

  function matchesSemester(courseSemester, selectedSemester) {
    if (!selectedSemester) return true;
    if (courseSemester === null || courseSemester === undefined) return false;
    const cStr = String(courseSemester).trim().toLowerCase();
    const sStr = String(selectedSemester).trim().toLowerCase();
    if (cStr === sStr) return true;

    let targetKey = null;
    for (const [key, variants] of Object.entries(SEMESTER_ROMAN_MAP)) {
      if (sStr === key || variants.includes(sStr)) {
        targetKey = key;
        break;
      }
    }
    if (!targetKey) {
      return cStr === sStr;
    }

    const variants = SEMESTER_ROMAN_MAP[targetKey];
    if (cStr === targetKey || variants.includes(cStr)) return true;
    for (const v of variants) {
      if (cStr.includes(v)) return true;
    }
    return false;
  }

  function getLogDateString(dateVal) {
    if (!dateVal) return '';
    if (typeof dateVal === 'string') {
      const match = dateVal.match(/^\d{4}-\d{2}-\d{2}/);
      if (match) return match[0];
    }
    try {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (e) {}
    return '';
  }

  function getLogDisplayDate(dateVal) {
    if (!dateVal) return '-';
    try {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString();
      }
    } catch (e) {}
    return String(dateVal);
  }

  function getLogSemester(log, courses) {
    if (log.course_semester !== undefined && log.course_semester !== null && log.course_semester !== '') {
      return log.course_semester;
    }
    if (log.semester !== undefined && log.semester !== null && log.semester !== '') {
      return log.semester;
    }
    if (courses && courses.length && log.course_id) {
      const matched = courses.find(c => String(c.course_id) === String(log.course_id));
      if (matched) return matched.course_semester !== undefined ? matched.course_semester : matched.semester;
    }
    return null;
  }

  function populateLogCourseOptions(courses) {
    if (!filterLogCourse) return;
    const currentVal = filterLogCourse.value;
    const courseMap = new Map();
    (courses || []).forEach(c => {
      if (c.course_id) {
        const code = c.course_code ? `${c.course_code} - ` : '';
        const name = c.course_name || c.name || 'Course';
        courseMap.set(String(c.course_id), `${code}${name}`);
      }
    });
    let html = '<option value="">All Courses</option>';
    for (const [id, label] of courseMap.entries()) {
      html += `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;
    }
    filterLogCourse.innerHTML = html;
    if (currentVal && courseMap.has(currentVal)) {
      filterLogCourse.value = currentVal;
    }
  }

  let cachedDepartmentFaculty = [];

  function populateLogFacultyOptions(facultyList) {
    if (!filterLogFaculty) return;
    const currentVal = filterLogFaculty.value;

    let list = Array.isArray(facultyList) && facultyList.length > 0 ? facultyList : cachedDepartmentFaculty;
    if (Array.isArray(facultyList) && facultyList.length > 0) {
      cachedDepartmentFaculty = facultyList;
    }

    // Deduplicate and filter active names
    const facultyMap = new Map();
    (list || []).forEach(f => {
      const name = (typeof f === 'string' ? f : (f.teacher_name || `${f.first_name || ''} ${f.last_name || ''}`)).trim();
      if (name && !facultyMap.has(name.toLowerCase())) {
        facultyMap.set(name.toLowerCase(), name);
      }
    });

    // Sort alphabetically by faculty name
    const sortedNames = Array.from(facultyMap.values()).sort((a, b) => a.localeCompare(b));

    let html = '<option value="">All Faculty</option>';
    sortedNames.forEach(facName => {
      html += `<option value="${escapeHtml(facName)}">${escapeHtml(facName)}</option>`;
    });

    filterLogFaculty.innerHTML = html;
    if (currentVal && facultyMap.has(currentVal.toLowerCase())) {
      filterLogFaculty.value = facultyMap.get(currentVal.toLowerCase());
    }
  }

  async function loadDepartmentFaculty() {
    try {
      const res = await fetch('/api/attendance/department-faculty', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.success && Array.isArray(json.data?.faculty) && json.data.faculty.length > 0) {
          cachedDepartmentFaculty = json.data.faculty;
          populateLogFacultyOptions(cachedDepartmentFaculty);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch department faculty list:', e);
    }
  }

  async function loadStudentAttendance() {
    try {
      const res = await fetch('/api/attendance/student/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        renderErrorAttendanceState();
        return;
      }

      const json = await res.json();
      if (json && json.success && json.data) {
        cachedAttendanceData = json.data;
        if (Array.isArray(json.data.departmentFaculty) && json.data.departmentFaculty.length > 0) {
          cachedDepartmentFaculty = json.data.departmentFaculty;
        } else if (Array.isArray(json.data.faculty) && json.data.faculty.length > 0) {
          cachedDepartmentFaculty = json.data.faculty;
        }
        renderAttendanceData(json.data);
        if (!cachedDepartmentFaculty || cachedDepartmentFaculty.length === 0) {
          loadDepartmentFaculty();
        }
      } else {
        renderDefaultAttendanceState();
      }
    } catch (err) {
      console.error('Failed to load student attendance:', err);
      renderErrorAttendanceState();
    }
  }

  function renderErrorAttendanceState() {
    if (courseAttendanceTbody) {
      courseAttendanceTbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px 16px;">
            <div style="color: #b91c1c; font-weight: 600; margin-bottom: 8px;">Unable to load attendance records</div>
            <button type="button" class="btn btn-primary btn-sm" id="btnRetryAttendanceTable">Retry</button>
          </td>
        </tr>`;
      document.getElementById('btnRetryAttendanceTable')?.addEventListener('click', loadStudentAttendance);
    }
    if (courseAttendanceCardsMobile) {
      courseAttendanceCardsMobile.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: #b91c1c; background: #ffffff; border: 1px dashed #fca5a5; border-radius: 8px;">
          Unable to load attendance records.
        </div>`;
    }
  }

  function renderAttendanceData(data) {
    const overallStats = data.overallStats || {};
    let courses = Array.isArray(data.courses) ? data.courses : [];

    // Filter courses by semester if selected
    const selectedSemester = filterSemester ? filterSemester.value : '';
    if (selectedSemester) {
      courses = courses.filter(c => matchesSemester(c.course_semester || c.semester, selectedSemester));
    }

    // Calculation: Strictly (Present + Late) / Total * 100
    const totalScheduled = parseInt(overallStats.total_lectures || 0, 10);
    const presentCount = parseInt(overallStats.present_lectures || 0, 10);
    const lateCount = parseInt(overallStats.late_lectures || 0, 10);
    const absentCount = parseInt(overallStats.absent_lectures || 0, 10);
    const excusedCount = parseInt(overallStats.excused_lectures || 0, 10);
    const attendedCount = presentCount + lateCount;

    const overallPct = totalScheduled > 0
      ? ((attendedCount / totalScheduled) * 100).toFixed(1)
      : (overallStats.overall_percentage !== undefined && overallStats.overall_percentage !== null
          ? Number(overallStats.overall_percentage).toFixed(1)
          : '0.0');

    // KPI Cards
    if (kpiOverallAttendance) kpiOverallAttendance.textContent = `${overallPct}%`;
    if (kpiTotalLectures) kpiTotalLectures.textContent = totalScheduled;
    if (kpiAttendedLectures) kpiAttendedLectures.textContent = attendedCount;
    if (kpiMissedLectures) kpiMissedLectures.textContent = absentCount;

    // Attendance Gauge & Statistics List
    if (gaugePct) gaugePct.textContent = `${overallPct}%`;
    if (statPresent) statPresent.textContent = presentCount;
    if (statAbsent) statAbsent.textContent = absentCount;
    if (statLate) statLate.textContent = lateCount + excusedCount;
    if (statTotal) statTotal.textContent = totalScheduled;

    if (attendanceGaugeCircle) {
      attendanceGaugeCircle.style.background = `conic-gradient(var(--primary-600, #4f46e5) 0% ${overallPct}%, var(--slate-100, #f1f5f9) ${overallPct}% 100%)`;
      attendanceGaugeCircle.setAttribute('aria-label', `Attendance ${overallPct}%`);
    }

    // Status Banner
    if (attendanceStatusBadge) {
      if (totalScheduled === 0) {
        attendanceStatusBadge.className = 'attendance-status-badge';
        attendanceStatusBadge.style.backgroundColor = 'var(--stu-bg, #f8fafc)';
        attendanceStatusBadge.style.color = 'var(--stu-text-muted, #64748b)';
        attendanceStatusBadge.innerHTML = '<span>No attendance records recorded yet</span>';
      } else if (parseFloat(overallPct) >= 75) {
        attendanceStatusBadge.className = 'attendance-status-badge badge-satisfactory';
        attendanceStatusBadge.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <span>Good Standing (Above institutional requirement of 75%)</span>`;
      } else {
        attendanceStatusBadge.className = 'attendance-status-badge badge-danger';
        attendanceStatusBadge.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Defaulter Warning: Attendance below 75% requirement</span>`;
      }
    }

    // 1. Course-wise Breakdown Table & Mobile Cards
    if (courseAttendanceTbody) {
      if (!courses || courses.length === 0) {
        courseAttendanceTbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 40px 16px; color: var(--stu-text-muted, #64748b);">
              No course attendance records found.
            </td>
          </tr>`;
      } else {
        courseAttendanceTbody.innerHTML = courses.map(c => {
          const cTotal = parseInt(c.total_lectures || 0, 10);
          const cPresent = parseInt(c.present_lectures || 0, 10);
          const cLate = parseInt(c.late_lectures || 0, 10);
          const cAttended = cPresent + cLate;
          const cAbsent = parseInt(c.absent_lectures || 0, 10);

          const cPct = cTotal > 0
            ? ((cAttended / cTotal) * 100).toFixed(1)
            : (c.attendance_percentage !== null && c.attendance_percentage !== undefined
                ? Number(c.attendance_percentage).toFixed(1)
                : '0.0');

          const badgeClass = cTotal === 0 ? 'badge-secondary' : (parseFloat(cPct) >= 75 ? 'badge-success' : 'badge-danger');
          const statusText = cTotal === 0 ? 'No Classes' : (parseFloat(cPct) >= 75 ? 'Satisfactory' : 'Defaulter');

          return `
            <tr>
              <td class="font-medium" style="font-weight: 600; color: #1d4ed8;">${escapeHtml(c.course_code || '-')}</td>
              <td style="font-weight: 500; color: #0f172a;">${escapeHtml(c.course_name || '-')}</td>
              <td class="text-center" style="font-weight: 500;">${escapeHtml(cTotal)}</td>
              <td class="text-center font-medium" style="color: #16a34a; font-weight: 600;">${escapeHtml(cAttended)}</td>
              <td class="text-center font-medium" style="color: #dc2626; font-weight: 600;">${escapeHtml(cAbsent)}</td>
              <td class="text-center font-bold" style="font-weight: 700; color: #0f172a;">${cPct}%</td>
              <td class="text-center"><span class="badge ${badgeClass}">${statusText}</span></td>
            </tr>`;
        }).join('');
      }
    }

    if (courseAttendanceCardsMobile) {
      if (!courses || courses.length === 0) {
        courseAttendanceCardsMobile.innerHTML = `
          <div style="text-align: center; padding: 32px 16px; color: var(--stu-text-muted, #64748b); background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
            No course attendance records found.
          </div>`;
      } else {
        courseAttendanceCardsMobile.innerHTML = courses.map(c => {
          const cTotal = parseInt(c.total_lectures || 0, 10);
          const cPresent = parseInt(c.present_lectures || 0, 10);
          const cLate = parseInt(c.late_lectures || 0, 10);
          const cAttended = cPresent + cLate;
          const cAbsent = parseInt(c.absent_lectures || 0, 10);

          const cPct = cTotal > 0
            ? ((cAttended / cTotal) * 100).toFixed(1)
            : (c.attendance_percentage !== null && c.attendance_percentage !== undefined
                ? Number(c.attendance_percentage).toFixed(1)
                : '0.0');

          const badgeClass = cTotal === 0 ? 'badge-secondary' : (parseFloat(cPct) >= 75 ? 'badge-success' : 'badge-danger');
          const statusText = cTotal === 0 ? 'No Classes' : (parseFloat(cPct) >= 75 ? 'Satisfactory' : 'Defaulter');

          return `
            <div class="course-breakdown-card">
              <div class="course-card-header">
                <div>
                  <span class="course-card-code">${escapeHtml(c.course_code || '-')}</span>
                  <h4 class="course-card-title">${escapeHtml(c.course_name || '-')}</h4>
                </div>
                <span class="badge ${badgeClass}">${statusText}</span>
              </div>
              <div class="course-card-stats">
                <div class="course-stat-item">
                  <span class="course-stat-label">Total Lectures</span>
                  <span class="course-stat-val">${escapeHtml(cTotal)}</span>
                </div>
                <div class="course-stat-item">
                  <span class="course-stat-label">Attended</span>
                  <span class="course-stat-val" style="color: #16a34a; font-weight: 600;">${escapeHtml(cAttended)}</span>
                </div>
                <div class="course-stat-item">
                  <span class="course-stat-label">Absent</span>
                  <span class="course-stat-val" style="color: #dc2626; font-weight: 600;">${escapeHtml(cAbsent)}</span>
                </div>
                <div class="course-stat-item">
                  <span class="course-stat-label">Percentage</span>
                  <span class="course-stat-pct" style="color: ${parseFloat(cPct) >= 75 ? '#16a34a' : (cTotal === 0 ? '#64748b' : '#dc2626')}; font-weight: 700;">${cPct}%</span>
                </div>
              </div>
            </div>`;
        }).join('');
      }
    }

    // Populate dynamic filter options: enrolled courses and authoritative department faculty
    populateLogCourseOptions(data.courses);
    const deptFaculty = (Array.isArray(data.departmentFaculty) && data.departmentFaculty.length > 0)
      ? data.departmentFaculty
      : ((Array.isArray(data.faculty) && data.faculty.length > 0) ? data.faculty : cachedDepartmentFaculty);
    populateLogFacultyOptions(deptFaculty);

    // Apply Recent Logs filters and render
    applyRecentLogFilters();
  }

  function applyRecentLogFilters() {
    if (!cachedAttendanceData) return;
    const allLogs = Array.isArray(cachedAttendanceData.recentLogs) ? cachedAttendanceData.recentLogs : [];
    const courses = Array.isArray(cachedAttendanceData.courses) ? cachedAttendanceData.courses : [];

    const selSemester = filterLogSemester ? filterLogSemester.value.trim() : '';
    const selCourse = filterLogCourse ? filterLogCourse.value.trim() : '';
    const selType = filterLogLectureType ? filterLogLectureType.value.trim().toLowerCase() : '';
    const selStatus = filterLogStatus ? filterLogStatus.value.trim().toLowerCase() : '';
    const selFaculty = filterLogFaculty ? filterLogFaculty.value.trim().toLowerCase() : '';
    const selDate = filterLogDate ? filterLogDate.value.trim() : '';

    const filtered = allLogs.filter(log => {
      // 1. Semester filter
      if (selSemester) {
        const sem = getLogSemester(log, courses);
        if (!matchesSemester(sem, selSemester)) return false;
      }

      // 2. Course filter
      if (selCourse) {
        const matchId = String(log.course_id) === selCourse;
        const matchCode = log.course_code && String(log.course_code).toLowerCase() === selCourse.toLowerCase();
        if (!matchId && !matchCode) return false;
      }

      // 3. Lecture Type filter
      if (selType) {
        const lt = String(log.lecture_type || '').toLowerCase();
        if (selType === 'regular' && !lt.includes('regular')) return false;
        if (selType === 'lab' && (!lt.includes('lab') && !lt.includes('practical'))) return false;
        if (selType === 'extra' && (!lt.includes('extra') && !lt.includes('additional'))) return false;
        if (selType === 'makeup' && (!lt.includes('makeup') && !lt.includes('make-up'))) return false;
        if (!['regular', 'lab', 'extra', 'makeup'].includes(selType) && !lt.includes(selType)) return false;
      }

      // 4. Attendance Status filter
      if (selStatus) {
        const st = String(log.status || '').toLowerCase();
        if (st !== selStatus) return false;
      }

      // 5. Faculty filter
      if (selFaculty) {
        const fac = String(log.teacher_name || '').trim().toLowerCase();
        const matchFaculty = fac === selFaculty || fac.includes(selFaculty) || selFaculty.includes(fac);
        if (!matchFaculty) return false;
      }

      // 6. Date filter (format: YYYY-MM-DD)
      if (selDate) {
        const d = getLogDateString(log.attendance_date);
        if (d !== selDate) return false;
      }

      return true;
    });

    renderFilteredLogs(filtered, allLogs.length);
  }

  function clearRecentLogFilters() {
    if (filterLogSemester) filterLogSemester.value = '';
    if (filterLogCourse) filterLogCourse.value = '';
    if (filterLogLectureType) filterLogLectureType.value = '';
    if (filterLogStatus) filterLogStatus.value = '';
    if (filterLogFaculty) filterLogFaculty.value = '';
    if (filterLogDate) filterLogDate.value = '';
    applyRecentLogFilters();
  }

  function renderFilteredLogs(logs, totalCount) {
    // 1. Update filter indicators
    const isFiltered = totalCount > 0 && logs.length !== totalCount;
    if (filterResultsCount) {
      if (totalCount === 0) {
        filterResultsCount.textContent = 'Showing 0 records';
      } else if (isFiltered) {
        filterResultsCount.textContent = `Showing ${logs.length} of ${totalCount} records`;
      } else {
        filterResultsCount.textContent = `Showing all ${totalCount} records`;
      }
    }

    if (activeFilterSummary) {
      const activeLabels = [];
      if (filterLogSemester && filterLogSemester.value) {
        const opt = filterLogSemester.options[filterLogSemester.selectedIndex];
        activeLabels.push(opt ? opt.text : `Sem ${filterLogSemester.value}`);
      }
      if (filterLogCourse && filterLogCourse.value) {
        const opt = filterLogCourse.options[filterLogCourse.selectedIndex];
        activeLabels.push(opt ? opt.text.split(' - ')[0] : 'Course');
      }
      if (filterLogLectureType && filterLogLectureType.value) {
        const opt = filterLogLectureType.options[filterLogLectureType.selectedIndex];
        activeLabels.push(opt ? opt.text : filterLogLectureType.value);
      }
      if (filterLogStatus && filterLogStatus.value) {
        activeLabels.push(filterLogStatus.value);
      }
      if (filterLogFaculty && filterLogFaculty.value) {
        activeLabels.push(filterLogFaculty.value);
      }
      if (filterLogDate && filterLogDate.value) {
        activeLabels.push(filterLogDate.value);
      }

      if (activeLabels.length > 0) {
        activeFilterSummary.textContent = `${logs.length} matching log${logs.length === 1 ? '' : 's'} found (Filtered by: ${activeLabels.join(' • ')})`;
      } else {
        activeFilterSummary.textContent = 'All logs displayed';
      }
    }

    // 2. Desktop Table Rows
    if (attendanceLogsTbody) {
      if (!logs || logs.length === 0) {
        attendanceLogsTbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 40px 16px; color: var(--stu-text-muted, #64748b);">
              No attendance records found for the selected filters.
              <button type="button" class="btn btn-secondary btn-sm" id="btnResetInlineFilters" style="margin-left: 8px; padding: 4px 10px; font-size: 12px;">Reset Filters</button>
            </td>
          </tr>`;
        document.getElementById('btnResetInlineFilters')?.addEventListener('click', clearRecentLogFilters);
      } else {
        attendanceLogsTbody.innerHTML = logs.map(log => {
          const dateStr = getLogDisplayDate(log.attendance_date);
          const courseDisplay = `${escapeHtml(log.course_code || '')} - ${escapeHtml(log.course_name || 'Course')}`;

          const lt = log.lecture_type || 'Regular Lecture';
          let typeBadgeStyle = 'background: #e0e7ff; color: #3730a3;';
          if (lt.includes('Extra')) {
            typeBadgeStyle = 'background: #f3e8ff; color: #6b21a8;';
          } else if (lt.includes('Practical') || lt.includes('Lab')) {
            typeBadgeStyle = 'background: #ccfbf1; color: #0f766e;';
          } else if (lt.includes('Makeup')) {
            typeBadgeStyle = 'background: #fef3c7; color: #92400e;';
          }

          const timeDisplay = log.time_range || formatTimeRange(log.start_time, log.end_time) || log.start_time_12h || log.session_name || '-';

          let stStyle = 'background: #f1f5f9; color: #475569;';
          const normStatus = String(log.status || '').toLowerCase();
          if (normStatus === 'present') stStyle = 'background: #dcfce7; color: #15803d;';
          else if (normStatus === 'absent') stStyle = 'background: #fee2e2; color: #991b1b;';
          else if (normStatus === 'late') stStyle = 'background: #fef3c7; color: #b45309;';
          else if (normStatus === 'excused') stStyle = 'background: #e0f2fe; color: #0369a1;';

          return `
            <tr>
              <td style="font-weight: 600; color: #0f172a;">${escapeHtml(dateStr)}</td>
              <td style="color: #1d4ed8; font-weight: 600;">${courseDisplay}</td>
              <td class="text-center">
                <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; ${typeBadgeStyle}">
                  ${escapeHtml(lt)}
                </span>
              </td>
              <td style="font-weight: 500; color: #334155; white-space: nowrap;">${escapeHtml(timeDisplay)}</td>
              <td style="color: #475569;">${escapeHtml(log.teacher_name || 'Faculty')}</td>
              <td class="text-center">
                <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; ${stStyle}">
                  ${escapeHtml(log.status)}
                </span>
              </td>
              <td style="color: #64748b;">${escapeHtml(log.remarks || '-')}</td>
            </tr>`;
        }).join('');
      }
    }

    // 3. Mobile Cards View
    if (attendanceLogsCardsMobile) {
      if (!logs || logs.length === 0) {
        attendanceLogsCardsMobile.innerHTML = `
          <div style="text-align: center; padding: 32px 16px; color: #64748b; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
            <p style="margin: 0 0 10px 0; font-size: 13px;">No attendance records found for the selected filters.</p>
            <button type="button" class="btn btn-secondary btn-sm" id="btnResetMobileInlineFilters" style="padding: 5px 12px; font-size: 12px;">Reset Filters</button>
          </div>`;
        document.getElementById('btnResetMobileInlineFilters')?.addEventListener('click', clearRecentLogFilters);
      } else {
        attendanceLogsCardsMobile.innerHTML = logs.map(log => {
          const dateStr = getLogDisplayDate(log.attendance_date);
          const courseDisplay = `${escapeHtml(log.course_code || '')} - ${escapeHtml(log.course_name || 'Course')}`;

          const lt = log.lecture_type || 'Regular Lecture';
          let typeBadgeStyle = 'background: #e0e7ff; color: #3730a3;';
          if (lt.includes('Extra')) {
            typeBadgeStyle = 'background: #f3e8ff; color: #6b21a8;';
          } else if (lt.includes('Practical') || lt.includes('Lab')) {
            typeBadgeStyle = 'background: #ccfbf1; color: #0f766e;';
          } else if (lt.includes('Makeup')) {
            typeBadgeStyle = 'background: #fef3c7; color: #92400e;';
          }

          const timeDisplay = log.time_range || formatTimeRange(log.start_time, log.end_time) || log.start_time_12h || log.session_name || '-';

          let stStyle = 'background: #f1f5f9; color: #475569;';
          const normStatus = String(log.status || '').toLowerCase();
          if (normStatus === 'present') stStyle = 'background: #dcfce7; color: #15803d;';
          else if (normStatus === 'absent') stStyle = 'background: #fee2e2; color: #991b1b;';
          else if (normStatus === 'late') stStyle = 'background: #fef3c7; color: #b45309;';
          else if (normStatus === 'excused') stStyle = 'background: #e0f2fe; color: #0369a1;';

          return `
            <div class="session-log-card">
              <div class="session-card-header">
                <span class="session-card-date">${escapeHtml(dateStr)}</span>
                <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; ${stStyle}">
                  ${escapeHtml(log.status)}
                </span>
              </div>
              <div class="session-card-course">${courseDisplay}</div>
              <div class="session-card-meta">
                <span class="session-card-meta-item">
                  <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; ${typeBadgeStyle}">
                    ${escapeHtml(lt)}
                  </span>
                </span>
                <span class="session-card-meta-item" title="Time slot">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                  <span>${escapeHtml(timeDisplay)}</span>
                </span>
                <span class="session-card-meta-item" title="Faculty member">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  <span>${escapeHtml(log.teacher_name || 'Faculty')}</span>
                </span>
              </div>
              ${log.remarks ? `<div class="session-card-remarks">${escapeHtml(log.remarks)}</div>` : ''}
            </div>`;
        }).join('');
      }
    }
  }

  function renderDefaultAttendanceState() {
    if (kpiOverallAttendance) kpiOverallAttendance.textContent = '--';
    if (kpiTotalLectures) kpiTotalLectures.textContent = '0';
    if (kpiAttendedLectures) kpiAttendedLectures.textContent = '0';
    if (kpiMissedLectures) kpiMissedLectures.textContent = '0';

    if (gaugePct) gaugePct.textContent = '--';
    if (statPresent) statPresent.textContent = '0';
    if (statAbsent) statAbsent.textContent = '0';
    if (statLate) statLate.textContent = '0';
    if (statTotal) statTotal.textContent = '0';

    if (attendanceGaugeCircle) {
      attendanceGaugeCircle.style.background = '#e2e8f0';
    }

    if (attendanceStatusBadge) {
      attendanceStatusBadge.className = 'attendance-status-badge';
      attendanceStatusBadge.style.backgroundColor = 'var(--stu-bg, #f8fafc)';
      attendanceStatusBadge.style.color = 'var(--stu-text-muted, #64748b)';
      attendanceStatusBadge.innerHTML = '<span>No attendance records available for this term</span>';
    }

    if (courseAttendanceTbody) {
      courseAttendanceTbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px 16px; color: var(--stu-text-muted, #64748b);">
            No course attendance records found. Records will appear here once attendance sessions are logged by faculty.
          </td>
        </tr>`;
    }

    if (courseAttendanceCardsMobile) {
      courseAttendanceCardsMobile.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: var(--stu-text-muted, #64748b); background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
          No course attendance records found. Records will appear here once attendance sessions are logged by faculty.
        </div>`;
    }

    if (attendanceLogsTbody) {
      attendanceLogsTbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px 16px; color: var(--stu-text-muted, #64748b);">
            No attendance activity logs recorded yet.
          </td>
        </tr>`;
    }

    if (attendanceLogsCardsMobile) {
      attendanceLogsCardsMobile.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: #64748b; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
          No attendance activity logs recorded yet.
        </div>`;
    }

    if (filterResultsCount) {
      filterResultsCount.textContent = 'Showing 0 records';
    }

    if (activeFilterSummary) {
      activeFilterSummary.textContent = 'No logs available';
    }
  }

  if (btnRefreshAttendance) {
    btnRefreshAttendance.addEventListener('click', () => {
      loadStudentAttendance();
      if (typeof showToast === 'function') showToast('Attendance records refreshed', 'info');
    });
  }

  if (filterSemester) {
    filterSemester.addEventListener('change', () => {
      if (cachedAttendanceData) {
        renderAttendanceData(cachedAttendanceData);
      } else {
        loadStudentAttendance();
      }
    });
  }

  if (btnApplyLogFilters) {
    btnApplyLogFilters.addEventListener('click', applyRecentLogFilters);
  }

  if (btnClearLogFilters) {
    btnClearLogFilters.addEventListener('click', clearRecentLogFilters);
  }

  [filterLogSemester, filterLogCourse, filterLogLectureType, filterLogStatus, filterLogFaculty].forEach(el => {
    if (el) el.addEventListener('change', applyRecentLogFilters);
  });
  if (filterLogDate) {
    filterLogDate.addEventListener('input', applyRecentLogFilters);
    filterLogDate.addEventListener('change', applyRecentLogFilters);
  }

  // =========================================================================
  // DYNAMIC QR ATTENDANCE & CAMERA SCANNER CONTROLLER (STEP 6)
  // =========================================================================

  const studentQrSection = document.getElementById('studentQrAttendanceSection');
  const studentQrSessionBadge = document.getElementById('studentQrSessionBadge');
  const studentQrBody = document.getElementById('studentQrBody');
  const btnRefreshActiveQRSession = document.getElementById('btnRefreshActiveQRSession');

  const qrScannerModal = document.getElementById('qrScannerModal');
  const qrScannerVideo = document.getElementById('qrScannerVideo');
  const qrScannerCanvas = document.getElementById('qrScannerCanvas');
  const qrCameraOverlay = document.getElementById('qrCameraOverlay');
  const qrCameraOverlayContent = document.getElementById('qrCameraOverlayContent');
  const qrScannerFeedback = document.getElementById('qrScannerFeedback');
  const scannerFeedbackBadge = document.getElementById('scannerFeedbackBadge');
  const scannerFeedbackText = document.getElementById('scannerFeedbackText');
  const qrScannerErrorAlert = document.getElementById('qrScannerErrorAlert');
  const qrScannerErrorMessage = document.getElementById('qrScannerErrorMessage');
  const btnRetryCamera = document.getElementById('btnRetryCamera');
  const btnCloseQrScanner = document.getElementById('btnCloseQrScanner');
  const btnCloseQrScannerX = document.getElementById('btnCloseQrScannerX');

  let activeStudentQRSession = null;
  let qrCountdownTimer = null;
  let remainingSessionSeconds = 0;

  let cameraMediaStream = null;
  let scanAnimationRequestId = null;
  let isScanningActive = false;
  let isProcessingScanSubmission = false;
  let nativeBarcodeDetector = null;

  /**
   * Format seconds to MM:SS string
   */
  function formatSecondsToMMSS(seconds) {
    if (isNaN(seconds) || seconds <= 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    const mm = m < 10 ? '0' + m : String(m);
    const ss = s < 10 ? '0' + s : String(s);
    return `${mm}:${ss}`;
  }

  /**
   * Fetch active QR attendance session for current authenticated student
   * GET /api/attendance/qr/active-session
   */
  async function loadStudentActiveQRSession() {
    if (!studentQrBody) return;

    try {
      if (studentQrSessionBadge) {
        studentQrSessionBadge.className = 'badge';
        studentQrSessionBadge.style.background = '#f1f5f9';
        studentQrSessionBadge.style.color = '#64748b';
        studentQrSessionBadge.textContent = 'Checking...';
      }

      const res = await fetch('/api/attendance/qr/active-session', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.status === 401) {
        window.location.replace('/login.html');
        return;
      }

      if (!res.ok) {
        renderNoActiveSessionState('Unable to check active session status.');
        return;
      }

      const json = await res.json();
      if (json && json.success && json.data && json.data.active && json.data.session) {
        activeStudentQRSession = json.data.session;
        remainingSessionSeconds = parseInt(activeStudentQRSession.remaining_seconds || 0, 10);
        renderActiveSessionState(activeStudentQRSession);
      } else {
        activeStudentQRSession = null;
        if (qrCountdownTimer) {
          clearInterval(qrCountdownTimer);
          qrCountdownTimer = null;
        }
        renderNoActiveSessionState();
      }
    } catch (err) {
      console.error('Error fetching student active QR session:', err);
      renderNoActiveSessionState('Unable to connect to attendance service.');
    }
  }

  /**
   * Render No Active Session State
   */
  function renderNoActiveSessionState(customMessage) {
    if (studentQrSessionBadge) {
      studentQrSessionBadge.className = 'badge';
      studentQrSessionBadge.style.background = '#f1f5f9';
      studentQrSessionBadge.style.color = '#64748b';
      studentQrSessionBadge.textContent = 'No Active Session';
    }

    if (!studentQrBody) return;

    studentQrBody.innerHTML = `
      <div style="text-align: center; padding: 28px 20px; max-width: 520px; margin: 0 auto;">
        <div style="width: 52px; height: 52px; border-radius: 50%; background: #f1f5f9; color: #94a3b8; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px auto;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
        </div>
        <h4 style="font-size: 16px; font-weight: 700; color: #1e293b; margin: 0 0 6px 0;">No active attendance session.</h4>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 16px 0;">
          ${customMessage ? escapeHtml(customMessage) : 'There are currently no active QR attendance sessions open for your enrolled courses. When your professor starts attendance during lecture, it will appear here automatically.'}
        </p>
        <button type="button" id="btnCheckActiveQrSession" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 6px 14px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6"></path>
            <path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          <span>Check Again</span>
        </button>
      </div>
    `;

    document.getElementById('btnCheckActiveQrSession')?.addEventListener('click', loadStudentActiveQRSession);
  }

  /**
   * Render Active Session State (or Already Marked State)
   */
  function renderActiveSessionState(session) {
    if (!studentQrBody) return;

    if (qrCountdownTimer) {
      clearInterval(qrCountdownTimer);
      qrCountdownTimer = null;
    }

    const isAlreadyMarked = !!session.already_marked;

    if (isAlreadyMarked) {
      // 1. SUCCESS / ALREADY MARKED STATE
      if (studentQrSessionBadge) {
        studentQrSessionBadge.className = 'badge';
        studentQrSessionBadge.style.background = '#dcfce7';
        studentQrSessionBadge.style.color = '#15803d';
        studentQrSessionBadge.textContent = 'Attended (Present)';
      }

      studentQrBody.innerHTML = `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: #dcfce7; color: #16a34a; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div style="flex: 1; min-width: 220px;">
              <div style="font-size: 12px; font-weight: 700; color: #16a34a; text-transform: uppercase; letter-spacing: 0.5px;">Verification Confirmed</div>
              <h4 style="margin: 2px 0 0 0; font-size: 17px; font-weight: 700; color: #14532d;">Attendance Marked Successfully: PRESENT</h4>
              <p style="margin: 3px 0 0 0; font-size: 13px; color: #15803d;">Your attendance has been recorded for this lecture.</p>
            </div>
            <div>
              <span style="display: inline-block; padding: 4px 12px; background: #16a34a; color: #ffffff; border-radius: 9999px; font-size: 12px; font-weight: 700;">PRESENT</span>
            </div>
          </div>

          <div class="qr-info-grid" style="margin-top: 18px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));">
            <div class="qr-info-item" style="background: #ffffff; border-color: #bbf7d0;">
              <span class="qr-info-label" style="color: #15803d;">Course</span>
              <span class="qr-info-value" style="color: #14532d;">${escapeHtml(session.course_code)} - ${escapeHtml(session.course_name)}</span>
            </div>
            <div class="qr-info-item" style="background: #ffffff; border-color: #bbf7d0;">
              <span class="qr-info-label" style="color: #15803d;">Instructor</span>
              <span class="qr-info-value" style="color: #14532d;">${escapeHtml(session.teacher_name || 'Assigned Faculty')}</span>
            </div>
            <div class="qr-info-item" style="background: #ffffff; border-color: #bbf7d0;">
              <span class="qr-info-label" style="color: #15803d;">Date & Time</span>
              <span class="qr-info-value" style="color: #14532d;">${escapeHtml(session.session_date)} (${escapeHtml(formatTimeRange(session.start_time, session.end_time))})</span>
            </div>
            <div class="qr-info-item" style="background: #ffffff; border-color: #bbf7d0;">
              <span class="qr-info-label" style="color: #15803d;">Room / Lecture Type</span>
              <span class="qr-info-value" style="color: #14532d;">${escapeHtml(session.room_no || 'Campus Room')} • ${escapeHtml(session.lecture_type || 'Lecture')}</span>
            </div>
          </div>
          <div style="margin-top: 12px; font-size: 12px; color: #166534;">
            ✓ Your attendance metrics and session logs below have been refreshed.
          </div>
        </div>
      `;
      return;
    }

    // 2. ACTIVE SESSION OPEN - READY TO SCAN
    const isQrVisible = !!session.student_qr_visible && !!session.qr_token;
    const isExpired = remainingSessionSeconds <= 0;

    if (studentQrSessionBadge) {
      studentQrSessionBadge.className = 'badge';
      if (isExpired) {
        studentQrSessionBadge.style.background = '#fee2e2';
        studentQrSessionBadge.style.color = '#b91c1c';
        studentQrSessionBadge.textContent = 'Session Expired';
      } else if (isQrVisible) {
        studentQrSessionBadge.style.background = '#dcfce7';
        studentQrSessionBadge.style.color = '#15803d';
        studentQrSessionBadge.textContent = 'Active Session (QR Open)';
      } else {
        studentQrSessionBadge.style.background = '#dcfce7';
        studentQrSessionBadge.style.color = '#15803d';
        studentQrSessionBadge.textContent = 'Active Session';
      }
    }

    const timeRangeStr = formatTimeRange(session.start_time, session.end_time);

    studentQrBody.innerHTML = `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-size: 16px; font-weight: 700; color: #0f172a;">${escapeHtml(session.course_code)}: ${escapeHtml(session.course_name)}</span>
              <span style="padding: 2px 8px; background: #e0f2fe; color: #0369a1; border-radius: 9999px; font-size: 11.5px; font-weight: 600;">
                ${escapeHtml(session.lecture_type || 'Regular Lecture')}
              </span>
            </div>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">
              Instructor: <strong>${escapeHtml(session.teacher_name || 'Faculty Member')}</strong>
            </p>
          </div>

          <!-- Session Countdown and QR Availability Badges -->
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <!-- QR Availability Indicator (Requirement 6) -->
            <span id="studentQrAvailableBadge" class="badge" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; ${isQrVisible ? 'background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;' : 'background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1;'}">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: ${isQrVisible ? '#22c55e' : '#94a3b8'};"></span>
              <span>${isQrVisible ? 'QR available' : 'QR not available'}</span>
            </span>

            <!-- Session Countdown Badge -->
            <div id="studentQrCountdownBox" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 9999px; font-size: 13px; font-weight: 600; color: #334155;">
              <span class="pulse-dot" id="studentQrCountdownDot"></span>
              <span id="studentQrCountdownText">Loading...</span>
            </div>
          </div>
        </div>

        <div class="qr-info-grid">
          <div class="qr-info-item">
            <span class="qr-info-label">Lecture Date</span>
            <span class="qr-info-value">${escapeHtml(session.session_date)}</span>
          </div>
          <div class="qr-info-item">
            <span class="qr-info-label">Time Slot</span>
            <span class="qr-info-value">${escapeHtml(timeRangeStr || '-')}</span>
          </div>
          <div class="qr-info-item">
            <span class="qr-info-label">Room / Hall</span>
            <span class="qr-info-value">${escapeHtml(session.room_no || 'Classroom')}</span>
          </div>
          <div class="qr-info-item">
            <span class="qr-info-label">Status</span>
            <span class="qr-info-value" style="color: ${isExpired ? '#b91c1c' : '#15803d'};">
              ${isExpired ? 'Session Expired' : 'Open for Check-in'}
            </span>
          </div>
        </div>

        <!-- Student Dynamic QR Code (Displayed only when ON) -->
        ${isQrVisible ? `
          <div id="studentQrCardContainer" style="margin: 20px auto 14px auto; max-width: 270px; padding: 18px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div id="studentQrCodeTarget" style="width: 200px; height: 200px; margin: 0 auto; display: flex; align-items: center; justify-content: center;"></div>
            <div style="margin-top: 10px; font-size: 12px; font-weight: 600; color: #0d9488; display: inline-flex; align-items: center; gap: 5px;">
              <span class="pulse-dot"></span> Live Dynamic QR
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Visible to students during lecture</div>
          </div>
        ` : `
          <div id="studentQrHiddenNotice" style="margin: 18px 0 14px 0; padding: 14px 18px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; text-align: center;">
            <div style="font-size: 13.5px; font-weight: 700; color: #334155; margin-bottom: 3px;">QR Display Hidden on this Device</div>
            <div style="font-size: 12.5px; color: #64748b; line-height: 1.4;">
              Your instructor has hidden student-side QR display. Please scan the QR code projected on the instructor's screen using <strong>Scan with Camera</strong> or select an image using <strong>Scan from Image</strong>.
            </div>
          </div>
        `}

        <!-- Scanning Actions: [ Scan with Camera ] and [ Scan from Image ] -->
        <div style="margin-top: 18px; display: flex; justify-content: center; align-items: center; gap: 12px; flex-wrap: wrap;">
          <button type="button" id="btnOpenQrScanner" class="btn-scan-qr ${isExpired ? 'btn-scan-disabled' : ''}" ${isExpired ? 'disabled' : ''} title="${isExpired ? 'Attendance session expired' : 'Scan QR code with camera'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
              <circle cx="12" cy="13" r="4"></circle>
            </svg>
            <span>Scan with Camera</span>
          </button>

          <button type="button" id="btnScanFromImage" class="btn-scan-qr btn-scan-image ${isExpired ? 'btn-scan-disabled' : ''}" ${isExpired ? 'disabled' : ''} title="${isExpired ? 'Attendance session expired' : 'Scan QR code from saved image'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <span>Scan from Image</span>
          </button>
        </div>

        <div style="margin-top: 10px; font-size: 12px; color: #64748b; text-align: center;">
          ${isExpired
            ? 'Attendance session has expired. Scanning is disabled.'
            : (isQrVisible 
                ? 'Scan using your device camera, upload a saved photo/screenshot, or scan the lecture QR code.' 
                : 'Point your camera directly at the instructor’s screen or upload an image/screenshot of the QR code.')}
        </div>
      </div>
    `;

    // Initialize QR Code if visible
    if (isQrVisible && session.qr_token) {
      const qrTarget = document.getElementById('studentQrCodeTarget');
      if (qrTarget) {
        qrTarget.innerHTML = '';
        if (typeof window.QRCode !== 'undefined') {
          new window.QRCode(qrTarget, {
            text: session.qr_token,
            width: 200,
            height: 200,
            colorDark: '#0f172a',
            colorLight: '#ffffff',
            correctLevel: window.QRCode.CorrectLevel.M
          });
        }
      }
    }

    // Attach scan actions whenever session is active and unexpired
    if (!isExpired) {
      document.getElementById('btnOpenQrScanner')?.addEventListener('click', openQrScannerModal);
      document.getElementById('btnScanFromImage')?.addEventListener('click', () => {
        const fileInput = document.getElementById('qrImageFileInput');
        if (fileInput) {
          fileInput.value = '';
          fileInput.click();
        }
      });
    }

    // Start local countdown updater
    updateStudentQrCountdown();
    qrCountdownTimer = setInterval(updateStudentQrCountdown, 1000);
  }

  /**
   * Update student session countdown timer display
   */
  function updateStudentQrCountdown() {
    const countdownText = document.getElementById('studentQrCountdownText');
    const countdownDot = document.getElementById('studentQrCountdownDot');
    const countdownBox = document.getElementById('studentQrCountdownBox');

    if (!countdownText) return;

    if (remainingSessionSeconds <= 0) {
      if (qrCountdownTimer) {
        clearInterval(qrCountdownTimer);
        qrCountdownTimer = null;
      }
      countdownText.textContent = 'Session Expired';
      if (countdownDot) countdownDot.className = 'pulse-dot pulse-dot-red';
      if (countdownBox) {
        countdownBox.style.borderColor = '#fca5a5';
        countdownBox.style.background = '#fee2e2';
        countdownBox.style.color = '#b91c1c';
      }
      // Disable scanning actions on expiration
      const btnCam = document.getElementById('btnOpenQrScanner');
      if (btnCam) {
        btnCam.disabled = true;
        btnCam.classList.add('btn-scan-disabled');
        btnCam.title = 'Attendance session expired';
      }
      const btnImg = document.getElementById('btnScanFromImage');
      if (btnImg) {
        btnImg.disabled = true;
        btnImg.classList.add('btn-scan-disabled');
        btnImg.title = 'Attendance session expired';
      }
      // Recheck active session
      setTimeout(loadStudentActiveQRSession, 1500);
      return;
    }

    countdownText.textContent = `${formatSecondsToMMSS(remainingSessionSeconds)} remaining`;

    if (remainingSessionSeconds <= 30) {
      if (countdownDot) countdownDot.className = 'pulse-dot pulse-dot-red';
      if (countdownBox) {
        countdownBox.style.borderColor = '#fca5a5';
        countdownBox.style.background = '#fee2e2';
        countdownBox.style.color = '#b91c1c';
      }
    } else {
      if (countdownDot) countdownDot.className = 'pulse-dot';
      if (countdownBox) {
        countdownBox.style.borderColor = '#e2e8f0';
        countdownBox.style.background = '#ffffff';
        countdownBox.style.color = '#334155';
      }
    }

    remainingSessionSeconds -= 1;
  }

  // =========================================================================
  // CAMERA SCANNER LIFECYCLE & QR DETECTION
  // =========================================================================

  /**
   * Open the QR Scanner modal and request camera stream
   */
  async function openQrScannerModal() {
    if (!qrScannerModal) return;

    // Reset scanner flags
    isScanningActive = false;
    isProcessingScanSubmission = false;

    // Show modal
    qrScannerModal.classList.remove('hidden');

    // Reset UI elements
    hideScannerErrorAlert();
    hideCameraOverlay();
    setScannerFeedback('Requesting camera permission...', true);

    try {
      // 1. Verify mediaDevices support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showScannerErrorAlert('Camera API is not supported in this browser. Please use a modern browser (Chrome, Firefox, Safari, Edge).');
        return;
      }

      // 2. Request camera stream (prefer environment / rear camera)
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      } catch (envErr) {
        // Fallback to generic video constraint if environment fails
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      cameraMediaStream = stream;
      if (qrScannerVideo) {
        qrScannerVideo.srcObject = stream;
        // Wait for video to be ready and playing
        await qrScannerVideo.play();
      }

      isScanningActive = true;
      setScannerFeedback('Align QR code within the frame...', false);

      // Start scan loop
      scanAnimationRequestId = requestAnimationFrame(scanVideoFrame);

    } catch (camErr) {
      console.error('Camera access error:', camErr);
      handleCameraAccessError(camErr);
    }
  }

  /**
   * Handle camera permission and device errors
   */
  function handleCameraAccessError(err) {
    let msg = 'Unable to access device camera.';
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      msg = 'Camera permission was denied. Please allow camera access in your browser site permissions to scan attendance.';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      msg = 'No camera found on your device. Please ensure a camera is attached and enabled.';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      msg = 'Camera is in use by another application. Please close any apps using the camera and retry.';
    } else if (err.message) {
      msg = err.message;
    }

    setScannerFeedback('Camera unavailable', false);
    showScannerErrorAlert(msg);
    showCameraOverlay(msg);
  }

  /**
   * Close the QR Scanner modal and cleanly stop all camera tracks
   */
  function closeQrScannerModal() {
    // 1. Stop scanning animation loop
    isScanningActive = false;
    isProcessingScanSubmission = false;
    if (scanAnimationRequestId) {
      cancelAnimationFrame(scanAnimationRequestId);
      scanAnimationRequestId = null;
    }

    // 2. Stop all camera media tracks immediately
    if (cameraMediaStream) {
      try {
        cameraMediaStream.getTracks().forEach(track => {
          track.stop();
        });
      } catch (e) {
        console.warn('Error stopping camera track:', e);
      }
      cameraMediaStream = null;
    }

    // 3. Disconnect video element
    if (qrScannerVideo) {
      qrScannerVideo.srcObject = null;
    }

    // 4. Hide modal
    if (qrScannerModal) {
      qrScannerModal.classList.add('hidden');
    }

    hideScannerErrorAlert();
    hideCameraOverlay();
  }

  /**
   * Scan video frame continuously using BarcodeDetector or jsQR
   */
  async function scanVideoFrame() {
    if (!isScanningActive || isProcessingScanSubmission) return;

    if (!qrScannerVideo || qrScannerVideo.readyState !== qrScannerVideo.HAVE_ENOUGH_DATA) {
      scanAnimationRequestId = requestAnimationFrame(scanVideoFrame);
      return;
    }

    try {
      // Method A: Native BarcodeDetector API (fastest, modern browsers)
      if (window.BarcodeDetector) {
        try {
          if (!nativeBarcodeDetector) {
            nativeBarcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
          }
          const barcodes = await nativeBarcodeDetector.detect(qrScannerVideo);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            handleDetectedQRToken(barcodes[0].rawValue);
            return;
          }
        } catch (detectorErr) {
          // Fallback to jsQR below
        }
      }

      // Method B: jsQR canvas fallback (works across all browsers)
      if (typeof window.jsQR === 'function' && qrScannerCanvas) {
        const vWidth = qrScannerVideo.videoWidth;
        const vHeight = qrScannerVideo.videoHeight;
        if (vWidth > 0 && vHeight > 0) {
          qrScannerCanvas.width = vWidth;
          qrScannerCanvas.height = vHeight;
          const ctx = qrScannerCanvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(qrScannerVideo, 0, 0, vWidth, vHeight);
          const imgData = ctx.getImageData(0, 0, vWidth, vHeight);
          const code = window.jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: 'dontInvert'
          });
          if (code && code.data) {
            handleDetectedQRToken(code.data);
            return;
          }
        }
      }
    } catch (scanErr) {
      console.warn('Scan frame evaluation error:', scanErr);
    }

    // Schedule next frame
    if (isScanningActive && !isProcessingScanSubmission) {
      scanAnimationRequestId = requestAnimationFrame(scanVideoFrame);
    }
  }

  /**
   * Handle detected QR token and submit attendance
   * @param {string} rawData
   */
  async function handleDetectedQRToken(rawData) {
    if (isProcessingScanSubmission) return;
    isProcessingScanSubmission = true;
    isScanningActive = false;

    try {
      // Extract token string
      let tokenStr = String(rawData || '').trim();
      if (!tokenStr) {
        if (qrScannerModal && !qrScannerModal.classList.contains('hidden')) {
          isScanningActive = true;
          scanAnimationRequestId = requestAnimationFrame(scanVideoFrame);
        }
        return;
      }

      // Handle possible URL wrapper: http.../?token=<token>
      if (tokenStr.startsWith('http://') || tokenStr.startsWith('https://')) {
        try {
          const urlObj = new URL(tokenStr);
          const urlToken = urlObj.searchParams.get('token');
          if (urlToken) tokenStr = urlToken;
        } catch (e) {}
      }

      // Handle possible JSON wrapper: {"token": "..."}
      if (tokenStr.startsWith('{')) {
        try {
          const parsed = JSON.parse(tokenStr);
          if (parsed.token) tokenStr = parsed.token;
        } catch (e) {}
      }

      // Provide visual scanning feedback
      setScannerFeedback('QR code detected! Processing attendance...', true);

      const currentAuthToken = localStorage.getItem('token') || sessionStorage.getItem('token') || token;
      const res = await fetch('/api/attendance/qr/scan', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentAuthToken}`,
          'Content-Type': 'application/json'
        },
        // Strictly send ONLY { token } - never send student_id!
        body: JSON.stringify({ token: tokenStr })
      });

      const json = await res.json().catch(() => ({}));

      if (res.status === 201) {
        // SUCCESS: Attendance marked as PRESENT
        closeQrScannerModal();

        const att = (json && json.data) || {};
        if (typeof showToast === 'function') {
          showToast(`Attendance marked successfully: PRESENT (${att.course_code || 'Lecture'})`, 'success');
        }

        // Refresh student active session and overview records
        await loadStudentActiveQRSession();
        await loadStudentAttendance();
        return;
      }

      // Handle specific API error responses
      let errorMsg = 'Failed to mark attendance.';
      if (res.status === 400) {
        errorMsg = (json && json.message) || 'Invalid QR code. Please scan the dynamic QR code projected by your teacher.';
      } else if (res.status === 401) {
        closeQrScannerModal();
        if (typeof showToast === 'function') showToast('Your session has expired. Please login again.', 'danger');
        setTimeout(() => window.location.replace('/login.html'), 1500);
        return;
      } else if (res.status === 403) {
        errorMsg = (json && json.message) || 'You are not enrolled in this course.';
      } else if (res.status === 404) {
        errorMsg = (json && json.message) || 'Attendance session not found.';
      } else if (res.status === 409) {
        // Already marked
        closeQrScannerModal();
        if (typeof showToast === 'function') {
          showToast('Attendance already marked for this lecture.', 'info');
        }
        await loadStudentActiveQRSession();
        await loadStudentAttendance();
        return;
      } else if (res.status === 410) {
        errorMsg = (json && json.message) || 'QR code or attendance session has expired. Please scan the current live QR code on screen.';
      } else if (json && json.message) {
        errorMsg = json.message;
      }

      // Show actionable error in scanner and toast for image scanner
      setScannerFeedback('Verification failed', false);
      showScannerErrorAlert(errorMsg);
      if (typeof showToast === 'function') {
        showToast(errorMsg, 'error');
      }

      // Offer retry scanning if camera scanner is still open
      if (qrScannerModal && !qrScannerModal.classList.contains('hidden')) {
        setTimeout(() => {
          if (qrScannerModal && !qrScannerModal.classList.contains('hidden') && !isProcessingScanSubmission) {
            isScanningActive = true;
            scanAnimationRequestId = requestAnimationFrame(scanVideoFrame);
          }
        }, 2500);
      }

    } catch (netErr) {
      console.error('Attendance scan network error:', netErr);
      setScannerFeedback('Network error', false);
      showScannerErrorAlert('Unable to connect to server. Please check your internet connection.');
      if (typeof showToast === 'function') {
        showToast('Unable to connect to server. Please check your internet connection.', 'error');
      }
      if (qrScannerModal && !qrScannerModal.classList.contains('hidden')) {
        setTimeout(() => {
          if (qrScannerModal && !qrScannerModal.classList.contains('hidden') && !isProcessingScanSubmission) {
            isScanningActive = true;
            scanAnimationRequestId = requestAnimationFrame(scanVideoFrame);
          }
        }, 2500);
      }
    } finally {
      isProcessingScanSubmission = false;
    }
  }

  function setScannerFeedback(text, isSpinning) {
    if (scannerFeedbackText) scannerFeedbackText.textContent = text;
    const dot = scannerFeedbackBadge?.querySelector('.pulse-dot');
    if (dot) {
      dot.className = isSpinning ? 'pulse-dot' : 'pulse-dot pulse-dot-red';
    }
  }

  function showScannerErrorAlert(message) {
    if (qrScannerErrorAlert && qrScannerErrorMessage) {
      qrScannerErrorMessage.textContent = message;
      qrScannerErrorAlert.classList.remove('hidden');
    }
  }

  function hideScannerErrorAlert() {
    if (qrScannerErrorAlert) {
      qrScannerErrorAlert.classList.add('hidden');
    }
  }

  function showCameraOverlay(message) {
    if (qrCameraOverlay && qrCameraOverlayContent) {
      qrCameraOverlayContent.innerHTML = `
        <div style="font-size: 13px; color: #f87171; margin-bottom: 12px;">${escapeHtml(message)}</div>
        <button type="button" class="btn btn-sm btn-primary" id="btnOverlayRetryCamera" style="font-size: 12px; padding: 5px 12px;">Grant Permission & Retry</button>
      `;
      qrCameraOverlay.classList.remove('hidden');
      document.getElementById('btnOverlayRetryCamera')?.addEventListener('click', openQrScannerModal);
    }
  }

  function hideCameraOverlay() {
    if (qrCameraOverlay) {
      qrCameraOverlay.classList.add('hidden');
    }
  }

  /**
   * Handle image file selection for "Scan from Image"
   * Extracts QR code using local jsQR / BarcodeDetector and submits token
   * @param {File} file
   */
  async function handleImageFileSelected(file) {
    if (!file) return;

    const fileInput = document.getElementById('qrImageFileInput');
    if (fileInput) fileInput.value = '';

    if (!file.type || !file.type.startsWith('image/')) {
      if (typeof showToast === 'function') {
        showToast('Please select a valid image file (PNG, JPG, JPEG, WEBP).', 'error');
      }
      return;
    }

    if (typeof showToast === 'function') {
      showToast('Analyzing image for attendance QR code...', 'info');
    }

    try {
      const reader = new FileReader();
      reader.onload = async function (event) {
        const img = new Image();
        img.onload = async function () {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            let detectedData = null;

            // 1. Try local jsQR library
            if (typeof window.jsQR === 'function') {
              let qrResult = window.jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
              });
              if (!qrResult || !qrResult.data) {
                qrResult = window.jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'attemptBoth'
                });
              }
              if (qrResult && qrResult.data) {
                detectedData = qrResult.data;
              }
            }

            // 2. Try native BarcodeDetector fallback
            if (!detectedData && window.BarcodeDetector) {
              try {
                const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
                const barcodes = await detector.detect(img);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                  detectedData = barcodes[0].rawValue;
                }
              } catch (e) {}
            }

            if (!detectedData) {
              if (typeof showToast === 'function') {
                showToast('No QR code detected in the selected image. Please upload a clear photo or screenshot containing the lecture QR code.', 'warning');
              }
              return;
            }

            // Submit extracted token through existing scan submission pipeline
            // Strictly sends { token } - never image files or student_id!
            await handleDetectedQRToken(detectedData);

          } catch (decodeErr) {
            console.error('Image QR decoding error:', decodeErr);
            if (typeof showToast === 'function') {
              showToast('Error reading QR code from image: ' + decodeErr.message, 'error');
            }
          }
        };

        img.onerror = function () {
          if (typeof showToast === 'function') {
            showToast('Failed to load the selected image file.', 'error');
          }
        };

        img.src = event.target.result;
      };

      reader.onerror = function () {
        if (typeof showToast === 'function') {
          showToast('Failed to read the selected file.', 'error');
        }
      };

      reader.readAsDataURL(file);

    } catch (err) {
      console.error('File reading error:', err);
      if (typeof showToast === 'function') {
        showToast('Error processing file: ' + err.message, 'error');
      }
    }
  }

  // Event Listeners for scanner controls
  if (btnCloseQrScanner) {
    btnCloseQrScanner.addEventListener('click', closeQrScannerModal);
  }
  if (btnCloseQrScannerX) {
    btnCloseQrScannerX.addEventListener('click', closeQrScannerModal);
  }
  if (btnRetryCamera) {
    btnRetryCamera.addEventListener('click', openQrScannerModal);
  }
  if (btnRefreshActiveQRSession) {
    btnRefreshActiveQRSession.addEventListener('click', () => {
      loadStudentActiveQRSession();
      if (typeof showToast === 'function') showToast('Checking for active lecture sessions...', 'info');
    });
  }

  // Wire hidden image file input for "Scan from Image"
  const qrImageFileInput = document.getElementById('qrImageFileInput');
  if (qrImageFileInput) {
    qrImageFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleImageFileSelected(file);
      }
    });
  }

  // Close scanner on backdrop click or Escape key
  if (qrScannerModal) {
    qrScannerModal.addEventListener('click', (e) => {
      if (e.target === qrScannerModal) {
        closeQrScannerModal();
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && qrScannerModal && !qrScannerModal.classList.contains('hidden')) {
      closeQrScannerModal();
    }
  });

  let studentSessionPollTimer = null;

  function cleanupStudentSession() {
    closeQrScannerModal();
    if (studentSessionPollTimer) {
      clearInterval(studentSessionPollTimer);
      studentSessionPollTimer = null;
    }
    if (qrCountdownTimer) {
      clearInterval(qrCountdownTimer);
      qrCountdownTimer = null;
    }
  }

  // Ensure camera stream and polling timer are stopped when page unloads or navigates away
  window.addEventListener('beforeunload', cleanupStudentSession);
  window.addEventListener('pagehide', cleanupStudentSession);

  document.addEventListener('DOMContentLoaded', () => {
    loadStudentAttendance();
    loadStudentActiveQRSession();

    // Poll active session every 15 seconds so student UI automatically reacts when teacher toggles QR visibility
    studentSessionPollTimer = setInterval(() => {
      if (!isScanningActive && !isProcessingScanSubmission) {
        loadStudentActiveQRSession();
      }
    }, 15000);
  });
})();

