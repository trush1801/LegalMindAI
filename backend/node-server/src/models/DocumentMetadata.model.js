// ============================================================
// DocumentMetadata Model
// ============================================================
const mongoose = require('mongoose');

const DocumentMetadataSchema = new mongoose.Schema(
  {
    documentId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Document',
      required: true,
      unique:   true, // ← auto-creates index, do NOT add Schema.index below
    },

    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },

    // ── Extraction counts (Part 06) ─────────────────────────
    pageCount:      { type: Number, default: 0 },
    wordCount:      { type: Number, default: 0 },
    rawWordCount:   { type: Number, default: null },
    characterCount: { type: Number, default: 0 },
    chunkCount:     { type: Number, default: 0 },

    // ── Language (Part 05) ──────────────────────────────────
    // ISO codes: 'en', 'hi', 'gu'
    detectedLanguage:   { type: String, default: 'en' },
    languageConfidence: { type: Number, default: null  },
    wasTranslated:      { type: Boolean, default: false },

    // ── OCR / Extraction (Part 06) ──────────────────────────
    ocrUsed:       { type: Boolean, default: false },
    ocrConfidence: { type: Number,  default: null  },

    // Part 06 methods: 'txt', 'docx', 'pymupdf', 'easyocr', 'pymupdf+easyocr', 'unknown'
    extractionMethod: { type: String, default: null },

    extractedAt:   { type: Date,   default: null },
    extractedText: { type: String, default: null }, // chunk preview/summary

    // ── Document dates ──────────────────────────────────────
    documentDate:  { type: Date, default: null },
    effectiveDate: { type: Date, default: null },
    expiryDate:    { type: Date, default: null },

    // ── Processing timing ───────────────────────────────────
    processingStartedAt:   { type: Date,   default: null },
    processingCompletedAt: { type: Date,   default: null },
    processingDurationMs:  { type: Number, default: null },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────
// documentId index auto-created by unique:true — do NOT repeat it
DocumentMetadataSchema.index({ userId: 1 });

module.exports = mongoose.model('DocumentMetadata', DocumentMetadataSchema);