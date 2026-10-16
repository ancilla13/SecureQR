/**
 * SecureQR LAN Cryptographic Protocol Engine
 * 
 * Cryptographic Architecture:
 * - ECDH (NIST P-256) for ephemeral key agreement
 * - ECDSA (NIST P-256 + SHA-256) for handshake authentication (MITM prevention)
 * - HKDF (SHA-256) for session key derivation
 * - AES-256-GCM with fresh 96-bit IVs and 128-bit authentication tag
 * - In-band Public Key Announcement for direct trusted-contact key exchange
 */

import { bytesToBase64, base64ToBytes, signPayload, verifySignature, importPublicKeyJWK } from './cryptoSign.js';
import { computeKeyFingerprint, validatePublicKeyJWK } from './keystore.js';

const getCrypto = () => {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API not available.');
};

/**
 * Generates an ephemeral ECDH keypair on NIST P-256 for key agreement
 */
export async function generateEcdhKeyPair() {
  const cryptoObj = getCrypto();
  const keyPair = await cryptoObj.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );

  const pubJWK = await cryptoObj.subtle.exportKey('jwk', keyPair.publicKey);
  return {
    keyPair,
    publicJWK: pubJWK
  };
}

/**
 * Creates an authenticated ECDH handshake packet signed with sender's ECDSA signing key
 */
export async function createHandshakePacket(signingKeyOrIdentity, myEcdhPubJWK, options = {}) {
  const privateKey = signingKeyOrIdentity?.privateKey || (signingKeyOrIdentity?.subtle ? signingKeyOrIdentity : null) || signingKeyOrIdentity;
  const kid = signingKeyOrIdentity?.kid || options.kid || 'k_lan';
  const name = signingKeyOrIdentity?.alias || signingKeyOrIdentity?.name || options.name || 'Anonymous';

  if (!privateKey) {
    throw new Error('Signing identity with private key is required for authenticated handshake.');
  }

  const cryptoObj = getCrypto();
  const nonceBytes = cryptoObj.getRandomValues(new Uint8Array(16));
  const nonce = bytesToBase64(nonceBytes);
  const now = Math.floor(Date.now() / 1000);

  const handshakeData = {
    type: 'ecdh_handshake',
    ecdhPubJWK: myEcdhPubJWK,
    nonce
  };

  // Sign canonical payload with user's persistent ECDSA private key to prevent MITM
  const signed = await signPayload(privateKey, {
    content: JSON.stringify(handshakeData),
    contentType: 'ecdh_handshake',
    kid,
    name,
    iat: now,
    exp: now + 300 // 5 minute validity window
  });

  return {
    ...signed,
    type: 'ecdh_handshake',
    handshakeData
  };
}

/**
 * Verifies peer's authenticated ECDH handshake packet against their ECDSA public key
 */
export async function verifyHandshakePacket(packet, peerSigningKeyJWK) {
  if (!packet || !packet.content || !packet.sig) {
    return { isValid: false, error: 'Invalid handshake packet structure.' };
  }

  // Validate ECDSA public key JWK
  const val = validatePublicKeyJWK(peerSigningKeyJWK);
  if (!val.isValid) {
    return { isValid: false, error: `Invalid peer signing public key: ${val.error}` };
  }

  // Check temporal freshness (allow 5-minute clock drift)
  const now = Math.floor(Date.now() / 1000);
  if (packet.exp && now > packet.exp) {
    return { isValid: false, error: 'Handshake packet has expired.' };
  }
  if (packet.iat && Math.abs(now - packet.iat) > 3600) {
    return { isValid: false, error: 'Handshake packet timestamp drift exceeds acceptable window.' };
  }

  // Import ECDSA key and verify signature
  const cryptoKey = await importPublicKeyJWK(peerSigningKeyJWK);
  const sigResult = await verifySignature(cryptoKey, packet);

  if (!sigResult.isValid) {
    return { isValid: false, error: 'Cryptographic signature mismatch on ECDH handshake.' };
  }

  // `content` is the signed representation. Never consume the convenience
  // `handshakeData` field here: a relay could replace that duplicate field
  // without invalidating the signature and substitute its own ECDH key.
  let handshakeData;
  try {
    handshakeData = JSON.parse(packet.content);
  } catch {
    return { isValid: false, error: 'Malformed handshake payload.' };
  }

  if (
    handshakeData?.type !== 'ecdh_handshake' ||
    !isP256PublicJwk(handshakeData.ecdhPubJWK) ||
    typeof handshakeData.nonce !== 'string' ||
    !handshakeData.nonce
  ) {
    return { isValid: false, error: 'Invalid signed ECDH handshake data.' };
  }

  return { isValid: true, peerEcdhPubJWK: handshakeData.ecdhPubJWK };
}

