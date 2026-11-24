
import { useState } from 'react';
import {
  AlignLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileCheck,
  Lightbulb,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import ContractObligationsTimeline from './ContractObligationsTimeline';

export default function IntelligenceWorkspacePane({
  document = {},
  metadata = {},
  analysis = null,
  risk = null,
  onSelectEvidence = () => {},
  _activeEvidence = null,
  isCollapsed = false,
  onToggleCollapse = () => {},
}) {
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('section');
      if (s === '1' || s === 'summary') return 'summary';
      if (s === '2' || s === 'clauses') return 'clauses';
      if (s === '3' || s === 'risk') return 'risk';
      if (s === '4' || s === 'obligations') return 'obligations';
      if (s === '5' || s === 'dates') return 'dates';
      if (s === '6' || s === 'parties') return 'parties';
      if (s === '7' || s === 'recommendations') return 'recommendations';
      if (s === 'all') return 'all';
    } catch {
      // ignore
    }
    return 'summary';
  });
  const [clauseSearch, setClauseSearch] = useState('');
  const [clauseFilter, setClauseFilter] = useState('ALL');
  const [riskSeverityFilter, setRiskSeverityFilter] = useState('ALL');

  // Normalize data structures
  const summaryObj = analysis?.summary && typeof analysis.summary === 'object' ? analysis.summary : {};
  const executiveSummary =
    (typeof summaryObj.fullSummary === 'string' && summaryObj.fullSummary.trim()) ||
    (typeof analysis?.fullSummary === 'string' && analysis.fullSummary.trim()) ||
    (typeof analysis?.summary === 'string' && analysis.summary.trim()) ||
    (typeof summaryObj.overview === 'string' && summaryObj.overview.trim()) ||
    (typeof analysis?.overview === 'string' && analysis.overview.trim()) ||
    null;
  const keyPoints = Array.isArray(summaryObj.keyPoints) ? summaryObj.keyPoints : [];
  const obligations = Array.isArray(summaryObj.obligations)
    ? summaryObj.obligations
    : Array.isArray(analysis?.obligations)
    ? analysis.obligations
    : [];
  const dates = Array.isArray(summaryObj.importantDates)
    ? summaryObj.importantDates
    : Array.isArray(analysis?.keyDates)
    ? analysis.keyDates
    : Array.isArray(analysis?.dates)
    ? analysis.dates
    : [];

  const clauses = Array.isArray(analysis?.clauses) ? analysis.clauses : [];
  const parties = Array.isArray(analysis?.parties) ? analysis.parties : [];
  const entities = Array.isArray(analysis?.entities) ? analysis.entities : [];

  // Risk findings
  const riskRecord = Array.isArray(risk) ? risk[0] : risk;
  const overallRiskScore =
    riskRecord?.overallRiskScore ??
    analysis?.overallRiskScore ??
    riskRecord?.riskScore ??
    0;
  const overallRiskLevel = (
    riskRecord?.overallRiskLevel ||
    riskRecord?.riskLevel ||
    'low'
  ).toLowerCase();

  const flaggedClauses = Array.isArray(riskRecord?.flaggedClauses)
    ? riskRecord.flaggedClauses
    : Array.isArray(riskRecord?.findings)
    ? riskRecord.findings
    : Array.isArray(riskRecord?.riskFindings)
    ? riskRecord.riskFindings
    : [];

  // Recommendations: extract from flaggedClauses suggestions
  const recommendations = flaggedClauses
    .filter((f) => f && (f.suggestion || f.recommendation))
    .map((f, idx) => ({
      id: f._id || idx,
      clauseType: f.clauseType || f.category || 'Contract Clause',
      clauseText: f.clauseText || f.text || '',
      suggestion: f.suggestion || f.recommendation || '',
      reason: f.reason || f.explanation || f.description || '',
      riskLevel: f.riskLevel || f.severity || 'medium',
      page: f.page || f.page_number || null,
      section: f.section || null,
    }));

  // Filtering clauses
  const availableClauseTypes = [
    'ALL',
    ...new Set(clauses.map((c) => c.clauseType || c.type).filter(Boolean)),
  ];

  const filteredClauses = clauses.filter((c) => {
    const type = c.clauseType || c.type || '';
    const text = c.clauseText || c.text || '';
    const matchType = clauseFilter === 'ALL' || type === clauseFilter;
    const matchSearch =
      !clauseSearch ||
      text.toLowerCase().includes(clauseSearch.toLowerCase()) ||
      type.toLowerCase().includes(clauseSearch.toLowerCase());
    return matchType && matchSearch;
  });

  // Filtering risk findings
  const filteredRiskFindings = flaggedClauses.filter((f) => {
    if (riskSeverityFilter === 'ALL') return true;
    const lev = (f.riskLevel || f.severity || '').toLowerCase();
    return lev === riskSeverityFilter.toLowerCase();
  });

  const getSeverityBadge = (level) => {
    const s = (level || 'low').toLowerCase();
    if (s === 'critical') return <span className="badge badge-critical">CRITICAL RISK</span>;
    if (s === 'high') return <span className="badge badge-danger">HIGH RISK</span>;
    if (s === 'medium') return <span className="badge badge-warning">MEDIUM RISK</span>;
    return <span className="badge badge-success">LOW RISK</span>;
  };

  const getConfidenceBadge = (conf) => {
    if (typeof conf !== 'number') return null;
    const pct = Math.round(conf * 100);
    return <span className="badge badge-neutral text-mono">{pct}% CONFIDENCE</span>;
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
        title="Expand Intelligence Findings Pane"
      >
        <button className="btn btn-ghost btn-sm" aria-label="Expand analysis pane">
          <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
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
          Analysis Findings
        </span>
      </div>
    );
  }

  return (
    <div className="split-pane-card" id="intelligence-workspace-pane">
      {/* Pane Top Header */}
      <div className="split-pane-header">
        <div className="flex-center gap-2">
          <Sparkles size={16} color="var(--color-primary)" />
          <h3 className="split-pane-title">Intelligence Findings</h3>
          <span className="source-badge-tag text-mono">7 SECTIONS</span>
        </div>

        <div className="flex-center gap-2">
          <button
            className={`btn btn-xs ${activeTab === 'all' ? 'btn-secondary' : 'btn-ghost'}`}
            onClick={() => setActiveTab(activeTab === 'all' ? 'summary' : 'all')}
          >
            {activeTab === 'all' ? 'Tabbed Mode' : 'View All Sections'}
          </button>
        </div>
      </div>

      {/* 7-Section Segmented Navigation Bar */}
      <div className="section-segmented-nav">
        <button
          className={`section-segment-btn ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          <Sparkles size={12} />
          <span>Executive Summary</span>
        </button>

        <button
          className={`section-segment-btn ${activeTab === 'clauses' ? 'active' : ''}`}
          onClick={() => setActiveTab('clauses')}
        >
          <AlignLeft size={12} />
          <span>Key Clauses ({clauses.length})</span>
        </button>

        <button
          className={`section-segment-btn ${activeTab === 'risk' ? 'active' : ''}`}
          onClick={() => setActiveTab('risk')}
        >
          <ShieldAlert size={12} />
          <span>Risk Findings ({flaggedClauses.length})</span>
        </button>

        <button
          className={`section-segment-btn ${activeTab === 'obligations' ? 'active' : ''}`}
          onClick={() => setActiveTab('obligations')}
        >
          <FileCheck size={12} />
          <span>Obligations ({obligations.length})</span>
        </button>

        <button
          className={`section-segment-btn ${activeTab === 'dates' ? 'active' : ''}`}
          onClick={() => setActiveTab('dates')}
        >
          <Calendar size={12} />
          <span>Important Dates ({dates.length})</span>
        </button>

        <button
          className={`section-segment-btn ${activeTab === 'parties' ? 'active' : ''}`}
          onClick={() => setActiveTab('parties')}
        >
          <Users size={12} />
          <span>Parties &amp; Entities ({parties.length + entities.length})</span>
        </button>

        <button
          className={`section-segment-btn ${activeTab === 'recommendations' ? 'active' : ''}`}
          onClick={() => setActiveTab('recommendations')}
        >
          <Lightbulb size={12} />
          <span>Recommendations ({recommendations.length})</span>
        </button>
      </div>

      {/* Pane Scrollable Body */}
      <div className="split-pane-body">
        {/* Section 1: Executive Summary */}
        {(activeTab === 'summary' || activeTab === 'all') && (
          <div className="mb-6" id="intel-section-summary">
            <div className="flex-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex-center gap-2">
                <Sparkles size={15} color="var(--color-primary)" />
                <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  1. Executive Summary
                </h4>
              </div>
              <span className="badge badge-neutral text-mono">SYNTHESIS</span>
            </div>

            {/* Legal Disclaimer */}
            <div className="legal-disclaimer-card">
              <strong>Notice:</strong> AI-assisted contract evaluation is provided for accelerated analysis and triage. Assessments are model-generated and do not constitute binding legal conclusions or qualified legal advice.
            </div>

            {/* Document Metadata Badges */}
            {(metadata?.pageCount || metadata?.wordCount || metadata?.detectedLanguage) && (
              <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
                {metadata.pageCount && (
                  <span className="badge badge-neutral text-mono">
                    {metadata.pageCount} {metadata.pageCount === 1 ? 'PAGE' : 'PAGES'}
                    {metadata.pageCountIsEstimated ? ' (EST.)' : ''}
                  </span>
                )}
                {metadata.wordCount && (
                  <span className="badge badge-neutral text-mono">
                    {metadata.wordCount.toLocaleString()} WORDS
                  </span>
                )}
                {metadata.detectedLanguage && (
                  <span className="badge badge-neutral text-mono">
                    LANG: {metadata.detectedLanguage.toUpperCase()}
                  </span>
                )}
              </div>
            )}

            {executiveSummary && (
              <div
                className="text-sm"
                style={{
                  lineHeight: '1.7',
                  color: 'var(--color-text)',
                  whiteSpace: 'pre-line',
                  marginBottom: '1rem',
                }}
              >
                {executiveSummary}
              </div>
            )}

            {/* Key Points */}
            {keyPoints.length > 0 && (
              <div className="mt-3">
                <h5
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-secondary)',
                    margin: '0 0 0.5rem',
                  }}
                >
                  Key Contractual Takeaways
                </h5>
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {keyPoints.map((point, idx) => (
                    <div
                      key={idx}
                      className="flex gap-2 text-sm"
                      style={{
                        background: 'var(--color-surface-2)',
                        border: '1px solid var(--color-border-subtle)',
                        padding: '0.55rem 0.75rem',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <CheckCircle2 size={14} color="var(--color-success)" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span>{typeof point === 'string' ? point : point.text || JSON.stringify(point)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!executiveSummary && keyPoints.length === 0 && (
              <div className="empty-state">
                <p>Executive synthesis pending pipeline execution.</p>
              </div>
            )}
          </div>
        )}

        {/* Section 2: Key Clauses */}
        {(activeTab === 'clauses' || activeTab === 'all') && (
          <div className="mb-6" id="intel-section-clauses">
            <div className="flex-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex-center gap-2">
                <AlignLeft size={15} color="var(--color-primary)" />
                <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  2. Key Contractual Clauses ({clauses.length})
                </h4>
              </div>
              <span className="badge badge-neutral text-mono">LEGAL-BERT</span>
            </div>

            {/* Filtering Controls */}
            <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
                <Search
                  size={12}
                  style={{
                    position: 'absolute',
                    left: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--color-text-muted)',
                  }}
                />
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '26px', fontSize: '11px', padding: '0.3rem 0.5rem 0.3rem 26px' }}
                  placeholder="Filter clauses…"
                  value={clauseSearch}
                  onChange={(e) => setClauseSearch(e.target.value)}
                />
              </div>

              <select
                className="form-select text-xs"
                style={{ width: 'auto', padding: '0.3rem 0.5rem' }}
                value={clauseFilter}
                onChange={(e) => setClauseFilter(e.target.value)}
              >
                {availableClauseTypes.map((t) => (
                  <option key={t} value={t}>
                    {t === 'ALL' ? 'All Types' : t.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {filteredClauses.length === 0 ? (
              <div className="empty-state">
                No clauses match the selected category or search filter.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {filteredClauses.map((clause, idx) => {
                  const clauseType = clause.clauseType || clause.type || 'Provision';
                  const clauseText = clause.clauseText || clause.text || '';
                  const pageNum = clause.page || null;
                  const section = clause.section || null;

                  return (
                    <div key={idx} className="clause-item-card">
                      <div className="flex-center justify-between mb-2">
                        <div className="flex-center gap-2">
                          <span className="badge badge-neutral" style={{ fontWeight: 700 }}>
                            {clauseType.toUpperCase()}
                          </span>
                          {pageNum && (
                            <span className="badge badge-neutral text-mono" style={{ fontSize: '10px' }}>
                              PAGE {pageNum}
                            </span>
                          )}
                          {section && (
                            <span className="text-xs text-mono muted">
                              {section}
                            </span>
                          )}
                        </div>

                        <div className="flex-center gap-2">
                          {getConfidenceBadge(clause.confidence)}
                          <button
                            className="btn btn-secondary btn-xs flex-center gap-1"
                            onClick={() =>
                              onSelectEvidence({
                                page: pageNum,
                                section,
                                text: clauseText,
                                clauseId: clause._id || idx,
                              })
                            }
                            title="Navigate directly to source passage in document viewer"
                          >
                            <ExternalLink size={11} />
                            <span>Jump to Source</span>
                          </button>
                        </div>
                      </div>

                      <div className="source-verbatim-box">
                        "{clauseText}"
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Section 3: Risk Findings */}
        {(activeTab === 'risk' || activeTab === 'all') && (
          <div className="mb-6" id="intel-section-risk">
            <div className="flex-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex-center gap-2">
                <ShieldAlert size={15} color="var(--color-primary)" />
                <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  3. Risk Findings ({flaggedClauses.length})
                </h4>
              </div>
              <span className="badge badge-neutral text-mono">STATUTORY AUDIT</span>
            </div>

            {/* Scorecard Gauge Banner */}
            <div className="risk-score-card mb-4" style={{ padding: '1rem' }}>
              <div className={`risk-circle-badge ${overallRiskScore >= 75 ? 'risk-bg-critical' : overallRiskScore >= 50 ? 'risk-bg-high' : overallRiskScore >= 25 ? 'risk-bg-medium' : 'risk-bg-low'}`}>
                <span className="score-val">{overallRiskScore}</span>
                <span className="score-label">/ 100</span>
              </div>
              <div style={{ flex: 1 }}>
                <div className="flex-center gap-2">
                  {getSeverityBadge(overallRiskLevel)}
                  <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                    {overallRiskLevel.toUpperCase()} RISK EXPOSURE
                  </span>
                </div>
                <p className="text-xs muted" style={{ margin: '0.3rem 0 0', lineHeight: '1.5' }}>
                  Statutory severity calibrated against liability caps, indemnification scopes, and termination restrictions.
                </p>
              </div>
            </div>

            {/* Severity Filter Pills */}
            <div className="flex gap-1 mb-3">
              {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
                <button
                  key={sev}
                  className={`workspace-layout-btn ${riskSeverityFilter === sev ? 'active' : ''}`}
                  onClick={() => setRiskSeverityFilter(sev)}
                >
                  {sev}
                </button>
              ))}
            </div>

            {filteredRiskFindings.length === 0 ? (
              <div className="alert alert-success flex-center gap-2">
                <CheckCircle2 size={15} />
                <span>No flagged provisions found for this risk tier.</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {filteredRiskFindings.map((finding, idx) => {
                  const severity = finding.riskLevel || finding.severity || 'low';
                  const category = finding.clauseType || finding.category || 'General';
                  const pageNum = finding.page || finding.page_number || null;
                  const section = finding.section || null;
                  const clauseText = finding.clauseText || finding.text || '';
                  const explanation = finding.reason || finding.explanation || finding.description || '';
                  const recommendation = finding.suggestion || finding.recommendation || '';

                  return (
                    <div key={idx} className={`finding-card severity-${severity.toLowerCase()}`}>
                      <div className="flex-center justify-between mb-2">
                        <div className="flex-center gap-2">
                          {getSeverityBadge(severity)}
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {category.toUpperCase()}
                          </span>
                          {pageNum && (
                            <span className="badge badge-neutral text-mono" style={{ fontSize: '10px' }}>
                              PAGE {pageNum}
                            </span>
                          )}
                          {section && (
                            <span className="text-xs text-mono muted">{section}</span>
                          )}
                        </div>

                        {clauseText && (
                          <button
                            className="btn btn-secondary btn-xs flex-center gap-1"
                            onClick={() =>
                              onSelectEvidence({
                                page: pageNum,
                                section,
                                text: clauseText,
                                id: finding._id || idx,
                              })
                            }
                            title="Jump to flagged excerpt in document"
                          >
                            <ExternalLink size={11} />
                            <span>Locate Evidence</span>
                          </button>
                        )}
                      </div>

                      {/* Explanation */}
                      {explanation && (
                        <div className="text-sm mb-2" style={{ color: 'var(--color-text)', lineHeight: '1.5' }}>
                          <strong>Analysis:</strong> {explanation}
                        </div>
                      )}

                      {/* Verbatim Source Quote */}
                      {clauseText && (
                        <div>
                          <span className="text-xs text-mono muted">Flagged Source Text:</span>
                          <div className="source-verbatim-box" style={{ fontSize: '0.85rem', margin: '0.25rem 0' }}>
                            "{clauseText}"
                          </div>
                        </div>
                      )}

                      {/* Recommendation if present */}
                      {recommendation && (
                        <div className="mt-2 text-xs flex gap-1" style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                          <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                          <span>Guidance: {recommendation}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Section 4: Obligations */}
        {(activeTab === 'obligations' || activeTab === 'all') && (
          <div className="mb-6" id="intel-section-obligations">
            <div className="flex-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex-center gap-2">
                <FileCheck size={15} color="var(--color-primary)" />
                <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  4. Affirmative Obligations &amp; Deadlines
                </h4>
              </div>
              <span className="badge badge-neutral text-mono">OBLIGATION INTELLIGENCE</span>
            </div>

            <ContractObligationsTimeline
              documentId={document?._id}
              documentName={document?.originalName}
              onSelectEvidence={onSelectEvidence}
              initialFilter={activeTab === 'obligations' ? 'AFFIRMATIVE_OBLIGATION' : 'ALL'}
            />
          </div>
        )}

        {/* Section 5: Important Dates */}
        {activeTab === 'dates' && (
          <div className="mb-6" id="intel-section-dates">
            <div className="flex-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex-center gap-2">
                <Calendar size={15} color="var(--color-primary)" />
                <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  5. Contract Timeline &amp; Key Milestones
                </h4>
              </div>
              <span className="badge badge-neutral text-mono">TEMPORAL TIMELINE</span>
            </div>

            <ContractObligationsTimeline
              documentId={document?._id}
              documentName={document?.originalName}
              onSelectEvidence={onSelectEvidence}
              initialFilter="ALL"
            />
          </div>
        )}

        {/* Section 6: Parties and Entities */}
        {(activeTab === 'parties' || activeTab === 'all') && (
          <div className="mb-6" id="intel-section-parties">
            <div className="flex-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex-center gap-2">
                <Users size={15} color="var(--color-primary)" />
                <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  6. Contracting Parties &amp; Recognized Entities ({parties.length + entities.length})
                </h4>
              </div>
              <span className="badge badge-neutral text-mono">ENTITY RECOGNITION</span>
            </div>

            {/* Identified Contracting Parties */}
            {parties.length > 0 ? (
              <div className="mb-4">
                <h5
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-secondary)',
                    margin: '0 0 0.5rem',
                  }}
                >
                  Identified Contracting Parties
                </h5>
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {parties.map((p, idx) => {
                    const name = typeof p === 'string' ? p : p.name || 'Unnamed Party';
                    const role = typeof p === 'object' ? p.role : null;
                    const page = typeof p === 'object' ? p.page : null;

                    return (
                      <div
                        key={idx}
                        className="flex-center justify-between"
                        style={{
                          background: 'var(--color-surface-2)',
                          border: '1px solid var(--color-border)',
                          padding: '0.5rem 0.75rem',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <div className="flex-center gap-2">
                          <Users size={14} color="var(--color-text-secondary)" />
                          <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{name}</span>
                        </div>
                        <div className="flex-center gap-2">
                          {role && <span className="badge badge-neutral">{role}</span>}
                          {page && <span className="text-xs text-mono muted">Page {page}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Named Entities Tags */}
            {entities.length > 0 ? (
              <div>
                <h5
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-text-secondary)',
                    margin: '0 0 0.5rem',
                  }}
                >
                  Extracted Named Entities
                </h5>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {entities.map((ent, idx) => {
                    const text = ent.text || ent.name || '';
                    const label = ent.label || ent.type || 'ENTITY';
                    return (
                      <span
                        key={idx}
                        className="badge badge-neutral flex-center gap-1"
                        style={{ padding: '0.35rem 0.6rem' }}
                      >
                        <span className="text-mono" style={{ opacity: 0.7, fontSize: '9px' }}>
                          [{label}]
                        </span>
                        <span>{text}</span>
                        {ent.page && (
                          <span className="text-mono muted" style={{ fontSize: '9px' }}>
                            p.{ent.page}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {parties.length === 0 && entities.length === 0 && (
              <div className="empty-state">
                No distinct legal entities or corporate parties detected.
              </div>
            )}
          </div>
        )}

        {/* Section 7: Recommendations */}
        {(activeTab === 'recommendations' || activeTab === 'all') && (
          <div className="mb-6" id="intel-section-recommendations">
            <div className="flex-center justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex-center gap-2">
                <Lightbulb size={15} color="var(--color-primary)" />
                <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  7. Recommendations &amp; Redline Guidance ({recommendations.length})
                </h4>
              </div>
              <span className="badge badge-neutral text-mono">REDLINE COUNSEL</span>
            </div>

            {recommendations.length === 0 ? (
              <div className="alert alert-success flex-center gap-2">
                <CheckCircle2 size={15} />
                <span>No redline amendments recommended for current risk baseline.</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {recommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className="clause-item-card"
                    style={{ borderLeft: '3px solid var(--color-primary)' }}
                  >
                    <div className="flex-center justify-between mb-2">
                      <div className="flex-center gap-2">
                        {getSeverityBadge(rec.riskLevel)}
                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                          {rec.clauseType.toUpperCase()}
                        </span>
                        {rec.page && (
                          <span className="badge badge-neutral text-mono" style={{ fontSize: '10px' }}>
                            PAGE {rec.page}
                          </span>
                        )}
                      </div>

                      {rec.clauseText && (
                        <button
                          className="btn btn-secondary btn-xs flex-center gap-1"
                          onClick={() =>
                            onSelectEvidence({
                              page: rec.page,
                              section: rec.section,
                              text: rec.clauseText,
                              id: rec.id,
                            })
                          }
                        >
                          <ExternalLink size={11} />
                          <span>Review Source</span>
                        </button>
                      )}
                    </div>

                    {/* Proposed Redline Guidance */}
                    <div
                      className="text-sm p-3 mb-2"
                      style={{
                        background: 'var(--color-surface-2)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        lineHeight: '1.5',
                      }}
                    >
                      <div className="flex-center gap-1 text-xs mb-1" style={{ color: 'var(--color-text)', fontWeight: 700 }}>
                        <Lightbulb size={12} />
                        <span>Proposed Redline / Mitigation:</span>
                      </div>
                      <div>{rec.suggestion}</div>
                    </div>

                    {/* Verbatim Existing Clause */}
                    {rec.clauseText && (
                      <div>
                        <span className="text-xs text-mono muted">Original Clause Text:</span>
                        <div className="source-verbatim-box" style={{ fontSize: '0.85rem', margin: '0.2rem 0' }}>
                          "{rec.clauseText}"
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
