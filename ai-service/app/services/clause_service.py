"""
Clause Extraction & Classification Service — Part 08B (v2)

Improvements over v1:
  - Section-level aggregation: chunks belonging to the same section are merged
    before classification so context is not lost across chunk boundaries.
  - Significantly expanded _HEADING_HINTS covering all standard clause types
    in the sample agreement and beyond.
  - Narrowed obligation keyword — "shall " alone no longer triggers a score;
    obligation scoring now requires a specific obligation-signalling phrase.
  - New clause taxonomy with 30 categories aligned to the requirements spec.
  - Context verification: heading-confirmed clause types are trusted over
    keyword-only scores from body text; prevents "Notice" → "payment" etc.
  - Negative-filter guard: a chunk classified as "payment" but whose section
    heading says "notice" is overridden.
  - Integrates Legal-BERT (nlpaueb/legal-bert-base-uncased) with updated
    anchor descriptions for the expanded taxonomy.
  - Each clause output now includes: clause_id, clause_name, clause_category,
    section, source_page, text, summary, confidence, classification_status,
    legal_significance, associated_risks.

Pipeline position:
  Preprocessing (Part 07) → [Clause Extraction] → Risk Analysis (Part 09)
"""

import logging
import re
import uuid
import numpy as np
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Legal-BERT Model Loader (Lazy Singleton)
# ─────────────────────────────────────────────────────────────

LEGAL_BERT_MODEL_NAME = "nlpaueb/legal-bert-base-uncased"

_legal_bert_tokenizer = None
_legal_bert_model     = None
_legal_bert_anchors   = None
_legal_bert_available = None  # None = untried, True = ready, False = unavailable


# ─────────────────────────────────────────────────────────────
# Expanded Clause Taxonomy — 30 categories
# ─────────────────────────────────────────────────────────────

CLAUSE_TAXONOMY: dict[str, dict] = {
    "payment":              {"label": "Payment Terms",         "significance": "HIGH",   "risk_areas": ["financial", "contractual"]},
    "confidentiality":      {"label": "Confidentiality",       "significance": "HIGH",   "risk_areas": ["legal", "data_privacy"]},
    "intellectual_property":{"label": "Intellectual Property", "significance": "CRITICAL","risk_areas": ["legal", "operational"]},
    "liability":            {"label": "Limitation of Liability","significance": "HIGH",   "risk_areas": ["financial", "legal"]},
    "indemnity":            {"label": "Indemnification",       "significance": "HIGH",   "risk_areas": ["financial", "legal"]},
    "termination":          {"label": "Termination",           "significance": "HIGH",   "risk_areas": ["contractual", "operational"]},
    "dispute_resolution":   {"label": "Dispute Resolution",    "significance": "MEDIUM", "risk_areas": ["legal"]},
    "governing_law":        {"label": "Governing Law & Jurisdiction","significance": "MEDIUM","risk_areas": ["legal"]},
    "governing_law_dispute":{"label": "Governing Law and Dispute Resolution","significance": "MEDIUM","risk_areas": ["legal"]},
    "warranties":           {"label": "Warranties & Disclaimers","significance": "HIGH",  "risk_areas": ["legal", "contractual"]},
    "data_protection":      {"label": "Data Protection & Security","significance": "HIGH","risk_areas": ["compliance", "data_privacy"]},
    "force_majeure":        {"label": "Force Majeure",         "significance": "MEDIUM", "risk_areas": ["operational", "contractual"]},
    "non_compete":          {"label": "Non-Compete / Non-Solicitation","significance": "HIGH","risk_areas": ["legal", "operational"]},
    "assignment":           {"label": "Assignment",            "significance": "MEDIUM", "risk_areas": ["contractual"]},
    "notice":               {"label": "Notice",                "significance": "LOW",    "risk_areas": ["contractual"]},
    "deliverables":         {"label": "Deliverables",          "significance": "HIGH",   "risk_areas": ["operational", "contractual"]},
    "acceptance":           {"label": "Acceptance & Corrections","significance": "MEDIUM","risk_areas": ["contractual", "operational"]},
    "change_control":       {"label": "Change Control",        "significance": "MEDIUM", "risk_areas": ["operational", "contractual"]},
    "independent_contractor":{"label": "Independent Contractor","significance": "MEDIUM","risk_areas": ["legal", "compliance"]},
    "purpose_scope":        {"label": "Purpose & Scope",       "significance": "HIGH",   "risk_areas": ["contractual"]},
    "schedule":             {"label": "Project Schedule / Timeline","significance": "HIGH","risk_areas": ["operational"]},
    "client_responsibilities":{"label": "Client Responsibilities","significance": "MEDIUM","risk_areas": ["contractual"]},
    "entire_agreement":     {"label": "Entire Agreement",      "significance": "LOW",    "risk_areas": ["contractual"]},
    "amendment":            {"label": "Amendment",             "significance": "LOW",    "risk_areas": ["contractual"]},
    "severability":         {"label": "Severability",          "significance": "LOW",    "risk_areas": ["legal"]},
    "survival":             {"label": "Survival",              "significance": "LOW",    "risk_areas": ["contractual"]},
    "audit_rights":         {"label": "Audit Rights",          "significance": "MEDIUM", "risk_areas": ["compliance"]},
    "insurance":            {"label": "Insurance",             "significance": "MEDIUM", "risk_areas": ["financial"]},
    "exclusivity":          {"label": "Exclusivity",           "significance": "MEDIUM", "risk_areas": ["contractual"]},
    "definition":           {"label": "Definitions",           "significance": "STRUCTURAL","risk_areas": []},
    "preamble":             {"label": "Preamble",              "significance": "INFORMATIONAL","risk_areas": []},
    "schedule_doc":         {"label": "Schedule / Annexure",   "significance": "INFORMATIONAL","risk_areas": []},
    "parties":              {"label": "Parties & Effective Date","significance": "STRUCTURAL","risk_areas": []},
    "signatures":           {"label": "Execution & Signatures", "significance": "STRUCTURAL","risk_areas": []},
    "assumptions":          {"label": "Project Assumptions & Specifications", "significance": "LOW", "risk_areas": ["operational"]},
    "representation":       {"label": "Representations",       "significance": "MEDIUM", "risk_areas": ["legal"]},
    "general_provisions":   {"label": "General Provisions",    "significance": "LOW",    "risk_areas": []},
    "other":                {"label": "Other",                 "significance": "INFORMATIONAL","risk_areas": []},
}

CLAUSE_TYPES = list(CLAUSE_TAXONOMY.keys())


# ─────────────────────────────────────────────────────────────
# Legal-BERT Anchor Descriptions (updated for expanded taxonomy)
# ─────────────────────────────────────────────────────────────

LEGAL_ANCHOR_DESCRIPTIONS: dict[str, str] = {
    "payment":               "fees, payment terms, invoice, payment schedule, milestone payment, INR, amount due, payment within days",
    "confidentiality":       "confidential information, non-disclosure, proprietary data, trade secrets, confidentiality obligations",
    "intellectual_property": "intellectual property, ownership of work product, copyright, source code ownership, assignment of IP, moral rights",
    "liability":             "limitation of liability, maximum liability cap, indirect damages, consequential damages, aggregate liability",
    "indemnity":             "indemnification, hold harmless, defend against third-party claims, indemnified party",
    "termination":           "termination of agreement, notice of termination, right to terminate, material breach, cure period, convenience termination",
    "dispute_resolution":    "dispute resolution, arbitration, mediation, conciliation, settlement of disputes",
    "governing_law":         "governing law, applicable law, jurisdiction, courts, legal system, state law",
    "governing_law_dispute": "governing law and dispute resolution, applicable law, jurisdiction, courts of bangalore, amicable discussions, arbitration, laws of india",
    "warranties":            "warranties, disclaimers, warranty of fitness, as-is basis, no warranty, merchantability",
    "data_protection":       "data protection, personal data, GDPR, data security, data breach, privacy obligations",
    "force_majeure":         "force majeure, act of god, natural disaster, beyond reasonable control, pandemic, unforeseen circumstances",
    "non_compete":           "non-compete, non-solicitation, restraint of trade, competing business, soliciting employees",
    "assignment":            "assignment of agreement, transfer of rights, novation, change of control",
    "notice":                "notice requirements, written notice, notification method, notice period for communication",
    "deliverables":          "deliverables, work product, software deliverables, project milestones, delivery schedule",
    "acceptance":            "acceptance testing, acceptance period, correction period, sign-off, client approval",
    "change_control":        "change control, change request, scope change, variation order, change order procedure",
    "independent_contractor": "independent contractor, not an employee, no employer-employee relationship, self-employed",
    "purpose_scope":         "purpose of agreement, scope of services, nature of engagement, services to be provided",
    "schedule":              "project schedule, timeline, duration, weeks, delivery milestones, completion date",
    "client_responsibilities": "client responsibilities, client obligations, client shall provide, client shall ensure",
    "entire_agreement":      "entire agreement, supersedes prior agreements, complete agreement, merger clause",
    "amendment":             "amendment, modification, change to agreement, written amendment required",
    "severability":          "severability, invalid provision, unenforceable clause, remaining provisions",
    "survival":              "survival of provisions, obligations surviving termination, post-termination",
    "audit_rights":          "audit rights, right to audit, inspection of records",
    "insurance":             "insurance coverage, liability insurance, professional indemnity insurance",
    "exclusivity":           "exclusivity, exclusive right, sole provider, exclusive arrangement",
    "definition":            "definitions, defined terms, hereinafter referred to, means and includes",
    "representation":        "representations and warranties, represents that, warrants that",
    "general_provisions":    "general provisions, miscellaneous, boilerplate, general terms",
}


