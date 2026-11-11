# ai-service/app/services/evidence_service.py

"""
Part 12B — Evidence Checker

Validates that FAISS-retrieved chunks are strong enough to ground an answer.
If evidence is insufficient, the graph must NOT call Gemini.
"""

from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict


# Minimum cosine / IP similarity for a single chunk to count as usable
MIN_CHUNK_SCORE: float = 0.35

# At least this many chunks must pass MIN_CHUNK_SCORE
MIN_PASSING_CHUNKS: int = 1

# Top-1 score must clear this bar (slightly stricter than MIN_CHUNK_SCORE)
MIN_TOP_SCORE: float = 0.42

SAFE_RESPONSE_MESSAGE: str = (
    "No verifiable evidence found in the document to answer this question. "
    "I can only respond based on content that is present and retrievable "
    "from the uploaded contract."
)


@dataclass
class EvidenceDecision:
    """Result of the evidence sufficiency check."""
    is_sufficient: bool
    reason: str
    total_retrieved: int
    passing_chunks: int
    top_score: float
    filtered_chunks: List[Dict[str, Any]]
    safe_message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _normalize_chunk(raw: Any, rank: int) -> Dict[str, Any]:
    """Normalize FAISS hit shape so the rest of the graph can rely on stable keys."""
    if hasattr(raw, "to_dict"):
        raw = raw.to_dict()
    elif not isinstance(raw, dict):
        raw = {}

    score = raw.get("score", raw.get("similarity", 0.0))
    try:
        score = float(score)
    except (TypeError, ValueError):
        score = 0.0

    return {
        "rank": rank,
        "score": round(score, 4),
        "text": raw.get("text", raw.get("chunk_text", "")) or "",
        "page": raw.get("page", raw.get("page_number", "Unknown")),
        "section": raw.get("section", raw.get("clause_type", "Unknown")),
        "chunk_id": raw.get("chunk_id", raw.get("id", rank)),
    }


def filter_chunks_by_score(
    chunks: List[Dict[str, Any]],
    min_score: float = MIN_CHUNK_SCORE,
) -> List[Dict[str, Any]]:
    """Keep only chunks that clear the minimum similarity floor."""
    normalized = [_normalize_chunk(c, i) for i, c in enumerate(chunks or [])]
    return [c for c in normalized if c["score"] >= min_score and c["text"].strip()]


def check_evidence(
    retrieved_chunks: List[Dict[str, Any]],
    *,
    min_chunk_score: float = MIN_CHUNK_SCORE,
    min_passing_chunks: int = MIN_PASSING_CHUNKS,
    min_top_score: float = MIN_TOP_SCORE,
) -> EvidenceDecision:
    """
    Decide whether retrieved evidence is sufficient to ground a Gemini answer.

    Rules (all must pass):
      1. At least one chunk was retrieved from FAISS.
      2. At least `min_passing_chunks` chunks score >= `min_chunk_score`.
      3. The best chunk scores >= `min_top_score`.
    """
    raw = retrieved_chunks or []
    total = len(raw)

    if total == 0:
        return EvidenceDecision(
            is_sufficient=False,
            reason="NO_CHUNKS_RETRIEVED",
            total_retrieved=0,
            passing_chunks=0,
            top_score=0.0,
            filtered_chunks=[],
            safe_message=SAFE_RESPONSE_MESSAGE,
        )

    filtered = filter_chunks_by_score(raw, min_score=min_chunk_score)
    passing = len(filtered)
    top_score = filtered[0]["score"] if filtered else 0.0
    # If nothing passed the filter, still report raw top score for diagnostics
    if not filtered and raw:
        try:
            first_raw = raw[0].to_dict() if hasattr(raw[0], "to_dict") else raw[0]
            top_score = float(first_raw.get("score", first_raw.get("similarity", 0.0)))
        except (TypeError, ValueError, IndexError, AttributeError):
            top_score = 0.0

    if passing < min_passing_chunks:
        return EvidenceDecision(
            is_sufficient=False,
            reason="INSUFFICIENT_PASSING_CHUNKS",
            total_retrieved=total,
            passing_chunks=passing,
            top_score=round(top_score, 4),
            filtered_chunks=filtered,
            safe_message=SAFE_RESPONSE_MESSAGE,
        )

    if top_score < min_top_score:
        return EvidenceDecision(
            is_sufficient=False,
            reason="TOP_SCORE_BELOW_THRESHOLD",
            total_retrieved=total,
            passing_chunks=passing,
            top_score=round(top_score, 4),
            filtered_chunks=filtered,
            safe_message=SAFE_RESPONSE_MESSAGE,
        )

    return EvidenceDecision(
        is_sufficient=True,
        reason="EVIDENCE_SUFFICIENT",
        total_retrieved=total,
        passing_chunks=passing,
        top_score=round(top_score, 4),
        filtered_chunks=filtered,
        safe_message=None,
    )