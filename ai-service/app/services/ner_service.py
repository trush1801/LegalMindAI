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
    semantic_category:      str = "DEADLINE"  # DEADLINE | DURATION | EFFECTIVE_DATE | EXPIRY_DATE | NOTICE_PERIOD | SURVIVAL_PERIOD | RECURRING_FREQUENCY | CONDITION_TRIGGERED_PERIOD

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
    r'(?:calendar\s+|business\s+)?(?:hours?|days?|weeks?|months?|years?)\b',
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

    # Section/heading strings that must NEVER be treated as party names
    _SECTION_HEADINGS_BLACKLIST = {
        "signatures", "signature", "witness", "witnesses", "execution",
        "signatories", "authorized signatory", "in witness whereof",
        "signed by", "for and on behalf", "schedule", "annexure", "exhibit",
        "appendix", "schedule a", "schedule b", "preamble",
    }

    # Supported role headings (two-column table pattern)
    _ROLE1_HEADERS = {
        "CLIENT", "EMPLOYER", "LANDLORD", "BUYER", "FIRST PARTY",
        "LESSOR", "LENDER", "COMPANY", "THE COMPANY",
    }
    _ROLE2_HEADERS = {
        "SERVICE PROVIDER", "EMPLOYEE", "TENANT", "SELLER", "SECOND PARTY",
        "LESSEE", "BORROWER", "DEVELOPER", "CONTRACTOR", "VENDOR", "THE EMPLOYEE",
    }
    _ROLE_CANONICAL = {
        "CLIENT": "CLIENT", "EMPLOYER": "EMPLOYER", "LANDLORD": "LANDLORD",
        "BUYER": "BUYER", "FIRST PARTY": "FIRST PARTY", "LESSOR": "LESSOR",
        "LENDER": "LENDER", "COMPANY": "COMPANY", "THE COMPANY": "COMPANY",
        "SERVICE PROVIDER": "SERVICE PROVIDER", "EMPLOYEE": "EMPLOYEE",
        "TENANT": "TENANT", "SELLER": "SELLER", "SECOND PARTY": "SECOND PARTY",
        "LESSEE": "LESSEE", "BORROWER": "BORROWER", "DEVELOPER": "DEVELOPER",
        "CONTRACTOR": "CONTRACTOR", "VENDOR": "VENDOR", "THE EMPLOYEE": "EMPLOYEE",
    }

    # 1. Combine first few chunks (Section 1 / Preamble) for party search
    p1_text = ""
    sig_text = ""
    for c in chunks:
        sec = str(getattr(c, "section", "")).upper()
        txt = getattr(c, "text", "")
        if getattr(c, "page", 1) == 1 or "PARTIES" in sec or sec == "1":
            p1_text += "\n" + txt
        # Only gather signature data for signatory name extraction
        if "SIGNATURE" in sec or "WITNESS" in txt.upper():
            sig_text += "\n" + txt

    # Extract signatories from signature chunk (names/titles only — not party entities)
    names_titles = re.findall(r'Name:\s*([^\n_]+)\s*\n\s*Title:\s*([^\n_]+)', sig_text)
    client_sig_name = names_titles[0][0].strip() if len(names_titles) > 0 else None
    client_sig_title = names_titles[0][1].strip() if len(names_titles) > 0 else None
    sp_sig_name = names_titles[1][0].strip() if len(names_titles) > 1 else None
    sp_sig_title = names_titles[1][1].strip() if len(names_titles) > 1 else None

    lines = [l.strip() for l in p1_text.splitlines() if l.strip()]

    # Check for two-column table layout: ROLE1 \n ROLE2 \n Name1 ... \n Name2
    for i in range(len(lines) - 4):
        h1 = lines[i].upper()
        h2 = lines[i + 1].upper()

        # Skip if either header is a blacklisted section heading
        if h1.lower() in _SECTION_HEADINGS_BLACKLIST or h2.lower() in _SECTION_HEADINGS_BLACKLIST:
            continue

        if h1 in _ROLE1_HEADERS and h2 in _ROLE2_HEADERS:
            role1 = _ROLE_CANONICAL.get(h1, h1)
            role2 = _ROLE_CANONICAL.get(h2, h2)

            p1_name = lines[i + 2]
            p1_name = re.sub(r'^(?:CLIENT|SERVICE PROVIDER|COMPANY|EMPLOYEE)\s+', '', p1_name, flags=re.I).strip()

            # Guard: skip if extracted "name" is itself a blacklisted heading or too short
            if p1_name.lower() in _SECTION_HEADINGS_BLACKLIST or len(p1_name) < 3:
                continue

            idx = i + 3
            p1_addr_parts = []
            p1_email = None
            while idx < len(lines) and not lines[idx].lower().startswith('email:'):
                # Stop if we hit another role header
                if lines[idx].upper() in _ROLE2_HEADERS or lines[idx].upper() in _ROLE1_HEADERS:
                    break
                p1_addr_parts.append(lines[idx])
                idx += 1
            if idx < len(lines) and lines[idx].lower().startswith('email:'):
                p1_email = lines[idx].split(':', 1)[1].strip()
                idx += 1

            if idx < len(lines):
                p2_name = lines[idx]
                p2_name = re.sub(r'^(?:CLIENT|SERVICE PROVIDER|COMPANY|EMPLOYEE)\s+', '', p2_name, flags=re.I).strip()

                # Guard: skip if extracted "name" is a blacklisted heading
                if p2_name.lower() in _SECTION_HEADINGS_BLACKLIST or len(p2_name) < 3:
                    idx += 1
                    if idx < len(lines):
                        p2_name = lines[idx]
                        p2_name = re.sub(r'^(?:CLIENT|SERVICE PROVIDER|COMPANY|EMPLOYEE)\s+', '', p2_name, flags=re.I).strip()
                        idx += 1
                else:
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

    # Fallback: standard inline "between Party A (the Company) and Party B (the Employee)"
    quote_pattern = r"['\"\u201c\u201d]"
    pair_match = re.search(
        r"(?i)between:?\s+([A-Z][A-Za-z0-9\s\.,&]+?)"
        r"(?:,\s*(?:a|an|having|with|residing|located)\s+[^\n(]+?)?"
        r"\s*\(\s*(?:the\s*)?" + quote_pattern + r"?\s*(Company|Client|Employer|Landlord|Lessor|Buyer|Lender)\s*" + quote_pattern + r"?\s*\)"
        r"\s*,?\s*and\s+([A-Z][A-Za-z0-9\s\.,&]+?)"
        r"(?:,\s*(?:a|an|having|with|residing|located)\s+[^\n(]+?)?"
        r"\s*\(\s*(?:the\s*)?" + quote_pattern + r"?\s*(Employee|Service\s*Provider|Vendor|Tenant|Lessee|Seller|Borrower|Developer|Contractor)\s*" + quote_pattern + r"?\s*\)",
        p1_text
    )
    if pair_match:
        p1_raw = pair_match.group(1).strip()
        r1_raw = pair_match.group(2).strip().upper()
        p2_raw = pair_match.group(3).strip()
        r2_raw = pair_match.group(4).strip().upper()

        p1_clean = re.sub(r",\s*(?:a|an|having|with|residing|located)\s+.*$", "", p1_raw).strip()
        p2_clean = re.sub(r",\s*(?:a|an|having|with|residing|located)\s+.*$", "", p2_raw).strip()

        addr1_m = re.search(r"(?i)(?:having\s+its\s+(?:principal\s+)?office\s+at|with\s+offices\s+at)\s+([^\n(]+?)\s*\(", p1_text)
        addr2_m = re.search(r"(?i)(?:residing\s+at|having\s+its\s+(?:principal\s+)?office\s+at|with\s+offices\s+at)\s+([^\n(]+?)\s*\(", p1_text)

        p1_addr = addr1_m.group(1).strip() if addr1_m else None
        p2_addr = addr2_m.group(1).strip() if addr2_m else None

        role1 = _ROLE_CANONICAL.get(r1_raw, r1_raw)
        role2 = _ROLE_CANONICAL.get(r2_raw, r2_raw)

        parties.append(PartyDetail(name=p1_clean, role=role1, address=p1_addr, page=1))
        parties.append(PartyDetail(name=p2_clean, role=role2, address=p2_addr, page=1))
        return parties

    # Secondary inline pattern: "between Party A ... and Party B ..."
    if not parties:
        inline2 = re.search(
            r"(?i)between:?\s+([A-Z][A-Za-z0-9\s\.,&]+?)(?:,\s*[^\n(]+?)?\s*\(\s*(?:the\s*)?" + quote_pattern + r"?([A-Za-z\s]+?)" + quote_pattern + r"?\s*\)"
            r"\s*,?\s*and\s+([A-Z][A-Za-z0-9\s\.,&]+?)(?:,\s*[^\n(]+?)?\s*\(\s*(?:the\s*)?" + quote_pattern + r"?([A-Za-z\s]+?)" + quote_pattern + r"?\s*\)",
            p1_text
        )
        if inline2:
            n1 = re.sub(r",\s*(?:a|an|having|with|residing|located)\s+.*$", "", inline2.group(1).strip()).strip()
            r1 = inline2.group(2).strip().upper()
            n2 = re.sub(r",\s*(?:a|an|having|with|residing|located)\s+.*$", "", inline2.group(3).strip()).strip()
            r2 = inline2.group(4).strip().upper()
            if len(n1) > 2 and len(n2) > 2 and n1.lower() not in _SECTION_HEADINGS_BLACKLIST:
                parties.append(PartyDetail(name=n1, role=_ROLE_CANONICAL.get(r1, r1), page=1))
                parties.append(PartyDetail(name=n2, role=_ROLE_CANONICAL.get(r2, r2), page=1))
                return parties

    return parties

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


