"""
Language Detection Service — Part 05
Detects document language: English, Hindi, or Gujarati.
Prepares text for the NLP pipeline.

Supported languages:
  - English (en)
  - Hindi   (hi)  — Devanagari script
  - Gujarati (gu) — Gujarati script

Strategy note (from README):
  For Hindi/Gujarati, the exact translation or native multilingual
  processing strategy is implementation-dependent. This service
  flags the language and prepares text. Translation hooks are
  placeholders for future parts.
"""

import logging
import re
import unicodedata
from typing import Optional
from dataclasses import dataclass, field

import ftfy
from langdetect import detect, detect_langs, LangDetectException
from langdetect import DetectorFactory

# Make langdetect deterministic across runs
DetectorFactory.seed = 42

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# Unicode block ranges for script detection
# ─────────────────────────────────────────────

# Devanagari script — used by Hindi
DEVANAGARI_RANGE = (0x0900, 0x097F)

# Gujarati script — distinct from Devanagari
GUJARATI_RANGE = (0x0A80, 0x0AFF)


# ─────────────────────────────────────────────
# Result dataclass
# ─────────────────────────────────────────────

@dataclass
class LanguageDetectionResult:
    """
    Result of language detection for a document.

    Fields:
      detected_language : ISO 639-1 code  ('en', 'hi', 'gu')
      language_name     : Human-readable  ('English', 'Hindi', 'Gujarati')
      confidence        : Float 0.0–1.0
      is_supported      : Whether language is in our supported set
      script            : Script name     ('Latin', 'Devanagari', 'Gujarati')
      detection_method  : How it was detected
      processing_note   : What the NLP pipeline should know
      raw_scores        : All langdetect scores (for debugging)
    """
    detected_language: str
    language_name: str
    confidence: float
    is_supported: bool
    script: str
    detection_method: str
    processing_note: str
    raw_scores: list = field(default_factory=list)


# ─────────────────────────────────────────────
# Supported language config
# ─────────────────────────────────────────────

SUPPORTED_LANGUAGES = {
    "en": {
        "name": "English",
        "script": "Latin",
        "processing_note": "Process directly through NLP pipeline.",
    },
    "hi": {
        "name": "Hindi",
        "script": "Devanagari",
        "processing_note": (
            "Hindi document detected. "
            "Multilingual processing strategy is implementation-dependent. "
            "Text prepared for pipeline — translation hook available if required."
        ),
    },
    "gu": {
        "name": "Gujarati",
        "script": "Gujarati",
        "processing_note": (
            "Gujarati document detected. "
            "Multilingual processing strategy is implementation-dependent. "
            "Text prepared for pipeline — translation hook available if required."
        ),
    },
}

# Minimum text length for reliable detection
MIN_TEXT_LENGTH = 20

# Confidence threshold below which we flag low confidence
LOW_CONFIDENCE_THRESHOLD = 0.70


# ─────────────────────────────────────────────
# Script detection helpers
# ─────────────────────────────────────────────

def _count_script_chars(text: str, unicode_range: tuple[int, int]) -> int:
    """Count characters in text that fall within a Unicode block range."""
    low, high = unicode_range
    return sum(1 for ch in text if low <= ord(ch) <= high)


def _detect_script_from_unicode(text: str) -> Optional[str]:
    """
    Detect script by counting Unicode characters in known ranges.
    Returns 'hi', 'gu', or None.

    This is used to:
    1. Confirm langdetect results for Indic scripts
    2. Resolve ambiguity between Hindi and Gujarati
    3. Override langdetect when it misclassifies Indic scripts as 'mr' or 'ne'
    """
    total_chars = len([ch for ch in text if not ch.isspace()])
    if total_chars == 0:
        return None

    devanagari_count = _count_script_chars(text, DEVANAGARI_RANGE)
    gujarati_count   = _count_script_chars(text, GUJARATI_RANGE)

    devanagari_ratio = devanagari_count / total_chars
    gujarati_ratio   = gujarati_count   / total_chars

    # Need at least 15% Indic characters to make a script determination
    SCRIPT_THRESHOLD = 0.15

    if gujarati_ratio > SCRIPT_THRESHOLD and gujarati_ratio > devanagari_ratio:
        return "gu"

    if devanagari_ratio > SCRIPT_THRESHOLD and devanagari_ratio > gujarati_ratio:
        return "hi"

    return None


