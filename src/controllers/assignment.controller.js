const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const Assignment = require('../models/assignment.model');
const teacherModel = require('../models/teacher.model');
const studentModel = require('../models/student.model');
const notificationModel = require('../models/notification.model');
const { createAuditLog } = require('../services/audit.service');
const { SUBMISSIONS_DIR, BASE_UPLOADS } = require('../middlewares/upload.middleware');

/**
 * Validate positive integer ID
 */
const isValidId = (id) => {
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0 && String(parsed) === String(id).trim();
};

/**
 * Validate safe file path or URL
 */
const isSafeFilePathOrUrl = (pathStr) => {
  if (!pathStr || typeof pathStr !== 'string') return true;
  const trimmed = pathStr.trim();
  if (!trimmed) return true;

  if (/^(javascript|data|file|vbscript):/i.test(trimmed)) {
    return false;
  }
  if (trimmed.includes('..') || trimmed.includes('\\')) {
    return false;
  }
  const cleanPath = trimmed.split(/[?#]/)[0];
  const dangerousExts = /\.(exe|bat|cmd|sh|vbs|msi|ps1|com|scr|pif|reg)$/i;
  if (dangerousExts.test(cleanPath)) {
    return false;
  }
  return true;
};

/**
 * Helper to validate datetime
 */
const isValidDateTime = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
};

/**
 * Helper to convert to MySQL DATETIME format (YYYY-MM-DD HH:mm:ss)
 */
const toMySQLDateTime = (dateStr) => {
  const d = new Date(dateStr);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

/**
 * Helper to check and dispatch due reminders (due soon within 3 days or overdue)
 * Strictly deduplicates by checking existing notifications for recipient and title.
 */
const checkAndDispatchDueReminders = async ({ student_id = null, assignment_id = null, req = null } = {}) => {
  try {
    const candidates = await Assignment.findPendingDueReminders({ student_id, assignment_id });
    const dispatched = [];

    for (const candidate of candidates) {
      // Check deduplication: no duplicate notification for same recipient and title
      const [existingRows] = await pool.query(
        'SELECT notification_id FROM notifications WHERE recipient_user_id = ? AND title = ? LIMIT 1',
        [candidate.student_user_id, candidate.notification_title]
      );

      if (existingRows.length === 0) {
        const dueDateFormatted = candidate.due_date
          ? new Date(candidate.due_date).toLocaleString()
          : '';

        const courseDisplay = candidate.course_name
          ? `${candidate.course_code} - ${candidate.course_name}`
          : (candidate.course_code || 'Course');

        const msg = candidate.isOverdue
          ? `Assignment "${candidate.title}" for course ${courseDisplay} is overdue (was due on ${dueDateFormatted}). Please submit as soon as possible.`
          : `Assignment "${candidate.title}" for course ${courseDisplay} is due soon (${dueDateFormatted}). Please submit before the deadline.`;

        await notificationModel.createNotification({
          recipient_user_id: candidate.student_user_id,
          title: candidate.notification_title,
          message: msg,
          notification_type: 'Assignment',
          metadata: {
            emailNotificationType: candidate.isOverdue ? 'ASSIGNMENT_OVERDUE' : 'ASSIGNMENT_DUE_SOON',
            assignmentId: candidate.assignment_id,
            assignmentTitle: candidate.title,
            title: candidate.title,
            course: courseDisplay,
            courseCode: candidate.course_code,
            courseName: candidate.course_name,
            dueDate: candidate.due_date,
            isOverdue: candidate.isOverdue
          },
          eventId: `ASSIGNMENT_${candidate.assignment_id}_${candidate.isOverdue ? 'OVERDUE' : 'DUE_SOON'}`
        });

        await createAuditLog({
          userId: candidate.student_user_id,
          action: candidate.isOverdue ? 'ASSIGNMENT_MARKED_OVERDUE' : 'ASSIGNMENT_DUE_REMINDER_SENT',
          entity: 'ASSIGNMENT',
          entityId: candidate.assignment_id,
          description: `Sent reminder "${candidate.notification_title}" to student ${candidate.student_name}`,
          details: {
            assignment_id: candidate.assignment_id,
            student_id: candidate.student_id,
            student_user_id: candidate.student_user_id,
            due_date: candidate.due_date,
            type: candidate.isOverdue ? 'OVERDUE' : 'DUE_SOON'
          },
          req
        });

        dispatched.push({
          assignment_id: candidate.assignment_id,
          student_id: candidate.student_id,
          student_user_id: candidate.student_user_id,
          title: candidate.notification_title
        });
      }
    }

    return dispatched;
  } catch (err) {
    console.error('Error checking and dispatching due reminders:', err);
    return [];
  }
};

/**
 * GET /api/assignments
 * List assignments with role-based scoping:
 * - TEACHER: ONLY assignments created by that logged-in teacher
 * - STUDENT: ONLY assignments for actively enrolled courses
 * - ADMIN: all assignments with optional filters
 */
const getAssignments = async (req, res) => {
  try {
    const {
      page,
      limit,
      search,
      course_id,
      teacher_id,
      semester,
      academic_year,
      due_status
    } = req.query;

    let effectiveTeacherId = teacher_id;
    let effectiveStudentId = null;

    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return res.status(403).json({
          success: false,
          message: 'No faculty profile associated with your account'
        });
      }
      effectiveTeacherId = teacherProfile.teacher_id;
    } else if (req.user.role === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(req.user.user_id);
      if (!studentProfile) {
        return res.status(403).json({
          success: false,
          message: 'No student profile associated with your account'
        });
      }
      effectiveStudentId = studentProfile.student_id;
      // Auto-check due-date reminders for this enrolled student
      try {
        await checkAndDispatchDueReminders({ student_id: effectiveStudentId, req });
      } catch (remErr) {
        console.warn('Failed checking due reminders on student assignment list:', remErr.message);
      }
    }

    const result = await Assignment.getAssignments({
      page,
      limit,
      search,
      course_id,
      teacher_id: effectiveTeacherId,
      student_id: effectiveStudentId,
      semester,
      academic_year,
      due_status
    });

    return res.status(200).json({
      success: true,
      message: 'Assignments fetched successfully',
      data: result
    });
  } catch (err) {
    console.error('Error fetching assignments:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching assignments'
    });
  }
};

