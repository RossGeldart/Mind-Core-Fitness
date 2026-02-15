import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/TierContext';
import { useTheme } from '../contexts/ThemeContext';
import { STRIPE_PRICES } from '../config/stripe';
import './UpgradePage.css';

export default function UpgradePage() {
  const { currentUser, clientData } = useAuth();
  const { isPremium, subscriptionStatus } = useTier();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);

  async function handleManageSubscription() {
    if (!clientData?.stripeCustomerId) return;
    setLoading('manage');
    setError(null);
    try {
      const headers = { 'Content-Type': 'application/json' };
      // Pass Firebase ID token so the API can verify ownership
      if (currentUser) {
        const token = await currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          stripeCustomerId: clientData.stripeCustomerId,
          clientId: clientData.id,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch (err) {
      console.error('Portal error:', err);
      setError('Unable to open subscription portal');
    } finally {
      setLoading(null);
    }
  }

  async function handleSelectPlan(plan) {
    setLoading(plan);
    setError(null);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: STRIPE_PRICES[plan],
          clientId: clientData?.id,
          uid: currentUser?.uid,
          email: currentUser?.email,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Unable to start checkout');
    } finally {
      setLoading(null);
    }
  }

  // Already premium — show manage subscription
  if (isPremium) {
    return (
      <div className="upgrade-page">
        <button className="upgrade-theme-toggle" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {isDark ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
          )}
        </button>
        <button className="upgrade-back-btn" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          Back
        </button>

        <div className="upgrade-header">
          <div className="upgrade-icon upgrade-icon-active">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
          </div>
          <h1>You're on Premium!</h1>
          <p className="upgrade-status">Status: <strong>{subscriptionStatus || 'active'}</strong></p>
        </div>

        {clientData?.stripeCustomerId && (
          <button
            className="upgrade-manage-btn"
            onClick={handleManageSubscription}
            disabled={loading === 'manage'}
          >
            {loading === 'manage' ? 'Opening...' : 'Manage Subscription'}
          </button>
        )}

        {error && <p className="upgrade-error">{error}</p>}
      </div>
    );
  }

  // Free tier — show plan selection
  return (
    <div className="upgrade-page">
      <button className="upgrade-theme-toggle" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {isDark ? (
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 000-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>
        )}
      </button>
      <button className="upgrade-back-btn" onClick={() => navigate(-1)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        Back
      </button>

      <div className="upgrade-header">
        <div className="upgrade-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
        </div>
        <h1>Upgrade to Premium</h1>
        <p>Unlock all Core Buddy features with a 7-day free trial</p>
      </div>

      <div className="upgrade-plans">
        <div className="plan-card">
          <div className="plan-name">Monthly</div>
          <div className="plan-price">
            <span className="plan-amount">£19.99</span>
            <span className="plan-period">/month</span>
          </div>
          <ul className="plan-features">
            <li>7-day free trial</li>
            <li>All premium features</li>
            <li>Cancel anytime</li>
          </ul>
          <button
            className="plan-cta"
            onClick={() => handleSelectPlan('monthly')}
            disabled={!!loading}
          >
            {loading === 'monthly' ? 'Loading...' : 'Start Free Trial'}
          </button>
        </div>

        <div className="plan-card plan-card-featured">
          <div className="plan-badge-save">Best Value — Save 17%</div>
          <div className="plan-name">Annual</div>
          <div className="plan-price">
            <span className="plan-amount">£199.99</span>
            <span className="plan-period">/year</span>
          </div>
          <ul className="plan-features">
            <li>7-day free trial</li>
            <li>All premium features</li>
            <li>Best value</li>
          </ul>
          <button
            className="plan-cta plan-cta-featured"
            onClick={() => handleSelectPlan('annual')}
            disabled={!!loading}
          >
            {loading === 'annual' ? 'Loading...' : 'Start Free Trial'}
          </button>
        </div>
      </div>

      {error && <p className="upgrade-error">{error}</p>}
    </div>
  );
}
