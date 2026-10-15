import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from '../client/node_modules/qrcode/lib/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const ROOT_DIR = path.join(__dirname, '..');
const KEYS_DIR = path.join(__dirname, 'keys');
const SERVER_DATA = path.join(ROOT_DIR, 'server/src/data/trustedIssuers.json');
const CLIENT_DATA_DIR = path.join(ROOT_DIR, 'client/src/data');
const CLIENT_CACHED_ISSUERS = path.join(CLIENT_DATA_DIR, 'cachedTrustedIssuers.json');
const CLIENT_DEMO_VECTORS = path.join(CLIENT_DATA_DIR, 'demoVectors.json');
const DEMO_QRS_DIR = path.join(ROOT_DIR, 'client/public/demo_qrs');

// Ensure directories exist
[KEYS_DIR, path.dirname(SERVER_DATA), CLIENT_DATA_DIR, DEMO_QRS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * Format canonical string for signing & verification:
 * v1|iss|kid|iat|exp|type|data
 */
function buildCanonicalString(payload) {
  return `v1|${payload.iss}|${payload.kid}|${payload.iat}|${payload.exp}|${payload.type}|${payload.data}`;
}

async function signCanonical(privateKey, canonicalString) {
  const enc = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    privateKey,
    enc.encode(canonicalString)
  );
  return Buffer.from(signatureBuffer).toString('base64');
}

