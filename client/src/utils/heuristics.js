export function analyzeURL(urlStr) {
  try {
    const url = new URL(urlStr);
    let score = 0; // 0-100, higher is more dangerous
    let reasons = [];

    // Protocol check
    if (url.protocol !== "https:") {
      score += 40;
      reasons.push("Not using secure HTTPS protocol.");
    }

    // IP address instead of domain
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(url.hostname)) {
      score += 50;
      reasons.push("Hostname is an IP address instead of a domain name.");
    }

    // Suspicious keywords in hostname or path
    const suspiciousWords = ["login", "verify", "secure", "account", "update", "banking", "auth", "free", "admin"];
    const lowercaseHost = url.hostname.toLowerCase();
    const lowercasePath = url.pathname.toLowerCase();
    
    let foundSuspicious = false;
    for (let word of suspiciousWords) {
      if (lowercaseHost.includes(word) || lowercasePath.includes(word)) {
        foundSuspicious = true;
        break;
      }
    }
    
    if (foundSuspicious) {
      score += 30;
      reasons.push("Contains suspicious keywords often used in phishing (e.g. login, verify, secure).");
    }

    // Unusually long domain length
    if (url.hostname.length > 30) {
      score += 20;
      reasons.push("Unusually long domain name, commonly used to hide malicious intent.");
    }

    // Too many subdomains
    const parts = url.hostname.split(".");
    if (parts.length > 4) {
      score += 20;
      reasons.push("Contains multiple subdomains which is characteristic of some phishing URLs.");
    }

    // Determine risk category
    let riskLevel = "Safe";
    if (score > 70) {
      riskLevel = "Dangerous";
    } else if (score > 30) {
      riskLevel = "Suspicious";
    }

    return {
      score: Math.min(score, 100),
      riskLevel,
      reasons,
      url: urlStr,
      isUrl: true
    };
  } catch (error) {
    return {
      score: 0,
      riskLevel: "Safe",
      reasons: ["Data is plain text, not a clickable URL."],
      url: urlStr,
      isUrl: false
    };
  }
}
