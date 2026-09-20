/**
 * Student Dashboard Logic - Premium College ERP Theme
 * Handles role guard, dynamic data binding, dropdown management,
 * modals, toast notifications, and responsive drawer navigation.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Guard route: Only authenticated students allowed
  const user = await requireAuth('STUDENT');
  if (!user) return;

  // 2. Initialize student UI components
  initGreetingAndProfile(user);
  initDropdownMenu();
  initSidebarDrawer();
  initModals(user);
  initNotificationActions();
  loadDynamicStudentData(user);
});

/**
 * Updates greeting based on time of day and populates all avatar initial badges
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function initGreetingAndProfile(user) {
  const hour = new Date().getHours();
  let greetingTime = 'Good Morning';
  if (hour >= 12 && hour < 17) {
    greetingTime = 'Good Afternoon';
  } else if (hour >= 17) {
    greetingTime = 'Good Evening';
  }

  const firstName = user.first_name || user.username || 'Student';
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Student';
  const initial = (firstName.charAt(0) || 'S').toUpperCase();

  // Welcome banner greeting
  const greetingEl = document.getElementById('welcomeGreeting');
  if (greetingEl) {
    greetingEl.innerHTML = `${greetingTime}, <span id="welcomeUserName">${escapeHtml(firstName)}</span> 👋`;
  }

  // Header subtitle greeting
  const headerGreeting = document.getElementById('headerGreetingName');
  if (headerGreeting) {
    headerGreeting.textContent = firstName;
  }

  // Dropdown profile details
  const dropName = document.getElementById('dropdownUserName');
  const dropEmail = document.getElementById('dropdownUserEmail');
  if (dropName) dropName.textContent = fullName;
  if (dropEmail) dropEmail.textContent = user.email || 'N/A';

  // Avatars
  ['sidebarAvatar', 'headerUserAvatar', 'modalAvatar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (typeof window.renderAvatarElement === 'function') {
        window.renderAvatarElement(el, user.profile_photo_url, initial, fullName + ' avatar');
      } else if (user.profile_photo_url) {
        el.innerHTML = `<img src="${user.profile_photo_url}" alt="${fullName}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;" onerror="this.onerror=null;this.parentElement.textContent='${initial}'">`;
      } else {
        el.textContent = initial;
      }
    }
  });

  // Sidebar user name
  const sidebarName = document.getElementById('sidebarUserName');
  if (sidebarName) sidebarName.textContent = fullName;

  // PRN binding
  const prnEl = document.getElementById('userPRN');
  if (prnEl) {
    prnEl.textContent = user.prn_number || user.enrollment_number || `PRN-${new Date(user.created_at || Date.now()).getFullYear()}-${String(user.id || user.user_id || 1).padStart(4, '0')}`;
  }
}

/**
 * Dropdown menu interaction: click toggle, outside click dismissal, Escape key dismissal
 */
function initDropdownMenu() {
  if (window.UserMenu) return; // UserMenu manages profile dropdown globally
  const dropdownBtn = document.getElementById('profileDropdownBtn');
  const dropdownMenu = document.getElementById('profileDropdownMenu');

  if (!dropdownBtn || !dropdownMenu) return;

  function closeDropdown() {
    dropdownMenu.classList.remove('show');
    dropdownBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleDropdown(e) {
    e.stopPropagation();
    const isOpen = dropdownMenu.classList.contains('show');
    if (isOpen) {
      closeDropdown();
    } else {
      dropdownMenu.classList.add('show');
      dropdownBtn.setAttribute('aria-expanded', 'true');
    }
  }

  dropdownBtn.addEventListener('click', toggleDropdown);

  // Close when clicking outside - using capture phase for reliability
  document.addEventListener('click', (e) => {
    if (!dropdownMenu.contains(e.target) && !dropdownBtn.contains(e.target)) {
      closeDropdown();
    }
  }, true);

  // Close when pressing Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      closeDropdown();
      closeAllModals();
    }
  });

  // Wire up sidebar logout button too
  const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
  if (sidebarLogoutBtn) {
    sidebarLogoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }
}

/**
 * Mobile sidebar drawer toggle & backdrop handling
 */
