# LegalMind AI — Architecture & Dependencies Blueprint

This document details the multi-tier system architecture, module interaction models, call graph mappings, and dependency relationships across **LegalMind AI**.

---

## 1. Multi-Tier System Architecture Blueprint

LegalMind AI is architected as an asynchronous, decoupled 3-tier enterprise platform with clear perimeter isolation and strict API contracts:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   TIER 1: PRESENTATION LAYER (SPA)                     │
│  React 18 + Vite + React Router 6 + Option D Pure White x Graphite     │
│  Port 3000 | Client-side JWT Storage | Responsive Swiss Minimalist UI  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS / REST (JSON + Multipart)
                                    │ Bearer JWT Authentication
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             TIER 2: APPLICATION BACKEND & API GATEWAY                  │
│  Node.js 18+ / Express.js 4.18 | Port 5001                             │
│  Authentication (bcrypt, JWT) | Multer Ingestion | RBAC & Tenancy      │
│  Report Generation (PDFKit) | Cron / Reminders | Diff Engine (LCS)     │
└───────────────────┬───────────────────────────────┬────────────────────┘
                    │                               │
    Mongoose ODM    │                               │ HTTP / REST
    Port 27018      │                               │ Port 8000
    Auth: User/PW   │                               │ Header: X-Internal-API-Key
                    ▼                               ▼
┌───────────────────────────────┐   ┌────────────────────────────────────┐
│      TIER 3A: PERSISTENCE     │   │      TIER 3B: AI ENGINE (MICRO)    │
│  MongoDB 7.0 Community        │   │  Python 3.10 / FastAPI 0.104.1     │
│  - Users & Credentials        │   │  - Multilingual LangDetect & OCR   │
│  - Document Metadata & Revisions│ │  - PyMuPDF, python-docx, EasyOCR   │
│  - AnalysisResults & Clauses  │   │  - Legal NER (spaCy en_core_web_sm)│
│  - RiskFindings & Penalties   │   │  - Risk Engine (Rule Evaluators)   │
│  - ChatHistory & Citations    │   │  - SentenceTransformers MiniLM     │
│  - ContractReminders & Reports│   │  - Local FAISS Vector Indices      │
└───────────────────────────────┘   │  - LangGraph StateGraph Router     │
                                    │  - Evidence Checking Gate          │
                                    │  - Google Gemini LLM API Client    │
                                    │  - Citation Verification Gate      │
                                    └────────────────────────────────────┘
```

### Perimeter Security & Network Boundary Rules
1. **Frontend Isolation:** The React Single Page Application **never** directly contacts the FastAPI AI Service or MongoDB. All calls route through Express (`http://localhost:5001/api`).
2. **Internal API Key Gateway:** FastAPI endpoints (with the exception of `/health` and `/`) reject requests lacking the internal header `X-Internal-API-Key`.
3. **Database Guardrails:** MongoDB is accessible only to Express; FastAPI does not maintain database drivers, keeping it strictly stateless with filesystem index storage.

---

## 2. Frontend Page-to-Endpoint Dependency Map

The table below traces every React page to the specific API service methods and backend routes it consumes:

