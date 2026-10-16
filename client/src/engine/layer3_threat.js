/**
 * Layer 3: Threat Intelligence Engine
 * 
 * Strict Client-Side Heuristics (ZERO SSRF risk).
 * Evaluates deceptive patterns, Punycode, raw IP hosts, shorteners,
 * and phishing signals with balanced, explainable scoring.
 */

const KNOWN_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd',
  'buff.ly', 'cutt.ly', 'rebrand.ly', 'tiny.cc', 'bl.ink'
]);

const HIGH_RISK_TLDS = new Set([
  'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz', 'work', 'loan'
]);

import trustedIssuers from '../data/cachedTrustedIssuers.json';

// Domains users commonly trust; a near-miss spelling of any of these is a lookalike attack.
const PROTECTED_DOMAINS = [
  'google.com', 'paypal.com', 'apple.com', 'microsoft.com', 'amazon.com',
  'netflix.com', 'facebook.com', 'instagram.com', 'github.com', 'linkedin.com',
  'chase.com', 'whatsapp.com', 'dropbox.com'
];

// Characters attackers swap in for letters (0 -> o, 1 -> l, rn -> m, ...)
const CONFUSABLES = [
  [/rn/g, 'm'], [/vv/g, 'w'], [/0/g, 'o'], [/1/g, 'l'], [/3/g, 'e'],
  [/4/g, 'a'], [/5/g, 's'], [/7/g, 't'], [/\$/g, 's']
];

function registrableDomain(host) {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  // Keep two labels, or three for ccTLD style suffixes such as .co.uk / .edu.au
  const secondLevel = parts[parts.length - 2];
  const keep = ['co', 'com', 'edu', 'gov', 'org', 'net', 'ac'].includes(secondLevel) && parts[parts.length - 1].length === 2 ? 3 : 2;
  return parts.slice(-keep).join('.');
}

function normalizeConfusables(label) {
  return CONFUSABLES.reduce((acc, [re, to]) => acc.replace(re, to), label);
}

function trustedIssuerHosts() {
  const hosts = [];
  for (const issuer of trustedIssuers.issuers || []) {
    try { hosts.push(new URL(issuer.website).hostname.toLowerCase()); } catch { /* ignore */ }
  }
  return hosts;
}

/**
 * Detects hosts that imitate a protected domain via character swaps
 * (g00gle.com, paypa1.com, p0rtal.apex.edu). Returns the imitated host or null.
 */
function findLookalike(host) {
  const candidates = [
    ...PROTECTED_DOMAINS.map(d => ({ full: d, base: d })),
    ...trustedIssuerHosts().map(h => ({ full: h, base: registrableDomain(h) }))
  ];

  for (const { full, base } of candidates) {
    if (host === full || host === base || host.endsWith(`.${base}`) && normalizeConfusables(host) === host) continue;

    // Whole-host comparison (covers swaps in subdomains like p0rtal.apex.edu)
    const normHost = normalizeConfusables(host);
    if (host !== full && normHost === full) return full;

    // Registrable-domain comparison (covers www.g00gle.com)
    const reg = registrableDomain(host);
    if (reg !== base && normalizeConfusables(reg) === base) return base;
  }
  return null;
}

const BRAND_KEYWORDS = [
  'paypal', 'google', 'apple', 'microsoft', 'amazon', 'netflix', 'chase', 'bank'
];

/**
 * Queries the pretrained ONNX Phishing URL Detection model (pirocheto/phishing-url-detection)
 * via the backend inference service.
 * @param {string} url - The URL string to test
 * @returns {Promise<{ available: boolean, isPhishing?: boolean, phishingProbability?: number, phishingPercent?: number, label?: string, model?: string, error?: string }>}
 */
