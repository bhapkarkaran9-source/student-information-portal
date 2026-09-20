const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const StudyMaterial = require('../models/studyMaterial.model');
const teacherModel = require('../models/teacher.model');
const studentModel = require('../models/student.model');
const { createAuditLog } = require('../services/audit.service');
const { MATERIALS_DIR, BASE_UPLOADS } = require('../middlewares/upload.middleware');

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
 * GET /api/study-materials
 * List study materials with role-based scoping:
 * - TEACHER: ONLY study materials uploaded by that logged-in teacher
 * - STUDENT: ONLY study materials for actively enrolled courses
 * - ADMIN: all materials with optional filters
 */
const getStudyMaterials = async (req, res) => {
  try {
    const {
      page,
      limit,
      search,
      course_id,
      teacher_id,
      material_type,
      semester,
      academic_year
    } = req.query;

    let effectiveTeacherId = teacher_id;
    let effectiveStudentId = null;

    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        return res.status(403).json({
          success: false,
          message: 'No faculty profile found for your account'
        });
      }
      effectiveTeacherId = teacherProfile.teacher_id;
    } else if (req.user.role === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(req.user.user_id);
      if (!studentProfile) {
        return res.status(403).json({
          success: false,
          message: 'No student profile found for your account'
        });
      }
      effectiveStudentId = studentProfile.student_id;
    }

    const result = await StudyMaterial.getStudyMaterials({
      page,
      limit,
      search,
      course_id,
      teacher_id: effectiveTeacherId,
      student_id: effectiveStudentId,
      material_type,
      semester,
      academic_year
    });

    return res.status(200).json({
      success: true,
      message: 'Study materials fetched successfully',
      data: result
    });
  } catch (err) {
    console.error('Error fetching study materials:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching study materials'
    });
  }
};

/**
 * GET /api/study-materials/stats
 * Summary KPI statistics
 */
const getStudyMaterialStats = async (req, res) => {
  try {
    let effectiveTeacherId = null;
    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (teacherProfile) {
        effectiveTeacherId = teacherProfile.teacher_id;
      }
    }

    const stats = await StudyMaterial.getStudyMaterialStats(effectiveTeacherId);
    return res.status(200).json({
      success: true,
      message: 'Study material statistics fetched successfully',
      data: { stats }
    });
  } catch (err) {
    console.error('Error fetching study material statistics:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching study material statistics'
    });
  }
};

/**
 * GET /api/study-materials/:id
 * Get single study material by ID with strict backend authorization
 */
const getStudyMaterialById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid study material ID provided'
      });
    }

    const material = await StudyMaterial.getStudyMaterialById(id);
    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Study material not found'
      });
    }

    // Role-based authorization
    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile || material.teacher_id !== teacherProfile.teacher_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not own this study material.'
        });
      }
    } else if (req.user.role === 'STUDENT') {
      const studentProfile = await studentModel.findByUserId(req.user.user_id);
      if (!studentProfile) {
        return res.status(403).json({
          success: false,
          message: 'No student profile found'
        });
      }
      const isEnrolled = await StudyMaterial.checkStudentEnrollment(studentProfile.student_id, material.course_id);
      if (!isEnrolled) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not actively enrolled in this course.'
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Study material details retrieved successfully',
      data: { material }
    });
  } catch (err) {
    console.error('Error retrieving study material:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving study material details'
    });
  }
};

/**
 * POST /api/study-materials
 * Create a new study material with real multipart file upload & teacher course authorization
 */
