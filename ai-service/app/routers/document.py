"""
Document Processing Router — Parts 04–10
Part 09 adds: Risk Analysis Engine after NER + Clause extraction.
Part 10 adds: Document Summarization + FAISS Vector Indexing.
"""

import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.config.settings import settings
from app.middleware.auth import require_internal_api_key
from app.services.language_service import detect_language, prepare_text_for_pipeline
from app.services.extraction_service import extract_text
from app.services.preprocessing_service import preprocess_chunks
from app.services.ner_service import extract_entities
from app.services.clause_service import extract_clauses, evaluate_missing_provisions
from app.services.risk_service import analyze_document_risk, LEGAL_DISCLAIMER
from app.services.summary_service import generate_document_summary
from app.services.vector_service import create_and_save_faiss_index
from app.services.classification_service import classify_document

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/documents",
    tags=["Document Processing"],
    dependencies=[Depends(require_internal_api_key)],
)


# ─────────────────────────────────────────────
# Response schemas
# ─────────────────────────────────────────────

class ChunkSummary(BaseModel):
    chunk_index:        int
    page:               int
    section:            str | None
    word_count:         int
    has_overlap:        bool
    extraction_method:  str


class ProcessingResponse(BaseModel):
    success:               bool
    document_id:           str
    message:               str
    file_saved:            bool
    # Part 05 — Language
    detected_language:     str | None = None
    language_name:         str | None = None
    language_confidence:   float | None = None
    is_language_supported: bool | None = None
    # Classification
    classification:        dict = {}
    # Part 06 — Extraction
    extraction_method:     str | None = None
    total_pages:           int | None = None
    # Part 07 — Preprocessing
    raw_chunks:            int | None = None
    processed_chunks:      int | None = None
    total_words:           int | None = None
    raw_word_count:        int | None = None
    total_chars:           int | None = None
    cleaning_stats:        dict = {}
    chunk_preview:         list = []
    # Part 08 — Analysis
    parties:               list[str] = []
    structured_parties:    list = []
    dates:                 list[str] = []
    structured_dates:      list = []
    amounts:               list[str] = []
    structured_finances:   list = []
    total_entities:        int | None = None
    total_clauses:         int | None = None
    clauses_by_type:       dict = {}
    clause_preview:        list = []
    clauses:               list = []
    missing_provisions:    list = []
    # Part 09 — Risk Engine
    overall_risk_score:    int = 0
    overall_risk_level:    str = "low"
    total_risks_found:     int = 0
    risk_findings:         list = []
    disclaimer:            str | None = None
    # Part 10 — Summary & Vectors
    plain_summary:         str = ""
    key_points:            list[str] = []
    obligations:           list = []
    structured_obligations: list = []
    important_dates:       list = []
    faiss_index_path:      str | None = None
    pipeline_stage:        str = "completed"


