/**
 * LegalMind AI — Part 11: RAG + Query Analyzer Test Suite
 *
 * Run:
 *   INTERNAL_API_KEY=internal_secret_key_change_this node src/utils/queryTest.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');

const NODE_URL     = 'http://localhost:5001';
const FASTAPI_URL  = 'http://localhost:8000';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'internal_secret_key_change_this';

let authToken = null;
let testDocId = null;
let passed = 0;
let failed = 0;

function log(l, v) { console.log(`   ${l}:`, JSON.stringify(v, null, 2)); }
function assert(c, m) { if (!c) throw new Error(m); }
async function test(name, fn) {
  try { await fn(); console.log(`✅ PASS — ${name}`); passed++; }
  catch (err) {
    console.log(`❌ FAIL — ${name}`);
    console.log(`   Error: ${err.message}`);
    if (err.response?.data) console.log('   Response:', JSON.stringify(err.response.data, null, 2));
    failed++;
  }
}

async function runTests() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  LegalMind AI — Part 11: RAG + Query Analyzer Tests');
  console.log('══════════════════════════════════════════════════════\n');

  await test('T01 — FastAPI health', async () => {
    const res = await axios.get(`${FASTAPI_URL}/health`);
    assert(res.data.success === true, 'Health failed');
  });

  await test('T02 — Query service health', async () => {
    const res = await axios.get(`${FASTAPI_URL}/query/health`, {
      headers: { 'X-Internal-API-Key': INTERNAL_KEY },
    });
    assert(res.data.status === 'operational', 'Query health failed');
    assert(res.data.llm_answers === false, 'Part 11 should not enable LLM answers yet');
  });

  await test('T03 — Query categories list', async () => {
    const res = await axios.get(`${FASTAPI_URL}/query/categories`, {
      headers: { 'X-Internal-API-Key': INTERNAL_KEY },
    });
    assert(res.data.count === 5, `Expected 5 categories, got ${res.data.count}`);
    for (const c of ['risk', 'clause', 'summary', 'date', 'general']) {
      assert(res.data.categories.includes(c), `Missing category ${c}`);
    }
  });

  await test('T04 — Analyze: termination period → date', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/query/analyze`,
      { query: 'What is the termination period?' },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.data.category === 'date', `Expected date, got ${res.data.category}`);
    assert(res.data.confidence >= 0.5, 'Expected confidence >= 0.5');
    log('Analysis', {
      category: res.data.category,
      confidence: res.data.confidence,
      rewritten_query: res.data.rewritten_query,
      clause_hint: res.data.clause_hint,
    });
  });

  await test('T05 — Analyze: risk question → risk', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/query/analyze`,
      { query: 'Is this employment contract risky for the employee?' },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.data.category === 'risk', `Expected risk, got ${res.data.category}`);
  });

  await test('T06 — Analyze: summarize → summary', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/query/analyze`,
      { query: 'Summarize the key points of this agreement' },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.data.category === 'summary', `Expected summary, got ${res.data.category}`);
  });

  await test('T07 — Analyze: show termination clause → clause', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/query/analyze`,
      { query: 'Show me the termination clause' },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.data.category === 'clause', `Expected clause, got ${res.data.category}`);
    assert(res.data.clause_hint === 'termination', `Expected termination hint, got ${res.data.clause_hint}`);
  });

  await test('T08 — Register + Login + Upload document for retrieval tests', async () => {
    const email = `querytest${Date.now()}@legaltest.com`;
    await axios.post(`${NODE_URL}/api/auth/register`, {
      name: 'Query Tester', email, password: 'TestPassword123!',
    });
    const authRes = await axios.post(`${NODE_URL}/api/auth/login`, {
      email, password: 'TestPassword123!',
    });
    authToken = authRes.data.token;

    const tmpFile = path.join(os.tmpdir(), 'query_contract.txt');
    fs.writeFileSync(
      tmpFile,
      'EMPLOYMENT AGREEMENT\n\n' +
      'This Employment Agreement is entered into as of 1st January 2025 between ABC Technologies Private Limited ("Employer") and John Smith ("Employee").\n\n' +
      '2. Compensation\nThe Employer agrees to pay the Employee a monthly salary of INR 1,00,000.\n\n' +
      '3. Termination\nEither party may terminate this Agreement by providing 90 days written notice to the other party.\n\n' +
      '4. Confidentiality\nThe Employee agrees to maintain strict confidentiality of all proprietary information and trade secrets.\n\n' +
      '5. Governing Law\nThis Agreement shall be governed by the laws of India. Courts in Mumbai shall have exclusive jurisdiction.\n',
      'utf8'
    );

    const form = new FormData();
    form.append('document', fs.createReadStream(tmpFile), {
      filename: 'query_contract.txt', contentType: 'text/plain',
    });
    form.append('documentType', 'employment');

    const uploadRes = await axios.post(`${NODE_URL}/api/documents/upload`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${authToken}` },
    });
    testDocId = uploadRes.data.data.document.id;

    // Poll until completed
    let status = 'pending';
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const docRes = await axios.get(`${NODE_URL}/api/documents/${testDocId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      status = docRes.data.data.document.processingStatus;
      if (status === 'completed' || status === 'failed') break;
    }
    assert(status === 'completed', `Document not completed, status=${status}`);
    log('Uploaded Document ID', testDocId);
  });

  await test('T09 — FAISS retrieve: termination period returns relevant chunk', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/query/ask`,
      {
        document_id: testDocId,
        query: 'What is the termination period?',
        top_k: 5,
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    assert(res.data.success === true, 'Expected success');
    assert(res.data.analysis.category === 'date', `Expected date intent, got ${res.data.analysis.category}`);
    assert(res.data.total_retrieved > 0, 'Expected retrieved chunks > 0');
    assert(res.data.has_sufficient_context === true, 'Expected sufficient context');

    const top = res.data.retrieved_chunks[0];
    assert(top.citation && top.citation.includes('Page'), 'Missing citation');
    assert(
      top.text.toLowerCase().includes('90 days') ||
      top.text.toLowerCase().includes('terminat'),
      `Top chunk not relevant: ${top.text}`
    );

    log('Top Retrieved Chunk', {
      citation: top.citation,
      score: top.score,
      text: top.text.substring(0, 160),
      clause_type: top.clause_type,
    });
  });

  await test('T10 — FAISS retrieve: salary question returns payment context', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/query/ask`,
      {
        document_id: testDocId,
        query: 'What is the monthly salary?',
        top_k: 3,
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    assert(res.data.total_retrieved > 0, 'Expected chunks');
    const joined = res.data.retrieved_chunks.map(c => c.text).join(' ').toLowerCase();
    assert(joined.includes('1,00,000') || joined.includes('salary'), 'Salary context missing');
  });

  await test('T11 — Node.js chat endpoint works end-to-end', async () => {
    assert(authToken && testDocId, 'Need auth + doc from T08');

    const res = await axios.post(
      `${NODE_URL}/api/documents/${testDocId}/chat`,
      { question: 'What is the termination period?' },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.success === true, 'Expected success');
    assert(res.data.data.analysis.category === 'date', 'Expected date category via Node chat');
    assert(res.data.data.total_retrieved > 0, 'Expected retrieved chunks via Node chat');
    assert(res.data.data.answer === null, 'Part 11 must not return LLM answer yet');
    log('Node Chat pipeline_stage', res.data.data.pipeline_stage);
  });

  await test('T12 — No API key rejected on FastAPI query routes', async () => {
    try {
      await axios.post(`${FASTAPI_URL}/query/analyze`, { query: 'test' });
      assert(false, 'Should have thrown 403');
    } catch (err) {
      assert(err.response?.status === 403, `Expected 403, got ${err.response?.status}`);
    }
  });

  await test('T13 — Missing FAISS document returns graceful note', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/query/ask`,
      {
        document_id: '000000000000000000000000',
        query: 'What is the termination period?',
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.data.success === true, 'Endpoint should still respond');
    assert(res.data.total_retrieved === 0, 'Expected 0 chunks');
    assert(res.data.has_sufficient_context === false, 'Expected insufficient context');
    assert(
      (res.data.retrieval_note || '').toLowerCase().includes('faiss') ||
      (res.data.retrieval_note || '').toLowerCase().includes('index'),
      `Unexpected note: ${res.data.retrieval_note}`
    );
  });

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed / ${failed} failed / ${passed + failed} total`);
  console.log('══════════════════════════════════════════════════════\n');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});