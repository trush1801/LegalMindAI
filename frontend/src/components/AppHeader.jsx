import { useLocation } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

function initials(name = '') {
  return (
    (name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'U'
  );
}

function getWorkspaceTitle(pathname) {
  if (pathname === '/dashboard') return 'Dashboard';
  if (pathname === '/documents') return 'Documents Repository';
  if (pathname.startsWith('/documents/')) return 'Document Analysis';
  if (pathname === '/reports') return 'Executive Reports';
  if (pathname === '/chat') return 'AI Research Chat';
  return 'Workspace';
}

export default function AppHeader({
  collapsed,
  onToggleCollapse,
  onOpenMobile,
  user,
}) {
  const location = useLocation();
  const currentTitle = getWorkspaceTitle(location.pathname);

  return (
    <header className="app-top-header" role="banner">
      <div className="app-top-header-left">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          className="app-header-icon-btn mobile-only"
          onClick={onOpenMobile}
          aria-label="Open navigation menu"
          title="Open menu"
        >
          <Menu size={18} />
        </button>

        {/* Desktop Sidebar Collapse Toggle */}
        <button
          type="button"
          className="app-header-icon-btn desktop-only"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
          title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>

        {/* Breadcrumb Path */}
        <nav className="app-header-breadcrumbs" aria-label="Breadcrumb">
          <span className="breadcrumb-root">LegalMindAI</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-section">Workspace</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{currentTitle}</span>
        </nav>
      </div>

      <div className="app-top-header-right">
        {/* Status Pill */}
        <div className="app-header-status-pill" title="Workspace active and connected">
          <span className="status-dot online" />
          <span>WORKSPACE ACTIVE</span>
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* User Chip */}
        <div className="user-chip">
          <span className="user-avatar">{initials(user?.name)}</span>
          <span className="desktop-only">
            {user?.name || 'User'}
            <span className="muted text-xs"> · {user?.role || 'analyst'}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
