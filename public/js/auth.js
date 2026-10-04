/**
 * Client Authentication & Role-Based Navigation
 * Student Information Portal
 */

// ============================================================================
// Session Management
// ============================================================================

function getStoredUser() {
  const userStr = localStorage.getItem('user');
  try {
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    return null;
  }
}

function getStoredToken() {
  return localStorage.getItem('token');
}

function setSession(token, user) {
  if (token) localStorage.setItem('token', token);
  if (user) localStorage.setItem('user', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// ============================================================================
// Role Navigation
// ============================================================================

function getDashboardUrl(role, isProfileComplete) {
  if (isProfileComplete === false) {
    if (role === 'STUDENT') return '/pages/student/profile.html';
    if (role === 'TEACHER') return '/pages/teacher/profile.html';
  }
  switch (role) {
    case 'ADMIN':
      return '/pages/admin/dashboard.html';
    case 'TEACHER':
      return '/pages/teacher/dashboard.html';
    case 'STUDENT':
      return '/pages/student/dashboard.html';
    default:
      return '/login.html';
  }
}

function redirectToDashboard(role, isProfileComplete) {
  let targetRole = role;
  let targetComplete = isProfileComplete;
  if (typeof role === 'object' && role !== null) {
    targetRole = role.role;
    targetComplete = role.is_profile_complete;
  }
  const target = getDashboardUrl(targetRole, targetComplete);
  window.location.replace(target);
}

function logout() {
  clearSession();
  window.location.replace('/login.html');
}

// Global auth helper namespace
window.auth = {
  getUser: getStoredUser,
  getStoredUser: getStoredUser,
  getToken: getStoredToken,
  getStoredToken: getStoredToken,
  setSession: setSession,
  clearSession: clearSession,
  logout: logout,
  redirectToDashboard: redirectToDashboard,
  requireAuth: typeof requireAuth !== 'undefined' ? requireAuth : undefined
};

// ============================================================================
// Centralized Avatar Rendering System (Shared across all pages and roles)
// ============================================================================

function renderAvatarElement(element, photoUrl, initial, altText = 'User avatar') {
  if (!element) return;
  const cleanUrl = (photoUrl && typeof photoUrl === 'string') ? photoUrl.trim() : '';
  const cleanInitial = (initial || 'U').toString().trim().toUpperCase() || 'U';

  if (cleanUrl) {
    const existingImg = element.querySelector('img');

    // Rule 1: If img already exists and its src is the same, do nothing (no DOM mutation, no flicker)
    if (existingImg && (existingImg.getAttribute('src') === cleanUrl || existingImg.src.endsWith(cleanUrl))) {
      return;
    }

    // Rule 2: If img exists but src changed, update src and alt directly
    if (existingImg) {
      existingImg.alt = altText;
      existingImg.onerror = function () {
        this.onerror = null;
        element.innerHTML = '';
        element.textContent = cleanInitial;
      };
      existingImg.src = cleanUrl;
      return;
    }

    // Rule 3: No img exists but photoUrl exists: create one img element cleanly
    const img = document.createElement('img');
    img.src = cleanUrl;
    img.alt = altText;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.borderRadius = 'inherit';
    img.style.display = 'block';
    img.onerror = function () {
      this.onerror = null;
      element.innerHTML = '';
      element.textContent = cleanInitial;
    };

    element.innerHTML = '';
    element.appendChild(img);
  } else {
    // Rule 4: photoUrl is null or empty: display initials
    const existingImg = element.querySelector('img');
    if (existingImg || element.textContent !== cleanInitial) {
      element.innerHTML = '';
      element.textContent = cleanInitial;
    }
  }
}

function renderAllUserAvatars(user) {
  if (!user) return;
  const fName = user.first_name || '';
  const lName = user.last_name || '';
  const fullName = (fName + ' ' + lName).trim() || user.username || 'User';
  const initial = (fName ? fName[0] : (user.username ? user.username[0] : 'U')).toUpperCase();
  const photoUrl = (user.profile_photo_url && typeof user.profile_photo_url === 'string') ? user.profile_photo_url.trim() : null;

  // Header topbar avatars
  const topbarEls = document.querySelectorAll('#headerUserAvatar, #headerAdminAvatar, #headerTeacherAvatar, .header-avatar:not(#profileLargeAvatar):not(#modalAvatar), #topbarAvatar');
  topbarEls.forEach(el => renderAvatarElement(el, photoUrl, initial, fullName + ' avatar'));

  // Sidebar avatars
  const sidebarEls = document.querySelectorAll('#sidebarAvatar, #sidebarAdminAvatar, .sidebar-avatar, .sidebar-user-avatar');
  sidebarEls.forEach(el => renderAvatarElement(el, photoUrl, initial, fullName + ' avatar'));

  // Profile large avatar
  const largeEls = document.querySelectorAll('#profileLargeAvatar');
  largeEls.forEach(el => renderAvatarElement(el, photoUrl, initial, fullName + ' profile photo'));

  // Modal avatars
  const modalEls = document.querySelectorAll('#modalAvatar');
  modalEls.forEach(el => renderAvatarElement(el, photoUrl, initial, fullName + ' avatar'));
}

window.renderAvatarElement = renderAvatarElement;
window.renderAllUserAvatars = renderAllUserAvatars;
window.auth.renderAvatarElement = renderAvatarElement;
window.auth.renderAllUserAvatars = renderAllUserAvatars;

// Early synchronous hydration from cached user session to prevent any initials flash
(function syncCachedAvatarsImmediately() {
  try {
    const u = getStoredUser();
    if (!u) return;

    function applySync() {
      renderAllUserAvatars(u);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applySync, { once: true });
    } else {
      applySync();
    }
  } catch (e) {}
})();

// ============================================================================
// Route Protection Guard (For Dashboards)
// ============================================================================

async function requireAuth(expectedRole) {
  const token = getStoredToken();
  const storedUser = getStoredUser();

  // No token found: immediately redirect to login
  if (!token) {
    clearSession();
    window.location.replace('/login.html');
    return null;
  }

  try {
    // Verify token validity with backend
    const res = await apiRequest('/auth/me');

    if (!res.ok || !res.data || !res.data.success) {
      // Token is invalid or expired
      clearSession();
      window.location.replace('/login.html?reason=session_expired');
      return null;
    }

    const currentUser = res.data.data.user;
    setSession(token, currentUser);

    // Redirect to First Login setup if temporary password must be changed
    if (currentUser.must_change_password && !window.location.pathname.includes('first-login.html')) {
      window.location.replace('/pages/first-login.html');
      return null;
    }

    // Redirect incomplete Student or Teacher to their self-service profile page
    const isProfileComplete = currentUser.is_profile_complete === true || currentUser.is_profile_complete === 1 || currentUser.is_profile_complete === '1';
    if (!isProfileComplete) {
      const isStudentProfilePage = window.location.pathname.endsWith('/pages/student/profile.html') || window.location.pathname.endsWith('/profile.html');
      const isTeacherProfilePage = window.location.pathname.endsWith('/pages/teacher/profile.html') || window.location.pathname.endsWith('/profile.html');

      if (currentUser.role === 'STUDENT' && !isStudentProfilePage) {
        window.location.replace('/pages/student/profile.html');
        return null;
      }
      if (currentUser.role === 'TEACHER' && !isTeacherProfilePage) {
        window.location.replace('/pages/teacher/profile.html');
        return null;
      }
    }

    // Verify role authorization
    if (expectedRole && currentUser.role !== expectedRole) {
      // Redirect to the user's correct role dashboard
      redirectToDashboard(currentUser.role);
      return null;
    }

    // Populate dashboard DOM elements if present
    populateUserData(currentUser);

    // Bind logout button if present
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    }

    return currentUser;
  } catch (err) {
    console.error('Authentication verification error:', err);
    clearSession();
    window.location.replace('/login.html');
    return null;
  }
}

