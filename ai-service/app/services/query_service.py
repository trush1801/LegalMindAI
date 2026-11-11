"""
Query Analyzer + RAG Retrieval Service — Part 11

Classifies user questions into:
  risk | clause | summary | date | general

Then retrieves relevant FAISS chunks for the document.
Does NOT call Gemini yet — that is Part 12.
"""

import logging
import re
from dataclasses import dataclass, field, asdict
from typing import Optional

from app.services.vector_service import search_faiss_index, VectorSearchResult

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# Intent patterns
# ─────────────────────────────────────────────────────────────

QUERY_CATEGORIES = ["risk", "clause", "summary", "date", "general"]

_INTENT_PATTERNS: dict[str, list[tuple[str, float]]] = {
    "risk": [
        (r"\brisk(y|s|ier)?\b", 3.0),
        (r"\bliabilit(y|ies)\b", 2.5),
        (r"\bpenalt(y|ies)\b", 3.0),
        (r"\bdamage(s)?\b", 2.5),
        (r"\bbreach(ing|es)?\b", 2.5),
        (r"\bunfavorable\b", 2.5),
        (r"\bdangerous\b", 2.0),
        (r"\bexposure\b", 2.0),
        (r"\bindemnit(y|ies|fication)\b", 2.0),
        (r"\bproblem(s|atic)?\b", 1.5),
        (r"\bconcern(s|ing)?\b", 1.5),
        (r"\bflag(ged|s)?\b", 1.5),
        (r"\bsafe\b", 1.0),
    ],
    "clause": [
        (r"\bclause(s)?\b", 3.0),
        (r"\bsection(s)?\b", 2.0),
        (r"\bterminat(e|ion|ing)\b", 2.5),
        (r"\bconfidential(ity)?\b", 2.5),
        (r"\bnon[- ]?compete\b", 2.5),
        (r"\bnon[- ]?solicit\b", 2.0),
        (r"\bpayment\b", 2.0),
        (r"\bindemnit(y|ies)\b", 2.0),
        (r"\bgoverning\s+law\b", 2.5),
        (r"\bforce\s+majeure\b", 2.5),
        (r"\barbitration\b", 2.0),
        (r"\bshow\s+(me\s+)?the\b", 1.5),
        (r"\bwhat\s+does\s+.+\s+say\b", 2.0),
    ],
    "summary": [
        (r"\bsummar(y|ize|ise)\b", 3.5),
        (r"\boverview\b", 3.0),
        (r"\bkey\s+points?\b", 3.0),
        (r"\bmain\s+points?\b", 2.5),
        (r"\bobligations?\b", 2.5),
        (r"\bwhat\s+is\s+this\s+(document|contract|agreement)\b", 3.0),
        (r"\btell\s+me\s+about\b", 2.0),
        (r"\bin\s+plain\s+(english|language)\b", 2.5),
        (r"\bbrief(ly)?\b", 1.5),
    ],
    "date": [
        (r"\bdate(s)?\b", 2.5),
        (r"\bdeadline(s)?\b", 3.0),
        (r"\bnotice\s+period\b", 3.5),
        (r"\btermination\s+period\b", 3.5),
        (r"\bwhen\b", 2.0),
        (r"\bexpir(y|es|ation)\b", 3.0),
        (r"\beffective\s+(date|from)\b", 2.5),
        (r"\bcommence(s|ment)?\b", 2.0),
        (r"\bduration\b", 2.5),
        (r"\btenure\b", 2.5),
        (r"\bhow\s+long\b", 2.5),
        (r"\b\d+\s*days?\b", 1.5),
        (r"\bperiod\b", 1.5),
    ],
    "general": [
        (r"\bwho\b", 2.0),
        (r"\bpart(y|ies)\b", 2.5),
        (r"\bsalar(y|ies)\b", 2.5),
        (r"\bamount(s)?\b", 2.0),
        (r"\bwhat\s+is\b", 1.5),
        (r"\bexplain\b", 1.5),
        (r"\bhow\s+much\b", 2.0),
        (r"\bemployer\b", 1.5),
        (r"\bemployee\b", 1.5),
    ],
}

