import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc,
  addDoc, deleteDoc, orderBy, limit, increment, serverTimestamp, onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTier } from '../contexts/TierContext';
import PullToRefresh from '../components/PullToRefresh';
import './CoreBuddyDashboard.css';
import CoreBuddyNav from '../components/CoreBuddyNav';
import { TICKS_85_96 } from '../utils/ringTicks';
import BADGE_DEFS from '../utils/badgeConfig';
import SpotlightTour from '../components/SpotlightTour';

const TICK_COUNT = 60;
const WORKOUT_MILESTONES = [10, 25, 50, 100, 200, 500, 1000];
const HABIT_COUNT = 5;

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getWorkoutMilestone(total) {
  let prev = 0;
  for (const m of WORKOUT_MILESTONES) {
    if (total < m) return { prev, next: m };
    prev = m;
  }
  return { prev: WORKOUT_MILESTONES[WORKOUT_MILESTONES.length - 1], next: total + 100 };
}

// Programme templates (must match CoreBuddyProgrammes)
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

const TEMPLATE_DAYS = {
  fullbody_4wk: ['Push Focus', 'Pull Focus', 'Legs & Core'],
  fullbody_8wk: ['Strength', 'Power', 'Endurance'],
  fullbody_12wk: ['Upper Push', 'Lower Body', 'Upper Pull'],
  core_4wk: ['Abs', 'Stability', 'Power Core'],
  core_8wk: ['Anti-Extension', 'Rotation', 'Power'],
  core_12wk: ['Strength', 'Endurance', 'Power'],
  upper_4wk: ['Push', 'Pull', 'Mixed'],
  lower_4wk: ['Quad Dominant', 'Hamstring & Glute', 'Power & Stability'],
};

const TAGLINES = [
  { text: 'You have 24 hours a day...', bold: 'make it count' },
  { text: 'Discipline beats motivation...', bold: 'every single time' },
  { text: "Rest when you're done,", bold: "not when you're tired" },
  { text: 'Small daily gains...', bold: 'create massive results' },
  { text: "Your body keeps score,", bold: 'train it well' },
  { text: 'Consistency over intensity...', bold: 'always wins' },
  { text: 'The only bad workout...', bold: 'is the one you skipped' },
];

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

function getInitials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  if (p.length === 1) return p[0][0].toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function compressImage(file, maxSize = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
      else { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  });
}


