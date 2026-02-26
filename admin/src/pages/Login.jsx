import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import getClientHomePath from '../utils/getClientHomePath';
import ThemeToggle from '../components/ThemeToggle';
import './Login.css';

const TYPE_LABELS = {
  admin: 'Admin Login',
  block: '1-2-1 Client Login',
  circuit: 'Circuit Login',
  core_buddy: 'Core Buddy Login',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const { login, loginWithGoogle, loginWithApple, resetPassword, currentUser, isAdmin, isClient, clientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loginType = searchParams.get('type') || '';
  const typeLabel = TYPE_LABELS[loginType] || 'Sign In';
  // Only Core Buddy supports social/self-signup login
  const showSocial = !loginType || loginType === 'core_buddy';

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && currentUser) {
      // Unverified self-signup users must verify before continuing
      if (!currentUser.emailVerified && clientData?.signupSource === 'self_signup') {
        navigate('/signup');
        return;
      }
      if (isAdmin) {
        navigate('/dashboard');
      } else if (isClient) {
        navigate(getClientHomePath(clientData));
      } else {
        // Auth succeeded but no client record found — unstick the form
        setLoading(false);
        setError('No account found. Please sign up or contact your trainer.');
      }
    }
  }, [authLoading, currentUser, isAdmin, isClient, clientData, navigate]);

  // While checking auth state or already logged in, show a loading spinner
  if (authLoading || currentUser) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-body)' }}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--color-primary-light)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'app-spin .7s linear infinite' }} />
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password, rememberMe);
      // Navigation will happen via the useEffect above after auth state updates
    } catch (err) {
      setError(err.message || 'Failed to log in');
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Failed to sign in with Google');
      }
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setError('');
    setAppleLoading(true);
    try {
      await loginWithApple();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Failed to sign in with Apple');
      }
      setAppleLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email');
      } else {
        setError(err.message || 'Failed to send reset email');
      }
    }
    setLoading(false);
  };

  return (
    <div className="login-container">
      <ThemeToggle className="login-theme-toggle" />
      <div className="login-card">
        {!resetMode && (
          <button className="login-back-btn" onClick={() => navigate('/')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
        )}
        <div className="login-header">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="login-logo" />
          <p><strong>{resetMode ? 'Reset Password' : 'Mind Core Fitness'}</strong></p>
          {!resetMode && <span className="login-type-label">{typeLabel}</span>}
        </div>

        {error && <div className="error-message">{error}</div>}

        {resetSent ? (
          <div className="reset-sent">
            <div className="reset-sent-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 2L15 22L11 13L2 9L22 2Z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p>Reset email sent!</p>
            <span>Check your inbox for a password reset link</span>
            <button
              className="login-btn"
              style={{ marginTop: '20px' }}
              onClick={() => { setResetMode(false); setResetSent(false); setError(''); }}
            >
              Back to Log In
            </button>
          </div>
        ) : resetMode ? (
          <form onSubmit={handleResetPassword}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <button
              type="button"
              className="forgot-link"
              onClick={() => { setResetMode(false); setError(''); }}
            >
              Back to Log In
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="remember-me">
                <label>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
              </div>

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Logging in...' : 'Log In'}
              </button>
            </form>

            {showSocial && (
              <>
                <div className="login-divider">
                  <span>or</span>
                </div>

                <button
                  type="button"
                  className="google-btn"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                >
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.96 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  {googleLoading ? 'Signing in...' : 'Continue with Google'}
                </button>

                <button
                  type="button"
                  className="apple-btn"
                  onClick={handleAppleSignIn}
                  disabled={appleLoading}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  {appleLoading ? 'Signing in...' : 'Continue with Apple'}
                </button>
              </>
            )}

            <button
              type="button"
              className="forgot-link"
              onClick={() => { setResetMode(true); setError(''); }}
            >
              Forgot password?
            </button>

            {showSocial && (
              <button
                type="button"
                className="login-btn login-btn-outline"
                onClick={() => navigate('/signup')}
              >
                Don't have an account? Create one free
              </button>
            )}

          </>
        )}

        <a href="/" className="back-link">Back to website</a>
      </div>
    </div>
  );
}
