import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/TierContext';
import { useHiit, CATEGORIES } from '../contexts/HiitContext';
import HiitNav from '../components/HiitNav';
import HiitScrollPicker from '../components/HiitScrollPicker';
import HiitActiveTimer from '../components/HiitActiveTimer';
import './HiitTimer.css';

const formatTime = (seconds) => {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
};

const MODES = [
  { value: 'hiit', label: 'HIIT' },
  { value: 'ascending', label: 'Ascending' },
  { value: 'descending', label: 'Descending' },
  { value: 'pyramid', label: 'Pyramid' },
];

const TIME_VALUES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 90, 120];
const STEP_VALUES = [5, 10, 15, 20, 25, 30];
const COUNT_VALUES = Array.from({ length: 20 }, (_, i) => i + 1);
const RESET_VALUES = [0, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120];

const ICONS = {
  work: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  rest: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
    </svg>
  ),
  exercises: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF9800" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 9h2v6H1V9zM4 7h2v10H4V7zM18 7h2v10h-2V7zM21 9h2v6h-2V9zM7 11h10v2H7z"/>
    </svg>
  ),
  rounds: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2196F3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  ),
  roundReset: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9C27B0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  step: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF5722" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  ),
  peak: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E91E63" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 22h20L12 2z"/>
    </svg>
  ),
  restStep: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#66BB6A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  ),
};

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

const PREMIUM_MODES = ['ascending', 'descending', 'pyramid'];

