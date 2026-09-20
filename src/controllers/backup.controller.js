const fs = require('fs');
const backupModel = require('../models/backup.model');
const backupService = require('../services/backup.service');
const { createAuditLog } = require('../services/audit.service');

/**
 * Validate positive integer ID format
 */
const isValidId = (id) => {
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0 && String(parsed) === String(id).trim();
};

/**
 * POST /api/backups
 * Create a new full database backup of student_portal_db.
 * Admin only. Target database is hardcoded to student_portal_db.
 */
const createBackup = async (req, res) => {
  let backupId = null;
  try {
    const userId = req.user ? req.user.user_id : null;

    // Initial temporary placeholder name
    const initialName = `student_portal_db_init_${Date.now()}`;
    const initialPath = `${backupService.BACKUP_DIR}/${initialName}.sql`;

    // 1. Create IN_PROGRESS record in backup_history
    backupId = await backupModel.create({
      userId,
      backupName: initialName,
      backupPath: initialPath,
      backupType: 'FULL_DATABASE',
      status: 'IN_PROGRESS'
    });

    // 2. Perform native backup execution
    const backupResult = await backupService.createDatabaseBackup({
      backupType: 'FULL_DATABASE',
      isPreRestore: false
    });

    // 3. Update record with final metadata and status = COMPLETED
    const completedRecord = await backupModel.updateStatus(backupId, {
      status: 'COMPLETED',
      fileSizeBytes: backupResult.fileSize,
      checksum: backupResult.checksum,
      completedAt: new Date(),
      errorMessage: null
    });

    // Also update filename and filepath
    await require('../config/db').query(
      `UPDATE backup_history SET backup_name = ?, backup_path = ? WHERE backup_id = ?`,
      [backupResult.fileName, backupResult.filePath, backupId]
    );

    const finalRecord = await backupModel.findById(backupId);

    // 4. Audit logging
    await createAuditLog({
      userId,
      action: 'BACKUP_CREATED',
      entity: 'BACKUP',
      entityId: backupId,
      description: `Created full database backup ${backupResult.fileName} (${(backupResult.fileSize / 1024).toFixed(1)} KB)`,
      details: {
        backup_id: backupId,
        file_name: backupResult.fileName,
        file_size_bytes: backupResult.fileSize,
        checksum: backupResult.checksum
      },
      req
    });

    return res.status(201).json({
      success: true,
      message: 'Database backup created successfully',
      data: finalRecord
    });
  } catch (err) {
    console.error('[BackupController Error] Failed to create backup:', err.message);

    // Update history record as FAILED if created
    if (backupId) {
      try {
        await backupModel.updateStatus(backupId, {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: err.message
        });
      } catch (dbErr) {
        console.error('[BackupController] Failed to update failed backup status:', dbErr.message);
      }
    }

    return res.status(500).json({
      success: false,
      message: `Failed to create database backup: ${err.message}`
    });
  }
};

/**
 * GET /api/backups
 * Retrieve paginated backup history with filters and summary KPI statistics.
 * Admin only.
 */
const getBackups = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      status = '',
      backup_type = '',
      date_from = '',
      date_to = '',
      search = ''
    } = req.query;

    const pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid page parameter. Must be a positive integer.'
      });
    }

    const limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid limit parameter. Must be a positive integer.'
      });
    }

    // Validate dates if present
    if (date_from && isNaN(Date.parse(date_from))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date_from format. Use YYYY-MM-DD.'
      });
    }
    if (date_to && isNaN(Date.parse(date_to))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date_to format. Use YYYY-MM-DD.'
      });
    }

    const [result, stats] = await Promise.all([
      backupModel.findAll({
        page: pageNum,
        limit: limitNum,
        status,
        backupType: backup_type,
        dateFrom: date_from,
        dateTo: date_to,
        search
      }),
      backupModel.getStats()
    ]);

    return res.status(200).json({
      success: true,
      data: {
        backups: result.backups,
        pagination: result.pagination,
        stats
      },
      backups: result.backups,
      pagination: result.pagination,
      stats,
      kpis: stats
    });
  } catch (err) {
    console.error('[BackupController Error] Failed to fetch backups:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching backup history.'
    });
  }
};

/**
 * GET /api/backups/:id
 * Retrieve single backup details.
 * Admin only.
 */
const getBackupById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup ID format. Must be a positive integer.'
      });
    }

    const backup = await backupModel.findById(id);
    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'Backup record not found.'
      });
    }

    return res.status(200).json({
      success: true,
      data: backup
    });
  } catch (err) {
    console.error('[BackupController Error] Failed to fetch backup details:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching backup details.'
    });
  }
};

