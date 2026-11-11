// backend/node-server/src/middleware/ownership.middleware.js

const mongoose = require('mongoose');
const Document = require('../models/Document.model');

/**
 * Requires that the authenticated user owns the document.
 * Admins bypass this check.
 * Attaches the document to req.document so controllers don't re-fetch.
 */
const requireDocumentOwnership = async (req, res, next) => {
  try {
    const documentId = req.params.id;

    if (!documentId || documentId === 'undefined' || documentId === 'null' || !mongoose.Types.ObjectId.isValid(documentId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Invalid document ID format.',
        },
      });
    }

    const document = await Document.findById(documentId);
    console.log('Ownership check documentId:', documentId, 'found doc:', document ? document._id : 'null');

    if (!document) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Document not found.',
        },
      });
    }

    // Admins can access documents, but cross-user access produces an audit log
    if (req.user.role === 'admin') {
      const ownerId = document.userId.toString();
      const userId  = req.user._id.toString();
      if (ownerId !== userId) {
        try {
          const { logAuditEvent } = require('../services/audit.service');
          logAuditEvent({
            action:     'ADMIN_DOCUMENT_ACCESS',
            actor:      { _id: req.user._id, email: req.user.email, role: req.user.role },
            targetType: 'document',
            targetId:   document._id,
            status:     'warning',
            details: {
              ownerId,
              documentTitle: document.title || document.originalName,
              accessRoute:   req.originalUrl || req.url,
              method:        req.method,
            },
            req,
          });
        } catch {}
      }
      req.document = document;
      return next();
    }

    // Compare as strings to avoid ObjectId vs string mismatch
    const ownerId = document.userId.toString();
    const userId = req.user._id.toString();

    if (ownerId !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied.',
        },
      });
    }

    req.document = document;
    next();
  } catch (err) {
    // Handle invalid ObjectId format
    if (err.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'Invalid document ID format.',
        },
      });
    }

    next(err);
  }
};

module.exports = { requireDocumentOwnership };