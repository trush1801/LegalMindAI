import { useState } from 'react';
import { AlignLeft, CheckCircle2, Filter, Info, Search, Shield, XCircle } from 'lucide-react';

// Human-readable clause taxonomy labels — mirrors clause_service.py CLAUSE_TAXONOMY
const CLAUSE_LABELS = {
  payment:               'Payment Terms',
  confidentiality:       'Confidentiality',
  intellectual_property: 'Intellectual Property',
  liability:             'Limitation of Liability',
  indemnity:             'Indemnification',
  termination:           'Termination',
  dispute_resolution:    'Dispute Resolution',
  governing_law:         'Governing Law & Jurisdiction',
  warranties:            'Warranties & Disclaimers',
  data_protection:       'Data Protection & Security',
  force_majeure:         'Force Majeure',
  non_compete:           'Non-Compete / Non-Solicitation',
  assignment:            'Assignment',
  notice:                'Notice',
  deliverables:          'Deliverables',
  acceptance:            'Acceptance & Corrections',
  change_control:        'Change Control',
  independent_contractor:'Independent Contractor',
  purpose_scope:         'Purpose & Scope',
  schedule:              'Project Schedule / Timeline',
  client_responsibilities:'Client Responsibilities',
  entire_agreement:      'Entire Agreement',
  amendment:             'Amendment',
  severability:          'Severability',
  survival:              'Survival',
  audit_rights:          'Audit Rights',
  insurance:             'Insurance',
  exclusivity:           'Exclusivity',
  definition:            'Definitions',
  representation:        'Representations',
  general_provisions:    'General Provisions',
  other:                 'Other / Unclassified',
};

const SIGNIFICANCE_COLORS = {
  CRITICAL:      'var(--color-danger, #ef4444)',
  HIGH:          'var(--color-warning, #f59e0b)',
  MEDIUM:        'var(--color-primary, #3b82f6)',
  LOW:           'var(--color-success, #10b981)',
  INFORMATIONAL: 'var(--color-text-muted, #6b7280)',
};

