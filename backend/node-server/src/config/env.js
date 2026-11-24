// ============================================================
// Environment Configuration — Express Backend
// ============================================================
const dotenv = require('dotenv');
const path   = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const STORAGE_DIR  = path.resolve(PROJECT_ROOT, 'storage');
const FAISS_DIR    = path.resolve(PROJECT_ROOT, 'faiss_indexes');
const REPORTS_DIR  = path.resolve(PROJECT_ROOT, 'reports');

dotenv.config({ path: path.resolve(PROJECT_ROOT, '.env') });

const config = {
  NODE_ENV:         process.env.NODE_ENV         || 'development',
  PORT:             parseInt(process.env.PORT)   || 5001,
  MONGODB_URI:      process.env.MONGODB_URI      || 'mongodb://admin:password123@localhost:27018/legalmind?authSource=admin',
  JWT_SECRET:       process.env.JWT_SECRET       || 'dev_secret_change_in_production',
  JWT_EXPIRES_IN:   process.env.JWT_EXPIRES_IN   || '7d',
  AI_SERVICE_URL:   process.env.AI_SERVICE_URL   || 'http://localhost:8000',
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || 'internal_secret_key_change_this',
  PROJECT_ROOT,
  STORAGE_DIR,
  FAISS_DIR,
  REPORTS_DIR,
};

module.exports = config;