| Frontend Page | API Client Service | Backend Endpoint | HTTP Method | Data Flow / Purpose |
| :--- | :--- | :--- | :---: | :--- |
| **`LoginPage.jsx`** | `authAPI.login` | `/api/auth/login` | `POST` | Authenticates email/password; receives JWT and user profile |
| **`RegisterPage.jsx`** | `authAPI.register` | `/api/auth/register` | `POST` | Creates user account; receives JWT |
| **`DashboardPage.jsx`** | `documentAPI.list` | `/api/documents` | `GET` | Retrieves user contracts with populated risk findings |
| | `documentAPI.getUpcomingObligations` | `/api/documents/obligations/upcoming` | `GET` | Fetches impending contract milestones across portfolio |
| | `documentAPI.getActivityFeed` | `/api/documents/activity/feed` | `GET` | Retrieves chronological user activity history |
| | `reportAPI.list` | `/api/reports` | `GET` | Fetches total generated audit reports |
| | `documentAPI.upload` | `/api/documents/upload` | `POST` | Uploads agreement from dashboard modal trigger |
| **`DocumentsPage.jsx`** | `documentAPI.list` | `/api/documents` | `GET` | Retrieves paginated and filtered contract table |
| | `documentAPI.remove` | `/api/documents/:id` | `DELETE` | Deletes contract and associated vector indices |
| | `documentAPI.upload` | `/api/documents/upload` | `POST` | Ingests new agreement |
| **`DocumentDetailPage.jsx`** | `documentAPI.getById` | `/api/documents/:id` | `GET` | Loads complete document record and virtual relations |
| | `documentAPI.getFile` | `/api/documents/:id/file` | `GET` | Streams verbatim text / PDF binary to viewer pane |
| | `documentAPI.getVersions` | `/api/documents/:id/versions` | `GET` | Fetches revision lineage |
| | `documentAPI.uploadVersion` | `/api/documents/:id/versions` | `POST` | Ingests contract revision |
| | `documentAPI.compare` | `/api/documents/:baseId/compare/:targetId` | `GET` | Computes token-level LCS diff between versions |
| | `reportAPI.generate` | `/api/reports/generate/:id` | `POST` | Triggers PDF dossier generation |
| **`ObligationsPage.jsx`** | `documentAPI.getUpcomingObligations` | `/api/documents/obligations/upcoming` | `GET` | Retrieves all portfolio-wide contract obligations |
| | `documentAPI.getAllReminders` | `/api/documents/reminders/all` | `GET` | Retrieves scheduled notification triggers |
| | `documentAPI.createReminder` | `/api/documents/:id/reminders` | `POST` | Schedules custom deadline reminder |
| | `documentAPI.downloadReminderIcs` | `/api/documents/:id/reminders/:remId/ics` | `GET` | Downloads standard `.ics` calendar file |
| **`SavedFindingsPage.jsx`** | `documentAPI.list` | `/api/documents` | `GET` | Aggregates high-severity risk clauses across contracts |
| **`ReportsPage.jsx`** | `reportAPI.list` | `/api/reports` | `GET` | Retrieves user's generated PDF dossier catalog |
| | `reportAPI.generate` | `/api/reports/generate/:id` | `POST` | Triggers report compilation for selected document |
| | `reportAPI.download` | `/api/reports/:id/download` | `GET` | Downloads binary PDF dossier with attachment header |
| | `reportAPI.remove` | `/api/reports/:id` | `DELETE` | Removes report record and PDF file from disk |
| **`ChatPage.jsx`** | `documentAPI.list` | `/api/documents` | `GET` | Populates document selector dropdown |
| | `documentAPI.getChatHistory` | `/api/documents/:id/chat` | `GET` | Loads persistent conversation thread |
| | `analysisAPI.query` | `/api/documents/:id/chat` | `POST` | Dispatches RAG query to LangGraph engine |
| **`SettingsPage.jsx`** | `authAPI.updateProfile` | `/api/auth/update-profile` | `PUT` | Updates user name and preferred language |
| | `authAPI.changePassword` | `/api/auth/change-password` | `PUT` | Updates account password hash |
| | `healthAPI.check` | `/api/health` | `GET` | Tests live cluster response time and DB connection |
| **`AdminPage.jsx`** | `adminAPI.getStats` | `/api/admin/stats` | `GET` | Fetches platform-wide user and document counters |
| | `adminAPI.getAnalytics` | `/api/admin/analytics` | `GET` | Aggregates throughput, risk, and status distributions |
| | `adminAPI.getUsers` | `/api/admin/users` | `GET` | Queries paginated user accounts with search/filter |
| | `adminAPI.updateUserStatus` | `/api/admin/users/:id/status` | `PUT` | Toggles account active status |
| | `adminAPI.updateUserRole` | `/api/admin/users/:id/role` | `PUT` | Modifies user role (`normal_user` vs `admin`) |
| | `adminAPI.deleteUser` | `/api/admin/users/:id` | `DELETE` | Executes audit-logged soft-deletion |
| | `adminAPI.restoreUser` | `/api/admin/users/:id/restore` | `PUT` | Restores archived user account |
| | `adminAPI.getDocuments` | `/api/admin/documents` | `GET` | Cross-tenant document inspection |
| | `healthAPI.chainTest` | `/api/health/chain-test` | `GET` | End-to-end multi-tier ping test |

---

## 3. Backend Route-to-Controller-to-Model Mapping

The table below maps Express routes to their controller handlers, business services, and database models:

