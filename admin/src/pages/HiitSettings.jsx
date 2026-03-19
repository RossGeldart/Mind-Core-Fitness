import { useHiit } from '../contexts/HiitContext';
import HiitNav from '../components/HiitNav';
import './HiitSettings.css';

const WARMUP_OPTIONS = [0, 10, 30, 60];
const AUDIO_OPTIONS = ['en', 'beeps', 'muted'];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export default function HiitSettings() {
  const { settings, updateSetting } = useHiit();

  const toggleDay = (day) => {
    const days = settings.scheduledDays || [];
    if (days.includes(day)) {
      updateSetting('scheduledDays', days.filter(d => d !== day));
    } else {
      updateSetting('scheduledDays', [...days, day]);
    }
  };

  return (
    <div className="hiit-page">
      <HiitNav title="Settings" />
      <div className="hiit-settings-content">
        {/* Warm-up time */}
        <div className="hiit-settings-section">
          <h3 className="hiit-settings-label">Warm-up time</h3>
          <div className="hiit-seg-control">
            {WARMUP_OPTIONS.map(val => (
              <button
                key={val}
                className={`hiit-seg-btn${settings.warmUpTime === val ? ' active' : ''}`}
                onClick={() => updateSetting('warmUpTime', val)}
              >
                {val}s
              </button>
            ))}
          </div>
        </div>

        {/* Audio guide */}
        <div className="hiit-settings-section">
          <h3 className="hiit-settings-label">Workout audio guide</h3>
          <div className="hiit-seg-control">
            {AUDIO_OPTIONS.map(val => (
              <button
                key={val}
                className={`hiit-seg-btn${settings.audioGuide === val ? ' active' : ''}`}
                onClick={() => updateSetting('audioGuide', val)}
              >
                {val === 'en' ? 'EN' : val.charAt(0).toUpperCase() + val.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Volume slider */}
        <div className="hiit-settings-section">
          <div className="hiit-settings-row">
            <h3 className="hiit-settings-label">Audio guide Volume</h3>
            <span className="hiit-settings-value">{settings.audioVolume}%</span>
          </div>
          <input
            type="range"
            className="hiit-slider"
            min="0"
            max="100"
            step="1"
            value={settings.audioVolume}
            onChange={(e) => updateSetting('audioVolume', Number(e.target.value))}
          />
        </div>

        {/* Daily reminders */}
        <div className="hiit-settings-section">
          <div className="hiit-toggle-row">
            <div>
              <h3 className="hiit-settings-label">Daily workout reminders</h3>
              <p className="hiit-settings-hint">At the same time of day as your last workout</p>
            </div>
            <label className="hiit-switch">
              <input
                type="checkbox"
                checked={settings.dailyReminders}
                onChange={(e) => updateSetting('dailyReminders', e.target.checked)}
              />
              <span className="hiit-switch-slider" />
            </label>
          </div>
        </div>

        {/* Scheduled reminders */}
        <div className="hiit-settings-section">
          <h3 className="hiit-settings-label">Scheduled workout reminders</h3>
          <div className="hiit-day-picker">
            {DAYS.map((day) => (
              <button
                key={day}
                className={`hiit-day-btn${(settings.scheduledDays || []).includes(day) ? ' active' : ''}`}
                onClick={() => toggleDay(day)}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="hiit-time-row">
            <span>Time</span>
            <input
              type="time"
              className="hiit-time-input"
              value={settings.scheduledTime || '16:00'}
              onChange={(e) => updateSetting('scheduledTime', e.target.value)}
            />
          </div>
        </div>

        {/* Toggle settings */}
        <div className="hiit-settings-section">
          <div className="hiit-toggle-row">
            <h3 className="hiit-settings-label">Pause workout when I leave the app</h3>
            <label className="hiit-switch">
              <input
                type="checkbox"
                checked={settings.pauseOnLeave}
                onChange={(e) => updateSetting('pauseOnLeave', e.target.checked)}
              />
              <span className="hiit-switch-slider" />
            </label>
          </div>
        </div>

        <div className="hiit-settings-section">
          <div className="hiit-toggle-row">
            <h3 className="hiit-settings-label">Play workout sounds louder than my background music</h3>
            <label className="hiit-switch">
              <input
                type="checkbox"
                checked={settings.loudOverMusic}
                onChange={(e) => updateSetting('loudOverMusic', e.target.checked)}
              />
              <span className="hiit-switch-slider" />
            </label>
          </div>
        </div>

        <div className="hiit-settings-section">
          <div className="hiit-toggle-row">
            <h3 className="hiit-settings-label">Vibration</h3>
            <label className="hiit-switch">
              <input
                type="checkbox"
                checked={settings.vibration}
                onChange={(e) => updateSetting('vibration', e.target.checked)}
              />
              <span className="hiit-switch-slider" />
            </label>
          </div>
        </div>

        <div className="hiit-settings-section">
          <div className="hiit-toggle-row">
            <h3 className="hiit-settings-label">Speak name of exercise</h3>
            <label className="hiit-switch">
              <input
                type="checkbox"
                checked={settings.speakExerciseName}
                onChange={(e) => updateSetting('speakExerciseName', e.target.checked)}
              />
              <span className="hiit-switch-slider" />
            </label>
          </div>
        </div>

        {/* Links */}
        <div className="hiit-settings-links">
          <button className="hiit-link-row">
            <span>Help & FAQs</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button className="hiit-link-row">
            <span>Contact Support</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button className="hiit-link-row">
            <span>Manage Subscription</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button className="hiit-link-row">
            <span>Privacy Policy</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button className="hiit-link-row">
            <span>Terms of Service</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
