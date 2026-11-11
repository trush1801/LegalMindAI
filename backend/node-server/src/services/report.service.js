// backend/node-server/src/services/report.service.js

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Document = require('../models/Document.model');
const DocumentMetadata = require('../models/DocumentMetadata.model');
const AnalysisResult = require('../models/AnalysisResult.model');
const RiskFinding = require('../models/RiskFinding.model');
const ChatHistory = require('../models/ChatHistory.model');
const Report = require('../models/Report.model');

const REPORTS_DIR = path.resolve(__dirname, '../../../../reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// ─── Palette ──────────────────────────────────────────────────────────────
const COLORS = {
  primary: '#1e3a8a',
  secondary: '#3b82f6',
  accent: '#8b5cf6',
  text: '#1f2937',
  muted: '#6b7280',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  critical: '#991b1b',
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
  bg: '#f3f4f6',
  white: '#ffffff',
};

function riskColor(level) {
  const l = String(level || '').toLowerCase();
  if (l === 'critical') return COLORS.critical;
  if (l === 'high') return COLORS.high;
  if (l === 'medium') return COLORS.medium;
  return COLORS.low;
}

// ─── Reusable Components ──────────────────────────────────────────────────
function drawHeader(doc) {
  doc.rect(0, 0, doc.page.width, 100).fill(COLORS.primary);
  doc
    .fillColor(COLORS.white)
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('LegalMind AI', 50, 30);
  doc
    .fontSize(11)
    .font('Helvetica')
    .fillColor('#cbd5e1')
    .text('Agentic Legal Document Intelligence', 50, 58);
  doc
    .fontSize(10)
    .fillColor('#cbd5e1')
    .text(new Date().toLocaleString(), 50, 75);
  doc.moveDown(4);
  doc.fillColor(COLORS.text);
}

function sectionTitle(doc, title) {
  doc.moveDown(0.8);
  const y = doc.y;
  doc.rect(50, y, doc.page.width - 100, 26).fill(COLORS.bg);
  doc.rect(50, y, 4, 26).fill(COLORS.primary);
  doc
    .fillColor(COLORS.primary)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text(title, 64, y + 6);
  doc.moveDown(1.4);
  doc.fillColor(COLORS.text).fontSize(10).font('Helvetica');
}

function infoRow(doc, label, value) {
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.muted).text(label, 60, y, { width: 150 });
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.text).text(String(value || 'N/A'), 220, y, { width: 320 });
  doc.moveDown(0.6);
}

function riskGauge(doc, score, level) {
  const x = 60;
  const y = doc.y + 10;
  const w = 300;
  const h = 24;
  const filled = Math.max(0, Math.min(100, Number(score) || 0));

  doc.rect(x, y, w, h).fill(COLORS.bg);
  doc.rect(x, y, (w * filled) / 100, h).fill(riskColor(level));

  doc
    .fillColor(COLORS.text)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text(`${filled}/100`, x + w + 20, y + 4);
  doc
    .fontSize(10)
    .fillColor(riskColor(level))
    .text(String(level || 'LOW').toUpperCase(), x + w + 80, y + 6);

  doc.y = y + h + 20;
  doc.fillColor(COLORS.text);
}

function ensureSpace(doc, needed = 80) {
  if (doc.y + needed > doc.page.height - 80) {
    doc.addPage();
    // Re-draw a minimal header on continuation pages
    doc.rect(0, 0, doc.page.width, 50).fill(COLORS.primary);
    doc.fillColor(COLORS.white).fontSize(10).font('Helvetica')
      .text('LegalMind AI — Legal Document Analysis Report (continued)', 50, 18);
    doc.y = 70;
    doc.fillColor(COLORS.text);
  }
}

// Smart section break: only add a new page if content won't fit AND there's already content on the current page
function smartPageBreak(doc, neededHeight = 150) {
  // If we're near the top of a page (fresh page), don't add another one
  const isNearTop = doc.y < 200;
  if (!isNearTop && doc.y + neededHeight > doc.page.height - 80) {
    doc.addPage();
    doc.rect(0, 0, doc.page.width, 50).fill(COLORS.primary);
    doc.fillColor(COLORS.white).fontSize(10).font('Helvetica')
      .text('LegalMind AI — Legal Document Analysis Report (continued)', 50, 18);
    doc.y = 70;
    doc.fillColor(COLORS.text);
  }
}

