const feedbackModel = require('../models/feedback.model');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * ============================================================================
 * STUDENT FEEDBACK CONTROLLER
 * ============================================================================
 */

/**
 * GET /api/feedback/forms
 * Return only feedback forms currently available to the authenticated student
 */
const getStudentForms = async (req, res, next) => {
  try {
    const student = await feedbackModel.getStudentByUserId(req.user.user_id);
    if (!student) {
      return errorResponse(res, 404, 'Student profile not found for this user');
    }

    const forms = await feedbackModel.getFormsForStudent(student.student_id);
    return successResponse(res, 200, 'Feedback forms retrieved successfully', forms);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/feedback/forms/:id
 * Return the selected feedback form and its questions for the authenticated student
 */
const getStudentFormById = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const student = await feedbackModel.getStudentByUserId(req.user.user_id);
    if (!student) {
      return errorResponse(res, 404, 'Student profile not found for this user');
    }

    const form = await feedbackModel.getFormByIdForStudent(formId, student.student_id);
    if (!form) {
      return errorResponse(res, 404, 'Feedback form not found or you are not eligible to access it');
    }

    return successResponse(res, 200, 'Feedback form retrieved successfully', form);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/feedback/forms/:id/submit
 * Submit answers for the authenticated student
 */
const submitStudentFeedback = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const student = await feedbackModel.getStudentByUserId(req.user.user_id);
    if (!student) {
      return errorResponse(res, 404, 'Student profile not found for this user');
    }

    // 1. Check student eligibility and form state
    const form = await feedbackModel.getFormByIdForStudent(formId, student.student_id);
    if (!form) {
      return errorResponse(res, 404, 'Feedback form not found or you are not eligible to submit feedback for this form');
    }

    // 2. Prevent duplicate submission
    if (form.has_submitted) {
      return errorResponse(res, 409, 'You have already submitted feedback for this form');
    }

    // 3. Reject submissions outside active window
    const now = new Date();
    if (!form.is_active || now < new Date(form.start_date) || now > new Date(form.end_date)) {
      return errorResponse(res, 400, 'This feedback form is currently closed for submissions');
    }

    // 4. Validate payload answers
    const { answers } = req.body;
    if (!answers || !Array.isArray(answers)) {
      return errorResponse(res, 400, 'Answers array is required');
    }

    const formQuestions = form.questions || [];
    const questionMap = new Map();
    formQuestions.forEach(q => questionMap.set(q.question_id, q));

    // Validate required questions and answer values
    for (const q of formQuestions) {
      const userAns = answers.find(a => a && parseInt(a.question_id, 10) === q.question_id);

      if (q.is_required) {
        if (!userAns) {
          return errorResponse(res, 400, `Answer for question "${q.question_text}" is required`);
        }

        if (q.question_type === 'RATING') {
          if (userAns.rating === undefined || userAns.rating === null || userAns.rating === '') {
            return errorResponse(res, 400, `Rating for question "${q.question_text}" is required`);
          }
        } else if (q.question_type === 'TEXT') {
          if (!userAns.answer_text || !String(userAns.answer_text).trim()) {
            return errorResponse(res, 400, `Text response for question "${q.question_text}" is required`);
          }
        }
      }

      // If a rating answer was provided (whether required or optional), validate bounds 1.00 to 5.00
      if (userAns && (userAns.rating !== undefined && userAns.rating !== null && userAns.rating !== '')) {
        const ratingVal = Number(userAns.rating);
        if (isNaN(ratingVal) || ratingVal < 1.00 || ratingVal > 5.00) {
          return errorResponse(res, 400, `Rating for question "${q.question_text}" must be between 1 and 5`);
        }
      }
    }

    // Prepare sanitized answers for database transaction
    const sanitizedAnswers = answers
      .filter(a => a && questionMap.has(parseInt(a.question_id, 10)))
      .map(a => {
        const q = questionMap.get(parseInt(a.question_id, 10));
        let rating = null;
        if (a.rating !== undefined && a.rating !== null && a.rating !== '') {
          rating = parseFloat(a.rating);
        }
        let answerText = null;
        if (a.answer_text !== undefined && a.answer_text !== null) {
          answerText = String(a.answer_text).trim();
        }
        return {
          question_id: q.question_id,
          rating,
          answer_text: answerText
        };
      });

    // 5. Submit feedback atomically in database transaction
    const result = await feedbackModel.submitFeedbackTransaction(
      form.feedback_form_id,
      student.student_id,
      sanitizedAnswers
    );

    return successResponse(res, 201, 'Feedback submitted successfully', result);
  } catch (error) {
    if (error.status === 409) {
      return errorResponse(res, 409, error.message);
    }
    if (error.status === 400) {
      return errorResponse(res, 400, error.message);
    }
    if (error.status === 404) {
      return errorResponse(res, 404, error.message);
    }
    next(error);
  }
};

/**
 * ============================================================================
 * ADMIN FEEDBACK CONTROLLER
 * ============================================================================
 */

/**
 * GET /api/admin/feedback/forms
 * List feedback forms with question count and response count
 */
