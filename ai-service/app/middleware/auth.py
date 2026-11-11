# ============================================================
# Internal API Key — Middleware + Dependency
# Only Node.js/Express backend should call FastAPI
# ============================================================
# pyrefly: ignore [missing-import]
from fastapi import Depends, HTTPException, Request, status
# pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse
# pyrefly: ignore [missing-import]
from fastapi.security import APIKeyHeader
from app.config.settings import settings
import logging

logger = logging.getLogger(__name__)

_api_key_header = APIKeyHeader(name="X-Internal-API-Key", auto_error=False)


# ── Used by routers as Depends() ──────────────────────────
async def require_internal_api_key(
    api_key: str | None = Depends(_api_key_header),
) -> None:
    """
    FastAPI dependency — use this in router dependencies=[Depends(require_internal_api_key)].
    Raises 403 if the key is missing or wrong.
    """
    if not api_key or api_key != settings.INTERNAL_API_KEY:
        logger.warning("Unauthorized: invalid or missing X-Internal-API-Key")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"success": False, "error": "Forbidden — invalid or missing internal API key"},
        )


# ── Used as BaseHTTPMiddleware dispatch (global middleware) ──
async def verify_internal_api_key(request: Request, call_next):
    """BaseHTTPMiddleware dispatch — guards the whole app globally."""
    # Health routes and root are public
    if request.url.path.startswith("/health") or request.url.path == "/":
        return await call_next(request)

    api_key = request.headers.get("X-Internal-API-Key")

    if not api_key or api_key != settings.INTERNAL_API_KEY:
        logger.warning(f"Unauthorized access attempt: {request.url.path}")
        return JSONResponse(
            status_code=403,
            content={
                "success": False,
                "error": "Forbidden — invalid or missing internal API key",
            },
        )

    return await call_next(request)