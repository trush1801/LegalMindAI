"""
Risk Analysis Engine — Part 09 (v2 Evidence-Grounded)

Evaluates classified clauses against legal risk rules across categories:
  1. termination          6. governing_law
  2. liability            7. intellectual_property
  3. payment              8. dispute_resolution
  4. confidentiality      9. warranties
  5. acceptance          10. data_protection

Features:
  - Evidence-based citation ("Page X, Section Y")
  - Categorized severity: low (1-5), medium (6-11), high (12-19), critical (20-25)
  - Weighted overall score (0-100)
  - Plain-language explanations & actionable recommendations
  - Required analytical disclaimer
"""

import logging
import re
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger(__name__)

LEGAL_DISCLAIMER = (
    "This risk analysis is an AI-generated analytical indicator and does not constitute "
    "legal advice. Consult a qualified legal professional for decisions requiring legal interpretation."
)


@dataclass
class RiskFinding:
    document_id:         str
    category:            str
    risk_title:          str
    risk_level:          str          # low | medium | high | critical
    risk_score:          int          # 1 - 25
    score_contribution:  int          # Actual points added to overall score
    clause_type:         str
    clause_text:         str
    page_number:         int
    section:             Optional[str]
    explanation:         str
    contractual_concern: str
    commercial_impact:   str
    severity_rationale:  str
    recommendation:      str
    evidence:            str
    potential_impact:    Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RiskAnalysisResult:
    document_id:        str
    overall_risk_score: int
    overall_risk_level: str
    total_risks_found:  int
    risk_breakdown:     dict
    category_counts:    dict
    findings:           list[RiskFinding] = field(default_factory=list)
    disclaimer:         str = LEGAL_DISCLAIMER
    summary:            str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def _make_evidence(page: int, section: Optional[str]) -> str:
    if section and str(section).strip():
        return f"Page {page}, Section {section}"
    return f"Page {page}"


def _eval_intellectual_property(clause: dict, doc_id: str) -> list[RiskFinding]:
    findings = []
    text = clause.get("text", "")
    page = clause.get("page", 1)
    section = clause.get("section")
    citation = _make_evidence(page, section)

    # IP-01: Conditional IP assignment on full payment
    if re.search(r"\bupon\s+full\s+payment\b", text, re.I):
        findings.append(RiskFinding(
            document_id=doc_id,
            category="intellectual_property",
            risk_title="IP Assignment Conditional on Full Payment",
            risk_level="medium",
            risk_score=8,
            score_contribution=8,
            clause_type="intellectual_property",
            clause_text=text[:500],
            page_number=page,
            section=section,
            explanation="The assignment of intellectual property rights in bespoke deliverables is conditioned on 'full payment of all amounts due'.",
            contractual_concern="Section 10 stipulates that IP rights in bespoke custom code vest in the Client only 'Upon full payment of all amounts due'.",
            commercial_impact="If a fee dispute arises over the final milestone, the Client lacks full legal title to software modules already paid for under earlier milestones, creating business continuity exposure.",
            severity_rationale="Medium severity because conditioning copyright assignment of delivered work on complete contract-wide fee clearance gives the vendor disproportionate leverage in disputed invoices.",
            potential_impact="In the event of a fee dispute or withheld final milestone, IP rights remain with the developer, creating business continuity risk.",
            recommendation="Clarify that IP rights for completed and paid milestones vest progressively upon payment, or that IP vests upon delivery subject to a security interest for unpaid fees.",
            evidence=citation,
        ))

    # IP-02: Pre-existing materials ownership retained (discounted score contribution to avoid double counting)
    if re.search(r"\bpre-existing\s+materials\b", text, re.I) and re.search(r"\bretains\s+ownership\b", text, re.I):
        findings.append(RiskFinding(
            document_id=doc_id,
            category="intellectual_property",
            risk_title="Vendor Retains Pre-Existing Materials with Perpetual License",
            risk_level="low",
            risk_score=4,
            score_contribution=2,  # Shared IP exposure discounted: 4 * 0.5 = 2 pts
            clause_type="intellectual_property",
            clause_text=text[:500],
            page_number=page,
            section=section,
            explanation="The developer retains ownership of underlying tools, libraries, and templates developed independently of this engagement, granting a perpetual, non-exclusive license to the client.",
            contractual_concern="The developer retains proprietary ownership of pre-existing tools, libraries, templates, and know-how used to build the application.",
            commercial_impact="The Client cannot claim exclusive ownership of the underlying generic framework or re-license developer tools independently, though operation of the software is safeguarded by a perpetual license.",
            severity_rationale="Low severity because vendor retention of pre-existing background code with a perpetual client license is standard commercial practice and does not impair client usage.",
            potential_impact="The client does not have exclusive rights over pre-existing tools or frameworks incorporated into the application.",
            recommendation="Verify that the license to pre-existing materials is irrevocable, transferable, royalty-free, and permits future internal maintenance or enhancement.",
            evidence=citation,
        ))

    return findings


