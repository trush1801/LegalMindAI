import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';

function initials(name = '') {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'A';
}

export default function AdminSidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  currentTab,
  onSelectTab,
  stats,
  user,
  onLogout,
}) {
  const navigate = useNavigate();

  const navItems = [
    {
      id: 'overview',
      label: 'Overview & Health',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
      badge: null,
    },
    {
      id: 'users',
      label: 'User Accounts',
      icon: Users,
      badge: stats?.users?.total,
    },
    {
      id: 'audit-logs',
      label: 'Security & Audit Logs',
      icon: History,
      badge: null,
    },
    {
      id: 'documents',
      label: 'Documents Repository',
      icon: FileText,
      badge: stats?.documents?.total,
    },
    {
      id: 'pipeline',
      label: 'Analysis Pipeline',
      icon: Cpu,
      badge: null,
    },
    {
      id: 'reports',
      label: 'Executive Reports',
      icon: ScrollText,
      badge: stats?.reports?.total,
    },
    {
      id: 'diagnostics',
      label: 'System Diagnostics',
      icon: Activity,
      badge: null,
    },
    {
      id: 'settings',
      label: 'Admin Settings',
      icon: Settings,
      badge: null,
    },
  ];

  const handleNavClick = (tabId) => {
    onSelectTab(tabId);
    if (mobileOpen) {
      onCloseMobile();
    }
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`admin-sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}
        aria-label="Admin Navigation"
      >
        {/* Brand Header */}
        <div className="admin-sidebar-header">
          <div
            className="admin-sidebar-brand"
            onClick={() => {
              if (collapsed) {
                onToggleCollapse();
              } else {
                handleNavClick('overview');
              }
            }}
            title={collapsed ? 'Click to expand sidebar' : 'LegalMind AI'}
          >
            <span className="navbar-brand-mark" title="LegalMind AI">
              <Shield size={16} />
            </span>
            {!collapsed && (
              <div className="admin-sidebar-brand-text">
                <span className="admin-sidebar-brand-title">LegalMind AI</span>
                <span className="admin-sidebar-brand-tag">ADMIN WORKSPACE</span>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            className="admin-sidebar-toggle-btn desktop-only"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>

          {/* Mobile Close Button */}
          <button
            type="button"
            className="admin-sidebar-toggle-btn mobile-only"
            onClick={onCloseMobile}
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation Body */}
        <div className="admin-sidebar-body">
          {/* Main Administration Section */}
          <div className="admin-sidebar-section">
            {!collapsed && (
              <div className="admin-sidebar-section-title">ADMINISTRATION</div>
            )}
            <nav className="admin-sidebar-nav">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-sidebar-item${isActive ? ' active' : ''}`}
                    onClick={() => handleNavClick(item.id)}
                    title={collapsed ? `${item.label}${item.badge !== undefined && item.badge !== null ? ` (${item.badge})` : ''}` : undefined}
                  >
                    <span className="admin-sidebar-item-icon">
                      <Icon size={16} />
                    </span>
                    {!collapsed && (
                      <span className="admin-sidebar-item-label">{item.label}</span>
                    )}
                    {!collapsed && item.badge !== undefined && item.badge !== null && (
                      <span className="admin-sidebar-item-badge">{item.badge}</span>
                    )}
                    {isActive && <span className="admin-sidebar-active-indicator" />}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* User Workspace Quick Exit Section */}
          <div className="admin-sidebar-section mt-auto">
            {!collapsed && (
              <div className="admin-sidebar-section-title">WORKSPACES</div>
            )}
            <nav className="admin-sidebar-nav">
              <button
                type="button"
                className="admin-sidebar-item"
                onClick={() => navigate('/dashboard')}
                title={collapsed ? 'Return to Standard Workspace' : undefined}
              >
                <span className="admin-sidebar-item-icon">
                  <ArrowLeft size={16} />
                </span>
                {!collapsed && (
                  <span className="admin-sidebar-item-label">App Workspace</span>
                )}
              </button>
            </nav>
          </div>
        </div>

        {/* Profile Footer */}
        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-user">
            <span className="user-avatar" title={user?.name || 'Administrator'}>
              {initials(user?.name)}
            </span>
            {!collapsed && (
              <div className="admin-sidebar-user-info">
                <span className="admin-sidebar-user-name">{user?.name || 'Admin'}</span>
                <span className="admin-sidebar-user-role">
                  {user?.role?.toUpperCase() || 'ADMIN'}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="admin-sidebar-logout-btn"
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
