import { useState } from 'react';
import { useHiit } from '../contexts/HiitContext';
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

const CONFIG_ROWS = [
  {
    key: 'work',
    label: 'Work',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
    values: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 90, 120],
    format: formatTime,
    suffix: '',
  },
  {
    key: 'rest',
    label: 'Rest',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
      </svg>
    ),
    values: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 90, 120],
    format: formatTime,
    suffix: '',
  },
  {
    key: 'exercises',
    label: 'Exercises',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF9800" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 9h2v6H1V9zM4 7h2v10H4V7zM18 7h2v10h-2V7zM21 9h2v6h-2V9zM7 11h10v2H7z"/>
      </svg>
    ),
    values: Array.from({ length: 20 }, (_, i) => i + 1),
    format: (v) => `${v}`,
    suffix: '',
  },
  {
    key: 'rounds',
    label: 'Rounds',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2196F3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
    ),
    values: Array.from({ length: 20 }, (_, i) => i + 1),
    format: (v) => `${v}`,
    suffix: '',
  },
  {
    key: 'roundReset',
    label: 'Round Reset',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9C27B0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
    values: [0, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120],
    format: formatTime,
    suffix: '',
  },
];

export default function HiitTimer() {
  const { timerConfig, updateTimerConfig, isRunning, loadPreviousWorkout, history, totalWorkoutTime, startTimer } = useHiit();
  const [pickerOpen, setPickerOpen] = useState(null); // key of open picker

  if (isRunning) {
    return <HiitActiveTimer />;
  }

  const totalSecs = totalWorkoutTime();
  const totalMin = Math.floor(totalSecs / 60);
  const totalRemSec = totalSecs % 60;
  const totalDisplay = totalMin > 0
    ? `${totalMin}:${String(totalRemSec).padStart(2, '0')}`
    : `0:${String(totalRemSec).padStart(2, '0')}`;

  return (
    <div className="hiit-page">
      <HiitNav title="Timer" />
      <div className="hiit-timer-content">
        {/* Config rows */}
        <div className="hiit-config-list">
          {CONFIG_ROWS.map(row => (
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* Total time display */}
        <div className="hiit-total-time">
          <span className="hiit-total-label">Total time</span>
          <span className="hiit-total-value">{totalDisplay}</span>
        </div>

        {/* Start button — logo with play overlay */}
        <button className="hiit-start-btn" onClick={startTimer}>
          <div className="hiit-start-logo">
            <img src="/Logo.webp" alt="MCF" />
          </div>
          <div className="hiit-start-overlay">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff" stroke="none">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
        </button>

        {/* Load previous */}
        {history.length > 0 && (
          <button className="hiit-load-prev" onClick={loadPreviousWorkout}>
            Load Previous Workout
          </button>
        )}
      </div>

      {/* Scroll pickers */}
      {CONFIG_ROWS.map(row => (
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
