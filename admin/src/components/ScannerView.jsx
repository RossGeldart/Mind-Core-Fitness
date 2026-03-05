import { useEffect } from 'react';

export default function ScannerView({
  scannerTargetRef,
  scannerActive,
  scanDetected,
  startScanner,
  manualBarcode,
  setManualBarcode,
  onManualLookup,
  barcodeLooking,
}) {
  // Auto-start scanner when component mounts
  useEffect(() => {
    if (!scannerActive && !scanDetected) {
      const timer = setTimeout(() => startScanner(), 300);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="nut-scan-area">
      <div className="nut-scanner-wrapper">
        <div ref={scannerTargetRef} className="nut-scanner-view" />
        {scannerActive && !scanDetected && <div className="nut-scan-line" />}
        {scanDetected && (
          <div className="nut-scan-detected-overlay">
            <svg className="nut-scan-detected-tick" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            <p className="nut-scan-detected-label">Barcode found!</p>
            <p className="nut-scan-detected-code">{scanDetected}</p>
          </div>
        )}
      </div>
      {!scannerActive && !scanDetected && (
        <button className="nut-scan-start-btn" onClick={startScanner}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
          Open Camera
        </button>
      )}
      {scannerActive && !scanDetected && <p className="nut-scan-hint">Align barcode within the frame</p>}

      <div className="nut-barcode-divider">
        <span>or enter barcode manually</span>
      </div>
      <div className="nut-barcode-manual">
        <input type="text" inputMode="numeric" value={manualBarcode}
          onChange={e => setManualBarcode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && manualBarcode.trim() && onManualLookup(manualBarcode.trim())}
          placeholder="Enter barcode number" />
        <button onClick={() => manualBarcode.trim() && onManualLookup(manualBarcode.trim())}
          disabled={!manualBarcode.trim() || barcodeLooking}>
          {barcodeLooking ? '...' : 'Look Up'}
        </button>
      </div>
      <p className="nut-off-credit">Food data powered by <a href="https://openfoodfacts.org" target="_blank" rel="noopener noreferrer">Open Food Facts</a></p>
    </div>
  );
}
