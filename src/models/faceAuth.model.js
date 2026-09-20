const crypto = require('crypto');
const pool = require('../config/db');

// Derive 32-byte encryption key for AES-256-GCM
function getEncryptionKey() {
  const secret = process.env.FACE_ENCRYPTION_KEY || process.env.JWT_SECRET || 'portal_face_biometric_salt_key_2026';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a 128-float face embedding array using AES-256-GCM.
 * User ID is bound as Additional Authenticated Data (AAD) to prevent ciphertext transplantation.
 */
function encryptEmbedding(embeddingArray, userId) {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(String(userId)));

  const plaintext = JSON.stringify(embeddingArray);
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  return `${iv.toString('base64')}:${authTag}:${ciphertext}`;
}

/**
 * Decrypt an encrypted face embedding using AES-256-GCM.
 */
function decryptEmbedding(encryptedPayload, userId) {
  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted embedding format');
    }
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(String(userId)));
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(dataB64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Failed to decrypt face embedding:', err.message);
    return null;
  }
}

/**
 * Retrieve face authentication status for a user (safe, no biometric data)
 */
async function getFaceStatus(userId) {
  const [rows] = await pool.query(
    'SELECT face_credential_id, registered_at, liveness_method, is_active FROM user_face_credentials WHERE user_id = ? AND is_active = TRUE LIMIT 1',
    [userId]
  );

  if (!rows || rows.length === 0) {
    return {
      is_registered: false,
      registered_at: null,
      liveness_method: null,
      is_active: false
    };
  }

  const cred = rows[0];
  return {
    is_registered: true,
    registered_at: cred.registered_at,
    liveness_method: cred.liveness_method || 'EAR_BLINK_DETECTION',
    is_active: Boolean(cred.is_active)
  };
}

/**
 * Retrieve internal face credential with decrypted embedding for match verification
 */
async function getFaceCredentialByUserId(userId) {
  const [rows] = await pool.query(
    'SELECT face_credential_id, user_id, face_embedding, liveness_score, liveness_method, registered_at, is_active FROM user_face_credentials WHERE user_id = ? AND is_active = TRUE LIMIT 1',
    [userId]
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const cred = rows[0];
  const decryptedEmbedding = decryptEmbedding(cred.face_embedding, userId);
  if (!decryptedEmbedding) {
    return null;
  }

  return {
    face_credential_id: cred.face_credential_id,
    user_id: cred.user_id,
    embedding: decryptedEmbedding,
    liveness_score: cred.liveness_score,
    liveness_method: cred.liveness_method,
    registered_at: cred.registered_at,
    is_active: Boolean(cred.is_active)
  };
}

/**
 * Save or update face credential for authenticated user
 */
async function saveFaceCredential({ userId, embeddingArray, livenessScore = null, livenessMethod = 'EYE_BLINK_AND_HEAD_POSE' }) {
  const encrypted = encryptEmbedding(embeddingArray, userId);

  const query = `
    INSERT INTO user_face_credentials (
      user_id, face_embedding, liveness_score, liveness_method, registered_at, is_active
    ) VALUES (?, ?, ?, ?, NOW(), TRUE)
    ON DUPLICATE KEY UPDATE
      face_embedding = VALUES(face_embedding),
      liveness_score = VALUES(liveness_score),
      liveness_method = VALUES(liveness_method),
      registered_at = NOW(),
      is_active = TRUE,
      updated_at = NOW()
  `;

  await pool.query(query, [userId, encrypted, livenessScore, livenessMethod]);
  return getFaceStatus(userId);
}

/**
 * Remove / disable face credential for authenticated user
 */
async function removeFaceCredential(userId) {
  const [result] = await pool.query(
    'DELETE FROM user_face_credentials WHERE user_id = ?',
    [userId]
  );
  return result.affectedRows > 0;
}

/**
 * Centralized Threshold Configuration
 * Euclidean distance d < 0.55 defines a genuine biometric facial match
 */
const DEFAULT_MATCH_THRESHOLD = 0.55;

/**
 * Calculate Euclidean distance between two 128-D vectors
 */
function calculateEuclideanDistance(v1, v2) {
  if (!v1 || !v2 || v1.length !== 128 || v2.length !== 128) {
    return Infinity;
  }
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * 1:N Biometric Search: Searches all active registered face credentials to identify a user.
 * Decrypts each credential using AES-256-GCM with AAD bound to user_id.
 * Finds minimum Euclidean distance d_min and verifies d_min < threshold.
 */
async function findMatchingUserByEmbedding(probeEmbedding, threshold = DEFAULT_MATCH_THRESHOLD) {
  const sql = `
    SELECT 
      fc.face_credential_id,
      fc.user_id,
      fc.face_embedding,
      fc.liveness_score,
      fc.is_active AS face_is_active,
      u.user_id AS u_user_id,
      u.role_id,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      u.phone,
      u.is_active AS user_is_active,
      u.must_change_password,
      r.role_name AS role
    FROM user_face_credentials fc
    INNER JOIN users u ON fc.user_id = u.user_id
    INNER JOIN roles r ON u.role_id = r.role_id
    WHERE fc.is_active = TRUE AND u.is_active = TRUE
  `;

  const [rows] = await pool.query(sql);
  if (!rows || rows.length === 0) {
    return { matched: false, distance: Infinity, user: null, reason: 'NO_CREDENTIALS' };
  }

  let bestDistance = Infinity;
  let bestUser = null;

  for (const row of rows) {
    const decryptedEmbedding = decryptEmbedding(row.face_embedding, row.user_id);
    if (!decryptedEmbedding) continue;

    const distance = calculateEuclideanDistance(probeEmbedding, decryptedEmbedding);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestUser = row;
    }
  }

  if (bestUser && bestDistance < threshold) {
    const confidence = Math.max(0, Math.min(100, Math.round((1 - (bestDistance / 0.6)) * 100)));
    return {
      matched: true,
      distance: Number(bestDistance.toFixed(4)),
      confidence,
      user: {
        user_id: bestUser.user_id,
        role_id: bestUser.role_id,
        username: bestUser.username,
        email: bestUser.email,
        first_name: bestUser.first_name,
        last_name: bestUser.last_name,
        phone: bestUser.phone,
        role: bestUser.role,
        must_change_password: Boolean(bestUser.must_change_password)
      }
    };
  }

  return {
    matched: false,
    distance: bestDistance === Infinity ? null : Number(bestDistance.toFixed(4)),
    user: null,
    reason: 'NO_MATCH'
  };
}

module.exports = {
  DEFAULT_MATCH_THRESHOLD,
  calculateEuclideanDistance,
  encryptEmbedding,
  decryptEmbedding,
  getFaceStatus,
  getFaceCredentialByUserId,
  saveFaceCredential,
  removeFaceCredential,
  findMatchingUserByEmbedding
};

