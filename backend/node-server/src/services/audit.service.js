// ============================================================
// Audit Service
// Records tamper-resistant security and operational events
// ============================================================
const AuditLog = require('../models/AuditLog.model');

/**
 * Persists an auditable event with sanitized metadata.
 * Never stores passwords, tokens, secrets, or full legal document text.
 */
const logAuditEvent = async ({
  action,
  actor = null,
  targetType,
  targetId = null,
  status = 'success',
  details = {},
  req = null,
}) => {
  try {
    const actorId    = actor?._id || req?.user?._id || null;
    const actorEmail = actor?.email || req?.user?.email || null;
    const actorRole  = actor?.role || req?.user?.role || null;
    const ipAddress  = req?.ip || req?.headers?.['x-forwarded-for'] || null;
    const userAgent  = req?.headers?.['user-agent'] || null;

    // Sanitize details: strictly remove sensitive keys if present
    const sanitizedDetails = { ...details };
    delete sanitizedDetails.password;
    delete sanitizedDetails.currentPassword;
    delete sanitizedDetails.newPassword;
    delete sanitizedDetails.confirmPassword;
    delete sanitizedDetails.token;
    delete sanitizedDetails.authorization;
    delete sanitizedDetails.documentText;
    delete sanitizedDetails.content;
    delete sanitizedDetails.extractedText;

    const entry = await AuditLog.create({
      action,
      actorId,
      actorEmail,
      actorRole,
      targetType,
      targetId: targetId ? String(targetId) : null,
      ipAddress,
      userAgent,
      status,
      details: sanitizedDetails,
    });

    return entry;
  } catch (err) {
    console.error('AuditLog persistence error (non-fatal):', err.message);
    return null;
  }
};

module.exports = { logAuditEvent };
