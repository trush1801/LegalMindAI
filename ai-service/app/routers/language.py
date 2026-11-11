"""
Language Detection Router — Part 05
Provides the /language/detect endpoint for the Node.js backend to call.
"""

import logging
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import require_internal_api_key
from app.services.language_service import (
    detect_language,
    prepare_text_for_pipeline,
    SUPPORTED_LANGUAGES,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/language",
    tags=["Language Detection"],
    dependencies=[Depends(require_internal_api_key)],
)


# ─────────────────────────────────────────────
# Request / Response schemas
# ─────────────────────────────────────────────

class LanguageDetectRequest(BaseModel):
    """Request body for language detection."""
    text: str = Field(
        ...,
        description="Text content to detect language from",
        min_length=1,
    )
    document_id: str = Field(
        ...,
        description="Document ID this text belongs to",
    )
    prepare_text: bool = Field(
        default=True,
        description="Whether to return prepared/cleaned text alongside detection result",
    )


class LanguageDetectResponse(BaseModel):
    """Response from language detection."""
    document_id: str
    detected_language: str
    language_name: str
    confidence: float
    is_supported: bool
    script: str
    detection_method: str
    processing_note: str
    raw_scores: list
    prepared_text: str | None = None
    success: bool = True


class SupportedLanguagesResponse(BaseModel):
    """List of supported languages."""
    supported_languages: dict
    count: int


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.post(
    "/detect",
    response_model=LanguageDetectResponse,
    summary="Detect language of document text",
    description=(
        "Detects whether text is English, Hindi, or Gujarati. "
        "Returns language metadata and optionally the prepared text "
        "ready for the NLP pipeline."
    ),
)
async def detect_document_language(
    request: LanguageDetectRequest,
) -> LanguageDetectResponse:
    """
    Detect language of provided text.

    Called by Node.js backend after text extraction (Part 06).
    Currently also callable directly with raw text for testing.
    """
    try:
        logger.info(
            f"Language detection requested for document: {request.document_id} "
            f"(text length: {len(request.text)} chars)"
        )

        # Run detection
        result = detect_language(request.text)

        # Prepare text if requested
        prepared_text = None
        if request.prepare_text:
            prepared_text = prepare_text_for_pipeline(
                request.text,
                result.detected_language,
            )

        return LanguageDetectResponse(
            document_id=request.document_id,
            detected_language=result.detected_language,
            language_name=result.language_name,
            confidence=result.confidence,
            is_supported=result.is_supported,
            script=result.script,
            detection_method=result.detection_method,
            processing_note=result.processing_note,
            raw_scores=result.raw_scores,
            prepared_text=prepared_text,
            success=True,
        )

    except Exception as e:
        logger.error(
            f"Language detection failed for document {request.document_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "LANGUAGE_DETECTION_FAILED",
                "message": str(e),
                "document_id": request.document_id,
            },
        )


@router.get(
    "/supported",
    response_model=SupportedLanguagesResponse,
    summary="List supported languages",
    description="Returns the list of languages LegalMind AI currently supports.",
)
async def get_supported_languages() -> SupportedLanguagesResponse:
    """Return the supported language list."""
    return SupportedLanguagesResponse(
        supported_languages=SUPPORTED_LANGUAGES,
        count=len(SUPPORTED_LANGUAGES),
    )