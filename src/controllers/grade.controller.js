const pool = require('../config/db');
const Grade = require('../models/grade.model');
const studentModel = require('../models/student.model');
const notificationModel = require('../models/notification.model');
const { createAuditLog } = require('../services/audit.service');

/**
 * Helper to validate positive integer IDs
 */
const isValidId = (id) => {
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0 && String(parsed) === String(id).trim();
};

/**
 * GET /api/grades
 * Fetch paginated list of grades with search and filters
 */
const getGrades = async (req, res) => {
  try {
    const {
      page,
      limit,
      search,
      student_id,
      course_id,
      department_id,
      semester,
      exam_session,
      assessment_type,
      result_status
    } = req.query;

    const result = await Grade.getGrades({
      page,
      limit,
      search,
      student_id,
      course_id,
      department_id,
      semester,
      exam_session,
      assessment_type,
      result_status
    });

    return res.status(200).json({
      success: true,
      message: 'Grades fetched successfully',
      data: result
    });
  } catch (err) {
    console.error('Error fetching grades:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching grades'
    });
  }
};

/**
 * GET /api/grades/stats
 * Dashboard KPI statistics for grades
 */
const getGradeStats = async (req, res) => {
  try {
    const stats = await Grade.getGradeStats();
    return res.status(200).json({
      success: true,
      message: 'Grade statistics fetched successfully',
      data: { stats }
    });
  } catch (err) {
    console.error('Error fetching grade statistics:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching grade statistics'
    });
  }
};

/**
 * GET /api/grades/:id
 * Fetch single grade record by ID
 */
const getGradeById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid grade ID provided'
      });
    }

    const grade = await Grade.findById(id);
    if (!grade) {
      return res.status(404).json({
        success: false,
        message: 'Grade record not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Grade record fetched successfully',
      data: { grade }
    });
  } catch (err) {
    console.error('Error fetching grade by ID:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching grade record'
    });
  }
};

/**
 * GET /api/grades/student/:studentId
 * Student-wise grades and SGPA calculation
 */
const getStudentGrades = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { semester, exam_session } = req.query;

    let targetStudentId = studentId;
    if (req.user && req.user.role === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(req.user.user_id);
      if (!studentProfile) {
        return res.status(404).json({
          success: false,
          message: 'No student profile found for your account'
        });
      }
      if (studentId === 'me' || String(studentId).toLowerCase() === 'my') {
        targetStudentId = studentProfile.student_id;
      } else {
        const parsed = parseInt(studentId, 10);
        if (isNaN(parsed) || parsed !== studentProfile.student_id) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: You can only view your own grades'
          });
        }
        targetStudentId = studentProfile.student_id;
      }
    } else {
      if (!isValidId(studentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid student ID provided'
        });
      }
      targetStudentId = parseInt(studentId, 10);
    }

    const result = await Grade.getStudentGrades(targetStudentId, semester, exam_session);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Student grades fetched successfully',
      data: result
    });
  } catch (err) {
    console.error('Error fetching student grades:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching student grades'
    });
  }
};

/**
 * GET /api/grades/student/:studentId/summary
 * Student overall academic summary and SGPA foundation
 */
const getStudentSummary = async (req, res) => {
  try {
    const { studentId } = req.params;

    let targetStudentId = studentId;
    if (req.user && req.user.role === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(req.user.user_id);
      if (!studentProfile) {
        return res.status(404).json({
          success: false,
          message: 'No student profile found for your account'
        });
      }
      if (studentId === 'me' || String(studentId).toLowerCase() === 'my') {
        targetStudentId = studentProfile.student_id;
      } else {
        const parsed = parseInt(studentId, 10);
        if (isNaN(parsed) || parsed !== studentProfile.student_id) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: You can only view your own grade summary'
          });
        }
        targetStudentId = studentProfile.student_id;
      }
    } else {
      if (!isValidId(studentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid student ID provided'
        });
      }
      targetStudentId = parseInt(studentId, 10);
    }

    const result = await Grade.getStudentSummary(targetStudentId);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Student academic summary fetched successfully',
      data: result
    });
  } catch (err) {
    console.error('Error fetching student summary:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching student academic summary'
    });
  }
};

/**
 * GET /api/grades/course/:courseId
 * Course-wise grades and class statistics
 */
