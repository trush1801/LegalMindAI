import { CheckCircle2, FileCode, Sparkles } from 'lucide-react';

export default function SummaryPanel({ summaryData }) {
  if (!summaryData) {
    return (
      <div className="card" id="summary-section">
        <h2 className="card-title flex-center gap-2">
          <Sparkles size={18} color="var(--color-primary)" />
          <span>2. Executive Summary</span>
        </h2>
        <div className="empty-state" style={{ padding: '2rem 0' }}>
          Summary analysis is pending completion.
        </div>
      </div>
    );
  }

  const executiveSummary = summaryData.summary || summaryData.executiveSummary || 'No summary available.';
  const takeaways = summaryData.keyTakeaways || summaryData.takeaways || [];
  const structure = summaryData.structure || summaryData.documentStructure || [];

  return (
    <div className="card" id="summary-section">
      <div className="card-header">
        <h2 className="card-title flex-center gap-2">
          <Sparkles size={18} color="var(--color-primary)" />
          <span>2. Executive Summary</span>
        </h2>
        <span className="badge badge-neutral">AI SYNTHESIS</span>
      </div>

      <div
        className="text-sm"
        style={{
          lineHeight: '1.7',
          color: 'var(--color-text)',
          whiteSpace: 'pre-line',
          paddingBottom: '0.75rem',
          borderBottom: takeaways.length > 0 || structure.length > 0 ? '1px solid var(--color-border-subtle)' : 'none',
        }}
      >
        {executiveSummary}
      </div>

      {takeaways.length > 0 && (
        <div className="mt-4">
          <h3
            className="text-xs"
            style={{
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.65rem',
              color: 'var(--color-text)',
            }}
          >
            Key Provisions &amp; Core Takeaways
          </h3>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {takeaways.map((item, idx) => (
              <div
                key={idx}
                className="flex gap-2 text-sm"
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border-subtle)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <CheckCircle2
                  size={15}
                  color="var(--color-success)"
                  style={{ flexShrink: 0, marginTop: '2px' }}
                />
                <span>{typeof item === 'string' ? item : item.text || item.takeaway}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {structure.length > 0 && (
        <div className="mt-4">
          <h3
            className="text-xs"
            style={{
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.65rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            Contractual Hierarchy &amp; Sections
          </h3>
          <div className="grid-2">
            {structure.map((sec, idx) => (
              <div
                key={idx}
                className="flex-center gap-2 text-xs"
                style={{
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  padding: '0.45rem 0.65rem',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <FileCode size={13} color="var(--color-text-muted)" />
                <span style={{ fontWeight: 600 }}>
                  {sec.title || sec.section || `Section ${idx + 1}`}:
                </span>
                <span className="muted">{sec.description || sec.summary || 'Extracted section'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}