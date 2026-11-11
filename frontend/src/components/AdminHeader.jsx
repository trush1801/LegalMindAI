import { Activity, Menu, PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

function initials(name = '') {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'A';
}

const TAB_TITLES = {
  overview: 'Overview & Health',
  analytics: 'Platform Analytics',
  users: 'User Accounts',
  'audit-logs': 'Security & Audit Logs',
  documents: 'Documents Repository',
  pipeline: 'Analysis Pipeline',
  reports: 'Executive Reports',
  diagnostics: 'System Diagnostics',
  settings: 'Admin Settings',
};

export default function AdminHeader({
  collapsed,
  onToggleCollapse,
  onOpenMobile,
  currentTab,
  user,
  chainTesting,
  onRunDiagnostics,
  refreshing,
  onRefresh,
}) {
  const currentTitle = TAB_TITLES[currentTab] || 'Platform Administration';

  return (
    <header className="admin-top-header" role="banner">
      <div className="admin-top-header-left">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          className="admin-header-icon-btn mobile-only"
          onClick={onOpenMobile}
          aria-label="Open navigation menu"
          title="Open menu"
        >
          <Menu size={18} />
        </button>

        {/* Desktop Sidebar Collapse Toggle */}
        <button
          type="button"
          className="admin-header-icon-btn desktop-only"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
          title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>

        {/* Breadcrumb Path */}
        <nav className="admin-header-breadcrumbs" aria-label="Breadcrumb">
          <span className="breadcrumb-root">LegalMindAI</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-section">Administration</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{currentTitle}</span>
        </nav>
      </div>

      <div className="admin-top-header-right">
        {/* System Health Pill */}
        <div className="admin-header-status-pill" title="Gateway & Microservices Operational">
          <span className="status-dot online" />
          <span className="admin-header-status-text">CLUSTER ONLINE</span>
        </div>

        {/* Quick Diagnostics Action */}
        {onRunDiagnostics && (
          <button
            type="button"
            className="btn btn-secondary btn-sm flex-center gap-1 desktop-only"
            onClick={onRunDiagnostics}
            disabled={chainTesting}
            title="Dispatch 3-hop diagnostic chain probe"
          >
            <Activity size={13} className={chainTesting ? 'animate-spin' : ''} />
            <span>{chainTesting ? 'Testing…' : 'Diagnostics'}</span>
          </button>
        )}

        {/* Quick Refresh Action */}
        {onRefresh && (
          <button
            type="button"
            className="btn btn-secondary btn-sm flex-center gap-1 desktop-only"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh database records and cluster telemetry"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        )}

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Admin User Chip */}
        <div className="user-chip">
          <span className="user-avatar">{initials(user?.name)}</span>
          <span className="desktop-only">
            {user?.name || 'Admin'}
            <span className="muted text-xs"> · {user?.role || 'admin'}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
