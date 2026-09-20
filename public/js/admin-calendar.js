/**
 * Admin Academic Calendar & Exam Schedule Controller
 * Student Information Portal
 */

(function () {
  'use strict';

  // State
  const state = {
    currentDate: new Date(),
    activeView: 'MONTH',
    events: [],
    departments: [],
    courses: [],
    selectedEvent: null
  };

  // DOM Elements
  let elements = {};

  // Initialize once DOM is ready
  document.addEventListener('DOMContentLoaded', async () => {
    // Verify admin authentication
    const user = auth.getUser();
    if (!user || user.role !== 'ADMIN') {
      window.location.href = '/login.html';
      return;
    }

    cacheElements();
    attachEventListeners();
    await Promise.all([loadDepartments(), loadCourses()]);
    await loadEvents();
  });

  function cacheElements() {
    elements = {
      statTotalEvents: document.getElementById('statTotalEvents'),
      statTotalExams: document.getElementById('statTotalExams'),
      statTotalHolidays: document.getElementById('statTotalHolidays'),
      statTotalSeminars: document.getElementById('statTotalSeminars'),
      viewModeTabs: document.getElementById('viewModeTabs'),
      calendarNavControls: document.getElementById('calendarNavControls'),
      prevPeriodBtn: document.getElementById('prevPeriodBtn'),
      todayPeriodBtn: document.getElementById('todayPeriodBtn'),
      nextPeriodBtn: document.getElementById('nextPeriodBtn'),
      currentPeriodTitle: document.getElementById('currentPeriodTitle'),
      filterSearch: document.getElementById('filterSearch'),
      filterEventType: document.getElementById('filterEventType'),
      filterDepartment: document.getElementById('filterDepartment'),
      filterAudience: document.getElementById('filterAudience'),
      monthViewContainer: document.getElementById('monthViewContainer'),
      weekViewContainer: document.getElementById('weekViewContainer'),
      listViewContainer: document.getElementById('listViewContainer'),
      examsViewContainer: document.getElementById('examsViewContainer'),
      calendarGridBody: document.getElementById('calendarGridBody'),
      weekViewGrid: document.getElementById('weekViewGrid'),
      agendaTableBody: document.getElementById('agendaTableBody'),
      listTotalCount: document.getElementById('listTotalCount'),
      examsTableBody: document.getElementById('examsTableBody'),
      triggerRemindersBtn: document.getElementById('triggerRemindersBtn'),
      addEventBtn: document.getElementById('addEventBtn'),
      addExamBtn: document.getElementById('addExamBtn'),
      eventModal: document.getElementById('eventModal'),
      eventModalTitle: document.getElementById('eventModalTitle'),
      closeEventModalBtn: document.getElementById('closeEventModalBtn'),
      cancelEventBtn: document.getElementById('cancelEventBtn'),
      eventForm: document.getElementById('eventForm'),
      modalEventId: document.getElementById('modalEventId'),
      modalTitle: document.getElementById('modalTitle'),
      modalEventType: document.getElementById('modalEventType'),
      examTypeGroup: document.getElementById('examTypeGroup'),
      modalExamType: document.getElementById('modalExamType'),
      modalStartDate: document.getElementById('modalStartDate'),
      modalEndDate: document.getElementById('modalEndDate'),
      modalStartTime: document.getElementById('modalStartTime'),
      modalEndTime: document.getElementById('modalEndTime'),
      modalLocation: document.getElementById('modalLocation'),
      modalRoom: document.getElementById('modalRoom'),
      modalTargetAudience: document.getElementById('modalTargetAudience'),
      modalDepartment: document.getElementById('modalDepartment'),
      modalCourse: document.getElementById('modalCourse'),
      modalClassName: document.getElementById('modalClassName'),
      modalInstructions: document.getElementById('modalInstructions'),
      modalDescription: document.getElementById('modalDescription'),
      detailsModal: document.getElementById('detailsModal'),
      detailsModalTitle: document.getElementById('detailsModalTitle'),
      detailsTypeBadge: document.getElementById('detailsTypeBadge'),
      detailsModalContent: document.getElementById('detailsModalContent'),
      closeDetailsModalBtn: document.getElementById('closeDetailsModalBtn'),
      closeDetailsBtn: document.getElementById('closeDetailsBtn'),
      editEventBtn: document.getElementById('editEventBtn'),
      deleteEventBtn: document.getElementById('deleteEventBtn')
    };
  }

  function attachEventListeners() {
    // View Switcher
    elements.viewModeTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.cal-view-btn');
      if (!btn) return;
      elements.viewModeTabs.querySelectorAll('.cal-view-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = '#f1f5f9';
        b.style.color = 'var(--admin-text)';
      });
      btn.classList.add('active');
      btn.style.background = 'var(--admin-primary)';
      btn.style.color = '#fff';

      state.activeView = btn.dataset.view;
      switchView(state.activeView);
    });

    // Month / Week Navigation
    elements.prevPeriodBtn.addEventListener('click', () => {
      navigatePeriod(-1);
    });
    elements.nextPeriodBtn.addEventListener('click', () => {
      navigatePeriod(1);
    });
    elements.todayPeriodBtn.addEventListener('click', () => {
      state.currentDate = new Date();
      renderCurrentView();
    });

    // Filters
    elements.filterSearch.addEventListener('input', () => renderCurrentView());
    elements.filterEventType.addEventListener('change', () => renderCurrentView());
    elements.filterDepartment.addEventListener('change', () => renderCurrentView());
    elements.filterAudience.addEventListener('change', () => renderCurrentView());

    // Reminders Sync Button
    elements.triggerRemindersBtn.addEventListener('click', triggerReminders);

    // Add Modals
    elements.addEventBtn.addEventListener('click', () => openEventModal());
    elements.addExamBtn.addEventListener('click', () => openExamModal());

    // Modal Close
    elements.closeEventModalBtn.addEventListener('click', closeEventModal);
    elements.cancelEventBtn.addEventListener('click', closeEventModal);
    elements.closeDetailsModalBtn.addEventListener('click', closeDetailsModal);
    elements.closeDetailsBtn.addEventListener('click', closeDetailsModal);

    // Form Event Type change (toggle Exam Type)
    elements.modalEventType.addEventListener('change', () => {
      if (elements.modalEventType.value === 'EXAM') {
        elements.examTypeGroup.classList.remove('hidden');
      } else {
        elements.examTypeGroup.classList.add('hidden');
      }
    });

    // Form submission
    elements.eventForm.addEventListener('submit', handleFormSubmit);

    // Modal actions
    elements.editEventBtn.addEventListener('click', () => {
      if (state.selectedEvent) {
        closeDetailsModal();
        openEventModal(state.selectedEvent);
      }
    });

    elements.deleteEventBtn.addEventListener('click', () => {
      if (state.selectedEvent) {
        handleDeleteEvent(state.selectedEvent.event_id, state.selectedEvent.title);
      }
    });

    // Close on backdrop click
    elements.eventModal.addEventListener('click', (e) => {
      if (e.target === elements.eventModal) closeEventModal();
    });
    elements.detailsModal.addEventListener('click', (e) => {
      if (e.target === elements.detailsModal) closeDetailsModal();
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (elements.eventModal && !elements.eventModal.classList.contains('hidden')) {
          closeEventModal();
        }
        if (elements.detailsModal && !elements.detailsModal.classList.contains('hidden')) {
          closeDetailsModal();
        }
      }
    });
  }

  // View Navigation
  function navigatePeriod(direction) {
    if (state.activeView === 'MONTH') {
      state.currentDate.setMonth(state.currentDate.getMonth() + direction);
    } else if (state.activeView === 'WEEK') {
      state.currentDate.setDate(state.currentDate.getDate() + (direction * 7));
    }
    renderCurrentView();
  }

  function switchView(view) {
    elements.monthViewContainer.classList.add('hidden');
    elements.weekViewContainer.classList.add('hidden');
    elements.listViewContainer.classList.add('hidden');
    elements.examsViewContainer.classList.add('hidden');

    if (view === 'MONTH') {
      elements.monthViewContainer.classList.remove('hidden');
      elements.calendarNavControls.classList.remove('hidden');
    } else if (view === 'WEEK') {
      elements.weekViewContainer.classList.remove('hidden');
      elements.calendarNavControls.classList.remove('hidden');
    } else if (view === 'LIST') {
      elements.listViewContainer.classList.remove('hidden');
      elements.calendarNavControls.classList.add('hidden');
    } else if (view === 'EXAMS') {
      elements.examsViewContainer.classList.remove('hidden');
      elements.calendarNavControls.classList.add('hidden');
    }

    renderCurrentView();
  }

  function renderCurrentView() {
    updatePeriodTitle();
    const filtered = getFilteredEvents();

    if (state.activeView === 'MONTH') {
      renderMonthGrid(filtered);
    } else if (state.activeView === 'WEEK') {
      renderWeekGrid(filtered);
    } else if (state.activeView === 'LIST') {
      renderAgendaList(filtered);
    } else if (state.activeView === 'EXAMS') {
      renderExamsTable(state.events.filter(e => e.event_type === 'EXAM'));
    }
  }

  function updatePeriodTitle() {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const y = state.currentDate.getFullYear();
    const m = monthNames[state.currentDate.getMonth()];

    if (state.activeView === 'MONTH') {
      elements.currentPeriodTitle.textContent = `${m} ${y}`;
    } else if (state.activeView === 'WEEK') {
      const { start, end } = getWeekRange(state.currentDate);
      elements.currentPeriodTitle.textContent = `${start.getDate()} ${monthNames[start.getMonth()].slice(0, 3)} - ${end.getDate()} ${monthNames[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
    }
  }

  // Load Data
  async function loadEvents() {
    try {
      const res = await api.get('/academic-events?all=true');
      const list = (res && res.data && Array.isArray(res.data.events)) ? res.data.events : (res && Array.isArray(res.events) ? res.events : (Array.isArray(res) ? res : []));
      state.events = list;
      updateKpis();
      renderCurrentView();
    } catch (err) {
      console.error('Failed to load events:', err);
      showToast('Failed to load academic events', 'error');
    }
  }

  async function loadDepartments() {
    try {
      const res = await api.get('/departments?all=true');
      const list = res.data && res.data.departments ? res.data.departments : (res.data || []);
      state.departments = list;

      let filterHtml = '<option value="">All Departments</option>';
      let modalHtml = '<option value="">All / Not Department Restricted</option>';

      list.forEach(d => {
        const name = d.department_name || d.department_code;
        filterHtml += `<option value="${d.department_id}">${name}</option>`;
        modalHtml += `<option value="${d.department_id}">${name} (${d.department_code})</option>`;
      });

      elements.filterDepartment.innerHTML = filterHtml;
      elements.modalDepartment.innerHTML = modalHtml;
    } catch (err) {
      console.warn('Failed to load departments:', err);
    }
  }

  async function loadCourses() {
    try {
      const res = await api.get('/courses?all=true');
      const list = res.data && res.data.courses ? res.data.courses : (res.data || []);
      state.courses = list;

      let modalHtml = '<option value="">None / General</option>';
      list.forEach(c => {
        modalHtml += `<option value="${c.course_id}">${c.course_code} - ${c.course_name}</option>`;
      });
      elements.modalCourse.innerHTML = modalHtml;
    } catch (err) {
      console.warn('Failed to load courses:', err);
    }
  }

  function updateKpis() {
    const total = state.events.length;
    const exams = state.events.filter(e => e.event_type === 'EXAM').length;
    const holidays = state.events.filter(e => e.event_type === 'HOLIDAY').length;
    const seminars = state.events.filter(e => ['SEMINAR', 'MEETING'].includes(e.event_type)).length;

    elements.statTotalEvents.textContent = total;
    elements.statTotalExams.textContent = exams;
    elements.statTotalHolidays.textContent = holidays;
    elements.statTotalSeminars.textContent = seminars;
  }

  // Filter evaluation
  function getFilteredEvents() {
    const search = elements.filterSearch.value.trim().toLowerCase();
    const type = elements.filterEventType.value;
    const dept = elements.filterDepartment.value;
    const audience = elements.filterAudience.value;

    return state.events.filter(e => {
      if (type && e.event_type !== type) return false;
      if (dept && String(e.department_id) !== String(dept)) return false;
      if (audience && e.target_audience !== audience) return false;

      if (search) {
        const matches = (
          (e.title && e.title.toLowerCase().includes(search)) ||
          (e.description && e.description.toLowerCase().includes(search)) ||
          (e.location && e.location.toLowerCase().includes(search)) ||
          (e.room && e.room.toLowerCase().includes(search)) ||
          (e.course_code && e.course_code.toLowerCase().includes(search)) ||
          (e.class_name && e.class_name.toLowerCase().includes(search))
        );
        if (!matches) return false;
      }

      return true;
    });
  }

  // =========================================================================
  // VIEW RENDERERS
  // =========================================================================

  // Helper for pill classes
  function getPillClass(type) {
    const map = {
      EXAM: 'pill-exam',
      HOLIDAY: 'pill-holiday',
      SEMINAR: 'pill-seminar',
      MEETING: 'pill-meeting',
      COLLEGE_EVENT: 'pill-college_event',
      ASSIGNMENT: 'pill-assignment',
      RESULT: 'pill-result',
      OTHER: 'pill-other'
    };
    return map[type] || 'pill-other';
  }

  // Helper: check if date falls in range
  function isDateInRange(dateStr, startDateStr, endDateStr) {
    return dateStr >= startDateStr && dateStr <= endDateStr;
  }

  // A. MONTH GRID
  function renderMonthGrid(filteredEvents) {
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startingDayOfWeek = firstDay.getDay(); // 0 (Sun) to 6 (Sat)
    const daysInMonth = lastDay.getDate();

    const todayStr = new Date().toISOString().split('T')[0];

    // Previous month padding
    const prevLastDay = new Date(year, month, 0).getDate();

    let gridHtml = '';

    // Leading days from previous month
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const prevDate = prevLastDay - i;
      gridHtml += `
        <div class="calendar-day-cell other-month">
          <div class="day-number-row">
            <span class="day-number">${prevDate}</span>
          </div>
        </div>
      `;
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;

      const isToday = (dateStr === todayStr);
      const dayEvents = filteredEvents.filter(e => isDateInRange(dateStr, e.start_date, e.end_date));

      let eventsHtml = '';
      const displayLimit = 3;
      const visible = dayEvents.slice(0, displayLimit);
      const extraCount = dayEvents.length - displayLimit;

      visible.forEach(e => {
        const pillCls = getPillClass(e.event_type);
        const timePrefix = e.start_time ? `${e.start_time.slice(0, 5)} ` : '';
        eventsHtml += `
          <div class="event-pill ${pillCls}" title="${escapeHtml(e.title)}" onclick="window.adminCalendar.openDetailsModal(${e.event_id})">
            <span>${timePrefix}${escapeHtml(e.title)}</span>
          </div>
        `;
      });

      if (extraCount > 0) {
        eventsHtml += `
          <div class="event-pill pill-other" style="font-size: 10px; text-align: center; justify-content: center; cursor: pointer;" onclick="window.adminCalendar.openDayList('${dateStr}')">
            +${extraCount} more
          </div>
        `;
      }

      gridHtml += `
        <div class="calendar-day-cell ${isToday ? 'today' : ''}" data-date="${dateStr}">
          <div class="day-number-row">
            <span class="day-number">${d}</span>
            <button type="button" class="btn btn-sm" style="padding: 2px 6px; font-size: 11px; background: transparent; border: none; color: var(--admin-muted); cursor: pointer;" title="Add event on this date" onclick="window.adminCalendar.openEventModalWithDate('${dateStr}')">+</button>
          </div>
          <div class="day-events-list">
            ${eventsHtml}
          </div>
        </div>
      `;
    }

    // Trailing days to fill out the last row (up to 35 or 42 cells total)
    const totalCells = startingDayOfWeek + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let nextD = 1; nextD <= remainingCells; nextD++) {
      gridHtml += `
        <div class="calendar-day-cell other-month">
          <div class="day-number-row">
            <span class="day-number">${nextD}</span>
          </div>
        </div>
      `;
    }

    elements.calendarGridBody.innerHTML = gridHtml;
  }

  // B. WEEK GRID
  function getWeekRange(refDate) {
    const d = new Date(refDate);
    const day = d.getDay();
    const diff = d.getDate() - day; // Sunday as start
    const start = new Date(d.setDate(diff));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }

  function renderWeekGrid(filteredEvents) {
    const { start } = getWeekRange(state.currentDate);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayStr = new Date().toISOString().split('T')[0];

    let weekHtml = '';

    for (let i = 0; i < 7; i++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + i);
      const dateStr = cur.toISOString().split('T')[0];
      const isToday = (dateStr === todayStr);

      const dayEvents = filteredEvents.filter(e => isDateInRange(dateStr, e.start_date, e.end_date));

      let eventsHtml = '';
      if (dayEvents.length === 0) {
        eventsHtml = `<div style="font-size: 12px; color: var(--admin-light); text-align: center; margin-top: 40px;">No events scheduled</div>`;
      } else {
        dayEvents.forEach(e => {
          const pillCls = getPillClass(e.event_type);
          eventsHtml += `
            <div class="card" style="padding: 10px; border-left: 3px solid var(--admin-primary); cursor: pointer; transition: transform 0.15s;" onclick="window.adminCalendar.openDetailsModal(${e.event_id})">
              <span class="event-pill ${pillCls}" style="display: inline-block; margin-bottom: 4px;">${e.event_type}</span>
              <div style="font-size: 13px; font-weight: 700; color: var(--admin-text); line-height: 1.3;">${escapeHtml(e.title)}</div>
              ${e.start_time ? `<div style="font-size: 11px; color: var(--admin-muted); margin-top: 4px;">🕒 ${e.start_time.slice(0, 5)}${e.end_time ? ` - ${e.end_time.slice(0, 5)}` : ''}</div>` : ''}
              ${e.room || e.location ? `<div style="font-size: 11px; color: var(--admin-muted);">📍 ${escapeHtml(e.room || e.location)}</div>` : ''}
            </div>
          `;
        });
      }

      weekHtml += `
        <div class="week-day-col">
          <div class="week-col-header ${isToday ? 'today' : ''}">
            <div style="font-size: 12px; font-weight: 600; color: var(--admin-muted); text-transform: uppercase;">${dayNames[i]}</div>
            <div style="font-size: 18px; font-weight: 700; color: ${isToday ? 'var(--admin-primary)' : 'var(--admin-text)'};">${cur.getDate()}</div>
          </div>
          <div class="week-col-body">
            ${eventsHtml}
          </div>
        </div>
      `;
    }

    elements.weekViewGrid.innerHTML = weekHtml;
  }

  // C. LIST / AGENDA VIEW
  function renderAgendaList(filteredEvents) {
    elements.listTotalCount.textContent = `Showing ${filteredEvents.length} events`;

    if (filteredEvents.length === 0) {
      elements.agendaTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px; color: var(--admin-muted);">
            No academic events match the current filter criteria.
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    filteredEvents.forEach(e => {
      const pillCls = getPillClass(e.event_type);
      const timeStr = e.start_time ? ` ${e.start_time.slice(0, 5)}` : '';
      const dateRangeStr = e.start_date === e.end_date ? `${e.start_date}${timeStr}` : `${e.start_date} to ${e.end_date}`;

      const deptStr = e.department_code || e.department_name || '-';
      const courseStr = e.course_code ? `<strong>${e.course_code}</strong>` : '';

      rowsHtml += `
        <tr>
          <td style="white-space: nowrap; font-size: 13px; font-weight: 600;">${dateRangeStr}</td>
          <td>
            <div style="font-weight: 700; color: var(--admin-text);">${escapeHtml(e.title)}</div>
            <span class="event-pill ${pillCls}" style="display: inline-block; margin-top: 4px;">${e.event_type}${e.exam_type ? ` • ${e.exam_type}` : ''}</span>
          </td>
          <td><span class="badge" style="background: #f1f5f9; color: var(--admin-text); font-size: 11px;">${e.target_audience}</span></td>
          <td style="font-size: 13px;">${courseStr ? `${courseStr} (${deptStr})` : deptStr}</td>
          <td style="font-size: 13px;">${escapeHtml(e.room || e.location || '-')}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button type="button" class="btn btn-sm btn-secondary" onclick="window.adminCalendar.openDetailsModal(${e.event_id})" style="padding: 4px 8px; font-size: 12px;">View</button>
            <button type="button" class="btn btn-sm btn-primary" onclick="window.adminCalendar.openEditFromList(${e.event_id})" style="padding: 4px 8px; font-size: 12px;">Edit</button>
            <button type="button" class="btn btn-sm btn-danger" onclick="window.adminCalendar.confirmDelete(${e.event_id}, '${escapeHtml(e.title)}')" style="padding: 4px 8px; font-size: 12px;">Delete</button>
          </td>
        </tr>
      `;
    });

    elements.agendaTableBody.innerHTML = rowsHtml;
  }

  // D. EXAM TIMETABLE TABLE
  function renderExamsTable(exams) {
    if (exams.length === 0) {
      elements.examsTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--admin-muted);">
            No examination schedules found. Click "+ Schedule New Exam" to create one.
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    exams.forEach(e => {
      const timeStr = e.start_time ? `${e.start_time.slice(0, 5)} - ${e.end_time ? e.end_time.slice(0, 5) : 'End'}` : 'TBD';
      rowsHtml += `
        <tr>
          <td style="white-space: nowrap;">
            <div style="font-weight: 700; color: var(--admin-text); font-size: 13.5px;">${e.start_date}</div>
            <div style="font-size: 12px; color: var(--admin-muted);">🕒 ${timeStr}</div>
          </td>
          <td>
            <div style="font-weight: 700; color: var(--admin-primary);">${e.course_code || 'General'}</div>
            <div style="font-size: 12px; color: var(--admin-muted);">${escapeHtml(e.course_name || e.title)}</div>
          </td>
          <td>
            <span class="event-pill pill-exam" style="display: inline-block;">${e.exam_type || 'General Exam'}</span>
          </td>
          <td style="font-size: 13px;">
            <div>${e.class_name || 'All Classes'}</div>
            ${e.division ? `<div style="font-size: 11px; color: var(--admin-muted);">Div: ${e.division}</div>` : ''}
          </td>
          <td style="font-size: 13px;">
            <div style="font-weight: 600;">${escapeHtml(e.room || 'TBD')}</div>
            <div style="font-size: 11px; color: var(--admin-muted);">${escapeHtml(e.location || '')}</div>
          </td>
          <td style="font-size: 12px; max-width: 200px; color: var(--admin-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(e.instructions || '')}">
            ${escapeHtml(e.instructions || 'Standard exam rules apply')}
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button type="button" class="btn btn-sm btn-secondary" onclick="window.adminCalendar.openDetailsModal(${e.event_id})" style="padding: 4px 8px; font-size: 12px;">View</button>
            <button type="button" class="btn btn-sm btn-primary" onclick="window.adminCalendar.openEditFromList(${e.event_id})" style="padding: 4px 8px; font-size: 12px;">Edit</button>
            <button type="button" class="btn btn-sm btn-danger" onclick="window.adminCalendar.confirmDelete(${e.event_id}, '${escapeHtml(e.title)}')" style="padding: 4px 8px; font-size: 12px;">Delete</button>
          </td>
        </tr>
      `;
    });

    elements.examsTableBody.innerHTML = rowsHtml;
  }

  // =========================================================================
  // MODAL LOGIC & ACTIONS
  // =========================================================================

  function openEventModal(eventData = null) {
    elements.eventForm.reset();
    if (eventData) {
      elements.eventModalTitle.textContent = 'Edit Academic Event';
      elements.modalEventId.value = eventData.event_id;
      elements.modalTitle.value = eventData.title || '';
      elements.modalEventType.value = eventData.event_type || 'EXAM';
      elements.modalExamType.value = eventData.exam_type || 'Internal Test';
      elements.modalStartDate.value = eventData.start_date || '';
      elements.modalEndDate.value = eventData.end_date || '';
      elements.modalStartTime.value = eventData.start_time ? eventData.start_time.slice(0, 5) : '';
      elements.modalEndTime.value = eventData.end_time ? eventData.end_time.slice(0, 5) : '';
      elements.modalLocation.value = eventData.location || '';
      elements.modalRoom.value = eventData.room || '';
      elements.modalTargetAudience.value = eventData.target_audience || 'ALL';
      elements.modalDepartment.value = eventData.department_id || '';
      elements.modalCourse.value = eventData.course_id || '';
      elements.modalClassName.value = eventData.class_name || '';
      elements.modalInstructions.value = eventData.instructions || '';
      elements.modalDescription.value = eventData.description || '';
    } else {
      elements.eventModalTitle.textContent = 'Add Academic Event';
      elements.modalEventId.value = '';
      const todayStr = new Date().toISOString().split('T')[0];
      elements.modalStartDate.value = todayStr;
      elements.modalEndDate.value = todayStr;
      elements.modalEventType.value = 'COLLEGE_EVENT';
    }

    if (elements.modalEventType.value === 'EXAM') {
      elements.examTypeGroup.classList.remove('hidden');
    } else {
      elements.examTypeGroup.classList.add('hidden');
    }

    elements.eventModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function openExamModal() {
    openEventModal();
    elements.eventModalTitle.textContent = 'Schedule Academic Exam';
    elements.modalEventType.value = 'EXAM';
    elements.examTypeGroup.classList.remove('hidden');
  }

  function openEventModalWithDate(dateStr) {
    openEventModal();
    elements.modalStartDate.value = dateStr;
    elements.modalEndDate.value = dateStr;
  }

  function closeEventModal() {
    elements.eventModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function openDetailsModal(eventId) {
    const event = state.events.find(e => e.event_id === eventId);
    if (!event) return;

    state.selectedEvent = event;
    elements.detailsModalTitle.textContent = event.title;
    elements.detailsTypeBadge.textContent = event.event_type;
    elements.detailsTypeBadge.className = `event-pill ${getPillClass(event.event_type)}`;

    const timeStr = event.start_time ? `${event.start_time.slice(0, 5)}${event.end_time ? ` - ${event.end_time.slice(0, 5)}` : ''}` : 'All Day';

    elements.detailsModalContent.innerHTML = `
      <div class="details-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div>
          <div style="font-size: 12px; color: var(--admin-muted); font-weight: 500;">Date</div>
          <div style="font-size: 14px; font-weight: 700; color: var(--admin-text); margin-top: 2px;">
            ${event.start_date}${event.end_date !== event.start_date ? ` to ${event.end_date}` : ''}
          </div>
        </div>
        <div>
          <div style="font-size: 12px; color: var(--admin-muted); font-weight: 500;">Timing</div>
          <div style="font-size: 14px; font-weight: 700; color: var(--admin-text); margin-top: 2px;">${timeStr}</div>
        </div>
      </div>

      <div class="details-grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div>
          <div style="font-size: 12px; color: var(--admin-muted); font-weight: 500;">Target Scope</div>
          <div style="font-size: 13.5px; font-weight: 600; color: var(--admin-text); margin-top: 2px;">
            <span class="badge" style="background: #f1f5f9; color: var(--admin-primary);">${event.target_audience}</span>
          </div>
        </div>
        <div>
          <div style="font-size: 12px; color: var(--admin-muted); font-weight: 500;">Venue / Hall</div>
          <div style="font-size: 14px; font-weight: 600; color: var(--admin-text); margin-top: 2px;">
            ${escapeHtml(event.room || event.location || 'Campus')}
          </div>
        </div>
      </div>

      ${event.course_code ? `
        <div style="background: #faf8fd; padding: 12px; border-radius: var(--admin-radius-sm); border: 1px solid var(--admin-border); margin-bottom: 16px;">
          <div style="font-size: 12px; color: var(--admin-muted);">Course Details</div>
          <div style="font-size: 14px; font-weight: 700; color: var(--admin-text);">${event.course_code} - ${escapeHtml(event.course_name || '')}</div>
          <div style="font-size: 12px; color: var(--admin-muted); margin-top: 2px;">Class: ${event.class_name || 'All'} ${event.division ? `(Div ${event.division})` : ''}</div>
        </div>
      ` : ''}

      ${event.instructions ? `
        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; color: var(--admin-muted); font-weight: 500;">Instructions & Rules</div>
          <div style="background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 10px; border-radius: var(--admin-radius-sm); font-size: 13px; margin-top: 4px; line-height: 1.4;">
            ${escapeHtml(event.instructions)}
          </div>
        </div>
      ` : ''}

      ${event.description ? `
        <div style="margin-bottom: 16px;">
          <div style="font-size: 12px; color: var(--admin-muted); font-weight: 500;">Description</div>
          <div style="font-size: 13.5px; color: var(--admin-text); margin-top: 4px; line-height: 1.4;">
            ${escapeHtml(event.description)}
          </div>
        </div>
      ` : ''}

      <div style="font-size: 11px; color: var(--admin-light); border-top: 1px solid var(--admin-border); padding-top: 10px;">
        Created by ${event.creator_name || 'System Admin'} on ${new Date(event.created_at).toLocaleDateString()}
      </div>
    `;

    elements.detailsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeDetailsModal() {
    elements.detailsModal.classList.add('hidden');
    document.body.style.overflow = '';
    state.selectedEvent = null;
  }

  // Handle Create / Edit form submit
  async function handleFormSubmit(e) {
    e.preventDefault();

    const eventId = elements.modalEventId.value;
    const isEdit = Boolean(eventId);

    const payload = {
      title: elements.modalTitle.value.trim(),
      event_type: elements.modalEventType.value,
      exam_type: elements.modalEventType.value === 'EXAM' ? elements.modalExamType.value : null,
      start_date: elements.modalStartDate.value,
      end_date: elements.modalEndDate.value || elements.modalStartDate.value,
      start_time: elements.modalStartTime.value || null,
      end_time: elements.modalEndTime.value || null,
      location: elements.modalLocation.value.trim() || null,
      room: elements.modalRoom.value.trim() || null,
      target_audience: elements.modalTargetAudience.value,
      department_id: elements.modalDepartment.value ? parseInt(elements.modalDepartment.value, 10) : null,
      course_id: elements.modalCourse.value ? parseInt(elements.modalCourse.value, 10) : null,
      class_name: elements.modalClassName.value.trim() || null,
      instructions: elements.modalInstructions.value.trim() || null,
      description: elements.modalDescription.value.trim() || null
    };

    try {
      if (isEdit) {
        await api.put(`/academic-events/${eventId}`, payload);
        showToast('Academic event updated successfully', 'success');
      } else {
        await api.post('/academic-events', payload);
        showToast('Academic event created successfully', 'success');
      }
      closeEventModal();
      await loadEvents();
    } catch (err) {
      console.error('Save event failed:', err);
      showToast(err.message || 'Failed to save academic event', 'error');
    }
  }

  // Delete event
  async function handleDeleteEvent(eventId, title) {
    if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/academic-events/${eventId}`);
      showToast('Academic event deleted successfully', 'success');
      closeDetailsModal();
      await loadEvents();
    } catch (err) {
      console.error('Delete event failed:', err);
      showToast(err.message || 'Failed to delete academic event', 'error');
    }
  }

  // Trigger automatic reminders
  async function triggerReminders() {
    try {
      elements.triggerRemindersBtn.disabled = true;
      elements.triggerRemindersBtn.innerHTML = 'Evaluating...';

      const res = await api.post('/academic-events/trigger-reminders', {});
      const info = res.data;
      showToast(`Reminders evaluated: ${info.dispatchedCount} dispatched (${info.checkedCount} checks)`, 'success');
    } catch (err) {
      console.error('Reminder trigger error:', err);
      showToast('Failed to trigger reminders', 'error');
    } finally {
      elements.triggerRemindersBtn.disabled = false;
      elements.triggerRemindersBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
        <span>Trigger Reminders</span>
      `;
    }
  }

  // Utility
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      padding: 12px 18px;
      border-radius: var(--admin-radius-sm);
      margin-top: 10px;
      font-size: 13.5px;
      font-weight: 600;
      color: #ffffff;
      background: ${type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#7c3aed'};
      box-shadow: var(--admin-shadow-md);
      transition: opacity 0.3s;
    `;
    toast.textContent = msg;
    const c = document.getElementById('toastContainer');
    if (c) {
      c.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    }
  }

  // Expose helpers globally for HTML onclick handlers
  window.adminCalendar = {
    openDetailsModal,
    openEditFromList: (id) => {
      const ev = state.events.find(e => e.event_id === id);
      if (ev) openEventModal(ev);
    },
    confirmDelete: (id, title) => handleDeleteEvent(id, title),
    openEventModalWithDate,
    openExamModal,
    openDayList: (dateStr) => {
      elements.filterSearch.value = '';
      state.activeView = 'LIST';
      elements.viewModeTabs.querySelectorAll('.cal-view-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = '#f1f5f9';
        b.style.color = 'var(--admin-text)';
        if (b.dataset.view === 'LIST') {
          b.classList.add('active');
          b.style.background = 'var(--admin-primary)';
          b.style.color = '#fff';
        }
      });
      switchView('LIST');
    }
  };

})();
