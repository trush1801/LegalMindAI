import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  AlignLeft,
  ArrowRight, 
  Bot, 
  CheckCircle2, 
  Compass,
  FileCheck2,
  FileSpreadsheet,
  FileText, 
  Menu,
  Scale, 
  Shield, 
  ShieldAlert, 
  Users,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import '../styles/landing.css';

export default function HomePage() {
  const { isAuthenticated, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState('risk');

  if (loading) return null;

  const scrollToSection = (id) => (e) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      const navOffset = 76;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - navOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="landing-page" id="home">
      {/* ── Swiss Editorial Sticky Navigation ── */}
      <nav className="landing-nav">
        <div className="container landing-nav-container">
          {/* Brand Identity */}
          <Link to="/" className="landing-brand">
            <span className="landing-brand-mark">
              <Shield size={16} />
            </span>
            <span className="landing-brand-text">LegalMind<span className="brand-accent">AI</span></span>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="landing-nav-links">
            <a href="#home" onClick={scrollToSection('home')} className="nav-link active">Home</a>
            <a href="#features" onClick={scrollToSection('features')} className="nav-link">Capabilities</a>
            <a href="#how-it-works" onClick={scrollToSection('how-it-works')} className="nav-link">Workflow</a>
            <a href="#document-types" onClick={scrollToSection('document-types')} className="nav-link">Agreements</a>
            <a href="#about" onClick={scrollToSection('about')} className="nav-link">Principles</a>
          </div>

          {/* Action Area + Theme Toggle */}
          <div className="landing-nav-actions">
            <ThemeToggle />

            {isAuthenticated ? (
              <Link to="/dashboard" className="btn btn-primary btn-sm flex-center gap-2">
                <span>Open Workspace</span>
                <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm">Sign In</Link>
                <Link to="/register" className="btn btn-primary btn-sm">Get Started</Link>
              </>
            )}

            {/* Mobile Toggle */}
            <button 
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="mobile-nav-drawer">
            <div className="mobile-nav-links">
              <a href="#home" onClick={scrollToSection('home')} className="mobile-nav-link">Home</a>
              <a href="#features" onClick={scrollToSection('features')} className="mobile-nav-link">Capabilities</a>
              <a href="#how-it-works" onClick={scrollToSection('how-it-works')} className="mobile-nav-link">Workflow</a>
              <a href="#document-types" onClick={scrollToSection('document-types')} className="mobile-nav-link">Agreements</a>
              <a href="#about" onClick={scrollToSection('about')} className="mobile-nav-link">Principles</a>
            </div>
            <div className="mobile-nav-auth">
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                <ThemeToggle showLabel />
              </div>
              {isAuthenticated ? (
                <Link to="/dashboard" className="btn btn-primary btn-block flex-center gap-2" onClick={() => setMobileMenuOpen(false)}>
                  <span>Open Workspace</span>
                  <ArrowRight size={15} />
                </Link>
              ) : (
                <div className="flex gap-2" style={{ flexDirection: 'column' }}>
                  <Link to="/login" className="btn btn-secondary btn-block text-center" onClick={() => setMobileMenuOpen(false)}>
                    Sign In
                  </Link>
                  <Link to="/register" className="btn btn-primary btn-block text-center" onClick={() => setMobileMenuOpen(false)}>
                    Get Started
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* ── Swiss Editorial Hero Section ── */}
      <header className="hero-section">
        <div className="container hero-container">
          <div className="hero-content">
            <div className="hero-eyebrow">
              <span className="hero-bullet">■</span>
              <span>LEGAL INTELLIGENCE ARCHITECTURE</span>
            </div>

            <h1 className="hero-title">
              Clarity for <br />
              <span className="hero-serif-title">what matters.</span>
            </h1>

            <p className="hero-subtitle">
              Analyze, understand, and work with legal documents using AI — built for professionals who need clarity, speed, and clear insights.
            </p>

            <div className="hero-actions">
              {isAuthenticated ? (
                <Link to="/dashboard" className="btn btn-primary btn-lg flex-center gap-2 hero-btn-main">
                  <span>Analyze a Document</span>
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn btn-primary btn-lg flex-center gap-2 hero-btn-main">
                    <span>Analyze a Document</span>
                    <ArrowRight size={16} />
                  </Link>
                  <a href="#features" onClick={scrollToSection('features')} className="btn btn-secondary btn-lg hero-btn-sub">
                    Explore the Platform
                  </a>
                </>
              )}
            </div>

            {/* Restrained Architectural Trust Metadata */}
            <div className="hero-trust-bar">
              <div className="trust-item">
                <span className="trust-mono-tag">01</span>
                <span>14+ Legal-BERT Clause Models</span>
              </div>
              <div className="trust-item">
                <span className="trust-mono-tag">02</span>
                <span>0–100 Objective Risk Scoring</span>
              </div>
              <div className="trust-item">
                <span className="trust-mono-tag">03</span>
                <span>Strict Evidence Citations</span>
              </div>
            </div>
          </div>

          {/* ── Realistic Product Interface Preview ── */}
          <div className="hero-preview-wrapper">
            <div className="preview-window">
              {/* Chrome Header */}
              <div className="preview-window-header">
                <div className="preview-window-controls">
                  <span className="control-sq"></span>
                  <span className="control-sq"></span>
                  <span className="control-sq"></span>
                </div>
                <div className="preview-doc-title">
                  <FileText size={13} className="muted" />
                  <span className="preview-doc-filename">Master_Services_Agreement_2025.pdf</span>
                  <span className="badge badge-neutral">ANALYZED</span>
                </div>
              </div>

              {/* Tabs */}
              <div className="preview-tabs">
                <button 
                  className={`preview-tab-btn ${activePreviewTab === 'risk' ? 'active' : ''}`}
                  onClick={() => setActivePreviewTab('risk')}
                >
                  <ShieldAlert size={13} />
                  <span>Risk Scorecard</span>
                </button>
                <button 
                  className={`preview-tab-btn ${activePreviewTab === 'clauses' ? 'active' : ''}`}
                  onClick={() => setActivePreviewTab('clauses')}
                >
                  <AlignLeft size={13} />
                  <span>Key Clauses</span>
                </button>
                <button 
                  className={`preview-tab-btn ${activePreviewTab === 'summary' ? 'active' : ''}`}
                  onClick={() => setActivePreviewTab('summary')}
                >
                  <Bot size={13} />
                  <span>Executive Brief</span>
                </button>
              </div>

              {/* Tab Display */}
              <div className="preview-body">
                {activePreviewTab === 'risk' && (
                  <div className="preview-tab-pane">
                    <div className="preview-score-row">
                      <div className="preview-gauge-card">
                        <div className="preview-gauge-square">
                          <span className="gauge-number">74</span>
                          <span className="gauge-denom">/ 100</span>
                        </div>
                        <div>
                          <span className="badge badge-critical">HIGH RISK DETECTED</span>
                          <div className="gauge-caption">Evaluated across 10 statutory risk categories</div>
                        </div>
                      </div>
                    </div>

                    <div className="preview-findings-list">
                      <div className="preview-finding-item finding-critical">
                        <div className="finding-header">
                          <span className="badge badge-critical">CRITICAL</span>
                          <span className="finding-clause-tag">§ 12.3 Liability Cap</span>
                        </div>
                        <p className="finding-text">
                          Liability is uncapped for indemnification claims and third-party IP disputes without reciprocal limitations.
                        </p>
                      </div>

                      <div className="preview-finding-item finding-warning">
                        <div className="finding-header">
                          <span className="badge badge-warning">MEDIUM</span>
                          <span className="finding-clause-tag">§ 18.1 Non-Compete</span>
                        </div>
                        <p className="finding-text">
                          36-month non-solicitation term exceeds standard jurisdictional reasonableness standards.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activePreviewTab === 'clauses' && (
                  <div className="preview-tab-pane">
                    <div className="preview-clauses-header">
                      <span className="text-xs font-semibold">14 Extracted Provisions</span>
                      <span className="badge badge-neutral">BERT 98.4% Confidence</span>
                    </div>

                    <div className="preview-clause-cards">
                      <div className="preview-clause-card">
                        <div className="clause-card-top">
                          <span className="clause-type-name">Indemnification &amp; Defense</span>
                          <span className="badge badge-success">98% MATCH</span>
                        </div>
                        <p className="clause-snippet">
                          "Supplier shall defend, indemnify, and hold harmless Customer from any claims arising out of breach of warranties..."
                        </p>
                        <div className="clause-footer-meta">
                          <span>Page 8 · Section 14.1</span>
                          <span className="text-link">View Source Passage →</span>
                        </div>
                      </div>

                      <div className="preview-clause-card">
                        <div className="clause-card-top">
                          <span className="clause-type-name">Termination for Convenience</span>
                          <span className="badge badge-warning">92% MATCH</span>
                        </div>
                        <p className="clause-snippet">
                          "Either party may terminate this agreement upon 30 calendar days written notice without penalty..."
                        </p>
                        <div className="clause-footer-meta">
                          <span>Page 11 · Section 17.2</span>
                          <span className="text-link">View Source Passage →</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activePreviewTab === 'summary' && (
                  <div className="preview-tab-pane">
                    <div className="preview-summary-card">
                      <div className="summary-card-badge">
                        <span className="summary-bullet">■</span>
                        <span>Executive Brief</span>
                      </div>
                      <p className="summary-paragraph">
                        This agreement establishes a 24-month Master Services engagement. While operational terms are standard, <strong>Section 12.3</strong> exposes the provider to unlimited indemnification damages. We recommend capping liability at 1.5× total annual fees.
                      </p>
                    </div>

                    <div className="preview-dates-grid">
                      <div className="date-tile">
                        <div className="date-label">Effective Date</div>
                        <div className="date-val">Jan 15, 2025</div>
                      </div>
                      <div className="date-tile">
                        <div className="date-label">Renewal Notice</div>
                        <div className="date-val">30 Days Prior</div>
                      </div>
                      <div className="date-tile">
                        <div className="date-label">Jurisdiction</div>
                        <div className="date-val">Delaware, USA</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Footer */}
              <div className="preview-footer-strip">
                <div className="flex-center gap-2 text-xs text-secondary">
                  <span className="preview-status-dot"></span>
                  <span className="text-mono">DEMO INTERFACE · SAMPLE AGREEMENT EVALUATION</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Single Unified Core Capabilities Section ── */}
      <section className="features-section" id="features">
        <div className="container">
          <div className="section-header">
            <div className="section-eyebrow">
              <span className="hero-bullet">■</span>
              <span>CORE CAPABILITIES</span>
            </div>
            <h2 className="section-title">Comprehensive Document Intelligence</h2>
            <p className="section-description">
              Every tool you need to examine, classify, identify risk, and extract mission-critical details from complex agreements.
            </p>
          </div>

          <div className="features-grid">
            {/* Feature 1 */}
            <div className="feature-card">
              <div className="feature-top-meta">
                <span className="feature-num">01</span>
                <span className="badge badge-neutral">OVERVIEW</span>
              </div>
              <h3>AI Document Summarization</h3>
              <p>
                Synthesizes 40+ page contracts into structured executive briefs, capturing commercial intent, core duties, and key liabilities.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="feature-card">
              <div className="feature-top-meta">
                <span className="feature-num">02</span>
                <span className="badge badge-neutral">LEGAL-BERT</span>
              </div>
              <h3>Key Clause Extraction</h3>
              <p>
                Pinpoints and isolates specific clauses — including indemnity, liability caps, non-compete terms, governing law, and dispute resolution.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="feature-card">
              <div className="feature-top-meta">
                <span className="feature-num">03</span>
                <span className="badge badge-neutral">RISK ENGINE</span>
              </div>
              <h3>Potential Risk Identification</h3>
              <p>
                Scores overall contract exposure from 0 to 100 based on unfavorable indemnity provisions, uncapped liabilities, and lopsided terms.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="feature-card">
              <div className="feature-top-meta">
                <span className="feature-num">04</span>
                <span className="badge badge-neutral">TIMELINE</span>
              </div>
              <h3>Important Dates &amp; Obligations</h3>
              <p>
                Extracts effective dates, milestone deadlines, automatic renewal cutoff windows, and notice requirements so you never miss a contractual deadline.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="feature-card">
              <div className="feature-top-meta">
                <span className="feature-num">05</span>
                <span className="badge badge-neutral">CLASSIFIER</span>
              </div>
              <h3>Document Classification</h3>
              <p>
                Automatically identifies the agreement family — differentiating employment agreements, commercial leases, NDAs, and business vendor contracts.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="feature-card">
              <div className="feature-top-meta">
                <span className="feature-num">06</span>
                <span className="badge badge-neutral">PRIVACY</span>
              </div>
              <h3>Secure Document Handling</h3>
              <p>
                Your files remain strictly partitioned in user-isolated workspaces with encrypted data transmission and private session boundaries.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Workflow Architecture Section ── */}
      <section className="how-it-works-section" id="how-it-works">
        <div className="container">
          <div className="section-header">
            <div className="section-eyebrow">
              <span className="hero-bullet">■</span>
              <span>3-STEP ARCHITECTURE</span>
            </div>
            <h2 className="section-title">How LegalMindAI Operates</h2>
            <p className="section-description">
              A systematic pipeline transforming raw contracts into structured intelligence without prompt drift.
            </p>
          </div>

          <div className="workflow-steps">
            <div className="workflow-step-card">
              <div className="step-number-tag">STEP 01</div>
              <h3>Ingest Agreement</h3>
              <p>
                Upload any PDF or DOCX agreement. The ingestion pipeline strips formatting noise, standardizes layout hierarchy, and indexes sections.
              </p>
            </div>

            <div className="workflow-step-card">
              <div className="step-number-tag">STEP 02</div>
              <h3>Examine &amp; Score</h3>
              <p>
                Legal-BERT isolates statutory clauses, computes mathematical risk scores, and flags ambiguous termination liabilities.
              </p>
            </div>

            <div className="workflow-step-card">
              <div className="step-number-tag">STEP 03</div>
              <h3>Query &amp; Export</h3>
              <p>
                Engage in evidence-backed Q&amp;A referencing exact clauses, and export comprehensive audit reports for counsel review.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Supported Document Types Section ── */}
      <section className="document-types-section" id="document-types">
        <div className="container">
          <div className="section-header">
            <div className="section-eyebrow">
              <span className="hero-bullet">■</span>
              <span>SPECIALIZED COVERAGE</span>
            </div>
            <h2 className="section-title">Supported Agreement Types</h2>
            <p className="section-description">
              Custom-trained models tailored to specific commercial agreement structures and compliance standards.
            </p>
          </div>

          <div className="types-grid">
            <div className="type-card">
              <span className="type-icon-box"><FileText size={18} /></span>
              <h4>Non-Disclosure Agreements (NDAs)</h4>
              <p>Evaluates confidentiality terms, exclusions, return-of-information clauses, and dispute jurisdictions.</p>
            </div>

            <div className="type-card">
              <span className="type-icon-box"><Users size={18} /></span>
              <h4>Employment Contracts</h4>
              <p>Surfaces non-compete periods, IP assignment obligations, termination notice, and severance rights.</p>
            </div>

            <div className="type-card">
              <span className="type-icon-box"><FileCheck2 size={18} /></span>
              <h4>Master Services Agreements</h4>
              <p>Scrutinizes indemnity caps, warranties, representations, service-level commitments, and fee escalation terms.</p>
            </div>

            <div className="type-card">
              <span className="type-icon-box"><FileSpreadsheet size={18} /></span>
              <h4>Commercial Real Estate Leases</h4>
              <p>Identifies escalation clauses, maintenance covenants, renewal notification windows, and security deposits.</p>
            </div>

            <div className="type-card">
              <span className="type-icon-box"><Scale size={18} /></span>
              <h4>Software Licensing Agreements</h4>
              <p>Audits sublicensing rights, usage-tier limitations, IP ownership declarations, and liability indemnification.</p>
            </div>

            <div className="type-card">
              <span className="type-icon-box"><Compass size={18} /></span>
              <h4>Vendor &amp; Supplier Agreements</h4>
              <p>Extracts delivery milestones, inspection windows, late-fee penalties, and force majeure triggers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Architectural Principles & Trust ── */}
      <section className="about-section" id="about">
        <div className="container">
          <div className="about-wrapper">
            <div className="about-content">
              <div className="section-eyebrow">
                <span className="hero-bullet">■</span>
                <span>ENGINEERING PRINCIPLES</span>
              </div>
              <h2 className="about-title">Built for Legal Precision, Not Generic Chat</h2>
              <p className="about-paragraph">
                Standard conversational AI models hallucinate statutory precedents and miss subtle liability shifts. LegalMindAI couples specialized Legal-BERT classifiers with grounded Retrieval-Augmented Generation (RAG).
              </p>

              <div className="about-checklist">
                <div className="about-check-item">
                  <CheckCircle2 size={18} className="text-success" />
                  <div>
                    <strong>Zero-Hallucination Citations:</strong> Every assertion links directly to verbatim contractual clauses with page and section anchors.
                  </div>
                </div>
                <div className="about-check-item">
                  <CheckCircle2 size={18} className="text-success" />
                  <div>
                    <strong>Isolated Tenant Workspaces:</strong> Contract data is never shared across user boundaries and is strictly segregated in memory.
                  </div>
                </div>
                <div className="about-check-item">
                  <CheckCircle2 size={18} className="text-success" />
                  <div>
                    <strong>Audit-Ready Documentation:</strong> Exportable executive reports designed for direct presentation to partners and general counsel.
                  </div>
                </div>
              </div>
            </div>

            <div className="about-stats-panel">
              <div className="about-stat-row">
                <div className="about-stat-val">10+</div>
                <div className="about-stat-label">Statutory Risk Categories Evaluated</div>
              </div>
              <div className="about-stat-row">
                <div className="about-stat-val">14+</div>
                <div className="about-stat-label">Pre-Trained Legal-BERT Provision Extractors</div>
              </div>
              <div className="about-stat-row">
                <div className="about-stat-val">100%</div>
                <div className="about-stat-label">Grounded Reference Tracking Without Hallucination</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Minimalist Call to Action ── */}
      <section className="cta-section">
        <div className="container cta-container">
          <h2 className="cta-title">Ready to streamline your legal review?</h2>
          <p className="cta-description">
            Upload your first agreement in seconds and inspect key liabilities with structured precision.
          </p>
          <div className="cta-actions">
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn btn-primary btn-lg flex-center gap-2 cta-btn">
                <span>Go to Workspace</span>
                <ArrowRight size={16} />
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-primary btn-lg flex-center gap-2 cta-btn">
                  <span>Create Account</span>
                  <ArrowRight size={16} />
                </Link>
                <Link to="/login" className="btn btn-secondary btn-lg cta-btn">
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Swiss Architectural Footer ── */}
      <footer className="landing-footer">
        <div className="container">
          <div className="footer-top-grid">
            <div className="footer-brand-col">
              <Link to="/" className="landing-brand">
                <span className="landing-brand-mark"><Shield size={16} /></span>
                <span className="landing-brand-text">LegalMind<span className="brand-accent">AI</span></span>
              </Link>
              <p className="footer-tagline">
                AI-powered legal document analysis platform engineered for contract clarity and rigorous risk detection.
              </p>
            </div>

            <div className="footer-col">
              <h5>Platform</h5>
              <a href="#features" onClick={scrollToSection('features')}>Capabilities</a>
              <a href="#how-it-works" onClick={scrollToSection('how-it-works')}>Workflow</a>
              <a href="#document-types" onClick={scrollToSection('document-types')}>Agreements</a>
              <Link to="/dashboard">Workspace</Link>
            </div>

            <div className="footer-col">
              <h5>Capabilities</h5>
              <span>Risk Scoring</span>
              <span>Clause Extraction</span>
              <span>Date Tracker</span>
              <span>Audit Reports</span>
            </div>

            <div className="footer-col">
              <h5>Security &amp; Legal</h5>
              <span>Private Tenancy</span>
              <span>Encrypted Transit</span>
              <span>Terms of Service</span>
              <span>Privacy Policy</span>
            </div>
          </div>

          <div className="footer-bottom-bar">
            <div>&copy; {new Date().getFullYear()} LegalMindAI. All rights reserved.</div>
            <div className="footer-legal-notice">
              For informational contract analysis purposes. Always consult qualified legal counsel for binding counsel.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}