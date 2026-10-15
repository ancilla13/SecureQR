import { describe, it, expect, beforeEach } from 'vitest';
import { 
  validatePublicKeyJWK, 
  computeKeyFingerprint, 
  compareFingerprints, 
  saveContact, 
  getAllContacts, 
  getContactByFingerprint,
  setContactTrustStatus, 
  removeContact,
  generateSigningIdentity 
} from '../engine/keystore.js';
import { 
  signPayload, 
  verifySignature, 
  checkPayloadExpiry,
  importPublicKeyJWK 
} from '../engine/cryptoSign.js';
import { 
  verifyScannedPayload, 
  parseScannedText,
  VERIFICATION_OUTCOMES 
} from '../engine/verifyPipeline.js';
import { analyzeThreat } from '../engine/layer3_threat.js';

describe('Stage 2: Public-Key Import & Security Validation', () => {
  const validECPublicJWK = {
    kty: 'EC',
    crv: 'P-256',
    x: 'f83OJ3D2xFmTEcKEUSuqgzOjWCFGFW4WcxBpVkORUO8',
    y: 'x_daaqundbgUvMVN55KaWTYL5KEfEDKCFvcHYTA8344'
  };

  it('accepts valid ECDSA P-256 public key JWK', () => {
    const res = validatePublicKeyJWK(validECPublicJWK);
    expect(res.isValid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('strictly rejects private key material (parameter "d") with security violation', () => {
    const privateJWK = {
      ...validECPublicJWK,
      d: 'jpsQnnGQmL-Y2MnH4PZFyKQ6MFiq4nGmk5aSvBP7bZU' // Private key component!
    };
    const res = validatePublicKeyJWK(privateJWK);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Security violation');
    expect(res.error).toContain('parameter "d"');
  });

  it('rejects unsupported key algorithms and curves', () => {
    const rsaKey = { kty: 'RSA', n: '...', e: 'AQAB' };
    expect(validatePublicKeyJWK(rsaKey).isValid).toBe(false);
    expect(validatePublicKeyJWK(rsaKey).error).toContain('Unsupported key type');

    const secp256k1Key = { ...validECPublicJWK, crv: 'secp256k1' };
    expect(validatePublicKeyJWK(secp256k1Key).isValid).toBe(false);
    expect(validatePublicKeyJWK(secp256k1Key).error).toContain('Unsupported curve');
  });

  it('rejects missing or malformed curve coordinates', () => {
    expect(validatePublicKeyJWK({ kty: 'EC', crv: 'P-256' }).isValid).toBe(false);
    expect(validatePublicKeyJWK({ kty: 'EC', crv: 'P-256', x: '123' }).isValid).toBe(false);
    expect(validatePublicKeyJWK({ kty: 'EC', crv: 'P-256', x: 123, y: '456' }).isValid).toBe(false);
  });
});

describe('Stage 2: Trusted Contacts & Fingerprint Confirmation Workflow', () => {
  const testJWK = {
    kty: 'EC',
    crv: 'P-256',
    x: 'f83OJ3D2xFmTEcKEUSuqgzOjWCFGFW4WcxBpVkORUO8',
    y: 'x_daaqundbgUvMVN55KaWTYL5KEfEDKCFvcHYTA8344'
  };

  it('computes deterministic, formatted SHA-256 key fingerprints', async () => {
    const fp1 = await computeKeyFingerprint(testJWK);
    const fp2 = await computeKeyFingerprint(testJWK);
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^([0-9A-F]{2}:){15}[0-9A-F]{2}$/);
    expect(compareFingerprints(fp1, fp2)).toBe(true);
  });

  it('imports contact as UNCONFIRMED (isTrusted = false) by default', async () => {
    const contact = await saveContact({
      name: 'Alice Campus',
      publicKeyJWK: testJWK,
      isTrusted: false
    });

    expect(contact.name).toBe('Alice Campus');
    expect(contact.isTrusted).toBe(false);
    expect(contact.verifiedAt).toBeNull();
    expect(contact.fingerprint).toBeDefined();

    const stored = await getContactByFingerprint(contact.fingerprint);
    expect(stored).not.toBeNull();
    expect(stored.isTrusted).toBe(false);
  });

  it('requires explicit out-of-band fingerprint verification to mark contact as trusted', async () => {
    const contact = await saveContact({
      name: 'Bob Engineering',
      publicKeyJWK: testJWK
    });

    expect(contact.isTrusted).toBe(false);

    // User confirms fingerprint out-of-band
    const updated = await setContactTrustStatus(contact.fingerprint, true);
    expect(updated.isTrusted).toBe(true);
    expect(updated.verifiedAt).not.toBeNull();

    // User can revoke trust
    const revoked = await setContactTrustStatus(contact.fingerprint, false);
    expect(revoked.isTrusted).toBe(false);
  });

  it('allows removing contacts from storage', async () => {
    const contact = await saveContact({
      name: 'Temporary Peer',
      publicKeyJWK: testJWK
    });

    const removed = await removeContact(contact.fingerprint);
    expect(removed).toBe(true);

    const lookup = await getContactByFingerprint(contact.fingerprint);
    expect(lookup).toBeNull();
  });
});

describe('Stage 2: Complete 7-State Verification Pipeline', () => {
  let senderKeyPair;
  let senderIdentity;
  let senderJWK;
  let basePayload;

  beforeEach(async () => {
    const res = await generateSigningIdentity('Dr. Smith');
    senderKeyPair = res.keyPair;
    senderIdentity = res.identity;
    senderJWK = res.identity.publicKey;
  });

  it('State 1: VALID_TRUSTED (Signed with explicit trusted contact key)', async () => {
    // Save contact as explicitly trusted
    await saveContact({
      name: 'Dr. Smith',
      publicKeyJWK: senderJWK,
      isTrusted: true
    });

    const payload = await signPayload(senderKeyPair.privateKey, {
      content: 'Official Department Notice',
      contentType: 'text',
      kid: senderIdentity.kid,
      name: 'Dr. Smith',
      exp: null
    });

    const result = await verifyScannedPayload(JSON.stringify(payload));
    expect(result.code).toBe('VALID_TRUSTED');
    expect(result.outcome).toBe(VERIFICATION_OUTCOMES.VALID_TRUSTED);
    expect(result.signatureValid).toBe(true);
    expect(result.signerTrustStatus).toBe('TRUSTED');
  });

  it('State 2: VALID_UNKNOWN_KEY (Signature valid with supplied key not in contacts)', async () => {
    // Clean out contacts for this key
    const fp = await computeKeyFingerprint(senderJWK);
    await removeContact(fp);

    const payload = await signPayload(senderKeyPair.privateKey, {
      content: 'Meeting location: Room 302',
      contentType: 'text',
      kid: senderIdentity.kid,
      name: 'Dr. Smith',
      exp: null
    });

    const result = await verifyScannedPayload(JSON.stringify(payload), {
      suppliedPublicKeyJWK: senderJWK
    });

    expect(result.code).toBe('VALID_UNKNOWN_KEY');
    expect(result.outcome).toBe(VERIFICATION_OUTCOMES.VALID_UNKNOWN_KEY);
    expect(result.signatureValid).toBe(true);
    expect(result.signerTrustStatus).toBe('UNKNOWN');
  });

  it('State 3: VALID_IMPORTED_UNCONFIRMED (Signed with key imported but unconfirmed)', async () => {
    // Save contact as unconfirmed
    await saveContact({
      name: 'Dr. Smith',
      publicKeyJWK: senderJWK,
      isTrusted: false
    });

    const payload = await signPayload(senderKeyPair.privateKey, {
      content: 'Unconfirmed announcement',
      contentType: 'text',
      kid: senderIdentity.kid,
      name: 'Dr. Smith',
      exp: null
    });

    const result = await verifyScannedPayload(JSON.stringify(payload));
    expect(result.code).toBe('VALID_IMPORTED_UNCONFIRMED');
    expect(result.outcome).toBe(VERIFICATION_OUTCOMES.VALID_IMPORTED_UNCONFIRMED);
    expect(result.signatureValid).toBe(true);
    expect(result.signerTrustStatus).toBe('IMPORTED_UNCONFIRMED');
  });

  it('State 4: INVALID_SIGNATURE (Detects content tampering and bad signatures)', async () => {
    await saveContact({
      name: 'Dr. Smith',
      publicKeyJWK: senderJWK,
      isTrusted: true
    });

    const payload = await signPayload(senderKeyPair.privateKey, {
      content: 'Transfer 10 Credits',
      contentType: 'text',
      kid: senderIdentity.kid,
      name: 'Dr. Smith',
      exp: null
    });

    // Tamper with the content
    payload.content = 'Transfer 1000 Credits';

    const result = await verifyScannedPayload(JSON.stringify(payload));
    expect(result.code).toBe('INVALID_SIGNATURE');
    expect(result.outcome).toBe(VERIFICATION_OUTCOMES.INVALID_SIGNATURE);
    expect(result.signatureValid).toBe(false);
  });

  it('State 5: UNSIGNED (Standard plain URLs or raw text)', async () => {
    const rawUrl = 'https://example.edu/calendar';
    const result = await verifyScannedPayload(rawUrl);

    expect(result.code).toBe('UNSIGNED');
    expect(result.outcome).toBe(VERIFICATION_OUTCOMES.UNSIGNED);
    expect(result.signatureValid).toBe(false);
    expect(result.contentType).toBe('url');
    expect(result.content).toBe(rawUrl);
  });

  it('State 6: EXPIRED (Signature valid, but validity window has passed)', async () => {
    await saveContact({
      name: 'Dr. Smith',
      publicKeyJWK: senderJWK,
      isTrusted: true
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const pastExpiry = nowSeconds - 3600; // 1 hour ago

    const payload = await signPayload(senderKeyPair.privateKey, {
      content: 'Flash Promo Code',
      contentType: 'text',
      kid: senderIdentity.kid,
      name: 'Dr. Smith',
      exp: pastExpiry
    });

    const result = await verifyScannedPayload(JSON.stringify(payload), {
      currentTimeSeconds: nowSeconds
    });

    expect(result.code).toBe('EXPIRED');
    expect(result.outcome).toBe(VERIFICATION_OUTCOMES.EXPIRED);
    expect(result.signatureValid).toBe(true); // Must remain true!
    expect(result.isExpired).toBe(true);
  });

  it('State 7: UNABLE_TO_VERIFY (Malformed payload or missing public key)', async () => {
    // 1. Missing public key
    const payload = await signPayload(senderKeyPair.privateKey, {
      content: 'Secret Message',
      contentType: 'text',
      kid: 'non_existent_key_id_9999',
      name: 'Dr. Mystery',
      exp: null
    });

    const resultNoKey = await verifyScannedPayload(JSON.stringify(payload));
    expect(resultNoKey.code).toBe('UNABLE_TO_VERIFY');
    expect(resultNoKey.explanation).toContain('No public key found');

    // 2. Malformed JSON with broken signature schema
    const malformedPayload = JSON.stringify({
      v: 1,
      sig: '', // empty signature
      content: 'hello'
    });
    const resultMalformed = await verifyScannedPayload(malformedPayload);
    expect(resultMalformed.code).toBe('UNABLE_TO_VERIFY');
    expect(resultMalformed.explanation).toContain('Malformed payload');
  });

  it('Supports never-expiring payloads (exp: null)', async () => {
    const payload = await signPayload(senderKeyPair.privateKey, {
      content: 'Permanent Diploma Hash',
      contentType: 'text',
      kid: senderIdentity.kid,
      name: 'Dr. Smith',
      exp: null
    });

    expect(payload.exp).toBeNull();
    const expiry = checkPayloadExpiry(payload);
    expect(expiry.isExpired).toBe(false);
    expect(expiry.neverExpires).toBe(true);
  });
});

describe('Stage 2: Safe Content Display & Client-Side URL Threat Separation', () => {
  it('analyzes URL threats strictly through client-side heuristics without network requests', () => {
    const rawIpUrl = 'http://192.168.1.100/admin';
    const threat = analyzeThreat(rawIpUrl);
    expect(threat.riskLevel).toBe('Dangerous');
    expect(threat.reasons.some(r => r.includes('raw IP'))).toBe(true);
    expect(threat.reasons.some(r => r.includes('HTTP'))).toBe(true);

    const safeUrl = 'https://portal.university.edu/login';
    const safeThreat = analyzeThreat(safeUrl);
    expect(safeThreat.riskLevel).toBe('Safe');
    expect(safeThreat.score).toBeLessThan(30);
  });

  it('keeps URL threat analysis independent of signature validity', async () => {
    const res = await generateSigningIdentity('Trusted Admin');
    await saveContact({
      name: 'Trusted Admin',
      publicKeyJWK: res.identity.publicKey,
      isTrusted: true
    });

    // Even if digitally signed by a trusted key, a raw IP destination still triggers URL heuristic warnings
    const dangerousSigned = await signPayload(res.keyPair.privateKey, {
      content: 'http://10.0.0.1/malicious-setup',
      contentType: 'url',
      kid: res.identity.kid,
      name: 'Trusted Admin',
      exp: null
    });

    const result = await verifyScannedPayload(JSON.stringify(dangerousSigned));
    expect(result.signatureValid).toBe(true);
    expect(result.code).toBe('VALID_TRUSTED');
    // Threat heuristics are evaluated and surfaced independently
    expect(result.threat).not.toBeNull();
    expect(result.threat.riskLevel).toBe('Dangerous');
    expect(result.threat.reasons.some(r => r.includes('raw IP'))).toBe(true);
  });
});
