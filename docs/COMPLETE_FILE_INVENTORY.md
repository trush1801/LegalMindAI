# LegalMind AI — Complete File Inventory

This inventory documents all **142 in-scope files** across the LegalMind AI project codebase. Every entry is based on direct source code inspection and details the 13 required architectural attributes:

1. **ID**: Sequential catalog identifier
2. **Relative Path**: Portable path from repository root
3. **Filename**: File name with extension
4. **Type**: Language / File format
5. **Layer**: System architectural tier (Presentation, Application API, AI Engine, Persistence, Infra)
6. **Primary Purpose**: Core functionality
7. **Main Responsibilities**: Concrete system duties
8. **Key Exports & Symbols**: Primary exported functions, classes, models, or components
9. **Key Imports & Dependencies**: Major external libraries or internal modules imported
10. **Verified Dependents & Callers**: Verified modules that import, call, or execute this file
11. **Nature**: UI, Business Logic, Config, Test, Script, or Documentation
12. **Status**: Active, Deprecated, Utility, or Test
13. **Observations & Audit Notes**: Notable characteristics or potential risks

---

## 1. Root & Infrastructure Configuration

### FILE-001: `docker-compose.yml`
- **Path**: `docker-compose.yml` | **Type**: YAML | **Layer**: Infrastructure / DevOps
- **Primary Purpose**: Orchestrates local containerized services for MongoDB and Mongo Express UI.
- **Main Responsibilities**: Provisions `mongo:7.0` on host port `27018` mapped to internal `27017` with credentials, mounts persistent volume `mongo_data` and `./docker/mongo-init.js`, and provisions `mongo-express:1.0.2` on port `8081`.
- **Key Symbols**: Services: `mongodb`, `mongo-express`; Volumes: `mongo_data`; Networks: `legalmind_network`.
- **Imports / Dependencies**: Docker Engine 3.8+ specification, `./docker/mongo-init.js`.
- **Verified Callers**: Docker CLI (`docker-compose up -d`).
- **Nature**: Configuration
- **Status**: Active
- **Observations**: Database port is non-standard `27018` on the host to avoid collisions with existing local MongoDB instances.

### FILE-002: `docker/mongo-init.js`
- **Path**: `docker/mongo-init.js` | **Type**: JavaScript (Mongo Shell) | **Layer**: Database Initialization
- **Primary Purpose**: Initializes default collections and secondary indexes when the MongoDB container starts for the first time.
- **Main Responsibilities**: Selects `legalmind` database; creates collections `users`, `documents`, `analysis_results`, `risk_findings`, `chat_histories`, `reports`; creates unique index on `users.email` and indexes on `documents.userId` and `documents.createdAt`.
- **Key Symbols**: Shell operations: `db.createCollection`, `db.users.createIndex`.
- **Imports / Dependencies**: MongoDB Shell API.
- **Verified Callers**: Mounted as `/docker-entrypoint-initdb.d/mongo-init.js` in `docker-compose.yml`.
- **Nature**: Script / Configuration
- **Status**: Active
- **Observations**: Successfully guarantees baseline indexes before the Node.js application connects.

### FILE-003: `.env.example`
- **Path**: `.env.example` | **Type**: Environment Config Template | **Layer**: Configuration
- **Primary Purpose**: Defines required environment variables and provides safe non-production sample values.
- **Main Responsibilities**: Documents `PORT`, `NODE_ENV`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `AI_SERVICE_URL`, `INTERNAL_API_KEY`, `FASTAPI_PORT`, and `GEMINI_API_KEY`.
- **Key Symbols**: Variable keys for Express and FastAPI.
- **Imports / Dependencies**: None.
- **Verified Callers**: Developers during setup.
- **Nature**: Configuration / Documentation
- **Status**: Active
- **Observations**: Clearly separates internal backend communication secrets from public API configurations.

### FILE-004: `.gitignore`
- **Path**: `.gitignore` | **Type**: Git Ignore Pattern | **Layer**: Version Control
- **Primary Purpose**: Excludes sensitive files, local environment configurations, build outputs, and third-party dependencies from version control.
- **Main Responsibilities**: Ignores `node_modules/`, `dist/`, `.env`, `.env.local`, `storage/*`, `reports/*.pdf`, `faiss_indexes/*.index`, `*.pyc`, `__pycache__/`, `venv/`.
- **Key Symbols**: Ignore patterns.
- **Imports / Dependencies**: Git.
- **Verified Callers**: Git VCS.
- **Nature**: Configuration
- **Status**: Active
- **Observations**: Well-structured with specific exceptions (`!storage/.gitkeep`, `!reports/.gitkeep`, `!faiss_indexes/.gitkeep`).

### FILE-005: `README.md`
- **Path**: `README.md` | **Type**: Markdown | **Layer**: Documentation
- **Primary Purpose**: Project orientation, setup guide, architecture overview, and developer manual.
- **Main Responsibilities**: Explains the 3-tier architecture (React + Express + FastAPI + MongoDB), setup steps, environment configuration, and API specifications.
- **Key Symbols**: Documentation sections and ASCII system diagram.
- **Imports / Dependencies**: None.
- **Verified Callers**: Engineering team.
- **Nature**: Documentation
- **Status**: Active
- **Observations**: Contains comprehensive quickstart instructions.

### FILE-006: `PROJECT_STRUCTURE_REPORT.md`
- **Path**: `PROJECT_STRUCTURE_REPORT.md` | **Type**: Markdown | **Layer**: Documentation
- **Primary Purpose**: Historical architectural snapshot of the repository structure.
- **Main Responsibilities**: Documents earlier phase implementations and baseline directory structure.
- **Key Symbols**: File listings and milestone checklists.
- **Imports / Dependencies**: None.
- **Verified Callers**: Documentation archive.
- **Nature**: Documentation
- **Status**: Active (Reference archive)
- **Observations**: Precursor to this current comprehensive documentation suite.

---

## 2. AI Document Processing Service (`ai-service/`)

### FILE-007: `ai-service/requirements.txt`
- **Path**: `ai-service/requirements.txt` | **Type**: Text / Pip Manifest | **Layer**: AI Engine Dependencies
- **Primary Purpose**: Pinned Python dependencies for the FastAPI document processing service.
- **Main Responsibilities**: Specifies versions for FastAPI (`0.104.1`), Uvicorn (`0.24.0`), PyMuPDF (`1.28.2`), EasyOCR (`1.7.2`), python-docx (`1.2.0`), spaCy (`3.8.4`), sentence-transformers (`3.3.1`), faiss-cpu (`1.9.0`), PyTorch (`2.14.0`), LangGraph (`1.2.14`), langchain-core (`1.6.9`), langdetect, langid, indic-transliteration, httpx, requests.
- **Key Symbols**: 123 package specifications.
- **Imports / Dependencies**: PyPI.
- **Verified Callers**: `pip install -r requirements.txt`.
- **Nature**: Configuration
- **Status**: Active
- **Observations**: Includes specialized dependencies for multilingual legal analysis and local vector embeddings.

### FILE-008: `ai-service/app/__init__.py`
- **Path**: `ai-service/app/__init__.py` | **Type**: Python | **Layer**: AI Engine
- **Primary Purpose**: Marks `app` as a Python package.
- **Nature**: Initialization | **Status**: Active

### FILE-009: `ai-service/app/main.py`
- **Path**: `ai-service/app/main.py` | **Type**: Python | **Layer**: AI Application Entrypoint
- **Primary Purpose**: Initializes the FastAPI web application, registers routers, configures CORS, and manages server lifecycle.
- **Main Responsibilities**: Configures lifespan logging; mounts CORS middleware for ports 3000 and 5001; mounts routers for `health`, `document`, `language`, `extraction`, `preprocessing`, `analysis`, `risk`, `vector`, and `query`; exposes root metadata route.
- **Key Symbols**: `app`, `lifespan()`, `root()`.
- **Imports / Dependencies**: `fastapi`, `app.config.settings`, all routers in `app.routers`.
- **Verified Callers**: `uvicorn app.main:app`.
- **Nature**: Application Entrypoint
- **Status**: Active
- **Observations**: Lifespan context manager validates directory existence (`storage`, `faiss_indexes`) on startup.

### FILE-010: `ai-service/app/config/__init__.py`
- **Path**: `ai-service/app/config/__init__.py` | **Type**: Python | **Layer**: Configuration Package
- **Primary Purpose**: Marks `config` as a Python package.
- **Nature**: Initialization | **Status**: Active

### FILE-011: `ai-service/app/config/settings.py`
- **Path**: `ai-service/app/config/settings.py` | **Type**: Python | **Layer**: Configuration
- **Primary Purpose**: Strongly-typed configuration management using Pydantic `BaseSettings`.
- **Main Responsibilities**: Resolves `.env` path dynamically; loads `APP_NAME`, `APP_VERSION`, `DEBUG`, `FASTAPI_PORT`, `INTERNAL_API_KEY`, `GEMINI_API_KEY`, `FAISS_INDEX_PATH`, and `UPLOAD_DIR`.
- **Key Symbols**: `Settings` class, `settings` singleton.
- **Imports / Dependencies**: `pydantic_settings.BaseSettings`, `pathlib.Path`.
- **Verified Callers**: Imported across `main.py`, middleware, routers, and services.
- **Nature**: Configuration
- **Status**: Active
- **Observations**: Paths to `faiss_indexes` and `storage` are calculated relative to repository root (`resolve().parents[3]`).

### FILE-012: `ai-service/app/middleware/__init__.py`
- **Path**: `ai-service/app/middleware/__init__.py` | **Type**: Python | **Layer**: Middleware Package
- **Nature**: Initialization | **Status**: Active

### FILE-013: `ai-service/app/middleware/auth.py`
- **Path**: `ai-service/app/middleware/auth.py` | **Type**: Python | **Layer**: Security Middleware
- **Primary Purpose**: Restricts access to the AI service strictly to authenticated backend services via `X-Internal-API-Key`.
- **Main Responsibilities**: Exposes `require_internal_api_key` dependency for router-level protection and `verify_internal_api_key` for global middleware; allows public access to `/health` and `/`.
- **Key Symbols**: `require_internal_api_key()`, `verify_internal_api_key()`.
- **Imports / Dependencies**: `fastapi.security.APIKeyHeader`, `app.config.settings`.
- **Verified Callers**: Applied via `dependencies=[Depends(require_internal_api_key)]` across all operational routers.
- **Nature**: Security / Business Logic
- **Status**: Active
- **Observations**: Ensures that external users and frontend clients cannot invoke heavy LLM or vector endpoints directly.

### FILE-014: `ai-service/app/routers/__init__.py`
- **Path**: `ai-service/app/routers/__init__.py` | **Type**: Python | **Layer**: Routing Package
- **Nature**: Initialization | **Status**: Active

### FILE-015: `ai-service/app/routers/health.py`
- **Path**: `ai-service/app/routers/health.py` | **Type**: Python | **Layer**: Telemetry / Routing
- **Primary Purpose**: Exposes system health, deep chain verification, and component readiness endpoints.
- **Main Responsibilities**: Handles `GET /health/`, `GET /health/chain-test`, and `GET /health/status`; inspects FAISS path, upload directory, and Gemini API key availability.
- **Key Symbols**: `router`, `health_check()`, `chain_test()`, `detailed_status()`.
- **Imports / Dependencies**: `fastapi.APIRouter`, `app.config.settings`.
- **Verified Callers**: Express backend `health.routes.js`, monitoring agents.
- **Nature**: Routing / Telemetry
- **Status**: Active
- **Observations**: Publicly accessible without requiring internal API key.

