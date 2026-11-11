// ============================================================
// Auth Routes
// /api/auth/*
// ============================================================
const express    = require('express');
const router     = express.Router();
const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  logout,
  deleteAccount,
}                = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

// ── Public Routes (no token required) ────────────────────
router.post('/register', register);
router.post('/login',    login);

// ── Protected Routes (token required) ────────────────────
router.use(protect); // all routes below require auth

router.get   ('/me',              getMe);
router.put   ('/update-profile',  updateProfile);
router.put   ('/change-password', changePassword);
router.post  ('/logout',          logout);
router.delete('/delete-account',  deleteAccount);

module.exports = router;