async function main() {
  console.log('--- Generating SecureQR Demo Issuers and 5-Scan Suite ---');

  // 1. Generate ECDSA P-256 Keypair for Apex University
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  pubJwk.kid = 'key_2026_01';
  pubJwk.status = 'active';
  pubJwk.createdAt = '2026-01-01T00:00:00.000Z';

  // 2. Save private key safely into scripts/keys/ (never deployed or served)
  fs.writeFileSync(
    path.join(KEYS_DIR, 'apex-university-private.json'),
    JSON.stringify(privJwk, null, 2),
    'utf-8'
  );
  console.log('Saved private key to scripts/keys/apex-university-private.json (OFFLINE / GENERATION ONLY)');

  // 3. Prepare Trusted Registry Data
  const registryData = {
    issuers: [
      {
        id: 'apex-university',
        name: 'Apex University Registrar',
        description: 'Official Academic Credentials & Verification Authority',
        website: 'https://portal.apex.edu',
        keys: [pubJwk],
        revokedTokens: ['token_revoked_099'],
        revokedKeys: []
      }
    ]
  };

  // Write to server data
  fs.writeFileSync(SERVER_DATA, JSON.stringify(registryData, null, 2), 'utf-8');
  // Write to client cached data (offline fallback for demo stage resilience)
  fs.writeFileSync(CLIENT_CACHED_ISSUERS, JSON.stringify(registryData, null, 2), 'utf-8');
  console.log('Saved public key registry to server & client fallback.');

  // Current time reference
  const now = Math.floor(Date.now() / 1000);
  const futureExp = now + (365 * 24 * 3600); // 1 year in the future
  const pastIat = now - (60 * 24 * 3600);   // 60 days ago
  const pastExp = now - (30 * 24 * 3600);   // 30 days ago (EXPIRED)

  // 4. Construct the 5 Demo Scenarios

  // --- DEMO 1: Normal Safe Website (Unsigned) ---
  const demo1Raw = 'https://en.wikipedia.org/wiki/Public-key_cryptography';

  // --- DEMO 2: Verified Official QR ---
  const demo2Payload = {
    v: 1,
    iss: 'apex-university',
    kid: 'key_2026_01',
    iat: now,
    exp: futureExp,
    type: 'url',
    data: 'https://portal.apex.edu/transcript?student=92841'
  };
  const demo2Canonical = buildCanonicalString(demo2Payload);
  demo2Payload.sig = await signCanonical(keyPair.privateKey, demo2Canonical);
  const demo2Raw = JSON.stringify(demo2Payload);

  // --- DEMO 3: Tampered QR (Modified Destination with original signature) ---
  const demo3Payload = {
    v: 1,
    iss: 'apex-university',
    kid: 'key_2026_01',
    iat: now,
    exp: futureExp,
    type: 'url',
    data: 'https://p0rtal.apex.edu/transcript?student=92841', // Tampered 'o' -> '0'
    sig: demo2Payload.sig // Original signature for previous un-tampered URL!
  };
  const demo3Raw = JSON.stringify(demo3Payload);

  // --- DEMO 4: Phishing / Suspicious QR (Raw IP address & deceptive params) ---
  const demo4Raw = 'http://192.168.1.100:8080/secure-login?user=student&action=verify';

  // --- DEMO 5: Expired Official QR ---
  const demo5Payload = {
    v: 1,
    iss: 'apex-university',
    kid: 'key_2026_01',
    iat: pastIat,
    exp: pastExp, // Past date
    type: 'url',
    data: 'https://portal.apex.edu/admit-card?exam=fall2025'
  };
  const demo5Canonical = buildCanonicalString(demo5Payload);
  demo5Payload.sig = await signCanonical(keyPair.privateKey, demo5Canonical);
  const demo5Raw = JSON.stringify(demo5Payload);

  // 5. Render PNG QR Codes
  const qrOptions = { width: 400, margin: 2, color: { dark: '#0b132b', light: '#ffffff' } };

  await QRCode.toFile(path.join(DEMO_QRS_DIR, 'demo1_unsigned.png'), demo1Raw, qrOptions);
  await QRCode.toFile(path.join(DEMO_QRS_DIR, 'demo2_verified.png'), demo2Raw, qrOptions);
  await QRCode.toFile(path.join(DEMO_QRS_DIR, 'demo3_tampered.png'), demo3Raw, qrOptions);
  await QRCode.toFile(path.join(DEMO_QRS_DIR, 'demo4_phishing.png'), demo4Raw, qrOptions);
  await QRCode.toFile(path.join(DEMO_QRS_DIR, 'demo5_expired.png'), demo5Raw, qrOptions);
  console.log('Generated 5 Demo QR Code PNG images in client/public/demo_qrs/');

  // 6. Save Demo Test Vectors for UI 1-click test bench
  const demoVectors = [
    {
      id: 'demo1',
      title: 'Demo 1: Normal Safe Website',
      description: 'Standard QR code for Wikipedia. No digital signature present.',
      expectedAuthenticity: 'Unverified',
      expectedThreat: 'Safe',
      image: '/demo_qrs/demo1_unsigned.png',
      rawText: demo1Raw
    },
    {
      id: 'demo2',
      title: 'Demo 2: Authentic University Transcript',
      description: 'Digitally signed by Apex University with valid ECDSA P-256 signature.',
      expectedAuthenticity: 'Verified',
      expectedThreat: 'Safe',
      image: '/demo_qrs/demo2_verified.png',
      rawText: demo2Raw
    },
    {
      id: 'demo3',
      title: 'Demo 3: Tampered Physical Overlay',
      description: 'Original signature reused, but URL modified to a lookalike domain.',
      expectedAuthenticity: 'Invalid',
      expectedThreat: 'Safe or Suspicious',
      image: '/demo_qrs/demo3_tampered.png',
      rawText: demo3Raw
    },
    {
      id: 'demo4',
      title: 'Demo 4: Phishing / Deceptive Link',
      description: 'Unsigned link pointing to private IP host with deceptive login parameters.',
      expectedAuthenticity: 'Unverified',
      expectedThreat: 'Suspicious',
      image: '/demo_qrs/demo4_phishing.png',
      rawText: demo4Raw
    },
    {
      id: 'demo5',
      title: 'Demo 5: Expired Academic Admit Card',
      description: 'Valid signature structure, but expiration timestamp is in the past.',
      expectedAuthenticity: 'Expired',
      expectedThreat: 'Safe',
      image: '/demo_qrs/demo5_expired.png',
      rawText: demo5Raw
    }
  ];

  fs.writeFileSync(CLIENT_DEMO_VECTORS, JSON.stringify(demoVectors, null, 2), 'utf-8');
  console.log('Saved demo vectors metadata to client/src/data/demoVectors.json');
  console.log('--- Demo Suite Generation Complete! ---');
}

main().catch(err => {
  console.error('Generation failed:', err);
  process.exit(1);
});
