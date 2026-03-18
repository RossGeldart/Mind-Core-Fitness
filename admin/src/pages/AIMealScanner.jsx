import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import { trackAIScanStarted, trackAIScanCompleted, trackAIScanSaved } from '../utils/analytics';
import './AIMealScanner.css';

const MAX_SAVED_MEALS = 20;
const DAILY_SCAN_LIMIT = 10;

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

const MEALS = [
  { key: 'breakfast', label: 'Breakfast', icon: '\u2615' },
  { key: 'lunch', label: 'Lunch', icon: '\uD83C\uDF5C' },
  { key: 'dinner', label: 'Dinner', icon: '\uD83C\uDF7D\uFE0F' },
  { key: 'snacks', label: 'Snacks', icon: '\uD83C\uDF4E' },
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
  const [savedMeals, setSavedMeals] = useState([]);
  const [savedMealsLoaded, setSavedMealsLoaded] = useState(false);
  const [scansUsedToday, setScansUsedToday] = useState(0);
  const [scansLoaded, setScansLoaded] = useState(false);
  const [recentFilter, setRecentFilter] = useState('all');

  const scansRemaining = DAILY_SCAN_LIMIT - scansUsedToday;
  const scanLimitReached = scansRemaining <= 0;

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load saved meals + today's scan count
  useEffect(() => {
    if (!clientData?.id) return;

    // Load saved meals
    getDoc(doc(db, 'savedMeals', clientData.id)).then((snap) => {
      if (snap.exists()) {
        const meals = snap.data().meals || [];
        setSavedMeals(meals.sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0)));
      }
      setSavedMealsLoaded(true);
    }).catch(() => setSavedMealsLoaded(true));

    // Load today's scan usage
    const today = getTodayKey();
    getDoc(doc(db, 'scanUsage', `${clientData.id}_${today}`)).then((snap) => {
      if (snap.exists()) {
        setScansUsedToday(snap.data().count || 0);
      }
      setScansLoaded(true);
    }).catch(() => setScansLoaded(true));
  }, [clientData?.id]);

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
    if (scanLimitReached) {
      showToast('Daily scan limit reached. Re-log a previous scan instead!', 'error');
      return;
    }
    setStage('analysing');
    setError(null);
    trackAIScanStarted();

    try {
      const compressed = await compressImage(imageFile, 512);
      const base64 = await fileToBase64(compressed);
      const analyseMeal = httpsCallable(functions, 'analyseMeal');
      const response = await analyseMeal({ imageBase64: base64, mimeType: 'image/jpeg' });
      setResult(response.data);
      setStage('results');
      trackAIScanCompleted({ itemCount: response.data.items.length, confidence: response.data.confidence });

      // Increment scan usage counter
      const today = getTodayKey();
      const newCount = scansUsedToday + 1;
      setScansUsedToday(newCount);
      setDoc(doc(db, 'scanUsage', `${clientData.id}_${today}`), {
        clientId: clientData.id,
        date: today,
        count: newCount,
        updatedAt: Timestamp.now(),
      }).catch(() => {});
    } catch (err) {
      console.error('Analysis failed:', err);
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
      const newEntries = result.items.map((item, idx) => ({
        id: Date.now() + idx,
        name: item.name,
        protein: item.protein || 0,
        carbs: item.carbs || 0,
        fats: item.fats || 0,
        calories: item.calories || 0,
        serving: `${item.estimatedGrams || 0}g (AI estimate)`,
        meal: selectedMeal,
        source: 'ai_scanner',
        aiConfidence: result.confidence,
        aiPhotoUrl: photoUrl,
        addedAt: new Date().toISOString(),
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

      // Save to savedMeals for future reuse (skip if reusing — already saved)
      if (imageFile) {
        const mealLabel = result.items.map((i) => i.name).join(', ');
        const savedEntry = {
          id: imageId,
          label: mealLabel.length > 60 ? mealLabel.slice(0, 57) + '...' : mealLabel,
          items: result.items,
          totals: result.totals,
          confidence: result.confidence,
          photoUrl,
          mealType: selectedMeal,
          usedAt: Date.now(),
        };
        const mealsRef = doc(db, 'savedMeals', clientData.id);
        const existingMeals = [...savedMeals];
        // Prepend new meal, cap at MAX_SAVED_MEALS
        const updatedMeals = [savedEntry, ...existingMeals].slice(0, MAX_SAVED_MEALS);
        setSavedMeals(updatedMeals);
        setDoc(mealsRef, { meals: updatedMeals, updatedAt: Timestamp.now() }).catch(() => {});
      }

      // Navigate back to nutrition hub to show updated log
      setTimeout(() => {
        navigate('/client/core-buddy/nutrition');
      }, 1200);
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Failed to save. Please try again.', 'error');
      setStage('results');
    }
  };

  const handleReuse = (meal) => {
    setResult({ items: meal.items, totals: meal.totals, confidence: meal.confidence });
    setImagePreview(meal.photoUrl);
    setImageFile(null); // null signals this is a reuse — skip photo upload on save
    setStage('results');
  };

  const handleSaveReuse = async () => {
    if (!result || !clientData?.id) return;
    setStage('saving');

    try {
      const today = getTodayKey();
      const newEntries = result.items.map((item, idx) => ({
        id: Date.now() + idx,
        name: item.name,
        protein: item.protein || 0,
        carbs: item.carbs || 0,
        fats: item.fats || 0,
        calories: item.calories || 0,
        serving: `${item.estimatedGrams || 0}g (AI estimate)`,
        meal: selectedMeal,
        source: 'ai_scanner_reuse',
        aiConfidence: result.confidence,
        addedAt: new Date().toISOString(),
      }));

      const logRef = doc(db, 'nutritionLogs', `${clientData.id}_${today}`);
      const existingDoc = await getDoc(logRef);
      const existingEntries = existingDoc.exists() ? existingDoc.data().entries || [] : [];

      await setDoc(logRef, {
        clientId: clientData.id,
        date: today,
        entries: [...existingEntries, ...newEntries],
        updatedAt: Timestamp.now(),
      });

      // Update usedAt timestamp in savedMeals
      const updatedMeals = savedMeals.map((m) =>
        m.items === result.items ? { ...m, usedAt: Date.now() } : m
      );
      setSavedMeals(updatedMeals);
      setDoc(doc(db, 'savedMeals', clientData.id), { meals: updatedMeals, updatedAt: Timestamp.now() }).catch(() => {});

      showToast(`${newEntries.length} item${newEntries.length > 1 ? 's' : ''} added to ${selectedMeal}`, 'success');
      // Navigate back to nutrition hub to show updated log
      setTimeout(() => {
        navigate('/client/core-buddy/nutrition');
      }, 1200);
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
        </div>
        <p className="ais-subtitle">Take a photo of your meal and let AI estimate the macros</p>

        {/* ── Usage Banner ── */}
        {scansLoaded && stage === 'idle' && (
          <div className={`ais-usage-banner${scanLimitReached ? ' ais-usage-banner--locked' : scansRemaining <= 3 ? ' ais-usage-banner--low' : ''}`}>
            <div className="ais-usage-top">
              <span className="ais-usage-count">
                {scanLimitReached
                  ? 'Daily scan limit reached'
                  : `${scansRemaining} scan${scansRemaining !== 1 ? 's' : ''} remaining today`}
              </span>
              <span className="ais-usage-total">{scansUsedToday}/{DAILY_SCAN_LIMIT} used</span>
            </div>
            <div className="ais-usage-bar">
              <div className="ais-usage-bar-fill" style={{ width: `${Math.min(100, (scansUsedToday / DAILY_SCAN_LIMIT) * 100)}%` }} />
            </div>
            {savedMeals.length > 0 && (
              <p className="ais-usage-hint">Save credits by re-logging a previous scan below</p>
            )}
          </div>
        )}

        {/* ── IDLE: Upload prompt ── */}
        {stage === 'idle' && (
          <div className="ais-upload-section">
            {scanLimitReached ? (
              <div className="ais-upload-btn ais-upload-btn--locked">
                <div className="ais-upload-icon ais-upload-icon--locked">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <span className="ais-upload-text">Scanner locked for today</span>
                <span className="ais-upload-hint">Re-log a previous scan below, or come back tomorrow</span>
              </div>
            ) : (
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
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            {/* Recent scans grouped by meal type */}
            {savedMealsLoaded && savedMeals.length > 0 && (
              <div className="ais-recent-section">
                <h3 className="ais-recent-title">Recent Scans</h3>
                <p className="ais-recent-hint">Tap to re-log without using a scan credit</p>

                {/* Category filter tabs */}
                <div className="ais-category-tabs">
                  <button
                    className={`ais-category-tab${recentFilter === 'all' ? ' ais-category-tab--active' : ''}`}
                    onClick={() => setRecentFilter('all')}
                  >
                    All
                  </button>
                  {MEALS.map((m) => {
                    const count = savedMeals.filter((s) => s.mealType === m.key).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={m.key}
                        className={`ais-category-tab${recentFilter === m.key ? ' ais-category-tab--active' : ''}`}
                        onClick={() => setRecentFilter(m.key)}
                      >
                        {m.icon} {m.label} <span className="ais-category-count">{count}</span>
                      </button>
                    );
                  })}
                  {/* Show uncategorized tab if any meals lack mealType */}
                  {savedMeals.some((s) => !s.mealType) && (
                    <button
                      className={`ais-category-tab${recentFilter === 'uncategorized' ? ' ais-category-tab--active' : ''}`}
                      onClick={() => setRecentFilter('uncategorized')}
                    >
                      Other
                    </button>
                  )}
                </div>

                <div className="ais-recent-list">
                  {savedMeals
                    .filter((meal) => {
                      if (recentFilter === 'all') return true;
                      if (recentFilter === 'uncategorized') return !meal.mealType;
                      return meal.mealType === recentFilter;
                    })
                    .map((meal) => (
                      <button key={meal.id} className="ais-recent-card" onClick={() => handleReuse(meal)}>
                        {meal.photoUrl && (
                          <img src={meal.photoUrl} alt="" className="ais-recent-thumb" loading="lazy" />
                        )}
                        <div className="ais-recent-info">
                          <span className="ais-recent-label">{meal.label}</span>
                          <span className="ais-recent-macros">
                            {meal.totals.calories} cal &middot; {meal.totals.protein}p &middot; {meal.totals.carbs}c &middot; {meal.totals.fats}f
                          </span>
                          {meal.mealType && (
                            <span className="ais-recent-meal-tag">
                              {MEALS.find((m) => m.key === meal.mealType)?.icon} {MEALS.find((m) => m.key === meal.mealType)?.label}
                            </span>
                          )}
                        </div>
                        <svg className="ais-recent-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                      </button>
                    ))}
                  {savedMeals.filter((meal) => {
                    if (recentFilter === 'all') return true;
                    if (recentFilter === 'uncategorized') return !meal.mealType;
                    return meal.mealType === recentFilter;
                  }).length === 0 && (
                    <p className="ais-recent-empty">No scans in this category yet</p>
                  )}
                </div>
              </div>
            )}
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
              <button className="ais-btn ais-btn-primary" onClick={imageFile ? handleSave : handleSaveReuse} disabled={stage === 'saving'}>
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
