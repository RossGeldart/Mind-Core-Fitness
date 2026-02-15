import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import getClientHomePath from '../utils/getClientHomePath';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { login, resetPassword, currentUser, isAdmin, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && currentUser) {
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

  // While checking auth state, render nothing (avoids logo flash)
  if (authLoading) return null;

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
      <button className="login-theme-toggle" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {isDark ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
        )}
      </button>
      <div className="login-card">
        <div className="login-header">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="login-logo" />
          <p><strong>{resetMode ? 'Reset Password' : 'Sign in as 1-2-1 or a Core Buddy'}</strong></p>
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

            <button
              type="button"
              className="forgot-link"
              onClick={() => { setResetMode(true); setError(''); }}
            >
              Forgot password?
            </button>

          </>
        )}

        <a href="/" className="back-link">Back to website</a>
      </div>
    </div>
  );
}
