/**
 * User Keystore & Trusted Contacts Management (IndexedDB + Web Crypto)
 * 
 * Stores:
 * 1. 'signing_identity': Active user's ECDSA P-256 identity with non-extractable private key.
 * 2. 'trusted_contacts': Imported peer public keys with trust confirmation states.
 * 
 * Trust Model:
 * - A contact is UNCONFIRMED upon initial import (isTrusted = false).
 * - A contact becomes TRUSTED only after the user explicitly verifies the fingerprint
 *   against an out-of-band trusted channel (isTrusted = true).
 * - Private key material is NEVER accepted, stored, or imported into contacts.
 */

const DB_NAME = 'SecureQR_Keystore_v2';
const DB_VERSION = 2;
const IDENTITY_STORE = 'signing_identity';
const CONTACTS_STORE = 'trusted_contacts';
const KEY_RECORD_ID = 'active_user_identity';

// In-memory fallback for environments without native IndexedDB (e.g. Node.js unit tests)
const memoryIdentityStore = new Map();
const memoryContactsStore = new Map();

/**
 * Opens or initializes the IndexedDB database
 */
function openDB() {
  if (typeof indexedDB === 'undefined') {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(IDENTITY_STORE)) {
        db.createObjectStore(IDENTITY_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CONTACTS_STORE)) {
        db.createObjectStore(CONTACTS_STORE, { keyPath: 'fingerprint' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`IndexedDB error: ${request.error?.message}`));
  });
}

/**
 * Computes a deterministic SHA-256 fingerprint for an ECDSA public key JWK
 * Returns formatted 16-byte colon-separated hex string: "4A:8F:2B:..."
 */
export async function computeKeyFingerprint(jwk) {
  if (!jwk || typeof jwk !== 'object') {
    throw new Error('Invalid public key: JWK object required.');
  }
  if (!jwk.x || !jwk.y) {
    throw new Error('Invalid public key JWK: missing x or y curve coordinates.');
  }

  const canonicalJwk = JSON.stringify({
    crv: jwk.crv || 'P-256',
    kty: jwk.kty || 'EC',
    x: String(jwk.x),
    y: String(jwk.y)
  });

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  const enc = new TextEncoder();
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', enc.encode(canonicalJwk));
  const hashBytes = new Uint8Array(hashBuffer);

  return Array.from(hashBytes.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}

/**
 * Reliable, constant-time comparison of two public key fingerprints
 */
export function compareFingerprints(fpA, fpB) {
  if (!fpA || !fpB) return false;
  const cleanA = String(fpA).replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  const cleanB = String(fpB).replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (cleanA.length !== cleanB.length || cleanA.length < 16) return false;

  let diff = 0;
  for (let i = 0; i < cleanA.length; i++) {
    diff |= cleanA.charCodeAt(i) ^ cleanB.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Validates that an imported object is a safe ECDSA P-256 public key.
 * Strictly REJECTS any private key material (e.g. parameter 'd').
 */
export function validatePublicKeyJWK(jwk) {
  if (!jwk || typeof jwk !== 'object') {
    return { isValid: false, error: 'Key file must contain a valid JSON object.' };
  }

  // Security critical: Reject private keys immediately
  if (jwk.d !== undefined) {
    return { 
      isValid: false, 
      error: 'Security violation: Key file contains private key material (parameter "d"). Never import or share private keys.' 
    };
  }

  if (jwk.kty !== 'EC') {
    return { isValid: false, error: `Unsupported key type "${jwk.kty}". Expected "EC" (Elliptic Curve).` };
  }

  if (jwk.crv !== 'P-256') {
    return { isValid: false, error: `Unsupported curve "${jwk.crv}". Expected "P-256".` };
  }

  if (!jwk.x || typeof jwk.x !== 'string' || !jwk.y || typeof jwk.y !== 'string') {
    return { isValid: false, error: 'Invalid key: Missing or malformed EC curve coordinates (x, y).' };
  }

  return { isValid: true };
}

/* =========================================================================
   USER SIGNING IDENTITY MANAGEMENT
   ========================================================================= */

/**
 * Generates an ECDSA P-256 signing keypair with a NON-EXTRACTABLE private key
 */
export async function generateSigningIdentity(alias = 'My Identity') {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;

  const keyPair = await cryptoObj.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, // extractable = false for private key
    ['sign', 'verify']
  );

  const pubJwk = await cryptoObj.subtle.exportKey('jwk', keyPair.publicKey);
  const fingerprint = await computeKeyFingerprint(pubJwk);
  const kid = `k_${fingerprint.replace(/:/g, '').slice(0, 8).toLowerCase()}`;

  const record = {
    id: KEY_RECORD_ID,
    alias: alias.trim() || 'My Identity',
    kid,
    fingerprint,
    createdAt: new Date().toISOString(),
    publicKeyJWK: { ...pubJwk, kid },
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey
  };

  const db = await openDB();
  if (!db) {
    memoryIdentityStore.set(KEY_RECORD_ID, record);
  } else {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDENTITY_STORE, 'readwrite');
      const store = tx.objectStore(IDENTITY_STORE);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(new Error(`Failed to save identity: ${req.error?.message}`));
    });
  }

  return {
    identity: {
      kid: record.kid,
      alias: record.alias,
      fingerprint: record.fingerprint,
      createdAt: record.createdAt,
      publicKey: record.publicKeyJWK
    },
    keyPair
  };
}

