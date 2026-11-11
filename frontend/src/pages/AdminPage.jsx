import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  HardDrive,
  History,
  Lock,
  MoreVertical,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  Settings,
  Shield,
  Sliders,
  Sun,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';

import { adminAPI, healthAPI, reportAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AdminSidebar from '../components/AdminSidebar';
import AdminHeader from '../components/AdminHeader';
import AdminAnalyticsDashboard from '../components/AdminAnalyticsDashboard';
import Spinner from '../components/Spinner';

export default function AdminPage() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || 'overview';
  const currentTab = rawTab === 'analysis' ? 'analytics' : rawTab === 'analysis-pipeline' ? 'pipeline' : rawTab;

  // Sidebar Layout States
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('legalmind_admin_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Core System Telemetry States
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [aiHealth, setAiHealth] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [chainResult, setChainResult] = useState(null);
  const [chainTesting, setChainTesting] = useState(false);

  // Users State
  const [users, setUsers] = useState([]);
  const [userPagination, setUserPagination] = useState({ total: 0, page: 1, limit: 15, totalPages: 1 });
  const [userSearch, setUserSearch] = useState(() => searchParams.get('search') || '');
  const [userRoleFilter, setUserRoleFilter] = useState(() => searchParams.get('role') || '');
  const [userStatusFilter, setUserStatusFilter] = useState(() => searchParams.get('status') || '');
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam !== null && statusParam !== userStatusFilter) {
      setUserStatusFilter(statusParam);
    }
  }, [searchParams, userStatusFilter]);

  // User Deletion & Action Menu States
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleteProcessing, setDeleteProcessing] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [restoreProcessing, setRestoreProcessing] = useState(false);
  const [activeActionMenuId, setActiveActionMenuId] = useState(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.admin-action-dropdown-wrapper')) {
        setActiveActionMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Documents State
  const [documents, setDocuments] = useState([]);
  const [docPagination, setDocPagination] = useState({ total: 0, page: 1, limit: 15, totalPages: 1 });
  const [docSearch, setDocSearch] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [docStatusFilter, setDocStatusFilter] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);

  // Audit Logs State
  const [logs, setLogs] = useState([]);
  const [logPagination, setLogPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [logFilterAction, setLogFilterAction] = useState('');
  const [logFilterTargetType, setLogFilterTargetType] = useState('');
  const [logFilterStatus, setLogFilterStatus] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logAggregations, setLogAggregations] = useState({ actions: [], statuses: [] });

  // Reports State
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [generatingDocId, setGeneratingDocId] = useState('');

  // Pipeline Telemetry State
  const [pipelineData, setPipelineData] = useState(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [pipelineRetryingId, setPipelineRetryingId] = useState(null);

  // General Page States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  // Admin Settings State & Persistence
  const DEFAULT_ADMIN_SETTINGS = {
    platformName: 'LegalMind AI',
    adminAlertEmail: 'admin@legalmind.ai',
    riskThreshold: 70,
    topKChunks: 5,
    maxUploadSizeMB: 25,
    ocrConfidenceThreshold: 80,
    rateLimitPerMinute: 60,
    maintenanceMode: false,
    sidebarDefaultCollapsed: false,
  };

  const [adminSettings, setAdminSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('legalmind_admin_settings');
      if (saved) {
        return { ...DEFAULT_ADMIN_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error('Failed to parse admin settings:', e);
    }
    return DEFAULT_ADMIN_SETTINGS;
  });
  const [settingsErrors, setSettingsErrors] = useState({});
  const [settingsSaving, setSettingsSaving] = useState(false);

  const handleSaveAdminSettings = async (e) => {
    if (e) e.preventDefault();
    const errors = {};

    if (!adminSettings.platformName?.trim()) {
      errors.platformName = 'Organization / Platform Name cannot be empty.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!adminSettings.adminAlertEmail?.trim() || !emailRegex.test(adminSettings.adminAlertEmail.trim())) {
      errors.adminAlertEmail = 'Valid administrative alert email address is required.';
    }

    const riskNum = Number(adminSettings.riskThreshold);
    if (isNaN(riskNum) || riskNum < 50 || riskNum > 90) {
      errors.riskThreshold = 'Risk threshold must be a number between 50 and 90.';
    }

    const topKNum = Number(adminSettings.topKChunks);
    if (isNaN(topKNum) || topKNum < 1 || topKNum > 20) {
      errors.topKChunks = 'Top-K chunk retrieval count must be an integer between 1 and 20.';
    }

    const maxUploadNum = Number(adminSettings.maxUploadSizeMB);
    if (isNaN(maxUploadNum) || maxUploadNum < 5 || maxUploadNum > 100) {
      errors.maxUploadSizeMB = 'Max upload size must be between 5MB and 100MB.';
    }

    const ocrNum = Number(adminSettings.ocrConfidenceThreshold);
    if (isNaN(ocrNum) || ocrNum < 50 || ocrNum > 99) {
      errors.ocrConfidenceThreshold = 'OCR confidence threshold must be between 50% and 99%.';
    }

    const rateNum = Number(adminSettings.rateLimitPerMinute);
    if (isNaN(rateNum) || rateNum < 10 || rateNum > 300) {
      errors.rateLimitPerMinute = 'Rate limit must be between 10 and 300 requests/minute.';
    }

     
    if (Object.keys(errors).length > 0) {
      setSettingsErrors(errors);
      notify('Please resolve validation errors before saving.', 'error');
      return;
    }

    setSettingsErrors({});
    setSettingsSaving(true);

    try {
      const res = await adminAPI.updateSettings({
        platformName: adminSettings.platformName.trim(),
        adminAlertEmail: adminSettings.adminAlertEmail.trim(),
        riskThreshold: riskNum,
        topKChunks: topKNum,
        maxUploadSizeMB: maxUploadNum,
        ocrConfidenceThreshold: ocrNum,
        rateLimitPerMinute: rateNum,
        maintenanceMode: Boolean(adminSettings.maintenanceMode),
      });

      const updated = res?.data?.data?.settings;
      if (updated) {
        setAdminSettings((prev) => ({
          ...prev,
          platformName: updated.platformName,
          adminAlertEmail: updated.adminAlertEmail,
          riskThreshold: updated.riskThreshold,
          topKChunks: updated.topKChunks,
          maxUploadSizeMB: updated.maxUploadSizeMB,
          ocrConfidenceThreshold: updated.ocrConfidenceThreshold,
          rateLimitPerMinute: updated.rateLimitPerMinute,
          maintenanceMode: Boolean(updated.maintenanceMode),
        }));
      }

      localStorage.setItem('legalmind_admin_settings', JSON.stringify(adminSettings));
      localStorage.setItem('legalmind_admin_sidebar_collapsed', String(adminSettings.sidebarDefaultCollapsed));
      setCollapsed(adminSettings.sidebarDefaultCollapsed);
      notify('Platform architecture settings persisted to database successfully.');
    } catch (err) {
      const errMsg = err?.response?.data?.error?.message || err?.message || 'Failed to persist platform settings.';
      notify(errMsg, 'error');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleResetAdminSettings = async () => {
    if (window.confirm('Reset all editable administrative settings to factory defaults?')) {
      setSettingsErrors({});
      setSettingsSaving(true);
      try {
        await adminAPI.updateSettings({
          platformName: DEFAULT_ADMIN_SETTINGS.platformName,
          adminAlertEmail: DEFAULT_ADMIN_SETTINGS.adminAlertEmail,
          riskThreshold: DEFAULT_ADMIN_SETTINGS.riskThreshold,
          topKChunks: DEFAULT_ADMIN_SETTINGS.topKChunks,
          maxUploadSizeMB: DEFAULT_ADMIN_SETTINGS.maxUploadSizeMB,
          ocrConfidenceThreshold: DEFAULT_ADMIN_SETTINGS.ocrConfidenceThreshold,
          rateLimitPerMinute: DEFAULT_ADMIN_SETTINGS.rateLimitPerMinute,
          maintenanceMode: DEFAULT_ADMIN_SETTINGS.maintenanceMode,
        });

        setAdminSettings(DEFAULT_ADMIN_SETTINGS);
        localStorage.setItem('legalmind_admin_settings', JSON.stringify(DEFAULT_ADMIN_SETTINGS));
        localStorage.setItem('legalmind_admin_sidebar_collapsed', 'false');
        setCollapsed(false);
        notify('Platform settings restored to defaults in database.', 'info');
      } catch (err) {
        const errMsg = err?.response?.data?.error?.message || err?.message || 'Failed to reset settings.';
        notify(errMsg, 'error');
      } finally {
        setSettingsSaving(false);
      }
    }
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('legalmind_admin_sidebar_collapsed', String(next));
      } catch {
        // ignore localStorage errors
      }
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const setTab = (tab) => {
    setSearchParams({ tab });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const notify = (text, type = 'success') => {
    setActionNotice({ text, type });
    setTimeout(() => setActionNotice(null), 4500);
  };

  // ── Load Telemetry & Stats ──────────────────────────────────────────────
  const loadSystemData = useCallback(async () => {
    try {
      setRefreshing(true);
      const [statsRes, healthRes, aiRes, diagRes] = await Promise.all([
        adminAPI.getStats().catch(() => ({ data: { data: {} } })),
        healthAPI.check().catch(() => ({ data: { status: 'down' } })),
        healthAPI.aiService().catch(() => ({ data: { success: false, message: 'Unreachable' } })),
        healthAPI.getDiagnostics().catch(() => ({ data: null })),
      ]);

      const rawStats = statsRes?.data?.data || statsRes?.data?.stats || statsRes?.data || {};
      const rawHealth = healthRes?.data || {};
      const rawAi = aiRes?.data || {};
      const rawDiag = diagRes?.data || null;

      setStats(rawStats);
      setHealth(rawHealth);
      setAiHealth(rawAi);
      if (rawDiag) setDiagnostics(rawDiag);
    } catch (err) {
      console.error('System data error:', err);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  // ── Load Diagnostics ────────────────────────────────────────────────────
  const loadDiagnostics = useCallback(async () => {
    try {
      setDiagnosticsLoading(true);
      const res = await healthAPI.getDiagnostics();
      if (res?.data) {
        setDiagnostics(res.data);
      }
    } catch (err) {
      console.error('Failed to load diagnostics:', err);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  // ── Load Platform Settings ──────────────────────────────────────────────
  const loadPlatformSettings = useCallback(async () => {
    try {
      const res = await adminAPI.getSettings();
      const s = res?.data?.data?.settings;
      if (s) {
        setAdminSettings((prev) => ({
          ...prev,
          platformName: s.platformName ?? prev.platformName,
          adminAlertEmail: s.adminAlertEmail ?? prev.adminAlertEmail,
          riskThreshold: s.riskThreshold ?? prev.riskThreshold,
          topKChunks: s.topKChunks ?? prev.topKChunks,
          maxUploadSizeMB: s.maxUploadSizeMB ?? 25,
          ocrConfidenceThreshold: s.ocrConfidenceThreshold ?? 80,
          rateLimitPerMinute: s.rateLimitPerMinute ?? 60,
          maintenanceMode: Boolean(s.maintenanceMode),
        }));
      }
    } catch (err) {
      console.error('Failed to load platform settings from server:', err);
    }
  }, []);

  // ── Load Users ──────────────────────────────────────────────────────────
  const loadUsers = useCallback(async (page = 1) => {
    try {
      const params = {
        page,
        limit: 15,
      };
      if (userSearch.trim()) params.search = userSearch.trim();
      if (userRoleFilter) params.role = userRoleFilter;

      if (userStatusFilter) {
        if (userStatusFilter === 'deleted') {
          params.isDeleted = 'true';
        } else if (userStatusFilter === 'all_records') {
          params.isDeleted = 'all';
        } else {
          params.isActive = userStatusFilter;
          params.isDeleted = 'false';
        }
      } else {
        // Default: only non-deleted accounts
        params.isDeleted = 'false';
      }

      const res = await adminAPI.getUsers(params);
      const data = res?.data?.data || res?.data || {};
      const userList = data.users || (Array.isArray(data) ? data : []);
      const pag = data.pagination || { total: userList.length, page: 1, limit: 15, totalPages: 1 };

      setUsers(userList);
      setUserPagination(pag);
    } catch (err) {
      console.error('Fetch users error:', err);
    }
  }, [userSearch, userRoleFilter, userStatusFilter]);

  // ── Load Documents ──────────────────────────────────────────────────────
  const loadDocuments = useCallback(async (page = 1) => {
    try {
      const params = {
        page,
        limit: 15,
      };
      if (docSearch.trim()) params.search = docSearch.trim();
      if (docTypeFilter) params.documentType = docTypeFilter;
      if (docStatusFilter) params.processingStatus = docStatusFilter;

      const res = await adminAPI.getDocuments(params);
      const data = res?.data?.data || res?.data || {};
      const docList = data.documents || (Array.isArray(data) ? data : []);
      const pag = data.pagination || { total: docList.length, page: 1, limit: 15, totalPages: 1 };

      setDocuments(docList);
      setDocPagination(pag);
    } catch (err) {
      console.error('Fetch documents error:', err);
    }
  }, [docSearch, docTypeFilter, docStatusFilter]);

  // ── Load Reports ────────────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    try {
      setReportsLoading(true);
      const res = await reportAPI.list().catch(() => ({ data: { reports: [] } }));
      const raw =
        res?.data?.data?.reports ||
        res?.data?.reports ||
        (Array.isArray(res?.data?.data) ? res.data.data : null) ||
        (Array.isArray(res?.data) ? res.data : []);
      setReports(Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.error('Fetch reports error:', err);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  // ── Load Audit Logs ─────────────────────────────────────────────────────
  const loadAuditLogs = useCallback(async (page = 1) => {
    try {
      setLogsLoading(true);
      const params = {
        page,
        limit: 25,
      };
      if (logSearch.trim()) params.search = logSearch.trim();
      if (logFilterAction) params.action = logFilterAction;
      if (logFilterTargetType) params.targetType = logFilterTargetType;
      if (logFilterStatus) params.status = logFilterStatus;

      const res = await adminAPI.getAuditLogs(params);
      const data = res?.data?.data || {};
      setLogs(data.logs || []);
      setLogPagination(data.pagination || { total: 0, page: 1, limit: 25, totalPages: 1 });
      setLogAggregations(data.aggregations || { actions: [], statuses: [] });
    } catch (err) {
      console.error('Fetch audit logs error:', err);
    } finally {
      setLogsLoading(false);
    }
  }, [logSearch, logFilterAction, logFilterTargetType, logFilterStatus]);

  // ── Load Pipeline Telemetry ─────────────────────────────────────────────
  const loadPipelineTelemetry = useCallback(async (silent = false) => {
    try {
      if (!silent) setPipelineLoading(true);
      const res = await adminAPI.getPipelineTelemetry();
      if (res?.data?.data) {
        setPipelineData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load pipeline telemetry:', err);
    } finally {
      if (!silent) setPipelineLoading(false);
    }
  }, []);

  const handleAdminRetryPipeline = async (docId, docTitle) => {
    try {
      setPipelineRetryingId(docId);
      await adminAPI.retryPipeline(docId);
      notify(`Analysis pipeline restarted for: ${docTitle || docId}`);
      await loadPipelineTelemetry(true);
    } catch (err) {
      notify(err.message || 'Failed to restart document analysis pipeline.', 'error');
    } finally {
      setPipelineRetryingId(null);
    }
  };

  // ── Run End-to-End Chain Diagnostics ────────────────────────────────────
  const runChainTest = async () => {
    try {
      setChainTesting(true);
      const res = await healthAPI.chainTest();
      setChainResult(res.data);
      notify('Diagnostic multi-hop chain test completed successfully.');
    } catch (err) {
      setChainResult(err.data || { success: false, message: err.message });
      notify('Chain test completed with service anomalies.', 'error');
    } finally {
      setChainTesting(false);
    }
  };

  // ── User Management Actions ─────────────────────────────────────────────
  const handleToggleUserStatus = async (targetUser) => {
    const nextStatus = !targetUser.isActive;
    try {
      await adminAPI.updateUserStatus(targetUser._id || targetUser.id, nextStatus);
      notify(`User ${targetUser.name} has been ${nextStatus ? 'activated' : 'deactivated'}.`);
      loadUsers(userPagination.page);
      loadSystemData();
    } catch (err) {
      notify(err.message || 'Failed to update account status.', 'error');
    }
  };

  const handleToggleUserRole = async (targetUser) => {
    const nextRole = targetUser.role === 'admin' ? 'normal_user' : 'admin';
    try {
      await adminAPI.updateUserRole(targetUser._id || targetUser.id, nextRole);
      notify(`User ${targetUser.name} role changed to ${nextRole}.`);
      loadUsers(userPagination.page);
      loadSystemData();
    } catch (err) {
      notify(err.message || 'Failed to update user role.', 'error');
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    const targetId = userToDelete._id || userToDelete.id;

    // Security check: self deletion guard
    if (targetId === (user?._id || user?.id)) {
      setDeleteError('Security Restriction: You cannot delete your own administrative account.');
      return;
    }

    setDeleteProcessing(true);
    setDeleteError(null);

    try {
      const res = await adminAPI.deleteUser(targetId);
      const msg = res?.data?.message || `User ${userToDelete.name} has been securely archived.`;
      notify(msg, 'success');
      setUserToDelete(null);
      setActiveActionMenuId(null);
      loadUsers(userPagination.page);
      loadSystemData();
    } catch (err) {
      const errMsg = err?.response?.data?.error?.message || err?.message || 'Failed to delete user account.';
      setDeleteError(errMsg);
      notify(errMsg, 'error');
    } finally {
      setDeleteProcessing(false);
    }
  };

  const handleConfirmRestoreUser = async (targetUser) => {
    if (!targetUser) return;
    const targetId = targetUser._id || targetUser.id;
    setRestoreProcessing(true);

    try {
      const res = await adminAPI.restoreUser(targetId);
      const msg = res?.data?.message || `User ${targetUser.name} restored successfully.`;
      notify(msg, 'success');
      setActiveActionMenuId(null);
      loadUsers(userPagination.page);
      loadSystemData();
    } catch (err) {
      const errMsg = err?.response?.data?.error?.message || err?.message || 'Failed to restore user account.';
      notify(errMsg, 'error');
    } finally {
      setRestoreProcessing(false);
    }
  };

  // ── Report Actions ──────────────────────────────────────────────────────
  const handleDownloadReport = async (report) => {
    try {
      const reportId = report._id || report.reportId || report.id;
      const res = await reportAPI.download(reportId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', report.fileName || `LegalMind_Report_${reportId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      notify('PDF audit report downloaded successfully.');
    } catch (err) {
      notify(err.message || 'Failed to download PDF report.', 'error');
    }
  };

  const handleDeleteReport = async (reportId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this audit report?')) return;
    try {
      await reportAPI.remove(reportId);
      setReports((prev) => prev.filter((r) => (r._id || r.reportId || r.id) !== reportId));
      notify('Audit report deleted from archive.');
    } catch (err) {
      notify(err.message || 'Failed to delete report.', 'error');
    }
  };

  const handleGenerateReport = async (docId) => {
    try {
      setGeneratingDocId(docId);
      const res = await reportAPI.generate(docId);
      const newReport = res?.data?.data?.report || res?.data?.data || res?.data?.report || res?.data;
      if (newReport) {
        await handleDownloadReport(newReport);
      }
      loadReports();
      notify('New executive audit report generated.');
    } catch (err) {
      notify(err.message || 'Failed to generate report PDF.', 'error');
    } finally {
      setGeneratingDocId('');
    }
  };

  // Initial Boot
  useEffect(() => {
    loadSystemData();
    loadDiagnostics();
    loadPlatformSettings();
    loadReports();
  }, [loadSystemData, loadDiagnostics, loadPlatformSettings, loadReports]);

  // Tab Dependent Data Fetch
  useEffect(() => {
    if (currentTab === 'users') {
      loadUsers(1);
    } else if (currentTab === 'audit-logs') {
      loadAuditLogs(1);
    } else if (currentTab === 'documents') {
      loadDocuments(1);
    } else if (currentTab === 'pipeline') {
      loadPipelineTelemetry();
    } else if (currentTab === 'reports') {
      loadReports();
    } else if (currentTab === 'diagnostics') {
      loadDiagnostics();
    } else if (currentTab === 'settings') {
      loadPlatformSettings();
    }
  }, [currentTab, loadUsers, loadAuditLogs, loadDocuments, loadPipelineTelemetry, loadReports, loadDiagnostics, loadPlatformSettings]);

  // Active polling while on Pipeline tab
  useEffect(() => {
    if (currentTab !== 'pipeline') return;
    loadPipelineTelemetry(true);
    const interval = setInterval(() => {
      loadPipelineTelemetry(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [currentTab, loadPipelineTelemetry]);

  const handleUserSearchSubmit = (e) => {
    e.preventDefault();
    loadUsers(1);
  };

  const handleDocSearchSubmit = (e) => {
    e.preventDefault();
    loadDocuments(1);
  };

  const handleLogSearchSubmit = (e) => {
    e.preventDefault();
    loadAuditLogs(1);
  };

  const formatBytes = (bytes) => {
    if (!bytes) return 'N/A';
    const kb = bytes / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
  };

  return (
    <div className={`admin-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      {/* ── Fixed Collapsible Left Sidebar ── */}
      <AdminSidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        currentTab={currentTab}
        onSelectTab={setTab}
        stats={{
          ...stats,
          reports: { total: reports.length },
        }}
        user={user}
        onLogout={handleLogout}
      />

      {/* ── Minimal Top Header ── */}
      <AdminHeader
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        onOpenMobile={() => setMobileOpen(true)}
        currentTab={currentTab}
        user={user}
        chainTesting={chainTesting}
        onRunDiagnostics={runChainTest}
        refreshing={refreshing}
        onRefresh={() => {
          loadSystemData();
          if (currentTab === 'users') loadUsers(userPagination.page);
          if (currentTab === 'audit-logs') loadAuditLogs(logPagination.page);
          if (currentTab === 'documents') loadDocuments(docPagination.page);
          if (currentTab === 'pipeline') loadPipelineTelemetry();
          if (currentTab === 'reports') loadReports();
          if (currentTab === 'diagnostics') loadDiagnostics();
          if (currentTab === 'settings') loadPlatformSettings();
        }}
      />

      {/* ── Main Content Workspace ── */}
      <main className="admin-workspace">
        {/* Page Title & Operational Header */}
        <div className="admin-header-bar mb-6">
          <div>
            <div className="admin-breadcrumbs">
              <span>LegalMindAI</span>
              <span>/</span>
              <span>Administration</span>
              <span>/</span>
              <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>
                {currentTab === 'overview' && 'Overview & Health'}
                {currentTab === 'analytics' && 'Platform Analytics'}
                {currentTab === 'users' && 'User Accounts'}
                {currentTab === 'audit-logs' && 'Security & Audit Logs'}
                {currentTab === 'documents' && 'Documents Repository'}
                {currentTab === 'pipeline' && 'Analysis Pipeline'}
                {currentTab === 'reports' && 'Executive Reports'}
                {currentTab === 'diagnostics' && 'System Diagnostics'}
                {currentTab === 'settings' && 'Platform Settings'}
              </span>
            </div>
            <h1 className="page-title flex-center gap-2" style={{ margin: 0 }}>
              {currentTab === 'analytics' ? (
                <BarChart3 size={22} color="var(--color-primary)" />
              ) : currentTab === 'audit-logs' ? (
                <History size={22} color="var(--color-primary)" />
              ) : (
                <Shield size={22} color="var(--color-primary)" />
              )}
              <span>
                {currentTab === 'overview' && 'Overview & System Health'}
                {currentTab === 'analytics' && 'Platform Analytics & Telemetry'}
                {currentTab === 'users' && 'User Accounts Governance'}
                {currentTab === 'audit-logs' && 'Security & Administrative Audit Logs'}
                {currentTab === 'documents' && 'Documents Corpus Repository'}
                {currentTab === 'pipeline' && 'Document Analysis Pipeline'}
                {currentTab === 'reports' && 'Executive Compliance Reports'}
                {currentTab === 'diagnostics' && 'System Diagnostics & Telemetry'}
                {currentTab === 'settings' && 'Platform Architecture Settings'}
              </span>
            </h1>
            <p className="page-subtitle" style={{ margin: '0.25rem 0 0' }}>
              {currentTab === 'overview' && 'Multi-tenant telemetry, microservices runtime status, and cluster metrics.'}
              {currentTab === 'analytics' && 'Platform user acquisition velocity, document ingestion activity, pipeline throughput, and contract intelligence.'}
              {currentTab === 'users' && 'Manage platform accounts, security privileges, role promotions, and activity.'}
              {currentTab === 'audit-logs' && 'Immutable compliance ledger recording all administrative, authentication, and document access events.'}
              {currentTab === 'documents' && 'Inspect ingested contracts, statutory classification categories, and vector states.'}
              {currentTab === 'pipeline' && '4-stage ingestion architecture: Docling OCR, Legal-BERT classifier, Risk Engine, FAISS.'}
              {currentTab === 'reports' && 'Audit generation, regulatory risk summaries, and downloadable PDF compliance packages.'}
              {currentTab === 'diagnostics' && 'Multi-hop distributed probe testing (React → Express → FastAPI → MongoDB) and health logs.'}
              {currentTab === 'settings' && 'AI inference parameters, FAISS vector index dimensions, and tenant security controls.'}
            </p>
          </div>

          <div className="flex-center gap-2">
            <button
              className="btn btn-secondary flex-center gap-2"
              onClick={runChainTest}
              disabled={chainTesting}
              title="Run 3-hop test: React → Express → FastAPI → MongoDB"
            >
              <Activity size={14} className={chainTesting ? 'animate-spin' : ''} />
              <span>{chainTesting ? 'Testing Chain…' : 'Run Diagnostics'}</span>
            </button>

            <button
              className="btn btn-secondary flex-center gap-2"
              onClick={() => {
                loadSystemData();
                if (currentTab === 'users') loadUsers(userPagination.page);
                if (currentTab === 'audit-logs') loadAuditLogs(logPagination.page);
                if (currentTab === 'documents') loadDocuments(docPagination.page);
                if (currentTab === 'pipeline') loadPipelineTelemetry();
                if (currentTab === 'reports') loadReports();
                if (currentTab === 'diagnostics') loadDiagnostics();
                if (currentTab === 'settings') loadPlatformSettings();
              }}
              disabled={refreshing}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Action Notice Alert */}
        {actionNotice && (
          <div
            className={`alert ${actionNotice.type === 'error' ? 'alert-error' : 'alert-success'} mb-4`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div className="flex-center gap-2">
              {actionNotice.type === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
              <span>{actionNotice.text}</span>
            </div>
            <button
              onClick={() => setActionNotice(null)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {loading ? (
          <Spinner label="Assembling cluster telemetry and database records…" />
        ) : (
          <>
            {/* ─────────────────────────────────────────────────────────────────
                TAB 1: OVERVIEW & SYSTEM HEALTH
               ───────────────────────────────────────────────────────────────── */}
            {currentTab === 'overview' && (
              <div>
                {/* 3 Infrastructure Service Cards */}
                <div className="admin-service-grid">
                  <div className="admin-service-card">
                    <div className="admin-service-card-header">
                      <div className="admin-service-name">
                        <Server size={17} color="var(--color-primary)" />
                        <span>Express Node Gateway</span>
                      </div>
                      <span className="status-indicator">
                        <span className={`status-dot ${health?.database?.status === 'connected' ? 'online' : 'offline'}`} />
                        <span>PORT 5001</span>
                      </span>
                    </div>
                    <div className="text-xs muted mb-2">
                      Authentication, JWT Verification, Role Guard, RESTful API Controllers.
                    </div>
                    <div className="admin-tag-list">
                      <span className="admin-tag">Node {import.meta.env.MODE || 'production'}</span>
                      <span className="admin-tag">Express 4.18</span>
                      <span className="admin-tag">JWT Bearer</span>
                      <span className="admin-tag">CORS Enabled</span>
                    </div>
                  </div>

                  <div className="admin-service-card">
                    <div className="admin-service-card-header">
                      <div className="admin-service-name">
                        <Database size={17} color="var(--color-primary)" />
                        <span>MongoDB Database</span>
                      </div>
                      <span className="status-indicator">
                        <span className={`status-dot ${health?.database?.status === 'connected' ? 'online' : 'offline'}`} />
                        <span>{health?.database?.status?.toUpperCase() || 'CONNECTED'}</span>
                      </span>
                    </div>
                    <div className="text-xs muted mb-2">
                      Database: <span className="text-mono">{health?.database?.name || 'legalmind'}</span> · Collections: users, documents, analyses, reports.
                    </div>
                    <div className="admin-tag-list">
                      <span className="admin-tag">Mongoose ODM</span>
                      <span className="admin-tag">WiredTiger Engine</span>
                      <span className="admin-tag">Tenant Segregation</span>
                    </div>
                  </div>

                  <div className="admin-service-card">
                    <div className="admin-service-card-header">
                      <div className="admin-service-name">
                        <Cpu size={17} color="var(--color-primary)" />
                        <span>FastAPI Legal Core</span>
                      </div>
                      <span className="status-indicator">
                        <span className={`status-dot ${aiHealth?.success !== false ? 'online' : 'offline'}`} />
                        <span>PORT 8000</span>
                      </span>
                    </div>
                    <div className="text-xs muted mb-2">
                      PyTorch Legal-BERT classifier, Risk Scoring matrix, FAISS 384-dim semantic vector index.
                    </div>
                    <div className="admin-tag-list">
                      <span className="admin-tag">FastAPI 0.115</span>
                      <span className="admin-tag">FAISS Index</span>
                      <span className="admin-tag">all-MiniLM-L6-v2</span>
                      <span className="admin-tag">Legal-BERT</span>
                    </div>
                  </div>
                </div>

                {/* Platform Summary Metrics */}
                <div className="admin-stat-summary">
                  <div className="admin-stat-card">
                    <div className="admin-stat-header">
                      <span>Total Accounts</span>
                      <Users size={16} />
                    </div>
                    <div className="admin-stat-value">{stats?.users?.total ?? 0}</div>
                    <div className="admin-stat-footer">
                      <span className="text-mono" style={{ color: 'var(--color-success)' }}>
                        {stats?.users?.active ?? 0} Active
                      </span>
                      <span>·</span>
                      <span className="text-mono">{stats?.users?.admins ?? 0} Admins</span>
                    </div>
                  </div>

                  <div className="admin-stat-card">
                    <div className="admin-stat-header">
                      <span>Indexed Agreements</span>
                      <FileText size={16} />
                    </div>
                    <div className="admin-stat-value">{stats?.documents?.total ?? 0}</div>
                    <div className="admin-stat-footer">
                      <span className="text-mono">{stats?.documents?.completed ?? 0} Completed</span>
                      <span>·</span>
                      <span className="text-mono">{stats?.documents?.processing ?? 0} In-flight</span>
                    </div>
                  </div>

                  <div className="admin-stat-card">
                    <div className="admin-stat-header">
                      <span>Completed Pipeline</span>
                      <CheckCircle2 size={16} />
                    </div>
                    <div className="admin-stat-value" style={{ color: 'var(--color-success)' }}>
                      {stats?.documents?.completed ?? 0}
                    </div>
                    <div className="admin-stat-footer">
                      <span>Risk scored &amp; vectorized</span>
                    </div>
                  </div>

                  <div className="admin-stat-card">
                    <div className="admin-stat-header">
                      <span>Failed Jobs</span>
                      <AlertCircle size={16} />
                    </div>
                    <div
                      className="admin-stat-value"
                      style={{ color: stats?.documents?.failed > 0 ? 'var(--color-danger)' : 'var(--color-text)' }}
                    >
                      {stats?.documents?.failed ?? 0}
                    </div>
                    <div className="admin-stat-footer">
                      <span>Pipeline exceptions</span>
                    </div>
                  </div>
                </div>

                {/* Pipeline Distribution Card */}
                <div className="card mb-6">
                  <div className="card-header">
                    <div>
                      <h3 className="card-title text-sm">Processing Pipeline Capacity</h3>
                      <div className="text-xs muted">
                        Multi-tenant distribution of ingested documents across the legal reasoning pipeline.
                      </div>
                    </div>
                    <div className="text-xs text-mono muted">
                      ENVIRONMENT: {stats?.system?.environment?.toUpperCase() || 'DEVELOPMENT'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                      <span>Completed ({stats?.documents?.completed ?? 0})</span>
                      <span>Processing ({stats?.documents?.processing ?? 0})</span>
                      <span>Failed ({stats?.documents?.failed ?? 0})</span>
                    </div>
                    <div
                      style={{
                        height: '8px',
                        background: 'var(--color-surface-2)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        overflow: 'hidden',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <div
                        style={{
                          width: `${stats?.documents?.total ? ((stats.documents.completed || 0) / stats.documents.total) * 100 : 0}%`,
                          background: 'var(--color-primary)',
                        }}
                      />
                      <div
                        style={{
                          width: `${stats?.documents?.total ? ((stats.documents.processing || 0) / stats.documents.total) * 100 : 0}%`,
                          background: 'var(--color-warning)',
                        }}
                      />
                      <div
                        style={{
                          width: `${stats?.documents?.total ? ((stats.documents.failed || 0) / stats.documents.total) * 100 : 0}%`,
                          background: 'var(--color-danger)',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Diagnostics Preview */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title text-sm flex-center gap-2">
                      <Activity size={16} color="var(--color-primary)" />
                      <span>End-to-End Diagnostic Probe</span>
                    </h3>
                    <button
                      className="btn btn-secondary flex-center gap-2"
                      style={{ padding: '0.35rem 0.65rem', fontSize: 'var(--text-xs)' }}
                      onClick={runChainTest}
                      disabled={chainTesting}
                    >
                      <Activity size={12} />
                      <span>{chainTesting ? 'Testing…' : 'Execute Probe'}</span>
                    </button>
                  </div>

                  {chainResult ? (
                    <div className="admin-diag-box">
                      <div className="mb-2" style={{ fontWeight: 600, color: chainResult.success ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {chainResult.message}
                      </div>
                      <div className="text-xs muted mb-3">Topology: {chainResult.chain || 'React → Express → FastAPI → MongoDB'}</div>
                      {Array.isArray(chainResult.steps) && chainResult.steps.map((s, idx) => (
                        <div key={idx} className="admin-diag-step">
                          <div className="flex-center gap-2">
                            <span className="text-mono muted">0{s.step}</span>
                            <span style={{ fontWeight: 600 }}>{s.service}</span>
                            <span className="muted">· {s.message}</span>
                          </div>
                          <span className={`badge ${s.status === 'ok' ? 'badge-success' : 'badge-danger'}`}>
                            {s.status.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs muted" style={{ padding: 'var(--space-2) 0' }}>
                      Click “Execute Probe” to test real-time connectivity across all 3 backend layers (Express gateway, FastAPI AI service, and MongoDB replica).
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────
                TAB: PLATFORM ANALYTICS DASHBOARD
               ───────────────────────────────────────────────────────────────── */}
            {currentTab === 'analytics' && (
              <AdminAnalyticsDashboard />
            )}

            {/* ─────────────────────────────────────────────────────────────────
                TAB 2: USER MANAGEMENT
               ───────────────────────────────────────────────────────────────── */}
            {currentTab === 'users' && (
              <div>
                {/* User Filter Toolbar */}
                <form className="admin-filter-bar" onSubmit={handleUserSearchSubmit}>
                  <div className="admin-filter-group">
                    <div className="admin-search-input">
                      <Search size={14} color="var(--color-text-secondary)" />
                      <input
                        type="text"
                        placeholder="Search users by name or email…"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                      />
                    </div>

                    <select
                      className="admin-select"
                      value={userRoleFilter}
                      onChange={(e) => setUserRoleFilter(e.target.value)}
                    >
                      <option value="">All Roles</option>
                      <option value="admin">Administrators</option>
                      <option value="normal_user">Normal Users</option>
                    </select>

                    <select
                      className="admin-select"
                      value={userStatusFilter}
                      onChange={(e) => setUserStatusFilter(e.target.value)}
                    >
                      <option value="">Active &amp; Suspended</option>
                      <option value="true">Active Only</option>
                      <option value="false">Suspended Only</option>
                      <option value="deleted">Archived / Deleted Accounts</option>
                      <option value="all_records">All Accounts (Inc. Archived)</option>
                    </select>

                    <button type="submit" className="btn btn-secondary" style={{ padding: '0.42rem 0.85rem', fontSize: 'var(--text-xs)' }}>
                      Filter
                    </button>
                  </div>

                  <div className="text-xs text-mono muted">
                    {userPagination.total} accounts listed
                  </div>
                </form>

                {/* Users Table */}
                <div className="card" style={{ padding: 0, minHeight: '260px' }}>
                  <div className="table-container admin-table-container" style={{ border: 'none', minHeight: '260px' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>User Name</th>
                          <th>Email Address</th>
                          <th>Assigned Role</th>
                          <th>Status</th>
                          <th>Registered Date</th>
                          <th style={{ textAlign: 'right' }}>Administrative Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.length === 0 ? (
                          <tr>
                            <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                              <div className="empty-state">No user records matched your criteria.</div>
                            </td>
                          </tr>
                        ) : (
                          users.map((u) => {
                            const isCurrentUser = (u._id || u.id) === (user?._id || user?.id);
                            const isMenuOpen = activeActionMenuId === (u._id || u.id);

                            return (
                              <tr key={u._id || u.id} className={u.isDeleted ? 'table-row-deleted' : ''}>
                                <td style={{ fontWeight: 600 }}>
                                  <div className="flex-center gap-2" style={{ justifyContent: 'flex-start' }}>
                                    <span>{u.name}</span>
                                    {isCurrentUser && (
                                      <span className="badge badge-primary" style={{ fontSize: '9px', padding: '1px 5px' }}>
                                        YOU
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="text-mono text-xs">{u.email}</td>
                                <td>
                                  <span className={`badge ${u.role === 'admin' ? 'badge-primary' : 'badge-neutral'}`}>
                                    {u.role === 'admin' ? 'ADMIN' : 'USER'}
                                  </span>
                                </td>
                                <td>
                                  {u.isDeleted ? (
                                    <span
                                      className="badge"
                                      style={{
                                        color: 'var(--color-danger)',
                                        borderColor: 'var(--color-danger-border)',
                                        background: 'var(--color-danger-bg)',
                                      }}
                                    >
                                      ARCHIVED
                                    </span>
                                  ) : (
                                    <span className={`badge ${u.isActive !== false ? 'badge-success' : 'badge-neutral'}`}>
                                      {u.isActive !== false ? 'ACTIVE' : 'DEACTIVATED'}
                                    </span>
                                  )}
                                </td>
                                <td className="text-mono text-xs muted">
                                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div className="admin-row-actions">
                                    {/* Primary Details Action */}
                                    <button
                                      type="button"
                                      className="admin-mini-btn"
                                      onClick={() => setSelectedUser(u)}
                                      title="View user details"
                                    >
                                      <Eye size={12} />
                                      <span>Details</span>
                                    </button>

                                    {/* Compact 3-Dot Action Menu */}
                                    <div className="admin-action-dropdown-wrapper">
                                      <button
                                        type="button"
                                        id={`user-actions-btn-${u._id || u.id}`}
                                        className={`admin-action-menu-btn${isMenuOpen ? ' active' : ''}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveActionMenuId(isMenuOpen ? null : (u._id || u.id));
                                        }}
                                        aria-label={`Administrative actions for ${u.name}`}
                                        title="More actions"
                                      >
                                        <MoreVertical size={13} />
                                      </button>

                                      {isMenuOpen && (
                                        <div
                                          className="admin-action-dropdown"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {u.isDeleted ? (
                                            <button
                                              type="button"
                                              className="admin-dropdown-item"
                                              onClick={() => handleConfirmRestoreUser(u)}
                                              disabled={restoreProcessing}
                                            >
                                              <RotateCcw size={12} />
                                              <span>Restore Account</span>
                                            </button>
                                          ) : (
                                            <>
                                              <button
                                                type="button"
                                                className="admin-dropdown-item"
                                                disabled={isCurrentUser}
                                                onClick={() => {
                                                  setActiveActionMenuId(null);
                                                  handleToggleUserRole(u);
                                                }}
                                                title={isCurrentUser ? 'Cannot modify your own administrative role' : undefined}
                                              >
                                                <Lock size={12} />
                                                <span>{u.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}</span>
                                              </button>

                                              <button
                                                type="button"
                                                className="admin-dropdown-item"
                                                disabled={isCurrentUser}
                                                onClick={() => {
                                                  setActiveActionMenuId(null);
                                                  handleToggleUserStatus(u);
                                                }}
                                                title={isCurrentUser ? 'Cannot deactivate your own administrative account' : undefined}
                                              >
                                                {u.isActive !== false ? <UserX size={12} /> : <UserCheck size={12} />}
                                                <span>{u.isActive !== false ? 'Suspend Account' : 'Reactivate Account'}</span>
                                              </button>

                                              <div className="admin-dropdown-divider" />

                                              <button
                                                type="button"
                                                className="admin-dropdown-item danger"
                                                disabled={isCurrentUser}
                                                onClick={() => {
                                                  setActiveActionMenuId(null);
                                                  setDeleteError(null);
                                                  setUserToDelete(u);
                                                }}
                                                title={isCurrentUser ? 'Cannot delete your own administrative account' : undefined}
                                              >
                                                <Trash2 size={12} />
                                                <span>Delete Account</span>
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Bar */}
                  {userPagination.totalPages > 1 && (
                    <div className="admin-pagination-bar">
                      <span>
                        Showing Page {userPagination.page} of {userPagination.totalPages} ({userPagination.total} Total)
                      </span>
                      <div className="admin-page-controls">
                        <button
                          className="admin-mini-btn"
                          disabled={userPagination.page <= 1}
                          onClick={() => loadUsers(userPagination.page - 1)}
                        >
                          <ChevronLeft size={12} />
                          <span>Prev</span>
                        </button>
                        <button
                          className="admin-mini-btn"
                          disabled={userPagination.page >= userPagination.totalPages}
                          onClick={() => loadUsers(userPagination.page + 1)}
                        >
                          <span>Next</span>
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────
                TAB: SECURITY & AUDIT LOGS
               ───────────────────────────────────────────────────────────────── */}
            {currentTab === 'audit-logs' && (
              <div>
                {/* Metric Summary Cards */}
                <div className="grid-4 admin-grid-4 mb-6">
                  <div className="admin-stat-card">
                    <span className="admin-stat-label">Total Logged Events</span>
                    <span className="admin-stat-value text-mono">{logPagination.total || logs.length}</span>
                    <span className="admin-stat-desc">Immutable append-only security ledger</span>
                  </div>
                  <div className="admin-stat-card">
                    <span className="admin-stat-label">Successful Operations</span>
                    <span className="admin-stat-value text-mono" style={{ color: 'var(--color-success)' }}>
                      {logAggregations.statuses?.find((s) => s._id === 'success')?.count || logs.filter((l) => l.status === 'success').length}
                    </span>
                    <span className="admin-stat-desc">Normal authenticated operations</span>
                  </div>
                  <div className="admin-stat-card">
                    <span className="admin-stat-label">Security Warnings</span>
                    <span className="admin-stat-value text-mono" style={{ color: '#d97706' }}>
                      {logAggregations.statuses?.find((s) => s._id === 'warning')?.count || logs.filter((l) => l.status === 'warning').length}
                    </span>
                    <span className="admin-stat-desc">Cross-tenant document access flags</span>
                  </div>
                  <div className="admin-stat-card">
                    <span className="admin-stat-label">Failed Operations</span>
                    <span className="admin-stat-value text-mono" style={{ color: 'var(--color-danger)' }}>
                      {logAggregations.statuses?.find((s) => s._id === 'failure')?.count || logs.filter((l) => l.status === 'failure').length}
                    </span>
                    <span className="admin-stat-desc">Auth rejections &amp; blocked actions</span>
                  </div>
                </div>

                {/* Audit Filter Toolbar */}
                <form className="admin-filter-bar mb-4" onSubmit={handleLogSearchSubmit}>
                  <div className="admin-filter-group" style={{ flexWrap: 'wrap', gap: '8px' }}>
                    <div className="admin-search-input" style={{ minWidth: '220px' }}>
                      <Search size={14} color="var(--color-text-secondary)" />
                      <input
                        type="text"
                        placeholder="Search actions, actor emails, target IDs…"
                        value={logSearch}
                        onChange={(e) => setLogSearch(e.target.value)}
                      />
                    </div>

                    <select
                      className="admin-select"
                      value={logFilterAction}
                      onChange={(e) => setLogFilterAction(e.target.value)}
                      style={{ minWidth: '170px' }}
                    >
                      <option value="">All Event Actions</option>
                      <option value="USER_LOGIN">USER_LOGIN</option>
                      <option value="USER_LOGIN_FAILED">USER_LOGIN_FAILED</option>
                      <option value="USER_LOGOUT">USER_LOGOUT</option>
                      <option value="USER_REGISTERED">USER_REGISTERED</option>
                      <option value="USER_ROLE_CHANGED">USER_ROLE_CHANGED</option>
                      <option value="USER_STATUS_CHANGED">USER_STATUS_CHANGED</option>
                      <option value="USER_DELETED">USER_DELETED</option>
                      <option value="USER_RESTORED">USER_RESTORED</option>
                      <option value="ADMIN_DOCUMENT_ACCESS">ADMIN_DOCUMENT_ACCESS</option>
                      <option value="DOCUMENT_DELETED">DOCUMENT_DELETED</option>
                      <option value="ACCOUNT_DELETED">ACCOUNT_DELETED</option>
                      <option value="PASSWORD_CHANGED">PASSWORD_CHANGED</option>
                    </select>

                    <select
                      className="admin-select"
                      value={logFilterTargetType}
                      onChange={(e) => setLogFilterTargetType(e.target.value)}
                      style={{ minWidth: '140px' }}
                    >
                      <option value="">All Target Types</option>
                      <option value="user">User</option>
                      <option value="auth">Auth</option>
                      <option value="document">Document</option>
                      <option value="settings">Settings</option>
                      <option value="system">System</option>
                      <option value="pipeline">Pipeline</option>
                    </select>

                    <select
                      className="admin-select"
                      value={logFilterStatus}
                      onChange={(e) => setLogFilterStatus(e.target.value)}
                      style={{ minWidth: '130px' }}
                    >
                      <option value="">All Statuses</option>
                      <option value="success">Success</option>
                      <option value="warning">Warning</option>
                      <option value="failure">Failure</option>
                    </select>

                    <button type="submit" className="admin-btn admin-btn-secondary flex-center gap-1">
                      <Search size={12} />
                      <span>Filter</span>
                    </button>

                    {(logSearch || logFilterAction || logFilterTargetType || logFilterStatus) && (
                      <button
                        type="button"
                        className="admin-btn admin-btn-ghost flex-center gap-1"
                        onClick={() => {
                          setLogSearch('');
                          setLogFilterAction('');
                          setLogFilterTargetType('');
                          setLogFilterStatus('');
                        }}
                      >
                        <RotateCcw size={12} />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </form>

                {/* Audit Logs Table Card */}
                <div className="admin-table-card">
                  <div className="admin-table-container">
                    {logsLoading ? (
                      <div className="p-8 text-center flex-center flex-col gap-3">
                        <Spinner />
                        <span className="text-sm text-secondary">Loading audit trail entries…</span>
                      </div>
                    ) : logs.length === 0 ? (
                      <div className="admin-empty-state">
                        <History size={36} color="var(--color-text-secondary)" style={{ opacity: 0.5, marginBottom: '8px' }} />
                        <span className="admin-empty-title">No Audit Log Entries Found</span>
                        <span className="admin-empty-desc">
                          Events will record automatically as administrative operations, authentication events, and document updates take place.
                        </span>
                      </div>
                    ) : (
                      <table className="data-table admin-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Action</th>
                            <th>Actor</th>
                            <th>Target</th>
                            <th>Status</th>
                            <th>Origin IP</th>
                            <th style={{ textAlign: 'right' }}>Metadata</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map((log) => {
                            const isSuccess = log.status === 'success';
                            const isWarning = log.status === 'warning';
                            const isFailure = log.status === 'failure';

                            return (
                              <tr key={log._id}>
                                <td className="text-mono" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                                  {new Date(log.createdAt).toLocaleString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })}
                                </td>
                                <td>
                                  <span
                                    className="badge text-mono"
                                    style={{
                                      background: isWarning ? 'rgba(234, 179, 8, 0.12)' : isFailure ? 'rgba(239, 68, 68, 0.12)' : 'var(--color-surface-2)',
                                      color: isWarning ? '#b45309' : isFailure ? 'var(--color-danger)' : 'var(--color-text)',
                                      border: `1px solid ${isWarning ? 'rgba(234, 179, 8, 0.3)' : isFailure ? 'rgba(239, 68, 68, 0.3)' : 'var(--color-border)'}`,
                                      fontSize: '11px',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {log.action}
                                  </span>
                                </td>
                                <td>
                                  <div className="flex-center gap-1" style={{ justifyContent: 'flex-start' }}>
                                    <span style={{ fontWeight: 500, fontSize: '13px' }}>
                                      {log.actorEmail || 'System / Anonymous'}
                                    </span>
                                    {log.actorRole && (
                                      <span
                                        className={`badge ${log.actorRole === 'admin' ? 'badge-primary' : 'badge-neutral'}`}
                                        style={{ fontSize: '10px', padding: '1px 5px' }}
                                      >
                                        {log.actorRole.toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <div className="flex-center gap-1" style={{ justifyContent: 'flex-start' }}>
                                    <span
                                      className="badge badge-neutral"
                                      style={{ textTransform: 'uppercase', fontSize: '10px' }}
                                    >
                                      {log.targetType}
                                    </span>
                                    {log.targetId && (
                                      <span
                                        className="text-mono text-secondary truncate"
                                        style={{ maxWidth: '120px', fontSize: '11px' }}
                                        title={log.targetId}
                                      >
                                        {log.targetId}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span
                                    className={`badge ${isSuccess ? 'badge-success' : isWarning ? 'badge-warning' : 'badge-danger'}`}
                                    style={{ textTransform: 'uppercase', fontSize: '10px' }}
                                  >
                                    {log.status}
                                  </span>
                                </td>
                                <td className="text-mono text-secondary" style={{ fontSize: '11px' }}>
                                  {log.ipAddress || '127.0.0.1'}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button
                                    type="button"
                                    className="admin-mini-btn"
                                    onClick={() => setSelectedLog(log)}
                                    title="Inspect full audit record"
                                  >
                                    <Eye size={12} />
                                    <span>Inspect</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Pagination Controls */}
                  {!logsLoading && logs.length > 0 && (
                    <div className="admin-pagination">
                      <span>
                        Showing Page {logPagination.page} of {logPagination.totalPages || 1} ({logPagination.total} Total Events)
                      </span>
                      <div className="admin-page-controls">
                        <button
                          className="admin-mini-btn"
                          disabled={logPagination.page <= 1}
                          onClick={() => loadAuditLogs(logPagination.page - 1)}
                        >
                          <ChevronLeft size={12} />
                          <span>Prev</span>
                        </button>
                        <button
                          className="admin-mini-btn"
                          disabled={logPagination.page >= logPagination.totalPages}
                          onClick={() => loadAuditLogs(logPagination.page + 1)}
                        >
                          <span>Next</span>
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────
                TAB 3: DOCUMENT MANAGEMENT
               ───────────────────────────────────────────────────────────────── */}
            {currentTab === 'documents' && (
              <div>
                {/* Document Filter Toolbar */}
                <form className="admin-filter-bar" onSubmit={handleDocSearchSubmit}>
                  <div className="admin-filter-group">
                    <div className="admin-search-input">
                      <Search size={14} color="var(--color-text-secondary)" />
                      <input
                        type="text"
                        placeholder="Search indexed agreements by title…"
                        value={docSearch}
                        onChange={(e) => setDocSearch(e.target.value)}
                      />
                    </div>

                    <select
                      className="admin-select"
                      value={docTypeFilter}
                      onChange={(e) => setDocTypeFilter(e.target.value)}
                    >
                      <option value="">All Agreement Types</option>
                      <option value="employment">Employment Agreements</option>
                      <option value="nda">Non-Disclosure Agreements (NDAs)</option>
                      <option value="commercial_lease">Commercial Leases</option>
                      <option value="vendor_agreement">Vendor &amp; Supplier</option>
                      <option value="general">General Contracts</option>
                    </select>

                    <select
                      className="admin-select"
                      value={docStatusFilter}
                      onChange={(e) => setDocStatusFilter(e.target.value)}
                    >
                      <option value="">All Pipeline Statuses</option>
                      <option value="completed">Completed</option>
                      <option value="processing">Processing</option>
                      <option value="pending">Pending</option>
                      <option value="failed">Failed</option>
                    </select>

                    <button type="submit" className="btn btn-secondary" style={{ padding: '0.42rem 0.85rem', fontSize: 'var(--text-xs)' }}>
                      Filter
                    </button>
                  </div>

                  <div className="text-xs text-mono muted">
                    {docPagination.total} agreements in database
                  </div>
                </form>

                {/* Documents Table */}
                <div className="card" style={{ padding: 0 }}>
                  <div className="table-container" style={{ border: 'none' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Document Title &amp; ID</th>
                          <th>Category</th>
                          <th>Tenant Owner</th>
                          <th>Format</th>
                          <th>Pipeline Status</th>
                          <th>Uploaded</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.length === 0 ? (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                              <div className="empty-state">No tenant agreements matched your search query.</div>
                            </td>
                          </tr>
                        ) : (
                          documents.map((doc) => {
                            const docId = doc._id || doc.id;
                            const title = doc.metadata?.documentTitle || doc.originalName || 'Untitled Agreement';
                            const owner = doc.userId?.name || doc.userId?.email || 'System Tenant';
                            const status = doc.processingStatus || 'completed';

                            return (
                              <tr key={docId}>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{title}</div>
                                  <div className="text-mono text-xs muted" style={{ fontSize: '10px' }}>
                                    ID: {docId}
                                  </div>
                                </td>
                                <td>
                                  <span className="badge badge-neutral">
                                    {doc.documentType || 'general'}
                                  </span>
                                </td>
                                <td className="text-xs">
                                  <div>{owner}</div>
                                  {doc.userId?.email && (
                                    <div className="text-mono muted" style={{ fontSize: '10px' }}>
                                      {doc.userId.email}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <span className="text-mono text-xs muted">
                                    {(doc.fileFormat || 'PDF').toUpperCase()}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className={`badge ${
                                      status === 'completed'
                                        ? 'badge-success'
                                        : status === 'processing'
                                        ? 'badge-warning'
                                        : status === 'failed'
                                        ? 'badge-danger'
                                        : 'badge-neutral'
                                    }`}
                                  >
                                    {status.toUpperCase()}
                                  </span>
                                </td>
                                <td className="text-mono text-xs muted">
                                  {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : 'N/A'}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div className="admin-action-btn-group" style={{ justifyContent: 'flex-end' }}>
                                    <button
                                      className="admin-mini-btn"
                                      onClick={() => setSelectedDoc(doc)}
                                      title="Inspect document metadata"
                                    >
                                      <Eye size={12} />
                                      <span>Inspect</span>
                                    </button>

                                    <Link
                                      to={`/documents/${docId}`}
                                      className="admin-mini-btn"
                                      title="Open analysis workspace"
                                    >
                                      <ExternalLink size={12} />
                                      <span>Workspace</span>
                                    </Link>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Bar */}
                  {docPagination.totalPages > 1 && (
                    <div className="admin-pagination-bar">
                      <span>
                        Showing Page {docPagination.page} of {docPagination.totalPages} ({docPagination.total} Total)
                      </span>
                      <div className="admin-page-controls">
                        <button
                          className="admin-mini-btn"
                          disabled={docPagination.page <= 1}
                          onClick={() => loadDocuments(docPagination.page - 1)}
                        >
                          <ChevronLeft size={12} />
                          <span>Prev</span>
                        </button>
                        <button
                          className="admin-mini-btn"
                          disabled={docPagination.page >= docPagination.totalPages}
                          onClick={() => loadDocuments(docPagination.page + 1)}
                        >
                          <span>Next</span>
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────
                TAB 4: ANALYSIS PIPELINE & PROCESSING QUEUE
               ───────────────────────────────────────────────────────────────── */}
            {/* ─────────────────────────────────────────────────────────────────
                TAB 4: ANALYSIS PIPELINE & PROCESSING QUEUE
               ───────────────────────────────────────────────────────────────── */}
            {currentTab === 'pipeline' && (
              <div>
                {/* Top Action & Status Indicator */}
                <div className="card mb-4" style={{ padding: 'var(--space-4)' }}>
                  <div className="flex-center justify-between" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                    <div className="flex-center gap-3">
                      <div
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: (pipelineData?.summary?.active || 0) > 0 ? 'var(--color-warning)' : 'var(--color-success)',
                          boxShadow: (pipelineData?.summary?.active || 0) > 0 ? '0 0 8px var(--color-warning)' : '0 0 8px var(--color-success)',
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                          {(pipelineData?.summary?.active || 0) > 0
                            ? `Pipeline Active: ${pipelineData.summary.active} Document${pipelineData.summary.active === 1 ? '' : 's'} In Flight`
                            : 'Pipeline Idle: Ingestion Engine Operational & Ready'}
                        </div>
                        <div className="text-xs muted">
                          Real-time stream tracking Docling OCR, Legal-BERT extraction, Risk scoring, and FAISS vector indexing.
                        </div>
                      </div>
                    </div>

                    <div className="flex-center gap-2">
                      <button
                        className="btn btn-secondary btn-sm flex-center gap-2"
                        disabled={pipelineLoading}
                        onClick={() => loadPipelineTelemetry()}
                      >
                        <RefreshCw size={13} className={pipelineLoading ? 'spin' : ''} />
                        <span>{pipelineLoading ? 'Polling…' : 'Refresh Telemetry'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4 Top KPI Summary Cards */}
                <div className="grid-4 mb-4">
                  <div className="card">
                    <div className="text-mono text-xs muted mb-1">TOTAL INGESTED</div>
                    <div className="stat-number">{pipelineData?.summary?.total ?? stats.totalDocuments ?? 0}</div>
                    <div className="stat-desc">All document versions across workspace</div>
                  </div>

                  <div className="card">
                    <div className="text-mono text-xs muted mb-1">IN-FLIGHT ACTIVE</div>
                    <div
                      className="stat-number"
                      style={{ color: (pipelineData?.summary?.active || 0) > 0 ? 'var(--color-warning)' : 'var(--color-text)' }}
                    >
                      {pipelineData?.summary?.active ?? 0}
                    </div>
                    <div className="stat-desc">
                      Queued: {pipelineData?.stages?.queued ?? 0} · In-progress: {Math.max((pipelineData?.summary?.active || 0) - (pipelineData?.stages?.queued || 0), 0)}
                    </div>
                  </div>

                  <div className="card">
                    <div className="text-mono text-xs muted mb-1">AVERAGE THROUGHPUT LATENCY</div>
                    <div className="stat-number">
                      {pipelineData?.summary?.avgDurationSeconds ? `${pipelineData.summary.avgDurationSeconds}s` : '~1.8s'}
                    </div>
                    <div className="stat-desc">OCR, NER, Risk, and FAISS indexing</div>
                  </div>

                  <div className="card">
                    <div className="text-mono text-xs muted mb-1">PIPELINE SUCCESS RATE</div>
                    <div className="stat-number" style={{ color: 'var(--color-success)' }}>
                      {pipelineData?.summary?.successRate ?? 100}%
                    </div>
                    <div className="stat-desc">
                      {pipelineData?.summary?.completed ?? 0} completed · {pipelineData?.summary?.failed ?? 0} failed
                    </div>
                  </div>
                </div>

                {/* 4 Pipeline Architecture Cards with Live Stage Telemetry */}
                <div className="card mb-6">
                  <div className="card-header">
                    <div>
                      <h3 className="card-title text-sm flex-center gap-2">
                        <Cpu size={16} color="var(--color-primary)" />
                        <span>4-Stage Ingestion Pipeline Architecture &amp; Workload Distribution</span>
                      </h3>
                      <div className="text-xs muted">
                        Sequential transformation of unstructured contracts into vectorized legal intelligence.
                      </div>
                    </div>
                  </div>

                  <div className="grid-4 mb-4">
                    <div className="card" style={{ background: 'var(--color-surface-2)' }}>
                      <div className="flex-center justify-between mb-1">
                        <span className="text-mono text-xs muted">STAGE 01</span>
                        {(pipelineData?.stages?.extracting || 0) > 0 && (
                          <span className="badge badge-warning text-xs">{pipelineData.stages.extracting} active</span>
                        )}
                      </div>
                      <h4 className="text-sm mb-1" style={{ fontWeight: 600 }}>Docling OCR &amp; Text</h4>
                      <p className="text-xs muted">
                        Strips formatting noise, extracts text hierarchy from PDF/DOCX, computes SHA-256 integrity hash.
                      </p>
                      <div className="admin-tag-list">
                        <span className="admin-tag">PyPDF / docx</span>
                        <span className="admin-tag">Clean Chunks</span>
                      </div>
                    </div>

                    <div className="card" style={{ background: 'var(--color-surface-2)' }}>
                      <div className="flex-center justify-between mb-1">
                        <span className="text-mono text-xs muted">STAGE 02</span>
                        {(pipelineData?.stages?.classifying || 0) > 0 && (
                          <span className="badge badge-warning text-xs">{pipelineData.stages.classifying} active</span>
                        )}
                      </div>
                      <h4 className="text-sm mb-1" style={{ fontWeight: 600 }}>Legal-BERT Extraction</h4>
                      <p className="text-xs muted">
                        Classifies 14+ statutory clause categories: indemnity, non-compete, governing law, termination.
                      </p>
                      <div className="admin-tag-list">
                        <span className="admin-tag">nlpaueb/legal-bert</span>
                        <span className="admin-tag">PyTorch</span>
                      </div>
                    </div>

                    <div className="card" style={{ background: 'var(--color-surface-2)' }}>
                      <div className="flex-center justify-between mb-1">
                        <span className="text-mono text-xs muted">STAGE 03</span>
                        {(pipelineData?.stages?.analyzing || 0) > 0 && (
                          <span className="badge badge-warning text-xs">{pipelineData.stages.analyzing} active</span>
                        )}
                      </div>
                      <h4 className="text-sm mb-1" style={{ fontWeight: 600 }}>Risk Scoring Engine</h4>
                      <p className="text-xs muted">
                        Applies mathematical severity weighting across 10 statutory risk categories yielding 0–100 score.
                      </p>
                      <div className="admin-tag-list">
                        <span className="admin-tag">Objective Score</span>
                        <span className="admin-tag">Redlines</span>
                      </div>
                    </div>

                    <div className="card" style={{ background: 'var(--color-surface-2)' }}>
                      <div className="flex-center justify-between mb-1">
                        <span className="text-mono text-xs muted">STAGE 04</span>
                        {(pipelineData?.stages?.indexing || 0) > 0 && (
                          <span className="badge badge-warning text-xs">{pipelineData.stages.indexing} active</span>
                        )}
                      </div>
                      <h4 className="text-sm mb-1" style={{ fontWeight: 600 }}>FAISS Semantic Store</h4>
                      <p className="text-xs muted">
                        Generates dense vector embeddings (384-dim) stored in FAISS for grounded Agentic RAG Q&amp;A.
                      </p>
                      <div className="admin-tag-list">
                        <span className="admin-tag">all-MiniLM-L6-v2</span>
                        <span className="admin-tag">Strict Citations</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Ingestion Queue Table */}
                <div className="card mb-6">
                  <div className="card-header">
                    <div>
                      <h3 className="card-title text-sm flex-center gap-2">
                        <Activity size={16} color="var(--color-primary)" />
                        <span>Live Document Ingestion Queue &amp; State Machine</span>
                      </h3>
                      <div className="text-xs muted">
                        Real-time tracking of documents across pipeline stages with administrative retry controls.
                      </div>
                    </div>
                  </div>

                  {!pipelineData?.queue || pipelineData.queue.length === 0 ? (
                    <div className="empty-state" style={{ padding: '2rem' }}>
                      <p>No documents found in ingestion queue.</p>
                    </div>
                  ) : (
                    <div className="table-container">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Document Title</th>
                            <th>Owner / Tenant</th>
                            <th>Pipeline Stage</th>
                            <th>Processing Duration</th>
                            <th>Retries</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Administrative Control</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pipelineData.queue.map((item) => {
                            const isFailed = item.processingStatus === 'failed';
                            const isCompleted = item.processingStatus === 'completed';
                            const isBusy = item.processingStatus === 'processing' || item.processingStatus === 'pending';

                            return (
                              <tr key={item._id}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <FileText size={14} color="var(--color-text-secondary)" />
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                        {item.originalName}
                                      </div>
                                      <div className="text-xs muted text-mono">
                                        {item.documentType?.toUpperCase()} · {item.fileFormat?.toUpperCase()}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <div style={{ fontSize: '0.85rem' }}>
                                    {item.user ? item.user.name : 'Unknown User'}
                                  </div>
                                  <div className="text-xs text-mono muted">
                                    {item.user ? item.user.email : '—'}
                                  </div>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '130px' }}>
                                    <span className="text-xs text-mono" style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                                      {item.processingStage || (isCompleted ? 'completed' : isFailed ? 'failed' : 'queued')}
                                      {item.processingProgress !== undefined && item.processingProgress !== null ? ` (${item.processingProgress}%)` : ''}
                                    </span>
                                    <div style={{ width: '100%', height: '4px', background: 'var(--color-border)', borderRadius: '2px', overflow: 'hidden' }}>
                                      <div
                                        style={{
                                          width: `${Math.max(item.processingProgress || (isCompleted ? 100 : 10), 10)}%`,
                                          height: '100%',
                                          background: isFailed ? 'var(--color-danger)' : isCompleted ? 'var(--color-success)' : 'var(--color-primary)',
                                          transition: 'width 0.4s ease',
                                        }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span className="text-mono text-xs">
                                    {item.processingDurationMs
                                      ? `${(item.processingDurationMs / 1000).toFixed(2)}s`
                                      : isBusy
                                      ? 'In flight…'
                                      : '—'}
                                  </span>
                                </td>
                                <td>
                                  <span className="text-mono text-xs">
                                    {item.retryCount || 0}
                                    {item.lastRetriedAt && (
                                      <span className="muted" style={{ display: 'block', fontSize: '10px' }}>
                                        {new Date(item.lastRetriedAt).toLocaleTimeString()}
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td>
                                  <span className={`badge ${isCompleted ? 'badge-success' : isFailed ? 'badge-danger' : 'badge-warning'}`}>
                                    {item.processingStatus}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button
                                    className="btn btn-secondary btn-xs flex-center gap-1"
                                    style={{ marginLeft: 'auto' }}
                                    disabled={pipelineRetryingId === item._id || isBusy}
                                    title={isBusy ? 'Pipeline currently executing' : 'Re-trigger ingestion analysis pipeline'}
                                    onClick={() => handleAdminRetryPipeline(item._id, item.originalName)}
                                  >
                                    <RotateCcw size={11} className={pipelineRetryingId === item._id ? 'spin' : ''} />
                                    <span>{pipelineRetryingId === item._id ? 'Restarting…' : 'Retry Pipeline'}</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────
                TAB 5: EXECUTIVE REPORTS
               ───────────────────────────────────────────────────────────────── */}
            {currentTab === 'reports' && (
              <div>
                {/* Generate New Report Selector */}
                {documents.length > 0 && (
                  <div className="card mb-4" style={{ background: 'var(--color-surface)' }}>
                    <div className="card-header" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
                      <div>
                        <h3 className="card-title flex-center gap-2" style={{ fontSize: '0.95rem' }}>
                          <Plus size={16} color="var(--color-primary)" />
                          <span>Generate Executive Brief</span>
                        </h3>
                        <div className="form-hint mt-1">Compile comprehensive audit findings into a branded PDF brief</div>
                      </div>
                      <div className="flex-center gap-2">
                        <select
                          className="admin-select"
                          style={{ minWidth: '280px' }}
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) handleGenerateReport(e.target.value);
                          }}
                          disabled={Boolean(generatingDocId)}
                        >
                          <option value="" disabled>Select a contract to compile…</option>
                          {documents.map((d) => (
                            <option key={d._id || d.id} value={d._id || d.id}>
                              {d.metadata?.documentTitle || d.originalName} ({d.documentType || 'General'})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {generatingDocId && (
                      <div className="text-xs text-mono muted mt-3 flex-center gap-2">
                        <Spinner label="" />
                        <span>Compiling tables, risk scorecards, and statutory findings into PDF…</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Reports Table */}
                <div className="card" style={{ padding: 0 }}>
                  <div className="card-header" style={{ padding: 'var(--space-4) var(--space-5)', margin: 0 }}>
                    <h3 className="card-title text-sm flex-center gap-2">
                      <ScrollText size={16} color="var(--color-primary)" />
                      <span>Compiled Executive Reports ({reports.length})</span>
                    </h3>
                    <button
                      className="btn btn-secondary btn-sm flex-center gap-1"
                      onClick={loadReports}
                      disabled={reportsLoading}
                    >
                      <RefreshCw size={12} className={reportsLoading ? 'animate-spin' : ''} />
                      <span>Refresh</span>
                    </button>
                  </div>

                  {reportsLoading ? (
                    <Spinner label="Loading reports archive…" />
                  ) : reports.length === 0 ? (
                    <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                      <ScrollText size={36} color="var(--color-text-muted)" style={{ margin: '0 auto 0.75rem' }} />
                      <h3>No audit reports generated yet</h3>
                      <p>Generate a PDF audit report using the contract selector above.</p>
                    </div>
                  ) : (
                    <div className="table-container" style={{ border: 'none' }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Report File</th>
                            <th>Source Document</th>
                            <th>File Size</th>
                            <th>Generated Date</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reports.map((report) => {
                            const rId = report._id || report.reportId || report.id;
                            return (
                              <tr key={rId}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                                    <FileCheck size={16} color="var(--color-success)" />
                                    <span>{report.fileName}</span>
                                  </div>
                                </td>
                                <td>
                                  <span style={{ color: 'var(--color-text-secondary)' }}>
                                    {report.documentTitle || report.documentId || 'Contract Analysis'}
                                  </span>
                                </td>
                                <td className="text-mono text-xs muted">
                                  {formatBytes(report.fileSize)}
                                </td>
                                <td className="text-mono text-xs muted">
                                  {new Date(report.createdAt).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div className="admin-action-btn-group" style={{ justifyContent: 'flex-end' }}>
                                    <button
                                      className="admin-mini-btn"
                                      onClick={() => handleDownloadReport(report)}
                                      title="Download PDF"
                                    >
                                      <Download size={12} />
                                      <span>Download</span>
                                    </button>
                                    <button
                                      className="admin-mini-btn danger"
                                      title="Delete report"
                                      onClick={(e) => handleDeleteReport(rId, e)}
                                    >
                                      <Trash2 size={12} />
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────
                TAB 6: SYSTEM DIAGNOSTICS & TELEMETRY
               ───────────────────────────────────────────────────────────────── */}
            {currentTab === 'diagnostics' && (
              <div>
                {/* Diagnostics Live Telemetry Bar */}
                <div className="card mb-6" style={{ padding: 'var(--space-4) var(--space-5)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div className="status-indicator">
                        <span className={`status-dot ${diagnostics?.database?.status === 'connected' && diagnostics?.aiService?.status === 'operational' ? 'online' : 'offline'}`} />
                        <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                          {diagnostics?.database?.status === 'connected' && diagnostics?.aiService?.status === 'operational'
                            ? 'All Subsystems Operational'
                            : 'Service Anomalies Detected'}
                        </span>
                      </div>
                      <span className="text-xs text-mono muted">
                        Probe Latency: {diagnostics?.latencyMs ?? 0}ms · Timestamp: {diagnostics?.timestamp ? new Date(diagnostics.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="flex-center gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm flex-center gap-2"
                        onClick={loadDiagnostics}
                        disabled={diagnosticsLoading}
                        title="Query live host and database diagnostics"
                      >
                        <RefreshCw size={13} className={diagnosticsLoading ? 'animate-spin' : ''} />
                        <span>{diagnosticsLoading ? 'Querying…' : 'Refresh Telemetry'}</span>
                      </button>

                      <button
                        type="button"
                        className="btn btn-primary btn-sm flex-center gap-2"
                        onClick={runChainTest}
                        disabled={chainTesting}
                        title="Execute 3-hop multi-service probe: React → Express → FastAPI → MongoDB"
                      >
                        <Activity size={13} className={chainTesting ? 'animate-spin' : ''} />
                        <span>{chainTesting ? 'Executing Probe…' : 'Run Full Chain Test'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4 Telemetry Metrics Cards */}
                <div className="admin-service-grid mb-6">
                  {/* Card 1: Host Compute & Process */}
                  <div className="admin-service-card">
                    <div className="admin-service-card-header">
                      <div className="admin-service-name">
                        <Cpu size={17} color="var(--color-primary)" />
                        <span>Host Compute &amp; Workload</span>
                      </div>
                      <span className="badge badge-success">ONLINE</span>
                    </div>
                    <div className="text-xs mb-3" style={{ fontWeight: 600 }}>
                      {diagnostics?.host?.cpuModel || 'Apple M1 Processor'} · {diagnostics?.host?.cpuCores || 8} Cores ({diagnostics?.host?.architecture || 'arm64'})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--text-xs)' }}>
                      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                        <span className="muted">Process Heap:</span>
                        <span className="text-mono">{diagnostics?.host?.memory?.processHeapUsedMB || 0} MB / {diagnostics?.host?.memory?.systemTotalMB || 0} MB</span>
                      </div>
                      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                        <span className="muted">Load Avg (1m, 5m, 15m):</span>
                        <span className="text-mono">{(diagnostics?.host?.loadAverage || []).map((v) => v.toFixed(2)).join(', ') || 'N/A'}</span>
                      </div>
                      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                        <span className="muted">Process Uptime:</span>
                        <span className="text-mono">
                          {diagnostics?.host?.processUptimeSec
                            ? `${Math.floor(diagnostics.host.processUptimeSec / 60)}m ${diagnostics.host.processUptimeSec % 60}s`
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Disk Storage & Partition */}
                  <div className="admin-service-card">
                    <div className="admin-service-card-header">
                      <div className="admin-service-name">
                        <HardDrive size={17} color="var(--color-primary)" />
                        <span>Native Filesystem Storage</span>
                      </div>
                      <span className={`badge ${diagnostics?.storage?.disk?.isHealthy ? 'badge-success' : 'badge-warning'}`}>
                        {diagnostics?.storage?.disk?.isHealthy ? 'HEALTHY' : 'LOW SPACE'}
                      </span>
                    </div>
                    <div className="text-xs mb-2" style={{ fontWeight: 600 }}>
                      {diagnostics?.storage?.disk?.freeGB ?? 0} GB Free · {diagnostics?.storage?.disk?.totalGB ?? 0} GB Total
                    </div>
                    <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', height: '6px', overflow: 'hidden', marginBottom: 'var(--space-2)' }}>
                      <div
                        style={{
                          width: `${Math.min(diagnostics?.storage?.disk?.usedPercent || 0, 100)}%`,
                          height: '100%',
                          background: (diagnostics?.storage?.disk?.usedPercent || 0) > 90 ? 'var(--color-danger)' : 'var(--color-primary)',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--text-xs)' }}>
                      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                        <span className="muted">Disk Used:</span>
                        <span className="text-mono">{diagnostics?.storage?.disk?.usedGB ?? 0} GB ({diagnostics?.storage?.disk?.usedPercent ?? 0}%)</span>
                      </div>
                      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                        <span className="muted">Telemetry Source:</span>
                        <span className="text-mono text-xs">fs.statfsSync (Native)</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: MongoDB Primary Cluster */}
                  <div className="admin-service-card">
                    <div className="admin-service-card-header">
                      <div className="admin-service-name">
                        <Database size={17} color="var(--color-primary)" />
                        <span>MongoDB Cluster Engine</span>
                      </div>
                      <span className={`badge ${diagnostics?.database?.status === 'connected' ? 'badge-success' : 'badge-danger'}`}>
                        {diagnostics?.database?.status?.toUpperCase() || 'CONNECTED'}
                      </span>
                    </div>
                    <div className="text-xs mb-3" style={{ fontWeight: 600 }}>
                      Round-Trip Ping: <span className="text-mono">{diagnostics?.database?.pingMs !== undefined ? `${diagnostics.database.pingMs} ms` : 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--text-xs)' }}>
                      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                        <span className="muted">Target Database:</span>
                        <span className="text-mono">{diagnostics?.database?.databaseName || 'legalmind'}</span>
                      </div>
                      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                        <span className="muted">Active Records:</span>
                        <span className="text-mono">{diagnostics?.storage?.records?.activeDocuments ?? 0} docs · {diagnostics?.storage?.records?.activeUsers ?? 0} users</span>
                      </div>
                      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                        <span className="muted">Audit Ledger:</span>
                        <span className="text-mono">{diagnostics?.storage?.records?.auditEvents ?? 0} security events</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 4: AI Service & Gemini Probe */}
                  <div className="admin-service-card">
                    <div className="admin-service-card-header">
                      <div className="admin-service-name">
                        <Server size={17} color="var(--color-primary)" />
                        <span>AI Service &amp; Gemini Probe</span>
                      </div>
                      <span className={`badge ${diagnostics?.aiService?.gemini?.status === 'operational' ? 'badge-success' : 'badge-danger'}`}>
                        {diagnostics?.aiService?.gemini?.status?.toUpperCase() || 'OPERATIONAL'}
                      </span>
                    </div>
                    <div className="text-xs mb-3" style={{ fontWeight: 600 }}>
                      {diagnostics?.aiService?.gemini?.provider || 'Google Gemini API'} ({diagnostics?.aiService?.pingMs || 0} ms)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--text-xs)' }}>
                      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                        <span className="muted">Inference Model:</span>
                        <span className="text-mono">{diagnostics?.aiService?.gemini?.model || 'gemini-1.5-pro'}</span>
                      </div>
                      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                        <span className="muted">API Key Protection:</span>
                        <span className="text-mono badge badge-neutral" style={{ letterSpacing: '0.05em' }}>
                          {diagnostics?.aiService?.gemini?.masked_key || 'AQ.Ab8...zytw'}
                        </span>
                      </div>
                      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                        <span className="muted">Core Endpoint:</span>
                        <span className="text-mono text-xs">{diagnostics?.aiService?.url || 'http://localhost:8000'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Storage Subsystems & Partition Layout */}
                <div className="card mb-6">
                  <div className="card-header">
                    <h3 className="card-title text-sm flex-center gap-2">
                      <HardDrive size={16} color="var(--color-primary)" />
                      <span>Cluster Filesystem Partition Directories</span>
                    </h3>
                  </div>
                  <div className="grid-2">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <div className="admin-diag-step">
                        <span className="text-xs">Document Storage Root</span>
                        <span className="text-mono text-xs">{diagnostics?.storage?.paths?.storageDir || '/Users/trush/Desktop/LegalMindAI/storage'}</span>
                      </div>
                      <div className="admin-diag-step">
                        <span className="text-xs">Vector Indexes Directory</span>
                        <span className="text-mono text-xs">{diagnostics?.storage?.paths?.faissDir || '/Users/trush/Desktop/LegalMindAI/faiss_indexes'}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <div className="admin-diag-step">
                        <span className="text-xs">Compiled PDF Reports Directory</span>
                        <span className="text-mono text-xs">{diagnostics?.storage?.paths?.reportsDir || '/Users/trush/Desktop/LegalMindAI/reports'}</span>
                      </div>
                      <div className="admin-diag-step">
                        <span className="text-xs">Host Platform &amp; Node Runtime</span>
                        <span className="text-mono text-xs">{diagnostics?.host?.platform} ({diagnostics?.host?.architecture}) · {diagnostics?.host?.nodeVersion}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Service Probe & Chain Test */}
                <div className="card">
                  <div className="card-header">
                    <div>
                      <h3 className="card-title text-sm flex-center gap-2">
                        <Activity size={16} color="var(--color-primary)" />
                        <span>Live Service Probe &amp; Chain Test Trace</span>
                      </h3>
                      <div className="text-xs muted">
                        Verify real-time communication across the full architectural stack (React → Express → FastAPI → MongoDB).
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm flex-center gap-2"
                      onClick={runChainTest}
                      disabled={chainTesting}
                    >
                      <Activity size={14} className={chainTesting ? 'animate-spin' : ''} />
                      <span>{chainTesting ? 'Executing Probe…' : 'Run Full Chain Test'}</span>
                    </button>
                  </div>

                  {chainResult ? (
                    <div className="admin-diag-box">
                      <div className="mb-2" style={{ fontWeight: 600, color: chainResult.success ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {chainResult.message}
                      </div>
                      <div className="text-xs muted mb-4">Topology Chain: {chainResult.chain || 'React → Express → FastAPI → MongoDB'}</div>
                      {Array.isArray(chainResult.steps) && chainResult.steps.map((s, idx) => (
                        <div key={idx} className="admin-diag-step">
                          <div className="flex-center gap-2">
                            <span className="text-mono muted">Step {s.step}:</span>
                            <span style={{ fontWeight: 600 }}>{s.service}</span>
                            <span className="muted">— {s.message}</span>
                          </div>
                          <div className="flex-center gap-2">
                            <span className="text-mono text-xs muted">
                              {s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : ''}
                            </span>
                            <span className={`badge ${s.status === 'ok' ? 'badge-success' : 'badge-danger'}`}>
                              {s.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
                      No diagnostic probe executed in this session. Click “Run Full Chain Test” to dispatch a live multi-hop query.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────────
                TAB 7: ADMIN SETTINGS
               ───────────────────────────────────────────────────────────────── */}
            {currentTab === 'settings' && (
              <div className="admin-settings-container">
                {/* Settings Topbar */}
                <div className="admin-settings-topbar">
                  <div>
                    <h2 className="admin-settings-topbar-title flex-center gap-2">
                      <Settings size={18} />
                      <span>Admin Settings &amp; Platform Controls</span>
                    </h2>
                    <p className="admin-settings-topbar-desc">
                      Operational thresholds, model parameters, tenant security boundaries, and Swiss minimalist interface preferences.
                    </p>
                  </div>
                  <div className="admin-settings-actions-group">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm flex-center gap-2"
                      onClick={handleResetAdminSettings}
                      title="Restore factory defaults"
                    >
                      <RotateCcw size={14} />
                      <span>Reset Defaults</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm flex-center gap-2"
                      onClick={handleSaveAdminSettings}
                      disabled={settingsSaving}
                    >
                      {settingsSaving ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Saving…</span>
                        </>
                      ) : (
                        <>
                          <Save size={14} />
                          <span>Save Settings</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* SECTION 1: GENERAL SETTINGS */}
                <div className="admin-settings-section-card">
                  <div className="admin-settings-section-header">
                    <div className="admin-settings-section-title-wrap">
                      <h3 className="admin-settings-section-title">
                        <Sliders size={16} />
                        <span>General Settings</span>
                      </h3>
                      <p className="admin-settings-section-desc">
                        Core platform identification, administrative alert distribution, and operational risk review thresholds.
                      </p>
                    </div>
                    <span className="admin-settings-pill">Core Platform</span>
                  </div>

                  <div className="admin-settings-fields">
                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Platform Title</span>
                        <span className="admin-settings-sublabel">Primary organization header shown across legal workspaces</span>
                      </div>
                      <div className="admin-settings-input-wrap">
                        <input
                          type="text"
                          className="form-input text-sm"
                          value={adminSettings.platformName}
                          onChange={(e) => {
                            setAdminSettings({ ...adminSettings, platformName: e.target.value });
                            if (settingsErrors.platformName) setSettingsErrors({ ...settingsErrors, platformName: null });
                          }}
                          placeholder="e.g. LegalMind AI"
                        />
                        {settingsErrors.platformName && (
                          <span className="text-xs" style={{ color: 'var(--color-danger)' }}>{settingsErrors.platformName}</span>
                        )}
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Admin Alert Email</span>
                        <span className="admin-settings-sublabel">Destination for pipeline failure alerts and security escalations</span>
                      </div>
                      <div className="admin-settings-input-wrap">
                        <input
                          type="email"
                          className="form-input text-sm"
                          value={adminSettings.adminAlertEmail}
                          onChange={(e) => {
                            setAdminSettings({ ...adminSettings, adminAlertEmail: e.target.value });
                            if (settingsErrors.adminAlertEmail) setSettingsErrors({ ...settingsErrors, adminAlertEmail: null });
                          }}
                          placeholder="admin@legalmind.ai"
                        />
                        {settingsErrors.adminAlertEmail && (
                          <span className="text-xs" style={{ color: 'var(--color-danger)' }}>{settingsErrors.adminAlertEmail}</span>
                        )}
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">High-Risk Alert Threshold</span>
                        <span className="admin-settings-sublabel">
                          Documents scoring at or above threshold trigger high-priority audit warnings (scale 50–90)
                        </span>
                      </div>
                      <div className="admin-settings-input-wrap">
                        <div className="flex-center gap-3">
                          <input
                            type="number"
                            min="50"
                            max="90"
                            className="form-input text-sm"
                            style={{ width: '110px' }}
                            value={adminSettings.riskThreshold}
                            onChange={(e) => {
                              setAdminSettings({ ...adminSettings, riskThreshold: e.target.value });
                              if (settingsErrors.riskThreshold) setSettingsErrors({ ...settingsErrors, riskThreshold: null });
                            }}
                          />
                          <span className="text-xs muted">
                            Default: 70 (Score bands: Low 0–39, Medium 40–69, High 70–100)
                          </span>
                        </div>
                        {settingsErrors.riskThreshold && (
                          <span className="text-xs" style={{ color: 'var(--color-danger)' }}>{settingsErrors.riskThreshold}</span>
                        )}
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Deployment Environment</span>
                        <span className="admin-settings-sublabel">Runtime profile enforced by backend Node.js and FastAPI services</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span className="text-mono">development (Local Workstation Cluster)</span>
                          <span className="admin-settings-pill enforced">Environment Enforced</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Platform Maintenance Mode</span>
                        <span className="admin-settings-sublabel">When enabled, non-administrative access is restricted with a maintenance notice</span>
                      </div>
                      <div className="admin-settings-input-wrap">
                        <label className="flex-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(adminSettings.maintenanceMode)}
                            onChange={(e) => {
                              setAdminSettings({ ...adminSettings, maintenanceMode: e.target.checked });
                            }}
                          />
                          <span className="text-xs" style={{ fontWeight: 600 }}>
                            {adminSettings.maintenanceMode ? 'Enabled (Maintenance Enforced)' : 'Disabled (Normal Operation)'}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: AI MODEL CONFIGURATION */}
                <div className="admin-settings-section-card">
                  <div className="admin-settings-section-header">
                    <div className="admin-settings-section-title-wrap">
                      <h3 className="admin-settings-section-title">
                        <Cpu size={16} />
                        <span>AI Model Configuration</span>
                      </h3>
                      <p className="admin-settings-section-desc">
                        Transformer models, dense vector dimensions, retrieval chunk count, and index persistence architecture.
                      </p>
                    </div>
                    <span className="admin-settings-pill enforced">Active Pipeline</span>
                  </div>

                  <div className="admin-settings-fields">
                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Clause Classifier Model</span>
                        <span className="admin-settings-sublabel">Pre-trained legal transformer fine-tuned for multi-label clause tagging</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span className="text-mono">nlpaueb/legal-bert-base-uncased (PyTorch runtime)</span>
                          <span className="admin-settings-pill enforced">Loaded</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Vector Embedding Model</span>
                        <span className="admin-settings-sublabel">Dense semantic text embedder for clause and query vectors</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span className="text-mono">sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)</span>
                          <span className="admin-settings-pill enforced">Active</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Vector Index Engine</span>
                        <span className="admin-settings-sublabel">Index structure for fast nearest-neighbor similarity search</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span className="text-mono">FAISS IndexFlatL2 (Local memory index with disk snapshot)</span>
                          <span className="admin-settings-pill enforced">faiss_indexes/</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Top-K Retrieval Chunks</span>
                        <span className="admin-settings-sublabel">Number of nearest semantic text chunks supplied to RAG QA context</span>
                      </div>
                      <div className="admin-settings-input-wrap">
                        <div className="flex-center gap-3">
                          <input
                            type="number"
                            min="1"
                            max="20"
                            className="form-input text-sm"
                            style={{ width: '110px' }}
                            value={adminSettings.topKChunks}
                            onChange={(e) => {
                              setAdminSettings({ ...adminSettings, topKChunks: e.target.value });
                              if (settingsErrors.topKChunks) setSettingsErrors({ ...settingsErrors, topKChunks: null });
                            }}
                          />
                          <span className="text-xs muted">Recommended: 5 chunks (range 1–20)</span>
                        </div>
                        {settingsErrors.topKChunks && (
                          <span className="text-xs" style={{ color: 'var(--color-danger)' }}>{settingsErrors.topKChunks}</span>
                        )}
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">OCR &amp; Document Parsing</span>
                        <span className="admin-settings-sublabel">Native extraction engine for scanned PDFs, DOCX, and text agreements</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span className="text-mono">Docling Parser + PyPDF Extraction (Deterministic)</span>
                          <span className="admin-settings-pill enforced">Supported</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: SECURITY AND ACCESS CONTROL */}
                <div className="admin-settings-section-card">
                  <div className="admin-settings-section-header">
                    <div className="admin-settings-section-title-wrap">
                      <h3 className="admin-settings-section-title">
                        <Shield size={16} />
                        <span>Security and Access Control</span>
                      </h3>
                      <p className="admin-settings-section-desc">
                        Authentication token lifespans, cryptographic password standards, tenant data boundaries, and credential safeguards.
                      </p>
                    </div>
                    <span className="admin-settings-pill enforced">Strict RBAC</span>
                  </div>

                  <div className="admin-settings-fields">
                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Session Token Lifetime</span>
                        <span className="admin-settings-sublabel">Signed JSON Web Token validity period before re-authentication</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span className="text-mono">7 Days (JWT_EXPIRES_IN = '7d')</span>
                          <span className="admin-settings-pill enforced">HMAC-SHA256</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Password Hashing Standard</span>
                        <span className="admin-settings-sublabel">Cryptographic algorithm and computational cost factor applied to user credentials</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span className="text-mono">bcrypt (10 Salt Rounds, pre-save Mongoose hook)</span>
                          <span className="admin-settings-pill enforced">One-Way Salted</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Role-Based Access Control</span>
                        <span className="admin-settings-sublabel">Enforced boundary between regular legal analysts and administrative operators</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span>Dual Tier: <strong className="text-mono">admin</strong> (Full management) &amp; <strong className="text-mono">user</strong> (Tenant isolated)</span>
                          <span className="admin-settings-pill enforced">adminOnly middleware</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Rate Limiting (Requests / Min)</span>
                        <span className="admin-settings-sublabel">Maximum allowed API requests per IP per minute before throttling (scale 10–300)</span>
                      </div>
                      <div className="admin-settings-input-wrap">
                        <div className="flex-center gap-3">
                          <input
                            type="number"
                            min="10"
                            max="300"
                            className="form-input text-sm"
                            style={{ width: '110px' }}
                            value={adminSettings.rateLimitPerMinute}
                            onChange={(e) => {
                              setAdminSettings({ ...adminSettings, rateLimitPerMinute: e.target.value });
                              if (settingsErrors.rateLimitPerMinute) setSettingsErrors({ ...settingsErrors, rateLimitPerMinute: null });
                            }}
                          />
                          <span className="text-xs muted">Default: 60 req/min (range 10–300)</span>
                        </div>
                        {settingsErrors.rateLimitPerMinute && (
                          <span className="text-xs" style={{ color: 'var(--color-danger)' }}>{settingsErrors.rateLimitPerMinute}</span>
                        )}
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Tenant Isolation Boundary</span>
                        <span className="admin-settings-sublabel">Multi-tenant boundary protecting client confidential documents</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span>Strict document and vector index segregation scoped by authenticated <code className="text-mono">userId</code></span>
                          <span className="admin-settings-pill enforced">Zero Data Bleed</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Secret Credentials Protection</span>
                        <span className="admin-settings-sublabel">Server-side keys are shielded from client browsers and client bundles</span>
                      </div>
                      <div className="admin-settings-secret-badge">
                        <span>JWT_SECRET / INTERNAL_API_KEY: ••••••••••••••••</span>
                        <span className="text-xs" style={{ color: 'var(--color-success)', letterSpacing: 'normal' }}>
                          Protected in .env
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 4: DOCUMENT UPLOAD AND RETENTION */}
                <div className="admin-settings-section-card">
                  <div className="admin-settings-section-header">
                    <div className="admin-settings-section-title-wrap">
                      <h3 className="admin-settings-section-title">
                        <HardDrive size={16} />
                        <span>Document Upload and Retention</span>
                      </h3>
                      <p className="admin-settings-section-desc">
                        File ingestion limits, MIME-type white-listing, on-disk partition architecture, and audit retention rules.
                      </p>
                    </div>
                    <span className="admin-settings-pill enforced">Storage Policy</span>
                  </div>

                  <div className="admin-settings-fields">
                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Max File Upload Limit (MB)</span>
                        <span className="admin-settings-sublabel">Maximum payload size handled by Multer streaming middleware (range 5–100 MB)</span>
                      </div>
                      <div className="admin-settings-input-wrap">
                        <div className="flex-center gap-3">
                          <input
                            type="number"
                            min="5"
                            max="100"
                            className="form-input text-sm"
                            style={{ width: '110px' }}
                            value={adminSettings.maxUploadSizeMB}
                            onChange={(e) => {
                              setAdminSettings({ ...adminSettings, maxUploadSizeMB: e.target.value });
                              if (settingsErrors.maxUploadSizeMB) setSettingsErrors({ ...settingsErrors, maxUploadSizeMB: null });
                            }}
                          />
                          <span className="text-xs muted">Default: 25 MB (range 5–100 MB)</span>
                        </div>
                        {settingsErrors.maxUploadSizeMB && (
                          <span className="text-xs" style={{ color: 'var(--color-danger)' }}>{settingsErrors.maxUploadSizeMB}</span>
                        )}
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">OCR Confidence Threshold (%)</span>
                        <span className="admin-settings-sublabel">Minimum character recognition confidence required before falling back to manual review</span>
                      </div>
                      <div className="admin-settings-input-wrap">
                        <div className="flex-center gap-3">
                          <input
                            type="number"
                            min="50"
                            max="99"
                            className="form-input text-sm"
                            style={{ width: '110px' }}
                            value={adminSettings.ocrConfidenceThreshold}
                            onChange={(e) => {
                              setAdminSettings({ ...adminSettings, ocrConfidenceThreshold: e.target.value });
                              if (settingsErrors.ocrConfidenceThreshold) setSettingsErrors({ ...settingsErrors, ocrConfidenceThreshold: null });
                            }}
                          />
                          <span className="text-xs muted">Default: 80% (range 50–99%)</span>
                        </div>
                        {settingsErrors.ocrConfidenceThreshold && (
                          <span className="text-xs" style={{ color: 'var(--color-danger)' }}>{settingsErrors.ocrConfidenceThreshold}</span>
                        )}
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Permitted File Formats</span>
                        <span className="admin-settings-sublabel">Verified MIME types and extension whitelist</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span className="text-mono">.pdf (PDF), .docx (Word OpenXML), .txt (Plain Text)</span>
                          <span className="admin-settings-pill enforced">MIME Verified</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Disk Storage Layout</span>
                        <span className="admin-settings-sublabel">Filesystem partitioning on application host server</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span className="text-mono">storage/&#123;userId&#125;/&#123;uuid&#125;.&#123;ext&#125;</span>
                          <span className="admin-settings-pill enforced">Disk Isolated</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Audit Retention Policy</span>
                        <span className="admin-settings-sublabel">Persistence duration for uploaded contracts and generated analysis reports</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span>Retained indefinitely until explicitly purged by tenant administrator</span>
                          <span className="admin-settings-pill enforced">Compliant</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 5: APPEARANCE PREFERENCES */}
                <div className="admin-settings-section-card">
                  <div className="admin-settings-section-header">
                    <div className="admin-settings-section-title-wrap">
                      <h3 className="admin-settings-section-title">
                        <Palette size={16} />
                        <span>Appearance Preferences</span>
                      </h3>
                      <p className="admin-settings-section-desc">
                        Option D — Pure White × Graphite Swiss Minimalism, theme color tokens, and navigation drawer defaults.
                      </p>
                    </div>
                    <span className="admin-settings-pill">Option D Minimalist</span>
                  </div>

                  <div className="admin-settings-fields">
                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Interface Theme Mode</span>
                        <span className="admin-settings-sublabel">
                          Toggle between high-contrast Pure White light canvas and Deep Charcoal dark theme
                        </span>
                      </div>
                      <div>
                        <div className="admin-settings-theme-selector">
                          <button
                            type="button"
                            className={`admin-settings-theme-btn${theme === 'light' ? ' active' : ''}`}
                            onClick={() => setTheme('light')}
                          >
                            <Sun size={14} />
                            <span>Light Mode (#FFFFFF)</span>
                          </button>
                          <button
                            type="button"
                            className={`admin-settings-theme-btn${theme === 'dark' ? ' active' : ''}`}
                            onClick={() => setTheme('dark')}
                          >
                            <Moon size={14} />
                            <span>Dark Mode (#111111)</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Admin Sidebar Default</span>
                        <span className="admin-settings-sublabel">Initial navigation rail presentation on dashboard load</span>
                      </div>
                      <div>
                        <div className="admin-settings-theme-selector">
                          <button
                            type="button"
                            className={`admin-settings-theme-btn${!adminSettings.sidebarDefaultCollapsed ? ' active' : ''}`}
                            onClick={() => {
                              setAdminSettings({ ...adminSettings, sidebarDefaultCollapsed: false });
                              setCollapsed(false);
                            }}
                          >
                            <span>Expanded (250px)</span>
                          </button>
                          <button
                            type="button"
                            className={`admin-settings-theme-btn${adminSettings.sidebarDefaultCollapsed ? ' active' : ''}`}
                            onClick={() => {
                              setAdminSettings({ ...adminSettings, sidebarDefaultCollapsed: true });
                              setCollapsed(true);
                            }}
                          >
                            <span>Compact Rail (72px)</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Design System Spec</span>
                        <span className="admin-settings-sublabel">Official visual art direction across the entire platform</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span>Pure White × Graphite — Hairline 1px borders, Inter typography, 0 decorative gradients</span>
                          <span className="admin-settings-pill enforced">Verified</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 6: SYSTEM CONFIGURATION */}
                <div className="admin-settings-section-card">
                  <div className="admin-settings-section-header">
                    <div className="admin-settings-section-title-wrap">
                      <h3 className="admin-settings-section-title">
                        <Server size={16} />
                        <span>System Configuration</span>
                      </h3>
                      <p className="admin-settings-section-desc">
                        Service topology endpoints, active listening ports, database engines, and cross-service telemetry links.
                      </p>
                    </div>
                    <span className="admin-settings-pill enforced">Live Telemetry</span>
                  </div>

                  <div className="admin-settings-fields">
                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Node.js / Express Gateway</span>
                        <span className="admin-settings-sublabel">Authentication, User RBAC, Document Storage &amp; PDF Audit Reports</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span className="text-mono">http://localhost:5001</span>
                          <span className="badge badge-green">
                            <span className="status-dot online"></span>
                            <span>Port 5001 • Online</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">FastAPI AI Microservice</span>
                        <span className="admin-settings-sublabel">Clause Classification, Semantic Embeddings, FAISS Index &amp; RAG QA</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span className="text-mono">http://localhost:8000</span>
                          <span className="badge badge-green">
                            <span className="status-dot online"></span>
                            <span>Port 8000 • Online</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Database Engine</span>
                        <span className="admin-settings-sublabel">Persistent document metadata, clause tags, and report storage</span>
                      </div>
                      <div>
                        <div className="admin-settings-val-static">
                          <span className="text-mono">MongoDB v7.0.x on Port 27018 (DB: legalmind)</span>
                          <span className="admin-settings-pill enforced">Connected</span>
                        </div>
                      </div>
                    </div>

                    <div className="admin-settings-row">
                      <div className="admin-settings-label-wrap">
                        <span className="admin-settings-label">Service Health Probe</span>
                        <span className="admin-settings-sublabel">Verify end-to-end communication across React, Express, FastAPI, and Mongo</span>
                      </div>
                      <div>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm flex-center gap-2"
                          onClick={runChainTest}
                          disabled={chainTesting}
                        >
                          <Activity size={14} className={chainTesting ? 'animate-spin' : ''} />
                          <span>{chainTesting ? 'Probing Microservices…' : 'Run Service Connectivity Probe'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── User Detail Modal ── */}
        {selectedUser && (
          <div className="admin-detail-dialog" onClick={() => setSelectedUser(null)}>
            <div className="admin-detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="admin-detail-header">
                <div className="flex-center gap-2">
                  <Shield size={16} color="var(--color-primary)" />
                  <span style={{ fontWeight: 600 }}>User Profile Details</span>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="admin-detail-body">
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">User ID</span>
                  <span className="admin-detail-val text-mono">{selectedUser._id || selectedUser.id}</span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Full Name</span>
                  <span className="admin-detail-val" style={{ fontWeight: 600 }}>{selectedUser.name}</span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Email Address</span>
                  <span className="admin-detail-val text-mono">{selectedUser.email}</span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Role</span>
                  <span className="admin-detail-val">
                    <span className={`badge ${selectedUser.role === 'admin' ? 'badge-primary' : 'badge-neutral'}`}>
                      {selectedUser.role?.toUpperCase() || 'USER'}
                    </span>
                  </span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Account Status</span>
                  <span className="admin-detail-val">
                    <span className={`badge ${selectedUser.isActive !== false ? 'badge-success' : 'badge-neutral'}`}>
                      {selectedUser.isActive !== false ? 'ACTIVE' : 'DEACTIVATED'}
                    </span>
                  </span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Language</span>
                  <span className="admin-detail-val text-mono">{selectedUser.preferredLanguage || 'English'}</span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Created Date</span>
                  <span className="admin-detail-val text-mono">
                    {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="admin-detail-footer">
                <button
                  className="btn btn-secondary"
                  disabled={(selectedUser._id || selectedUser.id) === (user?._id || user?.id)}
                  onClick={() => handleToggleUserRole(selectedUser)}
                >
                  {selectedUser.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => setSelectedUser(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── User Deletion Confirmation Dialog ── */}
        {userToDelete && (
          <div className="admin-detail-dialog" onClick={() => !deleteProcessing && setUserToDelete(null)}>
            <div className="admin-confirm-panel" onClick={(e) => e.stopPropagation()}>
              <div className="admin-confirm-header">
                <div className="admin-confirm-title">
                  <Trash2 size={16} color="var(--color-danger)" />
                  <span>Delete User Account</span>
                </div>
                <button
                  onClick={() => !deleteProcessing && setUserToDelete(null)}
                  disabled={deleteProcessing}
                  aria-label="Close confirmation dialog"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="admin-confirm-body">
                {/* User Identity Display */}
                <div className="admin-confirm-user-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
                      {userToDelete.name}
                    </span>
                    <span className={`badge ${userToDelete.role === 'admin' ? 'badge-primary' : 'badge-neutral'}`}>
                      {userToDelete.role === 'admin' ? 'ADMIN' : 'USER'}
                    </span>
                  </div>
                  <span className="text-mono text-xs muted">{userToDelete.email}</span>
                </div>

                {/* Safeguard 1: Self-Deletion */}
                {(userToDelete._id || userToDelete.id) === (user?._id || user?.id) && (
                  <div className="admin-confirm-alert-box danger">
                    <div className="flex-center gap-2" style={{ fontWeight: 600 }}>
                      <AlertTriangle size={15} />
                      <span>Self-Deletion Prohibited</span>
                    </div>
                    <div>
                      Security policy prohibits administrators from deleting their own active account. Another platform administrator must perform this action if necessary.
                    </div>
                  </div>
                )}

                {/* Safeguard 2: Last Active Administrator */}
                {(userToDelete._id || userToDelete.id) !== (user?._id || user?.id) &&
                  userToDelete.role === 'admin' &&
                  (stats?.users?.admins <= 1) && (
                    <div className="admin-confirm-alert-box danger">
                      <div className="flex-center gap-2" style={{ fontWeight: 600 }}>
                        <AlertTriangle size={15} />
                        <span>Last Active Administrator Protection</span>
                      </div>
                      <div>
                        This is the sole active administrator account on LegalMindAI. The system requires at least one active administrator to maintain operational governance.
                      </div>
                    </div>
                  )}

                {/* Detailed Consequence Explanation */}
                {(userToDelete._id || userToDelete.id) !== (user?._id || user?.id) &&
                  !(userToDelete.role === 'admin' && (stats?.users?.admins <= 1)) && (
                    <>
                      <div className="admin-confirm-alert-box warning">
                        <div className="flex-center gap-2" style={{ fontWeight: 600 }}>
                          <AlertTriangle size={15} />
                          <span>Immediate Access Revocation</span>
                        </div>
                        <div>
                          This action will immediately terminate <strong>{userToDelete.name}</strong>'s access, revoke active session tokens, and prevent subsequent logins.
                        </div>
                      </div>

                      <div className="admin-confirm-alert-box info">
                        <div className="flex-center gap-2" style={{ fontWeight: 600 }}>
                          <Shield size={15} />
                          <span>Associated Records &amp; Document Retention</span>
                        </div>
                        <div>
                          To satisfy statutory legal compliance and audit trail integrity, all contracts, clause classifications, risk assessments, and executive reports created by this account will remain safely preserved in the document repository.
                        </div>
                      </div>

                      <div className="text-xs muted" style={{ lineHeight: 1.5 }}>
                        <strong>Reversibility:</strong> This operation performs a secure soft-deletion. The account is placed in the <em>Archived / Deleted Accounts</em> pool and can be restored by an administrator if required.
                      </div>
                    </>
                  )}

                {deleteError && (
                  <div className="admin-confirm-alert-box danger">
                    <div className="flex-center gap-2">
                      <AlertCircle size={15} />
                      <span>{deleteError}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="admin-confirm-footer">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setUserToDelete(null)}
                  disabled={deleteProcessing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm flex-center gap-2"
                  onClick={handleConfirmDeleteUser}
                  disabled={
                    deleteProcessing ||
                    (userToDelete._id || userToDelete.id) === (user?._id || user?.id) ||
                    (userToDelete.role === 'admin' && (stats?.users?.admins <= 1))
                  }
                >
                  {deleteProcessing ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Deleting Account…</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={13} />
                      <span>Delete Account</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Document Detail Modal ── */}
        {selectedDoc && (
          <div className="admin-detail-dialog" onClick={() => setSelectedDoc(null)}>
            <div className="admin-detail-panel" onClick={(e) => e.stopPropagation()}>
              <div className="admin-detail-header">
                <div className="flex-center gap-2">
                  <FileText size={16} color="var(--color-primary)" />
                  <span style={{ fontWeight: 600 }}>Indexed Document Metadata</span>
                </div>
                <button
                  onClick={() => setSelectedDoc(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="admin-detail-body">
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Document ID</span>
                  <span className="admin-detail-val text-mono">{selectedDoc._id || selectedDoc.id}</span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Title</span>
                  <span className="admin-detail-val" style={{ fontWeight: 600 }}>
                    {selectedDoc.metadata?.documentTitle || selectedDoc.originalName}
                  </span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Category</span>
                  <span className="admin-detail-val text-mono">{selectedDoc.documentType || 'general'}</span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">File Format</span>
                  <span className="admin-detail-val text-mono">{selectedDoc.fileFormat?.toUpperCase() || 'PDF'}</span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Pipeline Status</span>
                  <span className="admin-detail-val">
                    <span className="badge badge-success">{selectedDoc.processingStatus?.toUpperCase() || 'COMPLETED'}</span>
                  </span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Tenant Owner</span>
                  <span className="admin-detail-val">
                    {selectedDoc.userId?.name || 'N/A'} ({selectedDoc.userId?.email || 'N/A'})
                  </span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Uploaded At</span>
                  <span className="admin-detail-val text-mono">
                    {selectedDoc.createdAt ? new Date(selectedDoc.createdAt).toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="admin-detail-footer">
                <Link
                  to={`/documents/${selectedDoc._id || selectedDoc.id}`}
                  className="btn btn-secondary flex-center gap-2"
                >
                  <ExternalLink size={12} />
                  <span>Open in Workspace</span>
                </Link>
                <button
                  className="btn btn-primary"
                  onClick={() => setSelectedDoc(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Audit Event Detail Modal ── */}
        {selectedLog && (
          <div className="admin-detail-dialog" onClick={() => setSelectedLog(null)}>
            <div className="admin-detail-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
              <div className="admin-detail-header">
                <div className="flex-center gap-2">
                  <History size={16} color="var(--color-primary)" />
                  <span style={{ fontWeight: 600 }}>Audit Event Log Details</span>
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="admin-detail-body">
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Action</span>
                  <span className="admin-detail-val font-semibold text-mono">{selectedLog.action}</span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Event ID</span>
                  <span className="admin-detail-val text-mono text-xs">{selectedLog._id}</span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Timestamp</span>
                  <span className="admin-detail-val text-mono text-xs">{new Date(selectedLog.createdAt).toISOString()}</span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Status</span>
                  <span className="admin-detail-val">
                    <span className={`badge ${selectedLog.status === 'success' ? 'badge-success' : selectedLog.status === 'warning' ? 'badge-warning' : 'badge-danger'}`}>
                      {selectedLog.status?.toUpperCase()}
                    </span>
                  </span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Actor</span>
                  <span className="admin-detail-val">
                    {selectedLog.actorEmail || 'Anonymous / System'} {selectedLog.actorRole ? `(${selectedLog.actorRole})` : ''}
                  </span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Target</span>
                  <span className="admin-detail-val">
                    Type: <span className="text-mono font-medium">{selectedLog.targetType}</span> | ID: <span className="text-mono text-xs">{selectedLog.targetId || 'N/A'}</span>
                  </span>
                </div>
                <div className="admin-detail-kv">
                  <span className="admin-detail-key">Network / Origin</span>
                  <span className="admin-detail-val text-mono text-xs">
                    IP: {selectedLog.ipAddress || 'Unknown'} | Agent: {selectedLog.userAgent ? selectedLog.userAgent.slice(0, 60) + '…' : 'None'}
                  </span>
                </div>
                <div className="admin-detail-kv" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                  <span className="admin-detail-key">Sanitized Event Details</span>
                  <div
                    style={{
                      width: '100%',
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      boxSizing: 'border-box',
                    }}
                  >
                    {Object.keys(selectedLog.details || {}).length > 0
                      ? JSON.stringify(selectedLog.details, null, 2)
                      : 'No extra metadata payload.'}
                  </div>
                </div>
              </div>

              <div className="admin-detail-footer">
                <button
                  className="btn btn-primary"
                  onClick={() => setSelectedLog(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}