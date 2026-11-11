"""
Text Extraction Router — Part 06
Provides /extraction/extract endpoint for Node.js backend.
"""

import logging
from pathlib import Path

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import require_internal_api_key
from app.services.extraction_service import extract_text, ExtractionResult

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/extraction",
    tags=["Text Extraction"],
    dependencies=[Depends(require_internal_api_key)],
)


# ─────────────────────────────────────────────
# Request / Response schemas
# ─────────────────────────────────────────────

class ExtractionRequest(BaseModel):
    document_id:       str = Field(..., description="MongoDB document ID")
    file_path:         str = Field(..., description="Absolute path to the uploaded file")
    file_format:       str = Field(..., description="pdf | docx | txt")
    detected_language: str = Field(
        default="en",
        description="Language code from Part 05 detection (en | hi | gu)"
    )


class ChunkSchema(BaseModel):
    document_id:       str
    chunk_index:       int
    page:              int
    section:           str | None
    section_title:     str | None
    text:              str
    char_count:        int
    word_count:        int
    extraction_method: str


class ExtractionResponse(BaseModel):
    success:           bool
    document_id:       str
    file_format:       str
    extraction_method: str
    total_pages:       int
    total_chunks:      int
    total_words:       int
    total_chars:       int
    chunks:            list[ChunkSchema]
    warnings:          list[str]


class ExtractionHealthResponse(BaseModel):
    status:             str
    supported_formats:  list[str]
    ocr_available:      bool
    parts_complete:     list[str]


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.post(
    "/extract",
    response_model=ExtractionResponse,
    summary="Extract text from uploaded document",
    description=(
        "Extracts structured text chunks from PDF (digital + scanned), "
        "DOCX, or TXT files. Returns chunks with page, section, and "
        "citation metadata."
    ),
)
async def extract_document_text(
    request: ExtractionRequest,
) -> ExtractionResponse:
    """
    Extract text from an uploaded document.
    Called by Node.js backend after file upload and language detection.
    """
    try:
        logger.info(
            f"Extraction requested: document_id={request.document_id} | "
            f"format={request.file_format} | language={request.detected_language}"
        )

        # Validate file exists
        file_path = Path(request.file_path)
        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": "FILE_NOT_FOUND",
                    "message": f"File not found at path: {request.file_path}",
                    "document_id": request.document_id,
                },
            )

        # Run extraction
        result: ExtractionResult = extract_text(
            file_path=file_path,
            document_id=request.document_id,
            file_format=request.file_format,
            detected_language=request.detected_language,
        )

        return ExtractionResponse(
            success=True,
            document_id=result.document_id,
            file_format=result.file_format,
            extraction_method=result.extraction_method,
            total_pages=result.total_pages,
            total_chunks=result.total_chunks,
            total_words=result.total_words,
            total_chars=result.total_chars,
            chunks=[ChunkSchema(**c.to_dict()) for c in result.chunks],
            warnings=result.warnings,
        )

    except HTTPException:
        raise

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "INVALID_REQUEST",
                "message": str(e),
                "document_id": request.document_id,
            },
        )

    except Exception as e:
        logger.error(
            f"Extraction failed for document {request.document_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "EXTRACTION_FAILED",
                "message": str(e),
                "document_id": request.document_id,
            },
        )


@router.get(
    "/health",
    response_model=ExtractionHealthResponse,
    summary="Extraction service health",
)
async def extraction_health() -> ExtractionHealthResponse:
    """Check extraction service status and available features."""

    # Check if EasyOCR + pdf2image are importable
    ocr_available = False
    try:
        import easyocr      # noqa: F401
        import pdf2image    # noqa: F401
        ocr_available = True
    except ImportError:
        pass

    return ExtractionHealthResponse(
        status="operational",
        supported_formats=["pdf", "docx", "txt"],
        ocr_available=ocr_available,
        parts_complete=["01", "02", "03", "04", "05", "06"],
    )