// ============================================================
// Models — Central Export
// ============================================================
const User             = require('./User.model');
const Document         = require('./Document.model');
const DocumentMetadata = require('./DocumentMetadata.model');
const AnalysisResult   = require('./AnalysisResult.model');
const RiskFinding      = require('./RiskFinding.model');
const ChatHistory      = require('./ChatHistory.model');
const Report           = require('./Report.model');
const ContractReminder = require('./ContractReminder.model');
const AuditLog         = require('./AuditLog.model');
const PlatformSettings = require('./PlatformSettings.model');

module.exports = {
  User,
  Document,
  DocumentMetadata,
  AnalysisResult,
  RiskFinding,
  ChatHistory,
  Report,
  ContractReminder,
  AuditLog,
  PlatformSettings,
};