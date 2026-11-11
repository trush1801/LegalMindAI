import { BookOpen, CheckCircle, ShieldAlert, ShieldCheck } from 'lucide-react';

export default function RiskScorecard({ riskData }) {
  if (!riskData) {
    return (
      <div className="card" id="risk-section">
        <h2 className="card-title flex-center gap-2">
          <ShieldAlert size={18} color="var(--color-primary)" />
          <span>4. Risk Scorecard &amp; Findings</span>
        </h2>
        <div className="empty-state">Risk evaluation not available for this document.</div>
      </div>
    );
  }

  const score = riskData.overallScore ?? riskData.riskScore ?? 0;
  const riskLevel = (riskData.riskLevel || 'Low').toUpperCase();
  const findings = riskData.findings || riskData.riskFindings || [];
  const categoryScores = riskData.categoryScores || {};

  const getRiskBgClass = (s) => {
    if (s >= 75) return 'risk-bg-critical';
    if (s >= 50) return 'risk-bg-high';
    if (s >= 25) return 'risk-bg-medium';
    return 'risk-bg-low';
  };

  const getSeverityBadge = (sev) => {
    const s = (sev || 'LOW').toUpperCase();
    if (s === 'CRITICAL') return <span className="badge badge-critical">CRITICAL</span>;
    if (s === 'HIGH') return <span className="badge badge-danger">HIGH</span>;
    if (s === 'MEDIUM') return <span className="badge badge-warning">MEDIUM</span>;
    return <span className="badge badge-success">LOW</span>;
  };

  return (
    <div className="card" id="risk-section">
      <div className="card-header">
        <h2 className="card-title flex-center gap-2">
          <ShieldAlert size={18} color="var(--color-primary)" />
          <span>4. Risk Scorecard &amp; Statutory Analysis</span>
        </h2>
        <span className="badge badge-neutral">{findings.length} FINDINGS DETECTED</span>
      </div>

      {/* Top Gauge Tile */}
      <div className="risk-score-card mt-4">
        <div className={`risk-circle-badge ${getRiskBgClass(score)}`}>
          <span className="score-val">{score}</span>
          <span className="score-label">/ 100</span>
        </div>

        <div style={{ flex: 1 }}>
          <div className="flex-center gap-2">
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
              {riskLevel} RISK EVALUATION
            </h3>
          </div>
          <p className="text-sm muted" style={{ margin: '0.25rem 0 0', lineHeight: '1.5' }}>
            Calculated across statutory risk metrics including liability caps, indemnification provisions, termination triggers, and IP covenants.
          </p>
        </div>
      </div>

      {/* Category Breakdown */}
      {Object.keys(categoryScores).length > 0 && (
        <div className="mt-4">
          <h4
            className="text-xs"
            style={{
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: '0 0 0.65rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            Exposure by Legal Category
          </h4>
          <div className="grid-2">
            {Object.entries(categoryScores).map(([cat, catScore]) => (
              <div key={cat} className="category-bar-item">
                <div className="category-bar-header">
                  <span>{cat}</span>
                  <span>{catScore}/100</span>
                </div>
                <div className="category-bar-track">
                  <div
                    className={`category-bar-fill ${getRiskBgClass(catScore)}`}
                    style={{ width: `${Math.min(100, Math.max(5, catScore))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flagged Findings List */}
      <div className="mt-4">
        <h4
          className="text-xs"
          style={{
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: '0 0 0.65rem',
            color: 'var(--color-text)',
          }}
        >
          Flagged Contractual Provisions ({findings.length})
        </h4>

        {findings.length === 0 ? (
          <div className="alert alert-success flex-center gap-2">
            <CheckCircle size={15} />
            <span>No high-risk statutory violations or red-flag provisions identified.</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {findings.map((finding, idx) => (
              <div
                key={idx}
                className={`finding-card severity-${(finding.severity || 'low').toLowerCase()}`}
              >
                <div className="flex-center" style={{ justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <div className="flex-center gap-2">
                    {getSeverityBadge(finding.severity)}
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{finding.category}</span>
                  </div>
                  {finding.location && (
                    <span className="text-xs text-mono muted">Ref: {finding.location}</span>
                  )}
                </div>

                <div className="text-sm" style={{ fontWeight: 500, margin: '0.35rem 0' }}>
                  {finding.description}
                </div>

                {finding.clauseText && (
                  <div
                    className="text-xs"
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: '0.95rem',
                      fontStyle: 'italic',
                      background: 'var(--color-surface)',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      margin: '0.4rem 0',
                    }}
                  >
                    "{finding.clauseText}"
                  </div>
                )}

                {finding.statutoryCitation && (
                  <div className="text-xs flex-center gap-1 mt-2 text-mono" style={{ color: 'var(--color-text)', fontWeight: 600 }}>
                    <BookOpen size={12} />
                    <span>Statutory Precedent: {finding.statutoryCitation}</span>
                  </div>
                )}

                {finding.recommendation && (
                  <div className="text-xs flex-center gap-1 mt-2" style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                    <ShieldCheck size={12} />
                    <span>Recommended Redline: {finding.recommendation}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}