/**
 * GET /api/assignments/stats
 * Summary KPI statistics
 */
const getAssignmentStats = async (req, res) => {
  try {
    let effectiveTeacherId = null;
    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (teacherProfile) {
        effectiveTeacherId = teacherProfile.teacher_id;
      }
    }

    const stats = await Assignment.getAssignmentStats(effectiveTeacherId);
    return res.status(200).json({
      success: true,
      message: 'Assignment statistics fetched successfully',
      data: { stats }
    });
  } catch (err) {
    console.error('Error fetching assignment statistics:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching assignment statistics'
    });
  }
};

/**
 * GET /api/assignments/:id
 * Get single assignment by ID with strict backend authorization
 */
const getAssignmentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment ID provided'
      });
    }

    let studentId = null;
    let teacherProfile = null;

    if (req.user.role === 'TEACHER') {
      teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return res.status(403).json({
          success: false,
          message: 'No faculty profile found for your account'
        });
      }
    } else if (req.user.role === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(req.user.user_id);
      if (!studentProfile) {
        return res.status(403).json({
          success: false,
          message: 'No student profile found for your account'
        });
      }
      studentId = studentProfile.student_id;
    }

    const assignment = await Assignment.getAssignmentById(id, studentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Authorization checks
    if (req.user.role === 'TEACHER' && assignment.teacher_id !== teacherProfile.teacher_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not own this assignment.'
      });
    }

    if (req.user.role === 'STUDENT') {
      const isEnrolled = await Assignment.checkStudentEnrollment(studentId, assignment.course_id);
      if (!isEnrolled) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not actively enrolled in this course.'
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Assignment details retrieved successfully',
      data: { assignment }
    });
  } catch (err) {
    console.error('Error retrieving assignment:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving assignment details'
    });
  }
};

/**
 * POST /api/assignments
 * Create a new assignment with Teacher Course Authorization & Enrolled Student Notifications
 */
