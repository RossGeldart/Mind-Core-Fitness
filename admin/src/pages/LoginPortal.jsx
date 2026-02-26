import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import getClientHomePath from '../utils/getClientHomePath';
import ThemeToggle from '../components/ThemeToggle';
import './Login.css';

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

  // If already logged in, skip the portal and go straight to the dashboard
  useEffect(() => {
    if (!authLoading && currentUser) {
      if (isAdmin) {
        navigate('/dashboard', { replace: true });
      } else if (isClient) {
        navigate(getClientHomePath(clientData), { replace: true });
      }
    }
  }, [authLoading, currentUser, isAdmin, isClient, clientData, navigate]);

  // Show spinner while checking auth state or mid-redirect
  if (authLoading || currentUser) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-body)' }}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--color-primary-light)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'app-spin .7s linear infinite' }} />
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
