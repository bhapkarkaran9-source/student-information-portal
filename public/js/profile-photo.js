/**
 * Reusable Profile Photo Management Component
 * Student Information Portal — Cross-Role Support (STUDENT, TEACHER, ADMIN)
 * Canonical API:
 *   POST   /api/profile/photo
 *   DELETE /api/profile/photo
 *   GET    /api/profile/me
 */

(function () {
  'use strict';

  const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
  const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
  const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

  let selectedFile = null;

  function getStoredToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  }

  function getStoredUser() {
    try {
      const u = localStorage.getItem('user') || sessionStorage.getItem('user');
      return u ? JSON.parse(u) : {};
    } catch (e) {
      return {};
    }
  }

  function updateStoredUser(updates) {
    try {
      const u = Object.assign({}, getStoredUser(), updates);
      localStorage.setItem('user', JSON.stringify(u));
      sessionStorage.setItem('user', JSON.stringify(u));
      return u;
    } catch (e) {
      return updates;
    }
  }

  function showToast(message, type = 'success') {
    let container = document.getElementById('toastContainer') || document.getElementById('adminSharedToastContainer');
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
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3500);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  const ProfilePhotoManager = {
    modalEl: null,
    fileInput: null,
    dropzoneEl: null,
    previewContainer: null,
    previewImg: null,
    fileMetaEl: null,
    errorBanner: null,
    btnUpload: null,
    btnRemove: null,
    btnCancel: null,

    init() {
      this.cacheDom();
      this.bindTriggers();
      this.bindModalEvents();
      this.syncRemoveButtonState();

      window.addEventListener('user-profile-updated', () => {
        this.syncRemoveButtonState();
      });
    },

    cacheDom() {
      this.modalEl = document.getElementById('photoUploadModal');
      if (!this.modalEl) return;

      this.fileInput = document.getElementById('photoFileInput');
      this.dropzoneEl = document.getElementById('photoDropzone');
      this.previewContainer = document.getElementById('photoPreviewContainer');
      this.previewImg = document.getElementById('photoPreviewImg');
      this.fileMetaEl = document.getElementById('photoFileMeta');
      this.errorBanner = document.getElementById('photoModalError');
      this.btnUpload = document.getElementById('btnConfirmPhotoUpload');
      this.btnRemove = document.getElementById('btnRemovePhoto');
      this.btnCancel = document.getElementById('btnCancelPhotoUpload');
    },

    bindTriggers() {
      // Both #btnAvatarEdit and #btnChangePhoto trigger modal
      const editTriggers = document.querySelectorAll('#btnAvatarEdit, #btnChangePhoto, [data-trigger-photo-modal]');
      editTriggers.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.openModal();
        });
      });
    },

    bindModalEvents() {
      if (!this.modalEl) return;

      // Close handlers
      this.modalEl.querySelectorAll('[data-close-modal="photoUploadModal"], .modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => this.closeModal());
      });

      if (this.btnCancel) {
        this.btnCancel.addEventListener('click', () => this.closeModal());
      }

      // Close on backdrop click
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) {
          this.closeModal();
        }
      });

      // Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !this.modalEl.classList.contains('hidden')) {
          this.closeModal();
        }
      });

      // File input change
      if (this.fileInput) {
        this.fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            this.handleFileSelected(e.target.files[0]);
          }
        });
      }

      // Dropzone click opens picker
      if (this.dropzoneEl) {
        this.dropzoneEl.addEventListener('click', () => {
          if (this.fileInput) this.fileInput.click();
        });

        // Drag and drop events
        ['dragenter', 'dragover'].forEach(eventName => {
          this.dropzoneEl.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.dropzoneEl.classList.add('drag-over');
          });
        });

        ['dragleave', 'drop'].forEach(eventName => {
          this.dropzoneEl.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.dropzoneEl.classList.remove('drag-over');
          });
        });

        this.dropzoneEl.addEventListener('drop', (e) => {
          const dt = e.dataTransfer;
          if (dt && dt.files && dt.files[0]) {
            this.handleFileSelected(dt.files[0]);
          }
        });
      }

      // Upload button
      if (this.btnUpload) {
        this.btnUpload.addEventListener('click', () => this.submitUpload());
      }

      // Remove button
      if (this.btnRemove) {
        this.btnRemove.addEventListener('click', () => this.submitRemove());
      }
    },

    openModal() {
      this.resetModal();
      this.syncRemoveButtonState();
      if (this.modalEl) {
        this.modalEl.classList.remove('hidden');
        this.modalEl.setAttribute('aria-hidden', 'false');
      }
    },

    closeModal() {
      if (this.modalEl) {
        this.modalEl.classList.add('hidden');
        this.modalEl.setAttribute('aria-hidden', 'true');
      }
      this.resetModal();
    },

    resetModal() {
      selectedFile = null;
      if (this.fileInput) this.fileInput.value = '';
      if (this.previewContainer) this.previewContainer.classList.add('hidden');
      if (this.dropzoneEl) this.dropzoneEl.classList.remove('hidden');
      if (this.previewImg) this.previewImg.src = '';
      if (this.fileMetaEl) this.fileMetaEl.textContent = '';
      if (this.btnUpload) {
        this.btnUpload.disabled = true;
        this.btnUpload.textContent = 'Upload Photo';
      }
      this.hideError();
    },

    showError(msg) {
      if (this.errorBanner) {
        this.errorBanner.textContent = msg;
        this.errorBanner.classList.remove('hidden');
      } else {
        showToast(msg, 'error');
      }
      if (this.btnUpload) this.btnUpload.disabled = true;
    },

    hideError() {
      if (this.errorBanner) {
        this.errorBanner.textContent = '';
        this.errorBanner.classList.add('hidden');
      }
    },

    syncRemoveButtonState() {
      if (!this.btnRemove) return;
      const user = getStoredUser();
      if (user && user.profile_photo_url) {
        this.btnRemove.classList.remove('hidden');
        this.btnRemove.disabled = false;
      } else {
        this.btnRemove.classList.add('hidden');
        this.btnRemove.disabled = true;
      }
    },

    handleFileSelected(file) {
      this.hideError();

      if (!file) return;

      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const mime = (file.type || '').toLowerCase();

      // Format validation
      if (!ALLOWED_EXTS.includes(ext) || !ALLOWED_MIMES.includes(mime)) {
        this.showError('Invalid file format. Allowed formats: JPG, JPEG, PNG, WEBP.');
        return;
      }

      // Size validation (Max 5MB)
      if (file.size > MAX_SIZE_BYTES) {
        this.showError(`File size exceeds 5 MB maximum limit (${formatBytes(file.size)}).`);
        return;
      }

      selectedFile = file;

      // Render image preview
      const reader = new FileReader();
      reader.onload = (e) => {
        if (this.previewImg) {
          this.previewImg.src = e.target.result;
        }
        if (this.fileMetaEl) {
          this.fileMetaEl.textContent = `${file.name} (${formatBytes(file.size)})`;
        }
        if (this.previewContainer) {
          this.previewContainer.classList.remove('hidden');
        }
        if (this.dropzoneEl) {
          this.dropzoneEl.classList.add('hidden');
        }
        if (this.btnUpload) {
          this.btnUpload.disabled = false;
        }
      };
      reader.readAsDataURL(file);
    },

    async submitUpload() {
      if (!selectedFile) {
        this.showError('Please choose an image file to upload.');
        return;
      }

      const token = getStoredToken();
      if (!token) {
        showToast('You must be logged in to upload a photo.', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('photo', selectedFile);

      if (this.btnUpload) {
        this.btnUpload.disabled = true;
        this.btnUpload.textContent = 'Uploading...';
      }

      try {
        const response = await fetch('/api/profile/photo', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token
          },
          body: formData
        });

        const json = await response.json().catch(() => ({}));

        if (response.ok && json.success) {
          const photoUrl = json.data?.profile_photo_url || json.profile_photo_url;
          const updatedUser = updateStoredUser({ profile_photo_url: photoUrl });

          // Preload new image
          if (photoUrl) {
            const preloader = new Image();
            preloader.src = photoUrl;
          }

          // Update all avatars immediately
          if (typeof window.renderAllUserAvatars === 'function') {
            window.renderAllUserAvatars(updatedUser);
          }

          // Broadcast reactive update across all avatar components
          window.dispatchEvent(new CustomEvent('user-profile-updated', {
            detail: { user: updatedUser }
          }));

          this.closeModal();
          showToast(json.message || 'Profile photo updated successfully.', 'success');
        } else {
          const errorMsg = json.message || 'Failed to upload profile photo.';
          this.showError(errorMsg);
          if (this.btnUpload) {
            this.btnUpload.disabled = false;
            this.btnUpload.textContent = 'Upload Photo';
          }
        }
      } catch (err) {
        console.error('Error during photo upload:', err);
        this.showError('Network error while uploading photo. Please try again.');
        if (this.btnUpload) {
          this.btnUpload.disabled = false;
          this.btnUpload.textContent = 'Upload Photo';
        }
      }
    },

    async submitRemove() {
      const token = getStoredToken();
      if (!token) {
        showToast('You must be logged in to remove a photo.', 'error');
        return;
      }

      if (this.btnRemove) {
        this.btnRemove.disabled = true;
        this.btnRemove.textContent = 'Removing...';
      }

      try {
        const response = await fetch('/api/profile/photo', {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          }
        });

        const json = await response.json().catch(() => ({}));

        if (response.ok && json.success) {
          const updatedUser = updateStoredUser({ profile_photo_url: null });

          // Update all avatars immediately to show initials
          if (typeof window.renderAllUserAvatars === 'function') {
            window.renderAllUserAvatars(updatedUser);
          }

          // Broadcast reactive update
          window.dispatchEvent(new CustomEvent('user-profile-updated', {
            detail: { user: updatedUser }
          }));

          this.closeModal();
          showToast(json.message || 'Profile photo removed successfully.', 'success');
        } else {
          const errorMsg = json.message || 'Failed to remove profile photo.';
          this.showError(errorMsg);
          if (this.btnRemove) {
            this.btnRemove.disabled = false;
            this.btnRemove.textContent = 'Remove Current Photo';
          }
        }
      } catch (err) {
        console.error('Error during photo removal:', err);
        this.showError('Network error while removing photo.');
        if (this.btnRemove) {
          this.btnRemove.disabled = false;
          this.btnRemove.textContent = 'Remove Current Photo';
        }
      }
    }
  };

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ProfilePhotoManager.init());
  } else {
    ProfilePhotoManager.init();
  }

  window.ProfilePhotoManager = ProfilePhotoManager;
})();
