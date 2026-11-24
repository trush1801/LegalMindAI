// ============================================================
// Document Service — Parts 01 to 10
// Business logic for document management & AI pipeline sync
// Communicates with FastAPI AI service for document processing
// ============================================================

const path     = require('path');
const fs       = require('fs');
const mongoose = require('mongoose');
const FormData = require('form-data');

const Document         = require('../models/Document.model');
const DocumentMetadata = require('../models/DocumentMetadata.model');
const AnalysisResult   = require('../models/AnalysisResult.model');
const RiskFinding      = require('../models/RiskFinding.model');
const ChatHistory      = require('../models/ChatHistory.model');
const Report           = require('../models/Report.model');
const ContractReminder = require('../models/ContractReminder.model');
const { aiServiceClient } = require('./aiService');
const { getFormatFromMime } = require('../middleware/upload.middleware');
const { compareClauses, computeWordDiff } = require('../utils/diffHelper');
const { extractContractObligations, generateIcsCalendar } = require('../utils/contractObligationsHelper');
const config = require('../config/env');

const logger = {
  info:  (...a) => console.log('[document.service]', ...a),
  warn:  (...a) => console.warn('[document.service]', ...a),
  error: (...a) => console.error('[document.service]', ...a),
  debug: (...a) => {},
};

/**
 * Path-aware containment check (ERR-SEC-001 / Phase 2 Hardening)
 * Ensures targetPath resolves strictly within baseDir, preventing path traversal
 * and sibling prefix collision (e.g., /storage vs /storage_malicious).
 */
function isPathInsideDirectory(baseDir, targetPath) {
  if (!baseDir || !targetPath) return false;
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  const rel = path.relative(resolvedBase, resolvedTarget);
  return !rel.startsWith('..') && !path.isAbsolute(rel) && rel.length > 0;
}

/**
 * Resolves full document text with robust fallback hierarchy (ERR-DATA-001)
 * Hierarchy:
 *   1. metadata.extractedText (full extracted contract text)
 *   2. Reconstructed text from extracted clauses
 *   3. metadata.plainSummary (plain language summary fallback)
 */
function resolveDocFullText(doc) {
  if (doc?.metadata?.extractedText && typeof doc.metadata.extractedText === 'string' && doc.metadata.extractedText.trim().length > 0) {
    return doc.metadata.extractedText;
  }
  const clauses = doc?.analysis?.clauses || [];
  if (clauses.length > 0) {
    const reconstructed = clauses.map(c => c.text || '').filter(Boolean).join('\n\n');
    if (reconstructed.trim().length > 0) return reconstructed;
  }
  return doc?.metadata?.plainSummary || '';
}

// ── Document Type Configuration ───────────────────────────
const DOCUMENT_TYPES = {
  employment: {
    label:    'Employment',
    subtypes: ['Employment Contract', 'Offer Letter', 'Appointment Letter'],
  },
  property: {
    label:    'Property',
    subtypes: ['Rental Agreement', 'Lease Agreement', 'Sale Agreement'],
  },
  business: {
    label:    'Business',
    subtypes: ['Partnership Agreement', 'Service Agreement', 'Vendor Agreement'],
  },
  confidentiality: {
    label:    'Confidentiality',
    subtypes: ['NDA / Non-Disclosure Agreement'],
  },
  financial: {
    label:    'Financial',
    subtypes: ['Loan Agreement', 'Payment Agreement'],
  },
  legal: {
    label:    'Legal',
    subtypes: ['Power of Attorney', 'Affidavit', 'Legal Notice'],
  },
  digital: {
    label:    'Digital',
    subtypes: ['Privacy Policy', 'Terms & Conditions'],
  },
  corporate: {
    label:    'Corporate',
    subtypes: ['Shareholder Agreement', 'Consultancy Agreement'],
  },
  other: {
    label:    'Other',
    subtypes: [],
  },
};

// ── Validate Document Type & Subtype ──────────────────────
const validateDocumentType = (documentType, documentSubtype) => {
  if (!documentType) return { valid: true, type: 'other', subtype: null };

  if (!DOCUMENT_TYPES[documentType]) {
    return {
      valid:   false,
      message: `Invalid document type: ${documentType}. Valid types: ${Object.keys(DOCUMENT_TYPES).join(', ')}`,
    };
  }

  if (documentSubtype) {
    const validSubtypes = DOCUMENT_TYPES[documentType].subtypes;
    if (validSubtypes.length > 0 && !validSubtypes.includes(documentSubtype)) {
      return {
        valid:   false,
        message: `Invalid subtype "${documentSubtype}" for type "${documentType}". Valid subtypes: ${validSubtypes.join(', ')}`,
      };
    }
  }

  return { valid: true, type: documentType, subtype: documentSubtype || null };
};

// ── Create Base Document Record ───────────────────────────
const createDocumentRecord = async (userId, file, documentType, documentSubtype) => {
  const format = getFormatFromMime(file.mimetype);

  const document = await Document.create({
    userId,
    originalName:       file.originalname,
    storedName:         file.filename,
    filePath:           file.path,
    fileSize:           file.size,
    mimeType:           file.mimetype,
    fileFormat:         format,
    documentType:       documentType || 'other',
    documentSubtype:    documentSubtype || null,
    processingStatus:   'pending',
    processingStage:    'queued',
    processingProgress: 10,
  });

  return document;
};

/**
 * sendToAIService
 * Forwards uploaded document to FastAPI AI service and handles complete pipeline output (Parts 05–10).
 *
 * Persists:
 *   - Part 05: detectedLanguage on Document
 *   - Part 06: DocumentMetadata (pageCount, wordCount, characterCount, extractionMethod)
 *   - Part 08: AnalysisResult (parties, clauses, modelVersions)
 *   - Part 09: RiskFinding (overallRiskScore, overallRiskLevel, flaggedClauses)
 *   - Part 10: AnalysisResult Summary (fullSummary, keyPoints, obligations, importantDates)
 *   - Part 10: faissIndexPath on Document & processingStatus = 'completed'
 */
