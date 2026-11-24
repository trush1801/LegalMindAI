"""
Embeddings & FAISS Vector Database Service — Part 10

Generates 384-dimensional dense vector embeddings using SentenceTransformers
(`all-MiniLM-L6-v2`) and manages document-specific FAISS vector indexes.

Features:
  - SentenceTransformer dense embedding generation
  - FAISS index creation and persistence (`faiss_indexes/{doc_id}.index`)
  - Metadata mapping (`faiss_indexes/{doc_id}_meta.json`)
  - Semantic vector similarity search (`POST /vector/search`)
  - In-memory thread-safe FAISS LRU Cache (Phase 4 / ERR-RAG-001)
"""

from collections import OrderedDict
from dataclasses import dataclass, asdict
import json
import logging
import os
from pathlib import Path
import threading
from typing import Any, Optional, Tuple

import numpy as np

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


# ─────────────────────────────────────────────────────────────
# In-Memory Thread-Safe FAISS LRU Cache (Phase 4 / ERR-RAG-001)
# ─────────────────────────────────────────────────────────────

class FaissLRUCache:
    """
    Thread-safe Least-Recently-Used (LRU) in-memory cache for loaded FAISS indexes
    and metadata payloads.

    Features:
      - RLock synchronized for safe multi-threaded access.
      - Tenant-aware composite keying (`{user_id}:{document_id}` or `{document_id}`).
      - Disk mtime freshness validation to detect on-disk index updates.
      - Immediate eviction of missing or deleted files on disk.
      - Configurable capacity via `FAISS_CACHE_MAX_SIZE`.
      - Comprehensive hit, miss, and eviction statistics.
    """

    def __init__(self, max_size: int = 20):
        self.max_size = max(1, int(max_size))
        self._cache: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._lock = threading.RLock()
        self.hits: int = 0
        self.misses: int = 0
        self.evictions: int = 0

    @staticmethod
    def _build_key(document_id: str, user_id: Optional[str] = None) -> str:
        clean_doc = str(document_id).strip()
        if user_id:
            clean_user = str(user_id).strip()
            return f"{clean_user}:{clean_doc}"
        return clean_doc

    def get(
        self,
        document_id: str,
        index_file_path: Path,
        meta_file_path: Path,
        user_id: Optional[str] = None,
    ) -> Optional[Tuple[Any, list[dict]]]:
        """
        Retrieves cached (index, metadata) if present, on-disk files exist,
        and modification times match. Returns None on cache miss or stale disk state.
        """
        key = self._build_key(document_id, user_id)
        with self._lock:
            # Check existence on disk first
            if not index_file_path.exists() or not meta_file_path.exists():
                self.invalidate(document_id, user_id)
                self.misses += 1
                return None

            if key not in self._cache:
                self.misses += 1
                return None

            entry = self._cache[key]
            try:
                current_idx_mtime = os.path.getmtime(index_file_path)
                current_meta_mtime = os.path.getmtime(meta_file_path)
            except OSError:
                self.invalidate(document_id, user_id)
                self.misses += 1
                return None

            # Stale check: if disk files were modified after cache insertion
            if (
                current_idx_mtime != entry.get("index_mtime")
                or current_meta_mtime != entry.get("meta_mtime")
            ):
                logger.info(f"FAISS cache entry for {key} is stale (disk mtime changed). Invalidating.")
                del self._cache[key]
                self.misses += 1
                return None

            # Valid cache hit
            self.hits += 1
            self._cache.move_to_end(key)
            return entry["index"], entry["metadata"]

    def put(
        self,
        document_id: str,
        index: Any,
        metadata: list[dict],
        index_mtime: float,
        meta_mtime: float,
        user_id: Optional[str] = None,
    ) -> None:
        """Stores loaded index and metadata in the LRU cache, evicting oldest if full."""
        key = self._build_key(document_id, user_id)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)

            self._cache[key] = {
                "index": index,
                "metadata": metadata,
                "index_mtime": index_mtime,
                "meta_mtime": meta_mtime,
                "document_id": str(document_id).strip(),
                "user_id": str(user_id).strip() if user_id else None,
            }

            # Evict LRU entries if size exceeds max_size
            while len(self._cache) > self.max_size:
                evicted_key, _ = self._cache.popitem(last=False)
                self.evictions += 1
                logger.info(f"FAISS LRU Cache evicted entry: {evicted_key}")

    def invalidate(self, document_id: str, user_id: Optional[str] = None) -> int:
        """
        Invalidates cache entries matching document_id.
        If user_id is provided, invalidates the tenant-specific key.
        If user_id is None, invalidates all entries associated with document_id.
        """
        clean_doc = str(document_id).strip()
        count = 0
        with self._lock:
            keys_to_del = []
            for k, entry in list(self._cache.items()):
                if user_id:
                    expected_key = self._build_key(clean_doc, user_id)
                    if k == expected_key:
                        keys_to_del.append(k)
                else:
                    if (
                        entry.get("document_id") == clean_doc
                        or k == clean_doc
                        or k.endswith(f":{clean_doc}")
                    ):
                        keys_to_del.append(k)

            for k in keys_to_del:
                del self._cache[k]
                count += 1
                logger.info(f"Invalidated FAISS cache entry: {k}")
        return count

    def clear(self) -> int:
        """Clears all entries from the cache."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            logger.info(f"Cleared FAISS LRU Cache ({count} entries removed)")
            return count

    def get_stats(self) -> dict[str, Any]:
        """Returns cache hit/miss/eviction and sizing statistics."""
        with self._lock:
            total_requests = self.hits + self.misses
            hit_ratio = round(self.hits / total_requests, 4) if total_requests > 0 else 0.0
            return {
                "hits": self.hits,
                "misses": self.misses,
                "evictions": self.evictions,
                "current_size": len(self._cache),
                "max_size": self.max_size,
                "hit_ratio": hit_ratio,
            }


# Global FAISS LRU Cache Instance
faiss_cache = FaissLRUCache(max_size=getattr(settings, "FAISS_CACHE_MAX_SIZE", 20))


def invalidate_faiss_cache(document_id: str, user_id: Optional[str] = None) -> int:
    return faiss_cache.invalidate(document_id, user_id)


def clear_faiss_cache() -> int:
    return faiss_cache.clear()


def get_faiss_cache_stats() -> dict[str, Any]:
    return faiss_cache.get_stats()


def generate_embeddings(texts: list[str]) -> np.ndarray:
    """Generate dense 384-dim vector embeddings for a list of text strings."""
    if not texts:
        return np.empty((0, EMBEDDING_DIM), dtype=np.float32)

    model = _get_embedding_model()
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    return embeddings.astype(np.float32)


def _resolve_index_dir() -> Path:
    """Resolves FAISS index directory safely across execution environments."""
    p = Path(settings.FAISS_INDEX_PATH)
    if p.is_absolute() and p.exists():
        return p
    if p.exists():
        return p.resolve()
    ai_service_dir = Path(__file__).resolve().parents[2]
    cand1 = (ai_service_dir / p).resolve()
    if cand1.exists():
        return cand1
    project_root = ai_service_dir.parent
    cand2 = (project_root / p).resolve()
    if cand2.exists():
        return cand2
    cand3 = project_root / "faiss_indexes"
    if cand3.exists():
        return cand3
    return p


def create_and_save_faiss_index(
    document_id: str,
    chunks: list[dict],
    user_id: Optional[str] = None,
) -> dict:
    """
    Creates a FAISS L2 index for document chunks and persists vector index + metadata to disk.
    Also primes or updates the in-memory FAISS LRU cache.

    Saved Files:
      - Vector Index:  `faiss_indexes/{document_id}.index`
      - Metadata Map:  `faiss_indexes/{document_id}_meta.json`
    """
    import faiss

    if not chunks:
        raise ValueError("Cannot create FAISS index for empty chunk list")

    index_dir = _resolve_index_dir()
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

    # Prime in-memory FAISS LRU cache with newly written index
    try:
        idx_mtime = os.path.getmtime(index_file_path)
        meta_mtime = os.path.getmtime(meta_file_path)
        faiss_cache.put(
            document_id=document_id,
            index=index,
            metadata=meta_payload,
            index_mtime=idx_mtime,
            meta_mtime=meta_mtime,
            user_id=user_id,
        )
    except Exception as e:
        logger.warning(f"Could not prime FAISS cache for {document_id}: {e}")

    logger.info(f"FAISS index created for {document_id}: {index.ntotal} vectors -> {index_file_path}")

    return {
        "document_id":      document_id,
        "total_vectors":    index.ntotal,
        "embedding_dim":    EMBEDDING_DIM,
        "index_file_path":  str(index_file_path),
        "meta_file_path":   str(meta_file_path),
    }


def search_faiss_index(
    document_id: str,
    query: str,
    top_k: int = 5,
    user_id: Optional[str] = None,
) -> list[VectorSearchResult]:
    """
    Performs semantic vector search against a document's FAISS index using LRU caching.
    """
    import faiss

    index_dir = _resolve_index_dir()
    index_file_path = index_dir / f"{document_id}.index"
    meta_file_path  = index_dir / f"{document_id}_meta.json"

    # 1. Check in-memory LRU cache first
    cached_payload = faiss_cache.get(
        document_id=document_id,
        index_file_path=index_file_path,
        meta_file_path=meta_file_path,
        user_id=user_id,
    )

    if cached_payload is not None:
        index, meta_payload = cached_payload
    else:
        # Cache miss or stale entry -> load from disk
        if not index_file_path.exists() or not meta_file_path.exists():
            raise FileNotFoundError(f"FAISS index or metadata map not found for document: {document_id}")

        index = faiss.read_index(str(index_file_path))
        with open(meta_file_path, "r", encoding="utf-8") as f:
            meta_payload = json.load(f)

        idx_mtime = os.path.getmtime(index_file_path)
        meta_mtime = os.path.getmtime(meta_file_path)

        faiss_cache.put(
            document_id=document_id,
            index=index,
            metadata=meta_payload,
            index_mtime=idx_mtime,
            meta_mtime=meta_mtime,
            user_id=user_id,
        )

    # Embed query vector (384-dim, unnormalized)
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