const getCourseGrades = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { exam_session } = req.query;

    if (!isValidId(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID provided'
      });
    }

    const result = await Grade.getCourseGrades(courseId, exam_session);
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Course grades fetched successfully',
      data: result
    });
  } catch (err) {
    console.error('Error fetching course grades:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching course grades'
    });
  }
};

/**
 * POST /api/grades
 * Create new grade evaluation record
 */
const createGrade = async (req, res) => {
  try {
    const {
      student_id,
      course_id,
      teacher_id,
      assessment_type,
      assessment_name,
      internal_marks = 0,
      external_marks = 0,
      practical_marks = 0,
      max_marks = 100,
      exam_session,
      remarks
    } = req.body;

    // 1. Mandatory fields
    if (!student_id || !course_id || !assessment_type || !exam_session) {
      return res.status(400).json({
        success: false,
        message: 'Student, course, assessment type, and exam session are required'
      });
    }

    if (!isValidId(student_id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student_id provided'
      });
    }

    if (!isValidId(course_id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course_id provided'
      });
    }

    if (teacher_id && !isValidId(teacher_id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid teacher_id provided'
      });
    }

    const validAssessmentTypes = ['Theory', 'Practical'];
    if (!validAssessmentTypes.includes(assessment_type)) {
      return res.status(400).json({
        success: false,
        message: 'Assessment type must be either "Theory" or "Practical"'
      });
    }

    if (!exam_session || !exam_session.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Exam session is required (e.g. "Winter 2026")'
      });
    }

    // 2. Validate max_marks
    const maxMarksNum = parseFloat(max_marks);
    if (isNaN(maxMarksNum) || maxMarksNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Maximum marks must be a positive number greater than 0'
      });
    }

    // 3. Validate marks non-negative and assessment separation
    const intMarksNum = parseFloat(internal_marks) || 0;
    const extMarksNum = parseFloat(external_marks) || 0;
    const pracMarksNum = parseFloat(practical_marks) || 0;

    if (intMarksNum < 0 || extMarksNum < 0 || pracMarksNum < 0) {
      return res.status(400).json({
        success: false,
        message: 'Marks cannot be negative'
      });
    }

    let calculatedTotal = 0;
    if (assessment_type === 'Theory') {
      if (pracMarksNum > 0) {
        return res.status(400).json({
          success: false,
          message: 'Practical marks must be 0 for Theory assessments'
        });
      }
      calculatedTotal = intMarksNum + extMarksNum;
    } else if (assessment_type === 'Practical') {
      if (intMarksNum > 0 || extMarksNum > 0) {
        return res.status(400).json({
          success: false,
          message: 'Internal and external marks must be 0 for Practical assessments'
        });
      }
      calculatedTotal = pracMarksNum;
    }

    if (calculatedTotal > maxMarksNum) {
      return res.status(400).json({
        success: false,
        message: `Total marks (${calculatedTotal}) cannot exceed maximum marks (${maxMarksNum})`
      });
    }

    // 4. Validate Student existence and active state
    const [studentRows] = await pool.query(
      `SELECT s.student_id, s.user_id, u.is_active 
       FROM students s 
       INNER JOIN users u ON s.user_id = u.user_id 
       WHERE s.student_id = ?`,
      [parseInt(student_id, 10)]
    );
    if (!studentRows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Selected student does not exist'
      });
    }
    if (!studentRows[0].is_active) {
      return res.status(400).json({
        success: false,
        message: 'Cannot record grades for an inactive student'
      });
    }

    // 5. Validate Course existence
    const [courseRows] = await pool.query(
      'SELECT course_id, course_code, course_name, credits FROM courses WHERE course_id = ?',
      [parseInt(course_id, 10)]
    );
    if (!courseRows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Selected course does not exist'
      });
    }

    // 6. Validate Teacher existence (if provided)
    if (teacher_id) {
      const [teacherRows] = await pool.query(
        'SELECT teacher_id FROM teachers WHERE teacher_id = ?',
        [parseInt(teacher_id, 10)]
      );
      if (!teacherRows[0]) {
        return res.status(404).json({
          success: false,
          message: 'Selected teacher does not exist'
        });
      }
    }

    // 7. Validate Student active course enrollment
    const enrollment = await Grade.checkStudentEnrollment(student_id, course_id);
    if (!enrollment) {
      return res.status(400).json({
        success: false,
        message: 'Student is not actively enrolled in this course'
      });
    }

    // 8. Prevent duplicate result records
    const duplicate = await Grade.checkDuplicate(student_id, course_id, exam_session, assessment_type);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: `A ${assessment_type} grade record already exists for this student in course "${courseRows[0].course_code}" for session "${exam_session.trim()}".`
      });
    }

    // 9. Create record
    let formattedRemarks = remarks ? remarks.trim() : '';
    if (assessment_name && typeof assessment_name === 'string' && assessment_name.trim()) {
      const cleanName = assessment_name.trim();
      if (!formattedRemarks.startsWith(`[${cleanName}]`)) {
        formattedRemarks = formattedRemarks ? `[${cleanName}] ${formattedRemarks}` : `[${cleanName}]`;
      }
    }
    if (formattedRemarks && formattedRemarks.length > 255) {
      formattedRemarks = formattedRemarks.slice(0, 255);
    }

    const newGrade = await Grade.createGrade({
      student_id,
      course_id,
      teacher_id,
      assessment_type,
      internal_marks: intMarksNum,
      external_marks: extMarksNum,
      practical_marks: pracMarksNum,
      max_marks: maxMarksNum,
      exam_session,
      remarks: formattedRemarks || null
    });

    await createAuditLog({
      userId: req.user.user_id,
      action: 'GRADE_CREATED',
      entity: 'GRADE',
      entityId: newGrade.grade_id,
      description: `Created ${assessment_type} grade record${assessment_name ? ' (' + assessment_name + ')' : ''} for Student #${student_id} in Course #${course_id} (${newGrade.letter_grade}, ${newGrade.total_marks}/${newGrade.max_marks})`,
      details: { grade_id: newGrade.grade_id, student_id, course_id, letter_grade: newGrade.letter_grade, assessment_type, assessment_name: assessment_name || null },
      req
    });

    // 10. Notify student of published grade/result and trigger email
    try {
      const studentUserId = newGrade.student_user_id || studentRows[0]?.user_id;
      if (studentUserId) {
        const assessmentDisplay = newGrade.assessment_name 
          ? `${newGrade.assessment_name} (${newGrade.assessment_type})` 
          : newGrade.assessment_type;
        const courseDisplay = newGrade.course_code 
          ? `${newGrade.course_code} - ${newGrade.course_name || ''}`.trim() 
          : (courseRows[0]?.course_code || 'Course');

        await notificationModel.createNotification({
          recipient_user_id: studentUserId,
          title: `New Academic Result: ${newGrade.course_code || courseRows[0]?.course_code || 'Course'}`,
          message: `Your grade for course "${courseDisplay}" [${assessmentDisplay}] has been published. Grade: ${newGrade.letter_grade} (${newGrade.total_marks}/${newGrade.max_marks}).`,
          notification_type: 'NEW_RESULT',
          metadata: {
            notificationType: 'NEW_RESULT',
            gradeId: newGrade.grade_id,
            studentId: newGrade.student_id,
            courseId: newGrade.course_id,
            course: courseDisplay,
            courseName: newGrade.course_name || courseRows[0]?.course_name,
            grade: `${newGrade.letter_grade} (${newGrade.total_marks}/${newGrade.max_marks})`,
            letterGrade: newGrade.letter_grade,
            totalMarks: newGrade.total_marks,
            maxMarks: newGrade.max_marks,
            assessmentName: newGrade.assessment_name || null,
            assessmentType: newGrade.assessment_type,
            examSession: newGrade.exam_session,
            eventId: `grade_${newGrade.grade_id}`
          },
          eventId: `grade_${newGrade.grade_id}`
        });
      }
    } catch (notifErr) {
      console.warn('[GradeController] Failed to dispatch in-app notification / email for grade:', notifErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Grade record created successfully',
      data: { grade: newGrade }
    });
  } catch (err) {
    console.error('Error creating grade record:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'A duplicate grade record exists for this student, course, session, and assessment type'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating grade record'
    });
  }
};

