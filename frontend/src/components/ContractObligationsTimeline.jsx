// ============================================================
// Contract Obligations and Important Dates Timeline
// Step 12: Structured timeline, categorized obligations,
// uncertainty indicators, source grounding, and real reminders
// Option D — Pure White × Graphite Swiss Minimalism
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  Clock,
  Compass,
  Download,
  Eye,
  FileCheck,
  FileText,
  Filter,
  HelpCircle,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { documentAPI } from '../services/api';

const CATEGORY_META = {
  START_DATE: {
    label: 'Contract Start Date',
    badgeClass: 'badge-success',
    icon: Calendar,
  },
  EXPIRATION_DATE: {
    label: 'Expiration & Term',
    badgeClass: 'badge-danger',
    icon: Clock,
  },
  RENEWAL_DATE: {
    label: 'Renewal Window',
    badgeClass: 'badge-info',
    icon: RefreshCw,
  },
  NOTICE_PERIOD: {
    label: 'Notice Period',
    badgeClass: 'badge-warning',
    icon: AlertCircle,
  },
  TERMINATION_DEADLINE: {
    label: 'Termination Deadline',
    badgeClass: 'badge-danger',
    icon: ShieldAlert,
  },
  PAYMENT_DEADLINE: {
    label: 'Payment Deadline',
    badgeClass: 'badge-info',
    icon: FileCheck,
  },
  AFFIRMATIVE_OBLIGATION: {
    label: 'Affirmative Obligation',
    badgeClass: 'badge-neutral',
    icon: FileText,
  },
  OTHER: {
    label: 'Contract Obligation',
    badgeClass: 'badge-neutral',
    icon: Compass,
  },
};