const sendToAIService = async (documentId, userId, filePath, documentInfo) => {
  const startTime = Date.now();
  let progressTimer = null;

  try {
    logger.info(`Sending document ${documentId} to AI service for processing`);

    // Transition status to 'processing' / stage 'extracting' immediately
    await Document.findByIdAndUpdate(documentId, {
      processingStatus:   'processing',
      processingStage:    'extracting',
      processingProgress: 25,
      processingError:    null,
    });

    // Progressive stage progression while awaiting AI pipeline
    let elapsed = 0;
    progressTimer = setInterval(async () => {
      elapsed += 1500;
      try {
        if (elapsed >= 1500 && elapsed < 3500) {
          await Document.findByIdAndUpdate(documentId, {
            processingStage:    'classifying',
            processingProgress: 55,
          });
        } else if (elapsed >= 3500) {
          await Document.findByIdAndUpdate(documentId, {
            processingStage:    'analyzing',
            processingProgress: 75,
          });
        }
      } catch (err) {
        // Ticker update error can be safely ignored
      }
    }, 1500);

    const form = new FormData();
    form.append('file',          fs.createReadStream(filePath));
    form.append('document_id',   documentId);
    form.append('user_id',       userId);
    form.append('document_type', documentInfo.documentType);
    form.append('original_name', documentInfo.originalName);
    form.append('file_format',   documentInfo.fileFormat);

    const response = await aiServiceClient.post('/documents/process', form, {
      headers: form.getHeaders(),
      timeout: 180000, // 3 min timeout for OCR + NLP + Vector Indexing
    });

    if (progressTimer) clearInterval(progressTimer);

    const result = response.data;

    // Transition to indexing stage as we persist results into MongoDB
    await Document.findByIdAndUpdate(documentId, {
      processingStage:    'indexing',
      processingProgress: 90,
    });

    logger.info(
      `AI service response for ${documentId}: ` +
      `language=${result.detected_language} | ` +
      `chunks=${result.processed_chunks} | ` +
      `risk_score=${result.overall_risk_score} | ` +
      `faiss=${result.faiss_index_path || 'none'}`
    );

    // ── 1. Save DocumentMetadata (Part 06) ─────────────────────────
    if (result.processed_chunks && result.processed_chunks > 0) {
      await DocumentMetadata.findOneAndUpdate(
        { documentId },
        {
          documentId,
          userId,
          pageCount:            result.total_pages      || 1,
          estimatedPageCount:   result.estimated_page_count || result.total_pages || 1,
          pageCountIsEstimated: Boolean(result.page_count_is_estimated),
          wordCount:            result.total_words       || 0,
          rawWordCount:     result.raw_word_count    || result.total_words || 0,
          characterCount:   result.total_chars       || 0,
          detectedLanguage: result.detected_language || 'en',
          extractionMethod: result.extraction_method || 'unknown',
          extractedAt:      new Date(),
          extractedText:    (() => {
            const full = result.full_text || result.extracted_text || result.plain_summary || '';
            // Safe guard against MongoDB 16MB BSON document size limit (truncate at 12MB if necessary)
            if (full && full.length > 12 * 1024 * 1024) {
              return full.slice(0, 12 * 1024 * 1024) + '\n\n[Truncated at 12MB]';
            }
            return full;
          })(),
          plainSummary:     result.plain_summary || '',
        },
        { upsert: true, new: true }
      );

      logger.info(`DocumentMetadata saved for ${documentId}`);
    }

    // ── 2. Save AnalysisResult & Summary (Parts 08 & 10) ────────────
    let partyObjects = [];
    if (result.structured_parties && result.structured_parties.length > 0) {
      partyObjects = result.structured_parties.map(p => ({
        name:           p.name || '',
        role:           p.role || null,
        page:           p.page || null,
        address:        p.address || null,
        email:          p.email || null,
        signatoryName:  p.signatory_name || null,
        signatoryTitle: p.signatory_title || null,
      }));
    } else {
      partyObjects = (result.parties || []).map(p => ({
        name: typeof p === 'string' ? p : p.name || '',
        role: typeof p === 'object' ? p.role : null,
        page: typeof p === 'object' ? p.page : null,
      }));
    }

    const clausesList = (result.clauses && result.clauses.length > 0)
      ? result.clauses
      : (result.clause_preview || []);

    const clauseObjects = clausesList.map(c => ({
      clauseType:   c.clause_type || c.clauseType || 'other',
      clauseText:   c.text || c.clause_text || c.clauseText || '',
      page:         c.page || c.source_page || null,
      section:      c.section || null,
      confidence:   c.confidence || null,
      status:       c.classification_status || c.status || null,
      clauseName:   c.clause_name || c.clauseName || null,
      significance: c.legal_significance || c.significance || null,
      sectionType:  c.section_type || c.sectionType || 'SUBSTANTIVE',
    }));

    const obligationTexts = (result.obligations || [])
      .map(o => (typeof o === 'string' ? o : o.text || o.citation || ''))
      .filter(Boolean);

    const dateTexts = (result.important_dates || [])
      .map(d => (typeof d === 'string' ? d : d.date_text || d.citation || ''))
      .filter(Boolean);

    await AnalysisResult.findOneAndUpdate(
      { documentId },
      {
        documentId,
        userId,
        parties: partyObjects,
        clauses: clauseObjects,
        structuredFinances:    result.structured_finances || [],
        structuredDates:       result.structured_dates || [],
        structuredObligations: result.structured_obligations || [],
        missingProvisions:     result.missing_provisions || [],
        classification:        result.classification || {},
        summary: {
          fullSummary:    result.plain_summary || '',
          keyPoints:      result.key_points    || [],
          obligations:    obligationTexts,
          importantDates: dateTexts,
        },
        overallRiskScore: result.overall_risk_score || 0,
        modelVersions: {
          ner:    '0.8.0',
          clause: '0.8.0',
        },
        analyzedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    logger.info(`AnalysisResult saved for ${documentId} with ${clauseObjects.length} clauses and ${partyObjects.length} parties`);

    // ── 3. Save Risk Findings (Part 09) ────────────────────────────
    if (result.risk_findings && result.risk_findings.length > 0) {
      const flaggedClauses = result.risk_findings.map(f => ({
        clauseType:         f.clause_type,
        clauseText:         f.clause_text,
        riskLevel:          f.risk_level,
        riskScore:          f.risk_score,
        scoreContribution:  f.score_contribution !== undefined ? f.score_contribution : 0,
        riskTitle:          f.risk_title || null,
        reason:             f.explanation || f.reason || '',
        contractualConcern: f.contractual_concern || null,
        commercialImpact:   f.commercial_impact || null,
        severityRationale:  f.severity_rationale || null,
        suggestion:         f.recommendation || f.suggestion || null,
        evidence:           f.evidence || null,
        statutoryBasis:     f.statutory_basis || f.evidence || null,
        page:               f.page_number || null,
        section:            f.section     || null,
      }));

      const breakdown = result.risk_breakdown || {};

      await RiskFinding.findOneAndUpdate(
        { documentId },
        {
          documentId,
          userId,
          overallRiskScore: result.overall_risk_score || 0,
          overallRiskLevel: result.overall_risk_level || 'low',
          flaggedClauses,
          riskSummary:   result.summary || null,
          totalFlagged:  flaggedClauses.length,
          criticalCount: breakdown.critical || 0,
          highCount:     breakdown.high     || 0,
          mediumCount:   breakdown.medium   || 0,
          lowCount:      breakdown.low      || 0,
        },
        { upsert: true, new: true }
      );

      logger.info(
        `RiskFindings persisted for ${documentId}: ` +
        `${flaggedClauses.length} clauses | score=${result.overall_risk_score}`
      );
    }

    const durationMs = Date.now() - startTime;

    // ── 4. Complete Document Record ────────────────────────────────
    const updateDocPayload = {
      processingStatus:     'completed',
      processingStage:      'completed',
      processingProgress:   100,
      processingDurationMs: durationMs,
      detectedLanguage:     result.detected_language || undefined,
      faissIndexPath:       result.faiss_index_path   || undefined,
    };

    if (result.classification && result.classification.primary_category) {
      updateDocPayload.classification = {
        primaryCategory: result.classification.primary_category,
        subtype:         result.classification.subtype,
        relatedType:     result.classification.related_type,
        confidence:      result.classification.confidence,
      };
      if (result.classification.subtype) {
        updateDocPayload.documentSubtype = result.classification.subtype;
      }
      const primLower = result.classification.primary_category.toLowerCase();
      if (primLower.includes('business')) updateDocPayload.documentType = 'business';
      else if (primLower.includes('employment')) updateDocPayload.documentType = 'employment';
      else if (primLower.includes('property')) updateDocPayload.documentType = 'property';
      else if (primLower.includes('confidentiality')) updateDocPayload.documentType = 'confidentiality';
      else if (primLower.includes('financial')) updateDocPayload.documentType = 'financial';
      else if (primLower.includes('legal')) updateDocPayload.documentType = 'legal';
      else if (primLower.includes('digital')) updateDocPayload.documentType = 'digital';
      else if (primLower.includes('corporate')) updateDocPayload.documentType = 'corporate';
    }

    await Document.findByIdAndUpdate(documentId, updateDocPayload);

    logger.info(
      `Full pipeline completed for ${documentId} in ${durationMs}ms. ` +
      `Status='completed', FAISS='${result.faiss_index_path || 'none'}'`
    );

    return result;

  } catch (error) {
    if (progressTimer) clearInterval(progressTimer);
    const durationMs = Date.now() - startTime;
    logger.error(`AI service processing failed for ${documentId}: ${error.message}`);
    await Document.findByIdAndUpdate(documentId, {
      processingStatus:     'failed',
      processingStage:      'failed',
      processingProgress:   0,
      processingDurationMs: durationMs,
      processingError:      error.message,
    });
  }
};

// ── Get User Documents (Paginated) ────────────────────────
const getUserDocuments = async (userId, query = {}) => {
  const {
    page          = 1,
    limit         = 50,
    documentType,
    processingStatus,
    search,
    sortBy        = 'createdAt',
    sortOrder     = 'desc',
  } = query;

  const filter = { userId };

  if (documentType)     filter.documentType     = documentType;
  if (processingStatus) filter.processingStatus = processingStatus;
  if (search) {
    filter.$or = [
      { originalName:    { $regex: search, $options: 'i' } },
      { documentSubtype: { $regex: search, $options: 'i' } },
    ];
  }

  const sort  = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
  const skip  = (parseInt(page) - 1) * parseInt(limit);
  const total = await Document.countDocuments(filter);

  const documents = await Document.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .populate('riskFindings')
    .populate('analysis')
    .select('-filePath -storedName');

  return {
    documents,
    pagination: {
      total,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
};

// ── Get Single Document (with Ownership Check & Virtuals) ─
const getDocumentById = async (documentId, userId, role) => {
  if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
    return { found: false, error: 'Invalid document ID format.' };
  }

  const document = await Document.findById(documentId)
    .populate('metadata')
    .populate('analysis')
    .populate('riskFindings')
    .select('-filePath -storedName');

  if (!document) return { found: false };

  if (role !== 'admin' && document.userId.toString() !== userId.toString()) {
    return { found: true, authorized: false };
  }

  return { found: true, authorized: true, document };
};

// ── Delete Document with Cascading File & Vector Purge ──────
const deleteDocument = async (documentId, userId, role) => {
  if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
    return { found: false, error: 'Invalid document ID format.' };
  }

  const document = await Document.findById(documentId);

  if (!document) return { found: false };

  if (role !== 'admin' && document.userId.toString() !== userId.toString()) {
    return { found: true, authorized: false };
  }

  // 1. Remove physical document file if present
  if (document.filePath && fs.existsSync(document.filePath)) {
    try {
      const resolvedDocPath = path.resolve(document.filePath);
      if (isPathInsideDirectory(config.STORAGE_DIR, resolvedDocPath)) {
        fs.unlinkSync(resolvedDocPath);
        logger.info(`Unlinked source file: ${resolvedDocPath}`);
      } else {
        logger.warn(`Source file ${resolvedDocPath} outside STORAGE_DIR, skipping unlink.`);
      }
    } catch (e) {
      logger.warn(`Could not unlink source file ${document.filePath}:`, e.message);
    }
  }

  // 2. Remove FAISS vector indexes if present (Phase 1C / NEW-001)
  const indexFile = path.join(config.FAISS_DIR, `${documentId}.index`);
  const metaFile  = path.join(config.FAISS_DIR, `${documentId}_meta.json`);
  [indexFile, metaFile].forEach((f) => {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
        logger.info(`Unlinked FAISS index artifact: ${f}`);
      } catch (e) {
        logger.warn(`Could not unlink FAISS artifact ${f}:`, e.message);
      }
    }
  });

  // Invalidate AI service in-memory FAISS LRU cache if active (Phase 4 / ERR-RAG-001)
  try {
    await aiServiceClient.post(`/vector/cache/invalidate/${documentId}`);
  } catch (cacheErr) {
    logger.debug(`FAISS cache invalidation call for ${documentId}: ${cacheErr.message}`);
  }

  // 3. Clean up associated PDF reports in reports/
  if (fs.existsSync(config.REPORTS_DIR)) {
    try {
      const files = fs.readdirSync(config.REPORTS_DIR);
      files.forEach((file) => {
        if (file.includes(String(documentId))) {
          try {
            fs.unlinkSync(path.join(config.REPORTS_DIR, file));
            logger.info(`Unlinked report artifact: ${file}`);
          } catch {}
        }
      });
    } catch (e) {
      logger.warn(`Could not sweep reports directory:`, e.message);
    }
  }

  // 4. Cascade delete associated MongoDB records
  await Promise.allSettled([
    AnalysisResult.deleteMany({ documentId }),
    RiskFinding.deleteMany({ documentId }),
    ChatHistory.deleteMany({ documentId }),
    ContractReminder.deleteMany({ documentId }),
    Report.deleteMany({ documentId }),
    DocumentMetadata.deleteMany({ documentId }),
  ]);

  // 5. Update Document record to soft-deleted
  await Document.findByIdAndUpdate(documentId, {
    isDeleted: true,
    deletedAt: new Date(),
  });

  // 6. Record audit event
  try {
    const { logAuditEvent } = require('./audit.service');
    await logAuditEvent({
      action: 'DOCUMENT_DELETED',
      actor: { _id: userId, role },
      targetType: 'document',
      targetId: documentId,
      details: {
        documentName: document.originalName,
        fileFormat: document.fileFormat,
        cleanedArtifacts: true,
      },
    });
  } catch {}

  return { found: true, authorized: true, deleted: true };
};