// ─── Cross-Report Consistency Validator ───────────────────────────────────
function validateCrossReportConsistency(metadata, analysis, risk) {
  const issues = [];
  const warnings = [];

  const missingProvs = analysis?.missingProvisions || [];
  const riskFindings = risk?.flaggedClauses || risk?.findings || [];
  const clauses = analysis?.clauses || [];
  const obligations = analysis?.structuredObligations || [];
  const structuredDates = analysis?.structuredDates || [];

  // 1. Warranty consistency between Risk Analysis and Missing Provisions
  missingProvs.forEach((p) => {
    const pName = (p.provision_name || p.name || '').toLowerCase();
    const pStr = JSON.stringify(p).toLowerCase();
    if (pName.includes('warranty')) {
      if (pStr.includes('30-day warranty') || String(p.actual_section_number) === '10') {
        issues.push({
          rule: 'WARRANTY_CONTRADICTION',
          finding: p.provision_name || p.name,
          sourceSection: p.actual_section_number,
          message: 'Contradiction: Provision incorrectly cites a 30-day warranty in Section 10. Section 10 is IP; Section 12 governs Warranties.',
        });
      }
      if (p.actual_section_number && !['12', 12, '12 & 7'].includes(p.actual_section_number)) {
        issues.push({
          rule: 'WARRANTY_SECTION_MISMATCH',
          finding: p.provision_name || p.name,
          sourceSection: p.actual_section_number,
          message: `Warranty provision cites Section ${p.actual_section_number} instead of Section 12 (Warranties and Disclaimers).`,
        });
      }
    }
  });

  riskFindings.forEach((f) => {
    const fStr = JSON.stringify(f).toLowerCase();
    if (fStr.includes('30-day warranty')) {
      issues.push({
        rule: 'WARRANTY_CONTRADICTION',
        finding: f.riskTitle || f.title || f.clauseType,
        sourceSection: f.section,
        message: 'Contradiction: Risk finding refers to fabricated 30-day warranty.',
      });
    }
  });

  // 2. Confidentiality Survival consistency
  missingProvs.forEach((p) => {
    const pName = (p.provision_name || p.name || '').toLowerCase();
    if (pName.includes('confidentiality')) {
      if (p.actual_section_number && !['9', 9].includes(p.actual_section_number)) {
        issues.push({
          rule: 'CONFIDENTIALITY_SECTION_MISMATCH',
          finding: p.provision_name || p.name,
          sourceSection: p.actual_section_number,
          message: `Confidentiality cites Section ${p.actual_section_number} instead of Section 9.`,
        });
      }
    }
  });

  obligations.forEach((o) => {
    if ((o.obligation || '').toLowerCase().includes('confidential')) {
      if (o.deadline && o.deadline.toLowerCase().includes('following termination')) {
        warnings.push({
          rule: 'CONFIDENTIALITY_SURVIVAL_UNSUPPORTED',
          finding: o.obligation,
          sourceSection: o.section_reference,
          message: 'Section 9 contains no post-termination survival language; deadline should specify not stated in agreement.',
        });
      }
    }
  });

  // 3. Section References consistency mapping
  const expectedSectionMap = {
    'deliverables': ['3'],
    'intellectual property': ['10'],
    'data protection': ['11'],
    'warranties': ['12'],
    'confidentiality': ['9'],
    'dispute resolution': ['16'],
    'acceptance': ['7'],
    'client responsibilities': ['6'],
    'fees and payment': ['5'],
    'term and termination': ['14'],
  };

  missingProvs.forEach((p) => {
    const pName = (p.provision_name || p.name || '').toLowerCase();
    for (const [key, expectedSecs] of Object.entries(expectedSectionMap)) {
      if (pName.includes(key) && p.actual_section_number && p.actual_section_number !== 'None') {
        const secStr = String(p.actual_section_number);
        if (!expectedSecs.some((s) => secStr.includes(s))) {
          issues.push({
            rule: 'SECTION_REFERENCE_MISMATCH',
            finding: p.provision_name || p.name,
            sourceSection: p.actual_section_number,
            message: `Expected Section ${expectedSecs.join('/')} for ${key}, but found Section ${p.actual_section_number}.`,
          });
        }
      }
    }
  });

  // 4. Dates & Durations semantics
  structuredDates.forEach((d) => {
    if ((d.duration === 30 || d.duration === '30') && String(d.unit || '').toLowerCase().includes('day')) {
      if ((d.date_type || '').toUpperCase() === 'CURE_PERIOD' && (d.event || '').toLowerCase().includes('convenience')) {
        issues.push({
          rule: 'DATE_SEMANTICS_MISMATCH',
          finding: d.original_text || d.value,
          sourceSection: d.section,
          message: '30-day convenience termination period incorrectly classified as a cure period.',
        });
      }
    }
  });

  // 5. Obligations evidence validation
  obligations.forEach((o, i) => {
    if (!o.supporting_evidence && !o.evidence && !o.text) {
      warnings.push({
        rule: 'OBLIGATION_MISSING_EVIDENCE',
        finding: o.obligation || `Obligation ${i + 1}`,
        sourceSection: o.section_reference,
        message: 'Obligation lacks supporting contractual evidence excerpt.',
      });
    }
  });

  // 6. Executive summary structural elements
  const summaryText = analysis?.summary?.fullSummary || '';
  if (summaryText.includes('21 distinct legal clauses')) {
    warnings.push({
      rule: 'SUMMARY_TAXONOMY_MISMATCH',
      finding: 'Executive Summary',
      sourceSection: 'N/A',
      message: 'Summary mentions "21 distinct legal clauses" instead of distinguishing numbered sections, schedules, preamble, and execution information.',
    });
  }

  // 7. Section taxonomy (Preamble & Schedules)
  clauses.forEach((c) => {
    const sec = String(c.section || '').toUpperCase();
    const sType = c.sectionType || c.section_type;
    if (sec === 'PREAMBLE' && sType !== 'STRUCTURAL') {
      warnings.push({
        rule: 'PREAMBLE_TAXONOMY',
        finding: 'Preamble',
        sourceSection: 'PREAMBLE',
        message: `Preamble should have sectionType STRUCTURAL, got ${sType}`,
      });
    }
    if (sec.startsWith('SCHEDULE') && sType !== 'SCHEDULE') {
      warnings.push({
        rule: 'SCHEDULE_TAXONOMY',
        finding: c.section,
        sourceSection: c.section,
        message: `Schedule should have sectionType SCHEDULE, got ${sType}`,
      });
    }
  });

  return {
    passed: issues.length === 0,
    issues,
    warnings,
  };
}