export default function ContractObligationsTimeline({
  documentId,
  _documentName = 'Contract Document',
  onSelectEvidence = () => {},
  initialFilter = 'ALL',
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'timeline'
  const [categoryFilter, setCategoryFilter] = useState(initialFilter);
  const [certaintyFilter, setCertaintyFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Reminder Modal State
  const [reminderModalItem, setReminderModalItem] = useState(null);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderOffset, setReminderOffset] = useState('30');
  const [reminderChannel, setReminderChannel] = useState('in_app');
  const [reminderNotes, setReminderNotes] = useState('');
  const [savingReminder, setSavingReminder] = useState(false);
  const [reminderFeedback, setReminderFeedback] = useState(null);

  const fetchObligations = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await documentAPI.getObligations(documentId);
      if (res.data?.success && res.data.data) {
        setData(res.data.data);
      } else {
        throw new Error(res.data?.error?.message || 'Failed to extract obligations.');
      }
    } catch (err) {
      console.error('Fetch obligations error:', err);
      setError(err.message || 'Unable to load contract obligations.');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchObligations();
  }, [fetchObligations]);

  // Open Reminder Modal for an item
  const openReminderModal = (item) => {
    setReminderModalItem(item);
    setReminderNotes(`Follow up on: ${item.title} (${item.date})`);

    // Default reminder date calculation
    if (item.parsedDate) {
      const due = new Date(item.parsedDate);
      const reminderD = new Date(due);
      reminderD.setDate(reminderD.getDate() - 30);
      setReminderDate(reminderD.toISOString().split('T')[0]);
      setReminderOffset('30');
    } else {
      const today = new Date();
      today.setDate(today.getDate() + 14);
      setReminderDate(today.toISOString().split('T')[0]);
      setReminderOffset('14');
    }
    setReminderFeedback(null);
  };

  const handleSaveReminder = async (e) => {
    e.preventDefault();
    if (!reminderModalItem || !reminderDate) return;
    setSavingReminder(true);
    setReminderFeedback(null);

    try {
      const payload = {
        obligationId: reminderModalItem.id,
        title: reminderModalItem.title,
        category: reminderModalItem.category,
        dueDate: reminderModalItem.parsedDate || null,
        reminderDate: new Date(reminderDate).toISOString(),
        offsetDays: Number(reminderOffset) || 0,
        notificationChannel: reminderChannel,
        notes: reminderNotes,
      };

      const res = await documentAPI.createReminder(documentId, payload);
      if (res.data?.success) {
        setReminderFeedback({ type: 'success', message: 'Contract reminder scheduled successfully.' });
        setTimeout(() => {
          setReminderModalItem(null);
          fetchObligations();
        }, 1200);
      } else {
        throw new Error(res.data?.error?.message || 'Failed to save reminder.');
      }
    } catch (err) {
      console.error('Save reminder error:', err);
      setReminderFeedback({ type: 'error', message: err.message || 'Error creating reminder.' });
    } finally {
      setSavingReminder(false);
    }
  };

  const handleDeleteReminder = async (reminderId) => {
    if (!confirm('Are you sure you want to remove this scheduled reminder?')) return;
    try {
      await documentAPI.deleteReminder(documentId, reminderId);
      fetchObligations();
    } catch (err) {
      alert('Failed to remove reminder: ' + (err.message || 'Server error'));
    }
  };

  const handleDownloadIcs = async (reminderId) => {
    try {
      const res = await documentAPI.downloadReminderIcs(documentId, reminderId);
      const blob = new Blob([res.data], { type: 'text/calendar;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contract-reminder-${reminderId}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download calendar invite: ' + (err.message || 'Server error'));
    }
  };

  if (loading) {
    return (
      <div className="card text-center" style={{ padding: '3rem' }}>
        <Loader2 className="spinner" size={24} style={{ margin: '0 auto 0.75rem' }} />
        <p className="text-mono text-sm muted">Extracting contract obligations and timeline milestones...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: '2rem', border: '1px solid var(--color-danger)' }}>
        <div className="flex-center gap-2 mb-2" style={{ color: 'var(--color-danger)' }}>
          <AlertCircle size={18} />
          <h4 style={{ margin: 0, fontWeight: 700 }}>Extraction Service Error</h4>
        </div>
        <p className="text-sm muted mb-3">{error}</p>
        <button className="btn btn-secondary btn-sm" onClick={fetchObligations}>
          <RefreshCw size={13} /> Retry Extraction
        </button>
      </div>
    );
  }

  const timeline = data?.timeline || [];
  const summary = data?.summary || {};

  // Filtering
  const filteredItems = timeline.filter((item) => {
    const matchesCat = categoryFilter === 'ALL' || item.category === categoryFilter;
    const matchesCert = certaintyFilter === 'ALL' || item.certainty === certaintyFilter;
    const matchesSearch =
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.date.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.sourcePassage && item.sourcePassage.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesCert && matchesSearch;
  });

  return (
    <div className="contract-obligations-container">
      {/* ── Metric Summary Strip ────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.65rem 0.85rem',
          }}
        >
          <div className="text-xs text-mono muted">TOTAL EXTRACTED</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {summary.totalItems || 0}
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.65rem 0.85rem',
          }}
        >
          <div className="text-xs text-mono muted">EXPLICIT DATES</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>
            {summary.explicitCount || 0}
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.65rem 0.85rem',
          }}
        >
          <div className="text-xs text-mono muted">INFERRED TERMS</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
            {summary.inferredCount || 0}
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.65rem 0.85rem',
          }}
        >
          <div className="text-xs text-mono muted">UNCERTAIN / OPEN</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-warning)' }}>
            {summary.uncertainCount || 0}
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.65rem 0.85rem',
          }}
        >
          <div className="text-xs text-mono muted">ACTIVE REMINDERS</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>
            {summary.activeRemindersCount || 0}
          </div>
        </div>
      </div>

      {/* ── Toolbar: Search, Filters, and View Switcher ─────────────── */}
      <div
        className="flex-center justify-between gap-3 mb-3 pb-2 flex-wrap"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex-center gap-2 flex-1" style={{ minWidth: '220px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
            <Search
              size={13}
              style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}
            />
            <input
              type="text"
              className="input input-sm"
              placeholder="Search obligations or dates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '1.75rem', fontSize: '0.8rem', width: '100%' }}
            />
          </div>

          <select
            className="input input-sm text-mono"
            value={certaintyFilter}
            onChange={(e) => setCertaintyFilter(e.target.value)}
            style={{ fontSize: '0.75rem', width: 'auto' }}
          >
            <option value="ALL">All Certainty Levels</option>
            <option value="EXPLICIT">Explicit Only</option>
            <option value="INFERRED">Inferred Only</option>
            <option value="UNCERTAIN">Uncertain / Conditional</option>
          </select>
        </div>

        <div className="flex-center gap-1">
          <button
            className={`btn btn-xs ${viewMode === 'list' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setViewMode('list')}
            title="Categorized List View"
          >
            <Filter size={12} /> List View
          </button>
          <button
            className={`btn btn-xs ${viewMode === 'timeline' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setViewMode('timeline')}
            title="Chronological Milestone Track"
          >
            <Clock size={12} /> Timeline Track
          </button>
          <button className="btn btn-ghost btn-xs" onClick={fetchObligations} title="Refresh Extraction">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* ── Category Filter Pills ───────────────────────────────────── */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        {[
          { key: 'ALL', label: 'All Obligations' },
          { key: 'START_DATE', label: 'Start Dates' },
          { key: 'EXPIRATION_DATE', label: 'Expiration & Term' },
          { key: 'RENEWAL_DATE', label: 'Renewals' },
          { key: 'NOTICE_PERIOD', label: 'Notice Periods' },
          { key: 'TERMINATION_DEADLINE', label: 'Termination Deadlines' },
          { key: 'PAYMENT_DEADLINE', label: 'Payment Terms' },
          { key: 'AFFIRMATIVE_OBLIGATION', label: 'Affirmative Covenants' },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`btn btn-xs ${categoryFilter === tab.key ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setCategoryFilter(tab.key)}
            style={{ fontSize: '11px', whiteSpace: 'nowrap' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content View ───────────────────────────────────────────── */}
      {filteredItems.length === 0 ? (
        <div className="empty-state text-center" style={{ padding: '2.5rem 1rem' }}>
          <Compass size={24} style={{ opacity: 0.4, margin: '0 auto 0.5rem' }} />
          <p className="text-sm muted mb-1">No matching obligations or deadlines identified.</p>
          <span className="text-xs text-mono muted">
            Try adjusting your search criteria or certainty filter.
          </span>
        </div>
      ) : viewMode === 'timeline' ? (
        /* ── Chronological Milestone Track ──────────────────────────── */
        <div className="timeline-track" style={{ padding: '0.5rem 0 1rem 1rem', borderLeft: '2px solid var(--color-border)', marginLeft: '0.75rem' }}>
          {filteredItems.map((item, idx) => {
            const catMeta = CATEGORY_META[item.category] || CATEGORY_META.OTHER;
            const IconComponent = catMeta.icon;
            const isExplicit = item.certainty === 'EXPLICIT';
            const isInferred = item.certainty === 'INFERRED';

            return (
              <div key={item.id || idx} style={{ position: 'relative', marginBottom: '1.5rem', paddingLeft: '1.25rem' }}>
                {/* Node indicator */}
                <div
                  style={{
                    position: 'absolute',
                    left: '-1.85rem',
                    top: '0.2rem',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: isExplicit ? 'var(--color-primary)' : isInferred ? 'var(--color-surface)' : 'var(--color-warning)',
                    border: '2px solid var(--color-border-hover)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <IconComponent size={9} color={isExplicit ? '#fff' : 'var(--color-primary)'} />
                </div>

                <div
                  style={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.85rem',
                  }}
                >
                  <div className="flex-center justify-between mb-1">
                    <span className="badge badge-neutral text-mono" style={{ fontSize: '10px' }}>
                      {catMeta.label}
                    </span>
                    <span
                      className={`badge text-mono ${
                        isExplicit ? 'badge-success' : isInferred ? 'badge-info' : 'badge-warning'
                      }`}
                      style={{ fontSize: '10px' }}
                    >
                      {item.certainty}
                    </span>
                  </div>

                  <h5 style={{ margin: '0.25rem 0', fontSize: '0.95rem', fontWeight: 700 }}>
                    {item.title}
                  </h5>

                  <div className="text-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '0.4rem' }}>
                    📅 {item.date}
                  </div>

                  {item.uncertaintyReason && (
                    <div
                      className="text-xs muted mb-2"
                      style={{
                        background: 'var(--color-surface)',
                        padding: '0.4rem 0.6rem',
                        borderRadius: 'var(--radius-sm)',
                        borderLeft: '2px solid var(--color-warning)',
                      }}
                    >
                      ℹ️ {item.uncertaintyReason}
                    </div>
                  )}

                  {/* Grounded Source Passage */}
                  {item.sourcePassage && (
                    <div
                      className="text-xs text-mono"
                      style={{
                        background: 'var(--color-surface)',
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-border)',
                        marginBottom: '0.5rem',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      "{item.sourcePassage}"
                    </div>
                  )}

                  <div className="flex-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => onSelectEvidence(item.sourcePassage, item.page || 1)}
                    >
                      <Eye size={11} /> View in Document
                    </button>

                    {item.reminder ? (
                      <div className="flex-center gap-1">
                        <span className="badge badge-success text-mono" style={{ fontSize: '10px' }}>
                          <Check size={10} /> Reminder Active
                        </span>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleDownloadIcs(item.reminder._id)}
                          title="Export .ICS"
                        >
                          <Download size={11} />
                        </button>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleDeleteReminder(item.reminder._id)}
                          title="Delete Reminder"
                          style={{ color: 'var(--color-danger)' }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => openReminderModal(item)}
                      >
                        <Bell size={11} /> Schedule Reminder
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Categorized List View ─────────────────────────────────── */
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {filteredItems.map((item, idx) => {
            const catMeta = CATEGORY_META[item.category] || CATEGORY_META.OTHER;
            const IconComponent = catMeta.icon;
            const isExplicit = item.certainty === 'EXPLICIT';
            const isInferred = item.certainty === 'INFERRED';

            return (
              <div
                key={item.id || idx}
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem 1rem',
                  display: 'grid',
                  gap: '0.5rem',
                }}
              >
                {/* Header row */}
                <div className="flex-center justify-between flex-wrap gap-2">
                  <div className="flex-center gap-2">
                    <div
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <IconComponent size={14} />
                    </div>
                    <div>
                      <span className="text-xs text-mono muted" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {catMeta.label}
                      </span>
                      <h5 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
                        {item.title}
                      </h5>
                    </div>
                  </div>

                  <div className="flex-center gap-2">
                    <span
                      className={`badge text-mono ${
                        isExplicit ? 'badge-success' : isInferred ? 'badge-info' : 'badge-warning'
                      }`}
                      style={{ fontSize: '10px' }}
                    >
                      {item.certainty}
                    </span>

                    <span className="badge badge-neutral text-mono" style={{ fontSize: '10px' }}>
                      {item.dateType?.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Date Highlight & Action Required */}
                <div
                  className="flex-center justify-between flex-wrap gap-2"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.5rem 0.75rem',
                  }}
                >
                  <div className="flex-center gap-2">
                    <Calendar size={14} color="var(--color-primary)" />
                    <span className="text-mono" style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      {item.date}
                    </span>
                  </div>

                  {item.actionRequired && (
                    <span className="text-xs muted text-mono" style={{ maxWidth: '420px', lineHeight: '1.3' }}>
                      {item.actionRequired}
                    </span>
                  )}
                </div>

                {/* Uncertainty Explanation Callout */}
                {item.uncertaintyReason && (
                  <div
                    className="text-xs muted flex gap-2"
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderLeft: '3px solid var(--color-warning)',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <HelpCircle size={14} color="var(--color-warning)" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div>
                      <strong style={{ color: 'var(--color-text-primary)' }}>Uncertainty / Inferred Basis:</strong>{' '}
                      {item.uncertaintyReason}
                    </div>
                  </div>
                )}

                {/* Verbatim Grounded Source Passage */}
                {item.sourcePassage && (
                  <div
                    style={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.5rem 0.75rem',
                    }}
                  >
                    <div className="flex-center justify-between mb-1">
                      <span className="text-xs text-mono muted" style={{ fontSize: '10px' }}>
                        GROUNDED CONTRACT PASSAGE (PG {item.page || 1}
                        {item.section ? ` · ${item.section}` : ''})
                      </span>
                      <button
                        className="btn btn-ghost btn-xs text-mono"
                        style={{ fontSize: '10px', height: '18px', padding: '0 4px' }}
                        onClick={() => onSelectEvidence(item.sourcePassage, item.page || 1)}
                        title="Highlight passage in document viewer"
                      >
                        <Eye size={10} /> View Source
                      </button>
                    </div>
                    <blockquote
                      style={{
                        margin: 0,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem',
                        lineHeight: '1.45',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      "{item.sourcePassage}"
                    </blockquote>
                  </div>
                )}

                {/* Footer Strip: Party & Reminder Controls */}
                <div
                  className="flex-center justify-between pt-1 flex-wrap gap-2"
                  style={{ borderTop: '1px solid var(--color-border)' }}
                >
                  <span className="text-xs text-mono muted">
                    Bound Party: <strong style={{ color: 'var(--color-text-primary)' }}>{item.party || 'All Parties'}</strong>
                  </span>

                  {item.reminder ? (
                    <div className="flex-center gap-1">
                      <span
                        className="badge badge-success text-mono"
                        style={{ fontSize: '10px' }}
                        title={`Alert set for ${new Date(item.reminder.reminderDate).toLocaleDateString()}`}
                      >
                        <Check size={10} /> Reminder: {new Date(item.reminder.reminderDate).toLocaleDateString()}
                      </span>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => handleDownloadIcs(item.reminder._id)}
                        title="Download .ICS Calendar File"
                      >
                        <Download size={11} /> .ICS
                      </button>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => handleDeleteReminder(item.reminder._id)}
                        title="Cancel Reminder"
                        style={{ color: 'var(--color-danger)' }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-secondary btn-xs"
                      onClick={() => openReminderModal(item)}
                      style={{ fontSize: '11px' }}
                    >
                      <Bell size={11} /> Set Reminder
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Real Reminder Modal Dialog ──────────────────────────────── */}
      {reminderModalItem && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '1.5rem',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div className="flex-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex-center gap-2">
                <Bell size={16} color="var(--color-primary)" />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                  Schedule Contract Reminder
                </h4>
              </div>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setReminderModalItem(null)}
                disabled={savingReminder}
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSaveReminder}>
              <div className="mb-3">
                <span className="text-xs text-mono muted" style={{ display: 'block', marginBottom: '0.2rem' }}>
                  CONTRACT EVENT / OBLIGATION
                </span>
                <div
                  className="text-mono"
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    padding: '0.4rem 0.6rem',
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {reminderModalItem.title}
                </div>
              </div>

              <div className="grid-2 mb-3">
                <div>
                  <label className="text-xs text-mono muted" style={{ display: 'block', marginBottom: '0.2rem' }}>
                    TRIGGER OFFSET
                  </label>
                  <select
                    className="input input-sm text-mono"
                    value={reminderOffset}
                    onChange={(e) => {
                      const offset = Number(e.target.value);
                      setReminderOffset(e.target.value);
                      if (reminderModalItem.parsedDate) {
                        const due = new Date(reminderModalItem.parsedDate);
                        due.setDate(due.getDate() - offset);
                        setReminderDate(due.toISOString().split('T')[0]);
                      }
                    }}
                    style={{ width: '100%', fontSize: '0.8rem' }}
                  >
                    <option value="60">60 Days Prior</option>
                    <option value="30">30 Days Prior</option>
                    <option value="15">15 Days Prior</option>
                    <option value="7">7 Days Prior</option>
                    <option value="1">1 Day Prior</option>
                    <option value="0">On Deadline Date</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-mono muted" style={{ display: 'block', marginBottom: '0.2rem' }}>
                    REMINDER ALERT DATE
                  </label>
                  <input
                    type="date"
                    className="input input-sm text-mono"
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                    required
                    style={{ width: '100%', fontSize: '0.8rem' }}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="text-xs text-mono muted" style={{ display: 'block', marginBottom: '0.2rem' }}>
                  NOTIFICATION CHANNEL
                </label>
                <select
                  className="input input-sm text-mono"
                  value={reminderChannel}
                  onChange={(e) => setReminderChannel(e.target.value)}
                  style={{ width: '100%', fontSize: '0.8rem' }}
                >
                  <option value="in_app">In-App Notification Banner</option>
                  <option value="calendar_ics">Exportable iCalendar (.ICS)</option>
                  <option value="email">Email Notification (where enabled)</option>
                </select>
              </div>

              <div className="mb-4">
                <label className="text-xs text-mono muted" style={{ display: 'block', marginBottom: '0.2rem' }}>
                  OPTIONAL NOTES / INSTRUCTIONS
                </label>
                <textarea
                  className="input input-sm"
                  rows={2}
                  value={reminderNotes}
                  onChange={(e) => setReminderNotes(e.target.value)}
                  placeholder="e.g. Confirm renegotiation terms with counterparty counsel..."
                  style={{ width: '100%', fontSize: '0.8rem' }}
                />
              </div>

              {reminderFeedback && (
                <div
                  className="text-xs text-mono mb-3 p-2"
                  style={{
                    borderRadius: 'var(--radius-sm)',
                    background:
                      reminderFeedback.type === 'success'
                        ? 'var(--color-surface-2)'
                        : 'rgba(239, 68, 68, 0.1)',
                    border:
                      reminderFeedback.type === 'success'
                        ? '1px solid var(--color-success)'
                        : '1px solid var(--color-danger)',
                    color:
                      reminderFeedback.type === 'success'
                        ? 'var(--color-success)'
                        : 'var(--color-danger)',
                  }}
                >
                  {reminderFeedback.message}
                </div>
              )}

              <div className="flex-center justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setReminderModalItem(null)}
                  disabled={savingReminder}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={savingReminder || !reminderDate}
                >
                  {savingReminder ? (
                    <>
                      <Loader2 size={13} className="spinner" /> Saving...
                    </>
                  ) : (
                    'Save Reminder'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
