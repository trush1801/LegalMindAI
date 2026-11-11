/**
 * LegalMind AI — Part 08: DETAILED NER + Legal-BERT Verification
 *
 * Run:
 *   INTERNAL_API_KEY=internal_secret_key_change_this node src/utils/analysisDetailTest.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');

const NODE_URL    = 'http://localhost:5001';
const FASTAPI_URL = 'http://localhost:8000';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'internal_secret_key_change_this';

let authToken = null;
let passed = 0;
let failed = 0;

function log(label, value) { 
  console.log(`\n🔹 ${label}:`);
  console.log(JSON.stringify(value, null, 2)); 
}
function assert(condition, message) { if (!condition) throw new Error(message); }
async function test(name, fn) {
  try { await fn(); console.log(`✅ PASS — ${name}`); passed++; }
  catch (err) {
    console.log(`❌ FAIL — ${name}`);
    console.log(`   Error: ${err.message}`);
    failed++;
  }
}

const SAMPLE_CHUNKS = [
  {
    document_id: 'detail-test-001', chunk_index: 0, page: 1, section: null, section_title: null,
    text: 'This Employment Agreement ("Agreement") is entered into as of 1st January 2025, between ABC Technologies Private Limited ("Employer") and John Smith ("Employee").',
  },
  {
    document_id: 'detail-test-001', chunk_index: 1, page: 1, section: '2', section_title: 'Compensation',
    text: '2. Compensation and Benefits\n\nThe Employer agrees to pay the Employee a monthly salary of INR 1,00,000 (One Lakh Rupees Only).',
  },
  {
    document_id: 'detail-test-001', chunk_index: 2, page: 2, section: '3', section_title: 'Termination',
    text: '3. Termination\n\nThe Employee may terminate this Agreement by providing 90 days written notice to the Employer. The Employer may terminate immediately for cause.',
  },
  {
    document_id: 'detail-test-001', chunk_index: 3, page: 2, section: '4', section_title: 'Confidentiality',
    text: '4. Confidentiality\n\nThe Employee agrees to maintain strict confidentiality of all proprietary information and trade secrets of the Employer during and after employment.',
  }
];

async function runTests() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  LegalMind AI — Part 08: DETAILED Verification');
  console.log('══════════════════════════════════════════════════════\n');

  // ── 1. NER Detail Check ──────────────────────────────────────
  await test('T01 — Detailed NER Extraction Check', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/analysis/ner`,
      { document_id: 'detail-test-001', language_code: 'en', chunks: SAMPLE_CHUNKS, use_legal_bert: false },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    
    const data = res.data;
    assert(data.parties.includes('ABC Technologies Private Limited'), 'Missing Company Party');
    assert(data.parties.includes('John Smith'), 'Missing Person Party');
    assert(data.amounts.includes('INR 1,00,000'), 'Missing Amount');
    assert(data.dates.some(d => d.includes('1st January 2025')), 'Missing Date');
    assert(data.dates.some(d => d.includes('90 days')), 'Missing Notice Period');
    
    log('Extracted Parties', data.parties);
    log('Extracted Amounts', data.amounts);
    log('Extracted Dates & Durations', data.dates);
  });

  // ── 2. Clause Classification Detail Check ────────────────────
  await test('T02 — Detailed Legal-BERT Clause Classification Check', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/analysis/clauses`,
      { document_id: 'detail-test-001', language_code: 'en', chunks: SAMPLE_CHUNKS, use_legal_bert: true },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    const clauses = res.data.clauses;
    assert(clauses.length === 4, `Expected 4 clauses, got ${clauses.length}`);

    // Let's print exactly how the AI classified each chunk
    const classificationResults = clauses.map(c => ({
      section: c.section_title || 'Introduction',
      classified_as: c.clause_type,
      confidence: c.confidence,
      detection_method: c.detection_method,
      entities_linked: c.entities_in_clause
    }));

    log('Clause Classification Results (Legal-BERT + Rules)', classificationResults);

    // Verify it got the types right
    const types = clauses.map(c => c.clause_type);
    assert(types.includes('payment'), 'Failed to classify Compensation as Payment');
    assert(types.includes('termination'), 'Failed to classify Termination');
    assert(types.includes('confidentiality'), 'Failed to classify Confidentiality');
  });

  // ── 3. Full Node.js Pipeline Detail Check ────────────────────
  await test('T03 — Node.js Full Pipeline MongoDB Save Check', async () => {
    // 1. Auth
    const email = `detailtest${Date.now()}@legaltest.com`;
    await axios.post(`${NODE_URL}/api/auth/register`, { name: 'Detail Tester', email, password: 'TestPassword123!' });
    const authRes = await axios.post(`${NODE_URL}/api/auth/login`, { email, password: 'TestPassword123!' });
    authToken = authRes.data.token;

    // 2. Upload Document
    const tmpFile = path.join(os.tmpdir(), 'detail_contract.txt');
    fs.writeFileSync(tmpFile, SAMPLE_CHUNKS.map(c => c.text).join('\n\n'), 'utf8');
    
    const form = new FormData();
    form.append('document', fs.createReadStream(tmpFile), { filename: 'contract.txt', contentType: 'text/plain' });
    form.append('documentType', 'employment');

    const uploadRes = await axios.post(`${NODE_URL}/api/documents/upload`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${authToken}` },
    });
    const docId = uploadRes.data.data.document.id;

    // 3. Wait for FastAPI to process and Node to save to MongoDB
    console.log("   Waiting 8 seconds for AI pipeline to finish...");
    await new Promise(r => setTimeout(r, 8000));

    // 4. Fetch the Document from Node
    const docRes = await axios.get(`${NODE_URL}/api/documents/${docId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const doc = docRes.data.data.document;
    
    // We expect doc.analysis to be populated by the backend if Part 08 succeeded
    assert(doc.analysis, 'AnalysisResult was not linked/populated in the Document!');
    
    log('MongoDB Persisted AnalysisResult (Summary)', {
      parties: doc.analysis.parties,
      keyPoints: doc.analysis.keyPoints,
      total_clauses_saved: doc.analysis.clauses?.length,
      sample_clause_saved: doc.analysis.clauses[1]
    });
    
    assert(doc.analysis.parties.length > 0, 'No parties saved to DB');
    assert(doc.analysis.clauses.length > 0, 'No clauses saved to DB');
  });

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed / ${failed} failed / ${passed + failed} total`);
  console.log('══════════════════════════════════════════════════════\n');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => { console.error(err); process.exit(1); });