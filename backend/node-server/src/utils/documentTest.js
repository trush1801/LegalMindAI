// ============================================================
// Document Upload & Management Test
// Usage: node src/utils/documentTest.js
// Requires: Express server running (npm run dev)
// ============================================================
const axios    = require('axios');
const FormData = require('form-data');
const fs       = require('fs');
const path     = require('path');

const BASE_URL = 'http://localhost:5001/api';

const api = axios.create({
  baseURL:        BASE_URL,
  validateStatus: () => true,
});

// ── Helpers ───────────────────────────────────────────────
const log = (label, data) => {
  console.log(`\n✅ ${label}`);
  console.log(JSON.stringify(data, null, 2));
};

const logError = (label, res) => {
  console.log(`\n❌ ${label}`);
  console.log('Status:', res?.status);
  console.log('Data:',   JSON.stringify(res?.data, null, 2));
};

// ── Create test files ─────────────────────────────────────
const createTestFiles = () => {
  const testDir = path.join(__dirname, 'test_files');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

  // Valid TXT file
  const txtPath = path.join(testDir, 'test-contract.txt');
  fs.writeFileSync(txtPath,
    `EMPLOYMENT CONTRACT

This Employment Contract is entered into as of 1st January 2025,
between Acme Corporation ("Employer") and John Smith ("Employee").

1. POSITION
The Employer agrees to employ the Employee as Software Engineer.

2. COMPENSATION
The Employee shall receive a monthly salary of INR 50,000.

3. TERMINATION
Either party may terminate this agreement with 30 days written notice.

4. CONFIDENTIALITY
The Employee agrees not to disclose any confidential information
belonging to the Employer during or after employment.

5. GOVERNING LAW
This contract shall be governed by the laws of India.`
  );

  // Invalid file (simulate wrong type)
  const invalidPath = path.join(testDir, 'test-invalid.jpg');
  fs.writeFileSync(invalidPath, 'fake image content');

  return { txtPath, invalidPath, testDir };
};

// ── Cleanup test files ────────────────────────────────────
const cleanupTestFiles = (testDir) => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
};

