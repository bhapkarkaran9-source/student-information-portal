/**
 * Teacher Study Material Controller - Student Information Portal
 * Supports Real Multipart File Uploads, Assigned Courses Validation,
 * Live In-Browser View & Download, and Resource Deletion.
 * 100% Zero Images | Pure CSS Gradients & SVGs | Accessible ERP Theme
 */

(function () {
  'use strict';

  let currentTeacher = null;
  let allCourses = [];
  let allMaterials = [];

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

  async function initStudyMaterial() {
    if (typeof requireAuth === 'function') {
      const isAuthed = await requireAuth('TEACHER');
      if (!isAuthed) return;
    }

    await loadTeacherProfile();
    await loadCourses();
    await loadMaterials();

    // Modal triggers
    const openModalBtn = document.getElementById('btnOpenUploadMaterial');
    const modal = document.getElementById('uploadMaterialModal');
    const closeModalBtn = document.getElementById('btnCloseMaterialModal');
    const cancelModalBtn = document.getElementById('btnCancelMaterialModal');
    const form = document.getElementById('uploadMaterialForm');

    if (openModalBtn && modal) {
      openModalBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
      });
    }

    const hideModal = () => {
      if (modal) modal.style.display = 'none';
      if (form) form.reset();
    };

    if (closeModalBtn) closeModalBtn.addEventListener('click', hideModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', hideModal);

    if (form) {
      form.addEventListener('submit', handleUploadMaterial);
    }

    // Filter selector
    const filterSelect = document.getElementById('materialCourseFilter');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) {
          renderMaterials(allMaterials);
        } else {
          renderMaterials(allMaterials.filter(m => String(m.course_id) === String(val)), true);
        }
      });
    }

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

  async function loadCourses() {
    try {
      // Backend automatically restricts /api/courses for TEACHER to assigned courses via timetable
      const res = await apiFetch('/api/courses?all=true');
      const filterSelect = document.getElementById('materialCourseFilter');
      const modalSelect = document.getElementById('modalMaterialCourse');

      if (res && res.success && res.data) {
        allCourses = Array.isArray(res.data) ? res.data : (res.data.courses || []);
      } else {
        allCourses = [];
      }

      if (filterSelect) {
        filterSelect.innerHTML = '<option value="">All Assigned Courses</option>';
        allCourses.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.course_id;
          opt.textContent = `${c.course_code} - ${c.course_name}`;
          filterSelect.appendChild(opt);
        });
      }

      if (modalSelect) {
        modalSelect.innerHTML = '<option value="">-- Choose Assigned Course --</option>';
        allCourses.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.course_id;
          opt.textContent = `${c.course_code} - ${c.course_name}`;
          modalSelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.error('Failed to load courses for study material:', e);
    }
  }

  async function loadMaterials() {
    try {
      const res = await apiFetch('/api/study-materials');
      if (res && res.success && res.data) {
        allMaterials = Array.isArray(res.data) ? res.data : (res.data.materials || []);
      } else {
        allMaterials = [];
      }

      updateKPIs(allMaterials);
      renderMaterials(allMaterials);
    } catch (err) {
      console.error('Failed to load study materials:', err);
      allMaterials = [];
      renderMaterials([]);
    }
  }

  function updateKPIs(materials) {
    const totalEl = document.getElementById('statTotalMaterials');
    if (totalEl) totalEl.textContent = materials.length;

    let books = 0;
    let notes = 0;
    materials.forEach(m => {
      if (m.material_type === 'Reference Link' || m.material_type === 'Other') books++;
      if (m.material_type === 'Notes' || m.material_type === 'Syllabus' || m.material_type === 'Question Paper' || m.material_type === 'Presentation') notes++;
    });

    const booksEl = document.getElementById('statReferenceBooks');
    if (booksEl) booksEl.textContent = books;

    const notesEl = document.getElementById('statLectureSlides');
    if (notesEl) notesEl.textContent = notes;
  }

  function renderMaterials(materials, isFiltered = false) {
    const container = document.getElementById('studyMaterialsContainer');
    if (!container) return;

    if (!materials || materials.length === 0) {
      container.innerHTML = `
        <div class="card" style="padding: 48px 24px; text-align: center; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px;">
          <div style="width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #ccfbf1; display: flex; align-items: center; justify-content: center; color: #0d9488;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: #0f172a;">${isFiltered ? 'No Materials for Selected Course' : 'No Study Materials Uploaded'}</h3>
          <p style="color: #64748b; max-width: 480px; margin: 0 auto; font-size: 14px;">
            ${isFiltered ? 'No materials match the selected course filter.' : 'Upload lecture slides, reference PDFs, or class notes to distribute to enrolled students.'}
          </p>
        </div>`;
      return;
    }

    const token = localStorage.getItem('token');

    let html = `
      <div style="overflow-x: auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13.5px;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left; color: #475569;">
              <th style="padding: 12px 16px;">Title &amp; Notes</th>
              <th style="padding: 12px 16px;">Course</th>
              <th style="padding: 12px 16px;">Type</th>
              <th style="padding: 12px 16px;">Upload Date</th>
              <th style="padding: 12px 16px;">Document File</th>
              <th style="padding: 12px 16px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>`;

    materials.forEach(m => {
      const dateStr = m.created_at ? new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
      const filename = m.original_filename || (m.file_path ? m.file_path.split('/').pop().split('\\').pop() : 'Document');

      const downloadUrl = `/api/study-materials/${m.material_id}/download?token=${encodeURIComponent(token)}`;
      const viewUrl = `/api/study-materials/${m.material_id}/view?token=${encodeURIComponent(token)}`;

      html += `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 14px 16px; max-width: 320px;">
            <div style="font-weight: 600; color: #0f172a;">${escapeHtml(m.title)}</div>
            ${m.description ? `<div style="font-size: 12px; color: #64748b; margin-top: 2px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(m.description)}</div>` : ''}
          </td>
          <td style="padding: 14px 16px;">
            <span style="display: inline-block; padding: 2px 6px; background: #ccfbf1; color: #0f766e; border-radius: 4px; font-weight: 600; font-size: 12px;">${escapeHtml(m.course_code || 'COURSE')}</span>
            <div style="font-size: 12px; color: #475569; margin-top: 2px;">${escapeHtml(m.course_name || '')}</div>
          </td>
          <td style="padding: 14px 16px;">
            <span style="display: inline-block; padding: 3px 8px; border-radius: 9999px; font-size: 11.5px; font-weight: 600; background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0;">
              ${escapeHtml(m.material_type || 'Notes')}
            </span>
          </td>
          <td style="padding: 14px 16px; color: #475569;">${escapeHtml(dateStr)}</td>
          <td style="padding: 14px 16px;">
            <div style="font-size: 12.5px; font-weight: 600; color: #0f172a; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(filename)}">
              ${escapeHtml(filename)}
            </div>
            <div class="btn-action-group" style="margin-top: 4px;">
              <a href="${viewUrl}" target="_blank" rel="noopener" class="btn-mat-action btn-mat-view" title="Preview document">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                <span>View</span>
              </a>
              <a href="${downloadUrl}" class="btn-mat-action btn-mat-download" title="Download document" download>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span>Download</span>
              </a>
            </div>
          </td>
          <td style="padding: 14px 16px; text-align: right;">
            <button type="button" class="btn-mat-action btn-mat-del" data-action="delete" data-id="${m.material_id}" data-title="${escapeHtml(m.title)}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              <span>Delete</span>
            </button>
          </td>
        </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Wire delete buttons
    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const title = btn.getAttribute('data-title');
        if (!confirm(`Are you sure you want to remove the study material "${title || id}"?`)) return;

        try {
          const res = await apiFetch(`/api/study-materials/${id}`, { method: 'DELETE' });
          if (res && res.success) {
            showToast('Study material removed successfully.', 'success');
            await loadMaterials();
          } else {
            showToast(res?.message || 'Failed to remove material.', 'error');
          }
        } catch (e) {
          showToast('Failed to delete material.', 'error');
        }
      });
    });
  }

  async function handleUploadMaterial(e) {
    e.preventDefault();

    const courseSelect = document.getElementById('modalMaterialCourse');
    const titleInput = document.getElementById('modalMaterialTitle');
    const typeSelect = document.getElementById('modalMaterialType');
    const fileInput = document.getElementById('modalMaterialFile');
    const descInput = document.getElementById('modalMaterialDesc');
    const submitBtn = document.getElementById('btnSubmitMaterialForm');

    const courseId = courseSelect?.value;
    const title = titleInput?.value?.trim();
    const materialType = typeSelect?.value || 'Notes';
    const desc = descInput?.value?.trim() || '';
    const file = fileInput?.files?.[0];

    if (!courseId) {
      showToast('Please select an assigned course.', 'error');
      return;
    }
    if (!title) {
      showToast('Please specify a document title.', 'error');
      return;
    }
    if (!file) {
      showToast('Please select a document file to upload.', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('File size exceeds the 10MB maximum limit.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('course_id', courseId);
    formData.append('title', title);
    formData.append('material_type', materialType);
    formData.append('description', desc);
    formData.append('file', file);

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading...';
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/study-materials', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const res = await response.json();

      if (response.ok && res.success) {
        showToast('Study material uploaded and published successfully!', 'success');
        document.getElementById('uploadMaterialModal').style.display = 'none';
        document.getElementById('uploadMaterialForm').reset();
        await loadMaterials();
      } else {
        showToast(res.message || 'Failed to upload study material.', 'error');
      }
    } catch (err) {
      console.error('Error uploading material:', err);
      showToast('Error uploading study material.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload & Publish';
      }
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
      // Fallback
    }
  }

  document.addEventListener('DOMContentLoaded', initStudyMaterial);
})();
