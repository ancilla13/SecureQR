/**
 * QSecR ECDSA P-256 Deterministic Canonical Signing & Verification Engine
 * 
 * Specification: QSecR Deterministic Canonical Format (QDCF-v1)
 * -------------------------------------------------------------
 * 1. Fixed Schema:
 *    - content: string
 *    - contentType: string
 *    - exp: integer (Unix epoch seconds) OR null (never expires)
 *    - iat: integer (Unix epoch seconds)
 *    - kid: string
 *    - name: string
 *    - v: 1
 * 2. Unambiguous Lexicographical Key Sorting:
 *    Keys are strictly ordered by Unicode code point:
 *    ['content', 'contentType', 'exp', 'iat', 'kid', 'name', 'v']
 * 3. Representation:
 *    Serialized as compact UTF-8 JSON with no extraneous whitespace.
 *    Strictly excludes the signature field ('sig').
 * 4. Temporal Independence:
 *    Cryptographic signature verification tests ONLY mathematical integrity.
 *    Expiry validation is evaluated as a separate independent check.
 */

const getCrypto = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto;
  }
  throw new Error('Web Crypto API not available.');
};

/**
 * Robust Base64 conversion helpers
 */
export function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  throw new Error('Base64 encoder unavailable.');
}

export function base64ToBytes(base64) {
  try {
    if (typeof atob === 'function') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
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
}

/**
 * Builds deterministic canonical string representation per QDCF-v1 specification.
 * Validates types, enforces lexicographical ordering, and excludes signature.
 */
export function buildCanonicalDataString(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be a non-null object.');
  }

  // Validate version
  const v = payload.v !== undefined ? Number(payload.v) : 1;
  if (!Number.isInteger(v) || v <= 0) {
    throw new Error(`Invalid payload version: ${payload.v}`);
  }

  // Validate timestamps
  const iat = Number(payload.iat);
  if (!Number.isInteger(iat) || iat <= 0) {
    throw new Error(`Invalid issue timestamp (iat): ${payload.iat}`);
  }

  let exp = null;
  if (payload.exp !== null && payload.exp !== undefined) {
    exp = Number(payload.exp);
    if (!Number.isInteger(exp) || exp <= 0) {
      throw new Error(`Invalid expiry timestamp (exp): ${payload.exp}`);
    }
  }

  // Fixed canonical object
  const canonicalObj = {
    content: String(payload.content ?? ''),
    contentType: String(payload.contentType ?? 'text'),
    exp: exp,
    iat: iat,
    kid: String(payload.kid ?? ''),
    name: String(payload.name ?? ''),
    v: v
  };

  // Keys sorted in strict lexicographical order:
  // 'content', 'contentType', 'exp', 'iat', 'kid', 'name', 'v'
  const sortedKeys = Object.keys(canonicalObj).sort();
  return JSON.stringify(canonicalObj, sortedKeys);
}

/**
 * Imports a standard JWK public key into an ECDSA P-256 WebCrypto CryptoKey
 */
export async function importPublicKeyJWK(jwk) {
  if (!jwk || typeof jwk !== 'object') {
    throw new Error('Invalid public key: JWK object required.');
  }

  const cryptoObj = getCrypto();
  return await cryptoObj.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: jwk.crv || 'P-256',
      x: jwk.x,
      y: jwk.y
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify']
  );
}

/**
 * Digitally signs a canonical payload using an ECDSA P-256 private key.
 * Strictly covers version, key ID, signer name, timestamps, content type, and content.
 */
