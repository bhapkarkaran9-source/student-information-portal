const express = require('express');
const notificationController = require('../controllers/notification.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

// All notification endpoints require authenticated session
router.use(requireAuth);

// User-level notification endpoints (available to all authenticated roles: ADMIN, TEACHER, STUDENT)
router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.patch('/:id/read', notificationController.markAsRead);
router.patch('/read-all', notificationController.markAllAsRead);

// Web Push Notification endpoints (available to all authenticated roles: ADMIN, TEACHER, STUDENT)
router.get('/push/vapid-key', notificationController.getVapidKey);
router.post('/push/subscribe', notificationController.subscribePush);
router.post('/push/unsubscribe', notificationController.unsubscribePush);

// Administrative notification management routes (ADMIN ONLY)
router.use(requireRole('ADMIN'));

router.get('/stats', notificationController.getNotificationStats);
router.get('/:id', notificationController.getNotificationById);
router.post('/', notificationController.createNotification);
router.post('/broadcast', notificationController.broadcastNotification);
router.put('/:id', notificationController.updateNotification);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;