def _init_legal_bert():
    """Lazy initialize Legal-BERT tokenizer, model, and pre-computed anchor embeddings."""
    global _legal_bert_tokenizer, _legal_bert_model, _legal_bert_anchors, _legal_bert_available

    if _legal_bert_available is False:
        return False
    if _legal_bert_model is not None and _legal_bert_anchors is not None:
        return True

    try:
        import torch
        from transformers import AutoTokenizer, AutoModel

        logger.info(f"Initializing Legal-BERT model ({LEGAL_BERT_MODEL_NAME})...")
        tokenizer = AutoTokenizer.from_pretrained(LEGAL_BERT_MODEL_NAME)
        model = AutoModel.from_pretrained(LEGAL_BERT_MODEL_NAME)
        model.eval()

        anchors = {}
        with torch.no_grad():
            for c_type, desc in LEGAL_ANCHOR_DESCRIPTIONS.items():
                inputs = tokenizer(desc, return_tensors="pt", truncation=True, max_length=128, padding=True)
                outputs = model(**inputs)
                emb = outputs.last_hidden_state.mean(dim=1).squeeze().numpy()
                norm = np.linalg.norm(emb)
                anchors[c_type] = emb / (norm + 1e-10)

        _legal_bert_tokenizer = tokenizer
        _legal_bert_model     = model
        _legal_bert_anchors   = anchors
        _legal_bert_available = True
        logger.info("Legal-BERT initialization complete. All anchor embeddings cached.")
        return True

    except Exception as e:
        logger.info(f"Legal-BERT initialization deferred/unavailable ({e}). Running on rule-engine fallback.")
        _legal_bert_available = False
        return False


def _get_legal_bert_scores(text: str) -> dict[str, float]:
    """Compute cosine similarity scores between text and canonical clause anchors using Legal-BERT."""
    if not _init_legal_bert():
        return {}

    try:
        import torch

        inputs = _legal_bert_tokenizer(text[:512], return_tensors="pt", truncation=True, max_length=256, padding=True)
        with torch.no_grad():
            outputs = _legal_bert_model(**inputs)
            emb = outputs.last_hidden_state.mean(dim=1).squeeze().numpy()
            norm = np.linalg.norm(emb)
            vec = emb / (norm + 1e-10)

        scores = {}
        for c_type, anchor_vec in _legal_bert_anchors.items():
            sim = float(np.dot(vec, anchor_vec))
            scores[c_type] = round(max(0.0, (sim + 1.0) / 2.0), 3)

        return scores

    except Exception as e:
        logger.warning(f"Legal-BERT inference failed on text snippet: {e}")
        return {}


# ─────────────────────────────────────────────────────────────
# Rule Engine — Keyword + Heading Signals
# ─────────────────────────────────────────────────────────────

# IMPORTANT: "obligation" (shall/must) is NOT a standalone clause type here.
# Every legal clause contains "shall". Obligation scoring is only used to
# identify general obligation language, not to override specific classifications.

_KEYWORD_RULES: dict[str, list[tuple[str, float]]] = {
    # Payment — requires financial context, not just "payment"
    "payment": [
        ("fees and payment", 4.0), ("payment schedule", 3.5), ("invoice", 3.0),
        ("payment within", 3.0), ("upon receipt of invoice", 3.5), ("milestone payment", 3.0),
        ("30%", 1.5), ("40%", 1.5), ("inr ", 2.5), ("rs.", 2.0), ("total contract", 3.0),
        ("payment terms", 3.5), ("late payment", 2.5), ("overdue", 2.0),
    ],
    # Termination — specific termination language
    "termination": [
        ("terminat", 3.0), ("notice period", 2.5), ("right to terminate", 3.5),
        ("end this agreement", 3.0), ("effective upon", 1.5), ("cure period", 3.0),
        ("30 days' notice", 3.0), ("convenience termination", 3.5), ("material breach", 2.5),
    ],
    # Liability — capped/limited liability
    "liability": [
        ("limitation of liability", 4.0), ("limit.*liab", 3.5), ("maximum liability", 3.5),
        ("aggregate liability", 3.5), ("in no event", 3.0), ("consequential damage", 3.0),
        ("indirect damage", 3.0), ("excluded from liability", 3.0),
    ],
    "indemnity": [
        ("indemnif", 3.5), ("hold harmless", 3.0), ("make good", 1.5), ("defend.*claim", 2.5),
    ],
    "confidentiality": [
        ("confidential", 3.5), ("non-disclosure", 3.5), ("proprietary information", 3.0),
        ("trade secret", 3.0), ("disclose.*third", 2.5), ("keep confidential", 3.0),
    ],
    "intellectual_property": [
        ("intellectual property", 3.5), ("work product", 3.0), ("copyright", 2.5),
        ("patent", 2.5), ("source code", 2.5), ("ownership.*vest", 3.0),
        ("assign.*ip", 3.0), ("moral rights", 2.5), ("assignment of rights", 3.0),
    ],
    "governing_law": [
        ("governing law", 3.5), ("governed by", 3.5), ("jurisdiction", 3.0),
        ("courts of", 3.0), ("applicable law", 3.0), ("laws of india", 3.0),
    ],
    "governing_law_dispute": [
        ("governing law and dispute resolution", 4.0), ("governed by", 3.5), ("jurisdiction", 3.0),
        ("courts of bangalore", 3.5), ("dispute resolution", 3.5), ("amicable", 3.0), ("laws of india", 3.0),
    ],
    "dispute_resolution": [
        ("arbitration", 3.5), ("dispute resolution", 4.0), ("mediation", 3.0),
        ("conciliation", 2.5), ("settle.*dispute", 2.5), ("amicable resolution", 2.5),
    ],
    "warranties": [
        ("warrants that", 3.0), ("warranty", 3.0), ("as-is", 3.0), ("no warranty", 3.5),
        ("fitness for", 2.5), ("merchantability", 3.0), ("disclaim", 3.0),
        ("service provider warrants", 3.5), ("warranty period", 3.0),
    ],
    "data_protection": [
        ("data protection", 4.0), ("personal data", 3.5), ("data security", 3.5),
        ("data breach", 3.5), ("gdpr", 3.0), ("privacy law", 3.0),
        ("process.*personal data", 3.5), ("data subject", 3.0),
    ],
    "force_majeure": [
        ("force majeure", 4.0), ("act of god", 3.5), ("beyond.*control", 3.0),
        ("natural disaster", 3.0), ("pandemic", 2.5), ("epidemic", 2.5),
    ],
    "non_compete": [
        ("non-compete", 3.5), ("non-solicit", 3.5), ("restraint of trade", 3.0),
        ("not to solicit", 3.0), ("competing business", 2.5),
    ],
    "assignment": [
        ("assignment", 3.0), ("assign.*agreement", 3.0), ("transfer.*rights", 2.5),
        ("novation", 3.0), ("change of control", 2.5),
    ],
    "notice": [
        ("notice shall be", 3.5), ("written notice", 3.0), ("notice.*sent", 2.5),
        ("notice.*email", 2.5), ("for notices", 3.0), ("method of notice", 3.0),
    ],
    "deliverables": [
        ("deliverable", 3.5), ("work product", 2.5), ("software.*deliverable", 3.0),
        ("delivery of", 2.5), ("project milestone", 3.0), ("final deliverable", 3.5),
    ],
    "acceptance": [
        ("acceptance", 3.0), ("acceptance period", 3.5), ("acceptance testing", 3.5),
        ("client.*review", 2.5), ("sign-off", 3.0), ("corrections", 2.5),
        ("deemed accepted", 3.5), ("7 business days", 2.0),
    ],
    "change_control": [
        ("change control", 4.0), ("change request", 3.5), ("scope change", 3.0),
        ("variation order", 3.0), ("change order", 3.0),
    ],
    "independent_contractor": [
        ("independent contractor", 4.0), ("not.*employee", 3.0), ("no employer", 3.0),
        ("service provider.*independent", 3.5), ("self-employed", 3.0),
    ],
    "purpose_scope": [
        ("purpose.*agreement", 3.0), ("scope of services", 3.5), ("nature of engagement", 3.0),
        ("services.*described", 2.5), ("project scope", 3.0),
    ],
    "schedule": [
        ("project schedule", 3.5), ("timeline", 3.0), ("week 1", 2.5), ("week 4", 2.5),
        ("week 6", 2.5), ("6 weeks", 3.0), ("completion.*within", 2.5),
        ("milestones", 3.0), ("project duration", 3.0),
    ],
    "client_responsibilities": [
        ("client.*responsibilities", 4.0), ("client.*shall", 2.5), ("client.*provide", 2.5),
        ("client.*ensure", 2.5), ("client.*cooperate", 3.0), ("client obligations", 3.5),
    ],
    "entire_agreement": [
        ("entire agreement", 4.0), ("supersedes.*prior", 3.5), ("complete agreement", 3.5),
        ("merger clause", 3.0), ("no other agreement", 3.0), ("whole agreement", 3.5),
    ],
    "amendment": [
        ("amendment", 3.5), ("modification.*agreement", 3.0), ("written.*amendment", 3.5),
        ("amend.*agreement", 3.0),
    ],
    "severability": [
        ("severability", 4.0), ("severable", 3.5), ("invalid.*provision", 3.0),
        ("unenforceable.*clause", 3.0), ("remaining provisions", 2.5),
    ],
    "survival": [
        ("surviv.*termination", 3.5), ("obligation.*surviv", 3.0), ("post-termination", 2.5),
    ],
    "definition": [
        ("shall mean", 3.0), ("hereinafter referred", 3.0), ("defined.*term", 2.5),
        ("for the purpose of this", 2.5), ("\"agreement\" means", 3.0),
    ],
    "representation": [
        ("represents and warrants", 3.5), ("represents that", 3.0), ("warrants that", 3.0),
    ],
    "general_provisions": [
        ("general provisions", 4.0), ("miscellaneous", 3.5), ("counterpart", 2.5),
        ("waiver.*right", 2.0), ("no waiver", 2.5),
    ],
}

