export async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["sign", "verify"]
  );
  return keyPair;
}

export async function exportPublicKey(key) {
  const exported = await window.crypto.subtle.exportKey("jwk", key);
  return exported;
}

export async function exportPrivateKey(key) {
  const exported = await window.crypto.subtle.exportKey("jwk", key);
  return exported;
}

export async function importPublicKey(jwk) {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    true,
    ["verify"]
  );
}

export async function signData(privateKey, dataString) {
  const enc = new TextEncoder();
  const encoded = enc.encode(dataString);

  // Sign data
  const signature = await window.crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" },
    },
    privateKey,
    encoded
  );

  // Convert ArrayBuffer to Base64 to make it easy to store in QR
  const signatureBytes = new Uint8Array(signature);
  let binaryString = "";
  for (let i = 0; i < signatureBytes.byteLength; i++) {
    binaryString += String.fromCharCode(signatureBytes[i]);
  }
  return btoa(binaryString);
}

export async function verifySignature(publicKey, dataString, signatureBase64) {
  const enc = new TextEncoder();
  const encoded = enc.encode(dataString);
  
  const binaryString = atob(signatureBase64);
  const signatureBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    signatureBytes[i] = binaryString.charCodeAt(i);
  }

  const result = await window.crypto.subtle.verify(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" },
    },
    publicKey,
    signatureBytes,
    encoded
  );
  
  return result;
}
