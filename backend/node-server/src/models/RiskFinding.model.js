// ============================================================
// RiskFinding Model
// ============================================================
const mongoose = require('mongoose');

const FlaggedClauseSchema = new mongoose.Schema(
  {
    clauseType:         { type: String, required: true },
    clauseText:         { type: String, required: true },
    riskLevel: {
      type:     String,
      enum:     ['low', 'medium', 'high', 'critical'],
      required: true,
    },
    riskScore:          { type: Number, required: true },
    scoreContribution:  { type: Number, default: 0 },
    riskTitle:          { type: String, default: null },
    reason:             { type: String, required: true },
    contractualConcern: { type: String, default: null },
    commercialImpact:   { type: String, default: null },
    severityRationale:  { type: String, default: null },
    suggestion:         { type: String, default: null },
    evidence:           { type: String, default: null },
    statutoryBasis:     { type: String, default: null },
    page:               { type: Number, default: null },
    section:            { type: String, default: null },
  },
  { _id: false }
);

const RiskCategorySchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: [
        'liability','termination','payment','confidentiality',
        'indemnity','intellectual_property','dispute_resolution',
        'non_compete','data_privacy','compliance','other',
      ],
      required: true,
    },
    score:       { type: Number, required: true },
    weight:      { type: Number, required: true },
    description: { type: String, default: null  },
  },
  { _id: false }
);

const RiskFindingSchema = new mongoose.Schema(
  {
    documentId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Document',
      required: true,
      unique:   true, // ← auto-creates index
    },

    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },

    overallRiskScore: {
      type:     Number,
      required: true,
      min:      0,
      max:      100,
    },

    overallRiskLevel: {
      type:     String,
      enum:     ['low', 'medium', 'high', 'critical'],
      required: true,
    },

    riskCategories: { type: [RiskCategorySchema],  default: [] },
    flaggedClauses: { type: [FlaggedClauseSchema], default: [] },

    riskSummary:   { type: String, default: null },
    totalFlagged:  { type: Number, default: 0    },
    criticalCount: { type: Number, default: 0    },
    highCount:     { type: Number, default: 0    },
    mediumCount:   { type: Number, default: 0    },
    lowCount:      { type: Number, default: 0    },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────
// documentId index auto-created by unique:true — do NOT repeat it
RiskFindingSchema.index({ userId: 1 });
RiskFindingSchema.index({ overallRiskLevel: 1 });
RiskFindingSchema.index({ overallRiskScore: -1 });

module.exports = mongoose.model('RiskFinding', RiskFindingSchema);