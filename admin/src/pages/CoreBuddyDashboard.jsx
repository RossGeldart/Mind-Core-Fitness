import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import {
  collection, query, where, getDocs, doc, getDoc, updateDoc,
  addDoc, serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import useFirestoreListener from '../hooks/useFirestoreListener';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTier } from '../contexts/TierContext';
import './CoreBuddyDashboard.css';
import CoreBuddyNav from '../components/CoreBuddyNav';
import ProfileHabitCarousel from '../components/ProfileHabitCarousel';
import MetricsHeroCard from '../components/MetricsHeroCard';

import { TICKS_85_96 } from '../utils/ringTicks';
import SpotlightTour from '../components/SpotlightTour';
import BADGE_DEFS from '../utils/badgeConfig';
import ActivityLogger from '../components/ActivityLogger';

const TICK_COUNT = 60;
const DEFAULT_WEEKLY_TARGET = 3;
const DEFAULT_HABIT_COUNT = 5;
const DEFAULT_HABIT_KEYS = ['trained', 'protein', 'steps', 'sleep', 'water'];

function formatDate(date) {
  return date.toISOString().split('T')[0];
}


const TAGLINES = [
  { text: 'You have 24 hours a day...', bold: 'make it count' },
  { text: 'Discipline beats motivation...', bold: 'every single time' },
  { text: "Rest when you're done,", bold: "not when you're tired" },
  { text: 'Small daily gains...', bold: 'create massive results' },
  { text: "Your body keeps score,", bold: 'train it well' },
  { text: 'Consistency over intensity...', bold: 'always wins' },
  { text: 'The only bad workout...', bold: 'is the one you skipped' },
];

// Variable coach messages — multiple per time slot for dopamine novelty
const COACH_MESSAGES = {
  morning: [
    { main: 'Rise and grind,', sub: "let's get after it!" },
    { main: 'New day, new gains,', sub: "let's build something!" },
    { main: 'The early bird gets the gains,', sub: "let's go!" },
    { main: 'Winners wake up ready,', sub: "you showed up!" },
  ],
  afternoon: [
    { main: 'Oye', sub: 'crack on and make it count!' },
    { main: 'Halfway through the day,', sub: "don't ease off now!" },
    { main: 'Afternoon push,', sub: 'this is where champions are made!' },
    { main: 'Still time to make today count,', sub: "let's go!" },
  ],
  evening: [
    { main: 'Evening session?', sub: "Let's finish strong!" },
    { main: 'End the day on a high,', sub: 'you earned it!' },
    { main: 'Night owls lift heavier,', sub: "prove it!" },
    { main: 'One more session today?', sub: "Close it out!" },
  ],
  night: [
    { main: 'Burning the midnight oil,', sub: 'Respect the hustle!' },
    { main: 'Late night dedication,', sub: 'that\'s what sets you apart!' },
    { main: 'While they sleep,', sub: 'you grind!' },
  ],
  allDone: [
    { main: 'Smashed it today,', sub: 'Rest up and go again tomorrow.' },
    { main: 'All tasks crushed,', sub: 'Absolute machine!' },
    { main: 'Nothing left undone,', sub: 'That\'s elite-level discipline.' },
  ],
};

