import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, query, where, getDocs, doc, getDoc, setDoc, deleteDoc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { storage, db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTier } from '../contexts/TierContext';

import './CoreBuddyWorkouts.css';
import CoreBuddyNav from '../components/CoreBuddyNav';
import WorkoutCelebration from '../components/WorkoutCelebration';
import BUDDY_EXERCISES, { PROGRAMMABLE_EXERCISES } from '../config/buddyExercises';
import { awardBadge } from '../utils/awardBadge';
import BadgeCelebration from '../components/BadgeCelebration';
import { trackWorkoutStarted, trackWorkoutCompleted, trackWorkoutShared, trackExerciseSwapped, trackBYOWorkoutBuilt } from '../utils/analytics';


import randomiserCardImg from '../assets/images/cards/randomiser.jpg';
import { TICKS_78_94, TICKS_82_94 } from '../utils/ringTicks';

const TICK_COUNT = 60;
const WEEKLY_TARGET = 5;


// Exercise group mapping for badge categorisation
const EXERCISE_GROUPS = {
  'Dumbbell Floor Press': 'upper', 'Seated Dumbbell Shoulder Press': 'upper', 'Seated Dumbbell Arnold Press': 'upper',
  'Dumbbell Overhead Tricep Extension': 'upper', 'Skullcrushers': 'upper', 'Dumbbell Lateral Raise': 'upper',
  'Dumbbell Front Raise': 'upper', 'Dumbbell Squeeze Press': 'upper', 'Incline Dumbbell Press': 'upper',
  'Dumbbell Fly': 'upper', 'Dumbbell Pullover': 'upper', 'Tricep Kickback': 'upper',
  'Dumbbell Shrug': 'upper', 'Dumbbell Y-Raise': 'upper',
  'Dumbbell Bent Over Row': 'upper', 'Single Arm Bent Over Row': 'upper', 'Bicep Curl': 'upper',
  'Hammer Curl': 'upper', 'Dumbbell Bent Over Rear Delt Fly': 'upper', 'Renegade Row': 'upper',
  'Wide Dumbbell Bent Over Row': 'upper', 'Reverse Fly': 'upper', 'Concentration Curl': 'upper',
  'Wide Grip Bicep Curl': 'upper', 'Wrist Curl': 'upper',
  'Dumbbell Goblet Squats': 'lower', 'Romanian Deadlifts': 'lower', 'Forward Dumbbell Lunges': 'lower',
  'Dumbbell Sumo Squats': 'lower', 'Weighted Calf Raises': 'lower', '1 Legged RDL': 'lower',
  'Dumbbell Box Step Ups': 'lower', 'Dumbbell Squat Pulses': 'lower', 'Dumbbell Reverse Lunges': 'lower',
  'Kettlebell Romanian Deadlift': 'lower',
  'Russian Twists Dumbbell': 'core', 'Kettlebell Russian Twist': 'core', 'Kettlebell Side Bends': 'core',
  'Kneeling Kettlebell Halo': 'core', 'Kettlebell Bird Dog Drag': 'core',
};

const EQUIPMENT = [
  { key: 'bodyweight', label: 'Bodyweight', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z' },
  { key: 'dumbbells', label: 'Dumbbells', icon: 'M1 9h2v6H1V9zm3-2h2v10H4V7zm3 4h10v2H7v-2zm10-4h2v10h-2V7zm3 2h2v6h-2V9z' },
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
  { key: 'custom', label: 'Custom', work: 30, rest: 30, desc: 'Choose your own' },
];

const TIME_OPTIONS = [5, 10, 15, 20, 30];

const fmtSec = s => s >= 60 ? `${Math.floor(s / 60)}m${s % 60 ? s % 60 + 's' : ''}` : s + 's';

const BYO_GROUPS = [
  { key: 'upper', label: 'Upper Body', groups: ['upper'] },
  { key: 'lower', label: 'Lower Body', groups: ['lower'] },
  { key: 'core', label: 'Core', groups: ['core'] },
];

const BYO_MUSCLE_FILTERS = {
  upper: [
    { key: 'all', label: 'All' },
    { key: 'back', label: 'Back' },
    { key: 'biceps', label: 'Biceps' },
    { key: 'shoulders', label: 'Shoulders' },
    { key: 'chest', label: 'Chest' },
    { key: 'triceps', label: 'Triceps' },
  ],
  lower: [
    { key: 'all', label: 'All' },
    { key: 'quads', label: 'Squats' },
    { key: 'lunges', label: 'Lunges' },
    { key: 'glutes', label: 'Glutes' },
    { key: 'calves', label: 'Calves' },
  ],
  core: [
    { key: 'all', label: 'All' },
    { key: 'planks_holds', label: 'Planks & Holds' },
    { key: 'twists', label: 'Twists' },
    { key: 'crunches_raises', label: 'Crunches & Raises' },
  ],
};

const BYO_EQUIPMENT_ORDER = ['bodyweight', 'dumbbells', 'kettlebell'];
const BYO_EQUIPMENT_LABELS = { bodyweight: 'Bodyweight', dumbbells: 'Dumbbells', kettlebell: 'Kettlebells' };

// Advanced core exercises excluded from beginner-level randomiser.
// Matched case-insensitively against exercise names loaded from Firebase Storage.
const ADVANCED_CORE_EXERCISES = new Set([
  'single leg v-up',
  'hollow hold to v-sit',
  'reverse crunch to leg raise',
  'side plank rotation',
  'hip dips plank',
  'alternating cross body v-up',
  'alternating cross body v up',
  'bent hollow hold',
  'heels elevated glute bridge',
  'hollow body hold',
  'hollow body rock',
  'star side plank',
  'straddle leg lift',
  'leg raise to hip lift',
  'scorpion kicks',
  'seated v hold',
]);

const FOCUS_COLORS = {
  core: '#e85d04',
  upper: '#2196f3',
  lower: '#4caf50',
  fullbody: '#9c27b0',
  mix: '#ff9800',
};

const HUB_TIPS = [
  "Mix up your focus areas to build balanced strength.",
  "Consistency beats intensity — show up and press play.",
  "Try a new difficulty level to keep your body guessing.",
  "Short on time? A 5-minute blast still counts.",
  "Save your favourite combos so you can replay them anytime.",
  "Your body adapts — switch equipment for fresh stimulus.",
  "Rest days are growth days. Listen to your body.",
  "Challenge yourself: go one level higher this week.",
];

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

// Static thumbnail — shows a frozen first-frame for both videos and GIFs.
// GIFs: drawn onto an in-DOM <canvas> (no crossOrigin / toDataURL needed).
// Videos: a paused <video> seeked to 0.5s so a real frame is visible.
function StaticThumb({ src, isGif, onReady, eager }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [inView, setInView] = useState(!!eager);
  const [videoReady, setVideoReady] = useState(false);
  const signalledRef = useRef(false);

  const signalReady = useCallback(() => {
    if (!signalledRef.current) { signalledRef.current = true; onReady?.(); }
  }, [onReady]);

  // Lazy-observe: only load once near viewport (skipped when eager)
  useEffect(() => {
    if (eager) return;
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); io.disconnect(); }
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [eager]);

  // No src — signal ready immediately
  useEffect(() => { if (!src) signalReady(); }, [src, signalReady]);

  // GIF: draw first frame onto canvas element (no CORS export needed)
  useEffect(() => {
    if (!inView || !isGif || !src || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      signalReady();
    };
    img.onerror = signalReady;
    img.src = src;
  }, [inView, isGif, src, signalReady]);

  // Video: once metadata loads, seek to 0.5s for a visible frame
  const handleLoadedData = useCallback((e) => {
    const vid = e.target;
    vid.currentTime = 0.5;
  }, []);
  const handleSeeked = useCallback(() => {
    setVideoReady(true);
    signalReady();
  }, [signalReady]);
  const handleError = useCallback(() => signalReady(), [signalReady]);

  if (!src) {
    return (
      <div ref={wrapRef} className="static-thumb-wrap">
        <div className="byo-thumb-placeholder">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="static-thumb-wrap">
      {isGif ? (
        <canvas ref={canvasRef} className="static-thumb-canvas" />
      ) : inView ? (
        <video
          src={`${src}#t=0.5`}
          muted
          playsInline
          preload="metadata"
          onLoadedData={handleLoadedData}
          onSeeked={handleSeeked}
          onError={handleError}
          style={{ opacity: videoReady ? 1 : 0 }}
        />
      ) : null}
    </div>
  );
}

/* ── Tick sound + haptic utilities for scroll picker ── */
let _audioCtx = null;
function playTick() {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 900;
    gain.gain.setValueAtTime(0.08, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.03);
    osc.connect(gain).connect(_audioCtx.destination);
    osc.start();
    osc.stop(_audioCtx.currentTime + 0.03);
  } catch (_) { /* silent fallback */ }
}

function triggerHaptic() {
  try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) {}
}

/* ── RepsPicker: scroll-snap drum picker ── */
const REPS_MIN = 1;
const REPS_MAX = 100;
const ITEM_H = 44; // px per item row

