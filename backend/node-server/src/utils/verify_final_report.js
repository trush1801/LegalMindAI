// backend/node-server/src/utils/verify_final_report.js
const fs = require('fs');
const path = require('path');
const { renderReportPdf, validateCrossReportConsistency } = require('../services/report.service');

async function main() {
  console.log('=== LEGALMINDAI FINAL CONSISTENCY & PDF VERIFICATION ===');

  const payloadPath = '/tmp/pipeline_payload_test.json';
  if (!fs.existsSync(payloadPath)) {
    throw new Error(`Payload file not found: ${payloadPath}`);
  }

  const data = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

  console.log('\n1. Running Cross-Report Consistency Validation...');
  const consistency = validateCrossReportConsistency(data.metadata, data.analysis, data.risk);

  console.log(`- Validation Passed: ${consistency.passed}`);
  console.log(`- Issues: ${consistency.issues.length}`);
  console.log(`- Warnings: ${consistency.warnings.length}`);

  if (consistency.issues.length > 0) {
    console.error('Critical Consistency Issues Found:');
    consistency.issues.forEach((iss, idx) => {
      console.error(`  ${idx + 1}. [${iss.rule}] Finding: ${iss.finding} (Sec: ${iss.sourceSection}): ${iss.message}`);
    });
    process.exit(1);
  }

  if (consistency.warnings.length > 0) {
    console.warn('Warnings Found:');
    consistency.warnings.forEach((w, idx) => {
      console.warn(`  ${idx + 1}. [${w.rule}] Finding: ${w.finding} (Sec: ${w.sourceSection}): ${w.message}`);
    });
  }

  console.log('\n2. Rendering Full PDF Analysis Report...');
  const outDir = path.resolve(__dirname, '../../../../reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'report_final_audit_verified.pdf');

  const res = await renderReportPdf({
    document: data.document,
    metadata: data.metadata,
    analysis: data.analysis,
    risk: data.risk,
    chat: null,
    filePath: outPath,
    documentId: '6af060de52a0718117c2d450',
  });

  console.log(`- Report rendered successfully to: ${res.filePath} (${res.fileSize} bytes)`);
  console.log('\nVerification completed with 0 errors.');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});