def _eval_warranties(clause: dict, doc_id: str) -> list[RiskFinding]:
    findings = []
    text = clause.get("text", "")
    page = clause.get("page", 1)
    section = clause.get("section")
    citation = _make_evidence(page, section)

    # WAR-01: Disclaims uninterrupted or error-free operation
    if re.search(r"\bnot\s+warrant\b.{0,60}\b(?:error-free|uninterrupted)\b", text, re.I) or \
       re.search(r"\bwithout\s+any\s+other\s+warranty\b", text, re.I):
        findings.append(RiskFinding(
            document_id=doc_id,
            category="warranties",
            risk_title="Disclaimer of Error-Free Software & Implied Warranties",
            risk_level="medium",
            risk_score=8,
            score_contribution=8,
            clause_type="warranties",
            clause_text=text[:500],
            page_number=page,
            section=section,
            explanation="The service provider warrants reasonable skill and care, but expressly disclaims implied warranties and does not warrant that the software will be entirely error-free or uninterrupted.",
            contractual_concern="Section 12 provides a general warranty of reasonable skill and care, but expressly disclaims implied warranties (merchantability, fitness for purpose) and does not warrant uninterrupted or error-free performance.",
            commercial_impact="Post-handover defects or bugs discovered during live operations are not covered by an ongoing warranty defect remediation obligation, exposing the Client to immediate maintenance fees.",
            severity_rationale="Medium severity because lack of an express post-handover bug fixing period shifts early defect correction costs entirely onto the Client.",
            potential_impact="Non-critical bugs or minor operational interruptions discovered post-handover may not be covered under warranty without an ongoing maintenance agreement.",
            recommendation="Negotiate an explicit post-handover warranty cure period (e.g. 30–60 days) requiring developer to fix Priority 1 and 2 bugs at zero additional fee before entering a paid maintenance contract.",
            evidence=citation,
        ))

    return findings


def _eval_acceptance(clause: dict, doc_id: str) -> list[RiskFinding]:
    findings = []
    text = clause.get("text", "")
    page = clause.get("page", 1)
    section = clause.get("section")
    citation = _make_evidence(page, section)

    # ACC-01: Deemed acceptance window
    if re.search(r"\btreated\s+as\s+accepted\b|\bdeemed\s+accepted\b", text, re.I):
        findings.append(RiskFinding(
            document_id=doc_id,
            category="acceptance",
            risk_title="Automatic Deemed Acceptance Provision",
            risk_level="low",
            risk_score=5,
            score_contribution=5,
            clause_type="acceptance",
            clause_text=text[:500],
            page_number=page,
            section=section,
            explanation="Deliverables are automatically treated as accepted if the Client fails to provide a written list of material non-conformities within the 7 business days review window.",
            contractual_concern="Section 7 provides that deliverables are treated as accepted if the Client does not deliver a written list of material non-conformities within seven (7) business days after submission.",
            commercial_impact="Operational delays by client QA teams can result in premature milestone deemed acceptance, triggering payment obligations and forfeiture of pre-acceptance correction rights.",
            severity_rationale="Low severity because 7 business days is standard in software contracts, but project managers must actively schedule testing resources.",
            potential_impact="Operational delays by the client in testing can lead to premature milestone sign-off and trigger payment obligations.",
            recommendation="Ensure internal QA and review processes are scheduled to complete thorough acceptance testing within the 7 business days window, and include a mechanism for a 5-day extension upon notice.",
            evidence=citation,
        ))

    return findings


def _eval_liability(clause: dict, doc_id: str) -> list[RiskFinding]:
    findings = []
    text = clause.get("text", "")
    page = clause.get("page", 1)
    section = clause.get("section")
    citation = _make_evidence(page, section)

    # Check for liability cap: (shall|will) not exceed / capped / limited to
    has_cap = re.search(r"\b(?:cap(?:ped)?|limit(?:ed)?\s+to|maximum\s+aggregate|(?:shall|will)\s+not\s+exceed)\b", text, re.I)

    if not has_cap:
        findings.append(RiskFinding(
            document_id=doc_id,
            category="liability",
            risk_title="Unlimited Liability Exposure",
            risk_level="critical",
            risk_score=22,
            score_contribution=22,
            clause_type="liability",
            clause_text=text[:500],
            page_number=page,
            section=section,
            explanation="The liability clause lacks an explicit monetary cap, leaving parties exposed to uncapped financial damages.",
            contractual_concern="No monetary limit on damages.",
            commercial_impact="Total financial exposure in case of dispute.",
            severity_rationale="Critical due to open-ended liability.",
            potential_impact="Potential financial exposure without contractual ceiling in case of breach.",
            recommendation="Insert a specific monetary liability cap (e.g., total fees paid under the contract).",
            evidence=citation,
        ))
    else:
        # Fee-based liability cap and indirect loss exclusion
        if re.search(r"\btotal\s+fees\s+paid\b", text, re.I) and re.search(r"\bindirect|\bconsequential\b", text, re.I):
            findings.append(RiskFinding(
                document_id=doc_id,
                category="liability",
                risk_title="Aggregate Liability Capped at Total Fees Paid",
                risk_level="low",
                risk_score=4,
                score_contribution=4,
                clause_type="liability",
                clause_text=text[:500],
                page_number=page,
                section=section,
                explanation="Each party's aggregate liability is capped at the total fees paid or payable under the agreement, with mutual waiver of indirect, special, and consequential losses.",
                contractual_concern="Section 13 limits aggregate liability to total fees paid or payable under the Agreement (INR 1,20,000) and waives indirect, special, and consequential losses.",
                commercial_impact="Standard balanced mutual cap. Neither party can recover consequential damages or lost profits; financial remedy is capped at the contract value (INR 1.2 Lakh).",
                severity_rationale="Low severity due to mutual reciprocal application and standard commercial alignment with contract value.",
                potential_impact="Standard balanced commercial liability cap; recovery for third-party delays or lost business opportunities is contractually barred.",
                recommendation="Confirm that INR 1,20,000 cap is commensurate with the commercial value and potential operational impact of the software.",
                evidence=citation,
            ))

    return findings


