import React, { useRef, useEffect } from 'react';
import { 
  Radio, Lock, ShieldCheck, ShieldAlert, Key, Send, 
  Users, Check, Copy, RefreshCw, Eye, X, AlertTriangle,
  CheckCircle2, ArrowRight, UserPlus, Info, XCircle
} from 'lucide-react';
import { useLan } from '../context/LanContext.jsx';
import '../styles/wallet.css';

export default function LanChat() {
  const {
    identity,
    loadingIdentity,
    roomId,
    setRoomId,
    connectionStatus,
    connError,
    peers,
    activePeerId,
    setActivePeerId,
    activePeer,
    messages,
    inputText,
    setInputText,
    auditEnvelope,
    setAuditEnvelope,
    contactSavedMsg,
    connectLan,
    disconnectLan,
    initiateHandshakeWithPeer,
    handleSendMessage,
    handleShareMyPublicKey,
    handleSaveContactFromChat,
    handleGenerateFreshIdentity,
    handleEndChat
  } = useLan();

  const messagesEndRef = useRef(null);

  // Auto-scroll chat window
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="wallet-page animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Authenticated LAN Chat & Key Exchange</h1>
        <p className="page-subtitle">
          Peer-to-peer end-to-end encrypted messaging via ECDH P-256 + HKDF + AES-256-GCM.
          Share public keys over your local network and verify SHA-256 fingerprints directly.
        </p>
      </div>

      {contactSavedMsg && (
        <div className="wallet-alert alert-success animate-fade-in">
          <CheckCircle2 size={20} />
          <span>{contactSavedMsg}</span>
        </div>
      )}

      {connError && (
        <div className="wallet-alert alert-danger animate-fade-in">
          <AlertTriangle size={20} />
          <span>{connError}</span>
        </div>
      )}

      {/* Top Connection Bar */}
      <div className="wallet-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="card-icon-box" style={{ background: connectionStatus === 'connected' ? '#e6f4ea' : '#f1f5f9' }}>
              <Radio size={24} style={{ color: connectionStatus === 'connected' ? 'var(--wallet-success)' : 'var(--wallet-neutral)' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--wallet-navy)' }}>
                  Local Network Channel
                </h3>
                <span className={`badge-chip ${connectionStatus === 'connected' ? 'chip-success' : connectionStatus === 'connecting' ? 'chip-warning' : 'badge-chip'}`}>
                  {connectionStatus === 'connected' ? '● Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--wallet-text-secondary)' }}>
                  {identity ? `Signed in as ${identity.alias} (${identity.kid})` : 'Loading identity...'}
                </span>
                <button
                  type="button"
                  onClick={handleGenerateFreshIdentity}
                  style={{
                    background: 'none',
                    border: '1px solid var(--wallet-border)',
                    borderRadius: '6px',
                    padding: '2px 8px',
                    fontSize: '0.72rem',
                    color: 'var(--wallet-text-secondary)',
                    cursor: 'pointer'
                  }}
                  title="Generate a new distinct peer keypair for this tab or window"
                >
                  Switch Identity
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wallet-text-secondary)', marginBottom: '2px' }}>
                Room Code:
              </label>
              <input 
                type="text" 
                className="wallet-input" 
                style={{ padding: '6px 10px', fontSize: '0.85rem', width: '160px' }}
                value={roomId}
                disabled={connectionStatus === 'connected'}
                onChange={(e) => setRoomId(e.target.value)}
              />
            </div>

            {connectionStatus !== 'connected' ? (
              <button 
                className="btn btn-primary" 
                style={{ alignSelf: 'flex-end', height: '36px', padding: '0 16px' }}
                onClick={connectLan}
                disabled={connectionStatus === 'connecting' || !identity}
              >
                {connectionStatus === 'connecting' ? <RefreshCw className="spin" size={16} /> : <Radio size={16} />}
                Join LAN Room
              </button>
            ) : (
              <button 
                className="btn btn-secondary" 
                style={{ alignSelf: 'flex-end', height: '36px', padding: '0 16px' }}
                onClick={disconnectLan}
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
        
        {/* Left Column: Discovered Peers */}
        <div className="wallet-card" style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ paddingBottom: '12px', borderBottom: '1px solid var(--wallet-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} className="text-navy" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                LAN Room Peers ({Object.keys(peers).length})
              </h3>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
            {Object.keys(peers).length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--wallet-text-secondary)', fontSize: '0.88rem' }}>
                {connectionStatus === 'connected' ? (
                  <>
                    <p style={{ margin: 0 }}>Waiting for peers in room <strong>{roomId}</strong>...</p>
                    <p style={{ fontSize: '0.78rem', marginTop: '6px' }}>Open SecureQR in another tab or device on your network to connect.</p>
                  </>
                ) : (
                  <p style={{ margin: 0 }}>Join a room to discover local peers.</p>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.values(peers).map((peer) => (
                  <div
                    key={peer.peerId}
                    onClick={() => setActivePeerId(peer.peerId)}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      border: activePeerId === peer.peerId ? '2px solid var(--wallet-blue)' : '1px solid var(--wallet-border)',
                      backgroundColor: activePeerId === peer.peerId ? '#f0f7ff' : '#ffffff',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--wallet-navy)' }}>
                        {peer.name}
                      </span>
                      {peer.handshakeStatus === 'established' ? (
                        <span className="badge-chip chip-success" style={{ fontSize: '0.7rem' }}>
                          <Lock size={10} style={{ marginRight: '3px' }} /> E2EE
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="badge-chip chip-warning"
                          style={{ fontSize: '0.7rem', border: 'none', cursor: 'pointer' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            initiateHandshakeWithPeer(peer.peerId);
                          }}
                          title="Click to retry handshake"
                        >
                          Handshake... ↺
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--wallet-text-secondary)', marginTop: '4px' }}>
                      Key ID: <code>{peer.kid || 'pending'}</code>
                    </div>
                    {peer.trustStatus === 'TRUSTED' && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--wallet-success)', fontWeight: 600, marginTop: '2px' }}>
                        ✓ Trusted Contact
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User's Own Fingerprint Card */}
          {identity && (
            <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid var(--wallet-border)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--wallet-text-secondary)', textTransform: 'uppercase' }}>
                My Public Key Fingerprint:
              </div>
              <code style={{ fontSize: '0.72rem', wordBreak: 'break-all', color: 'var(--wallet-navy)' }}>
                {identity.fingerprint}
              </code>
            </div>
          )}
        </div>

        {/* Right Column: Encrypted Chat Feed & Controls */}
        <div className="wallet-card" style={{ height: '600px', display: 'flex', flexDirection: 'column', padding: 0 }}>
          
          {/* Active Chat Header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--wallet-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {activePeer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="card-icon-box" style={{ background: activePeer.handshakeStatus === 'established' ? '#e8f0fe' : '#f1f5f9' }}>
                  <Lock size={20} className="text-blue" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--wallet-navy)' }}>
                      {activePeer.name}
                    </h3>
                    <span className={`badge-chip ${activePeer.trustStatus === 'TRUSTED' ? 'chip-success' : 'badge-chip'}`}>
                      {activePeer.trustStatus === 'TRUSTED' ? 'Trusted Contact' : 'Unknown Key'}
                    </span>
                  </div>
                  {activePeer.securityCode && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--wallet-text-secondary)', marginTop: '2px' }}>
                      Security Verification Code: <strong style={{ color: 'var(--wallet-navy)', letterSpacing: '1px' }}>{activePeer.securityCode}</strong>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <span style={{ fontSize: '0.95rem', color: 'var(--wallet-text-secondary)' }}>
                Select a peer to start encrypted chat
              </span>
            )}

            {/* Actions for Active Peer */}
            {activePeer && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                  onClick={handleShareMyPublicKey}
                  disabled={activePeer.handshakeStatus !== 'established'}
                >
                  <Key size={14} /> Share My Public Key
                </button>
                {activePeer.handshakeStatus === 'established' && (
                  <button 
                    className="btn btn-secondary" 
                    style={{ 
                      padding: '6px 12px', 
                      fontSize: '0.82rem', 
                      color: '#ef4444', 
                      borderColor: 'rgba(239, 68, 68, 0.35)',
                      backgroundColor: 'rgba(239, 68, 68, 0.05)'
                    }}
                    onClick={() => handleEndChat(activePeer.peerId)}
                    title="Terminate session and wipe session keys from memory"
                  >
                    <XCircle size={14} /> End Chat
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Chat Messages Feed */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.length === 0 ? (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--wallet-text-secondary)' }}>
                <Lock size={36} style={{ color: '#cbd5e1', marginBottom: '10px' }} />
                <p style={{ margin: 0, fontWeight: 600 }}>End-to-End Encrypted LAN Channel</p>
                <p style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                  Messages are encrypted using AES-256-GCM. The relay server cannot read your messages.
                </p>
              </div>
            ) : (
              messages.map((m) => {
                if (m.isSystem) {
                  return (
                    <div 
                      key={m.id}
                      style={{
                        margin: '8px auto',
                        maxWidth: '480px',
                        textAlign: 'center',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        backgroundColor: '#f8fafc',
                        border: '1px dashed #cbd5e1',
                        fontSize: '0.78rem',
                        color: 'var(--wallet-text-secondary)',
                        lineHeight: 1.4
                      }}
                    >
                      🛡️ {m.text}
                    </div>
                  );
                }

                if (m.isKeyShare) {
                  const ks = m.keyShareData;
                  return (
                    <div 
                      key={m.id} 
                      style={{
                        margin: '8px auto',
                        maxWidth: '480px',
                        width: '100%',
                        backgroundColor: '#f8fafc',
                        border: '2px solid #bfdbfe',
                        borderRadius: '14px',
                        padding: '16px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.92rem', color: 'var(--wallet-navy)' }}>
                          <Key size={18} className="text-blue" />
                          {m.isMine ? 'You Shared Your ECDSA Public Key' : `${ks.name} Shared Their Public Key`}
                        </div>
                        <span className="badge-chip chip-success" style={{ fontSize: '0.72rem' }}>
                          Signed Announcement
                        </span>
                      </div>

                      <div style={{ marginTop: '10px', fontSize: '0.78rem', color: 'var(--wallet-text-secondary)' }}>
                        Key ID: <code>{ks.kid}</code>
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--wallet-text-secondary)' }}>
                        SHA-256 Fingerprint:
                        <code style={{ display: 'block', wordBreak: 'break-all', marginTop: '2px', color: 'var(--wallet-navy)', fontWeight: 700 }}>
                          {ks.fingerprint}
                        </code>
                      </div>

                      {!m.isMine && (
                        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                          <button 
                            className="btn btn-primary" 
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                            onClick={() => handleSaveContactFromChat(ks, true)}
                          >
                            <UserPlus size={14} /> Trust Contact & Save Key
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div 
                    key={m.id}
                    style={{
                      alignSelf: m.isMine ? 'flex-end' : 'flex-start',
                      maxWidth: '75%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: m.isMine ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: 'var(--wallet-text-secondary)', marginBottom: '3px', padding: '0 4px' }}>
                      {m.isMine ? 'You' : m.senderName} • {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div 
                      style={{
                        padding: '10px 14px',
                        borderRadius: m.isMine ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                        backgroundColor: m.isMine ? 'var(--wallet-blue)' : '#f1f5f9',
                        color: m.isMine ? '#ffffff' : 'var(--wallet-text-primary)',
                        fontSize: '0.92rem',
                        lineHeight: 1.4,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                    >
                      {m.text}
                    </div>

                    {m.envelope && (
                      <button
                        onClick={() => setAuditEnvelope(m.envelope)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px 4px',
                          cursor: 'pointer',
                          fontSize: '0.68rem',
                          color: 'var(--wallet-text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          marginTop: '2px'
                        }}
                      >
                        <Lock size={10} /> AES-256-GCM (Seq #{m.envelope.seq}) • Audit Ciphertext
                      </button>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input or Reconnect Action */}
          {activePeer && activePeer.handshakeStatus !== 'established' ? (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--wallet-border)', background: '#fffbeb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.84rem', color: '#b45309', fontWeight: 600 }}>
                Secure session is ended. Ephemeral AES keys are purged.
              </span>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                onClick={() => initiateHandshakeWithPeer(activePeer.peerId)}
              >
                <Lock size={14} /> Start New Session
              </button>
            </div>
          ) : (
            <form 
              onSubmit={handleSendMessage}
              style={{ padding: '16px 20px', borderTop: '1px solid var(--wallet-border)', display: 'flex', gap: '10px' }}
            >
              <input 
                type="text"
                className="wallet-input"
                placeholder={activePeer ? `Encrypted message to ${activePeer.name}...` : 'Select a peer to start typing...'}
                value={inputText}
                disabled={!activePeer || activePeer.handshakeStatus !== 'established'}
                onChange={(e) => setInputText(e.target.value)}
                style={{ flex: 1 }}
              />
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={!inputText.trim() || !activePeer || activePeer.handshakeStatus !== 'established'}
              >
                <Send size={16} /> Send
              </button>
            </form>
          )}
        </div>
      </div>

      {/* MODAL: Ciphertext Audit Viewer (Zero-Knowledge Proof) */}
      {auditEnvelope && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 15, 40, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            maxWidth: '560px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={20} className="text-blue" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--wallet-navy)' }}>
                  Cryptographic Envelope Audit
                </h3>
              </div>
              <button 
                onClick={() => setAuditEnvelope(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wallet-text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--wallet-text-secondary)', lineHeight: 1.5 }}>
              This is the exact ciphertext and initialization vector relayed over the local network server. The server has no access to the plaintext or session key.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wallet-text-secondary)' }}>Algorithm & Sequence:</label>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--wallet-navy)' }}>
                  AES-256-GCM • Sequence #{auditEnvelope.seq}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wallet-text-secondary)' }}>96-bit Initialization Vector (IV Base64):</label>
                <code style={{ display: 'block', padding: '8px', background: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                  {auditEnvelope.iv}
                </code>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wallet-text-secondary)' }}>Ciphertext + 128-bit Auth Tag (Base64):</label>
                <code style={{ display: 'block', padding: '8px', background: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', wordBreak: 'break-all', maxHeight: '120px', overflowY: 'auto' }}>
                  {auditEnvelope.ciphertext}
                </code>
              </div>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setAuditEnvelope(null)}>
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
