import { useHiit } from '../contexts/HiitContext';
import './HiitActiveTimer.css';

const PHASE_LABELS = {
  countdown: 'GET READY',
  warmup: 'WARM UP',
  work: 'WORK',
  rest: 'REST',
  roundReset: 'ROUND BREAK',
  done: 'COMPLETE!',
};

const PHASE_COLORS = {
  countdown: 'var(--text-tertiary)',
  warmup: '#FF9800',
  work: 'var(--color-primary)',
  rest: '#4CAF50',
  roundReset: '#2196F3',
  done: '#4CAF50',
};

export default function HiitActiveTimer() {
  const {
    timerConfig, currentPhase, timeLeft, currentExercise, currentRound,
    totalElapsed, isPaused, isMuted, setIsMuted,
    togglePause, stopTimer, skipPhase,
  } = useHiit();

  const { work, rest, exercises, rounds } = timerConfig;

  // Calculate progress for ring
  let phaseDuration = 3; // countdown
  if (currentPhase === 'warmup') phaseDuration = timerConfig.warmUpTime || 1;
  else if (currentPhase === 'work') phaseDuration = work;
  else if (currentPhase === 'rest') phaseDuration = rest;
  else if (currentPhase === 'roundReset') phaseDuration = timerConfig.roundReset;
  else if (currentPhase === 'done') phaseDuration = 1;

  const progress = currentPhase === 'done' ? 1 : 1 - (timeLeft / phaseDuration);
  const ringRadius = 120;
  const circumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = circumference * (1 - progress);

  // Format time display
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  // Format total elapsed
  const elMin = Math.floor(totalElapsed / 60);
  const elSec = totalElapsed % 60;

  // Exercise dots
  const exerciseDots = Array.from({ length: exercises }, (_, i) => i + 1);
  // Round dots
  const roundDots = Array.from({ length: rounds }, (_, i) => i + 1);

  return (
    <div className="hiit-active" style={{ '--phase-color': PHASE_COLORS[currentPhase] || 'var(--color-primary)' }}>
      {/* Phase label */}
      <div className="hiit-active-phase">
        {PHASE_LABELS[currentPhase] || ''}
      </div>

      {/* Round indicator */}
      {currentPhase !== 'countdown' && currentPhase !== 'done' && (
        <div className="hiit-active-round-label">
          Round {currentRound} of {rounds}
        </div>
      )}

      {/* Circular progress ring */}
      <div className="hiit-active-ring-container">
        <svg className="hiit-active-ring" viewBox="0 0 280 280">
          {/* Background circle */}
          <circle
            cx="140" cy="140" r={ringRadius}
            fill="none"
            stroke="var(--border-color)"
            strokeWidth="10"
          />
          {/* Progress arc */}
          <circle
            cx="140" cy="140" r={ringRadius}
            fill="none"
            stroke="var(--phase-color)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 140 140)"
            style={{ transition: 'stroke-dashoffset 0.3s linear' }}
          />
        </svg>

        {/* Center content */}
        <div className="hiit-active-center">
          {currentPhase === 'done' ? (
            <div className="hiit-active-done-check">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
          ) : (
            <>
              <span className="hiit-active-time-digits">
                {String(minutes).padStart(2, '0')}
              </span>
              <span className="hiit-active-time-colon">:</span>
              <span className="hiit-active-time-digits">
                {String(seconds).padStart(2, '0')}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Exercise dots */}
      {currentPhase !== 'countdown' && currentPhase !== 'done' && exercises > 1 && (
        <div className="hiit-active-dots">
          {exerciseDots.map(dot => (
            <span
              key={`e-${dot}`}
              className={`hiit-dot${dot === currentExercise ? ' active' : ''}${dot < currentExercise ? ' completed' : ''}`}
            />
          ))}
        </div>
      )}

      {/* Round dots */}
      {currentPhase !== 'countdown' && currentPhase !== 'done' && rounds > 1 && (
        <div className="hiit-active-dots round-dots">
          {roundDots.map(dot => (
            <span
              key={`r-${dot}`}
              className={`hiit-dot round${dot === currentRound ? ' active' : ''}${dot < currentRound ? ' completed' : ''}`}
            />
          ))}
        </div>
      )}

      {/* Total elapsed */}
      <div className="hiit-active-elapsed">
        Total: {String(elMin).padStart(2, '0')}:{String(elSec).padStart(2, '0')}
      </div>

      {/* Controls */}
      <div className="hiit-active-controls">
        {/* Mute button */}
        <button className="hiit-ctrl-btn" onClick={() => setIsMuted(!isMuted)} aria-label={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          )}
        </button>

        {/* Pause/Resume or Finish button */}
        {currentPhase === 'done' ? (
          <button className="hiit-ctrl-btn primary large" onClick={stopTimer} aria-label="Finish">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
        ) : (
          <button className="hiit-ctrl-btn primary large" onClick={togglePause} aria-label={isPaused ? 'Resume' : 'Pause'}>
            {isPaused ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            )}
          </button>
        )}

        {/* Skip / Stop */}
        {currentPhase !== 'done' ? (
          <button className="hiit-ctrl-btn" onClick={skipPhase} aria-label="Skip">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <polygon points="5 4 15 12 5 20 5 4"/><rect x="17" y="4" width="3" height="16" rx="1"/>
            </svg>
          </button>
        ) : (
          <div style={{ width: 52 }} />
        )}
      </div>

      {/* Stop button (always visible during active, except done) */}
      {currentPhase !== 'done' && (
        <button className="hiit-stop-btn" onClick={stopTimer}>
          Stop Workout
        </button>
      )}
    </div>
  );
}