export async function classifyUrlWithAI(url) {
  if (!url || typeof url !== 'string') {
    return { available: false, error: 'Invalid URL input' };
  }

  // Build candidate endpoints (primary proxy route, followed by direct CORS fallbacks)
  const endpoints = [];
  if (typeof window !== 'undefined' && window.location?.origin) {
    endpoints.push('/api/threat/classify');
    endpoints.push('http://localhost:4000/api/threat/classify');
    endpoints.push('http://127.0.0.1:4000/api/threat/classify');
  } else {
    const base = (typeof process !== 'undefined' && process.env?.TEST_API_URL) || 'http://localhost:4000';
    endpoints.push(`${base}/api/threat/classify`);
  }

  let lastError = 'Threat classification service unreachable';

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // If the gateway/proxy returned 502, 503, or 504, try direct fallback
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        lastError = `Proxy gateway error (HTTP ${res.status})`;
        continue;
      }

      if (!res.ok) {
        return {
          available: false,
          model: 'pirocheto/phishing-url-detection (LinearSVM ONNX)',
          error: `Server responded with status ${res.status}`
        };
      }

      const data = await res.json();
      return {
        available: true,
        isPhishing: Boolean(data.isPhishing),
        phishingProbability: data.phishingProbability,
        phishingPercent: data.phishingPercent,
        label: data.label,
        model: data.model || 'pirocheto/phishing-url-detection (LinearSVM ONNX)'
      };
    } catch (err) {
      lastError = err.name === 'AbortError' ? 'Classification timed out' : err.message;
      // Proceed to next fallback endpoint
    }
  }

  // Genuine offline / unreachable fallback: never fabricate AI predictions
  return {
    available: false,
    model: 'pirocheto/phishing-url-detection (LinearSVM ONNX)',
    error: lastError
  };
}

/**
 * Synchronous client-side heuristic evaluation (Zero SSRF risk)
 */
export function analyzeThreat(inputContent) {
  if (!inputContent || typeof inputContent !== 'string') {
    return {
      riskLevel: 'Safe',
      score: 0,
      reasons: ['No active content to analyze.'],
      isUrl: false
    };
  }

  const trimmed = inputContent.trim();

  // Non-URL data check
  if (!/^https?:\/\//i.test(trimmed)) {
    // Check if dangerous non-http scheme
    if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
      return {
        riskLevel: 'Dangerous',
        score: 95,
        reasons: ['Blocked: Contains an executable or dangerous URI scheme (e.g. javascript/data).'],
        isUrl: true,
        url: trimmed
      };
    }

    return {
      riskLevel: 'Safe',
      score: 0,
      reasons: ['Content is plain text or structured data, not an external web link.'],
      isUrl: false,
      content: trimmed
    };
  }

  try {
    const parsed = new URL(trimmed);
    let score = 0;
    const reasons = [];
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    const search = parsed.search.toLowerCase();

    // 1. Protocol Check
    if (parsed.protocol === 'http:') {
      score += 15;
      reasons.push('Unencrypted HTTP connection (vulnerable to eavesdropping and interception).');
    }

    // 2. Raw IP Address Hostname Check (Demo 4 target)
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const isIpHost = ipv4Pattern.test(host) || host.startsWith('[') || host.endsWith(']');
    if (isIpHost) {
      score += 50;
      reasons.push('Destination uses a raw IP address instead of a legitimate domain name.');
    }

    // 3. Punycode / Internationalized Domain Name (Homograph attack)
    if (host.includes('xn--')) {
      score += 45;
      reasons.push('Uses Punycode encoding (often used to forge lookalike domain characters).');
    }

    // 3b. Lookalike domain (digit/letter swaps such as g00gle.com)
    if (!isIpHost) {
      const imitated = findLookalike(host);
      if (imitated) {
        score += 65;
        reasons.push(`Lookalike domain: '${host}' imitates '${imitated}' using swapped characters.`);
      }
    }

    // 4. URL Shortener Detection
    if (KNOWN_SHORTENERS.has(host)) {
      score += 25;
      reasons.push(`Uses URL shortener (${host}) which conceals the actual destination.`);
    }

    // 5. Deceptive Subdomain Impersonation Check
    // e.g. "paypal.com.evil-portal.net"
    const hostParts = host.split('.');
    if (hostParts.length > 3 && !isIpHost) {
      for (const brand of BRAND_KEYWORDS) {
        if (host.includes(brand) && !host.endsWith(`${brand}.com`)) {
          score += 35;
          reasons.push(`Subdomain structure attempts to mimic trusted brand '${brand}'.`);
          break;
        }
      }
    }

    // 6. Suspicious Phishing Keywords in Query or Path
    const suspiciousWords = ['login', 'verify', 'update', 'banking', 'credential', 'password', 'secure-login'];
    let foundKeyword = null;
    for (const word of suspiciousWords) {
      if (pathname.includes(word) || search.includes(word)) {
        foundKeyword = word;
        break;
      }
    }
    if (foundKeyword) {
      // If combined with HTTP or IP address, increase weight
      const weight = (parsed.protocol === 'http:' || isIpHost) ? 25 : 15;
      score += weight;
      reasons.push(`Contains credential-related keyword '${foundKeyword}' in URL path or parameters.`);
    }

    // 7. Non-standard Web Port Check
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      score += 15;
      reasons.push(`Uses non-standard web port (:${parsed.port}).`);
    }

    // 8. Softened TLD Rule (Low weight, never suspicious on its own)
    const tld = hostParts[hostParts.length - 1];
    if (HIGH_RISK_TLDS.has(tld)) {
      score += 10;
      reasons.push(`Registered under top-level domain (.${tld}) with elevated abuse history.`);
    }

    // Categorize final risk
    let riskLevel = 'Safe';
    if (score >= 65) {
      riskLevel = 'Dangerous';
    } else if (score >= 30) {
      riskLevel = 'Suspicious';
    }

    if (reasons.length === 0) {
      reasons.push('Standard HTTPS URL with no suspicious heuristic signals detected.');
    }

    return {
      riskLevel,
      score: Math.min(score, 100),
      reasons,
      isUrl: true,
      url: trimmed,
      host,
      protocol: parsed.protocol
    };

  } catch (err) {
    return {
      riskLevel: 'Suspicious',
      score: 40,
      reasons: ['Malformed URL structure: Failed RFC standard parsing.'],
      isUrl: true,
      url: inputContent
    };
  }
}