// ── Complete Cascading User Data Purge ─────────────────────
const purgeUserAllData = async (userId, actorInfo = null) => {
  logger.info(`Beginning cascading data purge for user: ${userId}`);

  // 1. Locate all documents belonging to this user
  const userDocs = await Document.find({ userId });
  const docIds = userDocs.map((d) => d._id);
  let unlinkedFilesCount = 0;
  // 2. Unlink individual source files, vector indexes, and reports
  for (const doc of userDocs) {
    if (doc.filePath && fs.existsSync(doc.filePath)) {
      try {
        const resolvedDocPath = path.resolve(doc.filePath);
        if (isPathInsideDirectory(config.STORAGE_DIR, resolvedDocPath)) {
          fs.unlinkSync(resolvedDocPath);
          unlinkedFilesCount++;
        }
      } catch {}
    }

    const indexFile = path.join(config.FAISS_DIR, `${doc._id}.index`);
    const metaFile  = path.join(config.FAISS_DIR, `${doc._id}_meta.json`);
    [indexFile, metaFile].forEach((f) => {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
          unlinkedFilesCount++;
        } catch {}
      }
    });

    if (fs.existsSync(config.REPORTS_DIR)) {
      try {
        const files = fs.readdirSync(config.REPORTS_DIR);
        files.forEach((file) => {
          if (file.includes(String(doc._id))) {
            try {
              const reportPath = path.join(config.REPORTS_DIR, file);
              if (isPathInsideDirectory(config.REPORTS_DIR, reportPath)) {
                fs.unlinkSync(reportPath);
                unlinkedFilesCount++;
              }
            } catch {}
          }
        });
      } catch {}
    }

    // Invalidate AI service in-memory FAISS LRU cache for this document (Phase 4 / ERR-RAG-001)
    try {
      await aiServiceClient.post(`/vector/cache/invalidate/${doc._id}`);
    } catch {}
  }

  // 3. Remove user storage directory if present (Phase 1C / NEW-002)
  const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
  const userStorageDir = path.join(config.STORAGE_DIR, safeUserId);
  if (isPathInsideDirectory(config.STORAGE_DIR, userStorageDir) && fs.existsSync(userStorageDir)) {
    try {
      fs.rmSync(userStorageDir, { recursive: true, force: true });
      logger.info(`Removed user storage directory: ${userStorageDir}`);
    } catch (e) {
      logger.warn(`Could not remove user storage directory: ${e.message}`);
    }
  }

  // 4. Cascade delete all child MongoDB collections
  const [
    docsDeleted,
    analysisDeleted,
    risksDeleted,
    chatsDeleted,
    remindersDeleted,
    reportsDeleted,
  ] = await Promise.all([
    Document.deleteMany({ userId }),
    AnalysisResult.deleteMany({ documentId: { $in: docIds } }),
    RiskFinding.deleteMany({ documentId: { $in: docIds } }),
    ChatHistory.deleteMany({ userId }),
    ContractReminder.deleteMany({ userId }),
    Report.deleteMany({ userId }),
    DocumentMetadata.deleteMany({ documentId: { $in: docIds } }),
  ]);

  // 5. Invalidate tokens and mark user account deleted
  const User = require('../models/User.model');
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $inc: { tokenVersion: 1 },
      isDeleted: true,
      isActive: false,
      deletedAt: new Date(),
    },
    { new: true }
  );

  // 6. Record security audit log
  try {
    const { logAuditEvent } = require('./audit.service');
    await logAuditEvent({
      action: 'USER_ACCOUNT_DELETED',
      actor: actorInfo || { _id: userId, role: 'normal_user' },
      targetType: 'user',
      targetId: userId,
      details: {
        documentsPurged: userDocs.length,
        filesUnlinked: unlinkedFilesCount,
        recordsDeleted: {
          documents: docsDeleted.deletedCount,
          analyses: analysisDeleted.deletedCount,
          risks: risksDeleted.deletedCount,
          chats: chatsDeleted.deletedCount,
          reminders: remindersDeleted.deletedCount,
          reports: reportsDeleted.deletedCount,
        },
      },
    });
  } catch (e) {
    logger.warn('Audit log write error:', e.message);
  }

  return {
    success: true,
    user: typeof updatedUser?.toPublicJSON === 'function' ? updatedUser.toPublicJSON() : (updatedUser || null),
    purged: {
      documents: userDocs.length,
      filesUnlinked: unlinkedFilesCount,
      databaseRecords: (docsDeleted.deletedCount || 0) + (analysisDeleted.deletedCount || 0) + (risksDeleted.deletedCount || 0),
    },
  };
};