export async function signPayload(privateKey, { content, contentType = 'text', kid = '', name = '', exp = null, iat = null }) {
  if (!privateKey) throw new Error('Private CryptoKey required for signing.');
  if (content === undefined || content === null) throw new Error('Content is required.');

  const cryptoObj = getCrypto();
  const issueTimestamp = iat !== null ? Number(iat) : Math.floor(Date.now() / 1000);

  const payloadUnsigned = {
    v: 1,
    kid: String(kid || ''),
    name: String(name || ''),
    iat: issueTimestamp,
    exp: exp !== null && exp !== undefined ? Number(exp) : null,
    contentType: String(contentType || 'text'),
    content: String(content)
  };

  const canonicalString = buildCanonicalDataString(payloadUnsigned);
  const enc = new TextEncoder();
  const canonicalBytes = enc.encode(canonicalString);

  const signatureBuffer = await cryptoObj.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    canonicalBytes
  );

  const signatureBase64 = bytesToBase64(new Uint8Array(signatureBuffer));

  return {
    ...payloadUnsigned,
    sig: signatureBase64
  };
}

/**
 * Cryptographically verifies an ECDSA P-256 signature against its payload.
 * Evaluates mathematical integrity ONLY; does not conflate expiry with signature validity.
 */
export async function verifySignature(publicKey, signedPayload) {
  if (!publicKey) return { isValid: false, reason: 'Missing public key for verification.' };
  if (!signedPayload || typeof signedPayload !== 'object') {
    return { isValid: false, reason: 'Payload is not a valid object.' };
  }

  const sig = signedPayload.sig || signedPayload.signature;
  if (!sig) return { isValid: false, reason: 'Payload contains no signature.' };

  try {
    const cryptoObj = getCrypto();
    const enc = new TextEncoder();
    const signatureBytes = base64ToBytes(sig);

    if (signatureBytes.length === 0) {
      return { isValid: false, reason: 'Corrupted or invalid Base64 signature.' };
    }

    // 1. Try standard QDCF-v1 canonical format
    let isQdcfValid = false;
    try {
      const canonicalString = buildCanonicalDataString(signedPayload);
      const canonicalBytes = enc.encode(canonicalString);
      isQdcfValid = await cryptoObj.subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        publicKey,
        signatureBytes,
        canonicalBytes
      );
    } catch {
      // Continue to try pipe-delimited format
    }

    if (isQdcfValid) {
      return {
        isValid: true,
        reason: 'Signature mathematically valid and verified (QDCF-v1).'
      };
    }

    // 2. Try Stage 1 pipe-delimited canonical format: v{v}|{iss}|{kid}|{iat}|{exp}|{type}|{data}
    if (signedPayload.iss || signedPayload.data) {
      const v = signedPayload.v || 1;
      const iss = signedPayload.iss || signedPayload.name || '';
      const kid = signedPayload.kid || '';
      const iat = signedPayload.iat || 0;
      const exp = signedPayload.exp || 0;
      const type = signedPayload.type || signedPayload.contentType || 'url';
      const data = signedPayload.data || signedPayload.content || '';
      const pipeCanonical = `v${v}|${iss}|${kid}|${iat}|${exp}|${type}|${data}`;
      const pipeBytes = enc.encode(pipeCanonical);

      const isPipeValid = await cryptoObj.subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        publicKey,
        signatureBytes,
        pipeBytes
      );

      if (isPipeValid) {
        return {
          isValid: true,
          reason: 'Signature mathematically valid and verified (Stage 1 Canonical).'
        };
      }
    }

    return {
      isValid: false,
      reason: 'Signature mismatch: Payload content or metadata has been altered.'
    };
  } catch (err) {
    return { isValid: false, reason: `Verification error: ${err.message}` };
  }
}

/**
 * Evaluates payload temporal expiry independently of cryptographic validity.
 */
export function checkPayloadExpiry(payload, currentTimeSeconds = null) {
  if (!payload || typeof payload !== 'object') {
    return { isExpired: false, expiryDate: null, neverExpires: true };
  }

  if (payload.exp === null || payload.exp === undefined) {
    return { isExpired: false, expiryDate: null, neverExpires: true };
  }

  const now = currentTimeSeconds !== null ? Number(currentTimeSeconds) : Math.floor(Date.now() / 1000);
  const expNum = Number(payload.exp);
  const isExpired = now > expNum;

  return {
    isExpired,
    expiryDate: new Date(expNum * 1000).toISOString(),
    neverExpires: false
  };
}
