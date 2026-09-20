const Query = require('../models/query.model');
const Notification = require('../models/notification.model');
const { createAuditLog } = require('../services/audit.service');

/**
 * Validate positive integer ID
 */
const isValidId = (id) => {
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0 && String(parsed) === String(id).trim();
};

/**
 * GET /api/queries
 * Get paginated list of queries based on user role and filters
 */
const getQueries = async (req, res) => {
  try {
    const {
      page,
      limit,
      search,
      status,
      priority,
      course_id,
      teacher_id,
      student_id,
      from_date,
      to_date
    } = req.query;

    const result = await Query.getQueries({
      role: req.user.role,
      userId: req.user.user_id,
      page,
      limit,
      search,
      status,
      priority,
      course_id,
      teacher_id,
      student_id,
      from_date,
      to_date
    });

    return res.status(200).json({
      success: true,
      message: 'Queries retrieved successfully',
      data: result
    });
  } catch (err) {
    console.error('Error fetching queries:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching queries'
    });
  }
};

/**
 * GET /api/queries/stats
 * Dashboard KPI statistics for queries
 */
const getQueryStats = async (req, res) => {
  try {
    const stats = await Query.getQueryStats({
      role: req.user.role,
      userId: req.user.user_id
    });

    return res.status(200).json({
      success: true,
      message: 'Query statistics retrieved successfully',
      data: stats
    });
  } catch (err) {
    console.error('Error fetching query statistics:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching query statistics'
    });
  }
};

/**
 * GET /api/queries/teachers
 * Helper list of active teachers for dropdown selection
 */
const getActiveTeachers = async (req, res) => {
  try {
    const teachers = await Query.getActiveTeachers();
    return res.status(200).json({
      success: true,
      message: 'Active teachers retrieved successfully',
      data: teachers
    });
  } catch (err) {
    console.error('Error fetching active teachers:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching active teachers'
    });
  }
};

/**
 * GET /api/queries/courses
 * Helper list of relevant courses for dropdown selection
 */
const getAvailableCourses = async (req, res) => {
  try {
    const studentUserId = req.user.role === 'STUDENT' ? req.user.user_id : null;
    const courses = await Query.getAvailableCourses(studentUserId);
    return res.status(200).json({
      success: true,
      message: 'Courses retrieved successfully',
      data: courses
    });
  } catch (err) {
    console.error('Error fetching courses:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching courses'
    });
  }
};

/**
 * GET /api/queries/:id
 * Get single query with full conversation thread and replies
 */
const getQueryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query ID'
      });
    }

    const query = await Query.getQueryById(id);
    if (!query) {
      return res.status(404).json({
        success: false,
        message: 'Query not found'
      });
    }

    // Role-Based IDOR Enforcement
    if (req.user.role === 'STUDENT' && query.asked_by_user_id !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only view your own queries'
      });
    }

    if (req.user.role === 'TEACHER' && query.assigned_to_user_id !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only view queries assigned to you'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Query retrieved successfully',
      data: query
    });
  } catch (err) {
    console.error('Error fetching query details:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching query details'
    });
  }
};

/**
 * POST /api/queries
 * Create a new student query
 */
