import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, query, where, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { storage, db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CoreBuddyWorkouts.css';
import programmeCardImg from '../assets/programme-card-workout.JPG';
import randomiserCardImg from '../assets/randomiser-card.jpg';

const TICK_COUNT = 60;
const WEEKLY_TARGET = 5;

// Programme templates (must match CoreBuddyProgrammes / CoreBuddyDashboard)
const TEMPLATE_META = {
  fullbody_4wk: { duration: 4, daysPerWeek: 3 },
  fullbody_8wk: { duration: 8, daysPerWeek: 3 },
  fullbody_12wk: { duration: 12, daysPerWeek: 3 },
  core_4wk: { duration: 4, daysPerWeek: 3 },
  core_8wk: { duration: 8, daysPerWeek: 3 },
  core_12wk: { duration: 12, daysPerWeek: 3 },
  upper_4wk: { duration: 4, daysPerWeek: 3 },
  lower_4wk: { duration: 4, daysPerWeek: 3 },
};

const EQUIPMENT = [
  { key: 'bodyweight', label: 'Bodyweight', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z' },
  { key: 'dumbbells', label: 'Dumbbells', icon: 'M6 5H3v14h3V5zm12 0h-3v14h3V5zm-9 3H7v8h2V8zm7 0h-2v8h2V8zm-5 0h-2v8h2V8z' },
  { key: 'kettlebells', label: 'Kettlebells', icon: 'M12 2C9.24 2 7 4.24 7 7c0 1.1.36 2.12.97 2.95C6.76 11.08 6 12.96 6 15c0 3.87 2.69 7 6 7s6-3.13 6-7c0-2.04-.76-3.92-1.97-5.05.61-.83.97-1.85.97-2.95 0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z' },
];

const FOCUS_AREAS = [
  { key: 'core', label: 'Core', icon: 'M12 2a4 4 0 0 1 4 4v1h-2V6a2 2 0 1 0-4 0v1H8V6a4 4 0 0 1 4-4zM8 9h8v2H8V9zm-1 4h10l-1 9H8l-1-9z' },
  { key: 'upper', label: 'Upper', icon: 'M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zm8 10l-3-1.5c-.5-.25-1-.5-1.5-.5h-7c-.5 0-1 .25-1.5.5L4 12l-2 6h4l1.5 4h9L18 18h4l-2-6z' },
  { key: 'lower', label: 'Lower', icon: 'M16.5 3A2.5 2.5 0 0 0 14 5.5 2.5 2.5 0 0 0 16.5 8 2.5 2.5 0 0 0 19 5.5 2.5 2.5 0 0 0 16.5 3zM14 9l-3 7h2l1 6h2l1-6h2l-3-7h-2z' },
  { key: 'fullbody', label: 'Full Body', icon: 'M12 2a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3zm-2 8h4l1 4h2l-1 4h-2l-1 4h-2l-1-4H8l-1-4h2l1-4z' },
  { key: 'mix', label: 'Mix It Up', icon: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm-.83 9.41l-1.42 1.42L17.96 20.54l1.42-1.42-5.71-5.71z' },
];

const LEVELS = [
  { key: 'beginner', label: 'Beginner', work: 30, rest: 30, desc: '30s work / 30s rest' },
  { key: 'intermediate', label: 'Intermediate', work: 40, rest: 20, desc: '40s work / 20s rest' },
  { key: 'advanced', label: 'Advanced', work: 40, rest: 15, desc: '40s work / 15s rest' },
];

const TIME_OPTIONS = [5, 10, 15, 20, 30];

function toTitleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CoreBuddyWorkouts() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Views: 'menu' | 'setup' | 'spinning' | 'preview' | 'countdown' | 'workout' | 'complete'
  const [view, setView] = useState('menu');

  // Setup
  const [selectedEquipment, setSelectedEquipment] = useState(['bodyweight']);
  const [focusArea, setFocusArea] = useState('core');
  const [level, setLevel] = useState('intermediate');
  const [duration, setDuration] = useState(15);

  // Exercises from Firebase Storage
  const [allExercises, setAllExercises] = useState([]);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const loadingRef = useRef(false);
  const exercisesRef = useRef([]);

  // Generated workout
  const [workout, setWorkout] = useState([]); // [{ name, videoUrl }]
  const [rounds, setRounds] = useState(2);
  const [levelConfig, setLevelConfig] = useState(LEVELS[1]);

  // Active workout state
  const [currentRound, setCurrentRound] = useState(1);
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [phase, setPhase] = useState('work'); // 'work' | 'rest'
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [startCountdown, setStartCountdown] = useState(0);

  // GIF looping
  const gifRef = useRef(null);

  // Audio
  const beepRef = useRef(null);
  const goRef = useRef(null);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Workout stats
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [programmeWeeklyCount, setProgrammeWeeklyCount] = useState(0);
  const [programmePct, setProgrammePct] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [levelBreakdown, setLevelBreakdown] = useState({ beginner: 0, intermediate: 0, advanced: 0 });

  // Card stack state
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [stackDrag, setStackDrag] = useState(0);
  const stackTouch = useRef({ startY: 0, dragging: false, didDrag: false, lastDrag: 0, lastIdx: 0 });

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load workout stats
  useEffect(() => {
    if (!currentUser || !clientData) return;
    const loadStats = async () => {
      try {
        const logsRef = collection(db, 'workoutLogs');
        const q = query(logsRef, where('clientId', '==', clientData.id));
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => d.data());

        const randomiserDocs = docs.filter(d => d.type !== 'programme');
        setTotalCount(randomiserDocs.length);

        // Total minutes (randomiser only)
        const mins = randomiserDocs.reduce((sum, d) => sum + (d.duration || 0), 0);
        setTotalMinutes(mins);

        // Level breakdown (randomiser only)
        const levels = { beginner: 0, intermediate: 0, advanced: 0 };
        randomiserDocs.forEach(d => { if (d.level && levels[d.level] !== undefined) levels[d.level]++; });
        setLevelBreakdown(levels);

        // Weekly count (Monday-based)
        const now = new Date();
        const day = now.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const monday = new Date(now);
        monday.setDate(now.getDate() + mondayOffset);
        monday.setHours(0, 0, 0, 0);
        const mondayMs = monday.getTime();

        const weekly = docs.filter(d => {
          const ts = d.completedAt;
          if (!ts) return false;
          const ms = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
          return ms >= mondayMs;
        });
        setWeeklyCount(weekly.filter(d => d.type !== 'programme').length);

        // Programme: weekly count + overall progress
        let progCount = 0;
        if (clientData) {
          try {
            const progSnap = await getDoc(doc(db, 'clientProgrammes', clientData.id));
            if (progSnap.exists()) {
              const prog = progSnap.data();
              const activeTemplateId = prog.templateId;
              progCount = weekly.filter(d => d.type === 'programme' && d.programmeId === activeTemplateId).length;
              // Overall programme progress (matches dashboard calculation)
              const meta = TEMPLATE_META[activeTemplateId];
              if (meta) {
                const completed = Object.keys(prog.completedSessions || {}).length;
                const total = meta.duration * meta.daysPerWeek;
                setProgrammePct(total > 0 ? Math.round((completed / total) * 100) : 0);
              }
            }
          } catch (e) {
            // Fallback: no active programme, show 0
          }
        }
        setProgrammeWeeklyCount(progCount);

        // Streak: consecutive weeks (going backwards) with at least 1 randomiser workout
        const timestamps = randomiserDocs
          .map(d => d.completedAt)
          .filter(Boolean)
          .map(ts => ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime())
          .sort((a, b) => b - a);

        if (timestamps.length === 0) {
          setStreak(0);
        } else {
          // Build set of ISO week keys (YYYY-WW) for each workout
          const weekKeys = new Set();
          timestamps.forEach(ms => {
            const d = new Date(ms);
            const dayOfWeek = d.getDay();
            const monOff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const mon = new Date(d);
            mon.setDate(d.getDate() + monOff);
            mon.setHours(0, 0, 0, 0);
            weekKeys.add(mon.getTime());
          });

          // Walk backwards from current week
          // If current week has no workouts yet, start from last week
          // (don't break the streak just because the new week only just started)
          const sortedWeeks = [...weekKeys].sort((a, b) => b - a);
          let streakCount = 0;
          const currentMonday = new Date(now);
          const cmOff = now.getDay() === 0 ? -6 : 1 - now.getDay();
          currentMonday.setDate(now.getDate() + cmOff);
          currentMonday.setHours(0, 0, 0, 0);
          let checkMs = currentMonday.getTime();

          // If no workout this week, skip to last week without breaking streak
          if (!sortedWeeks.includes(checkMs)) {
            checkMs -= 7 * 24 * 60 * 60 * 1000;
          }

          for (let i = 0; i < 200; i++) {
            if (sortedWeeks.includes(checkMs)) {
              streakCount++;
              checkMs -= 7 * 24 * 60 * 60 * 1000;
            } else {
              break;
            }
          }
          setStreak(streakCount);
        }
      } catch (err) {
        console.error('Error loading workout stats:', err);
      }
    };
    loadStats();
  }, [currentUser, clientData, view]);

  // Build storage paths from equipment + focus selection
  const getStoragePaths = () => {
    // New structure: exercises/{equipment}/{focus}/
    // fullbody = pull from both upper/ and lower/
    // mix = pull from all folders (core, upper, lower)
    // Legacy fallback: core/ (for existing bodyweight core videos)
    const paths = [];
    let focusKeys;
    if (focusArea === 'mix') {
      focusKeys = ['core', 'upper', 'lower'];
    } else if (focusArea === 'fullbody') {
      focusKeys = ['upper', 'lower'];
    } else {
      focusKeys = [focusArea];
    }
    for (const eq of selectedEquipment) {
      for (const fk of focusKeys) {
        paths.push(`exercises/${eq}/${fk}`);
      }
    }
    return paths;
  };

  // Load exercises from Firebase Storage
  const loadExercises = async () => {
    if (loadingRef.current) {
      while (loadingRef.current) {
        await new Promise(r => setTimeout(r, 200));
      }
      return exercisesRef.current;
    }
    loadingRef.current = true;
    setLoadingExercises(true);
    try {
      const paths = getStoragePaths();
      const allItems = [];

      for (const path of paths) {
        try {
          const folderRef = ref(storage, path);
          const result = await listAll(folderRef);
          allItems.push(...result.items);
        } catch (err) {
          // Folder might not exist yet - that's OK, skip it
          console.warn(`Folder ${path} not found, skipping.`);
        }
      }

      // Legacy fallback: if bodyweight + core selected and no new-structure files found,
      // try the old core/ folder
      if (allItems.length === 0 && selectedEquipment.includes('bodyweight') && focusArea === 'core') {
        try {
          const legacyRef = ref(storage, 'core');
          const legacyResult = await listAll(legacyRef);
          allItems.push(...legacyResult.items);
        } catch (err) {
          console.warn('Legacy core/ folder not found either.');
        }
      }

      if (allItems.length === 0) {
        const eqLabel = selectedEquipment.map(e => EQUIPMENT.find(eq => eq.key === e)?.label).join(' + ');
        const focusLabel = FOCUS_AREAS.find(f => f.key === focusArea)?.label;
        showToast(`No exercises found for ${eqLabel} / ${focusLabel}. Upload videos to Firebase Storage.`, 'error');
        loadingRef.current = false;
        setLoadingExercises(false);
        return [];
      }

      // Deduplicate by file name (same exercise in multiple equipment folders)
      const seen = new Set();
      const uniqueItems = allItems.filter(item => {
        const name = item.name.replace(/\.(mp4|gif)$/i, '');
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });

      const exercises = await Promise.all(
        uniqueItems.map(async (item) => {
          const url = await getDownloadURL(item);
          const name = toTitleCase(item.name.replace(/\.(mp4|gif)$/i, ''));
          const isGif = /\.gif$/i.test(item.name);
          return { name, videoUrl: url, isGif };
        })
      );
      exercisesRef.current = exercises;
      setAllExercises(exercises);
      loadingRef.current = false;
      setLoadingExercises(false);
      return exercises;
    } catch (err) {
      console.error('Error loading exercises:', err);
      const msg = err.code === 'storage/unauthorized'
        ? 'Storage access denied. Check Firebase Storage rules allow read access.'
        : `Failed to load exercises: ${err.message || err.code || 'Unknown error'}`;
      showToast(msg, 'error');
      loadingRef.current = false;
      setLoadingExercises(false);
      return [];
    }
  };

  // Generate random workout
  const generateWorkout = async () => {
    setView('spinning');
    // Clear cache so new selections load fresh exercises
    exercisesRef.current = [];
    const exercises = await loadExercises();
    if (exercises.length === 0) {
      setView('setup');
      return;
    }

    const config = LEVELS.find(l => l.key === level);
    setLevelConfig(config);
    const intervalTime = config.work + config.rest;
    const totalSeconds = duration * 60;
    const totalIntervals = Math.floor(totalSeconds / intervalTime);

    // Determine exercises per round and number of rounds (min 2 rounds)
    let exPerRound, numRounds;
    if (totalIntervals <= 6) {
      exPerRound = Math.max(3, Math.floor(totalIntervals / 2));
      numRounds = Math.floor(totalIntervals / exPerRound);
    } else if (totalIntervals <= 12) {
      exPerRound = Math.min(6, Math.floor(totalIntervals / 2));
      numRounds = Math.floor(totalIntervals / exPerRound);
    } else {
      exPerRound = Math.min(10, Math.floor(totalIntervals / 2));
      numRounds = Math.floor(totalIntervals / exPerRound);
    }
    numRounds = Math.max(2, numRounds);

    const shuffled = shuffleArray(exercises);
    const selected = shuffled.slice(0, Math.min(exPerRound, shuffled.length));

    setWorkout(selected);
    setRounds(numRounds);

    // Spin animation for 2s then show preview
    setTimeout(() => setView('preview'), 2000);
  };

  // Start workout (3-2-1 countdown then go)
  const startWorkout = () => {
    setView('countdown');
    setStartCountdown(3);
  };

  // Countdown 3-2-1 effect
  useEffect(() => {
    if (view !== 'countdown') return;
    if (startCountdown <= 0) {
      setView('workout');
      setCurrentRound(1);
      setCurrentExIndex(0);
      setPhase('work');
      setTimeLeft(levelConfig.work);
      setIsPaused(false);
      playGo();
      return;
    }
    playBeep();
    const t = setTimeout(() => setStartCountdown(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [startCountdown, view]);

  // Main workout timer
  useEffect(() => {
    if (view !== 'workout' || isPaused) return;
    if (timeLeft <= 0) {
      advanceWorkout();
      return;
    }
    // Beep on last 3 seconds
    if (timeLeft <= 3) playBeep();

    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, view, isPaused]);

  const advanceWorkout = () => {
    if (phase === 'work') {
      // Go to rest
      setPhase('rest');
      setTimeLeft(levelConfig.rest);
    } else {
      // Advance to next exercise
      const nextIdx = currentExIndex + 1;
      if (nextIdx >= workout.length) {
        // End of round
        const nextRound = currentRound + 1;
        if (nextRound > rounds) {
          setView('complete');
          saveWorkoutLog();
          return;
        }
        setCurrentRound(nextRound);
        setCurrentExIndex(0);
      } else {
        setCurrentExIndex(nextIdx);
      }
      setPhase('work');
      setTimeLeft(levelConfig.work);
      playGo();
    }
  };

  // Save completed workout to Firestore
  const saveWorkoutLog = async () => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'workoutLogs'), {
        clientId: clientData.id,
        level,
        duration,
        equipment: selectedEquipment,
        focus: focusArea,
        exerciseCount: workout.length,
        rounds,
        exercises: workout.map(e => e.name),
        completedAt: Timestamp.now(),
      });
      setWeeklyCount(c => c + 1);
      setTotalCount(c => c + 1);
      setTotalMinutes(m => m + duration);
      setLevelBreakdown(lb => ({ ...lb, [level]: (lb[level] || 0) + 1 }));
    } catch (err) {
      console.error('Error saving workout log:', err);
    }
  };

  // Audio helpers (Web Audio API for beeps)
  const audioCtxRef = useRef(null);
  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const playBeep = () => {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  };

  const playGo = () => {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1200;
      gain.gain.value = 0.4;
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  };

  // Restart GIF loop (in case the GIF file doesn't loop infinitely)
  useEffect(() => {
    if (view !== 'workout' || phase !== 'work') return;
    const ex = workout[currentExIndex];
    if (!ex?.isGif) return;

    const interval = setInterval(() => {
      const img = gifRef.current;
      if (!img) return;
      const src = img.getAttribute('src');
      img.removeAttribute('src');
      setTimeout(() => {
        if (gifRef.current) gifRef.current.setAttribute('src', src);
      }, 0);
    }, 4000);

    return () => clearInterval(interval);
  }, [view, phase, currentExIndex, currentRound, workout]);

  // Render countdown ring
  const renderCountdownRing = (current, total, colorClass) => {
    const filled = Math.round((current / total) * TICK_COUNT);
    return (
      <svg className="wk-ring-svg" viewBox="0 0 200 200">
        {[...Array(TICK_COUNT)].map((_, i) => {
          const angle = (i * 6 - 90) * (Math.PI / 180);
          const x1 = 100 + 82 * Math.cos(angle);
          const y1 = 100 + 82 * Math.sin(angle);
          const x2 = 100 + 94 * Math.cos(angle);
          const y2 = 100 + 94 * Math.sin(angle);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              className={i < filled ? `wk-tick-filled ${colorClass}` : 'wk-tick-empty'}
              strokeWidth={i % 5 === 0 ? '3' : '2'} />
          );
        })}
      </svg>
    );
  };

  // Total workout progress
  const getTotalProgress = () => {
    const totalExercises = workout.length * rounds;
    const completed = (currentRound - 1) * workout.length + currentExIndex + (phase === 'rest' ? 0.5 : 0);
    return completed / totalExercises;
  };

  // ==================== CARD STACK LOGIC ====================
  const STACK_CARDS = 2;
  const SWIPE_THRESHOLD = 80;
  stackTouch.current.lastIdx = activeCardIdx;

  const handleStackTouchStart = (e) => {
    stackTouch.current = { startY: e.touches[0].clientY, dragging: true, didDrag: false, lastDrag: 0, lastIdx: activeCardIdx };
    setStackDrag(0);
  };

  const handleStackTouchMove = (e) => {
    if (!stackTouch.current.dragging) return;
    const delta = stackTouch.current.startY - e.touches[0].clientY;
    if (Math.abs(delta) > 8) stackTouch.current.didDrag = true;
    stackTouch.current.lastDrag = delta;
    setStackDrag(delta);
  };

  const handleStackTouchEnd = () => {
    if (!stackTouch.current.dragging) return;
    stackTouch.current.dragging = false;
    const drag = stackTouch.current.lastDrag;
    const idx = stackTouch.current.lastIdx;

    if (drag > SWIPE_THRESHOLD && idx < STACK_CARDS - 1) {
      setActiveCardIdx(idx + 1);
    } else if (drag < -SWIPE_THRESHOLD && idx > 0) {
      setActiveCardIdx(idx - 1);
    }
    setStackDrag(0);
  };

  const getCardStyle = (index) => {
    const pos = index - activeCardIdx;
    const dragging = stackTouch.current.dragging;
    const progress = Math.max(-1, Math.min(1, stackDrag / 300));
    const transition = dragging
      ? 'none'
      : 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1)';

    let ty = 0, tz = 0, sc = 1, op = 1, zi = 0;

    if (pos === 0) {
      // Active card — slides up & recedes on swipe up
      const p = Math.max(0, progress);
      ty = -p * 110;
      tz = -p * 200;
      sc = 1 - p * 0.12;
      op = 1 - p * 0.4;
      zi = progress < -0.1 ? 5 : 10;
    } else if (pos === 1) {
      // Next card — behind, comes forward on swipe up
      const p = Math.max(0, progress);
      tz = -100 + p * 100;
      sc = 0.92 + p * 0.08;
      op = 0.7 + p * 0.3;
      zi = 5;
    } else if (pos === -1) {
      // Previous card — above & behind, comes back on swipe down
      const p = Math.max(0, -progress);
      ty = -110 + p * 110;
      tz = -200 + p * 200;
      sc = 0.85 + p * 0.15;
      op = 0.3 + p * 0.7;
      zi = -progress > 0.1 ? 15 : 1;
    } else {
      return { visibility: 'hidden', pointerEvents: 'none' };
    }

    return {
      transform: `translateY(${ty}%) translateZ(${tz}px) scale(${sc})`,
      opacity: op,
      zIndex: zi,
      transition,
      pointerEvents: pos === 0 ? 'auto' : 'none',
    };
  };

  // Toast element - rendered at the end of every view
  const toastEl = toast && (
    <div className={`toast-notification ${toast.type}`}>
      {toast.message}
    </div>
  );

  if (authLoading) {
    return <div className="cb-loading"><div className="cb-loading-spinner" /></div>;
  }

  // ==================== MENU VIEW ====================
  if (view === 'menu') {
    const programmeImg = programmeCardImg;
    const randomiserImg = randomiserCardImg || null;
    return (
      <div className="wk-page" data-theme={isDark ? 'dark' : 'light'}>
        <header className="cb-header">
          <div className="cb-header-left">
            <img src="/Logo.PNG" alt="Mind Core Fitness" className="cb-header-logo" />
            <span className="cb-header-title">Workouts</span>
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
        <main className="wk-main wk-main-stack">
          <button className="nut-back-btn" onClick={() => navigate('/client/core-buddy')}>&larr; Back</button>
          <div
            className="wk-card-stack"
            onTouchStart={handleStackTouchStart}
            onTouchMove={handleStackTouchMove}
            onTouchEnd={handleStackTouchEnd}
          >
            {/* Card 0: Random Workout */}
            <button
              className="wk-menu-card wk-card-has-bg wk-stacked"
              style={getCardStyle(0)}
              onClick={() => { if (!stackTouch.current.didDrag) setView('setup'); }}
            >
              <img src={randomiserImg} alt="" className="wk-card-bg" />
              <div className="wk-card-overlay" />
              <div className="wk-card-content">
                <div className="wk-menu-ring-wrap">
                  <svg className="wk-menu-ring-svg" viewBox="0 0 200 200">
                    {[...Array(TICK_COUNT)].map((_, i) => {
                      const angle = (i * 6 - 90) * (Math.PI / 180);
                      const x1 = 100 + 78 * Math.cos(angle);
                      const y1 = 100 + 78 * Math.sin(angle);
                      const x2 = 100 + 94 * Math.cos(angle);
                      const y2 = 100 + 94 * Math.sin(angle);
                      const filled = Math.round((Math.min(weeklyCount, WEEKLY_TARGET) / WEEKLY_TARGET) * TICK_COUNT);
                      return (
                        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                          className={i < filled ? 'wk-menu-tick-filled' : 'wk-menu-tick-empty'}
                          strokeWidth={i % 5 === 0 ? '3' : '2'} />
                      );
                    })}
                  </svg>
                  <img src="/Logo.PNG" alt="" className="wk-menu-ring-logo" />
                </div>
                <div className="wk-menu-card-stats">
                  <span className="wk-menu-stat-big">{weeklyCount}</span>
                  <span className="wk-menu-stat-label">this week</span>
                </div>
                <h3>Random Workout</h3>
                <p>Interval-based HIIT from your exercise library</p>
              </div>
            </button>

            {/* Card 1: Pick a Programme */}
            <button
              className="wk-menu-card wk-card-has-bg wk-stacked"
              style={getCardStyle(1)}
              onClick={() => { if (!stackTouch.current.didDrag) navigate('/client/core-buddy/programmes'); }}
            >
              <img src={programmeImg} alt="" className="wk-card-bg" />
              <div className="wk-card-overlay" />
              <div className="wk-card-content">
                <div className="wk-menu-ring-wrap">
                  <svg className="wk-menu-ring-svg" viewBox="0 0 200 200">
                    {[...Array(TICK_COUNT)].map((_, i) => {
                      const angle = (i * 6 - 90) * (Math.PI / 180);
                      const x1 = 100 + 78 * Math.cos(angle);
                      const y1 = 100 + 78 * Math.sin(angle);
                      const x2 = 100 + 94 * Math.cos(angle);
                      const y2 = 100 + 94 * Math.sin(angle);
                      const filled = Math.round((programmePct / 100) * TICK_COUNT);
                      return (
                        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                          className={i < filled ? 'wk-menu-tick-filled' : 'wk-menu-tick-empty'}
                          strokeWidth={i % 5 === 0 ? '3' : '2'} />
                      );
                    })}
                  </svg>
                  <img src="/Logo.PNG" alt="" className="wk-menu-ring-logo" />
                </div>
                {programmePct > 0 && (
                  <div className="wk-menu-card-stats">
                    <span className="wk-menu-stat-big">{programmePct}%</span>
                    <span className="wk-menu-stat-label">complete</span>
                  </div>
                )}
                <h3>Pick a Programme</h3>
                <p>Structured set & rep programmes with progressive overload</p>
              </div>
            </button>

            {/* Dot indicators */}
            <div className="wk-stack-dots">
              {[...Array(STACK_CARDS)].map((_, i) => (
                <button
                  key={i}
                  className={`wk-stack-dot${activeCardIdx === i ? ' active' : ''}`}
                  onClick={() => setActiveCardIdx(i)}
                />
              ))}
            </div>
          </div>
        </main>
        {toastEl}
      </div>
    );
  }

  // ==================== SETUP VIEW ====================
  if (view === 'setup') {
    return (
      <div className="wk-page" data-theme={isDark ? 'dark' : 'light'}>
        <header className="cb-header">
          <div className="cb-header-left">
            <img src="/Logo.PNG" alt="Mind Core Fitness" className="cb-header-logo" />
            <span className="cb-header-title">Setup</span>
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
        <main className="wk-main">
          <button className="nut-back-btn" onClick={() => setView('menu')}>&larr; Back</button>

          {/* Stats Hero */}
          <div className="wk-stats-hero">
            <div className="wk-stats-ring-wrap">
              <svg className="wk-stats-ring-svg" viewBox="0 0 200 200">
                {[...Array(TICK_COUNT)].map((_, i) => {
                  const angle = (i * 6 - 90) * (Math.PI / 180);
                  const x1 = 100 + 78 * Math.cos(angle);
                  const y1 = 100 + 78 * Math.sin(angle);
                  const x2 = 100 + 94 * Math.cos(angle);
                  const y2 = 100 + 94 * Math.sin(angle);
                  const filled = Math.round((Math.min(weeklyCount, WEEKLY_TARGET) / WEEKLY_TARGET) * TICK_COUNT);
                  return (
                    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                      className={i < filled ? 'wk-stats-tick-filled' : 'wk-stats-tick-empty'}
                      strokeWidth={i % 5 === 0 ? '3' : '2'} />
                  );
                })}
              </svg>
              <img src="/Logo.PNG" alt="" className="wk-stats-ring-logo" />
            </div>
            <div className="wk-stats-ring-label">
              <span className="wk-stats-ring-count">{weeklyCount}</span>
              <span className="wk-stats-ring-sep">/</span>
              <span className="wk-stats-ring-target">{WEEKLY_TARGET}</span>
              <span className="wk-stats-ring-text">THIS WEEK</span>
            </div>

            <div className="wk-stats-cards">
              <div className="wk-stats-card">
                <span className="wk-stats-card-num">{totalCount}</span>
                <span className="wk-stats-card-label">Workouts</span>
              </div>
              <div className="wk-stats-card">
                <span className="wk-stats-card-num">{totalMinutes}</span>
                <span className="wk-stats-card-label">Minutes</span>
              </div>
              <div className="wk-stats-card">
                <span className="wk-stats-card-num">{streak}</span>
                <span className="wk-stats-card-label">Weeks</span>
              </div>
            </div>

            {totalCount > 0 && (() => {
              const total = levelBreakdown.beginner + levelBreakdown.intermediate + levelBreakdown.advanced;
              if (total === 0) return null;
              const bPct = Math.round((levelBreakdown.beginner / total) * 100);
              const iPct = Math.round((levelBreakdown.intermediate / total) * 100);
              const aPct = 100 - bPct - iPct;
              return (
                <div className="wk-stats-level-bar">
                  {bPct > 0 && <div className="wk-stats-level-seg wk-seg-beginner" style={{ width: `${bPct}%` }}>
                    {bPct >= 15 && <span>B {bPct}%</span>}
                  </div>}
                  {iPct > 0 && <div className="wk-stats-level-seg wk-seg-intermediate" style={{ width: `${iPct}%` }}>
                    {iPct >= 15 && <span>I {iPct}%</span>}
                  </div>}
                  {aPct > 0 && <div className="wk-stats-level-seg wk-seg-advanced" style={{ width: `${aPct}%` }}>
                    {aPct >= 15 && <span>A {aPct}%</span>}
                  </div>}
                </div>
              );
            })()}
          </div>

          <div className="wk-setup-section">
            <h2>Equipment</h2>
            <div className="wk-equip-options">
              {EQUIPMENT.map(eq => {
                const isSelected = selectedEquipment.includes(eq.key);
                return (
                  <button key={eq.key}
                    className={`wk-equip-btn${isSelected ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedEquipment(prev => {
                        if (isSelected && prev.length === 1) return prev; // Must keep at least one
                        return isSelected ? prev.filter(k => k !== eq.key) : [...prev, eq.key];
                      });
                    }}>
                    <svg className="wk-equip-icon" viewBox="0 0 24 24" fill="currentColor"><path d={eq.icon} /></svg>
                    <span>{eq.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="wk-setup-section">
            <h2>Focus Area</h2>
            <div className="wk-focus-grid">
              {FOCUS_AREAS.map(f => (
                <button key={f.key}
                  className={`wk-equip-btn${focusArea === f.key ? ' active' : ''}${f.key === 'mix' ? ' wk-mix-btn' : ''}`}
                  onClick={() => setFocusArea(f.key)}>
                  <svg className="wk-equip-icon" viewBox="0 0 24 24" fill="currentColor"><path d={f.icon} /></svg>
                  <span>{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="wk-setup-section">
            <h2>Level</h2>
            <div className="wk-level-cards">
              {LEVELS.map(l => (
                <button key={l.key} className={`wk-level-card${level === l.key ? ' active' : ''}`} onClick={() => setLevel(l.key)}>
                  <span className="wk-level-name">{l.label}</span>
                  <span className="wk-level-desc">{l.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="wk-setup-section">
            <h2>Time</h2>
            <div className="wk-time-options">
              {TIME_OPTIONS.map(t => (
                <button key={t} className={`wk-time-btn${duration === t ? ' active' : ''}`} onClick={() => setDuration(t)}>
                  <span className="wk-time-num">{t}</span>
                  <span className="wk-time-unit">min</span>
                </button>
              ))}
            </div>
          </div>

          <button className="wk-randomise-btn" onClick={generateWorkout} disabled={loadingExercises}>
            {loadingExercises ? 'Loading exercises...' : 'Randomise Workout'}
          </button>
        </main>
        {toastEl}
      </div>
    );
  }

  // ==================== SPINNING VIEW ====================
  if (view === 'spinning') {
    return (
      <div className="wk-page wk-page-center" data-theme={isDark ? 'dark' : 'light'}>
        <div className="wk-spin-container">
          <div className="wk-spin-ring">
            <svg className="wk-spin-svg" viewBox="0 0 200 200">
              {[...Array(TICK_COUNT)].map((_, i) => {
                const angle = (i * 6 - 90) * (Math.PI / 180);
                const x1 = 100 + 78 * Math.cos(angle);
                const y1 = 100 + 78 * Math.sin(angle);
                const x2 = 100 + 94 * Math.cos(angle);
                const y2 = 100 + 94 * Math.sin(angle);
                return (
                  <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                    className="wk-spin-tick"
                    strokeWidth={i % 5 === 0 ? '3.5' : '2'}
                    style={{ animationDelay: `${i * 0.03}s` }} />
                );
              })}
            </svg>
            <img src="/Logo.PNG" alt="" className="wk-spin-logo" />
          </div>
          <p className="wk-spin-text">Generating workout...</p>
        </div>
        {toastEl}
      </div>
    );
  }

  // ==================== PREVIEW VIEW ====================
  if (view === 'preview') {
    const config = LEVELS.find(l => l.key === level);
    const totalTime = workout.length * rounds * (config.work + config.rest);
    return (
      <div className="wk-page" data-theme={isDark ? 'dark' : 'light'}>
        <header className="cb-header">
          <div className="cb-header-left">
            <img src="/Logo.PNG" alt="Mind Core Fitness" className="cb-header-logo" />
            <span className="cb-header-title">Your Workout</span>
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
        <main className="wk-main">
          <div className="wk-preview-stats">
            <div className="wk-stat">
              <span className="wk-stat-val">{workout.length}</span>
              <span className="wk-stat-label">Exercises</span>
            </div>
            <div className="wk-stat">
              <span className="wk-stat-val">{rounds}</span>
              <span className="wk-stat-label">Rounds</span>
            </div>
            <div className="wk-stat">
              <span className="wk-stat-val">{Math.ceil(totalTime / 60)}</span>
              <span className="wk-stat-label">Minutes</span>
            </div>
            <div className="wk-stat">
              <span className="wk-stat-val">{config.work}/{config.rest}</span>
              <span className="wk-stat-label">Work/Rest</span>
            </div>
          </div>

          <div className="wk-preview-list">
            {workout.map((ex, i) => (
              <div key={i} className="wk-preview-item" style={{ animationDelay: `${i * 0.06}s` }}>
                <span className="wk-preview-num">{i + 1}</span>
                <span className="wk-preview-name">{ex.name}</span>
              </div>
            ))}
          </div>

          <div className="wk-preview-actions">
            <button className="wk-btn-secondary" onClick={() => generateWorkout()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              Reshuffle
            </button>
            <button className="wk-btn-primary" onClick={startWorkout}>
              Start Workout
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ==================== COUNTDOWN VIEW (3-2-1) ====================
  if (view === 'countdown') {
    return (
      <div className="wk-page wk-page-center wk-page-dark" data-theme={isDark ? 'dark' : 'light'}>
        <div className="wk-countdown-big">
          <span className="wk-countdown-num">{startCountdown}</span>
          <span className="wk-countdown-label">GET READY</span>
        </div>
      </div>
    );
  }

  // ==================== ACTIVE WORKOUT VIEW ====================
  if (view === 'workout') {
    const currentEx = workout[currentExIndex];
    const phaseDuration = phase === 'work' ? levelConfig.work : levelConfig.rest;
    const nextEx = phase === 'rest'
      ? (currentExIndex + 1 < workout.length ? workout[currentExIndex + 1] : (currentRound < rounds ? workout[0] : null))
      : null;

    return (
      <div className="wk-page wk-page-workout" data-theme={isDark ? 'dark' : 'light'}>
        {/* Video */}
        <div className="wk-video-container">
          {phase === 'work' ? (
            currentEx.isGif ? (
              <img ref={gifRef} key={currentEx.videoUrl} className="wk-video" src={currentEx.videoUrl} alt={currentEx.name} />
            ) : (
              <video key={currentEx.videoUrl} className="wk-video" src={currentEx.videoUrl} autoPlay loop muted playsInline />
            )
          ) : (
            <div className="wk-rest-screen">
              <span className="wk-rest-label">REST</span>
              {nextEx && <span className="wk-next-label">Next: {nextEx.name}</span>}
            </div>
          )}
        </div>

        {/* Spotify Player */}
        <div className="wk-spotify">
          <iframe
            src="https://open.spotify.com/embed/playlist/37i9dQZF1DZ06evO3FJyYF?utm_source=generator&theme=0"
            width="100%"
            height="80"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title="Spotify Playlist"
          />
        </div>

        {/* Exercise info */}
        <div className="wk-exercise-info">
          <span className="wk-exercise-counter">{currentExIndex + 1} / {workout.length}</span>
          <h2 className="wk-exercise-name">{currentEx.name}</h2>
          <span className="wk-round-label">Round {currentRound} of {rounds}</span>
        </div>

        {/* Countdown Ring */}
        <div className="wk-timer-section">
          <div className="wk-timer-ring-wrap">
            {renderCountdownRing(timeLeft, phaseDuration, phase === 'work' ? 'wk-tick-work' : 'wk-tick-rest')}
            <div className="wk-timer-center">
              <span className="wk-timer-time">{timeLeft}</span>
              <span className={`wk-timer-phase ${phase}`}>{phase === 'work' ? 'WORK' : 'REST'}</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="wk-controls">
          <button className="wk-ctrl-btn wk-ctrl-stop" onClick={() => { if (confirm('End workout early?')) setView('menu'); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          </button>
          <button className="wk-ctrl-btn wk-ctrl-pause" onClick={() => setIsPaused(!isPaused)}>
            {isPaused ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            )}
          </button>
          <button className="wk-ctrl-btn wk-ctrl-skip" onClick={() => { setTimeLeft(0); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><rect x="15" y="4" width="4" height="16"/></svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="wk-progress-bar">
          <div className="wk-progress-fill" style={{ width: `${getTotalProgress() * 100}%` }} />
        </div>
      </div>
    );
  }

  // ==================== COMPLETE VIEW ====================
  if (view === 'complete') {
    const config = LEVELS.find(l => l.key === level);
    const totalTime = workout.length * rounds * (config.work + config.rest);
    return (
      <div className="wk-page wk-page-center" data-theme={isDark ? 'dark' : 'light'}>
        <div className="wk-complete">
          <div className="wk-complete-ring">
            <svg className="wk-complete-svg" viewBox="0 0 200 200">
              {[...Array(TICK_COUNT)].map((_, i) => {
                const angle = (i * 6 - 90) * (Math.PI / 180);
                const x1 = 100 + 78 * Math.cos(angle);
                const y1 = 100 + 78 * Math.sin(angle);
                const x2 = 100 + 94 * Math.cos(angle);
                const y2 = 100 + 94 * Math.sin(angle);
                return (
                  <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                    className="wk-tick-complete"
                    strokeWidth={i % 5 === 0 ? '3.5' : '2'}
                    style={{ animationDelay: `${i * 0.02}s` }} />
                );
              })}
            </svg>
            <div className="wk-complete-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
          </div>
          <h2 className="wk-complete-title">Workout Complete!</h2>
          <div className="wk-complete-stats">
            <div className="wk-stat">
              <span className="wk-stat-val">{Math.ceil(totalTime / 60)}</span>
              <span className="wk-stat-label">Minutes</span>
            </div>
            <div className="wk-stat">
              <span className="wk-stat-val">{workout.length * rounds}</span>
              <span className="wk-stat-label">Intervals</span>
            </div>
            <div className="wk-stat">
              <span className="wk-stat-val">{rounds}</span>
              <span className="wk-stat-label">Rounds</span>
            </div>
          </div>
          <div className="wk-complete-actions">
            <button className="wk-btn-primary" onClick={() => setView('menu')}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