# ─────────────────────────────────────────────
# Text preparation
# ─────────────────────────────────────────────

def prepare_text_for_pipeline(text: str, language_code: str) -> str:
    """
    Prepare text for the NLP pipeline based on detected language.

    English  → standard cleaning
    Hindi    → Unicode normalization + Devanagari-aware cleaning
    Gujarati → Unicode normalization + Gujarati-aware cleaning

    Translation strategy for Hindi/Gujarati is intentionally left
    as a hook for future parts (README: implementation-dependent).
    """
    if not text:
        return text

    # Step 1 — Fix broken unicode (common in OCR output)
    text = ftfy.fix_text(text)

    # Step 2 — Unicode normalization
    # NFC: canonical decomposition followed by canonical composition
    # Important for Indic scripts to ensure consistent character representation
    text = unicodedata.normalize("NFC", text)

    # Step 3 — Language-specific preparation
    if language_code == "en":
        text = _prepare_english(text)
    elif language_code == "hi":
        text = _prepare_hindi(text)
    elif language_code == "gu":
        text = _prepare_gujarati(text)

    return text.strip()


def _prepare_english(text: str) -> str:
    """Standard English text preparation."""
    # Remove excessive whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    # Remove null bytes and control characters (common in PDFs)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text


def _prepare_hindi(text: str) -> str:
    """
    Hindi (Devanagari) text preparation.

    Translation/multilingual processing hook:
    If translation to English is needed for downstream NLP,
    it would be inserted here in a future part.
    For now: normalize and clean the Devanagari text.
    """
    # Fix Devanagari nukta characters (common OCR error)
    # Normalize nukta combinations to their canonical forms
    text = re.sub(r"[\u093C]", "", text)  # Remove stray nukta

    # Remove excessive whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)

    # Remove control characters
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # TRANSLATION HOOK — placeholder for future implementation
    # if settings.TRANSLATE_TO_ENGLISH:
    #     text = translation_service.translate(text, source='hi', target='en')

    return text


def _prepare_gujarati(text: str) -> str:
    """
    Gujarati text preparation.

    Translation/multilingual processing hook:
    Same pattern as Hindi — hook is present for future parts.
    """
    # Remove excessive whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)

    # Remove control characters
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # TRANSLATION HOOK — placeholder for future implementation
    # if settings.TRANSLATE_TO_ENGLISH:
    #     text = translation_service.translate(text, source='gu', target='en')

    return text


# ─────────────────────────────────────────────
# Core detection logic
# ─────────────────────────────────────────────

def _resolve_indic_language(
    langdetect_code: str,
    script_code: Optional[str]
) -> str:
    """
    Resolve ambiguity between Hindi and Gujarati.

    langdetect sometimes returns:
      'mr' (Marathi) instead of 'hi' — same Devanagari script
      'ne' (Nepali)  instead of 'hi' — same Devanagari script
      'pa' (Punjabi) instead of 'gu' — similar script

    We use Unicode script detection to override these.
    """
    # If script detection gave us a clear answer, trust it
    if script_code in ("hi", "gu"):
        return script_code

    # If langdetect says Devanagari-family → map to Hindi
    devanagari_family = {"hi", "mr", "ne", "bho", "mai", "kok"}
    if langdetect_code in devanagari_family:
        return "hi"

    # If langdetect says Gujarati family → map to Gujarati
    gujarati_family = {"gu"}
    if langdetect_code in gujarati_family:
        return "gu"

    return langdetect_code


