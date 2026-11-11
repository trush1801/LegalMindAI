// backend/node-server/src/utils/evidenceCheckerTest.js
//
// Part 12B — Evidence Checker verification
// Requires: Express :5001, FastAPI :8000, MongoDB, and a COMPLETED document with FAISS index.
//
// Usage:
//   node src/utils/evidenceCheckerTest.js
//   node src/utils/evidenceCheckerTest.js <documentId>   // optional: reuse an existing completed doc

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

const BASE_URL = 'http://localhost:5001/api';
const FASTAPI_URL = 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal_secret_key_change_this';

const CONTRACT_TEXT = `
EMPLOYMENT AGREEMENT

This Employment Agreement is entered into between Acme Corp ("Employer") and Jane Smith ("Employee").

1. POSITION AND DUTIES
Employee shall serve as Senior Software Engineer and perform duties as assigned by the Employer.

2. COMPENSATION
Employee shall receive an annual salary of INR 1,200,000 payable monthly.

3. LEAVE
Employee is entitled to 25 days of paid leave per calendar year.

4. TERMINATION
Either party may terminate this agreement by providing sixty (60) days written notice.
Immediate termination is permitted in cases of gross misconduct.

5. NON-COMPETE
Employee shall not compete with Employer for a period of 12 months following termination
within the territory of India. Breach of this clause may result in liquidated damages
of INR 500,000 and injunctive relief.

6. LIABILITY
Employee's liability for damages arising from ordinary negligence is limited to 3 months' salary.
Employer retains unlimited liability for statutory obligations.

7. CONFIDENTIALITY
Employee shall maintain confidentiality of all proprietary information during employment
and for 3 years thereafter.
`.trim();