const createQuery = async (req, res) => {
  try {
    // Teachers cannot create queries
    if (req.user.role === 'TEACHER') {
      return res.status(403).json({
        success: false,
        message: 'Teachers cannot submit student queries'
      });
    }

    const {
      assigned_to_user_id,
      course_id,
      subject,
      question,
      message,
      priority,
      asked_by_user_id
    } = req.body;

    const queryText = (question || message || '').trim();
    const querySubject = (subject || '').trim();

    // Validation: Subject
    if (!querySubject) {
      return res.status(400).json({
        success: false,
        message: 'Subject is required'
      });
    }
    if (querySubject.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Subject must not exceed 200 characters'
      });
    }

    // Validation: Question/Message body
    if (!queryText) {
      return res.status(400).json({
        success: false,
        message: 'Question message is required'
      });
    }

    // Validation: Assigned teacher
    if (!assigned_to_user_id) {
      return res.status(400).json({
        success: false,
        message: 'Assigned teacher is required'
      });
    }
    const teacherCheck = await Query.checkTeacherAvailable(assigned_to_user_id);
    if (!teacherCheck.exists) {
      return res.status(400).json({
        success: false,
        message: 'Selected teacher does not exist'
      });
    }
    if (!teacherCheck.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Selected teacher account is not active'
      });
    }

    // Validation: Course (optional)
    if (course_id) {
      const courseExists = await Query.checkCourseExists(course_id);
      if (!courseExists) {
        return res.status(400).json({
          success: false,
          message: 'Selected course does not exist'
        });
      }
    }

    // Validation: Priority
    const validPriorities = ['Low', 'Medium', 'High'];
    const selectedPriority = priority && validPriorities.includes(priority) ? priority : 'Medium';

    // Determine asked_by_user_id
    let studentUserId = req.user.user_id;
    if (req.user.role === 'ADMIN' && asked_by_user_id) {
      studentUserId = parseInt(asked_by_user_id, 10);
    }

    const newQuery = await Query.createQuery({
      asked_by_user_id: studentUserId,
      assigned_to_user_id: parseInt(assigned_to_user_id, 10),
      course_id: course_id ? parseInt(course_id, 10) : null,
      subject: querySubject,
      question: queryText,
      priority: selectedPriority
    });

    // Automated Notification to assigned teacher
    await Notification.createNotification({
      recipient_user_id: newQuery.assigned_to_user_id,
      title: `New Student Query: ${newQuery.subject}`,
      message: `${newQuery.student_name} submitted a new query (${newQuery.priority} priority): "${newQuery.subject}".`,
      notification_type: 'Query',
      is_read: 0
    }).catch((notifErr) => {
      console.error('Failed to dispatch notification to teacher:', notifErr.message);
    });

    await createAuditLog({
      userId: req.user.user_id,
      action: 'QUERY_CREATED',
      entity: 'QUERY',
      entityId: newQuery.query_id,
      description: `Submitted academic query "${newQuery.subject}"`,
      details: { query_id: newQuery.query_id, subject: newQuery.subject, priority: newQuery.priority },
      req
    });

    return res.status(201).json({
      success: true,
      message: 'Query submitted successfully',
      data: newQuery
    });
  } catch (err) {
    console.error('Error creating query:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating query'
    });
  }
};

/**
 * POST /api/queries/:id/replies
 * Add a reply to an existing query conversation
 */
const addReply = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query ID'
      });
    }

    const query = await Query.getQueryById(id);
    if (!query) {
      return res.status(404).json({
        success: false,
        message: 'Query not found'
      });
    }

    // Role-Based IDOR Enforcement
    if (req.user.role === 'STUDENT' && query.asked_by_user_id !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only reply to your own queries'
      });
    }

    if (req.user.role === 'TEACHER' && query.assigned_to_user_id !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only reply to queries assigned to you'
      });
    }

    // Check if query is closed
    if (query.status === 'Closed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reply to a closed query. Please reopen the query first.'
      });
    }

    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reply message cannot be empty'
      });
    }

    const isTeacher = req.user.role === 'TEACHER';
    const reply = await Query.addReply({
      query_id: query.query_id,
      sender_user_id: req.user.user_id,
      message: message.trim(),
      isTeacher
    });

    // Automated Notification dispatch
    if (isTeacher || req.user.role === 'ADMIN') {
      // Teacher or Admin reply -> Notify Student
      const senderTitle = isTeacher ? (query.teacher_name || 'Your teacher') : 'Administrator';
      await Notification.createNotification({
        recipient_user_id: query.asked_by_user_id,
        title: `Reply on Query: ${query.subject}`,
        message: `${senderTitle} replied to your query: "${message.trim().slice(0, 120)}${message.trim().length > 120 ? '...' : ''}"`,
        notification_type: 'Query',
        is_read: 0
      }).catch((notifErr) => {
        console.error('Failed to dispatch notification to student:', notifErr.message);
      });
    } else {
      // Student reply -> Notify Teacher
      await Notification.createNotification({
        recipient_user_id: query.assigned_to_user_id,
        title: `Student Reply: ${query.subject}`,
        message: `${query.student_name} replied to query "${query.subject}": "${message.trim().slice(0, 120)}${message.trim().length > 120 ? '...' : ''}"`,
        notification_type: 'Query',
        is_read: 0
      }).catch((notifErr) => {
        console.error('Failed to dispatch notification to teacher:', notifErr.message);
      });
    }

    await createAuditLog({
      userId: req.user.user_id,
      action: 'QUERY_REPLIED',
      entity: 'QUERY',
      entityId: query.query_id,
      description: `Replied to query "${query.subject}" (#${query.query_id})`,
      details: { query_id: query.query_id, reply_id: reply.reply_id },
      req
    });

    return res.status(201).json({
      success: true,
      message: 'Reply posted successfully',
      data: reply
    });
  } catch (err) {
    console.error('Error posting reply:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while posting reply'
    });
  }
};

