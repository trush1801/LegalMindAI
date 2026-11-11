// ============================================================
// Authentication Middleware
// Verifies JWT token on every protected route
// ============================================================
const User                  = require('../models/User.model');
const { verifyToken,
        extractTokenFromHeader } = require('../utils/jwt.utils');

// ── protect ───────────────────────────────────────────────
// Attaches req.user if token is valid
// Use on any route that requires login
const protect = async (req, res, next) => {
  try {
    // 1. Extract token
    const token = extractTokenFromHeader(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code:    'NO_TOKEN',
          message: 'Access denied. No token provided.',
        },
      });
    }

    // 2. Verify token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      const message =
        err.name === 'TokenExpiredError'
          ? 'Token has expired. Please login again.'
          : 'Invalid token. Please login again.';

      return res.status(401).json({
        success: false,
        error: {
          code:    err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
          message,
        },
      });
    }

    // 3. Check user still exists and is active
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code:    'USER_NOT_FOUND',
          message: 'User belonging to this token no longer exists.',
        },
      });
    }

    if (user.isDeleted) {
      return res.status(401).json({
        success: false,
        error: {
          code:    'ACCOUNT_DELETED',
          message: 'This account has been deleted and archived. Access revoked.',
        },
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          code:    'ACCOUNT_INACTIVE',
          message: 'Your account has been deactivated. Contact support.',
        },
      });
    }

    // 4. Check token version revocation (if token was revoked by password change, logout, or account deletion)
    if (
      decoded.tokenVersion !== undefined &&
      user.tokenVersion !== undefined &&
      decoded.tokenVersion !== user.tokenVersion
    ) {
      return res.status(401).json({
        success: false,
        error: {
          code:    'TOKEN_REVOKED',
          message: 'Session has expired or was revoked. Please login again.',
        },
      });
    }

    // 5. Attach user to request
    req.user = user;
    next();

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code:    'AUTH_ERROR',
        message: 'Authentication error. Please try again.',
      },
    });
  }
};

// ── optionalAuth ──────────────────────────────────────────
// Attaches req.user if token present but does NOT block if missing
// Use on routes that work for both guests and logged-in users
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req);
    if (!token) return next(); // no token → continue as guest

    const decoded = verifyToken(token);
    const user    = await User.findById(decoded.id).select('-password');

    if (user && user.isActive) {
      req.user = user;
    }

    next();
  } catch {
    // Invalid token → continue as guest (don't block)
    next();
  }
};

module.exports = { protect, optionalAuth };