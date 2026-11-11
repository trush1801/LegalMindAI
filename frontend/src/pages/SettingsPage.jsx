import { useState } from 'react';
import {
  User,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Moon,
  Sun,
  Layout,
  Server,
  Trash2,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { authAPI } from '../services/api';
import '../styles/dashboard.css';

export default function SettingsPage() {
  const { user, updateUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Profile Form state
  const [name, setName] = useState(user?.name || '');
  const [preferredLanguage, setPreferredLanguage] = useState(user?.preferredLanguage || 'english');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(null);
  const [profileError, setProfileError] = useState(null);

  // Security Form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(null);
  const [passwordError, setPasswordError] = useState(null);

  // Account Deletion state (U04)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Workspace Preferences state
  const [defaultSplitRatio, setDefaultSplitRatio] = useState(() => {
    try {
      return localStorage.getItem('legalmind_default_split_ratio') || '50/50';
    } catch {
      return '50/50';
    }
  });

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      setProfileSaving(true);
      setProfileError(null);
      setProfileSuccess(null);

      const res = await authAPI.updateProfile({ name, preferredLanguage });
      if (res.data?.user) {
        updateUser(res.data.user);
      } else {
        updateUser({ name, preferredLanguage });
      }
      setProfileSuccess('Profile information updated successfully.');
    } catch (err) {
      console.error('Update profile error:', err);
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    try {
      setPasswordSaving(true);
      setPasswordError(null);
      setPasswordSuccess(null);

      await authAPI.changePassword({ currentPassword, newPassword });
      setPasswordSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Change password error:', err);
      setPasswordError(err.message || 'Failed to change password. Verify your current password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSplitRatioChange = (ratio) => {
    setDefaultSplitRatio(ratio);
    try {
      localStorage.setItem('legalmind_default_split_ratio', ratio);
    } catch {
      // ignore
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Please type "DELETE" in capital letters to confirm.');
      return;
    }
    if (!deletePassword) {
      setDeleteError('Your current password is required to verify identity.');
      return;
    }

    try {
      setDeleteLoading(true);
      setDeleteError(null);

      const res = await authAPI.deleteAccount({
        password: deletePassword,
        confirmationText: deleteConfirmText,
      });

      alert(res.data?.message || 'Your account and all associated documents, vector indexes, and analyses have been permanently purged.');
      logout();
      window.location.href = '/login';
    } catch (err) {
      console.error('Account deletion error:', err);
      setDeleteError(err.message || err.data?.error?.message || 'Failed to delete account.');
      setDeleteLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="container">
        {/* Header */}
        <div className="page-header">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge badge-neutral" style={{ letterSpacing: '0.08em' }}>USER GOVERNANCE</span>
            </div>
            <h1 className="page-title">My Settings & Workspace Preferences</h1>
            <p className="page-subtitle">
              Manage your profile credentials, secure account credentials, and customize your contract intelligence workspace.
            </p>
          </div>
        </div>

        <div className="grid-2 gap-4">
          {/* Left Column: Account Profile & Security */}
          <div className="flex flex-col gap-4">
            {/* Account Profile Card */}
            <div className="card" style={{ padding: 'var(--space-5)' }}>
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-subtle">
                <User size={18} color="var(--color-primary)" />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Account Profile</h2>
              </div>

              {profileSuccess && (
                <div className="alert alert-success mb-4 flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{profileSuccess}</span>
                </div>
              )}

              {profileError && (
                <div className="alert alert-danger mb-4 flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{profileError}</span>
                </div>
              )}

              <form onSubmit={handleUpdateProfile}>
                <div className="form-group mb-3">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group mb-3">
                  <label className="form-label">Email Address (Managed Identity)</label>
                  <input
                    type="email"
                    className="form-input"
                    value={user?.email || ''}
                    disabled
                    style={{ opacity: 0.7, cursor: 'not-allowed' }}
                  />
                  <div className="form-hint">Email address is tied to your tenant authentication credential.</div>
                </div>

                <div className="form-group mb-4">
                  <label className="form-label">Preferred Analysis Language</label>
                  <select
                    className="form-input"
                    value={preferredLanguage}
                    onChange={(e) => setPreferredLanguage(e.target.value)}
                  >
                    <option value="english">English (Default)</option>
                    <option value="hindi">Hindi (हिंदी)</option>
                    <option value="gujarati">Gujarati (ગુજરાતી)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-subtle">
                  <div className="text-xs muted text-mono">
                    Role: <strong style={{ textTransform: 'uppercase' }}>{user?.role || 'normal_user'}</strong>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={profileSaving}>
                    {profileSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>

            {/* Account Security / Password Card */}
            <div className="card" style={{ padding: 'var(--space-5)' }}>
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-subtle">
                <KeyRound size={18} color="var(--color-primary)" />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Security & Authentication</h2>
              </div>

              {passwordSuccess && (
                <div className="alert alert-success mb-4 flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              {passwordError && (
                <div className="alert alert-danger mb-4 flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{passwordError}</span>
                </div>
              )}

              <form onSubmit={handleChangePassword}>
                <div className="form-group mb-3">
                  <label className="form-label">Current Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group mb-3">
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  <div className="form-hint">Minimum 8 characters with letters and numbers.</div>
                </div>

                <div className="form-group mb-4">
                  <label className="form-label">Confirm New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>

                <div className="flex justify-end pt-3 border-t border-subtle">
                  <button type="submit" className="btn btn-secondary" disabled={passwordSaving}>
                    {passwordSaving ? 'Updating…' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>

            {/* Danger Zone: Account Deletion & Cascading Purge (U04) */}
            <div className="card" style={{ padding: 'var(--space-5)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-subtle">
                <Trash2 size={18} color="var(--color-danger, #ef4444)" />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-danger, #ef4444)' }}>
                  Data Privacy &amp; Account Deletion
                </h2>
              </div>

              <p className="text-sm text-secondary mb-3">
                Permanently purge your account, uploaded legal agreements, clause analysis findings, FAISS vector embeddings, and chat histories. This action is irreversible.
              </p>

              <div className="card mb-4" style={{ background: 'var(--color-surface-2)', padding: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                <div className="flex items-start gap-2">
                  <Info size={15} className="mt-0.5 flex-shrink-0" color="var(--color-text-secondary)" />
                  <div className="text-secondary">
                    <strong>Honest Retention Notice:</strong> Customer document payloads, PDF reports, and FAISS vector indices are permanently removed from filesystem storage and MongoDB immediately. Anonymized operational audit events are retained strictly for regulatory security compliance.
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-xs text-muted">Irreversible cascading asset purge</span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm flex items-center gap-2"
                  style={{ color: 'var(--color-danger, #ef4444)', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                  onClick={() => {
                    setDeleteError(null);
                    setDeletePassword('');
                    setDeleteConfirmText('');
                    setIsDeleteModalOpen(true);
                  }}
                >
                  <Trash2 size={14} />
                  <span>Delete Account &amp; Purge Data</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Preferences & Environment Telemetry */}
          <div className="flex flex-col gap-4">
            {/* Workspace Display Preferences */}
            <div className="card" style={{ padding: 'var(--space-5)' }}>
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-subtle">
                <Layout size={18} color="var(--color-primary)" />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Workspace Display</h2>
              </div>

              {/* Theme Toggle */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-subtle">
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Color Theme</div>
                  <div className="form-hint">Switch between Option D Light and Dark Mode palettes.</div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary flex items-center gap-2"
                  onClick={toggleTheme}
                >
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                  <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
              </div>

              {/* Default Split Pane Ratio */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: '0.25rem' }}>
                  Default Document Analysis Ratio
                </div>
                <div className="form-hint mb-3">
                  Default split between Original Document Viewer and Intelligence Findings pane.
                </div>
                <div className="flex gap-2">
                  {['50/50', '40/60', '60/40'].map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      className={`btn btn-sm ${defaultSplitRatio === ratio ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => handleSplitRatioChange(ratio)}
                    >
                      {ratio} Ratio
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tenant & Session Telemetry */}
            <div className="card" style={{ padding: 'var(--space-5)' }}>
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-subtle">
                <Server size={18} color="var(--color-primary)" />
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Tenant Telemetry</h2>
              </div>

              <div className="flex flex-col gap-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-subtle">
                  <span className="muted">Tenant Organization</span>
                  <span className="text-mono" style={{ fontWeight: 600 }}>LegalMind AI Enterprise</span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-subtle">
                  <span className="muted">User Account ID</span>
                  <span className="text-mono muted">{user?._id || user?.id || '6ac...'}</span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-subtle">
                  <span className="muted">Account Creation</span>
                  <span className="text-mono">
                    {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Active'}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-subtle">
                  <span className="muted">AI Microservice (FastAPI)</span>
                  <span className="badge badge-success text-xs">Port 8000 Active</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="muted">Backend API Gateway (Express)</span>
                  <span className="badge badge-success text-xs">Port 5001 Active</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal: Permanent Account Deletion Confirmation (U04) */}
        {isDeleteModalOpen && (
          <div
            className="modal-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(3px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '1rem',
            }}
          >
            <div
              className="card"
              role="dialog"
              aria-modal="true"
              style={{
                width: '100%',
                maxWidth: '480px',
                padding: 'var(--space-6)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <ShieldAlert size={24} color="var(--color-danger, #ef4444)" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--color-text)' }}>
                  Confirm Permanent Deletion
                </h3>
              </div>

              <p className="text-sm text-secondary mb-3">
                This will immediately delete your account credentials, all uploaded contracts, analysis findings, and semantic vector embeddings. <strong>This cannot be undone.</strong>
              </p>

              {deleteError && (
                <div className="alert alert-danger mb-4 flex items-center gap-2 text-xs">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              <form onSubmit={handleDeleteAccount}>
                <div className="form-group mb-3">
                  <label className="form-label text-xs">
                    Current Password <span style={{ color: 'var(--color-danger, #ef4444)' }}>*</span>
                  </label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter your current password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    required
                    disabled={deleteLoading}
                  />
                </div>

                <div className="form-group mb-4">
                  <label className="form-label text-xs">
                    Type <strong>DELETE</strong> in all-caps to confirm <span style={{ color: 'var(--color-danger, #ef4444)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input text-mono"
                    placeholder="DELETE"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    required
                    disabled={deleteLoading}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-subtle">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsDeleteModalOpen(false)}
                    disabled={deleteLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ background: 'var(--color-danger, #ef4444)', borderColor: 'var(--color-danger, #ef4444)' }}
                    disabled={deleteLoading || deleteConfirmText !== 'DELETE' || !deletePassword}
                  >
                    {deleteLoading ? 'Purging All Assets…' : 'Permanently Delete Everything'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
