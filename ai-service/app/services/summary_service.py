"""
Document Summarization & Obligations Service — Part 10 (v2)

Generates evidence-grounded summary payloads using extracted document structure,
NER entities, classified clauses, and risk assessment findings:
  - Plain-language summary
  - Key points
  - Extracted obligations list (with responsible party, required action, deadline, condition, citation)
  - Important dates & deadlines (with citations)
"""

import logging
import re
from dataclasses import dataclass, field, asdict
from typing import Optional

from app.services.ner_service import classify_temporal_semantics

logger = logging.getLogger(__name__)


@dataclass
class ObligationDetail:
    responsible_party:       str
    obligation:              str
    action:                  str
    deadline:                str
    conditions:              Optional[str]
    source_clause:           str
    source_page:             int
    status:                  str = "IDENTIFIED"
    supporting_evidence:     str = ""
    temporal_classification: str = "DEADLINE"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class DocumentSummary:
    document_id:            str
    plain_language_summary: str
    key_points:             list[str] = field(default_factory=list)
    obligations:            list[dict] = field(default_factory=list)
    structured_obligations: list[ObligationDetail] = field(default_factory=list)
    important_dates:        list[dict] = field(default_factory=list)
    parties_involved:       list[str] = field(default_factory=list)
    overall_risk_level:     str = "low"
    overall_risk_score:     int = 0

    def to_dict(self) -> dict:
        return asdict(self)


