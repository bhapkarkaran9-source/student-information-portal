const teacherFeedbackModel = require('../models/teacherFeedback.model');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * ============================================================================
 * TEACHER FEEDBACK CONTROLLER
 * Strict RBAC: TEACHER only
 * Strict Isolation: created_by = req.user.user_id
 * Strict Anti-Self-Evaluation: No own courses or self-evaluation
 * Strict Anonymity: Zero individual answers exposed in roster, aggregated analytics
 * ============================================================================
 */

/**
 * 1. GET /api/teacher/feedback/forms
 * List feedback forms created by the authenticated teacher
 */
const getTeacherForms = async (req, res, next) => {
  try {
    const teacher = await teacherFeedbackModel.getTeacherProfileByUserId(req.user.user_id);
    if (!teacher) {
      return errorResponse(res, 404, 'Teacher profile not found for this user');
    }

    const result = await teacherFeedbackModel.getTeacherForms(req.user.user_id, req.query);
    return successResponse(res, 200, 'Feedback forms retrieved successfully', result);
  } catch (error) {
    next(error);
  }
};

/**
 * 2. GET /api/teacher/feedback/forms/:id
 * Get details of a single feedback form created by the authenticated teacher
 */
const getTeacherFormById = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const result = await teacherFeedbackModel.getTeacherFormById(formId, req.user.user_id);
    if (result.notFound) {
      return errorResponse(res, 404, 'Feedback form not found');
    }
    if (result.forbidden) {
      return errorResponse(res, 403, 'Access denied. You can only view feedback forms created by you');
    }

    return successResponse(res, 200, 'Feedback form retrieved successfully', result.form);
  } catch (error) {
    next(error);
  }
};

/**
 * 3. POST /api/teacher/feedback/forms
 * Create feedback form as teacher with anti-self-evaluation enforcement
 */
const createTeacherForm = async (req, res, next) => {
  try {
    const teacher = await teacherFeedbackModel.getTeacherProfileByUserId(req.user.user_id);
    if (!teacher) {
      return errorResponse(res, 404, 'Teacher profile not found for this user');
    }

    const {
      title,
      description,
      target_type,
      target_id,
      academic_year,
      semester,
      start_date,
      end_date,
      is_active
    } = req.body;

    // 1. Validate title
    if (!title || !title.trim()) {
      return errorResponse(res, 400, 'Title is required');
    }

    // 2. Validate target_type
    const allowedTargetTypes = ['COURSE', 'TEACHER', 'GENERAL', 'EVENT'];
    const normalizedTargetType = target_type ? target_type.toUpperCase().trim() : '';
    if (!allowedTargetTypes.includes(normalizedTargetType)) {
      return errorResponse(res, 400, `Invalid target_type. Must be one of: ${allowedTargetTypes.join(', ')}`);
    }

    // 3. Anti-Self-Evaluation Validation (Rule 2)
    const check = await teacherFeedbackModel.validateAntiSelfEvaluation(
      teacher.teacher_id,
      normalizedTargetType,
      target_id
    );
    if (!check.valid) {
      return errorResponse(res, check.status || 400, check.message);
    }

    // 4. Validate dates
    if (!start_date || !end_date) {
      return errorResponse(res, 400, 'Both start_date and end_date are required');
    }

    const startDateObj = new Date(start_date);
    const endDateObj = new Date(end_date);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return errorResponse(res, 400, 'Invalid start_date or end_date format');
    }

    if (startDateObj >= endDateObj) {
      return errorResponse(res, 400, 'start_date must be strictly earlier than end_date');
    }

    // 5. Create form with created_by = teacher's user_id
    const formId = await teacherFeedbackModel.createTeacherForm({
      title: title.trim(),
      description: description ? description.trim() : null,
      target_type: normalizedTargetType,
      target_id: target_id !== undefined && target_id !== null && target_id !== '' ? parseInt(target_id, 10) : null,
      academic_year: academic_year ? academic_year.trim() : null,
      semester: semester !== undefined && semester !== null && semester !== '' ? parseInt(semester, 10) : null,
      start_date: startDateObj,
      end_date: endDateObj,
      is_active: is_active !== undefined ? Boolean(is_active) : true,
      created_by: req.user.user_id
    });

    const newForm = await teacherFeedbackModel.getTeacherFormById(formId, req.user.user_id);
    return successResponse(res, 201, 'Feedback form created successfully', newForm.form);
  } catch (error) {
    next(error);
  }
};

/**
 * 4. PUT /api/teacher/feedback/forms/:id
 * Update feedback form details with ownership and anti-self-evaluation checks
 */
