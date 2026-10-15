import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, '../data/trustedIssuers.json');

const router = express.Router();

// Helper to read data file
function loadRegistry() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      return { issuers: [] };
    }
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load issuer registry:', err);
    return { issuers: [] };
  }
}

// Helper to write data file
function saveRegistry(data) {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save issuer registry:', err);
    return false;
  }
}

// Middleware to authenticate administrative actions
function requireAdminAuth(req, res, next) {
  const adminKey = req.headers['x-admin-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const expectedSecret = process.env.ADMIN_SECRET || 'secureqr-demo-admin-key-2026';
  
  if (!adminKey || adminKey !== expectedSecret) {
    return res.status(401).json({
      error: 'Unauthorized: Valid x-admin-key header required for administrative operations.'
    });
  }
  next();
}

/**
 * GET /api/issuers
 * Returns list of public trusted organizations
 */
router.get('/', (req, res) => {
  const registry = loadRegistry();
  const publicList = registry.issuers.map(iss => ({
    id: iss.id,
    name: iss.name,
    description: iss.description,
    website: iss.website,
    activeKeysCount: iss.keys?.filter(k => k.status === 'active').length || 0,
    revokedTokensCount: iss.revokedTokens?.length || 0
  }));
  res.json({ issuers: publicList });
});

/**
 * GET /api/issuers/:id/key
 * Resolves trusted public key for an issuer
 */
router.get('/:id/key', (req, res) => {
  const { id } = req.params;
  const { kid } = req.query;
  const registry = loadRegistry();
  
  const issuer = registry.issuers.find(iss => iss.id === id);
  if (!issuer) {
    return res.status(404).json({ error: `Issuer '${id}' not found in trusted registry.` });
  }

  let selectedKey = null;
  if (kid) {
    selectedKey = issuer.keys?.find(k => k.kid === kid);
  } else {
    // Default to first active key
    selectedKey = issuer.keys?.find(k => k.status === 'active');
  }

  if (!selectedKey) {
    return res.status(404).json({ error: `No active key found for issuer '${id}' (kid: ${kid || 'default'}).` });
  }

  if (issuer.revokedKeys?.includes(selectedKey.kid) || selectedKey.status === 'revoked') {
    return res.status(410).json({ 
      error: `Key '${selectedKey.kid}' for issuer '${id}' has been REVOKED.`,
      isRevoked: true
    });
  }

  res.json({
    issuerId: issuer.id,
    issuerName: issuer.name,
    key: {
      kid: selectedKey.kid,
      kty: selectedKey.kty,
      crv: selectedKey.crv,
      x: selectedKey.x,
      y: selectedKey.y
    }
  });
});

/**
 * GET /api/issuers/:id/revocations
 * Returns revocation list for single-use tokens and revoked keys
 */
router.get('/:id/revocations', (req, res) => {
  const { id } = req.params;
  const registry = loadRegistry();
  const issuer = registry.issuers.find(iss => iss.id === id);
  
  if (!issuer) {
    return res.status(404).json({ error: `Issuer '${id}' not found.` });
  }

  res.json({
    issuerId: issuer.id,
    revokedTokens: issuer.revokedTokens || [],
    revokedKeys: issuer.revokedKeys || []
  });
});

/**
 * POST /api/issuers/revoke
 * Protected administrative endpoint to revoke a token or key
 */
router.post('/revoke', requireAdminAuth, (req, res) => {
  const { issuerId, tokenId, keyId, reason } = req.body;
  if (!issuerId || (!tokenId && !keyId)) {
    return res.status(400).json({ error: 'issuerId and either tokenId or keyId are required.' });
  }

  const registry = loadRegistry();
  const issuer = registry.issuers.find(iss => iss.id === issuerId);
  if (!issuer) {
    return res.status(404).json({ error: `Issuer '${issuerId}' not found.` });
  }

  if (!issuer.revokedTokens) issuer.revokedTokens = [];
  if (!issuer.revokedKeys) issuer.revokedKeys = [];

  let message = '';
  if (tokenId && !issuer.revokedTokens.includes(tokenId)) {
    issuer.revokedTokens.push(tokenId);
    message += `Token '${tokenId}' revoked. `;
  }
  if (keyId && !issuer.revokedKeys.includes(keyId)) {
    issuer.revokedKeys.push(keyId);
    const keyObj = issuer.keys?.find(k => k.kid === keyId);
    if (keyObj) keyObj.status = 'revoked';
    message += `Key '${keyId}' revoked. `;
  }

  saveRegistry(registry);
  res.json({ success: true, message: message.trim(), reason: reason || 'Not specified' });
});

/**
 * POST /api/issuers/register
 * Protected administrative endpoint to register a new issuer
 */
router.post('/register', requireAdminAuth, (req, res) => {
  const { id, name, description, website, key } = req.body;
  if (!id || !name || !key || !key.kid) {
    return res.status(400).json({ error: 'id, name, and key with kid are required.' });
  }

  const registry = loadRegistry();
  let issuer = registry.issuers.find(iss => iss.id === id);

  if (issuer) {
    // Add key to existing issuer
    if (!issuer.keys) issuer.keys = [];
    const existingKey = issuer.keys.find(k => k.kid === key.kid);
    if (existingKey) {
      return res.status(409).json({ error: `Key with kid '${key.kid}' already exists for issuer '${id}'.` });
    }
    issuer.keys.push({ ...key, status: 'active', createdAt: new Date().toISOString() });
  } else {
    // Create new issuer
    issuer = {
      id,
      name,
      description: description || '',
      website: website || '',
      keys: [{ ...key, status: 'active', createdAt: new Date().toISOString() }],
      revokedTokens: [],
      revokedKeys: []
    };
    registry.issuers.push(issuer);
  }

  saveRegistry(registry);
  res.status(201).json({ success: true, issuer: { id: issuer.id, name: issuer.name, keyId: key.kid } });
});

export default router;
