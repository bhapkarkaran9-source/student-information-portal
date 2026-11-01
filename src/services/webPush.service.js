const webpush = require('web-push');
const PushSubscription = require('../models/pushSubscription.model');

// Initialize VAPID settings from environment
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@studentportal.local';

let isConfigured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    isConfigured = true;
  } catch (err) {
    console.warn('[WebPush] Error configuring VAPID details:', err.message);
  }
}

/**
 * Returns VAPID public key for frontend subscription
 * @returns {string|null}
 */
const getVapidPublicKey = () => {
  return VAPID_PUBLIC_KEY || null;
};

/**
 * Check if Web Push is configured and enabled
 * @returns {boolean}
 */
const isWebPushEnabled = () => {
  return isConfigured && Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
};

/**
 * Resolve target navigation URL based on notification type
 * @param {string} type
 * @returns {string}
 */
const resolveNotificationUrl = (type) => {
  const t = String(type || '').trim().toLowerCase();
  switch (t) {
    case 'assignment':
      return '/pages/student/assignments.html';
    case 'attendance':
      return '/pages/student/attendance.html';
    case 'studymaterial':
    case 'study_material':
      return '/pages/student/study-material.html';
    case 'timetable':
      return '/pages/student/timetable.html';
    case 'exam':
    case 'academic':
      return '/pages/student/calendar.html';
    case 'grade':
    case 'result':
      return '/pages/student/reports.html';
    case 'notice':
      return '/pages/student/notices.html';
    case 'query':
      return '/pages/student/queries.html';
    default:
      return '/pages/student/notifications.html';
  }
};

/**
 * Dispatch Web Push notification to all active devices of a given user.
 * Non-blocking, failure-isolated, auto-cleans expired subscriptions.
 *
 * @param {number} userId
 * @param {object} notification
 * @param {string} notification.title
 * @param {string} notification.message
 * @param {string} [notification.notification_type]
 * @param {object} [notification.metadata]
 * @returns {Promise<{ sent: number, failed: number }>}
 */
const sendPushToUser = async (userId, notification) => {
  if (!isWebPushEnabled()) return { sent: 0, failed: 0 };

  const uid = parseInt(userId, 10);
  if (isNaN(uid) || uid <= 0) return { sent: 0, failed: 0 };

  try {
    const subscriptions = await PushSubscription.getSubscriptionsByUserId(uid);
    if (!subscriptions || subscriptions.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const targetUrl = notification.metadata?.url || resolveNotificationUrl(notification.notification_type);

    const payload = JSON.stringify({
      title: notification.title || 'Student Information Portal',
      body: notification.message || 'You have a new notification.',
      icon: '/images/portal-logo.png',
      badge: '/images/portal-badge.png',
      tag: `sip-notif-${notification.notification_type || 'general'}-${Date.now()}`,
      data: {
        url: targetUrl,
        type: notification.notification_type || 'General',
        timestamp: new Date().toISOString()
      }
    });

    let sent = 0;
    let failed = 0;

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        try {
          await webpush.sendNotification(pushSubscription, payload);
          sent++;
        } catch (err) {
          failed++;
          // HTTP 404 Not Found or 410 Gone indicates subscription has expired or unsubscribed
          if (err.statusCode === 404 || err.statusCode === 410) {
            try {
              await PushSubscription.deleteByEndpoint(sub.endpoint);
              console.log(`[WebPush] Removed expired subscription for user #${uid}`);
            } catch (delErr) {
              // ignore deletion error
            }
          } else {
            console.warn(`[WebPush] Push dispatch failed for user #${uid}:`, err.message);
          }
        }
      })
    );

    return { sent, failed };
  } catch (err) {
    console.warn(`[WebPush] Error dispatching push to user #${userId}:`, err.message);
    return { sent: 0, failed: 0 };
  }
};

/**
 * Dispatch Web Push notification to a list of users
 * @param {Array<number>} userIds
 * @param {object} notification
 * @returns {Promise<{ sent: number, failed: number }>}
 */
const sendPushToUsers = async (userIds, notification) => {
  if (!isWebPushEnabled() || !Array.isArray(userIds) || userIds.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let totalSent = 0;
  let totalFailed = 0;

  for (const uid of userIds) {
    const res = await sendPushToUser(uid, notification);
    totalSent += res.sent;
    totalFailed += res.failed;
  }

  return { sent: totalSent, failed: totalFailed };
};

module.exports = {
  getVapidPublicKey,
  isWebPushEnabled,
  sendPushToUser,
  sendPushToUsers,
  resolveNotificationUrl
};
