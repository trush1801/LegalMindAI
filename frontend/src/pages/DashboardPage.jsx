import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  Clock,
  FileCheck,
  FileCheck2,
  FileText,
  FileUp,
  FolderOpen,
  MessageSquare,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import UploadModal from '../components/UploadModal';
import Spinner from '../components/Spinner';
import { documentAPI, reportAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/dashboard.css';

function formatRelativeTime(dateString) {
  if (!dateString) return 'Recent';
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now - past;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return past.toLocaleDateString();
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [reports, setReports] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);
  const [upcomingObligations, setUpcomingObligations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [docsRes, reportsRes, activityRes, obligationsRes] = await Promise.all([
        documentAPI.list().catch(() => ({ data: [] })),
        reportAPI.list().catch(() => ({ data: [] })),
        documentAPI.getActivityFeed().catch(() => ({ data: { data: { events: [] } } })),
        documentAPI.getUpcomingObligations().catch(() => ({ data: { data: { obligations: [] } } })),
      ]);

      const rawDocs =
        docsRes?.data?.data?.documents ||
        docsRes?.data?.documents ||
        (Array.isArray(docsRes?.data?.data) ? docsRes.data.data : null) ||
        (Array.isArray(docsRes?.data) ? docsRes.data : []);

      const rawReports =
        reportsRes?.data?.data?.reports ||
        reportsRes?.data?.reports ||
        (Array.isArray(reportsRes?.data?.data) ? reportsRes.data.data : null) ||
        (Array.isArray(reportsRes?.data) ? reportsRes.data : []);

      const rawActivity =
        activityRes?.data?.data?.events ||
        activityRes?.data?.events ||
        (Array.isArray(activityRes?.data?.data) ? activityRes.data.data : null) ||
        (Array.isArray(activityRes?.data) ? activityRes.data : []);

      const rawObligations =
        obligationsRes?.data?.data?.obligations ||
        obligationsRes?.data?.obligations ||
        (Array.isArray(obligationsRes?.data?.data) ? obligationsRes.data.data : null) ||
        (Array.isArray(obligationsRes?.data) ? obligationsRes.data : []);

      setDocuments(Array.isArray(rawDocs) ? rawDocs : []);
      setReports(Array.isArray(rawReports) ? rawReports : []);
      setActivityFeed(Array.isArray(rawActivity) ? rawActivity : []);
      setUpcomingObligations(Array.isArray(rawObligations) ? rawObligations : []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setDocuments([]);
      setReports([]);
      setActivityFeed([]);
      setUpcomingObligations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const safeDocs = Array.isArray(documents) ? documents : [];
  const safeReports = Array.isArray(reports) ? reports : [];
  const safeActivity = Array.isArray(activityFeed) ? activityFeed : [];
  const safeObligations = Array.isArray(upcomingObligations) ? upcomingObligations : [];

  // Helper to extract true risk data from document & populated risk findings
  const getDocRiskInfo = (doc) => {
    const riskRecord = Array.isArray(doc.riskFindings) ? doc.riskFindings[0] : doc.riskFindings;
    const score = riskRecord?.overallRiskScore ?? doc.riskScore ?? null;
    const level =
      riskRecord?.overallRiskLevel ||
      doc.riskLevel ||
      (score !== null ? (score >= 70 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low') : 'pending');
    const flaggedCount = riskRecord?.totalFlagged ?? riskRecord?.flaggedClauses?.length ?? 0;
    return { score, level, flaggedCount };
  };

  const totalDocs = safeDocs.length;
  const completedDocs = safeDocs.filter((d) => (d.processingStatus || d.status) === 'completed').length;

  const highRiskDocs = safeDocs.filter((d) => {
    const { score, level } = getDocRiskInfo(d);
    return (score !== null && score >= 50) || level === 'high' || level === 'critical';
  });

  return (
    <div className="page">
      <div className="container">
        {/* Page Header (Retaining Contract Intelligence Workspace heading) */}
        <div className="page-header">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge badge-neutral" style={{ letterSpacing: '0.08em' }}>CONTRACT INTELLIGENCE</span>
              <span className="badge badge-success text-xs">WORKSPACE ACTIVE</span>
            </div>
            <h1 className="page-title">Contract Intelligence Workspace</h1>
            <p className="page-subtitle">
              Welcome back, {user?.name || 'Analyst'}. Manage contractual agreements, inspect automated risk scores, and run legal inquiries.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="btn btn-secondary flex-center gap-2"
              onClick={() => navigate('/chat')}
              title="Open AI Research Chat for cross-document legal questions"
            >
              <MessageSquare size={15} />
              <span>AI Research Chat</span>
            </button>
            <button
              className="btn btn-primary flex-center gap-2"
              onClick={() => setUploadModalOpen(true)}
              title="Upload new commercial contract"
            >
              <Plus size={16} />
              <span>Upload Contract</span>
            </button>
          </div>
        </div>

        {loading ? (
          <Spinner label="Loading workspace metrics & intelligence telemetry…" />
        ) : (
          <>
            {/* Top Metric Tiles (Swiss Monospace Data) */}
            <div className="grid-4 mb-4">
              <div className="stat-metric-card">
                <div>
                  <div className="form-hint">Total Contracts</div>
                  <div className="stat-metric-val">{totalDocs}</div>
                </div>
                <FolderOpen size={22} color="var(--color-primary)" />
              </div>

              <div className="stat-metric-card">
                <div>
                  <div className="form-hint">Analysis Complete</div>
                  <div className="stat-metric-val" style={{ color: 'var(--color-success)' }}>
                    {completedDocs}
                  </div>
                </div>
                <FileCheck2 size={22} color="var(--color-success)" />
              </div>

              <div className="stat-metric-card">
                <div>
                  <div className="form-hint">High / Critical Risk</div>
                  <div
                    className="stat-metric-val"
                    style={{ color: highRiskDocs.length > 0 ? 'var(--color-danger)' : 'var(--color-text)' }}
                  >
                    {highRiskDocs.length}
                  </div>
                </div>
                <ShieldAlert size={22} color={highRiskDocs.length > 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)'} />
              </div>

              <div className="stat-metric-card">
                <div>
                  <div className="form-hint">Generated Audit Reports</div>
                  <div className="stat-metric-val">
                    {safeReports.length}
                  </div>
                </div>
                <ScrollText size={22} color="var(--color-text-secondary)" />
              </div>
            </div>

            {/* High-Risk Contract Priority Attention Ribbon (Step 6) */}
            {highRiskDocs.length > 0 && (
              <div className="high-risk-alert-ribbon">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={18} color="var(--color-danger)" />
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                        High-Risk Contract Attention
                      </span>
                      <span className="muted text-xs ml-2">
                        {highRiskDocs.length} contract{highRiskDocs.length === 1 ? '' : 's'} contain flagged critical liabilities or uncapped indemnity provisions.
                      </span>
                    </div>
                  </div>
                  <Link to="/saved-findings" className="text-xs text-mono flex items-center gap-1 hover:underline" style={{ color: 'var(--color-danger)' }}>
                    <span>Inspect Flagged Clauses</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>

                <div className="high-risk-cards-grid">
                  {highRiskDocs.slice(0, 3).map((doc) => {
                    const { score, level, flaggedCount } = getDocRiskInfo(doc);
                    return (
                      <div key={doc._id} className="high-risk-mini-card">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="badge badge-neutral text-xs text-mono">
                              {doc.documentType?.toUpperCase() || 'AGREEMENT'}
                            </span>
                            <span className="badge badge-danger text-xs text-mono">
                              {score !== null ? `${score}/100` : ''} {level?.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)' }} className="truncate">
                            {doc.title || doc.originalName}
                          </div>
                          <div className="muted text-xs mt-1">
                            {flaggedCount} flagged clause{flaggedCount === 1 ? '' : 's'} requiring review
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm text-xs flex items-center justify-center gap-1 mt-1"
                          onClick={() => navigate(`/documents/${doc._id}?section=3`)}
                        >
                          <span>Review Risk Findings</span>
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Two-Column Responsive Workspace Layout */}
            <div className="dashboard-two-column-grid">
              {/* Left Column: Recent Agreements Table */}
              <div className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">Recent Agreements</h2>
                    <div className="form-hint mt-1">Active documents indexed in your tenant workspace</div>
                  </div>
                  <Link to="/documents" className="btn btn-ghost btn-sm flex-center gap-1">
                    <span>View All Documents</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>

                {safeDocs.length === 0 ? (
                  /* Polished Onboarding Workflow (Step 5) */
                  <div className="p-6 text-center">
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--color-surface-2)',
                        border: '1px solid var(--color-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto var(--space-3)',
                      }}
                    >
                      <Sparkles size={22} color="var(--color-primary)" />
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Welcome to LegalMind AI Workspace</h3>
                    <p className="muted text-xs max-w-md" style={{ margin: '0.5rem auto 1.5rem', lineHeight: 1.5 }}>
                      Upload commercial contracts, vendor agreements, or NDA documents to activate automated legal risk scoring and extraction.
                    </p>

                    <div className="onboarding-workflow-grid">
                      <div className="onboarding-step-box">
                        <div className="onboarding-step-num">Step 01</div>
                        <div className="onboarding-step-title">Ingestion & OCR</div>
                        <div className="onboarding-step-desc">
                          High-fidelity text extraction supporting PDF, DOCX, and TXT files with layout preservation.
                        </div>
                      </div>

                      <div className="onboarding-step-box">
                        <div className="onboarding-step-num">Step 02</div>
                        <div className="onboarding-step-title">Clause & Risk Audit</div>
                        <div className="onboarding-step-desc">
                          Automated classification across 16 legal clause categories with severe liability detection.
                        </div>
                      </div>

                      <div className="onboarding-step-box">
                        <div className="onboarding-step-num">Step 03</div>
                        <div className="onboarding-step-title">Timeline & Reminders</div>
                        <div className="onboarding-step-desc">
                          Certainty-rated deadlines, renewal windows, notice periods, and synchronized calendar alerts.
                        </div>
                      </div>
                    </div>

                    <button className="btn btn-primary mt-2" onClick={() => setUploadModalOpen(true)}>
                      <FileUp size={15} />
                      <span className="ml-1">Upload First Contract</span>
                    </button>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Document Name</th>
                          <th>Category</th>
                          <th>Analysis Status</th>
                          <th>Risk Score</th>
                          <th>Uploaded</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {safeDocs.slice(0, 7).map((doc) => {
                          const { score, level } = getDocRiskInfo(doc);
                          const st = doc.processingStatus || doc.status || 'pending';

                          return (
                            <tr key={doc._id}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <FileText size={15} color="var(--color-text-secondary)" />
                                  <span style={{ fontWeight: 600 }}>{doc.title || doc.originalName}</span>
                                </div>
                              </td>
                              <td>
                                <span className="badge badge-neutral text-xs">
                                  {doc.documentType || 'General'}
                                </span>
                              </td>
                              <td>
                                <span className={`badge ${st === 'completed' ? 'badge-success' : st === 'failed' ? 'badge-danger' : 'badge-warning'} text-xs`}>
                                  {st}
                                </span>
                              </td>
                              <td>
                                {score !== null ? (
                                  <span className={`badge ${score >= 50 ? 'badge-danger' : score >= 25 ? 'badge-warning' : 'badge-success'} text-xs text-mono`}>
                                    {score}/100 ({level})
                                  </span>
                                ) : (
                                  <span className="muted text-xs text-mono">Processing…</span>
                                )}
                              </td>
                              <td className="text-mono text-xs muted">
                                {new Date(doc.createdAt).toLocaleDateString()}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  className="btn btn-secondary btn-sm text-xs"
                                  onClick={() => navigate(`/documents/${doc._id}`)}
                                >
                                  Open Analysis
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Right Column: Upcoming Obligations & Recent Activity */}
              <div className="flex flex-col gap-4">
                {/* Upcoming Contract Obligations Widget (Step 3 & 6) */}
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-subtle">
                    <div className="flex items-center gap-2">
                      <CalendarClock size={16} color="var(--color-primary)" />
                      <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Upcoming Deadlines</h3>
                    </div>
                    <Link to="/obligations" className="text-xs text-mono muted hover:underline flex items-center gap-1">
                      <span>View All</span>
                      <ArrowRight size={11} />
                    </Link>
                  </div>

                  {safeObligations.length === 0 ? (
                    <div className="p-4 text-center muted text-xs">
                      No upcoming obligations recorded yet. Upload contracts to extract notice periods and deadlines.
                    </div>
                  ) : (
                    <div className="deadline-widget-list">
                      {safeObligations.slice(0, 4).map((ob, idx) => (
                        <Link
                          key={`${ob.documentId}_${ob.id || idx}`}
                          to={`/documents/${ob.documentId}?section=4`}
                          className="deadline-widget-item"
                        >
                          <div className="flex items-center justify-between">
                            <span className="badge badge-neutral text-xs text-mono">{ob.category}</span>
                            <span className="text-xs text-mono font-semibold" style={{ color: 'var(--color-primary)' }}>
                              {ob.formattedDueDate || ob.rawDateText || 'Milestone Horizon'}
                            </span>
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }} className="truncate">
                            {ob.title}
                          </div>
                          <div className="flex items-center justify-between text-xs muted mt-1">
                            <span className="truncate max-w-xs">{ob.documentTitle}</span>
                            {ob.hasActiveReminder ? (
                              <span className="badge badge-success text-xs" style={{ fontSize: '10px', padding: '1px 4px' }}>
                                Reminder Active
                              </span>
                            ) : (
                              <span className="text-xs muted">Tap to review</span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Activity History Widget (Step 3 & 6) */}
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-subtle">
                    <div className="flex items-center gap-2">
                      <Clock size={16} color="var(--color-primary)" />
                      <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Recent Activity</h3>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-xs p-1"
                      onClick={fetchData}
                      title="Refresh activity"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>

                  {safeActivity.length === 0 ? (
                    <div className="p-4 text-center muted text-xs">
                      No recent activity recorded. Upload a contract to begin tracking workspace events.
                    </div>
                  ) : (
                    <div className="activity-feed-list">
                      {safeActivity.slice(0, 6).map((evt) => {
                        const Icon =
                          evt.type === 'document_uploaded'
                            ? FileUp
                            : evt.type === 'analysis_completed'
                            ? FileCheck
                            : evt.type === 'reminder_scheduled'
                            ? CalendarClock
                            : ScrollText;

                        const targetUrl = evt.documentId
                          ? `/documents/${evt.documentId}`
                          : evt.reportId
                          ? '/reports'
                          : '/dashboard';

                        return (
                          <Link key={evt.id} to={targetUrl} className="activity-feed-item">
                            <div className="activity-feed-icon">
                              <Icon size={14} color="var(--color-text-secondary)" />
                            </div>
                            <div className="activity-feed-content">
                              <div className="activity-feed-title">{evt.title}</div>
                              <div className="activity-feed-desc">{evt.description}</div>
                            </div>
                            <div className="activity-feed-time">
                              {formatRelativeTime(evt.timestamp)}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        <UploadModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onSuccess={(newDoc) => {
            fetchData();
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