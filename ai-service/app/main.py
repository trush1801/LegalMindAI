"""
LegalMind AI — FastAPI AI Service
Main application entry point.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import settings
from app.routers import health, document, language, extraction, preprocessing, analysis,risk,vector,query

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("LegalMind AI Service starting up...")
    logger.info(f"Version: {settings.APP_VERSION}")
    logger.info(f"Upload directory: {settings.UPLOAD_DIR}")
    logger.info(f"FAISS index path: {settings.FAISS_INDEX_PATH}")
    yield
    logger.info("LegalMind AI Service shutting down...")


app = FastAPI(
    title="LegalMind AI Service",
    description="AI document processing pipeline for LegalMind AI",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router,          prefix="/health")
app.include_router(document.router)
app.include_router(language.router)
app.include_router(extraction.router)
app.include_router(preprocessing.router) 
app.include_router(analysis.router)   # ← ADD THIS LINE
app.include_router(risk.router)  
app.include_router(vector.router) 
app.include_router(query.router)

@app.get("/")
async def root():
    return {
        "service": "LegalMind AI",
        "version": settings.APP_VERSION,
        "status": "running",
        "parts_complete": ["01", "02", "03", "04", "05", "06", "07", "08","09" "10", "11"],
    }