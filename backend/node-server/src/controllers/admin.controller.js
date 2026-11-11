// ============================================================
// Admin Controller
// Admin-only user management operations
// ============================================================
const User           = require('../models/User.model');
const Document       = require('../models/Document.model');
const RiskFinding    = require('../models/RiskFinding.model');
const AnalysisResult = require('../models/AnalysisResult.model');
const AuditLog         = require('../models/AuditLog.model');
const PlatformSettings = require('../models/PlatformSettings.model');
const { logAuditEvent } = require('../services/audit.service');
const { retryDocumentProcessing } = require('../services/document.service');

// ── GET /api/admin/users ──────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const {
      page      = 1,
      limit     = 20,
      role,
      isActive,
      isDeleted,
      search,
    } = req.query;

    // Build filter
    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    // Deleted filter handling
    if (isDeleted === 'true') {
      filter.isDeleted = true;
    } else if (isDeleted === 'all') {
      // Return all accounts (including archived)
    } else {
      // Default: exclude soft-deleted accounts from regular views
      filter.isDeleted = { $ne: true };
    }

    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        users: users.map((u) => u.toPublicJSON()),
        pagination: {
          total,
          page:       parseInt(page),
          limit:      parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('GetAllUsers error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_USERS_ERROR', message: 'Failed to fetch users.' },
    });
  }
};

// ── GET /api/admin/users/:id ──────────────────────────────
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
    }

    res.status(200).json({
      success: true,
      data:    { user: user.toPublicJSON() },
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid user ID.' },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_USER_ERROR', message: 'Failed to fetch user.' },
    });
  }
};

// ── PUT /api/admin/users/:id/status ───────────────────────
const updateUserStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'isActive must be a boolean.' },
      });
    }

    // Prevent admin from deactivating themselves
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: { code: 'SELF_DEACTIVATE', message: 'You cannot change your own account status.' },
      });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
    }

    // Safeguard: Prevent suspending the last active administrator
    if (targetUser.role === 'admin' && isActive === false) {
      const activeAdminCount = await User.countDocuments({
        role:      'admin',
        isActive:  true,
        isDeleted: { $ne: true },
        _id:       { $ne: targetUser._id },
      });

      if (activeAdminCount < 1) {
        return res.status(400).json({
          success: false,
          error: {
            code:    'LAST_ADMIN_PROTECTION',
            message: 'Administrative Safeguard: Cannot suspend the last active administrator. At least one active administrator is required.',
          },
        });
      }
    }

    // Update status and increment tokenVersion to immediately revoke active sessions
    targetUser.isActive = isActive;
    targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
    await targetUser.save();

    // Log administrative audit event
    await logAuditEvent({
      action:     'USER_STATUS_CHANGED',
      actor:      { _id: req.user._id, email: req.user.email, role: req.user.role },
      targetType: 'user',
      targetId:   targetUser._id,
      details: {
        targetEmail:    targetUser.email,
        previousStatus: !isActive,
        newStatus:      isActive,
      },
      req,
    });

    res.status(200).json({
      success: true,
      message: `User account ${isActive ? 'activated' : 'deactivated'} successfully. Active sessions revoked.`,
      data:    { user: targetUser.toPublicJSON() },
    });
  } catch (error) {
    console.error('UpdateUserStatus error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_STATUS_ERROR', message: 'Failed to update user status.' },
    });
  }
};