function timeAgo(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date(date);
  const diff = Math.floor((new Date() - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CoreBuddyDashboard() {
  const { currentUser, isClient, clientData, logout, updateClientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { isPremium, FREE_HABIT_LIMIT } = useTier();
  const FREE_ACTIVITY_WEEKLY_LIMIT = 2;
  const navigate = useNavigate();
  const [fabOpen, setFabOpen] = useState(false);
  const [realHabitCount, setRealHabitCount] = useState(isPremium ? DEFAULT_HABIT_COUNT : FREE_HABIT_LIMIT);
  const habitCount = realHabitCount;

  // 24hr countdown state
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [ticksElapsed, setTicksElapsed] = useState(0);

  // Ring stats
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [habitWeekPct, setHabitWeekPct] = useState(0);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [nutritionTotals, setNutritionTotals] = useState({ protein: 0, calories: 0 });
  const [nutritionTargetData, setNutritionTargetData] = useState(null);
  const [todayHabitsCount, setTodayHabitsCount] = useState(0);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState(0);
  const [weeklyWorkoutTarget, setWeeklyWorkoutTarget] = useState(DEFAULT_WEEKLY_TARGET);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  const [showTargetHint, setShowTargetHint] = useState(false);
  const [leaderboardTop3, setLeaderboardTop3] = useState([]);

  // Activity logger
  const [showActivityLogger, setShowActivityLogger] = useState(false);
  const [weeklyActivities, setWeeklyActivities] = useState(0);
  const [totalActivities, setTotalActivities] = useState(0);

  // Profile photo
  const [photoURL, setPhotoURL] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  // Streak data
  const [streakWeeks, setStreakWeeks] = useState(0);

  // Body metrics state

  // Rotating tagline
  const [taglineIdx, setTaglineIdx] = useState(0);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);


  // Notifications
  const [notifications, setNotificationsRaw] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);


  // Recovery / Check-in state

  // Weekly target celebration
  const [showWeeklyCelebration, setShowWeeklyCelebration] = useState(false);
  const weeklyCelebrationShownRef = useRef(false);

  // Leaderboard rank movement tracking
  const [prevLeaderboardRank, setPrevLeaderboardRank] = useState(null);

  // Guided tour — only shown once for new users
  const [showTour, setShowTour] = useState(false);
  const tourDismissedRef = useRef(false);

  // Build tour steps based on tier (premium users see more steps)
  const tourSteps = (() => {
    const base = [
      {
        selector: '.cb-ring-container',
        title: 'Your 24-Hour Countdown',
        body: 'Every day resets at midnight. This ring tracks the hours you have left — tap your photo to add a profile picture.',
      },
      {
        selector: '.cb-stats-row',
        title: 'Your Stats at a Glance',
        body: 'Streak, weekly workouts, habits, and activities — all tracked in real time. Tap the workout ring to set your weekly target.',
      },
      {
        selector: '.cb-card-nudge',
        title: 'Smart Suggestions',
        body: "We'll tell you what needs your attention next — your next session, unfinished habits, or a meal to log.",
      },
      {
        selector: '.cb-card-workouts',
        title: 'Workouts',
        body: 'Pick your focus, level and duration. Save your favourites and replay them anytime.',
      },
      {
        selector: '.cb-card-activity',
        title: 'Log Activity',
        body: 'Track walks, runs, cycles, swims — anything beyond your workouts counts here.',
      },
    ];

    if (isPremium) {
      base.push(
        {
          selector: '.cb-nutrition-wrap',
          title: "Today's Nutrition",
          body: 'Track your protein and calories. Tap to log meals and scan barcodes.',
        },
        {
          selector: '.cb-fab',
          title: 'Quick Access Menu',
          body: 'Your hub for habits, leaderboard, badges, challenges, buddies and body metrics — all in one tap.',
        },
        {
          selector: '.block-bottom-nav .block-nav-tab:nth-child(4)',
          title: 'Community Feed',
          body: 'Share photos, updates and milestones with your buddies. Like, comment and @mention each other.',
        },
      );
    }

    if (!isPremium) {
      base.push({
        selector: '.cb-upgrade-cta',
        title: 'Unlock More',
        body: 'Upgrade for nutrition tracking, buddies, social feed, challenges, badges and the full experience.',
      });
    }

    base.push(
      {
        selector: '.header-left-group',
        title: 'Notifications & Settings',
        body: 'Tap the bell for notifications from buddies and coaches. Use settings to customise the look of the app and enable push notifications.',
      },
      {
        selector: '.block-bottom-nav',
        title: "You're All Set!",
        body: 'Use the nav bar to jump between your profile, workouts, nutrition, and buddies. Time to get after it!',
        cta: "Let's Go!",
      },
    );

    return base;
  })();

  // Auth guard
  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate('/');
    }
  }, [authLoading, currentUser, navigate]);

  // Onboarding guard — only for self-signup users who haven't completed it
  useEffect(() => {
    if (!authLoading && clientData && clientData.signupSource === 'self_signup' && !clientData.onboardingComplete) {
      navigate('/onboarding');
    }
  }, [authLoading, clientData, navigate]);


  // Start guided tour once for new users (after stats have loaded so all
  // target elements are in the DOM)
  useEffect(() => {
    let tourDone = clientData?.tourComplete || tourDismissedRef.current;
    if (!tourDone && clientData?.id) {
      try { tourDone = !!localStorage.getItem(`tourDone_${clientData.id}`); } catch {}
    }
    if (statsLoaded && clientData && !tourDone) {
      const t = setTimeout(() => setShowTour(true), 600);
      return () => clearTimeout(t);
    }
  }, [statsLoaded, clientData]);

  // Show workout ring hint pulse once for users who haven't set a target
  useEffect(() => {
    if (!statsLoaded || !clientData?.id) return;
    try {
      if (localStorage.getItem(`targetHint_${clientData.id}`)) return;
    } catch {}
    // Only hint if they haven't explicitly set a target yet
    if (!clientData?.weeklyWorkoutTarget) {
      const t = setTimeout(() => setShowTargetHint(true), 1500);
      return () => clearTimeout(t);
    }
  }, [statsLoaded, clientData]);

  // Hydrate from session cache so returning visits render instantly
  useEffect(() => {
    if (!clientData) return;
    try {
      const cached = sessionStorage.getItem(`cbDash_${clientData.id}`);
      if (cached) {
        const c = JSON.parse(cached);
        setTotalWorkouts(c.totalWorkouts ?? 0);
        setHabitWeekPct(c.habitWeekPct ?? 0);
        setNutritionTotals(c.nutritionTotals ?? { protein: 0, calories: 0 });
        setNutritionTargetData(c.nutritionTargetData ?? null);
        setTodayHabitsCount(c.todayHabitsCount ?? 0);
        if (c.realHabitCount) setRealHabitCount(c.realHabitCount);
        setWeeklyWorkouts(c.weeklyWorkouts ?? 0);
        setWeeklyWorkoutTarget(c.weeklyWorkoutTarget ?? DEFAULT_WEEKLY_TARGET);
        setLeaderboardTop3(c.leaderboardTop3 ?? []);
        setStreakWeeks(c.streakWeeks ?? 0);
        setWeeklyActivities(c.weeklyActivities ?? 0);
        setTotalActivities(c.totalActivities ?? 0);
        setStatsLoaded(true);
      }
    } catch {}
  }, [clientData]);

  // Load profile photo and weekly target from client data
  useEffect(() => {
    if (clientData?.photoURL) {
      setPhotoURL(clientData.photoURL);
    }
    if (clientData?.weeklyWorkoutTarget) {
      setWeeklyWorkoutTarget(clientData.weeklyWorkoutTarget);
    }
  }, [clientData]);

  // Real-time notification listener (via shared hook)
  const notifQuery = useMemo(
    () => clientData ? query(collection(db, 'notifications'), where('toId', '==', clientData.id)) : null,
    [clientData]
  );
  const { data: rawNotifications } = useFirestoreListener(notifQuery, {
    transform: (docs) => {
      const sorted = [...docs].sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      return sorted.slice(0, 50);
    },
    onError: (err) => {
      if (err.code === 'permission-denied') {
        console.warn('Firestore rules may be missing for the notifications collection.');
      }
    },
  });
  useEffect(() => { setNotificationsRaw(rawNotifications); }, [rawNotifications]);

  // Close notification panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);


  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }));
    await batch.commit();
  };

  const clearAllNotifications = async () => {
    if (!notifications.length) return;
    const batch = writeBatch(db);
    notifications.forEach(n => batch.delete(doc(db, 'notifications', n.id)));
    await batch.commit();
  };

  // Create a notification helper
  const createNotification = async (toId, type, extra = {}) => {
    if (!clientData || toId === clientData.id) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        toId,
        fromId: clientData.id,
        fromName: clientData.name || 'Someone',
        fromPhotoURL: clientData.photoURL || null,
        type,
        read: false,
        createdAt: serverTimestamp(),
        ...extra
      });
    } catch (err) {
      console.error('Notification create error:', err);
      if (err.code === 'permission-denied') {
        showToast('Notifications blocked — check Firestore rules', 'error');
      }
    }
  };

  // Profile photo upload handler
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    // Always reset input so the same file can be re-selected
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (!file || !clientData) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }

    setUploadingPhoto(true);
    try {
      // Compress first — resizes to 400px JPEG so large camera photos work fine
      const compressed = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxSize = 400;
          let w = img.width, h = img.height;
          if (w > h) { h = (h / w) * maxSize; w = maxSize; }
          else { w = (w / h) * maxSize; h = maxSize; }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.75);
        };
        img.src = URL.createObjectURL(file);
      });

      // Upload to Storage
      const storageRef = ref(storage, `profilePhotos/${clientData.id}`);
      await uploadBytes(storageRef, compressed);
      const url = await getDownloadURL(storageRef);

      // Save URL to Firestore
      await updateDoc(doc(db, 'clients', clientData.id), { photoURL: url });
      setPhotoURL(url);
      updateClientData({ photoURL: url });
      showToast('Profile photo updated!', 'success');
    } catch (err) {
      console.error('Photo upload error:', err);
      showToast('Failed to upload photo', 'error');
    }
    setUploadingPhoto(false);
  };

  // 24hr countdown - time remaining in the day
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const diff = endOfDay - now;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds });

      // Calculate ticks elapsed out of 60 based on seconds
      setTicksElapsed(60 - seconds);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Rotating taglines
  useEffect(() => {
    const taglineInterval = setInterval(() => {
      setTaglineIdx((prev) => (prev + 1) % TAGLINES.length);
    }, 8000);
    return () => clearInterval(taglineInterval);
  }, []);

  // Load ring stats
  useEffect(() => {
    if (!currentUser || !clientData) return;
    const loadStats = async () => {
      let logsSnap = null;
      let actSnap = null;
      let localNutTargets = null;

      try {
        const todayStr = formatDate(new Date());

        // 1. Total workouts (all types)
        const logsRef = collection(db, 'workoutLogs');
        const q = query(logsRef, where('clientId', '==', clientData.id));
        logsSnap = await getDocs(q);
        setTotalWorkouts(logsSnap.docs.length);
        // Weekly workout count (Mon-Sun) — use completedAt timestamp
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - mondayOffset);
        monday.setHours(0, 0, 0, 0);
        const mondayMs = monday.getTime();
        const weekCount = logsSnap.docs.filter(d => {
          const ts = d.data().completedAt;
          if (!ts) return false;
          const ms = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
          return ms >= mondayMs;
        }).length;
        setWeeklyWorkouts(weekCount);

        // 2. Activity logs — count toward weekly target
        const actLogsRef = collection(db, 'activityLogs');
        const actQ = query(actLogsRef, where('clientId', '==', clientData.id));
        actSnap = await getDocs(actQ);
        setTotalActivities(actSnap.docs.length);
        const weekActCount = actSnap.docs.filter(d => {
          const ts = d.data().completedAt;
          if (!ts) return false;
          const ms = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
          return ms >= mondayMs;
        }).length;
        setWeeklyActivities(weekActCount);

        // 3. Habit completion today — fetch custom habits to get real total
        const [habitSnap, customHabitsSnap] = await Promise.all([
          getDocs(query(collection(db, 'habitLogs'), where('clientId', '==', clientData.id), where('date', '==', todayStr))),
          getDoc(doc(db, 'customHabits', clientData.id)),
        ]);
        // Compute real habit count: defaults (minus hidden) + custom
        let trueHabitCount = DEFAULT_HABIT_COUNT;
        if (customHabitsSnap.exists()) {
          const customData = customHabitsSnap.data();
          const customList = customData.habits || [];
          const hiddenDefaults = customData.hiddenDefaults || [];
          const visibleDefaults = DEFAULT_HABIT_KEYS.filter(k => !hiddenDefaults.includes(k)).length;
          trueHabitCount = visibleDefaults + customList.length;
        }
        if (!isPremium) trueHabitCount = Math.min(trueHabitCount, FREE_HABIT_LIMIT);
        setRealHabitCount(trueHabitCount);

        let todayCompleted = 0;
        if (!habitSnap.empty) {
          const habits = habitSnap.docs[0].data().habits || {};
          todayCompleted = Object.values(habits).filter(Boolean).length;
        }
        setHabitWeekPct(Math.round((todayCompleted / trueHabitCount) * 100));
        setTodayHabitsCount(todayCompleted);

        // 4. Nutrition targets
        const targetSnap = await getDoc(doc(db, 'nutritionTargets', clientData.id));
        if (targetSnap.exists()) {
          setNutritionTargetData(targetSnap.data());
          localNutTargets = targetSnap.data();
        }

        // 5. Today's nutrition log
        const nutLogSnap = await getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${todayStr}`));
        if (nutLogSnap.exists()) {
          const entries = nutLogSnap.data().entries || [];
          const totals = entries.reduce((acc, e) => ({
            protein: acc.protein + (e.protein || 0),
            calories: acc.calories + (e.calories || 0),
          }), { protein: 0, calories: 0 });
          setNutritionTotals(totals);
        }
      } catch (err) {
        console.error('Error loading dashboard stats:', err);
      }

      // 6. Leaderboard top 3 preview (opted-in clients) + rank tracking
      try {
        const clientsRef = collection(db, 'clients');
        const cq = query(clientsRef, where('leaderboardOptIn', '==', true));
        const clientsSnap = await getDocs(cq);
        const optedIn = clientsSnap.docs.map(d => ({ id: d.id, name: d.data().name, photoURL: d.data().photoURL || null }));
        setLeaderboardTop3(optedIn.slice(0, 3));
        // Track rank movement
        if (clientData?.id) {
          const myIdx = optedIn.findIndex(e => e.id === clientData.id);
          const myRank = myIdx >= 0 ? myIdx + 1 : null;
          try {
            const prevKey = `lbRank_${clientData.id}`;
            const stored = sessionStorage.getItem(prevKey);
            if (stored) setPrevLeaderboardRank(parseInt(stored, 10));
            if (myRank) sessionStorage.setItem(prevKey, String(myRank));
          } catch {}
        }
      } catch (lbErr) {
        console.error('Leaderboard preview error:', lbErr);
      }

      // 7. Compute workout streak (consecutive weeks with at least 1 workout or activity)
      // If the current week has no workouts yet, skip to last week without
      // breaking the streak (the new week may have only just started).
      try {
        let wkStreak = 0;
        if (logsSnap) {
          const allDates = [
            ...logsSnap.docs.map(d => d.data().date),
            ...(actSnap ? actSnap.docs.map(d => d.data().date) : []),
          ].filter(Boolean).sort().reverse();
          if (allDates.length > 0) {
            const now2 = new Date();
            let checkWeek = new Date(now2);
            let skippedCurrent = false;
            outer: for (let w = 0; w < 52; w++) {
              const weekStart = new Date(checkWeek);
              const dow = weekStart.getDay();
              const monOff = dow === 0 ? 6 : dow - 1;
              weekStart.setDate(weekStart.getDate() - monOff);
              weekStart.setHours(0, 0, 0, 0);
              const weekEnd = new Date(weekStart);
              weekEnd.setDate(weekEnd.getDate() + 7);
              const wsStr = formatDate(weekStart);
              const weStr = formatDate(weekEnd);
              const hasWorkout = allDates.some(d => d >= wsStr && d < weStr);
              if (hasWorkout) { wkStreak++; }
              else if (w === 0) { skippedCurrent = true; }
              else break outer;
              checkWeek.setDate(checkWeek.getDate() - 7);
            }
          }
        }
        setStreakWeeks(wkStreak);
      } catch (streakErr) {
        console.error('Streak computation error:', streakErr);
      }

      setStatsLoaded(true);
    };
    loadStats();
  }, [currentUser, clientData, habitCount]);

  // Cache dashboard stats after fresh load so returning visits are instant
  useEffect(() => {
    if (!statsLoaded || !clientData) return;
    try {
      sessionStorage.setItem(`cbDash_${clientData.id}`, JSON.stringify({
        totalWorkouts, habitWeekPct,
        nutritionTotals, nutritionTargetData, todayHabitsCount,
        realHabitCount, weeklyWorkouts, weeklyWorkoutTarget, leaderboardTop3,
        streakWeeks, weeklyActivities, totalActivities
      }));
    } catch {}
  }, [statsLoaded, totalWorkouts, habitWeekPct,
     nutritionTotals, nutritionTargetData, todayHabitsCount,
     weeklyWorkouts, weeklyWorkoutTarget,
     leaderboardTop3, streakWeeks, weeklyActivities, totalActivities, clientData]);

// Weekly target celebration — triggers once per week when target met
  useEffect(() => {
    if (!statsLoaded || weeklyCelebrationShownRef.current) return;
    if ((weeklyWorkouts + weeklyActivities) >= weeklyWorkoutTarget && weeklyWorkoutTarget > 0) {
      const celebKey = `weekCeleb_${clientData?.id}_${new Date().toISOString().slice(0, 10).replace(/-\d{2}$/, '')}`;
      try {
        if (localStorage.getItem(celebKey)) return;
        localStorage.setItem(celebKey, '1');
      } catch {}
      weeklyCelebrationShownRef.current = true;
      setShowWeeklyCelebration(true);
      setTimeout(() => setShowWeeklyCelebration(false), 3500);
    }
  }, [statsLoaded, weeklyWorkouts, weeklyActivities, weeklyWorkoutTarget, clientData]);

  // Tour finish handler — persist to Firestore so it only shows once
  const handleTourFinish = useCallback(async () => {
    tourDismissedRef.current = true;
    setShowTour(false);
    // Optimistic local update — prevents re-show even if Firestore write
    // is slow or fails, and survives onSnapshot overwrites via sessionStorage.
    updateClientData({ tourComplete: true });
    if (clientData?.id) {
      try { localStorage.setItem(`tourDone_${clientData.id}`, '1'); } catch {}
      try {
        await updateDoc(doc(db, 'clients', clientData.id), { tourComplete: true });
      } catch (e) {
        console.error('Failed to save tour completion:', e);
      }
    }
  }, [clientData, updateClientData]);

  // Save weekly workout target
  const saveWeeklyTarget = useCallback(async (target) => {
    setWeeklyWorkoutTarget(target);
    setShowTargetPicker(false);
    setShowTargetHint(false);
    if (clientData?.id) {
      try {
        localStorage.setItem(`targetHint_${clientData.id}`, '1');
      } catch {}
      try {
        await updateDoc(doc(db, 'clients', clientData.id), { weeklyWorkoutTarget: target });
      } catch (e) {
        console.error('Failed to save weekly target:', e);
      }
    }
  }, [clientData]);

  // Ripple effect
  const createRipple = (event) => {
    const button = event.currentTarget;
    const existingRipple = button.querySelector('.ripple');
    if (existingRipple) existingRipple.remove();
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  };

  const firstName = clientData?.name?.split(' ')[0] || 'there';

  // Calculate percentages for 3 stat rings (solid arc style)
  // Activities count toward the weekly workout target
  const combinedWeekly = weeklyWorkouts + weeklyActivities;
  const workoutPct = Math.min(Math.round((combinedWeekly / weeklyWorkoutTarget) * 100), 100);

  const streakPct = streakWeeks > 0 ? Math.min(Math.round((streakWeeks / 12) * 100), 100) : 0;

  const statRings = [
    { label: 'Wk Streak', value: `${streakWeeks}`, pct: streakPct, color: 'var(--color-primary)', size: 'normal' },
    { label: 'Sessions', value: `${combinedWeekly}/${weeklyWorkoutTarget}`, pct: workoutPct, color: 'var(--color-primary)', size: 'large', editable: true },
    { label: 'Habits Today', value: `${habitWeekPct}%`, pct: habitWeekPct, color: 'var(--color-primary)', size: 'normal' },
  ];

  // Compute whether nutrition / workouts / habits are complete for card signaling
  const nutritionDone = nutritionTotals.calories > 0 && nutritionTargetData?.calories && nutritionTotals.calories >= nutritionTargetData.calories * 0.8;
  const workoutsDone = combinedWeekly >= weeklyWorkoutTarget && weeklyWorkoutTarget > 0;
  const habitsDone = todayHabitsCount >= habitCount;

  // Milestone approaching text for return trigger
  const milestoneText = (() => {
    if (!statsLoaded) return null;
    const remaining = weeklyWorkoutTarget - combinedWeekly;
    if (remaining === 1) return `1 more session to hit your weekly target`;
    if (remaining === 2) return `2 more sessions to hit your weekly target`;
    if (habitCount - todayHabitsCount === 1) return `1 habit left to complete today`;
    return null;
  })();

  // Nutrition percentage helper
  const nutPct = (key) => {
    if (!nutritionTargetData || !nutritionTargetData[key]) return 0;
    return Math.min(Math.round((nutritionTotals[key] / nutritionTargetData[key]) * 100), 100);
  };

  // Time-aware coach message — variable reward (random per session)
  const coachLine = (() => {
    const hour = new Date().getHours();
    const allDone = statsLoaded && todayHabitsCount >= habitCount && nutritionTotals.calories > 0;
    const pick = (arr) => arr[Math.floor((Date.now() / 60000) % arr.length)]; // rotates every minute
    if (allDone) return pick(COACH_MESSAGES.allDone);
    if (hour >= 5 && hour < 12) return pick(COACH_MESSAGES.morning);
    if (hour >= 12 && hour < 17) return pick(COACH_MESSAGES.afternoon);
    if (hour >= 17 && hour < 21) return pick(COACH_MESSAGES.evening);
    return pick(COACH_MESSAGES.night);
  })();

  // Priority-based smart nudge
  const nudge = (() => {
    if (!statsLoaded) return null;
    // 1. No workouts or activities this week — suggest a session
    if (combinedWeekly === 0) {
      return {
        label: 'WORKOUT',
        message: 'No sessions this week yet',
        cta: 'Start One',
        action: () => navigate('/client/core-buddy/workouts'),
        pct: 0,
        ringLabel: '0',
      };
    }
    // 2. No nutrition logged (premium only)
    if (isPremium && nutritionTotals.calories === 0) {
      return {
        label: 'NUTRITION',
        message: 'No meals logged today',
        cta: 'Log Meal',
        action: () => navigate('/client/core-buddy/nutrition'),
        pct: 0,
        ringLabel: '0',
      };
    }
    // 3. Everything done
    return {
      label: 'TODAY',
      message: "You're crushing it!",
      cta: null,
      action: null,
      pct: 100,
      ringLabel: '\u2713',
    };
  })();



  return (
    <>
    <div className="cb-dashboard">
      {/* Header */}
      <header className="client-header">
        <div className="header-content">
          {/* Left group — bell + settings */}
          <div className="header-left-group">
            <div className="header-notif-wrap" ref={notifRef}>
              <button className="header-notif-btn" onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) markAllRead(); }} aria-label="Notifications">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unreadCount > 0 && <span className="header-notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>

              {notifOpen && (
                <div className="notif-panel">
                  <div className="notif-panel-header">
                    <span className="notif-panel-title">Notifications</span>
                    {notifications.length > 0 && (
                      <button className="notif-clear-btn" onClick={clearAllNotifications}>Clear all</button>
                    )}
                  </div>
                  <div className="notif-panel-list">
                    {notifications.length === 0 ? (
                      <div className="notif-empty">No notifications yet</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className={`notif-item${n.read ? '' : ' unread'}`} onClick={() => {
                          setNotifOpen(false);
                          if (n.type === 'buddy_request' || n.type === 'buddy_accept') {
                            navigate(isPremium ? '/client/core-buddy/buddies' : '/upgrade');
                          } else if (n.type === 'like' || n.type === 'comment') {
                            navigate('/client/core-buddy/buddies', { state: n.postId ? { scrollToPost: n.postId } : undefined });
                          } else if (n.type === 'mention') {
                            navigate(`/client/core-buddy/profile/${n.fromId}`);
                          } else if (n.type === 'announcement') {
                            navigate(isPremium ? '/client/core-buddy/buddies' : '/upgrade');
                          }
                        }}>
                          <div className="notif-item-avatar">
                            {n.fromPhotoURL ? <img src={n.fromPhotoURL} alt="" /> : <span>{(n.fromName || '?')[0]}</span>}
                          </div>
                          <div className="notif-item-body">
                            <p className="notif-item-text">
                              <strong>{n.fromName}</strong>{' '}
                              {n.type === 'buddy_request' && 'sent you a buddy request'}
                              {n.type === 'buddy_accept' && 'accepted your buddy request'}
                              {n.type === 'like' && 'liked your post'}
                              {n.type === 'comment' && 'commented on your post'}
                              {n.type === 'mention' && 'mentioned you'}
                              {n.type === 'announcement' && `posted: ${n.body || 'a new announcement'}`}
                              {n.type === 'daily_morning' && (n.body || 'sent a morning motivation')}
                              {n.type === 'daily_evening' && (n.body || 'sent an evening check-in')}
                            </p>
                            <span className="notif-item-time">{timeAgo(n.createdAt)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <button className="header-icon-btn" onClick={() => navigate('/client/core-buddy/settings')} aria-label="Settings">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>

          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />

          {/* Right group — theme toggle + logout */}
          <div className="header-actions">
            <button className="header-icon-btn" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>
                </svg>
              )}
            </button>
            <button className="header-icon-btn" onClick={logout} aria-label="Log out">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="cb-main">
        {/* 24hr Countdown Ring */}
        <div className="cb-ring-container">
          <div className="cb-ring">
            <svg className="cb-ring-svg" viewBox="0 0 200 200">
              {TICKS_85_96.map((t, i) => {
                const isElapsed = i < ticksElapsed;
                return (
                  <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                    className={`ring-tick ${isElapsed ? 'elapsed' : 'remaining'}`}
                    strokeWidth={t.thick ? '3' : '2'} />
                );
              })}
            </svg>
            <div className="cb-ring-center">
              <div className="cb-ring-logo" onClick={() => photoInputRef.current?.click()} role="button" tabIndex={0} aria-label="Change profile photo">
                <img src={photoURL || '/Logo.webp'} alt={photoURL ? 'Profile' : 'Mind Core Fitness'} />
                <div className={`cb-photo-overlay${uploadingPhoto ? ' uploading' : ''}`}>
                  {uploadingPhoto ? (
                    <div className="cb-photo-spinner" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  )}
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                />
              </div>
              {!photoURL && !uploadingPhoto && (
                <div className="cb-photo-badge" onClick={() => photoInputRef.current?.click()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
              )}
            </div>
          </div>
          <div className="cb-ring-countdown">
            <span className="cb-timer-digit">{String(timeLeft.hours).padStart(2, '0')}</span>
            <span className="cb-timer-colon">:</span>
            <span className="cb-timer-digit">{String(timeLeft.minutes).padStart(2, '0')}</span>
            <span className="cb-timer-colon">:</span>
            <span className="cb-timer-digit cb-timer-seconds">{String(timeLeft.seconds).padStart(2, '0')}</span>
          </div>
          <span className="cb-ring-label">remaining today</span>
          <p className="cb-ring-tagline" key={taglineIdx}>{TAGLINES[taglineIdx].text} <strong>{TAGLINES[taglineIdx].bold}</strong></p>
        </div>

        {/* Stats Rings Row — always rendered to prevent layout shift */}
        <div className="cb-stats-row">
          {statRings.map((ring) => {
            const r = ring.size === 'large' ? 38 : 38;
            const circ = 2 * Math.PI * r;
            const offset = circ - (ring.pct / 100) * circ;
            const isEditable = ring.editable;
            // Goal gradient: visual escalation as ring approaches completion
            const isNear = ring.pct >= 75 && ring.pct < 100;
            const isComplete = ring.pct >= 100;
            return (
              <div key={ring.label} className={`cb-stat-item${ring.size === 'large' ? ' cb-stat-large' : ''}`}>
                <div
                  className={`cb-stat-ring${isEditable ? ' cb-stat-tappable' : ''}${isEditable && showTargetHint ? ' cb-stat-hint' : ''}${isNear ? ' cb-stat-near' : ''}${isComplete ? ' cb-stat-complete' : ''}`}
                  onClick={isEditable ? () => { setShowTargetPicker(true); setShowTargetHint(false); } : undefined}
                >
                  <svg viewBox="0 0 100 100">
                    <circle className="cb-stat-track" cx="50" cy="50" r={r} />
                    <circle className={`cb-stat-fill${isNear ? ' cb-fill-near' : ''}${isComplete ? ' cb-fill-complete' : ''}`} cx="50" cy="50" r={r}
                      strokeDasharray={circ}
                      strokeDashoffset={offset} />
                  </svg>
                  <span className={`cb-stat-value${isComplete ? ' cb-val-complete' : ''}`}>{ring.value}</span>
                </div>
                <span className="cb-stat-label">
                  {ring.label === 'Wk Streak' && streakWeeks > 0 && <svg className="cb-streak-flame" width="12" height="12" viewBox="0 0 24 24" fill="var(--color-primary)" stroke="none"><path d="M12 12c2-2.96 0-7-1-8 0 3.038-1.773 4.741-3 6-1.226 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.532-1.056-3.94-2-5-1.786 3-2.791 3-4 2z"/></svg>}
                  {ring.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Habit Carousel — swipe through today's habits, press-and-hold to complete */}
        <ProfileHabitCarousel
          onStatsChange={({ completed, total }) => {
            setTodayHabitsCount(completed);
            setHabitWeekPct(total > 0 ? Math.round((completed / total) * 100) : 0);
          }}
          onOpenHabits={() => navigate('/client/core-buddy/consistency')}
        />

        {/* Weekly target picker */}
        {showTargetPicker && (
          <div className="cb-target-overlay" onClick={() => setShowTargetPicker(false)}>
            <div className="cb-target-picker" onClick={(e) => e.stopPropagation()}>
              <h4>Weekly workout target</h4>
              <p>How many sessions per week?</p>
              <div className="cb-target-options">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    className={`cb-target-option${n === weeklyWorkoutTarget ? ' active' : ''}`}
                    onClick={() => saveWeeklyTarget(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Body Metrics — hero card with one focus ring + delta */}
        <MetricsHeroCard onOpenMetrics={() => navigate('/client/core-buddy/metrics')} />

        {/* Nutrition Rings — premium only, matches body metrics style */}
        {isPremium && (
          <button className={`cb-metric-rings-wrap cb-nutrition-wrap${nutritionDone ? ' cb-card-done' : ''}`} onClick={() => navigate('/client/core-buddy/nutrition')}>
            <span className="cb-metric-rings-title">Today's Nutrition</span>
            <div className="cb-metric-rings-row">
              {[
                { key: 'protein', label: 'Protein' },
                { key: 'calories', label: 'Calories' },
              ].map((m) => {
                const pct = nutPct(m.key);
                const r = 38;
                const circ = 2 * Math.PI * r;
                const off = circ - (pct / 100) * circ;
                return (
                  <div key={m.key} className="cb-metric-mini cb-nutrition-mini">
                    <div className="cb-metric-mini-ring cb-nutrition-ring">
                      <svg viewBox="0 0 100 100">
                        <circle className="cb-metric-mini-track cb-nutrition-track" cx="50" cy="50" r={r} />
                        <circle className="cb-metric-mini-fill cb-nutrition-fill" cx="50" cy="50" r={r}
                          strokeDasharray={circ}
                          strokeDashoffset={off} />
                      </svg>
                    </div>
                    <span className="cb-metric-mini-label">{m.label}</span>
                  </div>
                );
              })}
            </div>
            <span className="cb-metric-rings-cta">Log meal &rarr;</span>
          </button>
        )}

        {/* Coach Message */}
        <p className="cb-coach-msg">{coachLine.main} <strong>{firstName}</strong> — {coachLine.sub}</p>

        {/* Milestone approaching — return trigger */}
        {milestoneText && (
          <div className="cb-milestone-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <span>{milestoneText}</span>
          </div>
        )}

        {/* Feature Cards */}
        <div className="cb-features">

          {/* Smart Nudge Card */}
          {nudge && (
            <button className="cb-feature-card cb-card-unified cb-card-nudge ripple-btn" onClick={nudge.action || undefined}
              style={nudge.action ? undefined : { cursor: 'default' }}>
              <div className="cb-nudge-ring">
                <svg viewBox="0 0 100 100">
                  <circle className="cb-nudge-ring-track" cx="50" cy="50" r="38" />
                  <circle className="cb-nudge-ring-fill" cx="50" cy="50" r="38"
                    strokeDasharray={2 * Math.PI * 38}
                    strokeDashoffset={2 * Math.PI * 38 - (nudge.pct / 100) * 2 * Math.PI * 38} />
                </svg>
                <span className="cb-nudge-ring-val">{nudge.ringLabel}</span>
              </div>
              <div className="cb-card-content">
                <span className="cb-nudge-label">{nudge.label}</span>
                <h3 className="cb-nudge-title-text">{nudge.message}</h3>
                {nudge.cta && <span className="cb-nudge-cta">{nudge.cta} &rarr;</span>}
              </div>
            </button>
          )}

          {/* Workouts */}
          <button
            className={`cb-feature-card cb-card-unified cb-card-workouts ripple-btn${workoutsDone ? ' cb-card-done' : ''}`}
            onClick={(e) => { createRipple(e); navigate('/client/core-buddy/workouts'); }}
          >
            <div className="cb-card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 6.5m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0"/><path d="M2 21v-2a4 4 0 0 1 4-4h.5"/><path d="M17 3l4 4"/><path d="M21 3l-4 4"/><path d="M13.5 11.5l-3 3"/><path d="M17 17l-4-4"/><path d="M21 21l-4-4"/></svg>
            </div>
            <div className="cb-card-content">
              <h3>Workout</h3>
              <p>{weeklyWorkouts} this week &middot; {totalWorkouts} total</p>
            </div>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* Activity Log */}
          <button
            className={`cb-feature-card cb-card-unified cb-card-activity ripple-btn${!isPremium ? ' cb-card-locked' : ''}`}
            onClick={(e) => {
              createRipple(e);
              if (!isPremium) {
                navigate('/upgrade');
              } else {
                setShowActivityLogger(true);
              }
            }}
          >
            <div className="cb-card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <div className="cb-card-content">
              <h3>Log Activity</h3>
              {!isPremium ? (
                <p>Upgrade to log walks, runs, cycles &amp; more</p>
              ) : (
                <p>Walk, run, cycle, swim &mdash; log any activity</p>
              )}
            </div>
            {isPremium && weeklyActivities > 0 && <span className="cb-unified-stat">{weeklyActivities} this week</span>}
            {!isPremium && (
              <svg className="cb-card-lock-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            )}
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* View activity history link */}
          {isPremium && totalActivities > 0 && (
            <button
              className="cb-activity-history-link"
              onClick={() => navigate('/client/core-buddy/activity')}
            >
              View activity history ({totalActivities} logged) &rarr;
            </button>
          )}

          {/* Cards moved to FAB menu: Habits, Leaderboard, Challenges, Badges, Buddies, Body Metrics */}

          {/* Journey moved to Community tab */}

          {/* Single upgrade CTA for free tier */}
          {!isPremium && (
            <button className="cb-upgrade-cta" onClick={() => navigate('/upgrade')}>
              <span className="cb-upgrade-cta-text">Unlock the full experience</span>
              <span className="cb-upgrade-cta-sub">Unlimited workout times, nutrition, buddies & more</span>
              <svg className="cb-upgrade-cta-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
            </button>
          )}

        </div>
      </main>

      {/* FAB + Overlay Menu */}
      <button
        className={`cb-fab${fabOpen ? ' cb-fab-open cb-fab-hidden' : ''}${showActivityLogger ? ' cb-fab-hidden' : ''}`}
        onClick={() => setFabOpen(prev => !prev)}
        aria-label={fabOpen ? 'Close menu' : 'Open menu'}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="8" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
          <rect x="13" y="13" width="8" height="8" rx="2" />
        </svg>
      </button>

      {fabOpen && (
        <div className="cb-fab-overlay" onClick={() => setFabOpen(false)}>
          <div className="cb-fab-sheet" onClick={e => e.stopPropagation()}>
            <div className="cb-fab-header">
              <h3>Quick Access</h3>
              <button className="cb-fab-close" onClick={() => setFabOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="cb-fab-grid">
            <button className="cb-fab-item" onClick={() => { setFabOpen(false); navigate('/client/core-buddy/consistency'); }}>
              <span className="cb-fab-item-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </span>
              <span className="cb-fab-item-label">Habits</span>
            </button>
            <button className="cb-fab-item" onClick={() => { setFabOpen(false); navigate('/client/leaderboard'); }}>
              <span className="cb-fab-item-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
              </span>
              <span className="cb-fab-item-label">Leaderboard</span>
            </button>
            <button className="cb-fab-item" onClick={() => { setFabOpen(false); navigate('/client/core-buddy/badges'); }}>
              <span className="cb-fab-item-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>
              </span>
              <span className="cb-fab-item-label">Badges</span>
            </button>
            <button className="cb-fab-item" onClick={() => { setFabOpen(false); navigate('/client/core-buddy/challenges'); }}>
              <span className="cb-fab-item-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </span>
              <span className="cb-fab-item-label">Challenges</span>
            </button>
            <button className="cb-fab-item" onClick={() => { setFabOpen(false); navigate('/client/core-buddy/buddies'); }}>
              <span className="cb-fab-item-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </span>
              <span className="cb-fab-item-label">Community</span>
            </button>
            <button className="cb-fab-item" onClick={() => { setFabOpen(false); navigate('/client/core-buddy/metrics'); }}>
              <span className="cb-fab-item-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              </span>
              <span className="cb-fab-item-label">Body Metrics</span>
            </button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Logger Modal */}
      <ActivityLogger
        open={showActivityLogger}
        onClose={() => setShowActivityLogger(false)}
        clientData={clientData}
        onLogged={() => {
          setWeeklyActivities(c => c + 1);
          setTotalActivities(c => c + 1);
          showToast('Activity logged!', 'success');
        }}
      />

      {/* Core Buddy Bottom Nav */}
      <CoreBuddyNav active="home" />

      {/* Weekly target celebration */}
      {showWeeklyCelebration && (
        <div className="cb-weekly-celebration">
          <div className="cb-weekly-celebration-card">
            <span className="cb-weekly-celebration-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </span>
            <h4>Weekly Target Smashed!</h4>
            <p>{weeklyWorkouts}/{weeklyWorkoutTarget} sessions complete</p>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.type === 'info' && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          )}
          {toast.type === 'success' && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          )}
          {toast.message}
        </div>
      )}

      {/* Guided tour for new users */}
      <SpotlightTour steps={tourSteps} active={showTour} onFinish={handleTourFinish} />
    </div>
    </>
  );
}
