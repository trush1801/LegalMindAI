import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT on every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('lm_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Normalize errors + handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    let message = 'Request failed';

    if (!error.response) {
      message = 'Unable to connect to the server. Please try again.';
    } else if (typeof error.response.data?.message === 'string') {
      message = error.response.data.message;
    } else if (typeof error.response.data?.error === 'string') {
      message = error.response.data.error;
    } else if (typeof error.response.data?.error?.message === 'string') {
      message = error.response.data.error.message;
    } else if (error.message) {
      message = error.message;
    }

    if (status === 401) {
      const reqUrl = error.config?.url || '';
      const isAuthEndpoint = reqUrl.includes('/auth/login') || reqUrl.includes('/auth/register');

      if (!isAuthEndpoint) {
        localStorage.removeItem('lm_token');
        localStorage.removeItem('lm_user');
        if (!window.location.pathname.startsWith('/login') &&
            !window.location.pathname.startsWith('/register')) {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject({
      status,
      message,
      data: error.response?.data,
      raw: error,
    });
  }
);

/* ——— Auth ——— */
export const authAPI = {
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  me: () => api.get('/auth/me'),
  updateProfile: (payload) => api.put('/auth/update-profile', payload),
  changePassword: (payload) => api.put('/auth/change-password', payload),
  logout: () => api.post('/auth/logout'),
  deleteAccount: (payload) => api.delete('/auth/delete-account', { data: payload }),
};

/* ——— Documents ——— */
export const documentAPI = {
  list: (params) => api.get('/documents', { params }),
  getById: (id) => api.get(`/documents/${id}`),
  getStatus: (id) => api.get(`/documents/${id}/status`),
  getTypes: () => api.get('/documents/types'),
  upload: (formData) =>
    api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  remove: (id) => api.delete(`/documents/${id}`),
  getFile: (id) => api.get(`/documents/${id}/file`, { responseType: 'blob' }),
  getChatHistory: (id) => api.get(`/documents/${id}/chat-history`),
  getVersions: (id) => api.get(`/documents/${id}/versions`),
  uploadVersion: (id, formData) =>
    api.post(`/documents/${id}/versions`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  compare: (baseId, targetId) => api.get(`/documents/${baseId}/compare/${targetId}`),
  getObligations: (id) => api.get(`/documents/${id}/obligations`),
  getReminders: (id) => api.get(`/documents/${id}/reminders`),
  createReminder: (id, payload) => api.post(`/documents/${id}/reminders`, payload),
  updateReminder: (id, reminderId, payload) => api.patch(`/documents/${id}/reminders/${reminderId}`, payload),
  deleteReminder: (id, reminderId) => api.delete(`/documents/${id}/reminders/${reminderId}`),
  downloadReminderIcs: (id, reminderId) => api.get(`/documents/${id}/reminders/${reminderId}/ics`, { responseType: 'blob' }),
  getAllReminders: () => api.get('/documents/reminders/all'),
  getActivityFeed: () => api.get('/documents/activity/feed'),
  getUpcomingObligations: () => api.get('/documents/obligations/upcoming'),
  retry: (id) => api.post(`/documents/${id}/retry`),
};

/* ——— Analysis / AI (via Express → FastAPI) ——— */
export const analysisAPI = {
  // These paths mirror whatever Express exposes from Parts 08–12.
  // Phase 3 will wire exact panel data; safe placeholders kept here.
  getAnalysis: (id) => api.get(`/documents/${id}/analysis`),
  getRisk: (id) => api.get(`/documents/${id}/risk`),
  query: (id, question) =>
    api.post(`/documents/${id}/chat`, { query: question, question }),
};

/* ——— Reports ——— */
export const reportAPI = {
  list: () => api.get('/reports'),
  generate: (documentId) => api.post(`/reports/generate/${documentId}`),
  download: (reportId) =>
    api.get(`/reports/${reportId}/download`, { responseType: 'blob' }),
  remove: (reportId) => api.delete(`/reports/${reportId}`),
};

/* ——— Admin ——— */
export const adminAPI = {
  getUsers: (params) => api.get('/admin/users', { params }),
  getUserById: (id) => api.get(`/admin/users/${id}`),
  updateUserStatus: (id, isActive) => api.put(`/admin/users/${id}/status`, { isActive }),
  updateUserRole: (id, role) => api.put(`/admin/users/${id}/role`, { role }),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  restoreUser: (id) => api.put(`/admin/users/${id}/restore`),
  getDocuments: (params) => api.get('/admin/documents', { params }),
  getStats: () => api.get('/admin/stats'),
  getAnalytics: (params) => api.get('/admin/analytics', { params }),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (data) => api.put('/admin/settings', data),
  getPipelineTelemetry: () => api.get('/admin/pipeline'),
  retryPipeline: (id) => api.post(`/admin/documents/${id}/retry`),
};

/* ——— Health ——— */
export const healthAPI = {
  check: () => api.get('/health'),
  aiService: () => api.get('/health/ai-service'),
  chainTest: () => api.get('/health/chain-test'),
  getDiagnostics: () => api.get('/health/diagnostics'),
};

export default api;