| Route Path | Controller Handler | Service Invocation | Database Models Modified/Read |
| :--- | :--- | :--- | :--- |
| `POST /api/auth/register` | `auth.controller.js:register` | `auth.service.js:registerUser` | `User` (create) |
| `POST /api/auth/login` | `auth.controller.js:login` | `auth.service.js:loginUser` | `User` (read, lastLogin update) |
| `GET /api/auth/me` | `auth.controller.js:getMe` | Inline DB read | `User` (read) |
| `PUT /api/auth/update-profile` | `auth.controller.js:updateProfile` | `auth.service.js:updateProfile` | `User` (update) |
| `PUT /api/auth/change-password` | `auth.controller.js:changePassword` | `auth.service.js:changePassword` | `User` (read password, update hash) |
| `POST /api/documents/upload` | `document.controller.js:uploadDocument` | `document.service.js:createDocumentRecord`, `sendToAIService` | `Document` (create), disk storage write |
| `GET /api/documents` | `document.controller.js:listDocuments` | `document.service.js:getUserDocuments` | `Document`, `RiskFinding`, `AnalysisResult` (read/populate) |
| `GET /api/documents/:id` | `document.controller.js:getDocument` | `document.service.js:getDocumentById` | `Document`, `DocumentMetadata`, `AnalysisResult`, `RiskFinding` |
| `GET /api/documents/:id/file` | `document.controller.js:streamDocumentFile` | `fs.createReadStream` | `Document` (read), disk storage stream |
| `DELETE /api/documents/:id` | `document.controller.js:removeDocument` | `document.service.js:deleteDocument` | `Document`, `AnalysisResult`, `RiskFinding`, `Report`, `ContractReminder` (soft-delete / purge) |
| `GET /api/documents/:id/versions` | `document.controller.js:listDocumentVersions` | `document.service.js:getDocumentVersions` | `Document` (read versions array) |
| `POST /api/documents/:id/versions` | `document.controller.js:uploadDocumentVersion` | `document.service.js:createDocumentVersionRecord`, `sendToAIService` | `Document` (create child version), disk storage write |
| `GET /api/documents/:baseId/compare/:targetId` | `document.controller.js:compareDocumentsHandler` | `document.service.js:compareDocuments`, `diffHelper.js` | `Document`, `AnalysisResult` (read both) |
| `GET /api/documents/:id/obligations` | `document.controller.js:getDocumentObligationsHandler` | `document.service.js:getDocumentObligations`, `contractObligationsHelper.js` | `Document`, `AnalysisResult`, `DocumentMetadata` |
| `GET /api/documents/:id/reminders` | `document.controller.js:listDocumentRemindersHandler` | `document.service.js:getDocumentReminders` | `ContractReminder` (read) |
| `POST /api/documents/:id/reminders` | `document.controller.js:createDocumentReminderHandler` | `document.service.js:createDocumentReminder` | `ContractReminder` (create) |
| `GET /api/documents/reminders/all` | `document.controller.js:listAllUserRemindersHandler` | `document.service.js:getAllUserReminders` | `ContractReminder`, `Document` (read) |
| `GET /api/documents/activity/feed` | `document.controller.js:getUserActivityFeedHandler` | `document.service.js:getUserActivityFeed` | `Document`, `Report`, `ContractReminder` (read & sort) |
| `GET /api/documents/obligations/upcoming` | `document.controller.js:getUpcomingUserObligationsHandler` | `document.service.js:getUpcomingUserObligations`, `contractObligationsHelper.js` | `Document`, `AnalysisResult`, `DocumentMetadata` (aggregate) |
| `POST /api/documents/:id/chat` | `document.controller.js:chatWithDocument` | `document.service.js:askDocumentQuestion` | `ChatHistory` (append message), `Document` (read) |
| `GET /api/documents/:id/chat` | `document.controller.js:getChatHistory` | Mongoose findOne | `ChatHistory` (read) |
| `POST /api/reports/generate/:id` | `report.controller.js:generateReport` | `report.service.js:generateDocumentReport` | `Report` (create), all document models, PDFKit disk write |
| `GET /api/reports` | `report.controller.js:listReports` | `report.service.js:listUserReports` | `Report`, `Document` (read) |
| `GET /api/reports/:id/download` | `report.controller.js:downloadReport` | `report.service.js:downloadReport` | `Report` (increment downloadCount), disk read stream |
| `GET /api/admin/users` | `admin.controller.js:getAllUsers` | Mongoose find + pagination | `User` (read) |
| `PUT /api/admin/users/:id/status` | `admin.controller.js:updateUserStatus` | Mongoose findByIdAndUpdate | `User` (update isActive) |
| `PUT /api/admin/users/:id/role` | `admin.controller.js:updateUserRole` | Mongoose findByIdAndUpdate | `User` (update role) |
| `DELETE /api/admin/users/:id` | `admin.controller.js:deleteUser` | Mongoose soft-delete update | `User` (update isDeleted, deletedAt, isActive) |
| `PUT /api/admin/users/:id/restore` | `admin.controller.js:restoreUser` | Mongoose restore update | `User` (update isDeleted: false, isActive: true) |
| `GET /api/admin/stats` | `admin.controller.js:getSystemStats` | Promise.all counts | `User`, `Document` (countDocuments) |
| `GET /api/admin/analytics` | `admin.controller.js:getAdminAnalytics` | Mongoose aggregate pipelines | `Document`, `RiskFinding` (aggregate) |