// ── PUT /api/admin/users/:id/role ─────────────────────────
const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;

    if (!['normal_user', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ROLE', message: 'Role must be normal_user or admin.' },
      });
    }

    // Prevent admin from changing their own role
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: { code: 'SELF_ROLE_CHANGE', message: 'You cannot change your own role.' },
      });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
    }

    // Safeguard: Prevent demoting the last active administrator
    if (targetUser.role === 'admin' && role === 'normal_user') {
      const activeAdminCount = await User.countDocuments({
        role:      'admin',
        isActive:  true,
        isDeleted: { $ne: true },
        _id:       { $ne: targetUser._id },
      });

      if (activeAdminCount < 1) {
        return res.status(400).json({
          success: false,
          error: {
            code:    'LAST_ADMIN_PROTECTION',
            message: 'Administrative Safeguard: Cannot demote the last active administrator. At least one active administrator is required.',
          },
        });
      }
    }

    const previousRole = targetUser.role;
    targetUser.role = role;
    targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1; // Revoke old role session tokens
    await targetUser.save();

    // Log administrative audit event
    await logAuditEvent({
      action:     'USER_ROLE_CHANGED',
      actor:      { _id: req.user._id, email: req.user.email, role: req.user.role },
      targetType: 'user',
      targetId:   targetUser._id,
      details: {
        targetEmail:  targetUser.email,
        previousRole,
        newRole:      role,
      },
      req,
    });

    res.status(200).json({
      success: true,
      message: `User role updated to ${role}. Session tokens refreshed.`,
      data:    { user: targetUser.toPublicJSON() },
    });
  } catch (error) {
    console.error('UpdateUserRole error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_ROLE_ERROR', message: 'Failed to update user role.' },
    });
  }
};

// ── DELETE /api/admin/users/:id ───────────────────────────
const deleteUser = async (req, res) => {
  try {
    const targetUserId = req.params.id;

    // 1. Self-deletion protection
    if (targetUserId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'SELF_DELETE_FORBIDDEN',
          message: 'Security Violation: Administrators cannot delete their own active account.',
        },
      });
    }

    // 2. Locate target user
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: {
          code:    'USER_NOT_FOUND',
          message: 'User account not found.',
        },
      });
    }

    // 3. Prevent duplicate deletion
    if (targetUser.isDeleted) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'ALREADY_DELETED',
          message: 'This user account is already deleted and archived.',
        },
      });
    }

    // 4. Last active administrator protection
    if (targetUser.role === 'admin') {
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
            message: 'Administrative Safeguard: Cannot delete the last active administrator. The system requires at least one active administrator.',
          },
        });
      }
    }

    // 5. Check associated records (documents, etc.) for audit compliance
    const documentCount = await Document.countDocuments({ userId: targetUser._id });

    // 6. Perform secure soft deletion
    targetUser.isDeleted = true;
    targetUser.deletedAt = new Date();
    targetUser.deletedBy = req.user._id;
    targetUser.isActive  = false; // Immediately terminates login and session tokens
    targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1; // Immediately revoke active sessions
    await targetUser.save();

    // Log administrative audit event
    await logAuditEvent({
      action:     'USER_DELETED',
      actor:      { _id: req.user._id, email: req.user.email, role: req.user.role },
      targetType: 'user',
      targetId:   targetUser._id,
      details: {
        targetEmail:        targetUser.email,
        targetName:         targetUser.name,
        preservedDocuments: documentCount,
        deletionType:       'soft_delete',
      },
      req,
    });

    console.log(
      `[ADMIN AUDIT] User "${targetUser.email}" (${targetUser._id}) soft-deleted by Admin "${req.user.email}" (${req.user._id}). Associated documents preserved: ${documentCount}.`
    );

    res.status(200).json({
      success: true,
      message: `User "${targetUser.name}" has been securely deleted and archived. Associated documents (${documentCount}) remain preserved for audit compliance.`,
      data: {
        user:               targetUser.toPublicJSON(),
        preservedDocuments: documentCount,
        deletionType:       'soft_delete',
      },
    });
  } catch (error) {
    console.error('DeleteUser error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid user ID format.' },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_USER_ERROR', message: 'Failed to delete user account.' },
    });
  }
};

// ── PUT /api/admin/users/:id/restore ──────────────────────
const restoreUser = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User account not found.' },
      });
    }

    if (!targetUser.isDeleted) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_DELETED', message: 'User account is not in an archived or deleted state.' },
      });
    }

    targetUser.isDeleted = false;
    targetUser.deletedAt = null;
    targetUser.deletedBy = null;
    targetUser.isActive  = true; // Restore to active state
    targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
    await targetUser.save();

    // Log administrative audit event
    await logAuditEvent({
      action:     'USER_RESTORED',
      actor:      { _id: req.user._id, email: req.user.email, role: req.user.role },
      targetType: 'user',
      targetId:   targetUser._id,
      details: {
        targetEmail: targetUser.email,
        targetName:  targetUser.name,
      },
      req,
    });

    console.log(
      `[ADMIN AUDIT] User "${targetUser.email}" (${targetUser._id}) restored by Admin "${req.user.email}" (${req.user._id}).`
    );

    res.status(200).json({
      success: true,
      message: `User account "${targetUser.name}" has been restored to active status.`,
      data: { user: targetUser.toPublicJSON() },
    });
  } catch (error) {
    console.error('RestoreUser error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid user ID format.' },
      });
    }
    res.status(500).json({
      success: false,
      error: { code: 'RESTORE_USER_ERROR', message: 'Failed to restore user account.' },
    });
  }
};