const updateTeacherForm = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const teacher = await teacherFeedbackModel.getTeacherProfileByUserId(req.user.user_id);
    if (!teacher) {
      return errorResponse(res, 404, 'Teacher profile not found for this user');
    }

    const existingResult = await teacherFeedbackModel.getTeacherFormById(formId, req.user.user_id);
    if (existingResult.notFound) {
      return errorResponse(res, 404, 'Feedback form not found');
    }
    if (existingResult.forbidden) {
      return errorResponse(res, 403, 'Access denied. You can only update feedback forms created by you');
    }

    const existing = existingResult.form;
    const {
      title,
      description,
      target_type,
      target_id,
      academic_year,
      semester,
      start_date,
      end_date,
      is_active
    } = req.body;

    const updatePayload = {};

    if (title !== undefined) {
      if (!title.trim()) return errorResponse(res, 400, 'Title cannot be empty');
      updatePayload.title = title.trim();
    }

    if (description !== undefined) {
      updatePayload.description = description !== null ? description.trim() : null;
    }

    const effectiveTargetType = target_type !== undefined ? target_type.toUpperCase().trim() : existing.target_type;
    const effectiveTargetId = target_id !== undefined ? (target_id !== null && target_id !== '' ? parseInt(target_id, 10) : null) : existing.target_id;

    if (target_type !== undefined) {
      const allowedTargetTypes = ['COURSE', 'TEACHER', 'GENERAL', 'EVENT'];
      if (!allowedTargetTypes.includes(effectiveTargetType)) {
        return errorResponse(res, 400, `Invalid target_type. Must be one of: ${allowedTargetTypes.join(', ')}`);
      }
      updatePayload.target_type = effectiveTargetType;
    }

    if (target_id !== undefined) {
      updatePayload.target_id = effectiveTargetId;
    }

    // Check Anti-Self-Evaluation if either target_type or target_id is being updated
    if (target_type !== undefined || target_id !== undefined) {
      const check = await teacherFeedbackModel.validateAntiSelfEvaluation(
        teacher.teacher_id,
        effectiveTargetType,
        effectiveTargetId
      );
      if (!check.valid) {
        return errorResponse(res, check.status || 400, check.message);
      }
    }

    if (academic_year !== undefined) {
      updatePayload.academic_year = academic_year ? academic_year.trim() : null;
    }

    if (semester !== undefined) {
      updatePayload.semester = semester !== null && semester !== '' ? parseInt(semester, 10) : null;
    }

    if (is_active !== undefined) {
      updatePayload.is_active = Boolean(is_active);
    }

    // Validate dates
    if (start_date !== undefined || end_date !== undefined) {
      const effectiveStart = new Date(start_date !== undefined ? start_date : existing.start_date);
      const effectiveEnd = new Date(end_date !== undefined ? end_date : existing.end_date);

      if (isNaN(effectiveStart.getTime()) || isNaN(effectiveEnd.getTime())) {
        return errorResponse(res, 400, 'Invalid start_date or end_date format');
      }

      if (effectiveStart >= effectiveEnd) {
        return errorResponse(res, 400, 'start_date must be strictly earlier than end_date');
      }

      if (start_date !== undefined) updatePayload.start_date = effectiveStart;
      if (end_date !== undefined) updatePayload.end_date = effectiveEnd;
    }

    await teacherFeedbackModel.updateTeacherForm(formId, req.user.user_id, updatePayload);
    const updated = await teacherFeedbackModel.getTeacherFormById(formId, req.user.user_id);
    return successResponse(res, 200, 'Feedback form updated successfully', updated.form);
  } catch (error) {
    next(error);
  }
};

/**
 * 5. DELETE /api/teacher/feedback/forms/:id
 * Delete feedback form created by teacher (cascade deletion)
 */
const deleteTeacherForm = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const result = await teacherFeedbackModel.deleteTeacherForm(formId, req.user.user_id);
    if (result.notFound) {
      return errorResponse(res, 404, 'Feedback form not found');
    }
    if (result.forbidden) {
      return errorResponse(res, 403, 'Access denied. You can only delete feedback forms created by you');
    }

    return successResponse(res, 200, 'Feedback form deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * 6. POST /api/teacher/feedback/forms/:id/questions
 * Add question to teacher's own feedback form
 */
const addTeacherQuestion = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const { question_text, question_type, is_required, display_order } = req.body;

    if (!question_text || !question_text.trim()) {
      return errorResponse(res, 400, 'question_text is required');
    }

    const allowedTypes = ['RATING', 'TEXT', 'MULTIPLE_CHOICE'];
    const normalizedType = question_type ? question_type.toUpperCase().trim() : '';
    if (!allowedTypes.includes(normalizedType)) {
      return errorResponse(res, 400, `Invalid question_type. Must be one of: ${allowedTypes.join(', ')}`);
    }

    const result = await teacherFeedbackModel.addTeacherQuestion(formId, req.user.user_id, {
      question_text: question_text.trim(),
      question_type: normalizedType,
      is_required: is_required !== undefined ? Boolean(is_required) : true,
      display_order: display_order !== undefined ? parseInt(display_order, 10) || 0 : 0
    });

    if (result.notFound) {
      return errorResponse(res, 404, 'Feedback form not found');
    }
    if (result.forbidden) {
      return errorResponse(res, 403, 'Access denied. You can only add questions to feedback forms created by you');
    }

    return successResponse(res, 201, 'Question added successfully', result.question);
  } catch (error) {
    next(error);
  }
};

