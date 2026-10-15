import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, QrCode, Play, Globe, Lock, AlertTriangle, ArrowRight, Radio } from 'lucide-react';
import '../styles/home.css';

export default function Home() {
  return (
    <div className="home-container animate-fade-in">
      <div className="hero-section text-center">
        <div className="hero-badge-pill mb-3">
          <ShieldCheck size={16} className="text-success" />
          <span>Production-Grade Architecture for PBL</span>
        </div>
        <h1 className="hero-title">
          SecureQR <br />
          <span className="gradient-text">Scan anything. Trust nothing blindly.</span>
        </h1>
        <p className="hero-subtitle">
          QR codes only encode data—they don't prove authenticity. SecureQR introduces three independent security layers to inspect content, verify cryptographic signatures, and flag deceptive threats.
        </p>
        
        <div className="hero-actions flex justify-center gap-4 mt-4" style={{ flexWrap: 'wrap' }}>
          <Link to="/scanner" className="btn btn-primary btn-large">
            <ShieldCheck size={20} /> Scan & Verify
          </Link>
          <Link to="/lan" className="btn btn-accent btn-large" style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))', borderColor: 'var(--accent-primary)' }}>
            <Radio size={20} className="text-accent-primary" /> LAN Chat & Key Exchange
          </Link>
          <Link to="/create" className="btn btn-secondary btn-large">
            <QrCode size={20} /> Create & Sign QR
          </Link>
          <Link to="/contacts" className="btn btn-secondary btn-large">
            <Lock size={20} /> Trusted Contacts
          </Link>
        </div>
      </div>

      {/* Security Architecture & Features */}
      <div className="features-grid mt-5">
        <div className="feature-card glass-card animate-fade-in animate-delay-1">
          <div className="feature-icon bg-info">
            <Globe className="text-accent-secondary" size={24} />
          </div>
          <h3>Layer 1: Universal Inspection</h3>
          <p>Works for every QR code. Safely parses URLs, plain text, Wi-Fi, and payment schemes without auto-opening links or executing code.</p>
        </div>
        
        <div className="feature-card glass-card animate-fade-in animate-delay-2">
          <div className="feature-icon bg-safe">
            <Lock className="text-success" size={24} />
          </div>
          <h3>Layer 2: Cryptographic Authenticity</h3>
          <p>Verifies ECDSA P-256 signatures against your local Trusted Contacts keystore. Detects altered payloads and expired badges.</p>
        </div>

        <div className="feature-card glass-card animate-fade-in animate-delay-3">
          <div className="feature-icon bg-warning">
            <AlertTriangle className="text-warning" size={24} />
          </div>
          <h3>Layer 3: Threat Intelligence</h3>
          <p>Pretrained ONNX ML classifier combined with deterministic heuristics to identify phishing, homograph attacks, and deceptive hostnames.</p>
        </div>

        <div className="feature-card glass-card animate-fade-in animate-delay-4">
          <div className="feature-icon" style={{ background: 'rgba(99, 102, 241, 0.15)' }}>
            <Radio className="text-accent-primary" size={24} />
          </div>
          <h3>Stage 2: Secure LAN Key Exchange</h3>
          <p>End-to-end encrypted (E2EE) LAN chat using ephemeral ECDH + HKDF + AES-256-GCM. Share and trust public keys out-of-band directly across peers.</p>
        </div>
      </div>
    </div>
  );
}
