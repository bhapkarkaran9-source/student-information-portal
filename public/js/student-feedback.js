/**
 * Student Feedback Client Controller - Student Portal
 * Pure Vanilla JavaScript — Zero image dependencies
 * Strict adherence to JWT auth, RBAC scoping, and input validation.
 */

(function () {
  'use strict';

  // State Management
  let allForms = [];
  let currentActiveForm = null;
  let studentAnswers = {};
  let isSubmitting = false;

  // Rating descriptor map
  const RATING_DESCRIPTORS = {
    1: '1 - Poor',
    2: '2 - Fair',
    3: '3 - Good',
    4: '4 - Very Good',
    5: '5 - Excellent'
  };

  /**
   * Safe HTML Escaper
   */
  function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Clean Date Formatter
   */
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      return String(dateStr).slice(0, 10);
    }
  }

  /**
   * Global Toast Notification
   */
  function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  /**
   * Verify Student Authentication
   */
  function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.replace('/login.html');
      return false;
    }

    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      if (user && user.role && user.role.toUpperCase() !== 'STUDENT') {
        window.location.replace('/login.html');
        return false;
      }
    } catch (e) {}

    return true;
  }

  /**
   * ==========================================================================
   * 1. LOAD FEEDBACK FORMS (GET /api/feedback/forms)
   * ==========================================================================
   */
  async function loadFeedbackForms() {
    const loadingEl = document.getElementById('feedbackLoading');
    const cardsGrid = document.getElementById('feedbackCardsGrid');
    const emptyState = document.getElementById('feedbackEmptyState');
    const errorState = document.getElementById('feedbackErrorState');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (cardsGrid) cardsGrid.innerHTML = '';
    if (emptyState) emptyState.classList.add('hidden');
    if (errorState) errorState.classList.add('hidden');

    const token = localStorage.getItem('token');

    try {
      const res = await fetch('/api/feedback/forms', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.replace('/login.html');
        return;
      }

      if (res.status === 403) {
        if (loadingEl) loadingEl.classList.add('hidden');
        if (errorState) {
          errorState.classList.remove('hidden');
          const msgEl = document.getElementById('feedbackErrorMessage');
          if (msgEl) msgEl.textContent = 'Access restricted: Only enrolled students may access student feedback.';
        }
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const json = await res.json();
      const forms = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
      allForms = forms;

      // Update KPI counters
      const totalCount = forms.length;
      const submittedCount = forms.filter(f => f.has_submitted).length;
      const pendingCount = totalCount - submittedCount;

      const statActive = document.getElementById('statActiveForms');
      if (statActive) statActive.textContent = totalCount;
      const statPending = document.getElementById('statPendingForms');
      if (statPending) statPending.textContent = pendingCount;
      const statSubmitted = document.getElementById('statSubmittedForms');
      if (statSubmitted) statSubmitted.textContent = submittedCount;

      if (loadingEl) loadingEl.classList.add('hidden');
      applyFiltersAndRender();
    } catch (error) {
      console.error('Error loading feedback forms:', error);
      if (loadingEl) loadingEl.classList.add('hidden');
      if (errorState) {
        errorState.classList.remove('hidden');
        const msgEl = document.getElementById('feedbackErrorMessage');
        if (msgEl) msgEl.textContent = 'Unable to connect to the feedback server. Please try again.';
      }
    }
  }

  /**
   * Filter and render forms based on search and status/target filters
   */
  function applyFiltersAndRender() {
    const searchInput = document.getElementById('feedbackSearchInput');
    const statusFilter = document.getElementById('feedbackStatusFilter');
    const targetFilter = document.getElementById('feedbackTargetFilter');
    const cardsGrid = document.getElementById('feedbackCardsGrid');
    const emptyState = document.getElementById('feedbackEmptyState');

    const search = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const status = statusFilter ? statusFilter.value : 'ALL';
    const target = targetFilter ? targetFilter.value : 'ALL';

    const filtered = allForms.filter(f => {
      // Status filter
      if (status === 'PENDING' && f.has_submitted) return false;
      if (status === 'SUBMITTED' && !f.has_submitted) return false;

      // Target filter
      if (target !== 'ALL' && f.target_type !== target) return false;

      // Search term
      if (search) {
        const titleMatch = f.title && f.title.toLowerCase().includes(search);
        const descMatch = f.description && f.description.toLowerCase().includes(search);
        const labelMatch = f.target_label && f.target_label.toLowerCase().includes(search);
        if (!titleMatch && !descMatch && !labelMatch) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      if (cardsGrid) cardsGrid.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      renderCardsGrid(filtered);
    }
  }

  /**
   * Render cards grid for available forms
   */
  function renderCardsGrid(forms) {
    const cardsGrid = document.getElementById('feedbackCardsGrid');
    if (!cardsGrid) return;

    let html = '';

    forms.forEach(form => {
      const isSubmitted = Boolean(form.has_submitted);

      // Target badge class and label
      let targetBadgeClass = 'badge-target-general';
      let targetLabel = 'GENERAL';
      if (form.target_type === 'COURSE') {
        targetBadgeClass = 'badge-target-course';
        targetLabel = form.target_label ? `COURSE: ${form.target_label}` : 'COURSE';
      } else if (form.target_type === 'TEACHER') {
        targetBadgeClass = 'badge-target-teacher';
        targetLabel = form.target_label ? `FACULTY: ${form.target_label}` : 'FACULTY';
      } else if (form.target_type === 'EVENT') {
        targetBadgeClass = 'badge-target-event';
        targetLabel = form.target_label ? `EVENT: ${form.target_label}` : 'EVENT';
      }

      // Metadata string
      let metaAcademic = '';
      if (form.academic_year || form.semester) {
        const parts = [];
        if (form.academic_year) parts.push(form.academic_year);
        if (form.semester) parts.push(`Sem ${form.semester}`);
        metaAcademic = parts.join(' • ');
      }

      html += `
        <div class="feedback-card" id="form-card-${form.feedback_form_id}">
          <div>
            <div class="feedback-card-top">
              <span class="feedback-badge ${targetBadgeClass}">${escapeHtml(targetLabel)}</span>
              ${isSubmitted 
                ? '<span class="feedback-badge badge-status-submitted">Submitted ✓</span>' 
                : '<span class="feedback-badge badge-status-pending">Pending</span>'
              }
            </div>

            <h3 class="feedback-card-title">${escapeHtml(form.title)}</h3>
            <p class="feedback-card-desc">${escapeHtml(form.description || 'No additional description provided.')}</p>

            <div class="feedback-meta-list">
              ${metaAcademic ? `
                <div class="feedback-meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path></svg>
                  <span>${escapeHtml(metaAcademic)}</span>
                </div>
              ` : ''}
              <div class="feedback-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line></svg>
                <span>Closes ${formatDate(form.end_date)}</span>
              </div>
              <div class="feedback-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                <span>${form.question_count || 0} Questions</span>
              </div>
            </div>
          </div>

          <div class="feedback-card-footer">
            ${isSubmitted ? `
              <div class="feedback-submitted-pill">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Submitted ✓</span>
                ${form.submitted_at ? `<small style="font-weight: 400; opacity: 0.85; margin-left: 4px;">(${formatDate(form.submitted_at)})</small>` : ''}
              </div>
            ` : `
              <button type="button" class="btn-give-feedback" data-id="${form.feedback_form_id}">
                <span>Give Feedback</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </button>
            `}
          </div>
        </div>
      `;
    });

    cardsGrid.innerHTML = html;

    // Attach click handlers to "Give Feedback" buttons
    cardsGrid.querySelectorAll('.btn-give-feedback').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const formId = e.currentTarget.getAttribute('data-id');
        if (formId) openFeedbackForm(formId);
      });
    });
  }

  /**
   * ==========================================================================
   * 2. OPEN FEEDBACK FORM (GET /api/feedback/forms/:id)
   * ==========================================================================
   */
  async function openFeedbackForm(formId) {
    const listView = document.getElementById('feedbackListView');
    const formView = document.getElementById('feedbackFormView');

    if (listView) listView.style.display = 'none';
    if (formView) formView.classList.add('active');

    // Scroll to top of main content
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const questionsContainer = document.getElementById('questionsContainer');
    if (questionsContainer) {
      questionsContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #64748b;">
          <div class="skeleton-line" style="height: 18px; width: 60%; margin: 0 auto 12px;"></div>
          <div class="skeleton-line" style="height: 14px; width: 40%; margin: 0 auto;"></div>
          <p style="margin-top: 16px; font-size: 13.5px;">Loading survey questions...</p>
        </div>
      `;
    }

    // Reset error banner
    const errBanner = document.getElementById('formValidationErrorBanner');
    if (errBanner) errBanner.style.display = 'none';

    const token = localStorage.getItem('token');

    try {
      const res = await fetch(`/api/feedback/forms/${formId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.status === 404) {
        showToast('Feedback form not found or is no longer available.', 'error');
        backToListView();
        return;
      }

      if (!res.ok) {
        throw new Error(`Failed to load form (Status: ${res.status})`);
      }

      const json = await res.json();
      const form = json.data;
      if (!form) throw new Error('Form data missing in response');

      currentActiveForm = form;
      studentAnswers = {};

      // Populate Form Summary Banner
      const titleEl = document.getElementById('formViewTitle');
      if (titleEl) titleEl.textContent = form.title;

      const descEl = document.getElementById('formViewDesc');
      if (descEl) descEl.textContent = form.description || 'Please answer the questions below accurately to provide constructive feedback.';

      // Target badge
      const targetBadge = document.getElementById('formViewTargetBadge');
      if (targetBadge) {
        targetBadge.className = 'feedback-badge';
        if (form.target_type === 'COURSE') {
          targetBadge.classList.add('badge-target-course');
          targetBadge.textContent = form.target_label ? `COURSE: ${form.target_label}` : 'COURSE';
        } else if (form.target_type === 'TEACHER') {
          targetBadge.classList.add('badge-target-teacher');
          targetBadge.textContent = form.target_label ? `FACULTY: ${form.target_label}` : 'FACULTY';
        } else if (form.target_type === 'EVENT') {
          targetBadge.classList.add('badge-target-event');
          targetBadge.textContent = form.target_label ? `EVENT: ${form.target_label}` : 'EVENT';
        } else {
          targetBadge.classList.add('badge-target-general');
          targetBadge.textContent = 'GENERAL';
        }
      }

      // Status badge
      const statusBadge = document.getElementById('formViewStatusBadge');
      if (statusBadge) {
        if (form.has_submitted) {
          statusBadge.className = 'feedback-badge badge-status-submitted';
          statusBadge.textContent = 'SUBMITTED ✓';
        } else {
          statusBadge.className = 'feedback-badge badge-status-pending';
          statusBadge.textContent = 'PENDING SUBMISSION';
        }
      }

      // Meta chips
      const academicChip = document.getElementById('formViewAcademic');
      if (academicChip) {
        const parts = [];
        if (form.academic_year) parts.push(form.academic_year);
        if (form.semester) parts.push(`Semester ${form.semester}`);
        academicChip.textContent = parts.length > 0 ? parts.join(' • ') : 'All Semesters';
      }

      const datesChip = document.getElementById('formViewDates');
      if (datesChip) datesChip.textContent = `Closes ${formatDate(form.end_date)}`;

      const qCountChip = document.getElementById('formViewQuestionCount');
      const questions = form.questions || [];
      if (qCountChip) qCountChip.textContent = `${questions.length} Question${questions.length === 1 ? '' : 's'}`;

      // If already submitted, disable submission button
      const submitBtn = document.getElementById('btnOpenSubmitModal');
      if (submitBtn) {
        if (form.has_submitted) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span>Already Submitted ✓</span>';
        } else {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `
            <span>Submit Feedback</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          `;
        }
      }

      renderQuestions(questions, form.has_submitted);
    } catch (error) {
      console.error('Error opening form:', error);
      showToast('Unable to open feedback form. Please try again.', 'error');
      backToListView();
    }
  }

  /**
   * Render dynamic question cards in display_order
   */
  function renderQuestions(questions, isReadOnly = false) {
    const container = document.getElementById('questionsContainer');
    if (!container) return;

    if (!questions || questions.length === 0) {
      container.innerHTML = `
        <div class="feedback-empty-state">
          <p class="feedback-empty-sub">This survey does not have any questions registered yet.</p>
        </div>
      `;
      return;
    }

    // Sort strictly by display_order
    const sorted = [...questions].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

    let html = '';

    sorted.forEach((q, idx) => {
      const qNum = idx + 1;
      const isReq = Boolean(q.is_required);
      studentAnswers[q.question_id] = { rating: null, answer_text: '' };

      html += `
        <div class="question-card" id="qcard-${q.question_id}" data-qid="${q.question_id}" data-required="${isReq}">
          <div class="question-header">
            <div class="question-title-group">
              <span class="question-index-badge">${qNum}</span>
              <h4 class="question-text">${escapeHtml(q.question_text)}</h4>
            </div>
            ${isReq ? '<span class="question-required-pill">Required *</span>' : ''}
          </div>

          <div class="question-body">
            ${renderQuestionInput(q, isReadOnly)}
          </div>

          <div class="question-error-text" id="qerr-${q.question_id}">
            ${isReq ? 'Please answer this required question before submitting.' : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    if (!isReadOnly) {
      attachQuestionEvents(sorted);
    }
  }

  /**
   * Generate input control markup based on question_type
   */
  function renderQuestionInput(q, isReadOnly) {
    const qType = (q.question_type || 'RATING').toUpperCase();

    if (qType === 'RATING') {
      return `
        <div class="rating-control-wrapper" role="radiogroup" aria-label="${escapeHtml(q.question_text)}">
          <div class="rating-stars-container" id="star-container-${q.question_id}">
            ${[1, 2, 3, 4, 5].map(val => `
              <button type="button" class="rating-star-btn" data-qid="${q.question_id}" data-val="${val}" 
                role="radio" aria-checked="false" aria-label="Rate ${val} of 5" ${isReadOnly ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
              </button>
            `).join('')}
          </div>
          <div class="rating-label-feedback" id="rating-label-${q.question_id}">
            Select a rating from 1 (Poor) to 5 (Excellent)
          </div>
        </div>
      `;
    }

    if (qType === 'TEXT') {
      return `
        <div>
          <textarea class="question-textarea" id="textarea-${q.question_id}" data-qid="${q.question_id}" 
            placeholder="Write your feedback here..." rows="3" ${isReadOnly ? 'disabled' : ''}></textarea>
        </div>
      `;
    }

    if (qType === 'MULTIPLE_CHOICE') {
      // Graceful support for MULTIPLE_CHOICE without schema modifications
      const options = Array.isArray(q.options) ? q.options : ['Strongly Agree', 'Agree', 'Neutral', 'Disagree', 'Strongly Disagree'];
      return `
        <div class="question-mcq-options">
          ${options.map((opt, optIdx) => `
            <label class="mcq-option-label">
              <input type="radio" name="mcq-${q.question_id}" value="${escapeHtml(opt)}" data-qid="${q.question_id}" ${isReadOnly ? 'disabled' : ''}>
              <span>${escapeHtml(opt)}</span>
            </label>
          `).join('')}
        </div>
      `;
    }

    return `<p style="color: #64748b; font-size: 13px;">Unsupported question format</p>`;
  }

  /**
   * Attach input event listeners for dynamic question components
   */
  function attachQuestionEvents(questions) {
    questions.forEach(q => {
      const qType = (q.question_type || 'RATING').toUpperCase();

      if (qType === 'RATING') {
        const starBtns = document.querySelectorAll(`.rating-star-btn[data-qid="${q.question_id}"]`);
        const labelEl = document.getElementById(`rating-label-${q.question_id}`);

        starBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            const val = parseInt(btn.getAttribute('data-val'), 10);
            studentAnswers[q.question_id].rating = val;

            // Update UI stars selection state
            starBtns.forEach(b => {
              const bVal = parseInt(b.getAttribute('data-val'), 10);
              if (bVal <= val) {
                b.classList.add('selected');
                b.setAttribute('aria-checked', bVal === val ? 'true' : 'false');
              } else {
                b.classList.remove('selected');
                b.setAttribute('aria-checked', 'false');
              }
            });

            if (labelEl) {
              labelEl.textContent = RATING_DESCRIPTORS[val] || `${val} Stars`;
            }

            // Clear card validation error if active
            const card = document.getElementById(`qcard-${q.question_id}`);
            if (card) card.classList.remove('has-error');
          });
        });
      } else if (qType === 'TEXT') {
        const textarea = document.getElementById(`textarea-${q.question_id}`);
        if (textarea) {
          textarea.addEventListener('input', (e) => {
            studentAnswers[q.question_id].answer_text = e.target.value;
            if (e.target.value.trim().length > 0) {
              const card = document.getElementById(`qcard-${q.question_id}`);
              if (card) card.classList.remove('has-error');
            }
          });
        }
      } else if (qType === 'MULTIPLE_CHOICE') {
        const radios = document.querySelectorAll(`input[name="mcq-${q.question_id}"]`);
        radios.forEach(radio => {
          radio.addEventListener('change', (e) => {
            studentAnswers[q.question_id].answer_text = e.target.value;
            const card = document.getElementById(`qcard-${q.question_id}`);
            if (card) card.classList.remove('has-error');
          });
        });
      }
    });
  }

  /**
   * Return from Form view to List view
   */
  function backToListView() {
    const listView = document.getElementById('feedbackListView');
    const formView = document.getElementById('feedbackFormView');

    if (formView) formView.classList.remove('active');
    if (listView) listView.style.display = 'block';

    currentActiveForm = null;
    studentAnswers = {};
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * ==========================================================================
   * 3. CLIENT-SIDE VALIDATION
   * ==========================================================================
   */
  function validateForm() {
    if (!currentActiveForm || !currentActiveForm.questions) return false;

    let hasErrors = false;
    let firstErrorCard = null;

    const errBanner = document.getElementById('formValidationErrorBanner');
    if (errBanner) errBanner.style.display = 'none';

    currentActiveForm.questions.forEach(q => {
      const isReq = Boolean(q.is_required);
      const card = document.getElementById(`qcard-${q.question_id}`);
      const ans = studentAnswers[q.question_id];
      const qType = (q.question_type || 'RATING').toUpperCase();

      let isAnswered = false;

      if (qType === 'RATING') {
        isAnswered = ans && ans.rating !== null && ans.rating !== undefined && ans.rating >= 1 && ans.rating <= 5;
      } else if (qType === 'TEXT' || qType === 'MULTIPLE_CHOICE') {
        isAnswered = ans && ans.answer_text && ans.answer_text.trim().length > 0;
      }

      if (isReq && !isAnswered) {
        hasErrors = true;
        if (card) {
          card.classList.add('has-error');
          if (!firstErrorCard) firstErrorCard = card;
        }
      } else {
        if (card) card.classList.remove('has-error');
      }
    });

    if (hasErrors) {
      if (errBanner) {
        errBanner.style.display = 'flex';
      }
      if (firstErrorCard) {
        firstErrorCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      showToast('Please answer all required questions before submitting.', 'warning');
      return false;
    }

    return true;
  }

  /**
   * ==========================================================================
   * 4. CONFIRMATION MODAL & SUBMISSION (POST /api/feedback/forms/:id/submit)
   * ==========================================================================
   */
  function openConfirmModal() {
    if (!validateForm()) return;
    const modal = document.getElementById('confirmSubmitModal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeConfirmModal() {
    const modal = document.getElementById('confirmSubmitModal');
    if (modal) modal.classList.add('hidden');
  }

  async function executeFeedbackSubmission() {
    if (isSubmitting || !currentActiveForm) return;

    isSubmitting = true;
    const confirmBtn = document.getElementById('btnConfirmSubmit');
    const confirmText = document.getElementById('confirmSubmitBtnText');
    const formSubmitBtn = document.getElementById('btnOpenSubmitModal');

    if (confirmBtn) confirmBtn.disabled = true;
    if (confirmText) confirmText.textContent = 'Submitting...';
    if (formSubmitBtn) formSubmitBtn.disabled = true;

    // Build payload: resolve question answers accurately
    const formattedAnswers = [];
    currentActiveForm.questions.forEach(q => {
      const ans = studentAnswers[q.question_id];
      if (ans) {
        const payloadItem = { question_id: q.question_id };
        const qType = (q.question_type || 'RATING').toUpperCase();

        if (qType === 'RATING' && ans.rating !== null && ans.rating !== undefined) {
          payloadItem.rating = parseFloat(ans.rating);
        }
        if ((qType === 'TEXT' || qType === 'MULTIPLE_CHOICE') && ans.answer_text) {
          payloadItem.answer_text = ans.answer_text.trim();
        }
        formattedAnswers.push(payloadItem);
      }
    });

    const token = localStorage.getItem('token');

    try {
      const res = await fetch(`/api/feedback/forms/${currentActiveForm.feedback_form_id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ answers: formattedAnswers })
      });

      const json = await res.json().catch(() => ({}));

      // Case 1: 201 Created (Success)
      if (res.status === 201 || res.status === 200) {
        closeConfirmModal();
        showToast('Feedback submitted successfully.', 'success');
        backToListView();
        await loadFeedbackForms();
        return;
      }

      // Case 2: 409 Conflict (Duplicate submission)
      if (res.status === 409) {
        closeConfirmModal();
        showToast('You have already submitted this feedback form.', 'warning');
        backToListView();
        await loadFeedbackForms();
        return;
      }

      // Case 3: 400 Bad Request (Validation failure)
      if (res.status === 400) {
        closeConfirmModal();
        const msg = json.message || 'Please check your answers and try again.';
        showToast(msg, 'error');
        return;
      }

      // Case 4: 401 Unauthorized
      if (res.status === 401) {
        closeConfirmModal();
        localStorage.removeItem('token');
        window.location.replace('/login.html');
        return;
      }

      // Case 5: 403 Forbidden
      if (res.status === 403) {
        closeConfirmModal();
        showToast('Access denied. Only eligible students can submit this form.', 'error');
        return;
      }

      // Case 6: 404 Not Found
      if (res.status === 404) {
        closeConfirmModal();
        showToast('Feedback form not found or is no longer available.', 'error');
        backToListView();
        await loadFeedbackForms();
        return;
      }

      // Case 7: 500 Server Error
      closeConfirmModal();
      showToast('Unable to submit feedback right now. Please try again.', 'error');
    } catch (error) {
      console.error('Submission network error:', error);
      closeConfirmModal();
      showToast('Network error while submitting feedback. Please try again.', 'error');
    } finally {
      isSubmitting = false;
      if (confirmBtn) confirmBtn.disabled = false;
      if (confirmText) confirmText.textContent = 'Submit';
      if (formSubmitBtn) formSubmitBtn.disabled = false;
    }
  }

  /**
   * ==========================================================================
   * 5. EVENT LISTENERS INITIALIZATION
   * ==========================================================================
   */
  function initEvents() {
    // Search input
    const searchInput = document.getElementById('feedbackSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', applyFiltersAndRender);
    }

    // Status filter
    const statusFilter = document.getElementById('feedbackStatusFilter');
    if (statusFilter) {
      statusFilter.addEventListener('change', applyFiltersAndRender);
    }

    // Target filter
    const targetFilter = document.getElementById('feedbackTargetFilter');
    if (targetFilter) {
      targetFilter.addEventListener('change', applyFiltersAndRender);
    }

    // Retry load button
    const retryBtn = document.getElementById('btnRetryLoad');
    if (retryBtn) {
      retryBtn.addEventListener('click', loadFeedbackForms);
    }

    // Back to list button
    const backBtn = document.getElementById('btnBackToList');
    if (backBtn) {
      backBtn.addEventListener('click', backToListView);
    }

    // Submit button (opens modal)
    const openSubmitBtn = document.getElementById('btnOpenSubmitModal');
    if (openSubmitBtn) {
      openSubmitBtn.addEventListener('click', openConfirmModal);
    }

    // Modal buttons
    const cancelModalBtn = document.getElementById('btnCancelSubmit');
    if (cancelModalBtn) {
      cancelModalBtn.addEventListener('click', closeConfirmModal);
    }

    const closeModalXBtn = document.getElementById('btnCloseModalX');
    if (closeModalXBtn) {
      closeModalXBtn.addEventListener('click', closeConfirmModal);
    }

    const confirmModalBtn = document.getElementById('btnConfirmSubmit');
    if (confirmModalBtn) {
      confirmModalBtn.addEventListener('click', executeFeedbackSubmission);
    }

    // Close modal on backdrop click
    const modalBackdrop = document.getElementById('confirmSubmitModal');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeConfirmModal();
      });
    }

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeConfirmModal();
    });
  }

  /**
   * Lifecycle Entrypoint
   */
  function init() {
    if (!checkAuth()) return;
    initEvents();
    loadFeedbackForms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
