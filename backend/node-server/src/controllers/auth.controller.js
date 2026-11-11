// ============================================================
// Auth Controller
// Register | Login | Me | Logout
// ============================================================
const User                 = require('../models/User.model');
const { generateUserToken } = require('../utils/jwt.utils');
const { logAuditEvent }    = require('../services/audit.service');

// ── Helper: send token response ──────────────────────────
const sendTokenResponse = (res, user, statusCode, message) => {
  const token = generateUserToken(user);

  res.status(statusCode).json({
    success: true,
    message,
    token,
    user: user.toPublicJSON(),
  });
};

// ── POST /api/auth/register ───────────────────────────────
const register = async (req, res) => {
  try {
    const { name, email, password, preferredLanguage } = req.body;

    // 1. Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'MISSING_FIELDS',
          message: 'Name, email, and password are required.',
        },
      });
    }

    // 2. Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code:    'EMAIL_EXISTS',
          message: 'An account with this email already exists.',
        },
      });
    }

    // 3. Create user
    // Password is hashed automatically by User model pre-save hook
    const user = await User.create({
      name:              name.trim(),
      email:             email.toLowerCase().trim(),
      password,
      preferredLanguage: preferredLanguage || 'english',
      role:              'normal_user', // always normal_user on self-register
    });

    // 4. Send token
    sendTokenResponse(res, user, 201, 'Account created successfully.');

    // 5. Audit log (non-blocking)
    logAuditEvent({
      action:     'USER_REGISTERED',
      actor:      { _id: user._id, email: user.email, role: user.role },
      targetType: 'auth',
      targetId:   user._id,
      status:     'success',
      details:    { email: user.email, name: user.name },
      req,
    });

  } catch (error) {
    // Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        error: {
          code:    'VALIDATION_ERROR',
          message: messages.join('. '),
        },
      });
    }

    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      error: {
        code:    'REGISTER_ERROR',
        message: 'Registration failed. Please try again.',
      },
    });
  }
};

// ── POST /api/auth/login ──────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'MISSING_FIELDS',
          message: 'Email and password are required.',
        },
      });
    }

    // 2. Find user — explicitly select password (select:false by default)
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select('+password');

    if (!user) {
      logAuditEvent({
        action:     'USER_LOGIN_FAILED',
        actor:      null,
        targetType: 'auth',
        targetId:   email.toLowerCase().trim(),
        status:     'failure',
        details:    { email: email.toLowerCase().trim(), reason: 'USER_NOT_FOUND' },
        req,
      });

      return res.status(401).json({
        success: false,
        error: {
          code:    'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        },
      });
    }

    // 3. Check account is active and not deleted
    if (user.isDeleted) {
      return res.status(401).json({
        success: false,
        error: {
          code:    'ACCOUNT_DELETED',
          message: 'This account has been deleted. Contact an administrator for assistance.',
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

    // 4. Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      logAuditEvent({
        action:     'USER_LOGIN_FAILED',
        actor:      { _id: user._id, email: user.email, role: user.role },
        targetType: 'auth',
        targetId:   user._id,
        status:     'failure',
        details:    { email: user.email, reason: 'INVALID_PASSWORD' },
        req,
      });

      return res.status(401).json({
        success: false,
        error: {
          code:    'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        },
      });
    }

    // 5. Update last login timestamp
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    // 6. Audit log (non-blocking)
    logAuditEvent({
      action:     'USER_LOGIN',
      actor:      { _id: user._id, email: user.email, role: user.role },
      targetType: 'auth',
      targetId:   user._id,
      status:     'success',
      details:    { email: user.email, role: user.role },
      req,
    });

    // 7. Send token
    sendTokenResponse(res, user, 200, 'Login successful.');

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code:    'LOGIN_ERROR',
        message: 'Login failed. Please try again.',
      },
    });
  }
};

// ── GET /api/auth/me ──────────────────────────────────────
const getMe = async (req, res) => {
  try {
    // req.user is already attached by protect middleware
    // Re-fetch to get fresh data
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code:    'USER_NOT_FOUND',
          message: 'User not found.',
        },
      });
    }

    res.status(200).json({
      success: true,
      user:    user.toPublicJSON(),
    });

  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({
      success: false,
      error: {
        code:    'GETME_ERROR',
        message: 'Failed to retrieve user profile.',
      },
    });
  }
};