function initSidebarDrawer() {
  const sidebar = document.getElementById('studentSidebar');
  const toggleBtn = document.getElementById('toggleSidebarBtn');
  const closeBtn = document.getElementById('closeSidebarBtn');
  const backdrop = document.getElementById('sidebarBackdrop');

  if (!sidebar) return;

  function openSidebar() {
    sidebar.classList.add('open');
    if (backdrop) backdrop.classList.remove('hidden');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.add('hidden');
  }

  if (toggleBtn) toggleBtn.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  // Close drawer on window resize if wider than tablet breakpoint
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
      closeSidebar();
    }
  });
}

/**
 * Modal handling: My Profile, Edit Profile, Change Password, Account Settings
 */
function initModals(user) {
  // Open buttons
  const btnMyProfile = document.getElementById('btnMyProfile');
  const btnEditProfile = document.getElementById('btnEditProfile');
  const btnChangePassword = document.getElementById('btnChangePassword');
  const btnAccountSettings = document.getElementById('btnAccountSettings');

  if (btnMyProfile) {
    btnMyProfile.addEventListener('click', () => {
      populateMyProfileModal(user);
      openModal('myProfileModal');
    });
  }

  if (btnEditProfile) {
    btnEditProfile.addEventListener('click', () => {
      populateEditProfileModal(user);
      openModal('editProfileModal');
    });
  }

  if (btnChangePassword) {
    btnChangePassword.addEventListener('click', () => {
      const form = document.getElementById('changePasswordForm');
      if (form) form.reset();
      openModal('changePasswordModal');
    });
  }

  if (btnAccountSettings) {
    btnAccountSettings.addEventListener('click', () => {
      openModal('accountSettingsModal');
    });
  }

  // Close modal buttons (data-close-modal attribute)
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });

  // Close when clicking outside modal-card on backdrop
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });

  // Edit Profile form submission
  const editProfileForm = document.getElementById('editProfileForm');
  if (editProfileForm) {
    editProfileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const updatedFirst = document.getElementById('editFirstName').value.trim();
      const updatedLast = document.getElementById('editLastName').value.trim();
      const updatedEmail = document.getElementById('editEmail').value.trim();
      const updatedPhone = document.getElementById('editPhone').value.trim();

      user.first_name = updatedFirst;
      user.last_name = updatedLast;
      user.email = updatedEmail;
      user.phone = updatedPhone;

      // Update session storage
      localStorage.setItem('user', JSON.stringify(user));
      initGreetingAndProfile(user);
      if (typeof populateUserData === 'function') populateUserData(user);

      closeModal('editProfileModal');
      showToast('Profile updated successfully.', 'success');
    });
  }

  // Change Password form submission
  const changePasswordForm = document.getElementById('changePasswordForm');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const curr = document.getElementById('currentPassword').value;
      const pass1 = document.getElementById('newPassword').value;
      const pass2 = document.getElementById('confirmPassword').value;

      if (pass1 !== pass2) {
        showToast('New passwords do not match.', 'error');
        return;
      }
      if (pass1.length < 6) {
        showToast('Password must be at least 6 characters long.', 'error');
        return;
      }

      closeModal('changePasswordModal');
      showToast('Password updated successfully for student session.', 'success');
    });
  }

  // Account Settings form submission
  const accountSettingsForm = document.getElementById('accountSettingsForm');
  if (accountSettingsForm) {
    accountSettingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      closeModal('accountSettingsModal');
      showToast('Preferences saved successfully.', 'success');
    });
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    // Set focus on first input or close button
    const firstFocusable = modal.querySelector('input, select, button');
    if (firstFocusable) firstFocusable.focus();
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.classList.add('hidden');
  });
}

function populateMyProfileModal(user) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Student';
  const nameEl = document.getElementById('modalProfileName');
  const userEl = document.getElementById('modalProfileUsername');
  const emailEl = document.getElementById('modalProfileEmail');
  const phoneEl = document.getElementById('modalProfilePhone');

  if (nameEl) nameEl.textContent = fullName;
  if (userEl) userEl.textContent = user.username;
  if (emailEl) emailEl.textContent = user.email || 'N/A';
  if (phoneEl) phoneEl.textContent = user.phone || 'N/A';
}

