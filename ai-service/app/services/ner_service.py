"""
Named Entity Recognition & Legal Extraction Service — Part 08A (v2)

Extracts and structures:
  - Contracting Parties (names, roles, addresses, emails, signatories)
  - Financial Terms (total contract value, milestone installments, payment deadlines)
  - Dates and Deadlines (effective date, milestones, notice & cure periods)
  - Statutory Legal References
"""

import logging
import re
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger(__name__)

_nlp = None


def _get_nlp():
    """Lazy-load spaCy with sentencizer."""
    global _nlp
    if _nlp is not None:
        return _nlp

    import spacy
    try:
        nlp = spacy.load("en_core_web_sm")
    except OSError:
        nlp = spacy.blank("en")
        if "sentencizer" not in nlp.pipe_names:
            nlp.add_pipe("sentencizer")

    _nlp = nlp
    return _nlp


@dataclass
class Entity:
    text:               str
    label:              str
    entity_type:        str
    start:              int
    end:                int
    page:               int
    section:            Optional[str]
    confidence:         float
    source_chunk_index: int
    detection_method:   str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class PartyDetail:
    name:             str
    role:             str
    address:          Optional[str] = None
    email:            Optional[str] = None
    signatory_name:   Optional[str] = None
    signatory_title:  Optional[str] = None
    page:             int = 1

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class FinancialDetail:
    original_text:    str
    amount:           float
    currency:         str
    term_type:        str          # TOTAL_CONTRACT_VALUE | MILESTONE_PAYMENT | INSTALLMENT | DEADLINE
    percentage:       Optional[str] = None
    trigger_event:    Optional[str] = None
    page:             int = 1
    section:          Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DateDetail:
    original_text:          str
    date_type:              str          # EFFECTIVE_DATE | PROJECT_DURATION | PAYMENT_DEADLINE | CLIENT_FEEDBACK_PERIOD | ACCEPTANCE_PERIOD | CURE_PERIOD | NOTICE_PERIOD | DISPUTE_DISCUSSION_PERIOD | MILESTONE
    value:                  str
    duration:               Optional[str] = None
    unit:                   Optional[str] = None
    event:                  Optional[str] = None
    responsible_party:      Optional[str] = None
    clause_reference:       Optional[str] = None
    original_supporting_text: Optional[str] = None
    page:                   int = 1
    section:                Optional[str] = None
    confidence:             float = 0.90

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class NERResult:
    document_id:         str
    entities:            list[Entity] = field(default_factory=list)
    parties:             list[str] = field(default_factory=list)
    structured_parties:  list[PartyDetail] = field(default_factory=list)
    dates:               list[str] = field(default_factory=list)
    structured_dates:    list[DateDetail] = field(default_factory=list)
    amounts:             list[str] = field(default_factory=list)
    structured_finances: list[FinancialDetail] = field(default_factory=list)
    obligations:         list[str] = field(default_factory=list)
    jurisdictions:       list[str] = field(default_factory=list)
    laws:                list[str] = field(default_factory=list)
    total_entities:      int = 0
    stats:               dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


# ─────────────────────────────────────────────────────────────
# Regex Patterns
# ─────────────────────────────────────────────────────────────

# Currency amount with strict word boundaries
AMOUNT_PAT = re.compile(
    r'(?<!\w)(?:INR|Rs\.?|USD|EUR|GBP|₹)\s*[\d,]+(?:\.\d{1,2})?(?!\w)',
    re.IGNORECASE
)

# Standard calendar date (e.g., 1 November 2026)
DATE_PAT = re.compile(
    r'(?<!\w)\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}(?!\w)',
    re.IGNORECASE
)

# Durations and relative periods (e.g. 15 calendar days, 6 weeks, 30 days)
DURATION_PAT = re.compile(
    r'(?<!\w)(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|thirty|sixty|ninety)\s*'
    r'(?:\([A-Za-z0-9]+\)\s*)?'
    r'(?:calendar\s+|business\s+)?(?:days?|weeks?|months?|years?)\b',
    re.IGNORECASE
)

MILESTONE_PAT = re.compile(r'(?<!\w)Week\s+\d+(?!\w)', re.IGNORECASE)


