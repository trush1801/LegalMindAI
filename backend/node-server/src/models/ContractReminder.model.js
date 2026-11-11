// ============================================================
// ContractReminder Model — Step 12
// Persistent contract obligation deadlines & reminder triggers
// ============================================================
const mongoose = require('mongoose');

const ContractReminderSchema = new mongoose.Schema(
  {
    documentId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Document',
      required: true,
      index:    true,
    },
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    tenantId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Tenant',
      default:  null,
      index:    true,
    },
    obligationId: {
      type:     String,
      required: true,
      trim:     true,
    },
    title: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 250,
    },
    category: {
      type: String,
      enum: [
        'START_DATE',
        'EXPIRATION_DATE',
        'RENEWAL_DATE',
        'NOTICE_PERIOD',
        'TERMINATION_DEADLINE',
        'PAYMENT_DEADLINE',
        'AFFIRMATIVE_OBLIGATION',
        'OTHER',
      ],
      default: 'OTHER',
    },
    dueDate: {
      type:    Date,
      default: null,
    },
    reminderDate: {
      type:     Date,
      required: true,
      index:    true,
    },
    offsetDays: {
      type:    Number,
      default: 0,
    },
    notificationChannel: {
      type:    String,
      enum:    ['in_app', 'email', 'calendar_ics'],
      default: 'in_app',
    },
    status: {
      type:    String,
      enum:    ['scheduled', 'active', 'dismissed', 'completed'],
      default: 'scheduled',
      index:   true,
    },
    notes: {
      type:      String,
      trim:      true,
      maxlength: 1000,
      default:   '',
    },
    timezone: {
      type:    String,
      default: 'UTC',
    },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

ContractReminderSchema.index({ documentId: 1, obligationId: 1 });
ContractReminderSchema.index({ userId: 1, reminderDate: 1 });

module.exports = mongoose.model('ContractReminder', ContractReminderSchema);
