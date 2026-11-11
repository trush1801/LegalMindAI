import { Link } from 'react-router-dom';
import { ArrowLeft, FileQuestion } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="page" style={{ display: 'grid', placeItems: 'center' }}>
      <div className="container" style={{ maxWidth: '520px', textAlign: 'center' }}>
        <div className="card" style={{ padding: '3rem 2rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 1.25rem',
            }}
          >
            <FileQuestion size={24} color="var(--color-text-secondary)" />
          </div>

          <span className="badge badge-neutral mb-2">ERROR 404</span>
          <h1 className="page-title mt-2" style={{ fontSize: '1.75rem' }}>
            Resource Not Located
          </h1>
          <p className="page-subtitle" style={{ margin: '0.5rem auto 1.5rem', maxWidth: '38ch' }}>
            The requested contract workspace or route does not exist or has been relocated within the repository.
          </p>

          <Link to="/dashboard" className="btn btn-primary flex-center gap-2" style={{ margin: '0 auto', width: 'fit-content' }}>
            <ArrowLeft size={15} />
            <span>Return to Workspace</span>
          </Link>
        </div>
      </div>
    </div>
  );
}