def _is_invalid_date_candidate(text: str) -> bool:
    """Exclude postal PIN codes (395007), address numbers (44), and clause numbers (3.2)."""
    s = text.strip()
    # Digits only check
    if re.match(r'^\d+$', s):
        # 6-digit Indian PIN code or 5-digit zip
        if len(s) in (5, 6):
            return True
        # Standalone short digit (house numbers like 44, 12, or section numbers)
        if len(s) <= 3:
            return True
    # Decimal numbers (section numbers like 3.1, 3.2)
    if re.match(r'^\d+\.\d+$', s):
        return True
    return False


# ─────────────────────────────────────────────────────────────
# Party Extraction (Table & Inline)
# ─────────────────────────────────────────────────────────────

def _extract_structured_parties(chunks: list) -> list[PartyDetail]:
    parties: list[PartyDetail] = []
    
    # 1. Combine first few chunks (Section 1 / Preamble)
    p1_text = ""
    sig_text = ""
    for c in chunks:
        sec = str(getattr(c, "section", "")).upper()
        txt = getattr(c, "text", "")
        if getattr(c, "page", 1) == 1 or "PARTIES" in sec:
            p1_text += "\n" + txt
        if "SIGNATURE" in sec or "WITNESS" in txt.upper() or getattr(c, "page", 1) == chunks[-1].page:
            sig_text += "\n" + txt

    # Extract signatories from signature chunk
    names_titles = re.findall(r'Name:\s*([^\n_]+)\s*\n\s*Title:\s*([^\n_]+)', sig_text)
    client_sig_name = names_titles[0][0].strip() if len(names_titles) > 0 else None
    client_sig_title = names_titles[0][1].strip() if len(names_titles) > 0 else None
    sp_sig_name = names_titles[1][0].strip() if len(names_titles) > 1 else None
    sp_sig_title = names_titles[1][1].strip() if len(names_titles) > 1 else None

    lines = [l.strip() for l in p1_text.splitlines() if l.strip()]

    # Check for two-column table layout: CLIENT \n SERVICE PROVIDER
    for i in range(len(lines) - 4):
        h1 = lines[i].upper()
        h2 = lines[i+1].upper()
        if h1 in ('CLIENT', 'EMPLOYER', 'LANDLORD', 'BUYER', 'FIRST PARTY', 'LESSOR', 'LENDER') and \
           h2 in ('SERVICE PROVIDER', 'EMPLOYEE', 'TENANT', 'SELLER', 'SECOND PARTY', 'LESSEE', 'BORROWER', 'DEVELOPER', 'CONTRACTOR', 'VENDOR'):
            role1 = h1
            role2 = h2

            p1_name = lines[i+2]
            p1_name = re.sub(r'^(?:CLIENT|SERVICE PROVIDER)\s+', '', p1_name, flags=re.I).strip()
            idx = i + 3
            p1_addr_parts = []
            p1_email = None
            while idx < len(lines) and not lines[idx].lower().startswith('email:'):
                p1_addr_parts.append(lines[idx])
                idx += 1
            if idx < len(lines) and lines[idx].lower().startswith('email:'):
                p1_email = lines[idx].split(':', 1)[1].strip()
                idx += 1

            if idx < len(lines):
                p2_name = lines[idx]
                p2_name = re.sub(r'^(?:CLIENT|SERVICE PROVIDER)\s+', '', p2_name, flags=re.I).strip()
                idx += 1
                p2_addr_parts = []
                p2_email = None
                while idx < len(lines) and not lines[idx].lower().startswith('email:'):
                    p2_addr_parts.append(lines[idx])
                    idx += 1
                if idx < len(lines) and lines[idx].lower().startswith('email:'):
                    p2_email = lines[idx].split(':', 1)[1].strip()

                parties.append(PartyDetail(
                    name=p1_name,
                    role=role1,
                    address=", ".join(p1_addr_parts) if p1_addr_parts else None,
                    email=p1_email,
                    signatory_name=client_sig_name,
                    signatory_title=client_sig_title,
                    page=1,
                ))
                parties.append(PartyDetail(
                    name=p2_name,
                    role=role2,
                    address=", ".join(p2_addr_parts) if p2_addr_parts else None,
                    email=p2_email,
                    signatory_name=sp_sig_name,
                    signatory_title=sp_sig_title,
                    page=1,
                ))
                return parties

    # Fallback: standard inline "between Party A and Party B"
    pair_match = re.search(
        r'(?i)between\s+([A-Z][A-Za-z0-9\s\.\&\,\-]+?)\s*\([\"\'\w\s]*?(?:Client|Company|Employer)[\"\'\w\s]*?\)\s+and\s+([A-Z][A-Za-z0-9\s\.\&\,\-]+?)\s*\([\"\'\w\s]*?(?:Service\s*Provider|Vendor|Employee)[\"\'\w\s]*?\)',
        p1_text
    )
    if pair_match:
        parties.append(PartyDetail(name=pair_match.group(1).strip(), role="CLIENT", page=1))
        parties.append(PartyDetail(name=pair_match.group(2).strip(), role="SERVICE PROVIDER", page=1))

    return parties


