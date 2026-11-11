import { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Bookmark,
  BookmarkCheck,
  FileText,
  Search,
  ExternalLink,
  ShieldAlert,
  FileSearch,
  Plus,
} from 'lucide-react';
import { documentAPI } from '../services/api';
import Spinner from '../components/Spinner';
import UploadModal from '../components/UploadModal';
import '../styles/dashboard.css';

const SAVED_STORAGE_KEY = 'legalmind_saved_findings';

export default function SavedFindingsPage() {
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('flagged_risks'); // 'flagged_risks' | 'bookmarked_clauses'
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Local saved bookmarks
  const [savedBookmarks, setSavedBookmarks] = useState(() => {
    try {
      const raw = localStorage.getItem(SAVED_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await documentAPI.list();
      const rawDocs =
        res?.data?.data?.documents ||
        res?.data?.documents ||
        (Array.isArray(res?.data?.data) ? res.data.data : null) ||
        (Array.isArray(res?.data) ? res.data : []);
      setDocuments(Array.isArray(rawDocs) ? rawDocs : []);
    } catch (err) {
      console.error('Failed to load documents for findings:', err);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Extract all flagged risk findings from real documents
  const allFlaggedFindings = useMemo(() => {
    const findings = [];
    for (const doc of documents) {
      const riskRecord = Array.isArray(doc.riskFindings) ? doc.riskFindings[0] : doc.riskFindings;
      const clauses = riskRecord?.flaggedClauses || [];
      for (const fc of clauses) {
        findings.push({
          id: `${doc._id}_${fc.clauseType}_${fc.page || 1}`,
          documentId: doc._id,
          documentTitle: doc.originalName || doc.title,
          documentType: doc.documentType,
          clauseType: fc.clauseType,
          clauseText: fc.clauseText,
          riskLevel: fc.riskLevel,
          riskScore: fc.riskScore,
          reason: fc.reason,
          suggestion: fc.suggestion,
          page: fc.page,
          section: fc.section,
        });
      }
    }
    return findings;
  }, [documents]);

  // Handle removing a bookmark
  const _handleRemoveBookmark = (id) => {
    const next = savedBookmarks.filter((b) => b.id !== id);
    setSavedBookmarks(next);
    localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(next));
  };

  // Add a flagged finding to bookmarks
  const handleBookmarkFinding = (finding) => {
    const isAlready = savedBookmarks.some((b) => b.id === finding.id);
    let next;
    if (isAlready) {
      next = savedBookmarks.filter((b) => b.id !== finding.id);
    } else {
      next = [
        ...savedBookmarks,
        {
          id: finding.id,
          documentId: finding.documentId,
          documentTitle: finding.documentTitle,
          clauseType: finding.clauseType,
          clauseText: finding.clauseText,
          reason: finding.reason,
          suggestion: finding.suggestion,
          savedAt: new Date().toISOString(),
        },
      ];
    }
    setSavedBookmarks(next);
    localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(next));
  };

  // Filter items
  const currentItems = activeTab === 'flagged_risks' ? allFlaggedFindings : savedBookmarks;

  const filteredItems = useMemo(() => {
    return currentItems.filter((item) => {
      if (typeFilter !== 'ALL' && item.clauseType !== typeFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesType = (item.clauseType || '').toLowerCase().includes(q);
        const matchesText = (item.clauseText || '').toLowerCase().includes(q);
        const matchesDoc = (item.documentTitle || '').toLowerCase().includes(q);
        const matchesReason = (item.reason || '').toLowerCase().includes(q);
        if (!matchesType && !matchesText && !matchesDoc && !matchesReason) {
          return false;
        }
      }
      return true;
    });
  }, [currentItems, typeFilter, search]);

  const uniqueClauseTypes = useMemo(() => {
    const set = new Set();
    currentItems.forEach((i) => {
      if (i.clauseType) set.add(i.clauseType);
    });
    return Array.from(set);
  }, [currentItems]);

  return (
    <div className="page">
      <div className="container">
        {/* Header */}
        <div className="page-header">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge badge-neutral" style={{ letterSpacing: '0.08em' }}>CLAUSE GOVERNANCE</span>
            </div>
            <h1 className="page-title">Saved Findings & Critical Clauses</h1>
            <p className="page-subtitle">
              Inspect grounded legal findings, review high-severity risk clauses, and access bookmarked contract provisions.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary flex-center gap-2" onClick={() => setUploadModalOpen(true)}>
              <Plus size={16} />
              <span>Upload Contract</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="section-segment-nav mb-4">
          <button
            type="button"
            className={`section-segment-btn ${activeTab === 'flagged_risks' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('flagged_risks');
              setTypeFilter('ALL');
            }}
          >
            <ShieldAlert size={14} />
            <span>High-Severity Flagged Risks ({allFlaggedFindings.length})</span>
          </button>
          <button
            type="button"
            className={`section-segment-btn ${activeTab === 'bookmarked_clauses' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('bookmarked_clauses');
              setTypeFilter('ALL');
            }}
          >
            <BookmarkCheck size={14} />
            <span>Bookmarked Provisions ({savedBookmarks.length})</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="card mb-4" style={{ padding: 'var(--space-4)' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="search-bar" style={{ flex: '1 1 260px' }}>
              <Search size={14} />
              <input
                type="text"
                placeholder="Search clause text, document, or risk explanation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs muted text-mono">CLAUSE TYPE:</span>
              <select
                className="input-select"
                style={{ padding: '0.4rem 0.75rem', fontSize: 'var(--text-xs)' }}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="ALL">All Clause Types</option>
                {uniqueClauseTypes.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <Spinner label="Loading saved findings & clauses…" />
        ) : filteredItems.length === 0 ? (
          <div className="card empty-state p-6 text-center">
            <FileSearch size={36} color="var(--color-text-secondary)" style={{ margin: '0 auto 1rem' }} />
            <h3>No provisions found</h3>
            <p className="muted text-sm mt-1 max-w-md" style={{ margin: '0 auto' }}>
              {activeTab === 'flagged_risks'
                ? 'No high-risk clauses have been flagged yet across your uploaded contracts.'
                : 'You have not saved any contract clauses yet. Pin clauses while reviewing documents to access them here.'}
            </p>
            <button className="btn btn-secondary mt-4" onClick={() => navigate('/documents')}>
              Explore Documents
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredItems.map((item, idx) => {
              const isBookmarked = savedBookmarks.some((b) => b.id === item.id);
              const severityClass =
                item.riskLevel === 'critical'
                  ? 'badge-danger'
                  : item.riskLevel === 'high'
                  ? 'badge-danger'
                  : item.riskLevel === 'medium'
                  ? 'badge-warning'
                  : 'badge-neutral';

              return (
                <div key={item.id || idx} className="card" style={{ padding: 'var(--space-4)' }}>
                  <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge badge-neutral text-xs text-mono" style={{ textTransform: 'uppercase' }}>
                        {item.clauseType?.replace(/_/g, ' ')}
                      </span>
                      {item.riskLevel && (
                        <span className={`badge ${severityClass} text-xs text-mono`}>
                          {item.riskLevel?.toUpperCase()} ({item.riskScore ?? 'N/A'})
                        </span>
                      )}
                      {item.page && (
                        <span className="badge badge-neutral text-xs text-mono">
                          Page {item.page}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        to={`/documents/${item.documentId}?section=3`}
                        className="text-xs flex items-center gap-1 muted hover:underline text-mono"
                      >
                        <FileText size={12} />
                        <span>{item.documentTitle}</span>
                        <ExternalLink size={11} />
                      </Link>

                      <button
                        type="button"
                        className={`btn btn-sm ${isBookmarked ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '11px' }}
                        onClick={() => handleBookmarkFinding(item)}
                        title={isBookmarked ? 'Remove bookmark' : 'Bookmark this clause'}
                      >
                        {isBookmarked ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Verbatim Excerpt */}
                  <div
                    style={{
                      background: 'var(--color-surface-2)',
                      borderLeft: '3px solid var(--color-border-strong)',
                      padding: '0.75rem 1rem',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text)',
                      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                      lineHeight: 1.6,
                      margin: '0.5rem 0',
                    }}
                  >
                    &ldquo;{item.clauseText}&rdquo;
                  </div>

                  {/* Legal Explanation */}
                  {item.reason && (
                    <div className="mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      <strong>Risk Analysis:</strong> {item.reason}
                    </div>
                  )}

                  {/* Suggested Remediation */}
                  {item.suggestion && (
                    <div
                      className="mt-2 p-2 border border-subtle text-xs"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(34, 197, 94, 0.05)',
                        color: 'var(--color-text)',
                      }}
                    >
                      <strong>Remediation Recommendation:</strong> {item.suggestion}
                    </div>
                  )}

                  <div className="flex justify-end mt-3 pt-2 border-t border-subtle">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm text-xs flex items-center gap-1"
                      onClick={() => navigate(`/documents/${item.documentId}?section=3`)}
                    >
                      <span>Open in Document Intelligence</span>
                      <ExternalLink size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <UploadModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onSuccess={(newDoc) => {
            loadData();
            const targetId = newDoc?._id || newDoc?.id || newDoc?.documentId;
            if (targetId && targetId !== 'undefined' && targetId !== 'null') {
              navigate(`/documents/${targetId}`);
            } else {
              console.warn('Upload succeeded but target document ID is invalid:', newDoc);
              navigate('/documents');
            }
          }}
        />
      </div>
    </div>
  );
}
