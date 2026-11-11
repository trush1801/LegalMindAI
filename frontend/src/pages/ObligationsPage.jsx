import { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  CalendarClock,
  Clock,
  Calendar,
  AlertCircle,
  FileText,
  Search,
  List,
  CheckCircle2,
  Bell,
  Download,
  Trash2,
  RefreshCw,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { documentAPI } from '../services/api';
import Spinner from '../components/Spinner';
import UploadModal from '../components/UploadModal';
import '../styles/dashboard.css';

const CATEGORY_MAP = {
  ALL: 'All Obligations',
  START_DATE: 'Start Dates',
  EXPIRATION_DATE: 'Expiration & Term',
  RENEWAL_DATE: 'Renewals',
  NOTICE_PERIOD: 'Notice Periods',
  TERMINATION_DEADLINE: 'Termination Deadlines',
  PAYMENT_DEADLINE: 'Payment Deadlines',
  AFFIRMATIVE_OBLIGATION: 'Affirmative Obligations',
};

export default function ObligationsPage() {
  const navigate = useNavigate();

  const [obligations, setObligations] = useState([]);
  const [_reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedCertainty, setSelectedCertainty] = useState('ALL');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'timeline'
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Reminder scheduling modal
  const [selectedItemForReminder, setSelectedItemForReminder] = useState(null);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDueDate, setReminderDueDate] = useState('');
  const [offsetPreset, setOffsetPreset] = useState('30');
  const [customReminderDate, setCustomReminderDate] = useState('');
  const [notificationChannel, setNotificationChannel] = useState('in_app');
  const [reminderNotes, setReminderNotes] = useState('');
  const [savingReminder, setSavingReminder] = useState(false);
  const [reminderError, setReminderError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [obRes, remRes] = await Promise.all([
        documentAPI.getUpcomingObligations().catch(() => ({ data: { data: { obligations: [] } } })),
        documentAPI.getAllReminders().catch(() => ({ data: { data: { reminders: [] } } })),
      ]);

      const rawObligations =
        obRes?.data?.data?.obligations ||
        obRes?.data?.obligations ||
        (Array.isArray(obRes?.data?.data) ? obRes.data.data : null) ||
        (Array.isArray(obRes?.data) ? obRes.data : []);

      const rawReminders =
        remRes?.data?.data?.reminders ||
        remRes?.data?.reminders ||
        (Array.isArray(remRes?.data?.data) ? remRes.data.data : null) ||
        (Array.isArray(remRes?.data) ? remRes.data : []);

      setObligations(Array.isArray(rawObligations) ? rawObligations : []);
      setReminders(Array.isArray(rawReminders) ? rawReminders : []);
    } catch (err) {
      console.error('Failed to load obligations portfolio:', err);
      setError('Unable to load obligations portfolio. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute KPI metrics
  const totalCount = obligations.length;
  const explicitCount = obligations.filter((o) => o.certainty === 'EXPLICIT').length;
  const inferredCount = obligations.filter((o) => o.certainty === 'INFERRED' || o.dateType === 'relative_duration').length;
  const activeReminderCount = obligations.filter((o) => o.hasActiveReminder).length;

  // Filtered dataset
  const filteredItems = useMemo(() => {
    return obligations.filter((item) => {
      // Category filter
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }
      // Certainty filter
      if (selectedCertainty !== 'ALL' && item.certainty !== selectedCertainty) {
        return false;
      }
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = (item.title || '').toLowerCase().includes(q);
        const matchesDoc = (item.documentTitle || '').toLowerCase().includes(q);
        const matchesPassage = (item.sourcePassage || '').toLowerCase().includes(q);
        const matchesDate = (item.rawDateText || item.formattedDueDate || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDoc && !matchesPassage && !matchesDate) {
          return false;
        }
      }
      return true;
    });
  }, [obligations, selectedCategory, selectedCertainty, search]);

  // Open modal
  const openReminderModal = (item) => {
    setSelectedItemForReminder(item);
    setReminderTitle(item.title || 'Contract Deadline');
    const initialDue = item.parsedDueDate ? new Date(item.parsedDueDate).toISOString().split('T')[0] : '';
    setReminderDueDate(initialDue);
    setOffsetPreset('30');
    setCustomReminderDate('');
    setNotificationChannel('in_app');
    setReminderNotes('');
    setReminderError(null);
  };

  // Submit reminder
  const handleSaveReminder = async (e) => {
    e.preventDefault();
    if (!selectedItemForReminder) return;

    try {
      setSavingReminder(true);
      setReminderError(null);

      const offset = parseInt(offsetPreset, 10);
      let calculatedReminderDate = null;

      if (customReminderDate) {
        calculatedReminderDate = new Date(customReminderDate).toISOString();
      } else if (reminderDueDate) {
        const d = new Date(reminderDueDate);
        d.setDate(d.getDate() - (isNaN(offset) ? 30 : offset));
        calculatedReminderDate = d.toISOString();
      } else {
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + 7);
        calculatedReminderDate = fallback.toISOString();
      }

      const payload = {
        obligationId: selectedItemForReminder.id,
        title: reminderTitle || selectedItemForReminder.title,
        category: selectedItemForReminder.category,
        dueDate: reminderDueDate ? new Date(reminderDueDate).toISOString() : calculatedReminderDate,
        reminderDate: calculatedReminderDate,
        offsetDays: isNaN(offset) ? 30 : offset,
        notificationChannel,
        notes: reminderNotes,
      };

      await documentAPI.createReminder(selectedItemForReminder.documentId, payload);
      setSelectedItemForReminder(null);
      await fetchData();
    } catch (err) {
      console.error('Failed to schedule reminder:', err);
      setReminderError(err.message || 'Failed to schedule reminder.');
    } finally {
      setSavingReminder(false);
    }
  };

  // Delete reminder
  const handleDeleteReminder = async (docId, reminderId) => {
    if (!window.confirm('Delete this scheduled reminder?')) return;
    try {
      await documentAPI.deleteReminder(docId, reminderId);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to delete reminder.');
    }
  };

  // Download .ics
  const handleDownloadIcs = async (docId, reminderId, title) => {
    try {
      const res = await documentAPI.downloadReminderIcs(docId, reminderId);
      const blob = new Blob([res.data], { type: 'text/calendar;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'contract-reminder'}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download calendar invite.');
    }
  };

  return (
    <div className="page">
      <div className="container">
        {/* Header */}
        <div className="page-header">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge badge-neutral" style={{ letterSpacing: '0.08em' }}>PORTFOLIO GOVERNANCE</span>
            </div>
            <h1 className="page-title">Obligations & Deadlines Hub</h1>
            <p className="page-subtitle">
              Monitor key milestones, notice periods, payment schedules, and renewal windows extracted across your active contracts.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-secondary flex-center gap-2"
              onClick={fetchData}
              title="Refresh obligations and reminders"
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <button
              className="btn btn-primary flex-center gap-2"
              onClick={() => setUploadModalOpen(true)}
            >
              <Plus size={16} />
              <span>Upload Contract</span>
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid-4 mb-4">
          <div className="stat-metric-card">
            <div>
              <div className="form-hint">Total Tracked Obligations</div>
              <div className="stat-metric-val">{totalCount}</div>
            </div>
            <CalendarClock size={22} color="var(--color-primary)" />
          </div>

          <div className="stat-metric-card">
            <div>
              <div className="form-hint">Explicit Calendar Dates</div>
              <div className="stat-metric-val" style={{ color: 'var(--color-success)' }}>
                {explicitCount}
              </div>
            </div>
            <Calendar size={22} color="var(--color-success)" />
          </div>

          <div className="stat-metric-card">
            <div>
              <div className="form-hint">Inferred / Relative Terms</div>
              <div className="stat-metric-val" style={{ color: 'var(--color-warning)' }}>
                {inferredCount}
              </div>
            </div>
            <Clock size={22} color="var(--color-warning)" />
          </div>

          <div className="stat-metric-card">
            <div>
              <div className="form-hint">Active Scheduled Reminders</div>
              <div className="stat-metric-val" style={{ color: 'var(--color-success)' }}>
                {activeReminderCount}
              </div>
            </div>
            <Bell size={22} color="var(--color-success)" />
          </div>
        </div>

        {/* Controls Strip: Filters, Search, View Mode */}
        <div className="card mb-4" style={{ padding: 'var(--space-4)' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Search Input */}
            <div className="search-bar" style={{ flex: '1 1 240px', minWidth: '220px' }}>
              <Search size={14} />
              <input
                type="text"
                placeholder="Search obligation, contract name, or date..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Certainty Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs muted text-mono">CERTAINTY:</span>
              <select
                className="input-select"
                style={{ padding: '0.4rem 0.75rem', fontSize: 'var(--text-xs)' }}
                value={selectedCertainty}
                onChange={(e) => setSelectedCertainty(e.target.value)}
              >
                <option value="ALL">All Certainty Levels</option>
                <option value="EXPLICIT">Explicit Dates Only</option>
                <option value="INFERRED">Inferred / Relative</option>
                <option value="UNCERTAIN">Uncertain / Open Horizons</option>
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 border border-subtle" style={{ borderRadius: 'var(--radius-sm)', padding: '2px' }}>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setViewMode('list')}
                style={{ padding: '0.35rem 0.75rem' }}
              >
                <List size={13} />
                <span className="ml-1">List</span>
              </button>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'timeline' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setViewMode('timeline')}
                style={{ padding: '0.35rem 0.75rem' }}
              >
                <Clock size={13} />
                <span className="ml-1">Timeline</span>
              </button>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 mt-3 flex-wrap" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
            <span className="text-xs muted text-mono mr-1">CATEGORY:</span>
            {Object.entries(CATEGORY_MAP).map(([key, label]) => {
              const active = selectedCategory === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`btn btn-sm ${active ? 'btn-secondary' : 'btn-ghost'}`}
                  style={{
                    fontSize: '11px',
                    padding: '0.25rem 0.6rem',
                    borderColor: active ? 'var(--color-primary)' : 'transparent',
                    background: active ? 'var(--color-surface-2)' : 'transparent',
                  }}
                  onClick={() => setSelectedCategory(key)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content View */}
        {loading ? (
          <Spinner label="Scanning contract obligations & temporal milestones…" />
        ) : error ? (
          <div className="card text-center p-6">
            <AlertCircle size={32} color="var(--color-danger)" style={{ margin: '0 auto 0.75rem' }} />
            <h3>Unable to load obligations</h3>
            <p className="muted text-sm mt-1">{error}</p>
            <button className="btn btn-secondary mt-4" onClick={fetchData}>
              Try Again
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="card empty-state p-6 text-center">
            <CalendarClock size={36} color="var(--color-text-secondary)" style={{ margin: '0 auto 1rem' }} />
            <h3>No obligations match your filter</h3>
            <p className="muted text-sm mt-1 max-w-md" style={{ margin: '0 auto' }}>
              Upload contracts or adjust your search parameters to view extracted start dates, expiration horizons, notice periods, and payment deadlines.
            </p>
            <button className="btn btn-primary mt-4" onClick={() => setUploadModalOpen(true)}>
              <Plus size={15} />
              <span>Upload Contract</span>
            </button>
          </div>
        ) : viewMode === 'timeline' ? (
          /* Timeline Track View */
          <div className="timeline-track-container" style={{ position: 'relative', paddingLeft: '2.5rem' }}>
            <div
              style={{
                position: 'absolute',
                left: '1rem',
                top: '0.5rem',
                bottom: '1rem',
                width: '2px',
                background: 'var(--color-border-strong)',
              }}
            />

            <div className="flex flex-col gap-4">
              {filteredItems.map((item, idx) => {
                const certaintyBadgeClass =
                  item.certainty === 'EXPLICIT'
                    ? 'badge-success'
                    : item.certainty === 'INFERRED'
                    ? 'badge-neutral'
                    : 'badge-warning';

                return (
                  <div key={`${item.documentId}_${item.id}_${idx}`} style={{ position: 'relative' }}>
                    {/* Node Dot */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '-2rem',
                        top: '1.25rem',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: 'var(--color-surface)',
                        border: '2px solid var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        fontWeight: 700,
                      }}
                    >
                      {idx + 1}
                    </div>

                    <div className="card" style={{ padding: 'var(--space-4)' }}>
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="badge badge-neutral text-xs text-mono">{item.category}</span>
                          <span className={`badge ${certaintyBadgeClass} text-xs`}>{item.certainty}</span>
                          <span className="badge badge-neutral text-xs text-mono">{item.dateType?.replace('_', ' ')}</span>
                        </div>
                        <Link
                          to={`/documents/${item.documentId}?section=4`}
                          className="text-xs flex items-center gap-1 muted hover:underline text-mono"
                        >
                          <FileText size={12} />
                          <span>{item.documentTitle}</span>
                          <ExternalLink size={11} />
                        </Link>
                      </div>

                      <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0.25rem 0' }}>
                        {item.title}
                      </h3>

                      <div className="flex items-center gap-2 mt-2 mb-3">
                        <Calendar size={14} color="var(--color-primary)" />
                        <span className="text-mono text-sm" style={{ fontWeight: 600 }}>
                          {item.formattedDueDate || item.rawDateText || 'Milestone Duration'}
                        </span>
                        {item.boundParty && (
                          <span className="text-xs muted ml-2">
                            • Bound Party: <strong>{item.boundParty}</strong>
                          </span>
                        )}
                      </div>

                      {/* Uncertainty reason */}
                      {item.uncertaintyReason && (
                        <div className="legal-disclaimer-card text-xs mb-2">
                          <strong>Note:</strong> {item.uncertaintyReason}
                        </div>
                      )}

                      {/* Grounded Source Passage */}
                      {item.sourcePassage && (
                        <div
                          style={{
                            background: 'var(--color-surface-2)',
                            borderLeft: '2px solid var(--color-border-strong)',
                            padding: '0.5rem 0.75rem',
                            fontSize: 'var(--text-xs)',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-text-secondary)',
                            borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                          }}
                        >
                          &ldquo;{item.sourcePassage}&rdquo;
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-subtle flex-wrap gap-2">
                        {item.hasActiveReminder && item.activeReminder ? (
                          <div className="flex items-center gap-2">
                            <span className="badge badge-success text-xs flex items-center gap-1">
                              <CheckCircle2 size={12} />
                              <span>Reminder: {new Date(item.activeReminder.reminderDate).toLocaleDateString()}</span>
                            </span>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-xs"
                              onClick={() => handleDownloadIcs(item.documentId, item.activeReminder.id, item.title)}
                              title="Download calendar event"
                            >
                              <Download size={12} />
                              <span>.ICS</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-xs text-danger"
                              onClick={() => handleDeleteReminder(item.documentId, item.activeReminder.id)}
                              title="Cancel reminder"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm text-xs flex items-center gap-1"
                            onClick={() => openReminderModal(item)}
                          >
                            <Bell size={12} />
                            <span>Schedule Reminder</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-xs flex items-center gap-1"
                          onClick={() => navigate(`/documents/${item.documentId}?section=4`)}
                        >
                          <span>Open in Document Workspace</span>
                          <ExternalLink size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* List View */
          <div className="flex flex-col gap-3">
            {filteredItems.map((item, idx) => {
              const certaintyBadgeClass =
                item.certainty === 'EXPLICIT'
                  ? 'badge-success'
                  : item.certainty === 'INFERRED'
                  ? 'badge-neutral'
                  : 'badge-warning';

              return (
                <div key={`${item.documentId}_${item.id}_${idx}`} className="card" style={{ padding: 'var(--space-4)' }}>
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="badge badge-neutral text-xs text-mono">{item.category}</span>
                        <span className={`badge ${certaintyBadgeClass} text-xs`}>{item.certainty}</span>
                        <span className="badge badge-neutral text-xs text-mono">{item.dateType?.replace('_', ' ')}</span>
                      </div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{item.title}</h3>
                    </div>

                    <Link
                      to={`/documents/${item.documentId}?section=4`}
                      className="text-xs flex items-center gap-1 muted hover:underline text-mono"
                    >
                      <FileText size={12} />
                      <span>{item.documentTitle}</span>
                      <ExternalLink size={11} />
                    </Link>
                  </div>

                  <div className="flex items-center gap-2 mt-2 mb-2">
                    <Calendar size={14} color="var(--color-primary)" />
                    <span className="text-mono text-sm" style={{ fontWeight: 600 }}>
                      {item.formattedDueDate || item.rawDateText || 'Relative Horizon'}
                    </span>
                    {item.boundParty && (
                      <span className="text-xs muted ml-2">
                        • Bound Party: <strong>{item.boundParty}</strong>
                      </span>
                    )}
                  </div>

                  {item.uncertaintyReason && (
                    <div className="legal-disclaimer-card text-xs mb-2">
                      <strong>Analysis Rationale:</strong> {item.uncertaintyReason}
                    </div>
                  )}

                  {item.sourcePassage && (
                    <div
                      style={{
                        background: 'var(--color-surface-2)',
                        borderLeft: '2px solid var(--color-border-strong)',
                        padding: '0.5rem 0.75rem',
                        fontSize: 'var(--text-xs)',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--color-text-secondary)',
                        borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                      }}
                    >
                      &ldquo;{item.sourcePassage}&rdquo;
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-subtle flex-wrap gap-2">
                    {item.hasActiveReminder && item.activeReminder ? (
                      <div className="flex items-center gap-2">
                        <span className="badge badge-success text-xs flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          <span>Reminder: {new Date(item.activeReminder.reminderDate).toLocaleDateString()}</span>
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-xs"
                          onClick={() => handleDownloadIcs(item.documentId, item.activeReminder.id, item.title)}
                          title="Download calendar event"
                        >
                          <Download size={12} />
                          <span>.ICS</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-xs text-danger"
                          onClick={() => handleDeleteReminder(item.documentId, item.activeReminder.id)}
                          title="Cancel reminder"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm text-xs flex items-center gap-1"
                        onClick={() => openReminderModal(item)}
                      >
                        <Bell size={12} />
                        <span>Schedule Reminder</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-xs flex items-center gap-1"
                      onClick={() => navigate(`/documents/${item.documentId}?section=4`)}
                    >
                      <span>Review In Document</span>
                      <ExternalLink size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Schedule Reminder Modal */}
        {selectedItemForReminder && (
          <div className="modal-backdrop" onClick={() => setSelectedItemForReminder(null)}>
            <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">Schedule Contract Reminder</h3>
                  <p className="form-hint">
                    Set up an automated alert for &ldquo;{selectedItemForReminder.title}&rdquo; in {selectedItemForReminder.documentTitle}.
                  </p>
                </div>
              </div>

              {reminderError && (
                <div className="alert alert-danger mb-4" style={{ margin: 'var(--space-4)' }}>
                  <AlertCircle size={15} />
                  <span>{reminderError}</span>
                </div>
              )}

              <form onSubmit={handleSaveReminder}>
                <div className="modal-body">
                  <div className="form-group mb-3">
                    <label className="form-label">Reminder Title</label>
                    <input
                      type="text"
                      className="form-input"
                      value={reminderTitle}
                      onChange={(e) => setReminderTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group mb-3">
                    <label className="form-label">Contract Due / Milestone Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={reminderDueDate}
                      onChange={(e) => setReminderDueDate(e.target.value)}
                    />
                    <div className="form-hint">Reference date of the contract deadline.</div>
                  </div>

                  <div className="form-group mb-3">
                    <label className="form-label">Trigger Alert Timing (Preset)</label>
                    <div className="flex gap-2 flex-wrap">
                      {['60', '30', '15', '7', '1'].map((days) => (
                        <button
                          key={days}
                          type="button"
                          className={`btn btn-sm ${offsetPreset === days ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ fontSize: '11px', padding: '0.3rem 0.6rem' }}
                          onClick={() => {
                            setOffsetPreset(days);
                            setCustomReminderDate('');
                          }}
                        >
                          {days} days before
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group mb-3">
                    <label className="form-label">Notification Channel</label>
                    <select
                      className="form-input"
                      value={notificationChannel}
                      onChange={(e) => setNotificationChannel(e.target.value)}
                    >
                      <option value="in_app">In-App Notification</option>
                      <option value="email">Email Notification</option>
                      <option value="calendar_ics">RFC 5545 Calendar (.ICS)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Personal Notes (Optional)</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="e.g. Confirm with legal counsel before serving notice..."
                      value={reminderNotes}
                      onChange={(e) => setReminderNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSelectedItemForReminder(null)}
                    disabled={savingReminder}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingReminder}>
                    {savingReminder ? 'Scheduling…' : 'Save Reminder'}
                  </button>
                </div>
              </form>
            </div>
          </div>
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
