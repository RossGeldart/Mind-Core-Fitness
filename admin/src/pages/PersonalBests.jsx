import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import PersonalBestsJunior from './PersonalBestsJunior';
import CoreBuddyNav from '../components/CoreBuddyNav';
import PullToRefresh from '../components/PullToRefresh';
import { TICKS_85_96, TICKS_TINY } from '../utils/ringTicks';
import './PersonalBests.css';
import './ClientDashboard.css';

const EXERCISES = [
  { key: 'chestPress', name: 'Chest Press', category: 'Upper Body - Push', unit: 'weight' },
  { key: 'shoulderPress', name: 'Shoulder Press', category: 'Upper Body - Push', unit: 'weight' },
  { key: 'seatedRow', name: 'Seated Row', category: 'Upper Body - Pull', unit: 'weight' },
  { key: 'latPulldown', name: 'Lat Pulldown', category: 'Upper Body - Pull', unit: 'weight' },
  { key: 'squat', name: 'Squat', category: 'Lower Body', unit: 'weight' },
  { key: 'deadlift', name: 'Deadlift', category: 'Lower Body', unit: 'weight' },
  { key: 'plank', name: 'Plank', category: 'Core', unit: 'time' },
];

const BODY_METRICS = [
  { key: 'weight', name: 'Weight', suffix: 'kg' },
  { key: 'chest', name: 'Chest', suffix: 'cm' },
  { key: 'waist', name: 'Waist', suffix: 'cm' },
  { key: 'hips', name: 'Hips', suffix: 'cm' },
  { key: 'leftArm', name: 'Left Arm', suffix: 'cm' },
  { key: 'rightArm', name: 'Right Arm', suffix: 'cm' },
  { key: 'leftThigh', name: 'Left Thigh', suffix: 'cm' },
  { key: 'rightThigh', name: 'Right Thigh', suffix: 'cm' },
];

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatPlankTime(seconds) {
  if (!seconds && seconds !== 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  if (mins > 0) return `${mins}m ${parseFloat(secs).toFixed(0)}s`;
  return `${parseFloat(secs).toFixed(2)}s`;
}

function formatWeight(weight, reps) {
  if (!weight && weight !== 0) return '-';
  if (!reps && reps !== 0) return `${weight}kg`;
  return `${weight}kg x ${reps}`;
}

// Calculate volume (weight x reps) for percentage comparison, or time for plank
function getComparableValue(exercise, data) {
  if (!data) return 0;
  if (exercise.unit === 'time') return data.time || 0;
  return (data.weight || 0) * (data.reps || 0);
}

function calcPercentChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Simple SVG trend line chart
function TrendChart({ data, exerciseKey, unit }) {
  if (!data || data.length < 2) {
    return (
      <div className="pb-trend-empty">
        <p>Not enough data for trend line yet</p>
      </div>
    );
  }

  const values = data.map(d => {
    const bench = d.benchmarks?.[exerciseKey];
    if (!bench) return 0;
    if (unit === 'time') return bench.time || 0;
    return (bench.weight || 0) * (bench.reps || 0);
  });

  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;

  const width = 300;
  const height = 100;
  const padding = 20;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * chartW;
    const y = padding + chartH - ((v - minVal) / range) * chartH;
    return { x, y, value: v };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD + ` L ${points[points.length - 1].x} ${padding + chartH} L ${points[0].x} ${padding + chartH} Z`;

  return (
    <div className="pb-trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#trendGradient)" />
        <path d={pathD} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--bg-card)" stroke="var(--color-primary)" strokeWidth="2" />
        ))}
      </svg>
      <div className="pb-trend-labels">
        {data.map((d, i) => (
          <span key={i} className="pb-trend-label">{d.month.split('-')[1]}/{d.month.split('-')[0].slice(2)}</span>
        ))}
      </div>
    </div>
  );
}