// ── GET /api/admin/stats ──────────────────────────────────
const getSystemStats = async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      adminUsers,
      deletedUsers,
      totalDocuments,
      processingDocuments,
      completedDocuments,
      failedDocuments,
    ] = await Promise.all([
      User.countDocuments({ isDeleted: { $ne: true } }),
      User.countDocuments({ isActive: true, isDeleted: { $ne: true } }),
      User.countDocuments({ role: 'admin', isDeleted: { $ne: true } }),
      User.countDocuments({ isDeleted: true }),
      Document.countDocuments(),
      Document.countDocuments({ processingStatus: 'processing' }),
      Document.countDocuments({ processingStatus: 'completed' }),
      Document.countDocuments({ processingStatus: 'failed' }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        users: {
          total:   totalUsers,
          active:  activeUsers,
          admins:  adminUsers,
          normal:  totalUsers - adminUsers,
          deleted: deletedUsers,
        },
        documents: {
          total:      totalDocuments,
          processing: processingDocuments,
          completed:  completedDocuments,
          failed:     failedDocuments,
        },
        system: {
          timestamp:   new Date().toISOString(),
          environment: process.env.NODE_ENV,
        },
      },
    });
  } catch (error) {
    console.error('GetSystemStats error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'STATS_ERROR', message: 'Failed to retrieve system stats.' },
    });
  }
};

