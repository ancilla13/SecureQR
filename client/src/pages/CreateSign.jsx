import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  Key, QrCode, Download, Copy, Check, RefreshCw, 
  ShieldCheck, Clock, User, FileText, Globe, CheckCircle2, AlertCircle
} from 'lucide-react';
import { 
  loadActiveIdentity, 
  generateSigningIdentity 
} from '../engine/keystore';
import { signPayload } from '../engine/cryptoSign';
import '../styles/wallet.css';

export default function CreateSign() {
  const [identity, setIdentity] = useState(null);
  const [activeKeyPair, setActiveKeyPair] = useState(null);
  const [aliasInput, setAliasInput] = useState('');
  
  // Payload input fields
  const [contentType, setContentType] = useState('url'); // 'url' | 'text' | 'payment'
  const [content, setContent] = useState('');
  const [expiryOption, setExpiryOption] = useState('never'); // 'never' | '1h' | '24h' | '7d' | '30d'
  
  // Generation state
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [signedPayload, setSignedPayload] = useState(null);
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Load identity from IndexedDB on mount
  useEffect(() => {
    async function loadIdentity() {
      try {
        const stored = await loadActiveIdentity();
        if (stored) {
          setIdentity(stored.identity);
          setActiveKeyPair(stored.keyPair);
          setAliasInput(stored.identity.alias || '');
        }
      } catch (err) {
        console.error('Failed to load active identity from IndexedDB:', err);
      }
    }
    loadIdentity();
  }, []);

  const handleCreateNewIdentity = async () => {
    setIsGeneratingKey(true);
    setError('');
    try {
      const { identity: newIdentity, keyPair } = await generateSigningIdentity(aliasInput || 'Personal Identity');
      setIdentity(newIdentity);
      setActiveKeyPair(keyPair);
      setSignedPayload(null);
      setQrDataUrl('');
    } catch (err) {
      setError(`Failed to generate signing key: ${err.message}`);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleSignAndGenerateQR = async () => {
    if (!content.trim()) {
      setError('Please enter content or a URL to sign.');
      return;
    }

    if (!activeKeyPair?.privateKey) {
      setError('No active signing key found. Please generate or import your signing identity first.');
      return;
    }

    setIsSigning(true);
    setError('');

    try {
      // Calculate expiry timestamp if chosen
      let expTimestamp = null;
      const now = Math.floor(Date.now() / 1000);
      if (expiryOption === '1h') expTimestamp = now + 3600;
      else if (expiryOption === '24h') expTimestamp = now + 86400;
      else if (expiryOption === '7d') expTimestamp = now + (7 * 86400);
      else if (expiryOption === '30d') expTimestamp = now + (30 * 86400);

      // 1. Digitally sign the canonical payload using ECDSA P-256
      const payload = await signPayload(activeKeyPair.privateKey, {
        content: content.trim(),
        contentType,
        kid: identity.kid,
        name: aliasInput.trim() || identity.alias,
        exp: expTimestamp
      });

      setSignedPayload(payload);

      // 2. Render high-contrast QR code
      const qrData = await QRCode.toDataURL(JSON.stringify(payload), {
        width: 320,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#002970', // Deep Navy
          light: '#ffffff'
        }
      });

      setQrDataUrl(qrData);
    } catch (err) {
      setError(`Signing error: ${err.message}`);
    } finally {
      setIsSigning(false);
    }
  };

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `secureqr-${identity?.alias || 'code'}-${Date.now()}.png`;
    a.click();
  };

  const handleExportPublicKey = () => {
    if (!identity?.publicKey) return;
    const blob = new Blob([JSON.stringify(identity.publicKey, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${identity.alias.toLowerCase().replace(/\s+/g, '_')}_public_key.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyPublicKey = () => {
    if (!identity?.publicKey) return;
    navigator.clipboard.writeText(JSON.stringify(identity.publicKey, null, 2));
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="wallet-page animate-fade-in">
      <div className="page-header text-center">
        <h1 className="page-title">Create & Sign QR</h1>
        <p className="page-subtitle">
          Attach a verifiable ECDSA P-256 digital signature to your text, link, or credentials.
        </p>
      </div>

      {error && (
        <div className="wallet-alert alert-danger animate-fade-in">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="create-grid">
        {/* Left Column: Identity & Signing Form */}
        <div className="card-column">
          {/* Section 1: Signing Identity */}
          <div className="wallet-card">
            <div className="card-header">
              <div className="header-icon-wrap icon-primary">
                <Key size={20} />
              </div>
              <div>
                <h3 className="card-heading">1. Signing Identity (ECDSA P-256)</h3>
                <p className="card-subtext">Your private key is stored locally and signs every created QR code.</p>
              </div>
            </div>

            <div className="card-body">
              {identity ? (
                <div className="identity-active-box">
                  <div className="identity-row">
                    <span className="field-label">Active Signer Alias:</span>
                    <span className="field-value font-bold">{identity.alias}</span>
                  </div>
                  <div className="identity-row">
                    <span className="field-label">Public Key Fingerprint (SHA-256):</span>
                    <span className="fingerprint-tag">{identity.fingerprint}</span>
                  </div>
                  <div className="identity-actions mt-3">
                    <button className="btn-wallet btn-wallet-secondary text-sm" onClick={handleExportPublicKey}>
                      <Download size={14} /> Export Public Key (JSON)
                    </button>
                    <button className="btn-wallet btn-wallet-ghost text-sm" onClick={handleCopyPublicKey}>
                      {copiedKey ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                      {copiedKey ? 'Copied' : 'Copy JWK'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="empty-identity-box">
                  <p className="text-secondary text-sm">No signing key found in this browser. Generate one to begin.</p>
                </div>
              )}

              <div className="mt-4 pt-3 border-t">
                <label className="input-label">Identity Name / Alias</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="wallet-input" 
                    placeholder="e.g. Alice Sharma or Project Admin" 
                    value={aliasInput} 
                    onChange={(e) => setAliasInput(e.target.value)} 
                  />
                  <button 
                    className="btn-wallet btn-wallet-primary whitespace-nowrap"
                    onClick={handleCreateNewIdentity}
                    disabled={isGeneratingKey}
                  >
                    <RefreshCw size={16} className={isGeneratingKey ? 'spin' : ''} />
                    {identity ? 'Rotate Key' : 'Generate Key'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: QR Payload & Expiry Form */}
          <div className="wallet-card mt-4">
            <div className="card-header">
              <div className="header-icon-wrap icon-secondary">
                <FileText size={20} />
              </div>
              <div>
                <h3 className="card-heading">2. Payload & Expiry Configuration</h3>
                <p className="card-subtext">The cryptographic signature strictly covers content and expiry metadata.</p>
              </div>
            </div>

            <div className="card-body">
              <div className="form-group">
                <label className="input-label">Content Type</label>
                <div className="type-toggle-group">
                  <button 
                    type="button" 
                    className={`type-toggle-btn ${contentType === 'url' ? 'active' : ''}`}
                    onClick={() => setContentType('url')}
                  >
                    <Globe size={16} /> URL Link
                  </button>
                  <button 
                    type="button" 
                    className={`type-toggle-btn ${contentType === 'text' ? 'active' : ''}`}
                    onClick={() => setContentType('text')}
                  >
                    <FileText size={16} /> Plain Text
                  </button>
                  <button 
                    type="button" 
                    className={`type-toggle-btn ${contentType === 'payment' ? 'active' : ''}`}
                    onClick={() => setContentType('payment')}
                  >
                    <ShieldCheck size={16} /> Credential
                  </button>
                </div>
              </div>

              <div className="form-group mt-3">
                <label className="input-label">Payload Content to Sign</label>
                <textarea 
                  className="wallet-textarea" 
                  rows={4}
                  placeholder={contentType === 'url' ? 'https://your-domain.edu/transcript' : 'Enter plain text or credential data...'}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>

              <div className="form-group mt-3">
                <label className="input-label">Validity & Expiration Policy</label>
                <select 
                  className="wallet-input" 
                  value={expiryOption} 
                  onChange={(e) => setExpiryOption(e.target.value)}
                >
                  <option value="never">Never Expires (Permanent Record)</option>
                  <option value="1h">1 Hour (Single Session / OTP)</option>
                  <option value="24h">24 Hours (Daily Pass / Event Ticket)</option>
                  <option value="7d">7 Days (Weekly Clearance)</option>
                  <option value="30d">30 Days (Monthly Certificate)</option>
                </select>
              </div>

              <button 
                className="btn-wallet btn-wallet-primary w-full mt-4 btn-large"
                onClick={handleSignAndGenerateQR}
                disabled={isSigning || !content.trim()}
              >
                {isSigning ? <RefreshCw className="spin" size={18} /> : <QrCode size={18} />}
                Sign & Generate Secure QR
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live QR Preview & Signed Payload Inspector */}
        <div className="card-column">
          <div className="wallet-card text-center">
            <div className="card-header text-left">
              <div className="header-icon-wrap icon-success">
                <QrCode size={20} />
              </div>
              <div>
                <h3 className="card-heading">Generated QR Code</h3>
                <p className="card-subtext">Self-contained with payload metadata and ECDSA signature.</p>
              </div>
            </div>

            <div className="card-body flex-center">
              {qrDataUrl ? (
                <div className="qr-preview-wrapper animate-fade-in">
                  <div className="qr-frame">
                    <img src={qrDataUrl} alt="Signed QR" className="qr-rendered-img" />
                  </div>

                  <div className="qr-details-summary mt-3">
                    <span className="badge-chip chip-success">
                      <CheckCircle2 size={14} /> ECDSA P-256 Signed
                    </span>
                    {signedPayload?.exp && (
                      <span className="badge-chip chip-warning">
                        <Clock size={14} /> Expires: {new Date(signedPayload.exp * 1000).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex gap-2 justify-center">
                    <button className="btn-wallet btn-wallet-primary" onClick={handleDownloadQR}>
                      <Download size={16} /> Download PNG
                    </button>
                  </div>

                  {signedPayload && (
                    <div className="payload-inspect-box mt-4 text-left">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-secondary uppercase">Encoded JSON Payload</span>
                        <button 
                          className="text-xs text-primary font-bold hover:underline"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(signedPayload, null, 2));
                            setCopiedPayload(true);
                            setTimeout(() => setCopiedPayload(false), 2000);
                          }}
                        >
                          {copiedPayload ? 'Copied' : 'Copy JSON'}
                        </button>
                      </div>
                      <pre className="code-block-preview">
                        {JSON.stringify(signedPayload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="qr-empty-placeholder">
                  <div className="placeholder-icon">
                    <QrCode size={64} />
                  </div>
                  <h4 className="font-bold text-lg mt-3 text-secondary">No QR Generated Yet</h4>
                  <p className="text-secondary text-sm max-w-xs mt-1">
                    Fill in your content on the left, configure optional expiry, and click "Sign & Generate Secure QR".
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