/**
 * PUT /api/grades/:id
 * Update existing grade record
 */
const updateGrade = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid grade ID provided'
      });
    }

    const current = await Grade.findById(id);
    if (!current) {
      return res.status(404).json({
        success: false,
        message: 'Grade record not found'
      });
    }

    const {
      teacher_id,
      assessment_type,
      assessment_name,
      internal_marks,
      external_marks,
      practical_marks,
      max_marks,
      exam_session,
      remarks
    } = req.body;

    const finalType = assessment_type !== undefined ? assessment_type : current.assessment_type;
    const finalSession = exam_session !== undefined ? exam_session.trim() : current.exam_session;
    const maxMarksNum = max_marks !== undefined ? parseFloat(max_marks) : current.max_marks;

    if (isNaN(maxMarksNum) || maxMarksNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Maximum marks must be a positive number greater than 0'
      });
    }

    if (!['Theory', 'Practical'].includes(finalType)) {
      return res.status(400).json({
        success: false,
        message: 'Assessment type must be either "Theory" or "Practical"'
      });
    }

    const intMarksNum = internal_marks !== undefined ? parseFloat(internal_marks) : current.internal_marks;
    const extMarksNum = external_marks !== undefined ? parseFloat(external_marks) : current.external_marks;
    const pracMarksNum = practical_marks !== undefined ? parseFloat(practical_marks) : current.practical_marks;

    if (intMarksNum < 0 || extMarksNum < 0 || pracMarksNum < 0) {
      return res.status(400).json({
        success: false,
        message: 'Marks cannot be negative'
      });
    }

    let calculatedTotal = 0;
    if (finalType === 'Theory') {
      if (pracMarksNum > 0) {
        return res.status(400).json({
          success: false,
          message: 'Practical marks must be 0 for Theory assessments'
        });
      }
      calculatedTotal = intMarksNum + extMarksNum;
    } else if (finalType === 'Practical') {
      if (intMarksNum > 0 || extMarksNum > 0) {
        return res.status(400).json({
          success: false,
          message: 'Internal and external marks must be 0 for Practical assessments'
        });
      }
      calculatedTotal = pracMarksNum;
    }

    if (calculatedTotal > maxMarksNum) {
      return res.status(400).json({
        success: false,
        message: `Total marks (${calculatedTotal}) cannot exceed maximum marks (${maxMarksNum})`
      });
    }

    // Teacher check if updating teacher_id
    if (teacher_id !== undefined && teacher_id !== null) {
      if (teacher_id && !isValidId(teacher_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid teacher_id provided'
        });
      }
      if (teacher_id) {
        const [teacherRows] = await pool.query(
          'SELECT teacher_id FROM teachers WHERE teacher_id = ?',
          [parseInt(teacher_id, 10)]
        );
        if (!teacherRows[0]) {
          return res.status(404).json({
            success: false,
            message: 'Selected teacher does not exist'
          });
        }
      }
    }

    // Duplicate check on session or type change
    const duplicate = await Grade.checkDuplicate(
      current.student_id,
      current.course_id,
      finalSession,
      finalType,
      id
    );
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: `A ${finalType} grade record already exists for this student and course in session "${finalSession}".`
      });
    }

    let finalRemarks = remarks !== undefined ? (remarks ? remarks.trim() : null) : current.remarks;
    if (assessment_name && typeof assessment_name === 'string' && assessment_name.trim()) {
      const cleanName = assessment_name.trim();
      let baseRemarks = finalRemarks || '';
      baseRemarks = baseRemarks.replace(/^\[.*?\]\s*/, '');
      finalRemarks = baseRemarks ? `[${cleanName}] ${baseRemarks}` : `[${cleanName}]`;
    }
    if (finalRemarks && finalRemarks.length > 255) {
      finalRemarks = finalRemarks.slice(0, 255);
    }

    const updatedGrade = await Grade.updateGrade(id, {
      teacher_id,
      assessment_type: finalType,
      internal_marks: intMarksNum,
      external_marks: extMarksNum,
      practical_marks: pracMarksNum,
      max_marks: maxMarksNum,
      exam_session: finalSession,
      remarks: finalRemarks
    });

    await createAuditLog({
      userId: req.user.user_id,
      action: 'GRADE_UPDATED',
      entity: 'GRADE',
      entityId: id,
      description: `Updated grade record #${id}${assessment_name ? ' (' + assessment_name + ')' : ''} for Student #${updatedGrade.student_id} (${updatedGrade.letter_grade})`,
      details: { grade_id: id, student_id: updatedGrade.student_id, course_id: updatedGrade.course_id, assessment_name: assessment_name || null },
      req
    });

    // In-App Notification & Email Trigger for Student on Grade Update
    try {
      const studentUserId = updatedGrade.student_user_id;
      if (studentUserId) {
        const assessmentDisplay = updatedGrade.assessment_name 
          ? `${updatedGrade.assessment_name} (${updatedGrade.assessment_type})` 
          : updatedGrade.assessment_type;
        const courseDisplay = updatedGrade.course_code 
          ? `${updatedGrade.course_code} - ${updatedGrade.course_name || ''}`.trim() 
          : 'Course';

        await notificationModel.createNotification({
          recipient_user_id: studentUserId,
          title: `Result Updated: ${updatedGrade.course_code || 'Course'}`,
          message: `Your grade for course "${courseDisplay}" [${assessmentDisplay}] has been updated. New Grade: ${updatedGrade.letter_grade} (${updatedGrade.total_marks}/${updatedGrade.max_marks}).`,
          notification_type: 'NEW_RESULT',
          metadata: {
            notificationType: 'NEW_RESULT',
            gradeId: updatedGrade.grade_id,
            studentId: updatedGrade.student_id,
            courseId: updatedGrade.course_id,
            course: courseDisplay,
            courseName: updatedGrade.course_name,
            grade: `${updatedGrade.letter_grade} (${updatedGrade.total_marks}/${updatedGrade.max_marks})`,
            letterGrade: updatedGrade.letter_grade,
            totalMarks: updatedGrade.total_marks,
            maxMarks: updatedGrade.max_marks,
            assessmentName: updatedGrade.assessment_name || null,
            assessmentType: updatedGrade.assessment_type,
            examSession: updatedGrade.exam_session,
            eventId: `grade_update_${updatedGrade.grade_id}_${Date.now()}`
          },
          eventId: `grade_update_${updatedGrade.grade_id}_${Date.now()}`
        });
      }
    } catch (notifErr) {
      console.warn('[GradeController] Failed to dispatch update notification for grade:', notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Grade record updated successfully',
      data: { grade: updatedGrade }
    });
  } catch (err) {
    console.error('Error updating grade record:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'A duplicate grade record exists for this student, course, session, and assessment type'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating grade record'
    });
  }
};

