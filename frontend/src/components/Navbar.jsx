import { NavLink, useNavigate } from 'react-router-dom';
import { FileText, LayoutDashboard, LogOut, MessageSquare, ScrollText, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

function initials(name = '') {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'U';
}

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <NavLink to="/dashboard" className="navbar-brand">
          <span className="navbar-brand-mark">
            <Shield size={16} />
          </span>
          <span>LegalMind AI</span>
        </NavLink>

        <nav className="navbar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <LayoutDashboard size={15} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/documents" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <FileText size={15} />
            <span>Documents</span>
          </NavLink>
          <NavLink to="/reports" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <ScrollText size={15} />
            <span>Reports</span>
          </NavLink>
          <NavLink to="/chat" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <MessageSquare size={15} />
            <span>AI Chat</span>
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Shield size={15} />
              <span>Admin</span>
            </NavLink>
          )}
        </nav>

        <div className="navbar-right">
          <ThemeToggle />

          <div className="user-chip">
            <span className="user-avatar">{initials(user?.name)}</span>
            <span>
              {user?.name || 'User'}
              {user?.role ? (
                <span className="muted text-xs"> · {user.role}</span>
              ) : null}
            </span>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleLogout}
            title="Sign out of workspace"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}