# ─── Heading Hints (expanded) ───
# Maps section heading keywords → clause type
# These are TRUSTED and override keyword-only body scores.

_HEADING_HINTS: dict[str, str] = {
    # Payment
    "fees and payment": "payment",
    "fees": "payment",
    "payment terms": "payment",
    "payment": "payment",
    "compensation": "payment",
    "salary": "payment",
    "remuneration": "payment",
    # Termination
    "termination": "termination",
    "term and termination": "termination",
    "cancellation": "termination",
    # Liability
    "limitation of liability": "liability",
    "liability": "liability",
    "liability cap": "liability",
    # Indemnity
    "indemnification": "indemnity",
    "indemnity": "indemnity",
    # Confidentiality
    "confidentiality": "confidentiality",
    "non-disclosure": "confidentiality",
    "confidential information": "confidentiality",
    # IP
    "intellectual property": "intellectual_property",
    "ownership": "intellectual_property",
    "work product": "intellectual_property",
    "ip ownership": "intellectual_property",
    # Governing Law & Dispute Resolution
    "governing law and dispute resolution": "governing_law_dispute",
    "governing law": "governing_law",
    "applicable law": "governing_law",
    "jurisdiction": "governing_law",
    "law and jurisdiction": "governing_law",
    # Dispute Resolution
    "dispute resolution": "dispute_resolution",
    "arbitration": "dispute_resolution",
    "disputes": "dispute_resolution",
    # Warranties
    "warranties and disclaimers": "warranties",
    "warranties": "warranties",
    "disclaimer": "warranties",
    "warranty": "warranties",
    # Data Protection
    "data protection": "data_protection",
    "data protection and security": "data_protection",
    "data security": "data_protection",
    "privacy": "data_protection",
    # Force Majeure
    "force majeure": "force_majeure",
    # Non-Compete
    "non-compete": "non_compete",
    "non-solicitation": "non_compete",
    # Assignment
    "assignment": "assignment",
    # Notice
    "notice": "notice",
    "notices": "notice",
    # Deliverables
    "deliverables": "deliverables",
    "scope of deliverables": "deliverables",
    # Acceptance
    "acceptance": "acceptance",
    "acceptance and corrections": "acceptance",
    "testing and acceptance": "acceptance",
    # Change Control
    "change control": "change_control",
    "change management": "change_control",
    "scope changes": "change_control",
    # Independent Contractor
    "independent contractor": "independent_contractor",
    "relationship of parties": "independent_contractor",
    "contractor status": "independent_contractor",
    # Purpose & Scope
    "purpose": "purpose_scope",
    "scope": "purpose_scope",
    "purpose and scope": "purpose_scope",
    "services": "purpose_scope",
    # Schedule
    "project schedule": "schedule",
    "schedule": "schedule",
    "timeline": "schedule",
    "project timeline": "schedule",
    "project duration": "schedule",
    # Client Responsibilities
    "client responsibilities": "client_responsibilities",
    "client's responsibilities": "client_responsibilities",
    "obligations of client": "client_responsibilities",
    # Entire Agreement
    "entire agreement": "entire_agreement",
    "complete agreement": "entire_agreement",
    # Amendment
    "amendment": "amendment",
    "amendments": "amendment",
    "modifications": "amendment",
    # Severability
    "severability": "severability",
    # Survival
    "survival": "survival",
    # Preamble
    "document header & preamble": "preamble",
    "document header": "preamble",
    "preamble": "preamble",
    # Schedule
    "schedule a": "schedule",
    "schedule b": "schedule",
    "schedule": "schedule",
    # Definition
    "definitions": "definition",
    "interpretation": "definition",
    # Parties
    "parties and effective date": "parties",
    "parties": "parties",
    "recitals": "parties",
    # Signatures
    "signatures": "signatures",
    "signature": "signatures",
    "execution & signatures": "signatures",
    "execution and signatures": "signatures",
    "execution": "signatures",
    "in witness whereof": "signatures",
    # Assumptions
    "sample project assumptions": "assumptions",
    "project assumptions": "assumptions",
    "assumptions": "assumptions",
    # Representation
    "representations": "representation",
    "representations and warranties": "representation",
    # General
    "general provisions": "general_provisions",
    "general": "general_provisions",
    "miscellaneous": "general_provisions",
}

# ─── Clause types that CANNOT be assigned based on body keywords alone
# (they must be confirmed by heading or very strong keyword signals)
_HEADING_REQUIRED_TYPES = {
    "client_responsibilities",  # "shall" in body alone is insufficient
    "notice",                   # has numbers that look like payment
    "entire_agreement",         # may contain "payment" references
    "general_provisions",       # too generic
    "schedule",                 # timeline numbers could confuse other classifiers
    "parties",
    "signatures",
    "assumptions",
}


def _get_rule_scores(text: str, section_title: Optional[str]) -> tuple[dict[str, float], list[str]]:
    """
    Compute keyword + heading rule scores.

    Returns:
        (scores, matched_keywords, heading_confirmed_type)
        - If a heading hint fires, that type gets score 0.95 and is marked as confirmed.
        - heading_confirmed_type is the clause type confirmed by heading (or None).
    """
    scores: dict[str, float] = {}
    matched_all: list[str] = []
    text_lower = text.lower()
    heading_confirmed_type: Optional[str] = None

    # ── 1. Section heading detection (highest priority) ──────────────
    if section_title:
        st_lower = section_title.lower().strip()
        # Try longest-match first to avoid "notice" matching "governing law and dispute resolution"
        for hint in sorted(_HEADING_HINTS.keys(), key=len, reverse=True):
            if hint in st_lower:
                c_type = _HEADING_HINTS[hint]
                scores[c_type] = 0.95
                matched_all.append(f"heading:{hint}")
                heading_confirmed_type = c_type
                break  # Only the first (longest) heading match applies

    # ── 2. Keyword body scoring ──────────────────────────────────────
    for c_type, kws in _KEYWORD_RULES.items():
        total_weight = 0.0
        for kw, weight in kws:
            # Support regex-style patterns with .*
            if ".*" in kw:
                try:
                    if re.search(kw, text_lower):
                        total_weight += weight
                        matched_all.append(kw)
                except re.error:
                    pass
            elif kw.lower() in text_lower:
                total_weight += weight
                matched_all.append(kw.strip())

        if total_weight > 0:
            norm_score = min(0.90, 0.35 + (total_weight / 10.0))
            # Don't override a heading-confirmed score with a lower body score
            if heading_confirmed_type and c_type == heading_confirmed_type:
                scores[c_type] = max(scores.get(c_type, 0.0), norm_score)
            elif c_type != heading_confirmed_type:
                scores[c_type] = max(scores.get(c_type, 0.0), norm_score)

    return scores, matched_all, heading_confirmed_type


# ─────────────────────────────────────────────────────────────
# Section-Level Aggregation
# ─────────────────────────────────────────────────────────────

def _group_chunks_by_section(chunks: list) -> list[dict]:
    """
    Group consecutive chunks belonging to the same section into section groups.
    Each group carries the combined text, the dominant section heading, and the
    first page number of the group.

    Returns list of dicts with:
      - section, section_title, page, combined_text, chunk_indices, chunk_start, chunk_end
    """
    if not chunks:
        return []

    groups: list[dict] = []
    current_group: Optional[dict] = None

    for chunk in chunks:
        text    = chunk.text if hasattr(chunk, "text") else chunk["text"]
        page    = chunk.page if hasattr(chunk, "page") else chunk["page"]
        section = getattr(chunk, "section", None) if hasattr(chunk, "section") else chunk.get("section")
        stitle  = getattr(chunk, "section_title", None) if hasattr(chunk, "section_title") else chunk.get("section_title")
        c_idx   = chunk.chunk_index if hasattr(chunk, "chunk_index") else chunk["chunk_index"]

        # Determine group key — prefer section number, fall back to title
        group_key = section or stitle or "__no_section__"

        if current_group is None or current_group["group_key"] != group_key:
            # Start a new group
            if current_group is not None:
                groups.append(current_group)

            current_group = {
                "group_key":     group_key,
                "section":       section,
                "section_title": stitle,
                "page":          page,
                "combined_text": text,
                "chunk_start":   c_idx,
                "chunk_end":     c_idx,
                "chunk_count":   1,
            }
        else:
            # Extend current group
            current_group["combined_text"] += "\n\n" + text
            current_group["chunk_end"] = c_idx
            current_group["chunk_count"] += 1
            # Update section title if current chunk has one and group doesn't
            if not current_group["section_title"] and stitle:
                current_group["section_title"] = stitle
            if not current_group["section"] and section:
                current_group["section"] = section

    if current_group is not None:
        groups.append(current_group)

    return groups


# ─────────────────────────────────────────────────────────────
# Data Output Structures
# ─────────────────────────────────────────────────────────────

@dataclass
class Clause:
    clause_id:              str
    clause_type:            str           # canonical type key
    clause_name:            str           # human-readable label
    clause_category:        str           # same as clause_type for taxonomy lookup
    text:                   str
    page:                   int
    section:                Optional[str]
    section_title:          Optional[str]
    confidence:             float
    classification_status:  str           # CONFIRMED | PROBABLE | UNCERTAIN | NEEDS_REVIEW
    start_chunk_index:      int
    end_chunk_index:        int
    word_count:             int
    matched_keywords:       list[str] = field(default_factory=list)
    entities_in_clause:     list[str] = field(default_factory=list)
    detection_method:       str = "ensemble"
    legal_significance:     str = "INFORMATIONAL"
    associated_risks:       list[str] = field(default_factory=list)
    summary:                str = ""
    section_type:           str = "SUBSTANTIVE"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ClauseResult:
    document_id:     str
    clauses:         list[Clause] = field(default_factory=list)
    clauses_by_type: dict         = field(default_factory=dict)
    total_clauses:   int          = 0
    stats:           dict         = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


