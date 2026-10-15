/**
 * Pretrained Phishing URL Detection Service
 * Model: pirocheto/phishing-url-detection (ONNX)
 * Type: LinearSVM with embedded string tokenizer / TF-IDF vectorizer
 * License: MIT
 */

import ort from 'onnxruntime-node';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODEL_PATH = path.join(__dirname, '../../models/model.onnx');

let inferenceSession = null;
let sessionInitPromise = null;

/**
 * Initializes and caches the ONNX inference session
 */
export async function getInferenceSession() {
  if (inferenceSession) return inferenceSession;

  if (sessionInitPromise) return sessionInitPromise;

  sessionInitPromise = (async () => {
    if (!fs.existsSync(MODEL_PATH)) {
      throw new Error(`ONNX model file not found at ${MODEL_PATH}`);
    }

    // Initialize session with CPU execution provider
    const session = await ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all'
    });

    inferenceSession = session;
    console.log('[AI Classifier] Pretrained Phishing-URL ONNX model loaded successfully.');
    return inferenceSession;
  })();

  return sessionInitPromise;
}

/**
 * Classifies a URL using the pretrained ONNX LinearSVM model
 * @param {string} url - The URL string to evaluate
 * @returns {Promise<{ isPhishing: boolean, phishingProbability: number, label: string, confidence: number, model: string }>}
 */
export async function classifyUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Valid URL string is required for classification.');
  }

  const session = await getInferenceSession();
  const trimmedUrl = url.trim();

  // Create input tensor (type string, shape [1])
  const inputTensor = new ort.Tensor('string', [trimmedUrl], [1]);

  // Run model inference
  const results = await session.run({ inputs: inputTensor });

  const labelData = results['label'].data;
  const probaData = results['probabilities'].data;

  const rawLabel = Number(labelData[0]);
  const isPhishing = rawLabel === 1;
  const phishingProbability = Number(probaData[1]); // Class 1 probability

  return {
    url: trimmedUrl,
    isPhishing,
    phishingProbability: Math.round(phishingProbability * 10000) / 10000,
    phishingPercent: Math.round(phishingProbability * 100),
    label: isPhishing ? 'Phishing' : 'Legitimate',
    model: 'pirocheto/phishing-url-detection (LinearSVM ONNX)'
  };
}
