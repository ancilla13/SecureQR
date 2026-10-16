import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  loadActiveIdentity, 
  generateSigningIdentity, 
  findContactByKeyOrKid, 
  saveContact 
} from '../engine/keystore.js';
import { 
  generateEcdhKeyPair, 
  createHandshakePacket, 
  verifyHandshakePacket, 
  deriveSessionKey, 
  encryptMessage, 
  decryptMessage, 
  createPublicKeyAnnouncement, 
  verifyPublicKeyAnnouncement 
} from '../engine/lanCrypto.js';

const LanContext = createContext(null);
const MAX_CHAT_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_CHAT_IMAGE_PREFIXES = ['data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/webp;base64,'];

function isSafeChatImage(dataUrl) {
  if (typeof dataUrl !== 'string' || !ALLOWED_CHAT_IMAGE_PREFIXES.some(prefix => dataUrl.startsWith(prefix))) {
    return false;
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return base64.length <= Math.ceil(MAX_CHAT_IMAGE_BYTES * 4 / 3);
}

export function LanProvider({ children }) {
  const location = useLocation();

  const [identity, setIdentity] = useState(null);
  const [loadingIdentity, setLoadingIdentity] = useState(true);

  // Network connection state
  const [wsUrl, setWsUrl] = useState(() => {
    if (typeof window !== 'undefined') {
      // Same-origin /ws: the Vite dev server proxies it to the relay on :4000,
      // so it works over HTTPS (wss) and from other devices on the LAN.
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Route via proxy on current origin so LAN peers only need access to the web server port
      // Same-origin /ws: the Vite dev server proxies it to the relay on :4000,
      // so it works over HTTPS (wss) and from other devices on the LAN.
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}/ws`;
    }
    return 'ws://localhost:4000/ws';
  });
  const [roomId, setRoomId] = useState('secureqr-lan-room');
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected'
  const [connError, setConnError] = useState('');
  const [peers, setPeers] = useState({}); // peerId -> { name, kid, signingKeyJWK, ecdhPubJWK, sessionKey, securityCode, handshakeStatus, trustStatus, sasVerified }
  const [activePeerId, setActivePeerId] = useState(null);

  // Messages & chat state
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [seqCounters, setSeqCounters] = useState({}); // peerId -> nextSeq
  const [receivedSeqs, setReceivedSeqs] = useState({}); // peerId -> maxReceivedSeq
  const [auditEnvelope, setAuditEnvelope] = useState(null);
  const [contactSavedMsg, setContactSavedMsg] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const wsRef = useRef(null);
  const myEcdhRef = useRef(null);
  const myPeerIdRef = useRef(`peer_${Math.random().toString(36).slice(2, 8)}`);

  // Synchronized refs to completely eliminate React stale closure bugs in WebSocket callbacks
  const peersRef = useRef({});
  const receivedSeqsRef = useRef({});
  const identityRef = useRef(null);
  const roomIdRef = useRef(roomId);
  const activePeerIdRef = useRef(activePeerId);
  const locationRef = useRef(location.pathname);

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  useEffect(() => {
    receivedSeqsRef.current = receivedSeqs;
  }, [receivedSeqs]);

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    activePeerIdRef.current = activePeerId;
  }, [activePeerId]);

  useEffect(() => {
    locationRef.current = location.pathname;
    if (location.pathname === '/lan') {
      setUnreadCount(0);
    }
  }, [location.pathname]);

  // Helper to update both state and ref atomically
  const updatePeersState = (updater) => {
    setPeers(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      peersRef.current = next;
      return next;
    });
  };

  // Load user's signing identity on mount
  useEffect(() => {
    async function initIdentity() {
      setLoadingIdentity(true);
      try {
        let stored = await loadActiveIdentity();
        if (!stored) {
          stored = await generateSigningIdentity('LAN User');
        }

        const active = {
          ...stored.identity,
          alias: stored.identity.alias || 'LAN User',
          kid: stored.identity.kid,
          fingerprint: stored.identity.fingerprint,
          publicKey: stored.identity.publicKey || stored.identity.publicKeyJWK,
          privateKey: stored.keyPair.privateKey,
          cryptoPublicKey: stored.keyPair.publicKey
        };

        setIdentity(active);
        identityRef.current = active;
      } catch (err) {
        console.error('Failed to load identity:', err);
      } finally {
        setLoadingIdentity(false);
      }
    }
    initIdentity();

    // Clean up only when browser tab closes, NOT when switching routes
    return () => {
      if (wsRef.current) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'leave' }));
          wsRef.current.close();
        } catch {}
      }
    };
  }, []);

  // Allow generating a fresh peer identity (e.g. for testing two peers on the same machine)
  const handleGenerateFreshIdentity = async () => {
    try {
      const defaultName = `Peer_${Math.floor(100 + Math.random() * 900)}`;
      const aliasName = window.prompt('Enter an alias for this peer session:', defaultName);
      if (!aliasName) return;

      const created = await generateSigningIdentity(aliasName);
      const active = {
        ...created.identity,
        alias: created.identity.alias,
        kid: created.identity.kid,
        fingerprint: created.identity.fingerprint,
        publicKey: created.identity.publicKey || created.identity.publicKeyJWK,
        privateKey: created.keyPair.privateKey,
        cryptoPublicKey: created.keyPair.publicKey
      };
      setIdentity(active);
      identityRef.current = active;
      if (connectionStatus === 'connected') {
        disconnectLan();
      }
    } catch (err) {
      alert('Failed to generate identity: ' + err.message);
    }
  };

  // Connect to LAN WebSocket Relay
  const connectLan = async () => {
    const currentIdentity = identityRef.current || identity;
    if (!currentIdentity || !currentIdentity.privateKey) {
      setConnError('Identity keypair is not ready yet. Please wait a moment.');
      return;
    }
    setConnError('');
    setConnectionStatus('connecting');

    try {
      const ecdh = await generateEcdhKeyPair();
      myEcdhRef.current = ecdh;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        ws.send(JSON.stringify({
          type: 'join',
          roomId: roomIdRef.current.trim().toLowerCase(),
          peerId: myPeerIdRef.current,
          name: currentIdentity.alias,
          kid: currentIdentity.kid
        }));
      };

      ws.onmessage = async (evt) => {
        try {
          const data = JSON.parse(evt.data);
          handleServerMessage(data);
        } catch (err) {
          console.error('[LAN Chat] Parse error:', err);
        }
      };

      ws.onerror = (err) => {
        console.warn('[LAN Chat] WebSocket error:', err);
        setConnError('Unable to connect to LAN server at ' + wsUrl + '. Ensure backend server is running.');
        setConnectionStatus('disconnected');
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        updatePeersState({});
      };

    } catch (err) {
      setConnError(`Initialization failed: ${err.message}`);
      setConnectionStatus('disconnected');
    }
  };

  const disconnectLan = () => {
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'leave' }));
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
    updatePeersState({});
    setActivePeerId(null);
  };

  // Handle incoming server messages
  const handleServerMessage = async (msg) => {
    const { type } = msg;

    if (type === 'room_joined') {
      const initialPeers = {};
      for (const p of msg.peers) {
        initialPeers[p.peerId] = {
          peerId: p.peerId,
          name: p.name,
          kid: p.kid,
          handshakeStatus: 'pending',
          trustStatus: 'UNKNOWN'
        };
      }
      updatePeersState(initialPeers);

      // As the newly joined peer, initiate authenticated ECDH handshake with each existing peer
      for (const p of msg.peers) {
        initiateHandshakeWithPeer(p.peerId);
      }
    } else if (type === 'peer_joined') {
      const { peerId, name, kid } = msg;
      updatePeersState(prev => ({
        ...prev,
        [peerId]: {
          peerId,
          name: name || 'Anonymous',
          kid: kid || '',
          handshakeStatus: 'pending',
          trustStatus: 'UNKNOWN'
        }
      }));
    } else if (type === 'peer_left') {
      const { peerId } = msg;
      updatePeersState(prev => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
      if (activePeerIdRef.current === peerId) {
        setActivePeerId(null);
      }
    } else if (type === 'signal') {
      const { fromPeerId, payload } = msg;
      handleSignalPayload(fromPeerId, payload);
    }
  };

  // Initiate authenticated ECDH handshake with target peer
  const initiateHandshakeWithPeer = async (targetPeerId) => {
    const currentIdentity = identityRef.current;
    if (!wsRef.current || !currentIdentity || !currentIdentity.privateKey || !myEcdhRef.current) {
      console.warn('Cannot initiate handshake: Missing privateKey or ECDH key');
      return;
    }

    try {
      const packet = await createHandshakePacket(
        { privateKey: currentIdentity.privateKey, ...currentIdentity },
        myEcdhRef.current.publicJWK
      );

      wsRef.current.send(JSON.stringify({
        type: 'signal',
        targetPeerId,
        payload: {
          action: 'handshake_init',
          packet,
          signingKeyJWK: currentIdentity.publicKey
        }
      }));

      updatePeersState(prev => ({
        ...prev,
        [targetPeerId]: {
          ...(prev[targetPeerId] || {}),
          peerId: targetPeerId,
          handshakeStatus: 'pending'
        }
      }));
    } catch (err) {
      console.error('Failed to initiate handshake:', err);
    }
  };

  // Process peer-to-peer signal payload
  const handleSignalPayload = async (fromPeerId, payload) => {
    const { action } = payload;
    const currentIdentity = identityRef.current;

    if (action === 'handshake_init') {
      const { packet, signingKeyJWK } = payload;
      const verifyRes = await verifyHandshakePacket(packet, signingKeyJWK);

      if (!verifyRes.isValid) {
        console.warn('Invalid handshake packet from peer:', verifyRes.error);
        return;
      }

      const { sessionKey, securityCode } = await deriveSessionKey(
        myEcdhRef.current.keyPair.privateKey,
        verifyRes.peerEcdhPubJWK,
        roomIdRef.current
      );

      const contact = await findContactByKeyOrKid(packet.kid, signingKeyJWK);
      const trustStatus = contact ? (contact.isTrusted ? 'TRUSTED' : 'UNCONFIRMED') : 'UNKNOWN';

      updatePeersState(prev => ({
        ...prev,
        [fromPeerId]: {
          peerId: fromPeerId,
          name: packet.name || 'Anonymous',
          kid: packet.kid,
          signingKeyJWK,
          ecdhPubJWK: verifyRes.peerEcdhPubJWK,
          sessionKey,
          securityCode,
          handshakeStatus: 'established',
          trustStatus,
          sasVerified: trustStatus === 'TRUSTED'
        }
      }));

      setActivePeerId(curr => curr || fromPeerId);

      if (currentIdentity && currentIdentity.privateKey) {
        const ackPacket = await createHandshakePacket(
          { privateKey: currentIdentity.privateKey, ...currentIdentity },
          myEcdhRef.current.publicJWK
        );

        wsRef.current.send(JSON.stringify({
          type: 'signal',
          targetPeerId: fromPeerId,
          payload: {
            action: 'handshake_ack',
            packet: ackPacket,
            signingKeyJWK: currentIdentity.publicKey
          }
        }));
      }

    } else if (action === 'handshake_ack') {
      const { packet, signingKeyJWK } = payload;
      const verifyRes = await verifyHandshakePacket(packet, signingKeyJWK);

      if (!verifyRes.isValid) {
        console.warn('Invalid handshake ACK from peer:', verifyRes.error);
        return;
      }

      const { sessionKey, securityCode } = await deriveSessionKey(
        myEcdhRef.current.keyPair.privateKey,
        verifyRes.peerEcdhPubJWK,
        roomIdRef.current
      );

      const contact = await findContactByKeyOrKid(packet.kid, signingKeyJWK);
      const trustStatus = contact ? (contact.isTrusted ? 'TRUSTED' : 'UNCONFIRMED') : 'UNKNOWN';

      updatePeersState(prev => ({
        ...prev,
        [fromPeerId]: {
          peerId: fromPeerId,
          name: packet.name || 'Anonymous',
          kid: packet.kid,
          signingKeyJWK,
          ecdhPubJWK: verifyRes.peerEcdhPubJWK,
          sessionKey,
          securityCode,
          handshakeStatus: 'established',
          trustStatus,
          sasVerified: trustStatus === 'TRUSTED'
        }
      }));

      setActivePeerId(curr => curr || fromPeerId);

    } else if (action === 'encrypted_message') {
      const currentPeers = peersRef.current;
      const peer = currentPeers[fromPeerId];
      if (!peer || !peer.sessionKey) {
        console.warn('Received encrypted message but no session key exists for peer:', fromPeerId);
        return;
      }

      try {
        const lastSeq = receivedSeqsRef.current[fromPeerId] || 0;
        const decryptedText = await decryptMessage(peer.sessionKey, payload.envelope, lastSeq + 1);

        const newReceivedSeqs = {
          ...receivedSeqsRef.current,
          [fromPeerId]: payload.envelope.seq
        };
        receivedSeqsRef.current = newReceivedSeqs;
        setReceivedSeqs(newReceivedSeqs);

        let isImage = false;
        let imageData = null;
        let displayText = decryptedText;

        try {
          if (decryptedText.startsWith('{"type":"image"') || decryptedText.startsWith('{"type":"media"')) {
            const parsed = JSON.parse(decryptedText);
            if (parsed.type === 'image' && isSafeChatImage(parsed.dataUrl)) {
              isImage = true;
              imageData = parsed;
              displayText = parsed.caption || '';
            }
          } else if (isSafeChatImage(decryptedText)) {
            isImage = true;
            imageData = { type: 'image', dataUrl: decryptedText, caption: '' };
            displayText = '';
          }
        } catch {}

        setMessages(prev => [
          ...prev,
          {
            id: `msg_${Date.now()}_${Math.random()}`,
            fromPeerId,
            senderName: peer.name || 'Peer',
            text: displayText,
            isImage,
            imageData,
            timestamp: payload.envelope.timestamp || Date.now(),
            isMine: false,
            envelope: payload.envelope
          }
        ]);

        // Increment unread count if user is on another route (e.g. /scanner or /contacts)
        if (locationRef.current !== '/lan') {
          setUnreadCount(c => c + 1);
        }
      } catch (err) {
        console.error('Decryption failed for peer message:', err.message);
      }

    } else if (action === 'end_chat') {
      const peer = peersRef.current[fromPeerId];
      const peerName = peer?.name || 'Peer';

      updatePeersState(prev => {
        const p = prev[fromPeerId];
        if (!p) return prev;
        return {
          ...prev,
          [fromPeerId]: {
            ...p,
            sessionKey: null,
            securityCode: null,
            handshakeStatus: 'none'
          }
        };
      });

      setMessages(prev => [
        ...prev,
        {
          id: `system_${Date.now()}`,
          isSystem: true,
          text: `${peerName} ended the secure chat session. Ephemeral AES-256 session keys have been securely purged from memory.`,
          timestamp: Date.now()
        }
      ]);

    } else if (action === 'public_key_share') {
      const { announcement } = payload;
      const verifyRes = await verifyPublicKeyAnnouncement(announcement);

      if (!verifyRes.isValid) {
        console.warn('Received invalid public key announcement:', verifyRes.error);
        return;
      }

      const existing = await findContactByKeyOrKid(verifyRes.contact.kid, verifyRes.contact.publicKeyJWK);

      setMessages(prev => [
        ...prev,
        {
          id: `keyshare_${Date.now()}_${Math.random()}`,
          fromPeerId,
          senderName: verifyRes.contact.name,
          timestamp: Date.now(),
          isMine: false,
          isKeyShare: true,
          keyShareData: {
            ...verifyRes.contact,
            isAlreadyTrusted: existing?.isTrusted || false
          }
        }
      ]);

      if (locationRef.current !== '/lan') {
        setUnreadCount(c => c + 1);
      }
    }
  };

  // Send an encrypted message to the active peer
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const currentActivePeerId = activePeerIdRef.current || activePeerId;
    if (!inputText.trim() || !currentActivePeerId) return;

    const peer = peersRef.current[currentActivePeerId];
    if (!peer || peer.handshakeStatus !== 'established' || !peer.sessionKey || !peer.sasVerified) {
      alert('Confirm the matching security code with this peer before sending messages.');
      return;
    }

    const currentSeq = (seqCounters[currentActivePeerId] || 0) + 1;
    setSeqCounters(prev => ({ ...prev, [currentActivePeerId]: currentSeq }));

    try {
      const envelope = await encryptMessage(peer.sessionKey, inputText.trim(), currentSeq);

      wsRef.current?.send(JSON.stringify({
        type: 'signal',
        targetPeerId: currentActivePeerId,
        payload: {
          action: 'encrypted_message',
          envelope
        }
      }));

      setMessages(prev => [
        ...prev,
        {
          id: `msg_${Date.now()}_${Math.random()}`,
          fromPeerId: myPeerIdRef.current,
          senderName: identity?.alias || 'You',
          text: inputText.trim(),
          timestamp: Date.now(),
          isMine: true,
          envelope
        }
      ]);

      setInputText('');
    } catch (err) {
      console.error('Failed to send encrypted message:', err);
    }
  };

  // Send an encrypted image message to the active peer
  const handleSendImage = async (dataUrl, caption = '', fileName = 'image.png') => {
    const currentActivePeerId = activePeerIdRef.current || activePeerId;
    if (!dataUrl || !currentActivePeerId) return;
    if (!isSafeChatImage(dataUrl)) {
      alert('Image rejected: use a PNG, JPEG, or WebP attachment no larger than 2 MB.');
      return;
    }

    const peer = peersRef.current[currentActivePeerId];
    if (!peer || peer.handshakeStatus !== 'established' || !peer.sessionKey || !peer.sasVerified) {
      alert('Confirm the matching security code with this peer before sending attachments.');
      return;
    }

    const currentSeq = (seqCounters[currentActivePeerId] || 0) + 1;
    setSeqCounters(prev => ({ ...prev, [currentActivePeerId]: currentSeq }));

    try {
      const payloadString = JSON.stringify({
        type: 'image',
        dataUrl,
        caption: caption ? caption.trim() : '',
        fileName: fileName || 'image.png'
      });

      const envelope = await encryptMessage(peer.sessionKey, payloadString, currentSeq);

      wsRef.current?.send(JSON.stringify({
        type: 'signal',
        targetPeerId: currentActivePeerId,
        payload: {
          action: 'encrypted_message',
          envelope
        }
      }));

      setMessages(prev => [
        ...prev,
        {
          id: `msg_${Date.now()}_${Math.random()}`,
          fromPeerId: myPeerIdRef.current,
          senderName: identity?.alias || 'You',
          text: caption ? caption.trim() : '',
          isImage: true,
          imageData: {
            type: 'image',
            dataUrl,
            caption: caption ? caption.trim() : '',
            fileName: fileName || 'image.png'
          },
          timestamp: Date.now(),
          isMine: true,
          envelope
        }
      ]);
    } catch (err) {
      console.error('Failed to send encrypted image:', err);
    }
  };

  // Broadcast or send signed Public Key Announcement over LAN
  const handleShareMyPublicKey = async () => {
    if (!identity || !activePeerId) return;

    try {
      const announcement = await createPublicKeyAnnouncement(
        { privateKey: identity.privateKey, ...identity },
        identity.publicKey
      );

      wsRef.current?.send(JSON.stringify({
        type: 'signal',
        targetPeerId: activePeerId,
        payload: {
          action: 'public_key_share',
          announcement
        }
      }));

      setMessages(prev => [
        ...prev,
        {
          id: `keyshare_sent_${Date.now()}`,
          fromPeerId: myPeerIdRef.current,
          senderName: 'You',
          timestamp: Date.now(),
          isMine: true,
          isKeyShare: true,
          keyShareData: {
            name: identity.alias,
            kid: identity.kid,
            fingerprint: identity.fingerprint,
            publicKeyJWK: identity.publicKey,
            isMyKey: true
          }
        }
      ]);
    } catch (err) {
      console.error('Failed to share public key:', err);
    }
  };

  const confirmPeerSecurityCode = (peerId) => {
    updatePeersState(prev => {
      const peer = prev[peerId];
      if (!peer || peer.handshakeStatus !== 'established') return prev;
      return { ...prev, [peerId]: { ...peer, sasVerified: true } };
    });
  };

  // One-click save peer's shared public key into Trusted Contacts keystore
  const handleSaveContactFromChat = async (keyData, markTrusted = true) => {
    try {
      await saveContact({
        name: keyData.name,
        publicKeyJWK: keyData.publicKeyJWK,
        isTrusted: markTrusted
      });

      setContactSavedMsg(`Contact "${keyData.name}" saved to your Trusted Contacts!`);
      setTimeout(() => setContactSavedMsg(''), 4000);

      // Refresh trust status on peer in state
      setPeers(prev => {
        const next = { ...prev };
        for (const [id, p] of Object.entries(next)) {
          if (p.kid === keyData.kid) {
            next[id] = { ...p, trustStatus: markTrusted ? 'TRUSTED' : 'UNCONFIRMED' };
          }
        }
        return next;
      });
    } catch (err) {
      alert(`Failed to save contact: ${err.message}`);
    }
  };

  // Terminate active E2EE chat session with peer and wipe ephemeral keys
  const handleEndChat = (peerId) => {
    if (!peerId) return;
    const targetPeer = peersRef.current[peerId];
    const peerName = targetPeer?.name || 'Peer';

    // Notify peer that session has been ended
    wsRef.current?.send(JSON.stringify({
      type: 'signal',
      targetPeerId: peerId,
      payload: { action: 'end_chat' }
    }));

    // Wipe session key and reset handshake status
    updatePeersState(prev => {
      const p = prev[peerId];
      if (!p) return prev;
      return {
        ...prev,
        [peerId]: {
          ...p,
          sessionKey: null,
          securityCode: null,
          handshakeStatus: 'none'
        }
      };
    });

    setMessages(prev => [
      ...prev,
      {
        id: `system_${Date.now()}`,
        isSystem: true,
        text: `You ended the secure session with ${peerName}. Ephemeral AES-256 session keys have been securely purged from memory.`,
        timestamp: Date.now()
      }
    ]);
  };

  const activePeer = activePeerId ? peers[activePeerId] : null;

  const value = {
    identity,
    loadingIdentity,
    wsUrl,
    setWsUrl,
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
    seqCounters,
    auditEnvelope,
    setAuditEnvelope,
    contactSavedMsg,
    setContactSavedMsg,
    unreadCount,
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
  };

  return (
    <LanContext.Provider value={value}>
      {children}
    </LanContext.Provider>
  );
}

export function useLan() {
  const context = useContext(LanContext);
  if (!context) {
    throw new Error('useLan must be used within a LanProvider');
  }
  return context;
}
