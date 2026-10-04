/**
 * Teacher Timetable Schedule Controller - Student Information Portal
 * Supports TODAY, UPCOMING, and WEEK views, Smart Countdown, Lecture Statuses, and Attendance.
 * 100% Zero Images | Pure CSS Gradients & SVGs | Accessible ERP Theme
 */

(function () {
  'use strict';

  let allTimetableSlots = [];
  let todayLectures = [];
  let nextLectureData = null;
  let selectedDay = 'All';
  let currentActiveView = 'TODAY';
  let todayDateStr = new Date().toISOString().split('T')[0];

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getTodayDayName() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
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

  async function initTimetable() {
    if (typeof requireAuth === 'function') {
      const isAuthed = requireAuth('TEACHER');
      if (!isAuthed) return;
    }

    setupViewTabs();
    setupDayTabs();

    // Initial data fetch
    await Promise.allSettled([
      loadTimetable(),
      loadSmartTodayTimetable(),
      loadNotificationsCount()
    ]);

    // Live auto-refresh every 30 seconds
    setInterval(loadSmartTodayTimetable, 30000);
  }

  // 1. Setup View Switcher Tabs (TODAY, UPCOMING, WEEK)
  function setupViewTabs() {
    const viewTabs = document.querySelectorAll('.view-tab');
    viewTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.getAttribute('data-view');
        currentActiveView = view;
        switchView(view);
      });
    });
  }

  function switchView(view) {
    const viewTabs = document.querySelectorAll('.view-tab');
    viewTabs.forEach(t => {
      if (t.getAttribute('data-view') === view) {
        t.classList.add('active');
        t.style.background = '#0d9488';
        t.style.color = '#ffffff';
      } else {
        t.classList.remove('active');
        t.style.background = '#f1f5f9';
        t.style.color = '#334155';
      }
    });

    const secToday = document.getElementById('sectionViewToday');
    const secUpcoming = document.getElementById('sectionViewUpcoming');
    const secWeek = document.getElementById('sectionViewWeek');

    if (secToday) secToday.style.display = (view === 'TODAY') ? 'block' : 'none';
    if (secUpcoming) secUpcoming.style.display = (view === 'UPCOMING') ? 'block' : 'none';
    if (secWeek) secWeek.style.display = (view === 'WEEK') ? 'block' : 'none';
  }

  // 2. Setup Week View Day Tabs
  function setupDayTabs() {
    const tabBtns = document.querySelectorAll('.day-filter-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDay = btn.getAttribute('data-day');
        tabBtns.forEach(b => {
          b.classList.remove('active');
          b.style.background = '#f1f5f9';
          b.style.color = '#334155';
        });
        btn.classList.add('active');
        btn.style.background = '#0d9488';
        btn.style.color = '#ffffff';

        renderSchedule();
      });
    });
  }

  // 3. Load Smart Today's Timetable (/api/timetable/today)
  async function loadSmartTodayTimetable() {
    try {
      const res = await apiFetch('/api/timetable/today');
      // Trigger background reminder check
      apiFetch('/api/timetable/reminders/check', { method: 'POST' }).catch(() => {});

      if (res && res.success && res.data) {
        todayLectures = Array.isArray(res.data.lectures) ? res.data.lectures : [];
        nextLectureData = res.data.next_lecture || null;
        if (res.data.today_date) todayDateStr = res.data.today_date;
        const todayDay = res.data.today_day || getTodayDayName();

        // Update Today KPI
        const todayEl = document.getElementById('statTodayPeriods');
        if (todayEl) todayEl.textContent = todayLectures.length;

        const countBadge = document.getElementById('todayLectureCountBadge');
        if (countBadge) countBadge.textContent = `${todayLectures.length} Lecture${todayLectures.length === 1 ? '' : 's'}`;

        const heading = document.getElementById('todayScheduleHeading');
        if (heading) heading.textContent = `Today's Lectures (${todayDay})`;

        // Render Prominent Next Lecture Card
        renderNextLectureCard(nextLectureData);

        // Render Today's Timeline with visual highlights & attendance action
        renderTodayTimeline(todayLectures, nextLectureData);

        // Render Upcoming View
        renderUpcomingView();
      }
    } catch (err) {
      console.error('Failed to load today timetable:', err);
    }
  }

  function renderNextLectureCard(nextLec) {
    const nextContent = document.getElementById('pageNextLectureContent');
    const nextEmpty = document.getElementById('pageNextLectureEmptyState');
    const nextCourse = document.getElementById('pageNextLectureCourse');
    const nextMeta = document.getElementById('pageNextLectureMeta');
    const nextTime = document.getElementById('pageNextLectureTime');
    const nextRoom = document.getElementById('pageNextLectureRoom');
    const nextBadge = document.getElementById('pageNextLectureBadge');
    const nextCountdown = document.getElementById('pageNextLectureCountdown');
    const nextAttAction = document.getElementById('pageNextLectureAttendanceAction');

    if (nextLec) {
      if (nextContent) nextContent.style.display = 'block';
      if (nextEmpty) nextEmpty.style.display = 'none';

      if (nextCourse) nextCourse.textContent = `${nextLec.course_name || 'Class Session'} (${nextLec.course_code || ''})`;
      const lecType = nextLec.lecture_type || nextLec.course_type || 'Theory';
      const divLabel = nextLec.division ? `Div ${nextLec.division}` : '';
      if (nextMeta) nextMeta.textContent = `${lecType} • Class: ${nextLec.class_name || '-'} ${divLabel} • Sem ${nextLec.semester || '-'}`;
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
  }

  function renderTodayTimeline(lectures, nextLec) {
    const container = document.getElementById('todayTimelineList');
    if (!container) return;

    if (!lectures || lectures.length === 0) {
      container.innerHTML = `
        <div class="teacher-empty-state" style="padding: 48px 24px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
          <div class="teacher-empty-icon" style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #ccfbf1; display: flex; align-items: center; justify-content: center; color: #0d9488;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: #0f172a;">No Lectures Scheduled Today</h3>
          <p style="color: #64748b; max-width: 460px; margin: 0 auto; font-size: 14px;">You have no teaching periods or laboratory hours on today's roster.</p>
        </div>`;
      return;
    }

    container.innerHTML = lectures.map(slot => {
      const isCurrent = (slot.status === 'NOW');
      const isNext = (nextLec && nextLec.timetable_id === slot.timetable_id && slot.status !== 'NOW' && slot.status !== 'COMPLETED');
      const isCompleted = (slot.status === 'COMPLETED');

      let cardBorder = 'border: 1px solid #e2e8f0;';
      let cardBg = 'background: #ffffff;';
      let cardShadow = 'box-shadow: 0 1px 3px rgba(0,0,0,0.05);';
      let opacity = 'opacity: 1;';

      if (isCurrent) {
        cardBorder = 'border: 2px solid #10b981;';
        cardBg = 'background: #f0fdf4;';
        cardShadow = 'box-shadow: 0 4px 14px rgba(16, 185, 129, 0.15);';
      } else if (isNext) {
        cardBorder = 'border: 2px solid #0d9488;';
        cardBg = 'background: #f0fdfa;';
        cardShadow = 'box-shadow: 0 4px 14px rgba(13, 148, 136, 0.15);';
      } else if (isCompleted) {
        cardBorder = 'border: 1px solid #e2e8f0;';
        cardBg = 'background: #f8fafc;';
        opacity = 'opacity: 0.78;';
      }

      let statusBadgeBg = '#e0e7ff';
      let statusBadgeColor = '#4338ca';
      if (slot.status === 'NOW') {
        statusBadgeBg = '#dcfce7';
        statusBadgeColor = '#15803d';
      } else if (slot.status === 'STARTING SOON') {
        statusBadgeBg = '#fef3c7';
        statusBadgeColor = '#b45309';
      } else if (slot.status === 'COMPLETED') {
        statusBadgeBg = '#f1f5f9';
        statusBadgeColor = '#64748b';
      }

      let attendanceBtnHtml = '';
      if (slot.is_attendance_recorded) {
        attendanceBtnHtml = '<span class="teacher-meta-chip" style="color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; font-weight: 600; padding: 3px 8px; font-size: 11px;">Attendance Recorded</span>';
      } else {
        attendanceBtnHtml = `<a href="/pages/teacher/attendance.html?course_id=${slot.course_id}&date=${todayDateStr}&start_time=${encodeURIComponent(slot.start_time)}" class="teacher-btn-outline" style="padding: 3px 10px; font-size: 11px; font-weight: 600; color: #0d9488; border-color: #0d9488;">Mark Attendance &rarr;</a>`;
      }

      let highlightPill = '';
      if (isCurrent) {
        highlightPill = `<span class="badge" style="background: #10b981; color: #ffffff; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 9999px;">CURRENT CLASS</span>`;
      } else if (isNext) {
        highlightPill = `<span class="badge" style="background: #0d9488; color: #ffffff; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 9999px;">NEXT CLASS</span>`;
      }

      return `
        <div style="${cardBorder} ${cardBg} ${cardShadow} ${opacity} border-radius: 10px; padding: 16px 20px; transition: all 0.2s ease;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 700; font-size: 14px; color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; padding: 4px 10px; border-radius: 6px;">
                ${escapeHtml(slot.time_range)}
              </span>
              <span class="badge" style="background: ${statusBadgeBg}; color: ${statusBadgeColor}; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 9999px;">
                ${escapeHtml(slot.status)}
              </span>
              ${highlightPill}
            </div>
            <div style="font-size: 12px; font-weight: 600; color: #475569;">
              ${escapeHtml(slot.countdown_text || '')}
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px;">
            <div>
              <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: #0f172a;">
                ${escapeHtml(slot.course_name)} <span style="font-size: 13px; font-weight: 600; color: #64748b;">(${escapeHtml(slot.course_code)})</span>
              </h4>
              <div style="font-size: 12.5px; color: #64748b; margin-top: 4px; display: flex; gap: 16px; flex-wrap: wrap;">
                <span>Class: <strong style="color: #334155;">${escapeHtml(slot.class_name || '-')} ${escapeHtml(slot.division ? 'Div ' + slot.division : '')} (Sem ${escapeHtml(slot.semester || '-')})</strong></span>
                <span>Room: <strong style="color: #334155;">${escapeHtml(slot.room_no || 'TBA')}</strong></span>
                <span>Type: <strong style="color: #334155;">${escapeHtml(slot.lecture_type || slot.course_type || 'Theory')}</strong></span>
              </div>
            </div>
            <div style="text-align: right;">
              ${attendanceBtnHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderUpcomingView() {
    const container = document.getElementById('upcomingLecturesList');
    if (!container) return;

    const activeToday = todayLectures.filter(l => l.status !== 'COMPLETED');
    const dayOrder = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
    const todayDay = getTodayDayName();
    const todayIndex = dayOrder[todayDay] || 1;

    // Future day slots from allTimetableSlots
    const futureDaySlots = allTimetableSlots.filter(t => {
      const tIdx = dayOrder[t.day_of_week] || 0;
      return tIdx > todayIndex;
    }).sort((a, b) => {
      const dDiff = (dayOrder[a.day_of_week] || 0) - (dayOrder[b.day_of_week] || 0);
      if (dDiff !== 0) return dDiff;
      return String(a.start_time || '').localeCompare(String(b.start_time || ''));
    });

    if (activeToday.length === 0 && futureDaySlots.length === 0) {
      container.innerHTML = `
        <div class="teacher-empty-state" style="padding: 48px 24px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
          <div class="teacher-empty-icon" style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #ccfbf1; display: flex; align-items: center; justify-content: center; color: #0d9488;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: #0f172a;">No Upcoming Lectures</h3>
          <p style="color: #64748b; max-width: 460px; margin: 0 auto; font-size: 14px;">All scheduled classes for the remainder of this term have concluded or no sessions are scheduled.</p>
        </div>`;
      return;
    }

    let html = '';

    if (activeToday.length > 0) {
      html += `<div style="font-size: 13px; font-weight: 700; color: #0d9488; text-transform: uppercase; letter-spacing: 0.5px; margin: 4px 0 2px 0;">Remaining Today (${escapeHtml(todayDay)})</div>`;
      activeToday.forEach(slot => {
        let attendanceBtn = '';
        if (slot.is_attendance_recorded) {
          attendanceBtn = '<span class="teacher-meta-chip" style="color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; font-weight: 600; padding: 2px 8px; font-size: 11px;">Attendance Recorded</span>';
        } else {
          attendanceBtn = `<a href="/pages/teacher/attendance.html?course_id=${slot.course_id}&date=${todayDateStr}&start_time=${encodeURIComponent(slot.start_time)}" class="teacher-btn-outline" style="padding: 2px 8px; font-size: 11px; font-weight: 600; color: #0d9488; border-color: #0d9488;">Mark Attendance &rarr;</a>`;
        }

        const divText = slot.division ? `Div ${slot.division}` : '';
        html += `
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="font-weight: 700; font-size: 14.5px; color: #0f172a;">${escapeHtml(slot.course_name)} <span style="font-weight: 500; color: #64748b;">(${escapeHtml(slot.course_code)})</span></div>
              <div style="font-size: 12px; color: #64748b; margin-top: 3px;">Class: ${escapeHtml(slot.class_name || '-')} ${escapeHtml(divText)} &bull; Room: ${escapeHtml(slot.room_no || 'TBA')}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <span style="font-weight: 700; font-size: 13px; color: #0f172a; background: #f1f5f9; padding: 3px 8px; border-radius: 6px;">${escapeHtml(slot.time_range)}</span>
              <div style="font-size: 11.5px; font-weight: 600; color: #0d9488;">${escapeHtml(slot.countdown_text || slot.status)}</div>
              ${attendanceBtn}
            </div>
          </div>
        `;
      });
    }

    if (futureDaySlots.length > 0) {
      let currentDayGroup = '';
      futureDaySlots.forEach(slot => {
        if (slot.day_of_week !== currentDayGroup) {
          currentDayGroup = slot.day_of_week;
          html += `<div style="font-size: 13px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.5px; margin: 16px 0 2px 0;">${escapeHtml(currentDayGroup)}</div>`;
        }

        const s12 = formatTimeTo12Hour(slot.start_time);
        const e12 = formatTimeTo12Hour(slot.end_time);
        const timeRange = (s12 && e12) ? `${s12} - ${e12}` : (slot.start_time || '--');
        const divText = slot.division ? `Div ${slot.division}` : '';

        html += `
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="font-weight: 700; font-size: 14.5px; color: #0f172a;">${escapeHtml(slot.course_name)} <span style="font-weight: 500; color: #64748b;">(${escapeHtml(slot.course_code)})</span></div>
              <div style="font-size: 12px; color: #64748b; margin-top: 3px;">Class: ${escapeHtml(slot.class_name || '-')} ${escapeHtml(divText)} &bull; Room: ${escapeHtml(slot.room_no || 'TBA')}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <span style="font-weight: 700; font-size: 13px; color: #0f172a; background: #f8fafc; padding: 3px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">${escapeHtml(timeRange)}</span>
              <a href="/pages/teacher/attendance.html?course_id=${slot.course_id || ''}" class="teacher-btn-outline" style="padding: 2px 8px; font-size: 11px; font-weight: 600; color: #0d9488; border-color: #0d9488;">Attendance &rarr;</a>
            </div>
          </div>
        `;
      });
    }

    container.innerHTML = html;
  }

  // 4. Load Timetable for Week View (/api/timetable?all=true)
  async function loadTimetable() {
    try {
      const res = await apiFetch('/api/timetable?all=true');
      if (res && res.success && res.data) {
        allTimetableSlots = Array.isArray(res.data) ? res.data : (res.data.timetable || []);
      } else {
        allTimetableSlots = [];
      }

      updateKPIs(allTimetableSlots);
      renderSchedule();
    } catch (err) {
      console.error('Failed to load timetable:', err);
      allTimetableSlots = [];
      renderSchedule();
    }
  }

  function updateKPIs(slots) {
    const totalWeekly = document.getElementById('statTotalWeeklyPeriods');
    if (totalWeekly) totalWeekly.textContent = slots.length;

    let labCount = 0;
    slots.forEach(s => {
      const type = (s.lecture_type || s.course_type || '').toLowerCase();
      if (type === 'practical') labCount++;
    });
    const labsEl = document.getElementById('statWeeklyLabs');
    if (labsEl) labsEl.textContent = labCount;
  }

  function renderSchedule() {
    const container = document.getElementById('timetableContainer');
    if (!container) return;

    let filtered = allTimetableSlots;
    if (selectedDay !== 'All') {
      filtered = allTimetableSlots.filter(s => (s.day_of_week || '').toLowerCase() === selectedDay.toLowerCase());
    }

    if (!filtered || filtered.length === 0) {
      container.innerHTML = `
        <div class="teacher-empty-state" style="padding: 48px 24px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
          <div class="teacher-empty-icon" style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #ccfbf1; display: flex; align-items: center; justify-content: center; color: #0d9488;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: #0f172a;">No Classes Scheduled</h3>
          <p style="color: #64748b; max-width: 460px; margin: 0 auto; font-size: 14px;">
            ${selectedDay === 'All' ? 'Your teaching schedule has not been finalized for the current term.' : `You have no teaching periods scheduled for ${selectedDay}.`}
          </p>
        </div>`;
      return;
    }

    // Sort by day and start time
    const dayOrder = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
    filtered.sort((a, b) => {
      const dDiff = (dayOrder[a.day_of_week] || 0) - (dayOrder[b.day_of_week] || 0);
      if (dDiff !== 0) return dDiff;
      return String(a.start_time || '').localeCompare(String(b.start_time || ''));
    });

    let html = `
      <div style="overflow-x: auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left; color: #475569;">
              <th style="padding: 12px 16px;">Day</th>
              <th style="padding: 12px 16px;">Time Period</th>
              <th style="padding: 12px 16px;">Course</th>
              <th style="padding: 12px 16px;">Class & Div</th>
              <th style="padding: 12px 16px;">Room / Location</th>
              <th style="padding: 12px 16px;">Type</th>
              <th style="padding: 12px 16px; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>`;

    filtered.forEach(item => {
      const s12 = formatTimeTo12Hour(item.start_time);
      const e12 = formatTimeTo12Hour(item.end_time);
      const timeStr = (s12 && e12) ? `${s12} - ${e12}` : `${item.start_time || '09:00'} - ${item.end_time || '10:00'}`;
      const itemType = item.lecture_type || item.course_type || 'Theory';
      const typeBadgeStyle = itemType === 'Practical'
        ? 'background: #e0e7ff; color: #4338ca;'
        : 'background: #e0f2fe; color: #0369a1;';
      const divText = item.division ? `Div ${item.division}` : '';

      html += `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 14px 16px; font-weight: 700; color: #0d9488;">${escapeHtml(item.day_of_week || '-')}</td>
          <td style="padding: 14px 16px; font-weight: 600; color: #0f172a; white-space: nowrap;">${escapeHtml(timeStr)}</td>
          <td style="padding: 14px 16px;">
            <div style="font-weight: 600; color: #0f172a;">${escapeHtml(item.course_name || 'Assigned Course')}</div>
            <div style="font-size: 11.5px; color: #64748b;">${escapeHtml(item.course_code || '')}</div>
          </td>
          <td style="padding: 14px 16px; color: #475569;">${escapeHtml(item.class_name || '-')} ${escapeHtml(divText)}</td>
          <td style="padding: 14px 16px; color: #475569; font-weight: 500;">${escapeHtml(item.room_no || 'TBD')}</td>
          <td style="padding: 14px 16px;">
            <span class="teacher-meta-chip" style="${typeBadgeStyle} border: none; padding: 2px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 600;">${escapeHtml(itemType)}</span>
          </td>
          <td style="padding: 14px 16px; text-align: right; white-space: nowrap;">
            <a href="/pages/teacher/attendance.html?course_id=${item.course_id || ''}" class="teacher-btn-outline" style="padding: 4px 10px; font-size: 12px; text-decoration: none; border-radius: 4px; border: 1px solid #cbd5e1; color: #0d9488; font-weight: 600;">Mark Attendance</a>
          </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

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

  document.addEventListener('DOMContentLoaded', initTimetable);
})();