export default function PersonalBests() {
  const [activeTab, setActiveTab] = useState('bests');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [editingBenchmarks, setEditingBenchmarks] = useState(false);
  const [editingMetrics, setEditingMetrics] = useState(false);
  const [editingTargets, setEditingTargets] = useState(false);
  const [benchmarkForm, setBenchmarkForm] = useState({});
  const [metricsForm, setMetricsForm] = useState({});
  const [targets, setTargets] = useState({});
  const [metricTargets, setMetricTargets] = useState({});
  const [targetsForm, setTargetsForm] = useState({});
  const [editingMetricTargets, setEditingMetricTargets] = useState(false);
  const [metricTargetsForm, setMetricTargetsForm] = useState({});
  const [achievements, setAchievements] = useState([]);
  const [celebration, setCelebration] = useState(null);
  const [toast, setToast] = useState(null);

  // History compare state
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  // Core Buddy PB state
  const [cbPBs, setCbPBs] = useState({});
  const [cbTargets, setCbTargets] = useState({});
  const [cbAchievements, setCbAchievements] = useState(null);
  const [cbTargetExercise, setCbTargetExercise] = useState(null); // exercise name being targeted
  const [cbTargetInput, setCbTargetInput] = useState('');

  // Touch/swipe state for carousel
  const carouselRef = useRef(null);
  const touchStartX = useRef(0);
  const touchDelta = useRef(0);
  const slideDirection = useRef('right');

  const goToSlide = useCallback((newIndex) => {
    setCurrentSlide(prev => {
      const clamped = Math.max(0, Math.min(EXERCISES.length - 1, newIndex));
      if (clamped === prev) return prev;
      slideDirection.current = clamped > prev ? 'right' : 'left';
      return clamped;
    });
  }, []);

  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const coreBuddyMode = searchParams.get('mode') === 'corebuddy';
  const isBlockClient = !coreBuddyMode && (!clientData?.clientType || clientData.clientType === 'block');

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) {
      navigate('/');
    }
  }, [currentUser, isClient, authLoading, navigate]);

  useEffect(() => {
    if (!clientData) return;
    if (isBlockClient) {
      fetchRecords();
    } else {
      // Core Buddy clients: load PBs, targets, and achievements
      const loadCBPBs = async () => {
        try {
          const [pbSnap, targetSnap, achSnap] = await Promise.all([
            getDoc(doc(db, 'coreBuddyPBs', clientData.id)),
            getDoc(doc(db, 'coreBuddyTargets', clientData.id)),
            getDoc(doc(db, 'coreBuddyAchievements', clientData.id)),
          ]);
          if (pbSnap.exists()) setCbPBs(pbSnap.data().exercises || {});
          if (targetSnap.exists()) setCbTargets(targetSnap.data().targets || {});
          if (achSnap.exists()) setCbAchievements(achSnap.data());
        } catch (err) {
          console.error('Error loading Core Buddy PBs:', err);
        }
        setLoading(false);
      };
      loadCBPBs();
    }
  }, [clientData]);

  const fetchRecords = async () => {
    try {
      const q = query(
        collection(db, 'personalBests'),
        where('clientId', '==', clientData.id)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => a.month.localeCompare(b.month));
      setRecords(data);

      // Fetch targets
      const targetsQ = query(
        collection(db, 'personalBestTargets'),
        where('clientId', '==', clientData.id)
      );
      const targetsSnapshot = await getDocs(targetsQ);
      if (!targetsSnapshot.empty) {
        const targetsData = targetsSnapshot.docs[0].data();
        setTargets(targetsData.targets || {});
        setMetricTargets(targetsData.metricTargets || {});
        setTargetsForm(targetsData.targets || {});
        setMetricTargetsForm(targetsData.metricTargets || {});
      }

      // Fetch achievements
      const achQ = query(
        collection(db, 'achievements'),
        where('clientId', '==', clientData.id)
      );
      const achSnapshot = await getDocs(achQ);
      if (!achSnapshot.empty) {
        setAchievements(achSnapshot.docs[0].data().badges || []);
      }
    } catch (error) {
      console.error('Error fetching personal bests:', error);
    }
    setLoading(false);
  };

  // Core Buddy: save a target for an exercise
  const handleSaveCbTarget = async () => {
    if (!cbTargetExercise || !cbTargetInput || !clientData) return;
    const targetWeight = parseFloat(cbTargetInput);
    const currentPB = cbPBs[cbTargetExercise];
    if (!currentPB || targetWeight <= currentPB.weight) {
      showToast('Target must be higher than current PB', 'error');
      return;
    }
    setSaving(true);
    try {
      const newTargets = {
        ...cbTargets,
        [cbTargetExercise]: {
          targetWeight,
          setAt: Timestamp.now(),
          currentPBWhenSet: currentPB.weight,
        },
      };
      await setDoc(doc(db, 'coreBuddyTargets', clientData.id), {
        clientId: clientData.id,
        targets: newTargets,
        updatedAt: Timestamp.now(),
      });
      setCbTargets(newTargets);
      setCbTargetExercise(null);
      setCbTargetInput('');
      showToast('Target set!', 'success');
    } catch (err) {
      console.error('Error saving target:', err);
      showToast('Failed to save target', 'error');
    }
    setSaving(false);
  };

  // Core Buddy: check if a PB badge was earned for an exercise
  const hasCbBadge = (exerciseName) => {
    if (!cbAchievements?.badges) return false;
    const target = cbTargets[exerciseName];
    if (!target) return false;
    return cbAchievements.badges.some(
      b => b.type === 'pb_target' && b.exercise === exerciseName && b.targetWeight === target.targetWeight
    );
  };

  // Core Buddy: get progress toward target (0-1)
  const getCbTargetProgress = (exerciseName) => {
    const target = cbTargets[exerciseName];
    if (!target) return null;
    const currentPB = cbPBs[exerciseName];
    if (!currentPB) return 0;
    const start = target.currentPBWhenSet || 0;
    const end = target.targetWeight;
    const range = end - start;
    if (range <= 0) return currentPB.weight >= end ? 1 : 0;
    return Math.max(0, Math.min((currentPB.weight - start) / range, 1));
  };

  const currentMonth = getCurrentMonth();
  const currentRecord = records.find(r => r.month === currentMonth);
  const previousRecords = records.filter(r => r.month < currentMonth);
  const previousRecord = previousRecords.length > 0 ? previousRecords[previousRecords.length - 1] : null;

  // Initialize edit forms when current record changes
  useEffect(() => {
    if (currentRecord) {
      setBenchmarkForm(currentRecord.benchmarks || {});
      setMetricsForm(currentRecord.bodyMetrics || {});
    } else {
      setBenchmarkForm({});
      setMetricsForm({});
    }
  }, [currentRecord?.id]);

  // Check for new achievements after saving benchmarks or metrics
  const checkAndSaveAchievements = async (type, dataMap) => {
    const newBadges = [];

    if (type === 'strength') {
      EXERCISES.forEach(ex => {
        const target = targets[ex.key];
        if (!target) return;
        const bench = dataMap[ex.key];
        if (!bench) return;

        let progress;
        if (target.targetType === 'time') {
          if (!target.targetValue) return;
          const startVal = target.startValue || 0;
          const currentVal = bench.time || 0;
          const range = target.targetValue - startVal;
          progress = range === 0 ? (currentVal >= target.targetValue ? 1 : 0) : Math.max(0, (currentVal - startVal) / range);
        } else {
          if (!target.targetWeight && !target.targetReps) return;
          const startVol = (target.startWeight || 0) * (target.startReps || 0);
          const targetVol = (target.targetWeight || 0) * (target.targetReps || 0);
          const currentVol = (bench.weight || 0) * (bench.reps || 0);
          const range = targetVol - startVol;
          progress = range === 0 ? (currentVol >= targetVol ? 1 : 0) : Math.max(0, (currentVol - startVol) / range);
        }

        if (progress >= 1) {
          const alreadyAchieved = target.targetType === 'time'
            ? achievements.some(a => a.type === 'strength' && a.key === ex.key && a.targetValue === target.targetValue)
            : achievements.some(a => a.type === 'strength' && a.key === ex.key && a.targetWeight === target.targetWeight && a.targetReps === target.targetReps);
          if (!alreadyAchieved) {
            const label = target.targetType === 'time'
              ? `${ex.name} ${target.targetValue}s`
              : `${ex.name} ${target.targetWeight}kg × ${target.targetReps}`;
            newBadges.push({
              type: 'strength', key: ex.key,
              ...(target.targetType === 'time'
                ? { targetType: 'time', targetValue: target.targetValue }
                : { targetWeight: target.targetWeight, targetReps: target.targetReps }),
              achievedMonth: currentMonth, label,
            });
          }
        }
      });
    } else {
      BODY_METRICS.forEach(m => {
        const mTarget = metricTargets[m.key];
        if (!mTarget || !mTarget.targetValue) return;
        const currentVal = dataMap[m.key];
        if (currentVal == null) return;
        const startVal = mTarget.startValue || 0;
        const targetVal = mTarget.targetValue;
        const range = targetVal - startVal;
        const progress = range === 0 ? (currentVal === targetVal ? 1 : 0) : Math.max(0, (currentVal - startVal) / range);
        if (progress >= 1) {
          const alreadyAchieved = achievements.some(
            a => a.type === 'metric' && a.key === m.key && a.targetValue === targetVal
          );
          if (!alreadyAchieved) {
            newBadges.push({
              type: 'metric', key: m.key,
              targetValue: targetVal, achievedMonth: currentMonth,
              label: `${m.name} ${targetVal}${m.suffix}`,
            });
          }
        }
      });
    }

    if (newBadges.length > 0) {
      const allBadges = [...achievements, ...newBadges];
      await setDoc(doc(db, 'achievements', clientData.id), {
        clientId: clientData.id,
        badges: allBadges,
        updatedAt: Timestamp.now(),
      });
      setAchievements(allBadges);
      setCelebration(newBadges);
      setTimeout(() => setCelebration(null), 5000);
    }
  };

  const hasAchievement = (type, key) => {
    if (type === 'strength') {
      const target = targets[key];
      if (!target) return false;
      if (target.targetType === 'time') {
        return achievements.some(a => a.type === 'strength' && a.key === key && a.targetValue === target.targetValue);
      }
      if (!target.targetWeight && !target.targetReps) return false;
      return achievements.some(a => a.type === 'strength' && a.key === key && a.targetWeight === target.targetWeight && a.targetReps === target.targetReps);
    } else {
      const mTarget = metricTargets[key];
      if (!mTarget || !mTarget.targetValue) return false;
      return achievements.some(a => a.type === 'metric' && a.key === key && a.targetValue === mTarget.targetValue);
    }
  };

  const handleSaveBenchmarks = async () => {
    setSaving(true);
    try {
      const docId = `${clientData.id}_${currentMonth}`;
      const existing = currentRecord || {};
      await setDoc(doc(db, 'personalBests', docId), {
        clientId: clientData.id,
        month: currentMonth,
        benchmarks: benchmarkForm,
        bodyMetrics: existing.bodyMetrics || metricsForm || {},
        createdAt: existing.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await checkAndSaveAchievements('strength', benchmarkForm);
      showToast('Benchmarks saved!', 'success');
      setEditingBenchmarks(false);
      await fetchRecords();
    } catch (error) {
      console.error('Error saving benchmarks:', error);
      showToast('Failed to save. Please try again.', 'error');
    }
    setSaving(false);
  };

  const handleSaveMetrics = async () => {
    setSaving(true);
    try {
      const docId = `${clientData.id}_${currentMonth}`;
      const existing = currentRecord || {};
      await setDoc(doc(db, 'personalBests', docId), {
        clientId: clientData.id,
        month: currentMonth,
        benchmarks: existing.benchmarks || benchmarkForm || {},
        bodyMetrics: metricsForm,
        createdAt: existing.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await checkAndSaveAchievements('metric', metricsForm);
      showToast('Body metrics saved!', 'success');
      setEditingMetrics(false);
      await fetchRecords();
    } catch (error) {
      console.error('Error saving metrics:', error);
      showToast('Failed to save. Please try again.', 'error');
    }
    setSaving(false);
  };

  const handleBenchmarkChange = (exerciseKey, field, value) => {
    setBenchmarkForm(prev => ({
      ...prev,
      [exerciseKey]: {
        ...prev[exerciseKey],
        [field]: value === '' ? '' : parseFloat(value),
      }
    }));
  };

  const handleMetricChange = (metricKey, value) => {
    setMetricsForm(prev => ({
      ...prev,
      [metricKey]: value === '' ? '' : parseFloat(value),
    }));
  };

  const handleTargetChange = (exerciseKey, field, value) => {
    setTargetsForm(prev => ({
      ...prev,
      [exerciseKey]: {
        ...prev[exerciseKey],
        [field]: value === '' ? '' : parseFloat(value),
      }
    }));
  };

  const handleSaveTargets = async () => {
    setSaving(true);
    try {
      const docId = `targets_${clientData.id}`;
      const latestBenchmarks = currentRecord?.benchmarks || {};
      const targetsToSave = {};
      EXERCISES.forEach(ex => {
        const bench = latestBenchmarks[ex.key];
        if (ex.unit === 'time') {
          if (targetsForm[ex.key]?.targetValue) {
            targetsToSave[ex.key] = {
              targetType: 'time',
              targetValue: targetsForm[ex.key].targetValue,
              startValue: bench?.time || 0,
            };
          }
        } else {
          if (targetsForm[ex.key]?.targetWeight || targetsForm[ex.key]?.targetReps) {
            targetsToSave[ex.key] = {
              targetWeight: targetsForm[ex.key].targetWeight || 0,
              targetReps: targetsForm[ex.key].targetReps || 0,
              startWeight: bench?.weight || 0,
              startReps: bench?.reps || 0,
            };
          }
        }
      });
      await setDoc(doc(db, 'personalBestTargets', docId), {
        clientId: clientData.id,
        targets: targetsToSave,
        metricTargets: metricTargets, // Preserve existing metric targets
        updatedAt: Timestamp.now(),
      });
      setTargets(targetsToSave);
      setTargetsForm(targetsToSave);
      showToast('Targets saved!', 'success');
      setEditingTargets(false);
    } catch (error) {
      console.error('Error saving targets:', error);
      showToast('Failed to save targets.', 'error');
    }
    setSaving(false);
  };

  const handleMetricTargetChange = (metricKey, value) => {
    setMetricTargetsForm(prev => ({
      ...prev,
      [metricKey]: {
        ...prev[metricKey],
        targetValue: value === '' ? '' : parseFloat(value),
      }
    }));
  };

  const handleSaveMetricTargets = async () => {
    setSaving(true);
    try {
      const docId = `targets_${clientData.id}`;
      const metricTargetsToSave = {};
      BODY_METRICS.forEach(m => {
        if (metricTargetsForm[m.key]?.targetValue) {
          const currentVal = currentRecord?.bodyMetrics?.[m.key] || 0;
          metricTargetsToSave[m.key] = {
            targetValue: metricTargetsForm[m.key].targetValue,
            startValue: currentVal,
          };
        }
      });
      await setDoc(doc(db, 'personalBestTargets', docId), {
        clientId: clientData.id,
        targets: targets, // Preserve existing strength targets
        metricTargets: metricTargetsToSave,
        updatedAt: Timestamp.now(),
      });
      setMetricTargets(metricTargetsToSave);
      setMetricTargetsForm(metricTargetsToSave);
      showToast('Metric targets saved!', 'success');
      setEditingMetricTargets(false);
    } catch (error) {
      console.error('Error saving metric targets:', error);
      showToast('Failed to save targets.', 'error');
    }
    setSaving(false);
  };

  // Reset all targets (strength + metric)
  const handleResetTargets = async () => {
    if (!window.confirm('Reset all goals? This will clear all strength and body metric targets. Your recorded benchmarks and measurements will NOT be affected.')) return;
    setSaving(true);
    try {
      const targetDocRef = doc(db, 'personalBestTargets', `targets_${clientData.id}`);
      await deleteDoc(targetDocRef);
      setTargets({});
      setMetricTargets({});
      setTargetsForm({});
      setMetricTargetsForm({});
      showToast('All goals have been reset', 'success');
    } catch (error) {
      console.error('Error resetting targets:', error);
      showToast('Failed to reset goals', 'error');
    }
    setSaving(false);
  };

  // Get progress toward target (0 to 1) based on range from start to target
  const getTargetProgress = (exerciseKey, benchData) => {
    const target = targets[exerciseKey];
    if (!target || !benchData) return null;

    // Time-based exercise (plank)
    if (target.targetType === 'time') {
      if (!target.targetValue) return null;
      const startVal = target.startValue || 0;
      const targetVal = target.targetValue;
      const currentVal = benchData.time || 0;
      const range = targetVal - startVal;
      if (range <= 0) return currentVal >= targetVal ? 1 : 0;
      return Math.max(0, Math.min((currentVal - startVal) / range, 1));
    }

    // Weight + reps based: use volume (weight × reps)
    if (!target.targetWeight && !target.targetReps) return null;
    const startVol = (target.startWeight || 0) * (target.startReps || 0);
    const targetVol = (target.targetWeight || 0) * (target.targetReps || 0);
    const currentVol = (benchData.weight || 0) * (benchData.reps || 0);
    const range = targetVol - startVol;
    if (range <= 0) return currentVol >= targetVol ? 1 : 0;
    return Math.max(0, Math.min((currentVol - startVol) / range, 1));
  };

  // Get progress toward metric target (0 to 1), handles both increase and decrease goals
  const getMetricTargetProgress = (metricKey) => {
    const mTarget = metricTargets[metricKey];
    if (!mTarget || !mTarget.targetValue) return null;
    const currentVal = currentRecord?.bodyMetrics?.[metricKey];
    if (currentVal == null) return null;
    const startVal = mTarget.startValue || 0;
    const targetVal = mTarget.targetValue;
    const range = targetVal - startVal;
    if (range === 0) return currentVal === targetVal ? 1 : 0;
    return Math.max(0, Math.min((currentVal - startVal) / range, 1));
  };

  // Carousel touch handlers
  const handleCarouselTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchDelta.current = 0;
  };

  const handleCarouselTouchMove = (e) => {
    touchDelta.current = e.touches[0].clientX - touchStartX.current;
  };

  const handleCarouselTouchEnd = () => {
    if (touchDelta.current < -50) {
      goToSlide(currentSlide + 1);
    } else if (touchDelta.current > 50) {
      goToSlide(currentSlide - 1);
    }
    touchDelta.current = 0;
  };

  // Get change for a metric
  const getMetricChange = (metricKey) => {
    const current = currentRecord?.bodyMetrics?.[metricKey];
    const previous = previousRecord?.bodyMetrics?.[metricKey];
    if (current == null || previous == null) return null;
    return parseFloat((current - previous).toFixed(2));
  };

  // Compare records
  const recordA = records.find(r => r.month === compareA);
  const recordB = records.find(r => r.month === compareB);

  if (authLoading || loading) {
    return (
      <div className="pb-page">
        <header className="client-header">
          <div className="header-content">
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          </div>
        </header>
        <main className="pb-main">
          <div className="skeleton skeleton-title" style={{ width: 180, height: 28, marginBottom: 20 }}></div>
          <div className="skeleton skeleton-card-large" style={{ height: 320, borderRadius: 16 }}></div>
        </main>
      </div>
    );
  }

  if (!currentUser || !isClient || !clientData) {
    return null;
  }

  // Junior block clients get their own PB page with kid-safe exercises
  if (isBlockClient && clientData?.isJunior) {
    return <PersonalBestsJunior />;
  }

  const currentExercise = EXERCISES[currentSlide];
  const currentBench = currentRecord?.benchmarks?.[currentExercise.key];
  const previousBench = previousRecord?.benchmarks?.[currentExercise.key];
  const currentVal = getComparableValue(currentExercise, currentBench);
  const previousVal = getComparableValue(currentExercise, previousBench);
  const percentChange = calcPercentChange(currentVal, previousVal);

  // Ring ticks: fill based on progress toward target (0-100% = 0-60 ticks)
  const targetProgress = getTargetProgress(currentExercise.key, currentBench);
  const hasTarget = targetProgress !== null;
  const targetHit = targetProgress !== null && targetProgress >= 1;
  const ringFill = hasTarget
    ? Math.round(targetProgress * 60)
    : (currentVal > 0 ? 15 : 0); // Fallback: small fill if no target set

  // Get current target info for display
  const currentTarget = targets[currentExercise.key];

  return (
    <PullToRefresh>
    <div className="pb-page">
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate(coreBuddyMode ? '/client/core-buddy' : '/client')} aria-label="Go back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
        </div>
      </header>

      <main className="pb-main page-transition-enter">

        <div className="pb-intro">
          <h2>Personal Bests</h2>
          <p>{isBlockClient
            ? 'Track your strength benchmarks and body measurements each month.'
            : 'Your all-time best lifts from programme workouts.'
          }</p>
        </div>

        {/* ====== CORE BUDDY PB VIEW ====== */}
        {!isBlockClient && (
          <div className="pb-cb-section">
            {Object.keys(cbPBs).length === 0 ? (
              <div className="pb-empty">
                <div className="pb-cb-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/>
                  </svg>
                </div>
                <h4>No personal bests yet</h4>
                <p>Complete weight-based workouts to start tracking your personal bests.</p>
              </div>
            ) : (
              <div className="pb-cb-grid">
                {Object.entries(cbPBs)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([name, data], i) => {
                  const target = cbTargets[name];
                  const progress = getCbTargetProgress(name);
                  const targetHit = progress !== null && progress >= 1;
                  const badgeEarned = hasCbBadge(name);
                  const ringFill = progress !== null ? Math.round(progress * 60) : 60;

                  return (
                    <div key={name} className="pb-cb-card" style={{ animationDelay: `${i * 0.05}s` }}>
                      <div className="pb-cb-card-top">
                        <div className="pb-cb-card-ring">
                          <svg className="pb-cb-ring-svg" viewBox="0 0 80 80">
                            {TICKS_TINY.map((t, j) => {
                              const filled = j < ringFill;
                              return (
                                <line key={j} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                                  className={`pb-ring-tick ${filled ? (targetHit ? 'hit' : 'filled') : 'empty'}`}
                                  strokeWidth={t.thick ? '2' : '1.5'} />
                              );
                            })}
                          </svg>
                          <div className="pb-cb-ring-icon">
                            {badgeEarned ? (
                              <svg viewBox="0 0 24 24" fill="currentColor" className="pb-cb-badge-earned">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/>
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="pb-cb-card-info">
                          <h4 className="pb-cb-card-name">{name}</h4>
                          <div className="pb-cb-card-value">{data.weight}kg × {data.reps}</div>
                          {data.achievedAt && (
                            <div className="pb-cb-card-date">
                              {(data.achievedAt.toDate ? data.achievedAt.toDate() : new Date(data.achievedAt))
                                .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          )}
                          {target && targetHit && !badgeEarned && (
                            <div className="pb-cb-target-info hit">Target hit!</div>
                          )}
                          {badgeEarned && (
                            <div className="pb-cb-target-info earned">Badge earned!</div>
                          )}
                        </div>
                        {/* Set / Edit Target button */}
                        <div className="pb-cb-card-action">
                          <button className="pb-cb-target-btn" onClick={() => {
                            setCbTargetExercise(name);
                            setCbTargetInput('');
                          }}>
                            {!target ? (
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <circle cx="12" cy="12" r="6" />
                                <circle cx="12" cy="12" r="2" />
                              </svg>
                            ) : targetHit && badgeEarned ? (
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                      {/* Progress bar when target is active */}
                      {target && !targetHit && (
                        <div className="pb-cb-card-progress">
                          <div className="pb-cb-progress-labels">
                            <span className="pb-cb-progress-current">{data.weight}kg</span>
                            <span className="pb-cb-progress-target">Target: {target.targetWeight}kg</span>
                          </div>
                          <div className="pb-cb-progress-bar">
                            <div
                              className="pb-cb-progress-bar-fill"
                              style={{ width: `${Math.round((progress || 0) * 100)}%` }}
                            />
                          </div>
                          <div className="pb-cb-progress-pct">{Math.round((progress || 0) * 100)}%</div>
                        </div>
                      )}
                      {target && targetHit && (
                        <div className="pb-cb-card-progress">
                          <div className="pb-cb-progress-bar">
                            <div className="pb-cb-progress-bar-fill hit" style={{ width: '100%' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Achievements link */}
            {Object.keys(cbPBs).length > 0 && (
              <button className="pb-cb-achievements-link" onClick={() => navigate('/client/core-buddy/achievements')}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                View Achievements
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )}

            {/* Target Setting Modal */}
            {cbTargetExercise && (
              <div className="pb-cb-target-modal-overlay" onClick={() => setCbTargetExercise(null)}>
                <div className="pb-cb-target-modal" onClick={e => e.stopPropagation()}>
                  <h3>Set Target</h3>
                  <p className="pb-cb-target-exercise-name">{cbTargetExercise}</p>
                  <div className="pb-cb-target-current">
                    Current PB: <strong>{cbPBs[cbTargetExercise]?.weight}kg</strong>
                  </div>
                  <div className="pb-cb-target-input-wrap">
                    <label>Your target (kg)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={cbTargetInput}
                      onChange={e => setCbTargetInput(e.target.value)}
                      placeholder={String((cbPBs[cbTargetExercise]?.weight || 0) + 5)}
                      className="pb-cb-target-input"
                      autoFocus
                    />
                  </div>
                  <div className="pb-cb-target-actions">
                    <button className="pb-cancel-btn" onClick={() => setCbTargetExercise(null)}>Cancel</button>
                    <button className="pb-save-btn" onClick={handleSaveCbTarget} disabled={saving}>
                      {saving ? 'Saving...' : 'Set Target'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== BLOCK CLIENT PB VIEW ====== */}
        {isBlockClient && <>
        {/* Tab Navigation */}
        <div className="pb-tabs">
          <button
            className={`pb-tab ${activeTab === 'bests' ? 'active' : ''}`}
            onClick={() => setActiveTab('bests')}
          >
            Strength
          </button>
          <button
            className={`pb-tab ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            Body Metrics
          </button>
          <button
            className={`pb-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
        </div>

        {/* ====== STRENGTH TAB ====== */}
        {activeTab === 'bests' && (
          <div className="pb-strength-section">
            {/* Carousel Ring */}
            {!editingBenchmarks && (
              <>
                <div
                  className="pb-carousel"
                  ref={carouselRef}
                  onTouchStart={handleCarouselTouchStart}
                  onTouchMove={handleCarouselTouchMove}
                  onTouchEnd={handleCarouselTouchEnd}
                >
                  <div className={`pb-ring-container slide-from-${slideDirection.current}`} key={currentSlide}>
                    <div className="pb-ring">
                      <svg className="pb-ring-svg" viewBox="0 0 200 200">
                        {TICKS_85_96.map((t, i) => {
                          const isFilled = i < Math.round(ringFill);
                          return (
                            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                              className={`pb-ring-tick ${isFilled ? (targetHit ? 'hit' : 'filled') : 'empty'}`}
                              strokeWidth={t.thick ? '3' : '2'} />
                          );
                        })}
                      </svg>
                      <div className="pb-ring-center">
                        <div className="pb-ring-category">{currentExercise.category}</div>
                        <div className="pb-ring-exercise">
                          {currentExercise.name}
                          {hasAchievement('strength', currentExercise.key) && (
                            <svg className="pb-badge-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                          )}
                        </div>
                        <div className="pb-ring-value">
                          {currentBench
                            ? currentExercise.unit === 'time'
                              ? formatPlankTime(currentBench.time)
                              : formatWeight(currentBench.weight, currentBench.reps)
                            : '-'
                          }
                        </div>
                        {percentChange !== null && (
                          <div className={`pb-ring-change ${percentChange >= 0 ? 'positive' : 'negative'}`}>
                            {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}%
                          </div>
                        )}
                        {percentChange === null && currentBench && (
                          <div className="pb-ring-change neutral">New entry</div>
                        )}
                        {currentTarget && (
                          <div className={`pb-ring-target ${targetHit ? 'hit' : ''}`}>
                            {targetHit ? 'Target hit!' : (
                              currentTarget.targetType === 'time'
                                ? `${currentTarget.startValue || 0}s → ${currentTarget.targetValue}s`
                                : `${currentTarget.startWeight || 0}kg×${currentTarget.startReps || 0} → ${currentTarget.targetWeight}kg×${currentTarget.targetReps}`
                            )}
                          </div>
                        )}
                        {!currentTarget && (
                          <div className="pb-ring-target none">No target set</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Carousel dots */}
                  <div className="pb-carousel-dots">
                    {EXERCISES.map((_, i) => (
                      <button
                        key={i}
                        className={`pb-dot ${i === currentSlide ? 'active' : ''}`}
                        onClick={() => goToSlide(i)}
                      />
                    ))}
                  </div>

                  {/* Arrow buttons */}
                  <button
                    className="pb-carousel-arrow left"
                    onClick={() => goToSlide(currentSlide - 1)}
                    disabled={currentSlide === 0}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                  </button>
                  <button
                    className="pb-carousel-arrow right"
                    onClick={() => goToSlide(currentSlide + 1)}
                    disabled={currentSlide === EXERCISES.length - 1}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
                  </button>
                </div>

                {/* Trend Chart */}
                <div className="pb-trend-section">
                  <h4>Trend</h4>
                  <TrendChart data={records} exerciseKey={currentExercise.key} unit={currentExercise.unit} />
                </div>
              </>
            )}

            {/* Edit / Add Benchmarks */}
            {!editingBenchmarks && !editingTargets && (
              <div className="pb-action-buttons">
                <button className="pb-edit-btn" onClick={() => setEditingBenchmarks(true)}>
                  {currentRecord?.benchmarks ? 'Edit This Month\'s Benchmarks' : 'Add This Month\'s Benchmarks'}
                </button>
                <button className="pb-edit-btn pb-target-btn" onClick={() => setEditingTargets(true)}>
                  {Object.keys(targets).length > 0 ? 'Edit Targets' : 'Set Targets'}
                </button>
                {(Object.keys(targets).length > 0 || Object.keys(metricTargets).length > 0) && (
                  <button className="pb-edit-btn pb-reset-btn" onClick={handleResetTargets} disabled={saving}>
                    Reset All Goals
                  </button>
                )}
              </div>
            )}

            {editingBenchmarks && (
              <div className="pb-edit-card">
                <div className="pb-edit-header">
                  <h3>Benchmarks - {formatMonthLabel(currentMonth)}</h3>
                  <button className="pb-edit-close" onClick={() => {
                    setEditingBenchmarks(false);
                    setBenchmarkForm(currentRecord?.benchmarks || {});
                  }}>&times;</button>
                </div>
                <div className="pb-edit-body">
                  {EXERCISES.map(ex => (
                    <div key={ex.key} className="pb-edit-exercise">
                      <div className="pb-edit-exercise-name">{ex.name}</div>
                      {ex.unit === 'weight' ? (
                        <div className="pb-edit-row">
                          <div className="pb-edit-field">
                            <label>Weight (kg)</label>
                            <input
                              type="number"
                              step="0.5"
                              value={benchmarkForm[ex.key]?.weight ?? ''}
                              onChange={(e) => handleBenchmarkChange(ex.key, 'weight', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                          <div className="pb-edit-field">
                            <label>Reps</label>
                            <input
                              type="number"
                              value={benchmarkForm[ex.key]?.reps ?? ''}
                              onChange={(e) => handleBenchmarkChange(ex.key, 'reps', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="pb-edit-row">
                          <div className="pb-edit-field full">
                            <label>Time (seconds)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={benchmarkForm[ex.key]?.time ?? ''}
                              onChange={(e) => handleBenchmarkChange(ex.key, 'time', e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="pb-edit-actions">
                  <button className="pb-cancel-btn" onClick={() => {
                    setEditingBenchmarks(false);
                    setBenchmarkForm(currentRecord?.benchmarks || {});
                  }}>Cancel</button>
                  <button className="pb-save-btn" onClick={handleSaveBenchmarks} disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {/* Edit Targets */}
            {editingTargets && (
              <div className="pb-edit-card">
                <div className="pb-edit-header">
                  <h3>Set Your Targets</h3>
                  <button className="pb-edit-close" onClick={() => {
                    setEditingTargets(false);
                    setTargetsForm(targets);
                  }}>&times;</button>
                </div>
                <div className="pb-edit-body">
                  <p className="pb-target-hint">Set a target for each exercise. Your current best is captured automatically from your latest benchmarks.</p>

                  {EXERCISES.map(ex => {
                    const bench = currentRecord?.benchmarks?.[ex.key];
                    let currentBestDisplay = '-';
                    if (bench) {
                      if (ex.unit === 'time' && bench.time) currentBestDisplay = `${bench.time}s`;
                      else if (bench.weight || bench.reps) currentBestDisplay = `${bench.weight || 0}kg × ${bench.reps || 0}`;
                    }
                    return (
                      <div key={ex.key} className="pb-edit-exercise">
                        <div className="pb-edit-exercise-header">
                          <div className="pb-edit-exercise-name">{ex.name}</div>
                          <div className="pb-edit-current-best">Current: {currentBestDisplay}</div>
                        </div>
                        {ex.unit === 'weight' ? (
                          <div className="pb-edit-row">
                            <div className="pb-edit-field">
                              <label>Target Weight (kg)</label>
                              <input
                                type="number"
                                step="0.5"
                                value={targetsForm[ex.key]?.targetWeight ?? ''}
                                onChange={(e) => handleTargetChange(ex.key, 'targetWeight', e.target.value)}
                                placeholder="0"
                              />
                            </div>
                            <div className="pb-edit-field">
                              <label>Target Reps</label>
                              <input
                                type="number"
                                value={targetsForm[ex.key]?.targetReps ?? ''}
                                onChange={(e) => handleTargetChange(ex.key, 'targetReps', e.target.value)}
                                placeholder="0"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="pb-edit-row">
                            <div className="pb-edit-field full">
                              <label>Target (seconds)</label>
                              <input
                                type="number"
                                step="1"
                                value={targetsForm[ex.key]?.targetValue ?? ''}
                                onChange={(e) => handleTargetChange(ex.key, 'targetValue', e.target.value)}
                                placeholder="0"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                </div>
                <div className="pb-edit-actions">
                  <button className="pb-cancel-btn" onClick={() => {
                    setEditingTargets(false);
                    setTargetsForm(targets);
                  }}>Cancel</button>
                  <button className="pb-save-btn" onClick={handleSaveTargets} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Targets'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== BODY METRICS TAB ====== */}
        {activeTab === 'metrics' && (
          <div className="pb-metrics-section">
            {!editingMetrics && !editingMetricTargets && (
              <>
                <div className="pb-metrics-card">
                  <h3>Body Measurements</h3>
                  <p className="pb-metrics-month">{formatMonthLabel(currentMonth)}</p>
                  <div className="pb-metrics-list">
                    {BODY_METRICS.map(metric => {
                      const value = currentRecord?.bodyMetrics?.[metric.key];
                      const change = getMetricChange(metric.key);
                      const mTarget = metricTargets[metric.key];
                      const mProgress = getMetricTargetProgress(metric.key);
                      const mHit = mProgress !== null && mProgress >= 1;
                      return (
                        <div key={metric.key} className="pb-metric-row">
                          <div className="pb-metric-top">
                            <div className="pb-metric-left">
                              <span className="pb-metric-name">
                                {metric.name}
                                {hasAchievement('metric', metric.key) && (
                                  <svg className="pb-badge-icon-sm" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                )}
                              </span>
                              {mTarget && (
                                <span className="pb-metric-target-label">
                                  Target: {mTarget.targetValue} {metric.suffix}
                                </span>
                              )}
                            </div>
                            <div className="pb-metric-values">
                              <span className="pb-metric-current">
                                {value != null ? `${value} ${metric.suffix}` : '-'}
                              </span>
                              {change !== null && (
                                <span className={`pb-metric-change ${change > 0 ? 'up' : change < 0 ? 'down' : 'same'}`}>
                                  {change > 0 ? '+' : ''}{change} {metric.suffix}
                                </span>
                              )}
                            </div>
                          </div>
                          {mProgress !== null && (
                            <div className="pb-metric-progress">
                              <div className="pb-metric-bar">
                                <div
                                  className={`pb-metric-bar-fill ${mHit ? 'hit' : ''}`}
                                  style={{ width: `${Math.round(mProgress * 100)}%` }}
                                />
                              </div>
                              <span className={`pb-metric-percent ${mHit ? 'hit' : ''}`}>
                                {mHit ? 'Hit!' : `${Math.round(mProgress * 100)}%`}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="pb-action-buttons">
                  <button className="pb-edit-btn" onClick={() => setEditingMetrics(true)}>
                    {currentRecord?.bodyMetrics ? 'Edit This Month\'s Measurements' : 'Add This Month\'s Measurements'}
                  </button>
                  <button className="pb-edit-btn pb-target-btn" onClick={() => setEditingMetricTargets(true)}>
                    {Object.keys(metricTargets).length > 0 ? 'Edit Targets' : 'Set Targets'}
                  </button>
                  {(Object.keys(targets).length > 0 || Object.keys(metricTargets).length > 0) && (
                    <button className="pb-edit-btn pb-reset-btn" onClick={handleResetTargets} disabled={saving}>
                      Reset All Goals
                    </button>
                  )}
                </div>
              </>
            )}

            {editingMetrics && (
              <div className="pb-edit-card">
                <div className="pb-edit-header">
                  <h3>Measurements - {formatMonthLabel(currentMonth)}</h3>
                  <button className="pb-edit-close" onClick={() => {
                    setEditingMetrics(false);
                    setMetricsForm(currentRecord?.bodyMetrics || {});
                  }}>&times;</button>
                </div>
                <div className="pb-edit-body">
                  {BODY_METRICS.map(metric => (
                    <div key={metric.key} className="pb-edit-metric">
                      <div className="pb-edit-field full">
                        <label>{metric.name} ({metric.suffix})</label>
                        <input
                          type="number"
                          step="0.1"
                          value={metricsForm[metric.key] ?? ''}
                          onChange={(e) => handleMetricChange(metric.key, e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pb-edit-actions">
                  <button className="pb-cancel-btn" onClick={() => {
                    setEditingMetrics(false);
                    setMetricsForm(currentRecord?.bodyMetrics || {});
                  }}>Cancel</button>
                  <button className="pb-save-btn" onClick={handleSaveMetrics} disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {editingMetricTargets && (
              <div className="pb-edit-card">
                <div className="pb-edit-header">
                  <h3>Body Metric Targets</h3>
                  <button className="pb-edit-close" onClick={() => {
                    setEditingMetricTargets(false);
                    setMetricTargetsForm(metricTargets);
                  }}>&times;</button>
                </div>
                <div className="pb-edit-body">
                  <p className="pb-target-hint">Set targets for your body measurements. Your current measurement is captured automatically.</p>
                  {BODY_METRICS.map(m => {
                    const currentVal = currentRecord?.bodyMetrics?.[m.key];
                    return (
                      <div key={m.key} className="pb-edit-exercise">
                        <div className="pb-edit-exercise-header">
                          <div className="pb-edit-exercise-name">{m.name}</div>
                          <div className="pb-edit-current-best">Current: {currentVal != null ? `${currentVal} ${m.suffix}` : '-'}</div>
                        </div>
                        <div className="pb-edit-row">
                          <div className="pb-edit-field full">
                            <label>Target ({m.suffix})</label>
                            <input
                              type="number"
                              step="0.1"
                              value={metricTargetsForm[m.key]?.targetValue ?? ''}
                              onChange={(e) => handleMetricTargetChange(m.key, e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="pb-edit-actions">
                  <button className="pb-cancel-btn" onClick={() => {
                    setEditingMetricTargets(false);
                    setMetricTargetsForm(metricTargets);
                  }}>Cancel</button>
                  <button className="pb-save-btn" onClick={handleSaveMetricTargets} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Targets'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== HISTORY TAB ====== */}
        {activeTab === 'history' && (
          <div className="pb-history-section">
            {records.length === 0 ? (
              <div className="pb-empty">
                <h4>No records yet</h4>
                <p>Start adding your monthly benchmarks and measurements to track your progress over time.</p>
              </div>
            ) : (
              <>
                {/* Achievements Wall */}
                {achievements.length > 0 && (
                  <div className="pb-achievements-wall">
                    <h4 className="pb-achievements-wall-title">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                      Targets Achieved
                    </h4>
                    <div className="pb-achievements-list">
                      {[...achievements].reverse().map((badge, i) => (
                        <div key={i} className="pb-achievement-item" style={{ animationDelay: `${i * 0.05}s` }}>
                          <div className="pb-achievement-star">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                          </div>
                          <div className="pb-achievement-info">
                            <span className="pb-achievement-label">{badge.label}</span>
                            <span className="pb-achievement-date">{formatMonthLabel(badge.achievedMonth)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Compare toggle */}
                <div className="pb-history-controls">
                  <button
                    className={`pb-compare-toggle ${compareMode ? 'active' : ''}`}
                    onClick={() => {
                      setCompareMode(!compareMode);
                      if (!compareMode && records.length >= 2) {
                        setCompareA(records[0].month);
                        setCompareB(records[records.length - 1].month);
                      }
                    }}
                  >
                    {compareMode ? 'Back to Timeline' : 'Compare Months'}
                  </button>
                </div>

                {!compareMode ? (
                  /* Timeline View */
                  <div className="pb-timeline">
                    {[...records].reverse().map((record, idx) => {
                      const prevRecord = records.find(r => r.month < record.month && records.indexOf(r) === records.indexOf(record) - 1)
                        || records.filter(r => r.month < record.month).pop();
                      return (
                        <div key={record.id} className="pb-timeline-item" style={{ animationDelay: `${idx * 0.05}s` }}>
                          <div className="pb-timeline-dot"></div>
                          <div className="pb-timeline-card">
                            <h4>{formatMonthLabel(record.month)}</h4>

                            {/* Benchmarks */}
                            {record.benchmarks && Object.keys(record.benchmarks).length > 0 && (
                              <div className="pb-timeline-group">
                                <h5>Strength Benchmarks</h5>
                                {EXERCISES.map(ex => {
                                  const bench = record.benchmarks[ex.key];
                                  if (!bench) return null;
                                  const prevBench = prevRecord?.benchmarks?.[ex.key];
                                  const curVal = getComparableValue(ex, bench);
                                  const prvVal = getComparableValue(ex, prevBench);
                                  const pct = calcPercentChange(curVal, prvVal);
                                  return (
                                    <div key={ex.key} className="pb-timeline-row">
                                      <span className="pb-timeline-label">{ex.name}</span>
                                      <div className="pb-timeline-values">
                                        <span className="pb-timeline-value">
                                          {ex.unit === 'time' ? formatPlankTime(bench.time) : formatWeight(bench.weight, bench.reps)}
                                        </span>
                                        {pct !== null && (
                                          <span className={`pb-timeline-change ${pct >= 0 ? 'positive' : 'negative'}`}>
                                            {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Body Metrics */}
                            {record.bodyMetrics && Object.keys(record.bodyMetrics).length > 0 && (
                              <div className="pb-timeline-group">
                                <h5>Body Measurements</h5>
                                {BODY_METRICS.map(m => {
                                  const val = record.bodyMetrics[m.key];
                                  if (val == null) return null;
                                  const prevVal = prevRecord?.bodyMetrics?.[m.key];
                                  const diff = prevVal != null ? parseFloat((val - prevVal).toFixed(2)) : null;
                                  return (
                                    <div key={m.key} className="pb-timeline-row">
                                      <span className="pb-timeline-label">{m.name}</span>
                                      <div className="pb-timeline-values">
                                        <span className="pb-timeline-value">{val} {m.suffix}</span>
                                        {diff !== null && (
                                          <span className={`pb-timeline-change ${diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral'}`}>
                                            {diff > 0 ? '+' : ''}{diff} {m.suffix}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Compare View */
                  <div className="pb-compare">
                    <div className="pb-compare-selectors">
                      <div className="pb-compare-select">
                        <label>From</label>
                        <select value={compareA} onChange={(e) => setCompareA(e.target.value)}>
                          {records.map(r => (
                            <option key={r.month} value={r.month}>{formatMonthLabel(r.month)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="pb-compare-vs">vs</div>
                      <div className="pb-compare-select">
                        <label>To</label>
                        <select value={compareB} onChange={(e) => setCompareB(e.target.value)}>
                          {records.map(r => (
                            <option key={r.month} value={r.month}>{formatMonthLabel(r.month)}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {recordA && recordB && (
                      <div className="pb-compare-results">
                        {/* Benchmarks comparison */}
                        <div className="pb-compare-group">
                          <h4>Strength Benchmarks</h4>
                          <div className="pb-compare-table">
                            <div className="pb-compare-header-row">
                              <span>Exercise</span>
                              <span>{formatMonthLabel(compareA).split(' ')[0]}</span>
                              <span>{formatMonthLabel(compareB).split(' ')[0]}</span>
                              <span>Change</span>
                            </div>
                            {EXERCISES.map(ex => {
                              const benchA = recordA.benchmarks?.[ex.key];
                              const benchB = recordB.benchmarks?.[ex.key];
                              const valA = getComparableValue(ex, benchA);
                              const valB = getComparableValue(ex, benchB);
                              const pct = calcPercentChange(valB, valA);
                              return (
                                <div key={ex.key} className="pb-compare-row">
                                  <span className="pb-compare-name">{ex.name}</span>
                                  <span className="pb-compare-val">
                                    {benchA ? (ex.unit === 'time' ? formatPlankTime(benchA.time) : `${benchA.weight}x${benchA.reps}`) : '-'}
                                  </span>
                                  <span className="pb-compare-val">
                                    {benchB ? (ex.unit === 'time' ? formatPlankTime(benchB.time) : `${benchB.weight}x${benchB.reps}`) : '-'}
                                  </span>
                                  <span className={`pb-compare-change ${pct !== null ? (pct >= 0 ? 'positive' : 'negative') : ''}`}>
                                    {pct !== null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : '-'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Body metrics comparison */}
                        <div className="pb-compare-group">
                          <h4>Body Measurements</h4>
                          <div className="pb-compare-table">
                            <div className="pb-compare-header-row">
                              <span>Measurement</span>
                              <span>{formatMonthLabel(compareA).split(' ')[0]}</span>
                              <span>{formatMonthLabel(compareB).split(' ')[0]}</span>
                              <span>Change</span>
                            </div>
                            {BODY_METRICS.map(m => {
                              const valA = recordA.bodyMetrics?.[m.key];
                              const valB = recordB.bodyMetrics?.[m.key];
                              const diff = valA != null && valB != null ? parseFloat((valB - valA).toFixed(2)) : null;
                              return (
                                <div key={m.key} className="pb-compare-row">
                                  <span className="pb-compare-name">{m.name}</span>
                                  <span className="pb-compare-val">{valA != null ? `${valA}` : '-'}</span>
                                  <span className="pb-compare-val">{valB != null ? `${valB}` : '-'}</span>
                                  <span className={`pb-compare-change ${diff !== null ? (diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral') : ''}`}>
                                    {diff !== null ? `${diff > 0 ? '+' : ''}${diff} ${m.suffix}` : '-'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        </>}
      </main>

      {/* Achievement Celebration */}
      {celebration && (
        <div className="pb-celebration-overlay" onClick={() => setCelebration(null)}>
          <div className="pb-celebration-card">
            <div className="pb-celebration-icon">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </div>
            <h3 className="pb-celebration-title">
              {celebration.length === 1 ? 'Target Achieved!' : `${celebration.length} Targets Achieved!`}
            </h3>
            <div className="pb-celebration-badges">
              {celebration.map((badge, i) => (
                <div key={i} className="pb-celebration-badge">{badge.label}</div>
              ))}
            </div>
            <p className="pb-celebration-sub">Tap to dismiss</p>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? (
              <svg className="success-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path className="check-path" d="M5 13 L9 17 L19 7" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            )}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)}>&times;</button>
        </div>
      )}

      {/* Bottom Tab Nav — block clients only */}
      {isBlockClient && (
        <nav className="block-bottom-nav">
          <button className="block-nav-tab" onClick={() => navigate('/client')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span>Home</span>
          </button>
          <button className="block-nav-tab" onClick={() => navigate('/client/forms')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span>Forms</span>
          </button>
          <button className="block-nav-tab" onClick={() => navigate('/client/tools')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            <span>Tools</span>
          </button>
          <button className="block-nav-tab active">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
            <span>PBs</span>
          </button>
          {clientData?.circuitAccess && (
            <button className="block-nav-tab" onClick={() => navigate('/client/circuit')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              <span>Circuit</span>
            </button>
          )}
        </nav>
      )}

      {/* Core Buddy Bottom Nav */}
      {coreBuddyMode && <CoreBuddyNav active="progress" />}
    </div>
    </PullToRefresh>
  );
}