const getAdminForms = async (req, res, next) => {
  try {
    const result = await feedbackModel.getFormsForAdmin(req.query);
    return successResponse(res, 200, 'Feedback forms retrieved successfully', result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/feedback/forms/:id
 * Get single feedback form details with its questions
 */
const getAdminFormById = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const form = await feedbackModel.getFormByIdForAdmin(formId);
    if (!form) {
      return errorResponse(res, 404, 'Feedback form not found');
    }

    return successResponse(res, 200, 'Feedback form retrieved successfully', form);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/feedback/forms
 * Create feedback form
 */
const createAdminForm = async (req, res, next) => {
  try {
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

    // 3. Validate dates
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

    // 4. Create form
    const formId = await feedbackModel.createForm({
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

    const newForm = await feedbackModel.getFormByIdForAdmin(formId);

    // Asynchronously dispatch in-app notification & failure-isolated email broadcast for eligible students
    if (newForm && newForm.is_active) {
      setImmediate(async () => {
        try {
          await feedbackModel.dispatchFeedbackFormNotification(newForm);
        } catch (notifErr) {
          console.warn('[FeedbackController] Error dispatching feedback notification:', notifErr.message);
        }
      });
    }

    return successResponse(res, 201, 'Feedback form created successfully', newForm);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/feedback/forms/:id
 * Update feedback form details
 */
const updateAdminForm = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const existing = await feedbackModel.getFormByIdForAdmin(formId);
    if (!existing) {
      return errorResponse(res, 404, 'Feedback form not found');
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

    const updatePayload = {};

    if (title !== undefined) {
      if (!title.trim()) return errorResponse(res, 400, 'Title cannot be empty');
      updatePayload.title = title.trim();
    }

    if (description !== undefined) {
      updatePayload.description = description !== null ? description.trim() : null;
    }

    if (target_type !== undefined) {
      const allowedTargetTypes = ['COURSE', 'TEACHER', 'GENERAL', 'EVENT'];
      const normalizedTargetType = target_type ? target_type.toUpperCase().trim() : '';
      if (!allowedTargetTypes.includes(normalizedTargetType)) {
        return errorResponse(res, 400, `Invalid target_type. Must be one of: ${allowedTargetTypes.join(', ')}`);
      }
      updatePayload.target_type = normalizedTargetType;
    }

    if (target_id !== undefined) {
      updatePayload.target_id = target_id !== null && target_id !== '' ? parseInt(target_id, 10) : null;
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

    // Validate date range if either start_date or end_date is provided
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

    await feedbackModel.updateForm(formId, updatePayload);
    const updatedForm = await feedbackModel.getFormByIdForAdmin(formId);
    return successResponse(res, 200, 'Feedback form updated successfully', updatedForm);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/feedback/forms/:id
 * Delete feedback form and its questions/responses (cascade delete)
 */
const deleteAdminForm = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const existing = await feedbackModel.getFormByIdForAdmin(formId);
    if (!existing) {
      return errorResponse(res, 404, 'Feedback form not found');
    }

    await feedbackModel.deleteForm(formId);
    return successResponse(res, 200, 'Feedback form deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/feedback/forms/:id/questions
 * Add a question to a form
 */
const addAdminQuestion = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const form = await feedbackModel.getFormByIdForAdmin(formId);
    if (!form) {
      return errorResponse(res, 404, 'Feedback form not found');
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

    const questionId = await feedbackModel.addQuestion({
      feedback_form_id: formId,
      question_text: question_text.trim(),
      question_type: normalizedType,
      is_required: is_required !== undefined ? Boolean(is_required) : true,
      display_order: display_order !== undefined ? parseInt(display_order, 10) || 0 : 0
    });

    const newQuestion = await feedbackModel.getQuestionById(questionId);
    return successResponse(res, 201, 'Question added successfully', newQuestion);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/feedback/questions/:questionId
 * Update question details
 */
const updateAdminQuestion = async (req, res, next) => {
  try {
    const questionId = parseInt(req.params.questionId, 10);
    if (!questionId || isNaN(questionId)) {
      return errorResponse(res, 400, 'Invalid question ID');
    }

    const existing = await feedbackModel.getQuestionById(questionId);
    if (!existing) {
      return errorResponse(res, 404, 'Question not found');
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

    await feedbackModel.updateQuestion(questionId, updatePayload);
    const updated = await feedbackModel.getQuestionById(questionId);
    return successResponse(res, 200, 'Question updated successfully', updated);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/feedback/questions/:questionId
 * Delete question
 */
const deleteAdminQuestion = async (req, res, next) => {
  try {
    const questionId = parseInt(req.params.questionId, 10);
    if (!questionId || isNaN(questionId)) {
      return errorResponse(res, 400, 'Invalid question ID');
    }

    const existing = await feedbackModel.getQuestionById(questionId);
    if (!existing) {
      return errorResponse(res, 404, 'Question not found');
    }

    await feedbackModel.deleteQuestion(questionId);
    return successResponse(res, 200, 'Question deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/feedback/forms/:id/responses
 * View responses for a form with sanitized student metadata
 */
const getAdminFormResponses = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const form = await feedbackModel.getFormByIdForAdmin(formId);
    if (!form) {
      return errorResponse(res, 404, 'Feedback form not found');
    }

    const responses = await feedbackModel.getFormResponsesForAdmin(formId, req.query);
    return successResponse(res, 200, 'Form responses retrieved successfully', responses);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/feedback/forms/:id/analytics
 * View rating distribution, averages, and question-level analytics
 */
const getAdminFormAnalytics = async (req, res, next) => {
  try {
    const formId = parseInt(req.params.id, 10);
    if (!formId || isNaN(formId)) {
      return errorResponse(res, 400, 'Invalid feedback form ID');
    }

    const form = await feedbackModel.getFormByIdForAdmin(formId);
    if (!form) {
      return errorResponse(res, 404, 'Feedback form not found');
    }

    const analytics = await feedbackModel.getFormAnalyticsForAdmin(formId);
    return successResponse(res, 200, 'Form analytics retrieved successfully', analytics);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Student controllers
  getStudentForms,
  getStudentFormById,
  submitStudentFeedback,

  // Admin controllers
  getAdminForms,
  getAdminFormById,
  createAdminForm,
  updateAdminForm,
  deleteAdminForm,
  addAdminQuestion,
  updateAdminQuestion,
  deleteAdminQuestion,
  getAdminFormResponses,
  getAdminFormAnalytics
};
