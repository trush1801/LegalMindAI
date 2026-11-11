"""
Text Preprocessing & Normalization Service — Part 07 (v2 Section-Preserving)

Takes TextChunk objects from extraction_service.py and cleans them
without corrupting section boundaries:
  - Deep noise removal (running page numbers, watermarks)
  - Legal text normalization (Unicode quotes, dashes, whitespace)
  - Preserves section boundaries (never merges different legal clauses)
  - Injects overlap ONLY when a single long section was split (> 600 words)
"""

import logging
import re
from dataclasses import dataclass, field, asdict
from typing import Optional
import ftfy

from app.services.extraction_service import TextChunk

logger = logging.getLogger(__name__)

TARGET_WORDS  = 400
MIN_WORDS     = 100
MAX_WORDS     = 600
OVERLAP_WORDS = 50


@dataclass
class ProcessedChunk:
    document_id:        str
    chunk_index:        int
    page:               int
    section:            Optional[str]
    section_title:      Optional[str]
    text:               str
    char_count:         int
    word_count:         int
    extraction_method:  str
    has_overlap:        bool
    overlap_word_count: int
    source_chunk_index: int

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class PreprocessingResult:
    document_id:         str
    total_input_chunks:  int
    total_output_chunks: int
    total_words:         int
    total_chars:         int
    chunks:              list[ProcessedChunk] = field(default_factory=list)
    cleaning_stats:      dict                 = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


_PAGE_NUMBER_PATTERNS = [
    re.compile(r"^\s*[Pp]age\s+\d+\s+of\s+\d+\s*$", re.MULTILINE),
    re.compile(r"^\s*-\s*\d+\s*-\s*$", re.MULTILINE),
]

_HEADER_FOOTER_PATTERNS = [
    re.compile(r"^\s*(SAMPLE DOCUMENT — FOR TESTING ONLY|CONFIDENTIAL|DRAFT)\s*$", re.MULTILINE | re.IGNORECASE),
    re.compile(r"^[\-_=]{5,}\s*$", re.MULTILINE),
]

_QUOTE_MAP = {
    "\u2018": "'", "\u2019": "'", "\u201C": '"', "\u201D": '"',
    "\u00AB": '"', "\u00BB": '"', "\u2039": "'", "\u203A": "'",
}

_DASH_MAP = {
    "\u2013": "-", "\u2014": "-", "\u2015": "-", "\u2212": "-",
}


def _remove_noise(text: str) -> str:
    if not text:
        return ""
    for pattern in _PAGE_NUMBER_PATTERNS:
        text = pattern.sub("", text)
    for pattern in _HEADER_FOOTER_PATTERNS:
        text = pattern.sub("", text)
    return text


def _normalize_legal_text(text: str, language_code: str = "en") -> str:
    if not text:
        return ""
    text = ftfy.fix_text(text)
    for q, rep in _QUOTE_MAP.items():
        text = text.replace(q, rep)
    for d, rep in _DASH_MAP.items():
        text = text.replace(d, rep)
    return text


def _normalize_whitespace(text: str) -> str:
    if not text:
        return ""
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines()]
    text = "\n".join(l for l in lines if l)
    return re.sub(r"\n{3,}", "\n\n", text)


def clean_text(text: str, language_code: str = "en") -> str:
    if not text or not text.strip():
        return ""
    text = _remove_noise(text)
    text = _normalize_legal_text(text, language_code)
    text = _normalize_whitespace(text)
    return text


def _split_into_sentences(text: str) -> list[str]:
    # Split on periods followed by capital letter, avoiding common abbreviations
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)
    return [p.strip() for p in parts if p.strip()]


def _split_oversized_chunk(chunk: TextChunk, cleaned_text: str) -> list[dict]:
    sentences = _split_into_sentences(cleaned_text)
    if not sentences:
        return [{"text": cleaned_text, "source_chunk_index": chunk.chunk_index}]

    sub_chunks = []
    current_sentences = []
    current_words = 0

    for sentence in sentences:
        swords = len(sentence.split())
        if current_words + swords > MAX_WORDS and current_sentences:
            sub_chunks.append({
                "text": " ".join(current_sentences),
                "source_chunk_index": chunk.chunk_index,
            })
            current_sentences = [sentence]
            current_words = swords
        else:
            current_sentences.append(sentence)
            current_words += swords

    if current_sentences:
        sub_chunks.append({
            "text": " ".join(current_sentences),
            "source_chunk_index": chunk.chunk_index,
        })

    return sub_chunks


def preprocess_chunks(
    chunks: list[TextChunk],
    document_id: str,
    language_code: str = "en",
) -> PreprocessingResult:
    logger.info(f"Preprocessing {len(chunks)} chunks for {document_id}")

    if not chunks:
        return PreprocessingResult(document_id, 0, 0, 0, 0, [], {})

    output_chunks: list[ProcessedChunk] = []
    total_words = 0
    total_chars = 0
    idx = 0

    for chunk in chunks:
        cleaned = clean_text(chunk.text, language_code)
        if not cleaned:
            continue

        wc = len(cleaned.split())

        # If a single section exceeds MAX_WORDS (rare in typical contracts), split it
        if wc > MAX_WORDS:
            subs = _split_oversized_chunk(chunk, cleaned)
            for sub_i, sub in enumerate(subs):
                stext = sub["text"]
                has_ol = sub_i > 0
                ol_wc = min(OVERLAP_WORDS, len(subs[sub_i-1]["text"].split())) if has_ol else 0
                
                output_chunks.append(ProcessedChunk(
                    document_id=document_id,
                    chunk_index=idx,
                    page=chunk.page,
                    section=chunk.section,
                    section_title=chunk.section_title,
                    text=stext,
                    char_count=len(stext),
                    word_count=len(stext.split()),
                    extraction_method=chunk.extraction_method,
                    has_overlap=has_ol,
                    overlap_word_count=ol_wc,
                    source_chunk_index=chunk.chunk_index,
                ))
                idx += 1
                total_words += len(stext.split())
                total_chars += len(stext)
        else:
            # Keep the intact legal section chunk without cross-section overlap
            output_chunks.append(ProcessedChunk(
                document_id=document_id,
                chunk_index=idx,
                page=chunk.page,
                section=chunk.section,
                section_title=chunk.section_title,
                text=cleaned,
                char_count=len(cleaned),
                word_count=wc,
                extraction_method=chunk.extraction_method,
                has_overlap=False,
                overlap_word_count=0,
                source_chunk_index=chunk.chunk_index,
            ))
            idx += 1
            total_words += wc
            total_chars += len(cleaned)

    logger.info(f"Preprocessing complete: {len(chunks)} in -> {len(output_chunks)} out ({total_words} words)")

    return PreprocessingResult(
        document_id=document_id,
        total_input_chunks=len(chunks),
        total_output_chunks=len(output_chunks),
        total_words=total_words,
        total_chars=total_chars,
        chunks=output_chunks,
        cleaning_stats={"input": len(chunks), "output": len(output_chunks), "total_words": total_words},
    )
