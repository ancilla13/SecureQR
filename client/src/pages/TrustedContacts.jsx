import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, UserPlus, ShieldCheck, ShieldAlert, AlertTriangle, 
  Trash2, Download, Copy, Check, Eye, X, Upload, CheckCircle2,
  Lock, RefreshCw, Key, ExternalLink, ShieldQuestion
} from 'lucide-react';
import { 
  getAllContacts, 
  saveContact, 
  setContactTrustStatus, 
  removeContact,
  validatePublicKeyJWK,
  computeKeyFingerprint
} from '../engine/keystore.js';
import '../styles/wallet.css';

export default function TrustedContacts() {
  const [contacts, setContacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Import form state
  const [contactName, setContactName] = useState('');
  const [jwkInput, setJwkInput] = useState('');
  const [parsedJwk, setParsedJwk] = useState(null);
  const [computedFp, setComputedFp] = useState('');
  const [importError, setImportError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  // Modals state
  const [verifyingContact, setVerifyingContact] = useState(null);
  const [inspectContact, setInspectContact] = useState(null);
  const [copiedFp, setCopiedFp] = useState(false);

  useEffect(() => {
    loadContactsList();
  }, []);

  const loadContactsList = async () => {
    setIsLoading(true);
    try {
      const list = await getAllContacts();
      setContacts(list || []);
    } catch (err) {
      setError(`Failed to load contacts: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Validate and parse raw JWK string or object
  const processKeyInput = async (rawText) => {
    setImportError('');
    setParsedJwk(null);
    setComputedFp('');

    if (!rawText.trim()) return;

    try {
      const parsed = JSON.parse(rawText.trim());
      
      // Strict security validation (rejects private key 'd')
      const validation = validatePublicKeyJWK(parsed);
      if (!validation.isValid) {
        setImportError(validation.error);
        return;
      }

      const fp = await computeKeyFingerprint(parsed);
      setParsedJwk(parsed);
      setComputedFp(fp);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setImportError('Invalid JSON format. Please paste a valid JWK object.');
      } else {
        setImportError(err.message);
      }
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json') && !file.name.endsWith('.jwk')) {
      setImportError('Unsupported file format. Please upload a .json or .jwk file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result;
        setJwkInput(text);
        // Suggest name from file name if empty
        if (!contactName.trim()) {
          const suggested = file.name.replace(/(_public_key|\.jwk|\.json)/gi, '').replace(/[_-]/g, ' ');
          if (suggested) {
            setContactName(suggested.charAt(0).toUpperCase() + suggested.slice(1));
          }
        }
        await processKeyInput(text);
      } catch (err) {
        setImportError(`Failed to read key file: ${err.message}`);
      }
    };
    reader.onerror = () => setImportError('Error reading key file.');
    reader.readAsText(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!contactName.trim()) {
      setImportError('Please provide a contact name.');
      return;
    }
    if (!parsedJwk) {
      setImportError('Please provide a valid ECDSA P-256 public key.');
      return;
    }

    setIsSubmitting(true);
    setImportError('');
    try {
      await saveContact({
        name: contactName.trim(),
        publicKeyJWK: parsedJwk,
        isTrusted: false // Critical requirement: always unconfirmed on initial import
      });

      setSuccessMsg(`Public key for "${contactName.trim()}" imported successfully. It is marked as Unconfirmed until verified.`);
      setTimeout(() => setSuccessMsg(''), 5000);

      // Reset form
      setContactName('');
      setJwkInput('');
      setParsedJwk(null);
      setComputedFp('');

      await loadContactsList();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmTrust = async (contact) => {
    try {
      await setContactTrustStatus(contact.fingerprint, true);
      setVerifyingContact(null);
      setSuccessMsg(`Contact "${contact.name}" is now marked as Explicitly Trusted.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadContactsList();
    } catch (err) {
      setError(`Failed to update trust status: ${err.message}`);
    }
  };

  const handleRevokeTrust = async (contact) => {
    try {
      await setContactTrustStatus(contact.fingerprint, false);
      setSuccessMsg(`Trust revoked for "${contact.name}". Key marked as Unconfirmed.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadContactsList();
    } catch (err) {
      setError(`Failed to revoke trust: ${err.message}`);
    }
  };

  const handleRemoveContact = async (contact) => {
    if (!window.confirm(`Are you sure you want to remove "${contact.name}" from your contacts?`)) {
      return;
    }
    try {
      await removeContact(contact.fingerprint);
      setSuccessMsg(`Contact "${contact.name}" removed.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadContactsList();
    } catch (err) {
      setError(`Failed to remove contact: ${err.message}`);
    }
  };

  const handleExportContactKey = (contact) => {
    const clean = { ...contact.publicKeyJWK };
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contact.name.toLowerCase().replace(/\s+/g, '_')}_public_key.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedFp(true);
    setTimeout(() => setCopiedFp(false), 2000);
  };

  return (
    <div className="wallet-page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Trusted Contacts & Public Keys</h1>
        <p className="page-subtitle">
          Manage verified peer identities for ECDSA P-256 digital signature verification.
          Distinguish explicitly verified identities from unconfirmed imported keys.
        </p>
      </div>

      {successMsg && (
        <div className="wallet-alert alert-success animate-fade-in">
          <CheckCircle2 size={20} />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="wallet-alert alert-danger animate-fade-in">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}

      <div className="create-grid">
        {/* Left Column: Contact List */}
        <div className="card-column">
          <div className="wallet-card">
            <div className="card-header">
              <div className="card-title-group">
                <div className="card-icon-box">
                  <Users size={22} className="text-navy" />
                </div>
                <div>
                  <h2 className="card-title">Saved Public Keys ({contacts.length})</h2>
                  <p className="card-subtitle">Locally stored public keys used for QR signature verification</p>
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="text-center" style={{ padding: '40px 0' }}>
                <RefreshCw className="spin text-blue" size={28} />
                <p style={{ marginTop: '12px', color: 'var(--wallet-text-secondary)' }}>Loading keystore contacts...</p>
              </div>
            ) : contacts.length === 0 ? (
              <div className="qr-empty-placeholder">
                <div className="placeholder-icon">
                  <Users size={36} />
                </div>
                <h3 style={{ marginTop: '16px', fontWeight: 700, color: 'var(--wallet-navy)' }}>No Contacts Added Yet</h3>
                <p style={{ maxWidth: '360px', textAlign: 'center', marginTop: '6px', fontSize: '0.9rem' }}>
                  Import a creator's public key using the form on the right to verify signed QR codes from them.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
                {contacts.map((contact) => (
                  <div 
                    key={contact.fingerprint} 
                    style={{
                      border: '1px solid var(--wallet-border)',
                      borderRadius: '14px',
                      padding: '16px',
                      backgroundColor: contact.isTrusted ? '#fafcff' : '#fffdfa',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--wallet-navy)' }}>
                            {contact.name}
                          </span>
                          {contact.isTrusted ? (
                            <span className="badge-chip chip-success" title="Fingerprint confirmed out-of-band">
                              <ShieldCheck size={14} /> Explicitly Trusted
                            </span>
                          ) : (
                            <span className="badge-chip chip-warning" title="Fingerprint not yet confirmed">
                              <ShieldQuestion size={14} /> Unconfirmed
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--wallet-text-secondary)', marginTop: '4px' }}>
                          Key ID: <code style={{ color: 'var(--wallet-blue)', fontWeight: 600 }}>{contact.kid}</code> • Added {new Date(contact.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                          onClick={() => setInspectContact(contact)}
                          title="Inspect Public Key JWK"
                        >
                          <Eye size={14} /> Inspect
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                          onClick={() => handleExportContactKey(contact)}
                          title="Export Public Key File"
                        >
                          <Download size={14} />
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '6px 10px', fontSize: '0.8rem', color: 'var(--wallet-danger)' }}
                          onClick={() => handleRemoveContact(contact)}
                          title="Remove Contact"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Fingerprint Display */}
                    <div style={{ marginTop: '12px', background: '#f1f5f9', padding: '10px 12px', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wallet-text-secondary)', textTransform: 'uppercase' }}>
                          SHA-256 Key Fingerprint:
                        </span>
                        <button 
                          onClick={() => handleCopyText(contact.fingerprint)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wallet-blue)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {copiedFp ? <Check size={12} /> : <Copy size={12} />} Copy
                        </button>
                      </div>
                      <code style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--wallet-navy)', wordBreak: 'break-all' }}>
                        {contact.fingerprint}
                      </code>
                    </div>

                    {/* Verification Status Warning / Controls */}
                    {!contact.isTrusted ? (
                      <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fef3c7', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', gap: '8px', color: '#b45309', alignItems: 'flex-start' }}>
                          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                          <div>
                            <strong>Identity unconfirmed:</strong> Anyone can create a key with this name. Compare this fingerprint with {contact.name} via phone or in-person before trusting.
                          </div>
                        </div>
                        <div style={{ marginTop: '8px', textAlign: 'right' }}>
                          <button 
                            className="btn btn-primary"
                            style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                            onClick={() => setVerifyingContact(contact)}
                          >
                            <ShieldCheck size={14} /> Verify Fingerprint & Trust
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--wallet-success)' }}>
                        <span>✓ Verified out-of-band {contact.verifiedAt ? `on ${new Date(contact.verifiedAt).toLocaleDateString()}` : ''}</span>
                        <button 
                          onClick={() => handleRevokeTrust(contact)}
                          style={{ background: 'none', border: 'none', color: 'var(--wallet-text-secondary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}
                        >
                          Revoke Trust
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Import New Public Key */}
        <div className="card-column">
          <div className="wallet-card">
            <div className="card-header">
              <div className="card-title-group">
                <div className="card-icon-box">
                  <UserPlus size={22} className="text-blue" />
                </div>
                <div>
                  <h2 className="card-title">Import Creator Public Key</h2>
                  <p className="card-subtitle">Add a sender's public key (ECDSA P-256 JWK format)</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label">Contact / Organization Name</label>
                <input 
                  type="text"
                  className="wallet-input"
                  placeholder="e.g. Alice Bobson or Apex University"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>

              {/* File upload shortcut */}
              <div>
                <label className="form-label">Select Key File (.json / .jwk)</label>
                <div 
                  style={{
                    border: '2px dashed var(--wallet-border)',
                    borderRadius: '12px',
                    padding: '16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: '#f8fafc'
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    accept=".json,.jwk,application/json"
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                  />
                  <Upload size={24} className="text-blue" style={{ margin: '0 auto 6px' }} />
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--wallet-navy)' }}>
                    Click to browse key file
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--wallet-text-secondary)', marginTop: '2px' }}>
                    Standard JWK exported from SecureQR or compatible tools
                  </div>
                </div>
              </div>

              <div>
                <label className="form-label">Or Paste JWK Public Key JSON</label>
                <textarea 
                  className="wallet-textarea"
                  rows={5}
                  placeholder='{"kty":"EC","crv":"P-256","x":"...","y":"..."}'
                  value={jwkInput}
                  onChange={(e) => {
                    setJwkInput(e.target.value);
                    processKeyInput(e.target.value);
                  }}
                />
              </div>

              {/* Live validation feedback */}
              {computedFp && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--wallet-success)', fontWeight: 700, fontSize: '0.85rem' }}>
                    <ShieldCheck size={16} /> Valid ECDSA P-256 Public Key
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--wallet-text-secondary)', marginTop: '4px' }}>
                    Calculated Fingerprint:
                  </div>
                  <code style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--wallet-navy)', wordBreak: 'break-all' }}>
                    {computedFp}
                  </code>
                </div>
              )}

              {importError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px', color: 'var(--wallet-danger)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                    <ShieldAlert size={16} /> Key Validation Error
                  </div>
                  <div style={{ marginTop: '4px' }}>{importError}</div>
                </div>
              )}

              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--wallet-text-secondary)' }}>
                <Lock size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                <strong>Security Guarantee:</strong> Private keys (parameter <code>d</code>) are strictly forbidden and rejected. Only public verification coordinates are stored.
              </div>

              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={!parsedJwk || !contactName.trim() || isSubmitting}
                style={{ width: '100%', padding: '12px' }}
              >
                {isSubmitting ? <RefreshCw className="spin" size={18} /> : <UserPlus size={18} />}
                Save as Unconfirmed Contact
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* MODAL: Verify Fingerprint & Trust */}
      {verifyingContact && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 15, 40, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            maxWidth: '520px',
            width: '100%',
            padding: '28px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldCheck size={24} className="text-blue" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--wallet-navy)', margin: 0 }}>
                  Confirm Identity & Trust
                </h3>
              </div>
              <button 
                onClick={() => setVerifyingContact(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wallet-text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--wallet-text-secondary)', lineHeight: 1.5 }}>
              To protect against man-in-the-middle attacks and impersonation, verify that this SHA-256 fingerprint exactly matches the fingerprint displayed on <strong>{verifyingContact.name}'s</strong> own device.
            </p>

            <div style={{
              background: '#f1f5f9',
              border: '2px solid var(--wallet-blue)',
              borderRadius: '12px',
              padding: '16px',
              margin: '20px 0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--wallet-text-secondary)', marginBottom: '8px' }}>
                OFFICIAL SHA-256 KEY FINGERPRINT
              </div>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '1.1rem',
                fontWeight: 800,
                color: 'var(--wallet-navy)',
                letterSpacing: '0.05em',
                lineHeight: 1.6,
                wordBreak: 'break-all'
              }}>
                {verifyingContact.fingerprint}
              </div>
            </div>

            <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '10px', fontSize: '0.82rem', color: '#92400e', marginBottom: '24px' }}>
              ⚠️ Do not confirm unless you have verified these characters with {verifyingContact.name} via phone, video, in-person, or an already-authenticated channel.
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary"
                onClick={() => setVerifyingContact(null)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={() => handleConfirmTrust(verifyingContact)}
              >
                <ShieldCheck size={18} /> I Have Verified This Fingerprint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Inspect JWK Details */}
      {inspectContact && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 15, 40, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            maxWidth: '560px',
            width: '100%',
            padding: '28px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Key size={22} className="text-blue" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--wallet-navy)', margin: 0 }}>
                  {inspectContact.name} — Public Key JWK
                </h3>
              </div>
              <button 
                onClick={() => setInspectContact(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wallet-text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--wallet-text-secondary)', marginBottom: '12px' }}>
              ECDSA NIST P-256 public verification parameters stored in your browser keystore.
            </div>

            <pre className="code-block-preview" style={{ maxHeight: '220px' }}>
              {JSON.stringify(inspectContact.publicKeyJWK, null, 2)}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <button 
                className="btn btn-secondary"
                onClick={() => handleCopyText(JSON.stringify(inspectContact.publicKeyJWK, null, 2))}
              >
                {copiedFp ? <Check size={16} /> : <Copy size={16} />} Copy JWK JSON
              </button>
              <button 
                className="btn btn-primary"
                onClick={() => setInspectContact(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
