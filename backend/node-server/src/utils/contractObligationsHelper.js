// ============================================================
// Contract Obligations and Important Dates Intelligence Engine
// Step 12: High-reliability extraction, classification,
// timeline reconstruction, and uncertainty qualification.
// ============================================================

const fs = require('fs');
const path = require('path');

/**
 * Normalizes text and whitespace
 */
function cleanText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/ +/g, ' ').trim();
}

const MONTH_MAP = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * Normalizes awkward contract terms for display (e.g. "thirty 30 days" -> "30 Days")
 * without modifying verbatim contract source passage or supporting evidence.
 */
function normalizeDisplayTerms(str) {
  if (!str || typeof str !== 'string') return str;
  const WORD_TO_NUM = {
    one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
    twelve: '12', fifteen: '15', twenty: '20', thirty: '30',
    forty: '40', fortyfive: '45', fifty: '50', sixty: '60',
    ninety: '90', hundred: '100',
  };
  let res = str;
  // Replace word-digit duplicates like "thirty (30) days" or "thirty 30 days" with "30 Days"
  res = res.replace(/\b([a-zA-Z]+)\s*\(?(\d+)\)?\s*(business\s+|calendar\s+)?(days?|months?|years?|weeks?|hours?)\b/gi, (m, word, num, type, unit) => {
    const wLow = word.toLowerCase();
    if (WORD_TO_NUM[wLow] && (WORD_TO_NUM[wLow] === num || WORD_TO_NUM[wLow])) {
      const u = unit.charAt(0).toUpperCase() + unit.slice(1).toLowerCase();
      const t = type ? (type.trim().charAt(0).toUpperCase() + type.trim().slice(1).toLowerCase() + ' ') : '';
      return `${num} ${t}${u}`;
    }
    return m;
  });
  // Clean up remaining duplicates like "thirty 30"
  res = res.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty|fifty|sixty|ninety)\s+(\d+)\b/gi, '$2');
  // Capitalize "Net 30 Days"
  res = res.replace(/\bnet\s+(\d+)\s*days?\b/gi, 'Net $1 Days');
  return res.replace(/\s+/g, ' ').trim();
}

/**
 * Robustly parses legal calendar dates into timezone-independent UTC Date objects.
 * Prevents UTC/local midnight drift (e.g. Oct 15 shifting to Oct 14 in GMT+05:30).
 */
function parseCalendarDate(str) {
  if (!str || typeof str !== 'string') return null;
  const cleaned = str
    .replace(/(?:st|nd|rd|th),?/gi, '')
    .replace(/[()]/g, '')
    .trim();

  // 1. ISO format: YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    }
  }

  // 2. Month Day, Year (e.g. October 15, 2024 or Oct 15 2024)
  const mdyMatch = cleaned.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdyMatch) {
    const m = MONTH_MAP[mdyMatch[1].toLowerCase()];
    const d = parseInt(mdyMatch[2], 10);
    const y = parseInt(mdyMatch[3], 10);
    if (m && y >= 1990 && y <= 2100 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    }
  }

  // 3. Day Month Year (e.g. 15 October 2024)
  const dmyMatch = cleaned.match(/^(\d{1,2})\s+([a-zA-Z]+),?\s+(\d{4})$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = MONTH_MAP[dmyMatch[2].toLowerCase()];
    const y = parseInt(dmyMatch[3], 10);
    if (m && y >= 1990 && y <= 2100 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    }
  }

  // 4. Substring Month Day, Year (e.g. "terminates on October 14, 2026")
  const subMatch = cleaned.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (subMatch) {
    const m = MONTH_MAP[subMatch[1].toLowerCase()];
    const d = parseInt(subMatch[2], 10);
    const y = parseInt(subMatch[3], 10);
    if (m && y >= 1990 && y <= 2100 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    }
  }

  // 5. Fallback via Date.parse
  const ts = Date.parse(cleaned);
  if (!isNaN(ts)) {
    const localD = new Date(ts);
    const y = localD.getFullYear();
    const m = localD.getMonth() + 1;
    const d = localD.getDate();
    if (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    }
  }

  return null;
}

/**
 * Formats a Date object cleanly as YYYY-MM-DD
 */
