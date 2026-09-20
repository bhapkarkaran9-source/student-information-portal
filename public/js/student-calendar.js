/**
 * Student Academic Calendar & Exam Schedule Controller
 * Student Information Portal - Student Portal
 */

(function () {
  'use strict';

  // State
  const state = {
    currentDate: new Date(),
    activeView: 'MONTH',
    events: [],
    selectedEvent: null
  };

  // DOM Elements
  let elements = {};

  document.addEventListener('DOMContentLoaded', async () => {
    const user = auth.getUser();
    if (!user || (user.role !== 'STUDENT' && user.role !== 'ADMIN')) {
      window.location.href = '/login.html';
      return;
    }

    cacheElements();
    attachEventListeners();
    await loadEvents();
  });

  function cacheElements() {
    elements = {
      statTotalEvents: document.getElementById('statTotalEvents'),
      statTotalExams: document.getElementById('statTotalExams'),
      statTotalHolidays: document.getElementById('statTotalHolidays'),
      statTotalEventsCampus: document.getElementById('statTotalEventsCampus'),
      viewTabsContainer: document.getElementById('viewTabsContainer'),
      calendarNavControls: document.getElementById('calendarNavControls'),
      prevPeriodBtn: document.getElementById('prevPeriodBtn'),
      todayPeriodBtn: document.getElementById('todayPeriodBtn'),
      nextPeriodBtn: document.getElementById('nextPeriodBtn'),
      currentPeriodTitle: document.getElementById('currentPeriodTitle'),
      filterSearch: document.getElementById('filterSearch'),
      filterEventType: document.getElementById('filterEventType'),
      monthViewContainer: document.getElementById('monthViewContainer'),
      weekViewContainer: document.getElementById('weekViewContainer'),
      listViewContainer: document.getElementById('listViewContainer'),
      examsViewContainer: document.getElementById('examsViewContainer'),
      calendarGridBody: document.getElementById('calendarGridBody'),
      weekViewGrid: document.getElementById('weekViewGrid'),
      agendaTableBody: document.getElementById('agendaTableBody'),
      listTotalCount: document.getElementById('listTotalCount'),
      examsTableBody: document.getElementById('examsTableBody'),
      detailsModal: document.getElementById('detailsModal'),
      detailsModalTitle: document.getElementById('detailsModalTitle'),
      detailsTypeBadge: document.getElementById('detailsTypeBadge'),
      detailsModalContent: document.getElementById('detailsModalContent'),
      closeDetailsModalBtn: document.getElementById('closeDetailsModalBtn'),
      closeDetailsBtn: document.getElementById('closeDetailsBtn')
    };
  }

  function attachEventListeners() {
    // View tabs
    elements.viewTabsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.cal-view-tab');
      if (!btn) return;
      elements.viewTabsContainer.querySelectorAll('.cal-view-tab').forEach(b => {
        b.classList.remove('active');
        b.style.background = '#f1f5f9';
        b.style.color = '#334155';
      });
      btn.classList.add('active');
      btn.style.background = '#2563eb';
      btn.style.color = '#ffffff';

      state.activeView = btn.dataset.view;
      switchView(state.activeView);
    });

    // Date navigation
    elements.prevPeriodBtn.addEventListener('click', () => navigatePeriod(-1));
    elements.nextPeriodBtn.addEventListener('click', () => navigatePeriod(1));
    elements.todayPeriodBtn.addEventListener('click', () => {
      state.currentDate = new Date();
      renderCurrentView();
    });

    // Filters
    elements.filterSearch.addEventListener('input', () => renderCurrentView());
    elements.filterEventType.addEventListener('change', () => renderCurrentView());

    // Modals
    elements.closeDetailsModalBtn.addEventListener('click', closeDetailsModal);
    elements.closeDetailsBtn.addEventListener('click', closeDetailsModal);

    elements.detailsModal.addEventListener('click', (e) => {
      if (e.target === elements.detailsModal) closeDetailsModal();
    });
  }

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

  async function loadEvents() {
    try {
      const res = await api.get('/academic-events?all=true');
      const list = (res && res.data && Array.isArray(res.data.events)) ? res.data.events : (res && Array.isArray(res.events) ? res.events : (Array.isArray(res) ? res : []));
      state.events = list;
      updateKpis();
      renderCurrentView();
    } catch (err) {
      console.error('Failed to load student events:', err);
      showToast('Failed to load academic events', 'error');
    }
  }

  function updateKpis() {
    elements.statTotalEvents.textContent = state.events.length;
    elements.statTotalExams.textContent = state.events.filter(e => e.event_type === 'EXAM').length;
    elements.statTotalHolidays.textContent = state.events.filter(e => e.event_type === 'HOLIDAY').length;
    elements.statTotalEventsCampus.textContent = state.events.filter(e => ['COLLEGE_EVENT', 'SEMINAR'].includes(e.event_type)).length;
  }

  function getFilteredEvents() {
    const search = elements.filterSearch.value.trim().toLowerCase();
    const type = elements.filterEventType.value;

    return state.events.filter(e => {
      if (type && e.event_type !== type) return false;
      if (search) {
        const matches = (
          (e.title && e.title.toLowerCase().includes(search)) ||
          (e.description && e.description.toLowerCase().includes(search)) ||
          (e.room && e.room.toLowerCase().includes(search)) ||
          (e.location && e.location.toLowerCase().includes(search)) ||
          (e.course_code && e.course_code.toLowerCase().includes(search))
        );
        if (!matches) return false;
      }
      return true;
    });
  }

  function getPillClass(type) {
    const map = {
      EXAM: 'pill-exam',
      HOLIDAY: 'pill-holiday',
      SEMINAR: 'pill-seminar',
      COLLEGE_EVENT: 'pill-college_event',
      ASSIGNMENT: 'pill-assignment',
      RESULT: 'pill-result'
    };
    return map[type] || 'pill-other';
  }

  function isDateInRange(dateStr, startDateStr, endDateStr) {
    return dateStr >= startDateStr && dateStr <= endDateStr;
  }

  // A. MONTH GRID
  function renderMonthGrid(filteredEvents) {
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startingDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const todayStr = new Date().toISOString().split('T')[0];
    const prevLastDay = new Date(year, month, 0).getDate();

    let gridHtml = '';

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
          <div class="event-pill ${pillCls}" title="${escapeHtml(e.title)}" onclick="window.studentCalendar.openDetailsModal(${e.event_id})">
            <span>${timePrefix}${escapeHtml(e.title)}</span>
          </div>
        `;
      });

      if (extraCount > 0) {
        eventsHtml += `
          <div class="event-pill pill-other" style="font-size: 10px; text-align: center; justify-content: center; cursor: pointer;" onclick="window.studentCalendar.openDayList('${dateStr}')">
            +${extraCount} more
          </div>
        `;
      }

      gridHtml += `
        <div class="calendar-day-cell ${isToday ? 'today' : ''}" data-date="${dateStr}">
          <div class="day-number-row">
            <span class="day-number">${d}</span>
          </div>
          <div class="day-events-list">
            ${eventsHtml}
          </div>
        </div>
      `;
    }

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
    const diff = d.getDate() - day;
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
        eventsHtml = `<div style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 40px;">No events scheduled</div>`;
      } else {
        dayEvents.forEach(e => {
          const pillCls = getPillClass(e.event_type);
          eventsHtml += `
            <div class="card" style="padding: 10px; border-left: 3px solid #2563eb; cursor: pointer;" onclick="window.studentCalendar.openDetailsModal(${e.event_id})">
              <span class="event-pill ${pillCls}" style="display: inline-block; margin-bottom: 4px;">${e.event_type}</span>
              <div style="font-size: 13px; font-weight: 700; color: #0f172a; line-height: 1.3;">${escapeHtml(e.title)}</div>
              ${e.start_time ? `<div style="font-size: 11px; color: #64748b; margin-top: 4px;">🕒 ${e.start_time.slice(0, 5)}${e.end_time ? ` - ${e.end_time.slice(0, 5)}` : ''}</div>` : ''}
              ${e.room || e.location ? `<div style="font-size: 11px; color: #64748b;">📍 ${escapeHtml(e.room || e.location)}</div>` : ''}
            </div>
          `;
        });
      }

      weekHtml += `
        <div class="week-day-col">
          <div class="week-col-header ${isToday ? 'today' : ''}">
            <div style="font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase;">${dayNames[i]}</div>
            <div style="font-size: 18px; font-weight: 700; color: ${isToday ? '#2563eb' : '#0f172a'};">${cur.getDate()}</div>
          </div>
          <div class="week-col-body">
            ${eventsHtml}
          </div>
        </div>
      `;
    }

    elements.weekViewGrid.innerHTML = weekHtml;
  }

  // C. LIST VIEW
  function renderAgendaList(filteredEvents) {
    elements.listTotalCount.textContent = `Showing ${filteredEvents.length} events`;

    if (filteredEvents.length === 0) {
      elements.agendaTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 30px; color: #64748b;">
            No events match your search criteria.
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

      rowsHtml += `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 10px; white-space: nowrap; font-size: 13px; font-weight: 600;">${dateRangeStr}</td>
          <td style="padding: 12px 10px;">
            <div style="font-weight: 700; color: #0f172a;">${escapeHtml(e.title)}</div>
            <span class="event-pill ${pillCls}" style="display: inline-block; margin-top: 4px;">${e.event_type}${e.exam_type ? ` • ${e.exam_type}` : ''}</span>
          </td>
          <td style="padding: 12px 10px; font-size: 13px;">${escapeHtml(e.room || e.location || 'Campus')}</td>
          <td style="padding: 12px 10px; font-size: 13px;">
            <span class="badge" style="background: #eff6ff; color: #1e40af; padding: 3px 8px; border-radius: 4px;">${e.target_audience}</span>
            ${e.course_code ? ` <span style="font-weight: 600;">${e.course_code}</span>` : ''}
          </td>
          <td style="padding: 12px 10px; text-align: right;">
            <button type="button" class="btn btn-sm" style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer;" onclick="window.studentCalendar.openDetailsModal(${e.event_id})">View Details</button>
          </td>
        </tr>
      `;
    });

    elements.agendaTableBody.innerHTML = rowsHtml;
  }

  // D. EXAMS TABLE
  function renderExamsTable(exams) {
    if (exams.length === 0) {
      elements.examsTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 30px; color: #64748b;">
            No examinations scheduled for your enrolled courses or department.
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    exams.forEach(e => {
      const timeStr = e.start_time ? `${e.start_time.slice(0, 5)} - ${e.end_time ? e.end_time.slice(0, 5) : 'End'}` : 'TBD';
      rowsHtml += `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 10px; white-space: nowrap;">
            <div style="font-weight: 700; color: #0f172a; font-size: 13.5px;">${e.start_date}</div>
            <div style="font-size: 12px; color: #64748b;">🕒 ${timeStr}</div>
          </td>
          <td style="padding: 12px 10px;">
            <div style="font-weight: 700; color: #2563eb;">${e.course_code || 'General'}</div>
            <div style="font-size: 12px; color: #64748b;">${escapeHtml(e.course_name || e.title)}</div>
          </td>
          <td style="padding: 12px 10px;">
            <span class="event-pill pill-exam" style="display: inline-block;">${e.exam_type || 'Exam'}</span>
          </td>
          <td style="padding: 12px 10px; font-size: 13px;">
            <div style="font-weight: 600;">${escapeHtml(e.room || 'TBD')}</div>
            <div style="font-size: 11px; color: #64748b;">${escapeHtml(e.location || '')}</div>
          </td>
          <td style="padding: 12px 10px; font-size: 12px; max-width: 200px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(e.instructions || '')}">
            ${escapeHtml(e.instructions || 'Standard hall rules apply')}
          </td>
          <td style="padding: 12px 10px; text-align: right;">
            <button type="button" class="btn btn-sm" style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer;" onclick="window.studentCalendar.openDetailsModal(${e.event_id})">View Details</button>
          </td>
        </tr>
      `;
    });

    elements.examsTableBody.innerHTML = rowsHtml;
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
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
        <div>
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Date</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px;">
            ${event.start_date}${event.end_date !== event.start_date ? ` to ${event.end_date}` : ''}
          </div>
        </div>
        <div>
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Timing</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px;">${timeStr}</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
        <div>
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Category</div>
          <div style="font-size: 13.5px; font-weight: 600; color: #0f172a; margin-top: 2px;">
            <span class="badge" style="background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 4px;">${event.event_type}</span>
          </div>
        </div>
        <div>
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Venue / Seating Hall</div>
          <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 2px;">
            ${escapeHtml(event.room || event.location || 'Campus')}
          </div>
        </div>
      </div>

      ${event.course_code ? `
        <div style="background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 14px;">
          <div style="font-size: 12px; color: #64748b;">Course / Subject</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${event.course_code} - ${escapeHtml(event.course_name || '')}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Department: ${event.department_name || event.department_code || '-'}</div>
        </div>
      ` : ''}

      ${event.instructions ? `
        <div style="margin-bottom: 14px;">
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Important Student Instructions</div>
          <div style="background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 10px 12px; border-radius: 6px; font-size: 13px; margin-top: 4px; line-height: 1.4;">
            ${escapeHtml(event.instructions)}
          </div>
        </div>
      ` : ''}

      ${event.description ? `
        <div style="margin-bottom: 14px;">
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Event Details</div>
          <div style="font-size: 13.5px; color: #0f172a; margin-top: 4px; line-height: 1.4;">
            ${escapeHtml(event.description)}
          </div>
        </div>
      ` : ''}
    `;

    elements.detailsModal.classList.remove('hidden');
  }

  function closeDetailsModal() {
    elements.detailsModal.classList.add('hidden');
    state.selectedEvent = null;
  }

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
      border-radius: 6px;
      margin-top: 10px;
      font-size: 13.5px;
      font-weight: 600;
      color: #ffffff;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#2563eb'};
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
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

  window.studentCalendar = {
    openDetailsModal,
    openDayList: (dateStr) => {
      elements.filterSearch.value = '';
      state.activeView = 'LIST';
      elements.viewTabsContainer.querySelectorAll('.cal-view-tab').forEach(b => {
        b.classList.remove('active');
        b.style.background = '#f1f5f9';
        b.style.color = '#334155';
        if (b.dataset.view === 'LIST') {
          b.classList.add('active');
          b.style.background = '#2563eb';
          b.style.color = '#ffffff';
        }
      });
      switchView('LIST');
    }
  };

})();