const createAssignment = async (req, res) => {
  try {
    const {
      course_id,
      title,
      description,
      due_date,
      max_marks,
      file_path
    } = req.body;

    let effectiveTeacherId = req.body.teacher_id;

    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return res.status(403).json({
          success: false,
          message: 'No faculty profile found for your account'
        });
      }
      effectiveTeacherId = teacherProfile.teacher_id;

      // Authoritative Course Check: course MUST be assigned to this teacher via timetable
      const isAssigned = await Assignment.checkTeacherCourseAssignment(teacherProfile.teacher_id, course_id);
      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not authorized to create assignments for this course.'
        });
      }
    }

    // Validate required fields
    if (!course_id || !isValidId(course_id)) {
      return res.status(400).json({
        success: false,
        message: 'A valid course_id is required'
      });
    }

    if (!effectiveTeacherId || !isValidId(effectiveTeacherId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid teacher_id is required'
      });
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Assignment title is required'
      });
    }

    if (title.trim().length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Assignment title cannot exceed 200 characters'
      });
    }

    if (!due_date || !isValidDateTime(due_date)) {
      return res.status(400).json({
        success: false,
        message: 'A valid due_date is required'
      });
    }

    // Validate max_marks
    let parsedMaxMarks = 100.00;
    if (max_marks !== undefined && max_marks !== null && max_marks !== '') {
      const parsed = parseFloat(max_marks);
      if (isNaN(parsed) || parsed <= 0 || parsed > 1000) {
        return res.status(400).json({
          success: false,
          message: 'max_marks must be a positive number greater than 0.00 (up to 1000.00)'
        });
      }
      parsedMaxMarks = Math.round(parsed * 100) / 100;
    }

    if (file_path && !isSafeFilePathOrUrl(file_path)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or unsafe file_path provided. Disallowed protocols or file types detected.'
      });
    }

    // Verify course exists
    const courseExists = await Assignment.checkCourseExists(course_id);
    if (!courseExists) {
      return res.status(400).json({
        success: false,
        message: `Referenced course ID ${course_id} does not exist`
      });
    }

    const newAssignment = await Assignment.createAssignment({
      course_id,
      teacher_id: effectiveTeacherId,
      title: title.trim(),
      description: description ? String(description).trim() : null,
      due_date: toMySQLDateTime(due_date),
      max_marks: parsedMaxMarks,
      file_path: file_path ? String(file_path).trim() : null
    });

    // Audit Log
    await createAuditLog({
      userId: req.user.user_id,
      action: 'ASSIGNMENT_CREATED',
      entity: 'ASSIGNMENT',
      entityId: newAssignment.assignment_id,
      description: `Created assignment "${newAssignment.title}" for Course #${course_id}`,
      details: { assignment_id: newAssignment.assignment_id, course_id, teacher_id: effectiveTeacherId, title: newAssignment.title },
      req
    });

    // Notify all actively enrolled students in this course
    try {
      const enrolledUserIds = await Assignment.getEnrolledStudentUserIds(course_id);
      const courseDisplay = newAssignment.course_name
        ? `${newAssignment.course_code} - ${newAssignment.course_name}`
        : (newAssignment.course_code || 'Course');
      const formattedDueDate = new Date(newAssignment.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      for (const uid of enrolledUserIds) {
        await notificationModel.createNotification({
          recipient_user_id: uid,
          title: `New Assignment: ${newAssignment.title}`,
          message: `A new assignment "${newAssignment.title}" has been published for ${courseDisplay}. Deadline: ${formattedDueDate}.`,
          notification_type: 'Assignment',
          metadata: {
            emailNotificationType: 'NEW_ASSIGNMENT',
            assignmentId: newAssignment.assignment_id,
            assignmentTitle: newAssignment.title,
            title: newAssignment.title,
            course: courseDisplay,
            courseCode: newAssignment.course_code,
            courseName: newAssignment.course_name,
            dueDate: newAssignment.due_date,
            teacher: newAssignment.teacher_name || req.user?.full_name || req.user?.username || null
          },
          eventId: `ASSIGNMENT_${newAssignment.assignment_id}`
        });
      }
    } catch (notifErr) {
      console.warn('Could not dispatch assignment notifications:', notifErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Assignment created successfully',
      data: { assignment: newAssignment }
    });
  } catch (err) {
    console.error('Error creating assignment:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating assignment'
    });
  }
};

/**
 * PUT /api/assignments/:id
 * Update an existing assignment with Teacher Ownership & Course validation
 */
const updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment ID provided'
      });
    }

    const existing = await Assignment.getAssignmentById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile || existing.teacher_id !== teacherProfile.teacher_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have permission to modify this assignment.'
        });
      }

      // If course_id is changing, verify assigned course
      if (req.body.course_id && req.body.course_id !== existing.course_id) {
        const isAssigned = await Assignment.checkTeacherCourseAssignment(teacherProfile.teacher_id, req.body.course_id);
        if (!isAssigned) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: You are not assigned to instruct the selected course.'
          });
        }
      }
    }

    const {
      course_id,
      teacher_id,
      title,
      description,
      due_date,
      max_marks,
      file_path
    } = req.body;

    const updatePayload = {};

    if (course_id !== undefined) {
      if (!isValidId(course_id)) {
        return res.status(400).json({
          success: false,
          message: 'A valid course_id is required'
        });
      }
      updatePayload.course_id = parseInt(course_id, 10);
    }

    if (teacher_id !== undefined && req.user.role === 'ADMIN') {
      if (!isValidId(teacher_id)) {
        return res.status(400).json({
          success: false,
          message: 'A valid teacher_id is required'
        });
      }
      updatePayload.teacher_id = parseInt(teacher_id, 10);
    }

    if (title !== undefined) {
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Assignment title cannot be empty'
        });
      }
      updatePayload.title = title.trim();
    }

    if (description !== undefined) {
      updatePayload.description = description && String(description).trim() ? String(description).trim() : null;
    }

    if (due_date !== undefined) {
      if (!isValidDateTime(due_date)) {
        return res.status(400).json({
          success: false,
          message: 'A valid due_date is required'
        });
      }
      updatePayload.due_date = toMySQLDateTime(due_date);
    }

    if (max_marks !== undefined) {
      const parsed = parseFloat(max_marks);
      if (isNaN(parsed) || parsed <= 0 || parsed > 1000) {
        return res.status(400).json({
          success: false,
          message: 'max_marks must be a positive number greater than 0.00 (up to 1000.00)'
        });
      }
      updatePayload.max_marks = Math.round(parsed * 100) / 100;
    }

    if (file_path !== undefined) {
      if (file_path && !isSafeFilePathOrUrl(file_path)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or unsafe file_path provided'
        });
      }
      updatePayload.file_path = file_path && String(file_path).trim() ? String(file_path).trim() : null;
    }

    const updated = await Assignment.updateAssignment(id, updatePayload);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'ASSIGNMENT_UPDATED',
      entity: 'ASSIGNMENT',
      entityId: id,
      description: `Updated assignment "${updated.title}" (#${id})`,
      details: { assignment_id: id, title: updated.title, course_id: updated.course_id },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Assignment updated successfully',
      data: { assignment: updated }
    });
  } catch (err) {
    console.error('Error updating assignment:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating assignment'
    });
  }
};

