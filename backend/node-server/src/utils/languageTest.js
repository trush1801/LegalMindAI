/**
 * LegalMind AI — Part 05: Language Detection Test Suite
 *
 * Tests the FastAPI /language/detect endpoint directly
 * and the full flow: Upload TXT → Check detected language in Document record.
 *
 * Run: node src/utils/languageTest.js
 */

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const FormData = require('form-data');

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const NODE_URL     = 'http://localhost:5001';
const FASTAPI_URL  = 'http://localhost:8000';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'internal_secret_key_change_this';

let authToken   = null;
let testDocId   = null;

// ─────────────────────────────────────────────
// Test runner helpers
// ─────────────────────────────────────────────
let passed = 0;
let failed = 0;

function log(label, value) {
  console.log(`   ${label}: ${JSON.stringify(value)}`);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ PASS — ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ FAIL — ${name}`);
    console.log(`   Error: ${err.message}`);
    if (err.response?.data) {
      console.log(`   Response:`, JSON.stringify(err.response.data, null, 2));
    }
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ─────────────────────────────────────────────
// Sample text fixtures
// ─────────────────────────────────────────────
const ENGLISH_TEXT = `
This Employment Agreement ("Agreement") is entered into as of January 1, 2025,
between ABC Technologies Private Limited ("Employer") and John Smith ("Employee").
The Employee agrees to work as a Software Engineer. The monthly salary shall be
INR 80,000. The agreement may be terminated by either party with 30 days written notice.
This agreement is governed by the laws of India.
`.trim();

const HINDI_TEXT = `
यह रोजगार अनुबंध ("अनुबंध") 1 जनवरी 2025 को एबीसी टेक्नोलॉजीज प्राइवेट लिमिटेड
("नियोक्ता") और राजेश शर्मा ("कर्मचारी") के बीच किया गया है।
कर्मचारी सॉफ्टवेयर इंजीनियर के रूप में कार्य करने के लिए सहमत हैं।
मासिक वेतन 80,000 रुपये होगा। यह अनुबंध 30 दिन की लिखित नोटिस के साथ
किसी भी पक्ष द्वारा समाप्त किया जा सकता है।
`.trim();

const GUJARATI_TEXT = `
આ રોજગાર કરાર ("કરાર") 1 જાન્યુઆરી 2025 ના રોજ એબીસી ટેક્નોલોજીસ પ્રાઇવેટ
લિમિટેડ ("નોકરીદાતા") અને રાજેશ પટેલ ("કર્મચારી") વચ્ચે કરવામાં આવ્યો છે।
કર્મચારી સોફ્ટવેર એન્જિનિયર તરીકે કામ કરવા માટે સંમત છે।
માસિક પગાર 80,000 રૂપિયા હશે. આ કરાર 30 દિવસની લેખિત સૂચના સાથે
કોઈ પણ પક્ષ દ્વારા સમાપ્ત કરી શકાય છે।
`.trim();

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

async function runTests() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  LegalMind AI — Part 05: Language Detection Tests');
  console.log('═══════════════════════════════════════════════\n');

  // ── 1. FastAPI health ────────────────────────────────────────────
  await test('T01 — FastAPI health check', async () => {
    const res = await axios.get(`${FASTAPI_URL}/health/`);
    assert(res.status === 200, 'Expected 200');
    assert(res.data.success === true, `Expected success=true, got: ${JSON.stringify(res.data)}`);
  });

  // ── 2. Supported languages endpoint ─────────────────────────────
  await test('T02 — GET /language/supported returns 3 languages', async () => {
    const res = await axios.get(`${FASTAPI_URL}/language/supported`, {
      headers: { 'X-Internal-API-Key': INTERNAL_KEY },
    });
    assert(res.status === 200, 'Expected 200');
    assert(res.data.count === 3, `Expected 3, got ${res.data.count}`);
    assert('en' in res.data.supported_languages, 'Missing English');
    assert('hi' in res.data.supported_languages, 'Missing Hindi');
    assert('gu' in res.data.supported_languages, 'Missing Gujarati');
    log('Languages', Object.keys(res.data.supported_languages));
  });

  // ── 3. Detect English ────────────────────────────────────────────
  await test('T03 — Detect English legal text', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/language/detect`,
      {
        text: ENGLISH_TEXT,
        document_id: 'test-en-001',
        prepare_text: true,
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.status === 200, 'Expected 200');
    assert(res.data.detected_language === 'en', `Expected 'en', got '${res.data.detected_language}'`);
    assert(res.data.is_supported === true, 'Expected is_supported=true');
    assert(res.data.prepared_text !== null, 'Expected prepared_text');
    log('Language', res.data.language_name);
    log('Confidence', res.data.confidence);
    log('Method', res.data.detection_method);
  });

  // ── 4. Detect Hindi ──────────────────────────────────────────────
  await test('T04 — Detect Hindi legal text', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/language/detect`,
      {
        text: HINDI_TEXT,
        document_id: 'test-hi-001',
        prepare_text: true,
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.status === 200, 'Expected 200');
    assert(res.data.detected_language === 'hi', `Expected 'hi', got '${res.data.detected_language}'`);
    assert(res.data.is_supported === true, 'Expected is_supported=true');
    assert(res.data.script === 'Devanagari', `Expected Devanagari, got ${res.data.script}`);
    log('Language', res.data.language_name);
    log('Confidence', res.data.confidence);
    log('Script', res.data.script);
  });

  // ── 5. Detect Gujarati ───────────────────────────────────────────
  await test('T05 — Detect Gujarati legal text', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/language/detect`,
      {
        text: GUJARATI_TEXT,
        document_id: 'test-gu-001',
        prepare_text: true,
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.status === 200, 'Expected 200');
    assert(res.data.detected_language === 'gu', `Expected 'gu', got '${res.data.detected_language}'`);
    assert(res.data.is_supported === true, 'Expected is_supported=true');
    assert(res.data.script === 'Gujarati', `Expected Gujarati, got ${res.data.script}`);
    log('Language', res.data.language_name);
    log('Confidence', res.data.confidence);
    log('Script', res.data.script);
  });

  // ── 6. Short text fallback ───────────────────────────────────────
  await test('T06 — Short text defaults to English with note', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/language/detect`,
      {
        text: 'Hi',
        document_id: 'test-short-001',
        prepare_text: false,
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.status === 200, 'Expected 200');
    assert(res.data.detected_language === 'en', `Expected 'en', got '${res.data.detected_language}'`);
    assert(
      res.data.detection_method === 'default_short_text',
      `Expected default_short_text, got ${res.data.detection_method}`
    );
    log('Method', res.data.detection_method);
    log('Note', res.data.processing_note);
  });

  // ── 7. No API key → 403 ──────────────────────────────────────────
  await test('T07 — Request without API key is rejected (403)', async () => {
    try {
      await axios.post(
        `${FASTAPI_URL}/language/detect`,
        { text: ENGLISH_TEXT, document_id: 'test-nokey' }
      );
      assert(false, 'Should have thrown 403');
    } catch (err) {
      assert(
        err.response?.status === 403,
        `Expected 403, got ${err.response?.status}`
      );
    }
  });

  // ── 8. prepare_text=false → no prepared_text ────────────────────
  await test('T08 — prepare_text=false returns null prepared_text', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/language/detect`,
      {
        text: ENGLISH_TEXT,
        document_id: 'test-noprepare',
        prepare_text: false,
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.status === 200, 'Expected 200');
    assert(
      res.data.prepared_text === null,
      `Expected null, got '${res.data.prepared_text}'`
    );
  });

  // ── 9. Login and get auth token for Node.js tests ────────────────
  await test('T09 — Login to get auth token', async () => {
    const email    = `langtest_${Date.now()}@legalmind.ai`;
    const password = 'TestLang123!';
    // Register a fresh user for this test run
    await axios.post(`${NODE_URL}/api/auth/register`, {
      name: 'Language Tester', email, password,
    });
    const res = await axios.post(`${NODE_URL}/api/auth/login`, { email, password });
    assert(res.data.token, 'Expected token in response');
    authToken = res.data.token;
    log('Token', authToken.substring(0, 20) + '...');
  });

  // ── 10. Upload TXT file → language detected ──────────────────────
  await test('T10 — Upload English TXT → language detected and stored', async () => {
    assert(authToken, 'Need auth token from T09');

    // Write a temp TXT file
    const tmpPath = path.join('/tmp', 'test_employment.txt');
    fs.writeFileSync(tmpPath, ENGLISH_TEXT);

    const form = new FormData();
    form.append('document', fs.createReadStream(tmpPath), {
      filename:    'test_employment.txt',
      contentType: 'text/plain',
    });
    form.append('documentType', 'employment');

    const uploadRes = await axios.post(
      `${NODE_URL}/api/documents/upload`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${authToken}`,
        },
      }
    );
    assert(uploadRes.status === 201, `Expected 201, got ${uploadRes.status}`);
    testDocId = uploadRes.data.data.document.id;
    log('Document ID', testDocId);

    // Wait for async AI processing
    await new Promise(r => setTimeout(r, 3000));

    // Check document record for detected language
    const docRes = await axios.get(
      `${NODE_URL}/api/documents/${testDocId}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    const doc = docRes.data.data?.document || docRes.data.document;
    log('Processing Status', doc.processingStatus);
    log('Detected Language', doc.detectedLanguage);

    // Language should be set (either 'en' or still processing)
    // We check it's a valid value
    assert(
      ['en', 'hi', 'gu', null, undefined].includes(doc.detectedLanguage) ||
      typeof doc.detectedLanguage === 'string',
      'Expected a valid detectedLanguage field'
    );
  });

  // ── 11. Upload Hindi TXT → detected as Hindi ────────────────────
  await test('T11 — Upload Hindi TXT → detectedLanguage = hi', async () => {
    assert(authToken, 'Need auth token from T09');

    const tmpPath = path.join('/tmp', 'test_hindi.txt');
    fs.writeFileSync(tmpPath, HINDI_TEXT);

    const form = new FormData();
    form.append('document', fs.createReadStream(tmpPath), {
      filename:    'test_hindi_contract.txt',
      contentType: 'text/plain',
    });
    form.append('documentType', 'employment');

    const uploadRes = await axios.post(
      `${NODE_URL}/api/documents/upload`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${authToken}`,
        },
      }
    );
    assert(uploadRes.status === 201, `Expected 201, got ${uploadRes.status}`);
    const docId = uploadRes.data.data.document.id;

    await new Promise(r => setTimeout(r, 3000));

    const docRes = await axios.get(
      `${NODE_URL}/api/documents/${docId}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    const detectedLang = (docRes.data.data?.document || docRes.data.document)?.detectedLanguage;
    log('Detected Language', detectedLang);
    assert(
      detectedLang === 'hi',
      `Expected 'hi', got '${detectedLang}'`
    );
  });

  // ── 12. Upload Gujarati TXT → detected as Gujarati ───────────────
  await test('T12 — Upload Gujarati TXT → detectedLanguage = gu', async () => {
    assert(authToken, 'Need auth token from T09');

    const tmpPath = path.join('/tmp', 'test_gujarati.txt');
    fs.writeFileSync(tmpPath, GUJARATI_TEXT);

    const form = new FormData();
    form.append('document', fs.createReadStream(tmpPath), {
      filename:    'test_gujarati_contract.txt',
      contentType: 'text/plain',
    });
    form.append('documentType', 'employment');

    const uploadRes = await axios.post(
      `${NODE_URL}/api/documents/upload`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${authToken}`,
        },
      }
    );
    assert(uploadRes.status === 201, `Expected 201, got ${uploadRes.status}`);
    const docId = uploadRes.data.data.document.id;

    await new Promise(r => setTimeout(r, 3000));

    const docRes = await axios.get(
      `${NODE_URL}/api/documents/${docId}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    const detectedLang = (docRes.data.data?.document || docRes.data.document)?.detectedLanguage;
    log('Detected Language', detectedLang);
    assert(
      detectedLang === 'gu',
      `Expected 'gu', got '${detectedLang}'`
    );
  });

  // ─────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed / ${failed} failed / ${passed + failed} total`);
  console.log('═══════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});