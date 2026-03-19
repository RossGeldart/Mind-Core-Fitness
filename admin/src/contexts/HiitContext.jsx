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
};

const DEFAULT_TIMER = {
  work: 30,
  rest: 30,
  exercises: 1,
  rounds: 8,
  roundReset: 30,
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

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateTimerConfig = useCallback((key, value) => {
    setTimerConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  // Calculate total workout time
  const totalWorkoutTime = useCallback(() => {
    const { work, rest, exercises, rounds, roundReset } = timerConfig;
    const exerciseTime = (work + rest) * exercises - rest; // no rest after last exercise
    const roundTime = exerciseTime + roundReset;
    const total = roundTime * rounds - roundReset; // no reset after last round
    return Math.max(0, total + settings.warmUpTime);
  }, [timerConfig, settings.warmUpTime]);

  // Play beep sound
  const playBeep = useCallback((type = 'tick') => {
    if (isMuted || settings.audioGuide === 'muted') return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = (settings.audioVolume / 100) * 0.3;

      if (type === 'countdown') {
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.value = (settings.audioVolume / 100) * 0.5;
      } else if (type === 'go') {
        osc.frequency.value = 1200;
        osc.type = 'sine';
        gain.gain.value = (settings.audioVolume / 100) * 0.6;
      } else if (type === 'rest') {
        osc.frequency.value = 440;
        osc.type = 'triangle';
      } else if (type === 'done') {
        osc.frequency.value = 1000;
        osc.type = 'sine';
        gain.gain.value = (settings.audioVolume / 100) * 0.7;
      } else {
        osc.frequency.value = 660;
        osc.type = 'sine';
      }

      osc.start();
      osc.stop(ctx.currentTime + (type === 'go' || type === 'done' ? 0.3 : 0.1));
      setTimeout(() => ctx.close(), 500);
    } catch {
      // Audio not available
    }
  }, [isMuted, settings.audioGuide, settings.audioVolume]);

  // Vibrate
  const vibrate = useCallback((pattern = [50]) => {
    if (!settings.vibration) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {
      // Vibration not available
    }
  }, [settings.vibration]);

  // Advance to next phase
  const advancePhase = useCallback(() => {
    const { work, rest, exercises, rounds, roundReset } = timerConfig;

    setCurrentPhase(prev => {
      if (prev === 'countdown') {
        playBeep('go');
        vibrate([100, 50, 100]);
        if (settings.warmUpTime > 0) {
          setTimeLeft(settings.warmUpTime);
          return 'warmup';
        }
        setTimeLeft(work);
        return 'work';
      }

      if (prev === 'warmup') {
        playBeep('go');
        vibrate([100, 50, 100]);
        setTimeLeft(work);
        setCurrentExercise(1);
        setCurrentRound(1);
        return 'work';
      }

      if (prev === 'work') {
        // Check if last exercise in last round
        if (currentExercise >= exercises && currentRound >= rounds) {
          playBeep('done');
          vibrate([200, 100, 200, 100, 200]);
          setTimeLeft(0);
          return 'done';
        }

        // Check if last exercise in current round
        if (currentExercise >= exercises) {
          playBeep('rest');
          vibrate([50]);
          setTimeLeft(roundReset);
          return 'roundReset';
        }

        // Move to rest between exercises
        playBeep('rest');
        vibrate([50]);
        setTimeLeft(rest);
        return 'rest';
      }

      if (prev === 'rest') {
        playBeep('go');
        vibrate([100]);
        setCurrentExercise(e => e + 1);
        setTimeLeft(work);
        return 'work';
      }

      if (prev === 'roundReset') {
        playBeep('go');
        vibrate([100, 50, 100]);
        setCurrentRound(r => r + 1);
        setCurrentExercise(1);
        setTimeLeft(work);
        return 'work';
      }

      return prev;
    });
  }, [timerConfig, currentExercise, currentRound, settings.warmUpTime, playBeep, vibrate]);

  // Start timer
  const startTimer = useCallback(() => {
    setIsRunning(true);
    setIsPaused(false);
    setCurrentPhase('countdown');
    setTimeLeft(3); // 3-2-1 countdown
    setCurrentExercise(1);
    setCurrentRound(1);
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
    setCurrentRound(1);
    setTotalElapsed(0);
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
        // Countdown beeps for last 3 seconds
        if (prev <= 4 && prev > 1 && currentPhase !== 'countdown') {
          playBeep('countdown');
          vibrate([30]);
        }
        return prev - 1;
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
  }, [isRunning, isPaused, currentPhase, advancePhase, playBeep, vibrate]);

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
      totalWorkoutTime,
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