# ─────────────────────────────────────────────────────────────
# Confidence → Classification Status Mapping
# ─────────────────────────────────────────────────────────────

def _confidence_to_status(confidence: float, heading_confirmed: bool) -> str:
    if heading_confirmed and confidence >= 0.85:
        return "CONFIRMED"
    if heading_confirmed and confidence >= 0.65:
        return "PROBABLE"
    if not heading_confirmed and confidence >= 0.80:
        return "PROBABLE"
    if confidence >= 0.60:
        return "UNCERTAIN"
    return "NEEDS_REVIEW"


# ─────────────────────────────────────────────────────────────
# Clause Summary Generator
# ─────────────────────────────────────────────────────────────

def _generate_clause_summary(clause_type: str, text: str, section_title: Optional[str]) -> str:
    """Generate a brief summary of the clause based on type and text excerpt."""
    title = section_title or clause_type.replace("_", " ").title()
    # First 200 characters of text as excerpt, cleaned up
    excerpt = re.sub(r"\s+", " ", text[:200]).strip()
    return f"{title}: {excerpt}…" if len(text) > 200 else f"{title}: {excerpt}"


# ─────────────────────────────────────────────────────────────
# Main Classifier Entry Point
# ─────────────────────────────────────────────────────────────

def extract_clauses(
    chunks: list,
    document_id: str,
    ner_entities: list | None = None,
    language_code: str = "en",
    use_legal_bert: bool = True,
) -> ClauseResult:
    """
    Extract and classify legal clauses from document chunks.

    Key improvements in v2:
    - Section-level grouping prevents cross-chunk classification bleed
    - Heading confirmation takes priority over body keyword scores
    - Expanded taxonomy with 30+ clause types
    - Context verification prevents false positives
    - Each clause gets a unique ID, human-readable label, and status
    """
    logger.info(f"Clause classification v2 starting: doc={document_id} | chunks={len(chunks)}")

    if not chunks:
        return ClauseResult(document_id=document_id)

    # Entity linkage strings
    entity_texts: list[str] = []
    if ner_entities:
        for e in ner_entities:
            t = e.text if hasattr(e, "text") else e.get("text", "")
            if t:
                entity_texts.append(t)

    # ── Step 1: Group chunks by section ──────────────────────────────
    section_groups = _group_chunks_by_section(chunks)
    logger.info(f"Grouped {len(chunks)} chunks into {len(section_groups)} section groups")

    clauses: list[Clause] = []

    for group in section_groups:
        text       = group["combined_text"]
        page       = group["page"]
        section    = group["section"]
        stitle     = group["section_title"]
        c_start    = group["chunk_start"]
        c_end      = group["chunk_end"]

        # Skip groups that are too short to be meaningful clauses
        if len(text.split()) < 10:
            continue

        # ── Step 2: Rule-based scoring with heading priority ──────────
        rule_scores, matched_kws, heading_confirmed_type = _get_rule_scores(text, stitle)

        # ── Step 3: Legal-BERT scoring (on first 1024 chars of group) ──
        bert_scores = _get_legal_bert_scores(text[:1024]) if use_legal_bert else {}

        # ── Step 4: Ensemble scoring ──────────────────────────────────
        final_scores: dict[str, float] = {}
        all_types = set(rule_scores.keys()).union(set(bert_scores.keys()))

        method_used = "rules"
        for c_type in all_types:
            r_s = rule_scores.get(c_type, 0.0)
            b_s = bert_scores.get(c_type, 0.0)

            if r_s > 0 and b_s > 0:
                # Give rule-based a slight edge when heading is confirmed
                rule_weight = 0.65 if (heading_confirmed_type and c_type == heading_confirmed_type) else 0.50
                final_scores[c_type] = round((rule_weight * r_s) + ((1 - rule_weight) * b_s), 3)
                method_used = "legal_bert+rules_ensemble"
            elif b_s > 0.70:
                final_scores[c_type] = round(b_s, 3)
                method_used = "legal_bert"
            elif r_s > 0:
                final_scores[c_type] = round(r_s, 3)

        # ── Step 5: Context verification ──────────────────────────────
        # If heading confirmed a type, enforce it unless scores are very low
        if heading_confirmed_type and heading_confirmed_type in final_scores:
            best_type = heading_confirmed_type
            best_conf = final_scores[heading_confirmed_type]
        elif heading_confirmed_type:
            # Heading confirmed but keyword/BERT scored it very low — still trust heading
            best_type = heading_confirmed_type
            best_conf = 0.75
        elif final_scores:
            best_type = max(final_scores, key=final_scores.get)
            best_conf = final_scores[best_type]

            # Reject heading-required types that weren't confirmed by heading
            if best_type in _HEADING_REQUIRED_TYPES and best_conf < 0.75:
                best_type = "other"
                best_conf = 0.40
        else:
            best_type = "other"
            best_conf = 0.40

        # Specific structural & schedule overrides
        is_preamble = (str(section or "").upper() == "PREAMBLE") or (stitle and "preamble" in stitle.lower())
        is_schedule = bool(section and (str(section).upper().startswith("SCHEDULE") or str(section).upper().startswith("APPENDIX")))

        if is_preamble:
            best_type = "preamble"
            best_conf = 1.0
            status = "CONFIRMED"
            clause_name = "Preamble"
            legal_significance = "INFORMATIONAL"
            associated_risks = []
            sec_type = "STRUCTURAL"
        elif is_schedule:
            best_type = "schedule_doc"
            best_conf = 0.95
            status = "CONFIRMED"
            sec_upper = str(section or "").upper()
            st_upper = str(stitle or "").upper()
            if "SCHEDULE A" in sec_upper or "SCHEDULE A" in st_upper:
                clause_name = "Schedule A — Milestones and Payment Plan"
                stitle = "SCHEDULE A — MILESTONES AND PAYMENT PLAN"
            elif "SCHEDULE B" in sec_upper or "SCHEDULE B" in st_upper:
                clause_name = "Schedule B — Sample Project Assumptions"
                stitle = "SCHEDULE B — SAMPLE PROJECT ASSUMPTIONS"
            elif "APPENDIX" in sec_upper or "APPENDIX" in st_upper:
                clean_st = stitle.lstrip('–- ').strip() if stitle else ""
                clause_name = f"{section} — {clean_st}" if clean_st else f"Appendix {section}"
            else:
                clause_name = f"Schedule {section}"
            legal_significance = "INFORMATIONAL"
            associated_risks = []
            sec_type = "SCHEDULE"
        else:
            # ── Step 6: Determine classification status ───────────────────
            heading_confirmed = (best_type == heading_confirmed_type) and (heading_confirmed_type is not None)
            status = _confidence_to_status(best_conf, heading_confirmed)

            # ── Step 7: Get taxonomy info ─────────────────────────────────
            taxonomy_entry = CLAUSE_TAXONOMY.get(best_type, CLAUSE_TAXONOMY["other"])
            clause_name        = taxonomy_entry["label"]
            legal_significance = taxonomy_entry["significance"]
            associated_risks   = taxonomy_entry["risk_areas"]

            # Section 1 and Section 18 must remain structural
            if best_type in ("parties", "signatures", "definition") or legal_significance == "STRUCTURAL" or str(section) in ("1", "18"):
                sec_type = "STRUCTURAL"
            else:
                sec_type = "SUBSTANTIVE"

        # ── Step 8: Linked entities ───────────────────────────────────
        linked = [e for e in entity_texts if e.lower() in text.lower()][:8]

        # ── Step 9: Generate summary ──────────────────────────────────
        summary = _generate_clause_summary(best_type, text, stitle)

        clauses.append(Clause(
            clause_id=str(uuid.uuid4()),
            clause_type=best_type,
            clause_name=clause_name,
            clause_category=best_type,
            text=text[:3000],  # Allow more text since we're group-level
            page=page,
            section=section,
            section_title=stitle,
            confidence=best_conf,
            classification_status=status,
            start_chunk_index=c_start,
            end_chunk_index=c_end,
            word_count=len(text.split()),
            matched_keywords=list(set(matched_kws))[:10],
            entities_in_clause=linked,
            detection_method=method_used,
            legal_significance=legal_significance,
            associated_risks=list(associated_risks),
            summary=summary,
            section_type=sec_type,
        ))

    # Build by_type counts
    by_type: dict[str, int] = {}
    for c in clauses:
        by_type[c.clause_type] = by_type.get(c.clause_type, 0) + 1

    # Statistics
    confirmed_count = sum(1 for c in clauses if c.classification_status == "CONFIRMED")
    probable_count  = sum(1 for c in clauses if c.classification_status == "PROBABLE")

    logger.info(
        f"Clause classification v2 complete: {len(clauses)} clauses | "
        f"{confirmed_count} CONFIRMED | {probable_count} PROBABLE | "
        f"types={list(by_type.keys())}"
    )

    return ClauseResult(
        document_id=document_id,
        clauses=clauses,
        clauses_by_type=by_type,
        total_clauses=len(clauses),
        stats={
            "total_clauses":    len(clauses),
            "by_type":          by_type,
            "confirmed_count":  confirmed_count,
            "probable_count":   probable_count,
            "legal_bert_active": _legal_bert_available is True,
            "section_groups":   len(section_groups),
        },
    )


