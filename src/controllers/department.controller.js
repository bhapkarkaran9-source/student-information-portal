const departmentModel = require('../models/department.model');
const { successResponse, errorResponse } = require('../utils/response');
const { createAuditLog } = require('../services/audit.service');

/**
 * Get departments list with search, status filtering, and pagination
 * GET /api/departments
 */
const getDepartments = async (req, res) => {
  try {
    const { page, limit, search = '', status = '', all } = req.query;

    // Check if caller wants all records (e.g. for dropdown selection)
    const isAll = all === 'true' || all === '1';

    let safePage = 1;
    let safeLimit = 10;

    if (!isAll && page !== undefined) {
      const parsedPage = parseInt(page, 10);
      safePage = isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    }

    if (!isAll && limit !== undefined) {
      const parsedLimit = parseInt(limit, 10);
      safeLimit = isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100 ? 10 : parsedLimit;
    }

    const result = await departmentModel.getDepartments({
      page: safePage,
      limit: safeLimit,
      search: typeof search === 'string' ? search.trim() : '',
      status,
      all: isAll
    });

    return successResponse(res, 200, 'Departments retrieved successfully', result);
  } catch (error) {
    console.error('Error fetching departments:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching departments');
  }
};

/**
 * Get single department details by ID (including dependency counts)
 * GET /api/departments/:id
 */
const getDepartmentById = async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id, 10);
    if (isNaN(departmentId) || departmentId <= 0) {
      return errorResponse(res, 400, 'Invalid department ID');
    }

    const department = await departmentModel.findById(departmentId);
    if (!department) {
      return errorResponse(res, 404, 'Department not found');
    }

    return successResponse(res, 200, 'Department retrieved successfully', { department });
  } catch (error) {
    console.error('Error fetching department:', error.message);
    return errorResponse(res, 500, 'An error occurred while fetching department');
  }
};

/**
 * Create a new department
 * POST /api/departments
 */
const createDepartment = async (req, res) => {
  try {
    const { department_code, department_name, description, is_active } = req.body;

    // 1. Required field validations
    if (!department_code || !department_name) {
      return errorResponse(res, 400, 'Department code and name are required');
    }

    const cleanCode = String(department_code).trim().toUpperCase();
    const cleanName = String(department_name).trim();

    if (!cleanCode || !cleanName) {
      return errorResponse(res, 400, 'Department code and name cannot be blank');
    }

    // 2. Field length constraints based on live schema
    if (cleanCode.length > 20) {
      return errorResponse(res, 400, 'Department code cannot exceed 20 characters');
    }

    if (cleanName.length > 100) {
      return errorResponse(res, 400, 'Department name cannot exceed 100 characters');
    }

    // 3. Department code format validation (alphanumeric, hyphens, underscores)
    if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
      return errorResponse(res, 400, 'Department code can only contain letters, numbers, hyphens, and underscores');
    }

    // 4. Duplicate code check
    const existing = await departmentModel.findByCode(cleanCode);
    if (existing) {
      return errorResponse(res, 409, 'Department code already exists');
    }

    // 5. Create department
    const activeBool = is_active !== undefined ? Boolean(is_active) : true;
    const newId = await departmentModel.createDepartment({
      department_code: cleanCode,
      department_name: cleanName,
      description: description ? String(description).trim() : null,
      is_active: activeBool
    });

    const created = await departmentModel.findById(newId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'DEPARTMENT_CREATED',
      entity: 'DEPARTMENT',
      entityId: newId,
      description: `Created department ${cleanName} (${cleanCode})`,
      details: { department_code: cleanCode, department_name: cleanName },
      req
    });

    return successResponse(res, 201, 'Department created successfully', { department: created });
  } catch (error) {
    console.error('Error creating department:', error.message);
    return errorResponse(res, 500, 'An error occurred while creating department');
  }
};

/**
 * Update department details
 * PUT /api/departments/:id
 */
