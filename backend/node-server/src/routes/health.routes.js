// ============================================================
// Health Check Routes
// ============================================================
const express  = require('express');
const mongoose = require('mongoose');
const os       = require('os');
const fs       = require('fs');
const path     = require('path');
const router   = express.Router();
const { checkAIServiceHealth, chainTest, geminiProbe } = require('../services/aiService');
const Document = require('../models/Document.model');
const User     = require('../models/User.model');
const AuditLog = require('../models/AuditLog.model');
const config   = require('../config/env');

// ── GET /api/health ─────────────────────────────────────
router.get('/', (req, res) => {
  res.json({
    success:     true,
    service:     'LegalMind AI — Express Backend',
    message:     'Express server is running',
    version:     '0.1.0',
    environment: config.NODE_ENV,
    timestamp:   new Date().toISOString(),
    database: {
      status: mongoose.connection.readyState === 1
        ? 'connected' : 'disconnected',
      name: mongoose.connection.name || 'N/A',
    },
  });
});

// ── GET /api/health/ai-service ───────────────────────────
router.get('/ai-service', async (req, res) => {
  try {
    const ai = await checkAIServiceHealth();
    res.json({
      success:    true,
      message:    'Express is running',
      ai_message: ai.message,
      ai_service: ai,
      timestamp:  new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success:  false,
      message:  'Express running — cannot reach AI service',
      error:    error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ── GET /api/health/chain-test ───────────────────────────
router.get('/chain-test', async (req, res) => {
  const steps     = [];
  const startTime = Date.now();

  // Step 1 — Express OK
  steps.push({
    step:      1,
    service:   'Express Backend',
    status:    'ok',
    message:   'Request received by Express',
    timestamp: new Date().toISOString(),
  });

  // Step 2 — FastAPI
  try {
    const ai = await chainTest();
    steps.push({
      step:      2,
      service:   'FastAPI AI Service',
      status:    'ok',
      message:   ai.message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    steps.push({
      step:      2,
      service:   'FastAPI AI Service',
      status:    'error',
      message:   `Cannot reach FastAPI: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
  }

  // Step 3 — MongoDB
  steps.push({
    step:    3,
    service: 'MongoDB',
    status:  mongoose.connection.readyState === 1 ? 'ok' : 'disconnected',
    message: mongoose.connection.readyState === 1
      ? `Connected — database: ${mongoose.connection.name}`
      : 'MongoDB not connected — check Docker',
    timestamp: new Date().toISOString(),
  });

  const allOk = steps.every((s) => s.status === 'ok');

  res.status(allOk ? 200 : 207).json({
    success:       allOk,
    message:       allOk
      ? '✅ Full chain test passed: React → Express → FastAPI → MongoDB'
      : '⚠️  Chain test completed with some issues',
    chain:         'React → Express → FastAPI → MongoDB',
    steps,
    total_time_ms: Date.now() - startTime,
    timestamp:     new Date().toISOString(),
  });
});

// ── GET /api/health/diagnostics ───────────────────────────
router.get('/diagnostics', async (req, res) => {
  try {
    const startTime = Date.now();

    // 1. Host System Metrics
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = process.memoryUsage();
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    // 2. Disk Storage Metrics via native fs.statfsSync
    let diskMetrics = null;
    try {
      const rootDir = path.resolve(__dirname, '../../../../');
      const stat = fs.statfsSync(rootDir);
      const totalBytes = stat.bsize * stat.blocks;
      const freeBytes = stat.bsize * stat.bavail;
      const usedBytes = totalBytes - freeBytes;
      diskMetrics = {
        totalGB: Number((totalBytes / (1024 ** 3)).toFixed(2)),
        freeGB: Number((freeBytes / (1024 ** 3)).toFixed(2)),
        usedGB: Number((usedBytes / (1024 ** 3)).toFixed(2)),
        usedPercent: Number(((usedBytes / totalBytes) * 100).toFixed(1)),
        isHealthy: (freeBytes / totalBytes) > 0.05,
      };
    } catch (e) {
      console.error('Disk statfs error:', e.message);
    }

    // 3. Database Ping & Diagnostics
    let dbPingMs = null;
    let dbStatus = 'disconnected';
    if (mongoose.connection.readyState === 1) {
      try {
        const pingStart = Date.now();
        await mongoose.connection.db.admin().ping();
        dbPingMs = Date.now() - pingStart;
        dbStatus = 'connected';
      } catch {
        dbStatus = 'degraded';
      }
    }

    // 4. Counts from DB
    const [docCount, userCount, auditCount] = await Promise.all([
      Document.countDocuments({ isDeleted: { $ne: true } }).catch(() => 0),
      User.countDocuments({ isDeleted: { $ne: true } }).catch(() => 0),
      AuditLog.countDocuments().catch(() => 0),
    ]);

    // 5. AI Service & Gemini Safe Probe
    const aiStartTime = Date.now();
    let aiProbe = null;
    let geminiInfo = null;
    let aiPingMs = null;

    try {
      aiProbe = await checkAIServiceHealth();
      aiPingMs = Date.now() - aiStartTime;
      geminiInfo = await geminiProbe();
    } catch (e) {
      aiProbe = { success: false, message: e.message };
    }

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startTime,
      host: {
        platform: process.platform,
        architecture: process.arch,
        nodeVersion: process.version,
        processUptimeSec: Math.floor(process.uptime()),
        systemUptimeSec: Math.floor(os.uptime()),
        cpuCores: cpus.length,
        cpuModel: cpus[0]?.model || 'Generic Processor',
        loadAverage: loadAvg,
        memory: {
          systemTotalMB: Math.round(totalMem / (1024 * 1024)),
          systemFreeMB: Math.round(freeMem / (1024 * 1024)),
          processHeapUsedMB: Math.round(memUsage.heapUsed / (1024 * 1024)),
          processRssMB: Math.round(memUsage.rss / (1024 * 1024)),
        },
      },
      storage: {
        disk: diskMetrics,
        paths: {
          storageDir: path.resolve(__dirname, '../../../../storage'),
          faissDir: path.resolve(__dirname, '../../../../faiss_indexes'),
          reportsDir: path.resolve(__dirname, '../../../../reports'),
        },
        records: {
          activeDocuments: docCount,
          activeUsers: userCount,
          auditEvents: auditCount,
        },
      },
      database: {
        engine: 'MongoDB v7.0.x',
        status: dbStatus,
        databaseName: mongoose.connection.name || 'legalmind',
        pingMs: dbPingMs,
      },
      aiService: {
        url: config.AI_SERVICE_URL,
        status: aiProbe?.success ? 'operational' : 'unreachable',
        pingMs: aiPingMs,
        gemini: geminiInfo || { configured: false, status: 'unreachable' },
      },
    });
  } catch (error) {
    console.error('Diagnostics endpoint error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DIAGNOSTICS_ERROR', message: 'Failed to run full diagnostics.' },
    });
  }
});

module.exports = router;