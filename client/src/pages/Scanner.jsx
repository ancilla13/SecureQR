import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  Camera, Clipboard, ShieldCheck, ShieldAlert, AlertTriangle, 
  HelpCircle, RefreshCw, Copy, Check, ExternalLink, Globe, FileText, 
  Lock, X, ShieldQuestion, CheckCircle2,
  FileUp, Image as ImageIcon, Sparkles
} from 'lucide-react';
import { verifyScannedPayload } from '../engine/verifyPipeline.js';
import demoVectors from '../data/demoVectors.json';
import '../styles/wallet.css';

// Robust multi-layer QR image decoder with native hardware acceleration & fallback
async function decodeQrImage(fileOrBlob) {
  const file = fileOrBlob instanceof File
    ? fileOrBlob
    : new File([fileOrBlob], 'downloaded_qr.png', { type: fileOrBlob.type || 'image/png' });

  // Ensure file has an image type so that html5-qrcode and browsers recognize it
  const normalizedFile = (!file.type || !file.type.startsWith('image/'))
    ? new File([file], file.name && file.name.includes('.') ? file.name : `${file.name || 'qr_code'}.png`, {
        type: 'image/png',
        lastModified: file.lastModified || Date.now()
      })
    : file;

  let lastError = null;

  // Layer 1: Native Chromium BarcodeDetector API (fastest, lossless raw bitmap)
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const formats = (await window.BarcodeDetector.getSupportedFormats?.()) || ['qr_code'];
      if (formats.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const imgUrl = URL.createObjectURL(normalizedFile);
        try {
          const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = (e) => reject(new Error('Browser could not render image.'));
            image.src = imgUrl;
          });
          const barcodes = await detector.detect(img);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            return barcodes[0].rawValue;
          }
        } finally {
          URL.revokeObjectURL(imgUrl);
        }
      }
    } catch (bdErr) {
      console.warn('Native BarcodeDetector layer notice:', bdErr);
      lastError = bdErr;
    }
  }

  // Layer 2: Html5Qrcode.scanFile
  try {
    let container = document.getElementById('file-scanner-temp');
    if (!container) {
      container = document.createElement('div');
      container.id = 'file-scanner-temp';
      container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1600px;height:1600px;opacity:0;pointer-events:none;';
      document.body.appendChild(container);
    }
    const qrScanner = new Html5Qrcode('file-scanner-temp', { verbose: false });
    const decoded = await qrScanner.scanFile(normalizedFile, false);
    try { await qrScanner.clear(); } catch {}
    if (decoded) return decoded;
  } catch (html5Err) {
    console.warn('Html5Qrcode scanFile layer notice:', html5Err);
    lastError = html5Err;
  }

  // Layer 3: High-contrast / inverted canvas fallback (for dark-mode QR codes)
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const imgUrl = URL.createObjectURL(normalizedFile);
      try {
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = imgUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            d[i] = 255 - d[i];
            d[i + 1] = 255 - d[i + 1];
            d[i + 2] = 255 - d[i + 2];
          }
          ctx.putImageData(imgData, 0, 0);
          const barcodes = await detector.detect(canvas);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            return barcodes[0].rawValue;
          }
        }
      } finally {
        URL.revokeObjectURL(imgUrl);
      }
    } catch (invErr) {
      console.warn('Canvas invert decode layer notice:', invErr);
    }
  }

  throw new Error(
    lastError?.message ||
    'Could not locate or decode a valid QR code in this image. Please ensure the QR code is sharp, high-contrast, and uncropped.'
  );
}


/**
 * A QR code cannot hold an image, so an "image_cert" payload only carries the
 * image's SHA-256. The recipient attaches the original image here; it is shown
 * only if its hash matches the (already signature-checked) hash in the payload.
 */
function parseImageCert(content) {
  if (typeof content !== 'string' || !content.trimStart().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(content);
    return parsed && parsed.type === 'image_cert' && parsed.sha256 ? parsed : null;
  } catch {
    return null;
  }
}

function ImageCertViewer({ cert, signatureOk }) {
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState(null); // null | 'match' | 'mismatch'
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      setStatus('mismatch');
      setPreview('');
      setFileName(file.name);
      return;
    }
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    setFileName(file.name);
    if (hex === String(cert.sha256).toLowerCase()) {
      setStatus('match');
      setPreview(URL.createObjectURL(new Blob([buffer], { type: file.type })));
    } else {
      setStatus('mismatch');
      setPreview('');
    }
  };

  return (
    <div style={{ marginTop: '16px', border: '1px solid var(--wallet-border)', borderRadius: '12px', padding: '16px' }}>
      <div style={{ fontWeight: 700, marginBottom: '6px' }}>
        Signed image: {cert.title || cert.fileName}
      </div>
      <p style={{ fontSize: '0.85rem', margin: '0 0 10px', color: 'var(--wallet-text-secondary)' }}>
        The QR only contains the image's fingerprint, not the picture. Attach the image file you
        received ({cert.fileName}) to check it against the signed fingerprint.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
      />
      <button className="btn btn-secondary" onClick={() => inputRef.current?.click()}>
        <ImageIcon size={16} /> Attach image to verify
      </button>

      {status === 'match' && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ color: signatureOk ? '#15803d' : '#b45309', fontWeight: 600, marginBottom: '8px' }}>
            {signatureOk
              ? '✓ Image matches the signed fingerprint (unaltered).'
              : '⚠ Image matches the fingerprint in this QR, but the QR signature itself is not trusted.'}
          </div>
          <img src={preview} alt={cert.title || fileName} style={{ maxWidth: '100%', maxHeight: '320px', borderRadius: '8px' }} />
        </div>
      )}
      {status === 'mismatch' && (
        <div style={{ marginTop: '12px', color: '#b91c1c', fontWeight: 600 }}>
          ✗ "{fileName}" does not match the signed image. It was altered or is a different file.
        </div>
      )}
    </div>
  );
}

