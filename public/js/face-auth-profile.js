/**
 * Face Authentication Profile Card Controller
 * Handles status synchronization, registration, testing, and credential removal
 * on user profile and security settings pages.
 */

(function () {
  'use strict';

  async function loadFaceAuthStatus() {
    const badge = document.getElementById('faceAuthStatusBadge');
    const infoRow = document.getElementById('faceAuthInfoRow');
    const dateEl = document.getElementById('faceAuthRegisteredDate');
    const livenessMethodEl = document.getElementById('faceAuthLivenessMethod');
    const btnRegister = document.getElementById('btnRegisterFace');
    const btnTest = document.getElementById('btnTestFace');
    const btnRemove = document.getElementById('btnRemoveFace');

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const res = await fetch('/api/face-auth/status', {
        headers: { 'Authorization': 'Bearer ' + token }
      });

      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const data = json.data;
        if (data.is_registered) {
          if (badge) {
            badge.textContent = 'Registered ✓';
            badge.style.background = '#dcfce7';
            badge.style.color = '#166534';
          }
          if (infoRow && dateEl) {
            infoRow.classList.remove('hidden');
            const d = new Date(data.registered_at);
            dateEl.textContent = isNaN(d.getTime()) ? data.registered_at : d.toLocaleDateString('en-GB', {
              day: '2-digit', month: '2-digit', year: 'numeric'
            });
          }
          if (livenessMethodEl && data.liveness_method) {
            const label = (data.liveness_method.includes('EAR') || data.liveness_method.includes('BLINK'))
              ? 'Active EAR Eye Blink'
              : data.liveness_method;
            livenessMethodEl.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${label}`;
          }
          if (btnRegister) btnRegister.classList.add('hidden');
          if (btnTest) btnTest.classList.remove('hidden');
          if (btnRemove) btnRemove.classList.remove('hidden');
        } else {
          if (badge) {
            badge.textContent = 'Not Registered';
            badge.style.background = '#f1f5f9';
            badge.style.color = '#475569';
          }
          if (infoRow) infoRow.classList.add('hidden');
          if (btnRegister) btnRegister.classList.remove('hidden');
          if (btnTest) btnTest.classList.add('hidden');
          if (btnRemove) btnRemove.classList.add('hidden');
        }
      }
    } catch (err) {
      console.error('[FaceAuthProfile] Error fetching status:', err);
      if (badge) badge.textContent = 'Unavailable';
    }
  }

  function attachListeners() {
    const btnRegister = document.getElementById('btnRegisterFace');
    const btnTest = document.getElementById('btnTestFace');
    const btnRemove = document.getElementById('btnRemoveFace');

    if (btnRegister) {
      btnRegister.onclick = () => {
        if (window.FaceAuthModal) {
          window.FaceAuthModal.open({
            mode: 'register',
            onComplete: () => {
              loadFaceAuthStatus();
            }
          });
        }
      };
    }

    if (btnTest) {
      btnTest.onclick = () => {
        if (window.FaceAuthModal) {
          window.FaceAuthModal.open({
            mode: 'test'
          });
        }
      };
    }

    if (btnRemove) {
      btnRemove.onclick = async () => {
        if (!confirm('Are you sure you want to remove your registered face credential?\nYour account password and profile will remain completely intact.')) {
          return;
        }

        const token = localStorage.getItem('token');
        try {
          const res = await fetch('/api/face-auth/remove', {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
          });
          const json = await res.json();
          if (res.ok && json.success) {
            alert('Face credential removed successfully.');
            loadFaceAuthStatus();
          } else {
            alert(json.message || 'Failed to remove face credential.');
          }
        } catch (err) {
          alert('Network error while removing face credential: ' + err.message);
        }
      };
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadFaceAuthStatus();
    attachListeners();
  });

  window.FaceAuthProfile = {
    refresh: loadFaceAuthStatus
  };

})();
