/**
 * Admin Feedback Module Controller - Student Information Portal
 * Handles Feedback Forms Dashboard, Question Management, Responses View,
 * and Analytics with Chart.js visualization.
 */

(function () {
  'use strict';

  // State
  let currentPage = 1;
  const limit = 10;
  let totalPages = 1;
  let totalCount = 0;
  let isFetching = false;
  let isSaving = false;

  let activeFormId = null;
  let activeQuestionId = null;
  let activeForm = null;

  // Chart.js instances
  let distChartInstance = null;
  let avgChartInstance = null;

  // DOM Elements
  let formsTableBody;
  let tableLoadingState;
  let tableEmptyState;
  let tableErrorState;
  let tableWrapper;
  let paginationContainer;
  let paginationInfo;
  let pageIndicator;
  let btnPrevPage;
  let btnNextPage;

  // KPI Elements
  let kpiTotalForms;
  let kpiActiveForms;
  let kpiTotalResponses;
  let kpiAvgRating;

  // Filter Elements
  let filterSearch;
  let filterTargetType;
  let filterStatus;
  let filterAcademicYear;
  let filterSemester;
  let btnResetFilters;

  // Form Modal Elements
  let formModal;
  let formModalTitle;
  let formModalAlert;
  let feedbackFormElement;
  let formTitleInput;
  let formDescInput;
  let formTargetTypeSelect;
  let formTargetIdInput;
  let formAcademicYearInput;
  let formSemesterSelect;
  let formStartDateInput;
  let formEndDateInput;
  let formIsActiveCheck;
  let btnSaveForm;
  let btnSaveFormText;

  // Delete Modal Elements
  let deleteModal;
  let deleteFormTitleText;
  let btnConfirmDelete;
  let btnConfirmDeleteText;

  // Questions Modal Elements
  let questionsModal;
  let questionsModalTitle;
  let questionsFormSubtitle;
  let questionsCountBadge;
  let btnToggleAddQuestion;
  let questionFormBox;
  let questionFormBoxTitle;
  let questionFormAlert;
  let questionTextInput;
  let questionTypeSelect;
  let questionOrderInput;
  let questionMCNotice;
  let questionRequiredCheck;
  let btnSaveQuestion;
  let btnCancelQuestionForm;
  let questionsLoadingState;
  let questionsEmptyState;
  let questionsListContainer;

  // Responses Modal Elements
  let responsesModal;
  let responsesModalTitle;
  let responsesModalSubtitle;
  let responsesLoadingState;
  let responsesEmptyState;
  let responsesListContainer;

  // Analytics Modal Elements
  let analyticsModal;
  let analyticsModalTitle;
  let analyticsModalSubtitle;
  let analyticsLoadingState;
  let analyticsEmptyState;
  let analyticsContentContainer;
  let analyticsTotalResponses;
  let analyticsOverallAvg;
  let analyticsTotalQuestions;
  let ratingDistCanvas;
  let questionAvgCanvas;
  let cssDistBars;
  let analyticsQuestionsTableBody;
  let textSummaryCard;
  let textQuestionsList;

  /**
   * Helper: Toast notifications
   */
  function showToast(message, type) {
    type = type || 'success';
    let container = document.getElementById('adminSharedToastContainer') || document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'adminSharedToastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'admin-toast admin-toast-' + type;
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.justifyContent = 'space-between';
    toast.style.gap = '12px';
    toast.style.padding = '12px 18px';
    toast.style.borderRadius = '8px';
    toast.style.marginBottom = '10px';
    toast.style.fontSize = '13.5px';
    toast.style.fontWeight = '500';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.animation = 'fadeIn 0.2s ease';

    if (type === 'error') {
      toast.style.backgroundColor = '#fee2e2';
      toast.style.color = '#991b1b';
      toast.style.border = '1px solid #fecaca';
    } else {
      toast.style.backgroundColor = '#dcfce7';
      toast.style.color = '#15803d';
      toast.style.border = '1px solid #bbf7d0';
    }

    toast.innerHTML = '<span>' + escapeHtml(message) + '</span><button type="button" style="background:none;border:none;color:inherit;cursor:pointer;font-size:18px;line-height:1;padding:0;">&times;</button>';

    const closeBtn = toast.querySelector('button');
    closeBtn.onclick = function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    };

    container.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4500);
  }

  /**
   * Helper: HTML Escaping
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
   * Helper: Format Date
   */
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return String(dateStr);
    }
  }

  /**
   * Helper: Format DateTime for HTML input
   */
  function toDatetimeLocal(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const YYYY = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const DD = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${YYYY}-${MM}-${DD}T${hh}:${mm}`;
  }

  /**
   * 1. Load & Render Forms Table
   */
  async function loadForms() {
    if (isFetching) return;
    isFetching = true;

    // Show loading
    tableLoadingState.classList.remove('hidden');
    tableEmptyState.classList.add('hidden');
    tableErrorState.classList.add('hidden');
    tableWrapper.classList.add('hidden');
    paginationContainer.classList.add('hidden');

    try {
      // Build query string
      const params = new URLSearchParams();
      params.append('page', currentPage);
      params.append('limit', limit);

      const searchVal = filterSearch.value.trim();
      if (searchVal) params.append('search', searchVal);

      const targetVal = filterTargetType.value;
      if (targetVal) params.append('target_type', targetVal);

      const statusVal = filterStatus.value;
      if (statusVal !== '') params.append('is_active', statusVal);

      const yearVal = filterAcademicYear.value.trim();
      if (yearVal) params.append('academic_year', yearVal);

      const semVal = filterSemester.value;
      if (semVal) params.append('semester', semVal);

      const res = await apiRequest(`/admin/feedback/forms?${params.toString()}`);

      if (!res.ok) {
        throw new Error(res.data?.message || 'Failed to fetch feedback forms');
      }

      const formsData = res.data?.forms || res.data?.data?.forms || [];
      const pagination = res.data?.pagination || res.data?.data?.pagination || {
        total: formsData.length,
        page: currentPage,
        limit,
        totalPages: 1
      };

      totalCount = pagination.total;
      totalPages = pagination.totalPages || 1;

      // Update Top KPIs
      updateKPIs(formsData, totalCount);

      // Render Rows
      if (formsData.length === 0) {
        tableLoadingState.classList.add('hidden');
        tableEmptyState.classList.remove('hidden');
        return;
      }

      renderFormsTable(formsData);
      updatePagination(pagination, formsData.length);

      tableLoadingState.classList.add('hidden');
      tableWrapper.classList.remove('hidden');
      paginationContainer.classList.remove('hidden');
    } catch (err) {
      console.error('Error loading feedback forms:', err);
      tableLoadingState.classList.add('hidden');
      tableErrorState.classList.remove('hidden');
      const msgEl = document.getElementById('tableErrorMessage');
      if (msgEl) msgEl.textContent = err.message || 'Failed to load forms.';
    } finally {
      isFetching = false;
    }
  }

  /**
   * Update KPI Cards
   */
  function updateKPIs(forms, total) {
    if (kpiTotalForms) kpiTotalForms.textContent = total;

    // Active count in current view / calculated from available data
    const activeCount = forms.filter(f => f.is_active).length;
    if (kpiActiveForms) kpiActiveForms.textContent = activeCount;

    // Total responses sum from loaded forms
    const totalResp = forms.reduce((acc, f) => acc + (parseInt(f.response_count, 10) || 0), 0);
    if (kpiTotalResponses) kpiTotalResponses.textContent = totalResp;

    if (kpiAvgRating) kpiAvgRating.textContent = '—';
  }

  /**
   * Render Forms Table HTML
   */
  function renderFormsTable(forms) {
    formsTableBody.innerHTML = '';

    forms.forEach((form) => {
      const tr = document.createElement('tr');
      tr.id = `form-row-${form.feedback_form_id}`;

      // Target Badge class
      const targetType = (form.target_type || 'GENERAL').toUpperCase();
      let targetBadgeClass = 'target-badge-general';
      if (targetType === 'COURSE') targetBadgeClass = 'target-badge-course';
      else if (targetType === 'TEACHER') targetBadgeClass = 'target-badge-teacher';
      else if (targetType === 'EVENT') targetBadgeClass = 'target-badge-event';

      // Status Pill
      const isActive = Boolean(form.is_active);
      const statusPillHtml = isActive
        ? '<span class="status-pill status-pill-active"><span class="status-pill-dot"></span>ACTIVE</span>'
        : '<span class="status-pill status-pill-inactive"><span class="status-pill-dot"></span>INACTIVE</span>';

      // Target details / label
      let targetLabel = form.target_label || targetType;
      if (form.target_id && !form.target_label) {
        targetLabel += ` (ID: ${form.target_id})`;
      }

      // Academic Scope
      let scopeStr = 'General';
      if (form.academic_year && form.semester) {
        scopeStr = `${form.academic_year} • Sem ${form.semester}`;
      } else if (form.academic_year) {
        scopeStr = form.academic_year;
      } else if (form.semester) {
        scopeStr = `Semester ${form.semester}`;
      }

      tr.innerHTML = `
        <td>
          <div class="form-title-cell">
            <span class="form-table-title">${escapeHtml(form.title)}</span>
            <span class="form-table-desc">${escapeHtml(form.description || 'No description provided')}</span>
          </div>
        </td>
        <td>
          <span class="target-badge ${targetBadgeClass}">${escapeHtml(targetType)}</span>
          <div style="font-size: 11.5px; color: var(--admin-muted, #665e75); margin-top: 4px;">
            ${escapeHtml(targetLabel)}
          </div>
        </td>
        <td>
          <div style="font-size: 13px; font-weight: 500;">${escapeHtml(scopeStr)}</div>
        </td>
        <td>
          <div style="font-size: 12px; color: var(--admin-text, #191426);">
            <div><strong>Start:</strong> ${formatDate(form.start_date)}</div>
            <div><strong>End:</strong> ${formatDate(form.end_date)}</div>
          </div>
        </td>
        <td>${statusPillHtml}</td>
        <td style="text-align: center; font-weight: 700; color: var(--admin-primary, #7c3aed);">
          ${form.question_count !== undefined ? form.question_count : 0}
        </td>
        <td style="text-align: center; font-weight: 700; color: var(--admin-secondary, #c026d3);">
          ${form.response_count !== undefined ? form.response_count : 0}
        </td>
        <td style="text-align: right;">
          <div class="table-actions" style="justify-content: flex-end;">
            <button type="button" class="btn-action-badge action-questions" data-id="${form.feedback_form_id}" title="Manage Questions">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              <span>Questions</span>
            </button>
            <button type="button" class="btn-action-badge action-responses" data-id="${form.feedback_form_id}" title="View Responses">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
              <span>Responses</span>
            </button>
            <button type="button" class="btn-action-badge action-analytics" data-id="${form.feedback_form_id}" title="View Analytics">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
              <span>Analytics</span>
            </button>
            <button type="button" class="btn-icon-action action-edit" data-id="${form.feedback_form_id}" title="Edit Form">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button type="button" class="btn-icon-action action-delete" data-id="${form.feedback_form_id}" data-title="${escapeHtml(form.title)}" title="Delete Form">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      `;

      formsTableBody.appendChild(tr);
    });

    // Attach Row Action Listeners
    formsTableBody.querySelectorAll('.action-questions').forEach((btn) => {
      btn.onclick = () => openQuestionsModal(btn.getAttribute('data-id'));
    });
    formsTableBody.querySelectorAll('.action-responses').forEach((btn) => {
      btn.onclick = () => openResponsesModal(btn.getAttribute('data-id'));
    });
    formsTableBody.querySelectorAll('.action-analytics').forEach((btn) => {
      btn.onclick = () => openAnalyticsModal(btn.getAttribute('data-id'));
    });
    formsTableBody.querySelectorAll('.action-edit').forEach((btn) => {
      btn.onclick = () => openEditFormModal(btn.getAttribute('data-id'));
    });
    formsTableBody.querySelectorAll('.action-delete').forEach((btn) => {
      btn.onclick = () => openDeleteFormModal(btn.getAttribute('data-id'), btn.getAttribute('data-title'));
    });
  }

  /**
   * Update Pagination Bar
   */
  function updatePagination(pagination, currentCount) {
    const start = totalCount === 0 ? 0 : (currentPage - 1) * limit + 1;
    const end = Math.min(start + currentCount - 1, totalCount);

    if (paginationInfo) {
      paginationInfo.textContent = `Showing ${start} to ${end} of ${totalCount} forms`;
    }
    if (pageIndicator) {
      pageIndicator.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    }

    if (btnPrevPage) btnPrevPage.disabled = currentPage <= 1;
    if (btnNextPage) btnNextPage.disabled = currentPage >= totalPages;
  }

  /**
   * 2. Form Creation & Editing
   */
  function openCreateFormModal() {
    activeFormId = null;
    activeForm = null;

    formModalTitle.textContent = 'Create Feedback Form';
    btnSaveFormText.textContent = 'Save Feedback Form';
    formModalAlert.classList.add('hidden');
    feedbackFormElement.reset();

    // Default dates: start = now, end = now + 7 days
    const now = new Date();
    const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    formStartDateInput.value = toDatetimeLocal(now);
    formEndDateInput.value = toDatetimeLocal(future);
    formIsActiveCheck.checked = true;
    formTargetTypeSelect.value = 'GENERAL';

    formModal.classList.remove('hidden');
  }

  async function openEditFormModal(formId) {
    activeFormId = formId;
    formModalTitle.textContent = 'Edit Feedback Form';
    btnSaveFormText.textContent = 'Update Feedback Form';
    formModalAlert.classList.add('hidden');
    feedbackFormElement.reset();

    try {
      const res = await apiRequest(`/admin/feedback/forms/${formId}`);
      if (!res.ok) throw new Error(res.data?.message || 'Failed to fetch form details');

      const form = res.data?.form || res.data?.data || res.data;
      activeForm = form;

      formTitleInput.value = form.title || '';
      formDescInput.value = form.description || '';
      formTargetTypeSelect.value = form.target_type || 'GENERAL';
      formTargetIdInput.value = form.target_id || '';
      formAcademicYearInput.value = form.academic_year || '';
      formSemesterSelect.value = form.semester || '';
      formStartDateInput.value = toDatetimeLocal(form.start_date);
      formEndDateInput.value = toDatetimeLocal(form.end_date);
      formIsActiveCheck.checked = Boolean(form.is_active);

      formModal.classList.remove('hidden');
    } catch (err) {
      console.error('Error opening edit form modal:', err);
      showToast(err.message || 'Failed to open edit modal', 'error');
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    if (isSaving) return;

    formModalAlert.classList.add('hidden');

    const title = formTitleInput.value.trim();
    const description = formDescInput.value.trim() || null;
    const target_type = formTargetTypeSelect.value;
    const target_id = formTargetIdInput.value ? parseInt(formTargetIdInput.value, 10) : null;
    const academic_year = formAcademicYearInput.value.trim() || null;
    const semester = formSemesterSelect.value ? parseInt(formSemesterSelect.value, 10) : null;
    const start_date = formStartDateInput.value;
    const end_date = formEndDateInput.value;
    const is_active = formIsActiveCheck.checked;

    // Client-side Validation
    if (!title) {
      showFormAlert('Form title is required');
      return;
    }

    if (!start_date || !end_date) {
      showFormAlert('Both Start Date and End Date are required');
      return;
    }

    const startObj = new Date(start_date);
    const endObj = new Date(end_date);
    if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) {
      showFormAlert('Invalid date/time format');
      return;
    }

    if (startObj >= endObj) {
      showFormAlert('Start Date must be strictly earlier than End Date');
      return;
    }

    isSaving = true;
    btnSaveForm.disabled = true;
    btnSaveFormText.textContent = 'Saving...';

    const payload = {
      title,
      description,
      target_type,
      target_id,
      academic_year,
      semester,
      start_date: startObj.toISOString(),
      end_date: endObj.toISOString(),
      is_active
    };

    try {
      let res;
      if (activeFormId) {
        res = await apiRequest(`/admin/feedback/forms/${activeFormId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiRequest('/admin/feedback/forms', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        throw new Error(res.data?.message || 'Failed to save feedback form');
      }

      formModal.classList.add('hidden');
      showToast(activeFormId ? 'Feedback form updated successfully!' : 'Feedback form created successfully!');
      loadForms();
    } catch (err) {
      console.error('Error saving form:', err);
      showFormAlert(err.message || 'Failed to save form');
    } finally {
      isSaving = false;
      btnSaveForm.disabled = false;
      btnSaveFormText.textContent = activeFormId ? 'Update Feedback Form' : 'Save Feedback Form';
    }
  }

  function showFormAlert(msg) {
    if (formModalAlert) {
      formModalAlert.querySelector('span').textContent = msg;
      formModalAlert.classList.remove('hidden');
    }
  }

  /**
   * 3. Form Deletion
   */
  function openDeleteFormModal(formId, formTitle) {
    activeFormId = formId;
    deleteFormTitleText.textContent = `Are you sure you want to delete "${formTitle}"?`;
    deleteModal.classList.remove('hidden');
  }

  async function handleConfirmDelete() {
    if (!activeFormId || isSaving) return;
    isSaving = true;
    btnConfirmDelete.disabled = true;
    btnConfirmDeleteText.textContent = 'Deleting...';

    try {
      const res = await apiRequest(`/admin/feedback/forms/${activeFormId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error(res.data?.message || 'Failed to delete feedback form');

      deleteModal.classList.add('hidden');
      showToast('Feedback form and associated records deleted successfully!');
      loadForms();
    } catch (err) {
      console.error('Error deleting form:', err);
      showToast(err.message || 'Failed to delete form', 'error');
    } finally {
      isSaving = false;
      btnConfirmDelete.disabled = false;
      btnConfirmDeleteText.textContent = 'Yes, Delete Form';
    }
  }

  /**
   * 4. Question Management
   */
  async function openQuestionsModal(formId) {
    activeFormId = formId;
    activeQuestionId = null;
    questionFormBox.classList.add('hidden');
    questionFormAlert.classList.add('hidden');

    questionsModal.classList.remove('hidden');
    await loadQuestions(formId);
  }

  async function loadQuestions(formId) {
    questionsLoadingState.classList.remove('hidden');
    questionsEmptyState.classList.add('hidden');
    questionsListContainer.innerHTML = '';

    try {
      const res = await apiRequest(`/admin/feedback/forms/${formId}`);
      if (!res.ok) throw new Error(res.data?.message || 'Failed to load questions');

      const form = res.data?.form || res.data?.data || res.data;
      activeForm = form;

      questionsFormSubtitle.textContent = `Form: ${form.title}`;
      const questions = form.questions || [];
      questionsCountBadge.textContent = `${questions.length} Question${questions.length === 1 ? '' : 's'}`;

      if (questions.length === 0) {
        questionsLoadingState.classList.add('hidden');
        questionsEmptyState.classList.remove('hidden');
        return;
      }

      renderQuestionsList(questions);
      questionsLoadingState.classList.add('hidden');
    } catch (err) {
      console.error('Error loading questions:', err);
      questionsLoadingState.classList.add('hidden');
      showToast(err.message || 'Failed to load questions', 'error');
    }
  }

  function renderQuestionsList(questions) {
    questionsListContainer.innerHTML = '';

    questions.forEach((q, idx) => {
      const card = document.createElement('div');
      card.className = 'question-card-item';
      card.id = `question-item-${q.question_id}`;

      let typePillClass = 'type-pill-text';
      if (q.question_type === 'RATING') typePillClass = 'type-pill-rating';
      else if (q.question_type === 'MULTIPLE_CHOICE') typePillClass = 'type-pill-mc';

      const isReq = Boolean(q.is_required);

      card.innerHTML = `
        <div class="question-card-left">
          <div class="question-order-pill">${q.display_order !== undefined ? q.display_order : idx + 1}</div>
          <div class="question-details">
            <div class="question-text-title">${escapeHtml(q.question_text)}</div>
            <div class="question-meta-tags">
              <span class="type-pill ${typePillClass}">${escapeHtml(q.question_type)}</span>
              <span class="req-tag ${isReq ? 'is-required' : ''}">${isReq ? 'Required' : 'Optional'}</span>
            </div>
          </div>
        </div>
        <div class="question-actions">
          <button type="button" class="btn-icon-action btn-edit-question" data-id="${q.question_id}" title="Edit Question">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button type="button" class="btn-icon-action action-delete btn-delete-question" data-id="${q.question_id}" title="Delete Question">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;

      questionsListContainer.appendChild(card);
    });

    // Attach listeners
    questionsListContainer.querySelectorAll('.btn-edit-question').forEach((btn) => {
      btn.onclick = () => {
        const qId = parseInt(btn.getAttribute('data-id'), 10);
        const q = (activeForm?.questions || []).find((item) => item.question_id === qId);
        if (q) openEditQuestionForm(q);
      };
    });

    questionsListContainer.querySelectorAll('.btn-delete-question').forEach((btn) => {
      btn.onclick = () => {
        const qId = parseInt(btn.getAttribute('data-id'), 10);
        deleteQuestion(qId);
      };
    });
  }

  function toggleAddQuestionBox() {
    activeQuestionId = null;
    questionFormBoxTitle.textContent = 'Add New Question';
    questionTextInput.value = '';
    questionTypeSelect.value = 'RATING';
    questionOrderInput.value = (activeForm?.questions?.length || 0) + 1;
    questionRequiredCheck.checked = true;
    questionMCNotice.classList.add('hidden');
    questionFormAlert.classList.add('hidden');

    questionFormBox.classList.toggle('hidden');
  }

  function openEditQuestionForm(q) {
    activeQuestionId = q.question_id;
    questionFormBoxTitle.textContent = 'Edit Question';
    questionTextInput.value = q.question_text || '';
    questionTypeSelect.value = q.question_type || 'RATING';
    questionOrderInput.value = q.display_order !== undefined ? q.display_order : 0;
    questionRequiredCheck.checked = Boolean(q.is_required);

    if (q.question_type === 'MULTIPLE_CHOICE') {
      questionMCNotice.classList.remove('hidden');
    } else {
      questionMCNotice.classList.add('hidden');
    }

    questionFormAlert.classList.add('hidden');
    questionFormBox.classList.remove('hidden');
  }

  async function handleSaveQuestion() {
    if (isSaving) return;

    questionFormAlert.classList.add('hidden');
    const text = questionTextInput.value.trim();
    const type = questionTypeSelect.value;
    const order = parseInt(questionOrderInput.value, 10) || 0;
    const isRequired = questionRequiredCheck.checked;

    if (!text) {
      questionFormAlert.querySelector('span').textContent = 'Question text is required';
      questionFormAlert.classList.remove('hidden');
      return;
    }

    isSaving = true;
    btnSaveQuestion.disabled = true;
    btnSaveQuestion.textContent = 'Saving...';

    const payload = {
      question_text: text,
      question_type: type,
      display_order: order,
      is_required: isRequired
    };

    try {
      let res;
      if (activeQuestionId) {
        res = await apiRequest(`/admin/feedback/questions/${activeQuestionId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiRequest(`/admin/feedback/forms/${activeFormId}/questions`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) throw new Error(res.data?.message || 'Failed to save question');

      questionFormBox.classList.add('hidden');
      showToast(activeQuestionId ? 'Question updated successfully!' : 'Question added successfully!');
      await loadQuestions(activeFormId);
      loadForms(); // Refresh question count on main dashboard
    } catch (err) {
      console.error('Error saving question:', err);
      questionFormAlert.querySelector('span').textContent = err.message || 'Failed to save question';
      questionFormAlert.classList.remove('hidden');
    } finally {
      isSaving = false;
      btnSaveQuestion.disabled = false;
      btnSaveQuestion.textContent = 'Save Question';
    }
  }

  async function deleteQuestion(questionId) {
    if (!confirm('Are you sure you want to delete this question? Existing student answers for this question will also be removed.')) {
      return;
    }

    try {
      const res = await apiRequest(`/admin/feedback/questions/${questionId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error(res.data?.message || 'Failed to delete question');

      showToast('Question deleted successfully!');
      await loadQuestions(activeFormId);
      loadForms();
    } catch (err) {
      console.error('Error deleting question:', err);
      showToast(err.message || 'Failed to delete question', 'error');
    }
  }

  /**
   * 5. Responses View
   */
  async function openResponsesModal(formId) {
    activeFormId = formId;
    responsesModal.classList.remove('hidden');
    responsesLoadingState.classList.remove('hidden');
    responsesEmptyState.classList.add('hidden');
    responsesListContainer.innerHTML = '';

    try {
      const res = await apiRequest(`/admin/feedback/forms/${formId}/responses?limit=100`);
      if (!res.ok) throw new Error(res.data?.message || 'Failed to fetch responses');

      const data = res.data?.responses ? res.data : res.data?.data || {};
      const responses = data.responses || [];

      responsesModalSubtitle.textContent = `Total Submissions: ${responses.length}`;

      if (responses.length === 0) {
        responsesLoadingState.classList.add('hidden');
        responsesEmptyState.classList.remove('hidden');
        return;
      }

      renderResponsesList(responses);
      responsesLoadingState.classList.add('hidden');
    } catch (err) {
      console.error('Error viewing responses:', err);
      responsesLoadingState.classList.add('hidden');
      showToast(err.message || 'Failed to load responses', 'error');
    }
  }

  function renderResponsesList(responses) {
    responsesListContainer.innerHTML = '';

    responses.forEach((resp) => {
      const card = document.createElement('div');
      card.className = 'response-card';

      const submittedDateStr = resp.submitted_at ? new Date(resp.submitted_at).toLocaleString() : '—';
      const answers = resp.answers || [];

      let answersHtml = '';
      answers.forEach((ans) => {
        let valHtml = '';
        if (ans.question_type === 'RATING') {
          const ratingVal = Math.round(ans.rating || 0);
          const stars = '★'.repeat(ratingVal) + '☆'.repeat(Math.max(0, 5 - ratingVal));
          valHtml = `
            <div class="answer-value-row">
              <span class="rating-stars-visual">${stars}</span>
              <span class="rating-score-pill">${ans.rating !== null ? ans.rating : '—'} / 5</span>
            </div>
          `;
        } else {
          valHtml = `<div class="text-answer-content">"${escapeHtml(ans.answer_text || 'No remarks provided')}"</div>`;
        }

        answersHtml += `
          <div class="answer-item">
            <div class="answer-question-text">${escapeHtml(ans.question_text)}</div>
            ${valHtml}
          </div>
        `;
      });

      card.innerHTML = `
        <div class="response-header">
          <div>
            <div class="response-student-name">${escapeHtml(resp.student_name || 'Student')}</div>
            <div class="response-metadata-pills" style="margin-top: 4px;">
              <span class="response-meta-tag">PRN: ${escapeHtml(resp.prn_number || '—')}</span>
              <span class="response-meta-tag">Dept: ${escapeHtml(resp.department_name || '—')}</span>
              <span class="response-meta-tag">${resp.semester ? 'Sem ' + resp.semester : ''} ${resp.class_name ? resp.class_name : ''} ${resp.division ? '(' + resp.division + ')' : ''}</span>
            </div>
          </div>
          <div style="font-size: 12px; color: var(--admin-muted, #665e75); text-align: right;">
            ${submittedDateStr}
          </div>
        </div>
        <div class="answers-grid">
          ${answersHtml || '<div style="color: var(--admin-muted, #665e75); font-size: 13px;">No answers recorded.</div>'}
        </div>
      `;

      responsesListContainer.appendChild(card);
    });
  }

  /**
   * 6. Analytics View & Charts
   */
  async function openAnalyticsModal(formId) {
    activeFormId = formId;
    analyticsModal.classList.remove('hidden');
    analyticsLoadingState.classList.remove('hidden');
    analyticsEmptyState.classList.add('hidden');
    analyticsContentContainer.classList.add('hidden');

    try {
      const res = await apiRequest(`/admin/feedback/forms/${formId}/analytics`);
      if (!res.ok) throw new Error(res.data?.message || 'Failed to fetch form analytics');

      const analytics = res.data?.form_id ? res.data : res.data?.data || {};

      analyticsModalTitle.textContent = `Feedback Analytics: ${analytics.title || 'Form'}`;
      analyticsModalSubtitle.textContent = `Target: ${analytics.target_type || 'GENERAL'}${analytics.target_label ? ' (' + analytics.target_label + ')' : ''}`;

      analyticsLoadingState.classList.add('hidden');

      if (!analytics || analytics.total_responses === 0) {
        analyticsEmptyState.classList.remove('hidden');
        return;
      }

      // Populate Summary KPIs
      analyticsContentContainer.classList.remove('hidden');
      analyticsTotalResponses.textContent = analytics.total_responses;
      analyticsOverallAvg.textContent = analytics.overall_average_rating !== null
        ? `${analytics.overall_average_rating} / 5.0`
        : 'N/A';
      analyticsTotalQuestions.textContent = analytics.total_questions || 0;

      // Render Charts & Breakdowns
      renderAnalyticsCharts(analytics);
      renderAnalyticsBreakdownTable(analytics);
    } catch (err) {
      console.error('Error opening analytics:', err);
      analyticsLoadingState.classList.add('hidden');
      showToast(err.message || 'Failed to calculate analytics', 'error');
    }
  }

  function renderAnalyticsCharts(analytics) {
    const ratingMetrics = analytics.rating_analytics || [];

    // Aggregate distribution across all rating questions
    const aggDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRatingsCount = 0;

    ratingMetrics.forEach((m) => {
      const d = m.distribution || {};
      for (let star = 1; star <= 5; star++) {
        const c = parseInt(d[star] || 0, 10);
        aggDist[star] += c;
        totalRatingsCount += c;
      }
    });

    // 1. Chart.js Rating Distribution
    if (typeof Chart !== 'undefined' && ratingDistCanvas) {
      if (distChartInstance) distChartInstance.destroy();

      const ctx = ratingDistCanvas.getContext('2d');
      distChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['1 Star', '2 Stars', '3 Stars', '4 Stars', '5 Stars'],
          datasets: [{
            label: 'Responses',
            data: [aggDist[1], aggDist[2], aggDist[3], aggDist[4], aggDist[5]],
            backgroundColor: [
              '#e11d48', // 1 Star (Rose)
              '#ea580c', // 2 Stars (Orange)
              '#f59e0b', // 3 Stars (Amber)
              '#c026d3', // 4 Stars (Plum)
              '#7c3aed'  // 5 Stars (Deep Purple)
            ],
            borderRadius: 6,
            maxBarThickness: 36
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Ratings: ${ctx.parsed.y}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1 }
            }
          }
        }
      });
    }

    // 2. CSS Visual Distribution Progress Bars
    if (cssDistBars) {
      cssDistBars.innerHTML = '';
      for (let star = 5; star >= 1; star--) {
        const count = aggDist[star];
        const pct = totalRatingsCount > 0 ? Math.round((count / totalRatingsCount) * 100) : 0;
        const row = document.createElement('div');
        row.className = 'css-dist-row';
        row.innerHTML = `
          <div class="css-dist-star">${star} ★</div>
          <div class="css-dist-bar-track">
            <div class="css-dist-bar-fill" style="width: ${pct}%;"></div>
          </div>
          <div class="css-dist-pct">${pct}% (${count})</div>
        `;
        cssDistBars.appendChild(row);
      }
    }

    // 3. Chart.js Average Rating per Question
    if (typeof Chart !== 'undefined' && questionAvgCanvas) {
      if (avgChartInstance) avgChartInstance.destroy();

      const labels = ratingMetrics.map((m, i) => `Q${i + 1}: ${m.question_text.length > 25 ? m.question_text.slice(0, 25) + '...' : m.question_text}`);
      const scores = ratingMetrics.map((m) => m.average_rating || 0);

      const ctx2 = questionAvgCanvas.getContext('2d');
      avgChartInstance = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Average Score',
            data: scores,
            backgroundColor: '#8b5cf6',
            borderRadius: 6,
            maxBarThickness: 32
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Score: ${ctx.parsed.y} / 5.0`
              }
            }
          },
          scales: {
            y: {
              min: 0,
              max: 5,
              ticks: { stepSize: 1 }
            }
          }
        }
      });
    }
  }

  function renderAnalyticsBreakdownTable(analytics) {
    if (!analyticsQuestionsTableBody) return;
    analyticsQuestionsTableBody.innerHTML = '';

    const ratingMetrics = analytics.rating_analytics || [];

    if (ratingMetrics.length === 0) {
      analyticsQuestionsTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 18px; color: var(--admin-muted, #665e75);">No rating questions in this form.</td></tr>';
      return;
    }

    ratingMetrics.forEach((m) => {
      const tr = document.createElement('tr');
      const d = m.distribution || {};
      const breakdownPills = `
        <div style="display: flex; gap: 4px; font-size: 11px;">
          <span style="background:#fee2e2; color:#991b1b; padding:1px 5px; border-radius:3px;">1★: ${d[1] || 0}</span>
          <span style="background:#ffedd5; color:#9a3412; padding:1px 5px; border-radius:3px;">2★: ${d[2] || 0}</span>
          <span style="background:#fef3c7; color:#92400e; padding:1px 5px; border-radius:3px;">3★: ${d[3] || 0}</span>
          <span style="background:#fdf4ff; color:#86198f; padding:1px 5px; border-radius:3px;">4★: ${d[4] || 0}</span>
          <span style="background:#f5f3ff; color:#5b21b6; padding:1px 5px; border-radius:3px;">5★: ${d[5] || 0}</span>
        </div>
      `;

      tr.innerHTML = `
        <td><span style="font-weight: 600;">${escapeHtml(m.question_text)}</span></td>
        <td style="text-align: center; font-weight: 600;">${m.total_ratings || 0}</td>
        <td style="text-align: center;">
          <span class="rating-score-pill" style="font-size: 12.5px;">${m.average_rating !== null ? m.average_rating.toFixed(2) : '—'} / 5.0</span>
        </td>
        <td>${breakdownPills}</td>
      `;
      analyticsQuestionsTableBody.appendChild(tr);
    });

    // Text Questions Summary
    const textMetrics = analytics.text_analytics || [];
    if (textMetrics.length > 0 && textSummaryCard && textQuestionsList) {
      textSummaryCard.classList.remove('hidden');
      textQuestionsList.innerHTML = '';
      textMetrics.forEach((t) => {
        const item = document.createElement('div');
        item.style.padding = '8px 0';
        item.style.borderBottom = '1px solid #f2eff7';
        item.innerHTML = `
          <div style="font-weight: 600; font-size: 13px; color: var(--admin-text, #191426);">${escapeHtml(t.question_text)}</div>
          <div style="font-size: 12px; color: var(--admin-muted, #665e75); margin-top: 2px;">Total Text Responses Received: <strong>${t.total_text_answers || 0}</strong></div>
        `;
        textQuestionsList.appendChild(item);
      });
    } else if (textSummaryCard) {
      textSummaryCard.classList.add('hidden');
    }
  }

  /**
   * 7. Initialize DOM Elements & Event Handlers
   */
  function initElements() {
    formsTableBody = document.getElementById('formsTableBody');
    tableLoadingState = document.getElementById('tableLoadingState');
    tableEmptyState = document.getElementById('tableEmptyState');
    tableErrorState = document.getElementById('tableErrorState');
    tableWrapper = document.getElementById('tableWrapper');
    paginationContainer = document.getElementById('paginationContainer');
    paginationInfo = document.getElementById('paginationInfo');
    pageIndicator = document.getElementById('pageIndicator');
    btnPrevPage = document.getElementById('btnPrevPage');
    btnNextPage = document.getElementById('btnNextPage');

    kpiTotalForms = document.getElementById('kpiTotalForms');
    kpiActiveForms = document.getElementById('kpiActiveForms');
    kpiTotalResponses = document.getElementById('kpiTotalResponses');
    kpiAvgRating = document.getElementById('kpiAvgRating');

    filterSearch = document.getElementById('filterSearch');
    filterTargetType = document.getElementById('filterTargetType');
    filterStatus = document.getElementById('filterStatus');
    filterAcademicYear = document.getElementById('filterAcademicYear');
    filterSemester = document.getElementById('filterSemester');
    btnResetFilters = document.getElementById('btnResetFilters');

    formModal = document.getElementById('formModal');
    formModalTitle = document.getElementById('formModalTitle');
    formModalAlert = document.getElementById('formModalAlert');
    feedbackFormElement = document.getElementById('feedbackFormElement');
    formTitleInput = document.getElementById('formTitleInput');
    formDescInput = document.getElementById('formDescInput');
    formTargetTypeSelect = document.getElementById('formTargetTypeSelect');
    formTargetIdInput = document.getElementById('formTargetIdInput');
    formAcademicYearInput = document.getElementById('formAcademicYearInput');
    formSemesterSelect = document.getElementById('formSemesterSelect');
    formStartDateInput = document.getElementById('formStartDateInput');
    formEndDateInput = document.getElementById('formEndDateInput');
    formIsActiveCheck = document.getElementById('formIsActiveCheck');
    btnSaveForm = document.getElementById('btnSaveForm');
    btnSaveFormText = document.getElementById('btnSaveFormText');

    deleteModal = document.getElementById('deleteModal');
    deleteFormTitleText = document.getElementById('deleteFormTitleText');
    btnConfirmDelete = document.getElementById('btnConfirmDelete');
    btnConfirmDeleteText = document.getElementById('btnConfirmDeleteText');

    questionsModal = document.getElementById('questionsModal');
    questionsModalTitle = document.getElementById('questionsModalTitle');
    questionsFormSubtitle = document.getElementById('questionsFormSubtitle');
    questionsCountBadge = document.getElementById('questionsCountBadge');
    btnToggleAddQuestion = document.getElementById('btnToggleAddQuestion');
    questionFormBox = document.getElementById('questionFormBox');
    questionFormBoxTitle = document.getElementById('questionFormBoxTitle');
    questionFormAlert = document.getElementById('questionFormAlert');
    questionTextInput = document.getElementById('questionTextInput');
    questionTypeSelect = document.getElementById('questionTypeSelect');
    questionOrderInput = document.getElementById('questionOrderInput');
    questionMCNotice = document.getElementById('questionMCNotice');
    questionRequiredCheck = document.getElementById('questionRequiredCheck');
    btnSaveQuestion = document.getElementById('btnSaveQuestion');
    btnCancelQuestionForm = document.getElementById('btnCancelQuestionForm');
    questionsLoadingState = document.getElementById('questionsLoadingState');
    questionsEmptyState = document.getElementById('questionsEmptyState');
    questionsListContainer = document.getElementById('questionsListContainer');

    responsesModal = document.getElementById('responsesModal');
    responsesModalTitle = document.getElementById('responsesModalTitle');
    responsesModalSubtitle = document.getElementById('responsesModalSubtitle');
    responsesLoadingState = document.getElementById('responsesLoadingState');
    responsesEmptyState = document.getElementById('responsesEmptyState');
    responsesListContainer = document.getElementById('responsesListContainer');

    analyticsModal = document.getElementById('analyticsModal');
    analyticsModalTitle = document.getElementById('analyticsModalTitle');
    analyticsModalSubtitle = document.getElementById('analyticsModalSubtitle');
    analyticsLoadingState = document.getElementById('analyticsLoadingState');
    analyticsEmptyState = document.getElementById('analyticsEmptyState');
    analyticsContentContainer = document.getElementById('analyticsContentContainer');
    analyticsTotalResponses = document.getElementById('analyticsTotalResponses');
    analyticsOverallAvg = document.getElementById('analyticsOverallAvg');
    analyticsTotalQuestions = document.getElementById('analyticsTotalQuestions');
    ratingDistCanvas = document.getElementById('ratingDistCanvas');
    questionAvgCanvas = document.getElementById('questionAvgCanvas');
    cssDistBars = document.getElementById('cssDistBars');
    analyticsQuestionsTableBody = document.getElementById('analyticsQuestionsTableBody');
    textSummaryCard = document.getElementById('textSummaryCard');
    textQuestionsList = document.getElementById('textQuestionsList');

    // Create Button
    const btnOpenCreate = document.getElementById('btnOpenCreateModal');
    if (btnOpenCreate) btnOpenCreate.onclick = openCreateFormModal;
    const btnEmptyCreate = document.getElementById('btnEmptyCreate');
    if (btnEmptyCreate) btnEmptyCreate.onclick = openCreateFormModal;

    // Retry Button
    const btnRetry = document.getElementById('btnRetryLoad');
    if (btnRetry) btnRetry.onclick = loadForms;

    // Form Modal Submissions
    if (feedbackFormElement) feedbackFormElement.onsubmit = handleFormSubmit;
    const btnCancelForm = document.getElementById('btnCancelForm');
    if (btnCancelForm) btnCancelForm.onclick = () => formModal.classList.add('hidden');
    const btnCloseFormModal = document.getElementById('btnCloseFormModal');
    if (btnCloseFormModal) btnCloseFormModal.onclick = () => formModal.classList.add('hidden');

    // Delete Modal
    if (btnConfirmDelete) btnConfirmDelete.onclick = handleConfirmDelete;
    const btnCancelDelete = document.getElementById('btnCancelDelete');
    if (btnCancelDelete) btnCancelDelete.onclick = () => deleteModal.classList.add('hidden');
    const btnCloseDeleteModal = document.getElementById('btnCloseDeleteModal');
    if (btnCloseDeleteModal) btnCloseDeleteModal.onclick = () => deleteModal.classList.add('hidden');

    // Question Management Buttons
    if (btnToggleAddQuestion) btnToggleAddQuestion.onclick = toggleAddQuestionBox;
    const btnQuestionsEmptyAdd = document.getElementById('btnQuestionsEmptyAdd');
    if (btnQuestionsEmptyAdd) btnQuestionsEmptyAdd.onclick = toggleAddQuestionBox;
    if (btnSaveQuestion) btnSaveQuestion.onclick = handleSaveQuestion;
    if (btnCancelQuestionForm) btnCancelQuestionForm.onclick = () => questionFormBox.classList.add('hidden');
    const btnCloseQuestionsModal = document.getElementById('btnCloseQuestionsModal');
    if (btnCloseQuestionsModal) btnCloseQuestionsModal.onclick = () => questionsModal.classList.add('hidden');
    const btnCloseQuestionsFooter = document.getElementById('btnCloseQuestionsFooter');
    if (btnCloseQuestionsFooter) btnCloseQuestionsFooter.onclick = () => questionsModal.classList.add('hidden');

    if (questionTypeSelect) {
      questionTypeSelect.onchange = function () {
        if (this.value === 'MULTIPLE_CHOICE') {
          questionMCNotice.classList.remove('hidden');
        } else {
          questionMCNotice.classList.add('hidden');
        }
      };
    }

    // Responses Modal Close
    const btnCloseResponsesModal = document.getElementById('btnCloseResponsesModal');
    if (btnCloseResponsesModal) btnCloseResponsesModal.onclick = () => responsesModal.classList.add('hidden');
    const btnCloseResponsesFooter = document.getElementById('btnCloseResponsesFooter');
    if (btnCloseResponsesFooter) btnCloseResponsesFooter.onclick = () => responsesModal.classList.add('hidden');

    // Analytics Modal Close
    const btnCloseAnalyticsModal = document.getElementById('btnCloseAnalyticsModal');
    if (btnCloseAnalyticsModal) btnCloseAnalyticsModal.onclick = () => analyticsModal.classList.add('hidden');
    const btnCloseAnalyticsFooter = document.getElementById('btnCloseAnalyticsFooter');
    if (btnCloseAnalyticsFooter) btnCloseAnalyticsFooter.onclick = () => analyticsModal.classList.add('hidden');

    // Filter Listeners
    let searchDebounceTimer;
    if (filterSearch) {
      filterSearch.oninput = () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          currentPage = 1;
          loadForms();
        }, 350);
      };
    }

    if (filterTargetType) {
      filterTargetType.onchange = () => {
        currentPage = 1;
        loadForms();
      };
    }

    if (filterStatus) {
      filterStatus.onchange = () => {
        currentPage = 1;
        loadForms();
      };
    }

    if (filterAcademicYear) {
      filterAcademicYear.oninput = () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          currentPage = 1;
          loadForms();
        }, 350);
      };
    }

    if (filterSemester) {
      filterSemester.onchange = () => {
        currentPage = 1;
        loadForms();
      };
    }

    if (btnResetFilters) {
      btnResetFilters.onclick = () => {
        filterSearch.value = '';
        filterTargetType.value = '';
        filterStatus.value = '';
        filterAcademicYear.value = '';
        filterSemester.value = '';
        currentPage = 1;
        loadForms();
      };
    }

    // Pagination Listeners
    if (btnPrevPage) {
      btnPrevPage.onclick = () => {
        if (currentPage > 1) {
          currentPage--;
          loadForms();
        }
      };
    }

    if (btnNextPage) {
      btnNextPage.onclick = () => {
        if (currentPage < totalPages) {
          currentPage++;
          loadForms();
        }
      };
    }

    // Outside Click & Escape Key to close modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        [formModal, deleteModal, questionsModal, responsesModal, analyticsModal].forEach((m) => {
          if (m && !m.classList.contains('hidden')) m.classList.add('hidden');
        });
      }
    });

    [formModal, deleteModal, questionsModal, responsesModal, analyticsModal].forEach((modal) => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            modal.classList.add('hidden');
          }
        });
      }
    });
  }

  /**
   * 8. Bootstrap
   */
  function init() {
    initElements();
    loadForms();
  }

  // Expose methods for automated tests and modular integration
  window.adminFeedback = {
    loadForms,
    openCreateFormModal,
    openEditFormModal,
    openQuestionsModal,
    openResponsesModal,
    openAnalyticsModal
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
