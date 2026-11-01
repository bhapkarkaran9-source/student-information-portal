const pool = require('../config/db');

/**
 * Password Reset Model
 * Manages database interactions for password_reset_tokens table.
 */

/**
 * Creates a new password reset token entry
 * @param {object} params
 * @param {number} params.userId
 * @param {string} params.tokenHash
 * @param {Date|string} params.expiresAt
 * @returns {Promise<number>} Inserted token row ID
 */
const createResetToken = async ({ userId, tokenHash, expiresAt }) => {
  const sql = `
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `;
  const [result] = await pool.query(sql, [userId, tokenHash, expiresAt]);
  return result.insertId;
};

/**
 * Finds a password reset token by its SHA-256 hash along with user details
 * @param {string} tokenHash
 * @returns {Promise<object|null>}
 */
const findTokenByHash = async (tokenHash) => {
  const sql = `
    SELECT
      prt.id,
      prt.user_id,
      prt.token_hash,
      prt.expires_at,
      prt.used_at,
      prt.created_at,
      u.username,
      u.email,
      u.first_name,
      u.last_name,
      u.is_active,
      r.role_name AS role
    FROM password_reset_tokens prt
    INNER JOIN users u ON prt.user_id = u.user_id
    INNER JOIN roles r ON u.role_id = r.role_id
    WHERE prt.token_hash = ?
    ORDER BY prt.id DESC
    LIMIT 1
  `;
  const [rows] = await pool.query(sql, [tokenHash]);
  return rows[0] || null;
};

/**
 * Marks a specific reset token as used
 * @param {number} id
 * @returns {Promise<boolean>}
 */
const markTokenUsed = async (id) => {
  const sql = `
    UPDATE password_reset_tokens
    SET used_at = NOW()
    WHERE id = ?
  `;
  const [result] = await pool.query(sql, [id]);
  return result.affectedRows > 0;
};

/**
 * Invalidates any existing unused tokens for a user
 * @param {number} userId
 * @returns {Promise<number>} Number of invalidated tokens
 */
const invalidateUserTokens = async (userId) => {
  const sql = `
    UPDATE password_reset_tokens
    SET used_at = NOW()
    WHERE user_id = ? AND used_at IS NULL
  `;
  const [result] = await pool.query(sql, [userId]);
  return result.affectedRows;
};

module.exports = {
  createResetToken,
  findTokenByHash,
  markTokenUsed,
  invalidateUserTokens
};