window.auth.requireAuth = requireAuth;

function populateUserData(user) {
  if (!user) return;

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;

  const textBindings = {
    'navUserName': fullName,
    'welcomeUserName': user.first_name || fullName,
    'userFullName': fullName,
    'userUsername': user.username,
    'userEmail': user.email || 'N/A',
    'userPhone': user.phone || 'N/A',
    'userRole': user.role,
    'userStatus': user.is_active ? 'Active' : 'Inactive',
    'userCreatedAt': typeof formatDate === 'function' ? formatDate(user.created_at) : (user.created_at || 'N/A')
  };

  Object.entries(textBindings).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });

  // Apply role badge styling if present
  const badgeEl = document.getElementById('userRoleBadge');
  if (badgeEl) {
    badgeEl.textContent = user.role;
    badgeEl.className = 'badge';
    if (user.role === 'ADMIN') badgeEl.classList.add('badge-admin');
    else if (user.role === 'TEACHER') badgeEl.classList.add('badge-teacher');
    else if (user.role === 'STUDENT') badgeEl.classList.add('badge-student');
  }
}

// ============================================================================
// Login Page Logic
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const errorAlert = document.getElementById('errorAlert');
  const errorMessage = document.getElementById('errorMessage');
  const togglePasswordBtn = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');
  const usernameInput = document.getElementById('username');
  const submitBtn = document.getElementById('submitBtn');
  const submitBtnText = document.getElementById('submitBtnText');
  const submitBtnSpinner = document.getElementById('submitBtnSpinner');

  // Check URL query parameters for notifications (e.g. session expired or password changed)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('reason') === 'session_expired') {
    showError('Your session has expired. Please sign in again.');
  }
  const msgParam = urlParams.get('msg');
  if (msgParam) {
    let successBox = document.getElementById('successAlert');
    if (!successBox && errorAlert && errorAlert.parentNode) {
      successBox = document.createElement('div');
      successBox.id = 'successAlert';
      successBox.className = 'alert alert-success';
      successBox.style.cssText = 'background:#f0fdf4; color:#15803d; border-left:4px solid #22c55e; padding:12px; border-radius:6px; margin-bottom:16px; font-size:14px; display:flex; align-items:center; gap:8px;';
      successBox.innerHTML = `<span>${msgParam}</span>`;
      errorAlert.parentNode.insertBefore(successBox, errorAlert);
    }
  }

  // Auto-redirect if already authenticated and on login page
  const isLoginPage = window.location.pathname.endsWith('login.html') || window.location.pathname === '/';
  if (isLoginPage && loginForm) {
    const token = getStoredToken();
    const user = getStoredUser();
    if (token && user && user.role) {
      if (user.must_change_password) {
        window.location.replace('/pages/first-login.html');
      } else {
        redirectToDashboard(user);
      }
      return;
    }
  }

  // Password Visibility Toggle
  if (togglePasswordBtn && passwordInput) {
    const eyeOpenIcon = document.getElementById('eyeOpenIcon');
    const eyeOffIcon = document.getElementById('eyeOffIcon');

    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';

      togglePasswordBtn.setAttribute('aria-pressed', String(isPassword));
      togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');

      if (eyeOpenIcon && eyeOffIcon) {
        if (isPassword) {
          eyeOpenIcon.classList.add('hidden');
          eyeOffIcon.classList.remove('hidden');
        } else {
          eyeOpenIcon.classList.remove('hidden');
          eyeOffIcon.classList.add('hidden');
        }
      }
    });
  }

  // Handle Login Form Submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = usernameInput ? usernameInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      if (!username || !password) {
        showError('Please enter both username and password.');
        if (!username && usernameInput) usernameInput.focus();
        else if (!password && passwordInput) passwordInput.focus();
        return;
      }

      setLoading(true);
      hideError();

      try {
        const result = await apiRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password })
        });

        if (result.ok && result.data && result.data.success && result.data.data) {
          const { token, user } = result.data.data;
          setSession(token, user);
          if (user.must_change_password) {
            window.location.replace('/pages/first-login.html');
          } else {
            redirectToDashboard(user);
          }
        } else {
          const message = (result.data && result.data.message)
            ? result.data.message
            : 'Invalid username or password. Please try again.';
          showError(message);
          setLoading(false);
          if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
          }
        }
      } catch (err) {
        showError('An unexpected connection error occurred. Please try again.');
        setLoading(false);
      }
    });
  }

  // Handle Biometric Face Login Button
  const btnFaceLogin = document.getElementById('btnFaceLogin');
  if (btnFaceLogin) {
    btnFaceLogin.addEventListener('click', () => {
      hideError();
      if (window.FaceAuthModal) {
        window.FaceAuthModal.open({
          mode: 'login'
        });
      } else {
        showError('Face authentication service is currently loading or unavailable.');
      }
    });
  }

  function setLoading(isLoading) {
    if (submitBtn) {
      submitBtn.disabled = isLoading;
    }
    if (submitBtnText) {
      submitBtnText.textContent = isLoading ? 'Signing in...' : 'Sign In';
    }
    if (submitBtnSpinner) {
      if (isLoading) {
        submitBtnSpinner.classList.remove('hidden');
      } else {
        submitBtnSpinner.classList.add('hidden');
      }
    }
  }

  function showError(msg) {
    if (errorMessage) {
      errorMessage.textContent = msg;
    }
    if (errorAlert) {
      errorAlert.classList.remove('hidden');
    }
  }

  function hideError() {
    if (errorMessage) {
      errorMessage.textContent = '';
    }
    if (errorAlert) {
      errorAlert.classList.add('hidden');
    }
  }
});
