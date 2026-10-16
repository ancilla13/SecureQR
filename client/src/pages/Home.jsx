import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, QrCode, Lock, AlertTriangle, Radio, Terminal, Cpu, Globe, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import '../styles/home.css';

export default function Home() {
  return (
    <div className="home-container animate-fade-in">
      {/* ====================================================================
          /01 HERO SECTION (SPLIT ARCHITECTURAL GRID)
          ==================================================================== */}
      <section className="hero-editorial-grid">
        <div className="hero-left-column">
          <div>
            <span className="section-index">/01 ARCHITECTURE</span>
            <div className="hero-tagline-violet">
              FUNCTIONAL. DIGITAL. UNAPOLOGETIC.
            </div>
            <h1 className="hero-editorial-heading">
              SECURE<br />
              CRYPTOGRAPHIC<br />
              DEFENSE
            </h1>
            <p className="hero-desc">
              QR codes only encode data—they never prove authenticity. SecureQR introduces 
              three independent security layers to inspect content, verify ECDSA P-256 
              signatures against local keystores, and neutralize adversarial deception.
            </p>
          </div>

          <div className="hero-actions">
            <Link to="/scanner" className="btn btn-primary btn-large">
              <span>SCAN & VERIFY</span>
              <span className="arrow-icon">↗</span>
            </Link>
            <Link to="/lan" className="btn btn-lime btn-large">
              <span>LAN RELAY & KEY EXCHANGE</span>
              <span className="arrow-icon">↗</span>
            </Link>
            <Link to="/create" className="btn btn-secondary btn-large">
              <span>CREATE & SIGN</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Architectural HUD Display */}
        <div className="hero-right-column">
          <div className="hud-telemetry-header">
            <span>&gt; CRYPTO RUNTIME ACTIVE</span>
            <span style={{ color: 'var(--accent-violet)', fontWeight: 800 }}>99.8% VERIFIED</span>
          </div>

          <div className="hud-terminal-preview">
            <div className="corner-cross corner-tl">+</div>
            <div className="corner-cross corner-tr">+</div>
            <div className="corner-cross corner-bl">+</div>
            <div className="corner-cross corner-br">+</div>
            
            <div className="hud-code-stream">
              <div style={{ color: '#8E8E93', marginBottom: '8px' }}>// SCN_01 SECURITY HUD TELEMETRY</div>
              <div>&gt; ENGINE: ECDSA_P256</div>
              <div>&gt; DIGEST: SHA-256 (FIPS 180-4)</div>
              <div>&gt; ONNX_ML: HEURISTIC PHISHING CLASSIFIER</div>
              <div>&gt; KEYSTORE: ISOLATED_INDEXEDDB_V2</div>
              <div>&gt; LAN_TUNNEL: ECDH_EPHEMERAL_AES_GCM</div>
              <div style={{ color: '#8750F7', marginTop: '8px' }}>&gt; AUDIT_STATUS: ZERO-TRUST ARMED</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <span className="section-annotation">// SCN_01 SECURITY_OPS</span>
            <div className="hud-coordinates-pill">
              X_36.1749<br />
              Y_-86.7676<br />
              Z_46.6827
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
          /02 CORE PRINCIPLES (ARCHITECTURAL BORDERED QUAD)
          ==================================================================== */}
      <section>
        <div className="section-header-row">
          <div className="section-title-group">
            <span className="section-index" style={{ marginBottom: 0 }}>/02</span>
            <span className="section-heading-mono">CORE DEFENSE PRINCIPLES</span>
          </div>
          <span className="section-annotation">STANDARDIZED PROTOCOL V2.4</span>
        </div>

        <div className="principles-grid">
          <div className="principle-cell">
            <span className="corner-cross corner-tl">+</span>
            <div className="principle-iconWrapper">
              <Globe size={32} style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="principle-tag-violet">UNIVERSAL INSPECTION</div>
            <p>
              Parses URLs, payment URIs, Wi-Fi strings, and raw text safely without automatic code execution or browser redirects.
            </p>
          </div>

          <div className="principle-cell">
            <span className="corner-cross corner-tl">+</span>
            <div className="principle-iconWrapper">
              <Lock size={32} style={{ color: 'var(--accent-violet)' }} />
            </div>
            <div className="principle-tag-violet">CRYPTOGRAPHIC AUTHENTICITY</div>
            <p>
              Validates ECDSA P-256 digital signatures using public keys stored in your local trusted contacts keystore.
            </p>
          </div>

          <div className="principle-cell">
            <span className="corner-cross corner-tl">+</span>
            <div className="principle-iconWrapper">
              <AlertTriangle size={32} style={{ color: '#F59E0B' }} />
            </div>
            <div className="principle-tag-violet">THREAT INTELLIGENCE</div>
            <p>
              Combines offline ONNX machine learning with heuristic analysis to detect deceptive punycode, homograph domains, and typosquats.
            </p>
          </div>

          <div className="principle-cell">
            <span className="corner-cross corner-tl">+</span>
            <div className="principle-iconWrapper">
              <Radio size={32} style={{ color: 'var(--accent-lime)' }} />
            </div>
            <div className="principle-tag-violet">OUT-OF-BAND KEY EXCHANGE</div>
            <p>
              End-to-end encrypted LAN relay using ephemeral ECDH + HKDF + AES-256-GCM for peer discovery and verification.
            </p>
          </div>
        </div>
      </section>

      {/* ====================================================================
          /03 OPERATIONAL WORKSPACES
          ==================================================================== */}
      <section>
        <div className="section-header-row">
          <div className="section-title-group">
            <span className="section-index" style={{ marginBottom: 0 }}>/03</span>
            <span className="section-heading-mono">OPERATIONAL WORKSPACES</span>
          </div>
          <span className="section-annotation">SECURE ROUTING INTERFACES</span>
        </div>

        <div className="workspaces-grid">
          <Link to="/scanner" className="workspace-card">
            <div className="workspace-preview-box">
              <ShieldCheck size={48} style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="workspace-info-strip">
              <div>
                <div className="workspace-name">SCAN & VERIFY</div>
                <div className="workspace-category">CAMERA & FILE DECODER</div>
              </div>
              <span className="workspace-arrow">↗</span>
            </div>
          </Link>

          <Link to="/create" className="workspace-card">
            <div className="workspace-preview-box">
              <QrCode size={48} style={{ color: 'var(--accent-violet)' }} />
            </div>
            <div className="workspace-info-strip">
              <div>
                <div className="workspace-name">CREATE & SIGN</div>
                <div className="workspace-category">ECDSA PAYLOAD GENERATOR</div>
              </div>
              <span className="workspace-arrow">↗</span>
            </div>
          </Link>

          <Link to="/contacts" className="workspace-card">
            <div className="workspace-preview-box">
              <Lock size={48} style={{ color: 'var(--text-primary)' }} />
            </div>
            <div className="workspace-info-strip">
              <div>
                <div className="workspace-name">TRUSTED CONTACTS</div>
                <div className="workspace-category">PUBLIC KEYSTORE</div>
              </div>
              <span className="workspace-arrow">↗</span>
            </div>
          </Link>

          <Link to="/lan" className="workspace-card">
            <div className="workspace-preview-box">
              <Radio size={48} style={{ color: 'var(--accent-lime)' }} />
            </div>
            <div className="workspace-info-strip">
              <div>
                <div className="workspace-name">LAN RELAY</div>
                <div className="workspace-category">E2EE PEER TUNNEL</div>
              </div>
              <span className="workspace-arrow">↗</span>
            </div>
          </Link>
        </div>
      </section>

      {/* ====================================================================
          /04 & /05 SYSTEM TELEMETRY & STATUS
          ==================================================================== */}
      <section className="telemetry-row-grid">
        <div className="telemetry-panel">
          <div className="section-header-row" style={{ marginTop: 0, paddingTop: 0 }}>
            <div className="section-title-group">
              <span className="section-index" style={{ marginBottom: 0 }}>/04</span>
              <span className="section-heading-mono">SYSTEM TELEMETRY</span>
            </div>
            <div className="badge-lime">
              <span className="pulse-dot dot-lime" />
              <span>ALL SYSTEMS OPERATIONAL</span>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <div className="telemetry-metric-row">
              <span className="telemetry-metric-label">CRYPTO_ENGINE</span>
              <div className="telemetry-metric-bar">
                <div className="telemetry-metric-bar-fill" style={{ width: '100%' }}></div>
              </div>
              <span className="telemetry-metric-val">ECDSA_P256</span>
            </div>
            <div className="telemetry-metric-row">
              <span className="telemetry-metric-label">HASH_ALGORITHM</span>
              <div className="telemetry-metric-bar">
                <div className="telemetry-metric-bar-fill" style={{ width: '100%' }}></div>
              </div>
              <span className="telemetry-metric-val">SHA-256</span>
            </div>
            <div className="telemetry-metric-row">
              <span className="telemetry-metric-label">ONNX_MODEL</span>
              <div className="telemetry-metric-bar">
                <div className="telemetry-metric-bar-fill" style={{ width: '92%' }}></div>
              </div>
              <span className="telemetry-metric-val">LOCAL RUNTIME</span>
            </div>
            <div className="telemetry-metric-row">
              <span className="telemetry-metric-label">NETWORK_ISOLATION</span>
              <div className="telemetry-metric-bar">
                <div className="telemetry-metric-bar-fill" style={{ width: '100%' }}></div>
              </div>
              <span className="telemetry-metric-val">ZERO-EGRESS</span>
            </div>
          </div>
        </div>

        <div className="telemetry-panel">
          <div className="section-header-row" style={{ marginTop: 0, paddingTop: 0 }}>
            <div className="section-title-group">
              <span className="section-index" style={{ marginBottom: 0 }}>/05</span>
              <span className="section-heading-mono">CRYPTOGRAPHIC SUITE</span>
            </div>
            <span className="section-annotation">STANDARDS & SPEC</span>
          </div>

          <div style={{ marginTop: '16px' }}>
            <div className="telemetry-metric-row">
              <span className="telemetry-metric-label">RFC 7515</span>
              <span className="telemetry-metric-val">JSON WEB SIGNATURE (JWS)</span>
            </div>
            <div className="telemetry-metric-row">
              <span className="telemetry-metric-label">RFC 7517</span>
              <span className="telemetry-metric-val">JSON WEB KEY (JWK)</span>
            </div>
            <div className="telemetry-metric-row">
              <span className="telemetry-metric-label">RFC 5869</span>
              <span className="telemetry-metric-val">HKDF-SHA256 KEY DERIVATION</span>
            </div>
            <div className="telemetry-metric-row">
              <span className="telemetry-metric-label">FIPS 197</span>
              <span className="telemetry-metric-val">AES-256-GCM AUTHENTICATED</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
