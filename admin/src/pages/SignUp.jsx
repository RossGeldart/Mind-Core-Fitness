import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import getClientHomePath from '../utils/getClientHomePath';
import ThemeToggle from '../components/ThemeToggle';
import './Login.css';

export default function SignUp() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && currentUser && isClient) {
      navigate(getClientHomePath(clientData));
    }
  }, [authLoading, currentUser, isClient, clientData, navigate]);

  if (authLoading) return null;

  return (
    <div className="login-container">
      <ThemeToggle className="login-theme-toggle" />
      <div className="login-card">
        <div className="login-header">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="login-logo" />
          <p>Sign Up Coming Soon</p>
        </div>

        <p style={{ textAlign: 'center', opacity: 0.7, margin: '1.5rem 0' }}>
          Account creation is temporarily unavailable. Please check back later.
        </p>

        <button
          type="button"
          className="login-btn"
          onClick={() => navigate('/')}
        >
          Back to Login
        </button>

        <a href="/" className="back-link">Back to website</a>
      </div>
    </div>
  );
}
