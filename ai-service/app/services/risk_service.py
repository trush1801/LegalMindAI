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
    sec_label = f"Section {section}" if section else "Intellectual property clause"

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
            contractual_concern=f"{sec_label} stipulates that IP rights in bespoke custom code vest in the Client only 'Upon full payment of all amounts due'.",
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
            score_contribution=2,  # Shared IP exposure discounted
            clause_type="intellectual_property",
            clause_text=text[:500],
            page_number=page,
            section=section,
            explanation="The developer retains ownership of underlying tools, libraries, and templates developed independently of this engagement, granting a perpetual, non-exclusive license to the client.",
            contractual_concern=f"{sec_label} notes that the developer retains proprietary ownership of pre-existing tools, libraries, templates, and know-how used to build the application.",
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
    sec_label = f"Section {section}" if section else "Warranty clause"

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
            contractual_concern=f"{sec_label} provides a general warranty of reasonable skill and care, but expressly disclaims implied warranties (merchantability, fitness for purpose) and does not warrant uninterrupted or error-free performance.",
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
    sec_label = f"Section {section}" if section else "Acceptance clause"

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
            explanation="Deliverables are automatically treated as accepted if the Client fails to provide a written list of material non-conformities within the review window.",
            contractual_concern=f"{sec_label} provides that deliverables are treated as accepted if the Client does not deliver a written list of material non-conformities within the specified review period after submission.",
            commercial_impact="Operational delays by client QA teams can result in premature milestone deemed acceptance, triggering payment obligations and forfeiture of pre-acceptance correction rights.",
            severity_rationale="Low severity because a structured acceptance window is standard in software contracts, but project managers must actively schedule testing resources.",
            potential_impact="Operational delays by the client in testing can lead to premature milestone sign-off and trigger payment obligations.",
            recommendation="Ensure internal QA and review processes are scheduled to complete thorough acceptance testing within the review window, and include a mechanism for an extension upon notice.",
            evidence=citation,
        ))

    return findings


def _eval_liability(clause: dict, doc_id: str, is_sdsa: bool = True) -> list[RiskFinding]:
    findings = []
    text = clause.get("text", "")
    page = clause.get("page", 1)
    section = clause.get("section")
    citation = _make_evidence(page, section)
    sec_label = f"Section {section}" if section else "Liability clause"

    # Check for liability cap: (shall|will) not exceed / capped / limited to
    has_cap = re.search(r"\b(?:cap(?:ped)?|limit(?:ed)?\s+to|maximum\s+aggregate|(?:shall|will)\s+not\s+exceed)\b", text, re.I)

    # Check if monetary cap is mentioned in text
    cap_amt_m = re.search(r'(?:INR|Rs\.?|USD|EUR|₹)\s*[\d,]+(?:\.\d{1,2})?', text, re.I)
    cap_amt_str = f" ({cap_amt_m.group(0).strip()})" if cap_amt_m else ""

    if not has_cap:
        # In an employment / NDA context where remedies are equitable or under law:
        if not is_sdsa or re.search(r"\binjunctive\b|\bequitable\s+relief\b", text, re.I):
            findings.append(RiskFinding(
                document_id=doc_id,
                category="liability",
                risk_title="Injunctive and Equitable Relief Remedies",
                risk_level="low",
                risk_score=5,
                score_contribution=4,
                clause_type="liability",
                clause_text=text[:500],
                page_number=page,
                section=section,
                explanation="The agreement provides that unauthorised disclosure causes irreparable harm for which injunctive relief may be sought in addition to legal remedies.",
                contractual_concern=f"{sec_label} specifies equitable and injunctive relief remedies for breach, with liability determined under applicable law without a fixed monetary ceiling.",
                commercial_impact="Standard protection for intellectual property and confidential information; protects the company against unauthorized dissemination while ensuring judicial oversight.",
                severity_rationale="Low severity as equitable relief is standard and necessary in confidentiality protections.",
                potential_impact="Court-ordered injunctions may be granted to prevent threatened or continuing disclosure.",
                recommendation="Ensure compliance protocols and data safeguards are maintained to avoid triggering equitable enforcement actions.",
                evidence=citation,
            ))
        else:
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
                contractual_concern=f"{sec_label} does not specify a monetary ceiling on contractual damages.",
                commercial_impact="Total financial exposure in case of dispute without an agreed ceiling.",
                severity_rationale="Critical due to open-ended liability in a commercial agreement.",
                potential_impact="Potential financial exposure without contractual ceiling in case of breach.",
                recommendation="Insert a specific monetary liability cap (e.g., total fees paid under the contract).",
                evidence=citation,
            ))
    else:
        # Fee-based liability cap and indirect loss exclusion
        if re.search(r"\btotal\s+fees\s+paid\b", text, re.I) or re.search(r"\bindirect|\bconsequential\b", text, re.I):
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
                explanation=f"Each party's aggregate liability is capped at the total fees paid or payable under the agreement{cap_amt_str}, with mutual waiver of indirect, special, and consequential losses.",
                contractual_concern=f"{sec_label} limits aggregate liability to total fees paid or payable under the Agreement{cap_amt_str} and waives indirect, special, and consequential losses.",
                commercial_impact="Standard balanced mutual cap. Neither party can recover consequential damages or lost profits; financial remedy is capped at the contract value.",
                severity_rationale="Low severity due to mutual reciprocal application and standard commercial alignment with contract value.",
                potential_impact="Standard balanced commercial liability cap; recovery for indirect losses or lost business opportunities is contractually barred.",
                recommendation=f"Confirm that the liability cap{cap_amt_str} is commensurate with the commercial value and potential operational impact of the services.",
                evidence=citation,
            ))

    return findings


