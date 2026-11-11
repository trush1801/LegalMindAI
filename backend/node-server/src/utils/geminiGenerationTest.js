// backend/node-server/src/utils/geminiGenerationTest.js
//
// Part 12C — Gemini Generation & Grounded Citations Test

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

const BASE_URL = 'http://localhost:5001/api';
const FASTAPI_URL = 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal_secret_key_change_this';

const TEST_CONTRACT = `
EXECUTIVE EMPLOYMENT AGREEMENT

This Agreement is entered into as of January 15, 2026, by and between Apex Global Solutions Inc. ("Company") and Robert Vance ("Executive").

1. POSITION AND RESPONSIBILITIES
Executive shall serve as Vice President of Engineering. Executive shall report directly to the Chief Technology Officer.

2. COMPENSATION AND BONUS
Company shall pay Executive a base salary of $220,000 per annum. Executive is eligible for an annual performance bonus of up to 25% of base salary.

3. VACATION AND LEAVE
Executive shall be entitled to 20 business days of paid vacation per year.

4. NOTICE PERIOD AND TERMINATION
Either party may terminate employment by delivering ninety (90) days advance written notice.
Company may terminate immediately for Cause (e.g., fraud, felony conviction).

5. NON-COMPETE AND RESTRICTIVE COVENANTS
Executive agrees not to engage in competing software business activities for eighteen (18) months following termination within North America.
Breach of this clause shall result in liquidated damages of $100,000 and forfeiture of all unvested options.

6. LIMITATION OF LIABILITY
Executive liability for operational errors is capped at $50,000 except in cases of gross negligence or willful misconduct.
`.trim();

function banner(title) {
  console.log(`\n${'='.repeat(65)}\n${title}\n${'='.repeat(65)}`);
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
  const email = `gemini_12c_${Date.now()}@legalmind.ai`;
  const password = 'TestPass123!';

  await axios.post(`${BASE_URL}/auth/register`, {
    name: 'Gemini Generation Tester',
    email,
    password,
  });

  const login = await axios.post(`${BASE_URL}/auth/login`, { email, password });
  const token = login.data.token || login.data?.data?.token || login.data?.accessToken;
  if (!token) throw new Error('No token returned from login');
  return token;
}

