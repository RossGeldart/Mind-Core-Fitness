import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './PersonalBests.css';

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
  const [toast, setToast] = useState(null);

  // History compare state
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  // Touch/swipe state for carousel
  const carouselRef = useRef(null);
  const touchStartX = useRef(0);
  const touchDelta = useRef(0);

  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

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
    if (clientData) {
      fetchRecords();
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
    } catch (error) {
      console.error('Error fetching personal bests:', error);
    }
    setLoading(false);
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
        [field]: field === 'targetType' ? value : (value === '' ? '' : parseFloat(value)),
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
        if (targetsForm[ex.key]?.targetValue) {
          const tType = targetsForm[ex.key].targetType || (ex.unit === 'time' ? 'time' : 'weight');
          let autoStart = 0;
          const bench = latestBenchmarks[ex.key];
          if (bench) {
            if (tType === 'weight') autoStart = bench.weight || 0;
            else if (tType === 'reps') autoStart = bench.reps || 0;
            else if (tType === 'time') autoStart = bench.time || 0;
          }
          targetsToSave[ex.key] = {
            targetType: tType,
            targetValue: targetsForm[ex.key].targetValue,
            startValue: autoStart,
          };
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

  // Get progress toward target (0 to 1) based on range from start to target
  const getTargetProgress = (exerciseKey, benchData) => {
    const target = targets[exerciseKey];
    if (!target || !target.targetValue || !benchData) return null;

    const startVal = target.startValue || 0;
    const targetVal = target.targetValue;

    let currentVal = 0;
    if (target.targetType === 'weight') {
      currentVal = benchData.weight || 0;
    } else if (target.targetType === 'reps') {
      currentVal = benchData.reps || 0;
    } else if (target.targetType === 'time') {
      currentVal = benchData.time || 0;
    }

    const range = targetVal - startVal;
    if (range <= 0) return currentVal >= targetVal ? 1 : 0;
    return Math.max(0, Math.min((currentVal - startVal) / range, 1));
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
    if (touchDelta.current < -50 && currentSlide < EXERCISES.length - 1) {
      setCurrentSlide(prev => prev + 1);
    } else if (touchDelta.current > 50 && currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
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
            <img src="/Logo.PNG" alt="Mind Core Fitness" className="header-logo" />
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
    <div className="pb-page">
      <header className="client-header">
        <div className="header-content">
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="header-logo" />
        </div>
      </header>

      <main className="pb-main page-transition-enter">
        <button className="back-btn" onClick={() => navigate('/client')}>&larr; Back</button>

        <div className="pb-intro">
          <h2>Personal Bests</h2>
          <p>Track your strength benchmarks and body measurements each month.</p>
        </div>

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
                  <div className="pb-ring-container">
                    <div className="pb-ring">
                      <svg className="pb-ring-svg" viewBox="0 0 200 200">
                        {[...Array(60)].map((_, i) => {
                          const angle = (i * 6 - 90) * (Math.PI / 180);
                          const innerRadius = 85;
                          const outerRadius = 96;
                          const x1 = 100 + innerRadius * Math.cos(angle);
                          const y1 = 100 + innerRadius * Math.sin(angle);
                          const x2 = 100 + outerRadius * Math.cos(angle);
                          const y2 = 100 + outerRadius * Math.sin(angle);
                          const isFilled = i < Math.round(ringFill);

                          return (
                            <line
                              key={i}
                              x1={x1} y1={y1} x2={x2} y2={y2}
                              className={`pb-ring-tick ${isFilled ? (targetHit ? 'hit' : 'filled') : 'empty'}`}
                              strokeWidth={i % 5 === 0 ? "3" : "2"}
                            />
                          );
                        })}
                      </svg>
                      <div className="pb-ring-center">
                        <div className="pb-ring-category">{currentExercise.category}</div>
                        <div className="pb-ring-exercise">{currentExercise.name}</div>
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
                            {targetHit ? 'Target hit!' : `${currentTarget.startValue || 0} → ${currentTarget.targetValue}`}{' '}
                            {currentTarget.targetType === 'weight' ? 'kg' : currentTarget.targetType === 'reps' ? 'reps' : currentTarget.targetType === 'time' ? 's' : 'kg'}
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
                        onClick={() => setCurrentSlide(i)}
                      />
                    ))}
                  </div>

                  {/* Arrow buttons */}
                  <button
                    className="pb-carousel-arrow left"
                    onClick={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
                    disabled={currentSlide === 0}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                  </button>
                  <button
                    className="pb-carousel-arrow right"
                    onClick={() => setCurrentSlide(prev => Math.min(EXERCISES.length - 1, prev + 1))}
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
                    const targetType = targetsForm[ex.key]?.targetType || (ex.unit === 'time' ? 'time' : 'weight');
                    const unitLabel = targetType === 'weight' ? 'kg' : targetType === 'reps' ? 'reps' : 'seconds';
                    // Show the auto-captured start value from latest benchmark
                    const bench = currentRecord?.benchmarks?.[ex.key];
                    let currentBestDisplay = '-';
                    if (bench) {
                      if (targetType === 'weight' && bench.weight) currentBestDisplay = `${bench.weight}kg`;
                      else if (targetType === 'reps' && bench.reps) currentBestDisplay = `${bench.reps} reps`;
                      else if (targetType === 'time' && bench.time) currentBestDisplay = `${bench.time}s`;
                    }
                    return (
                      <div key={ex.key} className="pb-edit-exercise">
                        <div className="pb-edit-exercise-header">
                          <div className="pb-edit-exercise-name">{ex.name}</div>
                          <div className="pb-edit-current-best">Current: {currentBestDisplay}</div>
                        </div>
                        {ex.unit === 'weight' && (
                          <div className="pb-target-type-toggle">
                            <button
                              type="button"
                              className={targetType === 'weight' ? 'active' : ''}
                              onClick={() => handleTargetChange(ex.key, 'targetType', 'weight')}
                            >
                              Weight
                            </button>
                            <button
                              type="button"
                              className={targetType === 'reps' ? 'active' : ''}
                              onClick={() => handleTargetChange(ex.key, 'targetType', 'reps')}
                            >
                              Reps
                            </button>
                          </div>
                        )}
                        <div className="pb-edit-row">
                          <div className="pb-edit-field full">
                            <label>Target ({unitLabel})</label>
                            <input
                              type="number"
                              step={targetType === 'weight' ? '0.5' : targetType === 'time' ? '1' : '1'}
                              value={targetsForm[ex.key]?.targetValue ?? ''}
                              onChange={(e) => handleTargetChange(ex.key, 'targetValue', e.target.value)}
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
                              <span className="pb-metric-name">{metric.name}</span>
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
      </main>

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
    </div>
  );
}
