# ai-service/app/routers/query.py

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.middleware.auth import require_internal_api_key
from app.services.graph_service import run_agent_graph
from app.services.query_service import analyze_query

router = APIRouter(
    prefix="/query",
    tags=["Query & RAG"],
    dependencies=[Depends(require_internal_api_key)],
)


class AskQueryRequest(BaseModel):
    document_id: str = Field(..., min_length=1)
    query: str = Field(..., min_length=1)


@router.post("/router-test")
async def test_langgraph_router(req: AskQueryRequest) -> Dict[str, Any]:
    """
    Part 12A + 12B test endpoint.
    Runs: Analyzer → Path Router → FAISS retrieve → Evidence Checker → Safe | Gemini stub.
    """
    try:
        result = run_agent_graph(req.document_id, req.query)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph execution failed: {e}") from e


@router.post("/ask")
async def ask_question(req: AskQueryRequest) -> Dict[str, Any]:
    """
    Primary ask endpoint — same graph as router-test.
    Part 12C will replace the Gemini stub with real generation.
    """
    try:
        result = run_agent_graph(req.document_id, req.query)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG processing failed: {e}") from e


@router.get("/categories")
async def list_categories() -> Dict[str, Any]:
    return {
        "success": True,
        "data": {
            "intents": ["risk", "clause", "summary", "date", "general"],
            "routes": ["RAG Path", "Risk Path", "Summary Path"],
            "evidence_gate": True,
        },
    }

@router.get("/health")
async def query_health() -> Dict[str, Any]:
    return {
        "status": "healthy",
        "service": "LangGraph Router + Evidence Checker + Gemini + Citation Validator",
        "parts_complete": ["12A", "12B", "12C", "12D"],
        "analyzer_smoke": analyze_query("what is the risk of early termination"),
    }