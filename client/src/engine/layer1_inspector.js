/**
 * Layer 1: Universal QR Inspector
 * 
 * Works completely client-side for ANY QR code.
 * Safe preview without executing, clicking, or auto-opening links.
 */

export function inspectPayload(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      type: 'Empty',
      rawText: '',
      displayContent: '',
      isSignedJson: false,
      parsedJson: null
    };
  }

  const trimmed = rawText.trim();
  let isSignedJson = false;
  let parsedJson = null;

  // Check if payload is SecureQR formatted JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && (parsed.sig || parsed.signature) && (parsed.data || parsed.payload)) {
        isSignedJson = true;
        parsedJson = parsed;
      }
    } catch {
      // Not JSON, continue with raw text
    }
  }

  const contentToInspect = isSignedJson ? (parsedJson.data || parsedJson.payload) : trimmed;

  // Classify content type by prefix (Layer 1 scope)
  let type = 'Plain Text';
  if (/^https?:\/\//i.test(contentToInspect)) {
    type = 'URL';
  } else if (/^wifi:/i.test(contentToInspect)) {
    type = 'Wi-Fi Config';
  } else if (/^begin:vcard/i.test(contentToInspect)) {
    type = 'vCard Contact';
  } else if (/^upi:\/\//i.test(contentToInspect)) {
    type = 'UPI Payment';
  } else if (/^mailto:/i.test(contentToInspect)) {
    type = 'Email';
  } else if (/^tel:/i.test(contentToInspect)) {
    type = 'Phone Number';
  }

  return {
    type,
    rawText: trimmed,
    content: contentToInspect,
    isSignedJson,
    parsedJson
  };
}
