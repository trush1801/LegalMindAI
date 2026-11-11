# ============================================================
# FastAPI Settings
# ============================================================
# pyrefly: ignore [missing-import]
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME:         str = "LegalMind AI — FastAPI AI Service"
    APP_VERSION:      str = "0.1.0"
    DEBUG:            bool = True
    FASTAPI_PORT:     int = 8000
    INTERNAL_API_KEY: str = "internal_secret_key_change_this"
    GEMINI_API_KEY:   str = ""
    FAISS_INDEX_PATH: str = str(
        Path(__file__).resolve().parents[3] / "faiss_indexes"
    )
    UPLOAD_DIR: str = str(
        Path(__file__).resolve().parents[3] / "storage"
    )

    class Config:
        env_file = str(Path(__file__).resolve().parents[3] / ".env")
        extra    = "ignore"


settings = Settings()