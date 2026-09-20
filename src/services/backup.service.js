const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
require('dotenv').config();

// Dedicated server-side backup storage directory outside public/
const BACKUP_DIR = path.resolve(__dirname, '..', '..', 'backups');

// Guarantee backup storage directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Strictly enforced target database name — IMMUTABLE HARD SAFETY RULE
const ALLOWED_TARGET_DB = 'student_portal_db';
const FORBIDDEN_LEGACY_DB = 'student_information_portal';

// In-memory store for single-use restore confirmation tokens
// Format: token -> { backupId, expiresAt }
const restoreTokenStore = new Map();
const RESTORE_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clean up expired restore tokens periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of restoreTokenStore.entries()) {
    if (data.expiresAt < now) {
      restoreTokenStore.delete(token);
    }
  }
}, 60 * 1000);

/**
 * Generates a single-use cryptographically secure restore confirmation token.
 * Not a JWT, single-use, expires in 5 minutes.
 */
function generateRestoreToken(backupId) {
  const token = 'rst_' + crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + RESTORE_TOKEN_TTL_MS;
  restoreTokenStore.set(token, {
    backupId: Number(backupId),
    expiresAt
  });
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

/**
 * Validates and immediately consumes a restore confirmation token.
 * Single-use: Deleted upon first verification attempt.
 */
function verifyAndConsumeRestoreToken(backupId, token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, message: 'Restore confirmation token is required' };
  }

  const data = restoreTokenStore.get(token);
  if (!data) {
    return { valid: false, message: 'Invalid or already consumed restore confirmation token' };
  }

  // Consume immediately
  restoreTokenStore.delete(token);

  if (data.expiresAt < Date.now()) {
    return { valid: false, message: 'Restore confirmation token has expired' };
  }

  if (data.backupId !== Number(backupId)) {
    return { valid: false, message: 'Restore confirmation token does not match target backup ID' };
  }

  return { valid: true };
}

/**
 * Resolves safe file path within BACKUP_DIR, preventing path traversal.
 */
function resolveSafeBackupPath(filename) {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Invalid backup filename');
  }

  // Disallow any path separators, parent directory traversal, or protocol schemes
  const cleanName = path.basename(filename);
  if (cleanName !== filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Path traversal attempt detected');
  }

  const resolved = path.resolve(BACKUP_DIR, cleanName);
  if (!resolved.startsWith(path.resolve(BACKUP_DIR))) {
    throw new Error('Resolved path is outside authorized backup storage');
  }

  return resolved;
}

/**
 * Computes SHA-256 checksum and file size of an existing file.
 */
function computeFileHashAndSize(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    let bytesRead = 0;

    stream.on('data', chunk => {
      bytesRead += chunk.length;
      hash.update(chunk);
    });

    stream.on('end', () => {
      resolve({
        checksum: hash.digest('hex'),
        fileSize: bytesRead
      });
    });

    stream.on('error', reject);
  });
}

/**
 * Generates a database backup using native mysqldump CLI safely.
 * 
 * Safety specifications:
 * - Target database is fixed to student_portal_db.
 * - Credentials injected via MYSQL_PWD environment variable.
 * - Written directly to backups/ outside public/.
 * - Computes SHA-256 hash and validates file integrity.
 */
