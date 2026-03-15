import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, doc, getDoc, setDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';
import HabitSpiderChart from '../components/HabitSpiderChart';
import CoreBuddyNav from '../components/CoreBuddyNav';
import './CoreBuddyCharts.css';

const DEFAULT_HABITS = [
  { key: 'trained', label: 'Trained' },
  { key: 'protein', label: 'Hit Protein' },
  { key: 'steps', label: '10k Steps' },
  { key: 'sleep', label: '8hrs Sleep' },
  { key: 'water', label: '2L Water' },
];

const BODY_METRICS = [
  { key: 'chest', name: 'Chest' },
  { key: 'waist', name: 'Waist' },
  { key: 'hips', name: 'Hips' },
  { key: 'leftArm', name: 'L. Arm' },
  { key: 'rightArm', name: 'R. Arm' },
  { key: 'leftThigh', name: 'L. Thigh' },
  { key: 'rightThigh', name: 'R. Thigh' },
  { key: 'leftCalf', name: 'L. Calf' },
  { key: 'rightCalf', name: 'R. Calf' },
];

const MACRO_TABS = [
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fats', label: 'Fats', unit: 'g' },
  { key: 'calories', label: 'Calories', unit: 'kcal' },
];

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function shortDateLabel(date) {
  return `${date.getDate()} ${shortMonths[date.getMonth()]}`;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function shortDay(dateStr) {
  const d = new Date(dateStr);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

function shortDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Get the date range for a given period + offset
function getDateRange(period, offset) {
  const now = new Date();
  if (period === 'weekly') {
    const monday = getMonday(now);
    monday.setDate(monday.getDate() - (offset * 7));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { start: monday, end: sunday };
  } else {
    // Monthly: go back `offset` months from current month
    const year = now.getFullYear();
    const month = now.getMonth() - offset;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0); // last day of month
    return { start, end };
  }
}

function formatNavLabel(period, range) {
  const { start, end } = range;
  if (period === 'weekly') {
    return `${shortDateLabel(start)} - ${shortDateLabel(end)}`;
  } else {
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
  }
}

export default function CoreBuddyCharts() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Global period toggle
  const [period, setPeriod] = useState('weekly'); // 'weekly' | 'monthly'
  const [offset, setOffset] = useState(0); // 0 = current week/month, 1 = previous, etc.

  // Chart data states
  const [activityData, setActivityData] = useState([]);
  const [volumeData, setVolumeData] = useState([]);
  const [minutesData, setMinutesData] = useState([]);
  const [macroData, setMacroData] = useState([]);
  const [macroTarget, setMacroTarget] = useState(null);
  const [selectedMacro, setSelectedMacro] = useState('protein');
  const [bodyMetricsData, setBodyMetricsData] = useState([]);
  const [bodyMetricTargets, setBodyMetricTargets] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState('chest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Weekly summary overlay
  const [showWeeklySummary, setShowWeeklySummary] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryAdvice, setSummaryAdvice] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

  // Reset offset when period changes
  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    setOffset(0);
  };

  // Navigation date range
  const dateRange = getDateRange(period, offset);
  const navLabel = formatNavLabel(period, dateRange);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load all chart data
  const loadData = useCallback(async () => {
    if (!clientData?.id) return;
    setLoading(true);
    setError(null);

    try {
      const isMonthly = period === 'monthly';
      const range = getDateRange(period, offset);
      const rangeStartStr = formatDate(range.start);
      // End is inclusive, so add 1 day for < comparison
      const rangeEndDate = new Date(range.end);
      rangeEndDate.setDate(rangeEndDate.getDate() + 1);
      const rangeEndStr = formatDate(rangeEndDate);

      // Parallel data fetches
      const [activitySnap, workoutSnap, nutritionTargetSnap] = await Promise.all([
        getDocs(query(collection(db, 'activityLogs'), where('clientId', '==', clientData.id))),
        getDocs(query(collection(db, 'workoutLogs'), where('clientId', '==', clientData.id))),
        getDoc(doc(db, 'nutritionTargets', clientData.id)),
      ]);

      // Set nutrition targets
      if (nutritionTargetSnap.exists()) {
        setMacroTarget(nutritionTargetSnap.data());
      }

      const activityDocs = activitySnap.docs.map(d => d.data());
      const workoutDocs = workoutSnap.docs.map(d => {
        const data = d.data();
        if (!data.date && data.completedAt) {
          const ts = data.completedAt.toDate ? data.completedAt.toDate() : new Date(data.completedAt);
          data.date = ts.toISOString().split('T')[0];
        }
        return data;
      });

      // --- Activity & Sessions ---
      {
        if (isMonthly) {
          // Weekly bars for the selected month
          const firstMonday = getMonday(range.start);
          const weekData = [];
          let monday = new Date(firstMonday);
          while (monday <= range.end) {
            const mondayStr = formatDate(monday);
            const nextMon = new Date(monday);
            nextMon.setDate(nextMon.getDate() + 7);
            const nextMonStr = formatDate(nextMon);

            const sessions = activityDocs.filter(a => a.date >= mondayStr && a.date < nextMonStr && a.date >= rangeStartStr && a.date < rangeEndStr).length
              + workoutDocs.filter(d => d.date >= mondayStr && d.date < nextMonStr && d.date >= rangeStartStr && d.date < rangeEndStr).length;
            const totalDuration = activityDocs
              .filter(a => a.date >= mondayStr && a.date < nextMonStr && a.date >= rangeStartStr && a.date < rangeEndStr)
              .reduce((sum, a) => sum + (a.duration || 0), 0)
              + workoutDocs
                .filter(d => d.date >= mondayStr && d.date < nextMonStr && d.date >= rangeStartStr && d.date < rangeEndStr)
                .reduce((sum, d) => sum + (d.duration || 0), 0);

            weekData.push({ label: shortDateLabel(monday), sessions, duration: totalDuration });
            monday = nextMon;
          }
          setActivityData(weekData);
        } else {
          // Daily for the selected week
          const monday = getMonday(range.start);
          const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
          const dayData = [];
          for (let d = 0; d < 7; d++) {
            const day = new Date(monday);
            day.setDate(monday.getDate() + d);
            const dayStr = formatDate(day);
            const sessions = activityDocs.filter(a => a.date === dayStr).length
              + workoutDocs.filter(doc => doc.date === dayStr).length;
            const duration = activityDocs.filter(a => a.date === dayStr).reduce((sum, a) => sum + (a.duration || 0), 0)
              + workoutDocs.filter(doc => doc.date === dayStr).reduce((sum, doc) => sum + (doc.duration || 0), 0);
            dayData.push({ label: dayNames[d], sessions, duration });
          }
          setActivityData(dayData);
        }
      }

      // --- Training Volume (BYO workouts only) ---
      {
        if (isMonthly) {
          const firstMonday = getMonday(range.start);
          const volData = [];
          let monday = new Date(firstMonday);
          while (monday <= range.end) {
            const mondayStr = formatDate(monday);
            const nextMon = new Date(monday);
            nextMon.setDate(nextMon.getDate() + 7);
            const nextMonStr = formatDate(nextMon);

            const weekWorkouts = workoutDocs.filter(
              d => d.type === 'custom_sets' && d.date >= mondayStr && d.date < nextMonStr && d.date >= rangeStartStr && d.date < rangeEndStr
            );
            let totalVol = 0;
            weekWorkouts.forEach(d => {
              (d.exercises || []).forEach(ex => {
                (ex.sets || []).forEach(s => {
                  totalVol += (parseInt(s.reps) || 0) * (parseFloat(s.weight) || 0);
                });
              });
            });
            volData.push({ label: shortDateLabel(monday), volume: Math.round(totalVol) });
            monday = nextMon;
          }
          setVolumeData(volData);
        } else {
          const monday = getMonday(range.start);
          const volData = [];
          for (let d = 0; d < 7; d++) {
            const day = new Date(monday);
            day.setDate(monday.getDate() + d);
            const dayStr = formatDate(day);
            const dayWorkouts = workoutDocs.filter(doc => doc.type === 'custom_sets' && doc.date === dayStr);
            let dayVol = 0;
            dayWorkouts.forEach(doc => {
              (doc.exercises || []).forEach(ex => {
                (ex.sets || []).forEach(s => {
                  dayVol += (parseInt(s.reps) || 0) * (parseFloat(s.weight) || 0);
                });
              });
            });
            volData.push({ label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d], volume: Math.round(dayVol) });
          }
          setVolumeData(volData);
        }
      }

      // --- Minutes Trained ---
      {
        if (isMonthly) {
          const firstMonday = getMonday(range.start);
          const minData = [];
          let monday = new Date(firstMonday);
          while (monday <= range.end) {
            const mondayStr = formatDate(monday);
            const nextMon = new Date(monday);
            nextMon.setDate(nextMon.getDate() + 7);
            const nextMonStr = formatDate(nextMon);

            const totalMin = activityDocs
              .filter(a => a.date >= mondayStr && a.date < nextMonStr && a.date >= rangeStartStr && a.date < rangeEndStr)
              .reduce((sum, a) => sum + (a.duration || 0), 0)
              + workoutDocs
                .filter(d => d.date >= mondayStr && d.date < nextMonStr && d.date >= rangeStartStr && d.date < rangeEndStr)
                .reduce((sum, d) => sum + (d.duration || 0), 0);

            minData.push({ label: shortDateLabel(monday), minutes: totalMin });
            monday = nextMon;
          }
          setMinutesData(minData);
        } else {
          const monday = getMonday(range.start);
          const minData = [];
          for (let d = 0; d < 7; d++) {
            const day = new Date(monday);
            day.setDate(monday.getDate() + d);
            const dayStr = formatDate(day);
            const totalMin = activityDocs.filter(a => a.date === dayStr).reduce((sum, a) => sum + (a.duration || 0), 0)
              + workoutDocs.filter(doc => doc.date === dayStr).reduce((sum, doc) => sum + (doc.duration || 0), 0);
            minData.push({ label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d], minutes: totalMin });
          }
          setMinutesData(minData);
        }
      }

      // --- Macro Trends ---
      {
        const macData = [];
        const current = new Date(range.start);
        while (current <= range.end) {
          const dayStr = formatDate(current);
          try {
            const logSnap = await getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${dayStr}`));
            if (logSnap.exists()) {
              const entries = logSnap.data().entries || [];
              const totals = entries.reduce((acc, e) => ({
                protein: acc.protein + (e.protein || 0),
                carbs: acc.carbs + (e.carbs || 0),
                fats: acc.fats + (e.fats || 0),
                calories: acc.calories + (e.calories || 0),
              }), { protein: 0, carbs: 0, fats: 0, calories: 0 });
              macData.push({ label: isMonthly ? shortDate(dayStr) : shortDay(dayStr), date: dayStr, ...totals });
            } else {
              macData.push({ label: isMonthly ? shortDate(dayStr) : shortDay(dayStr), date: dayStr, protein: 0, carbs: 0, fats: 0, calories: 0 });
            }
          } catch {
            macData.push({ label: isMonthly ? shortDate(dayStr) : shortDay(dayStr), date: dayStr, protein: 0, carbs: 0, fats: 0, calories: 0 });
          }
          current.setDate(current.getDate() + 1);
        }
        setMacroData(macData);
      }

      // --- Body Metrics (load all records) ---
      {
        const [metricsSnap, targetsSnap] = await Promise.all([
          getDocs(query(collection(db, 'coreBuddyMetrics'), where('clientId', '==', clientData.id))),
          getDoc(doc(db, 'coreBuddyMetricTargets', clientData.id)),
        ]);

        if (targetsSnap.exists()) {
          setBodyMetricTargets(targetsSnap.data());
        }

        const records = metricsSnap.docs
          .map(d => d.data())
          .sort((a, b) => (a.period || '').localeCompare(b.period || ''));

        const bmData = records.map(r => {
          const entry = { label: shortDate(r.period), date: r.period };
          BODY_METRICS.forEach(m => {
            entry[m.key] = r.measurements?.[m.key] || null;
          });
          return entry;
        });
        setBodyMetricsData(bmData);
      }

    } catch (err) {
      console.error('Error loading charts data:', err);
      setError('Failed to load chart data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [clientData?.id, period, offset]);

  useEffect(() => { loadData(); }, [loadData]);

  // Rule-based advice generation
  const generateAdvice = (data) => {
    const tips = [];

    if (data.totalSessions === 0) {
      tips.push('No sessions logged this week. Try to get at least 2-3 sessions in next week to build momentum.');
    } else if (data.sessionDiff < -20 && data.prevSessions > 0) {
      tips.push(`Sessions dropped ${Math.abs(data.sessionDiff)}% from last week. Aim to match or beat ${data.prevSessions} sessions next week.`);
    } else if (data.sessionDiff > 20) {
      tips.push(`Great progress — sessions up ${data.sessionDiff}% from last week! Keep this momentum going.`);
    } else if (data.totalSessions >= 4) {
      tips.push('Solid session count this week. Consistency is key — keep it up.');
    }

    if (data.totalMinutes > 0 && data.minutesDiff < -20 && data.minutesDiff !== 0) {
      tips.push('Training minutes dropped — try adding 10 minutes to each session next week.');
    } else if (data.totalMinutes > 200) {
      tips.push('Strong training volume. Make sure you are balancing intensity with recovery.');
    }

    if (data.habitPct >= 90) {
      tips.push('Outstanding habit consistency! You are building a strong foundation.');
    } else if (data.habitPct >= 70) {
      tips.push('Good habit compliance. Focus on the habits you missed to push towards 90%+.');
    } else if (data.habitPct < 50 && data.habitPct > 0) {
      tips.push('Habits need attention — try focusing on just 2-3 key habits next week and build from there.');
    }

    if (data.totalVolume > 0 && data.totalVolume < 5000) {
      tips.push('Consider progressively increasing your training volume by adding an extra set or small weight increase.');
    }

    if (tips.length === 0) {
      tips.push('Keep up the good work and stay consistent with your training and habits.');
    }

    return tips.join(' ');
  };

  // --- Weekly Summary ---
  const generateWeeklySummary = useCallback(async () => {
    if (!clientData?.id) return;
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryData(null);
    setShowWeeklySummary(true);

    try {
      const now = new Date();
      const monday = getMonday(now);
      const mondayStr = formatDate(monday);
      const cacheId = `${clientData.id}_${mondayStr}`;

      // Check Firestore cache first — only generate once per week
      const cacheSnap = await getDoc(doc(db, 'weeklySummaries', cacheId));
      if (cacheSnap.exists()) {
        const cached = cacheSnap.data();
        setSummaryData(cached.summaryData);
        setSummaryAdvice(cached.advice);
        setSummaryLoading(false);
        return;
      }

      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 7);
      const sundayStr = formatDate(sunday);

      // Fetch this week's data
      const [actSnap, wkSnap] = await Promise.all([
        getDocs(query(collection(db, 'activityLogs'), where('clientId', '==', clientData.id))),
        getDocs(query(collection(db, 'workoutLogs'), where('clientId', '==', clientData.id))),
      ]);

      const weekActivities = actSnap.docs.map(d => d.data()).filter(a => a.date >= mondayStr && a.date < sundayStr);
      const weekWorkouts = wkSnap.docs.map(d => d.data()).filter(w => w.date >= mondayStr && w.date < sundayStr);

      const totalSessions = weekActivities.length + weekWorkouts.length;
      const totalMinutes = weekActivities.reduce((sum, a) => sum + (a.duration || 0), 0);

      // BYO volume
      let totalVolume = 0;
      weekWorkouts.filter(w => w.type === 'custom_sets').forEach(w => {
        (w.exercises || []).forEach(ex => {
          (ex.sets || []).forEach(s => {
            totalVolume += (parseInt(s.reps) || 0) * (parseFloat(s.weight) || 0);
          });
        });
      });

      // Habit completion
      let habitsCompleted = 0;
      let habitsTotal = 0;
      const customDoc = await getDoc(doc(db, 'customHabits', clientData.id));
      let habitCount = 5;
      if (customDoc.exists()) {
        const data = customDoc.data();
        const hidden = data.hiddenDefaults?.length || 0;
        const custom = data.habits?.length || 0;
        habitCount = (5 - hidden) + custom;
      }

      for (let d = 0; d < 7; d++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + d);
        if (day > now) break;
        const dayStr = formatDate(day);
        habitsTotal += habitCount;
        try {
          const hSnap = await getDocs(query(collection(db, 'habitLogs'), where('clientId', '==', clientData.id), where('date', '==', dayStr)));
          if (!hSnap.empty) {
            const habits = hSnap.docs[0].data().habits || {};
            habitsCompleted += Object.values(habits).filter(Boolean).length;
          }
        } catch { /* skip */ }
      }

      const habitPct = habitsTotal > 0 ? Math.round((habitsCompleted / habitsTotal) * 100) : 0;

      // Previous week comparison
      const prevMonday = new Date(monday);
      prevMonday.setDate(prevMonday.getDate() - 7);
      const prevMondayStr = formatDate(prevMonday);
      const prevSunday = new Date(prevMonday);
      prevSunday.setDate(prevSunday.getDate() + 7);
      const prevSundayStr = formatDate(prevSunday);

      const prevSessions = actSnap.docs.map(d => d.data()).filter(a => a.date >= prevMondayStr && a.date < prevSundayStr).length
        + wkSnap.docs.map(d => d.data()).filter(w => w.date >= prevMondayStr && w.date < prevSundayStr).length;
      const prevMinutes = actSnap.docs.map(d => d.data())
        .filter(a => a.date >= prevMondayStr && a.date < prevSundayStr)
        .reduce((sum, a) => sum + (a.duration || 0), 0);

      const sessionDiff = prevSessions > 0 ? Math.round(((totalSessions - prevSessions) / prevSessions) * 100) : 0;
      const minutesDiff = prevMinutes > 0 ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100) : 0;

      const summary = {
        totalSessions,
        totalMinutes,
        totalVolume: Math.round(totalVolume),
        habitPct,
        sessionDiff,
        minutesDiff,
        prevSessions,
      };

      setSummaryData(summary);

      // Generate rule-based advice (will be replaced by Claude AI later)
      const advice = generateAdvice(summary);
      setSummaryAdvice(advice);

      // Cache to Firestore — won't regenerate until next week's Monday
      try {
        await setDoc(doc(db, 'weeklySummaries', cacheId), {
          clientId: clientData.id,
          weekStart: mondayStr,
          summaryData: summary,
          advice,
          generatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error('Failed to cache weekly summary:', e);
      }

    } catch (err) {
      console.error('Error generating weekly summary:', err);
      setSummaryError(err.message || 'Something went wrong');
    } finally {
      setSummaryLoading(false);
    }
  }, [clientData?.id]);


  if (authLoading || !clientData) {
    return <div className="cht-loading"><div className="cht-spinner" /></div>;
  }

  const primaryColor = isDark ? '#DA3F4F' : '#B8313D';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(55,55,55,0.7)';
  const tooltipBg = isDark ? '#1a1a1f' : '#fff';
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.1)' : '#e0e0e0';
  const tooltipColor = isDark ? '#fff' : '#373737';
  const barColor = primaryColor;
  const lineColor = isDark ? '#42A5F5' : '#1976d2';

  const tooltipStyle = {
    background: tooltipBg,
    border: `1px solid ${tooltipBorder}`,
    borderRadius: 10,
    fontFamily: 'Inter, sans-serif',
    fontSize: 12,
    color: tooltipColor,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  };

  const currentMacro = MACRO_TABS.find(m => m.key === selectedMacro);
  const macroTargetValue = macroTarget?.[selectedMacro] || null;
  const isMonthly = period === 'monthly';

  // Compute days in the current range for the habit spider chart
  const habitStartDate = formatDate(dateRange.start);
  const habitEndDate = formatDate(dateRange.end);

  return (
    <>
    <div className="cht-page">
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
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

      <main className="cht-main">
        <h1 className="cht-page-title">My Charts</h1>

        {/* Period Toggle */}
        <div className="cht-period-toggle">
          <button className={`cht-period-btn${period === 'weekly' ? ' active' : ''}`} onClick={() => handlePeriodChange('weekly')}>Weekly</button>
          <button className={`cht-period-btn${period === 'monthly' ? ' active' : ''}`} onClick={() => handlePeriodChange('monthly')}>Monthly</button>
        </div>

        {/* Date Navigation */}
        <div className="cht-date-nav">
          <button className="cht-date-nav-btn" onClick={() => setOffset(o => o + 1)} aria-label="Previous">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="cht-date-nav-label">{navLabel}</span>
          <button className="cht-date-nav-btn" onClick={() => setOffset(o => Math.max(0, o - 1))} disabled={offset === 0} aria-label="Next">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        {loading ? (
          <div className="cht-loading-inline"><div className="cht-spinner" /></div>
        ) : error ? (
          <div className="cht-empty-chart">
            <p>{error}</p>
            <button className="cht-empty-cta" onClick={loadData}>Retry</button>
          </div>
        ) : (
          <>
            {/* Weekly Summary Card */}
            <button className="cht-summary-card" onClick={generateWeeklySummary}>
              <div className="cht-summary-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <div className="cht-summary-text">
                <span className="cht-summary-title">Weekly Summary</span>
                <span className="cht-summary-sub">Tap for your performance overview & advice</span>
              </div>
              <svg className="cht-summary-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>

            {/* 1. Habit Spider Chart */}
            <div className="cht-card">
              <h3 className="cht-card-title">Habit Consistency</h3>
              <p className="cht-card-subtitle">{navLabel} completion rate</p>
              <HabitSpiderChart startDate={habitStartDate} endDate={habitEndDate} />
            </div>

            {/* 2. Activity & Sessions */}
            <div className="cht-card">
              <h3 className="cht-card-title">Activity & Sessions</h3>
              <p className="cht-card-subtitle">{isMonthly ? 'Sessions per week' : 'Daily sessions & duration'}</p>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={activityData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fill: textColor, fontSize: 10, fontFamily: 'Inter' }} />
                  <YAxis yAxisId="left" tick={{ fill: textColor, fontSize: 10, fontFamily: 'Inter' }} allowDecimals={false} label={{ value: 'Sessions', angle: -90, position: 'insideLeft', fill: textColor, fontSize: 11, fontFamily: 'Inter', dx: -5 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: textColor, fontSize: 10, fontFamily: 'Inter' }} label={{ value: 'Minutes', angle: 90, position: 'insideRight', fill: textColor, fontSize: 11, fontFamily: 'Inter', dx: 5 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Inter' }} />
                  <Bar yAxisId="left" dataKey="sessions" name="Sessions" fill={barColor} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="duration" name="Minutes" stroke={lineColor} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* 3. Training Volume */}
            <div className="cht-card">
              <h3 className="cht-card-title">Training Volume</h3>
              <p className="cht-card-subtitle">BYO workout volume (reps x weight)</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={volumeData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fill: textColor, fontSize: 10, fontFamily: 'Inter' }} />
                  <YAxis tick={{ fill: textColor, fontSize: 10, fontFamily: 'Inter' }} label={{ value: 'Volume', angle: -90, position: 'insideLeft', fill: textColor, fontSize: 11, fontFamily: 'Inter', dx: -5 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v.toLocaleString()}`, 'Volume']} />
                  <Bar dataKey="volume" name="Volume" fill={barColor} radius={[4, 4, 0, 0]}>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 4. Minutes Trained */}
            <div className="cht-card">
              <h3 className="cht-card-title">Minutes Trained</h3>
              <p className="cht-card-subtitle">{isMonthly ? 'Weekly training minutes' : 'Daily training minutes'}</p>
              <ResponsiveContainer width="100%" height={220}>
                {(() => {
                  const maxMin = Math.max(0, ...minutesData.map(d => d.minutes || 0));
                  const topTick = Math.ceil(maxMin / 5) * 5 || 5;
                  const ticks = [];
                  for (let i = 0; i <= topTick; i += 5) ticks.push(i);
                  return (
                    <LineChart data={minutesData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                      <XAxis dataKey="label" tick={{ fill: textColor, fontSize: 10, fontFamily: 'Inter' }} />
                      <YAxis tick={{ fill: textColor, fontSize: 10, fontFamily: 'Inter' }} domain={[0, topTick]} ticks={ticks} label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fill: textColor, fontSize: 11, fontFamily: 'Inter', dx: -5 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} min`, 'Minutes']} />
                      <Line type="monotone" dataKey="minutes" name="Minutes" stroke={primaryColor} strokeWidth={2} dot={{ r: 3, fill: primaryColor }} />
                    </LineChart>
                  );
                })()}
              </ResponsiveContainer>
            </div>

            {/* 5. Macro Trends */}
            <div className="cht-card">
              <h3 className="cht-card-title">Macro Trends</h3>
              <p className="cht-card-subtitle">{currentMacro?.label} intake vs target</p>
              <div className="cht-macro-tabs">
                {MACRO_TABS.map(tab => (
                  <button
                    key={tab.key}
                    className={`cht-macro-tab${selectedMacro === tab.key ? ' active' : ''}`}
                    onClick={() => setSelectedMacro(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={macroData} barCategoryGap="15%">
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: textColor, fontSize: 9, fontFamily: 'Inter' }}
                    interval={isMonthly ? 4 : 0}
                  />
                  <YAxis tick={{ fill: textColor, fontSize: 10, fontFamily: 'Inter' }} label={{ value: currentMacro?.unit || '', angle: -90, position: 'insideLeft', fill: textColor, fontSize: 11, fontFamily: 'Inter', dx: -5 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} ${currentMacro?.unit}`, currentMacro?.label]} />
                  {macroTargetValue && (
                    <ReferenceLine y={macroTargetValue} stroke={isDark ? '#4CAF50' : '#2e7d32'} strokeDasharray="5 5" label={{ value: 'Target', fill: isDark ? '#4CAF50' : '#2e7d32', fontSize: 10, fontFamily: 'Inter' }} />
                  )}
                  <Bar dataKey={selectedMacro} name={currentMacro?.label} fill={barColor} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 6. Body Metrics Progress */}
            <div className="cht-card">
              <h3 className="cht-card-title">Body Metrics</h3>
              <p className="cht-card-subtitle">Monthly measurement progress (cm)</p>
              <div className="cht-macro-tabs">
                {BODY_METRICS.map(m => (
                  <button
                    key={m.key}
                    className={`cht-macro-tab${selectedMetric === m.key ? ' active' : ''}`}
                    onClick={() => setSelectedMetric(m.key)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
              {bodyMetricsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={bodyMetricsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="label" tick={{ fill: textColor, fontSize: 10, fontFamily: 'Inter' }} />
                    <YAxis tick={{ fill: textColor, fontSize: 10, fontFamily: 'Inter' }} domain={['dataMin - 2', 'dataMax + 2']} label={{ value: 'cm', angle: -90, position: 'insideLeft', fill: textColor, fontSize: 11, fontFamily: 'Inter', dx: -5 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} cm`, BODY_METRICS.find(m => m.key === selectedMetric)?.name]} />
                    {bodyMetricTargets?.targets?.[selectedMetric] && (
                      <ReferenceLine y={bodyMetricTargets.targets[selectedMetric]} stroke={isDark ? '#4CAF50' : '#2e7d32'} strokeDasharray="5 5" label={{ value: 'Target', fill: isDark ? '#4CAF50' : '#2e7d32', fontSize: 10, fontFamily: 'Inter' }} />
                    )}
                    <Line type="monotone" dataKey={selectedMetric} name={BODY_METRICS.find(m => m.key === selectedMetric)?.name} stroke={primaryColor} strokeWidth={2} dot={{ r: 4, fill: primaryColor }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="cht-empty-chart">
                  <p>No measurements logged yet</p>
                  <button className="cht-empty-cta" onClick={() => navigate('/client/core-buddy/metrics')}>
                    Log measurements &rarr;
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>

    {/* Weekly Summary Overlay */}
    {showWeeklySummary && (
      <div className="cht-overlay" onClick={() => setShowWeeklySummary(false)}>
        <div className="cht-overlay-card" onClick={e => e.stopPropagation()}>
          <button className="cht-overlay-close" onClick={() => setShowWeeklySummary(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <h2 className="cht-overlay-title">Weekly Summary</h2>
          {summaryLoading ? (
            <div className="cht-loading-inline"><div className="cht-spinner" /></div>
          ) : summaryData ? (
            <>
              <div className="cht-summary-stats">
                <div className="cht-summary-stat">
                  <span className="cht-summary-stat-value">{summaryData.totalSessions}</span>
                  <span className="cht-summary-stat-label">Sessions</span>
                  {summaryData.sessionDiff !== 0 && (
                    <span className={`cht-summary-diff${summaryData.sessionDiff > 0 ? ' positive' : ' negative'}`}>
                      {summaryData.sessionDiff > 0 ? '+' : ''}{summaryData.sessionDiff}%
                    </span>
                  )}
                </div>
                <div className="cht-summary-stat">
                  <span className="cht-summary-stat-value">{summaryData.totalMinutes}</span>
                  <span className="cht-summary-stat-label">Minutes</span>
                  {summaryData.minutesDiff !== 0 && (
                    <span className={`cht-summary-diff${summaryData.minutesDiff > 0 ? ' positive' : ' negative'}`}>
                      {summaryData.minutesDiff > 0 ? '+' : ''}{summaryData.minutesDiff}%
                    </span>
                  )}
                </div>
                <div className="cht-summary-stat">
                  <span className="cht-summary-stat-value">{summaryData.habitPct}%</span>
                  <span className="cht-summary-stat-label">Habits</span>
                </div>
                <div className="cht-summary-stat">
                  <span className="cht-summary-stat-value">{summaryData.totalVolume.toLocaleString()}</span>
                  <span className="cht-summary-stat-label">Volume</span>
                </div>
              </div>
              <div className="cht-summary-advice">
                <h4 className="cht-advice-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  Advice for next week
                </h4>
                <p className="cht-advice-text">{summaryAdvice}</p>
              </div>
            </>
          ) : (
            <div className="cht-summary-error">
              <p>{summaryError || 'Could not load summary data'}</p>
              <button className="cht-retry-btn" onClick={generateWeeklySummary}>Retry</button>
            </div>
          )}
        </div>
      </div>
    )}

    <CoreBuddyNav active="" />
    </>
  );
}
