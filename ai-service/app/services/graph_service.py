# ai-service/app/services/graph_service.py

"""
Part 12A — LangGraph Router
Part 12B — Evidence Checker
Part 12C — Gemini Generation
Part 12D — Citation Validator (+ one regenerate pass)
"""

from typing import Any, Dict, List, Literal, Optional, TypedDict

from langgraph.graph import END, StateGraph

from app.services.citation_validator_service import (
    SAFE_RESPONSE_INVALID_CITATIONS,
    validate_citations,
)
from app.services.evidence_service import SAFE_RESPONSE_MESSAGE, check_evidence
from app.services.generation_service import generate_gemini_answer
from app.services.query_service import analyze_query
from app.services.vector_service import search_faiss_index

try:
    from app.services.risk_service import analyze_document_risk
except Exception:  # pragma: no cover
    analyze_document_risk = None


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class GraphState(TypedDict):
    query: str
    document_id: str
    intent: str
    route_taken: str
    # 12B
    retrieved_chunks: List[Dict[str, Any]]
    evidence_sufficient: bool
    evidence_reason: str
    evidence_top_score: float
    evidence_passing_chunks: int
    filtered_chunks: List[Dict[str, Any]]
    # 12C
    risk_findings: List[Dict[str, Any]]
    final_answer: Optional[str]
    citations: List[Dict[str, Any]]
    blocked_by_evidence_gate: bool
    # 12D
    citations_valid: bool
    citation_validation_reason: str
    citation_support_score: float
    citation_issues: List[str]
    regeneration_count: int
    blocked_by_citation_gate: bool
    validator_feedback: str


def _empty_fields() -> dict:
    return {
        "retrieved_chunks": [],
        "evidence_sufficient": False,
        "evidence_reason": "",
        "evidence_top_score": 0.0,
        "evidence_passing_chunks": 0,
        "filtered_chunks": [],
        "risk_findings": [],
        "final_answer": None,
        "citations": [],
        "blocked_by_evidence_gate": False,
        "citations_valid": False,
        "citation_validation_reason": "",
        "citation_support_score": 0.0,
        "citation_issues": [],
        "regeneration_count": 0,
        "blocked_by_citation_gate": False,
        "validator_feedback": "",
    }


_PATH_QUERY_SUFFIX = {
    "RAG Path": "",
    "Risk Path": " risk liability penalty damages breach termination",
    "Summary Path": " summary overview key points obligations",
}

MAX_REGENERATIONS = 1


def _retrieve(document_id: str, query: str, route_taken: str, top_k: int = 5) -> List[Dict[str, Any]]:
    expanded = f"{query}{_PATH_QUERY_SUFFIX.get(route_taken, '')}".strip()
    try:
        result = search_faiss_index(document_id, expanded, top_k=top_k)
    except Exception:
        return []
    if isinstance(result, dict):
        return result.get("results") or result.get("chunks") or []
    if isinstance(result, list):
        return result
    return []


def _fetch_risk_findings(filtered_chunks: List[Dict[str, Any]], document_id: str = "doc") -> List[Dict[str, Any]]:
    try:
        from app.services.risk_service import (
            _eval_termination, _eval_liability, _eval_payment,
            _eval_confidentiality, _eval_non_compete, _eval_governing_law
        )
        findings = []
        for c in filtered_chunks:
            d = c if isinstance(c, dict) else (c.to_dict() if hasattr(c, "to_dict") else {})
            findings.extend(_eval_termination(d, document_id))
            findings.extend(_eval_liability(d, document_id))
            findings.extend(_eval_payment(d, document_id))
            findings.extend(_eval_confidentiality(d, document_id))
            findings.extend(_eval_non_compete(d, document_id))
            findings.extend(_eval_governing_law(d, document_id))

        seen = set()
        unique_findings = []
        for f in findings:
            title = getattr(f, "risk_title", "")
            clause_txt = getattr(f, "clause_text", "")
            key = (title, clause_txt)
            if key not in seen:
                seen.add(key)
                unique_findings.append(f.to_dict() if hasattr(f, "to_dict") else f)
        return unique_findings
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Nodes — 12A / 12B / 12C
# ---------------------------------------------------------------------------

def analyzer_node(state: GraphState) -> dict:
    analysis = analyze_query(state["query"])
    intent = analysis.category if hasattr(analysis, "category") else str(analysis)
    return {"intent": intent}