async function createDatabaseBackup({
  backupType = 'FULL_DATABASE',
  isPreRestore = false
} = {}) {
  // Hard safety check
  const targetDb = ALLOWED_TARGET_DB;
  if (targetDb === FORBIDDEN_LEGACY_DB) {
    throw new Error(`CRITICAL: Prohibited target database ${FORBIDDEN_LEGACY_DB}`);
  }

  const host = process.env.DB_HOST || 'localhost';
  const port = String(process.env.DB_PORT || '3306');
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  // Generate safe filename: student_portal_db_YYYYMMDD_HHMMSS_[rand].sql
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const randomSuffix = crypto.randomBytes(3).toString('hex');
  const prefix = isPreRestore ? 'pre_restore_safety_' : '';
  const fileName = `${prefix}student_portal_db_${dateStr}_${randomSuffix}.sql`;
  const filePath = path.join(BACKUP_DIR, fileName);

  const args = [
    `--host=${host}`,
    `--port=${port}`,
    `--user=${user}`,
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    targetDb
  ];

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    const hash = crypto.createHash('sha256');
    let totalBytes = 0;
    let errOutput = '';

    // Spawn child process with isolated environment containing MYSQL_PWD
    const child = spawn('mysqldump', args, {
      env: { ...process.env, MYSQL_PWD: password },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.on('data', chunk => {
      totalBytes += chunk.length;
      hash.update(chunk);
      writeStream.write(chunk);
    });

    child.stderr.on('data', chunk => {
      errOutput += chunk.toString('utf8');
    });

    child.on('error', err => {
      writeStream.end();
      // Clean up partial file on launch error
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
      reject(new Error(`Failed to execute mysqldump: ${err.message}`));
    });

    child.on('close', code => {
      writeStream.end();

      if (code !== 0) {
        // Clean up partial file on failure
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
        // Sanitize error output to remove any sensitive text
        const safeError = (errOutput || `mysqldump exited with error code ${code}`)
          .replace(new RegExp(password, 'g'), '[REDACTED]');
        return reject(new Error(safeError));
      }

      // Verify file exists and has size
      if (!fs.existsSync(filePath) || totalBytes === 0) {
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
        return reject(new Error('Backup generated empty or unreadable file'));
      }

      const checksum = hash.digest('hex');

      resolve({
        fileName,
        filePath,
        fileSize: totalBytes,
        checksum,
        backupType
      });
    });
  });
}

/**
 * Validates the integrity of an existing backup file.
 * Non-destructive: checks existence, readability, size, SHA-256 hash, and SQL dump signature.
 */
async function validateBackupFile(backupRecord) {
  if (!backupRecord) {
    return { valid: false, isValid: false, message: 'Backup record not found', reason: 'Backup record not found' };
  }

  const fileName = backupRecord.backup_name || backupRecord.file_name;
  if (!fileName) {
    return { valid: false, isValid: false, message: 'Backup record lacks a filename', reason: 'Backup record lacks a filename' };
  }

  let safePath;
  try {
    safePath = resolveSafeBackupPath(fileName);
  } catch (err) {
    return { valid: false, isValid: false, message: `Invalid file path: ${err.message}`, reason: `Invalid file path: ${err.message}` };
  }

  if (!fs.existsSync(safePath)) {
    return { valid: false, isValid: false, message: 'Backup file does not exist on disk', reason: 'Backup file does not exist on disk' };
  }

  let stats;
  try {
    stats = fs.statSync(safePath);
  } catch (err) {
    return { valid: false, isValid: false, message: `Cannot access backup file: ${err.message}`, reason: `Cannot access backup file: ${err.message}` };
  }

  if (stats.size === 0) {
    return { valid: false, isValid: false, message: 'Backup file is empty (0 bytes)', reason: 'Backup file is empty (0 bytes)' };
  }

  // Compute checksum
  const { checksum, fileSize } = await computeFileHashAndSize(safePath);

  // Compare checksum if stored in database
  const expectedChecksum = backupRecord.checksum;
  if (expectedChecksum && expectedChecksum.trim()) {
    if (checksum.toLowerCase() !== expectedChecksum.trim().toLowerCase()) {
      return {
        valid: false,
        isValid: false,
        message: 'SHA-256 checksum mismatch. File may have been altered or corrupted.',
        reason: 'SHA-256 checksum mismatch. File may have been altered or corrupted.',
        computedChecksum: checksum,
        storedChecksum: expectedChecksum
      };
    }
  }

  // Verify SQL dump header signature
  const headerBuffer = Buffer.alloc(512);
  const fd = fs.openSync(safePath, 'r');
  fs.readSync(fd, headerBuffer, 0, 512, 0);
  fs.closeSync(fd);

  const headerStr = headerBuffer.toString('utf8');
  const hasSqlSignature = headerStr.includes('MySQL dump') ||
                          headerStr.includes('MariaDB dump') ||
                          headerStr.includes('/*!40101 SET') ||
                          headerStr.includes('-- Table structure');

  if (!hasSqlSignature) {
    return {
      valid: false,
      isValid: false,
      message: 'File content does not match a valid MySQL dump format',
      reason: 'File content does not match a valid MySQL dump format'
    };
  }

  return {
    valid: true,
    isValid: true,
    message: 'Backup integrity verified successfully',
    reason: 'Backup integrity verified successfully',
    fileSize,
    checksum,
    format: 'MySQL Dump (SQL)'
  };
}

