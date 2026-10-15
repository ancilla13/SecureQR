/**
 * Stage 2 QR Verification Pipeline
 * 
 * Implements the 7 distinct verification outcomes:
 * 1. Valid signature — trusted key (VALID_TRUSTED)
 * 2. Valid signature — unknown key (VALID_UNKNOWN_KEY)
 * 3. Valid signature — imported key, not yet trusted (VALID_IMPORTED_UNCONFIRMED)
 * 4. Invalid signature or tampered payload (INVALID_SIGNATURE)
 * 5. Unsigned or unsupported QR payload (UNSIGNED)
 * 6. Valid signature — payload expired (EXPIRED)
 * 7. Unable to verify — malformed payload or unsupported key (UNABLE_TO_VERIFY)
 * 
 * Strict Invariants:
 * - Cryptographic verification is strictly independent from expiry status.
 * - Temporal expiry never masks an invalid signature.
 * - URL threat heuristics are strictly independent of cryptographic validity.
 * - Scanned URLs are NEVER automatically fetched, previewed over network, or opened.
 */

import { 
  verifySignature, 
  importPublicKeyJWK, 
  checkPayloadExpiry 
} from './cryptoSign.js';
import { 
  findContactByKeyOrKid, 
  computeKeyFingerprint,
  validatePublicKeyJWK 
} from './keystore.js';
import { analyzeThreat, analyzeThreatAsync } from './layer3_threat.js';

export const VERIFICATION_OUTCOMES = {
  VALID_TRUSTED: 'Valid signature — trusted key',
  VALID_UNKNOWN_KEY: 'Valid signature — unknown key',
  VALID_IMPORTED_UNCONFIRMED: 'Valid signature — imported key, not yet trusted',
  INVALID_SIGNATURE: 'Invalid signature or tampered payload',
  UNSIGNED: 'Unsigned or unsupported QR payload',
  EXPIRED: 'Valid signature — payload expired',
  UNABLE_TO_VERIFY: 'Unable to verify — malformed payload or unsupported key'
};

/**
 * Detects general content type from string
 */
function detectContentType(text) {
  if (!text) return 'text';
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed)) return 'url';
  if (/^upi:\/\//i.test(trimmed)) return 'payment';
  if (/^wifi:/i.test(trimmed)) return 'wifi';
  if (/^begin:vcard/i.test(trimmed)) return 'vcard';
  return 'text';
}

/**
 * Parses raw scanned string and validates QDCF-v1 schema
 */
export function parseScannedText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      isSigned: false,
      isMalformed: false,
      content: '',
      contentType: 'text'
    };
  }

  const trimmed = rawText.trim();

  // Check if string is JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      
      // If it has signature properties, it claims to be a signed payload
      if (parsed && (parsed.sig !== undefined || parsed.signature !== undefined)) {
        // Validate QDCF-v1 schema requirements
        const sig = parsed.sig || parsed.signature;
        if (typeof sig !== 'string' || !sig.trim()) {
          return {
            isSigned: true,
            isMalformed: true,
            error: 'Payload contains an empty or non-string signature.',
            rawText: trimmed
          };
        }

        if (parsed.content === undefined || parsed.content === null) {
          return {
            isSigned: true,
            isMalformed: true,
            error: 'Missing required "content" property in signed payload.',
            rawText: trimmed
          };
        }

        if (parsed.iat !== undefined && !Number.isInteger(Number(parsed.iat))) {
          return {
            isSigned: true,
            isMalformed: true,
            error: 'Invalid "iat" (issue timestamp): must be an integer.',
            rawText: trimmed
          };
        }

        if (parsed.exp !== null && parsed.exp !== undefined && !Number.isInteger(Number(parsed.exp))) {
          return {
            isSigned: true,
            isMalformed: true,
            error: 'Invalid "exp" (expiry timestamp): must be an integer or null.',
            rawText: trimmed
          };
        }

        return {
          isSigned: true,
          isMalformed: false,
          payload: {
            v: Number(parsed.v || 1),
            kid: String(parsed.kid || ''),
            name: String(parsed.name || ''),
            iat: parsed.iat ? Number(parsed.iat) : Math.floor(Date.now() / 1000),
            exp: parsed.exp !== null && parsed.exp !== undefined ? Number(parsed.exp) : null,
            contentType: String(parsed.contentType || detectContentType(String(parsed.content))),
            content: String(parsed.content),
            sig: String(sig)
          },
          rawText: trimmed
        };
      }
    } catch {
      // JSON parse failed, proceed as raw text
    }
  }

  return {
    isSigned: false,
    isMalformed: false,
    content: trimmed,
    contentType: detectContentType(trimmed),
    rawText: trimmed
  };
}

