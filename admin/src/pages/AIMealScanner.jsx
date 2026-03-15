import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import { trackAIScanStarted, trackAIScanCompleted, trackAIScanSaved } from '../utils/analytics';
import './AIMealScanner.css';

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

function getDefaultMeal() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h < 17) return 'snacks';
  return 'dinner';
}

function compressImage(file, maxSize = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to compress image.'));
        },
        'image/jpeg',
        0.8
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image. Please try a different photo.'));
    };
    img.src = objectUrl;
  });
}

function fileToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const ANALYSING_MESSAGES = [
  'Identifying foods in your photo...',
  'Estimating portion sizes...',
  'Calculating macronutrients...',
  'Almost done, crunching the numbers...',
];

export default function AIMealScanner() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // State: 'idle' | 'preview' | 'analysing' | 'results' | 'saving'
  const [stage, setStage] = useState('idle');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [selectedMeal, setSelectedMeal] = useState(getDefaultMeal);
  const [toast, setToast] = useState(null);
  const [analysingMsg, setAnalysingMsg] = useState(0);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Rotate analysing messages
  useEffect(() => {
    if (stage !== 'analysing') return;
    setAnalysingMsg(0);
    const interval = setInterval(() => {
      setAnalysingMsg((i) => (i + 1) % ANALYSING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [stage]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setStage('preview');
    setResult(null);
    setError(null);
  };

  const handleAnalyse = async () => {
    if (!imageFile) return;
    setStage('analysing');
    setError(null);
    trackAIScanStarted();

    try {
      const compressed = await compressImage(imageFile, 1024);
      const base64 = await fileToBase64(compressed);
      const analyseMeal = httpsCallable(functions, 'analyseMeal');
      const response = await analyseMeal({ imageBase64: base64, mimeType: 'image/jpeg' });
      setResult(response.data);
      setStage('results');
      trackAIScanCompleted({ itemCount: response.data.items.length, confidence: response.data.confidence });
    } catch (err) {
      console.error('Analysis failed:', err);
      // Firebase callable errors: err.message contains the server message,
      // but for generic codes like "internal" it may just show the code.
      // err.details may contain extra info. Prefer the descriptive message.
      const msg = (err.message && err.message !== 'internal' && err.message !== 'INTERNAL')
        ? err.message
        : 'Failed to analyse meal. Please try again.';
      setError(msg);
      setStage('preview');
    }
  };

  const handleSave = async () => {
    if (!result || !clientData?.id) return;
    setStage('saving');

    try {
      const today = getTodayKey();

      // Upload photo to storage
      const imageId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const storageRef = ref(storage, `mealPhotos/${clientData.id}/${imageId}`);
      const compressed = await compressImage(imageFile, 800);
      await uploadBytes(storageRef, compressed);
      const photoUrl = await getDownloadURL(storageRef);

      // Build entries from AI result
      const newEntries = result.items.map((item) => ({
        name: item.name,
        protein: item.protein || 0,
        carbs: item.carbs || 0,
        fats: item.fats || 0,
        calories: item.calories || 0,
        serving: `${item.estimatedGrams || 0}g (AI estimate)`,
        mealType: selectedMeal,
        source: 'ai_scanner',
        aiConfidence: result.confidence,
        aiPhotoUrl: photoUrl,
      }));

      // Load existing log and merge
      const logRef = doc(db, 'nutritionLogs', `${clientData.id}_${today}`);
      const existingDoc = await getDoc(logRef);
      const existingEntries = existingDoc.exists() ? existingDoc.data().entries || [] : [];

      await setDoc(logRef, {
        clientId: clientData.id,
        date: today,
        entries: [...existingEntries, ...newEntries],
        updatedAt: Timestamp.now(),
      });

      trackAIScanSaved({ meal: selectedMeal, itemCount: newEntries.length });
      showToast(`${newEntries.length} item${newEntries.length > 1 ? 's' : ''} added to ${selectedMeal}`, 'success');

      // Reset for next scan
      setTimeout(() => {
        setStage('idle');
        setImageFile(null);
        setImagePreview(null);
        setResult(null);
      }, 1500);
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Failed to save. Please try again.', 'error');
      setStage('results');
    }
  };

  const handleReset = () => {
    setStage('idle');
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (authLoading) {
    return (
      <div className="ais-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => navigate('/client/core-buddy/nutrition')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          </div>
        </header>
        <div className="ais-loading"><div className="cb-loading-spinner" /></div>
      </div>
    );
  }

  return (
    <div className="ais-page">
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client/core-buddy/nutrition')} aria-label="Go back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          <div className="header-actions">
            <button onClick={toggleTheme} aria-label="Toggle theme">
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="ais-main">
        <div className="ais-heading">
          <h2>AI Food Scanner</h2>
          <span className="ais-beta-badge">BETA</span>
        </div>
        <p className="ais-subtitle">Take a photo of your meal and let AI estimate the macros</p>

        {/* ── IDLE: Upload prompt ── */}
        {stage === 'idle' && (
          <div className="ais-upload-section">
            <button className="ais-upload-btn" onClick={() => fileInputRef.current?.click()}>
              <div className="ais-upload-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <span className="ais-upload-text">Tap to take or upload a photo</span>
              <span className="ais-upload-hint">JPEG, PNG or WEBP</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {/* ── PREVIEW: Show image before analysis ── */}
        {stage === 'preview' && imagePreview && (
          <div className="ais-preview-section">
            <div className="ais-preview-img-wrap">
              <img src={imagePreview} alt="Meal preview" className="ais-preview-img" />
            </div>
            {error && (
              <div className="ais-error">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <span>{error}</span>
              </div>
            )}
            <div className="ais-preview-actions">
              <button className="ais-btn ais-btn-primary" onClick={handleAnalyse}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Analyse Meal
              </button>
              <button className="ais-btn ais-btn-secondary" onClick={handleReset}>Choose Different Photo</button>
            </div>
          </div>
        )}

        {/* ── ANALYSING: Loading state ── */}
        {stage === 'analysing' && (
          <div className="ais-analysing-section">
            <div className="ais-preview-img-wrap ais-preview-img-wrap--dim">
              <img src={imagePreview} alt="Analysing..." className="ais-preview-img" />
              <div className="ais-analysing-overlay">
                <div className="ais-analysing-spinner" />
              </div>
            </div>
            <p className="ais-analysing-msg">{ANALYSING_MESSAGES[analysingMsg]}</p>
          </div>
        )}

        {/* ── RESULTS: Show analysis ── */}
        {(stage === 'results' || stage === 'saving') && result && (
          <div className="ais-results-section">
            <div className="ais-preview-img-wrap ais-preview-img-wrap--small">
              <img src={imagePreview} alt="Meal" className="ais-preview-img" />
            </div>

            {/* Confidence badge */}
            <div className={`ais-confidence ais-confidence--${result.confidence}`}>
              {result.confidence === 'high' && 'High confidence'}
              {result.confidence === 'medium' && 'Medium confidence'}
              {result.confidence === 'low' && 'Low confidence — consider adjusting'}
            </div>

            {/* Totals card */}
            <div className="ais-totals-card">
              <div className="ais-total-item">
                <span className="ais-total-val">{result.totals.calories}</span>
                <span className="ais-total-label">Calories</span>
              </div>
              <div className="ais-total-item">
                <span className="ais-total-val">{result.totals.protein}g</span>
                <span className="ais-total-label">Protein</span>
              </div>
              <div className="ais-total-item">
                <span className="ais-total-val">{result.totals.carbs}g</span>
                <span className="ais-total-label">Carbs</span>
              </div>
              <div className="ais-total-item">
                <span className="ais-total-val">{result.totals.fats}g</span>
                <span className="ais-total-label">Fats</span>
              </div>
            </div>

            {/* Items breakdown */}
            <div className="ais-items-list">
              <h3>Items Detected</h3>
              {result.items.map((item, i) => (
                <div key={i} className="ais-item-row">
                  <div className="ais-item-info">
                    <span className="ais-item-name">{item.name}</span>
                    <span className="ais-item-serving">{item.estimatedGrams}g (estimate)</span>
                  </div>
                  <div className="ais-item-macros">
                    <span>{item.calories} cal</span>
                    <span>{item.protein}p</span>
                    <span>{item.carbs}c</span>
                    <span>{item.fats}f</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Meal type picker */}
            <div className="ais-meal-picker">
              <h3>Add to</h3>
              <div className="ais-meal-options">
                {MEALS.map((m) => (
                  <button
                    key={m.key}
                    className={`ais-meal-btn${selectedMeal === m.key ? ' ais-meal-btn--active' : ''}`}
                    onClick={() => setSelectedMeal(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="ais-result-actions">
              <button className="ais-btn ais-btn-primary" onClick={handleSave} disabled={stage === 'saving'}>
                {stage === 'saving' ? 'Saving...' : `Add to ${MEALS.find((m) => m.key === selectedMeal)?.label}`}
              </button>
              <button className="ais-btn ais-btn-secondary" onClick={handleReset} disabled={stage === 'saving'}>
                Scan Another Meal
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div className={`ais-toast ais-toast--${toast.type}`}>{toast.message}</div>
      )}

      <CoreBuddyNav active="nutrition" />
    </div>
  );
}