# Optional clause-type hint extraction for better FAISS query rewriting
_CLAUSE_HINTS: list[tuple[str, str]] = [
    (r"\bterminat", "termination"),
    (r"\bconfidential|\bnda\b|\bnon[- ]?disclosure", "confidentiality"),
    (r"\bpayment|\bsalar|\bcompensat|\bremunerat|\bfee\b", "payment"),
    (r"\bliabilit|\bindemnit", "liability"),
    (r"\bnon[- ]?compete|\brestraint\s+of\s+trade", "non_compete"),
    (r"\bgoverning\s+law|\bjurisdiction", "governing_law"),
    (r"\barbitrat|\bdispute|\bmediation", "dispute_resolution"),
    (r"\bforce\s+majeure", "force_majeure"),
    (r"\bintellectual\s+property|\bcopyright|\bpatent", "intellectual_property"),
]


# ─────────────────────────────────────────────────────────────
# Data structures
# ─────────────────────────────────────────────────────────────

@dataclass
class QueryAnalysis:
    original_query: str
    category: str                 # risk | clause | summary | date | general
    confidence: float
    clause_hint: Optional[str]    # e.g. termination, payment
    rewritten_query: str          # optimized for FAISS retrieval
    matched_signals: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RetrievedChunk:
    chunk_id: str
    document_id: str
    chunk_index: int
    page: int
    section: Optional[str]
    section_title: Optional[str]
    text: str
    clause_type: Optional[str]
    score: float
    citation: str                 # "Page 3, Section 3.1"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RAGResult:
    document_id: str
    query: str
    analysis: QueryAnalysis
    retrieved_chunks: list[RetrievedChunk] = field(default_factory=list)
    total_retrieved: int = 0
    has_sufficient_context: bool = False
    retrieval_note: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


# ─────────────────────────────────────────────────────────────
# Query Analyzer
# ─────────────────────────────────────────────────────────────

def analyze_query(query: str) -> QueryAnalysis:
    """
    Classify a natural-language legal question into one of:
      risk | clause | summary | date | general
    """
    q = (query or "").strip()
    if not q:
        return QueryAnalysis(
            original_query=query or "",
            category="general",
            confidence=0.3,
            clause_hint=None,
            rewritten_query="",
            matched_signals=[],
        )

    text = q.lower()
    scores: dict[str, float] = {c: 0.0 for c in QUERY_CATEGORIES}
    matched: dict[str, list[str]] = {c: [] for c in QUERY_CATEGORIES}

    for category, patterns in _INTENT_PATTERNS.items():
        for pattern, weight in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                scores[category] += weight
                matched[category].append(pattern)

    # Choose best category
    best_category = max(scores, key=lambda c: scores[c])
    best_score = scores[best_category]

    if best_score <= 0:
        best_category = "general"
        confidence = 0.45
        signals = []
    else:
        # Normalize score → confidence
        confidence = min(0.50 + (best_score / 10.0), 0.98)
        signals = matched[best_category][:6]

        # If top two are close, slightly reduce confidence
        ordered = sorted(scores.values(), reverse=True)
        if len(ordered) >= 2 and ordered[0] > 0 and (ordered[0] - ordered[1]) < 1.0:
            confidence = max(confidence - 0.08, 0.45)

    # Clause hint
    clause_hint = None
    for pattern, hint in _CLAUSE_HINTS:
        if re.search(pattern, text, re.IGNORECASE):
            clause_hint = hint
            break

    rewritten = _rewrite_query_for_retrieval(q, best_category, clause_hint)

    logger.info(
        f"Query analyzed: category={best_category} | conf={confidence:.2f} | "
        f"hint={clause_hint} | q='{q[:80]}'"
    )

    return QueryAnalysis(
        original_query=q,
        category=best_category,
        confidence=round(confidence, 3),
        clause_hint=clause_hint,
        rewritten_query=rewritten,
        matched_signals=signals,
    )


