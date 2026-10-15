# SecureQR — Cryptographic & AI-Driven QR Verification System

> **"Scan anything. Trust nothing blindly."**  
> *A Production-Grade Cryptography & AI Security Platform for Project-Based Learning (PBL).*

SecureQR is a modern, privacy-first QR verification and key exchange platform designed to defeat **Quishing (QR phishing)**, **physical sticker overlays**, **altered payloads**, and **MITM attacks**.

It decouples verification into **three independent trust layers** and features an **authenticated end-to-end encrypted (E2EE) LAN chat application** for out-of-band cryptographic public key exchange.

---

## 🏛️ System Architecture

```
                                      [ Scanned QR Code ]
                                               │
             ┌─────────────────────────────────┴─────────────────────────────────┐
             ▼                                                                   ▼
    [ Layer 1 & 2: Cryptographic Origin ]              [ Layer 3: AI & Heuristic Threat Engine ]
    • Universal Payload Inspection                     • Pretrained ONNX Phishing Classifier
    • ECDSA NIST P-256 Verification                    • Deterministic URL Heuristics
    • QDCF-v1 Canonical Hash Validation                • Punycode, Raw IP, Deceptive Subdomains
    • Expiry & Local Keystore Trust Check              • Zero-SSRF Client-Side Processing
             │                                                                   │
             └─────────────────────────────────┬─────────────────────────────────┘
                                               ▼
                              [ Decisive 7-State Security Verdict ]
               VALID_TRUSTED | VALID_UNTRUSTED | TAMPERED | EXPIRED | MALFORMED | UNSIGNED | SUSPICIOUS
```

### The Three Independent Trust Layers

1. **Layer 1: Universal Inspection & Safe Preview**  
   Safely decodes any standard QR code (URLs, plain text, Wi-Fi, vCards) without auto-opening links or executing scripts.
2. **Layer 2: Cryptographic Authenticity (ECDSA P-256)**  
   Verifies digital signatures against the local **Trusted Contacts Keystore** in IndexedDB using strict **QDCF-v1** canonical serialization. Detects altered bytes or expired passes.
3. **Layer 3: Threat Intelligence (Pretrained AI + Heuristics)**  
   - **Pretrained AI Classifier:** Runs `pirocheto/phishing-url-detection` using **ONNX Runtime Node** on the backend (`POST /api/threat/classify-url`).
   - **Deterministic Heuristics:** Client-side detection of raw IP hostnames, Punycode homograph attacks (`xn--...`), excessive subdomains, and credential-harvesting keywords.
   - **Independent Separation:** A valid signature never suppresses a phishing warning, and an unsigned status never labels a link malicious.

---

## 📡 Stage 2: Authenticated LAN Chat & Key Exchange (E2EE)

SecureQR solves the cryptographic bootstrap problem: **How do two devices securely exchange and trust public keys on the same Wi-Fi without a Certificate Authority?**

```
 [ Alice (Peer A) ]                                                     [ Bob (Peer B) ]
         │                                                                     │
         │─── 1. Ephemeral ECDH Key (Signed with Alice's ECDSA Private Key) ──>│  (Handshake Init)
         │<── 2. Ephemeral ECDH Key (Signed with Bob's ECDSA Private Key) ────│  (Handshake Ack)
         │                                                                     │
  [ HKDF-SHA-256 ]                                                      [ HKDF-SHA-256 ]
  Derived AES-256-GCM Key                                               Derived AES-256-GCM Key
  6-Digit Security Code (SAS)                                           6-Digit Security Code (SAS)
         │                                                                     │
         │<══ 3. AES-256-GCM Encrypted Chat (96-bit IV, 128-bit Tag, AAD) ══>│
         │                                                                     │
         │─── 4. Signed Public Key Announcement ("Share My Key") ─────────────>│
         │                                                           [ 1-Click Trust & Save ]
         │<── 5. End Chat (Zero-Knowledge Session Termination & RAM Purge) ───│
```

