// ============================================================
// Upload Middleware — Multer Configuration
// Handles file validation before saving to disk
// ============================================================
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');

// ── Allowed file types ────────────────────────────────────
const ALLOWED_MIME_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// ── Ensure storage directory exists ──────────────────────
const getStorageDir = () => {
  const storageDir = config.STORAGE_DIR;
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  return storageDir;
};

// ── Multer Storage Configuration ──────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const storageDir = getStorageDir();

    // Create user-specific subfolder safely
    const safeUserId = String(req.user._id).replace(/[^a-zA-Z0-9_-]/g, '');
    const userDir = path.join(storageDir, safeUserId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    cb(null, userDir);
  },

  filename: (req, file, cb) => {
    // Generate unique filename: uuid + original extension
    const ext          = path.extname(file.originalname).toLowerCase();
    const uniqueName   = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// ── File Filter ───────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const ext      = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype;

  // Check both extension AND mime type
  const validMime = Object.keys(ALLOWED_MIME_TYPES).includes(mimeType);
  const validExt  = ALLOWED_EXTENSIONS.includes(ext);

  if (!validMime || !validExt) {
    const error = new Error(
      `Invalid file type. Only PDF, DOCX, and TXT files are allowed. ` +
      `Received: ${file.originalname} (${mimeType})`
    );
    error.code = 'INVALID_FILE_TYPE';
    return cb(error, false);
  }

  cb(null, true);
};

// ── Multer Instance ───────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize:  MAX_FILE_SIZE,
    files:     1, // one file per request
  },
});

// ── Single File Upload Handler ─────────────────────────────
// Wraps multer to return clean JSON errors instead of crashing
const uploadSingle = (req, res, next) => {
  const uploader = upload.single('document');

  uploader(req, res, (err) => {
    if (!err) return next();

    // File type error (from fileFilter)
    if (err.code === 'INVALID_FILE_TYPE') {
      return res.status(400).json({
        success: false,
        error: {
          code:    'INVALID_FILE_TYPE',
          message: err.message,
        },
      });
    }

    // File too large
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: {
          code:    'FILE_TOO_LARGE',
          message: `File size exceeds the 50MB limit.`,
        },
      });
    }

    // No file provided
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: {
          code:    'UNEXPECTED_FILE',
          message: `Unexpected field name. Use "document" as the form field name.`,
        },
      });
    }

    // Generic multer error
    return res.status(400).json({
      success: false,
      error: {
        code:    'UPLOAD_ERROR',
        message: err.message || 'File upload failed.',
      },
    });
  });
};

// ── Validate File Was Provided ─────────────────────────────
const requireFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: {
        code:    'NO_FILE',
        message: 'No file provided. Please upload a PDF, DOCX, or TXT file.',
      },
    });
  }
  next();
};

// ── Get Format from MIME ───────────────────────────────────
const getFormatFromMime = (mimeType) => {
  return ALLOWED_MIME_TYPES[mimeType] || 'unknown';
};

module.exports = {
  uploadSingle,
  requireFile,
  getFormatFromMime,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
};