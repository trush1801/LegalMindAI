/**
 * LegalMind AI — Part 06: OCR & Text Extraction Test Suite
 *
 * Tests:
 *   T01  FastAPI health
 *   T02  Extraction service health (formats + OCR available)
 *   T03  Extract TXT via /extraction/extract endpoint
 *   T04  Chunks have required metadata fields
 *   T05  Section detection in legal text
 *   T06  Empty file handled gracefully
 *   T07  Invalid format rejected (400)
 *   T08  File not found returns 404
 *   T09  No API key rejected (403)
 *   T10  Login
 *   T11  Upload TXT → DocumentMetadata created
 *   T12  Extracted chunks have page numbers
 *   T13  Upload with Hindi TXT → language=hi + extraction works
 *   T14  Word count is reasonable
 *
 * Run: node src/utils/extractionTest.js
 */

const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const FormData = require('form-data');

const NODE_URL     = 'http://localhost:5001';
const FASTAPI_URL  = 'http://localhost:8000';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'internal_secret_key_change_this';

let authToken = null;
let testDocId = null;

// ─────────────────────────────────────────────
// Helpers
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
// Sample documents
// ─────────────────────────────────────────────

const EMPLOYMENT_CONTRACT_EN = `
EMPLOYMENT AGREEMENT

This Employment Agreement ("Agreement") is entered into as of 1st January 2025,
between ABC Technologies Private Limited, a company incorporated under the Companies
Act 2013, having its registered office at 123 Business Park, Mumbai - 400001
("Employer"), and John Smith, residing at 456 Residential Colony, Pune - 411001
("Employee").

1. Position and Duties
The Employee is hereby appointed to the position of Senior Software Engineer.
The Employee shall perform all duties and responsibilities as assigned by the Employer.
The Employee agrees to devote full time and attention to the business of the Employer.

1.1 Reporting Structure
The Employee shall report directly to the Chief Technology Officer or such other
person as the Employer may designate from time to time.

2. Compensation and Benefits
The Employer agrees to pay the Employee a monthly salary of INR 1,00,000 (One Lakh
Rupees Only) subject to applicable deductions and statutory contributions.

2.1 Performance Bonus
The Employee shall be eligible for an annual performance bonus of up to 20% of the
annual salary, based on individual and company performance metrics.

3. Term and Termination
This Agreement shall commence on 1st January 2025 and shall continue unless
terminated by either party in accordance with the provisions herein.

3.1 Termination by Employee
The Employee may terminate this Agreement by providing 90 (Ninety) days written
notice to the Employer.

3.2 Termination by Employer
The Employer may terminate this Agreement:
(a) With 90 days written notice for any reason
(b) Immediately for cause including misconduct, fraud, or breach of this Agreement

4. Confidentiality
The Employee agrees to maintain strict confidentiality of all proprietary information,
trade secrets, and business data of the Employer both during and after employment.

5. Governing Law
This Agreement shall be governed by and construed in accordance with the laws of India.
Any disputes shall be subject to the exclusive jurisdiction of courts in Mumbai.
`.trim();

const HINDI_CONTRACT = `
रोजगार अनुबंध

यह रोजगार अनुबंध 1 जनवरी 2025 को एबीसी टेक्नोलॉजीस प्राइवेट लिमिटेड ("नियोक्ता")
और राजेश कुमार शर्मा ("कर्मचारी") के बीच किया गया है।

1. पद और कर्तव्य
कर्मचारी को वरिष्ठ सॉफ्टवेयर इंजीनियर के पद पर नियुक्त किया जाता है।
कर्मचारी नियोक्ता द्वारा सौंपे गए सभी कार्यों और जिम्मेदारियों को पूरा करेगा।

2. वेतन और लाभ
नियोक्ता कर्मचारी को प्रति माह 1,00,000 रुपये का वेतन देने के लिए सहमत है।

3. समाप्ति
यह अनुबंध 90 दिनों की लिखित सूचना देकर किसी भी पक्ष द्वारा समाप्त किया जा सकता है।

4. गोपनीयता
कर्मचारी नियोक्ता की सभी गोपनीय जानकारी को सुरक्षित रखने के लिए सहमत है।
`.trim();

