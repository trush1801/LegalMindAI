import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ScrollText,
  Settings,
  Shield,
  X,
} from 'lucide-react';

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

export default function AppSidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  user,
  isAdmin,
  onLogout,
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const workspaceNavItems = [
    {
      id: 'dashboard',
      path: '/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'documents',
      path: '/documents',
      label: 'Documents',
      icon: FileText,
      // Matches both /documents and /documents/:id
      match: (p) => p === '/documents' || p.startsWith('/documents/'),
    },
    {
      id: 'obligations',
      path: '/obligations',
      label: 'Obligations & Deadlines',
      icon: CalendarClock,
    },
    {
      id: 'saved-findings',
      path: '/saved-findings',
      label: 'Saved Findings',
      icon: Bookmark,
    },
    {
      id: 'reports',
      path: '/reports',
      label: 'Reports',
      icon: ScrollText,
    },
    {
      id: 'chat',
      path: '/chat',
      label: 'AI Chat',
      icon: MessageSquare,
    },
  ];

  const preferenceNavItems = [
    {
      id: 'settings',
      path: '/settings',
      label: 'My Settings',
      icon: Settings,
    },
  ];

  const handleNavClick = (path) => {
    navigate(path);
    if (mobileOpen) {
      onCloseMobile();
    }
  };

  const isItemActive = (item) => {
    if (item.match) return item.match(location.pathname);
    return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="app-sidebar-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`app-sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}
        aria-label="Workspace Navigation"
      >
        {/* Brand Header */}
        <div className="app-sidebar-header">
          <div
            className="app-sidebar-brand"
            onClick={() => {
              if (collapsed) {
                onToggleCollapse();
              } else {
                handleNavClick('/dashboard');
              }
            }}
            title={collapsed ? 'Click to expand sidebar' : 'LegalMind AI'}
          >
            <span className="navbar-brand-mark" title="LegalMind AI">
              <Shield size={16} />
            </span>
            {!collapsed && (
              <div className="app-sidebar-brand-text">
                <span className="app-sidebar-brand-title">LegalMind AI</span>
                <span className="app-sidebar-brand-tag">LEGAL WORKSPACE</span>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            className="app-sidebar-toggle-btn desktop-only"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {/* Mobile Close Button */}
          <button
            type="button"
            className="app-sidebar-toggle-btn mobile-only"
            onClick={onCloseMobile}
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation Body */}
        <div className="app-sidebar-body">
          {/* Main Workspace Section */}
          <div className="app-sidebar-section">
            {!collapsed && (
              <div className="app-sidebar-section-title">WORKSPACE</div>
            )}
            <nav className="app-sidebar-nav">
              {workspaceNavItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`app-sidebar-item${active ? ' active' : ''}`}
                    onClick={() => handleNavClick(item.path)}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="app-sidebar-item-icon">
                      <Icon size={16} />
                    </span>
                    {!collapsed && (
                      <span className="app-sidebar-item-label">{item.label}</span>
                    )}
                    {active && <span className="app-sidebar-active-indicator" />}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Preferences Section */}
          <div className="app-sidebar-section">
            {!collapsed && (
              <div className="app-sidebar-section-title">PREFERENCES</div>
            )}
            <nav className="app-sidebar-nav">
              {preferenceNavItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`app-sidebar-item${active ? ' active' : ''}`}
                    onClick={() => handleNavClick(item.path)}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="app-sidebar-item-icon">
                      <Icon size={16} />
                    </span>
                    {!collapsed && (
                      <span className="app-sidebar-item-label">{item.label}</span>
                    )}
                    {active && <span className="app-sidebar-active-indicator" />}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Administration Section (Role Guarded) */}
          {isAdmin && (
            <div className="app-sidebar-section mt-auto">
              {!collapsed && (
                <div className="app-sidebar-section-title">ADMINISTRATION</div>
              )}
              <nav className="app-sidebar-nav">
                <button
                  type="button"
                  className={`app-sidebar-item${location.pathname.startsWith('/admin') ? ' active' : ''}`}
                  onClick={() => handleNavClick('/admin')}
                  title={collapsed ? 'Admin Panel' : undefined}
                >
                  <span className="app-sidebar-item-icon">
                    <Shield size={16} />
                  </span>
                  {!collapsed && (
                    <span className="app-sidebar-item-label">Admin Panel</span>
                  )}
                  {!collapsed && (
                    <span className="app-sidebar-item-badge">ADMIN</span>
                  )}
                  {location.pathname.startsWith('/admin') && (
                    <span className="app-sidebar-active-indicator" />
                  )}
                </button>
              </nav>
            </div>
          )}
        </div>

        {/* Profile Footer */}
        <div className="app-sidebar-footer">
          <div className="app-sidebar-user">
            <span className="user-avatar" title={user?.name || 'User'}>
              {initials(user?.name)}
            </span>
            {!collapsed && (
              <div className="app-sidebar-user-info">
                <span className="app-sidebar-user-name">{user?.name || 'User'}</span>
                <span className="app-sidebar-user-role">
                  {user?.role?.toUpperCase() || 'ANALYST'}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="app-sidebar-logout-btn"
            onClick={onLogout}
            title="Sign out of workspace"
            aria-label="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </aside>
    </>
  );
}