### Cryptographic Protocols Employed
- **Key Agreement:** Ephemeral **ECDH over NIST P-256** (RFC 5903). Ephemeral session keys are generated in RAM per connection and never reused.
- **MITM Protection:** Handshake packets are digitally signed using the user's persistent **ECDSA P-256** private key (`createHandshakePacket`), binding the session to their Key ID (`kid`).
- **Short Authentication String (SAS):** Derives a **6-digit visual security verification code** (e.g. `949092`) from the HKDF shared secret. Peers cross-verify this code on screen to detect active Man-In-The-Middle attacks.
- **Symmetric Encryption:** **AES-256-GCM** using the native Web Cryptography API (`crypto.subtle`) with fresh 96-bit random IVs and 128-bit authentication tags.
- **Replay Protection:** Monotonic sequence counters authenticated inside the AES-GCM Authenticated Additional Data (AAD). Stale or replayed packets are immediately rejected.
- **Persistent Connection:** Integrated via React Context (`LanProvider`) — connection stays alive in the background while navigating between Scanner, Create QR, and Trusted Contacts.
- **Forward Secrecy ("End Chat"):** One-click "End Chat" securely notifies the peer and purges ephemeral AES-256 keys from browser memory.

---

## 📁 Repository Structure

```
PBL-Crypto/
├── client/                     # Frontend Application (React 19 + Vite + Vitest)
│   ├── src/
│   │   ├── engine/
│   │   │   ├── cryptoSign.js          # ECDSA P-256 key generation, QDCF-v1 canonical signing
│   │   │   ├── cryptoVerify.js        # ECDSA P-256 signature verification & format parsing
│   │   │   ├── keystore.js            # IndexedDB non-extractable key management & fingerprinting
│   │   │   ├── lanCrypto.js           # ECDH P-256, HKDF-SHA-256, AES-256-GCM & SAS codes
│   │   │   ├── threatAnalyzer.js      # Heuristic URL threat engine & AI bridge
│   │   │   └── verificationPipeline.js# 7-State verification coordinator
│   │   ├── context/
│   │   │   └── LanContext.jsx         # Persistent background LAN WebSocket & state provider
│   │   ├── pages/
│   │   │   ├── Scanner.jsx            # Universal scanner (Camera, Image Upload, Paste)
│   │   │   ├── CreateSign.jsx         # Key management & signed QR generator
│   │   │   ├── TrustedContacts.jsx    # Contact keystore & fingerprint verifier
│   │   │   ├── LanChat.jsx            # E2EE LAN chat & 1-click key exchange
│   │   │   └── Home.jsx               # Security architecture overview
│   │   └── __tests__/                 # Vitest Automated Test Suite (50 Tests)
│   │       ├── stage1_crypto.test.js
│   │       ├── lan_crypto.test.js
│   │       ├── stage2_scanner_contacts.test.js
│   │       ├── ai_threat.test.js
│   │       └── verification.test.js
│   ├── package.json
│   └── vite.config.js                 # Proxy config for /api and /ws
│
├── server/                     # Backend API & WebSocket Relay (Node.js + Express)
│   ├── models/
│   │   └── model.onnx                 # Pretrained ONNX Phishing Classifier (pirocheto)
│   ├── src/
│   │   ├── routes/
│   │   │   └── threat.js              # POST /api/threat/classify-url & GET /info
│   │   ├── services/
│   │   │   ├── lanRelay.js            # Zero-knowledge WebSocket room relay (/ws)
│   │   │   └── phishingClassifier.js  # ONNX Runtime feature extraction & inference
│   │   └── server.js                  # Express + HTTP Server entrypoint (Port 4000)
│   └── package.json
│
├── scripts/                    # Cryptographic utilities & key generation
│   ├── generate_demo_qrs.js
│   └── keys/
│
├── .gitignore
├── package.json                # Root orchestrator scripts
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v18+ or v20+ / v22+
- **npm** v9+

### 1. Installation
Clone the repository and install all dependencies:
```bash
# Clone repository
git clone <YOUR_NEW_REPO_URL>
cd PBL-Crypto

