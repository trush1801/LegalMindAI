// ============================================================
// User Model
// ============================================================
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Name is required'],
      trim:      true,
      minlength: [2,   'Name must be at least 2 characters'],
      maxlength: [100, 'Name must be less than 100 characters'],
    },

    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,   // ← this already creates the index
      lowercase: true,
      trim:      true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
        'Please provide a valid email address',
      ],
    },

    password: {
      type:      String,
      required:  [true, 'Password is required'],
      minlength: [8,   'Password must be at least 8 characters'],
      select:    false,
    },

    role: {
      type:    String,
      enum:    ['normal_user', 'admin'],
      default: 'normal_user',
    },

    isActive: {
      type:    Boolean,
      default: true,
    },

    preferredLanguage: {
      type:    String,
      enum:    ['english', 'hindi', 'gujarati'],
      default: 'english',
    },

    lastLoginAt: {
      type:    Date,
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

    deletedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },

    tokenVersion: {
      type:    Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ── Indexes ───────────────────────────────────────────────
// email index is auto-created by unique:true above — do NOT repeat it
UserSchema.index({ role: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ isDeleted: 1 });
UserSchema.index({ isDeleted: 1, role: 1 });

// ── Virtual ───────────────────────────────────────────────
UserSchema.virtual('documents', {
  ref:          'Document',
  localField:   '_id',
  foreignField: 'userId',
});

// ── Pre-save: hash password ───────────────────────────────
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt    = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ── Method: compare password ──────────────────────────────
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Method: safe public profile ───────────────────────────
UserSchema.methods.toPublicJSON = function () {
  return {
    id:                this._id,
    _id:               this._id,
    name:              this.name,
    email:             this.email,
    role:              this.role,
    isActive:          this.isActive,
    isDeleted:         this.isDeleted || false,
    deletedAt:         this.deletedAt || null,
    deletedBy:         this.deletedBy || null,
    preferredLanguage: this.preferredLanguage,
    lastLoginAt:       this.lastLoginAt,
    tokenVersion:      this.tokenVersion || 0,
    createdAt:         this.createdAt,
    updatedAt:         this.updatedAt,
  };
};

module.exports = mongoose.model('User', UserSchema);