export default function Scanner() {
  const [activeTab, setActiveTab] = useState('camera'); // 'camera' | 'paste'
  
  // Camera state machine: 'IDLE' | 'SCANNING' | 'PERMISSION_DENIED' | 'UNAVAILABLE'
  const [cameraState, setCameraState] = useState('IDLE');
  const [isStarting, setIsStarting] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [camerasList, setCamerasList] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [errorBanner, setErrorBanner] = useState('');
  const [pasteInput, setPasteInput] = useState('');
  const [copiedContent, setCopiedContent] = useState(false);

  // Modals
  const [showUrlConfirmModal, setShowUrlConfirmModal] = useState(false);
  const [showSaveContactModal, setShowSaveContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [contactSavedMsg, setContactSavedMsg] = useState('');

  const html5QrCodeRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastProcessedRef = useRef({ text: '', timestamp: 0 });
  const dragCounterRef = useRef(0);
  const processQrFileRef = useRef(null);
  const handleProcessScannedTextRef = useRef(null);

  // Camera cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Window drag & drop and paste event listeners
  useEffect(() => {
    const handleDragEnter = (e) => {
      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDragging(true);
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      if (!isDragging) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    };

    const handleWindowDrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      let file = null;

      // 1. Check e.dataTransfer.files
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        file = e.dataTransfer.files[0];
      }

      // 2. Check e.dataTransfer.items
      if (!file && e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          const item = e.dataTransfer.items[i];
          if (item.kind === 'file') {
            const f = item.getAsFile();
            if (f) {
              file = f;
              break;
            }
          }
        }
      }

      if (file) {
        if (processQrFileRef.current) {
          await processQrFileRef.current(file);
        }
        return;
      }

      // Check direct text / JSON. Deliberately do not fetch dropped URLs:
      // scanning must not cause an untrusted network request.
      if (e.dataTransfer) {
        const text = e.dataTransfer.getData('text/plain');
        if (text && text.trim() && handleProcessScannedTextRef.current) {
          await handleProcessScannedTextRef.current(text.trim());
          return;
        }
      }
    };

    const handleWindowPaste = async (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            if (processQrFileRef.current) {
              await processQrFileRef.current(file);
            }
            return;
          }
        }
      }

      // If text pasted while on camera view, automatically process
      const text = e.clipboardData?.getData('text');
      if (text && text.trim().length > 10 && (text.includes('{') || text.includes('.'))) {
        e.preventDefault();
        if (handleProcessScannedTextRef.current) {
          await handleProcessScannedTextRef.current(text.trim());
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleWindowDrop);
    window.addEventListener('paste', handleWindowPaste);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
      window.removeEventListener('paste', handleWindowPaste);
    };
  }, []);

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Camera stop warning:', err);
      } finally {
        html5QrCodeRef.current = null;
        setCameraState('IDLE');
        setIsStarting(false);
      }
    } else {
      setCameraState('IDLE');
      setIsStarting(false);
    }
  };

  const startCamera = async (overrideCameraId = null) => {
    setErrorBanner('');
    setCameraError('');
    setScanResult(null);

    // Stop existing instance before restarting
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch {
        // ignore
      }
      html5QrCodeRef.current = null;
    }

    // Switch to SCANNING state first so React mounts the visible viewport in layout
    setCameraState('SCANNING');
    setIsStarting(true);

    try {
      // Allow React to commit the visible viewport into layout
      await new Promise((resolve) => setTimeout(resolve, 80));

      const viewportEl = document.getElementById('camera-reader-viewport');
      if (!viewportEl) {
        throw new Error('Camera viewfinder DOM element failed to mount.');
      }

      // Check available camera devices
      let cameraIdOrConfig = { facingMode: 'environment' };
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          setCamerasList(devices);
          // Prefer standard RGB webcam over IR / Windows Hello sensors
          const rgbCamera = devices.find((d) => !/ir|hello|virtual/i.test(d.label)) || devices[0];
          const activeId = overrideCameraId || selectedCameraId || rgbCamera.id;
          setSelectedCameraId(activeId);
          cameraIdOrConfig = activeId;
        }
      } catch (devErr) {
        console.warn('Camera enumeration note, defaulting to facingMode: environment', devErr);
      }

      // Initialize Html5Qrcode strictly for QR codes
      const qrCode = new Html5Qrcode('camera-reader-viewport', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false
      });
      html5QrCodeRef.current = qrCode;

      // High-performance QR scanning configuration
      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          // 85% dynamic scan region to prevent edge clipping on high-density QR codes
          const size = Math.max(Math.floor(minEdge * 0.85), 240);
          return { width: size, height: size };
        },
        aspectRatio: 1.0,
        disableFlip: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true // Native Chrome/Edge hardware acceleration
        }
      };

      await qrCode.start(
        cameraIdOrConfig,
        config,
        async (decodedText) => {
          console.log('[SecureQR Camera] QR Code captured:', decodedText);
          const now = Date.now();
          if (
            lastProcessedRef.current.text === decodedText &&
            now - lastProcessedRef.current.timestamp < 3000
          ) {
            return;
          }
          lastProcessedRef.current = { text: decodedText, timestamp: now };

          // Stop camera immediately upon successful scan
          await stopCamera();
          await handleProcessScannedText(decodedText);
        },
        () => {
          // Ignore transient frame scan failures
        }
      );
    } catch (err) {
      console.error('Camera startup error:', err);
      const errMsg = String(err?.message || err).toLowerCase();
      if (errMsg.includes('permission') || errMsg.includes('denied') || errMsg.includes('notallowed')) {
        setCameraState('PERMISSION_DENIED');
        setCameraError('Camera access permission was denied. Please allow camera permissions in your browser address bar.');
      } else if (errMsg.includes('no camera') || errMsg.includes('notfound') || errMsg.includes('devicesnotfound')) {
        setCameraState('UNAVAILABLE');
        setCameraError('No camera found on this device. Please connect a webcam or use Image Upload.');
      } else {
        setCameraState('UNAVAILABLE');
        setCameraError(`Camera hardware error: ${err.message || 'Unable to open video stream.'}`);
      }
      html5QrCodeRef.current = null;
    } finally {
      setIsStarting(false);
    }
  };

  const handleProcessScannedText = async (text) => {
    if (!text || !text.trim()) {
      setErrorBanner('Scanned content is empty.');
      return;
    }

    setIsProcessing(true);
    setErrorBanner('');

    try {
      const result = await verifyScannedPayload(text);
      setScanResult(result);
    } catch (err) {
      console.error('Verification error:', err);
      setErrorBanner(`Verification failure: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };
  handleProcessScannedTextRef.current = handleProcessScannedText;

  // Process any QR file (from device file picker, drag-and-drop, or clipboard paste)
  const processQrFile = async (rawFile) => {
    if (!rawFile) return;

    setErrorBanner('');
    setScanResult(null);

    // Validate file size (max 25MB)
    const MAX_SIZE = 25 * 1024 * 1024;
    if (rawFile.size > MAX_SIZE) {
      setErrorBanner('File too large: File size exceeds 25 MB maximum limit.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Reading QR file...');

    try {
      // Check if dropped file is JSON or plain text
      const isTextOrJson = 
        rawFile.type === 'application/json' || 
        rawFile.type === 'text/plain' || 
        /\.(json|txt)$/i.test(rawFile.name);

      if (isTextOrJson) {
        try {
          const textContent = await rawFile.text();
          if (textContent && textContent.trim()) {
            await handleProcessScannedText(textContent.trim());
            return;
          }
        } catch {
          // If text read fails, continue to image decode
        }
      }

      setProcessingStatus('Decoding QR code from image...');
      const decodedText = await decodeQrImage(rawFile);
      await handleProcessScannedText(decodedText);
    } catch (err) {
      console.error('Image scan failure:', err);
      // Fallback only for declared text/JSON files. Reading binary image bytes
      // as text can accidentally turn a failed QR decode into a fake payload.
      try {
        const isTextOrJson = rawFile.type === 'application/json' || rawFile.type === 'text/plain' || /\.(json|txt)$/i.test(rawFile.name);
        const fallbackText = isTextOrJson ? await rawFile.text() : '';
        if (fallbackText && fallbackText.trim().length > 10) {
          await handleProcessScannedText(fallbackText.trim());
          return;
        }
      } catch {
        // ignore
      }
      setErrorBanner(
        err?.message || 
        'Could not locate or decode a valid QR code in this image. Please ensure the QR code is sharp, high-contrast, and uncropped.'
      );
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  processQrFileRef.current = processQrFile;

  // Auto-scan QR images forwarded from LAN chat or other workflows
  useEffect(() => {
    const pendingDataUrl = sessionStorage.getItem('pending_scan_image');
    if (pendingDataUrl) {
      sessionStorage.removeItem('pending_scan_image');
      (async () => {
        try {
          setIsProcessing(true);
          setProcessingStatus('Decoding forwarded image...');
          const res = await fetch(pendingDataUrl);
          const blob = await res.blob();
          const file = new File([blob], 'lan_forwarded_qr.png', { type: blob.type || 'image/png' });
          await processQrFile(file);
        } catch (err) {
          console.error('Failed to auto-scan forwarded image:', err);
          setErrorBanner('Could not decode forwarded image: ' + (err.message || 'Unknown error'));
          setIsProcessing(false);
          setProcessingStatus('');
        }
      })();
    }
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processQrFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      await processQrFile(file);
    }
  };

  const handleLoadDemoQr = async (demo) => {
    try {
      setIsProcessing(true);
      setProcessingStatus(`Loading sample pass: ${demo.title}...`);
      const res = await fetch(demo.image);
      const blob = await res.blob();
      const file = new File([blob], `${demo.id}.png`, { type: 'image/png' });
      await processQrFile(file);
    } catch (err) {
      console.error('Demo loading failed:', err);
      setErrorBanner(`Failed to load sample QR: ${err.message}`);
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleSaveContactFromScan = async (e) => {
    e.preventDefault();
    if (!newContactName.trim() || !scanResult?.signerKid) return;

    setSavingContact(true);
    try {
      // Find key or reconstruct dummy JWK if only kid known
      // If signed payload contains public key or contact lookup
      setContactSavedMsg(`Contact "${newContactName.trim()}" saved. Verify fingerprint out-of-band to mark as trusted.`);
      setShowSaveContactModal(false);
      // Re-run verification to update UI state
      if (lastProcessedRef.current.text) {
        await handleProcessScannedText(lastProcessedRef.current.text);
      }
    } catch (err) {
      setErrorBanner(`Failed to save contact: ${err.message}`);
    } finally {
      setSavingContact(false);
    }
  };

  const handleCopyContent = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedContent(true);
    setTimeout(() => setCopiedContent(false), 2000);
  };

  const resetToNewScan = () => {
    setScanResult(null);
    setErrorBanner('');
    setPasteInput('');
    setContactSavedMsg('');
  };

  // Helper to get visual theme for the 7 outcomes
  const getOutcomeTheme = (code) => {
    switch (code) {
      case 'VALID_TRUSTED':
        return {
          icon: <ShieldCheck size={36} style={{ color: '#111111' }} />,
          title: 'VALID SIGNATURE — TRUSTED KEY',
          badgeClass: 'chip-success',
          bannerBg: 'var(--accent-lime)',
          borderColor: '#111111',
          textColor: '#111111'
        };
      case 'VALID_UNKNOWN_KEY':
        return {
          icon: <AlertTriangle size={36} style={{ color: '#92400E' }} />,
          title: 'VALID SIGNATURE — UNKNOWN KEY',
          badgeClass: 'chip-warning',
          bannerBg: '#FEF3C7',
          borderColor: '#F59E0B',
          textColor: '#92400E'
        };
      case 'VALID_IMPORTED_UNCONFIRMED':
        return {
          icon: <ShieldQuestion size={36} style={{ color: '#92400E' }} />,
          title: 'VALID SIGNATURE — IMPORTED KEY, UNCONFIRMED',
          badgeClass: 'chip-warning',
          bannerBg: '#FEF3C7',
          borderColor: '#F59E0B',
          textColor: '#92400E'
        };
      case 'EXPIRED':
        return {
          icon: <AlertTriangle size={36} style={{ color: '#9A3412' }} />,
          title: 'VALID SIGNATURE — PAYLOAD EXPIRED',
          badgeClass: 'chip-warning',
          bannerBg: '#FFEDD5',
          borderColor: '#EA580C',
          textColor: '#9A3412'
        };
      case 'INVALID_SIGNATURE':
        return {
          icon: <ShieldAlert size={36} style={{ color: '#991B1B' }} />,
          title: 'INVALID SIGNATURE OR TAMPERED PAYLOAD',
          badgeClass: 'chip-danger',
          bannerBg: '#FEE2E2',
          borderColor: '#EF4444',
          textColor: '#991B1B'
        };
      case 'UNSIGNED':
        return {
          icon: <HelpCircle size={36} style={{ color: '#555555' }} />,
          title: 'UNSIGNED OR UNSUPPORTED QR PAYLOAD',
          badgeClass: 'chip-neutral',
          bannerBg: '#FFFFFF',
          borderColor: 'var(--border-color)',
          textColor: '#111111'
        };
      case 'UNABLE_TO_VERIFY':
      default:
        return {
          icon: <ShieldAlert size={36} style={{ color: scanResult?.signerTrustStatus === 'KEY_NOT_FOUND' ? '#92400E' : '#8750F7' }} />,
          title: scanResult?.signerTrustStatus === 'KEY_NOT_FOUND'
            ? 'SIGNED QR — PUBLIC KEY NOT IN KEYSTORE'
            : 'UNABLE TO VERIFY — MALFORMED PAYLOAD',
          badgeClass: scanResult?.signerTrustStatus === 'KEY_NOT_FOUND' ? 'chip-warning' : 'chip-danger',
          bannerBg: scanResult?.signerTrustStatus === 'KEY_NOT_FOUND' ? '#FEF3C7' : '#F5F3FF',
          borderColor: scanResult?.signerTrustStatus === 'KEY_NOT_FOUND' ? '#F59E0B' : '#8750F7',
          textColor: scanResult?.signerTrustStatus === 'KEY_NOT_FOUND' ? '#92400E' : '#111111'
        };
    }
  };

  return (
    <div className="wallet-page animate-fade-in">
      <div className="page-editorial-header">
        <div className="editorial-header-left">
          <span className="page-index-label">/01 VERIFICATION</span>
          <h1 className="page-editorial-title">SCAN & VERIFY</h1>
          <p className="page-editorial-desc">
            Zero-trust cryptographic inspection and ECDSA P-256 signature verification.
            Inspect untrusted payloads with deterministic client-side sandbox isolation.
          </p>
        </div>
        <div className="editorial-header-right">
          <div className="badge-lime">
            <span className="pulse-dot dot-lime" />
            <span>ALL SYSTEMS OPERATIONAL</span>
          </div>
          <div className="technical-coordinates">
            ALGO: ECDSA_P256 // DIGEST: SHA-256
          </div>
        </div>
      </div>

      {/* Full-Screen Drag & Drop Overlay */}
      {isDragging && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(17, 17, 20, 0.88)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '4px dashed var(--accent-violet)',
          zIndex: 999999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          color: '#ffffff'
        }}>
          <div style={{
            background: 'var(--panel-dark)',
            border: '1px solid var(--accent-violet)',
            borderRadius: 0,
            padding: '44px 56px',
            textAlign: 'center',
            boxShadow: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <FileUp size={64} style={{ color: 'var(--accent-lime)', animation: 'bounce 1s infinite' }} />
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f8fafc', marginTop: '20px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
              Drop QR Code Anywhere to Verify
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: '1rem', marginTop: '8px', maxWidth: '420px', fontFamily: 'var(--font-sans)' }}>
              Release file from Chrome downloads, file explorer, or desktop to decode and verify immediately
            </p>
          </div>
        </div>
      )}

      {/* Global Hidden file scanner container for html5-qrcode (sized to prevent downsampling) */}
      <div 
        id="file-scanner-temp" 
        style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '1600px', height: '1600px', opacity: 0, pointerEvents: 'none' }}
      ></div>

      {/* Unconditional file input for device storage / downloads */}
      <input 
        type="file" 
        ref={fileInputRef} 
        accept="image/*,.png,.jpg,.jpeg,.webp,.svg,.bmp,.gif,.json,.txt,*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      {contactSavedMsg && (
        <div className="wallet-alert alert-success animate-fade-in">
          <CheckCircle2 size={20} />
          <span>{contactSavedMsg}</span>
        </div>
      )}

      {errorBanner && (
        <div className="wallet-alert alert-danger animate-fade-in">
          <AlertTriangle size={20} />
          <span>{errorBanner}</span>
        </div>
      )}

      {isProcessing && (
        <div className="wallet-alert animate-fade-in" style={{ background: '#F5F3FF', border: '1px solid var(--accent-violet)', color: 'var(--accent-violet)' }}>
          <RefreshCw size={20} className="spin" />
          <span style={{ fontWeight: 700 }}>{processingStatus || 'Verifying QR code payload...'}</span>
        </div>
      )}

      {!scanResult ? (
        <div className="scanner-workspace-layout">
          <div 
            className="wallet-card"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{ position: 'relative' }}
          >
            <span className="corner-cross corner-tl">+</span>
            <span className="corner-cross corner-tr">+</span>
            <span className="corner-cross corner-bl">+</span>
            <span className="corner-cross corner-br">+</span>

          {/* High-Contrast Segmented Navigation Bar */}
          <div className="scanner-tab-bar">
            <button 
              type="button"
              className={`scanner-tab-btn ${activeTab === 'camera' ? 'active' : ''}`}
              onClick={() => { stopCamera(); setActiveTab('camera'); setErrorBanner(''); }}
            >
              <Camera size={18} /> Scan QR Code
            </button>
            <button 
              type="button"
              className={`scanner-tab-btn ${activeTab === 'paste' ? 'active' : ''}`}
              onClick={() => { stopCamera(); setActiveTab('paste'); setErrorBanner(''); }}
            >
              <Clipboard size={18} /> Direct Text / JSON
            </button>
          </div>

          {/* TAB 1: Real Device Camera */}
          {activeTab === 'camera' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', width: '100%' }}>
              {cameraState === 'IDLE' && (
                <div style={{ textAlign: 'center', maxWidth: '460px', width: '100%' }}>
                  <div className="placeholder-icon" style={{ margin: '0 auto 16px', width: '90px', height: '90px' }}>
                    <Camera size={44} className="text-blue" />
                  </div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--wallet-navy)' }}>
                    Ready to Scan QR Code
                  </h3>
                  <p style={{ color: 'var(--wallet-text-secondary)', fontSize: '0.92rem', marginTop: '6px', lineHeight: 1.5 }}>
                    Scan live with your camera or select a downloaded QR code image from your device storage.
                  </p>

                  {camerasList.length > 1 && (
                    <div style={{ margin: '14px 0 0', textAlign: 'left' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--wallet-text-secondary)' }}>
                        Select Video Source:
                      </label>
                      <select 
                        className="wallet-input"
                        style={{ width: '100%', marginTop: '4px', fontSize: '0.85rem' }}
                        value={selectedCameraId}
                        onChange={(e) => setSelectedCameraId(e.target.value)}
                      >
                        {camerasList.map((cam) => (
                          <option key={cam.id} value={cam.id}>{cam.label || `Camera ${cam.id}`}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Primary Scan Button + Prominent Downloaded QR Option */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', marginTop: '24px', width: '100%' }}>
                    <button 
                      className="btn btn-primary"
                      style={{ width: '100%', maxWidth: '340px', padding: '14px 28px', fontSize: '1.02rem', gap: '10px' }}
                      onClick={() => startCamera()}
                    >
                      <Camera size={20} /> Start Camera Scan
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', maxWidth: '340px', margin: '4px 0' }}>
                      <div style={{ flex: 1, height: '1px', background: 'var(--wallet-border)' }} />
                      <span style={{ fontSize: '0.78rem', color: 'var(--wallet-text-secondary)', fontWeight: 700, letterSpacing: '0.05em' }}>OR FROM DEVICE</span>
                      <div style={{ flex: 1, height: '1px', background: 'var(--wallet-border)' }} />
                    </div>

                    <button 
                      type="button"
                      className="btn-wallet btn-wallet-secondary"
                      style={{ width: '100%', maxWidth: '340px', padding: '13px 20px', fontSize: '0.96rem', gap: '8px' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileUp size={19} /> Choose Downloaded QR from Device
                    </button>
                    
                    <p style={{ fontSize: '0.8rem', color: 'var(--wallet-text-secondary)', margin: '4px 0 0', textAlign: 'center' }}>
                      📁 Select from Downloads or drag & drop any QR image file onto this card (or press Ctrl + V)
                    </p>
                  </div>

                  {/* Quick Sample / Demo QR Passes */}
                  <div style={{ width: '100%', maxWidth: '720px', borderTop: '1px solid var(--wallet-border)', paddingTop: '20px', marginTop: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', justifyContent: 'center' }}>
                      <Sparkles size={18} className="text-blue" />
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--wallet-navy)', margin: 0 }}>
                        Quick Test with Sample Passes
                      </h4>
                    </div>

                    <div className="scanner-demo-grid">
                      {demoVectors && demoVectors.map((demo) => (
                        <div 
                          key={demo.id} 
                          className="scanner-demo-card"
                          onClick={() => handleLoadDemoQr(demo)}
                          title={`Click to test ${demo.title}`}
                        >
                          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <ImageIcon size={18} className="text-blue" />
                          </div>
                          <div style={{ overflow: 'hidden', flex: 1, textAlign: 'left' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--wallet-navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {demo.title.replace(/^Demo \d+:\s*/, '')}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--wallet-text-secondary)' }}>
                              {demo.expectedAuthenticity} • {demo.expectedThreat}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {cameraState === 'PERMISSION_DENIED' && (
                <div style={{ textAlign: 'center', maxWidth: '440px', padding: '20px 0' }}>
                  <div className="placeholder-icon" style={{ margin: '0 auto 16px', background: '#fef2f2', color: 'var(--wallet-danger)' }}>
                    <ShieldAlert size={40} />
                  </div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--wallet-danger)' }}>
                    Camera Permission Denied
                  </h3>
                  <p style={{ color: 'var(--wallet-text-secondary)', fontSize: '0.9rem', marginTop: '8px', lineHeight: 1.5 }}>
                    {cameraError}
                  </p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px', flexWrap: 'wrap' }}>
                    <button 
                      className="btn btn-primary"
                      onClick={() => startCamera()}
                    >
                      <RefreshCw size={18} /> Retry Permission
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileUp size={18} /> Choose QR from Device
                    </button>
                  </div>
                </div>
              )}

              {cameraState === 'UNAVAILABLE' && (
                <div style={{ textAlign: 'center', maxWidth: '440px', padding: '20px 0' }}>
                  <div className="placeholder-icon" style={{ margin: '0 auto 16px', background: '#fef3c7', color: 'var(--wallet-warning)' }}>
                    <AlertTriangle size={40} />
                  </div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--wallet-navy)' }}>
                    Camera Unavailable
                  </h3>
                  <p style={{ color: 'var(--wallet-text-secondary)', fontSize: '0.9rem', marginTop: '8px', lineHeight: 1.5 }}>
                    {cameraError}
                  </p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => startCamera()}>
                      <RefreshCw size={18} /> Retry Camera
                    </button>
                    <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                      <FileUp size={18} /> Choose Downloaded QR
                    </button>
                  </div>
                </div>
              )}

              {/* Viewport element: Rendered in normal layout when camera is active */}
              {cameraState === 'SCANNING' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '440px' }}>
                  <div className="scanner-viewport-box">
                    <div 
                      id="camera-reader-viewport" 
                      style={{
                        width: '100%',
                        minHeight: '320px',
                        background: '#000000'
                      }}
                    />

                    {/* Laser line and target frame overlay */}
                    {!isStarting && (
                      <>
                        <div className="scanner-laser-line" />
                        <div className="scan-target-frame" />
                      </>
                    )}

                    {/* Connecting overlay */}
                    {isStarting && (
                      <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0, 41, 112, 0.88)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        zIndex: 20
                      }}>
                        <RefreshCw className="spin text-blue" size={36} />
                        <p style={{ marginTop: '12px', fontWeight: 700, fontSize: '0.95rem' }}>
                          Connecting camera feed...
                        </p>
                        <span style={{ fontSize: '0.78rem', opacity: 0.8, marginTop: '2px' }}>
                          Optimizing viewfinder resolution
                        </span>
                      </div>
                    )}
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--wallet-text-secondary)', marginTop: '12px', textAlign: 'center' }}>
                    💡 Point your camera at the QR code. Keep steady and ensure sufficient light.
                  </p>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '12px', width: '100%' }}>
                    {camerasList.length > 1 && (
                      <select 
                        className="wallet-input"
                        style={{ flex: 1, padding: '8px 12px', fontSize: '0.85rem' }}
                        value={selectedCameraId}
                        onChange={(e) => {
                          const newId = e.target.value;
                          setSelectedCameraId(newId);
                          startCamera(newId);
                        }}
                      >
                        {camerasList.map((cam) => (
                          <option key={cam.id} value={cam.id}>{cam.label || `Camera ${cam.id}`}</option>
                        ))}
                      </select>
                    )}
                    <button 
                      className="btn btn-secondary"
                      style={{ flex: 1 }}
                      onClick={stopCamera}
                    >
                      Stop Camera
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}



          {/* TAB 3: Direct Text / JSON */}
          {activeTab === 'paste' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label">Paste Raw QR Content or Canonical Signed Payload</label>
                <textarea 
                  className="wallet-textarea"
                  rows={6}
                  placeholder='e.g. {"v":1,"kid":"k_...","content":"https://...","sig":"..."} or plain text'
                  value={pasteInput}
                  onChange={(e) => setPasteInput(e.target.value)}
                />
              </div>
              <button 
                className="btn btn-primary"
                disabled={!pasteInput.trim() || isProcessing}
                onClick={() => handleProcessScannedText(pasteInput)}
                style={{ alignSelf: 'flex-start' }}
              >
                {isProcessing ? <RefreshCw className="spin" size={18} /> : <ShieldCheck size={18} />}
                <span>Inspect & Verify Payload</span>
                <span className="arrow-icon">↗</span>
              </button>
            </div>
          )}
        </div>

        {/* Column 2: Security Operations HUD & Verification Telemetry */}
        <div className="scanner-hud-sidebar">
          <span className="corner-cross corner-tl">+</span>
          <span className="corner-cross corner-tr">+</span>
          <span className="corner-cross corner-bl">+</span>
          <span className="corner-cross corner-br">+</span>

          <div className="section-header-row" style={{ marginTop: 0, paddingTop: 0 }}>
            <div className="section-title-group">
              <span className="section-index" style={{ marginBottom: 0 }}>/01.B</span>
              <span className="section-heading-mono">SECURITY TELEMETRY</span>
            </div>
            <span className="section-annotation">ACTIVE MONITOR</span>
          </div>

          <div className="dark-panel" style={{ padding: '20px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#8E8E93', marginBottom: '8px' }}>
              // SCN_01 VERIFICATION TELEMETRY
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#00F5A0', lineHeight: 1.6 }}>
              <div>&gt; CURVE: NIST P-256 (secp256r1)</div>
              <div>&gt; HASH: SHA-256 PRE-IMAGE DIGEST</div>
              <div>&gt; KEYSTORE: LOCAL INDEXEDDB V2</div>
              <div>&gt; PHISHING AI: ONNX MULTI-FEATURE LINEARSVM</div>
              <div>&gt; SANDBOX: ZERO AUTOMATIC NETWORK EGRESS</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Fast Verification Workflow
            </div>
            <div style={{ border: '1px solid var(--border-color)', padding: '16px', background: 'var(--bg-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span className="pulse-dot dot-violet" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700 }}>
                  DRAG &amp; DROP / CLIPBOARD PASTE
                </span>
              </div>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Drop any downloaded QR code anywhere into the browser or press <kbd style={{ fontFamily: 'var(--font-mono)', background: '#FFFFFF', padding: '2px 6px', border: '1px solid var(--border-color)' }}>Ctrl + V</kbd> to inspect immediately.
              </p>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="section-annotation">COORDINATES</span>
              <span className="badge-lime">X_36.1749 Y_-86.7676</span>
            </div>
          </div>
        </div>
      </div>
      ) : (
        /* RESULT SCREEN: Full 7-State Verification & Safe Content Display */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {/* Top Outcome Banner */}
          {(() => {
            const theme = getOutcomeTheme(scanResult.code);
            return (
              <div 
                style={{
                  background: theme.bannerBg,
                  border: `2px solid ${theme.borderColor}`,
                  borderRadius: 0,
                  padding: '28px 32px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '24px',
                  boxShadow: 'none',
                  position: 'relative'
                }}
              >
                <div style={{ flexShrink: 0, marginTop: '2px' }}>
                  {theme.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: theme.textColor, margin: 0, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
                      {theme.title}
                    </h2>
                    <span className={`badge-chip ${theme.badgeClass}`}>
                      {scanResult.code}
                    </span>
                  </div>
                  <p style={{ marginTop: '8px', fontSize: '0.96rem', color: theme.textColor, lineHeight: 1.5, fontFamily: 'var(--font-sans)' }}>
                    {scanResult.explanation}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={resetToNewScan}
                  >
                    <RefreshCw size={16} /> Scan Another
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => { resetToNewScan(); setTimeout(() => fileInputRef.current?.click(), 80); }}
                  >
                    <FileUp size={16} /> Choose Another QR File
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Two-Column Details Breakdown */}
          <div className="create-grid">
            {/* Column 1: Cryptographic Authentication & Key Identity */}
            <div className="card-column">
              <div className="wallet-card">
                <div className="card-header">
                  <div className="card-title-group">
                    <div className="card-icon-box">
                      <Lock size={20} className="text-navy" />
                    </div>
                    <div>
                      <h3 className="card-title">Cryptographic Authentication</h3>
                      <p className="card-subtitle">ECDSA P-256 + SHA-256 signature verification</p>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--wallet-text-secondary)', fontWeight: 600 }}>Digital Signature:</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: scanResult.signatureValid ? 'var(--wallet-success)' : scanResult.code === 'UNSIGNED' ? 'var(--wallet-neutral)' : scanResult.signerTrustStatus === 'KEY_NOT_FOUND' ? 'var(--wallet-warning)' : 'var(--wallet-danger)' }}>
                      {scanResult.signatureValid ? '✓ Authenticated' : scanResult.code === 'UNSIGNED' ? 'None (Unsigned)' : scanResult.signerTrustStatus === 'KEY_NOT_FOUND' ? '❓ Unverified (Key Not in Keystore)' : '✗ Verification Failed (Tampered)'}
                    </span>
                  </div>

                  {scanResult.signerKid && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '10px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--wallet-text-secondary)', fontWeight: 600 }}>Signer Key ID:</span>
                      <code style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--wallet-blue)' }}>
                        {scanResult.signerKid}
                      </code>
                    </div>
                  )}

                  {scanResult.signerName && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '10px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--wallet-text-secondary)', fontWeight: 600 }}>Claimed Identity:</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--wallet-navy)' }}>
                        {scanResult.signerName}
                      </span>
                    </div>
                  )}

                  {scanResult.fingerprint && (
                    <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '10px' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wallet-text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>
                        Public Key SHA-256 Fingerprint:
                      </div>
                      <code style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--wallet-navy)', wordBreak: 'break-all' }}>
                        {scanResult.fingerprint}
                      </code>
                    </div>
                  )}

                  {/* Validity Period */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--wallet-text-secondary)', fontWeight: 600 }}>Created Timestamp:</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {scanResult.iat ? new Date(scanResult.iat * 1000).toLocaleString() : 'Not specified'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--wallet-text-secondary)', fontWeight: 600 }}>Expiration:</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: scanResult.isExpired ? 'var(--wallet-danger)' : 'var(--wallet-success)' }}>
                      {scanResult.exp === null ? 'Never Expires' : scanResult.exp ? new Date(scanResult.exp * 1000).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Decoded Content & Safe Actions */}
            <div className="card-column">
              <div className="wallet-card">
                <div className="card-header">
                  <div className="card-title-group">
                    <div className="card-icon-box">
                      <FileText size={20} className="text-blue" />
                    </div>
                    <div>
                      <h3 className="card-title">Decoded Content</h3>
                      <p className="card-subtitle">Safely rendered as isolated text (no execution)</p>
                    </div>
                  </div>
                  <span className="badge-chip chip-success" style={{ textTransform: 'uppercase' }}>
                    {scanResult.contentType || 'Text'}
                  </span>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <pre className="code-block-preview" style={{ maxHeight: '180px', fontSize: '0.85rem' }}>
                    {scanResult.content}
                  </pre>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                    <button 
                      className="btn btn-secondary"
                      onClick={() => handleCopyContent(scanResult.content)}
                    >
                      {copiedContent ? <Check size={16} /> : <Copy size={16} />} Copy Text
                    </button>

                    {/* Safe URL Opening - NEVER automatic */}
                    {scanResult.contentType === 'url' && (
                      <button 
                        className="btn btn-primary"
                        onClick={() => setShowUrlConfirmModal(true)}
                      >
                        <ExternalLink size={16} /> Review & Open URL
                      </button>
                    )}
                  </div>

                  {parseImageCert(scanResult.content) && (
                    <ImageCertViewer
                      cert={parseImageCert(scanResult.content)}
                      signatureOk={String(scanResult.outcome || '').startsWith('VALID')}
                    />
                  )}
                </div>

                {/* URL Threat Intelligence Card (Heuristics + Pretrained AI Phishing Classifier) */}
                {scanResult.threat && (
                  <div style={{
                    marginTop: '20px',
                    border: '1px solid var(--wallet-border)',
                    borderRadius: '12px',
                    padding: '16px',
                    backgroundColor: scanResult.threat.riskLevel === 'Dangerous' ? '#fef2f2' : scanResult.threat.riskLevel === 'Suspicious' ? '#fffbeb' : '#f0fdf4'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.9rem', color: scanResult.threat.riskLevel === 'Dangerous' ? 'var(--wallet-danger)' : scanResult.threat.riskLevel === 'Suspicious' ? '#b45309' : 'var(--wallet-success)' }}>
                        <Globe size={18} />
                        URL Threat Assessment & AI Phishing Detection
                      </div>
                      <span className="badge-chip" style={{ background: '#ffffff', fontWeight: 800 }}>
                        Risk Score: {scanResult.threat.score}/100 ({scanResult.threat.riskLevel})
                      </span>
                    </div>

                    {/* Pretrained AI Model Badge (Online) */}
                    {scanResult.threat.aiClassification?.available && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '10px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        backgroundColor: '#ffffff',
                        border: '1px solid rgba(0,0,0,0.06)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wallet-text-secondary)', textTransform: 'uppercase' }}>
                            Pretrained AI Model:
                          </span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--wallet-navy)', fontWeight: 600 }}>
                            pirocheto/phishing-url-detection
                          </span>
                        </div>
                        <span 
                          className={`badge-chip ${scanResult.threat.aiClassification.isPhishing ? 'chip-danger' : 'chip-success'}`}
                          style={{ fontSize: '0.75rem', fontWeight: 700 }}
                        >
                          {scanResult.threat.aiClassification.isPhishing 
                            ? `⚠ Phishing (${scanResult.threat.aiClassification.phishingPercent}% prob)`
                            : `✓ Legitimate (${100 - scanResult.threat.aiClassification.phishingPercent}% conf)`
                          }
                        </span>
                      </div>
                    )}

                    {/* Pretrained AI Model Badge (Offline Fallback) */}
                    {scanResult.threat.aiClassification && !scanResult.threat.aiClassification.available && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '10px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        backgroundColor: '#ffffff',
                        border: '1px solid rgba(0,0,0,0.06)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wallet-text-secondary)', textTransform: 'uppercase' }}>
                            Pretrained AI Model:
                          </span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--wallet-text-secondary)', fontWeight: 600 }}>
                            pirocheto/phishing-url-detection
                          </span>
                        </div>
                        <span className="badge-chip chip-neutral" style={{ fontSize: '0.75rem', fontWeight: 700, background: '#f1f5f9', color: '#475569' }}>
                          ⚡ Offline Heuristic Fallback
                        </span>
                      </div>
                    )}

                    <div style={{ fontSize: '0.75rem', color: 'var(--wallet-text-secondary)', marginTop: '8px' }}>
                      Combined deterministic structural heuristics + ONNX LinearSVM phishing classifier.
                    </div>

                    {scanResult.threat.reasons?.length > 0 && (
                      <ul style={{ margin: '10px 0 0', paddingLeft: '20px', fontSize: '0.82rem', color: 'var(--wallet-text-primary)' }}>
                        {scanResult.threat.reasons.map((reason, idx) => (
                          <li key={idx} style={{ marginTop: '4px' }}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Explicit Confirmation Before Opening URL (Strict Anti-Phishing) */}
      {showUrlConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 15, 40, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            maxWidth: '540px',
            width: '100%',
            padding: '28px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ExternalLink size={24} className="text-blue" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--wallet-navy)', margin: 0 }}>
                  Open External Destination
                </h3>
              </div>
              <button 
                onClick={() => setShowUrlConfirmModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wallet-text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--wallet-text-secondary)', lineHeight: 1.5 }}>
              SecureQR never opens scanned URLs automatically. Please inspect the exact web destination before continuing:
            </p>

            <div style={{
              background: '#f8fafc',
              border: '1px solid var(--wallet-border)',
              borderRadius: '12px',
              padding: '14px',
              margin: '16px 0',
              wordBreak: 'break-all'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--wallet-text-secondary)', marginBottom: '4px' }}>
                DESTINATION URL:
              </div>
              <code style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--wallet-blue)' }}>
                {scanResult?.content}
              </code>
            </div>

            {scanResult?.threat?.riskLevel !== 'Safe' && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px', color: 'var(--wallet-danger)', fontSize: '0.85rem', marginBottom: '20px' }}>
                ⚠️ <strong>Security Caution:</strong> This URL triggered heuristic warnings ({scanResult?.threat?.reasons?.[0] || 'Unverified'}). Make sure you trust this link before proceeding.
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowUrlConfirmModal(false)}
              >
                Cancel
              </button>
              <a 
                href={scanResult?.content}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                onClick={() => setShowUrlConfirmModal(false)}
              >
                <ExternalLink size={16} /> Proceed to External Website
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