class DocumentHealthResponse(BaseModel):
    status:          str
    pipeline_stages: list[str]
    parts_complete:  list[str]


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.post(
    "/process",
    response_model=ProcessingResponse,
    summary="Process uploaded document",
)
async def process_document(
    file: UploadFile = File(...),
    document_id: str = Form(...),
    user_id: str = Form(...),
    document_type: str = Form(...),
    original_name: str = Form(...),
    file_format: str = Form(...),
) -> ProcessingResponse:
    """
    Full pipeline: Save → Language → Extract → Preprocess → Analyse → Risk → Summary → FAISS
    Part 04: Save file
    Part 05: Language detection
    Part 06: Text extraction → raw chunks
    Part 07: Preprocessing → clean, sized chunks with overlap
    Part 08: NER + Clause extraction
    Part 09: Risk Analysis Engine
    Part 10: Document Summarization + FAISS Vector Indexing
    """

    logger.info(
        f"Processing: {document_id} | user={user_id} | "
        f"type={document_type} | format={file_format}"
    )

    # ── Save file ─────────────────────────────────────────────────
    user_storage_dir = Path(settings.UPLOAD_DIR) / user_id
    user_storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = user_storage_dir / original_name

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"File saved: {file_path}")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "FILE_SAVE_FAILED", "message": str(e)},
        )

    # ── Language Detection (Part 05) ──────────────────────────────
    detected_language     = "en"
    language_name         = "English"
    language_confidence   = None
    is_language_supported = True

    try:
        if file_format.lower() == "txt":
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                raw_text = f.read()
            if raw_text.strip():
                lang_result           = detect_language(raw_text)
                detected_language     = lang_result.detected_language
                language_name         = lang_result.language_name
                language_confidence   = lang_result.confidence
                is_language_supported = lang_result.is_supported
    except Exception as e:
        logger.warning(f"Language detection error: {e}")

    # ── Text Extraction (Part 06) ─────────────────────────────────
    extraction_result  = None
    extraction_method  = None
    total_pages        = None

    try:
        extraction_result = extract_text(
            file_path=file_path,
            document_id=document_id,
            file_format=file_format,
            detected_language=detected_language,
        )

        extraction_method = extraction_result.extraction_method
        total_pages       = extraction_result.total_pages

        # Post-extraction language detection for PDF/DOCX
        if file_format.lower() in ("pdf", "docx") and extraction_result.chunks:
            sample_text = " ".join(
                c.text for c in extraction_result.chunks[:10]
            )[:2000]
            if sample_text.strip():
                lang_result           = detect_language(sample_text)
                detected_language     = lang_result.detected_language
                language_name         = lang_result.language_name
                language_confidence   = lang_result.confidence
                is_language_supported = lang_result.is_supported

    except Exception as e:
        logger.error(f"Extraction failed: {e}", exc_info=True)

    # ── Preprocessing (Part 07) ───────────────────────────────────
    processed_chunks   = []
    raw_chunk_count    = 0
    total_words        = 0
    total_chars        = 0
    cleaning_stats     = {}
    chunk_preview      = []

    try:
        if extraction_result and extraction_result.chunks:
            raw_chunk_count = len(extraction_result.chunks)

            preprocess_result = preprocess_chunks(
                chunks=extraction_result.chunks,
                document_id=document_id,
                language_code=detected_language,
            )

            processed_chunks = preprocess_result.chunks
            total_words      = preprocess_result.total_words
            total_chars      = preprocess_result.total_chars
            cleaning_stats   = preprocess_result.cleaning_stats

            # Build preview (first 5)
            chunk_preview = [
                ChunkSummary(
                    chunk_index=c.chunk_index,
                    page=c.page,
                    section=c.section,
                    word_count=c.word_count,
                    has_overlap=c.has_overlap,
                    extraction_method=c.extraction_method,
                )
                for c in processed_chunks[:5]
            ]

            logger.info(
                f"Preprocessing complete: {raw_chunk_count} → "
                f"{len(processed_chunks)} chunks | {total_words} words"
            )

    except Exception as e:
        logger.error(f"Preprocessing failed: {e}", exc_info=True)

    # ── Document Classification ──────────────────────────────────
    classification_dict = {}
    try:
        sample_chunks = processed_chunks or (extraction_result.chunks if extraction_result else [])
        full_text_sample = " ".join(c.text for c in sample_chunks[:10])
        clf_res = classify_document(
            text=full_text_sample,
            filename=original_name,
            chunks=[c.to_dict() for c in processed_chunks] if processed_chunks else None,
        )
        classification_dict = clf_res.to_dict()
        logger.info(f"Classification: {clf_res.primary_category} / {clf_res.subtype} (conf={clf_res.confidence})")
    except Exception as e:
        logger.error(f"Classification failed: {e}", exc_info=True)

    # ── Analysis Stage (Part 08) ─────────────────────────
    parties, dates, amounts = [], [], []
    structured_parties, structured_dates, structured_finances = [], [], []
    total_entities, total_clauses = 0, 0
    clauses_by_type, clause_preview, all_clauses = {}, [], []
    missing_provisions = []
    ner_res = None
    clause_res = None   # hoisted so risk stage can access it

    try:
        if processed_chunks:
            ner_res    = extract_entities(processed_chunks, document_id, detected_language)
            clause_res = extract_clauses(
                processed_chunks, document_id, ner_res.entities, detected_language, True
            )

            parties             = ner_res.parties
            structured_parties  = [p.to_dict() for p in ner_res.structured_parties]
            dates               = ner_res.dates
            structured_dates    = [d.to_dict() for d in ner_res.structured_dates]
            amounts             = ner_res.amounts
            structured_finances = [f.to_dict() for f in ner_res.structured_finances]
            total_entities      = ner_res.total_entities
            total_clauses       = clause_res.total_clauses
            clauses_by_type     = clause_res.clauses_by_type
            all_clauses         = [c.to_dict() for c in clause_res.clauses]

            missing_provisions  = evaluate_missing_provisions(
                all_clauses,
                classification_dict.get("subtype", "software_development_agreement"),
            )

            clause_preview = [
                {
                    "clause_type": c.clause_type,
                    "page":        c.page,
                    "section":     c.section,
                    "confidence":  c.confidence,
                    "text":        c.text[:200],
                }
                for c in clause_res.clauses[:8]
            ]

            logger.info(
                f"Analysis complete: {total_entities} entities | {total_clauses} clauses"
            )
    except Exception as e:
        logger.error(f"Analysis stage error: {e}", exc_info=True)

    # ── Risk Analysis Stage (Part 09) ────────────────────
    overall_risk_score = 0
    overall_risk_level = "low"
    risk_findings = []
    total_risks_found = 0

    try:
        if clause_res and clause_res.clauses:
            clauses_dicts = [c.to_dict() for c in clause_res.clauses]
            risk_res = analyze_document_risk(clauses_dicts, document_id)

            overall_risk_score = risk_res.overall_risk_score
            overall_risk_level = risk_res.overall_risk_level
            risk_findings      = [f.to_dict() for f in risk_res.findings]
            total_risks_found  = risk_res.total_risks_found

            logger.info(
                f"Risk Analysis complete: score={overall_risk_score}/100 | "
                f"level={overall_risk_level} | risks={len(risk_findings)}"
            )
    except Exception as e:
        logger.error(f"Risk analysis stage error: {e}", exc_info=True)

    # ── Summary & FAISS Vector Indexing Stage (Part 10) ───────────
    plain_summary          = ""
    key_points             = []
    obligations            = []
    structured_obligations = []
    important_dates        = []
    faiss_index_path       = None

    try:
        if processed_chunks:
            # 1. Generate Structured Summary
            summary_res = generate_document_summary(
                document_id=document_id,
                document_type=classification_dict.get("primary_category", document_type),
                chunks=[c.to_dict() for c in processed_chunks],
                parties=parties,
                dates=dates,
                amounts=amounts,
                clauses=[c.to_dict() for c in (clause_res.clauses if clause_res else [])],
                risk_score=overall_risk_score,
                risk_level=overall_risk_level,
            )

            plain_summary          = summary_res.plain_language_summary
            key_points             = summary_res.key_points
            obligations            = summary_res.obligations
            structured_obligations = getattr(summary_res, "structured_obligations", [])
            important_dates        = summary_res.important_dates

            # 2. Embed Chunks & Build FAISS Vector Index
            faiss_res = create_and_save_faiss_index(
                document_id=document_id,
                chunks=[c.to_dict() for c in processed_chunks],
            )
            faiss_index_path = faiss_res["index_file_path"]

            logger.info(
                f"Part 10 complete for {document_id}: Summary generated | "
                f"FAISS index saved at {faiss_index_path}"
            )
    except Exception as e:
        logger.error(f"Part 10 Summary/FAISS stage error: {e}", exc_info=True)

    return ProcessingResponse(
        success=True,
        document_id=document_id,
        message=(
            f"Pipeline complete through Part 10. Language: {language_name}. "
            f"Entities: {total_entities}. Clauses: {total_clauses}. "
            f"Risk: {overall_risk_score}/100 ({overall_risk_level}). "
            f"FAISS: {'indexed' if faiss_index_path else 'skipped'}."
        ),
        file_saved=True,
        detected_language=detected_language,
        language_name=language_name,
        language_confidence=language_confidence,
        is_language_supported=is_language_supported,
        classification=classification_dict,
        extraction_method=extraction_method,
        total_pages=total_pages,
        raw_chunks=raw_chunk_count,
        processed_chunks=len(processed_chunks),
        total_words=total_words,
        raw_word_count=getattr(extraction_result, "raw_word_count", total_words) if extraction_result else total_words,
        total_chars=total_chars,
        cleaning_stats=cleaning_stats,
        chunk_preview=chunk_preview,
        parties=parties,
        structured_parties=structured_parties,
        dates=dates,
        structured_dates=structured_dates,
        amounts=amounts,
        structured_finances=structured_finances,
        total_entities=total_entities,
        total_clauses=total_clauses,
        clauses_by_type=clauses_by_type,
        clause_preview=clause_preview,
        clauses=all_clauses,
        missing_provisions=missing_provisions,
        overall_risk_score=overall_risk_score,
        overall_risk_level=overall_risk_level,
        total_risks_found=total_risks_found,
        risk_findings=risk_findings,
        disclaimer=LEGAL_DISCLAIMER,
        plain_summary=plain_summary,
        key_points=key_points,
        obligations=obligations,
        structured_obligations=structured_obligations,
        important_dates=important_dates,
        faiss_index_path=faiss_index_path,
        pipeline_stage="completed",
    )


@router.get(
    "/health",
    response_model=DocumentHealthResponse,
)
async def document_service_health() -> DocumentHealthResponse:
    return DocumentHealthResponse(
        status="operational",
        pipeline_stages=[
            "05_language_detection",   # ✅
            "06_ocr_extraction",       # ✅
            "07_preprocessing",        # ✅
            "08_ner_clauses",          # ✅
            "09_risk_analysis",        # ✅
            "10_embeddings_faiss",     # ✅
        ],
        parts_complete=["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"],
    )