async function waitForCompleted(token, docId, attempts = 30, delayMs = 2000) {
  for (let i = 0; i < attempts; i++) {
    const res = await axios.get(`${BASE_URL}/documents/${docId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status = res.data?.data?.processingStatus || res.data?.data?.status || res.data?.processingStatus;
    process.stdout.write(`   … status=${status} (${i + 1}/${attempts})\r`);

    if (status === 'completed') {
      console.log('');
      return res.data.data || res.data;
    }
    if (status === 'failed') {
      console.log('');
      throw new Error('Document processing failed');
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  console.log('');
  throw new Error('Timed out waiting for document processing');
}

async function uploadFixture(token) {
  const tmp = path.join(__dirname, `gemini-12c-${Date.now()}.txt`);
  fs.writeFileSync(tmp, TEST_CONTRACT, 'utf8');

  const form = new FormData();
  form.append('document', fs.createReadStream(tmp), {
    filename: 'executive-contract.txt',
    contentType: 'text/plain',
  });
  form.append('documentType', 'employment');
  form.append('documentSubtype', 'Employment Contract');

  try {
    const res = await axios.post(`${BASE_URL}/documents/upload`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
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

async function callAskEndpoint(docId, query) {
  const res = await axios.post(
    `${FASTAPI_URL}/query/ask`,
    { document_id: docId, query },
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
  banner('🤖 LegalMind AI — Part 12C: Gemini Generation & Citations Test');

  let failures = 0;
  const existingId = process.argv[2];

  console.log('\nSETUP: Auth + document indexing');
  const token = await loginOrRegister();
  pass('Authenticated');

  let docId = existingId;
  if (!docId) {
    console.log('Uploading Executive Contract fixture…');
    docId = await uploadFixture(token);
    pass('Uploaded document', { docId });
    console.log('Waiting for pipeline & FAISS indexing…');
    await waitForCompleted(token, docId);
    pass('Indexing completed');
  } else {
    pass('Using existing document', { docId });
  }

  // -------------------------------------------------------------------------
  // TEST 1 — General Q&A -> Gemini Answer + Citations
  // -------------------------------------------------------------------------
  banner('TEST 1: General Q&A (Salary & Notice Period)');
  {
    const q = 'What is the base salary and notice period for the Executive?';
    const data = await callAskEndpoint(docId, q);

    console.log('Query:', q);
    console.log('Intent:', data.intent);
    console.log('Route:', data.route_taken);
    console.log('\n🤖 Gemini Answer:\n', data.final_answer);
    console.log('\n📜 Citations:\n', JSON.stringify(data.citations, null, 2));

    const answer = String(data.final_answer);
    const passesText = answer.includes('220,000') || answer.includes('90') || answer.includes('ninety');
    const hasCitations = Array.isArray(data.citations) && data.citations.length > 0;

    if (passesText && hasCitations && !data.blocked_by_evidence_gate) {
      pass('Gemini generated grounded answer with valid citations');
    } else {
      fail('Expected Gemini answer containing salary/notice period with citations', data);
      failures++;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 2 — Risk Path Question -> Gemini Answer + Risk Findings Integration
  // -------------------------------------------------------------------------
  banner('TEST 2: Risk Question (Non-compete penalties & liabilities)');
  {
    const q = 'What are the penalties and risks associated with breaching the non-compete clause?';
    const data = await callAskEndpoint(docId, q);

    console.log('Query:', q);
    console.log('Route:', data.route_taken);
    console.log('Risk Findings Count:', data.risk_findings_count);
    console.log('\n🤖 Gemini Answer:\n', data.final_answer);
    console.log('\n📜 Citations:\n', JSON.stringify(data.citations, null, 2));

    const answer = String(data.final_answer).toLowerCase();
    const mentionsPenalty = answer.includes('100,000') || answer.includes('liquidated damages') || answer.includes('options');

    if (data.route_taken === 'Risk Path' && mentionsPenalty && data.citations.length > 0) {
      pass('Risk path answer successfully integrated risk context and citations');
    } else {
      fail('Expected Risk Path response containing non-compete penalties', data);
      failures++;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 3 — Summary Path Question -> Gemini Summary Answer
  // -------------------------------------------------------------------------
  banner('TEST 3: Summary Question (Executive Agreement Summary)');
  {
    const q = 'Can you summarize the key terms and obligations in this agreement?';
    const data = await callAskEndpoint(docId, q);

    console.log('Query:', q);
    console.log('Route:', data.route_taken);
    console.log('\n🤖 Gemini Answer:\n', data.final_answer);

    if (data.route_taken === 'Summary Path' && data.final_answer.length > 100) {
      pass('Summary path generated comprehensive executive summary');
    } else {
      fail('Expected Summary Path comprehensive answer', data);
      failures++;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 4 — Unsupported Question -> Blocked by 12B Gate (Gemini NOT called)
  // -------------------------------------------------------------------------
  banner('TEST 4: Out-of-document Question (Expect Gate Block)');
  {
    const q = 'What is the stock ticker symbol for SpaceX and who is the CEO?';
    const data = await callAskEndpoint(docId, q);

    console.log('Query:', q);
    console.log('Blocked?:', data.blocked_by_evidence_gate);
    console.log('Answer:', data.final_answer);

    if (data.blocked_by_evidence_gate && String(data.final_answer).includes('No verifiable evidence found')) {
      pass('Unsupported query blocked by 12B evidence gate before calling Gemini');
    } else {
      fail('Expected 12B gate refusal', data);
      failures++;
    }
  }

  banner(
    failures === 0
      ? '✅ PART 12C GEMINI GENERATION TESTS COMPLETE — ALL PASSED'
      : `❌ PART 12C FINISHED WITH ${failures} FAILURE(S)`
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