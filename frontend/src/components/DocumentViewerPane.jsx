import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileCode,
  FileText,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { documentAPI } from '../services/api';
import Spinner from './Spinner';

export default function DocumentViewerPane({
  document,
  metadata,
  clauses = [],
  activeEvidence = null,
  onClearEvidence = () => {},
  isCollapsed = false,
  onToggleCollapse = () => {},
}) {
  const [viewMode, setViewMode] = useState('passages'); // 'passages' | 'preview'
  const [fileBlobUrl, setFileBlobUrl] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [zoomLevel, setZoomLevel] = useState(100);

  const passageRefs = useRef({});

  // Auto-load original file blob when preview mode is chosen
  useEffect(() => {
    let active = true;
    let url = null;

    if (viewMode === 'preview' && document?._id && !fileBlobUrl) {
      setLoadingFile(true);
      setFileError(null);

      documentAPI
        .getFile(document._id)
        .then((res) => {
          if (!active) return;
          const blob = new Blob([res.data], {
            type: document.mimeType || 'application/pdf',
          });
          url = URL.createObjectURL(blob);
          setFileBlobUrl(url);
        })
        .catch((err) => {
          if (!active) return;
          console.warn('Could not load native file preview stream:', err.message);
          setFileError('Native file preview unavailable for this document. Viewing extracted source passages.');
          setViewMode('passages');
        })
        .finally(() => {
          if (active) setLoadingFile(false);
        });
    }

    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [viewMode, document?._id, document?.mimeType, fileBlobUrl]);

  // Scroll to targeted evidence passage when activeEvidence changes
  useEffect(() => {
    if (!activeEvidence) return;

    // Switch to passages if in preview mode so user sees exact highlight
    if (viewMode !== 'passages') {
      setViewMode('passages');
    }

    const timer = setTimeout(() => {
      const targetKey =
        activeEvidence.key ||
        (activeEvidence.page ? `page-${activeEvidence.page}` : null) ||
        (activeEvidence.clauseId ? `clause-${activeEvidence.clauseId}` : null);

      if (targetKey && passageRefs.current[targetKey]) {
        passageRefs.current[targetKey].scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [activeEvidence, viewMode]);

  // Assemble source passages from extractedText or classified clauses
  const extractedRawText = metadata?.extractedText || '';
  const hasExtractedText = Boolean(extractedRawText && extractedRawText.trim().length > 0);

  // Group clauses by page if available
  const clausesWithPages = clauses.filter((c) => c && (c.clauseText || c.text));

  // Determine pages array
  const totalPages = metadata?.pageCount || document?.pageCount || 1;

  // Filter passages by user search query
  const matchesSearch = (text) => {
    if (!searchTerm) return true;
    return (text || '').toLowerCase().includes(searchTerm.toLowerCase());
  };

  const handleDownload = async () => {
    try {
      const res = await documentAPI.getFile(document._id);
      const blob = new Blob([res.data], {
        type: document.mimeType || 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.originalName || `contract_${document._id}.pdf`;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download original document: ' + (err.message || 'Unknown error'));
    }
  };

  if (isCollapsed) {
    return (
      <div
        className="split-pane-card flex-center"
        style={{
          width: '48px',
          cursor: 'pointer',
          padding: '1rem 0',
          background: 'var(--color-surface-2)',
        }}
        onClick={onToggleCollapse}
        title="Expand Original Document Pane"
      >
        <button className="btn btn-ghost btn-sm" aria-label="Expand document pane">
          <ChevronRight size={18} />
        </button>
        <span
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-secondary)',
            marginTop: '1rem',
            fontWeight: 700,
          }}
        >
          Original Document
        </span>
      </div>
    );
  }

  return (
    <div className="split-pane-card" id="document-viewer-pane">
      {/* Pane Top Header */}
      <div className="split-pane-header">
        <div className="flex-center gap-2">
          <FileText size={16} color="var(--color-primary)" />
          <h3 className="split-pane-title">Original Document</h3>
          <span className="source-badge-tag">
            {document?.fileFormat?.toUpperCase() || 'DOCUMENT'}
          </span>
          {totalPages > 0 && (
            <span className="source-badge-tag text-mono">
              {totalPages} {totalPages === 1 ? 'PAGE' : 'PAGES'}
            </span>
          )}
        </div>

        <div className="flex-center gap-2">
          {/* Mode switch */}
          <div className="workspace-layout-controls">
            <button
              className={`workspace-layout-btn ${viewMode === 'passages' ? 'active' : ''}`}
              onClick={() => setViewMode('passages')}
              title="View extracted passages with evidence citation"
            >
              <BookOpen size={13} />
              <span>Passages</span>
            </button>
            <button
              className={`workspace-layout-btn ${viewMode === 'preview' ? 'active' : ''}`}
              onClick={() => setViewMode('preview')}
              title="Preview native document format"
            >
              <Eye size={13} />
              <span>Native</span>
            </button>
          </div>

          <button
            className="btn btn-ghost btn-xs"
            onClick={handleDownload}
            title="Download original uploaded file"
          >
            <Download size={13} />
          </button>

          <button
            className="btn btn-ghost btn-xs"
            onClick={onToggleCollapse}
            title="Collapse document pane"
            aria-label="Collapse document pane"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* Pane Sub-Toolbar: Search and Evidence Targeting */}
      <div
        style={{
          padding: '0.5rem 1rem',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: '9px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
            }}
          />
          <input
            type="text"
            className="form-input"
            style={{
              paddingLeft: '28px',
              fontSize: '12px',
              paddingTop: '0.3rem',
              paddingBottom: '0.3rem',
            }}
            placeholder="Search within source contract…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {viewMode === 'passages' && (
          <div className="flex-center gap-1">
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setZoomLevel((z) => Math.max(80, z - 10))}
              title="Decrease font size"
            >
              <ZoomOut size={12} />
            </button>
            <span className="text-xs text-mono muted" style={{ minWidth: '38px', textAlign: 'center' }}>
              {zoomLevel}%
            </span>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setZoomLevel((z) => Math.min(140, z + 10))}
              title="Increase font size"
            >
              <ZoomIn size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Active Evidence Notification Strip */}
      {activeEvidence && (
        <div className="evidence-banner-strip">
          <div className="flex-center gap-2">
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: 'var(--color-primary)',
                display: 'inline-block',
              }}
            />
            <span>
              Targeted Source Evidence:{' '}
              <strong>
                {activeEvidence.page ? `Page ${activeEvidence.page}` : 'Document Context'}
                {activeEvidence.section ? ` · Section ${activeEvidence.section}` : ''}
              </strong>
            </span>
          </div>
          <button
            className="btn btn-ghost btn-xs text-mono"
            onClick={onClearEvidence}
            style={{ fontSize: '11px', textDecoration: 'underline' }}
          >
            Clear Target
          </button>
        </div>
      )}

      {/* Pane Content Body */}
      <div className="split-pane-body" style={{ fontSize: `${zoomLevel}%` }}>
        {viewMode === 'preview' ? (
          /* Native Preview Mode */
          <div style={{ height: '100%', minHeight: '520px', display: 'flex', flexDirection: 'column' }}>
            {loadingFile ? (
              <div style={{ padding: '3rem 0', textAlign: 'center' }}>
                <Spinner label="Loading native document preview…" />
              </div>
            ) : fileError ? (
              <div className="alert alert-warning text-xs">
                {fileError}
              </div>
            ) : fileBlobUrl ? (
              <iframe
                src={`${fileBlobUrl}#toolbar=1&navpanes=1`}
                title={document.originalName || 'Contract Document'}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: '560px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface)',
                }}
              />
            ) : (
              <div className="empty-state">
                <p>Native preview not initialized.</p>
                <button className="btn btn-secondary btn-sm mt-2" onClick={handleDownload}>
                  Download Document File
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Extracted Source Passages Mode */
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '0.65rem',
                marginBottom: '1rem',
                borderBottom: '1px solid var(--color-border-subtle)',
              }}
            >
              <span className="text-xs text-mono muted">
                Source Document: <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{document.originalName}</span>
              </span>
              <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                IMMUTABLE SOURCE PASSAGES
              </span>
            </div>

            {/* If we have segmented clauses, render them with page & section citations */}
            {clausesWithPages.length > 0 ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {clausesWithPages
                  .filter((clause) => matchesSearch(clause.clauseText || clause.text))
                  .map((clause, idx) => {
                    const clauseText = clause.clauseText || clause.text || '';
                    const pageNum = clause.page || null;
                    const sectionName = clause.section || null;
                    const clauseType = clause.clauseType || clause.type || 'Provision';

                    const isTargeted =
                      activeEvidence &&
                      ((activeEvidence.page && activeEvidence.page === pageNum) ||
                        (activeEvidence.clauseId && activeEvidence.clauseId === clause._id) ||
                        (activeEvidence.text &&
                          clauseText.toLowerCase().includes(activeEvidence.text.slice(0, 30).toLowerCase())));

                    const key = `clause-${clause._id || idx}`;

                    return (
                      <div
                        key={key}
                        ref={(el) => {
                          if (el) {
                            passageRefs.current[key] = el;
                            if (pageNum) passageRefs.current[`page-${pageNum}`] = el;
                          }
                        }}
                        className={`passage-block ${isTargeted ? 'is-targeted' : ''}`}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '0.4rem',
                          }}
                        >
                          <div className="flex-center gap-2">
                            <span
                              className="text-mono"
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                color: 'var(--color-text)',
                                textTransform: 'uppercase',
                              }}
                            >
                              § {clauseType}
                            </span>
                            {pageNum && (
                              <span className="badge badge-neutral text-mono" style={{ fontSize: '10px' }}>
                                PAGE {pageNum}
                              </span>
                            )}
                            {sectionName && (
                              <span className="text-xs text-mono muted">
                                {sectionName}
                              </span>
                            )}
                          </div>
                          {isTargeted && (
                            <span className="badge badge-primary text-mono" style={{ fontSize: '10px' }}>
                              EVIDENCE MATCH
                            </span>
                          )}
                        </div>

                        <div className="source-verbatim-box" style={{ margin: 0 }}>
                          "{clauseText}"
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : hasExtractedText ? (
              /* Fallback to extractedText preview split by paragraphs */
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {extractedRawText
                  .split(/\n\s*\n/)
                  .filter((p) => p.trim().length > 0 && matchesSearch(p))
                  .map((paragraph, pIdx) => {
                    const key = `p-${pIdx}`;
                    const isTargeted =
                      activeEvidence?.text &&
                      paragraph.toLowerCase().includes(activeEvidence.text.slice(0, 30).toLowerCase());

                    return (
                      <div
                        key={key}
                        ref={(el) => {
                          if (el) passageRefs.current[key] = el;
                        }}
                        className={`passage-block ${isTargeted ? 'is-targeted' : ''}`}
                      >
                        <div className="flex-center justify-between mb-1">
                          <span className="text-xs text-mono muted">Passage ¶{pIdx + 1}</span>
                          {isTargeted && (
                            <span className="badge badge-primary text-mono" style={{ fontSize: '10px' }}>
                              EVIDENCE MATCH
                            </span>
                          )}
                        </div>
                        <div
                          className="text-sm"
                          style={{
                            fontFamily: 'var(--font-serif)',
                            lineHeight: '1.65',
                            color: 'var(--color-text)',
                          }}
                        >
                          {paragraph}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '3rem 1rem' }}>
                <FileCode size={24} className="mb-2" color="var(--color-text-muted)" />
                <p style={{ fontWeight: 600 }}>Raw text passages pending extraction.</p>
                <p className="text-xs muted mt-1">
                  Once the AI processing pipeline completes OCR and vectorization, verbatim contract passages will render here.
                </p>
                <button className="btn btn-secondary btn-sm mt-3" onClick={handleDownload}>
                  Download Document File ({document.fileFormat?.toUpperCase()})
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
