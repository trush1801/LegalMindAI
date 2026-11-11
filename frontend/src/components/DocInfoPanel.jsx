import { Calendar, FileCheck, FileText, Globe, Layers, ShieldCheck } from 'lucide-react';

export default function DocInfoPanel({ document, metadata }) {
  if (!document) return null;

  const formatDate = (d) =>
    d
      ? new Date(d).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'N/A';

  const formatSize = (bytes) => {
    if (!bytes) return 'N/A';
    const kb = bytes / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
  };

  return (
    <div className="card" id="doc-info-section">
      <div className="card-header">
        <h2 className="card-title flex-center gap-2">
          <FileText size={18} color="var(--color-primary)" />
          <span>1. Document Overview</span>
        </h2>
        <span
          className={`badge ${
            document.status === 'completed'
              ? 'badge-success'
              : document.status === 'failed'
              ? 'badge-danger'
              : 'badge-warning'
          }`}
        >
          {document.status?.toUpperCase() || 'INDEXED'}
        </span>
      </div>

      <div className="grid-3 mt-4">
        <div className="stat-metric-card">
          <div>
            <div className="form-hint">Agreement Classification</div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '4px' }}>
              {document.documentType || 'General Contract'}
            </div>
          </div>
          <Layers size={20} color="var(--color-text-secondary)" />
        </div>

        <div className="stat-metric-card">
          <div>
            <div className="form-hint">Document Language</div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '4px' }}>
              {metadata?.language || document.language || 'English (EN)'}
            </div>
          </div>
          <Globe size={20} color="var(--color-text-secondary)" />
        </div>

        <div className="stat-metric-card">
          <div>
            <div className="form-hint">Volume &amp; Chunk Density</div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '4px' }} className="text-mono">
              {document.pageCount || metadata?.pageCount || 1} Pgs · {metadata?.chunkCount || 'Indexed'} Chunks
            </div>
          </div>
          <FileCheck size={20} color="var(--color-text-secondary)" />
        </div>
      </div>

      <div
        className="grid-2 mt-4"
        style={{
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border-subtle)',
          padding: '1rem',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <div>
          <div className="form-hint">Original Filename</div>
          <div className="text-sm text-mono" style={{ fontWeight: 500 }}>
            {document.originalName || document.title}
          </div>
        </div>
        <div>
          <div className="form-hint">Storage Size</div>
          <div className="text-sm text-mono" style={{ fontWeight: 500 }}>
            {formatSize(document.fileSize)}
          </div>
        </div>
        <div>
          <div className="form-hint">Upload Timestamp</div>
          <div className="text-sm flex-center gap-1" style={{ fontWeight: 500 }}>
            <Calendar size={13} color="var(--color-text-secondary)" />
            <span>{formatDate(document.createdAt)}</span>
          </div>
        </div>
        <div>
          <div className="form-hint">Indexing Architecture</div>
          <div className="text-sm flex-center gap-1" style={{ fontWeight: 500 }}>
            <ShieldCheck size={13} color="var(--color-success)" />
            <span>Vector Embeddings Active in FAISS</span>
          </div>
        </div>
      </div>
    </div>
  );
}