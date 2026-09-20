const faceAuthModel = require('../models/faceAuth.model');
const { successResponse, errorResponse } = require('../utils/response');
const { createAuditLog } = require('../services/audit.service');
const { generateToken } = require('../utils/token');

// Calculate Euclidean distance between two 128-dimensional vectors
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

// Validate 128-D embedding vector
function isValidEmbedding(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== 128) {
    return false;
  }
  for (let i = 0; i < 128; i++) {
    const val = embedding[i];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return false;
    }
  }
  // Check that vector is non-zero / non-trivial
  const sumSq = embedding.reduce((acc, x) => acc + x * x, 0);
  return sumSq > 0.0001;
}

/**
 * Get Face Authentication Status for Authenticated User
 * GET /api/face-auth/status
 */
const getStatus = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const status = await faceAuthModel.getFaceStatus(userId);
    return successResponse(res, 200, 'Face authentication status retrieved', status);
  } catch (error) {
    console.error('Error fetching face auth status:', error.message);
    return errorResponse(res, 500, 'Failed to fetch face authentication status');
  }
};

/**
 * Register Face Credential for Authenticated User
 * POST /api/face-auth/register
 */
const registerFace = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { liveness_verified, liveness_score, liveness_method } = req.body;
    const face_embedding = req.body.face_embedding || req.body.embedding;

    // 1. Validation: Liveness verification must be true
    if (liveness_verified !== true) {
      return errorResponse(res, 400, 'Liveness verification required prior to registration');
    }

    // 2. Validation: Embedding must be 128 finite floats
    if (!isValidEmbedding(face_embedding)) {
      return errorResponse(res, 400, 'Invalid face embedding format. Expected 128-dimensional float vector.');
    }

    // 3. Save face credential securely (AES-256-GCM encrypted)
    const status = await faceAuthModel.saveFaceCredential({
      userId,
      embeddingArray: face_embedding,
      livenessScore: typeof liveness_score === 'number' ? Math.min(1, Math.max(0, liveness_score)) : 1.0000,
      livenessMethod: typeof liveness_method === 'string' ? liveness_method.slice(0, 50) : 'EYE_BLINK_AND_HEAD_POSE'
    });

    // 4. Audit log event without storing any biometric data
    await createAuditLog({
      userId,
      action: 'FACE_REGISTERED',
      entity: 'user_face_credentials',
      entityId: userId,
      description: `User ${req.user.username} successfully registered face authentication credential`,
      details: { username: req.user.username, role: req.user.role },
      req
    });

    return successResponse(res, 201, 'Face registered successfully', status);
  } catch (error) {
    console.error('Error registering face credential:', error.message);
    return errorResponse(res, 500, 'Failed to register face credential');
  }
};

/**
 * Verify / Test Live Face Against Registered Credential
 * POST /api/face-auth/verify-test
 */
const verifyTestFace = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const face_embedding = req.body.face_embedding || req.body.embedding;

    if (!isValidEmbedding(face_embedding)) {
      return errorResponse(res, 400, 'Invalid face embedding format for verification');
    }

    // Fetch registered template
    const credential = await faceAuthModel.getFaceCredentialByUserId(userId);
    if (!credential || !credential.embedding) {
      return errorResponse(res, 404, 'No registered face found for this user account. Please register your face first.');
    }

    // Calculate Euclidean distance
    const distance = calculateEuclideanDistance(credential.embedding, face_embedding);

    // Standard threshold: distance < 0.55 constitutes a genuine match
    const MATCH_THRESHOLD = 0.55;
    const matched = distance < MATCH_THRESHOLD;
    const confidence = Math.max(0, Math.min(100, Math.round((1 - (distance / 0.6)) * 100)));

    // Audit log verification event without biometric data
    await createAuditLog({
      userId,
      action: 'FACE_TEST_VERIFIED',
      entity: 'user_face_credentials',
      entityId: userId,
      description: `User ${req.user.username} performed face test verification (${matched ? 'MATCH' : 'NO_MATCH'})`,
      details: { username: req.user.username, matched, distance: Number(distance.toFixed(4)) },
      req
    });

    return successResponse(res, 200, matched ? 'Face verification match successful' : 'Face did not match registered template', {
      matched,
      confidence,
      distance: Number(distance.toFixed(4))
    });
  } catch (error) {
    console.error('Error verifying test face:', error.message);
    return errorResponse(res, 500, 'Failed to verify face credential');
  }
};

