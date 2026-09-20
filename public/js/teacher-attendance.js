/**
 * Teacher Attendance Controller - Student Information Portal
 * Supports Course Selection, Date/Session Choice, Interactive Roster Marking,
 * Bulk Submission to POST /api/attendance, and Recent History Logs.
 * 100% Zero Images | Pure CSS Gradients & SVGs | Accessible ERP Theme
 */

(function () {
  'use strict';

  let currentTeacher = null;
  let allCourses = [];
  let currentStudents = [];
  let cachedScheduledSlots = [];
  let activeAdminTimetableSlots = [];
  let selectedAdminTimetableSlot = null;

  // Dynamic QR Attendance State
  let activeQRSession = null;
  let qrCodeInstance = null;
  let qrCountdownTimer = null;
  let qrTokenRefreshTimer = null;
  let qrCountdownRemainingSeconds = 0;
  let allTeacherTimetableSlots = [];

  function getDayNameFromDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return days[d.getDay()];
    }
    return '';
  }

  function formatHHMM(timeStr) {
    if (!timeStr) return '';
    const parts = String(timeStr).split(':');
    return `${parts[0].padStart(2, '0')}:${(parts[1] || '00').padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.padding = '12px 18px';
    toast.style.background = type === 'success' ? '#0f766e' : type === 'error' ? '#dc2626' : '#1e293b';
    toast.style.color = '#ffffff';
    toast.style.borderRadius = '6px';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.marginBottom = '10px';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.justifyContent = 'space-between';
    toast.style.gap = '12px';
    toast.style.fontSize = '13.5px';

    toast.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <button type="button" style="background: none; border: none; color: #fff; font-size: 16px; cursor: pointer;">&times;</button>
    `;

    container.appendChild(toast);
    const closeBtn = toast.querySelector('button');
    closeBtn.addEventListener('click', () => toast.remove());
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
  }

  function formatTimeTo12Hour(timeStr) {
    if (!timeStr) return '';
    const parts = String(timeStr).split(':');
    if (parts.length < 2) return String(timeStr);
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].padStart(2, '0');
    if (isNaN(hours)) return String(timeStr);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');
    return `${strHours}:${minutes} ${ampm}`;
  }

  function formatTimeRange(startTime, endTime) {
    if (!startTime && !endTime) return 'Regular Hours';
    if (startTime && !endTime) return formatTimeTo12Hour(startTime);
    if (!startTime && endTime) return formatTimeTo12Hour(endTime);
    return `${formatTimeTo12Hour(startTime)} - ${formatTimeTo12Hour(endTime)}`;
  }

  function updateCustomTimePreview() {
    const startInput = document.getElementById('attendanceStartTime');
    const endInput = document.getElementById('attendanceEndTime');
    const previewBadge = document.getElementById('customTimePreviewBadge');
    if (!previewBadge) return;

    const sVal = startInput ? startInput.value : '';
    const eVal = endInput ? endInput.value : '';

    if (sVal && eVal) {
      previewBadge.textContent = `${formatTimeTo12Hour(sVal)} - ${formatTimeTo12Hour(eVal)}`;
      if (sVal >= eVal) {
        previewBadge.style.background = '#fee2e2';
        previewBadge.style.color = '#dc2626';
      } else {
        previewBadge.style.background = '#ccfbf1';
        previewBadge.style.color = '#0f766e';
      }
    } else {
      previewBadge.textContent = '--:-- -- - --:-- --';
      previewBadge.style.background = '#f1f5f9';
      previewBadge.style.color = '#64748b';
    }
  }

  async function loadAdminTimetableTime(preselectedSlotId = null) {
    const container = document.getElementById('adminTimetableContainer');
    const courseSelect = document.getElementById('attendanceCourseSelect');
    const dateInput = document.getElementById('attendanceDate');
    const saveBtn = document.getElementById('btnSaveAttendance');
    const periodOption = document.getElementById('attendancePeriodOption');

    if (!container || !periodOption) return;

    // 1. Immediately clear stale timetable options
    const prevVal = periodOption.value;
    periodOption.innerHTML = '';

    const courseId = courseSelect ? courseSelect.value : '';
    const dateVal = (dateInput && dateInput.value) ? dateInput.value : '';

    if (!courseId) {
      periodOption.innerHTML = '<option value="">-- Select Time Period --</option><option value="Custom Time">Custom Time</option>';
      container.innerHTML = '<div style="font-size: 13px; color: #64748b;">Select an assigned course to view scheduled timetable hours.</div>';
      selectedAdminTimetableSlot = null;
      activeAdminTimetableSlots = [];
      updateTimePeriodMode();
      return;
    }

    const dayOfWeek = getDayNameFromDate(dateVal);
    if (!dayOfWeek) {
      periodOption.innerHTML = '<option value="">-- Select Time Period --</option><option value="Custom Time">Custom Time</option>';
      container.innerHTML = '<div style="font-size: 13px; color: #64748b;">Select a valid date.</div>';
      selectedAdminTimetableSlot = null;
      activeAdminTimetableSlots = [];
      updateTimePeriodMode();
      return;
    }

    container.innerHTML = `<div style="font-size: 13px; color: #64748b;">Loading timetable slots for ${escapeHtml(dayOfWeek)}...</div>`;

    try {
      const res = await apiFetch(`/api/timetable?day_of_week=${encodeURIComponent(dayOfWeek)}&course_id=${encodeURIComponent(courseId)}&all=true`);
      let slots = [];
      if (res && res.success && res.data) {
        const rawSlots = Array.isArray(res.data) ? res.data : (res.data.timetable || res.data.slots || []);
        slots = rawSlots.filter(s => Number(s.course_id) === Number(courseId) && (!s.day_of_week || s.day_of_week.toLowerCase() === dayOfWeek.toLowerCase()));
      }

      activeAdminTimetableSlots = slots;

      if (slots.length === 0) {
        selectedAdminTimetableSlot = null;
        periodOption.innerHTML = '<option value="" selected>-- Select Time Period --</option><option value="Custom Time">Custom Time</option>';
        if (prevVal === 'Custom Time') {
          periodOption.value = 'Custom Time';
        } else {
          periodOption.value = '';
        }

        container.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; color: #c2410c; font-size: 13px; font-weight: 500;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>No timetable time found for this subject on the selected day.</span>
          </div>`;

        updateTimePeriodMode();
        return;
      }

      // Populate ALL matching slots (no duplicates, no overwriting)
      slots.forEach((s) => {
        const slotTime12 = `${formatTimeTo12Hour(s.start_time)} – ${formatTimeTo12Hour(s.end_time)}`;
        const opt = document.createElement('option');
        opt.value = `slot_${s.timetable_id || s.id}`;
        opt.textContent = `${slotTime12} (Timetable)`;
        periodOption.appendChild(opt);
      });

      // Add Custom Time option
      const customOpt = document.createElement('option');
      customOpt.value = 'Custom Time';
      customOpt.textContent = 'Custom Time';
      periodOption.appendChild(customOpt);

      // Restore selection or pick first slot
      if (prevVal === 'Custom Time') {
        periodOption.value = 'Custom Time';
        selectedAdminTimetableSlot = slots[0];
      } else if (preselectedSlotId && slots.some(s => Number(s.timetable_id || s.id) === Number(preselectedSlotId))) {
        periodOption.value = `slot_${preselectedSlotId}`;
        selectedAdminTimetableSlot = slots.find(s => Number(s.timetable_id || s.id) === Number(preselectedSlotId));
      } else {
        periodOption.value = `slot_${slots[0].timetable_id || slots[0].id}`;
        selectedAdminTimetableSlot = slots[0];
      }

      renderAdminTimetableContainer();
      updateTimePeriodMode();
    } catch (err) {
      console.error('Error fetching admin timetable:', err);
      container.innerHTML = '<div style="color: #dc2626; font-size: 13px;">Error loading timetable entry.</div>';
    }
  }

  function renderAdminTimetableContainer() {
    const container = document.getElementById('adminTimetableContainer');
    if (!container || !selectedAdminTimetableSlot) return;

    const slot = selectedAdminTimetableSlot;
    const timeDisplay = `${formatTimeTo12Hour(slot.start_time)} – ${formatTimeTo12Hour(slot.end_time)}`;
    const room = slot.room_number || slot.room_no || slot.room || 'N/A';
    const div = slot.division || 'All';
    const cls = slot.class_name || '';

    let html = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 12.5px; font-weight: 600; color: #475569;">Timetable Slot:</span>
            <span id="adminTimetableBadge" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; border-radius: 6px; font-size: 13px; font-weight: 700;">
              ${escapeHtml(timeDisplay)}
            </span>
            <span id="adminTimetableDetails" style="font-size: 12px; color: #64748b;">(Class: ${escapeHtml(cls)}, Div: ${escapeHtml(div)}, Room: ${escapeHtml(room)})</span>
          </div>
          <span style="font-size: 11.5px; color: #0f766e; background: #f0fdfa; padding: 3px 8px; border-radius: 4px; border: 1px solid #ccfbf1; font-weight: 600;">Admin Schedule (Read-Only)</span>
        </div>
      </div>`;

    container.innerHTML = html;
  }

  function updateTimePeriodMode() {
    const periodOption = document.getElementById('attendancePeriodOption');
    const adminBox = document.getElementById('adminTimetableContainer');
    const customBox = document.getElementById('customTimeContainer');
    const saveBtn = document.getElementById('btnSaveAttendance');

    const val = periodOption ? periodOption.value : '';

    if (val === 'Custom Time') {
      if (adminBox) adminBox.style.display = 'none';
      if (customBox) customBox.style.display = 'block';
      updateCustomTimePreview();
      if (saveBtn) saveBtn.disabled = currentStudents.length === 0;
    } else if (val.startsWith('slot_')) {
      if (customBox) customBox.style.display = 'none';
      if (adminBox) adminBox.style.display = 'block';
      const slotId = Number(val.replace('slot_', ''));
      const slot = activeAdminTimetableSlots.find(s => Number(s.timetable_id || s.id) === slotId);
      if (slot) {
        selectedAdminTimetableSlot = slot;
        renderAdminTimetableContainer();
      }
      if (saveBtn) saveBtn.disabled = currentStudents.length === 0;
    } else {
      // Empty / -- Select Time Period --
      if (customBox) customBox.style.display = 'none';
      if (adminBox) adminBox.style.display = 'block';
      if (saveBtn) saveBtn.disabled = true;
    }
  }

  async function loadTodayScheduledLectures() {
    const container = document.getElementById('todayScheduledLecturesContainer');
    const badge = document.getElementById('todayDayBadge');
    const subtitle = document.getElementById('scheduledLecturesSubtitle');
    const dateInput = document.getElementById('attendanceDate');

    if (!container) return;

    const selectedDate = (dateInput && dateInput.value) ? dateInput.value : (() => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    })();

    const dayOfWeek = getDayNameFromDate(selectedDate);

    if (badge) {
      badge.textContent = `${dayOfWeek} (${selectedDate})`;
    }
    if (subtitle) {
      subtitle.textContent = `Timetable slots for ${dayOfWeek} (${selectedDate})`;
    }

    container.innerHTML = '<div style="padding: 24px; text-align: center; color: #64748b; font-size: 13.5px;">Loading scheduled lectures for ' + escapeHtml(dayOfWeek) + '...</div>';

    try {
      const [timetableRes, attendanceRes] = await Promise.all([
        apiFetch(`/api/timetable?day_of_week=${encodeURIComponent(dayOfWeek)}&all=true`),
        apiFetch(`/api/attendance?date=${encodeURIComponent(selectedDate)}&limit=100`)
      ]);

      let slots = [];
      if (timetableRes && timetableRes.success && timetableRes.data) {
        slots = Array.isArray(timetableRes.data) ? timetableRes.data : (timetableRes.data.timetable || timetableRes.data.slots || []);
      }

      cachedScheduledSlots = slots;

      let recordedAttendance = [];
      if (attendanceRes && attendanceRes.success && attendanceRes.data) {
        recordedAttendance = Array.isArray(attendanceRes.data) ? attendanceRes.data : (attendanceRes.data.attendance || []);
      }

      if (slots.length === 0) {
        container.innerHTML = `
          <div style="padding: 28px 16px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
            <div style="font-size: 14px; font-weight: 600; color: #475569;">No scheduled lectures found for ${escapeHtml(dayOfWeek)}.</div>
            <div style="font-size: 12.5px; color: #94a3b8; margin-top: 4px;">You can still record manual or extra lectures using the console below.</div>
          </div>`;
        return;
      }

      let gridHtml = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">';

      slots.forEach(slot => {
        const slotStartHHMM = formatHHMM(slot.start_time);
        const slotEndHHMM = formatHHMM(slot.end_time);
        const slotCourseId = Number(slot.course_id);

        const isRecorded = recordedAttendance.some(att => {
          const sameCourse = Number(att.course_id) === slotCourseId;
          const attStartHHMM = formatHHMM(att.start_time);
          const attEndHHMM = formatHHMM(att.end_time);
          const sameStart = attStartHHMM === slotStartHHMM;
          const sameEnd = !slotEndHHMM || !attEndHHMM || (attEndHHMM === slotEndHHMM);
          return sameCourse && sameStart && sameEnd;
        });

        const time12Hour = `${formatTimeTo12Hour(slot.start_time)} – ${formatTimeTo12Hour(slot.end_time)}`;
        const courseName = slot.course_name || slot.course_title || slot.course_code || 'Course';
        const courseCode = slot.course_code || '';
        const division = slot.division || 'All';
        const room = slot.room_number || slot.room || 'N/A';

        gridHtml += `
          <div class="timetable-slot-card" style="background: #ffffff; border: 1px solid ${isRecorded ? '#bbf7d0' : '#e2e8f0'}; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: transform 0.15s, box-shadow 0.15s;">
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                <div style="font-size: 14px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  <span>${escapeHtml(time12Hour)}</span>
                </div>
                <span style="font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 4px; background: #f0fdfa; color: #0d9488; border: 1px solid #ccfbf1;">${escapeHtml(courseCode)}</span>
              </div>
              <div style="font-size: 13.5px; font-weight: 600; color: #334155; margin-bottom: 6px; line-height: 1.3;">${escapeHtml(courseName)}</div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap; font-size: 11.5px; color: #64748b;">
                <span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">Div: <strong>${escapeHtml(division)}</strong></span>
                <span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">Room: <strong>${escapeHtml(room)}</strong></span>
              </div>
            </div>

            <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between;">
              ${isRecorded ? `
                <span class="badge-recorded" style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 6px; font-size: 12px; font-weight: 600;">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  Attendance Already Recorded
                </span>
              ` : `
                <span style="font-size: 12px; color: #d97706; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  Pending
                </span>
                <button type="button" class="btn btn-sm btn-mark-timetable" data-timetable-id="${slot.timetable_id || slot.id}" style="padding: 6px 14px; font-size: 12.5px; font-weight: 600; background: #0d9488; color: #ffffff; border: none; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background 0.2s;">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                  Mark Attendance
                </button>
              `}
            </div>
          </div>
        `;
      });

      gridHtml += '</div>';
      container.innerHTML = gridHtml;

      container.querySelectorAll('.btn-mark-timetable').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const tid = parseInt(btn.getAttribute('data-timetable-id'), 10);
          await handleSelectScheduledLecture(tid);
        });
      });

    } catch (err) {
      console.error('Error loading today scheduled lectures:', err);
      container.innerHTML = `
        <div style="padding: 16px; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 6px; color: #dc2626; font-size: 13px;">
          Failed to load scheduled lectures for ${escapeHtml(dayOfWeek)}. Please refresh or verify timetable settings.
        </div>`;
    }
  }

  async function handleSelectScheduledLecture(timetableId) {
    const slot = cachedScheduledSlots.find(s => Number(s.timetable_id) === Number(timetableId) || Number(s.id) === Number(timetableId));
    if (!slot) {
      showToast('Selected lecture slot details not found.', 'error');
      return;
    }

    const courseSelect = document.getElementById('attendanceCourseSelect');
    const lectureTypeSelect = document.getElementById('attendanceLectureType');
    const periodOption = document.getElementById('attendancePeriodOption');
    const adminBox = document.getElementById('adminTimetableContainer');
    const customBox = document.getElementById('customTimeContainer');

    // 1. Populate Course & trigger roster load for ONLY enrolled students
    if (courseSelect) {
      courseSelect.value = String(slot.course_id);
      await loadStudentRoster();
    }

    // 2. Select "Admin Timetable Time"
    if (periodOption) {
      periodOption.value = 'Admin Timetable Time';
    }
    if (customBox) customBox.style.display = 'none';
    if (adminBox) adminBox.style.display = 'block';

    // 3. Preselect and render timetable slot
    selectedAdminTimetableSlot = slot;
    await loadAdminTimetableTime(slot.timetable_id || slot.id);

    // 4. Set Lecture Type to "Regular Lecture"
    if (lectureTypeSelect) {
      lectureTypeSelect.value = 'Regular Lecture';
    }

    // 5. Smooth scroll to console card
    if (courseSelect) {
      courseSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
      courseSelect.focus();
    }

    const time12Hour = `${formatTimeTo12Hour(slot.start_time)} - ${formatTimeTo12Hour(slot.end_time)}`;
    showToast(`Loaded scheduled lecture: ${slot.course_code || 'Course'} (${time12Hour})`, 'info');
  }

  // =========================================================================
  // DYNAMIC QR ATTENDANCE CONTROLLER
  // =========================================================================

  async function initQRAttendance() {
    // 1. Set today's date in custom date input
    const qrCustomDateInput = document.getElementById('qrCustomDate');
    if (qrCustomDateInput && !qrCustomDateInput.value) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      qrCustomDateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    // 2. Mode Radio Toggles
    const modeTimetableRadio = document.getElementById('qrModeTimetable');
    const modeCustomRadio = document.getElementById('qrModeCustom');
    const timetableContainer = document.getElementById('qrTimetableModeContainer');
    const customContainer = document.getElementById('qrCustomModeContainer');
    const timetableLabel = document.getElementById('qrModeTimetableLabel');
    const customLabel = document.getElementById('qrModeCustomLabel');

    function updateQRModeUI() {
      const isTimetable = modeTimetableRadio && modeTimetableRadio.checked;
      if (timetableContainer) timetableContainer.style.display = isTimetable ? 'block' : 'none';
      if (customContainer) customContainer.style.display = isTimetable ? 'none' : 'block';

      if (timetableLabel) {
        timetableLabel.style.borderColor = isTimetable ? '#0d9488' : '#e2e8f0';
        timetableLabel.style.background = isTimetable ? '#f0fdfa' : '#ffffff';
      }
      if (customLabel) {
        customLabel.style.borderColor = isTimetable ? '#e2e8f0' : '#0d9488';
        customLabel.style.background = isTimetable ? '#ffffff' : '#f0fdfa';
      }
    }

    modeTimetableRadio?.addEventListener('change', updateQRModeUI);
    modeCustomRadio?.addEventListener('change', updateQRModeUI);

    // 3. Timetable slot selection change -> preview slot
    const timetableSelect = document.getElementById('qrTimetableSelect');
    timetableSelect?.addEventListener('change', handleQRTimetableSlotChange);

    // 4. Start QR session button
    const startBtn = document.getElementById('btnStartQRSession');
    startBtn?.addEventListener('click', handleStartQRSession);

    // 5. Close QR session button
    const closeBtn = document.getElementById('btnCloseQRSession');
    closeBtn?.addEventListener('click', handleCloseQRSession);

    // 6. Manual Rotate Token button
    const refreshBtn = document.getElementById('btnManualRefreshQR');
    refreshBtn?.addEventListener('click', handleManualRotateToken);

    // 7. Start New Session button (after expired or closed)
    const newSessionBtn = document.getElementById('btnNewQRSession');
    newSessionBtn?.addEventListener('click', resetQRToSetup);

    // 8. Toggle student QR visibility button (Default OFF for safety)
    const toggleVisibilityBtn = document.getElementById('btnToggleStudentVisibility');
    toggleVisibilityBtn?.addEventListener('click', handleToggleStudentQRVisibility);

    // 9. Fetch teacher timetable slots for dropdown
    await loadTeacherTimetableForQR();

    // 10. Check if teacher has an active QR session running (active recovery on page load)
    await checkActiveQRSessionOnLoad();
  }

  async function loadTeacherTimetableForQR() {
    const select = document.getElementById('qrTimetableSelect');
    if (!select) return;

    try {
      const res = await apiFetch('/api/timetable?all=true');
      let slots = [];
      if (res && res.success && res.data) {
        slots = Array.isArray(res.data) ? res.data : (res.data.timetable || res.data.slots || []);
      }

      allTeacherTimetableSlots = slots;
      populateQRTimetableSlotsDropdown(slots);
    } catch (err) {
      console.error('Error fetching teacher timetable for QR:', err);
      select.innerHTML = '<option value="">Error loading timetable slots</option>';
    }
  }

  function populateQRTimetableSlotsDropdown(slots) {
    const select = document.getElementById('qrTimetableSelect');
    if (!select) return;

    if (!slots || slots.length === 0) {
      select.innerHTML = '<option value="">-- No Timetable Slots Assigned --</option>';
      const preview = document.getElementById('qrTimetableSlotPreview');
      if (preview) preview.style.display = 'none';
      return;
    }

    const todayDate = (document.getElementById('attendanceDate')?.value) || new Date().toISOString().slice(0, 10);
    const todayDay = getDayNameFromDate(todayDate);

    // Sort: today's slots first, then other days
    const sorted = [...slots].sort((a, b) => {
      const aToday = (a.day_of_week === todayDay) ? 0 : 1;
      const bToday = (b.day_of_week === todayDay) ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      return String(a.start_time || '').localeCompare(String(b.start_time || ''));
    });

    select.innerHTML = '<option value="">-- Select a Scheduled Lecture --</option>';
    sorted.forEach(slot => {
      const slotId = slot.timetable_id || slot.id;
      const course = slot.course_code ? `${slot.course_code} - ${slot.course_name || ''}` : (slot.course_name || 'Course');
      const timeStr = formatTimeRange(slot.start_time, slot.end_time);
      const isToday = (slot.day_of_week === todayDay);
      const dayLabel = isToday ? `Today (${slot.day_of_week})` : slot.day_of_week;
      const room = slot.room_no || slot.room_number || slot.room || 'N/A';

      const opt = document.createElement('option');
      opt.value = slotId;
      opt.textContent = `[${dayLabel}] ${course} (${timeStr}) - Room: ${room}`;
      select.appendChild(opt);
    });

    // Auto-select first slot if available
    if (sorted.length > 0) {
      select.value = String(sorted[0].timetable_id || sorted[0].id);
      handleQRTimetableSlotChange();
    }
  }

  function handleQRTimetableSlotChange() {
    const select = document.getElementById('qrTimetableSelect');
    const preview = document.getElementById('qrTimetableSlotPreview');
    if (!select || !preview) return;

    const slotId = parseInt(select.value, 10);
    if (!slotId) {
      preview.style.display = 'none';
      return;
    }

    const slot = allTeacherTimetableSlots.find(s => (s.timetable_id || s.id) === slotId);
    if (!slot) {
      preview.style.display = 'none';
      return;
    }

    const courseEl = document.getElementById('qrSlotPreviewCourse');
    const timeEl = document.getElementById('qrSlotPreviewTime');
    const metaEl = document.getElementById('qrSlotPreviewMeta');

    if (courseEl) {
      courseEl.textContent = `${slot.course_code || 'Course'} - ${slot.course_name || ''}`;
    }
    if (timeEl) {
      timeEl.textContent = `${slot.day_of_week}: ${formatTimeRange(slot.start_time, slot.end_time)}`;
    }
    if (metaEl) {
      const div = slot.division || 'All';
      const room = slot.room_no || slot.room_number || slot.room || 'N/A';
      metaEl.textContent = `Div: ${div} | Room: ${room}`;
    }

    preview.style.display = 'block';
  }

  function populateQRCoursesDropdown() {
    const select = document.getElementById('qrCustomCourseSelect');
    if (!select) return;

    if (!allCourses || allCourses.length === 0) {
      select.innerHTML = '<option value="">-- No Assigned Courses --</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Select Assigned Course --</option>';
    allCourses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.course_id;
      opt.textContent = `${c.course_code} - ${c.course_name}`;
      select.appendChild(opt);
    });
  }

  async function checkActiveQRSessionOnLoad() {
    try {
      const res = await apiRequest('/attendance/qr/active');
      if (res.ok && res.data && res.data.active && res.data.session) {
        startLiveQRView(res.data.session);
      } else {
        resetQRToSetup();
      }
    } catch (err) {
      console.warn('Could not check active QR session on load:', err);
      resetQRToSetup();
    }
  }

  function resolveDurationPayload(val) {
    const clean = String(val || '').trim().toLowerCase();
    if (clean === '30 seconds' || clean === '30s' || clean === '30' || clean === '0.5' || clean === '0.5m') {
      return { duration_minutes: 0.5, duration_seconds: 30, duration: '30s' };
    }
    const mins = parseFloat(clean) || 5;
    return { duration_minutes: mins, duration: `${mins}m` };
  }

  async function handleStartQRSession() {
    const startBtn = document.getElementById('btnStartQRSession');
    const modeTimetableRadio = document.getElementById('qrModeTimetable');
    const isTimetable = modeTimetableRadio && modeTimetableRadio.checked;

    let payload = {};

    if (isTimetable) {
      const timetableSelect = document.getElementById('qrTimetableSelect');
      const validitySelect = document.getElementById('qrTimetableValiditySelect');
      const slotId = timetableSelect ? parseInt(timetableSelect.value, 10) : null;

      if (!slotId) {
        showToast('Please select a timetable lecture slot.', 'error');
        return;
      }

      const slot = allTeacherTimetableSlots.find(s => (s.timetable_id || s.id) === slotId);
      const todayDate = (document.getElementById('attendanceDate')?.value) || new Date().toISOString().slice(0, 10);
      const dur = resolveDurationPayload(validitySelect ? validitySelect.value : '5 minutes');

      payload = {
        timetable_id: slotId,
        duration_minutes: dur.duration_minutes,
        duration_seconds: dur.duration_seconds,
        duration: dur.duration,
        session_date: todayDate,
        lecture_type: 'Regular Lecture'
      };
    } else {
      const courseSelect = document.getElementById('qrCustomCourseSelect');
      const dateInput = document.getElementById('qrCustomDate');
      const startInput = document.getElementById('qrCustomStartTime');
      const endInput = document.getElementById('qrCustomEndTime');
      const roomInput = document.getElementById('qrCustomRoomNo');
      const typeSelect = document.getElementById('qrCustomLectureType');
      const validitySelect = document.getElementById('qrCustomValiditySelect');

      const courseId = courseSelect ? parseInt(courseSelect.value, 10) : null;
      if (!courseId) {
        showToast('Please select an assigned course for extra lecture.', 'error');
        return;
      }

      const sessionDate = dateInput ? dateInput.value.trim() : '';
      if (!sessionDate) {
        showToast('Please select a valid lecture date.', 'error');
        return;
      }

      const startTime = startInput ? startInput.value.trim() : '';
      const endTime = endInput ? endInput.value.trim() : '';
      if (!startTime || !endTime) {
        showToast('Please specify both start time and end time.', 'error');
        return;
      }
      if (startTime >= endTime) {
        showToast('Start time must be before end time.', 'error');
        return;
      }

      const roomNo = roomInput ? roomInput.value.trim() : '';
      const lectureType = typeSelect ? typeSelect.value : 'Extra / Additional Lecture';
      const dur = resolveDurationPayload(validitySelect ? validitySelect.value : '5 minutes');

      payload = {
        course_id: courseId,
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
        room_no: roomNo || null,
        lecture_type: lectureType,
        duration_minutes: dur.duration_minutes,
        duration_seconds: dur.duration_seconds,
        duration: dur.duration
      };
    }

    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'Starting Session...';
    }

    try {
      const res = await apiRequest('/attendance/qr/start', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.ok && res.data && res.data.success) {
        showToast('QR Attendance session started successfully!', 'success');
        startLiveQRView(res.data.data || res.data);
      } else if (res.status === 409) {
        // Conflict: active session already exists
        showToast(res.data?.message || 'An active attendance session is already in progress. Restoring active session.', 'info');
        if (res.data && res.data.active_session) {
          startLiveQRView(res.data.active_session);
        } else {
          await checkActiveQRSessionOnLoad();
        }
      } else if (res.status === 403) {
        showToast(res.data?.message || 'You are not authorized to start attendance for this course.', 'error');
      } else if (res.status === 401) {
        showToast('Login required. Please sign in again.', 'error');
      } else if (res.status === 400) {
        showToast(res.data?.message || 'Invalid lecture parameters. Please check your inputs.', 'error');
      } else {
        showToast(res.data?.message || 'Failed to start QR attendance session.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error starting QR session.', 'error');
    } finally {
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          Start QR Attendance Session`;
      }
    }
  }

  function startLiveQRView(sessionData) {
    activeQRSession = sessionData;

    // 1. Switch Panels
    const setupPanel = document.getElementById('qrSetupPanel');
    const livePanel = document.getElementById('qrLivePanel');
    if (setupPanel) setupPanel.style.display = 'none';
    if (livePanel) livePanel.style.display = 'block';

    // 2. Global status badge
    const globalBadge = document.getElementById('qrGlobalStatusBadge');
    if (globalBadge) {
      globalBadge.innerHTML = '<span style="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;"></span> Active Session';
      globalBadge.style.background = '#dcfce7';
      globalBadge.style.color = '#15803d';
    }

    // 3. Live status badge
    const liveBadge = document.getElementById('qrLiveStatusBadge');
    const liveDot = document.getElementById('qrLiveStatusDot');
    const liveText = document.getElementById('qrLiveStatusText');
    if (liveBadge) {
      liveBadge.style.background = '#dcfce7';
      liveBadge.style.color = '#15803d';
      liveBadge.style.borderColor = '#bbf7d0';
    }
    if (liveDot) liveDot.style.background = '#22c55e';
    if (liveText) liveText.textContent = 'ACTIVE';

    // 4. Session ID display
    const sessionDisplay = document.getElementById('qrSessionIdDisplay');
    if (sessionDisplay) {
      sessionDisplay.textContent = `Session #${sessionData.session_id || '--'} (${sessionData.session_uuid ? sessionData.session_uuid.slice(0, 8) + '...' : ''})`;
    }

    // 4b. Sync student QR visibility state
    updateStudentVisibilityUI(!!sessionData.student_qr_visible);

    // 5. Lecture Metadata
    const courseEl = document.getElementById('qrLiveCourseName');
    const facultyEl = document.getElementById('qrLiveFacultyName');
    const typeEl = document.getElementById('qrLiveLectureType');
    const dateEl = document.getElementById('qrLiveDate');
    const timeEl = document.getElementById('qrLiveTime');
    const roomEl = document.getElementById('qrLiveRoom');

    if (courseEl) {
      const code = sessionData.course_code ? `${sessionData.course_code} - ` : '';
      courseEl.textContent = `${code}${sessionData.course_name || 'Course'}`;
    }
    if (facultyEl) {
      facultyEl.textContent = sessionData.teacher_name || (currentTeacher ? currentTeacher.name : 'Faculty Member');
    }
    if (typeEl) {
      typeEl.textContent = sessionData.lecture_type || 'Regular Lecture';
    }
    if (dateEl) {
      dateEl.textContent = sessionData.session_date || '--';
    }
    if (timeEl) {
      timeEl.textContent = formatTimeRange(sessionData.start_time, sessionData.end_time);
    }
    if (roomEl) {
      roomEl.textContent = sessionData.room_no || 'N/A';
    }

    // 6. Action buttons
    const closeBtn = document.getElementById('btnCloseQRSession');
    const newBtn = document.getElementById('btnNewQRSession');
    const refreshBtn = document.getElementById('btnManualRefreshQR');
    if (closeBtn) closeBtn.style.display = 'inline-flex';
    if (newBtn) newBtn.style.display = 'none';
    if (refreshBtn) refreshBtn.style.display = 'inline-flex';

    // 7. Hide overlay
    const overlay = document.getElementById('qrOverlay');
    if (overlay) overlay.style.display = 'none';

    // 8. Mount / Reinitialize QRCode instance
    const target = document.getElementById('qrCodeTarget');
    if (target) {
      target.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        qrCodeInstance = new QRCode(target, {
          text: 'INITIALIZING_TOKEN',
          width: 232,
          height: 232,
          colorDark: '#0f172a',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } else {
        target.innerHTML = '<div style="padding: 20px; font-size: 13px; color: #dc2626;">QRCode library not loaded</div>';
      }
    }

    // 9. Synchronize countdown seconds
    qrCountdownRemainingSeconds = (typeof sessionData.remaining_seconds === 'number')
      ? sessionData.remaining_seconds
      : (typeof sessionData.remaining_session_seconds === 'number'
        ? sessionData.remaining_session_seconds
        : 300);

    renderQRCountdown(qrCountdownRemainingSeconds);

    if (qrCountdownTimer) clearInterval(qrCountdownTimer);
    qrCountdownTimer = setInterval(tickQRCountdown, 1000);

    // 10. Fetch dynamic token immediately and start 25-second refresh interval
    fetchAndRenderQRToken(sessionData.session_id);

    if (qrTokenRefreshTimer) clearInterval(qrTokenRefreshTimer);
    qrTokenRefreshTimer = setInterval(() => {
      if (activeQRSession && activeQRSession.session_id) {
        fetchAndRenderQRToken(activeQRSession.session_id);
      }
    }, 25000);
  }

  async function fetchAndRenderQRToken(sessionId) {
    if (!sessionId) return;
    try {
      const res = await apiRequest(`/attendance/qr/token/${encodeURIComponent(sessionId)}`);
      if (res.ok && res.data && res.data.success && res.data.data && res.data.data.token) {
        // Never log or expose secret or sensitive details
        if (qrCodeInstance) {
          qrCodeInstance.makeCode(res.data.data.token);
        }

        // Resync countdown with server if available
        if (typeof res.data.data.remaining_session_seconds === 'number') {
          qrCountdownRemainingSeconds = res.data.data.remaining_session_seconds;
          renderQRCountdown(qrCountdownRemainingSeconds);
        }

        if (qrCountdownRemainingSeconds <= 0) {
          setQRStateExpired();
        }
      } else if (res.status === 410) {
        setQRStateExpired();
      }
    } catch (err) {
      console.warn('Could not refresh QR token:', err.message);
    }
  }

  async function handleManualRotateToken() {
    if (!activeQRSession || !activeQRSession.session_id) return;
    const btn = document.getElementById('btnManualRefreshQR');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Rotating...';
    }
    await fetchAndRenderQRToken(activeQRSession.session_id);
    showToast('Dynamic QR token rotated successfully.', 'info');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        Rotate Token`;
    }
  }

  function tickQRCountdown() {
    if (qrCountdownRemainingSeconds <= 0) {
      setQRStateExpired();
      return;
    }
    qrCountdownRemainingSeconds--;
    renderQRCountdown(qrCountdownRemainingSeconds);
    if (qrCountdownRemainingSeconds <= 0) {
      setQRStateExpired();
    }
  }

  function renderQRCountdown(totalSeconds) {
    const textEl = document.getElementById('qrCountdownText');
    const wrapper = document.getElementById('qrCountdownWrapper');
    if (!textEl) return;

    if (totalSeconds <= 0) {
      textEl.textContent = '00:00';
      if (wrapper) {
        wrapper.style.background = '#fef2f2';
        wrapper.style.borderColor = '#fee2e2';
        textEl.style.color = '#dc2626';
      }
      return;
    }

    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    textEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (wrapper) {
      if (totalSeconds <= 30) {
        wrapper.style.background = '#fff7ed';
        wrapper.style.borderColor = '#ffedd5';
        textEl.style.color = '#ea580c';
      } else {
        wrapper.style.background = '#f0fdfa';
        wrapper.style.borderColor = '#ccfbf1';
        textEl.style.color = '#0f766e';
      }
    }
  }

  function setQRStateExpired() {
    if (qrCountdownTimer) {
      clearInterval(qrCountdownTimer);
      qrCountdownTimer = null;
    }
    if (qrTokenRefreshTimer) {
      clearInterval(qrTokenRefreshTimer);
      qrTokenRefreshTimer = null;
    }

    renderQRCountdown(0);

    // Update Live status badge
    const liveBadge = document.getElementById('qrLiveStatusBadge');
    const liveDot = document.getElementById('qrLiveStatusDot');
    const liveText = document.getElementById('qrLiveStatusText');
    if (liveBadge) {
      liveBadge.style.background = '#fee2e2';
      liveBadge.style.color = '#b91c1c';
      liveBadge.style.borderColor = '#fca5a5';
    }
    if (liveDot) liveDot.style.background = '#dc2626';
    if (liveText) liveText.textContent = 'EXPIRED';

    // Global badge
    const globalBadge = document.getElementById('qrGlobalStatusBadge');
    if (globalBadge) {
      globalBadge.innerHTML = '<span style="width: 8px; height: 8px; border-radius: 50%; background: #dc2626;"></span> Session Expired';
      globalBadge.style.background = '#fee2e2';
      globalBadge.style.color = '#b91c1c';
    }

    // Show Overlay
    const overlay = document.getElementById('qrOverlay');
    const overlayTitle = document.getElementById('qrOverlayTitle');
    const overlaySubtitle = document.getElementById('qrOverlaySubtitle');
    if (overlay) {
      overlay.style.display = 'flex';
      if (overlayTitle) overlayTitle.textContent = 'Attendance Session Expired';
      if (overlaySubtitle) overlaySubtitle.textContent = 'The QR validity duration has elapsed. No more student scans accepted.';
    }

    // Buttons
    const closeBtn = document.getElementById('btnCloseQRSession');
    const newBtn = document.getElementById('btnNewQRSession');
    const refreshBtn = document.getElementById('btnManualRefreshQR');
    if (closeBtn) closeBtn.style.display = 'none';
    if (refreshBtn) refreshBtn.style.display = 'none';
    if (newBtn) newBtn.style.display = 'inline-flex';
  }

  async function handleCloseQRSession() {
    if (!activeQRSession || !activeQRSession.session_id) return;
    const closeBtn = document.getElementById('btnCloseQRSession');
    if (closeBtn) {
      closeBtn.disabled = true;
      closeBtn.textContent = 'Closing...';
    }

    try {
      const res = await apiRequest(`/attendance/qr/close/${encodeURIComponent(activeQRSession.session_id)}`, {
        method: 'POST'
      });

      if (res.ok && res.data && res.data.success) {
        showToast('Attendance session closed successfully.', 'success');
        setQRStateClosed();
      } else {
        showToast(res.data?.message || 'Failed to close attendance session.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error closing session.', 'error');
    } finally {
      if (closeBtn) {
        closeBtn.disabled = false;
        closeBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>
          Close Session`;
      }
    }
  }

  function setQRStateClosed() {
    if (qrCountdownTimer) {
      clearInterval(qrCountdownTimer);
      qrCountdownTimer = null;
    }
    if (qrTokenRefreshTimer) {
      clearInterval(qrTokenRefreshTimer);
      qrTokenRefreshTimer = null;
    }

    renderQRCountdown(0);

    // Update Live status badge
    const liveBadge = document.getElementById('qrLiveStatusBadge');
    const liveDot = document.getElementById('qrLiveStatusDot');
    const liveText = document.getElementById('qrLiveStatusText');
    if (liveBadge) {
      liveBadge.style.background = '#f1f5f9';
      liveBadge.style.color = '#475569';
      liveBadge.style.borderColor = '#cbd5e1';
    }
    if (liveDot) liveDot.style.background = '#64748b';
    if (liveText) liveText.textContent = 'CLOSED';

    // Global badge
    const globalBadge = document.getElementById('qrGlobalStatusBadge');
    if (globalBadge) {
      globalBadge.innerHTML = '<span style="width: 8px; height: 8px; border-radius: 50%; background: #64748b;"></span> Session Closed';
      globalBadge.style.background = '#f1f5f9';
      globalBadge.style.color = '#475569';
    }

    // Show Overlay
    const overlay = document.getElementById('qrOverlay');
    const overlayTitle = document.getElementById('qrOverlayTitle');
    const overlaySubtitle = document.getElementById('qrOverlaySubtitle');
    if (overlay) {
      overlay.style.display = 'flex';
      if (overlayTitle) overlayTitle.textContent = 'Attendance Session Closed';
      if (overlaySubtitle) overlaySubtitle.textContent = 'This session was manually ended by the teacher.';
    }

    // Buttons
    const closeBtn = document.getElementById('btnCloseQRSession');
    const newBtn = document.getElementById('btnNewQRSession');
    const refreshBtn = document.getElementById('btnManualRefreshQR');
    if (closeBtn) closeBtn.style.display = 'none';
    if (refreshBtn) refreshBtn.style.display = 'none';
    if (newBtn) newBtn.style.display = 'inline-flex';
  }

  function updateStudentVisibilityUI(isVisible) {
    const btn = document.getElementById('btnToggleStudentVisibility');
    const thumb = document.getElementById('btnToggleStudentVisibilityThumb');
    const label = document.getElementById('qrStudentVisibilityLabel');
    const box = document.getElementById('qrStudentVisibilityBox');

    if (btn) {
      btn.setAttribute('aria-checked', isVisible ? 'true' : 'false');
      btn.style.background = isVisible ? '#0d9488' : '#cbd5e1';
    }
    if (thumb) {
      thumb.style.transform = isVisible ? 'translateX(20px)' : 'translateX(0px)';
    }
    if (label) {
      label.textContent = isVisible ? 'Visible to Students' : 'Hidden from Students';
      label.style.color = isVisible ? '#0f766e' : '#64748b';
    }
    if (box) {
      box.style.borderColor = isVisible ? '#99f6e4' : '#cbd5e1';
      box.style.background = isVisible ? '#f0fdfa' : '#ffffff';
    }
  }

  async function handleToggleStudentQRVisibility() {
    if (!activeQRSession || !activeQRSession.session_id) return;
    const btn = document.getElementById('btnToggleStudentVisibility');
    if (btn) btn.disabled = true;

    const newVisibility = !activeQRSession.student_qr_visible;

    try {
      const res = await apiRequest(`/attendance/qr/visibility/${encodeURIComponent(activeQRSession.session_id)}`, {
        method: 'POST',
        body: JSON.stringify({ visible: newVisibility })
      });

      if (res.ok && res.data && res.data.success) {
        activeQRSession.student_qr_visible = newVisibility;
        updateStudentVisibilityUI(newVisibility);
        if (newVisibility) {
          showToast('QR is now visible to enrolled students.', 'success');
        } else {
          showToast('QR is now hidden from students.', 'info');
        }
      } else {
        showToast(res.data?.message || 'Failed to update student QR visibility.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error updating student QR visibility.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function resetQRToSetup() {
    if (qrCountdownTimer) {
      clearInterval(qrCountdownTimer);
      qrCountdownTimer = null;
    }
    if (qrTokenRefreshTimer) {
      clearInterval(qrTokenRefreshTimer);
      qrTokenRefreshTimer = null;
    }

    activeQRSession = null;
    updateStudentVisibilityUI(false);

    // Switch panels
    const setupPanel = document.getElementById('qrSetupPanel');
    const livePanel = document.getElementById('qrLivePanel');
    if (livePanel) livePanel.style.display = 'none';
    if (setupPanel) setupPanel.style.display = 'block';

    // Reset global badge
    const globalBadge = document.getElementById('qrGlobalStatusBadge');
    if (globalBadge) {
      globalBadge.innerHTML = '<span style="width: 8px; height: 8px; border-radius: 50%; background: #94a3b8;"></span> Ready to Start';
      globalBadge.style.background = '#f1f5f9';
      globalBadge.style.color = '#64748b';
    }
  }

  async function initAttendance() {
    if (typeof requireAuth === 'function') {
      const isAuthed = requireAuth('TEACHER');
      if (!isAuthed) return;
    }

    // Set today's date in date input
    const dateInput = document.getElementById('attendanceDate');
    if (dateInput) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      dateInput.value = `${yyyy}-${mm}-${dd}`;

      dateInput.addEventListener('change', async () => {
        await loadTodayScheduledLectures();
        await loadAdminTimetableTime();
      });
    }

    // Wire Time Period selector and Custom Time inputs
    const periodOption = document.getElementById('attendancePeriodOption');
    const startInput = document.getElementById('attendanceStartTime');
    const endInput = document.getElementById('attendanceEndTime');

    if (startInput && !startInput.value) startInput.value = '10:30';
    if (endInput && !endInput.value) endInput.value = '11:20';

    if (periodOption) {
      periodOption.addEventListener('change', updateTimePeriodMode);
    }

    if (startInput) {
      startInput.addEventListener('input', updateCustomTimePreview);
      startInput.addEventListener('change', updateCustomTimePreview);
    }
    if (endInput) {
      endInput.addEventListener('input', updateCustomTimePreview);
      endInput.addEventListener('change', updateCustomTimePreview);
    }

    // Fetch teacher profile
    await loadTeacherProfile();

    // Fetch courses
    await loadCourses();

    // Fetch today's scheduled lectures from timetable
    await loadTodayScheduledLectures();

    // Fetch admin timetable time for the default/selected course & date
    await loadAdminTimetableTime();

    // Initialize Dynamic QR Attendance module
    await initQRAttendance();

    // Wire course selector change
    const courseSelect = document.getElementById('attendanceCourseSelect');
    if (courseSelect) {
      courseSelect.addEventListener('change', async () => {
        await loadStudentRoster();
        await loadAdminTimetableTime();
      });
    }

    // Wire "Mark All Present" button
    const markAllPresentBtn = document.getElementById('btnMarkAllPresent');
    if (markAllPresentBtn) {
      markAllPresentBtn.addEventListener('click', () => {
        document.querySelectorAll('input[type="radio"][value="Present"]').forEach(r => {
          r.checked = true;
        });
      });
    }

    // Wire Save Attendance button
    const saveBtn = document.getElementById('btnSaveAttendance');
    if (saveBtn) {
      saveBtn.addEventListener('click', handleSaveAttendance);
    }

    // Wire session view/edit/delete modals close buttons
    document.getElementById('btnCloseViewModal')?.addEventListener('click', () => {
      document.getElementById('sessionViewModal')?.classList.add('hidden');
    });
    document.getElementById('btnDismissViewModal')?.addEventListener('click', () => {
      document.getElementById('sessionViewModal')?.classList.add('hidden');
    });

    document.getElementById('btnCloseEditModal')?.addEventListener('click', () => {
      document.getElementById('sessionEditModal')?.classList.add('hidden');
    });
    document.getElementById('btnCancelEditModal')?.addEventListener('click', () => {
      document.getElementById('sessionEditModal')?.classList.add('hidden');
    });
    document.getElementById('btnSubmitEditModal')?.addEventListener('click', handleSaveEditedSession);

    document.getElementById('btnCloseDeleteModal')?.addEventListener('click', () => {
      document.getElementById('sessionDeleteModal')?.classList.add('hidden');
    });
    document.getElementById('btnCancelDeleteModal')?.addEventListener('click', () => {
      document.getElementById('sessionDeleteModal')?.classList.add('hidden');
    });
    document.getElementById('btnConfirmDeleteModal')?.addEventListener('click', handleConfirmDeleteSession);

    // Close modal on clicking backdrop
    ['sessionViewModal', 'sessionEditModal', 'sessionDeleteModal'].forEach(id => {
      const modal = document.getElementById(id);
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            modal.classList.add('hidden');
          }
        });
      }
    });

    // Wire session filters
    document.getElementById('sessionFilterCourse')?.addEventListener('change', loadRecentAttendanceSessions);
    document.getElementById('sessionFilterDate')?.addEventListener('change', loadRecentAttendanceSessions);
    document.getElementById('sessionFilterType')?.addEventListener('change', loadRecentAttendanceSessions);
    document.getElementById('sessionFilterSearch')?.addEventListener('input', () => {
      clearTimeout(window._sessionSearchTimer);
      window._sessionSearchTimer = setTimeout(loadRecentAttendanceSessions, 300);
    });
    document.getElementById('btnResetSessionFilters')?.addEventListener('click', () => {
      if (document.getElementById('sessionFilterCourse')) document.getElementById('sessionFilterCourse').value = '';
      if (document.getElementById('sessionFilterDate')) document.getElementById('sessionFilterDate').value = '';
      if (document.getElementById('sessionFilterType')) document.getElementById('sessionFilterType').value = '';
      if (document.getElementById('sessionFilterSearch')) document.getElementById('sessionFilterSearch').value = '';
      loadRecentAttendanceSessions();
    });
    document.getElementById('btnRefreshSessions')?.addEventListener('click', loadRecentAttendanceSessions);

    // Load recent history sessions
    await loadRecentAttendanceSessions();
    await loadAttendanceSummary();
    await loadNotificationsCount();
  }

  async function loadTeacherProfile() {
    try {
      const res = await apiFetch('/api/users/me');
      if (res && res.success && res.data && res.data.user) {
        currentTeacher = res.data.user;
      }
    } catch (e) {
      console.warn('Could not load teacher profile:', e);
    }
  }

  function normalizeCoursesResponse(res) {
    if (!res) return null;
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.courses)) return res.courses;
    if (res.data) {
      if (Array.isArray(res.data)) return res.data;
      if (Array.isArray(res.data.courses)) return res.data.courses;
    }
    return null;
  }

  function disableAttendanceControls(message) {
    const courseSelect = document.getElementById('attendanceCourseSelect');
    const periodOption = document.getElementById('attendancePeriodOption');
    const saveBtn = document.getElementById('btnSaveAttendance');
    const markAllPresentBtn = document.getElementById('btnMarkAllPresent');
    const adminTimetableBox = document.getElementById('adminTimetableContainer');
    const rosterToolbar = document.getElementById('rosterHeaderToolbar');

    if (courseSelect && allCourses.length === 0) {
      courseSelect.disabled = true;
    }
    if (periodOption) {
      periodOption.disabled = true;
    }
    if (saveBtn) {
      saveBtn.disabled = true;
    }
    if (markAllPresentBtn) {
      markAllPresentBtn.disabled = true;
    }
    if (adminTimetableBox) {
      adminTimetableBox.innerHTML = `<div style="font-size: 13px; color: #64748b;">${escapeHtml(message)}</div>`;
    }
    if (rosterToolbar) {
      rosterToolbar.style.display = 'none';
    }
    renderEmptyRoster(message);
  }

  async function loadCourses() {
    const select = document.getElementById('attendanceCourseSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Loading assigned courses...</option>';

    try {
      // 1. Authoritative Backend Course Fetch: return ONLY assigned courses
      let res = await apiFetch('/api/attendance/courses');
      let courses = normalizeCoursesResponse(res);

      if (courses === null) {
        // Fallback to /api/courses with assigned flag
        res = await apiFetch('/api/courses?assigned=true&all=true');
        courses = normalizeCoursesResponse(res);
      }

      if (courses === null) {
        allCourses = [];
        select.innerHTML = '<option value="">-- No Assigned Courses --</option>';
        select.disabled = true;
        disableAttendanceControls('Unable to load your assigned courses.');
        showToast('Unable to load your assigned courses.', 'error');
        return;
      }

      allCourses = courses;

      if (allCourses.length === 0) {
        select.innerHTML = '<option value="">-- No Assigned Courses --</option>';
        select.disabled = true;
        disableAttendanceControls('No courses are currently assigned to you.');
        return;
      }

      // Re-enable controls if courses exist
      select.disabled = false;
      const periodOption = document.getElementById('attendancePeriodOption');
      const markAllPresentBtn = document.getElementById('btnMarkAllPresent');
      if (periodOption) periodOption.disabled = false;
      if (markAllPresentBtn) markAllPresentBtn.disabled = false;

      // Populate ONLY assigned courses (strictly no fake/unassigned fallbacks)
      select.innerHTML = '';
      allCourses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.course_id;
        opt.textContent = `${c.course_code} - ${c.course_name}`;
        select.appendChild(opt);
      });

      // Populate course filter in Recent Sessions section
      const filterSelect = document.getElementById('sessionFilterCourse');
      if (filterSelect) {
        filterSelect.innerHTML = '<option value="">All Assigned Courses</option>';
        allCourses.forEach(c => {
          const fOpt = document.createElement('option');
          fOpt.value = c.course_id;
          fOpt.textContent = `${c.course_code} - ${c.course_name}`;
          filterSelect.appendChild(fOpt);
        });
      }

      // Populate courses in QR Custom mode dropdown
      populateQRCoursesDropdown();

      // Check URL param ?course_id=...
      const urlParams = new URLSearchParams(window.location.search);
      const preselectId = urlParams.get('course_id');
      if (preselectId && select.querySelector(`option[value="${preselectId}"]`)) {
        select.value = preselectId;
      } else {
        select.value = String(allCourses[0].course_id);
      }

      await loadStudentRoster();
    } catch (err) {
      console.error('Failed to load assigned courses:', err);
      allCourses = [];
      select.innerHTML = '<option value="">-- No Assigned Courses --</option>';
      select.disabled = true;
      disableAttendanceControls('Unable to load your assigned courses.');
      showToast('Unable to load your assigned courses.', 'error');
    }
  }

  async function loadStudentRoster() {
    const select = document.getElementById('attendanceCourseSelect');
    const courseId = select ? select.value : '';
    const courseText = select && select.selectedIndex >= 0 ? select.options[select.selectedIndex]?.text : '';
    const rosterCourseName = document.getElementById('rosterCourseName');
    const rosterStudentCount = document.getElementById('rosterStudentCount');
    const rosterHeaderToolbar = document.getElementById('rosterHeaderToolbar');

    if (rosterCourseName) {
      rosterCourseName.textContent = courseText || 'Selected Course';
    }

    if (!courseId) {
      if (rosterHeaderToolbar) rosterHeaderToolbar.style.display = 'none';
      renderEmptyRoster(allCourses.length === 0 ? 'No courses are currently assigned to you.' : 'Select an assigned course to load student roster.');
      return;
    }

    const container = document.getElementById('attendanceRosterContainer');
    if (container) {
      container.innerHTML = '<div style="padding: 30px; text-align: center; color: #64748b; font-size: 13.5px;">Loading students...</div>';
    }

    try {
      // Fetch course-wise enrolled students (subject-wise filtering)
      const res = await apiFetch(`/api/attendance/course/${encodeURIComponent(courseId)}`);
      if (res && res.success && res.data) {
        currentStudents = Array.isArray(res.data.students) ? res.data.students : [];
      } else {
        currentStudents = [];
      }

      if (currentStudents.length === 0) {
        if (rosterHeaderToolbar) rosterHeaderToolbar.style.display = 'none';
        renderEmptyRoster('No students enrolled in this subject. No students are enrolled in this course.');
        const saveBtn = document.getElementById('btnSaveAttendance');
        if (saveBtn) saveBtn.disabled = true;
      } else {
        if (rosterHeaderToolbar) {
          rosterHeaderToolbar.style.display = 'flex';
        }
        if (rosterStudentCount) {
          rosterStudentCount.textContent = `${currentStudents.length} ${currentStudents.length === 1 ? 'Student' : 'Students'}`;
        }
        renderRoster(currentStudents);
      }
    } catch (err) {
      console.error('Failed to load student roster:', err);
      if (rosterHeaderToolbar) rosterHeaderToolbar.style.display = 'none';
      const isForbidden = err && (err.status === 403 || String(err.message).includes('403') || String(err.message).includes('authorized'));
      const errorMsg = isForbidden
        ? 'You are not authorized to access attendance for this course.'
        : 'No students enrolled in this subject. No students are enrolled in this course.';
      if (isForbidden) {
        showToast('You are not authorized to access attendance for this course.', 'error');
      }
      renderEmptyRoster(errorMsg);
      const saveBtn = document.getElementById('btnSaveAttendance');
      if (saveBtn) saveBtn.disabled = true;
    }
  }

  function renderEmptyRoster(msg = 'No students enrolled in this subject. No students are enrolled in this course.') {
    const container = document.getElementById('attendanceRosterContainer');
    const toolbar = document.getElementById('rosterHeaderToolbar');
    if (toolbar) toolbar.style.display = 'none';
    if (!container) return;

    const isNoCourse = msg.includes('course') || msg.includes('assigned') || msg.includes('authorized');
    const heading = isNoCourse ? 'No Assigned Courses' : 'No Students Enrolled';

    container.innerHTML = `
      <div class="teacher-empty-state" style="padding: 40px 20px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
        <div class="teacher-empty-icon" style="width: 48px; height: 48px; margin: 0 auto 12px; border-radius: 50%; background: #fee2e2; display: flex; align-items: center; justify-content: center; color: #dc2626;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h3 style="font-size: 16px; font-weight: 700; margin: 0 0 6px 0; color: #0f172a;">${escapeHtml(heading)}</h3>
        <p style="color: #64748b; max-width: 400px; margin: 0 auto; font-size: 13.5px;">${escapeHtml(msg)}</p>
      </div>`;

    const saveBtn = document.getElementById('btnSaveAttendance');
    if (saveBtn) saveBtn.disabled = true;
  }

  function renderRoster(students) {
    const container = document.getElementById('attendanceRosterContainer');
    const saveBtn = document.getElementById('btnSaveAttendance');
    if (!container) return;

    if (!students || students.length === 0) {
      renderEmptyRoster('No students enrolled in this subject. No students are enrolled in this course.');
      return;
    }

    const periodOption = document.getElementById('attendancePeriodOption');
    const isTimetableMode = !periodOption || periodOption.value === 'Admin Timetable Time';
    if (saveBtn) {
      saveBtn.disabled = isTimetableMode && !selectedAdminTimetableSlot;
    }

    let html = `
      <div style="overflow-x: auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left; color: #475569;">
              <th style="padding: 10px 14px;">PRN</th>
              <th style="padding: 10px 14px;">Student Name</th>
              <th style="padding: 10px 14px;">Department</th>
              <th style="padding: 10px 14px;">Class & Div</th>
              <th style="padding: 10px 14px; text-align: center;">Present</th>
              <th style="padding: 10px 14px; text-align: center;">Absent</th>
              <th style="padding: 10px 14px; text-align: center;">Late</th>
              <th style="padding: 10px 14px; text-align: center;">Excused</th>
              <th style="padding: 10px 14px;">Remarks</th>
            </tr>
          </thead>
          <tbody>`;

    students.forEach((s, idx) => {
      const name = s.student_name || [s.first_name, s.last_name].filter(Boolean).join(' ') || s.username || 'Student';
      const studentId = s.student_id;
      const groupName = `att_status_${studentId}`;
      const prn = s.prn_number || '-';
      const dept = s.department_name || s.department_code || '-';

      html += `
        <tr style="border-bottom: 1px solid #f1f5f9;" data-student-id="${studentId}" data-name="${escapeHtml(name)}" data-prn="${escapeHtml(prn)}">
          <td style="padding: 10px 14px; font-weight: 600; color: #0d9488;">${escapeHtml(prn)}</td>
          <td style="padding: 10px 14px; font-weight: 600; color: #0f172a;">${escapeHtml(name)}</td>
          <td style="padding: 10px 14px; color: #475569; font-size: 12.5px;">${escapeHtml(dept)}</td>
          <td style="padding: 10px 14px; color: #64748b;">${escapeHtml(s.class_name || '-')} ${escapeHtml(s.division ? '(' + s.division + ')' : '')}</td>
          <td style="padding: 10px 14px; text-align: center;">
            <label style="cursor: pointer;"><input type="radio" name="${groupName}" value="Present" checked style="accent-color: #16a34a;"></label>
          </td>
          <td style="padding: 10px 14px; text-align: center;">
            <label style="cursor: pointer;"><input type="radio" name="${groupName}" value="Absent" style="accent-color: #dc2626;"></label>
          </td>
          <td style="padding: 10px 14px; text-align: center;">
            <label style="cursor: pointer;"><input type="radio" name="${groupName}" value="Late" style="accent-color: #d97706;"></label>
          </td>
          <td style="padding: 10px 14px; text-align: center;">
            <label style="cursor: pointer;"><input type="radio" name="${groupName}" value="Excused" style="accent-color: #2563eb;"></label>
          </td>
          <td style="padding: 10px 14px;">
            <input type="text" class="student-remarks-input" placeholder="Optional remark..." style="padding: 4px 8px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; width: 140px;">
          </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Attach real-time search filtering
    const searchInput = document.getElementById('rosterSearchInput');
    if (searchInput && !searchInput.dataset.wired) {
      searchInput.dataset.wired = 'true';
      searchInput.addEventListener('input', () => {
        const term = searchInput.value.trim().toLowerCase();
        const rows = container.querySelectorAll('tbody tr[data-student-id]');
        let visibleCount = 0;
        rows.forEach(r => {
          const name = (r.getAttribute('data-name') || '').toLowerCase();
          const prn = (r.getAttribute('data-prn') || '').toLowerCase();
          if (!term || name.includes(term) || prn.includes(term)) {
            r.style.display = '';
            visibleCount++;
          } else {
            r.style.display = 'none';
          }
        });

        let noMatchRow = container.querySelector('#noMatchSearchRow');
        if (visibleCount === 0 && term) {
          if (!noMatchRow) {
            const tbody = container.querySelector('tbody');
            if (tbody) {
              noMatchRow = document.createElement('tr');
              noMatchRow.id = 'noMatchSearchRow';
              noMatchRow.innerHTML = `<td colspan="9" style="text-align: center; padding: 24px; color: #64748b;">No students match "${escapeHtml(searchInput.value)}".</td>`;
              tbody.appendChild(noMatchRow);
            }
          }
        } else if (noMatchRow) {
          noMatchRow.remove();
        }
      });
    }
  }

  async function handleSaveAttendance() {
    const courseSelect = document.getElementById('attendanceCourseSelect');
    const courseId = courseSelect ? courseSelect.value : '';
    const dateInput = document.getElementById('attendanceDate');
    const attDate = dateInput ? dateInput.value : '';
    const lectureTypeSelect = document.getElementById('attendanceLectureType');
    const lectureType = lectureTypeSelect ? lectureTypeSelect.value : 'Regular Lecture';
    const periodOptionSelect = document.getElementById('attendancePeriodOption');
    const periodMode = periodOptionSelect ? periodOptionSelect.value : '';

    if (!courseId) {
      showToast('Please select a course.', 'error');
      return;
    }
    if (!attDate) {
      showToast('Please specify the attendance date.', 'error');
      return;
    }
    if (!periodMode) {
      showToast('Please select a time period or choose Custom Time.', 'error');
      return;
    }

    let startTime = null;
    let endTime = null;
    let sessionName = 'Admin Timetable Time';

    if (periodMode === 'Custom Time') {
      sessionName = 'Custom Time';
      const startEl = document.getElementById('attendanceStartTime');
      const endEl = document.getElementById('attendanceEndTime');
      startTime = startEl ? startEl.value : '';
      endTime = endEl ? endEl.value : '';

      if (!startTime || !endTime) {
        showToast('Please specify both Start Time and End Time for Custom Time.', 'error');
        return;
      }
      if (startTime >= endTime) {
        showToast('Start time must be strictly before End time.', 'error');
        return;
      }
    } else if (periodMode.startsWith('slot_')) {
      sessionName = 'Admin Timetable Time';
      const slotId = Number(periodMode.replace('slot_', ''));
      const slot = activeAdminTimetableSlots.find(s => Number(s.timetable_id || s.id) === slotId) || selectedAdminTimetableSlot;
      if (!slot) {
        showToast('Selected timetable slot details not found.', 'error');
        return;
      }
      startTime = formatHHMM(slot.start_time);
      endTime = formatHHMM(slot.end_time);
      if (!startTime || !endTime) {
        showToast('Invalid timetable slot times.', 'error');
        return;
      }
    } else {
      showToast('Please select a valid scheduled time period or choose Custom Time.', 'error');
      return;
    }

    const teacherId = currentTeacher?.teacher_id || 1;
    const rows = document.querySelectorAll('#attendanceRosterContainer tr[data-student-id]');

    if (!rows || rows.length === 0) {
      showToast('No students to record attendance for.', 'error');
      return;
    }

    const saveBtn = document.getElementById('btnSaveAttendance');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    let successCount = 0;
    let failCount = 0;
    let lastErrorMsg = '';

    for (const row of rows) {
      const studentId = row.getAttribute('data-student-id');
      const selectedRadio = row.querySelector(`input[name="att_status_${studentId}"]:checked`);
      const status = selectedRadio ? selectedRadio.value : 'Present';
      const remarksInput = row.querySelector('.student-remarks-input');
      const remarks = remarksInput ? remarksInput.value.trim() : '';

      try {
        const payload = {
          student_id: parseInt(studentId, 10),
          course_id: parseInt(courseId, 10),
          teacher_id: parseInt(teacherId, 10),
          attendance_date: attDate,
          status,
          remarks,
          lecture_type: lectureType,
          session: sessionName,
          session_name: sessionName,
          start_time: startTime,
          end_time: endTime
        };

        const res = await apiFetch('/api/attendance', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          successCount++;
        } else {
          failCount++;
          lastErrorMsg = (res && res.message) ? res.message : 'Error recording attendance';
        }
      } catch (err) {
        failCount++;
        lastErrorMsg = err.message || 'Network error';
      }
    }

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Attendance';
    }

    if (successCount > 0) {
      showToast(`Attendance recorded successfully for ${successCount} student(s).`, 'success');
      await loadRecentAttendanceSessions();
      await loadAttendanceSummary();
      await loadTodayScheduledLectures();
      await loadAdminTimetableTime();
    } else {
      showToast(lastErrorMsg || 'Failed to record attendance. Please check input details.', 'error');
    }
  }

  // =========================================================================
  // RECENT ATTENDANCE SESSIONS & INTERACTIVE VIEW / EDIT / DELETE MODALS
  // =========================================================================

  let currentEditingSessionId = null;
  let currentDeletingSessionId = null;

  async function loadRecentAttendanceSessions() {
    const container = document.getElementById('attendanceHistoryContainer');
    if (!container) return;

    const filterCourse = document.getElementById('sessionFilterCourse')?.value || '';
    const filterDate = document.getElementById('sessionFilterDate')?.value || '';
    const filterType = document.getElementById('sessionFilterType')?.value || '';
    const filterSearch = document.getElementById('sessionFilterSearch')?.value?.trim() || '';

    const params = new URLSearchParams();
    params.set('limit', '30');
    if (filterCourse) params.set('course_id', filterCourse);
    if (filterDate) params.set('date', filterDate);
    if (filterType) params.set('lecture_type', filterType);
    if (filterSearch) params.set('search', filterSearch);

    try {
      const res = await apiFetch(`/api/attendance/sessions?${params.toString()}`);
      let sessions = [];
      if (res && res.success && res.data) {
        sessions = res.data.sessions || [];
      }

      if (!sessions || sessions.length === 0) {
        container.innerHTML = `
          <div class="teacher-empty-state" style="padding: 36px 16px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; color: #64748b;">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">No Lecture Attendance Sessions Found</div>
            <div style="font-size: 13px; color: #64748b;">No attendance sessions match the selected filters or course. Record a new session above.</div>
          </div>`;
        return;
      }

      let html = '<div class="session-cards-grid">';

      sessions.forEach(s => {
        const dateFormatted = s.attendance_date ? new Date(s.attendance_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '-';
        const lectureType = s.lecture_type || 'Regular Lecture';

        let typeBadgeStyle = 'background: #e0e7ff; color: #3730a3;';
        if (lectureType.includes('Extra')) {
          typeBadgeStyle = 'background: #f3e8ff; color: #6b21a8;';
        } else if (lectureType.includes('Practical') || lectureType.includes('Lab')) {
          typeBadgeStyle = 'background: #ccfbf1; color: #0f766e;';
        } else if (lectureType.includes('Makeup')) {
          typeBadgeStyle = 'background: #fef3c7; color: #92400e;';
        }

        const pct = s.attendance_percentage !== null ? s.attendance_percentage : 0;
        let pctColor = '#0d9488';
        if (pct < 75) pctColor = '#dc2626';
        else if (pct < 85) pctColor = '#d97706';

        html += `
          <div class="session-card">
            <div>
              <div class="session-card-header">
                <div>
                  <h4 class="session-card-title">${escapeHtml(s.course_code)} - ${escapeHtml(s.course_name)}</h4>
                  <div class="session-card-meta">
                    <span style="font-weight: 600; color: #0f172a;">${escapeHtml(dateFormatted)}</span>
                    <span>&bull;</span>
                    <span style="color: #0d9488; font-weight: 600;">${escapeHtml(s.time_range)}</span>
                  </div>
                </div>
                <span class="session-card-badge" style="${typeBadgeStyle}">${escapeHtml(lectureType)}</span>
              </div>

              <div style="font-size: 12px; color: #64748b; margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 10px;">
                <span>Class: <strong>${escapeHtml(s.class_name)}</strong></span>
                <span>Div: <strong>${escapeHtml(s.division)}</strong></span>
                <span>Room: <strong>${escapeHtml(s.room_no)}</strong></span>
                <span>Faculty: <strong>${escapeHtml(s.teacher_name || '-')}</strong></span>
              </div>

              <!-- Breakdown Statistics Grid -->
              <div class="session-stats-grid">
                <div>
                  <div class="session-stat-val" style="color: #0f172a;">${s.total_students}</div>
                  <div class="session-stat-lbl">Students</div>
                </div>
                <div>
                  <div class="session-stat-val" style="color: #16a34a;">${s.present_count}</div>
                  <div class="session-stat-lbl">Present</div>
                </div>
                <div>
                  <div class="session-stat-val" style="color: #dc2626;">${s.absent_count}</div>
                  <div class="session-stat-lbl">Absent</div>
                </div>
                <div>
                  <div class="session-stat-val" style="color: ${pctColor};">${pct}%</div>
                  <div class="session-stat-lbl">% Attended</div>
                </div>
              </div>

              ${s.remarks_summary ? `
                <div style="font-size: 12px; color: #64748b; background: #f8fafc; padding: 6px 10px; border-radius: 4px; border-left: 3px solid #0d9488; margin-top: 8px;">
                  <strong style="color: #334155;">Remarks:</strong> ${escapeHtml(s.remarks_summary)}
                </div>` : ''}
            </div>

            <!-- Card Actions [ View ], [ Edit ], [ Delete ] -->
            <div class="session-card-actions">
              <button type="button" class="session-action-btn session-action-btn-view" data-session-id="${s.session_id}" title="View session roster">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                View
              </button>
              <button type="button" class="session-action-btn session-action-btn-edit" data-session-id="${s.session_id}" title="Edit session details & student statuses">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
              <button type="button" class="session-action-btn session-action-btn-delete" data-session-id="${s.session_id}" data-course="${escapeHtml(s.course_code)}" data-date="${escapeHtml(s.attendance_date)}" data-time="${escapeHtml(s.time_range)}" data-count="${s.total_students}" title="Delete session attendance">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
            </div>
          </div>`;
      });

      html += '</div>';
      container.innerHTML = html;

      // Attach button events
      container.querySelectorAll('.session-action-btn-view').forEach(btn => {
        btn.addEventListener('click', () => {
          const sid = btn.getAttribute('data-session-id');
          openViewSessionModal(sid);
        });
      });

      container.querySelectorAll('.session-action-btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const sid = btn.getAttribute('data-session-id');
          openEditSessionModal(sid);
        });
      });

      container.querySelectorAll('.session-action-btn-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const sid = btn.getAttribute('data-session-id');
          const course = btn.getAttribute('data-course');
          const date = btn.getAttribute('data-date');
          const time = btn.getAttribute('data-time');
          const count = btn.getAttribute('data-count');
          openDeleteSessionModal(sid, course, date, time, count);
        });
      });

    } catch (err) {
      console.error('Failed to load attendance sessions:', err);
      container.innerHTML = `<div style="color: #dc2626; padding: 20px; text-align: center;">Error loading attendance sessions: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function openViewSessionModal(sessionId) {
    const modal = document.getElementById('sessionViewModal');
    const content = document.getElementById('viewModalContent');
    if (!modal || !content) return;
    modal.classList.remove('hidden');
    content.innerHTML = '<div style="padding: 32px; text-align: center; color: #64748b;">Loading session roster...</div>';

    try {
      const res = await apiFetch(`/api/attendance/sessions/${encodeURIComponent(sessionId)}`);
      if (!res || !res.success || !res.data) {
        content.innerHTML = `<div style="color: #dc2626; padding: 20px; text-align: center;">${escapeHtml(res?.message || 'Failed to load session details')}</div>`;
        return;
      }

      const { session, roster } = res.data;
      const title = document.getElementById('viewModalTitle');
      if (title) title.textContent = `${session.course_code} - ${session.course_name} (${session.attendance_date})`;

      let html = `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
            <span style="font-size: 13.5px; font-weight: 700; color: #0f172a;">${escapeHtml(session.lecture_type)} &bull; ${escapeHtml(session.time_range)}</span>
            <span style="font-size: 12.5px; color: #0d9488; font-weight: 600;">Faculty: ${escapeHtml(session.teacher_name || '-')}</span>
          </div>
          <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
            Room: ${escapeHtml(session.room_no)} &bull; Division: ${escapeHtml(session.division)} &bull; Class: ${escapeHtml(session.class_name)}
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; text-align: center;">
            <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; color: #64748b; font-weight: 600;">TOTAL</div>
              <div style="font-size: 18px; font-weight: 700; color: #0f172a;">${session.total_students}</div>
            </div>
            <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; color: #16a34a; font-weight: 600;">PRESENT</div>
              <div style="font-size: 18px; font-weight: 700; color: #16a34a;">${session.present_count}</div>
            </div>
            <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; color: #dc2626; font-weight: 600;">ABSENT</div>
              <div style="font-size: 18px; font-weight: 700; color: #dc2626;">${session.absent_count}</div>
            </div>
            <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; color: #d97706; font-weight: 600;">LATE</div>
              <div style="font-size: 18px; font-weight: 700; color: #d97706;">${session.late_count}</div>
            </div>
            <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; color: #2563eb; font-weight: 600;">EXCUSED</div>
              <div style="font-size: 18px; font-weight: 700; color: #2563eb;">${session.excused_count}</div>
            </div>
            <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
              <div style="font-size: 11px; color: #0d9488; font-weight: 600;">ATTENDANCE %</div>
              <div style="font-size: 18px; font-weight: 700; color: #0d9488;">${session.attendance_percentage}%</div>
            </div>
          </div>
        </div>

        <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left; color: #475569;">
                <th style="padding: 10px 14px;">PRN</th>
                <th style="padding: 10px 14px;">Student Name</th>
                <th style="padding: 10px 14px;">Status</th>
                <th style="padding: 10px 14px;">Remarks</th>
              </tr>
            </thead>
            <tbody>
      `;

      if (roster && roster.length > 0) {
        roster.forEach(r => {
          let badgeBg = 'background: #dcfce7; color: #15803d;';
          if (r.status === 'Absent') badgeBg = 'background: #fee2e2; color: #991b1b;';
          else if (r.status === 'Late') badgeBg = 'background: #fef3c7; color: #b45309;';
          else if (r.status === 'Excused') badgeBg = 'background: #e0f2fe; color: #0369a1;';

          html += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 14px; font-weight: 600; color: #0d9488;">${escapeHtml(r.prn_number || '-')}</td>
              <td style="padding: 10px 14px; font-weight: 500; color: #0f172a;">${escapeHtml(r.student_name || 'Student')}</td>
              <td style="padding: 10px 14px;">
                <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; ${badgeBg}">
                  ${escapeHtml(r.status)}
                </span>
              </td>
              <td style="padding: 10px 14px; color: #64748b;">${escapeHtml(r.remarks || '-')}</td>
            </tr>
          `;
        });
      } else {
        html += `<tr><td colspan="4" style="padding: 20px; text-align: center; color: #64748b;">No student records found in this session.</td></tr>`;
      }

      html += `</tbody></table></div>`;
      content.innerHTML = html;
    } catch (err) {
      content.innerHTML = `<div style="color: #dc2626; padding: 20px; text-align: center;">Error loading session roster: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function openEditSessionModal(sessionId) {
    currentEditingSessionId = sessionId;
    const modal = document.getElementById('sessionEditModal');
    const content = document.getElementById('editModalContent');
    if (!modal || !content) return;
    modal.classList.remove('hidden');
    content.innerHTML = '<div style="padding: 32px; text-align: center; color: #64748b;">Loading session for editing...</div>';

    try {
      const res = await apiFetch(`/api/attendance/sessions/${encodeURIComponent(sessionId)}`);
      if (!res || !res.success || !res.data) {
        content.innerHTML = `<div style="color: #dc2626; padding: 20px; text-align: center;">${escapeHtml(res?.message || 'Failed to load session details')}</div>`;
        return;
      }

      const { session, roster } = res.data;
      const title = document.getElementById('editModalTitle');
      if (title) title.textContent = `Edit Attendance: ${session.course_code} (${session.attendance_date})`;

      let html = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; padding: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 600; color: #475569; margin-bottom: 4px;">Lecture Type</label>
            <select id="editSessionLectureType" style="width: 100%; padding: 6px 10px; font-size: 12.5px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;">
              <option value="Regular Lecture" ${session.lecture_type === 'Regular Lecture' ? 'selected' : ''}>Regular Lecture</option>
              <option value="Extra / Additional Lecture" ${session.lecture_type === 'Extra / Additional Lecture' ? 'selected' : ''}>Extra / Additional Lecture</option>
              <option value="Practical / Lab" ${session.lecture_type === 'Practical / Lab' ? 'selected' : ''}>Practical / Lab</option>
              <option value="Makeup Lecture" ${session.lecture_type === 'Makeup Lecture' ? 'selected' : ''}>Makeup Lecture</option>
            </select>
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 600; color: #475569; margin-bottom: 4px;">Session Label</label>
            <input type="text" id="editSessionName" value="${escapeHtml(session.session_name || 'Admin Timetable Time')}" style="width: 100%; padding: 6px 10px; font-size: 12.5px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 600; color: #475569; margin-bottom: 4px;">Start Time</label>
            <input type="time" id="editSessionStartTime" value="${formatHHMM(session.start_time)}" style="width: 100%; padding: 6px 10px; font-size: 12.5px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;">
          </div>
          <div>
            <label style="display: block; font-size: 11.5px; font-weight: 600; color: #475569; margin-bottom: 4px;">End Time</label>
            <input type="time" id="editSessionEndTime" value="${formatHHMM(session.end_time)}" style="width: 100%; padding: 6px 10px; font-size: 12.5px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;">
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span style="font-size: 13px; font-weight: 700; color: #0f172a;">Student Roster (${roster.length} students)</span>
          <button type="button" id="btnEditMarkAllPresent" style="padding: 4px 10px; font-size: 12px; font-weight: 600; color: #0d9488; background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 4px; cursor: pointer;">
            Mark All Present
          </button>
        </div>

        <div style="overflow-x: auto; max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 1;">
              <tr style="border-bottom: 1px solid #e2e8f0; text-align: left; color: #475569;">
                <th style="padding: 10px 12px;">PRN</th>
                <th style="padding: 10px 12px;">Student Name</th>
                <th style="padding: 10px 12px; text-align: center;">Present</th>
                <th style="padding: 10px 12px; text-align: center;">Absent</th>
                <th style="padding: 10px 12px; text-align: center;">Late</th>
                <th style="padding: 10px 12px; text-align: center;">Excused</th>
                <th style="padding: 10px 12px;">Remarks</th>
              </tr>
            </thead>
            <tbody>
      `;

      roster.forEach(r => {
        const grp = `edit_status_${r.student_id}`;
        html += `
          <tr style="border-bottom: 1px solid #f1f5f9;" data-student-id="${r.student_id}">
            <td style="padding: 10px 12px; font-weight: 600; color: #0d9488;">${escapeHtml(r.prn_number || '-')}</td>
            <td style="padding: 10px 12px; font-weight: 500; color: #0f172a;">${escapeHtml(r.student_name || 'Student')}</td>
            <td style="padding: 10px 12px; text-align: center;">
              <label style="cursor: pointer;"><input type="radio" name="${grp}" value="Present" ${r.status === 'Present' ? 'checked' : ''} style="accent-color: #16a34a;"></label>
            </td>
            <td style="padding: 10px 12px; text-align: center;">
              <label style="cursor: pointer;"><input type="radio" name="${grp}" value="Absent" ${r.status === 'Absent' ? 'checked' : ''} style="accent-color: #dc2626;"></label>
            </td>
            <td style="padding: 10px 12px; text-align: center;">
              <label style="cursor: pointer;"><input type="radio" name="${grp}" value="Late" ${r.status === 'Late' ? 'checked' : ''} style="accent-color: #d97706;"></label>
            </td>
            <td style="padding: 10px 12px; text-align: center;">
              <label style="cursor: pointer;"><input type="radio" name="${grp}" value="Excused" ${r.status === 'Excused' ? 'checked' : ''} style="accent-color: #2563eb;"></label>
            </td>
            <td style="padding: 10px 12px;">
              <input type="text" class="edit-remarks-input" value="${escapeHtml(r.remarks || '')}" placeholder="Optional..." style="padding: 4px 8px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 4px; width: 140px;">
            </td>
          </tr>
        `;
      });

      html += `</tbody></table></div>`;
      content.innerHTML = html;

      const btnMarkAll = document.getElementById('btnEditMarkAllPresent');
      if (btnMarkAll) {
        btnMarkAll.addEventListener('click', () => {
          content.querySelectorAll('input[type="radio"][value="Present"]').forEach(radio => {
            radio.checked = true;
          });
        });
      }
    } catch (err) {
      content.innerHTML = `<div style="color: #dc2626; padding: 20px; text-align: center;">Error loading session: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function handleSaveEditedSession() {
    if (!currentEditingSessionId) return;
    const submitBtn = document.getElementById('btnSubmitEditModal');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
    }

    const lectureType = document.getElementById('editSessionLectureType')?.value || 'Regular Lecture';
    const sessionName = document.getElementById('editSessionName')?.value || 'Admin Timetable Time';
    const startTime = document.getElementById('editSessionStartTime')?.value || '';
    const endTime = document.getElementById('editSessionEndTime')?.value || '';

    if (startTime && endTime && startTime >= endTime) {
      showToast('Start time must be strictly before End time.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';
      }
      return;
    }

    const rows = document.querySelectorAll('#editModalContent tbody tr[data-student-id]');
    const records = [];
    rows.forEach(r => {
      const studentId = r.getAttribute('data-student-id');
      const statusRadio = r.querySelector(`input[name="edit_status_${studentId}"]:checked`);
      const status = statusRadio ? statusRadio.value : 'Present';
      const remarksInput = r.querySelector('.edit-remarks-input');
      const remarks = remarksInput ? remarksInput.value.trim() : '';
      records.push({ student_id: parseInt(studentId, 10), status, remarks });
    });

    try {
      const res = await apiFetch(`/api/attendance/sessions/${encodeURIComponent(currentEditingSessionId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          lecture_type: lectureType,
          session_name: sessionName,
          start_time: startTime || undefined,
          end_time: endTime || undefined,
          records
        })
      });

      if (res && res.success) {
        showToast('Attendance session updated successfully.', 'success');
        document.getElementById('sessionEditModal')?.classList.add('hidden');
        await loadRecentAttendanceSessions();
        await loadAttendanceSummary();
      } else {
        showToast(res?.message || 'Failed to update session.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error updating session.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';
      }
    }
  }

  function openDeleteSessionModal(sessionId, courseCode, date, timeRange, studentCount) {
    currentDeletingSessionId = sessionId;
    const modal = document.getElementById('sessionDeleteModal');
    const details = document.getElementById('deleteModalSessionDetails');
    if (!modal || !details) return;

    details.innerHTML = `
      <div><strong>Course:</strong> ${escapeHtml(courseCode || '-')}</div>
      <div><strong>Date:</strong> ${escapeHtml(date || '-')}</div>
      <div><strong>Time:</strong> ${escapeHtml(timeRange || '-')}</div>
      <div><strong>Students Recorded:</strong> ${escapeHtml(studentCount || '0')}</div>
    `;
    modal.classList.remove('hidden');
  }

  async function handleConfirmDeleteSession() {
    if (!currentDeletingSessionId) return;
    const confirmBtn = document.getElementById('btnConfirmDeleteModal');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deleting...';
    }

    try {
      const res = await apiFetch(`/api/attendance/sessions/${encodeURIComponent(currentDeletingSessionId)}`, {
        method: 'DELETE'
      });

      if (res && res.success) {
        showToast('Attendance session deleted successfully.', 'success');
        document.getElementById('sessionDeleteModal')?.classList.add('hidden');
        await loadRecentAttendanceSessions();
        await loadAttendanceSummary();
        await loadTodayScheduledLectures();
      } else {
        showToast(res?.message || 'Failed to delete attendance session.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Error deleting session.', 'error');
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete Attendance';
      }
    }
  }

  async function loadAttendanceSummary() {
    try {
      const res = await apiFetch('/api/attendance/summary');
      if (res && res.success && res.data) {
        const summary = res.data.summary || {};
        const totalEl = document.getElementById('attKpiTotal');
        if (totalEl) totalEl.textContent = summary.total_records || 0;

        const presEl = document.getElementById('attKpiPresent');
        if (presEl) presEl.textContent = summary.present_count || 0;

        const absEl = document.getElementById('attKpiAbsent');
        if (absEl) absEl.textContent = summary.absent_count || 0;

        const avgEl = document.getElementById('attKpiAvg');
        if (avgEl) avgEl.textContent = summary.total_records > 0 && summary.average_percentage !== undefined ? summary.average_percentage + '%' : '--';
      }
    } catch (e) {
      // Graceful fallback
    }
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

  document.addEventListener('DOMContentLoaded', initAttendance);
})();