/**
 * Loads the active identity from IndexedDB
 */
export async function loadActiveIdentity() {
  const db = await openDB();
  let record = null;

  if (!db) {
    record = memoryIdentityStore.get(KEY_RECORD_ID) || null;
  } else {
    record = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDENTITY_STORE, 'readonly');
      const store = tx.objectStore(IDENTITY_STORE);
      const req = store.get(KEY_RECORD_ID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(new Error(`Failed to load identity: ${req.error?.message}`));
    });
  }

  if (!record || !record.privateKey || !record.publicKey) {
    return null;
  }

  return {
    identity: {
      kid: record.kid,
      alias: record.alias,
      fingerprint: record.fingerprint,
      createdAt: record.createdAt,
      publicKey: record.publicKeyJWK
    },
    keyPair: {
      publicKey: record.publicKey,
      privateKey: record.privateKey
    }
  };
}

export async function clearActiveIdentity() {
  const db = await openDB();
  if (!db) {
    memoryIdentityStore.delete(KEY_RECORD_ID);
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDENTITY_STORE, 'readwrite');
    const store = tx.objectStore(IDENTITY_STORE);
    const req = store.delete(KEY_RECORD_ID);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error(`Failed to delete identity: ${req.error?.message}`));
  });
}

/* =========================================================================
   TRUSTED CONTACTS MANAGEMENT
   ========================================================================= */

/**
 * Imports and saves a peer's public key as a contact.
 * Default trust state is UNCONFIRMED (isTrusted = false).
 */
export async function saveContact({ name, publicKeyJWK, isTrusted = false }) {
  const validation = validatePublicKeyJWK(publicKeyJWK);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const fingerprint = await computeKeyFingerprint(publicKeyJWK);
  const cleanJWK = {
    kty: 'EC',
    crv: 'P-256',
    x: publicKeyJWK.x,
    y: publicKeyJWK.y,
    kid: publicKeyJWK.kid || `k_${fingerprint.replace(/:/g, '').slice(0, 8).toLowerCase()}`
  };

  const contact = {
    fingerprint,
    kid: cleanJWK.kid,
    name: name.trim() || 'Unnamed Contact',
    publicKeyJWK: cleanJWK,
    isTrusted: Boolean(isTrusted),
    createdAt: new Date().toISOString(),
    verifiedAt: isTrusted ? new Date().toISOString() : null
  };

  const db = await openDB();
  if (!db) {
    memoryContactsStore.set(fingerprint, contact);
    return contact;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONTACTS_STORE, 'readwrite');
    const store = tx.objectStore(CONTACTS_STORE);
    const req = store.put(contact);
    req.onsuccess = () => resolve(contact);
    req.onerror = () => reject(new Error(`Failed to save contact: ${req.error?.message}`));
  });
}

/**
 * Loads all saved contacts
 */
export async function getAllContacts() {
  const db = await openDB();
  if (!db) {
    return Array.from(memoryContactsStore.values());
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONTACTS_STORE, 'readonly');
    const store = tx.objectStore(CONTACTS_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(new Error(`Failed to retrieve contacts: ${req.error?.message}`));
  });
}

/**
 * Finds a contact by public-key fingerprint
 */
export async function getContactByFingerprint(fingerprint) {
  if (!fingerprint) return null;
  const contacts = await getAllContacts();
  return contacts.find(c => compareFingerprints(c.fingerprint, fingerprint)) || null;
}

/**
 * Finds a contact by key ID (kid) or public key coordinates
 */
export async function findContactByKeyOrKid(kid, jwk = null) {
  const contacts = await getAllContacts();
  
  // 1. Try matching by exact fingerprint if JWK provided
  if (jwk?.x && jwk?.y) {
    try {
      const fp = await computeKeyFingerprint(jwk);
      const match = contacts.find(c => compareFingerprints(c.fingerprint, fp));
      if (match) return match;
    } catch {
      // Continue to kid match
    }
  }

  // 2. Try matching by kid
  if (kid) {
    const match = contacts.find(c => c.kid === kid || c.publicKeyJWK?.kid === kid);
    if (match) return match;
  }

  return null;
}

/**
 * Updates trust verification status for a contact
 */
export async function setContactTrustStatus(fingerprint, isTrusted) {
  const contact = await getContactByFingerprint(fingerprint);
  if (!contact) {
    throw new Error(`Contact with fingerprint ${fingerprint} not found.`);
  }

  contact.isTrusted = Boolean(isTrusted);
  contact.verifiedAt = isTrusted ? new Date().toISOString() : null;

  const db = await openDB();
  if (!db) {
    memoryContactsStore.set(contact.fingerprint, contact);
    return contact;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONTACTS_STORE, 'readwrite');
    const store = tx.objectStore(CONTACTS_STORE);
    const req = store.put(contact);
    req.onsuccess = () => resolve(contact);
    req.onerror = () => reject(new Error(`Failed to update contact trust: ${req.error?.message}`));
  });
}

/**
 * Removes a contact from storage
 */
export async function removeContact(fingerprint) {
  const db = await openDB();
  if (!db) {
    memoryContactsStore.delete(fingerprint);
    return true;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONTACTS_STORE, 'readwrite');
    const store = tx.objectStore(CONTACTS_STORE);
    const req = store.delete(fingerprint);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(new Error(`Failed to delete contact: ${req.error?.message}`));
  });
}