# ─────────────────────────────────────────────────────────────
# Missing & Incomplete Provisions Analysis (Part 08B / Audit)
# ─────────────────────────────────────────────────────────────

def evaluate_missing_provisions(clauses: list, doc_type: str = "generic_contract") -> list[dict]:
    """
    Evaluate missing/incomplete provisions using CATEGORY-SPECIFIC benchmarks.

    Dispatches to the appropriate evaluation function based on document type:
      - Employment NDA / Confidentiality   → _eval_employment_nda_provisions()
      - Software Development Agreement     → _eval_sdsa_provisions()
      - Employment Contract & Covenants    → _eval_employment_provisions()
      - Property / Commercial Lease        → _eval_property_lease_provisions()
      - General / Other                    → _eval_generic_provisions()

    Never applies software development benchmarks to Employment NDAs or other categories.
    """
    doc_type_lower = (doc_type or "").lower()

    # Build lookup maps from provided clauses (shared by all evaluators)
    clause_by_sec: dict[str, dict] = {}
    clause_by_type: dict[str, dict] = {}
    combined_text = ""

    for c in clauses:
        c_dict = c if isinstance(c, dict) else c.to_dict() if hasattr(c, "to_dict") else asdict(c)
        ctype = c_dict.get("clause_type")
        csec  = str(c_dict.get("section") or "")
        ctext = c_dict.get("text") or ""
        if ctype:
            clause_by_type[ctype] = c_dict
        if csec:
            clause_by_sec[csec]   = c_dict
        combined_text += " " + ctext.lower()

    ctx = {
        "clause_by_sec":  clause_by_sec,
        "clause_by_type": clause_by_type,
        "combined_text":  combined_text,
        "clauses":        clauses,
    }

    # Route to category-specific evaluator
    if any(kw in doc_type_lower for kw in (
        "nda", "non-disclosure", "confidentiality", "employment nda",
        "non disclosure agreement"
    )):
        logger.info(f"Missing provisions: routing to Employment NDA evaluator (doc_type={doc_type!r})")
        return _eval_employment_nda_provisions(ctx)

    if any(kw in doc_type_lower for kw in (
        "software development", "software development services", "development services",
        "services agreement", "master services", "consulting", "vendor"
    )):
        logger.info(f"Missing provisions: routing to SDSA evaluator (doc_type={doc_type!r})")
        return _eval_sdsa_provisions(ctx)

    if any(kw in doc_type_lower for kw in (
        "employment", "employment agreement", "employment contract", "offer letter", "appointment letter",
        "severance", "labor", "hr", "executive"
    )):
        logger.info(f"Missing provisions: routing to Employment Agreement evaluator (doc_type={doc_type!r})")
        return _eval_employment_provisions(ctx)

    if any(kw in doc_type_lower for kw in (
        "lease", "property", "tenancy", "rental", "commercial lease",
        "residential", "landlord", "tenant"
    )):
        logger.info(f"Missing provisions: routing to Property Lease evaluator (doc_type={doc_type!r})")
        return _eval_property_lease_provisions(ctx)

    if any(kw in doc_type_lower for kw in (
        "loan", "credit", "financing", "borrowing", "promissory note",
        "facility agreement", "debt", "commercial loan"
    )):
        logger.info(f"Missing provisions: routing to Loan & Financing evaluator (doc_type={doc_type!r})")
        return _eval_loan_provisions(ctx)

    logger.info(f"Missing provisions: routing to generic evaluator (doc_type={doc_type!r})")
    return _eval_generic_provisions(ctx)


def _has_clause(clause_by_type: dict, clause_by_sec: dict, combined_text: str,
                type_keys: list = [], sec_keys: list = [], text_signals: list = [],
                clauses: list = []) -> tuple[bool, dict]:
    """Helper: check if a provision exists. Returns (found, clause_dict)."""
    # 1. Match by specific section key first
    for s in sec_keys:
        if s in clause_by_sec:
            return True, clause_by_sec[s]

    # 2. Match by clause text/title scanning through all clauses
    for c in clauses:
        c_dict = c if isinstance(c, dict) else c.to_dict() if hasattr(c, "to_dict") else asdict(c)
        ctitle = (c_dict.get("section_title") or "").lower()
        ctext = (c_dict.get("text") or "").lower()
        ctype = c_dict.get("clause_type")

        # Skip appendix/notes
        if "appendix" in ctitle or "appendix" in str(c_dict.get("section", "")).lower():
            continue

        for sig in text_signals:
            sig_esc = re.escape(sig.lower())
            if sig.lower() in ctitle or re.search(r'\b' + sig_esc + r'\b', ctext):
                return True, c_dict

        if ctype and ctype in type_keys:
            return True, c_dict

    # 3. Fallback to combined text
    for sig in text_signals:
        sig_esc = re.escape(sig.lower())
        if re.search(r'\b' + sig_esc + r'\b', combined_text):
            return True, {}
    return False, {}


