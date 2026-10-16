import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  Key, QrCode, Download, Copy, Check, RefreshCw, 
  ShieldCheck, Clock, FileText, Globe, CheckCircle2, AlertCircle,
  Image as ImageIcon, Upload, X
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
  const [contentType, setContentType] = useState('url'); // 'url' | 'text' | 'payment' | 'image'
  const [content, setContent] = useState('');
  const [expiryOption, setExpiryOption] = useState('never'); // 'never' | '1h' | '24h' | '7d' | '30d'

  // Image badge credential states
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageHash, setImageHash] = useState('');
  const [imageTitle, setImageTitle] = useState('');
  const imageInputRef = useRef(null);
  
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

  const updateImagePayload = (title, hash, file) => {
    if (!hash || !file) return;
    const certPayload = JSON.stringify({
      type: 'image_cert',
      title: title.trim() || file.name,
      fileName: file.name,
      fileSize: file.size,
      sha256: hash
    }, null, 2);
    setContent(certPayload);
  };

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, WebP, SVG).');
      return;
    }
    setError('');
    setImageFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => setImagePreview(evt.target.result);
    reader.readAsDataURL(file);

    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    setImageHash(hashHex);

    updateImagePayload(imageTitle, hashHex, file);
    e.target.value = '';
  };

  const handleTitleChange = (val) => {
    setImageTitle(val);
    if (imageHash && imageFile) {
      updateImagePayload(val, imageHash, imageFile);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview('');
    setImageHash('');
    setContent('');
  };

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
      const signedPayload = await signPayload(activeKeyPair.privateKey, {
        content: content.trim(),
        contentType,
        kid: identity.kid,
        name: aliasInput.trim() || identity.alias,
        exp: expTimestamp
      });

      // Include only the public portion so a QR can be mathematically
      // verified on another device/browser. This does not grant trust: the
      // receiver must still confirm the displayed fingerprint out of band.
      const payload = {
        ...signedPayload,
        publicKeyJWK: {
          kty: 'EC',
          crv: 'P-256',
          x: identity.publicKey.x,
          y: identity.publicKey.y,
          kid: identity.kid
        }
      };

      setSignedPayload(payload);

      // 2. Render high-contrast QR code
      const qrData = await QRCode.toDataURL(JSON.stringify(payload), {
        width: 320,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#111111', // Pure Black
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
      <div className="page-editorial-header">
        <div className="editorial-header-left">
          <span className="page-index-label">/02 SIGNING</span>
          <h1 className="page-editorial-title">CREATE &amp; SIGN</h1>
          <p className="page-editorial-desc">
            Attach a tamper-evident ECDSA P-256 digital signature to your URL, text, or payment credentials.
          </p>
        </div>
        <div className="editorial-header-right">
          <div className="badge-lime">
            <span className="pulse-dot dot-lime" />
            <span>LOCAL KEYSTORE ARMED</span>
          </div>
          <div className="technical-coordinates">
            RFC 7515 // JWS CANONICAL
          </div>
        </div>
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
                  <button 
                    type="button" 
                    className={`type-toggle-btn ${contentType === 'image' ? 'active' : ''}`}
                    onClick={() => {
                      setContentType('image');
                      if (imageHash && imageFile) {
                        updateImagePayload(imageTitle, imageHash, imageFile);
                      }
                    }}
                  >
                    <ImageIcon size={16} /> Image Badge
                  </button>
                </div>
              </div>

              {contentType === 'image' ? (
                <div className="form-group mt-3">
                  <label className="input-label">Image Credential / Tamper-Proof Badge</label>
                  <input 
                    type="file" 
                    ref={imageInputRef} 
                    accept="image/*" 
                    style={{ display: 'none' }} 
                    onChange={handleImageFileChange} 
                  />
                  {!imageFile ? (
                    <div 
                      onClick={() => imageInputRef.current?.click()}
                      style={{
                        border: '2px dashed var(--border-color)',
                        background: 'var(--bg-subtle)',
                        padding: '24px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <Upload size={28} style={{ color: 'var(--accent-violet)' }} />
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700 }}>
                        SELECT IMAGE TO DIGITALLY SIGN
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Badge, photo ID, document scan, or certificate (PNG, JPG, WebP)
                      </div>
                    </div>
                  ) : (
                    <div style={{ border: '1px solid var(--border-color)', background: 'var(--bg-card)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          style={{ width: '60px', height: '60px', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                        />
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {imageFile.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                            {(imageFile.size / 1024).toFixed(1)} KB • Image Integrity Pre-Image
                          </div>
                        </div>
                        <button 
                          type="button" 
                          className="btn-wallet btn-wallet-ghost text-sm" 
                          onClick={handleRemoveImage}
                        >
                          <X size={14} /> Remove
                        </button>
                      </div>

                      <div>
                        <label className="input-label">Credential Title / Subject Name</label>
                        <input 
                          type="text" 
                          className="wallet-input" 
                          placeholder="e.g. Employee Security Clearance Badge"
                          value={imageTitle}
                          onChange={(e) => handleTitleChange(e.target.value)}
                        />
                      </div>

                      <div style={{ background: '#111114', padding: '10px 14px', border: '1px solid #27272a' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-lime)', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: '4px' }}>
                          DIGITAL IMAGE DIGEST (SHA-256):
                        </span>
                        <code style={{ fontSize: '0.76rem', color: '#00F5A0', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                          {imageHash}
                        </code>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
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
              )}

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
