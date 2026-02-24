import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { awardBadge } from '../utils/awardBadge';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CoreBuddyNutrition.css';
import CoreBuddyNav from '../components/CoreBuddyNav';
import PullToRefresh from '../components/PullToRefresh';
import BadgeCelebration from '../components/BadgeCelebration';

const searchCache = new Map();

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

export default function CoreBuddyNutrition() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

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
  const [scannerActive, setScannerActive] = useState(false);
  const [scanDetected, setScanDetected] = useState(null); // barcode string or null
  const [manualBarcode, setManualBarcode] = useState('');
  const [barcodeLooking, setBarcodeLooking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [manualForm, setManualForm] = useState({ name: '', protein: '', carbs: '', fats: '', calories: '', serving: '' });
  const [scannedProduct, setScannedProduct] = useState(null);
  const [servingInput, setServingInput] = useState('100');
  const [portionCount, setPortionCount] = useState(0);
  const [servingMode, setServingMode] = useState('weight');
  const [favTick, setFavTick] = useState(0);

  // Toast
  const [toast, setToast] = useState(null);

  const scannerRef = useRef(null);
  const quaggaRunning = useRef(false);
  const searchAbort = useRef(null);
  const debounceTimer = useRef(null);
  const searchInputRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

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

  const isToday = selectedDate === getTodayKey();

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
    if (key > getTodayKey()) return;
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
      showToast(`Copied ${srcEntries.length} items from ${formatDisplayDate(sourceDate)}`, 'success');
    } catch (err) {
      console.error('Error copying day:', err);
      showToast('Failed to copy day', 'error');
    } finally {
      setCopyingDay(false);
    }
  };

  // ==================== BARCODE SCANNER (Quagga2 — loaded on demand) ====================
  const quaggaRef = useRef(null);
  const scanBuffer = useRef([]);       // rolling buffer of recent barcode reads
  const SCAN_CONSENSUS = 3;            // require same code N times before accepting
  const SCAN_BUFFER_SIZE = 5;          // keep last N reads

  const startScanner = async () => {
    setScannerActive(true);
    const target = document.querySelector('#barcode-reader');
    if (!target) {
      setScannerActive(false);
      showToast('Scanner container not found.', 'error');
      return;
    }

    // Dynamic import — only loads when user taps scan
    if (!quaggaRef.current) {
      try {
        const mod = await import('@ericblade/quagga2');
        quaggaRef.current = mod.default;
      } catch (e) {
        console.error('Failed to load barcode scanner:', e);
        setScannerActive(false);
        showToast('Could not load scanner.', 'error');
        return;
      }
    }
    const Quagga = quaggaRef.current;

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
      locator: {
        patchSize: 'medium',
        halfSample: true,
      },
      numOfWorkers: navigator.hardwareConcurrency || 2,
      decoder: {
        readers: [
          'ean_reader',
          'ean_8_reader',
          'upc_reader',
          'upc_e_reader',
          'code_128_reader',
          'code_39_reader',
        ],
      },
      locate: true,
    }, (err) => {
      if (err) {
        console.error('Quagga init error:', err);
        setScannerActive(false);
        showToast('Could not access camera. Check permissions.', 'error');
        return;
      }
      Quagga.start();
      quaggaRunning.current = true;
    });

    scanBuffer.current = []; // reset buffer on each scan session

    Quagga.onDetected((result) => {
      // Confidence check - only accept high-confidence reads
      const errors = result.codeResult.decodedCodes
        ?.filter(d => d.error !== undefined)
        ?.map(d => d.error) || [];
      const avgError = errors.length > 0
        ? errors.reduce((a, b) => a + b, 0) / errors.length
        : 1;

      if (avgError < 0.15) {
        const code = result.codeResult.code;
        const buf = scanBuffer.current;
        buf.push(code);
        if (buf.length > SCAN_BUFFER_SIZE) buf.shift();

        // Only accept when the same code appears SCAN_CONSENSUS times in buffer
        const count = buf.filter(c => c === code).length;
        if (count >= SCAN_CONSENSUS) {
          Quagga.offDetected();
          scanBuffer.current = [];
          setScanDetected(code);
        }
      }
    });
  };

  const stopScanner = () => {
    const Quagga = quaggaRef.current;
    if (quaggaRunning.current && Quagga) {
      Quagga.stop();
      Quagga.offDetected();
      quaggaRunning.current = false;
    }
    setScannerActive(false);
  };

  const LIQUID_KEYWORDS = /\b(milk|semi.skimmed|skimmed|whole milk|oat milk|almond milk|soy milk|juice|smoothie|water|squash|cordial|cola|pepsi|fanta|lemonade|soda|beer|wine|cider|lager|spirit|whisky|vodka|rum|gin|brandy|cream|yoghurt drink|milkshake|coffee|tea|broth|stock|soup|sauce|ketchup|vinegar|oil|syrup|honey|custard|coconut water|kombucha|energy drink|protein shake)\b/i;

  const hasLiquidSignal = (str) => /ml|cl|\dl(?!b)|litre|liter|fl\s?oz/i.test((str || '').replace(/\s/g, ''));

  const parseServingValue = (raw) => {
    if (!raw) return { value: 100, unit: 'g' };
    const str = raw.toLowerCase().replace(/\s/g, '');
    const numMatch = str.match(/([\d.]+)/);
    const value = numMatch ? parseFloat(numMatch[1]) : 100;
    if (hasLiquidSignal(raw)) {
      if (/cl/.test(str)) return { value: value * 10, unit: 'ml' };
      if (/(?:^|\d)l(?!i)/.test(str) && !/ml/.test(str)) return { value: value * 1000, unit: 'ml' };
      return { value, unit: 'ml' };
    }
    return { value, unit: 'g' };
  };

  const detectUnit = (p) => {
    if (hasLiquidSignal(p.serving_size)) return 'ml';
    if (hasLiquidSignal(p.quantity)) return 'ml';
    const name = (p.product_name || p.product_name_en || '');
    if (LIQUID_KEYWORDS.test(name)) return 'ml';
    return 'g';
  };

  const COMMON_PORTIONS = [
    { pattern: /\b(toast|bread|loaf|brioche|bagel|pitta|wrap|tortilla|crumpet|muffin|waffle|pancake)\b/i, label: 'slice', weight: 36 },
    { pattern: /\begg\b/i, label: 'egg', weight: 60 },
    { pattern: /\b(biscuit|cookie|digestive|hobnob|rich tea|oreo)\b/i, label: 'biscuit', weight: 13 },
    { pattern: /\b(sausage|banger)\b/i, label: 'sausage', weight: 57 },
    { pattern: /\b(rasher|bacon)\b/i, label: 'rasher', weight: 25 },
    { pattern: /\b(rice cake)\b/i, label: 'cake', weight: 9 },
    { pattern: /\b(cracker|ryvita)\b/i, label: 'cracker', weight: 10 },
  ];

  const parsePortion = (servingSize, productName) => {
    const raw = servingSize || '';
    // Try parsing serving_size like "1 slice (38g)" or "38g (1 slice)" or "per slice (36g)"
    const parenMatch = raw.match(/\((\d+\.?\d*)\s*g\)/i);
    const labelMatch = raw.match(/(?:^|per\s+)(\d*\s*[a-z][a-z\s]*?)(?:\s*\(|\s*-\s*|\s*$)/i);
    if (parenMatch && labelMatch) {
      const weight = parseFloat(parenMatch[1]);
      let label = labelMatch[1].replace(/^\d+\s*/, '').trim();
      if (label && weight > 0) return { label, weight };
    }
    // Try "38g / 1 slice" or "1 slice = 38g" formats
    const altMatch = raw.match(/(\d+\.?\d*)\s*g\s*[\/=]\s*(\d*\s*[a-z][a-z\s]*)/i);
    if (altMatch) {
      const weight = parseFloat(altMatch[1]);
      let label = altMatch[2].replace(/^\d+\s*/, '').trim();
      if (label && weight > 0) return { label, weight };
    }
    // Fallback: match product name against common portions
    const name = productName || '';
    for (const { pattern, label, weight } of COMMON_PORTIONS) {
      if (pattern.test(name)) return { label, weight };
    }
    return null;
  };

  const parseProduct = (p) => {
    const n = p.nutriments || {};
    const unit = detectUnit(p);
    const serving = parseServingValue(p.serving_size);
    const servingValue = unit === 'ml' ? (serving.unit === 'ml' ? serving.value : 100) : serving.value;
    const name = p.product_name || p.product_name_en || 'Unknown Product';
    const portion = parsePortion(p.serving_size, name);
    return {
      name,
      brand: p.brands || '',
      image: p.image_small_url || p.image_url || null,
      servingSize: p.serving_size || '100g',
      servingValue,
      servingUnit: unit,
      portion,
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=product_name,product_name_en,brands,image_small_url,image_url,serving_size,quantity,nutriments`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.status === 404) {
        showToast('Product not found. Try search or manual entry.', 'error');
        setBarcodeLooking(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === 'success' || data.status === 1 || data.product) {
        const product = parseProduct(data.product);
        if (product.calories === 0 && product.protein === 0 && product.carbs === 0) {
          showToast('Product found but no nutrition data available.', 'error');
        } else {
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
        showToast('Product not found. Try search or manual entry.', 'error');
      }
    } catch (err) {
      console.error('Barcode lookup error:', err);
      if (err.name === 'AbortError') {
        showToast('Lookup timed out. Check your connection and try again.', 'error');
      } else {
        showToast('Failed to look up product. Check your connection.', 'error');
      }
    }
    setBarcodeLooking(false);
  };

  // ==================== FOOD SEARCH ====================
  const scoreRelevance = (name, brand, term) => {
    const n = name.toLowerCase().trim();
    const b = brand.toLowerCase().trim();
    const t = term.toLowerCase().trim();
    let score = 0;
    // Exact match e.g. "Egg" or "Eggs"
    if (n === t || n === t + 's' || n + 's' === t) score += 100;
    // Name ends with term — product IS the thing (e.g. "Free Range Eggs")
    if (n.endsWith(' ' + t) || n.endsWith(' ' + t + 's')) score += 40;
    // Name starts with term — term modifies something else (e.g. "Egg Noodles")
    if (n.startsWith(t + ' ') || n.startsWith(t + 's ')) score += 15;
    // Brand matches a search word — boost branded matches (e.g. "Warburtons")
    const words = t.split(/\s+/);
    if (words.some(w => b === w || b.startsWith(w))) score += 30;
    // Shorter names are more specific/relevant
    score += Math.max(0, 30 - n.length);
    return score;
  };

  const searchFood = async () => {
    if (!searchQuery.trim()) return;
    // Cancel any in-flight request
    if (searchAbort.current) searchAbort.current.abort();
    const controller = new AbortController();
    searchAbort.current = controller;

    const term = searchQuery.trim().toLowerCase();
    const searchWords = term.split(/\s+/).filter(Boolean);

    // Return cached results instantly if available
    if (searchCache.has(term)) {
      setSearchResults(searchCache.get(term));
      return;
    }

    setSearchLoading(true);
    try {
      const q = encodeURIComponent(searchQuery.trim());
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=10&lc=en&sort_by=unique_scans_n&fields=product_name,product_name_en,brands,image_small_url,image_url,serving_size,quantity,nutriments`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = (data.products || [])
        .map(p => parseProduct(p))
        .filter(p => p.name !== 'Unknown Product' && (p.calories > 0 || p.protein > 0))
        .filter(p => {
          const combined = (p.name + ' ' + p.brand).toLowerCase();
          return searchWords.every(w => combined.includes(w));
        })
        .sort((a, b) => scoreRelevance(b.name, b.brand, term) - scoreRelevance(a.name, a.brand, term))
        .slice(0, 10);
      searchCache.set(term, results);
      setSearchResults(results);
      if (results.length === 0) {
        showToast('No results found. Try a different search.', 'info');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Search error:', err);
      showToast('Search failed. Check your connection.', 'error');
    }
    setSearchLoading(false);
  };

  // Debounced search-as-you-type
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!searchQuery.trim() || addMode !== 'search' || scannedProduct) return;
    debounceTimer.current = setTimeout(() => {
      searchFood();
    }, 700);
    return () => clearTimeout(debounceTimer.current);
  }, [searchQuery]);

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

  // Brief delay after barcode detected, then fetch
  useEffect(() => {
    if (!scanDetected) return;
    const timer = setTimeout(() => {
      const code = scanDetected;
      stopScanner();
      setScanDetected(null);
      fetchProductByBarcode(code);
    }, 1500);
    return () => clearTimeout(timer);
  }, [scanDetected]);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      const Quagga = quaggaRef.current;
      if (quaggaRunning.current && Quagga) {
        try { Quagga.stop(); Quagga.offDetected(); } catch (e) {}
        quaggaRunning.current = false;
      }
    };
  }, []);

  if (authLoading || view === 'loading') {
    return (
      <div className="nut-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
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
    else { setAddMode('search'); setSearchResults([]); setSearchQuery(''); }
  };

  // ==================== DASHBOARD VIEW ====================
  const weekDays = getWeekDays(selectedDate);
  const selDateObj = new Date(selectedDate + 'T12:00:00');
  const weekMonthLabel = `${MONTH_NAMES[selDateObj.getMonth()]} ${selDateObj.getFullYear()}`;

  return (
    <PullToRefresh>
    <div className="nut-page">
      {/* ===== DARK ZONE (top) ===== */}
      <div className="nut-dark-zone">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
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
          <div className="nut-week-strip anim-fade-up">
            <div className="nut-week-header">
              <button className="nut-week-arrow" onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() - 7); const key = d.toISOString().split('T')[0]; setSelectedDate(key); }} aria-label="Previous week">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button className="nut-week-month-label" onClick={() => { setCalendarOpen(!calendarOpen); setCalendarMonth({ year: selDateObj.getFullYear(), month: selDateObj.getMonth() }); }}>
                {weekMonthLabel}
              </button>
              <button className="nut-week-arrow" onClick={() => { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() + 7); const key = d.toISOString().split('T')[0]; if (key <= getTodayKey()) setSelectedDate(key); }} aria-label="Next week" disabled={weekDays[6] >= getTodayKey()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <div className="nut-week-days">
              {weekDays.map((dayKey, i) => {
                const dayNum = new Date(dayKey + 'T12:00:00').getDate();
                const isSel = dayKey === selectedDate;
                const isFutureDay = dayKey > getTodayKey();
                const isTodayDay = dayKey === getTodayKey();
                return (
                  <button key={dayKey} className={`nut-week-day${isSel ? ' selected' : ''}${isTodayDay ? ' today' : ''}${isFutureDay ? ' future' : ''}`}
                    disabled={isFutureDay} onClick={() => setSelectedDate(dayKey)}>
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
                })} disabled={calendarMonth.year === new Date().getFullYear() && calendarMonth.month >= new Date().getMonth()}>
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
                  const isFuture = dateKey > getTodayKey();
                  const isSelected = dateKey === selectedDate;
                  const isTodayDate = dateKey === getTodayKey();
                  return (
                    <button key={day} className={`nut-cal-day${isSelected ? ' selected' : ''}${isTodayDate ? ' today' : ''}${isFuture ? ' future' : ''}`}
                      disabled={isFuture} onClick={() => { setSelectedDate(dateKey); setCalendarOpen(false); }}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Macro Rings - 4 across */}
          <div className="nut-rings-row anim-fade-up-d2">
            {renderMacroRing('Protein', 'Protein', totals.protein, targets.protein, 'ring-protein')}
            {renderMacroRing('Carbs', 'Carbs', totals.carbs, targets.carbs, 'ring-carbs')}
            {renderMacroRing('Fats', 'Fats', totals.fats, targets.fats, 'ring-fats')}
            {renderMacroRing('Calories', 'kCal', totals.calories, targets.calories, 'ring-cals')}
          </div>
        </div>
      </div>

      {/* ===== LIGHT ZONE (bottom sheet) ===== */}
      <div className="nut-light-zone anim-fade-up-d4">
        <div className="nut-light-content">

          {/* Quick Actions Row (today only) */}
          {isToday && (
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
                const items = todayLog.entries.filter(e => (e.meal || 'snacks') === m.key);
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
                      {isToday && (
                        <button className="nut-meal-add-btn" onClick={() => setAddPickerMeal(addPickerMeal === m.key ? null : m.key)} aria-label={`Add to ${m.label}`}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                      )}
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
                          <div key={entry.id} className="nut-log-item">
                            <button
                              className={`nut-fav-star log${isFavourite(entry.name) ? ' active' : ''}`}
                              onClick={() => toggleFavourite(entry)}
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
                            {isToday && (
                              <button className="nut-log-delete" onClick={() => removeEntry(entry.id)} aria-label="Remove">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {items.length === 0 && (
                      <div className="nut-meal-empty">
                        <p>{isToday ? 'Tap + to add food' : 'No entries'}</p>
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
              <div className="nut-scan-area">
                <div className="nut-scanner-wrapper">
                  <div id="barcode-reader" className="nut-scanner-view" />
                  {scannerActive && !scanDetected && <div className="nut-scan-line" />}
                  {scanDetected && (
                    <div className="nut-scan-detected-overlay">
                      <svg className="nut-scan-detected-tick" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                      <p className="nut-scan-detected-label">Barcode found!</p>
                      <p className="nut-scan-detected-code">{scanDetected}</p>
                    </div>
                  )}
                </div>
                {!scannerActive && (
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
                    onKeyDown={e => e.key === 'Enter' && manualBarcode.trim() && fetchProductByBarcode(manualBarcode.trim())}
                    placeholder="Enter barcode number" />
                  <button onClick={() => manualBarcode.trim() && fetchProductByBarcode(manualBarcode.trim())}
                    disabled={!manualBarcode.trim() || barcodeLooking}>
                    {barcodeLooking ? '...' : 'Look Up'}
                  </button>
                </div>
                <p className="nut-off-credit">Food data powered by <a href="https://openfoodfacts.org" target="_blank" rel="noopener noreferrer">Open Food Facts</a></p>
              </div>
            )}

            {/* SCANNED PRODUCT RESULT */}
            {addMode === 'scan' && scannedProduct && (() => {
              const u = scannedProduct.servingUnit || 'g';
              const por = scannedProduct.portion;
              const effectiveWeight = servingMode === 'portion' && por ? portionCount * por.weight : (parseFloat(servingInput) || 0);
              const mult = effectiveWeight / 100;
              const quickAmounts = u === 'ml' ? [100, 200, 250, 500] : [50, 100, 150, 200];
              const servingLabel = servingMode === 'portion' && por
                ? `${portionCount} ${por.label}${portionCount !== 1 ? 's' : ''} (${Math.round(effectiveWeight)}${u})`
                : `${Math.round(effectiveWeight)}${u}`;
              return (
              <div className="nut-product-result">
                {scannedProduct.image && <img src={scannedProduct.image} alt={scannedProduct.name || 'Product'} className="nut-product-img" loading="lazy" />}
                <div className="nut-product-name-row">
                  <h4>{scannedProduct.name}</h4>
                  <button className={`nut-fav-star confirm${isFavourite(scannedProduct.name) ? ' active' : ''}`}
                    onClick={() => toggleFavourite({
                      name: scannedProduct.name,
                      protein: scannedProduct.protein, carbs: scannedProduct.carbs,
                      fats: scannedProduct.fats, calories: scannedProduct.calories,
                      serving: scannedProduct.servingSize,
                      per100g: { protein: scannedProduct.protein, carbs: scannedProduct.carbs, fats: scannedProduct.fats, calories: scannedProduct.calories },
                      servingUnit: scannedProduct.servingUnit || 'g',
                      portion: scannedProduct.portion || null,
                    })}>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill={isFavourite(scannedProduct.name) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  </button>
                </div>
                {scannedProduct.brand && <p className="nut-product-brand">{scannedProduct.brand}</p>}
                <p className="nut-product-per">Per 100{u}:</p>
                <div className="nut-product-macros">
                  <span className="nut-macro-p">{scannedProduct.protein}g P</span>
                  <span className="nut-macro-c">{scannedProduct.carbs}g C</span>
                  <span className="nut-macro-f">{scannedProduct.fats}g F</span>
                  <span className="nut-macro-cal">{scannedProduct.calories} cal</span>
                </div>
                {por && (
                  <div className="nut-mode-toggle">
                    <button className={servingMode === 'portion' ? 'active' : ''} onClick={() => { setServingMode('portion'); if (portionCount < 1) setPortionCount(1); }}>Portions</button>
                    <button className={servingMode === 'weight' ? 'active' : ''} onClick={() => { setServingMode('weight'); setServingInput(String(Math.round(effectiveWeight) || 100)); }}>Custom ({u})</button>
                  </div>
                )}
                {servingMode === 'portion' && por ? (
                  <div className="nut-portion-stepper">
                    <button className="nut-stepper-btn" onClick={() => setPortionCount(Math.max(1, portionCount - 1))}>-</button>
                    <div className="nut-stepper-display">
                      <span className="nut-stepper-count">{portionCount}</span>
                      <span className="nut-stepper-label">{por.label}{portionCount !== 1 ? 's' : ''}</span>
                      <span className="nut-stepper-weight">{Math.round(effectiveWeight)}{u}</span>
                    </div>
                    <button className="nut-stepper-btn" onClick={() => setPortionCount(portionCount + 1)}>+</button>
                  </div>
                ) : (
                  <>
                    <div className="nut-serving-adjust">
                      <label>Serving ({u})</label>
                      <input type="number" inputMode="numeric" value={servingInput} onChange={e => setServingInput(e.target.value)} onFocus={e => e.target.select()} min="0" />
                    </div>
                    <div className="nut-quick-amounts">
                      {quickAmounts.map(amt => (
                        <button key={amt} className={`nut-quick-btn${servingInput === String(amt) ? ' active' : ''}`} onClick={() => setServingInput(String(amt))}>{amt}{u}</button>
                      ))}
                    </div>
                  </>
                )}
                <div className="nut-product-total">
                  <span>Total: {Math.round(scannedProduct.protein * mult)}p / {Math.round(scannedProduct.carbs * mult)}c / {Math.round(scannedProduct.fats * mult)}f / {Math.round(scannedProduct.calories * mult)} cal</span>
                </div>
                <div className="nut-product-actions">
                  <button className="nut-btn-secondary" onClick={() => { setScannedProduct(null); setAddMode('scan'); }}>Scan Again</button>
                  <button className="nut-btn-primary" onClick={() => addFoodEntry({
                    name: scannedProduct.name,
                    protein: Math.round(scannedProduct.protein * mult),
                    carbs: Math.round(scannedProduct.carbs * mult),
                    fats: Math.round(scannedProduct.fats * mult),
                    calories: Math.round(scannedProduct.calories * mult),
                    serving: servingLabel
                  })}>Add</button>
                </div>
              </div>
              );
            })()}

            {/* SEARCH MODE */}
            {addMode === 'search' && !scannedProduct && (
              <div className="nut-search-area">
                <div className="nut-search-bar">
                  <input type="text" ref={searchInputRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { clearTimeout(debounceTimer.current); searchFood(); } }}
                    onFocus={() => setTimeout(() => searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350)}
                    placeholder="Search food or product..." autoFocus />
                  <button onClick={searchFood} disabled={searchLoading}>
                    {searchLoading ? '...' : 'Search'}
                  </button>
                </div>
                <div className="nut-search-results">
                  {searchResults.map((item, i) => (
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
            {addMode === 'search' && scannedProduct && (() => {
              const u = scannedProduct.servingUnit || 'g';
              const por = scannedProduct.portion;
              const effectiveWeight = servingMode === 'portion' && por ? portionCount * por.weight : (parseFloat(servingInput) || 0);
              const mult = effectiveWeight / 100;
              const quickAmounts = u === 'ml' ? [100, 200, 250, 500] : [50, 100, 150, 200];
              const servingLabel = servingMode === 'portion' && por
                ? `${portionCount} ${por.label}${portionCount !== 1 ? 's' : ''} (${Math.round(effectiveWeight)}${u})`
                : `${Math.round(effectiveWeight)}${u}`;
              return (
              <div className="nut-product-result">
                {scannedProduct.image && <img src={scannedProduct.image} alt={scannedProduct.name || 'Product'} className="nut-product-img" loading="lazy" />}
                <div className="nut-product-name-row">
                  <h4>{scannedProduct.name}</h4>
                  <button className={`nut-fav-star confirm${isFavourite(scannedProduct.name) ? ' active' : ''}`}
                    onClick={() => toggleFavourite({
                      name: scannedProduct.name,
                      protein: scannedProduct.protein, carbs: scannedProduct.carbs,
                      fats: scannedProduct.fats, calories: scannedProduct.calories,
                      serving: scannedProduct.servingSize,
                      per100g: { protein: scannedProduct.protein, carbs: scannedProduct.carbs, fats: scannedProduct.fats, calories: scannedProduct.calories },
                      servingUnit: scannedProduct.servingUnit || 'g',
                      portion: scannedProduct.portion || null,
                    })}>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill={isFavourite(scannedProduct.name) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  </button>
                </div>
                {scannedProduct.brand && <p className="nut-product-brand">{scannedProduct.brand}</p>}
                <p className="nut-product-per">Per 100{u}:</p>
                <div className="nut-product-macros">
                  <span className="nut-macro-p">{scannedProduct.protein}g P</span>
                  <span className="nut-macro-c">{scannedProduct.carbs}g C</span>
                  <span className="nut-macro-f">{scannedProduct.fats}g F</span>
                  <span className="nut-macro-cal">{scannedProduct.calories} cal</span>
                </div>
                {por && (
                  <div className="nut-mode-toggle">
                    <button className={servingMode === 'portion' ? 'active' : ''} onClick={() => { setServingMode('portion'); if (portionCount < 1) setPortionCount(1); }}>Portions</button>
                    <button className={servingMode === 'weight' ? 'active' : ''} onClick={() => { setServingMode('weight'); setServingInput(String(Math.round(effectiveWeight) || 100)); }}>Custom ({u})</button>
                  </div>
                )}
                {servingMode === 'portion' && por ? (
                  <div className="nut-portion-stepper">
                    <button className="nut-stepper-btn" onClick={() => setPortionCount(Math.max(1, portionCount - 1))}>-</button>
                    <div className="nut-stepper-display">
                      <span className="nut-stepper-count">{portionCount}</span>
                      <span className="nut-stepper-label">{por.label}{portionCount !== 1 ? 's' : ''}</span>
                      <span className="nut-stepper-weight">{Math.round(effectiveWeight)}{u}</span>
                    </div>
                    <button className="nut-stepper-btn" onClick={() => setPortionCount(portionCount + 1)}>+</button>
                  </div>
                ) : (
                  <>
                    <div className="nut-serving-adjust">
                      <label>Serving ({u})</label>
                      <input type="number" inputMode="numeric" value={servingInput} onChange={e => setServingInput(e.target.value)} onFocus={e => e.target.select()} min="0" />
                    </div>
                    <div className="nut-quick-amounts">
                      {quickAmounts.map(amt => (
                        <button key={amt} className={`nut-quick-btn${servingInput === String(amt) ? ' active' : ''}`} onClick={() => setServingInput(String(amt))}>{amt}{u}</button>
                      ))}
                    </div>
                  </>
                )}
                <div className="nut-product-total">
                  <span>Total: {Math.round(scannedProduct.protein * mult)}p / {Math.round(scannedProduct.carbs * mult)}c / {Math.round(scannedProduct.fats * mult)}f / {Math.round(scannedProduct.calories * mult)} cal</span>
                </div>
                <div className="nut-product-actions">
                  <button className="nut-btn-secondary" onClick={() => setScannedProduct(null)}>Back to Search</button>
                  <button className="nut-btn-primary" onClick={() => addFoodEntry({
                    name: scannedProduct.name,
                    protein: Math.round(scannedProduct.protein * mult),
                    carbs: Math.round(scannedProduct.carbs * mult),
                    fats: Math.round(scannedProduct.fats * mult),
                    calories: Math.round(scannedProduct.calories * mult),
                    serving: servingLabel
                  })}>Add</button>
                </div>
              </div>
              );
            })()}

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
            {addMode === 'favourites' && scannedProduct && (() => {
              const u = scannedProduct.servingUnit || 'g';
              const por = scannedProduct.portion;
              const effectiveWeight = servingMode === 'portion' && por ? portionCount * por.weight : (parseFloat(servingInput) || 0);
              const mult = effectiveWeight / 100;
              const quickAmounts = u === 'ml' ? [100, 200, 250, 500] : [50, 100, 150, 200];
              const servingLabel = servingMode === 'portion' && por
                ? `${portionCount} ${por.label}${portionCount !== 1 ? 's' : ''} (${Math.round(effectiveWeight)}${u})`
                : `${Math.round(effectiveWeight)}${u}`;
              return (
              <div className="nut-product-result">
                <div className="nut-product-name-row">
                  <h4>{scannedProduct.name}</h4>
                  <button className={`nut-fav-star confirm${isFavourite(scannedProduct.name) ? ' active' : ''}`}
                    onClick={() => toggleFavourite({
                      name: scannedProduct.name,
                      protein: scannedProduct.protein, carbs: scannedProduct.carbs,
                      fats: scannedProduct.fats, calories: scannedProduct.calories,
                      serving: scannedProduct.servingSize,
                      per100g: { protein: scannedProduct.protein, carbs: scannedProduct.carbs, fats: scannedProduct.fats, calories: scannedProduct.calories },
                      servingUnit: scannedProduct.servingUnit || 'g',
                      portion: scannedProduct.portion || null,
                    })}>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill={isFavourite(scannedProduct.name) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                  </button>
                </div>
                <p className="nut-product-per">Per 100{u}:</p>
                <div className="nut-product-macros">
                  <span className="nut-macro-p">{scannedProduct.protein}g P</span>
                  <span className="nut-macro-c">{scannedProduct.carbs}g C</span>
                  <span className="nut-macro-f">{scannedProduct.fats}g F</span>
                  <span className="nut-macro-cal">{scannedProduct.calories} cal</span>
                </div>
                {por && (
                  <div className="nut-mode-toggle">
                    <button className={servingMode === 'portion' ? 'active' : ''} onClick={() => { setServingMode('portion'); if (portionCount < 1) setPortionCount(1); }}>Portions</button>
                    <button className={servingMode === 'weight' ? 'active' : ''} onClick={() => { setServingMode('weight'); setServingInput(String(Math.round(effectiveWeight) || 100)); }}>Custom ({u})</button>
                  </div>
                )}
                {servingMode === 'portion' && por ? (
                  <div className="nut-portion-stepper">
                    <button className="nut-stepper-btn" onClick={() => setPortionCount(Math.max(1, portionCount - 1))}>-</button>
                    <div className="nut-stepper-display">
                      <span className="nut-stepper-count">{portionCount}</span>
                      <span className="nut-stepper-label">{por.label}{portionCount !== 1 ? 's' : ''}</span>
                      <span className="nut-stepper-weight">{Math.round(effectiveWeight)}{u}</span>
                    </div>
                    <button className="nut-stepper-btn" onClick={() => setPortionCount(portionCount + 1)}>+</button>
                  </div>
                ) : (
                  <>
                    <div className="nut-serving-adjust">
                      <label>Serving ({u})</label>
                      <input type="number" inputMode="numeric" value={servingInput} onChange={e => setServingInput(e.target.value)} onFocus={e => e.target.select()} min="0" />
                    </div>
                    <div className="nut-quick-amounts">
                      {quickAmounts.map(amt => (
                        <button key={amt} className={`nut-quick-btn${servingInput === String(amt) ? ' active' : ''}`} onClick={() => setServingInput(String(amt))}>{amt}{u}</button>
                      ))}
                    </div>
                  </>
                )}
                <div className="nut-product-total">
                  <span>Total: {Math.round(scannedProduct.protein * mult)}p / {Math.round(scannedProduct.carbs * mult)}c / {Math.round(scannedProduct.fats * mult)}f / {Math.round(scannedProduct.calories * mult)} cal</span>
                </div>
                <div className="nut-product-actions">
                  <button className="nut-btn-secondary" onClick={() => setScannedProduct(null)}>Back to Favourites</button>
                  <button className="nut-btn-primary" onClick={() => addFoodEntry({
                    name: scannedProduct.name,
                    protein: Math.round(scannedProduct.protein * mult),
                    carbs: Math.round(scannedProduct.carbs * mult),
                    fats: Math.round(scannedProduct.fats * mult),
                    calories: Math.round(scannedProduct.calories * mult),
                    serving: servingLabel
                  })}>Add</button>
                </div>
              </div>
              );
            })()}
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
    </PullToRefresh>
  );
}