/**
 * DELETE /api/grades/:id
 * Delete grade record safely
 */
const deleteGrade = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid grade ID provided'
      });
    }

    const grade = await Grade.findById(id);
    if (!grade) {
      return res.status(404).json({
        success: false,
        message: 'Grade record not found'
      });
    }

    // Safe delete check against foreign keys referencing grades
    const [fkRows] = await pool.query(`
      SELECT TABLE_NAME, COLUMN_NAME 
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
      WHERE REFERENCED_TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'grades'
    `);

    for (const fk of fkRows) {
      const [depRows] = await pool.query(
        `SELECT COUNT(*) AS count FROM \`${fk.TABLE_NAME}\` WHERE \`${fk.COLUMN_NAME}\` = ?`,
        [parseInt(id, 10)]
      );
      if (depRows[0]?.count > 0) {
        return res.status(409).json({
          success: false,
          message: `Cannot delete grade record because it is referenced by ${depRows[0].count} record(s) in ${fk.TABLE_NAME}`
        });
      }
    }

    const deleted = await Grade.deleteGrade(id);
    if (!deleted) {
      return res.status(400).json({
        success: false,
        message: 'Failed to delete grade record'
      });
    }

    await createAuditLog({
      userId: req.user.user_id,
      action: 'GRADE_DELETED',
      entity: 'GRADE',
      entityId: id,
      description: `Deleted grade record #${id} (Student #${grade.student_id}, Course #${grade.course_id})`,
      details: { grade_id: id, student_id: grade.student_id, course_id: grade.course_id },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Grade record deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting grade record:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting grade record'
    });
  }
};

module.exports = {
  getGrades,
  getGradeStats,
  getGradeById,
  getStudentGrades,
  getStudentSummary,
  getCourseGrades,
  createGrade,
  updateGrade,
  deleteGrade
};
