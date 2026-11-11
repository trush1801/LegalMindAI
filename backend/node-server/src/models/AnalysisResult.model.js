// ============================================================
// AnalysisResult Model
// ============================================================
const mongoose = require('mongoose');

const EntitySchema = new mongoose.Schema(
  {
    text:  { type: String, required: true },
    label: {
      type: String,
      enum: [
        'PARTY','DATE','AMOUNT','OBLIGATION',
        'LOCATION','DURATION','PERCENTAGE','OTHER',
      ],
      required: true,
    },
    confidence: { type: Number, default: null },
    page:       { type: Number, default: null },
    section:    { type: String, default: null },
  },
  { _id: false }
);

const ClauseSchema = new mongoose.Schema(
  {
    clauseType:   { type: String, required: true },
    clauseText:   { type: String, required: true },
    page:         { type: Number, default: null },
    section:      { type: String, default: null },
    confidence:   { type: Number, default: null },
    status:       { type: String, default: null },
    clauseName:   { type: String, default: null },
    significance: { type: String, default: null },
    sectionType:  { type: String, default: 'SUBSTANTIVE' },
  },
  { _id: false }
);

const KeyDateSchema = new mongoose.Schema(
  {
    label:      { type: String, required: true },
    date:       { type: String, required: true },
    parsedDate: { type: Date,   default: null  },
    page:       { type: Number, default: null  },
  },
  { _id: false }
);

const PartySchema = new mongoose.Schema(
  {
    name:           { type: String, required: true },
    role:           { type: String, default: null  },
    page:           { type: Number, default: null  },
    address:        { type: String, default: null  },
    email:          { type: String, default: null  },
    signatoryName:  { type: String, default: null  },
    signatoryTitle: { type: String, default: null  },
  },
  { _id: false }
);

const AnalysisResultSchema = new mongoose.Schema(
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

    entities:  { type: [EntitySchema],  default: [] },
    parties:   { type: [PartySchema],   default: [] },
    keyDates:  { type: [KeyDateSchema], default: [] },
    clauses:   { type: [ClauseSchema],  default: [] },

    structuredFinances:    { type: Array, default: [] },
    structuredDates:       { type: Array, default: [] },
    structuredObligations: { type: Array, default: [] },
    missingProvisions:     { type: Array, default: [] },
    classification:        { type: Object, default: {} },

    summary: {
      fullSummary:    { type: String,   default: null },
      keyPoints:      { type: [String], default: []   },
      obligations:    { type: [String], default: []   },
      importantDates: { type: [String], default: []   },
    },

    modelVersions: {
      ner:    { type: String, default: null },
      clause: { type: String, default: null },
    },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────
// documentId index auto-created by unique:true — do NOT repeat it
AnalysisResultSchema.index({ userId: 1 });

module.exports = mongoose.model('AnalysisResult', AnalysisResultSchema);