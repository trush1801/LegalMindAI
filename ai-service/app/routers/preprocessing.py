"""
Preprocessing Router — Part 07
Provides /preprocessing/process endpoint for Node.js backend.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import require_internal_api_key
from app.services.extraction_service import TextChunk
from app.services.preprocessing_service import (
    preprocess_chunks,
    clean_text,
    PreprocessingResult,
    TARGET_WORDS, MIN_WORDS, MAX_WORDS, OVERLAP_WORDS,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/preprocessing",
    tags=["Text Preprocessing"],
    dependencies=[Depends(require_internal_api_key)],
)


# ─────────────────────────────────────────────
# Request / Response schemas
# ─────────────────────────────────────────────

class RawChunkInput(BaseModel):
    """Schema matching TextChunk from Part 06."""
    document_id:       str
    chunk_index:       int
    page:              int
    section:           str | None = None
    section_title:     str | None = None
    text:              str
    char_count:        int
    word_count:        int
    extraction_method: str


class PreprocessRequest(BaseModel):
    document_id:    str = Field(..., description="MongoDB document ID")
    language_code:  str = Field(default="en", description="en | hi | gu")
    chunks:         list[RawChunkInput] = Field(
        ..., description="Raw chunks from Part 06 extraction"
    )


class ProcessedChunkSchema(BaseModel):
    document_id:        str
    chunk_index:        int
    page:               int
    section:            str | None
    section_title:      str | None
    text:               str
    char_count:         int
    word_count:         int
    extraction_method:  str
    has_overlap:        bool
    overlap_word_count: int
    source_chunk_index: int


class PreprocessResponse(BaseModel):
    success:              bool
    document_id:          str
    total_input_chunks:   int
    total_output_chunks:  int
    total_words:          int
    total_chars:          int
    cleaning_stats:       dict
    chunks:               list[ProcessedChunkSchema]


class CleanTextRequest(BaseModel):
    text:          str = Field(..., description="Raw text to clean")
    language_code: str = Field(default="en")


class CleanTextResponse(BaseModel):
    original_text:   str
    cleaned_text:    str
    original_length: int
    cleaned_length:  int
    chars_removed:   int


class PreprocessingConfigResponse(BaseModel):
    target_words:  int
    min_words:     int
    max_words:     int
    overlap_words: int
    description:   str


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.post(
    "/process",
    response_model=PreprocessResponse,
    summary="Preprocess extracted text chunks",
    description=(
        "Cleans and resizes raw text chunks from Part 06. "
        "Removes noise, normalizes text, enforces chunk sizes, "
        "and injects overlap for RAG context continuity."
    ),
)
async def preprocess_document_chunks(
    request: PreprocessRequest,
) -> PreprocessResponse:
    """
    Preprocess chunks from Part 06.
    Called by Node.js backend after text extraction.
    """
    try:
        logger.info(
            f"Preprocessing {len(request.chunks)} chunks for "
            f"document {request.document_id} | language={request.language_code}"
        )

        if not request.chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "NO_CHUNKS",
                    "message": "No chunks provided for preprocessing",
                    "document_id": request.document_id,
                },
            )

        # Convert Pydantic models → TextChunk dataclasses
        raw_chunks = [
            TextChunk(
                document_id=c.document_id,
                chunk_index=c.chunk_index,
                page=c.page,
                section=c.section,
                section_title=c.section_title,
                text=c.text,
                char_count=c.char_count,
                word_count=c.word_count,
                extraction_method=c.extraction_method,
            )
            for c in request.chunks
        ]

        # Run preprocessing
        result: PreprocessingResult = preprocess_chunks(
            chunks=raw_chunks,
            document_id=request.document_id,
            language_code=request.language_code,
        )

        return PreprocessResponse(
            success=True,
            document_id=result.document_id,
            total_input_chunks=result.total_input_chunks,
            total_output_chunks=result.total_output_chunks,
            total_words=result.total_words,
            total_chars=result.total_chars,
            cleaning_stats=result.cleaning_stats,
            chunks=[
                ProcessedChunkSchema(**c.to_dict())
                for c in result.chunks
            ],
        )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(
            f"Preprocessing failed for {request.document_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "PREPROCESSING_FAILED",
                "message": str(e),
                "document_id": request.document_id,
            },
        )


@router.post(
    "/clean-text",
    response_model=CleanTextResponse,
    summary="Clean a single text string",
    description="Run the cleaning pipeline on a raw text string. Useful for testing.",
)
async def clean_single_text(
    request: CleanTextRequest,
) -> CleanTextResponse:
    """Clean a single text string — useful for debugging and testing."""
    try:
        cleaned = clean_text(request.text, request.language_code)
        return CleanTextResponse(
            original_text=request.text,
            cleaned_text=cleaned,
            original_length=len(request.text),
            cleaned_length=len(cleaned),
            chars_removed=len(request.text) - len(cleaned),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "CLEAN_FAILED", "message": str(e)},
        )


@router.get(
    "/config",
    response_model=PreprocessingConfigResponse,
    summary="Get chunking configuration",
)
async def get_preprocessing_config() -> PreprocessingConfigResponse:
    """Return the current chunking configuration."""
    return PreprocessingConfigResponse(
        target_words=TARGET_WORDS,
        min_words=MIN_WORDS,
        max_words=MAX_WORDS,
        overlap_words=OVERLAP_WORDS,
        description=(
            f"Chunks target {TARGET_WORDS} words. "
            f"Below {MIN_WORDS} words → merged. "
            f"Above {MAX_WORDS} words → split at sentence boundary. "
            f"{OVERLAP_WORDS}-word overlap between consecutive chunks for RAG."
        ),
    )


@router.get(
    "/health",
    summary="Preprocessing service health",
)
async def preprocessing_health():
    return {
        "status": "operational",
        "parts_complete": ["01", "02", "03", "04", "05", "06", "07"],
        "chunking_config": {
            "target_words":  TARGET_WORDS,
            "min_words":     MIN_WORDS,
            "max_words":     MAX_WORDS,
            "overlap_words": OVERLAP_WORDS,
        },
    }