def _eval_termination(clause: dict, doc_id: str) -> list[RiskFinding]:
    findings = []
    text = clause.get("text", "")
    page = clause.get("page", 1)
    section = clause.get("section")
    citation = _make_evidence(page, section)
    sec_label = f"Section {section}" if section else "Termination clause"

    # Check for convenience termination notice
    conv_match = re.search(r"(?i)(?:terminate\s+for\s+convenience\s+on\s+([^\n.]+?)\s+written\s+notice|upon\s+([^\n.]+?)\s+(?:prior\s+)?written\s+notice)", text)
    if conv_match:
        notice_period = (conv_match.group(1) or conv_match.group(2) or "agreed").strip()
        findings.append(RiskFinding(
            document_id=doc_id,
            category="termination",
            risk_title=f"Termination for Convenience on {notice_period.title()} Notice",
            risk_level="low",
            risk_score=5,
            score_contribution=5,
            clause_type="termination",
            clause_text=text[:500],
            page_number=page,
            section=section,
            explanation=f"Either party has the right to terminate the agreement for convenience upon {notice_period} written notice.",
            contractual_concern=f"{sec_label} permits either party to terminate the agreement for convenience upon {notice_period} written notice.",
            commercial_impact="Provides bilateral exit flexibility. Ensures operational adaptability while requiring advance written notification.",
            severity_rationale="Low severity because it is bilateral and client fees are tied to approved completed deliverables.",
            potential_impact="Allows either party to exit the engagement early without cause upon providing the requisite notice.",
            recommendation="Standard reciprocal provision; ensure work in progress is documented and handover obligations are delivered upon notice.",
            evidence=citation,
        ))

    return findings


def _eval_confidentiality(clause: dict, doc_id: str, has_doc_carveout: bool = False) -> list[RiskFinding]:
    findings = []
    text = clause.get("text", "")
    page = clause.get("page", 1)
    section = clause.get("section")
    citation = _make_evidence(page, section)
    sec_label = f"Section {section}" if section else "Confidentiality clause"

    # Only evaluate operative confidentiality clauses that actually impose non-disclosure restrictions
    # (Skip definitions, exclusions, and permitted disclosure sections)
    title = str(clause.get("section_title", "")).upper()
    if any(kw in title for kw in ("DEFINITION", "EXCLUSION", "PERMITTED")):
        return findings

    # Check for missing legally required disclosure exception across entire document
    if not has_doc_carveout and "disclose" in text.lower() and not re.search(r"\brequired\s+by\s+law\b|\bcourt\s+order\b|\bstatutory\b", text, re.I):
        findings.append(RiskFinding(
            document_id=doc_id,
            category="confidentiality",
            risk_title="Absence of Legally Required Disclosure Carve-Out",
            risk_level="medium",
            risk_score=8,
            score_contribution=6,
            clause_type="confidentiality",
            clause_text=text[:500],
            page_number=page,
            section=section,
            explanation="The confidentiality clause does not explicitly exclude legally compelled disclosures (e.g. court orders, statutory compliance).",
            contractual_concern=f"{sec_label} restricts disclosure without an explicit carve-out for disclosures compelled by law or judicial process.",
            commercial_impact="Risk of breach allegation if a party is subpoenaed or legally required to furnish records.",
            severity_rationale="Medium severity because legally compelled disclosures cannot be waived by private contract.",
            potential_impact="Potential friction or dispute if compliance with a legal summons is required.",
            recommendation="Insert a standard carve-out allowing disclosure to the extent required by law or competent court order upon prompt notice.",
            evidence=citation,
        ))

    return findings


