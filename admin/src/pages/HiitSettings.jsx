import { useHiit } from '../contexts/HiitContext';
import { openExternal } from '../utils/openExternal';
import HiitNav from '../components/HiitNav';
import './HiitSettings.css';

const WARMUP_OPTIONS = [0, 10, 30, 60];
const AUDIO_OPTIONS = [
  { value: 'en', label: 'Voice' },
  { value: 'beeps', label: 'Beeps' },
  { value: 'muted', label: 'Muted' },
];
const COUNTDOWN_OPTIONS = [3, 5, 10];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

const ExternalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

export default function HiitSettings() {
  const { settings, updateSetting, hiitTheme } = useHiit();

  const toggleDay = (day) => {
    const days = settings.scheduledDays || [];
    if (days.includes(day)) {
      updateSetting('scheduledDays', days.filter(d => d !== day));
    } else {
      updateSetting('scheduledDays', [...days, day]);
    }
  };

  return (
    <div className="hiit-page" data-hiit-theme={hiitTheme}>
      <HiitNav title="Settings" />
      <div className="hs-content">

        {/* ====== TIMER ====== */}
        <div className="hs-section">
          <h2 className="hs-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3L2 6"/><path d="M22 6l-3-3"/><path d="M12 2v2"/></svg>
            Timer
          </h2>

          <div className="hs-row">
            <div className="hs-row-text">
              <span className="hs-row-label">Warm-up time</span>
              <span className="hs-row-desc">Prep time before workout starts</span>
            </div>
          </div>
          <div className="hs-seg-control">
            {WARMUP_OPTIONS.map(val => (
              <button
                key={val}
                className={`hs-seg-btn${settings.warmUpTime === val ? ' active' : ''}`}
                onClick={() => updateSetting('warmUpTime', val)}
              >
                {val}s
              </button>
            ))}
          </div>

          <div className="hs-divider" />

          <div className="hs-row">
            <div className="hs-row-text">
              <span className="hs-row-label">Countdown length</span>
              <span className="hs-row-desc">Seconds before each phase starts</span>
            </div>
          </div>
          <div className="hs-seg-control">
            {COUNTDOWN_OPTIONS.map(val => (
              <button
                key={val}
                className={`hs-seg-btn${(settings.countdownLength || 3) === val ? ' active' : ''}`}
                onClick={() => updateSetting('countdownLength', val)}
              >
                {val}s
              </button>
            ))}
          </div>

          <div className="hs-divider" />

          <div className="hs-row">
            <div className="hs-row-text">
              <span className="hs-row-label">Pause when leaving app</span>
              <span className="hs-row-desc">Auto-pause timer in background</span>
            </div>
            <label className="hs-switch">
              <input
                type="checkbox"
                checked={settings.pauseOnLeave}
                onChange={(e) => updateSetting('pauseOnLeave', e.target.checked)}
              />
              <span className="hs-switch-track" />
            </label>
          </div>

          <div className="hs-divider" />

          <div className="hs-row">
            <div className="hs-row-text">
              <span className="hs-row-label">Keep screen on</span>
              <span className="hs-row-desc">Prevent screen from sleeping during workout</span>
            </div>
            <label className="hs-switch">
              <input
                type="checkbox"
                checked={settings.screenWakeLock ?? true}
                onChange={(e) => updateSetting('screenWakeLock', e.target.checked)}
              />
              <span className="hs-switch-track" />
            </label>
          </div>
        </div>

        {/* ====== AUDIO ====== */}
        <div className="hs-section">
          <h2 className="hs-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            Audio
          </h2>

          <div className="hs-row">
            <div className="hs-row-text">
              <span className="hs-row-label">Audio guide</span>
              <span className="hs-row-desc">Voice uses text-to-speech for phase cues</span>
            </div>
          </div>
          <div className="hs-seg-control">
            {AUDIO_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`hs-seg-btn${settings.audioGuide === opt.value ? ' active' : ''}`}
                onClick={() => updateSetting('audioGuide', opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="hs-divider" />

          <div className="hs-row">
            <div className="hs-row-text">
              <span className="hs-row-label">Volume</span>
            </div>
            <span className="hs-value">{settings.audioVolume}%</span>
          </div>
          <input
            type="range"
            className="hs-slider"
            min="0"
            max="100"
            step="1"
            value={settings.audioVolume}
            onChange={(e) => updateSetting('audioVolume', Number(e.target.value))}
            style={{ '--val': `${settings.audioVolume}%` }}
          />

          <div className="hs-divider" />

          <div className="hs-row">
            <div className="hs-row-text">
              <span className="hs-row-label">Override background music</span>
              <span className="hs-row-desc">Play workout sounds over other audio</span>
            </div>
            <label className="hs-switch">
              <input
                type="checkbox"
                checked={settings.loudOverMusic}
                onChange={(e) => updateSetting('loudOverMusic', e.target.checked)}
              />
              <span className="hs-switch-track" />
            </label>
          </div>

          <div className="hs-divider" />

          <div className="hs-row">
            <div className="hs-row-text">
              <span className="hs-row-label">Vibration</span>
              <span className="hs-row-desc">Haptic feedback on phase transitions</span>
            </div>
            <label className="hs-switch">
              <input
                type="checkbox"
                checked={settings.vibration}
                onChange={(e) => updateSetting('vibration', e.target.checked)}
              />
              <span className="hs-switch-track" />
            </label>
          </div>

          <div className="hs-divider" />

          <div className="hs-row">
            <div className="hs-row-text">
              <span className="hs-row-label">Announce exercise</span>
              <span className="hs-row-desc">Speak exercise number at start</span>
            </div>
            <label className="hs-switch">
              <input
                type="checkbox"
                checked={settings.speakExerciseName}
                onChange={(e) => updateSetting('speakExerciseName', e.target.checked)}
              />
              <span className="hs-switch-track" />
            </label>
          </div>
        </div>

        {/* ====== NOTIFICATIONS ====== */}
        <div className="hs-section">
          <h2 className="hs-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Notifications
          </h2>

          <div className="hs-row">
            <div className="hs-row-text">
              <span className="hs-row-label">Daily reminders</span>
              <span className="hs-row-desc">Remind at the same time as your last workout</span>
            </div>
            <label className="hs-switch">
              <input
                type="checkbox"
                checked={settings.dailyReminders}
                onChange={(e) => updateSetting('dailyReminders', e.target.checked)}
              />
              <span className="hs-switch-track" />
            </label>
          </div>

          <div className="hs-divider" />

          <div className="hs-row">
            <div className="hs-row-text">
              <span className="hs-row-label">Scheduled reminders</span>
              <span className="hs-row-desc">Choose specific days and time</span>
            </div>
          </div>
          <div className="hs-day-picker">
            {DAYS.map((day) => (
              <button
                key={day}
                className={`hs-day-btn${(settings.scheduledDays || []).includes(day) ? ' active' : ''}`}
                onClick={() => toggleDay(day)}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="hs-time-row">
            <span className="hs-row-label">Time</span>
            <input
              type="time"
              className="hs-time-input"
              value={settings.scheduledTime || '16:00'}
              onChange={(e) => updateSetting('scheduledTime', e.target.value)}
            />
          </div>
        </div>

        {/* ====== SUPPORT ====== */}
        <div className="hs-section">
          <h2 className="hs-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Support
          </h2>

          <button type="button" className="hs-link-row" onClick={() => openExternal('https://www.mindcorefitness.com/faq.html#core-hiit')}>
            <div className="hs-row-text">
              <span className="hs-row-label">Help & FAQs</span>
            </div>
            <ChevronIcon />
          </button>

          <div className="hs-divider" />

          <button type="button" className="hs-link-row" onClick={() => openExternal('mailto:ross@mindcorefitness.com?subject=Core%20HIIT%20Support')}>
            <div className="hs-row-text">
              <span className="hs-row-label">Contact Support</span>
              <span className="hs-row-desc">ross@mindcorefitness.com</span>
            </div>
            <ExternalIcon />
          </button>
        </div>

        {/* ====== LEGAL ====== */}
        <div className="hs-section">
          <h2 className="hs-section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Legal
          </h2>

          <button type="button" className="hs-link-row" onClick={() => openExternal('https://www.mindcorefitness.com/privacy-policy.html')}>
            <div className="hs-row-text">
              <span className="hs-row-label">Privacy Policy</span>
            </div>
            <ExternalIcon />
          </button>

          <div className="hs-divider" />

          <button type="button" className="hs-link-row" onClick={() => openExternal('https://www.mindcorefitness.com/terms.html')}>
            <div className="hs-row-text">
              <span className="hs-row-label">Terms of Service</span>
            </div>
            <ExternalIcon />
          </button>
        </div>

        {/* ====== ABOUT ====== */}
        <div className="hs-section hs-about">
          <img src="/Logo.PNG" alt="Core HIIT" className="hs-about-logo" />
          <span className="hs-about-name">Core HIIT</span>
          <span className="hs-about-tagline">Train. Rest. Repeat.</span>
          <span className="hs-about-version">Version 1.0.0</span>
        </div>

      </div>
    </div>
  );
}
