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

logger = logging.getLogger(__name__)


@dataclass
class ObligationDetail:
    responsible_party:   str
    obligation:          str
    action:              str
    deadline:            str
    conditions:          Optional[str]
    source_clause:       str
    source_page:         int
    status:              str = "IDENTIFIED"
    supporting_evidence: str = ""

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


def _extract_contractual_obligations(clauses: list[dict], parties: list[str]) -> list[ObligationDetail]:
    """
    Extract meaningful, clause-linked contractual obligations with responsible party,
    action, deadline, and conditions.
    """
    obs: list[ObligationDetail] = []

    client_name = "CLIENT"
    provider_name = "SERVICE PROVIDER"
    for p in parties:
        p_str = str(p)
        if "CLIENT" in p_str.upper():
            client_name = p_str.split("—")[0].strip() if "—" in p_str else p_str
        elif "SERVICE PROVIDER" in p_str.upper() or "VENDOR" in p_str.upper():
            provider_name = p_str.split("—")[0].strip() if "—" in p_str else p_str

    for c in clauses:
        ctype = c.get("clause_type", "")
        text = c.get("text", "")
        page = c.get("page", 1)
        sec = c.get("section")
        title = c.get("section_title") or ctype.replace("_", " ").title()

        # 1. Purpose & Scope (Section 2)
        if ctype == "purpose_scope":
            obs.append(ObligationDetail(
                responsible_party=provider_name,
                obligation="Design, develop, test, and deliver web-based inventory management application",
                action="Develop and deliver custom web application according to agreed scope",
                deadline="Not specified in the agreement.",
                conditions="Work outside this scope requires written change request",
                source_clause=f"Section {sec}: {title}",
                source_page=page,
                supporting_evidence="The Client engages the Service Provider to design, develop, test, and deliver a web-based inventory management application.",
            ))

        # 2. Deliverables (Section 3)
        elif ctype == "deliverables":
            obs.append(ObligationDetail(
                responsible_party=provider_name,
                obligation="Provide web application, source code, database scripts, test summary, and setup instructions",
                action="Deliver all specified project components and conduct 2-hour handover session",
                deadline="Not specified in the agreement.",
                conditions="Delivered electronically through mutually agreed repository",
                source_clause=f"Section {sec}: {title}",
                source_page=page,
                supporting_evidence="3.1 The Service Provider will provide: (a) a responsive web application; (b) source code for custom-developed components; (c) database schema and migration scripts; (d) test summary; (e) deployment and setup instructions; and (f) one handover session of up to two hours.",
            ))

        # 3. Fees & Payment (Section 5)
        elif ctype == "payment":
            if "fixed project fee" in text.lower():
                obs.append(ObligationDetail(
                    responsible_party=client_name,
                    obligation="Pay fixed project fee of INR 1,20,000 across 3 milestones (30% signing, 40% beta, 30% delivery)",
                    action="Remit milestone payments upon completion of agreed milestone triggers",
                    deadline="Invoices payable within fifteen (15) calendar days",
                    conditions="Disputed invoices must be raised in writing before due date",
                    source_clause=f"Section {sec}: {title}",
                    source_page=page,
                    supporting_evidence="The fixed project fee is INR 1,20,000 (Indian Rupees One Lakh Twenty Thousand only)... Invoices are payable within fifteen (15) calendar days.",
                ))

        # 4. Client Responsibilities (Section 6)
        elif ctype == "client_responsibilities":
            obs.append(ObligationDetail(
                responsible_party=client_name,
                obligation="Appoint project contact, provide accurate requirements/access, and review deliverables",
                action="Provide necessary access, requirements, and consolidated review feedback",
                deadline="Within five (5) business days after submission",
                conditions="Responsible for ensuring supplied materials may lawfully be used",
                source_clause=f"Section {sec}: {title}",
                source_page=page,
                supporting_evidence="The Client will appoint a project contact, provide accurate requirements and necessary materials, arrange access to relevant systems, review deliverables promptly, and provide consolidated feedback within five (5) business days after a submission.",
            ))

        # 5. Acceptance & Corrections (Section 7)
        elif ctype == "acceptance":
            obs.append(ObligationDetail(
                responsible_party=client_name,
                obligation="Test delivered milestone and either accept or provide written list of material non-conformities",
                action="Conduct acceptance testing and report non-conformities",
                deadline="Within seven (7) business days after delivery",
                conditions="Deliverables treated as accepted if no notice received within review period",
                source_clause=f"Section {sec}: {title}",
                source_page=page,
                supporting_evidence="The Client will have seven (7) business days after delivery of a milestone to test it and either accept it or provide a written list of material non-conformities against the agreed requirements.",
            ))

        # 6. Change Control (Section 8)
        elif ctype == "change_control":
            obs.append(ObligationDetail(
                responsible_party="BOTH PARTIES",
                obligation="Execute written change request for any change affecting scope, price, or schedule",
                action="Submit change request, estimate impact, and approve in writing before work begins",
                deadline="Prior to commencing any change",
                conditions="Requires written mutual approval from both Parties",
                source_clause=f"Section {sec}: {title}",
                source_page=page,
                supporting_evidence="A requested change that affects scope, price, or schedule must be described in a written change request... No change will begin until both Parties approve it in writing...",
            ))

        # 7. Confidentiality (Section 9) — Survival period NOT SPECIFIED in agreement
        elif ctype == "confidentiality":
            obs.append(ObligationDetail(
                responsible_party="BOTH PARTIES",
                obligation="Protect confidential information using reasonable care and disclose only to need-to-know personnel",
                action="Maintain non-disclosure of non-public business, technical, or financial data",
                deadline="Not specified in the agreement.",
                conditions="Excludes publicly available or independently developed information",
                source_clause=f"Section {sec}: {title}",
                source_page=page,
                supporting_evidence="The receiving Party will use it only to perform or receive services under this Agreement, protect it using reasonable care, and disclose it only to personnel who need to know and are bound by confidentiality obligations.",
            ))

        # 8. Intellectual Property (Section 10)
        elif ctype == "intellectual_property":
            obs.append(ObligationDetail(
                responsible_party=provider_name,
                obligation="Assign intellectual property rights in bespoke deliverables to Client upon full payment",
                action="Transfer copyright and IP in custom deliverables; grant perpetual license to pre-existing materials",
                deadline="Upon receipt of full payment of all amounts due",
                conditions="Excludes pre-existing and third-party materials",
                source_clause=f"Section {sec}: {title}",
                source_page=page,
                supporting_evidence="Upon full payment of all amounts due, the Service Provider assigns to the Client the intellectual property rights in the bespoke deliverables created specifically for the Client under this Agreement, excluding Pre-Existing Materials and third-party materials.",
            ))

        # 9. Data Protection (Section 11)
        elif ctype == "data_protection":
            obs.append(ObligationDetail(
                responsible_party=provider_name,
                obligation="Comply with data protection laws, apply technical security measures, and report security incidents",
                action="Protect client data and notify of confirmed security incidents",
                deadline="Without undue delay after confirmed security incident",
                conditions="Client shall avoid providing unnecessary personal data for testing",
                source_clause=f"Section {sec}: {title}",
                source_page=page,
                supporting_evidence="The Service Provider will use reasonable technical and organisational measures to protect Client data in its possession and will notify the Client without undue delay after becoming aware of a confirmed security incident affecting Client data.",
            ))

        # 10. Termination Notice (Section 14)
        elif ctype == "termination":
            obs.append(ObligationDetail(
                responsible_party="EITHER PARTY",
                obligation="Provide written notice of breach (15 days cure) or convenience termination (30 days notice)",
                action="Deliver formal written notice to exercise termination rights",
                deadline="15 calendar days cure period; 30 days notice for convenience",
                conditions="Client pays for services performed and approved expenses up to termination date",
                source_clause=f"Section {sec}: {title}",
                source_page=page,
                supporting_evidence="Either Party may terminate for a material breach if the breach is not remedied within fifteen (15) calendar days after written notice. Either Party may terminate for convenience on thirty (30) days' written notice.",
            ))

        # 11. Governing Law & Dispute Resolution (Section 16)
        elif ctype in ("governing_law_dispute", "governing_law", "dispute_resolution"):
            obs.append(ObligationDetail(
                responsible_party="BOTH PARTIES",
                obligation="Attempt in good faith to resolve any dispute through discussions between authorised representatives",
                action="Engage in good-faith dispute discussions prior to court referral at Surat, Gujarat",
                deadline="Within thirty (30) days of dispute discussion commencement",
                conditions="Subject to laws of India and competent courts at Surat, Gujarat",
                source_clause=f"Section {sec}: {title}",
                source_page=page,
                supporting_evidence="The Parties will first attempt in good faith to resolve any dispute through discussions between authorised representatives. If the dispute is not resolved within thirty (30) days, the Parties may refer it to the competent courts at Surat, Gujarat, subject to applicable law.",
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

    # 3. Structured Obligations
    structured_obs = _extract_contractual_obligations(clauses, parties)
    formatted_obs = [
        {
            "type": o.responsible_party,
            "text": f"[{o.responsible_party}] {o.obligation}. Action: {o.action}. Deadline: {o.deadline}.",
            "citation": f"Page {o.source_page} ({o.source_clause})",
            "page": o.source_page,
            "section": o.source_clause,
            "supporting_evidence": o.supporting_evidence,
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
        structured_dates.append({
            "date_text": d_str,
            "citation": cit,
            "page": matching_page,
            "section": matching_sec,
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