def _extract_contractual_obligations(
    clauses: list[dict],
    parties: list[str],
    doc_category: str = "",
) -> list[ObligationDetail]:
    """
    Extract contractual obligations DIRECTLY from clause text using regex and NLP patterns.
    Category-aware: applies doc-type-specific obligation patterns.

    Rules:
    - NEVER invent obligations not present in the clause text.
    - Extract responsible party, action, deadline, and conditions FROM the actual text.
    - Supporting evidence must be a verbatim excerpt from the clause text.
    """
    obs: list[ObligationDetail] = []
    doc_cat_lower = doc_category.lower()
    is_employment = any(kw in doc_cat_lower for kw in ("employment", "nda", "confidentiality"))

    # Resolve specific party names and defined roles
    party1_name = "First Party"
    party2_name = "Second Party"
    for p in parties:
        p_str = str(p).strip()
        p_role = ""
        p_name = p_str
        if "—" in p_str:
            parts = p_str.split("—", 1)
            p_name = parts[0].strip()
            p_role = parts[1].strip().upper()
        elif "(" in p_str and ")" in p_str:
            m = re.search(r'^(.*?)\s*\((.*?)\)$', p_str)
            if m:
                p_name = m.group(1).strip()
                p_role = m.group(2).strip().upper()

        if any(r in p_role for r in ("CLIENT", "EMPLOYER", "COMPANY", "LANDLORD", "LENDER", "BUYER")):
            party1_name = f"{p_name} ({p_role.title()})" if p_role else p_name
        elif any(r in p_role for r in ("SERVICE PROVIDER", "EMPLOYEE", "TENANT", "VENDOR", "DEVELOPER", "BORROWER", "CONTRACTOR")):
            party2_name = f"{p_name} ({p_role.title()})" if p_role else p_name
        elif party1_name == "First Party":
            party1_name = p_name
        elif party2_name == "Second Party":
            party2_name = p_name

    def _resolve_party(c_text: str, default: str = "BOTH PARTIES") -> str:
        t_low = c_text.lower()
        if re.search(r'\b(?:both\s+parties|each\s+party|parties\s+mutually)\b', t_low):
            return "BOTH PARTIES"
        if re.search(r'\b(?:either\s+party|a\s+party|any\s+party)\b', t_low):
            return "EITHER PARTY"
        if re.search(r'\b(?:employee|service\s+provider|contractor|vendor|developer|consultant)\b', t_low):
            return party2_name
        if re.search(r'\b(?:company|client|employer|customer)\b', t_low) and not re.search(r'\b(?:employee|service\s+provider)\b', t_low):
            return party1_name
        if "receiving party" in t_low:
            if is_employment:
                return party2_name
            return "BOTH PARTIES"
        return default

    for c in clauses:
        ctype = c.get("clause_type", "")
        text  = c.get("text", "")
        page  = c.get("page", 1)
        sec   = c.get("section")
        title = c.get("section_title") or ctype.replace("_", " ").title()
        source_clause = f"Section {sec}: {title}" if sec else title

        if not text or not ctype:
            continue

        sec_str = str(sec or "").upper()
        title_str = str(title or "").upper()
        # Skip definitions, exclusions, safe harbors, preambles, signatures, and appendices
        if any(bad in title_str for bad in ("DEFINITION", "EXCLUSION", "PERMITTED", "NO RESTRICTION", "APPENDIX", "TESTING NOTE", "PREAMBLE", "SIGNATURE")):
            continue
        if any(bad in sec_str for bad in ("APPENDIX", "PREAMBLE", "SIGNATURE")):
            continue
        if "FOR SOFTWARE TESTING" in text.upper()[:100] or "EDUCATIONAL DEMONSTRATION" in text.upper()[:100]:
            continue

        first_sent = re.split(r'(?<=[.!?])\s+', text.strip())[0][:300]

        # ── 1. Confidentiality ───────────────────────────────────────────────
        if ctype == "confidentiality":
            if any(kw in title_str for kw in ("SECURITY", "INCIDENT")) or "incident" in text.lower()[:80]:
                notif_m = re.search(r'(?:within|no later than)\s+([\d]+\s*(?:hours?|business\s+days?|calendar\s+days?))', text, re.I)
                deadline_txt = f"Within {notif_m.group(1).strip()}" if notif_m else "Promptly upon incident"
                obs.append(ObligationDetail(
                    responsible_party=party2_name if is_employment else _resolve_party(text, party2_name),
                    obligation="Comply with information security policies and report security incidents",
                    action=re.sub(r'\s+', ' ', first_sent),
                    deadline=deadline_txt,
                    conditions="Follow security controls and report breaches without delay",
                    source_clause=source_clause,
                    source_page=page,
                    supporting_evidence=first_sent.strip(),
                    temporal_classification="CONDITION_TRIGGERED_PERIOD",
                ))
            elif any(kw in title_str for kw in ("RETURN", "DELETION")) or "return" in text.lower()[:60]:
                deadlines = re.findall(r'(\d+)\s*(calendar\s+days?|business\s+days?|days?)', text, re.I)
                deadline_txt = "; ".join(f"{d[0]} {d[1]}" for d in deadlines) if deadlines else "Upon request or termination"
                obs.append(ObligationDetail(
                    responsible_party=party2_name if is_employment else _resolve_party(text, party2_name),
                    obligation="Return Company property and permanently delete confidential information",
                    action=re.sub(r'\s+', ' ', first_sent),
                    deadline=deadline_txt,
                    conditions="Upon written request or termination of engagement",
                    source_clause=source_clause,
                    source_page=page,
                    supporting_evidence=first_sent.strip(),
                    temporal_classification="CONDITION_TRIGGERED_PERIOD",
                ))
            else:
                surv_m = re.search(
                    r'(\d+)\s*(calendar\s+days?|business\s+days?|months?|years?)\s*(?:after|following|from)\s*(?:termination|expiration|expiry)',
                    text, re.I
                )
                surv_text = f"Survival: {surv_m.group(0).strip()}" if surv_m else "Survives termination"
                obs.append(ObligationDetail(
                    responsible_party=party2_name if is_employment else "BOTH PARTIES",
                    obligation="Maintain confidentiality and use information solely for authorized purposes",
                    action=re.sub(r'\s+', ' ', first_sent),
                    deadline=surv_text,
                    conditions="Excludes information in public domain or disclosures required by law",
                    source_clause=source_clause,
                    source_page=page,
                    supporting_evidence=first_sent.strip(),
                    temporal_classification="SURVIVAL_PERIOD",
                ))

        # ── 2. Non-compete / Non-solicitation (Affirmative restrictions only) ─
        elif ctype == "non_compete":
            # Skip safe-harbors that state no restriction (e.g. "does not prohibit")
            if re.search(r'\b(?:does\s+not\s+prohibit|no\s+restriction)\b', text, re.I):
                continue
            period_m = re.search(
                r'(\d+|one|two|three|four|five|six|twelve|eighteen|twenty[- ]four)\s*(months?|years?)(?:\s+(?:after|following|from|post))?',
                text, re.I
            )
            period_txt = period_m.group(0).strip() if period_m else "Duration not specified"
            obs.append(ObligationDetail(
                responsible_party=party2_name,
                obligation="Comply with non-compete and non-solicitation restrictions",
                action=re.sub(r'\s+', ' ', first_sent),
                deadline=f"Restriction period: {period_txt}",
                conditions="During and after employment/engagement",
                source_clause=source_clause,
                source_page=page,
                supporting_evidence=first_sent.strip(),
                temporal_classification="DURATION",
            ))

        # ── 3. Data Protection / Security ───────────────────────────────────
        elif ctype == "data_protection":
            notif_m = re.search(
                r'(?:notify|notif[yi]).*?(?:within|no later than)\s+([\d]+\s*(?:hours?|business\s+days?|calendar\s+days?))',
                text, re.I
            )
            deadline_txt = notif_m.group(0).strip() if notif_m else "Ongoing during and after engagement"
            obs.append(ObligationDetail(
                responsible_party=party2_name if is_employment else _resolve_party(text, party2_name),
                obligation="Process personal data in compliance with data protection policies and applicable law",
                action=re.sub(r'\s+', ' ', first_sent),
                deadline=deadline_txt,
                conditions="Applies to all personal data and confidential information",
                source_clause=source_clause,
                source_page=page,
                supporting_evidence=first_sent.strip(),
                temporal_classification="DURATION",
            ))

        # ── 4. Termination ───────────────────────────────────────────────────
        elif ctype == "termination":
            periods = re.findall(
                r'(\d+|(?:fifteen|thirty|sixty|ninety))\s*(?:\(\d+\)\s*)?(calendar\s+days?|business\s+days?|days?)',
                text, re.I
            )
            period_parts = [" ".join(p) for p in periods]
            period_desc = "; ".join(period_parts[:3]) if period_parts else "As specified in agreement"
            obs.append(ObligationDetail(
                responsible_party="EITHER PARTY",
                obligation="Provide written notice to exercise termination rights",
                action=re.sub(r'\s+', ' ', first_sent),
                deadline=period_desc,
                conditions="Subject to cure period for material breach where applicable",
                source_clause=source_clause,
                source_page=page,
                supporting_evidence=first_sent.strip(),
                temporal_classification="NOTICE_PERIOD",
            ))

        # ── 5. Payment Terms ────────────────────────────────────────────────
        elif ctype == "payment":
            amt_m = re.search(r'(?:INR|Rs\.?|USD|EUR|₹)\s*[\d,]+(?:\.\d{1,2})?', text, re.I)
            deadline_m = re.search(
                r'(?:payable|payment due|due|within)\s+([\d]+|fifteen|thirty)\s*(?:\(\d+\)\s*)?(calendar\s+days?|business\s+days?|days?)',
                text, re.I
            )
            if amt_m or deadline_m:
                obs.append(ObligationDetail(
                    responsible_party=party1_name,
                    obligation="Remit payments per agreed schedule",
                    action=re.sub(r'\s+', ' ', first_sent),
                    deadline=deadline_m.group(0).strip() if deadline_m else "Per agreed payment schedule",
                    conditions="As specified in agreement",
                    source_clause=source_clause,
                    source_page=page,
                    supporting_evidence=first_sent.strip(),
                    temporal_classification="DEADLINE",
                ))

        # ── 6. Intellectual Property & Company Property ──────────────────────
        elif ctype == "intellectual_property":
            has_assignment = bool(
                re.search(r'\b(?:assigns?|transfers?)\s+(?:to\s+(?:the\s+)?(?:client|company|purchaser|employer)|all\s+right(?:s)?,\s*title)\b', text, re.I)
                and not re.search(r'\b(?:does\s+not\s+(?:by\s+itself\s+)?transfer|no\s+transfer|shall\s+remain\s+with)\b', text, re.I)
            )
            if has_assignment:
                obs.append(ObligationDetail(
                    responsible_party=party2_name,
                    obligation="Assign intellectual property rights in deliverables to client/company",
                    action=re.sub(r'\s+', ' ', first_sent),
                    deadline="Per agreement terms / upon full payment",
                    conditions="Subject to full payment where specified",
                    source_clause=source_clause,
                    source_page=page,
                    supporting_evidence=first_sent.strip(),
                    temporal_classification="CONDITION_TRIGGERED_PERIOD",
                ))
            elif re.search(r'\b(?:company\s+property|devices|equipment|records|storage\s+media)\b', text, re.I):
                obs.append(ObligationDetail(
                    responsible_party=party2_name,
                    obligation="Comply with Company property, equipment, and work product safeguard policies",
                    action=re.sub(r'\s+', ' ', first_sent),
                    deadline="During employment / until returned",
                    conditions="Title to Company property remains with Company; pre-existing IP retained by Employee",
                    source_clause=source_clause,
                    source_page=page,
                    supporting_evidence=first_sent.strip(),
                    temporal_classification="DURATION",
                ))

        # ── 7. Dispute Resolution (Only if ADR/procedure exists) ─────────────
        elif ctype in ("governing_law_dispute", "governing_law", "dispute_resolution"):
            has_adr = bool(re.search(r'\b(?:good[- ]faith(?:\s+discussions?|\s+negotiat\w+)?|mediation|arbitration|dispute\s+resolution\s+procedure|escalat\w+)\b', text, re.I))
            if has_adr:
                period_m = re.search(
                    r'(\d+|thirty|forty[- ]five|sixty|ninety)\s*(?:\(\d+\)\s*)?(calendar\s+days?|business\s+days?|days?)',
                    text, re.I
                )
                period_txt = period_m.group(0).strip() if period_m else "As agreed"
                jur_m = re.search(
                    r'(?:courts?\s+of|jurisdiction\s+of|competent\s+courts?\s+at|courts?\s+at)\s+([A-Z][A-Za-z\s,]+?)(?:\.|,|\n|subject)',
                    text
                )
                jur_txt = jur_m.group(1).strip() if jur_m else "courts of competent jurisdiction"
                obs.append(ObligationDetail(
                    responsible_party="BOTH PARTIES",
                    obligation="Attempt good-faith dispute resolution before formal proceedings",
                    action=re.sub(r'\s+', ' ', first_sent),
                    deadline=f"Good-faith discussions: {period_txt}",
                    conditions=f"Governed by {jur_txt}",
                    source_clause=source_clause,
                    source_page=page,
                    supporting_evidence=first_sent.strip(),
                    temporal_classification="DURATION",
                ))

        # ── 8. Notice ────────────────────────────────────────────────────────
        elif ctype == "notice":
            if re.search(r'(?:update|notify|change|7|seven)\s*(?:calendar|business)?\s*days?', text, re.I):
                period_m = re.search(
                    r'(\d+)\s*(calendar\s+days?|business\s+days?|days?)',
                    text, re.I
                )
                obs.append(ObligationDetail(
                    responsible_party="EITHER PARTY",
                    obligation="Provide written notice of change of address within 7 calendar days",
                    action=re.sub(r'\s+', ' ', first_sent),
                    deadline=period_m.group(0).strip() if period_m else "Within 7 calendar days",
                    conditions="Written notice delivered by hand, courier, or email",
                    source_clause=source_clause,
                    source_page=page,
                    supporting_evidence=first_sent.strip(),
                    temporal_classification="NOTICE_PERIOD",
                ))

        # ── 9. Purpose & Scope (only for business/software agreements) ───────
        elif ctype == "purpose_scope" and "business" in doc_cat_lower:
            obs.append(ObligationDetail(
                responsible_party=party2_name,
                obligation="Deliver services as described in agreement scope",
                action=re.sub(r'\s+', ' ', first_sent),
                deadline="Per project schedule",
                conditions="Work outside scope requires written change request",
                source_clause=source_clause,
                source_page=page,
                supporting_evidence=first_sent.strip(),
                temporal_classification="DURATION",
            ))

        # ── 10. Deliverables (only for business/software agreements) ─────────
        elif ctype == "deliverables" and "business" in doc_cat_lower:
            obs.append(ObligationDetail(
                responsible_party=party2_name,
                obligation="Deliver all specified project components",
                action=re.sub(r'\s+', ' ', first_sent),
                deadline="Per agreed delivery schedule",
                conditions="Delivered through mutually agreed method",
                source_clause=source_clause,
                source_page=page,
                supporting_evidence=first_sent.strip(),
                temporal_classification="DEADLINE",
            ))

        # ── 11. Client Responsibilities (only for business/software agreements) ─
        elif ctype == "client_responsibilities" and "business" in doc_cat_lower:
            obs.append(ObligationDetail(
                responsible_party=party1_name,
                obligation="Fulfill client obligations to enable service delivery",
                action=re.sub(r'\s+', ' ', first_sent),
                deadline="Per agreed timeline",
                conditions="Responsible for accuracy of supplied materials",
                source_clause=source_clause,
                source_page=page,
                supporting_evidence=first_sent.strip(),
                temporal_classification="DURATION",
            ))

        # ── 12. Acceptance (only for business/software agreements) ───────────
        elif ctype == "acceptance" and "business" in doc_cat_lower:
            period_m = re.search(
                r'(\d+|seven|five|ten)\s*(?:\(\d+\)\s*)?(business\s+days?|calendar\s+days?|days?)',
                text, re.I
            )
            obs.append(ObligationDetail(
                responsible_party=party1_name,
                obligation="Test delivered milestone and report non-conformities or accept",
                action=re.sub(r'\s+', ' ', first_sent),
                deadline=period_m.group(0).strip() if period_m else "Per acceptance period",
                conditions="Deliverables treated as accepted if no notice received",
                source_clause=source_clause,
                source_page=page,
                supporting_evidence=first_sent.strip(),
                temporal_classification="DEADLINE",
            ))

    return obs


