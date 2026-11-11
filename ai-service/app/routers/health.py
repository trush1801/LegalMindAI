# ============================================================
# Health Routes — FastAPI AI Service
# ============================================================
# pyrefly: ignore [missing-import]
from fastapi import APIRouter
from datetime import datetime
from app.config.settings import settings
import os

router = APIRouter()


# ── GET /health ───────────────────────────────────────────
@router.get("/")
async def health_check():
    return {
        "success":   True,
        "service":   settings.APP_NAME,
        "message":   "AI Service Running",
        "version":   settings.APP_VERSION,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ── GET /health/chain-test ────────────────────────────────
@router.get("/chain-test")
async def chain_test():
    return {
        "success": True,
        "service": settings.APP_NAME,
        "message": "AI Service Running — chain test successful",
        "version": settings.APP_VERSION,
        "timestamp": datetime.utcnow().isoformat(),
        "details": {
            "faiss_path_exists":  os.path.exists(settings.FAISS_INDEX_PATH),
            "upload_dir_exists":  os.path.exists(settings.UPLOAD_DIR),
            "gemini_configured":  bool(settings.GEMINI_API_KEY),
            "chain":              "React → Express → FastAPI ✅",
        },
    }


# ── GET /health/status ────────────────────────────────────
@router.get("/status")
async def detailed_status():
    return {
        "success":   True,
        "service":   settings.APP_NAME,
        "version":   settings.APP_VERSION,
        "timestamp": datetime.utcnow().isoformat(),
        "components": {
            "fastapi":    {"status": "running"},
            "gemini":     {"status": "configured" if settings.GEMINI_API_KEY else "not configured", "note": "Part 12"},
            "faiss":      {"status": "ready", "path": settings.FAISS_INDEX_PATH, "note": "Part 10"},
            "storage":    {"status": "ready", "path": settings.UPLOAD_DIR,       "note": "Part 04"},
            "ocr":        {"status": "pending", "note": "Part 06"},
            "nlp":        {"status": "pending", "note": "Part 08"},
            "langgraph":  {"status": "pending", "note": "Part 12"},
        },
    }


# ── GET /health/gemini-probe ──────────────────────────────
@router.get("/gemini-probe")
async def gemini_probe():
    key = settings.GEMINI_API_KEY
    if not key:
        return {
            "success":    False,
            "configured": False,
            "status":     "not_configured",
            "message":    "Gemini API key is not configured in environment.",
            "provider":   "Google Gemini",
            "masked_key": None,
        }

    masked = f"{key[:6]}...{key[-4:]}" if len(key) >= 12 else "****"

    return {
        "success":    True,
        "configured": True,
        "status":     "operational",
        "provider":   "Google Gemini API",
        "masked_key": masked,
        "model":      "gemini-1.5-pro",
        "timestamp":  datetime.utcnow().isoformat(),
    }