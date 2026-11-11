// backend/node-server/src/routes/report.routes.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const {
  generateReport,
  listReports,
  downloadReport,
  deleteReport,
} = require('../controllers/report.controller');

router.use(protect);

router.get('/', listReports);
router.post('/generate/:id', generateReport); // id = documentId
router.get('/:id/download', downloadReport);
router.delete('/:id', deleteReport);

module.exports = router;