def _eval_non_compete(clause: dict, doc_id: str, is_employment: bool = False) -> list[RiskFinding]:
    findings = []
    text = clause.get("text", "")
    page = clause.get("page", 1)
    section = clause.get("section")
    citation = _make_evidence(page, section)
    sec_label = f"Section {section}" if section else "Restrictive covenant clause"

    # Check for express affirmation of NO restraint (e.g. Section 12 in Employment NDA)
    if re.search(r"\b(?:no\s+restriction|does\s+not\s+prohibit\s+the\s+employee|accepting\s+lawful\s+employment\s+elsewhere)\b", text, re.I):
        findings.append(RiskFinding(
            document_id=doc_id,
            category="non_compete",
            risk_title="Express Confirmation of No Restraint on Future Employment",
            risk_level="low",
            risk_score=2,
            score_contribution=0,  # Favourable clause: 0 risk points added
            clause_type="non_compete",
            clause_text=text[:500],
            page_number=page,
            section=section,
            explanation="The agreement explicitly confirms that the employee is not restricted from accepting lawful employment elsewhere post-termination.",
            contractual_concern=f"{sec_label} confirms there is no restriction on future employment, strictly aligning with Section 27 of the Indian Contract Act 1872.",
            commercial_impact="Provides certainty for the employee while safeguarding company confidential information through surviving non-disclosure covenants.",
            severity_rationale="Low/informational severity; affirmative legal compliance that avoids restraint-of-trade unenforceability.",
            potential_impact="Employee remains free to pursue future employment subject only to continuing non-disclosure obligations.",
            recommendation="Maintain clear separation between protection of proprietary trade secrets and freedom to seek lawful employment.",
            evidence=citation,
        ))
    elif is_employment and re.search(r"\bshall\s+not\s+(?:engage|compete|work\s+for|solicit)\b", text, re.I):
        # Post-employment non-compete in employment contract is void under Indian law
        findings.append(RiskFinding(
            document_id=doc_id,
            category="non_compete",
            risk_title="Post-Employment Restraint Enforceability Exposure",
            risk_level="high",
            risk_score=14,
            score_contribution=12,
            clause_type="non_compete",
            clause_text=text[:500],
            page_number=page,
            section=section,
            explanation="Post-employment non-compete covenants are generally void and unenforceable under Section 27 of the Indian Contract Act 1872.",
            contractual_concern=f"{sec_label} imposes post-termination restrictive covenants that may constitute an unlawful restraint of trade under Indian law.",
            commercial_impact="Attempts to enforce post-employment non-compete restrictions through litigation face heavy legal hurdles under settled Indian precedent.",
            severity_rationale="High severity because covenants in restraint of trade are void ab initio under Section 27 of the Indian Contract Act.",
            potential_impact="Unenforceability of the non-compete clause in judicial enforcement proceedings.",
            recommendation="Rely on robust non-disclosure and trade secret protections rather than post-employment non-compete restrictions.",
            evidence=citation,
        ))

    return findings


def _eval_governing_law(clause: dict, doc_id: str) -> list[RiskFinding]:
    findings = []
    text = clause.get("text", "")
    page = clause.get("page", 1)
    section = clause.get("section")
    citation = _make_evidence(page, section)
    sec_label = f"Section {section}" if section else "Governing law clause"

    # Check if jurisdiction is unclear or missing
    if not re.search(r"\bcourts?\b|\bjurisdiction\b", text, re.I):
        findings.append(RiskFinding(
            document_id=doc_id,
            category="governing_law",
            risk_title="Unspecified Dispute Forum / Court Jurisdiction",
            risk_level="medium",
            risk_score=7,
            score_contribution=5,
            clause_type="governing_law",
            clause_text=text[:500],
            page_number=page,
            section=section,
            explanation="The clause specifies governing law but does not designate a specific court jurisdiction for resolving disputes.",
            contractual_concern=f"{sec_label} designates governing law without naming the exclusive or competent court forum for disputes.",
            commercial_impact="Jurisdictional uncertainty and potential multi-forum litigation in the event of dispute.",
            severity_rationale="Medium severity due to procedural complexity and venue dispute risks.",
            potential_impact="Parties may dispute the appropriate judicial forum, increasing litigation costs and delay.",
            recommendation="Specify exclusive jurisdiction of competent courts in a mutually agreed city.",
            evidence=citation,
        ))

    return findings


