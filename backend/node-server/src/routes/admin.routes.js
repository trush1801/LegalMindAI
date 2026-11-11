// ============================================================
// Admin Routes — Updated with document management
// /api/admin/*
// ============================================================
const express    = require('express');
const router     = express.Router();

const {
  getAllUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
  deleteUser,
  restoreUser,
  getSystemStats,
  getAdminAnalytics,
  getAuditLogs,
  getPlatformSettings,
  updatePlatformSettings,
  getPipelineTelemetry,
  adminRetryPipeline,
}                = require('../controllers/admin.controller');

const { adminListDocuments } = require('../controllers/document.controller');

const { protect }   = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/role.middleware');

// ── Apply auth + admin to ALL routes ─────────────────────
router.use(protect);
router.use(adminOnly);

// ── User Management ───────────────────────────────────────
router.get('/users',             getAllUsers);
router.get('/users/:id',         getUserById);
router.put('/users/:id/status',  updateUserStatus);
router.put('/users/:id/role',    updateUserRole);
router.delete('/users/:id',      deleteUser);
router.put('/users/:id/restore', restoreUser);

// ── Analytics ─────────────────────────────────────────────
router.get('/analytics',        getAdminAnalytics);

// ── Audit Logs ────────────────────────────────────────────
router.get('/audit-logs',       getAuditLogs);

// ── Document Management ───────────────────────────────────
router.get('/documents',             adminListDocuments);
router.post('/documents/:id/retry', adminRetryPipeline);

// ── Pipeline Telemetry ─────────────────────────────────────
router.get('/pipeline',              getPipelineTelemetry);

// ── Platform Settings ─────────────────────────────────────
router.get('/settings',         getPlatformSettings);
router.put('/settings',         updatePlatformSettings);

// ── System Stats ──────────────────────────────────────────
router.get('/stats',            getSystemStats);

module.exports = router;