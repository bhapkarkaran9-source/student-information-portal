const express = require('express');
const noticeController = require('../controllers/notice.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');

const router = express.Router();

router.use(requireAuth);

// Analytics / Stats
router.get('/stats', noticeController.getNoticeStats);

// Core CRUD Endpoints
router.get('/', noticeController.getNotices);
router.get('/:id', noticeController.getNoticeById);
router.post('/', requireRole('ADMIN'), noticeController.createNotice);
router.put('/:id', requireRole('ADMIN'), noticeController.updateNotice);
router.delete('/:id', requireRole('ADMIN'), noticeController.deleteNotice);

module.exports = router;
