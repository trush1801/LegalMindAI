// ============================================================
// Contract Obligations and Important Dates Intelligence Engine
// Step 12: High-reliability extraction, classification,
// timeline reconstruction, and uncertainty qualification.
// ============================================================

const fs = require('fs');

/**
 * Normalizes text and whitespace
 */
function cleanText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\r\n/g, '\n').replace(/\t/g, ' ').replace(/ +/g, ' ').trim();
}

/**
 * Attempts to parse human legal dates into ISO Date objects
 */
function parseCalendarDate(str) {
  if (!str || typeof str !== 'string') return null;
  const cleaned = str
    .replace(/(?:st|nd|rd|th),?/gi, '')
    .replace(/[()]/g, '')
    .trim();

  const timestamp = Date.parse(cleaned);
  if (!isNaN(timestamp)) {
    const d = new Date(timestamp);
    // Sanity check year between 1990 and 2100
    if (d.getFullYear() >= 1990 && d.getFullYear() <= 2100) {
      return d;
    }
  }
  return null;
}

/**
 * Formats a Date object cleanly as YYYY-MM-DD
 */
function toIsoDate(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
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
  // 1. Resolve full document text
  let rawText = '';
  if (document.filePath && fs.existsSync(document.filePath)) {
    try {
      rawText = fs.readFileSync(document.filePath, 'utf8');
    } catch {
      // fallback
    }
  }
  if (!rawText && metadata && metadata.extractedText) {
    rawText = metadata.extractedText;
  }
  if (!rawText && analysis && analysis.summary && analysis.summary.fullSummary) {
    rawText = analysis.summary.fullSummary;
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
    /(?:entered\s+into\s+as\s+of|effective\s+(?:as\s+of|date:?)|commencing\s+on|dated\s+as\s+of|agreement\s+date:?)\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4}|\d{4}-\d{2}-\d{2})/i,
    /(?:as\s+of\s+this\s+)(\d{1,2}(?:st|nd|rd|th)?\s+day\s+of\s+[A-Za-z]+,?\s+\d{4})/i,
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
    /(?:initial\s+term\s+(?:is|shall\s+be)|term\s+of\s+(?:this\s+agreement\s+is|the\s+agreement\s+is|employment\s+is)|period\s+of)\s*(\d+)\s*(months?|years?|days?)/i,
    /(?:shall\s+continue\s+in\s+effect\s+for\s*(?:a\s+period\s+of\s*)?)(\d+)\s*(months?|years?|days?)/i,
    /(?:for\s+an\s+initial\s+period\s+of)\s*(\d+)\s*(months?|years?)/i,
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
  const explicitExpiryRegex = /(?:shall\s+expire\s+on|shall\s+terminate\s+on|expiration\s+date\s*:?)\s*([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{4}-\d{2}-\d{2})/i;
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
  const renewalRegex = /(?:automatic(?:ally)?\s+renew|renewal\s+term|renewed\s+for\s+successive\s+periods|option\s+to\s+renew|extend\s+this\s+agreement)[^.\n]{0,250}\./i;
  const renewalMatch = cleanedDocText.match(renewalRegex);

  if (renewalMatch) {
    // Check if notice window specified for non-renewal
    const renewalNoticeMatch = renewalMatch[0].match(/(\d+)\s*(days?|months?)/i);
    const renewalNotice = renewalNoticeMatch ? `${renewalNoticeMatch[1]} ${renewalNoticeMatch[2]}` : 'Advance Notice';

    items.push({
      id: 'ob-renewal-window',
      category: 'RENEWAL_DATE',
      title: 'Contract Automatic Renewal / Extension',
      date: `Successive Terms (Notice: ${renewalNotice})`,
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
    /(?:either\s+party\s+may\s+terminate[^.\n]{0,100}?(?:providing|delivering|with)\s+([a-zA-Z0-9\(\)\s]+?\s*(?:business\s+)?days?|[a-zA-Z0-9\(\)\s]+?\s*months?)\s+(?:advance\s+)?written\s+notice)/i,
    /(?:notice\s+period\s+of\s+([a-zA-Z0-9\(\)\s]+?\s*days?|[a-zA-Z0-9\(\)\s]+?\s*months?))/i,
    /(?:terminated\s+with\s+([a-zA-Z0-9\(\)\s]+?\s*days?|[a-zA-Z0-9\(\)\s]+?\s*months?)\s+notice)/i,
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
    items.push({
      id: 'ob-notice-period',
      category: 'NOTICE_PERIOD',
      title: 'Termination for Convenience Notice Period',
      date: `${foundNotice} Written Notice`,
      parsedDate: null,
      dateType: 'relative_duration',
      certainty: 'EXPLICIT',
      uncertaintyReason: null,
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
  const causeRegex = /(?:immediate\s+termination|terminate\s+immediately)[^.\n]{0,200}\./i;
  const causeMatch = cleanedDocText.match(causeRegex);
  if (causeMatch) {
    items.push({
      id: 'ob-termination-cause',
      category: 'TERMINATION_DEADLINE',
      title: 'Immediate Termination for Cause / Breach',
      date: 'Immediate / Upon Notice',
      parsedDate: null,
      dateType: 'conditional_trigger',
      certainty: 'EXPLICIT',
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
  const cureRegex = /(?:suspend\s+services|cure\s+period|remedy\s+such\s+breach)[^.\n]{0,60}?(\d+\s*(?:business\s+)?days?)/i;
  const cureMatch = cleanedDocText.match(cureRegex);
  if (cureMatch) {
    const cureWindow = cureMatch[1];
    items.push({
      id: 'ob-cure-period',
      category: 'TERMINATION_DEADLINE',
      title: 'Default Cure Window & Service Suspension',
      date: `${cureWindow} Cure Period`,
      parsedDate: null,
      dateType: 'relative_duration',
      certainty: 'EXPLICIT',
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
    /(?:billed|payable)\s*(monthly|quarterly|annually|bi-weekly|in\s+advance|within\s+\d+\s*days)/i,
    /(?:within\s+(\d+)\s*(?:calendar\s+|business\s+)?days?\s+(?:of\s+receipt|following\s+invoice|of\s+invoice))/i,
    /(?:net\s+(\d+)\s*days?)/i,
    /(?:late\s+payments?\s+accrue\s+interest\s+at\s+[\d\.]+\%\s+per\s+month)/i,
  ];

  for (const reg of paymentRegexes) {
    const match = cleanedDocText.match(reg);
    if (match) {
      const matchIdx = match.index;
      const sStart = Math.max(0, cleanedDocText.lastIndexOf('\n', matchIdx));
      const sEnd = cleanedDocText.indexOf('\n', matchIdx + match[0].length);
      const paymentExcerpt = cleanedDocText.substring(sStart, sEnd !== -1 ? sEnd : matchIdx + 200).trim();

      items.push({
        id: `ob-payment-${items.length}`,
        category: 'PAYMENT_DEADLINE',
        title: 'Payment Schedule & Billing Deadline',
        date: match[0].trim(),
        parsedDate: null,
        dateType: match[1]?.includes('days') ? 'relative_duration' : 'periodic_milestone',
        certainty: 'EXPLICIT',
        uncertaintyReason: null,
        sourcePassage: paymentExcerpt,
        page: 1,
        section: 'Compensation & Payment',
        party: 'Obligated Payor',
        actionRequired: 'Disburse scheduled compensation or invoice payments according to terms.',
        reminderApplicable: true,
      });
      break;
    }
  }

  // ────────────────────────────────────────────────────────────
  // 7. OTHER EXPLICITLY STATED OBLIGATIONS & RESTRICTIVE COVENANTS
  // ────────────────────────────────────────────────────────────

  // A. Post-termination Non-Compete Period
  const nonCompeteRegex = /(?:not\s+to\s+engage\s+in\s+competing|shall\s+not\s+compete)[^.\n]{0,120}?for\s+(?:a\s+period\s+of\s*)?(?:[a-zA-Z]+\s+)?\(?(\d+)\)?\s*(months?|years?)/i;
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
  const leaveRegex = /(?:entitled\s+to)\s*(\d+\s*(?:business\s+|calendar\s+)?days?\s+of\s+paid\s+(?:vacation|leave)[^.\n]{0,100})/i;
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
  const confRegex = /(?:confidentiality|proprietary\s+information)[^.\n]{0,100}?(?:for\s+(\d+\s*(?:years?|months?))|during\s+employment\s+and\s+for\s+(\d+\s*years?)\s+thereafter|perpetual|indefinite)/i;
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
  const breachNotifyRegex = /(?:notify\s+(?:client|company|employer)[^.\n]{0,80}?within\s+(\d+\s*(?:hours?|business\s+days?|days?))\s+of\s+(?:discovery|breach|incident))/i;
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
  const indemRegex = /(?:indemnify\s+(?:and\s+hold\s+harmless\s+)?(?:the\s+)?(?:employer|client|company|provider)[^.\n]{0,250}\.)/i;
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

  // Deduplicate items by ID
  const dedupedItems = [];
  const seenIds = new Set();
  for (const item of items) {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      dedupedItems.push(item);
    }
  }

  // Build summary metrics
  const summary = {
    totalItems: dedupedItems.length,
    explicitCount: dedupedItems.filter(i => i.certainty === 'EXPLICIT').length,
    inferredCount: dedupedItems.filter(i => i.certainty === 'INFERRED').length,
    uncertainCount: dedupedItems.filter(i => i.certainty === 'UNCERTAIN' || i.certainty === 'CONDITIONAL').length,
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
    documentId: document._id,
    documentName: document.originalName,
    summary,
    timeline: dedupedItems,
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
  generateIcsCalendar,
};
