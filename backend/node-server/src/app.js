// ============================================================
// Express App — Updated with Document Routes
// ============================================================
const express       = require('express');
const cors          = require('cors');
const helmet        = require('helmet');
const morgan        = require('morgan');
const config        = require('./config/env');
const requestLogger = require('./middleware/requestLogger');
const errorHandler  = require('./middleware/errorHandler');
const notFound      = require('./middleware/notFound');

// ── Route Imports ─────────────────────────────────────────
const healthRoutes   = require('./routes/health.routes');
const authRoutes     = require('./routes/auth.routes');
const adminRoutes    = require('./routes/admin.routes');
const documentRoutes = require('./routes/document.routes');
const reportRoutes   = require('./routes/report.routes');

const app = express();

// ── Security ──────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

// ── CORS ──────────────────────────────────────────────────
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5001',
      'http://127.0.0.1:5001',
    ];
    if (allowed.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-API-Key'],
}));

// ── Body Parsers ──────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Logging ───────────────────────────────────────────────
if (config.NODE_ENV === 'development') app.use(morgan('dev'));
app.use(requestLogger);

// ── Routes ────────────────────────────────────────────────
app.use('/api/health',    healthRoutes);
app.use('/api/auth',      authRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/reports',   reportRoutes);

// ── Root ──────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: '⚖️ LegalMind AI — Backend API',
    version: '0.1.0',
    routes: {
      health:    '/api/health',
      auth:      '/api/auth',
      admin:     '/api/admin',
      documents: '/api/documents',
    },
  });
});

// ── 404 & Error ───────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;