export default function HiitTimer() {
  const { currentUser } = useAuth();
  const { isHiitPremium } = useTier();
  const navigate = useNavigate();
  const { timerConfig, updateTimerConfig, isRunning, loadPreviousWorkout, history, totalWorkoutTime, startTimer, getWorkForExercise, getRestForExercise, hiitTheme, saveToLibrary } = useHiit();
  const [pickerOpen, setPickerOpen] = useState(null);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCategory, setSaveCategory] = useState('custom');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!saveName.trim()) return;
    saveToLibrary(saveName.trim(), saveCategory);
    setSaveName('');
    setShowSave(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (isRunning) {
    return <HiitActiveTimer />;
  }

  const mode = timerConfig.mode || 'hiit';
  const isScaled = mode !== 'hiit';
  const isPyramid = mode === 'pyramid';

  const totalSecs = totalWorkoutTime();
  const totalMin = Math.floor(totalSecs / 60);
  const totalRemSec = totalSecs % 60;
  const totalDisplay = totalMin > 0
    ? `${totalMin}:${String(totalRemSec).padStart(2, '0')}`
    : `0:${String(totalRemSec).padStart(2, '0')}`;

  // Build config rows dynamically based on mode
  const rows = [
    { key: 'work', label: isScaled ? 'Start Work' : 'Work', icon: ICONS.work, values: TIME_VALUES, format: formatTime },
  ];

  if (isPyramid) {
    rows.push({ key: 'peakWork', label: 'Peak Work', icon: ICONS.peak, values: TIME_VALUES, format: formatTime });
  }

  if (isScaled && !isPyramid) {
    rows.push({ key: 'workStep', label: 'Work Step', icon: ICONS.step, values: STEP_VALUES, format: (v) => `+${v}s` });
  }

  rows.push(
    { key: 'rest', label: 'Rest', icon: ICONS.rest, values: TIME_VALUES, format: formatTime },
  );

  if (isScaled && timerConfig.scaleRest) {
    rows.push({ key: 'restStep', label: 'Rest Step', icon: ICONS.restStep, values: STEP_VALUES, format: (v) => `+${v}s` });
  }

  rows.push(
    { key: 'exercises', label: 'Exercises', icon: ICONS.exercises, values: COUNT_VALUES, format: (v) => `${v}` },
    { key: 'rounds', label: 'Rounds', icon: ICONS.rounds, values: COUNT_VALUES, format: (v) => `${v}` },
    { key: 'roundReset', label: 'Round Reset', icon: ICONS.roundReset, values: RESET_VALUES, format: formatTime },
  );

  // Build exercise breakdown for scaled modes
  const exerciseBreakdown = isScaled && timerConfig.exercises > 1 ? (
    Array.from({ length: timerConfig.exercises }, (_, i) => ({
      num: i + 1,
      work: getWorkForExercise(i + 1),
      rest: i < timerConfig.exercises - 1 ? getRestForExercise(i + 1) : null,
    }))
  ) : null;

  return (
    <div className="hiit-page" data-hiit-theme={hiitTheme}>
      <HiitNav title="Timer" />
      <div className="hiit-timer-content">

        {/* Mode pills */}
        <div className="hiit-mode-pills">
          {MODES.map(m => {
            const locked = !isHiitPremium && PREMIUM_MODES.includes(m.value);
            return (
              <button
                key={m.value}
                className={`hiit-mode-pill${mode === m.value ? ' active' : ''}${locked ? ' locked' : ''}`}
                onClick={() => {
                  if (locked) {
                    navigate(!currentUser ? '/signup' : '/hiit/premium');
                  } else {
                    updateTimerConfig('mode', m.value);
                  }
                }}
              >
                {locked && (
                  <svg className="hiit-mode-lock" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                )}
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Config rows */}
        <div className="hiit-config-list">
          {rows.map(row => (
            <button
              key={row.key}
              className="hiit-config-row"
              onClick={() => setPickerOpen(row.key)}
            >
              <div className="hiit-config-left">
                <span className="hiit-config-icon">{row.icon}</span>
                <span className="hiit-config-label">{row.label}</span>
              </div>
              <div className="hiit-config-right">
                <span className="hiit-config-value">{row.format(timerConfig[row.key])}</span>
                <ChevronRight />
              </div>
            </button>
          ))}

          {/* Scale rest toggle — inside the card for scaled modes */}
          {isScaled && (
            <div className="hiit-config-row hiit-config-toggle-row">
              <div className="hiit-config-left">
                <span className="hiit-config-icon">{ICONS.rest}</span>
                <span className="hiit-config-label">Scale rest too?</span>
              </div>
              <label className="hiit-mini-switch">
                <input
                  type="checkbox"
                  checked={timerConfig.scaleRest || false}
                  onChange={(e) => updateTimerConfig('scaleRest', e.target.checked)}
                />
                <span className="hiit-mini-switch-track" />
              </label>
            </div>
          )}
        </div>

        {/* Exercise breakdown preview */}
        {exerciseBreakdown && (
          <div className="hiit-breakdown">
            <span className="hiit-breakdown-title">Exercise breakdown</span>
            <div className="hiit-breakdown-list">
              {exerciseBreakdown.map(ex => (
                <div key={ex.num} className="hiit-breakdown-item">
                  <span className="hiit-breakdown-num">{ex.num}</span>
                  <span className="hiit-breakdown-work">{formatTime(ex.work)}</span>
                  {ex.rest !== null && (
                    <span className="hiit-breakdown-rest">{formatTime(ex.rest)} rest</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Total time display */}
        <div className="hiit-total-time">
          <span className="hiit-total-label">Total time</span>
          <span className="hiit-total-value">{totalDisplay}</span>
        </div>

        {/* Start button */}
        <button className="hiit-start-btn" onClick={startTimer}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="var(--color-primary)" stroke="none">
            <polygon points="6 3 20 12 6 21 6 3"/>
          </svg>
        </button>

        {/* Save / Load row */}
        <div className="hiit-bottom-actions">
          {history.length > 0 && (
            <button className="hiit-action-btn" onClick={loadPreviousWorkout}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
              Load Previous
            </button>
          )}
          <button
            className={`hiit-action-btn${saved ? ' saved' : ''}${!isHiitPremium ? ' locked' : ''}`}
            onClick={() => {
              if (!isHiitPremium) {
                navigate(!currentUser ? '/signup' : '/hiit/premium');
              } else {
                setShowSave(true);
              }
            }}
          >
            {!isHiitPremium && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            )}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            {saved ? 'Saved!' : 'Save Workout'}
          </button>
        </div>

        {/* Save form overlay */}
        {showSave && (
          <div className="hiit-save-overlay" onClick={() => setShowSave(false)}>
            <div className="hiit-save-sheet" onClick={(e) => e.stopPropagation()}>
              <h3 className="hiit-save-title">Save Workout</h3>
              <input
                type="text"
                className="hiit-save-input"
                placeholder="Workout name..."
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                autoFocus
              />
              <div className="hiit-save-cats">
                {CATEGORIES.map(c => (
                  <button
                    key={c.key}
                    className={`hiit-save-cat${saveCategory === c.key ? ' active' : ''}`}
                    onClick={() => setSaveCategory(c.key)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="hiit-save-preview">
                <span>{formatTime(timerConfig.work)} work</span>
                <span>{formatTime(timerConfig.rest)} rest</span>
                <span>{timerConfig.exercises} ex.</span>
                <span>{timerConfig.rounds} rds</span>
              </div>
              <div className="hiit-save-btns">
                <button className="hiit-save-cancel" onClick={() => { setShowSave(false); setSaveName(''); }}>Cancel</button>
                <button className="hiit-save-confirm" onClick={handleSave} disabled={!saveName.trim()}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scroll pickers */}
      {rows.map(row => (
        <HiitScrollPicker
          key={row.key}
          open={pickerOpen === row.key}
          title={row.label}
          values={row.values}
          selected={timerConfig[row.key]}
          format={row.format}
          onSelect={(val) => {
            updateTimerConfig(row.key, val);
            setPickerOpen(null);
          }}
          onClose={() => setPickerOpen(null)}
        />
      ))}
    </div>
  );
}