/**
 * Asynchronous threat analysis combining deterministic heuristics with
 * the pretrained ONNX Phishing URL Detection model (pirocheto/phishing-url-detection).
 * Gracefully falls back to heuristics if server inference is unreachable.
 * 
 * @param {string} inputContent 
 * @returns {Promise<ReturnType<typeof analyzeThreat> & { aiClassification: object | null }>}
 */
export async function analyzeThreatAsync(inputContent) {
  const heuristicResult = analyzeThreat(inputContent);

  // Non-URL or dangerous non-HTTP schemes return immediately
  if (!heuristicResult.isUrl || !heuristicResult.url || !/^https?:\/\//i.test(heuristicResult.url)) {
    return {
      ...heuristicResult,
      aiClassification: null
    };
  }

  // Query pretrained ONNX model
  const ai = await classifyUrlWithAI(heuristicResult.url);

  let finalScore = heuristicResult.score;
  const reasons = [...heuristicResult.reasons];

  if (ai.available) {
    if (ai.isPhishing) {
      // Model detected phishing
      reasons.push(
        `AI Model (pirocheto/phishing-url-detection): Flagged as Phishing (${ai.phishingPercent}% confidence).`
      );
      // Lift score to reflect high-confidence phishing
      const aiScore = Math.round((ai.phishingProbability || 0.9) * 100);
      finalScore = Math.max(finalScore, aiScore);
    } else {
      // Model evaluated as legitimate
      const legConfidence = 100 - (ai.phishingPercent || 0);
      reasons.push(
        `AI Model (pirocheto/phishing-url-detection): Evaluated as Legitimate (${legConfidence}% benign confidence).`
      );
    }
  } else {
    // Offline resilience: note fallback
    reasons.push(
      `AI Model: Pretrained model offline or unreachable (${ai.error || 'using local heuristics'}).`
    );
  }

  // Recalculate risk level based on combined score
  let riskLevel = 'Safe';
  if (finalScore >= 65) {
    riskLevel = 'Dangerous';
  } else if (finalScore >= 30) {
    riskLevel = 'Suspicious';
  }

  return {
    ...heuristicResult,
    score: Math.min(finalScore, 100),
    riskLevel,
    reasons,
    aiClassification: ai
  };
}