export default function CoreBuddyDashboard() {
  const { currentUser, isClient, clientData, logout, updateClientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { isPremium } = useTier();
  const navigate = useNavigate();

  // 24hr countdown state
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [ticksElapsed, setTicksElapsed] = useState(0);

  // Ring stats
  const [programmePct, setProgrammePct] = useState(0);
  const [programmeName, setProgrammeName] = useState('');
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [habitWeekPct, setHabitWeekPct] = useState(0);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [nutritionTotals, setNutritionTotals] = useState({ protein: 0, carbs: 0, fats: 0, calories: 0 });
  const [nutritionTargetData, setNutritionTargetData] = useState(null);
  const [todayHabitsCount, setTodayHabitsCount] = useState(0);
  const [nextSession, setNextSession] = useState(null);
  const [hasProgramme, setHasProgramme] = useState(false);
  const [programmeComplete, setProgrammeComplete] = useState(false);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState(0);
  const [pbCount, setPbCount] = useState(0);
  const [topPBs, setTopPBs] = useState([]);
  const [leaderboardTop3, setLeaderboardTop3] = useState([]);

  // Profile photo
  const [photoURL, setPhotoURL] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  // Achievements
  const [unlockedBadges, setUnlockedBadges] = useState([]);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [celebrationBadge, setCelebrationBadge] = useState(null);
  const previousBadgesRef = useRef(null);

  // Streak data for achievements
  const [streakWeeks, setStreakWeeks] = useState(0);
  const [habitStreak, setHabitStreak] = useState(0);
  const [nutritionStreak, setNutritionStreak] = useState(0);

  // Rotating tagline
  const [taglineIdx, setTaglineIdx] = useState(0);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Journey state
  const [journeyPosts, setJourneyPosts] = useState([]);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyText, setJourneyText] = useState('');
  const [journeyImage, setJourneyImage] = useState(null);
  const [journeyImagePreview, setJourneyImagePreview] = useState(null);
  const [journeyPosting, setJourneyPosting] = useState(false);
  const [likedPosts, setLikedPosts] = useState(new Set());
  const [expandedComments, setExpandedComments] = useState(new Set());
  const [comments, setComments] = useState({});
  const [commentText, setCommentText] = useState({});
  const [commentLoading, setCommentLoading] = useState({});
  const [replyTo, setReplyTo] = useState({});            // { [postId]: { id, authorName } }
  const [commentImage, setCommentImage] = useState({});   // { [postId]: File }
  const [commentImagePreview, setCommentImagePreview] = useState({}); // { [postId]: dataURL }
  const journeyTextRef = useRef(null);
  const journeyFileRef = useRef(null);
  const commentFileRefs = useRef({});

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  // @ Mention state
  const [allClients, setAllClients] = useState([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionTarget, setMentionTarget] = useState(null); // 'compose' | postId
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionAnchor, setMentionAnchor] = useState(null);

  // Guided tour — only shown once for new users
  const [showTour, setShowTour] = useState(false);
  const tourDismissedRef = useRef(false);

  // Build tour steps based on tier (premium users see more steps)
  const tourSteps = (() => {
    const base = [
      {
        selector: '.cb-ring-container',
        title: 'Your 24-Hour Countdown',
        body: 'Every day resets. This ring tracks the time you have left — tap your photo to personalise your profile.',
        cta: 'Next',
      },
      {
        selector: '.cb-stats-row',
        title: 'Progress at a Glance',
        body: 'Programme completion, workouts this week, and daily habits — all in one row. These fill up as you go.',
      },
      {
        selector: '.cb-nudge-card',
        title: 'Smart Suggestions',
        body: "We'll highlight what needs your attention — your next session, unfinished habits, or a meal to log.",
      },
      {
        selector: '.cb-card-workouts-hero',
        title: 'Workouts',
        body: 'Quick randomiser sessions or structured programmes — pick your focus, level and time.',
        cta: 'Next',
      },
    ];

    if (isPremium) {
      base.push(
        {
          selector: '.cb-card-nutrition',
          title: 'Nutrition Tracking',
          body: 'Set your macro targets, scan barcodes, and log meals to hit your daily goals.',
        },
        {
          selector: '.cb-card-consistency',
          title: 'Daily Habits',
          body: '5 simple habits each day — train, hit protein, 10k steps, sleep, and hydrate. Build your streak.',
        },
        {
          selector: '.cb-card-buddies',
          title: 'Buddies & Social',
          body: 'Connect with other members, share your journey, and keep each other accountable.',
        },
        {
          selector: '.cb-journey-section',
          title: 'Share Your Journey',
          body: 'Post photos, updates, and milestones — your fitness journey in one place. Like and comment on each other\'s posts.',
        },
        {
          selector: '.cb-achievements-section',
          title: 'Achievements',
          body: 'Every rep counts towards badges — volume milestones, workout streaks, and more to unlock.',
        },
      );
    }

    base.push({
      selector: '.block-bottom-nav',
      title: "You're All Set!",
      body: 'Use the nav bar to jump between your profile, workouts, nutrition, and buddies. Time to get after it.',
      cta: 'Let\'s Go!',
    });

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

  // Hydrate from session cache so returning visits render instantly
  useEffect(() => {
    if (!clientData) return;
    try {
      const cached = sessionStorage.getItem(`cbDash_${clientData.id}`);
      if (cached) {
        const c = JSON.parse(cached);
        setProgrammePct(c.programmePct ?? 0);
        setProgrammeName(c.programmeName ?? '');
        setTotalWorkouts(c.totalWorkouts ?? 0);
        setHabitWeekPct(c.habitWeekPct ?? 0);
        setNutritionTotals(c.nutritionTotals ?? { protein: 0, carbs: 0, fats: 0, calories: 0 });
        setNutritionTargetData(c.nutritionTargetData ?? null);
        setTodayHabitsCount(c.todayHabitsCount ?? 0);
        setNextSession(c.nextSession ?? null);
        setHasProgramme(c.hasProgramme ?? false);
        setProgrammeComplete(c.programmeComplete ?? false);
        setWeeklyWorkouts(c.weeklyWorkouts ?? 0);
        setPbCount(c.pbCount ?? 0);
        setTopPBs(c.topPBs ?? []);
        setLeaderboardTop3(c.leaderboardTop3 ?? []);
        setUnlockedBadges(c.unlockedBadges ?? []);
        previousBadgesRef.current = c.unlockedBadges ?? [];
        setStreakWeeks(c.streakWeeks ?? 0);
        setStatsLoaded(true);
      }
    } catch {}
  }, [clientData]);

  // Load profile photo from client data
  useEffect(() => {
    if (clientData?.photoURL) {
      setPhotoURL(clientData.photoURL);
    }
  }, [clientData]);

  // Real-time notification listener
  useEffect(() => {
    if (!clientData) return;
    const q = query(
      collection(db, 'notifications'),
      where('toId', '==', clientData.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      notifs.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      setNotifications(notifs.slice(0, 50));
    }, (err) => {
      console.error('Notification listener error:', err);
      if (err.code === 'permission-denied') {
        console.warn('Firestore rules may be missing for the notifications collection. Please update your Firestore rules in the Firebase Console.');
      }
    });
    return () => unsub();
  }, [clientData]);

  // Close notification panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch accepted buddies for @ mentions (only people you're actually connected with)
  useEffect(() => {
    if (!clientData) return;
    const myId = clientData.id;
    (async () => {
      try {
        // Get all accepted buddy connections
        const [b1, b2, clientsSnap] = await Promise.all([
          getDocs(query(collection(db, 'buddies'), where('user1', '==', myId))),
          getDocs(query(collection(db, 'buddies'), where('user2', '==', myId))),
          getDocs(collection(db, 'clients'))
        ]);
        const buddyIds = new Set();
        [...b1.docs, ...b2.docs].forEach(d => {
          const data = d.data();
          buddyIds.add(data.user1 === myId ? data.user2 : data.user1);
        });
        const clientMap = {};
        clientsSnap.docs.forEach(d => { clientMap[d.id] = d.data(); });
        setAllClients(Array.from(buddyIds).filter(id => clientMap[id]).map(id => ({
          id, name: clientMap[id].name, photoURL: clientMap[id].photoURL || null
        })));
      } catch (err) { console.error('Error loading buddies for mentions:', err); }
    })();
  }, [clientData]);

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

  // @ mention helpers
  const handleMentionInput = (text, target) => {
    const cursorPos = target === 'compose' ? journeyTextRef.current?.selectionStart : null;
    const relevantText = cursorPos != null ? text.slice(0, cursorPos) : text;
    const atMatch = relevantText.match(/@(\w*)$/);
    if (atMatch) {
      setMentionActive(true);
      setMentionTarget(target);
      setMentionQuery(atMatch[1].toLowerCase());
      const filtered = allClients.filter(c => c.name && c.name.toLowerCase().includes(atMatch[1].toLowerCase())).slice(0, 5);
      setMentionResults(filtered);
    } else {
      setMentionActive(false);
      setMentionResults([]);
    }
  };

  const insertMention = (client, target) => {
    if (target === 'compose') {
      const el = journeyTextRef.current;
      const text = journeyText;
      const cursorPos = el?.selectionStart ?? text.length;
      const before = text.slice(0, cursorPos);
      const after = text.slice(cursorPos);
      const replaced = before.replace(/@\w*$/, `@${client.name} `);
      setJourneyText(replaced + after);
      setTimeout(() => { el?.focus(); el.selectionStart = el.selectionEnd = replaced.length; }, 0);
    } else {
      // comment input — target is postId
      const text = commentText[target] || '';
      const replaced = text.replace(/@\w*$/, `@${client.name} `);
      setCommentText(prev => ({ ...prev, [target]: replaced }));
    }
    setMentionActive(false);
    setMentionResults([]);
  };

  // Parse post/comment text to highlight @mentions
  const renderWithMentions = (text) => {
    if (!text) return text;
    const parts = text.split(/(@\w[\w\s]*?\s)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@') && allClients.some(c => part.trim() === `@${c.name}`)) {
        return <span key={i} className="mention-highlight">{part.trim()}</span>;
      }
      return part;
    });
  };

  // Profile photo upload handler
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !clientData) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be under 5MB', 'error');
      return;
    }

    setUploadingPhoto(true);
    try {
      // Compress image via canvas
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
    // Reset input so same file can be re-selected
    if (photoInputRef.current) photoInputRef.current.value = '';
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
      let localPbCount = 0;
      let localPbList = [];
      let localProgrammeComplete = false;
      let localNutTargets = null;

      try {
        const todayStr = formatDate(new Date());

        // 1. Programme progress + next session
        const progSnap = await getDoc(doc(db, 'clientProgrammes', clientData.id));
        if (progSnap.exists()) {
          const prog = progSnap.data();
          const meta = TEMPLATE_META[prog.templateId];
          setHasProgramme(true);
          if (meta) {
            const completedKeys = prog.completedSessions || {};
            const completedCount = Object.keys(completedKeys).length;
            const total = meta.duration * meta.daysPerWeek;
            setProgrammePct(total > 0 ? Math.round((completedCount / total) * 100) : 0);
            const name = prog.templateId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            setProgrammeName(name);
            // Find next uncompleted session
            const dayLabels = TEMPLATE_DAYS[prog.templateId];
            let foundNext = false;
            for (let w = 1; w <= meta.duration && !foundNext; w++) {
              for (let d = 0; d < meta.daysPerWeek && !foundNext; d++) {
                if (!completedKeys[`w${w}d${d}`]) {
                  setNextSession({ week: w, dayIdx: d, label: dayLabels?.[d] || `Day ${d + 1}` });
                  foundNext = true;
                }
              }
            }
            if (!foundNext) { setProgrammeComplete(true); localProgrammeComplete = true; }
          }
        }

        // 2. Total workouts (all types)
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

        // 3. Habit completion today
        const habitRef = collection(db, 'habitLogs');
        const hq = query(habitRef, where('clientId', '==', clientData.id), where('date', '==', todayStr));
        const habitSnap = await getDocs(hq);
        let todayCompleted = 0;
        if (!habitSnap.empty) {
          const habits = habitSnap.docs[0].data().habits || {};
          todayCompleted = Object.values(habits).filter(Boolean).length;
        }
        setHabitWeekPct(Math.round((todayCompleted / HABIT_COUNT) * 100));
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
            carbs: acc.carbs + (e.carbs || 0),
            fats: acc.fats + (e.fats || 0),
            calories: acc.calories + (e.calories || 0),
          }), { protein: 0, carbs: 0, fats: 0, calories: 0 });
          setNutritionTotals(totals);
        }
      } catch (err) {
        console.error('Error loading dashboard stats:', err);
      }

      // 6. Personal Bests (independent so earlier errors don't block it)
      try {
        let pbList = [];

        // Try Core Buddy PBs first
        const cbPbSnap = await getDoc(doc(db, 'coreBuddyPBs', clientData.id));
        if (cbPbSnap.exists()) {
          const exercises = cbPbSnap.data().exercises || {};
          setPbCount(Object.keys(exercises).length);
          localPbCount = Object.keys(exercises).length;
          pbList = Object.entries(exercises)
            .sort(([, a], [, b]) => (b.weight || 0) - (a.weight || 0))
            .slice(0, 3)
            .map(([name, data]) => ({ name, weight: data.weight, reps: data.reps }));
        }

        // Fall back to block client benchmarks if no Core Buddy PBs
        if (pbList.length === 0) {
          const nameMap = { chestPress: 'Chest Press', shoulderPress: 'Shoulder Press', seatedRow: 'Seated Row', latPulldown: 'Lat Pulldown', squat: 'Squat', deadlift: 'Deadlift' };
          const bq = query(collection(db, 'personalBests'), where('clientId', '==', clientData.id));
          const bSnap = await getDocs(bq);
          if (!bSnap.empty) {
            const best = {};
            bSnap.docs.forEach(d => {
              const bench = d.data().benchmarks || {};
              Object.entries(bench).forEach(([key, val]) => {
                if (!val.weight || !nameMap[key]) return;
                const vol = (val.weight || 0) * (val.reps || 1);
                if (!best[key] || vol > (best[key].weight || 0) * (best[key].reps || 1)) {
                  best[key] = { name: nameMap[key], weight: val.weight, reps: val.reps };
                }
              });
            });
            const all = Object.values(best);
            setPbCount(all.length);
            localPbCount = all.length;
            pbList = all.sort((a, b) => (b.weight || 0) - (a.weight || 0)).slice(0, 3);
          }
        }

        localPbList = pbList;
        setTopPBs(pbList);
      } catch (pbErr) {
        console.error('PB fetch error:', pbErr);
      }

      // 7. Leaderboard top 3 preview (opted-in clients)
      try {
        const clientsRef = collection(db, 'clients');
        const cq = query(clientsRef, where('leaderboardOptIn', '==', true));
        const clientsSnap = await getDocs(cq);
        const optedIn = clientsSnap.docs.map(d => ({ id: d.id, name: d.data().name, photoURL: d.data().photoURL || null }));
        setLeaderboardTop3(optedIn.slice(0, 3));
      } catch (lbErr) {
        console.error('Leaderboard preview error:', lbErr);
      }

      // 8. Compute achievements
      try {
        // Calculate workout streak (consecutive weeks with at least 1 workout)
        let wkStreak = 0;
        if (logsSnap) {
          const allDates = logsSnap.docs.map(d => d.data().date).filter(Boolean).sort().reverse();
          if (allDates.length > 0) {
            const now2 = new Date();
            let checkWeek = new Date(now2);
            // Go back week by week
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
              else if (w > 0) break outer; // allow current week to be empty
              else break;
              checkWeek.setDate(checkWeek.getDate() - 7);
            }
          }
        }
        setStreakWeeks(wkStreak);

        // Habit streak (consecutive days with all 5 done, up to 30 days back)
        let hStreak = 0;
        for (let d = 0; d < 30; d++) {
          const checkDate = new Date();
          checkDate.setDate(checkDate.getDate() - d);
          const dStr = formatDate(checkDate);
          try {
            const hSnap = await getDocs(query(collection(db, 'habitLogs'), where('clientId', '==', clientData.id), where('date', '==', dStr)));
            if (!hSnap.empty) {
              const habits = hSnap.docs[0].data().habits || {};
              if (Object.values(habits).filter(Boolean).length >= HABIT_COUNT) { hStreak++; }
              else break;
            } else break;
          } catch { break; }
        }
        setHabitStreak(hStreak);

        // Nutrition streak (consecutive days hitting macro targets, up to 30 days back)
        let nStreak = 0;
        for (let d = 0; d < 30; d++) {
          const checkDate = new Date();
          checkDate.setDate(checkDate.getDate() - d);
          const dStr = formatDate(checkDate);
          try {
            const nSnap = await getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${dStr}`));
            if (nSnap.exists() && (nSnap.data().entries || []).length > 0) {
              if (localNutTargets) {
                const entries = nSnap.data().entries || [];
                const totals = entries.reduce((acc, e) => ({
                  protein: acc.protein + (e.protein || 0),
                  carbs: acc.carbs + (e.carbs || 0),
                  fats: acc.fats + (e.fats || 0),
                }), { protein: 0, carbs: 0, fats: 0 });
                if (totals.protein >= (localNutTargets.protein || 0) &&
                    totals.carbs >= (localNutTargets.carbs || 0) &&
                    totals.fats >= (localNutTargets.fats || 0)) {
                  nStreak++;
                } else break;
              } else {
                nStreak++;
              }
            } else break;
          } catch { break; }
        }
        setNutritionStreak(nStreak);

        // Total workouts across all types
        const totalAll = logsSnap ? logsSnap.docs.length : 0;

        // Determine unlocked badges
        const unlocked = [];
        const addBadge = (id) => unlocked.push(id);

        if (totalAll >= 1) addBadge('first_workout');
        if (totalAll >= 10) addBadge('workouts_10');
        if (totalAll >= 25) addBadge('workouts_25');
        if (totalAll >= 50) addBadge('workouts_50');
        if (totalAll >= 100) addBadge('workouts_100');

        // Streak badges
        if (wkStreak >= 2) addBadge('streak_2');
        if (wkStreak >= 4) addBadge('streak_4');
        if (wkStreak >= 8) addBadge('streak_8');

        // PB count badges
        if (localPbCount >= 1) addBadge('first_pb');
        if (localPbCount >= 5) addBadge('pbs_5');
        if (localPbCount >= 10) addBadge('pbs_10');
        if (localPbCount >= 100) addBadge('pbs_100');

        // Nutrition streak badge
        if (nStreak >= 7) addBadge('nutrition_7');

        // Leaderboard badge
        if (clientData.leaderboardOptIn) addBadge('leaderboard_join');

        // Habit streak badge
        if (hStreak >= 7) addBadge('habits_7');

        setUnlockedBadges(unlocked);

        // Detect newly unlocked badges and celebrate
        const prev = previousBadgesRef.current;
        if (prev !== null) {
          const newlyUnlocked = unlocked.filter(id => !prev.includes(id));
          if (newlyUnlocked.length > 0) {
            const badgeDef = BADGE_DEFS.find(b => b.id === newlyUnlocked[newlyUnlocked.length - 1]);
            if (badgeDef) {
              setTimeout(() => setCelebrationBadge(badgeDef), 600);
            }
          }
        }
        previousBadgesRef.current = unlocked;

        // Persist to Firestore (fire and forget)
        const badgeMap = {};
        unlocked.forEach(id => { badgeMap[id] = { unlockedAt: new Date().toISOString() }; });
        setDoc(doc(db, 'achievements', clientData.id), {
          badges: badgeMap,
          progress: { streakWeeks: wkStreak, pbCount: localPbCount, nutritionStreak: nStreak, habitStreak: hStreak },
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
      } catch (achErr) {
        console.error('Achievement computation error:', achErr);
      }

      setStatsLoaded(true);
    };
    loadStats();
  }, [currentUser, clientData]);

  // Cache dashboard stats after fresh load so returning visits are instant
  useEffect(() => {
    if (!statsLoaded || !clientData) return;
    try {
      sessionStorage.setItem(`cbDash_${clientData.id}`, JSON.stringify({
        programmePct, programmeName, totalWorkouts, habitWeekPct,
        nutritionTotals, nutritionTargetData, todayHabitsCount,
        nextSession, hasProgramme, programmeComplete,
        weeklyWorkouts, pbCount, topPBs, leaderboardTop3,
        unlockedBadges, streakWeeks
      }));
    } catch {}
  }, [statsLoaded, programmePct, programmeName, totalWorkouts, habitWeekPct,
     nutritionTotals, nutritionTargetData, todayHabitsCount, nextSession,
     hasProgramme, programmeComplete, weeklyWorkouts, pbCount, topPBs,
     leaderboardTop3, unlockedBadges, streakWeeks, clientData]);

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
  const { prev: wPrev, next: wNext } = getWorkoutMilestone(totalWorkouts);
  const workoutPct = wNext > wPrev ? Math.round(((totalWorkouts - wPrev) / (wNext - wPrev)) * 100) : 100;

  const statRings = [
    { label: 'Programme', value: `${programmePct}%`, pct: programmePct, color: '#14b8a6', size: 'normal' },
    { label: 'Workouts', value: `${totalWorkouts}`, pct: workoutPct, color: 'var(--color-primary)', size: 'large' },
    { label: 'Habits Today', value: `${habitWeekPct}%`, pct: habitWeekPct, color: '#38B6FF', size: 'normal' },
  ];

  // Nutrition percentage helper
  const nutPct = (key) => {
    if (!nutritionTargetData || !nutritionTargetData[key]) return 0;
    return Math.min(Math.round((nutritionTotals[key] / nutritionTargetData[key]) * 100), 100);
  };

  // Time-aware coach message
  const coachLine = (() => {
    const hour = new Date().getHours();
    const allDone = statsLoaded && todayHabitsCount >= HABIT_COUNT && nutritionTotals.calories > 0;
    if (allDone) return { main: `Smashed it today,`, sub: 'Rest up and go again tomorrow.' };
    if (hour >= 5 && hour < 12) return { main: `Rise and grind,`, sub: "let's get after it!" };
    if (hour >= 12 && hour < 17) return { main: `Oye`, sub: 'crack on and make it count!' };
    if (hour >= 17 && hour < 21) return { main: `Evening session?`, sub: "Let's finish strong!" };
    return { main: `Burning the midnight oil,`, sub: 'Respect the hustle!' };
  })();

  // Priority-based smart nudge
  const nudge = (() => {
    if (!statsLoaded) return null;
    // 1. Active programme with next session
    if (hasProgramme && nextSession && !programmeComplete) {
      return {
        label: 'NEXT SESSION',
        message: `Week ${nextSession.week}, Day ${nextSession.dayIdx + 1} — ${nextSession.label}`,
        cta: 'Continue',
        action: () => navigate('/client/core-buddy/programmes'),
        pct: programmePct,
        ringLabel: `${programmePct}%`,
      };
    }
    // 2. Habits not all done
    if (todayHabitsCount < HABIT_COUNT) {
      return {
        label: 'DAILY HABITS',
        message: `${todayHabitsCount}/${HABIT_COUNT} completed`,
        cta: 'Open Habits',
        action: () => navigate('/client/core-buddy/consistency'),
        pct: habitWeekPct,
        ringLabel: `${todayHabitsCount}/${HABIT_COUNT}`,
      };
    }
    // 3. No nutrition logged
    if (nutritionTotals.calories === 0) {
      return {
        label: 'NUTRITION',
        message: 'No meals logged today',
        cta: 'Log Meal',
        action: () => navigate('/client/core-buddy/nutrition'),
        pct: 0,
        ringLabel: '0',
      };
    }
    // 4. No programme active
    if (!hasProgramme) {
      return {
        label: 'PROGRAMMES',
        message: 'Start a programme to level up',
        cta: 'Browse',
        action: () => navigate('/client/core-buddy/workouts'),
        pct: 0,
        ringLabel: '\u2014',
      };
    }
    // 5. Programme complete
    if (programmeComplete) {
      return {
        label: 'COMPLETE',
        message: 'Programme finished!',
        cta: 'New Programme',
        action: () => navigate('/client/core-buddy/workouts'),
        pct: 100,
        ringLabel: '100%',
      };
    }
    // 6. Everything done
    return {
      label: 'TODAY',
      message: "You're crushing it!",
      cta: null,
      action: null,
      pct: 100,
      ringLabel: '\u2713',
    };
  })();

  // ── Journey functions ──
  const fetchJourney = useCallback(async () => {
    if (!clientData) return;
    setJourneyLoading(true);
    try {
      const postsSnap = await getDocs(
        query(
          collection(db, 'posts'),
          where('authorId', '==', clientData.id),
          orderBy('createdAt', 'desc'),
          limit(30)
        )
      );
      setJourneyPosts(postsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const likesSnap = await getDocs(
        query(collection(db, 'postLikes'), where('userId', '==', clientData.id))
      );
      setLikedPosts(new Set(likesSnap.docs.map(d => d.data().postId)));
    } catch (err) {
      console.error('Error loading journey:', err);
    } finally {
      setJourneyLoading(false);
    }
  }, [clientData]);

  useEffect(() => {
    if (statsLoaded && clientData) fetchJourney();
  }, [statsLoaded, clientData, fetchJourney]);

  const handleJourneyImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('Image must be under 10MB', 'error'); return; }
    setJourneyImage(file);
    setJourneyImagePreview(URL.createObjectURL(file));
  };

  const clearJourneyImage = () => {
    setJourneyImage(null);
    if (journeyImagePreview) URL.revokeObjectURL(journeyImagePreview);
    setJourneyImagePreview(null);
    if (journeyFileRef.current) journeyFileRef.current.value = '';
  };

  const handleJourneyPost = async () => {
    if ((!journeyText.trim() && !journeyImage) || journeyPosting || !clientData) return;
    setJourneyPosting(true);
    try {
      let imageURL = null;
      if (journeyImage) {
        const compressed = await compressImage(journeyImage);
        const imgId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const storageRef = ref(storage, `postImages/${clientData.id}/${imgId}`);
        await uploadBytes(storageRef, compressed);
        imageURL = await getDownloadURL(storageRef);
      }
      await addDoc(collection(db, 'posts'), {
        authorId: clientData.id,
        authorName: clientData.name || 'Unknown',
        authorPhotoURL: clientData.photoURL || null,
        content: journeyText.trim(),
        type: imageURL ? 'image' : 'text',
        imageURL: imageURL || null,
        createdAt: serverTimestamp(),
        likeCount: 0,
        commentCount: 0
      });
      // Notify @mentioned users in the post
      const postText = journeyText.trim();
      const mentionMatches = postText.match(/@[\w\s]+?(?=\s@|\s*$|[.,!?])/g);
      if (mentionMatches) {
        const notified = new Set();
        mentionMatches.forEach(m => {
          const name = m.slice(1).trim();
          const client = allClients.find(c => c.name && c.name.toLowerCase() === name.toLowerCase());
          if (client && !notified.has(client.id)) {
            notified.add(client.id);
            createNotification(client.id, 'mention', {});
          }
        });
      }
      setJourneyText('');
      clearJourneyImage();
      if (journeyTextRef.current) journeyTextRef.current.style.height = 'auto';
      await fetchJourney();
      showToast('Posted!', 'success');
    } catch (err) {
      console.error('Error posting:', err);
      showToast(err?.message || 'Failed to post', 'error');
    } finally {
      setJourneyPosting(false);
    }
  };

  const deleteJourneyPost = async (postId) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deleteDoc(doc(db, 'posts', postId));
      setJourneyPosts(prev => prev.filter(p => p.id !== postId));
      showToast('Post deleted', 'info');
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete', 'error');
    }
  };

  const toggleJourneyLike = async (postId) => {
    if (!clientData) return;
    const myId = clientData.id;
    const likeId = `${postId}_${myId}`;
    const isLiked = likedPosts.has(postId);
    const newLiked = new Set(likedPosts);
    if (isLiked) newLiked.delete(postId); else newLiked.add(postId);
    setLikedPosts(newLiked);
    setJourneyPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, likeCount: Math.max(0, (p.likeCount || 0) + (isLiked ? -1 : 1)) } : p
    ));
    try {
      if (isLiked) {
        await deleteDoc(doc(db, 'postLikes', likeId));
        await updateDoc(doc(db, 'posts', postId), { likeCount: increment(-1) });
      } else {
        await setDoc(doc(db, 'postLikes', likeId), { postId, userId: myId, createdAt: serverTimestamp() });
        await updateDoc(doc(db, 'posts', postId), { likeCount: increment(1) });
        // Notify post author
        const post = journeyPosts.find(p => p.id === postId);
        if (post) createNotification(post.authorId, 'like', { postId });
      }
    } catch (err) {
      console.error('Like error:', err);
      fetchJourney();
    }
  };

  const loadJourneyComments = async (postId) => {
    try {
      const snap = await getDocs(
        query(collection(db, 'postComments'), where('postId', '==', postId), orderBy('createdAt', 'asc'), limit(50))
      );
      setComments(prev => ({ ...prev, [postId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
    } catch (err) { console.error('Error loading comments:', err); }
  };

  const toggleJourneyComments = (postId) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(postId)) { newExpanded.delete(postId); }
    else { newExpanded.add(postId); if (!comments[postId]) loadJourneyComments(postId); }
    setExpandedComments(newExpanded);
  };

  const handleJourneyComment = async (postId) => {
    const text = (commentText[postId] || '').trim();
    const imgFile = commentImage[postId];
    if ((!text && !imgFile) || !clientData) return;
    setCommentLoading(prev => ({ ...prev, [postId]: true }));
    try {
      // Upload comment image if present
      let imageURL = null;
      if (imgFile) {
        const imgRef = ref(storage, `comment-images/${Date.now()}_${imgFile.name}`);
        await uploadBytes(imgRef, imgFile);
        imageURL = await getDownloadURL(imgRef);
      }
      const commentData = {
        postId, authorId: clientData.id, authorName: clientData.name || 'Unknown',
        authorPhotoURL: clientData.photoURL || null, content: text || '', createdAt: serverTimestamp()
      };
      if (imageURL) commentData.imageURL = imageURL;
      // Attach reply info
      const reply = replyTo[postId];
      if (reply) {
        commentData.replyToId = reply.id;
        commentData.replyToName = reply.authorName;
      }
      await addDoc(collection(db, 'postComments'), commentData);
      await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) });
      // Notify post author about comment
      const post = journeyPosts.find(p => p.id === postId);
      if (post) createNotification(post.authorId, 'comment', { postId });
      // Notify @mentioned users
      const mentionMatches = text.match(/@[\w\s]+?(?=\s@|\s*$|[.,!?])/g);
      if (mentionMatches) {
        const notified = new Set();
        mentionMatches.forEach(m => {
          const name = m.slice(1).trim();
          const client = allClients.find(c => c.name && c.name.toLowerCase() === name.toLowerCase());
          if (client && !notified.has(client.id)) {
            notified.add(client.id);
            createNotification(client.id, 'mention', { postId });
          }
        });
      }
      setCommentText(prev => ({ ...prev, [postId]: '' }));
      setCommentImage(prev => ({ ...prev, [postId]: null }));
      setCommentImagePreview(prev => ({ ...prev, [postId]: null }));
      setReplyTo(prev => ({ ...prev, [postId]: null }));
      if (commentFileRefs.current[postId]) commentFileRefs.current[postId].value = '';
      setJourneyPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p
      ));
      await loadJourneyComments(postId);
    } catch (err) {
      console.error('Comment error:', err);
      showToast('Failed to comment', 'error');
    } finally {
      setCommentLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  const deleteJourneyComment = async (postId, commentId) => {
    try {
      await deleteDoc(doc(db, 'postComments', commentId));
      await updateDoc(doc(db, 'posts', postId), { commentCount: increment(-1) });
      setComments(prev => ({ ...prev, [postId]: (prev[postId] || []).filter(c => c.id !== commentId) }));
      setJourneyPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, commentCount: Math.max((p.commentCount || 1) - 1, 0) } : p
      ));
    } catch (err) {
      console.error('Delete comment error:', err);
      showToast('Failed to delete comment', 'error');
    }
  };

  const handleCommentImageSelect = (postId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB', 'error'); return; }
    setCommentImage(prev => ({ ...prev, [postId]: file }));
    const reader = new FileReader();
    reader.onload = ev => setCommentImagePreview(prev => ({ ...prev, [postId]: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const clearCommentImage = (postId) => {
    setCommentImage(prev => ({ ...prev, [postId]: null }));
    setCommentImagePreview(prev => ({ ...prev, [postId]: null }));
    if (commentFileRefs.current[postId]) commentFileRefs.current[postId].value = '';
  };

  const handleJourneyTextInput = (e) => {
    setJourneyText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    handleMentionInput(e.target.value, 'compose');
  };

  const handleCommentInputChange = (postId, value) => {
    setCommentText(prev => ({ ...prev, [postId]: value }));
    handleMentionInput(value, postId);
  };

  return (
    <PullToRefresh>
    <div className="cb-dashboard" data-theme={isDark ? 'dark' : 'light'}>
      {/* Header */}
      <header className="client-header">
        <div className="header-content">
          {/* Notification bell — top left */}
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
                          navigate('/client/core-buddy/buddies');
                        } else if ((n.type === 'like' || n.type === 'comment') && n.postId) {
                          // Expand comments and load them if needed
                          if (!expandedComments.has(n.postId)) {
                            const newExpanded = new Set(expandedComments);
                            newExpanded.add(n.postId);
                            setExpandedComments(newExpanded);
                            if (!comments[n.postId]) loadJourneyComments(n.postId);
                          }
                          // Scroll to the specific post after React renders
                          setTimeout(() => {
                            const el = document.getElementById(`post-${n.postId}`);
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 150);
                        } else if (n.type === 'like' || n.type === 'comment') {
                          document.querySelector('.cb-journey-section')?.scrollIntoView({ behavior: 'smooth' });
                        } else if (n.type === 'mention') {
                          navigate(`/client/core-buddy/profile/${n.fromId}`);
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

          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          <div className="header-actions">
            <button onClick={toggleTheme} aria-label="Toggle theme">
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
            <button onClick={logout} aria-label="Log out">
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
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
            return (
              <div key={ring.label} className={`cb-stat-item${ring.size === 'large' ? ' cb-stat-large' : ''}`}>
                <div className="cb-stat-ring">
                  <svg viewBox="0 0 100 100">
                    <circle className="cb-stat-track" cx="50" cy="50" r={r} />
                    <circle className="cb-stat-fill" cx="50" cy="50" r={r}
                      style={{ stroke: ring.color }}
                      strokeDasharray={circ}
                      strokeDashoffset={offset} />
                  </svg>
                  <span className="cb-stat-value" style={{ color: ring.color }}>{ring.value}</span>
                </div>
                <span className="cb-stat-label">{ring.label}</span>
              </div>
            );
          })}
        </div>

        {/* Coach Message */}
        <p className="cb-coach-msg">{coachLine.main} <strong>{firstName}</strong> — {coachLine.sub}</p>

        {/* Smart Nudge Card */}
        {nudge && (
          <button className="cb-nudge-card" onClick={nudge.action || undefined}
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
            <div className="cb-nudge-info">
              <span className="cb-nudge-label">{nudge.label}</span>
              <span className="cb-nudge-title">{nudge.message}</span>
              {nudge.cta && <span className="cb-nudge-cta">{nudge.cta} &rarr;</span>}
            </div>
          </button>
        )}

        {/* Feature Cards */}
        <div className="cb-features">

          {/* 1. Nutrition / Macros */}
          <button
            className={`cb-feature-card cb-card-nutrition cb-card-has-preview ripple-btn${!isPremium ? ' cb-card-locked' : ''}`}
            onClick={(e) => { createRipple(e); navigate(isPremium ? '/client/core-buddy/nutrition' : '/upgrade'); }}
          >
            <div className="cb-card-top-row">
              <div className="cb-card-content">
                <h3>Today's Nutrition {!isPremium && <span className="cb-premium-badge">PREMIUM</span>}</h3>
              </div>
              <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
            <div className="cb-card-preview-row">
              <div className="cb-mini-rings">
                {[
                  { label: 'P', pct: nutPct('protein'), color: '#14b8a6' },
                  { label: 'C', pct: nutPct('carbs'), color: 'var(--color-primary)' },
                  { label: 'F', pct: nutPct('fats'), color: '#eab308' },
                  { label: 'Cal', pct: nutPct('calories'), color: '#38B6FF' },
                ].map((ring) => {
                  const r = 38;
                  const circ = 2 * Math.PI * r;
                  const off = circ - (ring.pct / 100) * circ;
                  return (
                    <div key={ring.label} className="cb-mini-ring">
                      <svg viewBox="0 0 100 100">
                        <circle className="cb-mini-track" cx="50" cy="50" r={r} />
                        <circle className="cb-mini-fill" cx="50" cy="50" r={r}
                          style={{ stroke: ring.color }}
                          strokeDasharray={circ}
                          strokeDashoffset={off} />
                      </svg>
                      <span style={{ color: ring.color }}>{ring.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="cb-card-desc">Track macros, scan barcodes, log water</p>
          </button>

          {/* 2. Workouts */}
          <button
            className="cb-feature-card cb-card-workouts-hero ripple-btn"
            onClick={(e) => { createRipple(e); navigate('/client/core-buddy/workouts'); }}
          >
            <h3 className="cb-hero-title">Workouts</h3>
            <div className="cb-hero-stats">
              <span>{weeklyWorkouts} this week</span>
              <span className="cb-hero-dot">&middot;</span>
              <span>{totalWorkouts} total</span>
            </div>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* 3 & 4. Habits + PBs — 2-column grid */}
          <div className="cb-grid-row">
            <button
              className={`cb-feature-card cb-grid-card cb-card-consistency ripple-btn${!isPremium ? ' cb-card-locked' : ''}`}
              onClick={(e) => { createRipple(e); navigate(isPremium ? '/client/core-buddy/consistency' : '/upgrade'); }}
            >
              <div className="cb-card-content">
                <h3>Habits {!isPremium && <span className="cb-premium-badge">PREMIUM</span>}</h3>
                <div className="cb-habit-dots">
                  {Array.from({ length: HABIT_COUNT }, (_, i) => (
                    <span key={i} className={`cb-habit-dot${i < todayHabitsCount ? ' done' : ''}`} />
                  ))}
                </div>
                <span className="cb-habit-dots-label">{todayHabitsCount}/{HABIT_COUNT} today</span>
              </div>
              <svg className="cb-card-arrow cb-grid-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>

            <button
              className={`cb-feature-card cb-grid-card cb-card-progress ripple-btn${!isPremium ? ' cb-card-locked' : ''}`}
              onClick={(e) => { createRipple(e); navigate(isPremium ? '/client/personal-bests?mode=corebuddy' : '/upgrade'); }}
            >
              <div className="cb-card-content">
                <h3>PBs {!isPremium && <span className="cb-premium-badge">PREMIUM</span>}</h3>
                {topPBs.length > 0 ? (
                  <div className="cb-pb-preview">
                    {topPBs.slice(0, 2).map((pb) => (
                      <div key={pb.name} className="cb-pb-entry">
                        <span className="cb-pb-name">{pb.name}</span>
                        <span className="cb-pb-value">{pb.weight}kg</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="cb-progress-preview">
                    <svg className="cb-progress-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    <span>Start lifting!</span>
                  </div>
                )}
              </div>
              <svg className="cb-card-arrow cb-grid-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>

          {/* 6. Leaderboard */}
          <button
            className={`cb-feature-card cb-card-leaderboard ripple-btn${!isPremium ? ' cb-card-locked' : ''}`}
            onClick={(e) => { createRipple(e); navigate(isPremium ? '/client/leaderboard' : '/upgrade'); }}
          >
            <div className="cb-card-content">
              <h3>Leaderboard {!isPremium && <span className="cb-premium-badge">PREMIUM</span>}</h3>
              {leaderboardTop3.length > 0 ? (
                <div className="cb-lb-preview">
                  {leaderboardTop3.map((entry, idx) => {
                    const medal = ['#FFD700', '#A8B4C0', '#CD7F32'][idx];
                    const initials = entry.name ? entry.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
                    const isMe = entry.id === clientData?.id;
                    return (
                      <div key={entry.id} className={`cb-lb-entry${isMe ? ' cb-lb-me' : ''}`}>
                        <div className="cb-lb-avatar" style={{ borderColor: medal }}>
                          {entry.photoURL ? <img src={entry.photoURL} alt="" className="cb-lb-avatar-img" /> : <span>{initials}</span>}
                        </div>
                        <span className="cb-lb-rank" style={{ color: medal }}>#{idx + 1}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p>Opt in to compete with your Core Buddies</p>
              )}
            </div>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* 7. Buddies */}
          <button
            className={`cb-feature-card cb-card-buddies ripple-btn${!isPremium ? ' cb-card-locked' : ''}`}
            onClick={(e) => { createRipple(e); navigate(isPremium ? '/client/core-buddy/buddies' : '/upgrade'); }}
          >
            <div className="cb-card-content">
              <h3>Buddies {!isPremium && <span className="cb-premium-badge">PREMIUM</span>}</h3>
              <p>Connect with other members and track each other's progress</p>
            </div>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* 8. Achievements */}
          <div className={`cb-achievements-section${!isPremium ? ' cb-card-locked' : ''}`}>
            <h3 className="cb-achievements-title">Achievements {!isPremium && <span className="cb-premium-badge">PREMIUM</span>}</h3>
            {isPremium ? (
              <>
                <div className="cb-badges-scroll">
                  {BADGE_DEFS.map((badge) => {
                    const isUnlocked = unlockedBadges.includes(badge.id);
                    return (
                      <button
                        key={badge.id}
                        className={`cb-badge${isUnlocked ? ' unlocked' : ' locked'}`}
                        onClick={() => setSelectedBadge(badge)}
                      >
                        <img src={badge.img} alt={badge.name} className="cb-badge-img" />
                      </button>
                    );
                  })}
                </div>
                <p className="cb-badges-count">{unlockedBadges.length}/{BADGE_DEFS.length} unlocked</p>
              </>
            ) : (
              <button className="cb-upgrade-teaser" onClick={() => navigate('/upgrade')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>Upgrade to unlock achievements</span>
              </button>
            )}
          </div>

          {/* My Journey */}
          <div className="cb-journey-section">
            <h3 className="cb-journey-title">My Journey {!isPremium && <span className="cb-premium-badge">PREMIUM</span>}</h3>

            {!isPremium ? (
              <button className="cb-upgrade-teaser" onClick={() => navigate('/upgrade')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>Upgrade to share your journey</span>
              </button>
            ) : (
            <>
            {/* Compose */}
            <div className="journey-compose">
              <div className="journey-compose-avatar">
                {photoURL ? (
                  <img src={photoURL} alt="" />
                ) : (
                  <span>{getInitials(clientData?.name)}</span>
                )}
              </div>
              <div className="journey-compose-body" style={{ position: 'relative' }}>
                <textarea
                  ref={journeyTextRef}
                  placeholder="Share your progress... (use @ to mention)"
                  value={journeyText}
                  onChange={handleJourneyTextInput}
                  rows={1}
                  maxLength={500}
                />
                {mentionActive && mentionTarget === 'compose' && mentionResults.length > 0 && (
                  <div className="mention-dropdown">
                    {mentionResults.map(c => (
                      <button key={c.id} className="mention-option" onClick={() => insertMention(c, 'compose')}>
                        <div className="mention-option-avatar">
                          {c.photoURL ? <img src={c.photoURL} alt="" /> : <span>{getInitials(c.name)}</span>}
                        </div>
                        <span>{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {journeyImagePreview && (
                  <div className="journey-image-preview">
                    <img src={journeyImagePreview} alt="Preview" />
                    <button className="journey-image-remove" onClick={clearJourneyImage} aria-label="Remove image">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
                    </button>
                  </div>
                )}
                <div className="journey-compose-actions">
                  <button className="journey-image-btn" onClick={() => journeyFileRef.current?.click()} aria-label="Add image">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                  </button>
                  <input ref={journeyFileRef} type="file" accept="image/*" onChange={handleJourneyImageSelect} hidden />
                  {(journeyText.trim() || journeyImage) && (
                    <button className="journey-post-btn" onClick={handleJourneyPost} disabled={journeyPosting}>
                      {journeyPosting ? <div className="journey-btn-spinner" /> : 'Post'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Posts */}
            {journeyLoading ? (
              <div className="journey-loading"><div className="cb-spinner" /></div>
            ) : journeyPosts.length === 0 ? (
              <div className="journey-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
                </svg>
                <p>Start sharing your fitness journey!</p>
              </div>
            ) : (
              <div className="journey-list">
                {journeyPosts.map(post => (
                  <div key={post.id} id={`post-${post.id}`} className="journey-post">
                    <div className="journey-post-header">
                      <div className="journey-post-avatar">
                        {post.authorPhotoURL ? (
                          <img src={post.authorPhotoURL} alt="" />
                        ) : (
                          <span>{getInitials(post.authorName)}</span>
                        )}
                      </div>
                      <div className="journey-post-meta">
                        <span className="journey-post-name">{post.authorName}</span>
                        <span className="journey-post-time">{timeAgo(post.createdAt)}</span>
                      </div>
                      <button className="journey-delete-btn" onClick={() => deleteJourneyPost(post.id)} aria-label="Delete post">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>

                    {post.content && <p className="journey-post-content">{renderWithMentions(post.content)}</p>}

                    {post.imageURL && (
                      <div className="journey-post-image">
                        <img src={post.imageURL} alt="Post" loading="lazy" />
                      </div>
                    )}

                    <div className="journey-post-actions">
                      <button className={`journey-action-btn${likedPosts.has(post.id) ? ' liked' : ''}`} onClick={() => toggleJourneyLike(post.id)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill={likedPosts.has(post.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                        <span>{post.likeCount || 0}</span>
                      </button>
                      <button className={`journey-action-btn${expandedComments.has(post.id) ? ' active' : ''}`} onClick={() => toggleJourneyComments(post.id)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span>{post.commentCount || 0}</span>
                      </button>
                    </div>

                    {expandedComments.has(post.id) && (
                      <div className="journey-comments">
                        {comments[post.id]?.length > 0 ? (
                          comments[post.id].map(c => (
                            <div key={c.id} className="journey-comment">
                              <div className="journey-comment-avatar">
                                {c.authorPhotoURL ? <img src={c.authorPhotoURL} alt="" /> : <span>{getInitials(c.authorName)}</span>}
                              </div>
                              <div className="journey-comment-body">
                                <div className="journey-comment-bubble">
                                  <span className="journey-comment-name">{c.authorName}</span>
                                  {c.replyToName && (
                                    <span className="journey-comment-reply-tag">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                                      {c.replyToName}
                                    </span>
                                  )}
                                  {c.content && <span className="journey-comment-text">{renderWithMentions(c.content)}</span>}
                                  {c.imageURL && (
                                    <img className="journey-comment-image" src={c.imageURL} alt="Comment" loading="lazy" />
                                  )}
                                </div>
                                <div className="journey-comment-actions-row">
                                  <span className="journey-comment-time">{timeAgo(c.createdAt)}</span>
                                  <button className="journey-comment-reply-btn" onClick={() => setReplyTo(prev => ({ ...prev, [post.id]: { id: c.id, authorName: c.authorName } }))}>Reply</button>
                                  <button className="journey-comment-delete-btn" onClick={() => deleteJourneyComment(post.id, c.id)} aria-label="Delete comment">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="journey-no-comments">No comments yet</p>
                        )}

                        {/* Reply indicator */}
                        {replyTo[post.id] && (
                          <div className="journey-comment-replying">
                            <span>Replying to <strong>{replyTo[post.id].authorName}</strong></span>
                            <button onClick={() => setReplyTo(prev => ({ ...prev, [post.id]: null }))} aria-label="Cancel reply">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                            </button>
                          </div>
                        )}

                        {/* Comment image preview */}
                        {commentImagePreview[post.id] && (
                          <div className="journey-comment-img-preview">
                            <img src={commentImagePreview[post.id]} alt="Preview" />
                            <button onClick={() => clearCommentImage(post.id)} aria-label="Remove image">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                            </button>
                          </div>
                        )}

                        <div className="journey-comment-input" style={{ position: 'relative' }}>
                          <button className="journey-comment-img-btn" onClick={() => commentFileRefs.current[post.id]?.click()} aria-label="Add image">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                          </button>
                          <input
                            ref={el => { commentFileRefs.current[post.id] = el; }}
                            type="file" accept="image/*"
                            onChange={e => handleCommentImageSelect(post.id, e)}
                            hidden
                          />
                          <input
                            type="text"
                            placeholder="Comment"
                            value={commentText[post.id] || ''}
                            onChange={e => handleCommentInputChange(post.id, e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleJourneyComment(post.id); }}
                            maxLength={300}
                          />
                          {mentionActive && mentionTarget === post.id && mentionResults.length > 0 && (
                            <div className="mention-dropdown mention-dropdown-up">
                              {mentionResults.map(c => (
                                <button key={c.id} className="mention-option" onClick={() => insertMention(c, post.id)}>
                                  <div className="mention-option-avatar">
                                    {c.photoURL ? <img src={c.photoURL} alt="" /> : <span>{getInitials(c.name)}</span>}
                                  </div>
                                  <span>{c.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <button onClick={() => handleJourneyComment(post.id)} disabled={!(commentText[post.id] || '').trim() && !commentImage[post.id] || commentLoading[post.id]}>
                            {commentLoading[post.id] ? (
                              <div className="journey-btn-spinner-sm" />
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            </>
            )}
          </div>

        </div>
      </main>

      {/* Badge fullscreen overlay — outside cb-features to avoid re-triggering stagger animations */}
      {selectedBadge && (
        <div className="cb-badge-overlay" onClick={() => setSelectedBadge(null)}>
          <div className="cb-badge-overlay-content" onClick={e => e.stopPropagation()}>
            <img
              src={selectedBadge.img}
              alt={selectedBadge.name}
              className={`cb-badge-overlay-img${!unlockedBadges.includes(selectedBadge.id) ? ' cb-badge-overlay-img-locked' : ''}`}
            />
            {unlockedBadges.includes(selectedBadge.id) ? (
              <span className="cb-badge-status unlocked">Unlocked</span>
            ) : (
              <span className="cb-badge-status locked">Locked</span>
            )}
            <button className="cb-badge-overlay-close" onClick={() => setSelectedBadge(null)}>Tap to close</button>
          </div>
        </div>
      )}

      {/* Core Buddy Bottom Nav */}
      <CoreBuddyNav active="home" />

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.type === 'info' && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          )}
          {toast.message}
        </div>
      )}

      {/* Guided tour for new users */}
      <SpotlightTour steps={tourSteps} active={showTour} onFinish={handleTourFinish} />

      {/* Badge unlock celebration */}
      {celebrationBadge && (
        <div className="cb-celebration-overlay" onClick={() => setCelebrationBadge(null)}>
          <div className="cb-confetti-container">
            {Array.from({ length: 30 }, (_, i) => (
              <span key={i} className="cb-confetti-piece" style={{
                '--angle': `${Math.random() * 360}deg`,
                '--distance': `${80 + Math.random() * 120}px`,
                '--delay': `${Math.random() * 0.3}s`,
                '--color': ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#F7DC6F', '#BB8FCE', '#FF8C42', '#38B6FF'][i % 8],
                '--size': `${6 + Math.random() * 6}px`,
                '--drift': `${(Math.random() - 0.5) * 60}px`,
              }} />
            ))}
          </div>
          <div className="cb-celebration-content" onClick={e => e.stopPropagation()}>
            <div className="cb-celebration-glow" />
            <img src={celebrationBadge.img} alt={celebrationBadge.name} className="cb-celebration-badge-img" />
            <h2 className="cb-celebration-title">Badge Unlocked!</h2>
            <p className="cb-celebration-name">{celebrationBadge.name}</p>
            <button className="cb-celebration-dismiss" onClick={() => setCelebrationBadge(null)}>Tap to continue</button>
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
