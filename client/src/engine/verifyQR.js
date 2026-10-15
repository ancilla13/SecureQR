/**
 * SecureQR Verification Pipeline
 * 
 * Coordinates:
 * - Layer 1: Universal Inspection (Type & Raw Safe Preview)
 * - Layer 2: Cryptographic Authenticity (Signature, Issuer, Exp)
 * - Layer 3: Threat Intelligence (URL & Deception Analysis)
 * 
 * Generates clear, explainable outcome and independent layer verdicts.
 */

import { inspectPayload } from './layer1_inspector.js';
import { verifyAuthenticity } from './layer2_crypto.js';
import { analyzeThreat, analyzeThreatAsync } from './layer3_threat.js';

export async function processQRScan(rawScannedText, currentTimeSeconds = null) {
  // Step 1: Layer 1 Universal Inspection
  const l1 = inspectPayload(rawScannedText);

  // Step 2: Layer 2 Cryptographic Verification
  let l2;
  if (l1.isSignedJson && l1.parsedJson) {
    l2 = await verifyAuthenticity(l1.parsedJson, currentTimeSeconds);
  } else {
    l2 = {
      status: 'UNVERIFIED',
      reason: 'No cryptographic signature present (standard unsigned QR code).',
      issuer: null,
      isCached: false
    };
  }

  // Step 3: Layer 3 Threat Intelligence
  const l3 = await analyzeThreatAsync(l1.content);

  // Step 4: Synthesize Overall System Outcome
  // Outcomes: VERIFIED, SUSPICIOUS, INVALID, UNVERIFIED
  let overallOutcome = 'UNVERIFIED';
  let badgeColor = 'neutral';
  let primarySummary = '';

  if (l2.status === 'INVALID') {
    overallOutcome = 'INVALID';
    badgeColor = 'danger';
    primarySummary = 'Tampered Payload: Cryptographic signature does not match content.';
  } else if (l2.status === 'EXPIRED') {
    overallOutcome = 'INVALID';
    badgeColor = 'danger';
    primarySummary = `Expired QR Code: Expired on ${l2.expiryDate}.`;
  } else if (l2.status === 'REVOKED') {
    overallOutcome = 'INVALID';
    badgeColor = 'danger';
    primarySummary = 'Revoked Certificate: Issuer key or code identifier was revoked.';
  } else if (l2.status === 'VERIFIED') {
    if (l3.riskLevel === 'Dangerous' || l3.riskLevel === 'Suspicious') {
      overallOutcome = 'SUSPICIOUS';
      badgeColor = 'warning';
      primarySummary = `Authentic Issuer (${l2.issuer}), but destination link looks risky!`;
    } else {
      overallOutcome = 'VERIFIED';
      badgeColor = 'success';
      primarySummary = `Authentic & Safe: Verified by ${l2.issuer}.`;
    }
  } else {
    // Layer 2 is UNVERIFIED (unsigned or unknown issuer)
    if (l3.riskLevel === 'Dangerous' || l3.riskLevel === 'Suspicious') {
      overallOutcome = 'SUSPICIOUS';
      badgeColor = 'warning';
      primarySummary = 'Unsigned & Suspicious: Link flagged for potential security threats.';
    } else {
      overallOutcome = 'UNVERIFIED';
      badgeColor = 'neutral';
      primarySummary = 'Unsigned Standard QR: Content safe, but authenticity cannot be verified.';
    }
  }

  return {
    overallOutcome,
    badgeColor,
    primarySummary,
    layer1: l1,
    layer2: l2,
    layer3: l3,
    timestamp: new Date().toISOString()
  };
}