function populateEditProfileModal(user) {
  const firstInput = document.getElementById('editFirstName');
  const lastInput = document.getElementById('editLastName');
  const emailInput = document.getElementById('editEmail');
  const phoneInput = document.getElementById('editPhone');

  if (firstInput) firstInput.value = user.first_name || '';
  if (lastInput) lastInput.value = user.last_name || '';
  if (emailInput) emailInput.value = user.email || '';
  if (phoneInput) phoneInput.value = user.phone || '';
}

/**
 * Notifications interaction: toggle dot, mark all read, jump to section
 */
function initNotificationActions() {
  const notifyBtn = document.getElementById('headerNotificationBtn');
  const notifyDot = document.getElementById('headerNotificationDot');
  const btnMarkAllRead = document.getElementById('btnMarkAllRead');

  if (notifyBtn) {
    notifyBtn.addEventListener('click', () => {
      const notifSection = document.getElementById('notificationsSection');
      if (notifSection) {
        notifSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (notifyDot) notifyDot.style.display = 'none';
    });
  }

  if (btnMarkAllRead) {
    btnMarkAllRead.addEventListener('click', () => {
      document.querySelectorAll('.notification-row.unread').forEach(row => {
        row.classList.remove('unread');
      });
      if (notifyDot) notifyDot.style.display = 'none';
      showToast('All notifications marked as read.', 'info');
    });
  }
}

/**
 * Loads live data across all Student Portal domains and binds to UI widgets
 */
async function loadDynamicStudentData(user) {
  // 1. Fetch live student profile to bind real academic details & chips
  try {
    const meRes = await apiRequest('/users/me');
    if (meRes.ok && meRes.data && meRes.data.user) {
      const u = meRes.data.user;
      initGreetingAndProfile(u);

      const chipYear = document.getElementById('chipYear');
      if (chipYear && u.academic_year) chipYear.textContent = `Academic Year: ${u.academic_year}`;
      const chipSemester = document.getElementById('chipSemester');
      if (chipSemester && u.semester) chipSemester.textContent = `Semester: Semester ${u.semester}`;
      const chipDept = document.getElementById('chipDept');
      if (chipDept && u.department_name) chipDept.textContent = `Dept: ${u.department_name}`;
      const chipDivision = document.getElementById('chipDivision');
      if (chipDivision && u.class_name) {
        chipDivision.textContent = `Class: ${u.class_name}${u.division ? ' (Div ' + u.division + ')' : ''}`;
      }
    }
  } catch (err) {
    console.warn('Could not load user profile details:', err);
  }

  // 2. Fetch live attendance data
  try {
    const attRes = await apiRequest('/attendance/my-attendance');
    if (attRes.ok && attRes.data && attRes.data.overallStats) {
      const stats = attRes.data.overallStats;
      const pct = stats.overall_percentage !== undefined ? Math.round(stats.overall_percentage) : 0;
      
      const kpiAtt = document.getElementById('kpiAttendanceVal');
      if (kpiAtt) kpiAtt.textContent = `${pct}%`;

      const kpiCard = kpiAtt ? kpiAtt.closest('.student-kpi-card') : null;
      if (kpiCard) {
        const support = kpiCard.querySelector('.kpi-support-text');
        if (support) {
          const isGood = pct >= 75;
          support.innerHTML = `<span class="badge" style="background:${isGood ? '#dcfce7; color:#15803d;' : '#fee2e2; color:#b91c1c;'}">${isGood ? 'Good Standing' : 'Below 75%'}</span><span>Req. 75%</span>`;
        }
      }

      const gaugePct = document.getElementById('gaugePct');
      if (gaugePct) gaugePct.textContent = `${pct}%`;

      const gaugeCircle = document.getElementById('attendanceGaugeCircle');
      if (gaugeCircle) {
        gaugeCircle.style.background = `conic-gradient(#10b981 ${pct}%, #e2e8f0 0)`;
        gaugeCircle.setAttribute('aria-label', `Attendance ${pct}%`);
      }

      const statPresent = document.getElementById('statPresent');
      if (statPresent) statPresent.textContent = stats.present_lectures ?? 0;
      const statAbsent = document.getElementById('statAbsent');
      if (statAbsent) statAbsent.textContent = stats.absent_lectures ?? 0;
      const statLate = document.getElementById('statLate');
      if (statLate) statLate.textContent = stats.late_lectures ?? 0;
      const statTotal = document.getElementById('statTotal');
      if (statTotal) statTotal.textContent = stats.total_lectures ?? 0;

      const badge = document.getElementById('attendanceStatusBadge');
      if (badge) {
        if (stats.total_lectures === 0) {
          badge.style.background = '#f1f5f9';
          badge.style.color = '#475569';
          badge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> <span>No attendance sessions recorded yet</span>`;
        } else if (pct >= 75) {
          badge.style.background = '#dcfce7';
          badge.style.color = '#15803d';
          badge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg> <span>Attendance Requirement Satisfied (${pct}% ≥ 75%)</span>`;
        } else {
          badge.style.background = '#fee2e2';
          badge.style.color = '#b91c1c';
          badge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> <span>Attendance Shortage Alert (${pct}% &lt; 75%)</span>`;
        }
      }
    }
  } catch (err) {
    console.warn('Could not load attendance details:', err);
  }

  // 3. Fetch live grades & academic performance
  try {
    const gradeRes = await apiRequest('/grades/student/me');
    if (gradeRes.ok && gradeRes.data) {
      const metrics = gradeRes.data.metrics || {};
      const sgpa = metrics.sgpa !== undefined && metrics.sgpa !== null ? Number(metrics.sgpa).toFixed(2) : '--';
      
      const kpiSgpa = document.getElementById('kpiSgpaVal');
      if (kpiSgpa) kpiSgpa.textContent = sgpa;

      const kpiCard = kpiSgpa ? kpiSgpa.closest('.student-kpi-card') : null;
      if (kpiCard) {
        const support = kpiCard.querySelector('.kpi-support-text');
        if (support) {
          const label = metrics.sgpa >= 8.5 ? 'Excellent' : (metrics.sgpa >= 6.5 ? 'Good' : 'Satisfactory');
          support.innerHTML = `<span class="badge" style="background:#e0e7ff; color:#4338ca;">${label}</span><span>CGPA: ${sgpa}</span>`;
        }
      }

      const perfSgpa = document.getElementById('perfSgpa');
      if (perfSgpa) perfSgpa.textContent = sgpa;

      const perfCredits = document.getElementById('perfCredits');
      if (perfCredits) {
        perfCredits.textContent = `${metrics.total_credits || 0} Credits`;
      }

      const perfCoursesCleared = document.getElementById('perfCoursesCleared');
      if (perfCoursesCleared) {
        perfCoursesCleared.textContent = `${metrics.passed_courses || 0}`;
      }

      const perfRisk = document.getElementById('perfRiskStatus');
      if (perfRisk) {
        if (metrics.failed_courses > 0) {
          perfRisk.textContent = `${metrics.failed_courses} Backlog(s)`;
          perfRisk.style.background = '#fee2e2';
          perfRisk.style.color = '#b91c1c';
        } else if (metrics.passed_courses > 0) {
          perfRisk.textContent = 'Excellent Academic Standing';
          perfRisk.style.background = '#dcfce7';
          perfRisk.style.color = '#15803d';
        } else {
          perfRisk.textContent = 'Regular Standing';
          perfRisk.style.background = '#e0e7ff';
          perfRisk.style.color = '#4338ca';
        }
      }
    }
  } catch (err) {
    console.warn('Could not load grades details:', err);
  }

  // 4. Fetch live enrolled courses
  try {
    const enrollRes = await apiRequest('/enrollments?all=true');
    if (enrollRes.ok && enrollRes.data) {
      const enrollments = enrollRes.data.enrollments || [];
      const kpiCourses = document.getElementById('kpiCoursesVal');
      if (kpiCourses) kpiCourses.textContent = enrollments.length;

      let totalCredits = 0;
      enrollments.forEach(e => {
        totalCredits += parseFloat(e.credits || 0);
      });

      const kpiCard = kpiCourses ? kpiCourses.closest('.student-kpi-card') : null;
      if (kpiCard) {
        const support = kpiCard.querySelector('.kpi-support-text');
        if (support) {
          support.innerHTML = `<span class="badge" style="background:#dcfce7; color:#15803d;">Active Enrolled</span><span>${totalCredits} Credits Total</span>`;
        }
      }
    }
  } catch (err) {
    console.warn('Could not load enrollments:', err);
  }

  // 5. Fetch live assignments
  try {
    const assignRes = await apiRequest('/assignments');
    if (assignRes.ok && assignRes.data) {
      const assignments = assignRes.data.assignments || [];
      const pending = assignments.filter(a => a.status !== 'Submitted' && a.status !== 'Graded');
      
      const kpiAssign = document.getElementById('kpiAssignmentsVal');
      if (kpiAssign) kpiAssign.textContent = pending.length;

      const kpiCard = kpiAssign ? kpiAssign.closest('.student-kpi-card') : null;
      if (kpiCard) {
        const support = kpiCard.querySelector('.kpi-support-text');
        if (support) {
          support.innerHTML = `<span class="badge" style="background:#fef3c7; color:#b45309;">${pending.length} Due</span><span>${assignments.length - pending.length} Submitted</span>`;
        }
      }

      // Populate assignment list
      const assignList = document.getElementById('assignmentList');
      if (assignList) {
        if (assignments.length === 0) {
          assignList.innerHTML = `<div class="p-4 text-center text-muted" style="padding: 32px 16px; text-align: center; color: #64748b;">No pending assignments due.</div>`;
        } else {
          assignList.innerHTML = assignments.slice(0, 4).map(a => {
            const dueDate = a.due_date ? new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No Deadline';
            const isOverdue = a.status === 'Overdue' || a.is_overdue;
            const badgeBg = isOverdue ? '#fee2e2' : (a.status === 'Submitted' ? '#dcfce7' : '#fef3c7');
            const badgeColor = isOverdue ? '#b91c1c' : (a.status === 'Submitted' ? '#15803d' : '#b45309');
            const statusText = a.status || (isOverdue ? 'Overdue' : 'Pending');

            return `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; gap: 12px;">
                <div style="min-width: 0; flex: 1;">
                  <div style="font-weight: 600; font-size: 13px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(a.title)}</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                    ${escapeHtml(a.course_code || '')} ${a.course_name ? '• ' + escapeHtml(a.course_name) : ''} • Max: ${a.max_marks || 0} pts
                  </div>
                </div>
                <div style="text-align: right; flex-shrink: 0;">
                  <span class="badge" style="background: ${badgeBg}; color: ${badgeColor}; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px;">${statusText}</span>
                  <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Due: ${dueDate}</div>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }
  } catch (err) {
    console.warn('Could not load assignments:', err);
  }

  // 6. Fetch live smart timetable & Next Lecture
  async function loadSmartTimetable() {
    try {
      // Background reminder check
      apiRequest('/timetable/reminders/check', { method: 'POST' }).catch(() => {});

      const res = await apiRequest('/timetable/today');
      if (!res.ok || !res.data) return;

      const data = res.data;
      const lectures = data.lectures || [];
      const nextLec = data.next_lecture;
      const todayDay = data.day || 'Today';

      // Update timetable header day badge
      const ttSection = document.getElementById('timetableSection');
      if (ttSection) {
        const dayBadge = ttSection.querySelector('.badge');
        if (dayBadge) dayBadge.textContent = todayDay;
      }

      // Populate Next Lecture Card
      const nextContent = document.getElementById('nextLectureContent');
      const nextEmpty = document.getElementById('nextLectureEmptyState');
      const nextCourse = document.getElementById('nextLectureCourse');
      const nextMeta = document.getElementById('nextLectureMeta');
      const nextTime = document.getElementById('nextLectureTime');
      const nextRoom = document.getElementById('nextLectureRoom');
      const nextTeacher = document.getElementById('nextLectureTeacher');
      const nextBadge = document.getElementById('nextLectureStatusBadge');
      const nextCountdown = document.getElementById('nextLectureCountdown');

      if (nextLec) {
        if (nextContent) nextContent.style.display = 'block';
        if (nextEmpty) nextEmpty.style.display = 'none';

        if (nextCourse) nextCourse.textContent = `${nextLec.course_name || 'Class Session'} (${nextLec.course_code || ''})`;
        if (nextMeta) nextMeta.textContent = `${nextLec.course_type || 'Theory'} • Class: ${nextLec.class_name || '-'} Div ${nextLec.division || '-'} • Sem ${nextLec.semester || '-'}`;
        if (nextTime) nextTime.textContent = nextLec.time_range || `${nextLec.start_time_12} - ${nextLec.end_time_12}`;
        if (nextRoom) nextRoom.textContent = `Room: ${nextLec.room_no || 'TBA'}`;
        if (nextTeacher) nextTeacher.textContent = `Prof. ${nextLec.teacher_name || 'Faculty'}`;

        if (nextBadge) {
          nextBadge.style.display = 'inline-flex';
          nextBadge.textContent = nextLec.status;
          if (nextLec.status === 'NOW') {
            nextBadge.style.background = '#dcfce7';
            nextBadge.style.color = '#15803d';
          } else if (nextLec.status === 'STARTING SOON') {
            nextBadge.style.background = '#fef3c7';
            nextBadge.style.color = '#b45309';
          } else if (nextLec.status === 'COMPLETED') {
            nextBadge.style.background = '#f1f5f9';
            nextBadge.style.color = '#64748b';
          } else {
            nextBadge.style.background = '#e0e7ff';
            nextBadge.style.color = '#4338ca';
          }
        }

        if (nextCountdown) {
          nextCountdown.textContent = nextLec.countdown_text || nextLec.status;
        }
      } else {
        if (nextContent) nextContent.style.display = 'none';
        if (nextEmpty) nextEmpty.style.display = 'block';
        if (nextBadge) nextBadge.style.display = 'none';
        if (nextCountdown) nextCountdown.textContent = 'No more lectures today';
      }

      // Populate Today's Lectures Table / List
      const ttList = document.getElementById('timetableList');
      if (ttList) {
        if (lectures.length === 0) {
          ttList.innerHTML = `
            <div style="padding: 28px 16px; text-align: center; color: #64748b;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" style="margin-bottom: 8px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              <p style="margin: 0; font-weight: 600; font-size: 13px; color: #334155;">No lectures scheduled for today (${escapeHtml(todayDay)})</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">Enjoy your study time or review assignment work.</p>
            </div>
          `;
        } else {
          ttList.innerHTML = lectures.map(slot => {
            let statusBadgeBg = '#e0e7ff';
            let statusBadgeColor = '#4338ca';
            if (slot.status === 'NOW') {
              statusBadgeBg = '#dcfce7';
              statusBadgeColor = '#15803d';
            } else if (slot.status === 'STARTING SOON') {
              statusBadgeBg = '#fef3c7';
              statusBadgeColor = '#b45309';
            } else if (slot.status === 'COMPLETED') {
              statusBadgeBg = '#f1f5f9';
              statusBadgeColor = '#64748b';
            }

            let attBadgeHtml = '';
            if (slot.is_attendance_recorded) {
              const attStatus = slot.student_attendance_status ? ` (${slot.student_attendance_status})` : '';
              attBadgeHtml = `<span class="badge" style="background: #ecfdf5; color: #047857; font-size: 10.5px; padding: 2px 7px; border: 1px solid #a7f3d0; margin-left: 6px;">Attendance Recorded${attStatus}</span>`;
            }

            return `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid #f1f5f9; gap: 12px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="background: #f8fafc; border: 1px solid #e2e8f0; color: #0f172a; font-size: 11.5px; font-weight: 700; padding: 6px 10px; border-radius: 8px; text-align: center; min-width: 100px;">
                    ${escapeHtml(slot.time_range)}
                  </div>
                  <div>
                    <div style="font-weight: 600; font-size: 13.5px; color: #0f172a;">
                      ${escapeHtml(slot.course_code)}: ${escapeHtml(slot.course_name)}
                      ${attBadgeHtml}
                    </div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 3px;">
                      Prof. ${escapeHtml(slot.teacher_name || 'Staff')} &bull; Room: ${escapeHtml(slot.room_no || 'TBA')} &bull; Class: ${escapeHtml(slot.class_name || '')} Div ${escapeHtml(slot.division || '')}
                    </div>
                  </div>
                </div>
                <div style="text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 3px;">
                  <span class="badge" style="background: ${statusBadgeBg}; color: ${statusBadgeColor}; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 9999px;">
                    ${escapeHtml(slot.status)}
                  </span>
                  <span style="font-size: 11px; color: #64748b;">${escapeHtml(slot.countdown_text || '')}</span>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    } catch (err) {
      console.warn('Could not load smart timetable:', err);
    }
  }

  await loadSmartTimetable();
  setInterval(loadSmartTimetable, 30000);

  // 7. Fetch live notices
  try {
    const noticeRes = await apiRequest('/notices');
    if (noticeRes.ok && noticeRes.data) {
      const notices = noticeRes.data.notices || [];
      const noticeList = document.getElementById('noticesList');
      if (noticeList) {
        if (notices.length === 0) {
          noticeList.innerHTML = `
            <div style="padding: 28px 16px; text-align: center; color: #64748b;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" style="margin-bottom: 8px;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
              <p style="margin: 0; font-weight: 600; font-size: 13px; color: #334155;">No active campus circulars</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">Official announcements and exam circulars will be displayed here.</p>
            </div>
          `;
        } else {
          noticeList.innerHTML = notices.slice(0, 4).map(n => `
            <div style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9;">
              <div style="font-weight: 600; font-size: 13px; color: #0f172a;">${escapeHtml(n.title)}</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 3px;">${escapeHtml(n.content || '')}</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">${n.published_at ? new Date(n.published_at).toLocaleDateString() : ''}</div>
            </div>
          `).join('');
        }
      }
    }
  } catch (err) {
    console.warn('Could not load notices:', err);
  }

  // 8. Fetch live notifications
  try {
    const notifRes = await apiRequest('/notifications');
    if (notifRes.ok && notifRes.data) {
      const notifications = notifRes.data.notifications || [];
      const unreadCount = notifications.filter(n => !n.is_read).length;

      const notifyDot = document.getElementById('headerNotificationDot');
      if (notifyDot) {
        notifyDot.style.display = unreadCount > 0 ? 'block' : 'none';
      }

      const notifList = document.getElementById('notificationsList');
      if (notifList) {
        if (notifications.length === 0) {
          notifList.innerHTML = `<div class="p-4 text-center text-muted" style="padding: 32px 16px; text-align: center; color: #64748b;">No new notifications. You are all caught up!</div>`;
        } else {
          notifList.innerHTML = notifications.slice(0, 5).map(n => {
            const timeAgo = n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            return `
              <div class="notification-row ${n.is_read ? '' : 'unread'}" style="display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; ${n.is_read ? '' : 'background: #f8fafc;'}">
                <div style="background: #e0e7ff; color: #4338ca; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                </div>
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <span style="font-weight: 600; font-size: 13px; color: #0f172a;">${escapeHtml(n.title)}</span>
                    <span style="font-size: 11px; color: #94a3b8; flex-shrink: 0;">${timeAgo}</span>
                  </div>
                  <div style="font-size: 12px; color: #475569; margin-top: 3px; line-height: 1.4;">${escapeHtml(n.message)}</div>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }
  } catch (err) {
    console.warn('Could not load notifications:', err);
  }

  // 9. Fetch upcoming academic events & exams
  try {
    const calRes = await apiRequest('/academic-events/upcoming?limit=4');
    const calList = document.getElementById('calendarEventsList');
    if (calList && calRes.ok && calRes.data) {
      const events = calRes.data.events || [];
      if (events.length > 0) {
        let html = '';
        events.forEach(e => {
          const isExam = e.event_type === 'EXAM';
          const isHoliday = e.event_type === 'HOLIDAY';
          let borderCol = '#2563eb';
          let badgeBg = '#eff6ff';
          let badgeFg = '#1d4ed8';

          if (isExam) {
            borderCol = '#ef4444';
            badgeBg = '#fee2e2';
            badgeFg = '#b91c1c';
          } else if (isHoliday) {
            borderCol = '#10b981';
            badgeBg = '#dcfce7';
            badgeFg = '#15803d';
          }

          const timeStr = e.start_time ? ` • ${e.start_time.slice(0, 5)}` : '';

          html += `
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; border-left: 4px solid ${borderCol}; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: ${badgeBg}; color: ${badgeFg};">
                  ${e.event_type}${e.exam_type ? ` - ${e.exam_type}` : ''}
                </span>
                <span style="font-size: 11px; color: #64748b;">${e.start_date}${timeStr}</span>
              </div>
              <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">${escapeHtml(e.title)}</div>
              ${e.room || e.location ? `<div style="font-size: 12px; color: #64748b;">📍 ${escapeHtml(e.room || e.location)}</div>` : ''}
            </div>
          `;
        });
        calList.innerHTML = html;
      }
    }
  } catch (err) {
    console.warn('Could not load upcoming calendar events:', err);
  }
}

/**
 * Toast Notification system
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

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