// ── Get Supported Document Types ──────────────────────────
const getDocumentTypes = () => {
  return Object.entries(DOCUMENT_TYPES).map(([key, value]) => ({
    type:     key,
    label:    value.label,
    subtypes: value.subtypes,
  }));
};

// ── Admin: Get All Documents ──────────────────────────────
const getAllDocuments = async (query = {}) => {
  const {
    page             = 1,
    limit            = 20,
    documentType,
    processingStatus,
    userId,
    search,
  } = query;

  const filter = {};
  if (documentType)     filter.documentType     = documentType;
  if (processingStatus) filter.processingStatus = processingStatus;
  if (userId)           filter.userId           = userId;
  if (search) {
    filter.$or = [
      { originalName:    { $regex: search, $options: 'i' } },
      { documentSubtype: { $regex: search, $options: 'i' } },
    ];
  }

  const skip  = (parseInt(page) - 1) * parseInt(limit);
  const total = await Document.countDocuments(filter);

  const documents = await Document.find(filter)
    .populate('userId', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .select('-filePath -storedName');

  return {
    documents,
    pagination: {
      total,
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
};

/**
 * Handles Q&A chat with a document via Part 12 Agentic RAG Pipeline
 */
const askDocumentQuestion = async (documentId, userId, query) => {
  const document = await Document.findById(documentId);
  if (!document) {
    throw { status: 404, code: 'NOT_FOUND', message: 'Document not found.' };
  }

  if (document.processingStatus !== 'completed') {
    throw {
      status: 400,
      code: 'DOCUMENT_NOT_READY',
      message: `Document processing is ${document.processingStatus}. Please wait until completed.`,
    };
  }

  // Call FastAPI /query/ask
  const aiResponse = await aiServiceClient.post('/query/ask', {
    document_id: documentId,
    query: query,
  });

  const ragData = aiResponse.data.data;

  // Persist interaction to ChatHistory
  try {
    let chat = await ChatHistory.findOne({ documentId, userId });
    if (!chat) {
      chat = new ChatHistory({
        documentId,
        userId,
        sessionId: `session_${Date.now()}`,
        messages: [],
        totalMessages: 0,
      });
    }

    chat.messages.push({
      role: 'user',
      content: query,
      timestamp: new Date(),
    });

    chat.messages.push({
      role: 'assistant',
      content: ragData.final_answer,
      queryType: ragData.intent,
      routedPath: ragData.route_taken,
      citations: ragData.citations || [],
      evidenceFound: ragData.evidence_sufficient,
      timestamp: new Date(),
    });

    chat.totalMessages = chat.messages.length;
    await chat.save();
  } catch (chatErr) {
    logger.warn(`ChatHistory save warning for ${documentId}: ${chatErr.message}`);
  }

  const responseData = {
    query: query,
    queryType: ragData.intent,
    routedPath: ragData.route_taken,
    answer: ragData.final_answer,
    evidenceFound: ragData.evidence_sufficient,
    citations: ragData.citations || [],
    blockedByGate: ragData.blocked_by_evidence_gate,
  };

  return {
    found: true,
    authorized: true,
    ready: true,
    result: responseData,
    ...responseData,
  };
};

/**
 * Creates a revision document linked to parentDocumentId
 * Preserves the original file and creates a new immutable document version
 */
const createDocumentVersionRecord = async (parentDocumentId, userId, file, versionComment, documentSubtype) => {
  const parentDoc = await Document.findById(parentDocumentId);
  if (!parentDoc) {
    throw { status: 404, code: 'NOT_FOUND', message: 'Target document not found.' };
  }

  // Determine root document ID in version family
  const rootId = parentDoc.parentDocumentId || parentDoc._id;

  // Find latest version in this family
  const familyDocs = await Document.find({
    $or: [{ _id: rootId }, { parentDocumentId: rootId }],
  }).sort({ version: -1 });

  const latestVersion = familyDocs.length > 0 && familyDocs[0].version ? familyDocs[0].version : 1;
  const nextVersion = latestVersion + 1;
  const format = getFormatFromMime(file.mimetype);

  const newVersionDoc = await Document.create({
    userId,
    parentDocumentId: rootId,
    version: nextVersion,
    versionComment: versionComment && versionComment.trim() ? versionComment.trim() : `Revision ${nextVersion}`,
    originalName: file.originalname,
    storedName: file.filename,
    filePath: file.path,
    fileSize: file.size,
    mimeType: file.mimetype,
    fileFormat: format,
    documentType: parentDoc.documentType,
    documentSubtype:    documentSubtype || parentDoc.documentSubtype,
    processingStatus:   'pending',
    processingStage:    'queued',
    processingProgress: 10,
  });

  return { newVersionDoc, rootDoc: parentDoc };
};

/**
 * Retrieves all versions for a document family
 */
const getDocumentVersions = async (documentId, userId, role) => {
  if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
    return { found: false, error: 'Invalid document ID format.' };
  }
  const targetDoc = await Document.findById(documentId);
  if (!targetDoc) {
    return { found: false };
  }

  if (role !== 'admin' && targetDoc.userId.toString() !== userId.toString()) {
    return { found: true, authorized: false };
  }

  const rootId = targetDoc.parentDocumentId || targetDoc._id;

  const versionDocs = await Document.find({
    $or: [{ _id: rootId }, { parentDocumentId: rootId }],
  })
    .populate('metadata')
    .populate('analysis')
    .populate('riskFindings')
    .sort({ version: 1, createdAt: 1 })
    .select('-filePath -storedName');

  const versions = versionDocs.map((doc) => {
    const riskRecord = Array.isArray(doc.riskFindings) ? doc.riskFindings[0] : doc.riskFindings;
    return {
      _id: doc._id,
      id: doc._id,
      version: doc.version || 1,
      versionComment: doc.versionComment || (doc.version === 1 ? 'Initial Upload' : `Revision ${doc.version}`),
      originalName: doc.originalName,
      fileSize: doc.fileSize,
      fileFormat: doc.fileFormat,
      documentType: doc.documentType,
      documentSubtype: doc.documentSubtype,
      processingStatus: doc.processingStatus,
      createdAt: doc.createdAt,
      isCurrent: doc._id.toString() === documentId.toString(),
      isRoot: !doc.parentDocumentId,
      metadata: {
        pageCount: doc.metadata?.pageCount || 1,
        wordCount: doc.metadata?.wordCount || 0,
        detectedLanguage: doc.metadata?.detectedLanguage || doc.detectedLanguage || 'en',
      },
      analysisSummary: {
        clausesCount: doc.analysis?.clauses?.length || 0,
        partiesCount: doc.analysis?.parties?.length || 0,
        overallRiskScore: riskRecord?.overallRiskScore ?? 0,
        overallRiskLevel: riskRecord?.overallRiskLevel || 'low',
        flaggedCount: riskRecord?.flaggedClauses?.length || 0,
      },
    };
  });

  return {
    found: true,
    authorized: true,
    rootDocumentId: rootId,
    currentDocumentId: documentId,
    versions,
  };
};

/**
 * Authentic comparison of two document versions or documents
 */
const compareDocuments = async (baseId, targetId, userId, role) => {
  if (!baseId || !targetId || !mongoose.Types.ObjectId.isValid(baseId) || !mongoose.Types.ObjectId.isValid(targetId)) {
    return { found: false, error: 'Invalid document ID format.' };
  }
  const [docA, docB] = await Promise.all([
    Document.findById(baseId).populate('metadata').populate('analysis').populate('riskFindings'),
    Document.findById(targetId).populate('metadata').populate('analysis').populate('riskFindings'),
  ]);

  if (!docA || !docB) {
    return { found: false, missingId: !docA ? baseId : targetId };
  }

  // Tenant isolation & access control check
  const isAuthorizedA = role === 'admin' || docA.userId.toString() === userId.toString();
  const isAuthorizedB = role === 'admin' || docB.userId.toString() === userId.toString();

  if (!isAuthorizedA || !isAuthorizedB) {
    return { found: true, authorized: false };
  }

  const clausesA = docA.analysis?.clauses || [];
  const clausesB = docB.analysis?.clauses || [];

  const riskRecordA = Array.isArray(docA.riskFindings) ? docA.riskFindings[0] : docA.riskFindings;
  const riskRecordB = Array.isArray(docB.riskFindings) ? docB.riskFindings[0] : docB.riskFindings;

  const flaggedClausesA = riskRecordA?.flaggedClauses || [];
  const flaggedClausesB = riskRecordB?.flaggedClauses || [];

  // Clause-by-clause comparison with authentic risk analysis correlation
  const clauseComparisons = compareClauses(clausesA, clausesB, flaggedClausesA, flaggedClausesB);

  // Full-text difference (ERR-DATA-001: with fallback resolution)
  const textA = resolveDocFullText(docA);
  const textB = resolveDocFullText(docB);
  const textDiff = computeWordDiff(textA, textB);

  // Aggregated change metrics
  const modifiedCount = clauseComparisons.filter(c => c.status === 'modified').length;
  const addedCount = clauseComparisons.filter(c => c.status === 'added').length;
  const removedCount = clauseComparisons.filter(c => c.status === 'removed').length;
  const unchangedCount = clauseComparisons.filter(c => c.status === 'unchanged').length;

  const scoreA = riskRecordA?.overallRiskScore ?? 0;
  const scoreB = riskRecordB?.overallRiskScore ?? 0;
  const riskScoreDelta = scoreB - scoreA;

  // Filter significant changes (strictly supported by risk model or affirmative clause alterations)
  const significantChanges = clauseComparisons
    .filter(c => c.hasRiskDelta || (c.status !== 'unchanged' && c.significanceExplanation))
    .map(c => ({
      clauseType: c.clauseType,
      status: c.status,
      explanation: c.significanceExplanation,
      hasRiskDelta: c.hasRiskDelta,
      baseRisk: c.baseRisk,
      targetRisk: c.targetRisk,
    }));

  return {
    found: true,
    authorized: true,
    baseDocument: {
      _id: docA._id,
      version: docA.version || 1,
      versionComment: docA.versionComment,
      originalName: docA.originalName,
      createdAt: docA.createdAt,
      overallRiskScore: scoreA,
      overallRiskLevel: riskRecordA?.overallRiskLevel || 'low',
      clausesCount: clausesA.length,
      wordCount: docA.metadata?.wordCount || 0,
    },
    targetDocument: {
      _id: docB._id,
      version: docB.version || 1,
      versionComment: docB.versionComment,
      originalName: docB.originalName,
      createdAt: docB.createdAt,
      overallRiskScore: scoreB,
      overallRiskLevel: riskRecordB?.overallRiskLevel || 'low',
      clausesCount: clausesB.length,
      wordCount: docB.metadata?.wordCount || 0,
    },
    metrics: {
      modifiedClauses: modifiedCount,
      addedClauses: addedCount,
      removedClauses: removedCount,
      unchangedClauses: unchangedCount,
      totalBaseClauses: clausesA.length,
      totalTargetClauses: clausesB.length,
      addedWords: textDiff.addedCount,
      removedWords: textDiff.removedCount,
      riskScoreDelta,
      riskTrajectory: riskScoreDelta < 0 ? 'improved' : riskScoreDelta > 0 ? 'worsened' : 'neutral',
    },
    significantChanges,
    clauseComparisons,
    fullTextDiff: textDiff,
  };
};

// ── Extract Contract Obligations & Timeline (Step 12) ─────
const getDocumentObligations = async (documentId, userId, role) => {
  const document = await Document.findById(documentId);
  if (!document) return { found: false };

  if (role !== 'admin' && document.userId.toString() !== userId.toString()) {
    return { found: true, authorized: false };
  }

  const analysis = await AnalysisResult.findOne({ documentId });
  const metadata = await DocumentMetadata.findOne({ documentId });

  // Extract structured timeline items & obligations
  const extracted = extractContractObligations(document, analysis, metadata);

  // Retrieve any configured reminders for this document
  const reminders = await ContractReminder.find({ documentId }).sort({ reminderDate: 1 }).lean();

  // Attach reminder state to items
  const reminderMap = {};
  for (const r of reminders) {
    reminderMap[r.obligationId] = r;
  }

  const timelineWithReminders = (extracted.timeline || extracted.obligations || []).map((item) => ({
    ...item,
    rawDateText: item.date || item.rawDateText || 'Not Specified',
    formattedDueDate: item.date || item.formattedDueDate || 'Not Specified',
    parsedDueDate: item.parsedDate || item.parsedDueDate || null,
    boundParty: item.party || item.boundParty || 'All Parties',
    party: item.party || item.boundParty || 'All Parties',
    actionRequired: item.actionRequired || item.action || item.title,
    action: item.action || item.actionRequired || item.title,
    sourcePassage: item.sourcePassage || item.supportingEvidence || '',
    supportingEvidence: item.sourcePassage || item.supportingEvidence || '',
    reminder: reminderMap[item.id] || null,
  }));

  return {
    found: true,
    authorized: true,
    data: {
      documentId: document._id,
      documentName: document.originalName,
      summary: {
        ...extracted.summary,
        activeRemindersCount: reminders.filter((r) => r.status === 'scheduled' || r.status === 'active').length,
      },
      timeline: timelineWithReminders,
      obligations: timelineWithReminders,
      reminders,
    },
  };
};

// ── Reminders CRUD ──────────────────────────────────────────
const getDocumentReminders = async (documentId, userId, role) => {
  const document = await Document.findById(documentId);
  if (!document) return { found: false };

  if (role !== 'admin' && document.userId.toString() !== userId.toString()) {
    return { found: true, authorized: false };
  }

  const reminders = await ContractReminder.find({ documentId }).sort({ reminderDate: 1 });
  return { found: true, authorized: true, reminders };
};

const createDocumentReminder = async (documentId, userId, tenantId, data) => {
  const document = await Document.findById(documentId);
  if (!document) return { found: false };

  if (!data.obligationId || !data.title || !data.reminderDate) {
    return { found: true, authorized: true, error: 'obligationId, title, and reminderDate are required.' };
  }

  const reminderDateObj = new Date(data.reminderDate);
  if (isNaN(reminderDateObj.getTime())) {
    return { found: true, authorized: true, error: 'Invalid reminderDate provided.' };
  }

  const dueDateObj = data.dueDate ? new Date(data.dueDate) : null;

  const reminder = await ContractReminder.create({
    documentId,
    userId,
    tenantId: tenantId || document.tenantId || null,
    obligationId: data.obligationId,
    title: data.title.trim(),
    category: data.category || 'OTHER',
    dueDate: dueDateObj && !isNaN(dueDateObj.getTime()) ? dueDateObj : null,
    reminderDate: reminderDateObj,
    offsetDays: data.offsetDays !== undefined ? Number(data.offsetDays) : 0,
    notificationChannel: data.notificationChannel || 'in_app',
    status: 'scheduled',
    notes: data.notes ? data.notes.trim() : '',
    timezone: data.timezone || 'UTC',
  });

  return { found: true, authorized: true, reminder };
};

const updateDocumentReminder = async (documentId, reminderId, userId, role, updates) => {
  const reminder = await ContractReminder.findOne({ _id: reminderId, documentId });
  if (!reminder) return { found: false };

  if (role !== 'admin' && reminder.userId.toString() !== userId.toString()) {
    return { found: true, authorized: false };
  }

  const allowedFields = ['status', 'notes', 'reminderDate', 'dueDate', 'notificationChannel', 'offsetDays'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      if ((field === 'reminderDate' || field === 'dueDate') && updates[field]) {
        reminder[field] = new Date(updates[field]);
      } else {
        reminder[field] = updates[field];
      }
    }
  }

  await reminder.save();
  return { found: true, authorized: true, reminder };
};

const deleteDocumentReminder = async (documentId, reminderId, userId, role) => {
  const reminder = await ContractReminder.findOne({ _id: reminderId, documentId });
  if (!reminder) return { found: false };

  if (role !== 'admin' && reminder.userId.toString() !== userId.toString()) {
    return { found: true, authorized: false };
  }

  await ContractReminder.findByIdAndDelete(reminderId);
  return { found: true, authorized: true, deleted: true };
};

const getReminderCalendarIcs = async (documentId, reminderId, userId, role) => {
  const document = await Document.findById(documentId);
  if (!document) return { found: false };

  if (role !== 'admin' && document.userId.toString() !== userId.toString()) {
    return { found: true, authorized: false };
  }

  const reminder = await ContractReminder.findOne({ _id: reminderId, documentId });
  if (!reminder) return { found: false };

  const ics = generateIcsCalendar(reminder, document);
  return { found: true, authorized: true, ics, filename: `${document.originalName}-reminder.ics` };
};

// ── All User Reminders (Across Documents) ───────────────────
const getAllUserReminders = async (userId) => {
  return ContractReminder.find({ userId, isDeleted: { $ne: true } })
    .sort({ dueDate: 1, reminderDate: 1 })
    .populate('documentId', 'title originalName documentType fileFormat processingStatus');
};

// ── User Activity Feed (Real chronological workspace events) ───
const getUserActivityFeed = async (userId) => {
  const [recentUploads, recentCompleted, recentReminders, recentReports] = await Promise.all([
    Document.find({ userId }).sort({ createdAt: -1 }).limit(8).select('title originalName documentType createdAt'),
    Document.find({ userId, processingStatus: 'completed' }).sort({ updatedAt: -1 }).limit(8).select('title originalName documentType updatedAt'),
    ContractReminder.find({ userId, isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(8).populate('documentId', 'title originalName'),
    Report.find({ userId }).sort({ createdAt: -1 }).limit(8).populate('documentId', 'title originalName'),
  ]);

  const events = [];

  for (const doc of recentUploads) {
    events.push({
      id: `upload_${doc._id}`,
      type: 'document_uploaded',
      title: 'Contract Uploaded',
      description: doc.originalName || doc.title,
      timestamp: doc.createdAt,
      documentId: doc._id,
      category: doc.documentType || 'general',
      icon: 'file_up',
    });
  }

  for (const doc of recentCompleted) {
    events.push({
      id: `analysis_${doc._id}`,
      type: 'analysis_completed',
      title: 'Analysis Completed',
      description: `Intelligence extraction & risk scoring finished for ${doc.originalName || doc.title}`,
      timestamp: doc.updatedAt,
      documentId: doc._id,
      category: doc.documentType || 'general',
      icon: 'file_check',
    });
  }

  for (const r of recentReminders) {
    events.push({
      id: `reminder_${r._id}`,
      type: 'reminder_scheduled',
      title: `Reminder Scheduled: ${r.title}`,
      description: `Alert set for ${new Date(r.reminderDate).toLocaleDateString()} (${r.offsetDays} days prior to deadline)`,
      timestamp: r.createdAt,
      documentId: r.documentId?._id || r.documentId,
      documentTitle: r.documentId?.originalName || 'Contract Document',
      category: r.category || 'obligation',
      icon: 'clock',
    });
  }

  for (const rep of recentReports) {
    events.push({
      id: `report_${rep._id}`,
      type: 'report_generated',
      title: 'Audit Report Generated',
      description: `Formal compliance report ready for ${rep.documentId?.originalName || 'Document'}`,
      timestamp: rep.createdAt,
      documentId: rep.documentId?._id || rep.documentId,
      reportId: rep._id,
      icon: 'scroll',
    });
  }

  // Deduplicate by id and sort descending
  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return events.slice(0, 15);
};

// ── User Upcoming Obligations Across Contracts ───────────────
const getUpcomingUserObligations = async (userId) => {
  const docs = await Document.find({ userId, processingStatus: 'completed' })
    .populate('analysis')
    .populate('metadata')
    .populate('riskFindings')
    .limit(25);

  let processingCount = 0;
  try {
    processingCount = await Document.countDocuments({
      userId,
      processingStatus: { $in: ['pending', 'processing'] },
      isDeleted: { $ne: true },
    });
  } catch {}

  const activeReminders = await ContractReminder.find({ userId, isDeleted: { $ne: true } });
  const reminderMap = new Map();
  for (const rem of activeReminders) {
    if (rem.obligationId) {
      reminderMap.set(`${rem.documentId}_${rem.obligationId}`, rem);
    }
  }

  const allMilestones = [];

  for (const doc of docs) {
    try {
      let metadata = doc.metadata;
      let analysis = doc.analysis;
      if (!metadata) {
        metadata = await DocumentMetadata.findOne({ documentId: doc._id });
      }
      if (!analysis) {
        analysis = await AnalysisResult.findOne({ documentId: doc._id });
      }

      const extraction = extractContractObligations(doc, analysis, metadata);
      const items = extraction.obligations || extraction.timeline || [];

      for (const item of items) {
        const rem = reminderMap.get(`${doc._id}_${item.id}`);
        allMilestones.push({
          ...item,
          id: item.id,
          category: item.category,
          title: item.title,
          certainty: item.certainty,
          dateType: item.dateType,
          date: item.formattedDueDate || item.date || item.rawDateText || 'Not Specified',
          rawDateText: item.rawDateText || item.date || 'Not Specified',
          formattedDueDate: item.formattedDueDate || item.date || 'Not Specified',
          parsedDate: item.parsedDueDate || item.parsedDate || null,
          parsedDueDate: item.parsedDueDate || item.parsedDate || null,
          party: item.party || item.boundParty || 'All Parties',
          boundParty: item.party || item.boundParty || 'All Parties',
          actionRequired: item.actionRequired || item.action || item.title,
          action: item.action || item.actionRequired || item.title,
          sourcePassage: item.sourcePassage || item.supportingEvidence || '',
          supportingEvidence: item.sourcePassage || item.supportingEvidence || '',
          page: item.page || 1,
          section: item.section || 'General Terms',
          documentId: doc._id,
          documentTitle: doc.originalName || doc.title,
          documentType: doc.documentType,
          hasActiveReminder: !!rem,
          activeReminder: rem ? {
            id: rem._id,
            reminderDate: rem.reminderDate,
            dueDate: rem.dueDate,
            notificationChannel: rem.notificationChannel,
          } : null,
        });
      }
    } catch (err) {
      logger.warn(`Could not extract obligations for doc ${doc._id}:`, err.message);
    }
  }

  // Sort: Milestones with active reminders or near due dates first
  allMilestones.sort((a, b) => {
    if (a.hasActiveReminder && !b.hasActiveReminder) return -1;
    if (!a.hasActiveReminder && b.hasActiveReminder) return 1;
    if (a.parsedDueDate && b.parsedDueDate) {
      return new Date(a.parsedDueDate) - new Date(b.parsedDueDate);
    }
    if (a.parsedDueDate && !b.parsedDueDate) return -1;
    if (!a.parsedDueDate && b.parsedDueDate) return 1;
    return 0;
  });

  // Attach processingCount and obligations properties for multi-format compatibility
  allMilestones.processingCount = processingCount;
  allMilestones.obligations = allMilestones;

  return allMilestones;
};

/**
 * retryDocumentProcessing
 * Re-triggers ingestion pipeline for a failed or stuck document.
 * Enforces ownership check or admin role.
 */
const retryDocumentProcessing = async (documentId, userId, userRole = 'user') => {
  if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
    return { found: false, authorized: false, error: 'Invalid document ID format.' };
  }
  const document = await Document.findOne({
    _id: documentId,
    isDeleted: { $ne: true },
  });

  if (!document) {
    return { found: false, authorized: false, error: 'Document not found.' };
  }

  // Authorization: must be document owner or admin
  const isOwner = document.userId.toString() === userId.toString();
  const isAdmin = userRole === 'admin';

  if (!isOwner && !isAdmin) {
    return { found: true, authorized: false, error: 'Access denied.' };
  }

  // Verify file exists on local storage
  if (!document.filePath || !fs.existsSync(document.filePath)) {
    return {
      found: true,
      authorized: true,
      error: 'Underlying document file not found on disk. Cannot retry pipeline.',
    };
  }

  // Atomic update to transition to pending/queued and increment retryCount
  const updatedDoc = await Document.findOneAndUpdate(
    {
      _id: documentId,
      processingStatus: { $ne: 'processing' },
    },
    {
      $set: {
        processingStatus:   'pending',
        processingStage:    'queued',
        processingProgress: 10,
        processingError:    null,
        lastRetriedAt:      new Date(),
      },
      $inc: { retryCount: 1 },
    },
    { new: true }
  );

  if (!updatedDoc) {
    return {
      found: true,
      authorized: true,
      error: 'Document pipeline is currently active and processing. Cannot retry concurrently.',
    };
  }

  // Trigger processing asynchronously in background
  sendToAIService(
    updatedDoc._id.toString(),
    updatedDoc.userId.toString(),
    updatedDoc.filePath,
    {
      documentType: updatedDoc.documentType,
      originalName: updatedDoc.originalName,
      fileFormat:   updatedDoc.fileFormat,
    }
  ).catch((err) => {
    logger.error(`Retry processing error for ${updatedDoc._id}: ${err.message}`);
  });

  return {
    found: true,
    authorized: true,
    document: updatedDoc,
  };
};

module.exports = {
  DOCUMENT_TYPES,
  validateDocumentType,
  createDocumentRecord,
  sendToAIService,
  retryDocumentProcessing,
  getUserDocuments,
  getDocumentById,
  deleteDocument,
  getDocumentTypes,
  getAllDocuments,
  askDocumentQuestion,
  createDocumentVersionRecord,
  getDocumentVersions,
  compareDocuments,
  getDocumentObligations,
  getDocumentReminders,
  createDocumentReminder,
  updateDocumentReminder,
  deleteDocumentReminder,
  getReminderCalendarIcs,
  getAllUserReminders,
  getUserActivityFeed,
  getUpcomingUserObligations,
  purgeUserAllData,
  isPathInsideDirectory,
  resolveDocFullText,
};