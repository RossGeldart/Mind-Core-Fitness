import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && currentUser) {
      if (isAdmin) {
        navigate('/dashboard');
      } else if (isClient) {
        // Redirect to onboarding if not completed (self-signup only)
        if (clientData?.signupSource === 'self_signup' && !clientData?.onboardingComplete) {
          navigate('/onboarding');
          return;
        }
        const type = clientData?.clientType;
        if (type === 'core_buddy') {
          navigate('/client/core-buddy');
        } else if (type === 'circuit_vip' || type === 'circuit_dropin') {
          navigate('/client/circuit');
        } else {
          navigate('/client');
        }
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
      <div className="login-card">
        <div className="login-header">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="login-logo" />
          <p>{resetMode ? 'Reset Password' : 'Client Portal'}</p>
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