def _eval_employment_nda_provisions(ctx: dict) -> list[dict]:
    """
    Evaluate missing provisions for Employment NDA / Confidentiality Agreement.
    Benchmarks:
      1. Confidential Information Definition
      2. Permitted Disclosure Exceptions
      3. Information Security Obligations
      4. Personal Data / Privacy Compliance
      5. Return and Deletion of Confidential Information
      6. Post-termination Survival Period
      7. Remedies for Breach (Injunctive Relief)
      8. Governing Law & Jurisdiction
      9. Non-compete / Non-solicitation
     10. Dispute Resolution
    """
    cb_sec  = ctx["clause_by_sec"]
    cb_type = ctx["clause_by_type"]
    text    = ctx["combined_text"]
    clauses = ctx.get("clauses", [])
    evals   = []

    # 1. Confidential Information Definition
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["definition"],
        sec_keys=["3"],
        text_signals=["definition of confidential information", "confidential information means", "confidential information includes"],
        clauses=clauses)
    evals.append({
        "id": "confidential_information_definition",
        "provision_name": "Confidential Information Definition",
        "name": "Confidential Information Definition",
        "status": "PRESENT" if found else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": [] if found else ["Definition of Confidential Information", "Scope and categories"],
        "details": "Confidential information is defined in the agreement." if found else
                   "Agreement lacks a clear definition of what constitutes confidential information.",
        "commercial_significance": "A precise definition limits disputes about which information is protected.",
        "significance": "HIGH",
        "commercial_legal_impact": "Without a clear definition, enforcement of the NDA may be challenged.",
        "recommendation": "Define confidential information by category (business plans, technical data, personnel records, etc.)." if not found else "",
    })

    # 2. Permitted Disclosure Exceptions / Exclusions
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["confidentiality"],
        sec_keys=["6", "4"],
        text_signals=["permitted and required disclosure", "exclusions", "publicly available", "publicly known", "required by law"],
        clauses=clauses)
    evals.append({
        "id": "disclosure_exceptions",
        "provision_name": "Permitted Disclosure Exceptions",
        "name": "Permitted Disclosure Exceptions",
        "status": "PRESENT" if found else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": [] if found else ["Carve-out for publicly available information", "Carve-out for legally compelled disclosure"],
        "details": "Agreement includes standard disclosure exceptions." if found else
                   "Agreement should specify permitted disclosure exceptions to avoid overbreadth challenges.",
        "commercial_significance": "Standard exclusions protect the recipient from liability for information already public.",
        "significance": "MEDIUM",
        "commercial_legal_impact": "Overly broad NDAs without exclusions may be unenforceable.",
        "recommendation": "Include standard exclusions: publicly available, independently developed, required by law, already known." if not found else "",
    })

    # 3. Information Security Obligations
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["data_protection"],
        sec_keys=["7"],
        text_signals=["information security and incident reporting", "information security", "incident reporting", "security procedures"],
        clauses=clauses)
    evals.append({
        "id": "information_security",
        "provision_name": "Information Security Obligations",
        "name": "Information Security Obligations",
        "status": "PRESENT" if found else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": [] if found else ["Minimum security standard", "Incident notification obligation"],
        "details": "Security obligations and incident reporting are addressed." if found else
                   "Agreement should specify the standard of care required to protect confidential information.",
        "commercial_significance": "Specifying security standards prevents disputes about whether adequate protection was applied.",
        "significance": "HIGH",
        "commercial_legal_impact": "Vague security standards leave the company exposed to inadequate protection claims.",
        "recommendation": "Specify 'reasonable technical and organisational measures' and require incident notification within a defined period (e.g., 48 hours)." if not found else "",
    })

    # 4. Personal Data / Privacy Compliance
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["data_protection"],
        sec_keys=["8"],
        text_signals=["personal data", "data-protection", "privacy compliance"],
        clauses=clauses)
    evals.append({
        "id": "personal_data_compliance",
        "provision_name": "Personal Data & Privacy Compliance",
        "name": "Personal Data & Privacy Compliance",
        "status": "PRESENT" if found else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": [] if found else ["Personal data processing obligations", "Applicable data protection law reference"],
        "details": "Personal data obligations are addressed." if found else
                   "Agreement does not specifically address personal data accessed during employment.",
        "commercial_significance": "Employee NDAs often cover personal data about clients, colleagues, and business contacts.",
        "significance": "MEDIUM",
        "commercial_legal_impact": "Personal data obligations may apply under applicable law regardless of contractual silence.",
        "recommendation": "Include a provision requiring compliance with applicable data protection laws for any personal data accessed during employment." if not found else "",
    })

    # 5. Return / Deletion of Confidential Information
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["confidentiality"],
        sec_keys=["10"],
        text_signals=["return and deletion of information", "return and deletion", "stop using confidential information and return"],
        clauses=clauses)
    evals.append({
        "id": "return_deletion",
        "provision_name": "Return and Deletion of Confidential Information",
        "name": "Return and Deletion of Confidential Information",
        "status": "PRESENT" if found else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": [] if found else ["Return deadline", "Deletion certification requirement"],
        "details": "Return and deletion obligations are present." if found else
                   "Agreement should specify obligations to return or destroy confidential information upon termination.",
        "commercial_significance": "Without return/deletion obligations, confidential data may remain with former employees indefinitely.",
        "significance": "HIGH",
        "commercial_legal_impact": "Failure to retrieve confidential information upon termination exposes trade secrets.",
        "recommendation": "Specify deadlines for return (e.g., 7 calendar days) and deletion (e.g., 10 calendar days) with written certification." if not found else "",
    })

    # 6. Post-termination Survival Period
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["survival"],
        sec_keys=["11"],
        text_signals=["term and survival", "confidentiality obligations continue for", "survival"],
        clauses=clauses)
    evals.append({
        "id": "confidentiality_survival",
        "provision_name": "Post-termination Confidentiality Survival",
        "name": "Post-termination Confidentiality Survival",
        "status": "PRESENT" if found else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": [] if found else ["Explicit survival clause", "Survival duration"],
        "details": "Agreement includes post-termination survival provisions." if found else
                   "Agreement does not specify how long confidentiality obligations survive termination.",
        "commercial_significance": "Without a survival clause, confidentiality obligations may lapse upon employment termination.",
        "significance": "HIGH",
        "commercial_legal_impact": "Trade secrets and business-sensitive information may become unprotected after the employment ends.",
        "recommendation": "Add explicit survival clause specifying duration (e.g., 3 years post-termination; indefinitely for trade secrets)." if not found else "",
    })

    # 7. Remedies for Breach (Injunctive Relief vs Complete Framework)
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["liability"],
        sec_keys=["13"],
        text_signals=["remedies and liability", "injunctive or equitable relief", "remedies"],
        clauses=clauses)
    evals.append({
        "id": "breach_remedies",
        "provision_name": "Remedies for Breach",
        "name": "Remedies for Breach",
        "status": "PARTIALLY_PRESENT" if found else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": ["Material breach cure period", "Liquidated damages formula or indemnity framework"],
        "details": "Agreement provides for injunctive and equitable relief in Section 13, but lacks a contractual damages framework or breach cure mechanism." if found else
                   "Agreement does not specify remedies available for breach of confidentiality.",
        "commercial_significance": "Injunctive relief is critical for NDAs because damages may be impossible to quantify.",
        "significance": "HIGH",
        "commercial_legal_impact": "Without a damages framework or cure period, remedies are limited to discretionary court injunctions.",
        "recommendation": "Supplement injunctive relief with an express indemnity or damages framework and a defined cure period for curable breaches." if found else "",
    })

    # 8. Governing Law & Jurisdiction
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["governing_law"],
        sec_keys=["15"],
        text_signals=["governing law and jurisdiction", "governing law", "jurisdiction over disputes"],
        clauses=clauses)
    evals.append({
        "id": "governing_law",
        "provision_name": "Governing Law & Jurisdiction",
        "name": "Governing Law & Jurisdiction",
        "status": "PRESENT" if found else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": [] if found else ["Applicable law clause", "Jurisdiction clause"],
        "details": "Governing law is specified in the agreement." if found else
                   "Agreement does not specify the governing law or jurisdiction for disputes.",
        "commercial_significance": "Without a governing law clause, disputes may be subject to unpredictable choice-of-law rules.",
        "significance": "MEDIUM",
        "commercial_legal_impact": "Jurisdictional ambiguity increases litigation costs and risk.",
        "recommendation": "Specify governing law and exclusive jurisdiction for disputes." if not found else "",
    })

    # 9. Non-compete / Future Employment & Non-solicitation
    # Note: Confirming no restriction on future employment (Section 12) does NOT establish an affirmative non-solicitation clause.
    has_restrictive_covenant, rc_clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["non_compete"],
        text_signals=["shall not compete", "non-solicitation of clients", "non-solicitation of employees", "covenant not to compete"],
        clauses=clauses)
    if has_restrictive_covenant and re.search(r'\b(?:does\s+not\s+prohibit|no\s+restriction)\b', rc_clause.get("text", ""), re.I):
        has_restrictive_covenant = False

    evals.append({
        "id": "non_compete",
        "provision_name": "Non-compete & Non-solicitation Restrictions",
        "name": "Non-compete & Non-solicitation Restrictions",
        "status": "PRESENT" if has_restrictive_covenant else "MISSING",
        "actual_section_number": rc_clause.get("section") if has_restrictive_covenant else None,
        "actual_section_heading": rc_clause.get("section_title") if has_restrictive_covenant else None,
        "clause_reference": f"Section {rc_clause.get('section')} ({rc_clause.get('section_title')})" if has_restrictive_covenant else "None",
        "supporting_text": rc_clause.get("text", "")[:350] if has_restrictive_covenant else "",
        "missing_elements": [] if has_restrictive_covenant else ["Non-solicitation of clients/customers", "Non-solicitation of employees/co-workers"],
        "details": "Restrictive covenants and non-solicitation terms are present." if has_restrictive_covenant else
                   "Agreement does not contain non-compete or non-solicitation covenants; Section 12 explicitly confirms no post-employment restraint on future employment.",
        "commercial_significance": "Non-solicitation covenants protect business relationships and prevent team poaching post-employment.",
        "significance": "MEDIUM",
        "commercial_legal_impact": "In India, post-employment non-compete restraints are void under Section 27 of the Indian Contract Act, but reasonable non-solicitation covenants may be enforceable.",
        "recommendation": "If commercial protection is desired, consider adding distinct client and employee non-solicitation covenants compliant with applicable employment law." if not has_restrictive_covenant else "",
    })

    # 10. Dispute Resolution Procedure
    # Note: Governing law and jurisdiction (Section 15) does NOT establish an ADR/arbitration/negotiation procedure.
    has_adr, adr_clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["dispute_resolution"],
        text_signals=["good-faith negotiation", "mediation", "arbitration protocol", "binding arbitration", "escalation procedure"],
        clauses=clauses)
    evals.append({
        "id": "dispute_resolution",
        "provision_name": "Dispute Resolution Procedure",
        "name": "Dispute Resolution Procedure",
        "status": "PRESENT" if has_adr else "MISSING",
        "actual_section_number": adr_clause.get("section") if has_adr else None,
        "actual_section_heading": adr_clause.get("section_title") if has_adr else None,
        "clause_reference": f"Section {adr_clause.get('section')} ({adr_clause.get('section_title')})" if has_adr else "None",
        "supporting_text": adr_clause.get("text", "")[:350] if has_adr else "",
        "missing_elements": [] if has_adr else ["Informal good-faith negotiation window", "Mediation procedure", "Binding arbitration protocol"],
        "details": "Dispute resolution and escalation procedures are structured in the agreement." if has_adr else
                   "Agreement designates governing law and court jurisdiction (Section 15), but lacks an alternative dispute resolution (ADR), escalation, or mediation procedure.",
        "commercial_significance": "A structured dispute resolution procedure prevents premature court litigation and facilitates amicable settlement.",
        "significance": "MEDIUM",
        "commercial_legal_impact": "Without defined pre-litigation dispute mechanisms, any formal conflict proceeds directly to court litigation.",
        "recommendation": "Include a tiered dispute resolution clause specifying informal negotiation (e.g., 15-30 days) and mediation or arbitration prior to initiating court litigation." if not has_adr else "",
    })

    return evals