/**
 * PATCH /api/queries/:id/status
 * Update query resolution status
 */
const updateQueryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query ID'
      });
    }

    const query = await Query.getQueryById(id);
    if (!query) {
      return res.status(404).json({
        success: false,
        message: 'Query not found'
      });
    }

    const { status } = req.body;
    const validStatuses = ['Open', 'Pending', 'In Progress', 'Resolved', 'Answered', 'Closed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: ${validStatuses.join(', ')}`
      });
    }

    // Role-Based Status Transition Permissions
    if (req.user.role === 'STUDENT') {
      if (query.asked_by_user_id !== req.user.user_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You can only update your own queries'
        });
      }
      // Students can close their query or reopen it
      if (status !== 'Closed' && status !== 'Open') {
        return res.status(403).json({
          success: false,
          message: 'Students can only mark queries as Closed or Open'
        });
      }
    } else if (req.user.role === 'TEACHER') {
      if (query.assigned_to_user_id !== req.user.user_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You can only update queries assigned to you'
        });
      }
      // Teachers can transition to In Progress, Resolved, or Closed
      if (!['In Progress', 'Resolved', 'Closed', 'Open'].includes(status)) {
        return res.status(403).json({
          success: false,
          message: 'Invalid status transition for teacher'
        });
      }
    }

    const updated = await Query.updateQueryStatus(id, status);

    // Send notification if resolved or closed by faculty/admin
    if ((status === 'Resolved' || status === 'Closed') && req.user.role !== 'STUDENT') {
      await Notification.createNotification({
        recipient_user_id: query.asked_by_user_id,
        title: `Query ${status}: ${query.subject}`,
        message: `Your query "${query.subject}" has been marked as ${status} by faculty.`,
        notification_type: 'Query',
        is_read: 0
      }).catch((notifErr) => {
        console.error('Failed to notify student on query status change:', notifErr.message);
      });
    }

    const auditAction = status === 'Resolved' ? 'QUERY_RESOLVED' : (status === 'Closed' ? 'QUERY_CLOSED' : 'QUERY_UPDATED');
    await createAuditLog({
      userId: req.user.user_id,
      action: auditAction,
      entity: 'QUERY',
      entityId: id,
      description: `Updated query #${id} status to ${status}`,
      details: { query_id: id, new_status: status },
      req
    });

    return res.status(200).json({
      success: true,
      message: `Query status updated to ${status} successfully`,
      data: updated
    });
  } catch (err) {
    console.error('Error updating query status:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating query status'
    });
  }
};

/**
 * DELETE /api/queries/:id
 * Administrative deletion of query
 */
const deleteQuery = async (req, res) => {
  try {
    // Only Admin can delete queries
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only administrators can delete queries'
      });
    }

    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query ID'
      });
    }

    const query = await Query.getQueryById(id);
    if (!query) {
      return res.status(404).json({
        success: false,
        message: 'Query not found'
      });
    }

    await Query.deleteQuery(id);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'QUERY_DELETED',
      entity: 'QUERY',
      entityId: id,
      description: `Deleted query #${id} ("${query.subject}")`,
      details: { query_id: id, subject: query.subject },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Query deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting query:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting query'
    });
  }
};

module.exports = {
  getQueries,
  getQueryStats,
  getActiveTeachers,
  getAvailableCourses,
  getQueryById,
  createQuery,
  addReply,
  updateQueryStatus,
  deleteQuery
};
