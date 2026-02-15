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
  const { signup, currentUser, isClient, clientData, loading: authLoading } = useAuth();
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