/**
 * Derives a symmetric AES-256-GCM session key and human-verifiable security code
 * using ECDH + HKDF-SHA-256
 */
export async function deriveSessionKey(myEcdhPrivateKey, peerEcdhPubJWK, saltInfo = 'SecureQR-LAN-v1') {
  const cryptoObj = getCrypto();

  // Import peer's ephemeral ECDH public key
  const peerKey = await cryptoObj.subtle.importKey(
    'jwk',
    peerEcdhPubJWK,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Perform ECDH key agreement (256-bit shared secret bits)
  const sharedBits = await cryptoObj.subtle.deriveBits(
    { name: 'ECDH', public: peerKey },
    myEcdhPrivateKey,
    256
  );

  // Import shared secret as HKDF base key
  const hkdfBaseKey = await cryptoObj.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const saltBytes = new TextEncoder().encode(saltInfo);
  const infoBytes = new TextEncoder().encode('SecureQR-LAN-AES-GCM-v1-SessionKey');

  // Derive 256-bit AES-GCM encryption key
  const sessionKey = await cryptoObj.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: saltBytes,
      info: infoBytes
    },
    hkdfBaseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Derive human-readable SAS (Short Authentication String) / Security Code
  // Users can compare this 6-digit code to independently confirm zero MITM
  const sasBits = await cryptoObj.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: saltBytes,
      info: new TextEncoder().encode('SecureQR-LAN-SAS-Verification')
    },
    hkdfBaseKey,
    32 // 4 bytes
  );

  const sasView = new DataView(sasBits);
  const sasNum = sasView.getUint32(0, false) % 1000000;
  const securityCode = sasNum.toString().padStart(6, '0');

  return {
    sessionKey,
    securityCode
  };
}

/**
 * Encrypts a message using AES-256-GCM with a fresh 96-bit IV
 */
export async function encryptMessage(sessionKey, plaintext, sequenceNumber = 1) {
  if (!sessionKey) throw new Error('Session encryption key is required.');
  if (typeof plaintext !== 'string') throw new Error('Plaintext must be a string.');

  const cryptoObj = getCrypto();
  // Fresh 96-bit IV (never reused)
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const encodedPlaintext = new TextEncoder().encode(plaintext);

  const aad = new TextEncoder().encode(JSON.stringify({ seq: sequenceNumber }));

  const ciphertextBuffer = await cryptoObj.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
      tagLength: 128
    },
    sessionKey,
    encodedPlaintext
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    iv: bytesToBase64(iv),
    seq: sequenceNumber,
    timestamp: Date.now()
  };
}

/**
 * Decrypts an AES-256-GCM message and authenticates the tag and sequence
 */
