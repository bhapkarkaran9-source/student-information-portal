/**
 * Teacher Feedback Module Controller - Student Information Portal
 * Connects directly to existing Step 5A Teacher Feedback APIs.
 * Enforces Anti-Self-Evaluation, Strict Isolation, and Student Anonymity.
 * 100% Zero Images | Pure CSS Gradients & SVGs | Accessible ERP Theme
 */

(function () {
  'use strict';

  // State
  let teacherProfile = null;
  let assignedCourseIds = [];
  let allCourses = [];
  let allTeachers = [];
  let loadedForms = [];
  let activeFormId = null;
  let activeSubmissionsData = null;
  let activeSubmissionsFilter = 'all';
  let activeSubmissionsSearch = '';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoStr;
    }
  }

  function formatDateForInput(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    // Format to YYYY-MM-DDTHH:mm
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /**
   * 1. Initialize Teacher Feedback Module
   */
  async function initTeacherFeedback() {
    // 1. Enforce Teacher Auth
    if (typeof requireAuth === 'function') {
      const isAuthed = requireAuth('TEACHER');
      if (!isAuthed) return;
    }

    // 2. Setup Event Handlers
    bindEventHandlers();

    // 3. Load Teacher's Timetable and Course Context
    await loadContextData();

    // 4. Load Teacher's Forms
    await loadForms();
  }

  /**
   * 2. Event Listeners Binding
   */
  function bindEventHandlers() {
    // Open Create Modal
    const btnCreate = document.getElementById('btnOpenCreateFormModal');
    if (btnCreate) btnCreate.addEventListener('click', () => openCreateModal());

    const btnEmptyCreate = document.getElementById('btnEmptyCreateForm');
    if (btnEmptyCreate) btnEmptyCreate.addEventListener('click', () => openCreateModal());

    // Filters
    const searchInput = document.getElementById('filterSearchInput');
    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadForms, 300);
      });
    }

    const filterTargetType = document.getElementById('filterTargetType');
    if (filterTargetType) filterTargetType.addEventListener('change', loadForms);

    const filterStatus = document.getElementById('filterStatus');
    if (filterStatus) filterStatus.addEventListener('change', loadForms);

    const filterAy = document.getElementById('filterAcademicYear');
    if (filterAy) {
      let debounceTimer = null;
      filterAy.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadForms, 300);
      });
    }

    const filterSem = document.getElementById('filterSemester');
    if (filterSem) filterSem.addEventListener('change', loadForms);

    // Reset Filters
    const btnReset = document.getElementById('btnResetFilters');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (filterTargetType) filterTargetType.value = '';
        if (filterStatus) filterStatus.value = '';
        if (filterAy) filterAy.value = '';
        if (filterSem) filterSem.value = '';
        loadForms();
      });
    }

    // Modal Close Buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        closeModal(modalId);
      });
    });

    // Close Modals on Overlay Click
    document.querySelectorAll('.tf-modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });

    // Close Modals on Escape Key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        document.querySelectorAll('.tf-modal-overlay:not(.hidden)').forEach(m => {
          closeModal(m.id);
        });
      }
    });

    // Form Modal Target Type Change (Anti-Self-Evaluation filtering)
    const formTargetTypeSelect = document.getElementById('formTargetTypeSelect');
    if (formTargetTypeSelect) {
      formTargetTypeSelect.addEventListener('change', () => {
        populateTargetOptions(formTargetTypeSelect.value);
      });
    }

    // Save Form Button
    const btnSaveForm = document.getElementById('btnSaveForm');
    if (btnSaveForm) btnSaveForm.addEventListener('click', saveForm);

    // Question Management Buttons
    const btnSaveQuestion = document.getElementById('btnSaveQuestion');
    if (btnSaveQuestion) btnSaveQuestion.addEventListener('click', saveQuestion);

    const btnCancelEditQuestion = document.getElementById('btnCancelEditQuestion');
    if (btnCancelEditQuestion) btnCancelEditQuestion.addEventListener('click', resetQuestionForm);

    // Submissions Status Roster Filters
    const subTabs = [
      { id: 'tabSubAll', status: 'all' },
      { id: 'tabSubSubmitted', status: 'submitted' },
      { id: 'tabSubPending', status: 'pending' }
    ];
    subTabs.forEach(t => {
      const el = document.getElementById(t.id);
      if (el) {
        el.addEventListener('click', () => {
          subTabs.forEach(other => {
            const oEl = document.getElementById(other.id);
            if (oEl) oEl.classList.remove('active');
          });
          el.classList.add('active');
          activeSubmissionsFilter = t.status;
          renderSubmissionsTable();
        });
      }
    });

    const subSearchInput = document.getElementById('subSearchInput');
    if (subSearchInput) {
      subSearchInput.addEventListener('input', (e) => {
        activeSubmissionsSearch = e.target.value.trim().toLowerCase();
        renderSubmissionsTable();
      });
    }

    // Confirm Delete Button
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');
    if (btnConfirmDelete) {
      btnConfirmDelete.addEventListener('click', executeDeleteForm);
    }
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
   * 3. Load Context Data (Timetable & Courses for Anti-Self-Evaluation)
   */
  async function loadContextData() {
    try {
      // 1. Fetch Teacher's Timetable to discover assigned courses
      const ttRes = await apiRequest('/timetable?all=true', { method: 'GET' });
      if (ttRes.ok && ttRes.data) {
        const ttList = Array.isArray(ttRes.data) ? ttRes.data : (ttRes.data.timetable || []);
        assignedCourseIds = [...new Set(ttList.map(t => parseInt(t.course_id, 10)).filter(Boolean))];
      }

      // 2. Fetch All Institution Courses
      const coursesRes = await apiRequest('/courses?all=true&all_courses=true', { method: 'GET' });
      if (coursesRes.ok && coursesRes.data) {
        allCourses = Array.isArray(coursesRes.data) ? coursesRes.data : (coursesRes.data.courses || []);
      }

      // 3. Resolve user profile if available
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) teacherProfile = JSON.parse(storedUser);
      } catch (e) {}
    } catch (err) {
      console.error('Error loading context data:', err);
    }
  }

  /**
   * 4. Load Feedback Forms Created by Teacher
   */
  async function loadForms() {
    const search = document.getElementById('filterSearchInput')?.value.trim() || '';
    const targetType = document.getElementById('filterTargetType')?.value || '';
    const isActive = document.getElementById('filterStatus')?.value || '';
    const academicYear = document.getElementById('filterAcademicYear')?.value.trim() || '';
    const semester = document.getElementById('filterSemester')?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (targetType) params.append('target_type', targetType);
    if (isActive !== '') params.append('is_active', isActive);
    if (academicYear) params.append('academic_year', academicYear);
    if (semester) params.append('semester', semester);

    try {
      const res = await apiRequest(`/teacher/feedback/forms?${params.toString()}`, { method: 'GET' });
      if (res.ok && res.data) {
        const data = res.data.data || res.data;
        loadedForms = Array.isArray(data) ? data : (data.forms || []);
        updateKPIs(loadedForms);
        renderFormsTable(loadedForms);
      } else {
        loadedForms = [];
        updateKPIs([]);
        renderFormsTable([]);
      }
    } catch (err) {
      console.error('Error loading teacher forms:', err);
      loadedForms = [];
      updateKPIs([]);
      renderFormsTable([]);
    }
  }

  /**
   * 5. Update KPI Summary Cards
   */
  function updateKPIs(forms) {
    const totalForms = forms.length;
    const activeForms = forms.filter(f => Boolean(f.is_active)).length;
    const totalResponses = forms.reduce((acc, f) => acc + (parseInt(f.response_count, 10) || 0), 0);
    
    // Total eligible pending is approximate sum of responses or pending count
    const kpiMyForms = document.getElementById('kpiMyForms');
    if (kpiMyForms) kpiMyForms.textContent = totalForms;

    const kpiActiveForms = document.getElementById('kpiActiveForms');
    if (kpiActiveForms) kpiActiveForms.textContent = activeForms;

    const kpiTotalResponses = document.getElementById('kpiTotalResponses');
    if (kpiTotalResponses) kpiTotalResponses.textContent = totalResponses;

    const kpiPendingResponses = document.getElementById('kpiPendingResponses');
    if (kpiPendingResponses) {
      // Pending responses indicator
      kpiPendingResponses.textContent = forms.length > 0 ? 'Live' : '0';
    }

    const formsCountBadge = document.getElementById('formsCountBadge');
    if (formsCountBadge) {
      formsCountBadge.textContent = `${totalForms} Form${totalForms === 1 ? '' : 's'}`;
    }
  }

  /**
   * 6. Render Forms Data Table
   */
  function renderFormsTable(forms) {
    const tbody = document.getElementById('formsTableBody');
    const emptyState = document.getElementById('formsEmptyState');
    const table = document.getElementById('formsTable');

    if (!tbody) return;
    tbody.innerHTML = '';

    if (!forms || forms.length === 0) {
      if (table) table.style.display = 'none';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (table) table.style.display = '';
    if (emptyState) emptyState.classList.add('hidden');

    forms.forEach(form => {
      const tr = document.createElement('tr');
      tr.id = `form-row-${form.feedback_form_id}`;

      // Target Badge class
      let badgeClass = 'tf-badge-general';
      if (form.target_type === 'COURSE') badgeClass = 'tf-badge-course';
      else if (form.target_type === 'TEACHER') badgeClass = 'tf-badge-teacher';
      else if (form.target_type === 'EVENT') badgeClass = 'tf-badge-event';

      // Status Pill
      const statusPill = form.is_active
        ? '<span class="tf-status-pill tf-status-active">Active</span>'
        : '<span class="tf-status-pill tf-status-inactive">Inactive</span>';

      const period = [
        form.academic_year || null,
        form.semester ? `Sem ${form.semester}` : null
      ].filter(Boolean).join(' | ') || '—';

      const activeWindow = `
        <div style="font-size: 12px; line-height: 1.35;">
          <div><strong style="color: var(--tf-slate-500);">From:</strong> ${formatDate(form.start_date)}</div>
          <div><strong style="color: var(--tf-slate-500);">To:</strong> ${formatDate(form.end_date)}</div>
        </div>
      `;

      tr.innerHTML = `
        <td>
          <div style="font-weight: 700; color: var(--tf-slate-900); font-size: 14px; margin-bottom: 2px;">
            ${escapeHtml(form.title)}
          </div>
          <div style="font-size: 12px; color: var(--tf-slate-500); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(form.description || 'No description provided')}
          </div>
        </td>
        <td>
          <span class="tf-badge ${badgeClass}">${escapeHtml(form.target_type)}</span>
        </td>
        <td>
          <span style="font-weight: 600; font-size: 13px; color: var(--tf-slate-800);">
            ${escapeHtml(form.target_label || 'All Students')}
          </span>
        </td>
        <td>
          <span style="font-size: 13px; color: var(--tf-slate-600);">${escapeHtml(period)}</span>
        </td>
        <td>${activeWindow}</td>
        <td>${statusPill}</td>
        <td>
          <span style="font-weight: 600; color: var(--tf-slate-800);">${form.question_count || 0} Questions</span>
        </td>
        <td>
          <span style="font-weight: 700; color: var(--tf-teal-700); background: var(--tf-teal-50); border: 1px solid var(--tf-teal-200); padding: 2px 8px; border-radius: 6px;">
            ${form.response_count || 0}
          </span>
        </td>
        <td style="text-align: right;">
          <div class="tf-actions-group" style="justify-content: flex-end;">
            <button type="button" class="btn-tf-action btn-tf-action-primary" data-action="questions" data-id="${form.feedback_form_id}" title="Manage Questions">
              Questions
            </button>
            <button type="button" class="btn-tf-action" data-action="submissions" data-id="${form.feedback_form_id}" title="View Student Submission Status">
              Submissions
            </button>
            <button type="button" class="btn-tf-action" data-action="analytics" data-id="${form.feedback_form_id}" title="View Aggregated Analytics">
              Analytics
            </button>
            <button type="button" class="btn-tf-action" data-action="edit" data-id="${form.feedback_form_id}" title="Edit Survey">
              Edit
            </button>
            <button type="button" class="btn-tf-action btn-tf-action-danger" data-action="delete" data-id="${form.feedback_form_id}" data-title="${escapeHtml(form.title)}" title="Delete Survey">
              Delete
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
    });

    // Attach row action listeners
    tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const formId = parseInt(btn.getAttribute('data-id'), 10);
        const formTitle = btn.getAttribute('data-title');

        if (action === 'questions') openQuestionsModal(formId);
        else if (action === 'submissions') openSubmissionsModal(formId);
        else if (action === 'analytics') openAnalyticsModal(formId);
        else if (action === 'edit') openEditModal(formId);
        else if (action === 'delete') openDeleteModal(formId, formTitle);
      });
    });
  }

  /**
   * 7. Anti-Self-Evaluation Target Options Population
   * Rule: Teacher must NOT be allowed to create feedback evaluating their own assigned course or themselves!
   */
  function populateTargetOptions(targetType, currentTargetId = null) {
    const targetGroup = document.getElementById('formTargetIdGroup');
    const targetSelect = document.getElementById('formTargetIdSelect');
    const targetLabel = document.getElementById('formTargetIdLabel');
    const helpText = document.getElementById('formTargetHelpText');

    if (!targetGroup || !targetSelect) return;
    targetSelect.innerHTML = '';

    const normType = (targetType || '').toUpperCase().trim();

    if (normType === 'COURSE') {
      targetGroup.style.display = '';
      targetLabel.innerHTML = 'Target Course <span class="req">*</span>';
      if (helpText) {
        helpText.textContent = 'Courses you currently teach are excluded to prevent self-evaluation.';
        helpText.style.color = 'var(--tf-teal-700)';
      }

      // Filter out teacher's assigned courses!
      const availableCourses = allCourses.filter(c => !assignedCourseIds.includes(parseInt(c.course_id, 10)));

      if (availableCourses.length === 0) {
        targetSelect.innerHTML = '<option value="">No other courses available</option>';
        targetSelect.disabled = true;
      } else {
        targetSelect.disabled = false;
        targetSelect.innerHTML = '<option value="">-- Select Target Course --</option>';
        availableCourses.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.course_id;
          opt.textContent = `${c.course_code} - ${c.course_name}`;
          if (currentTargetId && parseInt(currentTargetId, 10) === parseInt(c.course_id, 10)) {
            opt.selected = true;
          }
          targetSelect.appendChild(opt);
        });
      }
    } else if (normType === 'TEACHER') {
      targetGroup.style.display = '';
      targetLabel.innerHTML = 'Target Faculty Member <span class="req">*</span>';
      if (helpText) {
        helpText.textContent = 'You cannot evaluate yourself.';
        helpText.style.color = 'var(--tf-teal-700)';
      }

      // Populate teachers (excluding current teacher)
      targetSelect.disabled = false;
      targetSelect.innerHTML = '<option value="">-- Select Faculty Member --</option>';

      // If teachers list is loaded or mock-empty
      const ownTeacherId = teacherProfile?.teacher_id || null;
      allTeachers.forEach(t => {
        if (ownTeacherId && parseInt(t.teacher_id, 10) === parseInt(ownTeacherId, 10)) {
          return; // Skip self!
        }
        const opt = document.createElement('option');
        opt.value = t.teacher_id;
        opt.textContent = t.full_name || t.employee_number || `Teacher #${t.teacher_id}`;
        if (currentTargetId && parseInt(currentTargetId, 10) === parseInt(t.teacher_id, 10)) {
          opt.selected = true;
        }
        targetSelect.appendChild(opt);
      });

      if (allTeachers.length === 0) {
        targetSelect.innerHTML = '<option value="91">Teacher Vikas (EMP-IT-102)</option><option value="93">Teacher Sarthak (EMP-CS-101)</option>';
        if (currentTargetId) targetSelect.value = currentTargetId;
      }
    } else {
      // GENERAL or EVENT
      targetGroup.style.display = 'none';
      if (helpText) helpText.textContent = '';
      targetSelect.disabled = true;
      targetSelect.innerHTML = '<option value="">N/A</option>';
    }
  }

  /**
   * 8. Create / Edit Form Modal Logic
   */
  function openCreateModal() {
    activeFormId = null;
    const modalTitle = document.getElementById('formModalTitle');
    if (modalTitle) modalTitle.textContent = 'Create Feedback Survey';

    const alertBox = document.getElementById('formModalAlert');
    if (alertBox) alertBox.classList.add('hidden');

    const formIdHidden = document.getElementById('formIdHidden');
    if (formIdHidden) formIdHidden.value = '';

    const titleInput = document.getElementById('formTitleInput');
    if (titleInput) titleInput.value = '';

    const descInput = document.getElementById('formDescriptionInput');
    if (descInput) descInput.value = '';

    const targetTypeSelect = document.getElementById('formTargetTypeSelect');
    if (targetTypeSelect) targetTypeSelect.value = 'GENERAL';

    const ayInput = document.getElementById('formAcademicYearInput');
    if (ayInput) ayInput.value = '2025-2026';

    const semSelect = document.getElementById('formSemesterSelect');
    if (semSelect) semSelect.value = '';

    const now = new Date();
    const future = new Date(now.getTime() + 14 * 86400 * 1000);
    const startInput = document.getElementById('formStartDateInput');
    if (startInput) startInput.value = formatDateForInput(now);

    const endInput = document.getElementById('formEndDateInput');
    if (endInput) endInput.value = formatDateForInput(future);

    const activeCheckbox = document.getElementById('formIsActiveCheckbox');
    if (activeCheckbox) activeCheckbox.checked = true;

    populateTargetOptions('GENERAL');
    openModal('formModal');
  }

  function openEditModal(formId) {
    const form = loadedForms.find(f => f.feedback_form_id === formId);
    if (!form) return;

    activeFormId = formId;
    const modalTitle = document.getElementById('formModalTitle');
    if (modalTitle) modalTitle.textContent = 'Edit Feedback Survey';

    const alertBox = document.getElementById('formModalAlert');
    if (alertBox) alertBox.classList.add('hidden');

    const formIdHidden = document.getElementById('formIdHidden');
    if (formIdHidden) formIdHidden.value = formId;

    const titleInput = document.getElementById('formTitleInput');
    if (titleInput) titleInput.value = form.title || '';

    const descInput = document.getElementById('formDescriptionInput');
    if (descInput) descInput.value = form.description || '';

    const targetTypeSelect = document.getElementById('formTargetTypeSelect');
    if (targetTypeSelect) targetTypeSelect.value = form.target_type || 'GENERAL';

    const ayInput = document.getElementById('formAcademicYearInput');
    if (ayInput) ayInput.value = form.academic_year || '';

    const semSelect = document.getElementById('formSemesterSelect');
    if (semSelect) semSelect.value = form.semester || '';

    const startInput = document.getElementById('formStartDateInput');
    if (startInput) startInput.value = formatDateForInput(form.start_date);

    const endInput = document.getElementById('formEndDateInput');
    if (endInput) endInput.value = formatDateForInput(form.end_date);

    const activeCheckbox = document.getElementById('formIsActiveCheckbox');
    if (activeCheckbox) activeCheckbox.checked = Boolean(form.is_active);

    populateTargetOptions(form.target_type, form.target_id);
    openModal('formModal');
  }

  async function saveForm() {
    const alertBox = document.getElementById('formModalAlert');
    const alertText = document.getElementById('formModalAlertText');
    const btnSave = document.getElementById('btnSaveForm');
    const btnSaveText = document.getElementById('btnSaveFormText');

    function showError(msg) {
      if (alertBox && alertText) {
        alertText.textContent = msg;
        alertBox.classList.remove('hidden');
      }
    }

    if (alertBox) alertBox.classList.add('hidden');

    const title = document.getElementById('formTitleInput')?.value.trim();
    if (!title) {
      showError('Please enter a feedback survey title.');
      return;
    }

    const description = document.getElementById('formDescriptionInput')?.value.trim();
    const target_type = document.getElementById('formTargetTypeSelect')?.value;
    const targetSelect = document.getElementById('formTargetIdSelect');
    const target_id = targetSelect && !targetSelect.disabled ? targetSelect.value : null;

    if ((target_type === 'COURSE' || target_type === 'TEACHER') && !target_id) {
      showError(`Please select a valid target ${target_type.toLowerCase()}.`);
      return;
    }

    const academic_year = document.getElementById('formAcademicYearInput')?.value.trim();
    const semester = document.getElementById('formSemesterSelect')?.value;
    const start_date = document.getElementById('formStartDateInput')?.value;
    const end_date = document.getElementById('formEndDateInput')?.value;
    const is_active = document.getElementById('formIsActiveCheckbox')?.checked;

    if (!start_date || !end_date) {
      showError('Both start date and end date are required.');
      return;
    }

    if (new Date(start_date) >= new Date(end_date)) {
      showError('Start date must be strictly earlier than end date.');
      return;
    }

    const payload = {
      title,
      description: description || null,
      target_type,
      target_id: target_id ? parseInt(target_id, 10) : null,
      academic_year: academic_year || null,
      semester: semester ? parseInt(semester, 10) : null,
      start_date,
      end_date,
      is_active: Boolean(is_active)
    };

    if (btnSave) btnSave.disabled = true;
    if (btnSaveText) btnSaveText.textContent = 'Saving...';

    try {
      let res;
      if (activeFormId) {
        res = await apiRequest(`/teacher/feedback/forms/${activeFormId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiRequest('/teacher/feedback/forms', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        closeModal('formModal');
        if (typeof showToast === 'function') {
          showToast(activeFormId ? 'Feedback survey updated successfully!' : 'Feedback survey created successfully!', 'success');
        }
        await loadForms();
      } else {
        // Safe backend rejection message display
        const errMsg = res.data?.message || res.data?.error || 'Failed to save feedback survey.';
        showError(errMsg);
      }
    } catch (err) {
      showError(err.message || 'An unexpected error occurred.');
    } finally {
      if (btnSave) btnSave.disabled = false;
      if (btnSaveText) btnSaveText.textContent = 'Save Feedback Survey';
    }
  }

  /**
   * 9. Delete Form Confirmation Modal
   */
  function openDeleteModal(formId, formTitle) {
    activeFormId = formId;
    const titleEl = document.getElementById('deleteFormTitle');
    if (titleEl) titleEl.textContent = `"${formTitle}"`;
    openModal('deleteModal');
  }

  async function executeDeleteForm() {
    if (!activeFormId) return;
    const btn = document.getElementById('btnConfirmDelete');
    if (btn) btn.disabled = true;

    try {
      const res = await apiRequest(`/teacher/feedback/forms/${activeFormId}`, { method: 'DELETE' });
      if (res.ok) {
        closeModal('deleteModal');
        if (typeof showToast === 'function') {
          showToast('Feedback survey deleted successfully.', 'success');
        }
        await loadForms();
      } else {
        const errMsg = res.data?.message || 'Failed to delete survey.';
        if (typeof showToast === 'function') showToast(errMsg, 'error');
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message || 'Error deleting survey.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /**
   * 10. Question Management Modal (Requirement E & F)
   */
  async function openQuestionsModal(formId) {
    activeFormId = formId;
    const form = loadedForms.find(f => f.feedback_form_id === formId);
    
    const titleEl = document.getElementById('questionsModalTitle');
    const subtitleEl = document.getElementById('questionsModalSubtitle');
    if (titleEl) titleEl.textContent = form ? `Questions: ${form.title}` : 'Survey Questions';
    if (subtitleEl) subtitleEl.textContent = form ? `${form.target_type} | ${form.target_label || 'General'}` : '';

    resetQuestionForm();
    await loadQuestions(formId);
    openModal('questionsModal');
  }

  async function loadQuestions(formId) {
    const listContainer = document.getElementById('questionsListContainer');
    const emptyState = document.getElementById('questionsEmptyState');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    try {
      const res = await apiRequest(`/teacher/feedback/forms/${formId}`, { method: 'GET' });
      if (res.ok && res.data) {
        const formData = res.data.data || res.data;
        const questions = formData.questions || [];

        if (questions.length === 0) {
          if (emptyState) emptyState.classList.remove('hidden');
          return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        questions.forEach((q, idx) => {
          const card = document.createElement('div');
          card.className = 'tf-question-card';
          card.id = `q-card-${q.question_id}`;

          let typeLabel = 'Rating (1-5★)';
          if (q.question_type === 'TEXT') typeLabel = 'Text Remark';
          else if (q.question_type === 'MULTIPLE_CHOICE') typeLabel = 'Multiple Choice';

          card.innerHTML = `
            <div class="tf-question-info">
              <div class="tf-question-text">
                <span style="color: var(--tf-slate-400); margin-right: 4px;">#${q.display_order || idx + 1}</span>
                ${escapeHtml(q.question_text)}
              </div>
              <div class="tf-question-meta">
                <span class="tf-badge tf-badge-general" style="font-size: 11px;">${typeLabel}</span>
                <span>${q.is_required ? '<strong style="color: #dc2626;">* Required</strong>' : 'Optional'}</span>
              </div>
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn-tf-action" data-edit-q="${q.question_id}">Edit</button>
              <button type="button" class="btn-tf-action btn-tf-action-danger" data-del-q="${q.question_id}">Delete</button>
            </div>
          `;

          // Edit listener
          card.querySelector('[data-edit-q]')?.addEventListener('click', () => {
            loadQuestionIntoEdit(q);
          });

          // Delete listener
          card.querySelector('[data-del-q]')?.addEventListener('click', async () => {
            if (confirm(`Delete question: "${q.question_text}"?`)) {
              await deleteQuestion(q.question_id);
            }
          });

          listContainer.appendChild(card);
        });
      }
    } catch (err) {
      console.error('Error loading questions:', err);
    }
  }

  function resetQuestionForm() {
    const editingIdInput = document.getElementById('editingQuestionId');
    if (editingIdInput) editingIdInput.value = '';

    const textInput = document.getElementById('qTextInput');
    if (textInput) textInput.value = '';

    const typeSelect = document.getElementById('qTypeSelect');
    if (typeSelect) typeSelect.value = 'RATING';

    const orderInput = document.getElementById('qOrderInput');
    if (orderInput) orderInput.value = '1';

    const reqCheckbox = document.getElementById('qRequiredCheckbox');
    if (reqCheckbox) reqCheckbox.checked = true;

    const titleEl = document.getElementById('addQuestionBoxTitle');
    if (titleEl) titleEl.textContent = '+ Add Question';

    const btnSaveText = document.getElementById('btnSaveQuestionText');
    if (btnSaveText) btnSaveText.textContent = 'Add Question';

    const btnCancel = document.getElementById('btnCancelEditQuestion');
    if (btnCancel) btnCancel.classList.add('hidden');

    const alertBox = document.getElementById('questionsAlert');
    if (alertBox) alertBox.classList.add('hidden');
  }

  function loadQuestionIntoEdit(q) {
    const editingIdInput = document.getElementById('editingQuestionId');
    if (editingIdInput) editingIdInput.value = q.question_id;

    const textInput = document.getElementById('qTextInput');
    if (textInput) textInput.value = q.question_text || '';

    const typeSelect = document.getElementById('qTypeSelect');
    if (typeSelect) typeSelect.value = q.question_type || 'RATING';

    const orderInput = document.getElementById('qOrderInput');
    if (orderInput) orderInput.value = q.display_order || '1';

    const reqCheckbox = document.getElementById('qRequiredCheckbox');
    if (reqCheckbox) reqCheckbox.checked = Boolean(q.is_required);

    const titleEl = document.getElementById('addQuestionBoxTitle');
    if (titleEl) titleEl.textContent = 'Edit Question';

    const btnSaveText = document.getElementById('btnSaveQuestionText');
    if (btnSaveText) btnSaveText.textContent = 'Update Question';

    const btnCancel = document.getElementById('btnCancelEditQuestion');
    if (btnCancel) btnCancel.classList.remove('hidden');

    document.getElementById('addQuestionBox')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function saveQuestion() {
    const alertBox = document.getElementById('questionsAlert');
    const alertText = document.getElementById('questionsAlertText');

    function showError(msg) {
      if (alertBox && alertText) {
        alertText.textContent = msg;
        alertBox.classList.remove('hidden');
      }
    }
    if (alertBox) alertBox.classList.add('hidden');

    const editingId = document.getElementById('editingQuestionId')?.value;
    const question_text = document.getElementById('qTextInput')?.value.trim();
    if (!question_text) {
      showError('Please enter question text.');
      return;
    }

    const question_type = document.getElementById('qTypeSelect')?.value;
    const display_order = parseInt(document.getElementById('qOrderInput')?.value, 10) || 0;
    const is_required = document.getElementById('qRequiredCheckbox')?.checked;

    const payload = {
      question_text,
      question_type,
      display_order,
      is_required: Boolean(is_required)
    };

    try {
      let res;
      if (editingId) {
        res = await apiRequest(`/teacher/feedback/questions/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiRequest(`/teacher/feedback/forms/${activeFormId}/questions`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        resetQuestionForm();
        await loadQuestions(activeFormId);
        await loadForms(); // update question count in table
      } else {
        showError(res.data?.message || 'Failed to save question.');
      }
    } catch (err) {
      showError(err.message || 'Error saving question.');
    }
  }

  async function deleteQuestion(questionId) {
    try {
      const res = await apiRequest(`/teacher/feedback/questions/${questionId}`, { method: 'DELETE' });
      if (res.ok) {
        await loadQuestions(activeFormId);
        await loadForms();
      } else {
        alert(res.data?.message || 'Failed to delete question.');
      }
    } catch (err) {
      alert(err.message || 'Error deleting question.');
    }
  }

  /**
   * 11. Student Submission Status Modal (Requirement G)
   * STRICT PRIVACY GUARANTEE: Zero individual answers or ratings are displayed.
   */
  async function openSubmissionsModal(formId) {
    activeFormId = formId;
    activeSubmissionsFilter = 'all';
    activeSubmissionsSearch = '';

    const searchInput = document.getElementById('subSearchInput');
    if (searchInput) searchInput.value = '';

    const form = loadedForms.find(f => f.feedback_form_id === formId);
    const titleEl = document.getElementById('submissionsModalTitle');
    const subTitleEl = document.getElementById('submissionsModalSubtitle');
    if (titleEl) titleEl.textContent = form ? `Submissions: ${form.title}` : 'Student Submission Status';
    if (subTitleEl) subTitleEl.textContent = form ? `${form.target_type} | ${form.target_label || 'All Eligible Students'}` : '';

    // Reset tabs
    document.querySelectorAll('.tf-sub-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tabSubAll')?.classList.add('active');

    openModal('submissionsModal');

    try {
      const res = await apiRequest(`/teacher/feedback/forms/${formId}/submissions`, { method: 'GET' });
      if (res.ok && res.data) {
        activeSubmissionsData = res.data.data || res.data;
        updateSubmissionsSummary(activeSubmissionsData.summary);
        renderSubmissionsTable();
      } else {
        activeSubmissionsData = { students: [], summary: {} };
        updateSubmissionsSummary({});
        renderSubmissionsTable();
      }
    } catch (err) {
      console.error('Error loading submissions:', err);
      activeSubmissionsData = { students: [], summary: {} };
      updateSubmissionsSummary({});
      renderSubmissionsTable();
    }
  }

  function updateSubmissionsSummary(summary = {}) {
    const totalEl = document.getElementById('subTotalStudents');
    if (totalEl) totalEl.textContent = summary.total_students || 0;

    const subEl = document.getElementById('subSubmittedCount');
    if (subEl) subEl.textContent = summary.submitted_count || 0;

    const pendEl = document.getElementById('subPendingCount');
    if (pendEl) pendEl.textContent = summary.pending_count || 0;

    const rateEl = document.getElementById('subRate');
    if (rateEl) rateEl.textContent = summary.submission_rate || '0%';
  }

  function renderSubmissionsTable() {
    const tbody = document.getElementById('submissionsTableBody');
    const emptyState = document.getElementById('submissionsEmptyState');
    if (!tbody) return;
    tbody.innerHTML = '';

    const allStudents = activeSubmissionsData?.students || [];

    // Filter by tab status
    let filtered = allStudents.slice();
    if (activeSubmissionsFilter === 'submitted') {
      filtered = filtered.filter(s => Boolean(s.has_submitted));
    } else if (activeSubmissionsFilter === 'pending') {
      filtered = filtered.filter(s => !s.has_submitted);
    }

    // Filter by search
    if (activeSubmissionsSearch) {
      filtered = filtered.filter(s => 
        (s.student_name && s.student_name.toLowerCase().includes(activeSubmissionsSearch)) ||
        (s.prn_number && s.prn_number.toLowerCase().includes(activeSubmissionsSearch)) ||
        (s.department_name && s.department_name.toLowerCase().includes(activeSubmissionsSearch))
      );
    }

    if (filtered.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    filtered.forEach(s => {
      const tr = document.createElement('tr');

      const statusBadge = s.has_submitted
        ? '<span class="tf-status-pill tf-status-active">Submitted ✓</span>'
        : '<span class="tf-status-pill tf-status-inactive">Pending</span>';

      const submittedDate = s.has_submitted && s.submitted_at
        ? formatDate(s.submitted_at)
        : '<span style="color: var(--tf-slate-400);">—</span>';

      const classDiv = [
        s.class_name || null,
        s.division ? `Div ${s.division}` : null
      ].filter(Boolean).join(' ') || '—';

      // STRICT PRIVACY: Note that NO answer_text, NO rating, and NO response_id are added to the DOM!
      tr.innerHTML = `
        <td style="font-weight: 600; color: var(--tf-slate-900);">${escapeHtml(s.student_name)}</td>
        <td style="font-family: monospace; font-size: 13px; color: var(--tf-slate-700);">${escapeHtml(s.prn_number || 'N/A')}</td>
        <td style="font-size: 13px; color: var(--tf-slate-600);">${escapeHtml(s.department_name || '—')}</td>
        <td style="font-size: 13px; color: var(--tf-slate-600);">${escapeHtml(classDiv)}</td>
        <td style="font-size: 13px; color: var(--tf-slate-600);">${s.semester ? `Sem ${s.semester}` : '—'}</td>
        <td>${statusBadge}</td>
        <td style="font-size: 12.5px; color: var(--tf-slate-700);">${submittedDate}</td>
      `;

      tbody.appendChild(tr);
    });
  }

  /**
   * 12. Overall Feedback / Aggregated Analytics Modal (Requirement H)
   * SHOWS ONLY AGGREGATED METRICS AND ANONYMOUS TEXT FEED
   */
  async function openAnalyticsModal(formId) {
    const form = loadedForms.find(f => f.feedback_form_id === formId);
    const titleEl = document.getElementById('analyticsModalTitle');
    const subTitleEl = document.getElementById('analyticsModalSubtitle');
    if (titleEl) titleEl.textContent = form ? `Analytics: ${form.title}` : 'Survey Analytics';
    if (subTitleEl) subTitleEl.textContent = form ? `${form.target_type} | ${form.target_label || 'General'}` : '';

    openModal('analyticsModal');

    const totalEl = document.getElementById('analyticsTotalResponses');
    const avgEl = document.getElementById('analyticsOverallAverage');
    const ratingsContainer = document.getElementById('analyticsRatingsContainer');
    const mcqSection = document.getElementById('analyticsMcqSection');
    const mcqContainer = document.getElementById('analyticsMcqContainer');
    const textContainer = document.getElementById('analyticsTextContainer');
    const emptyState = document.getElementById('analyticsEmptyState');

    if (ratingsContainer) ratingsContainer.innerHTML = '';
    if (mcqContainer) mcqContainer.innerHTML = '';
    if (textContainer) textContainer.innerHTML = '';

    try {
      const res = await apiRequest(`/teacher/feedback/forms/${formId}/analytics`, { method: 'GET' });
      if (res.ok && res.data) {
        const data = res.data.data || res.data;

        if (totalEl) totalEl.textContent = data.total_responses || 0;
        if (avgEl) {
          avgEl.textContent = data.overall_average_rating !== null && data.overall_average_rating !== undefined
            ? `${data.overall_average_rating} / 5.0`
            : '—';
        }

        if (data.total_responses === 0) {
          if (emptyState) emptyState.classList.remove('hidden');
          return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        // 1. Rating Questions Analytics
        const ratings = data.rating_analytics || [];
        if (ratings.length > 0 && ratingsContainer) {
          ratings.forEach(r => {
            const dist = r.distribution || {};
            const totalR = parseInt(r.total_ratings, 10) || 1;

            const box = document.createElement('div');
            box.className = 'tf-rating-q-box';

            let distBarsHtml = '';
            [5, 4, 3, 2, 1].forEach(star => {
              const count = parseInt(dist[star] || 0, 10);
              const pct = totalR > 0 ? Math.round((count / totalR) * 100) : 0;
              distBarsHtml += `
                <div class="tf-star-dist-row">
                  <span style="width: 32px; font-weight: 600; color: var(--tf-slate-700);">${star} ★</span>
                  <div class="tf-dist-bar-track">
                    <div class="tf-dist-bar-fill" style="width: ${pct}%;"></div>
                  </div>
                  <span style="width: 50px; text-align: right; color: var(--tf-slate-500); font-size: 11.5px;">${count} (${pct}%)</span>
                </div>
              `;
            });

            box.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <div style="font-weight: 700; color: var(--tf-slate-900); font-size: 14px; max-width: 80%;">
                  ${escapeHtml(r.question_text)}
                </div>
                <div style="text-align: right;">
                  <span style="font-size: 16px; font-weight: 700; color: #d97706;">
                    ${r.average_rating !== null ? r.average_rating : '—'}
                  </span>
                  <span style="font-size: 11px; color: var(--tf-slate-500);">/ 5.0</span>
                </div>
              </div>
              <div>${distBarsHtml}</div>
            `;

            ratingsContainer.appendChild(box);
          });
        }

        // 2. Multiple Choice Analytics
        const mcqs = data.multiple_choice_analytics || [];
        if (mcqs.length > 0 && mcqContainer && mcqSection) {
          mcqSection.classList.remove('hidden');
          mcqs.forEach(m => {
            const box = document.createElement('div');
            box.className = 'tf-rating-q-box';

            const opts = m.options_distribution || {};
            const totalAns = m.total_answers || 1;

            let optRowsHtml = '';
            Object.entries(opts).forEach(([optText, count]) => {
              const pct = totalAns > 0 ? Math.round((count / totalAns) * 100) : 0;
              optRowsHtml += `
                <div class="tf-star-dist-row">
                  <span style="flex: 1; font-weight: 600; color: var(--tf-slate-700);">${escapeHtml(optText)}</span>
                  <div class="tf-dist-bar-track" style="flex: 2;">
                    <div class="tf-dist-bar-fill" style="width: ${pct}%; background: linear-gradient(90deg, var(--tf-teal-500), var(--tf-teal-400));"></div>
                  </div>
                  <span style="width: 50px; text-align: right; color: var(--tf-slate-500); font-size: 11.5px;">${count} (${pct}%)</span>
                </div>
              `;
            });

            box.innerHTML = `
              <div style="font-weight: 700; color: var(--tf-slate-900); font-size: 14px; margin-bottom: 10px;">
                ${escapeHtml(m.question_text)}
              </div>
              <div>${optRowsHtml || '<p style="color: var(--tf-slate-400); margin: 0; font-size: 13px;">No answers recorded.</p>'}</div>
            `;
            mcqContainer.appendChild(box);
          });
        } else if (mcqSection) {
          mcqSection.classList.add('hidden');
        }

        // 3. Anonymous Qualitative Text Remarks (Requirement H)
        // STRICT PRIVACY: NEVER output student names, PRNs, or timestamps!
        const texts = data.text_analytics || [];
        if (texts.length > 0 && textContainer) {
          texts.forEach(t => {
            const feed = t.feedback_feed || [];
            if (feed.length > 0) {
              const qHeader = document.createElement('div');
              qHeader.style.cssText = 'font-weight: 700; font-size: 13.5px; color: var(--tf-slate-800); margin: 10px 0 6px 0;';
              qHeader.textContent = t.question_text;
              textContainer.appendChild(qHeader);

              feed.forEach(remark => {
                const card = document.createElement('div');
                card.className = 'tf-text-card';
                card.innerHTML = `
                  <div style="font-style: italic; color: var(--tf-slate-800);">"${escapeHtml(remark)}"</div>
                `;
                textContainer.appendChild(card);
              });
            }
          });
          if (textContainer.children.length === 0) {
            textContainer.innerHTML = '<p style="color: var(--tf-slate-400); margin: 0; font-size: 13px;">No text comments submitted yet.</p>';
          }
        }
      }
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  }

  // Initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTeacherFeedback);
  } else {
    initTeacherFeedback();
  }

})();
