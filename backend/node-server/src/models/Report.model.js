// ============================================================
// Report Model
// ============================================================
const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema(
  {
    documentId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Document',
      required: true,
    },

    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },

    reportType: {
      type:    String,
      enum:    ['full_analysis', 'risk_only', 'summary_only', 'custom'],
      default: 'full_analysis',
    },

    reportName:      { type: String, trim: true, default: null },
    filePath:        { type: String, default: null },
    fileSize:        { type: Number, default: null },

    status: {
      type:    String,
      enum:    ['generating', 'ready', 'completed', 'failed'],
      default: 'generating',
    },

    generationError: { type: String,  default: null  },

    includesSummary:      { type: Boolean, default: true  },
    includesRiskAnalysis: { type: Boolean, default: true  },
    includesClauses:      { type: Boolean, default: true  },
    includesChatHistory:  { type: Boolean, default: false },

    generatedAt:   { type: Date,   default: null },
    downloadCount: { type: Number, default: 0    },
    lastDownloadAt:{ type: Date,   default: null },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────
ReportSchema.index({ documentId: 1 });
ReportSchema.index({ userId: 1, createdAt: -1 });
ReportSchema.index({ status: 1 });

module.exports = mongoose.model('Report', ReportSchema);