export async function decryptMessage(sessionKey, envelope, minExpectedSeq = 0) {
  if (!sessionKey) throw new Error('Session encryption key is required.');
  if (!envelope || !envelope.ciphertext || !envelope.iv) {
    throw new Error('Malformed message envelope: Missing ciphertext or IV.');
  }

  // Replay protection: sequence number must be greater than previously processed
  if (envelope.seq !== undefined && envelope.seq < minExpectedSeq) {
    throw new Error(`Replay attack detected: Sequence number ${envelope.seq} is stale.`);
  }

  const cryptoObj = getCrypto();
  const ivBytes = base64ToBytes(envelope.iv);
  const ciphertextBytes = base64ToBytes(envelope.ciphertext);
  const aad = new TextEncoder().encode(JSON.stringify({ seq: envelope.seq }));

  const decryptedBuffer = await cryptoObj.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes,
      additionalData: aad,
      tagLength: 128
    },
    sessionKey,
    ciphertextBytes
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Creates a signed Public Key Share Announcement for exchanging public keys over LAN
 */
export async function createPublicKeyAnnouncement(signingKeyOrIdentity, publicJWK = null, options = {}) {
  const privateKey = signingKeyOrIdentity?.privateKey || (signingKeyOrIdentity?.subtle ? signingKeyOrIdentity : null) || signingKeyOrIdentity;
  const pubJWK = publicJWK || signingKeyOrIdentity?.publicKey || signingKeyOrIdentity?.publicKeyJWK;
  const kid = signingKeyOrIdentity?.kid || pubJWK?.kid || options.kid || 'k_lan';
  const name = signingKeyOrIdentity?.alias || signingKeyOrIdentity?.name || options.name || 'Anonymous';

  if (!privateKey || !pubJWK) {
    throw new Error('Signing identity with private and public key is required to share public key.');
  }

  const fp = signingKeyOrIdentity?.fingerprint || await computeKeyFingerprint(pubJWK);
  const now = Math.floor(Date.now() / 1000);

  const announcementData = {
    type: 'public_key_announcement',
    name,
    kid,
    fingerprint: fp,
    publicKeyJWK: pubJWK
  };

  const signed = await signPayload(privateKey, {
    content: JSON.stringify(announcementData),
    contentType: 'public_key',
    kid,
    name,
    iat: now,
    exp: null
  });

  return {
    ...signed,
    type: 'public_key_announcement',
    announcementData
  };
}

/**
 * Verifies a Public Key Share Announcement received from a peer
 */
export async function verifyPublicKeyAnnouncement(announcement) {
  if (!announcement || !announcement.content || !announcement.sig) {
    return { isValid: false, error: 'Malformed public key announcement structure.' };
  }

  // The signed content is authoritative. announcementData is display-only
  // metadata and must not influence trust decisions.
  let data;
  try {
    data = JSON.parse(announcement.content);
  } catch {
    return { isValid: false, error: 'Malformed announcement content.' };
  }

  if (data?.type !== 'public_key_announcement') {
    return { isValid: false, error: 'Invalid public key announcement type.' };
  }

  const val = validatePublicKeyJWK(data.publicKeyJWK);
  if (!val.isValid) {
    return { isValid: false, error: `Invalid advertised public key: ${val.error}` };
  }

  // Verify fingerprint matches key
  const calculatedFp = await computeKeyFingerprint(data.publicKeyJWK);
  if (calculatedFp.toLowerCase() !== (data.fingerprint || '').toLowerCase()) {
    return { isValid: false, error: 'Advertised fingerprint does not match calculated key fingerprint.' };
  }

  // Verify signature
  const cryptoKey = await importPublicKeyJWK(data.publicKeyJWK);
  const sigCheck = await verifySignature(cryptoKey, announcement);

  if (!sigCheck.isValid) {
    return { isValid: false, error: 'Digital signature on public key announcement is invalid.' };
  }

  return {
    isValid: true,
    contact: {
      name: data.name,
      kid: data.kid,
      fingerprint: calculatedFp,
      publicKeyJWK: data.publicKeyJWK
    }
  };
}

function isP256PublicJwk(jwk) {
  return Boolean(
    jwk &&
    jwk.kty === 'EC' &&
    jwk.crv === 'P-256' &&
    typeof jwk.x === 'string' && jwk.x.length > 0 &&
    typeof jwk.y === 'string' && jwk.y.length > 0
  );
}
