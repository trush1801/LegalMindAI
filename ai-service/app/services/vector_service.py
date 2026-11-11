"""
Embeddings & FAISS Vector Database Service — Part 10

Generates 384-dimensional dense vector embeddings using SentenceTransformers
(`all-MiniLM-L6-v2`) and manages document-specific FAISS vector indexes.

Features:
  - SentenceTransformer dense embedding generation
  - FAISS index creation and persistence (`faiss_indexes/{doc_id}.index`)
  - Metadata mapping (`faiss_indexes/{doc_id}_meta.json`)
  - Semantic vector similarity search (`POST /vector/search`)
"""

import json
import logging
import os
from pathlib import Path
import numpy as np
from dataclasses import dataclass, asdict

from app.config.settings import settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384

_embedding_model = None


def _get_embedding_model():
    """Lazy-load SentenceTransformer embedding model."""
    global _embedding_model
    if _embedding_model is not None:
        return _embedding_model

    from sentence_transformers import SentenceTransformer
    logger.info(f"Loading SentenceTransformer embedding model: {EMBEDDING_MODEL_NAME}...")
    _embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    logger.info("SentenceTransformer model loaded successfully.")
    return _embedding_model


@dataclass
class VectorSearchResult:
    chunk_id:          str
    document_id:       str
    chunk_index:       int
    page:              int
    section:           str | None
    section_title:     str | None
    text:              str
    clause_type:       str | None
    score:             float        # Cosine / L2 distance similarity score

    def to_dict(self) -> dict:
        return asdict(self)


def generate_embeddings(texts: list[str]) -> np.ndarray:
    """Generate dense 384-dim vector embeddings for a list of text strings."""
    if not texts:
        return np.empty((0, EMBEDDING_DIM), dtype=np.float32)

    model = _get_embedding_model()
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    return embeddings.astype(np.float32)


def create_and_save_faiss_index(document_id: str, chunks: list[dict]) -> dict:
    """
    Creates a FAISS L2 index for document chunks and persists vector index + metadata to disk.

    Saved Files:
      - Vector Index:  `faiss_indexes/{document_id}.index`
      - Metadata Map:  `faiss_indexes/{document_id}_meta.json`
    """
    import faiss

    if not chunks:
        raise ValueError("Cannot create FAISS index for empty chunk list")

    index_dir = Path(settings.FAISS_INDEX_PATH)
    index_dir.mkdir(parents=True, exist_ok=True)

    index_file_path = index_dir / f"{document_id}.index"
    meta_file_path  = index_dir / f"{document_id}_meta.json"

    # Extract text strings for embedding
    texts = [c.get("text", "") for c in chunks]
    embeddings = generate_embeddings(texts)

    # Initialize FAISS Index (L2 Distance)
    index = faiss.IndexFlatL2(EMBEDDING_DIM)
    index.add(embeddings)

    # Write FAISS index binary file
    faiss.write_index(index, str(index_file_path))

    # Build & save metadata payload map
    meta_payload = []
    for idx, c in enumerate(chunks):
        meta_payload.append({
            "chunk_id":          f"{document_id}_chunk_{idx}",
            "document_id":       document_id,
            "chunk_index":       c.get("chunk_index", idx),
            "page":              c.get("page", 1),
            "section":           c.get("section"),
            "section_title":     c.get("section_title"),
            "text":              c.get("text", ""),
            "clause_type":       c.get("clause_type"),
            "extraction_method": c.get("extraction_method", "unknown"),
        })

    with open(meta_file_path, "w", encoding="utf-8") as f:
        json.dump(meta_payload, f, indent=2)

    logger.info(f"FAISS index created for {document_id}: {index.ntotal} vectors -> {index_file_path}")

    return {
        "document_id":      document_id,
        "total_vectors":    index.ntotal,
        "embedding_dim":    EMBEDDING_DIM,
        "index_file_path":  str(index_file_path),
        "meta_file_path":   str(meta_file_path),
    }


def search_faiss_index(document_id: str, query: str, top_k: int = 5) -> list[VectorSearchResult]:
    """
    Performs semantic vector search against a document's FAISS index.
    """
    import faiss

    index_dir = Path(settings.FAISS_INDEX_PATH)
    index_file_path = index_dir / f"{document_id}.index"
    meta_file_path  = index_dir / f"{document_id}_meta.json"

    if not index_file_path.exists() or not meta_file_path.exists():
        raise FileNotFoundError(f"FAISS index or metadata map not found for document: {document_id}")

    # Load FAISS index & metadata
    index = faiss.read_index(str(index_file_path))
    with open(meta_file_path, "r", encoding="utf-8") as f:
        meta_payload = json.load(f)

    # Embed query vector
    query_vector = generate_embeddings([query])

    # Search FAISS
    k = min(top_k, index.ntotal)
    distances, indices = index.search(query_vector, k)

    results = []
    for rank, idx in enumerate(indices[0]):
        if idx < 0 or idx >= len(meta_payload):
            continue

        item = meta_payload[idx]
        dist = float(distances[0][rank])
        # Convert L2 distance to similarity score (0.0 to 1.0)
        sim_score = round(1.0 / (1.0 + dist), 4)

        results.append(VectorSearchResult(
            chunk_id=item["chunk_id"],
            document_id=item["document_id"],
            chunk_index=item["chunk_index"],
            page=item["page"],
            section=item["section"],
            section_title=item["section_title"],
            text=item["text"],
            clause_type=item.get("clause_type"),
            score=sim_score,
        ))

    return results