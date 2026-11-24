// ============================================================
// Document Controller
// Upload | List | Get | Delete | Types
// ============================================================
const fs = require('fs');
const path = require('path');
const { DocumentMetadata } = require('../models');
const {
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
} = require('../services/document.service');

// ── POST /api/documents/upload ────────────────────────────
const uploadDocument = async (req, res) => {
  try {
    const { documentType, documentSubtype } = req.body;

    // 1. Validate document type
    const typeValidation = validateDocumentType(documentType, documentSubtype);
    if (!typeValidation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'INVALID_DOCUMENT_TYPE',
          message: typeValidation.message,
        },
      });
    }

    // 2. Create document record in MongoDB
    const document = await createDocumentRecord(
      req.user._id,
      req.file,
      typeValidation.type,
      typeValidation.subtype
    );

    // 3. Send to FastAPI AI service for processing (async — don't wait)
    // Processing happens in background
    // Status updates from 'pending' → 'processing' → 'completed'/'failed'
    sendToAIService(
      document._id.toString(),
      req.user._id.toString(),
      document.filePath,
      {
        documentType: document.documentType,
        originalName: document.originalName,
        fileFormat:   document.fileFormat,
      }
    ).catch((err) => {
      console.error(`❌ Document ${document._id} AI processing error:`, err.message);
    });

    // 4. Respond immediately — processing continues in background
    const docIdStr = document._id.toString();
    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully. Processing has started.',
      documentId: docIdStr,
      id: docIdStr,
      _id: docIdStr,
      data: {
        documentId: docIdStr,
        id:         docIdStr,
        _id:        docIdStr,
        document: {
          _id:              docIdStr,
          id:               docIdStr,
          documentId:       docIdStr,
          originalName:     document.originalName,
          fileFormat:       document.fileFormat,
          fileSize:         document.fileSize,
          documentType:     document.documentType,
          documentSubtype:  document.documentSubtype,
          processingStatus: document.processingStatus,
          processingStage:  document.processingStage,
          processingProgress: document.processingProgress,
          createdAt:        document.createdAt,
        },
      },
    });

  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({
      success: false,
      error: {
        code:    'UPLOAD_FAILED',
        message: 'Document upload failed. Please try again.',
      },
    });
  }
};

// ── GET /api/documents ────────────────────────────────────
const listDocuments = async (req, res) => {
  try {
    const result = await getUserDocuments(req.user._id, req.query);

    res.status(200).json({
      success: true,
      data:    result,
    });

  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({
      success: false,
      error: {
        code:    'LIST_FAILED',
        message: 'Failed to retrieve documents.',
      },
    });
  }
};

// ── GET /api/documents/:id ────────────────────────────────
const getDocument = async (req, res) => {
  try {
    const result = await getDocumentById(
      req.params.id,
      req.user._id,
      req.user.role
    );

    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document not found.' },
      });
    }

    if (!result.authorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
    }

    res.status(200).json({
      success: true,
      data:    { document: result.document },
    });

  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Invalid document ID.' },
      });
    }
    console.error('Get document error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_FAILED', message: 'Failed to retrieve document.' },
    });
  }
};

// ── GET /api/documents/:id/status ─────────────────────────
const getDocumentStatus = async (req, res) => {
  try {
    // req.document is already fetched & ownership-verified by requireDocumentOwnership middleware
    const document = req.document;

    res.status(200).json({
      success: true,
      data: {
        documentId:           req.params.id,
        processingStatus:     document.processingStatus,
        processingStage:      document.processingStage || (document.processingStatus === 'completed' ? 'completed' : document.processingStatus === 'failed' ? 'failed' : 'extracting'),
        processingProgress:   document.processingProgress !== undefined && document.processingProgress !== null ? document.processingProgress : (document.processingStatus === 'completed' ? 100 : 0),
        processingDurationMs: document.processingDurationMs,
        retryCount:           document.retryCount || 0,
        lastRetriedAt:        document.lastRetriedAt,
        processingError:      document.processingError,
        detectedLanguage:     document.detectedLanguage,
        updatedAt:            document.updatedAt,
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'STATUS_FAILED', message: 'Failed to get document status.' },
    });
  }
};

