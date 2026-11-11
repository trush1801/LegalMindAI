import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Columns,
  Download,
  GitBranch,
  Globe,
  History,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';

import DocumentViewerPane from '../components/DocumentViewerPane';
import IntelligenceWorkspacePane from '../components/IntelligenceWorkspacePane';
import DocumentVersionModal from '../components/DocumentVersionModal';
import DocumentCompareWorkspace from '../components/DocumentCompareWorkspace';
import Spinner from '../components/Spinner';

import { documentAPI, reportAPI } from '../services/api';

const isValidObjectId = (val) => Boolean(val && typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val));

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [docRecord, setDocRecord] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [risk, setRisk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Granular error state: 'invalid_id' | 'not_found' | 'access_denied' | 'server_error' | null
  const [errorState, setErrorState] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Version history & Comparison states
  const [versions, setVersions] = useState([]);
  const [availableDocs, setAvailableDocs] = useState([]);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareTargetId, setCompareTargetId] = useState(null);

  // Split-pane layout modes: 'split-50' | 'split-40-60' | 'split-60-40' | 'focus-doc' | 'focus-intel'
  const [splitMode, setSplitMode] = useState(() => {
    try {
      return localStorage.getItem('legalmind_split_mode') || 'split-50';
    } catch {
      return 'split-50';
    }
  });

  // Evidence targeting state
  const [activeEvidence, setActiveEvidence] = useState(null);

  const setAndStoreSplitMode = (mode) => {
    setSplitMode(mode);
    try {
      localStorage.setItem('legalmind_split_mode', mode);
    } catch {
      // storage unavailable
    }
  };

  const loadData = useCallback(async () => {
    // 1. Validate route parameter before making network requests
    if (!id || id === 'undefined' || id === 'null' || !isValidObjectId(id)) {
      setErrorState('invalid_id');
      setErrorMessage(
        id === 'undefined' || id === 'null'
          ? 'Invalid document identifier in URL route (/documents/undefined).'
          : `Invalid document identifier format: "${id}". Expected a 24-character hexadecimal identifier.`
      );
      setDocRecord(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErrorState(null);
      setErrorMessage('');
      const res = await documentAPI.getById(id);
      const data = res?.data?.data || res?.data || {};
      const doc = data.document || data;

      if (!doc || !doc._id) {
        setErrorState('not_found');
        setErrorMessage('Document not found in this workspace.');
        setDocRecord(null);
        return;
      }

      setDocRecord(doc);
      setMetadata(doc?.metadata || data.metadata || null);
      setAnalysis(doc?.analysis || data.analysis || null);
      setRisk(doc?.riskFindings || doc?.risk || data.risk || null);
    } catch (err) {
      console.error('Failed to load document detail:', err);
      const status = err?.status || err?.response?.status;
      if (status === 403 || status === 401) {
        setErrorState('access_denied');
        setErrorMessage('Access denied. You do not have permission to view this document in this workspace.');
      } else if (status === 404) {
        setErrorState('not_found');
        setErrorMessage('The requested contract was not found. It may have been removed or deleted.');
      } else if (status === 400) {
        setErrorState('invalid_id');
        setErrorMessage(err.message || 'Invalid document identifier.');
      } else {
        setErrorState('server_error');
        setErrorMessage(err.message || 'Unable to load document intelligence workspace due to a network or server error.');
      }
      setDocRecord(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadVersions = useCallback(async () => {
    if (!isValidObjectId(id)) return;
    try {
      const res = await documentAPI.getVersions(id);
      setVersions(res?.data?.data?.versions || []);
    } catch (err) {
      console.error('Failed to load document versions:', err);
      setVersions([]);
    }
  }, [id]);

  const loadAllDocuments = useCallback(async () => {
    try {
      const res = await documentAPI.list();
      const rawDocs = res?.data?.data?.documents || res?.data?.documents || [];
      setAvailableDocs(Array.isArray(rawDocs) ? rawDocs : []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadData();
    loadVersions();
    loadAllDocuments();
  }, [loadData, loadVersions, loadAllDocuments]);

  // Polling while processing
  const processingState = docRecord?.processingStatus || docRecord?.status;
  useEffect(() => {
    if (!isValidObjectId(id) || !docRecord || processingState === 'completed' || processingState === 'failed') return;

    const interval = setInterval(async () => {
      try {
        const statusRes = await documentAPI.getStatus(id);
        const statusData = statusRes?.data?.data || statusRes?.data || {};
        const nextStatus = statusData.processingStatus || statusData.status;

        // Update live stage and progress in local state
        setDocRecord((prev) =>
          prev
            ? {
                ...prev,
                processingStatus:     nextStatus,
                processingStage:      statusData.processingStage || prev.processingStage,
                processingProgress:   statusData.processingProgress !== undefined ? statusData.processingProgress : prev.processingProgress,
                processingDurationMs: statusData.processingDurationMs || prev.processingDurationMs,
                processingError:      statusData.processingError || prev.processingError,
              }
            : prev
        );

        if (nextStatus === 'completed' || nextStatus === 'failed') {
          clearInterval(interval);
          loadData();
        }
      } catch (err) {
        console.error('Status check error:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [id, docRecord, processingState, loadData]);

  const handleRetryPipeline = async () => {
    try {
      setIsRetrying(true);
      const res = await documentAPI.retry(id);
      const updated = res?.data?.data;
      if (updated) {
        setDocRecord((prev) => ({
          ...prev,
          processingStatus:   updated.processingStatus,
          processingStage:    updated.processingStage,
          processingProgress: updated.processingProgress,
          retryCount:         updated.retryCount,
          processingError:    null,
        }));
      }
      setTimeout(loadData, 1000);
    } catch (err) {
      alert(err.message || 'Failed to restart document analysis pipeline');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSelectEvidence = (evidence) => {
    setActiveEvidence(evidence);
    // If the document pane was hidden, open 50/50 split so user sees source
    if (splitMode === 'focus-intel') {
      setAndStoreSplitMode('split-50');
    }
  };

  const handleClearEvidence = () => {
    setActiveEvidence(null);
  };

  const handleGeneratePDF = async () => {
    try {
      setGeneratingReport(true);
      const res = await reportAPI.generate(id);
      const report = res?.data?.data || res?.data?.report || res?.data;

      const reportId = report.reportId || report.id || report._id;
      const dlRes = await reportAPI.download(reportId);
      const blob = new Blob([dlRes.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.setAttribute('download', report.fileName || `audit_report_${id}.pdf`);
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Failed to generate PDF audit report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return null;
    const kb = bytes / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
  };

  if (loading) {
    return (
      <div className="page">
        <div className="container" style={{ paddingTop: '5rem', textAlign: 'center' }}>
          <Spinner label="Loading document intelligence workspace…" />
        </div>
      </div>
    );
  }

  if (errorState || !docRecord) {
    const isInvalid = errorState === 'invalid_id' || id === 'undefined' || id === 'null' || !isValidObjectId(id);
    const isAccessDenied = errorState === 'access_denied';
    const isNotFound = errorState === 'not_found';

    return (
      <div className="page">
        <div className="container" style={{ paddingTop: '3.5rem', maxWidth: '720px' }}>
          <div
            className={`alert ${
              isAccessDenied ? 'alert-warning' : isInvalid ? 'alert-warning' : 'alert-error'
            }`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '1rem',
              padding: '1.5rem',
              borderRadius: '8px',
              border: isAccessDenied
                ? '1px solid var(--color-warning)'
                : isInvalid
                ? '1px solid var(--color-warning)'
                : '1px solid var(--color-danger)',
              background: 'var(--color-surface)',
            }}
          >
            {isAccessDenied ? (
              <ShieldAlert size={24} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-warning)' }} />
            ) : isInvalid ? (
              <AlertTriangle size={24} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-warning)' }} />
            ) : (
              <AlertCircle size={24} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--color-danger)' }} />
            )}
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text)' }}>
                {isAccessDenied
                  ? 'Access Denied — Restricted Contract'
                  : isInvalid
                  ? 'Invalid Document Identifier'
                  : isNotFound
                  ? 'Document Not Found'
                  : 'Workspace Connection Error'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                {errorMessage ||
                  (isInvalid
                    ? 'The document link provided is malformed or missing a valid identifier (e.g. /documents/undefined).'
                    : isAccessDenied
                    ? 'You do not have permission to view this document in this workspace.'
                    : 'The requested document does not exist or may have been deleted.')}
              </p>
            </div>
          </div>

          <div className="flex-center gap-3 mt-4">
            <button className="btn btn-primary flex-center gap-2" onClick={() => navigate('/documents')}>
              <ArrowLeft size={15} />
              <span>Return to Documents Repository</span>
            </button>
            {errorState === 'server_error' && (
              <button className="btn btn-secondary flex-center gap-2" onClick={loadData}>
                <RefreshCw size={15} />
                <span>Retry Connection</span>
              </button>
            )}
            {isInvalid && (
              <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
                Go to Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const docStatus = docRecord.processingStatus || docRecord.status || 'pending';
  const clauses = analysis?.clauses || [];

  return (
    <div className="page" style={{ paddingBottom: '2rem' }}>
      <div className="container">
        {/* Workspace Top Header */}
        <div className="workspace-split-header">
          <div>
            <button
              className="btn btn-ghost btn-xs flex-center gap-1 mb-2"
              onClick={() => navigate('/documents')}
            >
              <ArrowLeft size={13} />
              <span>Back to Documents Repository</span>
            </button>

            <div className="flex-center gap-2" style={{ flexWrap: 'wrap' }}>
              <h1 className="page-title" style={{ fontSize: '1.4rem', margin: 0 }}>
                {docRecord.title || docRecord.originalName}
              </h1>
              <span className="badge badge-neutral text-mono" style={{ fontSize: '11px', fontWeight: 700 }}>
                v{docRecord.version || 1}.0
              </span>
              <span
                className={`badge ${
                  docStatus === 'completed'
                    ? 'badge-success'
                    : docStatus === 'failed'
                    ? 'badge-danger'
                    : 'badge-warning'
                } text-mono`}
              >
                {docStatus.toUpperCase()}
              </span>
            </div>

            {/* Document Metadata Strip */}
            <div className="flex-center gap-3 mt-2 text-xs text-mono muted" style={{ flexWrap: 'wrap' }}>
              <span className="flex-center gap-1">
                <Layers size={12} />
                <span>{docRecord.documentType ? docRecord.documentType.toUpperCase() : 'GENERAL AGREEMENT'}</span>
              </span>
              <span>·</span>
              <span>FORMAT: {docRecord.fileFormat?.toUpperCase() || 'DOCUMENT'}</span>
              {docRecord.fileSize && (
                <>
                  <span>·</span>
                  <span>{formatSize(docRecord.fileSize)}</span>
                </>
              )}
              {metadata?.pageCount && (
                <>
                  <span>·</span>
                  <span>{metadata.pageCount} {metadata.pageCount === 1 ? 'PAGE' : 'PAGES'}</span>
                </>
              )}
              {metadata?.detectedLanguage && (
                <>
                  <span>·</span>
                  <span className="flex-center gap-1">
                    <Globe size={11} />
                    <span>{metadata.detectedLanguage.toUpperCase()}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right Action Tools & Layout Controls */}
          <div className="flex-center gap-3" style={{ flexWrap: 'wrap' }}>
            {/* Split-pane mode switcher */}
            <div className="workspace-layout-controls" title="Adjust Workspace Split Ratio">
              <button
                className={`workspace-layout-btn ${splitMode === 'split-50' ? 'active' : ''}`}
                onClick={() => setAndStoreSplitMode('split-50')}
                title="50% Document / 50% Intelligence Findings"
              >
                <Columns size={12} />
                <span>50 / 50</span>
              </button>
              <button
                className={`workspace-layout-btn ${splitMode === 'split-40-60' ? 'active' : ''}`}
                onClick={() => setAndStoreSplitMode('split-40-60')}
                title="40% Document / 60% Intelligence Findings"
              >
                <span>40 / 60</span>
              </button>
              <button
                className={`workspace-layout-btn ${splitMode === 'split-60-40' ? 'active' : ''}`}
                onClick={() => setAndStoreSplitMode('split-60-40')}
 
 
                title="60% Document / 40% Intelligence Findings"
              >
                <span>60 / 40</span>
              </button>
              <button
                className={`workspace-layout-btn ${splitMode === 'focus-doc' ? 'active' : ''}`}
                onClick={() => setAndStoreSplitMode('focus-doc')}
                title="Focus Document Only (Collapse Intelligence)"
              >
                <span>Doc Only</span>
              </button>
              <button
                className={`workspace-layout-btn ${splitMode === 'focus-intel' ? 'active' : ''}`}
                onClick={() => setAndStoreSplitMode('focus-intel')}
                title="Focus Findings Only (Collapse Document)"
              >
                <span>Findings Only</span>
              </button>
            </div>

            <button
              className="btn btn-secondary btn-sm flex-center gap-2"
              onClick={() => setIsVersionModalOpen(true)}
              title="Inspect complete version history and upload revisions"
            >
              <History size={13} />
              <span>History ({versions.length || 1})</span>
            </button>

            <button
              className="btn btn-secondary btn-sm flex-center gap-2"
              onClick={() => {
                const other = versions.find((v) => v._id !== id);
                setCompareTargetId(other ? other._id : id);
                setIsCompareMode(true);
              }}
              title="Compare with another version or contract"
            >
              <GitBranch size={13} />
              <span>Compare</span>
            </button>

            <button
              className="btn btn-secondary btn-sm flex-center gap-2"
              onClick={loadData}
              title="Refresh telemetry and analysis records"
            >
              <RefreshCw size={13} />
              <span>Refresh</span>
            </button>

            <button
              className="btn btn-secondary btn-sm flex-center gap-2"
              onClick={() => navigate('/chat', { state: { documentId: id } })}
              title="Query contract with conversational RAG assistant"
            >
              <MessageSquare size={13} />
              <span>AI Chat</span>
            </button>

            <button
              className="btn btn-primary btn-sm flex-center gap-2"
              onClick={handleGeneratePDF}
              disabled={generatingReport || docStatus !== 'completed'}
              title="Download executive audit report as PDF"
            >
              <Download size={13} />
              <span>{generatingReport ? 'Generating…' : 'Export PDF'}</span>
            </button>
          </div>
        </div>

        {isCompareMode ? (
          <DocumentCompareWorkspace
            baseDocumentId={id}
            targetDocumentId={compareTargetId || id}
            availableDocuments={versions.length > 1 ? versions : availableDocs}
            onClose={() => setIsCompareMode(false)}
            onSwitchDocuments={(_bId, tId) => {
              setCompareTargetId(tId);
            }}
          />
        ) : (
          <>
            {/* 5-Stage Ingestion Pipeline Banner */}
            {(docStatus === 'processing' || docStatus === 'pending') && (
              <div
                className="card mb-4"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderLeft: '4px solid var(--color-primary)',
                  padding: 'var(--space-4)',
                }}
              >
                <div className="flex-center justify-between mb-3" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div className="flex-center gap-2">
                    <Loader2 size={16} className="spin" color="var(--color-primary)" />
                    <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                      AI Document Reasoning Pipeline Active
                    </span>
                    <span className="badge badge-warning text-mono text-xs">
                      {docRecord.processingStage ? docRecord.processingStage.toUpperCase() : 'QUEUED'} (
                      {docRecord.processingProgress !== undefined && docRecord.processingProgress !== null ? docRecord.processingProgress : 15}%)
                    </span>
                  </div>
                  <div className="text-xs text-mono muted">
                    Real-time telemetry stream active · Auto-refreshing
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: '6px', background: 'var(--color-surface-2)', borderRadius: '3px', overflow: 'hidden', marginBottom: '1rem' }}>
                  <div
                    style={{
                      width: `${Math.max(docRecord.processingProgress || 15, 10)}%`,
                      height: '100%',
                      background: 'var(--color-primary)',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>

                {/* 5 Sequential Stage Chips */}
                <div className="grid-5" style={{ gap: '0.5rem' }}>
                  {[
                    { key: 'queued', label: '1. Ingestion Queue', desc: 'SHA-256 & sanitize' },
                    { key: 'extracting', label: '2. Docling OCR', desc: 'Hierarchy extraction' },
                    { key: 'classifying', label: '3. Legal-BERT', desc: 'Clause classification' },
                    { key: 'analyzing', label: '4. Risk Engine', desc: '10-Category scoring' },
                    { key: 'indexing', label: '5. Vector Index', desc: 'FAISS embeddings' },
                  ].map((stage, idx) => {
                    const stageOrder = ['queued', 'extracting', 'classifying', 'analyzing', 'indexing', 'completed'];
                    const currentIdx = stageOrder.indexOf(docRecord.processingStage || 'queued');
                    const isDone = currentIdx > idx;
                    const isCurrent = currentIdx === idx;

                    return (
                      <div
                        key={stage.key}
                        style={{
                          padding: '0.5rem 0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          border: isCurrent ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                          background: isCurrent ? 'var(--color-surface-2)' : 'var(--color-surface)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                        }}
                      >
                        <div className="flex-center gap-1" style={{ justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '11px', fontWeight: isCurrent ? 700 : 500 }}>
                            {stage.label}
                          </span>
                          {isDone ? (
                            <CheckCircle2 size={12} color="var(--color-success)" />
                          ) : isCurrent ? (
                            <Loader2 size={11} className="spin" color="var(--color-primary)" />
                          ) : (
                            <Clock size={11} color="var(--color-text-muted)" />
                          )}
                        </div>
                        <span className="text-mono" style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>
                          {stage.desc}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Failed Pipeline Alert Banner */}
            {docStatus === 'failed' && (
              <div
                className="alert alert-danger flex-center justify-between mb-4"
                style={{ padding: 'var(--space-3) var(--space-4)' }}
              >
                <div className="flex-center gap-2">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Analysis Failed:</strong>{' '}
                    <span>{docRecord.processingError || 'An error occurred during OCR extraction, model inference, or FAISS vector indexing.'}</span>
                    {docRecord.retryCount > 0 && (
                      <span className="text-xs text-mono ml-2 muted">(Retry count: {docRecord.retryCount})</span>
                    )}
                  </div>
                </div>
                <button
                  className="btn btn-secondary btn-sm flex-center gap-2"
                  disabled={isRetrying}
                  onClick={handleRetryPipeline}
                >
                  <RotateCcw size={13} className={isRetrying ? 'spin' : ''} />
                  <span>{isRetrying ? 'Restarting…' : 'Retry Ingestion Pipeline'}</span>
                </button>
              </div>
            )}

            {/* Split-Pane Document Intelligence Grid */}
            <div className={`workspace-split-grid ${splitMode}`}>
              {/* Left Pane: Original Document Viewer */}
              {splitMode !== 'focus-intel' && (
                <DocumentViewerPane
                  document={docRecord}
                  metadata={metadata}
                  clauses={clauses}
                  activeEvidence={activeEvidence}
                  onClearEvidence={handleClearEvidence}
                  isCollapsed={false}
                  onToggleCollapse={() => setAndStoreSplitMode('focus-intel')}
                />
              )}

              {/* Right Pane: 7 Analysis Sections */}
              {splitMode !== 'focus-doc' && (
                <IntelligenceWorkspacePane
                  document={docRecord}
                  metadata={metadata}
                  analysis={analysis}
                  risk={risk}
                  activeEvidence={activeEvidence}
                  onSelectEvidence={handleSelectEvidence}
                  isCollapsed={false}
                  onToggleCollapse={() => setAndStoreSplitMode('focus-doc')}
                />
              )}
            </div>
          </>
        )}

        {/* Version History & Upload Modal */}
        <DocumentVersionModal
          isOpen={isVersionModalOpen}
          onClose={() => setIsVersionModalOpen(false)}
          currentDocId={id}
          currentDocName={docRecord.originalName}
          versions={versions}
          onSelectVersion={(verId) => {
            setIsVersionModalOpen(false);
            navigate(`/documents/${verId}`);
          }}
          onCompareVersions={(_bId, tId) => {
            setIsVersionModalOpen(false);
            setCompareTargetId(tId);
            setIsCompareMode(true);
          }}
          onVersionUploaded={(newDoc) => {
            setIsVersionModalOpen(false);
            loadVersions();
            if (newDoc?._id) navigate(`/documents/${newDoc._id}`);
          }}
        />
      </div>
    </div>
  );
}