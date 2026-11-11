// backend/node-server/src/utils/citationValidatorTest.js
//
// Part 12D — Citation Validator
// Flow: Gemini answer → validate page/section/excerpt against evidence
//       → return | regenerate once | safe response
//
// Usage:
//   node src/utils/citationValidatorTest.js
//   node src/utils/citationValidatorTest.js <documentId>

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

const BASE_URL = 'http://localhost:5001/api';
const FASTAPI_URL = 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'internal_secret_key_change_this';

const CONTRACT = `
SOFTWARE SERVICES AGREEMENT

This Software Services Agreement is entered into as of March 1, 2026, by and between
Nimbus Analytics Pvt Ltd ("Provider") and Horizon Retail Ltd ("Client").

1. SCOPE OF SERVICES
Provider shall deliver cloud analytics dashboards, data pipeline maintenance, and monthly reporting.

2. FEES AND PAYMENT
Client shall pay an annual service fee of INR 1,800,000, billed quarterly in advance.
Late payments accrue interest at 1.5% per month.

3. TERM AND TERMINATION
The initial term is 24 months. Either party may terminate for convenience with 60 days written notice.
Provider may suspend services after 15 days of overdue payment.

4. DATA PROTECTION
Provider shall implement reasonable security controls and notify Client of a personal data breach
within 72 hours of discovery.

5. LIMITATION OF LIABILITY
Except for willful misconduct, Provider's total aggregate liability under this Agreement shall not
exceed the fees paid by Client in the twelve (12) months preceding the claim.

6. INDEMNITY
Client shall indemnify Provider against third-party claims arising from Client's unlawful use of the platform.
`.trim();

function banner(t) {
  console.log(`\n${'='.repeat(66)}\n${t}\n${'='.repeat(66)}`);
}
function pass(m, d) {
  console.log(`✅ ${m}`);
  if (d !== undefined) console.log(JSON.stringify(d, null, 2));
}
function fail(m, d) {
  console.log(`❌ ${m}`);
  if (d !== undefined) console.log(JSON.stringify(d, null, 2));
}

async function auth() {
  const email = `cite_12d_${Date.now()}@legalmind.ai`;
  const password = 'TestPass123!';
  await axios.post(`${BASE_URL}/auth/register`, {
    name: 'Citation Validator Tester',
    email,
    password,
  });
  const login = await axios.post(`${BASE_URL}/auth/login`, { email, password });
  const token = login.data.token || login.data?.data?.token || login.data?.accessToken;
  if (!token) throw new Error('No token');
  return token;
}

async function waitCompleted(token, docId, attempts = 30, delayMs = 2000) {
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
      return;
    }
    if (status === 'failed') {
      console.log('');
      throw new Error('processing failed: ' + JSON.stringify(res.data));
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  console.log('');
  throw new Error('timeout waiting for completed status');
}

async function upload(token) {
  const tmp = path.join(__dirname, `cite-12d-${Date.now()}.txt`);
  fs.writeFileSync(tmp, CONTRACT, 'utf8');
  const form = new FormData();
  form.append('document', fs.createReadStream(tmp), {
    filename: 'software-services-agreement.txt',
    contentType: 'text/plain',
  });
  form.append('documentType', 'business');
  form.append('documentSubtype', 'Service Agreement');
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
    const id = doc?.id || doc?._id;
    if (!id) throw new Error('Upload did not return document id: ' + JSON.stringify(res.data));
    return String(id);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

async function ask(docId, query) {
  const res = await axios.post(
    `${FASTAPI_URL}/query/ask`,
    { document_id: docId, query },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-API-Key': INTERNAL_API_KEY,
      },
      timeout: 90000,
    }
  );
  return res.data.data;
}

function citationsLookGrounded(citations) {
  if (!Array.isArray(citations) || citations.length === 0) return false;
  return citations.every(
    (c) =>
      c &&
      (c.excerpt || c.quote) &&
      String(c.excerpt || c.quote).length >= 12 &&
      c.page !== undefined &&
      c.section !== undefined
  );
}