// ── PUT /api/auth/update-profile ─────────────────────────
const updateProfile = async (req, res) => {
  try {
    const { name, preferredLanguage } = req.body;

    // Only allow safe fields to be updated here
    const allowedUpdates = {};
    if (name)              allowedUpdates.name              = name.trim();
    if (preferredLanguage) allowedUpdates.preferredLanguage = preferredLanguage;

    if (Object.keys(allowedUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'NO_UPDATES',
          message: 'No valid fields provided to update.',
        },
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      allowedUpdates,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user:    user.toPublicJSON(),
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: messages.join('. ') },
      });
    }

    console.error('UpdateProfile error:', error);
    res.status(500).json({
      success: false,
      error: {
        code:    'UPDATE_ERROR',
        message: 'Failed to update profile.',
      },
    });
  }
};

// ── PUT /api/auth/change-password ─────────────────────────
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'MISSING_FIELDS',
          message: 'Current password and new password are required.',
        },
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'PASSWORD_TOO_SHORT',
          message: 'New password must be at least 8 characters.',
        },
      });
    }

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: {
          code:    'WRONG_PASSWORD',
          message: 'Current password is incorrect.',
        },
      });
    }

    // Update password — pre-save hook will hash it
    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Revoke old sessions
    await user.save();

    // Log security audit
    try {
      const { logAuditEvent } = require('../services/audit.service');
      await logAuditEvent({
        action: 'PASSWORD_CHANGED',
        actor: { _id: user._id, email: user.email, role: user.role },
        targetType: 'auth',
        targetId: user._id,
        req,
      });
    } catch {}

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Existing sessions have been revoked. Please login again.',
    });

  } catch (error) {
    console.error('ChangePassword error:', error);
    res.status(500).json({
      success: false,
      error: {
        code:    'CHANGE_PASSWORD_ERROR',
        message: 'Failed to change password.',
      },
    });
  }
};

// ── POST /api/auth/logout ─────────────────────────────────
const logout = async (req, res) => {
  try {
    if (req.user?._id) {
      await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } });
      logAuditEvent({
        action:     'USER_LOGOUT',
        actor:      { _id: req.user._id, email: req.user.email, role: req.user.role },
        targetType: 'auth',
        targetId:   req.user._id,
        status:     'success',
        req,
      });
    }
    res.status(200).json({
      success: true,
      message: 'Logged out successfully. All sessions revoked.',
    });
  } catch {
    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  }
};

// ── DELETE /api/auth/delete-account ───────────────────────
const deleteAccount = async (req, res) => {
  try {
    const { password, confirmationText } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'PASSWORD_REQUIRED',
          message: 'Current password is required to verify identity before account deletion.',
        },
      });
    }

    if (confirmationText !== 'DELETE') {
      return res.status(400).json({
        success: false,
        error: {
          code:    'CONFIRMATION_MISMATCH',
          message: 'Please type "DELETE" exactly to confirm account deletion.',
        },
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User account not found.' },
      });
    }

    // Last active admin protection
    if (user.role === 'admin') {
      const activeAdminCount = await User.countDocuments({
        role:      'admin',
        isActive:  true,
        isDeleted: { $ne: true },
      });
      if (activeAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: {
            code:    'LAST_ADMIN_PROTECTION',
            message: 'Cannot delete the sole active platform administrator. Transfer administrative privileges first.',
          },
        });
      }
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: {
          code:    'WRONG_PASSWORD',
          message: 'Current password verification failed. Account deletion aborted.',
        },
      });
    }

    // Cascading purge of all user assets and data
    const { purgeUserAllData } = require('../services/document.service');
    const purgeResult = await purgeUserAllData(user._id, {
      _id:   user._id,
      email: user.email,
      role:  user.role,
    });

    res.status(200).json({
      success: true,
      message: 'Your account and all associated documents, analyses, vector indexes, and chat sessions have been permanently purged.',
      data: {
        purgedDocuments: purgeResult.purged.documents,
        purgedFiles:     purgeResult.purged.filesUnlinked,
        retentionNote:   'In accordance with privacy requirements, all customer document payloads and FAISS vector indices have been deleted from disk and database. Anonymized security audit logs are retained strictly for operational integrity compliance.',
      },
    });
  } catch (error) {
    console.error('DeleteAccount error:', error);
    res.status(500).json({
      success: false,
      error: {
        code:    'DELETE_ACCOUNT_ERROR',
        message: 'An unexpected error occurred during account deletion.',
      },
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  logout,
  deleteAccount,
};