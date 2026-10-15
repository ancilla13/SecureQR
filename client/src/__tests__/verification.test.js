import { describe, it, expect } from 'vitest';
import { processQRScan } from '../engine/verifyQR.js';
import { inspectPayload } from '../engine/layer1_inspector.js';
import { analyzeThreat } from '../engine/layer3_threat.js';
import demoVectors from '../data/demoVectors.json';

describe('SecureQR Verification Suite', () => {
  // Demo 1: Unsigned Normal Website
  it('Demo 1: correctly flags unsigned standard QR as UNVERIFIED with Safe threat status', async () => {
    const vector1 = demoVectors.find(v => v.id === 'demo1');
    const result = await processQRScan(vector1.rawText);

    expect(result.overallOutcome).toBe('UNVERIFIED');
    expect(result.layer1.type).toBe('URL');
    expect(result.layer1.isSignedJson).toBe(false);
    expect(result.layer2.status).toBe('UNVERIFIED');
    expect(result.layer3.riskLevel).toBe('Safe');
    expect(result.layer3.score).toBeLessThan(30);
  });

  // Demo 2: Valid Official Signed QR
  it('Demo 2: verifies authentic ECDSA P-256 signature from Apex University', async () => {
    const vector2 = demoVectors.find(v => v.id === 'demo2');
    const result = await processQRScan(vector2.rawText);

    expect(result.overallOutcome).toBe('VERIFIED');
    expect(result.layer1.isSignedJson).toBe(true);
    expect(result.layer2.status).toBe('VERIFIED');
    expect(result.layer2.issuer).toContain('Apex University');
    expect(result.layer3.riskLevel).toBe('Safe');
  });

  // Demo 3: Tampered Payload
  it('Demo 3: detects payload alteration and flags as INVALID', async () => {
    const vector3 = demoVectors.find(v => v.id === 'demo3');
    const result = await processQRScan(vector3.rawText);

    expect(result.overallOutcome).toBe('INVALID');
    expect(result.layer2.status).toBe('INVALID');
    expect(result.layer2.reason).toContain('tampered');
  });

  // Demo 4: Phishing / Raw IP Threat
  it('Demo 4: flags raw IP hostname and deceptive params as SUSPICIOUS outcome', async () => {
    const vector4 = demoVectors.find(v => v.id === 'demo4');
    const result = await processQRScan(vector4.rawText);

    expect(result.overallOutcome).toBe('SUSPICIOUS');
    expect(['Suspicious', 'Dangerous']).toContain(result.layer3.riskLevel);
    expect(result.layer3.score).toBeGreaterThanOrEqual(30);
    expect(result.layer3.reasons.some(r => r.includes('raw IP'))).toBe(true);
  });

  // Demo 5: Expired Official QR
  it('Demo 5: flags past expiration timestamp as EXPIRED/INVALID', async () => {
    const vector5 = demoVectors.find(v => v.id === 'demo5');
    const result = await processQRScan(vector5.rawText);

    expect(result.overallOutcome).toBe('INVALID');
    expect(result.layer2.status).toBe('EXPIRED');
    expect(result.layer2.reason).toContain('expired');
  });

  // Malformed Payload resilience
  it('Handles malformed JSON safely without throwing uncaught exceptions', async () => {
    const malformed = '{"v":1,"iss":"apex-university","sig":"not-valid-base64---***","data":"https://test.com"}';
    const result = await processQRScan(malformed);

    expect(result.overallOutcome).toBe('INVALID');
    expect(result.layer2.status).toBe('INVALID');
  });

  // Layer 1 Classification Tests
  it('Layer 1 classifies diverse QR content types safely', () => {
    expect(inspectPayload('https://example.com').type).toBe('URL');
    expect(inspectPayload('WIFI:S:MyCampus;T:WPA;P:secret;;').type).toBe('Wi-Fi Config');
    expect(inspectPayload('upi://pay?pa=test@okaxis&pn=Store').type).toBe('UPI Payment');
    expect(inspectPayload('BEGIN:VCARD\nFN:John Doe\nEND:VCARD').type).toBe('vCard Contact');
    expect(inspectPayload('Just regular notice board text').type).toBe('Plain Text');
  });

  // Layer 3 Softened TLD vs Punycode
  it('Layer 3 softens TLD rule and penalizes Punycode homograph attacks', () => {
    const punycodeAnalysis = analyzeThreat('https://xn--pypal-4ve.com/signin');
    expect(punycodeAnalysis.riskLevel).toBe('Suspicious');
    expect(punycodeAnalysis.reasons.some(r => r.includes('Punycode'))).toBe(true);

    const normalXyz = analyzeThreat('https://myblog.xyz');
    expect(normalXyz.riskLevel).toBe('Safe');
    expect(normalXyz.score).toBe(10);
  });
});
