const express = require('express');
const reportController = require('../controllers/report.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

// All report endpoints require authentication
router.use(requireAuth);

// Filter options helper
router.get('/filters/options', reportController.getFilterOptions);

// Report preview (JSON)
router.get('/:reportType', reportController.getReport);

// CSV Export
router.get('/:reportType/csv', reportController.exportReportCsv);

// Excel (.xlsx) Export
router.get('/:reportType/excel', reportController.exportReportExcel);

module.exports = router;
