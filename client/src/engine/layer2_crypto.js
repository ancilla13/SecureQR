/**
 * Layer 2: Cryptographic Authenticity Engine
 * 
 * Implements deterministic canonical serialization:
 * Canonical String: v1|iss|kid|iat|exp|type|data
 * ECDSA P-256 / SHA-256 verification via Web Crypto API.
 * Registry lookup with local cached fallback for offline stage resilience.
 */

import cachedRegistry from '../data/cachedTrustedIssuers.json';

const API_BASE = (typeof window !== 'undefined' && window.location?.origin) 
  ? '/api' 
  : 'http://127.0.0.1:4000/api';

const getCrypto = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto;
  }
  throw new Error('Web Crypto API not available in this environment.');
};

const decodeBase64ToBytes = (base64) => {
  try {
    if (typeof atob === 'function') {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
  } catch {
    return new Uint8Array(0);
  }
  return new Uint8Array(0);
};

/**
 * Builds deterministic canonical string representation
 * Format: v1|iss|kid|iat|exp|type|data
 */
export function buildCanonicalString(payload) {
  const v = payload.v || 1;
  const iss = payload.iss || '';
  const kid = payload.kid || '';
  const iat = payload.iat || 0;
  const exp = payload.exp || 0;
  const type = payload.type || 'url';
  const data = payload.data || '';

  return `v${v}|${iss}|${kid}|${iat}|${exp}|${type}|${data}`;
}

/**
 * Imports a JWK formatted ECDSA P-256 public key
 */
export async function importPublicKey(jwk) {
  const cryptoObj = getCrypto();
  return await cryptoObj.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: jwk.crv || 'P-256',
      x: jwk.x,
      y: jwk.y
    },
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    true,
    ['verify']
  );
}

/**
 * Verifies an ECDSA P-256 signature against the canonical string
 */
export async function verifySignature(publicKey, canonicalString, signatureBase64) {
  try {
    const cryptoObj = getCrypto();
    const enc = new TextEncoder();
    const dataBytes = enc.encode(canonicalString);
    const signatureBytes = decodeBase64ToBytes(signatureBase64);

    const isValid = await cryptoObj.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' }
      },
      publicKey,
      signatureBytes,
      dataBytes
    );

    return isValid;
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

/**
 * Resolves public key from backend API or falls back to bundled cached registry
 */
export async function resolveIssuerKey(issuerId, keyId) {
  let isCached = false;
  let keyData = null;
  let issuerName = issuerId;
  let isRevoked = false;

  // Try live backend API first if in browser or server reachable
  if (typeof fetch === 'function') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600); // 600ms fast check

      const res = await fetch(`${API_BASE}/issuers/${encodeURIComponent(issuerId)}/key?kid=${encodeURIComponent(keyId || '')}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.status === 410) {
        const errData = await res.json();
        return { key: null, issuerName, isRevoked: true, reason: errData.error, isCached: false };
      }

      if (res.ok) {
        const data = await res.json();
        return {
          key: data.key,
          issuerName: data.issuerName || issuerId,
          isRevoked: false,
          isCached: false
        };
      }
    } catch {
      // Backend offline or timeout -> Fall back to local bundled registry
    }
  }

  // Fallback to cached registry
  isCached = true;
  const cachedIssuer = cachedRegistry.issuers?.find(iss => iss.id === issuerId);
  if (cachedIssuer) {
    issuerName = cachedIssuer.name;
    const foundKey = keyId 
      ? cachedIssuer.keys?.find(k => k.kid === keyId)
      : cachedIssuer.keys?.find(k => k.status === 'active');

    if (foundKey) {
      if (cachedIssuer.revokedKeys?.includes(foundKey.kid) || foundKey.status === 'revoked') {
        isRevoked = true;
      }
      keyData = foundKey;
    }
  }

  return {
    key: keyData,
    issuerName,
    isRevoked,
    isCached
  };
}

/**
 * Comprehensive Authenticity Verification
 */
export async function verifyAuthenticity(payload, currentTimeSeconds = null) {
  if (!payload || typeof payload !== 'object') {
    return {
      status: 'UNVERIFIED',
      reason: 'No digital signature or structured payload found.',
      issuer: null,
      isCached: false
    };
  }

  const { iss, kid, iat, exp, sig, signature } = payload;
  const signatureToVerify = sig || signature;

  if (!iss || !signatureToVerify) {
    return {
      status: 'UNVERIFIED',
      reason: 'Unsigned payload: Missing issuer identity or cryptographic signature.',
      issuer: null,
      isCached: false
    };
  }

  // 1. Resolve Issuer Public Key
  const resolution = await resolveIssuerKey(iss, kid);

  if (resolution.isRevoked) {
    return {
      status: 'REVOKED',
      reason: `Issuer key '${kid}' has been revoked. Do not trust this code.`,
      issuer: resolution.issuerName,
      isCached: resolution.isCached
    };
  }

  if (!resolution.key) {
    return {
      status: 'UNVERIFIED',
      reason: `Unknown or unregistered issuer '${iss}'. Issuer key not in trust registry.`,
      issuer: resolution.issuerName || iss,
      isCached: resolution.isCached
    };
  }

  // 2. Build Canonical String & Verify Signature
  const canonicalString = buildCanonicalString(payload);
  let publicKeyObj;
  try {
    publicKeyObj = await importPublicKey(resolution.key);
  } catch (err) {
    return {
      status: 'INVALID',
      reason: 'Malformed public key format in trust registry.',
      issuer: resolution.issuerName,
      isCached: resolution.isCached
    };
  }

  const isValidSignature = await verifySignature(publicKeyObj, canonicalString, signatureToVerify);

  if (!isValidSignature) {
    return {
      status: 'INVALID',
      reason: 'Signature mismatch: The payload data has been altered or tampered with.',
      issuer: resolution.issuerName,
      canonicalString,
      isCached: resolution.isCached
    };
  }

  // 3. Expiration Check
  const now = currentTimeSeconds !== null ? currentTimeSeconds : Math.floor(Date.now() / 1000);
  if (exp && Number(exp) < now) {
    const expiredDate = new Date(Number(exp) * 1000).toLocaleString();
    return {
      status: 'EXPIRED',
      reason: `Cryptographic signature valid, but payload expired on ${expiredDate}.`,
      issuer: resolution.issuerName,
      expiryDate: expiredDate,
      isCached: resolution.isCached
    };
  }

  // 4. Successful Verification
  return {
    status: 'VERIFIED',
    reason: `Digitally signed by ${resolution.issuerName} and verified with trusted ECDSA P-256 key.`,
    issuer: resolution.issuerName,
    issuerId: iss,
    keyId: kid,
    issuedAt: iat ? new Date(Number(iat) * 1000).toLocaleString() : null,
    expiresAt: exp ? new Date(Number(exp) * 1000).toLocaleString() : 'Never',
    isCached: resolution.isCached
  };
}
