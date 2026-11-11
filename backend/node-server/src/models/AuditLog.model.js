// ============================================================
// AuditLog Model
// Central immutable ledger for security & administrative events
// ============================================================
const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    action: {
      type:     String,
      required: [true, 'Action identifier is required'],
      index:    true,
    },

    actorId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
      index:   true,
    },

    actorEmail: {
      type:    String,
      default: null,
      trim:    true,
    },

    actorRole: {
      type:    String,
      default: null,
    },

    targetType: {
      type:     String,
      enum:     ['user', 'document', 'system', 'auth', 'settings', 'pipeline'],
      required: [true, 'Target type is required'],
      index:    true,
    },

    targetId: {
      type:    String,
      default: null,
      index:   true,
    },

    ipAddress: {
      type:    String,
      default: null,
    },

    userAgent: {
      type:    String,
      default: null,
    },

    status: {
      type:    String,
      enum:    ['success', 'failure', 'warning'],
      default: 'success',
      index:   true,
    },

    details: {
      type:    mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