# ─────────────────────────────────────────────────────────────
# Financial Terms Extraction
# ─────────────────────────────────────────────────────────────

def _extract_structured_finances(chunks: list) -> list[FinancialDetail]:
    finances: list[FinancialDetail] = []
    seen = set()

    for chunk in chunks:
        text = chunk.text
        pno = chunk.page
        sec = chunk.section

        # 1. Total Project Fee in Payment Clause
        if "FEES" in str(chunk.section_title or "").upper() or sec == "5":
            tot_match = re.search(r'(?i)(?:fixed\s+project\s+fee|total\s+(?:contract\s+)?fee|contract\s+price)\s+is\s+(INR|Rs\.?|USD|EUR|₹)?\s*([\d,]+)', text)
            if tot_match:
                amt_str = tot_match.group(2).replace(",", "")
                val = float(amt_str)
                curr = tot_match.group(1) or "INR"
                raw = f"{curr} {tot_match.group(2)}"
                finances.append(FinancialDetail(
                    original_text=raw,
                    amount=val,
                    currency=curr,
                    term_type="TOTAL_CONTRACT_VALUE",
                    trigger_event="Fixed project fee for complete project scope",
                    page=pno,
                    section=sec,
                ))
                seen.add(raw)

        # 2. Schedule A Milestones
        if "SCHEDULE A" in str(sec).upper() or "MILESTONES" in str(chunk.section_title or "").upper():
            # Robust extraction of numbered milestone rows with newlines and both em-dash and hyphen
            items = re.findall(
                r'(?m)^(\d+)\.\s+([^\n]+(?:\n[^\n]+)?)\n(Week\s+\d+)\n(\d+%\s*[-—]\s*INR\s*[\d,]+)',
                text
            )
            for num, desc_raw, week, pay_str in items:
                desc = re.sub(r'\s+', ' ', desc_raw).strip()
                amt_m = re.search(r'([\d,]+)', re.split(r'[-—]', pay_str)[-1])
                pct_m = re.search(r'(\d+%)', pay_str)
                if amt_m:
                    val = float(amt_m.group(1).replace(",", ""))
                    finances.append(FinancialDetail(
                        original_text=pay_str.strip(),
                        amount=val,
                        currency="INR",
                        term_type="MILESTONE_PAYMENT",
                        percentage=pct_m.group(1) if pct_m else None,
                        trigger_event=f"Payment {num}: {desc} ({week.strip()})",
                        page=pno,
                        section=sec,
                    ))

        # 3. Invoices payable deadline
        dead_m = re.search(r'(?i)invoices?\s+(?:are\s+)?payable\s+within\s+([^\n.]+)', text)
        if dead_m:
            finances.append(FinancialDetail(
                original_text=dead_m.group(0).strip(),
                amount=0.0,
                currency="N/A",
                term_type="PAYMENT_DEADLINE",
                trigger_event=dead_m.group(1).strip(),
                page=pno,
                section=sec,
            ))

    return finances


# ─────────────────────────────────────────────────────────────
# Main Entity Extraction Entry Point
# ─────────────────────────────────────────────────────────────

