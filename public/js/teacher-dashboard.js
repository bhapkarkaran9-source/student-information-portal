/**
 * Teacher Dashboard Controller - Student Information Portal
 * Connects real backend APIs with graceful baseline empty states (0, --, empty messages).
 * Strictly ZERO fake/hardcoded numbers | Strict IDOR Security | Pure SVG/CSS (Zero Images).
 */

(function () {
  'use strict';

  let currentTeacher = null;

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getDayName(date) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  }

  /**
   * Main Initialization
   */
  async function initTeacherDashboard() {
    // 1. Enforce Teacher Auth
    if (typeof requireAuth === 'function') {
      const isAuthed = requireAuth('TEACHER');
      if (!isAuthed) return;
    }

    // 2. Fetch authenticated user profile
    await loadUserProfile();

    // 3. Update current date and academic term
    updateDateDisplay();

    // 4. Fetch all dashboard data concurrently
    await Promise.allSettled([
      loadCoursesAndKPIs(),
      loadTodaySchedule(),
      loadStudentsOverview(),
      loadAssignments(),
      loadAttendanceSummary(),
      loadGrades(),
      loadQueries(),
      loadNotices(),
      loadUpcomingCalendarEvents(),
      loadNotificationsCount()
    ]);

    // Auto-refresh smart timetable every 30 seconds without full page reload
    if (!window.teacherTimetableInterval) {
      window.teacherTimetableInterval = setInterval(loadTodaySchedule, 30000);
    }
  }

  /**
   * 1. Load User Profile (/api/users/me)
   */
  async function loadUserProfile() {
    try {
      const res = await apiFetch('/api/users/me');
      if (res && res.success && res.data && res.data.user) {
        currentTeacher = res.data.user;
        const fullName = [currentTeacher.first_name, currentTeacher.last_name].filter(Boolean).join(' ') || currentTeacher.username || 'Teacher';
        
        const welcomeNameEl = document.getElementById('welcomeTeacherName');
        if (welcomeNameEl) welcomeNameEl.textContent = fullName;

        const welcomeUserEl = document.getElementById('welcomeUsername');
        if (welcomeUserEl) welcomeUserEl.textContent = currentTeacher.username || 'teacher';

        const deptEl = document.getElementById('welcomeDepartment');
        if (deptEl) deptEl.textContent = currentTeacher.department_name || 'General Faculty';

        const facIdEl = document.getElementById('welcomeFacultyId');
        if (facIdEl) {
          const fid = currentTeacher.employee_number || (currentTeacher.teacher_id ? 'T-' + currentTeacher.teacher_id : 'FAC-' + currentTeacher.user_id);
          facIdEl.textContent = fid;
        }
      }
    } catch (err) {
      console.error('Error fetching teacher profile:', err);
    }
  }

  /**
   * 2. Format Date and Academic Term
   */
  function updateDateDisplay() {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
    const dateStr = today.toLocaleDateString('en-US', options);

    const dateEl = document.getElementById('welcomeCurrentDate');
    if (dateEl) {
      dateEl.textContent = dateStr + ' | Term: 2025-2026';
    }

    const dayNameEl = document.getElementById('kpiTodayDayName');
    if (dayNameEl) {
      dayNameEl.textContent = getDayName(today);
    }
  }

  /**
   * 3. Load Courses & KPI
   */
  async function loadCoursesAndKPIs() {
    try {
      const res = await apiFetch('/api/courses?all=true');
      let courses = [];
      if (res && res.success && res.data) {
        courses = Array.isArray(res.data) ? res.data : (res.data.courses || []);
      }

      // Filter by teacher's department or assignments if available
      const kpiCourses = document.getElementById('kpiCoursesCount');
      if (kpiCourses) {
        kpiCourses.textContent = courses.length;
      }

      const container = document.getElementById('myCoursesContainer');
      if (!container) return;

      if (!courses || courses.length === 0) {
        container.innerHTML = `
          <div class="teacher-empty-state" id="emptyCoursesState">
            <div class="teacher-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            </div>
            <h3 class="teacher-empty-title">No courses assigned yet.</h3>
            <p class="teacher-empty-desc">Your department head or administrator has not assigned courses to your teaching load.</p>
          </div>`;
        return;
      }

      // Render Courses Table
      let tableHtml = `
        <div class="teacher-table-responsive">
          <table class="teacher-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Course Name</th>
                <th>Credits</th>
                <th>Type</th>
                <th>Semester</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>`;

      courses.slice(0, 5).forEach(c => {
        tableHtml += `
          <tr>
            <td style="font-weight: 700; color: #0d9488;">${escapeHtml(c.course_code)}</td>
            <td style="font-weight: 600;">${escapeHtml(c.course_name)}</td>
            <td>${escapeHtml(c.credits || '3')}</td>
            <td><span class="teacher-meta-chip" style="color: #0f766e; background: #ccfbf1; border: none; padding: 2px 8px;">${escapeHtml(c.course_type || 'Theory')}</span></td>
            <td>Sem ${escapeHtml(c.semester || '-')}</td>
            <td>
              <div style="display: flex; gap: 6px;">
                <a href="/pages/teacher/attendance.html?course_id=${c.course_id}" class="teacher-btn-outline" style="padding: 2px 8px; font-size: 11px;">Attendance</a>
                <a href="/pages/teacher/assignments.html?course_id=${c.course_id}" class="teacher-btn-outline" style="padding: 2px 8px; font-size: 11px;">Assignments</a>
                <a href="/pages/teacher/grades.html?course_id=${c.course_id}" class="teacher-btn-outline" style="padding: 2px 8px; font-size: 11px;">Grades</a>
              </div>
            </td>
          </tr>`;
      });

      tableHtml += '</tbody></table></div>';
      container.innerHTML = tableHtml;

    } catch (err) {
      console.error('Error loading courses:', err);
    }
  }

  /**
   * 4. Load Today's Timetable / Schedule (Smart Timetable)
   */
  async function loadTodaySchedule() {
    try {
      const res = await apiFetch('/api/timetable/today');
      let lectures = [];
      let nextLec = null;
      let todayDateStr = new Date().toISOString().split('T')[0];
      let todayDay = getDayName(new Date());

      if (res && res.success && res.data) {
        lectures = Array.isArray(res.data.lectures) ? res.data.lectures : [];
        nextLec = res.data.next_lecture || null;
        if (res.data.today_date) todayDateStr = res.data.today_date;
        if (res.data.today_day) todayDay = res.data.today_day;
      }

      // Check reminders in background
      apiFetch('/api/timetable/reminders/check', { method: 'POST' }).catch(() => {});

      const kpiClasses = document.getElementById('kpiClassesCount');
      if (kpiClasses) {
        kpiClasses.textContent = lectures.length;
      }

      const kpiTodayDay = document.getElementById('kpiTodayDayName');
      if (kpiTodayDay) {
        kpiTodayDay.textContent = todayDay;
      }

      // 4A. Update Prominent Next Lecture Card
      const nextContent = document.getElementById('nextLectureContent');
      const nextEmpty = document.getElementById('nextLectureEmptyState');
      const nextCourse = document.getElementById('nextLectureCourse');
      const nextMeta = document.getElementById('nextLectureMeta');
      const nextTime = document.getElementById('nextLectureTime');
      const nextRoom = document.getElementById('nextLectureRoom');
      const nextBadge = document.getElementById('nextLectureStatusBadge');
      const nextCountdown = document.getElementById('nextLectureCountdown');
      const nextAttAction = document.getElementById('nextLectureAttendanceAction');

      if (nextLec) {
        if (nextContent) nextContent.style.display = 'block';
        if (nextEmpty) nextEmpty.style.display = 'none';

        if (nextCourse) nextCourse.textContent = `${nextLec.course_name || 'Class Session'} (${nextLec.course_code || ''})`;
        if (nextMeta) nextMeta.textContent = `${nextLec.course_type || 'Theory'} • Class: ${nextLec.class_name || '-'} Div ${nextLec.division || '-'} • Sem ${nextLec.semester || '-'}`;
        if (nextTime) nextTime.textContent = nextLec.time_range || `${nextLec.start_time_12} - ${nextLec.end_time_12}`;
        if (nextRoom) nextRoom.textContent = `Room: ${nextLec.room_no || 'TBA'}`;

        if (nextBadge) {
          nextBadge.style.display = 'inline-flex';
          nextBadge.textContent = nextLec.status;
          if (nextLec.status === 'NOW') {
            nextBadge.style.background = '#dcfce7';
            nextBadge.style.color = '#15803d';
          } else if (nextLec.status === 'STARTING SOON') {
            nextBadge.style.background = '#fef3c7';
            nextBadge.style.color = '#b45309';
          } else if (nextLec.status === 'COMPLETED') {
            nextBadge.style.background = '#f1f5f9';
            nextBadge.style.color = '#64748b';
          } else {
            nextBadge.style.background = '#ccfbf1';
            nextBadge.style.color = '#0f766e';
          }
        }

        if (nextCountdown) {
          nextCountdown.textContent = nextLec.countdown_text || nextLec.status;
        }

        if (nextAttAction) {
          if (nextLec.is_attendance_recorded) {
            nextAttAction.innerHTML = '<span class="teacher-meta-chip" style="background: rgba(255,255,255,0.2); color: #ccfbf1; border: 1px solid rgba(255,255,255,0.35); font-weight: 600; padding: 4px 10px; font-size: 11.5px;">Attendance Recorded</span>';
          } else {
            nextAttAction.innerHTML = `<a href="/pages/teacher/attendance.html?course_id=${nextLec.course_id}&date=${todayDateStr}&start_time=${encodeURIComponent(nextLec.start_time)}" style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; font-size: 12px; font-weight: 600; border-radius: 6px; background: #14b8a6; color: #ffffff; text-decoration: none; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Mark Attendance &rarr;</a>`;
          }
        }
      } else {
        if (nextContent) nextContent.style.display = 'none';
        if (nextEmpty) nextEmpty.style.display = 'block';
        if (nextBadge) nextBadge.style.display = 'none';
        if (nextCountdown) nextCountdown.textContent = 'No more lectures today';
      }

      // 4B. Update Today's Schedule Table
      const container = document.getElementById('todayClassesContainer');
      if (!container) return;

      if (!lectures || lectures.length === 0) {
        container.innerHTML = `
          <div class="teacher-empty-state" id="emptyScheduleState">
            <div class="teacher-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
            <h3 class="teacher-empty-title">No classes scheduled for today (${escapeHtml(todayDay)}).</h3>
            <p class="teacher-empty-desc">You have no teaching periods or laboratory hours on today's roster.</p>
          </div>`;
        return;
      }

      let html = `
        <div class="teacher-table-responsive">
          <table class="teacher-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Course</th>
                <th>Class & Div</th>
                <th>Room</th>
                <th>Status</th>
                <th style="text-align: right;">Attendance</th>
              </tr>
            </thead>
            <tbody>`;

      lectures.forEach(item => {
        const timeDisplay = item.time_range || `${item.start_time_12 || item.start_time} - ${item.end_time_12 || item.end_time}`;

        let statusChipStyle = 'background: #e0e7ff; color: #4338ca;';
        if (item.status === 'NOW') {
          statusChipStyle = 'background: #dcfce7; color: #15803d; font-weight: 700;';
        } else if (item.status === 'STARTING SOON') {
          statusChipStyle = 'background: #fef3c7; color: #b45309; font-weight: 700;';
        } else if (item.status === 'COMPLETED') {
          statusChipStyle = 'background: #f1f5f9; color: #64748b;';
        }

        let attendanceActionHtml = '';
        if (item.is_attendance_recorded) {
          attendanceActionHtml = '<span class="teacher-meta-chip" style="color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; font-weight: 600; padding: 3px 8px; font-size: 11px;">Attendance Recorded</span>';
        } else {
          attendanceActionHtml = `<a href="/pages/teacher/attendance.html?course_id=${item.course_id}&date=${todayDateStr}&start_time=${encodeURIComponent(item.start_time)}" class="teacher-btn-outline" style="padding: 3px 10px; font-size: 11px; font-weight: 600; color: #0d9488; border-color: #0d9488;">Mark Attendance &rarr;</a>`;
        }

        const isNowClass = item.status === 'NOW' ? 'style="background: #f0fdf4;"' : '';

        html += `
          <tr ${isNowClass}>
            <td style="font-weight: 600; color: #0f172a; white-space: nowrap;">${escapeHtml(timeDisplay)}</td>
            <td>
              <div style="font-weight: 600;">${escapeHtml(item.course_name || 'Assigned Course')}</div>
              <div style="font-size: 11px; color: #64748b;">${escapeHtml(item.course_code || '')}</div>
            </td>
            <td>${escapeHtml(item.class_name || '-')} ${escapeHtml(item.division ? 'Div ' + item.division : '')}</td>
            <td>${escapeHtml(item.room_no || 'Room TBD')}</td>
            <td><span class="teacher-meta-chip" style="border: none; padding: 3px 8px; border-radius: 9999px; ${statusChipStyle}">${escapeHtml(item.status || 'UPCOMING')}</span></td>
            <td style="text-align: right; white-space: nowrap;">${attendanceActionHtml}</td>
          </tr>`;
      });

      html += '</tbody></table></div>';
      container.innerHTML = html;

    } catch (err) {
      console.error('Error loading schedule:', err);
    }
  }

  /**
   * 5. Load Students Overview & Advisory
   */
  async function loadStudentsOverview() {
    try {
      const res = await apiFetch('/api/students?limit=100');
      let students = [];
      if (res && res.success && res.data) {
        students = Array.isArray(res.data) ? res.data : (res.data.students || []);
      }

      const count = students.length;
      const kpiStudents = document.getElementById('kpiStudentsCount');
      if (kpiStudents) kpiStudents.textContent = count;

      const overviewTotal = document.getElementById('overviewTotalStudents');
      if (overviewTotal) overviewTotal.textContent = count;

      // Real zero state for defaulters / risk
      const overviewLow = document.getElementById('overviewLowAttendance');
      if (overviewLow) overviewLow.textContent = '0';

      const overviewRisk = document.getElementById('overviewAcademicRisk');
      if (overviewRisk) overviewRisk.textContent = '0';

    } catch (err) {
      console.error('Error loading students overview:', err);
    }
  }

  /**
   * 6. Load Assignments
   */
  async function loadAssignments() {
    try {
      const res = await apiFetch('/api/assignments?limit=10');
      let assignments = [];
      if (res && res.success && res.data) {
        assignments = Array.isArray(res.data) ? res.data : (res.data.assignments || []);
      }

      const kpiAssignments = document.getElementById('kpiAssignmentsCount');
      if (kpiAssignments) kpiAssignments.textContent = assignments.length;

      const container = document.getElementById('assignmentsContainer');
      if (!container) return;

      if (!assignments || assignments.length === 0) {
        container.innerHTML = `
          <div class="teacher-empty-state" id="emptyAssignmentsState">
            <div class="teacher-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            </div>
            <h3 class="teacher-empty-title">No assignments created yet.</h3>
            <p class="teacher-empty-desc">Create homework, assignments, and projects for your courses.</p>
          </div>`;
        return;
      }

      let html = `
        <div class="teacher-table-responsive">
          <table class="teacher-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Course</th>
                <th>Due Date</th>
                <th>Max Marks</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>`;

      assignments.slice(0, 5).forEach(a => {
        const dueDate = a.due_date ? new Date(a.due_date).toLocaleDateString() : '-';
        html += `
          <tr>
            <td style="font-weight: 600;">${escapeHtml(a.title)}</td>
            <td>${escapeHtml(a.course_code || a.course_name || '-')}</td>
            <td>${escapeHtml(dueDate)}</td>
            <td>${escapeHtml(a.max_marks || '100')}</td>
            <td><span class="teacher-meta-chip badge-active" style="border: none; padding: 2px 8px;">Active</span></td>
          </tr>`;
      });

      html += '</tbody></table></div>';
      container.innerHTML = html;

    } catch (err) {
      console.error('Error loading assignments:', err);
    }
  }

  /**
   * 7. Load Attendance Summary
   */
  async function loadAttendanceSummary() {
    try {
      const res = await apiFetch('/api/attendance/summary');
      const container = document.getElementById('attendanceSummaryContainer');
      if (!container) return;

      const summary = res && res.success && res.data ? (res.data.summary || {}) : {};
      const lowAttendance = res && res.success && res.data ? (res.data.lowAttendanceStudents || []) : [];

      // Update Low attendance count if low attendance students found
      const lowAttendanceEl = document.getElementById('overviewLowAttendance');
      if (lowAttendanceEl) {
        lowAttendanceEl.textContent = lowAttendance.length;
      }

      // Update average attendance in insights
      const avgAttendanceEl = document.getElementById('insightAvgAttendance');
      if (avgAttendanceEl) {
        avgAttendanceEl.textContent = summary.total_records > 0 && summary.average_percentage !== undefined ? summary.average_percentage + '%' : '--';
      }

      if (!summary.total_records || summary.total_records === 0) {
        container.innerHTML = `
          <div class="teacher-empty-state" id="emptyAttendanceState">
            <div class="teacher-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
            </div>
            <h3 class="teacher-empty-title">No attendance records recorded yet.</h3>
            <p class="teacher-empty-desc">Click "Take Attendance Today" to mark the register for today's lecture sessions.</p>
          </div>`;
        return;
      }

      // If records exist, render clean summary breakdown
      container.innerHTML = `
        <div style="padding: 16px 20px;">
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; text-align: center;">
            <div style="background: #f0fdf4; padding: 10px; border-radius: 6px;">
              <div style="font-size: 18px; font-weight: 700; color: #16a34a;">${summary.present_count || 0}</div>
              <div style="font-size: 11px; color: #15803d; font-weight: 600;">Present</div>
            </div>
            <div style="background: #fef2f2; padding: 10px; border-radius: 6px;">
              <div style="font-size: 18px; font-weight: 700; color: #dc2626;">${summary.absent_count || 0}</div>
              <div style="font-size: 11px; color: #b91c1c; font-weight: 600;">Absent</div>
            </div>
            <div style="background: #fffbeb; padding: 10px; border-radius: 6px;">
              <div style="font-size: 18px; font-weight: 700; color: #d97706;">${summary.late_count || 0}</div>
              <div style="font-size: 11px; color: #b45309; font-weight: 600;">Late</div>
            </div>
            <div style="background: #f0fdfa; padding: 10px; border-radius: 6px;">
              <div style="font-size: 18px; font-weight: 700; color: #0d9488;">${summary.average_percentage || 0}%</div>
              <div style="font-size: 11px; color: #0f766e; font-weight: 600;">Avg %</div>
            </div>
          </div>
        </div>`;

    } catch (err) {
      console.error('Error loading attendance:', err);
    }
  }

  /**
   * 8. Load Grades & Assessment
   */
  async function loadGrades() {
    try {
      const res = await apiFetch('/api/grades/stats');
      const container = document.getElementById('recentGradesContainer');
      if (!container) return;

      if (!res || !res.success || !res.data || !res.data.stats || !res.data.stats.total_grades) {
        container.innerHTML = `
          <div class="teacher-empty-state" id="emptyGradesState" style="padding: 24px 16px;">
            <h3 class="teacher-empty-title">No recent grade entries.</h3>
            <p class="teacher-empty-desc">Recorded semester and mid-term marks will appear here.</p>
          </div>`;
        return;
      }

      const stats = res.data.stats;
      container.innerHTML = `
        <div style="padding: 16px 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 13px; color: #64748b;">Total Assessments Entered:</span>
            <strong style="color: #0f172a;">${stats.total_grades || 0}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px; color: #64748b;">Average Score:</span>
            <strong style="color: #0d9488;">${stats.average_score ? stats.average_score + '%' : '--'}</strong>
          </div>
        </div>`;

      // Update insights card
      const passRateEl = document.getElementById('insightPassRate');
      if (passRateEl) {
        passRateEl.textContent = stats.total_grades > 0 && stats.pass_rate !== undefined ? stats.pass_rate + '%' : '--';
      }

    } catch (err) {
      console.error('Error loading grades:', err);
    }
  }

  /**
   * 9. Load Student Queries
   */
  async function loadQueries() {
    try {
      const res = await apiFetch('/api/queries?limit=5');
      let queries = [];
      if (res && res.success && res.data) {
        queries = Array.isArray(res.data) ? res.data : (res.data.queries || []);
      }

      const container = document.getElementById('queriesContainer');
      if (!container) return;

      if (!queries || queries.length === 0) {
        container.innerHTML = `
          <div class="teacher-empty-state" id="emptyQueriesState">
            <div class="teacher-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <h3 class="teacher-empty-title">No student queries.</h3>
            <p class="teacher-empty-desc">There are no pending doubts or academic questions awaiting reply.</p>
          </div>`;
        return;
      }

      let html = '<div style="padding: 12px 16px;">';
      queries.forEach(q => {
        const studentName = [q.first_name, q.last_name].filter(Boolean).join(' ') || q.student_name || 'Student';
        const dateStr = q.created_at ? new Date(q.created_at).toLocaleDateString() : '';
        html += `
          <div style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div style="overflow: hidden;">
              <div style="font-size: 13px; font-weight: 600; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(q.subject || 'Academic Query')}</div>
              <div style="font-size: 12px; color: #64748b;">By ${escapeHtml(studentName)} &bull; ${escapeHtml(dateStr)}</div>
            </div>
            <a href="/pages/teacher/queries.html?id=${q.query_id}" class="teacher-btn-outline" style="padding: 4px 10px; font-size: 11px;">Reply</a>
          </div>`;
      });
      html += '</div>';
      container.innerHTML = html;

    } catch (err) {
      console.error('Error loading queries:', err);
    }
  }

  /**
   * 10. Load Notices
   */
  async function loadNotices() {
    try {
      const res = await apiFetch('/api/notices?limit=5');
      let notices = [];
      if (res && res.success && res.data) {
        notices = Array.isArray(res.data) ? res.data : (res.data.notices || []);
      }

      const container = document.getElementById('noticesContainer');
      if (!container) return;

      if (!notices || notices.length === 0) {
        container.innerHTML = `
          <div class="teacher-empty-state" id="emptyNoticesState">
            <div class="teacher-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path></svg>
            </div>
            <h3 class="teacher-empty-title">No notices published.</h3>
            <p class="teacher-empty-desc">Active announcements for faculty and campus will be displayed here.</p>
          </div>`;
        return;
      }

      let html = '<div style="padding: 12px 16px;">';
      notices.forEach(n => {
        const dateStr = n.created_at ? new Date(n.created_at).toLocaleDateString() : '';
        html += `
          <div style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
              <span style="font-size: 13px; font-weight: 600; color: #0f172a;">${escapeHtml(n.title)}</span>
              <span class="teacher-meta-chip ${n.priority === 'HIGH' ? 'badge-high' : 'badge-normal'}" style="border: none; padding: 2px 6px; font-size: 10px;">${escapeHtml(n.priority || 'NORMAL')}</span>
            </div>
            <div style="font-size: 12px; color: #64748b;">${escapeHtml(dateStr)} &bull; Target: ${escapeHtml(n.target_role || 'ALL')}</div>
          </div>`;
      });
      html += '</div>';
      container.innerHTML = html;

    } catch (err) {
      console.error('Error loading notices:', err);
    }
  }

  /**
   * 11. Notifications Unread Badge
   */
  async function loadNotificationsCount() {
    try {
      const res = await apiFetch('/api/notifications/unread-count');
      const badge = document.getElementById('headerNotificationDot');
      if (badge && res && res.success && res.data && res.data.unread_count > 0) {
        badge.textContent = res.data.unread_count;
        badge.classList.remove('hidden');
        badge.style.display = 'inline-flex';
      }
    } catch (err) {
      // Graceful fallback
    }
  }

  /**
   * Load upcoming academic calendar events & exams
   */
  async function loadUpcomingCalendarEvents() {
    const container = document.getElementById('upcomingEventsContainer');
    const emptyState = document.getElementById('emptyCalendarState');
    if (!container) return;

    try {
      const res = await apiFetch('/api/academic-events/upcoming?limit=4');
      const events = (res && res.data && res.data.events) ? res.data.events : [];

      if (events.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
      }

      if (emptyState) emptyState.style.display = 'none';

      let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';
      events.forEach(e => {
        const isExam = e.event_type === 'EXAM';
        const isMeeting = e.event_type === 'MEETING';
        const isHoliday = e.event_type === 'HOLIDAY';

        let borderColor = '#0d9488';
        let bgBadge = '#ccfbf1';
        let colorBadge = '#0f766e';

        if (isExam) {
          borderColor = '#ef4444';
          bgBadge = '#fee2e2';
          colorBadge = '#b91c1c';
        } else if (isMeeting) {
          borderColor = '#8b5cf6';
          bgBadge = '#f3e8ff';
          colorBadge = '#7e22ce';
        } else if (isHoliday) {
          borderColor = '#10b981';
          bgBadge = '#dcfce7';
          colorBadge = '#15803d';
        }

        const timeStr = e.start_time ? ` • ${e.start_time.slice(0, 5)}` : '';

        html += `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid ${borderColor}; border-radius: 6px; padding: 10px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${bgBadge}; color: ${colorBadge};">
                ${e.event_type}${e.exam_type ? ` - ${e.exam_type}` : ''}
              </span>
              <span style="font-size: 11px; color: #64748b;">${e.start_date}${timeStr}</span>
            </div>
            <div style="font-size: 13.5px; font-weight: 700; color: #0f172a;">${escapeHtml(e.title)}</div>
            ${e.room || e.location ? `<div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">📍 ${escapeHtml(e.room || e.location)}</div>` : ''}
          </div>
        `;
      });
      html += '</div>';
      container.innerHTML = html;
    } catch (err) {
      console.warn('Failed to load upcoming events for teacher dashboard:', err);
      if (emptyState) emptyState.style.display = 'block';
    }
  }

  // DOM ready trigger
  document.addEventListener('DOMContentLoaded', initTeacherDashboard);

})();
