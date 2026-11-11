// backend/node-server/src/verify_pipeline_and_pdf.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { runTestReport } = require('./test_report_generation');

async function main() {
  console.log('1. Extracting intelligence from Python pipeline...');
  const pythonCmd = `PYTHONPATH=/Users/trush/Desktop/LegalMindAI/ai-service /Users/trush/Desktop/LegalMindAI/ai-service/venv/bin/python -c "
import json
from app.services.extraction_service import extract_text
from app.services.preprocessing_service import preprocess_chunks
from app.services.classification_service import classify_document
from app.services.ner_service import extract_entities
from app.services.clause_service import extract_clauses, evaluate_missing_provisions
from app.services.risk_service import analyze_document_risk
from app.services.summary_service import generate_document_summary

pdf_path = '/Users/trush/Desktop/LegalMindAI/storage/6acbc333d903edb693916408/sample_software_development_services_agreement.pdf'
res = extract_text(pdf_path, 'doc_verify', 'pdf')
prep = preprocess_chunks(res.chunks, 'doc_verify')
clf = classify_document(' '.join(c.text for c in prep.chunks[:8]), 'sample_software_development_services_agreement.pdf', [c.to_dict() for c in prep.chunks])
ner = extract_entities(prep.chunks, 'doc_verify')
clauses = extract_clauses(prep.chunks, 'doc_verify', ner.entities)
risk = analyze_document_risk([c.to_dict() for c in clauses.clauses], 'doc_verify')
missing_eval = evaluate_missing_provisions([c.to_dict() for c in clauses.clauses])
summary = generate_document_summary(
    'doc_verify',
    clf.primary_category,
    [c.to_dict() for c in prep.chunks],
    ner.parties,
    ner.dates,
    ner.amounts,
    [c.to_dict() for c in clauses.clauses],
    risk.overall_risk_score,
    risk.overall_risk_level
)

payload = {
    'documentId': '6af055083294b78742a309e2',
    'document': {
        'originalName': 'sample_software_development_services_agreement.pdf',
        'fileFormat': 'pdf',
        'fileSize': 118432,
        'classification': clf.to_dict(),
    },
    'metadata': {
        'pageCount': res.total_pages,
        'wordCount': prep.total_words,
        'rawWordCount': res.raw_word_count,
        'detectedLanguage': 'en',
        'ocrUsed': False,
        'extractionMethod': res.extraction_method,
    },
    'analysis': {
        'parties': [p.to_dict() for p in ner.structured_parties],
        'structuredFinances': [f.to_dict() for f in ner.structured_finances],
        'structuredDates': [d.to_dict() for d in ner.structured_dates],
        'missingProvisions': missing_eval,
        'clauses': [
            {
                'clauseType': c.clause_type,
                'clauseName': c.clause_name,
                'clauseText': c.text,
                'page': c.page,
                'section': c.section,
                'confidence': c.confidence,
                'status': c.classification_status,
                'significance': c.legal_significance,
                'sectionType': c.section_type,
            }
            for c in clauses.clauses
        ],
        'summary': {
            'fullSummary': summary.plain_language_summary,
            'keyPoints': summary.key_points,
            'obligations': [o.get('text', '') for o in summary.obligations],
            'importantDates': [d.get('date_text', '') for d in summary.important_dates],
        }
    },
    'risk': {
        'overallRiskScore': risk.overall_risk_score,
        'overallRiskLevel': risk.overall_risk_level,
        'totalFlagged': len(risk.findings),
        'flaggedClauses': [
            {
                'clauseType': f.clause_type,
                'riskTitle': f.risk_title,
                'scoreContribution': f.score_contribution,
                'clauseText': f.clause_text,
                'riskLevel': f.risk_level,
                'riskScore': f.risk_score,
                'contractualConcern': f.contractual_concern,
                'commercialImpact': f.commercial_impact,
                'severityRationale': f.severity_rationale,
                'reason': f.explanation,
                'suggestion': f.recommendation,
                'evidence': f.evidence,
                'statutoryBasis': f.evidence,
                'page': f.page_number,
                'section': f.section,
            }
            for f in risk.findings
        ]
    }
}
print(json.dumps(payload))
"`;

  const output = execSync(pythonCmd, { maxBuffer: 10 * 1024 * 1024 }).toString();
  // Filter out any PyMuPDF deprecation warning from stdout
  const jsonStart = output.indexOf('{');
  const payload = JSON.parse(output.substring(jsonStart));

  console.log(`✓ Python extraction complete!`);
  console.log(`  - Classification: ${payload.document.classification.primary_category} / ${payload.document.classification.subtype}`);
  console.log(`  - Parties found: ${payload.analysis.parties.length}`);
  console.log(`  - Finances found: ${payload.analysis.structuredFinances.length}`);
  console.log(`  - Clauses extracted: ${payload.analysis.clauses.length}`);
  console.log(`  - Risks flagged: ${payload.risk.totalFlagged} (Score: ${payload.risk.overallRiskScore})`);

  console.log('\n2. Generating PDF report using PDFKit...');
  const outPdf = path.resolve(__dirname, '../../../reports/verified_sample_report.pdf');
  const totalPages = await runTestReport(payload, outPdf);
  console.log(`✓ PDF Report generated: ${outPdf}`);
  console.log(`  - Total buffered pages: ${totalPages}`);

  console.log('\n3. Inspecting generated PDF with PyMuPDF to verify no blank pages and content integrity...');
  const inspectCmd = `PYTHONPATH=/Users/trush/Desktop/LegalMindAI/ai-service /Users/trush/Desktop/LegalMindAI/ai-service/venv/bin/python -c "
import fitz

doc = fitz.open('${outPdf}')
print('Total pages in file:', len(doc))
for i, page in enumerate(doc):
    text = page.get_text().strip()
    lines = [l for l in text.splitlines() if l.strip()]
    is_blank = len(lines) <= 2
    print(f'Page {i+1}: {len(lines)} lines | Words: {len(text.split())} | Blank: {is_blank}')
    if is_blank:
        print(f'  WARNING: Page {i+1} appears blank! Text: {text!r}')

assert not any(len([l for l in p.get_text().strip().splitlines() if l.strip()]) <= 2 for p in doc), 'Found blank pages!'
print('ALL PAGES CONTAIN LEGITIMATE REPORT CONTENT! ZERO BLANK PAGES FOUND!')
"`;

  const inspectOut = execSync(inspectCmd).toString();
  console.log(inspectOut);
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