// ── POST /api/documents/:id/retry ─────────────────────────
const retryDocument = async (req, res) => {
  try {
    const result = await retryDocumentProcessing(
      req.params.id,
      req.user._id,
      req.user.role
    );

    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: result.error || 'Document not found.' },
      });
    }

    if (!result.authorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: result.error || 'Access denied.' },
      });
    }

    if (result.error) {
      return res.status(400).json({
        success: false,
        error: { code: 'RETRY_REJECTED', message: result.error },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Document analysis pipeline restarted successfully.',
      data: {
        documentId:         result.document._id,
        processingStatus:   result.document.processingStatus,
        processingStage:    result.document.processingStage,
        processingProgress: result.document.processingProgress,
        retryCount:         result.document.retryCount,
        lastRetriedAt:      result.document.lastRetriedAt,
      },
    });

  } catch (error) {
    console.error('Retry document error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'RETRY_FAILED', message: 'Failed to restart document analysis pipeline.' },
    });
  }
};

// ── DELETE /api/documents/:id ─────────────────────────────
const removeDocument = async (req, res) => {
  try {
    const result = await deleteDocument(
      req.params.id,
      req.user._id,
      req.user.role
    );

    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document not found.' },
      });
    }

    if (!result.authorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully.',
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_FAILED', message: 'Failed to delete document.' },
    });
  }
};

// ── GET /api/documents/types ──────────────────────────────
const listDocumentTypes = (req, res) => {
  res.status(200).json({
    success: true,
    data:    { documentTypes: getDocumentTypes() },
  });
};

// ── GET /api/admin/documents (admin only) ─────────────────
const adminListDocuments = async (req, res) => {
  try {
    const result = await getAllDocuments(req.query);
    res.status(200).json({
      success: true,
      data:    result,
    });
  } catch (error) {
    console.error('Admin list documents error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'LIST_FAILED', message: 'Failed to retrieve documents.' },
    });
  }
};
/**
 * POST /api/documents/:id/chat
/**
 * Part 12 — Ask a question about a document (Agentic RAG)
 */
const chatWithDocument = async (req, res, next) => {
  try {
    const documentId = req.params.id;
    const userId = req.user._id;
    const queryText = (req.body.query || req.body.question || '').trim();

    if (!queryText || queryText.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QUESTION',
        message: 'Please provide a valid question (min 2 characters).',
      });
    }

    const outcome = await askDocumentQuestion(
      documentId,
      userId,
      queryText
    );

    if (outcome && outcome.found === false) {
      return res.status(404).json({
        success: false,
        error: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found',
      });
    }

    if (outcome && outcome.authorized === false) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'You do not own this document',
      });
    }

    if (outcome && outcome.ready === false) {
      return res.status(409).json({
        success: false,
        error: 'DOCUMENT_NOT_READY',
        message: outcome.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: outcome.result || outcome,
    });
  } catch (error) {
    if (error.status || error.statusCode) {
      return res.status(error.status || error.statusCode).json({
        success: false,
        error: error.code || 'CHAT_ERROR',
        message: error.message || 'Chat error',
      });
    }
    next(error);
  }
};
// Add to backend/node-server/src/controllers/document.controller.js

const ChatHistory = require('../models/ChatHistory.model');

const getChatHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const chat = await ChatHistory.findOne({ documentId: id, userId: req.user._id });
    res.json({
      success: true,
      data: {
        messages: chat?.messages || [],
        totalMessages: chat?.totalMessages != null ? chat.totalMessages : (chat?.messages?.length || 0),
      },
    });
  } catch (err) {
    next(err);
  }
};

const streamDocumentFile = async (req, res) => {
  try {
    const document = req.document;
    if (!document) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document not found.' },
      });
    }

    let targetPath = document.filePath;
    if (targetPath && !path.isAbsolute(targetPath)) {
      targetPath = path.resolve(__dirname, '../../../../', targetPath);
    }

    if (targetPath && fs.existsSync(targetPath)) {
      res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.originalName)}"`);
      return fs.createReadStream(targetPath).pipe(res);
    }

    // Fallback: check if metadata has extractedText
    const metadata = await DocumentMetadata.findOne({ documentId: document._id });
    if (metadata && metadata.extractedText) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.originalName)}.txt"`);
      return res.send(metadata.extractedText);
    }

    return res.status(404).json({
      success: false,
      error: { code: 'FILE_NOT_FOUND', message: 'Original file not found on disk or storage.' },
    });
  } catch (error) {
    console.error('Stream document file error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'STREAM_FAILED', message: 'Failed to stream document file.' },
    });
  }
};

