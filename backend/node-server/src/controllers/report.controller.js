// backend/node-server/src/controllers/report.controller.js

const reportService = require('../services/report.service');
const fs = require('fs');

exports.generateReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await reportService.generateDocumentReport(id, req.user._id);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: { message: err.message } });
    next(err);
  }
};

exports.listReports = async (req, res, next) => {
  try {
    const reports = await reportService.listUserReports(req.user._id);
    res.json({
      success: true,
      data: {
        total: reports.length,
        reports: reports.map((r) => ({
          id: r._id,
          documentId: r.documentId?._id || r.documentId,
          documentName: r.documentId?.originalName || 'Unknown',
          documentType: r.documentId?.documentType || 'Unknown',
          reportType: r.reportType,
          fileSize: r.fileSize,
          downloadCount: r.downloadCount,
          status: r.status,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.downloadReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await reportService.downloadReport(id, req.user._id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="legalmind-report-${id}.pdf"`);
    fs.createReadStream(report.filePath).pipe(res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: { message: err.message } });
    next(err);
  }
};

exports.deleteReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await reportService.deleteReport(id, req.user._id);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: { message: err.message } });
    next(err);
  }
};