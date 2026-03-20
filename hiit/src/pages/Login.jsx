import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { login, signup, loginWithGoogle, loginWithApple, resetPassword } = useAuth();

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

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Failed to log in');
      setLoading(false);
    }
  };

  const handleEmailSignup = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      return setError('Password must be at least 6 characters');
    }
    if (password !== confirmPassword) {
      return setError('Passwords do not match');
    }
    setLoading(true);
    try {
      await signup(email, password);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists');
      } else {
        setError(err.message || 'Failed to create account');
      }
      setLoading(false);
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

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setShowEmail(false);
    setResetMode(false);
    setResetSent(false);
  };

  return (
    <div className="hiit-login">
      <div className="hiit-login-brand">
        <img src="/Logo.webp" alt="Mind Core Fitness" className="hiit-login-logo" />
        <h1 className="hiit-login-title">Core HIIT</h1>
        <p className="hiit-login-subtitle">
          {mode === 'login' ? 'High intensity interval training' : 'Create your free account'}
        </p>
      </div>

      {error && <div className="hiit-login-error">{error}</div>}

      {resetSent ? (
        <div className="hiit-login-reset-sent">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
            <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p>Reset email sent!</p>
          <span>Check your inbox for a password reset link</span>
          <button className="hiit-login-btn hiit-login-btn-primary" onClick={() => { setResetMode(false); setResetSent(false); setShowEmail(false); setError(''); }}>
            Back to Sign In
          </button>
        </div>
      ) : resetMode ? (
        <div className="hiit-login-actions">
          <form onSubmit={handleResetPassword}>
            <div className="hiit-login-field">
              <label htmlFor="reset-email">Email</label>
              <input type="email" id="reset-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" required />
            </div>
            <button type="submit" className="hiit-login-btn hiit-login-btn-primary" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
          <button className="hiit-login-link" onClick={() => { setResetMode(false); setError(''); }}>
            Back to Sign In
          </button>
        </div>
      ) : (
        <div className="hiit-login-actions">
          {/* Apple Sign-In */}
          <button className="hiit-login-btn hiit-login-btn-apple" onClick={handleAppleSignIn} disabled={appleLoading}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            {appleLoading ? 'Signing in...' : mode === 'signup' ? 'Sign up with Apple' : 'Sign in with Apple'}
          </button>

          {/* Google Sign-In */}
          <button className="hiit-login-btn hiit-login-btn-google" onClick={handleGoogleSignIn} disabled={googleLoading}>
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.96 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {googleLoading ? 'Signing in...' : mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
          </button>

          <div className="hiit-login-divider"><span>or</span></div>

          {/* Email — expandable */}
          {!showEmail ? (
            <button className="hiit-login-btn hiit-login-btn-email" onClick={() => setShowEmail(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="M22 7l-10 7L2 7"/>
              </svg>
              {mode === 'signup' ? 'Sign up with Email' : 'Sign in with Email'}
            </button>
          ) : mode === 'signup' ? (
            <form onSubmit={handleEmailSignup} className="hiit-login-email-form">
              <div className="hiit-login-field">
                <label htmlFor="signup-email">Email</label>
                <input type="email" id="signup-email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className="hiit-login-field">
                <label htmlFor="signup-password">Password</label>
                <input type="password" id="signup-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
              </div>
              <div className="hiit-login-field">
                <label htmlFor="confirm-password">Confirm Password</label>
                <input type="password" id="confirm-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
              </div>
              <button type="submit" className="hiit-login-btn hiit-login-btn-primary" disabled={loading}>
                {loading ? 'Creating Account...' : 'Create Free Account'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleEmailLogin} className="hiit-login-email-form">
              <div className="hiit-login-field">
                <label htmlFor="email">Email</label>
                <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className="hiit-login-field">
                <label htmlFor="password">Password</label>
                <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
              <button type="submit" className="hiit-login-btn hiit-login-btn-primary" disabled={loading}>
                {loading ? 'Logging in...' : 'Log In'}
              </button>
              <button type="button" className="hiit-login-link" onClick={() => { setResetMode(true); setError(''); }}>
                Forgot password?
              </button>
            </form>
          )}

          {/* Mode toggle */}
          <div className="hiit-login-mode-toggle">
            {mode === 'login' ? (
              <button className="hiit-login-link" onClick={() => switchMode('signup')}>
                Don&apos;t have an account? <strong>Sign Up</strong>
              </button>
            ) : (
              <button className="hiit-login-link" onClick={() => switchMode('login')}>
                Already have an account? <strong>Log In</strong>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
