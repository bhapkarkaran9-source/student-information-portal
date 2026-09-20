/**
 * Email Templates Service
 * Provides standardized, responsive, and secure HTML and plain-text email templates.
 * All dynamic variables are strictly HTML-escaped to prevent HTML/XSS injection.
 */

/**
 * Escapes characters with special meaning in HTML to prevent injection attacks.
 * @param {*} val - Value to sanitize
 * @returns {string} Sanitized string
 */
function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats a date/datetime into human-readable date and time components.
 * e.g., "20 September 2026", "10:00 AM", combined: "20 September 2026, 10:00 AM"
 *
 * @param {string|Date} dateVal - Due date or timestamp
 * @param {string} [timeVal] - Optional explicit time
 * @returns {{ date: string, time: string, formatted: string }}
 */
function formatDueDateTime(dateVal, timeVal = null) {
  if (!dateVal) {
    return {
      date: 'Specified Deadline',
      time: timeVal ? String(timeVal).trim() : 'End of Day',
      formatted: timeVal ? `Specified Deadline, ${timeVal}` : 'Specified Deadline'
    };
  }

  // If already formatted like "20 September 2026, 10:00 AM"
  if (typeof dateVal === 'string' && dateVal.includes(',') && (dateVal.includes('AM') || dateVal.includes('PM'))) {
    const parts = dateVal.split(',').map(s => s.trim());
    return {
      date: parts[0] || dateVal,
      time: parts[1] || (timeVal ? String(timeVal).trim() : '11:59 PM'),
      formatted: dateVal
    };
  }

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Try parsing string directly to preserve exact hour without timezone skew
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(trimmed);
    if (match) {
      const year = match[1];
      const monthIdx = parseInt(match[2], 10) - 1;
      const month = months[monthIdx] || 'Month';
      const day = parseInt(match[3], 10);
      const formattedDate = `${day} ${month} ${year}`;
      let formattedTime = '11:59 PM';
      if (timeVal) {
        formattedTime = String(timeVal).trim();
      } else if (match[4] !== undefined && match[5] !== undefined) {
        let h = parseInt(match[4], 10);
        const m = match[5];
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        formattedTime = `${h}:${m} ${ampm}`;
      }
      return {
        date: formattedDate,
        time: formattedTime,
        formatted: `${formattedDate}, ${formattedTime}`
      };
    }
  }

  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) {
      const fallbackStr = String(dateVal).trim();
      return {
        date: fallbackStr,
        time: timeVal ? String(timeVal).trim() : '11:59 PM',
        formatted: timeVal ? `${fallbackStr}, ${timeVal}` : fallbackStr
      };
    }

    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const formattedDate = `${day} ${month} ${year}`;

    let formattedTime;
    if (timeVal) {
      formattedTime = String(timeVal).trim();
    } else {
      let hours = d.getHours();
      const minutes = d.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const strMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
      formattedTime = `${hours}:${strMinutes} ${ampm}`;
    }

    return {
      date: formattedDate,
      time: formattedTime,
      formatted: `${formattedDate}, ${formattedTime}`
    };
  } catch (err) {
    const str = String(dateVal);
    return {
      date: str,
      time: timeVal ? String(timeVal).trim() : '11:59 PM',
      formatted: timeVal ? `${str}, ${timeVal}` : str
    };
  }
}


/**
 * Wraps content in a standardized, responsive portal email container.
 * @param {string} title 
 * @param {string} contentHtml 
 * @returns {string}
 */