// ── Main Test ─────────────────────────────────────────────
const runTests = async () => {
  console.log('\n⚖️  LegalMind AI — Document Upload Test');
  console.log('==========================================\n');

  const { txtPath, invalidPath, testDir } = createTestFiles();
  let token       = '';
  let userId      = '';
  let documentId  = '';

  // ── 1. Register & Login ───────────────────────────────
  console.log('SETUP: Register & Login test user');
  const regRes = await api.post('/auth/register', {
    name:     'Doc Test User',
    email:    `doctest_${Date.now()}@legalmind.ai`,
    password: 'Password123!',
  });

  if (regRes.status !== 201) {
    logError('Registration failed', regRes);
    cleanupTestFiles(testDir);
    process.exit(1);
  }

  token  = regRes.data.token;
  userId = regRes.data.user.id;
  log('User registered & logged in', { email: regRes.data.user.email });

  // ── 2. Get Document Types ──────────────────────────────
  console.log('\nTEST 1: GET /documents/types');
  const r1 = await api.get('/documents/types', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r1.status === 200) {
    log('Document types retrieved', {
      count: r1.data.data.documentTypes.length,
      types: r1.data.data.documentTypes.map((t) => t.type),
    });
  } else {
    logError('Get types failed', r1);
  }

  // ── 3. Upload valid TXT document ──────────────────────
  console.log('\nTEST 2: Upload valid TXT document');
  const form2 = new FormData();
  form2.append('document',        fs.createReadStream(txtPath), {
    filename:    'test-contract.txt',
    contentType: 'text/plain',
  });
  form2.append('documentType',    'employment');
  form2.append('documentSubtype', 'Employment Contract');

  const r2 = await api.post('/documents/upload', form2, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...form2.getHeaders(),
    },
  });

  if (r2.status === 201) {
    documentId = r2.data.data.document.id;
    log('Document uploaded', r2.data.data.document);
  } else {
    logError('Upload failed', r2);
  }

  // ── 4. Upload with invalid file type ──────────────────
  console.log('\nTEST 3: Upload invalid file type (expect 400)');
  const form3 = new FormData();
  form3.append('document', fs.createReadStream(invalidPath), {
    filename:    'test-invalid.jpg',
    contentType: 'image/jpeg',
  });

  const r3 = await api.post('/documents/upload', form3, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...form3.getHeaders(),
    },
  });

  if (r3.status === 400) {
    log('Invalid file type correctly rejected (400)', {
      error: r3.data.error,
    });
  } else {
    logError('Expected 400', r3);
  }

  // ── 5. Upload with no file ─────────────────────────────
  console.log('\nTEST 4: Upload with no file (expect 400)');
  const r4 = await api.post('/documents/upload',
    { documentType: 'employment' },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (r4.status === 400) {
    log('No file correctly rejected (400)', { error: r4.data.error });
  } else {
    logError('Expected 400', r4);
  }

  // ── 6. Upload without auth ─────────────────────────────
  console.log('\nTEST 5: Upload without token (expect 401)');
  const form5 = new FormData();
  form5.append('document', fs.createReadStream(txtPath), {
    filename:    'test.txt',
    contentType: 'text/plain',
  });
  const r5 = await api.post('/documents/upload', form5, {
    headers: form5.getHeaders(),
  });
  if (r5.status === 401) {
    log('Upload without token rejected (401)', { error: r5.data.error });
  } else {
    logError('Expected 401', r5);
  }

  // ── 7. List documents ──────────────────────────────────
  console.log('\nTEST 6: GET /documents (list)');
  const r6 = await api.get('/documents', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r6.status === 200) {
    log('Documents listed', {
      total:     r6.data.data.pagination.total,
      documents: r6.data.data.documents.map((d) => ({
        id:               d._id,
        originalName:     d.originalName,
        documentType:     d.documentType,
        processingStatus: d.processingStatus,
      })),
    });
  } else {
    logError('List failed', r6);
  }

  // ── 8. Get single document ─────────────────────────────
  if (documentId) {
    console.log('\nTEST 7: GET /documents/:id');
    const r7 = await api.get(`/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r7.status === 200) {
      log('Document retrieved', {
        id:               r7.data.data.document._id,
        originalName:     r7.data.data.document.originalName,
        processingStatus: r7.data.data.document.processingStatus,
      });
    } else {
      logError('Get document failed', r7);
    }

    // ── 9. Get document status ───────────────────────────
    console.log('\nTEST 8: GET /documents/:id/status');
    const r8 = await api.get(`/documents/${documentId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r8.status === 200) {
      log('Document status', r8.data.data);
    } else {
      logError('Get status failed', r8);
    }

    // ── 10. Invalid document type ────────────────────────
    console.log('\nTEST 9: Upload with invalid document type (expect 400)');
    const form9 = new FormData();
    form9.append('document', fs.createReadStream(txtPath), {
      filename:    'test.txt',
      contentType: 'text/plain',
    });
    form9.append('documentType', 'invalid_type_xyz');
    const r9 = await api.post('/documents/upload', form9, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...form9.getHeaders(),
      },
    });
    if (r9.status === 400) {
      log('Invalid document type rejected (400)', { error: r9.data.error });
    } else {
      logError('Expected 400 for invalid type', r9);
    }

    // ── 11. Delete document ──────────────────────────────
    console.log('\nTEST 10: DELETE /documents/:id');
    const r10 = await api.delete(`/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r10.status === 200) {
      log('Document deleted', r10.data);
    } else {
      logError('Delete failed', r10);
    }

    // ── 12. Get deleted document (expect 404) ────────────
    console.log('\nTEST 11: GET deleted document (expect 404)');
    const r11 = await api.get(`/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r11.status === 404) {
      log('Deleted document not found (404)', { error: r11.data.error });
    } else {
      logError('Expected 404', r11);
    }
  }

  // ── Cleanup ───────────────────────────────────────────
  console.log('\n🧹 Cleaning up...');
  const mongoose = require('mongoose');
  const config   = require('../config/env');
  const User     = require('../models/User.model');
  const Document = require('../models/Document.model');

  await mongoose.connect(config.MONGODB_URI);
  await Document.deleteMany({ userId });
  await User.deleteOne({ _id: userId });
  await mongoose.disconnect();

  cleanupTestFiles(testDir);
  console.log('✅ Test data & files cleaned up');

  console.log('\n==========================================');
  console.log('✅ DOCUMENT TESTS COMPLETE — PART 04 DONE');
  console.log('==========================================\n');
};

runTests().catch((err) => {
  console.error('\n❌ Unexpected error:', err.message);
  console.error(err.stack);
  process.exit(1);
});