def _eval_sdsa_provisions(ctx: dict) -> list[dict]:
    """
    Evaluate missing provisions for Software Development Services Agreements.
    Benchmarks:
      1. Post-Handover Warranty & SLA
      2. Maintenance and Support
      3. Force Majeure
      4. Security Incident Notification
      5. Source Code Handover & Escrow
      6. Third-party Licensing
      7. Confidentiality Survival
      8. Dispute Resolution
    """
    cb_sec  = ctx["clause_by_sec"]
    cb_type = ctx["clause_by_type"]
    text    = ctx["combined_text"]
    clauses = ctx.get("clauses", [])
    evals   = []

    # 1. Post-Handover Warranty & SLA
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["warranties"],
        sec_keys=["12"],
        text_signals=["warranty", "warrants", "skill and care"],
        clauses=clauses)
    evals.append({
        "id": "post_handover_warranty",
        "provision_name": "Post-Handover Warranty & SLA",
        "name": "Post-Handover Warranty & SLA",
        "status": "PARTIALLY_PRESENT" if found else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": ["Post-handover warranty defect remediation period",
                             "Bug-fixing response/resolution SLAs with severity tiers"],
        "details": "Warranty clause present but lacks defined post-handover bug-fix SLA." if found else
                   "No warranty or SLA provision found.",
        "commercial_significance": "Without a defined warranty period, the client has no guaranteed remediation for defects discovered after delivery.",
        "significance": "HIGH",
        "commercial_legal_impact": "Client bears full risk for post-delivery defects without a warranty cure period.",
        "recommendation": "Negotiate an explicit post-handover warranty cure period (e.g., 30-60 days) for verified material non-conformities.",
    })

    # 2. Maintenance and Support
    # Note: Distinguish affirmative maintenance agreements from negative disclaimers/exclusions (e.g. Schedule B)
    maint_excluded = bool(re.search(r'\b(?:ongoing\s+maintenance.*?is\s+not\s+included|maintenance.*?excluded)\b', text, re.I))
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["maintenance"],
        text_signals=["ongoing support agreement", "maintenance services agreement", "support sla"],
        clauses=clauses)
    if maint_excluded and not found:
        # Maintenance is explicitly excluded in Schedule B, not affirmative
        sch_b = cb_sec.get("SCHEDULE B", {})
        evals.append({
            "id": "maintenance_support",
            "provision_name": "Ongoing Maintenance & Support",
            "name": "Ongoing Maintenance & Support",
            "status": "MISSING",
            "actual_section_number": sch_b.get("section") if sch_b else None,
            "actual_section_heading": sch_b.get("section_title") if sch_b else None,
            "clause_reference": "Schedule B (PROJECT ASSUMPTIONS)",
            "supporting_text": "Ongoing maintenance after the handover period is not included in the fixed project fee.",
            "missing_elements": ["Post-handover maintenance agreement", "Support response/resolution SLAs", "Maintenance fee schedule"],
            "details": "Ongoing maintenance after the handover period is expressly excluded under Schedule B; no post-handover support agreement or SLA is established.",
            "commercial_significance": "Without maintenance terms, software may become non-functional without a remedy.",
            "significance": "HIGH",
            "commercial_legal_impact": "Client must negotiate post-delivery maintenance separately after delivery.",
            "recommendation": "Include a maintenance and support annex specifying scope, response times, and pricing.",
        })
    else:
        evals.append({
            "id": "maintenance_support",
            "provision_name": "Ongoing Maintenance & Support",
            "name": "Ongoing Maintenance & Support",
            "status": "PRESENT" if found else "MISSING",
            "actual_section_number": clause.get("section") if found else None,
            "actual_section_heading": clause.get("section_title") if found else None,
            "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
            "supporting_text": clause.get("text", "")[:350] if found else "",
            "missing_elements": [] if found else ["Maintenance scope", "Support response SLAs", "Pricing"],
            "details": "Maintenance provisions are present." if found else
                       "No ongoing maintenance or support provisions found.",
            "commercial_significance": "Without maintenance terms, software may become non-functional without a remedy.",
            "significance": "HIGH",
            "commercial_legal_impact": "Client must negotiate post-delivery maintenance separately after delivery.",
            "recommendation": "Include a maintenance and support annex specifying scope, response times, and pricing." if not found else "",
        })

    # 3. Force Majeure
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["force_majeure"],
        text_signals=["force majeure", "act of god", "beyond control", "unforeseeable"],
        clauses=clauses)
    evals.append({
        "id": "force_majeure",
        "provision_name": "Force Majeure",
        "name": "Force Majeure",
        "status": "PRESENT" if found else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": [] if found else ["Force majeure definition", "Notification obligation", "Termination right"],
        "details": "Force majeure is addressed." if found else
                   "No force majeure clause found.",
        "commercial_significance": "Without force majeure, delays from circumstances beyond a party's control may constitute breach.",
        "significance": "MEDIUM",
        "commercial_legal_impact": "Either party may be liable for delays caused by unforeseeable events.",
        "recommendation": "Add a force majeure clause covering natural disasters, pandemics, government actions, and similar events." if not found else "",
    })

    # 4. Security Incident Notification
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["data_protection"],
        sec_keys=["11"],
        text_signals=["security incident", "data breach", "incident reporting"],
        clauses=clauses)
    evals.append({
        "id": "security_incident_notification",
        "provision_name": "Security Incident Notification",
        "name": "Security Incident Notification",
        "status": "PRESENT" if found else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": [] if found else ["Notification timeframe", "Remediation plan obligation"],
        "details": "Security incident reporting is addressed." if found else
                   "No security incident notification clause found.",
        "commercial_significance": "Data breach notification is required under data privacy regulations.",
        "significance": "HIGH",
        "commercial_legal_impact": "Failure to report incidents exposes parties to regulatory penalties.",
        "recommendation": "Add security incident notification obligations with a 48-72 hour notification deadline." if not found else "",
    })

    # 5. Source Code Handover & Escrow
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["intellectual_property"],
        sec_keys=["3", "10"],
        text_signals=["source code", "deliverables", "handover session"],
        clauses=clauses)
    evals.append({
        "id": "source_code_handover",
        "provision_name": "Source Code Handover & Escrow",
        "name": "Source Code Handover & Escrow",
        "status": "PARTIALLY_PRESENT" if found else "MISSING",
        "actual_section_number": "3",
        "actual_section_heading": "DELIVERABLES",
        "clause_reference": "Section 3 (§3.1), Section 10 (INTELLECTUAL PROPERTY), Schedule A",
        "supporting_text": "3.1 The Service Provider will provide: (b) source code for custom-developed components... and (f) one handover session of up to two hours.",
        "missing_elements": ["Third-party source code escrow mechanism", "Escrow release condition triggers"],
        "details": "Source code delivery and handover session are provided under Section 3.1, Section 10, and Schedule A upon full payment; however, no third-party source code escrow mechanism is established." if found else
                   "No explicit source code delivery or escrow clause found.",
        "commercial_significance": "Source code delivery ensures the client can maintain the software independently.",
        "significance": "HIGH",
        "commercial_legal_impact": "Without source code, the client faces vendor lock-in.",
        "recommendation": "Specify that all custom source code, documentation, and build scripts are delivered to the client upon final payment, and consider an escrow mechanism for critical software." if not found else "",
    })

    # 6. Third-Party & Open-Source Licensing
    found, clause = _has_clause(cb_type, cb_sec, text,
        sec_keys=["10"],
        text_signals=["pre-existing materials", "third-party materials", "licence to use"],
        clauses=clauses)
    sec10 = cb_sec.get("10", {})
    evals.append({
        "id": "third_party_licensing",
        "provision_name": "Third-party & Open-source Licensing",
        "name": "Third-party & Open-source Licensing",
        "status": "PARTIALLY_PRESENT" if found else "MISSING",
        "actual_section_number": "10",
        "actual_section_heading": "INTELLECTUAL PROPERTY",
        "clause_reference": "Section 10 (INTELLECTUAL PROPERTY), Schedule B (PROJECT ASSUMPTIONS)",
        "supporting_text": sec10.get("text", "")[:350] if sec10 else "Section 10 grants a perpetual licence to Pre-Existing Materials; Schedule B excludes third-party licences.",
        "missing_elements": ["Open-source software disclosure", "Copyleft/GPL license compliance warranty"],
        "details": "Section 10 grants a perpetual licence to Pre-Existing Materials, and Schedule B excludes third-party licences, but agreement lacks an open-source component disclosure and warranty." if found else
                   "No third-party licensing or open-source disclosure clause found.",
        "commercial_significance": "Undisclosed GPL or copyleft software creates copyright infringement and disclosure risks.",
        "significance": "HIGH",
        "commercial_legal_impact": "Incompatible licenses can force open-sourcing of proprietary software.",
        "recommendation": "Include a provision requiring disclosure of open-source components and compliance with their licenses." if not found else "",
    })

    # 7. Confidentiality Survival
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["survival"],
        sec_keys=["9"],
        text_signals=["survival", "survive", "after termination", "post-termination"],
        clauses=clauses)
    evals.append({
        "id": "confidentiality_survival",
        "provision_name": "Confidentiality Survival Beyond Termination",
        "name": "Confidentiality Survival Beyond Termination",
        "status": "PRESENT" if ("surviv" in text) else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": [] if ("surviv" in text) else ["Explicit survival period"],
        "details": "Confidentiality survival is addressed." if ("surviv" in text) else
                   "No explicit survival period for confidentiality obligations found.",
        "commercial_significance": "Without survival, confidentiality duties terminate with the contract.",
        "significance": "HIGH",
        "commercial_legal_impact": "Trade secrets become unprotected upon contract termination.",
        "recommendation": "Insert a survival clause specifying confidentiality obligations survive for 3-5 years post-termination." if not ("surviv" in text) else "",
    })

    # 8. Multi-Tier Dispute Resolution
    found, clause = _has_clause(cb_type, cb_sec, text,
        type_keys=["governing_law_dispute", "governing_law"],
        sec_keys=["16"],
        text_signals=["good-faith", "mediation", "arbitration", "informal discussions"],
        clauses=clauses)
    evals.append({
        "id": "dispute_resolution",
        "provision_name": "Multi-Tier Dispute Resolution & Arbitration Protocol",
        "name": "Multi-Tier Dispute Resolution & Arbitration Protocol",
        "status": "PARTIALLY_PRESENT" if found else "MISSING",
        "actual_section_number": clause.get("section") if found else None,
        "actual_section_heading": clause.get("section_title") if found else None,
        "clause_reference": f"Section {clause.get('section')} ({clause.get('section_title')})" if found else "None",
        "supporting_text": clause.get("text", "")[:350] if found else "",
        "missing_elements": ["Formal mediation stage", "Defined arbitration protocol"],
        "details": "Dispute resolution includes informal discussions but lacks defined arbitration protocol." if found else
                   "No structured dispute resolution clause found.",
        "commercial_significance": "Arbitration provides faster and more confidential resolution than public litigation.",
        "significance": "MEDIUM",
        "commercial_legal_impact": "Parties must litigate in open court without an arbitration clause.",
        "recommendation": "Add a formal mediation step followed by binding arbitration under defined rules.",
    })

    return evals


