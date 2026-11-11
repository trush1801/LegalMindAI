import { Calendar, Clock } from 'lucide-react';

export default function DatesPanel({ dates = [] }) {
  if (!dates || dates.length === 0) {
    return (
      <div className="card" id="dates-section">
        <h2 className="card-title flex-center gap-2">
          <Calendar size={18} color="var(--color-primary)" />
          <span>5. Important Dates &amp; Compliance Milestones</span>
        </h2>
        <div className="empty-state">No specific dates or temporal milestones were detected in this agreement.</div>
      </div>
    );
  }

  return (
    <div className="card" id="dates-section">
      <div className="card-header">
        <h2 className="card-title flex-center gap-2">
          <Calendar size={18} color="var(--color-primary)" />
          <span>5. Critical Dates &amp; Compliance Milestones ({dates.length})</span>
        </h2>
        <span className="badge badge-neutral">NER EXTRACTION</span>
      </div>

      <div className="grid-2 mt-4">
        {dates.map((item, idx) => (
          <div
            key={idx}
            className="flex gap-3"
            style={{
              padding: '0.85rem',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-2)',
            }}
          >
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                color: 'var(--color-text)',
              }}
            >
              <Clock size={16} />
            </div>

            <div>
              <div className="flex-center gap-2">
                <span
                  className="text-mono"
                  style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text)' }}
                >
                  {item.date || item.text || 'Extracted Date'}
                </span>
                {item.type && <span className="badge badge-neutral">{item.type}</span>}
              </div>
              <p className="text-xs muted" style={{ margin: '0.3rem 0 0', lineHeight: '1.5' }}>
                {item.context || item.description || 'Context extracted from agreement text.'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}