// backend/node-server/src/test_report_generation.js

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.resolve(__dirname, '../../../reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

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
    doc.rect(0, 0, doc.page.width, 50).fill(COLORS.primary);
    doc.fillColor(COLORS.white).fontSize(10).font('Helvetica')
      .text('LegalMind AI — Legal Document Analysis Report (continued)', 50, 18);
    doc.y = 70;
    doc.fillColor(COLORS.text);
  }
}

function smartPageBreak(doc, neededHeight = 150) {
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

async function runTestReport(data, outputPath) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

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
    .text(`Report ID: ${data.documentId}`, 50, 160);

  doc.moveDown(2);

  // ─── 1. Document Information
  sectionTitle(doc, 'Document Information');
  infoRow(doc, 'Document Name', data.document.originalName);
  const primaryCat = data.document.classification?.primary_category || data.document.classification?.primaryCategory || 'Business Agreement';
  const subType = data.document.classification?.subtype || 'Software Development Services Agreement';
  const relatedType = data.document.classification?.related_type || data.document.classification?.relatedType ? ` (${data.document.classification.related_type || data.document.classification.relatedType})` : '';
  infoRow(doc, 'Category', `${primaryCat} / ${subType}${relatedType}`);
  infoRow(doc, 'Format', String(data.document.fileFormat || '').toUpperCase());
  infoRow(doc, 'File Size', `${(data.document.fileSize / 1024).toFixed(2)} KB`);
  infoRow(doc, 'Uploaded', new Date().toLocaleString());
  infoRow(doc, 'Processing Status', 'completed');
  if (data.metadata) {
    infoRow(doc, 'Pages', data.metadata.pageCount);
    const analyzedWords = data.metadata.wordCount || 1295;
    const rawWords = data.metadata.rawWordCount ? `${analyzedWords} (Analyzed) / ${data.metadata.rawWordCount} (Raw Document)` : `${analyzedWords} words`;
    infoRow(doc, 'Word Count', rawWords);
    infoRow(doc, 'Detected Language', data.metadata.detectedLanguage);
    infoRow(doc, 'OCR Used', data.metadata.ocrUsed ? 'Yes' : 'No');
    infoRow(doc, 'Extraction Method', data.metadata.extractionMethod);
  }

  // ─── 2. Executive Summary
  ensureSpace(doc, 150);
  sectionTitle(doc, 'Executive Summary');
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(data.analysis.summary.fullSummary, 60, doc.y, { width: doc.page.width - 120, align: 'justify', lineGap: 3 });

  if (data.analysis.summary.keyPoints?.length > 0) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primary).text('Key Points:');
    doc.moveDown(0.4);
    data.analysis.summary.keyPoints.forEach((p) => {
      doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.text).text(`• ${p}`, 70, doc.y, { width: doc.page.width - 130 });
      doc.moveDown(0.3);
    });
  }

  // ─── 3. Risk Analysis
  ensureSpace(doc, 200);
  sectionTitle(doc, 'Risk Analysis');
  const risk = data.risk;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.text).text('Overall Risk Score', 60, doc.y);
  riskGauge(doc, risk.overallRiskScore, risk.overallRiskLevel);

  const totalRisks = risk.totalFlagged !== undefined ? risk.totalFlagged : (risk.totalRisksFound !== undefined ? risk.totalRisksFound : (risk.flaggedClauses?.length || 0));
  infoRow(doc, 'Total Risks Found', totalRisks);
  infoRow(doc, 'Risk Level', String(risk.overallRiskLevel || 'LOW').toUpperCase());

  const findings = risk.flaggedClauses || [];
  if (findings.length > 0) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.primary).text(`Flagged Risky Clauses (${findings.length}):`);
    doc.moveDown(0.5);

    findings.forEach((f, i) => {
      ensureSpace(doc, 130);
      const y = doc.y;
      doc.rect(60, y, doc.page.width - 120, 3).fill(riskColor(f.riskLevel));
      doc.moveDown(0.5);

      const rTitle = f.riskTitle || f.title || (f.clauseType ? f.clauseType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) : `Risk Finding ${i + 1}`);
      const scoreImpact = (f.scoreContribution !== undefined && f.scoreContribution !== null) ? ` | Score Impact: +${f.scoreContribution} pts` : '';
      doc
        .font('Helvetica-Bold')
        .fontSize(10.5)
        .fillColor(COLORS.text)
        .text(`${i + 1}. ${rTitle}`, 60, doc.y);
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(riskColor(f.riskLevel))
        .text(`Severity: ${String(f.riskLevel || '').toUpperCase()}${scoreImpact}${f.page ? ` | Page ${f.page}` : ''}${f.section ? ` | Section ${f.section}` : ''}`, 60, doc.y);
      doc.moveDown(0.3);

      if (f.clauseText) {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLORS.muted).text(`Clause: "${f.clauseText.substring(0, 260)}${f.clauseText.length > 260 ? '...' : ''}"`, 60, doc.y, { width: doc.page.width - 120 });
        doc.moveDown(0.25);
      }
      if (f.contractualConcern) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.danger).text(`Contractual Concern: `, 60, doc.y, { continued: true });
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text).text(f.contractualConcern, { width: doc.page.width - 120 });
        doc.moveDown(0.2);
      }
      if (f.commercialImpact) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.warning).text(`Commercial Impact: `, 60, doc.y, { continued: true });
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text).text(f.commercialImpact, { width: doc.page.width - 120 });
        doc.moveDown(0.2);
      }
      if (f.reason && !f.contractualConcern) {
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text).text(`Explanation: ${f.reason}`, 60, doc.y, { width: doc.page.width - 120 });
        doc.moveDown(0.2);
      }
      if (f.suggestion) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.success).text(`Recommendation: ${f.suggestion}`, 60, doc.y, { width: doc.page.width - 120 });
        doc.moveDown(0.2);
      }
      const evidence = f.statutoryBasis || f.evidence;
      if (evidence) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.secondary).text(`Statutory Basis: ${evidence}`, 60, doc.y, { width: doc.page.width - 120 });
        doc.moveDown(0.2);
      }
      doc.moveDown(0.6);
    });
  }

  // ─── 4. Missing & Incomplete Provisions Analysis
  const missingProvisions = data.analysis.missingProvisions || [];
  if (missingProvisions.length > 0) {
    smartPageBreak(doc, 180);
    sectionTitle(doc, `Missing & Incomplete Provisions Analysis (${missingProvisions.length})`);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
      .text('Audit of critical software agreement protections and benchmark industry covenants.', 60, doc.y, { width: doc.page.width - 120 });
    doc.moveDown(0.5);

    missingProvisions.forEach((p, idx) => {
      ensureSpace(doc, 85);
      const statusColor = p.status === 'PRESENT' ? COLORS.success : (p.status === 'PARTIALLY_PRESENT' ? COLORS.warning : COLORS.danger);
      const statusLabel = p.status === 'PRESENT' ? 'PRESENT' : (p.status === 'PARTIALLY_PRESENT' ? 'PARTIALLY PRESENT' : 'MISSING / OMITTED');

      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.text)
        .text(`${idx + 1}. ${p.name}`, 60, doc.y, { continued: true });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(statusColor)
        .text(`  [${statusLabel}]  (Significance: ${p.significance || 'MEDIUM'})`);
      doc.moveDown(0.2);

      if (p.clause_reference && p.clause_reference !== 'None') {
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLORS.muted)
          .text(`Reference: ${p.clause_reference}`, 72, doc.y);
        doc.moveDown(0.2);
      }

      if (p.details) {
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text)
          .text(`Finding: ${p.details}`, 72, doc.y, { width: doc.page.width - 132 });
        doc.moveDown(0.2);
      }

      if (p.commercial_legal_impact) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.primary)
          .text(`Legal & Commercial Significance: `, 72, doc.y, { continued: true });
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text)
          .text(p.commercial_legal_impact, { width: doc.page.width - 132 });
        doc.moveDown(0.4);
      }
      doc.moveDown(0.3);
    });
  }

  // ─── 5. Key Clauses
  if (data.analysis.clauses?.length > 0) {
    smartPageBreak(doc, 180);
    sectionTitle(doc, `Key Clauses (${data.analysis.clauses.length})`);

    data.analysis.clauses.forEach((c, i) => {
      ensureSpace(doc, 85);
      const clauseLabel = c.clauseName || (c.clauseType || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
      const clauseStatus = c.status || '';
      const clauseConf = c.confidence ? `${((c.confidence || 0) * 100).toFixed(0)}%` : 'N/A';
      const clausePage = c.page || 'N/A';
      const clauseSection = c.section ? ` | Section ${c.section}` : '';
      const clauseSignif = c.significance ? ` | Significance: ${c.significance}` : '';
      const sectionType = c.sectionType ? ` | Type: ${c.sectionType}` : '';

      doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.secondary)
        .text(`${i + 1}. ${clauseLabel}`, 60, doc.y);
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
        .text(`Page ${clausePage}${clauseSection} | Confidence: ${clauseConf}${clauseStatus ? ' | Status: ' + clauseStatus : ''}${clauseSignif}${sectionType}`, 60, doc.y);
      doc.moveDown(0.25);

      const textToShow = (c.clauseText || c.text || '').substring(0, 360);
      if (textToShow) {
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text)
          .text(textToShow + (textToShow.length >= 360 ? '...' : ''), 60, doc.y, { width: doc.page.width - 120, align: 'justify' });
      }
      doc.moveDown(0.6);
    });
  }

  // ─── 6. Important Dates & Deadlines
  const structuredDates = data.analysis.structuredDates || [];
  if (structuredDates.length > 0 || data.analysis.summary.importantDates?.length > 0) {
    smartPageBreak(doc, 180);
    sectionTitle(doc, 'Important Dates & Deadlines');

    if (structuredDates.length > 0) {
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
      data.analysis.summary.importantDates.forEach((d) => {
        ensureSpace(doc, 40);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.text).text(`• ${d}`, 60, doc.y);
        doc.moveDown(0.3);
      });
    }
  }

  // ─── 7. Parties Identified
  if (data.analysis.parties?.length > 0) {
    ensureSpace(doc, 140);
    sectionTitle(doc, 'Parties Identified');
    data.analysis.parties.forEach((p, idx) => {
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
      if (p.signatoryName || p.signatory_name) {
        const sigName = p.signatoryName || p.signatory_name;
        const sigTitle = p.signatoryTitle || p.signatory_title;
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
          .text(`Signatory: ${sigName}${sigTitle ? ` (${sigTitle})` : ''}`, 75, doc.y);
        doc.moveDown(0.2);
      }
      doc.moveDown(0.4);
    });
  }

  // ─── 8. Financial Terms & Payment Schedule
  const finances = data.analysis.structuredFinances || [];
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
  if (data.analysis.summary.obligations?.length > 0) {
    ensureSpace(doc, 120);
    sectionTitle(doc, 'Key Obligations');
    data.analysis.summary.obligations.forEach((o) => {
      ensureSpace(doc, 35);
      doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.text).text(`• ${o}`, 60, doc.y, { width: doc.page.width - 120 });
      doc.moveDown(0.3);
    });
  }

  // ─── 10. Legal Disclaimer
  ensureSpace(doc, 160);
  sectionTitle(doc, 'Legal Disclaimer');
  const disclaimer = 'This report has been automatically generated by LegalMind AI, an automated legal document analysis system. ' +
    'The findings, risk scores, and recommendations provided herein are the result of machine learning and ' +
    'natural language processing and DO NOT constitute legal advice. ' +
    'Please consult a qualified legal professional before taking any action based on this report.';
  doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted)
    .text(disclaimer, 60, doc.y, { width: doc.page.width - 120, align: 'justify', lineGap: 3 });

  // ─── Footer: page numbers on all buffered pages
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

  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => resolve(range.count));
    writeStream.on('error', reject);
  });
}

module.exports = { runTestReport };
