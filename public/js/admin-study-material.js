/**
 * Admin Study Material Management Script
 * Handles CRUD operations, filtering, statistics, and modal state management
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. AUTHENTICATION & SESSION GUARD
  // ==========================================================================
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

  if (currentUser.role !== 'ADMIN') {
    window.location.replace('/login.html');
    return;
  }

  // Update username badge
  const usernameBadge = document.getElementById('adminUsernameBadge');
  if (usernameBadge) {
    usernameBadge.textContent = currentUser.username || currentUser.first_name || 'Administrator';
  }

  // API Request Helper
  async function apiFetch(endpoint, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    const res = await fetch(endpoint, config);
    if (res.status === 401) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/login.html');
      return null;
    }
    return res;
  }

  // ==========================================================================
  // 2. UI STATE & ELEMENTS
  // ==========================================================================
  let currentPage = 1;
  const itemsPerPage = 10;
  let totalItems = 0;
  let totalPages = 1;
  let coursesList = [];
  let teachersList = [];
  let pendingDeleteId = null;

  // Filter Elements
  const filterSearch = document.getElementById('filterSearch');
  const filterCourse = document.getElementById('filterCourse');
  const filterType = document.getElementById('filterType');
  const filterTeacher = document.getElementById('filterTeacher');
  const filterSemester = document.getElementById('filterSemester');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const btnRefresh = document.getElementById('btnRefresh');

  // KPI Elements
  const kpiTotalMaterials = document.getElementById('kpiTotalMaterials');
  const kpiCoveredCourses = document.getElementById('kpiCoveredCourses');
  const kpiFacultyCount = document.getElementById('kpiFacultyCount');
  const kpiCoreCount = document.getElementById('kpiCoreCount');

  // Table & Pagination
  const materialsBody = document.getElementById('materialsBody');
  const paginationInfo = document.getElementById('paginationInfo');
  const paginationCurrentPage = document.getElementById('paginationCurrentPage');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');

  // Modals
  const materialModal = document.getElementById('materialModal');
  const materialForm = document.getElementById('materialForm');
  const modalMaterialTitle = document.getElementById('modalMaterialTitle');
  const materialIdInput = document.getElementById('materialId');
  const modalCourse = document.getElementById('modalCourse');
  const modalTeacher = document.getElementById('modalTeacher');
  const modalTitle = document.getElementById('modalTitle');
  const modalMaterialType = document.getElementById('modalMaterialType');
  const modalFilePath = document.getElementById('modalFilePath');
  const modalDescription = document.getElementById('modalDescription');
  const btnSaveMaterial = document.getElementById('btnSaveMaterial');

  const viewMaterialModal = document.getElementById('viewMaterialModal');
  const viewMaterialContent = document.getElementById('viewMaterialContent');

  const deleteMaterialModal = document.getElementById('deleteMaterialModal');
  const deleteMaterialDetails = document.getElementById('deleteMaterialDetails');
  const btnConfirmDeleteMaterial = document.getElementById('btnConfirmDeleteMaterial');

  // ==========================================================================
  // 3. TOAST NOTIFICATION SYSTEM
  // ==========================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
      <button type="button" class="toast-close" aria-label="Close">&times;</button>
    `;

    container.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 4500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================================================
  // 4. MODAL HELPERS
  // ==========================================================================
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('hidden');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-dismiss="modal"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-backdrop') || btn.closest('.erp-modal-overlay');
      if (modal) closeModal(modal);
    });
  });

  document.querySelectorAll('.modal-backdrop, .erp-modal-overlay').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal(backdrop);
    });
  });

  // ==========================================================================
  // 5. DATA FETCHING: LOOKUPS, STATS, & LIST
  // ==========================================================================
  async function loadLookups() {
    try {
      // 1. Courses
      const resCourses = await apiFetch('/api/courses?limit=100');
      if (resCourses && resCourses.ok) {
        const json = await resCourses.json();
        coursesList = json.data && json.data.courses ? json.data.courses : [];
        
        let courseOpts = '<option value="">All Courses</option>';
        let modalCourseOpts = '<option value="">Select Course</option>';
        coursesList.forEach((c) => {
          const opt = `<option value="${c.course_id}">${escapeHtml(c.course_code)} - ${escapeHtml(c.course_name)} (Sem ${c.semester})</option>`;
          courseOpts += opt;
          modalCourseOpts += opt;
        });
        filterCourse.innerHTML = courseOpts;
        modalCourse.innerHTML = modalCourseOpts;
      }

      // 2. Teachers
      const resTeachers = await apiFetch('/api/teachers?limit=100');
      if (resTeachers && resTeachers.ok) {
        const json = await resTeachers.json();
        teachersList = json.data && json.data.teachers ? json.data.teachers : [];
        
        let teacherOpts = '<option value="">All Teachers</option>';
        let modalTeacherOpts = '<option value="">Select Active Teacher</option>';
        teachersList.forEach((t) => {
          const isTeacherActive = t.is_active !== undefined ? Boolean(t.is_active) : true;
          const statusSuffix = isTeacherActive ? '' : ' (Inactive)';
          const opt = `<option value="${t.teacher_id}" ${!isTeacherActive ? 'disabled' : ''}>${escapeHtml(t.first_name)} ${escapeHtml(t.last_name)} (${escapeHtml(t.designation || 'Faculty')})${statusSuffix}</option>`;
          teacherOpts += opt;
          if (isTeacherActive) {
            modalTeacherOpts += opt;
          }
        });
        filterTeacher.innerHTML = teacherOpts;
        modalTeacher.innerHTML = modalTeacherOpts;
      }
    } catch (err) {
      console.error('Error loading lookup filters:', err);
    }
  }

  async function loadStats() {
    try {
      const res = await apiFetch('/api/study-materials/stats');
      if (!res || !res.ok) return;
      const json = await res.json();
      const s = json.data && json.data.stats ? json.data.stats : {};

      kpiTotalMaterials.textContent = s.total_materials || 0;
      kpiCoveredCourses.textContent = s.covered_courses || 0;
      kpiFacultyCount.textContent = s.contributing_teachers || 0;

      // Combine Notes + Syllabus for Core Materials
      const notes = s.by_type && s.by_type.Notes ? s.by_type.Notes : 0;
      const syllabus = s.by_type && s.by_type.Syllabus ? s.by_type.Syllabus : 0;
      kpiCoreCount.textContent = notes + syllabus;
    } catch (err) {
      console.error('Error fetching study material statistics:', err);
    }
  }

  async function loadStudyMaterials(page = 1) {
    currentPage = page;
    materialsBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">Loading study materials...</td>
      </tr>
    `;

    const params = new URLSearchParams();
    params.set('page', currentPage);
    params.set('limit', itemsPerPage);

    if (filterSearch.value.trim()) params.set('search', filterSearch.value.trim());
    if (filterCourse.value) params.set('course_id', filterCourse.value);
    if (filterType.value) params.set('material_type', filterType.value);
    if (filterTeacher.value) params.set('teacher_id', filterTeacher.value);
    if (filterSemester.value) params.set('semester', filterSemester.value);

    try {
      const res = await apiFetch(`/api/study-materials?${params.toString()}`);
      if (!res || !res.ok) {
        materialsBody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-4 text-danger">Failed to load study materials. Please try again.</td>
          </tr>
        `;
        return;
      }

      const json = await res.json();
      const data = json.data || {};
      const materials = data.materials || [];
      const pagination = data.pagination || { total: 0, totalPages: 1 };

      totalItems = pagination.total;
      totalPages = pagination.totalPages;

      renderMaterialsTable(materials);
      updatePaginationControls();
    } catch (err) {
      console.error('Error loading study materials:', err);
      materialsBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-danger">An unexpected error occurred while loading study materials.</td>
        </tr>
      `;
    }
  }

  function renderMaterialsTable(materials) {
    if (!materials || materials.length === 0) {
      materialsBody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="erp-empty-state">
              <div class="erp-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </div>
              <div class="erp-empty-title">No Study Materials Found</div>
              <div class="erp-empty-text">No materials match your filter or search criteria. Try modifying your search.</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = '';
    materials.forEach((m) => {
      // Type badge styling
      let typeBadge = '<span class="erp-badge badge-inactive">Other</span>';
      if (m.material_type === 'Notes') {
        typeBadge = '<span class="erp-badge badge-type-notes">Lecture Notes</span>';
      } else if (m.material_type === 'Syllabus') {
        typeBadge = '<span class="erp-badge badge-type-syllabus">Syllabus</span>';
      } else if (m.material_type === 'Question Paper') {
        typeBadge = '<span class="erp-badge badge-type-question-paper">Question Paper</span>';
      } else if (m.material_type === 'Presentation') {
        typeBadge = '<span class="erp-badge badge-role-all">Presentation</span>';
      } else if (m.material_type === 'Reference Link') {
        typeBadge = '<span class="erp-badge badge-type-reference">Reference Link</span>';
      }

      // Format Date
      let formattedDate = '-';
      if (m.created_at) {
        const d = new Date(m.created_at);
        formattedDate = d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      }

      // Safe Attachment Link
      const isExternal = /^https?:\/\//i.test(m.file_path);
      const linkLabel = isExternal ? 'Open Resource' : 'View File Asset';
      const attachmentCell = `
        <a href="${escapeHtml(m.file_path)}" target="_blank" rel="noopener noreferrer" style="color: #7c3aed; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; text-decoration: none;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          ${linkLabel}
        </a>
      `;

      rowsHtml += `
        <tr>
          <td>
            <div style="font-weight: 600; color: #0f172a; margin-bottom: 4px;">${escapeHtml(m.title)}</div>
            <div>${typeBadge}</div>
          </td>
          <td>
            <div style="font-weight: 600; color: #1e293b;">
              <span style="color: #7c3aed;">${escapeHtml(m.course_code || '')}</span> - ${escapeHtml(m.course_name || 'Course')}
            </div>
            <div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">
              ${escapeHtml(m.department_name || 'General')} • Sem ${m.semester || '-'}
            </div>
          </td>
          <td>
            <div style="font-weight: 600; color: #1e293b;">${escapeHtml(m.teacher_name || 'Faculty Member')}</div>
            <div style="font-size: 11.5px; color: #64748b;">${escapeHtml(m.teacher_designation || '')}</div>
          </td>
          <td>
            ${attachmentCell}
          </td>
          <td>
            <div style="font-size: 12.5px; font-weight: 500; color: #334155;">${formattedDate}</div>
          </td>
          <td style="text-align: right;">
            <div class="erp-row-actions">
              <button type="button" class="btn-row-action btn-row-action-view btn-view-material" data-id="${m.material_id}" title="View Details">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button type="button" class="btn-row-action btn-edit-material" data-id="${m.material_id}" title="Edit Material">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button type="button" class="btn-row-action btn-row-action-delete btn-delete-material" data-id="${m.material_id}" data-title="${escapeHtml(m.title)}" data-course="${escapeHtml(m.course_name || '')}" title="Delete Material">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    materialsBody.innerHTML = rowsHtml;
    attachRowEventListeners();
  }

  function updatePaginationControls() {
    const start = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, totalItems);
    paginationInfo.textContent = `Showing ${start} to ${end} of ${totalItems} materials`;
    paginationCurrentPage.textContent = `Page ${currentPage} of ${totalPages || 1}`;

    btnPrevPage.disabled = currentPage <= 1;
    btnNextPage.disabled = currentPage >= totalPages || totalPages === 0;
  }

  function attachRowEventListeners() {
    // View
    document.querySelectorAll('.btn-view-material').forEach((btn) => {
      btn.addEventListener('click', () => handleViewMaterial(btn.dataset.id));
    });

    // Edit
    document.querySelectorAll('.btn-edit-material').forEach((btn) => {
      btn.addEventListener('click', () => handleEditMaterial(btn.dataset.id));
    });

    // Delete
    document.querySelectorAll('.btn-delete-material').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingDeleteId = btn.dataset.id;
        deleteMaterialDetails.innerHTML = `
          <strong>${escapeHtml(btn.dataset.title)}</strong><br>
          Course: ${escapeHtml(btn.dataset.course)}
        `;
        openModal(deleteMaterialModal);
      });
    });
  }

  // ==========================================================================
  // 6. VIEW STUDY MATERIAL DETAILS
  // ==========================================================================
  async function handleViewMaterial(id) {
    try {
      const res = await apiFetch(`/api/study-materials/${id}`);
      if (!res || !res.ok) {
        showToast('Failed to fetch study material details', 'error');
        return;
      }
      const json = await res.json();
      const m = json.data && json.data.material ? json.data.material : null;
      if (!m) return;

      const formattedDate = m.created_at ? new Date(m.created_at).toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'short'
      }) : 'Not available';

      viewMaterialContent.innerHTML = `
        <div class="detail-row" style="margin-bottom: 12px;">
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Title</div>
          <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${escapeHtml(m.title)}</div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Course</div>
            <div style="font-weight: 600;">${escapeHtml(m.course_code)} - ${escapeHtml(m.course_name)}</div>
            <div style="font-size: 12px; color: #64748b;">${escapeHtml(m.department_name || '')} • Sem ${m.semester || '-'}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Faculty Uploader</div>
            <div style="font-weight: 600;">${escapeHtml(m.teacher_name)}</div>
            <div style="font-size: 12px; color: #64748b;">${escapeHtml(m.teacher_designation || '')}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Material Classification</div>
            <div style="font-weight: 600; color: #7c3aed;">${escapeHtml(m.material_type)}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">Published On</div>
            <div style="font-weight: 500;">${formattedDate}</div>
          </div>
        </div>

        <div class="detail-row" style="margin-bottom: 12px;">
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">File Path or Document URL</div>
          <div>
            <a href="${escapeHtml(m.file_path)}" target="_blank" rel="noopener noreferrer" class="link-primary" style="word-break: break-all;">
              ${escapeHtml(m.file_path)}
            </a>
          </div>
        </div>

        <div class="detail-row">
          <div style="font-size: 12px; color: #64748b; font-weight: 500;">Summary / Description</div>
          <div style="margin-top: 4px; padding: 10px; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 13px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(m.description || 'No additional summary provided.')}</div>
        </div>
      `;

      openModal(viewMaterialModal);
    } catch (err) {
      console.error('Error in handleViewMaterial:', err);
      showToast('Error opening study material details', 'error');
    }
  }

  // ==========================================================================
  // 7. ADD & EDIT STUDY MATERIAL
  // ==========================================================================
  function resetMaterialForm() {
    materialForm.reset();
    materialIdInput.value = '';
    modalMaterialTitle.textContent = 'Add Study Material';
    modalMaterialType.value = 'Notes';
  }

  document.getElementById('btnAddMaterial').addEventListener('click', () => {
    resetMaterialForm();
    openModal(materialModal);
  });

  async function handleEditMaterial(id) {
    try {
      const res = await apiFetch(`/api/study-materials/${id}`);
      if (!res || !res.ok) {
        showToast('Failed to load study material data', 'error');
        return;
      }
      const json = await res.json();
      const m = json.data && json.data.material ? json.data.material : null;
      if (!m) return;

      resetMaterialForm();
      modalMaterialTitle.textContent = 'Edit Study Material';
      materialIdInput.value = m.material_id;
      modalCourse.value = m.course_id;
      modalTeacher.value = m.teacher_id;
      modalTitle.value = m.title;
      modalMaterialType.value = m.material_type;
      modalFilePath.value = m.file_path || '';
      modalDescription.value = m.description || '';

      openModal(materialModal);
    } catch (err) {
      console.error('Error in handleEditMaterial:', err);
      showToast('Error loading study material for edit', 'error');
    }
  }

  materialForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = materialIdInput.value.trim();
    const course_id = modalCourse.value;
    const teacher_id = modalTeacher.value;
    const title = modalTitle.value.trim();
    const material_type = modalMaterialType.value;
    const file_path = modalFilePath.value.trim();
    const description = modalDescription.value.trim();

    if (!course_id || !teacher_id || !title || !material_type || !file_path) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    const payload = {
      course_id: parseInt(course_id, 10),
      teacher_id: parseInt(teacher_id, 10),
      title,
      material_type,
      file_path,
      description: description || null
    };

    btnSaveMaterial.disabled = true;
    btnSaveMaterial.textContent = 'Saving...';

    try {
      const endpoint = id ? `/api/study-materials/${id}` : '/api/study-materials';
      const method = id ? 'PUT' : 'POST';

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.message || 'Operation failed', 'error');
        return;
      }

      showToast(id ? 'Study material updated successfully' : 'Study material created successfully', 'success');
      closeModal(materialModal);
      await loadStats();
      await loadStudyMaterials(currentPage);
    } catch (err) {
      console.error('Error saving study material:', err);
      showToast('An error occurred while saving study material', 'error');
    } finally {
      btnSaveMaterial.disabled = false;
      btnSaveMaterial.textContent = 'Save Material';
    }
  });

  // ==========================================================================
  // 8. DELETE STUDY MATERIAL
  // ==========================================================================
  btnConfirmDeleteMaterial.addEventListener('click', async () => {
    if (!pendingDeleteId) return;

    btnConfirmDeleteMaterial.disabled = true;
    btnConfirmDeleteMaterial.textContent = 'Deleting...';

    try {
      const res = await apiFetch(`/api/study-materials/${pendingDeleteId}`, {
        method: 'DELETE'
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        showToast(json.message || 'Failed to delete study material', 'error');
        return;
      }

      showToast('Study material deleted successfully', 'success');
      closeModal(deleteMaterialModal);
      pendingDeleteId = null;

      await loadStats();
      await loadStudyMaterials(1);
    } catch (err) {
      console.error('Error deleting study material:', err);
      showToast('An error occurred while deleting study material', 'error');
    } finally {
      btnConfirmDeleteMaterial.disabled = false;
      btnConfirmDeleteMaterial.textContent = 'Confirm Delete';
    }
  });

  // ==========================================================================
  // 9. FILTERS & PAGINATION EVENTS
  // ==========================================================================
  let debounceTimeout = null;
  filterSearch.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      loadStudyMaterials(1);
    }, 350);
  });

  filterCourse.addEventListener('change', () => loadStudyMaterials(1));
  filterType.addEventListener('change', () => loadStudyMaterials(1));
  filterTeacher.addEventListener('change', () => loadStudyMaterials(1));
  filterSemester.addEventListener('change', () => loadStudyMaterials(1));

  btnResetFilters.addEventListener('click', () => {
    filterSearch.value = '';
    filterCourse.value = '';
    filterType.value = '';
    filterTeacher.value = '';
    filterSemester.value = '';
    loadStudyMaterials(1);
  });

  btnRefresh.addEventListener('click', () => {
    loadStats();
    loadStudyMaterials(currentPage);
    showToast('Study materials refreshed', 'info');
  });

  btnPrevPage.addEventListener('click', () => {
    if (currentPage > 1) {
      loadStudyMaterials(currentPage - 1);
    }
  });

  btnNextPage.addEventListener('click', () => {
    if (currentPage < totalPages) {
      loadStudyMaterials(currentPage + 1);
    }
  });

  // Sidebar toggle for responsive view
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const adminSidebar = document.getElementById('adminSidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');

  if (sidebarToggleBtn && adminSidebar && sidebarBackdrop) {
    sidebarToggleBtn.addEventListener('click', () => {
      adminSidebar.classList.add('open');
      sidebarBackdrop.classList.remove('hidden');
    });

    const closeSidebar = () => {
      adminSidebar.classList.remove('open');
      sidebarBackdrop.classList.add('hidden');
    };

    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
    sidebarBackdrop.addEventListener('click', closeSidebar);
  }

  // Logout handler
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/login.html');
    });
  }

  // ==========================================================================
  // 10. INITIALIZATION
  // ==========================================================================
  async function init() {
    await loadLookups();
    await loadStats();
    await loadStudyMaterials(1);
  }

  init();
})();
