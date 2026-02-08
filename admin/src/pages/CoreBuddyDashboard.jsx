import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CoreBuddyDashboard.css';

export default function CoreBuddyDashboard() {
  const { currentUser, isClient, clientData, logout, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // 24hr countdown state
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [ticksElapsed, setTicksElapsed] = useState(0);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate('/');
    }
  }, [authLoading, currentUser, navigate]);

  // 24hr countdown - time remaining in the day
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const diff = endOfDay - now;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds });

      // Calculate ticks elapsed out of 60 based on seconds
      setTicksElapsed(60 - seconds);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Ripple effect
  const createRipple = (event) => {
    const button = event.currentTarget;
    const existingRipple = button.querySelector('.ripple');
    if (existingRipple) existingRipple.remove();
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  };

  const firstName = clientData?.name?.split(' ')[0] || 'there';

  if (authLoading) {
    return (
      <div className="cb-loading">
        <div className="cb-loading-spinner" />
      </div>
    );
  }

  return (
    <div className="cb-dashboard" data-theme={isDark ? 'dark' : 'light'}>
      {/* Header */}
      <header className="cb-header">
        <div className="cb-header-left">
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="cb-header-logo" />
          <span className="cb-header-title">Core Buddy</span>
        </div>
        <div className="cb-header-right">
          <button className="cb-theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {isDark ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
          <button className="cb-logout" onClick={logout} aria-label="Log out">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </header>

      <main className="cb-main">
        {/* Greeting */}
        <div className="cb-greeting">
          <h2>Hey {firstName}</h2>
        </div>

        {/* 24hr Countdown Ring */}
        <div className="cb-ring-container">
          <div className="cb-ring">
            <svg className="cb-ring-svg" viewBox="0 0 200 200">
              {[...Array(60)].map((_, i) => {
                const angle = (i * 6 - 90) * (Math.PI / 180);
                const innerRadius = 85;
                const outerRadius = 96;
                const x1 = 100 + innerRadius * Math.cos(angle);
                const y1 = 100 + innerRadius * Math.sin(angle);
                const x2 = 100 + outerRadius * Math.cos(angle);
                const y2 = 100 + outerRadius * Math.sin(angle);
                const isElapsed = i < ticksElapsed;

                return (
                  <line
                    key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    className={`ring-tick ${isElapsed ? 'elapsed' : 'remaining'}`}
                    strokeWidth={i % 5 === 0 ? '3' : '2'}
                  />
                );
              })}
            </svg>
            <div className="cb-ring-center">
              <div className="cb-ring-logo">
                <img src="/Logo.PNG" alt="Mind Core Fitness" />
              </div>
              <div className="cb-ring-countdown">
                <span className="cb-timer-digit">{String(timeLeft.hours).padStart(2, '0')}</span>
                <span className="cb-timer-colon">:</span>
                <span className="cb-timer-digit">{String(timeLeft.minutes).padStart(2, '0')}</span>
                <span className="cb-timer-colon">:</span>
                <span className="cb-timer-digit cb-timer-seconds">{String(timeLeft.seconds).padStart(2, '0')}</span>
              </div>
              <div className="cb-ring-label">remaining today</div>
            </div>
          </div>
          <p className="cb-ring-tagline">You have 24 hours a day... <strong>make it count</strong> with Core Buddy</p>
        </div>

        {/* Feature Cards */}
        <div className="cb-features">

          {/* 1. Nutrition / Macros */}
          <button
            className="cb-feature-card cb-card-nutrition cb-card-has-preview ripple-btn"
            onClick={(e) => { createRipple(e); showToast('Nutrition tracking coming soon!', 'info'); }}
          >
            <div className="cb-card-top-row">
              <div className="cb-card-icon cb-icon-nutrition">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
                </svg>
              </div>
              <div className="cb-card-content">
                <h3>Today's Nutrition</h3>
              </div>
              <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
            <div className="cb-card-preview-row">
              <div className="cb-mini-rings">
                <div className="cb-mini-ring cb-ring-protein">
                  <svg viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.15" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="94.25" strokeDashoffset="70" strokeLinecap="round" transform="rotate(-90 18 18)" />
                  </svg>
                  <span>P</span>
                </div>
                <div className="cb-mini-ring cb-ring-carbs">
                  <svg viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.15" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="94.25" strokeDashoffset="50" strokeLinecap="round" transform="rotate(-90 18 18)" />
                  </svg>
                  <span>C</span>
                </div>
                <div className="cb-mini-ring cb-ring-fats">
                  <svg viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.15" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="94.25" strokeDashoffset="40" strokeLinecap="round" transform="rotate(-90 18 18)" />
                  </svg>
                  <span>F</span>
                </div>
                <div className="cb-mini-ring cb-ring-cals">
                  <svg viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.15" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="94.25" strokeDashoffset="60" strokeLinecap="round" transform="rotate(-90 18 18)" />
                  </svg>
                  <span>Cal</span>
                </div>
              </div>
            </div>
            <p className="cb-card-desc">Track macros, scan barcodes, log water</p>
          </button>

          {/* 2. Workouts */}
          <button
            className="cb-feature-card cb-card-workouts ripple-btn"
            onClick={(e) => { createRipple(e); showToast('Workouts coming soon!', 'info'); }}
          >
            <div className="cb-card-icon cb-icon-workouts">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 6.5L17.5 17.5"/><path d="M3 10V7a1 1 0 0 1 1-1h3"/><path d="M14 3h3a1 1 0 0 1 1 1v3"/><path d="M21 14v3a1 1 0 0 1-1 1h-3"/><path d="M10 21H7a1 1 0 0 1-1-1v-3"/>
              </svg>
            </div>
            <div className="cb-card-content">
              <h3>Workouts</h3>
              <p>Randomise or build your own session</p>
            </div>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* 3. Progress / PBs */}
          <button
            className="cb-feature-card cb-card-progress ripple-btn"
            onClick={(e) => { createRipple(e); navigate('/client/personal-bests'); }}
          >
            <div className="cb-card-icon cb-icon-progress">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <div className="cb-card-content">
              <h3>My Progress</h3>
              <p>Track personal bests and body metrics</p>
            </div>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* 4. Consistency */}
          <button
            className="cb-feature-card cb-card-consistency cb-card-has-preview ripple-btn"
            onClick={(e) => { createRipple(e); showToast('Consistency tracking coming soon!', 'info'); }}
          >
            <div className="cb-card-top-row">
              <div className="cb-card-icon cb-icon-consistency">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/>
                </svg>
              </div>
              <div className="cb-card-content">
                <h3>Consistency</h3>
              </div>
              <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
            <div className="cb-card-preview-row">
              <div className="cb-week-dots">
                {['M','T','W','T','F','S','S'].map((day, i) => (
                  <div key={i} className={`cb-week-dot ${i < 3 ? 'active' : ''}`}>
                    <span>{day}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="cb-card-desc">Weekly streaks and habit tracking</p>
          </button>

          {/* 5. Leaderboard */}
          <button
            className="cb-feature-card cb-card-leaderboard cb-card-locked ripple-btn"
            onClick={(e) => { createRipple(e); showToast('Leaderboard coming soon!', 'info'); }}
          >
            <div className="cb-card-icon cb-icon-leaderboard">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10l-1 9H8L7 4z"/><path d="M17 4c0 0 2 0 2 2s-2 4-2 4"/><path d="M7 4c0 0-2 0-2 2s2 4 2 4"/>
              </svg>
            </div>
            <div className="cb-card-content">
              <h3>Leaderboard</h3>
              <p>Compete with your Core Buddies</p>
            </div>
            <span className="cb-coming-soon">Coming Soon</span>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.type === 'info' && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
