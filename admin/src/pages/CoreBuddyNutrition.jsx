import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../config/firebase';
import { awardBadge } from '../utils/awardBadge';
import { parseProduct } from '../utils/productParser';
import { getCountryLabel } from '../utils/countryDetect';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import useBarcodeScanner from '../hooks/useBarcodeScanner';
import useFoodSearch from '../hooks/useFoodSearch';
import ScannerView from '../components/ScannerView';
import ProductResult from '../components/ProductResult';
import { trackMealLogged, trackFoodSearched, trackBarcodeScanned, trackFavouriteSaved, trackDayCopied, trackAIScanStarted, trackAIScanCompleted, trackAIScanSaved } from '../utils/analytics';
import './CoreBuddyNutrition.css';
import CoreBuddyNav from '../components/CoreBuddyNav';

import BadgeCelebration from '../components/BadgeCelebration';

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
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

// AI Scanner constants
const MAX_SAVED_MEALS = 20;
const DAILY_SCAN_LIMIT = 10;
const AI_ANALYSING_MESSAGES = [
  'Identifying foods in your photo...',
  'Estimating portion sizes...',
  'Calculating macronutrients...',
  'Almost done, crunching the numbers...',
];
const AI_MEAL_EMOJIS = { breakfast: '\u2615', lunch: '\uD83C\uDF5C', dinner: '\uD83C\uDF7D\uFE0F', snacks: '\uD83C\uDF4E' };

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
        (blob) => { if (blob) resolve(blob); else reject(new Error('Failed to compress image.')); },
        'image/jpeg', 0.8
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image.')); };
    img.src = objectUrl;
  });
}

function fileToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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

