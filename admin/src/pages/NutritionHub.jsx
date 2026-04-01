import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { awardBadge } from '../utils/awardBadge';
import { parseProduct } from '../utils/productParser';
import { getCountryLabel } from '../utils/countryDetect';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import useBarcodeScanner from '../hooks/useBarcodeScanner';
import useFoodSearch from '../hooks/useFoodSearch';
import ScannerView from '../components/ScannerView';
import ProductResult from '../components/ProductResult';
import { trackMealLogged, trackFoodSearched, trackBarcodeScanned, trackFavouriteSaved, trackDayCopied, trackFavouriteQuickAdded } from '../utils/analytics';
import './NutritionHub.css';
import './CoreBuddyNutrition.css';
import CoreBuddyNav from '../components/CoreBuddyNav';

import BadgeCelebration from '../components/BadgeCelebration';

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function getDateKey(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function getDayLabel(daysAgo) {
  if (daysAgo === 0) return 'Today';
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString('en-GB', { weekday: 'short' }).charAt(0);
}

const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

const MEAL_ICONS = {
  breakfast: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  ),
  lunch: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  ),
  dinner: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  snacks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
};

function getDefaultMeal() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h < 17) return 'snacks';
  return 'dinner';
}

const SEARCH_TIPS = [
  "Tip: Include the brand name for better results",
  "Tip: Be specific — e.g. 'Fage 0% yoghurt' not just 'yoghurt'",
  "Tip: Try the product's full name from the label",
];

const SEARCH_MESSAGES = [
  "Searching thousands of products...",
  "Almost there, won't be long now...",
];

