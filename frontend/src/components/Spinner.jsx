export default function Spinner({ label = 'Loading…' }) {
  return (
    <div className="loading-center">
      <div style={{ display: 'grid', gap: '0.75rem', justifyItems: 'center' }}>
        <div className="spinner" />
        <div className="text-sm muted">{label}</div>
      </div>
    </div>
  );
}