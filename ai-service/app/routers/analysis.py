"""
Analysis Router — Part 08
Provides /analysis/ner, /analysis/clauses, /analysis/full endpoints.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import require_internal_api_key
from app.services.preprocessing_service import ProcessedChunk
from app.services.ner_service import extract_entities, NERResult
from app.services.clause_service import extract_clauses, ClauseResult, CLAUSE_TYPES

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/analysis",
    tags=["Document Analysis — NER + Legal-BERT Clauses"],
    dependencies=[Depends(require_internal_api_key)],
)


class ChunkInput(BaseModel):
    document_id:        str
    chunk_index:        int
    page:               int
    section:            str | None = None
    section_title:      str | None = None
    text:               str
    char_count:         int = 0
    word_count:         int = 0
    extraction_method:  str = "unknown"
    has_overlap:        bool = False
    overlap_word_count: int = 0
    source_chunk_index: int = 0


class AnalysisRequest(BaseModel):
    document_id:    str = Field(..., description="MongoDB document ID")
    language_code:  str = Field(default="en")
    chunks:         list[ChunkInput] = Field(..., min_length=1)
    use_legal_bert: bool = Field(default=True, description="Enable Legal-BERT classification")


class EntitySchema(BaseModel):
    text:               str
    label:              str
    entity_type:        str
    start:              int
    end:                int
    page:               int
    section:            str | None
    confidence:         float
    source_chunk_index: int
    detection_method:   str


class ClauseSchema(BaseModel):
    clause_type:        str
    text:               str
    page:               int
    section:            str | None
    section_title:      str | None
    confidence:         float
    start_chunk_index:  int
    end_chunk_index:    int
    word_count:         int
    matched_keywords:   list[str]
    entities_in_clause: list[str]
    detection_method:   str


class FullAnalysisResponse(BaseModel):
    success:         bool
    document_id:     str
    entities:        list[EntitySchema]
    parties:         list[str]
    dates:           list[str]
    amounts:         list[str]
    obligations:     list[str]
    jurisdictions:   list[str]
    laws:            list[str]
    total_entities:  int
    ner_stats:       dict
    clauses:         list[ClauseSchema]
    clauses_by_type: dict
    total_clauses:   int
    clause_stats:    dict
    pipeline_stage:  str = "analysis"


class NERResponse(BaseModel):
    success:        bool
    document_id:    str
    entities:       list[EntitySchema]
    parties:        list[str]
    dates:          list[str]
    amounts:        list[str]
    obligations:    list[str]
    jurisdictions:  list[str]
    laws:           list[str]
    total_entities: int
    stats:          dict


class ClauseResponse(BaseModel):
    success:         bool
    document_id:     str
    clauses:         list[ClauseSchema]
    clauses_by_type: dict
    total_clauses:   int
    stats:           dict


def _to_processed_chunks(chunks: list[ChunkInput]) -> list[ProcessedChunk]:
    return [
        ProcessedChunk(
            document_id=c.document_id,
            chunk_index=c.chunk_index,
            page=c.page,
            section=c.section,
            section_title=c.section_title,
            text=c.text,
            char_count=c.char_count or len(c.text),
            word_count=c.word_count or len(c.text.split()),
            extraction_method=c.extraction_method,
            has_overlap=c.has_overlap,
            overlap_word_count=c.overlap_word_count,
            source_chunk_index=c.source_chunk_index,
        )
        for c in chunks
    ]


@router.post("/full", response_model=FullAnalysisResponse)
async def run_full_analysis(request: AnalysisRequest) -> FullAnalysisResponse:
    try:
        chunks = _to_processed_chunks(request.chunks)

        ner_res: NERResult = extract_entities(chunks, request.document_id, request.language_code)
        clause_res: ClauseResult = extract_clauses(
            chunks, request.document_id, ner_res.entities, request.language_code, request.use_legal_bert
        )

        return FullAnalysisResponse(
            success=True,
            document_id=request.document_id,
            entities=[EntitySchema(**e.to_dict()) for e in ner_res.entities],
            parties=ner_res.parties,
            dates=ner_res.dates,
            amounts=ner_res.amounts,
            obligations=ner_res.obligations,
            jurisdictions=ner_res.jurisdictions,
            laws=ner_res.laws,
            total_entities=ner_res.total_entities,
            ner_stats=ner_res.stats,
            clauses=[ClauseSchema(**c.to_dict()) for c in clause_res.clauses],
            clauses_by_type=clause_res.clauses_by_type,
            total_clauses=clause_res.total_clauses,
            clause_stats=clause_res.stats,
        )
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ner", response_model=NERResponse, summary="Run NER only")
async def run_ner(request: AnalysisRequest) -> NERResponse:
    try:
        chunks = _to_processed_chunks(request.chunks)
        res: NERResult = extract_entities(chunks, request.document_id, request.language_code)
        return NERResponse(
            success=True,
            document_id=res.document_id,
            entities=[EntitySchema(**e.to_dict()) for e in res.entities],
            parties=res.parties,
            dates=res.dates,
            amounts=res.amounts,
            obligations=res.obligations,
            jurisdictions=res.jurisdictions,
            laws=res.laws,
            total_entities=res.total_entities,
            stats=res.stats,
        )
    except Exception as e:
        logger.error(f"NER failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clauses", response_model=ClauseResponse, summary="Run clause extraction only")
async def run_clauses(request: AnalysisRequest) -> ClauseResponse:
    try:
        chunks = _to_processed_chunks(request.chunks)
        res: ClauseResult = extract_clauses(
            chunks, request.document_id, None, request.language_code, request.use_legal_bert
        )
        return ClauseResponse(
            success=True,
            document_id=res.document_id,
            clauses=[ClauseSchema(**c.to_dict()) for c in res.clauses],
            clauses_by_type=res.clauses_by_type,
            total_clauses=res.total_clauses,
            stats=res.stats,
        )
    except Exception as e:
        logger.error(f"Clause extraction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/clause-types")
async def list_clause_types():
    return {"clause_types": CLAUSE_TYPES, "count": len(CLAUSE_TYPES)}


@router.get("/health")
async def analysis_health():
    from app.services.clause_service import _legal_bert_available
    spacy_ok = False
    try:
        from app.services.ner_service import _get_nlp
        _get_nlp()
        spacy_ok = True
    except Exception:
        pass
    return {
        "status":           "operational",
        "spacy_loaded":     spacy_ok,
        "legal_bert_loaded": _legal_bert_available is True,
        "clause_types":     CLAUSE_TYPES,
        "parts_complete":   ["01", "02", "03", "04", "05", "06", "07", "08"],
    }