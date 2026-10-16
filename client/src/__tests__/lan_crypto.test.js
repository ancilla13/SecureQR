import { describe, it, expect } from 'vitest';
import { 
  generateEcdhKeyPair,
  createHandshakePacket,
  verifyHandshakePacket,
  deriveSessionKey,
  encryptMessage,
  decryptMessage,
  createPublicKeyAnnouncement,
  verifyPublicKeyAnnouncement
} from '../engine/lanCrypto.js';
import { generateSigningIdentity, saveContact, getContactByFingerprint } from '../engine/keystore.js';

describe('Secure LAN Cryptographic Protocol (ECDH + HKDF + AES-256-GCM)', () => {

  it('generates distinct ECDH ephemeral keypairs on curve P-256', async () => {
    const ecdhA = await generateEcdhKeyPair();
    const ecdhB = await generateEcdhKeyPair();

    expect(ecdhA.publicJWK.kty).toBe('EC');
    expect(ecdhA.publicJWK.crv).toBe('P-256');
    expect(ecdhB.publicJWK.kty).toBe('EC');
    expect(ecdhA.publicJWK.x).not.toBe(ecdhB.publicJWK.x);
  });

  it('signs and verifies authenticated ECDH handshake packets using ECDSA identities', async () => {
    const { identity, keyPair } = await generateSigningIdentity('Alice');
    const aliceEcdh = await generateEcdhKeyPair();

    const packet = await createHandshakePacket({ privateKey: keyPair.privateKey, ...identity }, aliceEcdh.publicJWK);
    expect(packet.sig).toBeDefined();
    expect(packet.kid).toBe(identity.kid);

    // Verify valid packet
    const check = await verifyHandshakePacket(packet, identity.publicKey);
    expect(check.isValid).toBe(true);
    expect(check.peerEcdhPubJWK.x).toBe(aliceEcdh.publicJWK.x);

    // Tampered packet content must fail cryptographic verification
    const tampered = { ...packet, content: packet.content.replace('ecdh', 'tampered_ecdh') };
    const tamperedCheck = await verifyHandshakePacket(tampered, identity.publicKey);
    expect(tamperedCheck.isValid).toBe(false);

    // A relay must not be able to replace an unsigned convenience copy of the
    // signed ECDH key. The verifier must always parse packet.content.
    const attackerEcdh = await generateEcdhKeyPair();
    const duplicateFieldTampered = {
      ...packet,
      handshakeData: { ...packet.handshakeData, ecdhPubJWK: attackerEcdh.publicJWK }
    };
    const duplicateCheck = await verifyHandshakePacket(duplicateFieldTampered, identity.publicKey);
    expect(duplicateCheck.isValid).toBe(true);
    expect(duplicateCheck.peerEcdhPubJWK.x).toBe(aliceEcdh.publicJWK.x);
  });

  it('derives matching AES-256-GCM session keys and matching security codes on both peers', async () => {
    // Peer A (Alice)
    const ecdhAlice = await generateEcdhKeyPair();
    // Peer B (Bob)
    const ecdhBob = await generateEcdhKeyPair();

    // Alice derives using her private key + Bob's public key
    const aliceSession = await deriveSessionKey(ecdhAlice.keyPair.privateKey, ecdhBob.publicJWK, 'Room-101');

    // Bob derives using his private key + Alice's public key
    const bobSession = await deriveSessionKey(ecdhBob.keyPair.privateKey, ecdhAlice.publicJWK, 'Room-101');

    // Human-verifiable security codes must be 100% identical
    expect(aliceSession.securityCode).toBe(bobSession.securityCode);
    expect(aliceSession.securityCode.length).toBe(6);

    // Test that both keys can encrypt and decrypt each other's messages
    const plaintext = 'Hello Bob, this is an end-to-end encrypted LAN message!';
    const envelope = await encryptMessage(aliceSession.sessionKey, plaintext, 1);

    expect(envelope.ciphertext).toBeDefined();
    expect(envelope.iv).toBeDefined();
    expect(envelope.ciphertext).not.toBe(plaintext);

    const decryptedByBob = await decryptMessage(bobSession.sessionKey, envelope, 1);
    expect(decryptedByBob).toBe(plaintext);
  });

  it('rejects tampered ciphertexts and invalid authentication tags', async () => {
    const ecdhA = await generateEcdhKeyPair();
    const ecdhB = await generateEcdhKeyPair();

    const sessionA = await deriveSessionKey(ecdhA.keyPair.privateKey, ecdhB.publicJWK);
    const sessionB = await deriveSessionKey(ecdhB.keyPair.privateKey, ecdhA.publicJWK);

    const envelope = await encryptMessage(sessionA.sessionKey, 'Secret message', 1);

    // Tamper with ciphertext by altering last characters
    const tamperedCiphertext = envelope.ciphertext.slice(0, -4) + 'AAAA';
    const tamperedEnvelope = { ...envelope, ciphertext: tamperedCiphertext };

    await expect(decryptMessage(sessionB.sessionKey, tamperedEnvelope, 1)).rejects.toThrow();
  });

  it('enforces replay protection against stale sequence numbers', async () => {
    const ecdhA = await generateEcdhKeyPair();
    const ecdhB = await generateEcdhKeyPair();

    const sessionA = await deriveSessionKey(ecdhA.keyPair.privateKey, ecdhB.publicJWK);
    const sessionB = await deriveSessionKey(ecdhB.keyPair.privateKey, ecdhA.publicJWK);

    const envelope = await encryptMessage(sessionA.sessionKey, 'Message 1', 1);

    // Expecting sequence 2 or higher, but received 1
    await expect(decryptMessage(sessionB.sessionKey, envelope, 2)).rejects.toThrow(/Replay attack detected/);
  });

  it('creates and verifies signed Public Key Announcements for trusted contact exchange', async () => {
    const { identity, keyPair } = await generateSigningIdentity('Alice Researcher');

    const announcement = await createPublicKeyAnnouncement(keyPair.privateKey, identity.publicKey, {
      name: identity.alias,
      kid: identity.kid,
      fingerprint: identity.fingerprint
    });
    expect(announcement.type).toBe('public_key_announcement');
    expect(announcement.sig).toBeDefined();

    // Verify announcement
    const verifyResult = await verifyPublicKeyAnnouncement(announcement);
    expect(verifyResult.isValid).toBe(true);
    expect(verifyResult.contact.name).toBe('Alice Researcher');
    expect(verifyResult.contact.fingerprint).toBe(identity.fingerprint);

    // Display metadata outside the signed content must not relabel a key.
    const relabelled = {
      ...announcement,
      announcementData: { ...announcement.announcementData, name: 'Attacker' }
    };
    const relabelledResult = await verifyPublicKeyAnnouncement(relabelled);
    expect(relabelledResult.isValid).toBe(true);
    expect(relabelledResult.contact.name).toBe('Alice Researcher');

    // Save into Bob's contacts store
    await saveContact({
      name: verifyResult.contact.name,
      publicKeyJWK: verifyResult.contact.publicKeyJWK,
      isTrusted: true
    });

    const saved = await getContactByFingerprint(identity.fingerprint);
    expect(saved).toBeDefined();
    expect(saved.isTrusted).toBe(true);
  });

});