/**
 * DELETE /api/assignments/:id
 * Delete an assignment with strict teacher ownership check and file cleanup
 */
const deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment ID provided'
      });
    }

    const existing = await Assignment.getAssignmentById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile || existing.teacher_id !== teacherProfile.teacher_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have permission to delete this assignment.'
        });
      }
    }

    const { success, filesToDelete } = await Assignment.deleteAssignment(id);
    if (!success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete assignment'
      });
    }

    // Clean up physical files from disk
    if (Array.isArray(filesToDelete)) {
      for (const relativePath of filesToDelete) {
        try {
          const absolutePath = path.resolve(BASE_UPLOADS, relativePath.replace(/^(\/|\\)?uploads(\/|\\)/, ''));
          if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
          }
        } catch (fileErr) {
          console.warn('Could not delete physical file:', relativePath, fileErr.message);
        }
      }
    }

    await createAuditLog({
      userId: req.user.user_id,
      action: 'ASSIGNMENT_DELETED',
      entity: 'ASSIGNMENT',
      entityId: id,
      description: `Deleted assignment "${existing.title}" (#${id})`,
      details: { assignment_id: id, title: existing.title, course_id: existing.course_id },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Assignment deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting assignment:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting assignment'
    });
  }
};

/**
 * GET /api/assignments/:id/submissions
 * View submissions for an assignment (Teacher Assignment Ownership enforced)
 */
const getAssignmentSubmissions = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment ID provided'
      });
    }

    const assignment = await Assignment.getAssignmentById(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile || assignment.teacher_id !== teacherProfile.teacher_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not authorized to view submissions for this assignment.'
        });
      }
    }

    const submissionData = await Assignment.getAssignmentSubmissions(id);
    return res.status(200).json({
      success: true,
      message: 'Assignment submissions retrieved successfully',
      data: submissionData
    });
  } catch (err) {
    console.error('Error fetching assignment submissions:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving submissions'
    });
  }
};

/**
 * POST /api/assignments/:id/submit
 * Student assignment solution upload with validation and audit logging
 */
const submitAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment ID provided'
      });
    }

    const studentProfile = await studentModel.findByUserId(req.user.user_id);
    if (!studentProfile) {
      return res.status(403).json({
        success: false,
        message: 'No student profile associated with your account'
      });
    }

    const assignment = await Assignment.getAssignmentById(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Verify student active enrollment
    const isEnrolled = await Assignment.checkStudentEnrollment(studentProfile.student_id, assignment.course_id);
    if (!isEnrolled) {
      // Clean up uploaded file if rejected
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not actively enrolled in this course.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid document or archive file to upload.'
      });
    }

    const originalFilename = req.file.originalname;
    const relativeFilePath = `uploads/submissions/${req.file.filename}`;
    const remarks = req.body.remarks ? String(req.body.remarks).trim() : null;

    // Check if this is initial submit or resubmit
    const existingSub = await Assignment.getStudentSubmission(id, studentProfile.student_id);
    const isResubmission = Boolean(existingSub);

    // Save or update in database
    const submission = await Assignment.createOrUpdateSubmission({
      assignment_id: id,
      student_id: studentProfile.student_id,
      original_filename: originalFilename,
      file_path: relativeFilePath,
      remarks
    });

    const action = isResubmission ? 'ASSIGNMENT_RESUBMITTED' : 'ASSIGNMENT_SUBMITTED';
    await createAuditLog({
      userId: req.user.user_id,
      action,
      entity: 'ASSIGNMENT_SUBMISSION',
      entityId: submission.submission_id,
      description: `${isResubmission ? 'Resubmitted' : 'Submitted'} solution for assignment "${assignment.title}" (${submission.status})`,
      details: {
        assignment_id: id,
        student_id: studentProfile.student_id,
        status: submission.status,
        filename: originalFilename
      },
      req
    });

    // Notify teacher who owns assignment
    try {
      const teacherInfo = await Assignment.checkTeacherActive(assignment.teacher_id);
      if (teacherInfo.userId) {
        // Resolve student name properly
        let studentName = '';
        if (studentProfile.first_name || studentProfile.last_name) {
          studentName = `${studentProfile.first_name || ''} ${studentProfile.last_name || ''}`.trim();
        } else {
          const [userRows] = await pool.query(
            'SELECT first_name, last_name, username FROM users WHERE user_id = ? LIMIT 1',
            [studentProfile.user_id || req.user.user_id]
          );
          if (userRows[0]) {
            studentName = `${userRows[0].first_name || ''} ${userRows[0].last_name || ''}`.trim() || userRows[0].username;
          }
        }
        if (!studentName) studentName = studentProfile.prn_number || 'Student';

        const notifTitle = `Assignment Submission: ${assignment.title}`;
        const notifMsg = `Student ${studentName} (${studentProfile.prn_number}) ${isResubmission ? `resubmitted solution (Attempt ${submission.attempt_number})` : 'submitted solution'} for assignment "${assignment.title}". Status: ${submission.status}.`;

        // Check deduplication: avoid duplicate in-app notification for the exact same submission
        const [existingNotif] = await pool.query(
          `SELECT notification_id FROM notifications 
           WHERE recipient_user_id = ? 
             AND notification_type = 'Submission' 
             AND title = ? 
             AND message = ?
           LIMIT 1`,
          [teacherInfo.userId, notifTitle, notifMsg]
        );

        if (!existingNotif || existingNotif.length === 0) {
          await notificationModel.createNotification({
            recipient_user_id: teacherInfo.userId,
            title: notifTitle,
            message: notifMsg,
            notification_type: 'Submission'
          });
        }
      }
    } catch (notifErr) {
      console.warn('Failed to notify teacher on submission:', notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: isResubmission
        ? 'Assignment solution resubmitted successfully.'
        : 'Assignment solution submitted successfully.',
      data: { submission }
    });
  } catch (err) {
    console.error('Error submitting assignment:', err);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    return res.status(500).json({
      success: false,
      message: 'An error occurred while uploading assignment solution'
    });
  }
};

