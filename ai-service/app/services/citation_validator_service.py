# ai-service/app/services/citation_validator_service.py

"""
Part 12D — Citation Validator

Validates that Gemini's answer citations are grounded in the FAISS-filtered
evidence chunks that passed the Part 12B Evidence Checker.

Checks:
  1. Page exists among retrieved evidence (or is acceptably generic)
  2. Section exists / is consistent with evidence
  3. Excerpt is actually supported by chunk text (substring / fuzzy overlap)
  4. Overall: enough valid citations to trust the answer
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Tunable thresholds
# ---------------------------------------------------------------------------

# Minimum character length for a usable excerpt
MIN_EXCERPT_LEN: int = 12

# Fuzzy token overlap ratio (excerpt tokens found in chunk) to count as support
MIN_TOKEN_OVERLAP: float = 0.55

# At least this fraction of Gemini citations must pass to accept the answer
MIN_VALID_CITATION_RATIO: float = 0.5

# Absolute minimum valid citations when Gemini returned any
MIN_VALID_CITATIONS: int = 1

# If Gemini returns zero citations but evidence exists, we can synthesize from chunks
ALLOW_SYNTHETIC_CITATIONS: bool = True

SAFE_RESPONSE_INVALID_CITATIONS: str = (
    "I found related text in the document, but could not verify reliable citations "
    "for a precise answer. Please rephrase your question or ask about a specific "
    "clause, section, date, or obligation."
)


# ---------------------------------------------------------------------------
# Result model
# ---------------------------------------------------------------------------

@dataclass
class CitationValidationResult:
    is_valid: bool
    reason: str
    total_citations: int
    valid_count: int
    invalid_count: int
    valid_citations: List[Dict[str, Any]] = field(default_factory=list)
    invalid_citations: List[Dict[str, Any]] = field(default_factory=list)
    issues: List[str] = field(default_factory=list)
    support_score: float = 0.0  # 0.0 – 1.0
    used_synthetic: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

def _norm(text: Any) -> str:
    if text is None:
        return ""
    s = str(text).lower().strip()
    s = re.sub(r"\s+", " ", s)
    return s


def _tokens(text: str) -> List[str]:
    return re.findall(r"[a-z0-9$₹%./-]+", _norm(text))


def _token_overlap_ratio(excerpt: str, haystack: str) -> float:
    et = _tokens(excerpt)
    if not et:
        return 0.0
    ht = set(_tokens(haystack))
    if not ht:
        return 0.0
    hits = sum(1 for t in et if t in ht)
    return hits / len(et)


def _excerpt_in_text(excerpt: str, haystack: str) -> bool:
    e = _norm(excerpt)
    h = _norm(haystack)
    if not e or not h:
        return False
    if e in h:
        return True
    # Soft match: high token overlap
    return _token_overlap_ratio(e, h) >= MIN_TOKEN_OVERLAP


def _page_matches(cit_page: Any, chunk_page: Any) -> bool:
    """
    TXT/single-page docs often use page 1 / Unknown.
    Accept loose matches so we don't over-reject.
    """
    cp = _norm(cit_page)
    kp = _norm(chunk_page)
    if not cp or cp in {"unknown", "n/a", "na", "none", "-"}:
        return True
    if not kp or kp in {"unknown", "n/a", "na", "none", "-"}:
        return True
    if cp == kp:
        return True
    # numeric equality ("1" == 1 == "1.0")
    try:
        return float(cp) == float(kp)
    except (TypeError, ValueError):
        return cp in kp or kp in cp


def _section_matches(cit_section: Any, chunk: Dict[str, Any]) -> bool:
    cs = _norm(cit_section)
    if not cs or cs in {"unknown", "n/a", "na", "none", "document", "general"}:
        return True

    chunk_section = _norm(chunk.get("section", ""))
    chunk_text = _norm(chunk.get("text", ""))

    if chunk_section and (cs == chunk_section or cs in chunk_section or chunk_section in cs):
        return True
    # Section heading often appears inside the chunk body
    if cs and cs in chunk_text:
        return True
    # Token overlap on section labels ("non-compete" vs "NON-COMPETE AND RESTRICTIVE...")
    if chunk_section and _token_overlap_ratio(cs, chunk_section) >= 0.5:
        return True
    return False


def _find_supporting_chunk(
    citation: Dict[str, Any],
    chunks: List[Dict[str, Any]],
) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    """
    Return (matching_chunk, issues). matching_chunk is None if unsupported.
    """
    issues: List[str] = []
    excerpt = str(citation.get("excerpt") or citation.get("quote") or "").strip()
    page = citation.get("page", "Unknown")
    section = citation.get("section", "Unknown")

    if len(excerpt) < MIN_EXCERPT_LEN:
        issues.append("EXCERPT_TOO_SHORT")
        return None, issues

    best: Optional[Dict[str, Any]] = None
    best_score = 0.0
    page_ok_any = False
    section_ok_any = False
    excerpt_ok_any = False

    for ch in chunks:
        page_ok = _page_matches(page, ch.get("page"))
        section_ok = _section_matches(section, ch)
        excerpt_ok = _excerpt_in_text(excerpt, ch.get("text", ""))

        page_ok_any = page_ok_any or page_ok
        section_ok_any = section_ok_any or section_ok
        excerpt_ok_any = excerpt_ok_any or excerpt_ok

        # Excerpt support is mandatory; page/section are soft but preferred
        if not excerpt_ok:
            continue

        score = _token_overlap_ratio(excerpt, ch.get("text", ""))
        if page_ok:
            score += 0.15
        if section_ok:
            score += 0.15

        if score > best_score:
            best_score = score
            best = ch

    if best is None:
        if not excerpt_ok_any:
            issues.append("EXCERPT_NOT_IN_EVIDENCE")
        if not page_ok_any:
            issues.append("PAGE_NOT_FOUND")
        if not section_ok_any:
            issues.append("SECTION_NOT_FOUND")
        if not issues:
            issues.append("NO_SUPPORTING_CHUNK")
        return None, issues

    # Soft warnings (do not fail if excerpt is solid)
    if not _page_matches(page, best.get("page")):
        issues.append("PAGE_MISMATCH_SOFT")
    if not _section_matches(section, best):
        issues.append("SECTION_MISMATCH_SOFT")

    return best, issues


def _normalize_citation(
    citation: Dict[str, Any],
    supporting_chunk: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Clamp citation fields; prefer verified chunk metadata when available."""
    excerpt = str(citation.get("excerpt") or citation.get("quote") or "").strip()
    if len(excerpt) > 240:
        excerpt = excerpt[:237] + "..."

    page = citation.get("page", "Unknown")
    section = citation.get("section", "Unknown")

    if supporting_chunk:
        # Prefer authoritative retrieval metadata
        page = supporting_chunk.get("page", page)
        section = supporting_chunk.get("section", section)

    return {
        "page": page if page is not None else "Unknown",
        "section": section if section is not None else "Unknown",
        "excerpt": excerpt,
    }


