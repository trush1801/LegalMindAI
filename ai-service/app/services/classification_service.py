"""
Document Classification Service
Hierarchical legal document classification for LegalMind AI.

Supported Categories:
  1. Business Agreement (MSA, SOW, Vendor, Software Development Services)
  2. Employment Contract & Covenants
  3. Non-Disclosure Agreement (NDA)
  4. Property & Commercial Lease
  5. Corporate & Shareholder Agreement
  6. Financial & Loan Agreement
  7. Digital, Privacy & Terms of Service
  8. Legal & Power of Attorney
  9. General / Other Agreement
"""

import re
import logging
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

CATEGORY_TAXONOMY = {
    "business": {
        "primary_category": "Business Agreement",
        "subtypes": [
            ("Software Development Services Agreement", "Services / Vendor Agreement", [
                "software development", "software development services", "web-based", "source code",
                "deliverables", "milestone", "acceptance testing", "development services",
                "software services agreement", "software services"
            ]),
            ("Master Services Agreement (MSA)", "Services / Vendor Agreement", [
                "master services agreement", "statement of work", "sow", "scope of services", "msa", "services agreement"
            ]),
            ("Vendor / Supplier Agreement", "Supply & Procurement", [
                "vendor agreement", "supplier agreement", "supply agreement", "purchase order"
            ]),
            ("Service Level Agreement (SLA)", "Services / Operations", [
                "service level agreement", "sla", "uptime", "availability", "service credits"
            ]),
            ("Consulting Agreement", "Professional Services", [
                "consulting agreement", "consultancy agreement", "consultant"
            ]),
        ],
        "default_subtype": "General Business Contract",
        "default_related": "Commercial / Trade Agreement",
    },
    "employment": {
        "primary_category": "Employment Contract & Covenants",
        "subtypes": [
            # Employment NDA must be checked BEFORE generic employment agreement
            # because an employment NDA will match both "employee" and "confidential"
            ("Non-Disclosure Agreement (Employment)", "Information Security & IP", [
                "non-disclosure", "confidentiality agreement", "confidential information",
                "nda", "proprietary information", "trade secret"
            ]),
            ("Employment Agreement", "Labor & HR", [
                "employment agreement", "employment contract", "appointment letter", "offer letter",
                "salary", "probation", "employee", "employer"
            ]),
            ("Non-Compete & Non-Solicitation Agreement", "Restrictive Covenants", [
                "non-compete", "non-solicitation", "restraint of trade", "covenant"
            ]),
            ("Severance Agreement", "Employment Separation", [
                "severance agreement", "separation agreement", "release of claims"
            ]),
        ],
        "default_subtype": "Employment Contract",
        "default_related": "HR & Labor Agreement",
    },
    "confidentiality": {
        "primary_category": "Non-Disclosure Agreement (NDA)",
        "subtypes": [
            ("Mutual Non-Disclosure Agreement", "Information Security & IP", [
                "mutual non-disclosure", "mutual nda", "both parties receive confidential"
            ]),
            ("Unilateral Non-Disclosure Agreement", "Information Security & IP", [
                "non-disclosure agreement", "confidentiality agreement", "proprietary information", "nda"
            ]),
        ],
        "default_subtype": "Non-Disclosure Agreement (NDA)",
        "default_related": "Information Protection Agreement",
    },
    "property": {
        "primary_category": "Property & Commercial Lease",
        "subtypes": [
            ("Commercial Lease Agreement", "Real Estate", [
                "commercial lease", "office lease", "premises", "lessor", "lessee", "rent"
            ]),
            ("Residential Tenancy Agreement", "Real Estate", [
                "tenancy agreement", "rental agreement", "landlord", "tenant"
            ]),
        ],
        "default_subtype": "Lease / Rental Agreement",
        "default_related": "Real Estate Contract",
    },
    "corporate": {
        "primary_category": "Corporate & Shareholder Agreement",
        "subtypes": [
            ("Shareholders Agreement", "Corporate Governance", [
                "shareholders agreement", "sha", "equity shares", "voting rights", "board of directors"
            ]),
            ("Partnership Agreement", "Business Formation", [
                "partnership agreement", "partnership deed", "partners"
            ]),
        ],
        "default_subtype": "Corporate Agreement",
        "default_related": "Governance Contract",
    },
    "financial": {
        "primary_category": "Financial & Loan Agreement",
        "subtypes": [
            ("Loan Agreement", "Credit & Financing", [
                "loan agreement", "borrower", "lender", "principal amount", "interest rate", "repayment"
            ]),
            ("Promissory Note", "Debt Instrument", [
                "promissory note", "promise to pay"
            ]),
        ],
        "default_subtype": "Loan / Credit Agreement",
        "default_related": "Financial Contract",
    },
    "digital": {
        "primary_category": "Digital, Privacy & Terms of Service",
        "subtypes": [
            ("Privacy Policy", "Compliance & Data", [
                "privacy policy", "personal data", "gdpr", "cookies", "data protection"
            ]),
            ("Terms of Service", "Digital Platform Terms", [
                "terms of service", "terms and conditions", "user agreement", "acceptable use"
            ]),
        ],
        "default_subtype": "Terms of Service / Privacy Policy",
        "default_related": "Digital Platform Agreement",
    },
    "legal": {
        "primary_category": "Legal & Power of Attorney",
        "subtypes": [
            ("Power of Attorney", "Authority & Agency", [
                "power of attorney", "poa", "attorney-in-fact", "grant of authority"
            ]),
            ("Settlement Agreement", "Dispute Resolution", [
                "settlement agreement", "release and settlement", "compromise deed"
            ]),
        ],
        "default_subtype": "Legal Document / Instrument",
        "default_related": "Legal Authority Instrument",
    },
}