function RepsPicker({ value, onSelect, onClose, label }) {
  const scrollRef = useRef(null);
  const lastTickRef = useRef(value || 10);
  const [currentVal, setCurrentVal] = useState(value || 10);

  // Build number list with padding
  const numbers = [];
  for (let i = REPS_MIN; i <= REPS_MAX; i++) numbers.push(i);

  // Scroll to initial value on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = (value || 10) - REPS_MIN;
    el.scrollTop = idx * ITEM_H;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_H);
    const num = Math.min(Math.max(REPS_MIN + idx, REPS_MIN), REPS_MAX);
    setCurrentVal(num);
    if (num !== lastTickRef.current) {
      lastTickRef.current = num;
      playTick();
      triggerHaptic();
    }
  }, []);

  const confirmValue = useCallback(() => {
    onSelect(currentVal);
    onClose();
  }, [currentVal, onSelect, onClose]);

  // Visible window: 5 items (2 above, selected, 2 below)
  const visibleH = ITEM_H * 5;

  return (
    <div className="reps-picker-backdrop" onClick={onClose}>
      <div className="reps-picker-sheet" onClick={e => e.stopPropagation()}>
        <div className="reps-picker-header">
          <button className="reps-picker-cancel" onClick={onClose}>Cancel</button>
          <span className="reps-picker-title">{label || 'Reps'}</span>
          <button className="reps-picker-done" onClick={confirmValue}>Done</button>
        </div>
        <div className="reps-picker-drum-wrapper">
          <div className="reps-picker-highlight" />
          <div
            ref={scrollRef}
            className="reps-picker-scroll"
            style={{ height: visibleH }}
            onScroll={handleScroll}
          >
            {/* Top padding so first item can center */}
            <div style={{ height: ITEM_H * 2 }} />
            {numbers.map(n => (
              <div
                key={n}
                className={`reps-picker-item${n === currentVal ? ' reps-picker-item-active' : ''}`}
                style={{ height: ITEM_H }}
              >
                {n}
              </div>
            ))}
            {/* Bottom padding so last item can center */}
            <div style={{ height: ITEM_H * 2 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoreBuddyWorkouts() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { isPremium, FREE_RANDOMISER_DURATIONS, FREE_RANDOMISER_WEEKLY_LIMIT } = useTier();
  const FREE_BYO_LIMIT = 1; // Free users can only save 1 BYO workout
  const navigate = useNavigate();

  // Views: 'landing' | 'randomiser_hub' | 'setup' | 'spinning' | 'preview' | 'countdown' | 'workout' | 'byo_hub' | 'byo_mode' | 'byo_pick' | 'byo_sets_config' | 'byo_save' | 'byo_sets'
  const [view, setView] = useState('landing');
  const [landingTab, setLandingTab] = useState('week'); // 'week' | 'overall'
  const [fabSavedOverlay, setFabSavedOverlay] = useState(null); // which FAB category is expanded (focus key or 'hiit'/'sets')
  const [fabOpen, setFabOpen] = useState(false);
  const [byoFabTab, setByoFabTab] = useState('byo_hiit'); // 'byo_hiit' | 'byo_sets'

  // Setup
  const [selectedEquipment, setSelectedEquipment] = useState(['bodyweight']);
  const [focusArea, setFocusArea] = useState('core');
  const [level, setLevel] = useState('intermediate');
  const [customWork, setCustomWork] = useState(30);
  const [customRest, setCustomRest] = useState(30);
  const [duration, setDuration] = useState(isPremium ? 15 : 5);

  // Exercises from Firebase Storage
  const [allExercises, setAllExercises] = useState([]);
  const [loadingExercises, setLoadingExercises] = useState(false);
  const loadingRef = useRef(false);
  const exercisesRef = useRef([]);
  const lastPathsKeyRef = useRef(''); // tracks equipment+focus to avoid needless refetch

  // Generated workout
  const [workout, setWorkout] = useState([]); // [{ name, videoUrl }]
  const [rounds, setRounds] = useState(2);
  const [levelConfig, setLevelConfig] = useState(LEVELS[1]);

  // Ref flag for quickStart: triggers generateWorkout after state settles
  const pendingQuickStartRef = useRef(false);

  // Track thumbnail readiness so spinner stays until all thumbs are loaded
  const thumbsReadyCount = useRef(0);
  const thumbsTotal = useRef(0);
  const spinMinDone = useRef(false);
  const thumbsAllReady = useRef(false);
  const tryRevealPreview = useRef(() => {});
  const previewTimers = useRef([]);
  // Called by each StaticThumb via onReady in the preview view
  const handleThumbReady = useCallback(() => {
    thumbsReadyCount.current += 1;
    if (thumbsReadyCount.current >= thumbsTotal.current) {
      thumbsAllReady.current = true;
      tryRevealPreview.current();
    }
  }, []);

  // Active workout state
  const [currentRound, setCurrentRound] = useState(1);
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [phase, setPhase] = useState('work'); // 'work' | 'rest'
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [startCountdown, setStartCountdown] = useState(0);

  // Hold-to-finish overlay
  const [showFinish, setShowFinish] = useState(false);
  const [lastWorkoutLogId, setLastWorkoutLogId] = useState(null);

  // Quick-preview modal for exercise thumbnails
  const [previewEx, setPreviewEx] = useState(null);

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

  // Share to Journey helper — accepts structured data or plain text
  const shareToJourney = useCallback(async (data) => {
    if (!clientData) throw new Error('Not signed in');
    const isStructured = data && typeof data === 'object' && data.type;
    await addDoc(collection(db, 'posts'), {
      authorId: clientData.id,
      authorName: clientData.name || currentUser?.displayName || clientData.email || 'Unknown',
      authorPhotoURL: clientData.photoURL || null,
      content: isStructured ? '' : data,
      type: isStructured ? data.type : 'text',
      imageURL: null,
      createdAt: serverTimestamp(),
      likeCount: 0,
      commentCount: 0,
      ...(isStructured ? { metadata: { title: data.title || '', subtitle: data.subtitle || '', stats: data.stats || [], quote: data.quote || '', badges: data.badges || [] } } : {}),
    });
    trackWorkoutShared();
  }, [clientData]);


  // Workout stats
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [badgeCelebration, setBadgeCelebration] = useState(null);
  const [levelBreakdown, setLevelBreakdown] = useState({ beginner: 0, intermediate: 0, advanced: 0 });

  // BYO stats
  const [byoTotalVolume, setByoTotalVolume] = useState(0);
  const [byoTotalReps, setByoTotalReps] = useState(0);
  const [byoTotalWorkouts, setByoTotalWorkouts] = useState(0);

  // Combined landing stats
  const [combinedWeeklyCount, setCombinedWeeklyCount] = useState(0);
  const [weeklyVolume, setWeeklyVolume] = useState(0);
  const [weekWorkoutDays, setWeekWorkoutDays] = useState([]); // 7 booleans Mon-Sun
  const [allRecentWorkouts, setAllRecentWorkouts] = useState([]); // last 4, any type

  // Free-tier gating: limit available durations and weekly usage
  const availableTimeOptions = isPremium ? TIME_OPTIONS : TIME_OPTIONS.filter(t => FREE_RANDOMISER_DURATIONS.includes(t));
  const freeRandomiserLimitReached = !isPremium && weeklyCount >= FREE_RANDOMISER_WEEKLY_LIMIT;

  // Saved workouts
  const [savedWorkouts, setSavedWorkouts] = useState([]);
  const [savedWorkoutsLoaded, setSavedWorkoutsLoaded] = useState(false);
  const [expandedSavedCats, setExpandedSavedCats] = useState({});
  const [recentOpen, setRecentOpen] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveWorkoutName, setSaveWorkoutName] = useState('');

  // Smart suggestion
  const [smartSuggestion, setSmartSuggestion] = useState(null);

  // Build Your Own (BYO)
  const [byoMode, setByoMode] = useState(null); // 'hiit' | 'sets'
  const [byoFromSaved, setByoFromSaved] = useState(false); // true when launched from saved template
  const [byoSearch, setByoSearch] = useState('');
  const [byoShowCustom, setByoShowCustom] = useState(false);
  const [byoCustomName, setByoCustomName] = useState('');
  const [byoCustomType, setByoCustomType] = useState('weighted');
  const [byoSelected, setByoSelected] = useState([]); // array of exercise objects from BUDDY_EXERCISES
  const [byoExpandedGroups, setByoExpandedGroups] = useState({});
  const [byoMuscleFilter, setByoMuscleFilter] = useState({});
  const [byoVideoUrls, setByoVideoUrls] = useState({}); // { storagePath: url }
  const [byoPreviewEx, setByoPreviewEx] = useState(null); // exercise for preview modal
  const [byoLevel, setByoLevel] = useState('intermediate');
  const [byoSetsConfig, setByoSetsConfig] = useState({}); // { exerciseName: numberOfSets }
  const [byoSetsData, setByoSetsData] = useState({}); // { exerciseName: [{ reps: '', weight: '' }, ...] }
  const [repsPicker, setRepsPicker] = useState(null); // { exercise: name, idx: setIndex, label: 'Reps'|'Secs' }
  const [byoLoading, setByoLoading] = useState(false);
  const [showByoFinish, setShowByoFinish] = useState(false);
  const [showByoSaveModal, setShowByoSaveModal] = useState(false);
  const [byoSaveName, setByoSaveName] = useState('');
  const [byoSaveCategory, setByoSaveCategory] = useState('core');
  const [byoWeightUnit, setByoWeightUnit] = useState(() => localStorage.getItem('mcf_weight_unit') || 'kg');

  // Recent workouts (last 3 for hub)
  const [recentWorkouts, setRecentWorkouts] = useState([]);

  // Hub stats (total, favourite focus, streak)
  const [hubStats, setHubStats] = useState({ total: 0, favouriteFocus: null, streak: 0 });

  const [statsLoaded, setStatsLoaded] = useState(false);

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
        // Fetch workoutLogs and activityLogs in parallel
        const actQ = query(collection(db, 'activityLogs'), where('clientId', '==', clientData.id));
        const [snap, actSnap] = await Promise.all([getDocs(q), getDocs(actQ)]);
        const docs = snap.docs.map(d => d.data());
        const actDocs = actSnap.docs.map(d => d.data());

        setTotalCount(docs.length);

        // Total minutes
        const mins = docs.reduce((sum, d) => sum + (d.duration || 0), 0);
        setTotalMinutes(mins);

        // Level breakdown
        const levels = { beginner: 0, intermediate: 0, advanced: 0 };
        docs.forEach(d => { if (d.level && levels[d.level] !== undefined) levels[d.level]++; });
        setLevelBreakdown(levels);

        // Weekly count (Monday-based)
        const now = new Date();
        const day = now.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const monday = new Date(now);
        monday.setDate(now.getDate() + mondayOffset);
        monday.setHours(0, 0, 0, 0);
        const mondayMs = monday.getTime();
        const sundayMs = mondayMs + 7 * 24 * 60 * 60 * 1000 - 1;

        const getMs = (ts) => {
          if (!ts) return 0;
          return ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
        };

        const weekly = docs.filter(d => {
          const ms = getMs(d.completedAt);
          return ms >= mondayMs;
        });
        setWeeklyCount(weekly.length);

        // Combined weekly count (all workout types + activities)
        const weeklyActs = actDocs.filter(d => getMs(d.completedAt) >= mondayMs);
        setCombinedWeeklyCount(weekly.length + weeklyActs.length);

        // Weekly volume (BYO sets this week)
        let wkVol = 0;
        weekly.filter(d => d.type === 'custom_sets').forEach(d => {
          (d.exercises || []).forEach(ex => {
            (ex.sets || []).forEach(s => {
              wkVol += (parseInt(s.reps) || 0) * (parseFloat(s.weight) || 0);
            });
          });
        });
        setWeeklyVolume(wkVol);

        // Weekly workout days (Mon=0 to Sun=6) for consistency bars
        const dayFlags = [false, false, false, false, false, false, false];
        [...weekly, ...weeklyActs].forEach(d => {
          const ms = getMs(d.completedAt);
          if (ms >= mondayMs && ms <= sundayMs) {
            const dt = new Date(ms);
            const dow = dt.getDay(); // 0=Sun
            const idx = dow === 0 ? 6 : dow - 1; // convert to Mon=0
            dayFlags[idx] = true;
          }
        });
        setWeekWorkoutDays(dayFlags);

        // All recent workouts (last 4, any type including activities)
        const allWithType = [
          ...docs.map(d => ({ ...d, _kind: d.type === 'custom_sets' ? 'byo' : 'randomiser' })),
          ...actDocs.map(d => ({ ...d, _kind: 'activity' })),
        ].sort((a, b) => getMs(b.completedAt) - getMs(a.completedAt)).slice(0, 4);
        setAllRecentWorkouts(allWithType);

        // Streak: consecutive weeks (going backwards) with at least 1 workout (any type)
        const allTimestamps = [
          ...docs.map(d => getMs(d.completedAt)),
          ...actDocs.map(d => getMs(d.completedAt)),
        ].filter(Boolean).sort((a, b) => b - a);

        if (allTimestamps.length === 0) {
          setStreak(0);
        } else {
          const weekKeys = new Set();
          allTimestamps.forEach(ms => {
            const d = new Date(ms);
            const dayOfWeek = d.getDay();
            const monOff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const mon = new Date(d);
            mon.setDate(d.getDate() + monOff);
            mon.setHours(0, 0, 0, 0);
            weekKeys.add(mon.getTime());
          });

          const sortedWeeks = [...weekKeys].sort((a, b) => b - a);
          let streakCount = 0;
          const currentMonday = new Date(now);
          const cmOff = now.getDay() === 0 ? -6 : 1 - now.getDay();
          currentMonday.setDate(now.getDate() + cmOff);
          currentMonday.setHours(0, 0, 0, 0);
          let checkMs = currentMonday.getTime();

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

        // BYO Reps & Sets stats
        const byoDocs = docs.filter(d => d.type === 'custom_sets');
        setByoTotalWorkouts(byoDocs.length);
        let vol = 0;
        let reps = 0;
        byoDocs.forEach(d => {
          (d.exercises || []).forEach(ex => {
            (ex.sets || []).forEach(s => {
              const r = parseInt(s.reps) || 0;
              const w = parseFloat(s.weight) || 0;
              reps += r;
              vol += r * w;
            });
          });
        });
        setByoTotalVolume(vol);
        setByoTotalReps(reps);
      } catch (err) {
        console.error('Error loading workout stats:', err);
      } finally {
        setStatsLoaded(true);
      }
    };
    loadStats();
  }, [currentUser, clientData, view]);

  // Load saved workouts
  useEffect(() => {
    if (!currentUser || !clientData) return;
    const loadSaved = async () => {
      try {
        const q = query(
          collection(db, 'savedWorkouts'),
          where('clientId', '==', clientData.id)
        );
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort client-side to avoid requiring a composite Firestore index
        docs.sort((a, b) => {
          const aTime = a.savedAt?.toMillis?.() || a.savedAt?.seconds * 1000 || 0;
          const bTime = b.savedAt?.toMillis?.() || b.savedAt?.seconds * 1000 || 0;
          return bTime - aTime;
        });
        setSavedWorkouts(docs);
      } catch (err) {
        console.error('Error loading saved workouts:', err);
      } finally {
        setSavedWorkoutsLoaded(true);
      }
    };
    loadSaved();
  }, [currentUser, clientData]);

  // Load recent randomiser workouts + compute smart suggestion
  useEffect(() => {
    if (!currentUser || !clientData) return;
    const loadRecent = async () => {
      try {
        const q = query(
          collection(db, 'workoutLogs'),
          where('clientId', '==', clientData.id)
        );
        const snap = await getDocs(q);
        const all = snap.docs.map(d => d.data())
          .sort((a, b) => {
            const ta = a.completedAt?.toDate?.() || new Date(0);
            const tb = b.completedAt?.toDate?.() || new Date(0);
            return tb - ta;
          })
          .slice(0, 20);
        // Recent randomiser-only for hub display
        const randomiser = all.filter(d => d.type !== 'muscle_group');
        setRecentWorkouts(randomiser.slice(0, 3));

        // Compute hub stats
        const total = randomiser.length;
        const focusFreq = {};
        randomiser.forEach(d => { if (d.focus) focusFreq[d.focus] = (focusFreq[d.focus] || 0) + 1; });
        const favouriteFocus = Object.keys(focusFreq).sort((a, b) => focusFreq[b] - focusFreq[a])[0] || null;
        // Streak: consecutive days with a workout (looking back from today)
        let streak = 0;
        if (randomiser.length > 0) {
          const daySet = new Set();
          randomiser.forEach(d => {
            const ts = d.completedAt?.toDate ? d.completedAt.toDate() : d.completedAt ? new Date(d.completedAt) : null;
            if (ts) daySet.add(new Date(ts.getFullYear(), ts.getMonth(), ts.getDate()).toDateString());
          });
          const today = new Date(); today.setHours(0, 0, 0, 0);
          // Check if today or yesterday starts the streak
          let check = new Date(today);
          if (!daySet.has(check.toDateString())) {
            check.setDate(check.getDate() - 1);
          }
          while (daySet.has(check.toDateString())) {
            streak++;
            check.setDate(check.getDate() - 1);
          }
        }
        setHubStats({ total, favouriteFocus, streak });

        // Smart suggestion: find which focus area is most neglected
        const focusCounts = { core: null, upper: null, lower: null, fullbody: null };
        randomiser.forEach(d => {
          if (d.focus && focusCounts[d.focus] === null && d.completedAt) {
            const ts = d.completedAt.toDate ? d.completedAt.toDate() : new Date(d.completedAt);
            focusCounts[d.focus] = ts;
          }
        });

        // Find the focus area with the oldest (or no) workout
        let suggestion = null;
        let oldestDate = new Date();
        const focusKeys = ['core', 'upper', 'lower', 'fullbody'];
        for (const key of focusKeys) {
          if (focusCounts[key] === null) {
            // Never done this focus - top priority
            const label = FOCUS_AREAS.find(f => f.key === key)?.label || key;
            suggestion = { focus: key, label, daysAgo: null, message: `You haven't tried ${label} yet` };
            break;
          }
          if (focusCounts[key] < oldestDate) {
            oldestDate = focusCounts[key];
            const daysAgo = Math.floor((Date.now() - focusCounts[key].getTime()) / 86400000);
            if (daysAgo >= 5) {
              const label = FOCUS_AREAS.find(f => f.key === key)?.label || key;
              suggestion = { focus: key, label, daysAgo, message: `${label} — ${daysAgo} days ago` };
            }
          }
        }
        setSmartSuggestion(suggestion);
      } catch (err) {
        console.error('Error loading recent workouts:', err);
      }
    };
    loadRecent();
  }, [currentUser, clientData, view]);

  // Save workout to favourites
  const saveWorkoutToFavourites = async (name) => {
    if (!currentUser || !clientData || workout.length === 0) return;
    setSavingWorkout(true);
    try {
      const focusLabel = FOCUS_AREAS.find(f => f.key === focusArea)?.label || focusArea;
      const autoName = name || `${focusLabel} ${duration}min`;
      const docRef = await addDoc(collection(db, 'savedWorkouts'), {
        clientId: clientData.id,
        name: autoName,
        equipment: selectedEquipment,
        focus: focusArea,
        level,
        duration,
        exercises: workout.map(e => ({ name: e.name, videoUrl: e.videoUrl, isGif: e.isGif || false })),
        rounds,
        savedAt: Timestamp.now(),
      });
      setSavedWorkouts(prev => [{ id: docRef.id, clientId: clientData.id, name: autoName, equipment: selectedEquipment, focus: focusArea, level, duration, exercises: workout.map(e => ({ name: e.name, videoUrl: e.videoUrl, isGif: e.isGif || false })), rounds, savedAt: Timestamp.now() }, ...prev]);
      showToast('Workout saved!', 'success');
    } catch (err) {
      console.error('Error saving workout:', err);
      showToast('Failed to save workout', 'error');
    } finally {
      setSavingWorkout(false);
      setShowSaveModal(false);
      setSaveWorkoutName('');
    }
  };

  // Delete saved workout
  const deleteSavedWorkout = async (id) => {
    try {
      await deleteDoc(doc(db, 'savedWorkouts', id));
      setSavedWorkouts(prev => prev.filter(w => w.id !== id));
      showToast('Workout removed', 'info');
    } catch (err) {
      console.error('Error deleting saved workout:', err);
      showToast('Failed to remove workout', 'error');
    }
  };

  // ==================== BUILD YOUR OWN ====================

  // Resolve video URLs for a batch of exercises (lazy, on expand).
  // Uses listAll to discover actual files in Storage (case-insensitive match)
  // so hardcoded storagePath casing differences don't cause silent failures.
  const byoResolveUrls = async (exercises) => {
    const urlCache = readUrlCache();
    const toResolve = exercises.filter(ex => ex.storagePath && !byoVideoUrls[ex.storagePath] && !urlCache[ex.storagePath]);
    if (toResolve.length === 0) {
      // Still populate from cache
      const fromCache = {};
      exercises.forEach(ex => {
        if (ex.storagePath && urlCache[ex.storagePath]) fromCache[ex.storagePath] = urlCache[ex.storagePath];
      });
      if (Object.keys(fromCache).length > 0) setByoVideoUrls(prev => ({ ...prev, ...fromCache }));
      return;
    }

    // Group exercises by folder so we can listAll once per folder
    const folderMap = {};
    for (const ex of toResolve) {
      const lastSlash = ex.storagePath.lastIndexOf('/');
      const folder = ex.storagePath.substring(0, lastSlash);
      if (!folderMap[folder]) folderMap[folder] = [];
      folderMap[folder].push(ex);
    }

    const newUrls = {};
    for (const [folder, exs] of Object.entries(folderMap)) {
      try {
        const folderRef = ref(storage, folder);
        const result = await listAll(folderRef);

        // Build map of normalised filename → storage item
        const fileMap = {};
        for (const item of result.items) {
          const norm = item.name.toLowerCase().replace(/\.(mp4|gif)$/i, '');
          fileMap[norm] = item;
        }

        // Match exercises to actual files by normalised name
        await Promise.all(exs.map(async (ex) => {
          const fileName = ex.storagePath.substring(ex.storagePath.lastIndexOf('/') + 1);
          const norm = fileName.toLowerCase().replace(/\.(mp4|gif)$/i, '');
          const item = fileMap[norm];
          if (item) {
            try {
              const url = await getDownloadURL(item);
              urlCache[ex.storagePath] = url;
              newUrls[ex.storagePath] = url;
            } catch { /* skip */ }
          }
        }));
      } catch { /* folder not found, skip */ }
    }

    // Also pull any cached ones
    exercises.forEach(ex => {
      if (ex.storagePath && urlCache[ex.storagePath]) newUrls[ex.storagePath] = urlCache[ex.storagePath];
    });
    writeUrlCache(urlCache);
    setByoVideoUrls(prev => ({ ...prev, ...newUrls }));
  };

  // Resolve video URLs for search results
  useEffect(() => {
    const q = byoSearch.trim().toLowerCase();
    if (!q) return;
    const matches = PROGRAMMABLE_EXERCISES.filter(e => e.name.toLowerCase().includes(q));
    if (matches.length > 0) byoResolveUrls(matches);
  }, [byoSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const byoToggleGroup = (groupKey, exercises) => {
    setByoExpandedGroups(prev => {
      const isOpen = prev[groupKey];
      if (!isOpen) {
        // Expanding — resolve video URLs
        byoResolveUrls(exercises);
      }
      return { ...prev, [groupKey]: !isOpen };
    });
  };

  const byoToggleExercise = (exercise) => {
    setByoSelected(prev => {
      const exists = prev.find(e => e.name === exercise.name);
      if (exists) return prev.filter(e => e.name !== exercise.name);
      return [...prev, exercise];
    });
  };

  const byoInitSetsData = (exercises) => {
    const data = {};
    exercises.forEach(ex => {
      data[ex.name] = [{ reps: '', weight: '' }, { reps: '', weight: '' }, { reps: '', weight: '' }];
    });
    setByoSetsData(data);
  };

  const byoAddSet = (exerciseName) => {
    setByoSetsData(prev => ({
      ...prev,
      [exerciseName]: [...(prev[exerciseName] || []), { reps: '', weight: '' }],
    }));
  };

  const byoRemoveSet = (exerciseName, idx) => {
    setByoSetsData(prev => ({
      ...prev,
      [exerciseName]: prev[exerciseName].filter((_, i) => i !== idx),
    }));
  };

  const byoUpdateSet = (exerciseName, idx, field, value) => {
    setByoSetsData(prev => ({
      ...prev,
      [exerciseName]: prev[exerciseName].map((s, i) => i === idx ? { ...s, [field]: value } : s),
    }));
  };

  const byoStartHiit = async () => {
    if (byoSelected.length === 0) return;
    setByoLoading(true);
    // Resolve video URLs for selected exercises
    const urlCache = readUrlCache();
    const resolved = [];
    for (const ex of byoSelected) {
      if (!ex.storagePath) {
        resolved.push({ name: ex.name, videoUrl: null, isGif: false });
        continue;
      }
      const cacheKey = ex.storagePath;
      let url = urlCache[cacheKey];
      if (!url) {
        try { url = await getDownloadURL(ref(storage, ex.storagePath)); urlCache[cacheKey] = url; } catch { url = null; }
      }
      const isGif = /\.gif$/i.test(ex.storagePath);
      resolved.push({ name: ex.name, videoUrl: url, isGif });
    }
    writeUrlCache(urlCache);

    const config = LEVELS.find(l => l.key === byoLevel);
    setLevelConfig(config);
    setLevel(byoLevel);
    const numRounds = byoSelected.length <= 4 ? 3 : 2;
    const totalSeconds = byoSelected.length * numRounds * (config.work + config.rest);
    setDuration(Math.ceil(totalSeconds / 60));
    const equipmentUsed = [...new Set(byoSelected.map(e => e.equipment))];
    setSelectedEquipment(equipmentUsed);
    setWorkout(resolved);
    setRounds(numRounds);
    setFocusArea('mix');
    setByoLoading(false);
    previewTimers.current.forEach(clearTimeout);
    previewTimers.current = [];
    trackBYOWorkoutBuilt({ exerciseCount: byoSelected.length, equipment: equipmentUsed });
    setView('countdown');
    setStartCountdown(3);
  };

  const byoStartSets = () => {
    if (byoSelected.length === 0) return;
    trackBYOWorkoutBuilt({ exerciseCount: byoSelected.length, equipment: [...new Set(byoSelected.map(e => e.equipment))] });
    byoInitSetsData(byoSelected);
    setView('byo_sets');
  };

  const byoCompleteSets = async () => {
    if (!currentUser || !clientData) return;
    // Build exercise log with filled sets
    const exercises = byoSelected.map(ex => {
      const sets = (byoSetsData[ex.name] || [])
        .filter(s => s.reps)
        .map(s => ({ reps: parseInt(s.reps) || 0, ...(s.weight ? { weight: parseFloat(s.weight) || 0 } : {}) }));
      return { name: ex.name, type: ex.type, sets };
    }).filter(e => e.sets.length > 0);

    if (exercises.length === 0) {
      showToast('Log at least one set to complete', 'error');
      return;
    }

    const totalSets = exercises.reduce((sum, e) => sum + e.sets.length, 0);
    try {
      const logRef = await addDoc(collection(db, 'workoutLogs'), {
        clientId: clientData.id,
        type: 'custom_sets',
        weightUnit: byoWeightUnit,
        exercises,
        exerciseCount: exercises.length,
        totalSets,
        date: new Date().toISOString().split('T')[0],
        completedAt: Timestamp.now(),
      });
      setLastWorkoutLogId(logRef.id);
      trackWorkoutCompleted({ focus: 'custom_sets', level: 'custom', duration: 0, equipment: [...new Set(byoSelected.map(e => e.equipment))], exerciseCount: exercises.length });
      setWeeklyCount(c => c + 1);
      const newTotal = totalCount + 1;
      setTotalCount(newTotal);
      setLevelBreakdown(lb => ({ ...lb, custom: (lb.custom || 0) + 1 }));

      // Update BYO stats
      setByoTotalWorkouts(c => c + 1);
      let sessionVol = 0;
      let sessionReps = 0;
      exercises.forEach(ex => {
        ex.sets.forEach(s => {
          const r = parseInt(s.reps) || 0;
          const w = parseFloat(s.weight) || 0;
          sessionReps += r;
          sessionVol += r * w;
        });
      });
      setByoTotalVolume(v => v + sessionVol);
      setByoTotalReps(r => r + sessionReps);

      // Check badges
      const workoutThresholds = [
        { count: 1, id: 'first_workout' },
        { count: 10, id: 'workouts_10' },
        { count: 25, id: 'workouts_25' },
        { count: 50, id: 'workouts_50' },
        { count: 100, id: 'workouts_100' },
      ];
      for (const t of workoutThresholds) {
        if (newTotal >= t.count) {
          const awarded = await awardBadge(t.id, clientData);
          if (awarded) { setBadgeCelebration(awarded); break; }
        }
      }

      // Check PBs for weighted exercises
      for (const ex of exercises) {
        if (ex.sets.some(s => s.weight)) {
          const bestSet = ex.sets.reduce((best, s) => (s.weight || 0) > (best.weight || 0) ? s : best, ex.sets[0]);
          if (bestSet.weight) await checkPB(ex.name, bestSet.weight, bestSet.reps);
        }
      }

      setShowByoFinish(true);
    } catch (err) {
      console.error('Error saving BYO workout:', err);
      showToast('Failed to save workout', 'error');
    }
  };

  const byoSaveAsTemplate = async (name) => {
    if (!currentUser || !clientData || byoSelected.length === 0) return;
    // Free-tier limit: only 1 saved BYO workout
    const existingByoCount = savedWorkouts.filter(sw => sw.type === 'byo_hiit' || sw.type === 'byo_sets').length;
    if (!isPremium && existingByoCount >= FREE_BYO_LIMIT) {
      showToast('Free plan allows 1 saved workout — upgrade for unlimited', 'error');
      return;
    }
    setSavingWorkout(true);
    try {
      const autoName = name || `Custom ${byoSelected.length} exercises`;
      const docData = {
        clientId: clientData.id,
        name: autoName,
        type: byoMode === 'hiit' ? 'byo_hiit' : 'byo_sets',
        focus: byoSaveCategory,
        exercises: byoSelected.map(e => ({ name: e.name, type: e.type, equipment: e.equipment, group: e.group, storagePath: e.storagePath })),
        savedAt: Timestamp.now(),
      };
      if (byoMode === 'hiit') {
        docData.level = byoLevel;
      } else {
        docData.setsConfig = byoSetsConfig;
      }
      const docRef = await addDoc(collection(db, 'savedWorkouts'), docData);
      setSavedWorkouts(prev => [...prev, { id: docRef.id, ...docData }]);
      showToast('Workout saved!', 'success');
      // Reset BYO state and go back to hub
      setByoSelected([]);
      setByoSetsConfig({});
      setByoSaveName('');
      setByoSaveCategory('core');
      setByoMode(null);
      setView('byo_hub');
    } catch (err) {
      console.error('Error saving BYO template:', err);
      showToast('Failed to save workout', 'error');
    } finally {
      setSavingWorkout(false);
    }
  };

  // Begin a saved BYO workout from library
  const beginSavedByo = async (saved) => {
    const exercises = saved.exercises || [];
    if (saved.type === 'byo_hiit') {
      // Resolve video URLs and start HIIT
      setByoLoading(true);
      const urlCache = readUrlCache();
      const resolved = [];
      for (const ex of exercises) {
        if (!ex.storagePath) {
          resolved.push({ name: ex.name, videoUrl: null, isGif: false });
          continue;
        }
        let url = urlCache[ex.storagePath];
        if (!url) {
          try { url = await getDownloadURL(ref(storage, ex.storagePath)); urlCache[ex.storagePath] = url; } catch { url = null; }
        }
        resolved.push({ name: ex.name, videoUrl: url, isGif: /\.gif$/i.test(ex.storagePath) });
      }
      writeUrlCache(urlCache);

      const lvl = saved.level || 'intermediate';
      const config = LEVELS.find(l => l.key === lvl);
      setLevelConfig(config);
      setLevel(lvl);
      const numRounds = exercises.length <= 4 ? 3 : 2;
      setWorkout(resolved);
      setRounds(numRounds);
      setFocusArea('mix');
      setSelectedEquipment([...new Set(exercises.map(e => e.equipment))]);
      setDuration(Math.ceil(exercises.length * numRounds * (config.work + config.rest) / 60));
      setByoLoading(false);
      setFabOpen(false);
      previewTimers.current.forEach(clearTimeout);
      previewTimers.current = [];
      setView('countdown');
      setStartCountdown(3);
    } else {
      // Reps & Sets — load into logging view with pre-configured sets
      const setsConfig = saved.setsConfig || {};
      const data = {};
      exercises.forEach(ex => {
        const numSets = setsConfig[ex.name] || 3;
        data[ex.name] = Array.from({ length: numSets }, () => ({ reps: '', weight: '' }));
      });
      setByoSelected(exercises);
      setByoSetsData(data);
      setByoMode('sets');
      setByoFromSaved(true);
      setFabOpen(false);
      setView('byo_sets');
    }
  };

  // Replay a saved workout
  const replaySavedWorkout = (saved) => {
    setSelectedEquipment(saved.equipment || ['bodyweight']);
    setFocusArea(saved.focus || 'core');
    setLevel(saved.level || 'intermediate');
    setDuration(saved.duration || 15);
    const config = LEVELS.find(l => l.key === (saved.level || 'intermediate'));
    setLevelConfig(config);
    setWorkout(saved.exercises || []);
    setRounds(saved.rounds || 2);
    setView('preview');
  };

  // Quick Start: store last settings and generate after re-render
  const quickStart = () => {
    const last = JSON.parse(localStorage.getItem('mcf_last_randomiser') || 'null');
    setSelectedEquipment(last?.equipment || ['bodyweight']);
    setFocusArea(last?.focus || 'core');
    setLevel(last?.level || 'intermediate');
    setDuration(last?.duration || 15);
    if (last?.customWork) setCustomWork(last.customWork);
    if (last?.customRest) setCustomRest(last.customRest);
    pendingQuickStartRef.current = true;
  };

  // Effect: run generateWorkout AFTER state has settled from quickStart
  useEffect(() => {
    if (pendingQuickStartRef.current) {
      pendingQuickStartRef.current = false;
      generateWorkout();
    }
  }); // runs every render — only fires when flag is set

  // Save last-used settings to localStorage whenever we generate
  const saveLastSettings = () => {
    localStorage.setItem('mcf_last_randomiser', JSON.stringify({
      equipment: selectedEquipment,
      focus: focusArea,
      level,
      duration,
      customWork,
      customRest,
    }));
  };

  const hasLastSettings = !!localStorage.getItem('mcf_last_randomiser');

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

  // ---- Cached URL helpers ----
  // Firebase signed URLs stay valid for a long time; cache them in
  // sessionStorage so regenerating a workout doesn't re-fetch every URL.
  const URL_CACHE_KEY = 'mcf_exercise_urls';

  const readUrlCache = () => {
    try {
      return JSON.parse(sessionStorage.getItem(URL_CACHE_KEY) || '{}');
    } catch { return {}; }
  };

  const writeUrlCache = (cache) => {
    try { sessionStorage.setItem(URL_CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
  };

  // Load exercises from Firebase Storage
  const loadExercises = async () => {
    if (loadingRef.current) {
      while (loadingRef.current) {
        await new Promise(r => setTimeout(r, 200));
      }
      return exercisesRef.current;
    }

    // If settings haven't changed, reuse the in-memory pool
    const pathsKey = getStoragePaths().sort().join('|');
    if (exercisesRef.current.length > 0 && lastPathsKeyRef.current === pathsKey) {
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

      // Resolve download URLs – use sessionStorage cache to skip repeat fetches
      const urlCache = readUrlCache();
      const exercises = await Promise.all(
        uniqueItems.map(async (item) => {
          const cacheKey = item.fullPath;
          let url = urlCache[cacheKey];
          if (!url) {
            url = await getDownloadURL(item);
            urlCache[cacheKey] = url;
          }
          const name = toTitleCase(item.name.replace(/\.(mp4|gif)$/i, ''));
          const isGif = /\.gif$/i.test(item.name);
          return { name, videoUrl: url, isGif };
        })
      );
      writeUrlCache(urlCache);

      exercisesRef.current = exercises;
      lastPathsKeyRef.current = pathsKey;
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
    if (freeRandomiserLimitReached) return;
    saveLastSettings();
    setView('spinning');
    const exercises = await loadExercises();
    if (exercises.length === 0) {
      setView('setup');
      return;
    }

    const baseConfig = LEVELS.find(l => l.key === level);
    const config = level === 'custom' ? { ...baseConfig, work: customWork, rest: customRest } : baseConfig;
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

    // Exclude advanced core moves for beginner level
    const pool = level === 'beginner'
      ? exercises.filter(e => !ADVANCED_CORE_EXERCISES.has(e.name.toLowerCase()))
      : exercises;

    const shuffled = shuffleArray(pool);
    const selected = shuffled.slice(0, Math.min(exPerRound, shuffled.length));

    // Reset thumb-readiness tracking before mounting the preview
    thumbsReadyCount.current = 0;
    thumbsTotal.current = selected.length;
    spinMinDone.current = false;
    thumbsAllReady.current = false;

    setWorkout(selected);
    setRounds(numRounds);

    // Show preview only once BOTH the min spinner time AND all thumbs are ready.
    // We switch to a hidden 'preview_loading' view so StaticThumbs mount and
    // start loading, but the spinner stays visually on top.
    const reveal = () => {
      if (spinMinDone.current && thumbsAllReady.current) setView('preview');
    };
    tryRevealPreview.current = reveal;

    setView('preview_loading');
    // Clear any leftover timers from a previous generate
    previewTimers.current.forEach(clearTimeout);
    previewTimers.current = [
      setTimeout(() => { spinMinDone.current = true; reveal(); }, 2000),
      // Safety net: if thumbs don't load within 6s, reveal anyway
      setTimeout(() => { thumbsAllReady.current = true; reveal(); }, 6000),
    ];
  };

  // Start workout (3-2-1 countdown then go)
  const startWorkout = () => {
    // Cancel any pending preview reveal timers so they can't override the view
    previewTimers.current.forEach(clearTimeout);
    previewTimers.current = [];
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
      trackWorkoutStarted({ focus: focusArea, level, duration, equipment: selectedEquipment });
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
          setShowFinish(true);
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
      const logRef = await addDoc(collection(db, 'workoutLogs'), {
        clientId: clientData.id,
        level,
        duration,
        equipment: selectedEquipment,
        focus: focusArea,
        exerciseCount: workout.length,
        rounds,
        exercises: workout.map(e => e.name),
        date: new Date().toISOString().split('T')[0],
        completedAt: Timestamp.now(),
      });
      setLastWorkoutLogId(logRef.id);
      trackWorkoutCompleted({ focus: focusArea, level, duration, equipment: selectedEquipment, exerciseCount: workout.length });
      if (typeof fbq === 'function') {
        fbq('trackCustom', 'WorkoutCompleted', {
          duration: duration,
          level: level,
          focus_area: focusArea,
          exercise_count: workout.length
        });
      }
      setWeeklyCount(c => c + 1);
      const newTotal = totalCount + 1;
      setTotalCount(newTotal);
      setTotalMinutes(m => m + duration);
      setLevelBreakdown(lb => ({ ...lb, [level]: (lb[level] || 0) + 1 }));

      // Check workout count badges
      let celebrationBadge = null;
      const workoutThresholds = [
        { count: 1, id: 'first_workout' },
        { count: 10, id: 'workouts_10' },
        { count: 25, id: 'workouts_25' },
        { count: 50, id: 'workouts_50' },
        { count: 100, id: 'workouts_100' },
      ];
      for (const t of workoutThresholds) {
        if (newTotal >= t.count) {
          const awarded = await awardBadge(t.id, clientData);
          if (awarded) { celebrationBadge = awarded; break; }
        }
      }

      // Check streak badges — only if no workout badge was just awarded
      // (streak is calculated on page load; offset by 1 if this is the first workout of the week)
      if (!celebrationBadge) {
        const newStreak = streak + (weeklyCount === 0 ? 1 : 0);
        const streakThresholds = [
          { weeks: 8, id: 'streak_8' },
          { weeks: 4, id: 'streak_4' },
          { weeks: 2, id: 'streak_2' },
        ];
        for (const t of streakThresholds) {
          if (newStreak >= t.weeks) {
            const awarded = await awardBadge(t.id, clientData);
            if (awarded) { celebrationBadge = awarded; break; }
          }
        }
      }

      if (celebrationBadge) setBadgeCelebration(celebrationBadge);
    } catch (err) {
      console.error('Error saving workout log:', err);
    }
  };

  // Check personal best for a weighted exercise
  const checkPB = async (exerciseName, weight, reps) => {
    if (!clientData || !weight) return;
    try {
      const docId = clientData.id;
      const pbDoc = await getDoc(doc(db, 'coreBuddyPBs', docId));
      const existing = pbDoc.exists() ? pbDoc.data() : null;
      const currentExercises = existing?.exercises || {};
      const currentPB = currentExercises[exerciseName];

      let isNewPB = false;
      if (!currentPB) {
        isNewPB = true;
      } else {
        if (weight > (currentPB.weight || 0)) {
          isNewPB = true;
        } else if (weight === (currentPB.weight || 0) && reps > (currentPB.reps || 0)) {
          isNewPB = true;
        }
      }

      if (isNewPB) {
        const updatedExercises = {
          ...currentExercises,
          [exerciseName]: { weight, reps, achievedAt: Timestamp.now() },
        };
        await setDoc(doc(db, 'coreBuddyPBs', docId), {
          clientId: clientData.id,
          exercises: updatedExercises,
          updatedAt: Timestamp.now(),
        });
        showToast(`New PB! ${weight}kg \u00D7 ${reps} reps`, 'success');
        playBeep();
      }
    } catch (err) {
      console.error('Error checking PB:', err);
    }
  };

  // Audio helpers (Web Audio API for beeps)
  // The AudioContext can become 'suspended' on mobile browsers when the page
  // stops producing audio (e.g. navigating back from the workout).  We must
  // resume it on every play attempt so beeps keep working after returning to
  // the randomiser screen.
  const audioCtxRef = useRef(null);
  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
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
        {TICKS_82_94.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            className={i < filled ? `wk-tick-filled ${colorClass}` : 'wk-tick-empty'}
            strokeWidth={t.thick ? '3' : '2'} />
        ))}
      </svg>
    );
  };

  // Total workout progress
  const getTotalProgress = () => {
    const totalExercises = workout.length * rounds;
    const completed = (currentRound - 1) * workout.length + currentExIndex + (phase === 'rest' ? 0.5 : 0);
    return completed / totalExercises;
  };

  // Toast element - rendered at the end of every view
  const toastEl = toast && (
    <div className={`toast-notification ${toast.type}`}>
      {toast.message}
    </div>
  );

  if (authLoading) {
    return (
      <div className="wk-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          </div>
        </header>
        <div className="wk-loading-inline"><div className="wk-loading-spinner" /></div>
      </div>
    );
  }

  // ==================== MENU VIEW ====================
  if (view === 'menu') {
    return (
      <>
      <div className="wk-page">
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
        <main className="wk-main">

          {/* Heading */}
          <div className="wk-menu-heading">
            <h2>Choose Your Workout</h2>
            <p>No excuses. Just results.</p>
          </div>

          {/* Hero Card: Randomise Workout */}
          <button className="wk-hero-card" onClick={() => setView('randomiser_hub')}>
            <img src={randomiserCardImg} alt="Randomise Workout" className="wk-hero-bg" />
          </button>

        </main>
        <CoreBuddyNav active="workouts" />
        {toastEl}
        <BadgeCelebration badge={badgeCelebration} onDismiss={() => setBadgeCelebration(null)} />
      </div>
      </>
    );
  }

  // ==================== BUILD YOUR OWN HUB VIEW ====================
  if (view === 'byo_hub') {
    const byoWorkouts = savedWorkouts.filter(sw => sw.type === 'byo_hiit' || sw.type === 'byo_sets');
    const freeBuildLimitReached = !isPremium && byoWorkouts.length >= FREE_BYO_LIMIT;
    return (
      <div className="wk-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => setView('landing')} aria-label="Go back">
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
        <main className="wk-main">
          {/* BYO Stat Rings */}
          <div className="wk-stats-row">
            {[
              { label: 'Volume', value: byoTotalVolume >= 1000 ? `${(byoTotalVolume / 1000).toFixed(1)}k` : `${Math.round(byoTotalVolume)}`, pct: byoTotalVolume > 0 ? Math.round(((byoTotalVolume % 10000) / 10000) * 100) : 0, color: '#14b8a6', size: 'normal' },
              { label: 'Workouts', value: `${byoTotalWorkouts}`, pct: byoTotalWorkouts > 0 ? Math.min(Math.round((byoTotalWorkouts / 100) * 100), 100) : 0, color: 'var(--color-primary)', size: 'large' },
              { label: 'Total Reps', value: byoTotalReps >= 1000 ? `${(byoTotalReps / 1000).toFixed(1)}k` : `${byoTotalReps}`, pct: byoTotalReps > 0 ? Math.round(((byoTotalReps % 1000) / 1000) * 100) : 0, color: '#38B6FF', size: 'normal' },
            ].map((ring) => {
              const r = 38;
              const circ = 2 * Math.PI * r;
              const offset = circ - (ring.pct / 100) * circ;
              return (
                <div key={ring.label} className={`wk-stat-item${ring.size === 'large' ? ' wk-stat-large' : ''}`}>
                  <div className="wk-stat-ring">
                    <svg viewBox="0 0 100 100">
                      <circle className="wk-stat-track" cx="50" cy="50" r={r} />
                      <circle className="wk-stat-fill" cx="50" cy="50" r={r}
                        style={{ stroke: ring.color }}
                        strokeDasharray={circ}
                        strokeDashoffset={offset} />
                    </svg>
                    <span className="wk-stat-value" style={{ color: ring.color }}>{ring.value}</span>
                  </div>
                  <span className="wk-stat-label">{ring.label}</span>
                </div>
              );
            })}
          </div>

          <div className="wk-hub-heading">
            <h2>Build Your Own</h2>
            <p>Create &amp; replay custom workouts</p>
          </div>

          <div className="wk-hub-launch-zone">
            {freeBuildLimitReached ? (
              <button className="wk-hub-card wk-hub-new-glow" onClick={() => navigate('/upgrade')}>
                <div className="wk-hub-card-icon wk-hub-card-icon--primary">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
                </div>
                <div className="wk-hub-card-body">
                  <h3>Upgrade for More</h3>
                  <p>Free plan includes 1 saved workout</p>
                </div>
                <svg className="wk-hub-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            ) : (
              <button className="wk-hub-card wk-hub-new-glow" onClick={() => { setByoSelected([]); setByoExpandedGroups({}); setByoMode(null); setByoSearch(''); setView('byo_mode'); }}>
                <div className="wk-hub-card-icon wk-hub-card-icon--primary">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                <div className="wk-hub-card-body">
                  <h3>Let&apos;s Build</h3>
                  <p>Pick exercises &amp; build your workout</p>
                </div>
                <svg className="wk-hub-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            )}
          </div>

          {/* Saved BYO workouts inline */}
          {byoWorkouts.length > 0 && (
            <div className="wk-hub-byo-section">
              <div className="wk-hub-heading">
                <h2>My Workouts</h2>
                <p>{byoWorkouts.length} saved workout{byoWorkouts.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="wk-hub-byo-list">
                {byoWorkouts.map((sw, i) => {
                  const typeLabel = sw.type === 'byo_hiit' ? 'HIIT' : 'Reps & Sets';
                  const exCount = (sw.exercises || []).length;
                  return (
                    <div key={sw.id} className="wk-hub-byo-card" style={{ animationDelay: `${i * 0.05}s` }}>
                      <button className="wk-hub-byo-main" onClick={() => beginSavedByo(sw)}>
                        <div className="wk-hub-byo-icon">
                          {sw.type === 'byo_hiit' ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                          )}
                        </div>
                        <div className="wk-hub-byo-info">
                          <span className="wk-hub-byo-name">{sw.name}</span>
                          <span className="wk-hub-byo-meta">{typeLabel} &middot; {exCount} exercises</span>
                        </div>
                        <span className="wk-hub-byo-begin">Begin</span>
                      </button>
                      <button className="wk-hub-byo-delete" onClick={() => deleteSavedWorkout(sw.id)} aria-label="Remove workout">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* BYO FAB Button */}
        {byoWorkouts.length > 0 && (
          <>
            <button
              className={`wk-fab${fabOpen ? ' wk-fab-open wk-fab-hidden' : ''}`}
              onClick={() => { setFabOpen(prev => !prev); setFabSavedOverlay(null); }}
              aria-label={fabOpen ? 'Close menu' : 'Saved Workouts'}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>

            {fabOpen && !fabSavedOverlay && (
              <div className="cb-fab-overlay" onClick={() => setFabOpen(false)}>
                <div className="cb-fab-sheet" onClick={e => e.stopPropagation()}>
                  <div className="cb-fab-header">
                    <h3>My Workouts</h3>
                    <button className="cb-fab-close" onClick={() => setFabOpen(false)}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <div className="cb-fab-grid">
                    {FOCUS_AREAS.map((fa, i) => {
                      const count = byoWorkouts.filter(sw => sw.focus === fa.key).length;
                      if (count === 0) return null;
                      const hasHiit = byoWorkouts.some(sw => sw.focus === fa.key && sw.type === 'byo_hiit');
                      return (
                        <button key={fa.key} className="cb-fab-item" style={{ animationDelay: `${i * 0.03}s` }} onClick={() => { setByoFabTab(hasHiit ? 'byo_hiit' : 'byo_sets'); setFabSavedOverlay(fa.key); }}>
                          <span className="cb-fab-item-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d={fa.icon}/></svg>
                          </span>
                          <span className="cb-fab-item-label">{fa.label}</span>
                          <span className="wk-fab-count">{count}</span>
                        </button>
                      );
                    })}
                    {/* Uncategorised (legacy BYO workouts without focus) */}
                    {(() => {
                      const uncatCount = byoWorkouts.filter(sw => !sw.focus).length;
                      if (uncatCount === 0) return null;
                      const hasHiit = byoWorkouts.some(sw => !sw.focus && sw.type === 'byo_hiit');
                      return (
                        <button className="cb-fab-item" onClick={() => { setByoFabTab(hasHiit ? 'byo_hiit' : 'byo_sets'); setFabSavedOverlay('uncategorised'); }}>
                          <span className="cb-fab-item-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                          </span>
                          <span className="cb-fab-item-label">Other</span>
                          <span className="wk-fab-count">{uncatCount}</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* BYO FAB Saved Overlay — tabbed by HIIT / Reps & Sets */}
            {fabOpen && fabSavedOverlay && (() => {
              const catWorkouts = fabSavedOverlay === 'uncategorised'
                ? byoWorkouts.filter(sw => !sw.focus)
                : byoWorkouts.filter(sw => sw.focus === fabSavedOverlay);
              const fa = FOCUS_AREAS.find(f => f.key === fabSavedOverlay);
              const catLabel = fa?.label || 'Other';
              const hiitList = catWorkouts.filter(sw => sw.type === 'byo_hiit');
              const setsList = catWorkouts.filter(sw => sw.type === 'byo_sets');
              const activeTab = byoFabTab;
              const tabWorkouts = activeTab === 'byo_hiit' ? hiitList : setsList;
              return (
                <div className="wk-saved-overlay-backdrop" onClick={() => setFabSavedOverlay(null)}>
                  <div className="wk-saved-overlay-card" onClick={e => e.stopPropagation()}>
                    <div className="wk-saved-overlay-header">
                      <button className="wk-saved-overlay-back" onClick={() => setFabSavedOverlay(null)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                      </button>
                      <h3>{catLabel}</h3>
                      <button className="cb-fab-close" onClick={() => { setFabSavedOverlay(null); setFabOpen(false); }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    {/* Type tabs */}
                    <div className="wk-byo-fab-tabs">
                      <button className={`wk-byo-fab-tab${activeTab === 'byo_hiit' ? ' wk-byo-fab-tab-active' : ''}`} onClick={() => setByoFabTab('byo_hiit')}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        HIIT
                        {hiitList.length > 0 && <span className="wk-byo-fab-tab-count">{hiitList.length}</span>}
                      </button>
                      <button className={`wk-byo-fab-tab${activeTab === 'byo_sets' ? ' wk-byo-fab-tab-active' : ''}`} onClick={() => setByoFabTab('byo_sets')}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                        Reps &amp; Sets
                        {setsList.length > 0 && <span className="wk-byo-fab-tab-count">{setsList.length}</span>}
                      </button>
                    </div>
                    <div className="wk-saved-overlay-list">
                      {tabWorkouts.length === 0 ? (
                        <div className="wk-hub-empty" style={{ padding: '24px 0' }}>
                          <p style={{ color: '#999', fontSize: '0.85rem' }}>No {activeTab === 'byo_hiit' ? 'HIIT' : 'Reps & Sets'} workouts saved here.</p>
                        </div>
                      ) : tabWorkouts.map((sw, i) => {
                        const exCount = (sw.exercises || []).length;
                        return (
                          <div key={sw.id} className="wk-saved-overlay-item" style={{ animationDelay: `${i * 0.05}s` }}>
                            <button className="wk-saved-overlay-main" onClick={() => { beginSavedByo(sw); setFabSavedOverlay(null); }}>
                              <div className="wk-saved-overlay-info">
                                <span className="wk-saved-overlay-name">{sw.name}</span>
                                <span className="wk-saved-overlay-meta">{exCount} exercises</span>
                              </div>
                              <span className="byo-begin-label">Begin</span>
                            </button>
                            <button className="wk-saved-overlay-delete" onClick={() => deleteSavedWorkout(sw.id)} aria-label="Remove">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        <CoreBuddyNav active="workouts" />
        {toastEl}
        <BadgeCelebration badge={badgeCelebration} onDismiss={() => setBadgeCelebration(null)} />
      </div>
    );
  }

  // ==================== BUILD YOUR OWN — MODE PICKER ====================
  if (view === 'byo_mode') {
    return (
      <div className="wk-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => setView('byo_hub')} aria-label="Go back">
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
        <main className="wk-main">
          <div className="wk-hub-heading">
            <h2>Build Your Own</h2>
            <p>Choose your workout style</p>
          </div>
          <div className="byo-mode-grid">
            <button className={`byo-mode-card${byoMode === 'hiit' ? ' byo-mode-active' : ''}`} onClick={() => setByoMode('hiit')}>
              <div className="byo-mode-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div className="byo-mode-card-text">
                <h3>HIIT</h3>
                <p>Timed intervals with work &amp; rest periods</p>
              </div>
            </button>
            <button className={`byo-mode-card${byoMode === 'sets' ? ' byo-mode-active' : ''}`} onClick={() => setByoMode('sets')}>
              <div className="byo-mode-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              </div>
              <div className="byo-mode-card-text">
                <h3>Reps &amp; Sets</h3>
                <p>Log weight, reps and sets for each exercise</p>
              </div>
            </button>
          </div>
          {byoMode && (
            <button className="wk-btn-primary byo-continue-btn" onClick={() => setView('byo_pick')}>
              Continue
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          )}
        </main>
        <CoreBuddyNav active="workouts" />
      </div>
    );
  }

  // ==================== BUILD YOUR OWN — EXERCISE PICKER ====================
  if (view === 'byo_pick') {
    const exercisePool = PROGRAMMABLE_EXERCISES;
    return (
      <div className="wk-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => setView('byo_mode')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
            <div className="header-actions">
              {byoSelected.length > 0 && (
                <span className="byo-pick-count">{byoSelected.length}</span>
              )}
            </div>
          </div>
        </header>
        <main className="wk-main byo-pick-main">
          <div className="wk-hub-heading">
            <h2>Pick Exercises</h2>
            <p>Tap to select &middot; {byoSelected.length} chosen</p>
          </div>

          <div className="byo-search-bar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              className="byo-search-input"
              placeholder="Search exercises..."
              value={byoSearch}
              onChange={e => setByoSearch(e.target.value)}
            />
            {byoSearch && (
              <button className="byo-search-clear" onClick={() => setByoSearch('')} aria-label="Clear search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>

          <button className="byo-add-custom-btn" onClick={() => { setByoShowCustom(true); setByoCustomName(''); setByoCustomType('weighted'); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Your Own Exercise
          </button>

          {byoShowCustom && (
            <div className="wk-save-modal-backdrop" onClick={() => setByoShowCustom(false)}>
              <div className="wk-save-modal" onClick={e => e.stopPropagation()}>
                <h3>Add Custom Exercise</h3>
                <p>Enter a name and choose the type</p>
                <input
                  type="text"
                  className="wk-save-input"
                  value={byoCustomName}
                  onChange={e => setByoCustomName(e.target.value)}
                  placeholder="e.g. Cable Flyes"
                  maxLength={50}
                  autoFocus
                />
                <div className="byo-custom-type-row">
                  {[
                    { key: 'weighted', label: 'Weighted' },
                    { key: 'bodyweight', label: 'Bodyweight' },
                    { key: 'timed', label: 'Timed' },
                  ].map(t => (
                    <button key={t.key} className={`byo-custom-type-btn${byoCustomType === t.key ? ' byo-custom-type-active' : ''}`} onClick={() => setByoCustomType(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="wk-save-modal-actions">
                  <button className="wk-btn-secondary" onClick={() => setByoShowCustom(false)}>Cancel</button>
                  <button className="wk-btn-primary" disabled={!byoCustomName.trim()} onClick={() => {
                    const name = byoCustomName.trim();
                    if (!name) return;
                    const exists = byoSelected.find(s => s.name.toLowerCase() === name.toLowerCase());
                    if (exists) { setByoShowCustom(false); return; }
                    const custom = { name, type: byoCustomType, equipment: 'custom', group: 'custom', storagePath: '' };
                    setByoSelected(prev => [...prev, custom]);
                    setByoShowCustom(false);
                  }}>
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {byoMode === 'hiit' && (
            <div className="byo-level-row">
              {LEVELS.map(l => (
                <button key={l.key} className={`byo-level-btn${byoLevel === l.key ? ' byo-level-active' : ''}`} onClick={() => setByoLevel(l.key)}>
                  <span className="byo-level-label">{l.label}</span>
                  <span className="byo-level-desc">{l.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* Search results — flat list */}
          {byoSearch.trim() && (() => {
            const q = byoSearch.trim().toLowerCase();
            const matches = exercisePool.filter(e => e.name.toLowerCase().includes(q));
            if (matches.length === 0) {
              return <div className="byo-search-empty">No exercises found</div>;
            }
            return (
              <div className="byo-exercise-list byo-search-results">
                {matches.map(ex => {
                  const isSelected = byoSelected.find(s => s.name === ex.name);
                  const videoUrl = byoVideoUrls[ex.storagePath];
                  const isGif = /\.gif$/i.test(ex.storagePath || '');
                  return (
                    <div key={ex.name} className={`byo-exercise-row${isSelected ? ' byo-exercise-selected' : ''}`} onClick={() => byoToggleExercise(ex)}>
                      <div className="byo-exercise-thumb-sm" onClick={(e) => {
                        if (videoUrl) { e.stopPropagation(); setByoPreviewEx({ name: ex.name, videoUrl, isGif }); }
                      }}>
                        {videoUrl ? (
                          <StaticThumb src={videoUrl} isGif={isGif} />
                        ) : (
                          <div className="byo-thumb-placeholder">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          </div>
                        )}
                        {videoUrl && (
                          <div className="byo-thumb-play-sm">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                          </div>
                        )}
                      </div>
                      <span className="byo-exercise-name">{ex.name}</span>
                      {isSelected && (
                        <svg className="byo-exercise-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Group/subgroup browsing — hidden when searching */}
          {!byoSearch.trim() && BYO_GROUPS.map(group => {
            const allGroupExercises = exercisePool.filter(e => group.groups.includes(e.group));
            if (allGroupExercises.length === 0) return null;
            const isGroupOpen = byoExpandedGroups[group.key];
            const selectedInGroup = allGroupExercises.filter(e => byoSelected.find(s => s.name === e.name)).length;

            // Muscle filter
            const muscleFilters = BYO_MUSCLE_FILTERS[group.key] || [];
            const activeMuscle = byoMuscleFilter[group.key] || 'all';
            const groupExercises = activeMuscle === 'all'
              ? allGroupExercises
              : allGroupExercises.filter(e => e.muscle === activeMuscle);

            // Sub-group by equipment
            const equipmentSubgroups = BYO_EQUIPMENT_ORDER
              .map(eqKey => ({
                key: eqKey,
                label: BYO_EQUIPMENT_LABELS[eqKey],
                exercises: groupExercises.filter(e => e.equipment === eqKey).sort((a, b) => a.name.localeCompare(b.name)),
              }))
              .filter(sg => sg.exercises.length > 0);

            return (
              <div key={group.key} className="byo-group">
                <button className="byo-group-header" onClick={() => setByoExpandedGroups(prev => ({ ...prev, [group.key]: !prev[group.key] }))}>
                  <span className="byo-group-label">{group.label}</span>
                  {selectedInGroup > 0 && <span className="byo-group-badge">{selectedInGroup}</span>}
                  <svg className={`byo-group-chevron${isGroupOpen ? ' byo-group-chevron-open' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                {isGroupOpen && (
                  <div className="byo-subgroups">
                    {muscleFilters.length > 1 && (
                      <div className="byo-muscle-filters">
                        {muscleFilters.map(mf => (
                          <button
                            key={mf.key}
                            className={`byo-muscle-chip${activeMuscle === mf.key ? ' byo-muscle-chip-active' : ''}`}
                            onClick={() => setByoMuscleFilter(prev => ({ ...prev, [group.key]: mf.key }))}
                          >{mf.label}</button>
                        ))}
                      </div>
                    )}
                    {equipmentSubgroups.map(sg => {
                      const subKey = `${group.key}_${sg.key}`;
                      const isSubOpen = byoExpandedGroups[subKey];
                      const selectedInSub = sg.exercises.filter(e => byoSelected.find(s => s.name === e.name)).length;
                      return (
                        <div key={subKey} className="byo-subgroup">
                          <button className="byo-subgroup-header" onClick={() => byoToggleGroup(subKey, sg.exercises)}>
                            <span className="byo-subgroup-label">{sg.label}</span>
                            {selectedInSub > 0 && <span className="byo-group-badge">{selectedInSub}</span>}
                            <svg className={`byo-group-chevron${isSubOpen ? ' byo-group-chevron-open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                          </button>
                          {isSubOpen && (
                            <div className="byo-exercise-list">
                              {sg.exercises.map(ex => {
                                const isSelected = byoSelected.find(s => s.name === ex.name);
                                const videoUrl = byoVideoUrls[ex.storagePath];
                                const isGif = /\.gif$/i.test(ex.storagePath || '');
                                return (
                                  <div key={ex.name} className={`byo-exercise-row${isSelected ? ' byo-exercise-selected' : ''}`} onClick={() => byoToggleExercise(ex)}>
                                    <div className="byo-exercise-thumb-sm" onClick={(e) => {
                                      if (videoUrl) { e.stopPropagation(); setByoPreviewEx({ name: ex.name, videoUrl, isGif }); }
                                    }}>
                                      {videoUrl ? (
                                        <StaticThumb src={videoUrl} isGif={isGif} />
                                      ) : (
                                        <div className="byo-thumb-placeholder">
                                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                        </div>
                                      )}
                                      {videoUrl && (
                                        <div className="byo-thumb-play-sm">
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                        </div>
                                      )}
                                    </div>
                                    <span className="byo-exercise-name">{ex.name}</span>
                                    {isSelected && (
                                      <svg className="byo-exercise-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Exercise preview modal */}
          {byoPreviewEx && (
            <div className="wk-preview-modal-backdrop" onClick={() => setByoPreviewEx(null)}>
              <div className="wk-preview-modal" onClick={e => e.stopPropagation()}>
                <button className="wk-preview-modal-close" onClick={() => setByoPreviewEx(null)} aria-label="Close preview">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <div className="wk-preview-modal-video">
                  {byoPreviewEx.isGif ? (
                    <img src={byoPreviewEx.videoUrl} alt={byoPreviewEx.name} />
                  ) : (
                    <video src={byoPreviewEx.videoUrl} autoPlay loop muted playsInline />
                  )}
                </div>
                <h3 className="wk-preview-modal-title">{byoPreviewEx.name}</h3>
              </div>
            </div>
          )}
        </main>

        {byoSelected.length > 0 && (
          <div className="byo-pick-footer">
            <button className="wk-btn-primary byo-start-btn" onClick={() => setView(byoMode === 'sets' ? 'byo_sets_config' : 'byo_save')}>
              Next ({byoSelected.length} exercises)
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        )}
        <CoreBuddyNav active="workouts" />
      </div>
    );
  }

  // ==================== BUILD YOUR OWN — SETS CONFIG ====================
  if (view === 'byo_sets_config') {
    // Initialize setsConfig defaults if empty
    if (Object.keys(byoSetsConfig).length === 0 && byoSelected.length > 0) {
      const defaults = {};
      byoSelected.forEach(ex => { defaults[ex.name] = 3; });
      setByoSetsConfig(defaults);
    }
    return (
      <div className="wk-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => setView('byo_pick')} aria-label="Go back">
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
        <main className="wk-main byo-pick-main">
          <div className="wk-hub-heading">
            <h2>Set Amounts</h2>
            <p>Choose how many sets for each exercise</p>
          </div>

          {byoSelected.map(ex => (
            <div key={ex.name} className="byo-config-card">
              <div className="byo-config-info">
                <span className="byo-config-name">{ex.name}</span>
                <span className="byo-config-meta">{BYO_EQUIPMENT_LABELS[ex.equipment] || ex.equipment}</span>
              </div>
              <div className="byo-config-stepper">
                <button
                  className="byo-stepper-btn"
                  onClick={() => setByoSetsConfig(prev => ({ ...prev, [ex.name]: Math.max(1, (prev[ex.name] || 3) - 1) }))}
                  disabled={(byoSetsConfig[ex.name] || 3) <= 1}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <span className="byo-stepper-value">{byoSetsConfig[ex.name] || 3}</span>
                <button
                  className="byo-stepper-btn"
                  onClick={() => setByoSetsConfig(prev => ({ ...prev, [ex.name]: Math.min(10, (prev[ex.name] || 3) + 1) }))}
                  disabled={(byoSetsConfig[ex.name] || 3) >= 10}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>
            </div>
          ))}
        </main>

        <div className="byo-pick-footer">
          <button className="wk-btn-primary byo-start-btn" onClick={() => setView('byo_save')}>
            Next
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <CoreBuddyNav active="workouts" />
      </div>
    );
  }

  // ==================== BUILD YOUR OWN — NAME & SAVE ====================
  if (view === 'byo_save') {
    return (
      <div className="wk-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => setView(byoMode === 'sets' ? 'byo_sets_config' : 'byo_pick')} aria-label="Go back">
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
        <main className="wk-main">
          <div className="wk-hub-heading">
            <h2>Save Workout</h2>
            <p>Give your workout a name</p>
          </div>

          <div className="byo-save-form">
            <input
              type="text"
              className="byo-save-input"
              value={byoSaveName}
              onChange={e => setByoSaveName(e.target.value)}
              placeholder={`Custom ${byoSelected.length} exercises`}
              maxLength={40}
              autoFocus
            />

            <div className="byo-save-category-section">
              <label className="byo-save-category-label">Category</label>
              <div className="byo-save-category-grid">
                {FOCUS_AREAS.map(fa => (
                  <button
                    key={fa.key}
                    className={`byo-save-category-btn${byoSaveCategory === fa.key ? ' byo-save-category-active' : ''}`}
                    onClick={() => setByoSaveCategory(fa.key)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d={fa.icon}/></svg>
                    <span>{fa.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="byo-save-summary">
              <div className="byo-save-summary-row">
                <span>Type</span>
                <span>{byoMode === 'hiit' ? 'HIIT' : 'Reps & Sets'}</span>
              </div>
              <div className="byo-save-summary-row">
                <span>Exercises</span>
                <span>{byoSelected.length}</span>
              </div>
              {byoMode === 'hiit' && (
                <div className="byo-save-summary-row">
                  <span>Level</span>
                  <span>{LEVELS.find(l => l.key === byoLevel)?.label || byoLevel}</span>
                </div>
              )}
            </div>

            <button
              className="wk-btn-primary byo-save-btn"
              onClick={() => byoSaveAsTemplate(byoSaveName)}
              disabled={savingWorkout}
            >
              {savingWorkout ? 'Saving...' : 'Save Workout'}
            </button>
          </div>
        </main>
        <CoreBuddyNav active="workouts" />
      </div>
    );
  }

  // ==================== BUILD YOUR OWN — REPS & SETS VIEW ====================
  if (view === 'byo_sets') {
    const totalSets = Object.values(byoSetsData).reduce((sum, sets) => sum + sets.filter(s => s.reps).length, 0);
    return (
      <div className="wk-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => { if (byoFromSaved) { setByoFromSaved(false); setView('byo_hub'); } else { setView('byo_pick'); } }} aria-label="Go back">
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
        <main className="wk-main byo-sets-main">
          <div className="wk-hub-heading">
            <h2>Log Your Workout</h2>
            <p>{byoSelected.length} exercises &middot; {totalSets} sets logged</p>
          </div>

          <div className="byo-unit-toggle">
            <button className={`byo-unit-btn${byoWeightUnit === 'kg' ? ' byo-unit-active' : ''}`} onClick={() => { setByoWeightUnit('kg'); localStorage.setItem('mcf_weight_unit', 'kg'); }}>kg</button>
            <button className={`byo-unit-btn${byoWeightUnit === 'lbs' ? ' byo-unit-active' : ''}`} onClick={() => { setByoWeightUnit('lbs'); localStorage.setItem('mcf_weight_unit', 'lbs'); }}>lbs</button>
          </div>

          <div className="byo-smart-tip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            <span>Add an extra rep each week. Breezing through your sets? Up the weight.</span>
          </div>

          {byoSelected.map(ex => {
            const sets = byoSetsData[ex.name] || [];
            const isWeighted = ex.type === 'weighted';
            return (
              <div key={ex.name} className="byo-set-card">
                <div className="byo-set-header">
                  <h3>{ex.name}</h3>
                  <span className="byo-set-type">{ex.equipment}</span>
                </div>
                <div className="byo-set-rows">
                  <div className="byo-set-row byo-set-row-header">
                    <span className="byo-set-num">Set</span>
                    <span className={`byo-set-weight${isWeighted ? '' : ' byo-set-invisible'}`}>{byoWeightUnit}</span>
                    <span className="byo-set-reps">{ex.type === 'timed' ? 'Secs' : 'Reps'}</span>
                    <span className="byo-set-del"></span>
                  </div>
                  {sets.map((set, idx) => (
                    <div key={idx} className="byo-set-row">
                      <span className="byo-set-num">{idx + 1}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        className={`byo-set-input byo-set-weight${isWeighted ? '' : ' byo-set-invisible'}`}
                        placeholder="0"
                        value={set.weight}
                        onChange={e => byoUpdateSet(ex.name, idx, 'weight', e.target.value)}
                        tabIndex={isWeighted ? 0 : -1}
                      />
                      <button
                        className="byo-set-input byo-set-reps byo-reps-tap"
                        onClick={() => setRepsPicker({ exercise: ex.name, idx, label: ex.type === 'timed' ? 'Secs' : 'Reps' })}
                      >
                        {set.reps || <span className="byo-reps-placeholder">0</span>}
                      </button>
                      <button className="byo-set-del-btn" onClick={() => byoRemoveSet(ex.name, idx)} aria-label="Remove set">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button className="byo-add-set-btn" onClick={() => byoAddSet(ex.name)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Set
                </button>
              </div>
            );
          })}
        </main>

        {repsPicker && (
          <RepsPicker
            value={parseInt(byoSetsData[repsPicker.exercise]?.[repsPicker.idx]?.reps) || 10}
            label={repsPicker.label}
            onSelect={val => byoUpdateSet(repsPicker.exercise, repsPicker.idx, 'reps', String(val))}
            onClose={() => setRepsPicker(null)}
          />
        )}

        <div className="byo-sets-footer">
          <button className="wk-btn-primary byo-complete-btn" onClick={byoCompleteSets}>
            Complete Workout
          </button>
        </div>

        {showByoFinish && (() => {
          const totalSetsCompleted = Object.values(byoSetsData).reduce((sum, sets) => sum + sets.filter(s => s.reps).length, 0);
          const exercisesLogged = byoSelected.filter(ex => (byoSetsData[ex.name] || []).some(s => s.reps)).length;
          return (
            <>
              <WorkoutCelebration
                title="Workout Complete!"
                stats={[
                  { value: exercisesLogged, label: 'Exercises' },
                  { value: totalSetsCompleted, label: 'Sets' },
                ]}
                hideShare={!isPremium}
                onShareJourney={clientData ? shareToJourney : null}
                userName={clientData?.name}
                onDismissStart={() => setView('byo_hub')}
                onDone={() => { setShowByoFinish(false); setByoSelected([]); setByoSetsData({}); }}
                onRate={lastWorkoutLogId ? (rating) => {
                  updateDoc(doc(db, 'workoutLogs', lastWorkoutLogId), { feelingRating: rating }).catch(() => {});
                } : undefined}
              />
              <button className="wk-complete-save-btn" onClick={() => setShowByoSaveModal(true)} disabled={savingWorkout}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                Save As Template
              </button>
              {showByoSaveModal && (
                <div className="wk-save-modal-backdrop" onClick={() => setShowByoSaveModal(false)} style={{ zIndex: 10001 }}>
                  <div className="wk-save-modal" onClick={e => e.stopPropagation()}>
                    <h3>Save Workout</h3>
                    <p>Give this workout a name</p>
                    <input
                      type="text"
                      className="wk-save-input"
                      value={byoSaveName}
                      onChange={e => setByoSaveName(e.target.value)}
                      placeholder={`Custom ${byoSelected.length} exercises`}
                      maxLength={40}
                      autoFocus
                    />
                    <div className="byo-save-category-section byo-save-category-modal">
                      <label className="byo-save-category-label">Category</label>
                      <div className="byo-save-category-grid">
                        {FOCUS_AREAS.map(fa => (
                          <button
                            key={fa.key}
                            className={`byo-save-category-btn${byoSaveCategory === fa.key ? ' byo-save-category-active' : ''}`}
                            onClick={() => setByoSaveCategory(fa.key)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d={fa.icon}/></svg>
                            <span>{fa.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="wk-save-modal-actions">
                      <button className="wk-btn-secondary" onClick={() => setShowByoSaveModal(false)}>Cancel</button>
                      <button className="wk-btn-primary" onClick={() => byoSaveAsTemplate(byoSaveName)} disabled={savingWorkout}>
                        {savingWorkout ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}
        {toastEl}
        <CoreBuddyNav active="workouts" />
      </div>
    );
  }

  // ==================== LANDING VIEW (DASHBOARD) ====================
  if (view === 'landing') {
    const isWeek = landingTab === 'week';
    const weekPct = WEEKLY_TARGET > 0 ? Math.min(100, Math.round((combinedWeeklyCount / WEEKLY_TARGET) * 100)) : 0;
    const fmtVol = (v) => v >= 1000000 ? `${(v / 1000000).toFixed(1).replace(/\.0$/, '')}M`
      : v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}k`
      : Math.round(v).toLocaleString();
    const weightUnit = localStorage.getItem('mcf_weight_unit') || 'kg';
    const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const todayDow = new Date().getDay();
    const todayIdx = todayDow === 0 ? 6 : todayDow - 1;
    const allTimeSessions = totalCount + byoTotalWorkouts;
    const hrsDisplay = totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : `${totalMinutes}m`;

    const getNudge = () => {
      const left = Math.max(0, WEEKLY_TARGET - combinedWeeklyCount);
      if (left === 0) return { text: `You've hit your ${WEEKLY_TARGET}-session target this week!`, done: true };
      if (streak > 0 && combinedWeeklyCount === 0) return { text: `Don't break your ${streak}-week streak \u2014 get a session in!`, done: false };
      return { text: `${left} more session${left !== 1 ? 's' : ''} to hit your weekly target`, done: false };
    };
    const nudge = getNudge();

    const getTimeAgo = (ts) => {
      if (!ts) return '';
      const ms = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
      const diff = Date.now() - ms;
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      if (days === 1) return 'Yesterday';
      return `${days}d ago`;
    };

    const getWorkoutLabel = (w) => {
      if (w._kind === 'byo') return 'BYO Sets';
      if (w._kind === 'activity') return w.activityType || 'Activity';
      return w.focus ? `${w.focus.charAt(0).toUpperCase() + w.focus.slice(1)} HIIT` : 'Randomiser';
    };

    const getWorkoutStat = (w) => {
      if (w._kind === 'byo') {
        let v = 0;
        (w.exercises || []).forEach(ex => (ex.sets || []).forEach(s => { v += (parseInt(s.reps) || 0) * (parseFloat(s.weight) || 0); }));
        return v > 0 ? `${v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : Math.round(v)} ${weightUnit}` : `${w.totalSets || 0} sets`;
      }
      if (w.duration) return `${w.duration}m`;
      return '';
    };

    // Ring constants for landing
    const LR = 34;
    const LC = 2 * Math.PI * LR;

    // Level breakdown for overall tab
    const lvlTotal = levelBreakdown.beginner + levelBreakdown.intermediate + levelBreakdown.advanced;
    const lvlData = [
      { key: 'beginner', label: 'Beg', count: levelBreakdown.beginner, color: isDark ? '#34d399' : '#10b981' },
      { key: 'intermediate', label: 'Int', count: levelBreakdown.intermediate, color: isDark ? '#fbbf24' : '#f59e0b' },
      { key: 'advanced', label: 'Adv', count: levelBreakdown.advanced, color: isDark ? '#f87171' : '#ef4444' },
    ];

    return (
      <div className="wk-page">
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
        <main className="wk-main wk-landing-main">
          {!statsLoaded ? (
            <div className="nut-hub-loading"><div className="cb-loading-spinner" /></div>
          ) : (
            <>
              {/* Greeting + streak */}
              <div className="wkl-top">
                <div className="wkl-greeting-row">
                  <div className="wkl-greeting">
                    <h2>Workouts</h2>
                    <p>{isWeek ? 'Your training this week' : 'Your all-time stats'}</p>
                  </div>
                  {streak > 0 && (
                    <div className="nhub-streak">
                      <div className="nhub-streak-flame">
                        <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                          <path d="M12 23c-3.866 0-7-3.134-7-7 0-3.527 3.397-6.67 5-9.338C11.602 9.33 19 12.473 19 16c0 3.866-3.134 7-7 7zm0-2c2.761 0 5-2.239 5-5 0-1.94-2.476-4.178-5-6.71C9.476 11.822 7 14.06 7 16c0 2.761 2.239 5 5 5z"/>
                        </svg>
                      </div>
                      <span className="nhub-streak-count">{streak}</span>
                      <span className="nhub-streak-label">wk{streak !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>

                {/* Tab toggle */}
                <div className="wkl-tabs">
                  <button className={`wkl-tab${isWeek ? ' wkl-tab--active' : ''}`} onClick={() => setLandingTab('week')}>This Week</button>
                  <button className={`wkl-tab${!isWeek ? ' wkl-tab--active' : ''}`} onClick={() => setLandingTab('overall')}>Overall</button>
                </div>

                {/* Stats rings — swap content per tab */}
                {isWeek ? (
                  <div className="wkl-stats-row">
                    <div className="wkl-stat">
                      <svg className="wkl-stat-svg" viewBox="0 0 80 80">
                        <circle className="wkl-stat-track" cx="40" cy="40" r={LR} />
                        <circle className="wkl-stat-fill" cx="40" cy="40" r={LR}
                          style={{ stroke: isDark ? '#2dd4bf' : '#14b8a6' }}
                          strokeDasharray={LC}
                          strokeDashoffset={LC - (Math.min(100, (weeklyVolume % 10000) / 100) / 100) * LC} />
                      </svg>
                      <div className="wkl-stat-center">
                        <span className="wkl-stat-value" style={{ color: isDark ? '#2dd4bf' : '#14b8a6' }}>{fmtVol(weeklyVolume)}</span>
                      </div>
                      <span className="wkl-stat-label">Volume</span>
                    </div>
                    <div className="wkl-stat wkl-stat--hero">
                      <svg className="wkl-stat-svg" viewBox="0 0 80 80">
                        <circle className="wkl-stat-track" cx="40" cy="40" r={LR} />
                        <circle className="wkl-stat-fill" cx="40" cy="40" r={LR}
                          style={{ stroke: 'var(--color-primary)' }}
                          strokeDasharray={LC}
                          strokeDashoffset={LC - (weekPct / 100) * LC} />
                      </svg>
                      <div className="wkl-stat-center">
                        <span className="wkl-stat-value" style={{ color: 'var(--color-primary)' }}>{combinedWeeklyCount}<span className="wkl-stat-of">/{WEEKLY_TARGET}</span></span>
                      </div>
                      <span className="wkl-stat-label">Sessions</span>
                    </div>
                    <div className="wkl-stat">
                      <svg className="wkl-stat-svg" viewBox="0 0 80 80">
                        <circle className="wkl-stat-track" cx="40" cy="40" r={LR} />
                        <circle className="wkl-stat-fill" cx="40" cy="40" r={LR}
                          style={{ stroke: isDark ? '#60a5fa' : '#3b82f6' }}
                          strokeDasharray={LC}
                          strokeDashoffset={LC - (Math.min(100, allTimeSessions / 100 * 100) / 100) * LC} />
                      </svg>
                      <div className="wkl-stat-center">
                        <span className="wkl-stat-value" style={{ color: isDark ? '#60a5fa' : '#3b82f6' }}>{allTimeSessions}</span>
                      </div>
                      <span className="wkl-stat-label">Total</span>
                    </div>
                  </div>
                ) : (
                  <div className="wkl-stats-row">
                    <div className="wkl-stat">
                      <svg className="wkl-stat-svg" viewBox="0 0 80 80">
                        <circle className="wkl-stat-track" cx="40" cy="40" r={LR} />
                        <circle className="wkl-stat-fill" cx="40" cy="40" r={LR}
                          style={{ stroke: isDark ? '#2dd4bf' : '#14b8a6' }}
                          strokeDasharray={LC}
                          strokeDashoffset={LC - (Math.min(100, (byoTotalVolume % 100000) / 1000) / 100) * LC} />
                      </svg>
                      <div className="wkl-stat-center">
                        <span className="wkl-stat-value" style={{ color: isDark ? '#2dd4bf' : '#14b8a6' }}>{fmtVol(byoTotalVolume)}</span>
                      </div>
                      <span className="wkl-stat-label">Volume</span>
                    </div>
                    <div className="wkl-stat wkl-stat--hero">
                      <svg className="wkl-stat-svg" viewBox="0 0 80 80">
                        <circle className="wkl-stat-track" cx="40" cy="40" r={LR} />
                        <circle className="wkl-stat-fill" cx="40" cy="40" r={LR}
                          style={{ stroke: 'var(--color-primary)' }}
                          strokeDasharray={LC}
                          strokeDashoffset={LC - (Math.min(100, allTimeSessions) / 100) * LC} />
                      </svg>
                      <div className="wkl-stat-center">
                        <span className="wkl-stat-value" style={{ color: 'var(--color-primary)' }}>{allTimeSessions}</span>
                      </div>
                      <span className="wkl-stat-label">Sessions</span>
                    </div>
                    <div className="wkl-stat">
                      <svg className="wkl-stat-svg" viewBox="0 0 80 80">
                        <circle className="wkl-stat-track" cx="40" cy="40" r={LR} />
                        <circle className="wkl-stat-fill" cx="40" cy="40" r={LR}
                          style={{ stroke: isDark ? '#a78bfa' : '#8b5cf6' }}
                          strokeDasharray={LC}
                          strokeDashoffset={LC - (Math.min(100, totalMinutes / 60) / 100) * LC} />
                      </svg>
                      <div className="wkl-stat-center">
                        <span className="wkl-stat-value wkl-stat-value--sm" style={{ color: isDark ? '#a78bfa' : '#8b5cf6' }}>{hrsDisplay}</span>
                      </div>
                      <span className="wkl-stat-label">Time</span>
                    </div>
                  </div>
                )}

                {/* Nudge (week) or level breakdown (overall) */}
                {isWeek ? (
                  <div className={`nhub-nudge ${nudge.done ? 'nhub-nudge--complete' : ''}`}>
                    {nudge.done ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                    )}
                    <span>{nudge.text}</span>
                  </div>
                ) : lvlTotal > 0 ? (
                  <div className="wkl-levels">
                    {lvlData.map(l => (
                      <div key={l.key} className="wkl-level-item">
                        <div className="wkl-level-bar-track">
                          <div className="wkl-level-bar-fill" style={{ width: `${(l.count / lvlTotal) * 100}%`, background: l.color }} />
                        </div>
                        <div className="wkl-level-meta">
                          <span className="wkl-level-label" style={{ color: l.color }}>{l.label}</span>
                          <span className="wkl-level-count">{l.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Weekly consistency bars (week tab) */}
              {isWeek && (
                <div className="nhub-week-section">
                  <div className="nhub-section-header">
                    <span className="nhub-section-title">This Week</span>
                  </div>
                  <div className="nhub-week-bars">
                    {DAY_LABELS.map((label, i) => (
                      <div key={i} className={`nhub-bar-col ${i === todayIdx ? 'nhub-bar-today' : ''}`}>
                        <div className="nhub-bar-track">
                          <div className={`nhub-bar-fill ${weekWorkoutDays[i] ? 'nhub-bar-good' : 'nhub-bar-empty'}`}
                            style={{ height: weekWorkoutDays[i] ? '100%' : '0%' }} />
                        </div>
                        <span className="nhub-bar-day">{i === todayIdx ? 'Today' : label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent workouts */}
              {allRecentWorkouts.length > 0 && (
                <div className="wkl-recent-section">
                  <div className="nhub-section-header">
                    <span className="nhub-section-title">Recent</span>
                  </div>
                  <div className="wkl-recent-list">
                    {(recentOpen ? allRecentWorkouts : allRecentWorkouts.slice(0, 3)).map((w, i) => (
                      <div key={i} className="wkl-recent-item">
                        <div className={`wkl-recent-icon wkl-recent-icon--${w._kind}`}>
                          {w._kind === 'byo' ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 7V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2M14 7V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2"/></svg>
                          ) : w._kind === 'activity' ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2.71 7 4.14 8.43 7.71 4.86 16.29 13.43 12.71 17 14.14 18.43 15.57 17 17 18.43 14.14 21.29l1.43 1.43 1.43-1.43 1.43 1.43 2.14-2.14 1.43 1.43L22 20.57z"/></svg>
                          )}
                        </div>
                        <div className="wkl-recent-info">
                          <span className="wkl-recent-name">{getWorkoutLabel(w)}</span>
                          <span className="wkl-recent-time">{getTimeAgo(w.completedAt)}</span>
                        </div>
                        <span className="wkl-recent-stat">{getWorkoutStat(w)}</span>
                      </div>
                    ))}
                  </div>
                  {allRecentWorkouts.length > 3 && (
                    <button className="wkl-recent-toggle" onClick={() => setRecentOpen(prev => !prev)}>
                      {recentOpen ? 'Show less' : `Show more (${allRecentWorkouts.length - 3})`}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={recentOpen ? 'wkl-recent-toggle-flip' : ''}><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                  )}
                </div>
              )}

              {/* Action cards */}
              <div className="nhub-actions-section">
                <button className="wk-landing-card" onClick={(e) => { e.currentTarget.blur(); setView('randomiser_hub'); }}>
                  <div className="wk-landing-card-icon wk-landing-card-icon--randomiser">
                    <img src="/Logo.webp" alt="Mind Core Fitness" width="50" height="50" className="wk-landing-logo" />
                  </div>
                  <div className="wk-landing-card-body">
                    <h3>Randomiser</h3>
                    <p>Generate HIIT workouts with random exercises</p>
                  </div>
                  <svg className="wk-landing-card-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </button>

                <button className="wk-landing-card" onClick={(e) => { e.currentTarget.blur(); setView('byo_hub'); }}>
                  <div className="wk-landing-card-icon wk-landing-card-icon--byo">
                    {clientData?.photoURL ? (
                      <img src={clientData.photoURL} alt="" className="wk-landing-byo-photo" />
                    ) : (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    )}
                  </div>
                  <div className="wk-landing-card-body">
                    <h3>Build Your Own</h3>
                    <p>Pick exercises and build custom workouts</p>
                  </div>
                  <svg className="wk-landing-card-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </button>

                <button className="wk-landing-card" onClick={(e) => { e.currentTarget.blur(); setView('challenges_hub'); }}>
                  <div className="wk-landing-card-icon wk-landing-card-icon--challenges">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c1 3 5 5 5 10a5 5 0 0 1-10 0c0-5 4-7 5-10z"/><path d="M12 22v-4"/><path d="M10 18h4"/></svg>
                  </div>
                  <div className="wk-landing-card-body">
                    <h3>Challenges</h3>
                    <p>Work your way through progressive HIIT challenges</p>
                  </div>
                  <svg className="wk-landing-card-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>
            </>
          )}
        </main>
        <CoreBuddyNav active="workouts" />
        {toastEl}
        <BadgeCelebration badge={badgeCelebration} onDismiss={() => setBadgeCelebration(null)} />
      </div>
    );
  }

  // ==================== RANDOMISER HUB VIEW ====================
  if (view === 'randomiser_hub') {
    const lastSettings = JSON.parse(localStorage.getItem('mcf_last_randomiser') || 'null') || { equipment: ['bodyweight'], focus: 'core', level: 'intermediate', duration: 15 };
    const lastFocusLabel = FOCUS_AREAS.find(f => f.key === lastSettings.focus)?.label || lastSettings.focus;
    const lastLevelLabel = LEVELS.find(l => l.key === lastSettings.level)?.label || lastSettings.level;

    return (
      <div className="wk-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => setView('landing')} aria-label="Go back">
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
        <main className="wk-main">
          {/* Stat Rings */}
          <div className="wk-stats-row">
            {[
              { label: 'Total', value: `${totalCount}`, pct: totalCount > 0 ? Math.min(Math.round((totalCount / 100) * 100), 100) : 0, color: '#14b8a6', size: 'normal' },
              { label: 'This Week', value: `${weeklyCount}/${WEEKLY_TARGET}`, pct: Math.round((Math.min(weeklyCount, WEEKLY_TARGET) / WEEKLY_TARGET) * 100), color: 'var(--color-primary)', size: 'large' },
              { label: 'Wk Streak', value: `${streak}`, pct: streak > 0 ? Math.min(Math.round((streak / 12) * 100), 100) : 0, color: '#38B6FF', size: 'normal' },
            ].map((ring) => {
              const r = 38;
              const circ = 2 * Math.PI * r;
              const offset = circ - (ring.pct / 100) * circ;
              return (
                <div key={ring.label} className={`wk-stat-item${ring.size === 'large' ? ' wk-stat-large' : ''}`}>
                  <div className="wk-stat-ring">
                    <svg viewBox="0 0 100 100">
                      <circle className="wk-stat-track" cx="50" cy="50" r={r} />
                      <circle className="wk-stat-fill" cx="50" cy="50" r={r}
                        style={{ stroke: ring.color }}
                        strokeDasharray={circ}
                        strokeDashoffset={offset} />
                    </svg>
                    <span className="wk-stat-value" style={{ color: ring.color }}>{ring.value}</span>
                  </div>
                  <span className="wk-stat-label">{ring.label}</span>
                </div>
              );
            })}
          </div>

          <div className="wk-hub-heading">
            <h2>Randomiser</h2>
            <p>Generate, save &amp; replay workouts</p>
          </div>

          {/* ===== Launch Zone ===== */}
          <div className="wk-hub-launch-zone">
            {/* Action cards – styled like dashboard feature cards */}
            <button className="wk-hub-card wk-hub-new-glow" onClick={() => setView('setup')}>
              <div className="wk-hub-card-icon wk-hub-card-icon--primary">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </div>
              <div className="wk-hub-card-body">
                <h3>New Workout</h3>
                <p>Choose focus, level &amp; duration</p>
              </div>
              <svg className="wk-hub-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>

            <button className="wk-hub-card" onClick={quickStart} disabled={freeRandomiserLimitReached}>
              <div className="wk-hub-card-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <div className="wk-hub-card-body">
                <h3>Quick Start</h3>
                <p>{lastFocusLabel} &middot; {lastSettings.level === 'custom' ? `${fmtSec(lastSettings.customWork || 30)}/${fmtSec(lastSettings.customRest || 30)}` : lastLevelLabel} &middot; {lastSettings.duration}min</p>
              </div>
              <svg className="wk-hub-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>

            {smartSuggestion && (
              <button className="wk-hub-card" onClick={() => {
                setFocusArea(smartSuggestion.focus);
                setView('setup');
              }}>
                <div className="wk-hub-card-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                </div>
                <div className="wk-hub-card-body">
                  <h3>{smartSuggestion.message}</h3>
                  <p>Tap to set up</p>
                </div>
                <svg className="wk-hub-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            )}

            <div className="wk-hub-tip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
              {HUB_TIPS[Math.floor(Date.now() / 86400000) % HUB_TIPS.length]}
            </div>
          </div>

        </main>

        {/* FAB Button — grid style matching Dashboard */}
        <button
          className={`wk-fab${fabOpen ? ' wk-fab-open wk-fab-hidden' : ''}`}
          onClick={() => { setFabOpen(prev => !prev); setFabSavedOverlay(null); }}
          aria-label={fabOpen ? 'Close menu' : 'Saved Workouts'}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>

        {/* FAB Bottom Sheet — Grid of saved workout categories */}
        {fabOpen && !fabSavedOverlay && (
          <div className="cb-fab-overlay" onClick={() => setFabOpen(false)}>
            <div className="cb-fab-sheet" onClick={e => e.stopPropagation()}>
              <div className="cb-fab-header">
                <h3>Saved Workouts</h3>
                <button className="cb-fab-close" onClick={() => setFabOpen(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              {!savedWorkoutsLoaded ? (
                <div className="wk-hub-empty"><div className="wk-loading-spinner" /></div>
              ) : savedWorkouts.filter(sw => sw.type !== 'byo_hiit' && sw.type !== 'byo_sets').length === 0 ? (
                <div className="wk-hub-empty wk-hub-empty-enhanced">
                  <svg className="wk-hub-empty-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                  <p><strong>No saved workouts yet</strong></p>
                  <p className="wk-hub-empty-sub">Generate a workout and hit save to stash it here for quick replay.</p>
                </div>
              ) : (
                <div className="cb-fab-grid">
                  {FOCUS_AREAS.map((fa, i) => {
                    const count = savedWorkouts.filter(sw => sw.focus === fa.key && sw.type !== 'byo_hiit' && sw.type !== 'byo_sets').length;
                    if (count === 0) return null;
                    return (
                      <button key={fa.key} className="cb-fab-item" style={{ animationDelay: `${i * 0.03}s` }} onClick={() => setFabSavedOverlay(fa.key)}>
                        <span className="cb-fab-item-icon">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d={fa.icon}/></svg>
                        </span>
                        <span className="cb-fab-item-label">{fa.label}</span>
                        <span className="wk-fab-count">{count}</span>
                      </button>
                    );
                  })}
                  {/* Recent tile */}
                  {recentWorkouts.length > 0 && (
                    <button className="cb-fab-item" onClick={() => setFabSavedOverlay('recent')}>
                      <span className="cb-fab-item-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </span>
                      <span className="cb-fab-item-label">Recent</span>
                      <span className="wk-fab-count">{recentWorkouts.length}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* FAB Saved Overlay — show workouts for selected category */}
        {fabOpen && fabSavedOverlay && fabSavedOverlay !== 'recent' && (() => {
          const fa = FOCUS_AREAS.find(f => f.key === fabSavedOverlay);
          const catWorkouts = savedWorkouts.filter(sw => sw.focus === fabSavedOverlay && sw.type !== 'byo_hiit' && sw.type !== 'byo_sets');
          return (
            <div className="wk-saved-overlay-backdrop" onClick={() => setFabSavedOverlay(null)}>
              <div className="wk-saved-overlay-card" onClick={e => e.stopPropagation()}>
                <div className="wk-saved-overlay-header">
                  <button className="wk-saved-overlay-back" onClick={() => setFabSavedOverlay(null)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  </button>
                  <h3>{fa?.label || 'Saved'}</h3>
                  <button className="cb-fab-close" onClick={() => { setFabSavedOverlay(null); setFabOpen(false); }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div className="wk-saved-overlay-list">
                  {catWorkouts.map((sw, i) => {
                    const eqLabels = (sw.equipment || []).map(e => EQUIPMENT.find(eq => eq.key === e)?.label || e).join(', ');
                    const levelLbl = LEVELS.find(l => l.key === sw.level)?.label || sw.level;
                    return (
                      <div key={sw.id} className="wk-saved-overlay-item" style={{ animationDelay: `${i * 0.05}s` }}>
                        <button className="wk-saved-overlay-main" onClick={() => { replaySavedWorkout(sw); setFabOpen(false); setFabSavedOverlay(null); }}>
                          <div className="wk-saved-overlay-info">
                            <span className="wk-saved-overlay-name">{sw.name}</span>
                            <span className="wk-saved-overlay-meta">{levelLbl} &middot; {sw.duration}min &middot; {(sw.exercises || []).length} ex</span>
                            {eqLabels && <span className="wk-saved-overlay-equip">{eqLabels}</span>}
                          </div>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </button>
                        <button className="wk-saved-overlay-delete" onClick={() => deleteSavedWorkout(sw.id)} aria-label="Remove">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* FAB Recent Overlay */}
        {fabOpen && fabSavedOverlay === 'recent' && (
          <div className="wk-saved-overlay-backdrop" onClick={() => setFabSavedOverlay(null)}>
            <div className="wk-saved-overlay-card" onClick={e => e.stopPropagation()}>
              <div className="wk-saved-overlay-header">
                <button className="wk-saved-overlay-back" onClick={() => setFabSavedOverlay(null)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <h3>Recent</h3>
                <button className="cb-fab-close" onClick={() => { setFabSavedOverlay(null); setFabOpen(false); }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div className="wk-saved-overlay-list">
                {recentWorkouts.map((rw, i) => {
                  const focusLbl = FOCUS_AREAS.find(f => f.key === rw.focus)?.label || rw.focus || '—';
                  const levelLbl = LEVELS.find(l => l.key === rw.level)?.label || rw.level || '—';
                  const ts = rw.completedAt?.toDate ? rw.completedAt.toDate() : rw.completedAt ? new Date(rw.completedAt) : null;
                  const ago = ts ? (() => {
                    const diff = Math.floor((Date.now() - ts.getTime()) / 1000);
                    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
                    return `${Math.floor(diff / 86400)}d ago`;
                  })() : '';
                  return (
                    <div key={i} className="wk-saved-overlay-item" style={{ animationDelay: `${i * 0.05}s` }}>
                      <button className="wk-saved-overlay-main" onClick={() => {
                        setFocusArea(rw.focus || 'core');
                        setLevel(rw.level || 'intermediate');
                        setDuration(rw.duration || 15);
                        if (rw.equipment) setSelectedEquipment(rw.equipment);
                        setFabOpen(false);
                        setFabSavedOverlay(null);
                        setView('setup');
                      }}>
                        <div className="wk-saved-overlay-info">
                          <span className="wk-saved-overlay-name">{focusLbl}</span>
                          <span className="wk-saved-overlay-meta">{levelLbl} &middot; {rw.duration || '?'}min &middot; {rw.exerciseCount || '?'} ex</span>
                        </div>
                        <span className="wk-saved-overlay-ago">{ago}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <CoreBuddyNav active="workouts" />
        {toastEl}
        <BadgeCelebration badge={badgeCelebration} onDismiss={() => setBadgeCelebration(null)} />
      </div>
    );
  }

  // ==================== SETUP VIEW ====================
  if (view === 'setup') {
    const focusLabel = FOCUS_AREAS.find(f => f.key === focusArea)?.label || focusArea;
    const levelLabel = LEVELS.find(l => l.key === level)?.label || level;
    return (
      <div className="wk-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => setView('randomiser_hub')} aria-label="Go back">
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
        <main className="wk-main wk-setup-main">

          <div className="wk-setup-flow">
            {/* Focus Area */}
            <div className="wk-setup-section">
              <h2>Focus Area</h2>
              <div className="wk-focus-grid">
                {FOCUS_AREAS.map(f => (
                  <button key={f.key}
                    className={`wk-equip-btn${focusArea === f.key ? ' active' : ''}${f.key === 'mix' ? ' wk-mix-btn' : ''}`}
                    onClick={() => { playBeep(); setFocusArea(f.key); }}>
                    <svg className="wk-equip-icon" viewBox="0 0 24 24" fill="currentColor"><path d={f.icon} /></svg>
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Level */}
            <div className="wk-setup-section">
              <h2>Level</h2>
              <div className="wk-level-cards">
                {LEVELS.map(l => (
                  <button key={l.key} className={`wk-level-card${level === l.key ? ' active' : ''}`} onClick={() => { playBeep(); setLevel(l.key); }}>
                    <span className="wk-level-name">{l.label}</span>
                    <span className="wk-level-desc">{l.key === 'custom' ? `${fmtSec(customWork)} work / ${fmtSec(customRest)} rest` : l.desc}</span>
                  </button>
                ))}
              </div>
              {level === 'custom' && (
                <div className="wk-custom-intervals">
                  <div className="wk-custom-row">
                    <label className="wk-custom-label">Work</label>
                    <input type="range" className="wk-custom-slider" min={10} max={120} step={5} value={customWork} onChange={e => setCustomWork(Number(e.target.value))} />
                    <span className="wk-custom-value">{fmtSec(customWork)}</span>
                  </div>
                  <div className="wk-custom-row">
                    <label className="wk-custom-label">Rest</label>
                    <input type="range" className="wk-custom-slider" min={5} max={120} step={5} value={customRest} onChange={e => setCustomRest(Number(e.target.value))} />
                    <span className="wk-custom-value">{fmtSec(customRest)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Time */}
            <div className="wk-setup-section">
              <h2>Time</h2>
              <div className="wk-time-options">
                {TIME_OPTIONS.map(t => {
                  const locked = !availableTimeOptions.includes(t);
                  return (
                    <button key={t} className={`wk-time-btn${duration === t ? ' active' : ''}${locked ? ' locked' : ''}`} onClick={() => { if (!locked) { playBeep(); setDuration(t); } }} disabled={locked}>
                      <span className="wk-time-num">{t}</span>
                      <span className="wk-time-unit">{locked ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> : 'min'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Equipment */}
            <div className="wk-setup-section">
              <h2>Equipment</h2>
              <div className="wk-equip-options">
                {EQUIPMENT.map(eq => {
                  const isSelected = selectedEquipment.includes(eq.key);
                  return (
                    <button key={eq.key}
                      className={`wk-equip-btn${isSelected ? ' active' : ''}`}
                      onClick={() => {
                        if (isSelected && selectedEquipment.length === 1) return;
                        playBeep();
                        setSelectedEquipment(prev => {
                          if (isSelected && prev.length === 1) return prev;
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

            {/* Summary */}
            <div className="wk-setup-summary">
              <span>{focusLabel} &middot; {levelLabel} &middot; {duration} min</span>
            </div>
          </div>
        </main>

        {/* Sticky GO button */}
        <div className="wk-go-sticky">
          {freeRandomiserLimitReached && (
            <p className="wk-free-limit-msg">You've used your {FREE_RANDOMISER_WEEKLY_LIMIT} free workouts this week. Upgrade for unlimited access.</p>
          )}
          <button className="wk-randomise-btn" onClick={generateWorkout} disabled={loadingExercises || freeRandomiserLimitReached}>
            {loadingExercises ? 'Loading exercises...' : freeRandomiserLimitReached ? 'Limit Reached' : 'Randomise Workout'}
          </button>
        </div>
        {toastEl}
      </div>
    );
  }

  // ==================== SPINNING VIEW ====================
  if (view === 'spinning') {
    return (
      <div className="wk-page wk-page-center">
        <div className="wk-spin-container">
          <div className="wk-spin-ring">
            <svg className="wk-spin-svg" viewBox="0 0 200 200">
              {TICKS_78_94.map((t, i) => (
                <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                  className="wk-spin-tick"
                  strokeWidth={t.thick ? '3.5' : '2'}
                  style={{ animationDelay: `${i * 0.03}s` }} />
              ))}
            </svg>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="wk-spin-logo" width="50" height="50" />
          </div>
          <p className="wk-spin-text">Generating workout...</p>
        </div>
        {toastEl}
      </div>
    );
  }

  // ==================== PREVIEW VIEW (with optional spinner overlay while thumbs load) ====================
  if (view === 'preview_loading' || view === 'preview') {
    const isLoading = view === 'preview_loading';
    const previewBase = LEVELS.find(l => l.key === level);
    const previewConfig = level === 'custom' ? { ...previewBase, work: customWork, rest: customRest } : previewBase;
    const totalTime = workout.length * rounds * (previewConfig.work + previewConfig.rest);
    return (
      <>
        {/* Spinner overlay — covers the preview while thumbs load */}
        {isLoading && (
          <div className="wk-page wk-page-center" style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--bg-body)' }}>
            <div className="wk-spin-container">
              <div className="wk-spin-ring">
                <svg className="wk-spin-svg" viewBox="0 0 200 200">
                  {TICKS_78_94.map((t, i) => (
                    <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                      className="wk-spin-tick"
                      strokeWidth={t.thick ? '3.5' : '2'}
                      style={{ animationDelay: `${i * 0.03}s` }} />
                  ))}
                </svg>
                <img src="/Logo.webp" alt="Mind Core Fitness" className="wk-spin-logo" width="50" height="50" />
              </div>
              <p className="wk-spin-text">Generating workout...</p>
            </div>
          </div>
        )}
        {/* Actual preview page — mounts immediately so thumbs start loading */}
        <div className="wk-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => setView('setup')} aria-label="Go back">
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
              <span className="wk-stat-val">{previewConfig.work}/{previewConfig.rest}</span>
              <span className="wk-stat-label">Work/Rest</span>
            </div>
          </div>

          <div className="wk-preview-list">
            {workout.map((ex, i) => (
              <div key={i} className="wk-preview-item" style={{ animationDelay: `${i * 0.06}s` }} onClick={() => !isLoading && setPreviewEx(ex)}>
                <span className="wk-preview-num">{i + 1}</span>
                <div className="wk-preview-thumb">
                  <StaticThumb src={ex.videoUrl} isGif={ex.isGif} onReady={handleThumbReady} eager />
                </div>
                <span className="wk-preview-name">{ex.name}</span>
                <svg className="wk-preview-play" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
            ))}
          </div>

          {/* Quick-preview modal */}
          {previewEx && (
            <div className="wk-preview-modal-backdrop" onClick={() => setPreviewEx(null)}>
              <div className="wk-preview-modal" onClick={e => e.stopPropagation()}>
                <button className="wk-preview-modal-close" onClick={() => setPreviewEx(null)} aria-label="Close preview">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <div className="wk-preview-modal-video">
                  {previewEx.isGif ? (
                    <img src={previewEx.videoUrl} alt={previewEx.name} />
                  ) : (
                    <video src={previewEx.videoUrl} autoPlay loop muted playsInline />
                  )}
                </div>
                <h3 className="wk-preview-modal-title">{previewEx.name}</h3>
              </div>
            </div>
          )}

          <div className="wk-preview-actions">
            <div className="wk-preview-actions-row">
              <button className="wk-btn-secondary wk-btn-half" onClick={() => generateWorkout()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Reshuffle
              </button>
              {isPremium && (
              <button className="wk-btn-secondary wk-btn-half" onClick={() => setShowSaveModal(true)} disabled={savingWorkout}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                Save
              </button>
              )}
            </div>
            <button className="wk-btn-primary wk-btn-full" onClick={startWorkout}>
              Start Workout
            </button>
          </div>

          {/* Save workout modal */}
          {showSaveModal && (
            <div className="wk-save-modal-backdrop" onClick={() => setShowSaveModal(false)}>
              <div className="wk-save-modal" onClick={e => e.stopPropagation()}>
                <h3>Save Workout</h3>
                <p>Give this workout a name (or leave blank for auto-name)</p>
                <input
                  type="text"
                  className="wk-save-input"
                  value={saveWorkoutName}
                  onChange={e => setSaveWorkoutName(e.target.value)}
                  placeholder={`${FOCUS_AREAS.find(f => f.key === focusArea)?.label || focusArea} ${duration}min`}
                  maxLength={40}
                  autoFocus
                />
                <div className="wk-save-modal-actions">
                  <button className="wk-btn-secondary" onClick={() => setShowSaveModal(false)}>Cancel</button>
                  <button className="wk-btn-primary" onClick={() => saveWorkoutToFavourites(saveWorkoutName)} disabled={savingWorkout}>
                    {savingWorkout ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
        {toastEl}
      </>
    );
  }

  // ==================== COUNTDOWN VIEW (3-2-1) ====================
  if (view === 'countdown') {
    return (
      <div className="wk-page wk-page-center wk-page-dark">
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
      <div className="wk-page wk-page-workout">
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
              {/* Dimmed preview of next exercise behind overlay */}
              {nextEx && (
                nextEx.isGif
                  ? <img className="wk-rest-preview" src={nextEx.videoUrl} alt={nextEx.name} />
                  : <video className="wk-rest-preview" src={`${nextEx.videoUrl}#t=0.5`} muted playsInline preload="metadata" />
              )}
              <div className="wk-rest-overlay" />
              <div className="wk-rest-text">
                <span className="wk-rest-label">REST</span>
                {nextEx && (
                  <div className="wk-rest-next">
                    <span className="wk-rest-next-tag">UP NEXT</span>
                    <span className="wk-rest-next-name">{nextEx.name}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Back button */}
        <div className="wk-back-row">
          <button className="wk-back-btn" onClick={() => { if (confirm('Leave workout?')) setView('randomiser_hub'); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            Back
          </button>
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
          <button className="wk-ctrl-btn wk-ctrl-stop" onClick={() => { if (confirm('End workout early?')) setView('randomiser_hub'); }}>
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

        {/* Hold-to-finish overlay */}
        {showFinish && (() => {
          const config = LEVELS.find(l => l.key === level);
          const totalTime = workout.length * rounds * (config.work + config.rest);
          return (
            <>
            <WorkoutCelebration
              title="Workout Complete!"
              stats={[
                { value: Math.ceil(totalTime / 60), label: 'Minutes' },
                { value: workout.length * rounds, label: 'Intervals' },
                { value: rounds, label: 'Rounds' },
              ]}
              hideShare={!isPremium}
              onShareJourney={clientData ? shareToJourney : null}
              userName={clientData?.name}
              onDismissStart={() => setView('randomiser_hub')}
              onDone={() => setShowFinish(false)}
              onRate={lastWorkoutLogId ? (rating) => {
                updateDoc(doc(db, 'workoutLogs', lastWorkoutLogId), { feelingRating: rating }).catch(() => {});
              } : undefined}
            />
            {/* Save workout prompt on completion */}
            <button className="wk-complete-save-btn" onClick={() => setShowSaveModal(true)} disabled={savingWorkout}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                Save This Workout
              </button>
            {showSaveModal && (
              <div className="wk-save-modal-backdrop" onClick={() => setShowSaveModal(false)} style={{ zIndex: 10001 }}>
                <div className="wk-save-modal" onClick={e => e.stopPropagation()}>
                  <h3>Save Workout</h3>
                  <p>Give this workout a name (or leave blank for auto-name)</p>
                  <input
                    type="text"
                    className="wk-save-input"
                    value={saveWorkoutName}
                    onChange={e => setSaveWorkoutName(e.target.value)}
                    placeholder={`${FOCUS_AREAS.find(f => f.key === focusArea)?.label || focusArea} ${duration}min`}
                    maxLength={40}
                    autoFocus
                  />
                  <div className="wk-save-modal-actions">
                    <button className="wk-btn-secondary" onClick={() => setShowSaveModal(false)}>Cancel</button>
                    <button className="wk-btn-primary" onClick={() => saveWorkoutToFavourites(saveWorkoutName)} disabled={savingWorkout}>
                      {savingWorkout ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            </>
          );
        })()}
      </div>
    );
  }


  return <BadgeCelebration badge={badgeCelebration} onDismiss={() => setBadgeCelebration(null)} />;
}