/**
 * 7. PUT /api/teacher/feedback/questions/:questionId
 * Update question on teacher's own feedback form
 */
const updateTeacherQuestion = async (req, res, next) => {
  try {
    const questionId = parseInt(req.params.questionId, 10);
    if (!questionId || isNaN(questionId)) {
      return errorResponse(res, 400, 'Invalid question ID');
    }

    const { question_text, question_type, is_required, display_order } = req.body;
    const updatePayload = {};

    if (question_text !== undefined) {
      if (!question_text.trim()) return errorResponse(res, 400, 'question_text cannot be empty');
      updatePayload.question_text = question_text.trim();
    }

    if (question_type !== undefined) {
      const allowedTypes = ['RATING', 'TEXT', 'MULTIPLE_CHOICE'];
      const normalizedType = question_type.toUpperCase().trim();
      if (!allowedTypes.includes(normalizedType)) {
        return errorResponse(res, 400, `Invalid question_type. Must be one of: ${allowedTypes.join(', ')}`);
      }
      updatePayload.question_type = normalizedType;
    }

    if (is_required !== undefined) {
      updatePayload.is_required = Boolean(is_required);
    }

    if (display_order !== undefined) {
      updatePayload.display_order = parseInt(display_order, 10) || 0;
    }

    const result = await teacherFeedbackModel.updateTeacherQuestion(questionId, req.user.user_id, updatePayload);
    if (result.notFound) {
      return errorResponse(res, 404, 'Question not found');
    }
    if (result.forbidden) {
      return errorResponse(res, 403, 'Access denied. You can only update questions on feedback forms created by you');
    }

    return successResponse(res, 200, 'Question updated successfully', result.question);
  } catch (error) {
    next(error);
  }
};

/**
 * 8. DELETE /api/teacher/feedback/questions/:questionId
 * Delete question from teacher's own feedback form
 */
const deleteTeacherQuestion = async (req, res, next) => {
  try {
    const questionId = parseInt(req.params.questionId, 10);
    if (!questionId || isNaN(questionId)) {
      return errorResponse(res, 400, 'Invalid question ID');
    }

    const result = await teacherFeedbackModel.deleteTeacherQuestion(questionId, req.user.user_id);
    if (result.notFound) {
      return errorResponse(res, 404, 'Question not found');
    }
    if (result.forbidden) {
      return errorResponse(res, 403, 'Access denied. You can only delete questions from feedback forms created by you');
    }

    return successResponse(res, 200, 'Question deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * 9. GET /api/teacher/feedback/forms/:id/submissions
 * View student submission roster (submitted vs pending) with strict privacy:
 * NEVER returns ratings, answer texts, or response IDs!
 */
const getTeacherFormSubmissions = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const result = await teacherFeedbackModel.getTeacherFormSubmissions(formId, req.user.user_id, req.query);
    if (result.notFound) {
      return errorResponse(res, 404, 'Feedback form not found');
    }
    if (result.forbidden) {
      return errorResponse(res, 403, 'Access denied. You can only view submissions for feedback forms created by you');
    }

    return successResponse(res, 200, 'Student submission status retrieved successfully', result);
  } catch (error) {
    next(error);
  }
};

/**
 * 10. GET /api/teacher/feedback/forms/:id/analytics
 * View aggregated feedback analytics:
 * Rating distribution (1-5 stars), overall average, MCQ breakdown, and anonymous text remarks.
 */
const getTeacherFormAnalytics = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const result = await teacherFeedbackModel.getTeacherFormAnalytics(formId, req.user.user_id);
    if (result.notFound) {
      return errorResponse(res, 404, 'Feedback form not found');
    }
    if (result.forbidden) {
      return errorResponse(res, 403, 'Access denied. You can only view analytics for feedback forms created by you');
    }

    return successResponse(res, 200, 'Feedback form analytics retrieved successfully', result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTeacherForms,
  getTeacherFormById,
  createTeacherForm,
  updateTeacherForm,
  deleteTeacherForm,
  addTeacherQuestion,
  updateTeacherQuestion,
  deleteTeacherQuestion,
  getTeacherFormSubmissions,
  getTeacherFormAnalytics
};