async function run() {
  banner('🔎 LegalMind AI — Part 12D: Citation Validator Test');
  let failures = 0;
  const existingId = process.argv[2];

  console.log('\nSETUP');
  const token = await auth();
  pass('Authenticated');

  let docId = existingId;
  if (!docId) {
    docId = await upload(token);
    pass('Uploaded', { docId });
    console.log('Waiting for FAISS index…');
    await waitCompleted(token, docId);
    pass('Document completed');
  } else {
    pass('Reusing document', { docId });
  }

  // -----------------------------------------------------------------------
  // TEST 1 — Supported factual Q → validated citations returned
  // -----------------------------------------------------------------------
  banner('TEST 1: Supported question → citations_valid=true');
  {
    const q = 'What is the annual service fee and how is it billed?';
    const data = await ask(docId, q);
    console.log('Query:', q);
    console.log('Route:', data.route_taken);
    console.log('Evidence sufficient:', data.evidence_sufficient);
    console.log('Citations valid:', data.citations_valid);
    console.log('Validation reason:', data.citation_validation_reason);
    console.log('Support score:', data.citation_support_score);
    console.log('Regenerations:', data.regeneration_count);
    console.log('Blocked citation gate?:', data.blocked_by_citation_gate);
    console.log('\nAnswer:\n', data.final_answer);
    console.log('\nCitations:\n', JSON.stringify(data.citations, null, 2));

    const ans = String(data.final_answer || '');
    const mentionsFee =
      ans.includes('1,800,000') ||
      ans.includes('1800000') ||
      ans.toLowerCase().includes('quarter');

    if (
      data.evidence_sufficient === true &&
      data.citations_valid === true &&
      data.blocked_by_citation_gate === false &&
      data.blocked_by_evidence_gate === false &&
      mentionsFee &&
      citationsLookGrounded(data.citations)
    ) {
      pass('Answer returned with validated grounded citations');
    } else {
      fail('Expected validated grounded answer for fee question', data);
      failures += 1;
    }
  }

  // -----------------------------------------------------------------------
  // TEST 2 — Liability cap question → citations must support the number
  // -----------------------------------------------------------------------
  banner('TEST 2: Liability cap → excerpt must support answer');
  {
    const q = 'What is the limitation of liability cap for the Provider?';
    const data = await ask(docId, q);
    console.log('Answer:\n', data.final_answer);
    console.log('Citations:\n', JSON.stringify(data.citations, null, 2));
    console.log('citations_valid:', data.citations_valid, '| reason:', data.citation_validation_reason);

    const blob =
      String(data.final_answer || '') +
      ' ' +
      (data.citations || []).map((c) => c.excerpt || '').join(' ');

    const hasCap =
      blob.toLowerCase().includes('twelve') ||
      blob.includes('12 months') ||
      blob.toLowerCase().includes('fees paid');

    if (data.citations_valid === true && hasCap && citationsLookGrounded(data.citations)) {
      pass('Liability answer citations validated');
    } else {
      fail('Expected validated liability citations', data);
      failures += 1;
    }
  }

  // -----------------------------------------------------------------------
  // TEST 3 — Out-of-document → still blocked by 12B (never needs 12D)
  // -----------------------------------------------------------------------
  banner('TEST 3: Out-of-document → evidence gate (12B) blocks first');
  {
    const q = 'What is the current market price of Bitcoin in Japanese yen?';
    const data = await ask(docId, q);
    console.log('Blocked evidence?:', data.blocked_by_evidence_gate);
    console.log('Blocked citation?:', data.blocked_by_citation_gate);
    console.log('Answer:', data.final_answer);

    if (
      data.blocked_by_evidence_gate === true &&
      String(data.final_answer).toLowerCase().includes('no verifiable evidence')
    ) {
      pass('12B gate still short-circuits unsupported questions');
    } else {
      fail('Expected 12B safe refusal', data);
      failures += 1;
    }
  }

  // -----------------------------------------------------------------------
  // TEST 4 — Summary path still ends with citation validation metadata
  // -----------------------------------------------------------------------
  banner('TEST 4: Summary path includes citation validation fields');
  {
    const q = 'Summarize the key commercial terms of this software services agreement.';
    const data = await ask(docId, q);
    console.log('Route:', data.route_taken);
    console.log('citations_valid:', data.citations_valid);
    console.log('reason:', data.citation_validation_reason);
    console.log('support_score:', data.citation_support_score);
    console.log('regen:', data.regeneration_count);
    console.log('citation count:', (data.citations || []).length);
    console.log('\nAnswer preview:\n', String(data.final_answer || '').slice(0, 400));

    if (data.route_taken !== 'Summary Path') {
      fail('Expected Summary Path', data);
      failures += 1;
    } else if (data.blocked_by_evidence_gate === true) {
      fail('Summary should pass evidence gate on this fixture', data);
      failures += 1;
    } else if (data.citations_valid === true && !data.blocked_by_citation_gate) {
      pass('Summary path passed citation validator', {
        support_score: data.citation_support_score,
        regenerations: data.regeneration_count,
        citations: data.citations?.length,
      });
    } else if (data.blocked_by_citation_gate === true) {
      // Acceptable rare outcome if Gemini twice fails citation quality — must be safe text
      const safe = String(data.final_answer || '').toLowerCase().includes('could not verify reliable citations');
      if (safe) {
        pass('Summary blocked by citation gate with safe response (acceptable edge case)', {
          reason: data.citation_validation_reason,
          regenerations: data.regeneration_count,
        });
      } else {
        fail('Citation gate blocked without safe message', data);
        failures += 1;
      }
    } else {
      fail('Unexpected summary validation state', data);
      failures += 1;
    }
  }

  // -----------------------------------------------------------------------
  // TEST 5 — Direct unit-style validation via intentional weak path
  // (Unknown doc → 12B NO_CHUNKS; ensures graph still returns 12D fields)
  // -----------------------------------------------------------------------
  banner('TEST 5: Missing FAISS index → safe evidence refusal + 12D fields present');
  {
    const data = await ask('000000000000000000000000', 'What is the fee?');
    console.log('evidence_reason:', data.evidence_reason);
    console.log('citations_valid:', data.citations_valid);
    console.log('blocked_by_evidence_gate:', data.blocked_by_evidence_gate);

    if (
      data.blocked_by_evidence_gate === true &&
      Object.prototype.hasOwnProperty.call(data, 'citations_valid') &&
      Object.prototype.hasOwnProperty.call(data, 'citation_validation_reason')
    ) {
      pass('Graph returns citation validator fields even when blocked early');
    } else {
      fail('Missing citation validator fields on early exit', data);
      failures += 1;
    }
  }

  // -----------------------------------------------------------------------
  // TEST 6 — Breach notification timing (precise excerpt grounding)
  // -----------------------------------------------------------------------
  banner('TEST 6: Data breach notification window must be citation-backed');
  {
    const q = 'Within how many hours must the Provider notify the Client of a personal data breach?';
    const data = await ask(docId, q);
    console.log('Answer:\n', data.final_answer);
    console.log('Citations:\n', JSON.stringify(data.citations, null, 2));
    console.log(
      'valid?',
      data.citations_valid,
      '| support:',
      data.citation_support_score,
      '| regen:',
      data.regeneration_count
    );

    const text = (
      String(data.final_answer || '') +
      ' ' +
      (data.citations || []).map((c) => c.excerpt || '').join(' ')
    ).toLowerCase();

    if (
      data.citations_valid === true &&
      text.includes('72') &&
      citationsLookGrounded(data.citations)
    ) {
      pass('72-hour breach notice grounded + validated');
    } else {
      fail('Expected validated 72-hour citation-backed answer', data);
      failures += 1;
    }
  }

  banner(
    failures === 0
      ? '✅ PART 12D CITATION VALIDATOR TESTS COMPLETE — ALL PASSED'
      : `❌ PART 12D FINISHED WITH ${failures} FAILURE(S)`
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