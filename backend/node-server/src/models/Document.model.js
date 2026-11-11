// ============================================================
// Document Model
// ============================================================
const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'Document must belong to a user'],
      // removed index:true — defined below
    },

    originalName: {
      type:     String,
      required: [true, 'Original filename is required'],
      trim:     true,
    },

    storedName: {
      type:     String,
      required: [true, 'Stored filename is required'],
      trim:     true,
    },

    filePath: {
      type:     String,
      required: [true, 'File path is required'],
    },

    fileSize: {
      type:     Number,
      required: [true, 'File size is required'],
    },

    mimeType: {
      type: String,
      enum: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ],
      required: [true, 'MIME type is required'],
    },

    fileFormat: {
      type:     String,
      enum:     ['pdf', 'docx', 'txt'],
      required: [true, 'File format is required'],
    },

    documentType: {
      type: String,
      enum: [
        'employment',
        'property',
        'business',
        'confidentiality',
        'financial',
        'legal',
        'digital',
        'corporate',
        'other',
      ],
      default: 'other',
    },

    documentSubtype: {
      type:    String,
      trim:    true,
      default: null,
    },

    classification: {
      primaryCategory: { type: String, default: null },
      subtype:         { type: String, default: null },
      relatedType:     { type: String, default: null },
      confidence:      { type: Number, default: null },
    },

    detectedLanguage: {
      type:    String,
      enum:    ['en', 'hi', 'gu', 'unknown'],
      default: 'unknown',
    },

    processingStatus: {
      type: String,
      enum: [
        'pending',
        'processing',
        'completed',
        'failed',
      ],
      default: 'pending',
    },

    processingStage: {
      type: String,
      enum: [
        'queued',
        'extracting',
        'classifying',
        'analyzing',
        'indexing',
        'completed',
        'failed',
      ],
      default: 'queued',
    },

    processingProgress: {
      type:    Number,
      min:     0,
      max:     100,
      default: 0,
    },

    processingDurationMs: {
      type:    Number,
      default: null,
    },

    retryCount: {
      type:    Number,
      min:     0,
      default: 0,
    },

    lastRetriedAt: {
      type:    Date,
      default: null,
    },

    processingError: {
      type:    String,
      default: null,
    },

    faissIndexPath: {
      type:    String,
      default: null,
    },

    parentDocumentId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Document',
      default: null,
    },

    version: {
      type:    Number,
      default: 1,
      min:     1,
    },

    versionComment: {
      type:    String,
      trim:    true,
      default: null,
    },

    isDeleted: {
      type:    Boolean,
      default: false,
    },

    deletedAt: {
      type:    Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────
DocumentSchema.index({ userId: 1, createdAt: -1 });
DocumentSchema.index({ userId: 1, processingStatus: 1 });
DocumentSchema.index({ userId: 1, isDeleted: 1 });
DocumentSchema.index({ documentType: 1 });
DocumentSchema.index({ processingStatus: 1, processingStage: 1 });
DocumentSchema.index({ parentDocumentId: 1, version: 1 });

// ── Virtuals ─────────────────────────────────────────────
DocumentSchema.virtual('metadata', {
  ref:        'DocumentMetadata',
  localField:   '_id',
  foreignField: 'documentId',
  justOne:      true,
});

DocumentSchema.virtual('analysis', {
  ref:          'AnalysisResult',
  localField:   '_id',
  foreignField: 'documentId',
  justOne:      true,
});

DocumentSchema.virtual('riskFindings', {
  ref:          'RiskFinding',
  localField:   '_id',
  foreignField: 'documentId',
});

DocumentSchema.virtual('chatHistory', {
  ref:          'ChatHistory',
  localField:   '_id',
  foreignField: 'documentId',
});

DocumentSchema.virtual('reports', {
  ref:          'Report',
  localField:   '_id',
  foreignField: 'documentId',
});

DocumentSchema.virtual('versions', {
  ref:          'Document',
  localField:   '_id',
  foreignField: 'parentDocumentId',
});

// ── Query helper: exclude deleted ────────────────────────
DocumentSchema.pre(/^find/, function (next) {
  if (this._conditions && this._conditions.isDeleted === undefined) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

module.exports = mongoose.model('Document', DocumentSchema);