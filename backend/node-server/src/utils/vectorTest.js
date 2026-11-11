/**
 * LegalMind AI — Part 10: Summary + Embeddings + FAISS Test Suite
 *
 * Run:
 *   INTERNAL_API_KEY=internal_secret_key_change_this node src/utils/vectorTest.js
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

function log(label, value) { console.log(`   ${label}:`, JSON.stringify(value, null, 2)); }
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
    chunk_index: 0, page: 1, section: "1.1", section_title: "Position",
    text: "The Employee John Smith is appointed as Senior Software Engineer at ABC Technologies Private Limited.",
    clause_type: "obligation"
  },
  {
    chunk_index: 1, page: 2, section: "2.1", section_title: "Compensation",
    text: "The Employer agrees to pay a monthly salary of INR 1,00,000 on the 1st of every month.",
    clause_type: "payment"
  },
  {
    chunk_index: 2, page: 3, section: "3.1", section_title: "Termination",
    text: "Either party may terminate this agreement by providing 90 days written notice.",
    clause_type: "termination"
  }
];

async function runTests() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  LegalMind AI — Part 10: Summary + FAISS Vector Tests');
  console.log('══════════════════════════════════════════════════════\n');

  // T01 — FastAPI Health
  await test('T01 — FastAPI Health Check', async () => {
    const res = await axios.get(`${FASTAPI_URL}/health`);
    assert(res.data.success === true, 'Health check failed');
  });

  // T02 — Vector Router Health
  await test('T02 — Vector Router Health Check', async () => {
    const res = await axios.get(`${FASTAPI_URL}/vector/health`, {
      headers: { 'X-Internal-API-Key': INTERNAL_KEY },
    });
    assert(res.data.status === 'operational', 'Vector health failed');
    assert(res.data.vector_store === 'FAISS', 'Expected FAISS vector store');
  });

  // T03 — Direct Vector Indexing
  await test('T03 — SentenceTransformers & FAISS Index Generation', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/vector/index`,
      { document_id: 'test-doc-faiss-001', chunks: SAMPLE_CHUNKS },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    const data = res.data;
    assert(data.success === true, 'Expected success=true');
    assert(data.total_vectors === 3, `Expected 3 vectors, got ${data.total_vectors}`);
    assert(data.embedding_dim === 384, `Expected 384-dim, got ${data.embedding_dim}`);
    log('FAISS Index Path', data.index_file_path);
  });

  // T04 — Direct Vector Search
  await test('T04 — Semantic Vector Similarity Search against FAISS Index', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/vector/search`,
      { document_id: 'test-doc-faiss-001', query: 'What is the salary and monthly payment?', top_k: 2 },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    const data = res.data;
    assert(data.success === true, 'Expected search success');
    assert(data.results.length > 0, 'Expected search results');

    const topMatch = data.results[0];
    assert(topMatch.clause_type === 'payment', `Expected top match to be payment clause, got ${topMatch.clause_type}`);
    log('Top Semantic Search Match', {
      query: data.query,
      text: topMatch.text,
      score: topMatch.score,
      clause_type: topMatch.clause_type
    });
  });

  // T05 — Full E2E Pipeline (Polling for Async Completion)
  await test('T05 — Full Node.js Upload Pipeline End-to-End (Parts 01–10)', async () => {
    // 1. Auth
    const email = `part10test${Date.now()}@legaltest.com`;
    await axios.post(`${NODE_URL}/api/auth/register`, { name: 'Part10 Tester', email, password: 'TestPassword123!' });
    const authRes = await axios.post(`${NODE_URL}/api/auth/login`, { email, password: 'TestPassword123!' });
    authToken = authRes.data.token;

    // 2. Upload Contract File
    const tmpFile = path.join(os.tmpdir(), 'part10_contract.txt');
    fs.writeFileSync(
      tmpFile,
      'EMPLOYMENT CONTRACT\n\n' +
      '1.1 Position\nThe Employee John Smith is appointed as Senior Software Engineer at ABC Technologies Private Limited.\n\n' +
      '2.1 Compensation\nThe Employer agrees to pay a monthly salary of INR 1,00,000 on the 1st of every month.\n\n' +
      '3.1 Termination\nEither party may terminate this agreement by providing 90 days written notice.',
      'utf8'
    );

    const form = new FormData();
    form.append('document', fs.createReadStream(tmpFile), { filename: 'part10_contract.txt', contentType: 'text/plain' });
    form.append('documentType', 'employment');

    const uploadRes = await axios.post(`${NODE_URL}/api/documents/upload`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${authToken}` },
    });
    const docId = uploadRes.data.data.document.id;

    console.log('   Polling status for Full Pipeline (Parts 01–10)...');

    // Poll until completed or failed (up to 30 seconds max)
    let doc = null;
    for (let attempts = 0; attempts < 30; attempts++) {
      await new Promise(r => setTimeout(r, 1000));
      const docRes = await axios.get(`${NODE_URL}/api/documents/${docId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      doc = docRes.data.data.document;

      if (doc.processingStatus === 'completed' || doc.processingStatus === 'failed') {
        break;
      }
    }

    log('Final Processing Status', doc.processingStatus);
    log('FAISS Index Path Saved', doc.faissIndexPath);

    const summaryText = typeof doc.analysis?.summary === 'object'
      ? doc.analysis.summary.fullSummary
      : doc.analysis?.summary;

    log('Summary Saved in AnalysisResult', summaryText);

    assert(
      doc.processingStatus === 'completed',
      `Expected status 'completed', got '${doc.processingStatus}' (error: ${doc.processingError || 'none'})`
    );
    assert(doc.faissIndexPath && doc.faissIndexPath.includes('.index'), 'FAISS index path not saved to Document');
    assert(summaryText && summaryText.length > 0, 'Summary text not saved in AnalysisResult');
  });

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed / ${failed} failed / ${passed + failed} total`);
  console.log('══════════════════════════════════════════════════════\n');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => { console.error(err); process.exit(1); });