# Install root, client, and server dependencies
npm run install:all
```

### 2. Run Automated Test Suite (50 Tests)
```bash
npm run test
```
*Executes all 50 automated Vitest unit tests verifying ECDSA signing, canonical QDCF-v1 serialization, 7-state pipeline, ONNX model classification, and LAN ECDH/AES-GCM encryption.*

### 3. Start the Backend Server (Port 4000)
```bash
npm run server
```
*Starts Express API, loads the ONNX Phishing Classifier into RAM, and starts the `/ws` zero-knowledge WebSocket relay.*

### 4. Start the Frontend Client (Port 5173)
```bash
npm run client
```
*Opens Vite development server on `http://localhost:5173`.*

> **To test LAN Chat on your local Wi-Fi with another device (phone/laptop):**  
> Run `npm run client -- --host` and visit `http://<YOUR_LOCAL_IP>:5173/lan` from your phone or second machine on the same Wi-Fi network.

---

## 🧪 Comprehensive Test Coverage (50/50 Tests Passing)

```
 ✓ src/__tests__/stage1_crypto.test.js (9 tests)
   • ECDSA P-256 key generation & non-extractable private keys
   • QDCF-v1 canonical format serialization & SHA-256 hashing
   • Valid signature creation & verification
   • Signature rejection on tampered content
   • Signature rejection on altered public key

 ✓ src/__tests__/lan_crypto.test.js (6 tests)
   • Ephemeral ECDH P-256 keypair generation
   • ECDSA-signed handshake packet generation & verification
   • Handshake rejection on modified or tampered payloads
   • Handshake rejection on expired packets
   • HKDF-SHA-256 session key derivation & matching 6-digit SAS codes
   • AES-256-GCM encryption, decryption & monotonic sequence replay rejection

 ✓ src/__tests__/ai_threat.test.js (9 tests)
   • 16-feature lexical & structural extraction
   • Real ONNX model inference on benign URLs (e.g. google.com)
   • Real ONNX model inference on deceptive URLs
   • Offline fallback behavior & API resilience

 ✓ src/__tests__/stage2_scanner_contacts.test.js (18 tests)
   • Complete 7-State Verification Pipeline (VALID_TRUSTED, VALID_UNTRUSTED, TAMPERED, EXPIRED, etc.)
   • Local IndexedDB trusted contacts handling & fingerprinting

 ✓ src/__tests__/verification.test.js (8 tests)
   • End-to-end QR payload verification workflows

Total: 50 passed across 5 test files
```

---

## 🎤 Viva & Project Defense Cheat Sheet

| Question | Winning Technical Answer |
|---|---|
| **"Why don't you use RSA?"** | *"ECDSA P-256 provides 128-bit security equivalent to RSA-3072 with a fraction of the key size (64 bytes vs 384 bytes). In QR codes, data density directly determines scanning distance and camera readability — ECDSA keeps the QR small, fast, and easy to scan."* |
| **"How does LAN Chat prevent Man-in-the-Middle (MITM) attacks?"** | *"1. Ephemeral ECDH keys are digitally signed with the sender's persistent ECDSA private key to prevent spoofing.<br>2. Derived session keys generate a 6-digit visual Short Authentication String (SAS). If an attacker sits in the middle, the derived HKDF keys on Alice's and Bob's screens will be mathematically different, exposing the attack immediately."* |
| **"Does the WebSocket server have access to message contents?"** | *"No. The relay server is strictly zero-knowledge. It only receives and routes JSON envelopes containing AES-256-GCM Base64 ciphertext, a 96-bit random IV, and a 128-bit GMAC authentication tag. The server has no private keys and cannot derive session keys."* |
| **"Why combine an AI classifier with heuristics?"** | *"Heuristics instantly catch known structural deceptions (raw IP hosts, Punycode lookalikes, credential keywords) with zero latency and zero false positives on known rules. The pretrained ONNX model catches novel patterns through statistical lexical feature distribution. Combining both gives defense-in-depth."* |
| **"Why keep Cryptographic Verification separate from AI Threat Status?"** | *"Because authenticity and safety answer different questions. A legitimate company could be compromised and point to a malicious endpoint, while a benign personal website might not be digitally signed. Collapsing them into a single score hides critical security context from the user."* |

---

## 📄 License
Academic & Educational Use Only • Built for Project-Based Learning (PBL) in Cryptography & Cybersecurity.