@dataclass
class ClassificationResult:
    primary_category: str
    subtype:          str
    related_type:     str
    confidence:       float
    evidence:         str

    def to_dict(self) -> dict:
        return asdict(self)


def fallback_classify(title_hint: str = "", declared_type: str = "") -> ClassificationResult:
    """
    Safe fallback classification if full text classification fails or raises an error.
    Inspects title hint and declared type; otherwise safely falls back to General Commercial Agreement.
    Never defaults an unknown document to software_development_agreement.
    """
    title_lower = (title_hint or "").lower().replace("_", " ").replace("-", " ")
    decl_lower = (declared_type or "").lower().strip()

    # 1. Check title_hint for clear keywords across taxonomy
    for cat_key, cat_data in CATEGORY_TAXONOMY.items():
        for subtype_name, related_type, keywords in cat_data["subtypes"]:
            if any(re.search(r'\b' + re.escape(kw) + r'\b', title_lower) for kw in keywords[:3]):
                return ClassificationResult(
                    primary_category=cat_data["primary_category"],
                    subtype=subtype_name,
                    related_type=related_type,
                    confidence=0.60,
                    evidence=f"Fallback classification from filename/title signal: {title_hint}",
                )

    # 2. Check declared_type
    if decl_lower in CATEGORY_TAXONOMY:
        cat_data = CATEGORY_TAXONOMY[decl_lower]
        return ClassificationResult(
            primary_category=cat_data["primary_category"],
            subtype=cat_data["default_subtype"],
            related_type=cat_data["default_related"],
            confidence=0.55,
            evidence=f"Fallback based on user selection: {cat_data['primary_category']}",
        )

    # 3. Safe generic fallback
    return ClassificationResult(
        primary_category="General / Other Agreement",
        subtype="General Commercial Agreement",
        related_type="Commercial / Legal Agreement",
        confidence=0.30,
        evidence="Fallback classification: generic contract without distinctive category markers",
    )


