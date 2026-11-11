/**
 * LegalMind AI — Part 09: Risk Analysis Engine Test Suite
 *
 * Tests:
 *   T01  FastAPI Health
 *   T02  Risk Router Health & Categories
 *   T03  180-Day Notice Period Example -> Flagged as Potentially Unfavorable Term
 *   T04  Immediate Termination Without Cause -> Flagged as Critical Risk
 *   T05  Unlimited Liability -> Flagged as Critical Risk
 *   T06  Post-Employment Non-Compete -> Flagged as High Risk (Sec 27)
 *   T07  Weighted Scoring Formula & Band Check
 *   T08  Evidence Citation Format ("Page 5, Section 7.2")
 *   T09  Legal Disclaimer Present
 *   T10  Full Node.js Upload Pipeline Persists Risk Findings in MongoDB
 *
 * Run:
 *   INTERNAL_API_KEY=internal_secret_key_change_this node src/utils/riskTest.js
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

async function runTests() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  LegalMind AI — Part 09: Risk Engine Tests');
  console.log('══════════════════════════════════════════════════════\n');

  // T01
  await test('T01 — FastAPI Health Check', async () => {
    const res = await axios.get(`${FASTAPI_URL}/health`);
    assert(res.data.success === true, 'Health check failed');
  });

  // T02
  await test('T02 — Risk Router Categories & Health', async () => {
    const res = await axios.get(`${FASTAPI_URL}/risk/categories`, {
      headers: { 'X-Internal-API-Key': INTERNAL_KEY },
    });
    assert(res.data.categories.length >= 10, 'Expected 10 risk categories');
    assert(res.data.disclaimer.includes('not constitute legal advice'), 'Missing disclaimer');
  });

  // T03: PROMPT EXAMPLE TEST — "The agreement may be terminated with 180 days notice."
  await test('T03 — Prompt Example: 180-Day Notice Flagged as Unfavorable Term', async () => {
    const clauses = [{
      clause_type: "termination",
      text: "The agreement may be terminated with 180 days notice by either party.",
      page: 5,
      section: "7.2"
    }];

    const res = await axios.post(
      `${FASTAPI_URL}/risk/analyze`,
      { document_id: 'example-test-180', clauses },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    const data = res.data;
    assert(data.success === true, 'Expected success=true');
    assert(data.total_risks_found >= 1, 'Expected at least 1 risk finding');

    const finding = data.findings[0];
    assert(finding.category === 'termination', `Expected category 'termination', got ${finding.category}`);
    assert(finding.risk_title.includes('Potentially Unfavorable Term'), 'Title mismatch');
    assert(finding.evidence === 'Page 5, Section 7.2', `Evidence mismatch: ${finding.evidence}`);

    log('Example Finding', {
      category: finding.category,
      risk_title: finding.risk_title,
      evidence: finding.evidence,
      score: finding.risk_score
    });
  });

  // T04
  await test('T04 — Immediate Termination Without Cause -> Critical Risk', async () => {
    const clauses = [{
      clause_type: "termination",
      text: "The Employer may terminate this Agreement immediately without cause at its sole discretion.",
      page: 2, section: "3.2"
    }];

    const res = await axios.post(
      `${FASTAPI_URL}/risk/analyze`,
      { document_id: 'test-imm-term', clauses },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    const f = res.data.findings[0];
    assert(f.risk_level === 'critical', `Expected critical, got ${f.risk_level}`);
    assert(f.risk_score === 25, `Expected score 25, got ${f.risk_score}`);
  });

  // T05
  await test('T05 — Unlimited Liability -> Critical Risk', async () => {
    const clauses = [{
      clause_type: "liability",
      text: "The Contractor shall be liable for all losses arising under this Agreement.",
      page: 4, section: "8.1"
    }];

    const res = await axios.post(
      `${FASTAPI_URL}/risk/analyze`,
      { document_id: 'test-unlim-liab', clauses },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    const f = res.data.findings[0];
    assert(f.risk_level === 'critical', `Expected critical, got ${f.risk_level}`);
  });

  // T06
  await test('T06 — Post-Employment Non-Compete -> High Risk', async () => {
    const clauses = [{
      clause_type: "non_compete",
      text: "The Employee agrees not to engage in any competing business for 2 years post-termination.",
      page: 6, section: "10.1"
    }];

    const res = await axios.post(
      `${FASTAPI_URL}/risk/analyze`,
      { document_id: 'test-nc', clauses },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    const f = res.data.findings[0];
    assert(f.risk_level === 'high', `Expected high, got ${f.risk_level}`);
    assert(f.explanation.includes('Section 27'), 'Explanation missing Section 27 reference');
  });

  // T07
  await test('T07 — Full Node.js Upload Pipeline Persists Risk Findings in MongoDB', async () => {
    // Auth
    const email = `risktest${Date.now()}@legaltest.com`;
    await axios.post(`${NODE_URL}/api/auth/register`, { name: 'Risk Tester', email, password: 'TestPassword123!' });
    const authRes = await axios.post(`${NODE_URL}/api/auth/login`, { email, password: 'TestPassword123!' });
    authToken = authRes.data.token;

    // Upload Contract with 180-day notice and immediate termination
    const tmpFile = path.join(os.tmpdir(), 'risky_contract.txt');
    fs.writeFileSync(
      tmpFile,
      'EMPLOYMENT CONTRACT\n\n' +
      '3.2 Termination\nThe agreement may be terminated with 180 days notice by either party.\n\n' +
      '4.1 Indemnity\nThe Employee agrees to indemnify and hold harmless the Employer against all losses.\n\n' +
      '5.1 Non-Compete\nThe Employee agrees not to engage in competing business for 2 years.',
      'utf8'
    );

    const form = new FormData();
    form.append('document', fs.createReadStream(tmpFile), { filename: 'risky_contract.txt', contentType: 'text/plain' });
    form.append('documentType', 'employment');

    const uploadRes = await axios.post(`${NODE_URL}/api/documents/upload`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${authToken}` },
    });
    const docId = uploadRes.data.data.document.id;

    console.log("   Waiting 8 seconds for Risk Pipeline to process...");
    await new Promise(r => setTimeout(r, 8000));

    const docRes = await axios.get(`${NODE_URL}/api/documents/${docId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const doc = docRes.data.data.document;
    log('Pipeline Stage', doc.processingStatus);
    log('Persisted Risk Findings Count', doc.riskFindings ? doc.riskFindings.length : 0);
    assert(doc.riskFindings && doc.riskFindings.length > 0, 'Risk findings were not saved to MongoDB!');
  });

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed / ${failed} failed / ${passed + failed} total`);
  console.log('══════════════════════════════════════════════════════\n');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => { console.error(err); process.exit(1); });