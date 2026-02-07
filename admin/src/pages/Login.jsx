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
  const { login, currentUser, isAdmin, isClient, clientData, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && currentUser) {
      if (isAdmin) {
        navigate('/dashboard');
      } else if (isClient) {
        const type = clientData?.clientType;
        if (type === 'circuit_vip' || type === 'circuit_dropin') {
          navigate('/client/circuit');
        } else {
          navigate('/client');
        }
      }
    }
  }, [authLoading, currentUser, isAdmin, isClient, clientData, navigate]);

  // Show loading screen while checking auth state
  if (authLoading) {
    return (
      <div className="login-container">
        <div className="login-loading">
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="loading-logo" />
        </div>
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

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="login-logo" />
          <p>Client Portal</p>
        </div>

        {error && <div className="error-message">{error}</div>}

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

        <a href="/" className="back-link">Back to website</a>
      </div>
    </div>
  );
}