def detect_language(text: str) -> LanguageDetectionResult:
    """
    Main language detection function.

    Detection strategy (in order):
    1. Script detection via Unicode ranges (most reliable for Indic)
    2. langdetect primary detection
    3. Resolve ambiguity using both signals
    4. Fall back to English if unsupported language detected

    Returns a LanguageDetectionResult with full metadata.
    """

    # ── Guard: empty or very short text ──────────────────────────
    if not text or len(text.strip()) < MIN_TEXT_LENGTH:
        logger.warning(
            "Text too short for reliable language detection "
            f"(length: {len(text.strip()) if text else 0}). "
            "Defaulting to English."
        )
        return LanguageDetectionResult(
            detected_language="en",
            language_name="English",
            confidence=0.5,
            is_supported=True,
            script="Latin",
            detection_method="default_short_text",
            processing_note="Text too short for detection. Defaulted to English.",
            raw_scores=[],
        )

    # ── Step 1: Script detection via Unicode ─────────────────────
    script_code = _detect_script_from_unicode(text)
    logger.debug(f"Script detection result: {script_code}")

    # ── Step 2: langdetect ───────────────────────────────────────
    raw_scores = []
    langdetect_code = None
    langdetect_confidence = 0.0

    try:
        langs = detect_langs(text)
        raw_scores = [{"lang": l.lang, "prob": round(l.prob, 4)} for l in langs]

        if langs:
            langdetect_code = langs[0].lang
            langdetect_confidence = langs[0].prob
            logger.debug(
                f"langdetect result: {langdetect_code} "
                f"(confidence: {langdetect_confidence:.3f})"
            )

    except LangDetectException as e:
        logger.warning(f"langdetect failed: {e}. Falling back to script detection.")

    # ── Step 3: Resolve final language ───────────────────────────

    # If we have a strong script detection for Indic scripts, use it
    if script_code in ("hi", "gu"):
        final_code = script_code
        confidence = max(langdetect_confidence, 0.85)  # Script detection is reliable
        detection_method = "unicode_script_detection"

        # Cross-check: if langdetect agrees, boost confidence
        resolved = _resolve_indic_language(langdetect_code or "", script_code)
        if resolved == script_code:
            confidence = min(confidence + 0.05, 1.0)
            detection_method = "unicode_script_confirmed_by_langdetect"

    elif langdetect_code:
        # No strong Indic script — resolve using langdetect result
        resolved_code = _resolve_indic_language(langdetect_code, script_code)

        if resolved_code in SUPPORTED_LANGUAGES:
            final_code = resolved_code
            confidence = langdetect_confidence
            detection_method = "langdetect_primary"
        else:
            # Unsupported language detected
            logger.info(
                f"Detected unsupported language '{langdetect_code}'. "
                "Flagging as unsupported."
            )
            final_code = langdetect_code
            confidence = langdetect_confidence
            detection_method = "langdetect_unsupported"

    else:
        # Both methods failed — default to English
        logger.warning("All detection methods failed. Defaulting to English.")
        final_code = "en"
        confidence = 0.5
        detection_method = "default_fallback"

    # ── Step 4: Build result ──────────────────────────────────────

    is_supported = final_code in SUPPORTED_LANGUAGES

    if is_supported:
        lang_config = SUPPORTED_LANGUAGES[final_code]
        language_name = lang_config["name"]
        script = lang_config["script"]
        processing_note = lang_config["processing_note"]

        if confidence < LOW_CONFIDENCE_THRESHOLD:
            processing_note += (
                f" (Low confidence: {confidence:.1%}. "
                "Manual review may be advisable.)"
            )
    else:
        language_name = final_code.upper()
        script = "Unknown"
        processing_note = (
            f"Language '{final_code}' is not in the supported set "
            "(English, Hindi, Gujarati). "
            "Processing will be attempted but results may be limited."
        )

    result = LanguageDetectionResult(
        detected_language=final_code,
        language_name=language_name,
        confidence=round(confidence, 4),
        is_supported=is_supported,
        script=script,
        detection_method=detection_method,
        processing_note=processing_note,
        raw_scores=raw_scores,
    )

    logger.info(
        f"Language detection complete: {language_name} ({final_code}) "
        f"| confidence: {confidence:.1%} | method: {detection_method}"
    )

    return result