import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './HiitNav.css';

const NAV_ITEMS = [
  { path: '/client/core-buddy/hiit', label: 'Timer', icon: 'timer' },
  { path: '/client/core-buddy/hiit/history', label: 'History', icon: 'history' },
  { path: '/client/core-buddy/hiit/settings', label: 'Settings', icon: 'settings' },
  { path: '/client/core-buddy/hiit/statistics', label: 'Statistics', icon: 'statistics' },
];

const icons = {
  timer: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3L2 6"/><path d="M22 6l-3-3"/><path d="M12 2v2"/>
    </svg>
  ),
  history: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>
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
};

export default function HiitNav({ title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

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
        <div className="hiit-sidebar-footer">
          <button className="hiit-sidebar-item" onClick={() => navigate('/client/core-buddy')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            <span>Back to Core Buddy</span>
          </button>
        </div>
      </nav>
    </>
  );
}
