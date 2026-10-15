import { describe, it, expect, beforeEach } from 'vitest';
import { 
  buildCanonicalDataString, 
  signPayload, 
  verifySignature, 
  importPublicKeyJWK,
  checkPayloadExpiry 
} from '../engine/cryptoSign.js';
import { 
  generateSigningIdentity, 
  computeKeyFingerprint,
  compareFingerprints,
  loadActiveIdentity,
  clearActiveIdentity 
} from '../engine/keystore.js';

describe('Stage 1: Production Cryptographic Engine & Keystore Audit', () => {
  beforeEach(async () => {
    await clearActiveIdentity();
  });

  // 1. Non-Extractable Key Generation & Properties
  it('generates non-extractable private keys and exportable public keys', async () => {
    const { identity, keyPair } = await generateSigningIdentity('Security Auditor');

    expect(identity.alias).toBe('Security Auditor');
    expect(identity.kid).toMatch(/^k_[a-f0-9]{8}$/);
    expect(identity.fingerprint).toMatch(/^([0-9A-F]{2}:){15}[0-9A-F]{2}$/);
    
    // Security check: Private key MUST be non-extractable
    expect(keyPair.privateKey.extractable).toBe(false);
    expect(keyPair.publicKey.extractable).toBe(true);

    // SubtleCrypto exportKey on private key must fail
    const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
    await expect(cryptoObj.subtle.exportKey('jwk', keyPair.privateKey)).rejects.toThrow();
  });

  // 2. Stable Fingerprint Calculation & Constant-Time Comparison
  it('computes stable fingerprints and verifies them reliably across formatting differences', async () => {
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      x: 'W4r1bE5-n9eB_r3Q8g0p1k9j5a8d7s6f5g4h3j2k1l0',
      y: 'M2q7vB9-m1aZ_k8L7x6c5v4b3n2m1l0k9j8h7g6f5d4'
    };

    const fp1 = await computeKeyFingerprint(jwk);
    const fp2 = await computeKeyFingerprint(jwk);

    expect(fp1).toBe(fp2);
    expect(fp1.split(':')).toHaveLength(16);

    // Reliable format-agnostic matching
    expect(compareFingerprints(fp1, fp2)).toBe(true);
    expect(compareFingerprints(fp1.toLowerCase(), fp2)).toBe(true);
    expect(compareFingerprints(fp1.replace(/:/g, ' '), fp2)).toBe(true);
    expect(compareFingerprints(fp1.replace(/:/g, ''), fp2)).toBe(true);

    // Mismatched fingerprints must be rejected
    const tamperedFp = fp1.slice(0, -2) + '00';
    expect(compareFingerprints(fp1, tamperedFp)).toBe(false);
  });

  // 3. Keystore Persistence and Restoration
  it('persists and restores active non-extractable key handles across sessions', async () => {
    const generated = await generateSigningIdentity('Alice Persisted');
    
    // Simulate session reload
    const restored = await loadActiveIdentity();
    expect(restored).not.toBeNull();
    expect(restored.identity.kid).toBe(generated.identity.kid);
    expect(restored.identity.fingerprint).toBe(generated.identity.fingerprint);
    expect(restored.keyPair.privateKey.extractable).toBe(false);

    // Verify restored private key can sign valid payloads
    const signed = await signPayload(restored.keyPair.privateKey, {
      content: 'Restored Key Test',
      kid: restored.identity.kid
    });

    const pubKey = await importPublicKeyJWK(restored.identity.publicKey);
    const result = await verifySignature(pubKey, signed);
    expect(result.isValid).toBe(true);
  });

  // 4. Canonicalization with Delimiters, Special Characters & Unicode
  it('builds deterministic canonical string with sorted keys, special characters, and Unicode', () => {
    const payload = {
      content: 'Price: ₹500 | Code: ABC|DEF; \nLine 2\t"Quotes" & \\Backslash\\ 🚀 日本語',
      contentType: 'payment',
      exp: 1800000000,
      iat: 1700000000,
      kid: 'k_abcdef12',
      name: 'Dr. Müller & Co.',
      v: 1
    };

    const canonical1 = buildCanonicalDataString(payload);
    const canonical2 = buildCanonicalDataString(payload);

    // Absolute determinism
    expect(canonical1).toBe(canonical2);

    const parsed = JSON.parse(canonical1);
    expect(Object.keys(parsed)).toEqual([
      'content',
      'contentType',
      'exp',
      'iat',
      'kid',
      'name',
      'v'
    ]);
    expect(parsed.content).toContain('₹500 | Code: ABC|DEF');
    expect(parsed.content).toContain('🚀 日本語');
    expect(parsed.name).toBe('Dr. Müller & Co.');
  });

  // 5. Expiry Independence & Never-Expiring Payloads
  it('supports never-expiring payloads (exp: null) and separates cryptographic validity from expiry', async () => {
    const { identity, keyPair } = await generateSigningIdentity('Alice');
    const pubKey = await importPublicKeyJWK(identity.publicKey);

    // A: Never-expiring payload
    const neverExpiring = await signPayload(keyPair.privateKey, {
      content: 'Permanent Document',
      exp: null,
      kid: identity.kid
    });

    expect(neverExpiring.exp).toBeNull();
    const resultNever = await verifySignature(pubKey, neverExpiring);
    expect(resultNever.isValid).toBe(true);
    
    const expiryNever = checkPayloadExpiry(neverExpiring);
    expect(expiryNever.isExpired).toBe(false);
    expect(expiryNever.neverExpires).toBe(true);

    // B: Past expiry payload (Signature is mathematically VALID, but temporal expiry is true)
    const pastTimestamp = 1600000000; // Year 2020
    const expiredPayload = await signPayload(keyPair.privateKey, {
      content: 'Expired Pass',
      exp: pastTimestamp,
      kid: identity.kid
    });

    // Signature verification tests MATHEMATICAL validity only
    const sigResult = await verifySignature(pubKey, expiredPayload);
    expect(sigResult.isValid).toBe(true);

    // Temporal expiry evaluation tests time independently
    const expResult = checkPayloadExpiry(expiredPayload);
    expect(expResult.isExpired).toBe(true);
    expect(expResult.expiryDate).toBe(new Date(pastTimestamp * 1000).toISOString());
  });

  // 6. Tampering with EVERY Signed Field
  it('detects tampering on every individual signed field', async () => {
    const { identity, keyPair } = await generateSigningIdentity('Integrity Test');
    const pubKey = await importPublicKeyJWK(identity.publicKey);

    const baseSigned = await signPayload(keyPair.privateKey, {
      content: 'Original Content',
      contentType: 'text',
      kid: identity.kid,
      name: 'Original Signer',
      exp: 1800000000,
      iat: 1700000000
    });

    // Tamper each field individually
    const fieldsToTamper = [
      { field: 'content', value: 'Altered Content' },
      { field: 'contentType', value: 'url' },
      { field: 'kid', value: 'k_tampered' },
      { field: 'name', value: 'Malicious Signer' },
      { field: 'exp', value: 1900000000 },
      { field: 'iat', value: 1700000001 },
      { field: 'v', value: 2 }
    ];

    for (const { field, value } of fieldsToTamper) {
      const tampered = { ...baseSigned, [field]: value };
      const result = await verifySignature(pubKey, tampered);
      expect(result.isValid, `Tampering with field '${field}' must fail verification`).toBe(false);
    }

    // Tamper signature itself
    const tamperedSig = { ...baseSigned, sig: baseSigned.sig.slice(0, -4) + 'AAAA' };
    const sigResult = await verifySignature(pubKey, tamperedSig);
    expect(sigResult.isValid).toBe(false);
  });

  // 7. Rejection of Wrong Public Key
  it('rejects verification when signed by Alice but verified against Bob', async () => {
    const alice = await generateSigningIdentity('Alice');
    const bob = await generateSigningIdentity('Bob');

    const signedByAlice = await signPayload(alice.keyPair.privateKey, {
      content: 'Payment of ₹10,000 to Bob',
      kid: alice.identity.kid
    });

    const bobPubKey = await importPublicKeyJWK(bob.identity.publicKey);
    const result = await verifySignature(bobPubKey, signedByAlice);

    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('mismatch');
  });

  // 8. Strict Timestamp & Schema Validation
  it('rejects non-integer timestamps and malformed schemas during canonicalization', () => {
    expect(() => buildCanonicalDataString({ content: 'Test', iat: 'invalid' })).toThrow(/Invalid issue timestamp/);
    expect(() => buildCanonicalDataString({ content: 'Test', iat: 1700000000, exp: 'not-a-number' })).toThrow(/Invalid expiry timestamp/);
    expect(() => buildCanonicalDataString({ content: 'Test', iat: 1700000000, v: 'string-version' })).toThrow(/Invalid payload version/);
  });

  // 9. End-to-End Cross-Device Workflow Simulation
  it('verifies the full cross-device export, transfer, import, and signature verification cycle', async () => {
    // --- DEVICE A (Sender / Creator) ---
    const deviceA = await generateSigningIdentity('Device A User');
    const exportedPublicJWK = deviceA.identity.publicKey;
    const deviceAFingerprint = deviceA.identity.fingerprint;

    // Device A signs content and encodes as QR string
    const qrPayload = await signPayload(deviceA.keyPair.privateKey, {
      content: 'https://university.edu/degree?id=12345',
      contentType: 'url',
      kid: deviceA.identity.kid,
      name: deviceA.identity.alias,
      exp: Math.floor(Date.now() / 1000) + 86400
    });
    const qrString = JSON.stringify(qrPayload);

    // --- TRANSFER OVER UNTRUSTED CHANNEL ---
    // (Simulate JSON string and exported JWK file transmitted to Device B)
    const receivedQrPayload = JSON.parse(qrString);
    const receivedPublicJWK = JSON.parse(JSON.stringify(exportedPublicJWK));

    // --- DEVICE B (Recipient / Verifier) ---
    // 1. Device B imports public key
    const importedPubKey = await importPublicKeyJWK(receivedPublicJWK);
    
    // 2. Device B calculates fingerprint of received key and confirms out-of-band match
    const computedFingerprint = await computeKeyFingerprint(receivedPublicJWK);
    expect(compareFingerprints(computedFingerprint, deviceAFingerprint)).toBe(true);

    // 3. Device B cryptographically verifies received QR payload
    const verification = await verifySignature(importedPubKey, receivedQrPayload);
    expect(verification.isValid).toBe(true);

    // 4. Device B checks expiry
    const expiry = checkPayloadExpiry(receivedQrPayload);
    expect(expiry.isExpired).toBe(false);

    // 5. If an attacker alters the payload in transit, Device B catches it immediately
    const interceptedTampered = { ...receivedQrPayload, content: 'https://phishing.site/fake' };
    const tamperedVerification = await verifySignature(importedPubKey, interceptedTampered);
    expect(tamperedVerification.isValid).toBe(false);
  });
});