### FILE-016: `ai-service/app/routers/document.py`
- **Path**: `ai-service/app/routers/document.py` | **Type**: Python | **Layer**: Pipeline Routing
- **Primary Purpose**: Coordinates the complete multi-stage document ingestion pipeline (`POST /documents/process`).
- **Main Responsibilities**: Saves uploaded document to disk under `storage/<userId>/`; runs language detection, text extraction (OCR/PDF/DOCX/TXT), cleaning & windowed chunking, named entity recognition, clause extraction, risk assessment engine, summary synthesis, and FAISS vector embedding creation; returns unified `ProcessingResponse`.
- **Key Symbols**: `router`, `process_document()`, `document_service_health()`, `ProcessingResponse` Pydantic model.
- **Imports / Dependencies**: `fastapi`, `language_service`, `extraction_service`, `preprocessing_service`, `ner_service`, `clause_service`, `risk_service`, `summary_service`, `vector_service`.
- **Verified Callers**: Express backend `document.service.js` via `sendToAIService`.
- **Nature**: Business Logic / Routing
- **Status**: Active
- **Observations**: Primary computational backbone of the platform; handles failures gracefully at each stage without aborting subsequent non-dependent stages.

### FILE-017: `ai-service/app/routers/language.py`
- **Path**: `ai-service/app/routers/language.py` | **Type**: Python | **Layer**: Routing
- **Primary Purpose**: Exposes standalone language detection and transliteration endpoints.
- **Main Responsibilities**: Handles `POST /language/detect` and `POST /language/transliterate`.
- **Key Symbols**: `router`, `detect_language_endpoint()`, `transliterate_endpoint()`.
- **Imports / Dependencies**: `fastapi`, `app.services.language_service`.
- **Verified Callers**: Standalone language verification tools, test scripts.
- **Nature**: Routing
- **Status**: Active

### FILE-018: `ai-service/app/routers/extraction.py`
- **Path**: `ai-service/app/routers/extraction.py` | **Type**: Python | **Layer**: Routing
- **Primary Purpose**: Exposes direct text extraction endpoints for isolated OCR/text processing tests.
- **Main Responsibilities**: Handles `POST /extraction/extract`.
- **Key Symbols**: `router`, `extract_text_endpoint()`.
- **Imports / Dependencies**: `fastapi`, `app.services.extraction_service`.
- **Verified Callers**: `extractionTest.js`.
- **Nature**: Routing
- **Status**: Active

### FILE-019: `ai-service/app/routers/preprocessing.py`
- **Path**: `ai-service/app/routers/preprocessing.py` | **Type**: Python | **Layer**: Routing
- **Primary Purpose**: Exposes standalone chunking and normalization endpoints.
- **Main Responsibilities**: Handles `POST /preprocessing/clean-and-chunk`.
- **Key Symbols**: `router`, `preprocess_endpoint()`.
- **Imports / Dependencies**: `fastapi`, `app.services.preprocessing_service`.
- **Verified Callers**: `preprocessingTest.js`.
- **Nature**: Routing
- **Status**: Active

### FILE-020: `ai-service/app/routers/analysis.py`
- **Path**: `ai-service/app/routers/analysis.py` | **Type**: Python | **Layer**: Routing
- **Primary Purpose**: Exposes isolated NER and legal clause extraction endpoints.
- **Main Responsibilities**: Handles `POST /analysis/entities` and `POST /analysis/clauses`.
- **Key Symbols**: `router`, `extract_entities_endpoint()`, `extract_clauses_endpoint()`.
- **Imports / Dependencies**: `fastapi`, `app.services.ner_service`, `app.services.clause_service`.
- **Verified Callers**: `analysisTest.js`.
- **Nature**: Routing
- **Status**: Active

### FILE-021: `ai-service/app/routers/risk.py`
- **Path**: `ai-service/app/routers/risk.py` | **Type**: Python | **Layer**: Routing
- **Primary Purpose**: Exposes direct document risk scoring and clause vulnerability evaluation.
- **Main Responsibilities**: Handles `POST /risk/analyze`.
- **Key Symbols**: `router`, `analyze_risk_endpoint()`.
- **Imports / Dependencies**: `fastapi`, `app.services.risk_service`.
- **Verified Callers**: `riskTest.js`.
- **Nature**: Routing
- **Status**: Active

### FILE-022: `ai-service/app/routers/vector.py`
- **Path**: `ai-service/app/routers/vector.py` | **Type**: Python | **Layer**: Routing
- **Primary Purpose**: Manages FAISS vector indexes and semantic similarity queries.
- **Main Responsibilities**: Handles `POST /vector/index`, `POST /vector/search`, `DELETE /vector/{document_id}`.
- **Key Symbols**: `router`, `create_index_endpoint()`, `search_endpoint()`.
- **Imports / Dependencies**: `fastapi`, `app.services.vector_service`.
- **Verified Callers**: Express backend `document.service.js`, `vectorTest.js`.
- **Nature**: Routing
- **Status**: Active

### FILE-023: `ai-service/app/routers/query.py`
- **Path**: `ai-service/app/routers/query.py` | **Type**: Python | **Layer**: RAG Routing
- **Primary Purpose**: Primary conversational QA and question-answering entrypoint.
- **Main Responsibilities**: Handles `POST /query/ask` and `POST /query/router-test`; invokes compiled LangGraph agent graph; exposes category intents and health probes.
- **Key Symbols**: `router`, `ask_question()`, `test_langgraph_router()`, `query_health()`.
- **Imports / Dependencies**: `fastapi`, `app.services.graph_service`, `app.services.query_service`.
- **Verified Callers**: Express backend `document.service.js` via `askDocumentQuestion()`.
- **Nature**: Business Logic / Routing
- **Status**: Active

### FILE-024: `ai-service/app/services/__init__.py`
- **Path**: `ai-service/app/services/__init__.py` | **Type**: Python | **Layer**: Service Package
- **Nature**: Initialization | **Status**: Active

### FILE-025: `ai-service/app/services/language_service.py`
- **Path**: `ai-service/app/services/language_service.py` | **Type**: Python | **Layer**: AI Service / NLP
- **Primary Purpose**: Multilingual language detection (English, Hindi, Gujarati) and Indic transliteration.
- **Main Responsibilities**: Combines `langdetect` and `langid` with Unicode range heuristics for Devanagari (`\u0900-\u097F`) and Gujarati (`\u0A80-\u0AFF`); provides fallback scoring; maps codes to language names.
- **Key Symbols**: `detect_language()`, `prepare_text_for_pipeline()`, `LanguageDetectionResult`.
- **Imports / Dependencies**: `langdetect`, `langid`, `indic_transliteration`.
- **Verified Callers**: `app/routers/document.py`, `app/routers/language.py`.
- **Nature**: Algorithmic / Business Logic
- **Status**: Active

### FILE-026: `ai-service/app/services/extraction_service.py`
- **Path**: `ai-service/app/services/extraction_service.py` | **Type**: Python | **Layer**: AI Service / Parsing
- **Primary Purpose**: Multi-format document text extraction with automatic OCR fallback.
- **Main Responsibilities**: Reads PDF documents with PyMuPDF (`fitz`); evaluates text density; automatically triggers EasyOCR when digital text density is below threshold (< 50 words per page); extracts text from Microsoft Word (`python-docx`) with table parsing; reads plaintext UTF-8/fallback encoded files.
- **Key Symbols**: `extract_text()`, `extract_pdf()`, `extract_docx()`, `extract_txt()`, `RawChunk`, `ExtractionResult`.
- **Imports / Dependencies**: `fitz` (PyMuPDF), `docx` (python-docx), `easyocr`, `PIL.Image`, `pdf2image`.
- **Verified Callers**: `app/routers/document.py`, `app/routers/extraction.py`.
- **Nature**: Algorithmic / Ingestion
- **Status**: Active

### FILE-027: `ai-service/app/services/preprocessing_service.py`
- **Path**: `ai-service/app/services/preprocessing_service.py` | **Type**: Python | **Layer**: AI Service / Preprocessing
- **Primary Purpose**: Text sanitization, Unicode normalization, and sliding-window semantic chunking.
- **Main Responsibilities**: Normalizes whitespace, removes redundant formatting artifacts, detects legal section titles via regex patterns; creates uniform chunks of ~350-500 words with 50-word overlaps; tracks page numbers and section hierarchy.
- **Key Symbols**: `preprocess_chunks()`, `clean_text()`, `ProcessedChunk`, `PreprocessResult`.
- **Imports / Dependencies**: `re`, `unicodedata`.
- **Verified Callers**: `app/routers/document.py`, `app/routers/preprocessing.py`.
- **Nature**: Algorithmic / Preprocessing
- **Status**: Active

### FILE-028: `ai-service/app/services/ner_service.py`
- **Path**: `ai-service/app/services/ner_service.py` | **Type**: Python | **Layer**: AI Service / NLP
- **Primary Purpose**: Legal Named Entity Recognition (NER) for identifying parties, dates, monetary amounts, and jurisdictions.
- **Main Responsibilities**: Uses spaCy `en_core_web_sm` model enhanced with customized legal regex heuristics; extracts contracting entities (`PARTY`), calendar dates (`DATE`), financial sums (`AMOUNT`), and governing bodies; normalizes entity representations.
- **Key Symbols**: `extract_entities()`, `Entity`, `NERResult`.
- **Imports / Dependencies**: `spacy`, `re`.
- **Verified Callers**: `app/routers/document.py`, `app/routers/analysis.py`.
- **Nature**: Algorithmic / NLP
- **Status**: Active

### FILE-029: `ai-service/app/services/clause_service.py`
- **Path**: `ai-service/app/services/clause_service.py` | **Type**: Python | **Layer**: AI Service / Legal Classification
- **Primary Purpose**: Classifies legal provisions into standard contract clause taxonomies.
- **Main Responsibilities**: Classifies chunks into 16 clause categories (`liability`, `termination`, `payment`, `confidentiality`, `indemnity`, `intellectual_property`, `dispute_resolution`, `governing_law`, `force_majeure`, `non_compete`, `non_solicitation`, `warranty`, `amendment`, `assignment`, `notice`, `other`); assigns confidence scores based on legal lexicon density.
- **Key Symbols**: `extract_clauses()`, `ExtractedClause`, `ClauseExtractionResult`.
- **Imports / Dependencies**: `re`.
- **Verified Callers**: `app/routers/document.py`, `app/routers/analysis.py`.
- **Nature**: Algorithmic / Business Logic
- **Status**: Active

### FILE-030: `ai-service/app/services/risk_service.py`
- **Path**: `ai-service/app/services/risk_service.py` | **Type**: Python | **Layer**: AI Service / Risk Engine
- **Primary Purpose**: Evaluates legal liabilities, penal provisions, and assigns structured risk ratings (0-100).
- **Main Responsibilities**: Executes dedicated evaluators (`_eval_termination`, `_eval_liability`, `_eval_payment`, `_eval_confidentiality`, `_eval_non_compete`, `_eval_governing_law`); identifies one-sided indemnities, uncapped liabilities, short notice periods, liquidated damages; aggregates weighted category scores into overall score (0-100) and severity (`low`, `medium`, `high`, `critical`); attaches non-legal-advice disclaimer.
- **Key Symbols**: `analyze_document_risk()`, `RiskFinding`, `RiskAnalysisResult`, `LEGAL_DISCLAIMER`.
- **Imports / Dependencies**: `re`, `math`.
- **Verified Callers**: `app/routers/document.py`, `app/routers/risk.py`, `app/services/graph_service.py`.
- **Nature**: Business Logic / Algorithmic
- **Status**: Active

### FILE-031: `ai-service/app/services/summary_service.py`
- **Path**: `ai-service/app/services/summary_service.py` | **Type**: Python | **Layer**: AI Service / Synthesis
- **Primary Purpose**: Generates structured executive summaries, key obligations, and milestones.
- **Main Responsibilities**: Compiles parties, contract type, term length, and key obligations into a plain-language executive brief; extracts affirmative obligations and calendar milestones; formats key takeaway bullet points.
- **Key Symbols**: `generate_document_summary()`, `SummaryResult`.
- **Imports / Dependencies**: `re`.
- **Verified Callers**: `app/routers/document.py`.
- **Nature**: Business Logic
- **Status**: Active

