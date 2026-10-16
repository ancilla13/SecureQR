import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Radio, Lock, ShieldCheck, ShieldAlert, Key, Send, 
  Users, Check, Copy, RefreshCw, Eye, X, AlertTriangle,
  CheckCircle2, ArrowRight, UserPlus, Info, XCircle,
  Image as ImageIcon, Download, Maximize2, QrCode
} from 'lucide-react';
import { useLan } from '../context/LanContext.jsx';
import '../styles/wallet.css';

export default function LanChat() {
  const navigate = useNavigate();
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
    handleSendImage,
    confirmPeerSecurityCode,
    handleShareMyPublicKey,
    handleSaveContactFromChat,
    handleGenerateFreshIdentity,
    handleEndChat
  } = useLan();

  const [selectedImage, setSelectedImage] = useState(null); // { dataUrl, fileName, fileSize }
  const [inspectingImage, setInspectingImage] = useState(null); // full-size viewer modal
  const [isDragOverChat, setIsDragOverChat] = useState(false);

  const imageInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll chat window
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedImage]);

  const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

  // Read a raster image into a Data URL. SVG is intentionally excluded: it is
  // an active document format, not a safe chat attachment format.
  const processImageFile = (file) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      alert('Unsupported image type. Please choose a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      alert('Image file is too large (max 2 MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage({
        dataUrl: e.target.result,
        fileName: file.name || 'lan_attachment.png',
        fileSize: file.size
      });
    };
    reader.readAsDataURL(file);
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    e.target.value = '';
  };

  // Clipboard paste listener: paste screenshots directly into chat
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const chatDragCounterRef = useRef(0);

  const handleChatDragEnter = (e) => {
    e.preventDefault();
    chatDragCounterRef.current += 1;
    setIsDragOverChat(true);
  };

  const handleChatDragOver = (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDragOverChat(true);
  };

  const handleChatDragLeave = (e) => {
    e.preventDefault();
    chatDragCounterRef.current -= 1;
    if (chatDragCounterRef.current <= 0) {
      chatDragCounterRef.current = 0;
      setIsDragOverChat(false);
    }
  };

  const handleChatDrop = (e) => {
    e.preventDefault();
    chatDragCounterRef.current = 0;
    setIsDragOverChat(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const imgFile = Array.from(files).find((f) => f.type && f.type.startsWith('image/'));
      if (imgFile) {
        processImageFile(imgFile);
      }
    }
  };

  // Form submit handler supporting both text and image attachments
  const handleChatFormSubmit = async (e) => {
    e.preventDefault();
    if (selectedImage) {
      const { dataUrl, fileName } = selectedImage;
      setSelectedImage(null);
      await handleSendImage(dataUrl, inputText.trim(), fileName);
      setInputText('');
    } else {
      await handleSendMessage(e);
    }
  };

  // Download received or sent image
  const handleDownloadImage = (dataUrl, fileName = 'secureqr_image.png') => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    a.click();
  };

  // One-click Verify in Scanner
  const handleVerifyInScanner = (dataUrl) => {
    sessionStorage.setItem('pending_scan_image', dataUrl);
    navigate('/scanner');
  };

  return (
    <div className="wallet-page animate-fade-in">
      <div className="page-editorial-header">
        <div className="editorial-header-left">
          <span className="page-index-label">/04 RELAY</span>
          <h1 className="page-editorial-title">LAN RELAY &amp; KEY EXCHANGE</h1>
          <p className="page-editorial-desc">
            End-to-end encrypted local-network messaging via an authenticated relay, using ECDH P-256 + HKDF + AES-256-GCM.
            Share public keys over your local network and verify SHA-256 fingerprints directly.
          </p>
        </div>
        <div className="editorial-header-right">
          <div className="badge-lime">
            <span className="pulse-dot dot-lime" />
            <span>E2EE RELAY ENCRYPTED</span>
          </div>
          <div className="technical-coordinates">
            ECDH // AES-256-GCM TUNNEL
          </div>
        </div>
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
        <div 
          className="wallet-card" 
          style={{ height: '600px', display: 'flex', flexDirection: 'column', padding: 0, position: 'relative' }}
          onDragEnter={handleChatDragEnter}
          onDragOver={handleChatDragOver}
          onDragLeave={handleChatDragLeave}
          onDrop={handleChatDrop}
        >
          {isDragOverChat && (
            <div className="chat-drop-overlay">
              <div className="chat-drop-card">
                <ImageIcon size={36} color="var(--accent-lime)" />
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem', color: '#FFFFFF', letterSpacing: '0.05em' }}>
                  DROP IMAGE TO STAGE FOR ENCRYPTION
                </span>
                <span style={{ fontSize: '0.75rem', color: '#A0A0A5', fontFamily: 'var(--font-mono)' }}>
                  PNG, JPEG, WebP (up to 2 MB) • Encrypted via AES-256-GCM
                </span>
              </div>
            </div>
          )}
          
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
                      {!activePeer.sasVerified && ' — compare this code with your peer before enabling chat.'}
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
                  disabled={activePeer.handshakeStatus !== 'established' || !activePeer.sasVerified}
                >
                  <Key size={14} /> Share My Public Key
                </button>
                {activePeer.handshakeStatus === 'established' && !activePeer.sasVerified && (
                  <button
                    className="btn btn-primary"
                    style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                    onClick={() => confirmPeerSecurityCode(activePeer.peerId)}
                    title="Only confirm after comparing the six-digit code out of band"
                  >
                    <CheckCircle2 size={14} /> I Compared the Code
                  </button>
                )}
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
                      maxWidth: '78%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: m.isMine ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '3px', padding: '0 4px', fontFamily: 'var(--font-mono)' }}>
                      {m.isMine ? 'You' : m.senderName} • {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>

                    {m.isImage && m.imageData?.dataUrl ? (
                      <div 
                        style={{
                          border: '1px solid var(--border-color)',
                          background: '#111114',
                          padding: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          maxWidth: '380px',
                          width: '100%'
                        }}
                      >
                        <div 
                          style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', background: '#000000', border: '1px solid #27272a' }}
                          onClick={() => setInspectingImage(m.imageData)}
                          title="Click to view full image"
                        >
                          <img 
                            src={m.imageData.dataUrl} 
                            alt={m.imageData.fileName || 'Encrypted attachment'}
                            style={{ width: '100%', maxHeight: '260px', objectFit: 'contain', display: 'block' }}
                          />
                        </div>

                        {/* Image Action Bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #27272a', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.7rem', color: '#8E8E93', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                            {m.imageData.fileName || 'IMAGE'}
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                              onClick={() => setInspectingImage(m.imageData)}
                              title="Inspect Full Image"
                            >
                              <Maximize2 size={12} /> View
                            </button>
                            <button
                              type="button"
                              className="btn btn-lime"
                              style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                              onClick={() => handleVerifyInScanner(m.imageData.dataUrl)}
                              title="Load and Verify QR in Scanner"
                            >
                              <QrCode size={12} /> Scan ↗
                            </button>
                            <button
                              type="button"
                              className="btn btn-dark"
                              style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                              onClick={() => handleDownloadImage(m.imageData.dataUrl, m.imageData.fileName)}
                              title="Download Image"
                            >
                              <Download size={12} />
                            </button>
                          </div>
                        </div>

                        {m.text && (
                          <div style={{ color: '#F5F5F2', fontSize: '0.88rem', marginTop: '2px', lineHeight: 1.4, fontFamily: 'var(--font-sans)' }}>
                            {m.text}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div 
                        style={{
                          padding: '10px 14px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: m.isMine ? '#111111' : '#FFFFFF',
                          color: m.isMine ? '#FFFFFF' : '#111111',
                          fontSize: '0.92rem',
                          lineHeight: 1.4,
                          boxShadow: 'none'
                        }}
                      >
                        {m.text}
                      </div>
                    )}

                    {m.envelope && (
                      <button
                        onClick={() => setAuditEnvelope(m.envelope)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '2px 4px',
                          cursor: 'pointer',
                          fontSize: '0.68rem',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          marginTop: '2px',
                          fontFamily: 'var(--font-mono)'
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

          {/* Staged Image Preview Bar (Above Input) */}
          {selectedImage && (
            <div 
              style={{
                padding: '10px 20px',
                borderTop: '1px solid var(--border-color)',
                background: 'var(--bg-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                <img 
                  src={selectedImage.dataUrl} 
                  alt="Staged attachment" 
                  style={{ width: '44px', height: '44px', objectFit: 'cover', border: '1px solid var(--border-color)', flexShrink: 0 }}
                />
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedImage.fileName}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {(selectedImage.fileSize / 1024).toFixed(1)} KB • Encrypted with AES-256-GCM upon send
                  </div>
                </div>
              </div>
              <button 
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.78rem', flexShrink: 0 }}
                onClick={() => setSelectedImage(null)}
              >
                <X size={14} /> Remove
              </button>
            </div>
          )}

          {/* Hidden File Input for Image Attachments */}
          <input 
            type="file" 
            ref={imageInputRef} 
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={handleImageFileChange}
          />

          {/* Message Input or Reconnect Action */}
          {activePeer && activePeer.handshakeStatus !== 'established' ? (
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', background: '#fffbeb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
              onSubmit={handleChatFormSubmit}
              style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px', alignItems: 'center' }}
            >
              <button 
                type="button"
                className="btn btn-secondary"
                style={{ padding: '12px 14px' }}
                onClick={() => imageInputRef.current?.click()}
                disabled={!activePeer || activePeer.handshakeStatus !== 'established' || !activePeer.sasVerified}
                title="Attach Image or QR Code"
              >
                <ImageIcon size={18} />
              </button>
              <input 
                type="text"
                className="wallet-input"
                placeholder={
                  selectedImage 
                    ? "Add optional caption for this encrypted image..." 
                    : (activePeer ? `Encrypted message to ${activePeer.name}...` : 'Select a peer to start typing...')
                }
                value={inputText}
                disabled={!activePeer || activePeer.handshakeStatus !== 'established' || !activePeer.sasVerified}
                onChange={(e) => setInputText(e.target.value)}
                style={{ flex: 1 }}
              />
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={(!inputText.trim() && !selectedImage) || !activePeer || activePeer.handshakeStatus !== 'established' || !activePeer.sasVerified}
              >
                <Send size={16} /> Send
              </button>
            </form>
          )}
        </div>
      </div>

      {/* MODAL: Fullscreen Image Inspector */}
      {inspectingImage && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(17, 17, 20, 0.88)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000000,
          padding: '24px'
        }}>
          <div style={{
            background: 'var(--panel-dark)',
            border: '1px solid var(--border-color)',
            borderRadius: 0,
            maxWidth: '800px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #27272a' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ImageIcon size={20} style={{ color: 'var(--accent-lime)' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 800, color: '#F5F5F2' }}>
                  {inspectingImage.fileName || 'ENCRYPTED_IMAGE_PAYLOAD'}
                </span>
              </div>
              <button 
                onClick={() => setInspectingImage(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F5F5F2' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000000', overflow: 'auto', flex: 1 }}>
              <img 
                src={inspectingImage.dataUrl} 
                alt="Fullscreen" 
                style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain' }}
              />
            </div>

            <div style={{ padding: '16px 20px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#8E8E93' }}>
                DECRYPTED WITH AES-256-GCM SESSION KEY
              </span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  className="btn btn-lime"
                  onClick={() => {
                    setInspectingImage(null);
                    handleVerifyInScanner(inspectingImage.dataUrl);
                  }}
                >
                  <QrCode size={16} /> Verify in Scanner ↗
                </button>
                <button 
                  className="btn btn-dark"
                  onClick={() => handleDownloadImage(inspectingImage.dataUrl, inspectingImage.fileName)}
                >
                  <Download size={16} /> Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