/**
 * GET /api/assignments/:id/my-submission
 * Get current student's submission for an assignment
 */
const getMySubmission = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment ID provided'
      });
    }

    const studentProfile = await studentModel.findByUserId(req.user.user_id);
    if (!studentProfile) {
      return res.status(403).json({
        success: false,
        message: 'No student profile found for your account'
      });
    }

    const submission = await Assignment.getStudentSubmission(id, studentProfile.student_id);
    return res.status(200).json({
      success: true,
      message: 'Submission retrieved',
      data: { submission }
    });
  } catch (err) {
    console.error('Error retrieving submission:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve submission'
    });
  }
};

/**
 * Helper to securely resolve and authorize submission document access
 */
const resolveSubmissionDocument = async (req, res) => {
  const { id, submissionId } = req.params;
  if (!isValidId(submissionId)) {
    return { error: { status: 400, message: 'Invalid submission ID provided' } };
  }

  const submission = await Assignment.getSubmissionById(submissionId);
  if (!submission) {
    return { error: { status: 404, message: 'Submission record not found' } };
  }

  // Authorization check:
  // - ADMIN: allowed
  // - TEACHER: must own assignment (submission.teacher_user_id === req.user.user_id)
  // - STUDENT: must own submission (submission.student_user_id === req.user.user_id)
  if (req.user.role === 'TEACHER') {
    if (submission.teacher_user_id !== req.user.user_id) {
      return { error: { status: 403, message: 'Access denied: You are not authorized to view this student document.' } };
    }
  } else if (req.user.role === 'STUDENT') {
    if (submission.student_user_id !== req.user.user_id) {
      return { error: { status: 403, message: 'Access denied: You are not authorized to view this document.' } };
    }
  }

  // Path Traversal Prevention
  const relativePart = submission.file_path.replace(/^(\/|\\)?uploads(\/|\\)submissions(\/|\\)?/, '');
  const absolutePath = path.resolve(SUBMISSIONS_DIR, relativePart);

  // Assert absolute path stays strictly inside SUBMISSIONS_DIR
  if (!absolutePath.startsWith(SUBMISSIONS_DIR)) {
    return { error: { status: 403, message: 'Security violation: Path traversal prohibited.' } };
  }

  if (!fs.existsSync(absolutePath)) {
    return { error: { status: 404, message: 'The requested submission file does not exist on the server.' } };
  }

  return { submission, absolutePath };
};

/**
 * GET /api/assignments/:id/submissions/:submissionId/download
 * Secure file download with authorization & path traversal check
 */
const downloadSubmissionDocument = async (req, res) => {
  try {
    const result = await resolveSubmissionDocument(req, res);
    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        message: result.error.message
      });
    }

    const { submission, absolutePath } = result;
    return res.download(absolutePath, submission.original_filename);
  } catch (err) {
    console.error('Error downloading submission:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to download submission document'
    });
  }
};

/**
 * GET /api/assignments/:id/submissions/:submissionId/view
 * Secure document preview with inline header
 */