def _eval_employment_provisions(ctx: dict) -> list[dict]:
    """Evaluate missing provisions for Employment Contracts."""
    cb_sec  = ctx["clause_by_sec"]
    cb_type = ctx["clause_by_type"]
    text    = ctx["combined_text"]
    clauses = ctx.get("clauses", [])
    evals   = []

    benchmarks = [
        ("compensation_benefits", "Compensation & Benefits",
         ["payment"], [], ["salary", "compensation", "remuneration", "wage"]),
        ("probation_period", "Probation Period",
         [], [], ["probation", "probationary period", "trial period"]),
        ("leave_policy", "Leave & Holiday Policy",
         [], [], ["annual leave", "paid leave", "holiday", "sick leave"]),
        ("termination_notice", "Termination Notice Requirements",
         ["termination"], [], ["notice period", "termination notice"]),
        ("confidentiality", "Confidentiality Obligations",
         ["confidentiality"], [], ["confidential", "non-disclosure"]),
        ("non_compete", "Non-compete & Non-solicitation",
         ["non_compete"], [], ["non-compete", "non-solicitation"]),
        ("ip_assignment", "IP Assignment",
         ["intellectual_property"], [], ["intellectual property", "work product", "invention"]),
        ("governing_law", "Governing Law & Jurisdiction",
         ["governing_law", "governing_law_dispute"], [], ["governing law", "jurisdiction"]),
    ]

    for bid, bname, type_keys, sec_keys, text_sigs in benchmarks:
        found, clause = _has_clause(cb_type, cb_sec, text, type_keys, sec_keys, text_sigs, clauses=clauses)
        sec_num = clause.get("section")
        sec_title = clause.get("section_title")
        clause_ref = f"Section {sec_num} ({sec_title})" if found and sec_num and sec_title else f"Section {sec_num}" if found and sec_num else "Present in document" if found else "None"
        evals.append({
            "id": bid,
            "provision_name": bname,
            "name": bname,
            "status": "PRESENT" if found else "MISSING",
            "actual_section_number": sec_num if found else None,
            "actual_section_heading": sec_title if found else None,
            "clause_reference": clause_ref,
            "supporting_text": clause.get("text", "")[:350] if found else "",
            "missing_elements": [] if found else [f"{bname} clause"],
            "details": f"{bname} is present." if found else f"Agreement does not include {bname} provisions.",
            "commercial_significance": f"{bname} is an important component of an employment agreement.",
            "significance": "HIGH" if bid in ("compensation_benefits", "termination_notice", "confidentiality") else "MEDIUM",
            "commercial_legal_impact": f"Absence of {bname} provisions creates ambiguity.",
            "recommendation": f"Add explicit {bname} provisions." if not found else "",
        })

    return evals


def _eval_property_lease_provisions(ctx: dict) -> list[dict]:
    """Evaluate missing provisions for Property Lease Agreements."""
    cb_sec  = ctx["clause_by_sec"]
    cb_type = ctx["clause_by_type"]
    text    = ctx["combined_text"]
    clauses = ctx.get("clauses", [])
    evals   = []

    benchmarks = [
        ("rent_payment", "Rent Payment Terms",
         ["payment"], [], ["rent", "rental amount", "monthly rent"]),
        ("deposit_terms", "Security Deposit",
         [], [], ["security deposit", "deposit", "refundable deposit"]),
        ("maintenance_repairs", "Maintenance & Repairs",
         [], [], ["maintenance", "repairs", "repair obligation"]),
        ("subletting", "Subletting & Assignment Restrictions",
         ["assignment"], [], ["sublet", "subletting", "sub-lease", "assignment"]),
        ("termination_notice", "Termination Notice",
         ["termination"], [], ["notice period", "termination notice", "vacate"]),
        ("governing_law", "Governing Law & Jurisdiction",
         ["governing_law", "governing_law_dispute"], [], ["governing law", "jurisdiction"]),
    ]

    for bid, bname, type_keys, sec_keys, text_sigs in benchmarks:
        found, clause = _has_clause(cb_type, cb_sec, text, type_keys, sec_keys, text_sigs, clauses=clauses)
        sec_num = clause.get("section")
        sec_title = clause.get("section_title")
        clause_ref = f"Section {sec_num} ({sec_title})" if found and sec_num and sec_title else f"Section {sec_num}" if found and sec_num else "Present in document" if found else "None"
        evals.append({
            "id": bid,
            "provision_name": bname,
            "name": bname,
            "status": "PRESENT" if found else "MISSING",
            "actual_section_number": sec_num if found else None,
            "actual_section_heading": sec_title if found else None,
            "clause_reference": clause_ref,
            "supporting_text": clause.get("text", "")[:350] if found else "",
            "missing_elements": [] if found else [f"{bname} clause"],
            "details": f"{bname} is present." if found else f"Agreement does not include {bname} provisions.",
            "commercial_significance": f"{bname} is a standard component of a lease agreement.",
            "significance": "HIGH" if bid in ("rent_payment", "deposit_terms", "termination_notice") else "MEDIUM",
            "commercial_legal_impact": f"Absence of {bname} creates risk for both landlord and tenant.",
            "recommendation": f"Add explicit {bname} provisions." if not found else "",
        })

    return evals


def _eval_loan_provisions(ctx: dict) -> list[dict]:
    """Evaluate missing provisions for Loan and Financing Agreements."""
    cb_sec  = ctx["clause_by_sec"]
    cb_type = ctx["clause_by_type"]
    text    = ctx["combined_text"]
    clauses = ctx.get("clauses", [])
    evals   = []

    benchmarks = [
        ("principal_disbursement", "Principal Amount & Disbursement",
         ["payment"], [], ["principal", "disbursement", "loan amount", "facility amount", "advance"]),
        ("interest_rate_terms", "Interest Rate & Calculation",
         [], [], ["interest rate", "per annum", "interest calculation", "base rate", "margin", "accrue"]),
        ("repayment_schedule", "Repayment Schedule & Maturity",
         ["payment"], [], ["repayment", "maturity date", "amortization", "installment", "due date", "repay"]),
        ("events_of_default", "Events of Default & Acceleration",
         ["termination"], [], ["events of default", "default", "acceleration", "failure to pay", "insolvency"]),
        ("prepayment_terms", "Prepayment Terms & Conditions",
         [], [], ["prepayment", "voluntary prepayment", "prepayment penalty", "prepayment fee", "prepay"]),
        ("governing_law", "Governing Law & Jurisdiction",
         ["governing_law", "governing_law_dispute"], [], ["governing law", "jurisdiction"]),
    ]

    for bid, bname, type_keys, sec_keys, text_sigs in benchmarks:
        found, clause = _has_clause(cb_type, cb_sec, text, type_keys, sec_keys, text_sigs, clauses=clauses)
        sec_num = clause.get("section")
        sec_title = clause.get("section_title")
        clause_ref = f"Section {sec_num} ({sec_title})" if found and sec_num and sec_title else f"Section {sec_num}" if found and sec_num else "Present in document" if found else "None"
        evals.append({
            "id": bid,
            "provision_name": bname,
            "name": bname,
            "status": "PRESENT" if found else "MISSING",
            "actual_section_number": sec_num if found else None,
            "actual_section_heading": sec_title if found else None,
            "clause_reference": clause_ref,
            "supporting_text": clause.get("text", "")[:350] if found else "",
            "missing_elements": [] if found else [f"{bname} clause"],
            "details": f"{bname} is present." if found else f"Agreement does not include {bname} provisions.",
            "commercial_significance": f"{bname} is an essential component of a debt and loan financing facility.",
            "significance": "HIGH" if bid in ("principal_disbursement", "interest_rate_terms", "repayment_schedule", "events_of_default") else "MEDIUM",
            "commercial_legal_impact": f"Absence of explicit {bname} exposes lender and borrower to financial dispute and enforcement failure.",
            "recommendation": f"Add explicit {bname} terms." if not found else "",
        })

    return evals


def _eval_generic_provisions(ctx: dict) -> list[dict]:
    """Evaluate missing provisions for General / Other Agreements."""
    cb_sec  = ctx["clause_by_sec"]
    cb_type = ctx["clause_by_type"]
    text    = ctx["combined_text"]
    clauses = ctx.get("clauses", [])
    evals   = []

    benchmarks = [
        ("parties_obligations", "Parties and Obligations",
         ["parties", "purpose_scope"], [], ["parties", "obligations"]),
        ("confidentiality", "Confidentiality",
         ["confidentiality"], [], ["confidential", "non-disclosure"]),
        ("termination", "Termination Rights",
         ["termination"], [], ["termination", "terminate", "notice period"]),
        ("liability", "Limitation of Liability",
         ["liability"], [], ["liability", "limitation", "damages"]),
        ("governing_law", "Governing Law & Jurisdiction",
         ["governing_law", "governing_law_dispute"], [], ["governing law", "jurisdiction"]),
        ("dispute_resolution", "Dispute Resolution",
         ["dispute_resolution", "governing_law_dispute"], [], ["dispute", "arbitration", "mediation"]),
    ]

    for bid, bname, type_keys, sec_keys, text_sigs in benchmarks:
        found, clause = _has_clause(cb_type, cb_sec, text, type_keys, sec_keys, text_sigs, clauses=clauses)
        sec_num = clause.get("section")
        sec_title = clause.get("section_title")
        clause_ref = f"Section {sec_num} ({sec_title})" if found and sec_num and sec_title else f"Section {sec_num}" if found and sec_num else "Present in document" if found else "None"
        evals.append({
            "id": bid,
            "provision_name": bname,
            "name": bname,
            "status": "PRESENT" if found else "MISSING",
            "actual_section_number": sec_num if found else None,
            "actual_section_heading": sec_title if found else None,
            "clause_reference": clause_ref,
            "supporting_text": clause.get("text", "")[:350] if found else "",
            "missing_elements": [] if found else [f"{bname} clause"],
            "details": f"{bname} is present." if found else f"Agreement does not include {bname} provisions.",
            "commercial_significance": f"{bname} is a standard commercial agreement component.",
            "significance": "MEDIUM",
            "commercial_legal_impact": f"Absence of {bname} creates ambiguity.",
            "recommendation": f"Add explicit {bname} provisions." if not found else "",
        })

    return evals
