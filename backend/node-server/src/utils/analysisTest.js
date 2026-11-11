/**
 * LegalMind AI — Part 08: NER + Legal-BERT Clause Analysis Test Suite
 *
 * Run:
 *   INTERNAL_API_KEY=your_key node src/utils/analysisTest.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');

const NODE_URL    = 'http://localhost:5001';
const FASTAPI_URL = 'http://localhost:8000';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'your-internal-api-key';

let authToken = null;
let passed = 0;
let failed = 0;

function log(l, v) { console.log(`   ${l}: ${JSON.stringify(v)}`); }
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

const EMPLOYMENT_CHUNKS = [
  {
    document_id: 'test-analysis-001', chunk_index: 0, page: 1,
    section: null, section_title: null,
    text: 'EMPLOYMENT AGREEMENT\n\nThis Employment Agreement ("Agreement") is entered into as of 1st January 2025, between ABC Technologies Private Limited ("Employer") and John Smith ("Employee").',
    char_count: 200, word_count: 30, extraction_method: 'txt',
  },
  {
    document_id: 'test-analysis-001', chunk_index: 1, page: 1,
    section: '1', section_title: 'Position and Duties',
    text: '1. Position and Duties\n\nThe Employee is hereby appointed to the position of Senior Software Engineer. The Employee shall perform all duties and responsibilities as assigned by the Employer.',
    char_count: 280, word_count: 48, extraction_method: 'txt',
  },
  {
    document_id: 'test-analysis-001', chunk_index: 2, page: 2,
    section: '2', section_title: 'Compensation and Benefits',
    text: '2. Compensation and Benefits\n\nThe Employer agrees to pay the Employee a monthly salary of INR 1,00,000 (One Lakh Rupees Only) subject to applicable deductions.',
    char_count: 300, word_count: 52, extraction_method: 'txt',
  },
  {
    document_id: 'test-analysis-001', chunk_index: 3, page: 2,
    section: '3', section_title: 'Term and Termination',
    text: '3. Term and Termination\n\nThis Agreement shall commence on 1st January 2025 and shall continue unless terminated by either party with 90 days written notice.',
    char_count: 180, word_count: 30, extraction_method: 'txt',
  },
  {
    document_id: 'test-analysis-001', chunk_index: 4, page: 3,
    section: '4', section_title: 'Confidentiality',
    text: '4. Confidentiality\n\nThe Employee agrees to maintain strict confidentiality of all proprietary information, trade secrets, and business data of the Employer.',
    char_count: 280, word_count: 45, extraction_method: 'txt',
  },
];

async function runTests() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  LegalMind AI — Part 08: NER + Legal-BERT Tests');
  console.log('══════════════════════════════════════════════════════\n');

  await test('T01 — FastAPI health check', async () => {
    const res = await axios.get(`${FASTAPI_URL}/health`);
    assert(res.status === 200 && res.data.success === true, 'Health failed');
  });

  await test('T02 — Analysis health check', async () => {
    const res = await axios.get(`${FASTAPI_URL}/analysis/health`, {
      headers: { 'X-Internal-API-Key': INTERNAL_KEY },
    });
    assert(res.data.status === 'operational', 'Expected operational');
  });

  await test('T03 — Full Analysis endpoint runs NER + Clauses', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/analysis/full`,
      { document_id: 'test-analysis-001', language_code: 'en', chunks: EMPLOYMENT_CHUNKS, use_legal_bert: true },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.data.success === true, 'Expected success=true');
    assert(res.data.total_entities > 0, 'Expected total_entities > 0');
    assert(res.data.total_clauses > 0, 'Expected total_clauses > 0');
    assert(res.data.parties.length >= 1, 'Expected at least 1 party');
    log('Parties', res.data.parties);
    log('Clause types detected', res.data.clauses_by_type);
  });

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed / ${failed} failed / ${passed + failed} total`);
  console.log('══════════════════════════════════════════════════════\n');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => { console.error(err); process.exit(1); });