// ── POST /api/documents/:id/versions ───────────────────────
const uploadDocumentVersion = async (req, res) => {
  try {
    const parentDocumentId = req.params.id;
    const { versionComment, documentSubtype } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'FILE_REQUIRED', message: 'Revision document file is required.' },
      });
    }

    const { newVersionDoc, rootDoc } = await createDocumentVersionRecord(
      parentDocumentId,
      req.user._id,
      req.file,
      versionComment,
      documentSubtype
    );

    // Asynchronously dispatch to FastAPI AI pipeline
    sendToAIService(
      newVersionDoc._id.toString(),
      req.user._id.toString(),
      newVersionDoc.filePath,
      {
        documentType: newVersionDoc.documentType,
        originalName: newVersionDoc.originalName,
        fileFormat:   newVersionDoc.fileFormat,
      }
    ).catch((err) => {
      console.error(`❌ Version ${newVersionDoc._id} AI processing error:`, err.message);
    });

    const vDocIdStr = newVersionDoc._id.toString();
    res.status(201).json({
      success: true,
      message: `Version ${newVersionDoc.version} uploaded successfully. Processing initiated.`,
      documentId: vDocIdStr,
      id: vDocIdStr,
      _id: vDocIdStr,
      data: {
        documentId:     vDocIdStr,
        id:             vDocIdStr,
        _id:            vDocIdStr,
        document:       newVersionDoc,
        rootDocumentId: rootDoc.parentDocumentId || rootDoc._id,
      },
    });
  } catch (error) {
    console.error('Upload document version error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: {
        code: error.code || 'VERSION_UPLOAD_FAILED',
        message: error.message || 'Failed to upload document version.',
      },
    });
  }
};

// ── GET /api/documents/:id/versions ────────────────────────
const listDocumentVersions = async (req, res) => {
  try {
    const result = await getDocumentVersions(
      req.params.id,
      req.user._id,
      req.user.role
    );

    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document not found.' },
      });
    }

    if (!result.authorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not authorized to access version history.' },
      });
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('List document versions error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'VERSIONS_FETCH_FAILED', message: 'Failed to retrieve version history.' },
    });
  }
};

