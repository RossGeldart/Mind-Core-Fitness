import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import getClientHomePath from '../utils/getClientHomePath';
import ThemeToggle from '../components/ThemeToggle';
import './Login.css';
import './NativeLogin.css';

const PORTAL_OPTIONS = [
  {
    type: 'block',
    label: '1-2-1 Training',
    description: 'View sessions & your schedule',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 6.5h11M6.5 17.5h11M4 9.5v5M20 9.5v5M2 11v2M22 11v2"/>
      </svg>
    ),
  },
  {
    type: 'circuit',
    label: 'Circuit Training',
    description: 'Book & manage circuit sessions',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
  },
  {
    type: 'core_buddy',
    label: 'Core Buddy',
    description: 'Workouts, nutrition & habits',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    ),
  },
];

export default function LoginPortal() {
  const navigate = useNavigate();
  const { currentUser, isAdmin, isClient, clientData, loading: authLoading } = useAuth();
  const [splashReady, setSplashReady] = useState(false);
  const [splashFading, setSplashFading] = useState(false);

  // On native (App Store), skip the portal — only Core Buddy is available
  const isNative = Capacitor.isNativePlatform();
  useEffect(() => {
    if (isNative) {
      navigate('/login?type=core_buddy', { replace: true });
    }
  }, [isNative, navigate]);

  // When auth resolves for a returning user, hold the welcome splash then fade out
  useEffect(() => {
    if (!authLoading && currentUser && (isAdmin || isClient)) {
      // Text finishes at 2.8s + 2.5s hold = 5.3s, then fade out over 0.6s
      const holdTimer = setTimeout(() => setSplashFading(true), 5300);
      const navTimer = setTimeout(() => setSplashReady(true), 5900);
      return () => { clearTimeout(holdTimer); clearTimeout(navTimer); };
    }
  }, [authLoading, currentUser, isAdmin, isClient]);

  // If already logged in, wait for splash then redirect
  useEffect(() => {
    if (!authLoading && currentUser) {
      if (!splashReady && (isAdmin || isClient)) return;
      if (isAdmin) {
        navigate('/dashboard', { replace: true });
      } else if (isClient) {
        navigate(getClientHomePath(clientData), { replace: true });
      }
    }
  }, [authLoading, currentUser, isAdmin, isClient, clientData, navigate, splashReady]);

  // Show branded welcome splash while checking auth / holding for returning users
  if (isNative || authLoading || (currentUser && (isAdmin || isClient))) {
    const displayName = clientData?.name || currentUser?.displayName;
    return (
      <div className={`native-login-splash${splashFading ? ' native-login-splash-fadeout' : ''}`}>
        <div className="native-login-splash-inner">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="native-login-splash-logo" />
          <h1 className="native-login-splash-name">{displayName ? `Welcome back, ${displayName.split(' ')[0]}` : '\u00A0'}</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <ThemeToggle className="login-theme-toggle" />
      <div className="portal-card">
        <div className="login-header">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="login-logo" />
          <p><strong>Welcome back</strong></p>
          <p className="portal-subtitle">Select how you're logging in</p>
        </div>

        <div className="portal-grid">
          {PORTAL_OPTIONS.map(({ type, label, description, icon }) => (
            <button
              key={type}
              className="portal-option"
              onClick={() => navigate(`/login?type=${type}`)}
            >
              <div className="portal-option-icon">{icon}</div>
              <div className="portal-option-label">{label}</div>
              <div className="portal-option-desc">{description}</div>
            </button>
          ))}
        </div>

        <a href="/" className="back-link">Back to website</a>
      </div>
    </div>
  );
}