function toIsoDate(d) {
  if (!d) return null;
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const p = parseCalendarDate(d);
    return p ? toIsoDate(p) : null;
  }
  if (d instanceof Date && !isNaN(d.getTime())) {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/**
 * Extracts and classifies all contract dates, deadlines, notice periods, and obligations.
 *
 * @param {Object} document - Document record from DB
 * @param {Object} analysis - AnalysisResult record from DB
 * @param {Object} metadata - DocumentMetadata record from DB
 * @returns {Object} Structured timeline, categorized obligations, and summary telemetry
 */
function extractContractObligations(document, analysis, metadata) {
  // 1. Resolve full document text safely without parsing binary files (Phase 1D — ERR-CRIT-004)
  let rawText = '';
  const docObj = document || {};
  const filePath = docObj.filePath || '';
  const fileExt = path.extname(filePath).toLowerCase();
  const isPlainText = fileExt === '.txt';

  // 1a. If supported plain-text file exists on disk, reading is valid
  if (isPlainText && filePath && fs.existsSync(filePath)) {
    try {
      rawText = fs.readFileSync(filePath, 'utf8');
    } catch {
      rawText = '';
    }
  }

  // 1b. For non-plain-text (PDF, DOCX) or unreadable files, prefer metadata.extractedText
  if (!rawText && metadata && typeof metadata.extractedText === 'string' && metadata.extractedText.trim()) {
    rawText = metadata.extractedText;
  }

  // 1c. If metadata.extractedText is empty, reconstruct from extracted clauses
  if (!rawText && analysis && Array.isArray(analysis.clauses) && analysis.clauses.length > 0) {
    rawText = analysis.clauses.map((c) => c.text || '').filter(Boolean).join('\n\n');
  }

  // 1d. Fallback to summary if available
  if (!rawText && analysis && analysis.summary) {
    rawText = analysis.summary.fullSummary || analysis.summary.overview || '';
  }

  const cleanedDocText = cleanText(rawText);
  const clauses = (analysis && analysis.clauses) ? analysis.clauses : [];
  const importantDatesFromNer = (analysis && analysis.summary && analysis.summary.importantDates)
    ? analysis.summary.importantDates
    : [];

  const items = [];
  let startDateObj = null;
  let termMonths = null;

  // ────────────────────────────────────────────────────────────
  // 1. CONTRACT START DATE / EFFECTIVE DATE
  // ────────────────────────────────────────────────────────────
  const startDateRegexes = [
    /(?:entered\s+into\s+(?:as\s+of|on)|effective\s+(?:as\s+of|date:?|from)|commencing\s+on|dated\s+(?:as\s+of|on)?|agreement\s+date:?|made\s+and\s+entered\s+into\s+(?:as\s+of|on)?|executed\s+(?:as\s+of|on)?)\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4}|\d{4}-\d{2}-\d{2})/i,
    /(?:as\s+of\s+this\s+)(\d{1,2}(?:st|nd|rd|th)?\s+day\s+of\s+[A-Za-z]+,?\s+\d{4})/i,
    /(?:this\s+\d{1,2}(?:st|nd|rd|th)?\s+day\s+of\s+[A-Za-z]+,?\s+\d{4})/i,
  ];

  let foundStartDate = null;
  let startExcerpt = '';

  for (const reg of startDateRegexes) {
    const match = cleanedDocText.match(reg);
    if (match) {
      const parsed = parseCalendarDate(match[1]);
      if (parsed) {
        foundStartDate = match[1].trim();
        startDateObj = parsed;
        // Grab surrounding sentence
        const matchIdx = match.index;
        const sentenceStart = Math.max(0, cleanedDocText.lastIndexOf('\n', matchIdx));
        const sentenceEnd = cleanedDocText.indexOf('\n', matchIdx + match[0].length);
        startExcerpt = cleanedDocText.substring(
          sentenceStart,
          sentenceEnd !== -1 ? sentenceEnd : matchIdx + 200
        ).trim();
        break;
      }
    }
  }

  // Fallback to NER keyDates or structuredDates if not matched in preamble text
  if (!foundStartDate && analysis) {
    const candidateDates = [
      ...(Array.isArray(analysis.keyDates) ? analysis.keyDates : []),
      ...(Array.isArray(analysis.structuredDates) ? analysis.structuredDates : []),
    ];
    for (const kd of candidateDates) {
      const lbl = (kd.label || kd.date_text || kd.date || '').toLowerCase();
      if (/start|effective|commence|commencing|agreement\s*date/i.test(lbl)) {
        const rawD = kd.date || kd.date_text || kd.parsedDate;
        const parsed = parseCalendarDate(rawD);
        if (parsed) {
          foundStartDate = rawD;
          startDateObj = parsed;
          startExcerpt = `Identified from contract records: ${lbl} (${rawD})`;
          break;
        }
      }
    }
  }

  if (foundStartDate && startDateObj) {
    items.push({
      id: 'ob-start-date',
      category: 'START_DATE',
      title: 'Contract Effective & Commencement Date',
      date: foundStartDate,
      parsedDate: toIsoDate(startDateObj),
      dateType: 'explicit_calendar',
      certainty: 'EXPLICIT',
      uncertaintyReason: null,
      sourcePassage: startExcerpt || `Contract is entered into as of ${foundStartDate}.`,
      page: 1,
      section: 'Preamble',
      party: 'All Parties',
      actionRequired: 'Contract legal term begins. Operational performance obligations commence.',
      reminderApplicable: false,
    });
  } else {
    items.push({
      id: 'ob-start-date-missing',
      category: 'START_DATE',
      title: 'Contract Effective Date',
      date: 'Date Not Explicitly Stated',
      parsedDate: null,
      dateType: 'explicit_calendar',
      certainty: 'UNCERTAIN',
      uncertaintyReason: 'Document lacks an explicit calendar commencement date in the preamble or execution block.',
      sourcePassage: cleanedDocText.substring(0, 180) + '...',
      page: 1,
      section: 'Preamble',
      party: 'All Parties',
      actionRequired: 'Verify execution date or signed signature page addendum.',
      reminderApplicable: false,
    });
  }

  // ────────────────────────────────────────────────────────────
  // 2. EXPIRATION DATE / INITIAL TERM
  // ────────────────────────────────────────────────────────────
  const termDurationRegexes = [
    /(?:initial\s+term\s+(?:is|shall\s+be|of)|term\s+of\s+(?:this\s+agreement\s+is|the\s+agreement\s+is|employment\s+is)|period\s+of)\s*(?:[a-zA-Z]+\s*\()?\s*(\d+)\s*\)?\s*(months?|years?|days?)/i,
    /(?:shall\s+continue\s+in\s+effect\s+for\s*(?:a\s+period\s+of\s*)?)(?:[a-zA-Z]+\s*\()?\s*(\d+)\s*\)?\s*(months?|years?|days?)/i,
    /(?:for\s+an\s+initial\s+period\s+of)\s*(?:[a-zA-Z]+\s*\()?\s*(\d+)\s*\)?\s*(months?|years?)/i,
  ];

  let termDurationText = null;
  let termExcerpt = '';

  for (const reg of termDurationRegexes) {
    const match = cleanedDocText.match(reg);
    if (match) {
      const num = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      termDurationText = `${match[1]} ${match[2]}`;
      if (unit.startsWith('month')) termMonths = num;
      else if (unit.startsWith('year')) termMonths = num * 12;

      const matchIdx = match.index;
      const sStart = Math.max(0, cleanedDocText.lastIndexOf('\n', matchIdx));
      const sEnd = cleanedDocText.indexOf('\n', matchIdx + match[0].length);
      termExcerpt = cleanedDocText.substring(sStart, sEnd !== -1 ? sEnd : matchIdx + 200).trim();
      break;
    }
  }

  // Also check explicit calendar expiration dates
  const explicitExpiryRegex = /(?:shall\s+expire\s+on|shall\s+terminate\s+on|expiring\s+on|expires\s+on|expiration\s+date\s*:?|until)\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{4}-\d{2}-\d{2})/i;
  const explicitExpiryMatch = cleanedDocText.match(explicitExpiryRegex);

  if (explicitExpiryMatch && parseCalendarDate(explicitExpiryMatch[1])) {
    const explicitExpDate = parseCalendarDate(explicitExpiryMatch[1]);
    items.push({
      id: 'ob-expiration-date',
      category: 'EXPIRATION_DATE',
      title: 'Contract Expiration Date',
      date: explicitExpiryMatch[1],
      parsedDate: toIsoDate(explicitExpDate),
      dateType: 'explicit_calendar',
      certainty: 'EXPLICIT',
      uncertaintyReason: null,
      sourcePassage: termExcerpt || `Contract terminates on ${explicitExpiryMatch[1]}.`,
      page: 1,
      section: 'Term & Termination',
      party: 'All Parties',
      actionRequired: 'Contract expires unless formally renewed or renegotiated.',
      reminderApplicable: true,
    });
  } else if (startDateObj && termMonths) {
    // Inferred expiration date
    const inferredExpDate = new Date(startDateObj);
    inferredExpDate.setMonth(inferredExpDate.getMonth() + termMonths);
    const formattedInferred = inferredExpDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    items.push({
      id: 'ob-expiration-date',
      category: 'EXPIRATION_DATE',
      title: 'Contract Expiration Date (Calculated Term)',
      date: formattedInferred,
      parsedDate: toIsoDate(inferredExpDate),
      dateType: 'relative_duration',
      certainty: 'INFERRED',
      uncertaintyReason: `Inferred from Initial Term of ${termDurationText} calculated from Effective Date (${foundStartDate}). Subject to early termination or non-renewal.`,
      sourcePassage: termExcerpt,
      page: 1,
      section: 'Term & Termination',
      party: 'All Parties',
      actionRequired: 'Contract term concludes unless extended or renewed prior to deadline.',
      reminderApplicable: true,
    });
  } else if (termDurationText) {
    items.push({
      id: 'ob-expiration-date',
      category: 'EXPIRATION_DATE',
      title: 'Contract Term Duration',
      date: termDurationText,
      parsedDate: null,
      dateType: 'relative_duration',
      certainty: 'UNCERTAIN',
      uncertaintyReason: `Contract specifies an initial term of ${termDurationText}, but exact calendar expiration is uncertain due to missing effective date.`,
      sourcePassage: termExcerpt,
      page: 1,
      section: 'Term & Termination',
      party: 'All Parties',
      actionRequired: 'Anchor commencement date to establish fixed calendar expiration.',
      reminderApplicable: false,
    });
  } else {
    // Check if termination clause implies at-will or indefinite duration
    const termClause = clauses.find(c => c.clauseType === 'termination');
    items.push({
      id: 'ob-expiration-date-indefinite',
      category: 'EXPIRATION_DATE',
      title: 'Contract Expiration / Term Horizon',
      date: 'Indefinite / Terminable upon Notice',
      parsedDate: null,
      dateType: 'conditional_trigger',
      certainty: 'CONDITIONAL',
      uncertaintyReason: 'No fixed calendar expiration found. Contract continues in effect until terminated under contractual notice provisions.',
      sourcePassage: termClause ? termClause.clauseText : 'No fixed term specified.',
      page: termClause?.page || 1,
      section: termClause?.section || 'Termination',
      party: 'All Parties',
      actionRequired: 'Terminable in accordance with notice requirements.',
      reminderApplicable: false,
    });
  }

  // ────────────────────────────────────────────────────────────
  // 3. RENEWAL DATES & EXTENSION WINDOWS
  // ────────────────────────────────────────────────────────────
  const renewalRegex = /(?:automatic(?:ally)?\s+renew|renewal\s+term|renewed\s+for\s+successive\s+periods|option\s+to\s+renew|extend\s+this\s+agreement)[^.]{0,350}\./i;
  const renewalMatch = cleanedDocText.match(renewalRegex);

  if (renewalMatch) {
    // Check if notice window specified for non-renewal
    const renewalNoticeMatch = renewalMatch[0].match(/(?:notice[^.]{0,40}?|at\s+least\s+)(?:([a-zA-Z]+)\s*\(([0-9]+)\)|(\d+|[a-zA-Z]+))\s*(?:business\s+)?(days?|months?)/i);
    let renewalNotice = 'Advance Notice';
    if (renewalNoticeMatch) {
      const num = renewalNoticeMatch[2] || renewalNoticeMatch[3] || renewalNoticeMatch[1];
      const unit = renewalNoticeMatch[4];
      renewalNotice = `${num} ${unit}`;
    } else {
      const fallback = renewalMatch[0].match(/(\d+)\s*(days?|months?)/i);
      if (fallback) renewalNotice = `${fallback[1]} ${fallback[2]}`;
    }

    const cleanRenewalNotice = normalizeDisplayTerms(renewalNotice);

    items.push({
      id: 'ob-renewal-window',
      category: 'RENEWAL_DATE',
      title: 'Contract Automatic Renewal / Extension',
      date: `Successive Terms (Notice: ${cleanRenewalNotice})`,
      parsedDate: null,
      dateType: 'conditional_trigger',
      certainty: 'CONDITIONAL',
      uncertaintyReason: 'Contract automatically rolls over unless affirmative non-renewal notice is delivered prior to deadline window.',
      sourcePassage: renewalMatch[0].trim(),
      page: 1,
      section: 'Term & Renewal',
      party: 'Either Party',
      actionRequired: 'Deliver non-renewal notice prior to deadline if termination is desired.',
      reminderApplicable: true,
    });
  }

  // ────────────────────────────────────────────────────────────
  // 4. NOTICE PERIODS (TERMINATION FOR CONVENIENCE)
  // ────────────────────────────────────────────────────────────
  const noticeRegexes = [
    /(?:either\s+party\s+may\s+terminate[^.]{0,120}?(?:providing|delivering|with|upon)\s+([a-zA-Z0-9\(\)\s]+?\s*(?:business\s+)?days?|[a-zA-Z0-9\(\)\s]+?\s*months?)\s+(?:advance\s+)?written\s+notice)/i,
    /(?:notice\s+period\s+of\s+([a-zA-Z0-9\(\)\s]+?\s*days?|[a-zA-Z0-9\(\)\s]+?\s*months?))/i,
    /(?:terminated\s+with\s+([a-zA-Z0-9\(\)\s]+?\s*days?|[a-zA-Z0-9\(\)\s]+?\s*months?)\s+notice)/i,
    /(?:written\s+notice[^.]{0,80}?(?:at\s+least\s+)?([a-zA-Z0-9\(\)\s]+?\s*(?:business\s+)?days?|[a-zA-Z0-9\(\)\s]+?\s*months?)\s+prior)/i,
    /(?:at\s+least\s+([a-zA-Z0-9\(\)\s]+?\s*(?:business\s+)?days?|[a-zA-Z0-9\(\)\s]+?\s*months?)[^.]{0,80}?written\s+notice)/i,
    /(?:(\d+)\s*days?\s+(?:advance\s+)?written\s+notice)/i,
  ];

  let foundNotice = null;
  let noticePassage = '';

  for (const reg of noticeRegexes) {
    const match = cleanedDocText.match(reg);
    if (match) {
      foundNotice = match[1] ? match[1].replace(/[()]/g, '').trim() : match[0].trim();
      const matchIdx = match.index;
      const sStart = Math.max(0, cleanedDocText.lastIndexOf('\n', matchIdx));
      const sEnd = cleanedDocText.indexOf('\n', matchIdx + match[0].length);
      noticePassage = cleanedDocText.substring(sStart, sEnd !== -1 ? sEnd : matchIdx + 200).trim();
      break;
    }
  }

  if (foundNotice) {
    const cleanNotice = normalizeDisplayTerms(foundNotice);
    items.push({
      id: 'ob-notice-period',
      category: 'NOTICE_PERIOD',
      title: 'Termination for Convenience Notice Period',
      date: `${cleanNotice} Written Notice`,
      parsedDate: null,
      dateType: 'relative_duration',
      certainty: 'INFERRED',
      uncertaintyReason: 'Requires delivery of written notice prior to desired termination date.',
      sourcePassage: noticePassage || `Termination requires ${foundNotice} written notice.`,
      page: 1,
      section: 'Termination',
      party: 'Either Party',
      actionRequired: 'Provide written notification in advance of effective termination date.',
      reminderApplicable: true,
    });
  }

  // ────────────────────────────────────────────────────────────
  // 5. TERMINATION DEADLINES & IMMEDIATE CURE PERIODS
  // ────────────────────────────────────────────────────────────
  // Immediate termination / cause
  const causeRegex = /(?:immediate\s+termination|terminate\s+immediately)[^.]{0,200}\./i;
  const causeMatch = cleanedDocText.match(causeRegex);
  if (causeMatch) {
    items.push({
      id: 'ob-termination-cause',
      category: 'TERMINATION_DEADLINE',
      title: 'Immediate Termination for Cause / Breach',
      date: 'Immediate / Upon Notice',
      parsedDate: null,
      dateType: 'conditional_trigger',
      certainty: 'CONDITIONAL',
      uncertaintyReason: 'Immediate termination without notice period applies exclusively upon occurrence of specified cause events.',
      sourcePassage: causeMatch[0].trim(),
      page: 1,
      section: 'Termination for Cause',
      party: 'Aggrieved Party',
      actionRequired: 'Immediate termination permitted upon gross misconduct, felony, or uncurable breach.',
      reminderApplicable: false,
    });
  }

  // Overdue payment suspension / cure period
  const cureRegex = /(?:suspend\s+services|cure\s+period|remedy\s+such\s+breach)[^.]{0,60}?(\d+\s*(?:business\s+)?days?)/i;
  const cureMatch = cleanedDocText.match(cureRegex);
  if (cureMatch) {
    const cureWindow = normalizeDisplayTerms(cureMatch[1]);
    items.push({
      id: 'ob-cure-period',
      category: 'TERMINATION_DEADLINE',
      title: 'Default Cure Window & Service Suspension',
      date: `${cureWindow} Cure Period`,
      parsedDate: null,
      dateType: 'relative_duration',
      certainty: 'INFERRED',
      uncertaintyReason: null,
      sourcePassage: cureMatch[0].trim(),
      page: 1,
      section: 'Remedies / Suspension',
      party: 'Defaulting Party',
      actionRequired: `Remedy default or satisfy outstanding payment within ${cureWindow} to prevent suspension or cancellation.`,
      reminderApplicable: true,
    });
  }

  // ────────────────────────────────────────────────────────────
  // 6. PAYMENT DEADLINES & FINANCIAL TERMS
  // ────────────────────────────────────────────────────────────
  const paymentRegexes = [
    /(?:within\s+(\d+)\s*(?:calendar\s+|business\s+)?days?\s+(?:of\s+receipt|following\s+invoice|of\s+invoice|of\s+date\s+of\s+invoice))/i,
    /(?:net\s+(\d+)\s*days?)/i,
    /(?:billed|payable)\s*(monthly|quarterly|annually|bi-weekly|in\s+advance|within\s+\d+\s*days)/i,
    /(?:late\s+payments?\s+accrue\s+interest\s+at\s+[\d\.]+\%\s+per\s+month)/i,
  ];

  let paymentMatchCount = 0;
  for (const reg of paymentRegexes) {
    const match = cleanedDocText.match(reg);
    if (match) {
      const matchIdx = match.index;
      const sStart = Math.max(0, cleanedDocText.lastIndexOf('\n', matchIdx));
      const sEnd = cleanedDocText.indexOf('\n', matchIdx + match[0].length);
      const paymentExcerpt = cleanedDocText.substring(sStart, sEnd !== -1 ? sEnd : matchIdx + 200).trim();

      const rawPayDate = match[0].trim();
      const cleanPayDate = normalizeDisplayTerms(rawPayDate);
      items.push({
        id: `ob-payment-${paymentMatchCount}`,
        category: 'PAYMENT_DEADLINE',
        title: 'Payment Schedule & Billing Deadline',
        date: cleanPayDate,
        parsedDate: null,
        dateType: 'relative_duration',
        certainty: 'INFERRED',
        uncertaintyReason: null,
        sourcePassage: paymentExcerpt,
        page: 1,
        section: 'Compensation & Payment',
        party: 'Obligated Payor',
        actionRequired: 'Disburse scheduled compensation or invoice payments according to terms.',
        reminderApplicable: true,
      });
      paymentMatchCount++;
      if (paymentMatchCount >= 2) break;
    }
  }

  // ────────────────────────────────────────────────────────────
  // 7. OTHER EXPLICITLY STATED OBLIGATIONS & RESTRICTIVE COVENANTS
  // ────────────────────────────────────────────────────────────

  // A. Post-termination Non-Compete Period
  const nonCompeteRegex = /(?:not\s+to\s+engage\s+in\s+competing|shall\s+not\s+compete)[^.]{0,120}?for\s+(?:a\s+period\s+of\s*)?(?:[a-zA-Z]+\s+)?\(?(\d+)\)?\s*(months?|years?)/i;
  const ncMatch = cleanedDocText.match(nonCompeteRegex);
  if (ncMatch) {
    const ncDuration = `${ncMatch[1]} ${ncMatch[2]}`;
    items.push({
      id: 'ob-non-compete',
      category: 'AFFIRMATIVE_OBLIGATION',
      title: 'Post-Termination Non-Compete Restriction',
      date: `${ncDuration} Post-Termination`,
      parsedDate: null,
      dateType: 'relative_duration',
      certainty: 'EXPLICIT',
      uncertaintyReason: 'Runs relative to actual separation/termination date within specified territory.',
      sourcePassage: ncMatch[0].trim(),
      page: 1,
      section: 'Restrictive Covenants',
      party: 'Executive / Employee',
      actionRequired: `Refrain from competitive business activities for ${ncDuration} following employment termination.`,
      reminderApplicable: true,
    });
  }

  // B. Vacation & Leave Entitlements
  const leaveRegex = /(?:entitled\s+to)\s*(\d+\s*(?:business\s+|calendar\s+)?days?\s+of\s+paid\s+(?:vacation|leave)[^.]{0,100})/i;
  const leaveMatch = cleanedDocText.match(leaveRegex);
  if (leaveMatch) {
    items.push({
      id: 'ob-leave-entitlement',
      category: 'AFFIRMATIVE_OBLIGATION',
      title: 'Annual Paid Leave & Vacation Entitlement',
      date: leaveMatch[1].trim(),
      parsedDate: null,
      dateType: 'periodic_milestone',
      certainty: 'EXPLICIT',
      uncertaintyReason: null,
      sourcePassage: leaveMatch[0].trim(),
      page: 1,
      section: 'Vacation & Leave',
      party: 'Company / Employer',
      actionRequired: 'Provide scheduled paid leave entitlement per calendar year.',
      reminderApplicable: false,
    });
  }

  // C. Confidentiality Period
  const confRegex = /(?:confidentiality|proprietary\s+information)[^.]{0,100}?(?:for\s+(\d+\s*(?:years?|months?))|during\s+employment\s+and\s+for\s+(\d+\s*years?)\s+thereafter|perpetual|indefinite)/i;
  const confMatch = cleanedDocText.match(confRegex);
  if (confMatch) {
    const confDuration = confMatch[1] || confMatch[2] || 'Survival Period';
    items.push({
      id: 'ob-confidentiality',
      category: 'AFFIRMATIVE_OBLIGATION',
      title: 'Confidentiality & Trade Secret Protection',
      date: `${confDuration} Survival Window`,
      parsedDate: null,
      dateType: 'relative_duration',
      certainty: 'EXPLICIT',
      uncertaintyReason: 'Survives termination of the agreement.',
      sourcePassage: confMatch[0].trim(),
      page: 1,
      section: 'Confidentiality',
      party: 'Receiving Party',
      actionRequired: 'Protect proprietary records, technical data, and trade secrets from unauthorized disclosure.',
      reminderApplicable: false,
    });
  }

  // C. Breach / Data Incident Notification Deadline
  const breachNotifyRegex = /(?:notify\s+(?:client|company|employer)[^.]{0,80}?within\s+(\d+\s*(?:hours?|business\s+days?|days?))\s+of\s+(?:discovery|breach|incident))/i;
  const breachMatch = cleanedDocText.match(breachNotifyRegex);
  if (breachMatch) {
    const windowStr = breachMatch[1];
    items.push({
      id: 'ob-breach-notification',
      category: 'NOTICE_PERIOD',
      title: 'Security Breach Notification Window',
      date: `Within ${windowStr} of Discovery`,
      parsedDate: null,
      dateType: 'relative_duration',
      certainty: 'EXPLICIT',
      uncertaintyReason: 'Triggered conditionally upon occurrence and discovery of a security or data incident.',
      sourcePassage: breachMatch[0].trim(),
      page: 1,
      section: 'Data Protection',
      party: 'Service Provider / Processor',
      actionRequired: `Provide formal incident notice to counterparty within ${windowStr} of confirmed breach discovery.`,
      reminderApplicable: false,
    });
  }

  // D. Indemnification Covenant
  const indemRegex = /(?:indemnify\s+(?:and\s+hold\s+harmless\s+)?(?:the\s+)?(?:employer|client|company|provider)[^.]{0,250}\.)/i;
  const indemMatch = cleanedDocText.match(indemRegex);
  if (indemMatch) {
    items.push({
      id: 'ob-indemnity',
      category: 'AFFIRMATIVE_OBLIGATION',
      title: 'Contractual Indemnification Obligation',
      date: 'Ongoing During Term & Survival',
      parsedDate: null,
      dateType: 'conditional_trigger',
      certainty: 'EXPLICIT',
      uncertaintyReason: null,
      sourcePassage: indemMatch[0].trim(),
      page: 1,
      section: 'Indemnity & Defense',
      party: 'Indemnifying Party',
      actionRequired: 'Defend, hold harmless, and indemnify designated party against qualified third-party liabilities or damages.',
      reminderApplicable: false,
    });
  }

  // ────────────────────────────────────────────────────────────
  // 8. MERGE AI SERVICE STRUCTURED OBLIGATIONS & CLAUSES
  // ────────────────────────────────────────────────────────────
  if (analysis && Array.isArray(analysis.structuredObligations) && analysis.structuredObligations.length > 0) {
    for (const [idx, so] of analysis.structuredObligations.entries()) {
      if (!so || typeof so !== 'object') continue;
      const respParty = so.bound_party || so.boundParty || so.responsible_party || so.responsibleParty || 'Obligated Party';
      const obligTitle = so.title || so.obligation || so.action || 'Contractual Obligation';
      const obligDesc = so.obligation || so.action || obligTitle;
      const actionText = so.action || so.obligation || obligTitle;
      const deadlineStr = so.deadline || 'Specified in Agreement';
      const parsedD = parseCalendarDate(deadlineStr);
      const isExplicitDate = Boolean(parsedD);
      const tempClass = (so.temporal_classification || so.temporalClassification || '').toUpperCase();

      let category = so.category || 'AFFIRMATIVE_OBLIGATION';
      if (!so.category) {
        const textToMatch = `${obligDesc} ${so.source_clause || ''} ${so.conditions || ''}`.toLowerCase();
        if (/payment|fee|invoice|remuneration|salary|compensation|price/i.test(textToMatch)) {
          category = 'PAYMENT_DEADLINE';
        } else if (/termination|terminate|cancel/i.test(textToMatch)) {
          category = 'TERMINATION_DEADLINE';
        } else if (/notice|notify|reporting|report|incident|breach/i.test(textToMatch)) {
          category = 'NOTICE_PERIOD';
        } else if (/renewal|renew|extension|extend/i.test(textToMatch)) {
          category = 'RENEWAL_DATE';
        } else if (/expiration|expire|term end/i.test(textToMatch)) {
          category = 'EXPIRATION_DATE';
        } else if (/effective|commence|start/i.test(textToMatch)) {
          category = 'START_DATE';
        }
      }

      let certainty = so.certainty || (isExplicitDate ? 'EXPLICIT' : 'INFERRED');
      if (!so.certainty) {
        if (tempClass === 'DURATION' || tempClass === 'SURVIVAL_PERIOD' || tempClass === 'PERIODIC') {
          certainty = 'INFERRED';
        } else if (tempClass === 'CONDITION_TRIGGERED_PERIOD' || tempClass === 'CONDITIONAL') {
          certainty = 'CONDITIONAL';
        } else if (/not\s+specified|unspecified|as\s+applicable|upon\s+notice/i.test(deadlineStr)) {
          certainty = 'UNCERTAIN';
        }
      }

      const cleanDeadline = normalizeDisplayTerms(deadlineStr);
      const cleanClauseName = (so.source_clause || `item-${idx}`).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
      items.push({
        id: so.id || `ob-ai-${idx}-${cleanClauseName}`,
        category,
        title: obligTitle,
        date: cleanDeadline,
        rawDateText: deadlineStr,
        formattedDueDate: cleanDeadline,
        parsedDate: toIsoDate(parsedD),
        dateType: isExplicitDate ? 'explicit_calendar' : (tempClass === 'DURATION' ? 'relative_duration' : 'conditional_trigger'),
        certainty,
        uncertaintyReason: so.conditions || null,
        sourcePassage: so.supporting_evidence || actionText || '',
        page: so.source_page || so.sourcePage || 1,
        section: so.source_clause || so.sourceClause || 'General Terms',
        party: respParty,
        actionRequired: actionText,
        reminderApplicable: isExplicitDate || category === 'PAYMENT_DEADLINE' || category === 'NOTICE_PERIOD',
      });
    }
  }

  // Deduplication and normalization
  // If an explicit or inferred start date was found, remove placeholder 'ob-start-date-missing'
  const hasRealStartDate = items.some(i => i.category === 'START_DATE' && i.id !== 'ob-start-date-missing');
  const itemsWithoutMissingStart = hasRealStartDate
    ? items.filter(i => i.id !== 'ob-start-date-missing')
    : items;

  // If a valid expiration date or duration is present, remove placeholder 'ob-expiration-date-indefinite'
  const hasRealExpiry = itemsWithoutMissingStart.some(i => i.category === 'EXPIRATION_DATE' && i.id !== 'ob-expiration-date-indefinite');
  const filteredItems = hasRealExpiry
    ? itemsWithoutMissingStart.filter(i => i.id !== 'ob-expiration-date-indefinite')
    : itemsWithoutMissingStart;

  const dedupedItems = [];
  const seenIds = new Set();
  const seenSignatures = new Set();
  for (const item of filteredItems) {
    const sig = `${item.category}:${(item.title || '').trim().toLowerCase()}`;
    if (!seenIds.has(item.id) && !seenSignatures.has(sig)) {
      seenIds.add(item.id);
      seenSignatures.add(sig);
      dedupedItems.push(item);
    }
  }

  // Populate field aliases on all deduped items
  for (const item of dedupedItems) {
    if (!item.rawDateText) item.rawDateText = item.date;
    if (!item.formattedDueDate) item.formattedDueDate = normalizeDisplayTerms(item.date);
    if (!item.parsedDueDate) item.parsedDueDate = item.parsedDate || null;
    if (!item.boundParty) item.boundParty = item.party;
    if (!item.action) item.action = item.actionRequired;
    if (!item.supportingEvidence) item.supportingEvidence = item.sourcePassage;
  }

  // Build summary metrics
  const summary = {
    totalItems: dedupedItems.length,
    explicitCount: dedupedItems.filter(i => i.dateType === 'explicit_calendar' && i.certainty === 'EXPLICIT').length,
    relativeCount: dedupedItems.filter(i => i.dateType === 'relative_duration').length,
    conditionalCount: dedupedItems.filter(i => i.dateType === 'conditional_trigger' || i.certainty === 'CONDITIONAL' || i.certainty === 'UNCERTAIN').length,
    inferredCount: dedupedItems.filter(i => i.dateType === 'relative_duration').length,
    uncertainCount: dedupedItems.filter(i => i.dateType === 'conditional_trigger' || i.certainty === 'CONDITIONAL' || i.certainty === 'UNCERTAIN').length,
    categories: {
      startDate: dedupedItems.filter(i => i.category === 'START_DATE').length,
      expirationDate: dedupedItems.filter(i => i.category === 'EXPIRATION_DATE').length,
      renewalDate: dedupedItems.filter(i => i.category === 'RENEWAL_DATE').length,
      noticePeriod: dedupedItems.filter(i => i.category === 'NOTICE_PERIOD').length,
      terminationDeadline: dedupedItems.filter(i => i.category === 'TERMINATION_DEADLINE').length,
      paymentDeadline: dedupedItems.filter(i => i.category === 'PAYMENT_DEADLINE').length,
      affirmativeObligation: dedupedItems.filter(i => i.category === 'AFFIRMATIVE_OBLIGATION').length,
    },
    rawImportantDates: importantDatesFromNer,
  };

  return {
    documentId: docObj._id || null,
    documentName: docObj.originalName || null,
    summary,
    timeline: dedupedItems,
    obligations: dedupedItems,
  };
}

/**
 * Generates an RFC 5545 iCalendar (.ics) string for a contract deadline reminder.
 */
function generateIcsCalendar(reminder, document) {
  const now = new Date();
  const dtStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const targetDate = reminder.dueDate || reminder.reminderDate;
  const dtStart = new Date(targetDate).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const uid = `lm-reminder-${reminder._id}@legalmindai.local`;
  const summary = `LegalMind AI: ${reminder.title} [${document.originalName}]`;
  const description = `${reminder.title}\\nDocument: ${document.originalName}\\nCategory: ${reminder.category}\\nNotes: ${reminder.notes || 'None'}\\nObligation ID: ${reminder.obligationId}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LegalMind AI//Contract Obligations & Reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Contract Deadline Reminder',
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

module.exports = {
  extractContractObligations,
  parseCalendarDate,
  toIsoDate,
  normalizeDisplayTerms,
  generateIcsCalendar,
};