def _synthesize_citations_from_chunks(
    chunks: List[Dict[str, Any]],
    limit: int = 3,
) -> List[Dict[str, Any]]:
    """When Gemini forgets citations, build them from top filtered evidence."""
    out: List[Dict[str, Any]] = []
    for ch in (chunks or [])[:limit]:
        text = (ch.get("text") or "").strip()
        if len(text) < MIN_EXCERPT_LEN:
            continue
        excerpt = text[:180] + ("..." if len(text) > 180 else "")
        out.append(
            {
                "page": ch.get("page", "Unknown"),
                "section": ch.get("section", "Unknown"),
                "excerpt": excerpt,
            }
        )
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate_citations(
    answer: str,
    citations: List[Dict[str, Any]],
    filtered_chunks: List[Dict[str, Any]],
) -> CitationValidationResult:
    """
    Validate Gemini citations against Part 12B filtered evidence chunks.
    """
    answer = (answer or "").strip()
    citations = citations or []
    chunks = filtered_chunks or []

    if not answer:
        return CitationValidationResult(
            is_valid=False,
            reason="EMPTY_ANSWER",
            total_citations=0,
            valid_count=0,
            invalid_count=0,
            issues=["EMPTY_ANSWER"],
            support_score=0.0,
        )

    if not chunks:
        return CitationValidationResult(
            is_valid=False,
            reason="NO_EVIDENCE_CHUNKS",
            total_citations=len(citations),
            valid_count=0,
            invalid_count=len(citations),
            issues=["NO_EVIDENCE_CHUNKS"],
            support_score=0.0,
        )

    # Gemini returned no citations → optionally synthesize from evidence
    if len(citations) == 0:
        if ALLOW_SYNTHETIC_CITATIONS:
            synthetic = _synthesize_citations_from_chunks(chunks)
            if synthetic:
                return CitationValidationResult(
                    is_valid=True,
                    reason="SYNTHETIC_CITATIONS_FROM_EVIDENCE",
                    total_citations=0,
                    valid_count=len(synthetic),
                    invalid_count=0,
                    valid_citations=synthetic,
                    issues=["GEMINI_OMITTED_CITATIONS"],
                    support_score=0.75,
                    used_synthetic=True,
                )
        return CitationValidationResult(
            is_valid=False,
            reason="NO_CITATIONS_PROVIDED",
            total_citations=0,
            valid_count=0,
            invalid_count=0,
            issues=["NO_CITATIONS_PROVIDED"],
            support_score=0.0,
        )

    valid: List[Dict[str, Any]] = []
    invalid: List[Dict[str, Any]] = []
    all_issues: List[str] = []

    for raw in citations:
        support, issues = _find_supporting_chunk(raw, chunks)
        all_issues.extend(issues)
        if support is not None:
            valid.append(_normalize_citation(raw, support))
        else:
            invalid.append(
                {
                    **_normalize_citation(raw, None),
                    "issues": issues,
                }
            )

    total = len(citations)
    vcount = len(valid)
    icount = len(invalid)
    ratio = vcount / total if total else 0.0

    # Answer-level soft check: do top evidence tokens appear in the answer?
    # (Does not alone pass/fail — informs support_score.)
    joined_evidence = " ".join((c.get("text") or "") for c in chunks)
    answer_overlap = _token_overlap_ratio(answer[:800], joined_evidence)
    support_score = round((0.7 * ratio) + (0.3 * min(answer_overlap, 1.0)), 4)

    hard_fail_reasons = []
    if vcount < MIN_VALID_CITATIONS:
        hard_fail_reasons.append("TOO_FEW_VALID_CITATIONS")
    if ratio < MIN_VALID_CITATION_RATIO:
        hard_fail_reasons.append("VALID_CITATION_RATIO_TOO_LOW")

    if hard_fail_reasons:
        return CitationValidationResult(
            is_valid=False,
            reason=hard_fail_reasons[0],
            total_citations=total,
            valid_count=vcount,
            invalid_count=icount,
            valid_citations=valid,
            invalid_citations=invalid,
            issues=list(dict.fromkeys(all_issues + hard_fail_reasons)),
            support_score=support_score,
            used_synthetic=False,
        )

    return CitationValidationResult(
        is_valid=True,
        reason="CITATIONS_VALIDATED",
        total_citations=total,
        valid_count=vcount,
        invalid_count=icount,
        valid_citations=valid,
        invalid_citations=invalid,
        issues=list(dict.fromkeys(all_issues)),
        support_score=support_score,
        used_synthetic=False,
    )