function banner(title) {
  console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`);
}

function pass(msg, data) {
  console.log(`✅ ${msg}`);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

function fail(msg, data) {
  console.log(`❌ ${msg}`);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

async function loginOrRegister() {
  const email = `evidence_12b_${Date.now()}@legalmind.ai`;
  const password = 'TestPass123!';

  await axios.post(`${BASE_URL}/auth/register`, {
    name: 'Evidence Checker Tester',
    email,
    password,
  });

  const login = await axios.post(`${BASE_URL}/auth/login`, { email, password });
  // Support both token shapes used across parts
  const token =
    login.data.token ||
    login.data?.data?.token ||
    login.data?.accessToken;

  if (!token) throw new Error('No token returned from login');
  return token;
}

async function waitForCompleted(token, docId, attempts = 30, delayMs = 2000) {
  for (let i = 0; i < attempts; i++) {
    const res = await axios.get(`${BASE_URL}/documents/${docId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status =
      res.data?.data?.processingStatus ||
      res.data?.data?.status ||
      res.data?.processingStatus;

    process.stdout.write(`   … status=${status} (${i + 1}/${attempts})\r`);

    if (status === 'completed') {
      console.log('');
      return res.data.data || res.data;
    }
    if (status === 'failed') {
      console.log('');
      throw new Error('Document processing failed: ' + JSON.stringify(res.data));
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  console.log('');
  throw new Error('Timed out waiting for document processing');
}

async function uploadFixture(token) {
  const tmp = path.join(__dirname, `evidence-12b-${Date.now()}.txt`);
  fs.writeFileSync(tmp, CONTRACT_TEXT, 'utf8');

  const form = new FormData();
  form.append('document', fs.createReadStream(tmp), {
    filename: 'employment-evidence-test.txt',
    contentType: 'text/plain',
  });
  form.append('documentType', 'employment');
  form.append('documentSubtype', 'Employment Contract');

  try {
    const res = await axios.post(`${BASE_URL}/documents/upload`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 180000,
    });

    const doc =
      res.data?.data?.document ||
      res.data?.data ||
      res.data?.document ||
      res.data;
    const id = doc.id || doc._id;
    if (!id) throw new Error('Upload did not return document id: ' + JSON.stringify(res.data));
    return String(id);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

async function callGraph(documentId, query) {
  const res = await axios.post(
    `${FASTAPI_URL}/query/router-test`,
    { document_id: documentId, query },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-API-Key': INTERNAL_API_KEY,
      },
      timeout: 60000,
    }
  );
  return res.data.data;
}

async function run() {
  banner('🛡️  LegalMind AI — Part 12B: Evidence Checker Test');

  let failures = 0;
  const existingId = process.argv[2];

  // --- Setup ---
  console.log('\nSETUP: Auth + document with FAISS index');
  const token = await loginOrRegister();
  pass('Authenticated');

  let docId = existingId;
  if (!docId) {
    console.log('Uploading fixture contract (full pipeline must complete)…');
    docId = await uploadFixture(token);
    pass('Uploaded', { documentId: docId });
    console.log('Waiting for processing + FAISS index…');
    await waitForCompleted(token, docId);
    pass('Document processing completed');
  } else {
    pass('Reusing existing document', { documentId: docId });
  }

  // -------------------------------------------------------------------------
  // TEST 1 — Supported question → evidence SUFFICIENT → Gemini stub
  // -------------------------------------------------------------------------
  banner('TEST 1: Supported question (expect evidence_sufficient=true)');
  {
    const q = 'How many days of paid leave does the employee get?';
    const data = await callGraph(docId, q);
    console.log('Query:', q);
    console.log('Intent:', data.intent);
    console.log('Route:', data.route_taken);
    console.log('Evidence reason:', data.evidence_reason);
    console.log('Top score:', data.evidence_top_score);
    console.log('Passing chunks:', data.evidence_passing_chunks);
    console.log('Blocked?:', data.blocked_by_evidence_gate);
    console.log('Answer:', data.final_answer);

    if (
      data.evidence_sufficient === true &&
      data.blocked_by_evidence_gate === false &&
      data.evidence_passing_chunks >= 1 &&
      typeof data.final_answer === 'string' &&
      data.final_answer.includes('STUB 12C')
    ) {
      pass('Evidence gate PASSED — would proceed to Gemini');
    } else {
      fail('Expected sufficient evidence + Gemini stub', data);
      failures += 1;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 2 — Unsupported / irrelevant question → SAFE response
  // -------------------------------------------------------------------------
  banner('TEST 2: Unsupported question (expect safe refusal)');
  {
    const q =
      'What is the airspeed velocity of an unladen swallow under maritime law in Antarctica?';
    const data = await callGraph(docId, q);
    console.log('Query:', q);
    console.log('Intent:', data.intent);
    console.log('Route:', data.route_taken);
    console.log('Evidence reason:', data.evidence_reason);
    console.log('Top score:', data.evidence_top_score);
    console.log('Blocked?:', data.blocked_by_evidence_gate);
    console.log('Answer:', data.final_answer);

    const safe =
      typeof data.final_answer === 'string' &&
      data.final_answer.toLowerCase().includes('no verifiable evidence');

    if (
      data.evidence_sufficient === false &&
      data.blocked_by_evidence_gate === true &&
      safe &&
      !String(data.final_answer).includes('STUB 12C')
    ) {
      pass('Evidence gate BLOCKED Gemini — safe response returned');
    } else {
      fail('Expected insufficient evidence + safe response', data);
      failures += 1;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 3 — Risk path still goes through evidence checker
  // -------------------------------------------------------------------------
  banner('TEST 3: Risk path + supported liability question');
  {
    const q = 'What are the liabilities and penalties for breaching non-compete?';
    const data = await callGraph(docId, q);
    console.log('Query:', q);
    console.log('Intent:', data.intent);
    console.log('Route:', data.route_taken);
    console.log('Evidence sufficient:', data.evidence_sufficient);
    console.log('Reason:', data.evidence_reason);
    console.log('Answer preview:', String(data.final_answer).slice(0, 160));

    if (data.route_taken !== 'Risk Path') {
      fail('Expected Risk Path routing', data);
      failures += 1;
    } else if (data.evidence_sufficient !== true) {
      // Risk wording exists in fixture — should usually pass. Soft-warn if borderline.
      fail('Expected sufficient evidence on risk question for fixture contract', data);
      failures += 1;
    } else {
      pass('Risk path retrieved evidence and passed the gate');
    }
  }

  // -------------------------------------------------------------------------
  // TEST 4 — Missing / fake document id → safe refusal (no crash)
  // -------------------------------------------------------------------------
  banner('TEST 4: Unknown document id (expect safe refusal, no 500)');
  {
    const data = await callGraph('000000000000000000000000', 'What is the salary?');
    console.log('Evidence reason:', data.evidence_reason);
    console.log('Blocked?:', data.blocked_by_evidence_gate);
    console.log('Answer:', data.final_answer);

    if (
      data.evidence_sufficient === false &&
      data.blocked_by_evidence_gate === true &&
      String(data.final_answer).toLowerCase().includes('no verifiable evidence')
    ) {
      pass('Missing index handled safely');
    } else {
      fail('Expected safe handling for missing FAISS index', data);
      failures += 1;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 5 — Summary path routing still works with gate
  // -------------------------------------------------------------------------
  banner('TEST 5: Summary path routing');
  {
    const q = 'Can you summarize the key points of this employment agreement?';
    const data = await callGraph(docId, q);
    console.log('Intent:', data.intent, '| Route:', data.route_taken);
    console.log('Sufficient:', data.evidence_sufficient, '| Reason:', data.evidence_reason);

    if (data.route_taken !== 'Summary Path') {
      fail('Expected Summary Path', data);
      failures += 1;
    } else {
      pass('Summary path hit evidence checker', {
        evidence_sufficient: data.evidence_sufficient,
        blocked: data.blocked_by_evidence_gate,
      });
    }
  }

  banner(
    failures === 0
      ? '✅ PART 12B EVIDENCE CHECKER TESTS COMPLETE — ALL PASSED'
      : `❌ PART 12B FINISHED WITH ${failures} FAILURE(S)`
  );

  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('\n💥 Test runner crashed:');
  if (err.response) {
    console.error('Status:', err.response.status);
    console.error(JSON.stringify(err.response.data, null, 2));
  } else {
    console.error(err.message);
  }
  process.exit(1);
});