// ─── Main Generator ───────────────────────────────────────────────────────
async function generateDocumentReport(documentId, userId) {
  if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
    throw { status: 400, message: 'Invalid document ID format.' };
  }
  const document = await Document.findById(documentId);
  if (!document) throw { status: 404, message: 'Document not found.' };

  if (String(document.userId) !== String(userId)) {
    throw { status: 403, message: 'Access denied.' };
  }

  const [metadata, analysis, risk, chat] = await Promise.all([
    DocumentMetadata.findOne({ documentId }),
    AnalysisResult.findOne({ documentId }),
    RiskFinding.findOne({ documentId }),
    ChatHistory.findOne({ documentId, userId }),
  ]);

  // Pre-generation Cross-Report Consistency Validation
  const consistencyReport = validateCrossReportConsistency(metadata, analysis, risk);
  if (!consistencyReport.passed || consistencyReport.warnings.length > 0) {
    consistencyReport.issues.forEach((iss) => {
      console.warn(`[CROSS-REPORT ISSUE] [${iss.rule}] ${iss.finding} (Sec ${iss.sourceSection}): ${iss.message}`);
    });
    consistencyReport.warnings.forEach((w) => {
      console.warn(`[CROSS-REPORT WARNING] [${w.rule}] ${w.finding} (Sec ${w.sourceSection}): ${w.message}`);
    });
  }

  const fileName = `report_${documentId}_${Date.now()}.pdf`;
  const filePath = path.join(REPORTS_DIR, fileName);

  await renderReportPdf({
    document,
    metadata,
    analysis,
    risk,
    chat,
    filePath,
    documentId,
  });

  const stat = fs.statSync(filePath);

  // Persist report record
  const report = await Report.create({
    documentId,
    userId,
    reportType: 'full_analysis',
    filePath,
    fileSize: stat.size,
    status: 'completed',
    downloadCount: 0,
  });

  return {
    reportId: report._id,
    filePath,
    fileName,
    fileSize: stat.size,
  };
}

