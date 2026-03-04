import { useState, useRef, useCallback, useEffect } from 'react';

const SCAN_CONSENSUS = 3;
const SCAN_BUFFER_SIZE = 5;
const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const QUAGGA_READERS = ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader', 'code_128_reader', 'code_39_reader'];

export default function useBarcodeScanner({ onDetected, onError }) {
  const [scannerActive, setScannerActive] = useState(false);
  const [scanDetected, setScanDetected] = useState(null);

  const scannerTargetRef = useRef(null);
  const quaggaRef = useRef(null);
  const quaggaRunning = useRef(false);
  const scanBuffer = useRef([]);
  const nativeDetectorRef = useRef(null);
  const nativeAnimFrame = useRef(null);
  const nativeStreamRef = useRef(null);
  const initializingRef = useRef(false);

  const stopAllStreams = useCallback(() => {
    // Stop any native BarcodeDetector animation loop
    if (nativeAnimFrame.current) {
      cancelAnimationFrame(nativeAnimFrame.current);
      nativeAnimFrame.current = null;
    }
    // Stop native camera stream
    if (nativeStreamRef.current) {
      nativeStreamRef.current.getTracks().forEach(t => t.stop());
      nativeStreamRef.current = null;
    }
    // Stop Quagga
    const Quagga = quaggaRef.current;
    if (quaggaRunning.current && Quagga) {
      try {
        Quagga.offDetected();
        Quagga.offProcessed();
        Quagga.stop();
      } catch (e) { /* ignore */ }
      quaggaRunning.current = false;
    }
    // Fallback: stop any video stream in the target container
    if (scannerTargetRef.current) {
      const video = scannerTargetRef.current.querySelector('video');
      if (video?.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
    }
  }, []);

  const handleConsensus = useCallback((code) => {
    const buf = scanBuffer.current;
    buf.push(code);
    if (buf.length > SCAN_BUFFER_SIZE) buf.shift();
    const count = buf.filter(c => c === code).length;
    if (count >= SCAN_CONSENSUS) {
      scanBuffer.current = [];
      setScanDetected(code);
      return true;
    }
    return false;
  }, []);

  // ==================== NATIVE BARCODE DETECTOR ====================
  const startNativeScanner = useCallback(async (target) => {
    const detector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
    nativeDetectorRef.current = detector;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    nativeStreamRef.current = stream;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    target.innerHTML = '';
    target.appendChild(video);
    await video.play();

    // Create canvas overlay for visual feedback
    const canvas = document.createElement('canvas');
    canvas.className = 'nut-scanner-canvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    target.style.position = 'relative';
    target.appendChild(canvas);

    const ctx = canvas.getContext('2d');

    const detect = async () => {
      if (!nativeDetectorRef.current) return;
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barcodes = await detector.detect(video);
        for (const barcode of barcodes) {
          // Draw bounding box
          const { x, y, width, height } = barcode.boundingBox;
          ctx.strokeStyle = '#4caf50';
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, width, height);

          if (handleConsensus(barcode.rawValue)) {
            return; // Detected with consensus, stop scanning
          }
        }
      } catch (e) {
        // detect() can fail if video not ready yet
      }
      nativeAnimFrame.current = requestAnimationFrame(detect);
    };
    nativeAnimFrame.current = requestAnimationFrame(detect);
  }, [handleConsensus]);

  // ==================== QUAGGA2 FALLBACK ====================
  const startQuaggaScanner = useCallback(async (target) => {
    if (!quaggaRef.current) {
      try {
        const mod = await import('@ericblade/quagga2');
        quaggaRef.current = mod.default;
      } catch (e) {
        throw new Error('LOAD_FAILED');
      }
    }
    const Quagga = quaggaRef.current;

    // Clean up any prior listeners before re-registering
    Quagga.offDetected();
    Quagga.offProcessed();

    return new Promise((resolve, reject) => {
      Quagga.init({
        inputStream: {
          type: 'LiveStream',
          target,
          constraints: {
            facingMode: 'environment',
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 },
          },
        },
        locator: { patchSize: 'medium', halfSample: true },
        numOfWorkers: navigator.hardwareConcurrency || 2,
        decoder: { readers: QUAGGA_READERS },
        locate: true,
      }, (err) => {
        if (err) {
          reject(err);
          return;
        }
        Quagga.start();
        quaggaRunning.current = true;
        resolve();
      });

      // Visual feedback: draw detection boxes on processed frames
      Quagga.onProcessed((result) => {
        const drawingCtx = Quagga.canvas?.ctx?.overlay;
        const drawingCanvas = Quagga.canvas?.dom?.overlay;
        if (!drawingCtx || !drawingCanvas) return;

        // Clear previous drawings
        drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);

        if (result) {
          // Draw located barcode regions
          if (result.boxes) {
            result.boxes.filter(box => box !== result.box).forEach(box => {
              drawingCtx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
              drawingCtx.lineWidth = 2;
              Quagga.ImageDebug.drawPath(box, { x: 0, y: 1 }, drawingCtx, { color: 'rgba(0, 255, 0, 0.3)', lineWidth: 2 });
            });
          }
          // Draw the confirmed barcode box in green
          if (result.box) {
            Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, drawingCtx, { color: '#4caf50', lineWidth: 3 });
          }
          // Draw the scan line through the barcode
          if (result.codeResult && result.codeResult.code) {
            Quagga.ImageDebug.drawPath(result.line, { x: 'x', y: 'y' }, drawingCtx, { color: '#4caf50', lineWidth: 3 });
          }
        }
      });

      // Detection with confidence + consensus
      Quagga.onDetected((result) => {
        const errors = result.codeResult.decodedCodes
          ?.filter(d => d.error !== undefined)
          ?.map(d => d.error) || [];
        const avgError = errors.length > 0
          ? errors.reduce((a, b) => a + b, 0) / errors.length
          : 1;

        if (avgError < 0.15) {
          const code = result.codeResult.code;
          if (handleConsensus(code)) {
            Quagga.offDetected();
            Quagga.offProcessed();
          }
        }
      });
    });
  }, [handleConsensus]);

  // ==================== START (auto-selects best scanner) ====================
  const startScanner = useCallback(async () => {
    const target = scannerTargetRef.current;
    if (!target || initializingRef.current) return;

    initializingRef.current = true;
    setScannerActive(true);
    scanBuffer.current = [];

    try {
      // Try native BarcodeDetector first (Chrome/Edge Android — hardware accelerated, zero bundle)
      if ('BarcodeDetector' in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          if (supported.includes('ean_13')) {
            await startNativeScanner(target);
            initializingRef.current = false;
            return;
          }
        } catch (e) {
          // Native API not working, fall through to Quagga
        }
      }

      // Fallback to Quagga2
      await startQuaggaScanner(target);
    } catch (err) {
      setScannerActive(false);
      const msg = err?.message || err?.name || String(err);

      if (msg === 'LOAD_FAILED') {
        onError?.('Could not load scanner.');
      } else if (err?.name === 'NotAllowedError' || msg.includes('NotAllowedError') || msg.includes('Permission denied')) {
        onError?.('Camera access was denied. Please allow camera access in your browser settings and try again.');
      } else if (err?.name === 'NotFoundError' || msg.includes('NotFoundError') || msg.includes('Requested device not found')) {
        onError?.('No camera detected on this device. Try entering the barcode manually below.');
      } else if (err?.name === 'NotReadableError' || msg.includes('NotReadableError')) {
        onError?.('Camera is in use by another app. Close other apps using the camera and try again.');
      } else if (err?.name === 'OverconstrainedError' || msg.includes('OverconstrainedError')) {
        onError?.('Camera does not support the required settings. Try entering the barcode manually.');
      } else {
        onError?.('Could not access camera. Check permissions and try again.');
      }
    }
    initializingRef.current = false;
  }, [startNativeScanner, startQuaggaScanner, onError]);

  const stopScanner = useCallback(() => {
    stopAllStreams();
    setScannerActive(false);
    setScanDetected(null);
    initializingRef.current = false;
  }, [stopAllStreams]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllStreams();
    };
  }, [stopAllStreams]);

  return {
    scannerActive,
    scanDetected,
    setScanDetected,
    scannerTargetRef,
    startScanner,
    stopScanner,
  };
}