def route_query(state: GraphState) -> Literal["rag_node", "risk_node", "summary_node"]:
    intent = state.get("intent", "general")
    if hasattr(intent, "category"):
        intent = intent.category
    elif isinstance(intent, dict):
        intent = intent.get("category", "general")
    if intent == "summary":
        return "summary_node"
    if intent == "risk":
        return "risk_node"
    return "rag_node"


def rag_node(state: GraphState) -> dict:
    return {
        "route_taken": "RAG Path",
        "retrieved_chunks": _retrieve(state["document_id"], state["query"], "RAG Path"),
    }


def risk_node(state: GraphState) -> dict:
    return {
        "route_taken": "Risk Path",
        "retrieved_chunks": _retrieve(state["document_id"], state["query"], "Risk Path"),
    }


def summary_node(state: GraphState) -> dict:
    return {
        "route_taken": "Summary Path",
        "retrieved_chunks": _retrieve(state["document_id"], state["query"], "Summary Path"),
    }


def evidence_checker_node(state: GraphState) -> dict:
    route = state.get("route_taken", "")
    intent = state.get("intent", "")
    if hasattr(intent, "category"):
        intent = intent.category
    elif isinstance(intent, dict):
        intent = intent.get("category", "")
    min_top = 0.38 if route == "Summary Path" else 0.42
    decision = check_evidence(
        state.get("retrieved_chunks") or [],
        min_top_score=min_top,
    )
    risk_findings: List[Dict[str, Any]] = []
    if decision.is_sufficient and (
        route == "Risk Path" or intent == "risk"
    ):
        risk_findings = _fetch_risk_findings(decision.filtered_chunks, state.get("document_id", "doc"))

    return {
        "evidence_sufficient": decision.is_sufficient,
        "evidence_reason": decision.reason,
        "evidence_top_score": decision.top_score,
        "evidence_passing_chunks": decision.passing_chunks,
        "filtered_chunks": decision.filtered_chunks,
        "risk_findings": risk_findings,
        "final_answer": None,
        "citations": [],
        "blocked_by_evidence_gate": not decision.is_sufficient,
        "citations_valid": False,
        "citation_validation_reason": "",
        "citation_support_score": 0.0,
        "citation_issues": [],
        "blocked_by_citation_gate": False,
        "validator_feedback": "",
        # do not reset regeneration_count here during regen cycles
    }


def evidence_router(state: GraphState) -> Literal["safe_response_node", "gemini_generation_node"]:
    if state.get("evidence_sufficient"):
        return "gemini_generation_node"
    return "safe_response_node"


def safe_response_node(state: GraphState) -> dict:
    # Evidence failure takes priority message; citation failure uses its own copy
    if state.get("blocked_by_citation_gate") and not state.get("blocked_by_evidence_gate"):
        msg = SAFE_RESPONSE_INVALID_CITATIONS
    else:
        msg = SAFE_RESPONSE_MESSAGE
    return {
        "final_answer": msg,
        "citations": [],
        "blocked_by_evidence_gate": bool(state.get("blocked_by_evidence_gate")),
        "citations_valid": False,
    }


def gemini_generation_node(state: GraphState) -> dict:
    feedback = state.get("validator_feedback") or None
    gen = generate_gemini_answer(
        query=state["query"],
        intent=state["intent"],
        route_taken=state["route_taken"],
        filtered_chunks=state.get("filtered_chunks") or [],
        risk_findings=state.get("risk_findings") or [],
        validator_feedback=feedback,
    )
    regen = int(state.get("regeneration_count") or 0)
    if feedback:
        regen += 1
    return {
        "final_answer": gen.get("answer"),
        "citations": gen.get("citations") or [],
        "blocked_by_evidence_gate": False,
        "regeneration_count": regen,
        "validator_feedback": "",  # consume feedback
    }


# ---------------------------------------------------------------------------
# Nodes — 12D Citation Validator
# ---------------------------------------------------------------------------