function getClauseLabel(clause) {
  // Use clause_name from backend v2 if available
  if (clause.clauseName || clause.clause_name) return clause.clauseName || clause.clause_name;
  const rawType = clause.clauseType || clause.clause_type || clause.type || 'other';
  return CLAUSE_LABELS[rawType] || rawType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function getClauseType(clause) {
  return clause.clauseType || clause.clause_type || clause.type || 'other';
}

function getStatusBadge(status) {
  if (!status) return null;
  const s = String(status).toUpperCase();
  if (s === 'CONFIRMED')
    return <span className="badge badge-success" title="Classification confirmed by section heading">CONFIRMED</span>;
  if (s === 'PROBABLE')
    return <span className="badge badge-warning" title="Classification is probable based on content">PROBABLE</span>;
  if (s === 'UNCERTAIN')
    return <span className="badge badge-neutral" title="Classification is uncertain — review recommended">UNCERTAIN</span>;
  if (s === 'NEEDS_REVIEW')
    return <span className="badge badge-neutral" style={{ color: 'var(--color-danger)' }} title="Needs manual review">NEEDS REVIEW</span>;
  return null;
}

function getConfidenceBadge(conf) {
  const score = Math.round((conf || 0.85) * 100);
  if (score >= 80) return <span className="badge badge-success">{score}% MATCH</span>;
  if (score >= 60) return <span className="badge badge-warning">{score}% MATCH</span>;
  return <span className="badge badge-neutral">{score}% MATCH</span>;
}

export default function ClauseInspector({ clauses = [] }) {
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIdx, setExpandedIdx] = useState(null);

  // Build unique clause type list from actual data
  const clauseTypes = ['ALL', ...new Set(
    clauses.map((c) => getClauseType(c)).filter(Boolean)
  )];

  const filteredClauses = clauses.filter((clause) => {
    const rawType = getClauseType(clause);
    const typeMatch = filterType === 'ALL' || rawType === filterType;
    const clauseStatus = clause.classificationStatus || clause.classification_status || '';
    const statusMatch = filterStatus === 'ALL' || clauseStatus.toUpperCase() === filterStatus;
    const textMatch = !searchTerm ||
      (clause.text || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      getClauseLabel(clause).toLowerCase().includes(searchTerm.toLowerCase());
    return typeMatch && statusMatch && textMatch;
  });

  // Group confirmed vs others for display
  const confirmedCount = clauses.filter(
    (c) => (c.classificationStatus || c.classification_status || '').toUpperCase() === 'CONFIRMED'
  ).length;

  return (
    <div className="card" id="clauses-section">
      <div className="card-header">
        <h2 className="card-title flex-center gap-2">
          <AlignLeft size={18} color="var(--color-primary)" />
          <span>Key Contractual Clauses ({clauses.length})</span>
        </h2>
        <div className="flex-center gap-2">
          {confirmedCount > 0 && (
            <span className="badge badge-success" title="Clauses confirmed by section heading">
              <CheckCircle2 size={11} style={{ marginRight: 4 }} />
              {confirmedCount} CONFIRMED
            </span>
          )}
          <span className="badge badge-neutral">LEGAL-BERT NLP</span>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex gap-3 mt-4" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute', left: '10px', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--color-text-muted)',
            }}
          />
          <input
            className="form-input"
            style={{ paddingLeft: '32px' }}
            type="text"
            placeholder="Search within extracted clauses…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Type filter */}
        <div className="flex-center gap-2">
          <Filter size={14} color="var(--color-text-secondary)" />
          <select
            className="form-select"
            style={{ width: 'auto' }}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            {clauseTypes.map((t) => (
              <option key={t} value={t}>
                {t === 'ALL' ? 'All Clause Types' : (CLAUSE_LABELS[t] || t.replace(/_/g, ' '))}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div className="flex-center gap-2">
          <Shield size={14} color="var(--color-text-secondary)" />
          <select
            className="form-select"
            style={{ width: 'auto' }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PROBABLE">Probable</option>
            <option value="UNCERTAIN">Uncertain</option>
            <option value="NEEDS_REVIEW">Needs Review</option>
          </select>
        </div>
      </div>

      {filteredClauses.length === 0 ? (
        <div className="empty-state">No clauses match the current filter or search criteria.</div>
      ) : (
        <div style={{ display: 'grid', gap: '0.6rem', marginTop: '1rem' }}>
          {filteredClauses.map((clause, idx) => {
            const clauseLabel     = getClauseLabel(clause);
            const clauseType      = getClauseType(clause);
            const clauseStatus    = clause.classificationStatus || clause.classification_status;
            const clauseSection   = clause.section;
            const clauseSecTitle  = clause.sectionTitle || clause.section_title;
            const clauseSignif    = clause.legalSignificance || clause.legal_significance;
            const clauseRisks     = clause.associatedRisks || clause.associated_risks || [];
            const isExpanded      = expandedIdx === idx;

            return (
              <div key={idx} className="clause-item-card">
                {/* Header row */}
                <div
                  className="flex-center"
                  style={{ justifyContent: 'space-between', marginBottom: '0.4rem', cursor: 'pointer' }}
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                >
                  <div className="flex-center gap-2" style={{ flexWrap: 'wrap' }}>
                    <span className="badge badge-neutral" style={{ fontWeight: 700 }}>
                      {clauseLabel}
                    </span>
                    {clauseSection && (
                      <span className="text-xs text-mono muted">§{clauseSection}</span>
                    )}
                    {clause.page && (
                      <span className="text-xs text-mono muted">Page {clause.page}</span>
                    )}
                    {getStatusBadge(clauseStatus)}
                  </div>
                  <div className="flex-center gap-2">
                    {getConfidenceBadge(clause.confidence)}
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Legal significance bar */}
                {clauseSignif && clauseSignif !== 'INFORMATIONAL' && (
                  <div style={{ marginBottom: '0.35rem' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: SIGNIFICANCE_COLORS[clauseSignif] || 'var(--color-text-muted)',
                      }}
                    >
                      Legal Significance: {clauseSignif}
                    </span>
                    {clauseRisks.length > 0 && (
                      <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginLeft: '8px' }}>
                        Risk areas: {clauseRisks.join(', ')}
                      </span>
                    )}
                  </div>
                )}

                {/* Section title if available */}
                {clauseSecTitle && (
                  <div className="text-xs text-secondary" style={{ marginBottom: '0.3rem', fontStyle: 'italic' }}>
                    Section: "{clauseSecTitle}"
                  </div>
                )}

                {/* Clause text excerpt */}
                <div
                  className="text-sm"
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: '0.95rem',
                    fontStyle: 'italic',
                    color: 'var(--color-text)',
                    lineHeight: '1.55',
                    background: 'var(--color-surface-2)',
                    padding: '0.75rem 0.9rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border-subtle)',
                    maxHeight: isExpanded ? 'none' : '5.5rem',
                    overflow: 'hidden',
                  }}
                >
                  "{isExpanded ? clause.text : (clause.text || '').substring(0, 300)}{!isExpanded && clause.text?.length > 300 ? '…' : ''}"
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ marginTop: '0.5rem' }}>
                    {/* Summary */}
                    {clause.summary && (
                      <div className="text-xs text-secondary flex-center gap-1 mt-2">
                        <Info size={12} color="var(--color-primary)" />
                        <span>{clause.summary}</span>
                      </div>
                    )}

                    {/* Matched keywords */}
                    {(clause.matchedKeywords || clause.matched_keywords || []).length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                          Matched signals:{' '}
                          {(clause.matchedKeywords || clause.matched_keywords).slice(0, 8).map((kw, ki) => (
                            <code
                              key={ki}
                              style={{
                                fontSize: '10px',
                                background: 'var(--color-surface-2)',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                marginRight: '4px',
                              }}
                            >
                              {kw}
                            </code>
                          ))}
                        </span>
                      </div>
                    )}

                    {/* Detection method */}
                    <div style={{ marginTop: '0.4rem' }}>
                      <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                        Detection method: {clause.detectionMethod || clause.detection_method || 'N/A'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
