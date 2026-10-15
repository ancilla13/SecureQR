/**
 * SecureQR Authenticated LAN Relay Service
 * 
 * Relays end-to-end encrypted message envelopes, ECDH handshakes,
 * and signed public key announcements between LAN peers.
 * Zero-Knowledge: The server has no access to plaintext or session keys.
 */

import { WebSocketServer, WebSocket } from 'ws';

// Map of roomId -> Map(peerId -> { ws, name, kid, joinedAt })
const rooms = new Map();

export function setupLanRelay(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    let currentRoomId = null;
    let currentPeerId = null;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const { type } = msg;

        switch (type) {
          case 'join': {
            const { roomId = 'general', peerId, name = 'Anonymous', kid = '' } = msg;
            if (!peerId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Missing peerId' }));
              return;
            }

            currentRoomId = roomId;
            currentPeerId = peerId;

            if (!rooms.has(roomId)) {
              rooms.set(roomId, new Map());
            }
            const room = rooms.get(roomId);

            // Store peer connection
            room.set(peerId, { ws, name, kid, joinedAt: Date.now() });

            // Send existing peers list to joining peer
            const existingPeers = [];
            for (const [id, peer] of room.entries()) {
              if (id !== peerId) {
                existingPeers.push({ peerId: id, name: peer.name, kid: peer.kid });
              }
            }
            ws.send(JSON.stringify({
              type: 'room_joined',
              roomId,
              peerId,
              peers: existingPeers
            }));

            // Notify others in room
            broadcastToRoom(roomId, peerId, {
              type: 'peer_joined',
              peerId,
              name,
              kid,
              timestamp: Date.now()
            });
            break;
          }

          case 'signal': {
            // Forward encrypted signal (handshake, ciphertext, or key announcement)
            const { targetPeerId, payload } = msg;
            if (!currentRoomId || !rooms.has(currentRoomId)) return;

            const room = rooms.get(currentRoomId);
            const targetPeer = room.get(targetPeerId);

            if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
              targetPeer.ws.send(JSON.stringify({
                type: 'signal',
                fromPeerId: currentPeerId,
                payload
              }));
            }
            break;
          }

          case 'leave': {
            cleanupPeer(currentRoomId, currentPeerId);
            currentRoomId = null;
            currentPeerId = null;
            break;
          }

          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('[LAN Relay] Error processing message:', err.message);
      }
    });

    ws.on('close', () => {
      cleanupPeer(currentRoomId, currentPeerId);
    });

    ws.on('error', (err) => {
      console.warn('[LAN Relay] WebSocket error:', err.message);
      cleanupPeer(currentRoomId, currentPeerId);
    });
  });

  console.log('[LAN Relay] WebSocket server attached to /ws');
  return wss;
}

function broadcastToRoom(roomId, senderPeerId, message) {
  if (!rooms.has(roomId)) return;
  const room = rooms.get(roomId);
  const msgStr = JSON.stringify(message);

  for (const [peerId, peer] of room.entries()) {
    if (peerId !== senderPeerId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(msgStr);
    }
  }
}

function cleanupPeer(roomId, peerId) {
  if (!roomId || !peerId || !rooms.has(roomId)) return;
  const room = rooms.get(roomId);
  if (room.has(peerId)) {
    room.delete(peerId);
    broadcastToRoom(roomId, peerId, {
      type: 'peer_left',
      peerId,
      timestamp: Date.now()
    });
  }
  if (room.size === 0) {
    rooms.delete(roomId);
  }
}
