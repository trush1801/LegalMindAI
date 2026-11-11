import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  GitBranch,
  History,
  Loader2,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { documentAPI } from '../services/api';

export default function DocumentVersionModal({
  isOpen,
  onClose,
  currentDocId,
  currentDocName,
  versions = [],
  onSelectVersion,
  onCompareVersions,
  onVersionUploaded,
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [versionComment, setVersionComment] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (max 25MB)
    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('File exceeds 25 MB limit.');
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx', 'txt'].includes(ext)) {
      setErrorMsg('Unsupported format. Only PDF, DOCX, and TXT are permitted.');
      return;
    }

    setErrorMsg(null);
    setSelectedFile(file);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please select a revised contract file to upload.');
      return;
    }

    try {
      setIsUploading(true);
      setErrorMsg(null);

      const formData = new FormData();
      formData.append('document', selectedFile);
      if (versionComment.trim()) {
        formData.append('versionComment', versionComment.trim());
      }

      const res = await documentAPI.uploadVersion(currentDocId, formData);
      const newDoc = res?.data?.data?.document;

      setSelectedFile(null);
      setVersionComment('');

      if (onVersionUploaded) {
        onVersionUploaded(newDoc);
      }
    } catch (err) {
      console.error('Failed to upload new version:', err);
      setErrorMsg(err.message || 'Version upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const getRiskBadge = (score, level) => {
    const s = (level || 'low').toLowerCase();
    let badgeClass = 'badge-neutral';
    if (s === 'critical') badgeClass = 'badge-critical';
    else if (s === 'high') badgeClass = 'badge-danger';
    else if (s === 'medium') badgeClass = 'badge-warning';
    else if (s === 'low') badgeClass = 'badge-success';

    return (
      <span className={`badge ${badgeClass} text-mono`}>
        {score} / 100 · {s.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '780px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'between',
            background: 'var(--color-surface)',
          }}
        >
          <div className="flex-center gap-2" style={{ flex: 1 }}>
            <History size={18} color="var(--color-primary)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                Version History &amp; Lineage
              </h3>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '0.8rem',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Document: <strong style={{ color: 'var(--color-text)' }}>{currentDocName}</strong>
              </p>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          {/* Version Timeline */}
          <div>
            <div
              className="flex-center justify-between mb-3"
              style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '0.5rem' }}
            >
              <span className="text-xs text-mono" style={{ fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.06em' }}>
                RECORDED REVISIONS ({versions.length})
              </span>
              <span className="text-xs text-secondary">
                Immutable Version Chain
              </span>
            </div>

            {versions.length === 0 ? (
              <div className="split-empty-state" style={{ padding: '2rem 1rem' }}>
                <Clock size={24} color="var(--color-text-tertiary)" />
                <p className="text-sm text-secondary" style={{ marginTop: '0.5rem' }}>
                  No previous versions recorded for this document.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {versions.map((v) => {
                  const isCurrent = v._id === currentDocId;
                  const dateStr = new Date(v.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={v._id}
                      style={{
                        background: isCurrent ? 'var(--color-surface-2)' : 'var(--color-surface)',
                        border: isCurrent ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1rem',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <div className="flex-center justify-between" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div className="flex-center gap-2">
                          <span
                            className="badge text-mono"
                            style={{
                              background: isCurrent ? 'var(--color-primary)' : 'var(--color-surface-2)',
                              color: isCurrent ? 'var(--color-surface)' : 'var(--color-text)',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              padding: '2px 8px',
                            }}
                          >
                            v{v.version}.0
                          </span>

                          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                            {v.originalName}
                          </span>

                          {isCurrent && (
                            <span className="badge badge-success text-mono" style={{ fontSize: '10px' }}>
                              ACTIVE VIEW
                            </span>
                          )}

                          {v.processingStatus === 'processing' && (
                            <span className="badge badge-warning text-mono flex-center gap-1" style={{ fontSize: '10px' }}>
                              <Loader2 size={10} className="spinning" />
                              PROCESSING
                            </span>
                          )}
                        </div>

                        {/* Risk Indicator */}
                        <div>
                          {getRiskBadge(
                            v.analysisSummary?.overallRiskScore ?? 0,
                            v.analysisSummary?.overallRiskLevel
                          )}
                        </div>
                      </div>

                      {/* Changelog Comment */}
                      {v.versionComment && (
                        <div
                          className="text-xs"
                          style={{
                            margin: '0.5rem 0',
                            color: 'var(--color-text)',
                            background: 'var(--color-surface-2)',
                            padding: '0.4rem 0.65rem',
                            borderRadius: 'var(--radius-sm)',
                            borderLeft: '2px solid var(--color-primary)',
                          }}
                        >
                          <strong>Revision Notes:</strong> {v.versionComment}
                        </div>
                      )}

                      {/* Version Meta Strip */}
                      <div
                        className="flex-center justify-between text-xs text-secondary mt-2 pt-2"
                        style={{ borderTop: '1px solid var(--color-border-subtle)', flexWrap: 'wrap', gap: '0.5rem' }}
                      >
                        <div className="flex-center gap-3">
                          <span>{dateStr}</span>
                          <span>·</span>
                          <span>{(v.fileSize / 1024).toFixed(1)} KB</span>
                          <span>·</span>
                          <span>{v.metadata?.pageCount || 1} {v.metadata?.pageCount === 1 ? 'page' : 'pages'}</span>
                          <span>·</span>
                          <span>{v.analysisSummary?.clausesCount || 0} clauses</span>
                        </div>

                        <div className="flex-center gap-2">
                          {!isCurrent && (
                            <button
                              className="btn btn-secondary btn-xs flex-center gap-1"
                              onClick={() => onSelectVersion(v._id)}
                            >
                              <span>Switch View</span>
                              <ArrowRight size={12} />
                            </button>
                          )}

                          {versions.length > 1 && (
                            <button
                              className="btn btn-outline btn-xs flex-center gap-1"
                              onClick={() => onCompareVersions(currentDocId, v._id)}
                              title={`Compare with v${v.version}`}
                            >
                              <GitBranch size={12} />
                              <span>{isCurrent ? 'Compare with other' : 'Compare with this'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upload New Revision Card */}
          <div
            style={{
              border: '1px dashed var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              background: 'var(--color-surface-2)',
            }}
          >
            <div className="flex-center gap-2 mb-2">
              <Upload size={16} color="var(--color-primary)" />
              <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700 }}>
                Upload New Contract Revision
              </h4>
            </div>
            <p className="text-xs text-secondary mb-3">
              Upload a revised draft or redline. The original document remains immutable and the new version will be automatically extracted, parsed for clauses, and scored for risk.
            </p>

            {errorMsg && (
              <div
                className="flex gap-2 text-xs mb-3"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--color-danger, #ef4444)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleUploadSubmit}>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div>
                  <label className="text-xs text-secondary" style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                    Select Revision Document (PDF, DOCX, TXT)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileChange}
                    style={{
                      width: '100%',
                      padding: '0.45rem',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.85rem',
                    }}
                  />
                  {selectedFile && (
                    <span className="text-xs text-secondary" style={{ marginTop: '3px', display: 'block' }}>
                      Selected: <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-xs text-secondary" style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                    Revision Changelog Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Counterparty redline with indemnity cap and 60-day notice"
                    value={versionComment}
                    onChange={(e) => setVersionComment(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.85rem',
                      color: 'var(--color-text)',
                    }}
                  />
                </div>

                <div className="flex-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setSelectedFile(null);
                      setVersionComment('');
                      setErrorMsg(null);
                    }}
                    disabled={isUploading}
                  >
                    Clear
                  </button>

                  <button
                    type="submit"
                    className="btn btn-primary btn-sm flex-center gap-2"
                    disabled={!selectedFile || isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 size={14} className="spinning" />
                        <span>Uploading &amp; Processing...</span>
                      </>
                    ) : (
                      <>
                        <Plus size={14} />
                        <span>Submit Version {(versions.length || 1) + 1}.0</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
