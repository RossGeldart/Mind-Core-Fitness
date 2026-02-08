import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CoreBuddyWorkouts.css';

const TICK_COUNT = 60;

const LEVELS = [
  { key: 'beginner', label: 'Beginner', work: 30, rest: 30, desc: '30s work / 30s rest' },
  { key: 'intermediate', label: 'Intermediate', work: 40, rest: 20, desc: '40s work / 20s rest' },
  { key: 'advanced', label: 'Advanced', work: 40, rest: 15, desc: '40s work / 15s rest' },
];

const TIME_OPTIONS = [5, 10, 15, 20, 30];

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
  const [level, setLevel] = useState('intermediate');
  const [duration, setDuration] = useState(15);

  // Exercises from Firebase Storage
  const [allExercises, setAllExercises] = useState([]);
  const [loadingExercises, setLoadingExercises] = useState(false);

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

  // Audio
  const beepRef = useRef(null);
  const goRef = useRef(null);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load exercises from Firebase Storage
  const loadExercises = async () => {
    if (allExercises.length > 0) return allExercises;
    setLoadingExercises(true);
    try {
      const coreRef = ref(storage, 'core');
      const result = await listAll(coreRef);
      const exercises = await Promise.all(
        result.items.map(async (item) => {
          const url = await getDownloadURL(item);
          const name = item.name.replace(/\.mp4$/i, '');
          return { name, videoUrl: url };
        })
      );
      setAllExercises(exercises);
      setLoadingExercises(false);
      return exercises;
    } catch (err) {
      console.error('Error loading exercises:', err);
      showToast('Failed to load exercises. Check your connection.', 'error');
      setLoadingExercises(false);
      return [];
    }
  };

  // Generate random workout
  const generateWorkout = async () => {
    setView('spinning');
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

  if (authLoading) {
    return <div className="cb-loading"><div className="cb-loading-spinner" /></div>;
  }

  // ==================== MENU VIEW ====================
  if (view === 'menu') {
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
        <main className="wk-main">
          <button className="nut-back-btn" onClick={() => navigate(-1)}>&larr; Back</button>
          <div className="wk-menu-cards">
            <button className="wk-menu-card" onClick={() => { setView('setup'); loadExercises(); }}>
              <div className="wk-menu-card-icon wk-icon-random">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
              </div>
              <h3>Random Workout</h3>
              <p>Interval-based workout generated from your exercise library</p>
            </button>
            <button className="wk-menu-card wk-card-disabled">
              <div className="wk-menu-card-icon wk-icon-build">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </div>
              <h3>Build a Programme</h3>
              <p>Coming soon</p>
              <span className="wk-coming-soon-badge">Soon</span>
            </button>
          </div>
        </main>
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

          <div className="wk-setup-section">
            <h2>Select Level</h2>
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
            <h2>Set Time</h2>
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
      <div className="wk-page wk-page-center wk-page-dark" data-theme="dark">
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
      <div className="wk-page wk-page-workout" data-theme="dark">
        {/* Video */}
        <div className="wk-video-container">
          {phase === 'work' ? (
            <video
              key={currentEx.videoUrl}
              className="wk-video"
              src={currentEx.videoUrl}
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <div className="wk-rest-screen">
              <span className="wk-rest-label">REST</span>
              {nextEx && <span className="wk-next-label">Next: {nextEx.name}</span>}
            </div>
          )}
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
          <button className="wk-ctrl-btn" onClick={() => setIsPaused(!isPaused)}>
            {isPaused ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            )}
          </button>
          <button className="wk-ctrl-btn wk-ctrl-stop" onClick={() => { if (confirm('End workout early?')) setView('menu'); }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
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