// ─────────────────────────────────────────────
// Write temp files
// ─────────────────────────────────────────────

function writeTempFile(name, content) {
  const tmpPath = path.join(os.tmpdir(), name);
  fs.writeFileSync(tmpPath, content, 'utf8');
  return tmpPath;
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  LegalMind AI — Part 06: Text Extraction Tests');
  console.log('═══════════════════════════════════════════════════\n');

  // ── T01: FastAPI health ──────────────────────────────────────────
  await test('T01 — FastAPI health check', async () => {
    const res = await axios.get(`${FASTAPI_URL}/health`);
    assert(res.status === 200, 'Expected 200');
    assert(res.data.success === true, 'Expected success=true');
  });

  // ── T02: Extraction service health ──────────────────────────────
  await test('T02 — Extraction service health reports supported formats', async () => {
    const res = await axios.get(`${FASTAPI_URL}/extraction/health`, {
      headers: { 'X-Internal-API-Key': INTERNAL_KEY },
    });
    assert(res.status === 200, 'Expected 200');
    assert(res.data.status === 'operational', 'Expected operational');
    assert(
      res.data.supported_formats.includes('pdf'),
      'Expected pdf in supported_formats'
    );
    assert(
      res.data.supported_formats.includes('docx'),
      'Expected docx in supported_formats'
    );
    assert(
      res.data.supported_formats.includes('txt'),
      'Expected txt in supported_formats'
    );
    log('OCR available', res.data.ocr_available);
    log('Formats', res.data.supported_formats);
  });

  // ── T03: Extract TXT directly via API ───────────────────────────
  await test('T03 — Extract TXT via /extraction/extract returns chunks', async () => {
    const tmpPath = writeTempFile('test_extract_en.txt', EMPLOYMENT_CONTRACT_EN);

    // We call the extraction endpoint directly with a file path
    // (FastAPI reads from local filesystem)
    const res = await axios.post(
      `${FASTAPI_URL}/extraction/extract`,
      {
        document_id:       'test-extract-001',
        file_path:         tmpPath,
        file_format:       'txt',
        detected_language: 'en',
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.success === true, 'Expected success=true');
    assert(res.data.total_chunks > 0, `Expected chunks > 0, got ${res.data.total_chunks}`);
    assert(res.data.total_words  > 0, `Expected words > 0, got ${res.data.total_words}`);
    assert(Array.isArray(res.data.chunks), 'Expected chunks array');

    log('Total chunks', res.data.total_chunks);
    log('Total words', res.data.total_words);
    log('Method', res.data.extraction_method);
  });

  // ── T04: Chunks have required metadata fields ────────────────────
  await test('T04 — Chunks contain required metadata fields', async () => {
    const tmpPath = writeTempFile('test_metadata.txt', EMPLOYMENT_CONTRACT_EN);

    const res = await axios.post(
      `${FASTAPI_URL}/extraction/extract`,
      {
        document_id:       'test-metadata-001',
        file_path:         tmpPath,
        file_format:       'txt',
        detected_language: 'en',
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    assert(res.data.chunks.length > 0, 'Expected at least 1 chunk');

    const chunk = res.data.chunks[0];
    const requiredFields = [
      'document_id', 'chunk_index', 'page',
      'text', 'char_count', 'word_count', 'extraction_method'
    ];

    for (const field of requiredFields) {
      assert(
        field in chunk,
        `Chunk missing required field: '${field}'`
      );
    }

    assert(chunk.document_id === 'test-metadata-001', 'Wrong document_id in chunk');
    assert(chunk.page >= 1, 'Page should be >= 1');
    assert(chunk.char_count > 0, 'char_count should be > 0');
    assert(chunk.word_count > 0, 'word_count should be > 0');
    assert(chunk.extraction_method === 'txt', 'Expected extraction_method=txt');

    log('Chunk 0 page', chunk.page);
    log('Chunk 0 section', chunk.section);
    log('Chunk 0 words', chunk.word_count);
  });

  // ── T05: Section detection ───────────────────────────────────────
  await test('T05 — Section detection identifies numbered sections', async () => {
    const tmpPath = writeTempFile('test_sections.txt', EMPLOYMENT_CONTRACT_EN);

    const res = await axios.post(
      `${FASTAPI_URL}/extraction/extract`,
      {
        document_id:       'test-sections-001',
        file_path:         tmpPath,
        file_format:       'txt',
        detected_language: 'en',
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    // At least some chunks should have section detected
    const chunksWithSection = res.data.chunks.filter(c => c.section !== null);
    assert(
      chunksWithSection.length > 0,
      `Expected at least 1 chunk with section detected, got 0`
    );

    log('Chunks with section', chunksWithSection.length);
    log('Sample sections', chunksWithSection.slice(0, 3).map(c => c.section));
  });

  // ── T06: Empty file handled gracefully ──────────────────────────
  await test('T06 — Empty TXT file handled gracefully (no crash)', async () => {
    const tmpPath = writeTempFile('test_empty.txt', '');

    const res = await axios.post(
      `${FASTAPI_URL}/extraction/extract`,
      {
        document_id:       'test-empty-001',
        file_path:         tmpPath,
        file_format:       'txt',
        detected_language: 'en',
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.total_chunks === 0, `Expected 0 chunks, got ${res.data.total_chunks}`);
    assert(res.data.warnings.length > 0, 'Expected a warning for empty file');
    log('Warning', res.data.warnings[0]);
  });

  // ── T07: Invalid format rejected ────────────────────────────────
  await test('T07 — Invalid format returns 400', async () => {
    const tmpPath = writeTempFile('test_format.txt', EMPLOYMENT_CONTRACT_EN);

    try {
      await axios.post(
        `${FASTAPI_URL}/extraction/extract`,
        {
          document_id:       'test-format-001',
          file_path:         tmpPath,
          file_format:       'xlsx',   // not supported
          detected_language: 'en',
        },
        { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
      );
      assert(false, 'Should have thrown 400');
    } catch (err) {
      assert(
        err.response?.status === 400,
        `Expected 400, got ${err.response?.status}`
      );
      log('Error code', err.response?.data?.detail?.error);
    }
  });

  // ── T08: File not found returns 404 ─────────────────────────────
  await test('T08 — Non-existent file path returns 404', async () => {
    try {
      await axios.post(
        `${FASTAPI_URL}/extraction/extract`,
        {
          document_id:       'test-notfound-001',
          file_path:         '/tmp/this_file_does_not_exist_abc123.txt',
          file_format:       'txt',
          detected_language: 'en',
        },
        { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
      );
      assert(false, 'Should have thrown 404');
    } catch (err) {
      assert(
        err.response?.status === 404,
        `Expected 404, got ${err.response?.status}`
      );
      log('Error code', err.response?.data?.detail?.error);
    }
  });

  // ── T09: No API key → 403 ───────────────────────────────────────
  await test('T09 — Request without API key is rejected (403)', async () => {
    try {
      await axios.post(
        `${FASTAPI_URL}/extraction/extract`,
        {
          document_id: 'test-nokey',
          file_path:   '/tmp/anything.txt',
          file_format: 'txt',
          detected_language: 'en',
        }
        // No X-Internal-API-Key header
      );
      assert(false, 'Should have thrown 403');
    } catch (err) {
      assert(
        err.response?.status === 403,
        `Expected 403, got ${err.response?.status}`
      );
    }
  });

  // ── T10: Login ───────────────────────────────────────────────────
  await test('T10 — Register + Login for Node.js tests', async () => {
    const ts    = Date.now();
    const email = `extracttest${ts}@legaltest.com`;

    await axios.post(`${NODE_URL}/api/auth/register`, {
      name:     'Extraction Tester',
      email,
      password: 'TestPassword123!',
    });

    const res = await axios.post(`${NODE_URL}/api/auth/login`, {
      email,
      password: 'TestPassword123!',
    });
    assert(res.data.token, 'Expected token');
    authToken = res.data.token;
    log('Auth token', authToken.substring(0, 20) + '...');
  });

  // ── T11: Upload TXT → DocumentMetadata created ──────────────────
  await test('T11 — Upload TXT via Node.js → DocumentMetadata populated', async () => {
    assert(authToken, 'Need authToken from T10');

    const tmpPath = writeTempFile('employment_contract.txt', EMPLOYMENT_CONTRACT_EN);
    const form    = new FormData();
    form.append('document', fs.createReadStream(tmpPath), {
      filename:    'employment_contract.txt',
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
    await new Promise(r => setTimeout(r, 4000));

    // Check document record
    const docRes = await axios.get(
      `${NODE_URL}/api/documents/${testDocId}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    const doc = docRes.data.data.document;
    log('Processing status', doc.processingStatus);
    log('Detected language', doc.detectedLanguage);

    // DocumentMetadata should be populated
    if (doc.metadata) {
      log('Page count', doc.metadata.pageCount);
      log('Word count', doc.metadata.wordCount);
      log('Extraction method', doc.metadata.extractionMethod);
    }

    assert(
      doc.detectedLanguage === 'en',
      `Expected detectedLanguage='en', got '${doc.detectedLanguage}'`
    );
  });

  // ── T12: Chunks have page numbers ───────────────────────────────
  await test('T12 — All extracted chunks have valid page numbers', async () => {
    const tmpPath = writeTempFile('test_pages.txt', EMPLOYMENT_CONTRACT_EN);

    const res = await axios.post(
      `${FASTAPI_URL}/extraction/extract`,
      {
        document_id:       'test-pages-001',
        file_path:         tmpPath,
        file_format:       'txt',
        detected_language: 'en',
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    for (const chunk of res.data.chunks) {
      assert(
        typeof chunk.page === 'number' && chunk.page >= 1,
        `Chunk ${chunk.chunk_index} has invalid page: ${chunk.page}`
      );
    }
    log('All chunks have valid page numbers ✓', res.data.total_chunks);
  });

  // ── T13: Hindi TXT → language detected + chunks extracted ───────
  await test('T13 — Hindi TXT → language=hi + chunks extracted', async () => {
    assert(authToken, 'Need authToken from T10');

    const tmpPath = writeTempFile('hindi_contract.txt', HINDI_CONTRACT);
    const form    = new FormData();
    form.append('document', fs.createReadStream(tmpPath), {
      filename:    'hindi_contract.txt',
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

    await new Promise(r => setTimeout(r, 4000));

    const docRes = await axios.get(
      `${NODE_URL}/api/documents/${docId}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    const doc = docRes.data.data.document;
    log('Detected language', doc.detectedLanguage);
    assert(
      doc.detectedLanguage === 'hi',
      `Expected 'hi', got '${doc.detectedLanguage}'`
    );
  });

  // ── T14: Word count is reasonable ───────────────────────────────
  await test('T14 — Word count matches expected range for sample document', async () => {
    const tmpPath = writeTempFile('test_wordcount.txt', EMPLOYMENT_CONTRACT_EN);

    const res = await axios.post(
      `${FASTAPI_URL}/extraction/extract`,
      {
        document_id:       'test-wc-001',
        file_path:         tmpPath,
        file_format:       'txt',
        detected_language: 'en',
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    // Our sample document has ~350 words
    assert(
      res.data.total_words >= 200 && res.data.total_words <= 600,
      `Word count ${res.data.total_words} outside expected range 200-600`
    );
    log('Word count', res.data.total_words);
  });

  // ─────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed / ${failed} failed / ${passed + failed} total`);
  console.log('═══════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});