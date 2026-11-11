import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  Columns,
  FileCheck,
  FileText,
  GitBranch,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { documentAPI } from '../services/api';
import Spinner from './Spinner';

export default function DocumentCompareWorkspace({
  baseDocumentId,
  targetDocumentId,
  availableDocuments = [],
  onClose,
  onSwitchDocuments,
}) {
  const [baseId, setBaseId] = useState(baseDocumentId);
  const [targetId, setTargetId] = useState(targetDocumentId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | modified | added | removed | unchanged
  const [searchQuery, setSearchQuery] = useState('');
  const [diffViewMode, setDiffViewMode] = useState('side-by-side'); // side-by-side | unified
  const [activeTab, setActiveTab] = useState('clauses'); // clauses | fulltext

  const fetchComparison = async (bId, tId) => {
    if (!bId || !tId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await documentAPI.compare(bId, tId);
      setCompareData(res?.data?.data || null);
    } catch (err) {
      console.error('Document comparison error:', err);
      setError(err.message || 'Failed to compare documents.');
      setCompareData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (baseId && targetId) {
      fetchComparison(baseId, targetId);
    }
  }, [baseId, targetId]);

  const handleSwap = () => {
    const temp = baseId;
    setBaseId(targetId);
    setTargetId(temp);
    if (onSwitchDocuments) {
      onSwitchDocuments(targetId, temp);
    }
  };

  const handleBaseChange = (newBaseId) => {
    setBaseId(newBaseId);
    if (onSwitchDocuments) onSwitchDocuments(newBaseId, targetId);
  };

  const handleTargetChange = (newTargetId) => {
    setTargetId(newTargetId);
    if (onSwitchDocuments) onSwitchDocuments(baseId, newTargetId);
  };

  const clauseComparisons = compareData?.clauseComparisons || [];
  const metrics = compareData?.metrics || {};
  const baseDoc = compareData?.baseDocument || {};
  const targetDoc = compareData?.targetDocument || {};
  const significantChanges = compareData?.significantChanges || [];
  const fullTextDiff = compareData?.fullTextDiff || { chunks: [] };

  const filteredClauses = clauseComparisons.filter((c) => {
    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchesSearch =
      !searchQuery ||
      c.clauseType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.baseText || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.targetText || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.significanceExplanation || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'modified':
        return <span className="badge badge-warning text-mono">MODIFIED</span>;
      case 'added':
        return <span className="badge badge-success text-mono">ADDED IN REVISION</span>;
      case 'removed':
        return <span className="badge badge-danger text-mono">OMITTED IN REVISION</span>;
      default:
        return <span className="badge badge-neutral text-mono">UNCHANGED</span>;
    }
  };

  const getRiskScoreBadge = (score, level) => {
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
    <div className="compare-workspace" style={{ padding: '1rem 0' }}>
      {/* Top Navigation & Workspace Header */}
      <div
        className="workspace-header mb-4 pb-3"
        style={{
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div className="flex-center gap-3">
          <button
            className="btn btn-ghost btn-sm flex-center gap-2"
            onClick={onClose}
            title="Exit comparison and return to document view"
          >
            <ArrowLeft size={16} />
            <span>Back to Document</span>
          </button>
          <div style={{ height: '20px', width: '1px', background: 'var(--color-border)' }} />
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GitBranch size={20} color="var(--color-primary)" />
              <span>Contract Comparison Workspace</span>
            </h2>
            <p className="text-xs text-secondary" style={{ margin: '2px 0 0' }}>
              Side-by-side clause revision tracking, word-level difference mapping, and risk delta telemetry.
            </p>
          </div>
        </div>

        {/* View Mode & Actions */}
        <div className="flex-center gap-2">
          <button
            className="btn btn-ghost btn-sm flex-center gap-1"
            onClick={() => fetchComparison(baseId, targetId)}
            title="Refresh comparison"
          >
            <RefreshCw size={14} />
            <span>Re-evaluate</span>
          </button>
        </div>
      </div>

      {/* Document Selection & Comparison Bar */}
      <div
        className="card mb-4"
        style={{
          padding: '1.25rem',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            gap: '1.5rem',
          }}
        >
          {/* Base Document Selector */}
          <div
            style={{
              padding: '1rem',
              background: 'var(--color-surface-2)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div className="flex-center justify-between mb-2">
              <span className="text-xs text-mono" style={{ fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.05em' }}>
                BASE VERSION (ORIGINAL)
              </span>
              {baseDoc.version && (
                <span className="badge badge-neutral text-mono">v{baseDoc.version}.0</span>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <select
                value={baseId}
                onChange={(e) => handleBaseChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                {availableDocuments.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.originalName} {d.version ? `(v${d.version}.0)` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-center justify-between mt-2 pt-2 text-xs text-secondary" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              <span>Risk: {getRiskScoreBadge(baseDoc.overallRiskScore ?? 0, baseDoc.overallRiskLevel)}</span>
              <span>{baseDoc.clausesCount || 0} Clauses</span>
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex-center">
            <button
              className="btn btn-secondary btn-sm flex-center gap-1"
              onClick={handleSwap}
              title="Swap Base and Target documents"
              style={{
                borderRadius: '50%',
                width: '38px',
                height: '38px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowLeftRight size={16} />
            </button>
          </div>

          {/* Target Document Selector */}
          <div
            style={{
              padding: '1rem',
              background: 'var(--color-surface-2)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div className="flex-center justify-between mb-2">
              <span className="text-xs text-mono" style={{ fontWeight: 700, color: 'var(--color-text-secondary)', letterSpacing: '0.05em' }}>
                TARGET VERSION (REVISED)
              </span>
              {targetDoc.version && (
                <span className="badge badge-primary text-mono">v{targetDoc.version}.0</span>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <select
                value={targetId}
                onChange={(e) => handleTargetChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                {availableDocuments.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.originalName} {d.version ? `(v${d.version}.0)` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-center justify-between mt-2 pt-2 text-xs text-secondary" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              <span>Risk: {getRiskScoreBadge(targetDoc.overallRiskScore ?? 0, targetDoc.overallRiskLevel)}</span>
              <span>{targetDoc.clausesCount || 0} Clauses</span>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex-center flex-col gap-3 py-12">
          <Spinner />
          <p className="text-sm text-secondary">Computing authentic clause and word-level diffs...</p>
        </div>
      )}

      {error && !loading && (
        <div
          className="flex gap-3 p-4 mb-4"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-danger, #ef4444)',
          }}
        >
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <div>
            <h4 style={{ margin: '0 0 4px', fontSize: '0.9rem', fontWeight: 700 }}>Comparison Failed</h4>
            <p className="text-xs" style={{ margin: 0 }}>{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && compareData && (
        <>
          {/* Summary of Significant Changes Strip */}
          <div
            className="card mb-4"
            style={{
              padding: '1.25rem',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div className="flex-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              <div className="flex-center gap-2">
                <Sparkles size={16} color="var(--color-primary)" />
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Summary of Significant Contractual Changes
                </h3>
              </div>

              {/* Risk Delta Indicator */}
              <div className="flex-center gap-2">
                <span className="text-xs text-secondary">Risk Trajectory:</span>
                {metrics.riskScoreDelta < 0 ? (
                  <span className="badge badge-success text-mono flex-center gap-1">
                    <ShieldCheck size={12} />
                    <span>{metrics.riskScoreDelta} POINTS (RISK IMPROVED)</span>
                  </span>
                ) : metrics.riskScoreDelta > 0 ? (
                  <span className="badge badge-danger text-mono flex-center gap-1">
                    <ShieldAlert size={12} />
                    <span>+{metrics.riskScoreDelta} POINTS (RISK INCREASED)</span>
                  </span>
                ) : (
                  <span className="badge badge-neutral text-mono">0 RISK CHANGE</span>
                )}
              </div>
            </div>

            {/* KPI Cards Strip */}
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
                  background: 'var(--color-surface-2)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)' }}>
                  {metrics.modifiedClauses || 0}
                </div>
                <div className="text-xs text-secondary mt-1">Modified Clauses</div>
              </div>

              <div
                style={{
                  background: 'var(--color-surface-2)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success)' }}>
                  +{metrics.addedClauses || 0}
                </div>
                <div className="text-xs text-secondary mt-1">Added Clauses</div>
              </div>

              <div
                style={{
                  background: 'var(--color-surface-2)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-danger)' }}>
                  -{metrics.removedClauses || 0}
                </div>
                <div className="text-xs text-secondary mt-1">Removed Clauses</div>
              </div>

              <div
                style={{
                  background: 'var(--color-surface-2)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                  {metrics.unchangedClauses || 0}
                </div>
                <div className="text-xs text-secondary mt-1">Unchanged Clauses</div>
              </div>

              <div
                style={{
                  background: 'var(--color-surface-2)',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-subtle)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)' }}>
                  +{metrics.addedWords || 0} / -{metrics.removedWords || 0}
                </div>
                <div className="text-xs text-secondary mt-1">Word Level Delta</div>
              </div>
            </div>

            {/* List of Model-Supported Significant Changes */}
            {significantChanges.length > 0 ? (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <span className="text-xs text-secondary font-mono" style={{ fontWeight: 700, letterSpacing: '0.04em' }}>
                  MODEL-GROUNDED LEGAL IMPACT FINDINGS:
                </span>
                {significantChanges.map((sc, i) => (
                  <div
                    key={i}
                    className="flex gap-2 text-xs"
                    style={{
                      background: sc.hasRiskDelta ? 'var(--color-surface-2)' : 'transparent',
                      border: sc.hasRiskDelta ? '1px solid var(--color-border)' : 'none',
                      borderLeft: sc.hasRiskDelta ? '3px solid var(--color-primary)' : 'none',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <CheckCircle2
                      size={14}
                      color={sc.hasRiskDelta ? 'var(--color-primary)' : 'var(--color-text-tertiary)'}
                      style={{ flexShrink: 0, marginTop: '2px' }}
                    />
                    <div>
                      <strong style={{ textTransform: 'uppercase', marginRight: '6px' }}>
                        {sc.clauseType}:
                      </strong>
                      <span>{sc.explanation}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-secondary" style={{ margin: 0 }}>
                No legally significant risk shifts or structural alterations detected between these two versions.
              </p>
            )}
          </div>

          {/* Comparison Views: Clause vs Full-text */}
          <div className="card mb-4" style={{ padding: '1.25rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <div
              className="flex-center justify-between mb-4 pb-3"
              style={{ borderBottom: '1px solid var(--color-border-subtle)', flexWrap: 'wrap', gap: '1rem' }}
            >
              {/* Tab Selector */}
              <div className="flex-center gap-2">
                <button
                  className={`btn btn-sm ${activeTab === 'clauses' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setActiveTab('clauses')}
                >
                  <FileCheck size={14} />
                  <span>Clause-by-Clause Comparison ({clauseComparisons.length})</span>
                </button>
                <button
                  className={`btn btn-sm ${activeTab === 'fulltext' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setActiveTab('fulltext')}
                >
                  <FileText size={14} />
                  <span>Full Document Text Diff</span>
                </button>
              </div>

              {/* View Configuration: Side-by-Side vs Unified */}
              {activeTab === 'clauses' && (
                <div className="flex-center gap-3">
                  <div className="workspace-layout-controls">
                    <button
                      className={`workspace-layout-btn ${diffViewMode === 'side-by-side' ? 'active' : ''}`}
                      onClick={() => setDiffViewMode('side-by-side')}
                      title="Side-by-side comparison"
                    >
                      <Columns size={12} />
                      <span>Side-by-Side</span>
                    </button>
                    <button
                      className={`workspace-layout-btn ${diffViewMode === 'unified' ? 'active' : ''}`}
                      onClick={() => setDiffViewMode('unified')}
                      title="Unified inline diff view"
                    >
                      <SlidersHorizontal size={12} />
                      <span>Unified Diff</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Clauses Filter Strip */}
            {activeTab === 'clauses' && (
              <div
                className="flex-center justify-between mb-4"
                style={{ flexWrap: 'wrap', gap: '0.75rem' }}
              >
                {/* Status Segmented Buttons */}
                <div className="flex-center gap-1" style={{ flexWrap: 'wrap' }}>
                  {['ALL', 'modified', 'added', 'removed', 'unchanged'].map((st) => (
                    <button
                      key={st}
                      className={`btn btn-xs ${statusFilter === st ? 'btn-secondary' : 'btn-ghost'}`}
                      onClick={() => setStatusFilter(st)}
                      style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 600 }}
                    >
                      {st === 'ALL' ? 'All Clauses' : st}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div style={{ position: 'relative', width: '240px' }}>
                  <Search
                    size={14}
                    style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }}
                  />
                  <input
                    type="text"
                    placeholder="Search in comparison..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.4rem 0.6rem 0.4rem 2rem',
                      fontSize: '0.8rem',
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text)',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Tab 1: Clause-by-Clause Comparison */}
            {activeTab === 'clauses' && (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {filteredClauses.length === 0 ? (
                  <div className="split-empty-state" style={{ padding: '3rem 1rem' }}>
                    <CheckCircle2 size={28} color="var(--color-text-tertiary)" />
                    <p className="text-sm text-secondary" style={{ marginTop: '0.5rem' }}>
                      No clauses match the selected filter criteria.
                    </p>
                  </div>
                ) : (
                  filteredClauses.map((clause) => (
                    <div
                      key={clause.id}
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Clause Card Header */}
                      <div
                        className="flex-center justify-between"
                        style={{
                          padding: '0.75rem 1rem',
                          background: 'var(--color-surface-2)',
                          borderBottom: '1px solid var(--color-border-subtle)',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                        }}
                      >
                        <div className="flex-center gap-2">
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {clause.clauseType}
                          </span>
                          {(clause.sectionBase || clause.sectionTarget) && (
                            <span className="badge badge-neutral text-mono" style={{ fontSize: '10px' }}>
                              SEC {clause.sectionTarget || clause.sectionBase}
                            </span>
                          )}
                          {getStatusBadge(clause.status)}
                        </div>

                        <div className="flex-center gap-3 text-xs text-secondary">
                          {clause.addedWords > 0 && (
                            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                              +{clause.addedWords} words
                            </span>
                          )}
                          {clause.removedWords > 0 && (
                            <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                              -{clause.removedWords} words
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Model-Supported Legal Explanation */}
                      {clause.significanceExplanation && (
                        <div
                          className="text-xs"
                          style={{
                            padding: '0.6rem 1rem',
                            background: clause.hasRiskDelta ? 'rgba(59, 130, 246, 0.05)' : 'var(--color-surface-2)',
                            borderBottom: '1px solid var(--color-border-subtle)',
                            color: 'var(--color-text)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <Sparkles size={13} color="var(--color-primary)" style={{ flexShrink: 0 }} />
                          <span>{clause.significanceExplanation}</span>
                        </div>
                      )}

                      {/* Clause Diff Content */}
                      <div style={{ padding: '1rem' }}>
                        {diffViewMode === 'side-by-side' ? (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '1rem',
                            }}
                          >
                            {/* Left: Original wording */}
                            <div
                              style={{
                                background: 'var(--color-surface-2)',
                                border: '1px solid var(--color-border-subtle)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '0.85rem',
                              }}
                            >
                              <div className="text-xs text-secondary font-mono mb-2" style={{ fontWeight: 700 }}>
                                ORIGINAL (v{baseDoc.version || 1}.0):
                              </div>
                              {clause.baseText ? (
                                <p
                                  className="text-sm font-serif"
                                  style={{
                                    margin: 0,
                                    lineHeight: '1.65',
                                    color: clause.status === 'removed' ? 'var(--color-danger)' : 'var(--color-text)',
                                    textDecoration: clause.status === 'removed' ? 'line-through' : 'none',
                                    whiteSpace: 'pre-line',
                                  }}
                                >
                                  {clause.baseText}
                                </p>
                              ) : (
                                <span className="text-xs text-secondary italic">
                                  Not present in original version.
                                </span>
                              )}
                            </div>

                            {/* Right: Revised wording */}
                            <div
                              style={{
                                background: 'var(--color-surface-2)',
                                border: '1px solid var(--color-border-subtle)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '0.85rem',
                              }}
                            >
                              <div className="text-xs text-secondary font-mono mb-2" style={{ fontWeight: 700 }}>
                                REVISED (v{targetDoc.version || 2}.0):
                              </div>
                              {clause.targetText ? (
                                <p
                                  className="text-sm font-serif"
                                  style={{
                                    margin: 0,
                                    lineHeight: '1.65',
                                    color: clause.status === 'added' ? 'var(--color-success)' : 'var(--color-text)',
                                    fontWeight: clause.status === 'added' ? 600 : 400,
                                    whiteSpace: 'pre-line',
                                  }}
                                >
                                  {clause.targetText}
                                </p>
                              ) : (
                                <span className="text-xs text-secondary italic">
                                  Omitted in revised version.
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* Unified Diff View */
                          <div
                            style={{
                              background: 'var(--color-surface-2)',
                              border: '1px solid var(--color-border-subtle)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '1rem',
                              fontFamily: 'var(--font-serif)',
                              lineHeight: '1.7',
                              fontSize: '0.9rem',
                            }}
                          >
                            {clause.diff && clause.diff.length > 0 ? (
                              clause.diff.map((chunk, idx) => {
                                if (chunk.type === 'added') {
                                  return (
                                    <ins
                                      key={idx}
                                      className="diff-ins"
                                      style={{
                                        background: 'rgba(34, 197, 94, 0.15)',
                                        color: 'var(--color-success)',
                                        textDecoration: 'underline',
                                        padding: '1px 3px',
                                        borderRadius: '2px',
                                      }}
                                    >
                                      {chunk.value}
                                    </ins>
                                  );
                                }
                                if (chunk.type === 'removed') {
                                  return (
                                    <del
                                      key={idx}
                                      className="diff-del"
                                      style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        color: 'var(--color-danger)',
                                        textDecoration: 'line-through',
                                        padding: '1px 3px',
                                        borderRadius: '2px',
                                      }}
                                    >
                                      {chunk.value}
                                    </del>
                                  );
                                }
                                return <span key={idx}>{chunk.value}</span>;
                              })
                            ) : (
                              <span>{clause.targetText || clause.baseText}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 2: Full Document Text Diff */}
            {activeTab === 'fulltext' && (
              <div
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.5rem',
                  fontFamily: 'var(--font-serif)',
                  fontSize: '0.9rem',
                  lineHeight: '1.75',
                  maxHeight: '600px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {fullTextDiff.chunks && fullTextDiff.chunks.length > 0 ? (
                  fullTextDiff.chunks.map((chunk, idx) => {
                    if (chunk.type === 'added') {
                      return (
                        <ins
                          key={idx}
                          className="diff-ins"
                          style={{
                            background: 'rgba(34, 197, 94, 0.15)',
                            color: 'var(--color-success)',
                            textDecoration: 'underline',
                            padding: '1px 4px',
                            borderRadius: '2px',
                          }}
                        >
                          {chunk.value}
                        </ins>
                      );
                    }
                    if (chunk.type === 'removed') {
                      return (
                        <del
                          key={idx}
                          className="diff-del"
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: 'var(--color-danger)',
                            textDecoration: 'line-through',
                            padding: '1px 4px',
                            borderRadius: '2px',
                          }}
                        >
                          {chunk.value}
                        </del>
                      );
                    }
                    return <span key={idx}>{chunk.value}</span>;
                  })
                ) : (
                  <p className="text-secondary italic">Both document texts are identical.</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