def classify_document(full_text: str, title_hint: str = "", declared_type: str = "") -> ClassificationResult:
    """
    Classify document hierarchically using full text content, headings, and parties.

    Special combination logic:
    - If a document contains both employment context (Company, Employee) and NDA
      terminology (confidential information, non-disclosure), it is classified as
      Employment Contract & Covenants / Non-Disclosure Agreement (Employment).
    - This combination check runs BEFORE the general keyword scan.
    """
    text_sample = full_text[:4000].lower()
    full_lower = full_text.lower()
    title_lower = (title_hint or "").lower().replace("_", " ").replace("-", " ")

    # ── Special combination: Employment NDA vs General Employment Contract ──
    # Signals indicating that an agreement is specifically an Employment NDA (pure confidentiality focus)
    _employment_nda_signals = [
        "employee", "employer", "company", "employment", "during employment",
        "term of employment", "employment relationship"
    ]
    _nda_signals = [
        "confidential information", "non-disclosure", "nda", "proprietary information",
        "trade secret", "confidentiality"
    ]
    _general_employment_signals = [
        "salary", "compensation", "remuneration", "wage", "ctc", "per annum",
        "monthly salary", "appointed to the position", "position and duties",
        "probation", "annual leave"
    ]

    has_employment = any(bool(re.search(r'\b' + re.escape(sig) + r'\b', text_sample)) for sig in _employment_nda_signals)
    has_nda = any(bool(re.search(r'\b' + re.escape(sig) + r'\b', text_sample)) for sig in _nda_signals)
    has_general_emp = any(bool(re.search(r'\b' + re.escape(sig) + r'\b', text_sample)) for sig in _general_employment_signals)
    is_nda_title = bool(re.search(r'\b(?:non[- ]disclosure|confidentiality\s+agreement|nda|proprietary\s+information)\b', title_lower)) or bool(re.search(r'\b(?:non[- ]disclosure|confidentiality\s+agreement|nda|proprietary\s+information)\b', text_sample[:600]))

    # An Employment NDA is identified when:
    # 1. The title explicitly indicates non-disclosure / confidentiality, OR
    # 2. Employment signals exist alongside NDA signals WITHOUT general salary/compensation covenants
    if has_employment and has_nda and (is_nda_title or not has_general_emp):
        matched = [s for s in _employment_nda_signals + _nda_signals if re.search(r'\b' + re.escape(s) + r'\b', text_sample)]
        logger.info(
            f"Employment NDA combination detected: {matched[:6]} — "
            "classifying as Employment Contract & Covenants / Non-Disclosure Agreement (Employment)"
        )
        return ClassificationResult(
            primary_category="Employment Contract & Covenants",
            subtype="Non-Disclosure Agreement (Employment)",
            related_type="Information Security & IP",
            confidence=min(0.98, 0.70 + (len(matched) * 0.03)),
            evidence=f"Employment NDA signals found: {', '.join(matched[:6])}",
        )

    # 1. Check title and headers with word boundaries
    best_match = None
    best_score = 0.0

    # Check each category taxonomy
    for cat_key, cat_data in CATEGORY_TAXONOMY.items():
        for subtype_name, related_type, keywords in cat_data["subtypes"]:
            matched_kws = []
            score = 0.0
            
            # Check title hint or top text with exact word boundary
            for kw in keywords:
                kw_pat = r'\b' + re.escape(kw) + r'\b'
                if re.search(kw_pat, text_sample):
                    score += 3.0
                    matched_kws.append(kw)
                elif re.search(kw_pat, full_lower):
                    score += 1.0
                    matched_kws.append(kw)
            
            # Exact title boost
            if any(bool(re.search(r'\b' + re.escape(kw) + r'\b', title_lower)) or bool(re.search(r'\b' + re.escape(kw) + r'\b', text_sample[:500])) for kw in keywords[:2]):
                score += 5.0
            
            if score > best_score:
                best_score = score
                evidence_text = f"Identified {len(matched_kws)} matching signals ({', '.join(matched_kws[:4])})"
                best_match = ClassificationResult(
                    primary_category=cat_data["primary_category"],
                    subtype=subtype_name,
                    related_type=related_type,
                    confidence=min(0.98, max(0.65, 0.50 + (score / 15.0))),
                    evidence=evidence_text,
                )

    if best_match and best_match.confidence >= 0.70:
        logger.info(f"Classified document as: {best_match.primary_category} / {best_match.subtype} (conf={best_match.confidence})")
        return best_match

    # Fallback to declared_type if provided
    decl = (declared_type or "").lower().strip()
    if decl in CATEGORY_TAXONOMY:
        cat_data = CATEGORY_TAXONOMY[decl]
        return ClassificationResult(
            primary_category=cat_data["primary_category"],
            subtype=cat_data["default_subtype"],
            related_type=cat_data["default_related"],
            confidence=0.75,
            evidence=f"Classified based on user selection: {cat_data['primary_category']}",
        )

    # General fallback
    return ClassificationResult(
        primary_category="General / Other Agreement",
        subtype="General Commercial Agreement",
        related_type="Commercial / Legal Agreement",
        confidence=0.50,
        evidence="General contractual terminology detected without distinctive category markers",
    )