### FILE-032: `ai-service/app/services/vector_service.py`
- **Path**: `ai-service/app/services/vector_service.py` | **Type**: Python | **Layer**: AI Service / Embeddings & Vector DB
- **Primary Purpose**: Computes vector embeddings and manages local FAISS vector indices.
- **Main Responsibilities**: Uses `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional dense vectors); constructs `faiss.IndexFlatIP` with normalized vectors for exact cosine similarity; persists `.index` binary and `_meta.json` metadata to `faiss_indexes/`; executes k-nearest neighbor similarity search with query expansion.
- **Key Symbols**: `create_and_save_faiss_index()`, `search_faiss_index()`, `delete_faiss_index()`, `get_embedding_model()`.
- **Imports / Dependencies**: `faiss`, `sentence_transformers.SentenceTransformer`, `numpy`, `json`, `pathlib.Path`.
- **Verified Callers**: `app/routers/document.py`, `app/routers/vector.py`, `app/services/graph_service.py`.
- **Nature**: Algorithmic / Vector Database
- **Status**: Active
- **Observations**: CPU-friendly and operates fully locally without requiring external SaaS vector databases like Pinecone.

### FILE-033: `ai-service/app/services/query_service.py`
- **Path**: `ai-service/app/services/query_service.py` | **Type**: Python | **Layer**: AI Service / Query Understanding
- **Primary Purpose**: Analyzes user natural language queries and extracts legal search intent.
- **Main Responsibilities**: Classifies queries into categories (`risk`, `clause`, `summary`, `date`, `general`); extracts search keywords and filters; provides intent payload to LangGraph router.
- **Key Symbols**: `analyze_query()`, `QueryAnalysis`.
- **Imports / Dependencies**: `re`.
- **Verified Callers**: `app/routers/query.py`, `app/services/graph_service.py`.
- **Nature**: Business Logic / NLP
- **Status**: Active

### FILE-034: `ai-service/app/services/evidence_service.py`
- **Path**: `ai-service/app/services/evidence_service.py` | **Type**: Python | **Layer**: AI Service / RAG Verification Gate
- **Primary Purpose**: Evaluates retrieved document chunks to ensure sufficient semantic relevance before calling LLM.
- **Main Responsibilities**: Filters chunks against minimum cosine similarity thresholds (default `0.42`, summary `0.38`); calculates top score and passing chunk count; blocks generation if evidence is insufficient, returning deterministic safe response to eliminate hallucinations.
- **Key Symbols**: `check_evidence()`, `EvidenceDecision`, `SAFE_RESPONSE_MESSAGE`.
- **Imports / Dependencies**: Standard library types.
- **Verified Callers**: `app/services/graph_service.py`.
- **Nature**: Security / Verification Gate
- **Status**: Active
- **Observations**: Critical anti-hallucination safeguard in the RAG pipeline.

### FILE-035: `ai-service/app/services/generation_service.py`
- **Path**: `ai-service/app/services/generation_service.py` | **Type**: Python | **Layer**: AI Service / LLM Integration
- **Primary Purpose**: Prompts Google Gemini LLM API to generate legal answers grounded strictly in retrieved context.
- **Main Responsibilities**: Constructs structured system prompts with strict legal domain boundaries; provides context chunks with page and section identifiers; includes validator feedback during regeneration cycles; parses structured JSON response into answer and citations list; provides offline fallback generation when API key is unconfigured.
- **Key Symbols**: `generate_gemini_answer()`, `_call_gemini_api()`.
- **Imports / Dependencies**: `requests`, `json`, `app.config.settings`.
- **Verified Callers**: `app/services/graph_service.py`.
- **Nature**: LLM Client / Business Logic
- **Status**: Active

### FILE-036: `ai-service/app/services/citation_validator_service.py`
- **Path**: `ai-service/app/services/citation_validator_service.py` | **Type**: Python | **Layer**: AI Service / Citation Verification
- **Primary Purpose**: Verifies that LLM-provided citations exist verbatim in the source document chunks.
- **Main Responsibilities**: Scans citations for exact excerpt matching or high token overlap against filtered chunks; flags fabricated citations, missing page numbers, or ungrounded assertions; calculates support score; returns validation decision and diagnostic feedback.
- **Key Symbols**: `validate_citations()`, `CitationValidationResult`, `SAFE_RESPONSE_INVALID_CITATIONS`.
- **Imports / Dependencies**: `re`, `difflib`.
- **Verified Callers**: `app/services/graph_service.py`.
- **Nature**: Security / Quality Gate
- **Status**: Active

### FILE-037: `ai-service/app/services/graph_service.py`
- **Path**: `ai-service/app/services/graph_service.py` | **Type**: Python | **Layer**: AI Service / StateGraph Orchestration
- **Primary Purpose**: Compiles and executes the LangGraph stateful agent graph for RAG question answering.
- **Main Responsibilities**: Defines `GraphState` TypedDict; wires nodes: `analyzer`, `rag_node`, `risk_node`, `summary_node`, `evidence_checker`, `safe_response_node`, `gemini_generation_node`, `citation_validator`, `citation_safe_response_node`, `finalize_node`; handles conditional routing and controlled single-pass regeneration loop (`MAX_REGENERATIONS = 1`).
- **Key Symbols**: `workflow`, `agent_graph`, `run_agent_graph()`, `GraphState`.
- **Imports / Dependencies**: `langgraph.graph.StateGraph`, `app.services.*`.
- **Verified Callers**: `app/routers/query.py`.
- **Nature**: Orchestration / Core Architecture
- **Status**: Active
- **Observations**: Highly sophisticated state machine combining semantic routing, evidence checking, LLM inference, and citation verification.

### FILE-038: `ai-service/app/utils/__init__.py`
- **Path**: `ai-service/app/utils/__init__.py` | **Type**: Python | **Layer**: Utility Package
- **Nature**: Initialization | **Status**: Active

---

## 3. Backend Application Service (`backend/node-server/`)

### FILE-039: `backend/node-server/package.json`
- **Path**: `backend/node-server/package.json` | **Type**: JSON | **Layer**: Backend Manifest
- **Primary Purpose**: Node.js package manifest and dependency declarations.
- **Main Responsibilities**: Declares scripts (`dev`, `start`); specifies dependencies (`express`, `mongoose`, `jsonwebtoken`, `bcryptjs`, `multer`, `pdfkit`, `axios`, `cors`, `helmet`, `morgan`, `uuid`, `dotenv`).
- **Key Symbols**: Manifest fields.
- **Imports / Dependencies**: npm.
- **Verified Callers**: `npm run dev`, `npm start`.
- **Nature**: Configuration
- **Status**: Active

### FILE-040: `backend/node-server/package-lock.json`
- **Path**: `backend/node-server/package-lock.json` | **Type**: JSON | **Layer**: Backend Lockfile
- **Primary Purpose**: Deterministic dependency tree lockfile.
- **Nature**: Configuration | **Status**: Active

### FILE-041: `backend/node-server/src/server.js`
- **Path**: `backend/node-server/src/server.js` | **Type**: JavaScript (Node.js) | **Layer**: Server Entrypoint
- **Primary Purpose**: Application bootstrap script that connects to MongoDB and starts the Express HTTP server.
- **Main Responsibilities**: Invokes `connectDB()`; binds `app.listen()` on configured `PORT` (default 5001); logs startup banners with environment telemetry; handles fatal startup errors with exit code 1.
- **Key Symbols**: `startServer()`.
- **Imports / Dependencies**: `./app`, `./config/database`, `./config/env`.
- **Verified Callers**: Node runtime (`node src/server.js`).
- **Nature**: Application Bootstrap
- **Status**: Active

### FILE-042: `backend/node-server/src/app.js`
- **Path**: `backend/node-server/src/app.js` | **Type**: JavaScript (Express) | **Layer**: Express Application
- **Primary Purpose**: Configures Express application middleware, security headers, CORS policies, and mounts routes.
- **Main Responsibilities**: Configures Helmet with `crossOriginResourcePolicy: false` (to allow streaming documents); configures CORS whitelist for ports 3000 and 5001; configures JSON/urlencoded body parsers (50MB limit); registers `morgan` and custom `requestLogger`; mounts `/api/health`, `/api/auth`, `/api/admin`, `/api/documents`, `/api/reports`; attaches `notFound` and global `errorHandler`.
- **Key Symbols**: `app` (Express application instance).
- **Imports / Dependencies**: `express`, `cors`, `helmet`, `morgan`, middleware modules, route modules.
- **Verified Callers**: `server.js`, integration test scripts.
- **Nature**: Application Configuration
- **Status**: Active

### FILE-043: `backend/node-server/src/config/database.js`
- **Path**: `backend/node-server/src/config/database.js` | **Type**: JavaScript | **Layer**: Database Connection
- **Primary Purpose**: Establishes and manages the Mongoose MongoDB connection.
- **Main Responsibilities**: Connects using `config.MONGO_URI`; registers connection event listeners (`connected`, `error`, `disconnected`); logs sanitized connection URI.
- **Key Symbols**: `connectDB()`.
- **Imports / Dependencies**: `mongoose`, `./env`.
- **Verified Callers**: `server.js`.
- **Nature**: Persistence Configuration
- **Status**: Active

### FILE-044: `backend/node-server/src/config/env.js`
- **Path**: `backend/node-server/src/config/env.js` | **Type**: JavaScript | **Layer**: Configuration
- **Primary Purpose**: Centralized environment variable loader and fallback manager.
- **Main Responsibilities**: Loads root `.env` via `dotenv`; exports sanitized configuration object with fallback defaults for `PORT`, `NODE_ENV`, `MONGO_URI`, `JWT_SECRET`, `AI_SERVICE_URL`, `INTERNAL_API_KEY`.
- **Key Symbols**: `config` object.
- **Imports / Dependencies**: `dotenv`, `path`.
- **Verified Callers**: Imported across backend controllers, services, middleware, and tests.
- **Nature**: Configuration
- **Status**: Active

### FILE-045: `backend/node-server/src/middleware/auth.middleware.js`
- **Path**: `backend/node-server/src/middleware/auth.middleware.js` | **Type**: JavaScript | **Layer**: Security Middleware
- **Primary Purpose**: Validates JWT authentication tokens and populates `req.user`.
- **Main Responsibilities**: Extracts Bearer token from `Authorization` header; verifies signature using `JWT_SECRET`; retrieves user from DB; verifies account is active and not soft-deleted; attaches clean user document to `req.user`.
- **Key Symbols**: `protect()`.
- **Imports / Dependencies**: `jsonwebtoken`, `../models/User.model`, `../config/env`.
- **Verified Callers**: Mounted across `auth.routes.js`, `document.routes.js`, `admin.routes.js`, `report.routes.js`.
- **Nature**: Security / Middleware
- **Status**: Active

### FILE-046: `backend/node-server/src/middleware/role.middleware.js`
- **Path**: `backend/node-server/src/middleware/role.middleware.js` | **Type**: JavaScript | **Layer**: Authorization Middleware
- **Primary Purpose**: Enforces Role-Based Access Control (RBAC).
- **Main Responsibilities**: `adminOnly` checks `req.user.role === 'admin'`; `requireRole(...)` verifies specific enumerated roles; returns 403 Forbidden with clear error payload.
- **Key Symbols**: `adminOnly()`, `requireRole()`.
- **Imports / Dependencies**: None.
- **Verified Callers**: `admin.routes.js`.
- **Nature**: Security / Middleware
- **Status**: Active

### FILE-047: `backend/node-server/src/middleware/ownership.middleware.js`
- **Path**: `backend/node-server/src/middleware/ownership.middleware.js` | **Type**: JavaScript | **Layer**: Security Middleware
- **Primary Purpose**: Enforces document tenancy and ownership isolation.
- **Main Responsibilities**: Checks that the document requested via `req.params.id` belongs to `req.user._id`; permits bypass for users with `admin` role; returns 404 if not found or 403 if unauthorized.
- **Key Symbols**: `requireDocumentOwnership()`.
- **Imports / Dependencies**: `../models/Document.model`.
- **Verified Callers**: Applied to all single-document operations in `document.routes.js`.
- **Nature**: Security / Middleware
- **Status**: Active

### FILE-048: `backend/node-server/src/middleware/upload.middleware.js`
- **Path**: `backend/node-server/src/middleware/upload.middleware.js` | **Type**: JavaScript | **Layer**: Ingestion Middleware
- **Primary Purpose**: Handles multipart/form-data contract uploads via Multer.
- **Main Responsibilities**: Configures disk storage in local `storage/tmp/` directory; enforces 50MB file size limits; validates MIME types against whitelist (`pdf`, `docx`, `txt`); provides `requireFile` assertion middleware.
- **Key Symbols**: `uploadSingle`, `requireFile`.
- **Imports / Dependencies**: `multer`, `path`, `fs`.
- **Verified Callers**: `document.routes.js` (`/upload`, `/:id/versions`).
- **Nature**: Middleware / Ingestion
- **Status**: Active

### FILE-049: `backend/node-server/src/middleware/errorHandler.js`
- **Path**: `backend/node-server/src/middleware/errorHandler.js` | **Type**: JavaScript | **Layer**: Error Handling Middleware
- **Primary Purpose**: Centralized Express error interceptor and responder.
- **Main Responsibilities**: Catches unhandled errors; maps Mongoose `ValidationError`, `CastError`, duplicate key code 11000, and Multer errors to standardized JSON payloads `{ success: false, error: { code, message } }`; masks internal stack traces in production.
- **Key Symbols**: `errorHandler()`.
- **Imports / Dependencies**: `../config/env`.
- **Verified Callers**: `app.js`.
- **Nature**: Middleware / Resilience
- **Status**: Active

### FILE-050: `backend/node-server/src/middleware/notFound.js`
- **Path**: `backend/node-server/src/middleware/notFound.js` | **Type**: JavaScript | **Layer**: Middleware
- **Primary Purpose**: 404 handler for unrecognized API route paths.
- **Main Responsibilities**: Returns 404 with structured JSON indicating route was not found.
- **Key Symbols**: `notFound()`.
- **Imports / Dependencies**: None.
- **Verified Callers**: `app.js`.
- **Nature**: Middleware
- **Status**: Active

### FILE-051: `backend/node-server/src/middleware/requestLogger.js`
- **Path**: `backend/node-server/src/middleware/requestLogger.js` | **Type**: JavaScript | **Layer**: Observability Middleware
- **Primary Purpose**: Structured logging of HTTP requests, response times, and status codes.
- **Main Responsibilities**: Logs method, URL, status code, duration in milliseconds, and authenticated user ID.
- **Key Symbols**: `requestLogger()`.
- **Imports / Dependencies**: None.
- **Verified Callers**: `app.js`.
- **Nature**: Observability / Logging
- **Status**: Active

### FILE-052: `backend/node-server/src/models/index.js`
- **Path**: `backend/node-server/src/models/index.js` | **Type**: JavaScript | **Layer**: Data Access Layer
- **Primary Purpose**: Central barrel export for all Mongoose models.
- **Main Responsibilities**: Re-exports `User`, `Document`, `DocumentMetadata`, `AnalysisResult`, `RiskFinding`, `ChatHistory`, `Report`, `ContractReminder`.
- **Key Symbols**: Model exports.
- **Imports / Dependencies**: Individual model files.
- **Verified Callers**: Controllers, services, and tests.
- **Nature**: Data Access
- **Status**: Active

### FILE-053: `backend/node-server/src/models/User.model.js`
- **Path**: `backend/node-server/src/models/User.model.js` | **Type**: JavaScript | **Layer**: Persistence Model
- **Primary Purpose**: MongoDB schema and model for user identity, authentication, and role authorization.
- **Main Responsibilities**: Enforces email uniqueness, role enum (`normal_user`, `admin`), preferred language; bcrypt pre-save password hashing (12 rounds); password comparison method; soft-deletion flags (`isDeleted`, `deletedAt`, `deletedBy`); `toPublicJSON()` safe profile serializer.
- **Key Symbols**: `User` model, `UserSchema`.
- **Imports / Dependencies**: `mongoose`, `bcryptjs`.
- **Verified Callers**: `auth.service.js`, `admin.controller.js`, `auth.middleware.js`.
- **Nature**: Data Model / Business Logic
- **Status**: Active

### FILE-054: `backend/node-server/src/models/Document.model.js`
- **Path**: `backend/node-server/src/models/Document.model.js` | **Type**: JavaScript | **Layer**: Persistence Model
- **Primary Purpose**: Master document metadata record and revision version tracking.
- **Main Responsibilities**: Stores `userId`, `originalName`, `storedName`, `filePath`, `fileSize`, `fileFormat`, `mimeType`, `documentType`, `detectedLanguage`, `processingStatus` (`pending`, `processing`, `completed`, `failed`), `version`, `parentDocumentId`, `versionComment`; provides Mongoose virtuals for `metadata`, `analysis`, `riskFindings`, `chatHistory`, `reports`, `versions`; soft-delete query pre-hook.
- **Key Symbols**: `Document` model, `DocumentSchema`.
- **Imports / Dependencies**: `mongoose`.
- **Verified Callers**: `document.service.js`, `document.controller.js`, `ownership.middleware.js`.
- **Nature**: Data Model
- **Status**: Active

### FILE-055: `backend/node-server/src/models/DocumentMetadata.model.js`
- **Path**: `backend/node-server/src/models/DocumentMetadata.model.js` | **Type**: JavaScript | **Layer**: Persistence Model
- **Primary Purpose**: Detailed extraction metrics and technical file characteristics.
- **Main Responsibilities**: Stores `pageCount`, `wordCount`, `characterCount`, `chunkCount`, `detectedLanguage`, `languageConfidence`, `ocrUsed`, `ocrConfidence`, `extractionMethod`, `extractedAt`, `extractedText`, `processingDurationMs`.
- **Key Symbols**: `DocumentMetadata` model.
- **Imports / Dependencies**: `mongoose`.
- **Verified Callers**: `document.service.js`, `report.service.js`.
- **Nature**: Data Model
- **Status**: Active

### FILE-056: `backend/node-server/src/models/AnalysisResult.model.js`
- **Path**: `backend/node-server/src/models/AnalysisResult.model.js` | **Type**: JavaScript | **Layer**: Persistence Model
- **Primary Purpose**: Persists extracted legal entities, clauses, key dates, and summaries.
- **Main Responsibilities**: Stores subdocuments: `entities` (parties, dates, amounts), `parties`, `keyDates`, `clauses` (with type, text, confidence, page, section), and `summary` (`fullSummary`, `keyPoints`, `obligations`, `importantDates`).
- **Key Symbols**: `AnalysisResult` model.
- **Imports / Dependencies**: `mongoose`.
- **Verified Callers**: `document.service.js`, `report.service.js`, `contractObligationsHelper.js`.
- **Nature**: Data Model
- **Status**: Active

### FILE-057: `backend/node-server/src/models/RiskFinding.model.js`
- **Path**: `backend/node-server/src/models/RiskFinding.model.js` | **Type**: JavaScript | **Layer**: Persistence Model
- **Primary Purpose**: Stores calculated risk evaluations, category breakdowns, and flagged clauses.
- **Main Responsibilities**: Stores `overallRiskScore` (0-100), `overallRiskLevel`, `riskCategories` (liability, termination, payment, etc.), `flaggedClauses` (clause text, risk score, severity, reason, suggestion, page), risk counters (`criticalCount`, `highCount`, `mediumCount`, `lowCount`).
- **Key Symbols**: `RiskFinding` model.
- **Imports / Dependencies**: `mongoose`.
- **Verified Callers**: `document.service.js`, `report.service.js`, `admin.controller.js`.
- **Nature**: Data Model
- **Status**: Active

### FILE-058: `backend/node-server/src/models/ChatHistory.model.js`
- **Path**: `backend/node-server/src/models/ChatHistory.model.js` | **Type**: JavaScript | **Layer**: Persistence Model
- **Primary Purpose**: Stores persistent conversational threads between users and contracts.
- **Main Responsibilities**: Stores array of messages containing role, query, answer, routed path, evidence found flag, citation validated flag, safe response flag, response time, and structured citations (`page`, `section`, `excerpt`).
- **Key Symbols**: `ChatHistory` model.
- **Imports / Dependencies**: `mongoose`.
- **Verified Callers**: `document.service.js`, `report.service.js`.
- **Nature**: Data Model
- **Status**: Active

### FILE-059: `backend/node-server/src/models/Report.model.js`
- **Path**: `backend/node-server/src/models/Report.model.js` | **Type**: JavaScript | **Layer**: Persistence Model
- **Primary Purpose**: Tracks generated PDF audit dossiers and download telemetry.
- **Main Responsibilities**: Stores `documentId`, `userId`, `reportType`, `reportName`, `filePath`, `fileSize`, `status`, `downloadCount`, `lastDownloadAt`, generation flags.
- **Key Symbols**: `Report` model.
- **Imports / Dependencies**: `mongoose`.
- **Verified Callers**: `report.service.js`, `report.controller.js`.
- **Nature**: Data Model
- **Status**: Active

### FILE-060: `backend/node-server/src/models/ContractReminder.model.js`
- **Path**: `backend/node-server/src/models/ContractReminder.model.js` | **Type**: JavaScript | **Layer**: Persistence Model
- **Primary Purpose**: Tracks scheduled obligation reminders and calendar notification alerts.
- **Main Responsibilities**: Stores `documentId`, `userId`, `obligationId`, `title`, `category`, `dueDate`, `reminderDate`, `offsetDays`, `notificationChannel`, `status` (`scheduled`, `active`, `dismissed`, `completed`), `notes`.
- **Key Symbols**: `ContractReminder` model.
- **Imports / Dependencies**: `mongoose`.
- **Verified Callers**: `document.service.js`, `document.controller.js`.
- **Nature**: Data Model
- **Status**: Active

### FILE-061: `backend/node-server/src/controllers/auth.controller.js`
- **Path**: `backend/node-server/src/controllers/auth.controller.js` | **Type**: JavaScript | **Layer**: Controller
- **Primary Purpose**: HTTP request handling for user authentication, registration, session profiles, and security.
- **Main Responsibilities**: Handlers for `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PUT /api/auth/update-profile`, `PUT /api/auth/change-password`, `POST /api/auth/logout`.
- **Key Symbols**: `register`, `login`, `getMe`, `updateProfile`, `changePassword`, `logout`.
- **Imports / Dependencies**: `../services/auth.service`, `../models/User.model`.
- **Verified Callers**: `auth.routes.js`.
- **Nature**: Controller / Orchestration
- **Status**: Active

### FILE-062: `backend/node-server/src/controllers/admin.controller.js`
- **Path**: `backend/node-server/src/controllers/admin.controller.js` | **Type**: JavaScript | **Layer**: Controller
- **Primary Purpose**: HTTP request handling for administrative user management and platform analytics.
- **Main Responsibilities**: Handlers for listing users with pagination & search, user status toggling (with self-deactivation safeguards), user role changes, secure soft-deletion (with last-admin protection), user restoration, system stats, and multi-window analytics aggregations.
- **Key Symbols**: `getAllUsers`, `getUserById`, `updateUserStatus`, `updateUserRole`, `deleteUser`, `restoreUser`, `getSystemStats`, `getAdminAnalytics`.
- **Imports / Dependencies**: `../models/User.model`, `../models/Document.model`, `../models/RiskFinding.model`, `../models/AnalysisResult.model`.
- **Verified Callers**: `admin.routes.js`.
- **Nature**: Controller / Admin Logic
- **Status**: Active

### FILE-063: `backend/node-server/src/controllers/document.controller.js`
- **Path**: `backend/node-server/src/controllers/document.controller.js` | **Type**: JavaScript | **Layer**: Controller
- **Primary Purpose**: HTTP request handling for document lifecycle, streaming, versioning, obligations, and RAG chat.
- **Main Responsibilities**: Handlers for document upload (initiating async AI pipeline), document listing, single document retrieval with virtual population, status checking, document deletion, file streaming, version uploading & lineage listing, clause comparison diffing, obligations extraction, reminder scheduling/CRUD, calendar `.ics` download, user-wide reminder listing, activity feed aggregation, and upcoming obligation querying.
- **Key Symbols**: 22 exported handler functions.
- **Imports / Dependencies**: `../services/document.service`, `../models`.
- **Verified Callers**: `document.routes.js`, `admin.routes.js`.
- **Nature**: Controller / Business Orchestration
- **Status**: Active

### FILE-064: `backend/node-server/src/controllers/report.controller.js`
- **Path**: `backend/node-server/src/controllers/report.controller.js` | **Type**: JavaScript | **Layer**: Controller
- **Primary Purpose**: HTTP request handling for PDF audit report generation and downloading.
- **Main Responsibilities**: Handlers for `POST /api/reports/generate/:id`, `GET /api/reports`, `GET /api/reports/:id/download` (streaming PDF with attachment headers), `DELETE /api/reports/:id`.
- **Key Symbols**: `generateReport`, `listReports`, `downloadReport`, `deleteReport`.
- **Imports / Dependencies**: `../services/report.service`, `fs`.
- **Verified Callers**: `report.routes.js`.
- **Nature**: Controller
- **Status**: Active

### FILE-065: `backend/node-server/src/routes/auth.routes.js`
- **Path**: `backend/node-server/src/routes/auth.routes.js` | **Type**: JavaScript | **Layer**: HTTP Routing
- **Primary Purpose**: Defines `/api/auth` endpoints.
- **Main Responsibilities**: Maps HTTP routes to auth controller handlers; applies `protect` middleware to private routes (`/me`, `/update-profile`, `/change-password`, `/logout`).
- **Key Symbols**: Express `router`.
- **Imports / Dependencies**: `express`, `../controllers/auth.controller`, `../middleware/auth.middleware`.
- **Verified Callers**: `app.js`.
- **Nature**: Routing
- **Status**: Active

### FILE-066: `backend/node-server/src/routes/admin.routes.js`
- **Path**: `backend/node-server/src/routes/admin.routes.js` | **Type**: JavaScript | **Layer**: HTTP Routing
- **Primary Purpose**: Defines `/api/admin` endpoints protected by both JWT authentication and admin role enforcement.
- **Main Responsibilities**: Maps `/users`, `/analytics`, `/documents`, and `/stats` endpoints.
- **Key Symbols**: Express `router`.
- **Imports / Dependencies**: `express`, `../controllers/admin.controller`, `../controllers/document.controller`, `auth.middleware`, `role.middleware`.
- **Verified Callers**: `app.js`.
- **Nature**: Routing
- **Status**: Active

### FILE-067: `backend/node-server/src/routes/document.routes.js`
- **Path**: `backend/node-server/src/routes/document.routes.js` | **Type**: JavaScript | **Layer**: HTTP Routing
- **Primary Purpose**: Defines `/api/documents` endpoints for document management, analysis, versions, obligations, and chat.
- **Main Responsibilities**: Applies `protect` to all endpoints; mounts collection routes before parameter routes (`/types`, `/upload`, `/reminders/all`, `/activity/feed`, `/obligations/upcoming`); mounts single-document routes protected by `requireDocumentOwnership`.
- **Key Symbols**: Express `router`.
- **Imports / Dependencies**: `express`, `../controllers/document.controller`, `auth.middleware`, `ownership.middleware`, `upload.middleware`.
- **Verified Callers**: `app.js`.
- **Nature**: Routing
- **Status**: Active

### FILE-068: `backend/node-server/src/routes/report.routes.js`
- **Path**: `backend/node-server/src/routes/report.routes.js` | **Type**: JavaScript | **Layer**: HTTP Routing
- **Primary Purpose**: Defines `/api/reports` endpoints.
- **Main Responsibilities**: Maps list, generate, download, and delete routes with authentication.
- **Key Symbols**: Express `router`.
- **Imports / Dependencies**: `express`, `../controllers/report.controller`, `auth.middleware`.
- **Verified Callers**: `app.js`.
- **Nature**: Routing
- **Status**: Active

### FILE-069: `backend/node-server/src/routes/health.routes.js`
- **Path**: `backend/node-server/src/routes/health.routes.js` | **Type**: JavaScript | **Layer**: HTTP Routing
- **Primary Purpose**: Exposes system health and full-chain connectivity verification routes.
- **Main Responsibilities**: `GET /api/health` (Express & MongoDB status); `GET /api/health/ai-service` (FastAPI connectivity); `GET /api/health/chain-test` (End-to-end multi-tier ping test).
- **Key Symbols**: Express `router`.
- **Imports / Dependencies**: `express`, `mongoose`, `../services/aiService`, `../config/env`.
- **Verified Callers**: `app.js`.
- **Nature**: Routing / Diagnostics
- **Status**: Active

### FILE-070: `backend/node-server/src/services/aiService.js`
- **Path**: `backend/node-server/src/services/aiService.js` | **Type**: JavaScript | **Layer**: Service / Gateway
- **Primary Purpose**: Axios HTTP client configured for communicating with the FastAPI AI Service.
- **Main Responsibilities**: Manages base URL, 30s timeout, and attaches `X-Internal-API-Key`; provides `checkAIServiceHealth()`, `chainTest()`, and generic HTTP wrappers.
- **Key Symbols**: `aiServiceClient`, `checkAIServiceHealth()`, `chainTest()`.
- **Imports / Dependencies**: `axios`, `../config/env`.
- **Verified Callers**: `document.service.js`, `health.routes.js`.
- **Nature**: Integration / Gateway
- **Status**: Active

### FILE-071: `backend/node-server/src/services/document.service.js`
- **Path**: `backend/node-server/src/services/document.service.js` | **Type**: JavaScript | **Layer**: Service / Core Business Logic
- **Primary Purpose**: Comprehensive document management, background AI processing orchestration, versioning, obligations extraction, and user feeds.
- **Main Responsibilities**: Validates document types; creates Document records; dispatches files to FastAPI via FormData; processes and persists extraction results (`DocumentMetadata`, `AnalysisResult`, `RiskFinding`); manages document deletion and FAISS cleanup; provides Q&A RAG chat integration and history persistence; implements version uploading and version lineage; provides side-by-side clause comparison; extracts contract obligations and timeline; manages contract reminder CRUD and `.ics` generation; generates chronological user activity feeds and upcoming obligations across contracts.
- **Key Symbols**: 20+ exported business service functions.
- **Imports / Dependencies**: `axios`, `form-data`, `fs`, `path`, all Mongoose models, `contractObligationsHelper`, `diffHelper`.
- **Verified Callers**: `document.controller.js`.
- **Nature**: Core Business Logic
- **Status**: Active

### FILE-072: `backend/node-server/src/services/report.service.js`
- **Path**: `backend/node-server/src/services/report.service.js` | **Type**: JavaScript | **Layer**: Service / PDF Generation
- **Primary Purpose**: Generates comprehensive PDF audit dossiers using PDFKit.
- **Main Responsibilities**: Compiles contract metadata, risk scorecard, executive summary, key clauses, obligations timeline, and verified chat Q&A history into an enterprise branded PDF report; tracks download counts and disk file persistence in `reports/`.
- **Key Symbols**: `generateDocumentReport()`, `listUserReports()`, `downloadReport()`, `deleteReport()`.
- **Imports / Dependencies**: `pdfkit`, `fs`, `path`, Mongoose models.
- **Verified Callers**: `report.controller.js`.
- **Nature**: Business Logic / Generation
- **Status**: Active

### FILE-073: `backend/node-server/src/utils/diffHelper.js`
- **Path**: `backend/node-server/src/utils/diffHelper.js` | **Type**: JavaScript | **Layer**: Utility / Algorithms
- **Primary Purpose**: Token-level Longest Common Subsequence (LCS) diff calculation engine for contract version comparison.
- **Main Responsibilities**: Tokenizes text into words and punctuation; computes dynamic programming LCS matrix; backtracks to generate added, removed, and unchanged chunks; aggregates statistics (similarity score, added/removed counts); generates clause-by-clause legal diff comparisons.
- **Key Symbols**: `computeTokenDiff()`, `compareContractClauses()`, `computeLCS()`.
- **Imports / Dependencies**: None (pure algorithmic implementation).
- **Verified Callers**: `document.service.js` (`compareDocuments`).
- **Nature**: Utility / Algorithm
- **Status**: Active
- **Observations**: Authentic word-level diffing without hallucinated or simulated data.

### FILE-074: `backend/node-server/src/utils/contractObligationsHelper.js`
- **Path**: `backend/node-server/src/utils/contractObligationsHelper.js` | **Type**: JavaScript | **Layer**: Utility / Temporal Analysis
- **Primary Purpose**: High-precision extraction and classification of contract deadlines, renewal windows, notice periods, and covenants.
- **Main Responsibilities**: Parses natural language legal dates (`parseCalendarDate`); classifies obligations into categories (`START_DATE`, `EXPIRATION_DATE`, `RENEWAL_DATE`, `NOTICE_PERIOD`, `TERMINATION_DEADLINE`, `PAYMENT_DEADLINE`, `AFFIRMATIVE_OBLIGATION`); evaluates certainty (`EXPLICIT_DATE`, `INFERRED_DATE`, `PERIOD_OFFSET`, `AMBIGUOUS`); assigns urgency ratings (`CRITICAL`, `WARNING`, `UPCOMING`, `RESOLVED`); builds chronological timeline.
- **Key Symbols**: `extractContractObligations()`, `parseCalendarDate()`, `toIsoDate()`.
- **Imports / Dependencies**: `fs`.
- **Verified Callers**: `document.service.js`.
- **Nature**: Utility / Legal Domain Logic
- **Status**: Active

### FILE-075: `backend/node-server/src/utils/jwt.utils.js`
- **Path**: `backend/node-server/src/utils/jwt.utils.js` | **Type**: JavaScript | **Layer**: Utility / Cryptography
- **Primary Purpose**: Helper functions for signing and verifying JSON Web Tokens.
- **Main Responsibilities**: Generates tokens with standard expiry; verifies token signatures.
- **Key Symbols**: `signToken()`, `verifyToken()`.
- **Imports / Dependencies**: `jsonwebtoken`, `../config/env`.
- **Verified Callers**: `auth.service.js`, `authTest.js`.
- **Nature**: Utility
- **Status**: Active

### FILE-076: `backend/node-server/src/utils/makeAdmin.js`
- **Path**: `backend/node-server/src/utils/makeAdmin.js` | **Type**: JavaScript | **Layer**: CLI Script
- **Primary Purpose**: CLI maintenance utility to elevate a user email to administrator status.
- **Main Responsibilities**: Connects to MongoDB, finds user by email passed via CLI argument, updates `role: 'admin'`, logs confirmation.
- **Key Symbols**: Script entrypoint.
- **Imports / Dependencies**: `mongoose`, `../models/User.model`, `../config/env`.
- **Verified Callers**: Manual administrator execution.
- **Nature**: Maintenance Script
- **Status**: Active

### FILES-077 to 092: Backend Verification & Test Suites (`backend/node-server/src/utils/*Test.js`)
- **FILE-077**: `analysisDetailTest.js` — Verifies detailed analysis payloads.
- **FILE-078**: `analysisTest.js` — Tests NER and clause extraction endpoints.
- **FILE-079**: `authTest.js` — Tests user registration, login, and token generation.
- **FILE-080**: `citationValidatorTest.js` — Verifies citation validation logic against text chunks.
- **FILE-081**: `documentTest.js` — Tests document upload and storage record creation.
- **FILE-082**: `evidenceCheckerTest.js` — Tests evidence gate scoring and thresholding.
- **FILE-083**: `extractionTest.js` — Tests text extraction from sample text files.
- **FILE-084**: `geminiGenerationTest.js` — Tests LLM generation calls and fallback routines.
- **FILE-085**: `langgraphRouterTest.js` — Tests LangGraph agent graph node traversal.
- **FILE-086**: `languageTest.js` — Tests language detection accuracy for English, Hindi, Gujarati.
- **FILE-087**: `modelTest.js` — Validates Mongoose schema rules, defaults, and indexes.
- **FILE-088**: `preprocessingTest.js` — Tests text sanitization and windowed chunking.
- **FILE-089**: `queryTest.js` — Tests query intent extraction and categorization.
- **FILE-090**: `reportTest.js` — Tests PDF dossier generation with PDFKit.
- **FILE-091**: `riskTest.js` — Tests risk scoring rules and severity classifications.
- **FILE-092**: `vectorTest.js` — Tests FAISS index generation and similarity queries.
- **Nature**: Integration & Unit Test Scripts | **Status**: Active (Diagnostic Suites)

---

## 4. Frontend Application (`frontend/`)

### FILE-093: `frontend/package.json`
- **Path**: `frontend/package.json` | **Type**: JSON | **Layer**: Frontend Manifest
- **Primary Purpose**: Defines React application dependencies and build scripts.
- **Main Responsibilities**: Scripts: `dev` (`vite`), `build` (`vite build`), `lint` (`eslint .`), `preview` (`vite preview`); dependencies: `react` (`^18.2.0`), `react-dom`, `react-router-dom` (`^6.20.0`), `axios` (`^1.6.0`), `lucide-react` (`^0.292.0`), `recharts` (`^2.10.3`).
- **Key Symbols**: Manifest fields.
- **Imports / Dependencies**: npm.
- **Verified Callers**: Vite, ESLint.
- **Nature**: Configuration
- **Status**: Active

### FILE-094: `frontend/package-lock.json`
- **Path**: `frontend/package-lock.json` | **Type**: JSON | **Layer**: Frontend Lockfile
- **Primary Purpose**: Deterministic dependency lockfile for the frontend application.
- **Nature**: Configuration | **Status**: Active

### FILE-095: `frontend/vite.config.js`
- **Path**: `frontend/vite.config.js` | **Type**: JavaScript | **Layer**: Bundler Config
- **Primary Purpose**: Configuration for Vite bundler and development server.
- **Main Responsibilities**: Configures `@vitejs/plugin-react`; binds dev server to port 3000; enables proxying or CORS support.
- **Key Symbols**: Vite config export.
- **Imports / Dependencies**: `vite`, `@vitejs/plugin-react`.
- **Verified Callers**: Vite CLI.
- **Nature**: Configuration
- **Status**: Active

### FILE-096: `frontend/eslint.config.js`
- **Path**: `frontend/eslint.config.js` | **Type**: JavaScript | **Layer**: Code Quality Config
- **Primary Purpose**: Flat ESLint configuration for React 18 and ESModules.
- **Main Responsibilities**: Configures rules for JS, React hooks, and refresh plugins.
- **Key Symbols**: ESLint config export.
- **Imports / Dependencies**: `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`.
- **Verified Callers**: `npm run lint`.
- **Nature**: Configuration
- **Status**: Active

### FILE-097: `frontend/index.html`
- **Path**: `frontend/index.html` | **Type**: HTML5 | **Layer**: HTML Entrypoint
- **Primary Purpose**: Single Page Application root HTML template.
- **Main Responsibilities**: Loads Inter font from Google Fonts; defines `#root` mount container; includes `/src/main.jsx` script module.
- **Key Symbols**: `#root`.
- **Imports / Dependencies**: Google Fonts.
- **Verified Callers**: Browser.
- **Nature**: UI Entrypoint
- **Status**: Active

### FILE-098: `frontend/README.md`
- **Path**: `frontend/README.md` | **Type**: Markdown | **Layer**: Documentation
- **Primary Purpose**: Developer guide for frontend setup and styling conventions.
- **Nature**: Documentation | **Status**: Active

### FILE-099: `frontend/public/favicon.svg`
- **Path**: `frontend/public/favicon.svg` | **Type**: SVG Image | **Layer**: Public Asset
- **Primary Purpose**: Legal balance scale SVG icon for browser tab.
- **Nature**: Static Asset | **Status**: Active

### FILE-100: `frontend/public/icons.svg`
- **Path**: `frontend/public/icons.svg` | **Type**: SVG Sprite Sheet | **Layer**: Public Asset
- **Primary Purpose**: Reusable SVG sprite symbols for application icons.
- **Nature**: Static Asset | **Status**: Active

### FILE-101: `frontend/src/main.jsx`
- **Path**: `frontend/src/main.jsx` | **Type**: JSX (JavaScript) | **Layer**: Frontend Mount Entrypoint
- **Primary Purpose**: Mounts the React application to the DOM using React 18 `createRoot`.
- **Main Responsibilities**: Imports `React`, `ReactDOM`, and `App`; binds to `document.getElementById('root')`.
- **Key Symbols**: Root mount script.
- **Imports / Dependencies**: `react`, `react-dom/client`, `./App.jsx`.
- **Verified Callers**: `index.html`.
- **Nature**: Application Bootstrap
- **Status**: Active

### FILE-102: `frontend/src/App.jsx`
- **Path**: `frontend/src/App.jsx` | **Type**: JSX | **Layer**: Frontend Root Router
- **Primary Purpose**: Root component configuring providers, routing tree, and protected workspace shells.
- **Main Responsibilities**: Wraps application in `ThemeProvider` and `AuthProvider`; defines public routes (`/`, `/login`, `/register`); defines protected normal user shell wrapped in `AppLayout` (`/dashboard`, `/documents`, `/documents/:id`, `/obligations`, `/saved-findings`, `/reports`, `/chat`, `/settings`); defines protected admin workspace (`/admin`); attaches 404 fallback; imports Swiss Minimalist stylesheets.
- **Key Symbols**: `App` component.
- **Imports / Dependencies**: `react-router-dom`, context providers, layout, components, pages, stylesheets.
- **Verified Callers**: `main.jsx`.
- **Nature**: UI Routing / Root
- **Status**: Active

### FILE-103: `frontend/src/services/api.js`
- **Path**: `frontend/src/services/api.js` | **Type**: JavaScript | **Layer**: API Client
- **Primary Purpose**: Centralized Axios client with automatic JWT injection, error normalization, and method definitions.
- **Main Responsibilities**: Configures base URL from `VITE_API_BASE_URL` or `http://localhost:5001/api`; request interceptor attaches Bearer token from localStorage; response interceptor normalizes error formats and auto-redirects on 401 Unauthorized; exports grouped API objects: `authAPI`, `documentAPI`, `analysisAPI`, `reportAPI`, `adminAPI`, `healthAPI`.
- **Key Symbols**: `authAPI`, `documentAPI`, `analysisAPI`, `reportAPI`, `adminAPI`, `healthAPI`.
- **Imports / Dependencies**: `axios`.
- **Verified Callers**: Consumed by all pages, components, and contexts.
- **Nature**: API Integration
- **Status**: Active

### FILE-104: `frontend/src/context/AuthContext.jsx`
- **Path**: `frontend/src/context/AuthContext.jsx` | **Type**: JSX | **Layer**: State Management / Auth
- **Primary Purpose**: React Context provider managing user authentication state and session lifecycle.
- **Main Responsibilities**: Stores `user`, `token`, `isAuthenticated`, `isAdmin`, `loading`; validates token via `/auth/me` on startup; exposes `login()`, `register()`, `logout()`, `updateUser()`; synchronizes state with `localStorage`.
- **Key Symbols**: `AuthContext`, `AuthProvider`, `useAuth()`.
- **Imports / Dependencies**: `react`, `../services/api`.
- **Verified Callers**: `App.jsx`, `ProtectedRoute.jsx`, `AppSidebar.jsx`, `SettingsPage.jsx`.
- **Nature**: State Management
- **Status**: Active

### FILE-105: `frontend/src/context/ThemeContext.jsx`
- **Path**: `frontend/src/context/ThemeContext.jsx` | **Type**: JSX | **Layer**: State Management / Theming
- **Primary Purpose**: React Context provider managing Light and Dark mode theme state.
- **Main Responsibilities**: Toggles `theme` between `'light'` and `'dark'`; updates `document.documentElement.setAttribute('data-theme', theme)`; persists selection to `localStorage` key `'lm_theme'`.
- **Key Symbols**: `ThemeContext`, `ThemeProvider`, `useTheme()`.
- **Imports / Dependencies**: `react`.
- **Verified Callers**: `App.jsx`, `ThemeToggle.jsx`, `SettingsPage.jsx`.
- **Nature**: State Management / UI
- **Status**: Active

### FILE-106: `frontend/src/components/AppLayout.jsx`
- **Path**: `frontend/src/components/AppLayout.jsx` | **Type**: JSX | **Layer**: Presentation Layout
- **Primary Purpose**: Shell layout for normal user workspaces.
- **Main Responsibilities**: Arranges `AppSidebar` and `AppHeader` with responsive flex grid; renders child routes via React Router `<Outlet />`; manages mobile sidebar drawer toggle.
- **Key Symbols**: `AppLayout` component.
- **Imports / Dependencies**: `react-router-dom`, `AppSidebar`, `AppHeader`.
- **Verified Callers**: `App.jsx`.
- **Nature**: UI Layout
- **Status**: Active

### FILE-107: `frontend/src/components/AppSidebar.jsx`
- **Path**: `frontend/src/components/AppSidebar.jsx` | **Type**: JSX | **Layer**: Navigation Component
- **Primary Purpose**: Left navigation sidebar for the Normal User Workspace.
- **Main Responsibilities**: Renders primary navigation links with active highlighting: Dashboard, Documents, Obligations & Deadlines, Saved Findings, Reports, AI Research Chat, My Settings; conditionally renders Admin Panel link guarded by `isAdmin`; supports collapse/expand toggle via bottom button and `Ctrl+B` keyboard shortcut; renders responsive mobile drawer.
- **Key Symbols**: `AppSidebar` component.
- **Imports / Dependencies**: `react-router-dom`, `lucide-react`, `../context/AuthContext`.
- **Verified Callers**: `AppLayout.jsx`.
- **Nature**: UI Component / Navigation
- **Status**: Active

### FILE-108: `frontend/src/components/AppHeader.jsx`
- **Path**: `frontend/src/components/AppHeader.jsx` | **Type**: JSX | **Layer**: Navigation Component
- **Primary Purpose**: Top navigation bar for the Normal User Workspace.
- **Main Responsibilities**: Displays system status indicator, quick action triggers, `ThemeToggle`, user profile dropdown, and logout trigger.
- **Key Symbols**: `AppHeader` component.
- **Imports / Dependencies**: `lucide-react`, `ThemeToggle`, `../context/AuthContext`.
- **Verified Callers**: `AppLayout.jsx`.
- **Nature**: UI Component / Navigation
- **Status**: Active

### FILE-109: `frontend/src/components/ProtectedRoute.jsx`
- **Path**: `frontend/src/components/ProtectedRoute.jsx` | **Type**: JSX | **Layer**: Route Guard Component
- **Primary Purpose**: Enforces authentication and authorization guards on application routes.
- **Main Responsibilities**: Checks `isAuthenticated`; redirects unauthenticated requests to `/login`; checks `adminOnly` prop against `user.role === 'admin'`; redirects unauthorized users to `/dashboard`.
- **Key Symbols**: `ProtectedRoute` component.
- **Imports / Dependencies**: `react-router-dom`, `../context/AuthContext`, `Spinner`.
- **Verified Callers**: `App.jsx`.
- **Nature**: Security / UI Component
- **Status**: Active

### FILE-110: `frontend/src/components/ThemeToggle.jsx`
- **Path**: `frontend/src/components/ThemeToggle.jsx` | **Type**: JSX | **Layer**: UI Component
- **Primary Purpose**: Compact button toggling between Light Mode and Dark Mode.
- **Main Responsibilities**: Renders Sun/Moon icon depending on theme; calls `toggleTheme()` from context.
- **Key Symbols**: `ThemeToggle` component.
- **Imports / Dependencies**: `lucide-react`, `../context/ThemeContext`.
- **Verified Callers**: `AppHeader`, `AdminHeader`, `Navbar`, `SettingsPage`.
- **Nature**: UI Component
- **Status**: Active

### FILE-111: `frontend/src/components/UploadModal.jsx`
- **Path**: `frontend/src/components/UploadModal.jsx` | **Type**: JSX | **Layer**: UI Modal
- **Primary Purpose**: Modal dialog for uploading new legal documents.
- **Main Responsibilities**: Drag-and-drop file dropzone; contract category selector dropdown; file validation (PDF, DOCX, TXT <= 50MB); upload progress indicator; dispatches upload to `documentAPI.upload()`.
- **Key Symbols**: `UploadModal` component.
- **Imports / Dependencies**: `react`, `lucide-react`, `../services/api`.
- **Verified Callers**: `DashboardPage`, `DocumentsPage`.
- **Nature**: UI Component / Ingestion
- **Status**: Active

### FILE-112: `frontend/src/components/Spinner.jsx`
- **Path**: `frontend/src/components/Spinner.jsx` | **Type**: JSX | **Layer**: UI Component
- **Primary Purpose**: Minimalist SVG loading spinner.
- **Main Responsibilities**: Renders animated circular loading indicator with size variants (`sm`, `md`, `lg`).
- **Key Symbols**: `Spinner` component.
- **Imports / Dependencies**: `react`.
- **Verified Callers**: Used across pages and modals during async fetching.
- **Nature**: UI Component
- **Status**: Active

### FILE-113: `frontend/src/components/Navbar.jsx`
- **Path**: `frontend/src/components/Navbar.jsx` | **Type**: JSX | **Layer**: Navigation Component
- **Primary Purpose**: Public header navigation for marketing landing page (`HomePage`).
- **Main Responsibilities**: Logo, product feature anchor links, login and register CTA buttons, `ThemeToggle`.
- **Key Symbols**: `Navbar` component.
- **Imports / Dependencies**: `react-router-dom`, `ThemeToggle`, `../context/AuthContext`.
- **Verified Callers**: `HomePage.jsx`.
- **Nature**: UI Component
- **Status**: Active

### FILE-114: `frontend/src/components/DocumentViewerPane.jsx`
- **Path**: `frontend/src/components/DocumentViewerPane.jsx` | **Type**: JSX | **Layer**: Document Intelligence UI
- **Primary Purpose**: Left pane of the Document Intelligence Workspace displaying verbatim contract text or PDF rendering.
- **Main Responsibilities**: Fetches document stream via `documentAPI.getFile()`; displays verbatim text with section jump markers; supports search highlighting and line numbers; handles PDF rendering in embedded iframe or text viewer.
- **Key Symbols**: `DocumentViewerPane` component.
- **Imports / Dependencies**: `react`, `lucide-react`, `../services/api`, `Spinner`.
- **Verified Callers**: `DocumentDetailPage.jsx`.
- **Nature**: UI Component / Document Presentation
- **Status**: Active

### FILE-115: `frontend/src/components/IntelligenceWorkspacePane.jsx`
- **Path**: `frontend/src/components/IntelligenceWorkspacePane.jsx` | **Type**: JSX | **Layer**: Document Intelligence UI
- **Primary Purpose**: Right pane of Document Intelligence Workspace housing structured findings tabs.
- **Main Responsibilities**: Tab container for: Executive Summary, Key Clauses (`ClauseInspector`), Risk Findings (`RiskScorecard`), Obligations & Deadlines (`ContractObligationsTimeline`), Important Dates (`DatesPanel`), Document Metadata (`DocInfoPanel`); supports direct deep-linking via query parameters (`?section=3`, `?section=4`).
- **Key Symbols**: `IntelligenceWorkspacePane` component.
- **Imports / Dependencies**: `react`, `react-router-dom`, child panels.
- **Verified Callers**: `DocumentDetailPage.jsx`.
- **Nature**: UI Component / Analytics Presentation
- **Status**: Active

### FILE-116: `frontend/src/components/RiskScorecard.jsx`
- **Path**: `frontend/src/components/RiskScorecard.jsx` | **Type**: JSX | **Layer**: UI Component
- **Primary Purpose**: Visual presentation of document risk score, severity level, and flagged liabilities.
- **Main Responsibilities**: Renders 0-100 gauge score with severity badge (`Low`, `Medium`, `High`, `Critical`); renders category risk progress bars; lists flagged clauses with legal rationale, risk penalty score, and renegotiation suggestions.
- **Key Symbols**: `RiskScorecard` component.
- **Imports / Dependencies**: `react`, `lucide-react`.
- **Verified Callers**: `IntelligenceWorkspacePane.jsx`, `SavedFindingsPage.jsx`.
- **Nature**: UI Component
- **Status**: Active

### FILE-117: `frontend/src/components/ClauseInspector.jsx`
- **Path**: `frontend/src/components/ClauseInspector.jsx` | **Type**: JSX | **Layer**: UI Component
- **Primary Purpose**: Interactive legal clause browser and provision inspector.
- **Main Responsibilities**: Filter clauses by taxonomy (liability, termination, non-compete, etc.); search clause text; displays page and section markers; provision bookmarking trigger.
- **Key Symbols**: `ClauseInspector` component.
- **Imports / Dependencies**: `react`, `lucide-react`.
- **Verified Callers**: `IntelligenceWorkspacePane.jsx`.
- **Nature**: UI Component
- **Status**: Active

### FILE-118: `frontend/src/components/SummaryPanel.jsx`
- **Path**: `frontend/src/components/SummaryPanel.jsx` | **Type**: JSX | **Layer**: UI Component
- **Primary Purpose**: Displays plain-language executive summary, key legal takeaways, and core covenants.
- **Key Symbols**: `SummaryPanel` component.
- **Imports / Dependencies**: `react`, `lucide-react`.
- **Verified Callers**: `IntelligenceWorkspacePane.jsx`.
- **Nature**: UI Component
- **Status**: Active

### FILE-119: `frontend/src/components/DatesPanel.jsx`
- **Path**: `frontend/src/components/DatesPanel.jsx` | **Type**: JSX | **Layer**: UI Component
- **Primary Purpose**: Structured presentation of explicit calendar dates extracted from the contract.
- **Key Symbols**: `DatesPanel` component.
- **Imports / Dependencies**: `react`, `lucide-react`.
- **Verified Callers**: `IntelligenceWorkspacePane.jsx`.
- **Nature**: UI Component
- **Status**: Active

### FILE-120: `frontend/src/components/DocInfoPanel.jsx`
- **Path**: `frontend/src/components/DocInfoPanel.jsx` | **Type**: JSX | **Layer**: UI Component
- **Primary Purpose**: Technical document characteristics (pages, word count, OCR status, language confidence, processing time).
- **Key Symbols**: `DocInfoPanel` component.
- **Imports / Dependencies**: `react`, `lucide-react`.
- **Verified Callers**: `IntelligenceWorkspacePane.jsx`.
- **Nature**: UI Component
- **Status**: Active

### FILE-121: `frontend/src/components/ContractObligationsTimeline.jsx`
- **Path**: `frontend/src/components/ContractObligationsTimeline.jsx` | **Type**: JSX | **Layer**: UI Component
- **Primary Purpose**: Obligations timeline presentation and reminder scheduling interface.
- **Main Responsibilities**: Visual timeline nodes categorized by deadline type; certainty qualifiers (Explicit vs. Inferred); reminder scheduling modal with lead time selector (7, 14, 30, 60 days); instant `.ics` calendar file download.
- **Key Symbols**: `ContractObligationsTimeline` component.
- **Imports / Dependencies**: `react`, `lucide-react`, `../services/api`.
- **Verified Callers**: `IntelligenceWorkspacePane.jsx`, `ObligationsPage.jsx`.
- **Nature**: UI Component
- **Status**: Active

### FILE-122: `frontend/src/components/DocumentCompareWorkspace.jsx`
- **Path**: `frontend/src/components/DocumentCompareWorkspace.jsx` | **Type**: JSX | **Layer**: UI Component
- **Primary Purpose**: Document version comparison and clause-level diff workspace.
- **Main Responsibilities**: Side-by-side split view and unified inline view modes; green added highlights, red removed strikethroughs, neutral unchanged text; similarity metrics percentage; significant change summaries.
- **Key Symbols**: `DocumentCompareWorkspace` component.
- **Imports / Dependencies**: `react`, `lucide-react`, `../services/api`, `Spinner`.
- **Verified Callers**: `DocumentDetailPage.jsx`.
- **Nature**: UI Component
- **Status**: Active

### FILE-123: `frontend/src/components/DocumentVersionModal.jsx`
- **Path**: `frontend/src/components/DocumentVersionModal.jsx` | **Type**: JSX | **Layer**: UI Modal
- **Primary Purpose**: Modal dialog for uploading new revisions and reviewing version history lineage.
- **Main Responsibilities**: File dropzone for revised contract; version comment input; lists existing revisions with timestamps, file sizes, and triggers for launching `DocumentCompareWorkspace`.
- **Key Symbols**: `DocumentVersionModal` component.
- **Imports / Dependencies**: `react`, `lucide-react`, `../services/api`.
- **Verified Callers**: `DocumentDetailPage.jsx`.
- **Nature**: UI Component
- **Status**: Active

### FILE-124: `frontend/src/components/AdminHeader.jsx`
- **Path**: `frontend/src/components/AdminHeader.jsx` | **Type**: JSX | **Layer**: Admin UI Component
- **Primary Purpose**: Top navigation bar for the Administrative Console.
- **Main Responsibilities**: Displays administrator badge, quick return to user workspace, `ThemeToggle`, and admin profile info.
- **Key Symbols**: `AdminHeader` component.
- **Imports / Dependencies**: `react-router-dom`, `lucide-react`, `ThemeToggle`, `../context/AuthContext`.
- **Verified Callers**: `AdminPage.jsx`.
- **Nature**: Admin UI Component
- **Status**: Active

### FILE-125: `frontend/src/components/AdminSidebar.jsx`
- **Path**: `frontend/src/components/AdminSidebar.jsx` | **Type**: JSX | **Layer**: Admin UI Component
- **Primary Purpose**: Tab navigation sidebar for the Administrative Console.
- **Main Responsibilities**: Switches active admin tabs: Overview, Analytics, Users, Documents, Diagnostics, Settings; displays version and system health badge.
- **Key Symbols**: `AdminSidebar` component.
- **Imports / Dependencies**: `lucide-react`.
- **Verified Callers**: `AdminPage.jsx`.
- **Nature**: Admin UI Component
- **Status**: Active

### FILE-126: `frontend/src/components/AdminAnalyticsDashboard.jsx`
- **Path**: `frontend/src/components/AdminAnalyticsDashboard.jsx` | **Type**: JSX | **Layer**: Admin UI Component
- **Primary Purpose**: Enterprise visual analytics dashboard with interactive charts.
- **Main Responsibilities**: Uses `recharts` to render daily throughput trends (area chart), contract risk distribution (bar chart), document processing status ratios (pie chart), and time-range filter controls (7d, 30d, 90d, 1y).
- **Key Symbols**: `AdminAnalyticsDashboard` component.
- **Imports / Dependencies**: `react`, `recharts`, `lucide-react`, `../services/api`, `Spinner`.
- **Verified Callers**: `AdminPage.jsx`.
- **Nature**: Admin UI Component / Analytics
- **Status**: Active

### FILE-127: `frontend/src/pages/HomePage.jsx`
- **Path**: `frontend/src/pages/HomePage.jsx` | **Type**: JSX | **Layer**: Presentation Page
- **Primary Purpose**: Public marketing landing page introducing LegalMind AI.
- **Main Responsibilities**: Hero section with value proposition; feature highlights (OCR, Risk Engine, RAG Chat, Audit Reports); interactive demo preview card; call-to-action buttons.
- **Key Symbols**: `HomePage` component.
- **Imports / Dependencies**: `react-router-dom`, `Navbar`, `lucide-react`.
- **Verified Callers**: `App.jsx` (`/`).
- **Nature**: UI Page
- **Status**: Active

### FILE-128: `frontend/src/pages/LoginPage.jsx`
- **Path**: `frontend/src/pages/LoginPage.jsx` | **Type**: JSX | **Layer**: Presentation Page
- **Primary Purpose**: User authentication login view.
- **Main Responsibilities**: Email and password form; error banner presentation; submits credentials to `authAPI.login()`; saves JWT and updates context; redirects to `/dashboard` or intended protected route.
- **Key Symbols**: `LoginPage` component.
- **Imports / Dependencies**: `react`, `react-router-dom`, `../context/AuthContext`, `lucide-react`, `Spinner`.
- **Verified Callers**: `App.jsx` (`/login`).
- **Nature**: UI Page
- **Status**: Active

### FILE-129: `frontend/src/pages/RegisterPage.jsx`
- **Path**: `frontend/src/pages/RegisterPage.jsx` | **Type**: JSX | **Layer**: Presentation Page
- **Primary Purpose**: User account registration view.
- **Main Responsibilities**: Name, email, password, and confirm password inputs; validation rules; submits to `authAPI.register()`; auto-login and redirect on success.
- **Key Symbols**: `RegisterPage` component.
- **Imports / Dependencies**: `react`, `react-router-dom`, `../context/AuthContext`, `lucide-react`, `Spinner`.
- **Verified Callers**: `App.jsx` (`/register`).
- **Nature**: UI Page
- **Status**: Active

### FILE-130: `frontend/src/pages/DashboardPage.jsx`
- **Path**: `frontend/src/pages/DashboardPage.jsx` | **Type**: JSX | **Layer**: Presentation Page
- **Primary Purpose**: Primary executive workspace for authenticated users.
- **Main Responsibilities**: Contract Intelligence Workspace heading; 4 compact KPI metric tiles (Total Contracts, Analysis Complete, High/Critical Risk, Generated Reports); High-Risk Priority Attention Ribbon; Recent Agreements table with status and risk pills; Upcoming Obligations widget; Recent Activity timeline feed; polished 3-step onboarding card for zero-contract state; Upload Modal trigger.
- **Key Symbols**: `DashboardPage` component.
- **Imports / Dependencies**: `react`, `react-router-dom`, `lucide-react`, `../services/api`, `UploadModal`, `Spinner`.
- **Verified Callers**: `App.jsx` (`/dashboard`).
- **Nature**: UI Page
- **Status**: Active

### FILE-131: `frontend/src/pages/DocumentsPage.jsx`
- **Path**: `frontend/src/pages/DocumentsPage.jsx` | **Type**: JSX | **Layer**: Presentation Page
- **Primary Purpose**: Full contract repository and document management table.
- **Main Responsibilities**: Search bar by document name; category filter pills; status filters; pagination controls; tabular view showing name, type, upload date, status, risk score; action triggers: Open Analysis, Download, Delete, Upload New Contract.
- **Key Symbols**: `DocumentsPage` component.
- **Imports / Dependencies**: `react`, `react-router-dom`, `lucide-react`, `../services/api`, `UploadModal`, `Spinner`.
- **Verified Callers**: `App.jsx` (`/documents`).
- **Nature**: UI Page
- **Status**: Active

### FILE-132: `frontend/src/pages/DocumentDetailPage.jsx`
- **Path**: `frontend/src/pages/DocumentDetailPage.jsx` | **Type**: JSX | **Layer**: Presentation Page
- **Primary Purpose**: Split-pane Document Intelligence workspace for in-depth contract analysis.
- **Main Responsibilities**: Top contract header bar with status, risk score, version indicator, and action buttons (Upload Revision, Compare Versions, Generate Report); resizable split-pane layout with draggable divider; renders `DocumentViewerPane` (left) and `IntelligenceWorkspacePane` (right); embeds `DocumentCompareWorkspace` and `DocumentVersionModal`.
- **Key Symbols**: `DocumentDetailPage` component.
- **Imports / Dependencies**: `react`, `react-router-dom`, `lucide-react`, `../services/api`, document panes, modals, `Spinner`.
- **Verified Callers**: `App.jsx` (`/documents/:id`).
- **Nature**: UI Page
- **Status**: Active

### FILE-133: `frontend/src/pages/ObligationsPage.jsx`
- **Path**: `frontend/src/pages/ObligationsPage.jsx` | **Type**: JSX | **Layer**: Presentation Page
- **Primary Purpose**: Portfolio-wide contract obligations and deadlines management hub.
- **Main Responsibilities**: Aggregates covenants across all user contracts; KPI summary strip; category filter pills (`Notice`, `Expiration`, `Renewal`, `Payment`, `Audit`); certainty dropdown; search filter; dual layout toggle (List vs Timeline); interactive Schedule Reminder modal; instant `.ics` calendar file export.
- **Key Symbols**: `ObligationsPage` component.
- **Imports / Dependencies**: `react`, `react-router-dom`, `lucide-react`, `../services/api`, `Spinner`.
- **Verified Callers**: `App.jsx` (`/obligations`).
- **Nature**: UI Page
- **Status**: Active

### FILE-134: `frontend/src/pages/SavedFindingsPage.jsx`
- **Path**: `frontend/src/pages/SavedFindingsPage.jsx` | **Type**: JSX | **Layer**: Presentation Page
- **Primary Purpose**: Hub for flagged high-severity risks and user-bookmarked contract provisions.
- **Main Responsibilities**: Dual-tab view: "High-Severity Flagged Risks" (aggregated across user contracts with risk scores, penalties, and suggestions) and "Bookmarked Provisions" (persisted in localStorage key `legalmind_saved_findings` with search and export capabilities).
- **Key Symbols**: `SavedFindingsPage` component.
- **Imports / Dependencies**: `react`, `react-router-dom`, `lucide-react`, `../services/api`, `Spinner`.
- **Verified Callers**: `App.jsx` (`/saved-findings`).
- **Nature**: UI Page
- **Status**: Active

### FILE-135: `frontend/src/pages/ReportsPage.jsx`
- **Path**: `frontend/src/pages/ReportsPage.jsx` | **Type**: JSX | **Layer**: Presentation Page
- **Primary Purpose**: Audit dossier generation and download management.
- **Main Responsibilities**: Lists generated reports with document name, file size, creation timestamp, and download count; "Generate New Report" dropdown selecting completed contracts; direct PDF download action; report deletion.
- **Key Symbols**: `ReportsPage` component.
- **Imports / Dependencies**: `react`, `react-router-dom`, `lucide-react`, `../services/api`, `Spinner`.
- **Verified Callers**: `App.jsx` (`/reports`).
- **Nature**: UI Page
- **Status**: Active

### FILE-136: `frontend/src/pages/ChatPage.jsx`
- **Path**: `frontend/src/pages/ChatPage.jsx` | **Type**: JSX | **Layer**: Presentation Page
- **Primary Purpose**: Conversational legal research RAG workspace.
- **Main Responsibilities**: Document selector dropdown; conversational message thread; submitted query dispatch to `analysisAPI.query()`; displays answers with evidence-grounded citation pills (page, section, excerpt); displays confidence and safe response flags; conversation history persistence.
- **Key Symbols**: `ChatPage` component.
- **Imports / Dependencies**: `react`, `lucide-react`, `../services/api`, `Spinner`.
- **Verified Callers**: `App.jsx` (`/chat`).
- **Nature**: UI Page / Conversational AI
- **Status**: Active

### FILE-137: `frontend/src/pages/SettingsPage.jsx`
- **Path**: `frontend/src/pages/SettingsPage.jsx` | **Type**: JSX | **Layer**: Presentation Page
- **Primary Purpose**: User account credentials, workspace preferences, and live telemetry.
- **Main Responsibilities**: Profile credentials update form (name, language); password change form with match validation; workspace layout ratio preference (50/50, 40/60, 60/40); theme switcher; live microservice cluster health telemetry pinging `/api/health`.
- **Key Symbols**: `SettingsPage` component.
- **Imports / Dependencies**: `react`, `lucide-react`, `../services/api`, `../context/AuthContext`, `../context/ThemeContext`, `Spinner`.
- **Verified Callers**: `App.jsx` (`/settings`).
- **Nature**: UI Page
- **Status**: Active

### FILE-138: `frontend/src/pages/AdminPage.jsx`
- **Path**: `frontend/src/pages/AdminPage.jsx` | **Type**: JSX | **Layer**: Presentation Page / Admin
- **Primary Purpose**: Comprehensive Administrative Console workspace.
- **Main Responsibilities**: Multi-tab workspace housing: System Overview (KPI tiles), Analytics (`AdminAnalyticsDashboard`), User Management (search, filter, activate/deactivate, role promotion, soft-delete, restore), Documents Repository (cross-tenant document visibility and status), Diagnostics (full-chain ping tester), Admin Settings (system configuration and environment variables); protected by `adminOnly` route guard.
- **Key Symbols**: `AdminPage` component.
- **Imports / Dependencies**: `react`, `lucide-react`, `../services/api`, admin components, `Spinner`.
- **Verified Callers**: `App.jsx` (`/admin`).
- **Nature**: Admin UI Page
- **Status**: Active

### FILE-139: `frontend/src/pages/NotFoundPage.jsx`
- **Path**: `frontend/src/pages/NotFoundPage.jsx` | **Type**: JSX | **Layer**: Presentation Page
- **Primary Purpose**: 404 error page for unmatched client URLs.
- **Main Responsibilities**: Displays clean error graphic and "Return to Dashboard" action button.
- **Key Symbols**: `NotFoundPage` component.
- **Imports / Dependencies**: `react-router-dom`, `lucide-react`.
- **Verified Callers**: `App.jsx` (`*`).
- **Nature**: UI Page
- **Status**: Active

### FILE-140: `frontend/src/styles/design-system.css`
- **Path**: `frontend/src/styles/design-system.css` | **Type**: CSS | **Layer**: Presentation Styles
- **Primary Purpose**: Option D — Pure White × Graphite Swiss Minimalist global design tokens.
- **Main Responsibilities**: Defines CSS root custom properties for Light Mode (`#FFFFFF` background, `#F5F5F5` surface, `#161616` primary text, `#5F5F5F` secondary text, `#D9D9D9` border) and Dark Mode (`#111111` background, `#1B1B1B` surface, `#F5F5F5` primary text, `#B8B8B8` secondary text, `#383838` border); typography tokens; utility button and card classes.
- **Nature**: CSS Stylesheet
- **Status**: Active

### FILE-141: `frontend/src/styles/dashboard.css`
- **Path**: `frontend/src/styles/dashboard.css` | **Type**: CSS | **Layer**: Presentation Styles
- **Primary Purpose**: Stylesheets for Normal User Workspace, split-pane document viewer, obligations timeline, and dashboard cards.
- **Nature**: CSS Stylesheet
- **Status**: Active

### FILE-142: `frontend/src/styles/chat-admin.css`
- **Path**: `frontend/src/styles/chat-admin.css` | **Type**: CSS | **Layer**: Presentation Styles
- **Primary Purpose**: Stylesheets for AI Research Chat interface and Administrative Console tables/dashboards.
- **Nature**: CSS Stylesheet
- **Status**: Active

---

## Inventory Summary & Validation Metrics

- **Total In-Scope Files Documented**: **142**
- **Infrastructure & Root Files**: 6
- **AI Processing Service (FastAPI)**: 32 (1 requirements, 4 package files, 2 config/middleware, 9 routers, 12 services, 4 package utils)
- **Backend Application Service (Express)**: 54 (2 manifests, 2 server/app, 2 config, 4 controllers, 7 middleware, 9 models, 5 routes, 3 services, 20 utils/tests)
- **Frontend Single Page App (React/Vite)**: 50 (4 manifests/configs, 2 public, 2 entrypoints, 1 service, 2 contexts, 21 components, 13 pages, 4 stylesheets, 1 readme)
- **Live Codebase Alignment**: 100% verified against local filesystem.
