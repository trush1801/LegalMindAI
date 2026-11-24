"""
Text Extraction Service — Part 06 (v2 Section-Aware)
Extracts structured, section-aware text chunks from PDF, DOCX, and TXT files.

Key improvements in v2:
  - Section-aware PDF extraction: detects numbered legal clauses and schedules
    (e.g., "1. PARTIES...", "2. PURPOSE...", "SCHEDULE A...", "18. SIGNATURES")
    and outputs distinct, self-contained section chunks rather than page-dump blobs.
  - Recognizes two-column tables and preamble blocks.
  - Multi-page section continuation tracking: continuation text on subsequent pages
    inherits the parent section metadata.
  - Full metadata per chunk: document_id, chunk_index, page, section,
    section_title, text, char_count, word_count, extraction_method.
"""

import logging
import math
import re
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

SCANNED_PAGE_CHAR_THRESHOLD = 50
_easyocr_reader = None


@dataclass
class TextChunk:
    document_id:       str
    chunk_index:       int
    page:              int
    section:           Optional[str]
    section_title:     Optional[str]
    text:              str
    char_count:        int
    word_count:        int
    extraction_method: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ExtractionResult:
    document_id:             str
    file_format:             str
    extraction_method:       str
    total_pages:             int
    total_chunks:            int
    total_words:             int
    total_chars:             int
    raw_word_count:          int = 0
    estimated_page_count:    int = 0
    page_count_is_estimated: bool = False
    chunks:                  list[TextChunk] = field(default_factory=list)
    warnings:                list[str]       = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


# ─────────────────────────────────────────────────────────────
# Top-level legal section numbering & schedule patterns
# ─────────────────────────────────────────────────────────────

TOP_SECTION_RE = re.compile(
    r'(?m)^(?P<sec_num>\d{1,2}\.|ARTICLE\s+[IVX\d]+|SCHEDULE\s+[A-Z]|ANNEXURE\s+[A-Z]|EXHIBIT\s+[A-Z]|APPENDIX\s+[A-Z])\s+(?P<sec_title>[^\n]+)'
)


def _is_top_level_section(num_str: str, title_str: str, current_sec: Optional[str]) -> bool:
    """Filter out numbered list items inside a schedule or clause."""
    if current_sec and 'SCHEDULE' in str(current_sec).upper():
        if num_str.isdigit():
            val = int(num_str)
            if val < 10 and not title_str.isupper():
                return False
    return True


