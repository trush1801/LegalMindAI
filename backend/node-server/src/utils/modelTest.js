// ============================================================
// Model Test Utility
// Run once to verify all models connect and write to MongoDB
// Usage: node src/utils/modelTest.js
// ============================================================
const mongoose  = require('mongoose');
const config    = require('../config/env');

const User             = require('../models/User.model');
const Document         = require('../models/Document.model');
const DocumentMetadata = require('../models/DocumentMetadata.model');
const AnalysisResult   = require('../models/AnalysisResult.model');
const RiskFinding      = require('../models/RiskFinding.model');
const ChatHistory      = require('../models/ChatHistory.model');
const Report           = require('../models/Report.model');

const runTest = async () => {
  console.log('\n⚖️  LegalMind AI — Model Test');
  console.log('================================\n');

  // ── Connect ──────────────────────────────────────────
  await mongoose.connect(config.MONGODB_URI);
  console.log('✅ MongoDB Connected\n');

  // ── Create test user ─────────────────────────────────
  console.log('📝 Creating test user...');
  const user = await User.create({
    name:     'Test User',
    email:    `test_${Date.now()}@legalmind.ai`,
    password: 'TestPassword123!',
    role:     'normal_user',
  });
  console.log(`✅ User created: ${user._id} | ${user.email}`);

  // ── Create test document ──────────────────────────────
  console.log('\n📝 Creating test document...');
  const doc = await Document.create({
    userId:           user._id,
    originalName:     'test-contract.pdf',
    storedName:       `test-contract-${Date.now()}.pdf`,
    filePath:         '/storage/test-contract.pdf',
    fileSize:         12345,
    mimeType:         'application/pdf',
    fileFormat:       'pdf',
    documentType:     'employment',
    documentSubtype:  'Employment Contract',
    detectedLanguage: 'english',
    processingStatus: 'completed',
  });
  console.log(`✅ Document created: ${doc._id}`);

  // ── DocumentMetadata ──────────────────────────────────
  console.log('\n📝 Creating document metadata...');
  const meta = await DocumentMetadata.create({
    documentId:          doc._id,
    userId:              user._id,
    totalPages:          5,
    totalWords:          2400,
    totalCharacters:     14200,
    totalChunks:         12,
    detectedLanguage:    'english',
    languageConfidence:  0.99,
    ocrUsed:             false,
    extractionMethod:    'pymupdf',
  });
  console.log(`✅ Metadata created: ${meta._id}`);

  // ── AnalysisResult ────────────────────────────────────
  console.log('\n📝 Creating analysis result...');
  const analysis = await AnalysisResult.create({
    documentId: doc._id,
    userId:     user._id,
    entities: [
      { text: 'Acme Corp',  label: 'PARTY',  confidence: 0.97, page: 1 },
      { text: 'John Smith', label: 'PARTY',  confidence: 0.95, page: 1 },
      { text: '₹50,000',    label: 'AMOUNT', confidence: 0.99, page: 2 },
    ],
    parties: [
      { name: 'Acme Corp',  role: 'Employer', page: 1 },
      { name: 'John Smith', role: 'Employee', page: 1 },
    ],
    keyDates: [
      { label: 'Start Date', date: '1st January 2025', page: 1 },
    ],
    clauses: [
      {
        clauseType: 'termination',
        clauseText: 'Either party may terminate this agreement with 30 days notice.',
        page: 3,
        confidence: 0.92,
      },
    ],
    summary: {
      fullSummary:    'This is an employment contract between Acme Corp and John Smith.',
      keyPoints:      ['30-day notice period', 'Monthly salary of ₹50,000'],
      obligations:    ['Employee must not disclose confidential information'],
      importantDates: ['Start Date: 1st January 2025'],
    },
  });
  console.log(`✅ Analysis created: ${analysis._id}`);

  // ── RiskFinding ───────────────────────────────────────
  console.log('\n📝 Creating risk finding...');
  const risk = await RiskFinding.create({
    documentId:       doc._id,
    userId:           user._id,
    overallRiskScore: 62,
    overallRiskLevel: 'medium',
    riskCategories: [
      { category: 'termination', score: 70, weight: 0.3, description: 'Termination clause favors employer' },
      { category: 'liability',   score: 55, weight: 0.25, description: 'Limited liability for employer' },
    ],
    flaggedClauses: [
      {
        clauseType:  'termination',
        clauseText:  'Either party may terminate with 30 days notice.',
        riskLevel:   'medium',
        riskScore:   65,
        reason:      'Notice period is short — may not protect employee adequately',
        suggestion:  'Negotiate for a longer notice period (60-90 days)',
        page:        3,
      },
    ],
    riskSummary:   'This contract carries medium risk. Key concern is the short termination notice period.',
    totalFlagged:  1,
    criticalCount: 0,
    highCount:     0,
    mediumCount:   1,
    lowCount:      0,
  });
  console.log(`✅ Risk finding created: ${risk._id}`);

  // ── ChatHistory ───────────────────────────────────────
  console.log('\n📝 Creating chat history...');
  const chat = await ChatHistory.create({
    documentId: doc._id,
    userId:     user._id,
    messages: [
      {
        question:          'What is the termination period?',
        questionLanguage:  'english',
        answer:            'Either party may terminate with 30 days written notice (Page 3).',
        answerLanguage:    'english',
        queryType:         'clause',
        routedPath:        'rag_retrieval',
        citations: [
          { page: 3, section: 'Termination', excerpt: 'Either party may terminate with 30 days notice.' },
        ],
        evidenceFound:     true,
        citationValidated: true,
        isSafeResponse:    false,
        responseTimeMs:    1240,
      },
    ],
  });
  console.log(`✅ Chat history created: ${chat._id}`);

  // ── Report ────────────────────────────────────────────
  console.log('\n📝 Creating report...');
  const report = await Report.create({
    documentId:           doc._id,
    userId:               user._id,
    reportType:           'full_analysis',
    reportName:           'Employment_Contract_Analysis.pdf',
    status:               'ready',
    includesSummary:      true,
    includesRiskAnalysis: true,
    includesClauses:      true,
    generatedAt:          new Date(),
  });
  console.log(`✅ Report created: ${report._id}`);

  // ── Verify relationships ──────────────────────────────
  console.log('\n🔍 Verifying relationships...');

  const foundDoc = await Document.findById(doc._id)
    .populate('metadata')
    .populate('analysis')
    .populate('riskFindings')
    .populate('chatHistory')
    .populate('reports');

  console.log(`✅ Document populated:`);
  console.log(`   └── metadata      : ${foundDoc.metadata ? '✅' : '❌'}`);
  console.log(`   └── analysis      : ${foundDoc.analysis ? '✅' : '❌'}`);
  console.log(`   └── riskFindings  : ${foundDoc.riskFindings.length} record(s)`);
  console.log(`   └── chatHistory   : ${foundDoc.chatHistory.length} record(s)`);
  console.log(`   └── reports       : ${foundDoc.reports.length} record(s)`);

  // ── Cleanup test data ─────────────────────────────────
  console.log('\n🧹 Cleaning up test data...');
  await Report.deleteMany({ userId: user._id });
  await ChatHistory.deleteMany({ userId: user._id });
  await RiskFinding.deleteMany({ userId: user._id });
  await AnalysisResult.deleteMany({ userId: user._id });
  await DocumentMetadata.deleteMany({ userId: user._id });
  await Document.deleteMany({ userId: user._id });
  await User.deleteOne({ _id: user._id });
  console.log('✅ Test data cleaned up');

  // ── Done ─────────────────────────────────────────────
  console.log('\n================================');
  console.log('✅ ALL MODELS VERIFIED — PART 02 COMPLETE');
  console.log('================================\n');

  await mongoose.disconnect();
  process.exit(0);
};

runTest().catch((err) => {
  console.error('\n❌ Model test failed:', err.message);
  console.error(err);
  process.exit(1);
});