def _rewrite_query_for_retrieval(
    query: str,
    category: str,
    clause_hint: Optional[str],
) -> str:
    """
    Expand short questions into richer retrieval queries.
    Improves FAISS semantic recall without changing user intent.
    """
    base = query.strip()

    boosts = []
    if clause_hint:
        boosts.append(clause_hint.replace("_", " "))

    if category == "date":
        boosts.extend(["notice period", "days", "effective date", "expiry", "duration"])
    elif category == "risk":
        boosts.extend(["risk", "liability", "indemnity", "unfavorable", "exposure"])
    elif category == "clause":
        boosts.extend(["clause", "section", "agreement terms"])
    elif category == "summary":
        boosts.extend(["key points", "obligations", "summary", "overview"])
    elif category == "general":
        boosts.extend(["parties", "terms", "agreement"])

    # Keep unique boosts not already clearly present
    extra = []
    lower = base.lower()
    for b in boosts:
        if b.lower() not in lower:
            extra.append(b)

    if extra:
        return f"{base} | " + " ".join(extra[:5])
    return base


# ─────────────────────────────────────────────────────────────
# RAG Retrieval
# ─────────────────────────────────────────────────────────────

def _to_citation(page: int, section: Optional[str]) -> str:
    if section and str(section).strip():
        return f"Page {page}, Section {section}"
    return f"Page {page}"


def retrieve_for_query(
    document_id: str,
    query: str,
    top_k: int = 5,
    min_score: float = 0.25,
) -> RAGResult:
    """
    Full Part 11 pipeline:
      1. Analyze query intent
      2. Retrieve FAISS chunks
      3. Filter + attach citations
    """
    analysis = analyze_query(query)

    # Dynamic top_k by intent
    effective_k = top_k
    if analysis.category == "summary":
        effective_k = max(top_k, 8)
    elif analysis.category in ("clause", "date"):
        effective_k = max(top_k, 5)

    try:
        raw_results: list[VectorSearchResult] = search_faiss_index(
            document_id=document_id,
            query=analysis.rewritten_query,
            top_k=effective_k,
        )
    except FileNotFoundError:
        return RAGResult(
            document_id=document_id,
            query=query,
            analysis=analysis,
            retrieved_chunks=[],
            total_retrieved=0,
            has_sufficient_context=False,
            retrieval_note=(
                "No FAISS index found for this document. "
                "Ensure Part 10 vector indexing completed successfully."
            ),
        )
    except Exception as e:
        logger.error(f"FAISS retrieval failed for {document_id}: {e}", exc_info=True)
        return RAGResult(
            document_id=document_id,
            query=query,
            analysis=analysis,
            retrieved_chunks=[],
            total_retrieved=0,
            has_sufficient_context=False,
            retrieval_note=f"Retrieval error: {str(e)}",
        )

    chunks: list[RetrievedChunk] = []
    for r in raw_results:
        if r.score < min_score:
            continue

        # Soft boost if clause_hint matches chunk clause_type
        score = r.score
        if analysis.clause_hint and r.clause_type and analysis.clause_hint == r.clause_type:
            score = min(score + 0.05, 1.0)

        chunks.append(
            RetrievedChunk(
                chunk_id=r.chunk_id,
                document_id=r.document_id,
                chunk_index=r.chunk_index,
                page=r.page,
                section=r.section,
                section_title=r.section_title,
                text=r.text,
                clause_type=r.clause_type,
                score=round(score, 4),
                citation=_to_citation(r.page, r.section),
            )
        )

    # Re-rank by score descending after boost
    chunks.sort(key=lambda c: c.score, reverse=True)

    # Sufficient context heuristic
    has_sufficient = False
    note = ""
    if not chunks:
        note = "No relevant document chunks found above similarity threshold."
    elif chunks[0].score >= 0.45 or (len(chunks) >= 2 and chunks[0].score >= 0.35):
        has_sufficient = True
        note = f"Retrieved {len(chunks)} relevant chunk(s) for category '{analysis.category}'."
    else:
        has_sufficient = len(chunks) >= 1
        note = (
            f"Retrieved {len(chunks)} chunk(s) with moderate confidence. "
            "Answer may be limited."
        )

    logger.info(
        f"RAG retrieval: doc={document_id} | category={analysis.category} | "
        f"chunks={len(chunks)} | sufficient={has_sufficient}"
    )

    return RAGResult(
        document_id=document_id,
        query=query,
        analysis=analysis,
        retrieved_chunks=chunks,
        total_retrieved=len(chunks),
        has_sufficient_context=has_sufficient,
        retrieval_note=note,
    )