/**
 * Main Stage 2 Verification Pipeline
 * 
 * Evaluates the scanned payload against the trusted contact store,
 * performs ECDSA P-256 verification, checks expiry, and analyzes URL threats.
 */
export async function verifyScannedPayload(rawText, options = {}) {
  const { 
    suppliedPublicKeyJWK = null, 
    currentTimeSeconds = null 
  } = options;

  // Step 1: Parse and validate schema
  const parsed = parseScannedText(rawText);

  // Outcome: UNSIGNED
  if (!parsed.isSigned) {
    const threat = parsed.contentType === 'url' ? await analyzeThreatAsync(parsed.content) : null;
    return {
      outcome: VERIFICATION_OUTCOMES.UNSIGNED,
      code: 'UNSIGNED',
      signatureValid: false,
      signerTrustStatus: 'NOT_APPLICABLE',
      signerName: null,
      signerKid: null,
      fingerprint: null,
      iat: null,
      exp: null,
      isExpired: false,
      contentType: parsed.contentType,
      content: parsed.content,
      threat,
      explanation: 'This QR code contains standard unsigned content. No digital signature is present.'
    };
  }

  // Outcome: UNABLE_TO_VERIFY (Malformed schema)
  if (parsed.isMalformed) {
    return {
      outcome: VERIFICATION_OUTCOMES.UNABLE_TO_VERIFY,
      code: 'UNABLE_TO_VERIFY',
      signatureValid: false,
      signerTrustStatus: 'UNSUPPORTED',
      signerName: null,
      signerKid: null,
      fingerprint: null,
      iat: null,
      exp: null,
      isExpired: false,
      contentType: 'unknown',
      content: parsed.rawText,
      threat: null,
      explanation: `Malformed payload structure: ${parsed.error}`
    };
  }

  const { payload } = parsed;

  // Step 2: Resolve public key and contact trust status
  let keyJWKToUse = null;
  let signerTrustStatus = 'UNKNOWN'; // 'TRUSTED' | 'IMPORTED_UNCONFIRMED' | 'UNKNOWN'
  let contactRecord = null;
  let fingerprint = null;

  // Check if caller supplied an explicit public key for verification
  if (suppliedPublicKeyJWK) {
    const val = validatePublicKeyJWK(suppliedPublicKeyJWK);
    if (!val.isValid) {
      return {
        outcome: VERIFICATION_OUTCOMES.UNABLE_TO_VERIFY,
        code: 'UNABLE_TO_VERIFY',
        signatureValid: false,
        signerTrustStatus: 'INVALID_SUPPLIED_KEY',
        signerName: payload.name || null,
        signerKid: payload.kid || null,
        fingerprint: null,
        iat: payload.iat,
        exp: payload.exp,
        isExpired: false,
        contentType: payload.contentType,
        content: payload.content,
        threat: null,
        explanation: `Supplied verification public key is invalid: ${val.error}`
      };
    }
    keyJWKToUse = suppliedPublicKeyJWK;
    contactRecord = await findContactByKeyOrKid(payload.kid, suppliedPublicKeyJWK);
  } else {
    // Look up key in local trusted contacts
    contactRecord = await findContactByKeyOrKid(payload.kid);
    if (contactRecord) {
      keyJWKToUse = contactRecord.publicKeyJWK;
    }
  }

  // Determine trust level if contact exists
  if (contactRecord) {
    signerTrustStatus = contactRecord.isTrusted ? 'TRUSTED' : 'IMPORTED_UNCONFIRMED';
    fingerprint = contactRecord.fingerprint;
  } else if (keyJWKToUse) {
    signerTrustStatus = 'UNKNOWN';
    try {
      fingerprint = await computeKeyFingerprint(keyJWKToUse);
    } catch {
      fingerprint = null;
    }
  }

  // If no public key is found or supplied, we cannot perform cryptographic verification
  if (!keyJWKToUse) {
    return {
      outcome: VERIFICATION_OUTCOMES.UNABLE_TO_VERIFY,
      code: 'UNABLE_TO_VERIFY',
      signatureValid: false,
      signerTrustStatus: 'KEY_NOT_FOUND',
      signerName: payload.name || null,
      signerKid: payload.kid || null,
      fingerprint: null,
      iat: payload.iat,
      exp: payload.exp,
      isExpired: false,
      contentType: payload.contentType,
      content: payload.content,
      threat: null,
      explanation: `No public key found for Key ID "${payload.kid || 'unknown'}". Import the creator's public key to verify this signature.`
    };
  }

  // Step 3: Cryptographic Signature Verification (ECDSA P-256)
  let cryptoKey;
  try {
    cryptoKey = await importPublicKeyJWK(keyJWKToUse);
  } catch (err) {
    return {
      outcome: VERIFICATION_OUTCOMES.UNABLE_TO_VERIFY,
      code: 'UNABLE_TO_VERIFY',
      signatureValid: false,
      signerTrustStatus,
      signerName: payload.name || null,
      signerKid: payload.kid || null,
      fingerprint,
      iat: payload.iat,
      exp: payload.exp,
      isExpired: false,
      contentType: payload.contentType,
      content: payload.content,
      threat: null,
      explanation: `Failed to import public key into Web Crypto: ${err.message}`
    };
  }

  const sigCheck = await verifySignature(cryptoKey, payload);

  // If mathematical signature verification fails, result is strictly INVALID_SIGNATURE
  if (!sigCheck.isValid) {
    return {
      outcome: VERIFICATION_OUTCOMES.INVALID_SIGNATURE,
      code: 'INVALID_SIGNATURE',
      signatureValid: false,
      signerTrustStatus,
      signerName: payload.name || contactRecord?.name || null,
      signerKid: payload.kid,
      fingerprint,
      iat: payload.iat,
      exp: payload.exp,
      isExpired: false,
      contentType: payload.contentType,
      content: payload.content,
      threat: payload.contentType === 'url' ? await analyzeThreatAsync(payload.content) : null,
      explanation: 'Cryptographic signature mismatch. The payload content, timestamps, or metadata have been altered.'
    };
  }

  // Step 4: Temporal Expiry Check (Evaluated separately from signature validity)
  const expiryCheck = checkPayloadExpiry(payload, currentTimeSeconds);

  // Outcome: EXPIRED (Valid signature, but validity window has passed)
  if (expiryCheck.isExpired) {
    return {
      outcome: VERIFICATION_OUTCOMES.EXPIRED,
      code: 'EXPIRED',
      signatureValid: true,
      signerTrustStatus,
      signerName: payload.name || contactRecord?.name || null,
      signerKid: payload.kid,
      fingerprint,
      iat: payload.iat,
      exp: payload.exp,
      isExpired: true,
      expiryDate: expiryCheck.expiryDate,
      contentType: payload.contentType,
      content: payload.content,
      threat: payload.contentType === 'url' ? await analyzeThreatAsync(payload.content) : null,
      explanation: `Digital signature is mathematically authentic, but the payload expired on ${new Date(payload.exp * 1000).toLocaleString()}.`
    };
  }

  // Step 5: Successful Signature & Unexpired Outcome (Determined by Contact Trust Level)
  let outcome = VERIFICATION_OUTCOMES.VALID_UNKNOWN_KEY;
  let code = 'VALID_UNKNOWN_KEY';
  let explanation = `Signature mathematically verified, but public key (${payload.kid}) is unknown and not in your trusted contacts.`;

  if (signerTrustStatus === 'TRUSTED') {
    outcome = VERIFICATION_OUTCOMES.VALID_TRUSTED;
    code = 'VALID_TRUSTED';
    explanation = `Authentic and verified: Signed by verified trusted contact "${contactRecord.name}".`;
  } else if (signerTrustStatus === 'IMPORTED_UNCONFIRMED') {
    outcome = VERIFICATION_OUTCOMES.VALID_IMPORTED_UNCONFIRMED;
    code = 'VALID_IMPORTED_UNCONFIRMED';
    explanation = `Signature is valid and matches contact "${contactRecord.name}", but the public key fingerprint has not yet been confirmed out-of-band.`;
  }

  const threat = payload.contentType === 'url' ? await analyzeThreatAsync(payload.content) : null;

  return {
    outcome,
    code,
    signatureValid: true,
    signerTrustStatus,
    signerName: payload.name || contactRecord?.name || null,
    signerKid: payload.kid,
    fingerprint,
    iat: payload.iat,
    exp: payload.exp,
    isExpired: false,
    neverExpires: expiryCheck.neverExpires,
    contentType: payload.contentType,
    content: payload.content,
    threat,
    explanation
  };
}