/**
 * Restores a database backup safely.
 * 
 * Safety invariants:
 * 1. Target database is STRICTLY student_portal_db.
 * 2. If target is student_information_portal or anything else -> Immediate Abort.
 * 3. Validates file integrity before execution.
 * 4. Takes and verifies an automatic safety snapshot of current student_portal_db.
 * 5. If safety snapshot fails, RESTORE IS NEVER EXECUTED.
 * 6. Streams .sql file into mysql CLI stdin.
 */
async function restoreDatabase({
  backupRecord,
  targetDb = ALLOWED_TARGET_DB
}) {
  // HARD INVARIANT 1: Target must be student_portal_db
  if (targetDb !== ALLOWED_TARGET_DB) {
    throw new Error(`CRITICAL: Restoration target must strictly be '${ALLOWED_TARGET_DB}'. Attempted: '${targetDb}'`);
  }

  // HARD INVARIANT 2: Legacy DB must never be targeted
  if (targetDb === FORBIDDEN_LEGACY_DB || String(targetDb).toLowerCase().includes('information_portal')) {
    throw new Error(`CRITICAL SAFETY VIOLATION: Cannot restore to legacy database '${FORBIDDEN_LEGACY_DB}'`);
  }

  // 1. Validate backup file integrity
  const validation = await validateBackupFile(backupRecord);
  if (!validation.valid) {
    throw new Error(`Cannot restore invalid backup: ${validation.message}`);
  }

  const fileName = backupRecord.backup_name || backupRecord.file_name;
  const safePath = resolveSafeBackupPath(fileName);

  // 2. Pre-restore Safety Snapshot of current student_portal_db
  let safetyBackup = null;
  try {
    safetyBackup = await createDatabaseBackup({
      backupType: 'FULL_DATABASE',
      isPreRestore: true
    });
  } catch (safetyErr) {
    throw new Error(`Pre-restore safety backup failed: ${safetyErr.message}. Restoration aborted to prevent data loss.`);
  }

  // 3. Execute restoration via mysql client
  const host = process.env.DB_HOST || 'localhost';
  const port = String(process.env.DB_PORT || '3306');
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  const args = [
    `--host=${host}`,
    `--port=${port}`,
    `--user=${user}`,
    targetDb
  ];

  return new Promise((resolve, reject) => {
    let errOutput = '';

    const child = spawn('mysql', args, {
      env: { ...process.env, MYSQL_PWD: password },
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe']
    });

    const fileStream = fs.createReadStream(safePath);
    fileStream.pipe(child.stdin);

    child.stderr.on('data', chunk => {
      errOutput += chunk.toString('utf8');
    });

    child.on('error', err => {
      reject(new Error(`Failed to execute mysql client: ${err.message}`));
    });

    child.on('close', code => {
      if (code !== 0) {
        const safeErr = (errOutput || `mysql client exited with error code ${code}`)
          .replace(new RegExp(password, 'g'), '[REDACTED]');
        return reject(new Error(`Restoration execution failed: ${safeErr}`));
      }

      resolve({
        success: true,
        restoredFrom: fileName,
        targetDatabase: targetDb,
        safetyBackup
      });
    });
  });
}

module.exports = {
  BACKUP_DIR,
  ALLOWED_TARGET_DB,
  FORBIDDEN_LEGACY_DB,
  createDatabaseBackup,
  validateBackupFile,
  restoreDatabase,
  resolveSafeBackupPath,
  computeFileHashAndSize,
  generateRestoreToken,
  verifyAndConsumeRestoreToken
};