const viewSubmissionDocument = async (req, res) => {
  try {
    const result = await resolveSubmissionDocument(req, res);
    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        message: result.error.message
      });
    }

    const { submission, absolutePath } = result;
    res.setHeader('Content-Disposition', `inline; filename="${submission.original_filename}"`);
    return res.sendFile(absolutePath);
  } catch (err) {
    console.error('Error viewing submission:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to preview submission document'
    });
  }
};

/**
 * POST / PUT /api/assignments/:id/submissions/:submissionId/evaluate
 * Evaluate student submission (Marks + Feedback) with strict teacher ownership check
 */
const evaluateSubmission = async (req, res) => {
  try {
    const { id, submissionId } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment ID provided'
      });
    }
    if (!isValidId(submissionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid submission ID provided'
      });
    }

    const { marks_obtained, feedback } = req.body;

    // Marks validation: required, numeric, >= 0
    if (marks_obtained === undefined || marks_obtained === null || String(marks_obtained).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Marks obtained is required'
      });
    }

    const marksNum = Number(marks_obtained);
    if (isNaN(marksNum)) {
      return res.status(400).json({
        success: false,
        message: 'Marks obtained must be a valid numeric value'
      });
    }

    if (marksNum < 0) {
      return res.status(400).json({
        success: false,
        message: 'Marks obtained cannot be negative'
      });
    }

    // Retrieve assignment
    const assignment = await Assignment.getAssignmentById(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    const maxMarks = parseFloat(assignment.max_marks) || 100;
    if (marksNum > maxMarks) {
      return res.status(400).json({
        success: false,
        message: `Marks obtained (${marksNum}) cannot exceed maximum marks (${maxMarks})`
      });
    }

    // Teacher Authorization Check:
    let evaluatedByTeacherId = assignment.teacher_id;
    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return res.status(403).json({
          success: false,
          message: 'No faculty profile associated with your user account.'
        });
      }

      if (assignment.teacher_id !== teacherProfile.teacher_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are only authorized to evaluate assignments you created.'
        });
      }

      const isCourseAssigned = await Assignment.checkTeacherCourseAssignment(teacherProfile.teacher_id, assignment.course_id);
      if (!isCourseAssigned) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Course is not assigned to you in the academic timetable.'
        });
      }

      evaluatedByTeacherId = teacherProfile.teacher_id;
    } else if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not authorized to evaluate assignments.'
      });
    }

    // Retrieve submission
    const submission = await Assignment.getSubmissionById(submissionId);
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission record not found'
      });
    }

    if (submission.assignment_id !== parseInt(id, 10)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request: Submission does not belong to the specified assignment'
      });
    }

    // Check if updating existing evaluation
    const existingEval = await Assignment.getSubmissionEvaluation(submission.submission_id);
    const isUpdate = Boolean(existingEval);

    const evaluation = await Assignment.evaluateSubmission({
      submission_id: submission.submission_id,
      assignment_id: assignment.assignment_id,
      student_id: submission.student_id,
      teacher_id: evaluatedByTeacherId,
      marks_obtained: marksNum,
      feedback: feedback && String(feedback).trim() ? String(feedback).trim() : null
    });

    // Notify student on evaluation
    try {
      if (submission.student_user_id) {
        await notificationModel.createNotification({
          recipient_user_id: submission.student_user_id,
          title: `Assignment Evaluated: ${assignment.title}`,
          message: `Your submission for "${assignment.title}" has been evaluated by faculty. Marks: ${marksNum} / ${maxMarks}. Feedback is now available.`,
          notification_type: 'Assignment',
          metadata: {
            emailNotificationType: 'ASSIGNMENT_EVALUATED',
            assignmentId: assignment.assignment_id,
            assignmentTitle: assignment.title,
            title: assignment.title,
            marks: `${marksNum} / ${maxMarks}`,
            marksObtained: marksNum,
            maxMarks: maxMarks,
            feedback: feedback || null
          },
          eventId: `ASSIGNMENT_${assignment.assignment_id}_EVAL_${submission.submission_id}`
        });
      }
    } catch (notifErr) {
      console.warn('Failed to notify student on evaluation:', notifErr.message);
    }

    // Audit Log
    await createAuditLog({
      userId: req.user.user_id,
      action: isUpdate ? 'ASSIGNMENT_EVALUATION_UPDATED' : 'ASSIGNMENT_EVALUATED',
      entity: 'assignment_evaluations',
      entityId: evaluation.evaluation_id,
      description: `${isUpdate ? 'Updated evaluation' : 'Evaluated submission'} for assignment "${assignment.title}" (Student: ${submission.student_name}, Marks: ${marksNum}/${maxMarks})`,
      details: {
        assignment_id: assignment.assignment_id,
        submission_id: submission.submission_id,
        student_id: submission.student_id,
        marks_obtained: marksNum,
        max_marks: maxMarks,
        has_feedback: Boolean(feedback && String(feedback).trim())
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: isUpdate ? 'Evaluation updated successfully' : 'Evaluation submitted successfully',
      data: { evaluation }
    });
  } catch (err) {
    console.error('Error evaluating submission:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while saving the evaluation'
    });
  }
};

