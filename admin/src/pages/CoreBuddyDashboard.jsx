import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CoreBuddyDashboard.css';
import CoreBuddyNav from '../components/CoreBuddyNav';
import { TICKS_85_96 } from '../utils/ringTicks';

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

// SVG badge icons (stroke-based, 24x24 viewBox)
const BADGE_ICONS = {
  first_workout: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 12h12"/><rect x="3" y="7" width="6" height="10" rx="1"/><rect x="15" y="7" width="6" height="10" rx="1"/></svg>,
  workouts_10: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c1 3 4 5.5 4 8.5a4 4 0 1 1-8 0C8 7.5 11 5 12 2z"/><path d="M12 14v4"/><path d="M10 18h4"/></svg>,
  workouts_25: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  workouts_50: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4"/><path d="M16 12h4"/><path d="M12 4v4"/><path d="M12 16v4"/><circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z"/></svg>,
  workouts_100: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z"/><circle cx="12" cy="12" r="3"/></svg>,
  streak_2: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M9 16l2 2 4-4"/></svg>,
  streak_4: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M8 16h8"/><path d="M12 14v4"/></svg>,
  streak_8: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2c-1.5 3-5 5-5 9a7 7 0 0 0 14 0c0-4-3.5-6-5-9"/><path d="M12 18c-2 0-3-1.5-3-3 0-2 1.5-3 3-5 1.5 2 3 3 3 5 0 1.5-1 3-3 3z"/></svg>,
  programme_done: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M10 22V8a4 4 0 0 0-4-4H8a4 4 0 0 0 4 4h0a4 4 0 0 0 4-4h2a4 4 0 0 0-4 4v14"/><path d="M9 12l2 2 4-4"/></svg>,
  habits_7: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>,
  nutrition_7: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a5 5 0 0 1 5 5c0 2-1.5 3.5-3 4.5V20a2 2 0 0 1-4 0v-8.5C8.5 10.5 7 9 7 7a5 5 0 0 1 5-5z"/><path d="M9 7h6"/></svg>,
  first_pb: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M12 14v8"/><path d="M9 18l3 3 3-3"/><path d="M10 6l2 2 2-2"/></svg>,
  pbs_5: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18"/><path d="M5 20V10l4-6"/><path d="M9 20V4"/><path d="M13 20V10l4-6"/><path d="M17 20V4"/><path d="M21 20V10"/></svg>,
  leaderboard_join: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
};

// Achievement badge definitions
const BADGE_DEFS = [
  // Workout milestones
  { id: 'first_workout', icon: BADGE_ICONS.first_workout, name: 'First Rep', desc: 'Complete your first workout', category: 'workouts' },
  { id: 'workouts_10', icon: BADGE_ICONS.workouts_10, name: 'On Fire', desc: 'Complete 10 workouts', category: 'workouts' },
  { id: 'workouts_25', icon: BADGE_ICONS.workouts_25, name: 'Lightning', desc: 'Complete 25 workouts', category: 'workouts' },
  { id: 'workouts_50', icon: BADGE_ICONS.workouts_50, name: 'Iron Will', desc: 'Complete 50 workouts', category: 'workouts' },
  { id: 'workouts_100', icon: BADGE_ICONS.workouts_100, name: 'Century Club', desc: 'Complete 100 workouts', category: 'workouts' },
  // Streak
  { id: 'streak_2', icon: BADGE_ICONS.streak_2, name: '2 Week Warrior', desc: '2-week workout streak', category: 'streak' },
  { id: 'streak_4', icon: BADGE_ICONS.streak_4, name: 'Month Strong', desc: '4-week workout streak', category: 'streak' },
  { id: 'streak_8', icon: BADGE_ICONS.streak_8, name: 'Unbreakable', desc: '8-week workout streak', category: 'streak' },
  // Programme
  { id: 'programme_done', icon: BADGE_ICONS.programme_done, name: 'Finisher', desc: 'Complete a programme', category: 'programme' },
  // Habits
  { id: 'habits_7', icon: BADGE_ICONS.habits_7, name: 'Habit Machine', desc: '7-day perfect habit streak', category: 'habits' },
  // Nutrition
  { id: 'nutrition_7', icon: BADGE_ICONS.nutrition_7, name: 'Fuel Master', desc: 'Log nutrition 7 days in a row', category: 'nutrition' },
  // PBs
  { id: 'first_pb', icon: BADGE_ICONS.first_pb, name: 'Record Breaker', desc: 'Set your first PB', category: 'pbs' },
  { id: 'pbs_5', icon: BADGE_ICONS.pbs_5, name: 'Climbing', desc: 'Set 5 personal bests', category: 'pbs' },
  // Social
  { id: 'leaderboard_join', icon: BADGE_ICONS.leaderboard_join, name: 'Competitor', desc: 'Join the leaderboard', category: 'social' },
];

