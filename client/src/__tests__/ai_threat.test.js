import { describe, it, expect } from 'vitest';
import { analyzeThreat, analyzeThreatAsync, classifyUrlWithAI } from '../engine/layer3_threat.js';
import { verifyScannedPayload, VERIFICATION_OUTCOMES } from '../engine/verifyPipeline.js';
import { signPayload } from '../engine/cryptoSign.js';
import { generateSigningIdentity, saveContact } from '../engine/keystore.js';

describe('Pretrained Phishing URL Classifier (pirocheto/phishing-url-detection)', () => {

  it('correctly classifies a legitimate URL using the pretrained ONNX model', async () => {
    const benignUrl = 'https://portal.apex-university.edu/student-verify';
    const classification = await classifyUrlWithAI(benignUrl);

    if (classification.available) {
      expect(classification.isPhishing).toBe(false);
      expect(classification.label).toBe('Legitimate');
      expect(classification.phishingProbability).toBeLessThan(0.5);
      expect(classification.model).toContain('pirocheto/phishing-url-detection');
    } else {
      // Offline fallback
      expect(classification.available).toBe(false);
    }
  });

  it('correctly flags a known phishing URL using the pretrained ONNX model', async () => {
    const phishingUrl = 'http://192.168.1.100:8080/secure-login';
    const classification = await classifyUrlWithAI(phishingUrl);

    if (classification.available) {
      expect(classification.isPhishing).toBe(true);
      expect(classification.label).toBe('Phishing');
      expect(classification.phishingProbability).toBeGreaterThan(0.7);
      expect(classification.phishingPercent).toBeGreaterThanOrEqual(70);
    } else {
      // Offline fallback
      expect(classification.available).toBe(false);
    }
  });

  it('integrates AI classification into analyzeThreatAsync without breaking synchronous heuristics', async () => {
    const dangerousUrl = 'http://192.168.1.100:8080/secure-login';
    
    // Test synchronous heuristics
    const syncResult = analyzeThreat(dangerousUrl);
    expect(syncResult.riskLevel).toBe('Dangerous');
    expect(syncResult.score).toBeGreaterThanOrEqual(65);
    expect(syncResult.reasons.some(r => r.includes('raw IP'))).toBe(true);

    // Test asynchronous AI-enhanced threat assessment
    const asyncResult = await analyzeThreatAsync(dangerousUrl);
    expect(asyncResult.isUrl).toBe(true);
    expect(asyncResult.riskLevel).toBe('Dangerous');
    expect(asyncResult.score).toBeGreaterThanOrEqual(65);
    expect(asyncResult.reasons.some(r => r.includes('raw IP'))).toBe(true);
    expect(asyncResult.aiClassification).toBeDefined();
  });

  it('safely handles non-URL content without attempting AI inference', async () => {
    const textContent = 'Just regular campus notice text';
    const result = await analyzeThreatAsync(textContent);

    expect(result.isUrl).toBe(false);
    expect(result.riskLevel).toBe('Safe');
    expect(result.score).toBe(0);
    expect(result.aiClassification).toBeNull();
  });

  it('preserves strict independence: authentic signature remains VALID even when destination is phishing', async () => {
    // Generate fresh keypair and register contact
    const { identity, keyPair } = await generateSigningIdentity('Security Test Signer');
    await saveContact({
      name: identity.alias,
      publicKeyJWK: identity.publicKey,
      isTrusted: true
    });

    const now = Math.floor(Date.now() / 1000);
    const payload = await signPayload(keyPair.privateKey, {
      v: 1,
      kid: identity.kid,
      name: identity.alias,
      iat: now,
      exp: now + 3600,
      contentType: 'url',
      content: 'http://192.168.1.100:8080/secure-login'
    });

    const result = await verifyScannedPayload(JSON.stringify(payload));

    // Cryptographic authenticity must be VALID_TRUSTED
    expect(result.outcome).toBe(VERIFICATION_OUTCOMES.VALID_TRUSTED);
    expect(result.signatureValid).toBe(true);
    expect(result.signerTrustStatus).toBe('TRUSTED');

    // Threat intelligence must independently evaluate the destination as Dangerous
    expect(result.threat).toBeDefined();
    expect(result.threat.riskLevel).toBe('Dangerous');
    expect(result.threat.isUrl).toBe(true);
    expect(result.threat.reasons.some(r => r.includes('raw IP'))).toBe(true);
  });

  it('correctly handles unsigned QR payload: reports authenticity not verified without marking malicious', async () => {
    const rawUrl = 'https://portal.apex-university.edu/student-verify';
    const result = await verifyScannedPayload(rawUrl);

    expect(result.outcome).toBe(VERIFICATION_OUTCOMES.UNSIGNED);
    expect(result.signatureValid).toBe(false);
    expect(result.signerTrustStatus).toBe('NOT_APPLICABLE');
    expect(result.contentType).toBe('url');
    // Benign URL must not be labeled malicious just because it is unsigned
    expect(result.threat).toBeDefined();
    expect(result.threat.riskLevel).toBe('Safe');
    expect(result.threat.score).toBeLessThan(30);
  });

  it('correctly catches tampered signed payload: benign ML result never masks tampering', async () => {
    const { identity, keyPair } = await generateSigningIdentity('Tamper Target Signer');
    await saveContact({
      name: identity.alias,
      publicKeyJWK: identity.publicKey,
      isTrusted: true
    });

    const now = Math.floor(Date.now() / 1000);
    const payload = await signPayload(keyPair.privateKey, {
      v: 1,
      kid: identity.kid,
      name: identity.alias,
      iat: now,
      exp: now + 3600,
      contentType: 'url',
      content: 'https://google.com'
    });

    // Tamper with payload content after signing
    payload.content = 'https://portal.apex-university.edu/student-verify';

    const result = await verifyScannedPayload(JSON.stringify(payload));

    expect(result.outcome).toBe(VERIFICATION_OUTCOMES.INVALID_SIGNATURE);
    expect(result.signatureValid).toBe(false);
    // URL threat is independently Safe, but does not alter signature invalidity
    expect(result.threat.riskLevel).toBe('Safe');
  });

  it('correctly flags expired signed payload while verifying authentic signature', async () => {
    const { identity, keyPair } = await generateSigningIdentity('Expiry Target Signer');
    await saveContact({
      name: identity.alias,
      publicKeyJWK: identity.publicKey,
      isTrusted: true
    });

    const now = Math.floor(Date.now() / 1000);
    const payload = await signPayload(keyPair.privateKey, {
      v: 1,
      kid: identity.kid,
      name: identity.alias,
      iat: now - 7200,
      exp: now - 3600, // expired 1 hour ago
      contentType: 'url',
      content: 'https://portal.apex-university.edu/student-verify'
    });

    const result = await verifyScannedPayload(JSON.stringify(payload));

    expect(result.outcome).toBe(VERIFICATION_OUTCOMES.EXPIRED);
    expect(result.signatureValid).toBe(true);
    expect(result.isExpired).toBe(true);
  });

  it('handles ML service failure honestly without throwing or fabricating predictions', async () => {
    // Point to non-existent endpoint to simulate 502/service failure
    const originalUrl = process.env.TEST_API_URL;
    process.env.TEST_API_URL = 'http://localhost:59998';

    try {
      const res = await classifyUrlWithAI('https://example.com');
      expect(res.available).toBe(false);
      expect(res.isPhishing).toBeUndefined();
      expect(res.phishingProbability).toBeUndefined();
      expect(res.error).toBeDefined();

      const threat = await analyzeThreatAsync('https://example.com');
      expect(threat.isUrl).toBe(true);
      expect(threat.riskLevel).toBe('Safe');
      expect(threat.aiClassification.available).toBe(false);
      expect(threat.reasons.some(r => r.includes('AI Model: Pretrained model offline or unreachable'))).toBe(true);
    } finally {
      process.env.TEST_API_URL = originalUrl;
    }
  });

});

describe('Lookalike domain heuristics', () => {
  it.each([
    'https://www.g00gle.com',
    'https://paypa1.com/account',
    'https://p0rtal.apex.edu/transcript?student=92841'
  ])('flags %s as Dangerous', (url) => {
    const r = analyzeThreat(url);
    expect(r.riskLevel).toBe('Dangerous');
    expect(r.reasons.join(' ')).toMatch(/Lookalike domain/);
  });

  it.each([
    'https://www.google.com',
    'https://portal.apex.edu/transcript?student=92841',
    'https://example.com'
  ])('does not flag genuine %s', (url) => {
    expect(analyzeThreat(url).reasons.join(' ')).not.toMatch(/Lookalike domain/);
  });
});