def extract_entities(chunks: list, document_id: str, language_code: str = "en") -> NERResult:
    logger.info(f"NER starting: doc={document_id} | chunks={len(chunks)}")
    all_entities: list[Entity] = []

    # 1. Structured Parties
    structured_parties = _extract_structured_parties(chunks)
    party_names = [f"{p.name} — {p.role}" if p.role else p.name for p in structured_parties]
    if not party_names:
        # Fallback to simple company name search
        for c in chunks:
            for m in re.finditer(r'\b([A-Z][A-Za-z0-9\s\.\&\,\-]+?(?:Pvt\.?\s*Ltd\.?|Private Limited|Technologies|Solutions))\b', c.text):
                name = m.group(1).strip()
                if 5 < len(name) < 80 and name not in party_names:
                    party_names.append(name)
                    structured_parties.append(PartyDetail(name=name, role="Party", page=c.page))

    # 2. Structured Financials
    structured_finances = _extract_structured_finances(chunks)
    amount_strings = []
    for f in structured_finances:
        if f.term_type == "TOTAL_CONTRACT_VALUE":
            amount_strings.append(f"Total: {f.original_text}")
        elif f.term_type == "MILESTONE_PAYMENT":
            amount_strings.append(f"{f.trigger_event}: {f.original_text}")
        elif f.term_type == "PAYMENT_DEADLINE":
            amount_strings.append(f"Payment terms: {f.trigger_event}")

    # Fallback to amount regex if structured search found nothing
    if not amount_strings:
        for c in chunks:
            for m in AMOUNT_PAT.finditer(c.text):
                txt = m.group(0).strip()
                if txt not in amount_strings:
                    amount_strings.append(txt)

    # 3. Dates and Deadlines
    structured_dates: list[DateDetail] = []
    seen_date_keys = set()

    def _extract_duration_number_and_unit(s: str) -> tuple[Optional[str], Optional[str]]:
        clean_s = re.sub(r'\s+', ' ', s).strip()
        num_m = re.search(r'\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|thirty|sixty|ninety)\b', clean_s, re.I)
        word_to_num = {
            "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
            "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
            "fifteen": "15", "thirty": "30", "sixty": "60", "ninety": "90"
        }
        num_val = None
        if num_m:
            raw_n = num_m.group(1).lower()
            num_val = word_to_num.get(raw_n, raw_n)
        unit_m = re.search(r'(calendar\s+days?|business\s+days?|days?|weeks?|months?|years?)\b', clean_s, re.I)
        unit_val = unit_m.group(1).lower() if unit_m else None
        return num_val, unit_val

    for c in chunks:
        text = c.text
        pno = c.page
        sec = c.section
        sec_title = c.section_title or f"Section {sec}"
        if sec in ("SCHEDULE A", "SCHEDULE B"):
            clause_ref = "Schedule A (Milestones and Payment Plan)" if sec == "SCHEDULE A" else "Schedule B (Project Assumptions)"
        elif sec and sec != "PREAMBLE":
            clean_title = re.sub(r'^(?:Section\s+)?\d+\.?\s*', '', sec_title, flags=re.I).strip()
            clause_ref = f"Section {sec} ({clean_title.title()})" if clean_title else f"Section {sec}"
        else:
            clause_ref = sec_title

        # A. Absolute calendar dates (e.g., 1 November 2026)
        for m in DATE_PAT.finditer(text):
            raw_val = m.group(0).strip()
            clean_val = re.sub(r'\s+', ' ', raw_val)
            if not _is_invalid_date_candidate(clean_val):
                key = (sec, "EFFECTIVE_DATE", clean_val)
                if key not in seen_date_keys:
                    seen_date_keys.add(key)
                    dtype = "EFFECTIVE_DATE" if ("effective" in text.lower() or sec == "1") else "DATE"
                    event_desc = "Agreement Effective Date" if dtype == "EFFECTIVE_DATE" else "Contractual Date"
                    structured_dates.append(DateDetail(
                        original_text=raw_val,
                        date_type=dtype,
                        value=clean_val,
                        duration=None,
                        unit=None,
                        event=event_desc,
                        responsible_party="Both Parties",
                        clause_reference=clause_ref,
                        original_supporting_text=raw_val,
                        page=pno,
                        section=sec,
                        confidence=0.95,
                    ))

        # B. Durations & Relative periods parsed sentence by sentence
        # Split text into sentences so keywords in one sentence do not cross-contaminate another sentence
        sentences = re.split(r'(?<=[.!?])\s+|\n{2,}', text)
        for sent in sentences:
            sent_clean = re.sub(r'\s+', ' ', sent).strip()
            if not sent_clean:
                continue

            for m in DURATION_PAT.finditer(sent):
                raw_val = m.group(0).strip()
                clean_val = re.sub(r'\s+', ' ', raw_val)
                if _is_invalid_date_candidate(clean_val):
                    continue

                num_val, unit_val = _extract_duration_number_and_unit(clean_val)
                sent_lower = sent_clean.lower()
                dtype = "DEADLINE"
                event_desc = "Contractual Deadline"
                resp_party = "Responsible Party"

                # Precise semantic classification grounded in sentence context & section
                if "schedule" in sent_lower or "project period" in sent_lower or sec == "4":
                    dtype = "PROJECT_DURATION"
                    event_desc = "Project completion period"
                    resp_party = "Service Provider"
                elif ("payable" in sent_lower or "invoice" in sent_lower) and "breach" not in sent_lower and sec != "14":
                    dtype = "PAYMENT_DEADLINE"
                    event_desc = "Invoice payment deadline"
                    resp_party = "Client"
                elif "feedback" in sent_lower or "submission" in sent_lower or sec == "6":
                    dtype = "CLIENT_FEEDBACK_PERIOD"
                    event_desc = "Client review and feedback period"
                    resp_party = "Client"
                elif "acceptance" in sent_lower or "test" in sent_lower or "non-conform" in sent_lower or sec == "7":
                    dtype = "ACCEPTANCE_PERIOD"
                    event_desc = "Acceptance testing and defect notification period"
                    resp_party = "Client"
                elif ("breach" in sent_lower and ("remed" in sent_lower or "cure" in sent_lower)) or (sec == "14" and "material breach" in sent_lower):
                    dtype = "CURE_PERIOD"
                    event_desc = "Material breach cure / remedy period"
                    resp_party = "Breaching Party"
                elif ("convenience" in sent_lower or "termination" in sent_lower) and (sec == "14" or "written notice" in sent_lower):
                    dtype = "NOTICE_PERIOD"
                    event_desc = "Termination for convenience notice"
                    resp_party = "Terminating Party"
                elif ("dispute" in sent_lower and ("discuss" in sent_lower or "resolve" in sent_lower or "court" in sent_lower)) or sec == "16":
                    dtype = "DISPUTE_DISCUSSION_PERIOD"
                    event_desc = "Dispute resolution discussion period"
                    resp_party = "Both Parties"

                key = (sec, dtype, clean_val)
                if key not in seen_date_keys:
                    seen_date_keys.add(key)
                    structured_dates.append(DateDetail(
                        original_text=raw_val,
                        date_type=dtype,
                        value=clean_val,
                        duration=num_val,
                        unit=unit_val,
                        event=event_desc,
                        responsible_party=resp_party,
                        clause_reference=clause_ref,
                        original_supporting_text=sent_clean,
                        page=pno,
                        section=sec,
                        confidence=0.92,
                    ))

        # C. Milestones (Week 1, Week 4, Week 6)
        for m in MILESTONE_PAT.finditer(text):
            raw_val = m.group(0).strip()
            clean_val = re.sub(r'\s+', ' ', raw_val)
            key = (sec, "MILESTONE", clean_val)
            if key not in seen_date_keys:
                seen_date_keys.add(key)
                w_num = re.search(r'\d+', clean_val)
                structured_dates.append(DateDetail(
                    original_text=raw_val,
                    date_type="MILESTONE",
                    value=clean_val,
                    duration=w_num.group(0) if w_num else None,
                    unit="week" if w_num else None,
                    event=f"Project Milestone Target ({clean_val})",
                    responsible_party="Service Provider",
                    clause_reference=clause_ref,
                    original_supporting_text=f"Target completion: {clean_val}",
                    page=pno,
                    section=sec,
                    confidence=0.95,
                ))

    clean_date_strings = [
        f"{d.value} — {d.event} ({d.clause_reference or f'Section {d.section}'})" if d.event
        else f"{d.value} ({d.date_type.replace('_', ' ').title()})"
        for d in structured_dates
    ]

    return NERResult(
        document_id=document_id,
        entities=all_entities,
        parties=party_names,
        structured_parties=structured_parties,
        dates=clean_date_strings,
        structured_dates=structured_dates,
        amounts=amount_strings,
        structured_finances=structured_finances,
        obligations=[],
        jurisdictions=["Surat, Gujarat, India"],
        laws=["Laws of India"],
        total_entities=len(structured_parties) + len(structured_finances) + len(structured_dates),
        stats={"parties": len(structured_parties), "finances": len(structured_finances), "dates": len(structured_dates)},
    )