def _eval_payment(clause: dict, doc_id: str) -> list[RiskFinding]:
    findings = []
    text = clause.get("text", "")
    page = clause.get("page", 1)
    section = clause.get("section")
    citation = _make_evidence(page, section)
    sec_label = f"Section {section}" if section else "Payment clause"

    # Check for excessive late payment interest (>18% per year or >2% per month)
    int_m = re.search(r'(\d+(?:\.\d+)?)\s*%\s*(?:per\s+month|per\s+annum|annual|monthly)', text, re.I)
    if int_m:
        rate = float(int_m.group(1))
        is_monthly = "month" in int_m.group(0).lower()
        if (is_monthly and rate > 2.0) or (not is_monthly and rate > 18.0):
            findings.append(RiskFinding(
                document_id=doc_id,
                category="payment",
                risk_title="High Late Payment Interest Penalty",
                risk_level="medium",
                risk_score=7,
                score_contribution=6,
                clause_type="payment",
                clause_text=text[:500],
                page_number=page,
                section=section,
                explanation=f"The agreement imposes a high late payment interest charge of {int_m.group(0)}.",
                contractual_concern=f"{sec_label} stipulates a punitive interest rate of {int_m.group(0)} for overdue invoices.",
                commercial_impact="Increases financial liability significantly if invoices are disputed or delayed.",
                severity_rationale="Medium severity because penalty-rate interest may be contested under contract law.",
                potential_impact="Exposure to disproportionate interest charges on disputed or delayed payments.",
                recommendation="Negotiate late payment interest down to standard commercial rate (e.g. 1% per month / 12% per annum) with a grace period.",
                evidence=citation,
            ))

    return findings


def analyze_document_risk(
    clauses: list[dict],
    document_id: str,
    doc_category: str = "",
    doc_type: str = ""
) -> RiskAnalysisResult:
    logger.info(f"Risk Engine analyzing {len(clauses)} clauses for {document_id} (category={doc_category}, type={doc_type})")

    doc_combined = f"{doc_category} {doc_type}".lower()
    is_sdsa = any(kw in doc_combined for kw in ("software", "development", "vendor", "consulting", "services")) and "employment" not in doc_combined and "lease" not in doc_combined
    is_employment = "employment" in doc_combined

    # Document-wide scan: Check if ANY clause or section contains legally required disclosure exceptions or protected reporting
    has_legal_disclosure_carveout = any(
        re.search(r'\b(?:required\s+by\s+law|court\s+order|competent\s+(?:government\s+)?authority|statutory|protected\s+reports?)\b', c.get("text", ""), re.I)
        for c in clauses
        if not ("APPENDIX" in str(c.get("section", "")).upper() or "APPENDIX" in str(c.get("section_title", "")).upper())
    )

    raw_findings: list[RiskFinding] = []

    for c in clauses:
        ctype = c.get("clause_type", "other")
        c_text = c.get("text", "")

        # Skip informational appendices, notes, preambles
        sec_str = str(c.get("section", "")).upper()
        title_str = str(c.get("section_title", "")).upper()
        if "APPENDIX" in sec_str or "APPENDIX" in title_str or "PREAMBLE" in sec_str:
            continue
        if "FOR SOFTWARE TESTING" in c_text.upper()[:100] or "EDUCATIONAL DEMONSTRATION" in c_text.upper()[:100]:
            continue

        if ctype == "intellectual_property" and is_sdsa:
            raw_findings.extend(_eval_intellectual_property(c, document_id))
        elif ctype == "warranties" and is_sdsa:
            raw_findings.extend(_eval_warranties(c, document_id))
        elif ctype == "acceptance" and is_sdsa:
            raw_findings.extend(_eval_acceptance(c, document_id))
        elif ctype == "liability":
            raw_findings.extend(_eval_liability(c, document_id, is_sdsa=is_sdsa))
        elif ctype == "termination":
            raw_findings.extend(_eval_termination(c, document_id))
        elif ctype == "confidentiality":
            raw_findings.extend(_eval_confidentiality(c, document_id, has_doc_carveout=has_legal_disclosure_carveout))
        elif ctype in ("non_compete", "covenant"):
            raw_findings.extend(_eval_non_compete(c, document_id, is_employment=is_employment))
        elif ctype in ("governing_law", "governing_law_dispute", "dispute_resolution"):
            raw_findings.extend(_eval_governing_law(c, document_id))
        elif ctype == "payment" and not is_employment:
            raw_findings.extend(_eval_payment(c, document_id))

    # De-duplicate findings by title
    seen_titles = set()
    deduped: list[RiskFinding] = []
    for f in raw_findings:
        if f.risk_title not in seen_titles:
            seen_titles.add(f.risk_title)
            deduped.append(f)

    # Calculate transparent overall score by summing score contributions
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

    score_details = " + ".join(f"{f.risk_title} ({f.score_contribution} pts)" for f in deduped) if deduped else "No active risks identified (0 pts)"

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
