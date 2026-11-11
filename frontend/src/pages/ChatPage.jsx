import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  Bot,
  CheckCircle2,
  FileText,
  Send,
  User,
} from 'lucide-react';

import { analysisAPI, documentAPI } from '../services/api';
import Spinner from '../components/Spinner';
import '../styles/chat-admin.css';

const SUGGESTED_QUERIES = [
  'What are the indemnification liabilities and caps?',
  'What is the required notice period for termination?',
  'Are there non-compete or non-solicitation restrictions?',
  'What governing law and dispute jurisdiction applies?',
];

export default function ChatPage() {
  const location = useLocation();
  const initialDocId = location.state?.documentId || '';

  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(initialDocId);
  const [loadingDocs, setLoadingDocs] = useState(true);

  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: 'Welcome to the Legal Analysis Assistant. Select a contract from the active context list to query specific liabilities, inspect clause obligations, or examine critical deadlines.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState('');

  const messagesEndRef = useRef(null);

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        setLoadingDocs(true);
        const res = await documentAPI.list();
        const rawDocs =
          res?.data?.data?.documents ||
          res?.data?.documents ||
          (Array.isArray(res?.data?.data) ? res.data.data : null) ||
          (Array.isArray(res?.data) ? res.data : []);
        const safeList = Array.isArray(rawDocs) ? rawDocs : [];
        const docs = safeList.filter(
          (d) => (d.processingStatus || d.status) === 'completed'
        );
        setDocuments(docs);
        if (docs.length > 0) {
          setSelectedDocId((prev) => prev || docs[0]._id || docs[0].id);
        }
      } catch (err) {
        console.error('Failed to load documents for chat:', err);
      } finally {
        setLoadingDocs(false);
      }
    };

    fetchDocs();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, querying]);

  const handleSend = async (e, customText = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const queryText = (customText || inputQuestion).trim();
    if (!queryText) return;

    if (!selectedDocId) {
      setError('Please select a completed contract to query.');
      return;
    }

    setInputQuestion('');
    setError('');

    const userMsg = {
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuerying(true);

    try {
      const res = await analysisAPI.query(selectedDocId, queryText);
      const data = res.data?.data || res.data || {};

      const answerText = data.answer || data.response || data.text || 'No conclusive answer retrieved.';
      const intent = data.intent || data.queryIntent || 'GENERAL';
      const path = data.path || data.executionPath || 'RAG';
      const evidenceScore = data.evidenceScore ?? data.evidence_score ?? data.supportRatio ?? null;
      const citations = data.citations || data.groundedCitations || [];

      const aiMsg = {
        sender: 'ai',
        text: answerText,
        intent,
        path,
        evidenceScore,
        citations,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setError(err.message || 'Failed to retrieve analysis from AI Service');
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `Query could not be completed: ${err.message || 'AI service unavailable.'}`,
          isError: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setQuerying(false);
    }
  };

  const selectedDoc = documents.find((d) => (d._id || d.id) === selectedDocId);

  const getPathBadge = (path) => {
    if (path === 'Risk Path') return <span className="badge badge-danger">Risk Engine</span>;
    if (path === 'Summary Path') return <span className="badge badge-neutral">Summary Engine</span>;
    return <span className="badge badge-neutral">FAISS RAG</span>;
  };

  const getSchemaBadge = (intent) => {
    if (intent === 'RISK') return <span className="badge badge-warning">RISK INTENT</span>;
    if (intent === 'CLAUSE') return <span className="badge badge-primary">PROVISION INTENT</span>;
    if (intent === 'DATE') return <span className="badge badge-info">DATE INTENT</span>;
    return <span className="badge badge-neutral">{intent || 'GENERAL'}</span>;
  };

  return (
    <div className="page">
      <div className="container">
        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Legal Analysis &amp; Research Assistant</h1>
            <p className="page-subtitle">
              Interactive inquiries backed by multi-stage retrieval, evidence verification, and verbatim contract citations.
            </p>
          </div>
        </div>

        <div className="chat-layout">
          {/* Left Sidebar: Document Selection */}
          <div className="chat-sidebar">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Active Contracts
              </h3>
              <span className="badge badge-neutral">{documents.length}</span>
            </div>

            {loadingDocs ? (
              <Spinner label="Loading contracts…" />
            ) : documents.length === 0 ? (
              <div className="alert alert-info text-xs">
                No completed agreements found. Please upload a contract first.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.4rem' }}>
                {documents.map((doc) => {
                  const docId = doc._id || doc.id;
                  const isSelected = docId === selectedDocId;

                  return (
                    <div
                      key={docId}
                      className={`chat-doc-item ${isSelected ? 'active' : ''}`}
                      onClick={() => setSelectedDocId(docId)}
                    >
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>
                        {doc.title || doc.originalName}
                      </div>
                      <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                        <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                          {doc.documentType || 'General'}
                        </span>
                        <span className="text-xs text-mono muted">
                          {doc.riskScore !== undefined ? `Risk ${doc.riskScore}/100` : 'Indexed'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedDoc && (
              <div style={{ marginTop: 'auto', paddingTop: '0.85rem', borderTop: '1px solid var(--color-border)' }}>
                <div className="form-hint">Selected Document</div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', marginTop: '2px' }}>
                  {selectedDoc.title || selectedDoc.originalName}
                </div>
                <div className="text-xs text-mono muted mt-1">
                  FAISS INDEXED · CITATION VERIFIED
                </div>
              </div>
            )}
          </div>

          {/* Right Main Chat Window */}
          <div className="chat-window">
            {/* Header */}
            <div className="chat-header">
              <div className="flex-center gap-2">
                <FileText size={16} color="var(--color-text)" />
                <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                  {selectedDoc
                    ? `Contract Analysis Context: ${selectedDoc.title || selectedDoc.originalName}`
                    : 'Select a document to begin inquiry'}
                </span>
              </div>
              <span className="status-indicator">
                <span className="status-dot online"></span>
                <span>RAG Service Online</span>
              </span>
            </div>

            {/* Conversation Messages */}
            <div className="chat-messages">
              {messages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.sender}`}>
                  <div className={`chat-avatar ${msg.sender === 'user' ? 'user-avatar-icon' : 'ai-avatar-icon'}`}>
                    {msg.sender === 'user' ? <User size={15} /> : <Bot size={15} />}
                  </div>

                  <div className="chat-bubble">
                    {msg.sender === 'ai' && msg.intent && (
                      <div className="rag-meta-strip">
                        {getSchemaBadge(msg.intent)}
                        {getPathBadge(msg.path)}
                        {msg.evidenceScore && (
                          <span className="badge badge-success flex-center gap-1">
                            <CheckCircle2 size={11} /> Support: {(msg.evidenceScore * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    )}

                    <div style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>

                    {/* Citations Excerpt */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div style={{ marginTop: '0.85rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.6rem' }}>
                        <div className="text-xs flex-center gap-1" style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.4rem' }}>
                          <BookOpen size={13} /> Grounded Document Citations ({msg.citations.length})
                        </div>

                        {msg.citations.map((cit, cIdx) => (
                          <div key={cIdx} className="citation-card">
                            <div className="citation-source">
                              <span>Page {cit.page || cit.pageNumber || 'N/A'} · Section: {cit.section || 'Extracted Clause'}</span>
                              {cit.matchRatio && (
                                <span className="muted" style={{ fontSize: '10px' }}>
                                  {(cit.matchRatio * 100).toFixed(0)}% Match
                                </span>
                              )}
                            </div>
                            <div className="citation-excerpt">
                              "{cit.excerpt || cit.text || cit.clauseText}"
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="text-xs text-mono muted" style={{ textAlign: 'right', marginTop: '0.4rem', fontSize: '10px' }}>
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              ))}

              {querying && (
                <div className="chat-message ai">
                  <div className="chat-avatar ai-avatar-icon">
                    <Bot size={15} />
                  </div>
                  <div className="chat-bubble flex-center gap-2">
                    <Spinner label="" />
                    <span className="text-sm muted">
                      Executing retrieval pipeline and validating citations…
                    </span>
                  </div>
                </div>
              )}

              {/* Suggested Questions */}
              {messages.length === 1 && selectedDoc && !querying && (
                <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                  <div className="form-hint" style={{ marginBottom: '0.5rem' }}>Suggested Questions:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {SUGGESTED_QUERIES.map((sq, i) => (
                      <button
                        key={i}
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSend(null, sq)}
                      >
                        {sq}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Composer */}
            <div className="chat-input-area">
              {error && (
                <div className="alert alert-error mb-2">
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSend} className="chat-input-wrapper">
                <input
                  className="form-input"
                  style={{ flex: 1 }}
                  placeholder={
                    selectedDoc
                      ? `Ask a specific question regarding "${selectedDoc.title || selectedDoc.originalName}"…`
                      : 'Select a document from the left sidebar…'
                  }
                  value={inputQuestion}
                  onChange={(e) => setInputQuestion(e.target.value)}
                  disabled={querying || !selectedDocId}
                />
                <button
                  type="submit"
                  className="btn btn-primary flex-center gap-2"
                  disabled={querying || !inputQuestion.trim() || !selectedDocId}
                >
                  <Send size={15} />
                  <span>Ask AI</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}