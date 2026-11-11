"""
Risk Router — Part 09
Provides /risk/analyze, /risk/categories, and /risk/health endpoints.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import require_internal_api_key
from app.services.risk_service import analyze_document_risk, RiskAnalysisResult, LEGAL_DISCLAIMER

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/risk",
    tags=["Risk Analysis Engine"],
    dependencies=[Depends(require_internal_api_key)],
)


class ClauseInput(BaseModel):
    clause_type:   str
    text:          str
    page:          int = 1
    section:       str | None = None
    confidence:    float = 0.80


class RiskAnalyzeRequest(BaseModel):
    document_id: str = Field(..., description="MongoDB document ID")
    clauses:     list[ClauseInput] = Field(..., min_length=1)


class RiskFindingSchema(BaseModel):
    document_id:    str
    category:       str
    risk_title:     str
    risk_level:     str
    risk_score:     int
    clause_type:    str
    clause_text:    str
    page_number:    int
    section:        str | None
    explanation:    str
    recommendation: str
    evidence:       str


class RiskAnalyzeResponse(BaseModel):
    success:            bool
    document_id:        str
    overall_risk_score: int
    overall_risk_level: str
    total_risks_found:  int
    risk_breakdown:     dict
    category_counts:    dict
    findings:           list[RiskFindingSchema]
    disclaimer:         str
    summary:            str


@router.post("/analyze", response_model=RiskAnalyzeResponse)
async def analyze_risk(request: RiskAnalyzeRequest) -> RiskAnalyzeResponse:
    try:
        clauses_data = [c.model_dump() for c in request.clauses]
        res: RiskAnalysisResult = analyze_document_risk(clauses_data, request.document_id)

        return RiskAnalyzeResponse(
            success=True,
            document_id=res.document_id,
            overall_risk_score=res.overall_risk_score,
            overall_risk_level=res.overall_risk_level,
            total_risks_found=res.total_risks_found,
            risk_breakdown=res.risk_breakdown,
            category_counts=res.category_counts,
            findings=[RiskFindingSchema(**f.to_dict()) for f in res.findings],
            disclaimer=res.disclaimer,
            summary=res.summary,
        )
    except Exception as e:
        logger.error(f"Risk analysis endpoint failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories")
async def list_risk_categories():
    return {
        "categories": [
            "termination", "liability", "payment", "confidentiality",
            "non_compete", "governing_law", "intellectual_property",
            "dispute_resolution", "force_majeure", "obligation_balance"
        ],
        "disclaimer": LEGAL_DISCLAIMER,
    }


@router.get("/health")
async def risk_health():
    return {
        "status": "operational",
        "parts_complete": ["01", "02", "03", "04", "05", "06", "07", "08", "09"],
    }