const pool = require('../config/db');

/**
 * Save or update a Web Push subscription for a user.
 * Supports multiple devices per user. Deduplicates by endpoint.
 *
 * @param {object} params
 * @param {number} params.userId
 * @param {string} params.endpoint
 * @param {string} params.p256dh
 * @param {string} params.auth
 * @param {string} [params.userAgent]
 * @returns {Promise<object>}
 */
const saveSubscription = async ({ userId, endpoint, p256dh, auth, userAgent = null }) => {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0 || !endpoint || !p256dh || !auth) {
    throw new Error('Invalid push subscription parameters');
  }

  // Check if endpoint already registered
  const [existing] = await pool.query(
    'SELECT subscription_id, user_id FROM push_subscriptions WHERE endpoint = ? LIMIT 1',
    [endpoint.trim()]
  );

  if (existing.length > 0) {
    // Update existing subscription with user and keys
    await pool.query(
      'UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, user_agent = ?, updated_at = NOW() WHERE subscription_id = ?',
      [uid, p256dh.trim(), auth.trim(), userAgent ? userAgent.slice(0, 255) : null, existing[0].subscription_id]
    );
    return { subscription_id: existing[0].subscription_id, is_new: false };
  }

  // Insert new subscription
  const [result] = await pool.query(
    'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)',
    [uid, endpoint.trim(), p256dh.trim(), auth.trim(), userAgent ? userAgent.slice(0, 255) : null]
  );

  return { subscription_id: result.insertId, is_new: true };
};

/**
 * Retrieve all push subscriptions for a user
 * @param {number} userId
 * @returns {Promise<Array>}
 */
const getSubscriptionsByUserId = async (userId) => {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) return [];

  const [rows] = await pool.query(
    'SELECT subscription_id, user_id, endpoint, p256dh, auth, user_agent, created_at FROM push_subscriptions WHERE user_id = ?',
    [uid]
  );
  return rows;
};

/**
 * Retrieve all push subscriptions for a list of users
 * @param {Array<number>} userIds
 * @returns {Promise<Array>}
 */
const getSubscriptionsByUserIds = async (userIds) => {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const validIds = userIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
  if (validIds.length === 0) return [];

  const [rows] = await pool.query(
    'SELECT subscription_id, user_id, endpoint, p256dh, auth, user_agent FROM push_subscriptions WHERE user_id IN (?)',
    [validIds]
  );
  return rows;
};

/**
 * Remove a subscription by its endpoint (used on user unsubscribe or when push service returns 404/410)
 * @param {string} endpoint
 * @returns {Promise<boolean>}
 */
const deleteByEndpoint = async (endpoint) => {
  if (!endpoint) return false;
  const [result] = await pool.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint.trim()]);
  return result.affectedRows > 0;
};

/**
 * Remove all subscriptions for a user
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
const deleteByUserId = async (userId) => {
  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) return false;
  const [result] = await pool.query('DELETE FROM push_subscriptions WHERE user_id = ?', [uid]);
  return result.affectedRows > 0;
};

module.exports = {
  saveSubscription,
  getSubscriptionsByUserId,
  getSubscriptionsByUserIds,
  deleteByEndpoint,
  deleteByUserId
};