/**
 * GET /api/backups/:id/download
 * Secure authenticated download of completed backup file.
 * Admin only. Strict path traversal protection.
 */
const downloadBackup = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup ID format.'
      });
    }

    const backup = await backupModel.findById(id);
    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'Backup record not found.'
      });
    }

    const currentStatus = (backup.status || '').toUpperCase();
    if (currentStatus !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: `Cannot download backup with status '${backup.status}'. Only completed backups can be downloaded.`
      });
    }

    let safePath;
    try {
      safePath = backupService.resolveSafeBackupPath(backup.file_name);
    } catch (pathErr) {
      return res.status(400).json({
        success: false,
        message: `Security violation: ${pathErr.message}`
      });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({
        success: false,
        message: 'Backup file does not exist on disk.'
      });
    }

    // Audit download
    await createAuditLog({
      userId: req.user ? req.user.user_id : null,
      action: 'BACKUP_DOWNLOADED',
      entity: 'BACKUP',
      entityId: id,
      description: `Downloaded backup ${backup.file_name}`,
      details: {
        backup_id: id,
        file_name: backup.file_name,
        file_size_bytes: backup.file_size
      },
      req
    });

    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.file_name}"`);
    const fileStream = fs.createReadStream(safePath);
    fileStream.pipe(res);
  } catch (err) {
    console.error('[BackupController Error] Download error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while preparing backup download.'
    });
  }
};

/**
 * POST /api/backups/:id/validate
 * Verify file existence, readability, size, SHA-256 checksum, and SQL signature.
 * Non-destructive. Admin only.
 */
const validateBackup = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup ID format.'
      });
    }

    const backup = await backupModel.findById(id);
    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'Backup record not found.'
      });
    }

    const validation = await backupService.validateBackupFile(backup);

    // Audit validation
    await createAuditLog({
      userId: req.user ? req.user.user_id : null,
      action: 'BACKUP_VALIDATED',
      entity: 'BACKUP',
      entityId: id,
      description: `Validated backup ${backup.file_name}: ${validation.valid ? 'VALID' : 'INVALID'}`,
      details: {
        backup_id: id,
        file_name: backup.file_name,
        valid: validation.valid,
        validation_message: validation.message
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: validation.valid ? 'Backup validation passed successfully' : (validation.message || validation.reason),
      data: validation
    });
  } catch (err) {
    console.error('[BackupController Error] Validation error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while validating backup.'
    });
  }
};

/**
 * POST /api/backups/:id/restore/prepare
 * Step 1 of Restore Workflow:
 * Validates backup and issues a single-use, 5-minute confirmation token.
 * Admin only.
 */
const prepareRestore = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup ID format.'
      });
    }

    const backup = await backupModel.findById(id);
    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'Backup record not found.'
      });
    }

    const currentStatus = (backup.status || '').toUpperCase();
    if (currentStatus !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: `Only completed backups can be restored. Current status: '${backup.status}'`
      });
    }

    // Validate integrity before issuing token
    const validation = await backupService.validateBackupFile(backup);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: `Cannot prepare restore: ${validation.message}`
      });
    }

    // Generate single-use confirmation token
    const { token, expiresAt } = backupService.generateRestoreToken(id);

    // Audit prepare
    await createAuditLog({
      userId: req.user ? req.user.user_id : null,
      action: 'RESTORE_PREPARED',
      entity: 'BACKUP',
      entityId: id,
      description: `Prepared restore session for backup ${backup.file_name}`,
      details: {
        backup_id: id,
        file_name: backup.file_name,
        target_database: backupService.ALLOWED_TARGET_DB
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Restore session prepared. Confirmation required within 5 minutes.',
      data: {
        backup_id: Number(id),
        file_name: backup.file_name,
        target_database: backupService.ALLOWED_TARGET_DB,
        confirmation_token: token,
        restore_token: token,
        token,
        expires_at: expiresAt,
        warning: 'This operation will replace tables in student_portal_db. An automatic pre-restore safety snapshot will be created first. The legacy database student_information_portal will NEVER be modified.'
      }
    });
  } catch (err) {
    console.error('[BackupController Error] Prepare restore error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while preparing restore session.'
    });
  }
};

/**
 * POST /api/backups/:id/restore/confirm
 * Step 2 of Restore Workflow:
 * Requires valid confirmation token.
 * Creates safety backup of current student_portal_db first.
 * Then executes restore strictly targeting student_portal_db.
 * Admin only.
 */
