// backend/node-server/src/utils/reportTest.js

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:5001/api';

async function run() {
  console.log('\n📄 LegalMind AI — Part 13 Phase 1: Report Backend Test\n==========================================');

  const email = `report_${Date.now()}@legalmind.ai`;
  await axios.post(`${BASE_URL}/auth/register`, { name: 'Report Tester', email, password: 'TestPass123!' });
  const login = await axios.post(`${BASE_URL}/auth/login`, { email, password: 'TestPass123!' });
  const token = login.data.token;
  const headers = { Authorization: `Bearer ${token}` };
  console.log('✅ Logged in');

  // Upload fixture
  const tmp = path.join(__dirname, `rpt-${Date.now()}.txt`);
  fs.writeFileSync(tmp, 'EMPLOYMENT AGREEMENT between Acme Corp and Jane Doe. Salary: INR 1,000,000/year. 60-day notice period. Non-compete: 12 months. Liquidated damages: INR 500,000.');

  const form = new FormData();
  form.append('document', fs.createReadStream(tmp));
  form.append('documentType', 'employment');
  form.append('documentSubtype', 'Employment Contract');
  const upload = await axios.post(`${BASE_URL}/documents/upload`, form, { headers: { ...form.getHeaders(), ...headers }, timeout: 180000 });
  const doc = upload.data?.data?.document || upload.data?.data;
  const docId = doc?.id || doc?._id;
  fs.unlinkSync(tmp);
  if (!docId) throw new Error('Upload did not return document id: ' + JSON.stringify(upload.data));
  console.log('✅ Uploaded', docId);

  // Wait for completion
  for (let i = 0; i < 30; i++) {
    const s = await axios.get(`${BASE_URL}/documents/${docId}/status`, { headers });
    process.stdout.write(`   … ${s.data.data?.processingStatus} (${i + 1}/30)\r`);
    if (s.data.data?.processingStatus === 'completed') break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('\n✅ Document completed');

  // Generate report
  console.log('\n🖨  Generating PDF report...');
  const gen = await axios.post(`${BASE_URL}/reports/generate/${docId}`, {}, { headers });
  console.log('✅ Report generated');
  console.log(JSON.stringify(gen.data.data, null, 2));

  // List
  const list = await axios.get(`${BASE_URL}/reports`, { headers });
  console.log(`\n✅ Report list (${list.data.data.total} reports)`);

  // Download
  const reportId = gen.data.data.reportId;
  const dl = await axios.get(`${BASE_URL}/reports/${reportId}/download`, { headers, responseType: 'arraybuffer' });
  const outPath = path.join(__dirname, `downloaded-report-${Date.now()}.pdf`);
  fs.writeFileSync(outPath, dl.data);
  console.log(`✅ Downloaded PDF: ${outPath} (${dl.data.length} bytes)`);

  console.log('\n==========================================\n✅ PHASE 1 COMPLETE\n');
}

run().catch((e) => {
  console.error('❌ Error:', e.response?.data || e.message);
  process.exit(1);
});