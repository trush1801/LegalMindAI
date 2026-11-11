// ============================================================
// Role-Based Access Control Middleware
// Use AFTER protect middleware
// ============================================================

// ── requireRole ───────────────────────────────────────────
// Allow only specific roles
// Usage: requireRole('admin')
//        requireRole('admin', 'normal_user')
const requireRole = (...roles) => {
  return (req, res, next) => {
    // protect middleware must run first
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code:    'NOT_AUTHENTICATED',
          message: 'Authentication required.',
        },
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code:    'FORBIDDEN',
          message: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}.`,
        },
      });
    }

    next();
  };
};

// ── adminOnly ─────────────────────────────────────────────
// Shorthand for requireRole('admin')
const adminOnly = requireRole('admin');

// ── normalUserOnly ────────────────────────────────────────
// Shorthand for requireRole('normal_user')
const normalUserOnly = requireRole('normal_user');

// ── anyAuthenticated ─────────────────────────────────────
// Allow both normal_user and admin (any logged-in user)
const anyAuthenticated = requireRole('normal_user', 'admin');

module.exports = {
  requireRole,
  adminOnly,
  normalUserOnly,
  anyAuthenticated,
};