/**
 * GET /api/assignments/:id/submissions/:submissionId/evaluation
 * Get evaluation details for a submission
 */
const getSubmissionEvaluation = async (req, res) => {
  try {
    const { id, submissionId } = req.params;
    if (!isValidId(id) || !isValidId(submissionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment or submission ID provided'
      });
    }

    const assignment = await Assignment.getAssignmentById(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile || assignment.teacher_id !== teacherProfile.teacher_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not authorized to view evaluations for this assignment.'
        });
      }
    }

    const submission = await Assignment.getSubmissionById(submissionId);
    if (!submission || submission.assignment_id !== parseInt(id, 10)) {
      return res.status(404).json({
        success: false,
        message: 'Submission record not found for this assignment'
      });
    }

    const evaluation = await Assignment.getSubmissionEvaluation(submissionId);
    return res.status(200).json({
      success: true,
      message: 'Evaluation retrieved successfully',
      data: {
        is_evaluated: Boolean(evaluation),
        evaluation: evaluation || null
      }
    });
  } catch (err) {
    console.error('Error fetching submission evaluation:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the evaluation'
    });
  }
};

/**
 * GET /api/assignments/:id/my-evaluation
 * Get current student's own evaluation for an assignment
 */
const getMyEvaluation = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment ID provided'
      });
    }

    const studentProfile = await studentModel.findByUserId(req.user.user_id);
    if (!studentProfile) {
      return res.status(403).json({
        success: false,
        message: 'No student profile found for your account'
      });
    }

    const assignment = await Assignment.getAssignmentById(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    const isEnrolled = await Assignment.checkStudentEnrollment(studentProfile.student_id, assignment.course_id);
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not enrolled in the course for this assignment'
      });
    }

    const evaluation = await Assignment.getStudentEvaluation(id, studentProfile.student_id);
    return res.status(200).json({
      success: true,
      message: 'Evaluation retrieved successfully',
      data: { evaluation }
    });
  } catch (err) {
    console.error('Error fetching student evaluation:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve assignment evaluation'
    });
  }
};

/**
 * Helper to securely resolve and authorize history document access
 */
const resolveHistoryDocument = async (req, res) => {
  const { id, submissionId, historyId } = req.params;
  if (!isValidId(historyId)) {
    return { error: { status: 400, message: 'Invalid history ID provided' } };
  }

  const history = await Assignment.getHistoryDocumentById(historyId);
  if (!history) {
    return { error: { status: 404, message: 'Historical submission record not found' } };
  }

  if (id && isValidId(id) && history.assignment_id !== parseInt(id, 10)) {
    return { error: { status: 400, message: 'History record does not belong to specified assignment' } };
  }

  if (submissionId && isValidId(submissionId) && history.submission_id !== parseInt(submissionId, 10)) {
    return { error: { status: 400, message: 'History record does not belong to specified submission' } };
  }

  // Authorization check:
  // - ADMIN: allowed
  // - TEACHER: must own assignment OR course assignment
  // - STUDENT: must own submission
  if (req.user.role === 'TEACHER') {
    const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
    if (!teacherProfile) {
      return { error: { status: 403, message: 'No faculty profile associated with your account' } };
    }
    const isOwner = (history.teacher_id === teacherProfile.teacher_id);
    const isAssigned = await Assignment.checkTeacherCourseAssignment(teacherProfile.teacher_id, history.course_id);
    if (!isOwner && !isAssigned) {
      return { error: { status: 403, message: 'Access denied: You are not authorized to view this document.' } };
    }
  } else if (req.user.role === 'STUDENT') {
    if (history.student_user_id !== req.user.user_id) {
      return { error: { status: 403, message: 'Access denied: You are not authorized to view this document.' } };
    }
  }

  // Path Traversal Prevention
  const relativePart = history.file_path.replace(/^(\/|\\)?uploads(\/|\\)submissions(\/|\\)?/, '');
  const absolutePath = path.resolve(SUBMISSIONS_DIR, relativePart);

  if (!absolutePath.startsWith(SUBMISSIONS_DIR)) {
    return { error: { status: 403, message: 'Security violation: Path traversal prohibited.' } };
  }

  if (!fs.existsSync(absolutePath)) {
    return { error: { status: 404, message: 'The requested submission file does not exist on the server.' } };
  }

  return { history, absolutePath };
};

/**
 * GET /api/assignments/:id/submissions/:submissionId/history/:historyId/download
 * Secure file download for historical submission attempts
 */
const downloadHistoryDocument = async (req, res) => {
  try {
    const result = await resolveHistoryDocument(req, res);
    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        message: result.error.message
      });
    }

    const { history, absolutePath } = result;
    return res.download(absolutePath, history.original_filename);
  } catch (err) {
    console.error('Error downloading history submission:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to download historical submission document'
    });
  }
};

