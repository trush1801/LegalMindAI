// ============================================================
// ChatHistory Model
// ============================================================
const mongoose = require('mongoose');

const CitationSchema = new mongoose.Schema(
  {
    page:    { type: Number, default: null },
    section: { type: String, default: null },
    excerpt: { type: String, default: null },
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      default: 'user',
    },
    content: {
      type: String,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },

    question: {
      type:     String,
      required: false,
    },
    questionLanguage: {
      type:    String,
      enum:    ['english', 'hindi', 'gujarati', 'unknown'],
      default: 'english',
    },

    answer:         { type: String, default: null },
    answerLanguage: {
      type:    String,
      enum:    ['english', 'hindi', 'gujarati', 'unknown'],
      default: 'english',
    },

    queryType: {
      type:    String,
      default: 'unknown',
    },

    routedPath: {
      type:    String,
      default: null,
    },

    citations:         { type: [CitationSchema], default: []    },
    evidenceFound:     { type: Boolean,          default: true  },
    citationValidated: { type: Boolean,          default: false },
    isSafeResponse:    { type: Boolean,          default: false },
    responseTimeMs:    { type: Number,           default: null  },
    askedAt:           { type: Date,             default: Date.now },
  },
  { _id: true, strict: false }
);

const ChatHistorySchema = new mongoose.Schema(
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

    messages:       { type: [MessageSchema], default: [] },
    totalMessages:  { type: Number,          default: 0  },
    lastActivityAt: { type: Date,            default: Date.now },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────
ChatHistorySchema.index({ documentId: 1, userId: 1 }, { unique: true });
ChatHistorySchema.index({ userId: 1, lastActivityAt: -1 });

// ── Auto-update counters ──────────────────────────────────
ChatHistorySchema.pre('save', function (next) {
  this.totalMessages  = this.messages.length;
  this.lastActivityAt = new Date();
  next();
});

module.exports = mongoose.model('ChatHistory', ChatHistorySchema);