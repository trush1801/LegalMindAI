"""
Vector & Summary Router — Part 10
Provides endpoints for FAISS vector indexing, vector similarity search, and document summary generation.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import require_internal_api_key
from app.services.summary_service import generate_document_summary, DocumentSummary
from app.services.vector_service import (
    create_and_save_faiss_index,
    search_faiss_index,
    VectorSearchResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/vector",
    tags=["Vector Storage & Summarization"],
    dependencies=[Depends(require_internal_api_key)],
)


class ChunkIndexInput(BaseModel):
    chunk_index:    int
    page:           int = 1
    section:        str | None = None
    section_title:  str | None = None
    text:           str
    clause_type:    str | None = None


class IndexRequest(BaseModel):
    document_id: str = Field(..., description="MongoDB document ID")
    chunks:      list[ChunkIndexInput] = Field(..., min_length=1)


class IndexResponse(BaseModel):
    success:         bool
    document_id:     str
    total_vectors:   int
    embedding_dim:   int
    index_file_path: str


class SearchRequest(BaseModel):
    document_id: str = Field(..., description="MongoDB document ID")
    query:       str = Field(..., min_length=1, description="Natural language search query")
    top_k:       int = Field(default=5, ge=1, le=20)


class SearchResultSchema(BaseModel):
    chunk_id:          str
    document_id:       str
    chunk_index:       int
    page:              int
    section:           str | None
    section_title:     str | None
    text:              str
    clause_type:       str | None
    score:             float


class SearchResponse(BaseModel):
    success:       bool
    document_id:   str
    query:         str
    total_results: int
    results:       list[SearchResultSchema]


@router.post("/index", response_model=IndexResponse)
async def index_document_vectors(request: IndexRequest) -> IndexResponse:
    try:
        chunks_data = [c.model_dump() for c in request.chunks]
        res = create_and_save_faiss_index(request.document_id, chunks_data)

        return IndexResponse(
            success=True,
            document_id=res["document_id"],
            total_vectors=res["total_vectors"],
            embedding_dim=res["embedding_dim"],
            index_file_path=res["index_file_path"],
        )
    except Exception as e:
        logger.error(f"FAISS indexing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search", response_model=SearchResponse)
async def search_document_vectors(request: SearchRequest) -> SearchResponse:
    try:
        results: list[VectorSearchResult] = search_faiss_index(
            document_id=request.document_id,
            query=request.query,
            top_k=request.top_k,
        )

        return SearchResponse(
            success=True,
            document_id=request.document_id,
            query=request.query,
            total_results=len(results),
            results=[SearchResultSchema(**r.to_dict()) for r in results],
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"FAISS vector search failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def vector_health():
    return {
        "status": "operational",
        "embedding_model": "all-MiniLM-L6-v2 (384-dim)",
        "vector_store": "FAISS",
        "parts_complete": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"],
    }