/**
 * Remove Face Credential for Authenticated User
 * DELETE /api/face-auth/remove
 */
const removeFace = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const removed = await faceAuthModel.removeFaceCredential(userId);
    if (!removed) {
      return errorResponse(res, 404, 'No active face credential found to remove');
    }

    // Audit log event
    await createAuditLog({
      userId,
      action: 'FACE_REMOVED',
      entity: 'user_face_credentials',
      entityId: userId,
      description: `User ${req.user.username} removed their registered face credential`,
      details: { username: req.user.username, role: req.user.role },
      req
    });

    return successResponse(res, 200, 'Face credential removed successfully');
  } catch (error) {
    console.error('Error removing face credential:', error.message);
    return errorResponse(res, 500, 'Failed to remove face credential');
  }
};

/**
 * Biometric Face Login (1:N Anonymous Identification)
 * POST /api/face-auth/login
 * Client never specifies user_id. Identity is identified from encrypted biometric templates.
 */
const loginWithFace = async (req, res) => {
  try {
    const face_embedding = req.body.face_embedding || req.body.embedding;
    const { liveness_verified, liveness_score, liveness_method } = req.body;

    // 1. Validation: Liveness verification must be true
    if (liveness_verified !== true) {
      return errorResponse(res, 400, 'Liveness verification required prior to face login');
    }

    // 2. Validation: Vector must be exactly 128 finite floats
    if (!isValidEmbedding(face_embedding)) {
      return errorResponse(res, 400, 'Invalid face embedding format for login');
    }

    // 3. Search all active registered face credentials
    const matchResult = await faceAuthModel.findMatchingUserByEmbedding(face_embedding);

    // Generic failure message to prevent account enumeration
    const genericFailure = 'Face authentication failed. Please try again or use password login.';

    if (!matchResult.matched || !matchResult.user) {
      // Audit log failed attempt without biometric data
      await createAuditLog({
        userId: null,
        action: 'FACE_LOGIN_FAILED',
        entity: 'users',
        description: 'Failed face authentication attempt (no matching biometric credential found)',
        details: {
          reason: matchResult.reason || 'NO_MATCH',
          best_distance: matchResult.distance !== null ? Number(matchResult.distance) : null
        },
        req
      });
      return errorResponse(res, 401, genericFailure);
    }

    const matchedUser = matchResult.user;

    // 4. Check user account active status
    if (matchedUser.user_active === false || matchedUser.is_active === false) {
      await createAuditLog({
        userId: matchedUser.user_id,
        action: 'FACE_LOGIN_FAILED',
        entity: 'users',
        entityId: matchedUser.user_id,
        description: `Face authentication rejected for deactivated account: ${matchedUser.username}`,
        details: { username: matchedUser.username, reason: 'ACCOUNT_DEACTIVATED' },
        req
      });
      return errorResponse(res, 403, 'Account is deactivated. Please contact an administrator.');
    }

    // 5. Generate JWT token with identical claims as password login
    const tokenPayload = {
      user_id: matchedUser.user_id,
      username: matchedUser.username,
      role: matchedUser.role
    };
    const token = generateToken(tokenPayload);

    // 6. Safe user object (never returns password_hash or biometric data)
    const safeUser = {
      user_id: matchedUser.user_id,
      role_id: matchedUser.role_id,
      username: matchedUser.username,
      email: matchedUser.email,
      first_name: matchedUser.first_name,
      last_name: matchedUser.last_name,
      phone: matchedUser.phone,
      role: matchedUser.role,
      must_change_password: Boolean(matchedUser.must_change_password)
    };

    // 7. Audit log successful face authentication
    await createAuditLog({
      userId: matchedUser.user_id,
      action: 'FACE_LOGIN_SUCCESS',
      entity: 'users',
      entityId: matchedUser.user_id,
      description: `User ${matchedUser.username} logged in successfully via biometric face authentication`,
      details: {
        username: matchedUser.username,
        role: matchedUser.role,
        distance: matchResult.distance,
        confidence: matchResult.confidence
      },
      req
    });

    return successResponse(res, 200, 'Face authentication successful', {
      token,
      user: safeUser
    });
  } catch (error) {
    console.error('Face login authentication error:', error.message);
    return errorResponse(res, 500, 'An error occurred during face authentication');
  }
};

module.exports = {
  getStatus,
  registerFace,
  verifyTestFace,
  removeFace,
  loginWithFace
};