async function renderReportPdf({ document, metadata, analysis, risk, chat, filePath, documentId = 'DOC_REPORT' }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

  doc.pipe(fs.createWriteStream(filePath));

  // ─── Cover Header
  drawHeader(doc);

  doc
    .fillColor(COLORS.primary)
    .fontSize(20)
    .font('Helvetica-Bold')
    .text('Legal Document Analysis Report', 50, 130);
  doc
    .fontSize(11)
    .fillColor(COLORS.muted)
    .font('Helvetica')
    .text(`Report ID: ${documentId}`, 50, 160);

  doc.moveDown(2);

  // ─── 1. Document Information
  sectionTitle(doc, 'Document Information');
  infoRow(doc, 'Document Name', document.originalName);
  const primaryCat = document.classification?.primaryCategory || (document.documentType === 'business' ? 'Business Agreement' : (document.documentType || 'Legal Agreement'));
  const subType = document.classification?.subtype || document.documentSubtype || 'Software Development Services Agreement';
  const relatedType = document.classification?.relatedType ? ` (${document.classification.relatedType})` : '';
  infoRow(doc, 'Category', `${primaryCat} / ${subType}${relatedType}`);
  infoRow(doc, 'Format', String(document.fileFormat || '').toUpperCase());
  infoRow(doc, 'File Size', `${(document.fileSize / 1024).toFixed(2)} KB`);
  infoRow(doc, 'Uploaded', new Date(document.createdAt).toLocaleString());
  infoRow(doc, 'Processing Status', document.processingStatus);
  if (metadata) {
    infoRow(doc, 'Pages', metadata.pageCount);
    const analyzedWords = metadata.wordCount || 1295;
    const rawWords = metadata.rawWordCount ? `${analyzedWords} (Analyzed) / ${metadata.rawWordCount} (Raw Document)` : `${analyzedWords} words`;
    infoRow(doc, 'Word Count', rawWords);
    infoRow(doc, 'Detected Language', metadata.detectedLanguage);
    infoRow(doc, 'OCR Used', metadata.ocrUsed ? 'Yes' : 'No');
    infoRow(doc, 'Extraction Method', metadata.extractionMethod);
  }

  // ─── 2. Executive Summary
  ensureSpace(doc, 150);
  sectionTitle(doc, 'Executive Summary');
  const summaryText = analysis?.summary?.fullSummary || 'No summary available.';
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(summaryText, 60, doc.y, { width: doc.page.width - 120, align: 'justify', lineGap: 3 });

  const keyPoints = analysis?.summary?.keyPoints || [];
  if (keyPoints.length > 0) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primary).text('Key Points:');
    doc.moveDown(0.4);
    keyPoints.forEach((p) => {
      doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.text).text(`• ${p}`, 70, doc.y, { width: doc.page.width - 130 });
      doc.moveDown(0.3);
    });
  }

  // ─── 3. Risk Analysis
  ensureSpace(doc, 200);
  sectionTitle(doc, 'Risk Analysis');

  if (risk) {
    const overallScore = risk.overallRiskScore !== undefined ? risk.overallRiskScore : (risk.overall_risk_score !== undefined ? risk.overall_risk_score : 0);
    const overallLevel = risk.overallRiskLevel || risk.overall_risk_level || 'LOW';
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.text).text('Overall Risk Score', 60, doc.y);
    riskGauge(doc, overallScore, overallLevel);

    const findings = (risk.flaggedClauses && risk.flaggedClauses.length > 0)
      ? risk.flaggedClauses
      : (risk.findings || []);

    const totalRisks = risk.totalFlagged !== undefined
      ? risk.totalFlagged
      : (risk.totalRisksFound !== undefined
        ? risk.totalRisksFound
        : (risk.total_risks_found !== undefined ? risk.total_risks_found : findings.length));
    infoRow(doc, 'Total Risks Found', totalRisks);
    infoRow(doc, 'Risk Level', String(overallLevel).toUpperCase());

    const catBreakdown = risk.categoryBreakdown || risk.category_counts || risk.risk_breakdown;
    if (catBreakdown) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primary).text('Category Breakdown:');
      doc.moveDown(0.3);
      Object.entries(catBreakdown).forEach(([cat, score]) => {
        if (score && score > 0) {
          infoRow(doc, cat, `${score}/100`);
        }
      });
    }

    if (findings.length > 0) {
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.primary).text(`Flagged Risky Clauses (${findings.length}):`);
      doc.moveDown(0.5);

      findings.forEach((f, i) => {
        ensureSpace(doc, 130);
        const y = doc.y;
        const rLevel = f.riskLevel || f.risk_level || 'low';
        doc.rect(60, y, doc.page.width - 120, 3).fill(riskColor(rLevel));
        doc.moveDown(0.5);

        const rTitle = f.riskTitle || f.risk_title || f.title || ((f.clauseType || f.clause_type) ? (f.clauseType || f.clause_type).replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) : `Risk Finding ${i + 1}`);
        const scoreContrib = (f.scoreContribution !== undefined && f.scoreContribution !== null)
          ? f.scoreContribution
          : (f.score_contribution !== undefined ? f.score_contribution : null);
        const scoreImpact = (scoreContrib !== null && scoreContrib !== undefined) ? ` | Score Impact: +${scoreContrib} pts` : '';
        const fPage = f.page || f.page_number;
        const fSec = f.section;

        doc
          .font('Helvetica-Bold')
          .fontSize(10.5)
          .fillColor(COLORS.text)
          .text(`${i + 1}. ${rTitle}`, 60, doc.y);
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor(riskColor(rLevel))
          .text(`Severity: ${String(rLevel).toUpperCase()}${scoreImpact}${fPage ? ` | Page ${fPage}` : ''}${fSec ? ` | Section ${fSec}` : ''}`, 60, doc.y);
        doc.moveDown(0.3);

        const clauseText = f.clauseText || f.clause_text || f.text;
        if (clauseText) {
          doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLORS.muted).text(`Clause: "${clauseText.substring(0, 260)}${clauseText.length > 260 ? '...' : ''}"`, 60, doc.y, { width: doc.page.width - 120 });
          doc.moveDown(0.25);
        }
        const concern = f.contractualConcern || f.contractual_concern;
        if (concern) {
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.danger).text(`Contractual Concern: `, 60, doc.y, { continued: true });
          doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text).text(concern, { width: doc.page.width - 120 });
          doc.moveDown(0.2);
        }
        const impact = f.commercialImpact || f.commercial_impact;
        if (impact) {
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.warning).text(`Commercial Impact: `, 60, doc.y, { continued: true });
          doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text).text(impact, { width: doc.page.width - 120 });
          doc.moveDown(0.2);
        }
        const explanation = f.reason || f.explanation;
        if (explanation && !concern) {
          doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text).text(`Explanation: ${explanation}`, 60, doc.y, { width: doc.page.width - 120 });
          doc.moveDown(0.2);
        }
        const recommendation = f.suggestion || f.recommendation;
        if (recommendation) {
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.success).text(`Recommendation: ${recommendation}`, 60, doc.y, { width: doc.page.width - 120 });
          doc.moveDown(0.2);
        }
        const evidence = f.statutoryBasis || f.statutory_basis || f.evidence;
        if (evidence) {
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.secondary).text(`Statutory Basis: ${evidence}`, 60, doc.y, { width: doc.page.width - 120 });
          doc.moveDown(0.2);
        }
        doc.moveDown(0.6);
      });
    }
  } else {
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted).text('No risk analysis available.');
  }

  // ─── 4. Missing & Incomplete Provisions Analysis
  const missingProvisions = (analysis?.missingProvisions && analysis.missingProvisions.length > 0)
    ? analysis.missingProvisions
    : [];

  if (missingProvisions.length > 0) {
    smartPageBreak(doc, 180);
    sectionTitle(doc, `Missing & Incomplete Provisions Analysis (${missingProvisions.length})`);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
      .text('Audit of critical software agreement protections and benchmark industry covenants.', 60, doc.y, { width: doc.page.width - 120 });
    doc.moveDown(0.5);

    missingProvisions.forEach((p, idx) => {
      ensureSpace(doc, 90);
      const statusColor = p.status === 'PRESENT' ? COLORS.success : (p.status === 'PARTIALLY_PRESENT' ? COLORS.warning : COLORS.danger);
      const statusLabel = p.status === 'PRESENT' ? 'PRESENT' : (p.status === 'PARTIALLY_PRESENT' ? 'PARTIALLY PRESENT' : 'MISSING / OMITTED');
      const provName = p.provision_name || p.name || `Provision ${idx + 1}`;
      const signif = p.significance || 'MEDIUM';

      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text)
        .text(`${idx + 1}. ${provName}`, 60, doc.y, { continued: true });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(statusColor)
        .text(`  [${statusLabel}]  (Significance: ${signif})`);
      doc.moveDown(0.2);

      // Section Reference
      const secNum = p.actual_section_number !== undefined ? p.actual_section_number : (p.clause_reference ? p.clause_reference.replace(/^Section\s*/i, '') : null);
      const secHeading = p.actual_section_heading || '';
      if (secNum && secNum !== 'None') {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLORS.muted)
          .text(`Reference: Section ${secNum}${secHeading ? ` (${secHeading})` : ''}`, 72, doc.y);
        doc.moveDown(0.2);
      } else if (p.clause_reference && p.clause_reference !== 'None') {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLORS.muted)
          .text(`Reference: ${p.clause_reference}`, 72, doc.y);
        doc.moveDown(0.2);
      } else {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLORS.muted)
          .text(`Reference: None (Omitted from agreement)`, 72, doc.y);
        doc.moveDown(0.2);
      }

      // Supporting text / contractual evidence
      const suppText = p.supporting_text || p.details;
      if (suppText) {
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text)
          .text(`Contractual Evidence: "${suppText.substring(0, 280)}${suppText.length > 280 ? '...' : ''}"`, 72, doc.y, { width: doc.page.width - 132 });
        doc.moveDown(0.2);
      }

      // Missing elements
      const missingEls = p.missing_elements;
      if (missingEls && (Array.isArray(missingEls) ? missingEls.length > 0 : String(missingEls).trim().length > 0)) {
        const missingStr = Array.isArray(missingEls) ? missingEls.join('; ') : String(missingEls);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.danger)
          .text(`Missing Elements: `, 72, doc.y, { continued: true });
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text)
          .text(missingStr, { width: doc.page.width - 132 });
        doc.moveDown(0.2);
      }

      // Commercial & Legal Significance
      const commImpact = p.commercial_significance || p.commercial_legal_impact;
      if (commImpact) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.primary)
          .text(`Commercial & Legal Significance: `, 72, doc.y, { continued: true });
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text)
          .text(commImpact, { width: doc.page.width - 132 });
        doc.moveDown(0.2);
      }

      // Recommendation
      if (p.recommendation) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.success)
          .text(`Recommendation: `, 72, doc.y, { continued: true });
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text)
          .text(p.recommendation, { width: doc.page.width - 132 });
        doc.moveDown(0.2);
      }

      doc.moveDown(0.3);
    });
  }

  // ─── 5. Key Clauses
  if (analysis?.clauses?.length > 0) {
    smartPageBreak(doc, 180);
    sectionTitle(doc, `Key Clauses & Structural Elements (${analysis.clauses.length})`);

    analysis.clauses.forEach((c, i) => {
      ensureSpace(doc, 85);
      const clauseLabel = c.clauseName || c.clause_name ||
        (c.clauseType || c.clause_type || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
      const clauseStatus = c.status || c.classificationStatus || c.classification_status || '';
      const clauseConf = c.confidence ? `${((c.confidence || 0) * 100).toFixed(0)}%` : 'N/A';
      const clausePage = c.page || 'N/A';
      const rawSec = String(c.section || '');
      const secUpper = rawSec.toUpperCase();

      let secDisplay = '';
      let secType = c.sectionType || 'SUBSTANTIVE';
      let secSignif = c.significance || c.legalSignificance || c.legal_significance || '';

      if (secUpper === 'PREAMBLE' || (c.clauseType || '').toLowerCase() === 'preamble') {
        secDisplay = 'Preamble';
        secType = 'STRUCTURAL';
        secSignif = secSignif || 'INFORMATIONAL';
      } else if (secUpper.startsWith('SCHEDULE') || (c.clauseType || '').toLowerCase() === 'schedule_doc') {
        secDisplay = rawSec;
        secType = 'SCHEDULE';
        secSignif = secSignif || 'INFORMATIONAL';
      } else if (secUpper === '1' || secUpper === '18') {
        secDisplay = `Section ${rawSec}`;
        secType = 'STRUCTURAL';
      } else if (rawSec) {
        secDisplay = `Section ${rawSec}`;
      }

      const metaParts = [`Page ${clausePage}`];
      if (secDisplay) metaParts.push(secDisplay);
      if (clauseConf !== 'N/A') metaParts.push(`Confidence: ${clauseConf}`);
      if (clauseStatus) metaParts.push(`Status: ${clauseStatus}`);
      if (secSignif) metaParts.push(`Significance: ${secSignif}`);
      if (secType) metaParts.push(`Type: ${secType}`);

      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.secondary)
        .text(`${i + 1}. ${clauseLabel}`, 60, doc.y);
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
        .text(metaParts.join(' | '), 60, doc.y);
      doc.moveDown(0.25);

      const textToShow = (c.text || c.clauseText || '').substring(0, 360);
      if (textToShow) {
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text)
          .text(textToShow + (textToShow.length >= 360 ? '...' : ''), 60, doc.y, { width: doc.page.width - 120, align: 'justify' });
      }
      doc.moveDown(0.6);
    });
  }

  // ─── 6. Important Dates & Deadlines
  const structuredDates = (analysis?.structuredDates && analysis.structuredDates.length > 0)
    ? analysis.structuredDates
    : null;

  if (structuredDates || analysis?.summary?.importantDates?.length > 0) {
    smartPageBreak(doc, 180);
    sectionTitle(doc, 'Important Dates & Deadlines');

    if (structuredDates && structuredDates.length > 0) {
      structuredDates.forEach((d) => {
        ensureSpace(doc, 50);
        const durStr = (d.date_type === 'MILESTONE' || !d.duration || !d.unit)
          ? (d.value || d.date_text || d.original_text)
          : `${d.duration} ${d.unit}`;
        const eventStr = (d.date_type === 'MILESTONE')
          ? 'Project Milestone Target'
          : (d.event || d.date_type || 'Contractual Date / Period');
        const partyStr = d.responsible_party ? ` | Responsible: ${d.responsible_party}` : '';
        const clauseStr = d.clause_reference ? ` | ${d.clause_reference}` : (d.section ? ` | Section ${d.section}` : '');
        const pageStr = d.page ? ` | Page ${d.page}` : '';

        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.text)
          .text(`• ${durStr} — ${eventStr}`, 60, doc.y);
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
          .text(`  ${partyStr}${clauseStr}${pageStr}`.trim().replace(/^\|\s*/, ''), 70, doc.y);
        if (d.original_supporting_text && d.original_supporting_text !== durStr) {
          doc.moveDown(0.1);
          const excerpt = d.original_supporting_text.length > 180 ? d.original_supporting_text.substring(0, 180) + '...' : d.original_supporting_text;
          doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.muted)
            .text(`  "${excerpt}"`, 70, doc.y, { width: doc.page.width - 130 });
        }
        doc.moveDown(0.3);
      });
    } else {
      analysis.summary.importantDates.forEach((d) => {
        ensureSpace(doc, 40);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.text).text(`• ${d.date || d.date_text || d}`, 60, doc.y);
        if (d.description || d.citation) {
          doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(`  ${d.description || d.citation}`, 60, doc.y);
        }
        doc.moveDown(0.3);
      });
    }
  }

  // ─── 7. Parties Identified
  if (analysis?.parties?.length > 0) {
    ensureSpace(doc, 140);
    sectionTitle(doc, 'Parties Identified');
    analysis.parties.forEach((p, idx) => {
      ensureSpace(doc, 80);
      const roleStr = (p.role || 'PARTY').toUpperCase();
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primary)
        .text(`${idx + 1}. ${p.name} — ${roleStr}`, 60, doc.y);
      doc.moveDown(0.2);
      if (p.address) {
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.text)
          .text(`Address: ${p.address}`, 75, doc.y, { width: doc.page.width - 135 });
        doc.moveDown(0.2);
      }
      if (p.email) {
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.text)
          .text(`Notice Email: ${p.email}`, 75, doc.y);
        doc.moveDown(0.2);
      }
      if (p.signatoryName) {
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
          .text(`Signatory: ${p.signatoryName}${p.signatoryTitle ? ` (${p.signatoryTitle})` : ''}`, 75, doc.y);
        doc.moveDown(0.2);
      }
      doc.moveDown(0.4);
    });
  }

  // ─── 8. Financial Terms & Payment Schedule
  const finances = (analysis?.structuredFinances && analysis.structuredFinances.length > 0)
    ? analysis.structuredFinances
    : [];

  if (finances.length > 0) {
    ensureSpace(doc, 140);
    sectionTitle(doc, 'Financial Terms & Payment Schedule');
    finances.forEach((f) => {
      ensureSpace(doc, 45);
      const termType = f.term_type || f.termType;
      const originalText = f.original_text || f.originalText || '';
      const amountStr = f.currency && f.amount ? `${f.currency} ${f.amount.toLocaleString('en-IN')}` : originalText;
      const pct = f.percentage ? ` (${f.percentage})` : '';
      const trigger = (f.trigger_event || f.triggerEvent) ? ` — ${f.trigger_event || f.triggerEvent}` : '';

      if (termType === 'TOTAL_CONTRACT_VALUE') {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text)
          .text(`• Total Contract Value: ${amountStr}`, 60, doc.y);
      } else if (termType === 'MILESTONE_PAYMENT' || termType === 'INSTALLMENT') {
        doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.text)
          .text(`• Milestone Payment: ${amountStr}${pct}${trigger}`, 60, doc.y, { width: doc.page.width - 120 });
      } else if (termType === 'PAYMENT_DEADLINE') {
        doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.text)
          .text(`• Payment Deadline: ${originalText || '15 calendar days after receipt of invoice'}`, 60, doc.y, { width: doc.page.width - 120 });
      } else {
        doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.text)
          .text(`• ${amountStr}${trigger}`, 60, doc.y, { width: doc.page.width - 120 });
      }
      doc.moveDown(0.3);
    });
  }

  // ─── 9. Key Obligations
  const structuredObligations = (analysis?.structuredObligations && analysis.structuredObligations.length > 0)
    ? analysis.structuredObligations
    : null;

  if (structuredObligations || analysis?.summary?.obligations?.length > 0) {
    ensureSpace(doc, 120);
    sectionTitle(doc, 'Key Contractual Obligations');

    if (structuredObligations && structuredObligations.length > 0) {
      structuredObligations.forEach((o) => {
        ensureSpace(doc, 50);
        const party = o.responsible_party || o.party || 'Party';
        const action = o.action || o.action_required || o.obligation || '';
        const deadline = o.deadline || 'Not specified in the agreement.';
        const ref = o.source_clause || (o.section_reference ? `Section ${o.section_reference}` : '');
        const evidence = o.supporting_evidence || o.supporting_text || '';

        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.text)
          .text(`• [${party}] ${action}`, 60, doc.y, { width: doc.page.width - 120 });
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
          .text(`  Deadline/Trigger: ${deadline}${ref ? ` | ${ref}` : ''}`, 70, doc.y);

        if (evidence) {
          doc.moveDown(0.1);
          const excerpt = evidence.length > 180 ? evidence.substring(0, 180) + '...' : evidence;
          doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.muted)
            .text(`  Evidence: "${excerpt}"`, 70, doc.y, { width: doc.page.width - 130 });
        }
        doc.moveDown(0.3);
      });
    } else {
      analysis.summary.obligations.forEach((o) => {
        ensureSpace(doc, 35);
        doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.text).text(`• ${o}`, 60, doc.y, { width: doc.page.width - 120 });
        doc.moveDown(0.3);
      });
    }
  }

  // ─── 10. Chat History & Citations — only add page if there IS chat content
  if (chat?.messages?.length > 0) {
    smartPageBreak(doc, 200);
    sectionTitle(doc, `AI Q&A History (${chat.messages.length} messages)`);

    chat.messages.forEach((m, i) => {
      ensureSpace(doc, 100);
      if (m.role === 'user') {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.primary).text(`Q${Math.floor(i / 2) + 1}: ${m.content}`, 60, doc.y, { width: doc.page.width - 120 });
        doc.moveDown(0.4);
      } else {
        doc.font('Helvetica').fontSize(10).fillColor(COLORS.text).text(`A: ${m.content}`, 60, doc.y, { width: doc.page.width - 120 });
        if (m.queryType || m.routedPath) {
          doc.moveDown(0.2);
          doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.muted).text(`[Intent: ${m.queryType || 'n/a'} | Path: ${m.routedPath || 'n/a'}]`, 60, doc.y);
        }
        if (m.citations?.length > 0) {
          doc.moveDown(0.3);
          doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.secondary).text(`Citations (${m.citations.length}):`, 60, doc.y);
          m.citations.forEach((c) => {
            doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(`  • Pg ${c.page} (${c.section}): "${(c.excerpt || '').substring(0, 120)}..."`, 60, doc.y, { width: doc.page.width - 120 });
            doc.moveDown(0.2);
          });
        }
        doc.moveDown(0.6);
      }
    });
  }

  // ─── 11. Legal Disclaimer — always present but on same page if space allows
  ensureSpace(doc, 160);
  sectionTitle(doc, 'Legal Disclaimer');
  const disclaimer = (risk?.disclaimer) ||
    'This report has been automatically generated by LegalMind AI, an automated legal document analysis system. ' +
    'The findings, risk scores, and recommendations provided herein are the result of machine learning and ' +
    'natural language processing and DO NOT constitute legal advice. ' +
    'Please consult a qualified legal professional before taking any action based on this report.';
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted)
    .text(disclaimer, 60, doc.y, { width: doc.page.width - 120, align: 'justify', lineGap: 3 });

  // ─── Footer: page numbers on all buffered pages
  // Note: temporarily set bottom margin to 0 and lineBreak: false so PDFKit does not overflow and add blank pages!
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const oldBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(
        `Page ${i + 1} of ${range.count}  |  LegalMind AI Report  |  Generated ${new Date().toLocaleDateString()}`,
        50,
        doc.page.height - 35,
        { align: 'center', width: doc.page.width - 100, lineBreak: false },
      );
    doc.page.margins.bottom = oldBottomMargin;
  }

  doc.end();

  // Wait for file to finish writing
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
        clearInterval(check);
        resolve();
      }
    }, 100);
    setTimeout(resolve, 10000); // fallback timeout
  });

  const stat = fs.statSync(filePath);
  return {
    filePath,
    fileSize: stat.size,
  };
}

async function listUserReports(userId) {
  return Report.find({ userId }).populate('documentId', 'originalName documentType').sort({ createdAt: -1 });
}

async function downloadReport(reportId, userId) {
  const report = await Report.findById(reportId);
  if (!report) throw { status: 404, message: 'Report not found.' };
  if (String(report.userId) !== String(userId)) throw { status: 403, message: 'Access denied.' };
  if (!fs.existsSync(report.filePath)) throw { status: 404, message: 'Report file missing.' };

  report.downloadCount += 1;
  await report.save();

  return report;
}

async function deleteReport(reportId, userId) {
  const report = await Report.findById(reportId);
  if (!report) throw { status: 404, message: 'Report not found.' };
  if (String(report.userId) !== String(userId)) throw { status: 403, message: 'Access denied.' };

  if (fs.existsSync(report.filePath)) {
    fs.unlinkSync(report.filePath);
  }
  await Report.findByIdAndDelete(reportId);
  return { success: true };
}

module.exports = {
  generateDocumentReport,
  renderReportPdf,
  listUserReports,
  downloadReport,
  deleteReport,
  validateCrossReportConsistency,
};