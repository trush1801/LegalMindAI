// ============================================================
// JWT Utilities
// ============================================================
const jwt    = require('jsonwebtoken');
const config = require('../config/env');

// ── Generate Token ────────────────────────────────────────
const generateToken = (payload) => {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  });
};

// ── Verify Token ──────────────────────────────────────────
const verifyToken = (token) => {
  return jwt.verify(token, config.JWT_SECRET);
};

// ── Generate Access Token for User ───────────────────────
const generateUserToken = (user) => {
  return generateToken({
    id:           user._id,
    email:        user.email,
    role:         user.role,
    tokenVersion: user.tokenVersion || 0,
  });
};

// ── Extract Token from Request Header ────────────────────
const extractTokenFromHeader = (req) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) return null;
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.split(' ')[1];
  return token || null;
};

module.exports = {
  generateToken,
  verifyToken,
  generateUserToken,
  extractTokenFromHeader,
};