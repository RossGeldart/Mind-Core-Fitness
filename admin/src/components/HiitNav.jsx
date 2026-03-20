import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useHiit } from '../contexts/HiitContext';
import '../styles/hiit-themes.css';
import './HiitNav.css';

const NAV_ITEMS = [
  { path: '/hiit', label: 'Timer', icon: 'timer' },
  { path: '/hiit/library', label: 'Library', icon: 'library' },
  { path: '/hiit/settings', label: 'Settings', icon: 'settings' },
  { path: '/hiit/stats', label: 'Stats', icon: 'statistics' },
  { path: '/hiit/premium', label: 'Premium', icon: 'premium' },
];

const icons = {
  timer: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3L2 6"/><path d="M22 6l-3-3"/><path d="M12 2v2"/>
    </svg>
  ),
  library: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  ),
  settings: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  ),
  statistics: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6"/>
    </svg>
  ),
  premium: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/>
    </svg>
  ),
};

const THEMES = [
  { key: 'red', label: 'Red', color: '#B8313D' },
  { key: 'dark', label: 'Dark', color: '#1a1a1f' },
  { key: 'light', label: 'Light', color: '#f5f5f5' },
];

export default function HiitNav({ title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { hiitTheme, setHiitTheme } = useHiit();

  const handleNav = (path) => {
    navigate(path);
    setSidebarOpen(false);
  };

  return (
    <>
      <header className="hiit-header">
        <button className="hiit-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <h1 className="hiit-header-title">{title}</h1>
      </header>

      {/* Sidebar overlay */}
      <div className={`hiit-sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <nav className={`hiit-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="hiit-sidebar-header">
          <h2>Core HIIT</h2>
          <button className="hiit-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <ul className="hiit-sidebar-list">
          {NAV_ITEMS.map(item => (
            <li key={item.path}>
              <button
                className={`hiit-sidebar-item${pathname === item.path ? ' active' : ''}`}
                onClick={() => handleNav(item.path)}
              >
                {icons[item.icon]}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* Theme picker */}
        <div className="hiit-theme-picker">
          <span className="hiit-theme-label">Theme</span>
          <div className="hiit-theme-options">
            {THEMES.map(t => (
              <button
                key={t.key}
                className={`hiit-theme-btn${hiitTheme === t.key ? ' active' : ''}`}
                onClick={() => setHiitTheme(t.key)}
                aria-label={t.label}
              >
                <span
                  className="hiit-theme-swatch"
                  style={{
                    background: t.color,
                    border: t.key === 'light' ? '2px solid #ddd' : t.key === 'dark' ? '2px solid #444' : '2px solid rgba(255,255,255,0.4)',
                  }}
                />
                <span className="hiit-theme-name">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="hiit-sidebar-footer">
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="hiit-sidebar-logo" />
          <div className="hiit-sidebar-brand">Core HIIT</div>
          <div className="hiit-sidebar-sub">Mind Core Fitness</div>
        </div>
      </nav>
    </>
  );
}