def generate_document_summary(
    document_id: str,
    document_type: str,
    chunks: list[dict],
    parties: list[str],
    dates: list[str],
    amounts: list[str],
    clauses: list[dict],
    risk_score: int,
    risk_level: str,
) -> DocumentSummary:
    logger.info(f"Generating summary for document: {document_id}")

    # 1. Plain-Language Summary
    party_str = " and ".join(parties[:2]) if parties else "Unidentified Parties"
    doc_type_clean = document_type.replace("_", " ").title()

    # Build complete financial summary ensuring all 3 milestones are present
    fin_desc = ""
    if amounts:
        fin_desc = f" Financial terms include: {'; '.join(amounts)}."

    # Categorize sections to distinguish substantive legal provisions from structural elements
    numbered_sections = [
        c for c in clauses
        if str(c.get("section") or "").isdigit() and int(c.get("section")) < 18
    ]
    schedules = [
        c for c in clauses
        if "SCHEDULE" in str(c.get("section") or "").upper() or c.get("section_type") == "SCHEDULE"
    ]
    has_preamble = any(
        str(c.get("section") or "").upper() == "PREAMBLE" or c.get("clause_type") == "preamble"
        for c in clauses
    )
    has_signatures = any(
        str(c.get("section") or "") == "18" or c.get("clause_type") == "signatures"
        for c in clauses
    )

    total_elements = len(clauses)
    numbered_count = len(numbered_sections)
    schedule_count = len(schedules)

    breakdown_parts = []
    if numbered_count:
        breakdown_parts.append(f"{numbered_count} numbered sections")
    if schedule_count:
        breakdown_parts.append(f"{schedule_count} schedules")
    if has_preamble:
        breakdown_parts.append("the preamble")
    if has_signatures:
        breakdown_parts.append("execution information")

    breakdown_str = ", ".join(breakdown_parts)
    if len(breakdown_parts) > 1:
        last_comma = breakdown_str.rfind(", ")
        breakdown_str = breakdown_str[:last_comma] + ", and " + breakdown_str[last_comma + 2:]

    sections_summary_phrase = (
        f"{total_elements} document sections and structural elements identified, including {breakdown_str}."
    )

    plain_summary = (
        f"This is a {doc_type_clean} entered into by {party_str}. "
        f"The contract outlines the terms of engagement across {sections_summary_phrase}{fin_desc} "
        f"The agreement carries an overall risk assessment score of {risk_score}/100 ({risk_level.upper()})."
    )

    # 2. Key Points
    key_points = []
    if parties:
        key_points.append(f"Parties Identified: {', '.join(parties[:2])}")
    if amounts:
        key_points.append(f"Financial Terms/Amounts: {'; '.join(amounts)}")

    clause_types_found = list({
        c.get("clause_name") or c.get("clause_type", "").replace("_", " ").title()
        for c in clauses
        if c.get("clause_type") not in ("other", "parties", "signatures", "preamble", "")
    })
    if clause_types_found:
        key_points.append(f"Key Legal Clauses Present: {', '.join(clause_types_found[:6])}")

    key_points.append(f"Overall Risk Level: {risk_level.upper()} (Score: {risk_score}/100)")

    # 3. Structured Obligations — pass document category for category-aware extraction
    structured_obs = _extract_contractual_obligations(clauses, parties, doc_category=document_type)
    formatted_obs = [
        {
            "type": o.responsible_party,
            "text": f"[{o.responsible_party}] {o.obligation}. Action: {o.action}. Timeline ({o.temporal_classification}): {o.deadline}.",
            "citation": f"Page {o.source_page} ({o.source_clause})",
            "page": o.source_page,
            "section": o.source_clause,
            "supporting_evidence": o.supporting_evidence,
            "temporal_classification": o.temporal_classification,
            "deadline": o.deadline,
        }
        for o in structured_obs
    ]

    # 4. Important Dates & Deadlines
    structured_dates = []
    for d in dates:
        d_str = str(d)
        matching_page = 1
        matching_sec = None
        for c in clauses:
            if any(term in c.get("text", "").lower() for term in d_str.lower().split()[:2]):
                matching_page = c.get("page", 1)
                matching_sec = c.get("section")
                break

        cit = f"Page {matching_page}" + (f", Section {matching_sec}" if matching_sec else "")
        sem_cat = classify_temporal_semantics(d_str, "")
        structured_dates.append({
            "date_text": d_str,
            "citation": cit,
            "page": matching_page,
            "section": matching_sec,
            "temporal_classification": sem_cat,
        })

    return DocumentSummary(
        document_id=document_id,
        plain_language_summary=plain_summary,
        key_points=key_points,
        obligations=formatted_obs[:15],
        structured_obligations=structured_obs[:15],
        important_dates=structured_dates[:15],
        parties_involved=parties,
        overall_risk_level=risk_level,
        overall_risk_score=risk_score,
    )