// ── GET /api/admin/analytics ──────────────────────────────
const getAdminAnalytics = async (req, res) => {
  try {
    const { period = '30d', startDate: customStart, endDate: customEnd } = req.query;

    const now = new Date();
    let startDate;
    let endDate = now;

    if (period === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '90d') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (period === 'all') {
      startDate = new Date(0);
    } else if (period === 'custom' && customStart && customEnd) {
      const parsedStart = new Date(customStart);
      const parsedEnd = new Date(customEnd);
      if (!isNaN(parsedStart.getTime()) && !isNaN(parsedEnd.getTime())) {
        startDate = parsedStart;
        endDate = parsedEnd;
      } else {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
    } else {
      // Default: 30d
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const dateFilter = { createdAt: { $gte: startDate, $lte: endDate } };

    // Parallel aggregations for platform telemetry
    const [
      totalUsers,
      activeUsers,
      newUsersInPeriod,
      totalDocuments,
      docsInPeriod,
      statusBreakdown,
      typeBreakdown,
      formatBreakdown,
      processingStats,
      userTimelineRaw,
      docTimelineRaw,
      riskStatsRaw,
      clauseBreakdownRaw,
    ] = await Promise.all([
      User.countDocuments({ isDeleted: { $ne: true } }),
      User.countDocuments({ isActive: true, isDeleted: { $ne: true } }),
      User.countDocuments({ ...dateFilter, isDeleted: { $ne: true } }),
      Document.countDocuments({ isDeleted: { $ne: true } }),
      Document.countDocuments({ ...dateFilter, isDeleted: { $ne: true } }),
      Document.aggregate([
        { $match: { ...dateFilter, isDeleted: { $ne: true } } },
        { $group: { _id: '$processingStatus', count: { $sum: 1 } } },
      ]),
      Document.aggregate([
        { $match: { ...dateFilter, isDeleted: { $ne: true } } },
        { $group: { _id: '$documentType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Document.aggregate([
        { $match: { ...dateFilter, isDeleted: { $ne: true } } },
        { $group: { _id: '$fileFormat', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Document.aggregate([
        { $match: { ...dateFilter, processingStatus: 'completed', isDeleted: { $ne: true } } },
        { $project: { durationMs: { $subtract: ['$updatedAt', '$createdAt'] } } },
        {
          $group: {
            _id: null,
            avgDurationMs: { $avg: '$durationMs' },
            minDurationMs: { $min: '$durationMs' },
            maxDurationMs: { $max: '$durationMs' },
            count: { $sum: 1 },
          },
        },
      ]),
      User.aggregate([
        { $match: { ...dateFilter, isDeleted: { $ne: true } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            registrations: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Document.aggregate([
        { $match: { ...dateFilter, isDeleted: { $ne: true } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            uploads: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$processingStatus', 'completed'] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$processingStatus', 'failed'] }, 1, 0] } },
            processing: { $sum: { $cond: [{ $eq: ['$processingStatus', 'processing'] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      RiskFinding.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: '$overallRiskLevel',
            count: { $sum: 1 },
            avgScore: { $avg: '$overallRiskScore' },
          },
        },
      ]),
      AnalysisResult.aggregate([
        { $match: dateFilter },
        { $unwind: '$clauses' },
        { $group: { _id: '$clauses.clauseType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
    ]);

    // Build Status Breakdown Map
    const statusMap = { completed: 0, processing: 0, failed: 0, pending: 0 };
    statusBreakdown.forEach((s) => {
      if (s._id) statusMap[s._id] = s.count;
    });

    const completedAnalyses = statusMap.completed;
    const failedAnalyses = statusMap.failed;
    const processingAnalyses = statusMap.processing;
    const pendingAnalyses = statusMap.pending;

    const evaluatedAnalyses = completedAnalyses + failedAnalyses;
    const successRate = evaluatedAnalyses > 0 ? Number(((completedAnalyses / evaluatedAnalyses) * 100).toFixed(1)) : 0;

    // Processing Times
    const procInfo = processingStats[0] || {};
    const avgProcessingTimeSec = procInfo.avgDurationMs ? Number((procInfo.avgDurationMs / 1000).toFixed(1)) : null;
    const minProcessingTimeSec = procInfo.minDurationMs ? Number((procInfo.minDurationMs / 1000).toFixed(1)) : null;
    const maxProcessingTimeSec = procInfo.maxDurationMs ? Number((procInfo.maxDurationMs / 1000).toFixed(1)) : null;

    // Continuous timeline normalization:
    const timelineDates = [];
    const step = 24 * 60 * 60 * 1000;
    const startTimestamp = Math.max(startDate.getTime(), now.getTime() - 90 * step);
    const endTimestamp = endDate.getTime();

    for (let ts = startTimestamp; ts <= endTimestamp; ts += step) {
      const d = new Date(ts).toISOString().slice(0, 10);
      if (!timelineDates.includes(d)) timelineDates.push(d);
    }
    const todayStr = now.toISOString().slice(0, 10);
    if (!timelineDates.includes(todayStr)) timelineDates.push(todayStr);

    const userRawMap = {};
    userTimelineRaw.forEach((u) => { userRawMap[u._id] = u.registrations; });

    const docRawMap = {};
    docTimelineRaw.forEach((d) => { docRawMap[d._id] = d; });

    let cumulativeUsers = totalUsers - newUsersInPeriod;
    const normalizedUserTimeline = timelineDates.map((dateStr) => {
      const reg = userRawMap[dateStr] || 0;
      cumulativeUsers += reg;
      return {
        date: dateStr,
        registrations: reg,
        cumulative: Math.max(cumulativeUsers, 0),
      };
    });

    const normalizedDocTimeline = timelineDates.map((dateStr) => {
      const d = docRawMap[dateStr] || { uploads: 0, completed: 0, failed: 0, processing: 0 };
      return {
        date: dateStr,
        uploads: d.uploads || 0,
        completed: d.completed || 0,
        failed: d.failed || 0,
        processing: d.processing || 0,
      };
    });

    // Types & Formats with Percentages
    const totalDocsInTypes = typeBreakdown.reduce((acc, t) => acc + t.count, 0);
    const documentTypeDistribution = typeBreakdown.map((t) => ({
      type: t._id || 'other',
      count: t.count,
      percentage: totalDocsInTypes > 0 ? Number(((t.count / totalDocsInTypes) * 100).toFixed(1)) : 0,
    }));

    const totalDocsInFormats = formatBreakdown.reduce((acc, f) => acc + f.count, 0);
    const fileFormatDistribution = formatBreakdown.map((f) => ({
      format: f._id || 'unknown',
      count: f.count,
      percentage: totalDocsInFormats > 0 ? Number(((f.count / totalDocsInFormats) * 100).toFixed(1)) : 0,
    }));

    // Risk Stats
    const riskMap = { low: 0, medium: 0, high: 0, critical: 0 };
    let riskScoreSum = 0;
    let riskCount = 0;
    riskStatsRaw.forEach((r) => {
      if (r._id && riskMap[r._id] !== undefined) {
        riskMap[r._id] = r.count;
      }
      if (r.avgScore) {
        riskScoreSum += r.avgScore * r.count;
        riskCount += r.count;
      }
    });

    const avgRiskScore = riskCount > 0 ? Number((riskScoreSum / riskCount).toFixed(1)) : null;

    res.status(200).json({
      success: true,
      data: {
        periodInfo: {
          period,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          generatedAt: now.toISOString(),
        },
        metrics: {
          totalUsers,
          activeUsers,
          newUsersInPeriod,
          totalDocuments,
          docsInPeriod,
          completedAnalyses,
          failedAnalyses,
          processingAnalyses,
          pendingAnalyses,
          successRate,
          avgProcessingTimeSec,
          minProcessingTimeSec,
          maxProcessingTimeSec,
        },
        timelines: {
          userGrowth: normalizedUserTimeline,
          documentActivity: normalizedDocTimeline,
        },
        breakdowns: {
          status: [
            { status: 'completed', count: completedAnalyses, label: 'Completed' },
            { status: 'processing', count: processingAnalyses, label: 'Processing' },
            { status: 'failed', count: failedAnalyses, label: 'Failed' },
            { status: 'pending', count: pendingAnalyses, label: 'Pending' },
          ],
          documentTypes: documentTypeDistribution,
          fileFormats: fileFormatDistribution,
          clauses: clauseBreakdownRaw.map((c) => ({ type: c._id, count: c.count })),
          risk: {
            levels: riskMap,
            avgRiskScore,
            totalEvaluated: riskCount,
          },
        },
      },
    });
  } catch (error) {
    console.error('GetAdminAnalytics error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'ANALYTICS_ERROR', message: 'Failed to retrieve analytics data.' },
    });
  }
};

// ── GET /api/admin/audit-logs ─────────────────────────────
const getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      action,
      targetType,
      status,
      actorEmail,
      startDate,
      endDate,
      search,
    } = req.query;

    const filter = {};
    if (action) filter.action = action;
    if (targetType) filter.targetType = targetType;
    if (status) filter.status = status;
    if (actorEmail) filter.actorEmail = { $regex: actorEmail, $options: 'i' };

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        const parsedStart = new Date(startDate);
        if (!isNaN(parsedStart.getTime())) filter.createdAt.$gte = parsedStart;
      }
      if (endDate) {
        const parsedEnd = new Date(endDate);
        if (!isNaN(parsedEnd.getTime())) filter.createdAt.$lte = parsedEnd;
      }
    }

    if (search) {
      filter.$or = [
        { action: { $regex: search, $options: 'i' } },
        { actorEmail: { $regex: search, $options: 'i' } },
        { targetId: { $regex: search, $options: 'i' } },
        { 'details.targetEmail': { $regex: search, $options: 'i' } },
        { 'details.documentTitle': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Summary aggregations for admin filter tabs and widgets
    const [actionBreakdown, statusBreakdown] = await Promise.all([
      AuditLog.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      AuditLog.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
        aggregations: {
          actions: actionBreakdown,
          statuses: statusBreakdown,
        },
      },
    });
  } catch (error) {
    console.error('GetAuditLogs error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_AUDIT_LOGS_ERROR', message: 'Failed to fetch audit logs.' },
    });
  }
};

// ── GET /api/admin/settings ───────────────────────────────
const getPlatformSettings = async (req, res) => {
  try {
    const settings = await PlatformSettings.getSettings();
    res.status(200).json({
      success: true,
      data: { settings },
    });
  } catch (error) {
    console.error('GetPlatformSettings error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_SETTINGS_ERROR', message: 'Failed to fetch platform settings.' },
    });
  }
};

// ── PUT /api/admin/settings ───────────────────────────────
const updatePlatformSettings = async (req, res) => {
  try {
    const {
      platformName,
      adminAlertEmail,
      riskThreshold,
      topKChunks,
      maxUploadSizeMB,
      ocrConfidenceThreshold,
      rateLimitPerMinute,
      maintenanceMode,
    } = req.body;

    const settings = await PlatformSettings.getSettings();
    const previousSettings = settings.toObject();

    if (platformName !== undefined) settings.platformName = platformName.trim();
    if (adminAlertEmail !== undefined) settings.adminAlertEmail = adminAlertEmail.trim();
    if (riskThreshold !== undefined) settings.riskThreshold = Number(riskThreshold);
    if (topKChunks !== undefined) settings.topKChunks = Number(topKChunks);
    if (maxUploadSizeMB !== undefined) settings.maxUploadSizeMB = Number(maxUploadSizeMB);
    if (ocrConfidenceThreshold !== undefined) settings.ocrConfidenceThreshold = Number(ocrConfidenceThreshold);
    if (rateLimitPerMinute !== undefined) settings.rateLimitPerMinute = Number(rateLimitPerMinute);
    if (maintenanceMode !== undefined) settings.maintenanceMode = Boolean(maintenanceMode);

    settings.updatedBy = req.user._id;
    await settings.save();

    // Log administrative audit event
    await logAuditEvent({
      action:     'PLATFORM_SETTINGS_CHANGED',
      actor:      { _id: req.user._id, email: req.user.email, role: req.user.role },
      targetType: 'settings',
      targetId:   settings._id,
      details: {
        changedBy: req.user.email,
        updatedFields: req.body,
        previousSettings: {
          platformName: previousSettings.platformName,
          riskThreshold: previousSettings.riskThreshold,
          topKChunks: previousSettings.topKChunks,
        },
      },
      req,
    });

    res.status(200).json({
      success: true,
      message: 'Platform architecture settings updated and persisted successfully.',
      data: { settings },
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: messages.join('. ') },
      });
    }
    console.error('UpdatePlatformSettings error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_SETTINGS_ERROR', message: 'Failed to update platform settings.' },
    });
  }
};

// ── GET /api/admin/pipeline ───────────────────────────────
const getPipelineTelemetry = async (req, res) => {
  try {
    const baseFilter = { isDeleted: { $ne: true } };

    // 1. Stage and Status Breakdown
    const [
      totalDocs,
      pendingDocs,
      processingDocs,
      completedDocs,
      failedDocs,
      extractingDocs,
      classifyingDocs,
      analyzingDocs,
      indexingDocs,
    ] = await Promise.all([
      Document.countDocuments(baseFilter),
      Document.countDocuments({ ...baseFilter, processingStatus: 'pending' }),
      Document.countDocuments({ ...baseFilter, processingStatus: 'processing' }),
      Document.countDocuments({ ...baseFilter, processingStatus: 'completed' }),
      Document.countDocuments({ ...baseFilter, processingStatus: 'failed' }),
      Document.countDocuments({ ...baseFilter, processingStage: 'extracting', processingStatus: { $ne: 'failed' } }),
      Document.countDocuments({ ...baseFilter, processingStage: 'classifying', processingStatus: { $ne: 'failed' } }),
      Document.countDocuments({ ...baseFilter, processingStage: 'analyzing', processingStatus: { $ne: 'failed' } }),
      Document.countDocuments({ ...baseFilter, processingStage: 'indexing', processingStatus: { $ne: 'failed' } }),
    ]);

    // 2. Average Duration from Completed Documents
    const avgDurationResult = await Document.aggregate([
      { $match: { ...baseFilter, processingStatus: 'completed', processingDurationMs: { $gt: 0 } } },
      { $group: { _id: null, avgMs: { $avg: '$processingDurationMs' } } },
    ]);
    const avgDurationMs = avgDurationResult.length > 0 && avgDurationResult[0].avgMs
      ? Math.round(avgDurationResult[0].avgMs)
      : null;

    // 3. Active & Recent Queue Pipeline Items (up to 30)
    const queueDocuments = await Document.find(baseFilter)
      .sort({ updatedAt: -1 })
      .limit(30)
      .populate('userId', 'name email')
      .lean();

    const formattedQueue = queueDocuments.map((doc) => ({
      _id:                  doc._id,
      originalName:         doc.originalName,
      documentType:         doc.documentType,
      documentSubtype:      doc.documentSubtype,
      fileSize:             doc.fileSize,
      fileFormat:           doc.fileFormat,
      processingStatus:     doc.processingStatus,
      processingStage:      doc.processingStage || (doc.processingStatus === 'completed' ? 'completed' : doc.processingStatus === 'failed' ? 'failed' : 'extracting'),
      processingProgress:   doc.processingProgress !== undefined && doc.processingProgress !== null ? doc.processingProgress : (doc.processingStatus === 'completed' ? 100 : 0),
      processingDurationMs: doc.processingDurationMs,
      retryCount:           doc.retryCount || 0,
      lastRetriedAt:        doc.lastRetriedAt,
      processingError:      doc.processingError,
      createdAt:            doc.createdAt,
      updatedAt:            doc.updatedAt,
      user: doc.userId
        ? {
            _id:   doc.userId._id,
            name:  doc.userId.name,
            email: doc.userId.email,
          }
        : null,
    }));

    const activeCount = pendingDocs + processingDocs;
    const terminalCount = completedDocs + failedDocs;
    const successRate = terminalCount > 0 ? Number(((completedDocs / terminalCount) * 100).toFixed(1)) : 100;

    res.status(200).json({
      success: true,
      data: {
        summary: {
          total: totalDocs,
          active: activeCount,
          completed: completedDocs,
          failed: failedDocs,
          successRate,
          avgDurationMs,
          avgDurationSeconds: avgDurationMs ? Number((avgDurationMs / 1000).toFixed(2)) : 0,
        },
        stages: {
          queued: pendingDocs,
          extracting: extractingDocs,
          classifying: classifyingDocs,
          analyzing: analyzingDocs,
          indexing: indexingDocs,
          completed: completedDocs,
          failed: failedDocs,
        },
        queue: formattedQueue,
      },
    });
  } catch (error) {
    console.error('GetPipelineTelemetry error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'PIPELINE_TELEMETRY_ERROR', message: 'Failed to retrieve pipeline telemetry.' },
    });
  }
};

// ── POST /api/admin/documents/:id/retry ───────────────────
const adminRetryPipeline = async (req, res) => {
  try {
    const result = await retryDocumentProcessing(
      req.params.id,
      req.user._id,
      'admin'
    );

    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: result.error || 'Document not found.' },
      });
    }

    if (result.error) {
      return res.status(400).json({
        success: false,
        error: { code: 'RETRY_REJECTED', message: result.error },
      });
    }

    // Log administrative audit event
    await logAuditEvent({
      action:     'DOCUMENT_PIPELINE_RETRY',
      actor:      { _id: req.user._id, email: req.user.email, role: req.user.role },
      targetType: 'document',
      targetId:   result.document._id,
      details: {
        documentName: result.document.originalName,
        retryCount:   result.document.retryCount,
        triggeredBy:  req.user.email,
      },
      req,
    });

    res.status(200).json({
      success: true,
      message: `Analysis pipeline restarted by administrator for "${result.document.originalName}".`,
      data: {
        documentId:         result.document._id,
        processingStatus:   result.document.processingStatus,
        processingStage:    result.document.processingStage,
        processingProgress: result.document.processingProgress,
        retryCount:         result.document.retryCount,
        lastRetriedAt:      result.document.lastRetriedAt,
      },
    });
  } catch (error) {
    console.error('AdminRetryPipeline error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'RETRY_FAILED', message: 'Failed to restart document analysis pipeline.' },
    });
  }
};

module.exports = {
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
};