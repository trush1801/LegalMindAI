/**
 * LegalMind AI — Part 07: Text Preprocessing & Chunking Test Suite
 *
 * Tests:
 *   T01  FastAPI health
 *   T02  Preprocessing config endpoint
 *   T03  Clean single text (noise removal)
 *   T04  Clean text removes page numbers
 *   T05  Clean text normalizes quotes and dashes
 *   T06  Process chunks — output count is valid
 *   T07  All processed chunks have required metadata
 *   T08  Overlap is injected correctly
 *   T09  Chunks within word count bounds
 *   T10  Empty chunk list handled gracefully
 *   T11  No API key → 403
 *   T12  Login
 *   T13  Upload TXT → full pipeline (extract + preprocess)
 *   T14  Processed chunks have page + section metadata
 *   T15  Cleaning stats returned correctly
 *
 * Run:
 *   INTERNAL_API_KEY=your_key node src/utils/preprocessingTest.js
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

function writeTempFile(name, content) {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// ─────────────────────────────────────────────
// Sample data
// ─────────────────────────────────────────────

// Sample raw chunks simulating Part 06 output
// NOTE: each chunk must have >= MIN_WORDS (30) words so they are NOT merged,
// which lets T08 (overlap), T14 (section metadata) test properly.
const SAMPLE_CHUNKS = [
  {
    document_id: 'test-preprocess-001',
    chunk_index: 0,
    page: 1,
    section: '1',
    section_title: 'Parties',
    text: 'This Employment Agreement is entered into as of 1st January 2025 between ABC Technologies Private Limited, a company incorporated under the Companies Act 2013, hereinafter referred to as the Employer, and John Smith, hereinafter referred to as the Employee.',
    char_count: 255,
    word_count: 42,
    extraction_method: 'txt',
  },
  {
    document_id: 'test-preprocess-001',
    chunk_index: 1,
    page: 1,
    section: '2',
    section_title: 'Position and Duties',
    text: 'The Employee is hereby appointed to the position of Senior Software Engineer. The Employee shall perform all duties and responsibilities as assigned by the Employer from time to time. The Employee shall report directly to the Chief Technology Officer and shall adhere to all company policies.',
    char_count: 290,
    word_count: 48,
    extraction_method: 'txt',
  },
  {
    document_id: 'test-preprocess-001',
    chunk_index: 2,
    page: 2,
    section: '3',
    section_title: 'Compensation',
    text: 'The Employer agrees to pay the Employee a monthly gross salary of INR 1,00,000 subject to applicable statutory deductions. The Employee shall also be eligible for an annual performance bonus of up to twenty percent of the annual gross salary, subject to satisfactory performance review.',
    char_count: 284,
    word_count: 47,
    extraction_method: 'txt',
  },
  {
    document_id: 'test-preprocess-001',
    chunk_index: 3,
    page: 2,
    section: '4',
    section_title: 'Termination',
    text: 'This Agreement shall commence on 1st January 2025 and shall continue unless terminated by either party with ninety days written notice to the other party. The Employer reserves the right to terminate this Agreement immediately for cause, including gross misconduct or material breach of contract.',
    char_count: 291,
    word_count: 49,
    extraction_method: 'txt',
  },
];

const NOISY_TEXT = `
CONFIDENTIAL

Page 1 of 10

This Employment Agreement is entered into between the parties.

- 2 -

The Employee agrees to maintain confidentiality of all information.

___________________________________
Signature

DRAFT DRAFT DRAFT
`.trim();

const UNICODE_TEXT = `
This Agreement \u2014 entered into on \u201C1st January 2025\u201D \u2014 between
ABC Pvt. Ltd. (\u201CEmployer\u201D) and the Employee.
The monthly compensation shall be \u20B950,000 (Rupees Fifty Thousand).
`.trim();

// 650-word chunk using real sentences so the sentence splitter can find boundaries
const LARGE_SENTENCE = 'The Employee agrees to maintain the confidentiality of all proprietary information disclosed by the Employer during the term of this Agreement. ';
const LARGE_CHUNK_TEXT = LARGE_SENTENCE.repeat(Math.ceil(650 / LARGE_SENTENCE.trim().split(' ').length)).trim().split(' ').slice(0, 650).join(' ') + '.';

const EMPLOYMENT_TXT = `
EMPLOYMENT AGREEMENT

This Employment Agreement ("Agreement") is entered into as of 1st January 2025,
between ABC Technologies Private Limited ("Employer") and John Smith ("Employee").

1. Position and Duties
The Employee is hereby appointed to the position of Senior Software Engineer.
The Employee shall perform all duties and responsibilities as assigned.

1.1 Reporting Structure
The Employee shall report directly to the Chief Technology Officer.

2. Compensation and Benefits
The Employer agrees to pay the Employee a monthly salary of INR 1,00,000.

2.1 Performance Bonus
The Employee shall be eligible for an annual performance bonus of up to 20%.

3. Term and Termination
This Agreement shall commence on 1st January 2025.

3.1 Termination by Employee
The Employee may terminate this Agreement by providing 90 days written notice.

3.2 Termination by Employer
The Employer may terminate this Agreement with 90 days written notice.

4. Confidentiality
The Employee agrees to maintain strict confidentiality of all proprietary information.

5. Governing Law
This Agreement shall be governed by the laws of India.
`.trim();

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

async function runTests() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  LegalMind AI — Part 07: Text Preprocessing Tests');
  console.log('══════════════════════════════════════════════════════\n');

  // ── T01: FastAPI health ──────────────────────────────────────────
  await test('T01 — FastAPI health check', async () => {
    const res = await axios.get(`${FASTAPI_URL}/health`);
    assert(res.status === 200, 'Expected 200');
    assert(res.data.success === true, 'Expected success=true');
  });

  // ── T02: Config endpoint ─────────────────────────────────────────
  await test('T02 — Preprocessing config returns chunking parameters', async () => {
    const res = await axios.get(`${FASTAPI_URL}/preprocessing/config`, {
      headers: { 'X-Internal-API-Key': INTERNAL_KEY },
    });
    assert(res.status === 200, 'Expected 200');
    assert(res.data.target_words === 400, `Expected target=400, got ${res.data.target_words}`);
    assert(res.data.min_words    === 30,  `Expected min=30, got ${res.data.min_words}`);
    assert(res.data.max_words    === 600, `Expected max=600, got ${res.data.max_words}`);
    assert(res.data.overlap_words === 50, `Expected overlap=50, got ${res.data.overlap_words}`);
    log('Config', {
      target: res.data.target_words,
      min: res.data.min_words,
      max: res.data.max_words,
      overlap: res.data.overlap_words,
    });
  });

  // ── T03: Clean text removes noise ───────────────────────────────
  await test('T03 — Clean text removes noise (page numbers, headers)', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/preprocessing/clean-text`,
      { text: NOISY_TEXT, language_code: 'en' },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.status === 200, 'Expected 200');
    assert(res.data.chars_removed > 0, 'Expected chars to be removed');

    const cleaned = res.data.cleaned_text;
    assert(!cleaned.match(/^Page \d+ of \d+/m), 'Page number should be removed');
    assert(!cleaned.match(/^CONFIDENTIAL\s*$/m), 'CONFIDENTIAL header should be removed');
    assert(!cleaned.match(/^- \d+ -/m), 'Page divider should be removed');

    log('Original length', res.data.original_length);
    log('Cleaned length', res.data.cleaned_length);
    log('Chars removed', res.data.chars_removed);
  });

  // ── T04: Page number patterns removed ───────────────────────────
  await test('T04 — Standalone page numbers are removed', async () => {
    const textWithPageNums = "Introduction\n\n1\n\nThis is the main content.\n\n2\n\nMore content here.";
    const res = await axios.post(
      `${FASTAPI_URL}/preprocessing/clean-text`,
      { text: textWithPageNums, language_code: 'en' },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    const cleaned = res.data.cleaned_text;
    // Standalone page numbers (just "1" or "2" on own line) should be gone
    assert(cleaned.includes('Introduction'), 'Should keep Introduction');
    assert(cleaned.includes('main content'), 'Should keep main content');
    log('Cleaned', cleaned.substring(0, 100));
  });

  // ── T05: Unicode normalization ───────────────────────────────────
  await test('T05 — Unicode quotes, dashes, and currency normalized', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/preprocessing/clean-text`,
      { text: UNICODE_TEXT, language_code: 'en' },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    const cleaned = res.data.cleaned_text;

    // Em dash → hyphen
    assert(!cleaned.includes('\u2014'), 'Em dash should be normalized');
    // Smart quotes → ASCII
    assert(!cleaned.includes('\u201C'), 'Left quote should be normalized');
    assert(!cleaned.includes('\u201D'), 'Right quote should be normalized');
    // Rupee → INR
    assert(!cleaned.includes('\u20B9'), 'Rupee symbol should be normalized to INR');

    log('Cleaned text (first 150 chars)', cleaned.substring(0, 150));
  });

  // ── T06: Process chunks — valid output count ─────────────────────
  await test('T06 — Process chunks returns valid output count', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/preprocessing/process`,
      {
        document_id:   'test-preprocess-001',
        language_code: 'en',
        chunks:        SAMPLE_CHUNKS,
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.success === true, 'Expected success=true');
    assert(res.data.total_output_chunks > 0, 'Expected output chunks > 0');
    assert(res.data.total_words > 0, 'Expected total_words > 0');
    assert(Array.isArray(res.data.chunks), 'Expected chunks array');

    log('Input chunks', res.data.total_input_chunks);
    log('Output chunks', res.data.total_output_chunks);
    log('Total words', res.data.total_words);
  });

  // ── T07: Required metadata fields on all chunks ──────────────────
  await test('T07 — All processed chunks have required metadata fields', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/preprocessing/process`,
      {
        document_id:   'test-preprocess-002',
        language_code: 'en',
        chunks:        SAMPLE_CHUNKS,
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    const required = [
      'document_id', 'chunk_index', 'page', 'text',
      'char_count', 'word_count', 'extraction_method',
      'has_overlap', 'overlap_word_count', 'source_chunk_index',
    ];

    for (const chunk of res.data.chunks) {
      for (const field of required) {
        assert(field in chunk, `Chunk missing field: '${field}'`);
      }
      assert(chunk.document_id === 'test-preprocess-002', 'Wrong document_id');
      assert(chunk.page >= 1, `Invalid page: ${chunk.page}`);
      assert(chunk.word_count > 0, `word_count should be > 0`);
    }

    log('All chunks validated ✓', res.data.total_output_chunks);
  });

  // ── T08: Overlap injected ────────────────────────────────────────
  await test('T08 — Overlap is injected on chunks after the first', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/preprocessing/process`,
      {
        document_id:   'test-overlap-001',
        language_code: 'en',
        chunks:        SAMPLE_CHUNKS,
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    const chunks = res.data.chunks;
    assert(chunks.length > 1, 'Need > 1 chunk to test overlap');

    // First chunk should NOT have overlap
    assert(
      chunks[0].has_overlap === false,
      `First chunk should not have overlap, got has_overlap=${chunks[0].has_overlap}`
    );

    // At least one subsequent chunk should have overlap
    const chunksWithOverlap = chunks.slice(1).filter(c => c.has_overlap);
    assert(
      chunksWithOverlap.length > 0,
      'Expected at least one chunk after the first to have overlap'
    );

    log('Chunks with overlap', chunksWithOverlap.length);
    log('First chunk overlap', chunks[0].has_overlap);
    log('Second chunk overlap', chunks[1]?.has_overlap);
  });

  // ── T09: Chunk sizes within bounds ──────────────────────────────
  await test('T09 — All chunks are within MIN/MAX word bounds', async () => {
    // Use a large chunk to trigger splitting
    const largeChunk = {
      document_id: 'test-size-001',
      chunk_index: 0,
      page: 1,
      section: '1',
      section_title: 'Large Section',
      text: LARGE_CHUNK_TEXT,
      char_count: LARGE_CHUNK_TEXT.length,
      word_count: 650,
      extraction_method: 'txt',
    };

    const res = await axios.post(
      `${FASTAPI_URL}/preprocessing/process`,
      {
        document_id:   'test-size-001',
        language_code: 'en',
        chunks:        [largeChunk],
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    // 650-word chunk should be split into smaller chunks
    assert(
      res.data.total_output_chunks > 1,
      `Expected oversized chunk to be split, got ${res.data.total_output_chunks} chunks`
    );

    for (const chunk of res.data.chunks) {
      // Allow slight overshoot due to overlap being added
      assert(
        chunk.word_count <= 700,
        `Chunk ${chunk.chunk_index} too large: ${chunk.word_count} words`
      );
    }

    log('Input chunks', 1);
    log('Output chunks after split', res.data.total_output_chunks);
  });

  // ── T10: Empty chunk list ────────────────────────────────────────
  await test('T10 — Empty chunk list returns 400', async () => {
    try {
      await axios.post(
        `${FASTAPI_URL}/preprocessing/process`,
        {
          document_id:   'test-empty-001',
          language_code: 'en',
          chunks:        [],
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

  // ── T11: No API key → 403 ───────────────────────────────────────
  await test('T11 — Request without API key is rejected (403)', async () => {
    try {
      await axios.post(
        `${FASTAPI_URL}/preprocessing/process`,
        { document_id: 'test', language_code: 'en', chunks: SAMPLE_CHUNKS }
      );
      assert(false, 'Should have thrown 403');
    } catch (err) {
      assert(
        err.response?.status === 403,
        `Expected 403, got ${err.response?.status}`
      );
    }
  });

  // ── T12: Login ───────────────────────────────────────────────────
  await test('T12 — Register + Login for Node.js tests', async () => {
    const ts    = Date.now();
    const email = `preproctest${ts}@legaltest.com`;

    await axios.post(`${NODE_URL}/api/auth/register`, {
      name: 'Preproc Tester', email, password: 'TestPassword123!',
    });

    const res = await axios.post(`${NODE_URL}/api/auth/login`, {
      email, password: 'TestPassword123!',
    });
    assert(res.data.token, 'Expected token');
    authToken = res.data.token;
    log('Token', authToken.substring(0, 20) + '...');
  });

  // ── T13: Full pipeline upload ────────────────────────────────────
  await test('T13 — Upload TXT → full pipeline (extract + preprocess)', async () => {
    assert(authToken, 'Need authToken from T12');

    const tmpPath = writeTempFile('preproc_employment.txt', EMPLOYMENT_TXT);
    const form    = new FormData();
    form.append('document', fs.createReadStream(tmpPath), {
      filename: 'employment_contract.txt', contentType: 'text/plain',
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
    log('Document ID', docId);

    // Wait for async pipeline
    await new Promise(r => setTimeout(r, 5000));

    const docRes = await axios.get(
      `${NODE_URL}/api/documents/${docId}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );

    const doc = docRes.data.data.document;
    log('Processing status', doc.processingStatus);
    log('Detected language', doc.detectedLanguage);

    assert(
      doc.detectedLanguage === 'en',
      `Expected 'en', got '${doc.detectedLanguage}'`
    );
  });

  // ── T14: Chunks preserve page + section ─────────────────────────
  await test('T14 — Processed chunks preserve page and section metadata', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/preprocessing/process`,
      {
        document_id:   'test-meta-001',
        language_code: 'en',
        chunks:        SAMPLE_CHUNKS,
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    const chunksWithSection = res.data.chunks.filter(c => c.section !== null);
    assert(
      chunksWithSection.length > 0,
      'Expected some chunks to have section metadata'
    );

    // Verify page numbers are valid
    for (const chunk of res.data.chunks) {
      assert(chunk.page >= 1, `Invalid page: ${chunk.page}`);
    }

    log('Chunks with section', chunksWithSection.length);
    log('Sample sections', chunksWithSection.slice(0, 3).map(c => c.section));
  });

  // ── T15: Cleaning stats ──────────────────────────────────────────
  await test('T15 — Cleaning stats are returned correctly', async () => {
    const res = await axios.post(
      `${FASTAPI_URL}/preprocessing/process`,
      {
        document_id:   'test-stats-001',
        language_code: 'en',
        chunks:        SAMPLE_CHUNKS,
      },
      { headers: { 'X-Internal-API-Key': INTERNAL_KEY } }
    );

    const stats = res.data.cleaning_stats;
    assert(stats, 'Expected cleaning_stats in response');
    assert(
      typeof stats.input_chunks === 'number',
      'Expected input_chunks in stats'
    );
    assert(
      typeof stats.output_chunks === 'number',
      'Expected output_chunks in stats'
    );
    assert(
      typeof stats.avg_words_per_chunk === 'number',
      'Expected avg_words_per_chunk in stats'
    );
    assert(
      typeof stats.chunks_with_overlap === 'number',
      'Expected chunks_with_overlap in stats'
    );

    log('Cleaning stats', stats);
  });

  // ─────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed / ${failed} failed / ${passed + failed} total`);
  console.log('══════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});