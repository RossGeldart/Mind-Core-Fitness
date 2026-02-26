import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import getClientHomePath from '../utils/getClientHomePath';
import ThemeToggle from '../components/ThemeToggle';
import './Login.css';

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const { signup, loginWithGoogle, loginWithApple, currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in and verified
  useEffect(() => {
    if (!authLoading && currentUser && isClient) {
      if (currentUser.emailVerified) {
        navigate(getClientHomePath(clientData));
      } else {
        // They signed up but haven't verified yet — show the verification screen
        setVerificationSent(true);
      }
    }
  }, [authLoading, currentUser, isClient, clientData, navigate]);

  // Poll for email verification so we auto-advance once they verify
  useEffect(() => {
    if (!verificationSent || !currentUser) return;
    const interval = setInterval(async () => {
      try {
        await currentUser.reload();
        if (currentUser.emailVerified) {
          navigate('/onboarding');
        }
      } catch {
        // ignore — user may have navigated away
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [verificationSent, currentUser, navigate]);

  if (authLoading) return null;

  const handleSubmit = async (e) => {
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
      const cred = await signup(name, email, password);
      await sendEmailVerification(cred.user);
      if (typeof fbq === 'function') {
        fbq('track', 'CompleteRegistration', {
          content_name: 'Core Buddy Signup',
          content_category: 'Fitness App',
          status: true
        });
      }
      setVerificationSent(true);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists');
      } else {
        setError(err.message || 'Failed to create account');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!currentUser || resending) return;
    setResending(true);
    setResendMsg('');
    try {
      await sendEmailVerification(currentUser);
      setResendMsg('Verification email sent! Check your inbox.');
    } catch (err) {
      if (err.code === 'auth/too-many-requests') {
        setResendMsg('Too many attempts — please wait a minute and try again.');
      } else {
        setResendMsg('Failed to resend. Please try again.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      if (typeof fbq === 'function') {
        fbq('track', 'CompleteRegistration', {
          content_name: 'Core Buddy Signup - Google',
          content_category: 'Fitness App',
          status: true
        });
      }
      // Google accounts are already verified — go straight to onboarding
      navigate('/onboarding');
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Failed to sign up with Google');
      }
      setGoogleLoading(false);
    }
  };

  const handleAppleSignUp = async () => {
    setError('');
    setAppleLoading(true);
    try {
      await loginWithApple();
      if (typeof fbq === 'function') {
        fbq('track', 'CompleteRegistration', {
          content_name: 'Core Buddy Signup - Apple',
          content_category: 'Fitness App',
          status: true
        });
      }
      // Apple accounts are already verified — go straight to onboarding
      navigate('/onboarding');
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Failed to sign up with Apple');
      }
      setAppleLoading(false);
    }
  };

  // ── Verification screen ──
  if (verificationSent) {
    return (
      <div className="login-container">
        <ThemeToggle className="login-theme-toggle" />
        <div className="login-card">
          <div className="login-header">
            <img src="/Logo.webp" alt="Mind Core Fitness" className="login-logo" />
            <p>Verify Your Email</p>
          </div>

          <p style={{ textAlign: 'center', opacity: 0.8, margin: '1rem 0' }}>
            We've sent a verification link to <strong>{currentUser?.email}</strong>.
            Please check your inbox and click the link to continue.
          </p>

          <p style={{ textAlign: 'center', opacity: 0.5, fontSize: '0.85rem', margin: '0.5rem 0 1.5rem' }}>
            This page will automatically continue once you verify.
          </p>

          {resendMsg && (
            <div className={resendMsg.includes('sent') ? 'success-message' : 'error-message'} style={{ marginBottom: '1rem' }}>
              {resendMsg}
            </div>
          )}

          <button
            type="button"
            className="login-btn"
            onClick={handleResend}
            disabled={resending}
            style={{ marginBottom: '0.5rem' }}
          >
            {resending ? 'Sending...' : 'Resend Verification Email'}
          </button>

          <button
            type="button"
            className="forgot-link"
            onClick={() => navigate('/')}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // ── Sign-up form ──
  return (
    <div className="login-container">
      <ThemeToggle className="login-theme-toggle" />
      <div className="login-card">
        <div className="login-header">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="login-logo" />
          <p>Create Your Free Account</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

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

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Free Account'}
          </button>
        </form>

        <div className="login-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="google-btn"
          onClick={handleGoogleSignUp}
          disabled={googleLoading}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.96 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {googleLoading ? 'Signing up...' : 'Sign up with Google'}
        </button>

        <button
          type="button"
          className="apple-btn"
          onClick={handleAppleSignUp}
          disabled={appleLoading}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          {appleLoading ? 'Signing up...' : 'Sign up with Apple'}
        </button>

        <button
          type="button"
          className="forgot-link"
          onClick={() => navigate('/')}
        >
          Already have an account? Log in
        </button>

        <a href="/" className="back-link">Back to website</a>
      </div>
    </div>
  );
}
