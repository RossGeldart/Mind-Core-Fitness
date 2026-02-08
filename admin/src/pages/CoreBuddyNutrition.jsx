import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import './CoreBuddyNutrition.css';

const TICK_COUNT = 60;

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

export default function CoreBuddyNutrition() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Views: 'loading' | 'setup' | 'dashboard'
  const [view, setView] = useState('loading');

  // Macro targets (from Firestore)
  const [targets, setTargets] = useState(null);

  // Setup form (macro calculator)
  const [formData, setFormData] = useState({
    gender: 'male', age: '', weight: '', weightUnit: 'kg',
    height: '', heightUnit: 'cm', heightFeet: '', heightInches: '',
    activityLevel: 'moderate', goal: 'maintain', deficitLevel: 'moderate'
  });
  const [calcResults, setCalcResults] = useState(null);

  // Daily log
  const [todayLog, setTodayLog] = useState({ entries: [], water: 0 });
  const [totals, setTotals] = useState({ protein: 0, carbs: 0, fats: 0, calories: 0 });

  // Add food modal
  const [addMode, setAddMode] = useState(null); // 'scan' | 'search' | 'manual' | null
  const [scannerActive, setScannerActive] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [barcodeLooking, setBarcodeLooking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [manualForm, setManualForm] = useState({ name: '', protein: '', carbs: '', fats: '', calories: '', serving: '' });
  const [scannedProduct, setScannedProduct] = useState(null);
  const [servingMultiplier, setServingMultiplier] = useState(1);

  // Toast
  const [toast, setToast] = useState(null);

  const scannerRef = useRef(null);
  const html5QrcodeRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load targets + today's log
  useEffect(() => {
    if (!clientData?.id) return;
    const load = async () => {
      try {
        const targetsDoc = await getDoc(doc(db, 'nutritionTargets', clientData.id));
        if (targetsDoc.exists()) {
          setTargets(targetsDoc.data());
          setView('dashboard');
        } else {
          setView('setup');
        }

        const todayKey = getTodayKey();
        const logDoc = await getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${todayKey}`));
        if (logDoc.exists()) {
          const data = logDoc.data();
          setTodayLog({ entries: data.entries || [], water: data.water || 0 });
        }
      } catch (err) {
        console.error('Error loading nutrition data:', err);
        setView('setup');
      }
    };
    load();
  }, [clientData?.id]);

  // Recalc totals when entries change
  useEffect(() => {
    const t = todayLog.entries.reduce((acc, e) => ({
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fats: acc.fats + (e.fats || 0),
      calories: acc.calories + (e.calories || 0)
    }), { protein: 0, carbs: 0, fats: 0, calories: 0 });
    setTotals(t);
  }, [todayLog.entries]);

  // Save log to Firestore
  const saveLog = async (newLog) => {
    const todayKey = getTodayKey();
    try {
      await setDoc(doc(db, 'nutritionLogs', `${clientData.id}_${todayKey}`), {
        clientId: clientData.id,
        date: todayKey,
        entries: newLog.entries,
        water: newLog.water,
        updatedAt: Timestamp.now()
      });
    } catch (err) {
      console.error('Error saving nutrition log:', err);
    }
  };

  // ==================== MACRO CALCULATOR ====================
  const calculateMacros = () => {
    let weightKg = parseFloat(formData.weight);
    if (formData.weightUnit === 'lbs') weightKg *= 0.453592;

    let heightCm;
    if (formData.heightUnit === 'cm') {
      heightCm = parseFloat(formData.height);
    } else {
      heightCm = ((parseFloat(formData.heightFeet) || 0) * 30.48) + ((parseFloat(formData.heightInches) || 0) * 2.54);
    }

    const age = parseInt(formData.age);
    let bmr = formData.gender === 'male'
      ? (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5
      : (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161;

    const multipliers = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9 };
    const tdee = bmr * multipliers[formData.activityLevel];

    let targetCalories = tdee, proteinPerKg, fatPct;
    switch (formData.goal) {
      case 'lose':
        targetCalories = tdee - ({ light: 250, moderate: 500, harsh: 750 }[formData.deficitLevel]);
        proteinPerKg = 2.2; fatPct = 0.30; break;
      case 'build':
        targetCalories = tdee + 300; proteinPerKg = 2.0; fatPct = 0.22; break;
      default:
        proteinPerKg = 1.8; fatPct = 0.25;
    }
    targetCalories = Math.max(targetCalories, formData.gender === 'male' ? 1500 : 1200);

    const protein = Math.round(weightKg * proteinPerKg);
    const fats = Math.round((targetCalories * fatPct) / 9);
    const carbs = Math.max(0, Math.round((targetCalories - (protein * 4) - (fats * 9)) / 4));

    setCalcResults({
      calories: Math.round(targetCalories), protein, carbs, fats,
      bmr: Math.round(bmr), tdee: Math.round(tdee)
    });
  };

  const saveTargets = async () => {
    if (!calcResults) return;
    const newTargets = {
      clientId: clientData.id,
      calories: calcResults.calories,
      protein: calcResults.protein,
      carbs: calcResults.carbs,
      fats: calcResults.fats,
      waterGoal: 8,
      goal: formData.goal,
      updatedAt: Timestamp.now()
    };
    await setDoc(doc(db, 'nutritionTargets', clientData.id), newTargets);
    setTargets(newTargets);
    setView('dashboard');
    showToast('Macro targets saved!', 'success');
  };

  const isFormValid = () => {
    const hasWeight = formData.weight && parseFloat(formData.weight) > 0;
    const hasAge = formData.age && parseInt(formData.age) > 0;
    const hasHeight = formData.heightUnit === 'cm'
      ? (formData.height && parseFloat(formData.height) > 0)
      : ((formData.heightFeet && parseFloat(formData.heightFeet) > 0) || (formData.heightInches && parseFloat(formData.heightInches) > 0));
    return hasWeight && hasAge && hasHeight;
  };

  // ==================== FOOD LOGGING ====================
  const addFoodEntry = (entry) => {
    const newEntries = [...todayLog.entries, { ...entry, id: Date.now(), addedAt: new Date().toISOString() }];
    const newLog = { ...todayLog, entries: newEntries };
    setTodayLog(newLog);
    saveLog(newLog);
    setAddMode(null);
    setScannedProduct(null);
    setServingMultiplier(1);
    setManualForm({ name: '', protein: '', carbs: '', fats: '', calories: '', serving: '' });
    showToast('Food added!', 'success');
  };

  const removeEntry = (id) => {
    const newEntries = todayLog.entries.filter(e => e.id !== id);
    const newLog = { ...todayLog, entries: newEntries };
    setTodayLog(newLog);
    saveLog(newLog);
  };

  // ==================== BARCODE SCANNER ====================
  const BARCODE_FORMATS = [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.ITF,
  ];

  const startScanner = async () => {
    setScannerActive(true);
    try {
      const html5Qrcode = new Html5Qrcode('barcode-reader', {
        formatsToSupport: BARCODE_FORMATS,
        verbose: false,
      });
      html5QrcodeRef.current = html5Qrcode;
      await html5Qrcode.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const w = Math.min(viewfinderWidth * 0.85, 320);
            const h = Math.min(viewfinderHeight * 0.35, 140);
            return { width: Math.round(w), height: Math.round(h) };
          },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        async (decodedText) => {
          await html5Qrcode.stop();
          html5QrcodeRef.current = null;
          setScannerActive(false);
          fetchProductByBarcode(decodedText);
        },
        () => {}
      );
    } catch (err) {
      console.error('Scanner error:', err);
      setScannerActive(false);
      showToast('Could not access camera. Check permissions.', 'error');
    }
  };

  const stopScanner = async () => {
    if (html5QrcodeRef.current) {
      try { await html5QrcodeRef.current.stop(); } catch (e) {}
      html5QrcodeRef.current = null;
    }
    setScannerActive(false);
  };

  const parseProduct = (p) => {
    const n = p.nutriments || {};
    return {
      name: p.product_name || p.product_name_en || 'Unknown Product',
      brand: p.brands || '',
      image: p.image_small_url || p.image_url || null,
      servingSize: p.serving_size || '100g',
      protein: Math.round(n.proteins_100g || n.proteins || 0),
      carbs: Math.round(n.carbohydrates_100g || n.carbohydrates || 0),
      fats: Math.round(n.fat_100g || n.fat || 0),
      calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0)),
      per100g: true
    };
  };

  const fetchProductByBarcode = async (barcode) => {
    setBarcodeLooking(true);
    try {
      const url = `https://world.openfoodfacts.net/api/v2/product/${barcode}?fields=product_name,product_name_en,brands,image_small_url,image_url,serving_size,nutriments`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'success' || data.status === 1 || data.product) {
        const product = parseProduct(data.product);
        if (product.calories === 0 && product.protein === 0 && product.carbs === 0) {
          showToast('Product found but no nutrition data available.', 'error');
        } else {
          setScannedProduct(product);
          setServingMultiplier(1);
          setManualBarcode('');
        }
      } else {
        showToast('Product not found. Try search or manual entry.', 'error');
      }
    } catch (err) {
      console.error('Barcode lookup error:', err);
      showToast('Failed to look up product. Check your connection.', 'error');
    }
    setBarcodeLooking(false);
  };

  // ==================== FOOD SEARCH ====================
  const searchFood = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const url = `https://world.openfoodfacts.net/api/v2/search?search_terms=${encodeURIComponent(searchQuery)}&fields=product_name,product_name_en,brands,image_small_url,image_url,serving_size,nutriments&page_size=10`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = (data.products || [])
        .map(p => parseProduct(p))
        .filter(p => p.name !== 'Unknown Product' && (p.calories > 0 || p.protein > 0));
      setSearchResults(results);
      if (results.length === 0) {
        showToast('No results found. Try a different search.', 'info');
      }
    } catch (err) {
      console.error('Search error:', err);
      showToast('Search failed. Check your connection.', 'error');
    }
    setSearchLoading(false);
  };

  // ==================== WATER TRACKER ====================
  const addWater = () => {
    const newLog = { ...todayLog, water: todayLog.water + 1 };
    setTodayLog(newLog);
    saveLog(newLog);
  };

  const removeWater = () => {
    if (todayLog.water <= 0) return;
    const newLog = { ...todayLog, water: todayLog.water - 1 };
    setTodayLog(newLog);
    saveLog(newLog);
  };

  // ==================== RING HELPERS ====================
  const getRingTicks = (current, target) => {
    if (!target || target <= 0) return 0;
    return Math.min(TICK_COUNT, Math.round((current / target) * TICK_COUNT));
  };

  const renderMacroRing = (label, shortLabel, current, target, colorClass) => {
    const filled = getRingTicks(current, target);
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    return (
      <div className={`nut-ring-wrap ${colorClass}`}>
        <svg className="nut-ring-svg" viewBox="0 0 200 200">
          {[...Array(TICK_COUNT)].map((_, i) => {
            const angle = (i * 6 - 90) * (Math.PI / 180);
            const x1 = 100 + 82 * Math.cos(angle);
            const y1 = 100 + 82 * Math.sin(angle);
            const x2 = 100 + 94 * Math.cos(angle);
            const y2 = 100 + 94 * Math.sin(angle);
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                className={i < filled ? 'nut-tick-filled' : 'nut-tick-empty'}
                strokeWidth={i % 5 === 0 ? '3' : '2'} />
            );
          })}
        </svg>
        <div className="nut-ring-center">
          <span className="nut-ring-value">{Math.round(current)}</span>
          <span className="nut-ring-target">/ {target}{label === 'Calories' ? '' : 'g'}</span>
          <span className="nut-ring-label">{shortLabel}</span>
        </div>
        <span className="nut-ring-pct">{pct}%</span>
      </div>
    );
  };

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      if (html5QrcodeRef.current) {
        try { html5QrcodeRef.current.stop(); } catch (e) {}
      }
    };
  }, []);

  if (authLoading || view === 'loading') {
    return <div className="cb-loading"><div className="cb-loading-spinner" /></div>;
  }

  // ==================== SETUP VIEW (Macro Calculator) ====================
  if (view === 'setup') {
    return (
      <div className="nut-page" data-theme={isDark ? 'dark' : 'light'}>
        <header className="cb-header">
          <div className="cb-header-left">
            <img src="/Logo.PNG" alt="Mind Core Fitness" className="cb-header-logo" />
            <span className="cb-header-title">Nutrition Setup</span>
          </div>
          <div className="cb-header-right">
            <button className="cb-theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
          </div>
        </header>

        <main className="nut-main">
          <button className="nut-back-btn" onClick={() => navigate(-1)}>&larr; Back</button>

          <div className="nut-setup-intro">
            <h2>Set Your Daily Targets</h2>
            <p>Calculate your personalised macros based on your body and goals.</p>
          </div>

          <div className="nut-calc-form">
            {/* Gender */}
            <div className="nut-form-group">
              <label>Gender</label>
              <div className="nut-toggle-group">
                <button className={formData.gender === 'male' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, gender: 'male' })); setCalcResults(null); }}>Male</button>
                <button className={formData.gender === 'female' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, gender: 'female' })); setCalcResults(null); }}>Female</button>
              </div>
            </div>

            {/* Age + Weight row */}
            <div className="nut-form-row">
              <div className="nut-form-group">
                <label>Age</label>
                <input type="number" value={formData.age} onChange={e => { setFormData(p => ({ ...p, age: e.target.value })); setCalcResults(null); }} placeholder="Years" min="15" max="100" />
              </div>
              <div className="nut-form-group">
                <label>Weight</label>
                <div className="nut-input-unit">
                  <input type="number" value={formData.weight} onChange={e => { setFormData(p => ({ ...p, weight: e.target.value })); setCalcResults(null); }} placeholder={formData.weightUnit} min="30" max="300" />
                  <div className="nut-unit-toggle">
                    <button className={formData.weightUnit === 'kg' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, weightUnit: 'kg' })); setCalcResults(null); }}>kg</button>
                    <button className={formData.weightUnit === 'lbs' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, weightUnit: 'lbs' })); setCalcResults(null); }}>lbs</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Height */}
            <div className="nut-form-group">
              <label>Height</label>
              <div className="nut-input-unit">
                {formData.heightUnit === 'cm' ? (
                  <input type="number" value={formData.height} onChange={e => { setFormData(p => ({ ...p, height: e.target.value })); setCalcResults(null); }} placeholder="cm" min="100" max="250" />
                ) : (
                  <div className="nut-height-imperial">
                    <input type="number" value={formData.heightFeet} onChange={e => { setFormData(p => ({ ...p, heightFeet: e.target.value })); setCalcResults(null); }} placeholder="ft" min="4" max="7" />
                    <input type="number" value={formData.heightInches} onChange={e => { setFormData(p => ({ ...p, heightInches: e.target.value })); setCalcResults(null); }} placeholder="in" min="0" max="11" />
                  </div>
                )}
                <div className="nut-unit-toggle">
                  <button className={formData.heightUnit === 'cm' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, heightUnit: 'cm' })); setCalcResults(null); }}>cm</button>
                  <button className={formData.heightUnit === 'ft' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, heightUnit: 'ft' })); setCalcResults(null); }}>ft/in</button>
                </div>
              </div>
            </div>

            {/* Activity Level */}
            <div className="nut-form-group">
              <label>Activity Level</label>
              <select value={formData.activityLevel} onChange={e => { setFormData(p => ({ ...p, activityLevel: e.target.value })); setCalcResults(null); }}>
                <option value="sedentary">Sedentary (little to no exercise)</option>
                <option value="light">Lightly Active (1-3 days/week)</option>
                <option value="moderate">Moderately Active (3-5 days/week)</option>
                <option value="active">Very Active (6-7 days/week)</option>
                <option value="veryActive">Extra Active (athlete/physical job)</option>
              </select>
            </div>

            {/* Goal */}
            <div className="nut-form-group">
              <label>Fitness Goal</label>
              <div className="nut-goal-options">
                <button className={formData.goal === 'lose' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, goal: 'lose' })); setCalcResults(null); }}>
                  <span className="nut-goal-icon">-</span><span>Lose Weight</span>
                </button>
                <button className={formData.goal === 'maintain' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, goal: 'maintain' })); setCalcResults(null); }}>
                  <span className="nut-goal-icon">=</span><span>Maintain</span>
                </button>
                <button className={formData.goal === 'build' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, goal: 'build' })); setCalcResults(null); }}>
                  <span className="nut-goal-icon">+</span><span>Build Muscle</span>
                </button>
              </div>
            </div>

            {/* Deficit */}
            {formData.goal === 'lose' && (
              <div className="nut-form-group">
                <label>Deficit Level</label>
                <div className="nut-deficit-options">
                  <button className={formData.deficitLevel === 'light' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, deficitLevel: 'light' })); setCalcResults(null); }}>
                    <strong>Light</strong><span>-250 cal/day</span>
                  </button>
                  <button className={formData.deficitLevel === 'moderate' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, deficitLevel: 'moderate' })); setCalcResults(null); }}>
                    <strong>Moderate</strong><span>-500 cal/day</span>
                  </button>
                  <button className={formData.deficitLevel === 'harsh' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, deficitLevel: 'harsh' })); setCalcResults(null); }}>
                    <strong>Aggressive</strong><span>-750 cal/day</span>
                  </button>
                </div>
              </div>
            )}

            <button className="nut-calc-btn" onClick={calculateMacros} disabled={!isFormValid()}>Calculate Macros</button>
          </div>

          {/* Calculator Results */}
          {calcResults && (
            <div className="nut-calc-results">
              <h3>Your Daily Targets</h3>
              <div className="nut-calc-rings">
                {renderMacroRing('Protein', 'Protein', calcResults.protein, calcResults.protein, 'ring-protein')}
                {renderMacroRing('Carbs', 'Carbs', calcResults.carbs, calcResults.carbs, 'ring-carbs')}
                {renderMacroRing('Fats', 'Fats', calcResults.fats, calcResults.fats, 'ring-fats')}
                {renderMacroRing('Calories', 'Calories', calcResults.calories, calcResults.calories, 'ring-cals')}
              </div>
              <div className="nut-calc-info">
                <div className="nut-calc-info-row">
                  <span>BMR</span><span>{calcResults.bmr} cal</span>
                </div>
                <div className="nut-calc-info-row">
                  <span>TDEE</span><span>{calcResults.tdee} cal</span>
                </div>
              </div>
              <button className="nut-save-targets-btn" onClick={saveTargets}>Set as My Daily Targets</button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ==================== DASHBOARD VIEW ====================
  return (
    <div className="nut-page" data-theme={isDark ? 'dark' : 'light'}>
      <header className="cb-header">
        <div className="cb-header-left">
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="cb-header-logo" />
          <span className="cb-header-title">Nutrition</span>
        </div>
        <div className="cb-header-right">
          <button className="nut-settings-btn" onClick={() => { setView('setup'); setCalcResults(null); }} aria-label="Recalculate macros">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <button className="cb-theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {isDark ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
        </div>
      </header>

      <main className="nut-main">
        <button className="nut-back-btn" onClick={() => navigate(-1)}>&larr; Back</button>

        {/* Macro Rings */}
        <div className="nut-rings-grid">
          {renderMacroRing('Protein', 'Protein', totals.protein, targets.protein, 'ring-protein')}
          {renderMacroRing('Carbs', 'Carbs', totals.carbs, targets.carbs, 'ring-carbs')}
          {renderMacroRing('Fats', 'Fats', totals.fats, targets.fats, 'ring-fats')}
          {renderMacroRing('Calories', 'Calories', totals.calories, targets.calories, 'ring-cals')}
        </div>

        {/* Add Food Buttons */}
        <div className="nut-add-buttons">
          <button className="nut-add-btn nut-add-scan" onClick={() => { setAddMode('scan'); setScannedProduct(null); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
            <span>Scan</span>
          </button>
          <button className="nut-add-btn nut-add-search" onClick={() => { setAddMode('search'); setSearchResults([]); setSearchQuery(''); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Search</span>
          </button>
          <button className="nut-add-btn nut-add-manual" onClick={() => { setAddMode('manual'); setManualForm({ name: '', protein: '', carbs: '', fats: '', calories: '', serving: '' }); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Manual</span>
          </button>
        </div>

        {/* Water Tracker */}
        <div className="nut-water-section">
          <div className="nut-water-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
            <span>Water</span>
            <span className="nut-water-count">{todayLog.water} / {targets?.waterGoal || 8} glasses</span>
          </div>
          <div className="nut-water-glasses">
            {[...Array(targets?.waterGoal || 8)].map((_, i) => (
              <div key={i} className={`nut-water-glass ${i < todayLog.water ? 'filled' : ''}`}>
                <svg viewBox="0 0 24 24" fill={i < todayLog.water ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
              </div>
            ))}
          </div>
          <div className="nut-water-btns">
            <button onClick={removeWater} disabled={todayLog.water <= 0}>-</button>
            <button onClick={addWater}>+</button>
          </div>
        </div>

        {/* Today's Food Log */}
        <div className="nut-log-section">
          <h3>Today's Log</h3>
          {todayLog.entries.length === 0 ? (
            <div className="nut-log-empty">
              <p>No food logged yet today. Add your first meal above!</p>
            </div>
          ) : (
            <div className="nut-log-list">
              {todayLog.entries.map(entry => (
                <div key={entry.id} className="nut-log-item">
                  <div className="nut-log-item-info">
                    <span className="nut-log-item-name">{entry.name}</span>
                    {entry.serving && <span className="nut-log-item-serving">{entry.serving}</span>}
                  </div>
                  <div className="nut-log-item-macros">
                    <span className="nut-macro-p">{entry.protein}p</span>
                    <span className="nut-macro-c">{entry.carbs}c</span>
                    <span className="nut-macro-f">{entry.fats}f</span>
                    <span className="nut-macro-cal">{entry.calories}</span>
                  </div>
                  <button className="nut-log-delete" onClick={() => removeEntry(entry.id)} aria-label="Remove">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ==================== ADD FOOD MODAL ==================== */}
      {addMode && (
        <div className="nut-modal-overlay" onClick={() => { stopScanner(); setAddMode(null); setScannedProduct(null); }}>
          <div className="nut-modal" onClick={e => e.stopPropagation()}>
            <div className="nut-modal-header">
              <h3>{addMode === 'scan' ? 'Scan Barcode' : addMode === 'search' ? 'Search Food' : 'Manual Entry'}</h3>
              <button className="nut-modal-close" onClick={() => { stopScanner(); setAddMode(null); setScannedProduct(null); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* SCAN MODE */}
            {addMode === 'scan' && !scannedProduct && (
              <div className="nut-scan-area">
                <div className="nut-scanner-wrapper">
                  <div id="barcode-reader" className="nut-scanner-view" />
                  {scannerActive && <div className="nut-scan-line" />}
                </div>
                {!scannerActive && (
                  <button className="nut-scan-start-btn" onClick={startScanner}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
                    Open Camera
                  </button>
                )}
                {scannerActive && <p className="nut-scan-hint">Align barcode within the frame</p>}

                <div className="nut-barcode-divider">
                  <span>or enter barcode manually</span>
                </div>
                <div className="nut-barcode-manual">
                  <input type="text" inputMode="numeric" value={manualBarcode}
                    onChange={e => setManualBarcode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && manualBarcode.trim() && fetchProductByBarcode(manualBarcode.trim())}
                    placeholder="Enter barcode number" />
                  <button onClick={() => manualBarcode.trim() && fetchProductByBarcode(manualBarcode.trim())}
                    disabled={!manualBarcode.trim() || barcodeLooking}>
                    {barcodeLooking ? '...' : 'Look Up'}
                  </button>
                </div>
              </div>
            )}

            {/* SCANNED PRODUCT RESULT */}
            {addMode === 'scan' && scannedProduct && (
              <div className="nut-product-result">
                {scannedProduct.image && <img src={scannedProduct.image} alt="" className="nut-product-img" />}
                <h4>{scannedProduct.name}</h4>
                {scannedProduct.brand && <p className="nut-product-brand">{scannedProduct.brand}</p>}
                <p className="nut-product-per">Per 100g:</p>
                <div className="nut-product-macros">
                  <span className="nut-macro-p">{scannedProduct.protein}g P</span>
                  <span className="nut-macro-c">{scannedProduct.carbs}g C</span>
                  <span className="nut-macro-f">{scannedProduct.fats}g F</span>
                  <span className="nut-macro-cal">{scannedProduct.calories} cal</span>
                </div>
                <div className="nut-serving-adjust">
                  <label>Serving (g)</label>
                  <input type="number" value={Math.round(servingMultiplier * 100)} onChange={e => setServingMultiplier(Math.max(0, parseFloat(e.target.value) || 0) / 100)} min="1" />
                </div>
                <div className="nut-product-total">
                  <span>Total: {Math.round(scannedProduct.protein * servingMultiplier)}p / {Math.round(scannedProduct.carbs * servingMultiplier)}c / {Math.round(scannedProduct.fats * servingMultiplier)}f / {Math.round(scannedProduct.calories * servingMultiplier)} cal</span>
                </div>
                <div className="nut-product-actions">
                  <button className="nut-btn-secondary" onClick={() => { setScannedProduct(null); setAddMode('scan'); }}>Scan Again</button>
                  <button className="nut-btn-primary" onClick={() => addFoodEntry({
                    name: scannedProduct.name,
                    protein: Math.round(scannedProduct.protein * servingMultiplier),
                    carbs: Math.round(scannedProduct.carbs * servingMultiplier),
                    fats: Math.round(scannedProduct.fats * servingMultiplier),
                    calories: Math.round(scannedProduct.calories * servingMultiplier),
                    serving: `${Math.round(servingMultiplier * 100)}g`
                  })}>Add</button>
                </div>
              </div>
            )}

            {/* SEARCH MODE */}
            {addMode === 'search' && !scannedProduct && (
              <div className="nut-search-area">
                <div className="nut-search-bar">
                  <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchFood()}
                    placeholder="Search food or product..." autoFocus />
                  <button onClick={searchFood} disabled={searchLoading}>
                    {searchLoading ? '...' : 'Search'}
                  </button>
                </div>
                <div className="nut-search-results">
                  {searchResults.map((item, i) => (
                    <button key={i} className="nut-search-item" onClick={() => { setScannedProduct(item); setServingMultiplier(1); }}>
                      {item.image && <img src={item.image} alt="" />}
                      <div className="nut-search-item-info">
                        <span className="nut-search-item-name">{item.name}</span>
                        {item.brand && <span className="nut-search-item-brand">{item.brand}</span>}
                        <span className="nut-search-item-macros">{item.calories} cal · {item.protein}p · {item.carbs}c · {item.fats}f per 100g</span>
                      </div>
                    </button>
                  ))}
                  {searchResults.length === 0 && searchQuery && !searchLoading && (
                    <p className="nut-search-empty">No results found. Try a different search or use manual entry.</p>
                  )}
                </div>
              </div>
            )}

            {/* SEARCH - SELECTED PRODUCT */}
            {addMode === 'search' && scannedProduct && (
              <div className="nut-product-result">
                {scannedProduct.image && <img src={scannedProduct.image} alt="" className="nut-product-img" />}
                <h4>{scannedProduct.name}</h4>
                {scannedProduct.brand && <p className="nut-product-brand">{scannedProduct.brand}</p>}
                <p className="nut-product-per">Per 100g:</p>
                <div className="nut-product-macros">
                  <span className="nut-macro-p">{scannedProduct.protein}g P</span>
                  <span className="nut-macro-c">{scannedProduct.carbs}g C</span>
                  <span className="nut-macro-f">{scannedProduct.fats}g F</span>
                  <span className="nut-macro-cal">{scannedProduct.calories} cal</span>
                </div>
                <div className="nut-serving-adjust">
                  <label>Serving (g)</label>
                  <input type="number" value={Math.round(servingMultiplier * 100)} onChange={e => setServingMultiplier(Math.max(0, parseFloat(e.target.value) || 0) / 100)} min="1" />
                </div>
                <div className="nut-product-total">
                  <span>Total: {Math.round(scannedProduct.protein * servingMultiplier)}p / {Math.round(scannedProduct.carbs * servingMultiplier)}c / {Math.round(scannedProduct.fats * servingMultiplier)}f / {Math.round(scannedProduct.calories * servingMultiplier)} cal</span>
                </div>
                <div className="nut-product-actions">
                  <button className="nut-btn-secondary" onClick={() => setScannedProduct(null)}>Back to Search</button>
                  <button className="nut-btn-primary" onClick={() => addFoodEntry({
                    name: scannedProduct.name,
                    protein: Math.round(scannedProduct.protein * servingMultiplier),
                    carbs: Math.round(scannedProduct.carbs * servingMultiplier),
                    fats: Math.round(scannedProduct.fats * servingMultiplier),
                    calories: Math.round(scannedProduct.calories * servingMultiplier),
                    serving: `${Math.round(servingMultiplier * 100)}g`
                  })}>Add</button>
                </div>
              </div>
            )}

            {/* MANUAL MODE */}
            {addMode === 'manual' && (
              <div className="nut-manual-form">
                <div className="nut-form-group">
                  <label>Food Name</label>
                  <input type="text" value={manualForm.name} onChange={e => setManualForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Chicken Breast" autoFocus />
                </div>
                <div className="nut-form-group">
                  <label>Serving Size (optional)</label>
                  <input type="text" value={manualForm.serving} onChange={e => setManualForm(p => ({ ...p, serving: e.target.value }))} placeholder="e.g. 150g, 1 cup" />
                </div>
                <div className="nut-manual-macros">
                  <div className="nut-form-group">
                    <label>Protein (g)</label>
                    <input type="number" value={manualForm.protein} onChange={e => setManualForm(p => ({ ...p, protein: e.target.value }))} min="0" />
                  </div>
                  <div className="nut-form-group">
                    <label>Carbs (g)</label>
                    <input type="number" value={manualForm.carbs} onChange={e => setManualForm(p => ({ ...p, carbs: e.target.value }))} min="0" />
                  </div>
                  <div className="nut-form-group">
                    <label>Fats (g)</label>
                    <input type="number" value={manualForm.fats} onChange={e => setManualForm(p => ({ ...p, fats: e.target.value }))} min="0" />
                  </div>
                  <div className="nut-form-group">
                    <label>Calories</label>
                    <input type="number" value={manualForm.calories} onChange={e => setManualForm(p => ({ ...p, calories: e.target.value }))} min="0" />
                  </div>
                </div>
                <button className="nut-btn-primary" disabled={!manualForm.name.trim()} onClick={() => addFoodEntry({
                  name: manualForm.name,
                  protein: parseFloat(manualForm.protein) || 0,
                  carbs: parseFloat(manualForm.carbs) || 0,
                  fats: parseFloat(manualForm.fats) || 0,
                  calories: parseFloat(manualForm.calories) || 0,
                  serving: manualForm.serving || ''
                })}>Add Food</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
