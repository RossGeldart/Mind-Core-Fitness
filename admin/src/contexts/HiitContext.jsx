import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const HiitContext = createContext();

const STORAGE_KEY = 'hiit_settings';
const HISTORY_KEY = 'hiit_history';

const DEFAULT_SETTINGS = {
  warmUpTime: 0,
  audioGuide: 'beeps',
  audioVolume: 100,
  dailyReminders: false,
  scheduledDays: [],
  scheduledTime: '16:00',
  pauseOnLeave: true,
  loudOverMusic: true,
  vibration: false,
  speakExerciseName: false,
  screenWakeLock: true,
  countdownLength: 3,
};

const DEFAULT_TIMER = {
  work: 30,
  rest: 30,
  exercises: 1,
  rounds: 8,
  roundReset: 30,
  mode: 'hiit',       // hiit | ascending | descending | pyramid
  workStep: 5,         // seconds added/removed per exercise
  restStep: 0,         // seconds added/removed per exercise (0 = fixed rest)
  scaleRest: false,    // whether rest also scales
  peakWork: 60,        // pyramid peak work time
};

export function HiitProvider({ children }) {
  const [timerConfig, setTimerConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('hiit_timer_config');
      return saved ? { ...DEFAULT_TIMER, ...JSON.parse(saved) } : DEFAULT_TIMER;
    } catch { return DEFAULT_TIMER; }
  });

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });

  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Active timer state
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('idle'); // idle, warmup, work, rest, roundReset, countdown, done
  const [timeLeft, setTimeLeft] = useState(0);
  const [currentExercise, setCurrentExercise] = useState(1);
  const [currentRound, setCurrentRound] = useState(1);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const currentExerciseRef = useRef(1);
  const currentRoundRef = useRef(1);
  const audioCtxRef = useRef(null);

  // Persist
  useEffect(() => {
    localStorage.setItem('hiit_timer_config', JSON.stringify(timerConfig));
  }, [timerConfig]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  // Keep refs in sync with state so advancePhase always reads latest values
  useEffect(() => { currentExerciseRef.current = currentExercise; }, [currentExercise]);
  useEffect(() => { currentRoundRef.current = currentRound; }, [currentRound]);

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateTimerConfig = useCallback((key, value) => {
    setTimerConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  // Get work duration for a specific exercise number (1-indexed)
  const getWorkForExercise = useCallback((exerciseNum) => {
    const { mode, work, workStep, peakWork, exercises } = timerConfig;
    if (mode === 'hiit' || exercises <= 1) return work;
    if (mode === 'ascending') return work + (exerciseNum - 1) * workStep;
    if (mode === 'descending') return Math.max(workStep, work - (exerciseNum - 1) * workStep);
    if (mode === 'pyramid') {
      const mid = Math.ceil(exercises / 2);
      const stepSize = mid > 1 ? (peakWork - work) / (mid - 1) : 0;
      if (exerciseNum <= mid) return Math.round(work + (exerciseNum - 1) * stepSize);
      return Math.round(work + (exercises - exerciseNum) * stepSize);
    }
    return work;
  }, [timerConfig]);

  // Get rest duration for a specific exercise number (1-indexed)
  const getRestForExercise = useCallback((exerciseNum) => {
    const { mode, rest, restStep, scaleRest, exercises } = timerConfig;
    if (!scaleRest || mode === 'hiit' || exercises <= 1) return rest;
    if (mode === 'ascending') return rest + (exerciseNum - 1) * restStep;
    if (mode === 'descending') return Math.max(restStep || 5, rest - (exerciseNum - 1) * restStep);
    if (mode === 'pyramid') {
      const mid = Math.ceil(exercises / 2);
      const stepSize = mid > 1 ? restStep : 0;
      if (exerciseNum <= mid) return rest + (exerciseNum - 1) * stepSize;
      return rest + (exercises - exerciseNum) * stepSize;
    }
    return rest;
  }, [timerConfig]);

  // Calculate total workout time
  const totalWorkoutTime = useCallback(() => {
    const { exercises, rounds, roundReset } = timerConfig;
    let exerciseTime = 0;
    for (let i = 1; i <= exercises; i++) {
      exerciseTime += getWorkForExercise(i);
      if (i < exercises) exerciseTime += getRestForExercise(i);
    }
    const roundTime = exerciseTime + roundReset;
    const total = roundTime * rounds - roundReset;
    return Math.max(0, total + settings.warmUpTime);
  }, [timerConfig, settings.warmUpTime, getWorkForExercise, getRestForExercise]);

  // Get or create a persistent AudioContext (reuse so iOS doesn't block after first beep)
  const getAudioCtx = useCallback(() => {
    try {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        // Resume if suspended (iOS suspends after tab switch)
        if (audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
        }
        return audioCtxRef.current;
      }
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  // Play beep sound
  const playBeep = useCallback((type = 'tick') => {
    if (isMuted || settings.audioGuide === 'muted') return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const vol = settings.audioVolume / 100;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = vol * 0.3;

      if (type === 'halfway') {
        // Distinct double-chirp for halfway mark
        osc.frequency.value = 550;
        osc.type = 'square';
        gain.gain.value = vol * 0.25;
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
        // Second chirp
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        gain2.gain.value = vol * 0.25;
        osc2.frequency.value = 700;
        osc2.type = 'square';
        osc2.start(ctx.currentTime + 0.12);
        osc2.stop(ctx.currentTime + 0.2);
        return;
      } else if (type === 'countdown3') {
        osc.frequency.value = 660;
        osc.type = 'sine';
        gain.gain.value = vol * 0.5;
      } else if (type === 'countdown2') {
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.value = vol * 0.5;
      } else if (type === 'countdown1') {
        osc.frequency.value = 1100;
        osc.type = 'sine';
        gain.gain.value = vol * 0.6;
      } else if (type === 'countdown') {
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.value = vol * 0.5;
      } else if (type === 'go') {
        osc.frequency.value = 1200;
        osc.type = 'sine';
        gain.gain.value = vol * 0.6;
      } else if (type === 'rest') {
        osc.frequency.value = 440;
        osc.type = 'triangle';
      } else if (type === 'done') {
        osc.frequency.value = 1000;
        osc.type = 'sine';
        gain.gain.value = vol * 0.7;
      } else {
        osc.frequency.value = 660;
        osc.type = 'sine';
      }

      osc.start();
      osc.stop(ctx.currentTime + (type === 'go' || type === 'done' ? 0.3 : 0.1));
    } catch {
      // Audio not available
    }
  }, [isMuted, settings.audioGuide, settings.audioVolume, getAudioCtx]);

  // Vibrate
  const vibrate = useCallback((pattern = [50]) => {
    if (!settings.vibration) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {
      // Vibration not available
    }
  }, [settings.vibration]);

  // Speak phase name (Voice mode or exercise announce)
  const speak = useCallback((text) => {
    if (isMuted || settings.audioGuide === 'muted') return;
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.1;
      utterance.volume = settings.audioVolume / 100;
      utterance.lang = 'en-GB';
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech not available
    }
  }, [isMuted, settings.audioGuide, settings.audioVolume]);

  // Advance to next phase
  const advancePhase = useCallback(() => {
    const { exercises, rounds, roundReset } = timerConfig;

    setCurrentPhase(prev => {
      // Read latest values from refs to avoid stale closure
      const exNow = currentExerciseRef.current;
      const rdNow = currentRoundRef.current;

      if (prev === 'countdown') {
        playBeep('go');
        vibrate([100, 50, 100]);
        if (settings.warmUpTime > 0) {
          if (settings.audioGuide === 'en') speak('Warm up');
          setTimeLeft(settings.warmUpTime);
          return 'warmup';
        }
        if (settings.audioGuide === 'en') speak('Work');
        else if (settings.speakExerciseName) speak('Exercise 1');
        setTimeLeft(getWorkForExercise(1));
        return 'work';
      }

      if (prev === 'warmup') {
        playBeep('go');
        vibrate([100, 50, 100]);
        if (settings.audioGuide === 'en') speak('Work');
        else if (settings.speakExerciseName) speak('Exercise 1');
        setTimeLeft(getWorkForExercise(1));
        setCurrentExercise(1);
        currentExerciseRef.current = 1;
        setCurrentRound(1);
        currentRoundRef.current = 1;
        return 'work';
      }

      if (prev === 'work') {
        // Check if last exercise in last round
        if (exNow >= exercises && rdNow >= rounds) {
          playBeep('done');
          vibrate([200, 100, 200, 100, 200]);
          if (settings.audioGuide === 'en') speak('Workout complete. Well done!');
          setTimeLeft(0);
          return 'done';
        }

        // Check if last exercise in current round
        if (exNow >= exercises) {
          playBeep('rest');
          vibrate([50]);
          if (settings.audioGuide === 'en') speak('Round rest');
          setTimeLeft(roundReset);
          return 'roundReset';
        }

        // Move to rest between exercises
        playBeep('rest');
        vibrate([50]);
        if (settings.audioGuide === 'en') speak('Rest');
        setTimeLeft(getRestForExercise(exNow));
        return 'rest';
      }

      if (prev === 'rest') {
        playBeep('go');
        vibrate([100]);
        const nextEx = exNow + 1;
        setCurrentExercise(nextEx);
        currentExerciseRef.current = nextEx;
        if (settings.audioGuide === 'en') speak('Work');
        else if (settings.speakExerciseName) speak(`Exercise ${nextEx}`);
        setTimeLeft(getWorkForExercise(nextEx));
        return 'work';
      }

      if (prev === 'roundReset') {
        playBeep('go');
        vibrate([100, 50, 100]);
        const nextRd = rdNow + 1;
        setCurrentRound(nextRd);
        currentRoundRef.current = nextRd;
        setCurrentExercise(1);
        currentExerciseRef.current = 1;
        if (settings.audioGuide === 'en') speak(`Round ${nextRd}. Work!`);
        else if (settings.speakExerciseName) speak('Exercise 1');
        setTimeLeft(getWorkForExercise(1));
        return 'work';
      }

      return prev;
    });
  }, [timerConfig, settings.warmUpTime, settings.audioGuide, settings.speakExerciseName, playBeep, vibrate, speak, getWorkForExercise, getRestForExercise]);

  // Start timer
  const startTimer = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
    setCurrentPhase('countdown');
    setTimeLeft(3); // 3-2-1 countdown
    setCurrentExercise(1);
    currentExerciseRef.current = 1;
    setCurrentRound(1);
    currentRoundRef.current = 1;
    setTotalElapsed(0);
    startTimeRef.current = Date.now();
  }, []);

  // Pause/Resume
  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev);
  }, []);

  // Stop timer
  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const elapsed = totalElapsed;
    if (elapsed > 5) {
      const entry = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        config: { ...timerConfig },
        duration: elapsed,
        completed: currentPhase === 'done',
      };
      setHistory(prev => [entry, ...prev]);
    }
    setIsRunning(false);
    setIsPaused(false);
    setCurrentPhase('idle');
    setTimeLeft(0);
    setCurrentExercise(1);
    currentExerciseRef.current = 1;
    setCurrentRound(1);
    currentRoundRef.current = 1;
    setTotalElapsed(0);
    // Close audio context to free resources
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, [totalElapsed, timerConfig, currentPhase]);

  // Skip current phase
  const skipPhase = useCallback(() => {
    setTimeLeft(0);
  }, []);

  // Timer tick
  useEffect(() => {
    if (!isRunning || isPaused || currentPhase === 'idle' || currentPhase === 'done') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          advancePhase();
          return prev; // advancePhase sets new timeLeft
        }
        const next = prev - 1;
        // 3-2-1 countdown with ascending pitch (all phases including initial countdown)
        if (next === 3) { playBeep('countdown3'); vibrate([30]); }
        else if (next === 2) { playBeep('countdown2'); vibrate([30]); }
        else if (next === 1) { playBeep('countdown1'); vibrate([30]); }
        // Halfway chirp during work phase
        if (currentPhase === 'work') {
          const curWorkDur = getWorkForExercise(currentExerciseRef.current);
          if (curWorkDur >= 10) {
            const half = Math.floor(curWorkDur / 2);
            if (next === half) {
              playBeep('halfway');
              vibrate([20, 40, 20]);
            }
          }
        }
        // Halfway chirp during rest phase
        if (currentPhase === 'rest') {
          const curRestDur = getRestForExercise(currentExerciseRef.current);
          if (curRestDur >= 10) {
            const half = Math.floor(curRestDur / 2);
            if (next === half) {
              playBeep('halfway');
              vibrate([20, 40, 20]);
            }
          }
        }
        return next;
      });
      if (currentPhase !== 'countdown') {
        setTotalElapsed(prev => prev + 1);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, isPaused, currentPhase, advancePhase, playBeep, vibrate, timerConfig, getWorkForExercise, getRestForExercise]);

  // Handle page visibility for pause-on-leave
  useEffect(() => {
    if (!settings.pauseOnLeave || !isRunning) return;
    const handler = () => {
      if (document.hidden && !isPaused) {
        setIsPaused(true);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [settings.pauseOnLeave, isRunning, isPaused]);

  // Screen wake lock — keep screen on during workout
  useEffect(() => {
    if (!isRunning || !settings.screenWakeLock) return;
    let wakeLock = null;
    const request = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake lock not available or denied
      }
    };
    request();
    // Re-acquire on visibility change (browsers release on tab switch)
    const reacquire = () => {
      if (document.visibilityState === 'visible' && isRunning) request();
    };
    document.addEventListener('visibilitychange', reacquire);
    return () => {
      document.removeEventListener('visibilitychange', reacquire);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [isRunning, settings.screenWakeLock]);

  // Load previous workout config
  const loadPreviousWorkout = useCallback(() => {
    if (history.length > 0) {
      setTimerConfig(history[0].config);
    }
  }, [history]);

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  // Statistics calculations
  const getStats = useCallback((period = 'all') => {
    let filtered = history;
    const now = new Date();

    if (period === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = history.filter(h => new Date(h.date) >= weekAgo);
    } else if (period === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = history.filter(h => new Date(h.date) >= monthAgo);
    }

    const totalTime = filtered.reduce((sum, h) => sum + h.duration, 0);
    const completed = filtered.filter(h => h.completed).length;

    // Calculate streak
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today.getTime() - i * dayMs);
      const hasWorkout = filtered.some(h => {
        const d = new Date(h.date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === checkDate.getTime();
      });
      if (hasWorkout) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return { totalTime, completed, streak, total: filtered.length };
  }, [history]);

  return (
    <HiitContext.Provider value={{
      // Timer config
      timerConfig, updateTimerConfig,
      // Settings
      settings, updateSetting,
      // Active timer
      isRunning, isPaused, currentPhase, timeLeft, currentExercise, currentRound,
      totalElapsed, isMuted, setIsMuted,
      startTimer, togglePause, stopTimer, skipPhase,
      // History
      history, loadPreviousWorkout, clearHistory,
      // Stats
      getStats,
      // Computed
      totalWorkoutTime, getWorkForExercise, getRestForExercise,
    }}>
      {children}
    </HiitContext.Provider>
  );
}

export function useHiit() {
  const ctx = useContext(HiitContext);
  if (!ctx) throw new Error('useHiit must be used within HiitProvider');
  return ctx;
}
