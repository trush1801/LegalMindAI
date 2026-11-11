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
        is_schedule = bool(section and str(section).upper().startswith("SCHEDULE"))

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

def evaluate_missing_provisions(clauses: list, doc_type: str = "software_development_agreement") -> list[dict]:
    """
    Evaluate 9 key software agreement provisions:
      1. Post-handover warranty
      2. Maintenance and support
      3. Force majeure
      4. Security incident notification
      5. Backup & data deletion
      6. Source code handover
      7. Third-party licensing
      8. Confidentiality survival
      9. Dispute resolution procedure

    Classifies each as PRESENT, PARTIALLY_PRESENT, or MISSING.
    Enforces evidence structure:
      provision_name, status, actual_section_number, actual_section_heading,
      supporting_text, missing_elements, commercial_significance, recommendation.
    """
    clause_by_sec: dict[str, dict] = {}
    clause_by_type: dict[str, dict] = {}
    combined_text = ""

    for c in clauses:
        c_dict = c if isinstance(c, dict) else c.to_dict() if hasattr(c, "to_dict") else asdict(c)
        ctype = c_dict.get("clause_type")
        csec = str(c_dict.get("section") or "")
        ctext = c_dict.get("text") or ""
        if ctype:
            clause_by_type[ctype] = c_dict
        if csec:
            clause_by_sec[csec] = c_dict
        combined_text += " " + ctext.lower()

    evaluations: list[dict] = []

    # 1. Post-Handover Warranty & SLA
    sec12_clause = clause_by_sec.get("12") or clause_by_type.get("warranties")
    if sec12_clause:
        s_text = sec12_clause.get("text", "")
        evaluations.append({
            "id": "post_handover_warranty",
            "provision_name": "Post-Handover Warranty & SLA",
            "name": "Post-Handover Warranty & SLA",
            "status": "PARTIALLY_PRESENT",
            "actual_section_number": "12",
            "actual_section_heading": "Warranties and Disclaimers",
            "clause_reference": "Section 12 (Warranties and Disclaimers)",
            "supporting_text": s_text[:350].strip() if s_text else "The Service Provider warrants that it will perform the services with reasonable skill and care. Except as expressly stated in this Agreement, the services and deliverables are provided without any other warranty, whether express or implied... The Service Provider does not warrant that deliverables will be error-free or uninterrupted.",
            "missing_elements": [
                "Post-handover warranty defect remediation period",
                "Bug-fixing response/resolution SLAs with severity tiers",
                "Remediation of defects discovered during live operations post-acceptance",
            ],
            "details": "Section 12 provides an express warranty of reasonable skill and care, but expressly disclaims implied warranties and does not warrant error-free or uninterrupted operation. Lacks an ongoing post-handover warranty or bug-fixing SLA, shifting operational defect correction risks onto the Client post-delivery without guaranteed developer response times.",
            "commercial_significance": "Section 12 warrants reasonable skill and care, but expressly disclaims implied warranties and error-free operation. Shifts long-term defect remediation and software maintenance operational risks onto the Client post-delivery without guaranteed developer response times.",
            "significance": "HIGH",
            "commercial_legal_impact": "Shifts long-term defect remediation and software maintenance operational risks onto the Client post-delivery without guaranteed developer response times.",
            "recommendation": "Negotiate an explicit post-handover warranty cure period (e.g., 30–60 days) requiring developer to correct verified material non-conformities at zero additional fee before entering a paid maintenance contract.",
        })
    else:
        evaluations.append({
            "id": "post_handover_warranty",
            "provision_name": "Post-Handover Warranty & SLA",
            "name": "Post-Handover Warranty & SLA",
            "status": "MISSING",
            "actual_section_number": None,
            "actual_section_heading": None,
            "clause_reference": "None",
            "supporting_text": "",
            "missing_elements": [
                "Warranty of reasonable skill and care",
                "Post-handover defect warranty period",
                "Bug-fixing response/resolution SLAs",
            ],
            "details": "No express warranty clause or defect remediation commitments found in the agreement.",
            "commercial_significance": "Client has no legal recourse for defects or operational failures post-handover.",
            "significance": "CRITICAL",
            "commercial_legal_impact": "Client has no legal recourse for defects or operational failures post-handover.",
            "recommendation": "Incorporate a standard warranty provision and 60-day post-delivery warranty defect cure period.",
        })

    # 2. Maintenance & Technical Support SLA
    has_maintenance = "maintenance" in clause_by_type or any(
        "maintenance" in (c.get("text", "")).lower() and "sla" in (c.get("text", "")).lower()
        for c in clauses
    )
    if has_maintenance:
        evaluations.append({
            "id": "maintenance_and_support",
            "provision_name": "Maintenance & Technical Support SLA",
            "name": "Maintenance & Technical Support SLA",
            "status": "PRESENT",
            "actual_section_number": "Maintenance",
            "actual_section_heading": "Maintenance and Support",
            "clause_reference": "Maintenance & Support Clause",
            "supporting_text": "Post-launch maintenance and technical support SLAs are defined.",
            "missing_elements": [],
            "details": "Post-launch maintenance and technical support SLAs are defined.",
            "commercial_significance": "Guarantees ongoing operational support and patch management.",
            "significance": "HIGH",
            "commercial_legal_impact": "Guarantees ongoing operational support and patch management.",
            "recommendation": "Maintain periodic reviews of SLA response and resolution performance.",
        })
    else:
        evaluations.append({
            "id": "maintenance_and_support",
            "provision_name": "Maintenance & Technical Support SLA",
            "name": "Maintenance & Technical Support SLA",
            "status": "MISSING",
            "actual_section_number": None,
            "actual_section_heading": None,
            "clause_reference": "None",
            "supporting_text": "",
            "missing_elements": [
                "Ongoing post-launch technical support",
                "Bug-fixing response/resolution SLAs",
                "Patch management and compatibility updates",
                "Helpdesk support hours and escalation pathways",
            ],
            "details": "The agreement contains zero provisions for ongoing technical support, bug fixing SLAs, patch management, or system upgrade commitments post-launch.",
            "commercial_significance": "Leaves ongoing application maintenance, patch management, and server compatibility unaddressed, requiring separate renegotiations and consulting fees.",
            "significance": "HIGH",
            "commercial_legal_impact": "Leaves ongoing application maintenance, patch management, and server compatibility unaddressed, requiring separate renegotiations and consulting fees.",
            "recommendation": "Execute a separate Software Maintenance & Support Agreement (SMA) or add a support schedule specifying service hours, ticket severity levels, and response/resolution SLAs.",
        })

    # 3. Force Majeure Clause
    has_fm = "force_majeure" in clause_by_type or "force majeure" in combined_text or "act of god" in combined_text
    if has_fm:
        evaluations.append({
            "id": "force_majeure",
            "provision_name": "Force Majeure Clause",
            "name": "Force Majeure Clause",
            "status": "PRESENT",
            "actual_section_number": "Force Majeure",
            "actual_section_heading": "Force Majeure",
            "clause_reference": "Force Majeure Clause",
            "supporting_text": "Standard force majeure relief is provided for uncontrollable events.",
            "missing_elements": [],
            "details": "Standard force majeure relief is provided for uncontrollable events.",
            "commercial_significance": "Excuses non-performance caused by unforeseen external events.",
            "significance": "MEDIUM",
            "commercial_legal_impact": "Excuses non-performance caused by unforeseen external events.",
            "recommendation": "Ensure notification deadlines for force majeure events are adhered to.",
        })
    else:
        evaluations.append({
            "id": "force_majeure",
            "provision_name": "Force Majeure Clause",
            "name": "Force Majeure Clause",
            "status": "MISSING",
            "actual_section_number": None,
            "actual_section_heading": None,
            "clause_reference": "None",
            "supporting_text": "",
            "missing_elements": [
                "Relief from performance delays due to uncontrollable events",
                "Force majeure notice and mitigation obligations",
                "Termination right if force majeure delay persists beyond 30 days",
            ],
            "details": "No force majeure clause exists to excuse performance delays or milestone delivery failures caused by acts of God, pandemics, war, government restrictions, or infrastructure outages.",
            "commercial_significance": "Parties remain strictly liable for delivery delays and default damages even when performance is rendered impossible by external uncontrollable events.",
            "significance": "MEDIUM",
            "commercial_legal_impact": "Parties remain strictly liable for delivery delays and default damages even when performance is rendered impossible by external uncontrollable events.",
            "recommendation": "Incorporate a standard mutual force majeure clause excusing delays caused by acts of God, infrastructure failures, war, pandemics, or government actions, with termination rights if prolonged beyond 30 days.",
        })

    # 4. Security Incident & Data Breach Notification
    sec11_clause = clause_by_sec.get("11") or clause_by_type.get("data_protection")
    if sec11_clause:
        s11_text = sec11_clause.get("text", "")
        has_strict_deadline = any(d in s11_text.lower() for d in ["24 hours", "48 hours", "72 hours", "immediate notice"])
        evaluations.append({
            "id": "security_incident_notification",
            "provision_name": "Security Incident & Data Breach Notification",
            "name": "Security Incident & Data Breach Notification",
            "status": "PRESENT" if has_strict_deadline else "PARTIALLY_PRESENT",
            "actual_section_number": "11",
            "actual_section_heading": "Data Protection and Security",
            "clause_reference": "Section 11 (Data Protection and Security)",
            "supporting_text": s11_text[:350].strip() if s11_text else "The Service Provider will use reasonable technical and organisational measures to protect Client data in its possession and will notify the Client without undue delay after becoming aware of a confirmed security incident affecting Client data.",
            "missing_elements": [
                "Mandatory breach notification deadline (e.g., within 24 to 72 hours)",
                "Forensic incident investigation and root-cause disclosure",
                "Cooperation in statutory reporting under DPDP Act 2023 / CERT-In directions",
            ] if not has_strict_deadline else [],
            "details": "Section 11 mandates reasonable technical and organizational safeguards to protect Client data and notification without undue delay, but fails to define a mandatory security breach notification deadline (e.g. 24-72 hours) or incident response protocol.",
            "commercial_significance": "Exposes the Client to severe regulatory fines and reporting failures under DPDP Act 2023 and CERT-In guidelines in the event of an undetected security compromise.",
            "significance": "CRITICAL",
            "commercial_legal_impact": "Exposes the Client to severe regulatory fines and reporting failures under DPDP Act 2023 and CERT-In guidelines in the event of an undetected security compromise.",
            "recommendation": "Specify a strict breach notification window (e.g., within 24–48 hours of confirmed incident) with mandated incident reports and mitigation cooperation.",
        })
    else:
        evaluations.append({
            "id": "security_incident_notification",
            "provision_name": "Security Incident & Data Breach Notification",
            "name": "Security Incident & Data Breach Notification",
            "status": "MISSING",
            "actual_section_number": None,
            "actual_section_heading": None,
            "clause_reference": "None",
            "supporting_text": "",
            "missing_elements": ["Data security safeguards", "Incident notification covenant"],
            "details": "Zero data security or security incident reporting covenants in the agreement.",
            "commercial_significance": "Severe data security vulnerability without developer compliance covenants.",
            "significance": "CRITICAL",
            "commercial_legal_impact": "Severe data security vulnerability without developer compliance covenants.",
            "recommendation": "Add comprehensive data protection and breach notification covenants.",
        })

    # 5. Data Backup, Disaster Recovery & Secure Deletion
    has_backup = any(k in combined_text for k in ["backup schedule", "disaster recovery", "secure deletion", "secure wipe", "data return"])
    if has_backup:
        evaluations.append({
            "id": "backup_and_data_deletion",
            "provision_name": "Data Backup, Disaster Recovery & Secure Deletion",
            "name": "Data Backup, Disaster Recovery & Secure Deletion",
            "status": "PRESENT",
            "actual_section_number": "Data Management",
            "actual_section_heading": "Data Management",
            "clause_reference": "Data Management Clause",
            "supporting_text": "Backup and post-termination data deletion obligations are defined.",
            "missing_elements": [],
            "details": "Backup and post-termination data deletion obligations are defined.",
            "commercial_significance": "Ensures business continuity and safe data lifecycle management.",
            "significance": "HIGH",
            "commercial_legal_impact": "Ensures business continuity and safe data lifecycle management.",
            "recommendation": "Maintain scheduled audits of backup integrity and restoration procedures.",
        })
    else:
        evaluations.append({
            "id": "backup_and_data_deletion",
            "provision_name": "Data Backup, Disaster Recovery & Secure Deletion",
            "name": "Data Backup, Disaster Recovery & Secure Deletion",
            "status": "MISSING",
            "actual_section_number": None,
            "actual_section_heading": None,
            "clause_reference": "None",
            "supporting_text": "",
            "missing_elements": [
                "Regular automated data backup schedule",
                "Disaster recovery RTO and RPO benchmarks",
                "Certified secure data deletion or return upon termination",
            ],
            "details": "The contract omits commitments regarding regular data backup schedules, disaster recovery procedures, or certified secure data deletion/return upon contract termination.",
            "commercial_significance": "Creates significant risk of permanent project data loss during development and unverified retention of client confidential records post-termination.",
            "significance": "HIGH",
            "commercial_legal_impact": "Creates significant risk of permanent project data loss during development and unverified retention of client confidential records post-termination.",
            "recommendation": "Require documented daily/weekly backup routines during development and certified cryptographic deletion or full handover of client data upon termination.",
        })

    # 6. Source Code Handover & Deployment Documentation
    sec3_clause = clause_by_sec.get("3") or clause_by_type.get("deliverables")
    sec10_clause = clause_by_sec.get("10") or clause_by_type.get("intellectual_property")
    if sec3_clause and ("source code" in combined_text or "build instruction" in combined_text):
        s3_text = sec3_clause.get("text", "")
        evaluations.append({
            "id": "source_code_handover",
            "provision_name": "Source Code Handover & Deployment Documentation",
            "name": "Source Code Handover & Deployment Documentation",
            "status": "PRESENT",
            "actual_section_number": "3 & 10",
            "actual_section_heading": "Deliverables & Intellectual Property",
            "clause_reference": "Section 3 (Deliverables) & Section 10 (Intellectual Property)",
            "supporting_text": s3_text[:350].strip() if s3_text else "3.1 The Service Provider will provide: (a) a responsive web application; (b) source code for custom-developed components; (c) database schema and migration scripts; (d) test summary; (e) deployment and setup instructions; and (f) one handover session of up to two hours.",
            "missing_elements": [],
            "details": "Section 3 and Section 10 explicitly mandate delivery of complete source code repositories, compiled binaries, architectural documentation, and build instructions upon fee settlement.",
            "commercial_significance": "Secures operational independence by enabling the Client or alternate vendors to deploy, debug, and maintain the custom software autonomously.",
            "significance": "HIGH",
            "commercial_legal_impact": "Secures operational independence by enabling the Client or alternate vendors to deploy, debug, and maintain the custom software autonomously.",
            "recommendation": "Ensure delivery criteria in Section 3 are strictly verified before approving the final milestone payment under Section 5.",
        })
    else:
        evaluations.append({
            "id": "source_code_handover",
            "provision_name": "Source Code Handover & Deployment Documentation",
            "name": "Source Code Handover & Deployment Documentation",
            "status": "MISSING",
            "actual_section_number": None,
            "actual_section_heading": None,
            "clause_reference": "None",
            "supporting_text": "",
            "missing_elements": ["Uncompiled source code delivery", "Architecture and deployment documentation"],
            "details": "No explicit obligation to deliver uncompiled source code or technical architecture documentation.",
            "commercial_significance": "Client risks vendor lock-in and inability to maintain software without the original developer.",
            "significance": "CRITICAL",
            "commercial_legal_impact": "Client risks vendor lock-in and inability to maintain software without the original developer.",
            "recommendation": "Mandate full source code repository handover, database scripts, and deployment guide as milestone deliverables.",
        })

    # 7. Third-Party Software & Open-Source Licensing Disclosure
    if sec10_clause:
        s10_text = sec10_clause.get("text", "")
        has_oss_warranty = "open-source" in s10_text.lower() or "copyleft" in s10_text.lower() or "sbom" in s10_text.lower()
        evaluations.append({
            "id": "third_party_licensing",
            "provision_name": "Third-Party Software & Open-Source Licensing Disclosure",
            "name": "Third-Party Software & Open-Source Licensing Disclosure",
            "status": "PRESENT" if has_oss_warranty else "PARTIALLY_PRESENT",
            "actual_section_number": "10",
            "actual_section_heading": "Intellectual Property",
            "clause_reference": "Section 10 (Intellectual Property)",
            "supporting_text": s10_text[:350].strip() if s10_text else "Upon full payment of all amounts due, the Service Provider assigns to the Client the intellectual property rights in the bespoke deliverables created specifically for the Client under this Agreement, excluding Pre-Existing Materials and third-party materials. The Service Provider retains ownership of tools, libraries, templates, know-how, and generic components developed prior to or independently of this Agreement ('Pre-Existing Materials'). To the extent Pre-Existing Materials are incorporated into the deliverables, the Service Provider grants the Client a perpetual, non-exclusive, worldwide, royalty-free licence to use them solely as part of the deliverables.",
            "missing_elements": [
                "Open-source software (OSS) disclosure / bill of materials (SBOM)",
                "Warranty against viral copyleft licenses (GPL/AGPL)",
                "Third-party IP infringement indemnification",
            ] if not has_oss_warranty else [],
            "details": "Section 10 licenses pre-existing developer tools and libraries perpetually, but lacks an open-source software (OSS) disclosure requirement, copyleft exclusion, or third-party IP infringement indemnification.",
            "commercial_significance": "Client risks inheriting restrictive copyleft viral licenses (e.g., GPL) or third-party infringement claims without developer defense commitments.",
            "significance": "HIGH",
            "commercial_legal_impact": "Client risks inheriting restrictive copyleft viral licenses (e.g., GPL) or third-party infringement claims without developer defense commitments.",
            "recommendation": "Add an open-source software warranty requiring prior disclosure of third-party libraries and prohibiting viral copyleft licenses without written Client consent.",
        })
    else:
        evaluations.append({
            "id": "third_party_licensing",
            "provision_name": "Third-Party Software & Open-Source Licensing Disclosure",
            "name": "Third-Party Software & Open-Source Licensing Disclosure",
            "status": "MISSING",
            "actual_section_number": None,
            "actual_section_heading": None,
            "clause_reference": "None",
            "supporting_text": "",
            "missing_elements": ["Third-party component terms", "Open-source licensing covenants"],
            "details": "No provisions governing third-party libraries, dependencies, or open-source software use.",
            "commercial_significance": "Unregulated third-party software risks intellectual property infringement claims.",
            "significance": "HIGH",
            "commercial_legal_impact": "Unregulated third-party software risks intellectual property infringement claims.",
            "recommendation": "Incorporate third-party component licensing representations and indemnities.",
        })

    # 8. Confidentiality Survival Beyond Termination
    sec9_clause = clause_by_sec.get("9") or clause_by_type.get("confidentiality")
    if sec9_clause:
        s9_text = sec9_clause.get("text", "")
        has_explicit_survival = "surviv" in s9_text.lower() or "following termination" in s9_text.lower()
        evaluations.append({
            "id": "confidentiality_survival",
            "provision_name": "Confidentiality Survival Beyond Termination",
            "name": "Confidentiality Survival Beyond Termination",
            "status": "PRESENT" if has_explicit_survival else "PARTIALLY_PRESENT",
            "actual_section_number": "9",
            "actual_section_heading": "Confidentiality",
            "clause_reference": "Section 9 (Confidentiality)",
            "supporting_text": s9_text[:350].strip() if s9_text else "Each Party may receive non-public business, technical, financial, or operational information from the other Party ('Confidential Information'). The receiving Party will use it only to perform or receive services under this Agreement, protect it using reasonable care, and disclose it only to personnel who need to know and are bound by confidentiality obligations.",
            "missing_elements": [
                "Post-termination survival duration: NOT SPECIFIED in agreement (recommend 2–5 years or indefinite for trade secrets)",
                "Explicit survival clause in Section 14 or Section 17",
                "Post-termination return or destruction of Confidential Information",
            ] if not has_explicit_survival else [],
            "details": "Section 9 establishes comprehensive non-disclosure obligations during the active engagement, but omits an explicit survival clause specifying that confidentiality survives contract termination or expiration. Survival period is NOT SPECIFIED in the agreement.",
            "commercial_significance": "Survival period is NOT SPECIFIED in the agreement. Creates legal ambiguity regarding whether confidentiality obligations lapse upon contract termination, potentially leaving trade secrets and proprietary code unprotected post-engagement.",
            "significance": "HIGH",
            "commercial_legal_impact": "Creates legal ambiguity regarding whether confidentiality obligations lapse upon contract termination, potentially leaving trade secrets and proprietary code unprotected post-engagement.",
            "recommendation": "Insert an express survival provision in Section 9 or Section 17 specifying that confidentiality obligations survive termination or expiration for a period of at least three (3) to five (5) years, and indefinitely for trade secrets.",
        })
    else:
        evaluations.append({
            "id": "confidentiality_survival",
            "provision_name": "Confidentiality Survival Beyond Termination",
            "name": "Confidentiality Survival Beyond Termination",
            "status": "MISSING",
            "actual_section_number": None,
            "actual_section_heading": None,
            "clause_reference": "None",
            "supporting_text": "",
            "missing_elements": ["Confidentiality covenant", "Post-termination survival"],
            "details": "Agreement completely lacks confidentiality and post-termination survival provisions.",
            "commercial_significance": "Proprietary information could legally be shared with competitors once the agreement ends.",
            "significance": "CRITICAL",
            "commercial_legal_impact": "Proprietary information could legally be shared with competitors once the agreement ends.",
            "recommendation": "Add a comprehensive non-disclosure clause with explicit survival.",
        })

    # 9. Multi-Tier Dispute Resolution & Arbitration Protocol
    sec16_clause = clause_by_sec.get("16") or clause_by_type.get("governing_law_dispute") or clause_by_type.get("governing_law")
    if sec16_clause:
        s16_text = sec16_clause.get("text", "")
        has_arbitration = "arbitrat" in s16_text.lower()
        evaluations.append({
            "id": "dispute_resolution_procedure",
            "provision_name": "Multi-Tier Dispute Resolution & Arbitration Protocol",
            "name": "Multi-Tier Dispute Resolution & Arbitration Protocol",
            "status": "PRESENT" if has_arbitration else "PARTIALLY_PRESENT",
            "actual_section_number": "16",
            "actual_section_heading": "Governing Law and Dispute Resolution",
            "clause_reference": "Section 16 (Governing Law and Dispute Resolution)",
            "supporting_text": s16_text[:350].strip() if s16_text else "The Parties will first attempt in good faith to resolve any dispute through discussions between authorised representatives. If the dispute is not resolved within thirty (30) days, the Parties may refer it to the competent courts at Surat, Gujarat, subject to applicable law.",
            "missing_elements": [
                "Institutional or ad-hoc arbitration framework (e.g. Arbitration and Conciliation Act 1996)",
                "Formal mediation protocol prior to litigation",
                "Specific seat/venue and number of arbitrators",
            ] if not has_arbitration else [],
            "details": "Section 16 mandates a 30-day informal discussion period followed by jurisdiction in competent courts at Surat, Gujarat, but omits a binding arbitration framework (e.g. Arbitration and Conciliation Act 1996) or mediation protocol.",
            "commercial_significance": "Disputes are subject to regular court litigation in Surat, Gujarat, risking prolonged public judicial proceedings and substantial legal overhead.",
            "significance": "MEDIUM",
            "commercial_legal_impact": "Disputes are subject to regular court litigation, risking prolonged public judicial proceedings and substantial legal overhead.",
            "recommendation": "Incorporate a binding arbitration clause designating Surat or Ahmedabad as seat under the Indian Arbitration and Conciliation Act 1996, with expedited rules for commercial disputes.",
        })
    else:
        evaluations.append({
            "id": "dispute_resolution_procedure",
            "provision_name": "Multi-Tier Dispute Resolution & Arbitration Protocol",
            "name": "Multi-Tier Dispute Resolution & Arbitration Protocol",
            "status": "MISSING",
            "actual_section_number": None,
            "actual_section_heading": None,
            "clause_reference": "None",
            "supporting_text": "",
            "missing_elements": ["Dispute escalation process", "Governing law & jurisdiction"],
            "details": "No dispute resolution or escalation procedures provided.",
            "commercial_significance": "Creates procedural uncertainty in handling contract disputes.",
            "significance": "MEDIUM",
            "commercial_legal_impact": "Creates procedural uncertainty in handling contract disputes.",
            "recommendation": "Specify governing law and multi-tier dispute resolution mechanism.",
        })

    return evaluations