function wrapLayout(title, contentHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.6;
    }
    .email-wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 32px 16px;
    }
    .email-container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .email-header {
      background-color: #1e3a8a;
      padding: 24px 32px;
      text-align: left;
    }
    .email-header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.02em;
    }
    .email-header p {
      margin: 4px 0 0 0;
      font-size: 13px;
      color: #93c5fd;
    }
    .email-body {
      padding: 32px;
    }
    .email-body h2 {
      margin-top: 0;
      font-size: 18px;
      color: #0f172a;
    }
    .email-body p {
      margin: 0 0 16px 0;
      font-size: 15px;
      color: #334155;
    }
    .info-card {
      background-color: #f1f5f9;
      border-left: 4px solid #2563eb;
      padding: 16px;
      margin: 20px 0;
      border-radius: 0 6px 6px 0;
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      background-color: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      border-radius: 6px;
      margin: 16px 0;
    }
    .email-footer {
      padding: 24px 32px;
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <div class="email-header">
        <h1>Student Information Portal</h1>
        <p>Institutional Notification System</p>
      </div>
      <div class="email-body">
        ${contentHtml}
      </div>
      <div class="email-footer">
        <p style="margin: 0 0 4px 0;">This is an automated administrative notification from Student Information Portal.</p>
        <p style="margin: 0;">Please do not reply directly to this email address.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Standard Email Templates Dictionary
 */
const TEMPLATES = {
  PASSWORD_CHANGED: {
    subject: (vars) => `Security Alert: Your Password Was Changed - Student Information Portal`,
    html: (vars) => {
      const name = escapeHtml(vars.name || vars.username || 'User');
      const changedAt = escapeHtml(vars.changedAt || new Date().toUTCString());
      const ipAddress = vars.ipAddress ? `<p><strong>IP Address:</strong> ${escapeHtml(vars.ipAddress)}</p>` : '';

      const content = `
        <h2>Password Changed Successfully</h2>
        <p>Dear ${name},</p>
        <p>This is to confirm that the password for your Student Information Portal account was changed on <strong>${changedAt}</strong>.</p>
        ${ipAddress}
        <div class="info-card">
          <p style="margin: 0;"><strong>Didn't make this change?</strong></p>
          <p style="margin: 4px 0 0 0; font-size: 13px;">If you did not initiate this change, please notify your portal administrator or IT helpdesk immediately to secure your account.</p>
        </div>
        <p>Best regards,<br>Student Information Portal Administration</p>
      `;
      return wrapLayout('Password Changed', content);
    },
    text: (vars) => {
      const name = vars.name || vars.username || 'User';
      const changedAt = vars.changedAt || new Date().toUTCString();
      const ip = vars.ipAddress ? `\nIP Address: ${vars.ipAddress}` : '';
      return `Dear ${name},\n\nThis is to confirm that the password for your Student Information Portal account was changed on ${changedAt}.${ip}\n\nIf you did not perform this change, please contact the portal administrator immediately.\n\nBest regards,\nStudent Information Portal Administration`;
    }
  },

  NEW_ACCOUNT: {
    subject: (vars) => `Welcome to Student Information Portal - Account Created`,
    html: (vars) => {
      const name = escapeHtml(vars.name || 'User');
      const username = escapeHtml(vars.username || '');
      const role = escapeHtml(vars.role || 'Member');
      const loginUrl = vars.loginUrl ? escapeHtml(vars.loginUrl) : '#';

      const content = `
        <h2>Welcome to Student Information Portal</h2>
        <p>Dear ${name},</p>
        <p>Your institutional portal account has been created successfully with the role: <strong>${role}</strong>.</p>
        <div class="info-card">
          <p style="margin: 0 0 6px 0;"><strong>Account Details:</strong></p>
          <p style="margin: 0;">Username: <strong>${username}</strong></p>
        </div>
        <p>You can now sign in to access your dashboard, courses, and portal services.</p>
        ${vars.loginUrl ? `<p><a href="${loginUrl}" class="btn">Sign In to Portal</a></p>` : ''}
        <p>Best regards,<br>Student Information Portal Administration</p>
      `;
      return wrapLayout('Account Created', content);
    },
    text: (vars) => {
      const name = vars.name || 'User';
      const username = vars.username || '';
      const role = vars.role || 'Member';
      const url = vars.loginUrl ? `\nLogin URL: ${vars.loginUrl}` : '';
      return `Dear ${name},\n\nWelcome to Student Information Portal! Your account has been created with role: ${role}.\n\nUsername: ${username}${url}\n\nBest regards,\nStudent Information Portal Administration`;
    }
  },

  PASSWORD_RESET: {
    subject: (vars) => `Password Reset Request - Student Information Portal`,
    html: (vars) => {
      const name = escapeHtml(vars.name || vars.username || 'User');
      const resetLink = vars.resetLink ? escapeHtml(vars.resetLink) : '#';
      const expiresIn = escapeHtml(vars.expiresIn || '1 hour');

      const content = `
        <h2>Password Reset Request</h2>
        <p>Dear ${name},</p>
        <p>We received a request to reset your password for the Student Information Portal.</p>
        <p>Click the button below to set a new password. This link is valid for <strong>${expiresIn}</strong>.</p>
        ${vars.resetLink ? `<p><a href="${resetLink}" class="btn">Reset My Password</a></p>` : ''}
        <div class="info-card">
          <p style="margin: 0; font-size: 13px;">If you did not request a password reset, you can safely ignore this email. Your current password will remain unchanged.</p>
        </div>
        <p>Best regards,<br>Student Information Portal Administration</p>
      `;
      return wrapLayout('Password Reset Request', content);
    },
    text: (vars) => {
      const name = vars.name || vars.username || 'User';
      const resetLink = vars.resetLink ? `\nReset Link: ${vars.resetLink}` : '';
      const expiresIn = vars.expiresIn || '1 hour';
      return `Dear ${name},\n\nWe received a request to reset your password for the Student Information Portal.\nThis link will expire in ${expiresIn}.${resetLink}\n\nIf you did not request a password reset, you can safely ignore this email.\n\nBest regards,\nStudent Information Portal Administration`;
    }
  },

  NOTIFICATION: {
    subject: (vars) => vars.subject ? String(vars.subject) : (vars.title ? `${String(vars.title)} - Student Information Portal` : `Notification - Student Information Portal`),
    html: (vars) => {
      const name = escapeHtml(vars.name || 'User');
      const title = escapeHtml(vars.title || 'System Notification');
      const message = escapeHtml(vars.message || '');
      const actionUrl = vars.actionUrl ? escapeHtml(vars.actionUrl) : null;
      const actionText = escapeHtml(vars.actionText || 'View Details');

      const content = `
        <h2>${title}</h2>
        <p>Dear ${name},</p>
        <p>${message}</p>
        ${actionUrl ? `<p><a href="${actionUrl}" class="btn">${actionText}</a></p>` : ''}
        <p>Best regards,<br>Student Information Portal Administration</p>
      `;
      return wrapLayout(title, content);
    },
    text: (vars) => {
      const name = vars.name || 'User';
      const title = vars.title || 'System Notification';
      const message = vars.message || '';
      const action = vars.actionUrl ? `\nAction: ${vars.actionText || 'View Details'} (${vars.actionUrl})` : '';
      return `Dear ${name},\n\n${title}\n\n${message}${action}\n\nBest regards,\nStudent Information Portal Administration`;
    }
  },

  NEW_ASSIGNMENT: {
    subject: (vars) => `New Assignment: ${vars.assignmentTitle || vars.title || 'Assignment'} - Student Information Portal`,
    html: (vars) => {
      const name = escapeHtml(vars.name || 'Student');
      const title = escapeHtml(vars.assignmentTitle || vars.title || 'Assignment');
      const course = escapeHtml(vars.course || vars.courseName || vars.courseCode || 'Enrolled Course');
      const dt = formatDueDateTime(vars.dueDate || vars.deadline, vars.dueTime);
      const dueDate = escapeHtml(vars.dueFormattedDate || dt.date);
      const dueTime = escapeHtml(vars.dueFormattedTime || dt.time);
      const dueDateTime = escapeHtml(vars.dueDateTime || dt.formatted);
      const teacher = vars.teacher ? `<p style="margin: 6px 0 0 0;"><strong>Faculty:</strong> ${escapeHtml(vars.teacher)}</p>` : '';

      const content = `
        <h2>New Assignment Published</h2>
        <p>Dear ${name},</p>
        <p>A new assignment has been published for your course.</p>
        <div class="info-card">
          <p style="margin: 0 0 6px 0;"><strong>Assignment:</strong> ${title}</p>
          <p style="margin: 0 0 6px 0;"><strong>Course:</strong> ${course}</p>
          <p style="margin: 0 0 6px 0;"><strong>Due Date:</strong> ${dueDate}</p>
          <p style="margin: 0 0 6px 0;"><strong>Due Time:</strong> ${dueTime}</p>
          <p style="margin: 0;"><strong>Deadline:</strong> ${dueDateTime}</p>
          ${teacher}
        </div>
        <p>Please log in to the portal to review requirements and submit your work before the deadline.</p>
        <p>Best regards,<br>Student Information Portal</p>
      `;
      return wrapLayout(`New Assignment: ${title}`, content);
    },
    text: (vars) => {
      const name = vars.name || 'Student';
      const title = vars.assignmentTitle || vars.title || 'Assignment';
      const course = vars.course || vars.courseName || vars.courseCode || 'Enrolled Course';
      const dt = formatDueDateTime(vars.dueDate || vars.deadline, vars.dueTime);
      const dueDate = vars.dueFormattedDate || dt.date;
      const dueTime = vars.dueFormattedTime || dt.time;
      const dueDateTime = vars.dueDateTime || dt.formatted;
      const teacher = vars.teacher ? `\nFaculty: ${vars.teacher}` : '';
      return `Dear ${name},\n\nA new assignment has been published:\n\nAssignment: ${title}\nCourse: ${course}\nDue Date: ${dueDate}\nDue Time: ${dueTime}\nDeadline: ${dueDateTime}${teacher}\n\nPlease sign in to the portal to view details and submit.\n\nBest regards,\nStudent Information Portal`;
    }
  },

  ASSIGNMENT_DUE_SOON: {
    subject: (vars) => `Reminder: Assignment Due Soon - ${vars.assignmentTitle || vars.title || 'Assignment'}`,
    html: (vars) => {
      const name = escapeHtml(vars.name || 'Student');
      const title = escapeHtml(vars.assignmentTitle || vars.title || 'Assignment');
      const course = escapeHtml(vars.course || vars.courseName || vars.courseCode || 'Course');
      const dt = formatDueDateTime(vars.deadline || vars.dueDate, vars.dueTime);
      const dueDate = escapeHtml(vars.dueFormattedDate || dt.date);
      const dueTime = escapeHtml(vars.dueFormattedTime || dt.time);
      const dueDateTime = escapeHtml(vars.dueDateTime || dt.formatted);
      const remaining = vars.remainingTime ? `<p style="margin: 6px 0 0 0; color: #dc2626;"><strong>Remaining Time:</strong> ${escapeHtml(vars.remainingTime)}</p>` : '';

      const content = `
        <h2>Assignment Deadline Approaching</h2>
        <p>Dear ${name},</p>
        <p>This is a reminder that an upcoming assignment submission deadline is approaching.</p>
        <div class="info-card">
          <p style="margin: 0 0 6px 0;"><strong>Assignment:</strong> ${title}</p>
          <p style="margin: 0 0 6px 0;"><strong>Course:</strong> ${course}</p>
          <p style="margin: 0 0 6px 0;"><strong>Due Date:</strong> ${dueDate}</p>
          <p style="margin: 0 0 6px 0;"><strong>Due Time:</strong> ${dueTime}</p>
          <p style="margin: 0;"><strong>Deadline:</strong> ${dueDateTime}</p>
          ${remaining}
        </div>
        <p>Kindly ensure your submission is uploaded on the portal on or before the specified deadline.</p>
        <p>Best regards,<br>Student Information Portal</p>
      `;
      return wrapLayout(`Due Soon: ${title}`, content);
    },
    text: (vars) => {
      const name = vars.name || 'Student';
      const title = vars.assignmentTitle || vars.title || 'Assignment';
      const course = vars.course || vars.courseName || vars.courseCode || 'Course';
      const dt = formatDueDateTime(vars.deadline || vars.dueDate, vars.dueTime);
      const dueDate = vars.dueFormattedDate || dt.date;
      const dueTime = vars.dueFormattedTime || dt.time;
      const dueDateTime = vars.dueDateTime || dt.formatted;
      const remaining = vars.remainingTime ? `\nRemaining Time: ${vars.remainingTime}` : '';
      return `Dear ${name},\n\nThis is a reminder that your assignment deadline is approaching:\n\nAssignment: ${title}\nCourse: ${course}\nDue Date: ${dueDate}\nDue Time: ${dueTime}\nDeadline: ${dueDateTime}${remaining}\n\nPlease submit your work before the deadline.\n\nBest regards,\nStudent Information Portal`;
    }
  },

  ASSIGNMENT_OVERDUE: {
    subject: (vars) => `Urgent Alert: Assignment Overdue - ${vars.assignmentTitle || vars.title || 'Assignment'}`,
    html: (vars) => {
      const name = escapeHtml(vars.name || 'Student');
      const title = escapeHtml(vars.assignmentTitle || vars.title || 'Assignment');
      const course = escapeHtml(vars.course || vars.courseName || vars.courseCode || 'Course');
      const dt = formatDueDateTime(vars.dueDate || vars.deadline, vars.dueTime);
      const dueDate = escapeHtml(vars.dueFormattedDate || dt.date);
      const dueTime = escapeHtml(vars.dueFormattedTime || dt.time);
      const dueDateTime = escapeHtml(vars.dueDateTime || dt.formatted);
      const overdueDuration = vars.overdueDuration ? `<p style="margin: 6px 0 0 0; color: #b91c1c;"><strong>Overdue By:</strong> ${escapeHtml(vars.overdueDuration)}</p>` : '';

      const content = `
        <h2>Assignment Past Deadline</h2>
        <p>Dear ${name},</p>
        <p>Our records indicate that you have not submitted the following assignment and the due date has passed.</p>
        <div class="info-card" style="border-left-color: #dc2626;">
          <p style="margin: 0 0 6px 0;"><strong>Assignment:</strong> ${title}</p>
          <p style="margin: 0 0 6px 0;"><strong>Course:</strong> ${course}</p>
          <p style="margin: 0 0 6px 0;"><strong>Original Due Date:</strong> ${dueDate}</p>
          <p style="margin: 0 0 6px 0;"><strong>Original Due Time:</strong> ${dueTime}</p>
          <p style="margin: 0;"><strong>Was Due On:</strong> ${dueDateTime}</p>
          ${overdueDuration}
        </div>
        <p>If late submissions are permitted for this course, please turn in your work immediately to minimize penalty.</p>
        <p>Best regards,<br>Student Information Portal</p>
      `;
      return wrapLayout(`Overdue: ${title}`, content);
    },
    text: (vars) => {
      const name = vars.name || 'Student';
      const title = vars.assignmentTitle || vars.title || 'Assignment';
      const course = vars.course || vars.courseName || vars.courseCode || 'Course';
      const dt = formatDueDateTime(vars.dueDate || vars.deadline, vars.dueTime);
      const dueDate = vars.dueFormattedDate || dt.date;
      const dueTime = vars.dueFormattedTime || dt.time;
      const dueDateTime = vars.dueDateTime || dt.formatted;
      const duration = vars.overdueDuration ? `\nOverdue By: ${vars.overdueDuration}` : '';
      return `Dear ${name},\n\nThe deadline for the following assignment has passed:\n\nAssignment: ${title}\nCourse: ${course}\nOriginal Due Date: ${dueDate}\nOriginal Due Time: ${dueTime}\nWas Due On: ${dueDateTime}${duration}\n\nPlease check the portal and submit as soon as possible.\n\nBest regards,\nStudent Information Portal`;
    }
  },

  ASSIGNMENT_EVALUATED: {
    subject: (vars) => `Assignment Evaluated: ${vars.assignmentTitle || vars.title || 'Assignment'}`,
    html: (vars) => {
      const name = escapeHtml(vars.name || 'Student');
      const title = escapeHtml(vars.assignmentTitle || vars.title || 'Assignment');
      const marks = escapeHtml(vars.marks || vars.marksObtained || 'Grades Available');
      const feedback = vars.feedback ? `<p style="margin: 6px 0 0 0;"><strong>Faculty Feedback:</strong> ${escapeHtml(vars.feedback)}</p>` : '<p style="margin: 6px 0 0 0;">Faculty feedback has been published.</p>';

      const content = `
        <h2>Assignment Evaluation Completed</h2>
        <p>Dear ${name},</p>
        <p>Your submission for <strong>${title}</strong> has been evaluated by your instructor.</p>
        <div class="info-card">
          <p style="margin: 0 0 6px 0;"><strong>Assignment:</strong> ${title}</p>
          <p style="margin: 0 0 6px 0;"><strong>Marks:</strong> ${marks}</p>
          ${feedback}
        </div>
        <p>You can sign in to the portal to view full rubric evaluation and feedback details.</p>
        <p>Best regards,<br>Student Information Portal</p>
      `;
      return wrapLayout(`Evaluated: ${title}`, content);
    },
    text: (vars) => {
      const name = vars.name || 'Student';
      const title = vars.assignmentTitle || vars.title || 'Assignment';
      const marks = vars.marks || vars.marksObtained || 'Grades Available';
      const feedback = vars.feedback ? `\nFeedback: ${vars.feedback}` : '';
      return `Dear ${name},\n\nYour submission for "${title}" has been evaluated.\nMarks: ${marks}${feedback}\n\nPlease sign in to the portal to view complete feedback.\n\nBest regards,\nStudent Information Portal`;
    }
  },

  NEW_RESULT: {
    subject: (vars) => `Academic Results Published: ${vars.course || vars.title || 'Semester Results'}`,
    html: (vars) => {
      const name = escapeHtml(vars.name || 'Student');
      const course = escapeHtml(vars.course || vars.title || 'Course');
      const grade = vars.grade || vars.marks ? escapeHtml(vars.grade || vars.marks) : 'Available in portal';

      const content = `
        <h2>New Academic Results Available</h2>
        <p>Dear ${name},</p>
        <p>New academic grades/results have been published for your course.</p>
        <div class="info-card">
          <p style="margin: 0 0 6px 0;"><strong>Course:</strong> ${course}</p>
          <p style="margin: 0;"><strong>Result/Grade:</strong> ${grade}</p>
        </div>
        <p>Please log in to your student dashboard to review your detailed marksheet and performance breakdown.</p>
        <p>Best regards,<br>Academic Examination Office</p>
      `;
      return wrapLayout(`Results: ${course}`, content);
    },
    text: (vars) => {
      const name = vars.name || 'Student';
      const course = vars.course || vars.title || 'Course';
      const grade = vars.grade || vars.marks || 'Available in portal';
      return `Dear ${name},\n\nNew academic results have been published for: ${course}.\nGrade/Result: ${grade}\n\nPlease check your student dashboard for details.\n\nBest regards,\nAcademic Examination Office`;
    }
  },

  LOW_ATTENDANCE: {
    subject: (vars) => `Attendance Alert: Low Attendance in ${vars.course || 'Course'}`,
    html: (vars) => {
      const name = escapeHtml(vars.name || 'Student');
      const course = escapeHtml(vars.course || 'Enrolled Subject');
      const percentage = escapeHtml(vars.attendancePercentage || vars.percentage || 'Below threshold');
      const threshold = escapeHtml(vars.threshold || '75%');

      const content = `
        <h2>Low Attendance Warning</h2>
        <p>Dear ${name},</p>
        <p>This is an advisory notification regarding your attendance records.</p>
        <div class="info-card" style="border-left-color: #f59e0b;">
          <p style="margin: 0 0 6px 0;"><strong>Course:</strong> ${course}</p>
          <p style="margin: 0 0 6px 0;"><strong>Current Attendance:</strong> ${percentage}</p>
          <p style="margin: 0;"><strong>Required Institutional Minimum:</strong> ${threshold}</p>
        </div>
        <p>Maintaining at least ${threshold} attendance is mandatory to remain eligible for examinations. Please attend upcoming lectures and consult your faculty advisor if needed.</p>
        <p>Best regards,<br>Academic Administration</p>
      `;
      return wrapLayout(`Attendance Warning: ${course}`, content);
    },
    text: (vars) => {
      const name = vars.name || 'Student';
      const course = vars.course || 'Enrolled Subject';
      const percentage = vars.attendancePercentage || vars.percentage || 'Below threshold';
      const threshold = vars.threshold || '75%';
      return `Dear ${name},\n\nAttendance Warning for: ${course}\nCurrent Attendance: ${percentage}\nRequired Minimum: ${threshold}\n\nPlease attend upcoming sessions to meet examination eligibility criteria.\n\nBest regards,\nAcademic Administration`;
    }
  },

  EXAM_REMINDER: {
    subject: (vars) => {
      const name = vars.examName || vars.title || 'Examination';
      const type = String(vars.reminderType || '').toUpperCase();
      if (type.includes('1_DAY') || type.includes('TOMORROW')) {
        return `Exam Reminder (Tomorrow): ${name} - Student Information Portal`;
      }
      if (type.includes('STARTING')) {
        return `Urgent Alert: Exam Starting Now - ${name} - Student Information Portal`;
      }
      return `Exam Reminder: ${name} - Student Information Portal`;
    },
    html: (vars) => {
      const name = escapeHtml(vars.name || 'Student');
      const examName = escapeHtml(vars.examName || vars.title || 'Examination');
      const course = vars.course ? `<p style="margin: 0 0 6px 0;"><strong>Course:</strong> ${escapeHtml(vars.course)}</p>` : '';
      const date = escapeHtml(vars.date || vars.examDate || 'Scheduled Date');
      const time = escapeHtml(vars.time || vars.examTime || 'Scheduled Time');
      const venueStr = vars.venue || vars.room || vars.location || 'Examination Hall';
      const venue = `<p style="margin: 0;"><strong>Venue / Room:</strong> ${escapeHtml(venueStr)}</p>`;

      const type = String(vars.reminderType || '').toUpperCase();
      let reminderText = vars.reminderText ? escapeHtml(vars.reminderText) : '';
      let heading = 'Upcoming Examination Reminder';
      let borderCol = '#2563eb';

      if (type.includes('STARTING')) {
        heading = 'Urgent: Examination Starting Now';
        borderCol = '#dc2626';
        if (!reminderText) {
          reminderText = 'This is an urgent reminder that your examination is starting now. Please report to the examination hall immediately.';
        }
      } else if (type.includes('1_DAY') || type.includes('TOMORROW')) {
        heading = 'Examination Scheduled for Tomorrow';
        if (!reminderText) {
          reminderText = 'This is a reminder that your examination is scheduled for tomorrow. Please review your preparation and exam guidelines.';
        }
      } else if (!reminderText) {
        reminderText = 'This is a reminder for your upcoming scheduled examination.';
      }

      const content = `
        <h2>${heading}</h2>
        <p>Dear ${name},</p>
        <p>${reminderText}</p>
        <div class="info-card" style="border-left-color: ${borderCol};">
          <p style="margin: 0 0 6px 0;"><strong>Examination:</strong> ${examName}</p>
          ${course}
          <p style="margin: 0 0 6px 0;"><strong>Date:</strong> ${date}</p>
          <p style="margin: 0 0 6px 0;"><strong>Time:</strong> ${time}</p>
          ${venue}
        </div>
        <p>Please ensure you arrive on time with your student ID card and required examination stationery.</p>
        <p>Best regards,<br>Examination Controller</p>
      `;
      return wrapLayout(heading, content);
    },
    text: (vars) => {
      const name = vars.name || 'Student';
      const examName = vars.examName || vars.title || 'Examination';
      const course = vars.course ? `\nCourse: ${vars.course}` : '';
      const date = vars.date || vars.examDate || 'Scheduled Date';
      const time = vars.time || vars.examTime || 'Scheduled Time';
      const venue = vars.venue || vars.room || vars.location || 'Examination Hall';

      const type = String(vars.reminderType || '').toUpperCase();
      let reminderText = vars.reminderText || '';
      if (type.includes('STARTING')) {
        if (!reminderText) reminderText = 'This is an urgent reminder that your examination is starting now. Please report to the examination hall immediately.';
      } else if (type.includes('1_DAY') || type.includes('TOMORROW')) {
        if (!reminderText) reminderText = 'This is a reminder that your examination is scheduled for tomorrow.';
      } else if (!reminderText) {
        reminderText = 'This is a reminder for your upcoming scheduled examination.';
      }

      return `Dear ${name},\n\n${reminderText}\n\nExamination: ${examName}${course}\nDate: ${date}\nTime: ${time}\nVenue: ${venue}\n\nPlease arrive on time with your student ID.\n\nBest regards,\nExamination Controller`;
    }
  },

  EXAM_SCHEDULED: {
    subject: (vars) => `Exam Scheduled: ${vars.examName || vars.title || 'Examination'} - Student Information Portal`,
    html: (vars) => {
      const name = escapeHtml(vars.name || 'Student');
      const examName = escapeHtml(vars.examName || vars.title || 'Examination');
      const course = escapeHtml(vars.course || 'Course');
      const date = escapeHtml(vars.date || vars.examDate || 'Scheduled Date');
      const time = escapeHtml(vars.time || 'Scheduled Time');
      const venueStr = vars.venue || vars.room || vars.location || 'Examination Hall';
      const venue = escapeHtml(venueStr);
      const instructions = vars.instructions ? `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
          <p style="margin: 0 0 4px 0; font-weight: 600; color: #475569;">Instructions:</p>
          <p style="margin: 0; line-height: 1.5; color: #1e293b;">${escapeHtml(vars.instructions)}</p>
        </div>
      ` : '';

      const content = `
        <h2>Examination Scheduled</h2>
        <p>Dear ${name},</p>
        <p>A new examination has been scheduled on your academic calendar. Please review the schedule and venue details below:</p>
        <div class="info-card">
          <p style="margin: 0 0 6px 0; font-size: 16px;"><strong>Exam Name:</strong> ${examName}</p>
          <p style="margin: 0 0 6px 0;"><strong>Course:</strong> ${course}</p>
          <p style="margin: 0 0 6px 0;"><strong>Exam Date:</strong> ${date}</p>
          <p style="margin: 0 0 6px 0;"><strong>Time:</strong> ${time}</p>
          <p style="margin: 0 0 6px 0;"><strong>Venue / Room:</strong> ${venue}</p>
          ${instructions}
        </div>
        <p style="margin-top: 12px; color: #64748b; font-size: 13px;">Reminder Schedule: You will also receive an exam reminder 1 day prior, and an alert when the exam starts.</p>
        <p>Best regards,<br>Examination Cell</p>
      `;
      return wrapLayout(`Exam Scheduled: ${examName}`, content);
    },
    text: (vars) => {
      const name = vars.name || 'Student';
      const examName = vars.examName || vars.title || 'Examination';
      const course = vars.course || 'Course';
      const date = vars.date || vars.examDate || 'Scheduled Date';
      const time = vars.time || 'Scheduled Time';
      const venue = vars.venue || vars.room || vars.location || 'Examination Hall';
      const instructions = vars.instructions ? `\nInstructions: ${vars.instructions}` : '';

      return `Dear ${name},\n\nA new examination has been scheduled on your academic calendar:\nExam Name: ${examName}\nCourse: ${course}\nExam Date: ${date}\nTime: ${time}\nVenue / Room: ${venue}${instructions}\n\nPlease note this schedule. You will also receive reminders 1 day prior and when the exam begins.\n\nBest regards,\nExamination Cell`;
    }
  },

  TIMETABLE_REMINDER: {
    subject: (vars) => {
      const course = vars.course || vars.courseName || vars.title || 'Upcoming Lecture';
      const type = String(vars.reminderType || '').toUpperCase();
      if (type === 'STARTED') return `Lecture Started: ${course} - Student Information Portal`;
      if (type === '5_MINUTES') return `Lecture Reminder: ${course} starts in 5 minutes - Student Information Portal`;
      if (type === '15_MINUTES') return `Lecture Reminder: ${course} starts in 15 minutes - Student Information Portal`;
      return `Class Reminder: ${course} - Student Information Portal`;
    },
    html: (vars) => {
      const name = escapeHtml(vars.name || 'Student');
      const course = escapeHtml(vars.course || vars.courseName || vars.title || 'Lecture');
      const teacher = escapeHtml(vars.teacher || vars.teacherName || 'Faculty Instructor');
      const date = escapeHtml(vars.date || vars.lectureDate || 'Today');
      const time = escapeHtml(vars.time || (vars.endTime ? `${vars.startTime} - ${vars.endTime}` : (vars.startTime || 'Scheduled Time')));
      const room = escapeHtml(vars.room || vars.location || 'Assigned Classroom');
      const reminderMsg = escapeHtml(vars.reminderMessage || vars.message || 'You have a scheduled lecture according to your academic timetable.');

      const type = String(vars.reminderType || '').toUpperCase();
      let borderCol = '#2563eb';
      let heading = 'Class Schedule Reminder';
      if (type === 'STARTED') {
        heading = 'Lecture Started';
        borderCol = '#10b981';
      } else if (type === '5_MINUTES') {
        heading = 'Lecture Starting in 5 Minutes';
        borderCol = '#f59e0b';
      } else if (type === '15_MINUTES') {
        heading = 'Lecture Starting in 15 Minutes';
        borderCol = '#2563eb';
      }

      const content = `
        <h2>${heading}</h2>
        <p>Dear ${name},</p>
        <p><strong>Reminder:</strong> ${reminderMsg}</p>
        <div class="info-card" style="border-left-color: ${borderCol};">
          <p style="margin: 0 0 6px 0; font-size: 16px;"><strong>Course:</strong> ${course}</p>
          <p style="margin: 0 0 6px 0;"><strong>Lecture Date:</strong> ${date}</p>
          <p style="margin: 0 0 6px 0;"><strong>Time:</strong> ${time}</p>
          <p style="margin: 0 0 6px 0;"><strong>Instructor:</strong> ${teacher}</p>
          <p style="margin: 0;"><strong>Room / Location:</strong> ${room}</p>
        </div>
        <p style="margin-top: 12px; color: #64748b; font-size: 13px;">Timetable Reminder: Reminders are sent 15 minutes before, 5 minutes before, and when the lecture starts.</p>
        <p>Best regards,<br>Academic Timetable Office</p>
      `;
      return wrapLayout(`Class Reminder: ${course}`, content);
    },
    text: (vars) => {
      const name = vars.name || 'Student';
      const course = vars.course || vars.courseName || vars.title || 'Lecture';
      const teacher = vars.teacher || vars.teacherName || 'Faculty Instructor';
      const date = vars.date || vars.lectureDate || 'Today';
      const time = vars.time || (vars.endTime ? `${vars.startTime} - ${vars.endTime}` : (vars.startTime || 'Scheduled Time'));
      const room = vars.room || vars.location || 'Assigned Classroom';
      const reminderMsg = vars.reminderMessage || vars.message || 'You have a scheduled lecture according to your academic timetable.';

      return `Dear ${name},\n\nReminder: ${reminderMsg}\n\nUpcoming Class Schedule:\nCourse: ${course}\nLecture Date: ${date}\nTime: ${time}\nInstructor: ${teacher}\nRoom / Location: ${room}\n\nPlease arrive on time.\n\nBest regards,\nAcademic Timetable Office`;
    }
  },

  NEW_NOTICE: {
    subject: (vars) => `Notice: ${vars.noticeTitle || vars.title || 'Institutional Announcement'}`,
    html: (vars) => {
      const name = escapeHtml(vars.name || 'Portal Member');
      const title = escapeHtml(vars.noticeTitle || vars.title || 'Announcement');
      const description = escapeHtml(vars.description || vars.content || vars.summary || vars.message || 'A new notice has been published on the bulletin board.');
      const publishedDate = escapeHtml(vars.publishedDate || vars.publishedDateTime || vars.date || 'Today');
      const categoryHtml = (vars.category || vars.noticeCategory)
        ? `<p style="margin: 0 0 6px 0;"><strong>Category:</strong> ${escapeHtml(vars.category || vars.noticeCategory)}</p>`
        : '';

      const content = `
        <h2>Official Institutional Notice</h2>
        <p>Dear ${name},</p>
        <p>A new notice has been published on the institutional notice board.</p>
        <div class="info-card">
          <p style="margin: 0 0 8px 0; font-size: 16px;"><strong>Notice:</strong> ${title}</p>
          ${categoryHtml}
          <p style="margin: 0 0 8px 0;"><strong>Published Date:</strong> ${publishedDate}</p>
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
            <p style="margin: 0 0 4px 0; font-weight: 600; color: #475569;">Description / Message:</p>
            <p style="margin: 0; line-height: 1.5; color: #1e293b;">${description}</p>
          </div>
        </div>
        <p>Please log in to the Student Information Portal to view any attached documents or circular details.</p>
        <p>Best regards,<br>Administrative Office</p>
      `;
      return wrapLayout(`Notice: ${title}`, content);
    },
    text: (vars) => {
      const name = vars.name || 'Portal Member';
      const title = vars.noticeTitle || vars.title || 'Announcement';
      const description = vars.description || vars.content || vars.summary || vars.message || 'A new notice has been published on the bulletin board.';
      const publishedDate = vars.publishedDate || vars.publishedDateTime || vars.date || 'Today';
      const categoryText = (vars.category || vars.noticeCategory)
        ? `Category: ${vars.category || vars.noticeCategory}\n`
        : '';
      return `Dear ${name},\n\nOfficial Notice: ${title}\n${categoryText}Published Date: ${publishedDate}\n\nNotice Description/Message:\n${description}\n\nPlease check the portal notice board for more information.\n\nBest regards,\nAdministrative Office`;
    }
  },

  NEW_FEEDBACK_FORM: {
    subject: (vars) => `Feedback Request: ${vars.feedbackTitle || vars.title || 'Institutional Feedback'}`,
    html: (vars) => {
      const name = escapeHtml(vars.name || 'Student');
      const title = escapeHtml(vars.feedbackTitle || vars.title || 'Feedback Form');
      const deadline = escapeHtml(vars.deadline || vars.submissionDeadline || vars.endDate || 'Active Period');
      const description = escapeHtml(vars.description || vars.instructions || vars.content || 'Please complete this evaluation form on your portal.');

      const targetHtml = vars.targetInfo
        ? `<p style="margin: 0 0 6px 0;"><strong>Target:</strong> ${escapeHtml(vars.targetInfo)}</p>`
        : (vars.course
          ? `<p style="margin: 0 0 6px 0;"><strong>Course:</strong> ${escapeHtml(vars.course)}</p>`
          : (vars.teacher
            ? `<p style="margin: 0 0 6px 0;"><strong>Teacher:</strong> ${escapeHtml(vars.teacher)}</p>`
            : ''));

      const formPath = vars.formPath || vars.formUrl || '/feedback/forms';
      const formLinkHtml = `<p style="margin: 0 0 6px 0;"><strong>Form Path / Link:</strong> <a href="${escapeHtml(formPath)}" style="color: #2563eb; text-decoration: underline;">${escapeHtml(formPath)}</a></p>`;

      const content = `
        <h2>Your Feedback is Requested</h2>
        <p>Dear ${name},</p>
        <p>A new evaluation and feedback form has been released. Your honest feedback is confidential and helps us continually enhance academic quality.</p>
        <div class="info-card">
          <p style="margin: 0 0 8px 0; font-size: 16px;"><strong>Feedback Form:</strong> ${title}</p>
          ${targetHtml}
          <p style="margin: 0 0 6px 0;"><strong>Submission Deadline:</strong> ${deadline}</p>
          ${formLinkHtml}
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
            <p style="margin: 0 0 4px 0; font-weight: 600; color: #475569;">Description / Instructions:</p>
            <p style="margin: 0; line-height: 1.5; color: #1e293b;">${description}</p>
          </div>
        </div>
        <p>Please take a few moments to complete this form on your student portal before the deadline.</p>
        <p>Best regards,<br>Quality Assurance & Academic Cell</p>
      `;
      return wrapLayout(`Feedback: ${title}`, content);
    },
    text: (vars) => {
      const name = vars.name || 'Student';
      const title = vars.feedbackTitle || vars.title || 'Feedback Form';
      const deadline = vars.deadline || vars.submissionDeadline || vars.endDate || 'Active Period';
      const description = vars.description || vars.instructions || vars.content || 'Please complete this evaluation form on your portal.';
      const targetText = vars.targetInfo
        ? `Target: ${vars.targetInfo}\n`
        : (vars.course ? `Course: ${vars.course}\n` : (vars.teacher ? `Teacher: ${vars.teacher}\n` : ''));
      const formPath = vars.formPath || vars.formUrl || '/feedback/forms';

      return `Dear ${name},\n\nA new feedback form is available on your student portal:\nFeedback Form: ${title}\n${targetText}Submission Deadline: ${deadline}\nForm Path / Link: ${formPath}\n\nDescription / Instructions:\n${description}\n\nYour responses are confidential and valued.\n\nBest regards,\nQuality Assurance & Academic Cell`;
    }
  },

  ACADEMIC_EVENT_REMINDER: {
    subject: (vars) => `Event Reminder: Tomorrow - ${vars.eventTitle || vars.title || 'Academic Event'}`,
    html: (vars) => {
      const name = escapeHtml(vars.name || 'Student');
      const title = escapeHtml(vars.eventTitle || vars.title || 'Academic Event');
      const date = escapeHtml(vars.date || vars.startDate || 'Scheduled Date');
      const timeVal = vars.time || vars.startTime || null;
      const timeHtml = timeVal ? `<p style="margin: 0 0 6px 0;"><strong>Event Time:</strong> ${escapeHtml(timeVal)}</p>` : '';
      const venueVal = vars.venue || vars.location || vars.room || 'Campus Venue';
      const venueHtml = `<p style="margin: 0 0 6px 0;"><strong>Venue:</strong> ${escapeHtml(venueVal)}</p>`;
      const reminderMsg = vars.reminderMessage || vars.reminderText || 'This is a reminder that your academic event is scheduled for tomorrow.';
      const descHtml = vars.description ? `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
          <p style="margin: 0 0 4px 0; font-weight: 600; color: #475569;">Event Description:</p>
          <p style="margin: 0; line-height: 1.5; color: #1e293b;">${escapeHtml(vars.description)}</p>
        </div>
      ` : '';

      const content = `
        <h2>Academic Event Reminder</h2>
        <p>Dear ${name},</p>
        <p><strong>Reminder:</strong> ${escapeHtml(reminderMsg)}</p>
        <div class="info-card">
          <p style="margin: 0 0 6px 0; font-size: 16px;"><strong>Event Title:</strong> ${title}</p>
          <p style="margin: 0 0 6px 0;"><strong>Event Date:</strong> ${date}</p>
          ${timeHtml}
          ${venueHtml}
          ${descHtml}
        </div>
        <p style="margin-top: 12px; color: #64748b; font-size: 13px;">Please note: A single notification is sent exactly one day before normal academic calendar events.</p>
        <p>Best regards,<br>Student Information Portal</p>
      `;
      return wrapLayout(`Event: ${title}`, content);
    },
    text: (vars) => {
      const name = vars.name || 'Student';
      const title = vars.eventTitle || vars.title || 'Academic Event';
      const date = vars.date || vars.startDate || 'Scheduled Date';
      const time = vars.time || vars.startTime ? `\nEvent Time: ${vars.time || vars.startTime}` : '';
      const venue = vars.venue || vars.location || vars.room || 'Campus Venue';
      const reminderMsg = vars.reminderMessage || vars.reminderText || 'This is a reminder that your academic event is scheduled for tomorrow.';
      const descText = vars.description ? `\nEvent Description: ${vars.description}` : '';

      return `Dear ${name},\n\nReminder: ${reminderMsg}\n\nUpcoming Academic Event:\nEvent Title: ${title}\nEvent Date: ${date}${time}\nVenue: ${venue}${descText}\n\nPlease note: A single notification is sent exactly one day before normal academic calendar events.\n\nBest regards,\nStudent Information Portal`;
    }
  }
};

/**
 * Checks if a template exists.
 * @param {string} templateName 
 * @returns {boolean}
 */
function hasTemplate(templateName) {
  return Boolean(templateName && TEMPLATES[templateName.toUpperCase()]);
}

/**
 * Renders an email template into subject, HTML, and text.
 * @param {string} templateName - Name of the template (e.g. 'PASSWORD_CHANGED')
 * @param {object} variables - Template variables
 * @returns {{ subject: string, html: string, text: string }}
 */
function renderTemplate(templateName, variables = {}) {
  const key = String(templateName || '').toUpperCase();
  const template = TEMPLATES[key];

  if (!template) {
    throw new Error(`Email template '${templateName}' not found. Available templates: ${Object.keys(TEMPLATES).join(', ')}`);
  }

  const vars = variables && typeof variables === 'object' ? variables : {};

  return {
    subject: template.subject(vars),
    html: template.html(vars),
    text: template.text(vars)
  };
}

module.exports = {
  escapeHtml,
  formatDueDateTime,
  hasTemplate,
  renderTemplate,
  TEMPLATES
};