// ── GET /api/documents/:baseId/compare/:targetId ───────────
const compareDocumentsHandler = async (req, res) => {
  try {
    const { baseId, targetId } = req.params;

    const result = await compareDocuments(
      baseId,
      targetId,
      req.user._id,
      req.user.role
    );

    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Document ${result.missingId} not found.` },
      });
    }

    if (!result.authorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not authorized to compare these documents.' },
      });
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Compare documents error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'COMPARE_FAILED', message: 'Failed to compare documents.' },
    });
  }
};

// ── GET /api/documents/:id/obligations ───────────────────────
const getDocumentObligationsHandler = async (req, res) => {
  try {
    const result = await getDocumentObligations(req.params.id, req.user._id, req.user.role);
    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document not found.' },
      });
    }
    if (!result.authorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
    }
    res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    console.error('Get document obligations error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'OBLIGATIONS_FAILED', message: 'Failed to extract contract obligations.' },
    });
  }
};

// ── GET /api/documents/:id/reminders ─────────────────────────
const listDocumentRemindersHandler = async (req, res) => {
  try {
    const result = await getDocumentReminders(req.params.id, req.user._id, req.user.role);
    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document not found.' },
      });
    }
    if (!result.authorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
    }
    res.status(200).json({
      success: true,
      data: result.reminders,
    });
  } catch (error) {
    console.error('List reminders error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'REMINDERS_FAILED', message: 'Failed to retrieve reminders.' },
    });
  }
};

// ── POST /api/documents/:id/reminders ────────────────────────
const createDocumentReminderHandler = async (req, res) => {
  try {
    const result = await createDocumentReminder(
      req.params.id,
      req.user._id,
      req.user.tenantId,
      req.body
    );
    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document not found.' },
      });
    }
    if (result.error) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: result.error },
      });
    }
    res.status(201).json({
      success: true,
      data: result.reminder,
    });
  } catch (error) {
    console.error('Create reminder error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CREATE_REMINDER_FAILED', message: 'Failed to schedule contract reminder.' },
    });
  }
};

// ── PATCH /api/documents/:id/reminders/:reminderId ───────────
const updateDocumentReminderHandler = async (req, res) => {
  try {
    const result = await updateDocumentReminder(
      req.params.id,
      req.params.reminderId,
      req.user._id,
      req.user.role,
      req.body
    );
    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Reminder or document not found.' },
      });
    }
    if (!result.authorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
    }
    res.status(200).json({
      success: true,
      data: result.reminder,
    });
  } catch (error) {
    console.error('Update reminder error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_REMINDER_FAILED', message: 'Failed to update reminder.' },
    });
  }
};

// ── DELETE /api/documents/:id/reminders/:reminderId ──────────
const deleteDocumentReminderHandler = async (req, res) => {
  try {
    const result = await deleteDocumentReminder(
      req.params.id,
      req.params.reminderId,
      req.user._id,
      req.user.role
    );
    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Reminder or document not found.' },
      });
    }
    if (!result.authorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
    }
    res.status(200).json({
      success: true,
      message: 'Reminder successfully removed.',
    });
  } catch (error) {
    console.error('Delete reminder error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_REMINDER_FAILED', message: 'Failed to delete reminder.' },
    });
  }
};

// ── GET /api/documents/:id/reminders/:reminderId/ics ─────────
const downloadReminderIcsHandler = async (req, res) => {
  try {
    const result = await getReminderCalendarIcs(
      req.params.id,
      req.params.reminderId,
      req.user._id,
      req.user.role
    );
    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Reminder not found.' },
      });
    }
    if (!result.authorized) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
    }
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.status(200).send(result.ics);
  } catch (error) {
    console.error('Download reminder ICS error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'ICS_FAILED', message: 'Failed to generate calendar invite.' },
    });
  }
};

// ── GET /api/documents/reminders/all ─────────────────────────
const listAllUserRemindersHandler = async (req, res) => {
  try {
    const reminders = await getAllUserReminders(req.user._id);
    res.status(200).json({
      success: true,
      data: { reminders },
    });
  } catch (error) {
    console.error('List all user reminders error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'REMINDERS_FAILED', message: 'Failed to retrieve reminders.' },
    });
  }
};

// ── GET /api/documents/activity/feed ─────────────────────────
const getUserActivityFeedHandler = async (req, res) => {
  try {
    const events = await getUserActivityFeed(req.user._id);
    res.status(200).json({
      success: true,
      data: { events },
    });
  } catch (error) {
    console.error('Get user activity feed error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'ACTIVITY_FEED_FAILED', message: 'Failed to retrieve activity feed.' },
    });
  }
};

// ── GET /api/documents/obligations/upcoming ───────────────────
const getUpcomingUserObligationsHandler = async (req, res) => {
  try {
    const upcoming = await getUpcomingUserObligations(req.user._id);
    const obligations = Array.isArray(upcoming) ? upcoming : (upcoming.obligations || []);
    const processingCount = upcoming.processingCount || 0;
    res.status(200).json({
      success: true,
      data: { obligations, processingCount },
    });
  } catch (error) {
    console.error('Get upcoming user obligations error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'OBLIGATIONS_FAILED', message: 'Failed to retrieve upcoming obligations.' },
    });
  }
};

module.exports = {
  uploadDocument,
  listDocuments,
  getDocument,
  getDocumentStatus,
  retryDocument,
  removeDocument,
  listDocumentTypes,
  adminListDocuments,
  chatWithDocument,
  getChatHistory,
  streamDocumentFile,
  uploadDocumentVersion,
  listDocumentVersions,
  compareDocumentsHandler,
  getDocumentObligationsHandler,
  listDocumentRemindersHandler,
  createDocumentReminderHandler,
  updateDocumentReminderHandler,
  deleteDocumentReminderHandler,
  downloadReminderIcsHandler,
  listAllUserRemindersHandler,
  getUserActivityFeedHandler,
  getUpcomingUserObligationsHandler,
};