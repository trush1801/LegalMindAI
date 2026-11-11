import { useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp, Upload, X } from 'lucide-react';
import { documentAPI } from '../services/api';

const DOCUMENT_TYPES = [
  { value: 'business', label: 'Business Agreement (MSA, SOW, Vendor)' },
  { value: 'employment', label: 'Employment Contract & Covenants' },
  { value: 'confidentiality', label: 'Non-Disclosure Agreement (NDA)' },
  { value: 'property', label: 'Property & Commercial Lease' },
  { value: 'corporate', label: 'Corporate & Shareholder Agreement' },
  { value: 'financial', label: 'Financial & Loan Agreement' },
  { value: 'digital', label: 'Digital, Privacy & Terms of Service' },
  { value: 'legal', label: 'Legal & Power of Attorney' },
  { value: 'other', label: 'General / Other Agreement' },
];

export default function UploadModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [documentType, setDocumentType] = useState('business');
  const [title, setTitle] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleFileChange = (selectedFile) => {
    if (!selectedFile) return;
    if (
      !selectedFile.name.toLowerCase().endsWith('.pdf') &&
      !selectedFile.name.toLowerCase().endsWith('.docx') &&
      !selectedFile.name.toLowerCase().endsWith('.txt')
    ) {
      setError('Only PDF, DOCX, and TXT files are supported by the analysis engine.');
      return;
    }
    setError('');
    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a PDF or DOCX file to upload.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('documentType', documentType);
      if (title) formData.append('title', title);

      const res = await documentAPI.upload(formData);
      const resData = res?.data;
      const dataObj = resData?.data;
      const docObj = dataObj?.document || resData?.document || dataObj || resData;

      const docId =
        docObj?._id ||
        docObj?.id ||
        docObj?.documentId ||
        dataObj?.documentId ||
        dataObj?.id ||
        dataObj?._id ||
        resData?.documentId ||
        resData?.id ||
        resData?._id;

      if (!docId || docId === 'undefined' || docId === 'null' || typeof docId !== 'string' || !docId.trim()) {
        console.error('Document upload response missing valid document ID:', res);
        setError('Upload succeeded, but failed to retrieve a valid document identifier. Please check your documents repository.');
        return;
      }

      const cleanDocId = docId.trim();
      const normalizedDoc = {
        ...(typeof docObj === 'object' && docObj !== null ? docObj : {}),
        _id: cleanDocId,
        id: cleanDocId,
        documentId: cleanDocId,
      };

      onSuccess(normalizedDoc);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="card-header" style={{ marginBottom: 0, paddingBottom: '0.75rem' }}>
          <div>
            <h2 className="card-title flex-center gap-2">
              <FileUp size={18} color="var(--color-primary)" />
              <span>Upload Agreement</span>
            </h2>
            <div className="form-hint mt-2">Submit a contract for multi-stage AI extraction</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          {/* Dropzone */}
          <div
            className={`dropzone ${isDragActive ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input-trigger').click()}
          >
            <input
              id="file-input-trigger"
              type="file"
              accept=".pdf,.docx,.txt"
              style={{ display: 'none' }}
              onChange={(e) => handleFileChange(e.target.files[0])}
            />
            <Upload size={28} className="dropzone-icon" />
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
              {file ? (
                <span className="flex-center gap-2" style={{ justifyContent: 'center' }}>
                  <CheckCircle2 size={16} color="var(--color-success)" />
                  <span>{file.name}</span>
                </span>
              ) : (
                'Click to select file or drag & drop here'
              )}
            </div>
            <div className="form-hint" style={{ marginTop: '0.35rem' }}>
              Standard PDF, DOCX, and TXT agreements up to 50MB · Multi-stage AI indexing
            </div>
          </div>

          {/* Title Field */}
          <div className="form-group">
            <label className="form-label" htmlFor="doc-title">Document Title</label>
            <input
              id="doc-title"
              className="form-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Master Services Agreement 2025"
            />
          </div>

          {/* Document Classification Category */}
          <div className="form-group">
            <label className="form-label" htmlFor="doc-type">Agreement Category</label>
            <select
              id="doc-type"
              className="form-select"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex" style={{ justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={uploading || !file}
            >
              {uploading ? 'Analyzing Agreement…' : 'Upload & Start Analysis'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}