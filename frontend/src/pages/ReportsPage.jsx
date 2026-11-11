import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileCheck,
  Plus,
  RefreshCw,
  ScrollText,
  Trash2,
} from 'lucide-react';

import { documentAPI, reportAPI } from '../services/api';
import Spinner from '../components/Spinner';

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingDocId, setGeneratingDocId] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [reportsRes, docsRes] = await Promise.all([
        reportAPI.list().catch(() => ({ data: { reports: [] } })),
        documentAPI.list().catch(() => ({ data: { documents: [] } })),
      ]);

      const rawReports =
        reportsRes?.data?.data?.reports ||
        reportsRes?.data?.reports ||
        (Array.isArray(reportsRes?.data?.data) ? reportsRes.data.data : null) ||
        (Array.isArray(reportsRes?.data) ? reportsRes.data : []);
      const rawDocs =
        docsRes?.data?.data?.documents ||
        docsRes?.data?.documents ||
        (Array.isArray(docsRes?.data?.data) ? docsRes.data.data : null) ||
        (Array.isArray(docsRes?.data) ? docsRes.data : []);

      setReports(Array.isArray(rawReports) ? rawReports : []);
      const safeDocs = Array.isArray(rawDocs) ? rawDocs : [];
      const docs = safeDocs.filter(
        (d) => (d.processingStatus || d.status) === 'completed'
      );
      setDocuments(docs);
    } catch (err) {
      setError(err.message || 'Failed to load reports');
      setReports([]);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDownload = async (report) => {
    try {
      const reportId = report._id || report.reportId || report.id;
      const res = await reportAPI.download(reportId);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', report.fileName || report.documentName || `LegalMind_Report_${reportId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert(err.message || 'Failed to download PDF report');
    }
  };

  const handleDelete = async (reportId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this PDF report?')) return;
    try {
      await reportAPI.remove(reportId);
      setReports((prev) => (Array.isArray(prev) ? prev.filter((r) => (r._id || r.reportId || r.id) !== reportId) : []));
    } catch (err) {
      alert(err.message || 'Failed to delete report');
    }
  };

  const handleGenerateReport = async (docId) => {
    try {
      setGeneratingDocId(docId);
      const res = await reportAPI.generate(docId);
      const newReport = res?.data?.data?.report || res?.data?.data || res?.data?.report || res?.data;
      
      await handleDownload(newReport);
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to generate PDF report');
    } finally {
      setGeneratingDocId('');
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return 'N/A';
    const kb = bytes / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
  };

  return (
    <div className="page">
      <div className="container">
        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Executive Audit Reports</h1>
            <p className="page-subtitle">
              Export and download publication-ready executive briefs, risk scorecards, and verbatim provision tables in PDF format.
            </p>
          </div>
          <button className="btn btn-secondary flex-center gap-2" onClick={loadData}>
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>

        {error && (
          <div className="alert alert-error mb-4">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Generate Report Quick Bar */}
        {documents.length > 0 && (
          <div className="card mb-4" style={{ background: 'var(--color-surface)' }}>
            <div className="card-header" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
              <div>
                <h3 className="card-title flex-center gap-2" style={{ fontSize: '0.95rem' }}>
                  <Plus size={16} color="var(--color-primary)" />
                  <span>Generate New Report</span>
                </h3>
                <div className="form-hint mt-1">Compile comprehensive audit findings into a branded PDF brief</div>
              </div>
              <div className="flex-center gap-2">
                <select
                  id="generate-doc-select"
                  className="form-select"
                  style={{ width: 'auto', minWidth: '260px' }}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) handleGenerateReport(e.target.value);
                  }}
                  disabled={Boolean(generatingDocId)}
                >
                  <option value="" disabled>Select a contract to compile…</option>
                  {documents.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.title || d.originalName} ({d.documentType || 'General'})
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

        {/* Reports Archive */}
        {loading ? (
          <Spinner label="Loading reports archive…" />
        ) : reports.length === 0 ? (
          <div className="empty-state card">
            <ScrollText size={36} color="var(--color-text-muted)" style={{ margin: '0 auto 0.75rem' }} />
            <h3>No audit reports generated yet</h3>
            <p>Generate a PDF audit report using the selector above or directly from any document analysis workspace.</p>
          </div>
        ) : (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title flex-center gap-2">
                <ScrollText size={18} color="var(--color-primary)" />
                <span>Compiled Reports ({reports.length})</span>
              </h2>
            </div>

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
                    const rId = report._id || report.reportId;
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
                          <div className="flex-center gap-2" style={{ justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-primary btn-sm flex-center gap-1"
                              onClick={() => handleDownload(report)}
                            >
                              <Download size={13} />
                              <span>Download PDF</span>
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Delete report"
                              onClick={(e) => handleDelete(rId, e)}
                            >
                              <Trash2 size={14} color="var(--color-danger)" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}