def _clean_extracted_text(text: str) -> str:
    """Basic text sanitization."""
    if not text:
        return ""
    text = text.replace("\x00", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return text.strip()


# ─────────────────────────────────────────────────────────────
# PDF Extraction — Section-Aware PyMuPDF
# ─────────────────────────────────────────────────────────────

def _extract_pdf_pymupdf(
    file_path: Path,
    document_id: str,
) -> tuple[list[TextChunk], int, list[str], set[int]]:
    # Modern PyMuPDF import (PyMuPDF >= 1.24) with backwards-compatible alias
    import pymupdf as fitz

    chunks: list[TextChunk] = []
    warnings: list[str] = []
    scanned_pages: set[int] = set()
    chunk_index = 0
    raw_word_count = 0

    current_sec_num: Optional[str] = None
    current_sec_title: Optional[str] = None

    try:
        doc = fitz.open(str(file_path))
        total_pages = len(doc)
        raw_word_count = sum(len(doc[i].get_text("text").split()) for i in range(total_pages))
        logger.info(f"PyMuPDF opened {file_path.name}: {total_pages} pages, {raw_word_count} raw words")

        for page_num in range(total_pages):
            page = doc[page_num]
            pno = page_num + 1

            raw_text = page.get_text("text")
            cleaned = _clean_extracted_text(raw_text)

            if len(cleaned) < SCANNED_PAGE_CHAR_THRESHOLD:
                scanned_pages.add(pno)
                continue

            # Filter running headers/footers
            lines = cleaned.splitlines()
            clean_lines = [
                l for l in lines
                if not re.match(r'^\s*(?:SAMPLE DOCUMENT|Page \d+|Confidential)', l, re.I)
            ]
            page_text = "\n".join(clean_lines).strip()

            matches = []
            temp_sec = current_sec_num
            for m in TOP_SECTION_RE.finditer(page_text):
                raw_num = m.group("sec_num").strip().rstrip(".")
                title = m.group("sec_title").strip()
                if raw_num.upper().startswith("SCHEDULE") and not title.upper().startswith("SCHEDULE"):
                    clean_t = title.lstrip("— -:").strip()
                    title = f"{raw_num} — {clean_t}"
                if _is_top_level_section(raw_num, title, temp_sec):
                    matches.append((m.start(), raw_num, title))
                    temp_sec = raw_num

            if not matches:
                # No top-level section headers on this page; could be a preamble or continuation
                if page_text:
                    sec_title = f"{current_sec_title} (Cont.)" if current_sec_title else None
                    chunks.append(TextChunk(
                        document_id=document_id,
                        chunk_index=chunk_index,
                        page=pno,
                        section=current_sec_num,
                        section_title=sec_title,
                        text=page_text,
                        char_count=len(page_text),
                        word_count=len(page_text.split()),
                        extraction_method="pymupdf",
                    ))
                    chunk_index += 1
                continue

            # Handle text before the first section match on this page
            if matches[0][0] > 0:
                pre_text = page_text[:matches[0][0]].strip()
                if pre_text and len(pre_text) > 20:
                    if pno == 1:
                        chunks.append(TextChunk(
                            document_id=document_id,
                            chunk_index=chunk_index,
                            page=pno,
                            section="PREAMBLE",
                            section_title="Document Header & Preamble",
                            text=pre_text,
                            char_count=len(pre_text),
                            word_count=len(pre_text.split()),
                            extraction_method="pymupdf",
                        ))
                    else:
                        cont_title = f"{current_sec_title} (Cont.)" if current_sec_title else None
                        chunks.append(TextChunk(
                            document_id=document_id,
                            chunk_index=chunk_index,
                            page=pno,
                            section=current_sec_num,
                            section_title=cont_title,
                            text=pre_text,
                            char_count=len(pre_text),
                            word_count=len(pre_text.split()),
                            extraction_method="pymupdf",
                        ))
                    chunk_index += 1

            # Extract each matched section on this page
            for i, (start, num, title) in enumerate(matches):
                end = matches[i+1][0] if i+1 < len(matches) else len(page_text)
                sec_text = page_text[start:end].strip()
                current_sec_num = num
                current_sec_title = title

                chunks.append(TextChunk(
                    document_id=document_id,
                    chunk_index=chunk_index,
                    page=pno,
                    section=num,
                    section_title=title,
                    text=sec_text,
                    char_count=len(sec_text),
                    word_count=len(sec_text.split()),
                    extraction_method="pymupdf",
                ))
                chunk_index += 1

        doc.close()

    except Exception as e:
        logger.error(f"PyMuPDF section extraction failed: {e}", exc_info=True)
        warnings.append(f"PyMuPDF extraction error: {str(e)}")
        total_pages = 0

    return chunks, total_pages, warnings, scanned_pages, raw_word_count


# ─────────────────────────────────────────────────────────────
# Fallback / DOCX / TXT Extractors
# ─────────────────────────────────────────────────────────────

def _extract_pages_easyocr(
    file_path: Path,
    document_id: str,
    page_numbers: set[int],
    detected_language: str,
    start_chunk_index: int,
) -> tuple[list[TextChunk], list[str]]:
    # Modern PyMuPDF import (PyMuPDF >= 1.24) with backwards-compatible alias
    import pymupdf as fitz
    import easyocr

    chunks: list[TextChunk] = []
    warnings: list[str] = []
    chunk_index = start_chunk_index

    try:
        reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        doc = fitz.open(str(file_path))

        for pno in sorted(page_numbers):
            page = doc[pno - 1]
            pix = page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes("png")

            results = reader.readtext(img_bytes, detail=0)
            ocr_text = "\n".join(results).strip()

            if ocr_text:
                chunks.append(TextChunk(
                    document_id=document_id,
                    chunk_index=chunk_index,
                    page=pno,
                    section=None,
                    section_title=None,
                    text=ocr_text,
                    char_count=len(ocr_text),
                    word_count=len(ocr_text.split()),
                    extraction_method="easyocr",
                ))
                chunk_index += 1

        doc.close()
    except Exception as e:
        warnings.append(f"EasyOCR fallback error: {str(e)}")

    return chunks, warnings


def _extract_docx(file_path: Path, document_id: str) -> tuple[list[TextChunk], int, list[str], bool]:
    import docx

    chunks: list[TextChunk] = []
    warnings: list[str] = []
    chunk_index = 0
    total_pages = 1
    page_count_is_estimated = True

    try:
        doc = docx.Document(str(file_path))
        full_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        total_words = len(full_text.split())

        # Check explicit page breaks in docx xml
        explicit_breaks = 0
        for p in doc.paragraphs:
            if hasattr(p, "_p") and p._p is not None and getattr(p._p, "xml", None):
                if 'w:type="page"' in p._p.xml or "w:lastRenderedPageBreak" in p._p.xml:
                    explicit_breaks += 1

        # Typography estimation: standard legal/contract page is ~450 words
        word_based_pages = max(1, math.ceil(total_words / 450)) if total_words > 0 else (1 if full_text.strip() else 0)
        total_pages = max(explicit_breaks + 1, word_based_pages)

        # Split on section headings if present
        matches = list(TOP_SECTION_RE.finditer(full_text))
        running_words = 0
        if matches:
            if matches[0].start() > 0:
                pre = full_text[:matches[0].start()].strip()
                if pre:
                    pre_words = len(pre.split())
                    chunk_page = min(total_pages, max(1, math.ceil((running_words + 1) / 450)))
                    running_words += pre_words
                    chunks.append(TextChunk(document_id, chunk_index, chunk_page, "PREAMBLE", "Preamble", pre, len(pre), pre_words, "docx"))
                    chunk_index += 1
            for i, m in enumerate(matches):
                start = m.start()
                end = matches[i+1].start() if i+1 < len(matches) else len(full_text)
                txt = full_text[start:end].strip()
                txt_words = len(txt.split())
                chunk_page = min(total_pages, max(1, math.ceil((running_words + 1) / 450)))
                running_words += txt_words
                chunks.append(TextChunk(document_id, chunk_index, chunk_page, m.group("sec_num").rstrip("."), m.group("sec_title").strip(), txt, len(txt), txt_words, "docx"))
                chunk_index += 1
        else:
            chunks.append(TextChunk(document_id, 0, 1, None, None, full_text, len(full_text), total_words, "docx"))
    except Exception as e:
        warnings.append(f"DOCX extraction error: {str(e)}")

    return chunks, total_pages, warnings, page_count_is_estimated


def _extract_txt(file_path: Path, document_id: str) -> tuple[list[TextChunk], int, list[str], bool]:
    chunks: list[TextChunk] = []
    warnings: list[str] = []
    total_pages = 1
    page_count_is_estimated = True

    try:
        text = file_path.read_text(encoding="utf-8", errors="replace").strip()
        total_words = len(text.split())
        # Estimation rule: ~450 words per standard page
        total_pages = max(1, math.ceil(total_words / 450)) if total_words > 0 else (1 if text else 0)

        matches = list(TOP_SECTION_RE.finditer(text))
        chunk_index = 0
        running_words = 0
        if matches:
            if matches[0].start() > 0:
                pre = text[:matches[0].start()].strip()
                if pre:
                    pre_words = len(pre.split())
                    chunk_page = min(total_pages, max(1, math.ceil((running_words + 1) / 450)))
                    running_words += pre_words
                    chunks.append(TextChunk(document_id, chunk_index, chunk_page, "PREAMBLE", "Preamble", pre, len(pre), pre_words, "txt"))
                    chunk_index += 1
            for i, m in enumerate(matches):
                start = m.start()
                end = matches[i+1].start() if i+1 < len(matches) else len(text)
                txt = text[start:end].strip()
                txt_words = len(txt.split())
                chunk_page = min(total_pages, max(1, math.ceil((running_words + 1) / 450)))
                running_words += txt_words
                chunks.append(TextChunk(document_id, chunk_index, chunk_page, m.group("sec_num").rstrip("."), m.group("sec_title").strip(), txt, len(txt), txt_words, "txt"))
                chunk_index += 1
        else:
            chunks.append(TextChunk(document_id, 0, 1, None, None, text, len(text), total_words, "txt"))
    except Exception as e:
        warnings.append(f"TXT extraction error: {str(e)}")

    return chunks, total_pages, warnings, page_count_is_estimated


# ─────────────────────────────────────────────────────────────
# Main extraction entry point
# ─────────────────────────────────────────────────────────────

def extract_text(
    file_path: str | Path,
    document_id: str,
    file_format: str,
    detected_language: str = "en",
) -> ExtractionResult:
    file_path = Path(file_path)
    fmt = file_format.lower().strip(".")

    logger.info(f"Starting extraction: {file_path.name} | format={fmt} | doc_id={document_id}")

    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    chunks: list[TextChunk] = []
    warnings: list[str] = []
    total_pages = 0
    raw_word_count = 0
    primary_method = fmt
    page_count_is_estimated = False

    if fmt == "pdf":
        pymupdf_chunks, total_pages, pymupdf_warnings, scanned_pages, raw_word_count = _extract_pdf_pymupdf(file_path, document_id)
        chunks.extend(pymupdf_chunks)
        warnings.extend(pymupdf_warnings)
        primary_method = "pymupdf"
        page_count_is_estimated = False

        if scanned_pages:
            ocr_chunks, ocr_warnings = _extract_pages_easyocr(
                file_path=file_path,
                document_id=document_id,
                page_numbers=scanned_pages,
                detected_language=detected_language,
                start_chunk_index=len(chunks),
            )
            chunks.extend(ocr_chunks)
            warnings.extend(ocr_warnings)
            primary_method = "pymupdf+easyocr" if ocr_chunks else "pymupdf"

    elif fmt == "docx":
        chunks, total_pages, warnings, page_count_is_estimated = _extract_docx(file_path, document_id)
        primary_method = "docx"

    elif fmt == "txt":
        chunks, total_pages, warnings, page_count_is_estimated = _extract_txt(file_path, document_id)
        primary_method = "txt"

    else:
        raise ValueError(f"Unsupported file format: {fmt}")

    for i, chunk in enumerate(chunks):
        chunk.chunk_index = i

    total_words = sum(c.word_count for c in chunks)
    total_chars = sum(c.char_count for c in chunks)

    logger.info(
        f"Extraction complete: {len(chunks)} section chunks | "
        f"{total_pages} pages (estimated={page_count_is_estimated}) | {total_words} words | method={primary_method}"
    )

    return ExtractionResult(
        document_id=document_id,
        file_format=fmt,
        extraction_method=primary_method,
        total_pages=total_pages,
        estimated_page_count=total_pages,
        page_count_is_estimated=page_count_is_estimated,
        total_chunks=len(chunks),
        total_words=total_words,
        total_chars=total_chars,
        raw_word_count=raw_word_count or total_words,
        chunks=chunks,
        warnings=warnings,
    )