def citation_validator_node(state: GraphState) -> dict:
    result = validate_citations(
        answer=state.get("final_answer") or "",
        citations=state.get("citations") or [],
        filtered_chunks=state.get("filtered_chunks") or [],
    )

    payload = {
        "citations_valid": result.is_valid,
        "citation_validation_reason": result.reason,
        "citation_support_score": result.support_score,
        "citation_issues": result.issues,
        "blocked_by_citation_gate": not result.is_valid,
    }

    if result.is_valid:
        # Replace citations with cleaned / synthetic-valid set
        payload["citations"] = result.valid_citations
        payload["blocked_by_citation_gate"] = False
        return payload

    # Build feedback for optional regeneration
    issue_summary = ", ".join(result.issues[:8]) if result.issues else result.reason
    invalid_preview = []
    for ic in (result.invalid_citations or [])[:3]:
        invalid_preview.append(
            f"- excerpt={str(ic.get('excerpt', ''))[:80]!r} issues={ic.get('issues')}"
        )
    feedback = (
        f"Validation failed ({result.reason}). Issues: {issue_summary}. "
        f"Valid={result.valid_count}/{result.total_citations}. "
        f"Support score={result.support_score}. "
        f"Invalid examples:\n" + ("\n".join(invalid_preview) if invalid_preview else "n/a")
    )
    payload["validator_feedback"] = feedback
    # Keep only valid citations if we eventually safe-exit; gemini may overwrite on regen
    payload["citations"] = result.valid_citations
    return payload


def citation_router(
    state: GraphState,
) -> Literal["finalize_node", "gemini_generation_node", "citation_safe_response_node"]:
    if state.get("citations_valid"):
        return "finalize_node"

    regen = int(state.get("regeneration_count") or 0)
    if regen < MAX_REGENERATIONS:
        # One controlled regenerate with validator feedback
        return "gemini_generation_node"

    return "citation_safe_response_node"


def citation_safe_response_node(state: GraphState) -> dict:
    return {
        "final_answer": SAFE_RESPONSE_INVALID_CITATIONS,
        "citations": [],
        "citations_valid": False,
        "blocked_by_citation_gate": True,
    }


def finalize_node(state: GraphState) -> dict:
    """Pass-through sink after successful validation."""
    return {
        "blocked_by_citation_gate": False,
        "citations_valid": True,
    }


# ---------------------------------------------------------------------------
# Compile graph
# ---------------------------------------------------------------------------

workflow = StateGraph(GraphState)

workflow.add_node("analyzer", analyzer_node)
workflow.add_node("rag_node", rag_node)
workflow.add_node("risk_node", risk_node)
workflow.add_node("summary_node", summary_node)
workflow.add_node("evidence_checker", evidence_checker_node)
workflow.add_node("safe_response_node", safe_response_node)
workflow.add_node("gemini_generation_node", gemini_generation_node)
workflow.add_node("citation_validator", citation_validator_node)
workflow.add_node("citation_safe_response_node", citation_safe_response_node)
workflow.add_node("finalize_node", finalize_node)

workflow.set_entry_point("analyzer")
workflow.add_conditional_edges("analyzer", route_query)

workflow.add_edge("rag_node", "evidence_checker")
workflow.add_edge("risk_node", "evidence_checker")
workflow.add_edge("summary_node", "evidence_checker")

workflow.add_conditional_edges("evidence_checker", evidence_router)
workflow.add_edge("safe_response_node", END)

# 12C → 12D
workflow.add_edge("gemini_generation_node", "citation_validator")
workflow.add_conditional_edges("citation_validator", citation_router)
# regen loops back to gemini_generation_node (max 1)
workflow.add_edge("finalize_node", END)
workflow.add_edge("citation_safe_response_node", END)

agent_graph = workflow.compile()


def run_agent_graph(document_id: str, query: str) -> Dict[str, Any]:
    initial: GraphState = {
        "query": query,
        "document_id": document_id,
        "intent": "",
        "route_taken": "",
        **_empty_fields(),
    }
    final = agent_graph.invoke(initial)
    return {
        "query": final.get("query"),
        "document_id": final.get("document_id"),
        "intent": final.get("intent"),
        "route_taken": final.get("route_taken"),
        # 12B
        "evidence_sufficient": final.get("evidence_sufficient"),
        "evidence_reason": final.get("evidence_reason"),
        "evidence_top_score": final.get("evidence_top_score"),
        "evidence_passing_chunks": final.get("evidence_passing_chunks"),
        "blocked_by_evidence_gate": final.get("blocked_by_evidence_gate"),
        "filtered_chunk_count": len(final.get("filtered_chunks") or []),
        # 12C
        "final_answer": final.get("final_answer"),
        "citations": final.get("citations") or [],
        "risk_findings_count": len(final.get("risk_findings") or []),
        # 12D
        "citations_valid": final.get("citations_valid"),
        "citation_validation_reason": final.get("citation_validation_reason"),
        "citation_support_score": final.get("citation_support_score"),
        "citation_issues": final.get("citation_issues") or [],
        "regeneration_count": final.get("regeneration_count") or 0,
        "blocked_by_citation_gate": final.get("blocked_by_citation_gate"),
    }