const createStudyMaterial = async (req, res) => {
  try {
    const {
      course_id,
      title,
      material_type,
      description
    } = req.body;

    let effectiveTeacherId = req.body.teacher_id;

    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(403).json({
          success: false,
          message: 'No faculty profile found for your account'
        });
      }
      effectiveTeacherId = teacherProfile.teacher_id;

      // Authoritative Course Check: course MUST be assigned to this teacher via timetable
      const isAssigned = await StudyMaterial.checkTeacherCourseAssignment(teacherProfile.teacher_id, course_id);
      if (!isAssigned) {
        if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not authorized to upload materials for this course.'
        });
      }
    }

    // Validate required fields
    if (!course_id || !isValidId(course_id)) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({
        success: false,
        message: 'A valid course_id is required'
      });
    }

    if (!effectiveTeacherId || !isValidId(effectiveTeacherId)) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({
        success: false,
        message: 'A valid teacher_id is required'
      });
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    // Material type validation
    const type = material_type && String(material_type).trim() ? String(material_type).trim() : 'Notes';
    const validTypes = StudyMaterial.ALLOWED_MATERIAL_TYPES;
    const matchedType = validTypes.find((t) => t.toLowerCase() === type.toLowerCase());
    if (!matchedType) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({
        success: false,
        message: `Invalid material_type provided. Allowed types: ${validTypes.join(', ')}`
      });
    }

    // File path resolution: real uploaded file or text url (for Reference Link)
    let filePath = '';
    let originalFilename = null;

    if (req.file) {
      originalFilename = req.file.originalname;
      filePath = `uploads/materials/${req.file.filename}`;
    } else if (req.body.file_path && typeof req.body.file_path === 'string' && req.body.file_path.trim()) {
      filePath = req.body.file_path.trim();
      originalFilename = path.basename(filePath);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please select a document file to upload.'
      });
    }

    if (!isSafeFilePathOrUrl(filePath)) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({
        success: false,
        message: 'Invalid or unsafe file_path provided. Disallowed protocols or file types detected.'
      });
    }

    // Verify course exists
    const courseExists = await StudyMaterial.checkCourseExists(course_id);
    if (!courseExists) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({
        success: false,
        message: `Referenced course ID ${course_id} does not exist`
      });
    }

    const newMaterial = await StudyMaterial.createStudyMaterial({
      course_id,
      teacher_id: effectiveTeacherId,
      title: title.trim(),
      material_type: matchedType,
      file_path: filePath,
      original_filename: originalFilename,
      description: description ? String(description).trim() : null
    });

    await createAuditLog({
      userId: req.user.user_id,
      action: 'STUDY_MATERIAL_CREATED',
      entity: 'STUDY_MATERIAL',
      entityId: newMaterial.material_id,
      description: `Uploaded study material "${newMaterial.title}" (${matchedType}) for Course #${course_id}`,
      details: { material_id: newMaterial.material_id, course_id, teacher_id: effectiveTeacherId, title: newMaterial.title },
      req
    });

    return res.status(201).json({
      success: true,
      message: 'Study material uploaded successfully',
      data: { material: newMaterial }
    });
  } catch (err) {
    console.error('Error creating study material:', err);
    if (req.file) try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(500).json({
      success: false,
      message: 'An error occurred while creating study material'
    });
  }
};

/**
 * PUT /api/study-materials/:id
 * Update an existing study material with teacher ownership verification
 */
const updateStudyMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid study material ID provided'
      });
    }

    const existing = await StudyMaterial.getStudyMaterialById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Study material not found'
      });
    }

    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile || existing.teacher_id !== teacherProfile.teacher_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have permission to modify this study material.'
        });
      }

      if (req.body.course_id && req.body.course_id !== existing.course_id) {
        const isAssigned = await StudyMaterial.checkTeacherCourseAssignment(teacherProfile.teacher_id, req.body.course_id);
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
      title,
      material_type,
      description
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

    if (title !== undefined) {
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Title cannot be empty'
        });
      }
      updatePayload.title = title.trim();
    }

    if (material_type !== undefined) {
      const validTypes = StudyMaterial.ALLOWED_MATERIAL_TYPES;
      const matchedType = validTypes.find((t) => t.toLowerCase() === String(material_type).trim().toLowerCase());
      if (!matchedType) {
        return res.status(400).json({
          success: false,
          message: `Invalid material_type provided. Allowed types: ${validTypes.join(', ')}`
        });
      }
      updatePayload.material_type = matchedType;
    }

    if (req.file) {
      updatePayload.original_filename = req.file.originalname;
      updatePayload.file_path = `uploads/materials/${req.file.filename}`;
    }

    if (description !== undefined) {
      updatePayload.description = description && String(description).trim() ? String(description).trim() : null;
    }

    const updated = await StudyMaterial.updateStudyMaterial(id, updatePayload);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'STUDY_MATERIAL_UPDATED',
      entity: 'STUDY_MATERIAL',
      entityId: id,
      description: `Updated study material "${updated.title}" (#${id})`,
      details: { material_id: id, title: updated.title, course_id: updated.course_id },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Study material updated successfully',
      data: { material: updated }
    });
  } catch (err) {
    console.error('Error updating study material:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating study material'
    });
  }
};

/**
 * DELETE /api/study-materials/:id
 * Delete a study material with teacher ownership check and file cleanup
 */
const deleteStudyMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid study material ID provided'
      });
    }

    const existing = await StudyMaterial.getStudyMaterialById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Study material not found'
      });
    }

    if (req.user.role === 'TEACHER') {
      const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
      if (!teacherProfile || existing.teacher_id !== teacherProfile.teacher_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You do not have permission to delete this study material.'
        });
      }
    }

    const { success, filePath } = await StudyMaterial.deleteStudyMaterial(id);
    if (!success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to delete study material'
      });
    }

    // Clean up physical file from disk
    if (filePath) {
      try {
        const absolutePath = path.resolve(BASE_UPLOADS, filePath.replace(/^(\/|\\)?uploads(\/|\\)/, ''));
        if (fs.existsSync(absolutePath)) {
          fs.unlinkSync(absolutePath);
        }
      } catch (fileErr) {
        console.warn('Could not delete physical study material file:', filePath, fileErr.message);
      }
    }

    await createAuditLog({
      userId: req.user.user_id,
      action: 'STUDY_MATERIAL_DELETED',
      entity: 'STUDY_MATERIAL',
      entityId: id,
      description: `Deleted study material "${existing.title}" (#${id})`,
      details: { material_id: id, title: existing.title, course_id: existing.course_id },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Study material deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting study material:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting study material'
    });
  }
};

/**
 * Helper to securely resolve and authorize study material document access
 */
const resolveStudyMaterialDocument = async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return { error: { status: 400, message: 'Invalid study material ID provided' } };
  }

  const material = await StudyMaterial.getStudyMaterialById(id);
  if (!material) {
    return { error: { status: 404, message: 'Study material not found' } };
  }

  // Authorization check:
  // - ADMIN: allowed
  // - TEACHER: must be owner OR assigned to course
  // - STUDENT: must be actively enrolled in material.course_id
  if (req.user.role === 'TEACHER') {
    const teacherProfile = await teacherModel.findByUserId(req.user.user_id);
    if (!teacherProfile) {
      return { error: { status: 403, message: 'No faculty profile found' } };
    }
    const isOwner = material.teacher_id === teacherProfile.teacher_id;
    const isCourseAssigned = await StudyMaterial.checkTeacherCourseAssignment(teacherProfile.teacher_id, material.course_id);
    if (!isOwner && !isCourseAssigned) {
      return { error: { status: 403, message: 'Access denied: You are not authorized to access this course resource.' } };
    }
  } else if (req.user.role === 'STUDENT') {
    const studentProfile = await studentModel.findByUserId(req.user.user_id);
    if (!studentProfile) {
      return { error: { status: 403, message: 'No student profile found' } };
    }
    const isEnrolled = await StudyMaterial.checkStudentEnrollment(studentProfile.student_id, material.course_id);
    if (!isEnrolled) {
      return { error: { status: 403, message: 'Access denied: You are not actively enrolled in this course.' } };
    }
  }

  // If file_path is external URL, allow authorized redirect
  if (/^https?:\/\//i.test(material.file_path)) {
    return { material, isExternalUrl: true, externalUrl: material.file_path };
  }

  // Path Traversal Prevention for local stored files
  const relativePart = material.file_path.replace(/^(\/|\\)?uploads(\/|\\)materials(\/|\\)?/, '');
  const absolutePath = path.resolve(MATERIALS_DIR, relativePart);

  // Assert absolute path stays strictly inside MATERIALS_DIR
  if (!absolutePath.startsWith(MATERIALS_DIR)) {
    return { error: { status: 403, message: 'Security violation: Path traversal prohibited.' } };
  }

  if (!fs.existsSync(absolutePath)) {
    return { error: { status: 404, message: 'The requested study material file does not exist on the server.' } };
  }

  const filename = material.original_filename || path.basename(absolutePath);
  return { material, absolutePath, filename, isExternalUrl: false };
};

/**
 * GET /api/study-materials/:id/download
 * Secure file download with authorization & path traversal check
 */
const downloadStudyMaterial = async (req, res) => {
  try {
    const result = await resolveStudyMaterialDocument(req, res);
    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        message: result.error.message
      });
    }

    if (result.isExternalUrl) {
      return res.redirect(result.externalUrl);
    }

    const { absolutePath, filename } = result;
    return res.download(absolutePath, filename);
  } catch (err) {
    console.error('Error downloading study material:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to download study material'
    });
  }
};

/**
 * GET /api/study-materials/:id/view
 * Secure document preview with inline header
 */
const viewStudyMaterial = async (req, res) => {
  try {
    const result = await resolveStudyMaterialDocument(req, res);
    if (result.error) {
      return res.status(result.error.status).json({
        success: false,
        message: result.error.message
      });
    }

    if (result.isExternalUrl) {
      return res.redirect(result.externalUrl);
    }

    const { absolutePath, filename } = result;
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.sendFile(absolutePath);
  } catch (err) {
    console.error('Error viewing study material:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to preview study material'
    });
  }
};

module.exports = {
  getStudyMaterials,
  getStudyMaterialStats,
  getStudyMaterialById,
  createStudyMaterial,
  updateStudyMaterial,
  deleteStudyMaterial,
  downloadStudyMaterial,
  viewStudyMaterial
};
