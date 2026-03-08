import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import './NutritionHub.css';

const BETA_EMAILS = ['testy@test123.com'];

export default function NutritionHub() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  const isBetaUser = BETA_EMAILS.includes(currentUser?.email?.toLowerCase());

  if (authLoading) {
    return (
      <div className="nut-hub-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          </div>
        </header>
        <div className="nut-hub-loading"><div className="cb-loading-spinner" /></div>
      </div>
    );
  }

  return (
    <div className="nut-hub-page">
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          <div className="header-actions">
            <button onClick={toggleTheme} aria-label="Toggle theme">
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="nut-hub-main">
        <div className="nut-hub-heading">
          <h2>Nutrition</h2>
          <p>Choose how to track your meals</p>
        </div>

        <div className="nut-hub-cards">
          {/* Card 1: Manual Logger */}
          <button className="nut-hub-card" onClick={() => navigate('/client/core-buddy/nutrition/manual')}>
            <div className="nut-hub-card-icon nut-hub-card-icon--manual">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            <div className="nut-hub-card-body">
              <h3>Manual Log</h3>
              <p>Search foods, scan barcodes and manually log your meals throughout the day</p>
            </div>
            <svg className="nut-hub-card-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* Card 2: AI Food Scanner */}
          <div className={`nut-hub-card nut-hub-card--ai${!isBetaUser ? ' nut-hub-card--locked' : ''}`}
            onClick={() => {
              if (isBetaUser) navigate('/client/core-buddy/nutrition/ai-scanner');
            }}
            role={isBetaUser ? 'button' : undefined}
            tabIndex={isBetaUser ? 0 : undefined}
          >
            <div className="nut-hub-card-icon nut-hub-card-icon--ai">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            <div className="nut-hub-card-body">
              <div className="nut-hub-card-title-row">
                <h3>AI Food Scanner</h3>
                <span className="nut-hub-badge nut-hub-badge--beta">BETA</span>
              </div>
              <p>Upload photos of your meals and let AI analyse your macros automatically</p>
              {!isBetaUser && (
                <span className="nut-hub-coming-soon">Coming Soon</span>
              )}
              {isBetaUser && (
                <span className="nut-hub-beta-access">You have early access</span>
              )}
            </div>
            {isBetaUser && (
              <svg className="nut-hub-card-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            )}
            {!isBetaUser && (
              <svg className="nut-hub-card-lock" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            )}
          </div>
        </div>
      </main>

      <CoreBuddyNav active="nutrition" />
    </div>
  );
}
