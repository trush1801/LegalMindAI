// ============================================================
// PlatformSettings Model
// Singleton schema for system-wide settings & limits
// ============================================================
const mongoose = require('mongoose');

const PlatformSettingsSchema = new mongoose.Schema(
  {
    platformName: {
      type:     String,
      default:  'LegalMind AI',
      trim:     true,
      required: [true, 'Platform name is required'],
    },

    adminAlertEmail: {
      type:     String,
      default:  'admin@legalmind.ai',
      trim:     true,
      required: [true, 'Admin alert email is required'],
      match:    [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },

    riskThreshold: {
      type:     Number,
      default:  70,
      min:      [50, 'Risk threshold must be at least 50'],
      max:      [90, 'Risk threshold must not exceed 90'],
      required: true,
    },

    topKChunks: {
      type:     Number,
      default:  5,
      min:      [1, 'Top-K chunks must be at least 1'],
      max:      [20, 'Top-K chunks must not exceed 20'],
      required: true,
    },

    maxUploadSizeMB: {
      type:     Number,
      default:  25,
      min:      [5, 'Max upload size must be at least 5MB'],
      max:      [100, 'Max upload size cannot exceed 100MB'],
      required: true,
    },

    ocrConfidenceThreshold: {
      type:     Number,
      default:  80,
      min:      [50, 'OCR confidence threshold must be at least 50%'],
      max:      [99, 'OCR confidence threshold must not exceed 99%'],
      required: true,
    },

    rateLimitPerMinute: {
      type:     Number,
      default:  60,
      min:      [10, 'Rate limit must be at least 10 requests/minute'],
      max:      [300, 'Rate limit must not exceed 300 requests/minute'],
      required: true,
    },

    maintenanceMode: {
      type:    Boolean,
      default: false,
    },

    updatedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Returns the singleton platform settings record, initializing defaults if none exist.
 */
PlatformSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('PlatformSettings', PlatformSettingsSchema);