const confirmRestore = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid backup ID format.'
      });
    }

    const { confirmation_token, restore_token, token, target_database } = req.body || {};
    const effectiveToken = confirmation_token || restore_token || token;

    // HARD SAFETY CHECK: Target DB protection
    if (target_database && target_database !== backupService.ALLOWED_TARGET_DB) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Restoration can only target '${backupService.ALLOWED_TARGET_DB}'. The legacy database '${backupService.FORBIDDEN_LEGACY_DB}' cannot be modified.`
      });
    }

    // Verify & consume single-use token
    const tokenVerification = backupService.verifyAndConsumeRestoreToken(id, effectiveToken);
    if (!tokenVerification.valid) {
      return res.status(400).json({
        success: false,
        message: tokenVerification.message
      });
    }

    const backup = await backupModel.findById(id);
    if (!backup) {
      return res.status(404).json({
        success: false,
        message: 'Backup record not found.'
      });
    }

    // Audit restore started
    await createAuditLog({
      userId: req.user ? req.user.user_id : null,
      action: 'RESTORE_STARTED',
      entity: 'BACKUP',
      entityId: id,
      description: `Initiated database restore from ${backup.file_name} into ${backupService.ALLOWED_TARGET_DB}`,
      details: {
        backup_id: id,
        file_name: backup.file_name,
        target_database: backupService.ALLOWED_TARGET_DB
      },
      req
    });

    // Execute safe restore (automatically takes pre-restore snapshot)
    const restoreResult = await backupService.restoreDatabase({
      backupRecord: backup,
      targetDb: backupService.ALLOWED_TARGET_DB
    });

    // Re-record safety backup in backup_history so it is preserved in the restored database
    if (restoreResult.safetyBackup) {
      const sb = restoreResult.safetyBackup;
      try {
        await backupModel.create({
          initiatedByUserId: req.user ? req.user.user_id : 1,
          backupName: sb.fileName,
          backupPath: sb.filePath,
          backupType: 'PRE_RESTORE_SAFETY',
          status: 'COMPLETED',
          checksum: sb.checksum,
          fileSizeBytes: sb.fileSize,
          completedAt: new Date()
        });
      } catch (sbErr) {
        console.warn('[BackupController] Could not record safety backup in backup_history:', sbErr.message);
      }
    }

    // Record RESTORE_STARTED and RESTORE_COMPLETED in audit_logs so the complete restore lifecycle is preserved
    await createAuditLog({
      userId: req.user ? req.user.user_id : null,
      action: 'RESTORE_STARTED',
      entity: 'BACKUP',
      entityId: id,
      description: `Initiated database restore from ${backup.file_name} into ${backupService.ALLOWED_TARGET_DB}`,
      details: {
        backup_id: id,
        file_name: backup.file_name,
        target_database: backupService.ALLOWED_TARGET_DB
      },
      req
    });

    await createAuditLog({
      userId: req.user ? req.user.user_id : null,
      action: 'RESTORE_COMPLETED',
      entity: 'BACKUP',
      entityId: id,
      description: `Successfully restored database from ${backup.file_name}`,
      details: {
        backup_id: id,
        file_name: backup.file_name,
        target_database: backupService.ALLOWED_TARGET_DB,
        safety_snapshot: restoreResult.safetyBackup ? restoreResult.safetyBackup.fileName : null
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: `Database successfully restored into '${backupService.ALLOWED_TARGET_DB}'`,
      data: {
        backup_id: Number(id),
        restored_from: backup.file_name,
        target_database: backupService.ALLOWED_TARGET_DB,
        safety_backup: restoreResult.safetyBackup ? restoreResult.safetyBackup.fileName : null
      }
    });
  } catch (err) {
    console.error('[BackupController Error] Confirm restore error:', err.message);

    // Audit restore failed
    try {
      await createAuditLog({
        userId: req.user ? req.user.user_id : null,
        action: 'RESTORE_FAILED',
        entity: 'BACKUP',
        entityId: req.params.id,
        description: `Database restore failed: ${err.message}`,
        details: {
          backup_id: req.params.id,
          error: err.message
        },
        req
      });
    } catch (auditErr) {}

    return res.status(500).json({
      success: false,
      message: `Database restore failed: ${err.message}`
    });
  }
};

/**
 * 405 Method Not Allowed handler for mutation attempts on backup records
 */
const methodNotAllowed = (req, res) => {
  return res.status(405).json({
    success: false,
    message: 'Method Not Allowed. Backup history records and files cannot be modified or deleted directly.'
  });
};

module.exports = {
  createBackup,
  getBackups,
  getBackupById,
  downloadBackup,
  validateBackup,
  prepareRestore,
  confirmRestore,
  methodNotAllowed
};
