// backend/node-server/src/routes/document.routes.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { requireDocumentOwnership } = require('../middleware/ownership.middleware');
const { uploadSingle, requireFile } = require('../middleware/upload.middleware');
const {
  uploadDocument,
  listDocuments,
  getDocument,
  getDocumentStatus,
  retryDocument,
  removeDocument,
  listDocumentTypes,
  chatWithDocument,
  getChatHistory,
  streamDocumentFile,
  uploadDocumentVersion,
  listDocumentVersions,
  compareDocumentsHandler,
  getDocumentObligationsHandler,
  listDocumentRemindersHandler,
  createDocumentReminderHandler,
  updateDocumentReminderHandler,
  deleteDocumentReminderHandler,
  downloadReminderIcsHandler,
  listAllUserRemindersHandler,
  getUserActivityFeedHandler,
  getUpcomingUserObligationsHandler,
} = require('../controllers/document.controller');

// All document routes require authentication
router.use(protect);

// ── Collection routes ─────────────────────────────────────────────────────────

// GET /api/documents/types  (no ownership check — returns static config)
router.get('/types', listDocumentTypes);

// GET /api/documents  (list caller's documents)
router.get('/', listDocuments);

// POST /api/documents/upload
router.post('/upload', uploadSingle, requireFile, uploadDocument);

// User-level portfolio queries (must be declared BEFORE /:id routes)
router.get('/reminders/all', listAllUserRemindersHandler);
router.get('/activity/feed', getUserActivityFeedHandler);
router.get('/obligations/upcoming', getUpcomingUserObligationsHandler);

// ── Comparison Route (Base vs Target) ─────────────────────────────────────────
// GET /api/documents/:baseId/compare/:targetId
router.get('/:baseId/compare/:targetId', compareDocumentsHandler);

// ── Single-document routes (ownership enforced) ───────────────────────────────
// IMPORTANT: /types and /upload must be declared BEFORE /:id routes
// to prevent Express matching "types" or "upload" as an :id value

// GET /api/documents/:id/versions — version history lineage
router.get('/:id/versions', requireDocumentOwnership, listDocumentVersions);

// POST /api/documents/:id/versions — upload new revision/version
router.post('/:id/versions', requireDocumentOwnership, uploadSingle, requireFile, uploadDocumentVersion);

// GET /api/documents/:id/obligations — structured timeline & obligations (Step 12)
router.get('/:id/obligations', requireDocumentOwnership, getDocumentObligationsHandler);

// Reminders (Step 12)
router.get('/:id/reminders', requireDocumentOwnership, listDocumentRemindersHandler);
router.post('/:id/reminders', requireDocumentOwnership, createDocumentReminderHandler);
router.patch('/:id/reminders/:reminderId', requireDocumentOwnership, updateDocumentReminderHandler);
router.delete('/:id/reminders/:reminderId', requireDocumentOwnership, deleteDocumentReminderHandler);
router.get('/:id/reminders/:reminderId/ics', requireDocumentOwnership, downloadReminderIcsHandler);

// GET /api/documents/:id/status  — must come before GET /:id
router.get('/:id/status', requireDocumentOwnership, getDocumentStatus);

// POST /api/documents/:id/retry — re-triggers analysis pipeline
router.post('/:id/retry', requireDocumentOwnership, retryDocument);

// GET /api/documents/:id/file — streams original or extracted document
router.get('/:id/file', requireDocumentOwnership, streamDocumentFile);

// GET /api/documents/:id
router.get('/:id', requireDocumentOwnership, getDocument);

// DELETE /api/documents/:id
router.delete('/:id', requireDocumentOwnership, removeDocument);

// Part 11 — Document Q&A (RAG)
router.post('/:id/chat', requireDocumentOwnership, chatWithDocument);
router.get('/:id/chat', requireDocumentOwnership, getChatHistory);
router.get('/:id/chat-history', requireDocumentOwnership, getChatHistory);

module.exports = router;