def classify_temporal_semantics(raw_text: str, context: str = "") -> str:
    """
    Classify a temporal expression into one of the 8 canonical semantic classes:
      - EFFECTIVE_DATE
      - EXPIRY_DATE
      - SURVIVAL_PERIOD
      - DURATION
      - NOTICE_PERIOD
      - CONDITION_TRIGGERED_PERIOD
      - DEADLINE
      - RECURRING_FREQUENCY
    """
    combined = f"{raw_text} {context}".lower()
    if re.search(r'\b(?:effective(?:\s+date|\s+as\s+of)?|commenc\w+)\b', combined) and not re.search(r'\b(?:within|after|notice)\b', combined):
        return "EFFECTIVE_DATE"
    if re.search(r'\b(?:expir\w+|maturity(?:\s+date)?)\b', combined) and not re.search(r'\b(?:surviv\w+|after)\b', combined):
        return "EXPIRY_DATE"
    if re.search(r'\b(?:surviv\w+|continue\s+for\s+\d+|post[- ]termination|after\s+employment\s+ends)\b', combined):
        return "SURVIVAL_PERIOD"
    if re.search(r'\b(?:convenience|without\s+cause)\b.*?\bnotice\b', combined) or re.search(r'\b(?:written\s+notice\s+of|notice\s+period)\b', combined):
        return "NOTICE_PERIOD"
    if re.search(r'\b(?:after\s+becoming\s+aware|upon\s+(?:written\s+)?request|after\s+(?:the\s+)?request|following\s+notice\s+of\s+breach|remedied\s+within|cure\s+period|after\s+an?\s+incident)\b', combined):
        return "CONDITION_TRIGGERED_PERIOD"
    if re.search(r'\b(?:during\s+(?:the\s+)?employment|term\s+of\s+\d+|project\s+period\s+is|estimated\s+period)\b', combined):
        return "DURATION"
    if re.search(r'\b(?:monthly|quarterly|annually|every\s+\d+\s+days?|recurring|in\s+advance)\b', combined):
        return "RECURRING_FREQUENCY"
    if re.search(r'\b(?:within\s+\d+|payable\s+within|due\s+within|no\s+later\s+than|test\s+it\s+and|feedback\s+within)\b', combined):
        return "DEADLINE"
    return "DEADLINE"


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
    unit_m = re.search(r'(calendar\s+days?|business\s+days?|hours?|days?|weeks?|months?|years?)\b', clean_s, re.I)
    unit_val = unit_m.group(1).lower() if unit_m else None
    return num_val, unit_val


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
        # Fallback to simple company name search (avoiding signatures, appendix, or multi-line titles)
        for c in chunks:
            c_sec = str(getattr(c, "section", "")).upper()
            if "SIGNATURE" in c_sec or "APPENDIX" in c_sec or "PREAMBLE" in c_sec:
                continue
            for m in re.finditer(r'\b([A-Z][A-Za-z0-9\s\.\&\,\-]+?(?:Pvt\.?\s*Ltd\.?|Private Limited|Technologies|Solutions))\b', c.text):
                name = m.group(1).strip()
                if "\n" in name:
                    name = name.split("\n")[-1].strip()
                if any(bad in name.lower() for bad in ("signatures", "signature", "witness", "in witness", "appendix")):
                    continue
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

    for c in chunks:
        text = c.text
        pno = c.page
        sec = c.section
        sec_title = c.section_title or f"Section {sec}"
        sec_str = str(sec or "").upper()
        if "APPENDIX" in sec_str or "APPENDIX" in (sec_title or "").upper():
            continue  # Do not extract contractual deadlines or dates from testing appendices
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
                    sem_cat = "EFFECTIVE_DATE" if dtype == "EFFECTIVE_DATE" else classify_temporal_semantics(clean_val, text)
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
                        semantic_category=sem_cat,
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

                # Semantic classification based on sentence context (no hardcoded section numbers)
                sec_title_lower = str(sec_title or "").lower()
                if ("schedule" in sent_lower or "project period" in sent_lower
                        or "project duration" in sec_title_lower):
                    dtype = "PROJECT_DURATION"
                    event_desc = "Project completion period"
                    resp_party = "Service Provider"
                elif ("notif" in sent_lower
                        and ("incident" in sent_lower or "security" in sent_lower or "loss" in sent_lower or "unauthorised" in sent_lower or "breach" in sent_lower)):
                    dtype = "INCIDENT_NOTIFICATION"
                    event_desc = "Security incident notification deadline"
                    resp_party = "Receiving Party"
                elif "return" in sent_lower and ("information" in sent_lower or "property" in sent_lower or "material" in sent_lower or "document" in sent_lower):
                    dtype = "RETURN_DEADLINE"
                    event_desc = "Return of confidential information deadline"
                    resp_party = "Receiving Party"
                elif ("delet" in sent_lower or "destroy" in sent_lower or "destruction" in sent_lower):
                    dtype = "DELETION_DEADLINE"
                    event_desc = "Deletion of confidential information deadline"
                    resp_party = "Receiving Party"
                elif (("surviv" in sent_lower or "continue" in sent_lower)
                        and ("employment" in sent_lower or "terminat" in sent_lower or "expir" in sent_lower or "surviv" in sec_title_lower)):
                    dtype = "SURVIVAL_PERIOD"
                    event_desc = "Post-termination confidentiality survival period"
                    resp_party = "Both Parties"
                elif (("payable" in sent_lower or "invoice" in sent_lower)
                        and "breach" not in sent_lower and "cure" not in sent_lower):
                    dtype = "PAYMENT_DEADLINE"
                    event_desc = "Invoice payment deadline"
                    resp_party = "Client"
                elif "feedback" in sent_lower or ("submission" in sent_lower and "review" in sent_lower):
                    dtype = "CLIENT_FEEDBACK_PERIOD"
                    event_desc = "Client review and feedback period"
                    resp_party = "Client"
                elif "acceptance" in sent_lower or "non-conform" in sent_lower:
                    dtype = "ACCEPTANCE_PERIOD"
                    event_desc = "Acceptance testing and defect notification period"
                    resp_party = "Client"
                elif "breach" in sent_lower and ("remed" in sent_lower or "cure" in sent_lower):
                    dtype = "CURE_PERIOD"
                    event_desc = "Material breach cure / remedy period"
                    resp_party = "Breaching Party"
                elif ("convenience" in sent_lower or "without cause" in sent_lower) and "written notice" in sent_lower:
                    dtype = "NOTICE_PERIOD"
                    event_desc = "Termination for convenience notice"
                    resp_party = "Terminating Party"
                elif "terminat" in sent_lower and "notice" in sent_lower:
                    dtype = "NOTICE_PERIOD"
                    event_desc = "Termination notice period"
                    resp_party = "Terminating Party"
                elif (("change" in sent_lower or "changing" in sent_lower or "update" in sent_lower) and "address" in sent_lower):
                    dtype = "NOTICE_UPDATE_PERIOD"
                    event_desc = "Notice address update deadline"
                    resp_party = "Either Party"
                elif "dispute" in sent_lower and ("discuss" in sent_lower or "resolve" in sent_lower or "court" in sent_lower):
                    dtype = "DISPUTE_DISCUSSION_PERIOD"
                    event_desc = "Dispute resolution discussion period"
                    resp_party = "Both Parties"
                key = (sec, dtype, clean_val)
                if key not in seen_date_keys:
                    seen_date_keys.add(key)
                    sem_cat = classify_temporal_semantics(clean_val, sent_clean)
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
                        semantic_category=sem_cat,
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
                    semantic_category="DEADLINE",
                ))

    clean_date_strings = [
        f"{d.value} — {d.event} ({d.clause_reference or f'Section {d.section}'})" if d.event
        else f"{d.value} ({d.date_type.replace('_', ' ').title()})"
        for d in structured_dates
    ]

    # Dynamic jurisdiction & governing law extraction
    _extracted_jurisdictions = []
    _extracted_laws = []
    _full_doc_text = " ".join(getattr(c, "text", "") for c in chunks if "APPENDIX" not in str(getattr(c, "section", "")).upper())

    # Extract court jurisdiction phrases
    for _jm in re.finditer(
        r'(?i)(?:courts?(?:\s+having\s+competent\s+jurisdiction)?\s+(?:in|at|of)|jurisdiction\s+(?:in|at|of)|competent\s+courts?\s+(?:in|at|of))\s+([A-Z][A-Za-z\s,]+?)(?:\s+shall|\.|\n|;)',
        _full_doc_text
    ):
        _jval = _jm.group(1).strip().rstrip(',')
        if _jval and len(_jval) < 60 and _jval not in _extracted_jurisdictions:
            _extracted_jurisdictions.append(_jval)

    if not _extracted_jurisdictions:
        for _jm in re.finditer(
            r'(?i)jurisdiction\s+over\s+disputes.*?in\s+([A-Z][A-Za-z\s,]+?)(?:\.|\n|;)',
            _full_doc_text
        ):
            _jval = _jm.group(1).strip().rstrip(',')
            if _jval and len(_jval) < 60 and _jval not in _extracted_jurisdictions:
                _extracted_jurisdictions.append(_jval)

    # Extract governing law phrases
    for _lm in re.finditer(
        r'(?i)(?:governed\s+by\s+the\s+laws\s+of|governed\s+by\s+laws\s+of|laws\s+of|governed\s+by|applicable\s+law)\s+(?:the\s+)?([A-Z][A-Za-z\s]+?)(?:\.|\n|,|;)',
        _full_doc_text
    ):
        _lval = _lm.group(1).strip()
        if _lval and len(_lval) < 60 and _lval not in _extracted_laws:
            _extracted_laws.append(_lval)

    if not _extracted_jurisdictions:
        _extracted_jurisdictions = ["Jurisdiction not specified in document"]
    if not _extracted_laws:
        _extracted_laws = ["Governing law not specified in document"]
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
        jurisdictions=_extracted_jurisdictions,
        laws=_extracted_laws,
        total_entities=len(structured_parties) + len(structured_finances) + len(structured_dates),
        stats={"parties": len(structured_parties), "finances": len(structured_finances), "dates": len(structured_dates)},
    )