function SearchLoadingOverlay() {
  const [progress, setProgress] = useState(0);
  const [tipIdx, setTipIdx] = useState(() => Math.floor(Math.random() * SEARCH_TIPS.length));
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    // Simulate progress: fast at first, slows down, never reaches 100
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      // Fast to 60%, slow to 85%, crawl to 95%
      let pct;
      if (elapsed < 3) pct = (elapsed / 3) * 60;
      else if (elapsed < 8) pct = 60 + ((elapsed - 3) / 5) * 25;
      else pct = Math.min(95, 85 + (elapsed - 8) * 0.5);
      setProgress(Math.round(pct));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Change tip once at ~5s, and again at ~10s (max 2 changes)
  useEffect(() => {
    const t1 = setTimeout(() => setTipIdx(i => (i + 1) % SEARCH_TIPS.length), 5000);
    const t2 = setTimeout(() => setTipIdx(i => (i + 1) % SEARCH_TIPS.length), 10000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Change message once at ~6s (just one swap)
  useEffect(() => {
    const t = setTimeout(() => setMsgIdx(i => (i + 1) % SEARCH_MESSAGES.length), 6000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="nut-search-loading-overlay">
      <p className="nut-search-loading-tip">{SEARCH_TIPS[tipIdx]}</p>
      <p className="nut-search-loading-msg">{SEARCH_MESSAGES[msgIdx]}</p>
      <div className="nut-search-loading-bar-track">
        <div className="nut-search-loading-bar-fill" style={{ width: `${progress}%` }}>
          <span className="nut-search-loading-percent">{progress}%</span>
        </div>
      </div>
    </div>
  );
}

export default function NutritionHub() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Views: 'loading' | 'setup' | 'dashboard'
  const [view, setView] = useState('loading');

  // Macro targets (from Firestore)
  const [targets, setTargets] = useState(null);
  const [badgeCelebration, setBadgeCelebration] = useState(null);

  // Hub-specific state
  const [streak, setStreak] = useState(0);
  const [weekData, setWeekData] = useState([]);
  const [hubFavourites, setHubFavourites] = useState([]);
  const [quickAddToast, setQuickAddToast] = useState(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [pendingQuickAdd, setPendingQuickAdd] = useState(null); // favourite waiting for meal selection

  // Setup form (macro calculator)
  const [formData, setFormData] = useState({
    gender: 'male', age: '', weight: '', weightUnit: 'kg',
    height: '', heightUnit: 'cm', heightFeet: '', heightInches: '',
    dailyActivity: 'sedentary', trainingFrequency: 'moderate',
    goal: 'maintain', deficitLevel: 'moderate'
  });
  const [calcResults, setCalcResults] = useState(null);

  // Daily log
  const [selectedDate, setSelectedDate] = useState(getTodayKey());
  const [todayLog, setTodayLog] = useState({ entries: [] });
  const [totals, setTotals] = useState({ protein: 0, calories: 0 });

  // Water tracking
  const [waterMl, setWaterMl] = useState(0);
  const WATER_TARGET = 2000;
  const WATER_INCREMENT = 500;
  const waterHoldTimer = useRef(null);
  const waterHoldStart = useRef(null);
  const [waterHolding, setWaterHolding] = useState(false);
  const [waterHoldProgress, setWaterHoldProgress] = useState(0);
  const [waterBurst, setWaterBurst] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Copy from day
  const [copyFromOpen, setCopyFromOpen] = useState(false);
  const [copyFromMonth, setCopyFromMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [copyingDay, setCopyingDay] = useState(false);

  // Meal selector
  const [selectedMeal, setSelectedMeal] = useState(getDefaultMeal);

  // Add food picker popup
  const [addPickerMeal, setAddPickerMeal] = useState(null); // which meal's picker is open

  // Add food modal
  const [addMode, setAddMode] = useState(null); // 'scan' | 'search' | 'manual' | null
  const [manualBarcode, setManualBarcode] = useState('');
  const [barcodeLooking, setBarcodeLooking] = useState(false);
  const [manualForm, setManualForm] = useState({ name: '', protein: '', calories: '', serving: '' });
  const [scannedProduct, setScannedProduct] = useState(null);
  const [servingInput, setServingInput] = useState('100');
  const [portionCount, setPortionCount] = useState(0);
  const [servingMode, setServingMode] = useState('weight');
  const [favTick, setFavTick] = useState(0);

  // Edit food entry
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', protein: '', calories: '', serving: '' });
  // Edit via amount picker (for entries with per100g data)
  const [editProduct, setEditProduct] = useState(null);
  const [editServingInput, setEditServingInput] = useState('100');
  const [editPortionCount, setEditPortionCount] = useState(0);
  const [editServingMode, setEditServingMode] = useState('weight');

  // Toast
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Barcode scanner hook
  const {
    scannerActive,
    scanDetected,
    setScanDetected,
    scannerTargetRef,
    startScanner,
    stopScanner,
  } = useBarcodeScanner({
    onDetected: null,
    onError: (msg) => showToast(msg, 'error'),
  });

  // Food search hook
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    searchLoading,
    searchFood,
    startDebounceSearch,
    searchInputRef,
  } = useFoodSearch({
    onError: (msg, type) => showToast(msg, type || 'error'),
  });

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load targets on mount
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
      } catch (err) {
        console.error('Error loading nutrition data:', err);
        setView('setup');
      }
    };
    load();
  }, [clientData?.id]);

  // Load log when selectedDate changes
  useEffect(() => {
    if (!clientData?.id) return;
    const loadLog = async () => {
      try {
        const logDoc = await getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${selectedDate}`));
        if (logDoc.exists()) {
          const data = logDoc.data();
          setTodayLog({ entries: data.entries || [] });
        } else {
          setTodayLog({ entries: [] });
        }
      } catch (err) {
        console.error('Error loading log:', err);
        setTodayLog({ entries: [] });
      }
    };
    loadLog();
  }, [clientData?.id, selectedDate]);

  // Recalc totals when entries change
  useEffect(() => {
    const t = todayLog.entries.reduce((acc, e) => ({
      protein: acc.protein + (e.protein || 0),
      calories: acc.calories + (e.calories || 0)
    }), { protein: 0, calories: 0 });
    setTotals(t);
  }, [todayLog.entries]);

  // Load water intake when selectedDate changes
  useEffect(() => {
    if (!clientData?.id) return;
    const loadWater = async () => {
      try {
        const logDoc = await getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${selectedDate}`));
        if (logDoc.exists()) {
          setWaterMl(logDoc.data().waterMl || 0);
        } else {
          setWaterMl(0);
        }
      } catch { setWaterMl(0); }
    };
    loadWater();
  }, [clientData?.id, selectedDate]);

  // Water hold-to-log handlers
  const waterHoldAnimFrame = useRef(null);
  const animateWaterHold = useCallback(() => {
    if (!waterHoldStart.current) return;
    const elapsed = Date.now() - waterHoldStart.current;
    const progress = Math.min(1, elapsed / 2000);
    setWaterHoldProgress(progress);
    if (progress < 1) {
      waterHoldAnimFrame.current = requestAnimationFrame(animateWaterHold);
    }
  }, []);

  const onWaterHoldStart = useCallback(() => {
    if (waterMl >= WATER_TARGET) return;
    waterHoldStart.current = Date.now();
    setWaterHolding(true);
    setWaterHoldProgress(0);
    waterHoldAnimFrame.current = requestAnimationFrame(animateWaterHold);
    waterHoldTimer.current = setTimeout(async () => {
      // 2 seconds held — add 500ml
      const newWater = Math.min(WATER_TARGET, waterMl + WATER_INCREMENT);
      setWaterMl(newWater);
      setWaterHolding(false);
      setWaterHoldProgress(0);
      setWaterBurst(true);
      setTimeout(() => setWaterBurst(false), 600);
      waterHoldStart.current = null;
      // Save to Firestore
      if (clientData?.id) {
        try {
          await setDoc(doc(db, 'nutritionLogs', `${clientData.id}_${selectedDate}`), {
            clientId: clientData.id,
            date: selectedDate,
            waterMl: newWater,
            updatedAt: Timestamp.now()
          }, { merge: true });
        } catch (err) {
          console.error('Error saving water:', err);
        }
      }
    }, 2000);
  }, [waterMl, clientData?.id, selectedDate, animateWaterHold]);

  const onWaterHoldEnd = useCallback(() => {
    if (waterHoldTimer.current) {
      clearTimeout(waterHoldTimer.current);
      waterHoldTimer.current = null;
    }
    if (waterHoldAnimFrame.current) {
      cancelAnimationFrame(waterHoldAnimFrame.current);
      waterHoldAnimFrame.current = null;
    }
    waterHoldStart.current = null;
    setWaterHolding(false);
    setWaterHoldProgress(0);
  }, []);

  // Save log to Firestore
  const saveLog = async (newLog) => {
    try {
      await setDoc(doc(db, 'nutritionLogs', `${clientData.id}_${selectedDate}`), {
        clientId: clientData.id,
        date: selectedDate,
        entries: newLog.entries,
        updatedAt: Timestamp.now()
      });

      // Check nutrition_7 badge: 7 consecutive days hitting protein target
      if (targets?.protein && selectedDate === getTodayKey()) {
        const todayTotals = newLog.entries.reduce((acc, e) => acc + (e.protein || 0), 0);
        if (todayTotals >= targets.protein) {
          let streak = 1;
          for (let i = 1; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            try {
              const snap = await getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${key}`));
              if (snap.exists()) {
                const dayProtein = (snap.data().entries || []).reduce((acc, e) => acc + (e.protein || 0), 0);
                if (dayProtein >= targets.protein) { streak++; } else { break; }
              } else { break; }
            } catch { break; }
          }
          if (streak >= 7) {
            const awarded = await awardBadge('nutrition_7', clientData);
            if (awarded) setBadgeCelebration(awarded);
          }
        }
      }
    } catch (err) {
      console.error('Error saving nutrition log:', err);
    }
  };

  // ==================== CALENDAR HELPERS ====================
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const formatDisplayDate = (dateStr) => {
    if (dateStr === getTodayKey()) return 'Today';
    const d = new Date(dateStr + 'T12:00:00');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const shiftDate = (days) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    const key = d.toISOString().split('T')[0];
    setSelectedDate(key);
  };

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

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

    // NEAT — daily lifestyle activity (outside of training)
    const neatMultipliers = { sedentary: 1.2, light: 1.3, moderate: 1.4, active: 1.5 };
    const neat = bmr * neatMultipliers[formData.dailyActivity];

    // Exercise add-on — average daily calories from training sessions
    const exerciseAddOns = { low: 100, moderate: 200, high: 300, daily: 400 };
    const tdee = Math.round(neat + exerciseAddOns[formData.trainingFrequency]);

    let targetCalories = tdee, proteinPerKg;
    switch (formData.goal) {
      case 'lose':
        targetCalories = tdee * (1 - ({ light: 0.15, moderate: 0.20, harsh: 0.25 }[formData.deficitLevel]));
        proteinPerKg = 2.2; break;
      case 'build':
        targetCalories = tdee * 1.10; proteinPerKg = 2.0; break;
      default:
        proteinPerKg = 1.8;
    }
    targetCalories = Math.max(targetCalories, formData.gender === 'male' ? 1400 : 1100);

    const protein = Math.round(weightKg * proteinPerKg);

    setCalcResults({
      calories: Math.round(targetCalories), protein,
      bmr: Math.round(bmr), neat: Math.round(neat),
      exerciseAdd: exerciseAddOns[formData.trainingFrequency],
      tdee: Math.round(tdee)
    });
    // Scroll results into view after React renders
    setTimeout(() => {
      document.querySelector('.nut-calc-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const saveTargets = async () => {
    if (!calcResults) return;
    try {
      const newTargets = {
        clientId: clientData.id,
        calories: calcResults.calories,
        protein: calcResults.protein,
        goal: formData.goal,
        updatedAt: Timestamp.now()
      };
      await setDoc(doc(db, 'nutritionTargets', clientData.id), newTargets);
      setTargets(newTargets);
      setView('dashboard');
      showToast('Macro targets saved!', 'success');
    } catch (err) {
      console.error('Error saving targets:', err);
      showToast('Failed to save targets. Please try again.', 'error');
    }
  };

  const isFormValid = () => {
    const hasWeight = formData.weight && parseFloat(formData.weight) > 0;
    const hasAge = formData.age && parseInt(formData.age) > 0;
    const hasHeight = formData.heightUnit === 'cm'
      ? (formData.height && parseFloat(formData.height) > 0)
      : ((formData.heightFeet && parseFloat(formData.heightFeet) > 0) || (formData.heightInches && parseFloat(formData.heightInches) > 0));
    return hasWeight && hasAge && hasHeight;
  };

  // ==================== FAVOURITES ====================
  const FAVS_KEY = 'nut_favourite_foods';

  const getFavourites = () => {
    try {
      return JSON.parse(localStorage.getItem(FAVS_KEY) || '[]');
    } catch { return []; }
  };

  // Load favourites from Firestore on mount (localStorage is just a fast cache)
  useEffect(() => {
    if (!clientData?.id) return;
    const loadFavourites = async () => {
      try {
        const favDoc = await getDoc(doc(db, 'favouriteFoods', clientData.id));
        if (favDoc.exists()) {
          const items = favDoc.data().items || [];
          localStorage.setItem(FAVS_KEY, JSON.stringify(items));
          setFavTick(t => t + 1);
        } else {
          // First load: migrate any existing localStorage favourites to Firestore
          const localFavs = getFavourites();
          if (localFavs.length > 0) {
            await setDoc(doc(db, 'favouriteFoods', clientData.id), { items: localFavs, updatedAt: Timestamp.now() });
          }
        }
      } catch (err) {
        console.error('Error loading favourites:', err);
      }
    };
    loadFavourites();
  }, [clientData?.id]);

  const isFavourite = (name) => {
    return getFavourites().some(f => f.name.toLowerCase() === (name || '').toLowerCase());
  };

  const toggleFavourite = (entry) => {
    const favs = getFavourites();
    const exists = favs.findIndex(f => f.name.toLowerCase() === entry.name.toLowerCase());
    if (exists >= 0) {
      favs.splice(exists, 1);
    } else {
      favs.unshift({
        name: entry.name,
        protein: entry.protein,
        calories: entry.calories,
        serving: entry.serving,
        per100g: entry.per100g || null,
        servingUnit: entry.servingUnit || 'g',
        portion: entry.portion || null,
      });
      trackFavouriteSaved(entry.name);
    }
    localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
    // Persist to Firestore for cross-session reliability
    if (clientData?.id) {
      setDoc(doc(db, 'favouriteFoods', clientData.id), { items: favs, updatedAt: Timestamp.now() })
        .catch(err => console.error('Error saving favourites:', err));
    }
    setFavTick(t => t + 1); // trigger re-render
  };

  // ==================== FOOD LOGGING ====================
  const addFoodEntry = (entry) => {
    const newEntries = [...todayLog.entries, { ...entry, meal: selectedMeal, id: Date.now(), addedAt: new Date().toISOString() }];
    const newLog = { ...todayLog, entries: newEntries };
    setTodayLog(newLog);
    saveLog(newLog);
    trackMealLogged({ meal: selectedMeal, items: newEntries.length, calories: entry.calories || 0, protein: entry.protein || 0 });
    setAddMode(null);
    setScannedProduct(null);
    setServingInput('100');
    setPortionCount(0);
    setServingMode('weight');
    setManualForm({ name: '', protein: '', calories: '', serving: '' });
    showToast('Food added!', 'success');
  };

  const removeEntry = (id) => {
    if (id == null) return; // safety: never delete with undefined id
    const newEntries = todayLog.entries.filter(e => e.id !== id);
    const newLog = { ...todayLog, entries: newEntries };
    setTodayLog(newLog);
    saveLog(newLog);
  };

  const openEditEntry = (entry) => {
    if (entry.per100g) {
      // Has per-100g data — open the amount picker (same screen as when first adding)
      const p100 = entry.per100g;
      setEditProduct({
        name: entry.name,
        brand: entry.brand || '',
        image: entry.image || null,
        protein: p100.protein,
        calories: p100.calories,
        servingSize: entry.serving || '100g',
        servingUnit: entry.servingUnit || 'g',
        portion: entry.portion || null,
        _editEntryId: entry.id,
      });
      if (entry.portion) {
        // Try to figure out the portion count from the serving string
        const portMatch = (entry.serving || '').match(/^(\d+)\s/);
        const count = portMatch ? parseInt(portMatch[1], 10) : 1;
        setEditPortionCount(count);
        setEditServingMode('portion');
        setEditServingInput(String(Math.round(count * entry.portion.weight)));
      } else {
        // Extract weight from serving string e.g. "150g"
        const weightMatch = (entry.serving || '').match(/([\d.]+)/);
        const weight = weightMatch ? parseFloat(weightMatch[1]) : 100;
        setEditServingInput(String(Math.round(weight)));
        setEditPortionCount(0);
        setEditServingMode('weight');
      }
      setEditingEntry(entry);
    } else {
      // No per-100g data (manual entry / old entry) — use form modal
      setEditingEntry(entry);
      setEditForm({
        name: entry.name || '',
        protein: String(entry.protein || 0),
        calories: String(entry.calories || 0),
        serving: entry.serving || '',
      });
    }
  };

  const saveEditEntry = () => {
    if (!editingEntry) return;
    const updated = {
      ...editingEntry,
      name: editForm.name,
      protein: parseFloat(editForm.protein) || 0,
      calories: parseFloat(editForm.calories) || 0,
      serving: editForm.serving,
    };
    const newEntries = todayLog.entries.map(e => e.id === editingEntry.id ? updated : e);
    const newLog = { ...todayLog, entries: newEntries };
    setTodayLog(newLog);
    saveLog(newLog);
    setEditingEntry(null);
    showToast('Food updated!', 'success');
  };

  const saveEditFromPicker = (pickerData) => {
    if (!editingEntry) return;
    const updated = {
      ...editingEntry,
      ...pickerData,
    };
    const newEntries = todayLog.entries.map(e => e.id === editingEntry.id ? updated : e);
    const newLog = { ...todayLog, entries: newEntries };
    setTodayLog(newLog);
    saveLog(newLog);
    setEditingEntry(null);
    setEditProduct(null);
    showToast('Food updated!', 'success');
  };

  // ==================== COPY FROM DAY ====================
  const copyFromDay = async (sourceDate) => {
    if (!clientData?.id || sourceDate === selectedDate) return;
    setCopyingDay(true);
    try {
      const srcDoc = await getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${sourceDate}`));
      if (!srcDoc.exists() || !srcDoc.data().entries?.length) {
        showToast('No food logged on that day', 'error');
        return;
      }
      const srcEntries = srcDoc.data().entries.map(e => ({
        ...e,
        id: Date.now() + Math.random(),
        addedAt: new Date().toISOString()
      }));
      const mergedEntries = [...todayLog.entries, ...srcEntries];
      const newLog = { ...todayLog, entries: mergedEntries };
      setTodayLog(newLog);
      saveLog(newLog);
      setCopyFromOpen(false);
      trackDayCopied();
      showToast(`Copied ${srcEntries.length} items from ${formatDisplayDate(sourceDate)}`, 'success');
    } catch (err) {
      console.error('Error copying day:', err);
      showToast('Failed to copy day', 'error');
    } finally {
      setCopyingDay(false);
    }
  };

  const fetchProductByBarcode = async (barcode) => {
    setBarcodeLooking(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=product_name,product_name_en,brands,image_small_url,image_url,serving_size,quantity,nutriments`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.status === 404) {
        trackBarcodeScanned(false);
        showToast('Product not found. Try search or manual entry.', 'error');
        setBarcodeLooking(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'success' || data.status === 1 || data.product) {
        const product = parseProduct(data.product);
        if (product.calories === 0 && product.protein === 0) {
          trackBarcodeScanned(false);
          showToast('Product found but no nutrition data available.', 'error');
        } else {
          trackBarcodeScanned(true);
          setScannedProduct(product);
          if (product.portion) {
            setPortionCount(1);
            setServingInput(String(product.portion.weight));
            setServingMode('portion');
          } else {
            setPortionCount(0);
            setServingInput(String(product.servingValue || 100));
            setServingMode('weight');
          }
          setManualBarcode('');
        }
      } else {
        trackBarcodeScanned(false);
        showToast('Product not found. Try search or manual entry.', 'error');
      }
    } catch (err) {
      console.error('Barcode lookup error:', err);
      trackBarcodeScanned(false);
      if (err.name === 'AbortError') {
        showToast('Lookup timed out. Check your connection and try again.', 'error');
      } else {
        showToast('Failed to look up product. Check your connection.', 'error');
      }
    }
    setBarcodeLooking(false);
  };

  // Search only fires on explicit action (Enter key or Search button), not while typing

  // ==================== RING HELPERS ====================
  const isDarkMode = isDark;
  const MACRO_COLORS = {
    'ring-protein': isDarkMode ? '#2dd4bf' : '#14b8a6',
    'ring-cals':    'var(--color-primary)',
    'ring-water':   isDarkMode ? '#60a5fa' : '#3b82f6',
  };
  const NUT_RING_RADIUS = 80;
  const NUT_RING_CIRC = 2 * Math.PI * NUT_RING_RADIUS;

  const renderMacroRing = (label, shortLabel, current, target, colorClass) => {
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    const offset = NUT_RING_CIRC - (pct / 100) * NUT_RING_CIRC;
    const color = MACRO_COLORS[colorClass] || '#14b8a6';
    return (
      <div className="nut-ring-wrap">
        <svg className="nut-ring-svg" viewBox="0 0 200 200">
          <circle className="nut-arc-track" cx="100" cy="100" r={NUT_RING_RADIUS} />
          <circle className="nut-arc-fill" cx="100" cy="100" r={NUT_RING_RADIUS}
            style={{ stroke: color }}
            strokeDasharray={NUT_RING_CIRC}
            strokeDashoffset={offset} />
        </svg>
        <div className="nut-ring-center">
          <span className="nut-ring-value" style={{ color }}>{Math.round(current)}</span>
          <span className="nut-ring-target">/ {target}{label === 'Calories' ? '' : 'g'}</span>
          <span className="nut-ring-label" style={{ color }}>{shortLabel}</span>
        </div>
        <span className="nut-ring-pct" style={{ color }}>{pct}%</span>
      </div>
    );
  };

  // Brief delay after barcode detected, then fetch (reduced from 1500ms to 800ms)
  useEffect(() => {
    if (!scanDetected) return;
    const timer = setTimeout(() => {
      const code = scanDetected;
      stopScanner();
      fetchProductByBarcode(code);
    }, 800);
    return () => clearTimeout(timer);
  }, [scanDetected]);

  // ==================== HUB: Load streak, week data, hub favourites ====================
  useEffect(() => {
    if (!clientData?.id || !targets?.protein) return;
    const loadHubData = async () => {
      try {
        const streakDayKeys = Array.from({ length: 30 }, (_, i) => getDateKey(i));
        const dayKeys = streakDayKeys.slice(0, 7);
        const allDayDocs = await Promise.all(
          streakDayKeys.map(k => getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${k}`)))
        );
        const weekDocs = allDayDocs.slice(0, 7);

        // Week data for adherence bars
        const week = dayKeys.map((k, i) => {
          const d = weekDocs[i];
          if (!d.exists()) return { day: getDayLabel(i), calories: 0, logged: false };
          const entries = d.data().entries || [];
          const cal = entries.reduce((sum, e) => sum + (e.calories || 0), 0);
          return { day: getDayLabel(i), calories: cal, logged: entries.length > 0 };
        }).reverse();
        setWeekData(week);

        // Protein streak (up to 30 days)
        const todayEntries = todayLog.entries || [];
        const todayProtein = todayEntries.reduce((acc, e) => acc + (e.protein || 0), 0);
        const startIdx = todayProtein >= targets.protein ? 0 : 1;
        let s = 0;
        for (let i = startIdx; i < 30; i++) {
          const d = allDayDocs[i];
          if (!d.exists()) break;
          const dayProtein = (d.data().entries || []).reduce((acc, e) => acc + (e.protein || 0), 0);
          if (dayProtein >= targets.protein) { s++; } else { break; }
        }
        setStreak(s);
      } catch (err) {
        console.error('Error loading hub data:', err);
      }
    };
    loadHubData();
  }, [clientData?.id, targets?.protein, todayLog.entries]);

  // Load hub favourites for quick-add chips
  useEffect(() => {
    if (!clientData?.id) return;
    getDoc(doc(db, 'favouriteFoods', clientData.id)).then(snap => {
      if (snap.exists()) setHubFavourites((snap.data().items || []).slice(0, 6));
    }).catch(() => {});
  }, [clientData?.id, favTick]);

  // Hub: Quick-add a favourite to today's log (with meal selection)
  const quickAddFavourite = useCallback(async (fav, mealKey) => {
    if (!clientData?.id) return;
    setPendingQuickAdd(null);
    const todayKey = getTodayKey();
    const entry = {
      id: Date.now(), name: fav.name,
      protein: fav.protein || 0, calories: fav.calories || 0,
      serving: fav.serving || '', meal: mealKey,
      addedAt: new Date().toISOString(),
      per100g: fav.per100g || null, servingUnit: fav.servingUnit || 'g',
      portion: fav.portion || null,
    };
    if (selectedDate === todayKey) {
      const newEntries = [...todayLog.entries, entry];
      const newLog = { entries: newEntries };
      setTodayLog(newLog);
      saveLog(newLog);
    } else {
      setSelectedDate(todayKey);
      const logRef = doc(db, 'nutritionLogs', `${clientData.id}_${todayKey}`);
      const existingDoc = await getDoc(logRef);
      const existingEntries = existingDoc.exists() ? existingDoc.data().entries || [] : [];
      const newEntries = [...existingEntries, entry];
      await setDoc(logRef, { clientId: clientData.id, date: todayKey, entries: newEntries, updatedAt: Timestamp.now() });
    }
    trackFavouriteQuickAdded(fav.name);
    setQuickAddToast(fav.name);
    setTimeout(() => setQuickAddToast(null), 2500);
  }, [clientData?.id, todayLog.entries, selectedDate]);

  // Hub: Greeting
  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Hub: Nudge text
  const getNudgeText = () => {
    if (!targets) return null;
    const protLeft = Math.max(0, Math.round(targets.protein - totals.protein));
    const calLeft = Math.max(0, Math.round(targets.calories - totals.calories));
    if (protLeft <= 0 && calLeft <= 0) return "You've hit all your targets today!";
    if (protLeft <= 5 && protLeft > 0) return `Only ${protLeft}g protein to go — you're almost there!`;
    if (protLeft > 0 && calLeft > 0) return `${protLeft}g protein and ${calLeft} cals remaining today`;
    if (protLeft > 0) return `${protLeft}g protein left to hit your target`;
    return `${calLeft} calories remaining today`;
  };

  // Hub: Mini ring renderer
  const MACRO_COLORS_HUB = {
    protein: isDark ? '#2dd4bf' : '#14b8a6',
    cals: 'var(--color-primary)',
    water: isDark ? '#60a5fa' : '#3b82f6',
  };
  const RING_R = 34;
  const RING_R_MAIN = 50;
  const RING_C = 2 * Math.PI * RING_R;
  const RING_C_MAIN = 2 * Math.PI * RING_R_MAIN;

  const renderMiniRing = (label, current, target, colorKey, isMain = false) => {
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    const r = isMain ? RING_R_MAIN : RING_R;
    const c = isMain ? RING_C_MAIN : RING_C;
    const vb = isMain ? '0 0 120 120' : '0 0 80 80';
    const cx = isMain ? 60 : 40;
    const offset = c - (pct / 100) * c;
    const color = MACRO_COLORS_HUB[colorKey];
    return (
      <div className={`nhub-ring-wrap${isMain ? ' nhub-ring-main' : ''}`}>
        <svg className="nhub-ring-svg" viewBox={vb}>
          <circle className="nhub-ring-track" cx={cx} cy={cx} r={r} />
          <circle className="nhub-ring-fill" cx={cx} cy={cx} r={r}
            style={{ stroke: color }} strokeDasharray={c} strokeDashoffset={offset} />
        </svg>
        <div className="nhub-ring-center">
          <span className="nhub-ring-value" style={{ color }}>{label === 'Water' ? `${current}ml` : Math.round(current)}</span>
          <span className="nhub-ring-unit">{label === 'Cals' ? '' : label === 'Water' ? '' : 'g'}</span>
        </div>
        <span className="nhub-ring-label">{label}</span>
        <span className="nhub-ring-pct" style={{ color }}>{pct}%</span>
      </div>
    );
  };

  // Hub: FAB handler
  const openFabAction = (mode) => {
    setFabOpen(false);
    if (mode === 'scan') { setAddMode('scan'); setScannedProduct(null); }
    else if (mode === 'manual') { setAddMode('manual'); setManualForm({ name: '', protein: '', calories: '', serving: '' }); }
    else if (mode === 'favourites') { setAddMode('favourites'); }
    else { setAddMode('search'); setSearchResults([]); setSearchQuery(''); }
  };

  if (authLoading || view === 'loading') {
    return (
      <div className="nut-hub-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          </div>
        </header>
        <div className="nut-hub-loading"><div className="cb-loading-spinner" /></div>
      </div>
    );
  }

  // ==================== SETUP VIEW (Macro Calculator) ====================
  if (view === 'setup') {
    return (
      <div className="nut-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => targets ? setView('dashboard') : navigate('/client/core-buddy')} aria-label="Go back">
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

        <main className="nut-main">

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

            {/* Daily Activity */}
            <div className="nut-form-group">
              <label>Daily Activity (outside of training)</label>
              <select value={formData.dailyActivity} onChange={e => { setFormData(p => ({ ...p, dailyActivity: e.target.value })); setCalcResults(null); }}>
                <option value="sedentary">Sedentary — desk job, under 5k steps</option>
                <option value="light">Lightly Active — office + walking, 5-8k steps</option>
                <option value="moderate">Moderately Active — on feet often, 8-12k steps</option>
                <option value="active">Very Active — physical job, 12k+ steps</option>
              </select>
            </div>

            {/* Training Frequency */}
            <div className="nut-form-group">
              <label>Training Sessions per Week</label>
              <select value={formData.trainingFrequency} onChange={e => { setFormData(p => ({ ...p, trainingFrequency: e.target.value })); setCalcResults(null); }}>
                <option value="low">1-2 sessions</option>
                <option value="moderate">3-4 sessions</option>
                <option value="high">5-6 sessions</option>
                <option value="daily">7+ sessions</option>
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
                    <strong>Mild</strong><span>15% below TDEE</span>
                  </button>
                  <button className={formData.deficitLevel === 'moderate' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, deficitLevel: 'moderate' })); setCalcResults(null); }}>
                    <strong>Moderate</strong><span>20% below TDEE</span>
                  </button>
                  <button className={formData.deficitLevel === 'harsh' ? 'active' : ''} onClick={() => { setFormData(p => ({ ...p, deficitLevel: 'harsh' })); setCalcResults(null); }}>
                    <strong>Aggressive</strong><span>25% below TDEE</span>
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
                {renderMacroRing('Calories', 'Calories', calcResults.calories, calcResults.calories, 'ring-cals')}
              </div>
              <div className="nut-calc-info">
                <div className="nut-calc-info-row">
                  <span>BMR (body at rest)</span><span>{calcResults.bmr} cal</span>
                </div>
                <div className="nut-calc-info-row">
                  <span>+ Daily activity (NEAT)</span><span>{calcResults.neat} cal</span>
                </div>
                <div className="nut-calc-info-row">
                  <span>+ Training sessions</span><span>+{calcResults.exerciseAdd} cal</span>
                </div>
                <div className="nut-calc-info-row" style={{ fontWeight: 600 }}>
                  <span>TDEE (total burn)</span><span>{calcResults.tdee} cal</span>
                </div>
              </div>
              <button className="nut-save-targets-btn" onClick={saveTargets}>Set as My Daily Targets</button>
            </div>
          )}
        </main>

        {toast && (
          <div className={`toast-notification ${toast.type}`}>
            {toast.message}
          </div>
        )}
      </div>
    );
  }

  // ==================== WEEK CALENDAR HELPERS ====================
  const getWeekDays = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    const day = d.getDay(); // 0=Sun
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const days = [];
    for (let i = 0; i < 7; i++) {
      const dd = new Date(monday);
      dd.setDate(monday.getDate() + i);
      days.push(dd.toISOString().split('T')[0]);
    }
    return days;
  };
  const WEEK_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const openAddForMeal = (mealKey, mode = 'search') => {
    setSelectedMeal(mealKey);
    if (mode === 'scan') { setAddMode('scan'); setScannedProduct(null); }
    else if (mode === 'manual') { setAddMode('manual'); setManualForm({ name: '', protein: '', calories: '', serving: '' }); }
    else if (mode === 'favourites') { setAddMode('favourites'); }
    else { setAddMode('search'); setSearchResults([]); setSearchQuery(''); }
  };

  // ==================== DASHBOARD VIEW ====================
  const weekDays = getWeekDays(selectedDate);
  const selDateObj = new Date(selectedDate + 'T12:00:00');
  const weekMonthLabel = `${MONTH_NAMES[selDateObj.getMonth()]} ${selDateObj.getFullYear()}`;

  // Today's meals grouped (for hub display)
  const mealGroups = MEALS.map(m => {
    const entries = (todayLog.entries || []).filter(e => (e.meal || e.mealType || 'snacks') === m.key);
    const cal = entries.reduce((s, e) => s + (e.calories || 0), 0);
    return { ...m, entries, cal };
  });

  return (
    <>
    <div className="nut-hub-page">
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
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

      <main className="nut-hub-main">
        {/* ===== GREETING + STREAK ===== */}
        <div className="nhub-top-section">
          <div className="nhub-greeting-row">
            <div className="nhub-greeting">
              <h2>{getGreeting()}</h2>
              <p>Here&apos;s your nutrition today</p>
            </div>
            {streak > 0 && (
              <div className="nhub-streak">
                <div className="nhub-streak-flame">
                  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M12 23c-3.866 0-7-3.134-7-7 0-3.527 3.397-6.67 5-9.338C11.602 9.33 19 12.473 19 16c0 3.866-3.134 7-7 7zm0-2c2.761 0 5-2.239 5-5 0-1.94-2.476-4.178-5-6.71C9.476 11.822 7 14.06 7 16c0 2.761 2.239 5 5 5z"/>
                  </svg>
                </div>
                <span className="nhub-streak-count">{streak}</span>
                <span className="nhub-streak-label">day{streak !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>

          {/* Macro rings — Protein (main/centre), Calories, Water */}
          <div className="nhub-rings-row nhub-rings-3">
            <div className="nhub-rings-side">
              {renderMiniRing('Cals', totals.calories, targets.calories, 'cals')}
            </div>
            <div className="nhub-rings-center">
              {renderMiniRing('Protein', totals.protein, targets.protein, 'protein', true)}
            </div>
            <div className="nhub-rings-side">
              <div
                className={`nhub-ring-wrap nhub-water-ring${waterMl >= WATER_TARGET ? ' nhub-water-full' : ''}${waterHolding ? ' nhub-water-holding' : ''}${waterBurst ? ' nhub-water-burst' : ''}`}
                style={waterHolding ? {
                  '--hold-scale': 1 + waterHoldProgress * 0.12,
                  '--hold-glow': waterHoldProgress,
                } : undefined}
                onMouseDown={onWaterHoldStart}
                onMouseUp={onWaterHoldEnd}
                onMouseLeave={onWaterHoldEnd}
                onTouchStart={onWaterHoldStart}
                onTouchEnd={onWaterHoldEnd}
                onTouchCancel={onWaterHoldEnd}
                role="button"
                tabIndex={0}
                aria-label="Hold to log 500ml water"
              >
                <svg className="nhub-ring-svg" viewBox="0 0 80 80">
                  <circle className="nhub-ring-track" cx="40" cy="40" r={RING_R} />
                  <circle className="nhub-ring-fill" cx="40" cy="40" r={RING_R}
                    style={{ stroke: MACRO_COLORS_HUB.water }}
                    strokeDasharray={RING_C}
                    strokeDashoffset={RING_C - (Math.min(100, Math.round((waterMl / WATER_TARGET) * 100)) / 100) * RING_C} />
                  {/* Burst ring on success */}
                  {waterBurst && (
                    <circle className="nhub-water-burst-ring" cx="40" cy="40" r={RING_R}
                      fill="none" strokeWidth="3"
                      style={{ stroke: MACRO_COLORS_HUB.water }} />
                  )}
                </svg>
                <div className="nhub-ring-center">
                  <span className="nhub-ring-value" style={{ color: MACRO_COLORS_HUB.water }}>{waterMl >= 1000 ? `${(waterMl / 1000).toFixed(waterMl % 1000 === 0 ? 0 : 1)}L` : `${waterMl}ml`}</span>
                </div>
                <span className="nhub-ring-label">Water</span>
                <span className="nhub-ring-pct" style={{ color: MACRO_COLORS_HUB.water }}>
                  {waterMl >= WATER_TARGET ? 'Done' : `${Math.round((waterMl / WATER_TARGET) * 100)}%`}
                </span>
                {waterMl < WATER_TARGET && !waterHolding && <span className="nhub-water-hint">Hold +500ml</span>}
              </div>
            </div>
          </div>

          {/* Macro targets CTA */}
          <button className="nhub-macro-cta" onClick={() => { setView('setup'); setCalcResults(null); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {targets?.goal ? (
                <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>
              ) : (
                <><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></>
              )}
            </svg>
            {targets?.goal ? 'Edit Macros' : 'Set Macro Targets'}
          </button>

          {/* Remaining nudge */}
          {getNudgeText() && (
            <div className={`nhub-nudge ${totals.protein >= (targets.protein || 0) ? 'nhub-nudge--complete' : ''}`}>
              {totals.protein >= (targets.protein || 0) ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              )}
              <span>{getNudgeText()}</span>
            </div>
          )}
        </div>

        {/* ===== AI SCANNER CARD ===== */}
        <div className="nhub-actions-section">
          <div className="nut-hub-card nut-hub-card--ai"
            onClick={() => navigate('/client/core-buddy/nutrition/ai-scanner')}
            role="button" tabIndex={0}
          >
            <div className="nut-hub-card-icon nut-hub-card-icon--ai">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
            <div className="nut-hub-card-body">
              <h3>AI Food Scanner</h3>
              <p>Upload photos of your meals for automatic macro analysis</p>
            </div>
            <svg className="nut-hub-card-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </div>

        {/* ===== WEEK CALENDAR STRIP ===== */}
        <div className="nut-week-strip">
            <div className="nut-week-header">
              <button className="nut-week-arrow" onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() - 7); const key = d.toISOString().split('T')[0]; setSelectedDate(key); }} aria-label="Previous week">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button className="nut-week-month-label" onClick={() => { setCalendarOpen(!calendarOpen); setCalendarMonth({ year: selDateObj.getFullYear(), month: selDateObj.getMonth() }); }}>
                {weekMonthLabel}
              </button>
              <button className="nut-week-arrow" onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() + 7); const key = d.toISOString().split('T')[0]; setSelectedDate(key); }} aria-label="Next week">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <div className="nut-week-days">
              {weekDays.map((dayKey, i) => {
                const dayNum = new Date(dayKey + 'T12:00:00').getDate();
                const isSel = dayKey === selectedDate;
                const isTodayDay = dayKey === getTodayKey();
                return (
                  <button key={dayKey} className={`nut-week-day${isSel ? ' selected' : ''}${isTodayDay ? ' today' : ''}`}
                    onClick={() => setSelectedDate(dayKey)}>
                    <span className="nut-week-day-letter">{WEEK_LABELS[i]}</span>
                    <span className="nut-week-day-num">{dayNum}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendar Dropdown */}
          {calendarOpen && (
            <div className="nut-calendar">
              <div className="nut-cal-header">
                <button onClick={() => setCalendarMonth(p => {
                  let m = p.month - 1, y = p.year;
                  if (m < 0) { m = 11; y--; }
                  return { year: y, month: m };
                })}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span>{MONTH_NAMES[calendarMonth.month]} {calendarMonth.year}</span>
                <button onClick={() => setCalendarMonth(p => {
                  let m = p.month + 1, y = p.year;
                  if (m > 11) { m = 0; y++; }
                  return { year: y, month: m };
                })}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
              <div className="nut-cal-days-header">
                {DAY_LABELS.map(d => <span key={d}>{d}</span>)}
              </div>
              <div className="nut-cal-grid">
                {[...Array(getFirstDayOfMonth(calendarMonth.year, calendarMonth.month))].map((_, i) => (
                  <span key={`e${i}`} />
                ))}
                {[...Array(getDaysInMonth(calendarMonth.year, calendarMonth.month))].map((_, i) => {
                  const day = i + 1;
                  const dateKey = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isSelected = dateKey === selectedDate;
                  const isTodayDate = dateKey === getTodayKey();
                  return (
                    <button key={day} className={`nut-cal-day${isSelected ? ' selected' : ''}${isTodayDate ? ' today' : ''}`}
                      onClick={() => { setSelectedDate(dateKey); setCalendarOpen(false); }}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        {/* ===== QUICK-ADD FAVOURITES ===== */}
        {hubFavourites.length > 0 && (
          <div className="nhub-favs-section">
            <div className="nhub-section-header">
              <span className="nhub-section-title">Quick Add</span>
              <span className="nhub-section-subtitle">Tap to log</span>
            </div>
            <div className="nhub-favs-scroll">
              {hubFavourites.map((fav, i) => (
                <button key={i} className="nhub-fav-chip" onClick={() => setPendingQuickAdd(fav)}>
                  <span className="nhub-fav-name">{fav.name}</span>
                  <span className="nhub-fav-cal">{Math.round(fav.calories)} cal</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions Row */}
        <div className="nhub-quick-row">
          <button className="nhub-copy-day-btn" onClick={() => { setCopyFromOpen(true); setCopyFromMonth({ year: new Date().getFullYear(), month: new Date().getMonth() }); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span>Copy day</span>
          </button>
        </div>

        {/* Meal Sections - always show all 4 */}
        <div className="nut-log-section">
          <div className="nut-meals-list">
              {MEALS.map(m => {
                const items = todayLog.entries.filter(e => (e.meal || e.mealType || 'snacks') === m.key);
                const mealTotals = items.reduce((acc, e) => ({
                  protein: acc.protein + (e.protein || 0),
                  calories: acc.calories + (e.calories || 0)
                }), { protein: 0, calories: 0 });
                return (
                  <div key={m.key} className="nut-meal-card">
                    <div className="nut-meal-card-header">
                      <span className={`nut-meal-card-icon nut-meal-icon-${m.key}`}>{MEAL_ICONS[m.key]}</span>
                      <span className="nut-meal-card-title">{m.label}</span>
                      {items.length > 0 && <span className="nut-meal-card-cal">{mealTotals.calories} cal</span>}
                    </div>
                    {/* Mini macro progress bars */}
                    {items.length > 0 && (
                      <div className="nut-meal-bars">
                        <div className="nut-meal-bar-row">
                          <span className="nut-meal-bar-label nut-macro-p">P</span>
                          <div className="nut-meal-bar-track"><div className="nut-meal-bar-fill bar-protein" style={{ width: `${Math.min(100, targets.protein > 0 ? (mealTotals.protein / targets.protein) * 100 : 0)}%` }} /></div>
                          <span className="nut-meal-bar-val">{mealTotals.protein}g</span>
                        </div>
                        <div className="nut-meal-bar-row">
                          <span className="nut-meal-bar-label nut-macro-cal">K</span>
                          <div className="nut-meal-bar-track"><div className="nut-meal-bar-fill bar-cals" style={{ width: `${Math.min(100, targets.calories > 0 ? (mealTotals.calories / targets.calories) * 100 : 0)}%` }} /></div>
                          <span className="nut-meal-bar-val">{mealTotals.calories}</span>
                        </div>
                      </div>
                    )}
                    {items.length > 0 && (
                      <div className="nut-log-list">
                        {items.map(entry => (
                          <div key={entry.id} className="nut-log-item" onClick={() => openEditEntry(entry)} role="button" tabIndex={0}>
                            <button
                              className={`nut-fav-star log${isFavourite(entry.name) ? ' active' : ''}`}
                              onClick={(e) => { e.stopPropagation(); toggleFavourite(entry); }}
                              aria-label={isFavourite(entry.name) ? 'Remove from favourites' : 'Add to favourites'}
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill={isFavourite(entry.name) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                            </button>
                            <div className="nut-log-item-info">
                              <span className="nut-log-item-name">{entry.name}</span>
                              {entry.serving && <span className="nut-log-item-serving">{entry.serving}</span>}
                            </div>
                            <div className="nut-log-item-macros">
                              <span className="nut-macro-p">{entry.protein}p</span>
                              <span className="nut-macro-cal">{entry.calories} cal</span>
                            </div>
                              <button className="nut-log-delete" onClick={(e) => { e.stopPropagation(); removeEntry(entry.id); }} aria-label="Remove">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {items.length === 0 && (
                      <div className="nut-meal-empty">
                        <p>Use the + button to add food</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        {/* ===== WEEKLY ADHERENCE ===== */}
        {weekData.length > 0 && (
          <div className="nhub-week-section">
            <div className="nhub-section-header">
              <span className="nhub-section-title">This Week</span>
            </div>
            <div className="nhub-week-bars">
              {weekData.map((d, i) => {
                const pct = targets?.calories > 0 ? Math.min(100, Math.round((d.calories / targets.calories) * 100)) : 0;
                const isToday = i === weekData.length - 1;
                let barClass = 'nhub-bar-empty';
                if (d.logged && pct >= 80) barClass = 'nhub-bar-good';
                else if (d.logged && pct >= 50) barClass = 'nhub-bar-mid';
                else if (d.logged) barClass = 'nhub-bar-low';
                return (
                  <div key={i} className={`nhub-bar-col ${isToday ? 'nhub-bar-today' : ''}`}>
                    <div className="nhub-bar-track">
                      <div className={`nhub-bar-fill ${barClass}`} style={{ height: `${Math.max(d.logged ? 8 : 0, pct)}%` }} />
                    </div>
                    <span className="nhub-bar-day">{d.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* ===== FAB (Floating Action Button) ===== */}
      <button className={`nhub-fab${fabOpen ? ' nhub-fab-hidden' : ''}`} onClick={() => setFabOpen(true)} aria-label="Add food">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>

      {fabOpen && (
        <div className="nhub-fab-overlay" onClick={() => setFabOpen(false)}>
          <div className="nhub-fab-sheet" onClick={e => e.stopPropagation()}>
            <div className="nhub-fab-header">
              <h3>Add Food</h3>
              <button className="nhub-fab-close" onClick={() => setFabOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="nhub-fab-meals">
              {MEALS.map(m => (
                <button key={m.key} className={`nhub-fab-meal-btn${selectedMeal === m.key ? ' active' : ''}`}
                  onClick={() => setSelectedMeal(m.key)}>{m.label}</button>
              ))}
            </div>
            <div className="nhub-fab-grid">
              <button className="nhub-fab-item" onClick={() => openFabAction('search')}>
                <span className="nhub-fab-item-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </span>
                <span className="nhub-fab-item-label">Search Food</span>
              </button>
              <button className="nhub-fab-item" onClick={() => openFabAction('scan')}>
                <span className="nhub-fab-item-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
                </span>
                <span className="nhub-fab-item-label">Scan Barcode</span>
              </button>
              <button className="nhub-fab-item" onClick={() => openFabAction('manual')}>
                <span className="nhub-fab-item-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </span>
                <span className="nhub-fab-item-label">Manual Entry</span>
              </button>
              <button className="nhub-fab-item" onClick={() => openFabAction('favourites')}>
                <span className="nhub-fab-item-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                </span>
                <span className="nhub-fab-item-label">Favourites</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== COPY FROM DAY MODAL ==================== */}
      {copyFromOpen && (
        <div className="nut-modal-overlay" onClick={() => setCopyFromOpen(false)}>
          <div className="nut-copy-from-popup" onClick={e => e.stopPropagation()}>
            <div className="nut-copy-from-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <span>Copy from...</span>
              <button className="nut-modal-close" onClick={() => setCopyFromOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <p className="nut-copy-from-hint">Pick a day to copy its food log into today</p>
            <div className="nut-cal-header">
              <button onClick={() => setCopyFromMonth(p => {
                let m = p.month - 1, y = p.year;
                if (m < 0) { m = 11; y--; }
                return { year: y, month: m };
              })}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span>{MONTH_NAMES[copyFromMonth.month]} {copyFromMonth.year}</span>
              <button onClick={() => setCopyFromMonth(p => {
                let m = p.month + 1, y = p.year;
                if (m > 11) { m = 0; y++; }
                return { year: y, month: m };
              })} disabled={copyFromMonth.year === new Date().getFullYear() && copyFromMonth.month >= new Date().getMonth()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <div className="nut-cal-days-header">
              {DAY_LABELS.map(d => <span key={d}>{d}</span>)}
            </div>
            <div className="nut-cal-grid">
              {[...Array(getFirstDayOfMonth(copyFromMonth.year, copyFromMonth.month))].map((_, i) => (
                <span key={`e${i}`} />
              ))}
              {[...Array(getDaysInMonth(copyFromMonth.year, copyFromMonth.month))].map((_, i) => {
                const day = i + 1;
                const dateKey = `${copyFromMonth.year}-${String(copyFromMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isFuture = dateKey > getTodayKey();
                const isCurrent = dateKey === selectedDate;
                const isTodayDate = dateKey === getTodayKey();
                const isDisabled = isFuture || isCurrent;
                return (
                  <button key={day} className={`nut-cal-day${isCurrent ? ' selected' : ''}${isTodayDate ? ' today' : ''}${isFuture ? ' future' : ''}`}
                    disabled={isDisabled} onClick={() => copyFromDay(dateKey)}>
                    {day}
                  </button>
                );
              })}
            </div>
            {copyingDay && (
              <div className="nut-copy-from-loading">
                <div className="wk-loading-spinner" />
                <span>Copying...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== ADD FOOD MODAL ==================== */}
      {addMode && (
        <div className="nut-modal-overlay" onClick={() => { stopScanner(); setScanDetected(null); setAddMode(null); setScannedProduct(null); }}>
          <div className="nut-modal" onClick={e => e.stopPropagation()}>
            <div className="nut-modal-header">
              <h3>{addMode === 'scan' ? 'Scan Barcode' : addMode === 'search' ? 'Search Food' : addMode === 'favourites' ? 'Favourites' : 'Manual Entry'}</h3>
              <button className="nut-modal-close" onClick={() => { stopScanner(); setScanDetected(null); setAddMode(null); setScannedProduct(null); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* SCAN MODE */}
            {addMode === 'scan' && !scannedProduct && (
              <ScannerView
                scannerTargetRef={scannerTargetRef}
                scannerActive={scannerActive}
                scanDetected={scanDetected}
                startScanner={startScanner}
                manualBarcode={manualBarcode}
                setManualBarcode={setManualBarcode}
                onManualLookup={(code) => fetchProductByBarcode(code)}
                barcodeLooking={barcodeLooking}
              />
            )}

            {/* SCANNED PRODUCT RESULT */}
            {addMode === 'scan' && scannedProduct && (
              <ProductResult
                product={scannedProduct}
                servingMode={servingMode}
                setServingMode={setServingMode}
                servingInput={servingInput}
                setServingInput={setServingInput}
                portionCount={portionCount}
                setPortionCount={setPortionCount}
                isFavourite={isFavourite(scannedProduct.name)}
                onToggleFavourite={toggleFavourite}
                onAdd={addFoodEntry}
                onBack={() => { setScannedProduct(null); setAddMode('scan'); }}
                backLabel="Scan Again"
              />
            )}

            {/* SEARCH MODE */}
            {addMode === 'search' && !scannedProduct && (
              <div className="nut-search-area">
                <div className="nut-search-bar">
                  <input type="text" ref={searchInputRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { trackFoodSearched(searchQuery); searchFood(searchQuery); } }}
                    onFocus={() => setTimeout(() => searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350)}
                    placeholder="Search food or product..." autoFocus />
                  <button onClick={() => { trackFoodSearched(searchQuery); searchFood(searchQuery); }} disabled={searchLoading}>
                    {searchLoading ? '...' : 'Search'}
                  </button>
                </div>
                {getCountryLabel() && (
                  <p className="nut-search-country-hint">Showing {getCountryLabel()} products first</p>
                )}
                {searchLoading && <SearchLoadingOverlay />}
                <div className="nut-search-results">
                  {!searchLoading && searchResults.map((item, i) => (
                    <button key={i} className="nut-search-item" onClick={() => { setScannedProduct(item); if (item.portion) { setPortionCount(1); setServingInput(String(item.portion.weight)); setServingMode('portion'); } else { setPortionCount(0); setServingInput(String(item.servingValue || 100)); setServingMode('weight'); } }}>
                      {item.image && <img src={item.image} alt={item.name || 'Product'} loading="lazy" />}
                      <div className="nut-search-item-info">
                        <span className="nut-search-item-name">{item.name}</span>
                        {item.brand && <span className="nut-search-item-brand">{item.brand}</span>}
                        <span className="nut-search-item-macros">{item.calories} cal · {item.protein}p per 100{item.servingUnit || 'g'}</span>
                      </div>
                    </button>
                  ))}
                  {searchResults.length === 0 && searchQuery && !searchLoading && (
                    <p className="nut-search-empty">No results found. Try a different search or use manual entry.</p>
                  )}
                </div>
                <p className="nut-off-credit">Food data powered by <a href="https://openfoodfacts.org" target="_blank" rel="noopener noreferrer">Open Food Facts</a></p>
              </div>
            )}

            {/* SEARCH - SELECTED PRODUCT */}
            {addMode === 'search' && scannedProduct && (
              <ProductResult
                product={scannedProduct}
                servingMode={servingMode}
                setServingMode={setServingMode}
                servingInput={servingInput}
                setServingInput={setServingInput}
                portionCount={portionCount}
                setPortionCount={setPortionCount}
                isFavourite={isFavourite(scannedProduct.name)}
                onToggleFavourite={toggleFavourite}
                onAdd={addFoodEntry}
                onBack={() => setScannedProduct(null)}
                backLabel="Back to Search"
              />
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
                    <label>Calories</label>
                    <input type="number" value={manualForm.calories} onChange={e => setManualForm(p => ({ ...p, calories: e.target.value }))} min="0" />
                  </div>
                </div>
                <button className="nut-btn-primary" disabled={!manualForm.name.trim()} onClick={() => addFoodEntry({
                  name: manualForm.name,
                  protein: parseFloat(manualForm.protein) || 0,
                  calories: parseFloat(manualForm.calories) || 0,
                  serving: manualForm.serving || ''
                })}>Add Food</button>
              </div>
            )}

            {/* FAVOURITES MODE */}
            {addMode === 'favourites' && !scannedProduct && (() => {
              const favs = getFavourites();
              const selectItem = (item) => {
                if (item.per100g) {
                  const p100 = item.per100g;
                  setScannedProduct({
                    name: item.name,
                    brand: '',
                    image: null,
                    servingSize: item.serving || '100g',
                    servingValue: 100,
                    servingUnit: item.servingUnit || 'g',
                    portion: item.portion || null,
                    protein: p100.protein,
                    calories: p100.calories,
                    per100g: true
                  });
                  if (item.portion) {
                    setPortionCount(1);
                    setServingInput(String(item.portion.weight));
                    setServingMode('portion');
                  } else {
                    setPortionCount(0);
                    setServingInput('100');
                    setServingMode('weight');
                  }
                } else {
                  addFoodEntry({
                    name: item.name,
                    protein: item.protein,
                    calories: item.calories,
                    serving: item.serving || ''
                  });
                }
              };
              return (
                <div className="nut-recent-area">
                  {favs.length === 0 ? (
                    <p className="nut-search-empty">No favourites yet. Tap the star on any food to save it here.</p>
                  ) : (
                    <div className="nut-recent-list">
                      {favs.map((item, i) => (
                        <div key={i} className="nut-recent-item-row">
                          <button className="nut-fav-star active"
                            onClick={(e) => { e.stopPropagation(); toggleFavourite(item); }}>
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor" strokeWidth="2">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                          </button>
                          <button className="nut-recent-item" onClick={() => selectItem(item)}>
                            <div className="nut-recent-item-info">
                              <span className="nut-recent-item-name">{item.name}</span>
                              <span className="nut-recent-item-serving">{item.serving || ''}</span>
                            </div>
                            <span className="nut-recent-item-macros">{item.calories} cal</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* RECENT - SELECTED PRODUCT (for adjustable re-add) */}
            {addMode === 'favourites' && scannedProduct && (
              <ProductResult
                product={scannedProduct}
                servingMode={servingMode}
                setServingMode={setServingMode}
                servingInput={servingInput}
                setServingInput={setServingInput}
                portionCount={portionCount}
                setPortionCount={setPortionCount}
                isFavourite={isFavourite(scannedProduct.name)}
                onToggleFavourite={toggleFavourite}
                onAdd={addFoodEntry}
                onBack={() => setScannedProduct(null)}
                backLabel="Back to Favourites"
              />
            )}
          </div>
        </div>
      )}

      {/* ==================== EDIT FOOD — AMOUNT PICKER ==================== */}
      {editingEntry && editProduct && (
        <div className="nut-modal-overlay">
          <div className="nut-search-panel" onClick={e => e.stopPropagation()}>
            <div className="nut-search-header">
              <h2>Edit Food</h2>
              <button className="nut-search-close" onClick={() => { setEditingEntry(null); setEditProduct(null); }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <ProductResult
              product={editProduct}
              servingMode={editServingMode}
              setServingMode={setEditServingMode}
              servingInput={editServingInput}
              setServingInput={setEditServingInput}
              portionCount={editPortionCount}
              setPortionCount={setEditPortionCount}
              isFavourite={isFavourite(editProduct.name)}
              onToggleFavourite={toggleFavourite}
              onAdd={saveEditFromPicker}
              onBack={() => { setEditingEntry(null); setEditProduct(null); }}
              backLabel="Cancel"
            />
            <div style={{ padding: '0 16px 16px' }}>
              <button className="nut-btn-danger" style={{ width: '100%' }} onClick={() => { removeEntry(editingEntry.id); setEditingEntry(null); setEditProduct(null); }}>Delete Entry</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== EDIT FOOD — FORM FALLBACK (manual/old entries) ==================== */}
      {editingEntry && !editProduct && (
        <div className="nut-modal-overlay" onClick={() => setEditingEntry(null)}>
          <div className="nut-modal nut-edit-modal" onClick={e => e.stopPropagation()}>
            <div className="nut-modal-header">
              <h3>Edit Food</h3>
              <button className="nut-modal-close" onClick={() => setEditingEntry(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="nut-manual-form">
              <div className="nut-form-group">
                <label>Food Name</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="nut-form-group">
                <label>Serving Size</label>
                <input type="text" value={editForm.serving} onChange={e => setEditForm(p => ({ ...p, serving: e.target.value }))} placeholder="e.g. 150g, 1 cup" />
              </div>
              <div className="nut-manual-macros">
                <div className="nut-form-group">
                  <label>Protein (g)</label>
                  <input type="number" inputMode="numeric" value={editForm.protein} onChange={e => setEditForm(p => ({ ...p, protein: e.target.value }))} min="0" />
                </div>
                <div className="nut-form-group">
                  <label>Calories</label>
                  <input type="number" inputMode="numeric" value={editForm.calories} onChange={e => setEditForm(p => ({ ...p, calories: e.target.value }))} min="0" />
                </div>
              </div>
              <div className="nut-edit-actions">
                <button className="nut-btn-danger" onClick={() => { removeEntry(editingEntry.id); setEditingEntry(null); }}>Delete</button>
                <button className="nut-btn-primary" disabled={!editForm.name.trim()} onClick={saveEditEntry}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Core Buddy Bottom Nav */}
      <CoreBuddyNav active="nutrition" />

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Quick-add meal picker */}
      {pendingQuickAdd && (
        <>
          <div className="nhub-qa-overlay" onClick={() => setPendingQuickAdd(null)} />
          <div className="nhub-qa-picker">
            <p className="nhub-qa-picker-label">Add <strong>{pendingQuickAdd.name}</strong> to:</p>
            <div className="nhub-qa-picker-options">
              {MEALS.map(m => (
                <button key={m.key} className="nhub-qa-picker-btn" onClick={() => quickAddFavourite(pendingQuickAdd, m.key)}>
                  <span className="nhub-qa-picker-icon">{MEAL_ICONS[m.key]}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Quick-add toast */}
      {quickAddToast && (
        <div className="nhub-toast">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
          <span>Added {quickAddToast}</span>
        </div>
      )}

      <BadgeCelebration badge={badgeCelebration} onDismiss={() => setBadgeCelebration(null)} />
    </div>
    </>
  );
}
