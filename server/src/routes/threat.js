import express from 'express';
import { classifyUrl, getInferenceSession } from '../services/phishingClassifier.js';

const router = express.Router();

/**
 * GET /api/threat/info
 * Returns metadata about the pretrained phishing classification model
 */
router.get('/info', async (req, res) => {
  try {
    await getInferenceSession();
    res.json({
      status: 'ready',
      model: 'pirocheto/phishing-url-detection',
      format: 'ONNX (LinearSVM)',
      license: 'MIT',
      dataset: 'pirocheto/phishing-url',
      metrics: {
        accuracy: 0.9486,
        f1: 0.9486,
        roc_auc: 0.9868,
        precision: 0.9476,
        recall: 0.9496
      },
      inputFormat: 'tensor(string) [1] raw URL string'
    });
  } catch (err) {
    res.status(503).json({
      status: 'unavailable',
      error: err.message
    });
  }
});

/**
 * POST /api/threat/classify
 * Classifies a URL using the pretrained ONNX LinearSVM model
 * Body: { url: string }
 */
router.post('/classify', async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({
      error: 'A non-empty "url" string is required in the request body.'
    });
  }

  try {
    const classification = await classifyUrl(url.trim());
    res.json(classification);
  } catch (err) {
    console.error('[Threat Route] Classification error:', err);
    res.status(500).json({
      error: 'Model inference failed',
      details: err.message
    });
  }
});

export default router;