export default function CoreBuddyDashboard() {
  const { currentUser, isClient, clientData, logout, updateClientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
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

  // Auth guard
  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate('/');
    }
  }, [authLoading, currentUser, navigate]);

  // Load profile photo from client data
  useEffect(() => {
    if (clientData?.photoURL) {
      setPhotoURL(clientData.photoURL);
    }
  }, [clientData]);

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

        // 2. Total randomiser workouts
        const logsRef = collection(db, 'workoutLogs');
        const q = query(logsRef, where('clientId', '==', clientData.id));
        logsSnap = await getDocs(q);
        const randomiserCount = logsSnap.docs.filter(d => d.data().type !== 'programme').length;
        setTotalWorkouts(randomiserCount);
        // Weekly workout count (Mon-Sun)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - mondayOffset);
        monday.setHours(0, 0, 0, 0);
        const mondayStr = formatDate(monday);
        const weekCount = logsSnap.docs.filter(d => (d.data().date || '') >= mondayStr).length;
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
        const optedIn = clientsSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
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

        // Nutrition streak (consecutive days with at least 1 entry, up to 30 days back)
        let nStreak = 0;
        for (let d = 0; d < 30; d++) {
          const checkDate = new Date();
          checkDate.setDate(checkDate.getDate() - d);
          const dStr = formatDate(checkDate);
          try {
            const nSnap = await getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${dStr}`));
            if (nSnap.exists() && (nSnap.data().entries || []).length > 0) { nStreak++; }
            else break;
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
        if (wkStreak >= 2) addBadge('streak_2');
        if (wkStreak >= 4) addBadge('streak_4');
        if (wkStreak >= 8) addBadge('streak_8');
        if (localProgrammeComplete) addBadge('programme_done');
        if (hStreak >= 7) addBadge('habits_7');
        if (nStreak >= 7) addBadge('nutrition_7');
        if (localPbCount > 0 || localPbList.length > 0) addBadge('first_pb');
        if (localPbCount >= 5) addBadge('pbs_5');
        if (clientData.leaderboardOptIn) addBadge('leaderboard_join');

        setUnlockedBadges(unlocked);

        // Persist to Firestore (fire and forget)
        const badgeMap = {};
        unlocked.forEach(id => { badgeMap[id] = { unlockedAt: new Date().toISOString() }; });
        setDoc(doc(db, 'achievements', clientData.id), { badges: badgeMap, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
      } catch (achErr) {
        console.error('Achievement computation error:', achErr);
      }

      setStatsLoaded(true);
    };
    loadStats();
  }, [currentUser, clientData]);

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

  return (
    <div className="cb-dashboard" data-theme={isDark ? 'dark' : 'light'}>
      {/* Header */}
      <header className="client-header">
        <div className="header-content">
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
            className="cb-feature-card cb-card-nutrition cb-card-has-preview ripple-btn"
            onClick={(e) => { createRipple(e); navigate('/client/core-buddy/nutrition'); }}
          >
            <div className="cb-card-top-row">
              <div className="cb-card-content">
                <h3>Today's Nutrition</h3>
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
              className="cb-feature-card cb-grid-card cb-card-consistency ripple-btn"
              onClick={(e) => { createRipple(e); navigate('/client/core-buddy/consistency'); }}
            >
              <div className="cb-card-content">
                <h3>Habits</h3>
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
              className="cb-feature-card cb-grid-card cb-card-progress ripple-btn"
              onClick={(e) => { createRipple(e); navigate('/client/personal-bests?mode=corebuddy'); }}
            >
              <div className="cb-card-content">
                <h3>PBs</h3>
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
            className="cb-feature-card cb-card-leaderboard ripple-btn"
            onClick={(e) => { createRipple(e); navigate('/client/leaderboard'); }}
          >
            <div className="cb-card-content">
              <h3>Leaderboard</h3>
              {leaderboardTop3.length > 0 ? (
                <div className="cb-lb-preview">
                  {leaderboardTop3.map((entry, idx) => {
                    const medal = ['#FFD700', '#A8B4C0', '#CD7F32'][idx];
                    const initials = entry.name ? entry.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
                    const isMe = entry.id === clientData?.id;
                    return (
                      <div key={entry.id} className={`cb-lb-entry${isMe ? ' cb-lb-me' : ''}`}>
                        <div className="cb-lb-avatar" style={{ borderColor: medal }}>
                          <span>{initials}</span>
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
            className="cb-feature-card cb-card-buddies ripple-btn"
            onClick={(e) => { createRipple(e); navigate('/client/core-buddy/buddies'); }}
          >
            <div className="cb-card-content">
              <h3>Buddies</h3>
              <p>Connect with other members and track each other's progress</p>
            </div>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* 8. Achievements */}
          <div className="cb-achievements-section">
            <h3 className="cb-achievements-title">Achievements</h3>
            <div className="cb-badges-scroll">
              {BADGE_DEFS.map((badge) => {
                const isUnlocked = unlockedBadges.includes(badge.id);
                return (
                  <button
                    key={badge.id}
                    className={`cb-badge${isUnlocked ? ' unlocked' : ' locked'}`}
                    onClick={() => setSelectedBadge(selectedBadge?.id === badge.id ? null : badge)}
                  >
                    <span className="cb-badge-icon">{badge.icon}</span>
                    <span className="cb-badge-name">{badge.name}</span>
                  </button>
                );
              })}
            </div>
            {selectedBadge && (
              <div className="cb-badge-detail">
                <span className="cb-badge-detail-icon">{selectedBadge.icon}</span>
                <div className="cb-badge-detail-info">
                  <strong>{selectedBadge.name}</strong>
                  <span>{selectedBadge.desc}</span>
                  {unlockedBadges.includes(selectedBadge.id) ? (
                    <span className="cb-badge-status unlocked">Unlocked</span>
                  ) : (
                    <span className="cb-badge-status locked">Locked</span>
                  )}
                </div>
              </div>
            )}
            <p className="cb-badges-count">{unlockedBadges.length}/{BADGE_DEFS.length} unlocked</p>
          </div>

        </div>
      </main>

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
    </div>
  );
}