export default function CoreBuddyNutrition() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Views: 'loading' | 'setup' | 'dashboard'
  const [view, setView] = useState('loading');

  // Macro targets (from Firestore)
  const [targets, setTargets] = useState(null);
  const [badgeCelebration, setBadgeCelebration] = useState(null);

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
  const [totals, setTotals] = useState({ protein: 0, carbs: 0, fats: 0, calories: 0 });
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
  const [manualForm, setManualForm] = useState({ name: '', protein: '', carbs: '', fats: '', calories: '', serving: '' });
  const [scannedProduct, setScannedProduct] = useState(null);
  const [servingInput, setServingInput] = useState('100');
  const [portionCount, setPortionCount] = useState(0);
  const [servingMode, setServingMode] = useState('weight');
  const [favTick, setFavTick] = useState(0);

  // Edit food entry
  const [editingEntry, setEditingEntry] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', protein: '', carbs: '', fats: '', calories: '', serving: '' });
  // Edit via amount picker (for entries with per100g data)
  const [editProduct, setEditProduct] = useState(null);
  const [editServingInput, setEditServingInput] = useState('100');
  const [editPortionCount, setEditPortionCount] = useState(0);
  const [editServingMode, setEditServingMode] = useState('weight');

  // Toast
  const [toast, setToast] = useState(null);

  // AI Scanner state
  const [aiStage, setAiStage] = useState('idle'); // idle|preview|analysing|results|saving
  const [aiImageFile, setAiImageFile] = useState(null);
  const [aiImagePreview, setAiImagePreview] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [aiAnalysingMsg, setAiAnalysingMsg] = useState(0);
  const [aiSavedMeals, setAiSavedMeals] = useState([]);
  const [aiSavedMealsLoaded, setAiSavedMealsLoaded] = useState(false);
  const [aiScansUsedToday, setAiScansUsedToday] = useState(0);
  const [aiScansLoaded, setAiScansLoaded] = useState(false);
  const [aiRecentFilter, setAiRecentFilter] = useState('all');
  const aiFileInputRef = useRef(null);

  const aiScansRemaining = DAILY_SCAN_LIMIT - aiScansUsedToday;
  const aiScanLimitReached = aiScansRemaining <= 0;

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
      carbs: acc.carbs + (e.carbs || 0),
      fats: acc.fats + (e.fats || 0),
      calories: acc.calories + (e.calories || 0)
    }), { protein: 0, carbs: 0, fats: 0, calories: 0 });
    setTotals(t);
  }, [todayLog.entries]);

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

    let targetCalories = tdee, proteinPerKg, fatPct;
    switch (formData.goal) {
      case 'lose':
        targetCalories = tdee * (1 - ({ light: 0.15, moderate: 0.20, harsh: 0.25 }[formData.deficitLevel]));
        proteinPerKg = 2.2; fatPct = 0.30; break;
      case 'build':
        targetCalories = tdee * 1.10; proteinPerKg = 2.0; fatPct = 0.22; break;
      default:
        proteinPerKg = 1.8; fatPct = 0.25;
    }
    targetCalories = Math.max(targetCalories, formData.gender === 'male' ? 1400 : 1100);

    const protein = Math.round(weightKg * proteinPerKg);
    const fats = Math.round((targetCalories * fatPct) / 9);
    const carbs = Math.max(0, Math.round((targetCalories - (protein * 4) - (fats * 9)) / 4));

    setCalcResults({
      calories: Math.round(targetCalories), protein, carbs, fats,
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
        carbs: calcResults.carbs,
        fats: calcResults.fats,
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
        carbs: entry.carbs,
        fats: entry.fats,
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
    setManualForm({ name: '', protein: '', carbs: '', fats: '', calories: '', serving: '' });
    showToast('Food added!', 'success');
  };

  const removeEntry = (id) => {
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
        carbs: p100.carbs,
        fats: p100.fats,
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
        carbs: String(entry.carbs || 0),
        fats: String(entry.fats || 0),
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
      carbs: parseFloat(editForm.carbs) || 0,
      fats: parseFloat(editForm.fats) || 0,
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
        if (product.calories === 0 && product.protein === 0 && product.carbs === 0) {
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
    'ring-carbs':   isDarkMode ? '#fbbf24' : '#f59e0b',
    'ring-fats':    isDarkMode ? '#a78bfa' : '#8b5cf6',
    'ring-cals':    'var(--color-primary)',
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

  // ==================== AI SCANNER EFFECTS ====================
  // Load saved meals + scan usage when AI scanner mode is opened
  useEffect(() => {
    if (!clientData?.id || addMode !== 'ai-scan') return;
    if (aiSavedMealsLoaded && aiScansLoaded) return;
    getDoc(doc(db, 'savedMeals', clientData.id)).then((snap) => {
      if (snap.exists()) {
        const meals = snap.data().meals || [];
        setAiSavedMeals(meals.sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0)));
      }
      setAiSavedMealsLoaded(true);
    }).catch(() => setAiSavedMealsLoaded(true));

    const today = getTodayKey();
    getDoc(doc(db, 'scanUsage', `${clientData.id}_${today}`)).then((snap) => {
      if (snap.exists()) setAiScansUsedToday(snap.data().count || 0);
      setAiScansLoaded(true);
    }).catch(() => setAiScansLoaded(true));
  }, [clientData?.id, addMode]);

  // Rotate analysing messages
  useEffect(() => {
    if (aiStage !== 'analysing') return;
    setAiAnalysingMsg(0);
    const interval = setInterval(() => {
      setAiAnalysingMsg((i) => (i + 1) % AI_ANALYSING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [aiStage]);

  // Auto-open AI scanner from URL param (?ai=1)
  useEffect(() => {
    if (view === 'dashboard' && searchParams.get('ai') === '1') {
      setSelectedMeal(getDefaultMeal());
      setAddMode('ai-scan');
      setAiStage('idle');
      // Remove the param so refreshing doesn't re-open
      searchParams.delete('ai');
      setSearchParams(searchParams, { replace: true });
    }
  }, [view, searchParams]);

  // ==================== AI SCANNER HANDLERS ====================
  const resetAiScanner = () => {
    setAiStage('idle');
    setAiImageFile(null);
    setAiImagePreview(null);
    setAiResult(null);
    setAiError(null);
    if (aiFileInputRef.current) aiFileInputRef.current.value = '';
  };

  const handleAiFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
    setAiImageFile(file);
    setAiImagePreview(URL.createObjectURL(file));
    setAiStage('preview');
    setAiResult(null);
    setAiError(null);
  };

  const handleAiAnalyse = async () => {
    if (!aiImageFile) return;
    if (aiScanLimitReached) { showToast('Daily scan limit reached. Re-log a previous scan instead!', 'error'); return; }
    setAiStage('analysing');
    setAiError(null);
    trackAIScanStarted();
    try {
      const compressed = await compressImage(aiImageFile, 512);
      const base64 = await fileToBase64(compressed);
      const analyseMeal = httpsCallable(functions, 'analyseMeal');
      const response = await analyseMeal({ imageBase64: base64, mimeType: 'image/jpeg' });
      setAiResult(response.data);
      setAiStage('results');
      trackAIScanCompleted({ itemCount: response.data.items.length, confidence: response.data.confidence });
      // Increment scan usage
      const today = getTodayKey();
      const newCount = aiScansUsedToday + 1;
      setAiScansUsedToday(newCount);
      setDoc(doc(db, 'scanUsage', `${clientData.id}_${today}`), {
        clientId: clientData.id, date: today, count: newCount, updatedAt: Timestamp.now(),
      }).catch(() => {});
    } catch (err) {
      console.error('AI analysis failed:', err);
      const msg = (err.message && err.message !== 'internal' && err.message !== 'INTERNAL')
        ? err.message : 'Failed to analyse meal. Please try again.';
      setAiError(msg);
      setAiStage('preview');
    }
  };

  const handleAiSave = async () => {
    if (!aiResult || !clientData?.id) return;
    setAiStage('saving');
    try {
      const today = getTodayKey();
      let photoUrl = null;
      // Upload photo if this is a new scan (not reuse)
      if (aiImageFile) {
        const imageId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const storageRef = ref(storage, `mealPhotos/${clientData.id}/${imageId}`);
        const compressed = await compressImage(aiImageFile, 800);
        await uploadBytes(storageRef, compressed);
        photoUrl = await getDownloadURL(storageRef);

        // Save to savedMeals for reuse
        const mealLabel = aiResult.items.map((i) => i.name).join(', ');
        const savedEntry = {
          id: imageId,
          label: mealLabel.length > 60 ? mealLabel.slice(0, 57) + '...' : mealLabel,
          items: aiResult.items, totals: aiResult.totals, confidence: aiResult.confidence,
          photoUrl, mealType: selectedMeal, usedAt: Date.now(),
        };
        const updatedMeals = [savedEntry, ...aiSavedMeals].slice(0, MAX_SAVED_MEALS);
        setAiSavedMeals(updatedMeals);
        setDoc(doc(db, 'savedMeals', clientData.id), { meals: updatedMeals, updatedAt: Timestamp.now() }).catch(() => {});
      } else {
        // Reuse — update usedAt
        const updatedMeals = aiSavedMeals.map((m) =>
          m.items === aiResult.items ? { ...m, usedAt: Date.now() } : m
        );
        setAiSavedMeals(updatedMeals);
        setDoc(doc(db, 'savedMeals', clientData.id), { meals: updatedMeals, updatedAt: Timestamp.now() }).catch(() => {});
      }

      // Build entries
      const newEntries = aiResult.items.map((item) => ({
        id: Date.now() + Math.random(),
        name: item.name,
        protein: item.protein || 0, carbs: item.carbs || 0,
        fats: item.fats || 0, calories: item.calories || 0,
        serving: `${item.estimatedGrams || 0}g (AI estimate)`,
        meal: selectedMeal,
        source: aiImageFile ? 'ai_scanner' : 'ai_scanner_reuse',
        aiConfidence: aiResult.confidence,
        ...(photoUrl ? { aiPhotoUrl: photoUrl } : {}),
        addedAt: new Date().toISOString(),
      }));

      // Add to local log immediately
      const mergedEntries = [...todayLog.entries, ...newEntries];
      const newLog = { entries: mergedEntries };
      setTodayLog(newLog);

      // Save to Firestore (only for today)
      if (selectedDate === today) {
        await setDoc(doc(db, 'nutritionLogs', `${clientData.id}_${today}`), {
          clientId: clientData.id, date: today, entries: mergedEntries, updatedAt: Timestamp.now(),
        });
      } else {
        await saveLog(newLog);
      }

      trackAIScanSaved({ meal: selectedMeal, itemCount: newEntries.length });
      showToast(`${newEntries.length} item${newEntries.length > 1 ? 's' : ''} added to ${MEALS.find(m => m.key === selectedMeal)?.label}`, 'success');

      // Close modal and reset
      setTimeout(() => {
        setAddMode(null);
        resetAiScanner();
      }, 800);
    } catch (err) {
      console.error('AI save failed:', err);
      showToast('Failed to save. Please try again.', 'error');
      setAiStage('results');
    }
  };

  const handleAiReuse = (meal) => {
    setAiResult({ items: meal.items, totals: meal.totals, confidence: meal.confidence });
    setAiImagePreview(meal.photoUrl);
    setAiImageFile(null);
    setAiStage('results');
  };

  if (authLoading || view === 'loading') {
    return (
      <div className="nut-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => navigate('/client/core-buddy/nutrition')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          </div>
        </header>
        <div className="nut-loading-inline"><div className="cb-loading-spinner" /></div>
      </div>
    );
  }

  // ==================== SETUP VIEW (Macro Calculator) ====================
  if (view === 'setup') {
    return (
      <div className="nut-page">
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
                {renderMacroRing('Carbs', 'Carbs', calcResults.carbs, calcResults.carbs, 'ring-carbs')}
                {renderMacroRing('Fats', 'Fats', calcResults.fats, calcResults.fats, 'ring-fats')}
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
    else if (mode === 'manual') { setAddMode('manual'); setManualForm({ name: '', protein: '', carbs: '', fats: '', calories: '', serving: '' }); }
    else if (mode === 'favourites') { setAddMode('favourites'); }
    else if (mode === 'ai-scan') { setAddMode('ai-scan'); resetAiScanner(); }
    else { setAddMode('search'); setSearchResults([]); setSearchQuery(''); }
  };

  // ==================== DASHBOARD VIEW ====================
  const weekDays = getWeekDays(selectedDate);
  const selDateObj = new Date(selectedDate + 'T12:00:00');
  const weekMonthLabel = `${MONTH_NAMES[selDateObj.getMonth()]} ${selDateObj.getFullYear()}`;

  return (
    <>
    <div className="nut-page">
      {/* ===== DARK ZONE (top) ===== */}
      <div className="nut-dark-zone">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => navigate('/client/core-buddy/nutrition')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
            <div className="header-actions">
              <button onClick={() => { setView('setup'); setCalcResults(null); }} aria-label="Recalculate macros">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </button>
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

        <div className="nut-dark-content">

          {/* Week Calendar Strip */}
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

          {/* Macro Rings - 4 across */}
          <div className="nut-rings-row">
            {renderMacroRing('Protein', 'Protein', totals.protein, targets.protein, 'ring-protein')}
            {renderMacroRing('Carbs', 'Carbs', totals.carbs, targets.carbs, 'ring-carbs')}
            {renderMacroRing('Fats', 'Fats', totals.fats, targets.fats, 'ring-fats')}
            {renderMacroRing('Calories', 'kCal', totals.calories, targets.calories, 'ring-cals')}
          </div>
        </div>
      </div>

      {/* ===== LIGHT ZONE (bottom sheet) ===== */}
      <div className="nut-light-zone">
        <div className="nut-light-content">

          {/* Quick Actions Row */}
          {(
            <div className="nut-quick-row">
              <button className="nut-copy-day-btn" onClick={() => { setCopyFromOpen(true); setCopyFromMonth({ year: new Date().getFullYear(), month: new Date().getMonth() }); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span>Copy day</span>
              </button>
            </div>
          )}

          {/* Meal Sections - always show all 4 */}
          <div className="nut-log-section">
            <div className="nut-meals-list">
              {MEALS.map(m => {
                const items = todayLog.entries.filter(e => (e.meal || e.mealType || 'snacks') === m.key);
                const mealTotals = items.reduce((acc, e) => ({
                  protein: acc.protein + (e.protein || 0),
                  carbs: acc.carbs + (e.carbs || 0),
                  fats: acc.fats + (e.fats || 0),
                  calories: acc.calories + (e.calories || 0)
                }), { protein: 0, carbs: 0, fats: 0, calories: 0 });
                return (
                  <div key={m.key} className="nut-meal-card">
                    <div className="nut-meal-card-header">
                      <span className={`nut-meal-card-icon nut-meal-icon-${m.key}`}>{MEAL_ICONS[m.key]}</span>
                      <span className="nut-meal-card-title">{m.label}</span>
                      {items.length > 0 && <span className="nut-meal-card-cal">{mealTotals.calories} cal</span>}
                      <button className="nut-meal-add-btn" onClick={() => setAddPickerMeal(addPickerMeal === m.key ? null : m.key)} aria-label={`Add to ${m.label}`}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </button>
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
                          <span className="nut-meal-bar-label nut-macro-c">C</span>
                          <div className="nut-meal-bar-track"><div className="nut-meal-bar-fill bar-carbs" style={{ width: `${Math.min(100, targets.carbs > 0 ? (mealTotals.carbs / targets.carbs) * 100 : 0)}%` }} /></div>
                          <span className="nut-meal-bar-val">{mealTotals.carbs}g</span>
                        </div>
                        <div className="nut-meal-bar-row">
                          <span className="nut-meal-bar-label nut-macro-f">F</span>
                          <div className="nut-meal-bar-track"><div className="nut-meal-bar-fill bar-fats" style={{ width: `${Math.min(100, targets.fats > 0 ? (mealTotals.fats / targets.fats) * 100 : 0)}%` }} /></div>
                          <span className="nut-meal-bar-val">{mealTotals.fats}g</span>
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
                              <span className="nut-macro-c">{entry.carbs}c</span>
                              <span className="nut-macro-f">{entry.fats}f</span>
                              <span className="nut-macro-cal">{entry.calories}</span>
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
                        <p>Tap + to add food</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== ADD FOOD PICKER (Action Sheet) ==================== */}
      {addPickerMeal && (
        <>
          <div className="nut-add-picker-backdrop" onClick={() => setAddPickerMeal(null)} />
          <div className="nut-add-picker">
            <div className="nut-add-picker-handle" />
            <h3 className="nut-add-picker-title">Add to {MEALS.find(m => m.key === addPickerMeal)?.label}</h3>
            <div className="nut-add-picker-options">
              <button onClick={() => { const k = addPickerMeal; setAddPickerMeal(null); openAddForMeal(k, 'scan'); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
                <span>Scan Barcode</span>
              </button>
              <button onClick={() => { const k = addPickerMeal; setAddPickerMeal(null); openAddForMeal(k, 'search'); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span>Search Food</span>
              </button>
              <button onClick={() => { const k = addPickerMeal; setAddPickerMeal(null); openAddForMeal(k, 'manual'); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span>Manual Entry</span>
              </button>
              <button onClick={() => { const k = addPickerMeal; setAddPickerMeal(null); openAddForMeal(k, 'favourites'); }}>
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                <span>Favourites</span>
              </button>
              <button onClick={() => { const k = addPickerMeal; setAddPickerMeal(null); openAddForMeal(k, 'ai-scan'); }} className="nut-add-picker-ai">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span>AI Meal Scan</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ==================== WATER POPUP ==================== */}
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
        <div className="nut-modal-overlay" onClick={() => { stopScanner(); setScanDetected(null); setAddMode(null); setScannedProduct(null); resetAiScanner(); }}>
          <div className={`nut-modal${addMode === 'ai-scan' ? ' nut-modal--ai' : ''}`} onClick={e => e.stopPropagation()}>
            <div className="nut-modal-header">
              <h3>{addMode === 'scan' ? 'Scan Barcode' : addMode === 'search' ? 'Search Food' : addMode === 'favourites' ? 'Favourites' : addMode === 'ai-scan' ? 'AI Meal Scanner' : 'Manual Entry'}</h3>
              <button className="nut-modal-close" onClick={() => { stopScanner(); setScanDetected(null); setAddMode(null); setScannedProduct(null); resetAiScanner(); }}>
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
                        <span className="nut-search-item-macros">{item.calories} cal · {item.protein}p · {item.carbs}c · {item.fats}f per 100{item.servingUnit || 'g'}</span>
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
                    carbs: p100.carbs,
                    fats: p100.fats,
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
                    carbs: item.carbs,
                    fats: item.fats,
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

            {/* ==================== AI SCAN MODE ==================== */}
            {addMode === 'ai-scan' && (
              <div className="nut-ai-scan-area">
                <input ref={aiFileInputRef} type="file" accept="image/*" capture="environment"
                  onChange={handleAiFileSelect} style={{ display: 'none' }} />

                {/* IDLE: Upload + Recent Scans */}
                {aiStage === 'idle' && (
                  <>
                    {aiScansLoaded && (
                      <div className={`nut-ai-usage${aiScanLimitReached ? ' nut-ai-usage--locked' : aiScansRemaining <= 3 ? ' nut-ai-usage--low' : ''}`}>
                        <span>{aiScanLimitReached ? 'Daily limit reached' : `${aiScansRemaining} scan${aiScansRemaining !== 1 ? 's' : ''} left today`}</span>
                        <span className="nut-ai-usage-count">{aiScansUsedToday}/{DAILY_SCAN_LIMIT}</span>
                      </div>
                    )}
                    {aiScanLimitReached ? (
                      <div className="nut-ai-upload nut-ai-upload--locked">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <span>Scanner locked for today</span>
                        <small>Re-log a previous scan below</small>
                      </div>
                    ) : (
                      <button className="nut-ai-upload" onClick={() => aiFileInputRef.current?.click()}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        <span>Take or upload a photo</span>
                        <small>JPEG, PNG or WEBP</small>
                      </button>
                    )}
                    {aiSavedMealsLoaded && aiSavedMeals.length > 0 && (
                      <div className="nut-ai-recent">
                        <h4>Recent Scans</h4>
                        <p className="nut-ai-recent-hint">Tap to re-log without using a credit</p>
                        <div className="nut-ai-filter-tabs">
                          <button className={aiRecentFilter === 'all' ? 'active' : ''} onClick={() => setAiRecentFilter('all')}>All</button>
                          {MEALS.map((m) => {
                            const count = aiSavedMeals.filter((s) => s.mealType === m.key).length;
                            if (count === 0) return null;
                            return <button key={m.key} className={aiRecentFilter === m.key ? 'active' : ''} onClick={() => setAiRecentFilter(m.key)}>{AI_MEAL_EMOJIS[m.key]} {m.label}</button>;
                          })}
                        </div>
                        <div className="nut-ai-recent-list">
                          {aiSavedMeals
                            .filter((meal) => aiRecentFilter === 'all' ? true : meal.mealType === aiRecentFilter)
                            .map((meal) => (
                              <button key={meal.id} className="nut-ai-recent-card" onClick={() => handleAiReuse(meal)}>
                                {meal.photoUrl && <img src={meal.photoUrl} alt="" className="nut-ai-recent-thumb" loading="lazy" />}
                                <div className="nut-ai-recent-info">
                                  <span className="nut-ai-recent-label">{meal.label}</span>
                                  <span className="nut-ai-recent-macros">{meal.totals.calories} cal &middot; {meal.totals.protein}p &middot; {meal.totals.carbs}c &middot; {meal.totals.fats}f</span>
                                </div>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
                              </button>
                            ))}
                          {aiSavedMeals.filter((meal) => aiRecentFilter === 'all' ? true : meal.mealType === aiRecentFilter).length === 0 && (
                            <p className="nut-ai-empty">No scans in this category yet</p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* PREVIEW */}
                {aiStage === 'preview' && aiImagePreview && (
                  <div className="nut-ai-preview">
                    <div className="nut-ai-img-wrap">
                      <img src={aiImagePreview} alt="Meal preview" />
                    </div>
                    {aiError && (
                      <div className="nut-ai-error">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        <span>{aiError}</span>
                      </div>
                    )}
                    <div className="nut-ai-preview-actions">
                      <button className="nut-btn-primary" onClick={handleAiAnalyse}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        Analyse Meal
                      </button>
                      <button className="nut-btn-secondary" onClick={resetAiScanner}>Choose Different Photo</button>
                    </div>
                  </div>
                )}

                {/* ANALYSING */}
                {aiStage === 'analysing' && (
                  <div className="nut-ai-analysing">
                    <div className="nut-ai-img-wrap nut-ai-img-wrap--dim">
                      <img src={aiImagePreview} alt="Analysing..." />
                      <div className="nut-ai-spinner-overlay"><div className="nut-ai-spinner" /></div>
                    </div>
                    <p className="nut-ai-analysing-msg">{AI_ANALYSING_MESSAGES[aiAnalysingMsg]}</p>
                  </div>
                )}

                {/* RESULTS + IMPACT PREVIEW */}
                {(aiStage === 'results' || aiStage === 'saving') && aiResult && (
                  <div className="nut-ai-results">
                    {aiImagePreview && (
                      <div className="nut-ai-img-wrap nut-ai-img-wrap--small">
                        <img src={aiImagePreview} alt="Meal" />
                      </div>
                    )}

                    {/* Confidence */}
                    <div className={`nut-ai-confidence nut-ai-confidence--${aiResult.confidence}`}>
                      {aiResult.confidence === 'high' && 'High confidence'}
                      {aiResult.confidence === 'medium' && 'Medium confidence'}
                      {aiResult.confidence === 'low' && 'Low confidence — consider adjusting'}
                    </div>

                    {/* Impact Preview — before vs after */}
                    {targets && (
                      <div className="nut-ai-impact">
                        <h4>Daily Impact</h4>
                        <div className="nut-ai-impact-grid">
                          {[
                            { label: 'Calories', key: 'calories', unit: '', color: 'var(--color-primary)' },
                            { label: 'Protein', key: 'protein', unit: 'g', color: isDark ? '#2dd4bf' : '#14b8a6' },
                            { label: 'Carbs', key: 'carbs', unit: 'g', color: isDark ? '#fbbf24' : '#f59e0b' },
                            { label: 'Fats', key: 'fats', unit: 'g', color: isDark ? '#a78bfa' : '#8b5cf6' },
                          ].map(({ label, key, unit, color }) => {
                            const current = totals[key] || 0;
                            const add = aiResult.totals[key] || 0;
                            const after = current + add;
                            const target = targets[key] || 1;
                            const pctAfter = Math.min(100, Math.round((after / target) * 100));
                            return (
                              <div key={key} className="nut-ai-impact-row">
                                <span className="nut-ai-impact-label">{label}</span>
                                <div className="nut-ai-impact-bar-track">
                                  <div className="nut-ai-impact-bar-current" style={{ width: `${Math.min(100, (current / target) * 100)}%`, background: color, opacity: 0.4 }} />
                                  <div className="nut-ai-impact-bar-new" style={{ width: `${pctAfter}%`, background: color }} />
                                </div>
                                <span className="nut-ai-impact-val" style={{ color }}>
                                  {Math.round(after)}{unit} <small>/ {target}{unit}</small>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Totals card */}
                    <div className="nut-ai-totals">
                      <div className="nut-ai-total-item"><span className="nut-ai-total-val">{aiResult.totals.calories}</span><span>Calories</span></div>
                      <div className="nut-ai-total-item"><span className="nut-ai-total-val">{aiResult.totals.protein}g</span><span>Protein</span></div>
                      <div className="nut-ai-total-item"><span className="nut-ai-total-val">{aiResult.totals.carbs}g</span><span>Carbs</span></div>
                      <div className="nut-ai-total-item"><span className="nut-ai-total-val">{aiResult.totals.fats}g</span><span>Fats</span></div>
                    </div>

                    {/* Items */}
                    <div className="nut-ai-items">
                      <h4>Items Detected</h4>
                      {aiResult.items.map((item, i) => (
                        <div key={i} className="nut-ai-item-row">
                          <div className="nut-ai-item-info">
                            <span className="nut-ai-item-name">{item.name}</span>
                            <span className="nut-ai-item-serving">{item.estimatedGrams}g (estimate)</span>
                          </div>
                          <div className="nut-ai-item-macros">
                            <span>{item.calories} cal</span>
                            <span>{item.protein}p</span>
                            <span>{item.carbs}c</span>
                            <span>{item.fats}f</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Meal picker */}
                    <div className="nut-ai-meal-picker">
                      <h4>Add to</h4>
                      <div className="nut-ai-meal-options">
                        {MEALS.map((m) => (
                          <button key={m.key} className={`nut-ai-meal-btn${selectedMeal === m.key ? ' active' : ''}`}
                            onClick={() => setSelectedMeal(m.key)}>{m.label}</button>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="nut-ai-result-actions">
                      <button className="nut-btn-primary" onClick={handleAiSave} disabled={aiStage === 'saving'}>
                        {aiStage === 'saving' ? 'Saving...' : `Add to ${MEALS.find((m) => m.key === selectedMeal)?.label}`}
                      </button>
                      <button className="nut-btn-secondary" onClick={resetAiScanner} disabled={aiStage === 'saving'}>Scan Another</button>
                    </div>
                  </div>
                )}
              </div>
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
                  <label>Carbs (g)</label>
                  <input type="number" inputMode="numeric" value={editForm.carbs} onChange={e => setEditForm(p => ({ ...p, carbs: e.target.value }))} min="0" />
                </div>
                <div className="nut-form-group">
                  <label>Fats (g)</label>
                  <input type="number" inputMode="numeric" value={editForm.fats} onChange={e => setEditForm(p => ({ ...p, fats: e.target.value }))} min="0" />
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

      <BadgeCelebration badge={badgeCelebration} onDismiss={() => setBadgeCelebration(null)} />
    </div>
    </>
  );
}
