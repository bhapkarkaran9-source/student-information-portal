const express = require('express');
const assignmentController = require('../controllers/assignment.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { requireRole } = require('../middlewares/role.middleware');
const { uploadSubmissionFile } = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(requireAuth);

// Analytics / Stats & Reminders
router.get('/stats', requireRole('ADMIN', 'TEACHER'), assignmentController.getAssignmentStats);
router.post('/reminders/check', requireRole('ADMIN', 'TEACHER', 'STUDENT'), assignmentController.checkDueReminders);

// Core CRUD Endpoints
router.get('/', requireRole('ADMIN', 'TEACHER', 'STUDENT'), assignmentController.getAssignments);
router.get('/:id', requireRole('ADMIN', 'TEACHER', 'STUDENT'), assignmentController.getAssignmentById);
router.post('/', requireRole('ADMIN', 'TEACHER'), assignmentController.createAssignment);
router.put('/:id', requireRole('ADMIN', 'TEACHER'), assignmentController.updateAssignment);
router.delete('/:id', requireRole('ADMIN', 'TEACHER'), assignmentController.deleteAssignment);

// Submissions Endpoints
router.get('/:id/submissions', requireRole('ADMIN', 'TEACHER'), assignmentController.getAssignmentSubmissions);
router.post('/:id/submit', requireRole('STUDENT'), uploadSubmissionFile, assignmentController.submitAssignment);
router.get('/:id/my-submission', requireRole('STUDENT'), assignmentController.getMySubmission);
router.get('/:id/my-history', requireRole('STUDENT'), assignmentController.getMySubmissionHistory);
router.get('/:id/submissions/:submissionId/download', requireRole('ADMIN', 'TEACHER', 'STUDENT'), assignmentController.downloadSubmissionDocument);
router.get('/:id/submissions/:submissionId/view', requireRole('ADMIN', 'TEACHER', 'STUDENT'), assignmentController.viewSubmissionDocument);

// Submission History Endpoints
router.get('/:id/submissions/:submissionId/history', requireRole('ADMIN', 'TEACHER', 'STUDENT'), assignmentController.getSubmissionHistory);
router.get('/:id/submissions/:submissionId/history/:historyId/download', requireRole('ADMIN', 'TEACHER', 'STUDENT'), assignmentController.downloadHistoryDocument);
router.get('/:id/submissions/:submissionId/history/:historyId/view', requireRole('ADMIN', 'TEACHER', 'STUDENT'), assignmentController.viewHistoryDocument);

// Evaluation Endpoints
router.get('/:id/submissions/:submissionId/evaluation', requireRole('ADMIN', 'TEACHER'), assignmentController.getSubmissionEvaluation);
router.post('/:id/submissions/:submissionId/evaluate', requireRole('ADMIN', 'TEACHER'), assignmentController.evaluateSubmission);
router.put('/:id/submissions/:submissionId/evaluate', requireRole('ADMIN', 'TEACHER'), assignmentController.evaluateSubmission);
router.get('/:id/my-evaluation', requireRole('STUDENT'), assignmentController.getMyEvaluation);

module.exports = router;
