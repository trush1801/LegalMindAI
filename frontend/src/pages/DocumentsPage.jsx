import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  ExternalLink,
  FileText,
  Filter,
  Grid,
  List,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import UploadModal from '../components/UploadModal';
import Spinner from '../components/Spinner';
import { documentAPI } from '../services/api';

const getStageLabel = (stage) => {
  switch (stage) {
    case 'queued': return 'Queued';
    case 'extracting': return 'Extracting';
    case 'classifying': return 'Classifying';
    case 'analyzing': return 'Analyzing';
    case 'indexing': return 'Indexing';
    case 'completed': return 'Completed';
    case 'failed': return 'Failed';
    default: return stage || 'Pending';
  }
};

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'grid'
  const [uploadOpen, setUploadOpen] = useState(false);

  const loadDocuments = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await documentAPI.list();
      const rawDocs =
        res?.data?.data?.documents ||
        res?.data?.documents ||
        (Array.isArray(res?.data?.data) ? res.data.data : null) ||
        (Array.isArray(res?.data) ? res.data : []);
      setDocuments(Array.isArray(rawDocs) ? rawDocs : []);
    } catch (err) {
      console.error('Failed to load documents:', err);
      if (!silent) setDocuments([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  // Active polling while any document is in pending or processing state
  useEffect(() => {
    const hasActiveProcessing = documents.some(
      (d) => (d.processingStatus || d.status) === 'pending' || (d.processingStatus || d.status) === 'processing'
    );
    if (!hasActiveProcessing) return;

    const interval = setInterval(() => {
      loadDocuments(true);
    }, 2500);

    return () => clearInterval(interval);
  }, [documents]);

  const handleRetry = async (id, e) => {
    e.stopPropagation();
    try {
      setRetryingId(id);
      await documentAPI.retry(id);
      await loadDocuments(true);
    } catch (err) {
      alert(err.message || 'Failed to restart document analysis pipeline');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDelete = async (id, title, e) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete "${title}"?`)) return;
    try {
      await documentAPI.remove(id);
      setDocuments((prev) => (Array.isArray(prev) ? prev.filter((d) => d._id !== id) : []));
    } catch (err) {
      alert(err.message || 'Failed to delete document');
    }
  };

  const safeDocs = Array.isArray(documents) ? documents : [];

  const filteredDocs = safeDocs
    .filter((doc) => {
      const matchesSearch =
        !search ||
        (doc.title || doc.originalName || '').toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'ALL' || doc.documentType === typeFilter;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'risk') {
        const scoreA = a.riskScore ?? a.riskAnalysis?.overallRiskScore ?? 0;
        const scoreB = b.riskScore ?? b.riskAnalysis?.overallRiskScore ?? 0;
        return scoreB - scoreA;
      }
      return 0;
    });

  return (
    <div className="page">
      <div className="container">
        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Document Repository</h1>
            <p className="page-subtitle">
              Unified archive of contracts, leases, and agreements with automated classification and risk telemetry.
            </p>
          </div>
          <button className="btn btn-primary flex-center gap-2" onClick={() => setUploadOpen(true)}>
            <Plus size={16} />
            <span>Upload New Contract</span>
          </button>
        </div>

        {/* Filter & Control Strip */}
        <div className="card mb-4" style={{ padding: 'var(--space-4)' }}>
          <div className="flex gap-3" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-text-muted)',
                }}
              />
              <input
                className="form-input"
                style={{ paddingLeft: '32px' }}
                placeholder="Search repository by title or filename…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Category Dropdown */}
            <div className="flex-center gap-2">
              <Filter size={14} color="var(--color-text-secondary)" />
              <select
                className="form-select"
                style={{ width: 'auto', minWidth: '150px' }}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                <option value="NDA">NDA</option>
                <option value="Employment">Employment</option>
                <option value="Master Services Agreement">Master Services Agreement</option>
                <option value="Commercial Lease">Commercial Lease</option>
                <option value="General">General</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex-center gap-2">
              <ArrowUpDown size={14} color="var(--color-text-secondary)" />
              <select
                className="form-select"
                style={{ width: 'auto' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="newest">Sort: Newest First</option>
                <option value="oldest">Sort: Oldest First</option>
                <option value="title">Sort: Title (A–Z)</option>
                <option value="risk">Sort: Highest Risk</option>
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex-center gap-1" style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: '0.75rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'table' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setViewMode('table')}
                title="Table View"
                aria-label="Table View"
              >
                <List size={14} />
              </button>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'grid' ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
                aria-label="Grid View"
              >
                <Grid size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Repository Content */}
        {loading ? (
          <Spinner label="Loading contract repository…" />
        ) : filteredDocs.length === 0 ? (
          <div className="empty-state card">
            <h3>No documents match your filter criteria</h3>
            <p>Try clearing active search queries or upload a new contract to begin.</p>
            <button className="btn btn-secondary mt-2" onClick={() => { setSearch(''); setTypeFilter('ALL'); }}>
              Reset Filters
            </button>
          </div>
        ) : viewMode === 'table' ? (
          /* Swiss Table Layout */
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contract Title</th>
                  <th>Classification</th>
                  <th>Status</th>
                  <th>Exposure Score</th>
                  <th>Upload Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => {
                  const score = doc.riskScore ?? doc.riskAnalysis?.overallRiskScore;
                  const st = doc.processingStatus || doc.status || 'pending';

                  return (
                    <tr
                      key={doc._id}
                      onClick={() => navigate(`/documents/${doc._id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <FileText size={15} color="var(--color-text-secondary)" />
                          <span style={{ fontWeight: 600 }}>{doc.title || doc.originalName}</span>
                          <span className="badge badge-neutral text-mono" style={{ fontSize: '10px' }}>
                            v{doc.version || 1}.0
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral">
                          {doc.documentType || 'General'}
                        </span>
                      </td>
                      <td>
                        {st === 'completed' ? (
                          <span className="badge badge-success">Completed</span>
                        ) : st === 'failed' ? (
                          <div className="flex-center gap-1" style={{ justifyContent: 'flex-start' }}>
                            <span className="badge badge-danger">Failed</span>
                            <button
                              className="btn btn-secondary btn-xs flex-center gap-1"
                              title="Retry pipeline"
                              disabled={retryingId === doc._id}
                              onClick={(e) => handleRetry(doc._id, e)}
                            >
                              <RotateCcw size={11} className={retryingId === doc._id ? 'spin' : ''} />
                              <span>Retry</span>
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '120px' }}>
                            <div className="flex-center gap-1" style={{ justifyContent: 'flex-start' }}>
                              <Loader2 size={11} className="spin" color="var(--color-primary)" />
                              <span className="badge badge-warning text-mono text-xs" style={{ textTransform: 'capitalize' }}>
                                {getStageLabel(doc.processingStage)} {doc.processingProgress !== undefined && doc.processingProgress !== null ? `${doc.processingProgress}%` : ''}
                              </span>
                            </div>
                            <div style={{ width: '100%', height: '4px', background: 'var(--color-border)', borderRadius: '2px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${Math.max(doc.processingProgress || 10, 10)}%`,
                                  height: '100%',
                                  background: 'var(--color-primary)',
                                  transition: 'width 0.4s ease',
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        {score !== undefined && score !== null ? (
                          <span className={`badge ${score >= 50 ? 'badge-danger' : score >= 25 ? 'badge-warning' : 'badge-success'}`}>
                            {score}/100 ({doc.riskLevel || (score >= 50 ? 'High' : score >= 25 ? 'Medium' : 'Low')})
                          </span>
                        ) : (
                          <span className="muted text-xs">Pending</span>
                        )}
                      </td>
                      <td className="text-mono text-xs muted">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex-center gap-1" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Delete Contract"
                            onClick={(e) => handleDelete(doc._id, doc.title || doc.originalName, e)}
                          >
                            <Trash2 size={14} color="var(--color-danger)" />
                          </button>
                          <button
                            className="btn btn-secondary btn-sm flex-center gap-1"
                            onClick={() => navigate(`/documents/${doc._id}`)}
                          >
                            <span>Inspect</span>
                            <ExternalLink size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid Card Layout */
          <div className="grid-3">
            {filteredDocs.map((doc) => {
              const score = doc.riskScore ?? doc.riskAnalysis?.overallRiskScore;
              const st = doc.processingStatus || doc.status || 'pending';

              return (
                <div
                  key={doc._id}
                  className="card"
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                  onClick={() => navigate(`/documents/${doc._id}`)}
                >
                  <div>
                    <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                      <div className="flex-center gap-1">
                        <span className="badge badge-neutral">{doc.documentType || 'General'}</span>
                        <span className="badge badge-neutral text-mono" style={{ fontSize: '10px' }}>
                          v{doc.version || 1}.0
                        </span>
                      </div>
                      <div>
                        {st === 'completed' ? (
                          <span className="badge badge-success">Completed</span>
                        ) : st === 'failed' ? (
                          <div className="flex-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <span className="badge badge-danger">Failed</span>
                            <button
                              className="btn btn-secondary btn-xs flex-center gap-1"
                              title="Retry pipeline"
                              disabled={retryingId === doc._id}
                              onClick={(e) => handleRetry(doc._id, e)}
                            >
                              <RotateCcw size={10} className={retryingId === doc._id ? 'spin' : ''} />
                              <span>Retry</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex-center gap-1">
                            <Loader2 size={11} className="spin" color="var(--color-primary)" />
                            <span className="badge badge-warning text-mono text-xs" style={{ textTransform: 'capitalize' }}>
                              {getStageLabel(doc.processingStage)} {doc.processingProgress !== undefined && doc.processingProgress !== null ? `${doc.processingProgress}%` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', wordBreak: 'break-word', fontWeight: 600 }}>
                      {doc.title || doc.originalName}
                    </h3>
                    <div className="text-xs text-mono muted">
                      Indexed {new Date(doc.createdAt).toLocaleDateString()}
                    </div>

                    {(st === 'processing' || st === 'pending') && (
                      <div className="mt-2" style={{ width: '100%', height: '4px', background: 'var(--color-border)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.max(doc.processingProgress || 10, 10)}%`,
                            height: '100%',
                            background: 'var(--color-primary)',
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      {score !== undefined && score !== null ? (
                        <span className={`badge ${score >= 50 ? 'badge-danger' : score >= 25 ? 'badge-warning' : 'badge-success'}`}>
                          Risk: {score}/100
                        </span>
                      ) : (
                        <span className="text-xs muted">No Score</span>
                      )}
                    </div>

                    <div className="flex-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Delete contract"
                        onClick={(e) => handleDelete(doc._id, doc.title || doc.originalName, e)}
                      >
                        <Trash2 size={14} color="var(--color-danger)" />
                      </button>
                      <button
                        className="btn btn-secondary btn-sm flex-center gap-1"
                        onClick={() => navigate(`/documents/${doc._id}`)}
                      >
                        <span>Open</span>
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <UploadModal
          isOpen={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onSuccess={(doc) => {
            loadDocuments();
            const targetId = doc?._id || doc?.id || doc?.documentId;
            if (targetId && targetId !== 'undefined' && targetId !== 'null') {
              navigate(`/documents/${targetId}`);
            } else {
              console.warn('Upload succeeded but target document ID is invalid:', doc);
            }
          }}
        />
      </div>
    </div>
  );
}