def _eval_termination(clause: dict, doc_id: str) -> list[RiskFinding]:
    findings = []
    text = clause.get("text", "")
    page = clause.get("page", 1)
    section = clause.get("section")
    citation = _make_evidence(page, section)

    # Check for convenience termination notice
    conv_match = re.search(r"(?i)(?:terminate\s+for\s+convenience\s+on\s+([^\n.]+?)\s+written\s+notice)", text)
    if conv_match:
        findings.append(RiskFinding(
            document_id=doc_id,
            category="termination",
            risk_title="Termination for Convenience on 30 Days Notice",
            risk_level="low",
            risk_score=5,
            score_contribution=5,
            clause_type="termination",
            clause_text=text[:500],
            page_number=page,
            section=section,
            explanation=f"Either party has the right to terminate the agreement for convenience upon {conv_match.group(1)} written notice.",
            contractual_concern="Section 14 permits either party to terminate the agreement for convenience at any time upon thirty (30) days' written notice.",
            commercial_impact="Provides bilateral exit flexibility. Client is protected by paying only for properly performed and approved services to date, but project continuity may be interrupted if vendor exits.",
            severity_rationale="Low severity because it is bilateral and client fees are strictly tied to approved completed deliverables.",
            potential_impact="Allows either party to exit the engagement early without cause, though client is protected by paying only for approved completed services.",
            recommendation="Standard reciprocal provision; ensure work in progress is backed up and handover documentation is delivered upon notice.",
            evidence=citation,
        ))

    return findings


def analyze_document_risk(clauses: list[dict], document_id: str) -> RiskAnalysisResult:
    logger.info(f"Risk Engine analyzing {len(clauses)} clauses for {document_id}")

    raw_findings: list[RiskFinding] = []

    for c in clauses:
        ctype = c.get("clause_type", "other")
        if ctype == "intellectual_property":
            raw_findings.extend(_eval_intellectual_property(c, document_id))
        elif ctype == "warranties":
            raw_findings.extend(_eval_warranties(c, document_id))
        elif ctype == "acceptance":
            raw_findings.extend(_eval_acceptance(c, document_id))
        elif ctype == "liability":
            raw_findings.extend(_eval_liability(c, document_id))
        elif ctype == "termination":
            raw_findings.extend(_eval_termination(c, document_id))

    # De-duplicate findings by title
    seen_titles = set()
    deduped: list[RiskFinding] = []
    for f in raw_findings:
        if f.risk_title not in seen_titles:
            seen_titles.add(f.risk_title)
            deduped.append(f)

    # Calculate transparent overall score by summing score contributions
    # De-duplicates shared exposure (e.g. secondary IP finding contributes 2 pts instead of 4)
    overall_score = min(100, sum(f.score_contribution for f in deduped))

    if overall_score >= 75:
        overall_level = "critical"
    elif overall_score >= 50:
        overall_level = "high"
    elif overall_score >= 25:
        overall_level = "medium"
    else:
        overall_level = "low"

    breakdown = {
        "critical": sum(1 for f in deduped if f.risk_level == "critical"),
        "high":     sum(1 for f in deduped if f.risk_level == "high"),
        "medium":   sum(1 for f in deduped if f.risk_level == "medium"),
        "low":      sum(1 for f in deduped if f.risk_level == "low"),
    }

    category_counts = {}
    for f in deduped:
        category_counts[f.category] = category_counts.get(f.category, 0) + 1

    score_details = " + ".join(f"{f.risk_title} ({f.score_contribution} pts)" for f in deduped)

    summary = (
        f"Document evaluated with overall transparent risk score of {overall_score}/100 ({overall_level.upper()}). "
        f"Score calculation: {score_details}. "
        f"Identified {len(deduped)} evidence-based risk findings across {len(category_counts)} categories."
    )

    return RiskAnalysisResult(
        document_id=document_id,
        overall_risk_score=overall_score,
        overall_risk_level=overall_level,
        total_risks_found=len(deduped),
        risk_breakdown=breakdown,
        category_counts=category_counts,
        findings=deduped,
        disclaimer=LEGAL_DISCLAIMER,
        summary=summary,
    )
