import { useHiit } from '../contexts/HiitContext';
import { TICKS_HIIT } from '../utils/ringTicks';
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
  work: '#4CAF50',
  rest: '#3B82F6',
  roundReset: '#3B82F6',
  done: '#4CAF50',
};

function getUpNext(currentPhase, currentExercise, currentRound, exercises, rounds) {
  if (currentPhase === 'countdown') return 'Warm Up';
  if (currentPhase === 'warmup') return 'Work';
  if (currentPhase === 'work') {
    if (currentExercise >= exercises && currentRound >= rounds) return 'Finish';
    if (currentExercise >= exercises) return 'Round Break';
    return 'Rest';
  }
  if (currentPhase === 'rest') return 'Work';
  if (currentPhase === 'roundReset') return 'Work';
  return '';
}

export default function HiitActiveTimer() {
  const {
    timerConfig, currentPhase, timeLeft, currentExercise, currentRound,
    totalElapsed, isPaused, isMuted, setIsMuted,
    togglePause, stopTimer, skipPhase, hiitTheme,
  } = useHiit();

  const { work, rest, exercises, rounds } = timerConfig;

  // Calculate phase duration
  let phaseDuration = 3; // countdown
  if (currentPhase === 'warmup') phaseDuration = timerConfig.warmUpTime || 1;
  else if (currentPhase === 'work') phaseDuration = work;
  else if (currentPhase === 'rest') phaseDuration = rest;
  else if (currentPhase === 'roundReset') phaseDuration = timerConfig.roundReset;
  else if (currentPhase === 'done') phaseDuration = 1;

  // Calculate how many ticks have elapsed (out of 60)
  const elapsed = phaseDuration - timeLeft;
  const ticksElapsed = currentPhase === 'done'
    ? 60
    : Math.min(60, Math.round((elapsed / phaseDuration) * 60));

  // Format time display
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  // Format total elapsed
  const elMin = Math.floor(totalElapsed / 60);
  const elSec = totalElapsed % 60;

  // Up next
  const upNext = getUpNext(currentPhase, currentExercise, currentRound, exercises, rounds);

  // Exercise dots
  const exerciseDots = Array.from({ length: exercises }, (_, i) => i + 1);
  // Round dots
  const roundDots = Array.from({ length: rounds }, (_, i) => i + 1);

  const showTracker = currentPhase !== 'countdown' && currentPhase !== 'done';

  return (
    <div className="hiit-active" data-hiit-theme={hiitTheme} style={{ '--phase-color': PHASE_COLORS[currentPhase] || 'var(--color-primary)' }}>
      {/* Phase label at top */}
      <div className="hiit-active-phase">
        {PHASE_LABELS[currentPhase] || ''}
      </div>

      {/* Tracker cards at top */}
      {showTracker && (
        <div className="hiit-tracker-cards">
          {exercises > 1 && (
            <div className="hiit-tracker-card">
              <span className="hiit-tracker-label">Exercise</span>
              <div className="hiit-tracker-dots">
                {exerciseDots.map(dot => (
                  <span
                    key={`e-${dot}`}
                    className={`hiit-tracker-dot${dot === currentExercise ? ' active' : ''}${dot < currentExercise ? ' completed' : ''}`}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="hiit-tracker-card">
            <span className="hiit-tracker-label">Round</span>
            <div className="hiit-tracker-dots">
              {roundDots.map(dot => (
                <span
                  key={`r-${dot}`}
                  className={`hiit-tracker-dot${dot === currentRound ? ' active' : ''}${dot < currentRound ? ' completed' : ''}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Large tick ring */}
      <div className="hiit-active-ring-container">
        <svg className="hiit-active-ring" viewBox="0 0 280 280">
          {TICKS_HIIT.map((t, i) => {
            const isElapsed = i < ticksElapsed;
            return (
              <line
                key={i}
                x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                className={`hiit-tick ${isElapsed ? 'elapsed' : 'remaining'}`}
                strokeWidth={t.thick ? '3' : '2'}
              />
            );
          })}
        </svg>

        {/* Center content — logo + overlay */}
        <div className="hiit-active-center">
          <div className="hiit-center-logo">
            <img src={`${import.meta.env.BASE_URL}Logo.webp`} alt="MCF" />
          </div>
          <div className="hiit-center-overlay">
            {currentPhase === 'done' ? (
              <div className="hiit-active-done-check">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
            ) : (
              <div className="hiit-center-info">
                <div className="hiit-center-phase-label">
                  {PHASE_LABELS[currentPhase] || ''}
                </div>
                <div className="hiit-center-time">
                  <span className="hiit-active-time-digits">
                    {String(minutes).padStart(2, '0')}
                  </span>
                  <span className="hiit-active-time-colon">:</span>
                  <span className="hiit-active-time-digits">
                    {String(seconds).padStart(2, '0')}
                  </span>
                </div>
                {currentPhase !== 'countdown' && (
                  <div className="hiit-center-elapsed">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {String(elMin).padStart(2, '0')}:{String(elSec).padStart(2, '0')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Exercise label + up next */}
      {showTracker && (
        <div className="hiit-active-info-row">
          <div className="hiit-active-exercise-label">
            EXERCISE {currentExercise}
          </div>
          {upNext && (
            <div className="hiit-active-upnext">
              Up Next: <strong>{upNext}</strong>
            </div>
          )}
        </div>
      )}

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

      {/* Stop button */}
      {currentPhase !== 'done' && (
        <button className="hiit-stop-btn" onClick={stopTimer}>
          Stop Workout
        </button>
      )}
    </div>
  );
}