---

## 4. Backend-to-AI Service API Contract Map

The table below details every HTTP interaction between Express and FastAPI:

| Express Caller | FastAPI Target Endpoint | Payload Structure | Response Contract | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `aiService.js:checkAIServiceHealth` | `GET /health` | Empty | `{ success, service, version, timestamp }` | Liveness health check |
| `aiService.js:chainTest` | `GET /health/chain-test` | Empty | `{ success, details: { faiss, storage, gemini } }` | Multi-tier chain verification |
| `document.service.js:sendToAIService` | `POST /documents/process` | `multipart/form-data`: `file`, `document_id`, `user_id`, `document_type`, `original_name`, `file_format` | `ProcessingResponse`: Language, chunks, entities, clauses, risk score, summary, FAISS path | Dispatches uploaded contract to background AI processing pipeline |
| `document.service.js:askDocumentQuestion` | `POST /query/ask` | `{ document_id, query }` | `{ success, data: { final_answer, citations, route_taken, evidence_sufficient, citations_valid } }` | Executes LangGraph RAG QA graph on contract |
| `document.service.js:deleteDocument` | `DELETE /vector/:id` | Route param `:id` | `{ success, message }` | Purges local FAISS index file and metadata json |

---

## 5. Architectural Quality Audits

### A. Circular Dependency Audit
- **Backend Node Server:** 
  - `server.js` -> `app.js` -> `routes/*` -> `controllers/*` -> `services/*` -> `models/*`. 
  - **Verdict:** Strict unidirectional acyclic hierarchy. No circular require cycles detected.
- **AI Service (FastAPI):**
  - `main.py` -> `routers/*` -> `services/*` -> `config/settings.py`.
  - In `graph_service.py`, `risk_service` is imported conditionally or directly without reverse import into `risk_service`.
  - **Verdict:** Clean directed acyclic graph.
- **Frontend (React):**
  - `main.jsx` -> `App.jsx` -> `AppLayout` -> `AppSidebar` / `AppHeader` -> `context/*`.
  - Components consume `api.js` which has no upward component imports.
  - **Verdict:** No circular dependencies.

### B. Dead Code & Orphaned Files Analysis
- **`backend/node-server/src/utils/*Test.js` (16 test scripts):**
  - These scripts (`authTest.js`, `queryTest.js`, etc.) are standalone Node CLI verification harnesses used to test pipeline milestones. They are not imported in production runtime code, which is expected and intentional.
- **`backend/node-server/src/utils/makeAdmin.js`:**
  - Administrative CLI maintenance script. Not imported by Express; executed manually via `node src/utils/makeAdmin.js <email>`.
- **`frontend/src/styles/`:**
  - All four stylesheets (`design-system.css`, `dashboard.css`, `chat-admin.css`, `landing.css`) are imported at the top of [App.jsx](file:///Users/trush/Desktop/LegalMindAI/frontend/src/App.jsx#L21-L24). No orphaned styles.

### C. State Management & Data Flow Architecture
1. **Global Auth State:** Centralized in `AuthContext.jsx`. Provides session caching in `localStorage` (`lm_token`, `lm_user`).
2. **Global Theme State:** Centralized in `ThemeContext.jsx`. Applies `data-theme="light|dark"` to root `<html>` element and syncs with `localStorage` (`lm_theme`).
3. **Workspace State:** Managed via React component local state (`useState`, `useEffect`) and URL parameters (`useSearchParams` in `DocumentDetailPage` and `IntelligenceWorkspacePane`).
4. **Offline Provision Bookmarking:** Utilizes `localStorage` (`legalmind_saved_findings`) ensuring bookmarked clauses survive sessions without requiring schema migrations.