const updateDepartment = async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id, 10);
    if (isNaN(departmentId) || departmentId <= 0) {
      return errorResponse(res, 400, 'Invalid department ID');
    }

    const existing = await departmentModel.findById(departmentId);
    if (!existing) {
      return errorResponse(res, 404, 'Department not found');
    }

    const { department_code, department_name, description, is_active } = req.body;
    const updateFields = {};

    if (department_code !== undefined) {
      const cleanCode = String(department_code).trim().toUpperCase();
      if (!cleanCode) return errorResponse(res, 400, 'Department code cannot be empty');
      if (cleanCode.length > 20) return errorResponse(res, 400, 'Department code cannot exceed 20 characters');
      if (!/^[A-Z0-9_-]+$/.test(cleanCode)) {
        return errorResponse(res, 400, 'Department code can only contain letters, numbers, hyphens, and underscores');
      }

      if (cleanCode !== existing.department_code) {
        const codeCheck = await departmentModel.findByCode(cleanCode);
        if (codeCheck) return errorResponse(res, 409, 'Department code already exists');
      }
      updateFields.department_code = cleanCode;
    }

    if (department_name !== undefined) {
      const cleanName = String(department_name).trim();
      if (!cleanName) return errorResponse(res, 400, 'Department name cannot be empty');
      if (cleanName.length > 100) return errorResponse(res, 400, 'Department name cannot exceed 100 characters');
      updateFields.department_name = cleanName;
    }

    if (description !== undefined) {
      updateFields.description = description ? String(description).trim() : null;
    }

    if (is_active !== undefined) {
      updateFields.is_active = Boolean(is_active);
    }

    await departmentModel.updateDepartment(departmentId, updateFields);

    const updated = await departmentModel.findById(departmentId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'DEPARTMENT_UPDATED',
      entity: 'DEPARTMENT',
      entityId: departmentId,
      description: `Updated department ${updated.department_name} (${updated.department_code})`,
      details: { department_id: departmentId, department_code: updated.department_code },
      req
    });

    return successResponse(res, 200, 'Department updated successfully', { department: updated });
  } catch (error) {
    console.error('Error updating department:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating department');
  }
};

/**
 * Activate / Deactivate department
 * PATCH /api/departments/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id, 10);
    if (isNaN(departmentId) || departmentId <= 0) {
      return errorResponse(res, 400, 'Invalid department ID');
    }

    const existing = await departmentModel.findById(departmentId);
    if (!existing) {
      return errorResponse(res, 404, 'Department not found');
    }

    const { is_active } = req.body;
    if (is_active === undefined || is_active === null) {
      return errorResponse(res, 400, 'is_active field is required');
    }

    const activeBool = Boolean(is_active);
    await departmentModel.updateDepartmentStatus(departmentId, activeBool);

    await createAuditLog({
      userId: req.user.user_id,
      action: activeBool ? 'DEPARTMENT_ACTIVATED' : 'DEPARTMENT_DEACTIVATED',
      entity: 'DEPARTMENT',
      entityId: departmentId,
      description: `${activeBool ? 'Activated' : 'Deactivated'} department ${existing.department_name} (${existing.department_code})`,
      details: { department_id: departmentId, is_active: activeBool },
      req
    });

    return successResponse(
      res,
      200,
      `Department ${activeBool ? 'activated' : 'deactivated'} successfully`,
      { department_id: departmentId, is_active: activeBool }
    );
  } catch (error) {
    console.error('Error updating department status:', error.message);
    return errorResponse(res, 500, 'An error occurred while updating status');
  }
};

/**
 * Safe department deletion with foreign key dependency verification
 * DELETE /api/departments/:id
 */
const deleteDepartment = async (req, res) => {
  try {
    const departmentId = parseInt(req.params.id, 10);
    if (isNaN(departmentId) || departmentId <= 0) {
      return errorResponse(res, 400, 'Invalid department ID');
    }

    const existing = await departmentModel.findById(departmentId);
    if (!existing) {
      return errorResponse(res, 404, 'Department not found');
    }

    // Inspect actual foreign key dependencies (students, teachers, courses)
    const { hasDependencies } = await departmentModel.checkDepartmentDependencies(departmentId);

    if (hasDependencies) {
      return errorResponse(
        res,
        409,
        'Department cannot be deleted because related records exist. Deactivate the department instead.'
      );
    }

    await departmentModel.deleteDepartment(departmentId);

    await createAuditLog({
      userId: req.user.user_id,
      action: 'DEPARTMENT_DELETED',
      entity: 'DEPARTMENT',
      entityId: departmentId,
      description: `Deleted department ${existing.department_name} (${existing.department_code})`,
      details: { department_id: departmentId, department_code: existing.department_code },
      req
    });

    return successResponse(res, 200, 'Department deleted successfully');
  } catch (error) {
    console.error('Error deleting department:', error.message);
    return errorResponse(res, 500, 'An error occurred while deleting department');
  }
};

module.exports = {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  updateStatus,
  deleteDepartment
};