/**
 * GET /api/assignments/:id/submissions/:submissionId/history/:historyId/view
 * Secure document preview for historical submission attempts
 */
const viewHistoryDocument = async (req, res) => {
  try {
    const result = await resolveHistoryDocument(req, res);
    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        message: result.error.message
      });
    }

    const { history, absolutePath } = result;
    res.setHeader('Content-Disposition', `inline; filename="${history.original_filename}"`);
    return res.sendFile(absolutePath);
  } catch (err) {
    console.error('Error viewing history submission:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to preview historical submission document'
    });
  }
};

/**
 * GET /api/assignments/:id/submissions/:submissionId/history
 * Fetch all submission attempts for a student submission
 * Access: ADMIN, TEACHER (assignment owner or course assigned), STUDENT (own submission)
 */
const getSubmissionHistory = async (req, res) => {
  try {
    const { id, submissionId } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid assignment ID provided' });
    }
    if (!isValidId(submissionId)) {
      return res.status(400).json({ success: false, message: 'Invalid submission ID provided' });
    }

    const submission = await Assignment.getSubmissionById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }
    if (submission.assignment_id !== parseInt(id, 10)) {
      return res.status(400).json({ success: false, message: 'Submission does not belong to specified assignment' });
    }

    // Role-based authorization
    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return res.status(403).json({ success: false, message: 'No faculty profile associated with your account' });
      }
      const isOwner = (submission.teacher_id === teacherProfile.teacher_id);
      const isAssigned = await Assignment.checkTeacherCourseAssignment(teacherProfile.teacher_id, submission.course_id);
      if (!isOwner && !isAssigned) {
        return res.status(403).json({ success: false, message: 'Access denied: You do not have permission to view submissions for this assignment' });
      }
    } else if (req.user.role === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(req.user.user_id);
      if (!studentProfile || submission.student_id !== studentProfile.student_id) {
        return res.status(403).json({ success: false, message: 'Access denied: You can only view your own submission history' });
      }
    }

    const history = await Assignment.getSubmissionHistory(id, submission.student_id);
    return res.status(200).json({
      success: true,
      message: 'Submission history retrieved successfully',
      data: {
        history,
        total_attempts: history.length,
        current_attempt: submission.attempt_number || 1
      }
    });
  } catch (err) {
    console.error('Error fetching submission history:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve submission history' });
  }
};

/**
 * GET /api/assignments/:id/my-history
 * Student fetches their own submission history for an assignment
 * Access: STUDENT
 */
const getMySubmissionHistory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid assignment ID provided' });
    }

    const studentProfile = await studentModel.findByUserId(req.user.user_id);
    if (!studentProfile) {
      return res.status(403).json({ success: false, message: 'No student profile found for your account' });
    }

    const assignment = await Assignment.getAssignmentById(id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const isEnrolled = await Assignment.checkStudentEnrollment(studentProfile.student_id, assignment.course_id);
    if (!isEnrolled) {
      return res.status(403).json({ success: false, message: 'Access denied: You are not enrolled in the course for this assignment' });
    }

    const history = await Assignment.getSubmissionHistory(id, studentProfile.student_id);
    return res.status(200).json({
      success: true,
      message: 'Submission history retrieved successfully',
      data: {
        history,
        total_attempts: history.length
      }
    });
  } catch (err) {
    console.error('Error fetching student submission history:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve submission history' });
  }
};

/**
 * POST /api/assignments/reminders/check
 * Trigger due-date reminder checks (due soon <= 3 days, overdue)
 * Access: ADMIN, TEACHER, STUDENT
 */
const checkDueReminders = async (req, res) => {
  try {
    const { assignment_id } = req.body || {};
    let studentId = null;

    if (req.user.role === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(req.user.user_id);
      if (studentProfile) {
        studentId = studentProfile.student_id;
      }
    } else if (req.body?.student_id && isValidId(req.body.student_id)) {
      studentId = parseInt(req.body.student_id, 10);
    }

    const dispatched = await checkAndDispatchDueReminders({
      student_id: studentId,
      assignment_id: assignment_id && isValidId(assignment_id) ? parseInt(assignment_id, 10) : null,
      req
    });

    return res.status(200).json({
      success: true,
      message: `Checked due reminders successfully. ${dispatched.length} notification(s) dispatched.`,
      data: { dispatched, count: dispatched.length }
    });
  } catch (err) {
    console.error('Error in checkDueReminders controller:', err);
    return res.status(500).json({ success: false, message: 'Failed to check due reminders' });
  }
};

module.exports = {
  getAssignments,
  getAssignmentStats,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getAssignmentSubmissions,
  submitAssignment,
  getMySubmission,
  downloadSubmissionDocument,
  viewSubmissionDocument,
  evaluateSubmission,
  getSubmissionEvaluation,
  getMyEvaluation,
  getSubmissionHistory,
  getMySubmissionHistory,
  downloadHistoryDocument,
  viewHistoryDocument,
  checkDueReminders
};
